import { describe, expect, it } from 'vitest';
import { EASING_NAMES, EASINGS, ease } from './easing.ts';

/**
 * Behavioural spec for the easing curves, bound for `packages/animation`
 * (ARCHITECTURE §06).
 *
 * The important guarantee here is that easing is *data*: named curves resolve
 * through one table, so feature code never hardcodes a curve. ENGINEERING_GUIDE
 * §15 lists hardcoded animation constants as a banned anti-pattern.
 *
 * The arithmetic these curves are built on (clamp/lerp/lerpAngle) moved to
 * `@geomotion/core` with its own suite — a curve maps 0..1 to 0..1 and is
 * animation's business; arithmetic is everyone's.
 */

describe('easing table', () => {
  it('exposes every name in EASING_NAMES', () => {
    expect(EASING_NAMES.length).toBeGreaterThan(0);
    for (const name of EASING_NAMES) {
      expect(typeof EASINGS[name]).toBe('function');
    }
  });

  it('anchors every curve except hold at 0 and 1', () => {
    for (const name of EASING_NAMES) {
      if (name === 'hold') continue;
      expect(ease(name, 0)).toBeCloseTo(0, 6);
      expect(ease(name, 1)).toBeCloseTo(1, 6);
    }
  });

  it('hold stays at zero for the whole segment', () => {
    // A hold keyframe must not creep: it jumps only when the next key takes over.
    for (const t of [0, 0.25, 0.5, 0.99, 1]) {
      expect(ease('hold', t)).toBe(0);
    }
  });

  it('clamps input outside 0..1', () => {
    for (const name of EASING_NAMES) {
      expect(ease(name, -3)).toBe(ease(name, 0));
      expect(ease(name, 3)).toBe(ease(name, 1));
    }
  });

  it('falls back to linear for an unknown curve name', () => {
    // Guards documents authored by an older or newer schema version.
    expect(ease('nope' as never, 0.5)).toBeCloseTo(0.5, 6);
  });

  it('keeps the standard curves monotonically increasing', () => {
    const monotonic = EASING_NAMES.filter((n) => n !== 'hold' && n !== 'easeOutBack');
    for (const name of monotonic) {
      let prev = -Infinity;
      for (let t = 0; t <= 1.0001; t += 0.02) {
        const v = ease(name, t);
        expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = v;
      }
    }
  });

  it('easeOutBack overshoots past 1 then settles — the whole point of it', () => {
    const samples = Array.from({ length: 50 }, (_, i) => ease('easeOutBack', i / 49));
    expect(Math.max(...samples)).toBeGreaterThan(1);
    expect(ease('easeOutBack', 1)).toBeCloseTo(1, 6);
  });

  it('eases in slower than linear and out faster', () => {
    expect(ease('easeIn', 0.25)).toBeLessThan(0.25);
    expect(ease('easeOut', 0.25)).toBeGreaterThan(0.25);
  });

  it('keeps symmetric in-out curves centred', () => {
    for (const name of ['easeInOut', 'easeInOutCubic', 'easeInOutExpo'] as const) {
      expect(ease(name, 0.5)).toBeCloseTo(0.5, 3);
    }
  });
});
