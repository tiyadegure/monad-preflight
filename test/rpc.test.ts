/**
 * Tests for the production RPC client (makeHttpRpc): endpoint failover,
 * timeouts, sticky endpoint choice, and JSON-RPC error passthrough.
 * globalThis.fetch is stubbed throughout — nothing here touches the network.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { makeHttpRpc } from '../src/lib/simulate';
import { NETWORKS, makeNetworkRpc } from '../src/lib/networks';

const URL_A = 'https://rpc-a.example';
const URL_B = 'https://rpc-b.example';
const URL_C = 'https://rpc-c.example';

let realFetch: typeof globalThis.fetch;

beforeEach(() => {
  realFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

/* ---- response builders ---- */

function jsonRpcOk(result: unknown): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), { status: 200 });
}

function jsonRpcError(message: string): Response {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32000, message } }), {
    status: 200,
  });
}

function httpFailure(status: number): Response {
  return new Response('upstream unhappy', { status });
}

/**
 * Replace globalThis.fetch with a stub that routes by url.
 * Returns the ordered list of urls fetch was called with.
 */
function stubFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): string[] {
  const seen: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push(url);
    return handler(url, init);
  }) as typeof fetch;
  return seen;
}

/** A response that never arrives, but honors AbortSignal like real fetch does. */
function hangUntilAborted(init?: RequestInit): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    const signal = init?.signal;
    const fail = (): void => {
      reject(new DOMException('The operation was aborted.', 'AbortError'));
    };
    if (!signal) return; // no signal: hang forever (the test itself would time out)
    if (signal.aborted) {
      fail();
      return;
    }
    signal.addEventListener('abort', fail, { once: true });
  });
}

/* ---- tests ---- */

describe('makeHttpRpc', () => {
  it('returns the result from the first endpoint when it answers', async () => {
    const seen = stubFetch(() => jsonRpcOk('0x279f'));
    const rpc = makeHttpRpc([URL_A, URL_B]);

    await expect(rpc('eth_chainId', [])).resolves.toBe('0x279f');
    expect(seen).toEqual([URL_A]);
  });

  it('still accepts a single url string (backward compatible)', async () => {
    const seen = stubFetch(() => jsonRpcOk('0x1'));
    const rpc = makeHttpRpc(URL_A);

    await expect(rpc('eth_blockNumber', [])).resolves.toBe('0x1');
    expect(seen).toEqual([URL_A]);
  });

  it('fails over to the next endpoint on HTTP 500', async () => {
    const seen = stubFetch((url) => (url === URL_A ? httpFailure(500) : jsonRpcOk('0x2')));
    const rpc = makeHttpRpc([URL_A, URL_B]);

    await expect(rpc('eth_blockNumber', [])).resolves.toBe('0x2');
    expect(seen).toEqual([URL_A, URL_B]);
  });

  it('fails over when fetch itself throws (network down)', async () => {
    const seen = stubFetch((url) => {
      if (url === URL_A) throw new TypeError('fetch failed');
      return jsonRpcOk('0x3');
    });
    const rpc = makeHttpRpc([URL_A, URL_B]);

    await expect(rpc('eth_blockNumber', [])).resolves.toBe('0x3');
    expect(seen).toEqual([URL_A, URL_B]);
  });

  it('fails over when an endpoint rate-limits with HTTP 429', async () => {
    const seen = stubFetch((url) => (url === URL_A ? httpFailure(429) : jsonRpcOk('0x4')));
    const rpc = makeHttpRpc([URL_A, URL_B]);

    await expect(rpc('eth_gasPrice', [])).resolves.toBe('0x4');
    expect(seen).toEqual([URL_A, URL_B]);
  });

  it('surfaces a JSON-RPC error to the caller without failing over', async () => {
    const seen = stubFetch(() => jsonRpcError('execution reverted: not enough tokens'));
    const rpc = makeHttpRpc([URL_A, URL_B]);

    await expect(rpc('eth_call', [])).rejects.toThrow('execution reverted: not enough tokens');
    expect(seen).toEqual([URL_A]); // endpoint B was never asked
  });

  it('treats method-not-supported as a real answer, not an outage', async () => {
    const seen = stubFetch(() =>
      jsonRpcError('the method debug_traceCall does not exist/is not available'),
    );
    const rpc = makeHttpRpc([URL_A, URL_B]);

    // simulateTx relies on catching exactly this to trigger its own fallback.
    await expect(rpc('debug_traceCall', [])).rejects.toThrow('debug_traceCall does not exist');
    expect(seen).toEqual([URL_A]);
  });

  it('starts the next call at the endpoint that answered last time', async () => {
    const seen = stubFetch((url) => (url === URL_A ? httpFailure(500) : jsonRpcOk('0x5')));
    const rpc = makeHttpRpc([URL_A, URL_B]);

    await rpc('eth_chainId', []); // A fails, B answers
    await rpc('eth_chainId', []); // sticky: goes straight to B

    expect(seen).toEqual([URL_A, URL_B, URL_B]);
  });

  it('wraps around past the end of the list when failing over', async () => {
    let onlyAAnswers = false;
    const seen = stubFetch((url) => {
      if (onlyAAnswers) return url === URL_A ? jsonRpcOk('0x7') : httpFailure(500);
      return url === URL_A ? httpFailure(500) : jsonRpcOk('0x6');
    });
    const rpc = makeHttpRpc([URL_A, URL_B, URL_C]);

    await expect(rpc('eth_chainId', [])).resolves.toBe('0x6'); // A down → B answers
    onlyAAnswers = true;
    await expect(rpc('eth_chainId', [])).resolves.toBe('0x7'); // B, C down → wraps to A

    expect(seen).toEqual([URL_A, URL_B, URL_B, URL_C, URL_A]);
  });

  it('throws one plain-language error when every endpoint is down', async () => {
    const seen = stubFetch((url) => {
      if (url === URL_A) throw new TypeError('fetch failed');
      if (url === URL_B) return httpFailure(503);
      return httpFailure(429);
    });
    const rpc = makeHttpRpc([URL_A, URL_B, URL_C]);

    await expect(rpc('eth_chainId', [])).rejects.toThrow(
      'We tried 3 endpoints and none of them answered',
    );
    expect(seen).toEqual([URL_A, URL_B, URL_C]);
  });

  it('says how many endpoints were tried even with a single url', async () => {
    stubFetch(() => httpFailure(500));
    const rpc = makeHttpRpc(URL_A);

    await expect(rpc('eth_chainId', [])).rejects.toThrow('We tried 1 endpoint');
  });

  it('gives up on a silent endpoint after the timeout and fails over', async () => {
    const seen = stubFetch((url, init) => {
      if (url === URL_A) return hangUntilAborted(init);
      return jsonRpcOk('0x8');
    });
    const rpc = makeHttpRpc([URL_A, URL_B], { timeoutMs: 20 });

    await expect(rpc('eth_chainId', [])).resolves.toBe('0x8');
    expect(seen).toEqual([URL_A, URL_B]);
  });
});

describe('makeNetworkRpc', () => {
  it('asks the network endpoints in registry order, most capable first', async () => {
    const seen = stubFetch(() => jsonRpcOk('0x8f'));
    const rpc = makeNetworkRpc(NETWORKS.mainnet);

    await expect(rpc('eth_chainId', [])).resolves.toBe('0x8f');
    expect(seen).toEqual([NETWORKS.mainnet.rpcUrls[0]]);
  });
});
