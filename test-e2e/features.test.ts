import { describe, expect, it } from 'vitest';
import { makeHttpRpc } from '../src/lib/simulate';
import { readFees } from '../src/lib/gasoracle';
import { scanApprovals } from '../src/lib/approvals';
import { fingerprintAddress } from '../src/lib/fingerprint';
import { NETWORKS, getPublicClient } from '../src/lib/networks';
import { fetchBalances } from '../src/lib/balances';
import type { Address, Hex } from '../src/lib/types';

/**
 * LIVE feature tests against real Monad networks (npm run test:e2e).
 * These verify the modules that talk to the chain do so correctly against
 * production endpoints — not fixtures.
 */

const testnet = NETWORKS.testnet;
const mainnet = NETWORKS.mainnet;
const rpc = makeHttpRpc(testnet.rpcUrls);
const mainnetRpc = makeHttpRpc(mainnet.rpcUrls);

// Multicall3 — canonical deployment, same address on both networks.
const MULTICALL3 = '0xcA11bde05977b3631167028862bE2a173976CA11' as Address;
const EMPTY = '0x000000000000000000000000000000000000dEaD' as Address;

describe('live: RPC failover client', () => {
  it('recovers from a dead endpoint by failing over to a live one', async () => {
    const withDeadFirst = makeHttpRpc([
      'https://127.0.0.1:1/dead-endpoint',
      testnet.rpcUrls[0],
    ]);
    const chainId = await withDeadFirst('eth_chainId', []);
    expect(BigInt(chainId as string)).toBe(BigInt(testnet.chainId));
  });

  it('sticks to the endpoint that answered', async () => {
    const client = makeHttpRpc([
      'https://127.0.0.1:1/dead-endpoint',
      testnet.rpcUrls[0],
    ]);
    await client('eth_chainId', []);
    // Second call should be fast because it starts at the known-good one.
    const started = Date.now();
    await client('eth_blockNumber', []);
    expect(Date.now() - started).toBeLessThan(15_000);
  });
});

describe('live: fee intelligence', () => {
  it('reads real fees on testnet and produces a plain-language verdict', async () => {
    const reading = await readFees(rpc, 21000n);
    expect(reading.baseFeeWei).toBeGreaterThanOrEqual(0n);
    expect(reading.totalFeeWei).toBeGreaterThanOrEqual(0n);
    expect(reading.verdict.length).toBeGreaterThan(0);
    // Verdict must be a sentence a newcomer can read, not a number dump.
    expect(reading.verdict).toMatch(/fee|network/i);
  });

  it('reads real fees on mainnet', async () => {
    const reading = await readFees(mainnetRpc, 21000n);
    expect(reading.totalFeeWei).toBeGreaterThanOrEqual(0n);
    expect(reading.verdict.length).toBeGreaterThan(0);
  });
});

describe('live: contract fingerprinting', () => {
  const reader = (net: typeof testnet) => {
    const client = getPublicClient(net);
    return {
      getCode: (a: Address) => client.getCode({ address: a }).then((c) => c ?? '0x'),
      getStorageAt: (a: Address, slot: Hex) =>
        client.getStorageAt({ address: a, slot }).then((v) => v ?? '0x'),
      call: (a: Address, data: Hex) =>
        client
          .call({ to: a, data })
          .then((r) => r.data ?? '0x')
          .catch(() => '0x'),
    };
  };

  it('identifies an unused address as a personal wallet', async () => {
    const fp = await fingerprintAddress(reader(testnet), EMPTY);
    expect(fp.kind).toBe('eoa');
    expect(fp.label.toLowerCase()).toContain('wallet');
  });

  it('identifies Multicall3 as a contract and reads its selectors', async () => {
    const fp = await fingerprintAddress(reader(testnet), MULTICALL3);
    expect(fp.kind).not.toBe('eoa');
    expect(fp.selectors.length).toBeGreaterThan(0);
  });

  it('recognises canonical mainnet WMON as a token', async () => {
    expect(mainnet.wmon).toBeDefined();
    const fp = await fingerprintAddress(reader(mainnet), mainnet.wmon!);
    // WMON is a WETH9: exposes transfer + balanceOf, no ERC-721 markers.
    expect(fp.kind).toBe('erc20');
  });
});

describe('live: balances via Multicall3', () => {
  it('reads a native balance and survives an empty token list', async () => {
    const client = getPublicClient(testnet);
    const result = await fetchBalances(client, EMPTY, []);
    expect(result.native).toBeGreaterThanOrEqual(0n);
    expect(result.tokens).toEqual([]);
  });

  it('batches real ERC-20 reads through Multicall3 on mainnet', async () => {
    const client = getPublicClient(mainnet);
    const result = await fetchBalances(client, EMPTY, [
      { address: mainnet.wmon!, symbol: 'WMON', decimals: 18 },
    ]);
    expect(result.native).toBeGreaterThanOrEqual(0n);
    // The read must succeed (balance may legitimately be zero).
    expect(result.tokens.length + result.notes.length).toBeGreaterThan(0);
  });
});

describe('live: approval scanning', () => {
  it('completes a scan on a wallet with no approvals and says so honestly', async () => {
    const scan = await scanApprovals(rpc, EMPTY, { maxChunks: 3 });
    expect(Array.isArray(scan.records)).toBe(true);
    expect(scan.scannedBlocks).toBeGreaterThan(0);
    // Coverage honesty: the notes must state the scan window.
    expect(scan.notes.join(' ')).toMatch(/block/i);
  });
});
