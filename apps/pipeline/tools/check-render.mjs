#!/usr/bin/env node
/**
 * Assert that a rendered MP4 is the file the project asked for.
 *
 *   node tools/check-render.mjs out/ci-smoke-draft/ci-smoke-draft.mp4 \
 *     --width=720 --height=720 --fps=15 --duration=2 [--audio]
 *
 * The pipeline exiting 0 says ffmpeg ran, not that the video is right. Every recent
 * defect here was invisible to the exit code and obvious in the output: a draft that
 * reframed a square composition to widescreen, and `-shortest` silently dropping the
 * audio stream while logging the mapping and succeeding.
 *
 * Frames are *counted*, not read from the header. `nb_frames` is metadata a muxer
 * writes and can be wrong or absent; decoding is the only way to know how many frames
 * a player will actually see.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const [file, ...rest] = process.argv.slice(2);
const opt = (n, d) => {
  const hit = rest.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};
const flag = (n) => rest.includes(`--${n}`);

if (!file) {
  console.error('usage: check-render.mjs <file.mp4> [--width=] [--height=] [--fps=] [--duration=] [--audio]');
  process.exit(2);
}

async function probe(args) {
  const { stdout } = await run('ffprobe', ['-v', 'error', ...args, file]);
  return stdout.trim();
}

const problems = [];
const eq = (what, got, want) => {
  if (want !== undefined && String(got) !== String(want)) problems.push(`${what}: got ${got}, expected ${want}`);
};

const [w, h, rate] = (
  await probe(['-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'csv=p=0'])
).split(',');

eq('width', w, opt('width'));
eq('height', h, opt('height'));

// r_frame_rate is a rational, so 15 arrives as "15/1".
const [num, den] = rate.split('/');
eq('fps', Number(num) / Number(den || 1), opt('fps'));

const duration = Number(await probe(['-show_entries', 'format=duration', '-of', 'csv=p=0']));
const wantDuration = opt('duration');
if (wantDuration !== undefined && Math.abs(duration - Number(wantDuration)) > 0.15) {
  problems.push(`duration: got ${duration.toFixed(3)}s, expected ${wantDuration}s`);
}

const counted = Number(
  await probe(['-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=nb_read_frames', '-of', 'csv=p=0']),
);
if (wantDuration !== undefined && opt('fps') !== undefined) {
  const want = Math.round(Number(wantDuration) * Number(opt('fps')));
  // One frame either way: whether the final instant is rendered is a boundary choice,
  // not a defect, and pinning it exactly would break on a rounding change.
  if (Math.abs(counted - want) > 1) problems.push(`frames: decoded ${counted}, expected about ${want}`);
}

const streams = (await probe(['-show_entries', 'stream=codec_type', '-of', 'csv=p=0'])).split('\n');
if (!streams.includes('video')) problems.push('no video stream');
if (flag('audio')) {
  // The `-shortest` trap: ffmpeg logs the audio mapping, exits 0, and writes no audio.
  if (!streams.includes('audio')) problems.push('no audio stream, though one was expected');
}

console.log(
  `${file}\n  ${w}x${h} @ ${Number(num) / Number(den || 1)}fps · ${duration.toFixed(3)}s · ` +
    `${counted} frames decoded · streams: ${streams.join('+')}`,
);

if (problems.length) {
  console.error('\nFAILED:');
  for (const p of problems) console.error('  ' + p);
  process.exit(1);
}
console.log('  ok');
