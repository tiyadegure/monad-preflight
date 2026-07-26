import { describe, expect, it } from 'vitest';
// Deliberately import the BUILT artifact — this suite exists to prove
// that dist-sdk is consumable, not that the sources work (npm test does that).
// @ts-expect-error — built output has no source types in this project view
import * as sdk from '../dist-sdk/sdk.js';

describe('built SDK (dist-sdk) smoke', () => {
  it('exposes the engine version and the one-call pipeline', () => {
    expect(typeof sdk.ENGINE_VERSION).toBe('string');
    expect(typeof sdk.assessTransaction).toBe('function');
    expect(typeof sdk.rpcFactReader).toBe('function');
    expect(typeof sdk.makeNetworkRpc).toBe('function');
    expect(sdk.NETWORKS.testnet.chainId).toBe(10143);
    expect(sdk.NETWORKS.mainnet.chainId).toBe(143);
  });

  it('parses an intent and runs a full offline assessment end to end', async () => {
    const parsed = sdk.parseIntent(
      'send 1 MON to 0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );
    expect(parsed.ok).toBe(true);

    const tx = {
      from: '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      to: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      data: '0x',
      value: 10n ** 18n,
      kind: 'native-transfer',
      summary: 'Send 1 MON',
      counterparty: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    };
    const rpc = async (method: string) => {
      switch (method) {
        case 'debug_traceCall':
          return {
            type: 'CALL',
            from: tx.from,
            to: tx.to,
            gas: '0x7530',
            gasUsed: '0x5208',
            input: '0x',
            value: `0x${(10n ** 18n).toString(16)}`,
          };
        case 'eth_estimateGas':
          return '0x5208';
        case 'eth_gasPrice':
          return '0x3b9aca00';
        case 'eth_getBalance':
          return '0x8ac7230489e80000';
        case 'eth_getCode':
          return '0x';
        case 'eth_getTransactionCount':
          return '0x1';
        default:
          throw new Error(`no handler for ${method}`);
      }
    };
    const assessment = await sdk.assessTransaction(
      tx,
      { rpc, reader: sdk.rpcFactReader(rpc) },
      { includeFees: false, includeFingerprint: false },
    );
    expect(assessment.sim.ok).toBe(true);
    expect(assessment.readiness.score).toBeGreaterThan(0);
    expect(assessment.explanation.headline.length).toBeGreaterThan(0);
  });

  it('triages a signature payload and round-trips bigints', () => {
    const reading = sdk.inspectSignaturePayload(
      { chainId: 0, address: '0x1111111111111111111111111111111111111111', nonce: 0 },
      { expectedChainIds: [10143] },
    );
    expect('error' in reading).toBe(false);

    const blob = sdk.encodeBig({ value: 123n });
    expect(sdk.decodeBig(blob)).toEqual({ value: 123n });
  });
});
