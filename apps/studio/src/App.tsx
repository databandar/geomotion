import { useEffect, useState } from 'react';
import MapCanvas from './components/MapCanvas';
import Timeline from './components/Timeline';
import LayerPanel from './components/LayerPanel';
import Inspector from './components/Inspector';
import Toolbar from './components/Toolbar';
import Transport from './components/Transport';
import ExportDialog from './components/ExportDialog';
import Studio from './studio/Studio';
import Narration from './components/Narration';
import { useStore } from './store';
import { getMap } from './lib/mapref';

export default function App() {
  const [showExport, setShowExport] = useState(false);
  // 'min' keeps Studio mounted while you work in the editor, so its script,
  // recordings and preview state survive the round trip.
  const [studio, setStudio] = useState<'closed' | 'open' | 'min'>('closed');
  usePlayback();
  useShortcuts();

  const exporting = useStore((s) => s.exporting);

  return (
    <div className={'app' + (exporting ? ' exporting' : '')}>
      <Toolbar onExport={() => setShowExport(true)} onStudio={() => setStudio('open')} />

      <div className="workspace">
        <aside className="left">
          <LayerPanel />
        </aside>

        <main className="center">
          <div className="viewport">
            <MapCanvas />
            {exporting && <div className="export-badge">Rendering — don’t switch tabs</div>}
          </div>
          <Transport />
        </main>

        <aside className="right">
          <Inspector />
        </aside>
      </div>

      <Narration />
      <Timeline />

      {showExport && <ExportDialog onClose={() => setShowExport(false)} />}
      {studio !== 'closed' && (
        <Studio
          hidden={studio === 'min'}
          onClose={() => setStudio('closed')}
          onMinimize={() => setStudio('min')}
        />
      )}
      {studio === 'min' && (
        <button className="studio-pill" onClick={() => setStudio('open')} title="Back to Studio">
          ✦ Studio
        </button>
      )}
    </div>
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

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      const s = useStore.getState();
      const meta = e.metaKey || e.ctrlKey;

      if (meta && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? s.redo() : s.undo();
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
          const map = getMap();
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
