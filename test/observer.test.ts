import { describe, expect, it } from 'vitest';
import { getAddress } from 'viem';
import {
  describeProfile,
  normalizeObserverInput,
  profileAddress,
} from '../src/lib/observer';
import type { ObserverProfile, ObserverReader } from '../src/lib/observer';
import type { Address } from '../src/lib/types';

/* ------------------------------------------------------------------ */
/* Fixtures and helpers                                                */
/* ------------------------------------------------------------------ */

const LOWER = '0xd8da6bf26964af9d7eed9e03e53415d37aa96045';
const CHECKSUMMED = getAddress(LOWER); // mixed-case EIP-55 form
const ADDR: Address = CHECKSUMMED;

interface ReaderCalls {
  getBalance: Address[];
  getTransactionCount: Address[];
  getCode: Address[];
}

/**
 * Fake ObserverReader answering from canned data. No network anywhere.
 * Any field set to an Error makes the corresponding read reject.
 */
function fakeReader(opts: {
  balance?: bigint | Error;
  txCount?: number | Error;
  code?: string | null | Error;
}): { reader: ObserverReader; calls: ReaderCalls } {
  const calls: ReaderCalls = { getBalance: [], getTransactionCount: [], getCode: [] };
  const reader: ObserverReader = {
    async getBalance(a) {
      calls.getBalance.push(a);
      if (opts.balance instanceof Error) throw opts.balance;
      return opts.balance ?? 0n;
    },
    async getTransactionCount(a) {
      calls.getTransactionCount.push(a);
      if (opts.txCount instanceof Error) throw opts.txCount;
      return opts.txCount ?? 0;
    },
    async getCode(a) {
      calls.getCode.push(a);
      if (opts.code instanceof Error) throw opts.code;
      return opts.code === undefined ? '0x' : opts.code;
    },
  };
  return { reader, calls };
}

function expectAddress(
  result: { address: Address } | { error: string },
): Address {
  if (!('address' in result)) {
    throw new Error(`expected an address, got error: ${result.error}`);
  }
  return result.address;
}

function expectError(result: { address: Address } | { error: string }): string {
  if (!('error' in result)) {
    throw new Error(`expected an error, got address: ${result.address}`);
  }
  return result.error;
}

/* ------------------------------------------------------------------ */
/* normalizeObserverInput                                              */
/* ------------------------------------------------------------------ */

describe('normalizeObserverInput', () => {
  it('accepts an all-lowercase address and returns the checksummed form', () => {
    const address = expectAddress(normalizeObserverInput(LOWER));
    expect(address).toBe(CHECKSUMMED);
    expect(address).not.toBe(LOWER); // EIP-55 form is mixed-case
  });

  it('accepts an already-checksummed address unchanged', () => {
    const address = expectAddress(normalizeObserverInput(CHECKSUMMED));
    expect(address).toBe(CHECKSUMMED);
  });

  it('tolerates surrounding whitespace', () => {
    const address = expectAddress(normalizeObserverInput(`  ${LOWER}\n`));
    expect(address).toBe(CHECKSUMMED);
  });

  it('extracts the address from an explorer URL', () => {
    const url = `https://testnet.monadexplorer.com/address/${LOWER}`;
    const address = expectAddress(normalizeObserverInput(url));
    expect(address).toBe(CHECKSUMMED);
  });

  it('extracts the address from an explorer URL with a trailing query', () => {
    const url = `https://example-explorer.io/address/${LOWER}?tab=tokens`;
    const address = expectAddress(normalizeObserverInput(url));
    expect(address).toBe(CHECKSUMMED);
  });

  it('rejects garbage with a plain-language error and never throws', () => {
    const error = expectError(normalizeObserverInput('hello world'));
    expect(error).toMatch(/0x/);
    expect(error.length).toBeGreaterThan(10);
  });

  it('rejects a too-short hex string', () => {
    expect('error' in normalizeObserverInput('0x1234')).toBe(true);
  });

  it('rejects an empty string', () => {
    const error = expectError(normalizeObserverInput(''));
    expect(error).toMatch(/0x/);
  });

  it('rejects whitespace-only input', () => {
    expect('error' in normalizeObserverInput('   \t ')).toBe(true);
  });

  it('rejects a URL without an /address/ segment', () => {
    expect('error' in normalizeObserverInput('https://example.com/tx/0xabc')).toBe(
      true,
    );
  });
});

/* ------------------------------------------------------------------ */
/* profileAddress                                                      */
/* ------------------------------------------------------------------ */

describe('profileAddress', () => {
  it('profiles a contract when code is non-empty', async () => {
    const { reader } = fakeReader({
      balance: 5n * 10n ** 18n,
      txCount: 3,
      code: '0x6080604052',
    });
    const p = await profileAddress(reader, ADDR);
    expect(p.address).toBe(ADDR);
    expect(p.nativeBalanceWei).toBe(5n * 10n ** 18n);
    expect(p.txCount).toBe(3);
    expect(p.isContract).toBe(true);
    expect(p.firstSeenNote).toBe('This address is a program (smart contract).');
  });

  it('describes a fresh wallet with 0 transactions and 0 balance', async () => {
    const { reader } = fakeReader({ balance: 0n, txCount: 0, code: '0x' });
    const p = await profileAddress(reader, ADDR);
    expect(p.isContract).toBe(false);
    expect(p.firstSeenNote).toBe(
      'This wallet has never been used — no transactions, no funds.',
    );
  });

  it('describes an active wallet with its transaction count', async () => {
    const { reader } = fakeReader({ balance: 10n ** 18n, txCount: 42, code: '0x' });
    const p = await profileAddress(reader, ADDR);
    expect(p.isContract).toBe(false);
    expect(p.firstSeenNote).toBe('This wallet has sent 42 transactions.');
  });

  it('uses singular grammar for exactly one transaction', async () => {
    const { reader } = fakeReader({ balance: 0n, txCount: 1, code: '0x' });
    const p = await profileAddress(reader, ADDR);
    expect(p.firstSeenNote).toBe('This wallet has sent 1 transaction.');
  });

  it('treats a null code answer as a plain wallet, no caveat', async () => {
    const { reader } = fakeReader({ balance: 0n, txCount: 2, code: null });
    const p = await profileAddress(reader, ADDR);
    expect(p.isContract).toBe(false);
    expect(p.firstSeenNote).toBe('This wallet has sent 2 transactions.');
  });

  it('survives a getCode failure: isContract false plus a caveat in the note', async () => {
    const { reader } = fakeReader({
      balance: 7n,
      txCount: 5,
      code: new Error('method eth_getCode not supported'),
    });
    const p = await profileAddress(reader, ADDR);
    expect(p.isContract).toBe(false);
    expect(p.nativeBalanceWei).toBe(7n);
    expect(p.txCount).toBe(5);
    expect(p.firstSeenNote).toContain('This wallet has sent 5 transactions.');
    expect(p.firstSeenNote).toContain('could not confirm');
  });

  it('lets a getBalance failure propagate to the caller', async () => {
    const { reader } = fakeReader({
      balance: new Error('RPC unreachable'),
      txCount: 0,
      code: '0x',
    });
    await expect(profileAddress(reader, ADDR)).rejects.toThrow('RPC unreachable');
  });

  it('lets a getTransactionCount failure propagate to the caller', async () => {
    const { reader } = fakeReader({
      balance: 0n,
      txCount: new Error('rate limited'),
      code: '0x',
    });
    await expect(profileAddress(reader, ADDR)).rejects.toThrow('rate limited');
  });

  it('reads balance, transaction count, and code once each, for the same address', async () => {
    const { reader, calls } = fakeReader({ balance: 0n, txCount: 0, code: '0x' });
    await profileAddress(reader, ADDR);
    expect(calls.getBalance).toEqual([ADDR]);
    expect(calls.getTransactionCount).toEqual([ADDR]);
    expect(calls.getCode).toEqual([ADDR]);
  });
});

/* ------------------------------------------------------------------ */
/* describeProfile                                                     */
/* ------------------------------------------------------------------ */

describe('describeProfile', () => {
  const stubFormatMon = (wei: bigint): string => `${wei} stub-MON`;

  function profile(overrides: Partial<ObserverProfile>): ObserverProfile {
    return {
      address: ADDR,
      nativeBalanceWei: 0n,
      txCount: 0,
      isContract: false,
      firstSeenNote: 'This wallet has never been used — no transactions, no funds.',
      ...overrides,
    };
  }

  it('returns 3–4 bullets for a wallet, using the injected formatter', () => {
    const p = profile({ nativeBalanceWei: 1500n, txCount: 9 });
    const bullets = describeProfile(p, stubFormatMon);
    expect(bullets.length).toBeGreaterThanOrEqual(3);
    expect(bullets.length).toBeLessThanOrEqual(4);
    const joined = bullets.join(' ');
    expect(joined).toContain('1500 stub-MON'); // formatter was actually used
    expect(joined).toContain('9 transactions');
    expect(joined).toContain('wallet');
    expect(bullets).toContain(p.firstSeenNote); // the note rides along verbatim
  });

  it('describes a contract as a program', () => {
    const p = profile({
      isContract: true,
      firstSeenNote: 'This address is a program (smart contract).',
    });
    const bullets = describeProfile(p, stubFormatMon);
    const joined = bullets.join(' ');
    expect(joined).toContain('program (smart contract)');
    expect(bullets).toContain('This address is a program (smart contract).');
  });

  it('uses singular grammar for a single transaction', () => {
    const bullets = describeProfile(profile({ txCount: 1 }), stubFormatMon);
    expect(bullets.join(' ')).toContain('Has sent 1 transaction.');
  });

  it('says the wallet has never sent a transaction when txCount is 0', () => {
    const bullets = describeProfile(profile({ txCount: 0 }), stubFormatMon);
    expect(bullets.join(' ')).toContain('Has never sent a transaction.');
  });
});
