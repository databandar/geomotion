/**
 * DataBandar demo — "Half of Humanity" — builds the GeoMotion project.
 *
 * Applies the differentiation strategy directly: a dark globe signature open (proven free in
 * the globe-visual-styles skill), then a STRIP to a flat map for the actual content — because
 * this story's content is a world choropleth, which a globe reads poorly at this data density
 * (see docs/brand/databandar-differentiation.md's "don't put every video on a globe" note).
 *
 * Scene boundaries are placeholders until retimed from measured narration — see
 * tools/build-project.mjs's SCHEDULE constant, which tools/retime.mjs overwrites after
 * narration is generated. Run from anywhere; paths resolve relative to this file.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  cameraFromShots, createLayer, defaultTour, keyframe, projectWith, staticTrack, windowTrack,
} from '../../../../packages/document/src/index.ts';
import { createMapContext } from '../../../../packages/document/src/schema/index.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const OUT = fileURLToPath(new URL('..', import.meta.url)); // docs/brand/databandar-demo/

const world = JSON.parse(readFileSync(`${ROOT}/apps/studio/src/data/world-countries.json`, 'utf8'));
const density = JSON.parse(readFileSync(`${ROOT}/apps/studio/src/data/world-population-density.json`, 'utf8'));

const VOID = '#05070A';
const SIGNAL = '#22C55E'; // DataBandar green — distinct from GROUNDTRUTH's red, matches the existing IG palette's forest/land tones
const PAPER = '#F2F4F5';
const DIM = '#9AA5AF';

/*
 * The schedule. Placeholder scene lengths until tools/retime.mjs rewrites this file with
 * measured narration durations — see docs/brand/render/README.md's note on why this repo
 * retimes from real audio rather than a word-count estimate (every segment overran the
 * estimate on EP001's first pass).
 */
const scheduleFile = `${OUT}/schedule.json`;
const SCHEDULE = existsSync(scheduleFile)
  ? JSON.parse(readFileSync(scheduleFile, 'utf8'))
  : {
      at: {
        s01: { start: 0, end: 3.0 }, s02: { start: 3.4, end: 6.6 }, s03: { start: 7.2, end: 10.6 },
        s04: { start: 11.0, end: 14.4 }, s05: { start: 14.8, end: 18.8 }, s06: { start: 19.2, end: 23.2 },
        s07: { start: 23.6, end: 27.6 },
      },
      DUR: 32,
    };
const AT = SCHEDULE.at;
const DUR = SCHEDULE.DUR;
// Scene boundaries: each scene runs from its narration line's start to the next line's start,
// so a scene includes the gap after its own line — the same convention EP001 used.
const ids = Object.keys(AT);
const S = {};
for (let i = 0; i < ids.length; i++) {
  const cur = ids[i];
  const nextStart = i + 1 < ids.length ? AT[ids[i + 1]].start : DUR;
  S[cur] = [AT[cur].start, nextStart];
}

/* --------------------------------------------------------------- map contexts */
const globeCtx = createMapContext('Globe open');
globeCtx.basemap = 'dark';
globeCtx.projection = 'globe';

/*
 * One map context for the whole film, deliberately — not the STRIP-to-flat-map design this
 * script started with. Found by rendering it: GeoMotion resolves basemap/terrain/projection
 * reactively off the *editor's* live timecode, not off the explicit time a headless export
 * frame asks for, so a mid-timeline projection switch renders correctly in the editor but
 * silently fails to switch during export — camera and overlay content update correctly for
 * the requested frame, only the map's own projection does not. Real engine gap, filed rather
 * than patched under a content deadline; see docs/brand/databandar-demo/README.md and the
 * globe-visual-styles skill's note on it.
 *
 * Staying on one globe the whole way is not just a workaround, though — this story is
 * genuinely world-scale for its entire runtime (see databandar-differentiation.md's "don't put
 * every video on a globe" rule: the rule is about *regional* content, and every stop here,
 * including the country-level ones, is being read as a piece of a world pattern, not a local
 * story on its own).
 */

/* --------------------------------------------------------------------- camera */
const camera = cameraFromShots([
  keyframe(0, [95, 20], 1.15, { pitch: 0 }),
  keyframe(S.s01[1] - 0.6, [95, 20], 1.55, { pitch: 0 }),
  keyframe(S.s02[1], [95, 20], 1.55, { pitch: 0 }),       // hold through the claim
  keyframe(S.s03[0] + 0.3, [90, 20], 2.2, { pitch: 0 }),  // density reveal begins
  keyframe(S.s03[1], [90, 20], 2.2, { pitch: 0 }),
  keyframe(S.s04[0] + 0.2, [5.3, 52.1], 5.4, { pitch: 0 }),   // Netherlands
  keyframe(S.s04[1] - 0.6, [5.3, 52.1], 5.4, { pitch: 0 }),
  keyframe(S.s05[0] + 0.2, [79, 22], 4.0, { pitch: 0 }),      // India
  keyframe(S.s05[1] - 0.6, [79, 22], 4.0, { pitch: 0 }),
  keyframe(S.s06[0] + 0.2, [104, 35], 3.4, { pitch: 0 }),     // China
  keyframe(S.s06[1] - 0.6, [104, 35], 3.4, { pitch: 0 }),
  keyframe(S.s07[0] + 0.2, [90, 20], 2.0, { pitch: 0 }),      // pull back for the closing stat
  keyframe(DUR, [90, 20], 2.0, { pitch: 0 }),
]);

/* --------------------------------------------------------------- globe intro shape */
const globeLand = createLayer('shape', 0, {
  name: 'Globe landmass',
  geojson: JSON.stringify(world),
  fillColor: '#1B232D',
  fillOpacity: staticTrack(1),
  lineColor: SIGNAL,
  lineWidth: staticTrack(0.6),
  out: S.s02[1],
  fade: 0.5,
});

/* --------------------------------------------------------------- density choropleth */
const regions = createLayer('regions', S.s03[0], {
  name: 'Population density',
  geojson: JSON.stringify(world),
  nameKey: 'name',
  values: density.values,
  metric: density._metric,
  unit: density._unit,
  decimals: 0,
  // 'forest' runs light-to-dark like every ramp in the palette; flipped so density is bright
  // green against the dark basemap instead of vanishing into it at the high end — the same
  // fix the World Tour demo needed for its own dark-basemap choropleth.
  ramp: 'forest',
  flipRamp: true,
  autoDomain: false,
  min: 0,
  max: 300, // capped near p90 — density is as skewed as GDP was; see world-tour-demo.md's lesson
  tour: {
    ...defaultTour(),
    order: 'custom',
    customOrder: ['Bangladesh', 'Netherlands', 'India', 'China'],
    /*
     * The tour's own stop card runs on an internal clock — layer.in + cumulative dwell —
     * completely independent of the camera keyframes above. Left at a uniform `dwell`, that
     * clock drifted out of sync with the narration-driven camera almost immediately, and with
     * `outro: 0` the last stop's card does not auto-hide: `stopAt` clamps to the final index
     * forever past the tour's own end, so it kept showing "CHINA" over the closing text.
     * `stopDurations` makes each stop's card span exactly the scene window the camera and
     * narration already agree on — the two clocks stop being two clocks.
     */
    stopDurations: [S.s03[1] - S.s03[0], S.s04[1] - S.s04[0], S.s05[1] - S.s05[0], S.s06[1] - S.s06[0]],
    moveTime: 0.9,
    padding: 0.16,
    maxZoom: 5.5,
    intro: 0,
    introTrace: false,
    outro: 0,
    labelAll: false,
    labelSize: 16,
    driveCamera: false, // the hand-authored camera above already frames each stop
  },
  borderWidth: staticTrack(0.8),
  borderCasing: true,
  // Ends exactly where the tour's own stops end (China's scene), so the card and the
  // choropleth fade out together before the closing stat scene — not "persist forever."
  out: S.s06[1],
  fade: 0.5,
  legendTitle: `${density._metric} (${density._unit}) · capped at 300`,
});

/* ------------------------------------------------------------------------ text */
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
  T('Title', S.s01[0] + 0.3, S.s02[0], 'HALF OF HUMANITY', 0.44, 56, { ls: 4 }),
  T('Sub', S.s02[0] + 0.2, S.s02[1], 'stands on 13% of the land', 0.52, 26, { weight: 400, anim: 'slideUp' }),
  /*
   * No Bangladesh/Netherlands duplicate here: the built-in tour card already shows name,
   * value and rank for the stop on screen (checked by rendering — a hand-added "1,214/km²"
   * sat directly under the card's own identical number). Only added where the card can't
   * say it: India's cumulative share, and China's crossing point.
   */
  T('India stat', S.s05[0] + 0.6, S.s06[0], '18% of humanity · 2.3% of land', 0.79, 30, { color: SIGNAL }),
  T('China stat', S.s06[0] + 0.6, S.s07[0], 'crosses 50% at 13% of land', 0.79, 30, { color: SIGNAL }),
  T('Close big', S.s07[0] + 0.4, DUR, '50% POPULATION', 0.40, 58, { ls: 3 }),
  T('Close small', S.s07[0] + 0.9, DUR, '13% OF THE LAND', 0.475, 40, { ls: 3, color: SIGNAL }),
  /*
   * The fixed-corner marks the differentiation memo recommends — same place, same size, every
   * video. Both top-right: the built-in legend owns bottom-left, and a bottom-center mark
   * collided with it (checked by rendering). Kept to the "max 5 words on screen" rule from
   * HANDBOOK.md 1.8 — the longer methodology note lives in the written docs, not the frame —
   * and right-aligned text needs real margin: at this letter-spacing, measured text width runs
   * a little short of what actually draws, so a string sized to just fit the frame overflows it.
   */
  T('Source', 0, DUR, 'NATURAL EARTH · POP_EST', 0.045, 14,
    { ls: 1, weight: 500, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
  T('Mark', 0, DUR, 'DATABANDAR', 0.085, 16,
    { ls: 4, weight: 700, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
];

/* --------------------------------------------------------------------- project */
const project = projectWith(
  [camera, globeCtx, globeLand, regions, ...texts],
  {
    name: 'DataBandar — Half of Humanity', duration: DUR, fps: 30, width: 1080, height: 1920,
    basemap: 'dark', background: VOID,
    // One block, one context, the whole film — see the note above the camera keyframes.
    story: [{ id: 'b1', t: 0, d: DUR, nodes: [globeLand.id, regions.id], context: globeCtx.id }],
  },
);

writeFileSync(`${OUT}/project.geomotion.json`, JSON.stringify(project));
console.log('layers:', Object.keys(project.nodes).length, '· duration', project.duration, '· format', project.format);
