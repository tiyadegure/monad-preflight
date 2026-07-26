import { defineConfig } from 'vitest/config';

// Live tests against the real Monad testnet RPC — run explicitly with
// `npm run test:e2e`. Kept out of the default `npm test` include so unit
// tests stay offline and deterministic.
export default defineConfig({
  test: {
    include: ['test-e2e/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
