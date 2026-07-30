import type { CameraKeyframe, Layer, LayerType, LngLat, Project } from '../types';
import indiaStates from '../data/india-states-official.json';
import anemia from '../data/india-anemia-sample.json';
import indiaOutline from '../data/india-outline-official.json';

export const uid = () => Math.random().toString(36).slice(2, 10);

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
    id: uid(),
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

export function createLayer(type: LayerType, at: number, opts: Partial<Layer> = {}): Layer {
  const base = {
    id: uid(),
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
        sequenceReveal: true,
        cameraOvershoot: true,
        cameraBow: 0.35,
        borderCasing: true,
        dimOthers: 0.45,
        intro: 4,
        introTrace: true,
        outro: 5,
        labelAll: true,
        labelSize: 15,
        labelAt: -1,
        tour: true,
        order: 'valueDesc',
        customOrder: [],
        dwell: 2.2,
        stopDurations: [],
        moveTime: 0.9,
        driveCamera: true,
        padding: 0.22,
        maxZoom: 8,
        tourPitch: 0,
        countUp: true,
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

const SF: LngLat = [-122.4194, 37.7749];
const TOKYO: LngLat = [139.6917, 35.6895];

export function demoProject(): Project {
  const route = createLayer('route', 2.4, {
    name: 'SFO → HND',
    curve: 'arc',
    color: '#4cc2ff',
    width: 3.5,
    out: 15,
    drawStart: 3,
    drawEnd: 9.5,
    marker: { enabled: true, icon: 'plane', color: '#ffffff', size: 9, rotate: true },
  } as Partial<Layer>) as Extract<Layer, { type: 'route' }>;
  route.coords = [SF, TOKYO];

  const sf = createLayer('marker', 0, {
    name: 'San Francisco',
    label: 'San Francisco',
    color: '#ff5f56',
    out: 15,
    pulse: true,
  } as Partial<Layer>) as Extract<Layer, { type: 'marker' }>;
  sf.coord = SF;

  const tokyo = createLayer('marker', 9.2, {
    name: 'Tokyo',
    label: 'Tokyo',
    color: '#ffbd2e',
    out: 15,
    pulse: true,
  } as Partial<Layer>) as Extract<Layer, { type: 'marker' }>;
  tokyo.coord = TOKYO;

  const title = createLayer('text', 0.3, {
    name: 'Title',
    text: 'SAN FRANCISCO → TOKYO',
    size: 40,
    letterSpacing: 4,
    y: 0.13,
    out: 4.5,
  } as Partial<Layer>);

  const stat = createLayer('text', 5.2, {
    name: 'Distance',
    text: '8,270 km · 10h 45m',
    size: 26,
    weight: 500,
    y: 0.86,
    anim: 'fade',
    out: 9.2,
  } as Partial<Layer>);

  return {
    ...emptyProject(),
    name: 'Trans-Pacific',
    duration: 15,
    camera: [
      keyframe(0, SF, 9.5, { pitch: 50, bearing: -18 }),
      keyframe(3, SF, 3.4, { pitch: 0, bearing: 0 }),
      keyframe(6.5, [-172, 44], 2.1, { dip: 0.3 }),
      keyframe(9.8, TOKYO, 3.6),
      keyframe(13, TOKYO, 9.5, { pitch: 50, bearing: 22 }),
    ],
    layers: [route, sf, tokyo, title, stat],
  };
}

/* -------------------------------------------------- region tour template */

/**
 * India states + an anaemia metric. The geometry is Natural Earth (public
 * domain); the numbers are sample values, flagged as such in the caption layer
 * so an untouched export can't pass itself off as sourced data.
 */
export function indiaTourProject(): Project {
  const dwell = 2.2;
  const intro = 4.5;
  const outro = 6;
  const start = 2.6;
  const count = Object.keys(anemia.values).length;
  const tourEnd = start + intro + count * dwell;
  const duration = tourEnd + outro + 1.4;

  // Clouds open the film and part to reveal the country.
  const clouds = createLayer('clouds', 0, {
    name: 'Cloud cover',
    coverage: 1,
    scale: 1.25,
    speed: 16,
    direction: 65,
    out: start + intro * 0.6,
    fade: 0.8,
    dissipateStart: 1.8,
    dissipateEnd: 5.4,
  } as Partial<Layer>);

  // The country outline traces itself on before the states are broken out.
  const outline = createLayer('shape', 0.9, {
    name: 'India outline',
    geojson: JSON.stringify(indiaOutline),
    fillColor: '#4cc2ff',
    fillOpacity: 0.12,
    lineColor: '#7dd3fc',
    lineWidth: 3,
    traceOutline: true,
    out: start + intro + 1.2,
    fade: 0.8,
  } as Partial<Layer>);

  const regions = createLayer('regions', start, {
    name: 'Indian states',
    geojson: JSON.stringify(indiaStates),
    nameKey: 'name',
    values: anemia.values as Record<string, number>,
    metric: anemia._metric,
    unit: anemia._unit,
    decimals: 1,
    ramp: 'ember',
    order: 'valueDesc',
    dwell,
    moveTime: 0.9,
    padding: 0.24,
    intro,
    introTrace: true,
    outro,
    labelAll: true,
    labelSize: 15,
    // Imagery is busy, so the state borders need a bit more weight than they
    // would over a flat vector basemap.
    borderWidth: 1.2,
    borderCasing: true,
    out: duration,
    fade: 0.6,
    legendTitle: `${anemia._metric} (${anemia._unit})`,
  } as Partial<Layer>);

  const title = createLayer('text', 0.4, {
    name: 'Title',
    text: 'ANAEMIA IN INDIA',
    size: 54,
    letterSpacing: 5,
    y: 0.44,
    out: start + intro * 0.75,
    fade: 0.7,
  } as Partial<Layer>);

  const subtitle = createLayer('text', 1.1, {
    name: 'Subtitle',
    text: 'Women aged 15–49, by state',
    size: 24,
    weight: 400,
    y: 0.52,
    anim: 'fade',
    out: start + intro * 0.75,
    fade: 0.7,
  } as Partial<Layer>);

  const caption = createLayer('text', 0, {
    name: 'Data caption',
    text: 'Sample values — replace with your own source',
    size: 15,
    weight: 400,
    align: 'right',
    // Top-right: the legend owns the bottom-left and the burnt-in
    // attribution owns the bottom-right.
    x: 0.985,
    y: 0.06,
    anim: 'none',
    out: duration,
    fade: 0.4,
  } as Partial<Layer>);

  return {
    ...emptyProject(),
    name: 'Anaemia in India',
    duration,
    basemap: 'satellite-labels',
    // Straight down on India; the tour takes the camera from here.
    camera: [keyframe(0, [82.8, 22.6], 3.5, { pitch: 0 })],
    layers: [regions, outline, clouds, title, subtitle, caption],
  };
}

/* ------------------------------------------------------------ persistence */

const KEY = 'geomotion:project';

export function saveLocal(p: Project) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* quota — ignore, the user can still export a file */
  }
}

export function loadLocal(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    return migrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

/** Fill in anything a project file from an older build might be missing. */
export function migrate(input: unknown): Project {
  const p = { ...emptyProject(), ...(input as Project) };
  if (p.audio && (!p.audio.url || !Array.isArray(p.audio.cues))) delete p.audio;
  p.camera = (p.camera ?? []).map((k) => ({ ...keyframe(0, [0, 0], 1), ...k }));
  p.layers = (p.layers ?? []).map((l) => {
    const filled = { ...createLayer(l.type, l.in ?? 0), ...l } as Layer;
    if (filled.type === 'route') {
      filled.marker = { ...(createLayer('route', 0) as Extract<Layer, { type: 'route' }>).marker, ...filled.marker };
      filled.follow = { ...(createLayer('route', 0) as Extract<Layer, { type: 'route' }>).follow, ...filled.follow };
    }
    return filled;
  });
  return p;
}

export function downloadProject(p: Project) {
  const blob = new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${p.name.replace(/[^\w-]+/g, '_') || 'animation'}.geomotion.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
