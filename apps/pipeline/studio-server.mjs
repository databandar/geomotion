import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadNfhs, listIndicators, extract, changes } from './lib/nfhs.mjs';
import { prepareScript, compose, collectLines, buildSrt, DATASETS } from './lib/compose.mjs';
import { buildVoiceTrack, lineAudio, saveRecording, clearRecording } from './lib/tts.mjs';

// Path anchors. Named explicitly because a single ambiguous "ROOT" is what broke
// when this pipeline moved under apps/ — each of these means something different.
const APP = path.dirname(fileURLToPath(import.meta.url)); // apps/pipeline
const REPO = path.resolve(APP, '../..');
const STUDIO = path.join(REPO, 'apps/studio');
const VOICE_ROOT = path.join(APP, 'out/_voice');

/**
 * Dev-server middleware behind the Studio UI.
 *
 * It lives on the server side for one reason: the OpenRouter key. A browser-only
 * implementation would have to ship the key in the bundle, where anyone loading
 * the page could read it. Everything secret stays here; the client only ever sees
 * results.
 *
 * It is also where anything that isn't a browser capability lives — spawning
 * ffmpeg and headless Chrome to render, reading the NFHS csv off disk, and
 * proxying Voicebox so the page doesn't need CORS from localhost:17493.
 *
 * Dev only. `npm run build` produces a static bundle with none of this, which is
 * what the renderer loads — so the rendered frames never depend on it.
 */
export function studioServer() {
  return {
    name: 'geomotion-studio',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const route = url.pathname.replace(/\/$/, '') || '/';
        try {
          await handle(route, req, res, url, server);
        } catch (err) {
          if (!res.headersSent) json(res, 500, { error: err?.message ?? String(err) });
          else res.end();
          server.config.logger.error(`[studio] ${route}: ${err?.stack ?? err}`);
        }
      });
    },
  };
}

/* ------------------------------------------------------------------ utils */

const json = (res, code, body) => {
  res.statusCode = code;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
};

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const env = (k, fallback) => process.env[k] ?? fallback;
const vbBase = () => env('VOICEBOX_URL', 'http://127.0.0.1:17493').replace(/\/$/, '');

/* ------------------------------------------------------------------ routes */

async function handle(route, req, res, url, server) {
  switch (`${req.method} ${route}`) {
    case 'GET /health':
      return json(res, 200, await health());

    case 'GET /data/indicators': {
      const data = await loadNfhs(url.searchParams.get('csv') ?? undefined);
      return json(res, 200, { indicators: listIndicators(data) });
    }

    case 'POST /data/extract': {
      const { indicator, round = 'total', csv } = await body(req);
      const data = await loadNfhs(csv);
      const e = extract(data, indicator, round);
      return json(res, 200, {
        ...e,
        ranked: Object.entries(e.values).sort((a, b) => b[1] - a[1]),
        movers: changes(e).slice(0, 8),
      });
    }

    case 'GET /data/regions': {
      const set = DATASETS[url.searchParams.get('dataset') ?? 'india-official'];
      if (!set) return json(res, 400, { error: 'unknown dataset' });
      const geo = JSON.parse(await fs.readFile(path.join(STUDIO, 'src/data', set.states), 'utf8'));
      const names = geo.features.map((f) => f.properties?.name).filter(Boolean).sort();
      return json(res, 200, { regions: names });
    }

    case 'POST /llm/script':
      return json(res, 200, await writeScript(await body(req)));

    case 'POST /llm/image':
      return json(res, 200, await makeImage(await body(req)));

    case 'GET /assets':
      return json(res, 200, await listAssets(url.searchParams.get('slug') ?? 'studio'));

    case 'POST /assets/delete': {
      const { slug, region } = await body(req);
      await removeAsset(slug, region);
      return json(res, 200, { ok: true });
    }

    case 'GET /voice/voices': {
      const engine = url.searchParams.get('engine') ?? 'kokoro';
      const [presets, profiles] = await Promise.all([
        fetch(`${vbBase()}/profiles/presets/${engine}`).then((r) => r.json()),
        fetch(`${vbBase()}/profiles`).then((r) => r.json()),
      ]);
      return json(res, 200, { presets: presets.voices ?? [], profiles });
    }

    case 'GET /voice/manual':
      return json(res, 200, await manualLines(url.searchParams.get('slug') ?? 'studio'));

    case 'GET /voice/reference':
      return json(res, 200, { text: await fs.readFile(path.join(APP, 'voice-reference-hi.txt'), 'utf8') });

    case 'POST /voice/clone':
      return json(res, 200, await cloneVoice(await body(req)));

    case 'POST /voice/narrate':
      return json(res, 200, await narrate(await body(req)));

    case 'POST /voice/record': {
      const { slug, key, audioBase64 } = await body(req);
      const buf = Buffer.from(String(audioBase64).replace(/^data:[^;]+;base64,/, ''), 'base64');
      const { duration } = await saveRecording({ voiceRoot: VOICE_ROOT, slug, key, buffer: buf });
      return json(res, 200, { ok: true, duration, url: `/voice-out/${slug}/manual/${key}.wav?t=${Date.now()}` });
    }

    case 'POST /voice/record/clear': {
      const { slug, key } = await body(req);
      await clearRecording({ voiceRoot: VOICE_ROOT, slug, key });
      return json(res, 200, { ok: true });
    }

    case 'POST /compose': {
      const { script, withAudio = true } = await body(req);
      const { missing, unresolved } = await prepareScript(script);
      const timings = await timeLines(script, true);
      const built = await compose(script, timings);
      // Attach the narration so the editor can play the voice against the
      // picture — otherwise "preview before rendering" is a silent preview.
      if (withAudio) {
        try {
          built.project.audio = await buildProjectAudio(script, built);
        } catch (err) {
          server.config.logger.warn(`[studio] voice bed skipped: ${err.message}`);
        }
      }
      return json(res, 200, { project: built.project, beats: built.beats, duration: built.duration, missing, unresolved });
    }

    case 'POST /render':
      return startRender(res, await body(req), server);

    case 'POST /render/project':
      return startProjectRender(res, await body(req), server);

    case 'GET /render/log':
      return streamRender(res);

    case 'POST /render/cancel':
      renderJob?.child?.kill('SIGTERM');
      return json(res, 200, { ok: true });

    default:
      return json(res, 404, { error: `no route for ${req.method} ${route}` });
  }
}

/* ------------------------------------------------------------------ health */

async function health() {
  const out = {
    openrouter: !!env('OPENROUTER_API_KEY'),
    textModel: env('OPENROUTER_TEXT_MODEL', 'deepseek/deepseek-v4-flash'),
    imageModel: env('OPENROUTER_IMAGE_MODEL', 'google/gemini-3.1-flash-lite-image'),
    voicebox: false,
    voiceboxUrl: vbBase(),
    ffmpeg: false,
    nfhs: false,
  };
  try {
    const r = await fetch(`${vbBase()}/profiles`, { signal: AbortSignal.timeout(2500) });
    out.voicebox = r.ok;
  } catch {
    /* not running */
  }
  out.ffmpeg = await new Promise((r) => {
    const c = spawn('ffmpeg', ['-version']);
    c.on('error', () => r(false));
    c.on('close', (code) => r(code === 0));
  });
  try {
    const d = await loadNfhs();
    out.nfhs = d.body.length;
  } catch {
    out.nfhs = 0;
  }
  return out;
}

/* --------------------------------------------------------------- openrouter */

async function openrouter(model, payload) {
  const key = env('OPENROUTER_API_KEY');
  if (!key) throw new Error('OPENROUTER_API_KEY is not set — put it in .env.local and restart the dev server');
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:5173',
      'X-Title': 'GeoMotion Studio',
    },
    body: JSON.stringify({ model, ...payload }),
  });
  const j = await res.json();
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${JSON.stringify(j.error ?? j).slice(0, 300)}`);
  return j;
}

const SCRIPT_RULES = `You write narration for short vertical data-map videos about India, in the style of RealLifeLore or Johnny Harris.

You are given the exact list of states the camera will visit, already in order, with each one's value and rank. Your ONLY job is the words.

Return ONLY JSON, no prose, no markdown fence:
{
  "hook":     {"say":"<Hindi>", "onScreen":"<SHORT ENGLISH, max 2 lines separated by \\n>"},
  "overview": {"say":"<Hindi>", "onScreen":"<short English, max 4 words>"},
  "stops":    [{"say":"<Hindi, uses {value}>"}, ...],
  "ranking":  {"say":"<Hindi>", "heading":"<SHORT ENGLISH CAPS>"},
  "labels":   {"say":"<Hindi>"}
}

Rules:
- "say" is Hindi in Devanagari. Spoken, conversational, one short sentence. Under 18 words.
- "onScreen" is ENGLISH in Latin script, very short — it is burned onto the map.
- "stops" must have EXACTLY as many entries as the list you are given, in the SAME order. Do not name the region in JSON; just write its line.
- Write {value} where the number goes. Never type a number yourself. {previous} and {delta} are available too.
- You may name the state inside "say". Use the spelling given.
- Only call something "सबसे ज़्यादा" / "सबसे कम" when the rank you were given says so. Never guess superlatives.
- The hook states what the viewer is about to see, in one sentence. Never "namaste" or "welcome to my channel".`;

/**
 * The stop list is computed here, not by the model.
 *
 * Letting an LLM choose which regions to visit is where the factual errors come
 * from: it reorders the ranking, then narrates "number three" over the wrong
 * state, or calls something the lowest when it isn't. Picking deterministically
 * from the data and asking only for the words removes that whole class of bug.
 */
function pickStops(ranked, count) {
  const n = Math.max(1, Math.min(count, Math.max(1, ranked.length - 1)));
  const top = ranked.slice(0, n).map(([region, value], i) => ({ region, value, rank: i + 1, note: 'highest end' }));
  const last = ranked[ranked.length - 1];
  if (last && !top.some((s) => s.region === last[0])) {
    top.push({ region: last[0], value: last[1], rank: ranked.length, note: 'LOWEST of all — the contrast shot' });
  }
  return top;
}

async function writeScript({
  topic,
  indicator,
  ranked = [],
  regions = [],
  national,
  nationalPrevious,
  model,
  stops = 5,
}) {
  if (!ranked.length) throw new Error('no data loaded — pick an indicator first');
  const chosen = pickStops(ranked, stops);

  const list = chosen
    .map((s, i) => `${i + 1}. ${s.region} — value ${s.value}, rank ${s.rank} of ${ranked.length} (${s.note})`)
    .join('\n');

  const messages = [
    { role: 'system', content: SCRIPT_RULES },
    {
      role: 'user',
      content:
        `Topic: ${topic || indicator}\n` +
        `Indicator: ${indicator}\n` +
        `India overall: ${nationalPrevious ?? '?'} → ${national ?? '?'} (previous round → this round)\n\n` +
        `The camera visits these, in this order — write one line each:\n${list}\n\n` +
        `So "stops" must contain exactly ${chosen.length} entries.`,
    },
  ];

  // Two things make this flaky otherwise: the model sometimes spends its budget
  // on reasoning tokens and returns empty content, and it sometimes wraps the
  // JSON in prose. So: ask for JSON mode, give it room, and retry once.
  let parsed = null;
  let j = null;
  let lastText = '';
  for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
    j = await openrouter(model ?? env('OPENROUTER_TEXT_MODEL', 'deepseek/deepseek-v4-flash'), {
      messages,
      temperature: attempt === 0 ? 0.7 : 0.3,
      max_tokens: 4000,
      response_format: { type: 'json_object' },
      reasoning: { exclude: true },
    });
    const msg = j.choices?.[0]?.message ?? {};
    lastText = msg.content || msg.reasoning || '';
    parsed = salvageJson(lastText);
  }
  if (!parsed) {
    throw new Error(
      `the model did not return usable JSON after two tries ` +
        `(finish: ${j?.choices?.[0]?.finish_reason ?? '?'}). Last output: ${lastText.slice(0, 200) || '(empty)'}`,
    );
  }

  // Zip the words onto the regions we chose. Index, not name — so a model that
  // renames or reorders cannot corrupt the mapping.
  const lines = Array.isArray(parsed.stops) ? parsed.stops : [];
  const tourStops = chosen.map((s, i) => ({
    region: s.region,
    say: toPlaceholder((lines[i]?.say ?? '').trim() || `${s.region} — {value} प्रतिशत।`, s.value),
  }));

  const beats = [
    { kind: 'hook', say: parsed.hook?.say ?? '', onScreen: parsed.hook?.onScreen ?? '' },
    { kind: 'overview', say: parsed.overview?.say ?? '', onScreen: parsed.overview?.onScreen ?? '' },
    { kind: 'tour', stops: tourStops },
    { kind: 'ranking', top: Math.min(5, ranked.length), heading: parsed.ranking?.heading ?? 'TOP 5', say: parsed.ranking?.say ?? '' },
    { kind: 'labels', labelAll: true, say: parsed.labels?.say ?? '' },
  ];

  const known = new Set(regions);
  const dropped = tourStops.filter((s) => !known.has(s.region)).map((s) => s.region);
  const shortfall = lines.length !== chosen.length ? `model returned ${lines.length} lines for ${chosen.length} stops` : null;

  return { beats, dropped, shortfall, usage: j.usage ?? null, model: j.model ?? null };
}

/**
 * Models are told to write `{value}` and usually do — but not always, and a typed
 * number silently breaks the guarantee that the narration follows the data. So
 * any literal occurrence of the figure we handed it is converted back into the
 * placeholder. Change the dataset later and the voiceover still tracks it.
 */
function toPlaceholder(say, value) {
  if (!say || value === undefined || value === null) return say;
  if (say.includes('{value}')) return say;
  const variants = new Set([String(value), value.toFixed(1), value.toFixed(0), String(Math.round(value))]);
  let out = say;
  for (const v of [...variants].sort((a, b) => b.length - a.length)) {
    // Word-ish boundaries so 94 doesn't match inside 1994.
    const re = new RegExp(`(?<![\\d.])${v.replace('.', '\\.')}(?![\\d])`);
    if (re.test(out)) {
      out = out.replace(re, '{value}');
      break;
    }
  }
  return out;
}

/** Tolerate fences, leading prose, and trailing junk around the object. */
function salvageJson(text) {
  if (!text) return null;
  const cleaned = text.replace(/```(?:json)?/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    /* fall through to bracket matching */
  }
  const a = cleaned.indexOf('{');
  if (a < 0) return null;
  let depth = 0;
  for (let i = a; i < cleaned.length; i++) {
    if (cleaned[i] === '{') depth++;
    else if (cleaned[i] === '}' && --depth === 0) {
      try {
        return JSON.parse(cleaned.slice(a, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}

/**
 * Illustration for a tour stop.
 *
 * Saved to pipeline/assets/<slug>/<Region>.jpg, which is exactly where compose
 * already looks — so a generated image needs no wiring and survives a restart,
 * and the script JSON stays small instead of carrying megabytes of base64.
 */
async function makeImage({ prompt, model, slug, region, style }) {
  const finalPrompt = buildImagePrompt({ prompt, region, style });
  const j = await openrouter(model ?? env('OPENROUTER_IMAGE_MODEL', 'google/gemini-3.1-flash-lite-image'), {
    messages: [{ role: 'user', content: finalPrompt }],
    modalities: ['image', 'text'],
  });
  const img = j.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!img) {
    const text = j.choices?.[0]?.message?.content ?? '';
    throw new Error(`model returned no image${text ? `: ${text.slice(0, 160)}` : ''}`);
  }

  let saved = null;
  if (slug && region) {
    const dir = path.join(APP, 'assets', slug);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${region}.jpg`);
    const b64 = img.replace(/^data:[^;]+;base64,/, '');
    await fs.writeFile(file, Buffer.from(b64, 'base64'));
    saved = { path: path.relative(REPO, file), url: `/assets-out/${encodeURIComponent(slug)}/${encodeURIComponent(region)}.jpg?t=${Date.now()}` };
  }

  return { dataUrl: saved ? undefined : img, ...saved, prompt: finalPrompt, usage: j.usage ?? null };
}

/**
 * Photorealistic AI images of real places, dropped into a data video, read as
 * documentary evidence they are not. The default style is deliberately an
 * illustration so nobody mistakes one for a photograph of the state.
 */
function buildImagePrompt({ prompt, region, style }) {
  if (prompt && prompt.trim()) return prompt.trim();
  const look =
    style?.trim() ||
    'flat editorial vector illustration, limited muted palette, simple geometric shapes, subtle grain, dark background';
  return (
    `${look}. Subject: a recognisable cultural or landscape motif of ${region}, India. ` +
    `No text, no lettering, no maps, no borders, no flags, no people's faces. Centred composition, square.`
  );
}

async function listAssets(slug) {
  const dir = path.join(APP, 'assets', slug);
  try {
    const files = await fs.readdir(dir);
    return {
      slug,
      images: files
        .filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f))
        .map((f) => ({
          region: f.replace(/\.[^.]+$/, ''),
          url: `/assets-out/${encodeURIComponent(slug)}/${encodeURIComponent(f)}`,
        })),
    };
  } catch {
    return { slug, images: [] };
  }
}

async function removeAsset(slug, region) {
  const dir = path.join(APP, 'assets', slug);
  for (const ext of ['jpg', 'jpeg', 'png', 'webp']) {
    await fs.rm(path.join(dir, `${region}.${ext}`), { force: true });
  }
}

/* -------------------------------------------------------------- voicebox */

async function cloneVoice({ name, language = 'hi', engine = 'chatterbox', sampleBase64, filename = 'sample.wav', referenceText }) {
  if (!sampleBase64) throw new Error('no audio sample provided');

  const profile = await fetch(`${vbBase()}/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, language, voice_type: 'cloned', default_engine: engine }),
  }).then(async (r) => {
    if (!r.ok) throw new Error(`create profile: ${r.status} ${(await r.text()).slice(0, 200)}`);
    return r.json();
  });

  const bytes = Buffer.from(sampleBase64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  const form = new FormData();
  form.append('file', new Blob([bytes]), filename);
  form.append('reference_text', referenceText ?? '');

  const up = await fetch(`${vbBase()}/profiles/${profile.id}/samples`, { method: 'POST', body: form });
  if (!up.ok) throw new Error(`upload sample: ${up.status} ${(await up.text()).slice(0, 300)}`);

  return { profile, sample: await up.json() };
}

/** Resolve every line to a duration, preferring your own recordings. */
async function timeLines(script, useVoice) {
  const lines = collectLines(script);
  const timings = new Map();
  const slug = script.slug ?? 'studio';
  for (const line of lines) {
    if (useVoice) {
      try {
        const { duration } = await lineAudio({
          voiceRoot: VOICE_ROOT,
          slug,
          key: line.key,
          text: line.text,
          voice: script.voice ?? { engine: 'say', voice: 'Lekha' },
        });
        timings.set(line.key, duration);
        continue;
      } catch {
        // Estimating keeps the timeline usable when the voice engine is down.
      }
    }
    timings.set(line.key, Math.max(1.6, line.text.length / 13));
  }
  return timings;
}

async function narrate({ script }) {
  await prepareScript(script);
  const lines = collectLines(script);
  const slug = script.slug ?? 'studio';
  const out = [];
  for (const line of lines) {
    try {
      const { duration, cached, manual } = await lineAudio({
        voiceRoot: VOICE_ROOT,
        slug,
        key: line.key,
        text: line.text,
        voice: script.voice,
      });
      out.push({
        key: line.key,
        text: line.text,
        duration,
        cached,
        manual,
        url: manual ? `/voice-out/${slug}/manual/${line.key}.wav` : `/voice-out/${slug}/${line.key}.wav`,
      });
    } catch (err) {
      out.push({ key: line.key, text: line.text, error: err.message });
    }
  }
  return { lines: out, total: out.reduce((a, b) => a + (b.duration ?? 0), 0) };
}

/**
 * Mix the per-line clips onto a bed the length of the composition, and describe
 * where each line falls so the timeline can show them.
 */
async function buildProjectAudio(script, built) {
  const slug = script.slug ?? 'studio';
  const clips = [];
  const cues = [];

  for (const beat of built.beats) {
    if (beat.kind === 'tour') {
      let t = beat.start;
      for (const stop of beat.stops) {
        const clip = await resolveClip(slug, stop.__key, stop.say, script.voice);
        if (clip) {
          clips.push({ file: clip.file, start: t });
          cues.push({ t: round3(t), d: round3(clip.duration), text: stop.say ?? '', file: clip.file });
        }
        t += stop.duration;
      }
    } else if (beat.say) {
      const clip = await resolveClip(slug, beat.__key, beat.say, script.voice);
      if (clip) {
        clips.push({ file: clip.file, start: beat.start });
        cues.push({ t: round3(beat.start), d: round3(clip.duration), text: beat.say, file: clip.file });
      }
    }
  }
  if (!clips.length) return undefined;

  // The bed is a cache for editor playback. The cues above carry each line's own
  // audio, which is what lets a later render re-mix at whatever positions the
  // timeline has by then — see planAudio in @geomotion/document.
  const track = path.join(VOICE_ROOT, slug, 'track.wav');
  await buildVoiceTrack(clips, track, built.duration);
  return { url: `/voice-out/${slug}/track.wav?t=${Date.now()}`, file: track, cues };
}

const round3 = (n) => Math.round(n * 1000) / 1000;

async function resolveClip(slug, key, text, voice) {
  if (!key || !text) return null;
  try {
    return await lineAudio({ voiceRoot: VOICE_ROOT, slug, key, text, voice });
  } catch {
    return null;
  }
}

/** Which lines already have a recording of yours. */
async function manualLines(slug) {
  const dir = path.join(VOICE_ROOT, slug, 'manual');
  try {
    return { keys: (await fs.readdir(dir)).filter((f) => f.endsWith('.wav')).map((f) => f.replace(/\.wav$/, '')) };
  } catch {
    return { keys: [] };
  }
}

/* ---------------------------------------------------------------- render */

let renderJob = null;

async function startRender(res, { script, draft = true }, server) {
  if (renderJob?.running) return json(res, 409, { error: 'a render is already running' });

  const slug = script.slug ?? 'studio';
  const file = path.join(APP, 'scripts', `_studio-${slug}.json`);
  await fs.writeFile(file, JSON.stringify(script, null, 2));

  const args = ['video.mjs', path.relative(APP, file)];
  if (draft) args.push('--draft');
  return spawnRender(res, args, { slug, draft }, server);
}

/** Shared plumbing for both render entry points. */
function spawnRender(res, args, { slug, draft }, server) {
  const child = spawn('node', args, { cwd: APP, env: process.env });
  renderJob = { child, running: true, log: [], slug, draft, started: Date.now(), exit: null };

  const push = (chunk) => {
    // The renderer rewrites a progress line with \r; keep only the latest.
    const text = chunk.toString('utf8').replace(/\r/g, '\n');
    for (const l of text.split('\n')) {
      const line = l.replace(/\x1b\[[0-9;]*m/g, '').trimEnd();
      if (line) renderJob.log.push(line);
    }
    if (renderJob.log.length > 500) renderJob.log.splice(0, renderJob.log.length - 500);
  };
  child.stdout.on('data', push);
  child.stderr.on('data', push);
  child.on('close', (code) => {
    renderJob.running = false;
    renderJob.exit = code;
    renderJob.log.push(code === 0 ? '__DONE__' : `__FAILED__ exit ${code}`);
    server.config.logger.info(`[studio] render ${slug} exited ${code}`);
  });

  return json(res, 200, { started: true, slug, draft });
}

/**
 * Render exactly what is in the editor right now — no recompose. This is the
 * path for "I nudged the framing and reworded a title, ship that", which a
 * script-driven render would silently discard.
 */
async function startProjectRender(res, { project, slug = 'edited', draft = true }, server) {
  if (renderJob?.running) return json(res, 409, { error: 'a render is already running' });
  if (!project?.layers) return json(res, 400, { error: 'no project supplied' });

  const file = path.join(APP, 'out', `_edited-${slug}.geomotion.json`);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(project, null, 2));

  const args = ['render-project.mjs', path.relative(APP, file), `--slug=${slug}`];
  if (draft) args.push('--draft');
  return spawnRender(res, args, { slug, draft }, server);
}

function streamRender(res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  let sent = 0;
  const tick = setInterval(() => {
    if (!renderJob) {
      res.write(`data: ${JSON.stringify({ idle: true })}\n\n`);
      return;
    }
    const fresh = renderJob.log.slice(sent);
    sent = renderJob.log.length;
    if (fresh.length) {
      res.write(`data: ${JSON.stringify({ lines: fresh, running: renderJob.running, exit: renderJob.exit })}\n\n`);
    }
    if (!renderJob.running) {
      res.write(
        `data: ${JSON.stringify({
          done: true,
          exit: renderJob.exit,
          output: `pipeline/out/${renderJob.slug}${renderJob.draft ? '-draft' : ''}`,
        })}\n\n`,
      );
      clearInterval(tick);
      res.end();
    }
  }, 400);
  res.on('close', () => clearInterval(tick));
}

/** Serve generated stop images so the Studio can show thumbnails. */
export function assetStatic() {
  return {
    name: 'geomotion-asset-static',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/assets-out', async (req, res) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const root = path.join(APP, 'assets');
        const file = path.join(root, rel);
        if (!file.startsWith(root)) {
          res.statusCode = 403;
          return res.end('nope');
        }
        try {
          const buf = await fs.readFile(file);
          res.setHeader('Content-Type', /\.png$/i.test(file) ? 'image/png' : 'image/jpeg');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(buf);
        } catch {
          res.statusCode = 404;
          res.end('not found');
        }
      });
    },
  };
}

/** Serve rendered voice clips so the Studio can play them back. */
export function voiceStatic() {
  return {
    name: 'geomotion-voice-static',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/voice-out', async (req, res) => {
        const rel = decodeURIComponent((req.url ?? '').split('?')[0]).replace(/^\/+/, '');
        const file = path.join(VOICE_ROOT, rel);
        if (!file.startsWith(VOICE_ROOT)) {
          res.statusCode = 403;
          return res.end('nope');
        }
        try {
          const buf = await fs.readFile(file);
          res.setHeader('Content-Type', 'audio/wav');
          res.end(buf);
        } catch {
          res.statusCode = 404;
          res.end('not found');
        }
      });
    },
  };
}

export { buildSrt };
