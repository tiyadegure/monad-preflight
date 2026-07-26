import { describe, expect, it } from 'vitest';
import { assessSpoofing, looksAlike } from '../src/lib/spoofing';
import type { Address, Hex, PreparedTx, SimulationResult, TokenInfo } from '../src/lib/types';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as Address;
// A trusted contact…
const REAL = '0x1234deadbeefdeadbeefdeadbeefdeadbeefabcd' as Address;
// …and a ground lookalike: same visible prefix (0x1234) and suffix (abcd).
const POISON = '0x123400000000000000000000000000000000abcd' as Address;
const OTHER = '0x9999999999999999999999999999999999999999' as Address;

const TUSD: TokenInfo = {
  address: '0x2222222222222222222222222222222222222222' as Address,
  symbol: 'tUSD',
  decimals: 6,
};
const FAKE_TUSD: TokenInfo = {
  address: '0x3333333333333333333333333333333333333333' as Address,
  symbol: 'tUSD',
  decimals: 6,
};

function tx(overrides: Partial<PreparedTx> = {}): PreparedTx {
  return {
    from: ALICE,
    to: POISON,
    data: '0x' as Hex,
    value: 10n ** 18n,
    kind: 'native-transfer',
    summary: 'Send 1 MON',
    counterparty: POISON,
    ...overrides,
  };
}

function sim(events: SimulationResult['events'] = []): SimulationResult {
  return {
    ok: true,
    gasUsed: 21_000n,
    gasCostWei: 0n,
    assetChanges: [],
    approvalChanges: [],
    events,
    frames: [],
    notes: [],
  };
}

/* ------------------------------------------------------------------ */
/* looksAlike                                                          */
/* ------------------------------------------------------------------ */

describe('looksAlike', () => {
  it('detects the manufactured collision: same visible ends, different middle', () => {
    expect(looksAlike(POISON, REAL)).toBe(true);
    expect(looksAlike(REAL, POISON)).toBe(true);
  });

  it('is case-insensitive, as wallets are', () => {
    expect(looksAlike(POISON.toUpperCase().replace('0X', '0x'), REAL)).toBe(true);
  });

  it('never flags an address against itself', () => {
    expect(looksAlike(REAL, REAL)).toBe(false);
    expect(looksAlike(REAL, REAL.toUpperCase().replace('0X', '0x'))).toBe(false);
  });

  it('ignores plainly different addresses and malformed input', () => {
    expect(looksAlike(OTHER, REAL)).toBe(false);
    expect(looksAlike('0x1234', REAL)).toBe(false);
    expect(looksAlike('not-an-address', REAL)).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* assessSpoofing                                                      */
/* ------------------------------------------------------------------ */

describe('assessSpoofing', () => {
  it('raises danger when the recipient imitates a trusted address', () => {
    const findings = assessSpoofing({
      tx: tx(),
      sim: sim(),
      knownAddresses: [ALICE, REAL],
      knownTokens: [],
    });
    const f = findings.find((x) => x.id === 'address-poisoning-lookalike');
    expect(f?.severity).toBe('danger');
    expect(f?.detail).toContain('DIFFERENT');
  });

  it('stays quiet when the recipient IS the trusted address', () => {
    const findings = assessSpoofing({
      tx: tx({ to: REAL, counterparty: REAL }),
      sim: sim(),
      knownAddresses: [REAL],
      knownTokens: [],
    });
    expect(findings.find((x) => x.id === 'address-poisoning-lookalike')).toBeUndefined();
  });

  it('raises danger when a token wears a known symbol at a different address', () => {
    const findings = assessSpoofing({
      tx: tx({ kind: 'erc20-transfer', token: FAKE_TUSD, amountRaw: 100n, to: OTHER, counterparty: OTHER }),
      sim: sim(),
      knownAddresses: [],
      knownTokens: [TUSD],
    });
    const f = findings.find((x) => x.id === 'token-impersonation');
    expect(f?.severity).toBe('danger');
    expect(f?.title).toContain('tUSD');
  });

  it('does not flag the genuine known token', () => {
    const findings = assessSpoofing({
      tx: tx({ kind: 'erc20-transfer', token: TUSD, amountRaw: 100n, to: OTHER, counterparty: OTHER }),
      sim: sim(),
      knownAddresses: [],
      knownTokens: [TUSD],
    });
    expect(findings.find((x) => x.id === 'token-impersonation')).toBeUndefined();
  });

  it('flags a zero-value transfer event from the user — the poisoning primitive', () => {
    const findings = assessSpoofing({
      tx: tx({ kind: 'raw' }),
      sim: sim([
        {
          address: TUSD.address as Address,
          name: 'Transfer',
          args: { from: ALICE, to: OTHER, value: '0' },
          raw: { topics: [], data: '0x' as Hex },
        },
      ]),
      knownAddresses: [],
      knownTokens: [],
    });
    expect(findings.find((x) => x.id === 'zero-value-transfer')?.severity).toBe('caution');
  });

  it('flags a zero-amount erc20 transfer intent directly', () => {
    const findings = assessSpoofing({
      tx: tx({ kind: 'erc20-transfer', token: TUSD, amountRaw: 0n }),
      sim: sim(),
      knownAddresses: [],
      knownTokens: [],
    });
    expect(findings.some((x) => x.id === 'zero-value-transfer')).toBe(true);
  });

  it('returns nothing for a clean transfer', () => {
    const findings = assessSpoofing({
      tx: tx({ to: OTHER, counterparty: OTHER }),
      sim: sim([
        {
          address: TUSD.address as Address,
          name: 'Transfer',
          args: { from: ALICE, to: OTHER, value: '5' },
          raw: { topics: [], data: '0x' as Hex },
        },
      ]),
      knownAddresses: [ALICE, REAL],
      knownTokens: [TUSD],
    });
    expect(findings).toHaveLength(0);
  });
});
