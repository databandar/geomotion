import { useEffect, useRef, useState } from 'react';
import { api, type Health, type StudioScript } from '../api';
import { LineRecorder } from './LineRecorder';

type Line = { key: string; text: string; duration?: number; cached?: boolean; manual?: boolean; url?: string; error?: string };

export function VoiceStep({
  script,
  patch,
  run,
  busy,
  health,
}: {
  script: StudioScript;
  patch: (p: Partial<StudioScript>) => void;
  run: (label: string, fn: () => Promise<void>) => Promise<void>;
  busy: string | null;
  health: Health | null;
}) {
  const [presets, setPresets] = useState<{ voice_id: string; name: string; gender: string; language: string }[]>([]);
  const [profiles, setProfiles] = useState<{ id: string; name: string; language: string; voice_type: string }[]>([]);
  const [reference, setReference] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [cloneName, setCloneName] = useState('My voice');
  const [recording, setRecording] = useState(false);
  const [recorded, setRecorded] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const startedAt = useRef(0);

  const vbEngine = script.voice.vbEngine ?? 'kokoro';

  const refresh = () =>
    api
      .voices(vbEngine)
      .then((r) => {
        setPresets(r.presets);
        setProfiles(r.profiles);
      })
      .catch(() => {
        setPresets([]);
        setProfiles([]);
      });

  useEffect(() => {
    refresh();
    api.referenceText().then((r) => setReference(r.text.trim())).catch(() => setReference(''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vbEngine]);

  const hindiPresets = presets.filter((p) => p.language === (script.voice.language ?? 'hi'));

  /* ------------------------------------------------------------ recording */

  const startRec = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks: Blob[] = [];
    const mr = new MediaRecorder(stream);
    mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: mr.mimeType });
      setRecorded({ blob, url: URL.createObjectURL(blob), seconds: (Date.now() - startedAt.current) / 1000 });
      setRecording(false);
    };
    recorder.current = mr;
    startedAt.current = Date.now();
    mr.start();
    setRecording(true);
  };

  const stopRec = () => recorder.current?.stop();

  const upload = () =>
    run('Cloning voice', async () => {
      if (!recorded) throw new Error('record or choose a sample first');
      const base64 = await new Promise<string>((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result));
        fr.onerror = reject;
        fr.readAsDataURL(recorded.blob);
      });
      const { profile } = await api.clone({
        name: cloneName,
        language: script.voice.language ?? 'hi',
        engine: 'chatterbox',
        sampleBase64: base64,
        filename: 'sample.webm',
        referenceText: reference,
      });
      await refresh();
      patch({
        voice: { ...script.voice, engine: 'voicebox', vbEngine: 'chatterbox', profileName: profile.name, presetVoice: undefined },
      });
    });

  const narrate = () =>
    run('Generating voice', async () => {
      const r = await api.narrate(script);
      setLines(r.lines);
    });

  /** After a recording is saved or cleared, re-resolve so durations are right. */
  const reNarrate = async () => {
    try {
      const r = await api.narrate(script);
      setLines(r.lines);
    } catch {
      /* leave the list as it is */
    }
  };

  const total = lines.reduce((a, l) => a + (l.duration ?? 0), 0);

  return (
    <div className="studio-pane split">
      <div className="pane-col">
        <h3>Voice</h3>
        {!health?.voicebox && (
          <p className="hint warn">
            Voicebox isn't answering on {health?.voiceboxUrl}. Open <b>/Applications/Voicebox.app</b> and leave it
            running, then reopen Studio.
          </p>
        )}

        <label className="studio-field">
          <span>Engine</span>
          <select
            className="select"
            value={script.voice.engine}
            onChange={(e) => patch({ voice: { ...script.voice, engine: e.target.value as 'voicebox' | 'say' } })}
          >
            <option value="voicebox">Voicebox (local, neural)</option>
            <option value="say">macOS say (rough fallback)</option>
          </select>
        </label>

        {script.voice.engine === 'voicebox' && (
          <>
            <label className="studio-field">
              <span>Model</span>
              <select
                className="select"
                value={vbEngine}
                onChange={(e) => patch({ voice: { ...script.voice, vbEngine: e.target.value } })}
              >
                <option value="kokoro">Kokoro — has Hindi presets, no cloning</option>
                <option value="chatterbox">Chatterbox — multilingual, cloned voice only</option>
              </select>
            </label>

            {vbEngine === 'kokoro' && (
              <>
                <h4>Preset voices ({script.voice.language ?? 'hi'})</h4>
                {!hindiPresets.length && <p className="hint">No presets for this language on this model.</p>}
                <div className="chip-row wrap">
                  {hindiPresets.map((p) => (
                    <button
                      key={p.voice_id}
                      className={'chip' + (script.voice.presetVoice === p.voice_id ? ' on' : '')}
                      onClick={() =>
                        patch({
                          voice: {
                            ...script.voice,
                            presetVoice: p.voice_id,
                            profileName: `GeoMotion ${script.voice.language ?? 'hi'} (${p.voice_id})`,
                          },
                        })
                      }
                    >
                      {p.voice_id} · {p.gender}
                    </button>
                  ))}
                </div>
              </>
            )}

            <h4>Your profiles</h4>
            {!profiles.length && <p className="hint">None yet. Clone one on the right to use your own voice.</p>}
            <div className="chip-row wrap">
              {profiles.map((p) => (
                <button
                  key={p.id}
                  className={'chip' + (script.voice.profileName === p.name ? ' on' : '')}
                  onClick={() => patch({ voice: { ...script.voice, profileName: p.name, presetVoice: undefined } })}
                  title={`${p.voice_type} · ${p.language}`}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <button className="mini" onClick={refresh}>
              Refresh
            </button>
          </>
        )}

        <div className="pane-head" style={{ marginTop: 16 }}>
          <h3>Narration</h3>
          <button className="mini primary" onClick={narrate} disabled={!!busy}>
            {busy === 'Generating voice' ? 'Generating…' : 'Generate all lines'}
          </button>
        </div>
        {lines.length > 0 && (
          <>
            <p className="hint">
              {lines.length} lines · {total.toFixed(1)}s of speech
              {lines.some((l) => l.manual) && ` · ${lines.filter((l) => l.manual).length} in your own voice`}. Each
              beat's length is cut to its line.
            </p>
            <div className="line-list wide">
              {lines.map((l) => (
                <div className={'line' + (l.error ? ' bad' : '') + (l.manual ? ' mine' : '')} key={l.key}>
                  <span className="dur">{l.error ? '—' : `${l.duration?.toFixed(1)}s`}</span>
                  <span className="txt" title={l.text}>
                    {l.manual && <b className="mine-tag">mine</b>}
                    {l.error ?? l.text}
                  </span>
                  {l.url && <audio controls preload="none" src={l.url} />}
                  <LineRecorder
                    slug={script.slug}
                    lineKey={l.key}
                    text={l.text}
                    manual={!!l.manual}
                    onChanged={reNarrate}
                  />
                </div>
              ))}
            </div>
            <p className="hint">
              Record any line to replace the synthesised take with your own. Recordings live in their own folder, so
              re-running the pipeline never overwrites them.
            </p>
          </>
        )}
      </div>

      <div className="pane-col">
        <h3>Clone your own voice</h3>
        <p className="hint">
          Chatterbox needs about 30 seconds of clean speech. Read the passage below at your normal pace, in a quiet room.
          It's written to cover a wide spread of Hindi sounds, which is what makes the clone hold up on unfamiliar words.
        </p>

        <div className="read-script">{reference || 'Loading…'}</div>
        <button className="mini" onClick={() => navigator.clipboard?.writeText(reference)}>
          Copy text
        </button>

        <h4>Record</h4>
        <div className="row-buttons">
          {!recording ? (
            <button className="mini primary" onClick={() => run('Recording', startRec)}>
              ● Record
            </button>
          ) : (
            <button className="mini danger" onClick={stopRec}>
              ■ Stop
            </button>
          )}
          <label className="mini file-pick">
            Choose a file…
            <input
              type="file"
              accept="audio/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setRecorded({ blob: f, url: URL.createObjectURL(f), seconds: 0 });
              }}
            />
          </label>
        </div>

        {recording && <p className="hint warn">Recording… read the whole passage, then press Stop.</p>}
        {recorded && (
          <>
            <audio controls src={recorded.url} style={{ width: '100%', marginTop: 8 }} />
            {recorded.seconds > 0 && (
              <p className={'hint' + (recorded.seconds < 20 ? ' warn' : '')}>
                {recorded.seconds.toFixed(0)}s captured{recorded.seconds < 20 ? ' — aim for 30s or the clone gets thin' : ''}
              </p>
            )}
            <label className="studio-field">
              <span>Name</span>
              <input className="text-input" value={cloneName} onChange={(e) => setCloneName(e.target.value)} />
            </label>
            <button className="mini primary" onClick={upload} disabled={!!busy || !health?.voicebox}>
              {busy === 'Cloning voice' ? 'Uploading…' : 'Create cloned profile'}
            </button>
            <p className="hint">
              The passage you read is stored with the sample as its transcript, which is what Chatterbox uses to align
              the clone. Only clone a voice you have the right to use.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
