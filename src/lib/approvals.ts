/**
 * Approval scanner ("the Hangar"): find every live ERC-20 allowance the
 * user has granted.
 *
 * How it works:
 * 1. Walk backwards through recent blocks reading Approval events where
 *    the user is the owner (the RPC caps eth_getLogs at 100-block ranges,
 *    so we scan in 100-block chunks).
 * 2. Collect the unique (token, spender) pairs those events mention.
 * 3. Verify each pair with a live allowance() read — events only tell us
 *    an approval happened once; the live read tells us what is still open.
 *    Pairs whose allowance is now zero (revoked or fully spent) drop out.
 * 4. Fetch token symbol/decimals so the UI can show human-readable rows.
 *
 * The scan is honest about its limits: the notes always say how many
 * blocks were covered, so older approvals are never silently "not found".
 */

import { decodeAbiParameters, getAddress } from 'viem';
import type { Address, Hex, TokenInfo } from './types';
import type { RpcCallFn } from './simulate';
import { UNLIMITED_THRESHOLD, shortAddress } from './format';

/* ------------------------------------------------------------------ */
/* Public shapes (the Hangar UI consumes these exactly)                */
/* ------------------------------------------------------------------ */

export interface ApprovalRecord {
  token: TokenInfo;
  spender: Address;
  /** Live on-chain allowance right now, in raw token units */
  allowanceRaw: bigint;
  unlimited: boolean;
  /** Newest block in which we saw an Approval event for this pair */
  lastSeenBlock: bigint;
}

export interface ApprovalScan {
  records: ApprovalRecord[];
  /**
   * False when any block range or allowance read failed. An empty result
   * from an incomplete scan means "we could not look", which is not the
   * same as "there is nothing there" — the UI must say so.
   */
  complete: boolean;
  /** How many blocks the scan window covered */
  scannedBlocks: number;
  /** Oldest block scanned */
  fromBlock: bigint;
  /** Newest block scanned (the chain tip when the scan started) */
  toBlock: bigint;
  /** Plain-language caveats, always including scan coverage */
  notes: string[];
}

/* ------------------------------------------------------------------ */
/* Constants                                                           */
/* ------------------------------------------------------------------ */

// keccak256 of Approval(address,address,uint256)
const APPROVAL_TOPIC = '0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925';

// 4-byte selectors
const ALLOWANCE_SELECTOR = '0xdd62ed3e'; // allowance(address,address)
const DECIMALS_CALLDATA = '0x313ce567'; // decimals()
const SYMBOL_CALLDATA = '0x95d89b41'; // symbol()

/** The RPC caps eth_getLogs at 100-block ranges. */
const CHUNK_BLOCKS = 100n;
/** Default chunk budget: 40 chunks ≈ 4,000 blocks. */
const DEFAULT_MAX_CHUNKS = 40;
/** Most (token, spender) pairs we live-verify in one scan. */
const MAX_PAIRS = 40;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Minimal hex quantity, e.g. 255n -> "0xff". */
function toHexQuantity(n: bigint): Hex {
  return `0x${n.toString(16)}`;
}

/** "0x", undefined, or garbage mean zero. */
function hexToBigInt(x?: string): bigint {
  if (!x || x === '0x') return 0n;
  try {
    return BigInt(x);
  } catch {
    return 0n;
  }
}

/** Address left-padded to a 32-byte word, lowercase, no 0x prefix. */
function padAddressWord(addr: string): string {
  return addr.slice(2).toLowerCase().padStart(64, '0');
}

/** Checksum an address; on anything unexpected, keep the raw string. */
function toChecksum(addr: string): Address {
  try {
    return getAddress(addr);
  } catch {
    return addr as Address;
  }
}

/* ------------------------------------------------------------------ */
/* Token metadata (same graceful pattern as simulate.ts)               */
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

  const checksummed = toChecksum(address);
  let decimals = 18;
  let symbol = shortAddress(checksummed);
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
      `The token at ${shortAddress(checksummed)} did not report its details, so we show a shortened address and assume 18 decimals.`,
    );
  }

  const info: TokenInfo = { address: checksummed, symbol, decimals };
  cache.set(key, info);
  return info;
}

/* ------------------------------------------------------------------ */
/* Log collection                                                      */
/* ------------------------------------------------------------------ */

interface PairSeen {
  token: Address;
  spender: Address;
  lastSeenBlock: bigint;
}

/** What one eth_getLogs entry looks like (loosely — RPCs vary). */
interface RawApprovalLog {
  address?: string;
  topics?: string[];
  blockNumber?: string;
}

function collectPair(raw: unknown, pairs: Map<string, PairSeen>): void {
  if (raw === null || typeof raw !== 'object') return;
  const log = raw as RawApprovalLog;
  const topics = log.topics ?? [];
  // ERC-20 Approval has exactly 3 topics (signature, owner, spender).
  // Anything else (ERC-721 ApprovalForAll, malformed logs, ...) is not ours.
  if (topics.length !== 3) return;
  const spenderTopic = topics[2];
  if (typeof log.address !== 'string' || log.address.length !== 42) return;
  if (typeof spenderTopic !== 'string' || spenderTopic.length !== 66) return;

  const token = log.address.toLowerCase() as Address;
  const spender = `0x${spenderTopic.slice(-40).toLowerCase()}` as Address;
  const block = hexToBigInt(log.blockNumber);
  const key = `${token}|${spender}`;
  const existing = pairs.get(key);
  if (existing) {
    if (block > existing.lastSeenBlock) existing.lastSeenBlock = block;
  } else {
    pairs.set(key, { token, spender, lastSeenBlock: block });
  }
}

/* ------------------------------------------------------------------ */
/* Main entry point                                                    */
/* ------------------------------------------------------------------ */

export async function scanApprovals(
  rpc: RpcCallFn,
  owner: Address,
  opts?: { maxChunks?: number },
): Promise<ApprovalScan> {
  const notes: string[] = [];
  const maxChunks = Math.max(1, Math.floor(opts?.maxChunks ?? DEFAULT_MAX_CHUNKS));

  let latest: bigint;
  try {
    const raw = await rpc('eth_blockNumber', []);
    if (typeof raw !== 'string') throw new Error('unexpected block number response');
    latest = hexToBigInt(raw);
  } catch {
    throw new Error(
      'We could not reach the network to find the latest block, so the approval scan did not run. Please try again.',
    );
  }

  const ownerTopic = `0x${padAddressWord(owner)}`;

  // ---- 1 + 2: walk backwards in 100-block chunks, collect unique pairs ----
  const pairs = new Map<string, PairSeen>();
  let windowFrom = latest;
  let chunkTo = latest;
  // A skipped range is a hole in the evidence. We keep count so the scan
  // can never present a partial read as a complete answer — "we found
  // nothing" and "we could not look" must never sound the same.
  let failedChunks = 0;
  for (let chunk = 0; chunk < maxChunks; chunk += 1) {
    const chunkFrom = chunkTo >= CHUNK_BLOCKS - 1n ? chunkTo - (CHUNK_BLOCKS - 1n) : 0n;
    windowFrom = chunkFrom;
    try {
      const logs = await rpc('eth_getLogs', [
        {
          fromBlock: toHexQuantity(chunkFrom),
          toBlock: toHexQuantity(chunkTo),
          topics: [APPROVAL_TOPIC, ownerTopic],
        },
      ]);
      if (Array.isArray(logs)) {
        for (const log of logs) collectPair(log, pairs);
      } else {
        failedChunks += 1;
      }
    } catch {
      // One flaky range must not kill the whole scan — but it must be
      // reported, not silently treated as "no approvals here".
      failedChunks += 1;
    }
    if (chunkFrom === 0n) break; // reached the start of the chain
    chunkTo = chunkFrom - 1n;
  }

  const scannedBlocks = Number(latest - windowFrom + 1n);
  notes.push(
    `Scanned the last ${scannedBlocks.toLocaleString('en-US')} blocks — approvals granted earlier than that will not show here yet.`,
  );
  if (failedChunks > 0) {
    notes.push(
      `${failedChunks} block range${failedChunks === 1 ? '' : 's'} could not be read, so this list may be incomplete. ` +
        'Scan again before treating it as the full picture.',
    );
  }

  // ---- cap the number of live reads, keeping the most recent pairs ----
  let candidates = [...pairs.values()].sort((a, b) =>
    b.lastSeenBlock > a.lastSeenBlock ? 1 : b.lastSeenBlock < a.lastSeenBlock ? -1 : 0,
  );
  if (candidates.length > MAX_PAIRS) {
    const skipped = candidates.length - MAX_PAIRS;
    candidates = candidates.slice(0, MAX_PAIRS);
    notes.push(
      skipped === 1
        ? `This wallet has a lot of approvals — we checked the ${MAX_PAIRS} most recent and skipped 1 older one.`
        : `This wallet has a lot of approvals — we checked the ${MAX_PAIRS} most recent and skipped ${skipped} older ones.`,
    );
  }

  // ---- 3 + 4: live-verify each pair, then fetch token metadata ----
  const tokenCache = new Map<string, TokenInfo>();
  const records: ApprovalRecord[] = [];
  let unverifiedPairs = 0;
  for (const pair of candidates) {
    let allowanceRaw: bigint;
    try {
      const data = `${ALLOWANCE_SELECTOR}${padAddressWord(owner)}${padAddressWord(pair.spender)}`;
      const raw = await rpc('eth_call', [{ to: pair.token, data }, 'latest']);
      if (typeof raw !== 'string' || !raw.startsWith('0x')) {
        throw new Error('unreadable allowance');
      }
      allowanceRaw = hexToBigInt(raw);
    } catch {
      // We could not confirm this one is still live — leave it out rather
      // than show a number we did not verify, but count it so the user
      // learns the list is short because a check failed.
      unverifiedPairs += 1;
      continue;
    }
    if (allowanceRaw === 0n) continue; // revoked or fully spent — not live

    const token = await fetchTokenInfo(pair.token, rpc, tokenCache, notes);
    records.push({
      token,
      spender: toChecksum(pair.spender),
      allowanceRaw,
      unlimited: allowanceRaw >= UNLIMITED_THRESHOLD,
      lastSeenBlock: pair.lastSeenBlock,
    });
  }

  // ---- 5: unlimited approvals first (they matter most), then newest ----
  records.sort((a, b) => {
    if (a.unlimited !== b.unlimited) return a.unlimited ? -1 : 1;
    return b.lastSeenBlock > a.lastSeenBlock ? 1 : b.lastSeenBlock < a.lastSeenBlock ? -1 : 0;
  });

  if (unverifiedPairs > 0) {
    notes.push(
      `We found ${unverifiedPairs} more permission${unverifiedPairs === 1 ? '' : 's'} but could not read ` +
        `${unverifiedPairs === 1 ? 'its' : 'their'} current state, so ${unverifiedPairs === 1 ? 'it is' : 'they are'} not listed above.`,
    );
  }

  return {
    records,
    scannedBlocks,
    fromBlock: windowFrom,
    toBlock: latest,
    notes,
    // The UI must not say "nobody can spend your tokens" off the back of a
    // scan that had holes in it.
    complete: failedChunks === 0 && unverifiedPairs === 0,
  };
}
