/**
 * Observer mode — inspect any address without connecting a wallet.
 *
 * Paste an address (or an explorer link) and get a read-only profile:
 * balance, activity, and whether the address is a wallet or a program.
 * This is the demo / audit / "check a friend's wallet" path, so every
 * message here is plain language and nothing ever writes to the chain.
 *
 * The module talks to the chain only through the injected ObserverReader,
 * which keeps it fully testable with fakes and free of client coupling.
 */

import { getAddress } from 'viem';
import type { Address } from './types';
import { t } from './i18n';
import type { Lang } from './i18n';

/* ------------------------------------------------------------------ */
/* Contracts                                                           */
/* ------------------------------------------------------------------ */

export interface ObserverProfile {
  address: Address;
  nativeBalanceWei: bigint;
  txCount: number;
  isContract: boolean;
  /** One plain sentence characterising the address, shown as-is in the UI. */
  firstSeenNote: string;
}

/** Minimal read-only chain access, injected so tests can fake it. */
export interface ObserverReader {
  getBalance(a: Address): Promise<bigint>;
  getTransactionCount(a: Address): Promise<number>;
  getCode(a: Address): Promise<string | null>;
}

/* ------------------------------------------------------------------ */
/* Input normalisation                                                 */
/* ------------------------------------------------------------------ */

const BARE_ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const EXPLORER_ADDRESS_RE = /\/address\/(0x[0-9a-fA-F]{40})/;

/**
 * Turn whatever the user pasted into a checksummed address.
 *
 * Accepts a bare 0x address (all-lowercase is fine — it gets
 * checksummed) or an explorer URL containing "/address/0x…".
 * Returns a plain-language error for anything else. Never throws.
 */
export function normalizeObserverInput(
  text: string,
  lang: Lang = 'en',
): { address: Address } | { error: string } {
  const trimmed = text.trim();

  if (trimmed === '') {
    return {
      error: t(lang, 'obs.pasteEmpty'),
    };
  }

  const fromUrl = EXPLORER_ADDRESS_RE.exec(trimmed)?.[1];
  const candidate =
    fromUrl ?? (BARE_ADDRESS_RE.test(trimmed) ? trimmed : undefined);

  if (candidate === undefined) {
    return {
      error: t(lang, 'obs.notAddress'),
    };
  }

  try {
    return { address: getAddress(candidate) };
  } catch {
    return {
      error: t(lang, 'obs.badChecksum'),
    };
  }
}

/* ------------------------------------------------------------------ */
/* Profiling                                                           */
/* ------------------------------------------------------------------ */

/**
 * Read balance, transaction count, and code for an address, in parallel.
 *
 * A failed balance or transaction-count read is fatal and propagates to
 * the caller (which shows the RPC error). A failed code read is treated
 * as "unknown" — some gateways don't serve it — with isContract false
 * and a caveat in firstSeenNote.
 */
export async function profileAddress(
  reader: ObserverReader,
  address: Address,
  lang: Lang = 'en',
): Promise<ObserverProfile> {
  // Swallow getCode rejections up front so Promise.all never sees them.
  const codeRead = reader.getCode(address).then(
    (code) => ({ known: true, code }) as const,
    () => ({ known: false, code: null }) as const,
  );

  const [nativeBalanceWei, txCount, codeResult] = await Promise.all([
    reader.getBalance(address),
    reader.getTransactionCount(address),
    codeRead,
  ]);

  const isContract =
    codeResult.known &&
    codeResult.code !== null &&
    codeResult.code !== '' &&
    codeResult.code !== '0x';

  return {
    address,
    nativeBalanceWei,
    txCount,
    isContract,
    firstSeenNote: buildFirstSeenNote(
      {
        isContract,
        codeKnown: codeResult.known,
        txCount,
        nativeBalanceWei,
      },
      lang,
    ),
  };
}

function buildFirstSeenNote(
  facts: {
    isContract: boolean;
    codeKnown: boolean;
    txCount: number;
    nativeBalanceWei: bigint;
  },
  lang: Lang,
): string {
  const { isContract, codeKnown, txCount, nativeBalanceWei } = facts;

  let note: string;
  if (isContract) {
    note = t(lang, 'obs.isContract');
  } else if (txCount === 0 && nativeBalanceWei === 0n) {
    note = t(lang, 'obs.neverUsed');
  } else if (txCount === 0) {
    note = t(lang, 'obs.holdsNotSent');
  } else {
    note = t(lang, txCount === 1 ? 'obs.sentOne' : 'obs.sentMany', { count: txCount });
  }

  if (!codeKnown) {
    note += t(lang, 'obs.codeUnknown');
  }

  return note;
}

/* ------------------------------------------------------------------ */
/* Plain-language description                                          */
/* ------------------------------------------------------------------ */

/**
 * Turn a profile into 3–4 plain-language bullets for the panel.
 * The MON formatter is injected so this module stays presentation-free.
 */
export function describeProfile(
  p: ObserverProfile,
  formatMon: (wei: bigint) => string,
  lang: Lang = 'en',
): string[] {
  const balanceBullet = t(lang, 'obs.holds', { amount: formatMon(p.nativeBalanceWei) });

  const txBullet =
    p.txCount === 0
      ? t(lang, 'obs.txNone')
      : p.txCount === 1
        ? t(lang, 'obs.txOne')
        : t(lang, 'obs.txMany', { count: p.txCount });

  const kindBullet = p.isContract
    ? t(lang, 'obs.isProgram')
    : t(lang, 'obs.isWallet');

  return [balanceBullet, txBullet, kindBullet, p.firstSeenNote];
}
