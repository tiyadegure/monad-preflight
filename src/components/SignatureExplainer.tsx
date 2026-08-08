import { useState } from 'react';
import type { Address } from '../lib/types';
import type { InspectResult } from '../lib/inspect';
import { inspectSignaturePayload } from '../lib/inspect';
import { t } from '../lib/i18n';
import type { Lang } from '../lib/i18n';

interface Props {
  expectedChainIds: number[];
  selfAddress: Address | null;
  lang: Lang;
}

/**
 * Signature-request explainer. Signing typed data (EIP-712) moves no gas
 * and shows almost nothing useful in a wallet — which is exactly why it is
 * the drainer's favourite tool. Paste the request, see what it authorizes.
 * All triage logic lives in src/lib/inspect.ts, shared with the Risk API.
 */
export function SignatureExplainer({ expectedChainIds, selfAddress, lang }: Props) {
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
        error: t(lang, 'sign.invalidJson'),
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
    <section className="panel" aria-label={t(lang, 'sign.ariaLabel')}>
      <p className="panel-label">{t(lang, 'sign.label')}</p>
      <p className="hint" style={{ marginBottom: 10 }}>
        {t(lang, 'sign.hint')}
      </p>

      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder={t(lang, 'sign.placeholder')}
        rows={4}
        spellCheck={false}
        aria-label={t(lang, 'sign.jsonAria')}
        style={{ width: '100%', resize: 'vertical' }}
      />

      <div className="sign-bar">
        <button className="btn-primary" onClick={explain} disabled={!raw.trim()}>
          {t(lang, 'sign.explain')}
        </button>
        {result && (
          <button
            className="btn-ghost"
            onClick={() => {
              setRaw('');
              setResult(null);
            }}
          >
            {t(lang, 'sign.clear')}
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
            {t(lang, 'sign.cannotSign')}
          </p>
        </div>
      )}
    </section>
  );
}
