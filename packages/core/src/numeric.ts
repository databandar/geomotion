/**
 * Numeric interpolation primitives.
 *
 * These are separate from the easing curves on purpose. A curve maps 0..1 to
 * 0..1 and is animation's business (`packages/animation`); these are arithmetic
 * that geometry, layout and colour all need, so they belong to the zero-dependency
 * layer instead.
 */

/** Clamp to the unit interval. */
export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Inverse lerp that stays safe when a === b, and clamps to 0..1. */
export function invLerp(a: number, b: number, v: number): number {
  if (b === a) return 0;
  return clamp01((v - a) / (b - a));
}

/**
 * Interpolate an angle the short way around the circle.
 *
 * The result is deliberately not normalised into 0..360: interpolating 350 -> 10
 * yields 360 at the midpoint, not 0, so a camera bearing sweeps forward through
 * north instead of jumping backwards through south.
 */
export function lerpAngle(a: number, b: number, t: number): number {
  const d = (((b - a) % 360) + 540) % 360 - 180;
  return a + d * t;
}
