/**
 * Rule-based natural-language intent parser. Pure text analysis — no
 * network, no AI, fully deterministic (the optional Claude parser in
 * claude.ts is a fallback layered on top by the app).
 *
 * Strategy: mask out addresses first (so amount/token matching can't
 * collide with hex), detect the action verb, then extract amount, token,
 * and counterparty with small targeted patterns. Anything genuinely
 * ambiguous becomes a plain-language note; anything missing becomes a
 * ParseFailure with concrete examples the user can copy.
 */

import type { ParseFailure, ParseResult } from './types';
import { isAddressFormat } from './format';
import { t } from './i18n';
import type { Lang } from './i18n';

const DEFAULT_SUGGESTIONS = [
  'send 0.5 MON to 0x<recipient address>',
  'approve 0x<app address> to spend 100 tUSD',
  "revoke 0x<app address>'s access to my tUSD",
];

const RAW_SUGGESTION =
  '{"to":"0x<contract address>","data":"0x<calldata>","value":"0x0"}';

/**
 * Words that can never be a token symbol — verbs, fillers, and amount
 * keywords that show up in the phrasings we support.
 */
const RESERVED = new Set([
  'a', 'access', 'address', 'all', 'allow', 'allowance', 'an', 'and',
  'approval', 'approvals', 'approve', 'authorize', 'balance', 'cancel',
  'coin', 'coins', 'convert', 'entire', 'everything', 'for', 'from',
  'give', 'half', 'in', 'infinite', 'into', 'it', 'max', 'me', 'move',
  'my', 'native', 'of', 'on', 'out', 'pay', 'permission', 'please',
  'remove', 'revoke', 'send', 'spend', 'spending', 'the', 'their',
  'them', 'then', 'to', 'token', 'tokens', 'transfer', 'unlimited',
  'unwrap', 'up', 'wallet', 'whole', 'wrap', 'your',
]);

/** mon / monad mean the native coin → represented as token: undefined. */
const NATIVE_WORDS = new Set(['mon', 'monad']);

function failure(
  reason: string,
  suggestions = DEFAULT_SUGGESTIONS,
): ParseFailure {
  return { ok: false, reason, suggestions };
}

/* ------------------------------------------------------------------ */
/* Raw transaction JSON ("explain this before I sign it")              */
/* ------------------------------------------------------------------ */

function parseRawJson(text: string, lang: Lang = 'en'): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failure(
      t(lang, 'int.rawNotJson'),
      [RAW_SUGGESTION],
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return failure(
      t(lang, 'int.rawNotObject'),
      [RAW_SUGGESTION],
    );
  }
  const record = parsed as Record<string, unknown>;
  const to = typeof record.to === 'string' ? record.to.trim() : '';
  if (!isAddressFormat(to)) {
    return failure(
      t(lang, 'int.rawNoTo'),
      [RAW_SUGGESTION],
    );
  }

  const notes: string[] = [];
  const data = typeof record.data === 'string' ? record.data.trim() : undefined;
  let value: string | undefined;
  if (typeof record.value === 'string') {
    value = record.value.trim();
  } else if (typeof record.value === 'number') {
    value = String(record.value);
    notes.push(t(lang, 'int.rawNumberNote'));
  }

  // Extra keys like from/gas/nonce are the wallet's business — ignored.
  return {
    ok: true,
    intent: { action: 'raw', raw: { to, data, value }, notes },
  };
}

/* ------------------------------------------------------------------ */
/* Address masking                                                     */
/* ------------------------------------------------------------------ */

/** Letter-indexed placeholders so digits in them can't look like amounts. */
function placeholder(i: number): string {
  return `${String.fromCharCode(97 + i)}`;
}

function maskAddresses(text: string): { masked: string; addresses: string[] } {
  const addresses: string[] = [];
  // The lookahead stops a 64-hex hash from half-matching as an address.
  const masked = text.replace(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g, (match) => {
    addresses.push(match);
    return placeholder(addresses.length - 1);
  });
  return { masked, addresses };
}

/** Index of the address whose placeholder directly follows a keyword. */
function addressAfter(masked: string, keyword: RegExp): number | null {
  const re = new RegExp(
    `${keyword.source}[\\s"']*(?:the\\s+)?\\u0001([a-z])\\u0001`,
    'i',
  );
  const match = re.exec(masked);
  if (!match) return null;
  return match[1].charCodeAt(0) - 97;
}

/* ------------------------------------------------------------------ */
/* Chinese normalization                                               */
/* ------------------------------------------------------------------ */

/**
 * Chinese keyword → English grammar substitutions, applied before parsing
 * whenever the text contains CJK characters. The grammar below tolerates
 * any word order (verb, amount and address can appear anywhere), which is
 * what makes plain substitution sufficient — no separate Chinese grammar
 * to keep in sync.
 *
 * Ordering rules that matter:
 * - longer phrases before their substrings (转账给 before 转, 解封装 before 封装)
 * - unwrap words before wrap words (解封装 contains 封装)
 * - verb+给 compounds before the bare 给 → "to" rule
 *
 * Amounts must use digits (0.5, 100) — Chinese numerals are not read.
 */
const ZH_RULES: readonly [RegExp, string][] = [
  // politeness and topic markers — deleted so they can't look like tokens
  [/请|帮我|帮忙|麻烦|我想要|我要|我想|把|将/g, ' '],
  // "封装的 MON" is a NOUN — wrapped MON, i.e. WMON — not a wrap command
  [/封装的\s*mon\b/gi, ' wmon '],
  // fractions are ambiguous against a moving balance — surfaced as a
  // failure below, never guessed
  [/的一半|一半/g, ' half '],
  // unwrap before wrap: every variant here contains 封装 or 包
  [/解除封装|取消封装|解封装|解包|解封/g, ' unwrap '],
  [/封装|包装/g, ' wrap '],
  // convert forms drive the wrap/unwrap "convert" branch
  [/兑换成|换成|转换成/g, ' convert to '],
  [/兑换|转换/g, ' convert '],
  // send verbs — compounds with 给/到 first, then the bare verbs
  [/转账给|转给|发给|打给|发送到|发送给/g, ' send to '],
  [/发送|转账|支付/g, ' send '],
  [/转/g, ' send '],
  // approvals
  [/授权给/g, ' approve '],
  [/授权额度|的授权|的访问权|的权限/g, ' access '],
  [/授权|批准/g, ' approve '],
  [/允许/g, ' allow '],
  [/撤销|取消/g, ' revoke '],
  [/花费|使用|动用/g, ' spend '],
  // quantities
  [/无限量|无上限|无限/g, ' unlimited '],
  [/全部的|全部|所有的|所有/g, ' all '],
  [/我的/g, ' my '],
  // prepositions last, after every verb+给 compound has been consumed
  [/到|给/g, ' to '],
  [/对/g, ' '],
  // measure words and full-width punctuation
  [/[个枚颗]/g, ' '],
  [/，|。|！|？/g, ' '],
];

const HAS_CJK = /[一-鿿]/;

/**
 * Digit-with-multiplier amounts — 1万 (10,000), 3千 (3,000), 2.5亿 — are
 * the standard way Chinese speakers write large numbers. Silently taking
 * just the digits would prepare a transaction 10³–10⁸ times smaller than
 * asked, so the multiplier is expanded before parsing.
 */
const ZH_MULTIPLIERS: Record<string, number> = {
  百: 100,
  千: 1_000,
  万: 10_000,
  亿: 100_000_000,
};

function expandMultipliers(text: string): string {
  return text.replace(
    /(\d[\d,]*(?:\.\d+)?)\s*([百千万亿]+)/g,
    (_match, num: string, units: string) => {
      let value = Number(num.replace(/,/g, ''));
      for (const ch of units) value *= ZH_MULTIPLIERS[ch] ?? 1;
      // 1.23 × 10000 accumulates float dust; round it away.
      value = Math.round(value * 1e8) / 1e8;
      return ` ${value} `;
    },
  );
}

/** Rewrite a Chinese instruction into the English grammar; no-op otherwise. */
function normalizeChinese(text: string): string {
  if (!HAS_CJK.test(text)) return text;
  let out = expandMultipliers(text);
  for (const [pattern, replacement] of ZH_RULES) {
    out = out.replace(pattern, replacement);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/* ------------------------------------------------------------------ */
/* Wrap / unwrap — converting between native MON and WMON              */
/* ------------------------------------------------------------------ */

const WRAP_SUGGESTIONS = ['wrap 1 MON', 'wrap 0.5 MON into WMON'];
const UNWRAP_SUGGESTIONS = ['unwrap 2 WMON', 'unwrap all my WMON'];

/**
 * Detect "wrap 1 MON" / "unwrap 2 WMON" / "convert X mon to wmon".
 * Returns null when the sentence is not about wrapping at all, so the
 * caller can carry on with send / approve / revoke detection.
 *
 * Word boundaries do the heavy lifting: \bwrap\b does not match inside
 * "unwrap", and \bmon\b does not match inside "wmon".
 */
function parseWrapUnwrap(
  lower: string,
  masked: string,
  addressCount: number,
  lang: Lang = 'en',
): ParseResult | null {
  let action: 'wrap' | 'unwrap' | null = null;
  if (/\bunwrap\b/.test(lower)) {
    action = 'unwrap';
  } else if (/\bwrap\b/.test(lower)) {
    action = 'wrap';
  } else if (/\bconvert\b/.test(lower)) {
    // "convert 1 mon to wmon" wraps; "convert 2 wmon to mon" unwraps.
    // Whichever coin is named first is the one being converted away.
    const monIndex = lower.search(/\bmon(?:ad)?\b/);
    const wmonIndex = lower.search(/\bwmon\b/);
    if (monIndex !== -1 && wmonIndex !== -1) {
      action = monIndex < wmonIndex ? 'wrap' : 'unwrap';
    }
  }
  if (action === null) return null;

  // "wrap 1 MON and send it to 0x…" (or 封装…发给…) is TWO actions. The old
  // behavior — wrap and silently drop the send — discarded half the user's
  // instruction behind a misleading note. Refuse and ask them to split.
  if (addressCount > 0 && /\b(send|transfer|pay|move)\b/.test(lower)) {
    return failure(
      t(lang, 'int.wrapMixed'),
      ['wrap 1 MON then send 0.5 WMON to 0x<recipient>'],
    );
  }

  const notes: string[] = [];
  if (addressCount > 0) {
    notes.push(t(lang, 'int.wrapIgnoredAddress'));
  }

  const wantsAll = /\b(all|everything|entire balance|whole balance)\b/.test(lower);
  const numberMatch = /(\d[\d,]*(?:\.\d+)?)/.exec(masked);
  const amountValue = numberMatch ? numberMatch[1].replace(/,/g, '') : undefined;

  if (action === 'wrap') {
    if (amountValue === undefined && wantsAll) {
      return failure(
        t(lang, 'int.wrapAllFails'),
        WRAP_SUGGESTIONS,
      );
    }
    if (amountValue === undefined) {
      return failure(
        t(lang, 'int.wrapHowMuch'),
        WRAP_SUGGESTIONS,
      );
    }
    return {
      ok: true,
      intent: { action: 'wrap', amount: { value: amountValue }, notes },
    };
  }

  // unwrap
  if (wantsAll && amountValue === undefined) {
    return {
      ok: true,
      intent: { action: 'unwrap', amount: { all: true }, notes },
    };
  }
  if (amountValue === undefined) {
    return failure(
      t(lang, 'int.unwrapHowMuch'),
      UNWRAP_SUGGESTIONS,
    );
  }
  return {
    ok: true,
    intent: { action: 'unwrap', amount: { value: amountValue }, notes },
  };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export function parseIntent(text: string, lang: Lang = 'en'): ParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return failure(t(lang, 'int.empty'));
  }
  if (trimmed.startsWith('{')) return parseRawJson(trimmed, lang);

  const { masked, addresses } = maskAddresses(normalizeChinese(trimmed));
  const lower = masked.toLowerCase();
  const notes: string[] = [];

  /* ---- wrap / unwrap (checked first: these need no counterparty) ---- */
  const wrapResult = parseWrapUnwrap(lower, masked, addresses.length, lang);
  if (wrapResult) return wrapResult;

  /* ---- action ---- */
  const isRevoke = /\b(revoke|cancel)\b/.test(lower);
  // "access"/"permission" language without a revoke is an approval, even
  // when a transfer verb appears: 给 A 转 100 tUSD 的授权 means "give A the
  // authorization to transfer 100 tUSD" — an allowance, not a payment.
  const isApprove =
    !isRevoke &&
    (/\b(approve|allow|authorize)\b/.test(lower) || /\baccess\b/.test(lower));
  const isSend = !isRevoke && !isApprove && /\b(send|transfer|pay|move)\b/.test(lower);

  if (!isRevoke && !isApprove && !isSend) {
    return failure(
      t(lang, 'int.noAction'),
    );
  }

  /* ---- amount keywords ---- */
  // "half" (一半) of a balance that can change between reading and signing
  // is a guess we refuse to make.
  if (/\bhalf\b/.test(lower)) {
    return failure(
      t(lang, 'int.halfAmbiguous'),
    );
  }
  const wantsUnlimited = /\b(unlimited|infinite|max)\b/.test(lower);
  const wantsAll = /\b(all|everything|entire balance|whole balance)\b/.test(lower);

  /* ---- numeric amount (addresses are masked, so digits are safe) ---- */
  const numberMatch = /(\d[\d,]*(?:\.\d+)?)/.exec(masked);
  const amountValue = numberMatch ? numberMatch[1].replace(/,/g, '') : undefined;

  /* ---- token ---- */
  // 1. Glued form: "0.5MON" — letters immediately after the number.
  let tokenWord: string | undefined;
  if (numberMatch) {
    const after = masked.slice(numberMatch.index + numberMatch[0].length);
    const glued = /^([a-zA-Z][a-zA-Z0-9]{1,10})/.exec(after);
    if (glued) tokenWord = glued[1];
  }
  // 2. Otherwise: the first plausible symbol word that isn't reserved.
  if (!tokenWord) {
    const candidates: string[] = [];
    for (const word of masked.split(/[^a-zA-Z0-9']+/)) {
      const clean = word.replace(/'s$/i, '').replace(/'/g, '');
      if (!/^[a-zA-Z][a-zA-Z0-9]{1,10}$/.test(clean)) continue;
      const lowerWord = clean.toLowerCase();
      if (RESERVED.has(lowerWord)) continue;
      if (NATIVE_WORDS.has(lowerWord)) {
        candidates.push(clean);
        continue;
      }
      candidates.push(clean);
    }
    tokenWord = candidates[0];
    const distinct = new Set(candidates.map((c) => c.toLowerCase()));
    if (distinct.size > 1) {
      notes.push(
        t(lang, 'int.severalTokens', { token: tokenWord }),
      );
    }
  }

  const tokenIsNative = tokenWord !== undefined && NATIVE_WORDS.has(tokenWord.toLowerCase());
  let token: string | undefined = tokenIsNative ? undefined : tokenWord;

  /* ---- counterparty (and address-form token) ---- */
  let counterpartyIndex: number | null = null;
  if (isSend) {
    counterpartyIndex = addressAfter(masked, /\b(?:to|into)\b/) ?? (addresses.length === 1 ? 0 : null);
  } else {
    // approve / revoke: address right after the verb, or after for/to;
    // otherwise the first address mentioned.
    counterpartyIndex =
      addressAfter(masked, /\b(?:approve|allow|authorize|give|revoke|cancel|for|to)\b/) ??
      (addresses.length > 0 ? 0 : null);
  }

  if (counterpartyIndex === null) {
    return failure(
      isSend
        ? t(lang, 'int.needRecipient')
        : t(lang, 'int.needSpender'),
    );
  }

  // A second address in the sentence is almost always the token contract.
  if (addresses.length === 2 && token === undefined && !tokenIsNative) {
    const otherIndex = counterpartyIndex === 0 ? 1 : 0;
    token = addresses[otherIndex];
    notes.push(
      t(
        lang,
        isSend ? 'int.twoAddressesSend' : 'int.twoAddressesApprove',
        {
          first: addresses[counterpartyIndex].slice(0, 8),
          second: addresses[otherIndex].slice(0, 8),
        },
      ),
    );
  } else if (addresses.length > 2) {
    notes.push(t(lang, 'int.tooManyAddresses'));
  }

  /* ---- per-action validation & assembly ---- */

  if (isSend) {
    if (wantsUnlimited) {
      return failure(
        t(lang, 'int.unlimitedSend'),
        ['send 0.5 MON to 0x<recipient>', 'send all my MON to 0x<recipient>'],
      );
    }
    if (!wantsAll && amountValue === undefined) {
      return failure(
        t(lang, 'int.sendHowMuch'),
        ['send 0.5 MON to 0x<recipient>', 'send all my tUSD to 0x<recipient>'],
      );
    }
    // "把我所有的 tUSD 转 200 给 A" mentions "all" while asking for 200.
    // The explicit number wins — sending the entire balance because the
    // word 所有 appeared somewhere would be the worse surprise.
    const useAll = wantsAll && amountValue === undefined;
    if (wantsAll && amountValue !== undefined) {
      notes.push(
        t(lang, 'int.allAndNumber', { n: amountValue }),
      );
    }
    if (token === undefined && !tokenIsNative && HAS_CJK.test(masked)) {
      // Words we could not translate remain — one of them is probably the
      // token's name. Guessing "native MON" here would move the wrong asset.
      return failure(
        t(lang, 'int.tokenNameUnreadable'),
      );
    }
    if (token === undefined && !tokenIsNative && amountValue !== undefined) {
      notes.push(t(lang, 'int.assumedNative'));
    }
    return {
      ok: true,
      intent: {
        action: 'send',
        token,
        amount: useAll ? { all: true } : { value: amountValue },
        counterparty: addresses[counterpartyIndex],
        notes,
      },
    };
  }

  if (isApprove) {
    if (token === undefined) {
      return failure(
        t(lang, 'int.approveWhichToken'),
        ['approve 0x<app> to spend 100 tUSD', 'allow 0x<app> to spend unlimited tUSD'],
      );
    }
    if (!wantsUnlimited && amountValue === undefined) {
      return failure(
        t(lang, 'int.approveHowMuch'),
        ['approve 0x<app> to spend 100 tUSD', 'allow 0x<app> to spend unlimited tUSD'],
      );
    }
    return {
      ok: true,
      intent: {
        action: 'approve',
        token,
        amount: wantsUnlimited ? { unlimited: true } : { value: amountValue },
        counterparty: addresses[counterpartyIndex],
        notes,
      },
    };
  }

// revoke
if (token === undefined) {
    return failure(
      t(lang, 'int.revokeWhichToken'),
      ["revoke 0x<app>'s access to my tUSD", 'cancel the approval for 0x<app> on tUSD'],
    );
  }
  return {
    ok: true,
    intent: {
      action: 'revoke',
      token,
      counterparty: addresses[counterpartyIndex],
      notes,
    },
  };
}
