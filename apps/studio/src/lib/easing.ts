import type { EasingName } from '../types';

type EaseFn = (t: number) => number;

export const EASINGS: Record<EasingName, EaseFn> = {
  linear: (t) => t,
  easeIn: (t) => t * t,
  easeOut: (t) => t * (2 - t),
  easeInOut: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeInOutExpo: (t) =>
    t === 0 ? 0 : t === 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  // Overshoots ~10% then settles — the difference between a camera stopping and
  // a camera *arriving*.
  easeOutBack: (t) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
  hold: () => 0,
};

export const EASING_NAMES = Object.keys(EASINGS) as EasingName[];

export function ease(name: EasingName, t: number): number {
  const fn = EASINGS[name] ?? EASINGS.linear;
  return fn(clamp01(t));
}

export const clamp01 = (t: number) => (t < 0 ? 0 : t > 1 ? 1 : t);

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Inverse lerp that stays safe when a === b. */
export function invLerp(a: number, b: number, v: number): number {
  if (b === a) return 0;
  return clamp01((v - a) / (b - a));
}

/** Interpolate an angle taking the shorter way around the circle. */
export function lerpAngle(a: number, b: number, t: number): number {
  let d = ((b - a) % 360 + 540) % 360 - 180;
  return a + d * t;
}
