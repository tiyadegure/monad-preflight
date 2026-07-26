/**
 * Monad PreFlight — AI proxy (Cloudflare Worker).
 *
 * Why this exists: production users should never paste an Anthropic API key
 * into a web page. Instead, the PreFlight web app sends its AI requests to
 * this tiny proxy, and the proxy adds the real key on the server side.
 * The key lives only in a Cloudflare secret; the browser never sees it.
 *
 * What it does, in one breath: accept POST /v1/messages from exactly one
 * allowed web origin, apply a few abuse guards (size cap, model allowlist,
 * per-IP rate limit), then forward the request to Anthropic with the real
 * key attached — and never forward whatever key the browser sent.
 *
 * This file is deliberately dependency-free and self-contained so it can be
 * read top to bottom and deployed with `wrangler deploy` alone.
 * Deployment guide: docs/ai-proxy.md.
 */

/** Bindings this Worker expects. Kept local on purpose — no
 *  @cloudflare/workers-types dependency; standard fetch types suffice. */
interface Env {
  /** The real Anthropic API key. Set with: npx wrangler secret put ANTHROPIC_API_KEY */
  ANTHROPIC_API_KEY: string;
  /** The exact web origin allowed to call this proxy, e.g. "https://preflight.example.com".
   *  Exact match only — no wildcard in production. */
  ALLOWED_ORIGIN: string;
}

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';

/** Reject request bodies larger than this. PreFlight requests are tiny
 *  (a sentence of user text or a short fact sheet), so 64 KB is generous. */
const MAX_BODY_BYTES = 64 * 1024;

/** Per-IP rate limit: at most this many requests per window. */
const RATE_LIMIT_MAX_REQUESTS = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Headers the browser is allowed to include on requests to this proxy.
 * These are the headers the Anthropic SDK actually sends. On preflight we
 * also echo whatever else the browser asks for (the SDK adds telemetry
 * headers like x-stainless-runtime) — the allow-headers list is not a
 * security boundary; the origin lock and the server-held key are.
 */
const BASE_ALLOWED_HEADERS =
  'content-type, anthropic-version, anthropic-beta, anthropic-dangerous-direct-browser-access, x-api-key';

/**
 * Per-IP request counters for the rate limit.
 *
 * IMPORTANT LIMITATION, on purpose: this Map lives inside one Worker
 * isolate. It is wiped on cold starts and redeploys, and it is NOT shared
 * across Cloudflare's data centers — two requests from the same IP can land
 * on two isolates with two separate counters. That makes this a best-effort
 * guard that blunts casual abuse of a demo, not a hard quota. A real
 * deployment should move the counter to Durable Objects (strongly
 * consistent, one object per IP) or KV (eventually consistent, cheaper).
 */
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

/** Drop expired counters so the Map cannot grow without bound. */
function pruneRateBuckets(now: number): void {
  if (rateBuckets.size < 5_000) return;
  for (const [ip, bucket] of rateBuckets) {
    if (now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
      rateBuckets.delete(ip);
    }
  }
}

/** Fixed-window counter: true when this IP has used up its budget. */
function isRateLimited(ip: string, now: number): boolean {
  pruneRateBuckets(now);
  const bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT_MAX_REQUESTS;
}

/**
 * CORS headers attached to every response. The origin is the single exact
 * value from the environment — never "*". `requestedHeaders` is the
 * browser's Access-Control-Request-Headers preflight value, echoed back so
 * SDK telemetry headers don't fail the preflight.
 */
function corsHeaders(env: Env, requestedHeaders: string | null): Record<string, string> {
  return {
    'access-control-allow-origin': env.ALLOWED_ORIGIN,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': requestedHeaders
      ? `${BASE_ALLOWED_HEADERS}, ${requestedHeaders}`
      : BASE_ALLOWED_HEADERS,
    'access-control-expose-headers': 'request-id',
    'access-control-max-age': '86400',
    vary: 'origin, access-control-request-headers',
  };
}

/** A small error response in the same JSON shape the Anthropic API uses,
 *  so the SDK in the browser can surface it cleanly. */
function jsonError(status: number, message: string, cors: Record<string, string>, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify({ type: 'error', error: { type: 'proxy_error', message } }), {
    status,
    headers: { 'content-type': 'application/json', ...cors, ...extraHeaders },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cors = corsHeaders(env, request.headers.get('access-control-request-headers'));
    const url = new URL(request.url);

    // 1. CORS preflight: the browser asks permission before the real POST.
    //    Answer for any path — the browser only proceeds if the origin and
    //    headers here match, and the real request is still fully checked.
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    // 2. Exactly one route exists: POST /v1/messages. Everything else 404s,
    //    so the proxy cannot be used to reach any other Anthropic endpoint.
    if (url.pathname !== '/v1/messages' || request.method !== 'POST') {
      return jsonError(404, 'Not found.', cors);
    }

    // 3. Origin lock. Browsers always attach an Origin header to cross-site
    //    requests; if one is present and it is not our app, refuse. (Plain
    //    HTTP clients can omit Origin — the rate limit below and spend
    //    limits on the Anthropic key are the guards for those.)
    const origin = request.headers.get('origin');
    if (origin !== null && origin !== env.ALLOWED_ORIGIN) {
      return jsonError(403, 'This origin is not allowed to use the proxy.', cors);
    }

    // 4. Per-IP rate limit (~30 requests/minute). CF-Connecting-IP is set
    //    by Cloudflare and cannot be spoofed by the client.
    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    if (isRateLimited(ip, Date.now())) {
      return jsonError(429, 'Too many requests from this address. Please wait a minute and try again.', cors, {
        'retry-after': '60',
      });
    }

    // 5. Size cap. Read the body once as bytes so the check cannot be
    //    dodged by omitting Content-Length.
    const rawBody = await request.arrayBuffer();
    if (rawBody.byteLength > MAX_BODY_BYTES) {
      return jsonError(413, 'Request body is too large for this proxy.', cors);
    }

    // 6. Model allowlist: this proxy only pays for Claude models.
    let parsedBody: { model?: unknown };
    try {
      parsedBody = JSON.parse(new TextDecoder().decode(rawBody)) as { model?: unknown };
    } catch {
      return jsonError(400, 'Request body is not valid JSON.', cors);
    }
    if (typeof parsedBody.model !== 'string' || !parsedBody.model.startsWith('claude-')) {
      return jsonError(400, 'Only Claude model ids are allowed through this proxy.', cors);
    }

    // 7. Forward to Anthropic. The headers are built from scratch: the real
    //    key comes from the Worker secret, and the x-api-key the browser
    //    sent (a placeholder) is deliberately never read or forwarded.
    const upstreamHeaders: Record<string, string> = {
      'content-type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': request.headers.get('anthropic-version') ?? '2023-06-01',
    };
    const beta = request.headers.get('anthropic-beta');
    if (beta !== null) {
      upstreamHeaders['anthropic-beta'] = beta;
    }

    const upstream = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: upstreamHeaders,
      body: rawBody,
    });

    // 8. Pass Anthropic's answer straight through — body unchanged (this
    //    also works for streaming responses), status unchanged — with our
    //    CORS headers added so the browser accepts it. request-id is kept
    //    so failures can be reported to Anthropic support.
    const responseHeaders = new Headers(cors);
    responseHeaders.set('content-type', upstream.headers.get('content-type') ?? 'application/json');
    const requestId = upstream.headers.get('request-id');
    if (requestId !== null) {
      responseHeaders.set('request-id', requestId);
    }
    return new Response(upstream.body, { status: upstream.status, headers: responseHeaders });
  },
};
