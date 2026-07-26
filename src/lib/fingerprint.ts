/**
 * Contract fingerprinting for Monad PreFlight.
 *
 * Decide WHAT an address is from its bytecode and (for proxies) two
 * well-known storage slots, so the UI can say "this is a token" or
 * "this is a front for another program" instead of showing an opaque
 * address. Pure analysis of bytes we already fetched: one code read
 * plus at most two storage reads, nothing else. When we cannot tell,
 * we say so and let the simulation speak.
 */

import { getAddress } from 'viem';
import type { Address, Hex } from './types';
import { shortAddress } from './format';

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export type ContractKind =
  | 'eoa'
  | 'erc20'
  | 'erc721'
  | 'proxy'
  | 'minimal-proxy'
  | 'multisig-or-wallet'
  | 'unknown-contract';

export interface Fingerprint {
  kind: ContractKind;
  /** Short human name, e.g. "Token". */
  label: string;
  /** 1–3 sentences of plain language a newcomer can follow. */
  detail: string;
  /** Where the real code lives, for the two proxy kinds. */
  implementation?: Address;
  /** 4-byte function selectors found in the bytecode, lowercase "0x…". */
  selectors: string[];
}

/** The three chain reads fingerprinting is allowed to make. */
export interface FingerprintReader {
  getCode(a: Address): Promise<string>;
  getStorageAt(a: Address, slot: Hex): Promise<string>;
  call(a: Address, data: Hex): Promise<string>;
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Never return more than this many selectors from one bytecode blob. */
const MAX_SELECTORS = 200;

// EIP-1967 implementation slot: keccak256("eip1967.proxy.implementation") - 1
const EIP1967_IMPLEMENTATION_SLOT: Hex =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
// Legacy OpenZeppelin slot: keccak256("org.zeppelinos.proxy.implementation")
const LEGACY_IMPLEMENTATION_SLOT: Hex =
  '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';

// EIP-1167 minimal proxy runtime: prefix + 20-byte target + suffix.
const CLONE_PREFIX = '363d3d373d3d3d363d73';
const CLONE_SUFFIX = '5af43d82803e903d91602b57fd5bf3';
// The two known length-prefix headers that sometimes precede the runtime
// (they push the runtime length, 0x2d bytes, and copy it into place).
const CLONE_LENGTH_PREFIXES = ['3d602d80600a3d3981f3', '602d8060093d393df3'];

// Function selectors that mark the standard interfaces we recognise.
const SEL_TRANSFER = '0xa9059cbb'; // transfer(address,uint256)
const SEL_BALANCE_OF = '0x70a08231'; // balanceOf(address)
const SEL_OWNER_OF = '0x6352211e'; // ownerOf(uint256)
const SEL_SAFE_TRANSFER_FROM = '0x42842e0e'; // safeTransferFrom(address,address,uint256)
const SEL_EXEC_TRANSACTION = '0x6a761202'; // execTransaction(...) — Safe
const SEL_IS_VALID_SIGNATURE = '0x1626ba7e'; // isValidSignature(bytes32,bytes)

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Lowercase hex body without the 0x prefix. */
function stripHexPrefix(code: string): string {
  const trimmed = code.trim().toLowerCase();
  return trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
}

/** Checksum an address; on anything unexpected, keep the raw string. */
function toChecksum(addr: string): Address {
  try {
    return getAddress(addr);
  } catch {
    return addr as Address;
  }
}

/* ------------------------------------------------------------------ */
/* Selector detection                                                  */
/* ------------------------------------------------------------------ */

/**
 * Scan bytecode for PUSH4 instructions (opcode 0x63 followed by 4 bytes)
 * and return the unique 4-byte selectors as lowercase "0x…" strings, in
 * order of first appearance. This is how you tell what functions a
 * contract exposes without an ABI: the dispatcher compares the incoming
 * selector against each PUSH4 constant.
 *
 * The scan walks instruction by instruction and skips the inline data
 * of every PUSH, so bytes that merely *look* like a PUSH4 inside some
 * other constant are not misread as one. Capped at 200 selectors.
 */
export function detectSelectors(code: string): string[] {
  const body = stripHexPrefix(code);
  const found: string[] = [];
  const seen = new Set<string>();

  let i = 0;
  while (i + 2 <= body.length && found.length < MAX_SELECTORS) {
    const opcode = Number.parseInt(body.slice(i, i + 2), 16);
    if (Number.isNaN(opcode)) break;

    if (opcode === 0x63) {
      // PUSH4 — the next 4 bytes are a selector (if they are all there).
      if (i + 10 > body.length) break;
      const selectorBody = body.slice(i + 2, i + 10);
      if (!/^[0-9a-f]{8}$/.test(selectorBody)) break;
      const selector = `0x${selectorBody}`;
      if (!seen.has(selector)) {
        seen.add(selector);
        found.push(selector);
      }
      i += 10;
      continue;
    }

    if (opcode >= 0x60 && opcode <= 0x7f) {
      // Some other PUSH1..PUSH32: skip its inline data so constants are
      // never mistaken for code.
      i += 2 + (opcode - 0x5f) * 2;
      continue;
    }

    i += 2;
  }

  return found;
}

/* ------------------------------------------------------------------ */
/* Proxy detection                                                     */
/* ------------------------------------------------------------------ */

/**
 * EIP-1167 minimal proxy ("clone"): an exact, byte-for-byte pattern with
 * the target address embedded in the middle. Returns the target, or null
 * when the code is not a clone.
 */
function parseMinimalProxy(codeBody: string): Address | null {
  let body = codeBody;
  for (const prefix of CLONE_LENGTH_PREFIXES) {
    if (body.startsWith(prefix)) {
      body = body.slice(prefix.length);
      break;
    }
  }
  if (!body.startsWith(CLONE_PREFIX)) return null;
  const rest = body.slice(CLONE_PREFIX.length);
  if (rest.length !== 40 + CLONE_SUFFIX.length) return null;
  if (!rest.endsWith(CLONE_SUFFIX)) return null;
  const impl = rest.slice(0, 40);
  if (!/^[0-9a-f]{40}$/.test(impl)) return null;
  return toChecksum(`0x${impl}`);
}

/**
 * Read one proxy implementation slot. A failed or zero read means
 * "not a proxy via this slot" — never an error.
 */
async function readImplementationSlot(
  reader: FingerprintReader,
  address: Address,
  slot: Hex,
): Promise<Address | null> {
  let value: string;
  try {
    value = await reader.getStorageAt(address, slot);
  } catch {
    return null;
  }
  if (typeof value !== 'string') return null;
  const body = stripHexPrefix(value);
  if (!/^[0-9a-f]*$/.test(body)) return null;
  const last20 = body.slice(-40).padStart(40, '0');
  if (/^0+$/.test(last20)) return null;
  return toChecksum(`0x${last20}`);
}

/* ------------------------------------------------------------------ */
/* Fingerprint builders                                                */
/* ------------------------------------------------------------------ */

function eoaFingerprint(): Fingerprint {
  return {
    kind: 'eoa',
    label: 'Personal wallet',
    detail:
      'This address is a personal wallet, not a program. Whoever holds its key controls it and everything it owns.',
    selectors: [],
  };
}

function minimalProxyFingerprint(implementation: Address, selectors: string[]): Fingerprint {
  return {
    kind: 'minimal-proxy',
    label: 'Tiny forwarder to another program',
    detail:
      `This address holds almost no code of its own — the real code lives at another address, ${shortAddress(implementation)}, and everything you send here is forwarded there.` +
      ' That target is baked in and cannot be changed later.',
    implementation,
    selectors,
  };
}

function proxyFingerprint(implementation: Address, selectors: string[]): Fingerprint {
  return {
    kind: 'proxy',
    label: 'Front for another program',
    detail:
      `This address is only a front: the real code lives at another address, ${shortAddress(implementation)}.` +
      ' Whoever controls this front can swap that code for something different at any time, so what it does today is not guaranteed tomorrow.',
    implementation,
    selectors,
  };
}

function erc721Fingerprint(selectors: string[]): Fingerprint {
  return {
    kind: 'erc721',
    label: 'Collectible tokens (NFTs)',
    detail:
      'This program manages unique collectible items — each one is different and belongs to exactly one owner at a time.',
    selectors,
  };
}

function erc20Fingerprint(selectors: string[]): Fingerprint {
  return {
    kind: 'erc20',
    label: 'Token',
    detail:
      'This program is a regular token: it keeps a balance for every wallet and moves those balances when their owners ask.',
    selectors,
  };
}

function multisigFingerprint(selectors: string[]): Fingerprint {
  return {
    kind: 'multisig-or-wallet',
    label: 'Shared or smart wallet',
    detail:
      'This looks like a wallet that is itself a program — often one shared by several people, where funds only move once enough of them agree.',
    selectors,
  };
}

function unknownFingerprint(selectors: string[]): Fingerprint {
  return {
    kind: 'unknown-contract',
    label: 'Program (purpose unknown)',
    detail:
      'PreFlight could not recognise what this program does, so do not rely on its name or address alone — rely on what the simulation shows you.',
    selectors,
  };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export async function fingerprintAddress(
  reader: FingerprintReader,
  address: Address,
): Promise<Fingerprint> {
  const code = (await reader.getCode(address)) ?? '';
  const body = stripHexPrefix(code);

  // No code at all: a personal wallet, not a program.
  if (body.length === 0) return eoaFingerprint();

  const selectors = detectSelectors(code);

  // Exact-pattern clone check first — it needs no storage reads.
  const cloneTarget = parseMinimalProxy(body);
  if (cloneTarget !== null) return minimalProxyFingerprint(cloneTarget, selectors);

  // EIP-1967 slot, then the legacy OpenZeppelin slot. Read failures are
  // non-fatal: they simply mean "not a proxy via that slot".
  const implementation =
    (await readImplementationSlot(reader, address, EIP1967_IMPLEMENTATION_SLOT)) ??
    (await readImplementationSlot(reader, address, LEGACY_IMPLEMENTATION_SLOT));
  if (implementation !== null) return proxyFingerprint(implementation, selectors);

  // Interface guesses from the selectors the dispatcher exposes.
  const has = (selector: string): boolean => selectors.includes(selector);
  if (has(SEL_OWNER_OF) || has(SEL_SAFE_TRANSFER_FROM)) return erc721Fingerprint(selectors);
  if (has(SEL_TRANSFER) && has(SEL_BALANCE_OF)) return erc20Fingerprint(selectors);
  if (has(SEL_EXEC_TRANSACTION) || has(SEL_IS_VALID_SIGNATURE)) {
    return multisigFingerprint(selectors);
  }

  return unknownFingerprint(selectors);
}
