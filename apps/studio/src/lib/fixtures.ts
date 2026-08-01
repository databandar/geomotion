import { createId } from '@geomotion/core';
import { haversine } from '@geomotion/geometry';
import { cameraFromShots, createLayer, createMapContext, defaultTour, keyframe, projectWith, staticTrack, windowTrack } from '@geomotion/document';
import type { CameraKeyframe, Layer, LngLat, Project, RegionsLayer, StoryBlock } from '@geomotion/document';
import indiaStates from '../data/india-states-official.json';
import anemia from '../data/india-anemia-sample.json';
import indiaOutline from '../data/india-outline-official.json';
import worldCountries from '../data/world-countries.json';
import gdpPerPerson from '../data/world-gdp-per-person.json';
import worldPopulation from '../data/world-population.json';

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

/* ------------------------------------------------------- globe tour template */

/**
 * A globe tour: the Earth as a sphere, not a flat map.
 *
 * The other two region films sit on a Mercator plane — even the world tour, which is a
 * flat choropleth with the camera flying between countries. This one is the same map
 * wrapped onto a globe: the world is a ball in the frame, the camera arcs over its
 * curvature from city to city, and a tour stop reads as "look at the planet from here"
 * rather than "zoom in on this country".
 *
 * The mechanics are all ordinary document content — nothing here is special-cased:
 *
 * - A **map context node** (`projection: 'globe'`) is live for the whole film via one
 *   story block, so `MapCanvas` hands `{ type: 'globe' }` to `map.setProjection`. The
 *   globe is the projection, exactly as §04 says a context should change it.
 * - The camera is hand-keyframed — a slow opening rotation, then four city dives, then a
 *   pull-back rotation. Each dive carries a `dip`, which pulls the zoom back mid-move and
 *   pushes it in again: on a globe that is what makes the camera read as flying *over the
 *   curve* between continents instead of panning across a flat image.
 * - The stops are ordinary markers, popping in as the camera arrives, so the tour needs no
 *   data and no region engine. A marker's `in`/`out` window hides it once the camera moves
 *   on.
 *
 * The four cities run west to east — Americas, Europe, Asia — so the camera makes one
 * circuit of the planet, the same ordering instinct as the world tour's nine countries.
 */
export function globeTourProject(): Project {
  const duration = 21.5;

  // The camera, as a shot list. The intro rotates the globe (slow longitude drift at a
  // fixed zoom); each city is a pitched dive with an arc; the outro eases back out to the
  // whole sphere and rotates home.
  const camera = cameraFromShots([
    keyframe(0, [-20, 14], 1.65, { pitch: 0 }),
    keyframe(4.6, [55, 14], 1.65, { pitch: 0 }),
    keyframe(6.4, [-74, 40.7], 4.3, { pitch: 55, dip: 0.35 }),
    keyframe(9.2, [2.35, 48.85], 4.3, { pitch: 55, dip: 0.35 }),
    keyframe(12, [72.9, 19.05], 4.3, { pitch: 55, dip: 0.35 }),
    keyframe(14.8, [139.7, 35.68], 4.3, { pitch: 55, dip: 0.35 }),
    keyframe(17.2, [120, 8], 1.8, { pitch: 0 }),
    keyframe(20, [0, 14], 1.8, { pitch: 0 }),
  ]);

  // A map context naming the globe, live for the whole film. The context's projection is
  // what MapCanvas applies; everything else falls through to the project's own settings.
  const globe = createMapContext('Globe');
  globe.projection = 'globe';

  // Clouds open the film and part to reveal the sphere.
  const clouds = createLayer('clouds', 0, {
    name: 'Cloud cover',
    coverage: staticTrack(1),
    scale: staticTrack(1.3),
    speed: staticTrack(14),
    direction: staticTrack(80),
    out: 5.2,
    fade: 0.9,
    clear: windowTrack(1.4, 3.8, 'easeInOutCubic'),
  } as Partial<Layer>);

  // The four stops. Each is visible only while the camera is arriving and settling, then
  // gone before the next dive — the marker does not linger on the horizon mid-flight.
  const stops = [
    { name: 'New York', coord: [-74.006, 40.7128] as LngLat, in: 5.7, out: 8.4, color: '#4cc2ff' },
    { name: 'Paris', coord: [2.3522, 48.8566] as LngLat, in: 8.6, out: 11.3, color: '#ffbd2e' },
    { name: 'Mumbai', coord: [72.8777, 19.076] as LngLat, in: 11.5, out: 14.2, color: '#ff5f56' },
    { name: 'Tokyo', coord: [139.6917, 35.6895] as LngLat, in: 14.4, out: 17, color: '#5cd68f' },
  ];

  const markers = stops.map(
    (s) =>
      createLayer('marker', s.in, {
        name: s.name,
        coord: s.coord,
        label: s.name,
        color: s.color,
        out: s.out,
        labelSize: staticTrack(18),
        halo: true,
      } as Partial<Layer>) as Extract<Layer, { type: 'marker' }>,
  );
  // A pulsing ring on each stop, so the arrive reads as "here" rather than a static dot.
  markers.forEach((m) => {
    m.behaviours = { ...m.behaviours, ring: ringOn() };
  });

  const title = createLayer('text', 0.4, {
    name: 'Title',
    text: 'A GLOBE TOUR',
    size: staticTrack(54),
    letterSpacing: staticTrack(6),
    y: staticTrack(0.42),
    background: true,
    out: 5.4,
    fade: 0.8,
  } as Partial<Layer>);

  const subtitle = createLayer('text', 1.2, {
    name: 'Subtitle',
    text: 'four cities · one planet',
    size: staticTrack(24),
    weight: 400,
    y: staticTrack(0.53),
    background: true,
    anim: 'fade',
    out: 5.4,
    fade: 0.8,
  } as Partial<Layer>);

  const outro = createLayer('text', 17.6, {
    name: 'Outro',
    text: 'The world is a sphere — fly around it.',
    size: staticTrack(28),
    weight: 500,
    y: staticTrack(0.5),
    background: true,
    anim: 'fade',
    out: 20.6,
    fade: 0.7,
  } as Partial<Layer>);

  // The block that keeps the globe context live for the whole film, and names the layers
  // it choreographs so the storyboard can read the beat.
  const block: StoryBlock = {
    id: createId(),
    t: 0,
    d: duration,
    context: globe.id,
    nodes: [clouds.id, title.id, subtitle.id, outro.id, ...markers.map((m) => m.id)],
  };

  return projectWith([camera, globe, clouds, ...markers, title, subtitle, outro], {
    name: 'Globe tour',
    duration,
    basemap: 'satellite-labels',
    story: [block],
  });
}

/* --------------------------------------------- GDP choropleth on the globe */

/**
 * The world tour's choropleth wrapped onto the globe, the camera visiting six countries.
 *
 * `worldTourProject` colours every country by GDP per person and flies across a flat
 * Mercator map; this is the same data and the same night-lights ramp on the same dark
 * basemap, but the projection is the globe — the Earth is a ball in the frame, and each
 * stop reads as "look at the planet from here" rather than "zoom in on this country".
 * It is the meeting point of the two templates above: the world tour's region engine and
 * the globe tour's camera.
 *
 * The tour engine and the camera are deliberately split:
 *
 * - The regions layer keeps `tour.enabled` so the phases, the trace reveal, the dimming
 *   and the per-stop readout card all run — but `driveCamera` is off. The automated tour
 *   frames with `fitBounds`, which solves on a Mercator plane; on a sphere that framing
 *   does not transfer, so the view is hand-keyframed instead.
 * - The camera follows the tour's own schedule (`arrive = stop + moveTime`, `depart =
 *   stop + dwell`), so the camera settles on each country just as its card appears, holds
 *   while the card reads, then arcs over the planet's curve to the next stop. The arc
 *   rides the zoom channel's `dip`, exactly as the globe tour's city dives do.
 *
 * The six stops run west to east — Americas, South America, Europe, Africa, Asia — one
 * circuit of the planet, and they span almost the whole legend: Ethiopia at about $860
 * to Switzerland at about $82,000.
 */
export function globeGdpTourProject(): Project {
  const stops = [
    'United States of America',
    'Brazil',
    'Switzerland',
    'Ethiopia',
    'India',
    'Japan',
  ];

  const dwell = 3.0;
  const moveTime = 1.2;
  const intro = 4.5;
  const outro = 5;
  const start = 2.6;
  const tourStart = start + intro;
  const tourEnd = tourStart + stops.length * dwell;
  const duration = tourEnd + outro + 1.4;

  // The camera the tour labels against. Each stop gets a two-key hold — the camera lands
  // on the country at `stop + moveTime` (when the card starts rising), holds through the
  // dwell so the card has a still frame to read against, then the `dip` on the depart key
  // arcs it over the curvature to the next stop.
  const arrive = (i: number) => tourStart + i * dwell + moveTime;
  const depart = (i: number) => tourStart + i * dwell + dwell;
  const centers: LngLat[] = [
    [-97.5, 39.5], // United States of America
    [-53, -10], // Brazil
    [8.2, 46.8], // Switzerland
    [39.5, 9], // Ethiopia
    [79, 21.5], // India
    [138, 37.5], // Japan
  ];
  const shots: CameraKeyframe[] = [
    keyframe(0, [-20, 14], 1.7, { pitch: 0 }),
    keyframe(4.6, [30, 14], 1.7, { pitch: 0 }),
  ];
  for (let i = 0; i < stops.length; i++) {
    shots.push(keyframe(arrive(i), centers[i]!, 4.4, { pitch: 50 }));
    shots.push(keyframe(depart(i), centers[i]!, 4.4, { pitch: 50, dip: 0.35 }));
  }
  shots.push(keyframe(tourEnd + 1.3, [110, 10], 1.8, { pitch: 0 }));
  shots.push(keyframe(tourEnd + 3.7, [0, 14], 1.8, { pitch: 0 }));
  const camera = cameraFromShots(shots);

  const globe = createMapContext('Globe');
  globe.projection = 'globe';

  // Clouds open the film and part to reveal the sphere, exactly as the globe tour does.
  const clouds = createLayer('clouds', 0, {
    name: 'Cloud cover',
    coverage: staticTrack(1),
    scale: staticTrack(1.3),
    speed: staticTrack(14),
    direction: staticTrack(80),
    out: start + intro * 0.6,
    fade: 0.9,
    clear: windowTrack(1.4, 3.8, 'easeInOutCubic'),
  } as Partial<Layer>);

  const regions = createLayer('regions', start, {
    name: 'Countries',
    geojson: JSON.stringify(worldCountries),
    nameKey: 'name',
    values: gdpPerPerson.values as Record<string, number>,
    metric: gdpPerPerson._metric,
    unit: gdpPerPerson._unit,
    decimals: 0,
    // The same night-lights ramp as the flat world tour, on the same dark basemap: high
    // values glow and low ones sink towards the colour of the ocean.
    ramp: 'inferno',
    flipRamp: true,
    autoDomain: false,
    min: 0,
    max: 46000,
    tour: {
      ...defaultTour(),
      order: 'custom',
      customOrder: stops,
      dwell,
      moveTime,
      padding: 0.14,
      maxZoom: 5.5,
      intro,
      introTrace: true,
      outro,
      labelAll: false,
      labelSize: 16,
      // The globe has no Mercator plane to fitBounds on — the hand-keyframed camera drives.
      driveCamera: false,
    },
    borderWidth: staticTrack(0.9),
    borderCasing: true,
    // A heavier active outline than the flat world tour's: on the globe the visited
    // country sits in a sea of dark ocean, so its highlight is what makes it read.
    highlightWidth: staticTrack(5),
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
    background: true,
    out: start + intro * 0.75,
    fade: 0.7,
  } as Partial<Layer>);

  const subtitle = createLayer('text', 1.2, {
    name: 'Subtitle',
    text: 'the world on a globe',
    size: staticTrack(24),
    weight: 400,
    y: staticTrack(0.53),
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
    x: staticTrack(0.985),
    y: staticTrack(0.06),
    anim: 'none',
    out: duration,
    fade: 0.4,
  } as Partial<Layer>);

  const outroText = createLayer('text', tourEnd + 0.9, {
    name: 'Outro',
    text: 'One planet, very unequal.',
    size: staticTrack(28),
    weight: 500,
    y: staticTrack(0.5),
    background: true,
    anim: 'fade',
    out: duration - 0.9,
    fade: 0.7,
  } as Partial<Layer>);

  // The block that keeps the globe context live for the whole film, and names the layers
  // it choreographs so the storyboard can read the beat.
  const block: StoryBlock = {
    id: createId(),
    t: 0,
    d: duration,
    context: globe.id,
    nodes: [clouds.id, regions.id, title.id, subtitle.id, caption.id, outroText.id],
  };

  return projectWith([camera, globe, regions, clouds, title, subtitle, caption, outroText], {
    name: 'GDP per person (globe)',
    duration,
    basemap: 'dark',
    story: [block],
  });
}

/* ------------------------------------- the "painted world" series pilot */

/**
 * The series opener: "the world painted by income".
 *
 * The channel's premise is that the same globe gets painted by a different measure every
 * episode — so the film that introduces it has to establish both the visual identity (a
 * night-lights globe in space, the readout card, the swoop) and the narrative grammar:
 * open from space, paint the world, then walk the extremes of the paint.
 *
 * Where the plain GDP globe tour visits a spread of countries, this pilot climbs the
 * ladder instead — from the richest country on Earth to the poorest — because a ranked
 * walk is the most dramatic proof of what a paint scale means. Four stops, one surprise:
 *
 * - Luxembourg, the richest country on Earth (#1, $114,703)
 * - Switzerland (#2, $81,994)
 * - the United States — "you'd bet on first. it's sixth." ($65,298)
 * - Burundi, the bottom of the scale (#169, $261)
 *
 * The intro is longer than the tours' because the opening is the brand: the globe rotates
 * slowly while every country border draws itself on and the legend washes in — the world
 * being painted. The outro closes the episode and teases the next paint ("life
 * expectancy"), the hook that makes the series a series.
 */
export function paintedWorldProject(): Project {
  const stops = ['Luxembourg', 'Switzerland', 'United States of America', 'Burundi'];

  const dwell = 3.0;
  const moveTime = 1.2;
  const intro = 8;
  const outro = 5.5;
  const start = 2.6;
  const tourStart = start + intro;
  const tourEnd = tourStart + stops.length * dwell;
  const duration = tourEnd + outro + 1.4;

  // Dives to each ladder rung. Luxembourg and Burundi are tiny countries, so they want a
  // much closer shot than the continental ones — and Burundi's fill is near-black by design
  // (the night-lights ramp), so the white outline and the readout card are what carry it.
  const arrive = (i: number) => tourStart + i * dwell + moveTime;
  const depart = (i: number) => tourStart + i * dwell + dwell;
  const centers: LngLat[] = [
    [6.13, 49.8], // Luxembourg
    [8.2, 46.8], // Switzerland
    [-97.5, 39.5], // United States
    [29.9, -3.4], // Burundi
  ];
  const diveZoom = [6.2, 4.4, 4.6, 7.0];
  const shots: CameraKeyframe[] = [
    // The opening rotation while the world paints itself.
    keyframe(0, [-30, 14], 1.7, { pitch: 0 }),
    keyframe(4.6, [15, 14], 1.7, { pitch: 0 }),
    keyframe(8.4, [-15, 14], 1.7, { pitch: 0 }),
  ];
  for (let i = 0; i < stops.length; i++) {
    shots.push(keyframe(arrive(i), centers[i]!, diveZoom[i]!, { pitch: 50 }));
    shots.push(keyframe(depart(i), centers[i]!, diveZoom[i]!, { pitch: 50, dip: 0.35 }));
  }
  // The outro is the money shot of a series opener: pull back to the Atlantic view where the
  // bright hemisphere — Europe and the Americas on a night-lights world — fills the frame.
  shots.push(keyframe(tourEnd + 1.3, [-15, 20], 2.6, { pitch: 0 }));
  shots.push(keyframe(tourEnd + 3.9, [-15, 20], 2.6, { pitch: 0 }));
  const camera = cameraFromShots(shots);

  const globe = createMapContext('Globe');
  globe.projection = 'globe';

  // The clouds part to reveal the sphere, as every globe film in the series opens.
  const clouds = createLayer('clouds', 0, {
    name: 'Cloud cover',
    coverage: staticTrack(1),
    scale: staticTrack(1.3),
    speed: staticTrack(14),
    direction: staticTrack(80),
    out: start + intro * 0.6,
    fade: 0.9,
    clear: windowTrack(1.4, 3.8, 'easeInOutCubic'),
  } as Partial<Layer>);

  const regions = createLayer('regions', start, {
    name: 'Countries',
    geojson: JSON.stringify(worldCountries),
    nameKey: 'name',
    values: gdpPerPerson.values as Record<string, number>,
    metric: gdpPerPerson._metric,
    unit: gdpPerPerson._unit,
    decimals: 0,
    ramp: 'inferno',
    flipRamp: true,
    autoDomain: false,
    min: 0,
    max: 46000,
    tour: {
      ...defaultTour(),
      order: 'custom',
      customOrder: stops,
      dwell,
      moveTime,
      padding: 0.14,
      maxZoom: 8,
      // A long intro is the point: the slow border trace is the "paint".
      intro,
      introTrace: true,
      outro: 4,
      labelAll: false,
      labelSize: 16,
      driveCamera: false,
    },
    borderWidth: staticTrack(0.9),
    borderCasing: true,
    // A heavy active outline: on the night-lights ramp the poorest countries are near-black
    // by design, so the border and the readout card are what make the final stop read.
    highlightWidth: staticTrack(6),
    out: duration,
    fade: 0.6,
    legendTitle: `${gdpPerPerson._metric} (${gdpPerPerson._unit})`,
  } as Partial<RegionsLayer>);

  const title = createLayer('text', 0.5, {
    name: 'Title',
    text: 'THE WORLD PAINTED BY',
    size: staticTrack(54),
    letterSpacing: staticTrack(5),
    y: staticTrack(0.4),
    background: true,
    out: start + intro * 0.5,
    fade: 0.7,
  } as Partial<Layer>);

  const subtitle = createLayer('text', 1.3, {
    name: 'Subtitle',
    text: 'income · 169 countries',
    size: staticTrack(24),
    weight: 400,
    y: staticTrack(0.5),
    background: true,
    anim: 'fade',
    out: start + intro * 0.5,
    fade: 0.7,
  } as Partial<Layer>);

  // One story line per rung, timed to the same window its card is up for.
  const beats = [
    'the richest country on Earth is smaller than most cities',
    'number two — banks, chocolate, watches',
    "you'd bet on first. it's sixth.",
    'the bottom of the scale — $261 a year',
  ];
  const captions = stops.map((name, i) =>
    createLayer('text', tourStart + i * dwell + 1.0, {
      name: `Beat — ${name}`,
      text: beats[i]!,
      size: staticTrack(22),
      weight: 500,
      y: staticTrack(0.84),
      background: true,
      anim: 'fade',
      out: tourStart + i * dwell + 3.2,
      fade: 0.6,
    } as Partial<Layer>),
  );

  const outroText = createLayer('text', tourEnd + 0.8, {
    name: 'Outro',
    text: 'One planet, very unequal.',
    size: staticTrack(28),
    weight: 500,
    y: staticTrack(0.5),
    background: true,
    anim: 'fade',
    out: tourEnd + 5.4,
    fade: 0.7,
  } as Partial<Layer>);

  const tease = createLayer('text', tourEnd + 4.1, {
    name: 'Next episode',
    text: 'next week: the world, painted by LIFE EXPECTANCY',
    size: staticTrack(20),
    weight: 400,
    y: staticTrack(0.62),
    background: true,
    anim: 'fade',
    out: duration - 0.6,
    fade: 0.7,
  } as Partial<Layer>);

  const block: StoryBlock = {
    id: createId(),
    t: 0,
    d: duration,
    context: globe.id,
    nodes: [clouds.id, regions.id, title.id, subtitle.id, ...captions.map((c) => c.id), outroText.id, tease.id],
  };

  return projectWith([camera, globe, regions, clouds, title, subtitle, ...captions, outroText, tease], {
    name: 'Painted world — income',
    duration,
    basemap: 'dark',
    story: [block],
  });
}

/* ------------------------------------------- the "routes as stories" pilot */

/**
 * The routes-as-stories pilot: "the long way home".
 *
 * One great-circle flight — San Francisco, Tokyo, Dubai, London, New York — around the
 * world, told as a journey. This is the other side of the series' vocabulary: where the
 * painted-world films colour a static globe, these move through it. The route is a single
 * geodesic through all five cities; a plane marker travels its length as it draws on, and
 * the camera dives to each city the moment the plane arrives.
 *
 * The journey is timed by the geometry itself: `progress` sweeps 0→1 over a fixed window,
 * the marker rides the cumulative great-circle distance, so each arrival time is computed
 * from `measure` over the built path. The camera is keyframed to those arrival times —
 * the plane and the camera can never drift apart, because both come from the same maths.
 *
 * Each stop's caption is the leg that just happened: why routes bend north over the
 * Pacific, over the roof of the world, down the jet stream. The flight closes on the
 * lesson the whole format is built on — the shortest path between two cities is a curve.
 */
export function routeStoryProject(): Project {
  const cities = {
    sf: [-122.4, 37.77] as LngLat,
    tokyo: [139.69, 35.68] as LngLat,
    dubai: [55.27, 25.2] as LngLat,
    london: [-0.12, 51.5] as LngLat,
    ny: [-74.0, 40.71] as LngLat,
  };
  const stops = [cities.sf, cities.tokyo, cities.dubai, cities.london, cities.ny];
  const stopNames = ['San Francisco', 'Tokyo', 'Dubai', 'London', 'New York'];

  // The marker rides cumulative distance, so each arrival lands at a fixed fraction of the
  // journey — computed here, once, and handed to both the camera and the captions.
  const journeyStart = 6;
  const journeyTime = 20;
  const fracs: number[] = [0];
  {
    let acc = 0;
    for (let i = 1; i < stops.length; i++) {
      acc += haversine(stops[i - 1]!, stops[i]!);
      fracs.push(acc);
    }
    const total = acc;
    for (let i = 0; i < fracs.length; i++) fracs[i]! /= total;
  }
  const arrival = (i: number) => journeyStart + journeyTime * fracs[i]!;
  const arrivalEnd = arrival(stops.length - 1);
  const duration = arrivalEnd + 7;

  const camera = cameraFromShots([
    keyframe(0, [0, 22], 2.3, { pitch: 0 }),
    keyframe(5, [-122.4, 37.77], 3.2, { pitch: 35 }),
    ...stops.map((c, i) => keyframe(arrival(i), c, 4.4, { pitch: 50, dip: 0.3 })),
    keyframe(arrivalEnd + 1.5, [0, 26], 1.8, { pitch: 0 }),
    keyframe(arrivalEnd + 4, [20, 18], 1.8, { pitch: 0 }),
  ]);

  const globe = createMapContext('Globe');
  globe.projection = 'globe';

  // The whole journey is one route — geodesic, so each leg is a great-circle arc over the
  // sphere, and `progress` draws it on from the front as the plane flies.
  const route = createLayer('route', journeyStart, {
    name: 'Flight path',
    coords: stops,
    curve: 'geodesic',
    color: '#4cc2ff',
    width: staticTrack(4.5),
    opacity: staticTrack(0.95),
    glow: true,
    out: duration,
    progress: windowTrack(journeyStart, arrivalEnd, 'linear'),
    marker: { enabled: true, icon: 'plane', color: '#ffffff', size: staticTrack(12), rotate: true },
  } as Partial<Layer>) as Extract<Layer, { type: 'route' }>;

  // A pulsing stop at each city, alive only while the plane is around it.
  const markers = stopNames.map((name, i) => {
    const m = createLayer('marker', arrival(i) - 0.6, {
      name,
      coord: stops[i]!,
      label: name,
      color: '#ffbd2e',
      labelSize: staticTrack(17),
      halo: true,
      out: arrival(i) + 2.4,
    } as Partial<Layer>) as Extract<Layer, { type: 'marker' }>;
    m.behaviours = { ...m.behaviours, ring: ringOn() };
    return m;
  });

  const title = createLayer('text', 0.5, {
    name: 'Title',
    text: 'THE LONG WAY HOME',
    size: staticTrack(48),
    letterSpacing: staticTrack(6),
    y: staticTrack(0.42),
    background: true,
    out: 5.2,
    fade: 0.7,
  } as Partial<Layer>);

  const subtitle = createLayer('text', 1.3, {
    name: 'Subtitle',
    text: 'one flight · five cities · why routes curve',
    size: staticTrack(22),
    weight: 400,
    y: staticTrack(0.52),
    background: true,
    anim: 'fade',
    out: 5.2,
    fade: 0.7,
  } as Partial<Layer>);

  const beats = [
    'westbound, the Pacific bends north over Alaska',
    'over the roof of the world — the Arctic on the way to nowhere',
    'down the Persian Gulf, past the Caspian',
    'home on the jet stream',
    'five cities, one curve around the world',
  ];
  const captions = stopNames.map((name, i) =>
    createLayer('text', arrival(i) + 0.4, {
      name: `Beat — ${name}`,
      text: beats[i]!,
      size: staticTrack(20),
      weight: 500,
      y: staticTrack(0.84),
      background: true,
      anim: 'fade',
      out: arrival(i) + 3.4,
      fade: 0.6,
    } as Partial<Layer>),
  );

  const outro = createLayer('text', arrivalEnd + 1.2, {
    name: 'Outro',
    text: 'the shortest path between two cities is a curve',
    size: staticTrack(28),
    weight: 500,
    y: staticTrack(0.5),
    background: true,
    anim: 'fade',
    out: duration - 0.8,
    fade: 0.7,
  } as Partial<Layer>);

  const block: StoryBlock = {
    id: createId(),
    t: 0,
    d: duration,
    context: globe.id,
    nodes: [route.id, ...markers.map((m) => m.id), title.id, subtitle.id, ...captions.map((c) => c.id), outro.id],
  };

  return projectWith([camera, globe, route, ...markers, title, subtitle, ...captions, outro], {
    name: 'Routes — long way home',
    duration,
    basemap: 'dark',
    story: [block],
  });
}

/* --------------------------- "the circle of humanity" (population) */

/**
 * The hooked fast-paced series opener: half the human race lives inside one circle.
 *
 * The pitch in one line: 8 billion people, and more than half of them are packed into a
 * ring around the Bay of Bengal — India, China, and the crowded megacities of the east.
 * The film colours every country by population so the bright band across south and east
 * Asia is unmistakable, drops a circle over that band, then dives into the megacities it
 * contains (Tokyo, Delhi, Shanghai, Mumbai, Dhaka) with their populations landing one by
 * one, and closes by contrasting the whole rest of the world against that single ring.
 *
 * The camera stays on the globe projection throughout, hand-keyframed (the sphere has no
 * Mercator plane for the tour's fitBounds to solve on). Open wide and rotating, pull down
 * to the circle at ~7s as it draws on, dive into the five megacities on the schedule the
 * markers announce, then pull all the way back to the bright band for the closing punch.
 */
export function circleOfHumanityProject(): Project {
  const dwell = 2.5;
  const moveTime = 0.8;
  const intro = 4.5;
  const outro = 4.6;
  const tourStart = 5.0;
  // Megacity dives in the circle, one per beat. India and Bangladesh glaze the picks:
  // they are where the circle is densest, and their giant numbers are the film's payoff.
  const stops = [
    { name: 'Tokyo', coord: [139.7, 35.7] as LngLat, pop: '37m' },
    { name: 'Delhi', coord: [77.2, 28.6] as LngLat, pop: '31m' },
    { name: 'Shanghai', coord: [121.5, 31.2] as LngLat, pop: '28m' },
    { name: 'Mumbai', coord: [72.9, 19.1] as LngLat, pop: '21m' },
    { name: 'Dhaka', coord: [90.4, 23.8] as LngLat, pop: '22m' },
    { name: 'Karachi', coord: [67.0, 24.9] as LngLat, pop: '16m' },
    { name: 'Jakarta', coord: [106.8, -6.2] as LngLat, pop: '11m' },
    { name: 'Bangalore', coord: [77.6, 13.0] as LngLat, pop: '13m' },
  ];
  const tourEnd = tourStart + stops.length * dwell;
  const duration = tourEnd + outro + 1.2;
  const start = 0.8;

  const arrive = (i: number) => tourStart + i * dwell + moveTime;
  const depart = (i: number) => tourStart + i * dwell + dwell;

  // A geojson circle centred on the crowded band the whole film is about. Not a real
  // boundary — an editorial ring drawn over the map — so it is a shape layer, not regions.
  const circleCenter: LngLat = [85, 25];
  const circleRadius = 22; // degrees-ish widest circle that still hugs the band
  const ring: number[][] = [];
  for (let a = 0; a <= 96; a++) {
    const deg = (a / 96) * Math.PI * 2;
    ring.push([circleCenter[0] + Math.cos(deg) * circleRadius, circleCenter[1] + Math.sin(deg) * circleRadius * 0.82]);
  }
  ring.push(ring[0]!);
  const circleGeo = JSON.stringify({ type: 'Polygon', coordinates: [ring] });

  const camera = cameraFromShots([
    keyframe(0, [-25, 18], 1.6, { pitch: 0 }),
    keyframe(4.4, [30, 18], 1.6, { pitch: 0 }),
    keyframe(6.8, [85, 25], 1.9, { pitch: 0 }),
    ...stops.flatMap((s, i) => [
      keyframe(arrive(i), s.coord, 3.8, { pitch: 55 }),
      keyframe(depart(i), s.coord, 3.8, { pitch: 55, dip: 0.4 }),
    ]),
    // The closing reverse: pull back from south-east Asia to the whole bright band.
    keyframe(tourEnd + 1.1, [100, 22], 2.2, { pitch: 0 }),
    keyframe(tourEnd + 3.0, [85, 25], 1.8, { pitch: 0 }),
  ]);

  const globe = createMapContext('Globe');
  globe.projection = 'globe';

  const clouds = createLayer('clouds', 0, {
    name: 'Cloud cover',
    coverage: staticTrack(1),
    scale: staticTrack(1.3),
    speed: staticTrack(14),
    direction: staticTrack(80),
    out: start + intro * 0.55,
    fade: 0.9,
    clear: windowTrack(1.3, 3.6, 'easeInOutCubic'),
  } as Partial<Layer>);

  // The population choropleth: south + east Asia blaze against an empty-looking planet.
  const regions = createLayer('regions', 1.4, {
    name: 'Countries',
    geojson: JSON.stringify(worldCountries),
    nameKey: 'name',
    values: worldPopulation.values as Record<string, number>,
    metric: worldPopulation._metric,
    unit: worldPopulation._unit,
    decimals: 0,
    // Population is wildly skewed (China/India >1.4bn vs Pacific islands <1m). Keep the
    // bright band readable but under the text: a moderate ramp ceiling makes the Asia band
    // glow while the rest of the planet stays dim, so the composition's type is never
    // fighting a blazing map underneath.
    ramp: 'inferno',
    flipRamp: true,
    autoDomain: false,
    min: 0,
    max: 1.2e9,
    opacity: staticTrack(0.72),
    tour: {
      ...defaultTour(),
      // Static choropleth: no stop-to-stop camera tour, no dim-others pacing. The camera
      // is hand-keyframed and the megacity markers announce the beats instead.
      enabled: false,
      order: 'valueDesc',
      customOrder: [],
      dwell,
      moveTime,
      intro,
      introTrace: true,
      outro,
      driveCamera: false,
    },
    borderWidth: staticTrack(0.5),
    borderCasing: true,
    highlightWidth: staticTrack(3),
    out: duration,
    fade: 0.6,
    legendTitle: `${worldPopulation._metric}`,
  } as Partial<RegionsLayer>);;

  // The circle itself: a thin, translucent amber ring — an editorial marker, not a blaze.
  const circle = createLayer('shape', 6.2, {
    name: 'Circle of humanity',
    geojson: circleGeo,
    fillColor: '#ffd23f',
    fillOpacity: staticTrack(0.035),
    lineColor: '#ffd23f',
    lineWidth: staticTrack(2.5),
    out: duration,
  } as Partial<Layer>);

  // The megacity markers pop in as the camera dives. Just a dot + pulse ring — no baked-in
  // labels. All typography lives in the HyperFrames composition on top, so the plate stays a
  // clean map and the overlay never fights the map for the same text.
  const markers = stops.map((s, i) =>
    createLayer('marker', arrive(i) - 0.4, {
      name: s.name,
      coord: s.coord,
      color: '#ffd23f',
      out: depart(i) + 0.5,
      halo: true,
    } as Partial<Layer>) as Extract<Layer, { type: 'marker' }>,
  );
  markers.forEach((m) => {
    m.behaviours = { ...m.behaviours, ring: ringOn() };
  });

  // One hook line at the open; the real numbers land as composition overlays above.
  const hook = createLayer('text', 0.6, {
    name: 'Hook',
    text: '8 BILLION PEOPLE',
    size: staticTrack(56),
    letterSpacing: staticTrack(6),
    y: staticTrack(0.42),
    background: true,
    out: intro + 0.6,
    fade: 0.8,
  } as Partial<Layer>);

  const block: StoryBlock = {
    id: createId(),
    t: 0,
    d: duration,
    context: globe.id,
    nodes: [clouds.id, regions.id, circle.id, hook.id, ...markers.map((m) => m.id)],
  };

  return projectWith([camera, globe, regions, circle, clouds, hook, ...markers], {
    name: 'Circle of humanity — population',
    duration,
    basemap: 'dark',
    story: [block],
  });
}
