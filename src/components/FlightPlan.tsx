import type { Explanation, RiskFinding, SimulationResult } from '../lib/types';

export interface PlanView {
  explanation: Explanation;
  risks: RiskFinding[];
  sim: SimulationResult;
}

interface Props {
  plan: PlanView;
  signing: boolean;
  onSign: () => void;
  onDiscard: () => void;
}

/**
 * The flight-plan checklist: what will happen, in plain language, with
 * annunciator lights for every risk finding. Rows stagger in like a
 * checklist being ticked.
 */
export function FlightPlan({ plan, signing, onSign, onDiscard }: Props) {
  const { explanation, risks, sim } = plan;
  let seq = 0;
  const delay = () => ({ animationDelay: `${seq++ * 80}ms` });

  return (
    <section className="panel" aria-label="Flight plan">
      <p className="panel-label">Flight plan · simulated before you sign</p>
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
          <p className="panel-label">AI co-pilot · written by Claude from the simulated facts above</p>
          {explanation.aiNarrative}
        </div>
      )}

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
