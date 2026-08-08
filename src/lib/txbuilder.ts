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
import { t } from './i18n';
import type { Lang } from './i18n';

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
  /** Canonical wrapped-MON (WMON) contract on the active network, if it has one. */
  wmon?: Address;
}

const ERC20_WRITE_ABI = parseAbi([
  'function transfer(address to, uint256 amount) returns (bool)',
  'function approve(address spender, uint256 amount) returns (bool)',
]);

/** Standard WETH9-style interface: deposit() wraps, withdraw() unwraps. */
const WMON_ABI = parseAbi([
  'function deposit() payable',
  'function withdraw(uint256 amount)',
]);

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

/** Checksum-validate an address or fail with a plain-language message. */
function checksum(value: string, what: string, lang: Lang): Address {
  try {
    return getAddress(value);
  } catch {
    throw new BuildError(
      t(lang, 'tb.invalidAddress', { value, what }),
    );
  }
}

function requireCounterparty(
  intent: ParsedIntent,
  role: 'recipient' | 'spender',
  lang: Lang,
): Address {
  if (!intent.counterparty) {
    throw new BuildError(
      role === 'recipient'
        ? t(lang, 'tb.needRecipient')
        : t(lang, 'tb.needSpender'),
    );
  }
  return checksum(
    intent.counterparty,
    role === 'recipient' ? t(lang, 'tb.what.recipient') : t(lang, 'tb.what.spender'),
    lang,
  );
}

/** undefined → native MON; 0x-address → registry then chain; symbol → registry. */
async function resolveToken(
  tokenText: string | undefined,
  deps: BuildDeps,
  lang: Lang,
): Promise<TokenInfo> {
  if (tokenText === undefined) return NATIVE_MON;
  const text = tokenText.trim();

  if (isAddressFormat(text)) {
    const known = findToken(deps.registry, text);
    if (known) return known;
    const address = checksum(text, t(lang, 'tb.what.token'), lang);
    try {
      return await deps.reader.fetchTokenInfo(address, lang);
    } catch (err) {
      // The reader already speaks plain language; keep its message.
      throw new BuildError(
        err instanceof Error
          ? err.message
          : t(lang, 'tb.tokenReadFailed', { address: shortAddress(address) }),
      );
    }
  }

  const known = findToken(deps.registry, text);
  if (known) return known;
  throw new BuildError(
    t(lang, 'tb.unknownToken', { token: text }),
  );
}

function parseUserAmount(value: string, token: TokenInfo, lang: Lang): bigint {
  try {
    return parseAmount(value, token.decimals);
  } catch (err) {
    throw new BuildError(
      err instanceof Error ? err.message : t(lang, 'tb.invalidAmount', { value }),
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
  lang: Lang = 'en',
): Promise<PreparedTx> {
  const sender = checksum(from, t(lang, 'tb.what.sender'), lang);
  switch (intent.action) {
    case 'send':
      return buildSend(intent, sender, deps, lang);
    case 'approve':
      return buildApprove(intent, sender, deps, lang);
    case 'revoke':
      return buildRevoke(intent, sender, deps, lang);
    case 'wrap':
      return buildWrap(intent, sender, deps, lang);
    case 'unwrap':
      return buildUnwrap(intent, sender, deps, lang);
    case 'raw':
      return buildRaw(intent, sender, lang);
  }
}

/* ------------------------------------------------------------------ */
/* send                                                                */
/* ------------------------------------------------------------------ */

async function buildSend(
  intent: ParsedIntent,
  from: Address,
  deps: BuildDeps,
  lang: Lang,
): Promise<PreparedTx> {
  const token = await resolveToken(intent.token, deps, lang);
  const recipient = requireCounterparty(intent, 'recipient', lang);
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
          t(lang, 'tb.balanceTooSmall', {
            amount: formatTokenAmount(GAS_HEADROOM_WEI, NATIVE_MON),
          }),
        );
      }
      gasNote = t(lang, 'tb.gasNote', {
        amount: formatTokenAmount(GAS_HEADROOM_WEI, NATIVE_MON),
      });
    } else if (amount?.value !== undefined) {
      amountRaw = parseUserAmount(amount.value, token, lang);
    } else {
      throw new BuildError(
        t(lang, 'tb.howMuchMon'),
      );
    }
    return {
      from,
      to: recipient,
      data: '0x',
      value: amountRaw,
      kind: 'native-transfer',
      summary: `${t(lang, 'tb.summarySend', {
        amount: formatTokenAmount(amountRaw, token),
        address: shortAddress(recipient),
      })}${gasNote}`,
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
      throw new BuildError(t(lang, 'tb.noTokenBalance', { symbol: token.symbol }));
    }
  } else if (amount?.value !== undefined) {
    amountRaw = parseUserAmount(amount.value, token, lang);
  } else {
    throw new BuildError(
      t(lang, 'tb.howMuchToken', { symbol: token.symbol }),
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
    summary: t(lang, 'tb.summarySend', {
      amount: formatTokenAmount(amountRaw, token),
      address: shortAddress(recipient),
    }),
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
  lang: Lang,
): Promise<PreparedTx> {
  const token = await resolveToken(intent.token, deps, lang);
  if (token.address === null) {
    throw new BuildError(
      t(lang, 'tb.approveNativeMon'),
    );
  }
  const spender = requireCounterparty(intent, 'spender', lang);
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
      summary: t(lang, 'tb.summaryApproveAll', {
        spender: shortAddress(spender),
        symbol: token.symbol,
      }),
      token,
      amountRaw: MAX_UINT256,
      counterparty: spender,
    };
  }

  if (amount?.value === undefined) {
    throw new BuildError(
      t(lang, 'tb.approveHowMuch', {
        symbol: token.symbol,
        spender: shortAddress(spender),
      }),
    );
  }

  const amountRaw = parseUserAmount(amount.value, token, lang);

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
      summary: t(lang, 'tb.summaryRevokeZero', {
        spender: shortAddress(spender),
        symbol: token.symbol,
      }),
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
    summary: t(lang, 'tb.summaryApprove', {
      spender: shortAddress(spender),
      amount: formatTokenAmount(amountRaw, token),
    }),
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
  lang: Lang,
): Promise<PreparedTx> {
  const token = await resolveToken(intent.token, deps, lang);
  if (token.address === null) {
    throw new BuildError(
      t(lang, 'tb.revokeNativeMon'),
    );
  }
  const spender = requireCounterparty(intent, 'spender', lang);
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
    summary: t(lang, 'tb.summaryRevoke', {
      spender: shortAddress(spender),
      symbol: token.symbol,
    }),
    token,
    amountRaw: 0n,
    counterparty: spender,
  };
}

/* ------------------------------------------------------------------ */
/* wrap / unwrap — converting between native MON and WMON              */
/* ------------------------------------------------------------------ */

/** The WMON contract address, or a plain-language failure where none exists. */
function requireWmon(deps: BuildDeps, lang: Lang): Address {
  if (deps.wmon === undefined) {
    throw new BuildError(t(lang, 'tb.wrapUnavailable'));
  }
  return deps.wmon;
}

function wmonToken(address: Address): TokenInfo {
  return { address, symbol: 'WMON', decimals: 18 };
}

async function buildWrap(
  intent: ParsedIntent,
  from: Address,
  deps: BuildDeps,
  lang: Lang,
): Promise<PreparedTx> {
  const wmon = requireWmon(deps, lang);
  const amount = intent.amount;

  if (amount?.all) {
    throw new BuildError(
      t(lang, 'tb.wrapAllFails'),
    );
  }
  if (amount?.value === undefined) {
    throw new BuildError(
      t(lang, 'tb.wrapHowMuch'),
    );
  }
  const amountRaw = parseUserAmount(amount.value, NATIVE_MON, lang);

  return {
    from,
    to: wmon,
    // deposit() takes no arguments — the calldata is just its selector.
    data: encodeFunctionData({ abi: WMON_ABI, functionName: 'deposit' }),
    value: amountRaw,
    kind: 'wrap',
    summary: t(lang, 'tb.summaryWrap', {
      amount: formatTokenAmount(amountRaw, NATIVE_MON),
    }),
    token: wmonToken(wmon),
    amountRaw,
    counterparty: wmon,
  };
}

async function buildUnwrap(
  intent: ParsedIntent,
  from: Address,
  deps: BuildDeps,
  lang: Lang,
): Promise<PreparedTx> {
  const wmon = requireWmon(deps, lang);
  const token = wmonToken(wmon);
  const amount = intent.amount;

  let amountRaw: bigint;
  if (amount?.all) {
    amountRaw = await deps.reader.erc20BalanceOf(wmon, from);
    if (amountRaw === 0n) {
      throw new BuildError(t(lang, 'tb.unwrapEmpty'));
    }
  } else if (amount?.value !== undefined) {
    amountRaw = parseUserAmount(amount.value, token, lang);
  } else {
    throw new BuildError(
      t(lang, 'tb.unwrapHowMuch'),
    );
  }

  return {
    from,
    to: wmon,
    data: encodeFunctionData({
      abi: WMON_ABI,
      functionName: 'withdraw',
      args: [amountRaw],
    }),
    value: 0n,
    kind: 'unwrap',
    summary: t(lang, 'tb.summaryUnwrap', {
      amount: formatTokenAmount(amountRaw, token),
    }),
    token,
    amountRaw,
    counterparty: wmon,
  };
}

/* ------------------------------------------------------------------ */
/* raw — the explain-before-you-sign flow for txs copied from other    */
/* apps. We keep the fields as pasted, only validating shape.          */
/* ------------------------------------------------------------------ */

function buildRaw(intent: ParsedIntent, from: Address, lang: Lang): PreparedTx {
  const raw = intent.raw;
  if (!raw) {
    throw new BuildError(
      t(lang, 'tb.rawMissing'),
    );
  }
  const to = checksum(raw.to, t(lang, 'tb.what.to'), lang);

  const data = raw.data === undefined || raw.data === '' ? '0x' : raw.data;
  if (!isHexData(data)) {
    throw new BuildError(
      t(lang, 'tb.rawBadData'),
    );
  }

  return {
    from,
    to,
    data,
    value: parseRawValue(raw.value, lang),
    kind: 'raw',
    summary: t(lang, 'tb.summaryRaw', { address: shortAddress(to) }),
  };
}

/** "0x…" → hex wei; decimal string → MON units; missing → 0. */
function parseRawValue(value: string | undefined, lang: Lang): bigint {
  if (value === undefined || value.trim() === '') return 0n;
  const text = value.trim();
  if (text.startsWith('0x') || text.startsWith('0X')) {
    if (!/^0[xX][0-9a-fA-F]+$/.test(text)) {
      throw new BuildError(
        t(lang, 'tb.rawBadValue'),
      );
    }
    return BigInt(text);
  }
  try {
    return parseAmount(text, 18);
  } catch (err) {
    throw new BuildError(
      err instanceof Error ? err.message : t(lang, 'tb.rawBadAmount', { value: text }),
    );
  }
}
