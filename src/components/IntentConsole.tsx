import type { FormEvent } from 'react';
import type { Lang } from '../lib/i18n';
import { t } from '../lib/i18n';

/**
 * Example chips per language. Every phrasing here is covered by a unit
 * test against the rule parser — a suggestion the grammar cannot parse
 * would be a lie.
 */
const EXAMPLES: Record<Lang, string[]> = {
  en: [
    'send 0.1 MON to 0x…',
    'approve 0x… to spend 100 tUSD',
    'revoke 0x…’s access to my tUSD',
    'wrap 1 MON then send 0.5 WMON to 0x…',
    '{"to":"0x…","data":"0x…","value":"0x0"}',
  ],
  zh: [
    '发送 0.1 MON 到 0x…',
    '授权 0x… 花费 100 tUSD',
    '撤销 0x… 对我的 tUSD 的授权',
    '封装 1 MON 然后 发送 0.5 WMON 到 0x…',
    '{"to":"0x…","data":"0x…","value":"0x0"}',
  ],
};

interface Props {
  value: string;
  busy: boolean;
  disabledReason?: string;
  parseSource: 'rules' | 'ai' | null;
  shareCopied: boolean;
  lang: Lang;
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
  lang,
  onChange,
  onSubmit,
  onShare,
}: Props) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!busy && value.trim()) onSubmit();
  };

  return (
    <section className="panel" aria-label={t(lang, 'console.label')}>
      <p className="panel-label">
        {t(lang, 'console.label')}
        {parseSource && (
          <span className="parse-source">
            {' '}
            · {t(lang, parseSource === 'ai' ? 'console.parsedByAi' : 'console.parsedByRules')}
          </span>
        )}
      </p>

      <form className="console-form" onSubmit={handleSubmit}>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t(lang, 'console.placeholder')}
          aria-label={t(lang, 'console.inputAria')}
          spellCheck={false}
        />
        <button
          className="btn-primary"
          type="submit"
          disabled={busy || !value.trim() || !!disabledReason}
        >
          {busy ? t(lang, 'console.preparing') : t(lang, 'console.prepare')}
        </button>
        <button
          className="btn-ghost"
          type="button"
          onClick={onShare}
          disabled={!value.trim()}
          title={t(lang, 'console.shareTitle')}
        >
          {shareCopied ? t(lang, 'console.shareCopied') : t(lang, 'console.share')}
        </button>
      </form>

      {disabledReason && <p className="hint" style={{ marginTop: 10 }}>{disabledReason}</p>}

      <div className="examples">
        {EXAMPLES[lang].map((ex) => (
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
          {t(lang, 'console.busy')}
        </p>
      )}
    </section>
  );
}
