/**
 * `@geomotion/document` — the document model.
 *
 * Governing sections: ENGINEERING_GUIDE §3, ARCHITECTURE §04. Depends on `core`
 * only; it must never reach for React, the renderer, or the DOM. Browser
 * persistence therefore lives in the app, not here.
 *
 * The flat node store with fractional ordering and a schema registry that §3
 * specifies is not built yet — this is v1's shape (a project holding arrays of
 * layers and keyframes) with the transaction and history layer §1.3/§1.4 require
 * put underneath it. The write path is now the thing that changes, not the shape.
 */

export { createLayer, defaultTour, emptyProject, keyframe, migrate } from './project.ts';
export {
  canPlayPerCue,
  envelopeOf,
  gainCurve,
  isRetimable,
  planAudio,
  scheduleFrom,
  type AudioPlan,
  type ClipEnvelope,
  type GainPoint,
  type RemixClip,
  type ScheduledCue,
} from './audio.ts';
export { History } from './history.ts';
export { applyPatches, isNoop, transact, type Patch, type Transaction } from './transact.ts';
export type * from './types.ts';

export {
  TRACK_KINDS,
  coerceTrack,
  isAnimated,
  isTrack,
  keyframedTrack,
  restValue,
  staticTrack,
  type Keyframe,
  type Track,
} from './track.ts';
export { CURRENT_FORMAT, formatOf, runMigrations } from './migrations/index.ts';
