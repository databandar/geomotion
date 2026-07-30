import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    /*
     * Two kinds of suite live here.
     *
     * `*.test.ts` is pure: colour scales, scene evaluation, persistence. It runs in
     * node, because a DOM it never touches only costs time.
     *
     * `*.test.tsx` renders components, so it gets jsdom. The split is by extension
     * rather than by directory so a test sits next to the thing it covers.
     */
    environment: 'node',
    environmentMatchGlobs: [['**/*.test.tsx', 'jsdom']],
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test-setup.ts'],
    reporters: 'dot',
  },
});
