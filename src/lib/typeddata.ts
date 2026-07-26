/**
 * EIP-712 signature-request explainer.
 *
 * Wallets show "signature requests" (EIP-712 typed data) that look harmless
 * because they cost no gas — but a signed token permit can hand a stranger
 * the power to drain a wallet. This module explains a pasted signature
 * request the same way PreFlight explains a transaction.
 *
 * Pure module: no chain access, no globals at import time. Time is injected
 * via opts.nowMs (browsers may omit it and get Date.now()).
 */

import type { RiskFinding } from './types';
import { UNLIMITED_THRESHOLD } from './format';

/* ------------------------------------------------------------------ */
/* Public types                                                        */
/* ------------------------------------------------------------------ */

export interface TypedDataExplanation {
  kind: 'permit' | 'permit2-single' | 'permit2-batch' | 'generic';
  headline: string;
  outcome: string;
  bullets: string[];
  risks: RiskFinding[];
  domain: { name?: string; verifyingContract?: string; chainId?: string };
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

/** Permit2 amounts are uint160; at or above half its max we call it unlimited. */
const UINT160_UNLIMITED_THRESHOLD = ((1n << 160n) - 1n) / 2n;

const THIRTY_DAYS_SEC = 30n * 24n * 60n * 60n;

/** 9999-12-31T23:59:59Z — past this, a date is "never expires" territory. */
const FAR_FUTURE_SEC = 253_402_300_799n;

const PERMIT_HEADLINE = 'This signature is a token approval — no transaction needed';
const PERMIT2_HEADLINE = 'This signature is a token approval through Permit2 — no transaction needed';
const GENERIC_HEADLINE = 'You are being asked to sign structured data';

const NOT_TYPED_DATA_ERROR =
  "This does not look like a signature request. A signature request has 'types' and 'message' sections, plus a 'domain' or 'primaryType'.";

const AMOUNT_CAVEAT =
  "raw token units — a signature request does not carry the token's decimals, so we cannot show this as an everyday amount";

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Best-effort bigint from the shapes EIP-712 values arrive in. null = unreadable. */
function asBigInt(value: unknown): bigint | null {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') {
    return Number.isInteger(value) ? BigInt(value) : null;
  }
  if (typeof value === 'string') {
    const s = value.trim();
    if (/^-?\d+$/.test(s)) return BigInt(s);
    if (/^0x[0-9a-fA-F]+$/.test(s)) return BigInt(s);
  }
  return null;
}

/** Render any message value as a display string (never throws). */
function stringifyValue(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value === undefined) return 'undefined';
  try {
    const json = JSON.stringify(value, (_key, v: unknown) =>
      typeof v === 'bigint' ? v.toString() : v,
    );
    return json ?? String(value);
  } catch {
    return String(value);
  }
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function formatUnixSeconds(sec: bigint): string {
  if (sec < 0n) return 'an unreadable date';
  if (sec > FAR_FUTURE_SEC) return 'a date so far away it never really expires';
  return new Date(Number(sec) * 1000).toUTCString();
}

function describeAmount(amount: bigint, unlimited: boolean): string {
  if (unlimited) return 'unlimited — there is no cap on how much can be taken';
  return `${amount.toString()} ${AMOUNT_CAVEAT}`;
}

/* ------------------------------------------------------------------ */
/* Risk builders                                                       */
/* ------------------------------------------------------------------ */

function unlimitedRisk(spender: string): RiskFinding {
  return {
    id: 'unlimited-permit',
    severity: 'danger',
    title: 'Unlimited spending approval',
    detail:
      `Signing hands unlimited spending of this token to ${spender}. ` +
      'It happens silently and costs them nothing — they could take your entire balance at any time.',
  };
}

function deadlineRisks(deadlineSec: bigint, nowSec: bigint): RiskFinding[] {
  if (deadlineSec < nowSec) {
    return [
      {
        id: 'expired-permit',
        severity: 'info',
        title: 'This request has already expired',
        detail:
          'The deadline in this request is in the past, so signing it should have no effect — contracts reject expired signatures.',
      },
    ];
  }
  if (deadlineSec - nowSec > THIRTY_DAYS_SEC) {
    return [
      {
        id: 'long-deadline',
        severity: 'caution',
        title: 'Usable for a very long time',
        detail:
          `This approval stays usable for more than 30 days (until ${formatUnixSeconds(deadlineSec)}). ` +
          'Whoever holds the signature can use it at any moment before then, long after you may have forgotten about it.',
      },
    ];
  }
  return [];
}

function differentNetworkRisk(): RiskFinding {
  return {
    id: 'different-network',
    severity: 'caution',
    title: 'Meant for a different network',
    detail:
      'This signature is for a different network than the one you have selected. Make sure the app is asking for the network you expect.',
  };
}

function signatureCanMoveFundsRisk(): RiskFinding {
  return {
    id: 'signature-can-move-funds',
    severity: 'caution',
    title: 'Signatures can move funds',
    detail:
      'Some signatures authorize moving funds without any transaction. Only sign if you trust the app that asked for this.',
  };
}

/* ------------------------------------------------------------------ */
/* Shape check                                                         */
/* ------------------------------------------------------------------ */

export function looksLikeTypedData(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (!isRecord(value.types)) return false;
  if (!isRecord(value.message)) return false;
  return typeof value.primaryType === 'string' || isRecord(value.domain);
}

/* ------------------------------------------------------------------ */
/* Domain                                                              */
/* ------------------------------------------------------------------ */

function extractDomain(raw: unknown): TypedDataExplanation['domain'] {
  const out: TypedDataExplanation['domain'] = {};
  if (!isRecord(raw)) return out;
  if (typeof raw.name === 'string') out.name = raw.name;
  if (typeof raw.verifyingContract === 'string') out.verifyingContract = raw.verifyingContract;
  const cid = raw.chainId;
  if (typeof cid === 'string' || typeof cid === 'number' || typeof cid === 'bigint') {
    const parsed = asBigInt(cid);
    out.chainId = parsed !== null ? parsed.toString() : String(cid);
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Kind-specific explainers                                            */
/* ------------------------------------------------------------------ */

function explainPermit(
  message: Rec,
  domain: TypedDataExplanation['domain'],
  risks: RiskFinding[],
  nowSec: bigint,
): TypedDataExplanation | { error: string } {
  const spender = stringifyValue(message.spender);
  const amount = asBigInt(message.value);
  if (amount === null) {
    return { error: 'We could not read the amount in this approval request, so we cannot explain it safely.' };
  }
  const deadline = asBigInt(message.deadline);
  if (deadline === null) {
    return { error: 'We could not read the deadline in this approval request, so we cannot explain it safely.' };
  }

  const unlimited = amount >= UNLIMITED_THRESHOLD;
  if (unlimited) risks.push(unlimitedRisk(spender));
  risks.push(...deadlineRisks(deadline, nowSec));

  const bullets = [
    `Who can spend: ${spender}`,
    `How much: ${describeAmount(amount, unlimited)}`,
    `Valid until: ${formatUnixSeconds(deadline)}`,
  ];
  if (domain.verifyingContract) bullets.push(`Token contract: ${domain.verifyingContract}`);

  return {
    kind: 'permit',
    headline: PERMIT_HEADLINE,
    outcome:
      `If you sign, ${spender} becomes allowed to take ${unlimited ? 'any amount' : 'up to the stated amount'} ` +
      'of this token from your wallet until the deadline. Signing is free and moves nothing right now — ' +
      'the effect kicks in whenever the spender chooses to use your signature.',
    bullets,
    risks,
    domain,
  };
}

interface Permit2Item {
  token: string;
  amount: bigint;
  unlimited: boolean;
  expiration?: bigint;
}

function parsePermit2Item(raw: Rec, label: string): Permit2Item | { error: string } {
  const amount = asBigInt(raw.amount);
  if (amount === null) {
    return { error: `We could not read the amount for ${label} in this request, so we cannot explain it safely.` };
  }
  let expiration: bigint | undefined;
  if (raw.expiration !== undefined && raw.expiration !== null) {
    const parsed = asBigInt(raw.expiration);
    if (parsed === null) {
      return { error: `We could not read the expiry date for ${label} in this request, so we cannot explain it safely.` };
    }
    expiration = parsed;
  }
  return {
    token: stringifyValue(raw.token),
    amount,
    unlimited: amount >= UINT160_UNLIMITED_THRESHOLD,
    expiration,
  };
}

function explainPermit2(
  message: Rec,
  domain: TypedDataExplanation['domain'],
  risks: RiskFinding[],
  nowSec: bigint,
  batch: boolean,
): TypedDataExplanation | { error: string } {
  const spender = 'spender' in message ? stringifyValue(message.spender) : undefined;

  let sigDeadline: bigint | undefined;
  if (message.sigDeadline !== undefined && message.sigDeadline !== null) {
    const parsed = asBigInt(message.sigDeadline);
    if (parsed === null) {
      return { error: 'We could not read the signing deadline in this request, so we cannot explain it safely.' };
    }
    sigDeadline = parsed;
  }

  const items: Permit2Item[] = [];
  if (batch) {
    const rawItems = message.details as unknown[];
    for (let i = 0; i < rawItems.length; i += 1) {
      const raw = rawItems[i];
      if (!isRecord(raw)) {
        return { error: `We could not read token ${i + 1} in this request, so we cannot explain it safely.` };
      }
      const item = parsePermit2Item(raw, `token ${i + 1}`);
      if ('error' in item) return item;
      items.push(item);
    }
  } else {
    const item = parsePermit2Item(message.details as Rec, 'the token');
    if ('error' in item) return item;
    items.push(item);
  }

  const spenderLabel = spender ?? 'the spender named in this request';
  if (items.some((item) => item.unlimited)) {
    risks.push(unlimitedRisk(spenderLabel));
  }
  for (const item of items) {
    if (item.expiration !== undefined) {
      const found = deadlineRisks(item.expiration, nowSec);
      // One deadline warning per id is enough, even across several tokens.
      for (const risk of found) {
        if (!risks.some((existing) => existing.id === risk.id)) risks.push(risk);
      }
    }
  }

  const bullets: string[] = [];
  if (batch) {
    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      bullets.push(`Token ${i + 1}: ${item.token}`);
      bullets.push(`Token ${i + 1} amount: ${describeAmount(item.amount, item.unlimited)}`);
      if (item.expiration !== undefined) {
        bullets.push(`Token ${i + 1} approval lasts until: ${formatUnixSeconds(item.expiration)}`);
      }
    }
  } else {
    const item = items[0];
    bullets.push(`Token: ${item.token}`);
    bullets.push(`How much: ${describeAmount(item.amount, item.unlimited)}`);
    if (item.expiration !== undefined) {
      bullets.push(`Approval lasts until: ${formatUnixSeconds(item.expiration)}`);
    }
  }
  if (spender !== undefined) bullets.push(`Who can spend: ${spender}`);
  if (sigDeadline !== undefined) {
    bullets.push(`Signature must be used by: ${formatUnixSeconds(sigDeadline)}`);
  }

  const what = batch ? `${items.length} tokens` : 'this token';
  return {
    kind: batch ? 'permit2-batch' : 'permit2-single',
    headline: PERMIT2_HEADLINE,
    outcome:
      `If you sign, ${spenderLabel} becomes allowed to take ${what} from your wallet through the Permit2 system ` +
      'until the expiry date. Signing is free and moves nothing right now — the effect kicks in whenever ' +
      'the spender chooses to use your signature.',
    bullets,
    risks,
    domain,
  };
}

function explainGeneric(
  message: Rec,
  domain: TypedDataExplanation['domain'],
  risks: RiskFinding[],
  primaryType: string | undefined,
): TypedDataExplanation {
  const bullets: string[] = [];
  if (primaryType) bullets.push(`Type of data: ${primaryType}`);
  if (domain.name) bullets.push(`App or contract name: ${domain.name}`);
  if (domain.verifyingContract) {
    bullets.push(`Contract that will check this signature: ${domain.verifyingContract}`);
  }
  for (const [key, value] of Object.entries(message).slice(0, 8)) {
    bullets.push(`${key}: ${truncate(stringifyValue(value), 60)}`);
  }

  risks.push(signatureCanMoveFundsRisk());

  return {
    kind: 'generic',
    headline: GENERIC_HEADLINE,
    outcome:
      'We could not match this request to a known pattern, so we cannot say exactly what signing it will do. ' +
      'Read every field below and make sure it matches what the app told you before you sign.',
    bullets,
    risks,
    domain,
  };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export function explainTypedData(
  value: unknown,
  opts?: { expectedChainIds?: number[]; nowMs?: number },
): TypedDataExplanation | { error: string } {
  try {
    let candidate: unknown = value;
    if (typeof candidate === 'string') {
      try {
        candidate = JSON.parse(candidate);
      } catch {
        return {
          error: 'We could not read this text as a signature request — it is not valid JSON.',
        };
      }
    }
    if (!looksLikeTypedData(candidate)) {
      return { error: NOT_TYPED_DATA_ERROR };
    }

    const data = candidate as Rec;
    const message = data.message as Rec;
    const primaryType = typeof data.primaryType === 'string' ? data.primaryType : undefined;
    const domain = extractDomain(data.domain);
    const nowMs = opts?.nowMs ?? Date.now();
    const nowSec = BigInt(Math.floor(nowMs / 1000));

    const risks: RiskFinding[] = [];

    // Network check applies to every kind.
    const rawDomain = isRecord(data.domain) ? data.domain : undefined;
    const chainIdPresent =
      rawDomain !== undefined && rawDomain.chainId !== undefined && rawDomain.chainId !== null;
    const expected = opts?.expectedChainIds;
    if (chainIdPresent && expected !== undefined && expected.length > 0) {
      const actual = asBigInt(rawDomain.chainId);
      const matches = actual !== null && expected.some((id) => BigInt(id) === actual);
      if (!matches) risks.push(differentNetworkRisk());
    }

    // ERC-2612 Permit
    if (
      primaryType === 'Permit' &&
      'owner' in message &&
      'spender' in message &&
      'value' in message &&
      'deadline' in message
    ) {
      return explainPermit(message, domain, risks, nowSec);
    }

    // Permit2 (single or batch)
    const isPermit2 =
      domain.name === 'Permit2' || primaryType === 'PermitSingle' || primaryType === 'PermitBatch';
    if (isPermit2) {
      if (Array.isArray(message.details)) {
        return explainPermit2(message, domain, risks, nowSec, true);
      }
      if (isRecord(message.details)) {
        return explainPermit2(message, domain, risks, nowSec, false);
      }
      // Claims to be Permit2 but has no recognizable details — explain generically.
    }

    return explainGeneric(message, domain, risks, primaryType);
  } catch {
    return {
      error: 'Something in this signature request could not be read, so we cannot explain it safely.',
    };
  }
}
