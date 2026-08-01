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
  { prop: 'locked', label: 'Locked', custom: true, optional: true, row: { kind: 'toggle' } },
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
      width: staticTrack(3.5),
      opacity: staticTrack(1),
      dashed: false,
      glow: true,
      progress: windowTrack(Math.max(0, at), Math.max(0, at) + 4, 'easeInOutCubic'),
      marker: { enabled: true, icon: 'dot', color: '#ffffff', size: staticTrack(6), rotate: true },
      follow: { enabled: false, zoom: staticTrack(9), pitch: staticTrack(55), faceHeading: true },
    }) as Layer,
  /*
   * The last two conversions needed grouped sub-objects, which is why `marker` and `follow`
   * were `custom` until now: a row addresses `marker.size` by path and writes the whole
   * object back around it, so the evaluator still reads the structure it expects.
   *
   * Drift corrected: the panel drew Shape/Colour/Width/Opacity/Glow/Dashed in one "Line
   * style" section rather than the separate "Shape" and "Style" headings declared here, and
   * scrubbed width in 0.1 steps not 0.5.
   */
  sections: {
    'Camera follow': 'While the route draws, the camera rides the leading point and ignores keyframes.',
  },
  props: [
    // Points are placed on the map, not typed — the canvas is the editor for a coordinate.
    { prop: 'coords', label: 'Points', section: 'Route', custom: true, row: { kind: 'text' } },
    {
      prop: 'curve',
      label: 'Shape',
      section: 'Line style',
      help: 'How the line is drawn between your points',
      row: { kind: 'select', options: [
        { value: 'geodesic', label: 'Geodesic (great circle)' },
        { value: 'arc', label: 'Arc (flight path)' },
        { value: 'straight', label: 'Straight' },
      ] },
    },
    { prop: 'color', label: 'Colour', section: 'Line style', row: { kind: 'color' } },
    { prop: 'width', label: 'Width', section: 'Line style', row: { kind: 'track', min: 0.5, max: 20, step: 0.1, precision: 1 } },
    { prop: 'opacity', label: 'Opacity', section: 'Line style', row: { kind: 'track', min: 0, max: 1, step: 0.01, precision: 2 } },
    { prop: 'glow', label: 'Glow', section: 'Line style', row: { kind: 'toggle' } },
    { prop: 'dashed', label: 'Dashed', section: 'Line style', row: { kind: 'toggle' } },
    {
      prop: 'progress',
      label: 'Reveal',
      section: 'Reveal',
      help: 'How much of the line is drawn, 0 to 1. Keyframe it to draw the route on.',
      row: { kind: 'window', maxFrom: 'duration' },
    },
    /*
     * `marker.icon` stays bespoke: picking "none" also clears `marker.enabled`, and a row
     * that writes one field cannot write two. The rest of the object is ordinary rows.
     */
    { prop: 'marker.icon', label: 'Icon', section: 'Travelling marker', custom: true, row: { kind: 'select', options: ['dot', 'plane', 'car', 'pin', 'none'] } },
    // Derived from the icon, never shown; it must carry the same section or it breaks the
    // run and the panel grows a second "Travelling marker" heading.
    { prop: 'marker.enabled', label: 'Marker on', section: 'Travelling marker', custom: true, row: { kind: 'toggle' } },
    { prop: 'marker.color', label: 'Colour', section: 'Travelling marker', row: { kind: 'color' } },
    { prop: 'marker.size', label: 'Size', section: 'Travelling marker', row: { kind: 'track', min: 2, max: 40, step: 0.5, precision: 1 } },
    { prop: 'marker.rotate', label: 'Face travel', section: 'Travelling marker', row: { kind: 'toggle' } },
    { prop: 'follow.enabled', label: 'Enabled', section: 'Camera follow', row: { kind: 'toggle' } },
    { prop: 'follow.zoom', label: 'Zoom', section: 'Camera follow', when: { prop: 'follow.enabled', equals: true }, row: { kind: 'track', min: 0, max: 20, step: 0.1, precision: 1 } },
    { prop: 'follow.pitch', label: 'Pitch', section: 'Camera follow', when: { prop: 'follow.enabled', equals: true }, row: { kind: 'track', min: 0, max: 85, step: 1, precision: 0 } },
    { prop: 'follow.faceHeading', label: 'Face heading', section: 'Camera follow', when: { prop: 'follow.enabled', equals: true }, row: { kind: 'toggle' } },
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
      labelSize: staticTrack(14),
      labelColor: '#ffffff',
      labelOffset: staticTrack(16),
      halo: true,
      behaviours: {
        scale: [{ id: createId(), type: 'pop', enabled: true }],
        ring: [{ id: createId(), type: 'pulse', enabled: false }],
      },
    }) as Layer,
  /*
   * Three more disagreements, one of them functional: the panel let a label sit **above**
   * the dot (offset -80 to 80) where this table floored it at 0, sized a label to 120px
   * where this said 48, and kept Halo with the marker's style rather than with its label.
   * A floor of 0 would have quietly removed a placement people had already used.
   */
  sections: { Behaviours: 'Rules applied over each property, in order.' },
  props: [
    // A [lng, lat] pair with "use map centre" and "go to" beside it — not two number rows.
    { prop: 'coord', label: 'Position', section: 'Marker', custom: true, row: { kind: 'text' } },
    { prop: 'color', label: 'Colour', section: 'Style', row: { kind: 'color' } },
    { prop: 'size', label: 'Size', section: 'Style', row: { kind: 'track', min: 2, max: 40, step: 0.5, precision: 1 } },
    { prop: 'halo', label: 'Halo', section: 'Style', help: 'A dark outline, so the label reads over imagery.', row: { kind: 'toggle' } },
    // The stack is a document sub-structure, listed and toggled in order (§06).
    { prop: 'behaviours', label: 'Behaviours', section: 'Behaviours', custom: true, row: { kind: 'toggle' } },
    { prop: 'label', label: 'Text', section: 'Label', row: { kind: 'text' } },
    { prop: 'labelSize', label: 'Size', section: 'Label', row: { kind: 'track', min: 8, max: 120, step: 1, precision: 0 } },
    { prop: 'labelColor', label: 'Colour', section: 'Label', row: { kind: 'color' } },
    {
      prop: 'labelOffset',
      label: 'Offset',
      section: 'Label',
      help: 'How far the label sits from the dot, in 1080p pixels.',
      row: { kind: 'track', min: -80, max: 80, step: 1, precision: 0, unit: 'px' },
    },
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
      x: staticTrack(0.5),
      y: staticTrack(0.16),
      size: staticTrack(44),
      color: '#ffffff',
      weight: 700,
      align: 'center',
      background: false,
      backgroundColor: '#000000aa',
      letterSpacing: staticTrack(0),
      anim: 'slideUp',
      fade: 0.5,
    }) as Layer,
  /*
   * Sections, order and steps below are the shipped panel's. Four rows disagreed with what
   * this table declared: `x`/`y` scrubbed in 0.001 steps not 0.01, `anim` sat with the
   * content rather than under a "Reveal" heading that never appeared, and Style's order was
   * Size · Weight · Colour · Tracking · Align, not the order listed here.
   */
  sections: { Text: 'Drag the text directly on the canvas to reposition it.' },
  props: [
    { prop: 'text', label: 'Content', section: 'Text', row: { kind: 'text', multiline: true } },
    {
      prop: 'anim',
      label: 'Animation',
      section: 'Text',
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
    { prop: 'size', label: 'Size', section: 'Style', help: 'In 1080p pixels — scales automatically with the output resolution', row: { kind: 'track', min: 8, max: 160, step: 1, precision: 0 } },
    // Stored as a number; the panel wrote parseInt on the way out and so must the generator.
    { prop: 'weight', label: 'Weight', section: 'Style', row: { kind: 'select', numeric: true, options: ['300', '400', '500', '600', '700', '800', '900'] } },
    { prop: 'color', label: 'Colour', section: 'Style', row: { kind: 'color' } },
    { prop: 'letterSpacing', label: 'Tracking', section: 'Style', row: { kind: 'track', min: -4, max: 24, step: 0.5, precision: 1 } },
    { prop: 'align', label: 'Align', section: 'Style', row: { kind: 'select', options: ['left', 'center', 'right'] } },
    { prop: 'background', label: 'Backing', section: 'Style', row: { kind: 'toggle' } },
    { prop: 'backgroundColor', label: 'Backing colour', section: 'Style', when: { prop: 'background', equals: true }, row: { kind: 'color' } },
    {
      prop: 'x',
      label: 'X',
      section: 'Position',
      help: 'Fraction of the frame width, so a project reframes without moving its titles.',
      row: { kind: 'track', min: 0, max: 1, step: 0.001, precision: 3 },
    },
    { prop: 'y', label: 'Y', section: 'Position', row: { kind: 'track', min: 0, max: 1, step: 0.001, precision: 3 } },
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
      fillOpacity: staticTrack(0.25),
      lineColor: '#ffffff',
      lineWidth: staticTrack(2),
      traceOutline: false,
      extrude: false,
      extrudeHeight: staticTrack(20000),
    }) as Layer,
  /*
   * The shipped panel put trace, extrude and height under Style rather than under "Reveal"
   * and "3D" headings that never existed, allowed a 16px outline where this table said 12,
   * and hid Height until Extrude was on. All four corrected here.
   */
  sections: { GeoJSON: 'Paste a Feature, FeatureCollection or bare geometry — polygons, lines, anything.' },
  props: [
    // A textarea with a file loader beside it, drawn full-width without a field label.
    { prop: 'geojson', label: 'GeoJSON', section: 'GeoJSON', custom: true, row: { kind: 'text', multiline: true, mono: true } },
    { prop: 'fillColor', label: 'Fill', section: 'Style', row: { kind: 'color' } },
    { prop: 'fillOpacity', label: 'Fill opacity', section: 'Style', row: { kind: 'track', min: 0, max: 1, step: 0.01, precision: 2 } },
    { prop: 'lineColor', label: 'Outline', section: 'Style', row: { kind: 'color' } },
    { prop: 'lineWidth', label: 'Outline width', section: 'Style', row: { kind: 'track', min: 0, max: 16, step: 0.5, precision: 1 } },
    { prop: 'traceOutline', label: 'Trace outline', section: 'Style', help: 'Draw the outline on over the first 2 seconds', row: { kind: 'toggle' } },
    { prop: 'extrude', label: 'Extrude 3D', section: 'Style', row: { kind: 'toggle' } },
    { prop: 'extrudeHeight', label: 'Height', section: 'Style', when: { prop: 'extrude', equals: true }, row: { kind: 'track', min: 0, max: 500000, step: 1000, precision: 0, unit: 'm' } },
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
      fillOpacity: staticTrack(0.82),
      noDataColor: '#4b5563',
      borderColor: '#ffffff',
      borderWidth: staticTrack(0.6),
      highlightColor: '#ffffff',
      highlightWidth: staticTrack(3.5),
      traceBorder: true,
      borderCasing: true,
      tour: defaultTour(),
      calloutStyle: 'card',
      calloutSize: staticTrack(100),
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
    { prop: 'fillOpacity', label: 'Fill opacity', section: 'Colour', row: { kind: 'track', min: 0, max: 1, step: 0.01, precision: 2 } },
    { prop: 'noDataColor', label: 'No data', section: 'Colour', row: { kind: 'color' } },
    { prop: 'borderColor', label: 'Border', section: 'Borders', row: { kind: 'color' } },
    { prop: 'borderWidth', label: 'Border width', section: 'Borders', row: { kind: 'track', min: 0, max: 6, step: 0.1, precision: 1 } },
    { prop: 'highlightColor', label: 'Highlight', section: 'Borders', row: { kind: 'color' } },
    { prop: 'highlightWidth', label: 'Highlight width', section: 'Borders', row: { kind: 'track', min: 0, max: 12, step: 0.5, precision: 1 } },
    { prop: 'traceBorder', label: 'Trace border', section: 'Borders', row: { kind: 'toggle' } },
    {
      prop: 'borderCasing',
      label: 'Casing',
      section: 'Borders',
      help: 'A dark line under the borders — the only way they read over satellite imagery.',
      row: { kind: 'toggle' },
    },
    {
      prop: 'calloutStyle',
      label: 'Readout',
      section: 'Readouts',
      help: 'How the active region’s value is shown. “Just the number” drops the panel.',
      row: {
        kind: 'select',
        options: [
          { value: 'card', label: 'Card' },
          { value: 'plain', label: 'Just the number' },
          { value: 'pill', label: 'Pill' },
          { value: 'none', label: 'None' },
        ],
      },
    },
    { prop: 'calloutSize', label: 'Callout size', section: 'Readouts', row: { kind: 'track', min: 50, max: 200, step: 5, precision: 0, unit: '%' } },
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
      coverage: staticTrack(0.85),
      scale: staticTrack(1.15),
      speed: staticTrack(14),
      direction: staticTrack(75),
      color: '#eef3f8',
      opacity: staticTrack(1),
      clear: windowTrack(Math.max(0, at) + 1.6, Math.max(0, at) + 4.6, 'easeInOutCubic'),
    }) as Layer,
  /*
   * Ranges below are the ones the hand-written panel shipped, not the ones this table used
   * to declare. Four disagreed (coverage 1 vs 1.4, scale 0.2–4 vs 0.3–3, speed 100 vs 120,
   * and `clear` described as a plain track when the panel drew a window). The panel is what
   * users have been scrubbing and what existing projects were authored against, so the panel
   * wins and this table is corrected — see docs/features/generated-panels.md.
   */
  sections: {
    Clouds: 'Drifting cover for an opening shot. Sits over the map, under your titles.',
    Clearing: 'The cloud parts from the centre outward to reveal the map.',
  },
  props: [
    { prop: 'coverage', label: 'Coverage', section: 'Clouds', row: { kind: 'track', min: 0, max: 1.4, step: 0.01, precision: 2 } },
    { prop: 'scale', label: 'Formation size', section: 'Clouds', help: 'Bigger means larger, softer formations.', row: { kind: 'track', min: 0.3, max: 3, step: 0.05, precision: 2 } },
    { prop: 'color', label: 'Colour', section: 'Clouds', row: { kind: 'color' } },
    { prop: 'opacity', label: 'Opacity', section: 'Clouds', row: { kind: 'track', min: 0, max: 1, step: 0.01, precision: 2 } },
    { prop: 'speed', label: 'Speed', section: 'Drift', row: { kind: 'track', min: 0, max: 120, step: 1, precision: 0, unit: 'px/s' } },
    { prop: 'direction', label: 'Direction', section: 'Drift', row: { kind: 'track', min: 0, max: 360, step: 1, precision: 0, unit: '°' } },
    {
      prop: 'clear',
      label: 'Clearing',
      section: 'Clearing',
      help: 'How far the cloud has parted outward from the centre, 0 to 1.',
      row: { kind: 'window', maxFrom: 'duration', switchable: true },
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
      x: staticTrack(0.82),
      y: staticTrack(0.22),
      width: staticTrack(0.28),
      anchor: 'center',
      opacity: staticTrack(1),
      radius: staticTrack(14),
      border: true,
      borderColor: '#ffffff',
      shadow: true,
      anim: 'kenBurns',
      caption: '',
      bgTolerance: 0.12,
      bgFeather: 1,
    }) as Layer,
  /*
   * As with clouds, the shipped panel is the authority where the two disagreed: `width`
   * floored at 0.05 not 0.02, `x`/`y` scrubbed in 0.005 steps not 0.01, the first animation
   * read "Slow push in" not "Ken Burns", and `caption` sat with the image rather than under
   * Style. Corrected here rather than in the generator.
   */
  props: [
    // The file picker and its embedded-size readout; a text field cannot open a file (§5.8).
    { prop: 'src', label: 'Source', custom: true, row: { kind: 'text' } },
    // Applied by a button, not by scrubbing: keying re-decodes the whole bitmap, so a live
    // slider would re-run it per pointer move. The rows sit beside that button.
    { prop: 'srcOriginal', label: 'Original', custom: true, optional: true, row: { kind: 'text' } },
    { prop: 'bgTolerance', label: 'Tolerance', section: 'Background', help: 'How close to the edge colour counts as background', row: { kind: 'number', min: 0, max: 0.6, step: 0.01, precision: 2, slider: true } },
    { prop: 'bgFeather', label: 'Soften edge', section: 'Background', row: { kind: 'number', min: 0, max: 4, step: 1, precision: 0, unit: 'px' } },
    { prop: 'caption', label: 'Caption', section: 'Image', row: { kind: 'text' } },
    {
      prop: 'anim',
      label: 'Animation',
      section: 'Image',
      row: { kind: 'select', options: [{ value: 'kenBurns', label: 'Slow push in' }, { value: 'fade', label: 'Fade' }, { value: 'slideUp', label: 'Slide up' }, { value: 'none', label: 'None' }] },
    },
    { prop: 'x', label: 'X', section: 'Placement', row: { kind: 'track', min: 0, max: 1, step: 0.005, precision: 3 } },
    { prop: 'y', label: 'Y', section: 'Placement', row: { kind: 'track', min: 0, max: 1, step: 0.005, precision: 3 } },
    { prop: 'width', label: 'Width', section: 'Placement', help: 'Fraction of the frame width; height follows the image', row: { kind: 'track', min: 0.05, max: 1, step: 0.005, precision: 3 } },
    {
      prop: 'anchor',
      label: 'Anchor',
      section: 'Placement',
      row: {
        kind: 'select',
        options: [
          { value: 'center', label: 'Centre' },
          { value: 'topLeft', label: 'Top left' },
          { value: 'topRight', label: 'Top right' },
          { value: 'bottomLeft', label: 'Bottom left' },
          { value: 'bottomRight', label: 'Bottom right' },
        ],
      },
    },
    { prop: 'opacity', label: 'Opacity', section: 'Style', row: { kind: 'track', min: 0, max: 1, step: 0.01, precision: 2 } },
    { prop: 'radius', label: 'Corner radius', section: 'Style', row: { kind: 'track', min: 0, max: 60, step: 1, precision: 0, unit: 'px' } },
    { prop: 'border', label: 'Border', section: 'Style', row: { kind: 'toggle' } },
    // A border colour with no border is a control for nothing — the panel hid it, so does this.
    { prop: 'borderColor', label: 'Border colour', section: 'Style', when: { prop: 'border', equals: true }, row: { kind: 'color' } },
    { prop: 'shadow', label: 'Shadow', section: 'Style', row: { kind: 'toggle' } },
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
