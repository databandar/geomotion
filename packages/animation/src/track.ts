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
import { TRACK_KINDS } from '@geomotion/document';
import type { Keyframe, Track } from '@geomotion/document';
import { ease } from './easing.ts';
import { compileExpr } from './expr.ts';

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

/**
 * Read one fact off one entity — the resolution a `bound` track needs.
 *
 * A function rather than the registry itself, so `animation` never learns what an entity
 * *is*. §2 lets it reach `entities` for fact resolution; taking the lookup as a parameter
 * means it does not have to, and the evaluator can bind against anything fact-shaped —
 * a region's computed rank today, a document-level registry later — without this file
 * changing.
 */
export type FactLookup = (ref: string, path: string) => number | string | null | undefined;

/** The rare arguments, named. Five positional parameters is nobody's idea of an API. */
export interface EvalOptions<T> {
  interpolate?: Interpolate<T>;
  fallback?: T;
  facts?: FactLookup;
}

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
 * Every kind is evaluated. `static` and `keyframed` read what was authored, `bound` reads
 * a fact through `facts`, and `expr` computes from `t` and its declared inputs — which
 * are themselves resolved through `facts`, so an expression reaches data and never
 * another track. That restriction is what makes cycles impossible by construction rather
 * than by a visited-set at evaluation time.
 */
// Numbers are the overwhelming majority of channels, so they get an overload that does
// not make every call site restate `lerpNumber`. Anything else must say how it blends,
// which is the decision §06 wants made per channel rather than guessed centrally.
export function evalTrack(track: Track<number>, time: number, opts?: EvalOptions<number>): number;
export function evalTrack<T>(track: Track<T>, time: number, opts: EvalOptions<T>): T;
export function evalTrack<T>(track: Track<T>, time: number, opts: EvalOptions<T> = {}): T {
  const { interpolate, fallback, facts } = opts;
  const blend = interpolate ?? (lerpNumber as unknown as Interpolate<T>);

  if (track.kind === 'bound') {
    /*
     * §05's bindings out: a property reads a fact off an entity by its stable id, so a
     * marker can be sized by a region's value or a label can print its rank.
     *
     * A missing fact falls back rather than resolving to zero. Zero is a real value in
     * every one of these datasets, and a region that simply has no figure would
     * otherwise render as the bottom of the scale — indistinguishable from a genuine
     * low, which is the failure the "no data" colour exists to prevent.
     */
    const value = facts?.(track.ref, track.path);
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback as T;
    return (value * (track.scale ?? 1)) as unknown as T;
  }
  if (track.kind === 'expr') {
    /*
     * §04's fourth kind. The source is parsed, not executed — see `expr.ts` for why a
     * project file must never reach `new Function`.
     *
     * Inputs are declared on the track as `name -> "entityId.factPath"` and resolved
     * through the same lookup `bound` uses, so an expression can only read leaf data.
     * Letting a name refer to another *track* would be more powerful and would introduce
     * cycles — `a = b + 1`, `b = a + 1` — which would need detection at every evaluation,
     * sixty times a second, to avoid a stack overflow in the render loop.
     *
     * A source that will not parse, a name that resolves to nothing, and a result that is
     * not finite all land on the fallback. An expression is authored by typing, so it is
     * *usually* invalid — it is invalid at every keystroke on the way to being right —
     * and a half-typed formula must not take the picture down with it.
     */
    const compiled = compileExpr(track.source);
    if (!compiled.ok) return fallback as T;

    const inputs: Record<string, number> = {};
    if (compiled.refs.length > 0) {
      for (const name of compiled.refs) {
        const ref = track.inputs?.[name];
        if (ref === undefined) continue;
        // `entityId.factPath`, split at the first dot: an id may not contain one, a
        // fact path may.
        const dot = ref.indexOf('.');
        const value =
          dot < 0 ? facts?.(ref, '') : facts?.(ref.slice(0, dot), ref.slice(dot + 1));
        if (typeof value === 'number' && Number.isFinite(value)) inputs[name] = value;
      }
    }

    const out = compiled.run({ t: time, inputs });
    return out === undefined ? (fallback as T) : (out as unknown as T);
  }

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

/** Where a time falls inside a keyframed track, in raw un-eased terms. */
export interface TrackSegment<T> {
  /** Index of the key the segment leaves. */
  index: number;
  from: Keyframe<T>;
  to: Keyframe<T>;
  /** 0..1 across the segment, *before* easing. */
  u: number;
}

/**
 * The segment `time` falls in, or null outside the keyed range.
 *
 * For modifiers that act on a segment rather than on the authored values — the camera's
 * `dip` pulls the zoom back mid-move and peaks at the middle regardless of the easing,
 * so it needs raw progress, which `evalTrack` deliberately does not expose.
 *
 * Null before the first key, at or after the last, and on a hold: none of those are
 * inside a moving segment, and a modifier that fired there would act where nothing is
 * travelling. Sharing this scan is also what keeps a caller from rolling its own and
 * drifting from the evaluator's idea of which segment is current.
 */
export function trackSegment<T>(track: Track<T>, time: number): TrackSegment<T> | null {
  if (track.kind !== 'keyframed') return null;
  const keys = track.keys;
  const i = segmentAt(keys, time);
  if (i < 0) return null;

  const from = keys[i] as Keyframe<T>;
  const to = keys[i + 1];
  if (!to || from.hold) return null;

  const span = to.t - from.t;
  if (span <= 0) return null;
  return { index: i, from, to, u: clamp01((time - from.t) / span) };
}

/**
 * Whether `evalTrack` can evaluate this kind. All four, since `expr` landed.
 *
 * Kept rather than deleted: it is the check a caller makes before trusting a value, and
 * the fifth kind §04 calls an ADR-level change will need it again. Returning a constant
 * `true` is also the honest report — every kind in the union is handled, and the
 * exhaustiveness of that is what the type checker now guarantees.
 */
export function trackKindSupported<T>(track: Track<T>): boolean {
  return TRACK_KINDS.includes(track.kind);
}
