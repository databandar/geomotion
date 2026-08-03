/**
 * "The Strait That Carries the World's Memory" — Taiwan Strait.
 * Facts VERIFIED before scripting:
 *   87,343 ship transits/yr — highest of any chokepoint (IMF PortWatch)
 *   ~$2.45T goods in 2024 — over 1/5 of global maritime trade (CSIS)
 *   ~180 km wide (broad) / ~126 km narrowest (Wikipedia)
 *   Taiwan ~90% of world's most advanced chips (TSMC)
 *   Japan: 30% imports / 25% exports (~$413B) · S.Korea 24/20 (~$300B) · Australia 28% exports (~$102B)
 *   East-of-Taiwan detour adds ~1,000 miles / 3-4 days (CSIS)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:17493';
const OUT = fileURLToPath(new URL('../vo', import.meta.url));
mkdirSync(OUT, { recursive: true });

const VOICE = 'af_heart';
const LINES = [
  ['s01', "Hormuz is narrow. But the world's most valuable strait isn't the narrowest one. It's here."],
  ['s02', "Taiwan — a gap a hundred and eighty kilometres wide. Wide enough to look safe. And the busiest chokepoint on Earth."],
  ['s03', "Eighty-seven thousand ships a year. Two-point-four-five trillion dollars of goods — a fifth of all world trade."],
  ['s03b', "Not oil. Something smaller, and far harder to replace."],
  ['s04', "Taiwan makes ninety percent of the world's most advanced chips. The brains inside your phone, your car, every data centre on Earth."],
  ['s05', "Japan ships a third of its imports here. South Korea, a quarter. Australia, a quarter of its exports — iron ore by the megaton."],
  ['s06', "And the escape route? One thousand miles around the back of Taiwan. Three or four extra days, at a catastrophe of fuel cost."],
  ['s07', "The narrow strait moves oil. The wide one moves the world's memory. Eighty-seven thousand times a year."],
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

const NAME = `DataBandar taiwan ${VOICE}`;
const profiles = await (await api('/profiles')).json();
let profile = profiles.find((p) => p.name === NAME);
if (!profile) {
  profile = await (await api('/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NAME, language: 'en', voice_type: 'preset',
      preset_engine: 'kokoro', preset_voice_id: VOICE, default_engine: 'kokoro' }),
  })).json();
}
console.log('profile', profile.id);

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
    if (Date.now() > deadline) throw new Error(`${id} timed out`);
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