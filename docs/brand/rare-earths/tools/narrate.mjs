/**
 * "Rare Earths — The Refinery War" — the mineral chokepoint (2026).
 * Facts VERIFIED before scripting:
 *   China ~70% mining, ~90% processing/refining; ~50% of reserves (IEA, CFR, C&EN)
 *   IEA: China ~90% share for rare earths + cobalt + graphite refining
 *   Feb 2, 2026: Trump announced ~$12B for critical-mineral supply + first-ever
 *     civilian stockpile ("Project Vault"); Vance pushed a critical-minerals bloc
 *   MP Materials (Mountain Pass, CA) = US mine; USA Rare Earth (Round Top, TX)
 *   India tripling magnet incentives to >₹70B (~$788M) (2026)
 *   Dysprosium hardest to refine; virtually all made in China
 *   17 elements: in phones, EVs, wind turbines, fighter jets, missiles
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const BASE = 'http://127.0.0.1:17493';
const OUT = fileURLToPath(new URL('../vo', import.meta.url));
mkdirSync(OUT, { recursive: true });

const VOICE = 'af_heart';
const LINES = [
  ['s01', "China's mightiest export isn't chips, or cars. It's a group of elements most people can't even pronounce."],
  ['s02', "Rare earths. Seventeen elements buried inside your phone, your electric car, your wind turbine — even fighter jets."],
  ['s03', "China mines seventy percent of the world's rare earths. And it refines ninety percent of them."],
  ['s03b', "That's the trap. The mine isn't the problem — the refinery is."],
  ['s04', "Mines sit all over the map. America. Australia. Brazil. India, on its own beaches. But barely anyone outside China can turn that rock into metal."],
  ['s05', "So America is fighting back. New plants at Mountain Pass and Round Top. Twelve billion dollars, and a brand-new stockpile."],
  ['s06', "Even India is tripling its magnet incentives, to around eight hundred million dollars. The rare earth race is on."],
  ['s07', "The ground holds more than enough. The question is who builds the refineries. Rare earths aren't scarce. Refinement is."],
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

const NAME = `DataBandar rare ${VOICE}`;
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