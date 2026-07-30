/**
 * `@geomotion/geometry` — geo math.
 *
 * Governing sections: ENGINEERING_GUIDE §2, ARCHITECTURE §08. Depends on `core`
 * only; it must never reach for the document, React or the DOM, because the
 * evaluator calls into it and the evaluator has to stay pure.
 *
 * The topology store, boolean ops, simplification and projection morphs named in
 * §08 are not here yet — they arrive with the geometry editor. What has moved is
 * the great-circle layer that the route and camera systems already depend on.
 */

export {
  bearing,
  buildPath,
  haversine,
  headingAt,
  measure,
  pointAt,
  sliceAt,
  slerp,
  unwrap,
  type MeasuredPath,
} from './geo.ts';
