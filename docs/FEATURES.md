# Monad PreFlight — feature reference

Every feature below is implemented, unit-tested, and reachable from the UI.
"Live" means it reads real chain state; nothing here is mocked.

## The core loop

| Feature | What it does |
|---|---|
| **Plain-language intents** | `send 0.5 MON to 0xabc…`, `approve … to spend 100 USDC`, `wrap 1 MON`, `unwrap all my WMON`, `revoke …'s access` — a deterministic rule grammar, no AI required |
| **Chinese intents** ✅ shipped | The same grammar reads Simplified Chinese: `发送 0.5 MON 到 0x…`, `授权 0x… 花费 100 tUSD`, `撤销 0x… 对我的 tUSD 的授权`, `封装 1 MON`, `把 2 WMON 换成 MON` — a deterministic normalization layer, not AI, covered by its own test suite. Amounts use digits, and 万/千/百/亿 multipliers are expanded (`1万` = 10,000). When a sentence is ambiguous (a fraction like 一半, a token named in Chinese, wrapping mixed with a send), PreFlight refuses and asks rather than guessing |
| **Raw transaction decoding** | Paste the JSON a dapp is about to make you sign; PreFlight prepares and explains it |
| **Live simulation** | `debug_traceCall` (callTracer + withLog): full call tree, decoded events, revert reasons, gas |
| **Asset-change preview** | Exact deltas per party per token, decoded from trace events and native value flows |
| **Risk engine** | 15 deterministic rules — unlimited approvals, approval-to-a-personal-wallet (the drainer pattern), never-used recipients, guaranteed reverts, zero-address burns, sending your whole balance, unreadable raw calls, degraded simulation, and more |
| **Readiness gauge** | One score (0–100), one verdict (Cleared / Hold / Grounded), one sentence of advice — derived deterministically from the findings |
| **Plain-language explanation** | Second person, zero jargon, generated without AI |
| **Post-flight verification** | The mined receipt compared against the pre-sign simulation, line by line |
| **Instrument deep-dive** | The raw call tree and decoded events, for anyone who wants to see under the hood |

## Safety features nobody else ships

| Feature | Why it matters |
|---|---|
| **Approval Hangar** | Scans a recent window of on-chain `Approval` events, verifies each with a live `allowance()` read, and lists the spenders it found — one click revokes through the normal simulate-and-explain flow. The scan states its block window and says so when any range failed; approvals older than the window need the indexer work on the roadmap |
| **Exposure report** | "How much of my money can someone else take right now?" — balances × approvals, clamped to what is actually reachable |
| **Signature inspector** | EIP-712 typed data (ERC-2612 Permit, Permit2 single and batch) explained before you sign. Signing costs no gas and shows nothing useful in a wallet, which is exactly why drainers prefer it. The explainer reads the *declared type*, not just the message, so decoy fields cannot make it describe one deal while your wallet signs another |
| **Wallet-takeover detection (EIP-7702)** ✅ shipped | The current top drainer vector: one signature installs code into an ordinary wallet so a program can act as you, permanently and invisibly. PreFlight reads the delegation designator from account code, warns when your own wallet is delegated, warns when you send funds to a delegated wallet (they can be swept the moment they arrive), and explains a delegation request before you sign — including `chainId: 0`, which applies it to every network at once. Verified live on Monad: both networks report the Prague fork |
| **Batch-call splitter (EIP-5792)** ✅ shipped | A `wallet_sendCalls` batch hides several actions behind one confirmation. PreFlight splits it back into its individual instructions so each can be read and simulated, and says plainly whether they must all succeed together or can land separately |
| **Observer mode** | Inspect any address read-only, without connecting a wallet — check a friend's wallet for drainer approvals, or audit a contract before you interact |
| **Counterparty reputation** | Judges an address from on-chain evidence only (code size, transaction count, how many distinct owners recently approved it) — no external allowlist that can go stale or be censored |
| **Contract fingerprinting** | Tells a token from an NFT from a proxy from a minimal-clone forwarder, including a warning that a proxy's real code can be swapped by whoever controls it |
| **Simulation drift detection** | Re-simulates just before signing and reports whether the chain moved while you were reading — material change, cosmetic change, or none |
| **Anti-spoofing / address poisoning** ✅ shipped | The scam wave Monad saw at launch (fabricated Transfer events, lookalike addresses, fake claims). PreFlight flags recipients whose truncated form imitates a saved contact, tokens wearing a known symbol at the wrong address, and zero-value transfers — deterministic, local comparisons against *your* address book and token list, no external blocklist |
| **Measured latency** ✅ shipped | Every flight plan prints the wall-clock time of its own full check (simulation · chain reads, round-trips included) so the performance story is the user's own measurement; `npm run bench` runs 10 sequential full checks against live testnet and prints percentiles |
| **Fee intelligence** | Compares this transaction's fee against the last 20 blocks and says, in words, whether now is an expensive moment |

## Product features

| Feature | Detail |
|---|---|
| **Mainnet + testnet** | Chain 143 and 10143, with per-network clients, token registries, explorer links, flight logs, and a "real funds" indicator |
| **RPC failover** | Ordered multi-endpoint client with timeouts, 429/5xx failover, and a sticky healthy endpoint |
| **中文 / English** | Bilingual dictionary (121 keys per language, parity-tested) with auto-detection and a switcher — wired through the console, flight plan, journey strip, post-flight, hangar, flight log, settings, navigation and footer. Honest boundary: text *generated from chain data* (risk findings, explanations, simulation notes, health-check details, parse-failure messages) plus a handful of error/drift strings are English-only today; translating those is on the roadmap |
| **Address book** | Save contacts, then say "send 1 MON to alice" — names resolve to addresses before parsing |
| **Flight log** | Every signed transaction with its verification verdict, per network, stored locally |
| **Shareable links** | Copy a link that opens the exact same instruction for someone else (URL fragment — never sent to a server); it pre-fills, it never auto-signs |
| **Markdown reports** | Copy a full flight report for records, support tickets, or team review |
| **Multi-leg journeys** ✅ shipped | `wrap 1 MON then send 0.5 WMON to 0x…` (or `然后` / `接着` / newlines / semicolons) becomes an ordered journey strip. Every leg gets its own simulation, its own explanation, and its own wallet signature — a second signature is never hidden behind the first. You can continue, skip a step, or abandon the rest; a leg whose outcome is unknown is shown as exactly that, never as succeeded |
| **Keyboard-first** | `Ctrl/Cmd+K` focus, `Ctrl/Cmd+Enter` prepare, `Ctrl/Cmd+Shift+S` sign, `Esc` discard, `Ctrl/Cmd+→` next tab |
| **Installable (PWA)** | Manifest, theme color, standalone display |
| **Optional AI co-pilot** | Claude parses phrasings the grammar can't and writes a narrative — from verified simulator facts only, clearly labeled, and entirely optional |
| **Engine SDK** ✅ shipped | The whole pipeline as a UI-free library: `assessTransaction` composes simulate → facts → risks → reputation → 7702 checks → score → explanation in one call, with pluggable chain access (viem or raw JSON-RPC). Curated surface in `src/lib/sdk.ts`; `npm run verify:sdk` builds `dist-sdk/` and smoke-tests the emitted artifact, so "consumable" is a tested claim, not a hope |
| **Risk API (reference)** ✅ shipped | `workers/risk-api.ts`: the engine as a stateless HTTP service — preflight, signature inspection (EIP-712/7702/5792), post-flight verification via an opaque round-tripped blob (the service stores nothing), and a one-GET delegation check. Deterministic — no AI in the service, ever. Spec: [docs/risk-api.md](risk-api.md) |
| **Two AI key modes** | Bring-your-own-key for local use, or an origin-locked Cloudflare Worker proxy so production users never hold a key |
| **Error boundary** | A render failure shows a calm, non-blaming panel rather than a white screen |

## What PreFlight will never do

- Touch your private keys. It builds unsigned transactions; your wallet signs.
- Auto-sign anything, including from a shared link.
- Send your data anywhere. No analytics, no accounts, no server (the AI proxy is optional and self-hosted).
- Claim certainty. A simulation is a preview of chain state at one moment — which is exactly why post-flight verification and drift detection exist.
