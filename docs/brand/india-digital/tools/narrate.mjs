/**
 * "India's Digital Divide" — NFHS-6 women's internet access.
 * Facts verified before scripting (see below for numbers/sources):
 *   National women internet 64.3% (NFHS-5: 33.3%) · men 80.5% (51.2%)
 *   National M-W gap 16.2pt · women mobile 63.6%
 *   High: Goa 94.0 / Kerala 87.3 / Sikkim 90.3 · Low: Tripura 48.8 / Odisha 51.8
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:17493';
const OUT = fileURLToPath(new URL('../vo', import.meta.url));
mkdirSync(OUT, { recursive: true });

const VOICE = 'af_heart';
const LINES = [
  ['s01', 'India just passed a billion internet users. But the last mile online isn\'t a map — it\'s a gender gap.'],
  ['s02', 'Nationally, sixty-four percent of women have used the internet. That\'s a doubling since the last survey — but men are at eighty.'],
  ['s03', 'The cleanest shot is the West. Kerala is at eighty-seven percent. Sikkim ninety. Goa, ninety-four — nearly everyone online.'],
  ['s04', 'Now cross the map. Tripura, forty-nine percent. Odisha, fifty-two. In the east, half the women have never gone online at all.'],
  ['s04b', 'And the gap between men and women is the real story. Nationally it\'s sixteen points. In Karnataka, it\'s twenty-six.'],
  ['s05', 'Watch the phone. A woman\'s own mobile — sixty-four percent nationally. But Sikkim is at ninety-two, Chhattisgarh at forty-eight.'],
  ['s06', 'The same country, a forty-four point spread. The phone is where the internet begins.'],
  ['s07', 'A billion users — and still, the divide runs straight through the middle of the map.'],
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

const NAME = `DataBandar digital ${VOICE}`;
const profiles = await (await api('/profiles')).json();
let profile = profiles.find((p) => p.name === NAME);
if (!profile) {
  profile = await (await api('/profiles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NAME, language: 'en', voice_type: 'preset',
      preset_engine: 'kokoro', preset_voice_id: VOICE, default_engine: 'kokoro' }),
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