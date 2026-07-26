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
  'nav.sign': 'Signatures',
  'nav.observer': 'Observer',

  /* Intent console */
  'console.label': 'Intent console',
  'console.placeholder': 'Tell me what you want to do — e.g. "send 0.1 MON to 0xabc…"',
  'console.prepare': 'Prepare',
  'console.preparing': 'Preparing…',
  'console.busy': 'building · simulating · assessing risk',
  'console.inputAria': 'What do you want to do on Monad?',
  'console.parsedByAi': 'parsed by Claude',
  'console.parsedByRules': 'parsed by rules',
  'console.share': 'Share',
  'console.shareCopied': 'Link copied ✓',
  'console.shareTitle': 'Copy a link that opens this exact instruction for someone else',

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
  'plan.waitingWallet': 'Waiting for your wallet…',
  'plan.aiLabel': 'AI co-pilot · written by Claude from the simulated facts above',
  'sr.danger': 'Serious warning:',
  'sr.caution': 'Caution:',
  'sr.info': 'Note:',

  /* Post-flight verification */
  'postflight.label': 'Post-flight · simulation vs on-chain reality',
  'postflight.matched': 'Reality matched the simulation',
  'postflight.differed': 'Reality differed from the simulation — read below',
  'postflight.newFlight': 'New flight',
  'postflight.colCheck': 'Check',
  'postflight.colSimulated': 'Simulated',
  'postflight.colActual': 'Actual',
  'postflight.matchedPartial': 'Everything we could check matched the simulation',
  'postflight.srMatched': 'verified as matching',
  'postflight.srMismatched': 'does not match',
  'postflight.srUnverified': 'could not be verified',
  'postflight.viewExplorer': 'View on MonadVision ↗',

  /* Approval hangar */
  'hangar.label': 'Hangar · who can spend your tokens',
  'hangar.scan': 'Scan my approvals',
  'hangar.scanning': 'Scanning the chain…',
  'hangar.rescan': 'Scan again',
  'hangar.none':
    'No live approvals found in the scanned range — nobody we saw can currently spend your tokens.',
  'hangar.revoke': 'Revoke',
  'hangar.connectFirst': 'Connect your wallet to scan its token approvals.',
  'hangar.incomplete':
    'We found no approvals, but parts of this scan failed — so this is not a clean bill of health. Scan again before trusting it.',
  'hangar.unlimited': 'UNLIMITED {symbol}',
  'hangar.spendableBy': 'spendable by',
  'hangar.busy': 'reading Approval events block by block',

  /* Flight log */
  'log.label': 'Flight log · this browser, this network',
  'log.empty': 'No flights yet — sign your first transaction and it lands here.',
  'log.clear': 'Clear log',
  'log.verified': 'verified ✓',
  'log.differed': 'differed ✗',
  'log.reverted': 'failed on-chain',
  'log.landed': 'landed',
  'log.explorer': 'explorer ↗',

  /* Journey queue (multi-leg plans) */
  'queue.label': 'Journey · one signature per step, never bundled',
  'queue.hint':
    'Each step gets its own simulation, its own explanation, and its own wallet confirmation.',
  'queue.progress': 'Step {n} of {total} · {signed} signed, {remaining} waiting',
  'queue.done': 'All {total} steps finished',
  'queue.continue': 'Continue — prepare step {n}',
  'queue.skip': 'Skip this step',
  'queue.abandon': 'Abandon the rest',
  'queue.skippedNote': 'Skipped by you.',
  'queue.failedNote': 'Failed on-chain.',
  'queue.sentNote':
    'Sent, but we lost track of it — check the explorer before continuing.',
  'queue.dismiss': 'Dismiss journey',
  'queue.finishFirst':
    'A journey is underway. Continue it, skip the current step, or abandon the rest before preparing something new.',
  'queue.truncated':
    'That instruction had {given} steps — a journey carries at most {max}, so the last {dropped} were left out.',

  /* In-flight / sent phase panels */
  'phase.inFlight': 'In flight',
  'phase.waiting': 'waiting for the transaction to land on Monad…',
  'phase.sentLabel': 'Sent — outcome unknown',
  'phase.sentBody':
    'We stopped waiting, but the transaction is already on the network. Do not send it again until you have checked the explorer.',
  'phase.track': 'Track on MonadVision ↗',
  'phase.startNew': 'Start a new flight',

  /* Shared-link network hint */
  'share.mismatch':
    'This link was shared for {shared}, but you are on {current}. We did not switch for you.',
  'share.switch': 'Switch to {network}',
  'share.stay': 'Stay on {network}',

  /* Settings drawer */
  'settings.label': 'Settings — AI co-pilot & tokens',
  'settings.apiKey':
    'Anthropic API key (optional — turns on the AI co-pilot; stored only in this browser)',
  'settings.proxyUrl':
    'AI proxy address (alternative for production — your key stays on your own server)',
  'settings.addToken': 'Teach PreFlight a token — paste its contract address',
  'settings.add': 'Add',
  'settings.reading': 'Reading…',
  'settings.title': 'Settings — AI, tokens & contacts',
  'settings.aiOn': 'AI on',
  'settings.aiOff': 'AI off (rule-based mode)',
  'settings.tokenOne': '1 token',
  'settings.tokensMany': '{count} tokens',
  'settings.contactOne': '1 contact',
  'settings.contactsMany': '{count} contacts',
  'settings.knownTokens': 'Known tokens:',
  'settings.saveContact': 'Save a contact — then just say "send 1 MON to alice"',
  'settings.save': 'Save',
  'settings.remove': 'Remove',
  'settings.localOnly':
    'Everything on this panel is stored in your browser only. PreFlight has no server and no account.',

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
  'footer.keyFocus': 'focus',
  'footer.keyPrepare': 'prepare',
  'footer.keyNextTab': 'next tab',

  /* Risk severities */
  'severity.danger': 'Danger',
  'severity.caution': 'Caution',
  'severity.info': 'Info',

  /* Errors and hints */
  'error.declined': 'You declined in your wallet — nothing was sent.',
  'error.accountSwitched':
    'Your wallet switched accounts, so the prepared transaction was cleared. Prepare it again if you still want it.',
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
  'nav.sign': '签名',
  'nav.observer': '观察',

  /* Intent console */
  'console.label': '指令控制台',
  'console.placeholder': '想做什么直接说，例如“发送 0.1 MON 到 0xabc…”',
  'console.prepare': '准备交易',
  'console.preparing': '准备中…',
  'console.busy': '构建 · 模拟 · 评估风险',
  'console.inputAria': '你想在 Monad 上做什么？',
  'console.parsedByAi': '由 Claude 解析',
  'console.parsedByRules': '由规则解析',
  'console.share': '分享',
  'console.shareCopied': '链接已复制 ✓',
  'console.shareTitle': '复制一个链接，别人打开就能看到这条指令',

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
  'plan.waitingWallet': '等待钱包确认…',
  'plan.aiLabel': 'AI 副驾 · 由 Claude 根据上方模拟事实撰写',
  'sr.danger': '严重警告：',
  'sr.caution': '注意：',
  'sr.info': '提示：',

  /* Post-flight verification */
  'postflight.label': '落地核对 · 模拟与链上实际对比',
  'postflight.matched': '实际结果与模拟一致',
  'postflight.differed': '实际结果与模拟不一致，请看下方明细',
  'postflight.newFlight': '再来一笔',
  'postflight.colCheck': '检查项',
  'postflight.colSimulated': '模拟',
  'postflight.colActual': '实际',
  'postflight.matchedPartial': '能核对的项目都与模拟一致',
  'postflight.srMatched': '已核实一致',
  'postflight.srMismatched': '不一致',
  'postflight.srUnverified': '无法核实',
  'postflight.viewExplorer': '在 MonadVision 上查看 ↗',

  /* Approval hangar */
  'hangar.label': '机库 · 谁能动用你的代币',
  'hangar.scan': '扫描我的授权',
  'hangar.scanning': '正在扫描…',
  'hangar.rescan': '重新扫描',
  'hangar.none': '扫描到的范围内没有发现有效授权——就我们看到的而言，没有人能动用你的代币。',
  'hangar.revoke': '撤销',
  'hangar.connectFirst': '先连接钱包，才能扫描代币授权。',
  'hangar.incomplete':
    '没有发现授权，但这次扫描有部分失败——不能当作安全证明，请重新扫描后再下结论。',
  'hangar.unlimited': '无限量 {symbol}',
  'hangar.spendableBy': '可动用者',
  'hangar.busy': '正在逐段读取链上的授权事件',

  /* Flight log */
  'log.label': '飞行日志 · 仅存于本浏览器和当前网络',
  'log.empty': '还没有记录——签名第一笔交易后，就会出现在这里。',
  'log.clear': '清空日志',
  'log.verified': '已验证 ✓',
  'log.differed': '有出入 ✗',
  'log.reverted': '执行失败',
  'log.landed': '已上链',
  'log.explorer': '区块浏览器 ↗',

  /* Journey queue (multi-leg plans) */
  'queue.label': '多步旅程 · 每步单独签名，绝不打包',
  'queue.hint': '每一步都会单独模拟、单独解释、单独在钱包里确认。',
  'queue.progress': '第 {n}/{total} 步 · 已签 {signed}，待办 {remaining}',
  'queue.done': '全部 {total} 步已结束',
  'queue.continue': '继续——准备第 {n} 步',
  'queue.skip': '跳过这一步',
  'queue.abandon': '放弃剩余步骤',
  'queue.skippedNote': '你选择了跳过。',
  'queue.failedNote': '链上执行失败。',
  'queue.sentNote': '已发送但未确认——继续之前请先查看区块浏览器。',
  'queue.dismiss': '收起旅程',
  'queue.finishFirst':
    '当前旅程尚未结束。请先继续、跳过当前步骤，或放弃剩余步骤，再准备新的操作。',
  'queue.truncated':
    '这条指令共有 {given} 步——一次旅程最多 {max} 步，最后 {dropped} 步没有包含进来。',

  /* In-flight / sent phase panels */
  'phase.inFlight': '飞行中',
  'phase.waiting': '等待交易在 Monad 上确认…',
  'phase.sentLabel': '已发送 · 结果未知',
  'phase.sentBody':
    '我们停止了等待，但交易已经在网络上。在区块浏览器里确认结果之前，请不要重复发送。',
  'phase.track': '在 MonadVision 上追踪 ↗',
  'phase.startNew': '开始新的一笔',

  /* Shared-link network hint */
  'share.mismatch':
    '这个链接是为 {shared} 分享的，而你正在 {current}。我们没有替你切换。',
  'share.switch': '切换到 {network}',
  'share.stay': '留在 {network}',

  /* Settings drawer */
  'settings.label': '设置 · AI 副驾与代币',
  'settings.apiKey': 'Anthropic API 密钥（可选，用于开启 AI 副驾；只保存在本浏览器）',
  'settings.proxyUrl': 'AI 代理地址（生产环境的替代方案，密钥保存在你自己的服务器上）',
  'settings.addToken': '添加代币——粘贴它的合约地址',
  'settings.add': '添加',
  'settings.reading': '读取中…',
  'settings.title': '设置 · AI、代币与联系人',
  'settings.aiOn': 'AI 已开启',
  'settings.aiOff': 'AI 关闭（规则模式）',
  'settings.tokenOne': '1 个代币',
  'settings.tokensMany': '{count} 个代币',
  'settings.contactOne': '1 位联系人',
  'settings.contactsMany': '{count} 位联系人',
  'settings.knownTokens': '已知代币：',
  'settings.saveContact': '保存联系人——之后直接说“发送 1 MON 给 alice”',
  'settings.save': '保存',
  'settings.remove': '移除',
  'settings.localOnly':
    '本面板的所有内容只保存在你的浏览器里。PreFlight 没有服务器，也没有账号。',

  /* Trace deep-dive */
  'trace.summary': '底层细节 · 调用轨迹（{count} 次调用）',
  'trace.events': '触发的事件',

  /* Report */
  'report.copy': '复制报告',
  'report.copied': '已复制 ✓',

  /* Footer */
  'footer.simNote': '在 {network} 实时模拟 · 私钥不离开你的钱包 · 结果仅供参考，并非保证',
  'footer.faucet': '需要测试 MON？免费领取',
  'footer.keyFocus': '聚焦',
  'footer.keyPrepare': '准备',
  'footer.keyNextTab': '切换标签',

  /* Risk severities */
  'severity.danger': '危险',
  'severity.caution': '注意',
  'severity.info': '提示',

  /* Errors and hints */
  'error.declined': '你在钱包里取消了签名，什么也没有发送。',
  'error.accountSwitched':
    '钱包切换了账户，已清除准备好的交易。如仍需要，请重新准备。',
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
