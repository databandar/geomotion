/**
 * `@geomotion/map` — MapLibre integration.
 *
 * Governing section: ENGINEERING_GUIDE §2. Everything that knows MapLibre exists lives
 * here, so the compositor in `@geomotion/renderer` stays independent of it and the two
 * drawing surfaces can be reasoned about separately.
 */

export { resetSyncCache, syncScene } from './mapsync.ts';
export { BASEMAPS, TERRAIN_SOURCE, getBasemap, type Basemap } from './basemaps.ts';
