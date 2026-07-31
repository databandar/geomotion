import { useEffect, useRef, useState } from 'react';
import MapCanvas from './components/MapCanvas';
import Timeline from './components/Timeline';
import LayerPanel from './components/LayerPanel';
import Rail from './components/Rail';
import Storyboard from './components/Storyboard';
import Inspector from './components/Inspector';
import Toolbar from './components/Toolbar';
import Transport from './components/Transport';
import StageChrome from './components/StageChrome';
import ExportDialog from './components/ExportDialog';
import Narration from './components/Narration';
import { useStore } from './store';
import { RenderHostProvider, type RenderHost } from './render/host';
import { installHeadlessApi } from './lib/headless';

export default function App() {
  const [showExport, setShowExport] = useState(false);
  /**
   * The render surface, published by MapCanvas once the map exists. App owns it
   * because the toolbar, inspector and export dialog are siblings of the canvas,
   * not children of it.
   */
  const [host, setHost] = useState<RenderHost | null>(null);
  /** The element that goes fullscreen — the stage card, so its controls come with it. */
  const viewportRef = useRef<HTMLDivElement>(null);
  usePlayback();
  useShortcuts(host);

  // The automation surface the video pipeline drives. Installed here rather than
  // at module load because it needs the host; the pipeline waits for
  // `window.geomotion.ready`, which is satisfied as soon as the map is up.
  useEffect(() => {
    if (host) installHeadlessApi(host);
  }, [host]);

  const exporting = useStore((s) => s.exporting);
  /*
   * The glass comes off while the timeline runs.
   *
   * A blurred backdrop is recomputed whenever anything beneath it repaints, and during
   * playback the map repaints every frame — measured at 31.8 ms/frame with the blur
   * against 16.7 without, so preview drops from 60 fps to 31. Suspending it for the
   * duration costs nothing visually: nobody is reading the chrome while watching the
   * composition, and the panels keep their exact colour because the fallback fill is
   * the flat surface the glass is tinted to.
   */
  const playing = useStore((s) => s.playing);

  return (
    <RenderHostProvider value={host}>
    <div className={'app' + (exporting ? ' exporting' : '') + (playing ? ' playing' : '')}>
      <Toolbar onExport={() => setShowExport(true)} />

      <div className="workspace">
        <Rail />

        <aside className="left">
          <LayerPanel />
          {/* Below the layers rather than in a tab: the two answer different questions
              and a writer wants both on screen at once. */}
          <Storyboard />
        </aside>

        {/*
          * The stage and its transport are one card.
          *
          * They were siblings, with the transport a separate strip below — which read as
          * a property of the window rather than of the picture, and left a seam across
          * the middle of the app. The controls that drive the composition now sit inside
          * the same surface the composition is drawn on.
          */}
        <main className="center">
          <div className="viewport" ref={viewportRef}>
            <MapCanvas onHostReady={setHost} />
            {/* Editor-only chrome, hidden while frames are being captured along with
                everything else the export must not contain. */}
            {!exporting && <StageChrome stage={viewportRef} />}
            {exporting && <div className="export-badge">Rendering — don’t switch tabs</div>}
            <Transport />
          </div>
        </main>

        <aside className="right">
          <Inspector />
        </aside>
      </div>

      <Narration />
      <Timeline />

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
    </div>
    </RenderHostProvider>
  );
}

/** Drives `time` from the wall clock while playing. */
function usePlayback() {
  const playing = useStore((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();

    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const s = useStore.getState();
      let t = s.time + dt;
      if (t >= s.project.duration) {
        if (s.loop) t = t % s.project.duration;
        else {
          s.setTime(s.project.duration);
          s.setPlaying(false);
          return;
        }
      }
      s.setTime(t);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}

function useShortcuts(host: RenderHost | null) {
  /**
   * Read through a ref, not the closure. The listener is attached once, so
   * capturing `host` directly would pin it to its value on first render — null,
   * before the map exists — and K would forever add a keyframe with default
   * camera values instead of the current view.
   */
  const hostRef = useRef(host);
  hostRef.current = host;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const s = useStore.getState();
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
        return;
      }

      switch (e.key) {
        case ' ':
          e.preventDefault();
          s.setPlaying(!s.playing);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          s.scrub(s.time - (e.shiftKey ? 1 : 1 / s.project.fps));
          break;
        case 'ArrowRight':
          e.preventDefault();
          s.scrub(s.time + (e.shiftKey ? 1 : 1 / s.project.fps));
          break;
        case 'Home':
          s.scrub(0);
          break;
        case 'End':
          s.scrub(s.project.duration);
          break;
        case 'k':
        case 'K': {
          const map = hostRef.current?.map;
          if (!map) return s.addKeyframe();
          const c = map.getCenter();
          s.addKeyframe({
            center: [c.lng, c.lat],
            zoom: map.getZoom(),
            bearing: map.getBearing(),
            pitch: map.getPitch(),
          });
          break;
        }
        case 'Escape':
          s.setTool('select');
          break;
        case 'Backspace':
        case 'Delete':
          if (s.selection?.kind === 'layer') s.removeLayer(s.selection.id);
          else if (s.selection?.kind === 'keyframe') s.removeKeyframe(s.selection.id);
          break;
      }
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
