import { useEffect, useRef, useState } from 'react';
import maplibregl, { Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useStore } from '../store';
import { evaluate, type Scene } from '@geomotion/evaluator';
import { syncScene, resetSyncCache } from '@geomotion/map';
import { fitBounds, regionSet } from '@geomotion/entities';
import { layerAt, resolveMapContext } from '@geomotion/document';
import { evalTrack } from '@geomotion/animation';
import { drawOverlay, scaleFor } from '@geomotion/renderer';
import { getBasemap, TERRAIN_SOURCE } from '@geomotion/map';
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
      resetSyncCache(map);
      applyTerrain(map);
      renderRef.current(true);
    });
    map.on('move', () => renderRef.current(false));

    /*
     * Record mode: a settled view becomes a keyframe.
     *
     * `moveend` rather than `move`, so one gesture writes one key instead of sixty. The
     * three guards matter — armed, not playing, and the move came from a person:
     * `originalEvent` is absent when MapLibre moved itself, which it does on every
     * playback frame and on every `jumpTo` the evaluator issues. Without that check,
     * arming record and pressing play would carpet the timeline with keyframes
     * describing the animation it was already playing.
     */
    map.on('moveend', (e) => {
      const state = useStore.getState();
      if (!state.recording || state.playing) return;
      if (!(e as { originalEvent?: unknown }).originalEvent) return;
      const c = map.getCenter();
      state.addKeyframe({
        center: [c.lng, c.lat],
        zoom: map.getZoom(),
        bearing: map.getBearing(),
        pitch: map.getPitch(),
      });
    });
    setMapReady(true);
    map.on('mousedown', onMouseDown);
    map.on('click', onClick);
    map.on('dblclick', onDblClick);

    return () => {
      onHostReadyRef.current?.(null);
      map.remove();
      mapRef.current = null;
    };
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
    const layer = layerAt(project, selection.id);
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
      /*
       * The size comes off the scene, not the layer: the evaluator has already resolved
       * the track for this frame, so the ring tracks an animated marker and there is one
       * answer rather than two that can disagree. Same shape as the text branch below.
       */
      const m = scene.markers.find((x) => x.style.id === layer.id);
      ctx.arc(p.x, p.y, (m?.style.size ?? 8) * frame.scale + 12, 0, Math.PI * 2);
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
        renderRef.current(true);
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
  }, []);

  /* --------------------------------------------------------- style/terrain */

  /*
   * Resolved from the story, not read off the project.
   *
   * A map context can switch basemap, terrain or projection for the stretch of time a
   * block covers, so what the map should look like depends on the playhead. Subscribing
   * to the resolved values rather than the raw project fields means a block boundary
   * changes the map the same way editing the project setting does — one path, not two.
   */
  /*
   * Selected one field at a time, and each one a primitive.
   *
   * Selecting the resolved object itself returns a fresh object on every call, so
   * zustand's equality check never matches and the component re-renders until React gives
   * up — "Maximum update depth exceeded", which is what this looked like the first time.
   * Resolution is a lookup over a handful of blocks, so doing it per field costs nothing
   * worth a memo.
   */
  const basemap = useStore((s) => resolveMapContext(s.project, s.time).basemap);
  const terrain = useStore((s) => resolveMapContext(s.project, s.time).terrain);
  const exaggeration = useStore((s) => resolveMapContext(s.project, s.time).terrainExaggeration);
  /*
   * `projection` is resolved but deliberately not applied — see docs/features/map-contexts.md.
   *
   * MapLibre 5.24 throws from inside its own next frame when the projection changes after
   * a `setStyle`, which is exactly what a story switching basemap and then asking for the
   * globe does. Three guards were tried — `isStyleLoaded`, wrapping the read as well as
   * the write, deferring to `idle` — and the throw is asynchronous in all of them, past
   * where a caller's try/catch reaches. The field stays in the document so projects can
   * carry it and nothing has to migrate later; applying it waits on a fix upstream or a
   * crossfade of our own.
   */

  useEffect(() => {
    const map = mapRef.current;
    if (!map || styleIdRef.current === basemap) return;
    styleIdRef.current = basemap;
    resetSyncCache(map);
    map.setStyle(getBasemap(basemap).style as never);
  }, [basemap]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    applyTerrain(map);
  }, [terrain, exaggeration]);



  function applyTerrain(map: MLMap) {
    const { project, time: at } = useStore.getState();
    const resolved = resolveMapContext(project, at);
    const dark = getBasemap(resolved.basemap).dark;
    try {
      if (resolved.terrain) {
        if (!map.getSource('gm-dem')) map.addSource('gm-dem', TERRAIN_SOURCE);
        map.setTerrain({ source: 'gm-dem', exaggeration: resolved.terrainExaggeration });
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
      renderRef.current(true);
    });
    return () => cancelAnimationFrame(id);
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
/**
   * Double-click a region and the camera frames it — v2 §02's signature gesture, §09's
   * "one-block rig".
   *
   * It writes a camera keyframe at the playhead rather than only moving the view. That
   * makes it an *authoring* act: the camera animates into the region from wherever the
   * previous keyframe left it, which is how a tour gets built by hand. Merely flying the
   * preview would leave nothing behind and make the gesture a navigation shortcut, which
   * §09 explicitly does not describe.
   *
   * The framing comes from `fitBounds` — the same solver the automated tour uses — so a
   * shot placed by hand and one placed by the composer are identical for identical
   * inputs, which is what §09 means by deterministic framing.
   */
  function onDblClick(e: maplibregl.MapMouseEvent) {
    const map = mapRef.current;
    if (!map) return;

    const hit = map
      .queryRenderedFeatures(e.point)
      .find((f) => f.layer?.id?.startsWith('gm-regions-') && f.layer.id.endsWith('-fill'));
    if (!hit) return;

    const { project } = useStore.getState();
    const layerId = hit.layer.id.slice('gm-regions-'.length, -'-fill'.length);
    const layer = layerAt(project, layerId);
    if (!layer || layer.type !== 'regions') return;

    const set = regionSet(layer, getBasemap(project.basemap).dark);
    const name = String(hit.properties?.[layer.nameKey] ?? '');
    const region = set.regions.find((r) => r.name === name);
    if (!region) return;

    // MapLibre zooms on double-click by default; without this the camera is framed and
    // then immediately shoved by a zoom nobody asked for.
    e.preventDefault();

    const shot = fitBounds(
      region.bounds,
      project.width,
      project.height,
      layer.tour.padding,
      layer.tour.pitch,
      layer.tour.maxZoom,
    );
    useStore.getState().addKeyframe({
      center: shot.center,
      zoom: shot.zoom,
      bearing: shot.bearing,
      pitch: shot.pitch,
    });
  }

  function onClick(e: maplibregl.MapMouseEvent) {
    const state = useStore.getState();
    const { tool, selection } = state;
    if (tool === 'select' || selection?.kind !== 'layer') return;
    const layer = layerAt(state.project, selection.id);
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
    const layer = layerAt(state.project, sel.id);
    if (!layer || !layer.visible) return;

    const pt = e.point;
    let target: DragTarget | null = null;

    if (layer.type === 'route') {
      for (const [i, coord] of layer.coords.entries()) {
        const p = map.project(coord);
        if (Math.hypot(p.x - pt.x, p.y - pt.y) < 10) {
          target = { kind: 'vertex', layerId: layer.id, index: i };
          break;
        }
      }
    } else if (layer.type === 'marker') {
      const p = map.project(layer.coord);
      // Hit-test what is on screen now, not what the layer rests at — a marker that has
      // grown should be clickable at the size you can see.
      const size = evalTrack(layer.size, timeRef.current, { fallback: 8 });
      if (Math.hypot(p.x - pt.x, p.y - pt.y) < size + 12) target = { kind: 'marker', layerId: layer.id };
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
      const current = layerAt(s.project, t.layerId);
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
