import { describe, expect, it } from 'vitest';
import { EASING_NAMES, EASINGS, clamp, clamp01, ease, invLerp, lerp, lerpAngle } from './easing';

/**
 * Behavioural spec for the easing/interpolation primitives, bound for
 * `packages/animation` (ARCHITECTURE §06).
 *
 * The important guarantee here is that easing is *data*: named curves resolve
 * through one table, so feature code never hardcodes a curve. ENGINEERING_GUIDE
 * §15 lists hardcoded animation constants as a banned anti-pattern.
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

describe('numeric helpers', () => {
  it('clamp01 bounds to the unit interval', () => {
    expect(clamp01(-1)).toBe(0);
    expect(clamp01(0.4)).toBe(0.4);
    expect(clamp01(9)).toBe(1);
  });

  it('clamp bounds to an arbitrary range', () => {
    expect(clamp(5, 0, 3)).toBe(3);
    expect(clamp(-5, 0, 3)).toBe(0);
    expect(clamp(2, 0, 3)).toBe(2);
  });

  it('lerp interpolates and extrapolates linearly', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(10, 20, 0)).toBe(10);
    expect(lerp(10, 20, 1)).toBe(20);
  });

  it('invLerp inverts lerp and stays safe when the range is degenerate', () => {
    expect(invLerp(0, 10, 5)).toBe(0.5);
    expect(invLerp(4, 4, 4)).toBe(0); // no division by zero
    expect(invLerp(0, 10, -5)).toBe(0); // clamped
    expect(invLerp(0, 10, 50)).toBe(1);
  });
});

describe('lerpAngle', () => {
  it('takes the short way around the compass', () => {
    // 350 -> 10 must go forward through 0, not backwards through 180.
    expect(lerpAngle(350, 10, 0.5)).toBeCloseTo(360, 6);
    expect(lerpAngle(10, 350, 0.5)).toBeCloseTo(0, 6);
  });

  it('interpolates ordinary spans directly', () => {
    expect(lerpAngle(0, 90, 0.5)).toBeCloseTo(45, 6);
  });

  it('returns the start angle unchanged at t=0', () => {
    expect(lerpAngle(123, -45, 0)).toBeCloseTo(123, 6);
  });

  it('never travels more than 180 degrees', () => {
    for (const [a, b] of [
      [0, 179],
      [0, 181],
      [-170, 170],
      [45, 315],
    ]) {
      const travelled = Math.abs(lerpAngle(a, b, 1) - a);
      expect(travelled).toBeLessThanOrEqual(180 + 1e-9);
    }
  });
});
