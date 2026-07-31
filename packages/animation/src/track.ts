/**
 * `evalTrack` — the `base(t)` of §06's normative pipeline.
 *
 * ARCHITECTURE §06 fixes the order as `value(t) = behaviors( expr( base(t) ) )`. This is
 * the innermost call: given a track and a time, the authored value. Expressions,
 * bindings and behaviour stacks wrap it in later milestones, and each wraps *this*
 * rather than reimplementing keyframe lookup, which is the whole point of having one
 * substrate.
 *
 * Pure and total: same track and time, same value, always, with no throw for any input
 * a document can hold.
 */
import { clamp01, lerp } from '@geomotion/core';
import type { Keyframe, Track } from '@geomotion/document';
import { ease } from './easing.ts';

/**
 * How two authored values blend across a segment, given an eased 0..1 position.
 *
 * A parameter rather than a table inside this function. §06 calls for per-channel
 * interpolation — numbers lerp, angles take the short way round, longitude wraps at the
 * antimeridian, colours and strings hold — and baking that table in here would mean the
 * animation package knowing what a longitude is. §2 lets it depend on `core` and on
 * document *types*, not on geographic meaning.
 */
export type Interpolate<T> = (a: T, b: T, e: number) => T;

/** The default channel: a plain number. */
export const lerpNumber: Interpolate<number> = (a, b, e) => lerp(a, b, e);

/**
 * A channel that cannot be blended — an enum, a colour name, a piece of text.
 *
 * Holds the outgoing value for the whole segment and switches at the next key, which is
 * the only honest answer for a value with nothing between two states.
 */
export const holdValue = <T>(a: T): T => a;

/**
 * Where `time` sits in a sorted key list.
 *
 * Returns the index of the last key at or before `time`, or -1 when `time` precedes
 * every key. A linear scan: property tracks hold single-digit key counts in practice,
 * and a binary search costs more in branches than it saves until well past that.
 */
function segmentAt<T>(keys: readonly Keyframe<T>[], time: number): number {
  let i = -1;
  for (let k = 0; k < keys.length; k++) {
    if ((keys[k] as Keyframe<T>).t <= time) i = k;
    else break;
  }
  return i;
}

/**
 * The authored value of `track` at `time`.
 *
 * Outside the keyed range the value clamps to the nearest key rather than extrapolating.
 * Extrapolation invents values nobody authored, and on a track whose first key sits at
 * five seconds it would put something visibly wrong on frame zero.
 *
 * `bound` and `expr` are not evaluated in this milestone. They return the fallback and
 * are reported by `trackKindSupported`, so a caller can refuse the document rather than
 * discover a silently wrong value in a rendered frame.
 */
// Numbers are the overwhelming majority of channels, so they get an overload that does
// not make every call site restate `lerpNumber`. Anything else must say how it blends,
// which is the decision §06 wants made per channel rather than guessed centrally.
export function evalTrack(track: Track<number>, time: number): number;
export function evalTrack<T>(
  track: Track<T>,
  time: number,
  interpolate: Interpolate<T>,
  fallback?: T,
): T;
export function evalTrack<T>(
  track: Track<T>,
  time: number,
  interpolate?: Interpolate<T>,
  fallback?: T,
): T {
  const blend = interpolate ?? (lerpNumber as unknown as Interpolate<T>);
  if (track.kind === 'static') return track.value;

  if (track.kind === 'keyframed') {
    const keys = track.keys;
    const first = keys[0];
    if (!first) return fallback as T;

    const i = segmentAt(keys, time);
    // Before the first key.
    if (i < 0) return first.value;

    const a = keys[i] as Keyframe<T>;
    const b = keys[i + 1];
    // At or past the last key, and the hold case, which never reaches for `b`.
    if (!b || a.hold) return a.value;

    const span = b.t - a.t;
    // Two keys at the same instant are a step. Dividing by the zero span would give
    // Infinity, and an eased Infinity is NaN — which draws nothing at all.
    if (span <= 0) return b.value;

    return blend(a.value, b.value, ease(a.easing, clamp01((time - a.t) / span)));
  }

  return fallback as T;
}

/** Whether `evalTrack` can actually evaluate this kind yet. See the feature doc. */
export function trackKindSupported<T>(track: Track<T>): boolean {
  return track.kind === 'static' || track.kind === 'keyframed';
}
