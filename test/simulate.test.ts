import { describe, expect, it } from 'vitest';
import { encodeAbiParameters } from 'viem';
import { makeHttpRpc, simulateTx } from '../src/lib/simulate';
import type { RpcCallFn } from '../src/lib/simulate';
import type { AssetChange, Hex, PreparedTx, SimulationResult } from '../src/lib/types';
import { MAX_UINT256, shortAddress } from '../src/lib/format';

/* ------------------------------------------------------------------ */
/* Fixtures and helpers                                                */
/* ------------------------------------------------------------------ */

const ALICE = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const BOB = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const CAROL = '0xcccccccccccccccccccccccccccccccccccccccc';
const TOKEN = '0xdddddddddddddddddddddddddddddddddddddddd';
const SPENDER = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';

const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';

/** Address left-padded to a 32-byte topic. */
const topicAddr = (addr: string): string => `0x${'0'.repeat(24)}${addr.slice(2)}`;
/** bigint as a full 32-byte hex word. */
const word = (n: bigint): string => `0x${n.toString(16).padStart(64, '0')}`;

const transferLog = (token: string, from: string, to: string, value: bigint) => ({
  address: token,
  topics: [TRANSFER_TOPIC, topicAddr(from), topicAddr(to)],
  data: word(value),
});

const erc20Tx: PreparedTx = {
  from: ALICE as `0x${string}`,
  to: TOKEN as `0x${string}`,
  data: '0xa9059cbb' as Hex,
  value: 0n,
  kind: 'erc20-transfer',
  summary: 'Send 12 tUSD to 0xbbbb…bbbb',
};

const nativeTx: PreparedTx = {
  from: ALICE as `0x${string}`,
  to: BOB as `0x${string}`,
  data: '0x' as Hex,
  value: 10n ** 18n,
  kind: 'native-transfer',
  summary: 'Send 1 MON to 0xbbbb…bbbb',
};

type Handlers = Record<string, (params: unknown[]) => unknown>;

/** Fake RPC keyed by method. A missing handler throws, like a JSON-RPC error. */
function fakeRpc(handlers: Handlers): RpcCallFn {
  return async (method, params) => {
    const handler = handlers[method];
    if (!handler) throw new Error(`the method ${method} does not exist/is not available`);
    return handler(params);
  };
}

/** Metadata handler for a 6-decimal token called tUSD. */
function metadataEthCall(params: unknown[]): unknown {
  const call = (params as [{ to: string; data: string }])[0];
  if (call.data === '0x313ce567') return word(6n); // decimals() -> 6
  if (call.data === '0x95d89b41') {
    return encodeAbiParameters([{ type: 'string' }], ['tUSD']); // symbol()
  }
  throw new Error(`unexpected eth_call data ${call.data}`);
}

const gasHandlers: Handlers = {
  eth_estimateGas: () => '0xd6d8', // 55000
  eth_gasPrice: () => '0x3b9aca00', // 1 gwei
};

function findChange(
  result: SimulationResult,
  party: string,
  tokenAddress: string | null,
): AssetChange | undefined {
  return result.assetChanges.find(
    (c) =>
      c.party.toLowerCase() === party.toLowerCase() &&
      (c.token.address?.toLowerCase() ?? null) === (tokenAddress?.toLowerCase() ?? null),
  );
}

/* ------------------------------------------------------------------ */
/* Tests                                                               */
/* ------------------------------------------------------------------ */

describe('simulateTx — trace path', () => {
  it('(a) decodes a successful ERC-20 transfer into two asset changes with token metadata', async () => {
    const rpc = fakeRpc({
      debug_traceCall: () => ({
        type: 'CALL',
        from: ALICE,
        to: TOKEN,
        gas: '0x30000',
        gasUsed: '0x9470',
        input: '0xa9059cbb',
        logs: [transferLog(TOKEN, ALICE, BOB, 12_000_000n)],
      }),
      eth_call: metadataEthCall,
      ...gasHandlers,
    });

    const result = await simulateTx(erc20Tx, rpc);

    expect(result.ok).toBe(true);
    expect(result.assetChanges).toHaveLength(2);
    const alice = findChange(result, ALICE, TOKEN);
    const bob = findChange(result, BOB, TOKEN);
    expect(alice?.deltaRaw).toBe(-12_000_000n);
    expect(bob?.deltaRaw).toBe(12_000_000n);
    expect(alice?.token.symbol).toBe('tUSD');
    expect(alice?.token.decimals).toBe(6);

    expect(result.events[0]?.name).toBe('Transfer');
    expect(result.frames[0]?.depth).toBe(0);
    // estimateGas wins over trace gasUsed; cost = gas * gasPrice
    expect(result.gasUsed).toBe(55_000n);
    expect(result.gasCostWei).toBe(55_000n * 1_000_000_000n);
  });

  it('(b) decodes an Error(string) revert reason', async () => {
    const output =
      '0x08c379a0' + encodeAbiParameters([{ type: 'string' }], ['insufficient balance']).slice(2);
    const rpc = fakeRpc({
      debug_traceCall: () => ({
        type: 'CALL',
        from: ALICE,
        to: TOKEN,
        gasUsed: '0x5208',
        error: 'execution reverted',
        output,
      }),
      eth_gasPrice: () => '0x3b9aca00',
      // no eth_estimateGas handler: estimating a reverting tx fails, like real RPCs
    });

    const result = await simulateTx(erc20Tx, rpc);

    expect(result.ok).toBe(false);
    expect(result.revertReason).toContain('insufficient balance');
    expect(result.assetChanges).toHaveLength(0);
    expect(result.gasUsed).toBe(21_000n); // falls back to trace gasUsed
  });

  it('(c) names Panic code 0x11 as arithmetic overflow', async () => {
    const rpc = fakeRpc({
      debug_traceCall: () => ({
        type: 'CALL',
        from: ALICE,
        to: TOKEN,
        gasUsed: '0x5208',
        error: 'execution reverted',
        output: '0x4e487b71' + word(0x11n).slice(2),
      }),
      eth_gasPrice: () => '0x3b9aca00',
    });

    const result = await simulateTx(erc20Tx, rpc);

    expect(result.ok).toBe(false);
    expect(result.revertReason).toMatch(/arithmetic overflow/i);
  });

  it('(d) reports a bare custom error selector plainly', async () => {
    const rpc = fakeRpc({
      debug_traceCall: () => ({
        type: 'CALL',
        from: ALICE,
        to: TOKEN,
        gasUsed: '0x5208',
        error: 'execution reverted',
        output: '0x1f2a3b4c',
      }),
      eth_gasPrice: () => '0x3b9aca00',
    });

    const result = await simulateTx(erc20Tx, rpc);

    expect(result.ok).toBe(false);
    expect(result.revertReason).toMatch(/custom error/i);
    expect(result.revertReason).toContain('0x1f2a3b4c');
  });

  it('prefers the trace revertReason field and handles empty output', async () => {
    const withReason = await simulateTx(
      erc20Tx,
      fakeRpc({
        debug_traceCall: () => ({
          type: 'CALL',
          from: ALICE,
          to: TOKEN,
          gasUsed: '0x5208',
          error: 'execution reverted',
          revertReason: 'paused',
          output: '0x1f2a3b4c',
        }),
        eth_gasPrice: () => '0x3b9aca00',
      }),
    );
    expect(withReason.revertReason).toBe('paused');

    const noOutput = await simulateTx(
      erc20Tx,
      fakeRpc({
        debug_traceCall: () => ({
          type: 'CALL',
          from: ALICE,
          to: TOKEN,
          gasUsed: '0x5208',
          error: 'execution reverted',
          output: '0x',
        }),
        eth_gasPrice: () => '0x3b9aca00',
      }),
    );
    expect(noOutput.revertReason).toMatch(/without giving a reason/i);
  });

  it('(e) tracks native MON through nested value-carrying sub-calls', async () => {
    const oneMon = 10n ** 18n;
    const fourTenths = 4n * 10n ** 17n;
    const rpc = fakeRpc({
      debug_traceCall: () => ({
        type: 'CALL',
        from: ALICE,
        to: BOB,
        value: `0x${oneMon.toString(16)}`,
        gasUsed: '0x5208',
        calls: [
          {
            type: 'CALL',
            from: BOB,
            to: CAROL,
            value: `0x${fourTenths.toString(16)}`,
            gasUsed: '0x0',
          },
          // STATICCALLs never carry value and must be ignored even if malformed
          { type: 'STATICCALL', from: BOB, to: TOKEN, value: `0x${oneMon.toString(16)}`, gasUsed: '0x0' },
        ],
      }),
      ...gasHandlers,
    });

    const result = await simulateTx(nativeTx, rpc);

    expect(result.ok).toBe(true);
    expect(findChange(result, ALICE, null)?.deltaRaw).toBe(-oneMon);
    expect(findChange(result, BOB, null)?.deltaRaw).toBe(oneMon - fourTenths);
    expect(findChange(result, CAROL, null)?.deltaRaw).toBe(fourTenths);
    expect(findChange(result, ALICE, null)?.token.symbol).toBe('MON');
    expect(result.frames).toHaveLength(3);
    expect(result.frames[1]?.depth).toBe(1);
  });

  it('(f) flags an unlimited Approval', async () => {
    const rpc = fakeRpc({
      debug_traceCall: () => ({
        type: 'CALL',
        from: ALICE,
        to: TOKEN,
        gasUsed: '0x9470',
        logs: [
          {
            address: TOKEN,
            topics: [APPROVAL_TOPIC, topicAddr(ALICE), topicAddr(SPENDER)],
            data: word(MAX_UINT256),
          },
        ],
      }),
      eth_call: metadataEthCall,
      ...gasHandlers,
    });

    const result = await simulateTx(erc20Tx, rpc);

    expect(result.ok).toBe(true);
    expect(result.approvalChanges).toHaveLength(1);
    const approval = result.approvalChanges[0]!;
    expect(approval.unlimited).toBe(true);
    expect(approval.amountRaw).toBe(MAX_UINT256);
    expect(approval.owner.toLowerCase()).toBe(ALICE);
    expect(approval.spender.toLowerCase()).toBe(SPENDER);
    expect(approval.token.symbol).toBe('tUSD');
  });

  it('(h) keeps unknown events with their raw topics and data', async () => {
    const weirdTopic = '0x' + 'de'.repeat(32);
    const rpc = fakeRpc({
      debug_traceCall: () => ({
        type: 'CALL',
        from: ALICE,
        to: TOKEN,
        gasUsed: '0x9470',
        logs: [{ address: TOKEN, topics: [weirdTopic, topicAddr(ALICE)], data: word(7n) }],
      }),
      ...gasHandlers,
    });

    const result = await simulateTx(erc20Tx, rpc);

    expect(result.events).toHaveLength(1);
    expect(result.events[0]?.name).toBe('unknown');
    expect(result.events[0]?.raw.topics).toEqual([weirdTopic, topicAddr(ALICE)]);
    expect(result.events[0]?.raw.data).toBe(word(7n));
    expect(result.assetChanges).toHaveLength(0);
  });

  it('(i) falls back to a shortened address and 18 decimals when the token will not report metadata', async () => {
    const rpc = fakeRpc({
      debug_traceCall: () => ({
        type: 'CALL',
        from: ALICE,
        to: TOKEN,
        gasUsed: '0x9470',
        logs: [transferLog(TOKEN, ALICE, BOB, 5n)],
      }),
      eth_call: () => {
        throw new Error('execution reverted');
      },
      ...gasHandlers,
    });

    const result = await simulateTx(erc20Tx, rpc);

    const alice = findChange(result, ALICE, TOKEN);
    expect(alice?.token.decimals).toBe(18);
    expect(alice?.token.symbol.toLowerCase()).toBe(shortAddress(TOKEN).toLowerCase());
    expect(result.notes.some((n) => n.includes('did not report'))).toBe(true);
  });

  it('(j) merges opposite transfers of the same token so zero nets disappear', async () => {
    const rpc = fakeRpc({
      debug_traceCall: () => ({
        type: 'CALL',
        from: ALICE,
        to: TOKEN,
        gasUsed: '0x9470',
        logs: [transferLog(TOKEN, ALICE, BOB, 5n), transferLog(TOKEN, BOB, ALICE, 5n)],
      }),
      ...gasHandlers,
      // no eth_call handler on purpose: zero-net tokens need no metadata lookup
    });

    const result = await simulateTx(erc20Tx, rpc);

    expect(result.ok).toBe(true);
    expect(result.assetChanges).toHaveLength(0);
    expect(result.events).toHaveLength(2);
    expect(result.events.every((e) => e.name === 'Transfer')).toBe(true);
  });
});

describe('simulateTx — fallback path', () => {
  it('(g) falls back to eth_call when debug_traceCall is unavailable', async () => {
    const half = 5n * 10n ** 17n;
    const tx: PreparedTx = { ...nativeTx, value: half };
    const rpc = fakeRpc({
      // no debug_traceCall handler -> fakeRpc throws, like a gateway without it
      eth_call: () => '0x',
      eth_estimateGas: () => '0x5208',
      eth_gasPrice: () => '0x3b9aca00',
    });

    const result = await simulateTx(tx, rpc);

    expect(result.ok).toBe(true);
    expect(result.notes.some((n) => n.includes('Deep simulation unavailable'))).toBe(true);
    expect(result.assetChanges).toHaveLength(2);
    expect(findChange(result, ALICE, null)?.deltaRaw).toBe(-half);
    expect(findChange(result, BOB, null)?.deltaRaw).toBe(half);
    expect(result.frames).toHaveLength(0);
    expect(result.gasUsed).toBe(21_000n);
    expect(result.gasCostWei).toBe(21_000n * 1_000_000_000n);
  });

  it('reports a revert detected by the fallback eth_call', async () => {
    const rpc = fakeRpc({
      eth_call: () => {
        throw new Error('execution reverted: not enough tokens');
      },
      eth_gasPrice: () => '0x3b9aca00',
    });

    const result = await simulateTx(erc20Tx, rpc);

    expect(result.ok).toBe(false);
    expect(result.revertReason).toContain('not enough tokens');
    expect(result.assetChanges).toHaveLength(0);
  });
});

describe('makeHttpRpc', () => {
  it('sends JSON-RPC 2.0 with incrementing ids and throws on error responses', async () => {
    const bodies: Array<{ jsonrpc: string; id: number; method: string }> = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async (_url: unknown, init?: { body?: unknown }) => {
      const body = JSON.parse(String(init?.body)) as { jsonrpc: string; id: number; method: string };
      bodies.push(body);
      if (body.method === 'boom') {
        return new Response(
          JSON.stringify({ jsonrpc: '2.0', id: body.id, error: { code: -32000, message: 'nope' } }),
        );
      }
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result: '0x279f' }));
    }) as typeof fetch;

    try {
      const rpc = makeHttpRpc('http://localhost:0/fake');
      await expect(rpc('eth_chainId', [])).resolves.toBe('0x279f');
      await expect(rpc('boom', [])).rejects.toThrow('nope');
      expect(bodies[0]?.jsonrpc).toBe('2.0');
      expect(bodies[1]?.id).toBe((bodies[0]?.id ?? 0) + 1);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
