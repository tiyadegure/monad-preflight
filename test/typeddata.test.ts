import { describe, expect, it } from 'vitest';
import { explainTypedData, looksLikeTypedData } from '../src/lib/typeddata';
import type { TypedDataExplanation } from '../src/lib/typeddata';
import { MAX_UINT256 } from '../src/lib/format';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const OWNER = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPENDER = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const TOKEN = '0xcccccccccccccccccccccccccccccccccccccccc';
const TOKEN_B = '0xdddddddddddddddddddddddddddddddddddddddd';
const PERMIT2_ADDR = '0x000000000022d473030f116ddee9f6b43ac78ba3';

// Fixed clock: 2025-07-26T03:20:00Z. Tests always inject nowMs.
const NOW_SEC = 1_753_500_000;
const NOW_MS = NOW_SEC * 1000;
const IN_ONE_DAY = NOW_SEC + 86_400;
const ONE_HOUR_AGO = NOW_SEC - 3_600;
const IN_NINETY_DAYS = NOW_SEC + 90 * 86_400;

const UINT160_MAX = (1n << 160n) - 1n;
const MONAD_CHAIN_ID = 10_143;

function permitRequest(overrides: {
  value?: string;
  deadline?: number;
  chainId?: number | string;
} = {}): Record<string, unknown> {
  return {
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Permit: [
        { name: 'owner', type: 'address' },
        { name: 'spender', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'nonce', type: 'uint256' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'Permit',
    domain: {
      name: 'Test USD',
      version: '1',
      chainId: overrides.chainId ?? MONAD_CHAIN_ID,
      verifyingContract: TOKEN,
    },
    message: {
      owner: OWNER,
      spender: SPENDER,
      value: overrides.value ?? '1000000000000000000',
      nonce: 0,
      deadline: overrides.deadline ?? IN_ONE_DAY,
    },
  };
}

function permit2SingleRequest(amount: string): Record<string, unknown> {
  return {
    types: { PermitSingle: [], PermitDetails: [] },
    primaryType: 'PermitSingle',
    domain: { name: 'Permit2', chainId: MONAD_CHAIN_ID, verifyingContract: PERMIT2_ADDR },
    message: {
      details: { token: TOKEN, amount, expiration: IN_ONE_DAY, nonce: 0 },
      spender: SPENDER,
      sigDeadline: IN_ONE_DAY,
    },
  };
}

function permit2BatchRequest(amounts: string[]): Record<string, unknown> {
  const tokens = [TOKEN, TOKEN_B];
  return {
    types: { PermitBatch: [], PermitDetails: [] },
    primaryType: 'PermitBatch',
    domain: { name: 'Permit2', chainId: MONAD_CHAIN_ID, verifyingContract: PERMIT2_ADDR },
    message: {
      details: amounts.map((amount, i) => ({
        token: tokens[i] ?? TOKEN,
        amount,
        expiration: IN_ONE_DAY,
        nonce: i,
      })),
      spender: SPENDER,
      sigDeadline: IN_ONE_DAY,
    },
  };
}

/** Narrow the union; fail loudly if we got an error instead. */
function ok(result: TypedDataExplanation | { error: string }): TypedDataExplanation {
  if ('error' in result) throw new Error(`unexpected error: ${result.error}`);
  return result;
}

function riskIds(explanation: TypedDataExplanation): string[] {
  return explanation.risks.map((r) => r.id);
}

/* ------------------------------------------------------------------ */
/* looksLikeTypedData                                                  */
/* ------------------------------------------------------------------ */

describe('looksLikeTypedData', () => {
  it('accepts a full typed-data request', () => {
    expect(looksLikeTypedData(permitRequest())).toBe(true);
  });

  it('accepts types + message + domain without primaryType', () => {
    expect(looksLikeTypedData({ types: {}, message: {}, domain: {} })).toBe(true);
  });

  it('accepts types + message + primaryType without domain', () => {
    expect(looksLikeTypedData({ types: {}, message: {}, primaryType: 'Order' })).toBe(true);
  });

  it('rejects non-objects, null, and arrays without throwing', () => {
    expect(looksLikeTypedData(null)).toBe(false);
    expect(looksLikeTypedData(undefined)).toBe(false);
    expect(looksLikeTypedData(42)).toBe(false);
    expect(looksLikeTypedData('{"types":{}}')).toBe(false);
    expect(looksLikeTypedData([])).toBe(false);
    expect(looksLikeTypedData([permitRequest()])).toBe(false);
  });

  it('rejects objects missing the required shape', () => {
    expect(looksLikeTypedData({})).toBe(false);
    expect(looksLikeTypedData({ types: {}, message: {} })).toBe(false); // no primaryType, no domain
    expect(looksLikeTypedData({ types: {}, primaryType: 'X' })).toBe(false); // no message
    expect(looksLikeTypedData({ message: {}, primaryType: 'X' })).toBe(false); // no types
    expect(looksLikeTypedData({ types: [], message: {}, primaryType: 'X' })).toBe(false); // types is array
    expect(looksLikeTypedData({ types: {}, message: 'hi', domain: {} })).toBe(false); // message not object
  });
});

/* ------------------------------------------------------------------ */
/* ERC-2612 Permit                                                     */
/* ------------------------------------------------------------------ */

describe('explainTypedData — ERC-2612 Permit', () => {
  it('flags an unlimited permit as danger', () => {
    const res = ok(
      explainTypedData(permitRequest({ value: MAX_UINT256.toString() }), { nowMs: NOW_MS }),
    );
    expect(res.kind).toBe('permit');
    expect(res.headline).toBe('This signature is a token approval — no transaction needed');
    const risk = res.risks.find((r) => r.id === 'unlimited-permit');
    expect(risk).toBeDefined();
    expect(risk?.severity).toBe('danger');
  });

  it('does not flag a limited permit with a near deadline', () => {
    const res = ok(explainTypedData(permitRequest(), { nowMs: NOW_MS }));
    expect(res.kind).toBe('permit');
    expect(riskIds(res)).not.toContain('unlimited-permit');
    expect(riskIds(res)).not.toContain('expired-permit');
    expect(riskIds(res)).not.toContain('long-deadline');
  });

  it('explains spender, raw amount caveat, and deadline in the bullets', () => {
    const res = ok(explainTypedData(permitRequest(), { nowMs: NOW_MS }));
    const joined = res.bullets.join('\n');
    expect(joined).toContain(SPENDER);
    expect(joined).toContain('1000000000000000000');
    expect(joined).toContain('raw token units');
    expect(joined).toContain("decimals");
    expect(joined).toContain(new Date(IN_ONE_DAY * 1000).toUTCString());
  });

  it('marks an already-past deadline as info', () => {
    const res = ok(explainTypedData(permitRequest({ deadline: ONE_HOUR_AGO }), { nowMs: NOW_MS }));
    const risk = res.risks.find((r) => r.id === 'expired-permit');
    expect(risk).toBeDefined();
    expect(risk?.severity).toBe('info');
  });

  it('marks a deadline more than 30 days out as caution', () => {
    const res = ok(
      explainTypedData(permitRequest({ deadline: IN_NINETY_DAYS }), { nowMs: NOW_MS }),
    );
    const risk = res.risks.find((r) => r.id === 'long-deadline');
    expect(risk).toBeDefined();
    expect(risk?.severity).toBe('caution');
  });

  it('reports the domain fields with chainId as a string', () => {
    const res = ok(explainTypedData(permitRequest(), { nowMs: NOW_MS }));
    expect(res.domain.name).toBe('Test USD');
    expect(res.domain.verifyingContract).toBe(TOKEN);
    expect(res.domain.chainId).toBe('10143');
  });
});

/* ------------------------------------------------------------------ */
/* Permit2                                                             */
/* ------------------------------------------------------------------ */

describe('explainTypedData — Permit2', () => {
  it('flags an unlimited single Permit2 approval as danger', () => {
    const res = ok(explainTypedData(permit2SingleRequest(UINT160_MAX.toString()), { nowMs: NOW_MS }));
    expect(res.kind).toBe('permit2-single');
    const risk = res.risks.find((r) => r.id === 'unlimited-permit');
    expect(risk).toBeDefined();
    expect(risk?.severity).toBe('danger');
  });

  it('does not flag a small single Permit2 amount as unlimited', () => {
    const res = ok(explainTypedData(permit2SingleRequest('1000'), { nowMs: NOW_MS }));
    expect(res.kind).toBe('permit2-single');
    expect(riskIds(res)).not.toContain('unlimited-permit');
    const joined = res.bullets.join('\n');
    expect(joined).toContain(TOKEN);
    expect(joined).toContain(SPENDER);
  });

  it('flags a batch as danger when ANY item is unlimited', () => {
    const res = ok(
      explainTypedData(permit2BatchRequest(['1000', UINT160_MAX.toString()]), { nowMs: NOW_MS }),
    );
    expect(res.kind).toBe('permit2-batch');
    const unlimitedRisks = res.risks.filter((r) => r.id === 'unlimited-permit');
    expect(unlimitedRisks).toHaveLength(1);
    expect(unlimitedRisks[0]?.severity).toBe('danger');
    // one bullet set per item: both tokens must appear
    const joined = res.bullets.join('\n');
    expect(joined).toContain(TOKEN);
    expect(joined).toContain(TOKEN_B);
  });

  it('leaves a fully limited batch without an unlimited risk', () => {
    const res = ok(explainTypedData(permit2BatchRequest(['1000', '2000']), { nowMs: NOW_MS }));
    expect(res.kind).toBe('permit2-batch');
    expect(riskIds(res)).not.toContain('unlimited-permit');
  });
});

/* ------------------------------------------------------------------ */
/* Generic typed data                                                  */
/* ------------------------------------------------------------------ */

describe('explainTypedData — generic', () => {
  const genericRequest = {
    types: { Order: [] },
    primaryType: 'Order',
    domain: { name: 'Some Marketplace', chainId: MONAD_CHAIN_ID, verifyingContract: TOKEN },
    message: {
      maker: OWNER,
      note: 'x'.repeat(100),
      price: '5000',
    },
  };

  it('uses the generic headline and always warns that signatures can move funds', () => {
    const res = ok(explainTypedData(genericRequest, { nowMs: NOW_MS }));
    expect(res.kind).toBe('generic');
    expect(res.headline).toBe('You are being asked to sign structured data');
    const risk = res.risks.find((r) => r.id === 'signature-can-move-funds');
    expect(risk).toBeDefined();
    expect(risk?.severity).toBe('caution');
  });

  it('lists primaryType, domain info, and truncates long message values at 60 chars', () => {
    const res = ok(explainTypedData(genericRequest, { nowMs: NOW_MS }));
    const joined = res.bullets.join('\n');
    expect(joined).toContain('Order');
    expect(joined).toContain('Some Marketplace');
    expect(joined).toContain(TOKEN);
    const noteBullet = res.bullets.find((b) => b.startsWith('note: '));
    expect(noteBullet).toBe(`note: ${'x'.repeat(60)}…`);
  });

  it('shows at most 8 top-level message fields', () => {
    const message: Record<string, string> = {};
    for (let i = 0; i < 12; i += 1) message[`field${i}`] = `value${i}`;
    const res = ok(
      explainTypedData(
        { types: {}, primaryType: 'Big', domain: {}, message },
        { nowMs: NOW_MS },
      ),
    );
    const fieldBullets = res.bullets.filter((b) => /^field\d+: /.test(b));
    expect(fieldBullets).toHaveLength(8);
  });
});

/* ------------------------------------------------------------------ */
/* Chain id checks                                                     */
/* ------------------------------------------------------------------ */

describe('explainTypedData — network mismatch', () => {
  it('warns when the domain chainId matches none of the expected networks', () => {
    const res = ok(
      explainTypedData(permitRequest({ chainId: 1 }), {
        nowMs: NOW_MS,
        expectedChainIds: [MONAD_CHAIN_ID],
      }),
    );
    const risk = res.risks.find((r) => r.id === 'different-network');
    expect(risk).toBeDefined();
    expect(risk?.severity).toBe('caution');
  });

  it('stays quiet when the chainId matches, including hex form', () => {
    const decimal = ok(
      explainTypedData(permitRequest(), { nowMs: NOW_MS, expectedChainIds: [MONAD_CHAIN_ID] }),
    );
    expect(riskIds(decimal)).not.toContain('different-network');

    const hex = ok(
      explainTypedData(permitRequest({ chainId: '0x279f' }), {
        nowMs: NOW_MS,
        expectedChainIds: [MONAD_CHAIN_ID],
      }),
    );
    expect(riskIds(hex)).not.toContain('different-network');
  });

  it('stays quiet when no expected networks are given', () => {
    const res = ok(explainTypedData(permitRequest({ chainId: 1 }), { nowMs: NOW_MS }));
    expect(riskIds(res)).not.toContain('different-network');
  });
});

/* ------------------------------------------------------------------ */
/* Malformed input                                                     */
/* ------------------------------------------------------------------ */

describe('explainTypedData — malformed input', () => {
  it('returns an error object for things that are not typed data', () => {
    for (const bad of [null, undefined, 42, [], {}, { types: {}, message: {} }]) {
      const res = explainTypedData(bad, { nowMs: NOW_MS });
      expect('error' in res).toBe(true);
      if ('error' in res) expect(res.error.length).toBeGreaterThan(0);
    }
  });

  it('returns an error object for a string that is not valid JSON', () => {
    const res = explainTypedData('{"types": broken', { nowMs: NOW_MS });
    expect('error' in res).toBe(true);
  });

  it('accepts a pasted JSON string of a valid request', () => {
    const res = ok(explainTypedData(JSON.stringify(permitRequest()), { nowMs: NOW_MS }));
    expect(res.kind).toBe('permit');
  });

  it('returns an error object when permit values are unreadable', () => {
    const badValue = explainTypedData(permitRequest({ value: 'banana' }), { nowMs: NOW_MS });
    expect('error' in badValue).toBe(true);

    const req = permitRequest();
    (req.message as Record<string, unknown>).deadline = 'tomorrow-ish';
    const badDeadline = explainTypedData(req, { nowMs: NOW_MS });
    expect('error' in badDeadline).toBe(true);
  });

  it('returns an error object when a Permit2 amount is unreadable', () => {
    const req = permit2SingleRequest('not-a-number');
    const res = explainTypedData(req, { nowMs: NOW_MS });
    expect('error' in res).toBe(true);
  });

  it('never throws, even on hostile shapes', () => {
    const cyclic: Record<string, unknown> = { types: {}, primaryType: 'X', domain: {} };
    cyclic.message = { self: cyclic };
    expect(() => explainTypedData(cyclic, { nowMs: NOW_MS })).not.toThrow();
    expect(() => explainTypedData(Symbol('nope') as unknown, { nowMs: NOW_MS })).not.toThrow();
  });
});
