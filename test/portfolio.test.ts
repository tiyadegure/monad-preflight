import { describe, expect, it } from 'vitest';
import { computeExposure } from '../src/lib/portfolio';
import type { Address, TokenInfo } from '../src/lib/types';
import { NATIVE_MON } from '../src/lib/types';
import { MAX_UINT256 } from '../src/lib/format';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const SPENDER_A: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const SPENDER_B: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SPENDER_C: Address = '0xcccccccccccccccccccccccccccccccccccccccc';

const TUSD: TokenInfo = {
  address: '0x1111111111111111111111111111111111111111',
  symbol: 'tUSD',
  decimals: 18,
};
const WMON: TokenInfo = {
  address: '0x2222222222222222222222222222222222222222',
  symbol: 'WMON',
  decimals: 18,
};

function token(symbol: string, address: Address): TokenInfo {
  return { address, symbol, decimals: 18 };
}

function bal(t: TokenInfo, raw: bigint) {
  return { token: t, raw };
}

function appr(t: TokenInfo, spender: Address, allowanceRaw: bigint, unlimited = false) {
  return { token: t, spender, allowanceRaw, unlimited };
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('computeExposure', () => {
  it('reports nothing when there are no approvals', () => {
    const report = computeExposure({
      balances: [bal(TUSD, 100n), bal(NATIVE_MON, 5n * 10n ** 18n)],
      approvals: [],
    });
    expect(report.lines).toEqual([]);
    expect(report.totalTokensAtRisk).toBe(0);
    expect(report.unlimitedCount).toBe(0);
    expect(report.headline).toBe('Nothing in this wallet can be spent by anyone else.');
    expect(report.advice).toEqual([]);
  });

  it('a capped permission below the balance exposes only part', () => {
    const report = computeExposure({
      balances: [bal(TUSD, 100n)],
      approvals: [appr(TUSD, SPENDER_A, 40n)],
    });
    expect(report.lines).toHaveLength(1);
    const line = report.lines[0]!;
    expect(line.balanceRaw).toBe(100n);
    expect(line.exposedRaw).toBe(40n);
    expect(line.fullyExposed).toBe(false);
    expect(line.limitedSpenders).toEqual([SPENDER_A]);
    expect(line.unlimitedSpenders).toEqual([]);
    expect(report.totalTokensAtRisk).toBe(1);
    expect(report.headline).toBe(
      '1 of your tokens can be spent by someone else right now.',
    );
  });

  it('a permission bigger than the balance clamps to the balance', () => {
    const report = computeExposure({
      balances: [bal(TUSD, 100n)],
      approvals: [appr(TUSD, SPENDER_A, 500n)],
    });
    const line = report.lines[0]!;
    expect(line.exposedRaw).toBe(100n);
    expect(line.fullyExposed).toBe(true);
  });

  it('an unlimited permission exposes the whole balance', () => {
    const report = computeExposure({
      balances: [bal(TUSD, 100n)],
      approvals: [appr(TUSD, SPENDER_A, MAX_UINT256, true)],
    });
    const line = report.lines[0]!;
    expect(line.exposedRaw).toBe(100n);
    expect(line.fullyExposed).toBe(true);
    expect(line.unlimitedSpenders).toEqual([SPENDER_A]);
    expect(line.limitedSpenders).toEqual([]);
    expect(report.unlimitedCount).toBe(1);
    expect(report.headline).toBe(
      '1 unlimited permission is open on this wallet. 1 of your tokens can be spent by someone else right now.',
    );
  });

  it('treats a huge cap as unlimited even when the flag is false', () => {
    const report = computeExposure({
      balances: [bal(TUSD, 100n)],
      approvals: [appr(TUSD, SPENDER_A, MAX_UINT256, false)],
    });
    expect(report.lines[0]!.unlimitedSpenders).toEqual([SPENDER_A]);
    expect(report.unlimitedCount).toBe(1);
  });

  it('multiple spenders on one token add up — and clamp at the balance', () => {
    const partial = computeExposure({
      balances: [bal(TUSD, 100n)],
      approvals: [appr(TUSD, SPENDER_A, 30n), appr(TUSD, SPENDER_B, 50n)],
    });
    expect(partial.lines).toHaveLength(1);
    expect(partial.lines[0]!.exposedRaw).toBe(80n);
    expect(partial.lines[0]!.fullyExposed).toBe(false);
    expect(partial.lines[0]!.limitedSpenders).toHaveLength(2);

    const clamped = computeExposure({
      balances: [bal(TUSD, 100n)],
      approvals: [
        appr(TUSD, SPENDER_A, 30n),
        appr(TUSD, SPENDER_B, 50n),
        appr(TUSD, SPENDER_C, 40n),
      ],
    });
    expect(clamped.lines[0]!.exposedRaw).toBe(100n);
    expect(clamped.lines[0]!.fullyExposed).toBe(true);
    expect(clamped.totalTokensAtRisk).toBe(1);
  });

  it('never lists native MON, even when a bogus record references it', () => {
    const report = computeExposure({
      balances: [bal(NATIVE_MON, 5n * 10n ** 18n)],
      approvals: [appr(NATIVE_MON, SPENDER_A, 10n ** 18n, false)],
    });
    expect(report.lines).toEqual([]);
    expect(report.headline).toBe('Nothing in this wallet can be spent by anyone else.');
  });

  it('matches tokens by address regardless of letter case', () => {
    const lower = token('MIX', '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd');
    const upper = token('MIX', '0xABCDEFABCDEFABCDEFABCDEFABCDEFABCDEFABCD' as Address);
    const report = computeExposure({
      balances: [bal(upper, 100n)],
      approvals: [appr(lower, SPENDER_A, 70n)],
    });
    expect(report.lines).toHaveLength(1);
    expect(report.lines[0]!.balanceRaw).toBe(100n);
    expect(report.lines[0]!.exposedRaw).toBe(70n);
  });

  it('sorts fully exposed first, then unlimited spenders, then symbol', () => {
    const zzz = token('ZZZ', '0x3333333333333333333333333333333333333333');
    const aaa = token('AAA', '0x4444444444444444444444444444444444444444');
    const bbb = token('BBB', '0x5555555555555555555555555555555555555555');
    const mmm = token('MMM', '0x6666666666666666666666666666666666666666');
    const report = computeExposure({
      balances: [bal(mmm, 10n), bal(bbb, 10n), bal(aaa, 10n), bal(zzz, 10n)],
      approvals: [
        appr(mmm, SPENDER_A, 3n), // partial — goes last
        appr(bbb, SPENDER_A, 999n), // fully exposed, no unlimited
        appr(aaa, SPENDER_A, 10n), // fully exposed, no unlimited
        appr(zzz, SPENDER_A, MAX_UINT256, true), // fully exposed + unlimited — first
      ],
    });
    expect(report.lines.map((l) => l.token.symbol)).toEqual(['ZZZ', 'AAA', 'BBB', 'MMM']);
  });

  it('gets singular and plural right in the headline', () => {
    const two = computeExposure({
      balances: [bal(TUSD, 100n), bal(WMON, 100n)],
      approvals: [appr(TUSD, SPENDER_A, 10n), appr(WMON, SPENDER_B, 10n)],
    });
    expect(two.headline).toBe('2 of your tokens can be spent by someone else right now.');

    const twoUnlimited = computeExposure({
      balances: [bal(TUSD, 100n), bal(WMON, 100n)],
      approvals: [
        appr(TUSD, SPENDER_A, MAX_UINT256, true),
        appr(WMON, SPENDER_B, MAX_UINT256, true),
      ],
    });
    expect(twoUnlimited.unlimitedCount).toBe(2);
    expect(twoUnlimited.headline).toBe(
      '2 unlimited permissions are open on this wallet. 2 of your tokens can be spent by someone else right now.',
    );
  });

  it('advice recommends revoking, mentions the fee, and warns permissions stay open', () => {
    const report = computeExposure({
      balances: [bal(TUSD, 100n)],
      approvals: [appr(TUSD, SPENDER_A, MAX_UINT256, true)],
    });
    const all = report.advice.join(' ');
    expect(all).toMatch(/revok/i);
    expect(all).toMatch(/network fee/i);
    expect(all).toMatch(/stay open/i);
    expect(all).toMatch(/until you cancel/i);
  });

  it('still lists a token we verified holds nothing, and says to revoke before funding', () => {
    const report = computeExposure({
      // The balance was actually read, and it is zero.
      balances: [{ token: TUSD, raw: 0n }],
      approvals: [appr(TUSD, SPENDER_A, MAX_UINT256, true)],
    });
    expect(report.lines).toHaveLength(1);
    const line = report.lines[0]!;
    expect(line.balanceKnown).toBe(true);
    expect(line.balanceRaw).toBe(0n);
    expect(line.exposedRaw).toBe(0n);
    expect(line.fullyExposed).toBe(false);
    expect(line.unlimitedSpenders).toEqual([SPENDER_A]);
    expect(report.totalTokensAtRisk).toBe(0);
    expect(report.unlimitedCount).toBe(1);
    expect(report.headline).toBe('1 unlimited permission is open on this wallet.');
    expect(report.advice.join(' ')).toMatch(/before you add funds/i);
  });

  it('never claims the user holds nothing when the balance was never read', () => {
    const report = computeExposure({
      // The token has an approval but is absent from the balances list —
      // unchecked, not empty. Saying "you hold none" here would hide real
      // exposure behind a reassuring sentence.
      balances: [],
      approvals: [appr(TUSD, SPENDER_A, MAX_UINT256, true)],
    });
    const line = report.lines[0]!;
    expect(line.balanceKnown).toBe(false);
    const advice = report.advice.join(' ');
    expect(advice).not.toMatch(/do not hold any/i);
    expect(advice).toMatch(/could not read your balance/i);
    expect(advice).toMatch(/cannot tell you how much is at risk/i);
  });
});
