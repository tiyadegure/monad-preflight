import type { Address } from '../lib/types';
import { NATIVE_MON } from '../lib/types';
import type { NetworkConfig, NetworkKey } from '../lib/networks';
import { NETWORKS } from '../lib/networks';
import type { Lang } from '../lib/i18n';
import { t } from '../lib/i18n';
import { formatTokenAmount, shortAddress } from '../lib/format';

interface Props {
  hasWallet: boolean;
  account: Address | null;
  walletChainId: number | null;
  balanceWei: bigint | null;
  connecting: boolean;
  network: NetworkConfig;
  lang: Lang;
  onConnect: () => void;
  onSwitchWalletNetwork: () => void;
  onSelectNetwork: (key: NetworkKey) => void;
  onSelectLang: (lang: Lang) => void;
}

export function StatusStrip({
  hasWallet,
  account,
  walletChainId,
  balanceWei,
  connecting,
  network,
  lang,
  onConnect,
  onSwitchWalletNetwork,
  onSelectNetwork,
  onSelectLang,
}: Props) {
  const walletOnNetwork = walletChainId === network.chainId;

  return (
    <div className="status-strip" role="status">
      <div className="net-switch" role="group" aria-label="Network">
        {(Object.keys(NETWORKS) as NetworkKey[]).map((key) => (
          <button
            key={key}
            className={key === network.key ? 'active' : ''}
            aria-pressed={key === network.key}
            onClick={() => onSelectNetwork(key)}
          >
            {NETWORKS[key].label}
          </button>
        ))}
      </div>

      <div className="net-switch" role="group" aria-label="Language">
        {(['en', 'zh'] as Lang[]).map((key) => (
          <button
            key={key}
            className={key === lang ? 'active' : ''}
            aria-pressed={key === lang}
            onClick={() => onSelectLang(key)}
          >
            {key === 'en' ? 'EN' : '中文'}
          </button>
        ))}
      </div>

      {network.isMainnet && (
        <span className="readout warn">
          <span className="dot" />
          {t(lang, 'status.realFunds')}
        </span>
      )}

      {account ? (
        <span className="readout on" title={account}>
          <span className="dot" />
          {shortAddress(account)}
        </span>
      ) : (
        <button
          className="btn-ghost"
          onClick={onConnect}
          disabled={!hasWallet || connecting}
        >
          {connecting
            ? t(lang, 'status.connecting')
            : hasWallet
              ? t(lang, 'status.connect')
              : t(lang, 'status.noWallet')}
        </button>
      )}

      {account &&
        (walletOnNetwork ? (
          <span className="readout on">
            <span className="dot" />
            {network.chain.name}
          </span>
        ) : (
          <button className="btn-ghost" onClick={onSwitchWalletNetwork}>
            {t(lang, 'status.switchTo', { network: network.label })}
          </button>
        ))}

      {account && balanceWei !== null && (
        <span className="readout">
          <span className="dot" />
          {formatTokenAmount(balanceWei, NATIVE_MON, 4)}
        </span>
      )}
    </div>
  );
}
