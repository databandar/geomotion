/**
 * Ripple — v2 design §10.
 *
 * "Dragging a block ripples its children and re-anchors what follows; re-recording a
 * line re-measures and ripples." This is that, and it is what makes §00's frozen voice
 * bed structurally impossible *in both directions*: the picture follows the voice when a
 * line is retimed, and the voice follows the picture when a beat is dragged.
 *
 * Everything here is pure and returns new objects. A ripple touches most of the document
 * at once, so it must be one transaction that either lands or does not — half a ripple is
 * a composition where the narration and the map disagree, which is the exact failure this
 * exists to prevent.
 */
import type { AudioCue, Layer } from './types.ts';
import type { StoryBlock } from './story.ts';
import { KEY_EPSILON, isTrack, type Track } from './track.ts';

/**
 * Move a layer along the timeline by `dt`.
 *
 * Its keyframes move with it. Track times are **absolute** — a route created at 5s has
 * its progress keys at 5 and 9 — so shifting only `in` and `out` would leave the reveal
 * behind, and the layer would draw itself at a moment it is no longer on screen.
 *
 * Behaviours are not touched: they key off `local`, seconds since the layer entered, so
 * they move with the layer by construction. That asymmetry is the point of the
 * track/behaviour split.
 */
export function shiftLayer<T extends Layer>(layer: T, dt: number): T {
  if (dt === 0) return layer;
  const out = { ...layer, in: layer.in + dt, out: layer.out + dt } as Record<string, unknown>;

  for (const [key, value] of Object.entries(layer)) {
    if (!isTrack(value)) continue;
    const track = value as Track<unknown>;
    if (track.kind !== 'keyframed') continue;
    out[key] = { ...track, keys: track.keys.map((k) => ({ ...k, t: k.t + dt })) };
  }
  return out as T;
}

/** Move a cue, keeping it on the timeline. */
export function shiftCue(cue: AudioCue, dt: number): AudioCue {
  return dt === 0 ? cue : { ...cue, t: Math.max(0, cue.t + dt) };
}

/**
 * Which cues a block owns.
 *
 * By the window it occupies rather than by a stored link, for the same reason the
 * composer finds a block's layers that way: a block *is* a stretch of time, and a
 * second bookkeeping system could disagree with the timeline it describes.
 *
 * A cue is claimed by its start, not its span. A line that overruns its beat is common —
 * that is what makes timing hard — and claiming it twice would move it twice.
 *
 * Compared with a tolerance, because the two numbers come from different places. The
 * composer writes cue times rounded and block times not: an "overview" beat starting at
 * 6.1044 owned a line starting at 6.1040, and an exact `>=` left that line behind when
 * the block moved — three of six cues in a real project, orphaned by four ten-thousandths
 * of a second. Half a frame at 60fps is far below anything a person can author and far
 * above the disagreement.
 *
 * The tolerance is applied to both bounds so a cue is still claimed exactly once.
 */
export function cuesIn(cues: readonly AudioCue[], block: StoryBlock): AudioCue[] {
  return cues.filter((c) => c.t >= block.t - KEY_EPSILON && c.t < block.t + block.d - KEY_EPSILON);
}

export interface RippleResult {
  story: StoryBlock[];
  layers: Layer[];
  cues: AudioCue[];
}

/**
 * Move a block to `t`, taking what it choreographs and re-anchoring what follows.
 *
 * Blocks that start at or after the dragged block move by the same delta; blocks before
 * it stay. A block cannot be dragged before zero, and the whole ripple is clamped by that
 * rather than the block alone — otherwise dragging the first block to the left would
 * squash it into its successor instead of refusing.
 *
 * A layer belonging to two blocks moves once. Overlap is ordinary (a title spanning a
 * beat boundary), and moving it per-block would move it twice.
 */
export function rippleBlockTo(
  story: readonly StoryBlock[],
  layers: readonly Layer[],
  cues: readonly AudioCue[],
  blockId: string,
  t: number,
): RippleResult {
  const target = story.find((b) => b.id === blockId);
  if (!target) return { story: [...story], layers: [...layers], cues: [...cues] };

  const dt = Math.max(0, t) - target.t;
  if (dt === 0) return { story: [...story], layers: [...layers], cues: [...cues] };

  const moving = story.filter((b) => b.t >= target.t);
  const movingIds = new Set(moving.map((b) => b.id));
  // A set, so a layer in two moving blocks is shifted once.
  const movingNodes = new Set(moving.flatMap((b) => b.nodes));
  const movingCues = new Set(moving.flatMap((b) => cuesIn(cues, b)).map((c) => c.id));

  return {
    story: story.map((b) => (movingIds.has(b.id) ? { ...b, t: Math.max(0, b.t + dt) } : b)),
    layers: layers.map((l) => (movingNodes.has(l.id) ? shiftLayer(l, dt) : l)),
    cues: cues.map((c) => (movingCues.has(c.id) ? shiftCue(c, dt) : c)),
  };
}

/**
 * Re-length a block, pushing or pulling everything after it.
 *
 * What "re-recording a line re-measures and ripples" means: a longer take does not
 * overlap the next beat, it moves it. Blocks strictly after the one being resized shift
 * by the change in length, as do their layers and cues — the resized block's own children
 * stay put, because its start has not moved.
 */
export function rippleBlockLength(
  story: readonly StoryBlock[],
  layers: readonly Layer[],
  cues: readonly AudioCue[],
  blockId: string,
  d: number,
): RippleResult {
  const target = story.find((b) => b.id === blockId);
  if (!target) return { story: [...story], layers: [...layers], cues: [...cues] };

  const next = Math.max(0.05, d);
  const dt = next - target.d;
  if (dt === 0) return { story: [...story], layers: [...layers], cues: [...cues] };

  const after = story.filter((b) => b.t >= target.t + target.d);
  const afterIds = new Set(after.map((b) => b.id));
  const afterNodes = new Set(after.flatMap((b) => b.nodes));
  // A layer this block also owns stays: it belongs to the block that is not moving.
  for (const id of target.nodes) afterNodes.delete(id);
  const afterCues = new Set(after.flatMap((b) => cuesIn(cues, b)).map((c) => c.id));

  return {
    story: story.map((b) =>
      b.id === blockId ? { ...b, d: next } : afterIds.has(b.id) ? { ...b, t: Math.max(0, b.t + dt) } : b,
    ),
    layers: layers.map((l) => (afterNodes.has(l.id) ? shiftLayer(l, dt) : l)),
    cues: cues.map((c) => (afterCues.has(c.id) ? shiftCue(c, dt) : c)),
  };
}
