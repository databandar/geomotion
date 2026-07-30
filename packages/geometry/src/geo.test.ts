import { describe, expect, it } from 'vitest';
import type { LngLat } from '@geomotion/core';
import { bearing, buildPath, haversine, headingAt, measure, pointAt, sliceAt, slerp, unwrap } from './geo.ts';

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
