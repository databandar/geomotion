/**
 * "The Ice Is Opening a Shortcut" — the Northern Sea Route. Facts verified before scripting
 * (see README.md): Rotterdam-Yokohama ~35-40% shorter via the Arctic than via Suez, a real
 * navigable window of months (some years, weeks), Russia's Northern Sea Route Administration
 * plus Rosatom (the nuclear energy corporation) controlling access, ~12%/decade September ice
 * decline since 1979 (NSIDC). af_heart — the voice already proven for DataBandar.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:17493';
const OUT = fileURLToPath(new URL('../vo', import.meta.url));
mkdirSync(OUT, { recursive: true });

const VOICE = 'af_heart';
const LINES = [
  ['s01', 'One Arctic route can cut a container ship’s journey by over a third.'],
  ['s02', 'This is the Northern Sea Route, along Russia’s Arctic coast.'],
  ['s03', 'Rotterdam to Yokohama: eleven thousand miles by Suez. Seven thousand three hundred by the Arctic.'],
  ['s04', 'But it’s only open a few months a year. Some years, just weeks.'],
  ['s05', 'Every foreign ship needs a Russian permit, issued in part by the country’s nuclear energy company.'],
  ['s06', 'September Arctic ice has shrunk by about twelve percent every decade since 1979.'],
  ['s07', 'The ice is retreating. The gatekeeper isn’t going anywhere.'],
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

const NAME = `DataBandar arctic ${VOICE}`;
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
