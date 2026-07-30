import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The suites under test are pure: geo math, easing, colour scales, scene
    // evaluation, and serialisation. Nothing here touches the DOM — renderer
    // coverage is golden-frame work (ENGINEERING_GUIDE §12) and needs a browser
    // harness, tracked separately.
    environment: 'node',
    include: ['src/**/*.test.ts'],
    reporters: 'dot',
  },
});
