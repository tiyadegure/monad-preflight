/**
 * Address book — friendly names for addresses, so users can say
 * "send 1 MON to alice" instead of pasting a 42-character address.
 *
 * Entries are stored under one network-independent key
 * (`preflight.addressbook`), sorted by name. Storage is injectable so
 * tests (and non-browser environments) can pass a fake; the browser
 * default (`globalThis.localStorage`) is resolved lazily inside each
 * function, never at module load time.
 */

import { getAddress } from 'viem';
import type { Address } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';

/** One saved contact: a friendly name and its checksummed address. */
export interface AddressBookEntry {
  name: string;
  address: Address;
}

/** The minimal slice of the Web Storage API the address book needs. */
export type BookStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** One key for all networks — a contact's address does not change per network. */
const BOOK_KEY = 'preflight.addressbook';

/** Letters, digits, hyphen, underscore; 1–24 characters. */
const NAME_RE = /^[A-Za-z0-9_-]{1,24}$/;

/* ------------------------------------------------------------------ */
/* Internals                                                           */
/* ------------------------------------------------------------------ */

/**
 * Resolve the storage to use. Never touched at module load time so this
 * module stays importable in node (tests inject a Map-backed fake).
 */
function resolveStorage(storage?: BookStorage): BookStorage | undefined {
  if (storage) return storage;
  try {
    return (globalThis as { localStorage?: BookStorage }).localStorage;
  } catch {
    // Some environments throw on localStorage access (e.g. blocked cookies).
    return undefined;
  }
}

/**
 * Why a proposed name is not usable, in plain language — or null if it
 * is fine. Checked in order of most helpful message first.
 */
function nameProblem(name: string, lang: Lang = 'en'): string | null {
  if (name.length === 0) {
    return t(lang, 'book.needName');
  }
  if (name.length > 24) {
    return t(lang, 'book.tooLong');
  }
  if (/^0x/i.test(name)) {
    return t(lang, 'book.startsOx');
  }
  if (/^[0-9]+$/.test(name)) {
    return t(lang, 'book.numbersOnly');
  }
  if (!NAME_RE.test(name)) {
    return t(lang, 'book.allowedChars');
  }
  return null;
}

/** Case-insensitive sort by name; returns a new array. */
function sortByName(book: AddressBookEntry[]): AddressBookEntry[] {
  return [...book].sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()));
}

/**
 * Keep only stored rows that are still valid entries (someone may have
 * edited storage by hand, or an old version wrote a different shape).
 */
function sanitize(rows: unknown): AddressBookEntry[] {
  if (!Array.isArray(rows)) return [];
  const out: AddressBookEntry[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (row === null || typeof row !== 'object') continue;
    const { name, address } = row as { name?: unknown; address?: unknown };
    if (typeof name !== 'string' || typeof address !== 'string') continue;
    if (nameProblem(name) !== null) continue;
    let checksummed: Address;
    try {
      checksummed = getAddress(address);
    } catch {
      continue;
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ name, address: checksummed });
  }
  return sortByName(out);
}

/** Write the book to storage; a full or blocked storage never crashes the app. */
function persist(storage: BookStorage | undefined, book: AddressBookEntry[]): void {
  if (!storage) return;
  try {
    storage.setItem(BOOK_KEY, JSON.stringify(book));
  } catch {
    // Storage can be full or blocked; the returned list still works in memory.
  }
}

/** Escape a string so it matches literally inside a RegExp. */
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/** Load all saved contacts, sorted by name. Unreadable data → empty book. */
export function loadBook(storage?: BookStorage): AddressBookEntry[] {
  const store = resolveStorage(storage);
  if (!store) return [];
  let raw: string | null;
  try {
    raw = store.getItem(BOOK_KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  return sanitize(parsed);
}

/**
 * Save (or update) one contact and return the new sorted book.
 * A contact with the same name — ignoring upper/lower case — is replaced.
 * Throws a plain-language Error when the name or address is not usable.
 */
export function saveEntry(
  entry: { name: string; address: string },
  storage?: BookStorage,
  lang: Lang = 'en',
): AddressBookEntry[] {
  const name = typeof entry.name === 'string' ? entry.name.trim() : '';
  const problem = nameProblem(name, lang);
  if (problem !== null) throw new Error(problem);

  const rawAddress = typeof entry.address === 'string' ? entry.address.trim() : '';
  let address: Address;
  try {
    address = getAddress(rawAddress);
  } catch {
    throw new Error(t(lang, 'book.badAddress'));
  }

  const store = resolveStorage(storage);
  const key = name.toLowerCase();
  const book = loadBook(store).filter((existing) => existing.name.toLowerCase() !== key);
  book.push({ name, address });
  const sorted = sortByName(book);
  persist(store, sorted);
  return sorted;
}

/**
 * Remove the contact with this name (ignoring upper/lower case) and
 * return the remaining book. Removing a name that is not saved is fine.
 */
export function removeEntry(name: string, storage?: BookStorage): AddressBookEntry[] {
  const store = resolveStorage(storage);
  const key = name.trim().toLowerCase();
  const book = loadBook(store);
  const next = book.filter((existing) => existing.name.toLowerCase() !== key);
  if (next.length !== book.length) persist(store, next);
  return next;
}

/**
 * Replace every saved name that appears as a whole word in `text`
 * (ignoring upper/lower case) with its address. "alice" never matches
 * inside a longer word like "malice". Returns the rewritten text and
 * which contacts were used, each listed once.
 */
export function resolveNames(
  text: string,
  book: AddressBookEntry[],
): { text: string; resolved: AddressBookEntry[] } {
  let out = text;
  const resolved: AddressBookEntry[] = [];
  for (const entry of book) {
    if (!entry.name) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(entry.name)}\\b`, 'gi');
    if (!pattern.test(out)) continue;
    pattern.lastIndex = 0;
    out = out.replace(pattern, entry.address);
    resolved.push(entry);
  }
  return { text: out, resolved };
}
