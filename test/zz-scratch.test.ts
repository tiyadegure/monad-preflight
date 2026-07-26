import { describe, it } from 'vitest';
import { appendFileSync, writeFileSync } from 'node:fs';
import { simulateTx } from '../src/lib/simulate';
import { composeExplanation } from '../src/lib/explain';
import { computeExposure } from '../src/lib/portfolio';
import type { Address, PreparedTx, TokenInfo } from '../src/lib/types';

const OUT = 'C:/Users/gg/monad-preflight/zz-out.txt';
writeFileSync(OUT, '');
const log = (...a: unknown[]) => appendFileSync(OUT, a.map((x) => String(x)).join(' ') + '\n');

const USER = '0x2222222222222222222222222222222222222222' as Address;
const WMON = '0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701' as Address;
const WITHDRAWAL_TOPIC =
  '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65';
const DEPOSIT_TOPIC =
  '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c';

const wmonToken: TokenInfo = { address: WMON, symbol: 'WMON', decimals: 18 };

function word(n: bigint) {
  return `0x${n.toString(16).padStart(64, '0')}`;
}

describe('scratch', () => {
  it('unwrap simulation asset changes', async () => {
    const amount = 2_000_000_000_000_000_000n;
    const trace = {
      type: 'CALL',
      from: USER,
      to: WMON,
      value: '0x0',
      gasUsed: '0x7530',
      input: '0x2e1a7d4d',
      logs: [
        {
          address: WMON,
          topics: [WITHDRAWAL_TOPIC, `0x000000000000000000000000${USER.slice(2)}`],
          data: word(amount),
        },
      ],
      calls: [
        { type: 'CALL', from: WMON, to: USER, value: `0x${amount.toString(16)}`, gasUsed: '0x0' },
      ],
    };
    const rpc = async (method: string) => {
      if (method === 'debug_traceCall') return trace;
      if (method === 'eth_estimateGas') return '0x7530';
      if (method === 'eth_gasPrice') return '0x0';
      throw new Error('no');
    };
    const tx: PreparedTx = {
      from: USER,
      to: WMON,
      data: '0x2e1a7d4d',
      value: 0n,
      kind: 'unwrap',
      summary: 'Unwrap 2 WMON back to MON',
      token: wmonToken,
      amountRaw: amount,
      counterparty: WMON,
    };
    const sim = await simulateTx(tx, rpc);
    log('UNWRAP assetChanges:', JSON.stringify(sim.assetChanges, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    const exp = composeExplanation(tx, sim, [], USER);
    log('UNWRAP outcome:', exp.outcome);
    log('UNWRAP bullets:', JSON.stringify(exp.bullets));
  });

  it('wrap simulation asset changes', async () => {
    const amount = 1_000_000_000_000_000_000n;
    const trace = {
      type: 'CALL',
      from: USER,
      to: WMON,
      value: `0x${amount.toString(16)}`,
      gasUsed: '0x7530',
      input: '0xd0e30db0',
      logs: [
        {
          address: WMON,
          topics: [DEPOSIT_TOPIC, `0x000000000000000000000000${USER.slice(2)}`],
          data: word(amount),
        },
      ],
      calls: [],
    };
    const rpc = async (method: string) => {
      if (method === 'debug_traceCall') return trace;
      if (method === 'eth_estimateGas') return '0x7530';
      if (method === 'eth_gasPrice') return '0x0';
      throw new Error('no');
    };
    const tx: PreparedTx = {
      from: USER,
      to: WMON,
      data: '0xd0e30db0',
      value: amount,
      kind: 'wrap',
      summary: 'Wrap 1 MON into WMON',
      token: wmonToken,
      amountRaw: amount,
      counterparty: WMON,
    };
    const sim = await simulateTx(tx, rpc);
    log('WRAP assetChanges:', JSON.stringify(sim.assetChanges, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    const exp = composeExplanation(tx, sim, [], USER);
    log('WRAP outcome:', exp.outcome);
  });

  it('exposure with token missing from balances list', () => {
    const usdc: TokenInfo = {
      address: '0x3333333333333333333333333333333333333333' as Address,
      symbol: 'USDC',
      decimals: 6,
    };
    const report = computeExposure({
      balances: [], // registry did not contain USDC, or balanceOf failed
      approvals: [
        {
          token: usdc,
          spender: '0x4444444444444444444444444444444444444444' as Address,
          allowanceRaw: (1n << 256n) - 1n,
          unlimited: true,
        },
      ],
    });
    log('EXPOSURE:', JSON.stringify(report, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 1));
  });
});
