import type { Address } from '../lib/types';
import type { ApprovalScan, ApprovalRecord } from '../lib/approvals';
import type { HealthReport } from '../lib/wallethealth';
import { formatTokenAmount, shortAddress } from '../lib/format';

interface Props {
  account: Address | null;
  scan: ApprovalScan | null;
  scanning: boolean;
  health: HealthReport | null;
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
  onScan,
  onRevoke,
  addressHref,
}: Props) {
  return (
    <section className="panel" aria-label="Approval hangar">
      <p className="panel-label">Hangar · who can spend your tokens</p>

      {!account && (
        <p className="hint">Connect your wallet to scan its token approvals.</p>
      )}

      {account && (
        <>
          <div className="sign-bar" style={{ marginTop: 0, marginBottom: 12 }}>
            <button className="btn-ghost" onClick={onScan} disabled={scanning}>
              {scanning ? 'Scanning the chain…' : scan ? 'Scan again' : 'Scan my approvals'}
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

          {scanning && <p className="busy">reading Approval events block by block</p>}

          {scan && !scanning && scan.records.length === 0 && (
            <p className="hint">
              {scan.complete
                ? 'No live approvals found in the scanned range — nobody we saw can currently spend your tokens.'
                : 'We found no approvals, but parts of this scan failed — so this is not a clean bill of health. Scan again before trusting it.'}
            </p>
          )}

          {scan && scan.records.length > 0 && (
            <div>
              {scan.records.map((r) => (
                <div className="hangar-row" key={`${r.token.address}-${r.spender}`}>
                  <div className="hangar-info">
                    <span className={`hangar-amount${r.unlimited ? ' unlimited' : ''}`}>
                      {r.unlimited
                        ? `UNLIMITED ${r.token.symbol}`
                        : formatTokenAmount(r.allowanceRaw, r.token)}
                    </span>
                    <span className="hangar-spender">
                      spendable by{' '}
                      <a href={addressHref(r.spender)} target="_blank" rel="noreferrer">
                        {shortAddress(r.spender)}
                      </a>
                    </span>
                  </div>
                  <button className="btn-ghost" onClick={() => onRevoke(r)}>
                    Revoke
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
