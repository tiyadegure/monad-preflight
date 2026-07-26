/**
 * Signature-request triage: one entry point for the three shapes that
 * arrive through a "please sign this" box — an EIP-7702 delegation
 * request, an EIP-5792 batch, or EIP-712 typed data — checked in that
 * order, because handing over the wallet is worse than anything a permit
 * can do.
 *
 * Shared by the Signatures tab and the Risk API worker so both explain a
 * payload identically.
 */

import type { Address, RiskFinding } from './types';
import { explainTypedData, looksLikeTypedData } from './typeddata';
import { explainAuthorization, looksLikeAuthorization } from './delegation';
import { batchRisks, describeBatch, looksLikeBatch, parseBatch } from './batch';
import { shortAddress } from './format';

export type SignatureKind = 'authorization' | 'batch' | 'typed-data';

/** What the triage concluded, whichever of the three kinds it was. */
export interface SignatureReading {
  kind: SignatureKind;
  headline: string;
  outcome: string;
  bullets: string[];
  risks: RiskFinding[];
}

export interface InspectOptions {
  /** Chain ids the user is actually on — mismatches become findings. */
  expectedChainIds: number[];
  /** The user's own address, when known (sharpens delegation warnings). */
  selfAddress?: Address;
}

export type InspectResult = SignatureReading | { error: string };

export function inspectSignaturePayload(
  parsed: unknown,
  opts: InspectOptions,
): InspectResult {
  if (looksLikeAuthorization(parsed)) {
    const r = explainAuthorization(parsed, {
      expectedChainIds: opts.expectedChainIds,
      ...(opts.selfAddress ? { selfAddress: opts.selfAddress } : {}),
    });
    return { kind: 'authorization', ...r };
  }

  if (looksLikeBatch(parsed)) {
    const b = parseBatch(parsed);
    if ('error' in b) return b;
    return {
      kind: 'batch',
      headline: 'This is several instructions behind one confirmation',
      outcome:
        `${describeBatch(b)} Your wallet may show you only one of them, so read each ` +
        'line below before you approve it.',
      bullets: b.calls
        .map(
          (c) =>
            `Instruction ${c.index + 1}: send ${c.value > 0n ? `${c.value.toString()} wei and ` : ''}` +
            `instructions to ${shortAddress(c.to)}`,
        )
        .concat(b.notes),
      risks: batchRisks(b),
    };
  }

  if (!looksLikeTypedData(parsed)) {
    return {
      error:
        'We do not recognise this. PreFlight can explain a signature request (it has ' +
        '"types" and "message"), a wallet-takeover request, or a batch of instructions.',
    };
  }
  const t = explainTypedData(parsed, { expectedChainIds: opts.expectedChainIds });
  if ('error' in t) return t;
  return {
    kind: 'typed-data',
    headline: t.headline,
    outcome: t.outcome,
    bullets: t.bullets,
    risks: t.risks,
  };
}
