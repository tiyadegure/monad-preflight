import { encodeFunctionData, getAddress, parseAbi } from 'viem';
import type { Address, ParsedIntent, PreparedTx, TokenInfo } from './types';
import { NATIVE_MON } from './types';
import {
  MAX_UINT256,
  formatTokenAmount,
  isAddressFormat,
  isHexData,
  parseAmount,
  shortAddress,
} from './format';
import type { ChainReader, TokenRegistry } from './tokens';
import { findToken } from './tokens';

/** 0.02 MON kept back for gas when the user asks to send "all". */
export const GAS_HEADROOM_WEI = 20000000000000000n;

/** Every build failure is a BuildError with a plain-language, actionable message. */
export class BuildError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BuildError';
  }
}

interface BuildDeps {
  registry: TokenRegistry;
  reader: ChainReader;
}

const ERC20_WRITE_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Checksum-validate an address or fail with a plain-language message. */
function checksum(value: string, what: string): Address {
  try {
    return getAddress(value);
  } catch {
    throw new BuildError(
      `"${value}" is not a valid ${what} — an address is 42 characters ` +
        'starting with 0x. Double-check for typos.',
    );
  }
}

function requireCounterparty(
  intent: ParsedIntent,
  role: 'recipient' | 'spender',
): Address {
  if (!intent.counterparty) {
    throw new BuildError(
      role === 'recipient'
        ? 'I need a recipient — add the address (0x…) you want to send to.'
        : 'I need to know which app or address gets the spending permission — add its address (0x…).',
    );
  }
  return checksum(
    intent.counterparty,
    role === 'recipient' ? 'recipient address' : 'spender address',
  );
}

/** undefined → native MON; 0x-address → registry then chain; symbol → registry. */
async function resolveToken(
  tokenText: string | undefined,
  deps: BuildDeps,
): Promise<TokenInfo> {
  if (tokenText === undefined) return NATIVE_MON;
  const text = tokenText.trim();

  if (isAddressFormat(text)) {
    const known = findToken(deps.registry, text);
    if (known) return known;
    const address = checksum(text, 'token address');
    try {
      return await deps.reader.fetchTokenInfo(address);
    } catch (err) {
      // The reader already speaks plain language; keep its message.
      throw new BuildError(
        err instanceof Error
          ? err.message
          : `I could not read token details at ${shortAddress(address)}.`,
      );
    }
  }

  const known = findToken(deps.registry, text);
  if (known) return known;
  throw new BuildError(
    `I do not know the token "${text}" yet — paste its contract address once and I will remember it.`,
  );
}

function parseUserAmount(value: string, token: TokenInfo): bigint {
  try {
    return parseAmount(value, token.decimals);
  } catch (err) {
    throw new BuildError(
      err instanceof Error ? err.message : `"${value}" is not a valid amount.`,
    );
  }
}

/* ------------------------------------------------------------------ */
/* buildTx — ParsedIntent -> PreparedTx                                 */
/* ------------------------------------------------------------------ */

export async function buildTx(
  intent: ParsedIntent,
  from: Address,
  deps: BuildDeps,
): Promise<PreparedTx> {
  const sender = checksum(from, 'sender address (your wallet)');
  switch (intent.action) {
    case 'send':
      return buildSend(intent, sender, deps);
    case 'approve':
      return buildApprove(intent, sender, deps);
    case 'revoke':
      return buildRevoke(intent, sender, deps);
    case 'raw':
      return buildRaw(intent, sender);
  }
}

/* ------------------------------------------------------------------ */
/* send                                                                */
/* ------------------------------------------------------------------ */

async function buildSend(
  intent: ParsedIntent,
  from: Address,
  deps: BuildDeps,
): Promise<PreparedTx> {
  const token = await resolveToken(intent.token, deps);
  const recipient = requireCounterparty(intent, 'recipient');
  const amount = intent.amount;

  // Native MON: plain value transfer, no calldata.
  if (token.address === null) {
    let amountRaw: bigint;
    let gasNote = '';
    if (amount?.all) {
      const balance = await deps.reader.getNativeBalance(from);
      amountRaw = balance - GAS_HEADROOM_WEI;
      if (amountRaw <= 0n) {
        throw new BuildError(
          'Your MON balance is too small to send anything after keeping ' +
            `${formatTokenAmount(GAS_HEADROOM_WEI, NATIVE_MON)} back for gas money.`,
        );
      }
      gasNote = ` (keeping ${formatTokenAmount(GAS_HEADROOM_WEI, NATIVE_MON)} back for gas)`;
    } else if (amount?.value !== undefined) {
      amountRaw = parseUserAmount(amount.value, token);
    } else {
      throw new BuildError(
        'How much MON do you want to send? Add an amount, like "send 0.5 MON".',
      );
    }
    return {
      from,
      to: recipient,
      data: '0x',
      value: amountRaw,
      kind: 'native-transfer',
      summary: `Send ${formatTokenAmount(amountRaw, token)} to ${shortAddress(recipient)}${gasNote}`,
      token,
      amountRaw,
      counterparty: recipient,
    };
  }

  // ERC-20: call transfer() on the token contract, value stays 0.
  let amountRaw: bigint;
  if (amount?.all) {
    amountRaw = await deps.reader.erc20BalanceOf(token.address, from);
    if (amountRaw === 0n) {
      throw new BuildError(`You do not have any ${token.symbol} to send.`);
    }
  } else if (amount?.value !== undefined) {
    amountRaw = parseUserAmount(amount.value, token);
  } else {
    throw new BuildError(
      `How much ${token.symbol} do you want to send? Add an amount, like "send 10 ${token.symbol}".`,
    );
  }
  return {
    from,
    to: token.address,
    data: encodeFunctionData({
      abi: ERC20_WRITE_ABI,
      functionName: 'transfer',
      args: [recipient, amountRaw],
    }),
    value: 0n,
    kind: 'erc20-transfer',
    summary: `Send ${formatTokenAmount(amountRaw, token)} to ${shortAddress(recipient)}`,
    token,
    amountRaw,
    counterparty: recipient,
  };
}

/* ------------------------------------------------------------------ */
/* approve                                                             */
/* ------------------------------------------------------------------ */

async function buildApprove(
  intent: ParsedIntent,
  from: Address,
  deps: BuildDeps,
): Promise<PreparedTx> {
  const token = await resolveToken(intent.token, deps);
  if (token.address === null) {
    throw new BuildError(
      'MON itself cannot be approved — approvals are a token feature. ' +
        'MON is the native coin: it only moves when you send it. ' +
        'Name a token instead, like "approve 100 tUSD for 0x…".',
    );
  }
  const spender = requireCounterparty(intent, 'spender');
  const amount = intent.amount;

  if (amount?.unlimited) {
    return {
      from,
      to: token.address,
      data: encodeFunctionData({
        abi: ERC20_WRITE_ABI,
        functionName: 'approve',
        args: [spender, MAX_UINT256],
      }),
      value: 0n,
      kind: 'erc20-approve',
      summary: `Allow ${shortAddress(spender)} to spend ALL of your ${token.symbol} (unlimited)`,
      token,
      amountRaw: MAX_UINT256,
      counterparty: spender,
    };
  }

  if (amount?.value === undefined) {
    throw new BuildError(
      `How much ${token.symbol} should ${shortAddress(spender)} be allowed to spend? ` +
        'Give an amount, or say "unlimited".',
    );
  }

  const amountRaw = parseUserAmount(amount.value, token);

  // Approving 0 is really a revoke — build it as one so the UI says so.
  if (amountRaw === 0n) {
    return {
      from,
      to: token.address,
      data: encodeFunctionData({
        abi: ERC20_WRITE_ABI,
        functionName: 'approve',
        args: [spender, 0n],
      }),
      value: 0n,
      kind: 'erc20-revoke',
      summary:
        `Revoke ${shortAddress(spender)}'s access to your ${token.symbol} ` +
        '(approving 0 removes their access)',
      token,
      amountRaw: 0n,
      counterparty: spender,
    };
  }

  return {
    from,
    to: token.address,
    data: encodeFunctionData({
      abi: ERC20_WRITE_ABI,
      functionName: 'approve',
      args: [spender, amountRaw],
    }),
    value: 0n,
    kind: 'erc20-approve',
    summary: `Allow ${shortAddress(spender)} to spend up to ${formatTokenAmount(amountRaw, token)}`,
    token,
    amountRaw,
    counterparty: spender,
  };
}

/* ------------------------------------------------------------------ */
/* revoke                                                              */
/* ------------------------------------------------------------------ */

async function buildRevoke(
  intent: ParsedIntent,
  from: Address,
  deps: BuildDeps,
): Promise<PreparedTx> {
  const token = await resolveToken(intent.token, deps);
  if (token.address === null) {
    throw new BuildError(
      'Which token do you want to revoke access to? MON itself cannot be ' +
        'approved, so there is no MON access to revoke — name the token, ' +
        'like "revoke tUSD access for 0x…".',
    );
  }
  const spender = requireCounterparty(intent, 'spender');
  return {
    from,
    to: token.address,
    data: encodeFunctionData({
      abi: ERC20_WRITE_ABI,
      functionName: 'approve',
      args: [spender, 0n],
    }),
    value: 0n,
    kind: 'erc20-revoke',
    summary: `Revoke ${shortAddress(spender)}'s access to your ${token.symbol}`,
    token,
    amountRaw: 0n,
    counterparty: spender,
  };
}

/* ------------------------------------------------------------------ */
/* raw — the explain-before-you-sign flow for txs copied from other    */
/* apps. We keep the fields as pasted, only validating shape.          */
/* ------------------------------------------------------------------ */

function buildRaw(intent: ParsedIntent, from: Address): PreparedTx {
  const raw = intent.raw;
  if (!raw) {
    throw new BuildError(
      'Paste the transaction details (at least the "to" address) and I will ' +
        'explain it before you sign.',
    );
  }
  const to = checksum(raw.to, '"to" address');

  const data = raw.data === undefined || raw.data === '' ? '0x' : raw.data;
  if (!isHexData(data)) {
    throw new BuildError(
      'The transaction data is not valid — it should be "0x" followed by ' +
        'pairs of hex characters (0-9, a-f). Copy it again from the source app.',
    );
  }

  return {
    from,
    to,
    data,
    value: parseRawValue(raw.value),
    kind: 'raw',
    summary: `Custom transaction to ${shortAddress(to)}`,
  };
}

/** "0x…" → hex wei; decimal string → MON units; missing → 0. */
function parseRawValue(value: string | undefined): bigint {
  if (value === undefined || value.trim() === '') return 0n;
  const text = value.trim();
  if (text.startsWith('0x') || text.startsWith('0X')) {
    if (!/^0[xX][0-9a-fA-F]+$/.test(text)) {
      throw new BuildError(
        'The transaction value looks like hex but is not valid — it should ' +
          'be "0x" followed by hex characters (0-9, a-f).',
      );
    }
    return BigInt(text);
  }
  try {
    return parseAmount(text, 18);
  } catch (err) {
    throw new BuildError(
      err instanceof Error ? err.message : `"${text}" is not a valid amount of MON.`,
    );
  }
}
