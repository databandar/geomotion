/**
 * "Bab el-Mandeb — The Other Door" — the second strait of the 2026 war.
 * Facts VERIFIED before scripting:
 *   ~18 mi / ~29 km wide at narrowest (EIA/TIME)
 *   ~20-25% of world seaborne oil + significant LNG (RFERL)
 *   ~4.2M bpd oil / ~6M bpd to Asia at risk (Al Jazeera)
 *   Suez weekly containerships 80 → 26 after Houthi attacks resurfaced (gCaptain, Jan 2026)
 *   Houthis = Iran's proxy in Yemen (IANHR/ISW); attacked Saudi Red Sea installations (Reuters, Jul 2026)
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:17493';
const OUT = fileURLToPath(new URL('../vo', import.meta.url));
mkdirSync(OUT, { recursive: true });

const VOICE = 'af_heart';
const LINES = [
  ['s01', "Hormuz is the front door of the Gulf. But the oil that escapes it leaves through a door you've never heard of."],
  ['s02', "Bab el-Mandeb. The Gate of Tears. Eighteen miles wide — the gap where the Red Sea meets the Arabian Sea."],
  ['s03', "A quarter of the world's seaborne oil squeezes through here. The vast trade route from Asia to Europe. And the LNG."],
  ['s03b', "Where Hormuz holds energy in — this is the strait that lets the world out."],
  ['s04', "It's guarded by the Houthis. Iran's proxy, camped on the shore of Yemen. When they fire, the whole ocean listens."],
  ['s05', "Every Asia-Europe container ship passes this gate to reach Suez. Then the attacks came back — and weekly transits fell from eighty, to twenty-six."],
  ['s06', "So this war has two doors. Iran's grip on Hormuz. Its proxy's grip here. Same campaign. One move."],
  ['s07', "The front door of energy. The back door of trade. Shut. And the world is still learning its name — Bab el-Mandeb."],
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

const NAME = `DataBandar bab ${VOICE}`;
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