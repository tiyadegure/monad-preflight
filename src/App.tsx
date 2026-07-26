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
  getPublicClient,
  isNetworkKey,
  txUrl,
} from './lib/networks';
import { isAddressFormat } from './lib/format';
import { parseIntent } from './lib/intent';
import { BuildError, buildTx } from './lib/txbuilder';
import { addToken, createRegistry, findToken, viemChainReader } from './lib/tokens';
import { makeHttpRpc, simulateTx } from './lib/simulate';
import { assessRisks } from './lib/risk';
import { composeExplanation } from './lib/explain';
import { comparePostFlight } from './lib/postflight';
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

type Phase = 'idle' | 'planning' | 'ready' | 'signing' | 'pending' | 'landed';

interface Plan {
  tx: PreparedTx;
  sim: SimulationResult;
  risks: RiskFinding[];
  explanation: Explanation;
}

const LS_API_KEY = 'preflight.apiKey';
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

  const [networkKey, setNetworkKey] = useState<NetworkKey>(() => {
    const stored = localStorage.getItem(LS_NETWORK);
    return isNetworkKey(stored) ? stored : DEFAULT_NETWORK;
  });
  const network = NETWORKS[networkKey];
  const client = useMemo(() => getPublicClient(network), [network]);
  const rpc = useMemo(() => makeHttpRpc(network.rpcUrls[0]), [network]);
  const reader = useMemo(() => viemChainReader(client), [client]);

  const [account, setAccount] = useState<Address | null>(null);
  const [walletChainId, setWalletChainId] = useState<number | null>(null);
  const [balanceWei, setBalanceWei] = useState<bigint | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [apiKey, setApiKey] = useState(() => localStorage.getItem(LS_API_KEY) ?? '');
  const [tokens, setTokens] = useState<TokenInfo[]>(() => loadTokens(networkKey));
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

  // Balance follows both the account and the selected network.
  useEffect(() => {
    refreshBalance(account);
  }, [account, refreshBalance]);

  const resetFlight = useCallback(() => {
    setPlan(null);
    setPostflight(null);
    setTxHash(null);
    setParseSource(null);
    setParseFailure(null);
    setErrorMsg(null);
    setPhase('idle');
  }, []);

  const handleSelectNetwork = (key: NetworkKey) => {
    if (key === networkKey) return;
    setNetworkKey(key);
    localStorage.setItem(LS_NETWORK, key);
    setTokens(loadTokens(key));
    resetFlight();
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

  const handlePrepare = async () => {
    if (!account) return;
    setPhase('planning');
    setPlan(null);
    setParseFailure(null);
    setErrorMsg(null);
    setPostflight(null);
    setTxHash(null);
    setParseSource(null);

    try {
      // 1. Parse: rules first; Claude as fallback when a key is configured.
      let intent: ParsedIntent | null = null;
      let source: 'rules' | 'ai' = 'rules';
      const ruleResult = parseIntent(input.trim());
      if (ruleResult.ok) {
        intent = ruleResult.intent;
      } else if (apiKey) {
        try {
          intent = await aiParseIntent(createAiClient(apiKey), input.trim());
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
      setParseSource(source);

      // 2. Build the unsigned transaction.
      const tx = await buildTx(intent, account, { registry, reader });

      // Remember tokens the builder had to look up on-chain.
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

      // 5 + 6. Risk assessment and deterministic explanation.
      const risks = assessRisks(tx, sim, ctx);
      const explanation = composeExplanation(tx, sim, risks, account);

      // 7. Optional AI narrative, grounded in the simulated facts only.
      if (apiKey) {
        try {
          const narrative = await aiNarrative(createAiClient(apiKey), {
            summary: tx.summary,
            explanation,
            simulation: { ok: sim.ok, revertReason: sim.revertReason, notes: sim.notes },
            risks,
          });
          if (narrative) explanation.aiNarrative = narrative;
        } catch {
          /* AI narrative is optional — the deterministic explanation stands alone */
        }
      }

      setPlan({ tx, sim, risks, explanation });
      setPhase('ready');
    } catch (err) {
      setErrorMsg(plainError(err));
      setPhase('idle');
    }
  };

  /* ---- signing ---- */

  const handleSign = async () => {
    if (!plan || !provider) return;
    setPhase('signing');
    setErrorMsg(null);
    try {
      await ensureNetwork(provider, network);
      const hash = await sendTransaction(provider, plan.tx);
      setTxHash(hash);
      setPhase('pending');
      const receipt = await waitForReceipt(client, hash);
      setPostflight(comparePostFlight(plan.tx, plan.sim, receipt, plan.tx.from));
      setPhase('landed');
      refreshBalance(account);
    } catch (err) {
      const code = (err as { code?: number })?.code;
      if (code === 4001) {
        setErrorMsg('You declined in your wallet — nothing was sent.');
        setPhase('ready');
      } else if (txHash) {
        setErrorMsg(
          `The transaction was sent but confirmation timed out — check the explorer: ${txUrl(network, txHash)}`,
        );
        setPhase('ready');
      } else {
        setErrorMsg(plainError(err));
        setPhase('ready');
      }
    }
  };

  const handleDiscard = () => {
    setPlan(null);
    setPhase('idle');
    setParseSource(null);
  };

  const handleNewFlight = () => {
    resetFlight();
    setInput('');
    refreshBalance(account);
  };

  const disabledReason = !provider
    ? 'Install a browser wallet (e.g. MetaMask) to prepare and sign transactions.'
    : !account
      ? 'Connect your wallet first — PreFlight simulates from your own account.'
      : undefined;

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
          onConnect={handleConnect}
          onSwitchWalletNetwork={handleSwitchWalletNetwork}
          onSelectNetwork={handleSelectNetwork}
        />
      </header>
      <p className="tagline">
        Say what you want to do. PreFlight prepares the transaction, simulates it on
        Monad {network.label.toLowerCase()}, and explains it in plain language — then
        you decide whether to sign.
      </p>

      <IntentConsole
        value={input}
        busy={phase === 'planning'}
        disabledReason={disabledReason}
        parseSource={parseSource}
        onChange={setInput}
        onSubmit={handlePrepare}
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
          onSign={handleSign}
          onDiscard={handleDiscard}
        />
      )}

      {phase === 'pending' && txHash && (
        <section className="panel">
          <p className="panel-label">In flight</p>
          <p className="busy">waiting for the transaction to land on Monad…</p>
          <p style={{ marginTop: 12, fontSize: 13 }}>
            <a href={txUrl(network, txHash)} target="_blank" rel="noreferrer">
              Track on MonadVision ↗
            </a>
          </p>
        </section>
      )}

      {phase === 'landed' && postflight && txHash && (
        <PostFlight
          check={postflight}
          explorerHref={txUrl(network, txHash)}
          onNewFlight={handleNewFlight}
        />
      )}

      <SettingsDrawer
        apiKey={apiKey}
        tokens={tokens}
        addTokenBusy={addTokenBusy}
        addTokenError={addTokenError}
        onApiKeyChange={handleApiKeyChange}
        onAddToken={handleAddToken}
      />

      <p className="footer-note">
        Simulation runs live against Monad {network.label.toLowerCase()}
        (debug_traceCall) · keys never leave your wallet · simulation is a best-effort
        preview, not a guarantee
        {network.faucetUrl && (
          <>
            {' '}
            · need test MON? <a href={network.faucetUrl}>faucet</a>
          </>
        )}
      </p>
    </>
  );
}
