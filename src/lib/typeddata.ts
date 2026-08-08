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
import { t } from './i18n';
import type { Lang } from './i18n';

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

const PERMIT_HEADLINE_KEY = 'td.permitHeadline';
const PERMIT2_HEADLINE_KEY = 'td.permit2Headline';
const GENERIC_HEADLINE_KEY = 'td.genericHeadline';

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

function formatUnixSeconds(sec: bigint, lang: Lang): string {
  if (sec < 0n) return t(lang, 'td.unreadableDate');
  if (sec > FAR_FUTURE_SEC) return t(lang, 'td.neverExpires');
  return new Date(Number(sec) * 1000).toUTCString();
}

function describeAmount(amount: bigint, unlimited: boolean, lang: Lang): string {
  if (unlimited) return t(lang, 'td.amountUnlimited');
  return t(lang, 'td.amountCapped', {
    amount: amount.toString(),
    caveat: t(lang, 'td.amountCaveat'),
  });
}

/* ------------------------------------------------------------------ */
/* Risk builders                                                       */
/* ------------------------------------------------------------------ */

function unlimitedRisk(spender: string, lang: Lang): RiskFinding {
  return {
    id: 'unlimited-permit',
    severity: 'danger',
    title: t(lang, 'td.unlimitedRiskTitle'),
    detail: t(lang, 'td.unlimitedRiskDetail', { spender }),
  };
}

function deadlineRisks(deadlineSec: bigint, nowSec: bigint, lang: Lang): RiskFinding[] {
  if (deadlineSec < nowSec) {
    return [
      {
        id: 'expired-permit',
        severity: 'info',
        title: t(lang, 'td.expiredTitle'),
        detail: t(lang, 'td.expiredDetail'),
      },
    ];
  }
  if (deadlineSec - nowSec > THIRTY_DAYS_SEC) {
    return [
      {
        id: 'long-deadline',
        severity: 'caution',
        title: t(lang, 'td.longDeadlineTitle'),
        detail: t(lang, 'td.longDeadlineDetail', {
          date: formatUnixSeconds(deadlineSec, lang),
        }),
      },
    ];
  }
  return [];
}

function differentNetworkRisk(lang: Lang): RiskFinding {
  return {
    id: 'different-network',
    severity: 'caution',
    title: t(lang, 'td.networkTitle'),
    detail: t(lang, 'td.networkDetail'),
  };
}

function signatureCanMoveFundsRisk(lang: Lang): RiskFinding {
  return {
    id: 'signature-can-move-funds',
    severity: 'caution',
    title: t(lang, 'td.signatureMovesTitle'),
    detail: t(lang, 'td.signatureMovesDetail'),
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
  lang: Lang,
): TypedDataExplanation | { error: string } {
  const spender = stringifyValue(message.spender);
  const amount = asBigInt(message.value);
  if (amount === null) {
    return { error: t(lang, 'td.cantReadAmount') };
  }
  const deadline = asBigInt(message.deadline);
  if (deadline === null) {
    return { error: t(lang, 'td.cantReadDeadline') };
  }

  const unlimited = amount >= UNLIMITED_THRESHOLD;
  if (unlimited) risks.push(unlimitedRisk(spender, lang));
  risks.push(...deadlineRisks(deadline, nowSec, lang));

  const bullets = [
    t(lang, 'td.whoCanSpend', { spender }),
    t(lang, 'td.howMuch', { amount: describeAmount(amount, unlimited, lang) }),
    // The deadline bounds when the SIGNATURE can be redeemed — it does not
    // bound the permission it creates. Once redeemed, the spending
    // permission sits on the token forever until revoked. Saying "valid
    // until" alone would leave people thinking it expires on its own.
    t(lang, 'td.useBy', { date: formatUnixSeconds(deadline, lang) }),
    t(lang, 'td.deadlineClarify'),
  ];
  if (domain.verifyingContract) {
    bullets.push(t(lang, 'td.tokenContract', { address: domain.verifyingContract }));
  }

  return {
    kind: 'permit',
    headline: t(lang, PERMIT_HEADLINE_KEY),
    outcome: t(lang, 'td.permitOutcome', {
      spender,
      anyAmount: unlimited
        ? t(lang, 'td.anyAmount')
        : t(lang, 'td.statedAmount'),
    }),
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

function parsePermit2Item(raw: Rec, label: string, lang: Lang): Permit2Item | { error: string } {
  const amount = asBigInt(raw.amount);
  if (amount === null) {
    return { error: t(lang, 'td.cantReadAmountLabel', { label }) };
  }
  let expiration: bigint | undefined;
  if (raw.expiration !== undefined && raw.expiration !== null) {
    const parsed = asBigInt(raw.expiration);
    if (parsed === null) {
      return { error: t(lang, 'td.cantReadExpiryLabel', { label }) };
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
  lang: Lang,
): TypedDataExplanation | { error: string } {
  const spender = 'spender' in message ? stringifyValue(message.spender) : undefined;

  let sigDeadline: bigint | undefined;
  if (message.sigDeadline !== undefined && message.sigDeadline !== null) {
    const parsed = asBigInt(message.sigDeadline);
    if (parsed === null) {
      return { error: t(lang, 'td.cantReadSigningDeadline') };
    }
    sigDeadline = parsed;
  }

  const items: Permit2Item[] = [];
  if (batch) {
    const rawItems = message.details as unknown[];
    for (let i = 0; i < rawItems.length; i += 1) {
      const raw = rawItems[i];
      if (!isRecord(raw)) {
        return { error: t(lang, 'td.cantReadTokenN', { n: i + 1 }) };
      }
      const item = parsePermit2Item(raw, t(lang, 'td.tokenNLabel', { n: i + 1 }), lang);
      if ('error' in item) return item;
      items.push(item);
    }
  } else {
    const item = parsePermit2Item(message.details as Rec, t(lang, 'td.theToken'), lang);
    if ('error' in item) return item;
    items.push(item);
  }

  const spenderLabel = spender ?? t(lang, 'td.spenderNamed');
  if (items.some((item) => item.unlimited)) {
    risks.push(unlimitedRisk(spenderLabel, lang));
  }
  for (const item of items) {
    if (item.expiration !== undefined) {
      const found = deadlineRisks(item.expiration, nowSec, lang);
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
      bullets.push(t(lang, 'td.tokenN', { n: i + 1, token: item.token }));
      bullets.push(
        t(lang, 'td.tokenNAmount', {
          n: i + 1,
          amount: describeAmount(item.amount, item.unlimited, lang),
        }),
      );
      if (item.expiration !== undefined) {
        bullets.push(
          t(lang, 'td.tokenNUntil', {
            n: i + 1,
            date: formatUnixSeconds(item.expiration, lang),
          }),
        );
      }
    }
  } else {
    const item = items[0];
    bullets.push(t(lang, 'td.token', { token: item.token }));
    bullets.push(
      t(lang, 'td.howMuch', { amount: describeAmount(item.amount, item.unlimited, lang) }),
    );
    if (item.expiration !== undefined) {
      bullets.push(
        t(lang, 'td.approvalUntil', { date: formatUnixSeconds(item.expiration, lang) }),
      );
    }
  }
  if (spender !== undefined) bullets.push(t(lang, 'td.whoCanSpend', { spender }));
  if (sigDeadline !== undefined) {
    bullets.push(t(lang, 'td.useBy', { date: formatUnixSeconds(sigDeadline, lang) }));
  }

  const what = batch
    ? t(lang, 'td.nTokens', { n: items.length })
    : t(lang, 'td.thisToken');
  return {
    kind: batch ? 'permit2-batch' : 'permit2-single',
    headline: t(lang, PERMIT2_HEADLINE_KEY),
    outcome: t(lang, 'td.permit2Outcome', { spender: spenderLabel, what }),
    bullets,
    risks,
    domain,
  };
}

/** Fields we always show in full, even past the display cap. */
const MAX_SHOWN_FIELDS = 12;

function explainGeneric(
  message: Rec,
  domain: TypedDataExplanation['domain'],
  risks: RiskFinding[],
  primaryType: string | undefined,
  lang: Lang,
  declaredFields: string[] | null = null,
): TypedDataExplanation {
  const bullets: string[] = [];
  if (primaryType) bullets.push(t(lang, 'td.typeOfData', { type: primaryType }));
  if (domain.name) bullets.push(t(lang, 'td.appName', { name: domain.name }));
  if (domain.verifyingContract) {
    bullets.push(t(lang, 'td.checkContract', { address: domain.verifyingContract }));
  }

  const entries = Object.entries(message);
  for (const [key, value] of entries.slice(0, MAX_SHOWN_FIELDS)) {
    // Mark fields the wallet will not actually sign, so a decoy cannot
    // read as part of the deal.
    const ignored =
      declaredFields !== null && !declaredFields.includes(key)
        ? t(lang, 'td.notSignedField')
        : '';
    bullets.push(`${key}: ${truncate(stringifyValue(value), 60)}${ignored}`);
  }
  // Never tell the user to "read every field" while hiding some of them.
  const hidden = entries.length - MAX_SHOWN_FIELDS;
  if (hidden > 0) {
    bullets.push(
      t(lang, hidden === 1 ? 'td.hiddenOne' : 'td.hiddenMany', { count: hidden }),
    );
  }

  risks.push(signatureCanMoveFundsRisk(lang));

  return {
    kind: 'generic',
    headline: t(lang, GENERIC_HEADLINE_KEY),
    outcome: t(lang, 'td.genericOutcome', {
      more: hidden > 0 ? t(lang, 'td.genericMore') : t(lang, 'td.genericReadAll'),
    }),
    bullets,
    risks,
    domain,
  };
}

/**
 * The field names the wallet will actually hash for `primaryType`.
 * Returns null when the request does not declare a usable type list — in
 * that case we cannot cross-check, and callers must stay on the cautious
 * generic path rather than assume agreement.
 */
function declaredFieldNames(types: unknown, primaryType: string | undefined): string[] | null {
  if (!primaryType || !isRecord(types)) return null;
  const fields = types[primaryType];
  if (!Array.isArray(fields) || fields.length === 0) return null;
  const names: string[] = [];
  for (const field of fields) {
    if (isRecord(field) && typeof field.name === 'string') names.push(field.name);
  }
  return names.length > 0 ? names : null;
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export function explainTypedData(
  value: unknown,
  opts?: { expectedChainIds?: number[]; nowMs?: number; lang?: Lang },
): TypedDataExplanation | { error: string } {
  const lang: Lang = opts?.lang ?? 'en';
  try {
    let candidate: unknown = value;
    if (typeof candidate === 'string') {
      try {
        candidate = JSON.parse(candidate);
      } catch {
        return {
          error: t(lang, 'td.notJson'),
        };
      }
    }
    if (!looksLikeTypedData(candidate)) {
      return { error: t(lang, 'td.notTypedData') };
    }

    const data = candidate as Rec;
    const message = data.message as Rec;
    const primaryType = typeof data.primaryType === 'string' ? data.primaryType : undefined;
    const domain = extractDomain(data.domain);
    const nowMs = opts?.nowMs ?? Date.now();
    const nowSec = BigInt(Math.floor(nowMs / 1000));

    const risks: RiskFinding[] = [];

    /*
     * SECURITY — the declared type is the source of truth, not `message`.
     *
     * A wallet hashes ONLY the fields listed in types[primaryType]. Any
     * extra key in `message` is ignored by the wallet but would still be
     * read by a naive explainer. That gap is exploitable: an attacker can
     * declare a dangerous struct (say a DAI-style permit with `allowed`
     * and `expiry`) while stuffing `message` with harmless-looking
     * `value`/`deadline` decoys, and a message-only explainer would
     * confidently print the decoys and raise no warning at all.
     *
     * So: resolve the declared field list first, and refuse the confident
     * paths unless the fields we are about to explain are the fields the
     * wallet will actually sign.
     */
    const declaredFields = declaredFieldNames(data.types, primaryType);
    const undeclared =
      declaredFields === null
        ? []
        : Object.keys(message).filter((k) => !declaredFields.includes(k));

    if (undeclared.length > 0) {
      risks.push({
        id: 'undeclared-fields',
        severity: 'danger',
        title: t(lang, 'td.undeclaredTitle'),
        detail:
          undeclared.length === 1
            ? t(lang, 'td.undeclaredOne', {
                names: undeclared.slice(0, 4).join(', '),
              })
            : t(lang, 'td.undeclaredMany', {
                count: undeclared.length,
                names: undeclared.slice(0, 4).join(', '),
              }),
      });
    }

    /** True when every field we would explain is one the wallet signs. */
    const declares = (...names: string[]): boolean =>
      declaredFields === null || names.every((n) => declaredFields.includes(n));

    // Network check applies to every kind.
    const rawDomain = isRecord(data.domain) ? data.domain : undefined;
    const chainIdPresent =
      rawDomain !== undefined && rawDomain.chainId !== undefined && rawDomain.chainId !== null;
    const expected = opts?.expectedChainIds;
    if (chainIdPresent && expected !== undefined && expected.length > 0) {
      const actual = asBigInt(rawDomain.chainId);
      const matches = actual !== null && expected.some((id) => BigInt(id) === actual);
      if (!matches) risks.push(differentNetworkRisk(lang));
    }

    // ERC-2612 Permit — only when the declared type really is that permit.
    if (
      primaryType === 'Permit' &&
      'owner' in message &&
      'spender' in message &&
      'value' in message &&
      'deadline' in message &&
      declares('owner', 'spender', 'value', 'deadline') &&
      undeclared.length === 0
    ) {
      return explainPermit(message, domain, risks, nowSec, lang);
    }

    // Permit2 (single or batch)
    const isPermit2 =
      domain.name === 'Permit2' || primaryType === 'PermitSingle' || primaryType === 'PermitBatch';
    if (isPermit2 && undeclared.length === 0 && declares('details')) {
      if (Array.isArray(message.details)) {
        return explainPermit2(message, domain, risks, nowSec, true, lang);
      }
      if (isRecord(message.details)) {
        return explainPermit2(message, domain, risks, nowSec, false, lang);
      }
      // Claims to be Permit2 but has no recognizable details — explain generically.
    }

    // Generic path: shows every field, and never claims to know the shape.
    // Anything that failed the checks above lands here deliberately — a
    // request we cannot vouch for must show more, not less.
    return explainGeneric(message, domain, risks, primaryType, lang, declaredFields);
  } catch {
    return {
      error: t(lang, 'td.unreadable'),
    };
  }
}
