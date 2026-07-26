import { useState } from 'react';
import type { TokenInfo } from '../lib/types';
import type { AddressBookEntry } from '../lib/addressbook';
import { removeEntry, saveEntry } from '../lib/addressbook';
import { shortAddress } from '../lib/format';

interface Props {
  apiKey: string;
  aiProxyUrl: string;
  tokens: TokenInfo[];
  book: AddressBookEntry[];
  addTokenBusy: boolean;
  addTokenError: string | null;
  onApiKeyChange: (key: string) => void;
  onAiProxyUrlChange: (url: string) => void;
  onAddToken: (address: string) => void;
  onBookChange: (book: AddressBookEntry[]) => void;
}

/**
 * Inline settings (no modal): the optional AI connection, the token
 * registry, and the address book. Everything here lives in this browser
 * only — nothing is uploaded anywhere.
 */
export function SettingsDrawer({
  apiKey,
  aiProxyUrl,
  tokens,
  book,
  addTokenBusy,
  addTokenError,
  onApiKeyChange,
  onAiProxyUrlChange,
  onAddToken,
  onBookChange,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [bookName, setBookName] = useState('');
  const [bookAddress, setBookAddress] = useState('');
  const [bookError, setBookError] = useState<string | null>(null);

  const addContact = () => {
    setBookError(null);
    try {
      onBookChange(saveEntry({ name: bookName, address: bookAddress }));
      setBookName('');
      setBookAddress('');
    } catch (err) {
      setBookError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <section className="panel" aria-label="Settings">
      <button
        className="btn-ghost"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={{ width: '100%', textAlign: 'left' }}
      >
        {open ? '▾' : '▸'} Settings — AI, tokens & contacts{' '}
        <span className="parse-source">
          {apiKey || aiProxyUrl ? ' · AI on' : ' · AI off (rule-based mode)'}
          {tokens.length ? ` · ${tokens.length} token${tokens.length > 1 ? 's' : ''}` : ''}
          {book.length ? ` · ${book.length} contact${book.length > 1 ? 's' : ''}` : ''}
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

          <label>
            Save a contact — then just say "send 1 MON to alice"
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input
                value={bookName}
                onChange={(e) => setBookName(e.target.value)}
                placeholder="alice"
                style={{ flex: '0 1 140px', minWidth: 0 }}
                aria-label="Contact name"
              />
              <input
                value={bookAddress}
                onChange={(e) => setBookAddress(e.target.value)}
                placeholder="0x…"
                style={{ flex: '1 1 200px', minWidth: 0 }}
                aria-label="Contact address"
              />
              <button
                className="btn-ghost"
                type="button"
                disabled={!bookName.trim() || !bookAddress.trim()}
                onClick={addContact}
              >
                Save
              </button>
            </span>
          </label>

          {bookError && <p className="error-note">{bookError}</p>}

          {book.length > 0 && (
            <div>
              {book.map((entry) => (
                <div className="hangar-row" key={entry.name}>
                  <div className="hangar-info">
                    <span className="hangar-amount">{entry.name}</span>
                    <span className="hangar-spender mono">
                      {shortAddress(entry.address)}
                    </span>
                  </div>
                  <button
                    className="btn-ghost"
                    onClick={() => onBookChange(removeEntry(entry.name))}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}

          <p className="hint">
            Everything on this panel is stored in your browser only. PreFlight has no
            server and no account.
          </p>
        </div>
      )}
    </section>
  );
}
