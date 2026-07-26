import { describe, expect, it } from 'vitest';
import { parseIntent } from '../src/lib/intent';
import { buildTx } from '../src/lib/txbuilder';
import { simulateTx } from '../src/lib/simulate';
import { assessRisks } from '../src/lib/risk';
import { scorePlan } from '../src/lib/score';
import { composeExplanation } from '../src/lib/explain';
import { comparePostFlight } from '../src/lib/postflight';
import { flightReportMarkdown } from '../src/lib/report';
import { createRegistry } from '../src/lib/tokens';
import type { ChainReader } from '../src/lib/tokens';
import type { RpcCallFn } from '../src/lib/simulate';
import type { Address, Hex, RiskContext, TokenInfo } from '../src/lib/types';
import type { MinedReceipt } from '../src/lib/wallet';

/**
 * End-to-end tests of the whole pipeline with fakes at the network edge:
 * text → parse → build → simulate → risk → score → explain → post-flight
 * → report. These catch contract breaks between modules that per-module
 * unit tests cannot see.
 */

const USER = '0x1111111111111111111111111111111111111111' as Address;
const BOB = '0x2222222222222222222222222222222222222222' as Address;
const SPENDER = '0x3333333333333333333333333333333333333333' as Address;
const TOKEN = '0x4444444444444444444444444444444444444444' as Address;

const tUSD: TokenInfo = { address: TOKEN, symbol: 'tUSD', decimals: 6 };

const reader: ChainReader = {
  getNativeBalance: async () => 5_000000000000000000n, // 5 MON
  fetchTokenInfo: async () => tUSD,
  erc20BalanceOf: async () => 250_000000n, // 250 tUSD
};

/** 32-byte left-padded topic for an address. */
function topic(addr: string): string {
  return `0x000000000000000000000000${addr.slice(2).toLowerCase()}`;
}

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/** Build a fake RPC that returns a trace with the given logs. */
function fakeRpc(options: {
  logs?: { address: string; topics: string[]; data: string }[];
  error?: string;
  output?: string;
  decimals?: number;
  symbolHex?: string;
}): RpcCallFn {
  return async (method, params) => {
    if (method === 'debug_traceCall') {
      return {
        type: 'CALL',
        from: USER,
        to: TOKEN,
        gas: '0x100000',
        gasUsed: '0xc350',
        input: '0x',
        error: options.error,
        output: options.output,
        logs: options.logs ?? [],
      };
    }
    if (method === 'eth_estimateGas') return '0xd6d8';
    if (method === 'eth_gasPrice') return '0x3b9aca00'; // 1 gwei
    if (method === 'eth_call') {
      const call = (params as [{ data: string }])[0];
      if (call.data === '0x313ce567') {
        const d = (options.decimals ?? 6).toString(16).padStart(64, '0');
        return `0x${d}`;
      }
      if (call.data === '0x95d89b41') {
        return (
          options.symbolHex ??
          // ABI-encoded "tUSD"
          '0x0000000000000000000000000000000000000000000000000000000000000020' +
            '0000000000000000000000000000000000000000000000000000000000000004' +
            '7455534400000000000000000000000000000000000000000000000000000000'
        );
      }
    }
    throw new Error(`unexpected method ${method}`);
  };
}

describe('pipeline: native transfer, happy path', () => {
  it('carries a plain-language intent all the way to a verified report', async () => {
    const parsed = parseIntent(`send 0.5 MON to ${BOB}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const tx = await buildTx(parsed.intent, USER, {
      registry: createRegistry([]),
      reader,
    });
    expect(tx.kind).toBe('native-transfer');
    expect(tx.value).toBe(500000000000000000n);
    expect(tx.data).toBe('0x');
    expect(tx.to).toBe(BOB);

    const rpc: RpcCallFn = async (method) => {
      if (method === 'debug_traceCall') {
        return {
          type: 'CALL',
          from: USER,
          to: BOB,
          value: '0x6f05b59d3b20000',
          gas: '0x5208',
          gasUsed: '0x5208',
          input: '0x',
        };
      }
      if (method === 'eth_estimateGas') return '0x5208';
      if (method === 'eth_gasPrice') return '0x3b9aca00';
      throw new Error('unexpected');
    };

    const sim = await simulateTx(tx, rpc);
    expect(sim.ok).toBe(true);
    // Both sides of the transfer must be accounted for.
    const mine = sim.assetChanges.find(
      (c) => c.party.toLowerCase() === USER && c.token.address === null,
    );
    const theirs = sim.assetChanges.find(
      (c) => c.party.toLowerCase() === BOB && c.token.address === null,
    );
    expect(mine?.deltaRaw).toBe(-500000000000000000n);
    expect(theirs?.deltaRaw).toBe(500000000000000000n);

    const ctx: RiskContext = {
      senderBalanceWei: 5_000000000000000000n,
      counterpartyIsContract: false,
      counterpartyTxCount: 42,
      counterpartyBalanceWei: 1_000000000000000000n,
    };
    const risks = assessRisks(tx, sim, ctx);
    expect(risks.some((r) => r.severity === 'danger')).toBe(false);

    const readiness = scorePlan(sim, risks);
    expect(readiness.band).toBe('clear');

    const explanation = composeExplanation(tx, sim, risks, USER);
    expect(explanation.headline).toMatch(/0\.5 MON/);
    expect(explanation.bullets.join(' ')).toMatch(/You send/);

    // Post-flight: a receipt that matches the simulation exactly.
    const receipt: MinedReceipt = {
      status: 'success',
      gasUsed: 21000n,
      effectiveGasPrice: 1000000000n,
      blockNumber: 100n,
      logs: [],
    };
    const check = comparePostFlight(tx, sim, receipt, USER);
    expect(check.matched).toBe(true);

    const report = flightReportMarkdown({
      networkLabel: 'Monad Testnet',
      tx,
      sim,
      risks,
      explanation,
      postflight: check,
      hash: '0xabc' as Hex,
      explorerHref: 'https://example/tx/0xabc',
      generatedAt: '2026-07-26T00:00:00.000Z',
    });
    expect(report).toContain('Monad Testnet');
    expect(report).toContain('Post-flight');
    expect(report).toContain('0.5 MON');
  });
});

describe('pipeline: unlimited approval to a personal wallet', () => {
  it('produces both danger findings and a grounded score', async () => {
    const parsed = parseIntent(`approve ${SPENDER} to spend unlimited tUSD`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const tx = await buildTx(parsed.intent, USER, {
      registry: createRegistry([tUSD]),
      reader,
    });
    expect(tx.kind).toBe('erc20-approve');
    expect(tx.to).toBe(TOKEN);
    expect(tx.amountRaw).toBe((1n << 256n) - 1n);

    const MAX = 'f'.repeat(64);
    const sim = await simulateTx(
      tx,
      fakeRpc({
        logs: [
          {
            address: TOKEN,
            topics: [
              '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925',
              topic(USER),
              topic(SPENDER),
            ],
            data: `0x${MAX}`,
          },
        ],
      }),
    );
    expect(sim.ok).toBe(true);
    expect(sim.approvalChanges).toHaveLength(1);
    expect(sim.approvalChanges[0].unlimited).toBe(true);

    const risks = assessRisks(tx, sim, {
      senderBalanceWei: 5_000000000000000000n,
      counterpartyIsContract: false, // a personal wallet — the drainer shape
      tokenIsContract: true,
    });
    const ids = risks.map((r) => r.id);
    expect(ids).toContain('unlimited-approval');
    expect(ids).toContain('approval-to-eoa');

    const readiness = scorePlan(sim, risks);
    expect(readiness.band).toBe('grounded');
    expect(readiness.counts.danger).toBeGreaterThanOrEqual(2);

    const explanation = composeExplanation(tx, sim, risks, USER);
    // The explanation must say "ALL" in plain words, not "unlimited allowance".
    expect(explanation.bullets.join(' ')).toMatch(/ALL of your/);
    expect(explanation.bullets.join(' ')).not.toMatch(/allowance/i);
  });
});

describe('pipeline: a transaction that would revert', () => {
  it('detects the revert, names the reason, and grounds the score', async () => {
    const parsed = parseIntent(`send 1000 tUSD to ${BOB}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const tx = await buildTx(parsed.intent, USER, {
      registry: createRegistry([tUSD]),
      reader,
    });

    // Error(string) "insufficient balance"
    const reasonHex =
      '0x08c379a0' +
      '0000000000000000000000000000000000000000000000000000000000000020' +
      '0000000000000000000000000000000000000000000000000000000000000014' +
      '696e73756666696369656e742062616c616e6365000000000000000000000000';

    const sim = await simulateTx(
      tx,
      fakeRpc({ error: 'execution reverted', output: reasonHex }),
    );
    expect(sim.ok).toBe(false);
    expect(sim.revertReason).toBe('insufficient balance');
    // A reverting transaction must never claim assets moved.
    expect(sim.assetChanges).toHaveLength(0);

    const risks = assessRisks(tx, sim, { senderBalanceWei: 5_000000000000000000n });
    expect(risks.map((r) => r.id)).toContain('simulation-reverted');

    const readiness = scorePlan(sim, risks);
    expect(readiness.band).toBe('grounded');
    expect(readiness.advice).toMatch(/would fail/i);

    const explanation = composeExplanation(tx, sim, risks, USER);
    expect(explanation.headline).toMatch(/would fail/i);
    expect(explanation.outcome).toMatch(/insufficient balance/);
  });
});

describe('pipeline: 6-decimal token math survives the whole chain', () => {
  it('never shows an 18-decimal number for a 6-decimal token', async () => {
    const parsed = parseIntent(`send 12.5 tUSD to ${BOB}`);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const tx = await buildTx(parsed.intent, USER, {
      registry: createRegistry([tUSD]),
      reader,
    });
    // 12.5 with 6 decimals = 12_500000
    expect(tx.amountRaw).toBe(12_500000n);
    expect(tx.summary).toContain('12.5 tUSD');

    const amountHex = (12_500000n).toString(16).padStart(64, '0');
    const sim = await simulateTx(
      tx,
      fakeRpc({
        logs: [
          {
            address: TOKEN,
            topics: [TRANSFER_TOPIC, topic(USER), topic(BOB)],
            data: `0x${amountHex}`,
          },
        ],
      }),
    );

    const mine = sim.assetChanges.find((c) => c.party.toLowerCase() === USER);
    expect(mine?.token.decimals).toBe(6);
    expect(mine?.deltaRaw).toBe(-12_500000n);

    const explanation = composeExplanation(tx, sim, [], USER);
    const text = explanation.bullets.join(' ');
    expect(text).toContain('12.5 tUSD');
    // The 18-decimal reading of 12500000 would be 0.0000000000125.
    expect(text).not.toContain('0.0000000000125');
  });
});

describe('pipeline: post-flight catches reality diverging from the simulation', () => {
  it('flags a receipt whose token movement differs from what was promised', async () => {
    const parsed = parseIntent(`send 10 tUSD to ${BOB}`);
    if (!parsed.ok) throw new Error('parse failed');

    const tx = await buildTx(parsed.intent, USER, {
      registry: createRegistry([tUSD]),
      reader,
    });

    const promised = (10_000000n).toString(16).padStart(64, '0');
    const sim = await simulateTx(
      tx,
      fakeRpc({
        logs: [
          {
            address: TOKEN,
            topics: [TRANSFER_TOPIC, topic(USER), topic(BOB)],
            data: `0x${promised}`,
          },
        ],
      }),
    );
    expect(sim.assetChanges.length).toBeGreaterThan(0);

    // The mined receipt moved only 1 tUSD — a fee-on-transfer token, say.
    const actual = (1_000000n).toString(16).padStart(64, '0');
    const receipt: MinedReceipt = {
      status: 'success',
      gasUsed: 55000n,
      effectiveGasPrice: 1000000000n,
      blockNumber: 101n,
      logs: [
        {
          address: TOKEN,
          topics: [TRANSFER_TOPIC, topic(USER), topic(BOB)] as Hex[],
          data: `0x${actual}` as Hex,
        },
      ],
    };

    const check = comparePostFlight(tx, sim, receipt, USER);
    expect(check.matched).toBe(false);
    const movement = check.lines.find((l) => l.label.includes('tUSD'));
    expect(movement?.matched).toBe(false);
  });
});
