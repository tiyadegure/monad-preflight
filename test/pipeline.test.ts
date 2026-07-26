import { describe, expect, it } from 'vitest';
import { assessTransaction, rpcFactReader } from '../src/lib/pipeline';
import type { FactReader } from '../src/lib/pipeline';
import type { RpcCallFn } from '../src/lib/simulate';
import type { Address, Hex, PreparedTx } from '../src/lib/types';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
const BOB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as Address;

const nativeTx: PreparedTx = {
  from: ALICE,
  to: BOB,
  data: '0x' as Hex,
  value: 10n ** 18n,
  kind: 'native-transfer',
  summary: 'Send 1 MON to 0xbbbb…bbbb',
  counterparty: BOB,
};

type Handlers = Record<string, (params: unknown[]) => unknown>;

function fakeRpc(handlers: Handlers): RpcCallFn {
  return async (method, params) => {
    const handler = handlers[method];
    if (!handler) throw new Error(`the method ${method} does not exist/is not available`);
    return handler(params);
  };
}

/** A trace of a plain, successful 1-MON transfer. */
const traceHandlers: Handlers = {
  debug_traceCall: () => ({
    type: 'CALL',
    from: ALICE,
    to: BOB,
    gas: '0x7530',
    gasUsed: '0x5208',
    input: '0x',
    value: `0x${(10n ** 18n).toString(16)}`,
  }),
  eth_estimateGas: () => '0x5208',
  eth_gasPrice: () => '0x3b9aca00',
};

/** A reader whose every answer is programmable, defaulting to benign. */
function fakeReader(overrides: Partial<FactReader> = {}): FactReader {
  return {
    getBalance: async () => 10n ** 19n,
    getCode: async () => '0x',
    getTransactionCount: async () => 42,
    getStorageAt: async () => '0x',
    call: async () => '0x',
    ...overrides,
  };
}

const FAST_OPTS = { includeFees: false, includeFingerprint: false };

/* ------------------------------------------------------------------ */
/* The pipeline                                                        */
/* ------------------------------------------------------------------ */

describe('assessTransaction', () => {
  it('produces a complete assessment for a healthy native transfer', async () => {
    const a = await assessTransaction(
      nativeTx,
      { rpc: fakeRpc(traceHandlers), reader: fakeReader() },
      FAST_OPTS,
    );
    expect(a.sim.ok).toBe(true);
    expect(a.readiness.score).toBeGreaterThan(0);
    expect(a.explanation.headline.length).toBeGreaterThan(0);
    expect(a.riskContext.senderBalanceWei).toBe(10n ** 19n);
    expect(a.riskContext.counterpartyIsContract).toBe(false);
    expect(a.fees).toBeNull();
    expect(a.counterparty).toBeNull();
  });

  it('treats failed fact reads as "unknown", never as clean', async () => {
    const a = await assessTransaction(
      nativeTx,
      {
        rpc: fakeRpc(traceHandlers),
        reader: fakeReader({
          getCode: async () => {
            throw new Error('rpc down');
          },
          getTransactionCount: async () => {
            throw new Error('rpc down');
          },
        }),
      },
      FAST_OPTS,
    );
    expect(a.riskContext.counterpartyIsContract).toBeUndefined();
    expect(a.riskContext.counterpartyTxCount).toBeUndefined();
    // Reputation needs counterparty facts — with unknowns it must not run
    // and must not have invented reassurance.
    expect(a.reputationFindings).toHaveLength(0);
  });

  it('rejects when the sender balance cannot be read — the rules need it', async () => {
    await expect(
      assessTransaction(
        nativeTx,
        {
          rpc: fakeRpc(traceHandlers),
          reader: fakeReader({
            getBalance: async (addr) => {
              if (addr === ALICE) throw new Error('rpc down');
              return 0n;
            },
          }),
        },
        FAST_OPTS,
      ),
    ).rejects.toThrow();
  });

  it('flags a delegated sender wallet (EIP-7702) as a danger', async () => {
    const delegatedCode =
      `0xef0100${'11'.repeat(20)}` as Hex; // 0xef0100 || 20-byte address
    const a = await assessTransaction(
      nativeTx,
      {
        rpc: fakeRpc(traceHandlers),
        reader: fakeReader({
          getCode: async (addr) => (addr === ALICE ? delegatedCode : '0x'),
        }),
      },
      FAST_OPTS,
    );
    const selfFinding = a.risks.find((r) => r.id === 'self-delegated');
    expect(selfFinding).toBeDefined();
    expect(selfFinding?.severity).toBe('danger');
  });

  it('warns when the recipient of a transfer is a delegated wallet', async () => {
    const delegatedCode = `0xef0100${'22'.repeat(20)}` as Hex;
    const a = await assessTransaction(
      nativeTx,
      {
        rpc: fakeRpc(traceHandlers),
        reader: fakeReader({
          getCode: async (addr) => (addr === BOB ? delegatedCode : '0x'),
        }),
      },
      FAST_OPTS,
    );
    expect(a.risks.some((r) => r.id === 'recipient-delegated')).toBe(true);
  });

  it('the optional extras degrade honestly without blocking', async () => {
    // No eth_feeHistory handler: readFees degrades INTERNALLY to an
    // honest "could not compare" reading — the pipeline must pass that
    // through rather than blocking or fabricating a verdict.
    const a = await assessTransaction(nativeTx, {
      rpc: fakeRpc(traceHandlers),
      reader: fakeReader({
        getStorageAt: async () => {
          throw new Error('nope');
        },
      }),
    });
    expect(a.sim.ok).toBe(true);
    expect(a.fees?.verdict).toMatch(/could not compare/i);
    expect(a.fees?.percentileVsRecent).toBeNull();
  });

  it('keeps rule findings and reputation findings deduplicated', async () => {
    const a = await assessTransaction(
      nativeTx,
      { rpc: fakeRpc(traceHandlers), reader: fakeReader() },
      FAST_OPTS,
    );
    const titles = a.risks.map((r) => r.title);
    expect(new Set(titles).size).toBe(titles.length);
  });
});

/* ------------------------------------------------------------------ */
/* rpcFactReader                                                       */
/* ------------------------------------------------------------------ */

describe('rpcFactReader', () => {
  it('adapts raw JSON-RPC answers into typed facts', async () => {
    const reader = rpcFactReader(
      fakeRpc({
        eth_getBalance: () => '0xde0b6b3a7640000', // 1 MON
        eth_getCode: () => '0x6001',
        eth_getTransactionCount: () => '0x2a',
        eth_getStorageAt: () => `0x${'0'.repeat(64)}`,
        eth_call: () => '0x01',
      }),
    );
    expect(await reader.getBalance(ALICE)).toBe(10n ** 18n);
    expect(await reader.getCode(ALICE)).toBe('0x6001');
    expect(await reader.getTransactionCount(ALICE)).toBe(42);
    expect(await reader.call(BOB, '0x')).toBe('0x01');
  });

  it('propagates RPC failures so the pipeline can mark facts unknown', async () => {
    const reader = rpcFactReader(fakeRpc({}));
    await expect(reader.getCode(ALICE)).rejects.toThrow();
  });
});

/* ------------------------------------------------------------------ */
/* Spoofing wiring + timings                                           */
/* ------------------------------------------------------------------ */

describe('assessTransaction — spoofing defenses and timings', () => {
  it('flags an address-poisoning lookalike fed via knownAddresses', async () => {
    const real = '0xbbbb00000000000000000000000000000000bbbb';
    // nativeTx sends to BOB (0xbbbb…bbbb) — craft a "known" address whose
    // visible ends match BOB's truncated rendering.
    const a = await assessTransaction(
      nativeTx,
      { rpc: fakeRpc(traceHandlers), reader: fakeReader() },
      { ...FAST_OPTS, knownAddresses: [real] },
    );
    const f = a.risks.find((r) => r.id === 'address-poisoning-lookalike');
    expect(f?.severity).toBe('danger');
  });

  it('reports measured stage timings', async () => {
    const a = await assessTransaction(
      nativeTx,
      { rpc: fakeRpc(traceHandlers), reader: fakeReader() },
      FAST_OPTS,
    );
    expect(a.timings.simulateMs).toBeGreaterThanOrEqual(0);
    expect(a.timings.factsMs).toBeGreaterThanOrEqual(0);
    expect(a.timings.extrasMs).toBeGreaterThanOrEqual(0);
    expect(a.timings.totalMs).toBeGreaterThanOrEqual(
      Math.max(a.timings.simulateMs, a.timings.factsMs),
    );
  });
});
