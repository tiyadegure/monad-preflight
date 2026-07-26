import type { FlightRecord } from '../lib/history';

interface Props {
  flights: FlightRecord[];
  txHref: (hash: string) => string;
  onClear: () => void;
}

function verdict(f: FlightRecord): { cls: string; text: string } {
  if (f.outcome === 'reverted') return { cls: 'bad', text: 'reverted' };
  if (f.matched === true) return { cls: 'ok', text: 'verified ✓' };
  if (f.matched === false) return { cls: 'bad', text: 'differed ✗' };
  return { cls: '', text: 'landed' };
}

/**
 * The Flight Log: every transaction prepared and signed through
 * PreFlight on this network, with its post-flight verification verdict.
 * Stored only in this browser.
 */
export function FlightLog({ flights, txHref, onClear }: Props) {
  return (
    <section className="panel" aria-label="Flight log">
      <p className="panel-label">Flight log · this browser, this network</p>

      {flights.length === 0 && (
        <p className="hint">No flights yet — sign your first transaction and it lands here.</p>
      )}

      {flights.map((f) => {
        const v = verdict(f);
        return (
          <div className="log-row" key={f.id}>
            <div className="log-main">
              <span className="log-summary">{f.summary}</span>
              <span className="log-meta">
                {new Date(f.at).toLocaleString()} ·{' '}
                <a href={txHref(f.hash)} target="_blank" rel="noreferrer">
                  explorer ↗
                </a>
              </span>
            </div>
            <span className={`log-verdict ${v.cls}`}>{v.text}</span>
          </div>
        );
      })}

      {flights.length > 0 && (
        <div className="sign-bar">
          <button className="btn-ghost" onClick={onClear}>
            Clear log
          </button>
        </div>
      )}
    </section>
  );
}
