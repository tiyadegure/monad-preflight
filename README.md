# ▲ Monad PreFlight

**See it before you sign it.**

PreFlight is a transaction co-pilot for the Monad network. You say what you want to
do in plain language — it prepares the transaction, simulates it against live chain
state, explains exactly what will happen and what could go wrong, and only then do
you decide whether to sign. After the transaction lands, PreFlight verifies that
on-chain reality matched its prediction, line by line.

Works on **Monad mainnet and testnet**. Born in the Monad Playground hackathon
(Moss Onchain Agent direction: *prepare → simulate → explain → then let the user
decide*), built to production standards.

PreFlight is three things in one repo: the **engine** (a UI-free, deterministic
TypeScript SDK — `src/lib`, exported through `src/lib/sdk.ts`), the **app** (the
reference integration you are reading about), and the **Risk API**
(`workers/risk-api.ts`, the engine as a stateless HTTP service for wallets and
dapps). Integrators start at [docs/INTEGRATION.md](docs/INTEGRATION.md).

---

## The problem

People sign blind. A wallet popup shows raw hex calldata, a gas number, and a
Confirm button — and that is exactly how funds get lost: typo'd addresses,
unlimited token approvals granted to drainers, transactions that were always going
to fail but still burn gas. Wallets show *what you are being asked to sign*;
almost nothing shows *what will actually happen*.

## What PreFlight does

| | |
|---|---|
| 🗣 **Plain-language intents** | `send 0.5 MON to alice`, `approve … to spend 100 USDC`, `wrap 1 MON`, `unwrap all my WMON`, `revoke …'s access` — or paste a raw transaction JSON copied from any dapp popup and PreFlight explains what it was about to do. Simplified Chinese works too (`发送 0.5 MON 到 0x…`), deterministically, without AI |
| 🧳 **Multi-leg journeys** | `wrap 1 MON then send 0.5 WMON to 0x…` becomes an ordered journey — every leg is simulated, explained and signed *individually*. A second signature is never hidden behind the first |
| 🔬 **Real simulation** | Every plan runs through `debug_traceCall` on a live RPC: full call tree, decoded events, revert reasons, gas — not a guess, a dry run against current chain state |
| 🎯 **Readiness gauge** | One score, one verdict (Cleared / Hold / Grounded), one sentence of advice — because nobody reads fifteen warnings |
| 💡 **Asset-change preview** | "You send 0.5 MON · 0x12…cd receives 0.5 MON · fee ≈ 0.0002 MON" — decoded from the trace's Transfer/Approval events and native value flows |
| 🚨 **Risk annunciators** | 15 deterministic rules plus 4 on-chain counterparty checks: unlimited approvals, the approval-to-a-personal-wallet drainer pattern, never-used (typo?) recipients, guaranteed reverts, zero-address burns, and more — severity-ranked, jargon-free |
| ⏱ **Drift detection** | Re-simulates immediately before you sign and tells you if the chain moved while you were reading — the honest completion of "simulate before you sign" |
| 🎭 **Anti-spoofing (the Monad launch attack)** | Address-poisoning lookalikes, token-symbol impersonation, zero-value transfer bait — detected deterministically against *your own* contacts and tokens, no blocklist |
| ⚡ **Measured, not claimed** | Every flight plan prints the real latency of its own full check (simulation + chain reads, your round-trips included); `npm run bench` reproduces it from any machine |
| 🏚 **Approval Hangar** | Scans a recent window of on-chain Approval events, live-verifies each allowance, and shows the spenders it found — one click to revoke. It states its block window, and says so rather than implying a clean bill of health when part of the scan fails |
| ✒️ **Signature inspector** | Explains EIP-712 permits (ERC-2612, Permit2) before you sign. Signing costs no gas and shows nothing useful in a wallet — which is exactly why drainers prefer it |
| 👁 **Observer mode** | Inspect any address read-only, no wallet needed — check a friend's wallet for drainer approvals, or audit before you interact |
| ✍️ **Your keys, your wallet** | PreFlight never touches keys; your own wallet signs. It only *prepares* and *explains* |
| ✅ **Post-flight verification** | After mining, the receipt is compared against the pre-sign simulation: outcome, every token movement, fee — matched or flagged |
| 🌏 **中文 / English** | Bilingual dictionary (121 keys per language, parity-tested) wired through every panel, plus Chinese intent parsing. Text generated from chain data (risk findings, explanations) is English-only today — see roadmap |
| 🤖 **Optional AI co-pilot** | Claude parses phrasings the rule grammar can't and writes a short narrative — grounded strictly in the simulator's verified facts, clearly labeled. The app is 100% functional without it |
| 🧰 **Engine SDK + Risk API** | The whole pipeline is a UI-free library (`assessTransaction` — one call: simulate → risks → score → explain) plus a stateless, deterministic HTTP service for wallets and dapps. The app is just the reference integration — [docs/INTEGRATION.md](docs/INTEGRATION.md) |

Full feature reference: **[docs/FEATURES.md](docs/FEATURES.md)**.

## Built for what Monad needs right now

The community has been explicit about the ecosystem's open problems this
summer, and this project is aimed squarely at them.

**"We need a new generation of well-performing Monad apps."** *(@emil_pepil and
recurring community sentiment, July 2026.)* PreFlight's core interaction is
only pleasant on a chain this fast: every prepare runs a full `debug_traceCall`
simulation plus a dozen live chain reads, again at signing time (drift
detection), and again after landing (post-flight verification). The measured
latency of that pipeline is printed on every flight plan — your numbers, on
your network, not our marketing — and `npm run bench` reproduces the
measurement from any machine. Honest sample: from our worst-positioned test
seat (the far side of the planet, behind a proxy), the complete check ran at
p50 ≈ 1.8 s *including 10+ network round-trips*; the closer you sit to an RPC,
the more of that disappears.

**Liquidity that stays.** *("What it needs most rn is… liquidity that'll
continue to remain on Monad for years… REAL and STICKY network effects" —
@zayn4pf.)* Users leave chains where they get drained; they stay where they can
see what they sign. That is why the engine ships as an SDK and a stateless
[Risk API](docs/risk-api.md): pre-sign protection as an ecosystem property any
Monad wallet or dapp can embed, not one app's feature. This matters more, not
less, after [Phantom announced it will end Monad support on August 26,
2026](https://www.cryptotimes.io/2026/07/25/phantom-pulls-the-plug-on-monad-less-than-a-year-after-launch/)
— chain-native safety infrastructure should not depend on any single wallet
staying.

**And the attack Monad actually got.** Within 48 hours of mainnet launch,
scammers flooded the chain with [spoofed ERC-20
transfers](https://coinjournal.net/news/monad-mainnet-scam-alerts-rise-as-fake-erc20-transfers-spread-across-new-chain/)
— fabricated Transfer events (some appearing to come from co-founder James
Hunsaker's own wallet) that plant lookalike addresses in histories and steer
users toward malicious approvals; [drainers systematically target new chains in
exactly this window](https://www.blockaid.io/blog/how-wallet-drainers-exploit-new-blockchain-launches).
PreFlight detects the kill chain deterministically — lookalike recipients
imitating your saved contacts (address poisoning), tokens wearing a known
symbol at the wrong address (impersonation), zero-value transfers (the
poisoning primitive) — all local comparisons, no blocklist to go stale or be
censored. Details: [SECURITY.md](SECURITY.md).

## What's live vs. simulated (honesty table)

Everything in the core flow is live: preparation (viem), simulation
(`debug_traceCall` with callTracer + withLog), risk analysis (on-chain lookups:
code, nonce, balances), signing (your wallet), post-flight (mined receipt). The
**only** optional part is the AI layer, and its output is labeled in the UI.
**Nothing in the product is mocked.** When an RPC can't provide deep tracing,
PreFlight degrades honestly: it runs a basic check and *tells you* the preview is
partial.

## Security model

- **Keys:** never seen. PreFlight builds unsigned transactions; the wallet signs.
- **AI key (local mode):** bring-your-own Anthropic key, stored in your browser's
  localStorage only, sent only to Anthropic. For production deployments use the
  bundled [origin-locked proxy](docs/ai-proxy.md) so no key ever exists in the browser.
- **No tracking:** no analytics, no third-party calls beyond the RPC (and Anthropic
  when AI is enabled).
- **Simulation honesty:** a simulation is a best-effort preview of state *now*, not
  a guarantee of the mined outcome — the post-flight check exists precisely to make
  that verifiable, and the UI says so.

## Run it

```bash
npm install
npm run dev          # → http://localhost:5173
```

Requires a browser wallet (MetaMask or compatible). PreFlight adds/switches
networks for you — Monad Testnet (10143) by default, Mainnet (143) via the
switcher. Testnet gas: [faucet](https://faucet.monad.xyz).

```bash
npm test             # 685 unit tests (offline, deterministic)
npm run test:e2e     # 13 LIVE tests against real Monad testnet AND mainnet RPCs —
                     # discovers a real token from recent blocks and verifies the
                     # whole pipeline, plus RPC failover, fee reading, contract
                     # fingerprinting, Multicall3 balances, and approval scanning
npm run build        # strict typecheck + production build
npm run verify:sdk   # build the engine SDK (dist-sdk/) and smoke-test the artifact
```

## How it works

```
 "send 0.5 MON to 0xabc…"        or        pasted raw tx JSON
        │
        ▼
 parseIntent ────────── rule grammar; Claude fallback (optional, labeled)
        ▼
 buildTx (viem) ─────── unsigned tx: to / data / value + human summary
        ▼
 simulateTx ─────────── debug_traceCall → call tree, events, revert reason,
        │               gas; ERC-20 metadata read on-chain; RPC failover
        ▼
 assessRisks ────────── 15 deterministic rules → severity-ranked findings
        ▼
 composeExplanation ─── plain language, second person, zero jargon
        ▼
 FLIGHT PLAN ────────── you read, you decide, your wallet signs
        ▼
 comparePostFlight ──── mined receipt vs. simulation, line by line
```

Every module is small, unit-tested, and written to be explained line-by-line.
The type contracts live in `src/lib/types.ts`; the design system in
[DESIGN.md](DESIGN.md) (typeface: B612 — commissioned by Airbus for cockpit
displays; PreFlight is an instrument panel, so it's set in the cockpit font).

## Deployment

Static app — any static host. Full guide: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).
For the AI co-pilot in production, deploy the [Cloudflare Worker
proxy](docs/ai-proxy.md) (key server-side, origin-locked, rate-limited).

### Demo token (testnet)

```powershell
$env:PRIVATE_KEY = "0x<funded testnet key>"
npm run deploy:token
```

Deploys `contracts/DemoToken.sol` — tUSD, 6 decimals (deliberately: it proves the
decimal math), public `faucet()` giving 100 tUSD per call. Paste the address into
*Settings → Teach PreFlight a token*.

## Roadmap

- **Swap support** via an on-chain DEX router, same prepare→simulate→explain flow
- **Wallet-extension companion** — intercept any dapp's request and pre-flight it in place (the extension would embed the same `assessTransaction` pipeline the app uses)
- ~~Risk API~~ — **shipped** as a reference worker: [docs/risk-api.md](docs/risk-api.md). Still ahead: hosted-grade hardening (auth, quotas, caching) with a first integration partner
- *Sending* batch transactions (EIP-5792 `wallet_sendCalls`) — the batch *explainer* is shipped; composing and submitting batches is not
- Historical approval scanning beyond the recent-block window (indexer-backed)
- Translate the generated prose (risk findings, explanations, simulation notes) into Chinese — the UI chrome is fully bilingual today

## AI usage disclosure

Built with AI-assisted coding (Claude Code): contracts-first specs, unit tests per
module, every line explainable. Runtime AI (Claude) is optional, labeled, and
constrained to verified simulator facts.

## License

[MIT](LICENSE)
