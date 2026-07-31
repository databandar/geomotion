import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * Unmount between tests.
 *
 * Testing Library only registers this itself when vitest runs with `globals`, which this
 * project does not — so every `render` in a file was piling into the same document. Tests
 * that reach for the first match survived it; anything asking for *the* button found
 * several and failed, and a test could pass on markup a previous test had left behind.
 */
afterEach(cleanup);

/**
 * Shared setup for component tests.
 *
 * jsdom implements no layout and no canvas, so anything that measures or draws has
 * to be stubbed here rather than in each test. The Inspector itself does neither —
 * it is inputs and callbacks — but it renders inside components that ask.
 */
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
}
