import type { Address } from '../lib/types';
import { NATIVE_MON } from '../lib/types';
import type { NetworkConfig, NetworkKey } from '../lib/networks';
import { NETWORKS } from '../lib/networks';
import type { Lang } from '../lib/i18n';
import { t } from '../lib/i18n';
import { formatTokenAmount } from '../lib/format';
import { ConnectButton } from '@rainbow-me/rainbowkit';

interface Props {
  account: Address | null;
  walletChainId: number | null;
  balanceWei: bigint | null;
  network: NetworkConfig;
  lang: Lang;
  onSwitchWalletNetwork: () => void;
  onSelectNetwork: (key: NetworkKey) => void;
  onSelectLang: (lang: Lang) => void;
}

export function StatusStrip({
  account,
  walletChainId,
  balanceWei,
  network,
  lang,
  onSwitchWalletNetwork,
  onSelectNetwork,
  onSelectLang,
}: Props) {
  const walletOnNetwork = walletChainId === network.chainId;

  return (
    <div className="status-strip" role="status">
      <div className="net-switch" role="group" aria-label={t(lang, 'status.networkAria')}>
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

      <div className="net-switch" role="group" aria-label={t(lang, 'status.languageAria')}>
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

      {/* Connect / account / chain switch live in RainbowKit's button now. */}
      <ConnectButton
        showBalance={false}
        chainStatus="icon"
        accountStatus="full"
      />

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