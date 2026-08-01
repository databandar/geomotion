import { describe, expect, it } from 'vitest';
import { camerasOf, layersOf, liveContext, resolveMapContext, type RegionsLayer } from '@geomotion/document';
import { globeGdpTourProject, globeTourProject, paintedWorldProject, routeStoryProject, worldTourProject } from './fixtures';

/**
 * The world tour's stops have to resolve.
 *
 * `customOrder` matches by name and *silently drops* anything it cannot find — a country
 * spelled the way an atlas spells it rather than the way Natural Earth spells it becomes a
 * missing stop, not an error. The video still renders; it is just shorter and skips a
 * continent, which is exactly the kind of thing nobody notices until it is published.
 *
 * The determinism and round-trip suites already cover this fixture as a document
 * (scene.test.ts, persistence.test.ts). What is left is whether its content agrees with its
 * data, which is what this checks.
 */

const regions = () => layersOf(worldTourProject()).find((l) => l.type === 'regions') as RegionsLayer;

describe('the world tour fixture', () => {
  it('names a country the data actually contains, for every stop', () => {
    const layer = regions();
    const names = new Set(
      (JSON.parse(layer.geojson) as { features: { properties: { name: string } }[] }).features.map(
        (f) => f.properties.name.toLowerCase(),
      ),
    );
    const missing = layer.tour.customOrder.filter((n) => !names.has(n.trim().toLowerCase()));
    expect(missing).toEqual([]);
  });

  it('has a value for every stop, so no stop shows a blank readout', () => {
    const layer = regions();
    const missing = layer.tour.customOrder.filter((n) => layer.values[n] === undefined);
    expect(missing).toEqual([]);
  });

  it('tours a handful and colours the rest', () => {
    /*
     * The difference from the India fixture, and the reason this one exists. India tours
     * every region it colours; 169 countries at 2.6 s each would be seven minutes, so this
     * colours all of them and visits nine.
     */
    const layer = regions();
    expect(layer.tour.order).toBe('custom');
    expect(layer.tour.customOrder.length).toBe(9);
    expect(Object.keys(layer.values).length).toBeGreaterThan(150);
  });

  it('is long enough to hold its own tour', () => {
    // intro + stops + outro have to fit, or the last stop is cut off mid-dwell.
    const p = worldTourProject();
    const t = regions().tour;
    expect(p.duration).toBeGreaterThan(t.intro + t.customOrder.length * t.dwell + t.outro);
  });

  it('leaves Antarctica out', () => {
    // Uninhabited, so it has no GDP per person, and it wrecks the framing of a Mercator
    // world shot by filling the bottom of it.
    const geo = JSON.parse(regions().geojson) as { features: { properties: { name: string } }[] };
    expect(geo.features.map((f) => f.properties.name)).not.toContain('Antarctica');
  });
});

describe('the globe tour fixture', () => {
  it('puts the whole film under a live globe context', () => {
    const p = globeTourProject();
    // The block that runs the length of the film names a map context…
    expect(p.story).toHaveLength(1);
    const block = p.story[0]!;
    expect(block.t).toBe(0);
    expect(block.d).toBe(p.duration);
    // …which is a real, switched-on context carrying the globe projection.
    expect(liveContext(p, 5)?.id).toBe(block.context);
    expect(resolveMapContext(p, 5).projection).toBe('globe');
    expect(resolveMapContext(p, 0).projection).toBe('globe');
  });

  it('names a real city for every stop, in order', () => {
    const markers = layersOf(globeTourProject())
      .filter((l) => l.type === 'marker')
      .map((m) => ({
        name: m.name,
        coord: (m as Extract<typeof m, { type: 'marker' }>).coord,
        in: m.in,
        out: m.out,
      }));
    expect(markers.map((m) => m.name)).toEqual(['New York', 'Paris', 'Mumbai', 'Tokyo']);
    for (const m of markers) {
      expect(Number.isFinite(m.coord[0]) && Number.isFinite(m.coord[1])).toBe(true);
      // Each stop stays long enough to be read, and leaves before the next arrive.
      expect(m.out - m.in).toBeGreaterThan(2);
    }
  });

  it('visits each city before moving on — no stop overlaps its successor', () => {
    const markers = layersOf(globeTourProject())
      .filter((l) => l.type === 'marker')
      .sort((a, b) => a.in - b.in);
    for (let i = 1; i < markers.length; i++) {
      expect(markers[i]!.in).toBeGreaterThanOrEqual(markers[i - 1]!.out - 0.1);
    }
  });

  it('has a camera keyframe at every stop and a pull-back for the outro', () => {
    const cam = camerasOf(globeTourProject())[0]!;
    const times = cam.tracks.center.kind === 'keyframed' ? cam.tracks.center.keys.map((k) => k.t) : [];
    // A key at each dive (6.4, 9.2, 12, 14.8) plus the intro pair and the outro pair.
    expect(times).toEqual(expect.arrayContaining([0, 4.6, 6.4, 9.2, 12, 14.8, 17.2, 20]));
    // Every dive carries an arc, which is what makes the planet read as round between cities.
    const zooms = cam.tracks.zoom.kind === 'keyframed' ? cam.tracks.zoom.keys : [];
    for (const t of [6.4, 9.2, 12, 14.8]) {
      expect(zooms.find((k) => k.t === t)?.dip).toBeGreaterThan(0);
    }
  });
});

/* ------------------------------------------- the GDP choropleth on the globe */

const gdpGlobe = () => globeGdpTourProject();
const gdpRegions = () => layersOf(gdpGlobe()).find((l) => l.type === 'regions') as RegionsLayer;

describe('the GDP globe fixture', () => {
  it('is the world tour data wrapped in a live globe context', () => {
    const p = gdpGlobe();
    expect(p.story).toHaveLength(1);
    const block = p.story[0]!;
    expect(block.t).toBe(0);
    expect(block.d).toBe(p.duration);
    expect(liveContext(p, 5)?.id).toBe(block.context);
    expect(resolveMapContext(p, 5).projection).toBe('globe');
    // Same capped night-lights ramp as the flat world tour, so the two read as one series.
    const layer = gdpRegions();
    expect(layer.ramp).toBe('inferno');
    expect(layer.flipRamp).toBe(true);
    expect(layer.min).toBe(0);
    expect(layer.max).toBe(46000);
  });

  it('names a real country with a real value for every stop', () => {
    const layer = gdpRegions();
    const geo = JSON.parse(layer.geojson) as { features: { properties: { name: string } }[] };
    const names = new Set(geo.features.map((f) => f.properties.name.toLowerCase()));
    const missing = layer.tour.customOrder.filter((n) => !names.has(n.trim().toLowerCase()));
    expect(missing).toEqual([]);
    const noValue = layer.tour.customOrder.filter((n) => layer.values[n] === undefined);
    expect(noValue).toEqual([]);
    expect(layer.tour.customOrder.length).toBe(6);
  });

  it('spans most of the legend, from poorest to richest', () => {
    const layer = gdpRegions();
    const vals = layer.tour.customOrder.map((n) => layer.values[n] as number);
    expect(Math.min(...vals)).toBeLessThan(1500);
    expect(Math.max(...vals)).toBeGreaterThan(60000);
  });

  it('orders the stops west to east, so the camera makes one circuit', () => {
    const layer = gdpRegions();
    // Centre longitudes of the six stops, resolved back through the data the tour will use.
    const geo = JSON.parse(layer.geojson) as {
      features: { properties: { name: string }; geometry: { coordinates: unknown[] } | null }[];
    };
    const find = (n: string) => {
      const f = geo.features.find((x) => x.properties.name.toLowerCase() === n.toLowerCase());
      if (!f?.geometry) throw new Error(`missing ${n}`);
      const walk = (c: unknown[]): number[] => {
        const [a, b] = c;
        if (typeof a === 'number' && typeof b === 'number' && Number.isFinite(a)) return [a, b];
        for (const v of c) {
          const r = Array.isArray(v) ? walk(v) : undefined;
          if (r) return r;
        }
        return [];
      };
      return walk(f.geometry.coordinates as unknown[])[0];
    };
    const lngs = layer.tour.customOrder.map(find);
    for (let i = 1; i < lngs.length; i++) {
      expect(lngs[i]!).toBeGreaterThan(lngs[i - 1]!);
    }
  });

  it('lets the hand-keyframed camera drive instead of fitBounds', () => {
    const layer = gdpRegions();
    expect(layer.tour.driveCamera).toBe(false);
    expect(layer.tour.enabled).toBe(true);
  });

  it('settles the camera on each country when its card reads, then arcs away', () => {
    const p = gdpGlobe();
    const layer = gdpRegions();
    const cam = camerasOf(p)[0]!;
    const tourStart = layer.in + layer.tour.intro;
    const move = layer.tour.moveTime;
    const times = cam.tracks.center.kind === 'keyframed' ? cam.tracks.center.keys.map((k) => k.t) : [];
    const zooms = cam.tracks.zoom.kind === 'keyframed' ? cam.tracks.zoom.keys : [];
    for (let i = 0; i < layer.tour.customOrder.length; i++) {
      // A key when the card starts to rise, and a key at the end of the dwell — both on the
      // same country, so the camera holds while the number reads.
      const arrive = tourStart + i * layer.tour.dwell + move;
      const depart = tourStart + i * layer.tour.dwell + layer.tour.dwell;
      expect(times).toContain(arrive);
      expect(times).toContain(depart);
      // The depart key carries the arc for the flight to the next stop.
      expect(zooms.find((k) => k.t === depart)?.dip).toBeGreaterThan(0);
    }
    // …and the whole film is long enough to hold the tour.
    expect(p.duration).toBeGreaterThan(tourStart + layer.tour.customOrder.length * layer.tour.dwell + layer.tour.outro);
  });
});

/* ------------------------------------------- the painted-world series pilot */

const painted = () => paintedWorldProject();
const paintedRegions = () => layersOf(painted()).find((l) => l.type === 'regions') as RegionsLayer;

describe('the painted-world fixture', () => {
  it('is a live globe context holding the GDP choropleth', () => {
    const p = painted();
    expect(p.story).toHaveLength(1);
    const block = p.story[0]!;
    expect(block.t).toBe(0);
    expect(block.d).toBe(p.duration);
    expect(liveContext(p, 5)?.id).toBe(block.context);
    expect(resolveMapContext(p, 5).projection).toBe('globe');
    const layer = paintedRegions();
    expect(layer.ramp).toBe('inferno');
    expect(layer.flipRamp).toBe(true);
    expect(layer.max).toBe(46000);
  });

  it('names a real country with a real value for every stop', () => {
    const layer = paintedRegions();
    const geo = JSON.parse(layer.geojson) as { features: { properties: { name: string } }[] };
    const names = new Set(geo.features.map((f) => f.properties.name.toLowerCase()));
    const missing = layer.tour.customOrder.filter((n) => !names.has(n.trim().toLowerCase()));
    expect(missing).toEqual([]);
    const noValue = layer.tour.customOrder.filter((n) => layer.values[n] === undefined);
    expect(noValue).toEqual([]);
    expect(layer.tour.customOrder).toEqual(['Luxembourg', 'Switzerland', 'United States of America', 'Burundi']);
  });

  it('climbs the ladder — richest first, poorest last', () => {
    const layer = paintedRegions();
    const vals = layer.tour.customOrder.map((n) => layer.values[n] as number);
    expect(vals[0]).toBeGreaterThan(100000);
    expect(vals[1]).toBeGreaterThan(80000);
    expect(vals[2]).toBeLessThan(70000);
    expect(vals[3]).toBeLessThan(1000);
  });

  it('keeps the hand-keyframed camera and the story beats on the same windows', () => {
    const p = painted();
    const layer = paintedRegions();
    const cam = camerasOf(p)[0]!;
    const dwell = layer.tour.dwell;
    const tourStart = layer.in + layer.tour.intro;
    const times = cam.tracks.center.kind === 'keyframed' ? cam.tracks.center.keys.map((k) => k.t) : [];
    const zooms = cam.tracks.zoom.kind === 'keyframed' ? cam.tracks.zoom.keys : [];
    // The tour has a longer dwell than the plain GDP film: a ranked walk wants a beat to land.
    expect(dwell).toBeGreaterThanOrEqual(3);
    for (let i = 0; i < layer.tour.customOrder.length; i++) {
      const arrive = tourStart + i * dwell + layer.tour.moveTime;
      const depart = tourStart + i * dwell + dwell;
      expect(times).toContain(arrive);
      expect(times).toContain(depart);
      expect(zooms.find((k) => k.t === depart)?.dip).toBeGreaterThan(0);
    }
    expect(p.duration).toBeGreaterThan(tourStart + layer.tour.customOrder.length * dwell + layer.tour.outro);
  });
});

/* ------------------------------------------- the routes-as-stories pilot */

const routeStory = () => routeStoryProject();

describe('the routes-as-stories fixture', () => {
  it('is a live globe context whose story is one geodesic flight', () => {
    const p = routeStory();
    expect(p.story).toHaveLength(1);
    const block = p.story[0]!;
    expect(block.t).toBe(0);
    expect(block.d).toBe(p.duration);
    expect(liveContext(p, 5)?.id).toBe(block.context);
    expect(resolveMapContext(p, 5).projection).toBe('globe');
    const routes = layersOf(p).filter((l) => l.type === 'route');
    expect(routes).toHaveLength(1);
    const route = routes[0] as Extract<typeof routes[0], { type: 'route' }>;
    expect(route.coords).toHaveLength(5);
    expect(route.curve).toBe('geodesic');
    expect(route.marker?.enabled).toBe(true);
  });

  it('keys the camera to the moment the plane arrives at each city', () => {
    const p = routeStory();
    const cam = camerasOf(p)[0]!;
    const keys = cam.tracks.center.kind === 'keyframed' ? cam.tracks.center.keys.map((k) => k.t) : [];
    const zooms = cam.tracks.zoom.kind === 'keyframed' ? cam.tracks.zoom.keys : [];
    // The camera dives when the plane arrives: a marker's `in` is `arrival − 0.6`.
    const arrivals = layersOf(p)
      .filter((l) => l.type === 'marker')
      .map((m) => Math.round((m.in + 0.6) * 100) / 100);
    for (const t of arrivals) {
      // Camera keys hold the raw float; the marker's `in` is the same number minus 0.6, so
      // compare within a hair of rounding rather than exactly.
      expect(keys.some((k) => Math.abs(k - t) < 0.01)).toBe(true);
      // Every dive carries an arc, so flights read as curved over the sphere.
      expect(zooms.find((k) => Math.abs(k.t - t) < 0.01)?.dip).toBeGreaterThan(0);
    }
    // Arrival keyframes exist for all five cities, in journey order, inside the film.
    expect(keys.length).toBeGreaterThanOrEqual(7);
    expect(Math.max(...keys)).toBeLessThan(p.duration);
  });

  it('has a marker and a caption per city, both timed to that city', () => {
    const p = routeStory();
    const markers = layersOf(p).filter((l) => l.type === 'marker');
    const captions = layersOf(p).filter((l) => l.type === 'text' && l.name?.startsWith('Beat —'));
    expect(markers).toHaveLength(5);
    expect(captions).toHaveLength(5);
    for (const m of markers) {
      const coord = (m as Extract<typeof m, { type: 'marker' }>).coord;
      expect(Number.isFinite(coord[0]) && Number.isFinite(coord[1])).toBe(true);
    }
  });
});
