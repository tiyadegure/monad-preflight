import { describe, expect, it, vi } from 'vitest';
import { compareSimulations } from '../src/lib/drift';
import type { DriftReport } from '../src/lib/drift';
import type {
  Address,
  ApprovalChange,
  AssetChange,
  SimulationResult,
  TokenInfo,
} from '../src/lib/types';
import { NATIVE_MON } from '../src/lib/types';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const SENDER: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECIPIENT: Address = '0x2222222222222222222222222222222222222222';
const SPENDER: Address = '0x4444444444444444444444444444444444444444';
const TOKEN_ADDR: Address = '0x3333333333333333333333333333333333333333';

const TUSD: TokenInfo = { address: TOKEN_ADDR, symbol: 'tUSD', decimals: 18 };

const MON = 10n ** 18n;
const HALF_MON = MON / 2n;

function makeSim(overrides: Partial<SimulationResult> = {}): SimulationResult {
  return {
    ok: true,
    gasUsed: 21_000n,
    gasCostWei: 21_000n * 10n ** 9n,
    assetChanges: [
      { party: SENDER, token: NATIVE_MON, deltaRaw: -HALF_MON },
      { party: RECIPIENT, token: NATIVE_MON, deltaRaw: HALF_MON },
    ],
    approvalChanges: [],
    events: [],
    frames: [],
    notes: ['Your wallet will show the exact network fee before you sign.'],
    ...overrides,
  };
}

function makeApproval(overrides: Partial<ApprovalChange> = {}): ApprovalChange {
  return {
    owner: SENDER,
    spender: SPENDER,
    token: TUSD,
    amountRaw: 100n * MON,
    unlimited: false,
    ...overrides,
  };
}

/** Deterministic stub formatter: "<raw> <symbol>". */
function makeFormatToken() {
  return vi.fn((raw: bigint, token: TokenInfo) => `${raw.toString()} ${token.symbol}`);
}

function compare(
  before: SimulationResult,
  after: SimulationResult,
  formatToken = makeFormatToken(),
): DriftReport {
  return compareSimulations(before, after, {
    simulatedAtMs: 0,
    nowMs: 30_000,
    formatToken,
  });
}

/* ------------------------------------------------------------------ */
/* Level: none                                                         */
/* ------------------------------------------------------------------ */

describe('compareSimulations — none', () => {
  it('reports none for two identical simulations', () => {
    const report = compare(makeSim(), makeSim());
    expect(report.level).toBe('none');
    expect(report.headline).toBe('Nothing changed — the plan is still accurate.');
    expect(report.changes).toEqual([]);
  });

  it('ignores ordering: reordered but identical arrays are none', () => {
    const approvals = [
      makeApproval(),
      makeApproval({ spender: RECIPIENT, amountRaw: 5n * MON }),
    ];
    const assets: AssetChange[] = [
      { party: SENDER, token: NATIVE_MON, deltaRaw: -HALF_MON },
      { party: SENDER, token: TUSD, deltaRaw: -MON },
      { party: RECIPIENT, token: TUSD, deltaRaw: MON },
    ];
    const before = makeSim({ assetChanges: assets, approvalChanges: approvals });
    const after = makeSim({
      assetChanges: [...assets].reverse(),
      approvalChanges: [...approvals].reverse(),
    });
    const report = compare(before, after);
    expect(report.level).toBe('none');
    expect(report.changes).toEqual([]);
  });

  it('treats a delta wobble of 0.5% as not material', () => {
    const before = makeSim({
      assetChanges: [{ party: SENDER, token: NATIVE_MON, deltaRaw: -10_000n }],
    });
    const after = makeSim({
      assetChanges: [{ party: SENDER, token: NATIVE_MON, deltaRaw: -10_050n }],
    });
    const report = compare(before, after);
    expect(report.level).not.toBe('material');
    expect(['none', 'cosmetic']).toContain(report.level);
  });
});

/* ------------------------------------------------------------------ */
/* Level: cosmetic                                                     */
/* ------------------------------------------------------------------ */

describe('compareSimulations — cosmetic', () => {
  it('reports cosmetic when only gas moved', () => {
    const before = makeSim();
    const after = makeSim({ gasUsed: 30_000n, gasCostWei: 30_000n * 10n ** 9n });
    const report = compare(before, after);
    expect(report.level).toBe('cosmetic');
    expect(report.headline).toBe(
      'Only the network fee estimate moved. What the transaction does is unchanged.',
    );
    expect(report.changes).toContain('The network fee estimate went up.');
  });

  it('says the fee went down when it dropped', () => {
    const before = makeSim();
    const after = makeSim({ gasUsed: 15_000n, gasCostWei: 15_000n * 10n ** 9n });
    const report = compare(before, after);
    expect(report.level).toBe('cosmetic');
    expect(report.changes).toContain('The network fee estimate went down.');
  });

  it('reports cosmetic when only the notes list differs', () => {
    const before = makeSim({ notes: ['note one'] });
    const after = makeSim({ notes: ['note one', 'note two'] });
    const report = compare(before, after);
    expect(report.level).toBe('cosmetic');
    expect(report.changes.length).toBe(1);
  });
});

/* ------------------------------------------------------------------ */
/* Level: material                                                     */
/* ------------------------------------------------------------------ */

describe('compareSimulations — material', () => {
  const MATERIAL_HEADLINE =
    'The chain moved while you were reading — this transaction no longer does the same thing.';

  it('flags an outcome flip from ok to failing', () => {
    const report = compare(makeSim({ ok: true }), makeSim({ ok: false, assetChanges: [] }));
    expect(report.level).toBe('material');
    expect(report.headline).toBe(MATERIAL_HEADLINE);
    expect(report.changes.some((c) => c.includes('would now fail'))).toBe(true);
  });

  it('flags an outcome flip from failing to ok', () => {
    const report = compare(makeSim({ ok: false, assetChanges: [] }), makeSim({ ok: true }));
    expect(report.level).toBe('material');
    expect(report.changes.some((c) => c.includes('would now go through'))).toBe(true);
  });

  it('flags a delta that grew by 40%', () => {
    const before = makeSim();
    const after = makeSim({
      assetChanges: [
        { party: SENDER, token: NATIVE_MON, deltaRaw: (-HALF_MON * 140n) / 100n },
        { party: RECIPIENT, token: NATIVE_MON, deltaRaw: (HALF_MON * 140n) / 100n },
      ],
    });
    const report = compare(before, after);
    expect(report.level).toBe('material');
    expect(report.changes.some((c) => c.includes('instead of'))).toBe(true);
  });

  it('flags an asset line that appeared', () => {
    const before = makeSim();
    const after = makeSim({
      assetChanges: [
        ...makeSim().assetChanges,
        { party: SPENDER, token: TUSD, deltaRaw: 2n * MON },
      ],
    });
    const report = compare(before, after);
    expect(report.level).toBe('material');
    expect(report.changes.some((c) => c.includes('is now part of this transaction'))).toBe(true);
  });

  it('flags an asset line that disappeared', () => {
    const before = makeSim({
      assetChanges: [
        ...makeSim().assetChanges,
        { party: RECIPIENT, token: TUSD, deltaRaw: MON },
      ],
    });
    const after = makeSim();
    const report = compare(before, after);
    expect(report.level).toBe('material');
    expect(
      report.changes.some((c) => c.includes('is no longer part of this transaction')),
    ).toBe(true);
  });

  it('flags an approval whose unlimited flag flipped on', () => {
    const before = makeSim({ approvalChanges: [makeApproval({ unlimited: false })] });
    const after = makeSim({
      approvalChanges: [makeApproval({ unlimited: true, amountRaw: (1n << 256n) - 1n })],
    });
    const report = compare(before, after);
    expect(report.level).toBe('material');
    expect(report.changes).toContain(
      'The approval is now unlimited, where before it had a limit.',
    );
  });

  it('flags an approval whose unlimited flag flipped off', () => {
    const before = makeSim({
      approvalChanges: [makeApproval({ unlimited: true, amountRaw: (1n << 256n) - 1n })],
    });
    const after = makeSim({ approvalChanges: [makeApproval({ unlimited: false })] });
    const report = compare(before, after);
    expect(report.level).toBe('material');
    expect(report.changes.some((c) => c.includes('where before it was unlimited'))).toBe(true);
  });

  it('flags an approval that appeared', () => {
    const report = compare(makeSim(), makeSim({ approvalChanges: [makeApproval()] }));
    expect(report.level).toBe('material');
    expect(report.changes.some((c) => c.includes('A new approval'))).toBe(true);
  });

  it('flags an approval that disappeared', () => {
    const report = compare(makeSim({ approvalChanges: [makeApproval()] }), makeSim());
    expect(report.level).toBe('material');
    expect(report.changes.some((c) => c.includes('no longer part of this transaction'))).toBe(
      true,
    );
  });
});

/* ------------------------------------------------------------------ */
/* Formatter injection                                                 */
/* ------------------------------------------------------------------ */

describe('compareSimulations — injected formatter', () => {
  it('renders changed amounts through the injected formatToken', () => {
    const formatToken = makeFormatToken();
    const before = makeSim({
      assetChanges: [{ party: SENDER, token: NATIVE_MON, deltaRaw: -HALF_MON }],
    });
    const after = makeSim({
      assetChanges: [{ party: SENDER, token: NATIVE_MON, deltaRaw: -(7n * MON) / 10n }],
    });
    const report = compare(before, after, formatToken);

    expect(formatToken).toHaveBeenCalled();
    // Amounts are always passed as positive values, with the token attached.
    expect(formatToken).toHaveBeenCalledWith(HALF_MON, NATIVE_MON);
    expect(formatToken).toHaveBeenCalledWith((7n * MON) / 10n, NATIVE_MON);
    // The stub's exact output must appear in the user-facing line.
    const line = report.changes.find((c) => c.includes('instead of'));
    expect(line).toBe(
      `You would now send ${((7n * MON) / 10n).toString()} MON instead of ${HALF_MON.toString()} MON.`,
    );
  });

  it('uses the formatter for approval amounts too', () => {
    const formatToken = makeFormatToken();
    const before = makeSim();
    const after = makeSim({ approvalChanges: [makeApproval({ amountRaw: 100n * MON })] });
    compare(before, after, formatToken);
    expect(formatToken).toHaveBeenCalledWith(100n * MON, TUSD);
  });
});

/* ------------------------------------------------------------------ */
/* staleSeconds                                                        */
/* ------------------------------------------------------------------ */

describe('compareSimulations — staleSeconds', () => {
  it('rounds the elapsed time to whole seconds', () => {
    const report = compareSimulations(makeSim(), makeSim(), {
      simulatedAtMs: 1_000,
      nowMs: 125_400,
      formatToken: makeFormatToken(),
    });
    expect(report.staleSeconds).toBe(124);
  });

  it('never goes negative when clocks disagree', () => {
    const report = compareSimulations(makeSim(), makeSim(), {
      simulatedAtMs: 50_000,
      nowMs: 10_000,
      formatToken: makeFormatToken(),
    });
    expect(report.staleSeconds).toBe(0);
  });
});
