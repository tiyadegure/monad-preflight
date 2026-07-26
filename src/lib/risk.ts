/**
 * Rule-based risk engine for Monad PreFlight.
 *
 * Every rule is a deterministic check against the prepared transaction,
 * the simulation result, and a handful of on-chain facts (RiskContext).
 * No network access, no randomness — the same inputs always produce the
 * same findings, so every finding can be explained line by line.
 */

import type {
  PreparedTx,
  RiskContext,
  RiskFinding,
  RiskSeverity,
  SimulationResult,
} from './types';
import { UNLIMITED_THRESHOLD, isSameAddress } from './format';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** Substring of the simulator note emitted when only eth_call-style checks ran. */
const DEGRADED_NOTE_MARKER = 'basic check';

function isTransferKind(tx: PreparedTx): boolean {
  return tx.kind === 'native-transfer' || tx.kind === 'erc20-transfer';
}

export function assessRisks(
  tx: PreparedTx,
  sim: SimulationResult,
  ctx: RiskContext,
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const add = (id: string, severity: RiskSeverity, title: string, detail: string) =>
    findings.push({ id, severity, title, detail });

  /* ---------------- danger ---------------- */

  if (!sim.ok) {
    const reason = sim.revertReason
      ? ` The network gave this reason: "${sim.revertReason}".`
      : '';
    add(
      'simulation-reverted',
      'danger',
      'This transaction would fail',
      `Our test run shows the network would reject this transaction.${reason}` +
        ' No funds would move, but you could still lose the gas fee paid to attempt it.',
    );
  }

  if (tx.value + sim.gasCostWei > ctx.senderBalanceWei) {
    add(
      'insufficient-balance',
      'danger',
      'Not enough MON in your wallet',
      'The amount you are sending plus the network fee adds up to more MON than you have.' +
        ' The transaction cannot go through as it is.',
    );
  }

  const unlimitedViaSim = sim.approvalChanges.some((c) => c.unlimited);
  const unlimitedViaAmount =
    tx.kind === 'erc20-approve' &&
    tx.amountRaw !== undefined &&
    tx.amountRaw >= UNLIMITED_THRESHOLD;
  if (unlimitedViaSim || unlimitedViaAmount) {
    add(
      'unlimited-approval',
      'danger',
      'Gives unlimited access to your tokens',
      'This lets the spender move ALL of that token out of your wallet, at any time,' +
        ' until you cancel (revoke) the permission. Only grant this to apps you fully trust.',
    );
  }

  if (tx.kind === 'erc20-approve' && ctx.counterpartyIsContract === false) {
    add(
      'approval-to-eoa',
      'danger',
      'Approving a personal wallet, not an app',
      'You are giving token access to a personal wallet, not an app.' +
        ' This is the classic pattern of wallet-drainer scams — real apps ask you to approve a program, not a person.',
    );
  }

  if (tx.kind.startsWith('erc20') && ctx.tokenIsContract === false) {
    add(
      'token-not-contract',
      'danger',
      'Token address is not a real token',
      'The address used as the token has no program behind it, so it cannot be a working token.' +
        ' This transaction will not do what you expect — double-check the token address.',
    );
  }

  if (isSameAddress(tx.counterparty, ZERO_ADDRESS)) {
    add(
      'zero-address',
      'danger',
      'Destination is the zero address',
      'The other side of this transaction is the all-zeros address (0x000…000).' +
        ' Funds sent there are destroyed forever — nobody can ever get them back.',
    );
  }

  /* ---------------- caution ---------------- */

  if (isTransferKind(tx) && ctx.counterpartyIsContract === true) {
    add(
      'send-to-contract',
      'caution',
      'The recipient is a program',
      'The address you are sending to is a program, not a person.' +
        ' Make sure it is meant to receive funds directly, or they could get stuck.',
    );
  }

  if (
    isTransferKind(tx) &&
    ctx.counterpartyTxCount === 0 &&
    (ctx.counterpartyBalanceWei ?? 0n) === 0n
  ) {
    add(
      'fresh-recipient',
      'caution',
      'Recipient address has never been used',
      'This address has no history and holds nothing — it may be brand new, or it may be a typo.' +
        ' Double-check every character, because transactions cannot be undone.',
    );
  }

  if (
    tx.kind === 'native-transfer' &&
    ctx.senderBalanceWei > 0n &&
    tx.value * 100n >= ctx.senderBalanceWei * 95n
  ) {
    add(
      'sending-entire-balance',
      'caution',
      'Sending almost everything in your wallet',
      'This sends 95% or more of the MON you have.' +
        ' You may not keep enough to pay fees on your next transactions.',
    );
  }

  const hasUnknownEvent = sim.events.some((e) => e.name === 'unknown');
  const silentRawCall = tx.data.length > 2 && sim.assetChanges.length === 0 && sim.ok;
  if (tx.kind === 'raw' && (hasUnknownEvent || silentRawCall)) {
    add(
      'unknown-effects',
      'caution',
      'We cannot fully read this transaction',
      'The simulation could not fully read what this transaction does.' +
        ' Only continue if you already trust whoever gave it to you.',
    );
  }

  if (sim.notes.some((n) => n.toLowerCase().includes(DEGRADED_NOTE_MARKER))) {
    add(
      'simulation-degraded',
      'caution',
      'Only a basic check was possible',
      'We could not run a full test of this transaction, so this preview may miss details.' +
        ' Treat it as a rough guide, not a guarantee.',
    );
  }

  /* ---------------- info ---------------- */

  if (isSameAddress(tx.counterparty, tx.from)) {
    add(
      'self-transfer',
      'info',
      'The other address is your own',
      'The other side of this transaction is your own wallet.' +
        ' That is usually harmless, but you still pay a network fee — double-check it is what you meant.',
    );
  }

  if (isTransferKind(tx) && tx.amountRaw === 0n) {
    add(
      'zero-amount',
      'info',
      'This transaction moves nothing',
      'The amount is zero, so no tokens will actually move.' +
        ' You would still pay the network fee.',
    );
  }

  if (sim.gasUsed > 1_000_000n) {
    add(
      'large-gas',
      'info',
      'Uses an unusually large amount of gas',
      'This is an unusually complex transaction for this kind of action.' +
        ' Complex transactions cost more in fees and are harder to predict.',
    );
  }

  // Rules above are declared danger-first, then caution, then info,
  // so `findings` is already ordered by severity band and stable within it.
  return findings;
}
