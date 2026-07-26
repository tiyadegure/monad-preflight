import { describe, expect, it } from 'vitest';
import { explainTypedData } from '../src/lib/typeddata';
import type { TypedDataExplanation } from '../src/lib/typeddata';

/**
 * Regression tests for the decoy-field attack.
 *
 * A wallet hashes ONLY the fields declared in types[primaryType]. Extra
 * keys in `message` are ignored by the wallet — but an explainer that
 * reads `message` alone would report them as if they were the deal. That
 * lets an attacker show one thing and have the user sign another, on the
 * one screen whose entire job is "see what signing authorizes".
 */

const VICTIM = '0x1111111111111111111111111111111111111111';
const ATTACKER = '0x2222222222222222222222222222222222222222';
const NOW_MS = 1_800_000_000_000;

function explain(v: unknown): TypedDataExplanation {
  const r = explainTypedData(v, { nowMs: NOW_MS });
  if ('error' in r) throw new Error(`expected an explanation, got: ${r.error}`);
  return r;
}

describe('EIP-712 decoy fields', () => {
  it('refuses the confident permit path when message carries undeclared fields', () => {
    // The wallet signs a DAI-style permit: allowed=true, expiry=0 means an
    // unlimited, never-expiring approval. The owner/value/deadline keys are
    // decoys the wallet never hashes.
    const attack = {
      primaryType: 'Permit',
      domain: { name: 'Some Token', chainId: 10143 },
      types: {
        Permit: [
          { name: 'holder', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'nonce', type: 'uint256' },
          { name: 'expiry', type: 'uint256' },
          { name: 'allowed', type: 'bool' },
        ],
      },
      message: {
        holder: VICTIM,
        spender: ATTACKER,
        nonce: 0,
        expiry: 0,
        allowed: true,
        // decoys:
        owner: VICTIM,
        value: '1000000',
        deadline: String(Math.floor(NOW_MS / 1000) + 3600),
      },
    };

    const result = explain(attack);

    // It must NOT take the confident "this is a normal permit" path.
    expect(result.kind).toBe('generic');
    // It must raise a danger finding naming the hidden fields.
    const ids = result.risks.map((r) => r.id);
    expect(ids).toContain('undeclared-fields');
    expect(result.risks.find((r) => r.id === 'undeclared-fields')?.severity).toBe('danger');
    // And it must never present the decoy amount as the amount at stake.
    const shown = [...result.bullets, result.outcome, result.headline].join(' ');
    expect(shown).not.toMatch(/How much: 1000000/);
  });

  it('marks each undeclared field as one the wallet will not sign', () => {
    const result = explain({
      primaryType: 'Order',
      domain: { name: 'DEX' },
      types: { Order: [{ name: 'maker', type: 'address' }] },
      message: { maker: VICTIM, secretPayout: ATTACKER },
    });

    const secretLine = result.bullets.find((b) => b.startsWith('secretPayout:'));
    expect(secretLine).toBeDefined();
    expect(secretLine).toMatch(/will NOT sign/i);
    // The declared field carries no such marker.
    expect(result.bullets.find((b) => b.startsWith('maker:'))).not.toMatch(/will NOT sign/i);
  });

  it('still explains an honest permit whose message matches its declared type', () => {
    const honest = {
      primaryType: 'Permit',
      domain: { name: 'tUSD', chainId: 10143, verifyingContract: ATTACKER },
      types: {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      message: {
        owner: VICTIM,
        spender: ATTACKER,
        value: '1000000',
        nonce: 0,
        deadline: String(Math.floor(NOW_MS / 1000) + 3600),
      },
    };

    const result = explain(honest);
    expect(result.kind).toBe('permit');
    expect(result.risks.map((r) => r.id)).not.toContain('undeclared-fields');
    expect(result.bullets.join(' ')).toContain(ATTACKER);
  });

  it('flags an unlimited honest permit as danger', () => {
    const max = (2n ** 256n - 1n).toString();
    const result = explain({
      primaryType: 'Permit',
      domain: { name: 'tUSD', chainId: 10143 },
      types: {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      message: {
        owner: VICTIM,
        spender: ATTACKER,
        value: max,
        deadline: String(Math.floor(NOW_MS / 1000) + 3600),
      },
    });

    expect(result.kind).toBe('permit');
    expect(result.risks.map((r) => r.id)).toContain('unlimited-permit');
  });

  it('does not claim the permission expires with the signature deadline', () => {
    const result = explain({
      primaryType: 'Permit',
      domain: { name: 'tUSD', chainId: 10143 },
      types: {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      message: {
        owner: VICTIM,
        spender: ATTACKER,
        value: '5',
        deadline: String(Math.floor(NOW_MS / 1000) + 3600),
      },
    });

    const text = [...result.bullets, result.outcome].join(' ');
    // The old wording implied the approval itself lapsed at the deadline.
    expect(text).toMatch(/does not expire on its own|stays open until you revoke/i);
  });

  it('never tells the user to read every field while hiding some', () => {
    const message: Record<string, string> = {};
    for (let i = 0; i < 30; i++) message[`field${i}`] = `v${i}`;

    const result = explain({
      primaryType: 'Big',
      domain: { name: 'X' },
      types: { Big: Object.keys(message).map((n) => ({ name: n, type: 'string' })) },
      message,
    });

    const text = [...result.bullets, result.outcome].join(' ');
    expect(text).toMatch(/more field/i);
    expect(text).toMatch(/unreviewed/i);
    expect(result.outcome).not.toMatch(/Read every field below/);
  });
});
