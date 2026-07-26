import type { Address } from '../lib/types';
import { NATIVE_MON } from '../lib/types';
import type { NetworkConfig, NetworkKey } from '../lib/networks';
import { NETWORKS } from '../lib/networks';
import { formatTokenAmount, shortAddress } from '../lib/format';

interface Props {
  hasWallet: boolean;
  account: Address | null;
  walletChainId: number | null;
  balanceWei: bigint | null;
  connecting: boolean;
  network: NetworkConfig;
  onConnect: () => void;
  onSwitchWalletNetwork: () => void;
  onSelectNetwork: (key: NetworkKey) => void;
}

export function StatusStrip({
  hasWallet,
  account,
  walletChainId,
  balanceWei,
  connecting,
  network,
  onConnect,
  onSwitchWalletNetwork,
  onSelectNetwork,
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

      {network.isMainnet && (
        <span className="readout warn">
          <span className="dot" />
          real funds
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
          {connecting ? 'Connecting…' : hasWallet ? 'Connect wallet' : 'No wallet found'}
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
            Switch wallet to {network.label}
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
