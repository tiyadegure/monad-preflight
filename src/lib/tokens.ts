import { getAddress, parseAbi } from 'viem';
import type { Address, TokenInfo } from './types';
import { shortAddress } from './format';

/* ------------------------------------------------------------------ */
/* Token registry — a plain list the app remembers tokens in.          */
/* Native MON is NOT stored here; it is represented by token=undefined */
/* upstream and NATIVE_MON downstream.                                 */
/* ------------------------------------------------------------------ */

export interface TokenRegistry {
  tokens: TokenInfo[];
}

export function createRegistry(custom?: TokenInfo[]): TokenRegistry {
  return { tokens: custom ? [...custom] : [] };
}

/** Match by symbol (case-insensitive) or by address (case-insensitive). */
export function findToken(
  reg: TokenRegistry,
  symbolOrAddress: string,
): TokenInfo | undefined {
  const query = symbolOrAddress.trim().toLowerCase();
  return reg.tokens.find(
    (t) =>
      t.symbol.toLowerCase() === query ||
      (t.address !== null && t.address.toLowerCase() === query),
  );
}

/** Returns a NEW registry; an existing entry with the same address is replaced. */
export function addToken(reg: TokenRegistry, t: TokenInfo): TokenRegistry {
  const kept = reg.tokens.filter((existing) => !sameTokenAddress(existing, t));
  return { tokens: [...kept, t] };
}

function sameTokenAddress(a: TokenInfo, b: TokenInfo): boolean {
  if (a.address === null || b.address === null) {
    return a.address === null && b.address === null;
  }
  return a.address.toLowerCase() === b.address.toLowerCase();
}

/* ------------------------------------------------------------------ */
/* ChainReader — the only thing in this module that touches the chain. */
/* Kept behind an interface so tests can inject a fake.                */
/* ------------------------------------------------------------------ */

export interface ChainReader {
  getNativeBalance(addr: Address): Promise<bigint>;
  fetchTokenInfo(token: Address): Promise<TokenInfo>;
  erc20BalanceOf(token: Address, owner: Address): Promise<bigint>;
}

const ERC20_READ_ABI = parseAbi([
  'function decimals() view returns (uint8)',
  'function balanceOf(address owner) view returns (uint256)',
]);

const STRING_META_ABI = parseAbi([
  'function symbol() view returns (string)',
  'function name() view returns (string)',
]);

// Some very old tokens (e.g. MKR-style) return bytes32 instead of string.
const BYTES32_META_ABI = parseAbi([
  'function symbol() view returns (bytes32)',
  'function name() view returns (bytes32)',
]);

/** Decode a bytes32 hex value as ASCII text, stopping at zero padding. */
function bytes32ToText(hex: string): string {
  if (!hex.startsWith('0x')) return '';
  let out = '';
  for (let i = 2; i + 2 <= hex.length; i += 2) {
    const code = Number.parseInt(hex.slice(i, i + 2), 16);
    if (Number.isNaN(code) || code === 0) break;
    out += String.fromCharCode(code);
  }
  return out.trim();
}

function notATokenError(address: Address): Error {
  return new Error(
    `I could not read token details at ${shortAddress(address)} — ` +
      'that address is probably not a token contract. ' +
      'Double-check where you copied it from.',
  );
}

/**
 * Wrap a viem PublicClient (or anything shaped like one) as a ChainReader.
 * The loose `Function` types let tests pass a tiny fake client.
 */
export function viemChainReader(client: {
  readContract: Function;
  getBalance: Function;
}): ChainReader {
  const read = (args: object): Promise<unknown> => client.readContract(args);

  // Try the modern string ABI first, then the old bytes32 ABI.
  async function readMetaText(
    address: Address,
    field: 'symbol' | 'name',
  ): Promise<string | undefined> {
    try {
      const value = await read({ address, abi: STRING_META_ABI, functionName: field });
      if (typeof value === 'string' && value.length > 0) return value;
    } catch {
      // fall through to the bytes32 attempt
    }
    try {
      const value = await read({ address, abi: BYTES32_META_ABI, functionName: field });
      if (typeof value === 'string') {
        const text = bytes32ToText(value);
        if (text.length > 0) return text;
      }
    } catch {
      // neither ABI worked — caller falls back
    }
    return undefined;
  }

  return {
    async getNativeBalance(addr: Address): Promise<bigint> {
      return (await client.getBalance({ address: addr })) as bigint;
    },

    async fetchTokenInfo(token: Address): Promise<TokenInfo> {
      const address = getAddress(token);

      // decimals() is the one call every real ERC-20 answers.
      let decimals: number;
      try {
        decimals = Number(
          await read({ address, abi: ERC20_READ_ABI, functionName: 'decimals' }),
        );
      } catch {
        throw notATokenError(address);
      }
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 255) {
        throw notATokenError(address);
      }

      // symbol()/name() are optional — fall back to a shortened address.
      const symbol = (await readMetaText(address, 'symbol')) ?? shortAddress(address);
      const name = await readMetaText(address, 'name');

      const info: TokenInfo = { address, symbol, decimals };
      if (name !== undefined) info.name = name;
      return info;
    },

    async erc20BalanceOf(token: Address, owner: Address): Promise<bigint> {
      return (await read({
        address: token,
        abi: ERC20_READ_ABI,
        functionName: 'balanceOf',
        args: [owner],
      })) as bigint;
    },
  };
}
