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
  'coin', 'coins', 'entire', 'everything', 'for', 'from', 'give', 'in',
  'infinite', 'into', 'it', 'max', 'me', 'move', 'my', 'native', 'of',
  'on', 'out', 'pay', 'permission', 'please', 'remove', 'revoke', 'send',
  'spend', 'spending', 'the', 'their', 'them', 'to', 'token', 'tokens',
  'transfer', 'unlimited', 'up', 'wallet', 'whole', 'your',
]);

/** mon / monad mean the native coin → represented as token: undefined. */
const NATIVE_WORDS = new Set(['mon', 'monad']);

function failure(reason: string, suggestions = DEFAULT_SUGGESTIONS): ParseFailure {
  return { ok: false, reason, suggestions };
}

/* ------------------------------------------------------------------ */
/* Raw transaction JSON ("explain this before I sign it")              */
/* ------------------------------------------------------------------ */

function parseRawJson(text: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return failure(
      'That looks like a transaction in JSON form, but the JSON is not valid — copy it again from the source app.',
      [RAW_SUGGESTION],
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return failure(
      'A raw transaction should be a JSON object with at least a "to" address.',
      [RAW_SUGGESTION],
    );
  }
  const record = parsed as Record<string, unknown>;
  const to = typeof record.to === 'string' ? record.to.trim() : '';
  if (!isAddressFormat(to)) {
    return failure(
      'A raw transaction needs a "to" address — 0x followed by 40 hex characters.',
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
    notes.push('The value was a plain number, so I read it as an amount of MON.');
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

  const notes: string[] = [];
  if (addressCount > 0) {
    notes.push(
      'Wrapping happens entirely inside your own wallet, so I ignored the address in your message.',
    );
  }

  const wantsAll = /\b(all|everything|entire balance|whole balance)\b/.test(lower);
  const numberMatch = /(\d[\d,]*(?:\.\d+)?)/.exec(masked);
  const amountValue = numberMatch ? numberMatch[1].replace(/,/g, '') : undefined;

  if (action === 'wrap') {
    if (amountValue === undefined && wantsAll) {
      return failure(
        'Wrapping your entire balance would leave no MON to pay the network fee with, ' +
          'so the transaction would fail. Pick a number instead, like "wrap 1 MON".',
        WRAP_SUGGESTIONS,
      );
    }
    if (amountValue === undefined) {
      return failure(
        'How much MON do you want to wrap? Add an amount, like "wrap 1 MON".',
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
      'How much WMON do you want to unwrap? Add an amount, like "unwrap 2 WMON" — or say "all".',
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

export function parseIntent(text: string): ParseResult {
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return failure('Tell me what you want to do and I will prepare it for you.');
  }
  if (trimmed.startsWith('{')) return parseRawJson(trimmed);

  const { masked, addresses } = maskAddresses(trimmed);
  const lower = masked.toLowerCase();
  const notes: string[] = [];

  /* ---- wrap / unwrap (checked first: these need no counterparty) ---- */
  const wrapResult = parseWrapUnwrap(lower, masked, addresses.length);
  if (wrapResult) return wrapResult;

  /* ---- action ---- */
  const isRevoke = /\b(revoke|cancel)\b/.test(lower);
  const isApprove =
    !isRevoke &&
    (/\b(approve|allow|authorize)\b/.test(lower) ||
      (/\bgive\b/.test(lower) && /\baccess\b/.test(lower)));
  const isSend = !isRevoke && !isApprove && /\b(send|transfer|pay|move)\b/.test(lower);

  if (!isRevoke && !isApprove && !isSend) {
    return failure(
      'I did not catch what you want to do. I can send MON or tokens, approve spending, revoke an approval, or wrap MON into WMON and back.',
    );
  }

  /* ---- amount keywords ---- */
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
        `Several words could be the token name — I went with "${tokenWord}".`,
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
        ? 'I need a recipient — include the full address (0x followed by 40 characters) you want to send to.'
        : 'I need the address of the app or wallet the approval is for — include the full 0x… address.',
    );
  }

  // A second address in the sentence is almost always the token contract.
  if (addresses.length === 2 && token === undefined && !tokenIsNative) {
    const otherIndex = counterpartyIndex === 0 ? 1 : 0;
    token = addresses[otherIndex];
    notes.push(
      `Two addresses found — I treated ${addresses[counterpartyIndex].slice(0, 8)}… as the ${isSend ? 'recipient' : 'spender'} and ${addresses[otherIndex].slice(0, 8)}… as the token.`,
    );
  } else if (addresses.length > 2) {
    notes.push('More than two addresses found — I used the first ones and ignored the rest.');
  }

  /* ---- per-action validation & assembly ---- */

  if (isSend) {
    if (wantsUnlimited) {
      return failure(
        '"Unlimited" only makes sense for approvals. To send, give a number — or say "all" to send your whole balance.',
        ['send 0.5 MON to 0x<recipient>', 'send all my MON to 0x<recipient>'],
      );
    }
    if (!wantsAll && amountValue === undefined) {
      return failure(
        'How much do you want to send? Add an amount, like "send 0.5 MON to 0x…", or say "all".',
        ['send 0.5 MON to 0x<recipient>', 'send all my tUSD to 0x<recipient>'],
      );
    }
    if (token === undefined && !tokenIsNative && amountValue !== undefined) {
      notes.push('No token named — I assumed you mean native MON.');
    }
    return {
      ok: true,
      intent: {
        action: 'send',
        token,
        amount: wantsAll ? { all: true } : { value: amountValue },
        counterparty: addresses[counterpartyIndex],
        notes,
      },
    };
  }

  if (isApprove) {
    if (token === undefined) {
      return failure(
        'Which token is this approval for? MON itself cannot be approved — name a token, like "approve 0x… to spend 100 tUSD".',
        ['approve 0x<app> to spend 100 tUSD', 'allow 0x<app> to spend unlimited tUSD'],
      );
    }
    if (!wantsUnlimited && amountValue === undefined) {
      return failure(
        'How much should they be allowed to spend? Give an amount, or say "unlimited".',
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
      'Which token do you want to revoke access to? Name it, like "revoke 0x…\'s access to my tUSD".',
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
