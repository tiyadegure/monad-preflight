/**
 * Live holdings: the owner's native MON balance plus ERC-20 balances,
 * batched through Multicall3 (one round trip for any number of tokens).
 *
 * Multicall3 lives at the canonical address
 * 0xcA11bde05977b3631167028862bE2a173976CA11 on both Monad networks;
 * the chain configs in networks.ts declare it so viem can batch.
 */

import type { PublicClient } from 'viem';
import type { Address, TokenInfo } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';

export interface TokenBalance {
  token: TokenInfo;
  raw: bigint;
}

export interface BalancesResult {
  native: bigint;
  tokens: TokenBalance[];
  notes: string[];
}

/** Minimal ERC-20 fragment — balanceOf is all we read here. */
const BALANCE_OF_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const;

/** A token entry that definitely has a contract address (not native MON). */
type Erc20Info = TokenInfo & { address: Address };

/**
 * Fetch the owner's native balance and every listed token balance.
 *
 * - Entries with `address: null` (native MON) are skipped — the native
 *   balance is reported separately in `native`.
 * - All ERC-20 reads go through ONE multicall with allowFailure, so a
 *   single broken token cannot sink the whole read; broken ones are
 *   skipped and named in one plain-language note.
 * - Returned tokens are sorted by symbol, case-insensitively.
 */
export async function fetchBalances(
  client: PublicClient,
  owner: Address,
  tokens: TokenInfo[],
  lang: Lang = 'en',
): Promise<BalancesResult> {
  const notes: string[] = [];

  const erc20s: Erc20Info[] = tokens
    .filter((t): t is Erc20Info => t.address !== null)
    .sort((a, b) => {
      const sa = a.symbol.toLowerCase();
      const sb = b.symbol.toLowerCase();
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });

  const nativePromise = client.getBalance({ address: owner });

  const tokenBalances: TokenBalance[] = [];
  if (erc20s.length > 0) {
    const contracts = erc20s.map((token) => ({
      address: token.address,
      abi: BALANCE_OF_ABI,
      functionName: 'balanceOf' as const,
      args: [owner] as const,
    }));

    const results = await client.multicall({ contracts, allowFailure: true });

    const failedSymbols: string[] = [];
    for (let i = 0; i < erc20s.length; i += 1) {
      const token = erc20s[i];
      const result = results[i];
      if (!token) continue;
      if (result && result.status === 'success' && typeof result.result === 'bigint') {
        tokenBalances.push({ token, raw: result.result });
      } else {
        failedSymbols.push(token.symbol);
      }
    }

    if (failedSymbols.length > 0) {
      const names = failedSymbols.join(', ');
      notes.push(
        failedSymbols.length === 1
          ? t(lang, 'bal.failedOne', { name: names })
          : t(lang, 'bal.failedMany', { names }),
      );
    }
  }

  const native = await nativePromise;
  return { native, tokens: tokenBalances, notes };
}
