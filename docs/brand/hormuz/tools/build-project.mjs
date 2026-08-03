/**
 * "One Strait, One-Quarter of the World's Oil" — Strait of Hormuz, cinematic edition.
 *
 * Every scene follows: Move → Arrive → Hold → Reveal → Pause → Continue.
 * Elements appear one at a time. Routes draw slowly like journeys.
 * Images integrate with Ken Burns and gentle parallax.
 * Statistics get space to breathe.
 *
 * Camera never moves during a reveal.
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

// Layers that should stay visible until the very end need their `out` past DUR.
const EDGE = DUR + 3;

/* ==================================================================== coordinates */
const HORMUZ        = [56.3, 26.5];
const GULF_OF_OMAN  = [58.5, 24.5];
const ARABIAN_SEA   = [65, 18];
const SOUTH_INDIA   = [76, 6];
const MALACCA       = [95, 3];
const SCS           = [112, 8];
// East of Taiwan, north of the Philippine archipelago — added after the new
// overWater land-crossing lint (checkProjectGeometry / lint-project.mjs) caught
// the smooth curve from SCS straight to OFF_JAPAN bowing across the
// Philippines. [95,3]/[112,8] (Malacca/the strait itself) still register as
// briefly touching Indonesia/Malaysia, same as Bab el-Mandeb does for Yemen —
// expected at an actual strait a few km wide, not a routing error.
const PHILIPPINE_SEA = [122, 23];
const OFF_JAPAN     = [140, 30];
const CAPE          = [18.4, -34.4];
const BAB_EL_MANDEB = [43.5, 12.7];
const RED_SEA_PORT  = [42, 19];

// Cape detour waypoints, each checked against the real coastline (a point-in-polygon
// test against apps/studio/src/data/world-countries.json) — the original list had two
// points placed inland ([48,5] inside Somalia, [30,-15] deep in Zambia), invisible
// under the old per-segment `arc` but a route drawn straight across a continent once
// `curve: 'smooth'` was reading the same list as one continuous curve.
const HORN_TIP       = [53, 12];     // off Cape Guardafui, clears the Horn of Africa
const SOMALI_COAST   = [50, 3];
const MOZ_CHANNEL    = [42, -15];    // between Madagascar and the mainland
const NATAL_COAST    = [34, -31];    // off Durban
const EASTERN_CAPE   = [24, -36];    // well clear of the Algoa Bay bulge
const AGULHAS_SOUTH  = [19.5, -36];  // south of Cape Agulhas, Africa's true southern tip

/* ==================================================================== map context */
const ctx = createMapContext('Hormuz');
ctx.basemap = 'dark-clean';
ctx.projection = 'mercator';

/* ==================================================================== camera choreography
 *
 * Every shot: Move → Arrive → Hold → (elements reveal during hold) → Pause → Continue.
 * The camera never moves while new information is appearing on screen.
 */
const camera = cameraFromShots([

  /* ── S01: Hook (0–7.55s). Wide Gulf. Slow arrival. ── */
  keyframe(0,               [56, 18], 2.3, { pitch: 0 }),
  keyframe(AT.s01.start + 2.5, [56, 20], 2.6, { pitch: 0 }),   // arrive
  keyframe(S.s01[1],        [56, 20], 2.6, { pitch: 0 }),       // hold through pause

  /* ── S02: Width reveal (7.55–16.63s). Push to strait. ── */
  keyframe(S.s02[0],        [56, 22], 3.2, { pitch: 0 }),       // begin move
  keyframe(S.s02[0] + 3.0,  [...HORMUZ], 7.5, { pitch: 0 }),    // arrive at strait
  keyframe(S.s02[1],        [...HORMUZ], 7.5, { pitch: 0 }),     // hold through reveal + pause

  /* ── S03: Transit collapse (16.63–25.25s). Tighten slightly. ── */
  keyframe(S.s03[0],        [56.5, 26.3], 8.5, { pitch: -10 }),  // begin move
  keyframe(S.s03[0] + 2.0,  [56.5, 26.3], 9.0, { pitch: -10 }), // arrive
  keyframe(S.s03[1],        [56.5, 26.3], 9.0, { pitch: -10 }),  // hold through reveal + pause

  /* ── S04: Price impact (25.25–33.8s). Pull back to regional view. ── */
  keyframe(S.s04[0],        [58, 24], 6.5, { pitch: 0 }),        // begin pull
  keyframe(S.s04[0] + 2.5,  [62, 22], 4.2, { pitch: 0 }),        // arrive at wide view
  keyframe(S.s04[1],        [62, 22], 4.2, { pitch: 0 }),         // hold

  /* ── S04b: Consumer countries (33.8–41.63s). Widen to Asia.
   * Wide enough that Japan (138°E) is actually on screen when its flag pops in
   * — the original [78,18]@2.5 arrival held India but cropped Japan and South
   * Korea off the right edge entirely, so two of the three flags this beat
   * exists for were popping in somewhere the camera couldn't see. ── */
  keyframe(S['s04b'][0],    [70, 22], 2.6, { pitch: 0 }),
  keyframe(S['s04b'][0] + 2.5, [94, 24], 1.85, { pitch: 0 }),
  keyframe(S['s04b'][1],    [94, 24], 1.85, { pitch: 0 }),

  /* ── S05: Detour (41.63–49.93s). Huge pullback to show Africa+Asia. ── */
  keyframe(S.s05[0],        [58, 10], 1.8, { pitch: 0 }),
  keyframe(S.s05[0] + 3.0,  [48, 0],  1.0, { pitch: 0 }),        // arrive — Africa + Asia in frame
  keyframe(S.s05[1],        [48, 0],  1.0, { pitch: 0 }),         // hold through reveal + long pause

  /* ── S06: Pipeline (49.93–58.6s). Return to strait. ── */
  keyframe(S.s06[0],        [52, 22], 4.5, { pitch: 0 }),
  keyframe(S.s06[0] + 2.5,  [...HORMUZ], 6.5, { pitch: 0 }),
  keyframe(S.s06[1],        [...HORMUZ], 6.5, { pitch: 0 }),

  /* ── S07: Close (58.6–67.05s). One smooth reset to wide. ── */
  keyframe(S.s07[0],        [56, 18], 2.8, { pitch: 0 }),
  keyframe(S.s07[0] + 2.0,  [60, 15], 1.8, { pitch: 5 }),
  keyframe(DUR,              [60, 15], 1.8, { pitch: 5 }),
]);

/* ==================================================================== base layers */
const globeLand = createLayer('shape', 0, {
  name: 'Globe landmass',
  geojson: JSON.stringify(world),
  fillColor: '#1B232D', fillOpacity: staticTrack(1),
  lineColor: SIGNAL, lineWidth: staticTrack(0.6),
  traceOutline: false, out: EDGE, fade: 0.4,
});
const gulfStates = createLayer('shape', S.s02[0] - 0.5, {   // lit just before the width reveal
  name: 'Gulf states',
  geojson: JSON.stringify(pick('Iran', 'Oman', 'United Arab Emirates', 'Saudi Arabia',
    'Qatar', 'Bahrain', 'Kuwait', 'Iraq')),
  fillColor: '#243040', fillOpacity: staticTrack(0.55),
  lineColor: SIGNAL, lineWidth: staticTrack(0.5),
  out: EDGE, fade: 0.5,
});
const consumers = createLayer('shape', S['s04b'][0], {
  name: 'Consumer countries',
  geojson: JSON.stringify(pick('Japan', 'India', 'South Korea', 'China',
    'Thailand', 'Singapore', 'Philippines')),
  fillColor: '#2A3A4A', fillOpacity: staticTrack(0.45),
  lineColor: AMBER, lineWidth: staticTrack(0.4),
  out: S['s04b'][1], fade: 0.6,
});

/* ==================================================================== routes
 * Each route draws slowly (2–3.5s) with smooth easing, then holds fully drawn.
 */
const route = (name, at, out, coords, opts = {}) =>
  createLayer('route', at, {
    name, out, coords,
    curve: opts.curve ?? 'geodesic',
    color: opts.color ?? SIGNAL,
    width: staticTrack(opts.w ?? 3),
    glow: true,
    lineStyle: opts.lineStyle ?? 'solid',
    animateDash: opts.animateDash ?? false,
    cometTail: opts.cometTail ?? false,
    overWater: opts.overWater ?? false,
    // Slow draw: 2.5–3.5 seconds, ease-in-out for journey feel
    progress: windowTrack(at + 0.15, at + (opts.draw ?? 3.0), 'easeInOutCubic'),
    fade: 0.4,
    marker: {
      enabled: true, icon: opts.icon ?? 'dot', iconEmoji: '',
      color: opts.color ?? SIGNAL, size: staticTrack(opts.markerSize ?? 6), rotate: true,
    },
  });

// Main route: triggers mid-s02, progresses slowly, stays forever. `smooth` flows
// through all seven waypoints instead of `geodesic`'s independent per-hop bows —
// it sits on screen for the rest of the video, so a single settled curve reads
// better than a chain of visible elbows once the camera pulls back far enough to
// see the whole thing at once. `dashed` + `animateDash` gives it a slow crawl — a
// shipping lane that keeps reading as *moving oil*, not a line that goes dead the
// instant it finishes drawing, which is what fifty static seconds looked like.
// (Tried `dotted` first — its dash is too short to survive animation cleanly at
// this width and read as a moving line rather than a slightly fuzzy solid one.)
const mainRoute = route('Hormuz→Asia', S.s02[0] + 3.5, EDGE,
  [HORMUZ, GULF_OF_OMAN, ARABIAN_SEA, SOUTH_INDIA, MALACCA, SCS, PHILIPPINE_SEA, OFF_JAPAN],
  { draw: 3.5, w: 3.5, curve: 'smooth', lineStyle: 'dashed', animateDash: true, icon: 'ship', markerSize: 11, overWater: true });

// Consumer flow: draws during s04b to show where the oil goes. A comet tail so
// the head visibly travels toward Japan/India/South Korea right as they're
// named, not just a line that's already sitting there.
const flowRoute = route('Asia flow', S['s04b'][0] + 2.0, S['s04b'][1],
  [HORMUZ, GULF_OF_OMAN, ARABIAN_SEA, SOUTH_INDIA, MALACCA, SCS, PHILIPPINE_SEA, OFF_JAPAN],
  { draw: 3.0, w: 4, color: AMBER, curve: 'smooth', cometTail: true, icon: 'ship', markerSize: 12, overWater: true });

// Detour: draws during s05, the long way around Africa. Same `smooth` fix as the
// main route — `arc` kinked at every one of its seven waypoints once the S05
// pullback shows the whole Africa+Asia span at once.
//
// Ends at CAPE, not past it: the original list had one more point, [15,-20],
// trailing north-east of the Cape — harmless under the old per-segment `arc`,
// but `smooth` is a single curve shaped by every neighbouring point, and a
// waypoint that doubles back after the route's actual destination pulled the
// curve into a visible loop right on top of the Cape marker.
//
// Follows the real coast, checked point by point — see the waypoint comment
// above. Every point from HORN_TIP on was verified offshore, and the actual
// smooth-curve output (not just the straight lines between control points) was
// checked too, since a spline can bow somewhere its own control points don't.
const detourRoute = route('Cape detour', S.s05[0] + 1.5, S.s05[1] + 0.3,
  [RED_SEA_PORT, BAB_EL_MANDEB, HORN_TIP, SOMALI_COAST, [42, -5], MOZ_CHANNEL, NATAL_COAST, EASTERN_CAPE, AGULHAS_SOUTH, CAPE],
  { draw: 3.5, w: 5, color: AMBER, curve: 'smooth', cometTail: true, icon: 'ship', markerSize: 12, overWater: true });

// Pipeline: infrastructure, not a route a ship sails — `rail`'s double line with
// tick marks is the cartographic mark for exactly that, and an oil-barrel head
// instead of a ship head, since nothing is "travelling" this one, oil is.
const pipelineRoute = route('Pipeline', S.s06[0] + 2.0, S.s06[1],
  [HORMUZ, RED_SEA_PORT],
  { draw: 2.0, w: 2.5, color: AMBER, curve: 'geodesic', lineStyle: 'rail', icon: 'oil', markerSize: 10 });

/* ==================================================================== markers */
// `port` (an anchor glyph) for every one of these: Hormuz, the Cape, and Bab
// el-Mandeb are all the same kind of thing in this story — a maritime waypoint
// being pointed at — so one consistent icon reads as "the same kind of marker,"
// where three different shapes would have implied three different meanings.
const pulseMarker = (name, at, out, coord, label, opts = {}) =>
  createLayer('marker', at, {
    name, out, coord, fade: 0.4,
    color: SIGNAL, size: staticTrack(7), icon: opts.icon ?? 'port', iconEmoji: '',
    label: label ?? '', labelSize: staticTrack(label ? 18 : 0), labelColor: PAPER,
    behaviours: { ring: [{ id: createId(), type: 'pulse', enabled: true }] },
  });
const markers = [
  pulseMarker('Hormuz', S.s02[0] + 1.0, S.s07[1] + 0.5, HORMUZ, 'STRAIT OF HORMUZ'),
  pulseMarker('Cape', S.s05[0] + 3.5, S.s05[1] + 0.3, CAPE, 'CAPE OF GOOD HOPE'),
  pulseMarker('Bab el-Mandeb', S.s05[0] + 4.0, S.s05[1], BAB_EL_MANDEB, 'BAB EL-MANDEB'),
];

/*
 * Country pop-ins for S04b — "Japan, India, South Korea" was a spoken list with
 * nothing on screen but text. A flag popping in at that country's own place on
 * the map, timed to the word, is what "a country is mentioned" should look like
 * on a map video — the marker's own default `pop` entrance (scale-overshoot) is
 * reused as-is, not a new animation, the same way a library sound is reused
 * rather than inventing a second system.
 *
 * Word timings inside S04b's 6.6s line are estimated by ear against the actual
 * audio (docs/brand/hormuz/vo/s04b.wav), not forced-aligned — close enough that
 * each flag lands with its word, which is what this is for.
 */
const flagMarker = (name, at, coord, emoji) =>
  createLayer('marker', at, {
    name, out: S['s04b'][1] + 0.4, coord, fade: 0.15,
    color: PAPER, size: staticTrack(20), icon: 'emoji', iconEmoji: emoji,
    label: '', labelSize: staticTrack(0), labelColor: PAPER,
    behaviours: { scale: [{ id: createId(), type: 'pop', enabled: true }], ring: [] },
  });
const countryFlags = [
  flagMarker('Flag Japan', S['s04b'][0] + 2.7, [138, 36.2], '🇯🇵'),
  flagMarker('Flag India', S['s04b'][0] + 3.25, [78, 22], '🇮🇳'),
  flagMarker('Flag South Korea', S['s04b'][0] + 3.8, [127.8, 36.5], '🇰🇷'),
];

/* ==================================================================== text overlays
 * Each text fades in at its own time — never two texts simultaneously.
 * Statistics use bigger sizes and SIGNAL green for emphasis.
 */
const T = (name, at, out, text, y, size, opts = {}) =>
  createLayer('text', at, {
    name, out, fade: opts.fade ?? 0.4, text,
    x: staticTrack(opts.x ?? 0.5), y: staticTrack(y),
    size: staticTrack(size),
    color: opts.color ?? PAPER, weight: opts.weight ?? 700,
    align: opts.align ?? 'center', letterSpacing: staticTrack(opts.ls ?? 2),
    anim: 'fade', background: opts.bg ?? false,
  });

const texts = [
  /* Persistent credits — always visible, small, unobtrusive */
  T('Source', 0, EDGE, 'UNCTAD · IEA · EIA · NATURAL EARTH', 0.045, 14,
    { ls: 1, weight: 500, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),
  T('Mark', 0, EDGE, 'DATABANDAR', 0.085, 16,
    { ls: 4, weight: 700, color: DIM, fade: 0.3, x: 0.93, align: 'right' }),

  /* ── S01: Hook ── */
  T('Title', S.s01[0] + 0.5, S.s01[1] - 0.3, 'ONE STRAIT, ONE-QUARTER', 0.135, 42, { ls: 3 }),
  T('Oil share', S.s01[0] + 3.0, S.s02[0] - 0.3, '~25% OF SEABORNE OIL · 20M BARRELS/DAY', 0.855, 24, { ls: 1, weight: 600 }),

  /* ── S02: Width reveal — arrive first, then reveal stat ── */
  T('Width', S.s02[0] + 1.2, S.s02[1] - 0.5, '33 km', 0.79, 76, { color: SIGNAL }),
  T('Width label', S.s02[0] + 3.5, S.s02[1] - 0.5, 'AT ITS NARROWEST', 0.855, 22, { ls: 4, weight: 500, color: DIM }),
  T('Lane label', S.s02[0] + 5.0, S.s02[1] - 0.5, 'SHIPPING LANES: 3 km EACH WAY', 0.92, 20, { ls: 2, weight: 400, color: DIM }),

  /* ── S03: Transit collapse ── */
  T('Before stat', S.s03[0] + 0.5, S.s04[0] - 0.3, '140 ships/day → 3', 0.79, 44, { color: AMBER }),
  T('Before label', S.s03[0] + 2.5, S.s04[0] - 0.3, 'FEB 27 → MAR 7, 2026', 0.855, 20, { ls: 3, weight: 500, color: DIM }),

  /* ── S04: Price impact ── */
  T('Oil price', S.s04[0] + 0.5, S['s04b'][0] - 0.3, 'OIL +27% · GAS +74%', 0.79, 38, { color: AMBER }),
  T('Price label', S.s04[0] + 2.5, S['s04b'][0] - 0.3, 'IN TWO WEEKS', 0.855, 20, { ls: 4, weight: 500, color: DIM }),

  /* ── S04b: Consumer countries ── */
  T('Depend label', S['s04b'][0] + 0.5, S.s05[0] - 0.3, '80% OF HORMUZ OIL GOES TO ASIA', 0.855, 20, { ls: 2, weight: 500, color: DIM }),
  T('Depend', S['s04b'][0] + 3.0, S.s05[0] - 0.3, 'JAPAN · INDIA · SOUTH KOREA', 0.79, 34, { color: SIGNAL }),

  /* ── S05: Detour ── */
  T('Detour stat', S.s05[0] + 2.5, S.s05[1] - 0.3, '+20 DAYS', 0.28, 64, { ls: 2, color: AMBER }),
  T('Detour label', S.s05[0] + 3.5, S.s05[1] - 0.3, 'THE LONG WAY — AROUND AFRICA', 0.375, 22, { ls: 3, weight: 500, color: DIM }),

  /* ── S06: Pipeline ── */
  T('Pipe stat', S.s06[0] + 1.0, S.s07[0] - 0.3, '3.5–5.5M BARRELS/DAY', 0.79, 34, { color: SIGNAL }),
  T('Pipe label', S.s06[0] + 3.0, S.s07[0] - 0.3, 'MAX PIPELINE CAPACITY — ONLY ~25% OF FLOW', 0.855, 20, { ls: 1, weight: 500, color: DIM }),

  /* ── S07: Close — wide pullback, two stats that breathe ── */
  T('Close big', S.s07[0] + 1.0, EDGE, '33 km WIDE', 0.28, 64, { ls: 2 }),
  T('Close small', S.s07[0] + 2.5, EDGE, "A QUARTER OF THE WORLD'S OIL AT SEA", 0.375, 24, { ls: 1, weight: 600, color: SIGNAL }),
];

/* ==================================================================== project */
const allNodes = [
  camera, ctx, globeLand, gulfStates, consumers,
  mainRoute, flowRoute, detourRoute, pipelineRoute,
  ...markers, ...countryFlags, ...texts,
];
const project = projectWith(allNodes, {
  name: 'Hormuz — tight', duration: DUR, fps: 30, width: 1080, height: 1920,
  basemap: 'dark-clean', background: VOID,
  story: [{
    id: 'b1', t: 0, d: DUR,
    nodes: [globeLand.id, gulfStates.id, consumers.id,
            mainRoute.id, flowRoute.id, detourRoute.id, pipelineRoute.id,
            ...markers.map(m => m.id), ...countryFlags.map(m => m.id)],
    context: ctx.id,
  }],
});
writeFileSync(`${OUT}/project.geomotion.json`, JSON.stringify(project));
console.log('layers:', Object.keys(project.nodes).length, '· dur', project.duration, 's · proj', ctx.projection);
console.log('Staggered reveal times:');
for (const beat of ['s01','s02','s03','s04','s04b','s05','s06','s07']) {
  const [t0, t1] = S[beat];
  console.log(`  ${beat}: ${t0.toFixed(1)}–${t1.toFixed(1)}  (${(t1-t0).toFixed(1)}s)`);
}