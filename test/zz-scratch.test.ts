import { describe, it, expect } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
const OUT = 'C:/Users/gg/monad-preflight/zz-out.txt';
writeFileSync(OUT, '');
const log = (...a: unknown[]) => appendFileSync(OUT, a.map((x) => String(x)).join(' ') + '\n');
const console = { log };
import { parseIntent } from '../src/lib/intent';
import { formatAmount, formatTokenAmount } from '../src/lib/format';
import { comparePostFlight } from '../src/lib/postflight';
import type { PreparedTx, SimulationResult, Address } from '../src/lib/types';

describe('scratch', () => {
  it('intent: approve with amount then token address', () => {
    const r = parseIntent(
      'approve 100 0x1111111111111111111111111111111111111111 for 0x2222222222222222222222222222222222222222',
    );
    console.log('A', JSON.stringify(r, null, 1));
  });
  it('intent: send token-address form', () => {
    const r = parseIntent(
      'send 10 0x1111111111111111111111111111111111111111 to 0x2222222222222222222222222222222222222222',
    );
    console.log('B', JSON.stringify(r, null, 1));
  });
  it('intent: send with recipient after to, one address', () => {
    const r = parseIntent('send 0.5 MON to 0x2222222222222222222222222222222222222222');
    console.log('C', JSON.stringify(r, null, 1));
  });
  it('format edges', () => {
    console.log('fmt1', formatAmount(5_000_000_000n, 18));
    console.log('fmt2', formatAmount(5_000_000_000n, 6));
    console.log('fmt3', formatAmount(-1n, 18));
    console.log('fmt4', formatAmount(1n, 0));
    console.log('fmt5', formatAmount(123n, 255));
    console.log('fmt6', formatAmount(1999999999999999999n, 18));
  });
  it('postflight unknown token decimals', () => {
    const user = '0x2222222222222222222222222222222222222222' as Address;
    const usdc = '0x3333333333333333333333333333333333333333';
    const tx = {
      from: user,
      to: usdc as Address,
      data: '0x',
      value: 0n,
      kind: 'raw',
      summary: 'x',
    } as PreparedTx;
    const sim: SimulationResult = {
      ok: true,
      gasUsed: 21000n,
      gasCostWei: 0n,
      assetChanges: [],
      approvalChanges: [],
      events: [],
      frames: [],
      notes: [],
    };
    const amount = 5_000_000_000n; // 5000 USDC at 6 decimals
    const receipt = {
      status: 'success' as const,
      gasUsed: 21000n,
      effectiveGasPrice: 0n,
      logs: [
        {
          address: usdc,
          topics: [
            '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
            `0x000000000000000000000000${user.slice(2)}`,
            '0x0000000000000000000000004444444444444444444444444444444444444444',
          ],
          data: `0x${amount.toString(16).padStart(64, '0')}`,
        },
      ],
    } as never;
    const out = comparePostFlight(tx, sim, receipt, user);
    console.log('POSTFLIGHT', JSON.stringify(out, null, 1));
  });
});
