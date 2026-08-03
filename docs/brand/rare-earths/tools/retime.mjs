import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('..', import.meta.url));
const duration = (id) =>
  parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${OUT}/vo/${id}.wav`]).toString().trim());

const GAPS = [
  ['s01', 0.5], ['s02', 0.6], ['s03', 0.6], ['s03b', 0.6],
  ['s04', 0.6], ['s05', 0.8], ['s06', 0.9], ['s07', 4.0],
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
console.log('DUR =', DUR, 's');
for (const [id] of GAPS) console.log(' ', id, at[id]);