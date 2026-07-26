import { describe, expect, it } from 'vitest';
import { getAddress } from 'viem';
import { loadBook, removeEntry, resolveNames, saveEntry } from '../src/lib/addressbook';
import type { AddressBookEntry, BookStorage } from '../src/lib/addressbook';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const BOOK_KEY = 'preflight.addressbook';

// All-digit addresses: checksummed form is identical to the input.
const ADDR_A = '0x1111111111111111111111111111111111111111';
const ADDR_B = '0x2222222222222222222222222222222222222222';
const ADDR_C = '0x3333333333333333333333333333333333333333';

// A lowercase address with letters, so saving must re-checksum it.
const ADDR_LOWER = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
const ADDR_CHECKSUMMED = getAddress(ADDR_LOWER);

/** In-memory Storage fake — no browser, no network. */
function makeFakeStorage(initial: Record<string, string> = {}): BookStorage & {
  data: Map<string, string>;
} {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
}

/** Assert fn throws an Error whose message reads like plain language. */
function expectPlainError(fn: () => unknown, mustMatch: RegExp): void {
  let caught: unknown;
  try {
    fn();
  } catch (err) {
    caught = err;
  }
  expect(caught).toBeInstanceOf(Error);
  const message = (caught as Error).message;
  expect(message).toMatch(mustMatch);
  // No developer jargon or library internals leaking to the user.
  expect(message).not.toMatch(
    /viem|regex|regexp|invalidaddresserror|checksum|exception|stack|undefined|null|assert|https?:/i,
  );
}

/* ------------------------------------------------------------------ */
/* save + load + sort                                                  */
/* ------------------------------------------------------------------ */

describe('saveEntry / loadBook', () => {
  it('saves entries, persists under the fixed key, and keeps the book sorted by name', () => {
    const fake = makeFakeStorage();

    saveEntry({ name: 'zoe', address: ADDR_A }, fake);
    saveEntry({ name: 'Alice', address: ADDR_B }, fake);
    const returned = saveEntry({ name: 'bob', address: ADDR_C }, fake);

    expect(returned.map((e) => e.name)).toEqual(['Alice', 'bob', 'zoe']);

    const loaded = loadBook(fake);
    expect(loaded).toEqual([
      { name: 'Alice', address: ADDR_B },
      { name: 'bob', address: ADDR_C },
      { name: 'zoe', address: ADDR_A },
    ]);

    // Stored under the one network-independent key.
    expect(fake.data.has(BOOK_KEY)).toBe(true);
    expect(JSON.parse(fake.data.get(BOOK_KEY) ?? '')).toHaveLength(3);
  });

  it('checksums the address it stores', () => {
    const fake = makeFakeStorage();
    const book = saveEntry({ name: 'alice', address: ADDR_LOWER }, fake);
    expect(book[0]?.address).toBe(ADDR_CHECKSUMMED);
    expect(book[0]?.address).not.toBe(ADDR_LOWER);
  });

  it('trims surrounding whitespace from name and address', () => {
    const fake = makeFakeStorage();
    const book = saveEntry({ name: '  alice  ', address: `  ${ADDR_A}  ` }, fake);
    expect(book).toEqual([{ name: 'alice', address: ADDR_A }]);
  });

  it('replaces an existing entry with the same name in a different case', () => {
    const fake = makeFakeStorage();
    saveEntry({ name: 'Alice', address: ADDR_A }, fake);
    const book = saveEntry({ name: 'alice', address: ADDR_B }, fake);

    expect(book).toHaveLength(1);
    expect(book[0]).toEqual({ name: 'alice', address: ADDR_B });
    expect(loadBook(fake)).toEqual(book);
  });

  it('returns an empty book for missing, corrupted, or wrong-shaped stored data', () => {
    expect(loadBook(makeFakeStorage())).toEqual([]);
    expect(loadBook(makeFakeStorage({ [BOOK_KEY]: 'not json {{{' }))).toEqual([]);
    expect(loadBook(makeFakeStorage({ [BOOK_KEY]: '"just a string"' }))).toEqual([]);
  });

  it('does not crash when no storage is given (default resolved inside the function)', () => {
    expect(Array.isArray(loadBook())).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* validation errors                                                   */
/* ------------------------------------------------------------------ */

describe('saveEntry validation', () => {
  const fake = makeFakeStorage();

  it('rejects an empty name', () => {
    expectPlainError(() => saveEntry({ name: '', address: ADDR_A }, fake), /name/i);
  });

  it('rejects a name longer than 24 characters', () => {
    expectPlainError(
      () => saveEntry({ name: 'a'.repeat(25), address: ADDR_A }, fake),
      /too long|24/i,
    );
  });

  it('rejects a name with spaces or other unsupported characters', () => {
    expectPlainError(() => saveEntry({ name: 'my friend', address: ADDR_A }, fake), /letters/i);
    expectPlainError(() => saveEntry({ name: 'al!ce', address: ADDR_A }, fake), /letters/i);
  });

  it('rejects a name starting with 0x, in any case', () => {
    expectPlainError(() => saveEntry({ name: '0xalice', address: ADDR_A }, fake), /0x/i);
    expectPlainError(() => saveEntry({ name: '0Xalice', address: ADDR_A }, fake), /0x/i);
  });

  it('rejects a name that is only digits', () => {
    expectPlainError(() => saveEntry({ name: '12345', address: ADDR_A }, fake), /number/i);
  });

  it('accepts letters, digits, hyphens, and underscores', () => {
    const store = makeFakeStorage();
    const book = saveEntry({ name: 'my-wallet_2', address: ADDR_A }, store);
    expect(book[0]?.name).toBe('my-wallet_2');
  });

  it('rejects a malformed address with a plain-language message', () => {
    expectPlainError(() => saveEntry({ name: 'alice', address: 'not-an-address' }, fake), /address/i);
    expectPlainError(() => saveEntry({ name: 'alice', address: '0x1234' }, fake), /address/i);
  });

  it('normalizes any input casing to the one canonical checksummed form', () => {
    // viem's getAddress re-checksums whatever valid hex it is given, so
    // lowercase and uppercase inputs both land on the same stored address.
    const store = makeFakeStorage();
    const upper = `0x${ADDR_LOWER.slice(2).toUpperCase()}`;
    const book = saveEntry({ name: 'alice', address: upper }, store);
    expect(book[0]?.address).toBe(ADDR_CHECKSUMMED);
  });

  it('saves nothing when validation fails', () => {
    const store = makeFakeStorage();
    expect(() => saveEntry({ name: '0xbad', address: ADDR_A }, store)).toThrowError();
    expect(loadBook(store)).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* remove                                                              */
/* ------------------------------------------------------------------ */

describe('removeEntry', () => {
  it('removes by name ignoring case and persists the change', () => {
    const fake = makeFakeStorage();
    saveEntry({ name: 'alice', address: ADDR_A }, fake);
    saveEntry({ name: 'bob', address: ADDR_B }, fake);

    const remaining = removeEntry('ALICE', fake);
    expect(remaining).toEqual([{ name: 'bob', address: ADDR_B }]);
    expect(loadBook(fake)).toEqual(remaining);
  });

  it('leaves the book unchanged when the name is not saved', () => {
    const fake = makeFakeStorage();
    saveEntry({ name: 'alice', address: ADDR_A }, fake);
    const remaining = removeEntry('carol', fake);
    expect(remaining).toEqual([{ name: 'alice', address: ADDR_A }]);
  });
});

/* ------------------------------------------------------------------ */
/* resolveNames                                                        */
/* ------------------------------------------------------------------ */

describe('resolveNames', () => {
  const alice: AddressBookEntry = { name: 'alice', address: ADDR_A };
  const bob: AddressBookEntry = { name: 'bob', address: ADDR_B };
  const book = [alice, bob];

  it('replaces a single whole-word name with its address', () => {
    const { text, resolved } = resolveNames('send 1 MON to alice', book);
    expect(text).toBe(`send 1 MON to ${ADDR_A}`);
    expect(resolved).toEqual([alice]);
  });

  it('replaces multiple different names and reports each entry used', () => {
    const { text, resolved } = resolveNames('pay alice and bob 5 MON each', book);
    expect(text).toBe(`pay ${ADDR_A} and ${ADDR_B} 5 MON each`);
    expect(resolved).toEqual([alice, bob]);
  });

  it('matches names case-insensitively', () => {
    const { text, resolved } = resolveNames('send 2 MON to ALICE', book);
    expect(text).toBe(`send 2 MON to ${ADDR_A}`);
    expect(resolved).toEqual([alice]);
  });

  it('lists an entry once even when its name appears several times', () => {
    const { text, resolved } = resolveNames('alice pays Alice back', book);
    expect(text).toBe(`${ADDR_A} pays ${ADDR_A} back`);
    expect(resolved).toEqual([alice]);
  });

  it('never matches a name inside a longer word ("alice" vs "malice")', () => {
    const { text, resolved } = resolveNames('do not send malice any MON', book);
    expect(text).toBe('do not send malice any MON');
    expect(resolved).toEqual([]);
    expect(resolveNames('alicexyz gets nothing', book).resolved).toEqual([]);
  });

  it('returns the text unchanged when the book is empty or nothing matches', () => {
    expect(resolveNames('send 1 MON to alice', [])).toEqual({
      text: 'send 1 MON to alice',
      resolved: [],
    });
    expect(resolveNames('send 1 MON to carol', book)).toEqual({
      text: 'send 1 MON to carol',
      resolved: [],
    });
  });

  it('treats regex special characters in a name as literal text', () => {
    const odd: AddressBookEntry = { name: 'a.b', address: ADDR_C };
    // The dot must not act as a wildcard: "aXb" is not a match.
    expect(resolveNames('send to aXb', [odd]).resolved).toEqual([]);
    const { text, resolved } = resolveNames('send to a.b now', [odd]);
    expect(text).toBe(`send to ${ADDR_C} now`);
    expect(resolved).toEqual([odd]);
  });
});
