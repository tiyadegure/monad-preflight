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
}

/* ------------------------------------------------------------------ */
/* Fixed copy                                                          */
/* ------------------------------------------------------------------ */

const HEADLINES: Record<DriftLevel, string> = {
  material:
    'The chain moved while you were reading — this transaction no longer does the same thing.',
  cosmetic: 'Only the network fee estimate moved. What the transaction does is unchanged.',
  none: 'Nothing changed — the plan is still accurate.',
};

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

function describeAmountShift(a: AssetChange, b: AssetChange, formatToken: FormatTokenFn): string {
  const wasVerb = directionWord(a.deltaRaw);
  const nowVerb = directionWord(b.deltaRaw);
  const beforeAmount = formatToken(absBig(a.deltaRaw), a.token);
  const afterAmount = formatToken(absBig(b.deltaRaw), b.token);
  if (wasVerb !== nowVerb) {
    return `Before you would ${wasVerb} ${beforeAmount}; now you would ${nowVerb} ${afterAmount}.`;
  }
  return `You would now ${nowVerb} ${afterAmount} instead of ${beforeAmount}.`;
}

function describeAssetAppeared(b: AssetChange, formatToken: FormatTokenFn): string {
  const amount = formatToken(absBig(b.deltaRaw), b.token);
  return b.deltaRaw < 0n
    ? `A payment of ${amount} from ${shortAddr(b.party)} is now part of this transaction.`
    : `A payment of ${amount} to ${shortAddr(b.party)} is now part of this transaction.`;
}

function describeAssetDisappeared(a: AssetChange): string {
  return a.deltaRaw < 0n
    ? `A payment from ${shortAddr(a.party)} is no longer part of this transaction.`
    : `A payment to ${shortAddr(a.party)} is no longer part of this transaction.`;
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export function compareSimulations(
  before: SimulationResult,
  after: SimulationResult,
  opts: CompareOptions,
): DriftReport {
  const { formatToken } = opts;
  // Anything in materialLines changes what the user is agreeing to.
  const materialLines: string[] = [];
  // Cosmetic lines are still shown, but never change the level past 'cosmetic'.
  const cosmeticLines: string[] = [];

  /* ---- outcome flip: the answer itself changed ---- */
  if (before.ok !== after.ok) {
    materialLines.push(
      after.ok
        ? 'This transaction would now go through, where before it would have failed.'
        : 'This transaction would now fail, where before it would have gone through.',
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
      materialLines.push(describeAssetDisappeared(a));
    } else if (!a && b) {
      materialLines.push(describeAssetAppeared(b, formatToken));
    } else if (a && b && a.deltaRaw !== b.deltaRaw && movedOverOnePercent(a.deltaRaw, b.deltaRaw)) {
      materialLines.push(describeAmountShift(a, b, formatToken));
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
        `The approval letting ${shortAddr(a.spender)} spend your ${a.token.symbol} is no longer part of this transaction.`,
      );
    } else if (!a && b) {
      const scope = b.unlimited
        ? `an unlimited amount of your ${b.token.symbol}`
        : `up to ${formatToken(b.amountRaw, b.token)} of yours`;
      materialLines.push(
        `A new approval is now part of this transaction: it would let ${shortAddr(b.spender)} spend ${scope}.`,
      );
    } else if (a && b) {
      if (a.unlimited !== b.unlimited) {
        materialLines.push(
          b.unlimited
            ? 'The approval is now unlimited, where before it had a limit.'
            : `The approval now has a limit of ${formatToken(b.amountRaw, b.token)}, where before it was unlimited.`,
        );
      } else if (!a.unlimited && a.amountRaw !== b.amountRaw) {
        // Both limited but the cap moved — that changes what is agreed to.
        materialLines.push(
          `${shortAddr(b.spender)} could now spend up to ${formatToken(b.amountRaw, b.token)} instead of ${formatToken(a.amountRaw, a.token)}.`,
        );
      }
      // Both unlimited: the raw numbers may differ, but "everything" is
      // "everything" — nothing meaningful changed.
    }
  }

  /* ---- gas: cosmetic on its own ---- */
  if (before.gasUsed !== after.gasUsed || before.gasCostWei !== after.gasCostWei) {
    if (after.gasCostWei > before.gasCostWei) {
      cosmeticLines.push('The network fee estimate went up.');
    } else if (after.gasCostWei < before.gasCostWei) {
      cosmeticLines.push('The network fee estimate went down.');
    } else {
      cosmeticLines.push('The network fee estimate moved slightly.');
    }
  }

  /* ---- notes: cosmetic on its own ---- */
  const notesDiffer =
    before.notes.length !== after.notes.length ||
    before.notes.some((note, i) => note !== after.notes[i]);
  if (notesDiffer) {
    cosmeticLines.push(
      'Some background notes changed; they do not affect what the transaction does.',
    );
  }

  const level: DriftLevel =
    materialLines.length > 0 ? 'material' : cosmeticLines.length > 0 ? 'cosmetic' : 'none';

  return {
    level,
    headline: HEADLINES[level],
    changes: [...materialLines, ...cosmeticLines],
    staleSeconds: Math.max(0, Math.round((opts.nowMs - opts.simulatedAtMs) / 1000)),
  };
}
