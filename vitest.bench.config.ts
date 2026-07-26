import { defineConfig } from 'vitest/config';

/**
 * LIVE latency benchmark (npm run bench) — talks to the real Monad
 * testnet, so it is manual-only, like test:e2e. It exists so the claim
 * "a full pre-flight check is sub-second on Monad" is something anyone
 * can measure instead of something we assert.
 */
export default defineConfig({
  test: {
    include: ['test-bench/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
