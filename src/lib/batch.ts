/**
 * Batch module: split an EIP-5792 wallet_sendCalls bundle back into its
 * individual calls so each one can be simulated and explained on its own.
 *
 * One confirmation can hide many instructions. Wallets typically show a
 * single prompt for the whole bundle, so PreFlight's job here is to make
 * every instruction visible, validated, and individually explainable.
 *
 * Pure functions, no network access, never throws — malformed input comes
 * back as { error } in plain language.
 */

import { getAddress } from 'viem';
import type { Address, Hex, RiskFinding } from './types';
import { isHexData } from './format';
import { t } from './i18n';
import type { Lang } from './i18n';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export interface BatchCall {
  to: Address;
  data: Hex;
  /** Native value in wei */
  value: bigint;
  /** Position in the original bundle, 0-based */
  index: number;
}

export interface ParsedBatch {
  calls: BatchCall[];
  chainId?: number;
  from?: Address;
  /** True when the bundle must succeed or fail as one unit */
  atomic: boolean;
  /** Plain-language notes about anything worth knowing */
  notes: string[];
}

/** Beyond this we stop reading calls (and say so in a note). */
export const MAX_BATCH_CALLS = 50;

/** More calls than this earns a "long batch" note and risk finding. */
const LONG_BATCH_THRESHOLD = 5;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** "1st", "2nd", "3rd", "4th", ... with correct 11th/12th/13th. */
function ordinal(n: number, lang: Lang): string {
  const rem100 = n % 100;
  if (rem100 >= 11 && rem100 <= 13) return t(lang, 'bt.ordinalNth', { n });
  switch (n % 10) {
    case 1:
      return t(lang, 'bt.ordinal1st');
    case 2:
      return t(lang, 'bt.ordinal2nd');
    case 3:
      return t(lang, 'bt.ordinal3rd');
    default:
      return t(lang, 'bt.ordinalNth', { n });
  }
}

/**
 * Read a non-negative integer quantity that may arrive as a hex string
 * ("0x1a4"), a decimal string ("420"), a number, or a bigint.
 * Returns null when it cannot be read safely.
 */
function parseQuantity(value: unknown): bigint | null {
  if (typeof value === 'bigint') {
    return value >= 0n ? value : null;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value < 0) return null;
    return BigInt(value);
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^0x[0-9a-fA-F]+$/.test(s)) return BigInt(s);
    if (/^\d+$/.test(s)) return BigInt(s);
    return null;
  }
  return null;
}

/** Checksum an address string; null when it is not a valid address. */
function toValidAddress(value: unknown): Address | null {
  if (typeof value !== 'string') return null;
  try {
    return getAddress(value);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

/**
 * Quick shape check: does this look like a bundle of calls?
 * True for an object with a `calls` array (the EIP-5792 params shape),
 * or a non-empty array of objects that each have a `to`. Never throws.
 */
export function looksLikeBatch(value: unknown): boolean {
  try {
    if (Array.isArray(value)) {
      return value.length > 0 && value.every((item) => isRecord(item) && 'to' in item);
    }
    return isRecord(value) && Array.isArray(value['calls']);
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Parse a wallet_sendCalls-style bundle into individual calls.
 *
 * Accepts the EIP-5792 params object
 * ({ version?, chainId?, from?, atomicRequired?, calls: [{ to, data?, value? }] }),
 * a bare array of calls, or a JSON string of either. Never throws.
 */
export function parseBatch(value: unknown, lang: Lang = 'en'): ParsedBatch | { error: string } {
  try {
    return parseBatchInner(value, lang);
  } catch {
    return { error: t(lang, 'bt.cantReadBundle') };
  }
}

function parseBatchInner(value: unknown, lang: Lang): ParsedBatch | { error: string } {
  let input = value;

  if (typeof input === 'string') {
    try {
      input = JSON.parse(input) as unknown;
    } catch {
      return {
        error: t(lang, 'bt.notFormat'),
      };
    }
  }

  let rawCalls: unknown[];
  let chainIdRaw: unknown;
  let fromRaw: unknown;
  let atomicRaw: unknown;

  if (Array.isArray(input)) {
    rawCalls = input;
  } else if (isRecord(input) && Array.isArray(input['calls'])) {
    rawCalls = input['calls'];
    chainIdRaw = input['chainId'];
    fromRaw = input['from'];
    atomicRaw = input['atomicRequired'];
  } else {
    return { error: t(lang, 'bt.cantReadBundle') };
  }

  if (rawCalls.length === 0) {
    return {
      error: t(lang, 'bt.empty'),
    };
  }

  const notes: string[] = [];

  const totalCalls = rawCalls.length;
  if (totalCalls > MAX_BATCH_CALLS) {
    rawCalls = rawCalls.slice(0, MAX_BATCH_CALLS);
    notes.push(
      t(lang, 'bt.truncated', { total: totalCalls, max: MAX_BATCH_CALLS }),
    );
  }

  const calls: BatchCall[] = [];
  for (let i = 0; i < rawCalls.length; i += 1) {
    const raw = rawCalls[i];
    const position = ordinal(i + 1, lang);

    const item: Record<string, unknown> = isRecord(raw) ? raw : {};

    const to = toValidAddress(item['to']);
    if (to === null) {
      return { error: t(lang, 'bt.invalidTo', { position }) };
    }

    const dataRaw = item['data'] ?? '0x';
    if (typeof dataRaw !== 'string' || !isHexData(dataRaw)) {
      return {
        error: t(lang, 'bt.unreadableData', { position }),
      };
    }

    let callValue = 0n;
    if (item['value'] !== undefined && item['value'] !== null) {
      const parsed = parseQuantity(item['value']);
      if (parsed === null) {
        return { error: t(lang, 'bt.unreadableValue', { position }) };
      }
      callValue = parsed;
    }

    calls.push({ to, data: dataRaw, value: callValue, index: i });
  }

  const atomic = Boolean(atomicRaw);
  if (!atomic) {
    notes.push(t(lang, 'bt.notAtomicNote'));
  }
  if (calls.length > LONG_BATCH_THRESHOLD) {
    notes.push(t(lang, 'bt.longNote'));
  }

  const result: ParsedBatch = { calls, atomic, notes };

  const chainIdParsed = parseQuantity(chainIdRaw);
  if (chainIdParsed !== null && chainIdParsed <= BigInt(Number.MAX_SAFE_INTEGER)) {
    result.chainId = Number(chainIdParsed);
  }

  const from = toValidAddress(fromRaw);
  if (from !== null) {
    result.from = from;
  }

  return result;
}

/* ------------------------------------------------------------------ */
/* Description                                                         */
/* ------------------------------------------------------------------ */

/** One plain sentence saying what this bundle is and how it lands. */
export function describeBatch(batch: ParsedBatch, lang: Lang = 'en'): string {
  const n = batch.calls.length;
  const base =
    n === 1
      ? t(lang, 'bt.describeOne')
      : t(lang, 'bt.describeMany', { n });
  const tail = batch.atomic
    ? t(lang, 'bt.atomicTail')
    : t(lang, 'bt.separateTail');
  return base + tail;
}

/* ------------------------------------------------------------------ */
/* Risk rules                                                          */
/* ------------------------------------------------------------------ */

/** Deterministic risk findings for the bundle as a whole. */
export function batchRisks(batch: ParsedBatch, lang: Lang = 'en'): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const count = batch.calls.length;

  if (count > 1) {
    findings.push({
      id: 'batch-hidden-actions',
      severity: 'danger',
      title: t(lang, 'bt.hiddenTitle'),
      detail: t(lang, 'bt.hiddenDetail', { count }),
    });
  }

  if (!batch.atomic && count > 1) {
    findings.push({
      id: 'batch-not-atomic',
      severity: 'caution',
      title: t(lang, 'bt.notAtomicTitle'),
      detail: t(lang, 'bt.notAtomicDetail'),
    });
  }

  if (count > LONG_BATCH_THRESHOLD) {
    findings.push({
      id: 'batch-large',
      severity: 'caution',
      title: t(lang, 'bt.largeTitle'),
      detail: t(lang, 'bt.largeDetail', { count }),
    });
  }

  if (count === 1) {
    findings.push({
      id: 'batch-single',
      severity: 'info',
      title: t(lang, 'bt.singleTitle'),
      detail: t(lang, 'bt.singleDetail'),
    });
  }

  return findings;
}
