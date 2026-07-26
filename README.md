# ▲ Monad PreFlight

**See it before you sign it.** Say what you want to do in plain language — PreFlight
prepares the transaction, simulates it on Monad testnet, explains exactly what will
happen and what could go wrong — and only then do you decide whether to sign.

Built for the **Monad Playground** track, in the spirit of the **Moss Onchain Agent**
direction: *let the AI prepare the on-chain operation, simulate it thoroughly, and
explain it clearly first — then let the user decide whether to sign.*

---

## Who it helps, and with what problem

Newcomers to Monad (and to web3 generally) sign blind. A wallet popup shows raw hex
calldata, a gas number, and a "Confirm" button. This is exactly how people lose funds:
typo'd addresses, unlimited token approvals granted to drainers, transactions that
were always going to fail but still burn gas.

**The core action:** type an intent (`send 0.5 MON to 0xabc…`) → read the flight plan
(what moves, what it costs, what's risky) → sign in your own wallet → PreFlight
verifies that on-chain reality matched its pre-sign simulation, line by line.

## What's live vs. what's simulated (honesty section)

| Feature | Status |
|---|---|
| Transaction preparation (native transfer, ERC-20 transfer / approve / revoke, raw calldata) | **Live** — built client-side with viem |
| Pre-sign simulation | **Live** — `debug_traceCall` (callTracer + withLog) against the real Monad testnet RPC; call tree, emitted events, revert reasons and gas are decoded from the actual trace |
| Asset-change preview | **Live** — decoded from ERC-20 `Transfer`/`Approval` events and native value flows in the trace |
| Risk engine (14 rules: unlimited approvals, approval-to-wallet drainer pattern, typo'd fresh addresses, reverts, zero address, …) | **Live** — deterministic rules over the simulation + on-chain lookups (code, nonce, balances) |
| Plain-language explanation | **Live** — deterministic composer, no AI required |
| Signing & broadcasting | **Live** — your own wallet (MetaMask) signs; PreFlight never touches keys |
| Post-flight verification (simulation vs. mined receipt) | **Live** — compares predicted vs. actual ERC-20 movements, outcome, and fee from the receipt |
| AI parsing & narrative (Claude) | **Optional, live when enabled** — bring your own Anthropic API key in Settings; without a key the app runs 100% rule-based. AI narratives are grounded only in simulator facts and clearly labeled in the UI |
| Anything mocked | **Nothing.** No mock data anywhere in the core flow |

## How it works

```
 "send 0.5 MON to 0xabc…"
        │
        ▼
 ┌─ parseIntent ──────────┐  rule-based grammar; Claude fallback (optional)
 │  ParsedIntent          │
 ▼                        │
 buildTx (viem) ──────────┤  unsigned tx: to / data / value + human summary
 ▼                        │
 simulateTx ──────────────┤  debug_traceCall → call tree, events, revert
 │                        │  reason, gas; ERC-20 metadata fetched on-chain
 ▼                        │
 assessRisks ─────────────┤  14 deterministic rules → severity-ranked findings
 ▼                        │
 composeExplanation ──────┤  plain language, second person, zero jargon
 ▼                        │
 FLIGHT PLAN UI ──────────┤  you read, you decide, your wallet signs
 ▼                        │
 comparePostFlight ───────┘  mined receipt vs. simulation, line by line
```

Every module is small, dependency-light, unit-tested, and written to be explained
line-by-line (that's a hackathon rule — and we can).

## Run it

```bash
npm install
npm run dev          # → http://localhost:5173
```

Requirements: a browser wallet (MetaMask). PreFlight adds/switches to Monad Testnet
(chain 10143) for you. Get gas at the [faucet](https://faucet.monad.xyz).

```bash
npm test             # unit tests (offline, deterministic)
npm run test:e2e     # LIVE tests against the real Monad testnet RPC —
                     # discovers a real token from recent blocks and verifies
                     # the whole simulation pipeline against it
npm run build        # type-check + production build
```

### Demo token (optional)

To demo ERC-20 flows with a clean token:

```powershell
$env:PRIVATE_KEY = "0x<funded testnet key>"
npm run deploy:token
```

Deploys `contracts/DemoToken.sol` — **tUSD**, 6 decimals (on purpose: it proves the
decimal math), with a public `faucet()` anyone can call for 100 tUSD. Paste the
deployed address into *Settings → Teach PreFlight a token*.

### AI co-pilot (optional)

Settings → paste an Anthropic API key (stored only in your browser's localStorage,
sent only to Anthropic). This enables:
- Claude parsing for phrasings the rule grammar can't catch (labeled `parsed by Claude`)
- a short narrative written from — and only from — the simulator's verified facts

## Demo walkthrough (3 minutes)

1. **Connect** — wallet auto-switches to Monad Testnet.
2. `send 0.1 MON to <your second address>` → flight plan shows both balance changes
   and the fee → sign → **post-flight: every line matches ✓**, explorer link.
3. `approve 0x<any EOA> to spend unlimited tUSD` → **red annunciators**: unlimited
   approval + "you are approving a personal wallet, not an app — the classic
   drainer pattern". This is the save-a-newcomer moment.
4. Paste a raw transaction JSON copied from any dapp's wallet popup
   (`{"to":"0x…","data":"0x…"}`) → PreFlight decodes and simulates what that popup
   was actually about to do.
5. `revoke 0x<that EOA>'s access to my tUSD` → sign → clean post-flight.

## Stack

Vite · React 19 · TypeScript (strict) · viem · vitest · `@anthropic-ai/sdk`
(optional AI) · plain CSS (design system in [DESIGN.md](DESIGN.md), typeface: B612 —
the font Airbus commissioned for cockpit displays; this is a pre-flight instrument
panel, so it's set in the cockpit font).

## AI usage disclosure

This project was built with AI-assisted coding (Claude Code). Every module was
specified by hand first (see `src/lib/types.ts` — the contracts), each is
unit-tested, and the team can explain every line. Runtime AI (Claude) is optional,
clearly labeled, and constrained to verified simulator facts.
