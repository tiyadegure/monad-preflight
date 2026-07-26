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

  // 1. Outcome
  const outcomeMatched = sim.ok === (receipt.status === 'success');
  lines.push({
    label: 'Outcome',
    simulated: sim.ok ? 'will succeed' : 'would fail',
    actual: receipt.status === 'success' ? 'succeeded' : 'reverted',
    matched: outcomeMatched,
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
      matched: actual === change.deltaRaw,
    });
  }

  // 3. Token movements the simulation did NOT predict — always a mismatch.
  for (const [key, actual] of actualByToken) {
    if (coveredTokens.has(key) || actual === 0n) continue;
    const unknownToken: TokenInfo = {
      address: key as Address,
      symbol: `token ${shortAddress(key)}`,
      decimals: 18,
    };
    lines.push({
      label: 'Unexpected token movement',
      simulated: 'nothing',
      actual: signedAmount(actual, unknownToken),
      matched: false,
    });
  }

  // 4. Native MON — only verifiable when the prediction was exactly the
  //    tx value (a receipt cannot show internal native transfers).
  const simNative = simUserChanges.find((c) => c.token.address === null);
  if (simNative && receipt.status === 'success' && simNative.deltaRaw === -tx.value) {
    lines.push({
      label: 'MON movement',
      simulated: signedAmount(simNative.deltaRaw, NATIVE_MON),
      actual: signedAmount(-tx.value, NATIVE_MON),
      matched: true,
    });
  }

  // 5. Fee — informational only, so it never fails the overall check:
  //    estimates legitimately differ from the charged fee.
  const actualFee = receipt.gasUsed * receipt.effectiveGasPrice;
  lines.push({
    label: 'Network fee',
    simulated: `about ${formatTokenAmount(sim.gasCostWei, NATIVE_MON)}`,
    actual: formatTokenAmount(actualFee, NATIVE_MON),
    matched: true,
  });

  return { matched: lines.every((l) => l.matched), lines };
}
