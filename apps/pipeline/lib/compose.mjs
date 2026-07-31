import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.resolve(HERE, '../../studio/src/data');

const uid = () => Math.random().toString(36).slice(2, 10);

const FORMATS = {
  landscape: { width: 1920, height: 1080 },
  short: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

const DATASETS = {
  'india-official': { states: 'india-states-official.json', outline: 'india-outline-official.json' },
  'india-natural-earth': { states: 'india-states.json', outline: 'india-outline.json' },
};

async function readJson(p) {
  return JSON.parse(await fs.readFile(p, 'utf8'));
}

/**
 * A script beat becomes a slice of the timeline whose length is its narration.
 * Everything downstream — camera, layers, subtitles — is derived from those
 * measured durations, so the visuals can never drift out of sync with the voice.
 */
/**
 * Resolve the value table and fill placeholders in the narration, before any of
 * it reaches the TTS engine. `{region}`, `{value}` and `{rank}` in a tour stop's
 * `say` or `onScreen` keep the spoken numbers tied to the data — change a value
 * and the voiceover follows, instead of quietly contradicting the map.
 */
/**
 * The beat kinds `compose` knows how to build.
 *
 * `hook` is real but undocumented — it is the short-format opener. Listed here so a
 * script using it is not rejected, and so this stays the single place the set is
 * written down.
 */
export const BEAT_KINDS = ['clouds', 'hook', 'outline', 'overview', 'tour', 'labels'];

/**
 * Reject a script that cannot produce what it is asking for, before anything is spent.
 *
 * A beat is looked up by `kind`, so a beat with a missing or misspelt one is simply
 * never found — and the composer went on to build a project without it and report
 * success at every step. A script whose beats all lacked `kind` produced a 13-second
 * video of an empty map with a credit line, after paying for speech synthesis, a
 * render and an encode. Nothing in the output said the story was missing; the only
 * hints were "1 layers" and `undefined` in the beat list.
 *
 * Called before narration rather than inside `compose`, because narration is the
 * expensive step and it runs first.
 */
export function validateScript(script) {
  const problems = [];
  const beats = script.beats;

  if (!Array.isArray(beats) || beats.length === 0) {
    problems.push('no beats: a script needs at least one, or it renders an empty map');
  } else {
    beats.forEach((beat, i) => {
      const at = `beat ${i + 1}`;
      if (!beat || typeof beat !== 'object') {
        problems.push(`${at}: not an object`);
        return;
      }
      if (!beat.kind) {
        problems.push(`${at}: no "kind" — one of ${BEAT_KINDS.join(', ')}`);
      } else if (!BEAT_KINDS.includes(beat.kind)) {
        problems.push(`${at}: unknown kind "${beat.kind}" — expected one of ${BEAT_KINDS.join(', ')}`);
      }
      if (beat.kind === 'tour' && !Array.isArray(beat.stops)) {
        problems.push(`${at}: a tour needs a "stops" array`);
      }
    });
  }

  if (problems.length) {
    throw new Error(`This script will not render what it describes:\n  - ${problems.join('\n  - ')}`);
  }
}

export async function prepareScript(script) {
  const resolved = await resolveValues(script.values);
  const { values, previous } = resolved;
  const ranked = Object.entries(values)
    .sort((a, b) => b[1] - a[1])
    .map(([name], i) => [name, i + 1]);
  const rank = new Map(ranked);
  const decimals = script.metric?.decimals ?? 1;

  const num = (n) => (n === undefined || n === null ? '—' : Number(n).toFixed(decimals));
  const signed = (n) => (n === undefined || n === null ? '—' : (n > 0 ? '+' : '') + Number(n).toFixed(decimals));

  const national = resolved.meta?.national;
  const nationalPrevious = resolved.meta?.nationalPrevious;
  const nationalDelta =
    national !== undefined && nationalPrevious !== undefined && national !== null && nationalPrevious !== null
      ? national - nationalPrevious
      : undefined;

  /**
   * A region-scoped beat resolves against that region; a whole-map beat (hook,
   * overview, ranking, labels) has no region, so the same placeholders resolve
   * against the national figure. Leaving them unfilled would mean the voice
   * literally reading out "{value}".
   */
  const fill = (text, region) => {
    if (!text) return text;
    const v = region ? values[region] : national;
    const prev = region ? previous[region] : nationalPrevious;
    const delta = region ? (v !== undefined && prev !== undefined ? v - prev : undefined) : nationalDelta;
    return text
      .replaceAll('{region}', region ?? 'India')
      .replaceAll('{value}', num(v))
      .replaceAll('{previous}', num(prev))
      .replaceAll('{delta}', signed(delta))
      .replaceAll('{national}', num(national))
      .replaceAll('{nationalPrevious}', num(nationalPrevious))
      .replaceAll('{nationalDelta}', signed(nationalDelta))
      .replaceAll('{rank}', region ? String(rank.get(region) ?? '—') : '—');
  };

  const missing = [];
  const unresolved = [];
  const check = (text, where) => {
    const left = String(text ?? '').match(/\{[a-zA-Z]+\}/g);
    if (left) unresolved.push(`${where}: ${[...new Set(left)].join(' ')}`);
    return text;
  };

  for (const beat of script.beats) {
    if (beat.kind === 'tour') {
      for (const stop of beat.stops) {
        if (!(stop.region in values)) missing.push(stop.region);
        stop.say = check(fill(stop.say, stop.region), `${stop.region} say`);
        stop.onScreen = check(fill(stop.onScreen, stop.region), `${stop.region} onScreen`);
      }
    } else {
      beat.say = check(fill(beat.say, null), `${beat.kind} say`);
      beat.onScreen = check(fill(beat.onScreen, null), `${beat.kind} onScreen`);
      beat.heading = check(fill(beat.heading, null), `${beat.kind} heading`);
    }
  }

  script.__values = values;
  script.__previous = previous;
  script.__meta = resolved.meta;
  return { script, values, missing, unresolved, meta: resolved.meta };
}

export async function compose(script, timings) {
  const format = FORMATS[script.format ?? 'landscape'];
  if (!format) throw new Error(`unknown format "${script.format}"`);
  const fps = script.fps ?? 30;

  const dataset = DATASETS[script.dataset ?? 'india-official'];
  if (!dataset) throw new Error(`unknown dataset "${script.dataset}"`);
  const states = await readJson(path.join(DATA, dataset.states));
  const outline = await readJson(path.join(DATA, dataset.outline));

  const values = script.__values ?? (await resolveValues(script.values)).values;
  const metric = script.metric ?? {};

  /* ---------------------------------------------------------- timeline map */

  const lead = script.leadIn ?? 0.35;
  const gap = script.beatGap ?? 0.35;
  const tail = script.tailOut ?? 1.2;

  let cursor = lead;
  const beats = [];
  for (const beat of script.beats) {
    if (beat.kind === 'tour') {
      const stops = beat.stops.map((stop) => {
        const dur = timings.get(stop.__key) ?? 2.2;
        const hold = Math.max(dur + (beat.stopPad ?? 0.45), beat.minStop ?? 1.6);
        return { ...stop, duration: hold, narration: dur };
      });
      const length = stops.reduce((a, s) => a + s.duration, 0);
      beats.push({ ...beat, start: cursor, length, stops });
      cursor += length + gap;
    } else {
      const dur = timings.get(beat.__key) ?? 3;
      const length = Math.max(dur + (beat.pad ?? 0.4), beat.minLength ?? 1.5);
      beats.push({ ...beat, start: cursor, length });
      cursor += length + gap;
    }
  }
  const duration = round(cursor - gap + tail);

  const find = (kind) => beats.find((b) => b.kind === kind);
  const tour = find('tour');
  const clouds = find('clouds');
  const hook = find('hook');
  const outlineBeat = find('outline');
  const overview = find('overview');
  const close = find('labels');
  const ranking = find('ranking');

  /* -------------------------------------------------------------- layers */

  const layers = [];
  const isShort = script.format === 'short';

  // The regions layer spans from wherever the map first needs to be coloured
  // through to the end, with its three beats mapped onto the script's.
  // A cold open shows the finished map immediately — the first second is where a
  // viewer decides to stay, so it should answer "what am I looking at", not play
  // a zoom-in over an empty basemap.
  const coldOpen = !!hook;
  const regionsIn = coldOpen ? 0 : round((outlineBeat ?? overview ?? tour)?.start ?? 0);
  const introLength = tour ? round(tour.start - regionsIn) : 4;

  if (tour) {
    layers.push({
      id: uid(),
      type: 'regions',
      name: 'States',
      visible: true,
      in: regionsIn,
      out: duration,
      fade: 0.5,
      geojson: JSON.stringify(states),
      nameKey: 'name',
      values,
      metric: metric.label ?? 'Value',
      unit: metric.unit ?? '',
      decimals: metric.decimals ?? 1,
      ramp: script.ramp ?? 'ember',
      flipRamp: script.flipRamp ?? null,
      autoDomain: script.domain ? false : true,
      min: script.domain?.[0] ?? 0,
      max: script.domain?.[1] ?? 100,
      fillOpacity: 0.82,
      noDataColor: '#4b5563',
      borderColor: '#ffffff',
      borderWidth: 1.2,
      highlightColor: '#ffffff',
      highlightWidth: isShort ? 4.5 : 3.5,
      traceBorder: true,
      // One nested behaviour, matching the document schema. This file is plain
      // .mjs with no type checking, so when these fields moved nothing here
      // complained — the flat keys were simply ignored and the tour silently fell
      // back to defaults. The render-signature harness is what caught it.
      tour: {
        enabled: true,
        order: 'custom',
        customOrder: tour.stops.map((s) => s.region),
        dwell: 2.2,
        stopDurations: tour.stops.map((s) => round(s.duration)),
        moveTime: script.flyTime ?? 0.85,
        driveCamera: true,
        padding: script.padding ?? (isShort ? 0.14 : 0.24),
        maxZoom: script.maxZoom ?? 8,
        pitch: script.pitch ?? 34,
        overshoot: script.cameraOvershoot !== false,
        bow: script.cameraBow ?? 0.35,
        sequenceReveal: script.sequenceReveal !== false,
        countUp: true,
        dimOthers: 0.45,
        intro: Math.max(0.5, introLength),
        introTrace: coldOpen ? false : true,
        outro: round(Math.max(0.5, duration - (tour ? tour.start + tour.length : duration))),
        labelAll: !!close?.labelAll,
        labelSize: isShort ? 20 : 15,
        labelAt: close ? round(close.start) : -1,
      },
      showCallout: true,
      calloutSize: isShort ? 130 : 100,
      showRank: true,
      showLegend: true,
      legendTitle: metric.legend ?? `${metric.label ?? ''}${metric.unit ? ` (${metric.unit})` : ''}`.trim(),
    });
  }

  if (outlineBeat) {
    layers.push({
      id: uid(),
      type: 'shape',
      name: 'India outline',
      visible: true,
      in: round(outlineBeat.start),
      out: round(outlineBeat.start + outlineBeat.length + 1.2),
      fade: 0.7,
      geojson: JSON.stringify(outline),
      fillColor: script.outlineFill ?? '#4cc2ff',
      fillOpacity: 0.12,
      lineColor: script.outlineColor ?? '#7dd3fc',
      lineWidth: isShort ? 4 : 3,
      traceOutline: true,
      extrude: false,
      extrudeHeight: 20000,
    });
  }

  if (clouds) {
    layers.push({
      id: uid(),
      type: 'clouds',
      name: 'Cloud cover',
      visible: true,
      in: 0,
      out: round(clouds.start + clouds.length + 1.0),
      fade: 0.8,
      coverage: 1,
      scale: isShort ? 0.9 : 1.25,
      speed: 16,
      direction: 65,
      color: '#eef3f8',
      opacity: 1,
      dissipate: true,
      dissipateStart: round(clouds.start + clouds.length * 0.35),
      dissipateEnd: round(clouds.start + clouds.length + 0.9),
    });
  }

  // Per-stop pictures. A stop can name a file explicitly, or drop one into
  // pipeline/assets/<slug>/<Region>.jpg and it gets picked up by name. Embedded
  // as data URLs so the project file stays self-contained and the headless
  // renderer needs no extra server.
  if (tour) {
    let t = tour.start;
    for (const stop of tour.stops) {
      const file = await findStopImage(script, stop);
      if (file) {
        const dataUrl = await toDataUrl(file);
        layers.push({
          id: uid(),
          type: 'image',
          name: `${stop.region} photo`,
          visible: true,
          in: round(t + (script.imageDelay ?? 0.5)),
          out: round(t + stop.duration),
          fade: 0.4,
          src: dataUrl,
          x: isShort ? 0.5 : 0.8,
          // Vertical: sits in the lower-middle band, clear of the callout card
          // above and the legend below. Landscape: parked on the right.
          y: isShort ? 0.66 : 0.68,
          width: isShort ? 0.55 : 0.24,
          anchor: 'center',
          opacity: 1,
          radius: 16,
          border: true,
          borderColor: 'rgba(255,255,255,0.85)',
          shadow: true,
          anim: 'kenBurns',
          caption: stop.caption ?? '',
        });
      }
      t += stop.duration;
    }
  }

  if (ranking) {
    const n = ranking.top ?? 5;
    const top = Object.entries(values)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([name, v], i) => `${i + 1}.  ${name}   ${v.toFixed(metric.decimals ?? 1)}${metric.unit ?? ''}`);
    layers.push({
      id: uid(),
      type: 'text',
      name: 'Ranking',
      visible: true,
      in: round(ranking.start),
      out: round(ranking.start + ranking.length),
      fade: 0.5,
      text: (ranking.heading ?? `TOP ${n}`) + '\n' + top.join('\n'),
      x: isShort ? 0.11 : 0.16,
      y: isShort ? 0.3 : 0.32,
      size: isShort ? 32 : 30,
      color: '#ffffff',
      weight: 600,
      // A leaderboard is a list: left-aligned so the ranks and names line up.
      align: 'left',
      background: true,
      backgroundColor: 'rgba(8,11,16,0.9)',
      letterSpacing: 0,
      anim: 'slideUp',
    });
  }

  // On-screen text, one layer per beat that asks for it.
  for (const beat of beats) {
    if (!beat.onScreen) continue;
    const big = beat.kind === 'clouds' || beat.kind === 'hook';
    layers.push({
      id: uid(),
      type: 'text',
      name: beat.id ?? beat.kind,
      visible: true,
      in: round(beat.start),
      out: round(beat.start + beat.length),
      fade: 0.55,
      text: beat.onScreen,
      x: 0.5,
      y: big ? (isShort ? 0.3 : 0.44) : isShort ? 0.14 : 0.12,
      size: big ? (isShort ? 62 : 54) : isShort ? 40 : 34,
      color: '#ffffff',
      weight: 700,
      align: 'center',
      background: !big,
      backgroundColor: 'rgba(10,13,18,0.72)',
      letterSpacing: big ? 4 : 0,
      anim: big ? 'slideUp' : 'fade',
    });
  }

  // Source credit, on for the whole video. Not optional: the tiles require
  // attribution and the data needs crediting.
  layers.push({
    id: uid(),
    type: 'text',
    name: 'Credit',
    visible: true,
    in: 0,
    out: duration,
    fade: 0.4,
    text: script.credit ?? '© OpenStreetMap contributors · Esri imagery',
    // Bottom-right: the legend owns the bottom-left, and the top is where the
    // basemap puts its own place names.
    x: 0.985,
    y: isShort ? 0.978 : 0.972,
    size: isShort ? 16 : 15,
    color: 'rgba(255,255,255,0.88)',
    weight: 400,
    align: 'right',
    // An opaque chip, not a wash. Drawn bare this collided with the basemap's own
    // place labels and became unreadable, and illegible attribution does not
    // satisfy the tile licence. A 45% scrim was not enough either: MapLibre draws
    // its labels into the GL canvas underneath, so they read straight through a
    // translucent panel and interleave with the credit's glyphs. Matches the
    // legend's own panel colour.
    background: true,
    backgroundColor: 'rgba(10,13,18,0.82)',
    letterSpacing: 0,
    anim: 'none',
  });

  const project = {
    version: 1,
    name: script.title ?? 'Untitled',
    duration,
    fps,
    width: format.width,
    height: format.height,
    basemap: script.basemap ?? 'satellite-labels',
    terrain: script.terrain !== false,
    terrainExaggeration: 1.4,
    background: '#0d1117',
    camera: [
      {
        id: uid(),
        t: 0,
        center: script.center ?? [82.8, 22.6],
        zoom: script.zoom ?? (isShort ? 3.9 : 3.5),
        bearing: 0,
        pitch: 0,
        easing: 'easeInOutCubic',
        dip: 0,
      },
    ],
    layers,
  };

  return { project, beats, duration };
}

/* ------------------------------------------------------------- subtitles */

export function buildSrt(beats) {
  const cues = [];
  for (const beat of beats) {
    if (beat.kind === 'tour') {
      let t = beat.start;
      for (const stop of beat.stops) {
        if (stop.say) cues.push({ start: t, end: t + Math.min(stop.narration, stop.duration), text: stop.say });
        t += stop.duration;
      }
    } else if (beat.say) {
      cues.push({ start: beat.start, end: beat.start + beat.length, text: beat.say });
    }
  }

  return cues
    .map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`)
    .join('\n');
}

function srtTime(t) {
  const ms = Math.round(t * 1000);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const rest = ms % 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(rest).padStart(3, '0')}`;
}
const pad = (n) => String(n).padStart(2, '0');

/* ----------------------------------------------------------------- utils */

async function resolveValues(spec) {
  if (!spec) return { values: {}, previous: {}, meta: {} };

  // Pull straight from the NFHS csv: { nfhs: "<indicator>", round: "total" }
  if (spec && typeof spec === 'object' && spec.nfhs) {
    const { loadNfhs, extract } = await import('./nfhs.mjs');
    const data = await loadNfhs(spec.csv);
    const e = extract(data, spec.nfhs, spec.round ?? 'total');
    return {
      values: e.values,
      previous: e.previous,
      meta: { national: e.national, nationalPrevious: e.nationalPrevious, indicator: e.indicator, missing: e.missing },
    };
  }

  if (typeof spec === 'object') return { values: spec, previous: {}, meta: {} };

  // A named preset or a path: either a bare {name: value} map or {values, previous}.
  const file = spec.includes('/') ? path.resolve(spec) : path.join(DATA, `${spec}.json`);
  try {
    const d = await readJson(file);
    return { values: d.values ?? d, previous: d.previous ?? {}, meta: d };
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
    // A mistyped preset used to surface as a bare ENOENT stack trace, which told
    // you nothing about what you could have written instead.
    const presets = (await fs.readdir(DATA))
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
    throw new Error(
      `unknown values preset "${spec}" (looked for ${file}).\n` +
        `Available presets: ${presets.join(', ')}\n` +
        `Or pass a path containing "/", an inline {region: value} map, or { nfhs: "<indicator>" }.`,
    );
  }
}

const round = (n) => Math.round(n * 1000) / 1000;

const IMAGE_EXT = ['.jpg', '.jpeg', '.png', '.webp'];
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

/** An explicit `image:` on the stop wins; otherwise look for it by region name. */
async function findStopImage(script, stop) {
  if (stop.image) {
    const p = path.resolve(stop.image);
    try {
      await fs.access(p);
      return p;
    } catch {
      console.warn(`    ! image not found for ${stop.region}: ${stop.image}`);
      return null;
    }
  }
  const dir = path.resolve(HERE, '../assets', script.slug ?? '');
  for (const ext of IMAGE_EXT) {
    const p = path.join(dir, stop.region + ext);
    try {
      await fs.access(p);
      return p;
    } catch {
      /* try the next extension */
    }
  }
  return null;
}

async function toDataUrl(file) {
  const buf = await fs.readFile(file);
  const mime = MIME[path.extname(file).toLowerCase()] ?? 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
}

/** Every line the script will narrate, in order, with a stable cache key. */
export function collectLines(script) {
  const lines = [];
  script.beats.forEach((beat, bi) => {
    if (beat.kind === 'tour') {
      beat.stops.forEach((stop, si) => {
        stop.__key = `b${bi}-s${si}`;
        if (stop.say) lines.push({ key: stop.__key, text: stop.say });
      });
    } else {
      beat.__key = `b${bi}`;
      if (beat.say) lines.push({ key: beat.__key, text: beat.say });
    }
  });
  return lines;
}

export { FORMATS, DATASETS };
