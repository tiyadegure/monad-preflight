import type { PostFlightCheck, PostFlightLineStatus } from '../lib/types';
import type { Lang } from '../lib/i18n';
import { t } from '../lib/i18n';

interface Props {
  check: PostFlightCheck;
  explorerHref: string;
  copied: boolean;
  lang: Lang;
  onNewFlight: () => void;
  onCopyReport: () => void;
}

const MARK: Record<PostFlightLineStatus, string> = {
  matched: '✓',
  mismatched: '✗',
  unverified: '–',
};

const SR_KEY: Record<PostFlightLineStatus, string> = {
  matched: 'postflight.srMatched',
  mismatched: 'postflight.srMismatched',
  unverified: 'postflight.srUnverified',
};

/**
 * After landing: line-by-line comparison of what the simulation promised
 * against what the mined receipt actually shows.
 */
export function PostFlight({
  check,
  explorerHref,
  copied,
  lang,
  onNewFlight,
  onCopyReport,
}: Props) {
  return (
    <section className="panel" aria-label="Post-flight verification">
      <p className="panel-label">{t(lang, 'postflight.label')}</p>

      <div className={`pf-verdict ${check.matched ? 'ok' : 'bad'}`}>
        <span className="dot" aria-hidden="true" />
        {check.matched
          ? check.hasUnverified
            ? t(lang, 'postflight.matchedPartial')
            : t(lang, 'postflight.matched')
          : t(lang, 'postflight.differed')}
      </div>

      <table className="pf-table">
        <thead>
          <tr>
            <th scope="col">{t(lang, 'postflight.colCheck')}</th>
            <th scope="col">{t(lang, 'postflight.colSimulated')}</th>
            <th scope="col">{t(lang, 'postflight.colActual')}</th>
            <th scope="col" aria-label="Match" />
          </tr>
        </thead>
        <tbody>
          {check.lines.map((l, i) => (
            <tr key={i}>
              <td>
                {l.label}
                {l.note && <div className="pf-note">{l.note}</div>}
              </td>
              <td>{l.simulated}</td>
              <td>{l.actual}</td>
              <td
                className={
                  l.status === 'matched' ? 'ok' : l.status === 'mismatched' ? 'bad' : ''
                }
              >
                <span className="sr-only">{t(lang, SR_KEY[l.status])}</span>
                {MARK[l.status]}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p style={{ marginTop: 14, fontSize: 13 }}>
        <a href={explorerHref} target="_blank" rel="noreferrer">
          {t(lang, 'postflight.viewExplorer')}
        </a>
      </p>

      <div className="sign-bar">
        <button className="btn-ghost" onClick={onNewFlight}>
          {t(lang, 'postflight.newFlight')}
        </button>
        <button className="btn-ghost" onClick={onCopyReport}>
          {copied ? t(lang, 'report.copied') : t(lang, 'report.copy')}
        </button>
      </div>
    </section>
  );
}
