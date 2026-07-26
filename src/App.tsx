import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  Address,
  Hex,
  ParsedIntent,
  ParseFailure,
  PostFlightCheck,
  PreparedTx,
  RiskContext,
  RiskFinding,
  SimulationResult,
  TokenInfo,
  Explanation,
} from './lib/types';
import type { NetworkKey } from './lib/networks';
import {
  DEFAULT_NETWORK,
  NETWORKS,
  addressUrl,
  getPublicClient,
  isNetworkKey,
  makeNetworkRpc,
  txUrl,
} from './lib/networks';
import { isAddressFormat } from './lib/format';
import { parseIntent } from './lib/intent';
import { BuildError, buildTx } from './lib/txbuilder';
import { addToken, createRegistry, findToken, viemChainReader } from './lib/tokens';
import { simulateTx } from './lib/simulate';
import { assessRisks } from './lib/risk';
import { composeExplanation } from './lib/explain';
import { comparePostFlight } from './lib/postflight';
import { scorePlan } from './lib/score';
import type { Readiness } from './lib/score';
import type { DriftReport } from './lib/drift';
import { compareSimulations } from './lib/drift';
import { assessCounterparty } from './lib/reputation';
import { readFees } from './lib/gasoracle';
import type { FeeReading } from './lib/gasoracle';
import { fingerprintAddress } from './lib/fingerprint';
import type { Fingerprint } from './lib/fingerprint';
import { formatTokenAmount } from './lib/format';
import type { ApprovalRecord, ApprovalScan } from './lib/approvals';
import { scanApprovals } from './lib/approvals';
import type { FlightRecord } from './lib/history';
import { clearFlights, loadFlights, recordFlight } from './lib/history';
import { flightReportMarkdown } from './lib/report';
import { fetchBalances } from './lib/balances';
import { computeExposure } from './lib/portfolio';
import type { Lang } from './lib/i18n';
import { detectLang, saveLang, t as translate } from './lib/i18n';
import { decodeShareLink, encodeShareLink } from './lib/sharelink';
import { installShortcuts } from './lib/shortcuts';
import { loadBook, resolveNames } from './lib/addressbook';
import type { AddressBookEntry } from './lib/addressbook';
import {
  connect,
  ensureNetwork,
  getConnectedAccount,
  getInjectedProvider,
  getWalletChainId,
  onAccountsChanged,
  onChainChanged,
  sendTransaction,
  waitForReceipt,
} from './lib/wallet';
import { aiNarrative, aiParseIntent, createAiClient } from './lib/claude';
import { StatusStrip } from './components/StatusStrip';
import { IntentConsole } from './components/IntentConsole';
import { FlightPlan } from './components/FlightPlan';
import { PostFlight } from './components/PostFlight';
import { SettingsDrawer } from './components/SettingsDrawer';
import { ApprovalHangar } from './components/ApprovalHangar';
import { FlightLog } from './components/FlightLog';
import { SignatureExplainer } from './components/SignatureExplainer';
import { ObserverPanel } from './components/ObserverPanel';

type Phase =
  | 'idle'
  | 'planning'
  | 'ready'
  | 'signing'
  | 'pending'
  /** Broadcast, but we lost track of it. Never returns to a signable state. */
  | 'sent'
  | 'landed';
type View = 'fly' | 'hangar' | 'sign' | 'observer' | 'log';

const VIEW_ORDER: View[] = ['fly', 'hangar', 'sign', 'observer', 'log'];

interface Plan {
  tx: PreparedTx;
  sim: SimulationResult;
  risks: RiskFinding[];
  explanation: Explanation;
  readiness: Readiness;
  /** When the simulation was taken — drift detection compares against this. */
  simulatedAtMs: number;
  fees: FeeReading | null;
  counterparty: Fingerprint | null;
  /**
   * The on-chain facts the risk rules ran against. Kept so a pre-sign
   * re-check re-runs the SAME rules — otherwise a refreshed plan could
   * show fewer warnings than the original, which reads as "it got safer".
   */
  riskContext: RiskContext;
  /** Extra findings from counterparty reputation, re-applied on re-check. */
  reputationFindings: RiskFinding[];
}

const LS_API_KEY = 'preflight.apiKey';
const LS_AI_PROXY = 'preflight.aiProxyUrl';
const LS_NETWORK = 'preflight.network';
const tokensKey = (net: NetworkKey) => `preflight.tokens.${net}`;

function loadTokens(net: NetworkKey): TokenInfo[] {
  try {
    const raw = localStorage.getItem(tokensKey(net));
    return raw ? (JSON.parse(raw) as TokenInfo[]) : [];
  } catch {
    return [];
  }
}

function plainError(err: unknown): string {
  if (err instanceof BuildError) return err.message;
  const msg = err instanceof Error ? err.message : String(err);
  return msg.length > 220 ? `${msg.slice(0, 220)}…` : msg;
}

export default function App() {
  const provider = useMemo(() => getInjectedProvider(), []);

  const [lang, setLang] = useState<Lang>(() => detectLang());
  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => translate(lang, key, vars),
    [lang],
  );

  const [networkKey, setNetworkKey] = useState<NetworkKey>(() => {
    const stored = localStorage.getItem(LS_NETWORK);
    return isNetworkKey(stored) ? stored : DEFAULT_NETWORK;
  });
  const network = NETWORKS[networkKey];
  const client = useMemo(() => getPublicClient(network), [network]);
  const rpc = useMemo(() => makeNetworkRpc(network), [network]);
  const reader = useMemo(() => viemChainReader(client), [client]);

  const [view, setView] = useState<View>('fly');
  const [account, setAccount] = useState<Address | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_API_KEY) ?? '');
  const [aiProxyUrl, setAiProxyUrl] = useState(
    () => localStorage.getItem(LS_AI_PROXY) ?? '',
  );
  const aiAvailable = Boolean(apiKey || aiProxyUrl);
  const [tokens, setTokens] = useState<TokenInfo[]>(() => loadTokens(networkKey));
  const [book, setBook] = useState<AddressBookEntry[]>(() => loadBook());
  const [addTokenBusy, setAddTokenBusy] = useState(false);
  const [addTokenError, setAddTokenError] = useState<string | null>(null);

  const [input, setInput] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [plan, setPlan] = useState<Plan | null>(null);
  const [parseSource, setParseSource] = useState<'rules' | 'ai' | null>(null);
  const [parseFailure, setParseFailure] = useState<ParseFailure | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<Hex | null>(null);
  const [postflight, setPostflight] = useState<PostFlightCheck | null>(null);

  const [scan, setScan] = useState<ApprovalScan | null>(null);
  const [scanning, setScanning] = useState(false);
  const [flights, setFlights] = useState<FlightRecord[]>(() => loadFlights(networkKey));
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [drift, setDrift] = useState<DriftReport | null>(null);

  const registry = useMemo(() => createRegistry(tokens), [tokens]);

  const refreshBalance = useCallback(
    (addr: Address | null) => {
      if (!addr) return setBalanceWei(null);
      client
        .getBalance({ address: addr })
        .then(setBalanceWei)
        .catch(() => setBalanceWei(null));
    },
    [client],
  );

  /* ---- wallet lifecycle ---- */

  useEffect(() => {
    if (!provider) return;
    getConnectedAccount(provider).then(setAccount);
    getWalletChainId(provider).then(setWalletChainId).catch(() => {});
    const offAccounts = onAccountsChanged(provider, (accounts) => {
      setAccount(accounts[0] ?? null);
    });
    const offChain = onChainChanged(provider, (hex) => {
      setWalletChainId(Number.parseInt(hex, 16));
    });
    return () => {
      offAccounts();
      offChain();
    };
  }, [provider]);

  useEffect(() => {
    refreshBalance(account);
  }, [account, refreshBalance]);

  // A shared link pre-fills the console — never auto-signs, never auto-runs.
  useEffect(() => {
    const shared = decodeShareLink(window.location.href);
    if (!shared) return;
    setInput(shared.text);
    if (isNetworkKey(shared.network)) setNetworkKey(shared.network);
  }, []);

  const resetFlight = useCallback(() => {
    setPlan(null);
    setPostflight(null);
    setTxHash(null);
    setParseSource(null);
    setParseFailure(null);
    setErrorMsg(null);
    setCopied(false);
    setPhase('idle');
  }, []);

  const handleSelectNetwork = (key: NetworkKey) => {
    if (key === networkKey) return;
    setNetworkKey(key);
    localStorage.setItem(LS_NETWORK, key);
    setTokens(loadTokens(key));
    setFlights(loadFlights(key));
    setScan(null);
    resetFlight();
  };

  const handleSelectLang = (next: Lang) => {
    setLang(next);
    saveLang(next);
  };

  const handleConnect = async () => {
    if (!provider) return;
    setConnecting(true);
    setErrorMsg(null);
    try {
      const a = await connect(provider);
      setAccount(a);
      await ensureNetwork(provider, network);
      setWalletChainId(await getWalletChainId(provider));
    } catch (err) {
      setErrorMsg(plainError(err));
    } finally {
      setConnecting(false);
    }
  };

  const handleSwitchWalletNetwork = async () => {
    if (!provider) return;
    try {
      await ensureNetwork(provider, network);
      setWalletChainId(await getWalletChainId(provider));
    } catch (err) {
      setErrorMsg(plainError(err));
    }
  };

  /* ---- settings ---- */

  const handleApiKeyChange = (key: string) => {
    setApiKey(key);
    if (key) localStorage.setItem(LS_API_KEY, key);
    else localStorage.removeItem(LS_API_KEY);
  };

  const handleAiProxyUrlChange = (url: string) => {
    setAiProxyUrl(url);
    if (url) localStorage.setItem(LS_AI_PROXY, url);
    else localStorage.removeItem(LS_AI_PROXY);
  };

  const persistTokens = useCallback(
    (list: TokenInfo[]) => {
      setTokens(list);
      localStorage.setItem(tokensKey(networkKey), JSON.stringify(list));
    },
    [networkKey],
  );

  const handleAddToken = async (address: string) => {
    setAddTokenError(null);
    if (!isAddressFormat(address)) {
      setAddTokenError('That is not a valid contract address (0x + 40 hex characters).');
      return;
    }
    setAddTokenBusy(true);
    try {
      const info = await reader.fetchTokenInfo(address);
      persistTokens(addToken(registry, info).tokens);
    } catch (err) {
      setAddTokenError(plainError(err));
    } finally {
      setAddTokenBusy(false);
    }
  };

  /* ---- the core flow: parse → build → simulate → assess → explain ---- */

  const prepareFromText = useCallback(
    async (rawText: string) => {
      if (!account) return;
      setView('fly');
      setPhase('planning');
      setPlan(null);
      setParseFailure(null);
      setErrorMsg(null);
      setPostflight(null);
      setTxHash(null);
      setParseSource(null);
      setCopied(false);

      try {
        // 0. Swap saved names ("alice") for their addresses before parsing.
        const { text, resolved } = resolveNames(rawText.trim(), book);
        const bookNotes = resolved.map(
          (e) => `"${e.name}" is your saved name for ${e.address}.`,
        );

        // 1. Parse: rules first; Claude as fallback when AI is configured.
        let intent: ParsedIntent | null = null;
        let source: 'rules' | 'ai' = 'rules';
        const ruleResult = parseIntent(text);
        if (ruleResult.ok) {
          intent = ruleResult.intent;
        } else if (aiAvailable) {
          try {
            intent = await aiParseIntent(
              createAiClient(apiKey, aiProxyUrl || undefined),
              text,
            );
            source = 'ai';
          } catch {
            intent = null;
          }
        }
        if (!intent) {
          setParseFailure(
            ruleResult.ok
              ? { ok: false, reason: 'Could not understand that.', suggestions: [] }
              : ruleResult,
          );
          setPhase('idle');
          return;
        }
        intent.notes = [...bookNotes, ...intent.notes];
        setParseSource(source);

        // 2. Build the unsigned transaction.
        const tx = await buildTx(intent, account, {
          registry,
          reader,
          wmon: network.wmon,
        });

        if (tx.token?.address && !findToken(registry, tx.token.address)) {
          persistTokens(addToken(registry, tx.token).tokens);
        }

        // 3. Simulate against live chain state.
        const sim = await simulateTx(tx, rpc);

        // 4. Gather on-chain facts for the risk rules.
        const probe = tx.counterparty ?? tx.to;
        const [senderBalanceWei, cpCode, cpTxCount, cpBalance, tokenCode] =
          await Promise.all([
            client.getBalance({ address: tx.from }),
            client.getCode({ address: probe }).catch(() => null),
            client.getTransactionCount({ address: probe }).catch(() => null),
            client.getBalance({ address: probe }).catch(() => null),
            tx.token?.address
              ? client.getCode({ address: tx.token.address }).catch(() => null)
              : Promise.resolve(null),
          ]);
        const ctx: RiskContext = {
          senderBalanceWei,
          counterpartyIsContract:
            cpCode === null ? undefined : Boolean(cpCode && cpCode !== '0x'),
          counterpartyTxCount: cpTxCount ?? undefined,
          counterpartyBalanceWei: cpBalance ?? undefined,
          tokenIsContract: !tx.token?.address
            ? undefined
            : tokenCode === null
              ? undefined
              : Boolean(tokenCode && tokenCode !== '0x'),
        };

        // 5. Risk rules, plus on-chain counterparty reputation.
        const risks = assessRisks(tx, sim, ctx);
        const reputationFindings: RiskFinding[] = [];
        if (ctx.counterpartyIsContract !== undefined) {
          const rep = assessCounterparty(
            {
              isContract: ctx.counterpartyIsContract,
              txCount: ctx.counterpartyTxCount ?? 0,
              balanceWei: ctx.counterpartyBalanceWei ?? 0n,
              codeSize: cpCode && cpCode !== '0x' ? (cpCode.length - 2) / 2 : 0,
            },
            { isApprovalTarget: tx.kind === 'erc20-approve' },
          );
          // Only add findings the rule engine did not already raise.
          for (const f of rep.findings) {
            if (!risks.some((r) => r.title === f.title)) reputationFindings.push(f);
          }
          risks.push(...reputationFindings);
        }

        // 6. Score and explanation.
        const readiness = scorePlan(sim, risks);
        const explanation = composeExplanation(tx, sim, risks, account);
        if (bookNotes.length > 0) explanation.bullets.push(...bookNotes);

        // 7. Fee intelligence and counterparty identity — both optional
        //    extras; a failure here must never block the flight plan.
        const [fees, counterparty] = await Promise.all([
          readFees(rpc, sim.gasUsed).catch(() => null),
          tx.counterparty
            ? fingerprintAddress(
                {
                  getCode: (a) => client.getCode({ address: a }).then((c) => c ?? '0x'),
                  getStorageAt: (a, slot) =>
                    client.getStorageAt({ address: a, slot }).then((v) => v ?? '0x'),
                  call: (a, data) =>
                    client
                      .call({ to: a, data })
                      .then((r) => r.data ?? '0x')
                      .catch(() => '0x'),
                },
                tx.counterparty,
              ).catch(() => null)
            : Promise.resolve(null),
        ]);
        if (counterparty && counterparty.kind !== 'eoa') {
          explanation.bullets.push(`${counterparty.label}: ${counterparty.detail}`);
        }

        // 8. Optional AI narrative, grounded in simulated facts only.
        if (aiAvailable) {
          try {
            const narrative = await aiNarrative(
              createAiClient(apiKey, aiProxyUrl || undefined),
              {
                summary: tx.summary,
                explanation,
                simulation: {
                  ok: sim.ok,
                  revertReason: sim.revertReason,
                  notes: sim.notes,
                },
                risks,
              },
            );
            if (narrative) explanation.aiNarrative = narrative;
          } catch {
            /* optional — the deterministic explanation stands alone */
          }
        }

        setPlan({
          tx,
          sim,
          risks,
          explanation,
          readiness,
          simulatedAtMs: Date.now(),
          fees,
          counterparty,
          riskContext: ctx,
          reputationFindings,
        });
        setDrift(null);
        setPhase('ready');
      } catch (err) {
        setErrorMsg(plainError(err));
        setPhase('idle');
      }
    },
    [
      account,
      aiAvailable,
      apiKey,
      aiProxyUrl,
      book,
      client,
      network,
      persistTokens,
      registry,
      reader,
      rpc,
    ],
  );

  const handlePrepare = useCallback(() => {
    void prepareFromText(input);
  }, [input, prepareFromText]);

  /* ---- signing ---- */

  /**
   * Sign. Before handing the transaction to the wallet we re-simulate and
   * compare: a plan the user read a minute ago may no longer be true. If
   * anything material moved we stop and show what changed — `force` is how
   * the user consciously overrides that.
   */
  const handleSign = useCallback(async (force = false) => {
    if (!plan || !provider) return;
    setPhase('signing');
    setErrorMsg(null);

    if (!force) {
      try {
        const fresh = await simulateTx(plan.tx, rpc);
        const report = compareSimulations(plan.sim, fresh, {
          simulatedAtMs: plan.simulatedAtMs,
          nowMs: Date.now(),
          formatToken: (raw, token) => formatTokenAmount(raw, token),
        });
        setDrift(report.level === 'none' ? null : report);
        if (report.level === 'material') {
          // Refresh the stored plan so "show me the new plan" is accurate.
          // Re-run the SAME rule set against a refreshed balance: reusing
          // the original context means a re-check can never silently drop
          // a warning the user already saw.
          const freshCtx: RiskContext = {
            ...plan.riskContext,
            senderBalanceWei: await client
              .getBalance({ address: plan.tx.from })
              .catch(() => plan.riskContext.senderBalanceWei),
          };
          const freshRisks = assessRisks(plan.tx, fresh, freshCtx);
          for (const f of plan.reputationFindings) {
            if (!freshRisks.some((r) => r.title === f.title)) freshRisks.push(f);
          }
          setPlan({
            ...plan,
            sim: fresh,
            risks: freshRisks,
            riskContext: freshCtx,
            readiness: scorePlan(fresh, freshRisks),
            explanation: composeExplanation(plan.tx, fresh, freshRisks, plan.tx.from),
            simulatedAtMs: Date.now(),
          });
          setPhase('ready');
          return;
        }
      } catch {
        // A failed re-check must not block signing — the wallet still
        // shows its own confirmation, and the original plan stands.
      }
    }

    // Once the wallet has broadcast, the transaction exists on the network
    // whatever happens next. From this point we must NEVER return to a state
    // where the sign button is live again — a second click would broadcast a
    // second transfer.
    let broadcast = false;
    try {
      await ensureNetwork(provider, network);
      const hash = await sendTransaction(provider, plan.tx);
      broadcast = true;
      setTxHash(hash);
      setPhase('pending');
      const receipt = await waitForReceipt(client, hash);
      const check = comparePostFlight(plan.tx, plan.sim, receipt, plan.tx.from);
      setPostflight(check);
      setPhase('landed');
      refreshBalance(account);
      setFlights(
        recordFlight({
          id: hash,
          at: Date.now(),
          network: networkKey,
          summary: plan.tx.summary,
          hash,
          simOk: plan.sim.ok,
          outcome: receipt.status === 'success' ? 'success' : 'reverted',
          matched: check.matched,
        }),
      );
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (broadcast) {
        // Sent, but we lost track of it — the receipt wait timed out or the
        // RPC dropped. Stay in 'sent': the explorer link is the source of
        // truth and the sign button stays gone.
        setErrorMsg(
          'Your transaction was sent, but we lost track of it before it landed. ' +
            'It may still confirm — check the explorer link below before trying again.',
        );
        setPhase('sent');
      } else if (code === 4001) {
        setErrorMsg(t('error.declined'));
        setPhase('ready');
      } else {
        setErrorMsg(plainError(err));
        setPhase('ready');
      }
    }
  }, [account, client, network, networkKey, plan, provider, refreshBalance, rpc, t]);

  const handleDiscard = useCallback(() => {
    setPlan(null);
    setPhase('idle');
    setParseSource(null);
  }, []);

  const handleNewFlight = () => {
    resetFlight();
    setInput('');
    refreshBalance(account);
  };

  /* ---- keyboard shortcuts ---- */

  useEffect(() => {
    return installShortcuts(window, {
      focusInput: () => {
        setView('fly');
        const el = document.querySelector<HTMLInputElement>('.console-form input');
        el?.focus();
        el?.select();
      },
      submit: handlePrepare,
      discard: handleDiscard,
      sign: () => {
        if (phase === 'ready') void handleSign(false);
      },
      nextTab: () =>
        setView((v) => VIEW_ORDER[(VIEW_ORDER.indexOf(v) + 1) % VIEW_ORDER.length]),
    });
  }, [handleDiscard, handlePrepare, handleSign, phase]);

  /* ---- hangar ---- */

  const handleScan = async () => {
    if (!account) return;
    setScanning(true);
    setErrorMsg(null);
    try {
      setScan(await scanApprovals(rpc, account));
    } catch (err) {
      setErrorMsg(plainError(err));
    } finally {
      setScanning(false);
    }
  };

  const handleRevokeFromHangar = (record: ApprovalRecord) => {
    const text = `revoke ${record.spender}'s access to my ${record.token.address}`;
    setInput(text);
    void prepareFromText(text);
  };

  /* ---- share + report ---- */

  const handleShare = async () => {
    const link = encodeShareLink(
      `${window.location.origin}${window.location.pathname}`,
      { text: input.trim(), network: networkKey },
    );
    try {
      await navigator.clipboard.writeText(link);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setErrorMsg('Could not copy — your browser blocked clipboard access.');
    }
  };

  const handleCopyReport = async () => {
    if (!plan) return;
    const md = flightReportMarkdown({
      networkLabel: network.chain.name,
      tx: plan.tx,
      sim: plan.sim,
      risks: plan.risks,
      explanation: plan.explanation,
      postflight,
      hash: txHash,
      explorerHref: txHash ? txUrl(network, txHash) : null,
      generatedAt: new Date().toISOString(),
    });
    try {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setErrorMsg('Could not copy — your browser blocked clipboard access.');
    }
  };

  const disabledReason = !provider
    ? t('error.noWalletHint')
    : !account
      ? t('error.connectHint')
      : undefined;

  const netLabel = network.label.toLowerCase();

  return (
    <>
      <header className="masthead">
        <h1>
          <span className="brand-mark">▲</span> Monad PreFlight
        </h1>
        <StatusStrip
          hasWallet={!!provider}
          account={account}
          walletChainId={walletChainId}
          balanceWei={balanceWei}
          connecting={connecting}
          network={network}
          lang={lang}
          onConnect={handleConnect}
          onSwitchWalletNetwork={handleSwitchWalletNetwork}
          onSelectNetwork={handleSelectNetwork}
          onSelectLang={handleSelectLang}
        />
      </header>
      <p className="tagline">{t('app.tagline', { network: netLabel })}</p>

      <nav className="view-tabs" aria-label="Workspace">
        {(
          [
            ['fly', t('nav.fly')],
            ['hangar', t('nav.hangar')],
            ['sign', lang === 'zh' ? '签名' : 'Signatures'],
            ['observer', lang === 'zh' ? '观察' : 'Observer'],
            ['log', t('nav.log')],
          ] as [View, string][]
        ).map(([key, label]) => (
          <button
            key={key}
            className={view === key ? 'active' : ''}
            aria-current={view === key ? 'page' : undefined}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
      </nav>

      {view === 'fly' && (
        <>
          <IntentConsole
            value={input}
            busy={phase === 'planning'}
            disabledReason={disabledReason}
            parseSource={parseSource}
            shareCopied={shareCopied}
            onChange={setInput}
            onSubmit={handlePrepare}
            onShare={handleShare}
          />

          {parseFailure && (
            <div className="error-note" role="alert">
              {parseFailure.reason}
              {parseFailure.suggestions.length > 0 && (
                <div className="hint">
                  Try one of these:
                  <ul>
                    {parseFailure.suggestions.map((s) => (
                      <li key={s}>
                        <code>{s}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {errorMsg && (
            <div className="error-note" role="alert">
              {errorMsg}
            </div>
          )}

          {plan && (phase === 'ready' || phase === 'signing') && (
            <FlightPlan
              plan={plan}
              signing={phase === 'signing'}
              copied={copied}
              drift={drift}
              onSign={() => handleSign(false)}
              onSignAnyway={() => handleSign(true)}
              onDismissDrift={() => setDrift(null)}
              onDiscard={handleDiscard}
              onCopyReport={handleCopyReport}
            />
          )}

          {(phase === 'pending' || phase === 'sent') && txHash && (
            <section className="panel">
              <p className="panel-label">
                {phase === 'pending' ? 'In flight' : 'Sent — outcome unknown'}
              </p>
              {phase === 'pending' ? (
                <p className="busy">waiting for the transaction to land on Monad…</p>
              ) : (
                <p className="plan-outcome">
                  We stopped waiting, but the transaction is already on the network.
                  Do not send it again until you have checked the explorer.
                </p>
              )}
              <p style={{ marginTop: 12, fontSize: 13 }}>
                <a href={txUrl(network, txHash)} target="_blank" rel="noreferrer">
                  Track on MonadVision ↗
                </a>
              </p>
              {phase === 'sent' && (
                <div className="sign-bar">
                  <button className="btn-ghost" onClick={handleNewFlight}>
                    Start a new flight
                  </button>
                </div>
              )}
            </section>
          )}

          {phase === 'landed' && postflight && txHash && (
            <PostFlight
              check={postflight}
              explorerHref={txUrl(network, txHash)}
              copied={copied}
              onNewFlight={handleNewFlight}
              onCopyReport={handleCopyReport}
            />
          )}
        </>
      )}

      {view === 'hangar' && (
        <ApprovalHangar
          account={account}
          scan={scan}
          scanning={scanning}
          onScan={handleScan}
          onRevoke={handleRevokeFromHangar}
          addressHref={(addr) => addressUrl(network, addr)}
        />
      )}

      {view === 'sign' && <SignatureExplainer expectedChainIds={[network.chainId]} />}

      {view === 'observer' && (
        <ObserverPanel
          reader={{
            getBalance: (a) => client.getBalance({ address: a }),
            getTransactionCount: (a) => client.getTransactionCount({ address: a }),
            getCode: (a) => client.getCode({ address: a }).then((c) => c ?? null),
          }}
          scanApprovalsFor={(addr) => scanApprovals(rpc, addr)}
          fetchBalancesFor={async (addr) => {
            const result = await fetchBalances(client, addr, tokens);
            return result.tokens.map((b) => ({ token: b.token, raw: b.raw }));
          }}
          computeExposure={(balances, approvalScan) =>
            computeExposure({
              balances,
              approvals: approvalScan.records.map((r) => ({
                token: r.token,
                spender: r.spender,
                allowanceRaw: r.allowanceRaw,
                unlimited: r.unlimited,
              })),
            })
          }
          addressHref={(addr) => addressUrl(network, addr)}
        />
      )}

      {view === 'log' && (
        <FlightLog
          flights={flights}
          txHref={(hash) => txUrl(network, hash)}
          onClear={() => {
            clearFlights(networkKey);
            setFlights([]);
          }}
        />
      )}

      <SettingsDrawer
        apiKey={apiKey}
        aiProxyUrl={aiProxyUrl}
        tokens={tokens}
        book={book}
        addTokenBusy={addTokenBusy}
        addTokenError={addTokenError}
        onApiKeyChange={handleApiKeyChange}
        onAiProxyUrlChange={handleAiProxyUrlChange}
        onAddToken={handleAddToken}
        onBookChange={setBook}
      />

      <p className="footer-note">
        {t('footer.simNote', { network: netLabel })}
        {network.faucetUrl && (
          <>
            {' · '}
            <a href={network.faucetUrl}>{t('footer.faucet')}</a>
          </>
        )}
        {' · '}
        <span className="mono">Ctrl+K</span> focus ·{' '}
        <span className="mono">Ctrl+Enter</span> prepare ·{' '}
        <span className="mono">Ctrl+→</span> next tab
      </p>
    </>
  );
}
