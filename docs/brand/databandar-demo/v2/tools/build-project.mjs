/**
 * DataBandar v2 — "Half of Humanity" — the GeoMotion half of the film.
 *
 * Covers S01-S07 only. S00 (the Hyperframe density diagram) is a separate render, concatenated
 * ahead of this one at encode time — see ../v2/README.md. This project's own clock starts at
 * project-time 0 the instant the Hyperframe clip ends (schedule.json's `atGeo`), so every
 * timestamp below is already offset correctly.
 *
 * The structural fix from v1: one continuous camera path, no reset to an idle framing between
 * stops — see REDESIGN.md's storyboard for why.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cameraFromShots, createLayer, defaultTour, keyframe, projectWith, staticTrack, windowTrack,
} from '../../../../../packages/document/src/index.ts';
import { createMapContext } from '../../../../../packages/document/src/schema/index.ts';
import { createId } from '../../../../../packages/core/src/index.ts';

const ROOT = fileURLToPath(new URL('../../../../..', import.meta.url));
const OUT = fileURLToPath(new URL('..', import.meta.url)); // docs/brand/databandar-demo/v2/

const world = JSON.parse(readFileSync(`${ROOT}/apps/studio/src/data/world-countries.json`, 'utf8'));
const density = JSON.parse(readFileSync(`${ROOT}/apps/studio/src/data/world-population-density.json`, 'utf8'));

const VOID = '#05070A';
const SIGNAL = '#22C55E';
const PAPER = '#F2F4F5';
const DIM = '#9AA5AF';

const scheduleFile = `${OUT}/schedule.json`;
if (!existsSync(scheduleFile)) throw new Error('run tools/retime.mjs first');
const { atGeo: AT, geoDur: DUR } = JSON.parse(readFileSync(scheduleFile, 'utf8'));

/*
 * Every layer fades out over its own `fade` duration as it approaches `out` — including a
 * layer whose `out` is the project's own final frame, which means "ends at DUR" quietly
 * becomes "fades to black right as the video ends." Caught by checking the literal last frame
 * of an actual render, not by reading the layer list: the panel's one non-negotiable note was
 * a hard cut, and the closing text and the globe were both dissolving under it. EDGE sits
 * safely past the visible timeline so nothing has begun fading by the time playback stops.
 */
const EDGE = DUR + 3;

const ids = Object.keys(AT);
const S = {};
for (let i = 0; i < ids.length; i++) {
  const cur = ids[i];
  const nextStart = i + 1 < ids.length ? AT[ids[i + 1]].start : DUR;
  S[cur] = [AT[cur].start, nextStart];
}
writeFileSync(`${OUT}/scene-bounds.json`, JSON.stringify(S, null, 2));

const BANGLADESH = [90.35, 23.7];
const NETHERLANDS = [5.3, 52.1];
const INDIA = [79, 22];
const CHINA = [104, 35];

/* -------------------------------------------------------------------- map */
const ctx = createMapContext('World, no labels');
ctx.basemap = 'dark-clean';
ctx.projection = 'globe';

/* ---------------------------------------------------------------- camera */
/*
 * One path, S01 through S06, with exactly one reset — the pull-back into S07. No two stops
 * share a framing. Bangladesh and India get a pulse-marker landing; Netherlands is reached by
 * a comparison arc rather than a fresh push, so it never re-establishes from an idle pose.
 */
const camera = cameraFromShots([
  keyframe(S.s01[0], [95, 20], 1.55, { pitch: 0 }),              // S01 reveal — already push, not idle-tiny
  keyframe(S.s01[1] - 0.3, [95, 22], 2.0, { pitch: 0 }),
  keyframe(S.s02[1] - 0.2, [92, 22], 2.6, { pitch: 0 }),          // S02 continues toward Asia
  keyframe(S.s03[0] + 0.3, [...BANGLADESH], 6.3, { pitch: 0 }),   // S03 arrives at Bangladesh
  keyframe(S.s03[1] - 0.4, [...BANGLADESH], 6.3, { pitch: 0 }),
  keyframe(S.s04[0] + 0.3, [...NETHERLANDS], 4.6, { pitch: 0 }),  // S04 comparison arc to Netherlands
  keyframe(S.s04[1] - 0.4, [...NETHERLANDS], 4.6, { pitch: 0 }),
  keyframe(S.s05[0] + 0.3, [...INDIA], 3.9, { pitch: 0 }),        // S05 — India, a wider frame
  keyframe(S.s05[1] - 0.5, [...INDIA], 3.9, { pitch: 0 }),
  keyframe(S.s06[0] + 0.3, [...CHINA], 3.6, { pitch: 0 }),        // S06 — the crossing point
  keyframe(S.s06[1] - 0.5, [...CHINA], 3.6, { pitch: 0 }),
  keyframe(S.s07[0] + 0.2, [90, 18], 1.65, { pitch: 0 }),         // the single reset — the button
  keyframe(DUR, [90, 18], 1.65, { pitch: 0 }),
]);

/* ---------------------------------------------------------------- shapes */
const globeLand = createLayer('shape', S.s01[0], {
  name: 'Globe landmass',
  geojson: JSON.stringify(world),
  fillColor: '#1B232D',
  fillOpacity: staticTrack(1),
  lineColor: SIGNAL,
  lineWidth: staticTrack(0.7),
  traceOutline: true,
  out: EDGE,
  fade: 0.4,
});

/* The comparison arc, S03->S04: the one new GeoMotion element v2 adds. Drawn as Bangladesh's
   stop ends and the camera is already moving toward the Netherlands; faded as the Netherlands
   card settles, so the two stops read as connected rather than as two separate resets. */
const comparisonRoute = createLayer('route', S.s03[1] - 0.6, {
  name: 'Bangladesh <-> Netherlands',
  coords: [BANGLADESH, [55, 35], [30, 45], NETHERLANDS],
  curve: 'arc',
  color: SIGNAL,
  width: staticTrack(2.2),
  glow: true,
  progress: windowTrack(S.s03[1] - 0.5, S.s04[0] + 0.6, 'easeInOutCubic'),
  out: S.s04[1] - 0.3,
  fade: 0.4,
});

/* ---------------------------------------------------------------- markers */
const pulseMarker = (name, at, out, coord) =>
  createLayer('marker', at, {
    name, out, coord, fade: 0.3,
    color: SIGNAL, size: staticTrack(6),
    label: '', labelSize: staticTrack(0),
    behaviours: { ring: [{ id: createId(), type: 'pulse', enabled: true }] },
  });

const markers = [
  pulseMarker('Bangladesh pulse', S.s03[0] + 0.2, S.s03[1], BANGLADESH),
  pulseMarker('India pulse', S.s05[0] + 0.2, S.s05[1], INDIA),
];

/* ---------------------------------------------------------------- choropleth */
const regions = createLayer('regions', S.s03[0], {
  name: 'Population density',
  geojson: JSON.stringify(world),
  nameKey: 'name',
  values: density.values,
  metric: density._metric,
  unit: density._unit,
  decimals: 0,
  ramp: 'forest',
  flipRamp: true,
  autoDomain: false,
  min: 0,
  max: 300,
  tour: {
    ...defaultTour(),
    order: 'custom',
    customOrder: ['Bangladesh', 'Netherlands', 'India', 'China'],
    stopDurations: [S.s03[1] - S.s03[0], S.s04[1] - S.s04[0], S.s05[1] - S.s05[0], S.s06[1] - S.s06[0]],
    moveTime: 0.9,
    padding: 0.16,
    maxZoom: 5.5,
    intro: 0,
    introTrace: false,
    outro: 0,
    labelAll: false,
    labelSize: 16,
    driveCamera: false,
  },
  borderWidth: staticTrack(0.8),
  borderCasing: true,
  out: S.s06[1],
  fade: 0.5,
  legendTitle: `${density._metric} (${density._unit}) · capped at 300`,
});

/* ---------------------------------------------------------------- text */
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
  T('India stat', S.s05[0] + 0.6, S.s06[0], '18% of humanity · 2.3% of land', 0.79, 30, { color: SIGNAL }),
  T('China stat', S.s06[0] + 0.6, S.s07[0], 'crosses 50% at 13% of land', 0.79, 30, { color: SIGNAL }),
  // Closes the loop: the exact words the Hyperframe diagram opened with, now over the real map.
  T('Close big', S.s07[0] + 0.15, EDGE, '50% POPULATION', 0.40, 58, { ls: 3 }),
  T('Close small', S.s07[0] + 0.55, EDGE, '13% OF THE LAND', 0.475, 40, { ls: 3, color: SIGNAL }),
  T('Source', S.s01[0], EDGE, 'NATURAL EARTH · POP_EST', 0.045, 14,
    { ls: 1, weight: 500, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
  T('Mark', S.s01[0], EDGE, 'DATABANDAR', 0.085, 16,
    { ls: 4, weight: 700, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
];

/* ------------------------------------------------------------------------ project */
const project = projectWith(
  [camera, ctx, globeLand, comparisonRoute, ...markers, regions, ...texts],
  {
    name: 'DataBandar v2 — Half of Humanity (GeoMotion half)',
    duration: DUR, fps: 30, width: 1080, height: 1920, basemap: 'dark-clean', background: VOID,
    story: [{ id: 'b1', t: 0, d: DUR, nodes: [globeLand.id, comparisonRoute.id, ...markers.map((m) => m.id), regions.id], context: ctx.id }],
  },
);

writeFileSync(`${OUT}/project.geomotion.json`, JSON.stringify(project));
console.log('layers:', Object.keys(project.nodes).length, '· duration', project.duration, '· format', project.format);
