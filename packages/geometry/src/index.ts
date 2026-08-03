/**
 * `@geomotion/geometry` — geo math.
 *
 * Governing sections: ENGINEERING_GUIDE §2, ARCHITECTURE §08. Depends on `core`
 * only; it must never reach for the document, React or the DOM, because the
 * evaluator calls into it and the evaluator has to stay pure.
 *
 * The topology store, boolean ops, simplification and projection morphs named in
 * §08 are not here yet — they arrive with the geometry editor. What has moved is
 * the great-circle layer that the route and camera systems already depend on, plus
 * `fitBounds` — camera keyframes computed from coordinates, for build scripts that
 * have no live map to ask.
 */

export {
  antimeridianRisks,
  bearing,
  buildPath,
  fitBounds,
  haversine,
  headingAt,
  landCrossingRisks,
  MAX_MERCATOR_LATITUDE,
  measure,
  pointAt,
  pointInPolygon,
  polarClipRisks,
  sliceAt,
  slerp,
  unwrap,
  type AntimeridianRisk,
  type FitBoundsOptions,
  type FitBoundsPadding,
  type FitBoundsResult,
  type LandCrossingRisk,
  type MeasuredPath,
} from './geo.ts';
