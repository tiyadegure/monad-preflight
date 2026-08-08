import { useState } from 'react';
import type { Address, TokenInfo } from '../lib/types';
import { NATIVE_MON } from '../lib/types';
import type { ObserverProfile, ObserverReader } from '../lib/observer';
import { describeProfile, normalizeObserverInput, profileAddress } from '../lib/observer';
import type { ApprovalScan } from '../lib/approvals';
import type { ExposureReport } from '../lib/portfolio';
import { formatTokenAmount, shortAddress } from '../lib/format';
import { t } from '../lib/i18n';
import type { Lang } from '../lib/i18n';

interface Props {
  reader: ObserverReader;
  scanApprovalsFor: (address: Address) => Promise<ApprovalScan>;
  fetchBalancesFor: (address: Address) => Promise<{ token: TokenInfo; raw: bigint }[]>;
  computeExposure: (
    balances: { token: TokenInfo; raw: bigint }[],
    scan: ApprovalScan,
    lang: Lang,
  ) => ExposureReport;
  addressHref: (addr: string) => string;
  lang: Lang;
}

/**
 * Observer mode: inspect any address without connecting a wallet.
 * Read-only by construction — this panel can never build a transaction.
 * Useful for checking a friend's wallet for drainer approvals, for
 * auditing, and for demoing PreFlight without exposing your own funds.
 */
export function ObserverPanel({
  reader,
  scanApprovalsFor,
  fetchBalancesFor,
  computeExposure,
  addressHref,
  lang,
}: Props) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ObserverProfile | null>(null);
  const [exposure, setExposure] = useState<ExposureReport | null>(null);

  const inspect = async () => {
    const normalized = normalizeObserverInput(input, lang);
    if ('error' in normalized) {
      setError(normalized.error);
      setProfile(null);
      setExposure(null);
      return;
    }
    setBusy(true);
    setError(null);
    setProfile(null);
    setExposure(null);
    try {
      const p = await profileAddress(reader, normalized.address, lang);
      setProfile(p);
      const [balances, scan] = await Promise.all([
        fetchBalancesFor(normalized.address),
        scanApprovalsFor(normalized.address),
      ]);
      setExposure(computeExposure(balances, scan, lang));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-label={t(lang, 'observer.ariaLabel')}>
      <p className="panel-label">{t(lang, 'observer.label')}</p>
      <p className="hint" style={{ marginBottom: 10 }}>
        {t(lang, 'observer.hint')}
      </p>

      <div className="console-form">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) void inspect();
          }}
          placeholder={t(lang, 'observer.placeholder')}
          aria-label={t(lang, 'observer.inputAria')}
          spellCheck={false}
        />
        <button className="btn-primary" onClick={inspect} disabled={busy || !input.trim()}>
          {busy ? t(lang, 'observer.reading') : t(lang, 'observer.inspect')}
        </button>
      </div>

      {error && (
        <div className="error-note" role="alert">
          {error}
        </div>
      )}

      {busy && (
        <p className="busy" style={{ marginTop: 14 }}>
          {t(lang, 'observer.busy')}
        </p>
      )}

      {profile && (
        <div style={{ marginTop: 16 }}>
          <h3 className="plan-summary">
            <a href={addressHref(profile.address)} target="_blank" rel="noreferrer">
              {shortAddress(profile.address)} ↗
            </a>
          </h3>
          {describeProfile(profile, (wei) => formatTokenAmount(wei, NATIVE_MON), lang).map(
            (line, i) => (
              <div className="check-row" key={i} style={{ animationDelay: `${i * 60}ms` }}>
                <span className="k">{line}</span>
              </div>
            ),
          )}
        </div>
      )}

      {exposure && (
        <div style={{ marginTop: 16 }}>
          <p className="panel-label">{t(lang, 'observer.exposureLabel')}</p>
          <p className="plan-outcome">{exposure.headline}</p>

          {exposure.lines.map((l) => (
            <div className="hangar-row" key={l.token.address ?? l.token.symbol}>
              <div className="hangar-info">
                <span className={`hangar-amount${l.fullyExposed ? ' unlimited' : ''}`}>
                  {t(lang, 'observer.of', {
                    exposed: formatTokenAmount(l.exposedRaw, l.token),
                    balance: formatTokenAmount(l.balanceRaw, l.token),
                  })}
                </span>
                <span className="hangar-spender">
                  {l.unlimitedSpenders.length > 0 &&
                    `${t(lang, 'observer.unlimitedN', { n: String(l.unlimitedSpenders.length) })} · `}
                  {l.limitedSpenders.length > 0 &&
                    t(lang, 'observer.limitedN', { n: String(l.limitedSpenders.length) })}
                  {l.unlimitedSpenders.length === 0 &&
                    l.limitedSpenders.length === 0 &&
                    t(lang, 'observer.noPermissions')}
                </span>
              </div>
            </div>
          ))}

          {exposure.advice.map((a) => (
            <p className="hint" style={{ marginTop: 8 }} key={a}>
              {a}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
