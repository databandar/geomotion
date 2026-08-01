/**
 * EP001 "The Four Doors" — builds the GeoMotion project.
 *
 * Retimed from measured narration audio, not from the word-count estimate the episode doc
 * used. am_michael reads slower than the handbook's 2.65 words/sec budget, and every segment
 * overran its planned slot on the first pass. Scene boundaries are now the actual audio
 * durations plus deliberate gaps (silences, holds), so picture and voice cannot collide.
 *
 * Run from anywhere with `node tools/build-project.mjs` — paths below are resolved relative
 * to this file, not to the caller's cwd or to any one machine's temp directory.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cameraFromShots, createLayer, keyframe, projectWith, staticTrack, windowTrack,
} from '../../../../packages/document/src/index.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const OUT = fileURLToPath(new URL('..', import.meta.url)); // docs/brand/render/

const world = JSON.parse(readFileSync(`${ROOT}/apps/studio/src/data/world-countries.json`, 'utf8'));
const pick = (...names) => ({
  type: 'FeatureCollection',
  features: world.features.filter((f) => names.includes(f.properties.name)),
});

/* Brand tokens — Handbook 1.7 */
const VOID = '#0A0E13';
const SIGNAL = '#FF4A26';
const COLD = '#3D9BFF';
const PAPER = '#F2F4F5';
const AMBER = '#FFC24D';

/* ------------------------------------------------------------- the schedule */
/*
 * Measured with ffprobe against the actual Voicebox output (vo/*.wav), not estimated.
 * Gaps are deliberate: 1.0s after s02 is the dead-hold silence (Handbook S2), 0.70s after
 * s10 is silence #2 on "Gulf of Mexico", the rest are ordinary scene-change breathing room.
 */
const VO = [
  ['s01a', 2.92, 0.15], ['s01b', 3.85, 0.20], ['s02', 3.38, 1.00],
  ['s03', 6.05, 0.40], ['s04', 6.22, 0.35], ['s05', 9.12, 0.30],
  ['s06', 5.92, 0.50], ['s07', 7.08, 0.30], ['s08', 3.15, 0.45],
  ['s09', 7.55, 0.35], ['s10', 5.75, 0.70], ['s11', 4.97, 0.30],
  ['s12', 5.65, 0.30], ['s13', 3.30, 3.79],
];
let t = 0;
const at = {};
for (const [id, dur, gap] of VO) { at[id] = { start: t, end: t + dur }; t += dur + gap; }
const DUR = Math.round(t * 100) / 100;

/* Scene boundaries — one per storyboard beat, in narration order. */
const S = {
  S1: [0, at.s02.start], S2: [at.s02.start, at.s03.start], S3: [at.s03.start, at.s04.start],
  S4: [at.s04.start, at.s05.start], S5: [at.s05.start, at.s06.start], S6: [at.s06.start, at.s07.start],
  S7: [at.s07.start, at.s08.start], S8: [at.s08.start, at.s09.start], S9: [at.s09.start, at.s10.start],
  S10: [at.s10.start, at.s11.start], S11: [at.s11.start, at.s12.start], S12: [at.s12.start, at.s13.start],
  S13: [at.s13.start, DUR],
};

writeFileSync(`${OUT}/schedule.json`, JSON.stringify({ at, S, DUR }, null, 2));

/* ------------------------------------------------------------------ camera */
/*
 * Zooms tuned for a 1080-wide vertical frame: at 1080px, zoom z shows
 * 360 / 2^z * (1080/256) degrees of longitude. z2.95 is the widest that still clears the
 * Mercator pole limit in a 1920-tall frame — the DROP lands there, not narrower.
 */
const camera = cameraFromShots([
  keyframe(S.S1[0], [100, 58], 2.15, { pitch: 22 }),
  keyframe(S.S1[0] + 3.3, [100, 61], 2.95, { pitch: 0 }),
  keyframe(S.S1[1], [100, 61], 2.95, { pitch: 0 }),           // S2 dead hold begins here
  keyframe(S.S2[1], [100, 61], 2.95, { pitch: 0 }),           // hold through the silence
  keyframe(S.S3[1], [78, 57], 1.6, { pitch: 0 }),             // pull to all four bases
  keyframe(S.S4[0] + 0.4, [19.9, 54.65], 5.4, { pitch: 0 }),  // Baltic approach
  keyframe(S.S4[1] - 0.3, [12.68, 56.05], 10.2, { pitch: 0 }),// Øresund pinch
  keyframe(S.S5[0], [12.68, 56.05], 10.2, { pitch: 0 }),      // MATCH cut lands here
  keyframe(S.S5[0] + 0.15, [29.06, 41.12], 10.2, { pitch: 0 }),
  keyframe(S.S5[1] - 2.0, [29.06, 41.09], 11.9, { pitch: 0 }),
  keyframe(S.S5[1], [29.06, 41.09], 11.9, { pitch: 0 }),
  keyframe(S.S6[1], [29.10, 41.09], 11.6, { pitch: 0 }),      // treaty drift
  keyframe(S.S7[0] + 0.4, [131.9, 43.1], 6.2, { pitch: 0 }),  // HOP to Vladivostok
  keyframe(S.S7[1] - 1.5, [136, 40.5], 3.9, { pitch: 0 }),    // pull to hold three straits
  keyframe(S.S8[1], [137, 40], 3.7, { pitch: 0 }),
  keyframe(S.S9[0] + 0.5, [38, 71], 2.7, { pitch: 24 }),      // rise to the Arctic Circle
  keyframe(S.S9[1], [38, 71], 2.7, { pitch: 24 }),
  keyframe(S.S10[0] + 0.6, [-25, 52], 1.15, { pitch: 0 }),    // the reversal pull-back
  keyframe(S.S10[1], [-25, 52], 1.15, { pitch: 0 }),
  keyframe(S.S11[0] + 0.5, [33.08, 68.97], 4.4, { pitch: 0 }),// back to Murmansk
  keyframe(S.S11[1], [33.08, 68.97], 4.4, { pitch: 0 }),
  keyframe(S.S12[0] + 0.4, [-18, 63], 2.3, { pitch: 0 }),     // GIUK
  keyframe(S.S12[1], [-18, 63], 2.3, { pitch: 0 }),
  keyframe(S.S13[0] + 0.3, [78, 57], 1.6, { pitch: 0 }),      // visual rhyme with S3
  keyframe(DUR, [78, 57], 1.6, { pitch: 0 }),
]);

/* ------------------------------------------------------------------ shapes */
const shape = (name, at2, out, geo, opts = {}) =>
  createLayer('shape', at2, {
    name, out, fade: 0.5,
    geojson: JSON.stringify(geo),
    fillColor: opts.fill ?? COLD,
    fillOpacity: staticTrack(opts.op ?? 0.35),
    lineColor: opts.line ?? opts.fill ?? COLD,
    lineWidth: staticTrack(opts.lw ?? 1.4),
    traceOutline: opts.trace ?? false,
  });

const russia = shape('Russia', 0.6, DUR, pick('Russia'), {
  fill: SIGNAL, op: 0.09, line: SIGNAL, lw: 2.6, trace: true,
});

/* The Baltic exit is Danish and Swedish water — the accurate claim. The Baltic *Sea* has a
   Russian shore too (Kaliningrad, St Petersburg); this layer is the strait, not the sea. */
const baltic = shape('Denmark + Sweden', S.S4[0], S.S5[0], pick('Denmark', 'Sweden'), { op: 0.4 });
const turkey = shape('Turkey', S.S5[0], S.S6[0], pick('Turkey'), { op: 0.4 });
const japan = shape('Japan', S.S7[0], S.S8[1], pick('Japan'), { op: 0.4 });
const giuk = shape('Greenland + Iceland + UK', S.S12[0], DUR, pick('Greenland', 'Iceland', 'United Kingdom'), { op: 0.4 });

const arctic = shape('Arctic Circle', S.S9[0], S.S10[0], {
  type: 'Feature', properties: {},
  geometry: { type: 'LineString', coordinates: Array.from({ length: 73 }, (_, i) => [-180 + i * 5, 66.5633]) },
}, { fill: PAPER, op: 0, line: PAPER, lw: 1.2 });

/* ------------------------------------------------------------------ markers */
const base = (name, at2, out, coord, label, color = SIGNAL) =>
  createLayer('marker', at2, {
    name, out, fade: 0.35, coord, label, color,
    size: staticTrack(7), labelSize: staticTrack(19), labelColor: PAPER,
  });

const m1 = base('Baltiysk', S.S3[0] + 0.6, S.S5[0], [19.9, 54.65], 'BALTIC');
const m2 = base('Sevastopol', S.S3[0] + 0.9, S.S6[0], [33.53, 44.62], 'BLACK SEA');
const m3 = base('Vladivostok', S.S3[0] + 1.2, S.S8[1], [131.9, 43.1], 'PACIFIC');
const m4 = base('Severomorsk', S.S3[0] + 1.5, S.S13[0], [33.42, 69.07], 'NORTHERN');
const mMur = base('Murmansk', S.S9[0] + 2.4, S.S12[0], [33.08, 68.97], 'MURMANSK', PAPER);

/*
 * The S13 finale reprises S3's four-reticle shot — "same camera, same four reticles, now all
 * four SIGNAL at once" (episode doc). Reusing m1-m4 would mean stretching their `out` across
 * the whole film, which would leave the Baltic marker on screen while the story is at the
 * Bosphorus. Four fresh instances land only for the closing beat instead.
 */
const rm1 = base('Baltiysk (reprise)', S.S13[0], DUR, [19.9, 54.65], 'BALTIC');
const rm2 = base('Sevastopol (reprise)', S.S13[0], DUR, [33.53, 44.62], 'BLACK SEA');
const rm3 = base('Vladivostok (reprise)', S.S13[0], DUR, [131.9, 43.1], 'PACIFIC');
const rm4 = base('Severomorsk (reprise)', S.S13[0], DUR, [33.42, 69.07], 'NORTHERN');

/* ------------------------------------------------------------------ routes */
const route = (name, at2, out, coords, opts = {}) =>
  createLayer('route', at2, {
    name, out, fade: 0.4, coords,
    curve: opts.curve ?? 'arc',
    color: opts.color ?? SIGNAL,
    width: staticTrack(opts.w ?? 2.6),
    glow: true,
    progress: windowTrack(at2 + 0.15, at2 + (opts.draw ?? 1.5), 'easeInOutCubic'),
  });

const rBaltic = route('Baltic exit', S.S4[0] + 0.6, S.S5[0], [[19.9, 54.65], [15.2, 55.2], [12.68, 56.05]], { draw: 1.8 });
const rBlack = route('Black Sea exit', S.S5[0], S.S5[0] + 4.8, [[33.53, 44.62], [31.2, 42.2], [29.06, 41.09], [26.6, 40.2], [25.2, 39.2]], { draw: 1.9 });
const rTsu = route('Tsushima', S.S7[1] - 1.4, S.S8[1], [[131.9, 43.1], [131.0, 38.2], [129.5, 34.4]], { draw: 1.4 });
const rTsg = route('Tsugaru', S.S7[1] - 1.2, S.S8[1], [[131.9, 43.1], [136.2, 40.8], [140.7, 41.5]], { draw: 1.4 });
const rLaP = route('La Perouse', S.S7[1] - 1.0, S.S8[1], [[131.9, 43.1], [137.5, 45.2], [142.0, 45.8]], { draw: 1.4 });
const rGulf = route('North Atlantic Current', S.S9[1] + 0.2, S.S11[0],
  [[33.08, 68.97], [12, 67], [-8, 62], [-28, 52], [-50, 41], [-72, 31], [-90, 25]],
  { color: AMBER, w: 3.2, draw: 4.0 });
const rGiuk = route('To the Atlantic', S.S12[0] + 0.6, DUR, [[33.08, 68.97], [12, 68.4], [-8, 64.6], [-19, 62.6]], { draw: 1.6 });

/* ------------------------------------------------------------------ text */
const T = (name, at2, out, text, y, size, opts = {}) =>
  createLayer('text', at2, {
    name, out, fade: opts.fade ?? 0.45, text,
    x: staticTrack(opts.x ?? 0.5),
    y: staticTrack(y),
    size: staticTrack(size),
    color: opts.color ?? PAPER,
    weight: opts.weight ?? 700,
    align: 'center',
    letterSpacing: staticTrack(opts.ls ?? 2),
    anim: opts.anim ?? 'fade',
    background: opts.bg ?? false,
  });

const texts = [
  T('Area', S.S1[0] + 0.4, S.S2[0], '17,098,246 km²', 0.79, 40),
  T('Coast', at.s01b.start + 0.3, S.S2[0], '37,653 km', 0.845, 40),
  T('Fleets', S.S3[0] + 0.6, S.S4[0], '4 FLEETS', 0.155, 46, { ls: 6 }),
  T('Baltic width', S.S4[1] - 3.8, S.S5[0], '4 km', 0.79, 62, { color: SIGNAL }),
  T('Bosphorus width', S.S5[1] - 4.2, S.S6[0], '700 m', 0.79, 62, { color: SIGNAL }),
  T('Montreux', S.S6[0] + 1.0, S.S6[1], 'MONTREUX · 1936', 0.155, 40, { ls: 6, color: AMBER }),
  T('Straits', S.S7[1] - 4.7, S.S8[1], '3 STRAITS', 0.155, 46, { ls: 6 }),
  T('Latitude', S.S9[0] + 1.0, S.S10[0], '68.97° N', 0.79, 54, { color: PAPER }),
  T('One port', S.S11[0] + 0.6, S.S12[0], '1 PORT', 0.155, 46, { ls: 6, color: SIGNAL }),
  T('GIUK', S.S12[0] + 2.6, S.S13[0], 'GREENLAND · ICELAND · UK', 0.855, 22, { ls: 5, weight: 500 }),
  T('Four doors', S.S13[0] + 1.1, DUR, 'FOUR DOORS', 0.44, 78, { ls: 4, anim: 'slideUp' }),
  T('Source', 0, DUR, 'NATURAL EARTH · CIA WORLD FACTBOOK', 0.965, 15, { ls: 3, weight: 500, fade: 0.3 }),
];

/* ------------------------------------------------------------------ project */
const project = projectWith(
  [camera, russia, arctic, baltic, turkey, japan, giuk,
   rBaltic, rBlack, rTsu, rTsg, rLaP, rGulf, rGiuk,
   m1, m2, m3, m4, mMur, rm1, rm2, rm3, rm4, ...texts],
  { name: 'EP001 — The Four Doors', duration: DUR, fps: 30, width: 1080, height: 1920, basemap: 'dark', background: VOID },
);

writeFileSync(`${OUT}/ep001.geomotion.json`, JSON.stringify(project));
console.log('layers:', Object.keys(project.nodes).length, '· duration', project.duration, '· format', project.format);
