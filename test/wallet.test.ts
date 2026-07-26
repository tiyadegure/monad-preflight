import { describe, expect, it } from 'vitest';
import type { PublicClient } from 'viem';
import {
  connect,
  ensureNetwork,
  getConnectedAccount,
  getWalletChainId,
  onAccountsChanged,
  onChainChanged,
  sendTransaction,
  waitForReceipt,
} from '../src/lib/wallet';
import type { Eip1193Provider, MinedReceipt } from '../src/lib/wallet';
import { NETWORKS } from '../src/lib/networks';
import type { Address, Hex } from '../src/lib/types';

/* ------------------------------------------------------------------ */
/* Fixtures and helpers                                                */
/* ------------------------------------------------------------------ */

const ALICE: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOB: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const HASH: Hex = `0x${'ab'.repeat(32)}`;

interface RecordedCall {
  method: string;
  params?: unknown[] | object;
}

/**
 * Fake EIP-1193 provider: records every request and answers via the
 * supplied responder (which may throw to simulate wallet errors).
 */
function scriptedProvider(
  respond: (method: string, params?: unknown[] | object) => unknown,
): { provider: Eip1193Provider; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const provider: Eip1193Provider = {
    async request({ method, params }) {
      calls.push({ method, params });
      return respond(method, params);
    },
  };
  return { provider, calls };
}

/** First element of a recorded request's params array, loosely typed. */
function firstParam(call: RecordedCall): Record<string, unknown> {
  return (call.params as [Record<string, unknown>])[0];
}

/* ------------------------------------------------------------------ */
/* connect / getConnectedAccount                                       */
/* ------------------------------------------------------------------ */

describe('connect', () => {
  it('asks for accounts and returns the first one', async () => {
    const { provider, calls } = scriptedProvider(() => [ALICE, BOB]);

    await expect(connect(provider)).resolves.toBe(ALICE);
    expect(calls.map((c) => c.method)).toEqual(['eth_requestAccounts']);
  });

  it('throws a plain-language error when the wallet shares no accounts', async () => {
    const { provider } = scriptedProvider(() => []);

    await expect(connect(provider)).rejects.toThrow(
      'Your wallet did not share an account.',
    );
  });
});

describe('getConnectedAccount', () => {
  it('returns the first already-connected account', async () => {
    const { provider, calls } = scriptedProvider(() => [BOB]);

    await expect(getConnectedAccount(provider)).resolves.toBe(BOB);
    expect(calls.map((c) => c.method)).toEqual(['eth_accounts']);
  });

  it('returns null when nothing is connected', async () => {
    const { provider } = scriptedProvider(() => []);

    await expect(getConnectedAccount(provider)).resolves.toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* ensureNetwork                                                       */
/* ------------------------------------------------------------------ */

describe('ensureNetwork', () => {
  it('switches directly when the wallet already knows the chain', async () => {
    const { provider, calls } = scriptedProvider(() => null);

    await ensureNetwork(provider, NETWORKS.testnet);

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('wallet_switchEthereumChain');
    expect(calls[0].params).toEqual([{ chainId: '0x279f' }]); // 10143
  });

  it('adds the chain then retries the switch when the wallet answers 4902', async () => {
    let switchAttempts = 0;
    const { provider, calls } = scriptedProvider((method) => {
      if (method === 'wallet_switchEthereumChain') {
        switchAttempts += 1;
        if (switchAttempts === 1) {
          throw Object.assign(new Error('Unrecognized chain ID'), { code: 4902 });
        }
      }
      return null;
    });

    await ensureNetwork(provider, NETWORKS.mainnet);

    expect(calls.map((c) => c.method)).toEqual([
      'wallet_switchEthereumChain',
      'wallet_addEthereumChain',
      'wallet_switchEthereumChain',
    ]);

    const added = firstParam(calls[1]);
    expect(added.chainId).toBe('0x8f'); // 143
    expect(added.chainName).toBe('Monad');
    expect(added.nativeCurrency).toEqual({
      name: 'Monad',
      symbol: 'MON',
      decimals: 18,
    });
    expect(added.rpcUrls).toEqual(NETWORKS.mainnet.rpcUrls);
    // A defensive copy, so a wallet mutating it cannot corrupt the registry.
    expect(added.rpcUrls).not.toBe(NETWORKS.mainnet.rpcUrls);
    expect(added.blockExplorerUrls).toEqual(['https://monadvision.com']);

    // The retry targets the same chain.
    expect(calls[2].params).toEqual([{ chainId: '0x8f' }]);
  });

  it('propagates non-4902 switch errors without trying to add the chain', async () => {
    const rejection = Object.assign(new Error('You declined the request.'), {
      code: 4001,
    });
    const { provider, calls } = scriptedProvider(() => {
      throw rejection;
    });

    await expect(ensureNetwork(provider, NETWORKS.testnet)).rejects.toBe(rejection);
    expect(calls.map((c) => c.method)).toEqual(['wallet_switchEthereumChain']);
  });

  it('propagates errors that carry no code at all', async () => {
    const rejection = new Error('Wallet is locked.');
    const { provider, calls } = scriptedProvider(() => {
      throw rejection;
    });

    await expect(ensureNetwork(provider, NETWORKS.testnet)).rejects.toBe(rejection);
    expect(calls.map((c) => c.method)).toEqual(['wallet_switchEthereumChain']);
  });
});

/* ------------------------------------------------------------------ */
/* sendTransaction                                                     */
/* ------------------------------------------------------------------ */

describe('sendTransaction', () => {
  it('omits the value field entirely when value is zero', async () => {
    const { provider, calls } = scriptedProvider(() => HASH);

    const hash = await sendTransaction(provider, {
      from: ALICE,
      to: BOB,
      data: '0xa9059cbb',
      value: 0n,
    });

    expect(hash).toBe(HASH);
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe('eth_sendTransaction');
    const params = firstParam(calls[0]);
    expect(params).toEqual({ from: ALICE, to: BOB, data: '0xa9059cbb' });
    expect('value' in params).toBe(false);
  });

  it('includes the value as minimal hex when value is positive', async () => {
    const { provider, calls } = scriptedProvider(() => HASH);

    const hash = await sendTransaction(provider, {
      from: ALICE,
      to: BOB,
      data: '0x',
      value: 10n ** 18n,
    });

    expect(hash).toBe(HASH);
    expect(firstParam(calls[0])).toEqual({
      from: ALICE,
      to: BOB,
      data: '0x',
      value: '0xde0b6b3a7640000', // 1 MON in wei
    });
  });
});

/* ------------------------------------------------------------------ */
/* getWalletChainId                                                    */
/* ------------------------------------------------------------------ */

describe('getWalletChainId', () => {
  it('parses the hex chain id into a number', async () => {
    const { provider, calls } = scriptedProvider(() => '0x279f');

    await expect(getWalletChainId(provider)).resolves.toBe(10143);
    expect(calls.map((c) => c.method)).toEqual(['eth_chainId']);
  });
});

/* ------------------------------------------------------------------ */
/* waitForReceipt                                                      */
/* ------------------------------------------------------------------ */

describe('waitForReceipt', () => {
  const TRANSFER_TOPIC: Hex =
    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  it('maps a successful viem receipt into a MinedReceipt', async () => {
    const viemLogs = [
      {
        address: BOB,
        topics: [TRANSFER_TOPIC],
        data: '0x01',
        logIndex: 3, // extra viem field the mapping must drop
      },
    ];
    let received: { hash: Hex; timeout?: number } | undefined;
    const client = {
      waitForTransactionReceipt: async (args: { hash: Hex; timeout?: number }) => {
        received = args;
        return {
          status: 'success',
          gasUsed: 21_000n,
          effectiveGasPrice: 2_000_000_000n,
          blockNumber: 42n,
          logs: viemLogs,
        };
      },
    } as unknown as PublicClient;

    const receipt: MinedReceipt = await waitForReceipt(client, HASH);

    expect(received?.hash).toBe(HASH);
    expect(received?.timeout).toBe(120_000);
    expect(receipt.status).toBe('success');
    expect(receipt.gasUsed).toBe(21_000n);
    expect(receipt.effectiveGasPrice).toBe(2_000_000_000n);
    expect(receipt.blockNumber).toBe(42n);
    expect(receipt.logs).toEqual([
      { address: BOB, topics: [TRANSFER_TOPIC], data: '0x01' },
    ]);
    // Topics are copied into a fresh array, not shared with the source.
    expect(receipt.logs[0].topics).not.toBe(viemLogs[0].topics);
  });

  it('maps a reverted receipt', async () => {
    const client = {
      waitForTransactionReceipt: async () => ({
        status: 'reverted',
        gasUsed: 30_000n,
        effectiveGasPrice: 1_000_000_000n,
        blockNumber: 43n,
        logs: [],
      }),
    } as unknown as PublicClient;

    const receipt = await waitForReceipt(client, HASH);

    expect(receipt.status).toBe('reverted');
    expect(receipt.logs).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* Event subscriptions                                                 */
/* ------------------------------------------------------------------ */

interface ListenerRecord {
  event: string;
  handler: unknown;
}

function listenerProvider(): {
  provider: Eip1193Provider;
  registered: ListenerRecord[];
  removed: ListenerRecord[];
} {
  const registered: ListenerRecord[] = [];
  const removed: ListenerRecord[] = [];
  const provider: Eip1193Provider = {
    async request() {
      return null;
    },
    on(event, handler) {
      registered.push({ event, handler });
    },
    removeListener(event, handler) {
      removed.push({ event, handler });
    },
  };
  return { provider, registered, removed };
}

describe('onAccountsChanged', () => {
  it('registers the handler and the returned unsubscribe removes it', () => {
    const { provider, registered, removed } = listenerProvider();
    const handler = (_accounts: Address[]) => {};

    const unsubscribe = onAccountsChanged(provider, handler);

    expect(registered).toEqual([{ event: 'accountsChanged', handler }]);
    expect(removed).toEqual([]);

    unsubscribe();

    expect(removed).toEqual([{ event: 'accountsChanged', handler }]);
  });

  it('is a no-op on providers without event support', () => {
    const bare: Eip1193Provider = { async request() { return null; } };

    const unsubscribe = onAccountsChanged(bare, () => {});
    expect(() => unsubscribe()).not.toThrow();
  });
});

describe('onChainChanged', () => {
  it('registers the handler and the returned unsubscribe removes it', () => {
    const { provider, registered, removed } = listenerProvider();
    const handler = (_chainIdHex: string) => {};

    const unsubscribe = onChainChanged(provider, handler);

    expect(registered).toEqual([{ event: 'chainChanged', handler }]);

    unsubscribe();

    expect(removed).toEqual([{ event: 'chainChanged', handler }]);
  });
});
