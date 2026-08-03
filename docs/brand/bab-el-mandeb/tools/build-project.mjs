/**
 * "Bab el-Mandeb — The Other Door" — the second strait of the 2026 war.
 * Narration-led, stat-first — Hormuz/Taiwan style: dark-clean basemap, source
 * strip, port-anchor markers, route through the strait, country highlights+flags.
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
const BAB       = [43.3, 12.7];   // Bab el-Mandeb strait
const YEMEN     = [44.2, 15.6];
const DJIBOUTI  = [43.1, 11.9];
const GULF_ADEN = [48, 13.2];
const ARABIAN   = [58, 12.3];
const RED_NE    = [40, 17];       // Red Sea north corridor (clear of Suez landfall)

/* Verified offshore corridor (all WATER, checked vs world geojson):
   west into Red Sea, then east out through Gulf of Aden → Arabian Sea.
   The strait's navigable deep channel runs east of Perim Island (~43.8°E). */
const STRAIT_EAST = [
  [44.0, 12.4], [44.5, 12.2], [45.0, 12.0], [46.0, 12.2], [47, 12.5],
  [48, 13.2], [50, 13.5], [54, 13], [58, 12.5], [62, 11],
];
const STRAIT_WEST = [
  [44.0, 12.4],
];

/* ==================================================================== map context */
const ctx = createMapContext('Bab-el-Mandeb');
ctx.basemap = 'dark-clean';
ctx.projection = 'mercator';

/* ==================================================================== camera */
const camera = cameraFromShots([
  /* S01 Hook: wide Middle East, slow arrival on the strait */
  keyframe(0,                 [45, 18], 2.4, { pitch: 0 }),
  keyframe(AT.s01.start + 2.5, [45, 16], 2.8, { pitch: 0 }),
  keyframe(S.s01[1],          [45, 16], 2.8, { pitch: 0 }),
  /* S02: push into the strait — the Gate of Tears */
  keyframe(S.s02[0],          [43.8, 14], 4.5, { pitch: 0 }),
  keyframe(S.s02[0] + 2.8,    [...BAB], 6.5, { pitch: 0 }),
  keyframe(S.s02[1],          [...BAB], 6.5, { pitch: 0 }),
  /* S03: transit/value — pull back a touch */
  keyframe(S.s03[0],          [44.5, 14], 5.0, { pitch: 0 }),
  keyframe(S.s03[0] + 2.0,    [44.5, 14], 5.5, { pitch: 0 }),
  keyframe(S.s03b[1],         [44.5, 14], 5.5, { pitch: 0 }),
  /* S04: Houthis — stay on the strait, Yemen presence */
  keyframe(S.s04[0],          [44, 14.5], 4.5, { pitch: 0 }),
  keyframe(S.s04[0] + 2.0,    [44, 14.5], 5.0, { pitch: 0 }),
  keyframe(S.s04[1],          [44, 14.5], 5.0, { pitch: 0 }),
  /* S05: Suez flow — widen to show route to Suez / ocean */
  keyframe(S.s05[0],          [45, 16], 3.5, { pitch: 0 }),
  keyframe(S.s05[0] + 2.5,    [47, 16], 2.6, { pitch: 0 }),
  keyframe(S.s05[1],          [47, 16], 2.6, { pitch: 0 }),
  /* S06: two doors — wide view of both straits framing */
  keyframe(S.s06[0],          [54, 17], 2.6, { pitch: 0 }),
  keyframe(S.s06[0] + 2.5,    [52, 18], 2.2, { pitch: 0 }),
  keyframe(S.s06[1],          [52, 18], 2.2, { pitch: 0 }),
  /* S07: close — back on the strait */
  keyframe(S.s07[0],          [46, 14], 2.8, { pitch: 0 }),
  keyframe(S.s07[0] + 2.0,    [44, 14], 3.0, { pitch: 3 }),
  keyframe(DUR,               [44, 14], 3.0, { pitch: 3 }),
]);

/* ==================================================================== base layers */
const globeLand = createLayer('shape', 0, {
  name: 'Landmass', geojson: JSON.stringify(world),
  fillColor: '#1B232D', fillOpacity: staticTrack(1),
  lineColor: SIGNAL, lineWidth: staticTrack(0.6), traceOutline: false, out: EDGE, fade: 0.4,
});
const region = createLayer('shape', 0, {
  name: 'Key countries', geojson: JSON.stringify(pick('Yemen', 'Djibouti', 'Eritrea', 'Saudi Arabia', 'Egypt', 'Somalia', 'Iran', 'Oman', 'Israel', 'Jordan')),
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

/* Main lane: the Asia-Europe trade route threading the strait, drawn west→east */
const mainRoute = route('Trade lane', S.s02[0] + 3.0, EDGE,
  STRAIT_WEST.concat(STRAIT_EAST),
  { draw: 4.0, w: 3.5, curve: 'smooth', lineStyle: 'dashed', animateDash: true, icon: 'ship', markerSize: 11, overWater: true });

/* ==================================================================== markers */
const pulseMarker = (name, at, out, coord, label, opts = {}) =>
  createLayer('marker', at, {
    name, out, coord, fade: 0.4, color: SIGNAL, size: staticTrack(7),
    icon: opts.icon ?? 'port', iconEmoji: '', label: label ?? '',
    labelSize: staticTrack(label ? 18 : 0), labelColor: PAPER,
    behaviours: { ring: [{ id: createId(), type: 'pulse', enabled: true }] },
  });
const markers = [
  pulseMarker('Bab', S.s02[0] + 0.5, S.s04[0], BAB, 'BAB EL-MANDEB'),
];

/* ==================================================================== country highlights + flags */
const FLAG_POINTS = {
  'Yemen': [44.2, 15.5], 'Iran': [52.7, 32.4], 'Saudi Arabia': [45.0, 23.9],
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
  highlight('Highlight Yemen', S.s04[0] + 0.4, S.s04[1] - 0.2, 'Yemen'),
  highlight('Highlight Iran', S.s06[0] + 0.4, S.s06[1] - 0.2, 'Iran'),
  highlight('Highlight Saudi', S.s06[0] + 2.4, S.s06[1] - 0.2, 'Saudi Arabia'),
  flagMarker('Flag Yemen', S.s04[0] + 1.0, S.s04[1] - 0.2, FLAG_POINTS['Yemen'], '🇾🇪'),
  flagMarker('Flag Iran', S.s06[0] + 1.0, S.s06[1] - 0.2, FLAG_POINTS['Iran'], '🇮🇷'),
  flagMarker('Flag Saudi', S.s06[0] + 2.9, S.s06[1] - 0.2, FLAG_POINTS['Saudi Arabia'], '🇸🇦'),
];

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
  T('Source', 0, EDGE, 'EIA · REUTERS · CLARKSONS · NATURAL EARTH', 0.045, 13,
    { ls: 1, weight: 500, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
  T('Mark', 0, EDGE, 'DATABANDAR', 0.085, 16, { ls: 4, weight: 700, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),

  /* S01 Hook — punchy, one idea */
  T('Hook punch', S.s01[0] + 0.4, S.s01[1] - 0.2, "HORMUZ IS THE FRONT DOOR.", 0.3, 44, { ls: 2 }),
  T('Title', S.s01[0] + 2.4, S.s01[1] - 0.2, "THIS IS THE DOOR NOBODY KNOWS", 0.62, 38, { ls: 3, color: SIGNAL }),

  /* S02 Width reveal */
  T('Width', S.s02[0] + 1.0, S.s02[1] - 0.4, '18 MILES', 0.3, 68, { color: SIGNAL }),
  T('Width label', S.s02[0] + 3.2, S.s02[1] - 0.4, 'THE GATE OF TEARS — RED SEA TO ARABIAN SEA', 0.415, 22, { ls: 3, weight: 500, color: DIM }),

  /* S03 Transit + value */
  T('Transit', S.s03[0] + 0.3, S.s03[1] - 0.4, '1/4 OF SEABORNE OIL', 0.3, 46, { color: AMBER }),
  T('Value', S.s03[0] + 2.8, S.s03[1] - 0.4, 'AND THE ASIA–EUROPE TRADE', 0.47, 24, { ls: 1, weight: 600 }),

  /* S03b: holds in vs lets out */
  T('NotOil', S.s03b[0] + 0.6, S.s04[0] - 0.3, 'HORMUZ HOLDS ENERGY IN. THIS LETS THE WORLD OUT.', 0.79, 26, { ls: 2, weight: 600 }),

  /* S04 Houthis */
  T('Proxy', S.s04[0] + 1.0, S.s04[1] - 0.3, 'GUARDED BY THE HOUTHIS', 0.3, 42, { color: SIGNAL }),
  T('Proxy label', S.s04[0] + 3.2, S.s04[1] - 0.3, "IRAN'S PROXY ON THE SHORE OF YEMEN", 0.47, 22, { ls: 2, weight: 500, color: DIM }),

  /* S05 Suez flow — the collapse */
  T('Suez stat', S.s05[0] + 1.0, S.s05[1] - 0.2, '80 → 26', 0.3, 60, { color: AMBER }),
  T('Suez label', S.s05[0] + 3.2, S.s05[1] - 0.2, 'WEEKLY ROUTES THROUGH THE GATE TO SUEZ', 0.47, 22, { ls: 2, weight: 500, color: DIM }),

  /* S06 two doors */
  T('Doors', S.s06[0] + 0.5, S.s06[1] - 0.2, 'IRAN HOLDS HORMUZ. ITS PROXY HOLDS THIS.', 0.3, 36, { color: SIGNAL }),
  T('Doors b', S.s06[0] + 2.8, S.s06[1] - 0.2, 'SAME CAMPAIGN. TWO DOORS.', 0.47, 26, { ls: 2, weight: 600 }),

  /* S07 Close */
  T('Close big', S.s07[0] + 0.8, EDGE, "THE FRONT DOOR OF ENERGY. THE BACK DOOR OF TRADE.", 0.22, 40, { ls: 2 }),
  T('Close small', S.s07[0] + 2.6, EDGE, "AND THE WORLD IS STILL LEARNING ITS NAME.", 0.34, 26, { ls: 1, weight: 600, color: SIGNAL }),
  T('Close stat', S.s07[0] + 4.6, EDGE, 'BAB EL-MANDEB', 0.78, 34, { ls: 2, color: AMBER }),
];

/* ==================================================================== project */
const allNodes = [camera, ctx, globeLand, region, mainRoute,
  ...markers, ...countryFx, ...texts];
const project = projectWith(allNodes, {
  name: 'Bab-el-Mandeb', duration: DUR, fps: 30, width: 1080, height: 1920,
  basemap: 'dark-clean', background: VOID,
  story: [{
    id: 'b1', t: 0, d: DUR,
    nodes: [globeLand.id, region.id, mainRoute.id,
            ...markers.map(m => m.id),
            ...countryFx.map(m => m.id)],
    context: ctx.id,
  }],
});
writeFileSync(`${OUT}/project.geomotion.json`, JSON.stringify(project));
console.log('layers:', Object.keys(project.nodes).length, '· dur', project.duration, 's · proj', ctx.projection);