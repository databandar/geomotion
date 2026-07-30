import type { Map as MLMap } from 'maplibre-gl';
import type { useStore } from './store';

/**
 * The window surface the headless renderer drives.
 *
 * `apps/pipeline/lib/render.mjs` steps the composition frame by frame through
 * these globals, so they are a real API contract with a consumer outside this
 * app — not debug leftovers. They were previously attached through `as any`,
 * which meant renaming one would have broken rendering with no typecheck error.
 *
 * ARCHITECTURE §14 replaces this with an explicit render host; until then, the
 * contract is at least written down.
 */
declare global {
  interface Window {
    __geomotion_renderFrameAt?: (t: number) => void;
    __geomotion_getMap?: () => MLMap | null;
    __geomotion_waitForIdle?: (m: MLMap, timeoutMs?: number) => Promise<void>;
    __geomotion_store?: typeof useStore;
  }
}
