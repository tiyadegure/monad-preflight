import type { Address, TokenInfo } from './types';

/** 2^256 - 1, the conventional "unlimited" ERC-20 allowance */
export const MAX_UINT256 = (1n << 256n) - 1n;

/** Allowances at or above this share of MAX_UINT256 are treated as unlimited. */
export const UNLIMITED_THRESHOLD = MAX_UINT256 / 2n;

/** "0x1234…abcd" */
export function shortAddress(addr: string): string {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

/**
 * Format a raw token amount for humans: trims trailing zeros,
 * keeps at most `maxFractionDigits` decimals, never uses exponents.
 */
export function formatAmount(
  raw: bigint,
  decimals: number,
  maxFractionDigits = 6,
): string {
  const negative = raw < 0n;
  const abs = negative ? -raw : raw;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, '0');
  frac = frac.slice(0, maxFractionDigits).replace(/0+$/, '');
  const wholeStr = whole.toLocaleString('en-US');
  const body = frac ? `${wholeStr}.${frac}` : wholeStr;
  if (!frac && whole === 0n && abs > 0n) {
    // Tiny amount rounded to zero at this precision — say so honestly.
    return `${negative ? '-' : ''}<0.${'0'.repeat(maxFractionDigits - 1)}1`;
  }
  return negative ? `-${body}` : body;
}

/** "0.5 MON", "12 tUSD" */
export function formatTokenAmount(
  raw: bigint,
  token: TokenInfo,
  maxFractionDigits = 6,
): string {
  return `${formatAmount(raw, token.decimals, maxFractionDigits)} ${token.symbol}`;
}

/**
 * Parse a human decimal string ("0.5") into raw units. Throws on
 * malformed input or more fraction digits than the token supports.
 */
export function parseAmount(value: string, decimals: number): bigint {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!m) throw new Error(`"${value}" is not a valid decimal amount`);
  const [, whole, frac = ''] = m;
  if (frac.length > decimals) {
    throw new Error(
      `"${value}" has more decimal places than this token supports (${decimals})`,
    );
  }
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(frac.padEnd(decimals, '0'));
}

export function isSameAddress(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}

export function isAddressFormat(s: string): s is Address {
  return /^0x[0-9a-fA-F]{40}$/.test(s);
}

export function isHexData(s: string): s is `0x${string}` {
  return /^0x(?:[0-9a-fA-F]{2})*$/.test(s);
}
