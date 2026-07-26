import { describe, expect, it } from 'vitest';
import { decodeBig, encodeBig } from '../src/lib/jsoncodec';

describe('jsoncodec — bigint-safe round trips', () => {
  it('round-trips nested bigints losslessly', () => {
    const original = {
      value: 10n ** 18n,
      negative: -42n,
      zero: 0n,
      nested: { gasUsed: 21_000n, list: [1n, 2n, { deltaRaw: -(2n ** 200n) }] },
      plain: { s: 'text', n: 1.5, b: true, nil: null },
    };
    expect(decodeBig(encodeBig(original))).toEqual(original);
  });

  it('does not revive look-alike objects that are not exact tags', () => {
    const tricky = {
      twoKeys: { $bigint: '1', extra: true },
      wrongType: { $bigint: 12 },
      notNumeric: { $bigint: '0x10' },
    };
    const roundTripped = decodeBig(encodeBig(tricky)) as typeof tricky;
    expect(roundTripped.twoKeys).toEqual({ $bigint: '1', extra: true });
    expect(roundTripped.wrongType).toEqual({ $bigint: 12 });
    expect(roundTripped.notNumeric).toEqual({ $bigint: '0x10' });
  });

  it('a user-supplied string that LOOKS like a tag stays a string', () => {
    const s = { note: '{"$bigint":"123"}' };
    expect(decodeBig(encodeBig(s))).toEqual(s);
  });
});
