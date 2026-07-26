/**
 * Defenses against the scam wave Monad actually experienced.
 *
 * Within 48 hours of mainnet launch (2025-11-25), scammers flooded Monad
 * with spoofed ERC-20 transfers — fabricated Transfer events that look
 * like real payments in explorers and wallets (co-founder James Hunsaker
 * warned that fakes appeared to come from his own wallet). The events
 * move nothing; their job is to plant lookalike addresses in your
 * history and lure you toward phishing claims and malicious approvals.
 *
 * Everything here is deterministic and local: comparisons against the
 * user's OWN address book and OWN token registry, plus patterns readable
 * from the prepared transaction and its simulation trace. No external
 * blocklist, nothing to go stale or be censored.
 */

import type { PreparedTx, RiskFinding, SimulationResult, TokenInfo } from './types';
import { shortAddress } from './format';

/* ------------------------------------------------------------------ */
/* Lookalike addresses (the address-poisoning payoff)                  */
/* ------------------------------------------------------------------ */

/** Leading/trailing hex characters wallets typically display. */
const VISIBLE_PREFIX = 6; // includes "0x"
const VISIBLE_SUFFIX = 4;

/**
 * True when two DIFFERENT addresses render identically in the truncated
 * form wallets and explorers show (0x1234…abcd). This is exactly the
 * collision address-poisoning manufactures: the scammer grinds an
 * address whose visible ends match one you trust, plants it in your
 * history, and waits for a copy-paste.
 */
export function looksAlike(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return false;
  if (!/^0x[0-9a-f]{40}$/.test(x) || !/^0x[0-9a-f]{40}$/.test(y)) return false;
  return (
    x.slice(0, VISIBLE_PREFIX) === y.slice(0, VISIBLE_PREFIX) &&
    x.slice(-VISIBLE_SUFFIX) === y.slice(-VISIBLE_SUFFIX)
  );
}

/* ------------------------------------------------------------------ */
/* The combined check                                                  */
/* ------------------------------------------------------------------ */

export interface SpoofingInput {
  tx: PreparedTx;
  sim: SimulationResult;
  /**
   * Addresses the user demonstrably trusts — their address book, their
   * own account. A recipient that MIMICS one of these is the finding.
   */
  knownAddresses: readonly string[];
  /** Tokens the user has taught PreFlight (plus network canon like WMON). */
  knownTokens: readonly TokenInfo[];
}

export function assessSpoofing(input: SpoofingInput): RiskFinding[] {
  const findings: RiskFinding[] = [];
  const { tx, sim, knownAddresses, knownTokens } = input;

  // 1. Recipient is a lookalike of an address the user trusts.
  const target = tx.counterparty ?? tx.to;
  for (const known of knownAddresses) {
    if (looksAlike(target, known)) {
      findings.push({
        id: 'address-poisoning-lookalike',
        severity: 'danger',
        title: 'This address imitates one you trust',
        detail:
          `${shortAddress(target)} shows the same first and last characters as your saved ` +
          `address ${shortAddress(known)}, but it is a DIFFERENT address. Scammers ` +
          'manufacture such lookalikes and plant them in your transaction history so a ' +
          'copy-paste sends funds to them instead. Re-copy the address from the person ' +
          'who owns it — not from any transaction list.',
      });
      break;
    }
  }

  // 2. The token claims a symbol the user knows — from a different contract.
  if (tx.token?.address) {
    const impersonated = knownTokens.find(
      (k) =>
        k.address &&
        k.symbol.toLowerCase() === tx.token!.symbol.toLowerCase() &&
        k.address.toLowerCase() !== tx.token!.address!.toLowerCase(),
    );
    if (impersonated) {
      findings.push({
        id: 'token-impersonation',
        severity: 'danger',
        title: `This is not the ${impersonated.symbol} you know`,
        detail:
          `The contract at ${shortAddress(tx.token.address)} calls itself ` +
          `"${tx.token.symbol}", but the ${impersonated.symbol} you taught PreFlight lives at ` +
          `${shortAddress(impersonated.address!)}. Symbols are not unique — anyone can deploy ` +
          'a token with a famous name. Treat this one as a stranger wearing a name tag.',
      });
    }
  }

  // 3. Zero-value transfer FROM the user — the poisoning primitive.
  //    A transfer of nothing has one real use: emitting an event that
  //    plants an address pair in explorers and wallet histories.
  const zeroFromUser = sim.events.some(
    (e) =>
      e.name === 'Transfer' &&
      e.args &&
      (e.args.from ?? '').toLowerCase() === tx.from.toLowerCase() &&
      BigInt(e.args.value ?? '1') === 0n,
  );
  const zeroAmountIntent = tx.kind === 'erc20-transfer' && tx.amountRaw === 0n;
  if (zeroFromUser || zeroAmountIntent) {
    findings.push({
      id: 'zero-value-transfer',
      severity: 'caution',
      title: 'This transfers exactly nothing',
      detail:
        'A zero-amount transfer moves no tokens; its only effect is an event in ' +
        'transaction histories. That is the raw material of address poisoning — if ' +
        'you did not deliberately intend an empty transfer, decline it.',
    });
  }

  return findings;
}
