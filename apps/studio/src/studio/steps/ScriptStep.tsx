import { useCallback, useEffect, useState } from 'react';
import { api, type Beat, type Extracted, type Health, type StudioScript, type TourStop } from '../api';
import { BEAT_HELP } from '../defaults';

/** The message from a failed illustration request, if that is what this is. */
const imageError = (v: string | undefined) => (v?.startsWith('error:') ? v.slice(6) : null);

const KINDS: Beat['kind'][] = ['hook', 'clouds', 'outline', 'overview', 'tour', 'ranking', 'labels'];

export function ScriptStep({
  script,
  patch,
  setBeats,
  data,
  regions,
  run,
  busy,
  health,
}: {
  script: StudioScript;
  patch: (p: Partial<StudioScript>) => void;
  setBeats: (b: Beat[]) => void;
  data: Extracted | null;
  regions: string[];
  run: (label: string, fn: () => Promise<void>) => Promise<void>;
  busy: string | null;
  health: Health | null;
}) {
  const [paste, setPaste] = useState('');
  const [showPaste, setShowPaste] = useState(false);
  const [images, setImages] = useState<Record<string, string>>({});
  const [genning, setGenning] = useState<string | null>(null);
  const [showStyle, setShowStyle] = useState(false);

  const refreshAssets = useCallback(() => {
    api
      .assets(script.slug)
      .then((r) => setImages(Object.fromEntries(r.images.map((i) => [i.region, i.url]))))
      .catch(() => setImages({}));
  }, [script.slug]);

  useEffect(refreshAssets, [refreshAssets]);

  const beats = script.beats;
  const tourIndex = beats.findIndex((b) => b.kind === 'tour');
  const stops = (tourIndex >= 0 ? beats[tourIndex]?.stops : undefined) ?? [];

  const editBeat = (i: number, p: Partial<Beat>) => setBeats(beats.map((b, j) => (i === j ? { ...b, ...p } : b)));
  const setStops = (next: TourStop[]) => tourIndex >= 0 && editBeat(tourIndex, { stops: next });

  const generate = () =>
    run('Writing script', async () => {
      if (!data) throw new Error('Pick an indicator on the Data step first');
      const out = await api.writeScript({
        topic: script.title,
        indicator: data.indicator,
        ranked: data.ranked,
        regions,
        national: data.national,
        nationalPrevious: data.nationalPrevious,
        stops: 6,
      });
      // Keep the beat kinds the user has arranged; only fill the words and stops.
      const byKind = new Map(out.beats.map((b) => [b.kind, b]));
      setBeats(
        beats.map((b) => {
          const fresh = byKind.get(b.kind);
          if (!fresh) return b;
          return {
            ...b,
            say: fresh.say ?? b.say,
            onScreen: fresh.onScreen ?? b.onScreen,
            heading: fresh.heading ?? b.heading,
            stops: b.kind === 'tour' ? (fresh.stops ?? b.stops) : b.stops,
          };
        }),
      );
      if (out.dropped.length) throw new Error(`Unknown regions dropped: ${out.dropped.join(', ')}`);
      if (out.shortfall) throw new Error(`${out.shortfall} — the missing ones got a plain fallback line, check them.`);
    });

  const fillTopN = (n: number) => {
    if (!data) return;
    const top = data.ranked.slice(0, n);
    const lowest = data.ranked[data.ranked.length - 1];
    const next: TourStop[] = top.map(([region], i) => ({
      region,
      say: stops[i]?.region === region ? stops[i].say : `नंबर ${i + 1} — ${region}। {value} प्रतिशत।`,
    }));
    if (lowest) next.push({ region: lowest[0], say: `और सबसे कम? ${lowest[0]}। सिर्फ़ {value} प्रतिशत।` });
    setStops(next);
  };

  /** Write the whole script out, so it can be versioned or re-loaded later. */
  const exportScript = () => {
    const blob = new Blob([JSON.stringify(script, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${script.slug || 'script'}.script.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const importScript = async (file: File) => {
    const parsed = JSON.parse(await file.text()) as Partial<StudioScript>;
    if (!Array.isArray(parsed.beats)) throw new Error('that file has no "beats" array');
    patch(parsed);
  };

  /**
   * Take plain text — one line per beat, blank lines ignored — and lay it onto
   * the beats in order, tour stops included. Quicker than clicking through every
   * field when you have already written the thing elsewhere.
   */
  const applyPaste = () => {
    const rows = paste
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);
    if (!rows.length) return;

    let cursor = 0;
    /*
     * Read each row once. The previous form tested `rows[cursor]` and took
     * `rows[cursor++]` — the same index at evaluation time, so correct, but it
     * relied on that coincidence and read as though it might not.
     */
    const nextRow = () => {
      const row = rows[cursor];
      if (row === undefined) return undefined;
      cursor++;
      return row;
    };
    const next = beats.map((b) => {
      if (b.kind === 'tour') {
        const taken = (b.stops ?? []).map((st) => {
          const row = nextRow();
          return row === undefined ? st : { ...st, say: row };
        });
        return { ...b, stops: taken };
      }
      const row = nextRow();
      return row === undefined ? b : { ...b, say: row };
    });
    setBeats(next);
    setShowPaste(false);
    setPaste('');
  };

  const generateImage = async (region: string) => {
    if (!region) return;
    setGenning(region);
    try {
      const r = await api.image({ slug: script.slug, region, style: script.imageStyle });
      if (r.url) setImages((m) => ({ ...m, [region]: r.url as string }));
    } catch (e) {
      // Surfaced inline rather than through the global banner: one failed
      // illustration shouldn't look like the whole step broke.
      setImages((m) => ({ ...m, [region]: `error:${(e as Error).message}` }));
    } finally {
      setGenning(null);
    }
  };

  const generateAll = () =>
    run('Generating images', async () => {
      for (const stop of stops) {
        if (!stop.region || images[stop.region]?.startsWith('/assets-out')) continue;
        await generateImage(stop.region);
      }
    });

  const dropImage = async (region: string) => {
    await api.deleteAsset(script.slug, region).catch(() => {});
    setImages((m) => {
      const next = { ...m };
      delete next[region];
      return next;
    });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= stops.length) return;
    const next = stops.slice();
    const a = next[i];
    const b = next[j];
    if (!a || !b) return;
    next[i] = b;
    next[j] = a;
    setStops(next);
  };

  return (
    <div className="studio-pane split">
      <div className="pane-col">
        <div className="pane-head">
          <h3>Beats</h3>
          <div className="row-buttons">
            <button className="mini" onClick={() => setShowPaste((v) => !v)}>
              Paste text
            </button>
            <label className="mini file-pick">
              Import…
              <input
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) run('Importing script', () => importScript(f));
                  e.target.value = '';
                }}
              />
            </label>
            <button className="mini" onClick={exportScript}>
              Export
            </button>
            <button className="mini primary" onClick={generate} disabled={!!busy || !health?.openrouter || !data}>
              {busy === 'Writing script' ? 'Writing…' : 'Write with AI'}
            </button>
          </div>
        </div>

        {showPaste && (
          <>
            <textarea
              className="text-input"
              rows={8}
              placeholder={'One line per beat, in order. Blank lines ignored.\n\nHook line…\nOverview line…\nStop 1 line…\nStop 2 line…'}
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
            />
            <div className="row-buttons">
              <button className="mini primary" onClick={applyPaste} disabled={!paste.trim()}>
                Apply to beats
              </button>
              <button className="mini" onClick={() => setShowPaste(false)}>
                Cancel
              </button>
            </div>
            <p className="hint">
              Lines are assigned top to bottom across the beats you have, with tour stops taking one each. Everything
              stays editable afterwards.
            </p>
          </>
        )}
        {!health?.openrouter && <p className="hint warn">No OPENROUTER_API_KEY — set it in .env.local and restart the dev server.</p>}
        {!data && <p className="hint warn">Pick an indicator on the Data step to enable AI writing.</p>}

        <label className="studio-field">
          <span>Title</span>
          <input className="text-input" value={script.title} onChange={(e) => patch({ title: e.target.value })} />
        </label>

        {beats.map((beat, i) => (
          <div className="beat" key={i}>
            <div className="beat-head">
              <select
                className="select"
                value={beat.kind}
                onChange={(e) => editBeat(i, { kind: e.target.value as Beat['kind'] })}
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
              <span className="dim small">{BEAT_HELP[beat.kind]}</span>
              <button
                className="icon-btn danger"
                title="Remove beat"
                onClick={() => setBeats(beats.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </div>

            {beat.kind !== 'tour' && (
              <>
                <textarea
                  className="text-input"
                  rows={2}
                  placeholder="Narration (Hindi)"
                  value={beat.say ?? ''}
                  onChange={(e) => editBeat(i, { say: e.target.value })}
                />
                <input
                  className="text-input"
                  placeholder="On-screen text (English, short) — optional"
                  value={beat.onScreen ?? ''}
                  onChange={(e) => editBeat(i, { onScreen: e.target.value })}
                />
              </>
            )}
            {beat.kind === 'ranking' && (
              <div className="row-buttons">
                <input
                  className="text-input narrow"
                  placeholder="Heading"
                  value={beat.heading ?? ''}
                  onChange={(e) => editBeat(i, { heading: e.target.value })}
                />
                <input
                  className="num"
                  type="number"
                  min={3}
                  max={10}
                  value={beat.top ?? 5}
                  onChange={(e) => editBeat(i, { top: parseInt(e.target.value, 10) })}
                />
              </div>
            )}
            {beat.kind === 'tour' && <p className="hint">Stops are edited on the right →</p>}
          </div>
        ))}

        <button className="mini" onClick={() => setBeats([...beats, { kind: 'overview', say: '' }])}>
          + Add beat
        </button>
      </div>

      <div className="pane-col">
        <div className="pane-head">
          <h3>Tour stops</h3>
          <div className="row-buttons">
            <button className="mini" onClick={() => fillTopN(5)} disabled={!data}>
              Top 5
            </button>
            <button className="mini" onClick={() => fillTopN(8)} disabled={!data}>
              Top 8
            </button>
            <button className="mini" onClick={generateAll} disabled={!!busy || !!genning || !stops.length || !health?.openrouter}>
              {busy === 'Generating images' ? 'Generating…' : 'Illustrate all'}
            </button>
            <button className="mini" onClick={() => setShowStyle((v) => !v)}>
              Style…
            </button>
          </div>
        </div>

        {showStyle && (
          <>
            <textarea
              className="text-input"
              rows={2}
              value={script.imageStyle ?? ''}
              placeholder="Shared look for every generated illustration"
              onChange={(e) => patch({ imageStyle: e.target.value })}
            />
            <p className="hint">
              Kept deliberately illustrative. A photorealistic AI image of a real state, dropped into a data video, reads
              as documentary footage it isn't — so the default asks for a flat vector motif with no text, no map and no
              faces.
            </p>
          </>
        )}
        <p className="hint">
          The camera visits these in order. Pick a state from the dropdown — the list is the {regions.length} regions in
          the boundary set, so a name can never be misspelled.
        </p>

        <div className="stop-editor">
          {stops.map((stop, i) => (
            <div className="stop-edit" key={i}>
              <div className="stop-edit-head">
                <span className="idx">{i + 1}</span>
                <select
                  className="select"
                  value={stop.region}
                  onChange={(e) => setStops(stops.map((s, j) => (i === j ? { ...s, region: e.target.value } : s)))}
                >
                  <option value="">— pick a state —</option>
                  {regions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                      {data?.values[r] !== undefined ? `  (${data.values[r]})` : '  — no data'}
                    </option>
                  ))}
                </select>
                <button className="icon-btn" onClick={() => move(i, -1)} title="Earlier">
                  ↑
                </button>
                <button className="icon-btn" onClick={() => move(i, 1)} title="Later">
                  ↓
                </button>
                <button
                  className="icon-btn danger"
                  onClick={() => setStops(stops.filter((_, j) => j !== i))}
                  title="Remove"
                >
                  ×
                </button>
              </div>
              <textarea
                className="text-input"
                rows={2}
                placeholder="Narration — use {value}, {previous}, {delta}"
                value={stop.say}
                onChange={(e) => setStops(stops.map((s, j) => (i === j ? { ...s, say: e.target.value } : s)))}
              />

              <div className="stop-image">
                {images[stop.region]?.startsWith('/assets-out') ? (
                  <img src={images[stop.region]} alt="" />
                ) : (
                  <span className={'img-slot' + (images[stop.region]?.startsWith('error:') ? ' bad' : '')}>
                    {genning === stop.region
                      ? '…'
                      : images[stop.region]?.startsWith('error:')
                        ? '!'
                        : 'no image'}
                  </span>
                )}
                <div className="stop-image-side">
                  <div className="row-buttons">
                    <button
                      className="mini"
                      onClick={() => generateImage(stop.region)}
                      disabled={!!genning || !stop.region || !health?.openrouter}
                    >
                      {genning === stop.region ? 'Generating…' : images[stop.region] ? 'Regenerate' : 'Generate'}
                    </button>
                    {images[stop.region]?.startsWith('/assets-out') && (
                      <button className="mini danger" onClick={() => dropImage(stop.region)}>
                        Remove
                      </button>
                    )}
                  </div>
                  <input
                    className="text-input"
                    placeholder="Caption (optional)"
                    value={stop.caption ?? ''}
                    onChange={(e) => setStops(stops.map((s, j) => (i === j ? { ...s, caption: e.target.value } : s)))}
                  />
                  {imageError(images[stop.region]) && (
                    <p className="hint warn">{imageError(images[stop.region])}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {!stops.length && <p className="hint pad">No stops yet — use Top 5, or write the script with AI.</p>}
        </div>

        <button
          className="mini"
          onClick={() => setStops([...stops, { region: regions[0] ?? '', say: '' }])}
          disabled={!regions.length}
        >
          + Add stop
        </button>

        <p className="hint">
          {'{value}'} is replaced from the data before the voice is generated, so a number in the narration can never
          contradict the map.
        </p>
      </div>
    </div>
  );
}
