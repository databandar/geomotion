import '@testing-library/jest-dom/vitest';

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
