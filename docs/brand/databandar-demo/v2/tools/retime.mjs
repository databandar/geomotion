/**
 * v2 schedule: measured narration durations, in the ABSOLUTE timeline of the final concatenated
 * video (Hyperframe clip + GeoMotion frames). s00's slot is pinned to the Hyperframe clip's own
 * fixed length rather than to s00's measured speech — the diagram's animation is choreographed
 * to specific beats (dots resolve, bands appear, text lands) and re-timing the clip to match
 * speech would mean re-animating it; the reverse (letting narration finish inside a fixed
 * visual window) is the one worth doing, and s00 is short enough to fit.
 *
 * GEO_OFFSET is HYPERFRAME_DUR: subtract it from every other segment's absolute time to get the
 * time to hand GeoMotion, whose own project clock starts at 0 the instant the Hyperframe clip
 * ends.
 */
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('..', import.meta.url));
const HYPERFRAME_DUR = 3.6;

const duration = (id) =>
  parseFloat(execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${OUT}/vo/${id}.wav`,
  ]).toString().trim());

// [id, gap-after-this-line]. s00 is exempt from the gap/duration derivation below — it's
// pinned to the Hyperframe clip itself, checked against the diagram's own animation timing.
const GAPS = [
  ['s01', 0.2], ['s02', 0.3], ['s03', 0.3], ['s04', 0.3],
  ['s05', 0.3], ['s06', 0.5], ['s07', 3.2],
];

const s00dur = duration('s00');
if (s00dur > HYPERFRAME_DUR) {
  console.warn(`WARNING: s00 speech (${s00dur.toFixed(2)}s) runs longer than the Hyperframe clip (${HYPERFRAME_DUR}s) — it will be cut off. Shorten the line or lengthen the clip.`);
}

const at = { s00: { start: 0, end: HYPERFRAME_DUR, duration: s00dur } };
let t = HYPERFRAME_DUR;
for (const [id, gap] of GAPS) {
  const dur = duration(id);
  at[id] = { start: Math.round(t * 100) / 100, end: Math.round((t + dur) * 100) / 100, duration: Math.round(dur * 100) / 100 };
  t += dur + gap;
}
const DUR = Math.round(t * 100) / 100;

// The GeoMotion-relative view: every segment from s01 on, shifted so s01's frame is GeoMotion
// project-time 0 (which is absolute HYPERFRAME_DUR).
const atGeo = {};
for (const [id, seg] of Object.entries(at)) {
  if (id === 's00') continue;
  atGeo[id] = { start: Math.round((seg.start - HYPERFRAME_DUR) * 100) / 100, end: Math.round((seg.end - HYPERFRAME_DUR) * 100) / 100 };
}
const geoDur = Math.round((DUR - HYPERFRAME_DUR) * 100) / 100;

writeFileSync(`${OUT}/schedule.json`, JSON.stringify({ at, atGeo, DUR, HYPERFRAME_DUR, geoDur }, null, 2));
console.log('schedule.json written, DUR =', DUR, 'geoDur =', geoDur);
for (const [id, seg] of Object.entries(at)) console.log(' ', id, seg);
