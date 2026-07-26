import type { Hex, PostFlightCheck } from '../lib/types';
import { explorerTxUrl } from '../lib/chain';

interface Props {
  check: PostFlightCheck;
  txHash: Hex;
  onNewFlight: () => void;
}

/**
 * After landing: line-by-line comparison of what the simulation promised
 * vs what the mined receipt shows.
 */
export function PostFlight({ check, txHash, onNewFlight }: Props) {
  return (
    <section className="panel" aria-label="Post-flight verification">
      <p className="panel-label">Post-flight · simulation vs on-chain reality</p>

      <div className={`pf-verdict ${check.matched ? 'ok' : 'bad'}`}>
        <span className="dot" aria-hidden="true" />
        {check.matched
          ? 'Reality matched the simulation'
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
              <td>{l.label}</td>
              <td>{l.simulated}</td>
              <td>{l.actual}</td>
              <td className={l.matched ? 'ok' : 'bad'}>{l.matched ? '✓' : '✗'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 14, fontSize: 13 }}>
        <a href={explorerTxUrl(txHash)} target="_blank" rel="noreferrer">
          View on MonadVision ↗
        </a>
      </p>

      <div className="sign-bar">
        <button className="btn-ghost" onClick={onNewFlight}>
          New flight
        </button>
      </div>
    </section>
  );
}
