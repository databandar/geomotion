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
  // The cache lives at module scope, so a test that did not clear it would inherit the
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
