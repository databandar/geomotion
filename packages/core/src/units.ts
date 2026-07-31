/**
 * Coordinate and scalar primitives.
 *
 * ENGINEERING_GUIDE §2 puts vector-like primitives in `core`, which is why
 * `LngLat` lives here rather than in `geometry`: the document, the evaluator and
 * the map all speak in coordinates without any of them depending on geo math.
 */

/**
 * Longitude, latitude — in that order, matching GeoJSON and MapLibre.
 *
 * Longitude may legitimately run past ±180: a path crossing the antimeridian is
 * kept continuous rather than wrapped, or it would snap back across the whole
 * world. See `unwrap` in `@geomotion/geometry`.
 */
export type LngLat = [number, number];

/**
 * Interpolate a coordinate, taking the short way across the antimeridian.
 *
 * A camera moving from Tokyo to San Francisco should cross the Pacific, not sweep
 * backwards over Asia, Europe and the Atlantic. The target longitude is rewound to
 * within half a turn of the source before blending; latitude is ordinary.
 *
 * The result may fall outside ±180 by design — that is what keeps the move continuous.
 * MapLibre accepts it, and `unwrap` in `@geomotion/geometry` relies on the same rule.
 */
export function lerpLngLat(a: LngLat, b: LngLat, t: number): LngLat {
  const lngA = a[0];
  let lngB = b[0];
  while (lngB - lngA > 180) lngB -= 360;
  while (lngB - lngA < -180) lngB += 360;
  return [lngA + (lngB - lngA) * t, a[1] + (b[1] - a[1]) * t];
}
