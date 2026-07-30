import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../store';
import { evaluate, type Scene } from '../lib/scene';
import { syncScene, resetSyncCache } from '../lib/mapsync';
import { drawOverlay, scaleFor } from '../lib/overlay';
import { getBasemap, TERRAIN_SOURCE } from '../lib/basemaps';
import { waitForIdle, type RenderHost } from '../render/host';
import type { LngLat, MarkerLayer, RouteLayer, TextLayer } from '@geomotion/document';

const seenSyncErrors = new Set<string>();
function reportSyncError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err);
  if (seenSyncErrors.has(msg)) return;
  seenSyncErrors.add(msg);
  console.error('[geomotion] layer sync failed:', msg);
}

type DragTarget =
  | { kind: 'vertex'; layerId: string; index: number }
  | { kind: 'marker'; layerId: string }
  | { kind: 'text'; layerId: string; dx: number; dy: number };

/**
 * `onHostReady` hands the render surface up to whoever owns the layout, which
 * then provides it to the rest of the tree. That direction matters: the canvas
 * owner publishes, consumers subscribe — nobody imports a global to find the map.
 */
export default function MapCanvas({ onHostReady }: { onHostReady?: (host: RenderHost | null) => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const dragRef = useRef<DragTarget | null>(null);
  const [mapReady, setMapReady] = useState(false);
  /** Kept in refs so the published host never closes over a stale render. */
  const onHostReadyRef = useRef(onHostReady);
  onHostReadyRef.current = onHostReady;
  const styleIdRef = useRef<string>('');
  /**
   * The frame currently on screen. MapLibre's own `move` event triggers renders
   * we didn't ask for, and those have no time argument — they must reuse this
   * rather than fall back to the store's playhead, which is not the same thing
   * while an offline export is driving frames explicitly.
   */
  const timeRef = useRef(useStore.getState().time);

  /* ------------------------------------------------------------- create map */
  useEffect(() => {
    if (!holderRef.current) return;
    const { project } = useStore.getState();
    const basemap = getBasemap(project.basemap);
    styleIdRef.current = project.basemap;

    const map = new maplibregl.Map({
      container: holderRef.current,
      style: basemap.style,
      center: [0, 20],
      zoom: 1.8,
      maxPitch: 85,
      attributionControl: { compact: true },
      // preserveDrawingBuffer is what lets us read pixels out of the WebGL
      // canvas when compositing export frames.
      canvasContextAttributes: { preserveDrawingBuffer: true, antialias: true },
      fadeDuration: 0,
    });

    mapRef.current = map;
    // The canvas is already the output size; a device pixel ratio on top of that
    // would quadruple the work for pixels the export never uses.
    map.setPixelRatio(1);
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    map.on('style.load', () => {
      resetSyncCache();
      applyTerrain(map);
      render(true);
    });
    map.on('move', () => render(false));
    setMapReady(true);
    map.on('mousedown', onMouseDown);
    map.on('click', onClick);

    return () => {
      onHostReadyRef.current?.(null);
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------------------------------------- rendering */
  const renderRef = useRef<(applyCamera: boolean, atTime?: number) => void>(() => {});

  const render = (applyCamera: boolean, atTime?: number) => {
    const map = mapRef.current;
    const canvas = canvasRef.current;
    if (!map || !canvas) return;

    const state = useStore.getState();
    const time = atTime ?? timeRef.current;
    timeRef.current = time;
    const scene = evaluate(state.project, time);

    if (applyCamera) {
      map.jumpTo({
        center: scene.camera.center,
        zoom: scene.camera.zoom,
        bearing: scene.camera.bearing,
        pitch: Math.min(scene.camera.pitch, 85),
      });
    }

    try {
      syncScene(map, scene);
    } catch (err) {
      // A style swap mid-frame is expected and self-heals, but anything else is
      // a real bug that used to vanish silently — report each distinct one once.
      reportSyncError(err);
    }

    drawFrame(scene);
  };

  const drawFrame = (scene: Scene) => {
    const map = mapRef.current;
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    if (!map || !canvas || !stage) return;

    // The stage is already at output resolution, so the overlay is 1:1 with it —
    // no devicePixelRatio scaling, which keeps preview and export identical.
    const width = stage.clientWidth;
    const height = stage.clientHeight;
    if (width === 0 || height === 0) return;

    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const state = useStore.getState();
    const frame = {
      ctx,
      width,
      height,
      scale: scaleFor(height),
      project: (c: LngLat) => map.project(c),
    };

    drawOverlay(frame, scene);
    if (!state.exporting) drawEditorHandles(frame, scene);
  };

  /** Selection affordances — preview only, never part of an export. */
  const drawEditorHandles = (
    frame: { ctx: CanvasRenderingContext2D; width: number; height: number; scale: number; project: (c: LngLat) => { x: number; y: number } },
    scene: Scene,
  ) => {
    const { selection, project } = useStore.getState();
    if (selection?.kind !== 'layer') return;
    const layer = project.layers.find((l) => l.id === selection.id);
    if (!layer || !layer.visible) return;
    const { ctx } = frame;

    ctx.save();
    if (layer.type === 'route') {
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#111827';
      ctx.lineWidth = 1.5;
      layer.coords.forEach((c, i) => {
        const p = frame.project(c);
        ctx.beginPath();
        ctx.rect(p.x - 5, p.y - 5, 10, 10);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.font = '10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(String(i + 1), p.x, p.y - 9);
        ctx.fillStyle = '#111827';
      });
    } else if (layer.type === 'marker') {
      const p = frame.project(layer.coord);
      ctx.strokeStyle = '#4cc2ff';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, layer.size * frame.scale + 12, 0, Math.PI * 2);
      ctx.stroke();
    } else if (layer.type === 'text') {
      const t = scene.texts.find((x) => x.style.id === layer.id);
      if (t) {
        const size = layer.size * frame.scale;
        const x = layer.x * frame.width;
        const y = layer.y * frame.height;
        ctx.strokeStyle = 'rgba(76,194,255,0.9)';
        ctx.setLineDash([4, 3]);
        ctx.lineWidth = 1;
        ctx.strokeRect(x - 60, y - size, 120, size * 1.3);
      }
    }
    ctx.restore();
  };

  // Published once the map exists. `render` closes over the latest props each
  // commit, so the host forwards to a ref rather than capturing a stale closure.
  renderRef.current = render;

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const host: RenderHost = {
      map,
      overlayCanvas: canvasRef.current,
      renderFrameAt: (t: number) => renderRef.current(true, t),
      waitForIdle: (timeoutMs?: number) => waitForIdle(map, timeoutMs),
    };
    onHostReadyRef.current?.(host);
    return () => onHostReadyRef.current?.(null);
  }, [mapReady]);

  /* --------------------------------------------------- react to state change */
  useEffect(() => {
    let raf = 0;
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        render(true);
      });
    };
    schedule();
    const unsub = useStore.subscribe((s, prev) => {
      if (s.time !== prev.time) timeRef.current = s.time;
      if (s.time !== prev.time || s.structureRev !== prev.structureRev || s.selection !== prev.selection) schedule();
    });
    return () => {
      unsub();
      if (raf) cancelAnimationFrame(raf);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* --------------------------------------------------------- style/terrain */
  const basemap = useStore((s) => s.project.basemap);
  const terrain = useStore((s) => s.project.terrain);
  const exaggeration = useStore((s) => s.project.terrainExaggeration);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleIdRef.current === basemap) return;
    styleIdRef.current = basemap;
    resetSyncCache();
    map.setStyle(getBasemap(basemap).style as never);
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyTerrain(map);
  }, [terrain, exaggeration]);

  function applyTerrain(map: MLMap) {
    const { project } = useStore.getState();
    const dark = getBasemap(project.basemap).dark;
    try {
      if (project.terrain) {
        if (!map.getSource('gm-dem')) map.addSource('gm-dem', TERRAIN_SOURCE);
        map.setTerrain({ source: 'gm-dem', exaggeration: project.terrainExaggeration });
        // Sky is a style-level setting in MapLibre 5, not a layer.
        map.setSky({
          'sky-color': dark ? '#0b1b2b' : '#8ec9ff',
          'horizon-color': dark ? '#1d3447' : '#dceeff',
          'fog-color': dark ? '#0d1117' : '#ffffff',
          'fog-ground-blend': 0.6,
          'horizon-fog-blend': 0.4,
          'sky-horizon-blend': 0.7,
          'atmosphere-blend': 0.8,
        });
      } else {
        map.setTerrain(null);
        map.setSky(undefined as never);
      }
    } catch {
      /* terrain unavailable on this style — ignore */
    }
  }

  /* ------------------------------------------------------------ stage size */
  // The stage is ALWAYS the exact output pixel size and is only *visually*
  // shrunk to fit the window. Anything else would be a lie: at a given zoom a
  // wider canvas shows more of the world, so a small preview would frame the
  // shot differently from the export.
  const width = useStore((s) => s.project.width);
  const height = useStore((s) => s.project.height);
  const [fitScale, setFitScale] = useState(1);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const id = requestAnimationFrame(() => {
      map.resize();
      render(true);
    });
    return () => cancelAnimationFrame(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width, height]);

  useEffect(() => {
    const wrap = stageRef.current?.parentElement;
    if (!wrap) return;
    const fit = () => setFitScale(Math.min(wrap.clientWidth / width, wrap.clientHeight / height, 1));
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [width, height]);

  /* ------------------------------------------------------------ interaction */
  function onClick(e: maplibregl.MapMouseEvent) {
    const state = useStore.getState();
    const { tool, selection } = state;
    if (tool === 'select' || selection?.kind !== 'layer') return;
    const layer = state.project.layers.find((l) => l.id === selection.id);
    if (!layer) return;
    const c: LngLat = [e.lngLat.lng, e.lngLat.lat];

    if (tool === 'route' && layer.type === 'route') {
      state.updateLayer<RouteLayer>(layer.id, { coords: [...layer.coords, c] });
    } else if (tool === 'marker' && layer.type === 'marker') {
      state.updateLayer<MarkerLayer>(layer.id, { coord: c });
      state.setTool('select');
    }
  }

  function onMouseDown(e: maplibregl.MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;
    const state = useStore.getState();
    if (state.exporting) return;
    const sel = state.selection;
    if (sel?.kind !== 'layer') return;
    const layer = state.project.layers.find((l) => l.id === sel.id);
    if (!layer || !layer.visible) return;

    const pt = e.point;
    let target: DragTarget | null = null;

    if (layer.type === 'route') {
      for (let i = 0; i < layer.coords.length; i++) {
        const p = map.project(layer.coords[i]);
        if (Math.hypot(p.x - pt.x, p.y - pt.y) < 10) {
          target = { kind: 'vertex', layerId: layer.id, index: i };
          break;
        }
      }
    } else if (layer.type === 'marker') {
      const p = map.project(layer.coord);
      if (Math.hypot(p.x - pt.x, p.y - pt.y) < layer.size + 12) target = { kind: 'marker', layerId: layer.id };
    } else if (layer.type === 'text') {
      const stage = stageRef.current;
      if (stage) {
        const x = layer.x * stage.clientWidth;
        const y = layer.y * stage.clientHeight;
        const size = layer.size * scaleFor(stage.clientHeight);
        if (Math.abs(pt.x - x) < 90 && pt.y > y - size && pt.y < y + size * 0.4)
          target = { kind: 'text', layerId: layer.id, dx: pt.x - x, dy: pt.y - y };
      }
    }

    if (!target) return;
    e.preventDefault();
    dragRef.current = target;
    map.dragPan.disable();
    map.getCanvas().style.cursor = 'grabbing';

    const move = (ev: MouseEvent) => {
      // The stage carries a CSS scale, so convert back to unscaled canvas pixels.
      const el = map.getCanvas();
      const rect = el.getBoundingClientRect();
      const k = rect.width ? el.clientWidth / rect.width : 1;
      const px = (ev.clientX - rect.left) * k;
      const py = (ev.clientY - rect.top) * k;
      const t = dragRef.current;
      if (!t) return;
      const s = useStore.getState();
      const current = s.project.layers.find((l) => l.id === t.layerId);
      if (!current) return;

      if (t.kind === 'vertex' && current.type === 'route') {
        const ll = map.unproject([px, py]);
        const coords = current.coords.slice();
        coords[t.index] = [ll.lng, ll.lat];
        s.updateLayer<RouteLayer>(current.id, { coords }, 'drag-vertex');
      } else if (t.kind === 'marker' && current.type === 'marker') {
        const ll = map.unproject([px, py]);
        s.updateLayer<MarkerLayer>(current.id, { coord: [ll.lng, ll.lat] }, 'drag-marker');
      } else if (t.kind === 'text' && current.type === 'text') {
        const stage = stageRef.current!;
        s.updateLayer<TextLayer>(
          current.id,
          {
            x: Math.max(0, Math.min(1, (px - t.dx) / stage.clientWidth)),
            y: Math.max(0, Math.min(1, (py - t.dy) / stage.clientHeight)),
          },
          'drag-text',
        );
      }
    };

    const up = () => {
      dragRef.current = null;
      map.dragPan.enable();
      map.getCanvas().style.cursor = '';
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  }

  /* ---------------------------------------------------------------- render */
  return (
    <div className="stage-wrap">
      <div
        className="stage"
        ref={stageRef}
        style={{ width, height, flex: 'none', transform: `scale(${fitScale})`, transformOrigin: 'center center' }}
      >
        <div className="map-holder" ref={holderRef} />
        <canvas className="overlay-canvas" ref={canvasRef} />
      </div>
    </div>
  );
}
