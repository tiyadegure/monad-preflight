import { useState } from 'react';
import type { RiskFinding } from '../lib/types';
import { explainTypedData, looksLikeTypedData } from '../lib/typeddata';
import { explainAuthorization, looksLikeAuthorization } from '../lib/delegation';
import { batchRisks, describeBatch, looksLikeBatch, parseBatch } from '../lib/batch';
import { shortAddress } from '../lib/format';
import type { Address } from '../lib/types';

interface Props {
  expectedChainIds: number[];
  selfAddress: Address | null;
}

/** What the paste box produced, whichever of the three kinds it was. */
interface Reading {
  headline: string;
  outcome: string;
  bullets: string[];
  risks: RiskFinding[];
}

/**
 * Signature-request explainer. Signing typed data (EIP-712) moves no gas
 * and shows almost nothing useful in a wallet — which is exactly why it is
 * the drainer's favourite tool. Paste the request, see what it authorizes.
 */
export function SignatureExplainer({ expectedChainIds, selfAddress }: Props) {
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState<Reading | { error: string } | null>(null);

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

    // Three very different things arrive through this one box. Check the
    // most dangerous shape first: a delegation hands over the wallet
    // itself, which is worse than anything a permit can do.
    if (looksLikeAuthorization(parsed)) {
      const r = explainAuthorization(parsed, {
        expectedChainIds,
        ...(selfAddress ? { selfAddress } : {}),
      });
      setResult(r);
      return;
    }

    if (looksLikeBatch(parsed)) {
      const b = parseBatch(parsed);
      if ('error' in b) {
        setResult(b);
        return;
      }
      setResult({
        headline: 'This is several instructions behind one confirmation',
        outcome:
          `${describeBatch(b)} Your wallet may show you only one of them, so read each ` +
          'line below before you approve it.',
        bullets: b.calls
          .map(
            (c) =>
              `Instruction ${c.index + 1}: send ${c.value > 0n ? `${c.value.toString()} wei and ` : ''}` +
              `instructions to ${shortAddress(c.to)}`,
          )
          .concat(b.notes),
        risks: batchRisks(b),
      });
      return;
    }

    if (!looksLikeTypedData(parsed)) {
      setResult({
        error:
          'We do not recognise this. PreFlight can explain a signature request (it has ' +
          '"types" and "message"), a wallet-takeover request, or a batch of instructions.',
      });
      return;
    }
    setResult(explainTypedData(parsed, { expectedChainIds }));
  };

  const explained: Reading | null = result && !('error' in result) ? result : null;

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
