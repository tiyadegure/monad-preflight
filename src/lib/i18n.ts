/**
 * Bilingual UI strings for Monad PreFlight (English + Simplified Chinese).
 *
 * - `detectLang` picks the language: a stored choice wins, otherwise the
 *   first navigator language decides, otherwise English.
 * - `t` looks a key up in the chosen dictionary, falls back to English,
 *   and finally to the key itself — a missing key is visible, never a crash.
 * - `{name}` placeholders are filled from `vars`; unknown placeholders are
 *   left untouched so a typo shows up in the UI instead of vanishing.
 *
 * Storage access is injected (`StorageLike`) so tests run without a browser;
 * nothing here touches localStorage at module load time.
 */

export type Lang = 'en' | 'zh';

export interface Dict {
  [key: string]: string;
}

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

/** localStorage key where the user's language choice persists. */
export const LANG_STORAGE_KEY = 'preflight.lang';

const en: Dict = {
  /* App shell */
  'app.tagline':
    'Say what you want to do. PreFlight prepares the transaction, simulates it on {network}, and explains it in plain language — then you decide whether to sign.',
  'app.brandName': 'Monad PreFlight',

  /* Navigation */
  'nav.fly': 'Fly',
  'nav.hangar': 'Hangar',
  'nav.log': 'Log',

  /* Intent console */
  'console.label': 'Intent console',
  'console.placeholder': 'Tell me what you want to do — e.g. "send 0.1 MON to 0xabc…"',
  'console.prepare': 'Prepare',
  'console.preparing': 'Preparing…',
  'console.busy': 'building · simulating · assessing risk',

  /* Status strip */
  'status.connect': 'Connect wallet',
  'status.connecting': 'Connecting…',
  'status.noWallet': 'No wallet found',
  'status.switchTo': 'Switch wallet to {network}',
  'status.realFunds': 'real funds',

  /* Flight plan */
  'plan.label': 'Flight plan · simulated before you sign',
  'plan.signButton': 'Looks right — sign in wallet',
  'plan.signAnyway': 'Sign anyway (not recommended)',
  'plan.discard': 'Discard',
  'plan.keysNote':
    'PreFlight never touches your keys — your wallet shows the final confirmation.',

  /* Post-flight verification */
  'postflight.label': 'Post-flight · simulation vs on-chain reality',
  'postflight.matched': 'Reality matched the simulation',
  'postflight.differed': 'Reality differed from the simulation — read below',
  'postflight.newFlight': 'New flight',
  'postflight.colCheck': 'Check',
  'postflight.colSimulated': 'Simulated',
  'postflight.colActual': 'Actual',

  /* Approval hangar */
  'hangar.label': 'Hangar · who can spend your tokens',
  'hangar.scan': 'Scan my approvals',
  'hangar.scanning': 'Scanning the chain…',
  'hangar.rescan': 'Scan again',
  'hangar.none':
    'No live approvals found in the scanned range — nobody we saw can currently spend your tokens.',
  'hangar.revoke': 'Revoke',
  'hangar.connectFirst': 'Connect your wallet to scan its token approvals.',

  /* Flight log */
  'log.label': 'Flight log · this browser, this network',
  'log.empty': 'No flights yet — sign your first transaction and it lands here.',
  'log.clear': 'Clear log',
  'log.verified': 'verified ✓',
  'log.differed': 'differed ✗',
  'log.reverted': 'failed on-chain',

  /* Settings drawer */
  'settings.label': 'Settings — AI co-pilot & tokens',
  'settings.apiKey':
    'Anthropic API key (optional — turns on the AI co-pilot; stored only in this browser)',
  'settings.proxyUrl':
    'AI proxy address (alternative for production — your key stays on your own server)',
  'settings.addToken': 'Teach PreFlight a token — paste its contract address',
  'settings.add': 'Add',
  'settings.reading': 'Reading…',

  /* Trace deep-dive */
  'trace.summary': 'Instrument deep-dive · call trace ({count} calls)',
  'trace.events': 'Events emitted',

  /* Report */
  'report.copy': 'Copy report',
  'report.copied': 'Copied ✓',

  /* Footer */
  'footer.simNote':
    'Simulated live on {network} · your keys never leave your wallet · a preview, not a guarantee',
  'footer.faucet': 'Need test MON? Get some from the faucet',

  /* Risk severities */
  'severity.danger': 'Danger',
  'severity.caution': 'Caution',
  'severity.info': 'Info',

  /* Errors and hints */
  'error.declined': 'You declined in your wallet — nothing was sent.',
  'error.noWalletHint':
    'Install a browser wallet (e.g. MetaMask) to prepare and sign transactions.',
  'error.connectHint':
    'Connect your wallet first — PreFlight simulates from your own account.',
};

const zh: Dict = {
  /* App shell */
  'app.tagline':
    '说出你想做什么。PreFlight 会替你准备交易，在 {network} 上先模拟一遍，再用大白话讲清楚——签不签，由你决定。',
  'app.brandName': 'Monad PreFlight',

  /* Navigation */
  'nav.fly': '飞行',
  'nav.hangar': '机库',
  'nav.log': '日志',

  /* Intent console */
  'console.label': '指令控制台',
  'console.placeholder': '想做什么直接说，例如“发送 0.1 MON 到 0xabc…”',
  'console.prepare': '准备交易',
  'console.preparing': '准备中…',
  'console.busy': '构建 · 模拟 · 评估风险',

  /* Status strip */
  'status.connect': '连接钱包',
  'status.connecting': '连接中…',
  'status.noWallet': '未检测到钱包',
  'status.switchTo': '切换到 {network}',
  'status.realFunds': '真实资金',

  /* Flight plan */
  'plan.label': '飞行计划 · 签名前先模拟',
  'plan.signButton': '确认无误，去钱包签名',
  'plan.signAnyway': '仍要签名（不建议）',
  'plan.discard': '放弃',
  'plan.keysNote': 'PreFlight 不会接触你的私钥，最终确认在你的钱包里完成。',

  /* Post-flight verification */
  'postflight.label': '落地核对 · 模拟与链上实际对比',
  'postflight.matched': '实际结果与模拟一致',
  'postflight.differed': '实际结果与模拟不一致，请看下方明细',
  'postflight.newFlight': '再来一笔',
  'postflight.colCheck': '检查项',
  'postflight.colSimulated': '模拟',
  'postflight.colActual': '实际',

  /* Approval hangar */
  'hangar.label': '机库 · 谁能动用你的代币',
  'hangar.scan': '扫描我的授权',
  'hangar.scanning': '正在扫描…',
  'hangar.rescan': '重新扫描',
  'hangar.none': '扫描范围内没有发现有效授权，目前没有人能动用你的代币。',
  'hangar.revoke': '撤销',
  'hangar.connectFirst': '先连接钱包，才能扫描代币授权。',

  /* Flight log */
  'log.label': '飞行日志 · 仅存于本浏览器和当前网络',
  'log.empty': '还没有记录——签名第一笔交易后，就会出现在这里。',
  'log.clear': '清空日志',
  'log.verified': '已验证 ✓',
  'log.differed': '有出入 ✗',
  'log.reverted': '执行失败',

  /* Settings drawer */
  'settings.label': '设置 · AI 副驾与代币',
  'settings.apiKey': 'Anthropic API 密钥（可选，用于开启 AI 副驾；只保存在本浏览器）',
  'settings.proxyUrl': 'AI 代理地址（生产环境的替代方案，密钥保存在你自己的服务器上）',
  'settings.addToken': '添加代币——粘贴它的合约地址',
  'settings.add': '添加',
  'settings.reading': '读取中…',

  /* Trace deep-dive */
  'trace.summary': '底层细节 · 调用轨迹（{count} 次调用）',
  'trace.events': '触发的事件',

  /* Report */
  'report.copy': '复制报告',
  'report.copied': '已复制 ✓',

  /* Footer */
  'footer.simNote': '在 {network} 实时模拟 · 私钥不离开你的钱包 · 结果仅供参考，并非保证',
  'footer.faucet': '需要测试 MON？免费领取',

  /* Risk severities */
  'severity.danger': '危险',
  'severity.caution': '注意',
  'severity.info': '提示',

  /* Errors and hints */
  'error.declined': '你在钱包里取消了签名，什么也没有发送。',
  'error.noWalletHint': '请先安装浏览器钱包（如 MetaMask），才能准备和签名交易。',
  'error.connectHint': '请先连接钱包——PreFlight 会用你自己的账户进行模拟。',
};

export const DICTS: Record<Lang, Dict> = { en, zh };

function isLang(value: unknown): value is Lang {
  return value === 'en' || value === 'zh';
}

/**
 * The browser's localStorage, when one exists. Resolved at call time — never
 * at import time — so node tests and injected fakes are unaffected. Guarded
 * because some privacy modes throw on mere access.
 */
function defaultStorage(): StorageLike | undefined {
  try {
    return (globalThis as { localStorage?: StorageLike }).localStorage;
  } catch {
    return undefined;
  }
}

function defaultNavigatorLanguages(): readonly string[] | undefined {
  const nav = (
    globalThis as { navigator?: { languages?: readonly string[]; language?: string } }
  ).navigator;
  if (!nav) return undefined;
  if (nav.languages && nav.languages.length > 0) return nav.languages;
  return nav.language ? [nav.language] : undefined;
}

/**
 * Decide which language to show. A stored choice always wins; otherwise the
 * user's first preferred browser language decides (`zh*` → Chinese); English
 * is the fallback. Both inputs are injectable for tests.
 */
export function detectLang(
  navigatorLanguages?: readonly string[],
  storage?: StorageLike,
): Lang {
  const store = storage ?? defaultStorage();
  if (store) {
    try {
      const stored = store.getItem(LANG_STORAGE_KEY);
      if (isLang(stored)) return stored;
    } catch {
      /* unreadable storage — fall through to the navigator */
    }
  }
  const languages = navigatorLanguages ?? defaultNavigatorLanguages();
  const first = languages?.[0];
  if (first && first.toLowerCase().startsWith('zh')) return 'zh';
  return 'en';
}

/** Persist the user's language choice under `preflight.lang`. */
export function saveLang(lang: Lang, storage?: StorageLike): void {
  const store = storage ?? defaultStorage();
  if (!store) return;
  try {
    store.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* storage full or blocked — the choice simply won't persist */
  }
}

/**
 * Translate `key` into `lang`, filling `{name}` placeholders from `vars`.
 * Lookup order: requested language → English → the key itself.
 * Placeholders without a matching var are left untouched.
 */
export function t(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const template = DICTS[lang][key] ?? DICTS.en[key] ?? key;
  if (!vars) return template;
  return template.replace(/\{([A-Za-z0-9_]+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : match,
  );
}
