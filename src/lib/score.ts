import type { RiskFinding, SimulationResult } from './types';

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

export function scorePlan(sim: SimulationResult, risks: RiskFinding[]): Readiness {
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

  const band: ReadinessBand =
    score >= 80 ? 'clear' : score >= 45 ? 'caution' : 'grounded';

  const verdict =
    band === 'clear' ? 'Cleared' : band === 'caution' ? 'Hold' : 'Grounded';

  let advice: string;
  if (!sim.ok) {
    advice =
      'This transaction would fail if you sent it. Signing it would only cost you the network fee.';
  } else if (band === 'grounded') {
    advice =
      'Serious problems found. Read the warnings below before you decide — this is the kind of transaction people regret.';
  } else if (band === 'caution') {
    advice =
      'Nothing is clearly broken, but something here deserves a second look before you sign.';
  } else if (counts.info > 0) {
    advice = 'Everything checks out. A couple of small notes are listed below.';
  } else {
    advice = 'Everything checks out — this does what you asked, and nothing more.';
  }

  return { score, band, verdict, advice, counts };
}
