import type { useStore } from './store';

/**
 * Debug handle, dev builds only.
 *
 * The *supported* automation surface is `window.geomotion` (see lib/headless.ts),
 * which the video pipeline drives. An earlier `window.__geomotion_*` family sat
 * alongside it for frame stepping and map access; nothing ever consumed it, so it
 * was removed with `lib/mapref.ts` rather than documented.
 */
declare global {
  interface Window {
    __store?: typeof useStore;
  }
}
