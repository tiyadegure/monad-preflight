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

export function computeExposure(input: ExposureInput): ExposureReport {
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

    lines.push({ token, balanceRaw, exposedRaw, unlimitedSpenders, limitedSpenders, fullyExposed });
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
    headline: buildHeadline(totalTokensAtRisk, unlimitedCount),
    advice: buildAdvice(lines),
  };
}

/* ------------------------------------------------------------------ */
/* Words                                                               */
/* ------------------------------------------------------------------ */

function buildHeadline(totalTokensAtRisk: number, unlimitedCount: number): string {
  const exposureSentence = `${totalTokensAtRisk} of your tokens can be spent by someone else right now.`;
  const unlimitedSentence =
    unlimitedCount === 1
      ? '1 unlimited permission is open on this wallet.'
      : `${unlimitedCount} unlimited permissions are open on this wallet.`;

  if (unlimitedCount > 0) {
    return totalTokensAtRisk > 0
      ? `${unlimitedSentence} ${exposureSentence}`
      : unlimitedSentence;
  }
  if (totalTokensAtRisk > 0) return exposureSentence;
  return 'Nothing in this wallet can be spent by anyone else.';
}

function buildAdvice(lines: ExposureLine[]): string[] {
  if (lines.length === 0) return [];

  const advice: string[] = [];
  const unlimitedFunded = lines.filter(
    (l) => l.unlimitedSpenders.length > 0 && l.balanceRaw > 0n,
  );
  const unlimitedEmpty = lines.filter(
    (l) => l.unlimitedSpenders.length > 0 && l.balanceRaw === 0n,
  );

  if (unlimitedFunded.length > 0) {
    const names = unlimitedFunded.map((l) => l.token.symbol).join(', ');
    advice.push(
      unlimitedFunded.length === 1
        ? `Start with ${names}: cancel (revoke) the unlimited access to it — you hold this token right now, so it can be taken at any moment.`
        : `Start with ${names}: cancel (revoke) the unlimited access to them — you hold these tokens right now, so they can be taken at any moment.`,
    );
  }

  if (unlimitedEmpty.length > 0) {
    const names = unlimitedEmpty.map((l) => l.token.symbol).join(', ');
    advice.push(
      `You do not hold any ${names} right now, but the unlimited access is still open. Cancel (revoke) it before you add funds — otherwise anything you deposit can be taken straight away.`,
    );
  }

  if (unlimitedFunded.length === 0 && unlimitedEmpty.length === 0) {
    advice.push(
      'None of this access is unlimited, but it is still safest to cancel (revoke) any permission you no longer use.',
    );
  }

  advice.push(
    'Cancelling a permission is a normal transaction, so each one costs a small network fee.',
  );
  advice.push(
    'Permissions never expire on their own — they stay open until you cancel them, even if the app that asked for them is long gone.',
  );

  return advice;
}
