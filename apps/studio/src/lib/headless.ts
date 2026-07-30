import { useStore } from '../store';
import { migrate } from '@geomotion/document';
import type { RenderHost } from '../render/host';
import { evaluate } from './scene';
import { imagesReady } from './images';

/**
 * A small, stable surface for automation — the render step of the video pipeline
 * drives the real editor through this rather than reaching into React internals.
 * Deliberately always available, not dev-only: the pipeline renders the
 * production build so that what ships is what was tested.
 */
export interface HeadlessApi {
  ready: true;
  /** Load a .geomotion.json project (object, not string). */
  loadProject(project: unknown): void;
  /** Draw one exact frame at the given timeline position. */
  renderFrameAt(t: number): void;
  /** Resolve once tiles for the current view have finished loading. */
  waitIdle(timeoutMs?: number): Promise<void>;
  /** Hide editor-only chrome (selection handles, map controls). */
  setExporting(v: boolean): void;
  /**
   * Resolve once every image layer's bitmap has decoded. Frames captured before
   * this would silently render without their pictures.
   */
  imagesReady(): Promise<{ total: number; failed: string[] }>;
  info(): {
    duration: number;
    fps: number;
    width: number;
    height: number;
    layers: number;
    basemap: string;
  };
  /**
   * Where the composition sits on the page, for screenshot clipping. `scale` is
   * 1 only when the window is big enough to show the stage un-shrunk — the
   * renderer checks this, because clipping a scaled stage would resample.
   */
  stage(): { x: number; y: number; width: number; height: number; scale: number } | null;
  /** GL sources/layers we own plus the evaluated scene, for diagnosis. */
  debug(t?: number): {
    styleLoaded: boolean;
    sources: string[];
    layers: { id: string; type: string; source?: string; paint: Record<string, unknown> }[];
    scene: {
      time: number;
      camera: { zoom: number; center: [number, number] };
      regions: { name: string; alpha: number; phase: string; activeIndex: number; stops: number; fillOpacity: number }[];
    };
  };
}

export function installHeadlessApi(host: RenderHost) {
  const api: HeadlessApi = {
    ready: true,

    loadProject(project) {
      useStore.getState().replaceProject(migrate(project));
    },

    renderFrameAt(t) {
      host.renderFrameAt(t);
    },

    async waitIdle(timeoutMs = 15000) {
      await host.waitForIdle(timeoutMs);
    },

    setExporting(v) {
      useStore.getState().setExporting(v);
      // Only automation reaches this API, so also drop the on-screen warning
      // badge — it lives inside the stage and would land in the frames.
      document.documentElement.classList.toggle('gm-headless', v);
    },

    imagesReady() {
      return imagesReady();
    },

    info() {
      const p = useStore.getState().project;
      return {
        duration: p.duration,
        fps: p.fps,
        width: p.width,
        height: p.height,
        layers: p.layers.length,
        basemap: p.basemap,
      };
    },

    debug(t) {
      const state = useStore.getState();
      const scene = evaluate(state.project, t ?? state.time);
      const sceneInfo = {
        time: scene.time,
        camera: { zoom: scene.camera.zoom, center: scene.camera.center },
        regions: scene.regions.map((r) => ({
          name: r.layer.name,
          alpha: r.alpha,
          phase: r.phase,
          activeIndex: r.activeIndex,
          stops: r.set.order.length,
          fillOpacity: r.layer.fillOpacity,
        })),
      };
      const map = host.map;
      if (!map) return { styleLoaded: false, sources: [], layers: [], scene: sceneInfo };
      const style = map.getStyle();
      const ours = (style?.layers ?? []).filter((l) => l.id.startsWith('gm-'));
      return {
        styleLoaded: !!map.isStyleLoaded(),
        sources: Object.keys(style?.sources ?? {}),
        layers: ours.map((l) => ({
          id: l.id,
          type: l.type,
          source: 'source' in l ? (l.source as string) : undefined,
          paint: ((l as { paint?: Record<string, unknown> }).paint ?? {}) as Record<string, unknown>,
        })),
        scene: sceneInfo,
      };
    },

    stage() {
      const el = document.querySelector('.stage') as HTMLElement | null;
      if (!el) return null;
      const r = el.getBoundingClientRect();
      // offsetWidth is the untransformed layout size; the ratio is the CSS scale.
      const scale = el.offsetWidth ? r.width / el.offsetWidth : 1;
      return { x: r.x, y: r.y, width: r.width, height: r.height, scale };
    },
  };

  (window as unknown as { geomotion: HeadlessApi }).geomotion = api;
}
