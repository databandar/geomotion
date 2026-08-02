/**
 * "The Strait That Decides" — the Strait of Malacca. One continuous camera, single globe
 * context throughout (the projection-switch export bug the skill documents), dark-clean
 * basemap, a real Detour-shaped comparison (Malacca vs. the long way round via Lombok), and
 * every closing layer pushed past the visible timeline so the ending is a genuine hard cut.
 *
 * Facts, all verified before scripting — see README.md:
 *   2.8 km narrowest width (Phillips Channel) · 22% of global seaborne trade ·
 *   ~29% of seaborne oil, 20M+ barrels/day · Singapore, the world's busiest transshipment
 *   port · 7-8 day detour via Lombok.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cameraFromShots, createLayer, keyframe, projectWith, staticTrack, windowTrack,
} from '../../../../packages/document/src/index.ts';
import { createMapContext } from '../../../../packages/document/src/schema/index.ts';
import { createId } from '../../../../packages/core/src/index.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const OUT = fileURLToPath(new URL('..', import.meta.url));

const world = JSON.parse(readFileSync(`${ROOT}/apps/studio/src/data/world-countries.json`, 'utf8'));
const pick = (...names) => ({ type: 'FeatureCollection', features: world.features.filter((f) => names.includes(f.properties.name)) });

const VOID = '#05070A';
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

// Layers meant to stay on screen end here, not at DUR — the fade-to-black bug this pipeline
// hit once already: a layer whose `out` equals the project's last frame silently dissolves as
// the video ends.
const EDGE = DUR + 3;

/* -------------------------------------------------------------------- coordinates */
const ANDAMAN_ENTRANCE = [95.8, 5.8];
const PHILLIPS_CHANNEL = [103.65, 1.15]; // narrowest point, between Singapore and the Riau islands
const SINGAPORE = [103.82, 1.35];
const SCS_EXIT = [105.5, 3.5]; // South China Sea side
const LOMBOK = [115.7, -8.7]; // the real deep-water alternative for large vessels

/* -------------------------------------------------------------------- map */
const ctx = createMapContext('Malacca — no labels');
ctx.basemap = 'dark-clean';
ctx.projection = 'globe';

/* -------------------------------------------------------------------- camera */
/*
 * One continuous path. Malacca push (S01-S04b), out to Singapore, pull to show the detour
 * (S05), back to the strait for the volume stat (S06), one reset for the closing wide shot
 * (S07) — the single non-negotiable rule from the skill: no two stops share a framing.
 */
const camera = cameraFromShots([
  keyframe(S.s01[0], [100, 5], 3.1, { pitch: 0 }),                 // S01 already on SE Asia, not a distant dot
  keyframe(S.s01[1] - 0.5, [101, 3], 4.4, { pitch: 0 }),
  keyframe(S.s02[0] + 0.4, [...PHILLIPS_CHANNEL], 9.8, { pitch: 0 }), // S02 the width reveal — tight
  keyframe(S.s02[1] - 0.6, [...PHILLIPS_CHANNEL], 9.8, { pitch: 0 }),
  keyframe(S.s03[0] + 0.3, [101.5, 2.2], 6.2, { pitch: 0 }),        // S03 pull back, the trade-share stat
  keyframe(S.s03[1] - 0.3, [101.5, 2.2], 6.2, { pitch: 0 }),
  keyframe(S.s04[0] + 0.3, [...SINGAPORE], 8.6, { pitch: 0 }),      // S04/S04b Singapore
  keyframe(S['s04b'][1] - 0.6, [...SINGAPORE], 8.6, { pitch: 0 }),
  keyframe(S.s05[0] + 0.4, [107, -3], 3.0, { pitch: 0 }),           // S05 pull way back — the detour
  keyframe(S.s05[1] - 0.6, [107, -3], 3.0, { pitch: 0 }),
  keyframe(S.s06[0] + 0.3, [...PHILLIPS_CHANNEL], 8.4, { pitch: 0 }), // S06 back to the strait, the barrel count
  keyframe(S.s06[1] - 0.6, [...PHILLIPS_CHANNEL], 8.4, { pitch: 0 }),
  keyframe(S.s07[0] + 0.3, [100, 1], 4.6, { pitch: 0 }),            // S07 — the one reset, the closing wide shot
  keyframe(DUR, [100, 1], 4.6, { pitch: 0 }),
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

// Malaysia + Indonesia lit at low opacity once the strait itself is the subject — gives the
// channel banks without competing with the route line.
const banks = createLayer('shape', S.s02[0], {
  name: 'Strait banks',
  geojson: JSON.stringify(pick('Malaysia', 'Indonesia', 'Thailand')),
  fillColor: '#243040',
  fillOpacity: staticTrack(0.55),
  lineColor: SIGNAL,
  lineWidth: staticTrack(0.5),
  out: EDGE,
  fade: 0.5,
});

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

// The strait itself, drawn once early and left on screen the whole film — the spine of the
// story, always visible once introduced.
const straitRoute = route(
  'Through the strait', S.s01[1] - 0.5, EDGE,
  [ANDAMAN_ENTRANCE, [98.5, 3.6], PHILLIPS_CHANNEL, SINGAPORE, SCS_EXIT],
  { draw: 2.2, w: 3.2 },
);

// The detour: same origin, the long way south around Sumatra and Java to Lombok, then back
// north — drawn only during S05, in amber (a warning colour, a cost) against the strait's
// green. Same visual grammar EP001 used for its two-route "Detour" comparison.
const detourRoute = route(
  'The detour', S.s05[0] - 0.2, S.s05[1] + 0.3,
  [ANDAMAN_ENTRANCE, [97, -2], [100, -6.5], [108, -8.5], LOMBOK, [119, -4], SCS_EXIT],
  { draw: 2.4, w: 5, color: AMBER },
);

/* -------------------------------------------------------------------- markers */
const pulseMarker = (name, at, out, coord, label) =>
  createLayer('marker', at, {
    name, out, coord, fade: 0.3,
    color: SIGNAL, size: staticTrack(7),
    label: label ?? '', labelSize: staticTrack(label ? 18 : 0), labelColor: PAPER,
    behaviours: { ring: [{ id: createId(), type: 'pulse', enabled: true }] },
  });

/*
 * Each marker's label ended at EDGE originally — meaning once both existed, they persisted
 * and overlapped illegibly at the wide S05 pull-back ("PHIL[SINGAPORE]NEL"). A pulse marker's
 * job is to give its own beat life, not to stay labelled forever; it now leaves with the
 * scene that introduced it. Found by rendering the wide shot, not by reading the layer list.
 */
const markers = [
  pulseMarker('Phillips Channel', S.s02[0] + 0.3, S.s03[1], PHILLIPS_CHANNEL, 'PHILLIPS CHANNEL'),
  pulseMarker('Singapore', S.s04[0] + 0.3, S['s04b'][1], SINGAPORE, 'SINGAPORE'),
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
  T('Title', S.s01[0] + 0.3, S.s01[1], 'THE STRAIT THAT DECIDES', 0.135, 42, { ls: 3 }),
  T('Oil stat', S.s01[0] + 0.6, S.s02[0], 'NEARLY 1/3 OF SEABORNE OIL', 0.855, 26, { ls: 1, weight: 600 }),
  T('Width', S.s02[0] + 1.2, S.s02[1], '2.8 km', 0.79, 70, { color: SIGNAL }),
  T('Width label', S.s02[0] + 1.6, S.s02[1], 'AT ITS NARROWEST', 0.855, 20, { ls: 4, weight: 500, color: DIM }),
  T('Trade stat', S.s03[0] + 0.5, S.s03[1], '22% of everything shipped by sea', 0.79, 30, { color: SIGNAL }),
  T('Port stat', S['s04b'][0] + 0.6, S['s04b'][1], "WORLD'S BUSIEST TRANSSHIPMENT PORT", 0.855, 22, { ls: 1, weight: 600, color: DIM }),
  T('Detour stat', S.s05[0] + 0.8, S.s05[1], '+7–8 DAYS', 0.40, 56, { ls: 2, color: AMBER }),
  T('Detour label', S.s05[0] + 1.2, S.s05[1], 'THE ONLY OTHER WAY', 0.475, 20, { ls: 4, weight: 500, color: DIM }),
  T('Barrels', S.s06[0] + 0.5, S.s06[1], '20,000,000+ barrels/day', 0.79, 28, { color: SIGNAL }),
  T('Close big', S.s07[0] + 0.2, EDGE, '2.8 km WIDE', 0.40, 56, { ls: 2 }),
  T('Close small', S.s07[0] + 0.6, EDGE, "A THIRD OF THE WORLD'S OIL AT SEA", 0.475, 22, { ls: 1, weight: 600, color: SIGNAL }),
  T('Source', S.s01[0], EDGE, 'EIA · CSIS · NATURAL EARTH', 0.045, 14, { ls: 1, weight: 500, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
  T('Mark', S.s01[0], EDGE, 'DATABANDAR', 0.085, 16, { ls: 4, weight: 700, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
];

/* -------------------------------------------------------------------- project */
const project = projectWith(
  [camera, ctx, globeLand, banks, straitRoute, detourRoute, ...markers, ...texts],
  {
    name: 'The Strait That Decides — Malacca', duration: DUR, fps: 30, width: 1080, height: 1920,
    basemap: 'dark-clean', background: VOID,
    story: [{ id: 'b1', t: 0, d: DUR, nodes: [globeLand.id, banks.id, straitRoute.id, detourRoute.id, ...markers.map((m) => m.id)], context: ctx.id }],
  },
);

writeFileSync(`${OUT}/project.geomotion.json`, JSON.stringify(project));
console.log('layers:', Object.keys(project.nodes).length, '· duration', project.duration, '· format', project.format);
