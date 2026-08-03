/**
 * "Rare Earths — The Refinery War" v2 (2026)
 *  - Pure SATELLITE basemap (imagery only, no city/place labels)
 *  - Fast-paced, tighter scenes with more camera movement
 *  - Bigger mine/factory emoji markers at real sites
 *  - Animated boundary pulse (+ SFX on highlight)
 *  - Transparent AI-image overlays replace most text
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cameraFromShots, createLayer, projectWith, staticTrack, windowTrack, keyframe,
} from '../../../../packages/document/src/index.ts';
import { createMapContext } from '../../../../packages/document/src/schema/index.ts';
import { createId } from '../../../../packages/core/src/index.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const OUT = fileURLToPath(new URL('..', import.meta.url));

const world = JSON.parse(readFileSync(`${ROOT}/apps/studio/src/data/world-countries.json`, 'utf8'));
const pick = (...names) => ({ type: 'FeatureCollection', features: world.features.filter((f) => names.includes(f.properties.name)) });

const WHITE = '#FFFFFF';
const SIGNAL = '#22FF88';
const AMBER = '#FFC24D';
const GLASS = 'rgba(8,12,16,0.55)';

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

/* ==================================================================== sites (real rare-earth mines) */
const BAYAN_OBU = [113, 41];          // Inner Mongolia, China — largest REE mine
const MT_PASS   = [-115.5, 35.5];     // Mountain Pass, CA (MP Materials)
const ROUND_TOP = [-104, 30];         // Round Top, TX (USA Rare Earth)
const MT_WELD   = [122, -29];         // Mount Weld, Australia (Lynas)
const INDIA_BEACH = [78, 14];         // monazite sands, India
const SERRA      = [-55, -13];        // Serra Verde / Pela Ema, Brazil
const FLAG = { 'China': [105, 36], 'United States of America': [-100, 39], 'India': [78, 22], 'Australia': [133, -25], 'Brazil': [-52, -9] };

/* ==================================================================== map context — PURE SATELLITE */
const ctx = createMapContext('RareEarths');
ctx.basemap = 'satellite';      // imagery only — no city names, no borders
ctx.projection = 'mercator';

/* ==================================================================== camera (fast) */
const camera = cameraFromShots([
  keyframe(0,                 [20, 12], 1.5, { pitch: 0 }),
  keyframe(AT.s01.start + 1.6, [35, 18], 1.8, { pitch: 3 }),
  keyframe(S.s01[1],          [35, 18], 1.9, { pitch: 3 }),
  keyframe(S.s02[0],          [45, 22], 1.9, { pitch: 0 }),
  keyframe(S.s02[0] + 1.6,    [45, 22], 1.9, { pitch: 0 }),
  keyframe(S.s02[1],          [45, 22], 1.9, { pitch: 0 }),
  keyframe(S.s03[0],          [78, 30], 2.9, { pitch: -6 }),
  keyframe(S.s03[0] + 2.2,    [107, 39], 3.4, { pitch: -10 }),
  keyframe(S.s03b[1],         [107, 39], 3.4, { pitch: -10 }),
  keyframe(S.s04[0],          [40, 10], 2.1, { pitch: 0 }),
  keyframe(S.s04[0] + 2.4,    [10, 0],  1.5, { pitch: 0 }),
  keyframe(S.s04[1],          [10, 0],  1.5, { pitch: 0 }),
  keyframe(S.s05[0],          [-22, 26], 1.7, { pitch: 0 }),
  keyframe(S.s05[0] + 2.0,    [-104, 33], 2.7, { pitch: -8 }),
  keyframe(S.s05[1],          [-104, 33], 2.7, { pitch: -8 }),
  keyframe(S.s06[0],          [20, 30], 1.9, { pitch: 0 }),
  keyframe(S.s06[0] + 1.8,    [82, 20], 3.0, { pitch: -8 }),
  keyframe(S.s06[1],          [82, 20], 3.0, { pitch: -8 }),
  keyframe(S.s07[0],          [30, 15], 1.7, { pitch: 0 }),
  keyframe(S.s07[0] + 1.4,    [30, 15], 1.7, { pitch: 2 }),
  keyframe(DUR,               [30, 15], 1.7, { pitch: 2 }),
]);

/* ==================================================================== mine/factory markers (bigger) */
const siteMarker = (name, at, out, coord, emoji, size) =>
  createLayer('marker', at, {
    name, out, coord, fade: 0.1, color: WHITE, size: staticTrack(size),
    icon: 'emoji', iconEmoji: emoji, label: '', labelSize: staticTrack(0), labelColor: WHITE,
    behaviours: { scale: [{ id: createId(), type: 'pop', enabled: true }], ring: [] },
  });
const sites = [
  siteMarker('Site BayanObu', S.s04[0] + 0.5, EDGE, BAYAN_OBU, '⛏️', 30),
  siteMarker('Site MtWeld', S.s04[0] + 1.5, EDGE, MT_WELD, '⛏️', 30),
  siteMarker('Site India', S.s04[0] + 2.3, S.s06[1], INDIA_BEACH, '⛏️', 30),
  siteMarker('Site Brazil', S.s04[0] + 3.1, EDGE, SERRA, '⛏️', 30),
  siteMarker('Site MtPass', S.s05[0] + 1.0, S.s05[1], MT_PASS, '🏭', 34),
  siteMarker('Site RoundTop', S.s05[0] + 1.8, S.s05[1], ROUND_TOP, '🏭', 30),
];

/* ==================================================================== country highlight + animated boundary pulse + SFX-ready markers */
const highlight = (name, at, out, country, fill) =>
  createLayer('shape', at, {
    name, out, geojson: JSON.stringify(pick(country)),
    fillColor: fill, fillOpacity: staticTrack(0.5),
    lineColor: SIGNAL, lineWidth: staticTrack(2.2), fade: 0.25,
  });
const pulseRing = (name, at, out, coord, size = 54) =>
  createLayer('marker', at, {
    name, out, coord, fade: 0.1, color: SIGNAL, size: staticTrack(size),
    icon: 'dot', iconEmoji: '', label: '', labelSize: staticTrack(0), labelColor: WHITE,
    behaviours: { ring: [{ id: createId(), type: 'pulse', enabled: true }] },
  });
const flagP = (name, at, out, coord, emoji) =>
  createLayer('marker', at, {
    name, out, coord, fade: 0.1, color: WHITE, size: staticTrack(34),
    icon: 'emoji', iconEmoji: emoji, label: '', labelSize: staticTrack(0), labelColor: WHITE,
    behaviours: { scale: [{ id: createId(), type: 'pop', enabled: true }], ring: [] },
  });
const countryFx = [
  /* China: highlight + pulse + flag (S03) */
  highlight('CL China', S.s03[0] + 0.3, S.s03b[1] - 0.2, 'China', 'rgba(255,60,60,0.25)'),
  pulseRing('CR China', S.s03[0] + 0.5, S.s03b[1] - 0.2, FLAG['China'], 60),
  flagP('CF China', S.s03[0] + 1.0, S.s03b[1] - 0.2, FLAG['China'], '🇨🇳'),
  /* S04: the mine spread */
  highlight('CL Australia', S.s04[0] + 1.4, S.s04[1] - 0.2, 'Australia', 'rgba(34,255,136,0.2)'),
  flagP('CF Australia', S.s04[0] + 1.6, S.s04[1] - 0.2, FLAG['Australia'], '🇦🇺'),
  highlight('CL Brazil', S.s04[0] + 3.0, S.s04[1] - 0.2, 'Brazil', 'rgba(34,255,136,0.2)'),
  flagP('CF Brazil', S.s04[0] + 3.2, S.s04[1] - 0.2, FLAG['Brazil'], '🇧🇷'),
  /* S05: US */
  highlight('CL USA', S.s05[0] + 0.3, S.s05[1] - 0.2, 'United States of America', 'rgba(40,120,255,0.25)'),
  pulseRing('CR USA', S.s05[0] + 0.5, S.s05[1] - 0.2, FLAG['United States of America'], 70),
  flagP('CF USA', S.s05[0] + 1.1, S.s05[1] - 0.2, FLAG['United States of America'], '🇺🇸'),
  /* S06: India */
  highlight('CL India', S.s06[0] + 0.3, S.s06[1] - 0.2, 'India', 'rgba(255,160,40,0.25)'),
  pulseRing('CR India', S.s06[0] + 0.5, S.s06[1] - 0.2, FLAG['India'], 60),
  flagP('CF India', S.s06[0] + 1.0, S.s06[1] - 0.2, FLAG['India'], '🇮🇳'),
];

/* ==================================================================== AI-image overlays (replace text) */
const IMG = '/assets-rare/';
const imgOverlay = (name, at, out, file, x, y, width, anim = 'kenBurns') =>
  createLayer('image', at, {
    name, out, fade: 0.4, src: IMG + file,
    x: staticTrack(x), y: staticTrack(y), width: staticTrack(width),
    anchor: 'center', opacity: staticTrack(1), radius: staticTrack(0),
    border: false, shadow: false, anim, caption: '',
  });
const overlays = [
  /* S02: "in your phone, EV, turbine, jet" -> show the cutouts flying across */
  imgOverlay('IM-EV', S.s02[0] + 0.8, S.s03[0] - 0.3, 'ev.png', 0.5, 0.8, 0.4),
  imgOverlay('IM-Turbine', S.s02[0] + 1.6, S.s03[0] - 0.3, 'turbine.png', 0.18, 0.55, 0.24),
  imgOverlay('IM-Magnet', S.s02[0] + 2.2, S.s03[0] - 0.3, 'magnet.png', 0.84, 0.58, 0.2),
  imgOverlay('IM-Jet', S.s02[0] + 3.0, S.s03[0] - 0.3, 'jet.png', 0.55, 0.16, 0.26),
  /* S04: "mine vs refinery" — mine then factory */
  imgOverlay('IM-Mine', S.s04[0] + 0.6, S.s04[1] - 0.2, 'mine.png', 0.5, 0.42, 0.34),
  /* S05: factory for US fight-back */
  imgOverlay('IM-Factory', S.s05[0] + 2.2, S.s05[1] - 0.2, 'factory.png', 0.76, 0.2, 0.26),
];

/* ==================================================================== minimal text (scaled way back) */
const T = (name, at, out, text, y, size, opts = {}) =>
  createLayer('text', at, {
    name, out, fade: opts.fade ?? 0.3, text,
    x: staticTrack(opts.x ?? 0.5), y: staticTrack(y),
    size: staticTrack(size), color: opts.color ?? WHITE, weight: opts.weight ?? 700,
    align: opts.align ?? 'center', letterSpacing: staticTrack(opts.ls ?? 2),
    anim: 'fade', background: opts.bg ?? false, backgroundColor: GLASS,
  });
const texts = [
  /* Persistent credits — small, unobtrusive */
  T('Source', 0, EDGE, 'IEA · USGS · NATURAL EARTH', 0.045, 12,
    { ls: 1, weight: 500, color: WHITE, fade: 0.3, x: 0.93, align: 'right', bg: true }),
  T('Mark', 0, EDGE, 'DATABANDAR', 0.085, 15, { ls: 4, weight: 700, color: WHITE, fade: 0.3, x: 0.93, align: 'right', bg: true }),

  /* S01 hook — one line */
  T('Hook', S.s01[0] + 0.4, S.s01[1] - 0.1, 'CHINA\'S MIGHTIEST EXPORT?', 0.3, 40, { ls: 2, bg: true }),
  /* S03 — the two numbers only */
  T('70', S.s03[0] + 0.7, S.s03b[1] - 0.2, 'MINES 70%', 0.2, 44, { color: AMBER, bg: true }),
  T('90', S.s03[0] + 3.0, S.s03b[1] - 0.2, 'REFINES 90%', 0.32, 44, { color: AMBER, bg: true }),
  /* S03b — the twist, one line */
  T('Trap', S.s03b[0] + 0.5, S.s04[0] - 0.2, 'THE REFINERY IS THE CHOKE.', 0.78, 26, { ls: 2, weight: 600, bg: true }),
  /* S05 — US */
  T('US line', S.s05[0] + 0.6, S.s05[1] - 0.2, 'MOUNTAIN PASS · ROUND TOP', 0.3, 30, { ls: 2, weight: 600, bg: true }),
  T('US $', S.s05[0] + 2.0, S.s05[1] - 0.2, '$12B STOCKPILE', 0.42, 30, { color: AMBER, bg: true }),
  /* S07 close */
  T('Close', S.s07[0] + 0.8, EDGE, 'RARE EARTHS AREN\'T SCARCE.', 0.3, 42, { ls: 2, bg: true }),
  T('Close2', S.s07[0] + 2.2, EDGE, 'REFINEMENT IS.', 0.44, 42, { color: SIGNAL, bg: true }),
];

/* ==================================================================== project */
const allNodes = [camera, ctx, ...sites, ...countryFx, ...overlays, ...texts];
const project = projectWith(allNodes, {
  name: 'Rare Earths v2', duration: DUR, fps: 30, width: 1080, height: 1920,
  basemap: 'satellite', background: '#06090C',
  story: [{
    id: 'b1', t: 0, d: DUR,
    nodes: [...sites.map(m => m.id), ...countryFx.map(m => m.id), ...overlays.map(m => m.id)],
    context: ctx.id,
  }],
});
writeFileSync(`${OUT}/project.geomotion.json`, JSON.stringify(project));
console.log('layers:', Object.keys(project.nodes).length, '· dur', project.duration, 's · basemap', ctx.basemap);