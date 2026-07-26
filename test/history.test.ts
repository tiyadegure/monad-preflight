import { describe, expect, it } from 'vitest';
import { clearFlights, loadFlights, recordFlight } from '../src/lib/history';
import type { FlightRecord, FlightStorage } from '../src/lib/history';
import type { Hex } from '../src/lib/types';

/* ------------------------------------------------------------------ */
/* Fixtures and helpers                                                */
/* ------------------------------------------------------------------ */

const NETWORK = 'monad-testnet';
const OTHER_NETWORK = 'monad-mainnet';
const KEY = `preflight.flights.${NETWORK}`;
const OTHER_KEY = `preflight.flights.${OTHER_NETWORK}`;

interface FakeStorage extends FlightStorage {
  map: Map<string, string>;
}

function makeFakeStorage(): FakeStorage {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
}

function makeFlight(overrides: Partial<FlightRecord> = {}): FlightRecord {
  const n = overrides.at ?? 1;
  return {
    id: `flight-${n}`,
    at: 1_700_000_000_000 + n,
    network: NETWORK,
    summary: `Send ${n} MON to 0x1234…abcd`,
    hash: `0x${n.toString(16).padStart(64, '0')}` as Hex,
    simOk: true,
    outcome: 'success',
    matched: true,
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('recordFlight + loadFlights roundtrip', () => {
  it('persists a record and loads it back intact', () => {
    const storage = makeFakeStorage();
    const flight = makeFlight({ matched: null, outcome: 'reverted', simOk: false });

    const returned = recordFlight(flight, storage);
    expect(returned).toEqual([flight]);

    const loaded = loadFlights(NETWORK, storage);
    expect(loaded).toEqual([flight]);
    expect(storage.map.has(KEY)).toBe(true);
  });

  it('prepends: newest record comes first', () => {
    const storage = makeFakeStorage();
    const first = makeFlight({ id: 'a', at: 1 });
    const second = makeFlight({ id: 'b', at: 2 });
    const third = makeFlight({ id: 'c', at: 3 });

    recordFlight(first, storage);
    recordFlight(second, storage);
    const returned = recordFlight(third, storage);

    expect(returned.map((r) => r.id)).toEqual(['c', 'b', 'a']);
    expect(loadFlights(NETWORK, storage).map((r) => r.id)).toEqual(['c', 'b', 'a']);
  });

  it('replaces an existing record with the same id and moves it to the front', () => {
    const storage = makeFakeStorage();
    recordFlight(makeFlight({ id: 'a', at: 1, summary: 'old summary' }), storage);
    recordFlight(makeFlight({ id: 'b', at: 2 }), storage);

    const updated = makeFlight({ id: 'a', at: 3, summary: 'new summary', matched: false });
    const returned = recordFlight(updated, storage);

    expect(returned).toHaveLength(2);
    expect(returned[0]).toEqual(updated);
    expect(returned[1]!.id).toBe('b');
    expect(returned.filter((r) => r.id === 'a')).toHaveLength(1);

    const loaded = loadFlights(NETWORK, storage);
    expect(loaded[0]!.summary).toBe('new summary');
    expect(loaded[0]!.matched).toBe(false);
  });

  it('caps the log at 50: recording 55 keeps only the 50 newest', () => {
    const storage = makeFakeStorage();
    let last: FlightRecord[] = [];
    for (let i = 1; i <= 55; i++) {
      last = recordFlight(makeFlight({ id: `flight-${i}`, at: i }), storage);
    }

    expect(last).toHaveLength(50);
    expect(last[0]!.id).toBe('flight-55'); // newest kept, at the front
    expect(last[49]!.id).toBe('flight-6'); // oldest five dropped
    expect(last.some((r) => r.id === 'flight-5')).toBe(false);

    const loaded = loadFlights(NETWORK, storage);
    expect(loaded).toHaveLength(50);
    expect(loaded.map((r) => r.id)).toEqual(last.map((r) => r.id));
  });
});

describe('loadFlights resilience', () => {
  it('returns [] when nothing has been stored', () => {
    const storage = makeFakeStorage();
    expect(loadFlights(NETWORK, storage)).toEqual([]);
  });

  it('returns [] for corrupted JSON', () => {
    const storage = makeFakeStorage();
    storage.map.set(KEY, '{not valid json![');
    expect(loadFlights(NETWORK, storage)).toEqual([]);
  });

  it('returns [] when the stored value is valid JSON but not an array', () => {
    const storage = makeFakeStorage();
    storage.map.set(KEY, JSON.stringify({ oops: true }));
    expect(loadFlights(NETWORK, storage)).toEqual([]);
  });

  it('filters out entries missing id, hash, or summary', () => {
    const storage = makeFakeStorage();
    const good = makeFlight({ id: 'good', at: 9 });
    storage.map.set(
      KEY,
      JSON.stringify([
        good,
        { ...makeFlight({ at: 1 }), id: undefined }, // no id
        { ...makeFlight({ at: 2 }), hash: undefined }, // no hash
        { ...makeFlight({ at: 3 }), summary: '' }, // empty summary
        null, // not even an object
        'garbage',
        42,
      ]),
    );

    expect(loadFlights(NETWORK, storage)).toEqual([good]);
  });
});

describe('network isolation', () => {
  it('keeps flights on two networks fully separate', () => {
    const storage = makeFakeStorage();
    const testnetFlight = makeFlight({ id: 'testnet-1', network: NETWORK });
    const mainnetFlight = makeFlight({ id: 'mainnet-1', network: OTHER_NETWORK });

    recordFlight(testnetFlight, storage);
    recordFlight(mainnetFlight, storage);

    expect(loadFlights(NETWORK, storage)).toEqual([testnetFlight]);
    expect(loadFlights(OTHER_NETWORK, storage)).toEqual([mainnetFlight]);
    expect(storage.map.has(KEY)).toBe(true);
    expect(storage.map.has(OTHER_KEY)).toBe(true);
  });

  it('recordFlight returns the list for the record\'s own network only', () => {
    const storage = makeFakeStorage();
    recordFlight(makeFlight({ id: 'testnet-1', network: NETWORK }), storage);
    const returned = recordFlight(
      makeFlight({ id: 'mainnet-1', network: OTHER_NETWORK }),
      storage,
    );
    expect(returned.map((r) => r.id)).toEqual(['mainnet-1']);
  });

  it('clearFlights removes only that network\'s key', () => {
    const storage = makeFakeStorage();
    recordFlight(makeFlight({ id: 'testnet-1', network: NETWORK }), storage);
    recordFlight(makeFlight({ id: 'mainnet-1', network: OTHER_NETWORK }), storage);

    clearFlights(NETWORK, storage);

    expect(storage.map.has(KEY)).toBe(false);
    expect(loadFlights(NETWORK, storage)).toEqual([]);
    expect(loadFlights(OTHER_NETWORK, storage)).toHaveLength(1);
  });

  it('clearFlights on an empty log is a harmless no-op', () => {
    const storage = makeFakeStorage();
    expect(() => clearFlights(NETWORK, storage)).not.toThrow();
    expect(loadFlights(NETWORK, storage)).toEqual([]);
  });
});
