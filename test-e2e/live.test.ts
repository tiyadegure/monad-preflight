import { describe, expect, it } from 'vitest';
import { encodeFunctionData, parseAbi } from 'viem';
import { makeHttpRpc, simulateTx } from '../src/lib/simulate';
import { NETWORKS } from '../src/lib/networks';
import type { Address, Hex, PreparedTx } from '../src/lib/types';

/**
 * LIVE tests against the real Monad testnet RPC (npm run test:e2e).
 * They verify the exact pipeline the app uses: debug_traceCall with
 * callTracer + withLog, event decoding, asset-change extraction, and
 * revert detection — no mocks anywhere.
 */

const rpc = makeHttpRpc(NETWORKS.testnet.rpcUrls);

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const A = '0x1111111111111111111111111111111111111111' as Address;
const B = '0x2222222222222222222222222222222222222222' as Address;

const erc20 = parseAbi([
  'function transfer(address to, uint256 value) returns (bool)',
]);

function topicToAddress(topic: string): Address {
  return `0x${topic.slice(-40)}` as Address;
}

interface RawLog {
  address: Address;
  topics: string[];
  data: string;
}

/**
 * This RPC limits eth_getLogs to 100-block ranges, and the testnet can be
 * quiet for stretches — so walk backwards in 100-block chunks until we
 * find Transfer events (up to ~6000 blocks).
 */
async function findRecentTransfers(): Promise<RawLog[]> {
  const latestHex = (await rpc('eth_blockNumber', [])) as string;
  const latest = BigInt(latestHex);
  const found: RawLog[] = [];
  for (let chunk = 0n; chunk < 60n && found.length < 10; chunk++) {
    const to = latest - chunk * 100n;
    const from = to - 99n;
    try {
      const logs = (await rpc('eth_getLogs', [
        {
          fromBlock: `0x${from.toString(16)}`,
          toBlock: `0x${to.toString(16)}`,
          topics: [TRANSFER_TOPIC],
        },
      ])) as RawLog[];
      found.push(...logs);
    } catch {
      // a single over-limit or flaky chunk shouldn't abort discovery
    }
  }
  return found.slice(0, 25);
}

describe('live Monad testnet simulation', () => {
  it('simulates a native MON transfer with correct asset deltas', async () => {
    const tx: PreparedTx = {
      from: A,
      to: B,
      data: '0x',
      value: 1n,
      kind: 'native-transfer',
      summary: 'Send 1 wei of MON (e2e)',
    };
    const sim = await simulateTx(tx, rpc);

    expect(sim.ok).toBe(true);
    expect(sim.gasUsed).toBeGreaterThan(0n);
    expect(sim.gasCostWei).toBeGreaterThan(0n);
    const fromDelta = sim.assetChanges.find(
      (c) => c.party.toLowerCase() === A && c.token.address === null,
    );
    const toDelta = sim.assetChanges.find(
      (c) => c.party.toLowerCase() === B && c.token.address === null,
    );
    expect(fromDelta?.deltaRaw).toBe(-1n);
    expect(toDelta?.deltaRaw).toBe(1n);
  });

  it('simulates a real ERC-20 transfer discovered from recent blocks', async () => {
    const logs = await findRecentTransfers();
    expect(logs.length).toBeGreaterThan(0);

    // Try candidates until one simulates cleanly (a recent recipient
    // usually still holds the tokens it just received).
    let verified = false;
    for (const log of logs) {
      if (log.topics.length !== 3 || log.data === '0x') continue;
      const amount = BigInt(log.data);
      if (amount < 2n) continue;
      const holder = topicToAddress(log.topics[2]);
      const send = amount / 2n;

      const tx: PreparedTx = {
        from: holder,
        to: log.address,
        data: encodeFunctionData({
          abi: erc20,
          functionName: 'transfer',
          args: [B, send],
        }) as Hex,
        value: 0n,
        kind: 'erc20-transfer',
        summary: 'e2e discovered-token transfer',
      };

      const sim = await simulateTx(tx, rpc);
      if (!sim.ok) continue;

      const transferEvents = sim.events.filter((e) => e.name === 'Transfer');
      const holderDelta = sim.assetChanges.find(
        (c) =>
          c.party.toLowerCase() === holder.toLowerCase() &&
          c.token.address?.toLowerCase() === log.address.toLowerCase(),
      );
      const recipientDelta = sim.assetChanges.find(
        (c) =>
          c.party.toLowerCase() === B &&
          c.token.address?.toLowerCase() === log.address.toLowerCase(),
      );
      if (!transferEvents.length || !holderDelta || !recipientDelta) continue;

      expect(holderDelta.deltaRaw).toBe(-send);
      expect(recipientDelta.deltaRaw).toBe(send);
      expect(holderDelta.token.decimals).toBeGreaterThanOrEqual(0);
      verified = true;
      break;
    }
    expect(verified, 'no candidate token transfer simulated cleanly').toBe(true);
  });

  it('detects that a transfer from an empty wallet cannot succeed', async () => {
    const logs = await findRecentTransfers();
    const tokenLog = logs.find((l) => l.topics.length === 3 && l.data !== '0x');
    expect(tokenLog).toBeDefined();

    const tx: PreparedTx = {
      from: A, // empty wallet — holds none of this token
      to: tokenLog!.address,
      data: encodeFunctionData({
        abi: erc20,
        functionName: 'transfer',
        args: [B, 10n ** 30n],
      }) as Hex,
      value: 0n,
      kind: 'erc20-transfer',
      summary: 'e2e revert probe',
    };
    const sim = await simulateTx(tx, rpc);

    // Either the token reverts (we decode a reason) or it returns false
    // without moving anything — both must never show token movement.
    const tokenMoves = sim.assetChanges.filter((c) => c.token.address !== null);
    expect(sim.ok === false || tokenMoves.length === 0).toBe(true);
  });
});
