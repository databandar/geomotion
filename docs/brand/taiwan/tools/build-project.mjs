/**
 * "Taiwan — The Wide Strait That Carries the World's Memory"
 * Narration-led, stat-first — the new Hormuz style: dark-clean basemap, source
 * strip, port-anchor markers, dashed animateDash routes, big SIGNAL/AMBER stats.
 * No images, no flags — typography + route + marker carries the story.
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
const EDGE = DUR + 3;

/* ==================================================================== coordinates */
const TAIWAN      = [120.98, 23.7];
const STRAIT      = [119.2, 23.5];   // Taiwan Strait pinch
const FUJIAN      = [117.8, 25.0];   // mainland side
const LUZON       = [122.5, 20.0];   // Luzon Strait (south of Taiwan)
const MIYAKO      = [125.5, 25.5];   // east-of-Taiwan / Miyako area
const JAPAN       = [138, 36.2];
const SOUTH_KOREA = [127.8, 36.3];
const AUSTRALIA   = [134, -24];
const PORT_HEDL   = [118.6, -20.3];  // Port Hedland (NW Australia, iron ore)
const BUSAN       = [129.0, 35.1];
const SINGAPORE   = [103.8, 1.3];
const SCS         = [114, 8];

/* Offshore-verified route waypoints (all WATER, checked vs world geojson):
   main trunk: Singapore → SCS → Luzon → Taiwan Strait (narrow corridor) → East China → Korea */
const MAIN_ROUTE = [
  [105.5, 2.5], [108, 6], [110, 9], [112, 12], [114, 15], [116, 18],
  [117.5, 20], [118.5, 22], [119.3, 23.5], [119.6, 25], [120.5, 26.5],
  [122.5, 27.5], [123, 28.5], [124, 30], [124.8, 33.5], [125.5, 35], [126, 36],
];
/* detour: east of Taiwan through open Pacific, north-east past Japan */
const DETOUR_ROUTE = [
  [105.5, 2.5], [108, 7], [113, 13], [118, 18], [121.5, 22], [123.5, 25],
  [127, 28.5], [129, 29], [135, 33], [138, 33.5], [141, 34], [144, 35.5],
];

/* ==================================================================== map context */
const ctx = createMapContext('Taiwan');
ctx.basemap = 'dark-clean';
ctx.projection = 'mercator';

/* ==================================================================== camera */
const camera = cameraFromShots([
  /* S01 Hook: wide Asia, slow arrival on Taiwan */
  keyframe(0,                 [108, 18], 2.6, { pitch: 0 }),
  keyframe(AT.s01.start + 2.5, [120, 20], 3.0, { pitch: 0 }),
  keyframe(S.s01[1],          [120, 20], 3.0, { pitch: 0 }),
  /* S02: push to the strait — width reveal */
  keyframe(S.s02[0],          [121, 23], 5.0, { pitch: 0 }),
  keyframe(S.s02[0] + 2.8,    [...STRAIT], 7.5, { pitch: 0 }),
  keyframe(S.s02[1],          [...STRAIT], 7.5, { pitch: 0 }),
  /* S03: transit + value — pull back a touch */
  keyframe(S.s03[0],          [121.5, 23], 6.0, { pitch: 0 }),
  keyframe(S.s03[0] + 2.0,    [121.5, 23], 6.5, { pitch: 0 }),
  keyframe(S.s03b[1],         [121.5, 23], 6.5, { pitch: 0 }),
  /* S04: chips — stay on Taiwan, landmass emphasis */
  keyframe(S.s04[0],          [120.5, 24], 5.0, { pitch: 0 }),
  keyframe(S.s04[0] + 2.0,    [120.5, 24], 5.5, { pitch: 0 }),
  keyframe(S.s04[1],          [120.5, 24], 5.5, { pitch: 0 }),
  /* S05: dependents — widen to see Japan / Korea / Australia */
  keyframe(S.s05[0],          [121, 22], 4.0, { pitch: 0 }),
  keyframe(S.s05[0] + 2.5,    [128, 26], 2.2, { pitch: 0 }),
  keyframe(S.s05[1],          [128, 26], 2.2, { pitch: 0 }),
  /* S06: detour — the 1,000-mile escape east of Taiwan */
  keyframe(S.s06[0],          [125, 18], 3.0, { pitch: 0 }),
  keyframe(S.s06[0] + 2.5,    [133, 22], 2.4, { pitch: 0 }),
  keyframe(S.s06[1],          [133, 22], 2.4, { pitch: 0 }),
  /* S07: close — wide, both routes visible */
  keyframe(S.s07[0],          [118, 16], 2.6, { pitch: 0 }),
  keyframe(S.s07[0] + 2.0,    [124, 20], 2.0, { pitch: 4 }),
  keyframe(DUR,               [124, 20], 2.0, { pitch: 4 }),
]);

/* ==================================================================== base layers */
const globeLand = createLayer('shape', 0, {
  name: 'Asia landmass', geojson: JSON.stringify(world),
  fillColor: '#1B232D', fillOpacity: staticTrack(1),
  lineColor: SIGNAL, lineWidth: staticTrack(0.6), traceOutline: false, out: EDGE, fade: 0.4,
});
const asia = createLayer('shape', 0, {
  name: 'Key countries', geojson: JSON.stringify(pick('China', 'Taiwan', 'Japan', 'South Korea', 'North Korea', 'Philippines', 'Australia', 'Vietnam')),
  fillColor: '#243040', fillOpacity: staticTrack(0.55),
  lineColor: SIGNAL, lineWidth: staticTrack(0.5), out: EDGE, fade: 0.5,
});

/* ==================================================================== routes */
const route = (name, at, out, coords, opts = {}) =>
  createLayer('route', at, {
    name, out, coords, curve: opts.curve ?? 'smooth',
    color: opts.color ?? SIGNAL, width: staticTrack(opts.w ?? 3), glow: true,
    lineStyle: opts.lineStyle ?? 'solid', animateDash: opts.animateDash ?? false,
    cometTail: opts.cometTail ?? false, overWater: opts.overWater ?? false,
    progress: windowTrack(at + 0.15, at + (opts.draw ?? 3.0), 'easeInOutCubic'), fade: 0.4,
    marker: { enabled: true, icon: opts.icon ?? 'dot', iconEmoji: '',
              color: opts.color ?? SIGNAL, size: staticTrack(opts.markerSize ?? 6), rotate: true },
  });

// Main trunk: Singapore → Taiwan Strait → East China → Korea/Japan (the normal, busy lane)
const mainRoute = route('Singapore→Korea', S.s02[0] + 3.0, EDGE,
  MAIN_ROUTE,
  { draw: 3.5, w: 3.5, curve: 'smooth', lineStyle: 'dashed', animateDash: true, icon: 'ship', markerSize: 11, overWater: true });

// East-of-Taiwan detour: the ~1,000-mile escape, drawn during S06
const detourRoute = route('East detour', S.s06[0] + 1.5, S.s07[1] + 0.3,
  DETOUR_ROUTE,
  { draw: 3.5, w: 5, color: AMBER, curve: 'smooth', cometTail: true, icon: 'ship', markerSize: 12, overWater: true,
    lineStyle: 'dashed', animateDash: true });

/* ==================================================================== markers */
const pulseMarker = (name, at, out, coord, label, opts = {}) =>
  createLayer('marker', at, {
    name, out, coord, fade: 0.4, color: SIGNAL, size: staticTrack(7),
    icon: opts.icon ?? 'port', iconEmoji: '', label: label ?? '',
    labelSize: staticTrack(label ? 18 : 0), labelColor: PAPER,
    behaviours: { ring: [{ id: createId(), type: 'pulse', enabled: true }] },
  });
const markers = [
  pulseMarker('Taiwan', S.s01[0] + 1.0, S.s04[0], TAIWAN, 'TAIWAN'),
];

/* ==================================================================== country highlights
 * When a country is named on narration, its landmass lights up and a flag pops
 * in at its capital — "this country matters" should be a map event, not just a word.
 * Japan/Korea named in S05; each pops just before its stat line and fades with the beat.
 */
const FLAG_POINTS = {
  'Japan': [138.6, 36.2], 'South Korea': [127.8, 36.5], 'Australia': [133.8, -24.5],
};
const highlight = (name, at, out, country, colorMain = '#1F7A3F') =>
  createLayer('shape', at, {
    name, out, geojson: JSON.stringify(pick(country)),
    fillColor: colorMain, fillOpacity: staticTrack(0.6),
    lineColor: AMBER, lineWidth: staticTrack(1.4), fade: 0.4,
  });
const flagMarker = (name, at, out, coord, emoji) =>
  createLayer('marker', at, {
    name, out, coord, fade: 0.2, color: PAPER, size: staticTrack(26),
    icon: 'emoji', iconEmoji: emoji, label: '', labelSize: staticTrack(0), labelColor: PAPER,
    behaviours: { scale: [{ id: createId(), type: 'pop', enabled: true }], ring: [] },
  });
const countryFx = [
  highlight('Highlight Japan', S.s05[0] + 0.4, S.s05[1] - 0.2, 'Japan'),
  highlight('Highlight Korea', S.s05[0] + 2.6, S.s05[1] - 0.2, 'South Korea'),
  highlight('Highlight Australia', S.s05[0] + 5.0, S.s05[1] - 0.2, 'Australia'),
  flagMarker('Flag Japan', S.s05[0] + 0.9, S.s05[1] - 0.2, FLAG_POINTS['Japan'], '🇯🇵'),
  flagMarker('Flag Korea', S.s05[0] + 3.1, S.s05[1] - 0.2, FLAG_POINTS['South Korea'], '🇰🇷'),
  flagMarker('Flag Australia', S.s05[0] + 5.5, S.s05[1] - 0.2, FLAG_POINTS['Australia'], '🇦🇺'),
];

const clouds = [];

/* ==================================================================== text overlays */
const T = (name, at, out, text, y, size, opts = {}) =>
  createLayer('text', at, {
    name, out, fade: opts.fade ?? 0.4, text,
    x: staticTrack(opts.x ?? 0.5), y: staticTrack(y),
    size: staticTrack(size), color: opts.color ?? PAPER, weight: opts.weight ?? 700,
    align: opts.align ?? 'center', letterSpacing: staticTrack(opts.ls ?? 2),
    anim: 'fade', background: opts.bg ?? false,
  });

const texts = [
  /* Persistent credits */
  T('Source', 0, EDGE, 'CSIS · IMF PORTWATCH · NATURAL EARTH', 0.045, 13,
    { ls: 1, weight: 500, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
  T('Mark', 0, EDGE, 'DATABANDAR', 0.085, 16, { ls: 4, weight: 700, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),

  /* S01 Hook — punchy, one idea */
  T('Hook punch', S.s01[0] + 0.4, S.s01[1] - 0.2, "THE WORLD'S OIL DOESN'T FLOW HERE.", 0.3, 44, { ls: 2 }),
  T('Title', S.s01[0] + 2.2, S.s01[1] - 0.2, 'TAIWAN — THE STRAIT OF CHIPS', 0.62, 40, { ls: 3, color: SIGNAL }),

  /* S02 Width reveal — keep stats at top half, route flows below */
  T('Width', S.s02[0] + 1.0, S.s02[1] - 0.5, '180 km', 0.3, 76, { color: SIGNAL }),
  T('Width label', S.s02[0] + 3.5, S.s02[1] - 0.5, 'WIDE — AND THE BUSIEST ON EARTH', 0.415, 22, { ls: 3, weight: 500, color: DIM }),

  /* S03 Transit + value — top-left corner block, clear of route */
  T('Transit', S.s03[0] + 0.3, S.s03[1] - 0.4, '87,343 SHIPS / YEAR', 0.32, 46, { color: AMBER, x: 0.5 }),
  T('Value', S.s03[0] + 2.8, S.s03[1] - 0.4, '$2.45 TRILLION — 1/5 OF WORLD TRADE', 0.47, 22, { ls: 1, weight: 600 }),

  /* S03b: not oil — distinct slot, fades before Transit ends */
  T('NotOil', S.s03b[0] + 0.6, S.s04[0] - 0.3, 'NOT OIL. SOMETHING FAR HARDER TO REPLACE.', 0.79, 26, { ls: 2, weight: 600 }),

  /* S04 Chips */
  T('Chips', S.s04[0] + 1.0, S.s04[1] - 0.3, '90% OF ADVANCED CHIPS', 0.3, 56, { color: SIGNAL }),
  T('Chips label', S.s04[0] + 3.5, S.s04[1] - 0.3, "YOUR PHONE · YOUR CAR · EVERY DATA CENTRE", 0.47, 20, { ls: 1, weight: 500, color: DIM }),

  /* S05 Dependents — countries are highlighted + flagged by map, text is compact */
  T('Depend', S.s05[0] + 0.5, S.s05[1] - 0.2, "1/3 OF JAPAN'S IMPORTS", 0.3, 34, { color: SIGNAL }),
  T('Depend b', S.s05[0] + 2.8, S.s05[1] - 0.2, "1/4 OF SOUTH KOREA'S · 1/4 OF AUSTRALIA'S EXPORTS", 0.47, 24, { ls: 1, weight: 600 }),

  /* S06 Detour */
  T('Detour', S.s06[0] + 2.5, S.s06[1] - 0.2, '+1,000 MILES', 0.3, 60, { ls: 2, color: AMBER }),
  T('Detour label', S.s06[0] + 3.5, S.s06[1] - 0.2, 'THE ESCAPE — EAST OF TAIWAN', 0.47, 22, { ls: 3, weight: 500, color: DIM }),

  /* S07 Close — clear sign-off */
  T('Close big', S.s07[0] + 0.8, EDGE, 'THE NARROW STRAIT MOVES OIL', 0.22, 46, { ls: 2 }),
  T('Close small', S.s07[0] + 2.4, EDGE, "THE WIDE ONE MOVES THE WORLD'S MEMORY", 0.34, 27, { ls: 1, weight: 600, color: SIGNAL }),
  T('Close stat', S.s07[0] + 4.6, EDGE, '87,343 SHIPS / YEAR', 0.78, 32, { ls: 2, color: AMBER }),
];

/* ==================================================================== project */
const allNodes = [camera, ctx, globeLand, asia, mainRoute, detourRoute,
  ...markers, ...countryFx, ...clouds, ...texts];
const project = projectWith(allNodes, {
  name: 'Taiwan Strait', duration: DUR, fps: 30, width: 1080, height: 1920,
  basemap: 'dark-clean', background: VOID,
  story: [{
    id: 'b1', t: 0, d: DUR,
    nodes: [globeLand.id, asia.id, mainRoute.id, detourRoute.id,
            ...markers.map(m => m.id),
            ...countryFx.map(m => m.id),
            ...clouds.map(m => m.id)],
    context: ctx.id,
  }],
});
writeFileSync(`${OUT}/project.geomotion.json`, JSON.stringify(project));
console.log('layers:', Object.keys(project.nodes).length, '· dur', project.duration, 's · proj', ctx.projection);