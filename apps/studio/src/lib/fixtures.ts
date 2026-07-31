import { createId } from '@geomotion/core';
import { cameraFromShots, createLayer, defaultTour, keyframe, projectWith, windowTrack } from '@geomotion/document';
import type { Layer, LngLat, Project, RegionsLayer } from '@geomotion/document';
import indiaStates from '../data/india-states-official.json';
import anemia from '../data/india-anemia-sample.json';
import indiaOutline from '../data/india-outline-official.json';

/**
 * Worked example projects.
 *
 * These live in the app rather than in `@geomotion/document` because they embed
 * bundled boundary data — that is example content, not document model. They are
 * also the fixtures the round-trip tests run against, which is why they are kept
 * realistic rather than minimal.
 */

const SF: LngLat = [-122.4194, 37.7749];
const TOKYO: LngLat = [139.6917, 35.6895];

/** The demo's markers carry a pulsing ring; the rest of the stack keeps its defaults. */
const ringOn = () => [{ id: createId(), type: 'pulse' as const, enabled: true }];

export function demoProject(): Project {
  const route = createLayer('route', 2.4, {
    name: 'SFO → HND',
    curve: 'arc',
    color: '#4cc2ff',
    width: 3.5,
    out: 15,
    progress: windowTrack(3, 9.5, 'easeInOutCubic'),
    marker: { enabled: true, icon: 'plane', color: '#ffffff', size: 9, rotate: true },
  } as Partial<Layer>) as Extract<Layer, { type: 'route' }>;
  route.coords = [SF, TOKYO];

  const sf = createLayer('marker', 0, {
    name: 'San Francisco',
    label: 'San Francisco',
    color: '#ff5f56',
    out: 15,
  } as Partial<Layer>) as Extract<Layer, { type: 'marker' }>;
  sf.coord = SF;
  /*
   * Assigned after construction, not passed through the `Partial<Layer>` cast above.
   *
   * That cast accepts any field name, so when `drawStart` and then `pulse` were replaced
   * it swallowed both silently and the fixture rendered with defaults — twice caught only
   * by a golden frame moving. Assigning to the typed object makes the next such rename a
   * compile error instead.
   */
  sf.behaviours = { ...sf.behaviours, ring: ringOn() };

  const tokyo = createLayer('marker', 9.2, {
    name: 'Tokyo',
    label: 'Tokyo',
    color: '#ffbd2e',
    out: 15,
  } as Partial<Layer>) as Extract<Layer, { type: 'marker' }>;
  tokyo.coord = TOKYO;
  tokyo.behaviours = { ...tokyo.behaviours, ring: ringOn() };

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

  const camera = cameraFromShots([
    keyframe(0, SF, 9.5, { pitch: 50, bearing: -18 }),
    keyframe(3, SF, 3.4, { pitch: 0, bearing: 0 }),
    keyframe(6.5, [-172, 44], 2.1, { dip: 0.3 }),
    keyframe(9.8, TOKYO, 3.6),
    keyframe(13, TOKYO, 9.5, { pitch: 50, bearing: 22 }),
  ]);

  // The camera first, then the layers bottom-to-top — the order they are listed is the
  // order they draw in, which is what `projectWith` assigns keys for.
  return projectWith([camera, route, sf, tokyo, title, stat], {
    name: 'Trans-Pacific',
    duration: 15,
  });
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
    clear: windowTrack(1.8, 5.4, 'easeInOutCubic'),
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
    tour: {
      ...defaultTour(),
      order: 'valueDesc',
      dwell,
      moveTime: 0.9,
      padding: 0.24,
      intro,
      introTrace: true,
      outro,
      labelAll: true,
      labelSize: 15,
    },
    // Imagery is busy, so the state borders need a bit more weight than they
    // would over a flat vector basemap.
    borderWidth: 1.2,
    borderCasing: true,
    out: duration,
    fade: 0.6,
    legendTitle: `${anemia._metric} (${anemia._unit})`,
    // Typed as the specific layer, not Partial<Layer>: the loose cast is what let
    // the flat tour fields survive here unnoticed when they stopped existing —
    // excess-property checking is the thing that would have caught it.
  } as Partial<RegionsLayer>);

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

  // Straight down on India; the tour takes the camera from here.
  const camera = cameraFromShots([keyframe(0, [82.8, 22.6], 3.5, { pitch: 0 })]);

  return projectWith([camera, regions, outline, clouds, title, subtitle, caption], {
    name: 'Anaemia in India',
    duration,
    basemap: 'satellite-labels',
  });
}
