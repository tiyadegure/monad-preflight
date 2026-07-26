import { createPublicClient, defineChain, http } from 'viem';
import type { Chain, PublicClient } from 'viem';
import { makeHttpRpc } from './simulate';
import type { RpcCallFn } from './simulate';
import type { Address } from './types';

/**
 * Network registry. PreFlight is network-aware: every RPC read, explorer
 * link, and token registry is scoped to the selected network.
 *
 * Capability notes (verified live, 2026-07):
 * - Testnet (10143): testnet-rpc.monad.xyz supports debug_traceCall.
 * - Mainnet (143): rpc.monad.xyz (QuickNode) supports debug_traceCall;
 *   rpc1/rpc3 gate it behind paid tiers — so rpc.monad.xyz must stay
 *   first in the list. The simulator degrades gracefully (eth_call
 *   fallback + honest note) if a debug-capable endpoint is unreachable.
 */

export type NetworkKey = 'testnet' | 'mainnet';

export interface NetworkConfig {
  key: NetworkKey;
  label: string;
  chainId: number;
  chain: Chain;
  /** Ordered by capability — index 0 must support debug_traceCall. */
  rpcUrls: string[];
  explorerUrl: string;
  faucetUrl?: string;
  /** Canonical wrapped-MON contract, where one exists. */
  wmon?: Address;
  /** True when transactions move real value. */
  isMainnet: boolean;
}

const testnetChain = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' },
  },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
  testnet: true,
});

const mainnetChain = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.monad.xyz'] } },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://monadvision.com' },
  },
  contracts: {
    multicall3: { address: '0xcA11bde05977b3631167028862bE2a173976CA11' },
  },
});

export const NETWORKS: Record<NetworkKey, NetworkConfig> = {
  testnet: {
    key: 'testnet',
    label: 'Testnet',
    chainId: 10143,
    chain: testnetChain,
    rpcUrls: ['https://testnet-rpc.monad.xyz'],
    explorerUrl: 'https://testnet.monadvision.com',
    faucetUrl: 'https://faucet.monad.xyz',
    isMainnet: false,
  },
  mainnet: {
    key: 'mainnet',
    label: 'Mainnet',
    chainId: 143,
    chain: mainnetChain,
    rpcUrls: [
      'https://rpc.monad.xyz', // QuickNode — debug_traceCall verified
      'https://rpc2.monad.xyz', // Goldsky Edge
      'https://rpc3.monad.xyz', // Ankr
      'https://rpc1.monad.xyz', // Alchemy
    ],
    explorerUrl: 'https://monadvision.com',
    wmon: '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A',
    isMainnet: true,
  },
};

export const DEFAULT_NETWORK: NetworkKey = 'testnet';

export function isNetworkKey(value: string | null | undefined): value is NetworkKey {
  return value === 'testnet' || value === 'mainnet';
}

/* ---- clients (one per network, created on first use) ---- */

const clients = new Map<NetworkKey, PublicClient>();

export function getPublicClient(net: NetworkConfig): PublicClient {
  const existing = clients.get(net.key);
  if (existing) return existing;
  const client = createPublicClient({
    chain: net.chain,
    transport: http(net.rpcUrls[0]),
  });
  clients.set(net.key, client);
  return client;
}

/**
 * JSON-RPC caller for a network that tries every configured endpoint in
 * registry order (index 0 first — it must stay the debug_traceCall-capable
 * one) and fails over automatically when one stops answering.
 */
export function makeNetworkRpc(net: NetworkConfig): RpcCallFn {
  return makeHttpRpc(net.rpcUrls);
}

/* ---- explorer links ---- */

export function txUrl(net: NetworkConfig, hash: string): string {
  return `${net.explorerUrl}/tx/${hash}`;
}

export function addressUrl(net: NetworkConfig, addr: string): string {
  return `${net.explorerUrl}/address/${addr}`;
}
