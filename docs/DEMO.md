# Demo script

A five-minute walkthrough that shows every load-bearing feature. Testnet only —
no real funds needed.

## Setup (once)

1. `npm install && npm run dev`
2. Open the app, click **Connect wallet**. PreFlight adds/switches Monad Testnet
   (chain 10143) for you.
3. Get gas: [faucet.monad.xyz](https://faucet.monad.xyz).
4. *(Optional, for the ERC-20 legs)* deploy the demo token:
   ```powershell
   $env:PRIVATE_KEY = "0x<your funded testnet key>"
   npm run deploy:token
   ```
   Paste the printed address into **Settings → Teach PreFlight a token**, then
   call `faucet()` on it once to give yourself 100 tUSD.

## The walkthrough

### 1. The core promise (60s)

Type: `send 0.1 MON to <your second address>`

Point at the **readiness gauge** — one number, one verdict, one sentence. Then
the plain-language bullets: what leaves your wallet, what arrives, what the fee
is. Expand **Instrument deep-dive** to show this is a real trace, not a guess.

Sign it. When it lands, the **post-flight** table compares the simulation
against the mined receipt, line by line. Every row ✓.

> *This is the whole product in one transaction: it told you what would happen,
> then proved it was right.*

### 2. The moment that saves someone (60s)

Type: `approve <any personal wallet address> to spend unlimited tUSD`

Two red annunciators fire:
- **Unlimited approval** — that address can drain that token, forever, until revoked.
- **Approving a personal wallet, not an app** — real apps ask you to approve a
  program. This is the exact shape of a drainer.

The gauge reads **Grounded**. Nothing has been signed — the user still decides,
but now they decide knowing.

### 3. The invisible attack (45s)

Go to the **Signatures** tab. Paste an ERC-2612 permit request (any dapp's
signature popup JSON). PreFlight explains what signing would authorize.

> *A signature costs no gas and shows almost nothing in a wallet. That is
> precisely why it is the drainer's favourite tool. This is the only place most
> users will ever see one explained.*

### 4. Cleaning up (45s)

Go to the **Hangar** tab → **Scan my approvals**. PreFlight reads Approval
events off-chain-history and live-verifies each allowance, so the list is what
is *actually* open right now, not what was ever granted.

Click **Revoke** on the unlimited one. It flows straight back into the normal
simulate → explain → sign path. Nothing is special-cased.

### 5. A journey, not a transaction (45s)

Type: `wrap 1 MON then send 0.5 WMON to <your second address>`

The **journey strip** appears: two steps, each with its own simulation, its own
explanation, and its own wallet signature. Sign step 1; when it lands, the strip
offers **Continue — prepare step 2**. Skip a step or abandon the rest at any
time.

> *Batching UIs hide the second signature behind the first. PreFlight refuses
> to: you see and sign every step, and a step whose outcome is unknown is shown
> as exactly that — never as succeeded.*

### 6. Depth to close on (60s)

Pick whichever lands best for the audience:

- **Observer tab** — paste any address, no wallet needed. Holdings, history, and
  who can spend its tokens. Good for "check your friend's wallet".
- **中文 toggle** — every panel's chrome switches, and the console understands Chinese commands (`发送 0.1 MON 到 0x…`). Not machine-translated. (Text generated from chain data — risk findings, explanations — stays English for now.)
- **Share** — copies a link that opens the exact same instruction for someone
  else. It pre-fills; it never auto-signs.
- **Copy report** — a full markdown flight report for records or a support ticket.
- **Mainnet toggle** — the amber *real funds* chip appears. Same pipeline, real
  money, and `debug_traceCall` verified working on the mainnet endpoint.

## If asked "what's actually running?"

```bash
npm test          # 685 unit tests, offline and deterministic
npm run test:e2e  # 13 live tests against real testnet AND mainnet RPCs
```

The live suite discovers a real token from recent blocks and verifies the whole
simulation pipeline against it — plus RPC failover, fee reading, contract
fingerprinting, Multicall3 balance batching, and approval scanning.

## The one-sentence pitch

> Wallets show you what you are being asked to sign. PreFlight shows you what
> will actually happen — and then proves it was right.
