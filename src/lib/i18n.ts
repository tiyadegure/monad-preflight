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
  'app.workspaceAria': 'Workspace',

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
  'status.networkAria': 'Network',
  'status.languageAria': 'Language',
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
  'plan.timing':
    'Full live check in {total} ms on Monad — simulation {sim} ms · on-chain reads {facts} ms (your network round-trips included)',
  'sr.danger': 'Serious warning:',
  'sr.caution': 'Caution:',
  'sr.info': 'Note:',

  /* Post-flight verification */
  'postflight.label': 'Post-flight · simulation vs on-chain reality',
  'postflight.ariaLabel': 'Post-flight verification',
  'postflight.matchAria': 'Match',
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
  'queue.ariaLabel': 'Journey',
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
  'settings.ariaLabel': 'Settings',
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
  'settings.contactNameAria': 'Contact name',
  'settings.contactAddressAria': 'Contact address',
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

  /* App-level errors and notes */
  'app.invalidContractAddress':
    'That is not a valid contract address (0x + 40 hex characters).',
  'app.couldNotUnderstand': 'Could not understand that.',
  'app.tryOneOfThese': 'Try one of these:',
  'app.planWrongNetwork':
    'This plan was prepared on {prepared} but you are now on {current}. Prepare it again so it can be checked against the network you are actually using.',
  'app.planWrongAccount':
    'This plan was prepared for a different account than your wallet is using now. Prepare it again.',
  'app.lostTrack':
    'Your transaction was sent, but we lost track of it before it landed. It may still confirm — check the explorer link below before trying again.',
  'app.clipboardBlocked': 'Could not copy — your browser blocked clipboard access.',
  'app.bookNameNote': '"{name}" is your saved name for {address}.',

  /* Observer panel */
  'observer.ariaLabel': 'Observer mode',
  'observer.label': 'Observer · inspect any address, read only',
  'observer.hint':
    "No wallet needed. Check what an address holds and who can spend its tokens — yours, a friend's, or one you are about to send money to.",
  'observer.placeholder': '0x… or a MonadVision address link',
  'observer.inputAria': 'Address to inspect',
  'observer.reading': 'Reading…',
  'observer.inspect': 'Inspect',
  'observer.busy': 'reading the chain',
  'observer.exposureLabel': 'Exposure · what others can spend',
  'observer.of': '{exposed} of {balance} reachable',
  'observer.unlimitedN': '{n} unlimited',
  'observer.limitedN': '{n} limited',
  'observer.noPermissions': 'no open permissions',

  /* Signature explainer */
  'sign.ariaLabel': 'Signature request explainer',
  'sign.label': 'Signature inspector · what would signing authorize?',
  'sign.hint':
    'Signing costs no gas and looks harmless — which is why drainers ask for it. Paste a request here before you approve it: a signature request, a wallet-takeover request, or a batch of bundled instructions.',
  'sign.placeholder':
    '{"types":{…},"domain":{…},"primaryType":"Permit","message":{…}}',
  'sign.jsonAria': 'Request JSON',
  'sign.explain': 'Explain this request',
  'sign.clear': 'Clear',
  'sign.cannotSign':
    'PreFlight cannot sign this for you — read it here, then decide in your wallet.',
  'sign.invalidJson':
    'That is not valid JSON. Copy the whole request from the app that asked for it.',

  /* Error boundary */
  'eb.title': 'Something went wrong',
  'eb.body':
    'The app hit an unexpected problem and stopped to stay safe. Nothing was signed or sent. Reloading the page usually fixes it.',
  'eb.reload': 'Reload',

  /* Readiness gauge */
  'gauge.aria': 'Flight readiness: {score} out of 100, {verdict}',
  'gauge.seriousOne': '1 serious warning',
  'gauge.seriousMany': '{n} serious warnings',
  'gauge.toCheck': '{n} to double-check',

  /* Drift notice */
  'driftn.staleSeconds': 'The plan you read was {seconds} seconds old.',
  'driftn.showNew': 'Show me the new plan',
  'driftn.signAnyway': 'Sign the original anyway',

  /* Trace deep-dive rows */
  'trace.create': '(create)',
  'trace.gasSuffix': '{gas} gas',
  'trace.transfer': 'Transfer · {from} → {to} · {value} units',
  'trace.approval': 'Approval · {owner} lets {spender} spend {value} units',
  'trace.deposit': 'Deposit (wrap) · {dst} · {value} units',
  'trace.withdrawal': 'Withdrawal (unwrap) · {src} · {value} units',
  'trace.unknown': 'unrecognized event from {addr}',

  /* Rule-based risk findings */
  'risk.revertedTitle': 'This transaction would fail',
  'risk.revertReason': ' The network gave this reason: "{reason}".',
  'risk.revertedDetail':
    'Our test run shows the network would reject this transaction.{reason} No funds would move, but you could still lose the gas fee paid to attempt it.',
  'risk.noBalanceTitle': 'Not enough MON in your wallet',
  'risk.noBalanceDetail':
    'The amount you are sending plus the network fee adds up to more MON than you have. The transaction cannot go through as it is.',
  'risk.unlimitedTitle': 'Gives unlimited access to your tokens',
  'risk.unlimitedDetail':
    'This lets the spender move ALL of that token out of your wallet, at any time, until you cancel (revoke) the permission. Only grant this to apps you fully trust.',
  'risk.approveEoaTitle': 'Approving a personal wallet, not an app',
  'risk.approveEoaDetail':
    'You are giving token access to a personal wallet, not an app. This is the classic pattern of wallet-drainer scams — real apps ask you to approve a program, not a person.',
  'risk.tokenNotContractTitle': 'Token address is not a real token',
  'risk.tokenNotContractDetail':
    'The address used as the token has no program behind it, so it cannot be a working token. This transaction will not do what you expect — double-check the token address.',
  'risk.zeroAddressTitle': 'Destination is the zero address',
  'risk.zeroAddressDetail':
    'The other side of this transaction is the all-zeros address (0x000…000). Funds sent there are destroyed forever — nobody can ever get them back.',
  'risk.toContractTitle': 'The recipient is a program',
  'risk.toContractDetail':
    'The address you are sending to is a program, not a person. Make sure it is meant to receive funds directly, or they could get stuck.',
  'risk.freshRecipientTitle': 'Recipient address has never been used',
  'risk.freshRecipientDetail':
    'This address has no history and holds nothing — it may be brand new, or it may be a typo. Double-check every character, because transactions cannot be undone.',
  'risk.entireBalanceTitle': 'Sending almost everything in your wallet',
  'risk.entireBalanceDetail':
    'This sends 95% or more of the MON you have. You may not keep enough to pay fees on your next transactions.',
  'risk.unknownEffectsTitle': 'We cannot fully read this transaction',
  'risk.unknownEffectsDetail':
    'The simulation could not fully read what this transaction does. Only continue if you already trust whoever gave it to you.',
  'risk.degradedTitle': 'Only a basic check was possible',
  'risk.degradedDetail':
    'We could not run a full test of this transaction, so this preview may miss details. Treat it as a rough guide, not a guarantee.',
  'risk.wrapTitle': 'Fully reversible',
  'risk.wrapDetail':
    'This converts between MON and WMON at exactly 1 to 1 — 1 MON always equals 1 WMON. You can undo it at any time; nothing is lost except the small network fee.',
  'risk.selfTitle': 'The other address is your own',
  'risk.selfDetail':
    'The other side of this transaction is your own wallet. That is usually harmless, but you still pay a network fee — double-check it is what you meant.',
  'risk.zeroAmountTitle': 'This transaction moves nothing',
  'risk.zeroAmountDetail':
    'The amount is zero, so no tokens will actually move. You would still pay the network fee.',
  'risk.largeGasTitle': 'Uses an unusually large amount of gas',
  'risk.largeGasDetail':
    'This is an unusually complex transaction for this kind of action. Complex transactions cost more in fees and are harder to predict.',

  /* Observer lib */
  'obs.pasteEmpty':
    'Paste an address to look up. It starts with "0x" and is 42 characters long.',
  'obs.notAddress':
    "That doesn't look like an address. Paste one that starts with \"0x\" and is 42 characters long, or a link to its page on a block explorer.",
  'obs.badChecksum':
    'That address looks mistyped — the mix of capital and small letters does not check out. Copy it again from the original source.',
  'obs.isContract': 'This address is a program (smart contract).',
  'obs.neverUsed': 'This wallet has never been used — no transactions, no funds.',
  'obs.holdsNotSent': 'This wallet holds funds but has never sent a transaction.',
  'obs.sentOne': 'This wallet has sent 1 transaction.',
  'obs.sentMany': 'This wallet has sent {count} transactions.',
  'obs.codeUnknown':
    ' We could not confirm whether this address is a wallet or a program — the network did not answer that check.',
  'obs.holds': 'Holds {amount}.',
  'obs.txNone': 'Has never sent a transaction.',
  'obs.txOne': 'Has sent 1 transaction.',
  'obs.txMany': 'Has sent {count} transactions.',
  'obs.isProgram': 'This is a program (smart contract), not a personal wallet.',
  'obs.isWallet': 'This looks like a regular wallet, not a program.',

  /* Explanation composer */
  'expl.failHeadline': 'This transaction would fail — do not send it',
  'expl.sendHeadline': 'You are about to send {amount}',
  'expl.sendTokensHeadline': 'You are about to send tokens',
  'expl.otherAddress': 'another address',
  'expl.tokens': 'tokens',
  'expl.approveHeadline': 'You are about to let {spender} spend your {symbol}',
  'expl.revokeHeadline':
    "You are about to revoke {spender}'s access to your {symbol}",
  'expl.wrapHeadline': 'You are about to wrap {amount} into WMON',
  'expl.unwrapHeadline': 'You are about to unwrap {amount} back to MON',
  'expl.unwrapAllHeadline': 'You are about to unwrap WMON back to MON',
  'expl.customHeadline': 'You are about to run a custom transaction',
  'expl.revertReason': 'The reason given: {reason}.',
  'expl.noReason': 'It did not give a clear reason why.',
  'expl.rejectOutcome':
    'Our test run shows the network will reject this transaction. {reason} Sending it anyway would only waste gas — you would pay a fee and nothing else would happen.',
  'expl.oneToOne':
    ' Every 1 MON equals exactly 1 WMON, and you can convert back at any time.',
  'expl.noChangesOutcome':
    'Our test run finished without errors, but it did not detect any balance changes for your wallet. Check the details below before you sign.{oneToOne}',
  'expl.ifConfirm': 'If you confirm this, {clauses}.{oneToOne}',
  'expl.joinAnd': '{list} and {last}',
  'expl.joinSep': ', ',
  'expl.youSendClause': 'you send {amount}',
  'expl.youReceiveClause': 'you receive {amount}',
  'expl.otherSendsClause': '{who} sends {amount}',
  'expl.otherReceivesClause': '{who} receives {amount}',
  'expl.approvalRevokeClause':
    '{spender} loses its permission to spend {whose} {symbol}',
  'expl.approvalUnlimitedClause':
    '{spender} gets permission to move ALL of {whose} {symbol}',
  'expl.approvalLimitClause':
    '{spender} gets permission to spend up to {amount} from {whose} wallet',
  'expl.youSendBullet': 'You send {amount}',
  'expl.youReceiveBullet': 'You receive {amount}',
  'expl.otherSendsBullet': '{who} sends {amount}',
  'expl.otherReceivesBullet': '{who} receives {amount}',
  'expl.approvalRevokeBullet':
    'After this, {spender} can no longer spend {whose} {symbol}',
  'expl.approvalUnlimitedBullet':
    'After this, {spender} can move ALL of {whose} {symbol}, now and in the future, until {revoker} it',
  'expl.approvalLimitBullet':
    'After this, {spender} can spend up to {amount} from {whose} wallet at any time',
  'expl.revokerYou': 'you revoke',
  'expl.revokerThey': 'they revoke',
  'expl.your': 'your',
  'expl.possesiveOwner': "{owner}'s",
  'expl.networkFeeBullet':
    'Network fee: about {amount} (your wallet shows the exact number before you confirm)',
  'expl.warnOne': '⚠ 1 serious warning below — read it before signing.',
  'expl.warnMany': '⚠ {count} serious warnings below — read them before signing.',

  /* Readiness score */
  'score.verdict.clear': 'Cleared',
  'score.verdict.caution': 'Hold',
  'score.verdict.grounded': 'Grounded',
  'score.advice.fail':
    'This transaction would fail if you sent it. Signing it would only cost you the network fee.',
  'score.advice.degraded':
    'We could only run a shallow check on this one, so we cannot tell you what it moves. Treat this score as "unknown", not as approval.',
  'score.advice.grounded':
    'Serious problems found. Read the warnings below before you decide — this is the kind of transaction people regret.',
  'score.advice.caution':
    'Nothing is clearly broken, but something here deserves a second look before you sign.',
  'score.advice.info':
    'Everything checks out. A couple of small notes are listed below.',
  'score.advice.clear':
    'Everything checks out — this does what you asked, and nothing more.',

  /* Simulation drift */
  'drift.headline.material':
    'The chain moved while you were reading — this transaction no longer does the same thing.',
  'drift.headline.cosmetic':
    'Only the network fee estimate moved. What the transaction does is unchanged.',
  'drift.headline.none': 'Nothing changed — the plan is still accurate.',
  'drift.wouldGoThrough':
    'This transaction would now go through, where before it would have failed.',
  'drift.wouldFail':
    'This transaction would now fail, where before it would have gone through.',
  'drift.amountFlip':
    'Before you would {wasVerb} {beforeAmount}; now you would {nowVerb} {afterAmount}.',
  'drift.amountShift':
    'You would now {nowVerb} {afterAmount} instead of {beforeAmount}.',
  'drift.verbSend': 'send',
  'drift.verbReceive': 'receive',
  'drift.paymentToAppeared':
    'A payment of {amount} to {party} is now part of this transaction.',
  'drift.paymentFromAppeared':
    'A payment of {amount} from {party} is now part of this transaction.',
  'drift.paymentToGone':
    'A payment to {party} is no longer part of this transaction.',
  'drift.paymentFromGone':
    'A payment from {party} is no longer part of this transaction.',
  'drift.approvalGone':
    'The approval letting {spender} spend your {symbol} is no longer part of this transaction.',
  'drift.approvalNewUnlimited':
    'A new approval is now part of this transaction: it would let {spender} spend an unlimited amount of your {symbol}.',
  'drift.approvalNewCapped':
    'A new approval is now part of this transaction: it would let {spender} spend up to {amount} of yours.',
  'drift.approvalNowUnlimited':
    'The approval is now unlimited, where before it had a limit.',
  'drift.approvalNowCapped':
    'The approval now has a limit of {amount}, where before it was unlimited.',
  'drift.approvalCapMoved':
    '{spender} could now spend up to {amount} instead of {before}.',
  'drift.gasUp': 'The network fee estimate went up.',
  'drift.gasDown': 'The network fee estimate went down.',
  'drift.gasMoved': 'The network fee estimate moved slightly.',
  'drift.notesChanged':
    'Some background notes changed; they do not affect what the transaction does.',

  /* Portfolio exposure */
  'port.headlineSome':
    '{n} of your tokens can be spent by someone else right now.',
  'port.headlineUnlimitedOne': '1 unlimited permission is open on this wallet.',
  'port.headlineUnlimitedMany':
    '{n} unlimited permissions are open on this wallet.',
  'port.headlineNone': 'Nothing in this wallet can be spent by anyone else.',
  'port.advice.unlimitedFundedOne':
    'Start with {names}: cancel (revoke) the unlimited access to it — you hold this token right now, so it can be taken at any moment.',
  'port.advice.unlimitedFundedMany':
    'Start with {names}: cancel (revoke) the unlimited access to them — you hold these tokens right now, so they can be taken at any moment.',
  'port.advice.unlimitedEmpty':
    'You do not hold any {names} right now, but the unlimited access is still open. Cancel (revoke) it before you add funds — otherwise anything you deposit can be taken straight away.',
  'port.advice.unlimitedUnknown':
    'Unlimited access is open on {names}, and we could not read your balance of {itThem} — so we cannot tell you how much is at risk. Treat this as unresolved and revoke it unless you know why it is there.',
  'port.advice.itThemOne': 'it',
  'port.advice.itThemMany': 'them',
  'port.advice.capped':
    'None of this access is unlimited, but it is still safest to cancel (revoke) any permission you no longer use.',
  'port.advice.fee':
    'Cancelling a permission is a normal transaction, so each one costs a small network fee.',
  'port.advice.noExpiry':
    'Permissions never expire on their own — they stay open until you cancel them, even if the app that asked for them is long gone.',

  /* Typed data (signature requests) */
  'td.permitHeadline':
    'This signature is a token approval — no transaction needed',
  'td.permit2Headline':
    'This signature is a token approval through Permit2 — no transaction needed',
  'td.genericHeadline': 'You are being asked to sign structured data',
  'td.notTypedData':
    "This does not look like a signature request. A signature request has 'types' and 'message' sections, plus a 'domain' or 'primaryType'.",
  'td.amountCaveat':
    "raw token units — a signature request does not carry the token's decimals, so we cannot show this as an everyday amount",
  'td.unreadableDate': 'an unreadable date',
  'td.neverExpires': 'a date so far away it never really expires',
  'td.amountUnlimited': 'unlimited — there is no cap on how much can be taken',
  'td.amountCapped': '{amount} {caveat}',
  'td.unlimitedRiskTitle': 'Unlimited spending approval',
  'td.unlimitedRiskDetail':
    'Signing hands unlimited spending of this token to {spender}. It happens silently and costs them nothing — they could take your entire balance at any time.',
  'td.expiredTitle': 'This request has already expired',
  'td.expiredDetail':
    'The deadline in this request is in the past, so signing it should have no effect — contracts reject expired signatures.',
  'td.longDeadlineTitle': 'Usable for a very long time',
  'td.longDeadlineDetail':
    'This approval stays usable for more than 30 days (until {date}). Whoever holds the signature can use it at any moment before then, long after you may have forgotten about it.',
  'td.networkTitle': 'Meant for a different network',
  'td.networkDetail':
    'This signature is for a different network than the one you have selected. Make sure the app is asking for the network you expect.',
  'td.signatureMovesTitle': 'Signatures can move funds',
  'td.signatureMovesDetail':
    'Some signatures authorize moving funds without any transaction. Only sign if you trust the app that asked for this.',
  'td.cantReadAmount':
    'We could not read the amount in this approval request, so we cannot explain it safely.',
  'td.cantReadDeadline':
    'We could not read the deadline in this approval request, so we cannot explain it safely.',
  'td.whoCanSpend': 'Who can spend: {spender}',
  'td.howMuch': 'How much: {amount}',
  'td.useBy': 'Signature must be used by: {date}',
  'td.deadlineClarify':
    'Important: that date limits when this signature can be used — not how long the permission lasts. Once used, the permission stays open until you revoke it.',
  'td.tokenContract': 'Token contract: {address}',
  'td.anyAmount': 'any amount',
  'td.statedAmount': 'up to the stated amount',
  'td.permitOutcome':
    'If you sign, {spender} becomes allowed to take {anyAmount} of this token from your wallet. Signing is free and moves nothing right now — the effect kicks in whenever the spender chooses to use your signature, and the permission it creates does not expire on its own.',
  'td.cantReadAmountLabel':
    'We could not read the amount for {label} in this request, so we cannot explain it safely.',
  'td.cantReadExpiryLabel':
    'We could not read the expiry date for {label} in this request, so we cannot explain it safely.',
  'td.cantReadSigningDeadline':
    'We could not read the signing deadline in this request, so we cannot explain it safely.',
  'td.cantReadTokenN':
    'We could not read token {n} in this request, so we cannot explain it safely.',
  'td.theToken': 'the token',
  'td.tokenNLabel': 'token {n}',
  'td.tokenN': 'Token {n}: {token}',
  'td.tokenNAmount': 'Token {n} amount: {amount}',
  'td.tokenNUntil': 'Token {n} approval lasts until: {date}',
  'td.token': 'Token: {token}',
  'td.approvalUntil': 'Approval lasts until: {date}',
  'td.nTokens': '{n} tokens',
  'td.thisToken': 'this token',
  'td.permit2Outcome':
    'If you sign, {spender} becomes allowed to take {what} from your wallet through the Permit2 system until the expiry date. Signing is free and moves nothing right now — the effect kicks in whenever the spender chooses to use your signature.',
  'td.typeOfData': 'Type of data: {type}',
  'td.appName': 'App or contract name: {name}',
  'td.checkContract': 'Contract that will check this signature: {address}',
  'td.notSignedField': ' — your wallet will NOT sign this field',
  'td.hiddenOne':
    '…and 1 more field not shown here. Because we cannot show you all of it, treat this request as unreviewed.',
  'td.hiddenMany':
    '…and {count} more fields not shown here. Because we cannot show you all of it, treat this request as unreviewed.',
  'td.genericMore': 'It also has more fields than we can display. ',
  'td.genericReadAll':
    'Read every field below and make sure it matches what the app told you before you sign.',
  'td.genericOutcome':
    'We could not match this request to a known pattern, so we cannot say exactly what signing it will do. {more}',
  'td.notJson':
    'We could not read this text as a signature request — it is not valid JSON.',
  'td.unreadable':
    'Something in this signature request could not be read, so we cannot explain it safely.',
  'td.undeclaredTitle': 'This request contains hidden extra fields',
  'td.undeclaredOne':
    'The request shows 1 extra field ({names}) that your wallet will NOT sign. Honest apps do not do this. It is a known trick for showing you one thing and having you sign another — do not sign this.',
  'td.undeclaredMany':
    'The request shows {count} extra fields ({names}) that your wallet will NOT sign. Honest apps do not do this. It is a known trick for showing you one thing and having you sign another — do not sign this.',
  'td.spenderNamed': 'the spender named in this request',

  /* Delegation (EIP-7702) */
  'dl.selfDelegatedTitle': "Your wallet is running someone else's code",
  'dl.selfDelegatedDetail':
    'Your wallet is currently running code that was installed into it, coming from {where}. Whoever controls that code can move your funds without asking you again. This stays true until you remove it.',
  'dl.unreadableWhere': 'an address we could not read',
  'dl.recipientDelegatedTitle': 'The recipient wallet has a program installed',
  'dl.recipientDelegatedDetail':
    'The address you are sending to is a wallet with a program installed in it. Funds arriving there can be swept away automatically the moment they land.',
  'dl.malformed':
    'We could not read this signing request. It does not have the shape we expected, so we cannot explain it — do not sign anything you cannot verify.',
  'dl.revokeEntry':
    'This entry points at the all-zero address {address}, which removes an installed program instead of adding one.',
  'dl.programEntry':
    'The program that would run inside your wallet lives at {short} (full address: {full}).',
  'dl.everyNetwork':
    'It applies on EVERY network at once, not just one — that is strictly worse, because it also covers networks you have never used.',
  'dl.networkN': 'It applies on network number {n}.',
  'dl.networkUnreadable': 'We could not read which network this applies to.',
  'dl.selfAddress':
    'The program address is your own wallet address — that is unusual and probably not what an honest app would ask for.',
  'dl.installsInto':
    'If you sign, this program is installed into your own wallet ({wallet}) and can then act as you.',
  'dl.revokeDetailBase':
    'Pointing your wallet at the all-zero address {address} is how you REMOVE an installed program and return your wallet to normal.',
  'dl.revokeRiskTitle': 'This removes a program, not installs one',
  'dl.revokeRiskDetail':
    '{base} The address in this request is all zeros, so this request is a removal — a safe cleanup step.',
  'dl.revokeHeadline': 'This removes a program from your wallet',
  'dl.revokeOutcome':
    'This signature points your wallet at the all-zero address, which switches off any program that was installed into it before. Your wallet goes back to being a normal wallet that only acts when you sign. This is a cleanup step, not a takeover.',
  'dl.requestTitle': 'A program is asking to control your wallet',
  'dl.requestDetail':
    'Signing this installs a program into your wallet that can then act as you — move funds, grant permissions — at any time, without asking you again. No everyday app needs this from you; most requests like this are attempts to steal funds.',
  'dl.anyChainTitle': 'It would apply on every network',
  'dl.anyChainDetail':
    'This request uses network number 0, which means it applies on every network at once, now and in the future. That is strictly worse than a request limited to a single network.',
  'dl.unknownNetworkTitle': 'It is for a different network',
  'dl.unknownNetworkDetail':
    'This request applies to a network other than the one you are using. Requests aimed at a network you did not expect are a common trick — be extra careful.',
  'dl.undoTitle': 'How to undo this kind of change',
  'dl.undoDetail':
    '{base} If you ever sign one of these by mistake, removing it that way should be your very next step.',
  'dl.takeoverHeadline': 'Signing this would let a program take over your wallet',
  'dl.takeoverOutcome':
    'This is not a normal transfer. It installs a program into your own wallet, and from then on that program can act as you — sending funds and granting permissions without asking you again. It stays in place until you replace it with an empty one, and signing costs no gas, so no fee will warn you.',

  /* Batch (EIP-5792) */
  'bt.cantReadBundle': 'We could not read this bundle of instructions.',
  'bt.notFormat':
    'This text could not be read as a bundle of instructions — it is not in a format we understand.',
  'bt.empty':
    'This bundle is empty. A bundle needs at least one instruction to do anything.',
  'bt.truncated':
    'This bundle contains {total} instructions. We only checked the first {max} — the rest were not checked at all.',
  'bt.ordinal': '{n}',
  'bt.invalidTo': 'The {position} instruction has an invalid destination address.',
  'bt.unreadableData':
    'The {position} instruction contains data we could not read, so we cannot safely check it.',
  'bt.unreadableValue':
    'The {position} instruction has an amount we could not read.',
  'bt.ordinal1st': '1st',
  'bt.ordinal2nd': '2nd',
  'bt.ordinal3rd': '3rd',
  'bt.ordinalNth': '{n}th',
  'bt.notAtomicNote':
    'These instructions can land separately, so some may succeed while others fail.',
  'bt.longNote':
    'This is a long list of instructions. Long bundles are hard to check, so give each one extra care.',
  'bt.describeOne': 'This is 1 instruction bundled into one confirmation.',
  'bt.describeMany':
    'This is {n} separate instructions bundled into one confirmation.',
  'bt.atomicTail': ' They must all succeed together.',
  'bt.separateTail': ' They can land separately.',
  'bt.hiddenTitle': 'One confirmation covers several actions',
  'bt.hiddenDetail':
    'Approving this signs off on every one of the {count} instructions at once, and your wallet may only show you one of them. Read each instruction below before you continue.',
  'bt.notAtomicTitle': 'These instructions can land separately',
  'bt.notAtomicDetail':
    'These instructions are not tied together — some may succeed while others fail. You could end up with only part of what you expected.',
  'bt.largeTitle': 'This is a long list of instructions',
  'bt.largeDetail':
    'There are {count} instructions behind this one confirmation. A long list is hard to check carefully, and hiding one bad instruction in a long list is a known trick. Take extra time on each one.',
  'bt.singleTitle': 'Only one instruction inside',
  'bt.singleDetail':
    'This bundle contains just one instruction, so it behaves like a normal single transaction.',

  /* Signature triage */
  'insp.batchHeadline':
    'This is several instructions behind one confirmation',
  'insp.batchOutcome':
    '{description} Your wallet may show you only one of them, so read each line below before you approve it.',
  'insp.batchCall':
    'Instruction {index}: send {value} instructions to {to}',
  'insp.batchCallNoValue': 'Instruction {index}: send instructions to {to}',
  'insp.notRecognized':
    'We do not recognise this. PreFlight can explain a signature request (it has "types" and "message"), a wallet-takeover request, or a batch of instructions.',

  /* Spoofing defenses */
  'sp.lookalikeTitle': 'This address imitates one you trust',
  'sp.lookalikeDetail':
    '{target} shows the same first and last characters as your saved address {known}, but it is a DIFFERENT address. Scammers manufacture such lookalikes and plant them in your transaction history so a copy-paste sends funds to them instead. Re-copy the address from the person who owns it — not from any transaction list.',
  'sp.impersonationTitle': 'This is not the {symbol} you know',
  'sp.impersonationDetail':
    'The contract at {contract} calls itself "{symbol}", but the {known} you taught PreFlight lives at {knownAddress}. Symbols are not unique — anyone can deploy a token with a famous name. Treat this one as a stranger wearing a name tag.',
  'sp.zeroTransferTitle': 'This transfers exactly nothing',
  'sp.zeroTransferDetail':
    'A zero-amount transfer moves no tokens; its only effect is an event in transaction histories. That is the raw material of address poisoning — if you did not deliberately intend an empty transfer, decline it.',

  /* Approval scanner */
  'appr.networkError':
    'We could not reach the network to find the latest block, so the approval scan did not run. Please try again.',
  'appr.scanNote':
    'Scanned the last {count} blocks — approvals granted earlier than that will not show here yet.',
  'appr.failedRangeOne':
    '1 block range could not be read, so this list may be incomplete. Scan again before treating it as the full picture.',
  'appr.failedRangeMany':
    '{n} block ranges could not be read, so this list may be incomplete. Scan again before treating it as the full picture.',
  'appr.skippedOne':
    'This wallet has a lot of approvals — we checked the {max} most recent and skipped 1 older one.',
  'appr.skippedMany':
    'This wallet has a lot of approvals — we checked the {max} most recent and skipped {skipped} older ones.',
  'appr.tokenDegraded':
    'The token at {address} did not report its details, so we show a shortened address and assume 18 decimals.',
  'appr.unverifiedOne':
    'We found 1 more permission but could not read its current state, so it is not listed above.',
  'appr.unverifiedMany':
    'We found {n} more permissions but could not read their current state, so they are not listed above.',

  /* Balances */
  'bal.failedOne':
    'We could not check your {name} balance right now, so it is not shown.',
  'bal.failedMany':
    'We could not check your balances for these tokens right now, so they are not shown: {names}.',

  /* Post-flight verification lines */
  'pf.outcome': 'Outcome',
  'pf.willSucceed': 'will succeed',
  'pf.wouldFail': 'would fail',
  'pf.succeeded': 'succeeded',
  'pf.reverted': 'reverted',
  'pf.movementLabel': '{symbol} movement',
  'pf.youSent': 'you sent {amount}',
  'pf.youReceived': 'you received {amount}',
  'pf.unexpected': 'Unexpected token movement',
  'pf.nothing': 'nothing',
  'pf.sentRaw': 'you sent {amount} raw units of the token at {address}',
  'pf.receivedRaw': 'you received {amount} raw units of the token at {address}',
  'pf.monMovement': 'MON movement',
  'pf.notRecorded': 'not recorded in the receipt',
  'pf.noteUnrecorded':
    'A receipt does not record MON moved inside a contract call, so we cannot confirm this one independently. Your wallet balance is the check here.',
  'pf.permissionLabel': '{symbol} permission',
  'pf.unlimitedGranted': 'unlimited spending granted',
  'pf.cappedGranted': 'spending up to {amount} granted',
  'pf.confirmedChange': 'the token confirmed a permission change',
  'pf.noChangeRecorded': 'no permission change recorded',
  'pf.notePermission':
    'The token reported a permission change, but the exact remaining amount lives in the contract — check the Hangar to see it.',
  'pf.feeLabel': 'Network fee',
  'pf.about': 'about {amount}',
  'pf.noteFee':
    'Fee estimates are always approximate; this is what you were actually charged.',

  /* Flight report */
  'rep.footer':
    'Generated by Monad PreFlight — a simulation is a best-effort preview of chain state at the time, not a guarantee.',
  'rep.severityDanger': '[DANGER]',
  'rep.severityCaution': '[CAUTION]',
  'rep.severityInfo': '[INFO]',
  'rep.verdictMatched':
    'Verdict: everything we checked on chain matched the simulation.',
  'rep.verdictMatchedPartial':
    'Verdict: everything we could check matched the simulation. Rows marked "not checked" are not recorded in a transaction receipt, so they could not be independently confirmed.',
  'rep.verdictMismatched':
    'Verdict: some results on chain did not match the simulation — look at the rows marked ✗.',
  'rep.simSection': 'What the simulation showed',
  'rep.warningsSection': 'Warnings',
  'rep.postflightSection': 'Post-flight verification',
  'rep.tableHeader': '| Check | Simulated | Actual | Match |',
  'rep.notChecked': '– not checked',
  'rep.txHash': 'Transaction hash: `{hash}`',
  'rep.explorerLink': '[View this transaction on the block explorer]({href})',

  /* Address book */
  'book.needName': 'Please give this contact a name.',
  'book.tooLong': 'That name is too long. Please keep it to 24 characters or fewer.',
  'book.startsOx':
    'A name cannot start with "0x" — that looks like an address, which would be confusing. Please pick a different name.',
  'book.numbersOnly':
    'A name cannot be numbers only — that could be mistaken for an amount. Please include at least one letter.',
  'book.allowedChars':
    'Names can only use letters, numbers, hyphens (-) and underscores (_), with no spaces.',
  'book.badAddress':
    'That address does not look right. A real address starts with "0x" followed by 40 letters and numbers. Please copy the whole address and paste it again.',

  /* Wallet connect */
  'wallet.noAccount': 'Your wallet did not share an account.',

  /* Intent parser */
  'int.empty': 'Tell me what you want to do and I will prepare it for you.',
  'int.rawNotJson':
    'That looks like a transaction in JSON form, but the JSON is not valid — copy it again from the source app.',
  'int.rawNotObject':
    'A raw transaction should be a JSON object with at least a "to" address.',
  'int.rawNoTo':
    'A raw transaction needs a "to" address — 0x followed by 40 hex characters.',
  'int.rawNumberNote':
    'The value was a plain number, so I read it as an amount of MON.',
  'int.wrapMixed':
    'That mixes wrapping with a second action, and doing half of it silently would be worse than asking. Split it into steps — e.g. "wrap 1 MON then send 0.5 WMON to 0x…" ("然后" works too).',
  'int.wrapIgnoredAddress':
    'Wrapping happens entirely inside your own wallet, so I ignored the address in your message.',
  'int.wrapAllFails':
    'Wrapping your entire balance would leave no MON to pay the network fee with, so the transaction would fail. Pick a number instead, like "wrap 1 MON".',
  'int.wrapHowMuch':
    'How much MON do you want to wrap? Add an amount, like "wrap 1 MON".',
  'int.unwrapHowMuch':
    'How much WMON do you want to unwrap? Add an amount, like "unwrap 2 WMON" — or say "all".',
  'int.noAction':
    'I did not catch what you want to do. I can send MON or tokens, approve spending, revoke an approval, or wrap MON into WMON and back.',
  'int.halfAmbiguous':
    'Half of a balance is ambiguous — the balance can change before you sign. Say the exact amount instead.',
  'int.needRecipient':
    'I need a recipient — include the full address (0x followed by 40 characters) you want to send to.',
  'int.needSpender':
    'I need the address of the app or wallet the approval is for — include the full 0x… address.',
  'int.tooManyAddresses':
    'More than two addresses found — I used the first ones and ignored the rest.',
  'int.twoAddressesSend':
    'Two addresses found — I treated {first}… as the recipient and {second}… as the token.',
  'int.twoAddressesApprove':
    'Two addresses found — I treated {first}… as the spender and {second}… as the token.',
  'int.unlimitedSend':
    '"Unlimited" only makes sense for approvals. To send, give a number — or say "all" to send your whole balance.',
  'int.sendHowMuch':
    'How much do you want to send? Add an amount, like "send 0.5 MON to 0x…", or say "all".',
  'int.allAndNumber':
    'Your message mentioned both "all" and the number {n} — I used {n}. Say just "all" if you want to send everything.',
  'int.tokenNameUnreadable':
    "I could not read the token name in that. Name it by its symbol (like tUSD or WMON), or paste the token's contract address.",
  'int.assumedNative': 'No token named — I assumed you mean native MON.',
  'int.severalTokens':
    'Several words could be the token name — I went with "{token}".',
  'int.approveWhichToken':
    'Which token is this approval for? MON itself cannot be approved — name a token, like "approve 0x… to spend 100 tUSD".',
  'int.approveHowMuch':
    'How much should they be allowed to spend? Give an amount, or say "unlimited".',
  'int.revokeWhichToken':
    "Which token do you want to revoke access to? Name it, like \"revoke 0x…'s access to my tUSD\".",

  /* Transaction builder */
  'tb.invalidAddress':
    '"{value}" is not a valid {what} — an address is 42 characters starting with 0x. Double-check for typos.',
  'tb.what.recipient': 'recipient address',
  'tb.what.spender': 'spender address',
  'tb.what.token': 'token address',
  'tb.what.to': '"to" address',
  'tb.what.sender': 'sender address (your wallet)',
  'tb.needRecipient':
    'I need a recipient — add the address (0x…) you want to send to.',
  'tb.needSpender':
    'I need to know which app or address gets the spending permission — add its address (0x…).',
  'tb.tokenReadFailed': 'I could not read token details at {address}.',
  'tb.unknownToken':
    'I do not know the token "{token}" yet — paste its contract address once and I will remember it.',
  'tb.invalidAmount': '"{value}" is not a valid amount.',
  'tb.balanceTooSmall':
    'Your MON balance is too small to send anything after keeping {amount} back for gas money.',
  'tb.gasNote': ' (keeping {amount} back for gas)',
  'tb.howMuchMon':
    'How much MON do you want to send? Add an amount, like "send 0.5 MON".',
  'tb.noTokenBalance': 'You do not have any {symbol} to send.',
  'tb.howMuchToken':
    'How much {symbol} do you want to send? Add an amount, like "send 10 {symbol}".',
  'tb.approveNativeMon':
    'MON itself cannot be approved — approvals are a token feature. MON is the native coin: it only moves when you send it. Name a token instead, like "approve 100 tUSD for 0x…".',
  'tb.approveHowMuch':
    'How much {symbol} should {spender} be allowed to spend? Give an amount, or say "unlimited".',
  'tb.revokeNativeMon':
    'Which token do you want to revoke access to? MON itself cannot be approved, so there is no MON access to revoke — name the token, like "revoke tUSD access for 0x…".',
  'tb.wrapUnavailable': 'Wrapping is not available on this network yet.',
  'tb.wrapAllFails':
    'Wrapping your entire balance would leave no MON to pay the network fee with, so the transaction would fail. Pick a number instead, like "wrap 1 MON".',
  'tb.wrapHowMuch':
    'How much MON do you want to wrap? Add an amount, like "wrap 1 MON".',
  'tb.unwrapEmpty': 'You do not have any WMON to unwrap.',
  'tb.unwrapHowMuch':
    'How much WMON do you want to unwrap? Add an amount, like "unwrap 2 WMON", or say "all".',
  'tb.rawMissing':
    'Paste the transaction details (at least the "to" address) and I will explain it before you sign.',
  'tb.rawBadData':
    'The transaction data is not valid — it should be "0x" followed by pairs of hex characters (0-9, a-f). Copy it again from the source app.',
  'tb.rawBadValue':
    'The transaction value looks like hex but is not valid — it should be "0x" followed by hex characters (0-9, a-f).',
  'tb.rawBadAmount': '"{value}" is not a valid amount of MON.',
  'tb.summarySend': 'Send {amount} to {address}',
  'tb.summaryApproveAll': 'Allow {spender} to spend ALL of your {symbol} (unlimited)',
  'tb.summaryRevokeZero':
    "Revoke {spender}'s access to your {symbol} (approving 0 removes their access)",
  'tb.summaryApprove': 'Allow {spender} to spend up to {amount}',
  'tb.summaryRevoke': "Revoke {spender}'s access to your {symbol}",
  'tb.summaryWrap': 'Wrap {amount} into WMON',
  'tb.summaryUnwrap': 'Unwrap {amount} back to MON',
  'tb.summaryRaw': 'Custom transaction to {address}',

  /* Simulator notes */
  'sim.walletFeeNote': 'Your wallet will show the exact network fee before you sign.',
  'sim.fallbackNote':
    'Deep simulation unavailable on this RPC — ran a basic check instead.',
  'sim.noReason': 'The contract rejected the transaction without giving a reason.',
  'sim.noReadableReason':
    'The contract rejected the transaction without giving a readable reason.',
  'sim.panic.assertion': 'failed assertion',
  'sim.panic.overflow': 'arithmetic overflow',
  'sim.panic.division': 'division by zero',
  'sim.panic.index': 'index out of range',
  'sim.panic.code': 'internal error code 0x{code}',
  'sim.contractStopped': 'The contract stopped the transaction: {reason}.',
  'sim.contractStoppedInternal':
    'The contract stopped the transaction with an internal error.',
  'sim.customError': 'The contract rejected it with custom error {selector}.',
  'sim.httpStatus': 'The RPC server answered with HTTP {status} for {method}.',
  'sim.rpcError': 'RPC error {code} for {method}',
  'sim.networkDownOne':
    'We could not reach the network. We tried 1 endpoint and it did not answer. Please check your connection and try again.',
  'sim.networkDownMany':
    'We could not reach the network. We tried {n} endpoints and none of them answered. Please check your connection and try again.',
  'sim.feeUnavailable':
    'We could not read the current network gas price, so the fee estimate may show as zero.',
  'sim.gasEstimateFail':
    'The network would not give a full gas estimate, so the gas shown may be slightly low.',
  'sim.gasNeeds': 'We could not estimate how much gas this transaction needs.',

  /* Token registry */
  'token.detailsFailed':
    'I could not read token details at {address} — that address is probably not a token contract. Double-check where you copied it from.',

  /* Wallet health */
  'wh.headline.fail': 'Your wallet needs attention now.',
  'wh.headline.unknown':
    'We could not check everything — do not treat this as a clean bill of health.',
  'wh.headline.warn': 'Mostly fine, with a couple of things worth cleaning up.',
  'wh.headline.pass': 'Everything we can check looks healthy.',
  'wh.label.delegation': 'Wallet takeover',
  'wh.delegationUnknown':
    'We could not read whether your wallet is running installed code.',
  'wh.delegationAt': ' at {address}',
  'wh.delegationFail':
    'A program{where} is installed on your wallet and can act as you. If you did not set this up yourself, remove it before doing anything else.',
  'wh.delegationPass':
    'Your wallet is a normal wallet — no program is running as you.',
  'wh.label.unlimited': 'Unlimited spending permissions',
  'wh.unlimitedUnknown':
    'Our scan could not see everything, so we cannot say how many unlimited spending permissions you have. Do not treat this as a clean bill of health.',
  'wh.unlimitedPass':
    'You have no unlimited spending permissions — nothing can drain a whole token from your wallet.',
  'wh.unlimitedWarnOne':
    'You have 1 unlimited spending permission. Each one lets someone move all of that token out of your wallet at any time — cancel the ones you no longer use.',
  'wh.unlimitedWarnTwo':
    'You have 2 unlimited spending permissions. Each one lets someone move all of that token out of your wallet at any time — cancel the ones you no longer use.',
  'wh.unlimitedFail':
    'You have {count} unlimited spending permissions. Each one lets someone move all of that token out of your wallet at any time — cancel the ones you no longer use.',
  'wh.label.exposure': 'Funds others can take',
  'wh.exposureUnknown':
    'We could not work out which of your tokens others currently have permission to take.',
  'wh.exposurePass':
    'None of the tokens you hold can currently be taken by someone else.',
  'wh.exposureWarnOne':
    '1 token in your wallet is covered by a permission someone else holds — they could take it without asking you again.',
  'wh.exposureWarnMany':
    '{count} tokens in your wallet are covered by a permission someone else holds — they could take them without asking you again.',
  'wh.label.funds': 'Gas for getting out',
  'wh.fundsUnknown': 'We could not read how much MON your wallet holds.',
  'wh.fundsWarn':
    'Your wallet holds no MON. Every action costs a small network fee, so right now you could not even cancel a permission — you cannot get out without a little MON for the fee.',
  'wh.fundsPass':
    'Your wallet holds MON, so you can pay the network fee to act — including cancelling a permission — if you ever need to.',

  /* Counterparty reputation */
  'rep2.approvalWalletReason':
    'This address is a personal wallet, not a program — wallets never need permission to spend your tokens.',
  'rep2.approvalWalletTitle': 'Giving token access to a personal wallet',
  'rep2.approvalWalletDetail':
    'You are about to let a personal wallet spend your tokens. Real apps ask you to approve a program, not a person — this is the classic pattern of wallet-drainer scams.',
  'rep2.drainerReason':
    '{owners} people recently gave this address access to their tokens, yet it has only been used {times}.',
  'rep2.drainerTitle': 'Matches a fresh scam campaign pattern',
  'rep2.drainerDetail':
    '{owners} people recently gave this address access to their tokens, but it has only been used {times}. Lots of new permissions with almost no activity is the signature of a scam that just started.',
  'rep2.tinyReason':
    'This program contains only {bytes} bytes of code — genuine apps are far larger.',
  'rep2.tinyTitle': 'This program is suspiciously small',
  'rep2.tinyDetail':
    'The program at this address is only {bytes} bytes — real apps are far larger. Tiny throwaway programs like this are common in wallet-drainer kits, so be extra careful.',
  'rep2.neverUsedReason': 'This address has been used {times} and holds nothing.',
  'rep2.neverUsedTitle': 'This address has never been used',
  'rep2.neverUsedDetail':
    'It has no history and holds nothing — it may be brand new, or it may be a typo. Double-check every character, because transactions cannot be undone.',
  'rep2.timesOne': '1 time',
  'rep2.timesMany': '{n} times',
  'rep2.establishedUsed': 'This program has been used {times}.',
  'rep2.establishedCode':
    'It carries {bytes} bytes of program code — the size of a real, working app.',
  'rep2.ordinaryUsed': 'This {what} has been used {times}.',
  'rep2.whatProgram': 'program',
  'rep2.whatAddress': 'address',
  'rep2.ordinaryBalance': 'It currently holds about {amount} MON.',
  'rep2.label.suspicious': 'Looks like a scam pattern',
  'rep2.label.established': 'Well-used program',
  'rep2.label.thin': 'Never used before',
  'rep2.label.ordinaryProgram': 'Ordinary program',
  'rep2.label.ordinaryWallet': 'Ordinary wallet',

  /* Contract fingerprinting */
  'fp.eoaLabel': 'Personal wallet',
  'fp.eoaDetail':
    'This address is a personal wallet, not a program. Whoever holds its key controls it and everything it owns.',
  'fp.minimalLabel': 'Tiny forwarder to another program',
  'fp.minimalDetail':
    'This address holds almost no code of its own — the real code lives at another address, {address}, and everything you send here is forwarded there. That target is baked in and cannot be changed later.',
  'fp.proxyLabel': 'Front for another program',
  'fp.proxyDetail':
    'This address is only a front: the real code lives at another address, {address}. Whoever controls this front can swap that code for something different at any time, so what it does today is not guaranteed tomorrow.',
  'fp.erc721Label': 'Collectible tokens (NFTs)',
  'fp.erc721Detail':
    'This program manages unique collectible items — each one is different and belongs to exactly one owner at a time.',
  'fp.erc20Label': 'Token',
  'fp.erc20Detail':
    'This program is a regular token: it keeps a balance for every wallet and moves those balances when their owners ask.',
  'fp.multisigLabel': 'Shared or smart wallet',
  'fp.multisigDetail':
    'This looks like a wallet that is itself a program — often one shared by several people, where funds only move once enough of them agree.',
  'fp.unknownLabel': 'Program (purpose unknown)',
  'fp.unknownDetail':
    'PreFlight could not recognise what this program does, so do not rely on its name or address alone — rely on what the simulation shows you.',

  /* Fee oracle */
  'go.verdict.quiet': 'Network is quiet — fees are low right now.',
  'go.verdict.normal': 'Fees are about normal for this network.',
  'go.verdict.high': 'Fees are running high right now.',
  'go.verdict.noComparison': 'We could not compare this fee to recent blocks.',
  'go.advice.wait':
    'If this is not urgent, waiting a few minutes will probably cost less.',
  'go.note.congestion':
    'Recent blocks have been nearly full, so fees may keep rising.',
  'go.note.historyUnavailable':
    'We could not read recent fee data from the network, so we cannot say whether this fee is high or low.',
  'go.note.priceUnavailable':
    'We could not read the current network fee either, so the fee shown here may be zero.',
};

const zh: Dict = {
  /* App shell */
  'app.tagline':
    '说出你想做什么。PreFlight 会替你准备交易，在 {network} 上先模拟一遍，再用大白话讲清楚——签不签，由你决定。',
  'app.brandName': 'Monad PreFlight',
  'app.workspaceAria': '工作区',

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
  'status.networkAria': '网络',
  'status.languageAria': '语言',
  'status.realFunds': '真实资金',

  /* Flight plan */
  'plan.label': '飞行计划 · 签名前先模拟',
  'plan.signButton': '确认无误，去钱包签名',
  'plan.signAnyway': '仍要签名（不建议）',
  'plan.discard': '放弃',
  'plan.keysNote': 'PreFlight 不会接触你的私钥，最终确认在你的钱包里完成。',
  'plan.waitingWallet': '等待钱包确认…',
  'plan.aiLabel': 'AI 副驾 · 由 Claude 根据上方模拟事实撰写',
  'plan.timing':
    '在 Monad 上完成全套实时检查仅 {total} ms——模拟 {sim} ms · 链上读取 {facts} ms（含你的网络往返）',
  'sr.danger': '严重警告：',
  'sr.caution': '注意：',
  'sr.info': '提示：',

  /* Post-flight verification */
  'postflight.label': '落地核对 · 模拟与链上实际对比',
  'postflight.ariaLabel': '落地核对',
  'postflight.matchAria': '结果',
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
  'queue.ariaLabel': '旅程',
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
  'settings.ariaLabel': '设置',
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
  'settings.contactNameAria': '联系人名称',
  'settings.contactAddressAria': '联系人地址',
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

  /* App-level errors and notes */
  'app.invalidContractAddress': '这不是有效的合约地址（0x 加 40 位十六进制字符）。',
  'app.couldNotUnderstand': '无法理解你的输入。',
  'app.tryOneOfThese': '可以试试这样说：',
  'app.planWrongNetwork':
    '这份计划是在 {prepared} 上准备的，而你当前在 {current}。请重新准备，以便按你实际使用的网络重新核对。',
  'app.planWrongAccount':
    '这份计划是为另一个账户准备的，与钱包当前使用的账户不符。请重新准备。',
  'app.lostTrack':
    '交易已发送，但在确认前我们跟丢了。它仍可能上链——重试前请先查看下方的区块浏览器链接。',
  'app.clipboardBlocked': '复制失败——浏览器阻止了剪贴板访问。',
  'app.bookNameNote': '"{name}" 是你为 {address} 保存的名称。',

  /* Observer panel */
  'observer.ariaLabel': '观察模式',
  'observer.label': '观察 · 检查任意地址，只读',
  'observer.hint':
    '无需钱包。查看某个地址持有什么、谁能动用它的代币——无论是你自己的、朋友的，还是你正要转账过去的。',
  'observer.placeholder': '0x… 或 MonadVision 地址链接',
  'observer.inputAria': '要检查的地址',
  'observer.reading': '读取中…',
  'observer.inspect': '检查',
  'observer.busy': '正在读取链上数据',
  'observer.exposureLabel': '敞口 · 他人可动用的部分',
  'observer.of': '可达 {exposed}，共 {balance}',
  'observer.unlimitedN': '{n} 个无限授权',
  'observer.limitedN': '{n} 个限额授权',
  'observer.noPermissions': '没有开放的授权',

  /* Signature explainer */
  'sign.ariaLabel': '签名请求解释器',
  'sign.label': '签名检查 · 签名会授权什么？',
  'sign.hint':
    '签名不花 gas、看似无害——这正是盗币者让你签名的原因。批准前先把请求粘贴到这里：签名请求、钱包接管请求，或一批打包的指令。',
  'sign.placeholder': '{"types":{…},"domain":{…},"primaryType":"Permit","message":{…}}',
  'sign.jsonAria': '请求 JSON',
  'sign.explain': '解释这个请求',
  'sign.clear': '清空',
  'sign.cannotSign': 'PreFlight 不能替你签名——在这里读明白，再到你的钱包里决定。',
  'sign.invalidJson': '这不是有效的 JSON。请从要求你签名的应用里复制完整的请求。',

  /* Error boundary */
  'eb.title': '出了点问题',
  'eb.body':
    '应用遇到了意外问题并已停止，以保证安全。没有签名，也没有发送任何东西。刷新页面通常就能解决。',
  'eb.reload': '刷新',

  /* Readiness gauge */
  'gauge.aria': '飞行就绪度：{score}/100，{verdict}',
  'gauge.seriousOne': '1 条严重警告',
  'gauge.seriousMany': '{n} 条严重警告',
  'gauge.toCheck': '{n} 项需要仔细核对',

  /* Drift notice */
  'driftn.staleSeconds': '你看到的计划已过去 {seconds} 秒。',
  'driftn.showNew': '看看新计划',
  'driftn.signAnyway': '仍签原来的计划',

  /* Trace deep-dive rows */
  'trace.create': '（创建）',
  'trace.gasSuffix': '{gas} gas',
  'trace.transfer': '转账 · {from} → {to} · {value} 个单位',
  'trace.approval': '授权 · {owner} 允许 {spender} 动用 {value} 个单位',
  'trace.deposit': '存入（包装）· {dst} · {value} 个单位',
  'trace.withdrawal': '取出（解包）· {src} · {value} 个单位',
  'trace.unknown': '来自 {addr} 的无法识别事件',

  /* Rule-based risk findings */
  'risk.revertedTitle': '这笔交易会被拒绝',
  'risk.revertReason': ' 网络给出的原因是："{reason}"。',
  'risk.revertedDetail':
    '试运行显示网络会拒绝这笔交易。{reason} 不会有资金变动，但你仍可能损失尝试所需的 gas 费。',
  'risk.noBalanceTitle': '钱包里的 MON 不够',
  'risk.noBalanceDetail':
    '发送金额加上网络费，超过了你的 MON 余额。这笔交易按现状无法完成。',
  'risk.unlimitedTitle': '将无限动用你的代币',
  'risk.unlimitedDetail':
    '这允许对方随时动用你钱包里该代币的全部数量，直到你撤销授权。只有完全信任的应用才该给这种权限。',
  'risk.approveEoaTitle': '授权的不是应用，而是个人钱包',
  'risk.approveEoaDetail':
    '你在把代币权限交给一个个人钱包，而不是应用。这正是盗币诈骗的典型套路——正规应用让你授权的是合约，而不是个人。',
  'risk.tokenNotContractTitle': '代币地址不是真正的代币',
  'risk.tokenNotContractDetail':
    '作为代币使用的地址背后没有任何合约，所以它不可能是能用的代币。这笔交易不会如你所愿，请仔细核对代币地址。',
  'risk.zeroAddressTitle': '收款方是全零地址',
  'risk.zeroAddressDetail':
    '这笔交易的对手方是全零地址（0x000…000）。转到那里的资金将永久销毁，任何人都无法找回。',
  'risk.toContractTitle': '收款方是合约',
  'risk.toContractDetail':
    '你发送到的地址是合约，不是个人。请确认它确实应该直接接收资金，否则资金可能卡住。',
  'risk.freshRecipientTitle': '收款地址从未被使用过',
  'risk.freshRecipientDetail':
    '这个地址没有历史、也没有余额——可能是全新地址，也可能是打错的地址。请逐字符核对，因为交易无法撤销。',
  'risk.entireBalanceTitle': '几乎要把钱包里的钱全部转走',
  'risk.entireBalanceDetail':
    '这笔交易会发送你 MON 余额的 95% 或更多。你可能留不下足够的钱来支付下一笔交易的手续费。',
  'risk.unknownEffectsTitle': '我们无法完全读懂这笔交易',
  'risk.unknownEffectsDetail':
    '模拟无法完全读取这笔交易的效果。只有当你本来就信任给你这份交易的人，才继续。',
  'risk.degradedTitle': '只完成了基础检查',
  'risk.degradedDetail':
    '我们无法对这笔交易做完整测试，预览可能漏掉细节。请把它当作粗略参考，而不是保证。',
  'risk.wrapTitle': '完全可逆',
  'risk.wrapDetail':
    '这是在 MON 与 WMON 之间按 1:1 兑换——1 MON 永远等于 1 WMON。随时可以换回来，除小额网络费外不会有任何损失。',
  'risk.selfTitle': '对手方是你自己',
  'risk.selfDetail':
    '这笔交易的对手方是你自己的钱包。通常无害，但你仍需支付网络费——请确认这是你的本意。',
  'risk.zeroAmountTitle': '这笔交易不会移动任何资金',
  'risk.zeroAmountDetail': '金额为零，所以不会有代币真正转移。你仍要支付网络费。',
  'risk.largeGasTitle': '消耗的 gas 异常多',
  'risk.largeGasDetail':
    '对这类操作来说，这笔交易异常复杂。复杂的交易费用更高，也更难预测结果。',

  /* Observer lib */
  'obs.pasteEmpty': '粘贴一个要查询的地址。它以 "0x" 开头，共 42 个字符。',
  'obs.notAddress':
    '这看起来不像地址。请粘贴以 "0x" 开头、共 42 个字符的地址，或它在区块浏览器上的页面链接。',
  'obs.badChecksum': '这个地址看起来打错了——大小写组合对不上校验。请从原始来源重新复制。',
  'obs.isContract': '这个地址是合约。',
  'obs.neverUsed': '这个钱包从未使用过——没有交易，也没有余额。',
  'obs.holdsNotSent': '这个钱包有钱，但从未发送过交易。',
  'obs.sentOne': '这个钱包已发送 1 笔交易。',
  'obs.sentMany': '这个钱包已发送 {count} 笔交易。',
  'obs.codeUnknown': ' 我们无法确认这个地址是钱包还是合约——网络没有回应这项检查。',
  'obs.holds': '持有 {amount}。',
  'obs.txNone': '从未发送过交易。',
  'obs.txOne': '已发送 1 笔交易。',
  'obs.txMany': '已发送 {count} 笔交易。',
  'obs.isProgram': '这是合约，不是个人钱包。',
  'obs.isWallet': '这看起来是普通钱包，不是合约。',

  /* Explanation composer */
  'expl.failHeadline': '这笔交易会失败——不要发送',
  'expl.sendHeadline': '你将发送 {amount}',
  'expl.sendTokensHeadline': '你将发送代币',
  'expl.otherAddress': '另一个地址',
  'expl.tokens': '代币',
  'expl.approveHeadline': '你将允许 {spender} 动用你的 {symbol}',
  'expl.revokeHeadline': '你将撤销 {spender} 对你 {symbol} 的授权',
  'expl.wrapHeadline': '你将把 {amount} 包装成 WMON',
  'expl.unwrapHeadline': '你将把 {amount} 解包回 MON',
  'expl.unwrapAllHeadline': '你将把 WMON 解包回 MON',
  'expl.customHeadline': '你将执行一笔自定义交易',
  'expl.revertReason': '给出的原因是：{reason}。',
  'expl.noReason': '没有给出明确的原因。',
  'expl.rejectOutcome':
    '试运行显示网络会拒绝这笔交易。{reason} 强行发送只会浪费 gas——支付手续费后不会有任何结果。',
  'expl.oneToOne': ' 每 1 MON 恰好等于 1 WMON，随时可以换回来。',
  'expl.noChangesOutcome':
    '试运行没有报错，但没有检测到你钱包的余额变化。签名前请先查看下面的明细。{oneToOne}',
  'expl.ifConfirm': '如果你确认，{clauses}。{oneToOne}',
  'expl.joinAnd': '{list} 和 {last}',
  'expl.joinSep': '、',
  'expl.youSendClause': '你将发送 {amount}',
  'expl.youReceiveClause': '你将收到 {amount}',
  'expl.otherSendsClause': '{who} 将发送 {amount}',
  'expl.otherReceivesClause': '{who} 将收到 {amount}',
  'expl.approvalRevokeClause': '{spender} 将失去动用 {whose} {symbol} 的权限',
  'expl.approvalUnlimitedClause': '{spender} 将获得动用 {whose} 全部 {symbol} 的权限',
  'expl.approvalLimitClause': '{spender} 将获得从 {whose} 钱包最多动用 {amount} 的权限',
  'expl.youSendBullet': '你将发送 {amount}',
  'expl.youReceiveBullet': '你将收到 {amount}',
  'expl.otherSendsBullet': '{who} 将发送 {amount}',
  'expl.otherReceivesBullet': '{who} 将收到 {amount}',
  'expl.approvalRevokeBullet': '之后 {spender} 无法再动用 {whose} {symbol}',
  'expl.approvalUnlimitedBullet':
    '之后 {spender} 现在和将来都可以动用 {whose} 全部 {symbol}，直到 {revoker}',
  'expl.approvalLimitBullet': '之后 {spender} 可随时从 {whose} 钱包最多动用 {amount}',
  'expl.revokerYou': '你撤销',
  'expl.revokerThey': '对方撤销',
  'expl.your': '你的',
  'expl.possesiveOwner': '{owner} 的',
  'expl.networkFeeBullet': '网络费：约 {amount}（确认前钱包会显示确切数字）',
  'expl.warnOne': '⚠ 下方有 1 条严重警告——签名前请先阅读。',
  'expl.warnMany': '⚠ 下方有 {count} 条严重警告——签名前请先阅读。',

  /* Readiness score */
  'score.verdict.clear': '通过',
  'score.verdict.caution': '谨慎',
  'score.verdict.grounded': '拦截',
  'score.advice.fail': '这笔交易发送后会失败。签名只会让你损失网络费。',
  'score.advice.degraded':
    '我们只能对这笔交易做浅层检查，无法告诉你它会移动什么。请把这个分数当作"未知"，而不是认可。',
  'score.advice.grounded':
    '发现严重问题。决定前请阅读下方的警告——这类交易常让人后悔。',
  'score.advice.caution': '没有明显的硬伤，但有些地方值得在签名前再看一眼。',
  'score.advice.info': '一切正常。下方列出几条小提示。',
  'score.advice.clear': '一切正常——它只做你要求的事，不多不少。',

  /* Simulation drift */
  'drift.headline.material':
    '你阅读期间链上状态发生了变化——这笔交易现在做的事和之前不同了。',
  'drift.headline.cosmetic': '只有网络费估算有变动，交易本身做的事没有变化。',
  'drift.headline.none': '没有任何变化——计划仍然准确。',
  'drift.wouldGoThrough': '这笔交易现在会成功，而之前会失败。',
  'drift.wouldFail': '这笔交易现在会失败，而之前会成功。',
  'drift.amountFlip': '之前你会{wasVerb} {beforeAmount}；现在你将{nowVerb} {afterAmount}。',
  'drift.amountShift': '你现在将{nowVerb} {afterAmount}，而不是 {beforeAmount}。',
  'drift.verbSend': '发送',
  'drift.verbReceive': '收到',
  'drift.paymentToAppeared': '一笔 {amount} 的付款现在加入了这笔交易，收款方是 {party}。',
  'drift.paymentFromAppeared': '一笔 {amount} 的付款现在加入了这笔交易，付款方是 {party}。',
  'drift.paymentToGone': '给 {party} 的付款不再属于这笔交易。',
  'drift.paymentFromGone': '来自 {party} 的付款不再属于这笔交易。',
  'drift.approvalGone': '允许 {spender} 动用你的 {symbol} 的授权不再属于这笔交易。',
  'drift.approvalNewUnlimited': '这笔交易新增了一项授权：允许 {spender} 无限动用你的 {symbol}。',
  'drift.approvalNewCapped': '这笔交易新增了一项授权：允许 {spender} 最多动用你的 {amount}。',
  'drift.approvalNowUnlimited': '这笔授权现在是无限的，而之前有限额。',
  'drift.approvalNowCapped': '这笔授权现在限额为 {amount}，而之前是无限的。',
  'drift.approvalCapMoved': '{spender} 现在最多可动用 {amount}，而不是 {before}。',
  'drift.gasUp': '网络费估算上涨了。',
  'drift.gasDown': '网络费估算下降了。',
  'drift.gasMoved': '网络费估算略有变动。',
  'drift.notesChanged': '一些背景备注有变化，不影响交易本身。',

  /* Portfolio exposure */
  'port.headlineSome': '{n} 个代币当前可以被他人动用。',
  'port.headlineUnlimitedOne': '这个钱包上开着 1 个无限授权。',
  'port.headlineUnlimitedMany': '这个钱包上开着 {n} 个无限授权。',
  'port.headlineNone': '这个钱包里的资产没有人能动用。',
  'port.advice.unlimitedFundedOne':
    '先从 {names} 开始：撤销它的无限授权——你现在持有这个代币，随时可能被转走。',
  'port.advice.unlimitedFundedMany':
    '先从 {names} 开始：撤销它们的无限授权——你现在持有这些代币，随时可能被转走。',
  'port.advice.unlimitedEmpty':
    '你现在没有持有 {names}，但无限授权仍然开着。在存入资金前先撤销它——否则你存入的任何东西都可能马上被转走。',
  'port.advice.unlimitedUnknown':
    '{names} 上有无限授权，而我们无法读取你持有的 {itThem} 的余额——所以无法告诉你有多大风险。除非你知道它为什么存在，否则请当作未解决问题并撤销它。',
  'port.advice.itThemOne': '它',
  'port.advice.itThemMany': '它们',
  'port.advice.capped': '这些授权都有限额，但撤销不再使用的授权仍然最稳妥。',
  'port.advice.fee': '撤销授权是一笔普通交易，每一项都要花一点网络费。',
  'port.advice.noExpiry':
    '授权不会自己过期——它们会一直开着，直到你撤销，即使当初要求的应用早已消失。',

  /* Typed data (signature requests) */
  'td.permitHeadline': '这是一份代币授权签名——无需交易',
  'td.permit2Headline': '这是一份通过 Permit2 的代币授权签名——无需交易',
  'td.genericHeadline': '有人要求你签署结构化数据',
  'td.notTypedData':
    '这看起来不像签名请求。签名请求应包含 "types" 和 "message"，以及 "domain" 或 "primaryType"。',
  'td.amountCaveat': '原始代币单位——签名请求不含代币的小数位，所以我们无法按日常金额显示',
  'td.unreadableDate': '无法识别的日期',
  'td.neverExpires': '一个远到永远不会真正过期的日期',
  'td.amountUnlimited': '无限——可动用金额没有上限',
  'td.amountCapped': '{amount} {caveat}',
  'td.unlimitedRiskTitle': '无限支出授权',
  'td.unlimitedRiskDetail':
    '签名后 {spender} 可无限动用这个代币。签名静默完成、对方零成本——他们随时可能取走你的全部余额。',
  'td.expiredTitle': '这个请求已经过期',
  'td.expiredDetail': '请求中的截止时间已经过去，签名应该不会生效——合约会拒绝过期的签名。',
  'td.longDeadlineTitle': '很长时间内都可用',
  'td.longDeadlineDetail':
    '这份授权超过 30 天仍然有效（直到 {date}）。在此之前，持有签名的人可以在任何时刻使用它——即使你早已忘记。',
  'td.networkTitle': '针对的是另一个网络',
  'td.networkDetail':
    '这份签名针对的网络与你当前选择的网络不同。请确认该应用要求的正是你预期的网络。',
  'td.signatureMovesTitle': '签名可以转移资金',
  'td.signatureMovesDetail': '有些签名无需任何交易就能授权转移资金。只有信任提出请求的应用时才签名。',
  'td.cantReadAmount': '我们无法读取这份授权请求中的金额，因此无法安全地解释它。',
  'td.cantReadDeadline': '我们无法读取这份授权请求中的截止时间，因此无法安全地解释它。',
  'td.whoCanSpend': '谁可动用：{spender}',
  'td.howMuch': '可动用多少：{amount}',
  'td.useBy': '签名必须在此时间前使用：{date}',
  'td.deadlineClarify':
    '重要：那个日期限制的是签名何时可用——而不是授权持续多久。一旦使用，授权会一直开着，直到你撤销。',
  'td.tokenContract': '代币合约：{address}',
  'td.anyAmount': '任意金额',
  'td.statedAmount': '不超过声明的金额',
  'td.permitOutcome':
    '如果签名，{spender} 将被允许从你的钱包取走该代币{anyAmount}。签名免费，此刻不会移动任何东西——效果将在对方选择使用你的签名时生效，且由此产生的授权不会自动过期。',
  'td.cantReadAmountLabel': '我们无法读取请求中 {label} 的金额，因此无法安全地解释它。',
  'td.cantReadExpiryLabel': '我们无法读取请求中 {label} 的到期时间，因此无法安全地解释它。',
  'td.cantReadSigningDeadline': '我们无法读取请求中的签名截止时间，因此无法安全地解释它。',
  'td.cantReadTokenN': '我们无法读取请求中的代币 {n}，因此无法安全地解释它。',
  'td.theToken': '该代币',
  'td.tokenNLabel': '代币 {n}',
  'td.tokenN': '代币 {n}：{token}',
  'td.tokenNAmount': '代币 {n} 金额：{amount}',
  'td.tokenNUntil': '代币 {n} 的授权持续到：{date}',
  'td.token': '代币：{token}',
  'td.approvalUntil': '授权持续到：{date}',
  'td.nTokens': '{n} 个代币',
  'td.thisToken': '这个代币',
  'td.permit2Outcome':
    '如果签名，{spender} 就能在到期前通过 Permit2 系统从你的钱包取走{what}。签名免费，此刻不会移动任何东西——效果将在对方选择使用你的签名时生效。',
  'td.typeOfData': '数据类型：{type}',
  'td.appName': '应用或合约名称：{name}',
  'td.checkContract': '将校验这份签名的合约：{address}',
  'td.notSignedField': ' ——你的钱包不会签署此字段',
  'td.hiddenOne': '…还有 1 个未显示的字段。由于无法完整展示，请把这份请求当作未经审查处理。',
  'td.hiddenMany':
    '…还有 {count} 个未显示的字段。由于无法完整展示，请把这份请求当作未经审查处理。',
  'td.genericMore': '它还有超出我们可展示范围的更多字段。',
  'td.genericReadAll': '签名前请阅读下方每个字段，并确认与应用告诉你的内容一致。',
  'td.genericOutcome': '我们无法将这个请求匹配到已知模式，因此不能确切说明签名会带来什么。{more}',
  'td.notJson': '我们无法把这段文本解析为签名请求——它不是有效的 JSON。',
  'td.unreadable': '签名请求中有内容无法读取，因此我们无法安全地解释它。',
  'td.undeclaredTitle': '这个请求包含隐藏的多余字段',
  'td.undeclaredOne':
    '请求展示了 1 个多余字段（{names}），你的钱包不会签署它。诚实的应用不会这么做。这是让你签 A 却做 B 的已知骗术——不要签名。',
  'td.undeclaredMany':
    '请求展示了 {count} 个多余字段（{names}），你的钱包不会签署它们。诚实的应用不会这么做。这是让你签 A 却做 B 的已知骗术——不要签名。',
  'td.spenderNamed': '请求中指定的动用人',

  /* Delegation (EIP-7702) */
  'dl.selfDelegatedTitle': '你的钱包正在运行别人的代码',
  'dl.selfDelegatedDetail':
    '你的钱包当前运行着安装进它的代码，来源是 {where}。控制该代码的人无需再次征得同意就能转移你的资金。这一状态会一直持续到你移除它。',
  'dl.unreadableWhere': '一个无法读取的地址',
  'dl.recipientDelegatedTitle': '收款钱包装有程序',
  'dl.recipientDelegatedDetail':
    '你发送到的地址是一个装有程序的钱包。到达那里的资金可能刚落账就被自动卷走。',
  'dl.malformed': '我们无法读取这份签名请求。它的结构不符合预期，无法解释——不要签署任何你无法核实的东西。',
  'dl.revokeEntry': '此条目指向全零地址 {address}，作用是移除已安装的程序，而不是安装。',
  'dl.programEntry': '将运行在你钱包里的程序位于 {short}（完整地址：{full}）。',
  'dl.everyNetwork': '它同时适用于每一个网络，而不仅是某一个——这更糟，因为它还覆盖你从未用过的网络。',
  'dl.networkN': '它适用于网络编号 {n}。',
  'dl.networkUnreadable': '我们无法读取它适用于哪个网络。',
  'dl.selfAddress': '程序地址就是你的钱包地址——这很不寻常，诚实的应用通常不会这样要求。',
  'dl.installsInto': '如果签名，这个程序会被安装进你自己的钱包（{wallet}），之后可以以你的身份行事。',
  'dl.revokeDetailBase': '把你的钱包指向全零地址 {address} 是移除已安装程序、让钱包恢复正常的办法。',
  'dl.revokeRiskTitle': '这是移除程序，而不是安装',
  'dl.revokeRiskDetail': '{base} 请求中的地址全是零，所以这份请求是一次移除——安全的清理步骤。',
  'dl.revokeHeadline': '这会从你的钱包中移除一个程序',
  'dl.revokeOutcome':
    '这份签名把你的钱包指向全零地址，会关闭之前安装进钱包的任何程序。你的钱包将恢复为普通钱包，只有你签名时才行动。这是清理步骤，不是接管。',
  'dl.requestTitle': '有个程序想控制你的钱包',
  'dl.requestDetail':
    '签名会把一个程序安装进你的钱包，之后它就可以以你的身份行事——转移资金、授予权限，随时进行，无需再问你。日常应用不需要你这么做；这类请求多半是盗币企图。',
  'dl.anyChainTitle': '它将适用于每个网络',
  'dl.anyChainDetail':
    '这份请求使用网络编号 0，意味着它现在和将来都同时适用于每个网络。这比只限单个网络的请求更糟。',
  'dl.unknownNetworkTitle': '它针对的是另一个网络',
  'dl.unknownNetworkDetail':
    '这份请求适用于你当前所用网络之外的其他网络。针对意外网络的请求是常见骗术——请格外小心。',
  'dl.undoTitle': '如何撤销这类变更',
  'dl.undoDetail': '{base} 如果你不小心签过其中一份，请立即用那种方式移除它。',
  'dl.takeoverHeadline': '签名会让一个程序接管你的钱包',
'dl.takeoverOutcome':
    '这不是普通转账。它会向你的钱包安装一个程序，此后该程序可以以你的身份行事——转移资金、授予权限，无需再问你。它会一直存在，直到你把它替换成空地址；而且签名不花 gas，不会有费用提醒你。',

  /* Batch (EIP-5792) */
  'bt.cantReadBundle': '我们无法读取这批指令。',
  'bt.notFormat': '无法把这串文本解析为一组指令——它的格式我们不认识。',
  'bt.empty': '这批指令是空的。一批指令至少需要一条才能做任何事。',
  'bt.truncated': '这批指令共 {total} 条。我们只检查了前 {max} 条——其余完全没有检查。',
  'bt.ordinal': '{n}',
  'bt.invalidTo': '第 {position} 条指令的目标地址无效。',
  'bt.unreadableData': '第 {position} 条指令包含无法读取的数据，我们无法安全地检查它。',
  'bt.unreadableValue': '第 {position} 条指令的金额无法读取。',
  'bt.ordinal1st': '第 1',
  'bt.ordinal2nd': '第 2',
  'bt.ordinal3rd': '第 3',
  'bt.ordinalNth': '第 {n}',
  'bt.notAtomicNote': '这些指令可以分别落地，所以可能部分成功、部分失败。',
  'bt.longNote': '这是很长一串指令。长指令串很难检查，请对每一条格外上心。',
  'bt.describeOne': '这是 1 条指令，打包在一次确认里。',
  'bt.describeMany': '这是 {n} 条独立指令，打包在一次确认里。',
  'bt.atomicTail': ' 它们必须全部同时成功。',
  'bt.separateTail': ' 它们可以分别落地。',
  'bt.hiddenTitle': '一次确认包含多项操作',
  'bt.hiddenDetail':
    '批准这份请求即同时同意全部 {count} 条指令，而你的钱包可能只展示其中一条。继续前请先阅读下面每条指令。',
  'bt.notAtomicTitle': '这些指令可以分别落地',
  'bt.notAtomicDetail':
    '这些指令没有捆绑在一起——可能部分成功、部分失败。你可能只得到预期的一部分。',
  'bt.largeTitle': '这是一长串指令',
  'bt.largeDetail':
    '这一次确认背后有 {count} 条指令。长列表很难仔细检查，而且把坏指令藏进长列表是已知骗术。请对每条多加时间。',
  'bt.singleTitle': '里面只有一条指令',
  'bt.singleDetail': '这批指令只包含一条指令，所以它就像一笔普通单笔交易。',

  /* Signature triage */
  'insp.batchHeadline': '这是一次确认背后的多条指令',
  'insp.batchOutcome': '{description} 你的钱包可能只展示其中一条，批准前请阅读下面每一行。',
  'insp.batchCall': '指令 {index}：向 {to} 发送 {value} 条指令',
  'insp.batchCallNoValue': '指令 {index}：向 {to} 发送指令',
  'insp.notRecognized':
    '我们无法识别这个请求。PreFlight 可以解释签名请求（含 "types" 和 "message"）、钱包接管请求，或一批指令。',

  /* Spoofing defenses */
  'sp.lookalikeTitle': '这个地址在模仿你信任的地址',
  'sp.lookalikeDetail':
    '{target} 与你的已保存地址 {known} 首尾字符相同，但它是另一个完全不同的地址。骗子制造这类高仿地址并埋进你的交易历史，让复制粘贴把资金送到他们手里。请从地址主人那里重新复制地址——而不是从任何交易列表。',
  'sp.impersonationTitle': '这不是你所认识的 {symbol}',
  'sp.impersonationDetail':
    '{contract} 上的合约自称"{symbol}"，但你教给 PreFlight 的 {known} 位于 {knownAddress}。代币符号并不唯一——任何人都可以部署一个顶着名人名字的代币。请把它当作一个戴着名牌的陌生人。',
  'sp.zeroTransferTitle': '这笔转账实际上什么也不转',
  'sp.zeroTransferDetail':
    '零金额转账不会移动任何代币，唯一作用是在交易历史里留下一笔事件。这正是地址投毒的原料——如果这不是你有意发送的空转账，请拒绝。',

  /* Approval scanner */
  'appr.networkError': '我们无法连上网络获取最新区块，授权扫描未能执行。请重试。',
  'appr.scanNote': '已扫描最近 {count} 个区块——更早的授权暂时不会显示在这里。',
  'appr.failedRangeOne': '有 1 个区块范围无法读取，这份列表可能不完整。把它当作完整结果前请重新扫描。',
  'appr.failedRangeMany': '有 {n} 个区块范围无法读取，这份列表可能不完整。把它当作完整结果前请重新扫描。',
  'appr.skippedOne': '这个钱包的授权很多——我们检查了最近 {max} 条，并跳过了 1 条更早的。',
  'appr.skippedMany': '这个钱包的授权很多——我们检查了最近 {max} 条，并跳过了 {skipped} 条更早的。',
  'appr.tokenDegraded': '{address} 上的代币没有返回详情，所以我们显示缩短地址并按 18 位小数处理。',
  'appr.unverifiedOne': '我们还发现 1 条授权，但无法读取它的当前状态，因此未列入上方列表。',
  'appr.unverifiedMany': '我们还发现 {n} 条授权，但无法读取它们的当前状态，因此未列入上方列表。',

  /* Balances */
  'bal.failedOne': '我们此刻无法检查你的 {name} 余额，所以没有显示。',
  'bal.failedMany': '我们此刻无法检查这些代币的余额，所以没有显示：{names}。',

  /* Post-flight verification lines */
  'pf.outcome': '结果',
  'pf.willSucceed': '将成功',
  'pf.wouldFail': '将失败',
  'pf.succeeded': '已成功',
  'pf.reverted': '已回滚',
  'pf.movementLabel': '{symbol} 变动',
  'pf.youSent': '你发送了 {amount}',
  'pf.youReceived': '你收到了 {amount}',
  'pf.unexpected': '意外的代币变动',
  'pf.nothing': '无',
  'pf.sentRaw': '你发送了 {amount} 个原始单位的代币，合约在 {address}',
  'pf.receivedRaw': '你收到了 {amount} 个原始单位的代币，合约在 {address}',
  'pf.monMovement': 'MON 变动',
  'pf.notRecorded': '收据中未记录',
  'pf.noteUnrecorded':
    '收据不记录合约调用内部转移的 MON，所以我们无法独立确认这一点。请以你的钱包余额为准。',
  'pf.permissionLabel': '{symbol} 授权',
  'pf.unlimitedGranted': '已授予无限支出权限',
  'pf.cappedGranted': '已授予最多 {amount} 的支出权限',
  'pf.confirmedChange': '代币确认了授权变更',
  'pf.noChangeRecorded': '未记录授权变更',
  'pf.notePermission': '代币报告了授权变更，但确切的剩余金额存放在合约里——请到机库查看。',
  'pf.feeLabel': '网络费',
  'pf.about': '约 {amount}',
  'pf.noteFee': '费用估算永远是近似值；这里是你实际被收取的金额。',

  /* Flight report */
  'rep.footer': '由 Monad PreFlight 生成——模拟只是对当时链上状态尽力而为的预览，并非保证。',
  'rep.severityDanger': '[危险]',
  'rep.severityCaution': '[注意]',
  'rep.severityInfo': '[提示]',
  'rep.verdictMatched': '结论：我们在链上核对的每项都与模拟一致。',
  'rep.verdictMatchedPartial':
    '结论：我们能够核对的每项都与模拟一致。标为"未核对"的行在交易收据中没有记录，因此无法独立确认。',
  'rep.verdictMismatched': '结论：链上的部分结果与模拟不一致——请看标 ✗ 的行。',
  'rep.simSection': '模拟显示的内容',
  'rep.warningsSection': '警告',
  'rep.postflightSection': '落地核对',
  'rep.tableHeader': '| 检查项 | 模拟 | 实际 | 匹配 |',
  'rep.notChecked': '– 未核对',
  'rep.txHash': '交易哈希：`{hash}`',
  'rep.explorerLink': '[在区块浏览器上查看这笔交易]({href})',

  /* Address book */
  'book.needName': '请给这个联系人起个名字。',
  'book.tooLong': '名字太长了。请控制在 24 个字符以内。',
  'book.startsOx': '名字不能以 "0x" 开头——那看起来像地址，容易混淆。请换一个名字。',
  'book.numbersOnly': '名字不能全是数字——那可能被误认为是金额。请至少包含一个字母。',
  'book.allowedChars': '名字只能使用字母、数字、连字符（-）和下划线（_），不能有空格。',
  'book.badAddress':
    '这个地址看起来不对。真实地址以 "0x" 开头，后跟 40 位字母和数字。请复制完整地址后重新粘贴。',

  /* Wallet connect */
  'wallet.noAccount': '你的钱包没有共享账户。',

  /* Intent parser */
  'int.empty': '告诉我你想做什么，我会替你准备好。',
  'int.rawNotJson': '这看起来是一笔 JSON 形式的交易，但 JSON 无效——请从来源应用重新复制。',
  'int.rawNotObject': '原始交易应为包含至少一个 "to" 地址的 JSON 对象。',
  'int.rawNoTo': '原始交易需要 "to" 地址——0x 后跟 40 位十六进制字符。',
  'int.rawNumberNote': '该值是纯数字，所以我把它当作 MON 金额。',
  'int.wrapMixed':
    '你混用了包装操作和第二个动作，静默处理一半比直接询问更糟。请拆成步骤——例如"wrap 1 MON then send 0.5 WMON to 0x…"（"然后"也可以）。',
  'int.wrapIgnoredAddress': '包装完全在你自己的钱包内发生，所以我忽略了你消息里的地址。',
  'int.wrapAllFails':
    '包装全部余额会没有 MON 支付网络费，交易会失败。请改为数字，例如"wrap 1 MON"。',
  'int.wrapHowMuch': '你想包装多少 MON？请加上金额，例如"wrap 1 MON"。',
  'int.unwrapHowMuch': '你想解包多少 WMON？请加上金额，例如"unwrap 2 WMON"——或说"全部"。',
  'int.noAction':
    '我没弄清楚你想做什么。我可以发送 MON 或代币、授权支出、撤销授权，或在 MON 与 WMON 之间转换。',
  'int.halfAmbiguous': '"一半"有歧义——余额在你签名前可能变化。请说出确切金额。',
  'int.needRecipient': '我需要收款方——请提供完整地址（0x 后跟 40 个字符）。',
  'int.needSpender': '我需要授权对象的地址——应用或钱包的完整 0x… 地址。',
  'int.tooManyAddresses': '找到两个以上的地址——我采用了前几个，忽略了其余。',
  'int.twoAddressesSend': '找到两个地址——我把 {first}… 当作收款方，{second}… 当作代币。',
  'int.twoAddressesApprove': '找到两个地址——我把 {first}… 当作授权对象，{second}… 当作代币。',
  'int.unlimitedSend': '"无限"只对授权有意义。要发送，请给数字——或说"全部"发送全部余额。',
  'int.sendHowMuch': '你想发送多少？请加上金额，例如"send 0.5 MON to 0x…"，或说"全部"。',
  'int.allAndNumber': '你的消息同时提到"全部"和数字 {n}——我采用了 {n}。想全部发送就说"全部"。',
  'int.tokenNameUnreadable':
    '我无法读取其中的代币名称。请用符号称呼（如 tUSD 或 WMON），或粘贴代币合约地址。',
  'int.assumedNative': '没有提到代币名称——我默认指原生 MON。',
  'int.severalTokens': '有好几个词可能是代币名称——我采用了"{token}"。',
  'int.approveWhichToken':
    '这笔授权针对哪个代币？MON 本身无法授权——请指名代币，例如"approve 0x… to spend 100 tUSD"。',
  'int.approveHowMuch': '他们最多可动用多少？请给出金额，或说"unlimited"。',
  'int.revokeWhichToken': '你想撤销哪个代币的授权？请指名，例如"revoke 0x…\'s access to my tUSD"。',

  /* Transaction builder */
  'tb.invalidAddress':
    '"{value}" 不是有效的 {what}——地址以 0x 开头、共 42 个字符。请仔细检查拼写。',
  'tb.what.recipient': '收款地址',
  'tb.what.spender': '授权对象地址',
  'tb.what.token': '代币地址',
  'tb.what.to': '"to" 地址',
  'tb.what.sender': '发送方地址（你的钱包）',
  'tb.needRecipient': '我需要收款方——请提供你想发送到的地址（0x…）。',
  'tb.needSpender': '我需要知道哪个应用或地址获得支出权限——请提供它的地址（0x…）。',
  'tb.tokenReadFailed': '我无法读取 {address} 上的代币详情。',
  'tb.unknownToken': '我还不知道"{token}"这个代币——粘贴一次它的合约地址，我就会记住。',
  'tb.invalidAmount': '"{value}" 不是有效金额。',
  'tb.balanceTooSmall': '你的 MON 余额太少，留出 {amount} gas 费后没有余钱可发。',
  'tb.gasNote': '（保留 {amount} 作为 gas 费）',
  'tb.howMuchMon': '你想发送多少 MON？请加上金额，例如"send 0.5 MON"。',
  'tb.noTokenBalance': '你没有可发送的 {symbol}。',
  'tb.howMuchToken': '你想发送多少 {symbol}？请加上金额，例如"send 10 {symbol}"。',
  'tb.approveNativeMon':
    'MON 本身无法授权——授权是代币的特性。MON 是原生币：只有发送才会移动。请改指代币，例如"approve 100 tUSD for 0x…"。',
  'tb.approveHowMuch': '{spender} 最多可动用多少 {symbol}？请给出金额，或说"unlimited"。',
  'tb.revokeNativeMon':
    '你想撤销哪个代币的授权？MON 本身无法授权，所以没有 MON 授权可撤销——请指名代币，例如"revoke tUSD access for 0x…"。',
  'tb.wrapUnavailable': '此网络暂不支持包装。',
  'tb.wrapAllFails': '包装全部余额会没有 MON 支付网络费，交易会失败。请改为数字，例如"wrap 1 MON"。',
  'tb.wrapHowMuch': '你想包装多少 MON？请加上金额，例如"wrap 1 MON"。',
  'tb.unwrapEmpty': '你没有可解包的 WMON。',
  'tb.unwrapHowMuch': '你想解包多少 WMON？请加上金额，例如"unwrap 2 WMON"，或说"全部"。',
  'tb.rawMissing': '请粘贴交易详情（至少包含 "to" 地址），我会在签名前解释它。',
  'tb.rawBadData':
    '交易数据无效——它应为 "0x" 后跟成对的十六进制字符（0-9、a-f）。请从来源应用重新复制。',
  'tb.rawBadValue': '交易金额看起来像十六进制但无效——它应为 "0x" 后跟十六进制字符（0-9、a-f）。',
  'tb.rawBadAmount': '"{value}" 不是有效的 MON 金额。',
  'tb.summarySend': '发送 {amount} 到 {address}',
  'tb.summaryApproveAll': '允许 {spender} 花掉你所有的 {symbol}（无限额度）',
  'tb.summaryRevokeZero': '撤销 {spender} 对你 {symbol} 的访问权限（批准 0 即移除其权限）',
  'tb.summaryApprove': '允许 {spender} 最多动用 {amount}',
  'tb.summaryRevoke': '撤销 {spender} 对你 {symbol} 的访问权限',
  'tb.summaryWrap': '将 {amount} 封装为 WMON',
  'tb.summaryUnwrap': '将 {amount} 解封回 MON',
  'tb.summaryRaw': '到 {address} 的自定义交易',

  /* Simulator notes */
  'sim.walletFeeNote': '签名前你的钱包会显示确切的网络费。',
  'sim.fallbackNote': '此 RPC 不支持深度模拟——改用了基础检查。',
  'sim.noReason': '合约拒绝了交易，但没有给出原因。',
  'sim.noReadableReason': '合约拒绝了交易，但没有给出可读的原因。',
  'sim.panic.assertion': '断言失败',
  'sim.panic.overflow': '算术溢出',
  'sim.panic.division': '除数为零',
  'sim.panic.index': '索引越界',
  'sim.panic.code': '内部错误代码 0x{code}',
  'sim.contractStopped': '合约中止了交易：{reason}。',
  'sim.contractStoppedInternal': '合约因内部错误中止了交易。',
  'sim.customError': '合约以自定义错误 {selector} 拒绝了交易。',
  'sim.httpStatus': 'RPC 服务器对 {method} 返回了 HTTP {status}。',
  'sim.rpcError': 'RPC 错误 {code}：{method}',
  'sim.networkDownOne': '我们无法连接网络。尝试了 1 个端点，但它没有响应。请检查连接后重试。',
  'sim.networkDownMany': '我们无法连接网络。尝试了 {n} 个端点，但都没有响应。请检查连接后重试。',
  'sim.feeUnavailable': '我们无法读取当前网络 gas 价格，费用估算可能显示为零。',
  'sim.gasEstimateFail': '网络拒绝给出完整 gas 估算，显示的 gas 可能略低。',
  'sim.gasNeeds': '我们无法估算这笔交易需要多少 gas。',

  /* Token registry */
  'token.detailsFailed':
    '我无法读取 {address} 上的代币详情——那个地址可能不是代币合约。请检查你从哪里复制的。',

  /* Wallet health */
  'wh.headline.fail': '你的钱包现在需要处理。',
  'wh.headline.unknown': '我们无法检查所有项目——请不要把它当作健康证明。',
  'wh.headline.warn': '大体健康，但有几点值得清理。',
  'wh.headline.pass': '我们能检查的项目都健康。',
  'wh.label.delegation': '钱包接管',
  'wh.delegationUnknown': '我们无法读取你的钱包是否在运行安装的代码。',
  'wh.delegationAt': ' 位于 {address}',
  'wh.delegationFail':
    '你的钱包上安装了程序{where}，它可以以你的身份行事。如果这不是你自己设置的，请先移除它再做其他事。',
  'wh.delegationPass': '你的钱包是普通钱包——没有程序冒充你。',
  'wh.label.unlimited': '无限支出授权',
  'wh.unlimitedUnknown':
    '我们的扫描无法覆盖全部，因此无法确定你有多少个无限支出授权。请不要把它当作健康证明。',
  'wh.unlimitedPass': '你没有无限支出授权——没有人能一次掏空你整个代币。',
  'wh.unlimitedWarnOne':
    '你有 1 个无限支出授权。每个都允许某人随时转走该代币的全部余额——请撤销不再使用的。',
  'wh.unlimitedWarnTwo':
    '你有 2 个无限支出授权。每个都允许某人随时转走该代币的全部余额——请撤销不再使用的。',
  'wh.unlimitedFail':
    '你有 {count} 个无限支出授权。每个都允许某人随时转走该代币的全部余额——请撤销不再使用的。',
  'wh.label.exposure': '他人可转走的资金',
  'wh.exposureUnknown': '我们无法确定你持有的哪些代币当前可以被他人取走。',
  'wh.exposurePass': '你持有的代币当前没有一项能被他人取走。',
  'wh.exposureWarnOne':
    '你钱包里有 1 个代币被他人持有的授权覆盖——他们无需再问你就能取走。',
  'wh.exposureWarnMany':
    '你钱包里有 {count} 个代币被他人持有的授权覆盖——他们无需再问你就能取走。',
  'wh.label.funds': '脱身的 gas 费',
  'wh.fundsUnknown': '我们无法读取你的钱包持有多少 MON。',
  'wh.fundsWarn':
    '你的钱包没有 MON。每项操作都要花一点网络费，所以你现在连撤销授权都做不到——没有一点 MON 付手续费，你无法脱身。',
  'wh.fundsPass':
    '你的钱包持有 MON，需要时可以支付网络费采取行动——包括撤销授权。',

  /* Counterparty reputation */
  'rep2.approvalWalletReason': '这个地址是个人钱包，不是合约——钱包永远不需要授权才能动用你的代币。',
  'rep2.approvalWalletTitle': '把代币权限交给个人钱包',
  'rep2.approvalWalletDetail':
    '你将让一个个人钱包动用你的代币。正规应用要求你授权的是合约，而不是个人——这是盗币诈骗的典型套路。',
  'rep2.drainerReason': '最近有 {owners} 个人授予了这个地址代币权限，而它只被使用过 {times}。',
  'rep2.drainerTitle': '符合新出现的诈骗活动模式',
  'rep2.drainerDetail':
    '最近有 {owners} 个人授予了这个地址代币权限，但它只被使用过 {times}。大量新授权却几乎没有活动，正是刚开张的骗局的标志。',
  'rep2.tinyReason': '这个合约只有 {bytes} 字节代码——正规应用要大得多。',
  'rep2.tinyTitle': '这个合约小得可疑',
  'rep2.tinyDetail':
    '这个地址上的合约只有 {bytes} 字节——正规应用要大得多。这种一次性微型合约在盗币工具包里很常见，请格外小心。',
  'rep2.neverUsedReason': '这个地址被使用过 {times}，且没有任何余额。',
  'rep2.neverUsedTitle': '这个地址从未被使用过',
  'rep2.neverUsedDetail':
    '它没有历史、没有余额——可能是全新的，也可能是打错的。请逐字符核对，因为交易无法撤销。',
  'rep2.timesOne': '1 次',
  'rep2.timesMany': '{n} 次',
  'rep2.establishedUsed': '这个合约已被使用过 {times}。',
  'rep2.establishedCode': '它带有 {bytes} 字节的合约代码——正规可用应用的规模。',
  'rep2.ordinaryUsed': '这个{what}已被使用过 {times}。',
  'rep2.whatProgram': '合约',
  'rep2.whatAddress': '地址',
  'rep2.ordinaryBalance': '它当前持有约 {amount} MON。',
  'rep2.label.suspicious': '疑似诈骗模式',
  'rep2.label.established': '使用频繁的合约',
  'rep2.label.thin': '从未使用过',
  'rep2.label.ordinaryProgram': '普通合约',
  'rep2.label.ordinaryWallet': '普通钱包',

  /* Contract fingerprinting */
  'fp.eoaLabel': '个人钱包',
  'fp.eoaDetail': '这个地址是个人钱包，不是合约。持有其私钥的人控制它及它拥有的一切。',
  'fp.minimalLabel': '指向另一合约的微型转发器',
  'fp.minimalDetail':
    '这个地址几乎没有自己的代码——真正的代码在另一个地址 {address}，你发送到这里的一切都会被转发过去。该目标已固化，之后无法更改。',
  'fp.proxyLabel': '另一合约的门面',
  'fp.proxyDetail':
    '这个地址只是门面：真正的代码在另一个地址 {address}。控制这个门面的人可以随时把代码换成别的东西，所以它今天的行为不保证明天依然如此。',
  'fp.erc721Label': '收藏品代币（NFT）',
  'fp.erc721Detail': '这个合约管理独特的收藏品——每件都不同，且同一时间只属于一个所有者。',
  'fp.erc20Label': '代币',
  'fp.erc20Detail': '这个合约是常规代币：为每个钱包记账，并在所有者要求时移动余额。',
  'fp.multisigLabel': '共享或智能钱包',
  'fp.multisigDetail':
    '这看起来是一个本身就是合约的钱包——通常是多人共享，只有足够多的人同意后资金才会移动。',
  'fp.unknownLabel': '合约（用途未知）',
  'fp.unknownDetail':
    'PreFlight 无法识别这个合约的用途，请不要只依赖它的名称或地址——请以模拟结果为准。',

  /* Fee oracle */
  'go.verdict.quiet': '网络空闲——当前费用较低。',
  'go.verdict.normal': '费用与这个网络的通常水平相当。',
  'go.verdict.high': '当前费用偏高。',
  'go.verdict.noComparison': '我们无法把这个费用与近期区块比较。',
  'go.advice.wait': '如果这事不急，等几分钟可能更省钱。',
  'go.note.congestion': '近期区块几乎满载，费用可能继续上涨。',
  'go.note.historyUnavailable': '我们无法从网络读取近期费用数据，因此无法判断这笔费用是高是低。',
  'go.note.priceUnavailable': '我们也无法读取当前网络费用，此处显示的费用可能为零。',
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
