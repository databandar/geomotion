/**
 * `@geomotion/entities` — the data join.
 *
 * Governing sections: ENGINEERING_GUIDE §2, ARCHITECTURE §09. One place where a
 * region's geometry meets its value, so the map, the callout and the legend cannot
 * disagree about what a number is.
 */

export {
  clearRegionCache,
  fitBounds,
  regionAtStop,
  regionSet,
  type Region,
  type RegionSet,
} from './regions.ts';
