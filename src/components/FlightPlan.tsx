import type { Explanation, RiskFinding, SimulationResult } from '../lib/types';
import type { Readiness } from '../lib/score';
import type { FeeReading } from '../lib/gasoracle';
import type { DriftReport } from '../lib/drift';
import type { Lang } from '../lib/i18n';
import { t } from '../lib/i18n';
import { ReadinessGauge } from './ReadinessGauge';
import { TraceView } from './TraceView';
import { DriftNotice } from './DriftNotice';

export interface PlanView {
  explanation: Explanation;
  risks: RiskFinding[];
  sim: SimulationResult;
  readiness: Readiness;
  fees: FeeReading | null;
}

interface Props {
  plan: PlanView;
  signing: boolean;
  copied: boolean;
  drift: DriftReport | null;
  lang: Lang;
  onSign: () => void;
  onSignAnyway: () => void;
  onDismissDrift: () => void;
  onDiscard: () => void;
  onCopyReport: () => void;
}

/**
 * The flight-plan checklist: one readiness reading, then what will happen
 * in plain language, then an annunciator light per risk finding. Rows
 * stagger in like a checklist being ticked.
 */
export function FlightPlan({
  plan,
  signing,
  copied,
  drift,
  lang,
  onSign,
  onSignAnyway,
  onDismissDrift,
  onDiscard,
  onCopyReport,
}: Props) {
  const { explanation, risks, sim, readiness, fees } = plan;
  let seq = 0;
  const delay = () => ({ animationDelay: `${seq++ * 80}ms` });

  return (
    <section className="panel" aria-label="Flight plan">
      <p className="panel-label">{t(lang, 'plan.label')}</p>

      <ReadinessGauge readiness={readiness} />

      <h2 className="plan-summary">{explanation.headline}</h2>
      <p className="plan-outcome">{explanation.outcome}</p>

      <div>
        {explanation.bullets.map((b, i) => (
          <div className="check-row" key={i} style={delay()}>
            <span className="k">{b}</span>
          </div>
        ))}
      </div>

      {risks.length > 0 && (
        <div className="annunciators" role="alert">
          {risks.map((r) => (
            <div className={`annunciator ${r.severity}`} key={r.id} style={delay()}>
              <span className="lamp" aria-hidden="true" />
              <div>
                <div className="a-title">
                  <span className="sr-only">{t(lang, `sr.${r.severity}`)} </span>
                  {r.title}
                </div>
                <p className="a-detail">{r.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {explanation.aiNarrative && (
        <div className="ai-narrative">
          <p className="panel-label">{t(lang, 'plan.aiLabel')}</p>
          {explanation.aiNarrative}
        </div>
      )}

      {fees && (
        <p className="fee-readout">
          <span className="mono">{fees.verdict}</span>
          {fees.advice && <> {fees.advice}</>}
          {fees.notes.map((n) => (
            <span key={n}> {n}</span>
          ))}
        </p>
      )}

      <TraceView frames={sim.frames} events={sim.events} lang={lang} />

      {drift && (
        <DriftNotice
          drift={drift}
          onReview={onDismissDrift}
          onSignAnyway={onSignAnyway}
        />
      )}

      <div className="sign-bar">
        <button
          className={sim.ok ? 'btn-primary' : 'btn-danger'}
          onClick={onSign}
          disabled={signing}
        >
          {signing
            ? t(lang, 'plan.waitingWallet')
            : sim.ok
              ? t(lang, 'plan.signButton')
              : t(lang, 'plan.signAnyway')}
        </button>
        <button className="btn-ghost" onClick={onCopyReport} disabled={signing}>
          {copied ? t(lang, 'report.copied') : t(lang, 'report.copy')}
        </button>
        <button className="btn-ghost" onClick={onDiscard} disabled={signing}>
          {t(lang, 'plan.discard')}
        </button>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        {t(lang, 'plan.keysNote')}
      </p>
    </section>
  );
}
