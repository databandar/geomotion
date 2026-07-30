import { useEffect, useRef } from 'react';
import type { StudioScript } from '../api';

export function RenderStep({
  script,
  log,
  output,
  busy,
  onDraft,
  onFull,
  onCancel,
  onLoadEditor,
  onExportEditor,
  previewed,
}: {
  script: StudioScript;
  log: string[];
  output: string | null;
  busy: string | null;
  onDraft: () => void;
  onFull: () => void;
  onCancel: () => void;
  onLoadEditor: () => void;
  onExportEditor: (draft: boolean) => void;
  previewed: boolean;
}) {
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [log]);

  const running = log.length > 0 && !output && !log.some((l) => l.startsWith('__'));
  const size = script.format === 'short' ? '1080×1920' : script.format === 'square' ? '1080×1080' : '1920×1080';
  const stops = script.beats.find((b) => b.kind === 'tour')?.stops?.length ?? 0;

  return (
    <div className="studio-pane split">
      <div className="pane-col">
        <h3>Render</h3>
        <dl className="spec vertical">
          <div>
            <dt>Output</dt>
            <dd>
              {size} · {script.fps} fps
            </dd>
          </div>
          <div>
            <dt>Voice</dt>
            <dd>
              {script.voice.engine}
              {script.voice.presetVoice ? ` · ${script.voice.presetVoice}` : ''}
              {script.voice.profileName ? ` · ${script.voice.profileName}` : ''}
            </dd>
          </div>
          <div>
            <dt>Beats</dt>
            <dd>
              {script.beats.map((b) => b.kind).join(' → ')} ({stops} stops)
            </dd>
          </div>
        </dl>

        <h4>1 · Check it</h4>
        <div className="row-buttons">
          <button className="tb-btn primary" onClick={onLoadEditor} disabled={!!busy}>
            {busy === 'Composing' ? 'Composing…' : 'Open in editor'}
          </button>
        </div>
        <p className="hint">
          Builds the timeline and closes Studio so you can scrub it: the narration plays on its own track, the states are
          the region layer, and every title and picture is a layer you can move, reword or restyle.
        </p>

        <h4>2 · Export</h4>
        <div className="row-buttons">
          <button className="tb-btn" onClick={() => onExportEditor(true)} disabled={!!busy || running || !previewed}>
            Draft from editor
          </button>
          <button className="tb-btn primary" onClick={() => onExportEditor(false)} disabled={!!busy || running || !previewed}>
            Export MP4 from editor
          </button>
          {running && (
            <button className="tb-btn danger" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
        {!previewed && <p className="hint warn">Open it in the editor first — that is what gets exported.</p>}
        <p className="hint">
          Exports the editor's current state, so hand edits survive. Retiming a layer will pull it out of sync with the
          narration though — the voice bed is fixed at compose time. Change pacing back in Studio, not here.
        </p>

        <h4>Or skip the editor</h4>
        <div className="row-buttons">
          <button className="tb-btn" onClick={onDraft} disabled={!!busy || running}>
            Draft render
          </button>
          <button className="tb-btn" onClick={onFull} disabled={!!busy || running}>
            Full render
          </button>
        </div>
        <p className="hint">
          Renders straight from the script, ignoring anything in the editor. A draft is quarter resolution at half the
          frame rate — minutes instead of tens of minutes, identical timing.
        </p>

        {output && (
          <div className="render-done">
            <b>Done.</b>
            <code>{output}/{script.slug}.mp4</code>
            <p className="hint">
              Alongside it: the .srt, a thumbnail, and the .geomotion.json — open that in the editor to hand-tune and
              re-render.
            </p>
          </div>
        )}
      </div>

      <div className="pane-col">
        <div className="pane-head">
          <h3>Log</h3>
          {running && <span className="dim small">running…</span>}
        </div>
        <div className="render-log" ref={logRef}>
          {log.length === 0 && <span className="dim">Nothing yet. Start a render.</span>}
          {log
            .filter((l) => !l.startsWith('__'))
            .map((l, i) => (
              <div key={i} className={/error|failed|!/i.test(l) ? 'bad' : undefined}>
                {l}
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}
