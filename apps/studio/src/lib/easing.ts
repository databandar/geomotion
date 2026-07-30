import { clamp01 } from '@geomotion/core';
import type { EasingName } from '@geomotion/document';

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
