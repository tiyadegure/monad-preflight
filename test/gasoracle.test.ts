/**
 * Tests for the fee intelligence module (readFees).
 *
 * Everything runs against a fake RpcCallFn — no network, no timers.
 * The fake routes by method name and records every call so tests can
 * assert exactly what was asked of the RPC.
 */

import { describe, expect, it } from 'vitest';
import type { RpcCallFn } from '../src/lib/simulate';
import { readFees } from '../src/lib/gasoracle';

/* ---- fake RPC ---- */

type Handler = (params: unknown[]) => unknown;

interface FakeRpc {
  rpc: RpcCallFn;
  calls: { method: string; params: unknown[] }[];
}

/** Route by method; a missing handler throws like an unsupported method. */
function makeRpc(handlers: Record<string, Handler>): FakeRpc {
  const calls: { method: string; params: unknown[] }[] = [];
  const rpc: RpcCallFn = async (method, params) => {
    calls.push({ method, params });
    const handler = handlers[method];
    if (!handler) throw new Error(`the method ${method} does not exist`);
    return handler(params);
  };
  return { rpc, calls };
}

const hex = (n: number | bigint): string => `0x${n.toString(16)}`;

/** n reward rows whose 50th-percentile entry is the given value. */
function rewardRows(count: number, fifty: string): string[][] {
  return Array.from({ length: count }, () => ['0x1', fifty, '0x9']);
}

/* ---- tests ---- */

describe('readFees — fee history path', () => {
  it('prices a rising fee series: exact percentile, verdict, and total', async () => {
    // 21 base fees, 100..120 wei — the last (next block) is the highest.
    const baseFeePerGas = Array.from({ length: 21 }, (_, i) => hex(100 + i));
    // 16 blocks tipped nothing; 4 usable median tips 1,3,5,7 → median (3+5)/2 = 4.
    const reward = [
      ...rewardRows(16, '0x0'),
      ...rewardRows(1, '0x1'),
      ...rewardRows(1, '0x3'),
      ...rewardRows(1, '0x5'),
      ...rewardRows(1, '0x7'),
    ];
    const gasUsedRatio = Array.from({ length: 20 }, () => 0.5);
    const { rpc, calls } = makeRpc({
      eth_feeHistory: () => ({ baseFeePerGas, reward, gasUsedRatio }),
    });

    const reading = await readFees(rpc, 21_000n);

    expect(reading.baseFeeWei).toBe(120n);
    expect(reading.priorityFeeWei).toBe(4n);
    expect(reading.totalFeeWei).toBe((120n + 4n) * 21_000n); // 2,604,000 wei
    // Mid-rank among 21 entries: (20 below + 0.5) / 21 → 97.6 → 98.
    expect(reading.percentileVsRecent).toBe(98);
    expect(reading.verdict).toBe('Fees are running high right now.');
    expect(reading.advice).toBe(
      'If this is not urgent, waiting a few minutes will probably cost less.',
    );
    expect(reading.notes).toEqual([]); // half-full blocks: no congestion note

    // The request shape is part of the contract: 20 blocks, three percentiles.
    expect(calls[0]).toEqual({
      method: 'eth_feeHistory',
      params: ['0x14', 'latest', [10, 50, 90]],
    });
    expect(calls).toHaveLength(1); // no fallback call happened
  });

  it('reads a quiet network: low percentile, quiet verdict, no advice', async () => {
    // Falling fees — the next block's base fee is the lowest of the lot.
    const baseFeePerGas = Array.from({ length: 21 }, (_, i) => hex(120 - i));
    const { rpc } = makeRpc({
      eth_feeHistory: () => ({
        baseFeePerGas,
        reward: rewardRows(20, '0x2'),
        gasUsedRatio: Array.from({ length: 20 }, () => 0.3),
      }),
    });

    const reading = await readFees(rpc, 21_000n);

    expect(reading.baseFeeWei).toBe(100n);
    expect(reading.percentileVsRecent).toBe(2); // (0 below + 0.5) / 21 → 2.4 → 2
    expect(reading.verdict).toBe('Network is quiet — fees are low right now.');
    expect(reading.advice).toBeNull();
  });

  it('calls a mid-pack fee normal and gives no advice', async () => {
    // 10 entries below 110, 10 above, and 110 itself last (the current fee).
    const baseFeePerGas = [
      ...Array.from({ length: 10 }, (_, i) => hex(100 + i)), // 100..109
      ...Array.from({ length: 10 }, (_, i) => hex(111 + i)), // 111..120
      hex(110),
    ];
    const { rpc } = makeRpc({
      eth_feeHistory: () => ({ baseFeePerGas, reward: [], gasUsedRatio: [] }),
    });

    const reading = await readFees(rpc, 21_000n);

    expect(reading.percentileVsRecent).toBe(50); // (10 below + 0.5) / 21 → 50
    expect(reading.verdict).toBe('Fees are about normal for this network.');
    expect(reading.advice).toBeNull();
  });

  it('treats all-zero reward rows as no tip data: priority is 0n', async () => {
    const baseFeePerGas = Array.from({ length: 21 }, () => hex(100));
    const reward = [...rewardRows(10, '0x0'), ...rewardRows(10, '0x')];
    const { rpc } = makeRpc({
      eth_feeHistory: () => ({ baseFeePerGas, reward, gasUsedRatio: [0.5] }),
    });

    const reading = await readFees(rpc, 30_000n);

    expect(reading.priorityFeeWei).toBe(0n);
    expect(reading.totalFeeWei).toBe(100n * 30_000n);
  });

  it('still works when the reward field is missing entirely', async () => {
    const { rpc } = makeRpc({
      eth_feeHistory: () => ({
        baseFeePerGas: Array.from({ length: 21 }, () => hex(100)),
        gasUsedRatio: [0.5],
      }),
    });

    const reading = await readFees(rpc, 21_000n);

    expect(reading.priorityFeeWei).toBe(0n);
    expect(reading.percentileVsRecent).not.toBeNull();
  });

  it('warns about nearly-full blocks only above the 0.8 threshold', async () => {
    const history = (ratio: number) => ({
      baseFeePerGas: Array.from({ length: 21 }, () => hex(100)),
      reward: rewardRows(20, '0x1'),
      gasUsedRatio: Array.from({ length: 20 }, () => ratio),
    });
    const congestionNote = 'Recent blocks have been nearly full, so fees may keep rising.';

    const busy = makeRpc({ eth_feeHistory: () => history(0.9) });
    const busyReading = await readFees(busy.rpc, 21_000n);
    expect(busyReading.notes).toContain(congestionNote);

    // Exactly 0.8 on average is NOT "nearly full" — strictly above only.
    const borderline = makeRpc({ eth_feeHistory: () => history(0.8) });
    const borderlineReading = await readFees(borderline.rpc, 21_000n);
    expect(borderlineReading.notes).not.toContain(congestionNote);
  });

  it('parses odd-length hex and treats "0x" as zero', async () => {
    // "0x" → 0, "0x5" → 5 (odd digit count), "0xabc" → 2748 (odd digit count).
    const { rpc } = makeRpc({
      eth_feeHistory: () => ({
        baseFeePerGas: ['0x', '0x5', '0xabc'],
        reward: [['0x1', '0x', '0x2']], // 50th-percentile "0x" → zero → ignored
        gasUsedRatio: [0.5],
      }),
    });

    const reading = await readFees(rpc, 1_000n);

    expect(reading.baseFeeWei).toBe(2748n);
    expect(reading.priorityFeeWei).toBe(0n);
    expect(reading.totalFeeWei).toBe(2748n * 1_000n);
    // Among [0, 5, 2748]: (2 below + 0.5) / 3 → 83.3 → 83, high enough for advice.
    expect(reading.percentileVsRecent).toBe(83);
    expect(reading.advice).not.toBeNull();
  });
});

describe('readFees — fallback path', () => {
  const expectFallbackShape = (reading: Awaited<ReturnType<typeof readFees>>): void => {
    expect(reading.percentileVsRecent).toBeNull();
    expect(reading.verdict).toBe('We could not compare this fee to recent blocks.');
    expect(reading.advice).toBeNull();
    expect(
      reading.notes.some((n) => n.includes('could not read recent fee data')),
    ).toBe(true);
  };

  it('falls back to the plain current fee when fee history throws', async () => {
    const { rpc, calls } = makeRpc({
      eth_feeHistory: () => {
        throw new Error('the method eth_feeHistory does not exist');
      },
      eth_gasPrice: () => '0x3b9aca00', // 1 gwei
    });

    const reading = await readFees(rpc, 50_000n);

    expect(reading.baseFeeWei).toBe(1_000_000_000n);
    expect(reading.priorityFeeWei).toBe(0n);
    expect(reading.totalFeeWei).toBe(1_000_000_000n * 50_000n);
    expectFallbackShape(reading);
    expect(calls.map((c) => c.method)).toEqual(['eth_feeHistory', 'eth_gasPrice']);
  });

  it('falls back when the response has no base-fee list', async () => {
    const { rpc, calls } = makeRpc({
      eth_feeHistory: () => ({ reward: [], gasUsedRatio: [] }), // baseFeePerGas missing
      eth_gasPrice: () => hex(200),
    });

    const reading = await readFees(rpc, 10n);

    expect(reading.baseFeeWei).toBe(200n);
    expect(reading.totalFeeWei).toBe(2_000n);
    expectFallbackShape(reading);
    expect(calls.map((c) => c.method)).toEqual(['eth_feeHistory', 'eth_gasPrice']);
  });

  it('falls back when the base-fee list is empty', async () => {
    const { rpc } = makeRpc({
      eth_feeHistory: () => ({ baseFeePerGas: [], reward: [], gasUsedRatio: [] }),
      eth_gasPrice: () => hex(200),
    });

    const reading = await readFees(rpc, 10n);

    expect(reading.baseFeeWei).toBe(200n);
    expectFallbackShape(reading);
  });

  it('falls back when the next block base fee is not readable hex', async () => {
    const { rpc } = makeRpc({
      eth_feeHistory: () => ({
        baseFeePerGas: [hex(100), 'not-hex'],
        reward: [],
        gasUsedRatio: [],
      }),
      eth_gasPrice: () => hex(300),
    });

    const reading = await readFees(rpc, 10n);

    expect(reading.baseFeeWei).toBe(300n);
    expectFallbackShape(reading);
  });

  it('survives eth_gasPrice failing too: zero fee plus an honest extra note', async () => {
    const { rpc } = makeRpc({
      eth_feeHistory: () => {
        throw new Error('nope');
      },
      eth_gasPrice: () => {
        throw new Error('also nope');
      },
    });

    const reading = await readFees(rpc, 21_000n);

    expect(reading.baseFeeWei).toBe(0n);
    expect(reading.totalFeeWei).toBe(0n);
    expectFallbackShape(reading);
    expect(reading.notes).toHaveLength(2);
  });
});
