import type { PostFlightCheck } from '../lib/types';

interface Props {
  check: PostFlightCheck;
  explorerHref: string;
  copied: boolean;
  onNewFlight: () => void;
  onCopyReport: () => void;
}

/**
 * After landing: line-by-line comparison of what the simulation promised
 * against what the mined receipt actually shows.
 */
export function PostFlight({
  check,
  explorerHref,
  copied,
  onNewFlight,
  onCopyReport,
}: Props) {
  return (
    <section className="panel" aria-label="Post-flight verification">
      <p className="panel-label">Post-flight · simulation vs on-chain reality</p>

      <div className={`pf-verdict ${check.matched ? 'ok' : 'bad'}`}>
        <span className="dot" aria-hidden="true" />
        {check.matched
          ? check.hasUnverified
            ? 'Everything we could check matched the simulation'
            : 'Reality matched the simulation'
          : 'Reality differed from the simulation — read below'}
      </div>

      <table className="pf-table">
        <thead>
          <tr>
            <th scope="col">Check</th>
            <th scope="col">Simulated</th>
            <th scope="col">Actual</th>
            <th scope="col" aria-label="Match" />
          </tr>
        </thead>
        <tbody>
          {check.lines.map((l, i) => (
            <tr key={i}>
              <td>
                {l.label}
                {l.note && <div className="pf-note">{l.note}</div>}
              </td>
              <td>{l.simulated}</td>
              <td>{l.actual}</td>
              <td
                className={
                  l.status === 'matched' ? 'ok' : l.status === 'mismatched' ? 'bad' : ''
                }
              >
                <span className="sr-only">
                  {l.status === 'matched'
                    ? 'verified as matching'
                    : l.status === 'mismatched'
                      ? 'does not match'
                      : 'could not be verified'}
                </span>
                {l.status === 'matched' ? '✓' : l.status === 'mismatched' ? '✗' : '–'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 14, fontSize: 13 }}>
        <a href={explorerHref} target="_blank" rel="noreferrer">
          View on MonadVision ↗
        </a>
      </p>

      <div className="sign-bar">
        <button className="btn-ghost" onClick={onNewFlight}>
          New flight
        </button>
        <button className="btn-ghost" onClick={onCopyReport}>
          {copied ? 'Copied ✓' : 'Copy report'}
        </button>
      </div>
    </section>
  );
}
