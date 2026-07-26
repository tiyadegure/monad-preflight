import { describe, expect, it } from 'vitest';
import { encodeFunctionData, getAddress, parseAbi } from 'viem';
import type { Address, ParsedIntent, TokenInfo } from '../src/lib/types';
import { MAX_UINT256, shortAddress } from '../src/lib/format';
import {
  addToken,
  createRegistry,
  findToken,
  viemChainReader,
  type ChainReader,
} from '../src/lib/tokens';
import { BuildError, GAS_HEADROOM_WEI, buildTx } from '../src/lib/txbuilder';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const FROM = getAddress('0x1111111111111111111111111111111111111111');
const RECIPIENT = getAddress('0x1234567890123456789012345678901234567890');
const SPENDER = getAddress('0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
const TUSD_ADDRESS = getAddress('0x2222222222222222222222222222222222222222');
const UNKNOWN_ADDRESS = getAddress('0x3333333333333333333333333333333333333333');

// 6 decimals on purpose — catches "assumed 18 decimals" bugs.
const TUSD: TokenInfo = {
  address: TUSD_ADDRESS,
  symbol: 'tUSD',
  decimals: 6,
  name: 'Test USD',
};

const ERC20_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

function makeDeps(overrides: Partial<ChainReader> = {}) {
  const reader: ChainReader = {
    getNativeBalance: async () => 0n,
    fetchTokenInfo: async () => {
      throw new Error('fetchTokenInfo should not be called in this test');
    },
    erc20BalanceOf: async () => 0n,
    ...overrides,
  };
  return { registry: createRegistry([TUSD]), reader };
}

function intent(
  partial: Partial<ParsedIntent> & { action: ParsedIntent['action'] },
): ParsedIntent {
  return { notes: [], ...partial };
}

/* ------------------------------------------------------------------ */
/* send                                                                */
/* ------------------------------------------------------------------ */

describe('buildTx: send native MON', () => {
  it('builds a plain value transfer', async () => {
    const tx = await buildTx(
      intent({ action: 'send', amount: { value: '0.5' }, counterparty: RECIPIENT }),
      FROM,
      makeDeps(),
    );
    expect(tx.kind).toBe('native-transfer');
    expect(tx.to).toBe(RECIPIENT);
    expect(tx.data).toBe('0x');
    expect(tx.value).toBe(500000000000000000n);
    expect(tx.amountRaw).toBe(500000000000000000n);
    expect(tx.summary).toBe(`Send 0.5 MON to ${shortAddress(RECIPIENT)}`);
  });

  it('allows sending 0 (risk engine flags it later)', async () => {
    const tx = await buildTx(
      intent({ action: 'send', amount: { value: '0' }, counterparty: RECIPIENT }),
      FROM,
      makeDeps(),
    );
    expect(tx.value).toBe(0n);
    expect(tx.summary).toBe(`Send 0 MON to ${shortAddress(RECIPIENT)}`);
  });

  it('send all keeps 0.02 MON back for gas and says so', async () => {
    const oneMon = 1000000000000000000n;
    const tx = await buildTx(
      intent({ action: 'send', amount: { all: true }, counterparty: RECIPIENT }),
      FROM,
      makeDeps({ getNativeBalance: async () => oneMon }),
    );
    expect(tx.value).toBe(oneMon - GAS_HEADROOM_WEI);
    expect(tx.value).toBe(980000000000000000n);
    expect(tx.summary).toBe(
      `Send 0.98 MON to ${shortAddress(RECIPIENT)} (keeping 0.02 MON back for gas)`,
    );
  });

  it('send all fails plainly when balance cannot cover the gas reserve', async () => {
    const build = buildTx(
      intent({ action: 'send', amount: { all: true }, counterparty: RECIPIENT }),
      FROM,
      makeDeps({ getNativeBalance: async () => GAS_HEADROOM_WEI }),
    );
    await expect(build).rejects.toThrow(BuildError);
    await expect(build).rejects.toThrow(/gas/);
  });
});

describe('buildTx: send ERC-20', () => {
  it('builds exact transfer() calldata with 6-decimal math', async () => {
    const tx = await buildTx(
      intent({
        action: 'send',
        token: 'tUSD',
        amount: { value: '10' },
        counterparty: RECIPIENT,
      }),
      FROM,
      makeDeps(),
    );
    expect(tx.kind).toBe('erc20-transfer');
    expect(tx.to).toBe(TUSD_ADDRESS);
    expect(tx.value).toBe(0n);
    expect(tx.amountRaw).toBe(10_000_000n); // 10 * 10^6, NOT 10^18
    expect(tx.data).toBe(
      encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [RECIPIENT, 10_000_000n],
      }),
    );
    expect(tx.summary).toBe(`Send 10 tUSD to ${shortAddress(RECIPIENT)}`);
  });

  it('handles fractional amounts at 6 decimals (0.5 tUSD = 500000 raw)', async () => {
    const tx = await buildTx(
      intent({
        action: 'send',
        token: 'tusd', // symbol lookup is case-insensitive
        amount: { value: '0.5' },
        counterparty: RECIPIENT,
      }),
      FROM,
      makeDeps(),
    );
    expect(tx.amountRaw).toBe(500_000n);
  });

  it('send all uses the on-chain balance', async () => {
    const tx = await buildTx(
      intent({
        action: 'send',
        token: 'tUSD',
        amount: { all: true },
        counterparty: RECIPIENT,
      }),
      FROM,
      makeDeps({ erc20BalanceOf: async () => 123_456_789n }),
    );
    expect(tx.amountRaw).toBe(123_456_789n);
    expect(tx.data).toBe(
      encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [RECIPIENT, 123_456_789n],
      }),
    );
  });

  it('send all fails plainly when the token balance is zero', async () => {
    await expect(
      buildTx(
        intent({
          action: 'send',
          token: 'tUSD',
          amount: { all: true },
          counterparty: RECIPIENT,
        }),
        FROM,
        makeDeps({ erc20BalanceOf: async () => 0n }),
      ),
    ).rejects.toThrow('You do not have any tUSD to send.');
  });

  it('resolves a token given as an address from the registry without fetching', async () => {
    const tx = await buildTx(
      intent({
        action: 'send',
        token: TUSD_ADDRESS.toLowerCase(),
        amount: { value: '1' },
        counterparty: RECIPIENT,
      }),
      FROM,
      makeDeps(), // default fetchTokenInfo throws if called
    );
    expect(tx.token?.symbol).toBe('tUSD');
    expect(tx.amountRaw).toBe(1_000_000n);
  });

  it('fetches an unknown token address from the chain reader', async () => {
    const tx = await buildTx(
      intent({
        action: 'send',
        token: UNKNOWN_ADDRESS,
        amount: { value: '1' },
        counterparty: RECIPIENT,
      }),
      FROM,
      makeDeps({
        fetchTokenInfo: async (addr: Address) => ({
          address: addr,
          symbol: 'NEW',
          decimals: 18,
        }),
      }),
    );
    expect(tx.token?.symbol).toBe('NEW');
    expect(tx.to).toBe(UNKNOWN_ADDRESS);
    expect(tx.amountRaw).toBe(1000000000000000000n);
  });
});

/* ------------------------------------------------------------------ */
/* approve / revoke                                                    */
/* ------------------------------------------------------------------ */

describe('buildTx: approve', () => {
  it('builds a limited approval with exact calldata', async () => {
    const tx = await buildTx(
      intent({
        action: 'approve',
        token: 'tUSD',
        amount: { value: '100' },
        counterparty: SPENDER,
      }),
      FROM,
      makeDeps(),
    );
    expect(tx.kind).toBe('erc20-approve');
    expect(tx.to).toBe(TUSD_ADDRESS);
    expect(tx.value).toBe(0n);
    expect(tx.amountRaw).toBe(100_000_000n);
    expect(tx.data).toBe(
      encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SPENDER, 100_000_000n],
      }),
    );
    expect(tx.summary).toBe(`Allow ${shortAddress(SPENDER)} to spend up to 100 tUSD`);
  });

  it('unlimited approval encodes MAX_UINT256', async () => {
    const tx = await buildTx(
      intent({
        action: 'approve',
        token: 'tUSD',
        amount: { unlimited: true },
        counterparty: SPENDER,
      }),
      FROM,
      makeDeps(),
    );
    expect(tx.kind).toBe('erc20-approve');
    expect(tx.amountRaw).toBe(MAX_UINT256);
    expect(tx.data).toBe(
      encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SPENDER, MAX_UINT256],
      }),
    );
    expect(tx.summary).toBe(
      `Allow ${shortAddress(SPENDER)} to spend ALL of your tUSD (unlimited)`,
    );
  });

  it('approving 0 is built as a revoke, with a note in the summary', async () => {
    const tx = await buildTx(
      intent({
        action: 'approve',
        token: 'tUSD',
        amount: { value: '0' },
        counterparty: SPENDER,
      }),
      FROM,
      makeDeps(),
    );
    expect(tx.kind).toBe('erc20-revoke');
    expect(tx.amountRaw).toBe(0n);
    expect(tx.data).toBe(
      encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SPENDER, 0n],
      }),
    );
    expect(tx.summary).toContain('Revoke');
    expect(tx.summary).toContain('access');
  });

  it('rejects approving native MON with a plain explanation', async () => {
    const build = buildTx(
      intent({ action: 'approve', amount: { value: '5' }, counterparty: SPENDER }),
      FROM,
      makeDeps(),
    );
    await expect(build).rejects.toThrow(BuildError);
    await expect(build).rejects.toThrow(/MON.*cannot be approved/);
  });

  it('requires an amount unless unlimited', async () => {
    await expect(
      buildTx(
        intent({ action: 'approve', token: 'tUSD', counterparty: SPENDER }),
        FROM,
        makeDeps(),
      ),
    ).rejects.toThrow(/amount|unlimited/i);
  });
});

describe('buildTx: revoke', () => {
  it('builds approve(spender, 0) with kind erc20-revoke', async () => {
    const tx = await buildTx(
      intent({ action: 'revoke', token: 'tUSD', counterparty: SPENDER }),
      FROM,
      makeDeps(),
    );
    expect(tx.kind).toBe('erc20-revoke');
    expect(tx.to).toBe(TUSD_ADDRESS);
    expect(tx.value).toBe(0n);
    expect(tx.amountRaw).toBe(0n);
    expect(tx.data).toBe(
      encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'approve',
        args: [SPENDER, 0n],
      }),
    );
    expect(tx.summary).toBe(`Revoke ${shortAddress(SPENDER)}'s access to your tUSD`);
  });

  it('rejects revoking native MON', async () => {
    await expect(
      buildTx(intent({ action: 'revoke', counterparty: SPENDER }), FROM, makeDeps()),
    ).rejects.toThrow(BuildError);
  });
});

/* ------------------------------------------------------------------ */
/* wrap / unwrap                                                       */
/* ------------------------------------------------------------------ */

const WMON_ADDRESS = getAddress('0x4444444444444444444444444444444444444444');
const ONE_MON = 1_000_000_000_000_000_000n;

const WMON_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
]);

function makeWrapDeps(overrides: Partial<ChainReader> = {}) {
  return { ...makeDeps(overrides), wmon: WMON_ADDRESS };
}

describe('buildTx: wrap MON into WMON', () => {
  it('builds deposit() with the amount as value and exact calldata', async () => {
    const tx = await buildTx(
      intent({ action: 'wrap', amount: { value: '0.5' } }),
      FROM,
      makeWrapDeps(),
    );
    expect(tx.kind).toBe('wrap');
    expect(tx.to).toBe(WMON_ADDRESS);
    expect(tx.data).toBe('0xd0e30db0'); // deposit() selector, nothing more
    expect(tx.value).toBe(ONE_MON / 2n);
    expect(tx.amountRaw).toBe(ONE_MON / 2n);
    expect(tx.token).toEqual({ address: WMON_ADDRESS, symbol: 'WMON', decimals: 18 });
    expect(tx.counterparty).toBe(WMON_ADDRESS);
    expect(tx.summary).toBe('Wrap 0.5 MON into WMON');
  });

  it('fails plainly when the network has no WMON contract', async () => {
    const build = buildTx(
      intent({ action: 'wrap', amount: { value: '1' } }),
      FROM,
      makeDeps(), // no wmon field — like the testnet
    );
    await expect(build).rejects.toThrow(BuildError);
    await expect(build).rejects.toThrow('Wrapping is not available on this network yet.');
  });

  it('rejects wrapping "all" so gas money is never wiped out', async () => {
    const build = buildTx(
      intent({ action: 'wrap', amount: { all: true } }),
      FROM,
      makeWrapDeps(),
    );
    await expect(build).rejects.toThrow(BuildError);
    await expect(build).rejects.toThrow(/fee/i);
  });

  it('requires an amount', async () => {
    await expect(
      buildTx(intent({ action: 'wrap' }), FROM, makeWrapDeps()),
    ).rejects.toThrow(/how much/i);
  });
});

describe('buildTx: unwrap WMON back to MON', () => {
  it('builds withdraw(amount) calldata with zero value', async () => {
    const tx = await buildTx(
      intent({ action: 'unwrap', amount: { value: '2' } }),
      FROM,
      makeWrapDeps(),
    );
    expect(tx.kind).toBe('unwrap');
    expect(tx.to).toBe(WMON_ADDRESS);
    expect(tx.value).toBe(0n);
    expect(tx.amountRaw).toBe(2n * ONE_MON);
    expect(tx.data).toBe(
      encodeFunctionData({
        abi: WMON_ABI,
        functionName: 'withdraw',
        args: [2n * ONE_MON],
      }),
    );
    expect(tx.token).toEqual({ address: WMON_ADDRESS, symbol: 'WMON', decimals: 18 });
    expect(tx.counterparty).toBe(WMON_ADDRESS);
    expect(tx.summary).toBe('Unwrap 2 WMON back to MON');
  });

  it('unwrap all reads the sender\'s WMON balance and uses it exactly', async () => {
    const calls: [Address, Address][] = [];
    const tx = await buildTx(
      intent({ action: 'unwrap', amount: { all: true } }),
      FROM,
      makeWrapDeps({
        erc20BalanceOf: async (token: Address, owner: Address) => {
          calls.push([token, owner]);
          return 3n * ONE_MON;
        },
      }),
    );
    expect(calls).toEqual([[WMON_ADDRESS, FROM]]);
    expect(tx.amountRaw).toBe(3n * ONE_MON);
    expect(tx.data).toBe(
      encodeFunctionData({
        abi: WMON_ABI,
        functionName: 'withdraw',
        args: [3n * ONE_MON],
      }),
    );
    expect(tx.summary).toBe('Unwrap 3 WMON back to MON');
  });

  it('unwrap all fails plainly when the WMON balance is zero', async () => {
    await expect(
      buildTx(
        intent({ action: 'unwrap', amount: { all: true } }),
        FROM,
        makeWrapDeps({ erc20BalanceOf: async () => 0n }),
      ),
    ).rejects.toThrow('You do not have any WMON to unwrap.');
  });

  it('fails plainly when the network has no WMON contract', async () => {
    await expect(
      buildTx(intent({ action: 'unwrap', amount: { value: '1' } }), FROM, makeDeps()),
    ).rejects.toThrow('Wrapping is not available on this network yet.');
  });
});

/* ------------------------------------------------------------------ */
/* raw                                                                 */
/* ------------------------------------------------------------------ */

describe('buildTx: raw', () => {
  it('accepts a hex value in wei', async () => {
    const tx = await buildTx(
      intent({
        action: 'raw',
        raw: { to: RECIPIENT, data: '0xdeadbeef', value: '0x0de0b6b3a7640000' },
      }),
      FROM,
      makeDeps(),
    );
    expect(tx.kind).toBe('raw');
    expect(tx.to).toBe(RECIPIENT);
    expect(tx.data).toBe('0xdeadbeef');
    expect(tx.value).toBe(1000000000000000000n); // 1 MON in wei
    expect(tx.summary).toBe(`Custom transaction to ${shortAddress(RECIPIENT)}`);
  });

  it('treats a decimal value as MON units and defaults data to 0x', async () => {
    const tx = await buildTx(
      intent({ action: 'raw', raw: { to: RECIPIENT, value: '1.5' } }),
      FROM,
      makeDeps(),
    );
    expect(tx.data).toBe('0x');
    expect(tx.value).toBe(1500000000000000000n);
  });

  it('defaults a missing value to 0', async () => {
    const tx = await buildTx(
      intent({ action: 'raw', raw: { to: RECIPIENT } }),
      FROM,
      makeDeps(),
    );
    expect(tx.value).toBe(0n);
  });

  it('rejects an invalid to-address', async () => {
    await expect(
      buildTx(
        intent({ action: 'raw', raw: { to: '0x1234' } }),
        FROM,
        makeDeps(),
      ),
    ).rejects.toThrow(BuildError);
  });

  it('rejects malformed data', async () => {
    await expect(
      buildTx(
        intent({ action: 'raw', raw: { to: RECIPIENT, data: '0x123' } }), // odd length
        FROM,
        makeDeps(),
      ),
    ).rejects.toThrow(/data/i);
  });
});

/* ------------------------------------------------------------------ */
/* error messages                                                      */
/* ------------------------------------------------------------------ */

describe('buildTx: plain-language errors', () => {
  it('unknown symbol asks for the contract address', async () => {
    await expect(
      buildTx(
        intent({
          action: 'send',
          token: 'WETH',
          amount: { value: '1' },
          counterparty: RECIPIENT,
        }),
        FROM,
        makeDeps(),
      ),
    ).rejects.toThrow(
      'I do not know the token "WETH" yet — paste its contract address once and I will remember it.',
    );
  });

  it('invalid counterparty address is a BuildError', async () => {
    const build = buildTx(
      intent({ action: 'send', amount: { value: '1' }, counterparty: 'banana' }),
      FROM,
      makeDeps(),
    );
    await expect(build).rejects.toThrow(BuildError);
    await expect(build).rejects.toThrow(/not a valid/);
  });

  it('missing counterparty is a BuildError', async () => {
    await expect(
      buildTx(intent({ action: 'send', amount: { value: '1' } }), FROM, makeDeps()),
    ).rejects.toThrow(/recipient/);
  });
});

/* ------------------------------------------------------------------ */
/* token registry                                                      */
/* ------------------------------------------------------------------ */

describe('token registry', () => {
  it('finds by symbol or address, case-insensitive', () => {
    const reg = createRegistry([TUSD]);
    expect(findToken(reg, 'TUSD')).toBe(TUSD);
    expect(findToken(reg, TUSD_ADDRESS.toLowerCase())).toBe(TUSD);
    expect(findToken(reg, 'nope')).toBeUndefined();
  });

  it('addToken returns a new registry and replaces same-address entries', () => {
    const reg = createRegistry([TUSD]);
    const updated: TokenInfo = { ...TUSD, symbol: 'tUSD2' };
    const next = addToken(reg, updated);
    expect(next).not.toBe(reg);
    expect(reg.tokens).toHaveLength(1); // original untouched
    expect(next.tokens).toHaveLength(1); // replaced, not appended
    expect(next.tokens[0]?.symbol).toBe('tUSD2');
  });
});

/* ------------------------------------------------------------------ */
/* viemChainReader (fake client — no network)                          */
/* ------------------------------------------------------------------ */

type ReadArgs = {
  functionName: string;
  abi: { name?: string; outputs?: { type: string }[] }[];
};

describe('viemChainReader', () => {
  it('reads string symbol/name and decimals', async () => {
    const reader = viemChainReader({
      readContract: async ({ functionName }: ReadArgs) => {
        if (functionName === 'decimals') return 6;
        if (functionName === 'symbol') return 'tUSD';
        if (functionName === 'name') return 'Test USD';
        throw new Error(`unexpected call: ${functionName}`);
      },
      getBalance: async () => 42n,
    });
    const info = await reader.fetchTokenInfo(TUSD_ADDRESS);
    expect(info).toEqual({
      address: TUSD_ADDRESS,
      symbol: 'tUSD',
      decimals: 6,
      name: 'Test USD',
    });
    expect(await reader.getNativeBalance(FROM)).toBe(42n);
  });

  it('falls back to bytes32 symbol and trims zero padding', async () => {
    const bytes32Mkr = '0x4d4b52' + '00'.repeat(29); // "MKR" zero-padded
    const reader = viemChainReader({
      readContract: async ({ functionName, abi }: ReadArgs) => {
        if (functionName === 'decimals') return 18;
        const outType = abi.find((f) => f.name === functionName)?.outputs?.[0]?.type;
        if (functionName === 'symbol') {
          if (outType === 'string') throw new Error('execution reverted');
          return bytes32Mkr;
        }
        throw new Error('no name()');
      },
      getBalance: async () => 0n,
    });
    const info = await reader.fetchTokenInfo(UNKNOWN_ADDRESS);
    expect(info.symbol).toBe('MKR');
    expect(info.decimals).toBe(18);
    expect(info.name).toBeUndefined();
  });

  it('falls back to a shortened address when symbol is unreadable', async () => {
    const reader = viemChainReader({
      readContract: async ({ functionName }: ReadArgs) => {
        if (functionName === 'decimals') return 8;
        throw new Error('no metadata at all');
      },
      getBalance: async () => 0n,
    });
    const info = await reader.fetchTokenInfo(UNKNOWN_ADDRESS);
    expect(info.symbol).toBe(shortAddress(UNKNOWN_ADDRESS));
  });

  it('explains plainly when decimals() fails (probably not a token)', async () => {
    const reader = viemChainReader({
      readContract: async () => {
        throw new Error('execution reverted');
      },
      getBalance: async () => 0n,
    });
    await expect(reader.fetchTokenInfo(UNKNOWN_ADDRESS)).rejects.toThrow(
      /probably not a token/,
    );
  });
});
