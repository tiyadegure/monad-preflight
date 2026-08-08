import type { RiskFinding, SimulationResult } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';

/**
 * Flight-readiness score: one number and one word for the whole plan.
 *
 * People do not read fifteen findings. They read one signal, and *then*
 * the findings that explain it. The score is a deterministic function of
 * the findings and the simulation — no model, no heuristics that drift.
 *
 * Scale: 0–100, starting at 100 and deducting per finding. The band
 * boundaries are chosen so that a single danger finding can never land in
 * "clear", and a plan that would revert can never score above "grounded".
 */

export type ReadinessBand = 'clear' | 'caution' | 'grounded';

export interface Readiness {
  score: number;
  band: ReadinessBand;
  /** Short verdict word shown next to the score. */
  verdict: string;
  /** One sentence a newcomer can act on. */
  advice: string;
  counts: { danger: number; caution: number; info: number };
}

/**
 * Weights per severity. Danger is deliberately heavy: two danger findings
 * alone floor the score into "grounded".
 */
const WEIGHTS: Record<RiskFinding['severity'], number> = {
  danger: 34,
  caution: 12,
  info: 3,
};

/** Findings that make the transaction pointless or impossible, not merely risky. */
const FATAL_IDS = new Set(['simulation-reverted', 'insufficient-balance', 'zero-address']);

export function scorePlan(
  sim: SimulationResult,
  risks: RiskFinding[],
  lang: Lang = 'en',
): Readiness {
  const counts = { danger: 0, caution: 0, info: 0 };
  let deduction = 0;
  let fatal = false;

  for (const finding of risks) {
    counts[finding.severity] += 1;
    deduction += WEIGHTS[finding.severity];
    if (FATAL_IDS.has(finding.id)) fatal = true;
  }

  let score = Math.max(0, Math.min(100, 100 - deduction));
  // A plan that cannot succeed is never "nearly fine".
  if (fatal || !sim.ok) score = Math.min(score, 20);

  /*
   * When the deep trace was unavailable we ran a shallow check instead:
   * we know the call does not revert, and almost nothing else — no asset
   * changes, no events, no approvals. A confident "Cleared · everything
   * checks out" on that evidence is a lie of omission, and the danger is
   * exactly the transaction whose harm lives in the effects we could not
   * read. Cap at the top of the caution band so the verdict says "Hold".
   */
  const degraded = sim.notes.some((n) => n.toLowerCase().includes('basic check'));
  if (degraded) score = Math.min(score, 60);

  const band: ReadinessBand =
    score >= 80 ? 'clear' : score >= 45 ? 'caution' : 'grounded';

  const verdict =
    band === 'clear'
      ? t(lang, 'score.verdict.clear')
      : band === 'caution'
        ? t(lang, 'score.verdict.caution')
        : t(lang, 'score.verdict.grounded');

  let advice: string;
  if (!sim.ok) {
    advice = t(lang, 'score.advice.fail');
  } else if (degraded) {
    advice = t(lang, 'score.advice.degraded');
  } else if (band === 'grounded') {
    advice = t(lang, 'score.advice.grounded');
  } else if (band === 'caution') {
    advice = t(lang, 'score.advice.caution');
  } else if (counts.info > 0) {
    advice = t(lang, 'score.advice.info');
  } else {
    advice = t(lang, 'score.advice.clear');
  }

  return { score, band, verdict, advice, counts };
}
