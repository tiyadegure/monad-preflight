/**
 * Flight log — a persistent record of every transaction the user signed.
 *
 * Records are stored per network under `preflight.flights.${network}`,
 * newest first, capped at 50 entries. Storage is injectable so tests
 * (and non-browser environments) can pass a fake; the browser default
 * (`globalThis.localStorage`) is resolved lazily inside each function,
 * never at module load time.
 */

import type { Hex } from './types';

/** One signed transaction, as remembered by the flight log. */
export interface FlightRecord {
  /** Stable unique id for this flight (used to replace on re-record) */
  id: string;
  /** When the transaction was signed, in ms since epoch */
  at: number;
  /** Network the transaction was sent on, e.g. "monad-testnet" */
  network: string;
  /** One-line plain-language description, e.g. "Send 0.5 MON to 0x1234…abcd" */
  summary: string;
  /** Transaction hash */
  hash: Hex;
  /** Whether the pre-sign simulation said it would work */
  simOk: boolean;
  /** What actually happened on chain */
  outcome: 'success' | 'reverted';
  /** Did reality match the simulation? null = not checked yet */
  matched: boolean | null;
}

/** The minimal slice of the Web Storage API the flight log needs. */
export type FlightStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Most flights kept per network. */
const MAX_FLIGHTS = 50;

function storageKey(network: string): string {
  return `preflight.flights.${network}`;
}

/**
 * Resolve the storage to use. Never touched at module load time so this
 * module stays importable in node (tests inject a Map-backed fake).
 */
function resolveStorage(storage?: FlightStorage): FlightStorage | undefined {
  if (storage) return storage;
  try {
    return (globalThis as { localStorage?: FlightStorage }).localStorage;
  } catch {
    // Some environments throw on localStorage access (e.g. blocked cookies).
    return undefined;
  }
}

/** Loose shape check: keep only entries that could render in the UI. */
function isFlightRecord(entry: unknown): entry is FlightRecord {
  if (typeof entry !== 'object' || entry === null) return false;
  const e = entry as Record<string, unknown>;
  return (
    typeof e.id === 'string' &&
    e.id.length > 0 &&
    typeof e.hash === 'string' &&
    e.hash.length > 0 &&
    typeof e.summary === 'string' &&
    e.summary.length > 0
  );
}

/**
 * Load the flight log for one network, newest first.
 * Missing or corrupted data quietly yields an empty list.
 */
export function loadFlights(network: string, storage?: FlightStorage): FlightRecord[] {
  const store = resolveStorage(storage);
  if (!store) return [];
  let raw: string | null;
  try {
    raw = store.getItem(storageKey(network));
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isFlightRecord);
  } catch {
    return [];
  }
}

/**
 * Add a flight to the log for its network: newest first, an existing
 * record with the same id is replaced, and the list is capped at 50.
 * Returns the updated list for that network.
 */
export function recordFlight(record: FlightRecord, storage?: FlightStorage): FlightRecord[] {
  const store = resolveStorage(storage);
  const existing = loadFlights(record.network, store);
  const next = [record, ...existing.filter((r) => r.id !== record.id)].slice(0, MAX_FLIGHTS);
  if (store) {
    try {
      store.setItem(storageKey(record.network), JSON.stringify(next));
    } catch {
      // Storage full or unavailable — the in-memory list is still correct.
    }
  }
  return next;
}

/** Forget every flight recorded for one network. Other networks are untouched. */
export function clearFlights(network: string, storage?: FlightStorage): void {
  const store = resolveStorage(storage);
  if (!store) return;
  try {
    store.removeItem(storageKey(network));
  } catch {
    // Nothing to do — clearing a log must never crash the app.
  }
}
