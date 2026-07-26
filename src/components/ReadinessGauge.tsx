import type { Readiness } from '../lib/score';

interface Props {
  readiness: Readiness;
}

/**
 * The primary instrument: one number, one word, one sentence. Everything
 * else on the flight plan explains this reading.
 */
export function ReadinessGauge({ readiness }: Props) {
  const { score, band, verdict, advice, counts } = readiness;
  // Circumference of an r=26 circle, used to draw the arc by dash offset.
  const circumference = 2 * Math.PI * 26;
  const filled = (score / 100) * circumference;

  return (
    <div
      className={`gauge ${band}`}
      role="meter"
      aria-valuenow={score}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`Flight readiness: ${score} out of 100, ${verdict}`}
    >
      <svg viewBox="0 0 64 64" className="gauge-dial" aria-hidden="true">
        <circle className="gauge-track" cx="32" cy="32" r="26" />
        <circle
          className="gauge-arc"
          cx="32"
          cy="32"
          r="26"
          strokeDasharray={`${filled} ${circumference}`}
        />
      </svg>
      <div className="gauge-readout">
        <div className="gauge-line">
          <span className="gauge-score">{score}</span>
          <span className="gauge-verdict">{verdict}</span>
        </div>
        <p className="gauge-advice">{advice}</p>
        {(counts.danger > 0 || counts.caution > 0) && (
          <p className="gauge-counts">
            {counts.danger > 0 && (
              <span className="c-danger">
                {counts.danger} serious {counts.danger === 1 ? 'warning' : 'warnings'}
              </span>
            )}
            {counts.danger > 0 && counts.caution > 0 && ' · '}
            {counts.caution > 0 && (
              <span className="c-caution">{counts.caution} to double-check</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
