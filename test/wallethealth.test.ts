import { describe, expect, it } from 'vitest';
import { assessWalletHealth } from '../src/lib/wallethealth';
import type { CheckStatus, HealthInput } from '../src/lib/wallethealth';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const IMPL = '0x1111111111111111111111111111111111111111';

/** All-healthy baseline; override per test. */
function makeInput(overrides: Partial<HealthInput> = {}): HealthInput {
  return {
    delegated: { delegated: false },
    unlimitedApprovals: 0,
    totalApprovals: 0,
    scanComplete: true,
    nativeBalanceWei: 10n ** 18n,
    exposedTokenCount: 0,
    ...overrides,
  };
}

function statusOf(input: HealthInput, id: string): CheckStatus {
  const check = assessWalletHealth(input).checks.find((c) => c.id === id);
  if (!check) throw new Error(`check ${id} missing from report`);
  return check.status;
}

/* ------------------------------------------------------------------ */
/* delegation                                                          */
/* ------------------------------------------------------------------ */

describe('delegation check', () => {
  it('is unknown when the code status could not be read', () => {
    const report = assessWalletHealth(makeInput({ delegated: null }));
    const check = report.checks[0];
    expect(check.id).toBe('delegation');
    expect(check.status).toBe('unknown');
    expect(check.detail).toBe(
      'We could not read whether your wallet is running installed code.',
    );
  });

  it('fails when a program is installed, naming the program address', () => {
    const report = assessWalletHealth(
      makeInput({ delegated: { delegated: true, implementation: IMPL } }),
    );
    const check = report.checks[0];
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('0x1111…1111');
  });

  it('fails even when the program address is unavailable', () => {
    expect(statusOf(makeInput({ delegated: { delegated: true } }), 'delegation')).toBe('fail');
  });

  it('passes for a normal wallet', () => {
    const report = assessWalletHealth(makeInput());
    const check = report.checks[0];
    expect(check.status).toBe('pass');
    expect(check.detail).toBe(
      'Your wallet is a normal wallet — no program is running as you.',
    );
  });

  it('uses the label "Wallet takeover"', () => {
    expect(assessWalletHealth(makeInput()).checks[0].label).toBe('Wallet takeover');
  });
});

/* ------------------------------------------------------------------ */
/* unlimited-approvals                                                 */
/* ------------------------------------------------------------------ */

describe('unlimited-approvals check', () => {
  it('is unknown when the count is null', () => {
    expect(statusOf(makeInput({ unlimitedApprovals: null }), 'unlimited-approvals')).toBe(
      'unknown',
    );
  });

  it('is unknown when the scan is incomplete, even with a count of 0', () => {
    const report = assessWalletHealth(makeInput({ unlimitedApprovals: 0, scanComplete: false }));
    const check = report.checks[1];
    expect(check.status).toBe('unknown');
    expect(check.detail).toContain('could not see everything');
    expect(check.detail).toContain('clean bill of health');
  });

  it('passes at 0', () => {
    expect(statusOf(makeInput({ unlimitedApprovals: 0 }), 'unlimited-approvals')).toBe('pass');
  });

  it('warns at 1 and names the count', () => {
    const report = assessWalletHealth(makeInput({ unlimitedApprovals: 1, totalApprovals: 1 }));
    const check = report.checks[1];
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('1');
  });

  it('warns at 2', () => {
    expect(
      statusOf(makeInput({ unlimitedApprovals: 2, totalApprovals: 2 }), 'unlimited-approvals'),
    ).toBe('warn');
  });

  it('fails at 3 and names the count', () => {
    const report = assessWalletHealth(makeInput({ unlimitedApprovals: 3, totalApprovals: 5 }));
    const check = report.checks[1];
    expect(check.status).toBe('fail');
    expect(check.detail).toContain('3');
  });

  it('fails at higher counts too', () => {
    expect(
      statusOf(makeInput({ unlimitedApprovals: 12, totalApprovals: 20 }), 'unlimited-approvals'),
    ).toBe('fail');
  });

  it('uses the label "Unlimited spending permissions"', () => {
    expect(assessWalletHealth(makeInput()).checks[1].label).toBe(
      'Unlimited spending permissions',
    );
  });
});

/* ------------------------------------------------------------------ */
/* exposure                                                            */
/* ------------------------------------------------------------------ */

describe('exposure check', () => {
  it('is unknown when the count is null', () => {
    expect(statusOf(makeInput({ exposedTokenCount: null }), 'exposure')).toBe('unknown');
  });

  it('passes at 0', () => {
    expect(statusOf(makeInput({ exposedTokenCount: 0 }), 'exposure')).toBe('pass');
  });

  it('warns above 0 and names the count', () => {
    const report = assessWalletHealth(makeInput({ exposedTokenCount: 4 }));
    const check = report.checks[2];
    expect(check.status).toBe('warn');
    expect(check.detail).toContain('4');
  });

  it('uses the label "Funds others can take"', () => {
    expect(assessWalletHealth(makeInput()).checks[2].label).toBe('Funds others can take');
  });
});

/* ------------------------------------------------------------------ */
/* funds                                                               */
/* ------------------------------------------------------------------ */

describe('funds check', () => {
  it('is unknown when the balance could not be read', () => {
    expect(statusOf(makeInput({ nativeBalanceWei: null }), 'funds')).toBe('unknown');
  });

  it('warns at exactly zero and explains you cannot cancel a permission without MON', () => {
    const report = assessWalletHealth(makeInput({ nativeBalanceWei: 0n }));
    const check = report.checks[3];
    expect(check.status).toBe('warn');
    expect(check.detail.toLowerCase()).toContain('cancel a permission');
    expect(check.detail.toLowerCase()).toContain('fee');
  });

  it('passes with any positive balance, even 1 wei', () => {
    expect(statusOf(makeInput({ nativeBalanceWei: 1n }), 'funds')).toBe('pass');
  });

  it('uses the label "Gas for getting out"', () => {
    expect(assessWalletHealth(makeInput()).checks[3].label).toBe('Gas for getting out');
  });
});

/* ------------------------------------------------------------------ */
/* worst-status ordering                                               */
/* ------------------------------------------------------------------ */

describe('worst-status ordering (fail > unknown > warn > pass)', () => {
  it('all-pass report has worst = pass', () => {
    expect(assessWalletHealth(makeInput()).worst).toBe('pass');
  });

  it('a single warn beats pass', () => {
    expect(assessWalletHealth(makeInput({ nativeBalanceWei: 0n })).worst).toBe('warn');
  });

  it('one unknown and one warn produce unknown — unchecked never looks better than a known problem', () => {
    const report = assessWalletHealth(
      makeInput({ delegated: null, nativeBalanceWei: 0n }),
    );
    expect(report.worst).toBe('unknown');
  });

  it('a fail beats unknown', () => {
    const report = assessWalletHealth(
      makeInput({ delegated: { delegated: true, implementation: IMPL }, exposedTokenCount: null }),
    );
    expect(report.worst).toBe('fail');
  });

  it('everything unreadable produces unknown, not pass', () => {
    const report = assessWalletHealth({
      delegated: null,
      unlimitedApprovals: null,
      totalApprovals: null,
      scanComplete: false,
      nativeBalanceWei: null,
      exposedTokenCount: null,
    });
    expect(report.worst).toBe('unknown');
    expect(report.checks.every((c) => c.status === 'unknown')).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/* headlines                                                           */
/* ------------------------------------------------------------------ */

describe('headlines', () => {
  it('fail headline', () => {
    const report = assessWalletHealth(makeInput({ delegated: { delegated: true } }));
    expect(report.headline).toBe('Your wallet needs attention now.');
  });

  it('unknown headline', () => {
    const report = assessWalletHealth(makeInput({ delegated: null }));
    expect(report.headline).toBe(
      'We could not check everything — do not treat this as a clean bill of health.',
    );
  });

  it('warn headline', () => {
    const report = assessWalletHealth(makeInput({ unlimitedApprovals: 1, totalApprovals: 1 }));
    expect(report.headline).toBe('Mostly fine, with a couple of things worth cleaning up.');
  });

  it('pass headline', () => {
    expect(assessWalletHealth(makeInput()).headline).toBe(
      'Everything we can check looks healthy.',
    );
  });
});

/* ------------------------------------------------------------------ */
/* shape stability                                                     */
/* ------------------------------------------------------------------ */

describe('report shape', () => {
  it('always returns the four checks with stable ids, in order', () => {
    const ids = assessWalletHealth(makeInput()).checks.map((c) => c.id);
    expect(ids).toEqual(['delegation', 'unlimited-approvals', 'exposure', 'funds']);
  });

  it('keeps the same ids and order even when everything is unreadable', () => {
    const ids = assessWalletHealth({
      delegated: null,
      unlimitedApprovals: null,
      totalApprovals: null,
      scanComplete: false,
      nativeBalanceWei: null,
      exposedTokenCount: null,
    }).checks.map((c) => c.id);
    expect(ids).toEqual(['delegation', 'unlimited-approvals', 'exposure', 'funds']);
  });

  it('every check carries a non-empty detail sentence', () => {
    for (const check of assessWalletHealth(makeInput()).checks) {
      expect(check.detail.length).toBeGreaterThan(0);
    }
  });
});
