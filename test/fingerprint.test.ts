import { describe, expect, it } from 'vitest';
import {
  detectSelectors,
  fingerprintAddress,
} from '../src/lib/fingerprint';
import type { FingerprintReader } from '../src/lib/fingerprint';
import type { Address, Hex } from '../src/lib/types';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const TARGET: Address = '0x1111111111111111111111111111111111111111';
const IMPL_BODY = '1234567890abcdef1234567890abcdef12345678';
const IMPL: Address = `0x${IMPL_BODY}`;

const EIP1967_SLOT: Hex =
  '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
const LEGACY_SLOT: Hex =
  '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3';

const ZERO_WORD = `0x${'0'.repeat(64)}`;
const IMPL_WORD = `0x${'0'.repeat(24)}${IMPL_BODY}`;

// EIP-1167 runtime pieces
const CLONE_PREFIX = '363d3d373d3d3d363d73';
const CLONE_SUFFIX = '5af43d82803e903d91602b57fd5bf3';
const CLONE_RUNTIME = `0x${CLONE_PREFIX}${IMPL_BODY}${CLONE_SUFFIX}`;

// Selector-bearing snippets (0x14 = EQ, a plain one-byte opcode)
const ERC20_CODE = '0x63a9059cbb146370a0823114';
const ERC721_OWNER_OF_CODE = '0x636352211e14';
const ERC721_SAFE_TRANSFER_CODE = '0x6342842e0e14';
const SAFE_CODE = '0x636a76120214';
const SIG_WALLET_CODE = '0x631626ba7e14';
const RANDOM_CODE = '0x6001600155'; // PUSH1 01 PUSH1 01 SSTORE

interface ReaderOptions {
  code?: string;
  storage?: Record<string, string>;
  storageError?: boolean;
}

/**
 * Fake chain reader. Records which storage slots were requested; the
 * `call` method always throws so any use of it fails the test — the
 * fingerprinter must not make extra round trips.
 */
function makeReader(opts: ReaderOptions = {}): FingerprintReader & { storageReads: Hex[] } {
  const storageReads: Hex[] = [];
  return {
    storageReads,
    getCode: () => Promise.resolve(opts.code ?? '0x'),
    getStorageAt: (_a: Address, slot: Hex) => {
      storageReads.push(slot);
      if (opts.storageError) return Promise.reject(new Error('storage read failed'));
      return Promise.resolve(opts.storage?.[slot] ?? ZERO_WORD);
    },
    call: () => Promise.reject(new Error('call must not be used by fingerprinting')),
  };
}

/* ------------------------------------------------------------------ */
/* detectSelectors                                                     */
/* ------------------------------------------------------------------ */

describe('detectSelectors', () => {
  it('finds PUSH4 selectors in order of first appearance', () => {
    expect(detectSelectors('0x63a9059cbb146370a0823114')).toEqual([
      '0xa9059cbb',
      '0x70a08231',
    ]);
  });

  it('returns lowercase selectors and dedupes across mixed case', () => {
    expect(detectSelectors('0x63AABBCCDD1463aabbccdd14')).toEqual(['0xaabbccdd']);
  });

  it('does not rescan inside a selector whose bytes contain 0x63', () => {
    // PUSH4 0x63636363 then PUSH4 0x11223344 — a naive scanner would
    // also "find" selectors starting inside the first constant.
    expect(detectSelectors('0x63636363636311223344')).toEqual([
      '0x63636363',
      '0x11223344',
    ]);
  });

  it('skips PUSH data of other pushes, so constants are not misread', () => {
    // PUSH32 whose data starts with what looks like PUSH4 0xdeadbeef,
    // followed by a real PUSH4 0xcafebabe.
    const push32Data = `63deadbeef${'00'.repeat(27)}`;
    const code = `0x7f${push32Data}63cafebabe`;
    expect(detectSelectors(code)).toEqual(['0xcafebabe']);
  });

  it('ignores a truncated PUSH4 at the end of the code', () => {
    expect(detectSelectors('0x1463aabb')).toEqual([]);
  });

  it('caps the result at 200 unique selectors', () => {
    let code = '0x';
    const expected: string[] = [];
    for (let i = 0; i < 250; i += 1) {
      const sel = i.toString(16).padStart(8, '0');
      code += `63${sel}`;
      if (i < 200) expected.push(`0x${sel}`);
    }
    const result = detectSelectors(code);
    expect(result).toHaveLength(200);
    expect(result).toEqual(expected);
  });

  it('returns nothing for empty code', () => {
    expect(detectSelectors('0x')).toEqual([]);
    expect(detectSelectors('')).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* fingerprintAddress — wallets and unknowns                           */
/* ------------------------------------------------------------------ */

describe('fingerprintAddress: personal wallets and unknowns', () => {
  it('classifies "0x" code as a personal wallet', async () => {
    const fp = await fingerprintAddress(makeReader({ code: '0x' }), TARGET);
    expect(fp.kind).toBe('eoa');
    expect(fp.label).toBe('Personal wallet');
    expect(fp.detail.toLowerCase()).toContain('key');
    expect(fp.selectors).toEqual([]);
    expect(fp.implementation).toBeUndefined();
  });

  it('classifies empty-string code as a personal wallet', async () => {
    const fp = await fingerprintAddress(makeReader({ code: '' }), TARGET);
    expect(fp.kind).toBe('eoa');
  });

  it('falls back to unknown-contract for unrecognisable code', async () => {
    const fp = await fingerprintAddress(makeReader({ code: RANDOM_CODE }), TARGET);
    expect(fp.kind).toBe('unknown-contract');
    expect(fp.label).toBe('Program (purpose unknown)');
    expect(fp.detail.toLowerCase()).toContain('simulation');
  });
});

/* ------------------------------------------------------------------ */
/* fingerprintAddress — minimal proxies (EIP-1167)                     */
/* ------------------------------------------------------------------ */

describe('fingerprintAddress: minimal proxies', () => {
  it('recognises the standard clone runtime and extracts the target', async () => {
    const reader = makeReader({ code: CLONE_RUNTIME });
    const fp = await fingerprintAddress(reader, TARGET);
    expect(fp.kind).toBe('minimal-proxy');
    expect(fp.implementation?.toLowerCase()).toBe(IMPL.toLowerCase());
    // The clone check is pure bytecode analysis — no storage reads.
    expect(reader.storageReads).toEqual([]);
  });

  it('tolerates the two known length-prefix variants', async () => {
    for (const prefix of ['3d602d80600a3d3981f3', '602d8060093d393df3']) {
      const code = `0x${prefix}${CLONE_PREFIX}${IMPL_BODY}${CLONE_SUFFIX}`;
      const fp = await fingerprintAddress(makeReader({ code }), TARGET);
      expect(fp.kind).toBe('minimal-proxy');
      expect(fp.implementation?.toLowerCase()).toBe(IMPL.toLowerCase());
    }
  });

  it('rejects near-misses with a corrupted tail', async () => {
    const corrupted = `0x${CLONE_PREFIX}${IMPL_BODY}${CLONE_SUFFIX.slice(0, -2)}ff`;
    const fp = await fingerprintAddress(makeReader({ code: corrupted }), TARGET);
    expect(fp.kind).not.toBe('minimal-proxy');
  });

  it('rejects clone-like code with trailing extra bytes', async () => {
    const fp = await fingerprintAddress(makeReader({ code: `${CLONE_RUNTIME}00` }), TARGET);
    expect(fp.kind).not.toBe('minimal-proxy');
  });

  it('says the real code lives elsewhere', async () => {
    const fp = await fingerprintAddress(makeReader({ code: CLONE_RUNTIME }), TARGET);
    expect(fp.detail.toLowerCase()).toContain('another address');
  });
});

/* ------------------------------------------------------------------ */
/* fingerprintAddress — upgradeable proxies (EIP-1967)                 */
/* ------------------------------------------------------------------ */

describe('fingerprintAddress: upgradeable proxies', () => {
  it('reads exactly the EIP-1967 slot and reports the implementation', async () => {
    const reader = makeReader({
      code: RANDOM_CODE,
      storage: { [EIP1967_SLOT]: IMPL_WORD },
    });
    const fp = await fingerprintAddress(reader, TARGET);
    expect(fp.kind).toBe('proxy');
    expect(fp.implementation?.toLowerCase()).toBe(IMPL.toLowerCase());
    expect(reader.storageReads[0]).toBe(EIP1967_SLOT);
  });

  it('falls back to the legacy OpenZeppelin slot', async () => {
    const reader = makeReader({
      code: RANDOM_CODE,
      storage: { [LEGACY_SLOT]: IMPL_WORD },
    });
    const fp = await fingerprintAddress(reader, TARGET);
    expect(fp.kind).toBe('proxy');
    expect(fp.implementation?.toLowerCase()).toBe(IMPL.toLowerCase());
    expect(reader.storageReads).toEqual([EIP1967_SLOT, LEGACY_SLOT]);
  });

  it('treats an all-zero slot value as not-a-proxy', async () => {
    const reader = makeReader({
      code: RANDOM_CODE,
      storage: { [EIP1967_SLOT]: ZERO_WORD, [LEGACY_SLOT]: ZERO_WORD },
    });
    const fp = await fingerprintAddress(reader, TARGET);
    expect(fp.kind).toBe('unknown-contract');
  });

  it('warns that the code behind the proxy can be swapped', async () => {
    const reader = makeReader({
      code: RANDOM_CODE,
      storage: { [EIP1967_SLOT]: IMPL_WORD },
    });
    const fp = await fingerprintAddress(reader, TARGET);
    expect(fp.detail.toLowerCase()).toContain('another address');
    expect(fp.detail.toLowerCase()).toContain('swap');
  });

  it('survives getStorageAt throwing and still classifies by interface', async () => {
    const reader = makeReader({ code: ERC20_CODE, storageError: true });
    const fp = await fingerprintAddress(reader, TARGET);
    expect(fp.kind).toBe('erc20');
    // Both slots were attempted despite the failures.
    expect(reader.storageReads).toEqual([EIP1967_SLOT, LEGACY_SLOT]);
  });
});

/* ------------------------------------------------------------------ */
/* fingerprintAddress — tokens and wallets by interface                */
/* ------------------------------------------------------------------ */

describe('fingerprintAddress: interface classification', () => {
  it('classifies transfer + balanceOf as a token', async () => {
    const fp = await fingerprintAddress(makeReader({ code: ERC20_CODE }), TARGET);
    expect(fp.kind).toBe('erc20');
    expect(fp.selectors).toContain('0xa9059cbb');
    expect(fp.selectors).toContain('0x70a08231');
  });

  it('does not call a lone transfer selector a token', async () => {
    const fp = await fingerprintAddress(makeReader({ code: '0x63a9059cbb14' }), TARGET);
    expect(fp.kind).toBe('unknown-contract');
  });

  it('classifies ownerOf as collectibles', async () => {
    const fp = await fingerprintAddress(makeReader({ code: ERC721_OWNER_OF_CODE }), TARGET);
    expect(fp.kind).toBe('erc721');
  });

  it('classifies safeTransferFrom as collectibles', async () => {
    const fp = await fingerprintAddress(
      makeReader({ code: ERC721_SAFE_TRANSFER_CODE }),
      TARGET,
    );
    expect(fp.kind).toBe('erc721');
  });

  it('prefers collectibles when both token and collectible markers exist', async () => {
    // transfer + balanceOf + ownerOf: the 721 marker wins.
    const code = '0x63a9059cbb146370a0823114636352211e14';
    const fp = await fingerprintAddress(makeReader({ code }), TARGET);
    expect(fp.kind).toBe('erc721');
  });

  it('classifies execTransaction as a shared or smart wallet', async () => {
    const fp = await fingerprintAddress(makeReader({ code: SAFE_CODE }), TARGET);
    expect(fp.kind).toBe('multisig-or-wallet');
  });

  it('classifies isValidSignature as a shared or smart wallet', async () => {
    const fp = await fingerprintAddress(makeReader({ code: SIG_WALLET_CODE }), TARGET);
    expect(fp.kind).toBe('multisig-or-wallet');
  });
});
