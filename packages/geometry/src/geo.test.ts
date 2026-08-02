import { describe, expect, it } from 'vitest';
import type { LngLat } from '@geomotion/core';
import {
  antimeridianRisks, bearing, buildPath, fitBounds, haversine, headingAt, MAX_MERCATOR_LATITUDE,
  measure, pointAt, polarClipRisks, sliceAt, slerp, unwrap,
} from './geo.ts';

/**
 * Behavioural spec for the geo primitives.
 *
 * This suite travelled with the code out of v1 and into `packages/geometry`
 * (ARCHITECTURE §08) unchanged — it is what made that move verifiable. It remains
 * the contract: if an implementation disagrees with any assertion here, the
 * implementation is wrong until an ADR says otherwise.
 */

const LONDON: LngLat = [-0.1276, 51.5072];
const PARIS: LngLat = [2.3522, 48.8566];
const NEW_YORK: LngLat = [-74.006, 40.7128];
const TOKYO: LngLat = [139.6917, 35.6895];

describe('haversine', () => {
  it('measures known great-circle distances within 0.5%', () => {
    // Reference values from independent great-circle calculators.
    expect(haversine(LONDON, PARIS)).toBeCloseTo(343_500, -3);
    expect(haversine(LONDON, NEW_YORK)).toBeCloseTo(5_570_000, -4);
  });

  it('is zero for identical points and symmetric', () => {
    expect(haversine(LONDON, LONDON)).toBe(0);
    expect(haversine(LONDON, TOKYO)).toBeCloseTo(haversine(TOKYO, LONDON), 6);
  });

  it('handles antipodal-ish spans without NaN', () => {
    const d = haversine([0, 0], [180, 0]);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(20_000_000);
  });
});

describe('bearing', () => {
  it('returns compass degrees in [0, 360)', () => {
    expect(bearing([0, 0], [0, 10])).toBeCloseTo(0, 4); // due north
    expect(bearing([0, 0], [10, 0])).toBeCloseTo(90, 4); // due east
    expect(bearing([0, 0], [0, -10])).toBeCloseTo(180, 4); // due south
    expect(bearing([0, 0], [-10, 0])).toBeCloseTo(270, 4); // due west
  });
});

describe('slerp', () => {
  it('returns the endpoints at f=0 and f=1, to trig precision', () => {
    // Endpoints round-trip through the spherical maths, so they land within
    // ~1e-12 rather than bit-exact. Any port must hold this tolerance.
    const start = slerp(LONDON, TOKYO, 0);
    expect(start[0]).toBeCloseTo(LONDON[0], 10);
    expect(start[1]).toBeCloseTo(LONDON[1], 10);
    const end = slerp(LONDON, TOKYO, 1);
    expect(end[0]).toBeCloseTo(TOKYO[0], 10);
    expect(end[1]).toBeCloseTo(TOKYO[1], 10);
  });

  it('places the midpoint equidistant from both ends', () => {
    const mid = slerp(LONDON, NEW_YORK, 0.5);
    expect(haversine(LONDON, mid)).toBeCloseTo(haversine(mid, NEW_YORK), -2);
  });

  it('bulges poleward relative to the naive lat/lng average', () => {
    // The defining property of a great circle at mid-latitudes: it passes north
    // of the straight line drawn on an equirectangular map.
    const mid = slerp(LONDON, NEW_YORK, 0.5);
    const naiveLat = (LONDON[1] + NEW_YORK[1]) / 2;
    expect(mid[1]).toBeGreaterThan(naiveLat);
  });

  it('degenerates safely when both points coincide', () => {
    expect(slerp(LONDON, LONDON, 0.5)).toEqual(LONDON);
  });
});

describe('unwrap', () => {
  it('keeps longitudes continuous across the antimeridian', () => {
    const out = unwrap([
      [170, 0],
      [-170, 0],
    ]);
    // The second point must read as 190, not -170, or the line wraps the globe.
    expect(out[1]![0]).toBe(190);
  });

  it('leaves ordinary sequences untouched', () => {
    const input: LngLat[] = [
      [0, 0],
      [10, 5],
      [20, 10],
    ];
    expect(unwrap(input)).toEqual(input);
  });

  it('returns empty for empty input', () => {
    expect(unwrap([])).toEqual([]);
  });
});

describe('buildPath', () => {
  it('passes straight paths through as the control points', () => {
    const pts: LngLat[] = [LONDON, PARIS, TOKYO];
    expect(buildPath(pts, 'straight')).toHaveLength(3);
  });

  it('densifies geodesic and arc paths', () => {
    expect(buildPath([LONDON, TOKYO], 'geodesic').length).toBeGreaterThan(50);
    expect(buildPath([LONDON, TOKYO], 'arc').length).toBeGreaterThan(50);
  });

  it('does not duplicate the shared vertex between segments', () => {
    const path = buildPath([LONDON, PARIS, TOKYO], 'geodesic');
    for (let i = 1; i < path.length; i++) {
      expect(path[i]).not.toEqual(path[i - 1]);
    }
  });

  it('starts and ends at the outer control points', () => {
    const path = buildPath([LONDON, TOKYO], 'geodesic');
    expect(path[0]![0]).toBeCloseTo(LONDON[0], 4);
    expect(path.at(-1)![0]).toBeCloseTo(TOKYO[0], 4);
  });

  it('makes an arc longer than the geodesic between the same points', () => {
    const geo = measure(buildPath([LONDON, TOKYO], 'geodesic')).length;
    const arc = measure(buildPath([LONDON, TOKYO], 'arc')).length;
    expect(arc).toBeGreaterThan(geo);
  });

  it('handles degenerate inputs', () => {
    expect(buildPath([], 'geodesic')).toEqual([]);
    expect(buildPath([LONDON], 'geodesic')).toHaveLength(1);
  });
});

describe('measure / pointAt / headingAt / sliceAt', () => {
  const path = measure(buildPath([LONDON, PARIS], 'geodesic'));

  it('accumulates a monotonic cumulative length', () => {
    for (let i = 1; i < path.cum.length; i++) {
      expect(path.cum[i]!).toBeGreaterThanOrEqual(path.cum[i - 1]!);
    }
    expect(path.length).toBeCloseTo(path.cum.at(-1)!, 6);
  });

  it('pointAt hits the endpoints and clamps out-of-range fractions', () => {
    expect(pointAt(path, 0)[0]).toBeCloseTo(LONDON[0], 4);
    expect(pointAt(path, 1)[0]).toBeCloseTo(PARIS[0], 4);
    expect(pointAt(path, -5)).toEqual(pointAt(path, 0));
    expect(pointAt(path, 5)).toEqual(pointAt(path, 1));
  });

  it('pointAt advances monotonically along the path', () => {
    let prev = 0;
    for (let f = 0.1; f <= 1; f += 0.1) {
      const travelled = haversine(pointAt(path, 0), pointAt(path, f));
      expect(travelled).toBeGreaterThan(prev);
      prev = travelled;
    }
  });

  it('headingAt turns along the great circle, between the initial and final bearing', () => {
    // Heading is NOT constant on a great circle — that is the difference between
    // a geodesic and a rhumb line. London->Paris turns ~2 degrees end to end, so
    // assert the ordering rather than a single tolerance.
    const initial = bearing(LONDON, PARIS);
    const final = bearing(path.coords.at(-2)!, path.coords.at(-1)!);
    const mid = headingAt(path, 0.5);
    expect(mid).toBeGreaterThan(Math.min(initial, final) - 1e-6);
    expect(mid).toBeLessThan(Math.max(initial, final) + 1e-6);
    expect(Math.abs(mid - initial)).toBeLessThan(5); // still a short hop
  });

  it('sliceAt returns a prefix that ends exactly at the requested fraction', () => {
    const f = 0.42;
    const slice = sliceAt(path, f);
    expect(slice.length).toBeGreaterThan(1);
    const head = slice.at(-1)!;
    const expected = pointAt(path, f);
    expect(head[0]).toBeCloseTo(expected[0], 9);
    expect(head[1]).toBeCloseTo(expected[1], 9);
  });

  it('sliceAt is empty at 0 and whole at 1', () => {
    expect(sliceAt(path, 0)).toEqual([]);
    expect(sliceAt(path, 1)).toHaveLength(path.coords.length);
  });

  it('sliceAt length grows monotonically with the fraction', () => {
    let prev = -1;
    for (let f = 0; f <= 1.0001; f += 0.05) {
      const len = measure(sliceAt(path, f)).length;
      expect(len).toBeGreaterThanOrEqual(prev);
      prev = len;
    }
  });

  it('measures degenerate paths without throwing', () => {
    const empty = measure([]);
    expect(empty.length).toBe(0);
    expect(pointAt(empty, 0.5)).toEqual([0, 0]);
    expect(headingAt(empty, 0.5)).toBe(0);
  });
});

describe('fitBounds', () => {
  it('fits the whole world into a 512px square at zoom 0', () => {
    // MapLibre's own convention: worldSize = tileSize(512) * 2^zoom, so a 512px
    // viewport showing the full -180..180 span is zoom 0 by definition. Points step
    // by 90° so no consecutive pair is >180° apart — `unwrap` treats a bigger jump
    // as "the shorter way around" (correct for a path), which would otherwise
    // collapse a naive [-180,0]→[180,0] pair into the same point.
    const worldSpan: LngLat[] = [[-180, -85], [-90, 0], [0, 85], [90, 0], [179, -85]];
    const { zoom, center } = fitBounds(worldSpan, { width: 512, height: 512 });
    expect(zoom).toBeCloseTo(0, 1);
    expect(center[0]).toBeCloseTo(-0.5, 0);
  });

  it('doubles worldSize (adds one zoom level) when the viewport doubles', () => {
    const bounds: LngLat[] = [[-10, -10], [10, 10]];
    const a = fitBounds(bounds, { width: 512, height: 512 });
    const b = fitBounds(bounds, { width: 1024, height: 1024 });
    expect(b.zoom).toBeCloseTo(a.zoom + 1, 6);
  });

  it('zoom increases monotonically as the bounds shrink', () => {
    let prevZoom = -Infinity;
    for (const halfSpan of [40, 20, 10, 5, 2.5, 1]) {
      const { zoom } = fitBounds([[-halfSpan, -halfSpan], [halfSpan, halfSpan]], { width: 1080, height: 1920 });
      expect(zoom).toBeGreaterThan(prevZoom);
      prevZoom = zoom;
    }
  });

  it('centers on the bounds midpoint with no padding', () => {
    const { center } = fitBounds([[10, 20], [30, 40]], { width: 1080, height: 1920 });
    expect(center[0]).toBeCloseTo(20, 4);
    // Mercator Y isn't linear in latitude, so the vertical midpoint isn't exactly
    // the arithmetic mean of 20 and 40 — but it should land close, on this small a span.
    expect(center[1]).toBeGreaterThan(29);
    expect(center[1]).toBeLessThan(31);
  });

  it('unwraps the antimeridian instead of bounding the whole world', () => {
    // Tokyo to San Francisco crosses 180° — without unwrapping, a naive min/max
    // over raw longitudes would compute a bounding box spanning the long way round
    // (roughly 262°, nearly the whole globe) instead of the ~98° short way the
    // route actually takes across the Pacific.
    const tokyo: LngLat = [139.69, 35.68];
    const sanFrancisco: LngLat = [-122.42, 37.77];
    const wide: LngLat[] = [[-180, -60], [-90, 0], [0, 60], [90, 0], [179, -60]]; // ~whole world
    const { zoom: wideZoom } = fitBounds(wide, { width: 1080, height: 1920 });
    const { zoom } = fitBounds([tokyo, sanFrancisco], { width: 1080, height: 1920 });
    expect(zoom).toBeGreaterThan(wideZoom + 1);
  });

  it('asymmetric padding shifts the center away from the reserved side', () => {
    // Reserving 40% on the right (e.g. for a corner image card) should push fixed
    // content — and so the returned center — toward the east, so that content
    // renders shifted left, into the remaining visible area.
    const point: LngLat = [0, 0];
    const centered = fitBounds([point], { width: 1080, height: 1920, maxZoom: 10 });
    const padded = fitBounds([point], { width: 1080, height: 1920, padding: { right: 0.4 }, maxZoom: 10 });
    expect(padded.center[0]).toBeGreaterThan(centered.center[0]);
  });

  it('reserving bottom padding shifts the center south (content moves up, away from it)', () => {
    const point: LngLat = [0, 0];
    const centered = fitBounds([point], { width: 1080, height: 1920, maxZoom: 10 });
    const padded = fitBounds([point], { width: 1080, height: 1920, padding: { bottom: 0.3 }, maxZoom: 10 });
    expect(padded.center[1]).toBeLessThan(centered.center[1]);
  });

  it('clamps to maxZoom/minZoom rather than returning Infinity for a single point', () => {
    const { zoom } = fitBounds([[10, 10]], { width: 1080, height: 1920, maxZoom: 14 });
    expect(zoom).toBe(14);
    expect(Number.isFinite(zoom)).toBe(true);
  });

  it('throws on empty input rather than silently returning a nonsense camera', () => {
    expect(() => fitBounds([], { width: 1080, height: 1920 })).toThrow();
  });

  /**
   * Regression case: the Dandi March route (docs/brand/dandi-march). The original
   * camera zoom for this shot was found by eight-plus rebuild/render/inspect
   * cycles — a formula estimate of ~8.7 left the 387 km route a near-invisible
   * sliver, ~11.3 overflowed the frame and broke the base landmass render, and 8.9
   * was what finally worked, found by bisecting against the studio's own
   * `debug(t)` API. `fitBounds` should recover a zoom in that same ballpark
   * directly from the route's real coordinates, with no rendering required.
   */
  it('recovers roughly the empirically-found zoom for a real regional route (Dandi March)', () => {
    const route: LngLat[] = [
      [72.5808, 23.0600], // Sabarmati
      [72.5939, 22.9141], // Aslali
      [72.8600, 22.6900], // Nadiad
      [72.9000, 22.6000], // Anand
      [72.9000, 22.4200], // Borsad
      [72.9900, 21.6324], // Ankleshwar
      [72.9520, 20.9467], // Navsari
      [72.8009, 20.8865], // Dandi
    ];
    const { zoom } = fitBounds(route, { width: 1080, height: 1920, padding: 0.18 });
    expect(zoom).toBeGreaterThan(7.5);
    expect(zoom).toBeLessThan(10);
  });
});

describe('antimeridianRisks', () => {
  it('flags nothing for a ring that stays comfortably inside a 180° span', () => {
    // The arctic-route episode's actual, fixed ice-shape ring — kept entirely
    // within 15°E-175°E on purpose, precisely to avoid this failure mode.
    const winterIce: LngLat[] = [
      [15, 69], [35, 71], [55, 72], [75, 72.5], [95, 72.5], [115, 72], [135, 71], [155, 70], [175, 69],
      [175, 81], [155, 83.5], [115, 84.5], [75, 84], [35, 82], [15, 80], [15, 69],
    ];
    expect(antimeridianRisks(winterIce)).toEqual([]);
  });

  /**
   * Regression case: a reconstruction of the arctic-route episode's *original*
   * ice-shape ring — described in that episode's build script and README as
   * wrapping through 172° → -170° → -155° → -140° to close a loop around the
   * pole. It rendered as a self-intersecting mess (a broken crescent from wide
   * out, a nonsense edge from close in), caught only by rendering a frame and
   * looking at it. This is a faithful reconstruction of the documented pattern,
   * not the literal original coordinates, which weren't preserved verbatim.
   */
  it('flags a ring that wraps through the antimeridian without unwrapped longitude', () => {
    const brokenRing: LngLat[] = [
      [150, 80], [172, 82], [-170, 84], [-155, 86], [-140, 87], [-120, 86], [150, 80],
    ];
    const risks = antimeridianRisks(brokenRing);
    expect(risks.length).toBeGreaterThan(0);
    // The specific jump the episode actually hit: 172° straight to -170°.
    expect(risks.some((r) => r.from[0] === 172 && r.to[0] === -170)).toBe(true);
  });

  it('flags even a genuinely short real-world hop if it is expressed as raw non-continuous coordinates', () => {
    // 179° to -179° is a 2° hop the short way round the world — but expressed as
    // raw numbers it's still a 358° jump, and that's the actual failure mode: a
    // renderer can't tell "a short hop, expressed ambiguously" from "the long way
    // round" without unwrapped (continuous, e.g. 181° instead of -179°)
    // coordinates. Geographic intent doesn't make the raw jump safe.
    expect(antimeridianRisks([[178, 10], [179, 10], [-179, 10]])).toHaveLength(1);
  });

  it('does not flag the same hop once expressed as continuous (unwrapped) coordinates', () => {
    expect(antimeridianRisks([[178, 10], [179, 10], [181, 10]])).toHaveLength(0);
  });
});

describe('polarClipRisks', () => {
  it('flags nothing for coordinates within the Mercator limit', () => {
    expect(polarClipRisks([[0, 84.9], [0, -84.9], [0, 0]])).toEqual([]);
  });

  /**
   * Regression case: the arctic-route episode's original summer-ice ring peaked
   * at 87°N — past MapLibre's ±85.0511° Mercator limit, which doesn't degrade
   * gracefully but clips into a genuinely broken fill (confirmed at the time by
   * testing 5° and 1.5° vertex densification and getting a pixel-identical
   * broken shape both times).
   */
  it('flags the exact latitude that broke the arctic-route summer ice shape', () => {
    const originalSummerIce: LngLat[] = [
      [20, 82], [60, 83.5], [100, 83.5], [140, 82.5], [175, 81],
      [175, 86], [140, 87], [100, 87], [60, 86.5], [20, 85], [20, 82],
    ];
    const risks = polarClipRisks(originalSummerIce);
    expect(risks.length).toBeGreaterThan(0);
    expect(risks.some(([, lat]) => lat === 87)).toBe(true);
  });

  it('does not flag the fixed version of that same shape', () => {
    const fixedSummerIce: LngLat[] = [
      [30, 79], [70, 81], [100, 81], [130, 80], [165, 78.5],
      [165, 84.5], [130, 84.8], [100, 84.8], [70, 84.5], [30, 82.5], [30, 79],
    ];
    expect(polarClipRisks(fixedSummerIce)).toEqual([]);
  });

  it('is exact at the boundary — MAX_MERCATOR_LATITUDE itself is not a risk, one hair past it is', () => {
    expect(polarClipRisks([[0, MAX_MERCATOR_LATITUDE]])).toEqual([]);
    expect(polarClipRisks([[0, MAX_MERCATOR_LATITUDE + 0.001]])).toHaveLength(1);
  });
});
