/**
 * Sequential (magnitude) colour ramps only — one hue each, running light→dark,
 * with strictly monotonic lightness. That monotonicity is the whole job: it is
 * what lets a reader rank two regions by colour alone. Never put a rainbow here.
 *
 * On a dark basemap the anchor flips (see `rampColor`): the low end recedes into
 * the dark surface and high values read bright, which is the same relationship
 * inverted for the surface it sits on.
 */

export interface Ramp {
  id: string;
  name: string;
  /** light → dark */
  steps: string[];
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
export const RAMPS: Ramp[] = [
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
    steps: ['#fcffa4', '#f9c932', '#f98e09', '#e95462', '#bc3754', '#781c6d', '#320a5e', '#000004'].reverse(),
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
];

export const getRamp = (id: string): Ramp => RAMPS.find((r) => r.id === id) ?? RAMPS[0];

const hexToRgb = (hex: string): [number, number, number] => {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};

const rgbToHex = (r: number, g: number, b: number) =>
  '#' + [r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

/**
 * Sample the ramp at 0..1.
 * `flip` reverses the anchor for dark basemaps so high values read bright.
 */
export function rampColor(ramp: Ramp, t: number, flip: boolean): string {
  const steps = flip ? [...ramp.steps].reverse() : ramp.steps;
  const clamped = Math.max(0, Math.min(1, isFinite(t) ? t : 0));
  const pos = clamped * (steps.length - 1);
  const i = Math.floor(pos);
  const f = pos - i;
  if (i >= steps.length - 1) return steps[steps.length - 1];
  const a = hexToRgb(steps[i]);
  const b = hexToRgb(steps[i + 1]);
  return rgbToHex(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f);
}

/** WCAG relative luminance, used to pick readable ink on top of a swatch. */
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ink that stays legible on a given fill — never the series colour itself. */
export const inkOn = (hex: string): string => (luminance(hex) > 0.42 ? '#0b0b0b' : '#ffffff');
