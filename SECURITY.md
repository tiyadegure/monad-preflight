# Security

## Reporting a vulnerability

If you find a security issue, please report it privately rather than opening a
public issue. Include a concrete reproduction path — the input, the state, and
what a user would lose.

We care most about anything in these classes:

- A user could sign something different from what PreFlight showed them.
- A safety warning fails to fire when it should (a missed unlimited approval, a
  missed drainer pattern, a missed revert).
- A number shown to the user is wrong in a way that changes their decision.
- Anything that could exfiltrate a key, an API key, or a user's browsing data.

## Threat model

**What PreFlight protects against.** Signing blind: unlimited approvals granted
to a drainer, funds sent to a typo'd or never-used address, transactions that
were always going to revert, permit signatures that authorize a token sweep
with no gas and no transaction, wallet-takeover delegations (EIP-7702), batches
that hide several actions behind one confirmation, and chain state moving
between the moment you read a plan and the moment you sign it.

### Wallet takeover (EIP-7702) — the current top threat

Since the Pectra fork, one signature can install code into an ordinary wallet so
that a program acts as you from then on. It is not a transfer and not an
approval, so the fields a wallet displays reveal almost nothing; security
reporting through 2026 put the overwhelming majority of these delegations at
malicious contracts, with single incidents in the millions.

**This is live on Monad.** Both mainnet and testnet block headers carry
`requestsHash`, confirming the Prague fork is active, so delegated wallets are
possible on both networks today. PreFlight therefore treats delegation as a
first-class risk: it reads the delegation designator (`0xef0100 || address`)
directly from account code, warns when *your own* wallet is delegated, warns
when you are sending funds to a delegated wallet (arriving funds can be swept in
the same block), and explains a delegation request in plain language before you
sign it — including the case where `chainId` is 0, which applies the delegation
to every network at once.

**What PreFlight cannot protect against.** A compromised wallet or browser
extension; a malicious RPC endpoint that lies about chain state (the simulation
is only as honest as the node answering it); a contract whose behavior depends
on state that changes after simulation (drift detection narrows this window but
cannot close it); social engineering that convinces a user to override a
warning; and anything after the wallet takes over — PreFlight's job ends at the
signature prompt.

## Design decisions that follow from this

- **No private key ever enters PreFlight.** It builds unsigned transactions;
  the wallet signs. There is no code path that could exfiltrate a key because
  there is no code path that receives one.
- **The AI can only narrate, never decide.** The optional Claude layer receives
  facts the simulator already produced and returns prose. It cannot alter a
  transaction's destination, amount, or calldata. Its output is labeled in the
  UI so it is never mistaken for a verified fact.
- **Shared links pre-fill, never execute.** A link opens the console with text
  in it. It cannot prepare, sign, or send anything.
- **No server, no accounts, no analytics.** Settings, tokens, contacts, and the
  flight log live in your browser's localStorage. The only outbound requests
  are to the RPC you selected, and to Anthropic if you enabled the AI.
- **API keys.** Local mode stores your own Anthropic key in localStorage and
  sends it only to Anthropic. Production deployments should use the bundled
  proxy (`workers/ai-proxy.ts`), which keeps the key server-side, locks it to
  one origin, rate-limits per IP, and never forwards a client-supplied key.
- **Degraded simulation is labeled, not hidden.** When an RPC cannot provide a
  deep trace, PreFlight runs a basic check, says so in plain language, and
  raises a caution finding — rather than presenting a partial preview as
  complete.

## Honest limitations

- Approval scanning covers a recent-block window, not all history. The UI
  states the window; older approvals will not appear until we add indexer
  support.
- A simulation reflects chain state at one block. Post-flight verification and
  drift detection exist precisely because that guarantee is not absolute.
- The counterparty reputation signals are heuristics over on-chain evidence.
  They are deliberately explainable and deliberately conservative, but "looks
  ordinary" is not a safety certification.
