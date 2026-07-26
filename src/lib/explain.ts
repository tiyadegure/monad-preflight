/**
 * Deterministic plain-language explanation composer.
 *
 * Takes the prepared tx, the simulation result, and the risk findings,
 * and produces an Explanation with zero AI involved. Every string here
 * must be understandable by a crypto newcomer: no "allowance", no
 * "calldata", no "wei".
 */

import type {
  Address,
  ApprovalChange,
  AssetChange,
  Explanation,
  PreparedTx,
  RiskFinding,
  SimulationResult,
} from './types';
import { NATIVE_MON } from './types';
import { formatTokenAmount, isSameAddress, shortAddress } from './format';

/* ------------------------------------------------------------------ */
/* Headline                                                            */
/* ------------------------------------------------------------------ */

function headlineFor(tx: PreparedTx, sim: SimulationResult): string {
  if (!sim.ok) return 'This transaction would fail — do not send it';

  switch (tx.kind) {
    case 'native-transfer': {
      const token = tx.token ?? NATIVE_MON;
      const amount = tx.amountRaw ?? tx.value;
      return `You are about to send ${formatTokenAmount(amount, token)}`;
    }
    case 'erc20-transfer': {
      if (tx.token && tx.amountRaw !== undefined) {
        return `You are about to send ${formatTokenAmount(tx.amountRaw, tx.token)}`;
      }
      return 'You are about to send tokens';
    }
    case 'erc20-approve': {
      const spender = tx.counterparty ? shortAddress(tx.counterparty) : 'another address';
      const symbol = tx.token?.symbol ?? 'tokens';
      return `You are about to let ${spender} spend your ${symbol}`;
    }
    case 'erc20-revoke': {
      const spender = tx.counterparty ? shortAddress(tx.counterparty) : 'another address';
      const symbol = tx.token?.symbol ?? 'tokens';
      return `You are about to revoke ${spender}'s access to your ${symbol}`;
    }
    case 'wrap': {
      // The amount is the native MON going in — formatted as MON.
      const amount = tx.amountRaw ?? tx.value;
      return `You are about to wrap ${formatTokenAmount(amount, NATIVE_MON)} into WMON`;
    }
    case 'unwrap': {
      if (tx.token && tx.amountRaw !== undefined) {
        return `You are about to unwrap ${formatTokenAmount(tx.amountRaw, tx.token)} back to MON`;
      }
      return 'You are about to unwrap WMON back to MON';
    }
    case 'raw':
      return 'You are about to run a custom transaction';
  }
}

/* ------------------------------------------------------------------ */
/* Outcome paragraph                                                   */
/* ------------------------------------------------------------------ */

/** "you send 0.5 MON" / "0x1234…abcd receives 10 tUSD" — lowercase clause. */
function assetClause(change: AssetChange, userAddress: Address): string {
  const amount = formatTokenAmount(
    change.deltaRaw < 0n ? -change.deltaRaw : change.deltaRaw,
    change.token,
  );
  if (isSameAddress(change.party, userAddress)) {
    return change.deltaRaw < 0n ? `you send ${amount}` : `you receive ${amount}`;
  }
  const who = shortAddress(change.party);
  return change.deltaRaw < 0n ? `${who} sends ${amount}` : `${who} receives ${amount}`;
}

function approvalClause(change: ApprovalChange, userAddress: Address): string {
  const spender = shortAddress(change.spender);
  const whose = isSameAddress(change.owner, userAddress)
    ? 'your'
    : `${shortAddress(change.owner)}'s`;
  const isRevoke = !change.unlimited && change.amountRaw === 0n;
  if (isRevoke) {
    return `${spender} loses its permission to spend ${whose} ${change.token.symbol}`;
  }
  if (change.unlimited) {
    return `${spender} gets permission to move ALL of ${whose} ${change.token.symbol}`;
  }
  return `${spender} gets permission to spend up to ${formatTokenAmount(
    change.amountRaw,
    change.token,
  )} from ${whose} wallet`;
}

function joinClauses(parts: string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function outcomeFor(tx: PreparedTx, sim: SimulationResult, userAddress: Address): string {
  if (!sim.ok) {
    const reason = sim.revertReason
      ? `The reason given: ${sim.revertReason}.`
      : 'It did not give a clear reason why.';
    return (
      `Our test run shows the network will reject this transaction. ${reason} ` +
      'Sending it anyway would only waste gas — you would pay a fee and nothing else would happen.'
    );
  }

  // Wrap/unwrap deserve a reassurance: it is the same money in a new coat.
  const oneToOne =
    tx.kind === 'wrap' || tx.kind === 'unwrap'
      ? ' Every 1 MON equals exactly 1 WMON, and you can convert back at any time.'
      : '';

  const clauses = [
    ...sim.assetChanges.map((c) => assetClause(c, userAddress)),
    ...sim.approvalChanges.map((c) => approvalClause(c, userAddress)),
  ];
  if (clauses.length === 0) {
    return (
      'Our test run finished without errors, but it did not detect any balance ' +
      'changes for your wallet. Check the details below before you sign.' +
      oneToOne
    );
  }
  return `If you confirm this, ${joinClauses(clauses)}.${oneToOne}`;
}

/* ------------------------------------------------------------------ */
/* Bullets                                                             */
/* ------------------------------------------------------------------ */

/** "You send 0.5 MON" / "0x1234…abcd receives 10 tUSD" — capitalized bullet. */
function assetBullet(change: AssetChange, userAddress: Address): string | null {
  if (change.deltaRaw === 0n) return null; // nothing moves — a line would only confuse
  const amount = formatTokenAmount(
    change.deltaRaw < 0n ? -change.deltaRaw : change.deltaRaw,
    change.token,
  );
  if (isSameAddress(change.party, userAddress)) {
    return change.deltaRaw < 0n ? `You send ${amount}` : `You receive ${amount}`;
  }
  const who = shortAddress(change.party);
  return change.deltaRaw < 0n ? `${who} sends ${amount}` : `${who} receives ${amount}`;
}

function approvalBullet(change: ApprovalChange, userAddress: Address): string {
  const spender = shortAddress(change.spender);
  const ownerIsUser = isSameAddress(change.owner, userAddress);
  const whose = ownerIsUser ? 'your' : `${shortAddress(change.owner)}'s`;
  const isRevoke = !change.unlimited && change.amountRaw === 0n;
  if (isRevoke) {
    return `After this, ${spender} can no longer spend ${whose} ${change.token.symbol}`;
  }
  if (change.unlimited) {
    const revoker = ownerIsUser ? 'you revoke' : 'they revoke';
    return `After this, ${spender} can move ALL of ${whose} ${change.token.symbol}, now and in the future, until ${revoker} it`;
  }
  return `After this, ${spender} can spend up to ${formatTokenAmount(
    change.amountRaw,
    change.token,
  )} from ${whose} wallet at any time`;
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function composeExplanation(
  tx: PreparedTx,
  sim: SimulationResult,
  risks: RiskFinding[],
  userAddress: Address,
): Explanation {
  const bullets: string[] = [];

  // 1. Every asset change, from the user's point of view.
  for (const change of sim.assetChanges) {
    const line = assetBullet(change, userAddress);
    if (line) bullets.push(line);
  }

  // 2. Every approval change.
  for (const change of sim.approvalChanges) {
    bullets.push(approvalBullet(change, userAddress));
  }

  // 3. Network fee.
  bullets.push(
    `Network fee: about ${formatTokenAmount(sim.gasCostWei, NATIVE_MON)} ` +
      '(your wallet shows the exact number before you confirm)',
  );

  // 4. Serious warnings, only when there are any.
  const dangerCount = risks.filter((r) => r.severity === 'danger').length;
  if (dangerCount > 0) {
    bullets.push(
      dangerCount === 1
        ? '⚠ 1 serious warning below — read it before signing.'
        : `⚠ ${dangerCount} serious warnings below — read them before signing.`,
    );
  }

  // 5. Simulator caveats, verbatim.
  bullets.push(...sim.notes);

  return {
    headline: headlineFor(tx, sim),
    outcome: outcomeFor(tx, sim, userAddress),
    bullets,
  };
}

/** One-line label for history entries. */
export function describeForReceipt(tx: PreparedTx): string {
  return tx.summary;
}
