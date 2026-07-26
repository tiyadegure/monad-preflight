import { describe, expect, it } from 'vitest';
import { encodeAbiParameters } from 'viem';
import { scanApprovals } from '../src/lib/approvals';
import type { ApprovalScan } from '../src/lib/approvals';
import type { RpcCallFn } from '../src/lib/simulate';
import type { Address } from '../src/lib/types';
import { MAX_UINT256, shortAddress } from '../src/lib/format';

/* ------------------------------------------------------------------ */
/* Fixtures and helpers                                                */
/* ------------------------------------------------------------------ */

const OWNER = '0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa' as Address;
const TOKEN_A = '0xdddddddddddddddddddddddddddddddddddddddd';
const TOKEN_B = '0xffffffffffffffffffffffffffffffffffffffff';
const SPENDER_1 = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
const SPENDER_2 = '0x1111111111111111111111111111111111111111';

const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';

// latest block used in most tests: 10000; the first 100-block chunk is
// [9901..10000] and the second is [9801..9900].
const LATEST = '0x2710';

/** Address left-padded to a 32-byte topic, lowercase. */
const topicAddr = (addr: string): string => `0x${'0'.repeat(24)}${addr.slice(2).toLowerCase()}`;
/** Address left-padded to a 32-byte calldata word, lowercase, no 0x. */
const padWord = (addr: string): string => addr.slice(2).toLowerCase().padStart(64, '0');
/** bigint as a full 32-byte hex word. */
const word = (n: bigint): string => `0x${n.toString(16).padStart(64, '0')}`;
/** bytes32-style symbol (older tokens): ascii bytes then trailing zeros. */
const bytes32Symbol = (s: string): string =>
  `0x${[...s].map((c) => c.charCodeAt(0).toString(16).padStart(2, '0')).join('').padEnd(64, '0')}`;

const approvalLog = (token: string, owner: string, spender: string, block: number) => ({
  address: token,
  topics: [APPROVAL_TOPIC, topicAddr(owner), topicAddr(spender)],
  data: word(1n), // the event's amount is irrelevant — the live read decides
  blockNumber: `0x${block.toString(16)}`,
});

type Handlers = Record<string, (params: unknown[]) => unknown>;

/** Fake RPC keyed by method. A missing handler throws, like a JSON-RPC error. */
function fakeRpc(handlers: Handlers): RpcCallFn {
  return async (method, params) => {
    const handler = handlers[method];
    if (!handler) throw new Error(`the method ${method} does not exist/is not available`);
    return handler(params);
  };
}

interface EthCallBook {
  /** live allowance keyed by `${token}|${spender}` (lowercase) */
  allowances?: Record<string, bigint>;
  /** decimals keyed by token address (lowercase) */
  decimals?: Record<string, bigint>;
  /** pre-encoded symbol() return keyed by token address (lowercase) */
  symbols?: Record<string, string>;
}

/** eth_call dispatcher keyed by selector, like a real token contract. */
function makeEthCall(book: EthCallBook) {
  return (params: unknown[]): unknown => {
    const call = (params as [{ to: string; data: string }])[0];
    const to = call.to.toLowerCase();
    const data = call.data.toLowerCase();
    if (data.startsWith('0xdd62ed3e')) {
      const spender = `0x${data.slice(10 + 64 + 24)}`;
      const allowance = book.allowances?.[`${to}|${spender}`];
      if (allowance === undefined) throw new Error('execution reverted');
      return word(allowance);
    }
    if (data === '0x313ce567') {
      const d = book.decimals?.[to];
      if (d === undefined) throw new Error('execution reverted');
      return word(d);
    }
    if (data === '0x95d89b41') {
      const s = book.symbols?.[to];
      if (s === undefined) throw new Error('execution reverted');
      return s;
    }
    throw new Error(`unexpected eth_call data ${data}`);
  };
}

function coverageNote(scan: ApprovalScan): string | undefined {
  return scan.notes.find((n) => n.startsWith('Scanned the last'));
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('scanApprovals', () => {
  it('finds live approvals, sorts unlimited first, and reads token metadata', async () => {
    const rpc = fakeRpc({
      eth_blockNumber: () => LATEST,
      eth_getLogs: (params) => {
        const filter = (params as [{ toBlock: string }])[0];
        if (filter.toBlock !== LATEST) return []; // only the newest chunk has logs
        return [
          // same pair seen twice — lastSeenBlock must be the newest (9950)
          approvalLog(TOKEN_A, OWNER, SPENDER_1, 9910),
          approvalLog(TOKEN_A, OWNER, SPENDER_1, 9950),
          approvalLog(TOKEN_B, OWNER, SPENDER_2, 9990),
        ];
      },
      eth_call: makeEthCall({
        allowances: {
          [`${TOKEN_A}|${SPENDER_1}`]: MAX_UINT256,
          [`${TOKEN_B}|${SPENDER_2}`]: 123n * 10n ** 18n,
        },
        decimals: { [TOKEN_A]: 6n, [TOKEN_B]: 18n },
        symbols: {
          [TOKEN_A]: encodeAbiParameters([{ type: 'string' }], ['tUSD']),
          // bytes32-style symbol exercises the fallback decoder
          [TOKEN_B]: bytes32Symbol('WMON'),
        },
      }),
    });

    const scan = await scanApprovals(rpc, OWNER, { maxChunks: 2 });

    expect(scan.records).toHaveLength(2);

    // unlimited approval sorts first even though it was seen in an older block
    const [first, second] = scan.records;
    expect(first?.unlimited).toBe(true);
    expect(first?.allowanceRaw).toBe(MAX_UINT256);
    expect(first?.spender.toLowerCase()).toBe(SPENDER_1);
    expect(first?.lastSeenBlock).toBe(9950n);
    expect(first?.token.symbol).toBe('tUSD');
    expect(first?.token.decimals).toBe(6);
    expect(first?.token.address?.toLowerCase()).toBe(TOKEN_A);

    expect(second?.unlimited).toBe(false);
    expect(second?.allowanceRaw).toBe(123n * 10n ** 18n);
    expect(second?.spender.toLowerCase()).toBe(SPENDER_2);
    expect(second?.lastSeenBlock).toBe(9990n);
    expect(second?.token.symbol).toBe('WMON');
    expect(second?.token.decimals).toBe(18);

    // scan window: 2 chunks of 100 blocks ending at the tip
    expect(scan.toBlock).toBe(10000n);
    expect(scan.fromBlock).toBe(9801n);
    expect(scan.scannedBlocks).toBe(200);
    expect(coverageNote(scan)).toContain('200');
  });

  it('drops a pair whose live allowance is now zero (revoked or spent)', async () => {
    const rpc = fakeRpc({
      eth_blockNumber: () => LATEST,
      eth_getLogs: (params) => {
        const filter = (params as [{ toBlock: string }])[0];
        if (filter.toBlock !== LATEST) return [];
        return [approvalLog(TOKEN_A, OWNER, SPENDER_1, 9950)];
      },
      // allowance answers 0 — no metadata handlers needed because the pair
      // must be dropped before any metadata lookup happens
      eth_call: makeEthCall({ allowances: { [`${TOKEN_A}|${SPENDER_1}`]: 0n } }),
    });

    const scan = await scanApprovals(rpc, OWNER, { maxChunks: 1 });

    expect(scan.records).toHaveLength(0);
    expect(coverageNote(scan)).toBeDefined();
  });

  it('skips a failing chunk silently and keeps scanning the rest', async () => {
    const rpc = fakeRpc({
      eth_blockNumber: () => LATEST,
      eth_getLogs: (params) => {
        const filter = (params as [{ toBlock: string }])[0];
        if (filter.toBlock === LATEST) throw new Error('query returned more than 100 results');
        return [approvalLog(TOKEN_A, OWNER, SPENDER_1, 9850)];
      },
      eth_call: makeEthCall({
        allowances: { [`${TOKEN_A}|${SPENDER_1}`]: 7n },
        decimals: { [TOKEN_A]: 18n },
        symbols: { [TOKEN_A]: encodeAbiParameters([{ type: 'string' }], ['tUSD']) },
      }),
    });

    const scan = await scanApprovals(rpc, OWNER, { maxChunks: 2 });

    expect(scan.records).toHaveLength(1);
    expect(scan.records[0]?.lastSeenBlock).toBe(9850n);
    // the failed chunk still counts toward the advertised window
    expect(scan.fromBlock).toBe(9801n);
    expect(scan.scannedBlocks).toBe(200);
  });

  it('ignores logs that do not have exactly 3 topics', async () => {
    let allowanceCalls = 0;
    const rpc = fakeRpc({
      eth_blockNumber: () => LATEST,
      eth_getLogs: () => [
        {
          address: TOKEN_A,
          // only 2 topics — not an ERC-20 Approval(owner, spender) shape
          topics: [APPROVAL_TOPIC, topicAddr(OWNER)],
          data: word(1n),
          blockNumber: '0x26de',
        },
      ],
      eth_call: () => {
        allowanceCalls += 1;
        throw new Error('should never be called');
      },
    });

    const scan = await scanApprovals(rpc, OWNER, { maxChunks: 1 });

    expect(scan.records).toHaveLength(0);
    expect(allowanceCalls).toBe(0);
  });

  it('falls back to a shortened address and 18 decimals when metadata reads fail', async () => {
    const rpc = fakeRpc({
      eth_blockNumber: () => LATEST,
      eth_getLogs: (params) => {
        const filter = (params as [{ toBlock: string }])[0];
        if (filter.toBlock !== LATEST) return [];
        return [approvalLog(TOKEN_A, OWNER, SPENDER_1, 9950)];
      },
      // allowance answers; decimals()/symbol() revert
      eth_call: makeEthCall({ allowances: { [`${TOKEN_A}|${SPENDER_1}`]: 7n } }),
    });

    const scan = await scanApprovals(rpc, OWNER, { maxChunks: 1 });

    expect(scan.records).toHaveLength(1);
    const token = scan.records[0]!.token;
    expect(token.decimals).toBe(18);
    expect(token.symbol.toLowerCase()).toBe(shortAddress(TOKEN_A).toLowerCase());
    expect(scan.notes.some((n) => n.includes('did not report'))).toBe(true);
  });

  it('caps live verification at 40 pairs, keeps the newest, and says so', async () => {
    // 41 unique spenders on one token, seen at blocks 9901..9941 — the
    // oldest one (block 9901, spender ending "a0") must be dropped.
    const spenderAt = (i: number): string => `0x${(0xa0 + i).toString(16).padStart(40, '0')}`;
    const logs = Array.from({ length: 41 }, (_, i) =>
      approvalLog(TOKEN_A, OWNER, spenderAt(i), 9901 + i),
    );
    const rpc = fakeRpc({
      eth_blockNumber: () => LATEST,
      eth_getLogs: () => logs,
      eth_call: (params) => {
        const call = (params as [{ to: string; data: string }])[0];
        const data = call.data.toLowerCase();
        if (data.startsWith('0xdd62ed3e')) return word(5n); // every pair is live
        if (data === '0x313ce567') return word(18n);
        if (data === '0x95d89b41') return encodeAbiParameters([{ type: 'string' }], ['BULK']);
        throw new Error(`unexpected eth_call data ${data}`);
      },
    });

    const scan = await scanApprovals(rpc, OWNER, { maxChunks: 1 });

    expect(scan.records).toHaveLength(40);
    // newest pair first (none are unlimited)
    expect(scan.records[0]?.lastSeenBlock).toBe(9941n);
    // the oldest pair was dropped
    expect(scan.records.some((r) => r.spender.toLowerCase() === spenderAt(0))).toBe(false);
    expect(scan.notes.some((n) => n.includes('skipped 1'))).toBe(true);
  });

  it('sends a correctly padded lowercase owner topic and allowance calldata', async () => {
    const getLogsFilters: Array<{ fromBlock: string; toBlock: string; topics: string[] }> = [];
    const ethCallDatas: string[] = [];
    const rpc = fakeRpc({
      eth_blockNumber: () => LATEST,
      eth_getLogs: (params) => {
        const filter = params[0] as { fromBlock: string; toBlock: string; topics: string[] };
        getLogsFilters.push(filter);
        return filter.toBlock === LATEST ? [approvalLog(TOKEN_A, OWNER, SPENDER_1, 9950)] : [];
      },
      eth_call: (params) => {
        const call = (params as [{ to: string; data: string }])[0];
        ethCallDatas.push(call.data);
        if (call.data.toLowerCase().startsWith('0xdd62ed3e')) return word(1n);
        throw new Error('execution reverted'); // metadata falls back gracefully
      },
    });

    const scan = await scanApprovals(rpc, OWNER, { maxChunks: 2 });

    // OWNER is mixed-case on purpose: the topic must be lowercased and
    // left-padded to exactly 32 bytes.
    const expectedOwnerTopic = `0x${'0'.repeat(24)}${OWNER.slice(2).toLowerCase()}`;
    expect(getLogsFilters).toHaveLength(2);
    expect(getLogsFilters[0]?.topics).toEqual([APPROVAL_TOPIC, expectedOwnerTopic]);
    expect(getLogsFilters[1]?.topics).toEqual([APPROVAL_TOPIC, expectedOwnerTopic]);
    // 100-block chunks walking backwards from the tip
    expect(getLogsFilters[0]?.fromBlock).toBe('0x26ad'); // 9901
    expect(getLogsFilters[0]?.toBlock).toBe('0x2710'); // 10000
    expect(getLogsFilters[1]?.fromBlock).toBe('0x2649'); // 9801
    expect(getLogsFilters[1]?.toBlock).toBe('0x26ac'); // 9900

    // allowance(owner, spender) calldata: selector + two padded words
    expect(ethCallDatas[0]).toBe(`0xdd62ed3e${padWord(OWNER)}${padWord(SPENDER_1)}`);
    expect(scan.records).toHaveLength(1);
  });

  it('stops at block 0 when the chain is younger than the scan window', async () => {
    const rpc = fakeRpc({
      eth_blockNumber: () => '0x96', // block 150
      eth_getLogs: () => [],
    });

    const scan = await scanApprovals(rpc, OWNER, { maxChunks: 40 });

    expect(scan.fromBlock).toBe(0n);
    expect(scan.toBlock).toBe(150n);
    expect(scan.scannedBlocks).toBe(151);
    expect(coverageNote(scan)).toContain('151');
  });
});
