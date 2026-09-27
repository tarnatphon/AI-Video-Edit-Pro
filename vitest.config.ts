import { defineConfig } from 'vitest/config';

/** Unit tests cover the pure core (timeline ops, snapping, effects math, store). */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.{ts,tsx}'],
  },
});
