import type { Address } from '../lib/types';
import { NATIVE_MON } from '../lib/types';
import { monadTestnet } from '../lib/chain';
import { formatTokenAmount, shortAddress } from '../lib/format';

interface Props {
  hasWallet: boolean;
  account: Address | null;
  chainId: number | null;
  balanceWei: bigint | null;
  connecting: boolean;
  onConnect: () => void;
  onSwitchNetwork: () => void;
}

export function StatusStrip({
  hasWallet,
  account,
  chainId,
  balanceWei,
  connecting,
  onConnect,
  onSwitchNetwork,
}: Props) {
  const onMonad = chainId === monadTestnet.id;

  return (
    <div className="status-strip" role="status">
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
        (onMonad ? (
          <span className="readout on">
            <span className="dot" />
            Monad Testnet
          </span>
        ) : (
          <button className="btn-ghost" onClick={onSwitchNetwork}>
            Switch to Monad Testnet
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
