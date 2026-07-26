import type {
  Address,
  Hex,
  PostFlightCheck,
  PreparedTx,
  SimulationResult,
  TokenInfo,
} from './types';
import { NATIVE_MON } from './types';
import type { MinedReceipt } from './wallet';
import { formatTokenAmount, isSameAddress, shortAddress } from './format';

/**
 * After the transaction lands, compare what we PROMISED (the pre-sign
 * simulation) with what actually HAPPENED (the mined receipt).
 *
 * A receipt can verify: success/failure, every ERC-20 movement (from
 * Transfer logs), and the exact fee. It cannot show internal native-MON
 * flows (those need a trace), so native movement is only compared for
 * the simple case where the simulation predicted exactly the tx value.
 */

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const APPROVAL_TOPIC =
  '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';

function topicToAddress(topic: Hex): Address {
  return `0x${topic.slice(-40)}` as Address;
}

function signedAmount(raw: bigint, token: TokenInfo): string {
  const abs = raw < 0n ? -raw : raw;
  const verb = raw < 0n ? 'you sent' : 'you received';
  return `${verb} ${formatTokenAmount(abs, token)}`;
}

export function comparePostFlight(
  tx: PreparedTx,
  sim: SimulationResult,
  receipt: MinedReceipt,
  userAddress: Address,
): PostFlightCheck {
  const lines: PostFlightCheck['lines'] = [];

  // 1. Outcome — fully verifiable from the receipt status.
  lines.push({
    label: 'Outcome',
    simulated: sim.ok ? 'will succeed' : 'would fail',
    actual: receipt.status === 'success' ? 'succeeded' : 'reverted',
    status: sim.ok === (receipt.status === 'success') ? 'matched' : 'mismatched',
  });

  // Actual ERC-20 deltas for the user, from receipt Transfer logs.
  const actualByToken = new Map<string, bigint>();
  for (const log of receipt.logs) {
    if (log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
    const from = topicToAddress(log.topics[1]);
    const to = topicToAddress(log.topics[2]);
    const amount = BigInt(log.data === '0x' ? 0 : log.data);
    const key = log.address.toLowerCase();
    if (isSameAddress(from, userAddress)) {
      actualByToken.set(key, (actualByToken.get(key) ?? 0n) - amount);
    }
    if (isSameAddress(to, userAddress)) {
      actualByToken.set(key, (actualByToken.get(key) ?? 0n) + amount);
    }
  }

  // Simulated user-perspective deltas.
  const simUserChanges = sim.assetChanges.filter((c) =>
    isSameAddress(c.party, userAddress),
  );

  // 2. ERC-20 comparisons for every token the simulation predicted.
  const coveredTokens = new Set<string>();
  for (const change of simUserChanges) {
    if (change.token.address === null) continue; // native handled below
    const key = change.token.address.toLowerCase();
    coveredTokens.add(key);
    const actual = actualByToken.get(key) ?? 0n;
    lines.push({
      label: `${change.token.symbol} movement`,
      simulated: signedAmount(change.deltaRaw, change.token),
      actual: signedAmount(actual, change.token),
      status: actual === change.deltaRaw ? 'matched' : 'mismatched',
    });
  }

  // 3. Token movements the simulation did NOT predict — always a mismatch.
  for (const [key, actual] of actualByToken) {
    if (coveredTokens.has(key) || actual === 0n) continue;
    // We have no decimals for a token the simulation never mentioned, and
    // guessing 18 would print a confidently wrong number (a 6-decimal
    // token would read as 0.000000000005 instead of 5). Show raw units and
    // say they are raw units.
    lines.push({
      label: 'Unexpected token movement',
      simulated: 'nothing',
      actual:
        `${actual < 0n ? 'you sent' : 'you received'} ${(actual < 0n ? -actual : actual).toString()} ` +
        `raw units of the token at ${shortAddress(key)}`,
      status: 'mismatched',
    });
  }

  // 4. Native MON. A receipt carries no log of native value movement, so
  //    in general we cannot confirm it — and we must not synthesize an
  //    "actual" figure from the transaction we submitted and present that
  //    as verification.
  //
  //    The one exception is a plain wallet-to-wallet transfer with no
  //    calldata: if such a transaction succeeded, the EVM moved exactly
  //    its value, with no other path possible. That we can honestly call
  //    verified.
  const simNative = simUserChanges.find((c) => c.token.address === null);
  if (simNative && simNative.deltaRaw !== 0n) {
    const plainTransfer = tx.kind === 'native-transfer' && tx.data === '0x';
    const provenBySuccess =
      plainTransfer && receipt.status === 'success' && simNative.deltaRaw === -tx.value;
    lines.push({
      label: 'MON movement',
      simulated: signedAmount(simNative.deltaRaw, NATIVE_MON),
      actual: provenBySuccess
        ? signedAmount(-tx.value, NATIVE_MON)
        : 'not recorded in the receipt',
      status: provenBySuccess ? 'matched' : 'unverified',
      note: provenBySuccess
        ? undefined
        : 'A receipt does not record MON moved inside a contract call, so we cannot ' +
          'confirm this one independently. Your wallet balance is the check here.',
    });
  }

  // 5. Approvals. Allowance changes do emit an Approval event, but the
  //    resulting allowance lives in contract storage; we only know an
  //    event fired, not the final number. Report honestly.
  for (const approval of sim.approvalChanges) {
    if (!isSameAddress(approval.owner, userAddress)) continue;
    const sawApprovalEvent = receipt.logs.some(
      (log) =>
        log.topics[0] === APPROVAL_TOPIC &&
        log.topics.length === 3 &&
        isSameAddress(log.address, approval.token.address ?? '') &&
        isSameAddress(topicToAddress(log.topics[1]), userAddress),
    );
    lines.push({
      label: `${approval.token.symbol} permission`,
      simulated: approval.unlimited
        ? 'unlimited spending granted'
        : `spending up to ${formatTokenAmount(approval.amountRaw, approval.token)} granted`,
      actual: sawApprovalEvent
        ? 'the token confirmed a permission change'
        : 'no permission change recorded',
      status: sawApprovalEvent ? 'unverified' : 'mismatched',
      note: sawApprovalEvent
        ? 'The token reported a permission change, but the exact remaining amount ' +
          'lives in the contract — check the Hangar to see it.'
        : undefined,
    });
  }

  // 6. Fee — informational. Estimates legitimately differ from the charged
  //    fee, so this is reported, never counted as agreement or conflict.
  const actualFee = receipt.gasUsed * receipt.effectiveGasPrice;
  lines.push({
    label: 'Network fee',
    simulated: `about ${formatTokenAmount(sim.gasCostWei, NATIVE_MON)}`,
    actual: formatTokenAmount(actualFee, NATIVE_MON),
    status: 'unverified',
    note: 'Fee estimates are always approximate; this is what you were actually charged.',
  });

  return {
    matched: !lines.some((l) => l.status === 'mismatched'),
    hasUnverified: lines.some((l) => l.status === 'unverified'),
    lines,
  };
}
