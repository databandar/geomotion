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
import { chordOf } from '@geomotion/commands';
import { commands, registerEditorCommands } from './lib/commands';
import Palette from './components/Palette';

export default function App() {
  const [showExport, setShowExport] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  /**
   * The render surface, published by MapCanvas once the map exists. App owns it
   * because the toolbar, inspector and export dialog are siblings of the canvas,
   * not children of it.
   */
  const [host, setHost] = useState<RenderHost | null>(null);
  /** The element that goes fullscreen — the stage card, so its controls come with it. */
  const viewportRef = useRef<HTMLDivElement>(null);
  usePlayback();
  useShortcuts(host, () => setShowPalette(true));

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
      {showPalette && <Palette onClose={() => setShowPalette(false)} />}
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

function useShortcuts(host: RenderHost | null, openPalette: () => void) {
  /**
   * Read through a ref, not the closure. The listener is attached once, so capturing `host`
   * directly would pin it to its value on first render — null, before the map exists — and
   * the camera commands would forever use default values instead of the current view.
   */
  const hostRef = useRef(host);
  hostRef.current = host;
  /*
   * The opener goes through a ref for the same reason: the listener is attached once, so a
   * captured callback would pin whichever closure existed on first render. Reading through a
   * ref makes the staleness question moot rather than answering it in a suppression comment
   * — the pattern this file already uses for `host`.
   */
  const openRef = useRef(openPalette);
  openRef.current = openPalette;

  // Registered once, against a getter for the host, so the commands see the live map.
  useEffect(() => registerEditorCommands(() => hostRef.current), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

      const press = { key: e.key, meta: e.metaKey, ctrl: e.ctrlKey, shift: e.shiftKey, alt: e.altKey };

      // The palette is the one binding the palette itself cannot own, since opening it is a
      // piece of editor state rather than a document action (§4).
      if (chordOf(press) === 'mod+k') {
        e.preventDefault();
        openRef.current();
        return;
      }

      /*
       * Everything else is a command. The keymap is a lookup rather than a switch, which is
       * what makes §11's promises checkable: a shortcut exists only if some command claims
       * it, two commands claiming one fails CI, and the palette shows the same binding the
       * keyboard obeys because both read this list.
       *
       * A keyframe row deletes rather than a layer when one is selected — a selection-shaped
       * decision the delete command cannot make, so it is made here and kept small.
       */
      const command = commands.forKey(press);
      if (!command) return;
      if (command.id === 'layer.delete' && useStore.getState().selection?.kind === 'keyframe') {
        e.preventDefault();
        const id = useStore.getState().selection?.id;
        if (id) useStore.getState().removeKeyframe(id);
        return;
      }
      e.preventDefault();
      command.run();
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
