import { createId } from '@geomotion/core';
import { cameraFromShots, createLayer, defaultTour, keyframe, projectWith, staticTrack, windowTrack } from '@geomotion/document';
import type { Layer, LngLat, Project, RegionsLayer } from '@geomotion/document';
import indiaStates from '../data/india-states-official.json';
import anemia from '../data/india-anemia-sample.json';
import indiaOutline from '../data/india-outline-official.json';
import worldCountries from '../data/world-countries.json';
import gdpPerPerson from '../data/world-gdp-per-person.json';

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
    width: staticTrack(3.5),
    out: 15,
    progress: windowTrack(3, 9.5, 'easeInOutCubic'),
    marker: { enabled: true, icon: 'plane', color: '#ffffff', size: staticTrack(9), rotate: true },
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
    size: staticTrack(40),
    letterSpacing: staticTrack(4),
    y: staticTrack(0.13),
    out: 4.5,
  } as Partial<Layer>);

  const stat = createLayer('text', 5.2, {
    name: 'Distance',
    text: '8,270 km · 10h 45m',
    size: staticTrack(26),
    weight: 500,
    y: staticTrack(0.86),
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
    coverage: staticTrack(1),
    scale: staticTrack(1.25),
    speed: staticTrack(16),
    direction: staticTrack(65),
    out: start + intro * 0.6,
    fade: 0.8,
    clear: windowTrack(1.8, 5.4, 'easeInOutCubic'),
  } as Partial<Layer>);

  // The country outline traces itself on before the states are broken out.
  const outline = createLayer('shape', 0.9, {
    name: 'India outline',
    geojson: JSON.stringify(indiaOutline),
    fillColor: '#4cc2ff',
    fillOpacity: staticTrack(0.12),
    lineColor: '#7dd3fc',
    lineWidth: staticTrack(3),
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
    borderWidth: staticTrack(1.2),
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
    size: staticTrack(54),
    letterSpacing: staticTrack(5),
    y: staticTrack(0.44),
    out: start + intro * 0.75,
    fade: 0.7,
  } as Partial<Layer>);

  const subtitle = createLayer('text', 1.1, {
    name: 'Subtitle',
    text: 'Women aged 15–49, by state',
    size: staticTrack(24),
    weight: 400,
    y: staticTrack(0.52),
    anim: 'fade',
    out: start + intro * 0.75,
    fade: 0.7,
  } as Partial<Layer>);

  const caption = createLayer('text', 0, {
    name: 'Data caption',
    text: 'Sample values — replace with your own source',
    size: staticTrack(15),
    weight: 400,
    align: 'right',
    // Top-right: the legend owns the bottom-left and the burnt-in
    // attribution owns the bottom-right.
    x: staticTrack(0.985),
    y: staticTrack(0.06),
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

/**
 * The world, coloured by GDP per person, with the camera visiting nine of them.
 *
 * The same region-tour machinery as `indiaTourProject`, at the other end of its range —
 * which is the point of having both. India tours *every* region it colours (37 states, one
 * after another); the world cannot, because 169 stops at 2.6 s each is seven minutes of
 * video. So this one colours all 176 countries and tours a chosen nine, which is what
 * `order: 'custom'` is for: `customOrder` picks the stops as well as their order.
 *
 * The nine run west to east — Americas, Europe, Africa, Asia, Oceania — so the camera makes
 * one circuit of the globe instead of teleporting between whichever countries happen to rank
 * next to each other. They also span most of the range the legend shows, from Ethiopia at
 * about $860 to Switzerland at about $82,000.
 *
 * Both the geometry and the numbers are Natural Earth 1:110m Admin 0 (public domain), so
 * unlike the India fixture there is no invented data here. See the data file's `_note` for
 * what that does and does not make them good for.
 */
export function worldTourProject(): Project {
  /*
   * The tour's nine stops, west to east. Names must match the `name` property in
   * world-countries.json exactly — `customOrder` resolves case-insensitively by name and
   * silently drops anything it cannot find, so a typo here is a missing stop rather than an
   * error. (Hence the fixture test, which checks all nine resolve.)
   */
  const stops = [
    'United States of America',
    'Brazil',
    'Switzerland',
    'Nigeria',
    'Ethiopia',
    'India',
    'China',
    'Japan',
    'Australia',
  ];

  const dwell = 2.6;
  const intro = 5;
  const outro = 6.5;
  const start = 2.6;
  const tourEnd = start + intro + stops.length * dwell;
  const duration = tourEnd + outro + 1.4;

  // Clouds over the whole globe, parting to reveal it — the same opening as the India film.
  const clouds = createLayer('clouds', 0, {
    name: 'Cloud cover',
    coverage: staticTrack(1),
    scale: staticTrack(1.6),
    speed: staticTrack(12),
    direction: staticTrack(80),
    out: start + intro * 0.6,
    fade: 0.9,
    clear: windowTrack(1.8, 5.6, 'easeInOutCubic'),
  } as Partial<Layer>);

  const regions = createLayer('regions', start, {
    name: 'Countries',
    geojson: JSON.stringify(worldCountries),
    nameKey: 'name',
    values: gdpPerPerson.values as Record<string, number>,
    metric: gdpPerPerson._metric,
    unit: gdpPerPerson._unit,
    decimals: 0,
    /*
     * Inferno, flipped, on the dark basemap: high values glow and low ones sink towards the
     * colour of the ocean. Every ramp in the palette runs light-to-dark, which on a dark
     * basemap would bury exactly the countries the film is pointing at. Flipped it reads as
     * a night-lights map, which is a fair metaphor for what is being measured.
     */
    ramp: 'inferno',
    flipRamp: true,
    /*
     * A capped domain, not the automatic one.
     *
     * GDP per person is log-distributed: the median is about $5,500 and the top is
     * $114,703, so on a linear ramp to the true maximum roughly two-thirds of the world sits
     * in the darkest tenth of the scale and Africa, South Asia and South America are one
     * indistinguishable black. Capping at the 90th percentile spends the ramp where the
     * countries are. The stops still read their real values — only the colour saturates —
     * and the caption says the scale is capped so the legend's top label cannot be mistaken
     * for the maximum.
     */
    autoDomain: false,
    min: 0,
    max: 46000,
    tour: {
      ...defaultTour(),
      order: 'custom',
      customOrder: stops,
      dwell,
      moveTime: 1.1,
      padding: 0.14,
      /*
       * Well below the default 8. These stops range from Norway to Brazil, and a zoom that
       * frames Norway sensibly would put the camera inside a Brazilian state — capping it
       * keeps every stop at a scale where you can still tell where on Earth you are.
       */
      maxZoom: 5.5,
      intro,
      introTrace: true,
      outro,
      // 176 country names at once is a grey haze at world scale; the tour labels the stop
      // it is on, which is the only one worth reading.
      labelAll: false,
      labelSize: 16,
    },
    // Country borders over a dark basemap: thin, but cased so they survive the fill.
    borderWidth: staticTrack(0.9),
    borderCasing: true,
    out: duration,
    fade: 0.6,
    legendTitle: `${gdpPerPerson._metric} (${gdpPerPerson._unit})`,
  } as Partial<RegionsLayer>);

  const title = createLayer('text', 0.4, {
    name: 'Title',
    text: 'GDP PER PERSON',
    size: staticTrack(54),
    letterSpacing: staticTrack(5),
    y: staticTrack(0.44),
    /*
     * A scrim behind the opening titles, which the India film does not need.
     * That one opens over satellite imagery, which is dark everywhere. This one opens over
     * the choropleth itself, and the bright end of the ramp runs straight through where the
     * title sits — white-on-pale-yellow across Europe is unreadable.
     */
    background: true,
    out: start + intro * 0.75,
    fade: 0.7,
  } as Partial<Layer>);

  const subtitle = createLayer('text', 1.1, {
    name: 'Subtitle',
    text: '169 countries, 2019 estimates',
    size: staticTrack(24),
    weight: 400,
    y: staticTrack(0.52),
    background: true,
    anim: 'fade',
    out: start + intro * 0.75,
    fade: 0.7,
  } as Partial<Layer>);

  const caption = createLayer('text', 0, {
    name: 'Data caption',
    text: 'Natural Earth 1:110m · colour scale capped at $46,000',
    size: staticTrack(15),
    weight: 400,
    align: 'right',
    // Top-right, for the same reason as the India fixture: the legend owns the bottom-left
    // and the burnt-in basemap attribution owns the bottom-right.
    x: staticTrack(0.985),
    y: staticTrack(0.06),
    anim: 'none',
    out: duration,
    fade: 0.4,
  } as Partial<Layer>);

  // The whole globe, centred so the Atlantic is not in the middle of the frame. The tour
  // takes the camera from here.
  const camera = cameraFromShots([keyframe(0, [12, 22], 2.95, { pitch: 0 })]);

  return projectWith([camera, regions, clouds, title, subtitle, caption], {
    name: 'GDP per person',
    duration,
    basemap: 'dark',
  });
}
