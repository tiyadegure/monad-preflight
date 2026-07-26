import type { FormEvent } from 'react';

const EXAMPLES = [
  'send 0.1 MON to 0x…',
  'approve 0x… to spend 100 tUSD',
  'revoke 0x…’s access to my tUSD',
  '{"to":"0x…","data":"0x…","value":"0x0"}',
];

interface Props {
  value: string;
  busy: boolean;
  disabledReason?: string;
  parseSource: 'rules' | 'ai' | null;
  shareCopied: boolean;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onShare: () => void;
}

export function IntentConsole({
  value,
  busy,
  disabledReason,
  parseSource,
  shareCopied,
  onChange,
  onSubmit,
  onShare,
}: Props) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy && value.trim()) onSubmit();
  };

  return (
    <section className="panel" aria-label="Intent console">
      <p className="panel-label">
        Intent console
        {parseSource && (
          <span className="parse-source">
            {' '}
            · parsed by {parseSource === 'ai' ? 'Claude' : 'rules'}
          </span>
        )}
      </p>

      <form className="console-form" onSubmit={handleSubmit}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder='Tell me what you want to do — e.g. "send 0.1 MON to 0xabc…"'
          aria-label="What do you want to do on Monad?"
          spellCheck={false}
        />
        <button
          className="btn-primary"
          type="submit"
          disabled={busy || !value.trim() || !!disabledReason}
        >
          {busy ? 'Preparing…' : 'Prepare'}
        </button>
        <button
          className="btn-ghost"
          type="button"
          onClick={onShare}
          disabled={!value.trim()}
          title="Copy a link that opens this exact instruction for someone else"
        >
          {shareCopied ? 'Link copied ✓' : 'Share'}
        </button>
      </form>

      {disabledReason && <p className="hint" style={{ marginTop: 10 }}>{disabledReason}</p>}

      <div className="examples">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="example-chip"
            onClick={() => onChange(ex)}
          >
            {ex}
          </button>
        ))}
      </div>

      {busy && (
        <p className="busy" style={{ marginTop: 14 }}>
          building · simulating · assessing risk
        </p>
      )}
    </section>
  );
}
