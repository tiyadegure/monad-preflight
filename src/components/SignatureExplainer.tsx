import { useState } from 'react';
import type { Address } from '../lib/types';
import type { InspectResult } from '../lib/inspect';
import { inspectSignaturePayload } from '../lib/inspect';

interface Props {
  expectedChainIds: number[];
  selfAddress: Address | null;
}

/**
 * Signature-request explainer. Signing typed data (EIP-712) moves no gas
 * and shows almost nothing useful in a wallet — which is exactly why it is
 * the drainer's favourite tool. Paste the request, see what it authorizes.
 * All triage logic lives in src/lib/inspect.ts, shared with the Risk API.
 */
export function SignatureExplainer({ expectedChainIds, selfAddress }: Props) {
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState<InspectResult | null>(null);

  const explain = () => {
    const text = raw.trim();
    if (!text) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      setResult({
        error:
          'That is not valid JSON. Copy the whole request from the app that asked for it.',
      });
      return;
    }
    setResult(
      inspectSignaturePayload(parsed, {
        expectedChainIds,
        ...(selfAddress ? { selfAddress } : {}),
      }),
    );
  };

  const explained = result && !('error' in result) ? result : null;

  return (
    <section className="panel" aria-label="Signature request explainer">
      <p className="panel-label">Signature inspector · what would signing authorize?</p>
      <p className="hint" style={{ marginBottom: 10 }}>
        Signing costs no gas and looks harmless — which is why drainers ask for it.
        Paste a request here before you approve it: a signature request, a
        wallet-takeover request, or a batch of bundled instructions.
      </p>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder='{"types":{…},"domain":{…},"primaryType":"Permit","message":{…}}'
        rows={4}
        spellCheck={false}
        aria-label="Request JSON"
        style={{ width: '100%', resize: 'vertical' }}
      />

      <div className="sign-bar">
        <button className="btn-primary" onClick={explain} disabled={!raw.trim()}>
          Explain this request
        </button>
        {result && (
          <button
            className="btn-ghost"
            onClick={() => {
              setRaw('');
              setResult(null);
            }}
          >
            Clear
          </button>
        )}
      </div>

      {result && 'error' in result && (
        <div className="error-note" role="alert">
          {result.error}
        </div>
      )}

      {explained && (
        <div style={{ marginTop: 16 }}>
          <h3 className="plan-summary">{explained.headline}</h3>
          <p className="plan-outcome">{explained.outcome}</p>

          {explained.bullets.map((b, i) => (
            <div className="check-row" key={i} style={{ animationDelay: `${i * 60}ms` }}>
              <span className="k">{b}</span>
            </div>
          ))}

          {explained.risks.length > 0 && (
            <div className="annunciators" role="alert">
              {explained.risks.map((r, i) => (
                <div
                  className={`annunciator ${r.severity}`}
                  key={r.id}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="lamp" aria-hidden="true" />
                  <div>
                    <div className="a-title">{r.title}</div>
                    <p className="a-detail">{r.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="hint" style={{ marginTop: 12 }}>
            PreFlight cannot sign this for you — read it here, then decide in your
            wallet.
          </p>
        </div>
      )}
    </section>
  );
}
