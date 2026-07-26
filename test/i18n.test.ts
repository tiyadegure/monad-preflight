import { describe, expect, it } from 'vitest';
import { DICTS, LANG_STORAGE_KEY, detectLang, saveLang, t } from '../src/lib/i18n';
import type { Lang, StorageLike } from '../src/lib/i18n';

/* ------------------------------------------------------------------ */
/* Fixtures and helpers                                                */
/* ------------------------------------------------------------------ */

const LANGS: readonly Lang[] = ['en', 'zh'];

/** Every key the UI depends on. Both dictionaries must cover all of them. */
const REQUIRED_KEYS = [
  'app.tagline',
  'app.brandName',
  'nav.fly',
  'nav.hangar',
  'nav.log',
  'nav.sign',
  'nav.observer',
  'console.label',
  'console.placeholder',
  'console.prepare',
  'console.preparing',
  'console.busy',
  'console.inputAria',
  'console.parsedByAi',
  'console.parsedByRules',
  'console.share',
  'console.shareCopied',
  'console.shareTitle',
  'status.connect',
  'status.connecting',
  'status.noWallet',
  'status.switchTo',
  'status.realFunds',
  'plan.label',
  'plan.signButton',
  'plan.signAnyway',
  'plan.discard',
  'plan.keysNote',
  'plan.waitingWallet',
  'plan.aiLabel',
  'sr.danger',
  'sr.caution',
  'sr.info',
  'postflight.label',
  'postflight.matched',
  'postflight.differed',
  'postflight.newFlight',
  'postflight.colCheck',
  'postflight.colSimulated',
  'postflight.colActual',
  'postflight.matchedPartial',
  'postflight.srMatched',
  'postflight.srMismatched',
  'postflight.srUnverified',
  'postflight.viewExplorer',
  'hangar.label',
  'hangar.scan',
  'hangar.scanning',
  'hangar.rescan',
  'hangar.none',
  'hangar.revoke',
  'hangar.connectFirst',
  'hangar.incomplete',
  'hangar.unlimited',
  'hangar.spendableBy',
  'hangar.busy',
  'log.label',
  'log.empty',
  'log.clear',
  'log.verified',
  'log.differed',
  'log.reverted',
  'log.landed',
  'log.explorer',
  'queue.label',
  'queue.hint',
  'queue.progress',
  'queue.done',
  'queue.continue',
  'queue.skip',
  'queue.abandon',
  'queue.skippedNote',
  'queue.failedNote',
  'queue.sentNote',
  'queue.dismiss',
  'queue.finishFirst',
  'queue.truncated',
  'phase.inFlight',
  'phase.waiting',
  'phase.sentLabel',
  'phase.sentBody',
  'phase.track',
  'phase.startNew',
  'share.mismatch',
  'share.switch',
  'share.stay',
  'settings.label',
  'settings.apiKey',
  'settings.proxyUrl',
  'settings.addToken',
  'settings.add',
  'settings.reading',
  'settings.title',
  'settings.aiOn',
  'settings.aiOff',
  'settings.tokenOne',
  'settings.tokensMany',
  'settings.contactOne',
  'settings.contactsMany',
  'settings.knownTokens',
  'settings.saveContact',
  'settings.save',
  'settings.remove',
  'settings.localOnly',
  'trace.summary',
  'trace.events',
  'report.copy',
  'report.copied',
  'footer.simNote',
  'footer.faucet',
  'footer.keyFocus',
  'footer.keyPrepare',
  'footer.keyNextTab',
  'severity.danger',
  'severity.caution',
  'severity.info',
  'error.declined',
  'error.noWalletHint',
  'error.connectHint',
  'error.accountSwitched',
] as const;

interface FakeStorage extends StorageLike {
  map: Map<string, string>;
}

function makeStorage(initial: Record<string, string> = {}): FakeStorage {
  const map = new Map(Object.entries(initial));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function throwingStorage(): StorageLike {
  return {
    getItem: () => {
      throw new Error('storage blocked');
    },
    setItem: () => {
      throw new Error('storage blocked');
    },
  };
}

/* ------------------------------------------------------------------ */
/* Dictionaries                                                        */
/* ------------------------------------------------------------------ */

describe('DICTS completeness', () => {
  it('zh has every en key — no missing translations', () => {
    for (const key of Object.keys(DICTS.en)) {
      expect(DICTS.zh[key], `zh is missing "${key}"`).toBeTypeOf('string');
      expect(DICTS.zh[key]!.length, `zh."${key}" is empty`).toBeGreaterThan(0);
    }
  });

  it('en has every zh key — no orphans', () => {
    for (const key of Object.keys(DICTS.zh)) {
      expect(DICTS.en[key], `en is missing "${key}"`).toBeTypeOf('string');
      expect(DICTS.en[key]!.length, `en."${key}" is empty`).toBeGreaterThan(0);
    }
  });

  it('covers every key the UI needs, in both languages', () => {
    for (const lang of LANGS) {
      for (const key of REQUIRED_KEYS) {
        expect(DICTS[lang][key], `${lang} is missing "${key}"`).toBeTypeOf('string');
      }
    }
  });

  it('keeps placeholders consistent between the two languages', () => {
    const placeholders = (s: string) =>
      [...s.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(DICTS.en)) {
      expect(placeholders(DICTS.zh[key] ?? ''), `placeholder mismatch in "${key}"`).toEqual(
        placeholders(DICTS.en[key] ?? ''),
      );
    }
  });
});

/* ------------------------------------------------------------------ */
/* t — lookup, fallback, interpolation                                 */
/* ------------------------------------------------------------------ */

describe('t lookup', () => {
  it('returns the string for the requested language', () => {
    expect(t('en', 'severity.danger')).toBe('Danger');
    expect(t('zh', 'severity.danger')).toBe('危险');
  });

  it('falls back zh → en when a key is missing from zh', () => {
    DICTS.en['test.enOnly'] = 'English only';
    try {
      expect(t('zh', 'test.enOnly')).toBe('English only');
    } finally {
      delete DICTS.en['test.enOnly'];
    }
  });

  it('falls back to the key itself when missing from both dictionaries', () => {
    expect(t('zh', 'no.such.key')).toBe('no.such.key');
    expect(t('en', 'no.such.key')).toBe('no.such.key');
  });
});

describe('t interpolation', () => {
  it('fills {name} placeholders from vars, including numbers and repeats', () => {
    DICTS.en['test.tpl'] = '{name} has {count} — yes, {count}';
    try {
      expect(t('en', 'test.tpl', { name: 'Ada', count: 2 })).toBe(
        'Ada has 2 — yes, 2',
      );
      expect(t('en', 'test.tpl', { name: 'Ada', count: 0 })).toBe(
        'Ada has 0 — yes, 0',
      );
    } finally {
      delete DICTS.en['test.tpl'];
    }
  });

  it('leaves unknown placeholders untouched', () => {
    DICTS.en['test.tpl2'] = '{known} and {unknown}';
    try {
      expect(t('en', 'test.tpl2', { known: 'x' })).toBe('x and {unknown}');
      expect(t('en', 'test.tpl2')).toBe('{known} and {unknown}');
    } finally {
      delete DICTS.en['test.tpl2'];
    }
  });

  it('interpolates real UI keys in both languages', () => {
    for (const lang of LANGS) {
      const s = t(lang, 'status.switchTo', { network: 'Monad Testnet' });
      expect(s).toContain('Monad Testnet');
      expect(s).not.toContain('{network}');
    }
  });
});

/* ------------------------------------------------------------------ */
/* detectLang                                                          */
/* ------------------------------------------------------------------ */

describe('detectLang', () => {
  it('picks zh when the first navigator language starts with "zh"', () => {
    expect(detectLang(['zh-CN'], makeStorage())).toBe('zh');
    expect(detectLang(['zh-Hans-CN', 'en-US'], makeStorage())).toBe('zh');
  });

  it('picks en for a non-Chinese first language', () => {
    expect(detectLang(['en-US'], makeStorage())).toBe('en');
  });

  it('defaults to en when the language list is empty', () => {
    expect(detectLang([], makeStorage())).toBe('en');
  });

  it('lets a stored choice win over the navigator', () => {
    expect(detectLang(['en-US'], makeStorage({ [LANG_STORAGE_KEY]: 'zh' }))).toBe('zh');
    expect(detectLang(['zh-CN'], makeStorage({ [LANG_STORAGE_KEY]: 'en' }))).toBe('en');
  });

  it('ignores stored garbage and falls back to the navigator', () => {
    expect(detectLang(['en-US'], makeStorage({ [LANG_STORAGE_KEY]: 'klingon' }))).toBe('en');
    expect(detectLang(['zh-CN'], makeStorage({ [LANG_STORAGE_KEY]: '' }))).toBe('zh');
  });

  it('survives a storage that throws on read', () => {
    expect(detectLang(['zh-CN'], throwingStorage())).toBe('zh');
    expect(detectLang(['en-US'], throwingStorage())).toBe('en');
  });
});

/* ------------------------------------------------------------------ */
/* saveLang                                                            */
/* ------------------------------------------------------------------ */

describe('saveLang', () => {
  it('writes the choice under "preflight.lang"', () => {
    const storage = makeStorage();
    saveLang('zh', storage);
    expect(storage.map.get('preflight.lang')).toBe('zh');
    saveLang('en', storage);
    expect(storage.map.get('preflight.lang')).toBe('en');
    expect(storage.map.size).toBe(1);
  });

  it('round-trips: what saveLang stores, detectLang honors', () => {
    const storage = makeStorage();
    saveLang('zh', storage);
    expect(detectLang(['en-US'], storage)).toBe('zh');
  });

  it('does not throw when storage rejects the write', () => {
    expect(() => saveLang('zh', throwingStorage())).not.toThrow();
  });
});
