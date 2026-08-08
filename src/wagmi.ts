import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { QueryClient } from '@tanstack/react-query';
import { NETWORKS } from './lib/networks';

// RainbowKit needs a WalletConnect Project ID. A zero placeholder keeps local
// dev usable with injected wallets; the PRODUCTION build should provide a real
// Reown project id via VITE_WALLETCONNECT_PROJECT_ID (WalletConnect QR only).
const rawProjectId: string | undefined = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;
const projectId: string =
  rawProjectId && rawProjectId.trim().length > 0
    ? rawProjectId
    : '00000000000000000000000000000000';
if (!rawProjectId) {
  console.warn(
    '[preflight] VITE_WALLETCONNECT_PROJECT_ID not set — WalletConnect QR will not work; ' +
      'set a real Reown project id for the production build.',
  );
}

// Both Monad networks are offered to the wallet. `rpc.monad.xyz` must stay
// first in each chain's list (see networks.ts capability notes) — wagmi uses
// the default transport, so NETWORKS.mainnet.chain already orders them.
export const wagmiConfig = getDefaultConfig({
  appName: 'Monad PreFlight',
  projectId,
  chains: [NETWORKS.mainnet.chain, NETWORKS.testnet.chain],
  ssr: false,
});

export const queryClient = new QueryClient();