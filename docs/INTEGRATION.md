# Integrating the PreFlight engine

This document is for wallet and dapp teams evaluating PreFlight's engine —
the simulation + risk + explanation pipeline behind the app. The app itself
(`src/App.tsx`) is the reference integration: everything it shows comes
through the same public surface described here.

## What you get

One call turns an unsigned transaction into an assessment:

```ts
import {
  NETWORKS, makeNetworkRpc, rpcFactReader, assessTransaction,
} from 'monad-preflight/sdk'; // packaging note below

const net = NETWORKS.testnet;               // or NETWORKS.mainnet
const rpc = makeNetworkRpc(net);            // multi-endpoint failover transport

const assessment = await assessTransaction(tx, {
  rpc,
  reader: rpcFactReader(rpc),               // or viemFactReader(yourPublicClient)
});

assessment.sim          // debug_traceCall simulation: asset deltas, events, revert reason
assessment.risks        // deterministic findings: rules + reputation + EIP-7702 checks
assessment.readiness    // one score (0–100), one verdict, one sentence of advice
assessment.explanation  // second-person, zero-jargon description of what will happen
```

Around it, the same surface exposes each stage separately (`simulateTx`,
`assessRisks`, `scorePlan`, `composeExplanation`, `comparePostFlight`,
`compareSimulations`), the signature-request triage
(`inspectSignaturePayload` for EIP-712 / EIP-7702 / EIP-5792 payloads),
wallet-state analysis (`detectDelegation`, `assessWalletHealth`,
`scanApprovals`, `computeExposure`), and the multi-leg journey model.
`src/lib/sdk.ts` is the complete, curated list.

## Three ways to integrate

1. **Embed the library.** The engine is plain TypeScript over `viem` with
   no UI, no storage, and no AI dependency — it runs in browsers, Node,
   and edge workers. `npm run build:sdk` emits ESM + type declarations to
   `dist-sdk/`, and `npm run verify:sdk` proves the emitted artifact works
   by running a smoke suite against it. Packaging note: today this repo
   ships app and engine together; splitting `src/lib` into a published
   npm package is a mechanical step we would do together with a first
   integration partner rather than guess at alone.

2. **Call the Risk API.** `workers/risk-api.ts` is a stateless Cloudflare
   Worker exposing the pipeline over HTTP — see
   [docs/risk-api.md](risk-api.md). Deploy it yourself with `wrangler
   deploy`; there is deliberately no hosted instance holding your users'
   transaction data.

3. **Take the engine wholesale.** MIT-licensed, 670+ offline deterministic
   unit tests plus a live suite against both Monad networks, and every
   module is written to be read. If your team wants to absorb rather than
   depend, the code is organized for that.

## The honesty contract

The engine's differentiating behavior is that it refuses to overstate.
If you build on it, these semantics are the product — please keep them
user-visible:

- **Unknown is not safe.** A fact that could not be read (code, nonce,
  balance) is reported as unknown, and the wallet-health checker ranks
  "could not check" *worse* than a known warning.
- **Degraded simulation caps confidence.** When deep tracing is
  unavailable and only basic checks ran, the simulation says so and the
  readiness score is capped.
- **Post-flight lines are three-valued.** matched / mismatched /
  unverified. A receipt cannot prove internal native transfers or
  allowance state; the engine never prints a checkmark for something it
  did not verify.
- **The AI layer is optional and subordinate.** Narratives are generated
  from verified simulator facts, clearly labeled, and nothing the AI says
  changes a finding or a score. The Risk API contains no AI at all.

## What is deliberately NOT included

- **No threat-intel feeds or address blocklists.** Counterparty judgment
  is derived from on-chain evidence only (code size, history, approval
  patterns). This composes cleanly WITH a blocklist provider — it does not
  replace one.
- **No key handling, no signing, no transaction submission.** The engine
  prepares and assesses; your wallet signs.
- **No DEX/NFT/bridge semantics yet** — see the roadmap in the README.
- **No hosted service.** Both the AI proxy and the Risk API are
  self-deployed. Nothing about your users transits infrastructure we run.

## Monad-specific facts baked in

Verified live against both networks and encoded in the engine:
`debug_traceCall` (callTracer + `withLog`) support with per-endpoint
quirks; `eth_simulateV1` absence; the 100-block `eth_getLogs` cap and the
chunked scanner built for it; Prague-fork activation (EIP-7702 delegations
are live — the engine reads delegation designators from account code);
Multicall3 and canonical WMON addresses per network.

## Verifying our claims

```bash
npm ci
npm test           # 670+ unit tests, offline and deterministic
npm run test:e2e   # 13 live tests against real Monad testnet AND mainnet
npm run verify:sdk # build the SDK artifact and smoke-test the build output
npx tsc -p tsconfig.worker.json  # typecheck the Risk API worker
```

License: MIT. Security posture: [SECURITY.md](../SECURITY.md). Design
rationale: [DESIGN.md](../DESIGN.md).
