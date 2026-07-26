# Deploying Monad PreFlight

PreFlight is a fully static web app — no backend required for the core product.
The optional AI co-pilot gets its own tiny proxy (below) so API keys never exist
in the browser.

## 1. Static hosting (the app itself)

Any static host works. Build output is `dist/`.

| Host | Setup |
|---|---|
| Cloudflare Pages | Build command `npm run build`, output directory `dist` |
| Vercel | Framework preset: Vite. Nothing else to configure |
| Netlify | Build `npm run build`, publish `dist` |
| Self-hosted | `npm run build`, serve `dist/` from any web server |

There are **no environment variables** in the core app by design — network
endpoints live in `src/lib/networks.ts`, everything else is user-scoped
(localStorage).

Recommended headers (all hosts support custom headers):

```
Content-Security-Policy: default-src 'self'; connect-src 'self'
  https://testnet-rpc.monad.xyz https://rpc.monad.xyz https://rpc1.monad.xyz
  https://rpc2.monad.xyz https://rpc3.monad.xyz https://api.anthropic.com
  <your-ai-proxy-url>; style-src 'self' 'unsafe-inline'; img-src 'self' data:;
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
```

(`style-src 'unsafe-inline'` is needed for React inline styles; there is no inline
script anywhere in the app.)

## 2. RPC capacity

Public Monad endpoints are rate-limited (mainnet primary: 25 rps). The app ships
with ordered failover across all four public mainnet endpoints, but for real
traffic put your own RPC first in `src/lib/networks.ts` — it must support
`debug_traceCall` (callTracer) for full simulation. Without it, PreFlight
degrades to a basic check and honestly labels the preview as partial.

## 3. AI co-pilot in production

Local/dev: users can paste their own Anthropic key (stored only in their browser).

Production: deploy the bundled Cloudflare Worker so the key lives server-side,
locked to your origin and rate-limited — see [ai-proxy.md](ai-proxy.md).

## 4. Continuous integration

`.github/workflows/ci.yml` runs lint → unit tests → strict typecheck → production
build on every push and PR. The live-RPC suite (`npm run test:e2e`) is deliberately
manual — it depends on public testnet state and rate limits, so run it before
releases rather than on every commit.

## 5. Release checklist

1. `npm test` — all unit tests green
2. `npm run test:e2e` — live pipeline verified against the real chain
3. `npm run build` — strict typecheck + bundle
4. Spot-check both networks in the UI (switcher → status strip shows the right
   chain, faucet link only on testnet, `real funds` chip on mainnet)
5. Tag + deploy `dist/`
