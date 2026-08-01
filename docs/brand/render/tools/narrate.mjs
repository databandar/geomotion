/**
 * EP001 narration — one WAV per storyboard line, via the local Voicebox.
 *
 * Segments rather than one take because each line is placed at its storyboard time in the
 * mix; the joins live in silence, so per-line generation drift doesn't show.
 *
 * Needs a running Voicebox on localhost:17493. Run with `node tools/narrate.mjs` from
 * anywhere — paths resolve relative to this file.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:17493';
const OUT = fileURLToPath(new URL('../vo', import.meta.url));
mkdirSync(OUT, { recursive: true });

/* [id, placement seconds, text] — the VERIFY pass rewrote two lines:
   - Baltic: "every shore belongs to NATO" was wrong (Kaliningrad, St Petersburg);
     the defensible claim is about the strait's shores.
   - Vladivostok: icebreakers are the past tense story; the bay freezes, access is kept open. */
const LINES = [
  ['s01a', 0.8,  'This is the largest country on Earth.'],
  ['s01b', 2.6,  'Thirty seven thousand kilometres of coastline.'],
  ['s02',  4.6,  'Almost none of it opens onto the ocean.'],
  ['s03',  7.8,  "Russia's navy is split into four fleets. Each one has exactly one way out."],
  ['s04',  13.0, 'The Baltic Fleet has to pass here. Four kilometres wide, between Denmark and Sweden.'],
  ['s05',  21.0, 'The Black Sea Fleet has one exit. The Bosphorus is seven hundred metres across, and it runs through the middle of Istanbul.'],
  ['s06',  31.2, 'Who may pass, and when, was decided by a treaty signed in nineteen thirty six.'],
  ['s07',  37.0, 'The Pacific Fleet is here, at Vladivostok. Every route to open water runs past Japan.'],
  ['s08',  46.8, 'And in winter, the harbour ices over.'],
  ['s09',  51.2, 'Which leaves the north. This is Murmansk. Two hundred and seventy kilometres inside the Arctic Circle.'],
  ['s10',  58.0, 'It never freezes. Because the water arriving here left the Gulf of Mexico.'],
  ['s11',  66.6, "One warm current gives Russia its only year round ocean port."],
  ['s12',  73.2, 'To reach the Atlantic, its ships pass between Greenland, Iceland, and Britain.'],
  ['s13',  80.2, 'Four doors. Russia owns none of them.'],
];

async function api(path, init) {
  const res = await fetch(BASE + path, init);
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}

/* Find-or-create the preset profile. */
const NAME = 'GROUNDTRUTH en am_michael';
const profiles = await (await api('/profiles')).json();
let profile = profiles.find((p) => p.name === NAME);
if (!profile) {
  profile = await (await api('/profiles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: NAME, language: 'en', voice_type: 'preset',
      preset_engine: 'kokoro', preset_voice_id: 'am_michael', default_engine: 'kokoro',
    }),
  })).json();
}
console.log('profile', profile.id, profile.name);

const status = async (id) => {
  const text = await (await api(`/generate/${id}/status`)).text();
  const events = text.trim().split('\n\n').map((b) => b.split('\n').find((l) => l.startsWith('data:'))).filter(Boolean);
  return JSON.parse(events[events.length - 1].slice(5));
};

/* The generation's own `id` is the audio key — GET /audio/{id} — not a URL the status
   payload hands back; the OpenAPI spec is the only place that route is named. */
const audioUrl = (id) => `/audio/${id}`;

const manifest = [];
for (const [id, at, text] of LINES) {
  const gen = await (await api('/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profile.id, text, language: 'en', engine: 'kokoro' }),
  })).json();
  const genId = gen.generation_id ?? gen.id;
  let st = gen;
  const deadline = Date.now() + 180000;
  while (st.status !== 'completed') {
    if (st.status === 'failed') throw new Error(`${id} failed: ${st.error}`);
    if (Date.now() > deadline) throw new Error(`${id} timed out in ${st.status}`);
    await new Promise((r) => setTimeout(r, 800));
    st = await status(genId);
  }
  const audio = await (await api(audioUrl(genId))).arrayBuffer();
  writeFileSync(`${OUT}/${id}.wav`, Buffer.from(audio));
  manifest.push({ id, at, text, bytes: audio.byteLength });
  console.log(id, 'ok', (audio.byteLength / 1024).toFixed(0) + 'K');
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log('done:', manifest.length, 'segments');
