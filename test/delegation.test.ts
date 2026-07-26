import { describe, expect, it } from 'vitest';
import { getAddress } from 'viem';
import {
  DELEGATION_PREFIX,
  assessDelegationRisks,
  detectDelegation,
  explainAuthorization,
  looksLikeAuthorization,
} from '../src/lib/delegation';
import type { AuthorizationExplanation, Delegation } from '../src/lib/delegation';
import type { Address, RiskFinding } from '../src/lib/types';
import { shortAddress } from '../src/lib/format';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const IMPL_LOWER = '0x1234567890abcdef1234567890abcdef12345678';
const IMPL: Address = getAddress(IMPL_LOWER);
const SELF: Address = '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAAAAAaaaaaaa';
const ZERO: Address = '0x0000000000000000000000000000000000000000';

/** A real 23-byte designator: 0xef0100 + 20-byte address. */
const DESIGNATOR = `${DELEGATION_PREFIX}${IMPL_LOWER.slice(2)}`;

const NOT_DELEGATED: Delegation = { delegated: false };
const SELF_DELEGATED: Delegation = { delegated: true, implementation: IMPL };

function expectExplanation(
  result: AuthorizationExplanation | { error: string },
): AuthorizationExplanation {
  if ('error' in result) {
    throw new Error(`expected an explanation, got error: ${result.error}`);
  }
  return result;
}

/* ------------------------------------------------------------------ */
/* detectDelegation                                                    */
/* ------------------------------------------------------------------ */

describe('detectDelegation', () => {
  it('recognizes a real 23-byte designator and checksums the implementation', () => {
    const result = detectDelegation(DESIGNATOR);
    expect(result.delegated).toBe(true);
    expect(result.implementation).toBe(IMPL);
  });

  it('rejects 22 bytes of code (address one byte short)', () => {
    const short = `${DELEGATION_PREFIX}${IMPL_LOWER.slice(2, 40)}`; // 19-byte address
    expect(short.length).toBe(2 + 44); // 22 bytes
    expect(detectDelegation(short)).toEqual({ delegated: false });
  });

  it('rejects 24 bytes of code (one byte too long)', () => {
    const long = `${DESIGNATOR}ff`;
    expect(long.length).toBe(2 + 48); // 24 bytes
    expect(detectDelegation(long)).toEqual({ delegated: false });
  });

  it('rejects ordinary contract code that merely starts differently', () => {
    expect(detectDelegation('0x6080604052348015600f57600080fd5b50')).toEqual({
      delegated: false,
    });
  });

  it('rejects 23 bytes that do not start with the delegation marker', () => {
    const wrongPrefix = `0xab0100${IMPL_LOWER.slice(2)}`;
    expect(detectDelegation(wrongPrefix)).toEqual({ delegated: false });
  });

  it('returns not-delegated for "0x" (no code at all)', () => {
    expect(detectDelegation('0x')).toEqual({ delegated: false });
  });

  it('returns not-delegated for null and undefined without throwing', () => {
    expect(detectDelegation(null)).toEqual({ delegated: false });
    expect(detectDelegation(undefined)).toEqual({ delegated: false });
  });

  it('parses uppercase hex case-insensitively', () => {
    const upper = `0xEF0100${IMPL_LOWER.slice(2).toUpperCase()}`;
    const result = detectDelegation(upper);
    expect(result.delegated).toBe(true);
    expect(result.implementation).toBe(IMPL);
  });

  it('tolerates a missing 0x prefix', () => {
    const bare = DESIGNATOR.slice(2);
    const result = detectDelegation(bare);
    expect(result.delegated).toBe(true);
    expect(result.implementation).toBe(IMPL);
  });
});

/* ------------------------------------------------------------------ */
/* assessDelegationRisks                                               */
/* ------------------------------------------------------------------ */

describe('assessDelegationRisks', () => {
  it('flags the user\'s own delegated wallet as danger and names the address', () => {
    const findings = assessDelegationRisks({ self: SELF_DELEGATED });
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.id).toBe('self-delegated');
    expect(finding.severity).toBe('danger');
    expect(finding.title.split(/\s+/).length).toBeLessThanOrEqual(8);
    expect(finding.detail).toContain(shortAddress(IMPL));
  });

  it('flags a delegated recipient as caution', () => {
    const findings = assessDelegationRisks({
      self: NOT_DELEGATED,
      counterparty: SELF_DELEGATED,
      counterpartyIsRecipient: true,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]!.id).toBe('recipient-delegated');
    expect(findings[0]!.severity).toBe('caution');
  });

  it('reports both findings when wallet and recipient are both delegated', () => {
    const findings = assessDelegationRisks({
      self: SELF_DELEGATED,
      counterparty: { delegated: true, implementation: IMPL },
      counterpartyIsRecipient: true,
    });
    expect(findings.map((f) => f.id)).toEqual(['self-delegated', 'recipient-delegated']);
  });

  it('returns no findings when nothing is delegated', () => {
    expect(
      assessDelegationRisks({
        self: NOT_DELEGATED,
        counterparty: NOT_DELEGATED,
        counterpartyIsRecipient: true,
      }),
    ).toEqual([]);
  });

  it('stays quiet about a delegated counterparty that is not the recipient', () => {
    const findings = assessDelegationRisks({
      self: NOT_DELEGATED,
      counterparty: SELF_DELEGATED,
      counterpartyIsRecipient: false,
    });
    expect(findings).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/* looksLikeAuthorization                                              */
/* ------------------------------------------------------------------ */

describe('looksLikeAuthorization', () => {
  it('accepts an address plus chainId', () => {
    expect(looksLikeAuthorization({ address: IMPL, chainId: 1 })).toBe(true);
  });

  it('accepts an address plus nonce field', () => {
    expect(looksLikeAuthorization({ address: IMPL, nonce: 0 })).toBe(true);
  });

  it('accepts an object with an authorizationList array', () => {
    expect(looksLikeAuthorization({ authorizationList: [] })).toBe(true);
  });

  it('rejects an address with neither extra field', () => {
    expect(looksLikeAuthorization({ address: IMPL })).toBe(false);
  });

  it('rejects null, arrays, strings, and numbers without throwing', () => {
    expect(looksLikeAuthorization(null)).toBe(false);
    expect(looksLikeAuthorization([{ address: IMPL, chainId: 1 }])).toBe(false);
    expect(looksLikeAuthorization('{"address":"0x00"}')).toBe(false);
    expect(looksLikeAuthorization(42)).toBe(false);
  });

  it('rejects a malformed address value', () => {
    expect(looksLikeAuthorization({ address: 'not-an-address', chainId: 1 })).toBe(false);
    expect(looksLikeAuthorization({ address: '0x1234', chainId: 1 })).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* explainAuthorization                                                */
/* ------------------------------------------------------------------ */

describe('explainAuthorization', () => {
  it('explains a single request with the exact headline and both address forms', () => {
    const result = expectExplanation(
      explainAuthorization({ address: IMPL_LOWER, chainId: 1, nonce: 0 }),
    );
    expect(result.headline).toBe('Signing this would let a program take over your wallet');
    expect(result.outcome.length).toBeGreaterThan(0);
    const joined = result.bullets.join('\n');
    expect(joined).toContain(shortAddress(IMPL));
    expect(joined).toContain(IMPL);
    expect(joined).toContain('network number 1');
  });

  it('always includes the danger finding and the how-to-undo info finding', () => {
    const result = expectExplanation(explainAuthorization({ address: IMPL, chainId: 1 }));
    const ids = result.risks.map((r) => r.id);
    expect(ids).toContain('delegation-request');
    expect(ids).toContain('delegation-revoke');
    const request = result.risks.find((r) => r.id === 'delegation-request')!;
    expect(request.severity).toBe('danger');
    const revoke = result.risks.find((r) => r.id === 'delegation-revoke')!;
    expect(revoke.severity).toBe('info');
    expect(revoke.detail).toContain(ZERO);
  });

  it('explains every entry of an authorizationList', () => {
    const other = '0x9999999999999999999999999999999999999999';
    const result = expectExplanation(
      explainAuthorization({
        authorizationList: [
          { address: IMPL_LOWER, chainId: 1, nonce: 0 },
          { address: other, chainId: 5, nonce: 3 },
        ],
      }),
    );
    const joined = result.bullets.join('\n');
    expect(joined).toContain(IMPL);
    expect(joined).toContain(getAddress(other));
    expect(joined).toContain('network number 5');
  });

  it('escalates chainId 0 to an every-network danger', () => {
    const result = expectExplanation(explainAuthorization({ address: IMPL, chainId: 0 }));
    const anyChain = result.risks.find((r) => r.id === 'delegation-any-chain');
    expect(anyChain).toBeDefined();
    expect(anyChain!.severity).toBe('danger');
    expect(result.bullets.join('\n')).toContain('EVERY network');
  });

  it('cautions when the network does not match the expected ones', () => {
    const result = expectExplanation(
      explainAuthorization(
        { address: IMPL, chainId: 1 },
        { expectedChainIds: [10143] },
      ),
    );
    const finding = result.risks.find((r) => r.id === 'delegation-unknown-network');
    expect(finding).toBeDefined();
    expect(finding!.severity).toBe('caution');
  });

  it('stays quiet about the network when it matches an expected one', () => {
    const result = expectExplanation(
      explainAuthorization(
        { address: IMPL, chainId: 10143 },
        { expectedChainIds: [10143] },
      ),
    );
    expect(result.risks.some((r) => r.id === 'delegation-unknown-network')).toBe(false);
  });

  it('treats the all-zero address as a calm removal with only the info finding', () => {
    const result = expectExplanation(explainAuthorization({ address: ZERO, chainId: 1 }));
    expect(result.headline).not.toBe(
      'Signing this would let a program take over your wallet',
    );
    expect(result.headline.toLowerCase()).toContain('removes');
    expect(result.risks).toHaveLength(1);
    expect(result.risks[0]!.id).toBe('delegation-revoke');
    expect(result.risks[0]!.severity).toBe('info');
  });

  it('mentions whether the request targets the user\'s own wallet', () => {
    const result = expectExplanation(
      explainAuthorization({ address: IMPL, chainId: 1 }, { selfAddress: SELF }),
    );
    expect(result.bullets.join('\n')).toContain(shortAddress(SELF));
  });

  it('accepts a JSON string of a request', () => {
    const result = expectExplanation(
      explainAuthorization(JSON.stringify({ address: IMPL_LOWER, chainId: 1 })),
    );
    expect(result.bullets.join('\n')).toContain(IMPL);
  });

  it('returns a plain-language error for malformed input, never throwing', () => {
    for (const bad of [
      'this is not JSON at all {',
      42,
      null,
      { hello: 'world' },
      { address: 'not-an-address', chainId: 1 },
      { authorizationList: [] },
      { authorizationList: [{ chainId: 1 }] },
    ]) {
      const result = explainAuthorization(bad);
      expect('error' in result).toBe(true);
      if ('error' in result) expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('never uses insider jargon in anything shown to the user', () => {
    const texts: string[] = [];
    const collect = (result: AuthorizationExplanation | { error: string }): void => {
      if ('error' in result) {
        texts.push(result.error);
        return;
      }
      texts.push(result.headline, result.outcome, ...result.bullets);
      for (const risk of result.risks) texts.push(risk.title, risk.detail);
    };
    collect(explainAuthorization({ address: IMPL, chainId: 0, nonce: 7 }, { selfAddress: SELF }));
    collect(explainAuthorization({ address: ZERO, chainId: 1 }));
    collect(
      explainAuthorization(
        { authorizationList: [{ address: IMPL, chainId: 1, nonce: 0 }] },
        { expectedChainIds: [10143] },
      ),
    );
    collect(explainAuthorization('broken'));

    const riskTexts = (findings: RiskFinding[]): string[] =>
      findings.flatMap((f) => [f.title, f.detail]);
    texts.push(
      ...riskTexts(
        assessDelegationRisks({
          self: SELF_DELEGATED,
          counterparty: SELF_DELEGATED,
          counterpartyIsRecipient: true,
        }),
      ),
    );

    for (const text of texts) {
      expect(text).not.toMatch(/\bEOA\b/i);
      expect(text).not.toMatch(/\bnonce\b/i);
      expect(text).not.toMatch(/\bauthorization tuple\b/i);
      expect(text).not.toMatch(/\bcalldata\b/i);
    }
  });
});
