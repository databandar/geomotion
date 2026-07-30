import { createContext, useContext } from 'react';
import type { Map as MLMap } from 'maplibre-gl';

/**
 * The render surface, passed explicitly.
 *
 * This replaces `lib/mapref.ts`, a module-level mutable handle on the live map
 * that any file could import and reach through. ENGINEERING_GUIDE §15 names that
 * an anti-pattern, and for concrete reasons: a module global assumes exactly one
 * map exists in exactly one thread, which forecloses the worker-side rendering
 * and the multi-viewport comparison views the architecture calls for, and it
 * makes "who moved the camera?" unanswerable by reading imports.
 *
 * The host is created by whoever owns the canvas and handed down. Non-React
 * callers — the export path, the automation surface — take it as a parameter, so
 * the dependency is visible in their signatures.
 */
export interface RenderHost {
  readonly map: MLMap;
  /**
   * The 2D canvas drawn over the map. Composited on top of `map.getCanvas()` to
   * produce a finished frame.
   */
  readonly overlayCanvas: HTMLCanvasElement | null;
  /**
   * Draw one exact frame at the given timeline position.
   *
   * Time is a parameter and never read back from the store — v1's export painted
   * every frame at t=0 because a map event triggered a parameterless re-render
   * that fell back to store state. Keep it that way.
   */
  renderFrameAt(t: number): void;
  /** Resolve once the map has finished loading tiles for the current view. */
  waitForIdle(timeoutMs?: number): Promise<void>;
}

const RenderHostContext = createContext<RenderHost | null>(null);

export const RenderHostProvider = RenderHostContext.Provider;

/**
 * The current render host, or null before the map has loaded.
 *
 * Callers must handle null rather than asserting: the toolbar and inspector
 * mount before the map is ready, and on a WebGL failure it never becomes ready.
 */
export function useRenderHost(): RenderHost | null {
  return useContext(RenderHostContext);
}

/** Resolves once the map has finished loading tiles for the current view. */
export function waitForIdle(map: MLMap, timeoutMs = 8000): Promise<void> {
  return new Promise((resolve) => {
    if (map.loaded() && map.areTilesLoaded()) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      map.off('idle', finish);
      clearTimeout(timer);
      resolve();
    };
    const timer = setTimeout(finish, timeoutMs);
    map.on('idle', finish);
  });
}
