import { describe, expect, it } from 'vitest';
import {
  MAX_LEGS,
  activeLeg,
  advance,
  createQueue,
  isComplete,
  markLeg,
  parseLegs,
  queueSummary,
} from '../src/lib/queue';
import type { FlightQueue, LegStatus } from '../src/lib/queue';
import type { Hex } from '../src/lib/types';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const HASH = `0x${'ab'.repeat(32)}` as Hex;

function threeLegQueue(): FlightQueue {
  return createQueue(['wrap 1 MON', 'approve WMON', 'swap WMON for tUSD']);
}

/** Deep snapshot so we can assert a queue was not mutated. */
function snapshot(q: FlightQueue): FlightQueue {
  return structuredClone(q);
}

/* ------------------------------------------------------------------ */
/* parseLegs                                                           */
/* ------------------------------------------------------------------ */

describe('parseLegs', () => {
  it('splits on newlines', () => {
    expect(parseLegs('wrap 1 MON\napprove WMON\r\nswap it')).toEqual([
      'wrap 1 MON',
      'approve WMON',
      'swap it',
    ]);
  });

  it('splits on " then " case-insensitively', () => {
    expect(parseLegs('approve 5 tUSD THEN send 5 tUSD to 0xabc')).toEqual([
      'approve 5 tUSD',
      'send 5 tUSD to 0xabc',
    ]);
  });

  it('does not split on "then" glued inside a word', () => {
    expect(parseLegs('send 1 MON to authentic.eth')).toEqual([
      'send 1 MON to authentic.eth',
    ]);
  });

  it('splits on the Chinese connector 然后, with or without spaces', () => {
    expect(parseLegs('打包 1 MON 然后 发送给朋友')).toEqual([
      '打包 1 MON',
      '发送给朋友',
    ]);
    expect(parseLegs('打包1MON然后发送')).toEqual(['打包1MON', '发送']);
  });

  it('splits on semicolons and drops empty legs', () => {
    expect(parseLegs('wrap 1 MON; ; send it;')).toEqual(['wrap 1 MON', 'send it']);
  });

  it('returns a single instruction as a one-element array', () => {
    expect(parseLegs('send 0.5 MON to 0x1234')).toEqual(['send 0.5 MON to 0x1234']);
  });

  it('does NOT split on commas (amounts use them)', () => {
    expect(parseLegs('send 1,000 tUSD to 0xabc')).toEqual([
      'send 1,000 tUSD to 0xabc',
    ]);
  });

  it('returns an empty array for blank input', () => {
    expect(parseLegs('   ')).toEqual([]);
  });

  it(`caps the result at ${MAX_LEGS} legs`, () => {
    const text = Array.from({ length: 12 }, (_, i) => `leg number ${i + 1}`).join(
      '\n',
    );
    const legs = parseLegs(text);
    expect(legs).toHaveLength(MAX_LEGS);
    expect(legs[0]).toBe('leg number 1');
    expect(legs[MAX_LEGS - 1]).toBe(`leg number ${MAX_LEGS}`);
  });
});

/* ------------------------------------------------------------------ */
/* createQueue + activeLeg                                             */
/* ------------------------------------------------------------------ */

describe('createQueue', () => {
  it('builds ids leg-1.., first leg active, rest pending, activeIndex 0', () => {
    const q = threeLegQueue();
    expect(q.activeIndex).toBe(0);
    expect(q.legs.map((l) => l.id)).toEqual(['leg-1', 'leg-2', 'leg-3']);
    expect(q.legs.map((l) => l.status)).toEqual(['active', 'pending', 'pending']);
    expect(q.legs[0]?.text).toBe('wrap 1 MON');
  });

  it('returns an empty inactive queue for no texts', () => {
    expect(createQueue([])).toEqual({ legs: [], activeIndex: -1 });
  });
});

describe('activeLeg', () => {
  it('returns the leg at activeIndex', () => {
    const q = threeLegQueue();
    expect(activeLeg(q)?.id).toBe('leg-1');
  });

  it('returns null when nothing is active', () => {
    expect(activeLeg(createQueue([]))).toBeNull();
    expect(activeLeg({ legs: threeLegQueue().legs, activeIndex: -1 })).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* markLeg                                                             */
/* ------------------------------------------------------------------ */

describe('markLeg', () => {
  it('updates status plus hash and note without mutating the original', () => {
    const q = threeLegQueue();
    const before = snapshot(q);

    const next = markLeg(q, 'leg-1', 'signed', { hash: HASH, note: 'confirmed' });

    expect(next).not.toBe(q);
    expect(next.legs[0]).toEqual({
      id: 'leg-1',
      text: 'wrap 1 MON',
      status: 'signed',
      hash: HASH,
      note: 'confirmed',
    });
    // Untouched legs and activeIndex carry over.
    expect(next.legs[1]).toBe(q.legs[1]);
    expect(next.activeIndex).toBe(0);
    // Original queue is untouched.
    expect(q).toEqual(before);
  });

  it('returns the queue unchanged for an unknown id', () => {
    const q = threeLegQueue();
    const before = snapshot(q);
    expect(markLeg(q, 'leg-99', 'failed')).toBe(q);
    expect(q).toEqual(before);
  });
});

/* ------------------------------------------------------------------ */
/* advance                                                             */
/* ------------------------------------------------------------------ */

describe('advance', () => {
  it('signs the active leg and activates the next pending one', () => {
    const q = threeLegQueue();
    const before = snapshot(q);

    const next = advance(q);

    expect(next.legs.map((l) => l.status)).toEqual(['signed', 'active', 'pending']);
    expect(next.activeIndex).toBe(1);
    expect(q).toEqual(before); // original untouched
  });

  it('leaves an already-terminal active leg alone', () => {
    const q = markLeg(threeLegQueue(), 'leg-1', 'failed', { note: 'ran out of gas' });
    const next = advance(q);
    expect(next.legs[0]?.status).toBe('failed');
    expect(next.legs[0]?.note).toBe('ran out of gas');
    expect(next.legs[1]?.status).toBe('active');
    expect(next.activeIndex).toBe(1);
  });

  it('skips terminal legs when searching for the next pending one', () => {
    // Leg 2 was skipped ahead of time; advancing from leg 1 must land on leg 3.
    const q = markLeg(threeLegQueue(), 'leg-2', 'skipped');
    const next = advance(q);
    expect(next.legs.map((l) => l.status)).toEqual(['signed', 'skipped', 'active']);
    expect(next.activeIndex).toBe(2);
  });

  it('sets activeIndex to -1 when advancing past the last leg', () => {
    let q = createQueue(['wrap 1 MON', 'send it']);
    q = advance(q); // leg 1 signed, leg 2 active
    q = advance(q); // leg 2 signed, nothing left
    expect(q.legs.map((l) => l.status)).toEqual(['signed', 'signed']);
    expect(q.activeIndex).toBe(-1);
    expect(activeLeg(q)).toBeNull();
  });

  it('is a no-op search on an already-finished queue', () => {
    const done = advance(advance(createQueue(['a', 'b'])));
    const again = advance(done);
    expect(again.activeIndex).toBe(-1);
    expect(again.legs.map((l) => l.status)).toEqual(['signed', 'signed']);
  });
});

/* ------------------------------------------------------------------ */
/* queueSummary                                                        */
/* ------------------------------------------------------------------ */

describe('queueSummary', () => {
  it('reads correctly on the first leg', () => {
    expect(queueSummary(threeLegQueue())).toBe('Leg 1 of 3 · 0 signed, 2 remaining');
  });

  it('reads correctly mid-flight', () => {
    const q = advance(threeLegQueue());
    expect(queueSummary(q)).toBe('Leg 2 of 3 · 1 signed, 1 remaining');
  });

  it('reads correctly on the last leg', () => {
    const q = advance(advance(threeLegQueue()));
    expect(queueSummary(q)).toBe('Leg 3 of 3 · 2 signed, 0 remaining');
  });

  it('reports a finished queue, including failures and skips', () => {
    let q = threeLegQueue();
    q = advance(q); // leg 1 signed
    q = markLeg(q, 'leg-2', 'failed');
    q = markLeg(q, 'leg-3', 'skipped');
    q = advance(q); // nothing pending → activeIndex -1
    expect(queueSummary(q)).toBe('All 3 steps done · 1 signed, 1 failed, 1 skipped');
  });

  it('handles an empty queue', () => {
    expect(queueSummary(createQueue([]))).toBe('No steps planned');
  });
});

/* ------------------------------------------------------------------ */
/* isComplete                                                          */
/* ------------------------------------------------------------------ */

describe('isComplete', () => {
  it('turns true only once every leg reaches a final state', () => {
    let q = createQueue(['wrap 1 MON', 'send it']);
    expect(isComplete(q)).toBe(false);

    q = advance(q); // leg 1 signed, leg 2 active
    expect(isComplete(q)).toBe(false);

    q = markLeg(q, 'leg-2', 'skipped');
    expect(isComplete(q)).toBe(true);
  });

  it('counts failed and skipped as final states', () => {
    const statuses: LegStatus[] = ['signed', 'failed', 'skipped'];
    const legs = statuses.map((status, i) => ({
      id: `leg-${i + 1}`,
      text: `leg ${i + 1}`,
      status,
    }));
    expect(isComplete({ legs, activeIndex: -1 })).toBe(true);
  });

  it('is vacuously true for an empty queue', () => {
    expect(isComplete(createQueue([]))).toBe(true);
  });
});
