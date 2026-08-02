/**
 * The camera node — construction, and the shot row as a derived view.
 *
 * Governing sections: ARCHITECTURE §04 (every property is a track; cameras are
 * observers), §09 (a camera is a node with tracks). See docs/features/camera-node.md.
 *
 * The document stores per-channel tracks; the editor speaks of *shots* — one row
 * carrying all four channels, easing and arc together. Both are kept here so the
 * conversion lives in exactly one place: `cameraFromShots` builds a node from rows
 * (construction and the format-5 migration), `shotsOf` derives rows from a node, and
 * `upsertShot`/`patchShot`/`removeShot` write a row across the channels atomically.
 * The mutation helpers run inside `transact()` — they mutate the draft they are
 * handed, like every other editing helper in this package.
 */
import { createId } from '@geomotion/core';
import { FIRST_ORDER } from './order.ts';
import type { CameraKeyframe, CameraNode, EasingName, LngLat } from './types.ts';
import type { Keyframe, Track } from './track.ts';

/** The channels, in one place, so no writer can forget one. */
const CHANNELS = ['center', 'zoom', 'bearing', 'pitch'] as const;

/**
 * A channel track, as far as the cross-channel edits need to see it.
 *
 * The channels are heterogeneous (`Track<LngLat>` against `Track<number>`), so a loop
 * over them cannot name one `T`. These edits touch exactly `id`, `t`, `easing` and
 * `dip` — the fields every key shares — so the loops operate on this structural view.
 */
type AnyKeyed = { kind: 'keyframed'; keys: { id: string; t: number; easing: EasingName; dip?: number }[] };

/** Run `fn` over each channel that is actually keyframed. */
function eachChannel(tracks: CameraNode['tracks'], fn: (keyed: AnyKeyed) => void): void {
  for (const c of CHANNELS) {
    const track = tracks[c] as unknown as AnyKeyed;
    if (track.kind === 'keyframed') fn(track);
  }
}

/**
 * How close two shot times must be to count as the same shot.
 *
 * Replacing an existing shot keeps its id and time, so re-aiming the shot at the
 * playhead does not churn the selection or the timeline under the user's cursor.
 */
const SHOT_EPSILON = 0.02;

/** One shot row. Construction only — rows are a view, never document storage. */
export function keyframe(t: number, center: LngLat, zoom: number, extra: Partial<CameraKeyframe> = {}): CameraKeyframe {
  return {
    id: createId(),
    t,
    center,
    zoom,
    bearing: 0,
    pitch: 0,
    easing: 'easeInOutCubic',
    dip: 0,
    ...extra,
  };
}

export interface HoldShotOptions extends Partial<Omit<CameraKeyframe, 'id' | 't' | 'center' | 'zoom'>> {
  /** Seconds after the scene starts before the camera settles here. Default 0.3. */
  leadIn?: number;
  /** Seconds before the scene ends the hold should release by. Defaults to `leadIn`. */
  trailMargin?: number;
}

/**
 * The two-keyframe "hold camera here for this scene" pair — by far the most
 * repeated hand-written pattern across every produced episode (73 individual
 * `keyframe(...)` calls across four build scripts, the large majority of them in
 * exactly this shape: enter a fixed position shortly after the scene starts, hold
 * it, release shortly before the scene ends). Each occurrence's margins were typed
 * by hand and drifted — 0.3/0.3, 0.3/0.4, 0.3/0.5, 0.4/0.5, 0.3/0.6 all appear —
 * which was never a deliberate creative choice, just copy-paste variance. This
 * doesn't remove the ability to vary margins per shot (still pass `leadIn`/
 * `trailMargin` when a beat genuinely needs different pacing), it removes the
 * *arithmetic* — `S.sXX[0] + n` / `S.sXX[1] - n` written out by hand at every call
 * site is exactly the kind of small, silent error surface a one-digit typo turns
 * into a camera that jumps a frame early or late.
 *
 * `bounds` is a scene's `[start, end]` span — what every episode's build script
 * already computes into `S.sXX` from its schedule.
 */
export function holdShot(bounds: readonly [number, number], center: LngLat, zoom: number, opts: HoldShotOptions = {}): [CameraKeyframe, CameraKeyframe] {
  const { leadIn = 0.3, trailMargin = leadIn, ...extra } = opts;
  const [start, end] = bounds;
  const enter = start + leadIn;
  const release = Math.max(enter, end - trailMargin);
  return [keyframe(enter, center, zoom, extra), keyframe(release, center, zoom, extra)];
}

/**
 * Rows → node.
 *
 * One key per channel per row, all sharing the row's id, time and easing — that shared
 * id is what lets `shotsOf` group them back into the row they came from. The arc rides
 * the zoom key, the only channel it acts on, and is omitted when zero so files carry
 * it only where someone set one.
 */
export function cameraFromShots(
  shots: readonly CameraKeyframe[],
  init: { id?: string; name?: string } = {},
): CameraNode {
  const rows = [...shots].sort((a, b) => a.t - b.t);
  const channel = <T,>(of: (k: CameraKeyframe) => T, arc = false): Track<T> => ({
    kind: 'keyframed',
    keys: rows.map((k) => ({
      id: k.id,
      t: k.t,
      value: of(k),
      easing: k.easing,
      ...(arc && k.dip ? { dip: k.dip } : {}),
    })),
  });

  return {
    id: init.id ?? createId(),
    type: 'camera',
    name: init.name ?? 'Camera',
    // A root until something can be a parent, and last in its list until `addNode` places
    // it. A constructor cannot know its siblings, so it must not guess an order key.
    parentId: null,
    order: FIRST_ORDER,
    tracks: {
      // Copied, so the node shares no array with the row it was built from.
      center: channel((k) => [k.center[0], k.center[1]] as LngLat),
      zoom: channel((k) => k.zoom, true),
      bearing: channel((k) => k.bearing),
      pitch: channel((k) => k.pitch),
    },
    behaviours: {},
  };
}

/** The camera a new project starts with: one establishing shot of the whole map. */
export function createCamera(): CameraNode {
  return cameraFromShots([keyframe(0, [0, 20], 1.8)]);
}

/**
 * Node → rows.
 *
 * The centre channel is canonical — a shot is meaningless without a place — so the
 * view walks its keys and looks the siblings up by id. A channel that is not keyframed
 * (a static or expression camera is writable by hand and, later, by per-channel
 * editing) simply contributes its fallback for the rows it has no key in: such keys
 * stop forming a row rather than forcing a grid onto data that no longer lines up.
 */
export function shotsOf(camera: CameraNode): CameraKeyframe[] {
  const { center, zoom, bearing, pitch } = camera.tracks;
  if (center.kind !== 'keyframed') return [];

  const byId = <T,>(track: Track<T>): ReadonlyMap<string, Keyframe<T>> =>
    new Map(track.kind === 'keyframed' ? track.keys.map((k) => [k.id, k] as const) : []);
  const z = byId(zoom);
  const b = byId(bearing);
  const p = byId(pitch);

  return center.keys.map((k) => ({
    id: k.id,
    t: k.t,
    // Copied: the view must not be a handle into the document.
    center: [k.value[0], k.value[1]] as LngLat,
    zoom: z.get(k.id)?.value ?? 2,
    bearing: b.get(k.id)?.value ?? 0,
    pitch: p.get(k.id)?.value ?? 0,
    easing: k.easing,
    dip: z.get(k.id)?.dip ?? 0,
  }));
}

/** The row for one shot id, or nothing. */
export function shotAt(camera: CameraNode, id: string): CameraKeyframe | undefined {
  return shotsOf(camera).find((s) => s.id === id);
}

/** Write one key into one channel, replacing by id or inserting in time order. */
function setKey<T>(track: Track<T>, key: Keyframe<T>): void {
  if (track.kind !== 'keyframed') return;
  const i = track.keys.findIndex((k) => k.id === key.id);
  if (i >= 0) track.keys[i] = key;
  else {
    track.keys.push(key);
    track.keys.sort((a, b) => a.t - b.t);
  }
}

/** Edit the key with `id` in one channel, if the channel and the key are there. */
function editKey<T>(track: Track<T>, id: string, fn: (key: Keyframe<T>) => void): void {
  if (track.kind !== 'keyframed') return;
  const key = track.keys.find((k) => k.id === id);
  if (key) fn(key);
}

/**
 * Insert a shot, or replace the one it lands on.
 *
 * Replacing keeps the existing row's id and time: a second double-click on a region
 * re-aims the shot rather than stacking a twin at the same instant, where whichever
 * happened to sort first would silently win.
 */
export function upsertShot(camera: CameraNode, shot: CameraKeyframe): void {
  const existing = shotsOf(camera).find((s) => s.id === shot.id || Math.abs(s.t - shot.t) < SHOT_EPSILON);
  if (existing) {
    patchShot(camera, existing.id, { ...shot, t: existing.t });
    return;
  }
  setKey(camera.tracks.center, { id: shot.id, t: shot.t, value: [shot.center[0], shot.center[1]], easing: shot.easing });
  setKey(camera.tracks.zoom, { id: shot.id, t: shot.t, value: shot.zoom, easing: shot.easing, ...(shot.dip ? { dip: shot.dip } : {}) });
  setKey(camera.tracks.bearing, { id: shot.id, t: shot.t, value: shot.bearing, easing: shot.easing });
  setKey(camera.tracks.pitch, { id: shot.id, t: shot.t, value: shot.pitch, easing: shot.easing });
}

/**
 * Edit one shot across its channels.
 *
 * Fields mutate one at a time rather than the track being replaced — a replacement
 * reads as a change even when nothing moved, and costs an undo step that reverses
 * nothing. Only a retime re-sorts, because only a retime can disturb the order. An arc
 * of zero removes the key's `dip` rather than writing it, so a shot that never arced
 * and one whose arc was removed serialise identically.
 */
export function patchShot(camera: CameraNode, id: string, patch: Partial<CameraKeyframe>): void {
  const { tracks } = camera;
  if (patch.center) {
    const center: LngLat = [patch.center[0], patch.center[1]];
    editKey(tracks.center, id, (k) => {
      k.value = center;
    });
  }
  if (patch.zoom !== undefined) editKey(tracks.zoom, id, (k) => void (k.value = patch.zoom as number));
  if (patch.bearing !== undefined) editKey(tracks.bearing, id, (k) => void (k.value = patch.bearing as number));
  if (patch.pitch !== undefined) editKey(tracks.pitch, id, (k) => void (k.value = patch.pitch as number));
  if (patch.easing !== undefined) {
    eachChannel(tracks, (keyed) => {
      const key = keyed.keys.find((k) => k.id === id);
      if (key) key.easing = patch.easing as EasingName;
    });
  }
  if (patch.dip !== undefined) {
    editKey(tracks.zoom, id, (k) => {
      if (patch.dip) k.dip = patch.dip;
      else delete k.dip;
    });
  }
  if (patch.t !== undefined) {
    const t = patch.t;
    eachChannel(tracks, (keyed) => {
      const key = keyed.keys.find((k) => k.id === id);
      if (key) key.t = t;
      keyed.keys.sort((a, b) => a.t - b.t);
    });
  }
}

/** Remove one shot from every channel. */
export function removeShot(camera: CameraNode, id: string): void {
  eachChannel(camera.tracks, (keyed) => {
    keyed.keys = keyed.keys.filter((k) => k.id !== id);
  });
}
