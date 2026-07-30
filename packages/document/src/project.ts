import { createId } from '@geomotion/core';
import type { CameraKeyframe, Layer, LayerType, LngLat, Project } from './types.ts';

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
