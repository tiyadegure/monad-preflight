/**
 * EIP-7702 delegation detection and explanation for Monad PreFlight.
 *
 * One signature of the right shape makes a normal wallet run
 * attacker-chosen code permanently, and nothing about it shows up in the
 * fields wallets usually display. This module does two jobs:
 *
 *  1. detectDelegation — read an account's on-chain code and recognize
 *     the 23-byte delegation marker (0xef0100 + 20-byte address).
 *  2. explainAuthorization — take a signing request of that shape and
 *     explain, in plain language, what saying yes would actually do.
 *
 * Everything here is pure and deterministic: no network, no throwing.
 */

import { getAddress } from 'viem';
import type { Address, RiskFinding } from './types';
import { shortAddress } from './format';

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

export const DELEGATION_PREFIX = '0xef0100';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** 23 bytes: 3-byte marker + 20-byte address = 46 hex characters. */
const DESIGNATOR_HEX_LENGTH = 46;

export interface Delegation {
  delegated: boolean;
  implementation?: Address;
}

/**
 * Recognize an EIP-7702 delegation designator in account code.
 *
 * A delegated account has EXACTLY 23 bytes of code: 0xef0100 followed by
 * the 20-byte address the wallet now runs. Anything longer or shorter is
 * an ordinary contract, not a delegation. Case-insensitive, tolerates a
 * missing 0x prefix, never throws.
 */
export function detectDelegation(code: string | null | undefined): Delegation {
  if (typeof code !== 'string') return { delegated: false };
  let hex = code.trim().toLowerCase();
  if (hex.startsWith('0x')) hex = hex.slice(2);
  if (hex.length !== DESIGNATOR_HEX_LENGTH) return { delegated: false };
  if (!hex.startsWith('ef0100')) return { delegated: false };
  const addressPart = hex.slice(6);
  if (!/^[0-9a-f]{40}$/.test(addressPart)) return { delegated: false };
  try {
    return { delegated: true, implementation: getAddress(`0x${addressPart}`) };
  } catch {
    return { delegated: false };
  }
}

/* ------------------------------------------------------------------ */
/* Risk findings from detected delegations                             */
/* ------------------------------------------------------------------ */

export interface DelegationRiskInput {
  self: Delegation;
  counterparty?: Delegation;
  counterpartyIsRecipient?: boolean;
}

export function assessDelegationRisks(input: DelegationRiskInput): RiskFinding[] {
  const findings: RiskFinding[] = [];

  if (input.self.delegated) {
    const where = input.self.implementation
      ? shortAddress(input.self.implementation)
      : 'an address we could not read';
    findings.push({
      id: 'self-delegated',
      severity: 'danger',
      title: "Your wallet is running someone else's code",
      detail:
        `Your wallet is currently running code that was installed into it, coming from ${where}.` +
        ' Whoever controls that code can move your funds without asking you again.' +
        ' This stays true until you remove it.',
    });
  }

  if (input.counterparty?.delegated && input.counterpartyIsRecipient !== false) {
    findings.push({
      id: 'recipient-delegated',
      severity: 'caution',
      title: 'The recipient wallet has a program installed',
      detail:
        'The address you are sending to is a wallet with a program installed in it.' +
        ' Funds arriving there can be swept away automatically the moment they land.',
    });
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/* Authorization requests (the signature that CREATES a delegation)    */
/* ------------------------------------------------------------------ */

export interface AuthorizationLike {
  chainId?: unknown;
  address?: unknown;
  nonce?: unknown;
}

export interface AuthorizationExplanation {
  headline: string;
  outcome: string;
  bullets: string[];
  risks: RiskFinding[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAddressString(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * True for an object that looks like a delegation-signing request:
 * an `address` field holding a 0x-address plus a chainId or nonce field,
 * OR an object carrying an `authorizationList` array. Never throws.
 */
export function looksLikeAuthorization(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Array.isArray(value['authorizationList'])) return true;
  if (!isAddressString(value['address'])) return false;
  return 'chainId' in value || 'nonce' in value;
}

/** Best-effort read of a network id from number, bigint, or string. */
function readChainId(value: unknown): number | undefined {
  try {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
    if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }
    if (typeof value === 'string') {
      const s = value.trim();
      if (s === '') return undefined;
      const n = /^0x[0-9a-fA-F]+$/.test(s) ? Number.parseInt(s, 16) : Number(s);
      if (Number.isInteger(n) && n >= 0) return n;
    }
  } catch {
    /* unreadable — treat as unknown */
  }
  return undefined;
}

interface ParsedEntry {
  address: Address;
  chainId?: number;
  isRevoke: boolean;
}

const MALFORMED_ERROR =
  'We could not read this signing request. It does not have the shape we expected,' +
  ' so we cannot explain it — do not sign anything you cannot verify.';

/** Extract the list of entries to explain, or null when malformed. */
function extractEntries(value: unknown): ParsedEntry[] | null {
  let root: unknown = value;

  if (typeof root === 'string') {
    try {
      root = JSON.parse(root);
    } catch {
      return null;
    }
  }
  if (!isRecord(root)) return null;

  let rawEntries: unknown[];
  const list = root['authorizationList'];
  if (Array.isArray(list)) {
    if (list.length === 0) return null;
    rawEntries = list;
  } else {
    rawEntries = [root];
  }

  const entries: ParsedEntry[] = [];
  for (const raw of rawEntries) {
    if (!isRecord(raw) || !isAddressString(raw['address'])) return null;
    let address: Address;
    try {
      address = getAddress(raw['address']);
    } catch {
      return null;
    }
    entries.push({
      address,
      chainId: readChainId(raw['chainId']),
      isRevoke: address.toLowerCase() === ZERO_ADDRESS,
    });
  }
  return entries;
}

/**
 * Explain a delegation-signing request in plain language.
 *
 * Accepts a single request object, an object with an authorizationList
 * (every entry is explained), or a JSON string of either. Never throws;
 * anything unreadable comes back as { error }.
 */
export function explainAuthorization(
  value: unknown,
  opts?: { expectedChainIds?: number[]; selfAddress?: Address },
): AuthorizationExplanation | { error: string } {
  const entries = extractEntries(value);
  if (entries === null) return { error: MALFORMED_ERROR };

  const allRevoke = entries.every((e) => e.isRevoke);
  const bullets: string[] = [];
  const risks: RiskFinding[] = [];
  let anyChainZero = false;
  let anyUnexpectedChain = false;

  for (const entry of entries) {
    if (entry.isRevoke) {
      bullets.push(
        `This entry points at the all-zero address ${ZERO_ADDRESS},` +
          ' which removes an installed program instead of adding one.',
      );
    } else {
      bullets.push(
        `The program that would run inside your wallet lives at ${shortAddress(entry.address)}` +
          ` (full address: ${entry.address}).`,
      );
    }

    if (entry.chainId === 0) {
      anyChainZero = true;
      bullets.push(
        'It applies on EVERY network at once, not just one — that is strictly worse,' +
          ' because it also covers networks you have never used.',
      );
    } else if (entry.chainId !== undefined) {
      bullets.push(`It applies on network number ${entry.chainId}.`);
      if (
        opts?.expectedChainIds !== undefined &&
        !opts.expectedChainIds.includes(entry.chainId)
      ) {
        anyUnexpectedChain = true;
      }
    } else {
      bullets.push('We could not read which network this applies to.');
    }

    if (opts?.selfAddress !== undefined && !entry.isRevoke) {
      if (entry.address.toLowerCase() === opts.selfAddress.toLowerCase()) {
        bullets.push(
          'The program address is your own wallet address — that is unusual and' +
            ' probably not what an honest app would ask for.',
        );
      } else {
        bullets.push(
          `If you sign, this program is installed into your own wallet` +
            ` (${shortAddress(opts.selfAddress)}) and can then act as you.`,
        );
      }
    }
  }

  const revokeDetailBase =
    `Pointing your wallet at the all-zero address ${ZERO_ADDRESS}` +
    ' is how you REMOVE an installed program and return your wallet to normal.';

  if (allRevoke) {
    risks.push({
      id: 'delegation-revoke',
      severity: 'info',
      title: 'This removes a program, not installs one',
      detail:
        `${revokeDetailBase} The address in this request is all zeros,` +
        ' so this request is a removal — a safe cleanup step.',
    });
    return {
      headline: 'This removes a program from your wallet',
      outcome:
        'This signature points your wallet at the all-zero address, which switches off' +
        ' any program that was installed into it before. Your wallet goes back to being' +
        ' a normal wallet that only acts when you sign. This is a cleanup step, not a takeover.',
      bullets,
      risks,
    };
  }

  risks.push({
    id: 'delegation-request',
    severity: 'danger',
    title: 'A program is asking to control your wallet',
    detail:
      'Signing this installs a program into your wallet that can then act as you' +
      ' — move funds, grant permissions — at any time, without asking you again.' +
      ' No everyday app needs this from you; most requests like this are attempts to steal funds.',
  });

  if (anyChainZero) {
    risks.push({
      id: 'delegation-any-chain',
      severity: 'danger',
      title: 'It would apply on every network',
      detail:
        'This request uses network number 0, which means it applies on every network' +
        ' at once, now and in the future. That is strictly worse than a request' +
        ' limited to a single network.',
    });
  }

  if (anyUnexpectedChain) {
    risks.push({
      id: 'delegation-unknown-network',
      severity: 'caution',
      title: 'It is for a different network',
      detail:
        'This request applies to a network other than the one you are using.' +
        ' Requests aimed at a network you did not expect are a common trick — be extra careful.',
    });
  }

  risks.push({
    id: 'delegation-revoke',
    severity: 'info',
    title: 'How to undo this kind of change',
    detail:
      `${revokeDetailBase} If you ever sign one of these by mistake,` +
      ' removing it that way should be your very next step.',
  });

  return {
    headline: 'Signing this would let a program take over your wallet',
    outcome:
      'This is not a normal transfer. It installs a program into your own wallet,' +
      ' and from then on that program can act as you — sending funds and granting' +
      ' permissions without asking you again. It stays in place until you replace it' +
      ' with an empty one, and signing costs no gas, so no fee will warn you.',
    bullets,
    risks,
  };
}
