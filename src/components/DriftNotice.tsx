import type { DriftReport } from '../lib/drift';
import { t } from '../lib/i18n';
import type { Lang } from '../lib/i18n';

interface Props {
  drift: DriftReport;
  onReview: () => void;
  onSignAnyway: () => void;
  lang: Lang;
}

/**
 * Shown when a pre-sign re-simulation found the chain moved while the
 * user was reading. Material drift blocks the signature until the user
 * consciously chooses; cosmetic drift is informational only.
 */
export function DriftNotice({ drift, onReview, onSignAnyway, lang }: Props) {
  if (drift.level === 'none') return null;
  const material = drift.level === 'material';

  return (
    <div
      className={`annunciator ${material ? 'danger' : 'info'}`}
      role="alert"
      style={{ marginTop: 12 }}
    >
      <span className="lamp" aria-hidden="true" />
      <div style={{ minWidth: 0 }}>
        <div className="a-title">{drift.headline}</div>
        {drift.changes.map((c) => (
          <p className="a-detail" key={c}>
            {c}
          </p>
        ))}
        <p className="a-detail">
          {t(lang, 'driftn.staleSeconds', { seconds: String(drift.staleSeconds) })}
        </p>
        {material && (
          <div className="sign-bar" style={{ marginTop: 10 }}>
            <button className="btn-primary" onClick={onReview}>
              {t(lang, 'driftn.showNew')}
            </button>
            <button className="btn-ghost" onClick={onSignAnyway}>
              {t(lang, 'driftn.signAnyway')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
