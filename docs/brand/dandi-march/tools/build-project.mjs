/**
 * "The Walk That Broke an Empire" — the Dandi March, pilot episode of the "Walk to Remember"
 * series. Same disciplines as Malacca/Arctic: single map context, one continuous camera with
 * no repeated framing, every closing layer's `out` pushed past the visible timeline (EDGE).
 *
 * The new element: a growing-crowd mechanic — small pulse markers appearing progressively
 * along the route during the "78 volunteers to tens of thousands" beat, a coordinate-native
 * way to show the march swelling rather than a bar chart doing the telling.
 *
 * Facts verified before scripting — see README.md:
 *   387 km / 24 days, Sabarmati Ashram to Dandi · 78 volunteers growing to tens of thousands by
 *   the coast · salt law broken the morning of April 6, 1930 · 60,000+ jailed within a month,
 *   Gandhi arrested May 5, 1930 · Time's Man of the Year, 1930.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cameraFromShots, createLayer, keyframe, projectWith, staticTrack, windowTrack,
} from '../../../../packages/document/src/index.ts';
import { createMapContext } from '../../../../packages/document/src/schema/index.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const OUT = fileURLToPath(new URL('..', import.meta.url));

const world = JSON.parse(readFileSync(`${ROOT}/apps/studio/src/data/world-countries.json`, 'utf8'));
const pick = (...names) => ({ type: 'FeatureCollection', features: world.features.filter((f) => names.includes(f.properties.name)) });

const SIGNAL = '#22C55E';
const AMBER = '#FFC24D';
const PAPER = '#F2F4F5';
const DIM = '#9AA5AF';

const scheduleFile = `${OUT}/schedule.json`;
if (!existsSync(scheduleFile)) throw new Error('run tools/retime.mjs first');
const { at: AT, DUR } = JSON.parse(readFileSync(scheduleFile, 'utf8'));

const ids = Object.keys(AT);
const S = {};
for (let i = 0; i < ids.length; i++) {
  const cur = ids[i];
  const nextStart = i + 1 < ids.length ? AT[ids[i + 1]].start : DUR;
  S[cur] = [AT[cur].start, nextStart];
}
writeFileSync(`${OUT}/scene-bounds.json`, JSON.stringify(S, null, 2));

const EDGE = DUR + 3;

/* -------------------------------------------------------------------- coordinates */
const SABARMATI = [72.5808, 23.0600];
const DANDI = [72.8009, 20.8865];
const lerp = (f) => [SABARMATI[0] + (DANDI[0] - SABARMATI[0]) * f, SABARMATI[1] + (DANDI[1] - SABARMATI[1]) * f];

/* -------------------------------------------------------------------- map */
const ctx = createMapContext('Gujarat — no labels');
ctx.basemap = 'dark-clean';
ctx.projection = 'globe';

/* -------------------------------------------------------------------- camera */
/*
 * One continuous path: opens on India for context, pushes into Gujarat for the route and the
 * growing-crowd beat, tightens on Dandi for the salt-breaking act, pulls back to India-wide
 * for the nationwide consequence, reframes (not repeats) for the Time beat, and one reset for
 * the closing wide shot showing the whole route.
 *
 * Zoom values for the route-scale shots (S02-S04, S07) were empirically calibrated against the
 * studio's own `window.geomotion.debug(t)` API (which reports the actually-evaluated camera
 * zoom, not a guess from pixels) — 387 km is two orders of magnitude smaller than the
 * ocean-spanning routes in Malacca/Arctic, and the effective scale near zoom 9 turned out far
 * steeper than a standard web-mercator doubling would predict: zoom 8.7 left the route a
 * near-invisible sliver, zoom 9.5 overflowed the frame entirely. Zoom 8.9 was the point that
 * actually worked, found by bisection and confirmed against `debug()`'s reported zoom, not by
 * eyeballing renders (a direct JSON patch of the camera node to a "static" track, tried
 * earlier, evaluated inconsistently — the real keyframed pipeline is what's trustworthy here).
 * The India-context shots (S01/S05/S06) needed no change; they were never actually broken.
 */
const camera = cameraFromShots([
  keyframe(S.s01[0], [79, 22], 4.4, { pitch: 0 }),                  // S01 India, context
  keyframe(S.s01[1] - 0.3, [77, 21.5], 4.7, { pitch: 0 }),
  keyframe(S.s02[0] + 0.3, [72.69, 21.97], 8.9, { pitch: 0 }),      // S02 Gujarat, the route itself
  keyframe(S.s02[1] - 0.3, [72.69, 21.97], 8.9, { pitch: 0 }),
  keyframe(S.s03[0] + 0.3, [72.69, 21.97], 8.75, { pitch: 0 }),     // S03 hold — the crowd grows
  keyframe(S.s03[1] - 0.5, [72.69, 21.97], 8.75, { pitch: 0 }),
  keyframe(S.s04[0] + 0.3, [72.80, 20.89], 10.5, { pitch: 0 }),     // S04 tight on Dandi — the act
  keyframe(S.s04[1] - 0.3, [72.80, 20.89], 10.5, { pitch: 0 }),
  keyframe(S.s05[0] + 0.3, [80, 23], 4.2, { pitch: 0 }),            // S05 pull back — India-wide, the consequence
  keyframe(S.s05[1] - 0.4, [80, 23], 4.2, { pitch: 0 }),
  keyframe(S.s06[0] + 0.3, [75, 20], 4.8, { pitch: 0 }),            // S06 reframed — the Time beat
  keyframe(S.s06[1] - 0.3, [75, 20], 4.8, { pitch: 0 }),
  keyframe(S.s07[0] + 0.3, [72.7, 21.9], 8.4, { pitch: 0 }),        // S07 — the one reset, closing wide
  keyframe(DUR, [72.7, 21.9], 8.4, { pitch: 0 }),
]);

/* -------------------------------------------------------------------- landmass */
const globeLand = createLayer('shape', 0, {
  name: 'Globe landmass',
  geojson: JSON.stringify(world),
  fillColor: '#1B232D',
  fillOpacity: staticTrack(1),
  lineColor: SIGNAL,
  lineWidth: staticTrack(0.6),
  traceOutline: false,
  out: EDGE,
  fade: 0.4,
});

// India lit at low opacity once the consequence spreads nationwide — "a whole country reacted,"
// shown rather than stated, the same device Arctic used for Russia's control beat.
const india = createLayer('shape', S.s05[0] - 0.3, {
  name: 'India',
  geojson: JSON.stringify(pick('India')),
  fillColor: '#2A3444',
  fillOpacity: staticTrack(0.6),
  lineColor: SIGNAL,
  lineWidth: staticTrack(0.5),
  out: S.s06[0],
  fade: 0.5,
});

/* -------------------------------------------------------------------- route */
const route = createLayer('route', S.s02[0] + 0.2, {
  name: 'The Dandi March', out: EDGE,
  coords: [SABARMATI, lerp(0.25), lerp(0.5), lerp(0.75), DANDI],
  curve: 'geodesic',
  color: SIGNAL,
  width: staticTrack(3.6),
  glow: true,
  progress: windowTrack(S.s02[0] + 0.35, S.s02[0] + 2.6, 'easeInOutCubic'),
  fade: 0.4,
  // The route type's own leading-edge dot defaults on — redundant with the explicit pulse
  // markers, and it sits at Dandi's coordinate for the rest of the film once progress
  // completes, which collided with the closing title at the S07 wide shot.
  marker: { enabled: false, icon: 'dot', color: '#ffffff', size: staticTrack(6), rotate: true },
});

/*
 * The growing-crowd mechanic. Small pulse markers along the already-drawn route, appearing one
 * by one through the "78 volunteers to tens of thousands" beat — a coordinate-native way to
 * show the march swelling, instead of a bar chart doing the telling. Deliberately un-labelled
 * (no per-point numbers) since no source gives crowd size at these specific points — the
 * narration's verified totals (78 at the start, tens of thousands by the coast) carry the
 * precision; the accumulating dots carry the feeling of growth.
 */
const crowdDot = (at, coord) =>
  createLayer('marker', at, {
    name: 'Crowd', out: S.s04[0], coord, fade: 0.3,
    color: AMBER, size: staticTrack(5),
    label: '', labelSize: staticTrack(0),
  });
const crowdFractions = [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84];
const crowdDots = crowdFractions.map((f, i) =>
  crowdDot(S.s03[0] + 0.3 + i * ((S.s03[1] - S.s03[0] - 0.6) / crowdFractions.length), lerp(f)));

/* -------------------------------------------------------------------- markers */
const pulseMarker = (name, at, out, coord, label) =>
  createLayer('marker', at, {
    name, out, coord, fade: 0.3,
    color: SIGNAL, size: staticTrack(7),
    label: label ?? '', labelSize: staticTrack(label ? 18 : 0), labelColor: PAPER,
  });

// Dandi's label originally persisted to EDGE, same as the route — it collided with the
// closing title at the S07 wide reveal (both land in the same lower band at this framing).
// Ending it with its own beat (S05 start), same fix Malacca needed for its pulse markers:
// a marker's job is to give its own moment life, not stay labelled for the rest of the film.
// The route itself still marks where the march ends; the label doesn't need to.
const markers = [
  pulseMarker('Sabarmati', S.s02[0] + 0.3, S.s04[0], SABARMATI, 'SABARMATI ASHRAM'),
  pulseMarker('Dandi', S.s04[0] + 0.2, S.s05[0], DANDI, 'DANDI'),
];

/* -------------------------------------------------------------------- text */
const T = (name, at, out, text, y, size, opts = {}) =>
  createLayer('text', at, {
    name, out, fade: opts.fade ?? 0.4, text,
    x: staticTrack(opts.x ?? 0.5),
    y: staticTrack(y),
    size: staticTrack(size),
    color: opts.color ?? PAPER,
    weight: opts.weight ?? 700,
    align: opts.align ?? 'center',
    letterSpacing: staticTrack(opts.ls ?? 2),
    anim: opts.anim ?? 'fade',
    background: opts.bg ?? false,
  });

const texts = [
  // Below the title, not alongside the top-right source/mark stack — sharing that row still
  // collided at this text's actual rendered width even when left-aligned (seen at the t=1
  // spot-check), so it gets its own vertical band instead of fighting for the same one.
  T('Series tag', S.s01[0] + 0.2, S.s02[0], 'WALK TO REMEMBER · EP. 1', 0.165, 15, { ls: 3, weight: 600, color: DIM, x: 0.07, align: 'left' }),
  T('Title', S.s01[0] + 0.3, S.s01[1], 'THE WALK THAT BROKE AN EMPIRE', 0.115, 34, { ls: 2 }),
  T('Route name', S.s02[0] + 0.5, S.s02[1], 'THE DANDI MARCH · 387 KM · 24 DAYS', 0.855, 21, { ls: 1, weight: 600, color: DIM }),
  T('Growth', S.s03[0] + 0.7, S.s03[1], '78 → TENS OF THOUSANDS', 0.79, 42, { color: SIGNAL, ls: 1 }),
  T('Growth sub', S.s03[0] + 1.1, S.s03[1], 'VOLUNTEERS WHO STARTED WALKING WITH HIM', 0.855, 18, { weight: 500, color: DIM, ls: 0.5 }),
  T('Act', S.s04[0] + 0.5, S.s04[1], 'APRIL 6, 1930', 0.79, 30, { color: PAPER }),
  T('Act sub', S.s04[0] + 0.9, S.s04[1], 'A HANDFUL OF SEA SALT, AND THE LAW WAS BROKEN', 0.855, 18, { weight: 500, color: DIM, ls: 0.3 }),
  T('Consequence', S.s05[0] + 0.5, S.s05[1], '60,000+ JAILED', 0.79, 40, { color: AMBER }),
  T('Consequence sub', S.s05[0] + 0.9, S.s05[1], 'WITHIN A MONTH — GANDHI AMONG THEM', 0.855, 18, { weight: 500, color: DIM, ls: 0.3 }),
  T('Reaction', S.s06[0] + 0.4, S.s06[1], "TIME'S MAN OF THE YEAR, 1930", 0.79, 28, { color: SIGNAL }),
  T('Close big', S.s07[0] + 0.2, EDGE, 'THE TAX DIDN’T LAST', 0.79, 44, { ls: 2 }),
  T('Close small', S.s07[0] + 0.6, EDGE, 'THE WALK DID', 0.865, 30, { ls: 1, color: SIGNAL }),
  T('Source', S.s01[0], EDGE, 'HISTORY.COM · BRITANNICA · NATURAL EARTH', 0.045, 13,
    { ls: 0.5, weight: 500, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
  T('Mark', S.s01[0], EDGE, 'DATABANDAR', 0.085, 16, { ls: 4, weight: 700, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
];

/* -------------------------------------------------------------------- project */
const project = projectWith(
  [camera, ctx, globeLand, india, route, ...crowdDots, ...markers, ...texts],
  {
    name: 'The Walk That Broke an Empire — Dandi March', duration: DUR, fps: 30, width: 1080, height: 1920,
    basemap: 'dark-clean', background: '#05070A',
    story: [{ id: 'b1', t: 0, d: DUR, nodes: [globeLand.id, india.id, route.id, ...crowdDots.map((d) => d.id), ...markers.map((m) => m.id)], context: ctx.id }],
  },
);

writeFileSync(`${OUT}/project.geomotion.json`, JSON.stringify(project));
console.log('layers:', Object.keys(project.nodes).length, '· duration', project.duration, '· format', project.format);
