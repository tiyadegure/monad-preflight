import { describe, expect, it } from 'vitest';

import type {
  Address,
  PreparedTx,
  RiskFinding,
  SimulationResult,
  TokenInfo,
} from '../src/lib/types';
import { NATIVE_MON } from '../src/lib/types';
import { MAX_UINT256 } from '../src/lib/format';
import { composeExplanation, describeForReceipt } from '../src/lib/explain';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const USER: Address = '0x1111111111111111111111111111111111111111';
// shortAddress(RECIPIENT) === "0x1234…abcd"
const RECIPIENT: Address = '0x123400000000000000000000000000000000abcd';
// shortAddress(SPENDER) === "0xdead…beef"
const SPENDER: Address = '0xdead00000000000000000000000000000000beef';

const TUSD: TokenInfo = {
  address: '0x2222222222222222222222222222222222222222',
  symbol: 'tUSD',
  decimals: 6,
  name: 'Test USD',
};

const HALF_MON = 500_000_000_000_000_000n; // 0.5 MON in raw units
const TEN_TUSD = 10_000_000n; // 10 tUSD at 6 decimals

function makeSim(over: Partial<SimulationResult> = {}): SimulationResult {
  return {
    ok: true,
    gasUsed: 21_000n,
    gasCostWei: 2_100_000_000_000_000n, // 0.0021 MON
    assetChanges: [],
    approvalChanges: [],
    events: [],
    frames: [],
    notes: [],
    ...over,
  };
}

function makeTx(over: Partial<PreparedTx> & Pick<PreparedTx, 'kind'>): PreparedTx {
  return {
    from: USER,
    to: RECIPIENT,
    data: '0x',
    value: 0n,
    summary: 'test summary',
    ...over,
  };
}

const dangerFinding = (id: string): RiskFinding => ({
  id,
  severity: 'danger',
  title: 'Serious problem',
  detail: 'Something risky was found.',
});

const cautionFinding: RiskFinding = {
  id: 'minor-thing',
  severity: 'caution',
  title: 'Small thing',
  detail: 'A minor note.',
};

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('composeExplanation — native transfer', () => {
  const tx = makeTx({
    kind: 'native-transfer',
    value: HALF_MON,
    amountRaw: HALF_MON,
    token: NATIVE_MON,
    counterparty: RECIPIENT,
  });
  const sim = makeSim({
    assetChanges: [
      { party: USER, token: NATIVE_MON, deltaRaw: -HALF_MON },
      { party: RECIPIENT, token: NATIVE_MON, deltaRaw: HALF_MON },
    ],
  });
  const exp = composeExplanation(tx, sim, [], USER);

  it('has the send headline with the human amount', () => {
    expect(exp.headline).toBe('You are about to send 0.5 MON');
  });

  it('lists what the user sends', () => {
    expect(exp.bullets).toContain('You send 0.5 MON');
  });

  it('lists what the counterparty receives, with a short address', () => {
    expect(exp.bullets).toContain('0x1234…abcd receives 0.5 MON');
  });

  it('includes the network fee bullet in MON', () => {
    expect(exp.bullets).toContain(
      'Network fee: about 0.0021 MON (your wallet shows the exact number before you confirm)',
    );
  });

  it('describes both sides in the outcome paragraph', () => {
    expect(exp.outcome).toContain('you send 0.5 MON');
    expect(exp.outcome).toContain('0x1234…abcd receives 0.5 MON');
  });
});

describe('composeExplanation — erc20 transfer with a 6-decimal token', () => {
  const tx = makeTx({
    kind: 'erc20-transfer',
    amountRaw: TEN_TUSD,
    token: TUSD,
    counterparty: RECIPIENT,
  });
  const sim = makeSim({
    assetChanges: [
      { party: USER, token: TUSD, deltaRaw: -TEN_TUSD },
      { party: RECIPIENT, token: TUSD, deltaRaw: TEN_TUSD },
    ],
  });
  const exp = composeExplanation(tx, sim, [], USER);

  it('formats 10000000 raw units as 10 tUSD in the headline', () => {
    expect(exp.headline).toBe('You are about to send 10 tUSD');
  });

  it('shows the user-perspective bullets with token units', () => {
    expect(exp.bullets).toContain('You send 10 tUSD');
    expect(exp.bullets).toContain('0x1234…abcd receives 10 tUSD');
  });
});

describe('composeExplanation — unlimited approve', () => {
  const tx = makeTx({
    kind: 'erc20-approve',
    to: TUSD.address as Address,
    token: TUSD,
    counterparty: SPENDER,
  });
  const sim = makeSim({
    approvalChanges: [
      { owner: USER, spender: SPENDER, token: TUSD, amountRaw: MAX_UINT256, unlimited: true },
    ],
  });
  const exp = composeExplanation(tx, sim, [], USER);

  it('has the "let X spend your token" headline', () => {
    expect(exp.headline).toBe('You are about to let 0xdead…beef spend your tUSD');
  });

  it('warns that the spender can move ALL of the tokens', () => {
    const joined = exp.bullets.join('\n');
    expect(joined).toContain('ALL of your tUSD');
    expect(joined).toContain('until you revoke it');
  });
});

describe('composeExplanation — limited approve', () => {
  const tx = makeTx({
    kind: 'erc20-approve',
    to: TUSD.address as Address,
    token: TUSD,
    counterparty: SPENDER,
  });
  const sim = makeSim({
    approvalChanges: [
      { owner: USER, spender: SPENDER, token: TUSD, amountRaw: 100_000_000n, unlimited: false },
    ],
  });
  const exp = composeExplanation(tx, sim, [], USER);

  it('states the exact spending cap', () => {
    expect(exp.bullets).toContain(
      'After this, 0xdead…beef can spend up to 100 tUSD from your wallet at any time',
    );
  });
});

describe('composeExplanation — revoke', () => {
  const tx = makeTx({
    kind: 'erc20-revoke',
    to: TUSD.address as Address,
    token: TUSD,
    counterparty: SPENDER,
  });
  const sim = makeSim({
    approvalChanges: [
      { owner: USER, spender: SPENDER, token: TUSD, amountRaw: 0n, unlimited: false },
    ],
  });
  const exp = composeExplanation(tx, sim, [], USER);

  it('has the revoke headline', () => {
    expect(exp.headline).toBe("You are about to revoke 0xdead…beef's access to your tUSD");
  });

  it('says the spender can no longer spend the tokens', () => {
    expect(exp.bullets.join('\n')).toContain('0xdead…beef can no longer spend your tUSD');
  });
});

describe('composeExplanation — wrap', () => {
  const WMON: TokenInfo = {
    address: '0x4444444444444444444444444444444444444444',
    symbol: 'WMON',
    decimals: 18,
  };
  const tx = makeTx({
    kind: 'wrap',
    to: WMON.address as Address,
    value: HALF_MON,
    amountRaw: HALF_MON,
    token: WMON,
    counterparty: WMON.address as Address,
  });
  // What the simulator reports for a WETH9-style deposit():
  // native MON leaves the user, WMON arrives (Deposit + Transfer events).
  const sim = makeSim({
    assetChanges: [
      { party: USER, token: NATIVE_MON, deltaRaw: -HALF_MON },
      { party: USER, token: WMON, deltaRaw: HALF_MON },
    ],
  });
  const exp = composeExplanation(tx, sim, [], USER);

  it('has the wrap headline', () => {
    expect(exp.headline).toBe('You are about to wrap 0.5 MON into WMON');
  });

  it('mentions the 1:1 conversion and reversibility in the outcome', () => {
    expect(exp.outcome).toContain('1 MON equals exactly 1 WMON');
    expect(exp.outcome).toContain('convert back at any time');
  });

  it('turns the simulated asset changes into readable bullets', () => {
    expect(exp.bullets).toContain('You send 0.5 MON');
    expect(exp.bullets).toContain('You receive 0.5 WMON');
  });
});

describe('composeExplanation — unwrap', () => {
  const WMON: TokenInfo = {
    address: '0x4444444444444444444444444444444444444444',
    symbol: 'WMON',
    decimals: 18,
  };
  const tx = makeTx({
    kind: 'unwrap',
    to: WMON.address as Address,
    value: 0n,
    amountRaw: 2n * 10n ** 18n,
    token: WMON,
    counterparty: WMON.address as Address,
  });
  const sim = makeSim({
    assetChanges: [
      { party: USER, token: WMON, deltaRaw: -(2n * 10n ** 18n) },
      { party: USER, token: NATIVE_MON, deltaRaw: 2n * 10n ** 18n },
    ],
  });
  const exp = composeExplanation(tx, sim, [], USER);

  it('has the unwrap headline', () => {
    expect(exp.headline).toBe('You are about to unwrap 2 WMON back to MON');
  });

  it('mentions the 1:1 conversion in the outcome', () => {
    expect(exp.outcome).toContain('1 MON equals exactly 1 WMON');
  });

  it('shows WMON leaving and MON coming back as bullets', () => {
    expect(exp.bullets).toContain('You send 2 WMON');
    expect(exp.bullets).toContain('You receive 2 MON');
  });
});

describe('composeExplanation — reverting transaction', () => {
  const tx = makeTx({
    kind: 'erc20-transfer',
    amountRaw: TEN_TUSD,
    token: TUSD,
    counterparty: RECIPIENT,
  });
  const sim = makeSim({
    ok: false,
    revertReason: 'you are trying to send more tUSD than you have',
  });
  const exp = composeExplanation(tx, sim, [], USER);

  it('replaces the headline with a failure warning', () => {
    expect(exp.headline).toContain('would fail');
    expect(exp.headline).toContain('do not send it');
  });

  it('explains the rejection reason and the wasted gas', () => {
    expect(exp.outcome).toContain('you are trying to send more tUSD than you have');
    expect(exp.outcome).toContain('waste gas');
  });
});

describe('composeExplanation — danger warnings bullet', () => {
  const tx = makeTx({ kind: 'raw' });

  it('appears with the danger count when danger findings exist', () => {
    const exp = composeExplanation(
      tx,
      makeSim(),
      [dangerFinding('a'), dangerFinding('b'), cautionFinding],
      USER,
    );
    expect(exp.bullets).toContain('⚠ 2 serious warnings below — read them before signing.');
  });

  it('uses singular wording for exactly one danger finding', () => {
    const exp = composeExplanation(tx, makeSim(), [dangerFinding('a')], USER);
    expect(exp.bullets).toContain('⚠ 1 serious warning below — read it before signing.');
  });

  it('does not appear when there are only caution or no findings', () => {
    const withCaution = composeExplanation(tx, makeSim(), [cautionFinding], USER);
    const withNothing = composeExplanation(tx, makeSim(), [], USER);
    expect(withCaution.bullets.some((b) => b.includes('⚠'))).toBe(false);
    expect(withNothing.bullets.some((b) => b.includes('⚠'))).toBe(false);
  });
});

describe('composeExplanation — simulator notes', () => {
  it('propagates every note verbatim, after the other bullets', () => {
    const notes = [
      'trace unavailable — fell back to a simpler check',
      'token balances were read from a snapshot',
    ];
    const exp = composeExplanation(makeTx({ kind: 'raw' }), makeSim({ notes }), [], USER);
    expect(exp.bullets.slice(-2)).toEqual(notes);
  });
});

describe('composeExplanation — raw transaction headline', () => {
  it('labels it a custom transaction', () => {
    const exp = composeExplanation(makeTx({ kind: 'raw' }), makeSim(), [], USER);
    expect(exp.headline).toBe('You are about to run a custom transaction');
  });
});

describe('describeForReceipt', () => {
  it('reuses the prepared tx summary', () => {
    const tx = makeTx({ kind: 'native-transfer', summary: 'Send 0.5 MON to 0x1234…abcd' });
    expect(describeForReceipt(tx)).toBe('Send 0.5 MON to 0x1234…abcd');
  });
});
