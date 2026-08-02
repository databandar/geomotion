/**
 * "The Walk That Broke an Empire" — the Dandi March, pilot episode of the "Walk to Remember"
 * series. Facts verified before scripting (see README.md): 387 km / 24 days, Sabarmati Ashram
 * to Dandi, 78 volunteers growing to tens of thousands, the salt law broken April 6 1930,
 * 60,000+ jailed within a month, Gandhi arrested May 5 1930, Time's Man of the Year 1930.
 * af_heart — the voice already proven for DataBandar.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:17493';
const OUT = fileURLToPath(new URL('../vo', import.meta.url));
mkdirSync(OUT, { recursive: true });

const VOICE = 'af_heart';
const LINES = [
  ['s01', 'In 1930, a twenty four day walk broke the British salt monopoly in India.'],
  ['s02', 'This is the Dandi March — Gandhi walked from Sabarmati Ashram to the Arabian Sea coast.'],
  ['s03', 'He began with seventy eight volunteers. By the coast, tens of thousands were walking beside him.'],
  ['s04', 'On April sixth, he picked up a handful of sea salt, and broke the law.'],
  ['s05', 'Within a month, the British had jailed over sixty thousand people — Gandhi among them.'],
  ['s06', 'That same year, Time magazine named him Man of the Year.'],
  ['s07', 'The tax didn’t last. The walk did.'],
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

const NAME = `DataBandar dandi ${VOICE}`;
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
