/**
 * Keyboard shortcuts for Monad PreFlight.
 *
 * Pure and DOM-injected so every piece is testable in Node:
 *   - `matchShortcut` is a pure function from a key event to an action name.
 *   - `installShortcuts` wires one keydown listener onto an injected
 *     window-like target and returns an unsubscribe function.
 *
 * Bindings (Ctrl on Windows/Linux, Cmd on Mac — both accepted everywhere):
 *   Ctrl/Cmd+K            → focusInput   (works anywhere)
 *   Ctrl/Cmd+Enter        → submit       (works anywhere)
 *   Escape                → discard      (works anywhere, even in a field)
 *   Ctrl/Cmd+Shift+S      → sign
 *   Ctrl/Cmd+/            → toggleHelp
 *   Ctrl/Cmd+ArrowRight   → nextTab
 *
 * Typing is sacred: when focus is in an input or textarea, plain keys
 * (no Ctrl/Cmd) never trigger anything — the only exception is Escape.
 */

export interface ShortcutHandlers {
  focusInput?: () => void;
  submit?: () => void;
  discard?: () => void;
  sign?: () => void;
  nextTab?: () => void;
  toggleHelp?: () => void;
}

/** The subset of a KeyboardEvent that matching needs. */
export type ShortcutKeyEvent = Pick<
  KeyboardEvent,
  'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'
>;

/**
 * Decide which action (if any) a key event maps to.
 *
 * @param e       The key event (or any object with the same five fields).
 * @param inField True when focus is inside an input/textarea. Plain keys
 *                must never steal typing; modifier combos still fire.
 */
export function matchShortcut(
  e: ShortcutKeyEvent,
  inField: boolean,
): keyof ShortcutHandlers | null {
  // No binding uses Alt. Ignoring Alt combos also keeps AltGr text entry
  // (reported as Ctrl+Alt on Windows) from triggering shortcuts mid-word.
  if (e.altKey) return null;

  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  // While typing in a field, plain keys belong to the text. Only Escape
  // and Ctrl/Cmd combos are allowed through.
  if (inField && !mod && key !== 'Escape') return null;

  if (key === 'Escape') return 'discard';

  // Everything below requires Ctrl or Cmd; there are no plain-letter
  // bindings, so a bare letter never matches even outside a field.
  if (!mod) return null;

  switch (key) {
    case 'k':
      return e.shiftKey ? null : 'focusInput';
    case 'Enter':
      return e.shiftKey ? null : 'submit';
    case 's':
      return e.shiftKey ? 'sign' : null;
    case '/':
      // Some keyboard layouts need Shift to type "/", so Shift is allowed.
      return 'toggleHelp';
    case 'ArrowRight':
      return e.shiftKey ? null : 'nextTab';
    default:
      return null;
  }
}

/** Minimal shape of the events the installed listener receives. */
interface IncomingKeyEvent extends Partial<ShortcutKeyEvent> {
  preventDefault?: () => void;
  target?: unknown;
}

/** True when the event target is a place where the user types text. */
function isFieldTarget(target: unknown): boolean {
  if (target === null || typeof target !== 'object') return false;
  const el = target as { tagName?: unknown; isContentEditable?: unknown };
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    el.isContentEditable === true
  );
}

/**
 * Attach a single keydown listener to `target` (usually `window`) and route
 * matched shortcuts to the given handlers. A shortcut whose handler is not
 * provided is left alone (no preventDefault, no error). Returns a function
 * that removes the listener.
 */
export function installShortcuts(
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>,
  handlers: ShortcutHandlers,
): () => void {
  const onKeyDown = (event: Event): void => {
    if (event === null || typeof event !== 'object') return;
    const e = event as unknown as IncomingKeyEvent;
    if (typeof e.key !== 'string') return;

    const action = matchShortcut(
      {
        key: e.key,
        ctrlKey: e.ctrlKey === true,
        metaKey: e.metaKey === true,
        shiftKey: e.shiftKey === true,
        altKey: e.altKey === true,
      },
      isFieldTarget(e.target),
    );
    if (action === null) return;

    const handler = handlers[action];
    if (handler === undefined) return;

    if (typeof e.preventDefault === 'function') e.preventDefault();
    handler();
  };

  target.addEventListener('keydown', onKeyDown);
  return () => {
    target.removeEventListener('keydown', onKeyDown);
  };
}
