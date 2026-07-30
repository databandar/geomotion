/**
 * The app's icons, as inline SVG.
 *
 * These were Unicode glyphs — `▶`, `◉`, `⏮`, `☁`. Glyphs are convenient and wrong for
 * a toolbar: they render in whatever font the platform picks, so they arrive at
 * different weights and optical sizes on each machine, several have no monochrome form
 * on Windows, and `＋` is a fullwidth character that sets its own metrics. A row of
 * them never quite lines up.
 *
 * Drawn on a 16-unit grid at stroke 1.6 so they sit at the weight of the surrounding
 * 13px text, and stroked in `currentColor` so a button's own colour — hover, active,
 * disabled, the per-layer-type accents — carries into the icon with no extra rules.
 *
 * Decorative by default: every icon here sits inside a control that already carries a
 * `title`, so `aria-hidden` keeps a screen reader from reading the shape as well as
 * the name. `label` opts back in for the rare icon that is the only thing there.
 */

export type IconName =
  | 'skip-start'
  | 'skip-end'
  | 'step-back'
  | 'step-forward'
  | 'play'
  | 'pause'
  | 'loop'
  | 'undo'
  | 'redo'
  | 'plus'
  | 'minus'
  | 'chevron-down'
  | 'chevron-right'
  | 'eye'
  | 'eye-off'
  | 'route'
  | 'marker'
  | 'text'
  | 'shape'
  | 'regions'
  | 'clouds'
  | 'image'
  | 'arrow-up'
  | 'arrow-down'
  | 'duplicate'
  | 'close'
  | 'camera'
  | 'search';

/**
 * Path data on a 16×16 grid.
 *
 * Solid shapes are listed in `fills` and outlines in `paths`, because a transport
 * control reads better filled — a stroked triangle at 14px loses its point — while
 * everything else stays consistent with the text around it.
 */
const ICONS: Record<IconName, { paths?: string[]; fills?: string[] }> = {
  // The bar is a rect, not a vertical line: `v9.6` inside a filled path encloses no
  // area, so it rendered as nothing and these read as plain step arrows.
  'skip-start': { fills: ['M3.4 3.2h1.7v9.6H3.4z', 'M13 3.4v9.2L6.4 8z'] },
  'skip-end': { fills: ['M10.9 3.2h1.7v9.6h-1.7z', 'M3 3.4v9.2L9.6 8z'] },
  'step-back': { fills: ['M11 3.4v9.2L4.2 8z'] },
  'step-forward': { fills: ['M5 3.4v9.2L11.8 8z'] },
  play: { fills: ['M4.6 2.9v10.2L13.2 8z'] },
  pause: { fills: ['M5 3h2.2v10H5zM8.8 3H11v10H8.8z'] },
  loop: { paths: ['M2.6 7.2a5.4 5.4 0 0 1 9.3-3.1L14 6', 'M14 2.6V6h-3.4', 'M13.4 8.8a5.4 5.4 0 0 1-9.3 3.1L2 10', 'M2 13.4V10h3.4'] },
  undo: { paths: ['M3 8h7.2a3.4 3.4 0 1 1 0 6.8H7', 'M5.8 5 3 8l2.8 3'] },
  redo: { paths: ['M13 8H5.8a3.4 3.4 0 1 0 0 6.8H9', 'M10.2 5 13 8l-2.8 3'] },
  plus: { paths: ['M8 3.4v9.2', 'M3.4 8h9.2'] },
  minus: { paths: ['M3.4 8h9.2'] },
  'chevron-down': { paths: ['m4.2 6.2 3.8 3.8 3.8-3.8'] },
  'chevron-right': { paths: ['m6.2 4.2 3.8 3.8-3.8 3.8'] },
  eye: { paths: ['M1.6 8S4 3.6 8 3.6 14.4 8 14.4 8 12 12.4 8 12.4 1.6 8 1.6 8Z', 'M8 9.9a1.9 1.9 0 1 0 0-3.8 1.9 1.9 0 0 0 0 3.8Z'] },
  // The slash is what carries the state at 14px — a pupil-less eye reads as an eye.
  'eye-off': { paths: ['M6.3 4A6.6 6.6 0 0 1 8 3.8c4 0 6.4 4.2 6.4 4.2a12 12 0 0 1-2 2.5', 'M3.9 4.9A11.8 11.8 0 0 0 1.6 8s2.4 4.2 6.4 4.2c.9 0 1.7-.2 2.4-.5', 'M2.4 2.4l11.2 11.2'] },
  route: { paths: ['M3.4 12.6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M12.6 6.4a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M5.2 11.2c3.4-.5 4.6-2 5.6-5.4'] },
  marker: { paths: ['M8 14.4s4.6-4 4.6-7.5a4.6 4.6 0 1 0-9.2 0C3.4 10.4 8 14.4 8 14.4Z', 'M8 8.6a1.7 1.7 0 1 0 0-3.4 1.7 1.7 0 0 0 0 3.4Z'] },
  text: { paths: ['M3.2 3.6h9.6', 'M8 3.6v9'] },
  shape: { paths: ['M8 2.2 13.6 5.5v6L8 14.8 2.4 11.5v-6z'] },
  regions: { paths: ['M2.4 3.4h11.2v9.2H2.4z', 'M2.4 8h11.2', 'M7.6 3.4v9.2'] },
  clouds: { paths: ['M4.7 12.2a3 3 0 0 1-.3-6 4 4 0 0 1 7.6.9 2.6 2.6 0 0 1-.5 5.1z'] },
  'arrow-up': { paths: ['M8 12.6V3.6', 'M4.4 7.2 8 3.6l3.6 3.6'] },
  'arrow-down': { paths: ['M8 3.4v9', 'M4.4 8.8 8 12.4l3.6-3.6'] },
  duplicate: { paths: ['M6 6h7.2v7.2H6z', 'M10.4 6V2.8H3.2V10H6'] },
  search: { paths: ['M7.3 12.2a4.9 4.9 0 1 0 0-9.8 4.9 4.9 0 0 0 0 9.8Z', 'm13.6 13.6-2.8-2.8'] },
  camera: { paths: ['M2.4 5.4h3l1.2-1.8h2.8l1.2 1.8h3v7.2H2.4z', 'M8 11.2a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6Z'] },
  close: { paths: ['M3.8 3.8l8.4 8.4', 'M12.2 3.8l-8.4 8.4'] },
  image: { paths: ['M2.4 3.4h11.2v9.2H2.4z', 'm2.8 11 3.1-3.2 2.3 2.2 2.4-2.7 2.6 2.8', 'M6 6.4a.9.9 0 1 0 0-1.8.9.9 0 0 0 0 1.8Z'] },
};

export default function Icon({
  name,
  size = 14,
  label,
}: {
  name: IconName;
  size?: number;
  /** Give the icon its own accessible name — only when nothing beside it has one. */
  label?: string;
}) {
  const { paths = [], fills = [] } = ICONS[name];
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      // Sized in `em` nowhere on purpose: these sit beside 13px text in dense rows,
      // where a fractional icon height shifts the row's baseline by a subpixel.
      aria-hidden={label ? undefined : true}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
      {fills.map((d) => (
        <path key={d} d={d} fill="currentColor" stroke="none" />
      ))}
    </svg>
  );
}
