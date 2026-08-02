import { describe, expect, it } from 'vitest';
import { rectsOverlap } from './overlap-lint.ts';

/**
 * Only the pure, DOM-free primitives are unit-tested here — `checkOverlaps` itself
 * needs a real canvas 2D context (for the same `measureText` calls the renderer
 * draws with) and a live MapLibre map (for real globe-projected coordinates), and a
 * jsdom mock of either would test the mock, not the real behaviour. It's validated
 * empirically instead, against a real project through the same headless pipeline
 * every episode was rendered through — see the arctic-route/dandi-march episode
 * READMEs' "found by rendering" bugs, which is exactly the class of thing this
 * exists to catch before a render.
 */
describe('rectsOverlap', () => {
  it('detects a clear overlap', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 5, y: 5, width: 10, height: 10 })).toBe(true);
  });

  it('is false for rects that share only an edge', () => {
    // Matches labels.ts's `collides`: touching, not overlapping, is not a collision —
    // two cards flush against each other are legible, and flagging that would make
    // the lint useless (every deliberately-adjacent layout would "fail").
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 10, y: 0, width: 10, height: 10 })).toBe(false);
  });

  it('is false for rects nowhere near each other', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 10, height: 10 }, { x: 1000, y: 1000, width: 10, height: 10 })).toBe(false);
  });

  it('detects one rect fully inside another', () => {
    expect(rectsOverlap({ x: 0, y: 0, width: 100, height: 100 }, { x: 40, y: 40, width: 5, height: 5 })).toBe(true);
  });

  it('is symmetric', () => {
    const a = { x: 3, y: 3, width: 20, height: 20 };
    const b = { x: 10, y: 10, width: 20, height: 20 };
    expect(rectsOverlap(a, b)).toBe(rectsOverlap(b, a));
  });
});
