/**
 * Monad PreFlight — reference Risk API (Cloudflare Worker).
 *
 * The engine as a service: send a transaction, get back the same
 * assessment the PreFlight app shows — simulation, asset changes, risk
 * findings, a readiness score, and a plain-language explanation. Wallets
 * and dapps that cannot embed the SDK directly can call this instead.
 *
 * Design rules, in order:
 *  - STATELESS. Nothing about a user's transaction is stored anywhere.
 *    Post-flight verification works by handing the caller an opaque
 *    `verifyBlob` at preflight time and asking for it back.
 *  - DETERMINISTIC. No AI in this service, ever. The optional narrative
 *    layer stays in clients where it is clearly labeled.
 *  - HONEST. Facts that cannot be read are reported as unknown; a
 *    degraded simulation is said to be degraded; post-flight lines are
 *    matched / mismatched / unverified — never a blanket "verified ✓".
 *
 * This reference deployment is UNAUTHENTICATED and CORS-open — it is a
 * demonstration and an integration surface, not a hardened quota system.
 * Production guidance (keys, rate limits, allowed origins) lives in
 * docs/risk-api.md. Deploy with `wrangler deploy` per that guide.
 *
 * Endpoints (JSON in, JSON out; bigints as decimal strings):
 *   POST /v1/preflight          { network, from, to, data?, value? }
 *   POST /v1/inspect-signature  { payload, network?, selfAddress? }
 *   POST /v1/postflight         { network, hash, verifyBlob }
 *   GET  /v1/delegation/:network/:address
 *   GET  /v1/meta
 */

import type { Address, Hex, PreparedTx, RiskFinding, SimulationResult } from '../src/lib/types';
import type { NetworkKey } from '../src/lib/networks';
import { NETWORKS, isNetworkKey, makeNetworkRpc } from '../src/lib/networks';
import type { RpcCallFn } from '../src/lib/simulate';
import { assessTransaction, rpcFactReader } from '../src/lib/pipeline';
import { BuildError, buildTx } from '../src/lib/txbuilder';
import { createRegistry } from '../src/lib/tokens';
import type { ChainReader } from '../src/lib/tokens';
import { inspectSignaturePayload } from '../src/lib/inspect';
import { comparePostFlight } from '../src/lib/postflight';
import type { MinedReceipt } from '../src/lib/types';
import { assessDelegationRisks, detectDelegation } from '../src/lib/delegation';
import { decodeBig, encodeBig } from '../src/lib/jsoncodec';
import { ENGINE_VERSION } from '../src/lib/sdk';
import { isAddressFormat } from '../src/lib/format';

/* ------------------------------------------------------------------ */
/* Plumbing                                                            */
/* ------------------------------------------------------------------ */

/** Reject request bodies larger than this (typed-data payloads are small). */
const MAX_BODY_BYTES = 256 * 1024;

const CORS_HEADERS: Record<string, string> = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '86400',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, bigintAsString), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...CORS_HEADERS },
  });
}

/** Public responses carry bigints as plain decimal strings — no tags. */
function bigintAsString(_key: string, value: unknown): unknown {
  return typeof value === 'bigint' ? value.toString() : value;
}

function errorResponse(status: number, message: string): Response {
  return json(status, { ok: false, error: message });
}

/** Injected so tests can fake the chain; production uses real transports. */
export interface RiskApiDeps {
  makeRpc: (network: NetworkKey) => RpcCallFn;
}

function defaultDeps(): RiskApiDeps {
  return { makeRpc: (network) => makeNetworkRpc(NETWORKS[network]) };
}

/** buildTx deps for raw transactions — the token paths are never touched. */
function rawBuildDeps() {
  const never = async (): Promise<never> => {
    throw new BuildError('The Risk API only prepares raw transactions.');
  };
  const reader: ChainReader = {
    getNativeBalance: never,
    fetchTokenInfo: never,
    erc20BalanceOf: never,
  };
  return { registry: createRegistry([]), reader };
}

/* ------------------------------------------------------------------ */
/* Request parsing                                                     */
/* ------------------------------------------------------------------ */

async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new Error('Request body too large.');
  try {
    return JSON.parse(text);
  } catch {
    throw new Error('The request body is not valid JSON.');
  }
}

function requireNetwork(value: unknown): NetworkKey {
  if (typeof value !== 'string' || !isNetworkKey(value)) {
    throw new Error('Set "network" to "testnet" or "mainnet".');
  }
  return value;
}

function requireAddress(value: unknown, field: string): Address {
  if (typeof value !== 'string' || !isAddressFormat(value)) {
    throw new Error(`"${field}" must be a 0x-prefixed 40-hex-character address.`);
  }
  return value;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

async function handlePreflight(request: Request, deps: RiskApiDeps): Promise<Response> {
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const network = requireNetwork(body.network);
  const from = requireAddress(body.from, 'from');

  // Reuse the app's raw-transaction builder so field validation and value
  // semantics ("0x…" = wei, decimal = MON) are identical everywhere.
  let tx: PreparedTx;
  try {
    tx = await buildTx(
      {
        action: 'raw',
        raw: {
          to: typeof body.to === 'string' ? body.to : '',
          ...(typeof body.data === 'string' ? { data: body.data } : {}),
          ...(typeof body.value === 'string' ? { value: body.value } : {}),
        },
        notes: [],
      },
      from,
      rawBuildDeps(),
    );
  } catch (err) {
    if (err instanceof BuildError) return errorResponse(400, err.message);
    throw err;
  }

  // Optional: addresses the caller's user trusts, for address-poisoning
  // lookalike detection. Capped so a hostile caller cannot turn this
  // into a compute sink.
  const knownAddresses = Array.isArray(body.knownAddresses)
    ? (body.knownAddresses as unknown[])
        .filter((a): a is string => typeof a === 'string' && isAddressFormat(a))
        .slice(0, 200)
    : [];

  const rpc = deps.makeRpc(network);
  const assessment = await assessTransaction(
    tx,
    { rpc, reader: rpcFactReader(rpc) },
    { knownAddresses },
  );

  return json(200, {
    ok: true,
    engine: ENGINE_VERSION,
    network,
    summary: tx.summary,
    timings: assessment.timings,
    simulation: {
      ok: assessment.sim.ok,
      revertReason: assessment.sim.revertReason ?? null,
      gasUsed: assessment.sim.gasUsed,
      gasCostWei: assessment.sim.gasCostWei,
      notes: assessment.sim.notes,
      assetChanges: assessment.sim.assetChanges,
      approvalChanges: assessment.sim.approvalChanges,
    },
    risks: assessment.risks,
    readiness: assessment.readiness,
    explanation: {
      headline: assessment.explanation.headline,
      outcome: assessment.explanation.outcome,
      bullets: assessment.explanation.bullets,
    },
    fees: assessment.fees,
    counterparty: assessment.counterparty,
    // Opaque, lossless snapshot of what was simulated. Hand it back to
    // POST /v1/postflight after the transaction lands — the service
    // stores nothing.
    verifyBlob: encodeBig({ tx, sim: assessment.sim }),
  });
}

async function handleInspect(request: Request): Promise<Response> {
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const payload =
    typeof body.payload === 'string'
      ? (() => {
          try {
            return JSON.parse(body.payload) as unknown;
          } catch {
            throw new Error('"payload" is a string but not valid JSON.');
          }
        })()
      : body.payload;
  if (payload === undefined) {
    throw new Error('Send the signature request under "payload".');
  }

  const chainIds: number[] = [];
  if (body.network !== undefined) {
    chainIds.push(NETWORKS[requireNetwork(body.network)].chainId);
  } else {
    chainIds.push(NETWORKS.testnet.chainId, NETWORKS.mainnet.chainId);
  }

  const reading = inspectSignaturePayload(payload, {
    expectedChainIds: chainIds,
    ...(typeof body.selfAddress === 'string' && isAddressFormat(body.selfAddress)
      ? { selfAddress: body.selfAddress }
      : {}),
  });
  if ('error' in reading) return json(200, { ok: true, recognized: false, ...reading });
  return json(200, { ok: true, recognized: true, ...reading });
}

async function handlePostflight(request: Request, deps: RiskApiDeps): Promise<Response> {
  const body = (await readJsonBody(request)) as Record<string, unknown>;
  const network = requireNetwork(body.network);
  const hash = typeof body.hash === 'string' ? body.hash : '';
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    throw new Error('"hash" must be a 0x-prefixed 64-hex-character transaction hash.');
  }
  if (typeof body.verifyBlob !== 'string') {
    throw new Error('Send back the "verifyBlob" your preflight response included.');
  }

  let snapshot: { tx: PreparedTx; sim: SimulationResult };
  try {
    snapshot = decodeBig(body.verifyBlob) as { tx: PreparedTx; sim: SimulationResult };
    if (!snapshot?.tx?.from || !snapshot?.sim) throw new Error('bad blob');
  } catch {
    throw new Error('That verifyBlob is not one this service produced.');
  }

  const rpc = deps.makeRpc(network);
  const raw = (await rpc('eth_getTransactionReceipt', [hash])) as Record<
    string,
    unknown
  > | null;
  if (raw === null) {
    return json(200, { ok: true, status: 'pending', check: null });
  }

  const receipt: MinedReceipt = {
    status: raw.status === '0x1' ? 'success' : 'reverted',
    gasUsed: BigInt((raw.gasUsed as string) ?? '0x0'),
    effectiveGasPrice: BigInt((raw.effectiveGasPrice as string) ?? '0x0'),
    blockNumber: BigInt((raw.blockNumber as string) ?? '0x0'),
    logs: Array.isArray(raw.logs)
      ? (raw.logs as Record<string, unknown>[]).map((l) => ({
          address: l.address as Address,
          topics: (l.topics as Hex[]) ?? [],
          data: (l.data as Hex) ?? '0x',
        }))
      : [],
  };

  const check = comparePostFlight(snapshot.tx, snapshot.sim, receipt, snapshot.tx.from);
  return json(200, { ok: true, status: 'mined', check });
}

async function handleDelegation(
  network: NetworkKey,
  address: Address,
  deps: RiskApiDeps,
): Promise<Response> {
  const rpc = deps.makeRpc(network);
  const code = (await rpc('eth_getCode', [address, 'latest'])) as string;
  const delegation = detectDelegation(code);
  const risks: RiskFinding[] = assessDelegationRisks({
    self: delegation,
    counterparty: detectDelegation('0x'),
    counterpartyIsRecipient: false,
  });
  return json(200, {
    ok: true,
    engine: ENGINE_VERSION,
    network,
    address,
    delegated: delegation.delegated,
    delegatedTo: delegation.delegated ? (delegation.implementation ?? null) : null,
    risks,
  });
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function createRiskApi(deps: RiskApiDeps = defaultDeps()) {
  return {
    async fetch(request: Request): Promise<Response> {
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: CORS_HEADERS });
      }

      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, '') || '/';

      try {
        if (request.method === 'GET' && path === '/v1/meta') {
          return json(200, {
            ok: true,
            engine: ENGINE_VERSION,
            networks: Object.keys(NETWORKS),
            deterministic: true,
            stateless: true,
            endpoints: [
              'POST /v1/preflight',
              'POST /v1/inspect-signature',
              'POST /v1/postflight',
              'GET /v1/delegation/:network/:address',
            ],
          });
        }

        const delegationMatch = path.match(/^\/v1\/delegation\/([^/]+)\/([^/]+)$/);
        if (request.method === 'GET' && delegationMatch) {
          const network = requireNetwork(delegationMatch[1]);
          const address = requireAddress(delegationMatch[2], 'address');
          return await handleDelegation(network, address, deps);
        }

        if (request.method === 'POST' && path === '/v1/preflight') {
          return await handlePreflight(request, deps);
        }
        if (request.method === 'POST' && path === '/v1/inspect-signature') {
          return await handleInspect(request);
        }
        if (request.method === 'POST' && path === '/v1/postflight') {
          return await handlePostflight(request, deps);
        }

        if (['/v1/preflight', '/v1/inspect-signature', '/v1/postflight'].includes(path)) {
          return errorResponse(405, 'Use POST for this endpoint.');
        }
        return errorResponse(404, 'No such endpoint. GET /v1/meta lists what exists.');
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unexpected error.';
        // Input problems → 400. Anything the chain did → 502, honestly.
        const status = /must be|not valid|Send |Set |too large|not one this service/.test(
          message,
        )
          ? 400
          : 502;
        return errorResponse(status, message);
      }
    },
  };
}

export default createRiskApi();
