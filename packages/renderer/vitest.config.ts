import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    /*
     * No unit tests here yet, and that is the honest state rather than an oversight:
     * this package draws, and drawing is covered by the render-signature harness in
     * `@geomotion/testing`, which compares real frames. Pure logic that appears here
     * later should be tested here.
     */
    passWithNoTests: true,
    reporters: 'dot',
  },
});
