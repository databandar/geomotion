#!/usr/bin/env node
/**
 * Build the fertility short: compose from the beats script, then hand-author the
 * parts the composer has no vocabulary for.
 *
 *   node docs/brand/india-fertility/tools/build.mjs
 *   node apps/pipeline/render-project.mjs docs/brand/india-fertility/project.geomotion.json
 *
 * Why this exists rather than `video.mjs` alone: three things in this piece are not
 * expressible as beats. The map must stay *uncoloured* until the story earns the
 * reveal (the composer colours from frame one, or from the outline beat); the two
 * `aside` beats fly to other countries and show their flags, which no beat kind
 * builds; and the sound is placed against the picture, not generated with it.
 *
 * The split is deliberate: `compose()` still owns timing, narration and the tour, so
 * the voice is measured and the animation cut to it exactly as everywhere else. This
 * file only edits the composed document afterwards.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectLines, compose, buildSrt, prepareScript, validateScript } from '../../../../apps/pipeline/lib/compose.mjs';
import { lineAudio, buildVoiceTrack } from '../../../../apps/pipeline/lib/tts.mjs';
import { sfxCue } from '../../../../apps/pipeline/lib/sfx.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DIR = path.resolve(HERE, '..');
const REPO = path.resolve(HERE, '../../../..');
const APP = path.join(REPO, 'apps/pipeline');

const uid = () => Math.random().toString(36).slice(2, 10);
const round = (n) => Math.round(n * 1000) / 1000;

/* Editorial palette — cool ink on cool near-black, one accent.
 * Warm parchment fought the neon scale; type and map now share a colour temperature. */
const INK = '#eef4fb';
const MUTED = 'rgba(238,244,251,0.60)';
const ACCENT = '#ff4d7d';

const script = JSON.parse(await fs.readFile(path.join(DIR, 'fertility.json'), 'utf8'));
validateScript(script);

/* ------------------------------------------------------------ 1. narrate */

console.log('[1] narrating');
const { missing, unresolved } = await prepareScript(script);
if (missing.length) console.warn('    ! no value for:', [...new Set(missing)].join(', '));
if (unresolved?.length) console.warn('    ! UNRESOLVED PLACEHOLDERS:', unresolved.join(' | '));

const lines = collectLines(script);
const timings = new Map();
const clipFiles = new Map();
for (const line of lines) {
  const { file, duration } = await lineAudio({
    voiceRoot: path.join(APP, 'out/_voice'),
    slug: script.slug,
    key: line.key,
    text: line.text,
    voice: script.voice,
  });
  timings.set(line.key, duration);
  clipFiles.set(line.key, file);
}
console.log(`    ${lines.length} lines, ${[...timings.values()].reduce((a, b) => a + b, 0).toFixed(1)}s`);

/* ------------------------------------------------------------ 2. compose */

console.log('[2] composing');
const { project, beats, duration } = await compose(script, timings);
const at = (kind, id) => beats.find((b) => b.kind === kind && (id === undefined || b.id === id));
const clouds = at('clouds');
const korea = at('aside', 'korea');
const china = at('aside', 'china');
const outline = at('outline');
const overview = at('overview');
const urbanRural = at('aside', 'urbanrural');
const tour = at('tour');
const labels = at('labels');

const layer = (type, name) => project.layers.find((l) => l.type === type && (!name || l.name === name));
const regions = layer('regions');
const outlineShape = layer('shape');
const cloudLayer = layer('clouds');

/* ------------------------------------------- 3. hold the colour back */

/*
 * The reveal is the point of the piece, so nothing may be coloured before it.
 *
 * `compose` starts the regions layer at the outline beat (or at 0 on a cold open),
 * which puts a full choropleth on screen while the narration is still setting up the
 * question. Moving `in` to the overview beat also has to move `tour.intro`, which is
 * measured from the layer's own start — left alone, the intro would still be timed
 * from the old, earlier `in` and the tour would begin mid-sentence.
 */
regions.in = round(overview.start);
regions.tour.intro = round(Math.max(0.5, tour.start - regions.in));
regions.fade = 0.9;
regions.showLegend = false;
/*
 * Hairline neon borders, and fill well under opaque so the basemap's relief reads
 * through the colour. A neon scale at full opacity flattens into poster paint; at
 * ~0.7 it behaves like backlit glass, which is the whole point of using it.
 */
regions.borderColor = 'rgba(140,200,235,0.30)';
regions.borderWidth = 0.8;
regions.highlightColor = '#eaf6ff';
regions.fillOpacity = 0.7;
regions.noDataColor = 'rgba(60,64,72,0.35)';
/*
 * `pill`, not `plain`. The readout is drawn in ink over whatever the active region
 * is filled with, and the extremes of a neon scale are its palest colours — so the
 * two stops the piece builds to are exactly where ink-on-fill would be least
 * readable. The pill carries its own ground.
 */
regions.calloutStyle = 'pill';
regions.tour.labelSize = 19;
regions.tour.dimOthers = 0.55;

/* India's border, drawn as a line and nothing else. */
outlineShape.fillOpacity = 0;
outlineShape.lineColor = INK;
outlineShape.lineWidth = 2.6;
outlineShape.traceOutline = true;
outlineShape.in = round(outline.start - 0.6);
outlineShape.out = round(overview.start + 1.4);
outlineShape.fade = 0.6;

if (cloudLayer) {
  cloudLayer.color = '#dfe8f2';
  cloudLayer.speed = 11;
  cloudLayer.scale = 1.05;
}

/* ------------------------------------------- 4. the countries we compare to */

/*
 * Two stops outside India. The camera is free here only because the regions layer is
 * not on screen yet — a tour with `driveCamera` claims the camera on every frame its
 * layer is visible (evaluator/scene.ts), so these keyframes would be overridden if the
 * choropleth had already appeared.
 */
const INDIA = [82.8, 22.6];
project.camera = [
  { id: uid(), t: 0, center: INDIA, zoom: 3.5, bearing: 0, pitch: 0, easing: 'easeInOutCubic', dip: 0 },
  { id: uid(), t: round(clouds.start + clouds.length * 0.55), center: INDIA, zoom: 3.62, bearing: 0, pitch: 0, easing: 'easeInOutCubic', dip: 0 },
  { id: uid(), t: round(korea.start + 0.5), center: [127.9, 36.4], zoom: 5.1, bearing: 0, pitch: 0, easing: 'easeInOutCubic', dip: 0.7 },
  { id: uid(), t: round(korea.start + korea.length), center: [127.9, 36.4], zoom: 5.25, bearing: 0, pitch: 0, easing: 'easeInOutCubic', dip: 0 },
  { id: uid(), t: round(china.start + 0.7), center: [119.0, 33.5], zoom: 3.5, bearing: 0, pitch: 0, easing: 'easeInOutCubic', dip: 0.5 },
  { id: uid(), t: round(china.start + china.length), center: [119.0, 33.5], zoom: 3.6, bearing: 0, pitch: 0, easing: 'easeInOutCubic', dip: 0 },
  { id: uid(), t: round(outline.start + 0.9), center: INDIA, zoom: 3.62, bearing: 0, pitch: 0, easing: 'easeInOutCubic', dip: 0.8 },
  { id: uid(), t: round(overview.start), center: INDIA, zoom: 3.7, bearing: 0, pitch: 0, easing: 'easeInOutCubic', dip: 0 },
];

/*
 * Every layer this file adds, by id.
 *
 * The type pass below restyles the *composer's* text and must leave these alone. It
 * matched on layer name first, and `/label/` also matches the `labels` beat — so the
 * closing title silently kept the composer's centred chip while everything around it
 * moved to the masthead. Names are content; ids are identity.
 */
const handmade = new Set();
const add = (l) => {
  handmade.add(l.id);
  project.layers.push(l);
};

const flagCard = ({ file, name, value, x, y, width, from, to, delay = 0 }) => {
  const src = 'data:image/png;base64,' + flagData.get(file);
  add({
    id: uid(), type: 'image', name: `${name} flag`, visible: true,
    in: round(from + delay), out: round(to), fade: 0.45,
    src, x, y, width, anchor: 'center', opacity: 1, radius: 3,
    border: true, borderColor: 'rgba(244,236,224,0.75)', shadow: true,
    anim: 'fade', caption: '', bgTolerance: 0, bgFeather: 0,
  });
  add({
    id: uid(), type: 'text', name: `${name} value`, visible: true,
    in: round(from + delay + 0.18), out: round(to), fade: 0.4,
    text: value, x, y: round(y + 0.088), size: 78, color: INK, weight: 700,
    align: 'center', background: false, backgroundColor: 'rgba(0,0,0,0)',
    letterSpacing: -1, anim: 'pop', fontFamily: 'condensed',
  });
  add({
    id: uid(), type: 'text', name: `${name} label`, visible: true,
    in: round(from + delay + 0.18), out: round(to), fade: 0.4,
    text: name.toUpperCase(), x, y: round(y + 0.125), size: 20, color: MUTED, weight: 600,
    align: 'center', background: false, backgroundColor: 'rgba(0,0,0,0)',
    letterSpacing: 3, anim: 'fade', fontFamily: 'condensed',
  });
};

/*
 * The compared countries, drawn as shapes rather than left to the basemap.
 *
 * They were only ever flag cards floating over an unlit map — the viewer had to take
 * on trust which landmass was being talked about. Each one now lights up in the same
 * low-arm neon the choropleth uses for "below replacement", so the comparison and the
 * map that follows are speaking one colour language before India is ever coloured.
 */
const world = JSON.parse(await fs.readFile(path.join(REPO, 'apps/studio/src/data/world-countries.json'), 'utf8'));
const countryShape = (name) => {
  const f = world.features.find((x) => x.properties?.name === name);
  if (!f) throw new Error(`no country geometry for "${name}"`);
  return f;
};

const BELOW = '#ff5c8a'; // low arm of neon-divergent: below replacement

const highlightCountry = ({ country, from, to, delay = 0 }) => {
  add({
    id: uid(), type: 'shape', name: `${country} shape`, visible: true,
    in: round(from + delay), out: round(to), fade: 0.5,
    geojson: JSON.stringify(countryShape(country)),
    fillColor: BELOW, fillOpacity: 0.3,
    lineColor: BELOW, lineWidth: 2.4,
    traceOutline: true, extrude: false, extrudeHeight: 20000,
  });
};

const flagFiles = ['flag-skorea.png', 'flag-china.png', 'flag-japan.png'];
const flagData = new Map();
for (const f of flagFiles) {
  flagData.set(f, await fs.readFile(path.join(DIR, 'assets', f), 'base64'));
}

flagCard({ file: 'flag-skorea.png', name: 'South Korea', value: '0.75', x: 0.5, y: 0.30, width: 0.17, from: korea.start, to: korea.start + korea.length, delay: 0.55 });
flagCard({ file: 'flag-china.png', name: 'China', value: '1.0', x: 0.29, y: 0.30, width: 0.17, from: china.start, to: china.start + china.length, delay: 0.75 });
flagCard({ file: 'flag-japan.png', name: 'Japan', value: '1.2', x: 0.71, y: 0.30, width: 0.17, from: china.start, to: china.start + china.length, delay: 2.1 });

highlightCountry({ country: 'South Korea', from: korea.start, to: korea.start + korea.length, delay: 0.35 });
highlightCountry({ country: 'China', from: china.start, to: china.start + china.length, delay: 0.55 });
highlightCountry({ country: 'Japan', from: china.start, to: china.start + china.length, delay: 1.9 });

/*
 * Urban vs rural, the mechanism behind the national number.
 *
 * Sits over the revealed map rather than replacing it: the choropleth is already on
 * screen by this beat, so the tour owns the camera and these are overlays, not a shot.
 */
const bigStat = ({ value, label, x, from, to, delay, color }) => {
  add({
    id: uid(), type: 'text', name: `${label} stat`, visible: true,
    in: round(from + delay), out: round(to), fade: 0.45,
    // High in the frame: this beat plays over the revealed map, and at 0.30 the
    // numbers sat straight on top of the northern states.
    text: value, x, y: 0.155, size: 92, color, weight: 700,
    align: 'center', background: false, backgroundColor: 'rgba(0,0,0,0)',
    letterSpacing: -2, anim: 'pop', fontFamily: 'condensed',
  });
  add({
    id: uid(), type: 'text', name: `${label} stat label`, visible: true,
    in: round(from + delay + 0.15), out: round(to), fade: 0.45,
    text: label, x, y: 0.193, size: 21, color: MUTED, weight: 600,
    align: 'center', background: false, backgroundColor: 'rgba(0,0,0,0)',
    letterSpacing: 3, anim: 'fade', fontFamily: 'condensed',
  });
};

if (urbanRural) {
  const uEnd = urbanRural.start + urbanRural.length;
  bigStat({ value: '1.6', label: 'URBAN INDIA', x: 0.29, from: urbanRural.start, to: uEnd, delay: 0.5, color: '#ff5c8a' });
  bigStat({ value: '2.1', label: 'RURAL INDIA', x: 0.71, from: urbanRural.start, to: uEnd, delay: 1.9, color: INK });
}

/* The replacement-level line, stated once, while India's border draws. */
add({
  id: uid(), type: 'text', name: 'Replacement rule', visible: true,
  in: round(outline.start + 1.6), out: round(outline.start + outline.length + 0.3), fade: 0.5,
  text: '2.1', x: 0.5, y: 0.215, size: 96, color: ACCENT, weight: 700,
  align: 'center', background: false, backgroundColor: 'rgba(0,0,0,0)',
  letterSpacing: -2, anim: 'pop', fontFamily: 'condensed',
});
add({
  id: uid(), type: 'text', name: 'Replacement label', visible: true,
  in: round(outline.start + 1.75), out: round(outline.start + outline.length + 0.3), fade: 0.5,
  text: 'REPLACEMENT LEVEL', x: 0.5, y: 0.252, size: 20, color: MUTED, weight: 600,
  align: 'center', background: false, backgroundColor: 'rgba(0,0,0,0)',
  letterSpacing: 3, anim: 'fade', fontFamily: 'condensed',
});

/* ------------------------------------------- 5. editorial type */

/*
 * The composer's on-screen text is a white chip in the middle of the frame. This is a
 * masthead instead: rules and left-aligned type in the top margin, so the map is never
 * covered by its own caption.
 */
for (const l of project.layers) {
  if (l.type !== 'text') continue;
  if (l.name === 'Credit') {
    // Keeps its panel. The tile licence needs this legible, and MapLibre draws its
    // own place labels into the GL canvas underneath, so they read straight through
    // anything translucent — see the composer's own note on the same field.
    Object.assign(l, {
      size: 15, color: 'rgba(244,236,224,0.82)', background: true,
      backgroundColor: 'rgba(8,11,16,0.86)', x: 0.5, y: 0.972, align: 'center',
      weight: 400, letterSpacing: 0.5, fontFamily: 'condensed',
    });
    continue;
  }
  if (handmade.has(l.id)) continue;
  Object.assign(l, {
    x: 0.075, y: 0.088, align: 'left', color: INK, weight: 700,
    // 62 ran the opening headline off the right edge at 1080 wide; it is now set
    // over two lines, which wants a slightly smaller face anyway.
    size: l.name === 'clouds' ? 44 : 34,
    background: false, backgroundColor: 'rgba(0,0,0,0)',
    letterSpacing: l.name === 'clouds' ? 1 : 1.5,
    anim: 'slideUp',
    fontFamily: l.name === 'clouds' ? 'serif' : 'condensed',
  });
}

/* The accent rule above the masthead — the one piece of brand furniture. */
add({
  id: uid(), type: 'text', name: 'Rule', visible: true,
  in: 0, out: round(duration), fade: 0.5,
  text: '▬', x: 0.075, y: 0.049, size: 26, color: ACCENT, weight: 700,
  align: 'left', background: false, backgroundColor: 'rgba(0,0,0,0)',
  letterSpacing: 0, anim: 'fade', fontFamily: 'sans',
});

/* ------------------------------------------- 5b. hold the ending */

/*
 * Anything still on screen at the end is pushed *past* the end.
 *
 * Every layer fades over its own `fade` as it nears `out`, including one whose `out`
 * is exactly the project duration — which turns "the film ends here" into "the film
 * dissolves as it ends". The composer sets `out: duration` on the choropleth and the
 * credit, and the closing title ends with its own beat, 1.8s before the last frame,
 * so the final frame was a bare basemap with no headline at all. Only visible in the
 * rendered file; the layer list looks right either way.
 */
const HOLD = round(duration + 1.5);
for (const l of project.layers) {
  const isEnding = l.name === 'Credit' || l.name === 'Rule' || l.type === 'regions' || l.name === labels.id || l.name === 'labels';
  if (isEnding) l.out = HOLD;
}

/* ------------------------------------------- 6. sound */

const cues = [];
for (const [id, t, opts] of [
  ['hush', clouds.start + clouds.length * 0.45, { gain: 0.5 }],
  ['whoosh', korea.start + 0.35, { gain: 0.4 }],
  ['card-in', korea.start + 0.55, { gain: 0.45 }],
  ['whoosh', china.start + 0.55, { gain: 0.4 }],
  ['card-in', china.start + 0.75, { gain: 0.45 }],
  ['card-in', china.start + 2.1, { gain: 0.45 }],
  ['pluck', outline.start + 1.6, { gain: 0.4 }],
  ['rise', overview.start - 0.35, { gain: 0.38 }],
  ...(urbanRural ? [['card-in', urbanRural.start + 0.5, { gain: 0.42 }], ['card-in', urbanRural.start + 1.9, { gain: 0.42 }]] : []),
  ['tick', tour.start + 0.15, { gain: 0.35 }],
  ['tick', tour.start + tour.stops[0].duration + 0.15, { gain: 0.35 }],
  ['tick', tour.start + tour.stops[0].duration + tour.stops[1].duration + 0.15, { gain: 0.35 }],
  ['bong', labels.start + 0.2, { gain: 0.42 }],
]) {
  cues.push(await sfxCue(id, t, opts));
}

/* ------------------------------------------- 7. narration + write */

console.log('[3] voice track');
const clips = [];
const clipMeta = new Map();
for (const beat of beats) {
  if (beat.kind === 'tour') {
    let t = beat.start;
    for (const stop of beat.stops) {
      if (clipFiles.has(stop.__key)) {
        const file = clipFiles.get(stop.__key);
        clips.push({ file, start: t });
        clipMeta.set(file, { d: timings.get(stop.__key) ?? 0, text: stop.say ?? '' });
      }
      t += stop.duration;
    }
  } else if (clipFiles.has(beat.__key)) {
    const file = clipFiles.get(beat.__key);
    clips.push({ file, start: beat.start });
    clipMeta.set(file, { d: timings.get(beat.__key) ?? 0, text: beat.say ?? '' });
  }
}

const outDir = DIR;
const voice = path.join(outDir, 'voice.wav');
await buildVoiceTrack(clips, voice, duration);

project.audio = {
  file: voice,
  cues: [
    ...clips.map((c) => ({
      t: round(c.start), d: round(clipMeta.get(c.file).d),
      text: clipMeta.get(c.file).text, file: c.file,
    })),
    ...cues,
  ],
};

project.background = '#080b10';
project.name = script.title;

await fs.writeFile(path.join(outDir, 'project.geomotion.json'), JSON.stringify(project, null, 2));
await fs.writeFile(path.join(outDir, 'india-fertility.srt'), buildSrt(beats));

console.log(`[4] ${duration.toFixed(1)}s · ${project.layers.length} layers · ${cues.length} sfx`);
for (const b of beats) {
  console.log(`      ${b.start.toFixed(1).padStart(6)}s  ${b.kind === 'tour' ? `tour (${b.stops.length})` : (b.id ?? b.kind)}`);
}
console.log(`\nwrote ${path.join(outDir, 'project.geomotion.json')}`);
