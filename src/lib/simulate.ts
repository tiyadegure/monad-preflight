/**
 * Simulation module: run an unsigned tx through the RPC's
 * debug_traceCall (callTracer + withLog — supported on Monad testnet)
 * and turn the raw trace into human-meaningful facts:
 * asset changes, approval changes, decoded events, gas, and plain notes.
 *
 * If the RPC gateway has debug_traceCall disabled we fall back to a
 * basic eth_call revert check and say so in a note.
 */

import { decodeAbiParameters, getAddress, numberToHex } from 'viem';
import type {
  Address,
  ApprovalChange,
  AssetChange,
  CallFrameSummary,
  DecodedEvent,
  Hex,
  PreparedTx,
  SimulationResult,
  TokenInfo,
} from './types';
import { NATIVE_MON } from './types';
import { UNLIMITED_THRESHOLD, shortAddress } from './format';

/* ------------------------------------------------------------------ */
/* RPC client                                                          */
/* ------------------------------------------------------------------ */

/** Minimal JSON-RPC call function. Throws Error(message) on JSON-RPC error. */
export type RpcCallFn = (method: string, params: unknown[]) => Promise<unknown>;

/** How long we wait for one endpoint before trying the next one. */
const DEFAULT_RPC_TIMEOUT_MS = 20_000;

/** Parsed JSON-RPC 2.0 response body. */
interface JsonRpcPayload {
  result?: unknown;
  error?: { code?: number; message?: string };
}

/**
 * What happened when we asked one endpoint:
 * - answered:    a well-formed JSON-RPC body came back (result OR error) —
 *                either way, this is a real answer from a working endpoint.
 * - unavailable: network failure, timeout, HTTP 5xx/429, or a garbled
 *                body — worth trying the next endpoint.
 * - rejected:    any other HTTP error (403, 404, ...) — the endpoint is up
 *                but refused this request; retrying elsewhere is not our call.
 */
type EndpointReply =
  | { kind: 'answered'; payload: JsonRpcPayload }
  | { kind: 'unavailable' }
  | { kind: 'rejected'; status: number };

/** POST one JSON-RPC request to one endpoint, with a hard timeout. */
async function callEndpoint(url: string, body: string, timeoutMs: number): Promise<EndpointReply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });
    // 429 = rate limited, 5xx = server trouble: both mean "try elsewhere".
    if (response.status === 429 || response.status >= 500) {
      return { kind: 'unavailable' };
    }
    if (!response.ok) {
      return { kind: 'rejected', status: response.status };
    }
    const parsed: unknown = await response.json();
    if (parsed === null || typeof parsed !== 'object') {
      return { kind: 'unavailable' };
    }
    return { kind: 'answered', payload: parsed as JsonRpcPayload };
  } catch {
    // fetch threw: network down, DNS failure, unparseable body, or our
    // timeout fired (AbortController). All of these mean "try elsewhere".
    return { kind: 'unavailable' };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * fetch-based JSON-RPC 2.0 client with incrementing request ids.
 *
 * Accepts one url or an ordered list. Order matters: index 0 must be the
 * most capable endpoint (the one that supports debug_traceCall).
 *
 * Reliability behavior:
 * - Every request gets a hard timeout (default 20 s) via AbortController.
 * - On network errors, timeouts, HTTP 5xx, or HTTP 429 it fails over to
 *   the next url in order, wrapping around the end of the list.
 * - A well-formed JSON-RPC { error } body is a real answer (a revert, an
 *   unsupported method, ...) — it is thrown to the caller unchanged and
 *   never triggers failover.
 * - It remembers which endpoint answered last and starts there next time.
 */
export function makeHttpRpc(urls: string | string[], opts?: { timeoutMs?: number }): RpcCallFn {
  const endpoints = typeof urls === 'string' ? [urls] : [...urls];
  if (endpoints.length === 0) {
    throw new Error('makeHttpRpc needs at least one RPC url.');
  }
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;

  let requestId = 0;
  // The endpoint that most recently gave a real answer. Every call starts
  // there and only moves on when that endpoint stops responding.
  let preferredIndex = 0;

  return async (method, params) => {
    for (let attempt = 0; attempt < endpoints.length; attempt += 1) {
      const index = (preferredIndex + attempt) % endpoints.length;
      const url = endpoints[index];
      requestId += 1;
      const body = JSON.stringify({ jsonrpc: '2.0', id: requestId, method, params });

      const reply = await callEndpoint(url, body, timeoutMs);
      if (reply.kind === 'unavailable') continue;
      if (reply.kind === 'rejected') {
        throw new Error(`The RPC server answered with HTTP ${reply.status} for ${method}.`);
      }

      preferredIndex = index;
      if (reply.payload.error) {
        throw new Error(
          reply.payload.error.message ??
            `RPC error ${reply.payload.error.code ?? 'unknown'} for ${method}`,
        );
      }
      return reply.payload.result;
    }

    const tried = endpoints.length;
    throw new Error(
      tried === 1
        ? 'We could not reach the network. We tried 1 endpoint and it did not answer. Please check your connection and try again.'
        : `We could not reach the network. We tried ${tried} endpoints and none of them answered. Please check your connection and try again.`,
    );
  };
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

// keccak256 topic0 hashes of the event signatures we know how to decode
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';
const DEPOSIT_TOPIC = '0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c';
const WITHDRAWAL_TOPIC = '0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65';

// 4-byte selectors of the two standard Solidity revert wrappers
const ERROR_STRING_SELECTOR = '0x08c379a0'; // Error(string)
const PANIC_SELECTOR = '0x4e487b71'; // Panic(uint256)

// 4-byte selectors for token metadata reads
const DECIMALS_CALLDATA = '0x313ce567'; // decimals()
const SYMBOL_CALLDATA = '0x95d89b41'; // symbol()

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const WALLET_FEE_NOTE = 'Your wallet will show the exact network fee before you sign.';
const FALLBACK_NOTE = 'Deep simulation unavailable on this RPC — ran a basic check instead.';
const NO_REASON = 'The contract rejected the transaction without giving a reason.';

/* ------------------------------------------------------------------ */
/* Raw trace shapes (what debug_traceCall's callTracer returns)        */
/* ------------------------------------------------------------------ */

interface RawLog {
  address?: string;
  topics?: string[];
  data?: string;
  position?: string | number;
}

interface RawFrame {
  type?: string;
  from?: string;
  to?: string;
  value?: string;
  gas?: string;
  gasUsed?: string;
  input?: string;
  output?: string;
  error?: string;
  revertReason?: string;
  calls?: RawFrame[];
  logs?: RawLog[];
}

interface NativeMove {
  from: Address;
  to?: Address;
  value: bigint;
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** "0x" or undefined mean zero. */
function hexToBigInt(x?: string): bigint {
  if (!x || x === '0x') return 0n;
  return BigInt(x);
}

/** Checksum an address; on anything unexpected, keep the raw string. */
function toChecksum(addr: string): Address {
  try {
    return getAddress(addr);
  } catch {
    return addr as Address;
  }
}

/** Last 20 bytes of a 32-byte topic → address. */
function topicToAddress(topic: string): Address {
  return toChecksum(`0x${topic.slice(-40)}`);
}

/** First 32-byte word of log data as a bigint. */
function firstWord(data: string): bigint {
  const body = data.startsWith('0x') ? data.slice(2) : data;
  const word = body.slice(0, 64);
  return word.length === 0 ? 0n : BigInt(`0x${word}`);
}

/* ------------------------------------------------------------------ */
/* Frame walking                                                       */
/* ------------------------------------------------------------------ */

function walkFrames(
  frame: RawFrame,
  depth: number,
  frames: CallFrameSummary[],
  logs: RawLog[],
  nativeMoves: NativeMove[],
  underError = false,
): void {
  const type = (frame.type ?? 'CALL').toUpperCase();
  const valueWei = hexToBigInt(frame.value);
  // A frame inside a reverted subtree had all its effects rolled back,
  // even if the frame itself reports no error (e.g. a contract catching
  // a child call's revert after the child's own children "succeeded").
  const rolledBack = underError || !!frame.error;
  const summary: CallFrameSummary = {
    depth,
    type,
    from: toChecksum(frame.from ?? ZERO_ADDRESS),
    to: frame.to ? toChecksum(frame.to) : undefined,
    valueWei,
    gasUsed: hexToBigInt(frame.gasUsed),
    error: frame.error,
    revertReason: frame.revertReason,
  };
  frames.push(summary);

  // Only CALL and CREATE frames move native MON; DELEGATECALL and
  // STATICCALL never carry value. A rolled-back frame moved nothing.
  const movesValue = type === 'CALL' || type === 'CREATE' || type === 'CREATE2';
  if (movesValue && valueWei > 0n && !rolledBack) {
    nativeMoves.push({ from: summary.from, to: summary.to, value: valueWei });
  }

  // The tracer already omits logs of reverted frames; the rolledBack
  // check is defense in depth for tracer implementations that don't.
  if (!rolledBack) {
    for (const log of frame.logs ?? []) logs.push(log);
  }
  for (const child of frame.calls ?? []) {
    walkFrames(child, depth + 1, frames, logs, nativeMoves, rolledBack);
  }
}

/* ------------------------------------------------------------------ */
/* Event decoding                                                      */
/* ------------------------------------------------------------------ */

function decodeLog(log: RawLog): DecodedEvent {
  const address = toChecksum(log.address ?? ZERO_ADDRESS);
  const topics = (log.topics ?? []).map((t) => t as Hex);
  const data = (log.data ?? '0x') as Hex;
  const raw = { topics, data };
  const topic0 = topics[0]?.toLowerCase();
  const t1 = topics[1];
  const t2 = topics[2];

  // Topic counts matter: an ERC-721 Transfer shares the same topic0 but
  // has 4 topics — treat anything with the wrong shape as unknown.
  if (topic0 === TRANSFER_TOPIC && topics.length === 3 && t1 && t2) {
    return {
      address,
      name: 'Transfer',
      args: {
        from: topicToAddress(t1),
        to: topicToAddress(t2),
        value: firstWord(data).toString(),
      },
      raw,
    };
  }
  if (topic0 === APPROVAL_TOPIC && topics.length === 3 && t1 && t2) {
    return {
      address,
      name: 'Approval',
      args: {
        owner: topicToAddress(t1),
        spender: topicToAddress(t2),
        value: firstWord(data).toString(),
      },
      raw,
    };
  }
  if (topic0 === DEPOSIT_TOPIC && topics.length === 2 && t1) {
    return {
      address,
      name: 'Deposit',
      args: { dst: topicToAddress(t1), wad: firstWord(data).toString() },
      raw,
    };
  }
  if (topic0 === WITHDRAWAL_TOPIC && topics.length === 2 && t1) {
    return {
      address,
      name: 'Withdrawal',
      args: { src: topicToAddress(t1), wad: firstWord(data).toString() },
      raw,
    };
  }
  return { address, name: 'unknown', raw };
}

/* ------------------------------------------------------------------ */
/* Revert reason decoding                                              */
/* ------------------------------------------------------------------ */

function panicName(code: bigint): string {
  switch (code) {
    case 0x01n:
      return 'failed assertion';
    case 0x11n:
      return 'arithmetic overflow';
    case 0x12n:
      return 'division by zero';
    case 0x32n:
      return 'index out of range';
    default:
      return `internal error code 0x${code.toString(16).padStart(2, '0')}`;
  }
}

function decodeRevertReason(frame: RawFrame): string {
  if (frame.revertReason) return frame.revertReason;
  const output = frame.output ?? '0x';
  if (output === '0x' || output.length < 10) return NO_REASON;
  const selector = output.slice(0, 10).toLowerCase();

  if (selector === ERROR_STRING_SELECTOR) {
    try {
      const [reason] = decodeAbiParameters(
        [{ type: 'string' }] as const,
        `0x${output.slice(10)}` as Hex,
      );
      return reason;
    } catch {
      return 'The contract rejected the transaction without giving a readable reason.';
    }
  }
  if (selector === PANIC_SELECTOR) {
    try {
      const [code] = decodeAbiParameters(
        [{ type: 'uint256' }] as const,
        `0x${output.slice(10)}` as Hex,
      );
      return `The contract stopped the transaction: ${panicName(code)}.`;
    } catch {
      return 'The contract stopped the transaction with an internal error.';
    }
  }
  // Anything else is a contract-specific custom error we cannot name.
  return `The contract rejected it with custom error ${selector}.`;
}

/** Turn an eth_call error message into a readable reason (fallback path). */
function reasonFromErrorMessage(message: string): string {
  const stripped = message.replace(/^execution reverted:?\s*/i, '').trim();
  return stripped.length > 0 ? stripped : NO_REASON;
}

/* ------------------------------------------------------------------ */
/* Token metadata                                                      */
/* ------------------------------------------------------------------ */

/** ABI string decode first; then bytes32-with-trailing-zeros (older tokens). */
function decodeSymbol(raw: string): string {
  try {
    const [decoded] = decodeAbiParameters([{ type: 'string' }] as const, raw as Hex);
    if (decoded.length > 0) return decoded;
  } catch {
    // Not ABI-encoded — try the bytes32 shape below.
  }
  const word = raw.startsWith('0x') ? raw.slice(2, 66) : raw.slice(0, 64);
  let out = '';
  for (let i = 0; i + 2 <= word.length; i += 2) {
    const code = Number.parseInt(word.slice(i, i + 2), 16);
    if (Number.isNaN(code) || code === 0) break;
    out += String.fromCharCode(code);
  }
  if (out.length === 0) throw new Error('token symbol is unreadable');
  return out;
}

async function fetchTokenInfo(
  address: Address,
  rpc: RpcCallFn,
  cache: Map<string, TokenInfo>,
  notes: string[],
): Promise<TokenInfo> {
  const key = address.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  let decimals = 18;
  let symbol = shortAddress(address);
  let degraded = false;

  try {
    const raw = await rpc('eth_call', [{ to: address, data: DECIMALS_CALLDATA }, 'latest']);
    if (typeof raw !== 'string' || !/^0x[0-9a-fA-F]{2,}$/.test(raw)) {
      throw new Error('unreadable decimals');
    }
    // decimals fits in one byte; it is the last byte of the 32-byte word.
    decimals = Number.parseInt(raw.slice(-2), 16);
  } catch {
    degraded = true;
  }

  try {
    const raw = await rpc('eth_call', [{ to: address, data: SYMBOL_CALLDATA }, 'latest']);
    if (typeof raw !== 'string' || raw.length < 4) throw new Error('unreadable symbol');
    symbol = decodeSymbol(raw);
  } catch {
    degraded = true;
  }

  if (degraded) {
    notes.push(
      `The token at ${shortAddress(address)} did not report its details, so we show a shortened address and assume 18 decimals.`,
    );
  }

  const info: TokenInfo = { address, symbol, decimals };
  cache.set(key, info);
  return info;
}

/* ------------------------------------------------------------------ */
/* Gas                                                                 */
/* ------------------------------------------------------------------ */

async function fetchGasPriceWei(rpc: RpcCallFn, notes: string[]): Promise<bigint> {
  try {
    const raw = await rpc('eth_gasPrice', []);
    if (typeof raw !== 'string') throw new Error('unexpected gas price response');
    return hexToBigInt(raw);
  } catch {
    notes.push('We could not read the current network gas price, so the fee estimate may show as zero.');
    return 0n;
  }
}

/* ------------------------------------------------------------------ */
/* Fallback path: debug_traceCall unavailable                          */
/* ------------------------------------------------------------------ */

async function simulateWithoutTrace(
  tx: PreparedTx,
  callObj: Record<string, string>,
  rpc: RpcCallFn,
  notes: string[],
): Promise<SimulationResult> {
  notes.push(FALLBACK_NOTE);

  let ok = true;
  let revertReason: string | undefined;
  try {
    await rpc('eth_call', [callObj, 'latest']);
  } catch (err) {
    ok = false;
    revertReason = reasonFromErrorMessage(err instanceof Error ? err.message : String(err));
  }

  // Without a trace we only know about the tx's own native value.
  const assetChanges: AssetChange[] = [];
  if (ok && tx.value > 0n) {
    assetChanges.push({ party: tx.from, token: NATIVE_MON, deltaRaw: -tx.value });
    assetChanges.push({ party: tx.to, token: NATIVE_MON, deltaRaw: tx.value });
  }

  let gasUsed = 0n;
  try {
    const estimated = await rpc('eth_estimateGas', [callObj]);
    if (typeof estimated !== 'string') throw new Error('unexpected estimate response');
    gasUsed = hexToBigInt(estimated);
  } catch {
    if (ok) notes.push('We could not estimate how much gas this transaction needs.');
  }

  const gasPrice = await fetchGasPriceWei(rpc, notes);
  notes.push(WALLET_FEE_NOTE);

  return {
    ok,
    revertReason,
    gasUsed,
    gasCostWei: gasUsed * gasPrice,
    assetChanges,
    approvalChanges: [],
    events: [],
    frames: [],
    notes,
  };
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export async function simulateTx(tx: PreparedTx, rpc: RpcCallFn): Promise<SimulationResult> {
  const notes: string[] = [];

  const callObj: Record<string, string> = { from: tx.from, to: tx.to, data: tx.data };
  if (tx.value > 0n) callObj.value = numberToHex(tx.value);

  let root: RawFrame | null = null;
  try {
    const traced = await rpc('debug_traceCall', [
      callObj,
      'latest',
      { tracer: 'callTracer', tracerConfig: { withLog: true } },
    ]);
    if (traced && typeof traced === 'object') root = traced as RawFrame;
  } catch {
    root = null;
  }
  if (root === null) {
    // Some gateways disable debug_traceCall entirely.
    return simulateWithoutTrace(tx, callObj, rpc, notes);
  }

  const frames: CallFrameSummary[] = [];
  const rawLogs: RawLog[] = [];
  const nativeMoves: NativeMove[] = [];
  walkFrames(root, 0, frames, rawLogs, nativeMoves);

  const top = frames[0];
  if (top === undefined) {
    // Should be impossible; treat it like a disabled tracer.
    return simulateWithoutTrace(tx, callObj, rpc, notes);
  }

  const ok = !root.error;
  const revertReason = ok ? undefined : decodeRevertReason(root);
  const events = rawLogs.map(decodeLog);

  // ---- asset deltas: merge per (party, token), then drop zero nets ----
  const deltas = new Map<string, { party: Address; tokenAddress: Address | null; delta: bigint }>();
  const bump = (party: Address, tokenAddress: Address | null, amount: bigint): void => {
    const key = `${party.toLowerCase()}|${tokenAddress ? tokenAddress.toLowerCase() : 'native'}`;
    const entry = deltas.get(key);
    if (entry) entry.delta += amount;
    else deltas.set(key, { party, tokenAddress, delta: amount });
  };

  if (ok) {
    for (const event of events) {
      if (event.name !== 'Transfer' || !event.args) continue;
      const value = BigInt(event.args.value ?? '0');
      bump(event.args.from as Address, event.address, -value);
      bump(event.args.to as Address, event.address, value);
    }
    for (const move of nativeMoves) {
      bump(move.from, null, -move.value);
      if (move.to) bump(move.to, null, move.value);
    }
  }

  const tokenCache = new Map<string, TokenInfo>();
  const assetChanges: AssetChange[] = [];
  for (const { party, tokenAddress, delta } of deltas.values()) {
    if (delta === 0n) continue;
    const token =
      tokenAddress === null ? NATIVE_MON : await fetchTokenInfo(tokenAddress, rpc, tokenCache, notes);
    assetChanges.push({ party, token, deltaRaw: delta });
  }

  // ---- approvals ----
  const approvalChanges: ApprovalChange[] = [];
  for (const event of events) {
    if (event.name !== 'Approval' || !event.args) continue;
    const amountRaw = BigInt(event.args.value ?? '0');
    approvalChanges.push({
      owner: event.args.owner as Address,
      spender: event.args.spender as Address,
      token: await fetchTokenInfo(event.address, rpc, tokenCache, notes),
      amountRaw,
      unlimited: amountRaw >= UNLIMITED_THRESHOLD,
    });
  }

  // ---- gas: prefer eth_estimateGas (it includes intrinsic gas) ----
  let gasUsed = top.gasUsed;
  try {
    const estimated = await rpc('eth_estimateGas', [callObj]);
    if (typeof estimated === 'string' && estimated.startsWith('0x')) {
      gasUsed = hexToBigInt(estimated);
    }
  } catch {
    // Expected when the tx reverts; only worth a note on a passing tx.
    if (ok) {
      notes.push('The network would not give a full gas estimate, so the gas shown may be slightly low.');
    }
  }

  const gasPrice = await fetchGasPriceWei(rpc, notes);
  notes.push(WALLET_FEE_NOTE);

  return {
    ok,
    revertReason,
    gasUsed,
    gasCostWei: gasUsed * gasPrice,
    assetChanges,
    approvalChanges,
    events,
    frames,
    notes,
  };
}
