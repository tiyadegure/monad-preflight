/**
 * Deploys contracts/DemoToken.sol (tUSD) to Monad testnet.
 *
 * Usage (PowerShell):
 *   $env:PRIVATE_KEY = "0x<your funded testnet key>"
 *   node scripts/deploy-demo-token.mjs
 *
 * Needs a little testnet MON for gas: https://faucet.monad.xyz
 * The key is used locally only, to sign the deployment.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import solc from 'solc';
import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'Monad', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: ['https://testnet-rpc.monad.xyz'] } },
  testnet: true,
});

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, '..', 'contracts', 'DemoToken.sol'), 'utf8');

console.log('Compiling DemoToken.sol …');
const input = {
  language: 'Solidity',
  sources: { 'DemoToken.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
const errors = (output.errors ?? []).filter((e) => e.severity === 'error');
if (errors.length) {
  console.error(errors.map((e) => e.formattedMessage).join('\n'));
  process.exit(1);
}
const contract = output.contracts['DemoToken.sol'].DemoToken;
const abi = contract.abi;
const bytecode = `0x${contract.evm.bytecode.object}`;

const pk = process.env.PRIVATE_KEY;
if (!pk || !/^0x[0-9a-fA-F]{64}$/.test(pk)) {
  console.error('Set PRIVATE_KEY to a funded Monad testnet key (0x + 64 hex chars).');
  process.exit(1);
}

const account = privateKeyToAccount(pk);
const wallet = createWalletClient({ account, chain: monadTestnet, transport: http() });
const client = createPublicClient({ chain: monadTestnet, transport: http() });

const balance = await client.getBalance({ address: account.address });
console.log(`Deployer: ${account.address} (${Number(balance) / 1e18} MON)`);
if (balance === 0n) {
  console.error('Deployer has no MON — get some at https://faucet.monad.xyz');
  process.exit(1);
}

console.log('Deploying …');
const hash = await wallet.deployContract({ abi, bytecode });
console.log(`Tx: https://testnet.monadvision.com/tx/${hash}`);
const receipt = await client.waitForTransactionReceipt({ hash });
console.log(`\ntUSD deployed at: ${receipt.contractAddress}`);
console.log('Paste this address into PreFlight → Settings → "Teach PreFlight a token".');
console.log('Anyone can call faucet() on it to get 100 tUSD for the demo.');
