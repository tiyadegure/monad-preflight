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

const HEADLINES: Record<CheckStatus, string> = {
  fail: 'Your wallet needs attention now.',
  unknown: 'We could not check everything — do not treat this as a clean bill of health.',
  warn: 'Mostly fine, with a couple of things worth cleaning up.',
  pass: 'Everything we can check looks healthy.',
};

/* ------------------------------------------------------------------ */
/* Individual checks                                                   */
/* ------------------------------------------------------------------ */

function checkDelegation(input: HealthInput): HealthCheck {
  const label = 'Wallet takeover';
  if (input.delegated === null) {
    return {
      id: 'delegation',
      label,
      status: 'unknown',
      detail: 'We could not read whether your wallet is running installed code.',
    };
  }
  if (input.delegated.delegated) {
    const where = input.delegated.implementation
      ? ` at ${shortAddress(input.delegated.implementation)}`
      : '';
    return {
      id: 'delegation',
      label,
      status: 'fail',
      detail:
        `A program${where} is installed on your wallet and can act as you.` +
        ' If you did not set this up yourself, remove it before doing anything else.',
    };
  }
  return {
    id: 'delegation',
    label,
    status: 'pass',
    detail: 'Your wallet is a normal wallet — no program is running as you.',
  };
}

function checkUnlimitedApprovals(input: HealthInput): HealthCheck {
  const label = 'Unlimited spending permissions';
  const count = input.unlimitedApprovals;
  if (count === null || !input.scanComplete) {
    return {
      id: 'unlimited-approvals',
      label,
      status: 'unknown',
      detail:
        'Our scan could not see everything, so we cannot say how many unlimited' +
        ' spending permissions you have. Do not treat this as a clean bill of health.',
    };
  }
  if (count === 0) {
    return {
      id: 'unlimited-approvals',
      label,
      status: 'pass',
      detail: 'You have no unlimited spending permissions — nothing can drain a whole token from your wallet.',
    };
  }
  if (count <= 2) {
    return {
      id: 'unlimited-approvals',
      label,
      status: 'warn',
      detail:
        `You have ${count === 1 ? '1 unlimited spending permission' : '2 unlimited spending permissions'}.` +
        ' Each one lets someone move all of that token out of your wallet at any time — cancel the ones you no longer use.',
    };
  }
  return {
    id: 'unlimited-approvals',
    label,
    status: 'fail',
    detail:
      `You have ${count} unlimited spending permissions.` +
      ' Each one lets someone move all of that token out of your wallet at any time — cancel the ones you no longer use.',
  };
}

function checkExposure(input: HealthInput): HealthCheck {
  const label = 'Funds others can take';
  const count = input.exposedTokenCount;
  if (count === null) {
    return {
      id: 'exposure',
      label,
      status: 'unknown',
      detail: 'We could not work out which of your tokens others currently have permission to take.',
    };
  }
  if (count === 0) {
    return {
      id: 'exposure',
      label,
      status: 'pass',
      detail: 'None of the tokens you hold can currently be taken by someone else.',
    };
  }
  return {
    id: 'exposure',
    label,
    status: 'warn',
    detail:
      `${count === 1 ? '1 token' : `${count} tokens`} in your wallet ` +
      `${count === 1 ? 'is' : 'are'} covered by a permission someone else holds — they could take ` +
      `${count === 1 ? 'it' : 'them'} without asking you again.`,
  };
}

function checkFunds(input: HealthInput): HealthCheck {
  const label = 'Gas for getting out';
  const balance = input.nativeBalanceWei;
  if (balance === null) {
    return {
      id: 'funds',
      label,
      status: 'unknown',
      detail: 'We could not read how much MON your wallet holds.',
    };
  }
  if (balance === 0n) {
    return {
      id: 'funds',
      label,
      status: 'warn',
      detail:
        'Your wallet holds no MON. Every action costs a small network fee,' +
        ' so right now you could not even cancel a permission — you cannot get out without a little MON for the fee.',
    };
  }
  return {
    id: 'funds',
    label,
    status: 'pass',
    detail: 'Your wallet holds MON, so you can pay the network fee to act — including cancelling a permission — if you ever need to.',
  };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export function assessWalletHealth(input: HealthInput): HealthReport {
  const checks: HealthCheck[] = [
    checkDelegation(input),
    checkUnlimitedApprovals(input),
    checkExposure(input),
    checkFunds(input),
  ];

  let worst: CheckStatus = 'pass';
  for (const check of checks) {
    if (SEVERITY_RANK[check.status] > SEVERITY_RANK[worst]) {
      worst = check.status;
    }
  }

  return { checks, headline: HEADLINES[worst], worst };
}
