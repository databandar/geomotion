/**
 * Format 5 → 6: the camera becomes a node.
 *
 * Format 5 stores the camera as an array of whole-camera rows — one keyframe carrying
 * centre, zoom, bearing, pitch, easing and arc together. Format 6 stores a `CameraNode`
 * per camera: each channel a property track, keys across channels sharing the row's id
 * so the editor's shot view can group them back (docs/features/camera-node.md).
 *
 * Row defaults are filled here, before the conversion — a migration owns the old
 * shape's gaps; the defaults downstream only know the new one. Rows too broken to mean
 * anything (no finite centre, time or zoom) are dropped rather than crashing the load:
 * this runs against files this project did not write.
 */
import { cameraFromShots, keyframe } from '../camera.ts';
import type { CameraKeyframe } from '../types.ts';

export function migrate5to6(doc: Record<string, unknown>): Record<string, unknown> {
  const out = { ...doc };
  // The old key goes, not merely gets ignored — two fields meaning the same thing let
  // two readers disagree about which is authoritative (§3.6.4).
  const rows = Array.isArray(doc.camera) ? (doc.camera as Partial<CameraKeyframe>[]) : [];
  delete out.camera;

  const clean = rows
    .map((k) => ({ ...keyframe(0, [0, 0], 1), ...k }))
    .filter(
      (k) =>
        Array.isArray(k.center) &&
        k.center.length === 2 &&
        k.center.every((v) => Number.isFinite(v)) &&
        Number.isFinite(k.t) &&
        Number.isFinite(k.zoom),
    );

  if (clean.length > 0) out.cameras = [cameraFromShots(clean)];
  // Nothing worth keeping: leave `cameras` absent and let the defaults supply one.
  return out;
}
