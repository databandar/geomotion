import { useRef, useState } from 'react';
import { useCanRedo, useCanUndo, useStore } from '../store';
import { useRenderHost } from '../render/host';
import { emptyProject, migrate } from '@geomotion/document';
import { demoProject, indiaTourProject } from '../lib/fixtures';
import { downloadProject } from '../lib/persistence';

interface Place {
  name: string;
  lng: number;
  lat: number;
  bbox?: [number, number, number, number];
}

export default function Toolbar({ onExport, onStudio }: { onExport: () => void; onStudio: () => void }) {
  const host = useRenderHost();
  const name = useStore((s) => s.project.name);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useCanUndo();
  const canRedo = useCanRedo();
  const project = useStore((s) => s.project);
  const replaceProject = useStore((s) => s.replaceProject);
  const addKeyframe = useStore((s) => s.addKeyframe);
  const fileRef = useRef<HTMLInputElement>(null);
  const [demoOpen, setDemoOpen] = useState(false);

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo">◍</span>
        <span className="brand-name">GeoMotion</span>
      </div>

      <span className="project-name" title="Rename in the Composition panel">
        {name}
      </span>

      <div className="tb-group">
        <button className="tb-btn" disabled={!canUndo} onClick={undo} title="Undo (⌘Z)">
          ↺
        </button>
        <button className="tb-btn" disabled={!canRedo} onClick={redo} title="Redo (⇧⌘Z)">
          ↻
        </button>
      </div>

      <PlaceSearch />

      <div className="tb-spacer" />

      <button
        className="tb-btn"
        title="Add a camera keyframe at the playhead from the current view (K)"
        onClick={() => {
          const map = host?.map;
          if (!map) return addKeyframe();
          const c = map.getCenter();
          addKeyframe({ center: [c.lng, c.lat], zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() });
        }}
      >
        + Keyframe
      </button>

      <div className="tb-group">
        <button className="tb-btn" onClick={() => downloadProject(project)} title="Save project as .json">
          Save
        </button>
        <button className="tb-btn" onClick={() => fileRef.current?.click()} title="Open a saved project">
          Open
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              replaceProject(migrate(JSON.parse(await f.text())));
            } catch {
              alert('That file could not be read as a GeoMotion project.');
            }
            e.target.value = '';
          }}
        />
        <button
          className="tb-btn"
          onClick={() => {
            if (confirm('Start a new empty project? Unsaved changes will be lost.')) replaceProject(emptyProject());
          }}
        >
          New
        </button>
        <div className="menu">
          <button className="tb-btn" onClick={() => setDemoOpen((v) => !v)} title="Load a starter project">
            Demo ▾
          </button>
          {demoOpen && (
            <ul className="menu-list" onMouseLeave={() => setDemoOpen(false)}>
              <li
                onClick={() => {
                  replaceProject(demoProject());
                  setDemoOpen(false);
                }}
              >
                <strong>Route flight</strong>
                <span>San Francisco → Tokyo, animated arc</span>
              </li>
              <li
                onClick={() => {
                  replaceProject(indiaTourProject());
                  setDemoOpen(false);
                }}
              >
                <strong>Region tour</strong>
                <span>Indian states, highlighted one by one</span>
              </li>
            </ul>
          )}
        </div>
      </div>

      <button className="tb-btn" onClick={onStudio} title="Script → voice → render, all in one place">
        ✦ Studio
      </button>

      <button className="tb-btn primary" onClick={onExport}>
        Export
      </button>
    </header>
  );
}

function PlaceSearch() {
  const host = useRenderHost();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6&q=${encodeURIComponent(q)}`;
      const res = await fetch(url, { headers: { Accept: 'application/json' } });
      const json = (await res.json()) as {
        display_name: string;
        lat: string;
        lon: string;
        boundingbox?: [string, string, string, string];
      }[];
      setResults(
        json.map((r) => ({
          name: r.display_name,
          lng: parseFloat(r.lon),
          lat: parseFloat(r.lat),
          bbox: r.boundingbox
            ? [parseFloat(r.boundingbox[2]), parseFloat(r.boundingbox[0]), parseFloat(r.boundingbox[3]), parseFloat(r.boundingbox[1])]
            : undefined,
        })),
      );
      setOpen(true);
    } catch {
      setResults([]);
    } finally {
      setBusy(false);
    }
  };

  const goto = (p: Place) => {
    const map = host?.map;
    if (!map) return;
    if (p.bbox) {
      map.fitBounds(
        [
          [p.bbox[0], p.bbox[1]],
          [p.bbox[2], p.bbox[3]],
        ],
        { padding: 60, duration: 900 },
      );
    } else {
      map.flyTo({ center: [p.lng, p.lat], zoom: 11, duration: 900 });
    }
    setOpen(false);
  };

  return (
    <div className="search">
      <input
        value={q}
        placeholder="Search a place…"
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') search();
          if (e.key === 'Escape') setOpen(false);
        }}
        onFocus={() => results.length && setOpen(true)}
      />
      <button className="tb-btn" onClick={search} disabled={busy}>
        {busy ? '…' : '⌕'}
      </button>
      {open && results.length > 0 && (
        <ul className="search-results">
          {results.map((r, i) => (
            <li key={i} onClick={() => goto(r)}>
              {r.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
