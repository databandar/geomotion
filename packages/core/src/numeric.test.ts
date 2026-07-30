import { describe, expect, it } from 'vitest';
import { clamp, clamp01, invLerp, lerp, lerpAngle } from './numeric.ts';

/**
 * Behavioural spec for the numeric primitives.
 *
 * Split out of v1's easing suite when the arithmetic moved into `core`: the
 * assertions are unchanged, because the functions are. `lerpAngle` taking the
 * short way around the circle is the load-bearing one — it is what stops a camera
 * bearing sweeping the long way round.
 */

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
    // Typed as pairs, not number[]: destructuring the latter yields
    // `number | undefined` once indexed access is checked.
    const cases: [number, number][] = [
      [0, 179],
      [0, 181],
      [-170, 170],
      [45, 315],
    ];
    for (const [a, b] of cases) {
      const travelled = Math.abs(lerpAngle(a, b, 1) - a);
      expect(travelled).toBeLessThanOrEqual(180 + 1e-9);
    }
  });
});
