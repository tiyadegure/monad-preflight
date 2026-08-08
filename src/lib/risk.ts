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
import { t } from './i18n';
import type { Lang } from './i18n';

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
  lang: Lang = 'en',
): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const add = (id: string, severity: RiskSeverity, title: string, detail: string) =>
    findings.push({ id, severity, title, detail });

  /* ---------------- danger ---------------- */

  if (!sim.ok) {
    const reason = sim.revertReason
      ? t(lang, 'risk.revertReason', { reason: sim.revertReason })
      : '';
    add(
      'simulation-reverted',
      'danger',
      t(lang, 'risk.revertedTitle'),
      t(lang, 'risk.revertedDetail', { reason }),
    );
  }

  if (tx.value + sim.gasCostWei > ctx.senderBalanceWei) {
    add(
      'insufficient-balance',
      'danger',
      t(lang, 'risk.noBalanceTitle'),
      t(lang, 'risk.noBalanceDetail'),
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
      t(lang, 'risk.unlimitedTitle'),
      t(lang, 'risk.unlimitedDetail'),
    );
  }

  if (tx.kind === 'erc20-approve' && ctx.counterpartyIsContract === false) {
    add(
      'approval-to-eoa',
      'danger',
      t(lang, 'risk.approveEoaTitle'),
      t(lang, 'risk.approveEoaDetail'),
    );
  }

  if (tx.kind.startsWith('erc20') && ctx.tokenIsContract === false) {
    add(
      'token-not-contract',
      'danger',
      t(lang, 'risk.tokenNotContractTitle'),
      t(lang, 'risk.tokenNotContractDetail'),
    );
  }

  if (isSameAddress(tx.counterparty, ZERO_ADDRESS)) {
    add(
      'zero-address',
      'danger',
      t(lang, 'risk.zeroAddressTitle'),
      t(lang, 'risk.zeroAddressDetail'),
    );
  }

  /* ---------------- caution ---------------- */

  if (isTransferKind(tx) && ctx.counterpartyIsContract === true) {
    add(
      'send-to-contract',
      'caution',
      t(lang, 'risk.toContractTitle'),
      t(lang, 'risk.toContractDetail'),
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
      t(lang, 'risk.freshRecipientTitle'),
      t(lang, 'risk.freshRecipientDetail'),
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
      t(lang, 'risk.entireBalanceTitle'),
      t(lang, 'risk.entireBalanceDetail'),
    );
  }

  const hasUnknownEvent = sim.events.some((e) => e.name === 'unknown');
  const silentRawCall = tx.data.length > 2 && sim.assetChanges.length === 0 && sim.ok;
  if (tx.kind === 'raw' && (hasUnknownEvent || silentRawCall)) {
    add(
      'unknown-effects',
      'caution',
      t(lang, 'risk.unknownEffectsTitle'),
      t(lang, 'risk.unknownEffectsDetail'),
    );
  }

  if (sim.notes.some((n) => n.toLowerCase().includes(DEGRADED_NOTE_MARKER))) {
    add(
      'simulation-degraded',
      'caution',
      t(lang, 'risk.degradedTitle'),
      t(lang, 'risk.degradedDetail'),
    );
  }

  /* ---------------- info ---------------- */

  // Wrapping and unwrapping are the same coins in a different coat, so
  // the transfer warnings above (skip-send-to-contract, fresh-recipient)
  // deliberately stay quiet here.
  if (tx.kind === 'wrap' || tx.kind === 'unwrap') {
    add(
      'wrap-info',
      'info',
      t(lang, 'risk.wrapTitle'),
      t(lang, 'risk.wrapDetail'),
    );
  }

  if (isSameAddress(tx.counterparty, tx.from)) {
    add(
      'self-transfer',
      'info',
      t(lang, 'risk.selfTitle'),
      t(lang, 'risk.selfDetail'),
    );
  }

  if (isTransferKind(tx) && tx.amountRaw === 0n) {
    add(
      'zero-amount',
      'info',
      t(lang, 'risk.zeroAmountTitle'),
      t(lang, 'risk.zeroAmountDetail'),
    );
  }

  if (sim.gasUsed > 1_000_000n) {
    add(
      'large-gas',
      'info',
      t(lang, 'risk.largeGasTitle'),
      t(lang, 'risk.largeGasDetail'),
    );
  }

  // Rules below all declared danger-first, then caution, then info,
  // so `findings` is already ordered by severity band and stable within it.
  return findings;
}
