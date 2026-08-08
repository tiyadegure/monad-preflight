import type { CallFrameSummary, DecodedEvent } from '../lib/types';
import { NATIVE_MON } from '../lib/types';
import type { Lang } from '../lib/i18n';
import { t } from '../lib/i18n';
import { formatTokenAmount, shortAddress } from '../lib/format';

interface Props {
  frames: CallFrameSummary[];
  events: DecodedEvent[];
  lang: Lang;
}

function describeEvent(e: DecodedEvent, lang: Lang): string {
  const a = e.args ?? {};
  switch (e.name) {
    case 'Transfer':
      return t(lang, 'trace.transfer', {
        from: shortAddress(a.from ?? ''),
        to: shortAddress(a.to ?? ''),
        value: a.value ?? '?',
      });
    case 'Approval':
      return t(lang, 'trace.approval', {
        owner: shortAddress(a.owner ?? ''),
        spender: shortAddress(a.spender ?? ''),
        value: a.value ?? '?',
      });
    case 'Deposit':
      return t(lang, 'trace.deposit', {
        dst: shortAddress(a.dst ?? ''),
        value: a.wad ?? '?',
      });
    case 'Withdrawal':
      return t(lang, 'trace.withdrawal', {
        src: shortAddress(a.src ?? ''),
        value: a.wad ?? '?',
      });
    default:
      return t(lang, 'trace.unknown', { addr: shortAddress(e.address) });
  }
}

/**
 * Instrument deep-dive: the raw call tree and decoded events from the
 * simulation trace, for users (and judges) who want to see under the hood.
 * Everything shown here is data the simulator already produced — no extra
 * network calls.
 */
export function TraceView({ frames, events, lang }: Props) {
  if (frames.length === 0) return null;
  return (
    <details className="trace-view">
      <summary>{t(lang, 'trace.summary', { count: frames.length })}</summary>
      <div className="trace-frames">
        {frames.map((f, i) => (
          <div
            className={`trace-row${f.error ? ' errored' : ''}`}
            key={i}
            style={{ paddingLeft: `${12 + f.depth * 16}px` }}
          >
            <span className="trace-type">{f.type}</span>{' '}
            {shortAddress(f.from)} → {f.to ? shortAddress(f.to) : t(lang, 'trace.create')}
            {f.valueWei > 0n && <> · {formatTokenAmount(f.valueWei, NATIVE_MON)}</>}
            {f.gasUsed > 0n && <> · {t(lang, 'trace.gasSuffix', { gas: f.gasUsed.toString() })}</>}
            {f.error && <> · ⚠ {f.revertReason ?? f.error}</>}
          </div>
        ))}
      </div>
      {events.length > 0 && (
        <>
          <p className="panel-label" style={{ marginTop: 12 }}>
            {t(lang, 'trace.events')}
          </p>
          <div className="trace-frames">
            {events.map((e, i) => (
              <div className="trace-row" key={i}>
                {describeEvent(e, lang)}
              </div>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
