import { beforeEach, describe, expect, it } from 'vitest';
import type { Scene, ShapeStyle, RouteStyle } from '@geomotion/renderer';
import { resetSyncCache, syncScene } from './mapsync.ts';
import { FakeMap } from './fake-map.ts';

/**
 * The contract `syncScene` keeps with the map.
 *
 * This is the app's only stateful mutation of GL, and the hardest part to see: its
 * result is a sequence of calls, not a value. The golden harness proves the pixels
 * come out right but cannot say why — a sync that re-uploads every source every frame
 * renders identically to one that does not, and only one of those can play back.
 *
 * So these assert on the calls: what gets created, what gets skipped on a frame that
 * changed nothing, and what gets torn down when a layer leaves.
 */

const SQUARE = JSON.stringify({
  type: 'Polygon',
  coordinates: [[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]],
});

function shapeStyle(patch: Partial<ShapeStyle> = {}): ShapeStyle {
  return {
    id: 's1',
    geojson: SQUARE,
    fillColor: '#ff0000',
    fillOpacity: 0.5,
    lineColor: '#00ff00',
    lineWidth: 2,
    traceOutline: false,
    extrude: false,
    extrudeHeight: 100,
    ...patch,
  };
}

function routeStyle(patch: Partial<RouteStyle> = {}): RouteStyle {
  return {
    id: 'r1',
    color: '#4cc2ff',
    width: 3,
    opacity: 1,
    dashed: false,
    glow: false,
    marker: { enabled: false, icon: 'dot', color: '#fff', size: 10, rotate: false },
    ...patch,
  };
}

/** An otherwise empty scene carrying whatever is under test. */
function scene(patch: Partial<Scene> = {}): Scene {
  return {
    time: 0,
    camera: { center: [0, 0], zoom: 2, bearing: 0, pitch: 0 },
    routes: [],
    markers: [],
    texts: [],
    shapes: [],
    regions: [],
    clouds: [],
    images: [],
    ...patch,
  };
}

const withShape = (style = shapeStyle(), alpha = 1, trace = 0) =>
  scene({ shapes: [{ style, alpha, trace }] });

const withRoute = (style = routeStyle()) =>
  scene({
    routes: [{ style, alpha: 1, progress: 0.5, drawn: [[0, 0], [1, 1]], head: [1, 1], heading: 0 }],
  });

let map: FakeMap;

beforeEach(() => {
  // The cache is keyed by map, so a test that did not clear it would inherit the
  // previous test's idea of what the map already shows.
  resetSyncCache();
  map = new FakeMap();
});

const sync = (s: Scene) => syncScene(map as never, s);

describe('syncScene — before the style is ready', () => {
  it('does nothing at all', () => {
    // MapLibre throws on addLayer before style load, and the render loop starts
    // before the basemap finishes fetching, so this is the normal first few frames.
    map.setStyleLoaded(false);
    sync(withShape());
    expect(map.calls).toEqual([]);
  });
});

describe('syncScene — creating a shape', () => {
  it('adds the source and its fill and line layers', () => {
    sync(withShape());
    const { sources, layers } = map.state();
    expect(sources).toEqual(['gm-shape-s1']);
    expect(layers).toEqual(['gm-shape-s1-fill', 'gm-shape-s1-line']);
  });

  it('paints the style it was given', () => {
    sync(withShape());
    const paint = Object.fromEntries(map.ops('setPaint').map((c) => [`${c.id}|${c.prop}`, c.value]));
    expect(paint['gm-shape-s1-fill|fill-color']).toBe('#ff0000');
    expect(paint['gm-shape-s1-line|line-color']).toBe('#00ff00');
    expect(paint['gm-shape-s1-line|line-width']).toBe(2);
  });

  it('folds layer alpha into opacity rather than leaving it to the caller', () => {
    sync(withShape(shapeStyle({ fillOpacity: 0.8 }), 0.5));
    const c = map.ops('setPaint').find((x) => x.prop === 'fill-opacity');
    expect(c?.value).toBeCloseTo(0.4);
  });
});

describe('syncScene — a frame that changed nothing', () => {
  it('re-sets no paint property', () => {
    // The reason the cache exists. Without it every property is pushed to GL on every
    // frame of playback, for a composition that is not moving.
    const s = withShape();
    sync(s);
    map.flush();
    sync(s);
    expect(map.ops('setPaint')).toEqual([]);
  });

  it('adds no source or layer twice', () => {
    const s = withShape();
    sync(s);
    map.flush();
    sync(s);
    expect(map.ops('addSource')).toEqual([]);
    expect(map.ops('addLayer')).toEqual([]);
  });

  it('still pushes a property once it actually changes', () => {
    sync(withShape());
    map.flush();
    sync(withShape(shapeStyle({ fillColor: '#0000ff' })));
    const c = map.ops('setPaint').find((x) => x.prop === 'fill-color');
    expect(c?.value).toBe('#0000ff');
  });

  it('compares arrays by value, not by identity', () => {
    // `line-dasharray` is rebuilt as a fresh array every frame; by identity it would
    // never match and would be re-set forever.
    const dashed = routeStyle({ dashed: true });
    sync(withRoute(dashed));
    map.flush();
    sync(withRoute(routeStyle({ dashed: true })));
    expect(map.ops('setPaint').filter((c) => c.prop === 'line-dasharray')).toEqual([]);
  });
});

describe('syncScene — clearing a property back to its default', () => {
  it('sends the clear the first time it is asked for', () => {
    /*
     * The trap this pins. `undefined` is a real value here — it is how a paint property
     * is reset — and a cache that compares `get(key) === next` cannot tell "never set"
     * from "set to undefined", so the first clear was skipped.
     *
     * Reachable whenever the cache is empty but the map is not: `resetSyncCache` is
     * called on style load today, which destroys the layers too, but nothing states
     * that coupling and nothing enforces it.
     */
    sync(withRoute(routeStyle({ dashed: true })));
    map.flush();
    resetSyncCache();
    sync(withRoute(routeStyle({ dashed: false })));

    const cleared = map.ops('setPaint').find((c) => c.prop === 'line-dasharray');
    expect(cleared).toBeDefined();
    expect(cleared?.value).toBeUndefined();
  });

  it('does not repeat the clear on the next frame', () => {
    sync(withRoute(routeStyle({ dashed: false })));
    map.flush();
    sync(withRoute(routeStyle({ dashed: false })));
    expect(map.ops('setPaint').filter((c) => c.prop === 'line-dasharray')).toEqual([]);
  });
});

describe('syncScene — a dashed route', () => {
  it('sets the dash through the paint API, not the layout one', () => {
    /*
     * `line-dasharray` is a paint property; MapLibre throws if it arrives at
     * setLayoutProperty. This shipped broken — the dashed toggle threw inside the
     * render loop every time it was switched on — and stayed hidden because the cache
     * skipped the very first `undefined`, so an undashed route never made the call at
     * all. Found when fixing that cache: the golden harness started reporting the
     * error it had been silently avoiding.
     */
    expect(() => sync(withRoute(routeStyle({ dashed: true })))).not.toThrow();
    const c = map.ops('setPaint').find((x) => x.prop === 'line-dasharray');
    expect(c?.value).toEqual([2, 1.6]);
    expect(map.ops('setLayout').some((x) => x.prop === 'line-dasharray')).toBe(false);
  });

  it('clears the dash when it is switched off', () => {
    sync(withRoute(routeStyle({ dashed: true })));
    map.flush();
    sync(withRoute(routeStyle({ dashed: false })));
    const c = map.ops('setPaint').find((x) => x.prop === 'line-dasharray');
    expect(c).toBeDefined();
    expect(c?.value).toBeUndefined();
  });
});

describe('syncScene — switching a shape between outline modes', () => {
  it('removes the plain line when tracing takes over', () => {
    sync(withShape());
    expect(map.state().layers).toContain('gm-shape-s1-line');

    map.flush();
    sync(withShape(shapeStyle({ traceOutline: true }), 1, 0.5));
    expect(map.state().layers).not.toContain('gm-shape-s1-line');
    expect(map.state().layers).toContain('gm-shape-s1-trace');
  });

  it('removes the trace when it is turned back off', () => {
    sync(withShape(shapeStyle({ traceOutline: true }), 1, 0.5));
    map.flush();
    sync(withShape());
    expect(map.state().layers).not.toContain('gm-shape-s1-trace');
    expect(map.state().layers).toContain('gm-shape-s1-line');
  });

  it('adds and removes the extrusion with the flag', () => {
    sync(withShape(shapeStyle({ extrude: true })));
    expect(map.state().layers).toContain('gm-shape-s1-3d');
    map.flush();
    sync(withShape());
    expect(map.state().layers).not.toContain('gm-shape-s1-3d');
  });
});

describe('syncScene — two maps at once', () => {
  it('does not let one map answer for another', () => {
    /*
     * The cache used to live in one module-level Map, so a second map read the first
     * one's answers and skipped properties it had never been told. Nothing runs two
     * maps today — which is precisely the shape of "safe because of something nothing
     * states" that produced the dasharray bug.
     */
    const other = new FakeMap();
    const s = withShape();
    sync(s);
    map.flush();

    syncScene(other as never, s);
    // The second map is empty, so it must receive everything, not be told it is current.
    expect(other.ops('addLayer').length).toBeGreaterThan(0);
    expect(other.ops('setPaint').length).toBeGreaterThan(0);
  });

  it('resetting one map leaves the other cache alone', () => {
    const other = new FakeMap();
    const s = withShape();
    sync(s);
    syncScene(other as never, s);
    other.flush();
    map.flush();

    resetSyncCache(other as never);
    syncScene(other as never, s);
    expect(other.ops('setPaint').length).toBeGreaterThan(0);

    sync(s);
    expect(map.ops('setPaint')).toEqual([]);
  });
});

describe('syncScene — stacking a glow under its line', () => {
  const glowing = () => withRoute(routeStyle({ glow: true }));

  it('puts the glow beneath the line when the layer is built with it on', () => {
    sync(glowing());
    expect(map.order()).toEqual(['gm-route-r1-glow', 'gm-route-r1-line']);
  });

  it('puts it in the same place when the toggle is flipped later', () => {
    /*
     * The bug, measured in a live map before it was fixed: built with glow on, the
     * order is `[glow, line]`; switched on afterwards it is `[line, glow]`, putting a
     * blurred halo three times the line's width on top of it. One project therefore
     * rendered one way when opened and another when the toggle was flipped, and the
     * editor disagreed with the export, which always builds its layers fresh.
     */
    sync(withRoute());
    map.flush();
    sync(glowing());
    expect(map.order()).toEqual(['gm-route-r1-glow', 'gm-route-r1-line']);
  });

  it('keeps the order through repeated toggling', () => {
    // The tour's highlight glow is an animated value that crosses its threshold at each
    // stop when `sequenceReveal` is on, dropping the layer and re-adding it repeatedly.
    sync(glowing());
    sync(withRoute());
    sync(glowing());
    sync(withRoute());
    sync(glowing());
    expect(map.order()).toEqual(['gm-route-r1-glow', 'gm-route-r1-line']);
  });

  it('removes the glow when it is switched off', () => {
    sync(glowing());
    map.flush();
    sync(withRoute());
    expect(map.order()).toEqual(['gm-route-r1-line']);
  });
});

describe('syncScene — a layer that leaves the composition', () => {
  it('takes its source and layers with it', () => {
    sync(withShape());
    expect(map.state().sources).toContain('gm-shape-s1');

    map.flush();
    sync(scene());
    expect(map.state().sources).toEqual([]);
    expect(map.state().layers).toEqual([]);
  });

  it('leaves anything the app did not add alone', () => {
    // The basemap's own sources share the map. Only the `gm-` prefix is ours.
    map.addSource('satellite', { data: null });
    map.addLayer({ id: 'satellite-raster', source: 'satellite' });
    sync(scene());
    expect(map.state().sources).toContain('satellite');
    expect(map.state().layers).toContain('satellite-raster');
  });

  it('survives a source that is still referenced, and clears it next frame', () => {
    /*
     * Real MapLibre throws when a source still has a layer on it, which happens when
     * removal order leaves one behind. `syncScene` swallows that on purpose — the
     * alternative is a thrown error inside the render loop — so the recovery is what
     * matters: it must not leave the map wedged.
     */
    sync(withShape());
    map.flush();
    map.addLayer({ id: 'stray', source: 'gm-shape-s1' });

    expect(() => sync(scene())).not.toThrow();
    expect(map.state().sources).toContain('gm-shape-s1');

    map.removeLayer('stray');
    sync(scene());
    expect(map.state().sources).toEqual([]);
  });
});

describe('syncScene — line style', () => {
  it('falls back to the legacy dashed boolean when lineStyle is absent', () => {
    // Every route saved before `lineStyle` existed has only `dashed` — this is the
    // exact scenario the earlier "sets the dash through the paint API" test covers,
    // restated here to pin the fallback explicitly rather than incidentally.
    sync(withRoute(routeStyle({ dashed: true })));
    const c = map.ops('setPaint').find((x) => x.prop === 'line-dasharray');
    expect(c?.value).toEqual([2, 1.6]);
  });

  it('lineStyle wins over dashed when both are present', () => {
    sync(withRoute(routeStyle({ dashed: false, lineStyle: 'dotted' })));
    const c = map.ops('setPaint').find((x) => x.prop === 'line-dasharray');
    expect(c?.value).toEqual([0.3, 1.5]);
  });

  it('draws no dasharray for solid', () => {
    sync(withRoute(routeStyle({ lineStyle: 'solid' })));
    const c = map.ops('setPaint').find((x) => x.prop === 'line-dasharray');
    expect(c?.value).toBeUndefined();
  });

  it('longdash is a longer pattern than dashed', () => {
    sync(withRoute(routeStyle({ lineStyle: 'longdash' })));
    const c = map.ops('setPaint').find((x) => x.prop === 'line-dasharray');
    expect(c?.value).toEqual([4, 1.8]);
  });

  it('rail draws two offset lines instead of the single line layer', () => {
    sync(withRoute(routeStyle({ lineStyle: 'rail' })));
    const { layers } = map.state();
    expect(layers).not.toContain('gm-route-r1-line');
    expect(layers).toContain('gm-route-r1-rail-a');
    expect(layers).toContain('gm-route-r1-rail-b');

    const offsets = (map.ops('setPaint').filter((c) => c.prop === 'line-offset').map((c) => c.value) as number[]).sort((a, b) => a - b);
    expect(offsets[0]).toBeCloseTo(-3.45, 5); // -width(3) * 1.15
    expect(offsets[1]).toBeCloseTo(3.45, 5); // mirrored to the other side
  });

  it('switching away from rail removes both rail layers and restores the single line', () => {
    sync(withRoute(routeStyle({ lineStyle: 'rail' })));
    map.flush();
    sync(withRoute(routeStyle({ lineStyle: 'solid' })));
    const { layers } = map.state();
    expect(layers).not.toContain('gm-route-r1-rail-a');
    expect(layers).not.toContain('gm-route-r1-rail-b');
    expect(layers).toContain('gm-route-r1-line');
  });

  it('rail suppresses the glow layer, which only makes sense for a single line', () => {
    sync(withRoute(routeStyle({ lineStyle: 'rail', glow: true })));
    expect(map.state().layers).not.toContain('gm-route-r1-glow');
  });
});

describe('syncScene — animated dash', () => {
  it('is static (equal to the base pattern) when animateDash is off', () => {
    sync(withRoute(routeStyle({ lineStyle: 'dashed', animateDash: false })));
    const c = map.ops('setPaint').find((x) => x.prop === 'line-dasharray');
    expect(c?.value).toEqual([2, 1.6]);
  });

  it('produces a different array at a different time when animateDash is on', () => {
    sync({ ...withRoute(routeStyle({ lineStyle: 'dashed', animateDash: true })), time: 0 });
    const at0 = map.ops('setPaint').find((x) => x.prop === 'line-dasharray')?.value;
    map.flush();
    resetSyncCache(); // a genuinely different array at the same cache key must still be sent
    sync({ ...withRoute(routeStyle({ lineStyle: 'dashed', animateDash: true })), time: 0.5 });
    const at05 = map.ops('setPaint').find((x) => x.prop === 'line-dasharray')?.value;
    expect(at05).not.toEqual(at0);
  });

  it('starts with the full first dash length at time 0 (no phase shift yet)', () => {
    sync({ ...withRoute(routeStyle({ lineStyle: 'dashed', animateDash: true })), time: 0 });
    const arr = map.ops('setPaint').find((x) => x.prop === 'line-dasharray')?.value as number[];
    expect(arr[0]).toBeCloseTo(2, 5); // dashed's base pattern is [2, 1.6]
  });

  it('shortens the first segment continuously as time advances within one cycle', () => {
    // speed = cycle * 0.6, cycle = 3.6, so the pattern re-wraps every 1/0.6 ≈ 1.667s.
    const firstSegmentAt = (t: number) => {
      resetSyncCache();
      map = new FakeMap();
      sync({ ...withRoute(routeStyle({ lineStyle: 'dashed', animateDash: true })), time: t });
      return (map.ops('setPaint').find((x) => x.prop === 'line-dasharray')?.value as number[])[0]!;
    };
    const a = firstSegmentAt(0.1);
    const b = firstSegmentAt(0.5);
    const c = firstSegmentAt(0.9); // still inside the "on" part of the first cycle (< 2/0.6*... )
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
  });

  it('is periodic: the same time modulo the pattern period gives the same array', () => {
    // offset = (time * cycle*0.6) % cycle, so it repeats whenever time advances by
    // exactly 1/0.6 — the cycle length itself cancels out of that period.
    const period = 1 / 0.6;
    const firstSegmentAt = (t: number) => {
      resetSyncCache();
      map = new FakeMap();
      sync({ ...withRoute(routeStyle({ lineStyle: 'dashed', animateDash: true })), time: t });
      return (map.ops('setPaint').find((x) => x.prop === 'line-dasharray')?.value as number[])[0]!;
    };
    expect(firstSegmentAt(0.4)).toBeCloseTo(firstSegmentAt(0.4 + period), 5);
  });

  it('animates the rail ties too', () => {
    sync({ ...withRoute(routeStyle({ lineStyle: 'rail', animateDash: true })), time: 0.4 });
    const arrs = map.ops('setPaint').filter((x) => x.prop === 'line-dasharray').map((c) => c.value);
    expect(arrs.length).toBe(2); // one per rail
    expect(arrs[0]).toEqual(arrs[1]); // both ties march together
  });
});

describe('syncScene — comet tail', () => {
  const longRoute = () =>
    scene({
      routes: [{
        style: routeStyle({ cometTail: true }),
        alpha: 1,
        progress: 1,
        drawn: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0]],
        head: [10, 0],
        heading: 0,
      }],
    });

  it('adds a second short line on its own source when enabled', () => {
    sync(longRoute());
    const { sources, layers } = map.state();
    expect(sources).toContain('gm-route-r1-comet-src');
    expect(layers).toContain('gm-route-r1-comet-src-line');
  });

  it('draws only the stretch nearest the head, ending exactly at it', () => {
    sync(longRoute());
    const src = map.getStyle().sources['gm-route-r1-comet-src'] as { data: GeoJSON.FeatureCollection };
    const feature = src.data.features[0] as GeoJSON.Feature<GeoJSON.LineString>;
    const coords = feature.geometry.coordinates;
    expect(coords.length).toBeGreaterThan(0);
    expect(coords.length).toBeLessThan(11); // shorter than the full drawn path
    expect(coords.at(-1)).toEqual([10, 0]); // reaches the head
    expect(coords[0]).not.toEqual([0, 0]); // does not start at the route's own start
  });

  it('is absent when cometTail is off', () => {
    sync(withRoute(routeStyle({ cometTail: false })));
    expect(map.state().layers).not.toContain('gm-route-r1-comet-src-line');
  });

  it('is removed once cometTail is switched off', () => {
    sync(longRoute());
    map.flush();
    sync(withRoute(routeStyle({ cometTail: false })));
    expect(map.state().sources).not.toContain('gm-route-r1-comet-src');
    expect(map.state().layers).not.toContain('gm-route-r1-comet-src-line');
  });
});

describe('syncScene — geometry uploads', () => {
  it('uploads the parsed shape', () => {
    sync(withShape());
    expect(map.ops('setData').map((c) => c.id)).toContain('gm-shape-s1');
  });

  it('re-parses only when the geojson text changes', () => {
    // parseShape caches on the raw string; re-parsing a large collection every frame
    // is the difference between a smooth scrub and a stuttering one.
    const s = withShape();
    sync(s);
    sync(s);
    sync(s);
    // The parse cache is keyed by the raw text, so all three frames share one object.
    const src = map.getStyle().sources['gm-shape-s1'] as { writes: unknown[] };
    expect(new Set(src.writes).size).toBe(1);
  });
});
