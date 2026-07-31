/**
 * The behaviour stack — ARCHITECTURE §06.
 *
 * `value(t) = behaviors( expr( base(t) ) )`. A track says what a property was *authored*
 * to be; a behaviour is a rule that modifies it. The distinction is not academic — it is
 * what M6 found by reading how each of the eighteen bespoke tween fields was actually
 * evaluated. `drawStart`/`drawEnd` was an authored ramp and became a track. `pop` is
 * `overshoot(local / 0.55)`: nobody authored those numbers at any instant, they are a
 * rule about entering. Forcing it into keyframes would have swapped one wrong shape for
 * another.
 *
 * ### Decision 03: linear, and never the front door
 *
 * §06 rejects node-graph-first authoring and keeps the stack linear: an ordered list you
 * can reorder, retime and toggle. This is that list. The graph substrate underneath it
 * is a later concern; nothing here forecloses it, because a graph evaluates to the same
 * `(value, context) => value` shape.
 *
 * Behaviours are **pure and ordered**. Order is part of the document: a scale-up followed
 * by a clamp is not the same picture as a clamp followed by a scale-up, and a stack that
 * quietly sorted itself would make that unpredictable.
 */
import { clamp01 } from '@geomotion/core';
import type { Behaviour, BehaviourType } from '@geomotion/document';

/** What a behaviour is allowed to know. */
export interface BehaviourContext {
  /** Absolute composition time, seconds. */
  time: number;
  /** Seconds since the layer entered — what an entrance rule actually keys off. */
  local: number;
}

export type BehaviourFn = (
  value: number,
  ctx: BehaviourContext,
  params: Readonly<Record<string, number>>,
) => number;

/**
 * Overshoot and settle, once, on entry.
 *
 * The curve `pop` always used, now named and parameterised rather than inlined in the
 * evaluator with its constants spelled out. `over` is how far past the target it swings
 * and `secs` how long the whole move takes; both were fixed numbers before, so every
 * marker in every project popped identically.
 */
const pop: BehaviourFn = (value, ctx, params) => {
  const secs = params.secs && params.secs > 0 ? params.secs : 0.55;
  // The `easeOutBack` constant. Named rather than inlined, because `over` is now a
  // parameter and the default has to be the number markers have always used — a
  // behaviour that quietly re-shaped every existing pop would be a migration changing
  // the picture, which is exactly what these are not allowed to do.
  const over = params.over ?? 1.70158;
  const t = clamp01(ctx.local / secs);
  if (t >= 1) return value;
  const c = over + 1;
  return value * (1 + c * (t - 1) ** 3 + over * (t - 1) ** 2);
};

/**
 * The behaviours this build can evaluate.
 *
 * A table rather than a `switch`, so the set is one list a reader can see the whole of,
 * and so an unknown type from a newer document is a lookup miss rather than a crash.
 *
 * One entry, deliberately. `pulse` looks like a behaviour and is one, but it modifies a
 * marker's *ring*, not its scale — and a stack belongs to a property. Adding it here
 * made every marker throb, which is a different picture from the one projects had.
 */
export const BEHAVIOURS: Record<BehaviourType, BehaviourFn> = { pop };

/**
 * Fold a stack over a base value, in order.
 *
 * A disabled behaviour is skipped rather than removed, because §06 asks for *toggle* —
 * turning one off to see what it was doing is the point, and it must come back with its
 * parameters intact.
 *
 * An unrecognised type is skipped too. A document written by a newer build will name
 * behaviours this one has never heard of, and refusing to draw the layer at all is a far
 * worse answer than drawing it without one effect.
 */
export function applyBehaviours(
  base: number,
  stack: readonly Behaviour[] | undefined,
  ctx: BehaviourContext,
): number {
  if (!stack?.length) return base;

  let value = base;
  for (const b of stack) {
    if (!b.enabled) continue;
    const fn = BEHAVIOURS[b.type];
    if (!fn) continue;
    const next = fn(value, ctx, b.params ?? {});
    // A behaviour that produced nonsense is dropped rather than allowed to propagate:
    // NaN spreads through every later behaviour and lands in the renderer as a shape
    // that silently fails to draw.
    value = Number.isFinite(next) ? next : value;
  }
  return value;
}
