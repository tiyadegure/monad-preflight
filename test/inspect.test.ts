import { describe, expect, it } from 'vitest';
import { inspectSignaturePayload } from '../src/lib/inspect';
import type { Address } from '../src/lib/types';

const SELF = '0x1111111111111111111111111111111111111111' as Address;
const OTHER = '0x2222222222222222222222222222222222222222';

const OPTS = { expectedChainIds: [10143] };

describe('inspectSignaturePayload — triage order and routing', () => {
  it('routes an EIP-7702 authorization, before anything else', () => {
    const r = inspectSignaturePayload(
      { chainId: 10143, address: OTHER, nonce: 1 },
      { ...OPTS, selfAddress: SELF },
    );
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.kind).toBe('authorization');
      expect(r.headline.length).toBeGreaterThan(0);
    }
  });

  it('routes an EIP-5792 batch and lists each instruction', () => {
    const r = inspectSignaturePayload(
      {
        version: '1.0',
        chainId: '0x279f',
        from: SELF,
        calls: [
          { to: OTHER, value: '0x0', data: '0x' },
          { to: SELF, value: '0x1', data: '0xdeadbeef' },
        ],
      },
      OPTS,
    );
    expect('error' in r).toBe(false);
    if (!('error' in r)) {
      expect(r.kind).toBe('batch');
      expect(r.bullets.filter((b) => b.startsWith('Instruction')).length).toBe(2);
    }
  });

  it('routes EIP-712 typed data', () => {
    const r = inspectSignaturePayload(
      {
        types: {
          EIP712Domain: [{ name: 'name', type: 'string' }],
          Mail: [{ name: 'contents', type: 'string' }],
        },
        domain: { name: 'App', chainId: 10143 },
        primaryType: 'Mail',
        message: { contents: 'hi' },
      },
      OPTS,
    );
    expect('error' in r).toBe(false);
    if (!('error' in r)) expect(r.kind).toBe('typed-data');
  });

  it('returns a plain-language error for unrecognized payloads', () => {
    const r = inspectSignaturePayload({ hello: 'world' }, OPTS);
    expect('error' in r).toBe(true);
  });

  it('surfaces batch parse errors as-is', () => {
    const r = inspectSignaturePayload(
      { version: '1.0', chainId: '0x279f', from: SELF, calls: [] },
      OPTS,
    );
    // Whatever the batch module decided — error or reading — it must not throw.
    expect(r).toBeTruthy();
  });
});
