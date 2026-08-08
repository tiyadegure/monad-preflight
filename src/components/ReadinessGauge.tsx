import type { Readiness } from '../lib/score';
import { t } from '../lib/i18n';
import type { Lang } from '../lib/i18n';

interface Props {
  readiness: Readiness;
  lang: Lang;
}

/**
 * The primary instrument: one number, one word, one sentence. Everything
 * else on the flight plan explains this reading.
 */
export function ReadinessGauge({ readiness, lang }: Props) {
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
      aria-label={t(lang, 'gauge.aria', {
        score: String(score),
        verdict,
      })}
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
                {counts.danger === 1
                  ? t(lang, 'gauge.seriousOne')
                  : t(lang, 'gauge.seriousMany', { n: String(counts.danger) })}
              </span>
            )}
            {counts.danger > 0 && counts.caution > 0 && ' · '}
            {counts.caution > 0 && (
              <span className="c-caution">
                {t(lang, 'gauge.toCheck', { n: String(counts.caution) })}
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}
