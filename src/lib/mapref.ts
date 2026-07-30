import type { Map as MLMap } from 'maplibre-gl';

/**
 * Small module-level handle so the export pipeline and toolbar can reach the
 * live map / renderer without threading refs through the component tree.
 */

let map: MLMap | null = null;
let renderAt: ((time: number) => void) | null = null;
let overlayCanvas: HTMLCanvasElement | null = null;

export const setMap = (m: MLMap | null) => (map = m);
export const getMap = () => map;

export const setRenderAt = (fn: ((time: number) => void) | null) => (renderAt = fn);
/** Draw one exact frame at the given timeline position. */
export const renderFrameAt = (t: number) => renderAt?.(t);

export const setOverlayCanvas = (c: HTMLCanvasElement | null) => (overlayCanvas = c);
export const getOverlayCanvas = () => overlayCanvas;

/** Resolves once the map has finished loading tiles for the current view. */
export function waitForIdle(m: MLMap, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    if (m.loaded() && m.areTilesLoaded()) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      m.off('idle', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    m.on('idle', finish);
  });
}

// Expose for headless automation (Playwright)
if (typeof window !== 'undefined') {
  (window as any).__geomotion_renderFrameAt = renderFrameAt;
  (window as any).__geomotion_getMap = getMap;
  (window as any).__geomotion_waitForIdle = waitForIdle;
}
