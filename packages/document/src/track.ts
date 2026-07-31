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
