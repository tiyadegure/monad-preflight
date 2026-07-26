/**
 * Shareable intent links.
 *
 * A share link carries the plain-language flight plan in the URL
 * *fragment* (the part after "#"):
 *
 *   https://app.example/#plan=eyJ0Ijoic2VuZCAwLjUgTU9OIn0
 *
 * Fragments are never sent to servers, so the plan text stays between
 * the sender and the recipient. The recipient's app decodes the text
 * and simulates it against THEIR wallet — a link only describes a
 * transaction, it can never sign one.
 */

export interface SharedIntent {
  /** The plan text exactly as the sender wrote it, e.g. "send 0.5 MON to 0x…" */
  text: string;
  /** Optional network hint, e.g. "monad-testnet" */
  network?: string;
}

/** Abuse guard: decoded plan text longer than this is rejected. */
export const MAX_SHARED_TEXT_LENGTH = 500;

/* ------------------------------------------------------------------ */
/* base64url helpers (RFC 4648 §5: + → -, / → _, no padding)           */
/*                                                                     */
/* Why not btoa(text) directly: btoa only accepts "binary strings"     */
/* whose code points are all ≤ 0xFF, so it throws on any non-ASCII     */
/* text — Chinese input, emoji, accented names. We therefore always    */
/* go text → UTF-8 bytes (TextEncoder) → one-char-per-byte binary      */
/* string → btoa. In runtimes without btoa/atob (older Node), Buffer   */
/* does the same byte-level conversion, so links round-trip            */
/* identically in browser and node.                                    */
/* ------------------------------------------------------------------ */

/** Minimal shape of Node's Buffer, so we can use it without @types/node. */
interface BufferCtorLike {
  from(data: Uint8Array): { toString(encoding: 'base64'): string };
  from(data: string, encoding: 'base64'): Uint8Array;
}

const nodeBuffer = (globalThis as { Buffer?: BufferCtorLike }).Buffer;

function bytesToBase64Url(bytes: Uint8Array): string {
  let b64: string;
  if (typeof btoa === 'function') {
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    b64 = btoa(binary);
  } else if (nodeBuffer) {
    b64 = nodeBuffer.from(bytes).toString('base64');
  } else {
    throw new Error('This environment cannot encode share links.');
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(payload: string): Uint8Array | null {
  // Strict base64url alphabet; anything else is malformed.
  if (!/^[A-Za-z0-9_-]+$/.test(payload)) return null;
  // No valid base64 stream has length ≡ 1 (mod 4).
  if (payload.length % 4 === 1) return null;
  const b64 =
    payload.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (payload.length % 4)) % 4);
  try {
    if (typeof atob === 'function') {
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }
    if (nodeBuffer) return nodeBuffer.from(b64, 'base64');
  } catch {
    return null;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

/**
 * Build a share link: `${base}#plan=<payload>` where the payload is
 * base64url-encoded JSON `{ t: text, n?: network }`. Any fragment
 * already present on `base` is dropped so the link has a single "#".
 */
export function encodeShareLink(base: string, shared: SharedIntent): string {
  const body: { t: string; n?: string } = { t: shared.text };
  if (typeof shared.network === 'string' && shared.network.trim() !== '') {
    body.n = shared.network;
  }
  const json = JSON.stringify(body);
  const payload = bytesToBase64Url(new TextEncoder().encode(json));
  const hashAt = base.indexOf('#');
  const cleanBase = hashAt >= 0 ? base.slice(0, hashAt) : base;
  return `${cleanBase}#plan=${payload}`;
}

/**
 * Decode a share link. Accepts a full URL, a bare "#plan=…" hash, or a
 * bare "plan=…" string. Returns null — never throws — when there is no
 * plan, the payload is not valid base64url/UTF-8/JSON, the JSON has no
 * string `t`, or the text exceeds {@link MAX_SHARED_TEXT_LENGTH} chars.
 */
export function decodeShareLink(urlOrHash: string): SharedIntent | null {
  if (typeof urlOrHash !== 'string' || urlOrHash === '') return null;

  const hashAt = urlOrHash.indexOf('#');
  const fragment = hashAt >= 0 ? urlOrHash.slice(hashAt + 1) : urlOrHash;

  let payload: string | null;
  try {
    payload = new URLSearchParams(fragment).get('plan');
  } catch {
    return null;
  }
  if (!payload) return null;

  const bytes = base64UrlToBytes(payload);
  if (!bytes) return null;

  let parsed: unknown;
  try {
    // fatal: true → invalid UTF-8 rejects the link instead of silently
    // turning into replacement characters.
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const record = parsed as Record<string, unknown>;

  if (typeof record.t !== 'string') return null;
  const text = record.t.trim();
  if (text.length > MAX_SHARED_TEXT_LENGTH) return null;

  const result: SharedIntent = { text };
  if (typeof record.n === 'string' && record.n.trim() !== '') {
    result.network = record.n.trim();
  }
  return result;
}
