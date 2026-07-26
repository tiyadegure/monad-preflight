# Monad PreFlight — feature reference

Every feature below is implemented, unit-tested, and reachable from the UI.
"Live" means it reads real chain state; nothing here is mocked.

## The core loop

| Feature | What it does |
|---|---|
| **Plain-language intents** | `send 0.5 MON to 0xabc…`, `approve … to spend 100 USDC`, `wrap 1 MON`, `unwrap all my WMON`, `revoke …'s access` — a deterministic rule grammar, no AI required |
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
| **Signature inspector** | EIP-712 typed data (ERC-2612 Permit, Permit2 single and batch) explained before you sign. Signing costs no gas and shows nothing useful in a wallet, which is exactly why drainers prefer it |
| **Observer mode** | Inspect any address read-only, without connecting a wallet — check a friend's wallet for drainer approvals, or audit a contract before you interact |
| **Counterparty reputation** | Judges an address from on-chain evidence only (code size, transaction count, how many distinct owners recently approved it) — no external allowlist that can go stale or be censored |
| **Contract fingerprinting** | Tells a token from an NFT from a proxy from a minimal-clone forwarder, including a warning that a proxy's real code can be swapped by whoever controls it |
| **Simulation drift detection** | Re-simulates just before signing and reports whether the chain moved while you were reading — material change, cosmetic change, or none |
| **Fee intelligence** | Compares this transaction's fee against the last 20 blocks and says, in words, whether now is an expensive moment |

## Product features

| Feature | Detail |
|---|---|
| **Mainnet + testnet** | Chain 143 and 10143, with per-network clients, token registries, explorer links, flight logs, and a "real funds" indicator |
| **RPC failover** | Ordered multi-endpoint client with timeouts, 429/5xx failover, and a sticky healthy endpoint |
| **中文 / English** | Bilingual dictionary (58 keys, both languages, parity-tested) with auto-detection and a switcher. Wired through the header and shell today; the flight-plan and hangar panels are still English-only — finishing that is tracked on the roadmap |
| **Address book** | Save contacts, then say "send 1 MON to alice" — names resolve to addresses before parsing |
| **Flight log** | Every signed transaction with its verification verdict, per network, stored locally |
| **Shareable links** | Copy a link that opens the exact same instruction for someone else (URL fragment — never sent to a server); it pre-fills, it never auto-signs |
| **Markdown reports** | Copy a full flight report for records, support tickets, or team review |
| **Multi-leg plans** *(module built, not yet wired to the UI)* | `src/lib/queue.ts` splits "approve X then send Y" into legs and is fully tested, but no screen uses it yet. Listed here so the code is not mistaken for a shipped feature |
| **Keyboard-first** | `Ctrl/Cmd+K` focus, `Ctrl/Cmd+Enter` prepare, `Ctrl/Cmd+Shift+S` sign, `Esc` discard, `Ctrl/Cmd+→` next tab |
| **Installable (PWA)** | Manifest, theme color, standalone display |
| **Optional AI co-pilot** | Claude parses phrasings the grammar can't and writes a narrative — from verified simulator facts only, clearly labeled, and entirely optional |
| **Two AI key modes** | Bring-your-own-key for local use, or an origin-locked Cloudflare Worker proxy so production users never hold a key |
| **Error boundary** | A render failure shows a calm, non-blaming panel rather than a white screen |

## What PreFlight will never do

- Touch your private keys. It builds unsigned transactions; your wallet signs.
- Auto-sign anything, including from a shared link.
- Send your data anywhere. No analytics, no accounts, no server (the AI proxy is optional and self-hosted).
- Claim certainty. A simulation is a preview of chain state at one moment — which is exactly why post-flight verification and drift detection exist.
