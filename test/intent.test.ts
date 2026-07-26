import { describe, expect, it } from 'vitest';
import { parseIntent } from '../src/lib/intent';
import type { ParsedIntent } from '../src/lib/types';

const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';

function ok(text: string): ParsedIntent {
  const result = parseIntent(text);
  if (!result.ok) throw new Error(`expected parse success, got: ${result.reason}`);
  return result.intent;
}

function fail(text: string) {
  const result = parseIntent(text);
  if (result.ok) throw new Error(`expected parse failure for: ${text}`);
  return result;
}

describe('parseIntent — send', () => {
  it('parses a basic native MON send', () => {
    const intent = ok(`send 0.5 mon to ${A}`);
    expect(intent.action).toBe('send');
    expect(intent.token).toBeUndefined();
    expect(intent.amount).toEqual({ value: '0.5' });
    expect(intent.counterparty).toBe(A);
  });

  it('parses an ERC-20 transfer with a symbol', () => {
    const intent = ok(`transfer 10 tUSD to ${A}`);
    expect(intent.action).toBe('send');
    expect(intent.token).toBe('tUSD');
    expect(intent.amount).toEqual({ value: '10' });
    expect(intent.counterparty).toBe(A);
  });

  it('parses "pay <address> <amount>" with recipient before amount', () => {
    const intent = ok(`pay ${A} 5 MON`);
    expect(intent.action).toBe('send');
    expect(intent.token).toBeUndefined();
    expect(intent.amount).toEqual({ value: '5' });
    expect(intent.counterparty).toBe(A);
  });

  it('parses "send all my MON"', () => {
    const intent = ok(`send all my MON to ${A}`);
    expect(intent.amount).toEqual({ all: true });
    expect(intent.token).toBeUndefined();
  });

  it('strips thousands separators', () => {
    const intent = ok(`send 1,000 tUSD to ${A}`);
    expect(intent.amount).toEqual({ value: '1000' });
  });

  it('handles a glued amount+symbol like 0.5MON', () => {
    const intent = ok(`send 0.5MON to ${A}`);
    expect(intent.amount).toEqual({ value: '0.5' });
    expect(intent.token).toBeUndefined();
  });

  it('is case-insensitive', () => {
    const intent = ok(`SEND 0.5 Mon TO ${A}`);
    expect(intent.action).toBe('send');
    expect(intent.token).toBeUndefined();
  });

  it('assumes native MON with a note when no token is named', () => {
    const intent = ok(`send 5 to ${A}`);
    expect(intent.token).toBeUndefined();
    expect(intent.notes.join(' ')).toMatch(/MON/);
  });

  it('treats a second address as the token contract', () => {
    const intent = ok(`send 5 ${B} to ${A}`);
    expect(intent.counterparty).toBe(A);
    expect(intent.token).toBe(B);
    expect(intent.notes.length).toBeGreaterThan(0);
  });
});

describe('parseIntent — approve / revoke', () => {
  it('parses a limited approval', () => {
    const intent = ok(`approve ${A} to spend 100 tUSD`);
    expect(intent.action).toBe('approve');
    expect(intent.counterparty).toBe(A);
    expect(intent.amount).toEqual({ value: '100' });
    expect(intent.token).toBe('tUSD');
  });

  it('parses an unlimited approval', () => {
    const intent = ok(`allow ${A} to spend unlimited tUSD`);
    expect(intent.action).toBe('approve');
    expect(intent.amount).toEqual({ unlimited: true });
    expect(intent.token).toBe('tUSD');
  });

  it('parses "give … unlimited access to my …" as unlimited approval', () => {
    const intent = ok(`give ${A} unlimited access to my tUSD`);
    expect(intent.action).toBe('approve');
    expect(intent.amount).toEqual({ unlimited: true });
    expect(intent.token).toBe('tUSD');
  });

  it("parses a possessive revoke: revoke 0x…'s access to my tUSD", () => {
    const intent = ok(`revoke ${A}'s access to my tUSD`);
    expect(intent.action).toBe('revoke');
    expect(intent.counterparty).toBe(A);
    expect(intent.token).toBe('tUSD');
    expect(intent.amount).toBeUndefined();
  });

  it('parses "cancel the approval for … on …" as revoke', () => {
    const intent = ok(`cancel the approval for ${A} on tUSD`);
    expect(intent.action).toBe('revoke');
    expect(intent.counterparty).toBe(A);
    expect(intent.token).toBe('tUSD');
  });
});

describe('parseIntent — failures give actionable suggestions', () => {
  it('rejects an empty string', () => {
    const result = fail('   ');
    expect(result.suggestions.length).toBeGreaterThan(0);
  });

  it('rejects gibberish with no recognizable action', () => {
    const result = fail('what is the weather like today');
    expect(result.reason).toMatch(/send|approve|revoke/i);
  });

  it('rejects a send with no recipient', () => {
    const result = fail('send 5 MON');
    expect(result.reason).toMatch(/recipient|address/i);
  });

  it('rejects a send with no amount', () => {
    const result = fail(`send MON to ${A}`);
    expect(result.reason).toMatch(/amount|how much/i);
  });

  it('does not accept a truncated address as recipient', () => {
    const result = fail('send 5 MON to 0x1234');
    expect(result.reason).toMatch(/address/i);
  });

  it('rejects "send unlimited"', () => {
    const result = fail(`send unlimited MON to ${A}`);
    expect(result.reason).toMatch(/unlimited/i);
  });

  it('rejects an approval without an amount', () => {
    const result = fail(`approve ${A} to spend tUSD`);
    expect(result.reason).toMatch(/how much|amount|unlimited/i);
  });
});

describe('parseIntent — raw transaction JSON', () => {
  it('parses a pasted raw transaction', () => {
    const intent = ok(`{"to":"${A}","data":"0xdeadbeef","value":"0x10"}`);
    expect(intent.action).toBe('raw');
    expect(intent.raw).toEqual({ to: A, data: '0xdeadbeef', value: '0x10' });
  });

  it('tolerates extra keys like from and gas', () => {
    const intent = ok(`{"to":"${A}","from":"${B}","gas":"0x5208"}`);
    expect(intent.action).toBe('raw');
    expect(intent.raw?.to).toBe(A);
  });

  it('rejects malformed JSON', () => {
    const result = fail(`{"to": ${A}`);
    expect(result.reason).toMatch(/JSON/i);
  });

  it('rejects a raw tx without a valid "to"', () => {
    const result = fail('{"to":"0x1234","data":"0x"}');
    expect(result.reason).toMatch(/"to"/);
  });
});
