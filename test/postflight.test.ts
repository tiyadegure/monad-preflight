import { describe, expect, it } from 'vitest';
import { comparePostFlight } from '../src/lib/postflight';
import { NATIVE_MON } from '../src/lib/types';
import type {
  Address,
  Hex,
  PostFlightCheck,
  PreparedTx,
  SimulationResult,
  TokenInfo,
} from '../src/lib/types';
import type { MinedReceipt } from '../src/lib/wallet';

/* ------------------------------------------------------------------ */
/* Fixtures and helpers                                                */
/* ------------------------------------------------------------------ */

const ALICE: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOB: Address = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CAROL: Address = '0xcccccccccccccccccccccccccccccccccccccccc';
const TOKEN: Address = '0xdddddddddddddddddddddddddddddddddddddddd';
const OTHER: Address = '0x9999999999999999999999999999999999999999';

/** Mixed-case spellings of the same accounts, for case-insensitivity tests. */
const ALICE_MIXED: Address = `0x${'Aa'.repeat(20)}`;
const TOKEN_MIXED: Address = `0x${'Dd'.repeat(20)}`;

const TRANSFER_TOPIC: Hex =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const SOME_OTHER_TOPIC: Hex =
  '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';

const TUSD: TokenInfo = { address: TOKEN, symbol: 'tUSD', decimals: 6 };

/** Address left-padded to a 32-byte topic (preserves the input's casing). */
const topicAddr = (addr: string): Hex => `0x${'0'.repeat(24)}${addr.slice(2)}`;
/** bigint as a full 32-byte hex word. */
const word = (n: bigint): Hex => `0x${n.toString(16).padStart(64, '0')}`;

function transferLog(
  token: Address,
  from: Address,
  to: Address,
  value: bigint,
): MinedReceipt['logs'][number] {
  return {
    address: token,
    topics: [TRANSFER_TOPIC, topicAddr(from), topicAddr(to)],
    data: word(value),
  };
}

const erc20Tx: PreparedTx = {
  from: ALICE,
  to: TOKEN,
  data: '0xa9059cbb',
  value: 0n,
  kind: 'erc20-transfer',
  summary: 'Send 12 tUSD to 0xbbbb…bbbb',
  token: TUSD,
  amountRaw: 12_000_000n,
  counterparty: BOB,
};

const ONE_MON = 10n ** 18n;

const nativeTx: PreparedTx = {
  from: ALICE,
  to: BOB,
  data: '0x',
  value: ONE_MON,
  kind: 'native-transfer',
  summary: 'Send 1 MON to 0xbbbb…bbbb',
};

function makeSim(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    ok: true,
    gasUsed: 55_000n,
    gasCostWei: 55_000_000_000_000n, // 0.000055 MON
    assetChanges: [],
    approvalChanges: [],
    events: [],
    frames: [],
    notes: [],
    ...overrides,
  };
}

function makeReceipt(overrides: Partial<MinedReceipt> = {}): MinedReceipt {
  return {
    status: 'success',
    gasUsed: 60_000n,
    effectiveGasPrice: 1_000_000_000n, // 1 gwei
    blockNumber: 7n,
    logs: [],
    ...overrides,
  };
}

function getLine(
  check: PostFlightCheck,
  label: string,
): PostFlightCheck['lines'][number] {
  const found = check.lines.find((l) => l.label === label);
  if (!found) {
    const labels = check.lines.map((l) => l.label).join(', ');
    throw new Error(`expected a line labeled "${label}"; got: ${labels}`);
  }
  return found;
}

function hasLine(check: PostFlightCheck, label: string): boolean {
  return check.lines.some((l) => l.label === label);
}

/* ------------------------------------------------------------------ */
/* Happy path                                                          */
/* ------------------------------------------------------------------ */

describe('comparePostFlight — happy path', () => {
  it('matches when the receipt Transfer logs equal the simulated ERC-20 delta', () => {
    const sim = makeSim({
      assetChanges: [
        { party: ALICE, token: TUSD, deltaRaw: -12_000_000n },
        { party: BOB, token: TUSD, deltaRaw: 12_000_000n }, // not the user — ignored
      ],
    });
    const receipt = makeReceipt({
      logs: [transferLog(TOKEN, ALICE, BOB, 12_000_000n)],
    });

    const check = comparePostFlight(erc20Tx, sim, receipt, ALICE);

    expect(check.matched).toBe(true);
    expect(getLine(check, 'Outcome')).toEqual({
      label: 'Outcome',
      simulated: 'will succeed',
      actual: 'succeeded',
      status: 'matched',
    });
    expect(getLine(check, 'tUSD movement')).toEqual({
      label: 'tUSD movement',
      simulated: 'you sent 12 tUSD',
      actual: 'you sent 12 tUSD',
      status: 'matched',
    });
    // Exactly: Outcome, tUSD movement, Network fee. No extra lines for the
    // counterparty's side and no unexpected-token line.
    expect(check.lines.map((l) => l.label)).toEqual([
      'Outcome',
      'tUSD movement',
      'Network fee',
    ]);
  });
});

/* ------------------------------------------------------------------ */
/* Mismatches                                                          */
/* ------------------------------------------------------------------ */

describe('comparePostFlight — ERC-20 mismatches', () => {
  it('flags an amount mismatch and fails the overall check', () => {
    const sim = makeSim({
      assetChanges: [{ party: ALICE, token: TUSD, deltaRaw: -12_000_000n }],
    });
    const receipt = makeReceipt({
      logs: [transferLog(TOKEN, ALICE, BOB, 11_500_000n)],
    });

    const check = comparePostFlight(erc20Tx, sim, receipt, ALICE);

    const line = getLine(check, 'tUSD movement');
    expect(line.status).toBe('mismatched');
    expect(line.simulated).toBe('you sent 12 tUSD');
    expect(line.actual).toBe('you sent 11.5 tUSD');
    expect(check.matched).toBe(false);
  });

  it('treats a predicted movement with no matching Transfer log as zero actual', () => {
    const sim = makeSim({
      assetChanges: [{ party: ALICE, token: TUSD, deltaRaw: -12_000_000n }],
    });
    const receipt = makeReceipt({ logs: [] });

    const check = comparePostFlight(erc20Tx, sim, receipt, ALICE);

    const line = getLine(check, 'tUSD movement');
    expect(line.status).toBe('mismatched');
    expect(line.actual).toBe('you received 0 tUSD');
    expect(check.matched).toBe(false);
  });

  it('reports a Transfer for a token the simulation never predicted', () => {
    const sim = makeSim({ assetChanges: [] });
    const receipt = makeReceipt({
      logs: [transferLog(OTHER, CAROL, ALICE, 5n * 10n ** 18n)],
    });

    const check = comparePostFlight(erc20Tx, sim, receipt, ALICE);

    const line = getLine(check, 'Unexpected token movement');
    expect(line.simulated).toBe('nothing');
    expect(line.actual).toBe('you received 5 token 0x9999…9999');
    expect(line.status).toBe('mismatched');
    expect(check.matched).toBe(false);
  });

  it('does not flag an unpredicted token whose movements cancel out to zero', () => {
    const sim = makeSim({ assetChanges: [] });
    const receipt = makeReceipt({
      logs: [
        transferLog(OTHER, CAROL, ALICE, 5n),
        transferLog(OTHER, ALICE, BOB, 5n),
      ],
    });

    const check = comparePostFlight(erc20Tx, sim, receipt, ALICE);

    expect(hasLine(check, 'Unexpected token movement')).toBe(false);
    expect(check.matched).toBe(true);
  });
});

describe('comparePostFlight — outcome', () => {
  it('flags a mismatch when the simulation promised success but the tx reverted', () => {
    const sim = makeSim({ ok: true });
    const receipt = makeReceipt({ status: 'reverted' });

    const check = comparePostFlight(erc20Tx, sim, receipt, ALICE);

    expect(getLine(check, 'Outcome')).toEqual({
      label: 'Outcome',
      simulated: 'will succeed',
      actual: 'reverted',
      status: 'mismatched',
    });
    expect(check.matched).toBe(false);
  });

  it('flags a mismatch when the simulation predicted failure but the tx succeeded', () => {
    const sim = makeSim({ ok: false, revertReason: 'not enough tokens' });
    const receipt = makeReceipt({ status: 'success' });

    const check = comparePostFlight(erc20Tx, sim, receipt, ALICE);

    const line = getLine(check, 'Outcome');
    expect(line.simulated).toBe('would fail');
    expect(line.actual).toBe('succeeded');
    expect(line.status).toBe('mismatched');
    expect(check.matched).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Native MON                                                          */
/* ------------------------------------------------------------------ */

describe('comparePostFlight — native MON', () => {
  it('shows a matched MON line when the simulated delta is exactly -tx.value and the tx succeeded', () => {
    const sim = makeSim({
      assetChanges: [
        { party: ALICE, token: NATIVE_MON, deltaRaw: -ONE_MON },
        { party: BOB, token: NATIVE_MON, deltaRaw: ONE_MON },
      ],
    });
    const receipt = makeReceipt();

    const check = comparePostFlight(nativeTx, sim, receipt, ALICE);

    expect(getLine(check, 'MON movement')).toEqual({
      label: 'MON movement',
      simulated: 'you sent 1 MON',
      actual: 'you sent 1 MON',
      status: 'matched',
    });
    expect(check.matched).toBe(true);
  });

  it('reports MON as unverified when the delta differs from the tx value', () => {
    // e.g. a contract call that pulled extra native value internally. A
    // receipt cannot show that, so we must say so rather than claim a ✓.
    const sim = makeSim({
      assetChanges: [{ party: ALICE, token: NATIVE_MON, deltaRaw: -2n * ONE_MON }],
    });
    const receipt = makeReceipt();

    const check = comparePostFlight(nativeTx, sim, receipt, ALICE);

    const line = getLine(check, 'MON movement');
    expect(line.status).toBe('unverified');
    // Critically: the "actual" column must NOT echo a number we invented.
    expect(line.actual).toBe('not recorded in the receipt');
    expect(line.note).toBeTruthy();
    expect(check.hasUnverified).toBe(true);
    // Unverified never counts as disagreement.
    expect(check.matched).toBe(true);
  });

  it('never claims a verified MON movement on a reverted transaction', () => {
    const sim = makeSim({
      ok: false,
      assetChanges: [{ party: ALICE, token: NATIVE_MON, deltaRaw: -ONE_MON }],
    });
    const receipt = makeReceipt({ status: 'reverted' });

    const check = comparePostFlight(nativeTx, sim, receipt, ALICE);

    // A reverted transfer moved nothing; success is what proves the move,
    // so this can never read as matched.
    expect(getLine(check, 'MON movement').status).toBe('unverified');
    // Outcome agrees (predicted failure, got revert), so overall still passes.
    expect(check.matched).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* Fee                                                                 */
/* ------------------------------------------------------------------ */

describe('comparePostFlight — network fee', () => {
  it('reports the real fee without claiming the estimate was verified', () => {
    const sim = makeSim(); // estimate: 0.000055 MON
    const receipt = makeReceipt({
      gasUsed: 500_000n,
      effectiveGasPrice: 100_000_000_000n, // 100 gwei -> 0.05 MON actual
    });

    const check = comparePostFlight(erc20Tx, sim, receipt, ALICE);

    const line = getLine(check, 'Network fee');
    expect(line.simulated).toBe('about 0.000055 MON');
    expect(line.actual).toBe('0.05 MON');
    // A ~900x difference must never render as a ✓. Estimates are estimates.
    expect(line.status).toBe('unverified');
    // But a fee difference alone still never fails the overall check.
    expect(check.matched).toBe(true);
  });

  it('appears on every check, even a fully mismatched one', () => {
    const sim = makeSim({ ok: true });
    const receipt = makeReceipt({ status: 'reverted' });

    const check = comparePostFlight(erc20Tx, sim, receipt, ALICE);

    expect(getLine(check, 'Network fee').status).toBe('unverified');
  });
});

/* ------------------------------------------------------------------ */
/* Address-case handling and log filtering                             */
/* ------------------------------------------------------------------ */

describe('comparePostFlight — address case and log filtering', () => {
  it('matches Transfer logs case-insensitively across token and user addresses', () => {
    // Simulation speaks lowercase; the receipt (and caller) use mixed case.
    const sim = makeSim({
      assetChanges: [{ party: ALICE, token: TUSD, deltaRaw: -12_000_000n }],
    });
    const receipt = makeReceipt({
      logs: [transferLog(TOKEN_MIXED, ALICE_MIXED, BOB, 12_000_000n)],
    });

    const check = comparePostFlight(erc20Tx, sim, receipt, ALICE_MIXED);

    expect(getLine(check, 'tUSD movement').status).toBe('matched');
    expect(hasLine(check, 'Unexpected token movement')).toBe(false);
    expect(check.matched).toBe(true);
  });

  it('ignores non-Transfer logs, 4-topic (NFT-style) transfers, and transfers between strangers', () => {
    const sim = makeSim({ assetChanges: [] });
    const receipt = makeReceipt({
      logs: [
        // Wrong event signature — not a Transfer.
        {
          address: OTHER,
          topics: [SOME_OTHER_TOPIC, topicAddr(ALICE), topicAddr(BOB)],
          data: word(5n),
        },
        // 4 topics: an NFT-style Transfer, not an ERC-20 one.
        {
          address: OTHER,
          topics: [TRANSFER_TOPIC, topicAddr(ALICE), topicAddr(BOB), word(1n)],
          data: '0x',
        },
        // ERC-20 Transfer that does not involve the user at all.
        transferLog(TOKEN, CAROL, BOB, 999n),
        // Empty data decodes as a zero amount.
        { address: OTHER, topics: [TRANSFER_TOPIC, topicAddr(ALICE), topicAddr(BOB)], data: '0x' },
      ],
    });

    const check = comparePostFlight(erc20Tx, sim, receipt, ALICE);

    expect(check.lines.map((l) => l.label)).toEqual(['Outcome', 'Network fee']);
    expect(check.matched).toBe(true);
  });
});
