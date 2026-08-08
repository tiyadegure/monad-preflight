/**
 * Fee intelligence for Monad PreFlight.
 *
 * Raw gas numbers mean nothing to most people — nobody knows whether
 * 0.0021 MON is a bargain or a rip-off. This module asks the network
 * about the last 20 blocks (eth_feeHistory), works out where today's
 * fee sits among them, and says so in words.
 *
 * If the RPC does not support fee history we fall back to the plain
 * current fee (eth_gasPrice) and say honestly that we cannot compare.
 */

import type { RpcCallFn } from './simulate';
import { t } from './i18n';
import type { Lang } from './i18n';

/* ------------------------------------------------------------------ */
/* Public shape                                                        */
/* ------------------------------------------------------------------ */

export interface FeeReading {
  /** Next block's base fee, per unit of gas (wei). */
  baseFeeWei: bigint;
  /** Typical tip paid recently, per unit of gas (wei). */
  priorityFeeWei: bigint;
  /** (base + tip) × gas — the whole fee this transaction would pay. */
  totalFeeWei: bigint;
  /** 0–100: where the current base fee sits among recent blocks. Null when we could not compare. */
  percentileVsRecent: number | null;
  /** One plain-language sentence about the fee level. */
  verdict: string;
  /** A suggestion, only when waiting would probably save money. */
  advice: string | null;
  /** Anything else worth telling the user, in plain words. */
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** How many recent blocks we compare against (0x14 = 20). */
const BLOCK_COUNT_HEX = '0x14';

/** We ask for the 10th, 50th and 90th percentile tips; we use the 50th. */
const REWARD_PERCENTILES = [10, 50, 90];
const MEDIAN_ROW_INDEX = 1;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/**
 * Parse a JSON-RPC hex quantity. "0x" means zero; odd-length digits are
 * fine ("0x5"). Anything that is not a 0x-hex string returns null.
 */
function parseHexQuantity(value: unknown): bigint | null {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]*$/.test(value)) return null;
  if (value === '0x') return 0n;
  return BigInt(value);
}

/** Median of a list of bigints; even counts average the two middle values. 0n on empty. */
function median(values: bigint[]): bigint {
  if (values.length === 0) return 0n;
  const sorted = [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const mid = Math.floor(sorted.length / 2);
  const upper = sorted[mid] as bigint;
  if (sorted.length % 2 === 1) return upper;
  const lower = sorted[mid - 1] as bigint;
  return (lower + upper) / 2n;
}

/**
 * Percentile rank (0–100, rounded) of `current` within `fees`, using the
 * standard mid-rank convention: entries below count fully, ties count
 * half. A flat fee series therefore lands at 50 ("about normal") rather
 * than pretending fees are extreme in either direction.
 */
function percentileRank(current: bigint, fees: bigint[]): number {
  let below = 0;
  let equal = 0;
  for (const fee of fees) {
    if (fee < current) below += 1;
    else if (fee === current) equal += 1;
  }
  return Math.round(((below + equal / 2) / fees.length) * 100);
}

function verdictFor(percentile: number, lang: Lang): string {
  if (percentile <= 33) return t(lang, 'go.verdict.quiet');
  if (percentile <= 66) return t(lang, 'go.verdict.normal');
  return t(lang, 'go.verdict.high');
}

/* ------------------------------------------------------------------ */
/* Fee history shape                                                   */
/* ------------------------------------------------------------------ */

interface FeeHistoryFacts {
  /** Parsed base fees of the recent blocks (invalid entries dropped). */
  baseFees: bigint[];
  /** The next block's base fee — the last baseFeePerGas entry. */
  currentBaseFee: bigint;
  /** Usable (non-zero, parseable) 50th-percentile tips, one per block. */
  medianTips: bigint[];
  /** How full recent blocks were, 0–1 each; only well-formed numbers. */
  gasUsedRatios: number[];
}

/**
 * Validate and parse the eth_feeHistory response. Returns null when the
 * shape is unusable — no base-fee list, an empty one, or a garbled entry
 * where the next block's base fee should be.
 */
function parseFeeHistory(raw: unknown): FeeHistoryFacts | null {
  if (raw === null || typeof raw !== 'object') return null;
  const { baseFeePerGas, reward, gasUsedRatio } = raw as {
    baseFeePerGas?: unknown;
    reward?: unknown;
    gasUsedRatio?: unknown;
  };

  if (!Array.isArray(baseFeePerGas) || baseFeePerGas.length === 0) return null;
  // feeHistory returns one more base fee than blocks requested; the last
  // entry is the base fee of the NEXT block — the one this tx would pay.
  const currentBaseFee = parseHexQuantity(baseFeePerGas[baseFeePerGas.length - 1]);
  if (currentBaseFee === null) return null;

  const baseFees: bigint[] = [];
  for (const entry of baseFeePerGas) {
    const parsed = parseHexQuantity(entry);
    if (parsed !== null) baseFees.push(parsed);
  }

  const medianTips: bigint[] = [];
  if (Array.isArray(reward)) {
    for (const row of reward) {
      if (!Array.isArray(row)) continue;
      const tip = parseHexQuantity(row[MEDIAN_ROW_INDEX]);
      if (tip !== null && tip > 0n) medianTips.push(tip);
    }
  }

  const gasUsedRatios: number[] = [];
  if (Array.isArray(gasUsedRatio)) {
    for (const ratio of gasUsedRatio) {
      if (typeof ratio === 'number' && Number.isFinite(ratio)) gasUsedRatios.push(ratio);
    }
  }

  return { baseFees, currentBaseFee, medianTips, gasUsedRatios };
}

/* ------------------------------------------------------------------ */
/* Fallback path: fee history unavailable                              */
/* ------------------------------------------------------------------ */

async function readFeesWithoutHistory(
  rpc: RpcCallFn,
  gasUsed: bigint,
  lang: Lang,
): Promise<FeeReading> {
  const notes = [t(lang, 'go.note.historyUnavailable')];

  let gasPriceWei = 0n;
  try {
    const parsed = parseHexQuantity(await rpc('eth_gasPrice', []));
    if (parsed === null) throw new Error('unreadable gas price');
    gasPriceWei = parsed;
  } catch {
    notes.push(t(lang, 'go.note.priceUnavailable'));
  }

  return {
    baseFeeWei: gasPriceWei,
    priorityFeeWei: 0n,
    totalFeeWei: gasPriceWei * gasUsed,
    percentileVsRecent: null,
    verdict: t(lang, 'go.verdict.noComparison'),
    advice: null,
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

/**
 * Read the current fee climate and price this transaction against it.
 *
 * `gasUsed` is how much gas the simulation says the transaction needs;
 * the reading multiplies it by (base fee + typical tip) to get the
 * whole fee in wei, then compares against the last 20 blocks.
 */
export async function readFees(
  rpc: RpcCallFn,
  gasUsed: bigint,
  lang: Lang = 'en',
): Promise<FeeReading> {
  let facts: FeeHistoryFacts | null = null;
  try {
    const raw = await rpc('eth_feeHistory', [BLOCK_COUNT_HEX, 'latest', REWARD_PERCENTILES]);
    facts = parseFeeHistory(raw);
  } catch {
    facts = null;
  }
  if (facts === null) return readFeesWithoutHistory(rpc, gasUsed, lang);

  const baseFeeWei = facts.currentBaseFee;
  const priorityFeeWei = median(facts.medianTips);
  const totalFeeWei = (baseFeeWei + priorityFeeWei) * gasUsed;
  const percentileVsRecent = percentileRank(baseFeeWei, facts.baseFees);

  const notes: string[] = [];
  if (facts.gasUsedRatios.length > 0) {
    const sum = facts.gasUsedRatios.reduce((acc, ratio) => acc + ratio, 0);
    // The tiny epsilon absorbs floating-point drift when averaging, so a
    // network sitting exactly at 0.8 never trips the warning spuriously.
    if (sum / facts.gasUsedRatios.length > 0.8 + 1e-9) notes.push(t(lang, 'go.note.congestion'));
  }

  return {
    baseFeeWei,
    priorityFeeWei,
    totalFeeWei,
    percentileVsRecent,
    verdict: verdictFor(percentileVsRecent, lang),
    advice: percentileVsRecent > 80 ? t(lang, 'go.advice.wait') : null,
    notes,
  };
}
