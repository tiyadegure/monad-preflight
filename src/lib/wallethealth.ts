/**
 * Wallet health check for Monad PreFlight.
 *
 * A single "is my wallet safe right now?" verdict built from the facts
 * PreFlight can verify on demand. Pure and deterministic — all chain data
 * is gathered elsewhere and injected here.
 *
 * Honesty rule: this report must NEVER overstate safety. Anything we
 * could not check is reported as unchecked ('unknown'), never as a pass,
 * and an unknown outranks a warn in the overall verdict — "we could not
 * check" must never look better than a known small problem.
 */

import { shortAddress } from './format';
import { t } from './i18n';
import type { Lang } from './i18n';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'unknown';

export interface HealthCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface HealthInput {
  /** null = could not read the wallet's code status */
  delegated: { delegated: boolean; implementation?: string } | null;
  /** null = scan incomplete/failed */
  unlimitedApprovals: number | null;
  totalApprovals: number | null;
  scanComplete: boolean;
  nativeBalanceWei: bigint | null;
  exposedTokenCount: number | null;
}

export interface HealthReport {
  checks: HealthCheck[];
  headline: string;
  worst: CheckStatus;
}

/* ------------------------------------------------------------------ */
/* Severity ordering                                                   */
/* ------------------------------------------------------------------ */

// Deliberate ordering: fail > unknown > warn > pass. An unchecked item
// must never rank better than a known small problem.
const SEVERITY_RANK: Record<CheckStatus, number> = {
  fail: 3,
  unknown: 2,
  warn: 1,
  pass: 0,
};

/* ------------------------------------------------------------------ */
/* Individual checks                                                   */
/* ------------------------------------------------------------------ */

function checkDelegation(input: HealthInput, lang: Lang): HealthCheck {
  const label = t(lang, 'wh.label.delegation');
  if (input.delegated === null) {
    return {
      id: 'delegation',
      label,
      status: 'unknown',
      detail: t(lang, 'wh.delegationUnknown'),
    };
  }
  if (input.delegated.delegated) {
    const where = input.delegated.implementation
      ? t(lang, 'wh.delegationAt', { address: shortAddress(input.delegated.implementation) })
      : '';
    return {
      id: 'delegation',
      label,
      status: 'fail',
      detail: t(lang, 'wh.delegationFail', { where }),
    };
  }
  return {
    id: 'delegation',
    label,
    status: 'pass',
    detail: t(lang, 'wh.delegationPass'),
  };
}

function checkUnlimitedApprovals(input: HealthInput, lang: Lang): HealthCheck {
  const label = t(lang, 'wh.label.unlimited');
  const count = input.unlimitedApprovals;
  if (count === null || !input.scanComplete) {
    return {
      id: 'unlimited-approvals',
      label,
      status: 'unknown',
      detail: t(lang, 'wh.unlimitedUnknown'),
    };
  }
  if (count === 0) {
    return {
      id: 'unlimited-approvals',
      label,
      status: 'pass',
      detail: t(lang, 'wh.unlimitedPass'),
    };
  }
  if (count <= 2) {
    return {
      id: 'unlimited-approvals',
      label,
      status: 'warn',
      detail: t(
        lang,
        count === 1 ? 'wh.unlimitedWarnOne' : 'wh.unlimitedWarnTwo',
      ),
    };
  }
  return {
    id: 'unlimited-approvals',
    label,
    status: 'fail',
    detail: t(lang, 'wh.unlimitedFail', { count: String(count) }),
  };
}

function checkExposure(input: HealthInput, lang: Lang): HealthCheck {
  const label = t(lang, 'wh.label.exposure');
  const count = input.exposedTokenCount;
  if (count === null) {
    return {
      id: 'exposure',
      label,
      status: 'unknown',
      detail: t(lang, 'wh.exposureUnknown'),
    };
  }
  if (count === 0) {
    return {
      id: 'exposure',
      label,
      status: 'pass',
      detail: t(lang, 'wh.exposurePass'),
    };
  }
  return {
    id: 'exposure',
    label,
    status: 'warn',
    detail: t(
      lang,
      count === 1 ? 'wh.exposureWarnOne' : 'wh.exposureWarnMany',
      { count: String(count) },
    ),
  };
}

function checkFunds(input: HealthInput, lang: Lang): HealthCheck {
  const label = t(lang, 'wh.label.funds');
  const balance = input.nativeBalanceWei;
  if (balance === null) {
    return {
      id: 'funds',
      label,
      status: 'unknown',
      detail: t(lang, 'wh.fundsUnknown'),
    };
  }
  if (balance === 0n) {
    return {
      id: 'funds',
      label,
      status: 'warn',
      detail: t(lang, 'wh.fundsWarn'),
    };
  }
  return {
    id: 'funds',
    label,
    status: 'pass',
    detail: t(lang, 'wh.fundsPass'),
  };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export function assessWalletHealth(input: HealthInput, lang: Lang = 'en'): HealthReport {
  const checks: HealthCheck[] = [
    checkDelegation(input, lang),
    checkUnlimitedApprovals(input, lang),
    checkExposure(input, lang),
    checkFunds(input, lang),
  ];

  let worst: CheckStatus = 'pass';
  for (const check of checks) {
    if (SEVERITY_RANK[check.status] > SEVERITY_RANK[worst]) {
      worst = check.status;
    }
  }

  return { checks, headline: t(lang, `wh.headline.${worst}` as const), worst };
}
