/**
 * Small, named timing arithmetic for staggering layers against a beat — split out
 * for the same reason `windowTrack` was: one formula, used from build scripts and
 * (eventually) the schema layer, instead of copy-pasted and drifting.
 */

export interface StaggerOptions {
  /** Seconds after the window starts before the first item appears. Default 0. */
  leadIn?: number;
  /** Seconds before the window ends the last item should land, at the latest. Default 0. */
  trailMargin?: number;
}

/**
 * `count` times spread evenly across `[start, end]`, first at `start + leadIn`,
 * last at `end - trailMargin`.
 *
 * Replaces the one-off formula the Dandi March episode wrote by hand for its
 * growing-crowd markers (`S.s03[0] + 0.3 + i * ((S.s03[1] - S.s03[0] - 0.6) /
 * crowdStops.length)`) — functionally similar, but that version divided by
 * `count` rather than `count - 1`, so its last item landed one interval short of
 * the trailing margin rather than exactly at it. Not a bug that was ever visible
 * (the margin was generous enough to hide it), but not a deliberate choice either
 * — dividing by `count - 1` is what "first item at the lead-in, last item at the
 * margin" actually means for `count` evenly-spaced points including both ends.
 */
export function stagger(count: number, window: readonly [number, number], opts: StaggerOptions = {}): number[] {
  if (count <= 0) return [];
  const leadIn = opts.leadIn ?? 0;
  const trailMargin = opts.trailMargin ?? 0;
  const [start, end] = window;
  const first = start + leadIn;
  if (count === 1) return [first];
  const usable = Math.max(0, end - trailMargin - first);
  const interval = usable / (count - 1);
  return Array.from({ length: count }, (_, i) => first + i * interval);
}
