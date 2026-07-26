import { describe, expect, it } from 'vitest';
import type { PublicClient } from 'viem';
import { fetchBalances } from '../src/lib/balances';
import { NATIVE_MON } from '../src/lib/types';
import type { Address, TokenInfo } from '../src/lib/types';

/* ------------------------------------------------------------------ */
/* Fixtures and helpers                                                */
/* ------------------------------------------------------------------ */

const OWNER: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const ADDR_ZETA: Address = '0x1111111111111111111111111111111111111111';
const ADDR_ALPHA: Address = '0x2222222222222222222222222222222222222222';
const ADDR_BETA: Address = '0x3333333333333333333333333333333333333333';

const ZETA: TokenInfo = { address: ADDR_ZETA, symbol: 'zeta', decimals: 18 };
const ALPHA: TokenInfo = { address: ADDR_ALPHA, symbol: 'ALPHA', decimals: 6 };
const BETA: TokenInfo = { address: ADDR_BETA, symbol: 'Beta', decimals: 18 };

interface RecordedMulticall {
  contracts: readonly {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args: readonly unknown[];
  }[];
  allowFailure?: boolean;
}

type FakeMulticallResult =
  | { status: 'success'; result: unknown }
  | { status: 'failure'; error: Error; result?: undefined };

/**
 * Stub PublicClient: records every getBalance / multicall invocation and
 * answers from canned data. No network access anywhere.
 */
function stubClient(opts: {
  native?: bigint;
  multicallResults?: FakeMulticallResult[];
}): {
  client: PublicClient;
  getBalanceCalls: { address: Address }[];
  multicallCalls: RecordedMulticall[];
} {
  const getBalanceCalls: { address: Address }[] = [];
  const multicallCalls: RecordedMulticall[] = [];
  const fake = {
    async getBalance(args: { address: Address }): Promise<bigint> {
      getBalanceCalls.push(args);
      return opts.native ?? 0n;
    },
    async multicall(args: RecordedMulticall): Promise<FakeMulticallResult[]> {
      multicallCalls.push(args);
      return opts.multicallResults ?? [];
    },
  };
  return { client: fake as unknown as PublicClient, getBalanceCalls, multicallCalls };
}

/* ------------------------------------------------------------------ */
/* Happy path: one multicall, sorted results                           */
/* ------------------------------------------------------------------ */

describe('fetchBalances', () => {
  it('reads all ERC-20 balances through ONE multicall with the right contract list', async () => {
    const { client, getBalanceCalls, multicallCalls } = stubClient({
      native: 5n * 10n ** 18n,
      // Results line up with the sorted contract order: ALPHA, Beta, zeta.
      multicallResults: [
        { status: 'success', result: 100n },
        { status: 'success', result: 200n },
        { status: 'success', result: 300n },
      ],
    });

    const out = await fetchBalances(client, OWNER, [ZETA, ALPHA, BETA]);

    // Native balance read for the owner.
    expect(getBalanceCalls).toEqual([{ address: OWNER }]);
    expect(out.native).toBe(5n * 10n ** 18n);

    // Exactly one multicall, batching every token with allowFailure.
    expect(multicallCalls).toHaveLength(1);
    const call = multicallCalls[0]!;
    expect(call.allowFailure).toBe(true);
    expect(call.contracts).toHaveLength(3);
    expect(call.contracts.map((c) => c.address)).toEqual([ADDR_ALPHA, ADDR_BETA, ADDR_ZETA]);
    for (const contract of call.contracts) {
      expect(contract.functionName).toBe('balanceOf');
      expect(contract.args).toEqual([OWNER]);
    }

    // Tokens come back sorted by symbol, case-insensitively.
    expect(out.tokens.map((t) => t.token.symbol)).toEqual(['ALPHA', 'Beta', 'zeta']);
    expect(out.tokens.map((t) => t.raw)).toEqual([100n, 200n, 300n]);
    expect(out.notes).toEqual([]);
  });

  it('skips entries with a null address (native MON) when building the multicall', async () => {
    const { client, multicallCalls } = stubClient({
      native: 1n,
      multicallResults: [{ status: 'success', result: 42n }],
    });

    const out = await fetchBalances(client, OWNER, [NATIVE_MON, BETA]);

    expect(multicallCalls).toHaveLength(1);
    expect(multicallCalls[0]!.contracts.map((c) => c.address)).toEqual([ADDR_BETA]);
    expect(out.tokens).toEqual([{ token: BETA, raw: 42n }]);
  });

  /* ---------------------------------------------------------------- */
  /* Failure handling                                                  */
  /* ---------------------------------------------------------------- */

  it('skips failed reads and adds ONE plain-language note naming every skipped symbol', async () => {
    const { client } = stubClient({
      native: 0n,
      // Sorted order: ALPHA (fails), Beta (ok), zeta (fails).
      multicallResults: [
        { status: 'failure', error: new Error('execution reverted') },
        { status: 'success', result: 7n },
        { status: 'failure', error: new Error('out of gas') },
      ],
    });

    const out = await fetchBalances(client, OWNER, [ZETA, ALPHA, BETA]);

    expect(out.tokens).toEqual([{ token: BETA, raw: 7n }]);
    expect(out.notes).toHaveLength(1);
    const note = out.notes[0]!;
    expect(note).toContain('ALPHA');
    expect(note).toContain('zeta');
    expect(note).not.toContain('Beta');
  });

  it('treats a success entry with a non-bigint result as a failed read', async () => {
    const { client } = stubClient({
      multicallResults: [{ status: 'success', result: 'not-a-bigint' }],
    });

    const out = await fetchBalances(client, OWNER, [ALPHA]);

    expect(out.tokens).toEqual([]);
    expect(out.notes).toHaveLength(1);
    expect(out.notes[0]).toContain('ALPHA');
  });

  /* ---------------------------------------------------------------- */
  /* Native-only paths: no multicall at all                            */
  /* ---------------------------------------------------------------- */

  it('returns only the native balance for an empty token list — multicall is never called', async () => {
    const { client, getBalanceCalls, multicallCalls } = stubClient({ native: 123n });

    const out = await fetchBalances(client, OWNER, []);

    expect(out).toEqual({ native: 123n, tokens: [], notes: [] });
    expect(getBalanceCalls).toHaveLength(1);
    expect(multicallCalls).toHaveLength(0);
  });

  it('never calls multicall when every entry is the native token', async () => {
    const { client, multicallCalls } = stubClient({ native: 9n });

    const out = await fetchBalances(client, OWNER, [NATIVE_MON]);

    expect(out).toEqual({ native: 9n, tokens: [], notes: [] });
    expect(multicallCalls).toHaveLength(0);
  });
});
