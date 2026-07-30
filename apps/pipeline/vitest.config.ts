import { defineConfig } from 'vitest/config';

export default defineConfig({
  // The pipeline is plain .mjs and runs in node; these suites read the bundled
  // scripts and compose them, so nothing here needs a browser.
  test: { environment: 'node', include: ['**/*.test.mjs'], reporters: 'dot' },
});
