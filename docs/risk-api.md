# Risk API — the PreFlight engine over HTTP

`workers/risk-api.ts` is a reference Cloudflare Worker that exposes the
assessment pipeline as a stateless JSON API. Wallets and dapps that cannot
embed the SDK call this instead and get byte-for-byte the same risk
findings, readiness score, and explanation the PreFlight app shows.

Design rules: **stateless** (nothing about a user's transaction is stored
— post-flight verification round-trips an opaque blob through the caller),
**deterministic** (no AI anywhere in this service), **honest** (unknown
facts are reported as unknown; degraded simulation says so; post-flight
lines are matched / mismatched / unverified).

All bigints appear as decimal strings. All endpoints are CORS-open in this
reference deployment.

## Deploy

```bash
# wrangler.toml
# name = "preflight-risk-api"
# main = "workers/risk-api.ts"
# compatibility_date = "2026-07-01"

npx wrangler deploy
```

Wrangler bundles the worker together with the engine sources it imports
(`viem` included). No secrets are required — the service holds no keys.

## Endpoints

### GET /v1/meta

Service description: engine version, supported networks, endpoint list.

### POST /v1/preflight

Assess a transaction before it is signed.

```json
{
  "network": "testnet",
  "from": "0xYourUser…",
  "to": "0xTarget…",
  "data": "0x…",                    // optional, defaults to 0x
  "value": "0xde0b6b3a7640000",     // optional; "0x…" = wei, decimal = MON
  "knownAddresses": ["0x…"]         // optional, ≤200: the user's trusted
                                    // addresses, for address-poisoning
                                    // lookalike detection
}
```

Response (abridged):

```json
{
  "ok": true,
  "engine": "0.2.0",
  "summary": "Custom transaction to 0xTarg…et",
  "timings": { "simulateMs": 210, "factsMs": 95, "extrasMs": 120, "totalMs": 425 },
  "simulation": {
    "ok": true,
    "revertReason": null,
    "gasUsed": "21000",
    "gasCostWei": "21000000000000",
    "notes": [],
    "assetChanges": [ { "party": "0x…", "token": {…}, "deltaRaw": "-1000000000000000000" } ],
    "approvalChanges": []
  },
  "risks": [ { "id": "…", "severity": "danger|caution|info", "title": "…", "detail": "…" } ],
  "readiness": { "score": 92, "band": "clear", "verdict": "…", "advice": "…" },
  "explanation": { "headline": "…", "outcome": "…", "bullets": ["…"] },
  "fees": { "verdict": "…", "…": "…" },
  "counterparty": { "kind": "…", "label": "…", "detail": "…" },
  "verifyBlob": "…opaque…"
}
```

Keep `verifyBlob` if you intend to verify later — the service will not
remember the simulation for you.

```bash
curl -s https://<your-worker>/v1/preflight \
  -H 'content-type: application/json' \
  -d '{"network":"testnet","from":"0x…","to":"0x…","value":"0x1"}'
```

### POST /v1/postflight

After the transaction lands, compare the mined receipt against what was
simulated at preflight time.

```json
{ "network": "testnet", "hash": "0x…64 hex…", "verifyBlob": "…from preflight…" }
```

Returns `{ "status": "pending", "check": null }` until mined, then
`{ "status": "mined", "check": { "matched": …, "hasUnverified": …, "lines": [ … ] } }`
where every line carries `status`: `matched`, `mismatched`, or
`unverified` with a note explaining what a receipt cannot prove.

### POST /v1/inspect-signature

Explain a signature request before the user approves it. Accepts the same
three shapes as the app's Signatures tab — EIP-712 typed data, an EIP-7702
delegation authorization, or an EIP-5792 `wallet_sendCalls` batch — and
triages delegation first, because handing over the wallet is worse than
anything a permit can do.

```json
{ "payload": { …the request… }, "network": "testnet", "selfAddress": "0x…" }
```

Returns `recognized: true` with `kind`, `headline`, `outcome`, `bullets`,
`risks` — or `recognized: false` with a plain-language `error`.

### GET /v1/delegation/:network/:address

Reads the account code and reports whether the wallet carries an EIP-7702
delegation designator (`0xef0100‖address`), to whom, and the associated
danger finding. The current top drainer vector, as one GET.

## Errors

`400` for anything wrong with the request (with a plain-language message),
`405` for wrong methods, `404` for unknown paths, and `502` when the chain
itself could not be reached — the service never dresses an upstream
failure up as a clean answer.

## Hardening for production

The reference deployment is intentionally minimal. Before exposing it to
the open internet at scale, add: an API-key check or origin allowlist
(mirror `workers/ai-proxy.ts`, which shows the origin-lock pattern),
per-key rate limiting backed by Durable Objects or KV, and response
caching keyed on `(network, from, to, data, value)` with a short TTL if
your traffic repeats. None of these change the engine's behavior.
