/**
 * Multi-leg flight plans.
 *
 * Some journeys take more than one transaction: approve then swap, wrap
 * then send. We model these as an ordered queue of "legs". The UI walks
 * the queue one leg at a time — every leg gets its own simulation, its
 * own explanation, and its own wallet signature. We never hide a second
 * signature behind the first.
 *
 * Everything here is pure and immutable: no function ever mutates the
 * queue it is given; it returns a new one instead.
 */

import type { Hex } from './types';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type LegStatus = 'pending' | 'active' | 'signed' | 'failed' | 'skipped';

export interface QueueLeg {
  id: string;
  /** The instruction text for this leg, exactly as the user wrote it. */
  text: string;
  status: LegStatus;
  /** Transaction hash once the leg is signed and sent. */
  hash?: Hex;
  /** Plain-language note, e.g. why a leg failed or was skipped. */
  note?: string;
}

export interface FlightQueue {
  legs: QueueLeg[];
  /** Index of the leg currently being worked on; -1 = nothing active. */
  activeIndex: number;
}

/** Statuses that mean a leg's journey is over, one way or another. */
const TERMINAL_STATUSES: ReadonlySet<LegStatus> = new Set([
  'signed',
  'failed',
  'skipped',
]);

/** Most legs we will accept from a single instruction. */
export const MAX_LEGS = 8;

/* ------------------------------------------------------------------ */
/* Parsing                                                             */
/* ------------------------------------------------------------------ */

/**
 * Split a multi-leg instruction into individual legs.
 *
 * Splits on newlines, on the word " then " (any capitalisation), on the
 * Chinese connector "然后", and on semicolons. Commas are deliberately
 * NOT separators — amounts like "1,000" use them. Legs are trimmed,
 * empties are dropped, and at most MAX_LEGS legs are kept.
 */
export function parseLegs(text: string): string[] {
  return text
    .split(/\r?\n|;|\s+then\s+|\s*然后\s*/gi)
    .map((leg) => leg.trim())
    .filter((leg) => leg.length > 0)
    .slice(0, MAX_LEGS);
}

/* ------------------------------------------------------------------ */
/* Building and reading the queue                                      */
/* ------------------------------------------------------------------ */

/**
 * Build a fresh queue from leg texts. The first leg starts "active",
 * the rest wait as "pending". No legs → an empty, inactive queue.
 */
export function createQueue(texts: string[]): FlightQueue {
  if (texts.length === 0) return { legs: [], activeIndex: -1 };
  const legs: QueueLeg[] = texts.map((text, i) => ({
    id: `leg-${i + 1}`,
    text,
    status: i === 0 ? 'active' : 'pending',
  }));
  return { legs, activeIndex: 0 };
}

/** The leg currently being worked on, or null if none is. */
export function activeLeg(q: FlightQueue): QueueLeg | null {
  if (q.activeIndex < 0 || q.activeIndex >= q.legs.length) return null;
  return q.legs[q.activeIndex] ?? null;
}

/* ------------------------------------------------------------------ */
/* Transitions                                                         */
/* ------------------------------------------------------------------ */

/**
 * Return a new queue with one leg's status (and optionally its hash or
 * note) updated. An unknown id returns the queue unchanged.
 */
export function markLeg(
  q: FlightQueue,
  id: string,
  status: LegStatus,
  extra?: { hash?: Hex; note?: string },
): FlightQueue {
  const index = q.legs.findIndex((leg) => leg.id === id);
  if (index === -1) return q;
  const legs = q.legs.map((leg, i) => {
    if (i !== index) return leg;
    const next: QueueLeg = { ...leg, status };
    if (extra?.hash !== undefined) next.hash = extra.hash;
    if (extra?.note !== undefined) next.note = extra.note;
    return next;
  });
  return { legs, activeIndex: q.activeIndex };
}

/**
 * Move to the next pending leg.
 *
 * The current active leg is marked "signed" — unless it already reached
 * a final state (signed, failed, or skipped), in which case it is left
 * alone. Then the next "pending" leg becomes "active" and activeIndex
 * points at it; if no pending legs remain, activeIndex becomes -1.
 */
export function advance(q: FlightQueue): FlightQueue {
  const legs = q.legs.map((leg, i) => {
    if (i !== q.activeIndex) return leg;
    if (TERMINAL_STATUSES.has(leg.status)) return leg;
    return { ...leg, status: 'signed' as LegStatus };
  });

  const searchFrom = q.activeIndex >= 0 ? q.activeIndex + 1 : 0;
  for (let i = searchFrom; i < legs.length; i++) {
    const leg = legs[i];
    if (leg && leg.status === 'pending') {
      legs[i] = { ...leg, status: 'active' };
      return { legs, activeIndex: i };
    }
  }
  return { legs, activeIndex: -1 };
}

/* ------------------------------------------------------------------ */
/* Reporting                                                           */
/* ------------------------------------------------------------------ */

/**
 * One-line progress readout for the panel header, e.g.
 * "Leg 2 of 3 · 1 signed, 1 remaining".
 */
export function queueSummary(q: FlightQueue): string {
  const total = q.legs.length;
  if (total === 0) return 'No steps planned';

  const count = (status: LegStatus) =>
    q.legs.filter((leg) => leg.status === status).length;
  const signed = count('signed');
  const remaining = count('pending');

  if (q.activeIndex >= 0 && q.activeIndex < total) {
    return `Leg ${q.activeIndex + 1} of ${total} · ${signed} signed, ${remaining} remaining`;
  }

  const parts = [`${signed} signed`];
  const failed = count('failed');
  const skipped = count('skipped');
  if (failed > 0) parts.push(`${failed} failed`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  const steps = total === 1 ? 'step' : 'steps';
  return `All ${total} ${steps} done · ${parts.join(', ')}`;
}

/** True when every leg has reached a final state. */
export function isComplete(q: FlightQueue): boolean {
  return q.legs.every((leg) => TERMINAL_STATUSES.has(leg.status));
}
