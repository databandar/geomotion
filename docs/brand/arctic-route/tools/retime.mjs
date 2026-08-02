/**
 * Rebuilds schedule.json from measured narration — never trust a word-count estimate over
 * the real audio.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('..', import.meta.url));

const duration = (id) =>
  parseFloat(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${OUT}/vo/${id}.wav`,
  ]).toString().trim());

// [id, gap-after]. Generous room at the distance reveal (s03), the "catch" reversal (s04),
// and the close (s07) — same discipline as Malacca: earn the runtime with visual dwell time,
// not padded words.
const GAPS = [
  ['s01', 0.4], ['s02', 0.5], ['s03', 1.4], ['s04', 1.2],
  ['s05', 0.6], ['s06', 0.9], ['s07', 3.4],
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
