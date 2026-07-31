/**
 * Property tracks — how any value in the document varies with time.
 *
 * Governing section: ARCHITECTURE §04, "every property is a track". One mechanism for
 * everything animatable, in place of the eighteen bespoke tween fields the document
 * carries today (`fade`, `drawStart`, `pop`, `dissipateStart`, `anim`, …), each with its
 * own field names and its own evaluation code. ENGINEERING_GUIDE §126 names that pattern
 * as the v1 anti-pattern and forbids adding to it.
 *
 * Types only. Evaluation lives in `@geomotion/animation`, which is where §2 assigns
 * `evalTrack`; this package must stay free of it so the renderer and the pipeline can
 * read the document without pulling in the motion engine.
 */
import { createId } from '@geomotion/core';
import type { EasingName } from './types.ts';

/**
 * One authored value at one instant.
 *
 * `easing` applies to the segment leaving this key, which is the convention the camera
 * already uses — reversing it would silently retime every existing project.
 */
export interface Keyframe<T> {
  id: string;
  /** seconds on the timeline */
  t: number;
  value: T;
  easing: EasingName;
  /**
   * Hold the value until the next key instead of interpolating toward it — a step, not
   * a ramp. A flag rather than a fifth track kind: §04 fixes the kinds at four and calls
   * a fifth an ADR-level change, while §06 lists hold alongside bezier and linear as a
   * curve choice *within* a keyframed track.
   */
  hold?: boolean;
  /**
   * How far the camera pulls its zoom back across the segment leaving this key — the
   * cinematic "arc".
   *
   * Segment metadata like `easing`, but camera-zoom specific: it is read only from a
   * camera's zoom channel, and writing it anywhere else does nothing. Absent means 0,
   * so files carry it only where someone set one. It lives on the key until the camera
   * rig (§09) exists to hold it as a `zoomEnvelope` behaviour — at which point moving
   * it is a lift, not a redesign.
   */
  dip?: number;
}

/**
 * A property's value over time. The four kinds are fixed by §04; a fifth is ADR-level.
 *
 * `bound` and `expr` are declared here from the start so that every `switch` over a
 * track is exhaustive today, and adding their evaluation later is a compile error at
 * each site that must handle them rather than a silent fallthrough.
 */
export type Track<T> =
  | { kind: 'static'; value: T }
  | { kind: 'keyframed'; keys: Keyframe<T>[] }
  /** §05 — read a fact off an entity. Not evaluated until the entity core lands. */
  | { kind: 'bound'; ref: string; path: string; scale?: number }
  /** §06 — a deterministic expression over other tracks. Not evaluated yet. */
  | { kind: 'expr'; source: string; inputs?: Record<string, string> };

/** The everyday case: a value that does not move. */
export const staticTrack = <T>(value: T): Track<T> => ({ kind: 'static', value });

/**
 * A keyframed track, sorted by time.
 *
 * Sorting on construction rather than on read: evaluation runs once per property per
 * frame and must not pay to re-establish an invariant the document can hold. Callers
 * that mutate keys are expected to go through a transaction that keeps the order.
 */
export const keyframedTrack = <T>(keys: Keyframe<T>[]): Track<T> => ({
  kind: 'keyframed',
  keys: [...keys].sort((a, b) => a.t - b.t),
});

/** Whether a track will ever change value — used to skip work, never to change output. */
export function isAnimated<T>(track: Track<T>): boolean {
  return track.kind === 'keyframed' ? track.keys.length > 1 : track.kind !== 'static';
}

/**
 * The value a track holds if time is not consulted.
 *
 * For a static track that is the value; for a keyframed one it is the first key, which
 * is what the inspector shows when it has no playhead to read. Returns `undefined` for
 * the kinds M1 does not evaluate, so a caller cannot mistake "not implemented" for a
 * real value.
 */
export function restValue<T>(track: Track<T>): T | undefined {
  if (track.kind === 'static') return track.value;
  if (track.kind === 'keyframed') return track.keys[0]?.value;
  return undefined;
}

/** The four kinds §04 fixes. A fifth is an ADR-level change. */
export const TRACK_KINDS = ['static', 'keyframed', 'bound', 'expr'] as const;

/** Whether a value is shaped like a track — used to route validation, not to trust it. */
export function isTrack(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  return typeof kind === 'string' && (TRACK_KINDS as readonly string[]).includes(kind);
}

/**
 * Validate a loaded track, falling back when it is not one.
 *
 * A track is a discriminated union, and the "defaults are the schema" repair that runs
 * over the rest of the document cannot handle one: it merges field by field against a
 * *static* default, so a loaded keyframed track came back with a nonsense `value` grafted
 * on beside its `keys`. Harmless to `evalTrack`, which switches on `kind` — but it was
 * then written back to disk, so every saved project would carry the junk and any later
 * reader would have to guess which field meant anything.
 *
 * Each kind is checked for the one field it cannot work without, and nothing else: the
 * contents of `keys` are the schema's business, not this function's.
 */
export function coerceTrack<T>(loaded: unknown, fallback: Track<T>): Track<T> {
  if (!isTrack(loaded)) return fallback;
  const t = loaded as Track<T>;
  switch (t.kind) {
    case 'static':
      return 'value' in t ? t : fallback;
    case 'keyframed':
      return Array.isArray(t.keys) ? t : fallback;
    case 'bound':
      return typeof t.ref === 'string' && typeof t.path === 'string' ? t : fallback;
    case 'expr':
      return typeof t.source === 'string' ? t : fallback;
    default:
      return fallback;
  }
}

/* ------------------------------------------------------------- editing */

/**
 * How close two key times must be to count as the same instant.
 *
 * Editing happens at the playhead, which is a float. Without a tolerance, dragging a
 * slider at 2.0000001s would lay down a new key beside the one at 2s on every pointer
 * move — hundreds of keys a second, none of them removable by clicking where they look
 * to be. Half a frame at 60fps is under any interval a person can scrub to and well over
 * the error in a playhead.
 */
export const KEY_EPSILON = 1 / 120;

const at = <T>(keys: readonly Keyframe<T>[], time: number) =>
  keys.findIndex((k) => Math.abs(k.t - time) < KEY_EPSILON);

/**
 * Set the value at `time`, replacing the key there or adding one.
 *
 * Upsert rather than append: this runs from a slider, and a drag must adjust the one key
 * under the playhead rather than lay down a trail behind it.
 *
 * On a static track it simply changes the value. A control should not silently start
 * animating a property because the playhead happened to move — turning a property into
 * an animated one is a deliberate act, and `toKeyframed` is where it happens.
 */
export function withValueAt<T>(track: Track<T>, time: number, value: T, easing: EasingName): Track<T> {
  if (track.kind === 'static') return { kind: 'static', value };
  if (track.kind !== 'keyframed') return track;

  const i = at(track.keys, time);
  if (i >= 0) {
    const keys = [...track.keys];
    keys[i] = { ...(keys[i] as Keyframe<T>), value };
    return { kind: 'keyframed', keys };
  }
  return keyframedTrack([...track.keys, { id: createId(), t: time, value, easing }]);
}

/**
 * Start animating: one key at `time` holding what the property already shows.
 *
 * `valueNow` is passed in rather than evaluated here, because evaluation lives in
 * `@geomotion/animation` and this package must not depend on it — the renderer and the
 * pipeline read documents without pulling in the motion engine.
 *
 * Seeding with the current value means switching a property to animated changes nothing
 * on screen. The alternative — an empty track, or a key at zero — makes the picture jump
 * the moment you click the pip, which reads as a bug rather than a mode change.
 */
export function toKeyframed<T>(track: Track<T>, time: number, valueNow: T, easing: EasingName): Track<T> {
  if (track.kind === 'keyframed') return track;
  return { kind: 'keyframed', keys: [{ id: createId(), t: time, value: valueNow, easing }] };
}

/**
 * Remove the key at `time`, if there is one.
 *
 * Removing the last key would leave a track that evaluates to nothing, so the property
 * falls back to static holding that key's value — which is what the user sees at the
 * moment they delete it, and keeps every property always readable.
 */
export function withoutKeyAt<T>(track: Track<T>, time: number): Track<T> {
  if (track.kind !== 'keyframed') return track;
  const i = at(track.keys, time);
  if (i < 0) return track;

  const keys = track.keys.filter((_, k) => k !== i);
  if (keys.length === 0) return { kind: 'static', value: (track.keys[i] as Keyframe<T>).value };
  return { kind: 'keyframed', keys };
}

/** Whether a key sits at `time` — for showing the playhead\'s keyframe as filled. */
export function hasKeyAt<T>(track: Track<T>, time: number): boolean {
  return track.kind === 'keyframed' && at(track.keys, time) >= 0;
}

/**
 * Move one key to a new time.
 *
 * If it lands on another key, that one is replaced — the same rule as dragging a layer
 * bar onto another, and the only alternative is two keys at one instant, where whichever
 * happens to sort first silently wins.
 */
export function withKeyMoved<T>(track: Track<T>, keyId: string, time: number): Track<T> {
  if (track.kind !== 'keyframed') return track;
  const moving = track.keys.find((k) => k.id === keyId);
  if (!moving) return track;

  const rest = track.keys.filter((k) => k.id !== keyId && Math.abs(k.t - time) >= KEY_EPSILON);
  return keyframedTrack([...rest, { ...moving, t: time }]);
}

/**
 * The names of an object's tracked properties.
 *
 * Derived by looking, rather than declared in a list that would drift the first time a
 * property became tracked and nobody updated it. The timeline and the inspector both ask
 * this question, and they must not be able to disagree.
 */
export function trackedProps(node: object): string[] {
  return Object.entries(node)
    .filter(([, v]) => isTrack(v))
    .map(([k]) => k);
}

/**
 * Read a track back as a simple window, when it is one.
 *
 * Exactly two keys ramping 0 → 1 is the shape the old `drawStart` / `drawEnd` fields
 * described, and it is what almost every reveal actually is. Recognising it lets the
 * inspector keep offering Start / End / Easing — the controls people already know — over
 * a model that is no longer limited to them.
 *
 * `null` for anything else, and the caller is expected to say so rather than quietly
 * rewriting: a third key is a deliberate act, and a Start field that flattened it back to
 * two would silently undo work.
 */
export function windowOf(track: Track<number>): { from: number; to: number; easing: EasingName } | null {
  if (track.kind !== 'keyframed' || track.keys.length !== 2) return null;
  const [a, b] = track.keys as [Keyframe<number>, Keyframe<number>];
  if (a.value !== 0 || b.value !== 1) return null;
  return { from: a.t, to: b.t, easing: a.easing };
}

/* ---------------------------------------------------------- behaviours */

/**
 * The behaviour types this format knows. Adding one is additive; removing one needs a
 * migration, because a document may name it.
 */
export type BehaviourType = 'pop' | 'pulse';

/**
 * One rule in a layer's stack (§06).
 *
 * `enabled` rather than deletion, because §06 asks for toggle: turning a behaviour off
 * to see what it was doing is the point, and it must come back with its parameters
 * intact. Order is part of the document — a stack that sorted itself would make the
 * result unpredictable.
 */
export interface Behaviour {
  id: string;
  type: BehaviourType;
  enabled: boolean;
  params?: Record<string, number>;
}

/**
 * A node's behaviour stacks, keyed by the property each one modifies.
 *
 * §06's pipeline is `value(t) = behaviors(expr(base(t)))` **per property**. M10 stored a
 * single list on the layer and applied it to scale, which held only while there was one
 * behaviour: adding `pulse` — which draws a ring, not a size — made every marker throb.
 * Keying by property is what makes "which value does this modify" answerable rather than
 * implied.
 *
 * Keyed by the same names the property tracks use, so the flat node store (§04's
 * `props: Record<string, Track>`) can carry both side by side without either needing to
 * know about the other.
 */
export type BehaviourStacks = Record<string, Behaviour[]>;
