import type { FlightRecord } from '../lib/history';
import type { Lang } from '../lib/i18n';
import { t } from '../lib/i18n';

interface Props {
  flights: FlightRecord[];
  txHref: (hash: string) => string;
  lang: Lang;
  onClear: () => void;
}

function verdict(f: FlightRecord): { cls: string; key: string } {
  if (f.outcome === 'reverted') return { cls: 'bad', key: 'log.reverted' };
  if (f.matched === true) return { cls: 'ok', key: 'log.verified' };
  if (f.matched === false) return { cls: 'bad', key: 'log.differed' };
  return { cls: '', key: 'log.landed' };
}

/**
 * The Flight Log: every transaction prepared and signed through
 * PreFlight on this network, with its post-flight verification verdict.
 * Stored only in this browser.
 */
export function FlightLog({ flights, txHref, lang, onClear }: Props) {
  return (
    <section className="panel" aria-label={t(lang, 'log.label')}>
      <p className="panel-label">{t(lang, 'log.label')}</p>

      {flights.length === 0 && <p className="hint">{t(lang, 'log.empty')}</p>}

      {flights.map((f) => {
        const v = verdict(f);
        return (
          <div className="log-row" key={f.id}>
            <div className="log-main">
              <span className="log-summary">{f.summary}</span>
              <span className="log-meta">
                {new Date(f.at).toLocaleString()} ·{' '}
                <a href={txHref(f.hash)} target="_blank" rel="noreferrer">
                  {t(lang, 'log.explorer')}
                </a>
              </span>
            </div>
            <span className={`log-verdict ${v.cls}`}>{t(lang, v.key)}</span>
          </div>
        );
      })}

      {flights.length > 0 && (
        <div className="sign-bar">
          <button className="btn-ghost" onClick={onClear}>
            {t(lang, 'log.clear')}
          </button>
        </div>
      )}
    </section>
  );
}
