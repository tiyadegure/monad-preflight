/**
 * Portfolio exposure report for Monad PreFlight.
 *
 * Answers one question in a plain number: "how much of my money is
 * currently reachable by someone else?" It combines live balances with
 * live spending permissions and shows, token by token, what could be
 * taken out of the wallet right now — the number that makes people
 * revoke.
 *
 * Pure function, no chain access: the app shell gathers balances and
 * permissions elsewhere and passes them in.
 */

import type { Address, TokenInfo } from './types';
import { UNLIMITED_THRESHOLD } from './format';
import { t } from './i18n';
import type { Lang } from './i18n';

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/* ------------------------------------------------------------------ */

export interface ExposureLine {
  token: TokenInfo;
  /** What the wallet holds right now, in raw token units */
  balanceRaw: bigint;
  /** How much of that balance someone else could take right now */
  exposedRaw: bigint;
  /** Spenders that can take an unlimited amount of this token */
  unlimitedSpenders: Address[];
  /** Spenders whose permission is capped at some amount */
  limitedSpenders: Address[];
  /**
   * False when this token was not in the balances we were given — its
   * balance is unknown, not zero. Callers must not tell the user they
   * hold nothing on the strength of a read that never happened.
   */
  balanceKnown: boolean;
  /** True when the entire (non-zero) balance is reachable */
  fullyExposed: boolean;
}

export interface ExposureReport {
  lines: ExposureLine[];
  /** Lines where someone could take a non-zero amount right now */
  totalTokensAtRisk: number;
  /** Total unlimited (token, spender) pairs across the wallet */
  unlimitedCount: number;
  /** One or two plain sentences summing up the whole wallet */
  headline: string;
  /** Plain, actionable next steps */
  advice: string[];
}

export interface ExposureInput {
  balances: { token: TokenInfo; raw: bigint }[];
  approvals: {
    token: TokenInfo;
    spender: Address;
    allowanceRaw: bigint;
    unlimited: boolean;
  }[];
}

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

interface SpenderFacts {
  address: Address;
  unlimited: boolean;
  allowanceRaw: bigint;
}

interface TokenBucket {
  token: TokenInfo;
  /** Keyed by lowercased spender address so duplicates merge */
  spenders: Map<string, SpenderFacts>;
}

function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

/* ------------------------------------------------------------------ */
/* Report                                                              */
/* ------------------------------------------------------------------ */

export function computeExposure(input: ExposureInput, lang: Lang = 'en'): ExposureReport {
  // Balances keyed by lowercased token address. Native MON (address
  // null) can never be granted to a spender, so it never joins a line.
  const balanceByToken = new Map<string, { token: TokenInfo; raw: bigint }>();
  for (const b of input.balances) {
    if (b.token.address === null) continue;
    const key = b.token.address.toLowerCase();
    if (!balanceByToken.has(key)) balanceByToken.set(key, { token: b.token, raw: b.raw });
  }

  // One bucket per token that has at least one live permission.
  const buckets = new Map<string, TokenBucket>();
  for (const a of input.approvals) {
    // Native MON cannot be approved — a record claiming so is bogus.
    if (a.token.address === null) continue;
    const unlimited = a.unlimited || a.allowanceRaw >= UNLIMITED_THRESHOLD;
    // A capped permission of zero is already closed — nothing to report.
    if (!unlimited && a.allowanceRaw === 0n) continue;

    const key = a.token.address.toLowerCase();
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { token: a.token, spenders: new Map() };
      buckets.set(key, bucket);
    }
    const spenderKey = a.spender.toLowerCase();
    const prev = bucket.spenders.get(spenderKey);
    if (prev) {
      // Same spender listed twice: unlimited wins; otherwise keep the
      // larger cap — safer to overstate exposure than to hide it.
      prev.unlimited = prev.unlimited || unlimited;
      if (a.allowanceRaw > prev.allowanceRaw) prev.allowanceRaw = a.allowanceRaw;
    } else {
      bucket.spenders.set(spenderKey, {
        address: a.spender,
        unlimited,
        allowanceRaw: a.allowanceRaw,
      });
    }
  }

  const lines: ExposureLine[] = [];
  for (const [key, bucket] of buckets) {
    const balanceEntry = balanceByToken.get(key);
    // Absent from the balances list means UNCHECKED, not zero. Reporting
    // "you do not hold any" for a token we never read would hide real
    // exposure behind a reassuring sentence.
    const balanceKnown = balanceEntry !== undefined;
    const balanceRaw = balanceEntry?.raw ?? 0n;
    const token = balanceEntry?.token ?? bucket.token;

    const unlimitedSpenders: Address[] = [];
    const limitedSpenders: Address[] = [];
    let cappedSum = 0n;
    for (const s of bucket.spenders.values()) {
      if (s.unlimited) {
        unlimitedSpenders.push(s.address);
      } else {
        limitedSpenders.push(s.address);
        cappedSum += s.allowanceRaw;
      }
    }

    // A permission bigger than the balance can still only take the
    // balance; an unlimited permission reaches the whole balance.
    const exposedRaw =
      unlimitedSpenders.length > 0 ? balanceRaw : minBig(balanceRaw, cappedSum);
    const fullyExposed = balanceRaw > 0n && exposedRaw >= balanceRaw;

    lines.push({
      token,
      balanceRaw,
      exposedRaw,
      unlimitedSpenders,
      limitedSpenders,
      fullyExposed,
      balanceKnown,
    });
  }

  lines.sort((a, b) => {
    if (a.fullyExposed !== b.fullyExposed) return a.fullyExposed ? -1 : 1;
    if (a.unlimitedSpenders.length !== b.unlimitedSpenders.length) {
      return b.unlimitedSpenders.length - a.unlimitedSpenders.length;
    }
    return a.token.symbol.localeCompare(b.token.symbol);
  });

  const totalTokensAtRisk = lines.filter((l) => l.exposedRaw > 0n).length;
  const unlimitedCount = lines.reduce((n, l) => n + l.unlimitedSpenders.length, 0);

  return {
    lines,
    totalTokensAtRisk,
    unlimitedCount,
    headline: buildHeadline(totalTokensAtRisk, unlimitedCount, lang),
    advice: buildAdvice(lines, lang),
  };
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

function buildHeadline(
  totalTokensAtRisk: number,
  unlimitedCount: number,
  lang: Lang,
): string {
  const exposureSentence = t(lang, 'port.headlineSome', {
    n: totalTokensAtRisk,
  });
  const unlimitedSentence =
    unlimitedCount === 1
      ? t(lang, 'port.headlineUnlimitedOne')
      : t(lang, 'port.headlineUnlimitedMany', { n: unlimitedCount });

  if (unlimitedCount > 0) {
    return totalTokensAtRisk > 0
      ? `${unlimitedSentence} ${exposureSentence}`
      : unlimitedSentence;
  }
  if (totalTokensAtRisk > 0) return exposureSentence;
  return t(lang, 'port.headlineNone');
}

function buildAdvice(lines: ExposureLine[], lang: Lang): string[] {
  if (lines.length === 0) return [];

  const advice: string[] = [];
  const unlimitedFunded = lines.filter(
    (l) => l.unlimitedSpenders.length > 0 && l.balanceRaw > 0n,
  );
  const unlimitedEmpty = lines.filter(
    (l) => l.unlimitedSpenders.length > 0 && l.balanceKnown && l.balanceRaw === 0n,
  );
  // Approvals on tokens whose balance we never read. We cannot say whether
  // funds are at risk, so we say exactly that.
  const unlimitedUnknown = lines.filter(
    (l) => l.unlimitedSpenders.length > 0 && !l.balanceKnown,
  );

  if (unlimitedFunded.length > 0) {
    const names = unlimitedFunded.map((l) => l.token.symbol).join(', ');
    advice.push(
      unlimitedFunded.length === 1
        ? t(lang, 'port.advice.unlimitedFundedOne', { names })
        : t(lang, 'port.advice.unlimitedFundedMany', { names }),
    );
  }

  if (unlimitedEmpty.length > 0) {
    const names = unlimitedEmpty.map((l) => l.token.symbol).join(', ');
    advice.push(t(lang, 'port.advice.unlimitedEmpty', { names }));
  }

  if (unlimitedUnknown.length > 0) {
    const names = unlimitedUnknown.map((l) => l.token.symbol).join(', ');
    advice.push(
      t(lang, 'port.advice.unlimitedUnknown', {
        names,
        itThem:
          unlimitedUnknown.length === 1
            ? t(lang, 'port.advice.itThemOne')
            : t(lang, 'port.advice.itThemMany'),
      }),
    );
  }

  if (unlimitedFunded.length === 0 && unlimitedEmpty.length === 0) {
    advice.push(t(lang, 'port.advice.capped'));
  }

  advice.push(t(lang, 'port.advice.fee'));
  advice.push(t(lang, 'port.advice.noExpiry'));

  return advice;
}
