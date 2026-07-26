import { useState } from 'react';
import type { TokenInfo } from '../lib/types';
import { shortAddress } from '../lib/format';

interface Props {
  apiKey: string;
  aiProxyUrl: string;
  tokens: TokenInfo[];
  addTokenBusy: boolean;
  addTokenError: string | null;
  onApiKeyChange: (key: string) => void;
  onAiProxyUrlChange: (url: string) => void;
  onAddToken: (address: string) => void;
}

/**
 * Inline settings (no modal): optional Claude API key for the AI co-pilot,
 * and the custom token registry. Both persist in localStorage only.
 */
export function SettingsDrawer({
  apiKey,
  aiProxyUrl,
  tokens,
  addTokenBusy,
  addTokenError,
  onApiKeyChange,
  onAiProxyUrlChange,
  onAddToken,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  return (
    <section className="panel" aria-label="Settings">
      <button
        className="btn-ghost"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: '100%', textAlign: 'left' }}
      >
        {open ? '▾' : '▸'} Settings — AI co-pilot & tokens{' '}
        <span className="parse-source">
          {apiKey || aiProxyUrl ? ' · AI on' : ' · AI off (rule-based mode)'}
          {tokens.length ? ` · ${tokens.length} token${tokens.length > 1 ? 's' : ''}` : ''}
        </span>
      </button>

      {open && (
        <div className="settings-row" style={{ marginTop: 16 }}>
          <label>
            Anthropic API key (optional — enables Claude parsing & narratives; stored
            only in this browser)
            <input
              type="password"
              value={apiKey}
              onChange={(e) => onApiKeyChange(e.target.value)}
              placeholder="sk-ant-…"
              autoComplete="off"
            />
          </label>

          <label>
            AI proxy endpoint (production alternative — the key stays on your own
            server; see docs/ai-proxy.md)
            <input
              value={aiProxyUrl}
              onChange={(e) => onAiProxyUrlChange(e.target.value.trim())}
              placeholder="https://your-worker.workers.dev"
              autoComplete="off"
              spellCheck={false}
            />
          </label>

          <label>
            Teach PreFlight a token — paste its contract address
            <span style={{ display: 'flex', gap: 8 }}>
              <input
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="0x…"
                style={{ flex: 1, minWidth: 0 }}
              />
              <button
                className="btn-ghost"
                type="button"
                disabled={addTokenBusy || !tokenInput.trim()}
                onClick={() => {
                  onAddToken(tokenInput.trim());
                  setTokenInput('');
                }}
              >
                {addTokenBusy ? 'Reading…' : 'Add'}
              </button>
            </span>
          </label>

          {addTokenError && <p className="error-note">{addTokenError}</p>}

          {tokens.length > 0 && (
            <p className="hint">
              Known tokens:{' '}
              {tokens
                .map((t) => `${t.symbol} (${shortAddress(t.address ?? '')})`)
                .join(' · ')}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
