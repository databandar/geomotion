/**
 * "The Ice Is Opening a Shortcut" — the Northern Sea Route. Same disciplines as Malacca,
 * applied from the start rather than found as bugs: single globe context, one continuous
 * camera with no repeated framing, every closing layer's `out` pushed past the visible
 * timeline (EDGE), route-drawn comparison instead of a card doing the comparing.
 *
 * The new element: a seasonal ice mechanic — two schematic ice-extent shapes (winter/closed,
 * summer/open) cross-fading to show the route opening. These are illustrative, not traced
 * from NSIDC shapefiles — the narration's 12%/decade figure carries the precision; the shapes
 * carry the concept. Said plainly here and in the on-screen source line.
 *
 * Facts verified before scripting — see README.md:
 *   Rotterdam-Yokohama ~35-40% shorter via the Arctic (7,300 vs 11,000 nm) · navigable window
 *   of months, some years just weeks · Russia's NSR Administration + Rosatom control access ·
 *   ~12%/decade September ice decline since 1979 (NSIDC).
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

const VOID = '#05070A';
const SIGNAL = '#22C55E';
const AMBER = '#FFC24D';
const ICE = '#8FD3E8';
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
const ROTTERDAM = [4.48, 51.92];
const YOKOHAMA = [139.65, 35.44];
const KARA_GATE = [58, 70.2];
const BERING_STRAIT = [-169, 65.8];

/* -------------------------------------------------------------------- map */
const ctx = createMapContext('Arctic — no labels');
ctx.basemap = 'dark-clean';
ctx.projection = 'globe';

/* -------------------------------------------------------------------- camera */
/*
 * One continuous path over the pole. Opens already tight on the Arctic (not a distant dot),
 * arcs down to compare the two routes, back up to the strait region for the season/control
 * beats, and a single reset for the closing wide shot.
 */
const camera = cameraFromShots([
  keyframe(S.s01[0], [70, 78], 2.7, { pitch: 0 }),                 // S01 already on the Arctic
  keyframe(S.s01[1] - 0.3, [75, 76], 3.1, { pitch: 0 }),
  keyframe(S.s02[0] + 0.3, [90, 74], 2.9, { pitch: 0 }),           // S02 the route itself
  keyframe(S.s02[1] - 0.3, [90, 74], 2.9, { pitch: 0 }),
  keyframe(S.s03[0] + 0.4, [60, 35], 2.15, { pitch: 0 }),          // S03 both routes — wide, but not so wide the amber line goes sub-pixel
  keyframe(S.s03[1] - 0.6, [60, 35], 2.15, { pitch: 0 }),
  keyframe(S.s04[0] + 0.3, [95, 77], 1.9, { pitch: 0 }),           // S04 the ice cap as a whole shape, not a close-up of its own edge
  keyframe(S.s04[1] - 0.4, [95, 77], 1.9, { pitch: 0 }),
  keyframe(S.s05[0] + 0.3, [90, 68], 2.5, { pitch: 0 }),           // S05 Russia's coast, the control beat
  keyframe(S.s05[1] - 0.5, [90, 68], 2.5, { pitch: 0 }),
  keyframe(S.s06[0] + 0.3, [100, 76], 2.6, { pitch: 0 }),          // S06 the ice trend
  keyframe(S.s06[1] - 0.5, [100, 76], 2.6, { pitch: 0 }),
  keyframe(S.s07[0] + 0.3, [70, 60], 1.7, { pitch: 0 }),           // S07 — the one reset, closing wide
  keyframe(DUR, [70, 60], 1.7, { pitch: 0 }),
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

// Russia lit at low opacity once the control question is the subject — "one country's coast,"
// shown rather than stated.
const russia = createLayer('shape', S.s05[0] - 0.3, {
  name: 'Russia',
  geojson: JSON.stringify(pick('Russia')),
  fillColor: '#2A3444',
  fillOpacity: staticTrack(0.6),
  lineColor: SIGNAL,
  lineWidth: staticTrack(0.5),
  out: S.s06[0],
  fade: 0.5,
});

/*
 * The seasonal ice mechanic. Two schematic polygons over the Arctic Ocean, hand-authored to
 * the right shape and scale rather than traced from a shapefile — illustrative, not claimed
 * as precise satellite data (the source line says so; the narration's 12%/decade figure is
 * the real, sourced number). WINTER covers the whole route against Russia's coast, closing
 * it; SUMMER pulls back toward the pole, opening it. Cross-fading between them, timed to the
 * "but it's only open a few months" line, is the one visual mechanic neither prior video used.
 */
/*
 * Both rings are kept inside 15°E-175°E on purpose — the story's whole geography (Kara Gate to
 * the Bering Strait) fits there, and it means neither ring ever needs to cross the
 * antimeridian. The first version didn't do this: it wrapped through -170/-155/-140 to close
 * a full ring around the pole, and a GeoJSON polygon that crosses ±180 without unwrapped
 * (continuous) longitude renders as a self-intersecting mess — a thin broken crescent from
 * wide out, a nonsense edge from close in. Invisible in the coordinate list; obvious the
 * moment it's rendered, which is the only reason it was caught.
 */
const winterIce = [
  [15, 69], [35, 71], [55, 72], [75, 72.5], [95, 72.5], [115, 72], [135, 71], [155, 70], [175, 69],
  [175, 81], [155, 83.5], [115, 84.5], [75, 84], [35, 82], [15, 80], [15, 69],
];
// summerIce is pulled back from winterIce's coastline edge (south boundary ~78-81° vs
// winter's ~69-72°) and kept entirely under 85.05° — MapLibre/Mercator's hard latitude
// clipping limit, inherited by globe mode because the tile pyramid underneath is still
// Mercator (bent onto a sphere, not a true orthographic projection). The first version
// peaked at 87°N: past that limit, the polygon isn't just coarse, it's genuinely
// unrepresentable in the tile system, and it clipped into a broken two-lobe fold no amount
// of vertex densification could fix (confirmed by testing 5° and then 1.5° spacing — the
// fold was pixel-identical both times, which is what gave away that this wasn't an
// edge-straightness problem). Caught at the t=33 spot-check, invisible in the coordinate list.
const summerIce = [
  [30, 79], [70, 81], [100, 81], [130, 80], [165, 78.5],
  [165, 84.5], [130, 84.8], [100, 84.8], [70, 84.5], [30, 82.5], [30, 79],
];

// Cheap insurance against mercator-space edge bowing at high latitude — not the fix for the
// clipping bug above, but worth keeping now that it's here.
const densify = (ring, stepDeg = 3) => {
  const out = [];
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon0, lat0] = ring[i];
    const [lon1, lat1] = ring[i + 1];
    const steps = Math.max(1, Math.ceil(Math.abs(lon1 - lon0) / stepDeg));
    for (let s = 0; s < steps; s++) {
      const f = s / steps;
      out.push([lon0 + (lon1 - lon0) * f, lat0 + (lat1 - lat0) * f]);
    }
  }
  out.push(ring[ring.length - 1]);
  return out;
};

const iceShape = (name, at, out, ring) =>
  createLayer('shape', at, {
    name, out,
    geojson: JSON.stringify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [densify(ring)] } }),
    fillColor: ICE,
    fillOpacity: staticTrack(0.55),
    lineColor: ICE,
    lineWidth: staticTrack(1),
  });

const iceWinter = iceShape('Ice — closed season', S.s02[0], S.s04[1] + 0.2, winterIce);
iceWinter.fade = 0.6;
const iceSummer = iceShape('Ice — open season', S.s04[0] + 0.6, EDGE, summerIce);
iceSummer.fade = 0.9;

/* -------------------------------------------------------------------- routes */
const route = (name, at, out, coords, opts = {}) =>
  createLayer('route', at, {
    name, out, coords,
    curve: opts.curve ?? 'arc',
    color: opts.color ?? SIGNAL,
    width: staticTrack(opts.w ?? 3),
    glow: true,
    progress: windowTrack(at + 0.15, at + (opts.draw ?? 1.6), 'easeInOutCubic'),
    fade: 0.4,
  });

// The Arctic shortcut — the spine of the story, drawn early and left on screen.
const arcticRoute = route(
  'The Arctic route', S.s02[0] + 0.2, EDGE,
  [ROTTERDAM, [20, 66], KARA_GATE, [110, 74.5], BERING_STRAIT, [170, 55], YOKOHAMA],
  { draw: 2.2, w: 3.6 },
);

// The traditional route via Suez and Malacca — same amber "the other way" language Malacca
// established, drawn only during the comparison beat.
const suezRoute = route(
  'Via Suez', S.s03[0] - 0.2, S.s03[1] + 0.4,
  [ROTTERDAM, [-6, 36], [32, 31], [43, 13], [80, 6], [100, 3], [113, 5], YOKOHAMA],
  { draw: 2.4, w: 5.5, color: AMBER },
);

/* -------------------------------------------------------------------- markers */
const pulseMarker = (name, at, out, coord, label) =>
  createLayer('marker', at, {
    name, out, coord, fade: 0.3,
    color: SIGNAL, size: staticTrack(7),
    label: label ?? '', labelSize: staticTrack(label ? 18 : 0), labelColor: PAPER,
  });

const markers = [
  pulseMarker('Rotterdam', S.s03[0] + 0.6, S.s03[1], ROTTERDAM, 'ROTTERDAM'),
  pulseMarker('Yokohama', S.s03[0] + 0.9, S.s03[1], YOKOHAMA, 'YOKOHAMA'),
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
  T('Title', S.s01[0] + 0.3, S.s01[1], 'THE ICE IS OPENING A SHORTCUT', 0.115, 36, { ls: 2 }),
  T('Route name', S.s02[0] + 0.5, S.s02[1], 'NORTHERN SEA ROUTE', 0.855, 24, { ls: 2, weight: 600, color: DIM }),
  T('Distance', S.s03[0] + 0.7, S.s03[1], '35% SHORTER', 0.135, 52, { color: SIGNAL, ls: 1 }),
  T('Distance sub', S.s03[0] + 1.1, S.s03[1], '11,000 nm via Suez · 7,300 via the Arctic', 0.21, 21, { weight: 500, color: DIM, ls: 0 }),
  T('Catch', S.s04[0] + 0.6, S.s04[1], 'OPEN A FEW MONTHS A YEAR', 0.79, 30, { color: ICE }),
  T('Catch sub', S.s04[0] + 1.0, S.s04[1], '2025: as little as two weeks', 0.855, 19, { weight: 500, color: DIM, ls: 0 }),
  T('Control', S.s05[0] + 0.6, S.s05[1], 'EVERY SHIP NEEDS A RUSSIAN PERMIT', 0.79, 26, { color: SIGNAL }),
  T('Control sub', S.s05[0] + 1.0, S.s05[1], "PARTLY RUN BY RUSSIA'S NUCLEAR ENERGY COMPANY", 0.855, 17, { ls: 1, weight: 500, color: DIM }),
  T('Trend', S.s06[0] + 0.6, S.s06[1], '-12% PER DECADE', 0.79, 44, { color: ICE }),
  T('Trend sub', S.s06[0] + 1.0, S.s06[1], 'SEPTEMBER ICE, SINCE 1979', 0.855, 19, { ls: 2, weight: 500, color: DIM }),
  // Matches the same lower-band position every other stat callout in this film uses (0.79/0.855)
  // — the first draft put this pair at 0.40/0.475, mid-globe, where it sat directly on top of
  // and obscured the one visual it was describing (the closing ice sliver). Caught at the s027
  // spot-check of the actual encoded file, not visible from the plan.
  T('Close big', S.s07[0] + 0.2, EDGE, 'THE ICE RETREATS', 0.79, 46, { ls: 2 }),
  T('Close small', S.s07[0] + 0.6, EDGE, 'THE GATEKEEPER STAYS', 0.865, 30, { ls: 1, color: SIGNAL }),
  T('Source', S.s01[0], EDGE, 'NSIDC · CHNL · NATURAL EARTH — ICE SHAPES SCHEMATIC', 0.045, 13,
    { ls: 0.5, weight: 500, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
  T('Mark', S.s01[0], EDGE, 'DATABANDAR', 0.085, 16, { ls: 4, weight: 700, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
];

/* -------------------------------------------------------------------- project */
const project = projectWith(
  [camera, ctx, globeLand, russia, iceWinter, iceSummer, arcticRoute, suezRoute, ...markers, ...texts],
  {
    name: 'The Ice Is Opening a Shortcut — Northern Sea Route', duration: DUR, fps: 30, width: 1080, height: 1920,
    basemap: 'dark-clean', background: VOID,
    story: [{ id: 'b1', t: 0, d: DUR, nodes: [globeLand.id, russia.id, iceWinter.id, iceSummer.id, arcticRoute.id, suezRoute.id, ...markers.map((m) => m.id)], context: ctx.id }],
  },
);

writeFileSync(`${OUT}/project.geomotion.json`, JSON.stringify(project));
console.log('layers:', Object.keys(project.nodes).length, '· duration', project.duration, '· format', project.format);
