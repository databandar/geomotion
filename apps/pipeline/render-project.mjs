#!/usr/bin/env node
/**
 * Render a project file straight to MP4.
 *
 *   node pipeline/render-project.mjs out/foo.geomotion.json [--draft] [--audio=voice.wav]
 *
 * This is the "I edited it by hand, now export it" path. Unlike video.mjs it does
 * no composing: the project is taken exactly as given, so whatever you changed in
 * the editor is what gets rendered. Narration is muxed from the wav the project
 * points at, or from --audio.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { renderFrames } from './lib/render.mjs';
import { draftSize } from './lib/draft.mjs';
import { encode, grabThumbnail, muxEncoded } from './lib/encode.mjs';
import { EncoderUnavailable, renderEncoded } from './lib/render-encoded.mjs';
import { buildVoiceTrack } from './lib/tts.mjs';
import { materialiseClips } from './lib/audio-source.mjs';
import { planAudio } from '@geomotion/document';
import { checkDistFreshness, stalenessWarning } from './lib/dist-freshness.mjs';

const run = promisify(execFile);
// Path anchors. Named explicitly because a single ambiguous "ROOT" is what broke
// when this pipeline moved under apps/ — each of these means something different.
const APP = path.dirname(fileURLToPath(import.meta.url)); // apps/pipeline
const REPO = path.resolve(APP, '../..');
const STUDIO = path.join(REPO, 'apps/studio');

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const flag = (n) => argv.includes('--' + n);
const opt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

if (!file) {
  console.error('usage: node pipeline/render-project.mjs <project.geomotion.json> [--draft] [--audio=path.wav] [--slug=name]');
  process.exit(1);
}

const step = (n, m) => console.log(`\n\x1b[36m[${n}]\x1b[0m ${m}`);
const ok = (m) => console.log(`    \x1b[32m✓\x1b[0m ${m}`);

const project = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
const draft = flag('draft');
const slug = opt('slug', (project.name || 'project').toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'project');

// Format 6+ is a flat node store; older documents carry a `layers` list. The app's
// `loadProject` migrates either, so the log just needs a count that survives both.
const nodeCount = Array.isArray(project.layers) ? project.layers.length : Object.keys(project.nodes ?? {}).length;

if (draft) {
  project.fps = 15;
  // Aspect ratio preserved: a draft that reframes the composition cannot be used to
  // judge the framing, which is most of what a draft is for. See draftSize.
  Object.assign(project, draftSize(project.width, project.height));
}

const outDir = path.join(APP, 'out', slug + (draft ? '-draft' : ''));
const framesDir = path.join(outDir, 'frames');
await fs.mkdir(outDir, { recursive: true });

/* -------------------------------------------------------------- audio */

/*
 * Narration is re-mixed from the document's cue positions whenever it can be.
 *
 * This is the point of D10: the project you are rendering may have been retimed in
 * the editor since the script was composed, and a bed mixed at compose time would
 * put the voice where the picture used to be. An explicit --audio still wins, and a
 * document whose cues have no per-line audio falls back to its bed.
 */
let audio = opt('audio', null);
if (audio) {
  audio = path.resolve(REPO, audio);
} else {
  const plan = planAudio(project);
  if (plan.kind === 'remix') {
    // Audio imported in the editor is embedded in the document, so it has to be
    // written out before ffmpeg can read it.
    const { clips, missing, embedded } = await materialiseClips(plan.clips, path.join(outDir, 'audio'));
    if (missing.length) {
      console.warn(`    ! ${missing.length} audio clip(s) could not be read: ${missing.slice(0, 3).join(', ')}`);
    }
    if (!clips.length) {
      console.warn('    ! no readable audio clips — falling back to the mixed bed');
      audio = project.audio?.file ?? null;
    } else {
      audio = path.join(outDir, 'voice.wav');
      await buildVoiceTrack(clips, audio, plan.duration);
      const note = embedded ? `, ${embedded} embedded in the project` : '';
      console.log(`    re-mixed ${clips.length} audio clips at their current cue times${note}`);
    }
  } else if (plan.kind === 'bed') {
    audio = plan.file;
    console.log(`    using the pre-mixed bed (${plan.reason}); retiming will not move the voice`);
  }
}

if (audio) {
  try {
    await fs.access(audio);
  } catch {
    console.warn(`    ! narration not found at ${audio} — rendering silent`);
    audio = null;
  }
}

step(1, 'Project');
ok(
  `${project.width}×${project.height} @ ${project.fps}fps · ${project.duration.toFixed(1)}s · ` +
    `${nodeCount} layers · ${audio ? 'with narration' : 'silent'}`,
);

/* -------------------------------------------------------------- build */

step(2, 'Building the app');
const distDir = path.join(STUDIO, 'dist');
try {
  await fs.access(path.join(distDir, 'index.html'));
  if (flag('rebuild')) throw new Error('forced');
  ok('dist/ present');
  /*
   * Present is not the same as current. Every renderer here draws through dist/, so a
   * change under packages/ that has not been rebuilt simply does not exist as far as
   * the render is concerned — silently, and with plausible output.
   */
  const freshness = await checkDistFreshness(REPO, distDir);
  const warning = stalenessWarning(freshness);
  if (warning) console.warn(`    \x1b[33m!\x1b[0m ${warning}`);
} catch {
  await run('pnpm', ['--filter', '@geomotion/studio', 'build'], { cwd: REPO, maxBuffer: 1024 * 1024 * 32 });
  ok('built');
}

/* ------------------------------------------------------------- render */

const frameCount = Math.round(project.duration * project.fps);
const t0 = Date.now();
let last = -1;
const progress = (i, total) => {
  const pct = Math.floor((i / total) * 100);
  if (pct === last) return;
  last = pct;
  const rate = i / ((Date.now() - t0) / 1000);
  process.stdout.write(`\r    ${pct}%  ${i}/${total}  ${rate.toFixed(1)} fps   `);
};
/*
 * A draft skips tile waiting for speed, which is why a draft can show grey loading blocks.
 * `--wait-tiles` buys them back when the draft is for judging the picture rather than the
 * timing; `--strict-tiles` turns an unfinished frame into a failed render, for CI.
 */
const waitTiles = flag('wait-tiles') || !draft;
const strictTiles = flag('strict-tiles');
const renderOpts = { distDir, waitForTiles: waitTiles, port: Number(opt('port', 5212)), onProgress: progress };

const mp4 = path.join(outDir, `${slug}${draft ? '-draft' : ''}.mp4`);
/*
 * A draft encodes inside the page, which measures about five times faster than
 * capturing PNGs over CDP. A final render keeps the frame path: libx264 at
 * `-preset slow -crf 18` is better per byte than a realtime encoder, and the published
 * file is rendered once while a draft is rendered constantly.
 *
 * `--frames` forces the slow path, which is also the automatic fallback if the browser
 * turns out not to be able to encode.
 */
let encoded = null;
if (draft && !flag('frames')) {
  step(3, `Rendering ${frameCount} frames (in-page encoder)`);
  try {
    encoded = await renderEncoded(project, path.join(outDir, 'draft.h264'), renderOpts);
  } catch (err) {
    if (!(err instanceof EncoderUnavailable)) throw err;
    process.stdout.write('\n');
    console.warn(`    ! ${err.message} — falling back to frames`);
  }
}

let problems = [];
let unfinished = [];
if (encoded) {
  process.stdout.write('\n');
  problems = encoded.problems;
  unfinished = encoded.unfinished ?? [];
  ok(`encoded in ${Math.round((Date.now() - t0) / 1000)}s (${(encoded.bytes / 1024 / 1024).toFixed(1)} MB of h264)`);
  step(4, 'Muxing');
  await muxEncoded({
    videoFile: encoded.file,
    fps: project.fps,
    duration: frameCount / project.fps,
    audio,
    out: mp4,
  });
  await fs.rm(encoded.file, { force: true });
} else {
  step(3, `Rendering ${frameCount} frames`);
  const result = await renderFrames(project, framesDir, renderOpts);
  problems = result.problems;
  unfinished = result.unfinished ?? [];
  process.stdout.write('\n');
  ok(`frames in ${Math.round((Date.now() - t0) / 1000)}s`);
  step(4, 'Encoding');
  await encode({ framesDir, pad: result.pad, fps: project.fps, audio, out: mp4, crf: draft ? 26 : 18 });
}
if (problems.length) console.warn(`    ! ${problems.length} page errors: ${problems.slice(0, 3).join(' | ')}`);
/*
 * Said out loud, every time. A frame captured before its tiles arrived has grey blocks in
 * it, and this used to be invisible — the render simply reported success.
 */
if (unfinished.length) {
  console.warn(
    `    ! ${unfinished.length} of ${frameCount} frames were captured before their basemap tiles finished.\n` +
      `      Those frames have loading blocks in them.` +
      (waitTiles ? ' The tile server was too slow; try again, or raise the budget.' : ' Re-run with --wait-tiles.'),
  );
  if (strictTiles) {
    console.error('    ✗ --strict-tiles: refusing to call this render good.');
    process.exit(1);
  }
}

const thumb = path.join(outDir, `${slug}-thumb.png`);
await grabThumbnail({ video: mp4, at: Math.min(project.duration * 0.94, project.duration - 0.1), out: thumb });

if (!flag('keep-frames')) await fs.rm(framesDir, { recursive: true, force: true });

const { stdout: size } = await run('du', ['-h', mp4]);
console.log(`\n\x1b[32mDone\x1b[0m  ${mp4}  (${size.trim().split(/\s+/)[0]})`);
console.log(`      thumbnail  ${thumb}`);
