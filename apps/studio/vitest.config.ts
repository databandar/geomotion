import { defineConfig } from 'vitest/config';

/**
 * Two kinds of suite live here, so two projects.
 *
 * `*.test.ts` is pure — colour scales, scene evaluation, persistence — and runs in
 * node, because a DOM it never touches only costs time. `*.test.tsx` renders
 * components and gets jsdom.
 *
 * Split by extension rather than directory so a test still sits beside the thing it
 * covers. Expressed as projects rather than `environmentMatchGlobs`, which vitest has
 * deprecated.
 */
export default defineConfig({
  test: {
    reporters: 'dot',
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/**/*.test.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['src/test-setup.ts'],
        },
      },
    ],
  },
});
