import { describe, expect, it } from 'vitest';
import { createRiskApi } from '../workers/risk-api';
import type { RpcCallFn } from '../src/lib/simulate';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const HASH = `0x${'12'.repeat(32)}`;
const ONE_MON = 10n ** 18n;

type Handlers = Record<string, (params: unknown[]) => unknown>;

function fakeRpc(handlers: Handlers): RpcCallFn {
  return async (method, params) => {
    const handler = handlers[method];
    if (!handler) throw new Error(`the method ${method} does not exist/is not available`);
    return handler(params);
  };
}

/** Fake chain for a plain, successful 1-MON transfer. */
function healthyChain(extra: Handlers = {}): Handlers {
  return {
    debug_traceCall: () => ({
      type: 'CALL',
      from: ALICE,
      to: BOB,
      gas: '0x7530',
      gasUsed: '0x5208',
      input: '0x',
      value: `0x${ONE_MON.toString(16)}`,
    }),
    eth_estimateGas: () => '0x5208',
    eth_gasPrice: () => '0x3b9aca00',
    eth_getBalance: () => '0x8ac7230489e80000', // 10 MON
    eth_getCode: () => '0x',
    eth_getTransactionCount: () => '0x1',
    ...extra,
  };
}

function api(handlers: Handlers) {
  return createRiskApi({ makeRpc: () => fakeRpc(handlers) });
}

function post(path: string, body: unknown): Request {
  return new Request(`https://risk.example${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

/* ------------------------------------------------------------------ */
/* Routing and CORS                                                    */
/* ------------------------------------------------------------------ */

describe('risk api — routing', () => {
  it('describes itself at GET /v1/meta', async () => {
    const res = await api({}).fetch(new Request('https://risk.example/v1/meta'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(true);
    expect(body.deterministic).toBe(true);
    expect(body.stateless).toBe(true);
  });

  it('answers CORS preflight with 204', async () => {
    const res = await api({}).fetch(
      new Request('https://risk.example/v1/preflight', { method: 'OPTIONS' }),
    );
    expect(res.status).toBe(204);
    expect(res.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('404s unknown paths and 405s GET on POST endpoints', async () => {
    expect((await api({}).fetch(new Request('https://risk.example/nope'))).status).toBe(404);
    expect(
      (await api({}).fetch(new Request('https://risk.example/v1/preflight'))).status,
    ).toBe(405);
  });
});

/* ------------------------------------------------------------------ */
/* Preflight                                                           */
/* ------------------------------------------------------------------ */

describe('risk api — POST /v1/preflight', () => {
  it('returns the full assessment with bigints as decimal strings', async () => {
    const res = await api(healthyChain()).fetch(
      post('/v1/preflight', {
        network: 'testnet',
        from: ALICE,
        to: BOB,
        value: `0x${ONE_MON.toString(16)}`,
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(body.simulation.ok).toBe(true);
    expect(body.simulation.gasUsed).toBe('21000');
    expect(typeof body.readiness.score).toBe('number');
    expect(body.explanation.headline.length).toBeGreaterThan(0);
    expect(typeof body.verifyBlob).toBe('string');
    // The wire format never leaks raw bigints.
    expect(JSON.stringify(body)).not.toContain('$bigint"');
  });

  it('rejects a bad address with 400 and a plain-language error', async () => {
    const res = await api(healthyChain()).fetch(
      post('/v1/preflight', { network: 'testnet', from: '0x123', to: BOB }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.ok).toBe(false);
  });

  it('rejects an unknown network with 400', async () => {
    const res = await api(healthyChain()).fetch(
      post('/v1/preflight', { network: 'devnet', from: ALICE, to: BOB }),
    );
    expect(res.status).toBe(400);
  });

  it('answers 502 when the chain itself cannot be reached', async () => {
    const res = await api({}).fetch(
      post('/v1/preflight', { network: 'testnet', from: ALICE, to: BOB, value: '0x1' }),
    );
    expect(res.status).toBe(502);
  });
});

/* ------------------------------------------------------------------ */
/* Signature inspection                                                */
/* ------------------------------------------------------------------ */

describe('risk api — POST /v1/inspect-signature', () => {
  it('triages an EIP-7702 authorization', async () => {
    const res = await api({}).fetch(
      post('/v1/inspect-signature', {
        payload: { chainId: 0, address: BOB, nonce: 1 },
      }),
    );
    const body = (await res.json()) as Record<string, any>;
    expect(body.recognized).toBe(true);
    expect(body.kind).toBe('authorization');
    expect(Array.isArray(body.risks)).toBe(true);
  });

  it('accepts the payload as a JSON string too', async () => {
    const res = await api({}).fetch(
      post('/v1/inspect-signature', {
        payload: JSON.stringify({ chainId: 1, address: BOB, nonce: 1 }),
      }),
    );
    const body = (await res.json()) as Record<string, any>;
    expect(body.recognized).toBe(true);
  });

  it('says so plainly when the payload is not recognizable', async () => {
    const res = await api({}).fetch(
      post('/v1/inspect-signature', { payload: { hello: 'world' } }),
    );
    const body = (await res.json()) as Record<string, any>;
    expect(body.recognized).toBe(false);
    expect(typeof body.error).toBe('string');
  });
});

/* ------------------------------------------------------------------ */
/* Post-flight                                                         */
/* ------------------------------------------------------------------ */

describe('risk api — POST /v1/postflight', () => {
  async function preflightBlob(): Promise<string> {
    const res = await api(healthyChain()).fetch(
      post('/v1/preflight', {
        network: 'testnet',
        from: ALICE,
        to: BOB,
        value: `0x${ONE_MON.toString(16)}`,
      }),
    );
    const body = (await res.json()) as Record<string, any>;
    return body.verifyBlob as string;
  }

  it('verifies a mined receipt against the earlier simulation', async () => {
    const blob = await preflightBlob();
    const res = await api(
      healthyChain({
        eth_getTransactionReceipt: () => ({
          status: '0x1',
          gasUsed: '0x5208',
          effectiveGasPrice: '0x3b9aca00',
          blockNumber: '0x10',
          logs: [],
        }),
      }),
    ).fetch(post('/v1/postflight', { network: 'testnet', hash: HASH, verifyBlob: blob }));
    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('mined');
    expect(body.check.matched).toBe(true);
    expect(Array.isArray(body.check.lines)).toBe(true);
  });

  it('reports pending when the receipt does not exist yet', async () => {
    const blob = await preflightBlob();
    const res = await api(
      healthyChain({ eth_getTransactionReceipt: () => null }),
    ).fetch(post('/v1/postflight', { network: 'testnet', hash: HASH, verifyBlob: blob }));
    const body = (await res.json()) as Record<string, any>;
    expect(body.status).toBe('pending');
    expect(body.check).toBeNull();
  });

  it('rejects a verifyBlob it did not produce', async () => {
    const res = await api(healthyChain()).fetch(
      post('/v1/postflight', {
        network: 'testnet',
        hash: HASH,
        verifyBlob: '{"nonsense":true}',
      }),
    );
    expect(res.status).toBe(400);
  });
});

/* ------------------------------------------------------------------ */
/* Delegation                                                          */
/* ------------------------------------------------------------------ */

describe('risk api — GET /v1/delegation', () => {
  it('detects an EIP-7702 delegated wallet and raises the danger', async () => {
    const impl = '0x9999999999999999999999999999999999999999';
    const res = await api({
      eth_getCode: () => `0xef0100${impl.slice(2)}`,
    }).fetch(new Request(`https://risk.example/v1/delegation/testnet/${ALICE}`));
    const body = (await res.json()) as Record<string, any>;
    expect(body.delegated).toBe(true);
    expect((body.delegatedTo as string).toLowerCase()).toBe(impl);
    expect(body.risks.some((r: { id: string }) => r.id === 'self-delegated')).toBe(true);
  });

  it('reports a clean wallet as not delegated, with no findings', async () => {
    const res = await api({ eth_getCode: () => '0x' }).fetch(
      new Request(`https://risk.example/v1/delegation/testnet/${ALICE}`),
    );
    const body = (await res.json()) as Record<string, any>;
    expect(body.delegated).toBe(false);
    expect(body.delegatedTo).toBeNull();
    expect(body.risks).toHaveLength(0);
  });
});

describe('risk api — spoofing + timings surface', () => {
  it('returns measured timings and honors knownAddresses', async () => {
    const res = await api(healthyChain()).fetch(
      post('/v1/preflight', {
        network: 'testnet',
        from: ALICE,
        to: BOB,
        value: `0x${ONE_MON.toString(16)}`,
        // Same visible ends as BOB (0xbbbb…bbbb), different middle:
        knownAddresses: ['0xbbbb00000000000000000000000000000000bbbb'],
      }),
    );
    const body = (await res.json()) as Record<string, any>;
    expect(body.ok).toBe(true);
    expect(typeof body.timings.totalMs).toBe('number');
    expect(
      body.risks.some((r: { id: string }) => r.id === 'address-poisoning-lookalike'),
    ).toBe(true);
  });

  it('ignores malformed knownAddresses entries instead of failing', async () => {
    const res = await api(healthyChain()).fetch(
      post('/v1/preflight', {
        network: 'testnet',
        from: ALICE,
        to: BOB,
        value: '0x1',
        knownAddresses: ['not-an-address', 42, null],
      }),
    );
    expect(res.status).toBe(200);
  });
});
