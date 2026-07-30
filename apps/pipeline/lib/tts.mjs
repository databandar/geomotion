import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import path from 'node:path';

const run = promisify(execFile);

/**
 * Voiceover generation. Engines are pluggable because the right one depends on
 * what the video is for: `say` is free and offline and fine for cutting a rough
 * edit, but it sounds like a screen reader. Publish with a neural voice.
 */

export async function probeDuration(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=nw=1:nk=1',
    file,
  ]);
  const d = parseFloat(stdout.trim());
  if (!isFinite(d)) throw new Error(`could not read duration of ${file}`);
  return d;
}

/** macOS system TTS. Hindi voice is "Lekha". Offline, free, robotic. */
async function sayEngine(text, outWav, { voice = 'Lekha', rate = 165 }) {
  const aiff = outWav.replace(/\.wav$/, '.aiff');
  await run('say', ['-v', voice, '-r', String(rate), '-o', aiff, text]);
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', aiff, '-ar', '48000', '-ac', '1', outWav]);
  await fs.rm(aiff, { force: true });
}

/** ElevenLabs — the best Hindi quality of the three. Needs ELEVENLABS_API_KEY. */
async function elevenEngine(text, outWav, opts) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) throw new Error('ELEVENLABS_API_KEY is not set');
  const voiceId = opts.voiceId || process.env.ELEVENLABS_VOICE_ID;
  if (!voiceId) throw new Error('set voiceId in the script, or ELEVENLABS_VOICE_ID');

  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      text,
      model_id: opts.model || 'eleven_multilingual_v2',
      voice_settings: { stability: 0.45, similarity_boost: 0.75, style: 0.15 },
    }),
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);

  const mp3 = outWav.replace(/\.wav$/, '.mp3');
  await fs.writeFile(mp3, Buffer.from(await res.arrayBuffer()));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', mp3, '-ar', '48000', '-ac', '1', outWav]);
  await fs.rm(mp3, { force: true });
}

/** Google Cloud TTS. Needs GOOGLE_TTS_API_KEY. hi-IN-Neural2-* are good. */
async function googleEngine(text, outWav, opts) {
  const key = process.env.GOOGLE_TTS_API_KEY;
  if (!key) throw new Error('GOOGLE_TTS_API_KEY is not set');

  const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: opts.languageCode || 'hi-IN', name: opts.voice || 'hi-IN-Neural2-A' },
      audioConfig: {
        audioEncoding: 'LINEAR16',
        sampleRateHertz: 48000,
        speakingRate: opts.speakingRate ?? 1.0,
        pitch: opts.pitch ?? 0,
      },
    }),
  });
  if (!res.ok) throw new Error(`Google TTS ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const { audioContent } = await res.json();
  await fs.writeFile(outWav, Buffer.from(audioContent, 'base64'));
}

/**
 * Voicebox (github.com/jamiepine/voicebox) — a local, MIT-licensed voice studio.
 * Install the app, leave it running, and it serves a REST API on port 17493.
 *
 * Its Kokoro engine ships four Hindi preset voices (hf_alpha, hf_beta, hm_omega,
 * hm_psi), which is what makes this usable without cloning anybody: no reference
 * sample, no consent question, no API key. Chatterbox is multilingual too but is
 * clone-only — it needs a voice sample you own.
 *
 * Flow: find-or-create a profile → POST /generate → poll the SSE status stream →
 * GET /audio/{id}.
 */
const VOICEBOX_DEFAULT = 'http://127.0.0.1:17493';
const profileCache = new Map();

async function vbFetch(base, path, init) {
  let res;
  try {
    res = await fetch(base + path, init);
  } catch (err) {
    throw new Error(
      `cannot reach Voicebox at ${base} — open /Applications/Voicebox.app and leave it running. (${err.message})`,
    );
  }
  if (!res.ok) throw new Error(`Voicebox ${path} → ${res.status}: ${(await res.text()).slice(0, 240)}`);
  return res;
}

/** Reuse a profile across runs so the history doesn't fill with duplicates. */
async function voiceboxProfile(base, opts) {
  const name = opts.profileName ?? `GeoMotion ${opts.language ?? 'hi'} ${opts.presetVoice ?? 'default'}`;
  if (profileCache.has(name)) return profileCache.get(name);

  const existing = await (await vbFetch(base, '/profiles')).json();
  let profile = existing.find((p) => p.name === name);

  if (!profile) {
    if (!opts.presetVoice) {
      throw new Error(
        'voicebox needs a presetVoice — e.g. "hf_alpha" for Hindi female. ' +
          `List them with: curl ${base}/profiles/presets/${opts.vbEngine ?? 'kokoro'}`,
      );
    }
    profile = await (
      await vbFetch(base, '/profiles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          language: opts.language ?? 'hi',
          voice_type: 'preset',
          preset_engine: opts.vbEngine ?? 'kokoro',
          preset_voice_id: opts.presetVoice,
          default_engine: opts.vbEngine ?? 'kokoro',
        }),
      })
    ).json();
  }

  profileCache.set(name, profile);
  return profile;
}

/** /generate/{id}/status is server-sent events; the last event carries the result. */
async function voiceboxStatus(base, id) {
  const text = await (await vbFetch(base, `/generate/${id}/status`)).text();
  const events = [...text.matchAll(/^data:\s*(\{.*\})\s*$/gm)].map((m) => {
    try {
      return JSON.parse(m[1]);
    } catch {
      return null;
    }
  });
  return events.filter(Boolean).at(-1) ?? null;
}

async function voiceboxEngine(text, outWav, opts) {
  const base = (opts.endpoint ?? process.env.VOICEBOX_URL ?? VOICEBOX_DEFAULT).replace(/\/$/, '');
  const profile = await voiceboxProfile(base, opts);

  const gen = await (
    await vbFetch(base, '/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile_id: profile.id,
        text,
        language: opts.language ?? 'hi',
        engine: opts.vbEngine ?? 'kokoro',
        ...(opts.seed !== undefined ? { seed: opts.seed } : {}),
        ...(opts.extra ?? {}),
      }),
    })
  ).json();

  const deadline = Date.now() + (opts.timeoutMs ?? 180000);
  let state = gen;
  while (state && state.status !== 'completed') {
    if (state.status === 'failed') throw new Error(`Voicebox generation failed: ${state.error ?? 'no reason given'}`);
    if (Date.now() > deadline) throw new Error(`Voicebox still ${state.status} after ${(opts.timeoutMs ?? 180000) / 1000}s`);
    await new Promise((r) => setTimeout(r, 1200));
    state = await voiceboxStatus(base, gen.id);
  }

  const audio = await vbFetch(base, `/audio/${gen.id}`);
  const tmp = outWav.replace(/\.wav$/, '.tts-in.wav');
  await fs.writeFile(tmp, Buffer.from(await audio.arrayBuffer()));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ar', '48000', '-ac', '1', outWav]);
  await fs.rm(tmp, { force: true });
}

/**
 * Any local TTS server that takes JSON and returns audio. `body` is a template
 * where the string "{text}" is replaced; use this rather than asking for a new
 * engine when you have something else running locally.
 */
async function httpEngine(text, outWav, opts) {
  if (!opts.url) throw new Error('the http engine needs a "url" in the voice config');
  const body = JSON.parse(JSON.stringify(opts.body ?? { text: '{text}' }).replaceAll('{text}', () => text));
  const res = await fetch(opts.url, {
    method: opts.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${opts.url} → ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const tmp = outWav.replace(/\.wav$/, '.tts-in');
  await fs.writeFile(tmp, Buffer.from(await res.arrayBuffer()));
  await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ar', '48000', '-ac', '1', outWav]);
  await fs.rm(tmp, { force: true });
}

const ENGINES = {
  say: sayEngine,
  elevenlabs: elevenEngine,
  google: googleEngine,
  voicebox: voiceboxEngine,
  http: httpEngine,
};

/**
 * Render one line to a wav and return its duration. Results are cached on the
 * hash of (engine, voice, text) so re-running the pipeline after a visual tweak
 * doesn't re-synthesise — which matters when the engine costs money per call.
 */
export async function speak(text, outWav, voiceCfg) {
  const engine = ENGINES[voiceCfg.engine];
  if (!engine) throw new Error(`unknown tts engine "${voiceCfg.engine}"`);

  await fs.mkdir(path.dirname(outWav), { recursive: true });
  const stampFile = outWav + '.stamp';
  const stamp = JSON.stringify({ ...voiceCfg, text });

  try {
    if ((await fs.readFile(stampFile, 'utf8')) === stamp) {
      return { duration: await probeDuration(outWav), cached: true };
    }
  } catch {
    /* no cache yet */
  }

  await engine(text, outWav, voiceCfg);
  await fs.writeFile(stampFile, stamp);
  return { duration: await probeDuration(outWav), cached: false };
}

/**
 * Where a hand-recorded clip for a line lives. Kept in its own folder so the TTS
 * cache can never overwrite it: your own voice always wins over the synthesiser,
 * and you can record some lines and leave the rest generated.
 */
export function manualPath(voiceRoot, slug, key) {
  return path.join(voiceRoot, slug, 'manual', `${key}.wav`);
}

/**
 * Resolve one line to an audio file: a recording of yours if there is one, else
 * synthesis. Both the CLI and the Studio go through this, so they can never
 * disagree about which clip a line uses.
 */
export async function lineAudio({ voiceRoot, slug, key, text, voice }) {
  const manual = manualPath(voiceRoot, slug, key);
  try {
    await fs.access(manual);
    return { file: manual, duration: await probeDuration(manual), manual: true, cached: true };
  } catch {
    /* nothing recorded for this line */
  }
  const file = path.join(voiceRoot, slug, `${key}.wav`);
  const { duration, cached } = await speak(text, file, voice);
  return { file, duration, manual: false, cached };
}

/** Normalise any browser recording to the wav the pipeline expects. */
export async function saveRecording({ voiceRoot, slug, key, buffer }) {
  const out = manualPath(voiceRoot, slug, key);
  await fs.mkdir(path.dirname(out), { recursive: true });
  const tmp = out + '.in';
  await fs.writeFile(tmp, buffer);
  try {
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-ar', '48000', '-ac', '1', out]);
  } finally {
    await fs.rm(tmp, { force: true });
  }
  return { file: out, duration: await probeDuration(out) };
}

export async function clearRecording({ voiceRoot, slug, key }) {
  await fs.rm(manualPath(voiceRoot, slug, key), { force: true });
}

/** Concatenate the per-line wavs, inserting the gaps the timeline assumes. */
/**
 * The filter chain for one clip: level, fades, then position.
 *
 * Order matters. `afade` counts from the start of *its* input, so fading has to happen
 * before `adelay` moves the clip — do it after and the fade lands at the head of the
 * silence instead of the head of the audio.
 *
 * Exported for its own tests: this is string construction, and getting it wrong
 * produces a mix that is quietly at the wrong level rather than an ffmpeg error.
 */
export function clipFilter(index, clip) {
  const ms = Math.round(clip.start * 1000);
  const stages = [];

  if (clip.curve?.length) {
    // A curve covers level, fades and ducking together, so it replaces them all.
    const expr = volumeExpression(clip.curve);
    // A constant of exactly 1 is no change; anything else, including a constant at
    // some other level, still needs the filter.
    if (Number(expr) !== 1) stages.push(`volume=eval=frame:volume='${expr}'`);
  } else {
    const gain = clip.gain ?? 1;
    if (gain !== 1) stages.push(`volume=${gain.toFixed(4)}`);
    if (clip.fadeIn > 0) stages.push(`afade=t=in:st=0:d=${clip.fadeIn.toFixed(3)}`);
    if (clip.fadeOut > 0 && clip.duration > 0) {
      stages.push(`afade=t=out:st=${Math.max(0, clip.duration - clip.fadeOut).toFixed(3)}:d=${clip.fadeOut.toFixed(3)}`);
    }
  }
  stages.push(`adelay=${ms}|${ms}`);

  return `[${index + 1}:a]${stages.join(',')}[a${index}]`;
}

/**
 * A piecewise-linear volume expression for ffmpeg, from the same points Web Audio
 * ramps through.
 *
 * `volume` takes an expression evaluated per frame, so the curve is expressed as
 * nested `if(lt(t,…))` segments with `lerp` inside each. Building it from the shared
 * curve is what keeps the render sounding like the preview: two hand-written envelope
 * implementations would drift the first time either was tuned.
 *
 * Evaluated in the clip's own time, which is why this has to come before `adelay`.
 */
export function volumeExpression(curve) {
  const points = curve.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.gain));
  if (!points.length) return '1';
  if (points.length === 1) return points[0].gain.toFixed(4);
  if (points.every((p) => Math.abs(p.gain - points[0].gain) < 1e-6)) return points[0].gain.toFixed(4);

  const n = (v) => v.toFixed(4);
  // Built from the end backwards so each segment is the else-branch of the one before.
  let expr = n(points[points.length - 1].gain);
  for (let i = points.length - 1; i > 0; i--) {
    const a = points[i - 1];
    const b = points[i];
    const span = b.t - a.t;
    const value =
      span <= 1e-6
        ? n(b.gain)
        : `${n(a.gain)}+(${n(b.gain)}-${n(a.gain)})*(t-${n(a.t)})/${n(span)}`;
    expr = `if(lt(t,${n(b.t)}),${value},${expr})`;
  }
  return `if(lt(t,${n(points[0].t)}),${n(points[0].gain)},${expr})`;
}

export async function buildVoiceTrack(clips, outWav, totalDuration) {
  // A silent bed of exactly the right length, with each clip mixed in at its
  // own start time. Padding this way means audio and video can never drift.
  const inputs = [];
  const filters = [];
  inputs.push('-f', 'lavfi', '-t', String(totalDuration), '-i', 'anullsrc=r=48000:cl=mono');

  clips.forEach((clip, i) => {
    inputs.push('-i', clip.file);
    filters.push(clipFilter(i, clip));
  });

  const mixLabels = clips.map((_, i) => `[a${i}]`).join('');
  const graph =
    clips.length === 0
      ? '[0:a]anull[out]'
      : `${filters.join(';')};[0:a]${mixLabels}amix=inputs=${clips.length + 1}:normalize=0[out]`;

  await run('ffmpeg', [
    '-y', '-loglevel', 'error',
    ...inputs,
    '-filter_complex', graph,
    '-map', '[out]',
    '-t', String(totalDuration),
    '-ar', '48000', '-ac', '1',
    outWav,
  ]);
  return outWav;
}
