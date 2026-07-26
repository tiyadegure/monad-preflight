import { useState } from 'react';
import type { Address, TokenInfo } from '../lib/types';
import { NATIVE_MON } from '../lib/types';
import type { ObserverProfile, ObserverReader } from '../lib/observer';
import { describeProfile, normalizeObserverInput, profileAddress } from '../lib/observer';
import type { ApprovalScan } from '../lib/approvals';
import type { ExposureReport } from '../lib/portfolio';
import { formatTokenAmount, shortAddress } from '../lib/format';

interface Props {
  reader: ObserverReader;
  scanApprovalsFor: (address: Address) => Promise<ApprovalScan>;
  fetchBalancesFor: (address: Address) => Promise<{ token: TokenInfo; raw: bigint }[]>;
  computeExposure: (
    balances: { token: TokenInfo; raw: bigint }[],
    scan: ApprovalScan,
  ) => ExposureReport;
  addressHref: (addr: string) => string;
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
}: Props) {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<ObserverProfile | null>(null);
  const [exposure, setExposure] = useState<ExposureReport | null>(null);

  const inspect = async () => {
    const normalized = normalizeObserverInput(input);
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
      const p = await profileAddress(reader, normalized.address);
      setProfile(p);
      const [balances, scan] = await Promise.all([
        fetchBalancesFor(normalized.address),
        scanApprovalsFor(normalized.address),
      ]);
      setExposure(computeExposure(balances, scan));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel" aria-label="Observer mode">
      <p className="panel-label">Observer · inspect any address, read only</p>
      <p className="hint" style={{ marginBottom: 10 }}>
        No wallet needed. Check what an address holds and who can spend its tokens —
        yours, a friend's, or one you are about to send money to.
      </p>

      <div className="console-form">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !busy) void inspect();
          }}
          placeholder="0x… or a MonadVision address link"
          aria-label="Address to inspect"
          spellCheck={false}
        />
        <button className="btn-primary" onClick={inspect} disabled={busy || !input.trim()}>
          {busy ? 'Reading…' : 'Inspect'}
        </button>
      </div>

      {error && (
        <div className="error-note" role="alert">
          {error}
        </div>
      )}

      {busy && <p className="busy" style={{ marginTop: 14 }}>reading the chain</p>}

      {profile && (
        <div style={{ marginTop: 16 }}>
          <h3 className="plan-summary">
            <a href={addressHref(profile.address)} target="_blank" rel="noreferrer">
              {shortAddress(profile.address)} ↗
            </a>
          </h3>
          {describeProfile(profile, (wei) => formatTokenAmount(wei, NATIVE_MON)).map(
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
          <p className="panel-label">Exposure · what others can spend</p>
          <p className="plan-outcome">{exposure.headline}</p>

          {exposure.lines.map((l) => (
            <div className="hangar-row" key={l.token.address ?? l.token.symbol}>
              <div className="hangar-info">
                <span className={`hangar-amount${l.fullyExposed ? ' unlimited' : ''}`}>
                  {formatTokenAmount(l.exposedRaw, l.token)} of{' '}
                  {formatTokenAmount(l.balanceRaw, l.token)} reachable
                </span>
                <span className="hangar-spender">
                  {l.unlimitedSpenders.length > 0 &&
                    `${l.unlimitedSpenders.length} unlimited · `}
                  {l.limitedSpenders.length > 0 && `${l.limitedSpenders.length} limited`}
                  {l.unlimitedSpenders.length === 0 &&
                    l.limitedSpenders.length === 0 &&
                    'no open permissions'}
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
