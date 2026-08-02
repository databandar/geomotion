/**
 * Rebuilds schedule.json from measured narration — the pipeline's own rule: never trust a
 * word-count estimate over the real audio.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('..', import.meta.url));

const duration = (id) =>
  parseFloat(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${OUT}/vo/${id}.wav`,
  ]).toString().trim());

// [id, gap-after]. Generous gaps at the width reveal (s02), the detour reveal (s05), and the
// closing (s07) — a 1-minute target earns its runtime through visual dwell time on the
// reveals, not through padding the script with extra words.
const GAPS = [
  ['s01', 0.5], ['s02', 1.8], ['s03', 0.7], ['s04', 0.5], ['s04b', 0.9],
  ['s05', 1.6], ['s06', 0.8], ['s07', 3.6],
];

let t = 0;
const at = {};
for (const [id, gap] of GAPS) {
  const dur = duration(id);
  at[id] = { start: Math.round(t * 100) / 100, end: Math.round((t + dur) * 100) / 100, duration: Math.round(dur * 100) / 100 };
  t += dur + gap;
}
const DUR = Math.round(t * 100) / 100;

writeFileSync(`${OUT}/schedule.json`, JSON.stringify({ at, DUR }, null, 2));
console.log('schedule.json written, DUR =', DUR);
for (const [id] of GAPS) console.log(' ', id, at[id]);
