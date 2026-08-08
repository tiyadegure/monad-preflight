/**
 * Simulation drift detection.
 *
 * A simulation is a snapshot of chain state at one block. If the user
 * reads the plan for two minutes before signing, the world may have
 * moved — a pool re-priced, a balance drained, an approval revoked.
 * PreFlight re-simulates just before signing and this module tells the
 * user IF and HOW the answer changed.
 *
 * Pure and deterministic: same inputs, same report. Amounts are rendered
 * through an injected formatter (never imported) so the module stays
 * dependency-free and every formatted string is observable in tests.
 * Comparison is order-independent: asset lines are matched by
 * (party, token) and approvals by (owner, spender, token).
 */

import type { ApprovalChange, AssetChange, SimulationResult, TokenInfo } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';

/* ------------------------------------------------------------------ */
/* Public contract                                                     */
/* ------------------------------------------------------------------ */

export type DriftLevel = 'none' | 'cosmetic' | 'material';

export interface DriftReport {
  level: DriftLevel;
  headline: string;
  changes: string[];
  staleSeconds: number;
}

export type FormatTokenFn = (raw: bigint, token: TokenInfo) => string;

export interface CompareOptions {
  /** When the first simulation ran (ms since epoch). */
  simulatedAtMs: number;
  /** The current time (ms since epoch). */
  nowMs: number;
  /** Renders a raw amount as human text, e.g. "0.5 MON". */
  formatToken: FormatTokenFn;
  /** UI language for the friendly report. */
  lang?: Lang;
}

/* ------------------------------------------------------------------ */
/* Fixed copy                                                          */
/* ------------------------------------------------------------------ */

function headlineFor(level: DriftLevel, lang: Lang): string {
  switch (level) {
    case 'material':
      return t(lang, 'drift.headline.material');
    case 'cosmetic':
      return t(lang, 'drift.headline.cosmetic');
    case 'none':
      return t(lang, 'drift.headline.none');
  }
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * "0x1234…abcd" — local copy of the shortener so this module keeps
 * zero imports beyond types.
 */
function shortAddr(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function absBig(x: bigint): bigint {
  return x < 0n ? -x : x;
}

function tokenKey(token: TokenInfo): string {
  return token.address ? token.address.toLowerCase() : 'native';
}

function assetKey(change: AssetChange): string {
  return `${change.party.toLowerCase()}|${tokenKey(change.token)}`;
}

function approvalKey(change: ApprovalChange): string {
  return `${change.owner.toLowerCase()}|${change.spender.toLowerCase()}|${tokenKey(change.token)}`;
}

/**
 * Index asset lines by (party, token), merging duplicates by summing and
 * dropping lines that net to zero — a zero line and a missing line mean
 * the same thing: nothing moves.
 */
function indexAssets(changes: AssetChange[]): Map<string, AssetChange> {
  const map = new Map<string, AssetChange>();
  for (const change of changes) {
    const key = assetKey(change);
    const existing = map.get(key);
    if (existing) {
      map.set(key, { ...existing, deltaRaw: existing.deltaRaw + change.deltaRaw });
    } else {
      map.set(key, { ...change });
    }
  }
  for (const [key, entry] of map) {
    if (entry.deltaRaw === 0n) map.delete(key);
  }
  return map;
}

/**
 * Index approvals by (owner, spender, token). If the same permission is
 * set twice in one transaction, the last write is the one that sticks.
 */
function indexApprovals(changes: ApprovalChange[]): Map<string, ApprovalChange> {
  const map = new Map<string, ApprovalChange>();
  for (const change of changes) map.set(approvalKey(change), change);
  return map;
}

/**
 * Did the amount move by more than 1%? Pure bigint math:
 * |a - b| * 100 > |a|. Both sides are known non-zero here (zero lines
 * were dropped during indexing, so from/to-zero shows up as a line
 * appearing or disappearing — always material).
 */
function movedOverOnePercent(a: bigint, b: bigint): boolean {
  if (a === b) return false;
  if (a === 0n || b === 0n) return true;
  return absBig(a - b) * 100n > absBig(a);
}

function directionWord(delta: bigint): 'send' | 'receive' {
  return delta < 0n ? 'send' : 'receive';
}

/* ------------------------------------------------------------------ */
/* Change lines                                                        */
/* ------------------------------------------------------------------ */

function describeAmountShift(
  a: AssetChange,
  b: AssetChange,
  formatToken: FormatTokenFn,
  lang: Lang,
): string {
  const wasVerb = directionWord(a.deltaRaw);
  const nowVerb = directionWord(b.deltaRaw);
  const beforeAmount = formatToken(absBig(a.deltaRaw), a.token);
  const afterAmount = formatToken(absBig(b.deltaRaw), b.token);
  if (wasVerb !== nowVerb) {
    return t(lang, 'drift.amountFlip', {
      wasVerb: t(lang, wasVerb === 'send' ? 'drift.verbSend' : 'drift.verbReceive'),
      beforeAmount,
      nowVerb: t(lang, nowVerb === 'send' ? 'drift.verbSend' : 'drift.verbReceive'),
      afterAmount,
    });
  }
  return t(lang, 'drift.amountShift', {
    nowVerb: t(lang, nowVerb === 'send' ? 'drift.verbSend' : 'drift.verbReceive'),
    afterAmount,
    beforeAmount,
  });
}

function describeAssetAppeared(b: AssetChange, formatToken: FormatTokenFn, lang: Lang): string {
  const amount = formatToken(absBig(b.deltaRaw), b.token);
  return b.deltaRaw < 0n
    ? t(lang, 'drift.paymentFromAppeared', {
        amount,
        party: shortAddr(b.party),
      })
    : t(lang, 'drift.paymentToAppeared', {
        amount,
        party: shortAddr(b.party),
      });
}

function describeAssetDisappeared(a: AssetChange, lang: Lang): string {
  return a.deltaRaw < 0n
    ? t(lang, 'drift.paymentFromGone', { party: shortAddr(a.party) })
    : t(lang, 'drift.paymentToGone', { party: shortAddr(a.party) });
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export function compareSimulations(
  before: SimulationResult,
  after: SimulationResult,
  opts: CompareOptions,
): DriftReport {
  const { formatToken, lang = 'en' } = opts;
  // Anything in materialLines changes what the user is agreeing to.
  const materialLines: string[] = [];
  // Cosmetic lines are still shown, but never change the level past 'cosmetic'.
  const cosmeticLines: string[] = [];

  /* ---- outcome flip: the answer itself changed ---- */
  if (before.ok !== after.ok) {
    materialLines.push(
      after.ok
        ? t(lang, 'drift.wouldGoThrough')
        : t(lang, 'drift.wouldFail'),
    );
  }

  /* ---- asset lines, matched by (party, token) — order never matters ---- */
  const beforeAssets = indexAssets(before.assetChanges);
  const afterAssets = indexAssets(after.assetChanges);
  const assetKeys = new Set([...beforeAssets.keys(), ...afterAssets.keys()]);
  for (const key of assetKeys) {
    const a = beforeAssets.get(key);
    const b = afterAssets.get(key);
    if (a && !b) {
      materialLines.push(describeAssetDisappeared(a, lang));
    } else if (!a && b) {
      materialLines.push(describeAssetAppeared(b, formatToken, lang));
    } else if (a && b && a.deltaRaw !== b.deltaRaw && movedOverOnePercent(a.deltaRaw, b.deltaRaw)) {
      materialLines.push(describeAmountShift(a, b, formatToken, lang));
    }
    // A wobble of 1% or less is the same plan for all practical purposes —
    // it neither makes the report material nor earns a line.
  }

  /* ---- approvals, matched by (owner, spender, token) ---- */
  const beforeApprovals = indexApprovals(before.approvalChanges);
  const afterApprovals = indexApprovals(after.approvalChanges);
  const approvalKeys = new Set([...beforeApprovals.keys(), ...afterApprovals.keys()]);
  for (const key of approvalKeys) {
    const a = beforeApprovals.get(key);
    const b = afterApprovals.get(key);
    if (a && !b) {
      materialLines.push(
        t(lang, 'drift.approvalGone', {
          spender: shortAddr(a.spender),
          symbol: a.token.symbol,
        }),
      );
    } else if (!a && b) {
      if (b.unlimited) {
        materialLines.push(
          t(lang, 'drift.approvalNewUnlimited', {
            spender: shortAddr(b.spender),
            symbol: b.token.symbol,
          }),
        );
      } else {
        materialLines.push(
          t(lang, 'drift.approvalNewCapped', {
            spender: shortAddr(b.spender),
            amount: formatToken(b.amountRaw, b.token),
          }),
        );
      }
    } else if (a && b) {
      if (a.unlimited !== b.unlimited) {
        materialLines.push(
          b.unlimited
            ? t(lang, 'drift.approvalNowUnlimited')
            : t(lang, 'drift.approvalNowCapped', {
                amount: formatToken(b.amountRaw, b.token),
              }),
        );
      } else if (!a.unlimited && a.amountRaw !== b.amountRaw) {
        // Both limited but the cap moved — that changes what is agreed to.
        materialLines.push(
          t(lang, 'drift.approvalCapMoved', {
            spender: shortAddr(b.spender),
            amount: formatToken(b.amountRaw, b.token),
            before: formatToken(a.amountRaw, a.token),
          }),
        );
      }
      // Both unlimited: the raw numbers may differ, but "everything" is
      // "everything" — nothing meaningful changed.
    }
  }

  /* ---- gas: cosmetic on its own ---- */
  if (before.gasUsed !== after.gasUsed || before.gasCostWei !== after.gasCostWei) {
    if (after.gasCostWei > before.gasCostWei) {
      cosmeticLines.push(t(lang, 'drift.gasUp'));
    } else if (after.gasCostWei < before.gasCostWei) {
      cosmeticLines.push(t(lang, 'drift.gasDown'));
    } else {
      cosmeticLines.push(t(lang, 'drift.gasMoved'));
    }
  }

  /* ---- notes: cosmetic on its own ---- */
  const notesDiffer =
    before.notes.length !== after.notes.length ||
    before.notes.some((note, i) => note !== after.notes[i]);
  if (notesDiffer) {
    cosmeticLines.push(t(lang, 'drift.notesChanged'));
  }

  const level: DriftLevel =
    materialLines.length > 0 ? 'material' : cosmeticLines.length > 0 ? 'cosmetic' : 'none';

  return {
    level,
    headline: headlineFor(level, lang),
    changes: [...materialLines, ...cosmeticLines],
    staleSeconds: Math.max(0, Math.round((opts.nowMs - opts.simulatedAtMs) / 1000)),
  };
}
