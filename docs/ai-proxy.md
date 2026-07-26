# AI proxy — deploying `workers/ai-proxy.ts`

Monad PreFlight's AI features (natural-language intent parsing and the
friendly narrative) call the Anthropic API. There are two ways to connect:

| Mode | Who holds the key | When to use |
|---|---|---|
| Bring-your-own-key | The user pastes their own key into Settings; it stays in their browser (localStorage) and goes straight to Anthropic. | Local use, demos, development. |
| **Proxy (this doc)** | You hold one key in a Cloudflare Worker secret. The browser never sees it. | Production. Users should never paste an API key into a web page. |

The proxy is a single dependency-free file: `workers/ai-proxy.ts`. It accepts
`POST /v1/messages` from exactly one web origin and forwards it to Anthropic
with the real key attached server-side.

## Deploy

1. **Install and log in to Wrangler** (Cloudflare's deploy tool):

   ```sh
   npx wrangler login
   ```

2. **Create `wrangler.toml`** in the repo root (not checked in by default —
   it contains your own origin):

   ```toml
   name = "preflight-ai-proxy"
   main = "workers/ai-proxy.ts"
   compatibility_date = "2026-07-01"

   [vars]
   # The exact origin of your deployed PreFlight app. Exact match only —
   # scheme + host + port, no trailing slash, no wildcard.
   ALLOWED_ORIGIN = "https://preflight.example.com"
   ```

3. **Set the secret** (the real Anthropic API key — this is the only place
   it ever lives):

   ```sh
   npx wrangler secret put ANTHROPIC_API_KEY
   ```

4. **Deploy:**

   ```sh
   npx wrangler deploy
   ```

   Wrangler prints the Worker URL, e.g.
   `https://preflight-ai-proxy.your-account.workers.dev`. That URL is your
   proxy base.

### Local testing

```sh
ALLOWED_ORIGIN="http://localhost:5173"  # in wrangler.toml [vars], or via --var
npx wrangler dev
```

`wrangler dev` serves the Worker on `http://localhost:8787`; point the app at
that while developing.

## Point PreFlight at the proxy

`createAiClient` in `src/lib/claude.ts` takes an optional second argument:

```ts
// Bring-your-own-key (unchanged local behavior):
createAiClient(userPastedKey);

// Proxy: no real key in the browser. The SDK still requires a key string,
// so a placeholder ("proxy-managed") is sent; the proxy never reads or
// forwards it.
createAiClient('', 'https://preflight-ai-proxy.your-account.workers.dev');
```

Wire the proxy URL to however your build supplies configuration (for example
a `VITE_AI_PROXY_URL` env var read at the `createAiClient` call sites in
`App.tsx`). When the proxy URL is set, the API-key field in Settings can be
left empty.

## Security rationale

- **The key never reaches the browser.** It lives in a Cloudflare secret and
  is attached to requests server-side. Whatever `x-api-key` the browser
  sends is never read and never forwarded.
- **Origin-locked.** CORS `Access-Control-Allow-Origin` is the single exact
  value of `ALLOWED_ORIGIN` — never `*` — and any request carrying a
  different `Origin` header is refused with 403.
- **One route only.** `POST /v1/messages` is the only endpoint; everything
  else 404s, so the proxy cannot be used to reach other Anthropic APIs.
- **Abuse guards.** Bodies over 64 KB are rejected (PreFlight requests are a
  few KB at most), only model ids starting with `claude-` are accepted, and
  each IP is limited to ~30 requests/minute.

## Known limits

- **The rate limit is best-effort.** The counter is an in-memory Map inside
  one Worker isolate: it resets on cold starts and redeploys, and is not
  shared across Cloudflare data centers. It blunts casual abuse; it is not a
  hard quota. Real deployments should move the counter to **Durable
  Objects** (strongly consistent, one object per IP) or **KV** (eventually
  consistent, cheaper).
- **Non-browser clients can still call the proxy.** CORS and the Origin
  check only constrain browsers; `curl` can omit the Origin header. The rate
  limit, the model allowlist, and — most importantly — a **spend limit on
  the Anthropic key** (set it in the Anthropic Console) bound the damage. If
  that is not enough for your deployment, add your own auth in front (for
  example Cloudflare Access, or a session token your app issues).
- **Streaming passes through untouched.** The Worker returns Anthropic's
  response body as-is, so if the app ever switches to streaming responses,
  no proxy change is needed.
