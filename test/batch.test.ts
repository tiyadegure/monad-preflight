import { describe, expect, it } from 'vitest';
import {
  MAX_BATCH_CALLS,
  batchRisks,
  describeBatch,
  looksLikeBatch,
  parseBatch,
} from '../src/lib/batch';
import type { BatchCall, ParsedBatch } from '../src/lib/batch';
import type { Address } from '../src/lib/types';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const ADDR_A: Address = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa';
const ADDR_B: Address = '0x2222222222222222222222222222222222222222';
const ADDR_C: Address = '0x3333333333333333333333333333333333333333';
const FROM: Address = '0x4444444444444444444444444444444444444444';

function call(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { to: ADDR_B, data: '0x', value: '0x0', ...overrides };
}

function makeBatch(overrides: Partial<ParsedBatch> = {}): ParsedBatch {
  const calls: BatchCall[] = [
    { to: ADDR_B, data: '0x', value: 0n, index: 0 },
    { to: ADDR_C, data: '0x', value: 0n, index: 1 },
  ];
  return { calls, atomic: true, notes: [], ...overrides };
}

function makeCalls(n: number): BatchCall[] {
  return Array.from({ length: n }, (_, i) => ({
    to: ADDR_B,
    data: '0x' as const,
    value: 0n,
    index: i,
  }));
}

function assertParsed(result: ParsedBatch | { error: string }): ParsedBatch {
  if ('error' in result) throw new Error(`expected success, got error: ${result.error}`);
  return result;
}

function assertError(result: ParsedBatch | { error: string }): string {
  if (!('error' in result)) throw new Error('expected an error result');
  return result.error;
}

/* ------------------------------------------------------------------ */
/* looksLikeBatch                                                      */
/* ------------------------------------------------------------------ */

describe('looksLikeBatch', () => {
  it('recognizes the EIP-5792 params object shape', () => {
    expect(looksLikeBatch({ version: '2.0.0', calls: [call()] })).toBe(true);
    expect(looksLikeBatch({ calls: [] })).toBe(true);
  });

  it('recognizes a bare array of calls with `to`', () => {
    expect(looksLikeBatch([call(), call({ to: ADDR_C })])).toBe(true);
  });

  it('rejects non-batch shapes without throwing', () => {
    expect(looksLikeBatch(null)).toBe(false);
    expect(looksLikeBatch(undefined)).toBe(false);
    expect(looksLikeBatch(42)).toBe(false);
    expect(looksLikeBatch('hello')).toBe(false);
    expect(looksLikeBatch({ to: ADDR_B })).toBe(false);
    expect(looksLikeBatch([])).toBe(false);
    expect(looksLikeBatch([{ notTo: 1 }])).toBe(false);
    expect(looksLikeBatch([call(), 'oops'])).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* parseBatch — happy paths                                            */
/* ------------------------------------------------------------------ */

describe('parseBatch', () => {
  it('parses an EIP-5792 object with 3 calls', () => {
    const parsed = assertParsed(
      parseBatch({
        version: '2.0.0',
        chainId: '0x279f',
        from: FROM,
        atomicRequired: true,
        calls: [
          call({ value: '0xde0b6b3a7640000' }),
          call({ to: ADDR_C, data: '0xa9059cbb' }),
          call({ to: ADDR_A.toLowerCase() }),
        ],
      }),
    );
    expect(parsed.calls).toHaveLength(3);
    expect(parsed.chainId).toBe(10143);
    expect(parsed.from).toBe(FROM);
    expect(parsed.atomic).toBe(true);
    expect(parsed.calls[0]).toEqual({
      to: ADDR_B,
      data: '0x',
      value: 10n ** 18n,
      index: 0,
    });
    expect(parsed.calls[1]?.data).toBe('0xa9059cbb');
    // Addresses come back checksummed even when supplied lowercase.
    expect(parsed.calls[2]?.to).toBe(ADDR_A);
    expect(parsed.calls[2]?.index).toBe(2);
  });

  it('parses a bare array of calls', () => {
    const parsed = assertParsed(parseBatch([call(), call({ to: ADDR_C })]));
    expect(parsed.calls).toHaveLength(2);
    expect(parsed.atomic).toBe(false);
    expect(parsed.chainId).toBeUndefined();
    expect(parsed.from).toBeUndefined();
  });

  it('parses a JSON string of the params object', () => {
    const json = JSON.stringify({
      chainId: 10143,
      atomicRequired: false,
      calls: [{ to: ADDR_B, data: '0x', value: '1000' }],
    });
    const parsed = assertParsed(parseBatch(json));
    expect(parsed.calls).toHaveLength(1);
    expect(parsed.chainId).toBe(10143);
    expect(parsed.calls[0]?.value).toBe(1000n);
  });

  it('accepts hex and decimal forms for value and chainId', () => {
    const hex = assertParsed(
      parseBatch({ chainId: '0x1', calls: [call({ value: '0x10' })] }),
    );
    expect(hex.chainId).toBe(1);
    expect(hex.calls[0]?.value).toBe(16n);

    const decimal = assertParsed(
      parseBatch({ chainId: 10143, calls: [call({ value: '25' })] }),
    );
    expect(decimal.chainId).toBe(10143);
    expect(decimal.calls[0]?.value).toBe(25n);

    const numeric = assertParsed(parseBatch({ chainId: '10143', calls: [call({ value: 7 })] }));
    expect(numeric.chainId).toBe(10143);
    expect(numeric.calls[0]?.value).toBe(7n);
  });

  it('defaults missing data to 0x and missing value to zero', () => {
    const parsed = assertParsed(parseBatch([{ to: ADDR_B }]));
    expect(parsed.calls[0]?.data).toBe('0x');
    expect(parsed.calls[0]?.value).toBe(0n);
  });

  /* ---------------- rejections ---------------- */

  it('names the position of an invalid destination address', () => {
    const bad = { to: '0xnot-an-address' };
    expect(assertError(parseBatch([bad]))).toBe(
      'The 1st instruction has an invalid destination address.',
    );
    expect(assertError(parseBatch([call(), bad]))).toBe(
      'The 2nd instruction has an invalid destination address.',
    );
    expect(assertError(parseBatch([call(), call(), bad]))).toBe(
      'The 3rd instruction has an invalid destination address.',
    );
    expect(assertError(parseBatch([call(), call(), call(), bad]))).toBe(
      'The 4th instruction has an invalid destination address.',
    );
  });

  it('rejects an address of the wrong length', () => {
    const tooShort = '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const error = assertError(parseBatch([{ to: tooShort }]));
    expect(error).toContain('1st instruction');
    expect(error).toContain('invalid destination address');
  });

  it('rejects invalid data hex with a plain-language error', () => {
    const oddLength = assertError(parseBatch([call({ data: '0xabc' })]));
    expect(oddLength).toContain('2nd'.length === 3 ? '1st instruction' : '');
    expect(oddLength).toBe(
      'The 1st instruction contains data we could not read, so we cannot safely check it.',
    );
    const notHex = assertError(parseBatch([call(), call({ data: '0xzz' })]));
    expect(notHex).toContain('2nd instruction');
  });

  it('rejects an unreadable value amount, naming the call', () => {
    const error = assertError(parseBatch([call(), call({ value: 'one hundred' })]));
    expect(error).toBe('The 2nd instruction has an amount we could not read.');
    expect(assertError(parseBatch([call({ value: 1.5 })]))).toContain('1st instruction');
  });

  it('rejects an empty calls list with a plain explanation', () => {
    const objectError = assertError(parseBatch({ calls: [] }));
    expect(objectError).toContain('at least one instruction');
    expect(assertError(parseBatch([]))).toContain('at least one instruction');
  });

  it('caps at 50 calls and says so in a note', () => {
    const parsed = assertParsed(parseBatch(Array.from({ length: 60 }, () => call())));
    expect(parsed.calls).toHaveLength(MAX_BATCH_CALLS);
    expect(parsed.calls).toHaveLength(50);
    expect(parsed.notes.some((n) => n.includes('60') && n.includes('first 50'))).toBe(true);
  });

  it('returns errors, never throws, on malformed input', () => {
    expect(assertError(parseBatch(42))).toBeTruthy();
    expect(assertError(parseBatch(null))).toBeTruthy();
    expect(assertError(parseBatch(undefined))).toBeTruthy();
    expect(assertError(parseBatch('not json at all {'))).toBeTruthy();
    expect(assertError(parseBatch({ noCalls: true }))).toBeTruthy();
    expect(assertError(parseBatch('"just a string"'))).toBeTruthy();
  });

  /* ---------------- atomicity and notes ---------------- */

  it('sets atomic from atomicRequired and notes non-atomic bundles', () => {
    const atomic = assertParsed(parseBatch({ atomicRequired: true, calls: [call(), call()] }));
    expect(atomic.atomic).toBe(true);
    expect(atomic.notes.some((n) => n.includes('separately'))).toBe(false);

    const loose = assertParsed(parseBatch({ atomicRequired: false, calls: [call(), call()] }));
    expect(loose.atomic).toBe(false);
    expect(
      loose.notes.some((n) => n.includes('separately') && n.includes('succeed')),
    ).toBe(true);

    // Missing atomicRequired means not atomic.
    const missing = assertParsed(parseBatch({ calls: [call()] }));
    expect(missing.atomic).toBe(false);
  });

  it('notes that a long bundle deserves extra care', () => {
    const six = assertParsed(parseBatch(Array.from({ length: 6 }, () => call())));
    expect(six.notes.some((n) => n.toLowerCase().includes('care'))).toBe(true);

    const five = assertParsed(parseBatch(Array.from({ length: 5 }, () => call())));
    expect(five.notes.some((n) => n.toLowerCase().includes('care'))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* describeBatch                                                       */
/* ------------------------------------------------------------------ */

describe('describeBatch', () => {
  it('uses plural phrasing with the atomic suffix', () => {
    const text = describeBatch(makeBatch({ calls: makeCalls(4), atomic: true }));
    expect(text).toBe(
      'This is 4 separate instructions bundled into one confirmation. They must all succeed together.',
    );
  });

  it('uses plural phrasing with the non-atomic suffix', () => {
    const text = describeBatch(makeBatch({ calls: makeCalls(2), atomic: false }));
    expect(text).toBe(
      'This is 2 separate instructions bundled into one confirmation. They can land separately.',
    );
  });

  it('uses singular phrasing for one call', () => {
    const text = describeBatch(makeBatch({ calls: makeCalls(1), atomic: true }));
    expect(text).toContain('This is 1 instruction bundled into one confirmation.');
    expect(text).not.toContain('instructions');
  });
});

/* ------------------------------------------------------------------ */
/* batchRisks                                                          */
/* ------------------------------------------------------------------ */

describe('batchRisks', () => {
  const ids = (batch: ParsedBatch): string[] => batchRisks(batch).map((f) => f.id);

  it('flags hidden actions as danger when there is more than one call', () => {
    const findings = batchRisks(makeBatch({ calls: makeCalls(2) }));
    const hidden = findings.find((f) => f.id === 'batch-hidden-actions');
    expect(hidden?.severity).toBe('danger');
    expect(hidden?.detail).toContain('every one');
    expect(hidden?.detail).toContain('wallet may only show');
  });

  it('does not flag hidden actions for a single call', () => {
    expect(ids(makeBatch({ calls: makeCalls(1) }))).not.toContain('batch-hidden-actions');
  });

  it('cautions about non-atomic bundles only when they are multi-call', () => {
    const loose = batchRisks(makeBatch({ calls: makeCalls(3), atomic: false }));
    const finding = loose.find((f) => f.id === 'batch-not-atomic');
    expect(finding?.severity).toBe('caution');

    expect(ids(makeBatch({ calls: makeCalls(3), atomic: true }))).not.toContain(
      'batch-not-atomic',
    );
    expect(ids(makeBatch({ calls: makeCalls(1), atomic: false }))).not.toContain(
      'batch-not-atomic',
    );
  });

  it('cautions about long bundles above 5 calls', () => {
    const large = batchRisks(makeBatch({ calls: makeCalls(6) }));
    const finding = large.find((f) => f.id === 'batch-large');
    expect(finding?.severity).toBe('caution');
    expect(ids(makeBatch({ calls: makeCalls(5) }))).not.toContain('batch-large');
  });

  it('marks a one-call bundle as info only', () => {
    const findings = batchRisks(makeBatch({ calls: makeCalls(1), atomic: true }));
    expect(findings).toHaveLength(1);
    expect(findings[0]?.id).toBe('batch-single');
    expect(findings[0]?.severity).toBe('info');
    expect(ids(makeBatch({ calls: makeCalls(2) }))).not.toContain('batch-single');
  });

  it('never uses banned jargon in user-facing strings', () => {
    const banned = /\b(EOA|calldata|nonce|allowance|authorization tuple)\b/i;
    const everything = [
      ...batchRisks(makeBatch({ calls: makeCalls(7), atomic: false })),
      ...batchRisks(makeBatch({ calls: makeCalls(1) })),
    ];
    for (const finding of everything) {
      expect(finding.title).not.toMatch(banned);
      expect(finding.detail).not.toMatch(banned);
    }
  });
});
