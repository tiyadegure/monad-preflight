/**
 * EIP-7702 delegation detection and explanation for Monad PreFlight.
 *
 * One signature of the right shape makes a normal wallet run
 * attacker-chosen code permanently, and nothing about it shows up in the
 * fields wallets usually display. This module does two jobs:
 *
 *  1. detectDelegation — read an account's on-chain code and recognize
 *     the 23-byte delegation marker (0xef0100 + 20-byte address).
 *  2. explainAuthorization — take a signing request of that shape and
 *     explain, in plain language, what saying yes would actually do.
 *
 * Everything here is pure and deterministic: no network, no throwing.
 */

import { getAddress } from 'viem';
import type { Address, RiskFinding } from './types';
import { shortAddress } from './format';
import { t } from './i18n';
import type { Lang } from './i18n';

/* ------------------------------------------------------------------ */
/* Detection                                                           */
/* ------------------------------------------------------------------ */

export const DELEGATION_PREFIX = '0xef0100';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** 23 bytes: 3-byte marker + 20-byte address = 46 hex characters. */
const DESIGNATOR_HEX_LENGTH = 46;

export interface Delegation {
  delegated: boolean;
  implementation?: Address;
}

/**
 * Recognize an EIP-7702 delegation designator in account code.
 *
 * A delegated account has EXACTLY 23 bytes of code: 0xef0100 followed by
 * the 20-byte address the wallet now runs. Anything longer or shorter is
 * an ordinary contract, not a delegation. Case-insensitive, tolerates a
 * missing 0x prefix, never throws.
 */
export function detectDelegation(code: string | null | undefined): Delegation {
  if (typeof code !== 'string') return { delegated: false };
  let hex = code.trim().toLowerCase();
  if (hex.startsWith('0x')) hex = hex.slice(2);
  if (hex.length !== DESIGNATOR_HEX_LENGTH) return { delegated: false };
  if (!hex.startsWith('ef0100')) return { delegated: false };
  const addressPart = hex.slice(6);
  if (!/^[0-9a-f]{40}$/.test(addressPart)) return { delegated: false };
  try {
    return { delegated: true, implementation: getAddress(`0x${addressPart}`) };
  } catch {
    return { delegated: false };
  }
}

/* ------------------------------------------------------------------ */
/* Risk findings from detected delegations                             */
/* ------------------------------------------------------------------ */

export interface DelegationRiskInput {
  self: Delegation;
  counterparty?: Delegation;
  counterpartyIsRecipient?: boolean;
}

export function assessDelegationRisks(
  input: DelegationRiskInput,
  lang: Lang = 'en',
): RiskFinding[] {
  const findings: RiskFinding[] = [];

  if (input.self.delegated) {
    const where = input.self.implementation
      ? shortAddress(input.self.implementation)
      : t(lang, 'dl.unreadableWhere');
    findings.push({
      id: 'self-delegated',
      severity: 'danger',
      title: t(lang, 'dl.selfDelegatedTitle'),
      detail: t(lang, 'dl.selfDelegatedDetail', { where }),
    });
  }

  if (input.counterparty?.delegated && input.counterpartyIsRecipient !== false) {
    findings.push({
      id: 'recipient-delegated',
      severity: 'caution',
      title: t(lang, 'dl.recipientDelegatedTitle'),
      detail: t(lang, 'dl.recipientDelegatedDetail'),
    });
  }

  return findings;
}

/* ------------------------------------------------------------------ */
/* Authorization requests (the signature that CREATES a delegation)    */
/* ------------------------------------------------------------------ */

export interface AuthorizationLike {
  chainId?: unknown;
  address?: unknown;
  nonce?: unknown;
}

export interface AuthorizationExplanation {
  headline: string;
  outcome: string;
  bullets: string[];
  risks: RiskFinding[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAddressString(value: unknown): value is string {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * True for an object that looks like a delegation-signing request:
 * an `address` field holding a 0x-address plus a chainId or nonce field,
 * OR an object carrying an `authorizationList` array. Never throws.
 */
export function looksLikeAuthorization(value: unknown): boolean {
  if (!isRecord(value)) return false;
  if (Array.isArray(value['authorizationList'])) return true;
  if (!isAddressString(value['address'])) return false;
  return 'chainId' in value || 'nonce' in value;
}

/** Best-effort read of a network id from number, bigint, or string. */
function readChainId(value: unknown): number | undefined {
  try {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) return value;
    if (typeof value === 'bigint' && value >= 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)) {
      return Number(value);
    }
    if (typeof value === 'string') {
      const s = value.trim();
      if (s === '') return undefined;
      const n = /^0x[0-9a-fA-F]+$/.test(s) ? Number.parseInt(s, 16) : Number(s);
      if (Number.isInteger(n) && n >= 0) return n;
    }
  } catch {
    /* unreadable — treat as unknown */
  }
  return undefined;
}

interface ParsedEntry {
  address: Address;
  chainId?: number;
  isRevoke: boolean;
}

/** Extract the list of entries to explain, or null when malformed. */
function extractEntries(value: unknown): ParsedEntry[] | null {
  let root: unknown = value;

  if (typeof root === 'string') {
    try {
      root = JSON.parse(root);
    } catch {
      return null;
    }
  }
  if (!isRecord(root)) return null;

  let rawEntries: unknown[];
  const list = root['authorizationList'];
  if (Array.isArray(list)) {
    if (list.length === 0) return null;
    rawEntries = list;
  } else {
    rawEntries = [root];
  }

  const entries: ParsedEntry[] = [];
  for (const raw of rawEntries) {
    if (!isRecord(raw) || !isAddressString(raw['address'])) return null;
    let address: Address;
    try {
      address = getAddress(raw['address']);
    } catch {
      return null;
    }
    entries.push({
      address,
      chainId: readChainId(raw['chainId']),
      isRevoke: address.toLowerCase() === ZERO_ADDRESS,
    });
  }
  return entries;
}

/**
 * Explain a delegation-signing request in plain language.
 *
 * Accepts a single request object, an object with an authorizationList
 * (every entry is explained), or a JSON string of either. Never throws;
 * anything unreadable comes back as { error }.
 */
export function explainAuthorization(
  value: unknown,
  opts?: { expectedChainIds?: number[]; selfAddress?: Address; lang?: Lang },
): AuthorizationExplanation | { error: string } {
  const lang: Lang = opts?.lang ?? 'en';
  const entries = extractEntries(value);
  if (entries === null) return { error: t(lang, 'dl.malformed') };

  const allRevoke = entries.every((e) => e.isRevoke);
  const bullets: string[] = [];
  const risks: RiskFinding[] = [];
  let anyChainZero = false;
  let anyUnexpectedChain = false;

  for (const entry of entries) {
    if (entry.isRevoke) {
      bullets.push(t(lang, 'dl.revokeEntry', { address: ZERO_ADDRESS }));
    } else {
      bullets.push(
        t(lang, 'dl.programEntry', {
          short: shortAddress(entry.address),
          full: entry.address,
        }),
      );
    }

    if (entry.chainId === 0) {
      anyChainZero = true;
      bullets.push(t(lang, 'dl.everyNetwork'));
    } else if (entry.chainId !== undefined) {
      bullets.push(t(lang, 'dl.networkN', { n: entry.chainId }));
      if (
        opts?.expectedChainIds !== undefined &&
        !opts.expectedChainIds.includes(entry.chainId)
      ) {
        anyUnexpectedChain = true;
      }
    } else {
      bullets.push(t(lang, 'dl.networkUnreadable'));
    }

    if (opts?.selfAddress !== undefined && !entry.isRevoke) {
      if (entry.address.toLowerCase() === opts.selfAddress.toLowerCase()) {
        bullets.push(t(lang, 'dl.selfAddress'));
      } else {
        bullets.push(
          t(lang, 'dl.installsInto', { wallet: shortAddress(opts.selfAddress) }),
        );
      }
    }
  }

  const revokeDetailBase = t(lang, 'dl.revokeDetailBase', { address: ZERO_ADDRESS });

  if (allRevoke) {
    risks.push({
      id: 'delegation-revoke',
      severity: 'info',
      title: t(lang, 'dl.revokeRiskTitle'),
      detail: t(lang, 'dl.revokeRiskDetail', { base: revokeDetailBase }),
    });
    return {
      headline: t(lang, 'dl.revokeHeadline'),
      outcome: t(lang, 'dl.revokeOutcome'),
      bullets,
      risks,
    };
  }

  risks.push({
    id: 'delegation-request',
    severity: 'danger',
    title: t(lang, 'dl.requestTitle'),
    detail: t(lang, 'dl.requestDetail'),
  });

  if (anyChainZero) {
    risks.push({
      id: 'delegation-any-chain',
      severity: 'danger',
      title: t(lang, 'dl.anyChainTitle'),
      detail: t(lang, 'dl.anyChainDetail'),
    });
  }

  if (anyUnexpectedChain) {
    risks.push({
      id: 'delegation-unknown-network',
      severity: 'caution',
      title: t(lang, 'dl.unknownNetworkTitle'),
      detail: t(lang, 'dl.unknownNetworkDetail'),
    });
  }

  risks.push({
    id: 'delegation-revoke',
    severity: 'info',
    title: t(lang, 'dl.undoTitle'),
    detail: t(lang, 'dl.undoDetail', { base: revokeDetailBase }),
  });

  return {
    headline: t(lang, 'dl.takeoverHeadline'),
    outcome: t(lang, 'dl.takeoverOutcome'),
    bullets,
    risks,
  };
}
