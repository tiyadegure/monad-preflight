/**
 * Legacy single-network surface, kept for tests and scripts.
 * App code should use networks.ts (network-aware) instead.
 */
import { NETWORKS, getPublicClient, txUrl, addressUrl } from './networks';

const testnet = NETWORKS.testnet;

export const monadTestnet = testnet.chain;
export const RPC_URL = testnet.rpcUrls[0];
export const EXPLORER_URL = testnet.explorerUrl;
export const FAUCET_URL = testnet.faucetUrl ?? '';

export const publicClient = getPublicClient(testnet);

export const explorerTxUrl = (hash: string) => txUrl(testnet, hash);
export const explorerAddressUrl = (addr: string) => addressUrl(testnet, addr);
