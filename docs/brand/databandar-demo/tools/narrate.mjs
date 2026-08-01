/**
 * DataBandar demo narration — af_heart (Kokoro preset), chosen from the four-voice comparison
 * in ../voice-compare/ as the answer to "would a female radio voice work for these videos" —
 * see docs/brand/databandar-demo/README.md.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:17493';
const OUT = fileURLToPath(new URL('../vo', import.meta.url));
mkdirSync(OUT, { recursive: true });

const VOICE = 'af_heart';
const LINES = [
  ['s01', 'Picture everyone alive, standing on the same map.'],
  ['s02', 'Half of them are standing on just thirteen percent of the land.'],
  ['s03', 'Start with the density. Bangladesh — twelve hundred people, every square kilometre.'],
  ['s04', 'The Netherlands is almost as crowded. A European country, packed like South Asia.'],
  ['s05', 'Then India. One country holds eighteen percent of humanity, on under three percent of the land.'],
  ['s06', 'Add China, and the running total passes half. It has used thirteen percent of the map.'],
  ['s07', 'The other half of humanity has the remaining eighty seven percent to itself.'],
];

async function api(path, init) {
  const res = await fetch(BASE + path, init);
  if (!res.ok) throw new Error(`${path} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res;
}
const status = async (id) => {
  const text = await (await api(`/generate/${id}/status`)).text();
  const events = text.trim().split('\n\n').map((b) => b.split('\n').find((l) => l.startsWith('data:'))).filter(Boolean);
  return JSON.parse(events[events.length - 1].slice(5));
};

const NAME = `DataBandar demo ${VOICE}`;
const profiles = await (await api('/profiles')).json();
let profile = profiles.find((p) => p.name === NAME);
if (!profile) {
  profile = await (await api('/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: NAME, language: 'en', voice_type: 'preset',
      preset_engine: 'kokoro', preset_voice_id: VOICE, default_engine: 'kokoro',
    }),
  })).json();
}
console.log('profile', profile.id, profile.name);

const manifest = [];
for (const [id, text] of LINES) {
  const gen = await (await api('/generate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profile_id: profile.id, text, language: 'en', engine: 'kokoro' }),
  })).json();
  const genId = gen.generation_id ?? gen.id;
  let st = gen;
  const deadline = Date.now() + 180000;
  while (st.status !== 'completed') {
    if (st.status === 'failed') throw new Error(`${id} failed: ${st.error}`);
    if (Date.now() > deadline) throw new Error(`${id} timed out in ${st.status}`);
    await new Promise((r) => setTimeout(r, 700));
    st = await status(genId);
  }
  const audio = await (await api(`/audio/${genId}`)).arrayBuffer();
  writeFileSync(`${OUT}/${id}.wav`, Buffer.from(audio));
  manifest.push({ id, text, bytes: audio.byteLength });
  console.log(id, 'ok', (audio.byteLength / 1024).toFixed(0) + 'K');
}
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log('done:', manifest.length, 'segments');
