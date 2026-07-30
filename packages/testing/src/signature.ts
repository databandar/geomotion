/**
 * Render signatures: a way to answer "did the picture change?"
 *
 * ENGINEERING_GUIDE §12 makes renderer correctness golden-frame work. Committing
 * PNGs would work but reviews badly — a binary blob tells you a frame moved, not
 * how. Instead a frame is reduced to a coarse grid of mean RGB values, which is
 * small enough to commit as readable JSON, diffable in a pull request, and blind
 * to the sub-pixel noise that makes exact pixel comparison useless in practice.
 *
 * What it catches: a layer that stopped drawing, a colour ramp that inverted, a
 * label that moved across the frame, a camera that framed the wrong place.
 * What it will not catch: a one-pixel kerning change, or a subtly wrong glyph.
 * That trade is deliberate — the alternative is a suite nobody can keep green.
 *
 * **Baselines are machine-specific.** GPU rasterisation differs between drivers,
 * and headless software rendering differs from both, so a baseline captured here
 * will not match one captured in CI. These run locally, on purpose; CI keeps the
 * structural checks that are portable.
 */

/** A frame reduced to a grid of mean RGB values, row-major, 0..255. */
export interface Signature {
  /** Grid columns. */
  w: number;
  /** Grid rows. */
  h: number;
  /** `w * h * 3` values: r, g, b per cell, row-major. */
  cells: number[];
}

/** A named set of signatures — one per captured moment. */
export interface Baseline {
  /** What produced this, so a stale baseline is identifiable. */
  capturedOn: string;
  frames: Record<string, Signature>;
}

export interface Diff {
  /** Largest single-channel difference, 0..255. */
  maxDelta: number;
  /** Mean absolute difference across every channel. */
  meanDelta: number;
  /** Cells with any channel over the tolerance. */
  changedCells: number;
  /** Total cells compared. */
  totalCells: number;
  /** Grid position of the worst cell, for pointing at the region that moved. */
  worst: { x: number; y: number; delta: number } | null;
}

/**
 * Per-channel tolerance, in 0..255.
 *
 * Zero, because it was measured rather than guessed: three consecutive captures
 * of all ten fixture frames came back bit-identical, so any nonzero delta is a
 * real change in what the renderer drew. An earlier value of 6 was defensive
 * guesswork, and it was loose enough to pass a 4px shift in the legend — which is
 * exactly the class of regression this exists to catch.
 *
 * The cost is that a GPU driver or browser update will shift every frame at once.
 * That reads as a whole-baseline diff rather than a single suspicious frame, and
 * the platform stamp in the baseline says to recapture; a per-frame regression
 * never looks like that.
 */
export const DEFAULT_TOLERANCE = 0;

export function compare(a: Signature, b: Signature, tolerance = DEFAULT_TOLERANCE): Diff {
  if (a.w !== b.w || a.h !== b.h) {
    throw new Error(`signature grids differ: ${a.w}x${a.h} vs ${b.w}x${b.h}`);
  }

  const total = a.w * a.h;
  let sum = 0;
  let maxDelta = 0;
  let changedCells = 0;
  let worst: Diff['worst'] = null;

  for (let i = 0; i < total; i++) {
    let cellMax = 0;
    for (let c = 0; c < 3; c++) {
      const d = Math.abs((a.cells[i * 3 + c] ?? 0) - (b.cells[i * 3 + c] ?? 0));
      sum += d;
      if (d > cellMax) cellMax = d;
    }
    if (cellMax > tolerance) changedCells++;
    if (cellMax > maxDelta) {
      maxDelta = cellMax;
      worst = { x: i % a.w, y: Math.floor(i / a.w), delta: cellMax };
    }
  }

  return { maxDelta, meanDelta: sum / (total * 3), changedCells, totalCells: total, worst };
}

/**
 * Whether two signatures agree — exactly, by default.
 *
 * Both knobs exist for callers that have measured a reason to loosen them (a
 * fixture that genuinely races tile loading, say). Loosening the default because
 * a check went red is how a harness stops meaning anything.
 */
export function matches(a: Signature, b: Signature, tolerance = DEFAULT_TOLERANCE, maxChangedCells = 0): boolean {
  const d = compare(a, b, tolerance);
  return d.changedCells <= maxChangedCells;
}

/** One line describing a diff, for a terminal report. */
export function describe(name: string, d: Diff): string {
  const pct = ((d.changedCells / d.totalCells) * 100).toFixed(1);
  const where = d.worst ? ` worst cell (${d.worst.x},${d.worst.y}) Δ${d.worst.delta}` : '';
  return `${name}: ${d.changedCells}/${d.totalCells} cells changed (${pct}%), max Δ${d.maxDelta}, mean Δ${d.meanDelta.toFixed(2)}${where}`;
}
