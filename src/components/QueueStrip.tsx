import type { FlightQueue, LegStatus } from '../lib/queue';
import type { Lang } from '../lib/i18n';
import { t } from '../lib/i18n';

interface Props {
  queue: FlightQueue;
  lang: Lang;
  /** True when the current step has landed and a pending step remains. */
  canContinue: boolean;
  /** True when the active step may be skipped (not mid-sign, not mid-flight). */
  canSkip: boolean;
  /** Freeze all controls while a prepare, signature or receipt is in flight. */
  busy: boolean;
  txHref: (hash: string) => string;
  onContinue: () => void;
  onSkip: () => void;
  onAbandon: () => void;
}

const MARK: Record<LegStatus, string> = {
  pending: '○',
  active: '▸',
  signed: '✓',
  failed: '✗',
  skipped: '–',
};

/**
 * The journey strip: a multi-step instruction ("wrap 1 MON then send…")
 * shown as an ordered list of legs. Every leg gets the full flight-plan
 * treatment and its own wallet signature — this strip only shows where
 * you are and lets you continue, skip a step, or stop the journey. It
 * never signs anything.
 */
export function QueueStrip({
  queue,
  lang,
  canContinue,
  canSkip,
  busy,
  txHref,
  onContinue,
  onSkip,
  onAbandon,
}: Props) {
  const total = queue.legs.length;
  if (total === 0) return null;

  const count = (status: LegStatus) =>
    queue.legs.filter((leg) => leg.status === status).length;
  const active = queue.activeIndex >= 0;
  const summary = active
    ? t(lang, 'queue.progress', {
        n: queue.activeIndex + 1,
        total,
        signed: count('signed'),
        remaining: count('pending'),
      })
    : t(lang, 'queue.done', { total });

  const noteFor = (leg: FlightQueue['legs'][number]): string | null => {
    if (leg.note) return leg.note;
    if (leg.status === 'failed') return t(lang, 'queue.failedNote');
    if (leg.status === 'skipped') return t(lang, 'queue.skippedNote');
    return null;
  };

  // The step the Continue button would prepare: the first pending leg.
  const nextIndex = queue.legs.findIndex((leg) => leg.status === 'pending');

  return (
    <section className="panel queue-strip" aria-label={t(lang, 'queue.ariaLabel')}>
      <p className="panel-label">{t(lang, 'queue.label')}</p>
      <p className="queue-summary">{summary}</p>

      <ol className="queue-legs">
        {queue.legs.map((leg) => {
          const note = noteFor(leg);
          return (
            <li className={`queue-leg s-${leg.status}`} key={leg.id}>
              <span className="queue-mark" aria-hidden="true">
                {MARK[leg.status]}
              </span>
              <div className="queue-leg-body">
                <span className="queue-leg-text">{leg.text}</span>
                {note && <span className="queue-leg-note">{note}</span>}
                {leg.hash && (
                  <a
                    className="queue-leg-hash"
                    href={txHref(leg.hash)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {t(lang, 'log.explorer')}
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <div className="sign-bar" style={{ marginTop: 12 }}>
        {canContinue && nextIndex !== -1 && (
          <button className="btn-primary" onClick={onContinue} disabled={busy}>
            {t(lang, 'queue.continue', { n: nextIndex + 1 })}
          </button>
        )}
        {canSkip && (
          <button className="btn-ghost" onClick={onSkip} disabled={busy}>
            {t(lang, 'queue.skip')}
          </button>
        )}
        <button className="btn-ghost" onClick={onAbandon} disabled={busy}>
          {active ? t(lang, 'queue.abandon') : t(lang, 'queue.dismiss')}
        </button>
      </div>

      <p className="hint" style={{ marginTop: 10 }}>
        {t(lang, 'queue.hint')}
      </p>
    </section>
  );
}
