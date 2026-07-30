/**
 * `@geomotion/animation` — how values move.
 *
 * Governing sections: ENGINEERING_GUIDE §2, ARCHITECTURE §06. Today this is the easing
 * table; §2 also assigns it track evaluation and the behaviour graph runtime, which is
 * where the region tour's `RegionTour` eventually belongs.
 *
 * Easing is *data*: named curves resolve through one table so feature code never
 * hardcodes a curve, which §15 lists as a banned anti-pattern.
 */

export { EASING_NAMES, EASINGS, ease } from './easing.ts';
