/**
 * "One Strait, One-Quarter of the World's Oil" — Strait of Hormuz. Facts verified before
 * scripting (see below for sources): 33 km narrowest width, ~25% of global seaborne oil,
 * 20M barrels/day, 20% of LNG trade, 129→3 ships/day after Feb 28, oil +27%/gas +74% in
 * two weeks, detour +20 days via Cape of Good Hope, pipeline capacity ~3.5–5.5 mb/d.
 *
 * Sources:
 *   Width: EIA, Strauss Center — 33 km / 21 miles (2-mile shipping lanes each way)
 *   Oil: UNCTAD — "around a quarter of global seaborne oil trade"
 *   Barrels: IEA — 20 mb/d (~25% world seaborne oil trade, 80% destined for Asia)
 *   LNG: Congressional Research Service — 20% of global LNG trade
 *   Transits: UNCTAD — 129/day avg Feb 1–27; 3/day after Mar 1
 *   Prices: UNCTAD — oil +27%, gas +74% (27 Feb–9 Mar 2026)
 *   Detour: ~10,500 nm via Cape of Good Hope vs ~6,400 via Hormuz
 *   Pipelines: IEA — 3.5–5.5 mb/d capacity (Petroline + Habshan-Fujairah + Suez)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:17493';
const OUT = fileURLToPath(new URL('../vo', import.meta.url));
mkdirSync(OUT, { recursive: true });

const VOICE = 'af_heart';
const LINES = [
  ['s01', 'The Strait of Hormuz carries a quarter of the world\'s seaborne oil. Twenty million barrels every day.'],
  ['s02', 'At its narrowest, it\'s thirty-three kilometres wide. But the shipping lanes are just three kilometres each way.'],
  ['s03', 'Before February twenty-eighth, one hundred and forty ships passed through daily. After the escalation, just three.'],
  ['s04', 'That single disruption pushed oil prices up twenty-seven percent in two weeks. Gas prices rose seventy-four.'],
  ['s04b', 'For countries that depend on this strait — Japan, India, South Korea — the cost landed immediately.'],
  ['s05', 'The only alternative is around Africa. Past the Cape of Good Hope. Twenty extra days at sea.'],
  ['s06', 'Pipeline capacity can redirect only about a quarter of what Hormuz carries. The rest has no alternative route.'],
  ['s07', 'One strait. Twenty million barrels. Under four kilometres wide.'],
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

const NAME = `DataBandar hormuz ${VOICE}`;
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