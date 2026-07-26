import { describe, expect, it } from 'vitest';
import { assessRisks } from '../src/lib/risk';
import type {
  Address,
  PreparedTx,
  RiskContext,
  RiskFinding,
  SimulationResult,
  TokenInfo,
} from '../src/lib/types';
import { NATIVE_MON } from '../src/lib/types';
import { MAX_UINT256, UNLIMITED_THRESHOLD } from '../src/lib/format';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const SENDER: Address = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const RECIPIENT: Address = '0x2222222222222222222222222222222222222222';
const TOKEN_ADDR: Address = '0x3333333333333333333333333333333333333333';
const ZERO: Address = '0x0000000000000000000000000000000000000000';

const TUSD: TokenInfo = { address: TOKEN_ADDR, symbol: 'tUSD', decimals: 18 };

const HALF_MON = 10n ** 18n / 2n;

function makeTx(overrides: Partial<PreparedTx> = {}): PreparedTx {
  return {
    from: SENDER,
    to: RECIPIENT,
    data: '0x',
    value: HALF_MON,
    kind: 'native-transfer',
    summary: 'Send 0.5 MON to 0x2222…2222',
    counterparty: RECIPIENT,
    amountRaw: HALF_MON,
    ...overrides,
  };
}

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
    notes: [],
    ...overrides,
  };
}

function makeCtx(overrides: Partial<RiskContext> = {}): RiskContext {
  return {
    senderBalanceWei: 10n * 10n ** 18n, // 10 MON
    counterpartyIsContract: false,
    counterpartyTxCount: 5,
    counterpartyBalanceWei: 10n ** 18n,
    tokenIsContract: true,
    ...overrides,
  };
}

/** An erc20-approve tx to a contract spender (avoids approval-to-eoa noise). */
function makeApproveTx(amountRaw: bigint): PreparedTx {
  return makeTx({
    kind: 'erc20-approve',
    to: TOKEN_ADDR,
    data: '0x095ea7b3',
    value: 0n,
    token: TUSD,
    amountRaw,
    summary: 'Allow 0x2222…2222 to spend tUSD',
  });
}

const approveCtx = () => makeCtx({ counterpartyIsContract: true });

const ids = (findings: RiskFinding[]) => findings.map((f) => f.id);
const byId = (findings: RiskFinding[], id: string) =>
  findings.find((f) => f.id === id);

/* ------------------------------------------------------------------ */
/* Baseline                                                            */
/* ------------------------------------------------------------------ */

describe('clean simple transfer', () => {
  it('produces no danger or caution findings', () => {
    const findings = assessRisks(makeTx(), makeSim(), makeCtx());
    expect(findings.filter((f) => f.severity !== 'info')).toEqual([]);
    expect(findings).toEqual([]); // and in fact nothing at all
  });
});

/* ------------------------------------------------------------------ */
/* Danger rules                                                        */
/* ------------------------------------------------------------------ */

describe('danger rules', () => {
  it('simulation-reverted fires when the simulation fails', () => {
    const sim = makeSim({
      ok: false,
      revertReason: 'transfer amount exceeds balance',
      assetChanges: [],
    });
    const f = byId(assessRisks(makeTx(), sim, makeCtx()), 'simulation-reverted');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('danger');
    expect(f!.detail).toContain('transfer amount exceeds balance');
    expect(f!.detail.toLowerCase()).toContain('gas');
  });

  it('simulation-reverted still explains itself without a revert reason', () => {
    const sim = makeSim({ ok: false, assetChanges: [] });
    const f = byId(assessRisks(makeTx(), sim, makeCtx()), 'simulation-reverted');
    expect(f).toBeDefined();
    expect(f!.detail.toLowerCase()).toContain('no funds');
  });

  it('insufficient-balance fires when value + gas exceeds the balance', () => {
    const sim = makeSim();
    const tx = makeTx();
    const short = makeCtx({ senderBalanceWei: tx.value + sim.gasCostWei - 1n });
    expect(ids(assessRisks(tx, sim, short))).toContain('insufficient-balance');

    // Exactly enough is fine — the rule is a strict "more than".
    const exact = makeCtx({ senderBalanceWei: tx.value + sim.gasCostWei });
    expect(ids(assessRisks(tx, sim, exact))).not.toContain('insufficient-balance');
  });

  it('unlimited-approval fires via the simulation approvalChanges path', () => {
    // Small on-paper amount, but the simulation saw an unlimited approval.
    const tx = makeApproveTx(100n);
    const sim = makeSim({
      assetChanges: [],
      approvalChanges: [
        {
          owner: SENDER,
          spender: RECIPIENT,
          token: TUSD,
          amountRaw: MAX_UINT256,
          unlimited: true,
        },
      ],
    });
    const findings = assessRisks(tx, sim, approveCtx());
    expect(ids(findings)).toContain('unlimited-approval');
  });

  it('unlimited-approval fires via the amountRaw threshold path', () => {
    const tx = makeApproveTx(UNLIMITED_THRESHOLD); // boundary: >= fires
    const findings = assessRisks(tx, makeSim({ assetChanges: [] }), approveCtx());
    const f = byId(findings, 'unlimited-approval');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('danger');
    expect(f!.detail).toContain('ALL');

    // Just below the threshold: no finding.
    const below = makeApproveTx(UNLIMITED_THRESHOLD - 1n);
    expect(ids(assessRisks(below, makeSim({ assetChanges: [] }), approveCtx()))).not.toContain(
      'unlimited-approval',
    );
  });

  it('unlimited-approval never duplicates when both paths fire', () => {
    const tx = makeApproveTx(MAX_UINT256);
    const sim = makeSim({
      assetChanges: [],
      approvalChanges: [
        {
          owner: SENDER,
          spender: RECIPIENT,
          token: TUSD,
          amountRaw: MAX_UINT256,
          unlimited: true,
        },
      ],
    });
    const findings = assessRisks(tx, sim, approveCtx());
    expect(ids(findings).filter((id) => id === 'unlimited-approval')).toHaveLength(1);
  });

  it('approval-to-eoa fires when approving a non-contract address', () => {
    const tx = makeApproveTx(100n);
    const ctx = makeCtx({ counterpartyIsContract: false });
    const f = byId(assessRisks(tx, makeSim({ assetChanges: [] }), ctx), 'approval-to-eoa');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('danger');

    // Unknown counterparty type must NOT fire the rule.
    const unknown = makeCtx({ counterpartyIsContract: undefined });
    expect(ids(assessRisks(tx, makeSim({ assetChanges: [] }), unknown))).not.toContain(
      'approval-to-eoa',
    );
  });

  it('token-not-contract fires for any erc20 kind when the token has no code', () => {
    const tx = makeTx({
      kind: 'erc20-transfer',
      to: TOKEN_ADDR,
      data: '0xa9059cbb',
      value: 0n,
      token: TUSD,
    });
    const ctx = makeCtx({ tokenIsContract: false });
    const f = byId(assessRisks(tx, makeSim(), ctx), 'token-not-contract');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('danger');

    // A native transfer has no token, so the rule must stay quiet.
    expect(ids(assessRisks(makeTx(), makeSim(), ctx))).not.toContain('token-not-contract');
  });

  it('zero-address fires when the counterparty is the zero address', () => {
    const tx = makeTx({ to: ZERO, counterparty: ZERO });
    const f = byId(assessRisks(tx, makeSim(), makeCtx()), 'zero-address');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('danger');
    expect(f!.detail.toLowerCase()).toContain('destroyed');
  });
});

/* ------------------------------------------------------------------ */
/* Caution rules                                                       */
/* ------------------------------------------------------------------ */

describe('caution rules', () => {
  it('send-to-contract fires for transfers to a contract', () => {
    const ctx = makeCtx({ counterpartyIsContract: true });
    const f = byId(assessRisks(makeTx(), makeSim(), ctx), 'send-to-contract');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('caution');

    // Approvals to contracts are normal — the rule is transfers only.
    const approve = makeApproveTx(100n);
    expect(ids(assessRisks(approve, makeSim({ assetChanges: [] }), ctx))).not.toContain(
      'send-to-contract',
    );
  });

  it('fresh-recipient fires for a never-used, empty address', () => {
    const ctx = makeCtx({ counterpartyTxCount: 0, counterpartyBalanceWei: 0n });
    expect(ids(assessRisks(makeTx(), makeSim(), ctx))).toContain('fresh-recipient');

    // Missing balance data counts as empty.
    const noBalance = makeCtx({ counterpartyTxCount: 0, counterpartyBalanceWei: undefined });
    expect(ids(assessRisks(makeTx(), makeSim(), noBalance))).toContain('fresh-recipient');

    // Unknown tx count must NOT fire the rule.
    const unknownCount = makeCtx({ counterpartyTxCount: undefined, counterpartyBalanceWei: 0n });
    expect(ids(assessRisks(makeTx(), makeSim(), unknownCount))).not.toContain('fresh-recipient');
  });

  it('sending-entire-balance fires at 95% of the wallet or more', () => {
    const balance = 10n ** 18n;
    const at95 = makeTx({ value: (balance * 95n) / 100n });
    const ctx = makeCtx({ senderBalanceWei: balance });
    expect(ids(assessRisks(at95, makeSim(), ctx))).toContain('sending-entire-balance');

    const at94 = makeTx({ value: (balance * 94n) / 100n });
    expect(ids(assessRisks(at94, makeSim(), ctx))).not.toContain('sending-entire-balance');
  });

  it('unknown-effects fires for raw txs with unreadable results', () => {
    const rawTx = makeTx({
      kind: 'raw',
      data: '0xdeadbeef',
      value: 0n,
      counterparty: undefined,
      amountRaw: undefined,
    });

    // Path 1: an event we could not decode.
    const simWithUnknown = makeSim({
      events: [{ address: RECIPIENT, name: 'unknown', raw: { topics: [], data: '0x' } }],
    });
    expect(ids(assessRisks(rawTx, simWithUnknown, makeCtx()))).toContain('unknown-effects');

    // Path 2: has calldata, simulation succeeded, yet no asset changes seen.
    const silentSim = makeSim({ assetChanges: [] });
    expect(ids(assessRisks(rawTx, silentSim, makeCtx()))).toContain('unknown-effects');

    // Empty calldata and nothing unknown: stays quiet.
    const emptyDataTx = makeTx({ ...rawTx, data: '0x' });
    expect(ids(assessRisks(emptyDataTx, silentSim, makeCtx()))).not.toContain('unknown-effects');
  });

  it('simulation-degraded fires when the simulator fell back to a basic check', () => {
    const sim = makeSim({
      notes: ['Deep simulation unavailable — ran a basic check only.'],
    });
    const f = byId(assessRisks(makeTx(), sim, makeCtx()), 'simulation-degraded');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('caution');
  });
});

/* ------------------------------------------------------------------ */
/* Info rules                                                          */
/* ------------------------------------------------------------------ */

describe('info rules', () => {
  it('self-transfer fires when the counterparty is the sender (case-insensitive)', () => {
    const upper = SENDER.toUpperCase().replace('0X', '0x') as Address;
    const tx = makeTx({ to: upper, counterparty: upper });
    const f = byId(assessRisks(tx, makeSim(), makeCtx()), 'self-transfer');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('info');
  });

  it('zero-amount fires for transfers of nothing', () => {
    const tx = makeTx({ value: 0n, amountRaw: 0n });
    const f = byId(assessRisks(tx, makeSim({ assetChanges: [] }), makeCtx()), 'zero-amount');
    expect(f).toBeDefined();
    expect(f!.severity).toBe('info');
  });

  it('large-gas fires above 1,000,000 gas but not at it', () => {
    const heavy = makeSim({ gasUsed: 1_000_001n });
    expect(ids(assessRisks(makeTx(), heavy, makeCtx()))).toContain('large-gas');

    const exactly = makeSim({ gasUsed: 1_000_000n });
    expect(ids(assessRisks(makeTx(), exactly, makeCtx()))).not.toContain('large-gas');
  });
});

/* ------------------------------------------------------------------ */
/* Ordering and shape                                                  */
/* ------------------------------------------------------------------ */

describe('ordering and output shape', () => {
  it('orders findings danger → caution → info, stable within each band', () => {
    // One erc20 transfer engineered to fire rules from all three bands.
    const tx = makeTx({
      kind: 'erc20-transfer',
      to: TOKEN_ADDR,
      data: '0xa9059cbb',
      value: 0n,
      token: TUSD,
      amountRaw: 0n,
    });
    const sim = makeSim({
      gasUsed: 2_000_000n,
      assetChanges: [],
      notes: ['trace unavailable — ran a basic check via eth_call'],
    });
    const ctx = makeCtx({ tokenIsContract: false, counterpartyIsContract: true });

    const findings = assessRisks(tx, sim, ctx);
    expect(ids(findings)).toEqual([
      'token-not-contract', // danger
      'send-to-contract', // caution (declared before simulation-degraded)
      'simulation-degraded', // caution
      'zero-amount', // info (declared before large-gas)
      'large-gas', // info
    ]);

    // Severity bands never go back up.
    const rank = { danger: 0, caution: 1, info: 2 } as const;
    for (let i = 1; i < findings.length; i++) {
      expect(rank[findings[i].severity]).toBeGreaterThanOrEqual(
        rank[findings[i - 1].severity],
      );
    }

    // No duplicate ids.
    expect(new Set(ids(findings)).size).toBe(findings.length);
  });

  it('keeps every title at 8 words or fewer', () => {
    // Fire as many rules at once as possible and inspect the copy.
    const tx = makeTx({
      kind: 'erc20-approve',
      to: TOKEN_ADDR,
      data: '0x095ea7b3',
      value: 0n,
      token: TUSD,
      amountRaw: MAX_UINT256,
      counterparty: SENDER, // also triggers self-transfer
    });
    const sim = makeSim({
      ok: false,
      revertReason: 'nope',
      gasUsed: 2_000_000n,
      assetChanges: [],
      notes: ['basic check only'],
    });
    const ctx = makeCtx({
      senderBalanceWei: 0n,
      counterpartyIsContract: false,
      tokenIsContract: false,
    });
    const findings = assessRisks(tx, sim, ctx);
    expect(findings.length).toBeGreaterThanOrEqual(5);
    for (const f of findings) {
      expect(f.title.split(/\s+/).length).toBeLessThanOrEqual(8);
      expect(f.detail.length).toBeGreaterThan(0);
    }
  });
});
