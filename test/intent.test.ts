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

describe('parseIntent — wrap / unwrap', () => {
  it('parses "wrap 1 MON"', () => {
    const intent = ok('wrap 1 MON');
    expect(intent.action).toBe('wrap');
    expect(intent.amount).toEqual({ value: '1' });
    expect(intent.counterparty).toBeUndefined();
  });

  it('parses "wrap 0.5 mon into wmon"', () => {
    const intent = ok('wrap 0.5 mon into wmon');
    expect(intent.action).toBe('wrap');
    expect(intent.amount).toEqual({ value: '0.5' });
  });

  it('parses "unwrap 2 WMON"', () => {
    const intent = ok('unwrap 2 WMON');
    expect(intent.action).toBe('unwrap');
    expect(intent.amount).toEqual({ value: '2' });
    expect(intent.counterparty).toBeUndefined();
  });

  it('parses "unwrap all my wmon"', () => {
    const intent = ok('unwrap all my wmon');
    expect(intent.action).toBe('unwrap');
    expect(intent.amount).toEqual({ all: true });
  });

  it('parses "convert 1 mon to wmon" as wrap', () => {
    const intent = ok('convert 1 mon to wmon');
    expect(intent.action).toBe('wrap');
    expect(intent.amount).toEqual({ value: '1' });
  });

  it('parses "convert 2 wmon to mon" as unwrap', () => {
    const intent = ok('convert 2 wmon to mon');
    expect(intent.action).toBe('unwrap');
    expect(intent.amount).toEqual({ value: '2' });
  });

  it('ignores an address in a wrap sentence, with a note', () => {
    const intent = ok(`wrap 1 MON to ${A}`);
    expect(intent.action).toBe('wrap');
    expect(intent.counterparty).toBeUndefined();
    expect(intent.notes.length).toBeGreaterThan(0);
  });

  it('rejects a wrap without an amount', () => {
    const result = fail('wrap some mon please');
    expect(result.reason).toMatch(/how much|amount/i);
  });

  it('rejects "wrap all" with a fee explanation and numeric suggestions', () => {
    const result = fail('wrap all my mon');
    expect(result.reason).toMatch(/fee/i);
    expect(result.reason).toMatch(/number/i);
    expect(result.suggestions.some((s) => /\d/.test(s))).toBe(true);
  });

  it('rejects an unwrap without an amount but points at "all"', () => {
    const result = fail('unwrap my wmon');
    expect(result.reason).toMatch(/how much|amount/i);
    expect(result.reason).toMatch(/all/i);
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

/* ------------------------------------------------------------------ */
/* Chinese-language intents — deterministic, no AI involved            */
/* ------------------------------------------------------------------ */

describe('parseIntent — Chinese (send)', () => {
  it('parses 发送 … 到 …', () => {
    const intent = ok(`发送 0.5 MON 到 ${A}`);
    expect(intent.action).toBe('send');
    expect(intent.token).toBeUndefined();
    expect(intent.amount).toEqual({ value: '0.5' });
    expect(intent.counterparty).toBe(A);
  });

  it('parses the exact zh example chip: 发送 0.1 MON 到 <address>', () => {
    const intent = ok(`发送 0.1 MON 到 ${A}`);
    expect(intent.action).toBe('send');
    expect(intent.amount).toEqual({ value: '0.1' });
  });

  it('parses 转 … 给 … with a token symbol', () => {
    const intent = ok(`转 100 tUSD 给 ${A}`);
    expect(intent.action).toBe('send');
    expect(intent.token).toBe('tUSD');
    expect(intent.amount).toEqual({ value: '100' });
    expect(intent.counterparty).toBe(A);
  });

  it('parses 转账给 as a single compound verb', () => {
    const intent = ok(`转账给 ${A} 2 MON`);
    expect(intent.action).toBe('send');
    expect(intent.token).toBeUndefined();
    expect(intent.amount).toEqual({ value: '2' });
    expect(intent.counterparty).toBe(A);
  });

  it('parses glued Chinese with no spaces at all', () => {
    const intent = ok(`发送0.5MON到${A}`);
    expect(intent.action).toBe('send');
    expect(intent.token).toBeUndefined();
    expect(intent.amount).toEqual({ value: '0.5' });
  });

  it('strips politeness prefixes like 请/帮我/我想', () => {
    const intent = ok(`请帮我发送 1 MON 到 ${A}`);
    expect(intent.action).toBe('send');
    expect(intent.amount).toEqual({ value: '1' });
  });

  it('parses 全部 as "all"', () => {
    const intent = ok(`把我的全部 MON 发送到 ${A}`);
    expect(intent.action).toBe('send');
    expect(intent.amount).toEqual({ all: true });
  });

  it('still demands a recipient in Chinese', () => {
    const result = fail('发送 0.5 MON');
    expect(result.reason).toMatch(/address|recipient/i);
  });
});

describe('parseIntent — Chinese (approvals)', () => {
  it('parses the exact zh example chip: 授权 … 花费 100 tUSD', () => {
    const intent = ok(`授权 ${A} 花费 100 tUSD`);
    expect(intent.action).toBe('approve');
    expect(intent.token).toBe('tUSD');
    expect(intent.amount).toEqual({ value: '100' });
    expect(intent.counterparty).toBe(A);
  });

  it('parses 允许 … 使用无限量 …', () => {
    const intent = ok(`允许 ${A} 使用无限量 tUSD`);
    expect(intent.action).toBe('approve');
    expect(intent.amount).toEqual({ unlimited: true });
  });

  it('parses the exact zh example chip: 撤销 … 对我的 tUSD 的授权', () => {
    const intent = ok(`撤销 ${A} 对我的 tUSD 的授权`);
    expect(intent.action).toBe('revoke');
    expect(intent.token).toBe('tUSD');
    expect(intent.counterparty).toBe(A);
  });

  it('parses 取消 as revoke', () => {
    const intent = ok(`取消 ${A} 的 tUSD 授权额度`);
    expect(intent.action).toBe('revoke');
    expect(intent.token).toBe('tUSD');
  });
});

describe('parseIntent — Chinese (wrap / unwrap)', () => {
  it('parses the exact zh example chip: 封装 1 MON', () => {
    const intent = ok('封装 1 MON');
    expect(intent.action).toBe('wrap');
    expect(intent.amount).toEqual({ value: '1' });
  });

  it('parses 把 … 换成 … in both directions', () => {
    expect(ok(`把 1 MON 换成 WMON`).action).toBe('wrap');
    expect(ok(`把 2 WMON 换成 MON`).action).toBe('unwrap');
  });

  it('parses 解包全部 WMON as unwrap-all', () => {
    const intent = ok('解包我的全部 WMON');
    expect(intent.action).toBe('unwrap');
    expect(intent.amount).toEqual({ all: true });
  });

  it('parses 解封装 without triggering the wrap rule first', () => {
    const intent = ok('解封装 2 WMON');
    expect(intent.action).toBe('unwrap');
    expect(intent.amount).toEqual({ value: '2' });
  });
});

/* ------------------------------------------------------------------ */
/* Chinese — regressions from adversarial review                       */
/* ------------------------------------------------------------------ */

describe('parseIntent — Chinese wrong-transaction regressions', () => {
  it('解除封装 / 取消封装 unwrap — never the opposite direction', () => {
    expect(ok('解除封装 2 WMON').action).toBe('unwrap');
    expect(ok('取消封装 2 WMON').action).toBe('unwrap');
    expect(ok('帮我解除封装 0.3 WMON').action).toBe('unwrap');
  });

  it('给 A 转 X 的授权 is an approval, not a transfer', () => {
    const intent = ok(`给 ${A} 转 100 tUSD 的授权`);
    expect(intent.action).toBe('approve');
    expect(intent.token).toBe('tUSD');
    expect(intent.amount).toEqual({ value: '100' });
    expect(intent.counterparty).toBe(A);
  });

  it('给 A 转账 X 的权限 is also an approval', () => {
    const intent = ok(`给 ${A} 转账 100 tUSD 的权限`);
    expect(intent.action).toBe('approve');
    expect(intent.amount).toEqual({ value: '100' });
  });

  it('expands 万/千/亿 multipliers instead of dropping them', () => {
    expect(ok(`转 1万 tUSD 给 ${A}`).amount).toEqual({ value: '10000' });
    expect(ok(`转 3千 tUSD 给 ${A}`).amount).toEqual({ value: '3000' });
    expect(ok(`转 0.5万 tUSD 给 ${A}`).amount).toEqual({ value: '5000' });
    expect(ok(`转 2亿 tUSD 给 ${A}`).amount).toEqual({ value: '200000000' });
    expect(ok(`转 3千万 tUSD 给 ${A}`).amount).toEqual({ value: '30000000' });
    expect(ok(`授权 ${A} 花费 1万 tUSD`).amount).toEqual({ value: '10000' });
  });

  it('an explicit number beats a stray 所有/全部 — with a note', () => {
    const intent = ok(`把我所有的 tUSD 转 200 给 ${A}`);
    expect(intent.action).toBe('send');
    expect(intent.amount).toEqual({ value: '200' });
    expect(intent.notes.join(' ')).toMatch(/all/i);
  });

  it('refuses 一半 (half) instead of guessing', () => {
    const result = fail(`转我所有 WMON 的一半给 ${A}`);
    expect(result.reason).toMatch(/half|amount/i);
  });

  it('refuses a token named in Chinese instead of assuming MON', () => {
    const result = fail(`转 100 个测试币 给 ${A}`);
    expect(result.reason).toMatch(/token|symbol|address/i);
  });

  it('封装的 MON is WMON the asset, not a wrap command', () => {
    const intent = ok(`把 2 个封装的 MON 发给 ${A}`);
    expect(intent.action).toBe('send');
    expect(intent.token?.toLowerCase()).toBe('wmon');
    expect(intent.amount).toEqual({ value: '2' });
    expect(intent.counterparty).toBe(A);
  });

  it('refuses wrap mixed with a send instead of dropping half the instruction', () => {
    const zh = fail(`先封装 1 MON 再转 0.5 WMON 给 ${A}`);
    expect(zh.reason).toMatch(/split|steps/i);
    const en = fail(`wrap 1 MON and send it to ${A}`);
    expect(en.reason).toMatch(/split|steps/i);
  });

  it('English half is refused the same way', () => {
    const result = fail(`send half my MON to ${A}`);
    expect(result.reason).toMatch(/half|amount/i);
  });

  it('normalization residue like "convert" can never become the token', () => {
    const result = parseIntent(`先兑换再转 100 tUSD 给 ${A}`);
    if (result.ok) {
      expect(result.intent.token).toBe('tUSD');
    }
  });
});
