# Contributing to Monad PreFlight

PreFlight is money software: a wrong number or a missed warning can cost someone
real funds. The rules below exist for that reason.

## Non-negotiables

1. **Every user-facing claim must be backed by code.** If the UI says a
   transaction "will succeed", the simulation must actually say so. If we can
   only estimate, the copy says so. Confident wording the code cannot support
   is treated as a bug, not a style issue.
2. **Plain language, always.** Second person, no jargon. Never write
   *allowance*, *calldata*, *wei*, *nonce*, or *EOA* in the UI. Write "how much
   they can spend", "the transaction's instructions", "a personal wallet".
   The audience is someone who bought their first token last week.
3. **Never touch private keys.** PreFlight builds unsigned transactions. The
   wallet signs. Any PR that changes this is rejected on sight.
4. **Deterministic core.** The parser, risk rules, scorer, and explainer must
   be pure functions of their inputs. The AI layer may only *narrate* facts the
   simulator produced — it must never influence what gets signed.
5. **New modules ship with tests.** Unit tests never hit the network; inject
   fakes. Chain-touching modules also get a live test in `test-e2e/`.

## Layout

```
src/lib/        pure-ish modules (the engine). types.ts holds the contracts
                every other module implements against.
src/components/ presentational React; no chain access, no business logic
src/App.tsx     orchestration: the one place that wires engine to UI
test/           unit tests (offline, deterministic) — npm test
test-e2e/       live-chain tests — npm run test:e2e (manual, not in CI)
workers/        the optional AI proxy (deployed separately)
```

Adding a feature usually means: a module in `src/lib/` + its test, a
presentational component, and a wiring change in `App.tsx`. If a change needs
to touch many modules at once, the contract in `types.ts` is probably wrong —
fix that first.

## Before you open a PR

```bash
npm run lint
npm test
npx tsc --noEmit -p tsconfig.app.json
npm run build
```

All four must be clean. Run `npm run test:e2e` too if you touched anything that
talks to the chain (`simulate`, `approvals`, `balances`, `gasoracle`,
`fingerprint`, `networks`, `wallet`).

## Adding a risk rule

Risk rules live in `src/lib/risk.ts`. A new rule needs:

- A stable `id` (kebab-case) that never changes once shipped — the flight log
  and reports reference it.
- A severity you can defend: `danger` means "people lose money this way",
  `caution` means "worth a second look", `info` means "you should know".
- A title of eight words or fewer, and a detail of one to three sentences that
  explains *why it matters*, not what the code checked.
- A unit test proving it fires — and, just as importantly, one proving it does
  **not** fire on a clean transaction. False alarms train people to ignore
  warnings, which is worse than no warning at all.

## Translations

`src/lib/i18n.ts` holds both dictionaries. Every key must exist in both, and the
test suite enforces that. Translate meaning, not words — and be especially
careful with safety warnings: a softened translation of a danger message is a
critical bug. If you are not fluent, say so in the PR and ask for review.

## Commit style

Explain the user-visible effect, not the diff. "Stop showing a fee estimate we
could not verify" beats "fix gasoracle null handling".
