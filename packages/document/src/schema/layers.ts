/**
 * The seven layer types: what a fresh one holds, and how each property is edited.
 *
 * ENGINEERING_GUIDE §3.4 asks for one module per node type. They are gathered in one file
 * per *kind* of node instead — layers here, the group and camera beside it — because the
 * seven share a base (`in`/`out`/`fade`/`visible`) and a colour cursor, and seven files that
 * each import both would spread one small thing over the whole directory. The unit §3.4
 * cares about is the definition: each type's defaults and its property metadata sit together,
 * and nothing else in the codebase describes either.
 *
 * The values here are not neutral. They are what the demos were tuned with — a 0.4 s fade, a
 * 3.5 px route, a 0.82 fill — and changing one changes every project made afterwards.
 */
import { createId } from '@geomotion/core';
import { FIRST_ORDER } from '../order.ts';
import { staticTrack } from '../track.ts';
import { windowTrack } from '../window.ts';
import type { Layer, LayerType, RegionTour } from '../types.ts';
import type { NodeTypeDef, PropertyMeta } from './meta.ts';

/**
 * Layer accents, handed out in turn so two layers made in a row never come out the same
 * colour. A cursor rather than a random pick: random repeats, and the repeat is the case
 * that matters.
 */
const PALETTE = ['#ff5f56', '#ffbd2e', '#27c93f', '#4cc2ff', '#a78bfa', '#f472b6', '#fb923c', '#22d3ee'];
let colorCursor = 0;
const nextColor = () => PALETTE[colorCursor++ % PALETTE.length] as string;

/**
 * What every layer carries. `at` is where the playhead was when it was made.
 *
 * Exported as `layerBase` because the load repair needs it for a type it does not know: a
 * node from a newer build gets its shared fields filled and keeps everything else it came
 * with, rather than being converted into something this build does understand.
 */
export const layerBase = (at: number) => ({
  id: createId(),
  // Placed by `addNode`, which is the only code that computes an order key (nodes.ts).
  parentId: null,
  order: FIRST_ORDER,
  visible: true,
  in: Math.max(0, at),
  out: Math.max(0, at) + 6,
  fade: 0.4,
});

/**
 * Tour defaults, in one place so construction and migration agree.
 *
 * These are the values the demo was tuned with, not neutral ones: a 2.2 s dwell and a 0.9 s
 * move are what make a stop feel visited rather than flicked past.
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

/* ------------------------------------------------------------------ metadata */

/** The timing every layer has. Shared, so the seven cannot describe it differently. */
const TIMING: PropertyMeta[] = [
  { prop: 'in', label: 'In', section: 'Timing', row: { kind: 'number', min: 0, step: 0.1, precision: 2, unit: 's' } },
  { prop: 'out', label: 'Out', section: 'Timing', row: { kind: 'number', min: 0, step: 0.1, precision: 2, unit: 's' } },
  {
    prop: 'fade',
    label: 'Fade',
    section: 'Timing',
    help: 'Seconds of cross-fade at each end of the layer.',
    row: { kind: 'number', min: 0, max: 10, step: 0.1, precision: 2, unit: 's' },
  },
  // Edited from the layer panel's eye, which is where people look for it.
  { prop: 'visible', label: 'Visible', custom: true, row: { kind: 'toggle' } },
  { prop: 'name', label: 'Name', custom: true, row: { kind: 'text' } },
  { prop: 'locked', label: 'Locked', custom: true, row: { kind: 'toggle' } },
  { prop: 'id', label: 'Id', custom: true, row: { kind: 'text' } },
  { prop: 'type', label: 'Type', custom: true, row: { kind: 'text' } },
  { prop: 'parentId', label: 'Parent', custom: true, row: { kind: 'text' } },
  { prop: 'order', label: 'Order', custom: true, row: { kind: 'text' } },
];

export const routeType: NodeTypeDef = {
  type: 'route',
  kind: 'Line layer',
  create: (at) =>
    ({
      ...layerBase(at),
      type: 'route',
      name: 'Route',
      coords: [],
      curve: 'geodesic',
      color: nextColor(),
      width: 3.5,
      opacity: 1,
      dashed: false,
      glow: true,
      progress: windowTrack(Math.max(0, at), Math.max(0, at) + 4, 'easeInOutCubic'),
      marker: { enabled: true, icon: 'dot', color: '#ffffff', size: 6, rotate: true },
      follow: { enabled: false, zoom: 9, pitch: 55, faceHeading: true },
    }) as Layer,
  props: [
    // Points are placed on the map, not typed — the canvas is the editor for a coordinate.
    { prop: 'coords', label: 'Points', custom: true, row: { kind: 'text' } },
    {
      prop: 'curve',
      label: 'Curve',
      section: 'Shape',
      help: 'Geodesic follows the great circle; arc bows the line; straight is a rhumb line.',
      row: { kind: 'select', options: ['geodesic', 'straight', 'arc'] },
    },
    { prop: 'color', label: 'Colour', section: 'Style', row: { kind: 'color' } },
    { prop: 'width', label: 'Width', section: 'Style', row: { kind: 'number', min: 0.5, max: 20, step: 0.5, precision: 1, slider: true } },
    { prop: 'opacity', label: 'Opacity', section: 'Style', row: { kind: 'number', min: 0, max: 1, step: 0.01, precision: 2, slider: true } },
    { prop: 'dashed', label: 'Dashed', section: 'Style', row: { kind: 'toggle' } },
    { prop: 'glow', label: 'Glow', section: 'Style', row: { kind: 'toggle' } },
    {
      prop: 'progress',
      label: 'Drawn',
      section: 'Reveal',
      help: 'How much of the line is drawn, 0 to 1. Keyframe it to draw the route on.',
      row: { kind: 'track', min: 0, max: 1, step: 0.01, precision: 2 },
    },
    // Nested objects: one row each would flatten a structure the evaluator reads as a whole.
    { prop: 'marker', label: 'Travelling marker', custom: true, row: { kind: 'toggle' } },
    { prop: 'follow', label: 'Camera follow', custom: true, row: { kind: 'toggle' } },
    ...TIMING,
  ],
};

export const markerType: NodeTypeDef = {
  type: 'marker',
  kind: 'Point layer',
  create: (at) =>
    ({
      ...layerBase(at),
      type: 'marker',
      name: 'Marker',
      coord: [0, 0],
      color: nextColor(),
      size: staticTrack(8),
      label: 'Label',
      labelSize: 14,
      labelColor: '#ffffff',
      labelOffset: 16,
      halo: true,
      behaviours: {
        scale: [{ id: createId(), type: 'pop', enabled: true }],
        ring: [{ id: createId(), type: 'pulse', enabled: false }],
      },
    }) as Layer,
  props: [
    { prop: 'coord', label: 'Position', custom: true, row: { kind: 'text' } },
    { prop: 'color', label: 'Colour', section: 'Style', row: { kind: 'color' } },
    { prop: 'size', label: 'Size', section: 'Style', row: { kind: 'track', min: 2, max: 40, step: 0.5, precision: 1 } },
    { prop: 'label', label: 'Text', section: 'Label', row: { kind: 'text' } },
    { prop: 'labelSize', label: 'Size', section: 'Label', row: { kind: 'number', min: 8, max: 48, step: 1, precision: 0, slider: true } },
    { prop: 'labelColor', label: 'Colour', section: 'Label', row: { kind: 'color' } },
    {
      prop: 'labelOffset',
      label: 'Offset',
      section: 'Label',
      help: 'How far the label sits from the dot, in 1080p pixels.',
      row: { kind: 'number', min: 0, max: 60, step: 1, precision: 0, unit: 'px', slider: true },
    },
    { prop: 'halo', label: 'Halo', section: 'Label', help: 'A dark outline, so the label reads over imagery.', row: { kind: 'toggle' } },
    { prop: 'behaviours', label: 'Behaviours', custom: true, row: { kind: 'toggle' } },
    ...TIMING,
  ],
};

export const textType: NodeTypeDef = {
  type: 'text',
  kind: 'Text layer',
  create: (at) =>
    ({
      ...layerBase(at),
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
    }) as Layer,
  props: [
    { prop: 'text', label: 'Content', row: { kind: 'text', multiline: true } },
    {
      prop: 'x',
      label: 'X',
      section: 'Position',
      help: 'Fraction of the frame width, so a project reframes without moving its titles.',
      row: { kind: 'number', min: 0, max: 1, step: 0.01, precision: 3, slider: true },
    },
    { prop: 'y', label: 'Y', section: 'Position', row: { kind: 'number', min: 0, max: 1, step: 0.01, precision: 3, slider: true } },
    { prop: 'size', label: 'Size', section: 'Style', help: 'In 1080p pixels — scales with the output resolution.', row: { kind: 'number', min: 8, max: 160, step: 1, precision: 0, slider: true } },
    { prop: 'color', label: 'Colour', section: 'Style', row: { kind: 'color' } },
    { prop: 'weight', label: 'Weight', section: 'Style', row: { kind: 'select', options: ['300', '400', '500', '600', '700', '800', '900'] } },
    { prop: 'align', label: 'Align', section: 'Style', row: { kind: 'select', options: ['left', 'center', 'right'] } },
    { prop: 'letterSpacing', label: 'Tracking', section: 'Style', row: { kind: 'number', min: -4, max: 24, step: 0.5, precision: 1, slider: true } },
    { prop: 'background', label: 'Backing', section: 'Style', row: { kind: 'toggle' } },
    { prop: 'backgroundColor', label: 'Backing colour', section: 'Style', row: { kind: 'color' } },
    {
      prop: 'anim',
      label: 'Animation',
      section: 'Reveal',
      row: {
        kind: 'select',
        options: [
          { value: 'fade', label: 'Fade' },
          { value: 'slideUp', label: 'Slide up' },
          { value: 'typewriter', label: 'Typewriter' },
          { value: 'wipe', label: 'Wipe' },
          { value: 'none', label: 'None' },
        ],
      },
    },
    ...TIMING,
  ],
};

export const shapeType: NodeTypeDef = {
  type: 'shape',
  kind: 'Shape layer',
  create: (at) =>
    ({
      ...layerBase(at),
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
    }) as Layer,
  props: [
    { prop: 'geojson', label: 'GeoJSON', row: { kind: 'text', multiline: true, mono: true, placeholder: 'Paste a Feature, FeatureCollection or geometry' } },
    { prop: 'fillColor', label: 'Fill', section: 'Style', row: { kind: 'color' } },
    { prop: 'fillOpacity', label: 'Fill opacity', section: 'Style', row: { kind: 'number', min: 0, max: 1, step: 0.01, precision: 2, slider: true } },
    { prop: 'lineColor', label: 'Outline', section: 'Style', row: { kind: 'color' } },
    { prop: 'lineWidth', label: 'Outline width', section: 'Style', row: { kind: 'number', min: 0, max: 12, step: 0.5, precision: 1, slider: true } },
    { prop: 'traceOutline', label: 'Trace outline', section: 'Reveal', help: 'The outline draws on across the layer’s visible window.', row: { kind: 'toggle' } },
    { prop: 'extrude', label: 'Extrude 3D', section: '3D', row: { kind: 'toggle' } },
    { prop: 'extrudeHeight', label: 'Height', section: '3D', row: { kind: 'number', min: 0, max: 500000, step: 1000, precision: 0, unit: 'm' } },
    ...TIMING,
  ],
};

export const regionsType: NodeTypeDef = {
  type: 'regions',
  kind: 'Choropleth layer',
  create: (at) =>
    ({
      ...layerBase(at),
      type: 'regions',
      name: 'Regions',
      out: Math.max(0, at) + 30,
      geojson: '',
      nameKey: 'name',
      values: {},
      metric: 'Value',
      unit: '',
      decimals: 1,
      // A fixed default, so a project renders the same everywhere it is opened. Anyone
      // wanting lakh/crore grouping or a comma decimal picks their own.
      numberLocale: 'en-US',
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
    }) as Layer,
  props: [
    // The data half is an import flow, not a set of fields: boundaries, a join, and the
    // diagnostics that go with it (§05 Decision 02).
    { prop: 'geojson', label: 'Boundaries', custom: true, row: { kind: 'text' } },
    { prop: 'nameKey', label: 'Name property', custom: true, row: { kind: 'text' } },
    { prop: 'values', label: 'Values', custom: true, row: { kind: 'text' } },
    { prop: 'metric', label: 'Metric', section: 'Numbers', row: { kind: 'text' } },
    { prop: 'unit', label: 'Unit', section: 'Numbers', row: { kind: 'text' } },
    { prop: 'decimals', label: 'Decimals', section: 'Numbers', row: { kind: 'number', min: 0, max: 4, step: 1, precision: 0 } },
    {
      prop: 'numberLocale',
      label: 'Grouping',
      section: 'Numbers',
      help: 'How numbers are punctuated — a BCP 47 tag. Part of the document, so a project reads the same on every machine.',
      custom: true,
      row: { kind: 'text' },
    },
    { prop: 'ramp', label: 'Ramp', custom: true, section: 'Colour', row: { kind: 'text' } },
    { prop: 'flipRamp', label: 'Flip ramp', custom: true, section: 'Colour', row: { kind: 'toggle' } },
    { prop: 'autoDomain', label: 'Auto domain', section: 'Colour', row: { kind: 'toggle' } },
    { prop: 'min', label: 'Min', section: 'Colour', row: { kind: 'number', step: 1, precision: 2 } },
    { prop: 'max', label: 'Max', section: 'Colour', row: { kind: 'number', step: 1, precision: 2 } },
    { prop: 'fillOpacity', label: 'Fill opacity', section: 'Colour', row: { kind: 'number', min: 0, max: 1, step: 0.01, precision: 2, slider: true } },
    { prop: 'noDataColor', label: 'No data', section: 'Colour', row: { kind: 'color' } },
    { prop: 'borderColor', label: 'Border', section: 'Borders', row: { kind: 'color' } },
    { prop: 'borderWidth', label: 'Border width', section: 'Borders', row: { kind: 'number', min: 0, max: 6, step: 0.1, precision: 1 } },
    { prop: 'highlightColor', label: 'Highlight', section: 'Borders', row: { kind: 'color' } },
    { prop: 'highlightWidth', label: 'Highlight width', section: 'Borders', row: { kind: 'number', min: 0, max: 12, step: 0.5, precision: 1 } },
    { prop: 'traceBorder', label: 'Trace border', section: 'Borders', row: { kind: 'toggle' } },
    {
      prop: 'borderCasing',
      label: 'Casing',
      section: 'Borders',
      help: 'A dark line under the borders — the only way they read over satellite imagery.',
      row: { kind: 'toggle' },
    },
    { prop: 'showCallout', label: 'Callout', section: 'Readouts', row: { kind: 'toggle' } },
    { prop: 'calloutSize', label: 'Callout size', section: 'Readouts', row: { kind: 'number', min: 50, max: 200, step: 5, precision: 0, unit: '%' } },
    { prop: 'showRank', label: 'Rank', section: 'Readouts', row: { kind: 'toggle' } },
    { prop: 'showLegend', label: 'Legend', section: 'Readouts', row: { kind: 'toggle' } },
    { prop: 'legendTitle', label: 'Legend title', section: 'Readouts', row: { kind: 'text' } },
    // Twenty-one fields with their own panel, and on its way to being a behaviour (§06).
    { prop: 'tour', label: 'Tour', custom: true, row: { kind: 'toggle' } },
    ...TIMING,
  ],
};

export const cloudsType: NodeTypeDef = {
  type: 'clouds',
  kind: 'Cloud layer',
  create: (at) =>
    ({
      ...layerBase(at),
      type: 'clouds',
      name: 'Clouds',
      coverage: 0.85,
      scale: 1.15,
      speed: 14,
      direction: 75,
      color: '#eef3f8',
      opacity: 1,
      clear: windowTrack(Math.max(0, at) + 1.6, Math.max(0, at) + 4.6, 'easeInOutCubic'),
    }) as Layer,
  props: [
    { prop: 'coverage', label: 'Coverage', section: 'Style', row: { kind: 'number', min: 0, max: 1, step: 0.01, precision: 2, slider: true } },
    { prop: 'scale', label: 'Formation size', section: 'Style', help: 'Bigger means larger, softer formations.', row: { kind: 'number', min: 0.2, max: 4, step: 0.05, precision: 2, slider: true } },
    { prop: 'speed', label: 'Speed', section: 'Style', row: { kind: 'number', min: 0, max: 100, step: 1, precision: 0, unit: 'px/s', slider: true } },
    { prop: 'direction', label: 'Direction', section: 'Style', row: { kind: 'number', min: 0, max: 360, step: 1, precision: 0, unit: '°', slider: true } },
    { prop: 'color', label: 'Colour', section: 'Style', row: { kind: 'color' } },
    { prop: 'opacity', label: 'Opacity', section: 'Style', row: { kind: 'number', min: 0, max: 1, step: 0.01, precision: 2, slider: true } },
    {
      prop: 'clear',
      label: 'Cleared',
      section: 'Reveal',
      help: 'How far the cloud has parted outward from the centre, 0 to 1.',
      row: { kind: 'track', min: 0, max: 1, step: 0.01, precision: 2 },
    },
    ...TIMING,
  ],
};

export const imageType: NodeTypeDef = {
  type: 'image',
  kind: 'Image layer',
  create: (at) =>
    ({
      ...layerBase(at),
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
    }) as Layer,
  props: [
    // A file picker, not a text field.
    { prop: 'src', label: 'Source', custom: true, row: { kind: 'text' } },
    { prop: 'x', label: 'X', section: 'Position', row: { kind: 'number', min: 0, max: 1, step: 0.01, precision: 3, slider: true } },
    { prop: 'y', label: 'Y', section: 'Position', row: { kind: 'number', min: 0, max: 1, step: 0.01, precision: 3, slider: true } },
    { prop: 'width', label: 'Width', section: 'Position', help: 'Fraction of the frame width; height follows the image.', row: { kind: 'number', min: 0.02, max: 1, step: 0.01, precision: 3, slider: true } },
    {
      prop: 'anchor',
      label: 'Anchor',
      section: 'Position',
      row: { kind: 'select', options: ['center', 'topLeft', 'topRight', 'bottomLeft', 'bottomRight'] },
    },
    { prop: 'opacity', label: 'Opacity', section: 'Style', row: { kind: 'number', min: 0, max: 1, step: 0.01, precision: 2, slider: true } },
    { prop: 'radius', label: 'Corner radius', section: 'Style', row: { kind: 'number', min: 0, max: 60, step: 1, precision: 0, unit: 'px', slider: true } },
    { prop: 'border', label: 'Border', section: 'Style', row: { kind: 'toggle' } },
    { prop: 'borderColor', label: 'Border colour', section: 'Style', row: { kind: 'color' } },
    { prop: 'shadow', label: 'Shadow', section: 'Style', row: { kind: 'toggle' } },
    { prop: 'caption', label: 'Caption', section: 'Style', row: { kind: 'text' } },
    { prop: 'anim', label: 'Animation', section: 'Reveal', row: { kind: 'select', options: [{ value: 'kenBurns', label: 'Ken Burns' }, { value: 'fade', label: 'Fade' }, { value: 'slideUp', label: 'Slide up' }, { value: 'none', label: 'None' }] } },
    ...TIMING,
  ],
};

export const LAYER_TYPES: Record<LayerType, NodeTypeDef> = {
  route: routeType,
  marker: markerType,
  text: textType,
  shape: shapeType,
  regions: regionsType,
  clouds: cloudsType,
  image: imageType,
};
