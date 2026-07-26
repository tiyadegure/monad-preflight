import { describe, expect, it } from 'vitest';
import { assessCounterparty } from '../src/lib/reputation';
import type { CounterpartyFacts, Reputation } from '../src/lib/reputation';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

/** An unremarkable personal wallet: some history, some funds. */
function makeFacts(overrides: Partial<CounterpartyFacts> = {}): CounterpartyFacts {
  return {
    isContract: false,
    txCount: 5,
    balanceWei: 10n ** 18n, // 1 MON
    codeSize: 0,
    ...overrides,
  };
}

/** A contract that is neither tiny nor established. */
function makeContractFacts(overrides: Partial<CounterpartyFacts> = {}): CounterpartyFacts {
  return makeFacts({ isContract: true, codeSize: 500, txCount: 200, ...overrides });
}

const NOT_APPROVAL = { isApprovalTarget: false };
const APPROVAL = { isApprovalTarget: true };

function ids(rep: Reputation): string[] {
  return rep.findings.map((f) => f.id);
}

function allReasons(rep: Reputation): string {
  return rep.reasons.join(' ');
}

/* ------------------------------------------------------------------ */
/* established                                                         */
/* ------------------------------------------------------------------ */

describe('established', () => {
  it('triggers just above both thresholds (codeSize 2001, txCount 1001)', () => {
    const rep = assessCounterparty(
      makeFacts({ isContract: true, codeSize: 2001, txCount: 1001 }),
      NOT_APPROVAL,
    );
    expect(rep.level).toBe('established');
    expect(rep.label).toBe('Well-used program');
    expect(rep.findings).toEqual([]);
  });

  it('does NOT trigger at codeSize exactly 2000 (threshold is exclusive)', () => {
    const rep = assessCounterparty(
      makeFacts({ isContract: true, codeSize: 2000, txCount: 1001 }),
      NOT_APPROVAL,
    );
    expect(rep.level).toBe('ordinary');
  });

  it('does NOT trigger at txCount exactly 1000 (threshold is exclusive)', () => {
    const rep = assessCounterparty(
      makeFacts({ isContract: true, codeSize: 2001, txCount: 1000 }),
      NOT_APPROVAL,
    );
    expect(rep.level).toBe('ordinary');
  });

  it('requires BOTH signals: heavy usage alone is not enough', () => {
    const rep = assessCounterparty(
      makeFacts({ isContract: true, codeSize: 150, txCount: 50_000 }),
      NOT_APPROVAL,
    );
    expect(rep.level).toBe('ordinary');
  });

  it('requires BOTH signals: big code alone is not enough', () => {
    const rep = assessCounterparty(
      makeFacts({ isContract: true, codeSize: 50_000, txCount: 3 }),
      NOT_APPROVAL,
    );
    expect(rep.level).toBe('ordinary');
  });

  it('requires a contract — a wallet never qualifies', () => {
    const rep = assessCounterparty(
      makeFacts({ isContract: false, codeSize: 5000, txCount: 5000 }),
      NOT_APPROVAL,
    );
    expect(rep.level).toBe('ordinary');
    expect(rep.label).toBe('Ordinary wallet');
  });

  it('reasons cite the real numbers with thousands separators', () => {
    const rep = assessCounterparty(
      makeFacts({ isContract: true, codeSize: 24_576, txCount: 12_400 }),
      NOT_APPROVAL,
    );
    expect(allReasons(rep)).toContain((12_400).toLocaleString('en-US')); // "12,400"
    expect(allReasons(rep)).toContain((24_576).toLocaleString('en-US')); // "24,576"
  });
});

/* ------------------------------------------------------------------ */
/* suspicious: approval target is a personal wallet                    */
/* ------------------------------------------------------------------ */

describe('suspicious: approval to a wallet', () => {
  it('an approval target that is not a contract is always suspicious', () => {
    const rep = assessCounterparty(makeFacts(), APPROVAL);
    expect(rep.level).toBe('suspicious');
    expect(rep.label).toBe('Looks like a scam pattern');
    expect(ids(rep)).toContain('cp-approval-to-wallet');
  });

  it('cp-approval-to-wallet is always danger', () => {
    const rep = assessCounterparty(makeFacts(), APPROVAL);
    const finding = rep.findings.find((f) => f.id === 'cp-approval-to-wallet');
    expect(finding?.severity).toBe('danger');
  });

  it('stays suspicious even for a rich, busy wallet', () => {
    const rep = assessCounterparty(
      makeFacts({ txCount: 90_000, balanceWei: 1_000_000n * 10n ** 18n }),
      APPROVAL,
    );
    expect(rep.level).toBe('suspicious');
    expect(ids(rep)).toContain('cp-approval-to-wallet');
  });

  it('does not fire when the tx is not an approval', () => {
    const rep = assessCounterparty(makeFacts(), NOT_APPROVAL);
    expect(ids(rep)).not.toContain('cp-approval-to-wallet');
    expect(rep.level).toBe('ordinary');
  });

  it('does not fire when the approval target is a contract', () => {
    const rep = assessCounterparty(makeContractFacts(), APPROVAL);
    expect(ids(rep)).not.toContain('cp-approval-to-wallet');
  });
});

/* ------------------------------------------------------------------ */
/* suspicious: tiny contract                                           */
/* ------------------------------------------------------------------ */

describe('suspicious: tiny contract', () => {
  it('triggers just below the threshold (codeSize 99)', () => {
    const rep = assessCounterparty(makeContractFacts({ codeSize: 99 }), NOT_APPROVAL);
    expect(rep.level).toBe('suspicious');
    expect(ids(rep)).toContain('cp-tiny-contract');
  });

  it('triggers for a minimal proxy sized contract (45 bytes)', () => {
    const rep = assessCounterparty(makeContractFacts({ codeSize: 45 }), NOT_APPROVAL);
    expect(rep.level).toBe('suspicious');
  });

  it('does NOT trigger at codeSize exactly 100 (threshold is exclusive)', () => {
    const rep = assessCounterparty(makeContractFacts({ codeSize: 100 }), NOT_APPROVAL);
    expect(rep.level).toBe('ordinary');
    expect(ids(rep)).not.toContain('cp-tiny-contract');
  });

  it('never fires for a wallet, even though wallets have no code', () => {
    const rep = assessCounterparty(makeFacts({ isContract: false, codeSize: 0 }), NOT_APPROVAL);
    expect(ids(rep)).not.toContain('cp-tiny-contract');
    expect(rep.level).toBe('ordinary');
  });

  it('cp-tiny-contract is caution and cites the code size', () => {
    const rep = assessCounterparty(makeContractFacts({ codeSize: 45 }), NOT_APPROVAL);
    const finding = rep.findings.find((f) => f.id === 'cp-tiny-contract');
    expect(finding?.severity).toBe('caution');
    expect(finding?.detail).toContain('45');
    expect(allReasons(rep)).toContain('45');
  });
});

/* ------------------------------------------------------------------ */
/* suspicious: drainer pattern                                         */
/* ------------------------------------------------------------------ */

describe('suspicious: drainer pattern', () => {
  it('triggers exactly at owners 20 with txCount 49', () => {
    const rep = assessCounterparty(
      makeContractFacts({ distinctOwnersApprovingRecently: 20, txCount: 49 }),
      APPROVAL,
    );
    expect(rep.level).toBe('suspicious');
    expect(ids(rep)).toContain('cp-drainer-pattern');
  });

  it('cp-drainer-pattern is danger', () => {
    const rep = assessCounterparty(
      makeContractFacts({ distinctOwnersApprovingRecently: 20, txCount: 49 }),
      APPROVAL,
    );
    const finding = rep.findings.find((f) => f.id === 'cp-drainer-pattern');
    expect(finding?.severity).toBe('danger');
  });

  it('requires BOTH conditions: 19 owners is not enough', () => {
    const rep = assessCounterparty(
      makeContractFacts({ distinctOwnersApprovingRecently: 19, txCount: 49 }),
      APPROVAL,
    );
    expect(ids(rep)).not.toContain('cp-drainer-pattern');
    expect(rep.level).toBe('ordinary');
  });

  it('requires BOTH conditions: txCount 50 is not "barely used"', () => {
    const rep = assessCounterparty(
      makeContractFacts({ distinctOwnersApprovingRecently: 20, txCount: 50 }),
      APPROVAL,
    );
    expect(ids(rep)).not.toContain('cp-drainer-pattern');
    expect(rep.level).toBe('ordinary');
  });

  it('does not fire when the tx is not an approval', () => {
    const rep = assessCounterparty(
      makeContractFacts({ distinctOwnersApprovingRecently: 100, txCount: 3 }),
      NOT_APPROVAL,
    );
    expect(ids(rep)).not.toContain('cp-drainer-pattern');
  });

  it('does not fire when the owners count is unknown', () => {
    const rep = assessCounterparty(makeContractFacts({ txCount: 3 }), APPROVAL);
    expect(ids(rep)).not.toContain('cp-drainer-pattern');
  });

  it('reasons cite both numbers, with thousands separators', () => {
    const rep = assessCounterparty(
      makeContractFacts({ distinctOwnersApprovingRecently: 1234, txCount: 49 }),
      APPROVAL,
    );
    expect(allReasons(rep)).toContain((1234).toLocaleString('en-US')); // "1,234"
    expect(allReasons(rep)).toContain('49');
  });
});

/* ------------------------------------------------------------------ */
/* thin                                                                */
/* ------------------------------------------------------------------ */

describe('thin: never used', () => {
  it('triggers only when txCount is 0 AND balance is 0', () => {
    const rep = assessCounterparty(
      makeFacts({ txCount: 0, balanceWei: 0n }),
      NOT_APPROVAL,
    );
    expect(rep.level).toBe('thin');
    expect(rep.label).toBe('Never used before');
    expect(ids(rep)).toContain('cp-never-used');
  });

  it('cp-never-used is caution', () => {
    const rep = assessCounterparty(
      makeFacts({ txCount: 0, balanceWei: 0n }),
      NOT_APPROVAL,
    );
    const finding = rep.findings.find((f) => f.id === 'cp-never-used');
    expect(finding?.severity).toBe('caution');
  });

  it('does NOT trigger with 0 transactions but a nonzero balance', () => {
    const rep = assessCounterparty(
      makeFacts({ txCount: 0, balanceWei: 1n }),
      NOT_APPROVAL,
    );
    expect(rep.level).toBe('ordinary');
    expect(ids(rep)).not.toContain('cp-never-used');
  });

  it('does NOT trigger with 1 transaction but a zero balance', () => {
    const rep = assessCounterparty(
      makeFacts({ txCount: 1, balanceWei: 0n }),
      NOT_APPROVAL,
    );
    expect(rep.level).toBe('ordinary');
    expect(ids(rep)).not.toContain('cp-never-used');
  });

  it('reasons cite the zero usage', () => {
    const rep = assessCounterparty(
      makeFacts({ txCount: 0, balanceWei: 0n }),
      NOT_APPROVAL,
    );
    expect(allReasons(rep)).toContain((0).toLocaleString('en-US')); // "0"
  });
});

/* ------------------------------------------------------------------ */
/* ordinary                                                            */
/* ------------------------------------------------------------------ */

describe('ordinary', () => {
  it('an unremarkable wallet is ordinary', () => {
    const rep = assessCounterparty(makeFacts(), NOT_APPROVAL);
    expect(rep.level).toBe('ordinary');
    expect(rep.label).toBe('Ordinary wallet');
    expect(rep.findings).toEqual([]);
  });

  it('reasons cite the transaction count with thousands separators', () => {
    const rep = assessCounterparty(makeFacts({ txCount: 12_400 }), NOT_APPROVAL);
    expect(allReasons(rep)).toContain((12_400).toLocaleString('en-US')); // "12,400"
  });
});

/* ------------------------------------------------------------------ */
/* precedence and output shape                                         */
/* ------------------------------------------------------------------ */

describe('precedence and output shape', () => {
  it('suspicious outranks thin, and both findings are reported', () => {
    // A never-used wallet asked to receive spending permission.
    const rep = assessCounterparty(
      makeFacts({ txCount: 0, balanceWei: 0n }),
      APPROVAL,
    );
    expect(rep.level).toBe('suspicious');
    expect(ids(rep)).toContain('cp-approval-to-wallet');
    expect(ids(rep)).toContain('cp-never-used');
  });

  it('multiple suspicious signals can stack in findings', () => {
    // Tiny contract that many people just approved but has barely run.
    const rep = assessCounterparty(
      makeContractFacts({ codeSize: 45, distinctOwnersApprovingRecently: 30, txCount: 2 }),
      APPROVAL,
    );
    expect(rep.level).toBe('suspicious');
    expect(ids(rep)).toContain('cp-tiny-contract');
    expect(ids(rep)).toContain('cp-drainer-pattern');
  });

  it('always returns 1-3 reasons and titles of 8 words or fewer', () => {
    const samples: Array<[CounterpartyFacts, { isApprovalTarget: boolean }]> = [
      [makeFacts(), NOT_APPROVAL],
      [makeFacts(), APPROVAL],
      [makeFacts({ txCount: 0, balanceWei: 0n }), APPROVAL],
      [makeFacts({ isContract: true, codeSize: 2001, txCount: 1001 }), NOT_APPROVAL],
      [makeContractFacts({ codeSize: 45, distinctOwnersApprovingRecently: 30, txCount: 2 }), APPROVAL],
    ];
    for (const [facts, ctx] of samples) {
      const rep = assessCounterparty(facts, ctx);
      expect(rep.reasons.length).toBeGreaterThanOrEqual(1);
      expect(rep.reasons.length).toBeLessThanOrEqual(3);
      for (const finding of rep.findings) {
        expect(finding.title.split(/\s+/).length).toBeLessThanOrEqual(8);
        expect(finding.id.startsWith('cp-')).toBe(true);
      }
    }
  });
});
