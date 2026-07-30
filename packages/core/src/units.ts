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
