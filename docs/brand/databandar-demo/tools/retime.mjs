/**
 * Rebuilds schedule.json from the actually-measured narration durations (vo/*.wav), the same
 * fix EP001 needed: a word-count estimate is not the schedule, the audio is.
 *
 * Run after tools/narrate.mjs, before tools/build-project.mjs picks up schedule.json.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const OUT = fileURLToPath(new URL('..', import.meta.url));

const duration = (id) =>
  parseFloat(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${OUT}/vo/${id}.wav`,
  ]).toString().trim());

// [id, gap-after-this-line]. Gaps are deliberate, not filler: 0.6s after s02 gives the STRIP
// to the flat map a breath before the density reveal begins; 3.0s after s07 holds the closing
// stat card before the cut to black.
const GAPS = [
  ['s01', 0.25], ['s02', 0.6], ['s03', 0.3], ['s04', 0.3],
  ['s05', 0.3], ['s06', 0.4], ['s07', 3.0],
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
