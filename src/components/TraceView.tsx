import type { CallFrameSummary, DecodedEvent } from '../lib/types';
import { NATIVE_MON } from '../lib/types';
import { formatTokenAmount, shortAddress } from '../lib/format';

interface Props {
  frames: CallFrameSummary[];
  events: DecodedEvent[];
}

function describeEvent(e: DecodedEvent): string {
  const a = e.args ?? {};
  switch (e.name) {
    case 'Transfer':
      return `Transfer · ${shortAddress(a.from ?? '')} → ${shortAddress(a.to ?? '')} · ${a.value ?? '?'} units`;
    case 'Approval':
      return `Approval · ${shortAddress(a.owner ?? '')} lets ${shortAddress(a.spender ?? '')} spend ${a.value ?? '?'} units`;
    case 'Deposit':
      return `Deposit (wrap) · ${shortAddress(a.dst ?? '')} · ${a.wad ?? '?'} units`;
    case 'Withdrawal':
      return `Withdrawal (unwrap) · ${shortAddress(a.src ?? '')} · ${a.wad ?? '?'} units`;
    default:
      return `unrecognized event from ${shortAddress(e.address)}`;
  }
}

/**
 * Instrument deep-dive: the raw call tree and decoded events from the
 * simulation trace, for users (and judges) who want to see under the hood.
 * Everything shown here is data the simulator already produced — no extra
 * network calls.
 */
export function TraceView({ frames, events }: Props) {
  if (frames.length === 0) return null;
  return (
    <details className="trace-view">
      <summary>Instrument deep-dive · call trace ({frames.length} calls)</summary>
      <div className="trace-frames">
        {frames.map((f, i) => (
          <div
            className={`trace-row${f.error ? ' errored' : ''}`}
            key={i}
            style={{ paddingLeft: `${12 + f.depth * 16}px` }}
          >
            <span className="trace-type">{f.type}</span>{' '}
            {shortAddress(f.from)} → {f.to ? shortAddress(f.to) : '(create)'}
            {f.valueWei > 0n && <> · {formatTokenAmount(f.valueWei, NATIVE_MON)}</>}
            {f.gasUsed > 0n && <> · {f.gasUsed.toString()} gas</>}
            {f.error && <> · ⚠ {f.revertReason ?? f.error}</>}
          </div>
        ))}
      </div>
      {events.length > 0 && (
        <>
          <p className="panel-label" style={{ marginTop: 12 }}>
            Events emitted
          </p>
          <div className="trace-frames">
            {events.map((e, i) => (
              <div className="trace-row" key={i}>
                {describeEvent(e)}
              </div>
            ))}
          </div>
        </>
      )}
    </details>
  );
}
