import { useRef, useState } from 'react';
import { useCanRedo, useCanUndo, useStore } from '../store';
import { useRenderHost } from '../render/host';
import { emptyProject, migrate } from '@geomotion/document';
import { demoProject, indiaTourProject } from '../lib/fixtures';
import { downloadProject } from '../lib/persistence';
import { cueFromFile } from '../lib/audio-import';
import { cueFromLibrary, sfxUrl, SFX_GAIN, SFX_GROUPS, SFX_LIBRARY } from '../lib/sfx';
import { startRecording, type Recording } from '../lib/recorder';
import Icon from './Icon';

interface Place {
  name: string;
  lng: number;
  lat: number;
  // Nominatim omits it for some results, and the mapper passes undefined through.
  bbox?: [number, number, number, number] | undefined;
}

export default function Toolbar({ onExport }: { onExport: () => void }) {
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
  const audioRef = useRef<HTMLInputElement>(null);
  const addAudioCue = useStore((s) => s.addAudioCue);
  const [recording, setRecording] = useState<Recording | null>(null);
  const [sfxOpen, setSfxOpen] = useState(false);
  // Held so a second preview cuts the first off, rather than the two overlapping.
  const previewRef = useRef<HTMLAudioElement | null>(null);
  const autosaveError = useStore((s) => s.autosaveError);
  const [demoOpen, setDemoOpen] = useState(false);
  const playing = useStore((s) => s.playing);
  const setPlaying = useStore((s) => s.setPlaying);

  return (
    <header className="toolbar">
      <div className="brand">
        <span className="logo" aria-hidden="true">
          {/* A globe crossed by a motion arc — the two things the app is. */}
          <svg width="17" height="17" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="10" cy="10" r="7.2" />
            <path d="M2.9 10h14.2" strokeOpacity="0.55" />
            <path d="M10 2.8c3.4 3.9 3.4 10.5 0 14.4-3.4-3.9-3.4-10.5 0-14.4Z" strokeOpacity="0.55" />
          </svg>
        </span>
        <span className="brand-name">GeoMotion</span>
      </div>

      <span className="project-chip" title="Rename in the Composition panel">
        {name}
      </span>

      {/*
        * Autosave says the ordinary thing, not only the exceptional one.
        *
        * It used to appear only when autosave had *failed*, which meant the common state —
        * your work is safe — was invisible, and the first time you ever saw the indicator
        * was the moment it told you bad news.
        */}
      <span className={'save-state' + (autosaveError ? ' bad' : '')} title={autosaveError ?? 'Saved to this browser'}>
        <i className="save-dot" />
        {autosaveError ? 'Not saving' : 'Saved'}
      </span>

      {/* The search sits in the middle, where the eye rests, rather than tucked beside
          the undo pair — it is the way into anything, not one more action. */}
      <div className="tb-centre">
        <PlaceSearch />
      </div>

      <div className="tb-group">
        <button className="tb-btn" disabled={!canUndo} onClick={undo} title="Undo (⌘Z)">
          <Icon name="undo" />
        </button>
        <button className="tb-btn" disabled={!canRedo} onClick={redo} title="Redo (⇧⌘Z)">
          <Icon name="redo" />
        </button>
      </div>

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
        <button
          className="tb-btn"
          onClick={() => audioRef.current?.click()}
          title="Add an audio file — music or narration — at the playhead"
        >
          + Audio
        </button>
        {/*
          * A recorded line lands as an ordinary audio cue, so it ripples, re-times and mixes
          * like an imported one — §00's frozen-voice scar is exactly this being a clip rather
          * than a bed.
          */}
        <button
          className={'tb-btn' + (recording ? ' recording' : '')}
          onClick={async () => {
            if (recording) {
              try {
                const file = await recording.stop();
                const at = useStore.getState().time;
                addAudioCue(await cueFromFile(file, at));
              } catch (err) {
                alert(err instanceof Error ? err.message : 'Recording failed.');
              } finally {
                setRecording(null);
              }
              return;
            }
            try {
              setRecording(await startRecording(`Take ${(useStore.getState().project.audio?.cues?.length ?? 0) + 1}`));
            } catch (err) {
              alert(err instanceof Error ? err.message : 'Could not start recording.');
            }
          }}
          title={recording ? 'Stop recording and place it at the playhead' : 'Record narration from the microphone'}
        >
          {recording ? '■ Stop' : '● Record'}
        </button>
        {/*
          * The sound library. A picked sound becomes an ordinary cue at the playhead, so it
          * is dragged, trimmed and mixed like anything else — see lib/sfx.ts for why it is
          * placed by hand rather than triggered by an event.
          */}
        <div className="menu">
          <button
            className="tb-btn"
            onClick={() => setSfxOpen((v) => !v)}
            title="Add a sound effect at the playhead"
          >
            + Sound <Icon name="chevron-down" size={12} />
          </button>
          {sfxOpen && (
            <div className="menu-list sfx-list" onMouseLeave={() => setSfxOpen(false)}>
              {SFX_GROUPS.map((group) => (
                <div key={group}>
                  <div className="sfx-group">{group}</div>
                  {SFX_LIBRARY.filter((e) => e.group === group).map((entry) => (
                    <div key={entry.id} className="sfx-row">
                      {/*
                        * Auditioning matters more here than anywhere else in the toolbar:
                        * eighteen short sounds are not tellable apart by name, and placing
                        * one to hear it means undoing it when it is wrong.
                        */}
                      <button
                        className="sfx-play"
                        title={`Preview ${entry.label}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          previewRef.current?.pause();
                          const a = new Audio(sfxUrl(entry.id));
                          // Previewed at the level it will actually be placed at, so the
                          // audition is not louder than the result.
                          a.volume = SFX_GAIN;
                          previewRef.current = a;
                          void a.play().catch(() => {});
                        }}
                      >
                        <Icon name="play" size={10} />
                      </button>
                      <button
                        className="sfx-pick"
                        onClick={async () => {
                          setSfxOpen(false);
                          try {
                            addAudioCue(await cueFromLibrary(entry, useStore.getState().time));
                          } catch (err) {
                            alert(err instanceof Error ? err.message : `could not add ${entry.label}`);
                          }
                        }}
                      >
                        <strong>{entry.label}</strong>
                        <span>{entry.hint}</span>
                      </button>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
        <input
          ref={audioRef}
          type="file"
          accept="audio/*"
          multiple
          hidden
          onChange={async (e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = '';
            // Placed one after another from the playhead, so dropping several in at
            // once gives a sequence rather than a pile at the same instant.
            let at = useStore.getState().time;
            for (const f of files) {
              try {
                const cue = await cueFromFile(f, at);
                addAudioCue(cue);
                at += cue.d;
              } catch (err) {
                alert(err instanceof Error ? err.message : `could not import ${f.name}`);
              }
            }
          }}
        />
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
            Demo <Icon name="chevron-down" size={12} />
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


      {/*
        * Preview and Export, the two ways a composition leaves the editor. Preview plays
        * it here; Export writes a file. They are separated from the file actions above
        * because they are what you do *last*, and grouping them with Save invites the
        * wrong one.
        */}
      <button className="tb-btn" onClick={() => setPlaying(!playing)} title="Play from the playhead (Space)">
        <Icon name={playing ? 'pause' : 'preview'} size={13} />
        Preview
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
      <button
        className="tb-btn search-go"
        onClick={search}
        disabled={busy}
        // The only control here with no visible text, so it states its own name
        // rather than leaving a screen reader to announce "button".
        aria-label={busy ? 'Searching' : 'Search for a place'}
        title="Search for a place"
      >
        <Icon name={busy ? 'loop' : 'search'} />
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
