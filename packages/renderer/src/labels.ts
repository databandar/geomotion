/**
 * Where the closing shot's region labels go, and which of them survive.
 *
 * Split out of `drawOverlay` because none of it needs a canvas: given a projected
 * point and a box size, the answers are arithmetic. Everything here is pure and
 * exactly testable, which the drawing around it is not — the golden harness can only
 * say the frame changed, not which label moved or why.
 */

/** A label's screen box, in device pixels. */
export interface LabelBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * The order labels are placed in, which is the order they win collisions in.
 *
 * Tour stops come first, in tour order, so the ranking chosen in the inspector is the
 * priority on screen. Regions the tour skipped follow, and only if they carry a value —
 * the closing shot labels the whole picture, but an unvalued region has nothing to say.
 *
 * Indices are into `regions`, and each appears at most once: `order` may name a region
 * twice, or name one that no longer exists, and both used to be possible after an
 * import replaced the data under a saved tour.
 */
export function labelPriority(order: readonly number[], regions: readonly { value: number | null }[]): number[] {
  const out: number[] = [];
  const taken = new Set<number>();
  for (const i of order) {
    if (regions[i] && !taken.has(i)) {
      taken.add(i);
      out.push(i);
    }
  }
  regions.forEach((r, i) => {
    if (!taken.has(i) && r.value !== null) out.push(i);
  });
  return out;
}

/**
 * How far the label at `index` has arrived, 0..1.
 *
 * The `+ 6` overlaps the stagger: each label starts before its predecessor has
 * finished, so a long list reads as a sweep rather than a queue. Without it the last
 * label of forty would not begin until the outro was almost over.
 */
export function labelAppear(outroProgress: number, count: number, index: number): number {
  const t = outroProgress * (count + 6) - index;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Whether a region is too small on screen to hold its own label.
 *
 * Compared against the label's full width rather than its half-width: a label centred
 * on a region narrower than the text covers its neighbours, which is how one dense
 * state's number ended up over three others.
 */
export function needsOffset(spanPx: number, halfWidth: number): boolean {
  return spanPx < halfWidth * 1.6;
}

/**
 * Push a label off its region, away from frame centre, and keep it fully on screen.
 *
 * Away from centre rather than in a fixed direction: a label pushed outward has the
 * rest of the frame behind it, so the leader line crosses less of the map. The clamp
 * is last, so a label pushed off the edge slides back rather than being dropped.
 */
export function offsetLabel(
  p: { x: number; y: number },
  halfWidth: number,
  size: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const away = Math.atan2(p.y - height / 2, p.x - width / 2);
  const push = halfWidth + size * 1.6;
  return {
    x: Math.max(halfWidth + 8, Math.min(p.x + Math.cos(away) * push, width - halfWidth - 8)),
    y: Math.max(size * 1.4, Math.min(p.y + Math.sin(away) * push, height - size * 1.4)),
  };
}

/** The box a label occupies, centred on its anchor. */
export function labelBox(x: number, y: number, halfWidth: number, size: number): LabelBox {
  return { x0: x - halfWidth, y0: y - size * 1.15, x1: x + halfWidth, y1: y + size * 1.05 };
}

/**
 * Whether `box` touches anything already placed.
 *
 * Strict inequalities throughout, so two labels sharing an edge are not a collision —
 * a column of labels packed exactly against each other is legible, and rejecting it
 * would drop every second one.
 */
export function collides(box: LabelBox, placed: readonly LabelBox[]): boolean {
  return placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0);
}

/** Far enough outside the frame that the label cannot show, even offset. */
export function offScreen(p: { x: number; y: number }, width: number, height: number): boolean {
  if (!isFinite(p.x) || !isFinite(p.y)) return true;
  return p.x < -80 || p.y < -40 || p.x > width + 80 || p.y > height + 40;
}
