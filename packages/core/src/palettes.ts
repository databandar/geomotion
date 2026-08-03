/**
 * Sequential (magnitude) colour ramps only — one hue each, running light→dark,
 * with strictly monotonic lightness. That monotonicity is the whole job: it is
 * what lets a reader rank two regions by colour alone. Never put a rainbow here.
 *
 * On a dark basemap the anchor flips (see `rampColor`): the low end recedes into
 * the dark surface and high values read bright, which is the same relationship
 * inverted for the surface it sits on.
 */

/**
 * How a ramp is meant to be read. Sequential runs end to end and encodes magnitude;
 * diverging runs outward from a dark centre and encodes which side of a reference
 * value a region falls on. See `DIVERGING_RAMPS` for why they are separate.
 */
export type RampKind = 'sequential' | 'diverging';

export interface Ramp {
  id: string;
  name: string;
  /** light → dark for sequential; low arm → centre → high arm for diverging */
  steps: string[];
  /** absent means sequential — the default and the only kind in `RAMPS` */
  kind?: RampKind;
}

/**
 * Sequential ramps only, every one monotonic in lightness — that is what lets a
 * viewer rank two regions by colour alone.
 *
 * The perceptually-uniform ramps (viridis/inferno/plasma) shift hue as they go,
 * which is fine and is *not* the thing to avoid: their lightness still climbs
 * monotonically end to end. The thing to avoid is a cycling rainbow like jet,
 * where lightness goes up and down and rank becomes unreadable.
 */
export const RAMPS: [Ramp, ...Ramp[]] = [
  { id: 'blue', name: 'Blue', steps: ['#cde2fb', '#9ec5f4', '#6da7ec', '#3987e5', '#256abf', '#184f95', '#0d366b'] },
  { id: 'ember', name: 'Ember (red)', steps: ['#fee5d9', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#99000d'] },
  { id: 'amber', name: 'Amber (orange)', steps: ['#feedde', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#8c2d04'] },
  { id: 'forest', name: 'Forest (green)', steps: ['#edf8e9', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32'] },
  { id: 'violet', name: 'Violet', steps: ['#f2f0f7', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#4a1486'] },
  { id: 'teal', name: 'Teal', steps: ['#e0f3f1', '#b3e2dc', '#80cfc4', '#4db6ac', '#26a69a', '#00897b', '#00695c'] },
  { id: 'crimson', name: 'Crimson', steps: ['#fff5f0', '#fec5b5', '#fc9272', '#fb6a4a', '#de2d26', '#a50f15'] },
  {
    id: 'inferno',
    name: 'Inferno (uniform)',
    // Authored light->dark like every other ramp. A stray .reverse() here once
    // inverted the whole scale — see palettes.test.ts monotonicity gate.
    steps: ['#fcffa4', '#f9c932', '#f98e09', '#e95462', '#bc3754', '#781c6d', '#320a5e', '#000004'],
  },
  {
    id: 'viridis',
    name: 'Viridis (uniform)',
    steps: ['#fde725', '#8fd744', '#35b779', '#21908d', '#31688e', '#443a83', '#440154'],
  },
  {
    id: 'plasma',
    name: 'Plasma (uniform)',
    steps: ['#f0f921', '#fdb42f', '#ed7953', '#cc4778', '#9c179e', '#5c01a6', '#0d0887'],
  },
  {
    id: 'terracotta',
    name: 'Terracotta (editorial)',
    // Muted, print-leaning warm scale for editorial choropleths: parchment through
    // clay to oxblood. The saturated ramps above read as data-tool defaults on a
    // dark basemap; this one keeps chroma low enough that white type and hairline
    // borders stay the brightest things in frame.
    steps: ['#f7ecd9', '#e8cfa6', '#d3a06a', '#b56f45', '#8f3f35', '#5c1f24'],
  },
];

/**
 * Diverging ramps — a *second* scale type, deliberately kept out of `RAMPS`.
 *
 * `RAMPS` is sequential-only and its monotonic-lightness gate is a hard rule that
 * must not be relaxed (see palettes.test.ts). A diverging scale is not a sequential
 * ramp that breaks that rule; it answers a different question. Sequential encodes
 * magnitude — "rank these two". Diverging encodes signed distance from a meaningful
 * reference — "which side of the line is this, and how far". A fertility map read
 * against the 2.1 replacement level is exactly the second question, and forcing it
 * through a sequential ramp throws away the only boundary that matters.
 *
 * So it gets its own registry and its own equally hard gate: the centre is the
 * darkest step, and lightness climbs strictly outward along each arm. That is the
 * same guarantee the sequential rule gives, stated for a scale read from the middle
 * out rather than end to end — a reader can still rank two regions on the same side,
 * and can now also tell the sides apart.
 */
export const DIVERGING_RAMPS: Ramp[] = [
  {
    id: 'neon-divergent',
    name: 'Neon divergent (below / above)',
    kind: 'diverging',
    // Low arm hot pink → neutral slate centre → high arm neon cyan.
    //
    // The centre is the ramp's darkest step, but deliberately not its *dimmest*
    // possible one: taken all the way down to near-black it matched the dark
    // basemap, and regions sitting exactly at the reference value rendered as holes
    // in the map — indistinguishable from no-data. A mid slate still recedes behind
    // both arms while reading as a colour someone chose.
    steps: ['#ffa3c0', '#ff5c8a', '#d84a72', '#6b7280', '#2f7fb8', '#22a8e0', '#5ce8ff'],
  },
];

/**
 * Look up a ramp by id across both registries.
 *
 * Sequential first, so nothing about the existing set changes; the fallback is still
 * a sequential ramp, because a caller that names something unknown wants a working
 * scale, not a diverging one it did not ask for.
 */
export const getRamp = (id: string): Ramp =>
  RAMPS.find((r) => r.id === id) ?? DIVERGING_RAMPS.find((r) => r.id === id) ?? RAMPS[0];

/** A colour taken apart: channels 0..255, alpha 0..1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Parse the four CSS hex forms — `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` — or `null`.
 *
 * Total by contract: every caller here feeds a canvas, and an invalid colour string is
 * a **silent no-op** on `fillStyle`, so the previous colour keeps drawing. Nothing
 * throws, nothing looks broken, and the wrong shape is filled with whatever the last
 * layer happened to leave behind. A `NaN` channel is the usual way in, which is why
 * this returns `null` rather than a tuple the caller has to check.
 *
 * The short forms matter more than they look: the inspector's colour text field
 * commits on every keystroke, so typing `#ff0000` passes through `#ff00` — a real
 * `#rgba` — on the way. Rejecting it would flash a fallback mid-word.
 */
export function parseHex(color: string): Rgba | null {
  if (!color.startsWith('#')) return null;
  let h = color.slice(1);
  // `#rgb` and `#rgba` double each digit; the long forms are already per-channel.
  if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
  if (h.length !== 6 && h.length !== 8) return null;
  if (!/^[0-9a-fA-F]+$/.test(h)) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
    a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1,
  };
}

/**
 * `color` at `alpha` times its own opacity, as an `rgba()` string.
 *
 * Unparseable hex becomes fully transparent rather than an `rgba(…NaN…)` the canvas
 * will ignore: drawing nothing is wrong in a way someone can see and fix, while
 * inheriting the previous fill is wrong in a way that looks deliberate. Non-hex
 * strings pass through — `red` and `rgb(…)` are legitimate and the canvas resolves
 * them itself.
 */
export function withAlpha(color: string, alpha: number): string {
  const c = parseHex(color);
  if (!c) return color.startsWith('#') ? 'rgba(0,0,0,0)' : color;
  return `rgba(${c.r},${c.g},${c.b},${c.a * alpha})`;
}

const hexToRgb = (hex: string): [number, number, number] => {
  const c = parseHex(hex);
  // Black is the safe answer for a colour that is not one: `luminance` uses this to
  // choose readable ink, and NaN there compares false against every threshold, so the
  // caller would silently take one branch forever.
  return c ? [c.r, c.g, c.b] : [0, 0, 0];
};

const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/**
 * Sample the ramp at 0..1.
 * `flip` reverses the anchor for dark basemaps so high values read bright.
 */
export function rampColor(ramp: Ramp, t: number, flip: boolean): string {
  const steps = flip ? [...ramp.steps].reverse() : [...ramp.steps];
  const clamped = Math.max(0, Math.min(1, isFinite(t) ? t : 0));
  const pos = clamped * (steps.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;

  const lo = steps[i];
  const hi = steps[i + 1];
  // A ramp with no steps cannot happen (every shipped ramp has at least five, and
  // palettes.test.ts asserts it), but the function still owes the caller a colour.
  if (!lo) return '#000000';
  // No upper neighbour means we are at or past the last step, so there is nothing
  // to interpolate towards. Replaces the explicit length check this used to do.
  if (!hi) return lo;

  const a = hexToRgb(lo);
  const b = hexToRgb(hi);
  return rgbToHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

/**
 * Where a value sits on its ramp, 0..1 — the one place value→colour position is decided.
 *
 * Without a midpoint this is the plain linear position in the domain, exactly as before.
 *
 * With one — the reference value a diverging scale is read *against*, a replacement rate,
 * a 50% line, a baseline — each half of the domain is mapped onto its own half of the
 * ramp. That matters because a diverging ramp's neutral sits at t=0.5 by construction, so
 * under linear mapping the colour that means "on the line" lands at the middle of the
 * *domain* rather than at the line. With a 2.1 reference and a 0.9–2.7 domain, linear
 * mapping draws the neutral at 1.8 and every region is mis-sided by a third of the scale,
 * while the map still looks entirely plausible.
 *
 * The alternative — forcing the author to pick a domain symmetric about the midpoint —
 * works but wastes the ramp whenever the data is lopsided: 0.9–2.7 about 2.1 becomes
 * 1.4–2.8, which clamps the low tail flat and never reaches the high arm's bright end.
 * Splitting the arms uses all of both regardless of how uneven the two sides are.
 *
 * A midpoint outside the domain is ignored rather than honoured: it would put one arm
 * on zero width, and silently colouring every region from half a ramp is worse than
 * ignoring a field that cannot mean anything here.
 */
export function rampPosition(value: number, min: number, max: number, midpoint?: number | null): number {
  const span = max - min;
  if (!isFinite(value) || !isFinite(span) || Math.abs(span) < 1e-9) return 0;

  if (midpoint === undefined || midpoint === null || !isFinite(midpoint) || midpoint <= min || midpoint >= max) {
    return (value - min) / span;
  }

  return value <= midpoint
    ? 0.5 * ((value - min) / (midpoint - min))
    : 0.5 + 0.5 * ((value - midpoint) / (max - midpoint));
}

/** WCAG relative luminance, used to pick readable ink on top of a swatch. */
export function luminance(hex: string): number {
  // Mapping the tuple would widen it to number[], so the channels are linearised
  // individually — which also puts each WCAG coefficient beside its channel.
  const linear = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

