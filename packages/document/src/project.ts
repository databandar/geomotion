import { createId } from '@geomotion/core';
import type { CameraKeyframe, Layer, LayerType, LngLat, Project, RegionOrder, RegionTour } from './types.ts';

/**
 * Construction and migration for document nodes.
 *
 * ENGINEERING_GUIDE §3.7: opening a document written by an older build must fill
 * gaps rather than reject the file, and every document change ships with a
 * round-trip test.
 *
 * Browser persistence (localStorage, file download) is deliberately NOT here —
 * §2 forbids this package from touching the DOM, so the app owns that. What lives
 * here is the pure part: what a new layer looks like, and what an old one is
 * missing.
 */

const PALETTE = [
  '#ff5f56',
  '#ffbd2e',
  '#27c93f',
  '#4cc2ff',
  '#a78bfa',
  '#f472b6',
  '#fb923c',
  '#22d3ee',
];

let colorCursor = 0;
const nextColor = () => PALETTE[colorCursor++ % PALETTE.length];

export function keyframe(t: number, center: LngLat, zoom: number, extra: Partial<CameraKeyframe> = {}): CameraKeyframe {
  return {
    id: createId(),
    t,
    center,
    zoom,
    bearing: 0,
    pitch: 0,
    easing: 'easeInOutCubic',
    dip: 0,
    ...extra,
  };
}

/**
 * Tour defaults, in one place so `createLayer` and `migrate` agree.
 *
 * These are the values the demo was tuned with, not neutral ones: a 2.2s dwell and
 * a 0.9s move are what make a stop feel visited rather than flicked past.
 */
export function defaultTour(): RegionTour {
  return {
    enabled: true,
    order: 'valueDesc',
    customOrder: [],
    dwell: 2.2,
    stopDurations: [],
    moveTime: 0.9,
    driveCamera: true,
    padding: 0.22,
    maxZoom: 8,
    pitch: 0,
    overshoot: true,
    bow: 0.35,
    sequenceReveal: true,
    countUp: true,
    dimOthers: 0.45,
    intro: 4,
    introTrace: true,
    outro: 5,
    labelAll: true,
    labelSize: 15,
    labelAt: -1,
  };
}

export function createLayer(type: LayerType, at: number, opts: Partial<Layer> = {}): Layer {
  const base = {
    id: createId(),
    visible: true,
    in: Math.max(0, at),
    out: Math.max(0, at) + 6,
    fade: 0.4,
  };

  switch (type) {
    case 'route':
      return {
        ...base,
        type: 'route',
        name: 'Route',
        coords: [],
        curve: 'geodesic',
        color: nextColor(),
        width: 3.5,
        opacity: 1,
        dashed: false,
        glow: true,
        drawStart: base.in,
        drawEnd: base.in + 4,
        drawEasing: 'easeInOutCubic',
        marker: { enabled: true, icon: 'dot', color: '#ffffff', size: 6, rotate: true },
        follow: { enabled: false, zoom: 9, pitch: 55, faceHeading: true },
        ...(opts as object),
      } as Layer;
    case 'marker':
      return {
        ...base,
        type: 'marker',
        name: 'Marker',
        coord: [0, 0],
        color: nextColor(),
        size: 8,
        label: 'Label',
        labelSize: 14,
        labelColor: '#ffffff',
        labelOffset: 16,
        halo: true,
        pulse: false,
        pop: true,
        ...(opts as object),
      } as Layer;
    case 'text':
      return {
        ...base,
        type: 'text',
        name: 'Text',
        text: 'Your title here',
        x: 0.5,
        y: 0.16,
        size: 44,
        color: '#ffffff',
        weight: 700,
        align: 'center',
        background: false,
        backgroundColor: '#000000aa',
        letterSpacing: 0,
        anim: 'slideUp',
        fade: 0.5,
        ...(opts as object),
      } as Layer;
    case 'shape':
      return {
        ...base,
        type: 'shape',
        name: 'Shape',
        geojson: '',
        fillColor: nextColor(),
        fillOpacity: 0.25,
        lineColor: '#ffffff',
        lineWidth: 2,
        traceOutline: false,
        extrude: false,
        extrudeHeight: 20000,
        ...(opts as object),
      } as Layer;
    case 'regions':
      return {
        ...base,
        type: 'regions',
        name: 'Regions',
        out: base.in + 30,
        geojson: '',
        nameKey: 'name',
        values: {},
        metric: 'Value',
        unit: '',
        decimals: 1,
        ramp: 'blue',
        flipRamp: null,
        autoDomain: true,
        min: 0,
        max: 100,
        fillOpacity: 0.82,
        noDataColor: '#4b5563',
        borderColor: '#ffffff',
        borderWidth: 0.6,
        highlightColor: '#ffffff',
        highlightWidth: 3.5,
        traceBorder: true,
        borderCasing: true,
        tour: defaultTour(),
        showCallout: true,
        calloutSize: 100,
        showRank: true,
        showLegend: true,
        legendTitle: '',
        ...(opts as object),
      } as Layer;
    case 'clouds':
      return {
        ...base,
        type: 'clouds',
        name: 'Clouds',
        coverage: 0.85,
        scale: 1.15,
        speed: 14,
        direction: 75,
        color: '#eef3f8',
        opacity: 1,
        dissipate: true,
        dissipateStart: base.in + 1.6,
        dissipateEnd: base.in + 4.6,
        ...(opts as object),
      } as Layer;
    case 'image':
      return {
        ...base,
        type: 'image',
        name: 'Image',
        src: '',
        x: 0.82,
        y: 0.22,
        width: 0.28,
        anchor: 'center',
        opacity: 1,
        radius: 14,
        border: true,
        borderColor: '#ffffff',
        shadow: true,
        anim: 'kenBurns',
        caption: '',
        ...(opts as object),
      } as Layer;
  }
}

export function emptyProject(): Project {
  return {
    version: 1,
    name: 'Untitled animation',
    duration: 12,
    fps: 30,
    width: 1920,
    height: 1080,
    basemap: 'dark',
    terrain: false,
    terrainExaggeration: 1.4,
    background: '#0d1117',
    camera: [keyframe(0, [0, 20], 1.8)],
    layers: [],
  };
}

/**
 * The flat tour fields a pre-M9 document carries, where `tour` was a boolean.
 *
 * Named rather than inlined so the old schema is legible: this is the contract the
 * importer honours, and deleting a line here silently drops a user's setting.
 */
interface LegacyRegions {
  tour?: boolean | RegionTour;
  order?: RegionOrder;
  customOrder?: string[];
  dwell?: number;
  stopDurations?: number[];
  moveTime?: number;
  driveCamera?: boolean;
  padding?: number;
  maxZoom?: number;
  tourPitch?: number;
  countUp?: boolean;
  sequenceReveal?: boolean;
  cameraOvershoot?: boolean;
  cameraBow?: number;
  dimOthers?: number;
  intro?: number;
  introTrace?: boolean;
  outro?: number;
  labelAll?: boolean;
  labelSize?: number;
  labelAt?: number;
}

/**
 * Lift a pre-M9 region layer's flat tour settings into the nested behaviour.
 *
 * A document written before the split has `tour: true` and twenty-one siblings;
 * one written after has `tour: { … }`. Both must open with every value the user
 * set intact — a migration that quietly resets someone's pacing to the defaults is
 * data loss that looks like a preference change.
 */
function migrateTour(legacy: LegacyRegions, current: RegionTour): RegionTour {
  // Already nested: fill any field a newer build added and leave the rest alone.
  if (legacy.tour && typeof legacy.tour === 'object') return { ...defaultTour(), ...legacy.tour };

  const pick = <T,>(value: T | undefined, fallback: T): T => (value === undefined ? fallback : value);
  // `current` came from spreading the legacy layer over a fresh one, so for a
  // pre-M9 document it is the old boolean, not a tour. `??` would keep it — it
  // guards null, not the wrong type — and every default would read as undefined.
  const d = current && typeof current === 'object' ? current : defaultTour();
  return {
    // `tour` was the on/off flag; absent means an even older document, and those
    // all toured — that was the only thing the layer did.
    enabled: legacy.tour === undefined ? d.enabled : legacy.tour === true,
    order: pick(legacy.order, d.order),
    customOrder: pick(legacy.customOrder, d.customOrder),
    dwell: pick(legacy.dwell, d.dwell),
    stopDurations: pick(legacy.stopDurations, d.stopDurations),
    moveTime: pick(legacy.moveTime, d.moveTime),
    driveCamera: pick(legacy.driveCamera, d.driveCamera),
    padding: pick(legacy.padding, d.padding),
    maxZoom: pick(legacy.maxZoom, d.maxZoom),
    // Renamed on the way in: the `tour`/`camera` prefixes were only there to
    // disambiguate names that are no longer siblings of anything.
    pitch: pick(legacy.tourPitch, d.pitch),
    overshoot: pick(legacy.cameraOvershoot, d.overshoot),
    bow: pick(legacy.cameraBow, d.bow),
    sequenceReveal: pick(legacy.sequenceReveal, d.sequenceReveal),
    countUp: pick(legacy.countUp, d.countUp),
    dimOthers: pick(legacy.dimOthers, d.dimOthers),
    intro: pick(legacy.intro, d.intro),
    introTrace: pick(legacy.introTrace, d.introTrace),
    outro: pick(legacy.outro, d.outro),
    labelAll: pick(legacy.labelAll, d.labelAll),
    labelSize: pick(legacy.labelSize, d.labelSize),
    labelAt: pick(legacy.labelAt, d.labelAt),
  };
}

export function migrate(input: unknown): Project {
  const p = { ...emptyProject(), ...(input as Project) };
  // Audio survives if there is anything to play or mux. Requiring `url` used to
  // drop the whole block, so a project rendered by the CLI — which has no server
  // to serve a URL from — lost its narration the moment it was opened.
  if (p.audio) {
    const cues = Array.isArray(p.audio.cues) ? p.audio.cues : null;
    const usable = !!cues && (!!p.audio.url || !!p.audio.file || cues.some((c) => c.file));
    if (!usable) delete p.audio;
    else {
      // Cues predate having identity; without an id they cannot be dragged or
      // deleted, and React would key them by array position.
      p.audio.cues = cues.map((c) => (c.id ? c : { ...c, id: createId() }));
    }
  }
  p.camera = (p.camera ?? []).map((k) => ({ ...keyframe(0, [0, 0], 1), ...k }));
  p.layers = (p.layers ?? []).map((l) => {
    const filled = { ...createLayer(l.type, l.in ?? 0), ...l } as Layer;
    if (filled.type === 'route') {
      filled.marker = { ...(createLayer('route', 0) as Extract<Layer, { type: 'route' }>).marker, ...filled.marker };
      filled.follow = { ...(createLayer('route', 0) as Extract<Layer, { type: 'route' }>).follow, ...filled.follow };
    }
    if (filled.type === 'regions') filled.tour = migrateTour(l as unknown as LegacyRegions, filled.tour);
    return filled;
  });
  return p;
}
