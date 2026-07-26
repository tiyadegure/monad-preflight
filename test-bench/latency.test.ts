import { writeFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NETWORKS, makeNetworkRpc } from '../src/lib/networks';
import { assessTransaction, rpcFactReader } from '../src/lib/pipeline';
import type { AssessTimings } from '../src/lib/pipeline';
import type { Address, Hex, PreparedTx } from '../src/lib/types';

/**
 * Measures the FULL pre-flight pipeline — debug_traceCall simulation +
 * every on-chain fact read + fee oracle + fingerprint — against the real
 * Monad testnet, sequentially (public endpoints are rate-limited; this
 * is a measurement, not a load test). Numbers include network RTT from
 * wherever this machine sits, and the report says so.
 */

const ROUNDS = 10;

// A 0-value self-call: universally valid (no balance needed), still
// exercises the entire trace + facts + extras path.
const SUBJECT = '0x000000000000000000000000000000000000dEaD' as Address;

const tx: PreparedTx = {
  from: SUBJECT,
  to: SUBJECT,
  data: '0x' as Hex,
  value: 0n,
  kind: 'native-transfer',
  summary: 'bench: 0-value self transfer',
  counterparty: SUBJECT,
};

function pct(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

describe('live latency — full pre-flight pipeline on Monad testnet', () => {
  it(`runs ${ROUNDS} sequential full assessments and reports percentiles`, async () => {
    const net = NETWORKS.testnet;
    const rpc = makeNetworkRpc(net);
    const reader = rpcFactReader(rpc);

    // Warm-up round: pays TLS/connection setup so the measured rounds
    // reflect steady state. Not counted.
    await assessTransaction(tx, { rpc, reader });

    const rounds: AssessTimings[] = [];
    for (let i = 0; i < ROUNDS; i++) {
      const a = await assessTransaction(tx, { rpc, reader });
      expect(a.sim.ok).toBe(true);
      rounds.push(a.timings);
    }

    const totals = rounds.map((r) => r.totalMs).sort((a, b) => a - b);
    const sims = rounds.map((r) => r.simulateMs).sort((a, b) => a - b);
    const facts = rounds.map((r) => r.factsMs).sort((a, b) => a - b);

    const line = (label: string, xs: number[]) =>
      `${label.padEnd(22)} p50 ${String(pct(xs, 50)).padStart(5)} ms · ` +
      `p95 ${String(pct(xs, 95)).padStart(5)} ms · ` +
      `min ${String(xs[0]).padStart(5)} ms · max ${String(xs[xs.length - 1]).padStart(5)} ms`;

    const report = [
      '──────────────────────────────────────────────────────────',
      `Monad testnet · ${ROUNDS} sequential FULL pre-flight checks`,
      '(simulation + all fact reads + fee oracle + fingerprint;',
      ' network round-trips from this machine included)',
      '──────────────────────────────────────────────────────────',
      line('full check (total)', totals),
      line('  debug_traceCall', sims),
      line('  on-chain fact reads', facts),
      '──────────────────────────────────────────────────────────',
    ].join('\n');
    console.log(`\n${report}\n`);
    writeFileSync(new URL('../bench-latest.txt', import.meta.url), `${report}\n`);

    expect(rounds).toHaveLength(ROUNDS);
    expect(totals.every((t) => t > 0)).toBe(true);
  });
});
