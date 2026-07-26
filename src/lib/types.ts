/**
 * Shared types for Monad PreFlight.
 *
 * The pipeline is:  text ──parse──▶ ParsedIntent ──build──▶ PreparedTx
 *                   ──simulate──▶ SimulationResult ──assess──▶ RiskFinding[]
 *                   ──compose──▶ Explanation ──(user signs)──▶ receipt ──▶ post-flight check
 *
 * Every module implements against these types and nothing else.
 */

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

/* ------------------------------------------------------------------ */
/* Tokens                                                              */
/* ------------------------------------------------------------------ */

export interface TokenInfo {
  /** null = native MON */
  address: Address | null;
  symbol: string;
  decimals: number;
  name?: string;
}

export const NATIVE_MON: TokenInfo = {
  address: null,
  symbol: 'MON',
  decimals: 18,
  name: 'Monad',
};

/* ------------------------------------------------------------------ */
/* Intent — output of the parser. Pure text analysis, no chain access. */
/* ------------------------------------------------------------------ */

export type IntentAction = 'send' | 'approve' | 'revoke' | 'wrap' | 'unwrap' | 'raw';

export interface ParsedAmount {
  /** Decimal string exactly as the user wrote it, e.g. "0.5" */
  value?: string;
  /** User asked for an unlimited / infinite approval */
  unlimited?: boolean;
  /** User asked to send their entire balance ("all", "everything") */
  all?: boolean;
}

export interface ParsedIntent {
  action: IntentAction;
  /** Token symbol or 0x-address as written; undefined = native MON */
  token?: string;
  amount?: ParsedAmount;
  /** Recipient for `send`; spender for `approve` / `revoke` */
  counterparty?: string;
  /** Raw tx fields for the "explain this transaction" flow */
  raw?: { to: string; data?: string; value?: string };
  /** Plain-language notes about anything ambiguous the parser noticed */
  notes: string[];
}

export interface ParseSuccess {
  ok: true;
  intent: ParsedIntent;
}

export interface ParseFailure {
  ok: false;
  /** Plain-language, actionable reason */
  reason: string;
  /** Example phrasings the user can try instead */
  suggestions: string[];
}

export type ParseResult = ParseSuccess | ParseFailure;

/* ------------------------------------------------------------------ */
/* Prepared (unsigned) transaction                                     */
/* ------------------------------------------------------------------ */

export type PreparedTxKind =
  | 'native-transfer'
  | 'erc20-transfer'
  | 'erc20-approve'
  | 'erc20-revoke'
  | 'wrap'
  | 'unwrap'
  | 'raw';

export interface PreparedTx {
  from: Address;
  to: Address;
  data: Hex;
  /** Native value in wei */
  value: bigint;
  kind: PreparedTxKind;
  /** Deterministic one-line label, e.g. "Send 0.5 MON to 0x1234…abcd" */
  summary: string;
  /** Token involved, if any */
  token?: TokenInfo;
  /** Raw token units (or wei) involved, if any */
  amountRaw?: bigint;
  /** Recipient or spender, if any */
  counterparty?: Address;
}

/* ------------------------------------------------------------------ */
/* Simulation                                                          */
/* ------------------------------------------------------------------ */

export interface CallFrameSummary {
  depth: number;
  /** CALL, STATICCALL, DELEGATECALL, CREATE, ... */
  type: string;
  from: Address;
  to?: Address;
  valueWei: bigint;
  gasUsed: bigint;
  /** VM-level error, e.g. "execution reverted" */
  error?: string;
  /** Decoded revert reason when available */
  revertReason?: string;
}

export interface DecodedEvent {
  /** Emitting contract */
  address: Address;
  name: 'Transfer' | 'Approval' | 'Deposit' | 'Withdrawal' | 'unknown';
  /** Stringified args keyed by parameter name (from, to, value, ...) */
  args?: Record<string, string>;
  raw: { topics: Hex[]; data: Hex };
}

export interface AssetChange {
  party: Address;
  token: TokenInfo;
  /** positive = party receives, negative = party pays (raw units) */
  deltaRaw: bigint;
}

export interface ApprovalChange {
  owner: Address;
  spender: Address;
  token: TokenInfo;
  amountRaw: bigint;
  unlimited: boolean;
}

export interface SimulationResult {
  /** True when the simulated call did not revert */
  ok: boolean;
  /** Decoded, plain language where possible */
  revertReason?: string;
  gasUsed: bigint;
  /** Estimated total fee in wei for display */
  gasCostWei: bigint;
  assetChanges: AssetChange[];
  approvalChanges: ApprovalChange[];
  events: DecodedEvent[];
  frames: CallFrameSummary[];
  /** Simulator caveats, e.g. "trace unavailable — fell back to eth_call" */
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* Risk                                                                */
/* ------------------------------------------------------------------ */

export type RiskSeverity = 'info' | 'caution' | 'danger';

export interface RiskFinding {
  /** Stable rule id, e.g. "unlimited-approval" */
  id: string;
  severity: RiskSeverity;
  /** Short title, ≤ 8 words */
  title: string;
  /** 1–3 sentences, plain language, no jargon */
  detail: string;
}

/** On-chain facts the risk rules need; gathered once by the app shell. */
export interface RiskContext {
  senderBalanceWei: bigint;
  counterpartyIsContract?: boolean;
  /** Transaction count (nonce) — 0 suggests a fresh, never-used address */
  counterpartyTxCount?: number;
  counterpartyBalanceWei?: bigint;
  /** Whether `token` in the tx actually has contract code */
  tokenIsContract?: boolean;
}

/* ------------------------------------------------------------------ */
/* Explanation                                                         */
/* ------------------------------------------------------------------ */

export interface Explanation {
  /** "You are about to send 0.5 MON" */
  headline: string;
  /** What the simulation says will happen, one short paragraph */
  outcome: string;
  /** Asset deltas, approvals, gas — in plain words */
  bullets: string[];
  /** Optional AI-written narrative (clearly labeled in the UI) */
  aiNarrative?: string;
}

/* ------------------------------------------------------------------ */
/* Post-flight (after the tx lands)                                    */
/* ------------------------------------------------------------------ */

/**
 * A single post-flight comparison line.
 *
 * `status` is deliberately three-valued. A receipt cannot prove everything
 * — internal native transfers and allowance state are not in the log set —
 * and claiming a ✓ for something we did not actually check would be the
 * one lie this product must never tell.
 */
export type PostFlightLineStatus = 'matched' | 'mismatched' | 'unverified';

export interface PostFlightLine {
  label: string;
  simulated: string;
  actual: string;
  status: PostFlightLineStatus;
  /** Why we could not check, shown when status is 'unverified'. */
  note?: string;
}

export interface PostFlightCheck {
  /** True only when nothing we could check disagreed with the simulation. */
  matched: boolean;
  /** True when at least one line could not be verified from the receipt. */
  hasUnverified: boolean;
  lines: PostFlightLine[];
}
