import { defineConfig } from 'vitest/config';

/**
 * Smoke suite for the BUILT SDK (dist-sdk). Run via `npm run verify:sdk`,
 * which builds first — these tests import the emitted JavaScript, not the
 * TypeScript sources, so they prove the artifact a consumer would get.
 */
export default defineConfig({
  test: {
    include: ['test-sdk/**/*.test.ts'],
    environment: 'node',
  },
});
