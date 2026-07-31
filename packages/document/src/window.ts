import { createId } from '@geomotion/core';
import { keyframedTrack } from './track.ts';
import type { EasingName } from './types.ts';

/**
 * A 0..1 ramp between two times — the shape every "window with a curve" collapses to.
 *
 * The easing sits on the opening key because that is the segment it governs, which is the
 * convention the camera has always used.
 *
 * In its own module because both the node-type definitions (schema/) and the editing helpers
 * want it, and having it in project.ts made that a cycle.
 */
export const windowTrack = (from: number, to: number, easing: EasingName) =>
  keyframedTrack<number>([
    { id: createId(), t: from, value: 0, easing },
    { id: createId(), t: Math.max(from, to), value: 1, easing },
  ]);
