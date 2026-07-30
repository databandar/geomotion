import { describe, expect, it } from 'vitest';
import type { RegionsLayer } from '@geomotion/document';
import { createLayer } from '@geomotion/document';
import { clearRegionCache, fitBounds, regionSet } from './regions';

/**
 * Behavioural spec for the region join and the framing solver.
 *
 * `fitBounds` is architecturally load-bearing: ARCHITECTURE §09 makes it the
 * ONLY path from "frame this entity" to camera values, shared by the
 * double-click gesture, the tour, and the AI camera choreographer. If those
 * three ever disagree about framing, this contract has been broken.
 *
 * Bound for `packages/geometry` (solver) and `packages/entities` (the join).
 */

/** A two-square-region collection with known bounds, for deterministic asserts. */
function twoSquares() {
  return JSON.stringify({
    type: 'FeatureCollection',
    features: [
      {
        type: 'Feature',
        properties: { name: 'Alpha' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
        },
      },
      {
        type: 'Feature',
        properties: { name: 'Beta' },
        geometry: {
          type: 'Polygon',
          coordinates: [[[20, 20], [30, 20], [30, 30], [20, 30], [20, 20]]],
        },
      },
    ],
  });
}

function layerWith(patch: Partial<RegionsLayer> = {}): RegionsLayer {
  const layer = createLayer('regions', 0) as RegionsLayer;
  Object.assign(layer, { geojson: twoSquares(), nameKey: 'name' }, patch);
  clearRegionCache(); // the module memoises per layer id
  return layer;
}

describe('regionSet — parsing and the data join', () => {
  it('parses features and assigns stable 1-based feature ids', () => {
    const set = regionSet(layerWith({ values: { Alpha: 10, Beta: 20 } }), false);
    expect(set.regions.map((r) => r.name)).toEqual(['Alpha', 'Beta']);
    expect(set.regions.map((r) => r.id)).toEqual([1, 2]);
  });

  it('reports regions with no matching value as null rather than zero', () => {
    // Rendering a hole as 0 would be a silent lie; it must read as "no data".
    const set = regionSet(layerWith({ values: { Alpha: 10 } }), false);
    expect(set.regions[0].value).toBe(10);
    expect(set.regions[1].value).toBeNull();
    expect(set.withValues).toBe(1);
  });

  it('ranks descending by value and leaves unvalued regions unranked', () => {
    const set = regionSet(layerWith({ values: { Alpha: 10, Beta: 99 } }), false);
    const byName = Object.fromEntries(set.regions.map((r) => [r.name, r.rank]));
    expect(byName).toEqual({ Beta: 1, Alpha: 2 });

    const partial = regionSet(layerWith({ values: { Alpha: 10 } }), false);
    expect(partial.regions.find((r) => r.name === 'Beta')!.rank).toBeNull();
  });

  it('derives an auto domain from the values present', () => {
    const set = regionSet(layerWith({ values: { Alpha: 4, Beta: 16 }, autoDomain: true }), false);
    expect(set.domain).toEqual([4, 16]);
  });

  it('never produces a zero-width domain, which would divide by zero downstream', () => {
    const set = regionSet(layerWith({ values: { Alpha: 7, Beta: 7 }, autoDomain: true }), false);
    expect(set.domain[1]).toBeGreaterThan(set.domain[0]);
  });

  it('honours a manual domain over the data range', () => {
    const set = regionSet(
      layerWith({ values: { Alpha: 4, Beta: 16 }, autoDomain: false, min: 0, max: 100 }),
      false,
    );
    expect(set.domain).toEqual([0, 100]);
  });

  it('bakes a fill colour per valued region and the no-data colour otherwise', () => {
    const layer = layerWith({ values: { Alpha: 4 }, noDataColor: '#123456' });
    const set = regionSet(layer, false);
    expect(set.regions[0].fill).toMatch(/^#[0-9a-f]{6}$/);
    expect(set.regions[1].fill).toBe('#123456');
  });

  it('returns an empty set for malformed or empty geojson instead of throwing', () => {
    for (const bad of ['', 'not json', '{}', '{"type":"FeatureCollection","features":[]}']) {
      const set = regionSet(layerWith({ geojson: bad }), false);
      expect(set.regions).toEqual([]);
      expect(set.order).toEqual([]);
    }
  });

  it('computes bounds spanning every region', () => {
    const set = regionSet(layerWith({ values: { Alpha: 1, Beta: 2 } }), false);
    expect(set.bounds).toEqual([0, 0, 30, 30]);
  });

  describe('tour ordering', () => {
    const values = { Alpha: 10, Beta: 99 };

    it('valueDesc visits the highest first', () => {
      const set = regionSet(layerWith({ values, order: 'valueDesc' }), false);
      expect(set.order.map((i) => set.regions[i].name)).toEqual(['Beta', 'Alpha']);
    });

    it('valueAsc visits the lowest first', () => {
      const set = regionSet(layerWith({ values, order: 'valueAsc' }), false);
      expect(set.order.map((i) => set.regions[i].name)).toEqual(['Alpha', 'Beta']);
    });

    it('value orderings exclude unvalued regions so they cannot lead the tour', () => {
      const set = regionSet(layerWith({ values: { Alpha: 10 }, order: 'valueDesc' }), false);
      expect(set.order.map((i) => set.regions[i].name)).toEqual(['Alpha']);
    });

    it('alpha sorts by name, and geojson keeps file order', () => {
      expect(
        regionSet(layerWith({ values, order: 'alpha' }), false).order,
      ).toEqual([0, 1]);
      expect(
        regionSet(layerWith({ values, order: 'geojson' }), false).order,
      ).toEqual([0, 1]);
    });

    it('custom order follows the list, case-insensitively, dropping unknown names', () => {
      const set = regionSet(
        layerWith({ values, order: 'custom', customOrder: ['beta', 'Nowhere', 'Alpha'] }),
        false,
      );
      expect(set.order.map((i) => set.regions[i].name)).toEqual(['Beta', 'Alpha']);
    });

    it('custom order falls back to every region when nothing matches', () => {
      const set = regionSet(layerWith({ values, order: 'custom', customOrder: ['Nowhere'] }), false);
      expect(set.order).toHaveLength(2);
    });
  });
});

describe('fitBounds — the framing solver', () => {
  const square: [number, number, number, number] = [0, 0, 10, 10];

  it('centres the camera on the bounds', () => {
    const cam = fitBounds(square, 1920, 1080, 0.1, 0);
    expect(cam.center[0]).toBeCloseTo(5, 6);
    expect(cam.center[1]).toBeCloseTo(5.03, 1); // Mercator pulls the centre slightly north
    expect(cam.bearing).toBe(0);
  });

  it('is deterministic for identical inputs', () => {
    // ARCHITECTURE §09: humans, the tour, and the AI copilot must all land on the
    // same framing from the same target.
    const a = fitBounds(square, 1920, 1080, 0.2, 30, 8);
    const b = fitBounds(square, 1920, 1080, 0.2, 30, 8);
    expect(a).toEqual(b);
  });

  it('zooms in further for a smaller region', () => {
    const big = fitBounds([0, 0, 40, 40], 1920, 1080, 0.1, 0);
    const small = fitBounds([0, 0, 2, 2], 1920, 1080, 0.1, 0);
    expect(small.zoom).toBeGreaterThan(big.zoom);
  });

  it('zooms out as padding grows', () => {
    const tight = fitBounds(square, 1920, 1080, 0, 0);
    const loose = fitBounds(square, 1920, 1080, 0.4, 0);
    expect(loose.zoom).toBeLessThan(tight.zoom);
  });

  it('zooms out for a pitched camera, which sees further', () => {
    const flat = fitBounds(square, 1920, 1080, 0.1, 0);
    const pitched = fitBounds(square, 1920, 1080, 0.1, 60);
    expect(pitched.zoom).toBeLessThan(flat.zoom);
    expect(pitched.pitch).toBe(60);
  });

  it('depends on viewport pixels — the reason preview renders at output size', () => {
    // A wider canvas shows more world at the same zoom, so a smaller viewport
    // must fit the same bounds at a lower zoom. This is why v1's preview renders
    // at output resolution (ARCHITECTURE §00, §14).
    const big = fitBounds(square, 1920, 1080, 0.1, 0);
    const small = fitBounds(square, 960, 540, 0.1, 0);
    expect(small.zoom).toBeLessThan(big.zoom);
    expect(big.zoom - small.zoom).toBeCloseTo(1, 3); // halving both axes = one zoom level
  });

  it('respects the maxZoom clamp so tiny regions keep context', () => {
    const tiny: [number, number, number, number] = [0, 0, 0.01, 0.01];
    expect(fitBounds(tiny, 1920, 1080, 0.1, 0).zoom).toBeGreaterThan(8);
    expect(fitBounds(tiny, 1920, 1080, 0.1, 0, 8).zoom).toBe(8);
  });

  it('keeps zoom inside the renderable range for degenerate bounds', () => {
    const point: [number, number, number, number] = [5, 5, 5, 5];
    const cam = fitBounds(point, 1920, 1080, 0.1, 0);
    expect(Number.isFinite(cam.zoom)).toBe(true);
    expect(cam.zoom).toBeGreaterThanOrEqual(0);
    expect(cam.zoom).toBeLessThanOrEqual(20);
  });

  it('clamps padding to a sane maximum rather than inverting the fit', () => {
    // Padding at or above 0.5 would leave zero usable frame.
    const absurd = fitBounds(square, 1920, 1080, 5, 0);
    expect(Number.isFinite(absurd.zoom)).toBe(true);
    expect(absurd.zoom).toBeGreaterThanOrEqual(0);
  });

  it('produces the same zoom for congruent bounds at the same latitude', () => {
    const a = fitBounds([0, 0, 10, 10], 1920, 1080, 0.1, 0);
    const b = fitBounds([40, 0, 50, 10], 1920, 1080, 0.1, 0);
    expect(a.zoom).toBeCloseTo(b.zoom, 9);
  });
});
