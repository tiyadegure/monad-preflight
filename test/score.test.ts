import { describe, expect, it } from 'vitest';
import { scorePlan } from '../src/lib/score';
import type { RiskFinding, SimulationResult } from '../src/lib/types';

const okSim: SimulationResult = {
  ok: true,
  gasUsed: 21000n,
  gasCostWei: 1000n,
  assetChanges: [],
  approvalChanges: [],
  events: [],
  frames: [],
  notes: [],
};

const revertedSim: SimulationResult = { ...okSim, ok: false, revertReason: 'nope' };

function finding(
  id: string,
  severity: RiskFinding['severity'],
): RiskFinding {
  return { id, severity, title: 't', detail: 'd' };
}

describe('scorePlan', () => {
  it('gives a clean plan a perfect score and the Cleared verdict', () => {
    const r = scorePlan(okSim, []);
    expect(r.score).toBe(100);
    expect(r.band).toBe('clear');
    expect(r.verdict).toBe('Cleared');
    expect(r.advice).toMatch(/nothing more/i);
  });

  it('treats info-only findings as still clear, with softer advice', () => {
    const r = scorePlan(okSim, [finding('self-transfer', 'info')]);
    expect(r.band).toBe('clear');
    expect(r.counts.info).toBe(1);
    expect(r.advice).toMatch(/small notes/i);
  });

  it('drops one caution finding into the Hold band', () => {
    const r = scorePlan(okSim, [finding('fresh-recipient', 'caution')]);
    expect(r.score).toBe(88);
    expect(r.band).toBe('clear');
  });

  it('drops two cautions below the clear threshold', () => {
    const r = scorePlan(okSim, [
      finding('fresh-recipient', 'caution'),
      finding('send-to-contract', 'caution'),
    ]);
    expect(r.score).toBe(76);
    expect(r.band).toBe('caution');
    expect(r.verdict).toBe('Hold');
  });

  it('never lets a single danger finding stay in the clear band', () => {
    const r = scorePlan(okSim, [finding('unlimited-approval', 'danger')]);
    expect(r.band).not.toBe('clear');
    expect(r.score).toBe(66);
  });

  it('grounds a plan with two danger findings', () => {
    const r = scorePlan(okSim, [
      finding('unlimited-approval', 'danger'),
      finding('approval-to-eoa', 'danger'),
    ]);
    expect(r.band).toBe('grounded');
    expect(r.verdict).toBe('Grounded');
    expect(r.counts.danger).toBe(2);
  });

  it('caps a reverting plan at 20 even with no findings', () => {
    const r = scorePlan(revertedSim, []);
    expect(r.score).toBeLessThanOrEqual(20);
    expect(r.band).toBe('grounded');
    expect(r.advice).toMatch(/would fail/i);
  });

  it('caps fatal findings at 20 even when the simulation passed', () => {
    const r = scorePlan(okSim, [finding('insufficient-balance', 'danger')]);
    expect(r.score).toBeLessThanOrEqual(20);
    expect(r.band).toBe('grounded');
  });

  it('treats a zero-address destination as fatal', () => {
    const r = scorePlan(okSim, [finding('zero-address', 'danger')]);
    expect(r.score).toBeLessThanOrEqual(20);
  });

  it('never returns a score outside 0..100', () => {
    const many = Array.from({ length: 20 }, (_, i) => finding(`x${i}`, 'danger'));
    const r = scorePlan(okSim, many);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(100);
  });

  it('counts each severity separately', () => {
    const r = scorePlan(okSim, [
      finding('a', 'danger'),
      finding('b', 'caution'),
      finding('c', 'caution'),
      finding('d', 'info'),
    ]);
    expect(r.counts).toEqual({ danger: 1, caution: 2, info: 1 });
  });
});

describe('scorePlan — degraded simulation', () => {
  const degradedSim: SimulationResult = {
    ...okSim,
    notes: ['Deep simulation unavailable on this RPC — ran a basic check instead.'],
  };

  it('never reads as Cleared when only a shallow check was possible', () => {
    const r = scorePlan(degradedSim, []);
    expect(r.band).not.toBe('clear');
    expect(r.verdict).toBe('Hold');
    expect(r.score).toBeLessThanOrEqual(60);
  });

  it('says the score means unknown, not approval', () => {
    const r = scorePlan(degradedSim, []);
    expect(r.advice).toMatch(/shallow check|cannot tell you what it moves/i);
    expect(r.advice).not.toMatch(/Everything checks out/i);
  });

  it('still grounds a degraded plan that also reverts', () => {
    const r = scorePlan({ ...degradedSim, ok: false }, []);
    expect(r.band).toBe('grounded');
  });

  it('leaves a full simulation unaffected', () => {
    const r = scorePlan(okSim, []);
    expect(r.band).toBe('clear');
    expect(r.score).toBe(100);
  });
});
