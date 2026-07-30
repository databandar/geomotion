/**
 * The legend's arithmetic, separated from its drawing.
 *
 * Box and bar sizes, where the ticks sit, where the callout points on the scale, and
 * how a number reads. None of it needs a canvas, and all of it is the kind of thing
 * that goes subtly wrong — a box that grows the wrong amount for its no-data row, a
 * callout that leaves the bar, a number that reads differently on someone else's
 * machine.
 */

/** Everything positioned, in device pixels, for one legend. */
export interface LegendMetrics {
  pad: number;
  barW: number;
  barH: number;
  titleSize: number;
  tickSize: number;
  boxW: number;
  boxH: number;
  x: number;
  y: number;
  /** Top of the gradient bar. */
  barY: number;
  /** Baseline of the no-data row; only meaningful when `hasNoData`. */
  noDataY: number;
}

/**
 * Lay the legend out for a frame of the given height.
 *
 * Everything scales from `scale` so the legend is the same size relative to the frame
 * at any export resolution — a legend fixed in pixels would be unreadable at 4K and
 * cover the map at 480p.
 *
 * The box is anchored to the bottom-left and grows *upward*, so adding the no-data row
 * moves the top edge rather than pushing the ticks off the bottom of the frame.
 */
export function legendMetrics(scale: number, frameHeight: number, hasNoData: boolean): LegendMetrics {
  const s = scale;
  const pad = 16 * s;
  const barW = 260 * s;
  const barH = 12 * s;
  const titleSize = 17 * s;
  const tickSize = 14 * s;

  const boxW = barW + pad * 2;
  const boxH = pad * 2 + titleSize + 10 * s + barH + 6 * s + tickSize + (hasNoData ? tickSize + 8 * s : 0);
  const x = 28 * s;
  const y = frameHeight - boxH - 28 * s;
  const barY = y + pad + titleSize + 10 * s;

  return {
    pad,
    barW,
    barH,
    titleSize,
    tickSize,
    boxW,
    boxH,
    x,
    y,
    barY,
    noDataY: barY + barH + 6 * s + tickSize + 8 * s + tickSize * 0.7,
  };
}

/**
 * Where a value sits along the scale, 0..1.
 *
 * Clamped, because a region can hold a value outside the domain whenever the domain is
 * set by hand — and an unclamped callout would point somewhere off the bar entirely.
 *
 * A zero-width domain is the case that matters: every region carrying the same number
 * is ordinary data, not an error, and without the guard it divides by zero and puts the
 * callout at `NaN`, which silently draws nothing.
 */
export function scaleAt(value: number, domain: readonly [number, number]): number {
  const span = domain[1] - domain[0];
  if (!isFinite(value) || !isFinite(span) || Math.abs(span) < 1e-9) return 0;
  const t = (value - domain[0]) / span;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * A number as the legend and the labels print it.
 *
 * `locale` is a parameter and not the machine's default on purpose. This text is
 * rendered into an exported video, and `toLocaleString(undefined, …)` reads the
 * *rendering machine's* locale — so the same project produced `1,234.5` here and
 * `1.234,5` on a German laptop. The evaluator's whole contract is that one document
 * gives one scene; a number that depends on where it was rendered breaks that, and it
 * breaks it invisibly, in a file someone has already published.
 *
 * A short unit is set tight against the number (`50%`, `12km`) and a word is spaced
 * off it (`12 people`), which is how each reads naturally.
 */
export function formatValue(v: number, decimals: number, unit: string, locale: string): string {
  const n = v.toLocaleString(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  if (!unit) return n;
  return unit.length <= 2 ? `${n}${unit}` : `${n} ${unit}`;
}
