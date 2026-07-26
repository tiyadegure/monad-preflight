import { describe, expect, it, vi } from 'vitest';
import { installShortcuts, matchShortcut } from '../src/lib/shortcuts';
import type { ShortcutHandlers, ShortcutKeyEvent } from '../src/lib/shortcuts';

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function key(
  k: string,
  mods: Partial<Omit<ShortcutKeyEvent, 'key'>> = {},
): ShortcutKeyEvent {
  return {
    key: k,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    altKey: false,
    ...mods,
  };
}

type Listener = (event: unknown) => void;

interface FakeWindow {
  listeners: Map<string, Listener[]>;
  target: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  dispatch: (event: unknown) => void;
}

function makeFakeWindow(): FakeWindow {
  const listeners = new Map<string, Listener[]>();
  const target = {
    addEventListener: (type: string, listener: unknown) => {
      const list = listeners.get(type) ?? [];
      list.push(listener as Listener);
      listeners.set(type, list);
    },
    removeEventListener: (type: string, listener: unknown) => {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((l) => l !== (listener as Listener)),
      );
    },
  } as unknown as Pick<Window, 'addEventListener' | 'removeEventListener'>;
  return {
    listeners,
    target,
    dispatch: (event: unknown) => {
      for (const l of listeners.get('keydown') ?? []) l(event);
    },
  };
}

/* ------------------------------------------------------------------ */
/* matchShortcut — bindings                                            */
/* ------------------------------------------------------------------ */

describe('matchShortcut bindings', () => {
  it('Ctrl+K → focusInput', () => {
    expect(matchShortcut(key('k', { ctrlKey: true }), false)).toBe('focusInput');
  });

  it('Cmd+K → focusInput (Mac)', () => {
    expect(matchShortcut(key('k', { metaKey: true }), false)).toBe('focusInput');
  });

  it('Ctrl+Enter → submit', () => {
    expect(matchShortcut(key('Enter', { ctrlKey: true }), false)).toBe('submit');
  });

  it('Escape → discard', () => {
    expect(matchShortcut(key('Escape'), false)).toBe('discard');
  });

  it('Ctrl+Shift+S → sign', () => {
    expect(
      matchShortcut(key('S', { ctrlKey: true, shiftKey: true }), false),
    ).toBe('sign');
  });

  it('Cmd+Shift+S → sign (Mac)', () => {
    expect(
      matchShortcut(key('S', { metaKey: true, shiftKey: true }), false),
    ).toBe('sign');
  });

  it('Ctrl+/ → toggleHelp', () => {
    expect(matchShortcut(key('/', { ctrlKey: true }), false)).toBe('toggleHelp');
  });

  it('Ctrl+/ still works on layouts where "/" needs Shift', () => {
    expect(
      matchShortcut(key('/', { ctrlKey: true, shiftKey: true }), false),
    ).toBe('toggleHelp');
  });

  it('Ctrl+ArrowRight → nextTab', () => {
    expect(matchShortcut(key('ArrowRight', { ctrlKey: true }), false)).toBe(
      'nextTab',
    );
  });

  it('modifier combos still fire while typing in a field', () => {
    expect(matchShortcut(key('k', { ctrlKey: true }), true)).toBe('focusInput');
    expect(matchShortcut(key('Enter', { metaKey: true }), true)).toBe('submit');
    expect(
      matchShortcut(key('S', { ctrlKey: true, shiftKey: true }), true),
    ).toBe('sign');
  });
});

/* ------------------------------------------------------------------ */
/* matchShortcut — guards                                              */
/* ------------------------------------------------------------------ */

describe('matchShortcut guards', () => {
  it('plain single letters never fire while typing in a field', () => {
    for (const k of ['k', 's', 'a', '/', 'K']) {
      expect(matchShortcut(key(k), true)).toBeNull();
    }
  });

  it('Escape works even while typing in a field', () => {
    expect(matchShortcut(key('Escape'), true)).toBe('discard');
  });

  it('unknown keys return null', () => {
    expect(matchShortcut(key('q', { ctrlKey: true }), false)).toBeNull();
    expect(matchShortcut(key('F5'), false)).toBeNull();
    expect(matchShortcut(key('x'), false)).toBeNull();
    expect(matchShortcut(key('ArrowLeft', { ctrlKey: true }), false)).toBeNull();
  });

  it('Ctrl+S without Shift is not sign', () => {
    expect(matchShortcut(key('s', { ctrlKey: true }), false)).toBeNull();
  });

  it('plain Enter is not submit', () => {
    expect(matchShortcut(key('Enter'), false)).toBeNull();
  });

  it('Alt combos are ignored (protects AltGr typing)', () => {
    expect(
      matchShortcut(key('k', { ctrlKey: true, altKey: true }), false),
    ).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/* installShortcuts                                                    */
/* ------------------------------------------------------------------ */

describe('installShortcuts', () => {
  it('registers one keydown listener and unregisters it on unsubscribe', () => {
    const win = makeFakeWindow();
    const unsubscribe = installShortcuts(win.target, {});

    expect(win.listeners.get('keydown')).toHaveLength(1);

    unsubscribe();
    expect(win.listeners.get('keydown')).toHaveLength(0);
  });

  it('invokes the matching handler', () => {
    const win = makeFakeWindow();
    const handlers: ShortcutHandlers = {
      focusInput: vi.fn(),
      submit: vi.fn(),
    };
    installShortcuts(win.target, handlers);

    win.dispatch({ ...key('k', { ctrlKey: true }), preventDefault: vi.fn() });

    expect(handlers.focusInput).toHaveBeenCalledTimes(1);
    expect(handlers.submit).not.toHaveBeenCalled();
  });

  it('stops calling handlers after unsubscribe', () => {
    const win = makeFakeWindow();
    const focusInput = vi.fn();
    const unsubscribe = installShortcuts(win.target, { focusInput });

    unsubscribe();
    win.dispatch({ ...key('k', { ctrlKey: true }), preventDefault: vi.fn() });

    expect(focusInput).not.toHaveBeenCalled();
  });

  it('a matched shortcut with no handler is a safe no-op', () => {
    const win = makeFakeWindow();
    const preventDefault = vi.fn();
    installShortcuts(win.target, {});

    expect(() => {
      win.dispatch({ ...key('k', { ctrlKey: true }), preventDefault });
    }).not.toThrow();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('calls preventDefault only when it handled something', () => {
    const win = makeFakeWindow();
    const discard = vi.fn();
    installShortcuts(win.target, { discard });

    const matched = vi.fn();
    win.dispatch({ ...key('Escape'), preventDefault: matched });
    expect(matched).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledTimes(1);

    const unmatched = vi.fn();
    win.dispatch({ ...key('x'), preventDefault: unmatched });
    expect(unmatched).not.toHaveBeenCalled();
  });

  it('survives events without preventDefault', () => {
    const win = makeFakeWindow();
    const discard = vi.fn();
    installShortcuts(win.target, { discard });

    expect(() => {
      win.dispatch(key('Escape'));
    }).not.toThrow();
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it('does not steal plain letters typed in an input', () => {
    const win = makeFakeWindow();
    const sign = vi.fn();
    const focusInput = vi.fn();
    installShortcuts(win.target, { sign, focusInput });

    const preventDefault = vi.fn();
    win.dispatch({
      ...key('k'),
      preventDefault,
      target: { tagName: 'INPUT' },
    });
    win.dispatch({
      ...key('s'),
      preventDefault,
      target: { tagName: 'TEXTAREA' },
    });

    expect(sign).not.toHaveBeenCalled();
    expect(focusInput).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('modifier combos still fire from inside an input', () => {
    const win = makeFakeWindow();
    const submit = vi.fn();
    installShortcuts(win.target, { submit });

    win.dispatch({
      ...key('Enter', { ctrlKey: true }),
      preventDefault: vi.fn(),
      target: { tagName: 'INPUT' },
    });

    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed events without a key', () => {
    const win = makeFakeWindow();
    const discard = vi.fn();
    installShortcuts(win.target, { discard });

    expect(() => {
      win.dispatch({});
      win.dispatch(null);
    }).not.toThrow();
    expect(discard).not.toHaveBeenCalled();
  });
});
