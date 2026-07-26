import { defineChain } from 'viem';
import { createPublicClient, http } from 'viem';

/**
 * Monad Testnet — verified live 2026-07 (eth_chainId → 0x279f = 10143).
 * debug_traceCall with callTracer is supported; eth_simulateV1 is not.
 */
export const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://testnet-rpc.monad.xyz'] },
  },
  blockExplorers: {
    default: { name: 'MonadVision', url: 'https://testnet.monadvision.com' },
  },
  testnet: true,
});

export const RPC_URL = 'https://testnet-rpc.monad.xyz';
export const EXPLORER_URL = 'https://testnet.monadvision.com';
export const FAUCET_URL = 'https://faucet.monad.xyz';

export const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(RPC_URL),
});

export const explorerTxUrl = (hash: string) => `${EXPLORER_URL}/tx/${hash}`;
export const explorerAddressUrl = (addr: string) => `${EXPLORER_URL}/address/${addr}`;
