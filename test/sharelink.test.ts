import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_SHARED_TEXT_LENGTH,
  decodeShareLink,
  encodeShareLink,
} from '../src/lib/sharelink';
import type { SharedIntent } from '../src/lib/sharelink';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const BASE = 'https://preflight.example/app';

function payloadOf(link: string): string {
  const [, payload] = link.split('#plan=');
  if (payload === undefined) throw new Error(`no #plan= in ${link}`);
  return payload;
}

/** base64url-encode arbitrary text with node's Buffer (test-side oracle). */
function rawPayload(text: string): string {
  return Buffer.from(text, 'utf-8').toString('base64url');
}

function roundTrip(shared: SharedIntent): SharedIntent | null {
  return decodeShareLink(encodeShareLink(BASE, shared));
}

/* ------------------------------------------------------------------ */
/* Round-trips                                                         */
/* ------------------------------------------------------------------ */

describe('encodeShareLink → decodeShareLink round-trip', () => {
  it('survives plain ASCII text', () => {
    const decoded = roundTrip({ text: 'send 0.5 MON to 0x1234' });
    expect(decoded).toEqual({ text: 'send 0.5 MON to 0x1234' });
  });

  it('survives Chinese text', () => {
    const text = '发送 0.5 MON 到 0x1234567890abcdef';
    expect(roundTrip({ text })).toEqual({ text });
  });

  it('survives emoji', () => {
    const text = 'send 1 MON 🚀🔥💧 please';
    expect(roundTrip({ text })).toEqual({ text });
  });

  it('survives mixed Chinese + emoji + network', () => {
    const shared = { text: '把 0.5 MON 转给朋友 🎁', network: 'monad-testnet' };
    expect(roundTrip(shared)).toEqual(shared);
  });
});

/* ------------------------------------------------------------------ */
/* Link shape                                                          */
/* ------------------------------------------------------------------ */

describe('link shape', () => {
  it('puts the payload in the fragment, never a query string', () => {
    const link = encodeShareLink(BASE, { text: 'send 1 MON' });
    expect(link.startsWith(`${BASE}#plan=`)).toBe(true);
    expect(link).not.toContain('?');
  });

  it('drops an existing fragment from the base so the link has one "#"', () => {
    const link = encodeShareLink(`${BASE}#old-fragment`, { text: 'hi' });
    expect(link.split('#')).toHaveLength(2);
    expect(decodeShareLink(link)).toEqual({ text: 'hi' });
  });

  it('emits strict base64url: no +, /, or = in the payload', () => {
    const inputs = ['hello', '发送 0.5 MON 到 0x1234', '🚀🔥💧', 'a', 'ab', 'abc', 'abcd'];
    const standard = inputs.map((t) =>
      Buffer.from(JSON.stringify({ t }), 'utf-8').toString('base64'),
    );
    // Sanity: at least one of these WOULD contain +, / or = in plain base64,
    // so the assertions below actually exercise the url-safe mapping.
    expect(standard.some((s) => /[+/=]/.test(s))).toBe(true);

    for (const text of inputs) {
      const payload = payloadOf(encodeShareLink(BASE, { text }));
      expect(payload).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(payload).not.toContain('+');
      expect(payload).not.toContain('/');
      expect(payload).not.toContain('=');
    }
  });
});

/* ------------------------------------------------------------------ */
/* Accepted input forms                                                */
/* ------------------------------------------------------------------ */

describe('decodeShareLink input forms', () => {
  const payload = payloadOf(encodeShareLink(BASE, { text: 'send 2 MON' }));

  it('accepts a full URL', () => {
    expect(decodeShareLink(`${BASE}#plan=${payload}`)).toEqual({ text: 'send 2 MON' });
  });

  it('accepts a bare "#plan=…" hash', () => {
    expect(decodeShareLink(`#plan=${payload}`)).toEqual({ text: 'send 2 MON' });
  });

  it('accepts a bare "plan=…" param', () => {
    expect(decodeShareLink(`plan=${payload}`)).toEqual({ text: 'send 2 MON' });
  });

  it('finds plan among other fragment params', () => {
    expect(decodeShareLink(`#foo=1&plan=${payload}&bar=2`)).toEqual({
      text: 'send 2 MON',
    });
  });
});

/* ------------------------------------------------------------------ */
/* Rejections — always null, never a throw                             */
/* ------------------------------------------------------------------ */

describe('decodeShareLink rejections', () => {
  it('returns null when there is no plan param', () => {
    expect(decodeShareLink('')).toBeNull();
    expect(decodeShareLink(BASE)).toBeNull();
    expect(decodeShareLink(`${BASE}#other=1`)).toBeNull();
    expect(decodeShareLink('#plan=')).toBeNull();
  });

  it('returns null for malformed base64', () => {
    expect(decodeShareLink('#plan=%%%%')).toBeNull();
    expect(decodeShareLink('#plan=!!!not-base64!!!')).toBeNull();
    expect(decodeShareLink('#plan=abcde')).toBeNull(); // length ≡ 1 (mod 4)
    expect(decodeShareLink('#plan=ab=cd')).toBeNull(); // padding mid-stream
  });

  it('returns null when the payload is not JSON', () => {
    expect(decodeShareLink(`#plan=${rawPayload('not json at all')}`)).toBeNull();
  });

  it('returns null when JSON has no string t', () => {
    expect(decodeShareLink(`#plan=${rawPayload('{"n":"monad-testnet"}')}`)).toBeNull();
    expect(decodeShareLink(`#plan=${rawPayload('{"t":42}')}`)).toBeNull();
    expect(decodeShareLink(`#plan=${rawPayload('[1,2,3]')}`)).toBeNull();
    expect(decodeShareLink(`#plan=${rawPayload('"just a string"')}`)).toBeNull();
  });

  it('returns null when the text is longer than 500 chars', () => {
    const tooLong = 'a'.repeat(MAX_SHARED_TEXT_LENGTH + 1);
    expect(decodeShareLink(encodeShareLink(BASE, { text: tooLong }))).toBeNull();

    const justFits = 'a'.repeat(MAX_SHARED_TEXT_LENGTH);
    expect(decodeShareLink(encodeShareLink(BASE, { text: justFits }))).toEqual({
      text: justFits,
    });
  });
});

/* ------------------------------------------------------------------ */
/* Text trimming and network handling                                  */
/* ------------------------------------------------------------------ */

describe('text and network handling', () => {
  it('trims the decoded text', () => {
    expect(roundTrip({ text: '  send 1 MON  ' })).toEqual({ text: 'send 1 MON' });
  });

  it('preserves network when provided', () => {
    const decoded = roundTrip({ text: 'send 1 MON', network: 'monad-testnet' });
    expect(decoded?.network).toBe('monad-testnet');
  });

  it('omits network when absent or empty', () => {
    const noNetwork = roundTrip({ text: 'send 1 MON' });
    expect(noNetwork).not.toBeNull();
    expect(noNetwork && 'network' in noNetwork).toBe(false);

    const emptyNetwork = roundTrip({ text: 'send 1 MON', network: '' });
    expect(emptyNetwork?.network).toBeUndefined();
  });

  it('omits network when the payload carries a non-string n', () => {
    const decoded = decodeShareLink(`#plan=${rawPayload('{"t":"hi","n":7}')}`);
    expect(decoded).toEqual({ text: 'hi' });
  });
});

/* ------------------------------------------------------------------ */
/* Buffer fallback (runtimes without btoa/atob)                        */
/* ------------------------------------------------------------------ */

describe('Buffer fallback when btoa/atob are absent', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips Chinese text via Buffer', () => {
    vi.stubGlobal('btoa', undefined);
    vi.stubGlobal('atob', undefined);

    const shared = { text: '发送 0.5 MON 到 0x1234', network: 'monad-testnet' };
    const link = encodeShareLink(BASE, shared);
    expect(payloadOf(link)).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeShareLink(link)).toEqual(shared);
  });
});
