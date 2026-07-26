import type { Address, Hex } from './types';
import { monadTestnet, publicClient } from './chain';

/**
 * Thin EIP-1193 wallet layer (MetaMask and compatible injected wallets).
 * Deliberately dependency-free so every line is explainable: we talk the
 * standard `request({ method, params })` protocol directly.
 */

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

const CHAIN_ID_HEX = `0x${monadTestnet.id.toString(16)}` as Hex; // 0x279f

export function getInjectedProvider(): Eip1193Provider | null {
  const w = window as unknown as { ethereum?: Eip1193Provider };
  return w.ethereum ?? null;
}

export async function connect(provider: Eip1193Provider): Promise<Address> {
  const accounts = (await provider.request({
    method: 'eth_requestAccounts',
  })) as Address[];
  if (!accounts?.length) throw new Error('Your wallet did not share an account.');
  return accounts[0];
}

export async function getConnectedAccount(
  provider: Eip1193Provider,
): Promise<Address | null> {
  const accounts = (await provider.request({ method: 'eth_accounts' })) as Address[];
  return accounts?.[0] ?? null;
}

/** Switch the wallet to Monad Testnet, adding the network first if unknown. */
export async function ensureMonadTestnet(provider: Eip1193Provider): Promise<void> {
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  } catch (err) {
    // 4902 = chain not added to the wallet yet
    const code = (err as { code?: number })?.code;
    if (code !== 4902) throw err;
    await provider.request({
      method: 'wallet_addEthereumChain',
      params: [
        {
          chainId: CHAIN_ID_HEX,
          chainName: monadTestnet.name,
          nativeCurrency: monadTestnet.nativeCurrency,
          rpcUrls: [...monadTestnet.rpcUrls.default.http],
          blockExplorerUrls: [monadTestnet.blockExplorers.default.url],
        },
      ],
    });
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: CHAIN_ID_HEX }],
    });
  }
}

export async function getWalletChainId(provider: Eip1193Provider): Promise<number> {
  const hex = (await provider.request({ method: 'eth_chainId' })) as string;
  return Number.parseInt(hex, 16);
}

export function isOnMonadTestnet(chainId: number): boolean {
  return chainId === monadTestnet.id;
}

/**
 * Ask the wallet to sign and broadcast. The wallet shows its own final
 * confirmation screen — PreFlight never touches private keys.
 */
export async function sendTransaction(
  provider: Eip1193Provider,
  tx: { from: Address; to: Address; data: Hex; value: bigint },
): Promise<Hex> {
  const params: Record<string, string> = {
    from: tx.from,
    to: tx.to,
    data: tx.data,
  };
  if (tx.value > 0n) params.value = `0x${tx.value.toString(16)}`;
  return (await provider.request({
    method: 'eth_sendTransaction',
    params: [params],
  })) as Hex;
}

export interface MinedReceipt {
  status: 'success' | 'reverted';
  gasUsed: bigint;
  effectiveGasPrice: bigint;
  blockNumber: bigint;
  logs: { address: Address; topics: Hex[]; data: Hex }[];
}

/** Wait for the tx to land, reading through our own RPC (not the wallet's). */
export async function waitForReceipt(hash: Hex): Promise<MinedReceipt> {
  const r = await publicClient.waitForTransactionReceipt({ hash, timeout: 120_000 });
  return {
    status: r.status,
    gasUsed: r.gasUsed,
    effectiveGasPrice: r.effectiveGasPrice,
    blockNumber: r.blockNumber,
    logs: r.logs.map((l) => ({
      address: l.address as Address,
      topics: [...l.topics] as Hex[],
      data: l.data as Hex,
    })),
  };
}

export function onAccountsChanged(
  provider: Eip1193Provider,
  handler: (accounts: Address[]) => void,
): () => void {
  provider.on?.('accountsChanged', handler as (...args: never[]) => void);
  return () =>
    provider.removeListener?.('accountsChanged', handler as (...args: never[]) => void);
}

export function onChainChanged(
  provider: Eip1193Provider,
  handler: (chainIdHex: string) => void,
): () => void {
  provider.on?.('chainChanged', handler as (...args: never[]) => void);
  return () =>
    provider.removeListener?.('chainChanged', handler as (...args: never[]) => void);
}
