import type { Explanation, RiskFinding, SimulationResult } from '../lib/types';
import type { Readiness } from '../lib/score';
import { ReadinessGauge } from './ReadinessGauge';
import { TraceView } from './TraceView';

export interface PlanView {
  explanation: Explanation;
  risks: RiskFinding[];
  sim: SimulationResult;
  readiness: Readiness;
}

interface Props {
  plan: PlanView;
  signing: boolean;
  copied: boolean;
  onSign: () => void;
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
  onSign,
  onDiscard,
  onCopyReport,
}: Props) {
  const { explanation, risks, sim, readiness } = plan;
  let seq = 0;
  const delay = () => ({ animationDelay: `${seq++ * 80}ms` });

  return (
    <section className="panel" aria-label="Flight plan">
      <p className="panel-label">Flight plan · simulated before you sign</p>

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
                <div className="a-title">{r.title}</div>
                <p className="a-detail">{r.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {explanation.aiNarrative && (
        <div className="ai-narrative">
          <p className="panel-label">
            AI co-pilot · written by Claude from the simulated facts above
          </p>
          {explanation.aiNarrative}
        </div>
      )}

      <TraceView frames={sim.frames} events={sim.events} />

      <div className="sign-bar">
        <button
          className={sim.ok ? 'btn-primary' : 'btn-danger'}
          onClick={onSign}
          disabled={signing}
        >
          {signing
            ? 'Waiting for your wallet…'
            : sim.ok
              ? 'Looks right — sign in wallet'
              : 'Sign anyway (not recommended)'}
        </button>
        <button className="btn-ghost" onClick={onCopyReport} disabled={signing}>
          {copied ? 'Copied ✓' : 'Copy report'}
        </button>
        <button className="btn-ghost" onClick={onDiscard} disabled={signing}>
          Discard
        </button>
      </div>
      <p className="hint" style={{ marginTop: 10 }}>
        PreFlight never touches your keys — your wallet shows the final confirmation.
      </p>
    </section>
  );
}
