import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { migrate } from '@geomotion/document';
import { RAMPS } from '../lib/palettes';
import { BASEMAPS } from '../lib/basemaps';
import { api, watchRender, type Beat, type Extracted, type Health, type StudioScript } from './api';
import { defaultScript } from './defaults';
import { DataStep } from './steps/DataStep';
import { ScriptStep } from './steps/ScriptStep';
import { VoiceStep } from './steps/VoiceStep';
import { RenderStep } from './steps/RenderStep';

const STEPS = ['Data', 'Script', 'Voice', 'Look', 'Render'] as const;
type Step = (typeof STEPS)[number];

export default function Studio({
  hidden,
  onClose,
  onMinimize,
}: {
  hidden: boolean;
  onClose: () => void;
  onMinimize: () => void;
}) {
  const [step, setStep] = useState<Step>('Data');
  const [health, setHealth] = useState<Health | null>(null);
  const [script, setScript] = useState<StudioScript>(defaultScript);
  const [data, setData] = useState<Extracted | null>(null);
  const [regions, setRegions] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [output, setOutput] = useState<string | null>(null);
  const [previewed, setPreviewed] = useState(false);
  const stopWatch = useRef<(() => void) | null>(null);
  const replaceProject = useStore((s) => s.replaceProject);

  useEffect(() => {
    api.health().then(setHealth).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    api.regions(script.dataset).then((r) => setRegions(r.regions)).catch(() => setRegions([]));
  }, [script.dataset]);

  useEffect(() => () => stopWatch.current?.(), []);

  const patch = (p: Partial<StudioScript>) => setScript((s) => ({ ...s, ...p }));

  /** Wraps every server call so failures land in one visible place. */
  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const loadIntoEditor = () =>
    run('Composing', async () => {
      const { project, duration, missing, unresolved } = await api.compose(script);
      replaceProject(migrate(project));
      setPreviewed(true);
      setOutput(null);
      if (unresolved?.length) {
        setError(`Placeholders that would be read aloud verbatim — ${unresolved.join(' · ')}`);
      } else if (missing.length) {
        setError(`No data for: ${[...new Set(missing)].join(', ')} — they will render as "no data".`);
      }
      void duration;
      onMinimize();
    });

  /**
   * Render exactly what the editor holds now. Anything tweaked by hand after the
   * preview is kept, which a script-driven render would quietly throw away.
   */
  const exportFromEditor = (draft: boolean) =>
    run(draft ? 'Exporting draft' : 'Exporting', async () => {
      setLog([]);
      setOutput(null);
      const project = useStore.getState().project;
      await api.renderProject(project, script.slug, draft);
      stopWatch.current?.();
      stopWatch.current = watchRender(
        (lines) => setLog((l) => [...l, ...lines].slice(-300)),
        (info) => setOutput(info.exit === 0 ? info.output : null),
      );
    });

  const startRender = (draft: boolean) =>
    run(draft ? 'Starting draft render' : 'Starting full render', async () => {
      setLog([]);
      setOutput(null);
      await api.render(script, draft);
      stopWatch.current?.();
      stopWatch.current = watchRender(
        (lines) => setLog((l) => [...l, ...lines].slice(-300)),
        (info) => setOutput(info.exit === 0 ? info.output : null),
      );
    });

  const tourStops = useMemo(() => {
    const t = script.beats.find((b) => b.kind === 'tour');
    return t?.stops ?? [];
  }, [script.beats]);

  const setBeats = (beats: Beat[]) => patch({ beats });

  return (
    <div className="studio" style={hidden ? { display: 'none' } : undefined}>
      <header className="studio-head">
        <div className="studio-title">
          <span className="logo">◍</span> Studio
          <span className="dim"> — script to video</span>
        </div>

        <nav className="studio-steps">
          {STEPS.map((s, i) => (
            <button key={s} className={'studio-step' + (step === s ? ' active' : '')} onClick={() => setStep(s)}>
              <span className="n">{i + 1}</span>
              {s}
            </button>
          ))}
        </nav>

        <div className="studio-status">
          <Dot ok={!!health?.openrouter} label={health ? `LLM ${health.textModel.split('/').pop()}` : 'LLM'} />
          <Dot ok={!!health?.voicebox} label="Voicebox" />
          <Dot ok={!!health?.ffmpeg} label="ffmpeg" />
          <Dot ok={!!health?.nfhs} label={health?.nfhs ? `NFHS ${health.nfhs}` : 'NFHS'} />
        </div>

        <button className="tb-btn" onClick={onMinimize} title="Hide Studio and work in the editor">
          Minimise
        </button>
        <button className="tb-btn" onClick={onClose} title="Discard this Studio session">
          Close
        </button>
      </header>

      {error && (
        <div className="studio-error" onClick={() => setError(null)}>
          {error} <span className="dim">(click to dismiss)</span>
        </div>
      )}

      <div className="studio-body">
        {step === 'Data' && (
          <DataStep script={script} patch={patch} data={data} setData={setData} run={run} busy={busy} />
        )}
        {step === 'Script' && (
          <ScriptStep
            script={script}
            patch={patch}
            setBeats={setBeats}
            data={data}
            regions={regions}
            run={run}
            busy={busy}
            health={health}
          />
        )}
        {step === 'Voice' && <VoiceStep script={script} patch={patch} run={run} busy={busy} health={health} />}
        {step === 'Look' && <LookStep script={script} patch={patch} />}
        {step === 'Render' && (
          <RenderStep
            script={script}
            log={log}
            output={output}
            busy={busy}
            onDraft={() => startRender(true)}
            onFull={() => startRender(false)}
            onCancel={() => api.cancelRender().catch(() => {})}
            onLoadEditor={loadIntoEditor}
            onExportEditor={exportFromEditor}
            previewed={previewed}
          />
        )}
      </div>

      <footer className="studio-foot">
        <span className="dim">
          {script.format} · {tourStops.length} stops · {script.beats.length} beats
        </span>
        <div className="row-buttons">
          <button className="tb-btn" onClick={loadIntoEditor} disabled={!!busy}>
            {busy === 'Composing' ? 'Composing…' : 'Preview in editor'}
          </button>
          <button className="tb-btn primary" onClick={() => setStep('Render')}>
            Render →
          </button>
        </div>
      </footer>
    </div>
  );
}

function Dot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={'hdot' + (ok ? ' ok' : '')} title={ok ? `${label}: ready` : `${label}: unavailable`}>
      <i />
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------- look */

function LookStep({ script, patch }: { script: StudioScript; patch: (p: Partial<StudioScript>) => void }) {
  return (
    <div className="studio-pane narrow">
      <h3>Format</h3>
      <div className="chip-row">
        {(['short', 'landscape', 'square'] as const).map((f) => (
          <button key={f} className={'chip' + (script.format === f ? ' on' : '')} onClick={() => patch({ format: f })}>
            {f === 'short' ? 'Vertical 9:16' : f === 'landscape' ? 'Landscape 16:9' : 'Square 1:1'}
          </button>
        ))}
      </div>

      <h3>Basemap</h3>
      <div className="chip-row wrap">
        {BASEMAPS.map((b) => (
          <button
            key={b.id}
            className={'chip' + (script.basemap === b.id ? ' on' : '')}
            onClick={() => patch({ basemap: b.id })}
          >
            {b.name}
          </button>
        ))}
      </div>
      <label className="check">
        <input type="checkbox" checked={script.terrain} onChange={(e) => patch({ terrain: e.target.checked })} />
        3D terrain relief
      </label>

      <h3>Colour ramp</h3>
      <div className="ramp-list">
        {RAMPS.map((r) => (
          <button
            key={r.id}
            className={'ramp-row' + (script.ramp === r.id ? ' on' : '')}
            onClick={() => patch({ ramp: r.id })}
          >
            <span className="ramp-swatch">
              {r.steps.map((c) => (
                <i key={c} style={{ background: c }} />
              ))}
            </span>
            {r.name}
          </button>
        ))}
      </div>

      <h3>Camera</h3>
      <Range label="Pitch" value={script.pitch ?? 34} min={0} max={70} step={1} onChange={(pitch) => patch({ pitch })} />
      <Range label="Path bow" value={script.cameraBow ?? 0.35} min={0} max={1} step={0.05} onChange={(cameraBow) => patch({ cameraBow })} />
      <Range label="Fly time" value={script.flyTime ?? 0.7} min={0.2} max={2} step={0.05} onChange={(flyTime) => patch({ flyTime })} suffix="s" />
      <Range label="Framing pad" value={script.padding ?? 0.13} min={0} max={0.4} step={0.01} onChange={(padding) => patch({ padding })} />

      <h3>Credit line</h3>
      <textarea className="text-input" rows={2} value={script.credit} onChange={(e) => patch({ credit: e.target.value })} />
      <p className="hint">Burned into every frame, bottom-right. Keep the data source in it.</p>
    </div>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
  suffix,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label className="studio-range">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value))} />
      <b>
        {Math.round(value * 100) / 100}
        {suffix ?? ''}
      </b>
    </label>
  );
}
