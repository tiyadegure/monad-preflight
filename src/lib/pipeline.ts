/**
 * The assessment pipeline: everything PreFlight derives about a prepared
 * transaction — simulation, on-chain facts, risk findings, counterparty
 * reputation, EIP-7702 delegation checks, the readiness score, and the
 * plain-language explanation — composed in one call.
 *
 * This is the engine's front door. The web app is one caller; a wallet
 * popup, a server, or the reference Risk API worker can be another. The
 * app adds only UI concerns on top (AI narrative, address-book notes,
 * staleness guards); nothing risk-relevant lives outside this module.
 *
 * Degradation contract: the sender's balance is REQUIRED (several rules
 * are meaningless without it — a failure here rejects). Every other fact
 * degrades to "unknown", and unknown is a first-class state the rules and
 * the score treat as "could not check", never as "fine".
 */

import type {
  Address,
  Explanation,
  Hex,
  PreparedTx,
  RiskContext,
  RiskFinding,
  SimulationResult,
} from './types';
import type { RpcCallFn } from './simulate';
import { simulateTx } from './simulate';
import { assessRisks } from './risk';
import { assessCounterparty } from './reputation';
import { assessDelegationRisks, detectDelegation } from './delegation';
import { scorePlan } from './score';
import type { Readiness } from './score';
import { composeExplanation } from './explain';
import { readFees } from './gasoracle';
import type { FeeReading } from './gasoracle';
import { fingerprintAddress } from './fingerprint';
import type { Fingerprint } from './fingerprint';

/* ------------------------------------------------------------------ */
/* Chain access                                                        */
/* ------------------------------------------------------------------ */

/**
 * The on-chain reads the pipeline needs. Adapters below cover viem and
 * raw JSON-RPC; anything that can answer these five questions works.
 *
 * getCode may resolve to '0x' or undefined (no code) — the pipeline
 * itself converts read FAILURES to "unknown", so implementations should
 * simply throw on failure rather than swallowing errors.
 */
export interface FactReader {
  getBalance(address: Address): Promise<bigint>;
  getCode(address: Address): Promise<Hex | null | undefined>;
  getTransactionCount(address: Address): Promise<number>;
  getStorageAt(address: Address, slot: Hex): Promise<Hex>;
  call(to: Address, data: Hex): Promise<Hex>;
}

/** Minimal structural view of a viem PublicClient — enough for facts. */
interface ViemLikeClient {
  getBalance(args: { address: Address }): Promise<bigint>;
  getCode(args: { address: Address }): Promise<Hex | undefined>;
  getTransactionCount(args: { address: Address }): Promise<number>;
  getStorageAt(args: { address: Address; slot: Hex }): Promise<Hex | undefined>;
  call(args: { to: Address; data: Hex }): Promise<{ data?: Hex }>;
}

/** FactReader over a viem PublicClient (what the web app uses). */
export function viemFactReader(client: ViemLikeClient): FactReader {
  return {
    getBalance: (address) => client.getBalance({ address }),
    getCode: (address) => client.getCode({ address }),
    getTransactionCount: (address) => client.getTransactionCount({ address }),
    getStorageAt: (address, slot) =>
      client.getStorageAt({ address, slot }).then((v) => v ?? '0x'),
    call: (to, data) => client.call({ to, data }).then((r) => r.data ?? '0x'),
  };
}

/**
 * FactReader over a plain JSON-RPC call function (what the Risk API
 * worker uses — it reuses the same failover transport as the simulator).
 */
export function rpcFactReader(rpc: RpcCallFn): FactReader {
  const hex = (v: unknown): Hex =>
    typeof v === 'string' && v.startsWith('0x') ? (v as Hex) : '0x';
  return {
    getBalance: async (address) =>
      BigInt(hex(await rpc('eth_getBalance', [address, 'latest'])) || '0x0'),
    getCode: async (address) => hex(await rpc('eth_getCode', [address, 'latest'])),
    getTransactionCount: async (address) =>
      Number(BigInt(hex(await rpc('eth_getTransactionCount', [address, 'latest'])) || '0x0')),
    getStorageAt: async (address, slot) =>
      hex(await rpc('eth_getStorageAt', [address, slot, 'latest'])),
    call: async (to, data) => hex(await rpc('eth_call', [{ to, data }, 'latest'])),
  };
}

/* ------------------------------------------------------------------ */
/* The pipeline                                                        */
/* ------------------------------------------------------------------ */

export interface AssessOptions {
  /** Compare this transaction's fee against recent blocks (default true). */
  includeFees?: boolean;
  /** Identify what kind of contract the counterparty is (default true). */
  includeFingerprint?: boolean;
}

/** Everything the pipeline concluded, in one bundle. */
export interface FlightAssessment {
  sim: SimulationResult;
  /** All findings, ordered: rule engine, then reputation, then delegation. */
  risks: RiskFinding[];
  /** The facts the rules ran against — keep it to re-run the SAME rules later. */
  riskContext: RiskContext;
  /** The reputation findings alone, for honest re-checks (see drift flow). */
  reputationFindings: RiskFinding[];
  readiness: Readiness;
  explanation: Explanation;
  /** null when unavailable — never blocks the assessment. */
  fees: FeeReading | null;
  /** null when unavailable or there is no counterparty. */
  counterparty: Fingerprint | null;
}

export async function assessTransaction(
  tx: PreparedTx,
  deps: { rpc: RpcCallFn; reader: FactReader },
  opts: AssessOptions = {},
): Promise<FlightAssessment> {
  const { rpc, reader } = deps;
  const includeFees = opts.includeFees !== false;
  const includeFingerprint = opts.includeFingerprint !== false;

  // 1. Simulate against live chain state.
  const sim = await simulateTx(tx, rpc);

  // 2. Gather on-chain facts. Sender balance is required; the rest turn
  //    into "unknown" on failure, which the rules treat as un-checkable —
  //    never as clean.
  const probe = tx.counterparty ?? tx.to;
  const [senderBalanceWei, cpCode, cpTxCount, cpBalance, tokenCode, selfCode] =
    await Promise.all([
      reader.getBalance(tx.from),
      reader.getCode(probe).catch(() => null),
      reader.getTransactionCount(probe).catch(() => null),
      reader.getBalance(probe).catch(() => null),
      tx.token?.address
        ? reader.getCode(tx.token.address).catch(() => null)
        : Promise.resolve(null),
      // The user's own account code: a non-empty result on a wallet means
      // it has been delegated (EIP-7702) and is running someone else's
      // code. That is the loudest thing we can tell them.
      reader.getCode(tx.from).catch(() => null),
    ]);

  const ctx: RiskContext = {
    senderBalanceWei,
    counterpartyIsContract:
      cpCode === null ? undefined : Boolean(cpCode && cpCode !== '0x'),
    counterpartyTxCount: cpTxCount ?? undefined,
    counterpartyBalanceWei: cpBalance ?? undefined,
    tokenIsContract: !tx.token?.address
      ? undefined
      : tokenCode === null
        ? undefined
        : Boolean(tokenCode && tokenCode !== '0x'),
  };

  // 3. Risk rules, then on-chain counterparty reputation.
  const risks = assessRisks(tx, sim, ctx);
  const reputationFindings: RiskFinding[] = [];
  if (ctx.counterpartyIsContract !== undefined) {
    const rep = assessCounterparty(
      {
        isContract: ctx.counterpartyIsContract,
        txCount: ctx.counterpartyTxCount ?? 0,
        balanceWei: ctx.counterpartyBalanceWei ?? 0n,
        codeSize: cpCode && cpCode !== '0x' ? (cpCode.length - 2) / 2 : 0,
      },
      { isApprovalTarget: tx.kind === 'erc20-approve' },
    );
    // Only add findings the rule engine did not already raise.
    for (const f of rep.findings) {
      if (!risks.some((r) => r.title === f.title)) reputationFindings.push(f);
    }
    risks.push(...reputationFindings);
  }

  // 4. EIP-7702: is the user's own wallet delegated, or the recipient?
  const delegationFindings = assessDelegationRisks({
    self: detectDelegation(selfCode),
    counterparty: detectDelegation(cpCode),
    counterpartyIsRecipient:
      tx.kind === 'native-transfer' || tx.kind === 'erc20-transfer',
  });
  for (const f of delegationFindings) {
    if (!risks.some((r) => r.id === f.id)) risks.push(f);
  }

  // 5. Score and explanation.
  const readiness = scorePlan(sim, risks);
  const explanation = composeExplanation(tx, sim, risks, tx.from);

  // 6. Optional extras — a failure here must never block the assessment.
  const [fees, counterparty] = await Promise.all([
    includeFees ? readFees(rpc, sim.gasUsed).catch(() => null) : Promise.resolve(null),
    includeFingerprint && tx.counterparty
      ? fingerprintAddress(
          {
            getCode: (a) => reader.getCode(a).then((c) => c ?? '0x'),
            getStorageAt: (a, slot) => reader.getStorageAt(a, slot),
            call: (a, data) => reader.call(a, data).catch(() => '0x' as Hex),
          },
          tx.counterparty,
        ).catch(() => null)
      : Promise.resolve(null),
  ]);
  if (counterparty && counterparty.kind !== 'eoa') {
    explanation.bullets.push(`${counterparty.label}: ${counterparty.detail}`);
  }

  return {
    sim,
    risks,
    riskContext: ctx,
    reputationFindings,
    readiness,
    explanation,
    fees,
    counterparty,
  };
}
