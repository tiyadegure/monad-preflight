import type { Address } from '../lib/types';
import type { ApprovalScan, ApprovalRecord } from '../lib/approvals';
import type { HealthReport } from '../lib/wallethealth';
import type { Lang } from '../lib/i18n';
import { t } from '../lib/i18n';
import { formatTokenAmount, shortAddress } from '../lib/format';

interface Props {
  account: Address | null;
  scan: ApprovalScan | null;
  scanning: boolean;
  health: HealthReport | null;
  lang: Lang;
  onScan: () => void;
  onRevoke: (record: ApprovalRecord) => void;
  addressHref: (addr: string) => string;
}

const STATUS_MARK: Record<string, string> = {
  pass: '✓',
  warn: '!',
  fail: '✗',
  unknown: '–',
};

/**
 * The Hangar: every live token approval your wallet has granted —
 * discovered from on-chain Approval events, verified with a live
 * allowance() read — with one-click revoke through the normal
 * flight-plan flow (simulate → explain → you sign).
 */
export function ApprovalHangar({
  account,
  scan,
  scanning,
  health,
  lang,
  onScan,
  onRevoke,
  addressHref,
}: Props) {
  return (
    <section className="panel" aria-label={t(lang, 'hangar.label')}>
      <p className="panel-label">{t(lang, 'hangar.label')}</p>

      {!account && <p className="hint">{t(lang, 'hangar.connectFirst')}</p>}

      {account && (
        <>
          <div className="sign-bar" style={{ marginTop: 0, marginBottom: 12 }}>
            <button className="btn-ghost" onClick={onScan} disabled={scanning}>
              {scanning
                ? t(lang, 'hangar.scanning')
                : scan
                  ? t(lang, 'hangar.rescan')
                  : t(lang, 'hangar.scan')}
            </button>
          </div>

          {health && (
            <div className={`health health-${health.worst}`}>
              <p className="health-headline">{health.headline}</p>
              {health.checks.map((c) => (
                <div className={`health-row s-${c.status}`} key={c.id}>
                  <span className="health-mark" aria-hidden="true">
                    {STATUS_MARK[c.status]}
                  </span>
                  <div>
                    <span className="health-label">{c.label}</span>
                    <p className="a-detail">{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {scanning && <p className="busy">{t(lang, 'hangar.busy')}</p>}

          {scan && !scanning && scan.records.length === 0 && (
            <p className="hint">
              {scan.complete ? t(lang, 'hangar.none') : t(lang, 'hangar.incomplete')}
            </p>
          )}

          {scan && scan.records.length > 0 && (
            <div>
              {scan.records.map((r) => (
                <div className="hangar-row" key={`${r.token.address}-${r.spender}`}>
                  <div className="hangar-info">
                    <span className={`hangar-amount${r.unlimited ? ' unlimited' : ''}`}>
                      {r.unlimited
                        ? t(lang, 'hangar.unlimited', { symbol: r.token.symbol })
                        : formatTokenAmount(r.allowanceRaw, r.token)}
                    </span>
                    <span className="hangar-spender">
                      {t(lang, 'hangar.spendableBy')}{' '}
                      <a href={addressHref(r.spender)} target="_blank" rel="noreferrer">
                        {shortAddress(r.spender)}
                      </a>
                    </span>
                  </div>
                  <button className="btn-ghost" onClick={() => onRevoke(r)}>
                    {t(lang, 'hangar.revoke')}
                  </button>
                </div>
              ))}
            </div>
          )}

          {scan &&
            scan.notes.map((n) => (
              <p className="hint" style={{ marginTop: 10 }} key={n}>
                {n}
              </p>
            ))}
        </>
      )}
    </section>
  );
}
