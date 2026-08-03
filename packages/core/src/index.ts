/**
 * `@geomotion/core` — the primitives everything else is allowed to depend on.
 *
 * Governing section: ENGINEERING_GUIDE §2. This package has **zero** runtime
 * dependencies by contract, including on the DOM. If something here needs an
 * import, it does not belong here.
 */

export { createId } from './id.ts';
export {
  removeBackground,
  type Pixels,
  type RemoveBackgroundOptions,
  type RemoveBackgroundResult,
} from './background.ts';
export {
  DIVERGING_RAMPS,
  RAMPS,
  getRamp,
  luminance,
  parseHex,
  rampColor,
  rampPosition,
  withAlpha,
  type Ramp,
  type RampKind,
  type Rgba,
} from './palettes.ts';
export { clamp, clamp01, invLerp, lerp, lerpAngle } from './numeric.ts';
export { lerpLngLat, type LngLat } from './units.ts';
