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
import { t } from './i18n';
import type { Lang } from './i18n';

/* ------------------------------------------------------------------ */
/* Headline                                                            */
/* ------------------------------------------------------------------ */

function headlineFor(tx: PreparedTx, sim: SimulationResult, lang: Lang): string {
  if (!sim.ok) return t(lang, 'expl.failHeadline');

  switch (tx.kind) {
    case 'native-transfer': {
      const token = tx.token ?? NATIVE_MON;
      const amount = tx.amountRaw ?? tx.value;
      return t(lang, 'expl.sendHeadline', { amount: formatTokenAmount(amount, token) });
    }
    case 'erc20-transfer': {
      if (tx.token && tx.amountRaw !== undefined) {
        return t(lang, 'expl.sendHeadline', {
          amount: formatTokenAmount(tx.amountRaw, tx.token),
        });
      }
      return t(lang, 'expl.sendTokensHeadline');
    }
    case 'erc20-approve': {
      const spender = tx.counterparty ? shortAddress(tx.counterparty) : t(lang, 'expl.otherAddress');
      const symbol = tx.token?.symbol ?? t(lang, 'expl.tokens');
      return t(lang, 'expl.approveHeadline', { spender, symbol });
    }
    case 'erc20-revoke': {
      const spender = tx.counterparty ? shortAddress(tx.counterparty) : t(lang, 'expl.otherAddress');
      const symbol = tx.token?.symbol ?? t(lang, 'expl.tokens');
      return t(lang, 'expl.revokeHeadline', { spender, symbol });
    }
    case 'wrap': {
      // The amount is the native MON going in — formatted as MON.
      const amount = tx.amountRaw ?? tx.value;
      return t(lang, 'expl.wrapHeadline', { amount: formatTokenAmount(amount, NATIVE_MON) });
    }
    case 'unwrap': {
      if (tx.token && tx.amountRaw !== undefined) {
        return t(lang, 'expl.unwrapHeadline', {
          amount: formatTokenAmount(tx.amountRaw, tx.token),
        });
      }
      return t(lang, 'expl.unwrapAllHeadline');
    }
    case 'raw':
      return t(lang, 'expl.customHeadline');
  }
}

/* ------------------------------------------------------------------ */
/* Outcome paragraph                                                   */
/* ------------------------------------------------------------------ */

/** "you send 0.5 MON" / "0x1234…abcd receives 10 tUSD" — lowercase clause. */
function assetClause(change: AssetChange, userAddress: Address, lang: Lang): string {
  const amount = formatTokenAmount(
    change.deltaRaw < 0n ? -change.deltaRaw : change.deltaRaw,
    change.token,
  );
  if (isSameAddress(change.party, userAddress)) {
    return change.deltaRaw < 0n
      ? t(lang, 'expl.youSendClause', { amount })
      : t(lang, 'expl.youReceiveClause', { amount });
  }
  const who = shortAddress(change.party);
  return change.deltaRaw < 0n
    ? t(lang, 'expl.otherSendsClause', { who, amount })
    : t(lang, 'expl.otherReceivesClause', { who, amount });
}

function approvalClause(change: ApprovalChange, userAddress: Address, lang: Lang): string {
  const spender = shortAddress(change.spender);
  const whose = isSameAddress(change.owner, userAddress)
    ? t(lang, 'expl.your')
    : t(lang, 'expl.possesiveOwner', { owner: shortAddress(change.owner) });
  const isRevoke = !change.unlimited && change.amountRaw === 0n;
  if (isRevoke) {
    return t(lang, 'expl.approvalRevokeClause', { spender, whose, symbol: change.token.symbol });
  }
  if (change.unlimited) {
    return t(lang, 'expl.approvalUnlimitedClause', {
      spender,
      whose,
      symbol: change.token.symbol,
    });
  }
  return t(lang, 'expl.approvalLimitClause', {
    spender,
    amount: formatTokenAmount(change.amountRaw, change.token),
    whose,
  });
}

function joinClauses(parts: string[], lang: Lang): string {
  if (parts.length <= 1) return parts.join('');
  return t(lang, 'expl.joinAnd', {
    list: parts.slice(0, -1).join(t(lang, 'expl.joinSep')),
    last: parts[parts.length - 1],
  });
}

function outcomeFor(tx: PreparedTx, sim: SimulationResult, userAddress: Address, lang: Lang): string {
  if (!sim.ok) {
    const reason = sim.revertReason
      ? t(lang, 'expl.revertReason', { reason: sim.revertReason })
      : t(lang, 'expl.noReason');
    return t(lang, 'expl.rejectOutcome', { reason });
  }

  // Wrap/unwrap deserve a reassurance: it is the same money in a new coat.
  const oneToOne =
    tx.kind === 'wrap' || tx.kind === 'unwrap' ? t(lang, 'expl.oneToOne') : '';

  const clauses = [
    ...sim.assetChanges.map((c) => assetClause(c, userAddress, lang)),
    ...sim.approvalChanges.map((c) => approvalClause(c, userAddress, lang)),
  ];
  if (clauses.length === 0) {
    return t(lang, 'expl.noChangesOutcome', { oneToOne });
  }
  return t(lang, 'expl.ifConfirm', { clauses: joinClauses(clauses, lang), oneToOne });
}

/* ------------------------------------------------------------------ */
/* Bullets                                                             */
/* ------------------------------------------------------------------ */

/** "You send 0.5 MON" / "0x1234…abcd receives 10 tUSD" — capitalized bullet. */
function assetBullet(change: AssetChange, userAddress: Address, lang: Lang): string | null {
  if (change.deltaRaw === 0n) return null; // nothing moves — a line would only confuse
  const amount = formatTokenAmount(
    change.deltaRaw < 0n ? -change.deltaRaw : change.deltaRaw,
    change.token,
  );
  if (isSameAddress(change.party, userAddress)) {
    return change.deltaRaw < 0n
      ? t(lang, 'expl.youSendBullet', { amount })
      : t(lang, 'expl.youReceiveBullet', { amount });
  }
  const who = shortAddress(change.party);
  return change.deltaRaw < 0n
    ? t(lang, 'expl.otherSendsBullet', { who, amount })
    : t(lang, 'expl.otherReceivesBullet', { who, amount });
}

function approvalBullet(change: ApprovalChange, userAddress: Address, lang: Lang): string {
  const spender = shortAddress(change.spender);
  const ownerIsUser = isSameAddress(change.owner, userAddress);
  const whose = ownerIsUser
    ? t(lang, 'expl.your')
    : t(lang, 'expl.possesiveOwner', { owner: shortAddress(change.owner) });
  const isRevoke = !change.unlimited && change.amountRaw === 0n;
  if (isRevoke) {
    return t(lang, 'expl.approvalRevokeBullet', { spender, whose, symbol: change.token.symbol });
  }
  if (change.unlimited) {
    const revoker = ownerIsUser ? t(lang, 'expl.revokerYou') : t(lang, 'expl.revokerThey');
    return t(lang, 'expl.approvalUnlimitedBullet', {
      spender,
      whose,
      symbol: change.token.symbol,
      revoker,
    });
  }
  return t(lang, 'expl.approvalLimitBullet', {
    spender,
    amount: formatTokenAmount(change.amountRaw, change.token),
    whose,
  });
}

/* ------------------------------------------------------------------ */
/* Public API                                                          */
/* ------------------------------------------------------------------ */

export function composeExplanation(
  tx: PreparedTx,
  sim: SimulationResult,
  risks: RiskFinding[],
  userAddress: Address,
  lang: Lang = 'en',
): Explanation {
  const bullets: string[] = [];

  // 1. Every asset change, from the user's point of view.
  for (const change of sim.assetChanges) {
    const line = assetBullet(change, userAddress, lang);
    if (line) bullets.push(line);
  }

  // 2. Every approval change.
  for (const change of sim.approvalChanges) {
    bullets.push(approvalBullet(change, userAddress, lang));
  }

  // 3. Network fee.
  bullets.push(
    t(lang, 'expl.networkFeeBullet', {
      amount: formatTokenAmount(sim.gasCostWei, NATIVE_MON),
    }),
  );

  // 4. Serious warnings, only when there are any.
  const dangerCount = risks.filter((r) => r.severity === 'danger').length;
  if (dangerCount > 0) {
    bullets.push(
      dangerCount === 1
        ? t(lang, 'expl.warnOne')
        : t(lang, 'expl.warnMany', { count: dangerCount }),
    );
  }

  // 5. Simulator caveats, verbatim.
  bullets.push(...sim.notes);

  return {
    headline: headlineFor(tx, sim, lang),
    outcome: outcomeFor(tx, sim, userAddress, lang),
    bullets,
  };
}

/** One-line label for history entries. */
export function describeForReceipt(tx: PreparedTx): string {
  return tx.summary;
}
