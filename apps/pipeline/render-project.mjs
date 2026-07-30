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
import { encode, grabThumbnail } from './lib/encode.mjs';

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

if (draft) {
  project.fps = 15;
  const scale = project.height > project.width ? { width: 540, height: 960 } : { width: 960, height: 540 };
  Object.assign(project, scale);
}

const outDir = path.join(APP, 'out', slug + (draft ? '-draft' : ''));
const framesDir = path.join(outDir, 'frames');
await fs.mkdir(outDir, { recursive: true });

/* -------------------------------------------------------------- audio */

let audio = opt('audio', null);
if (!audio && project.audio?.file) audio = project.audio.file;
if (audio) {
  audio = path.resolve(REPO, audio);
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
    `${project.layers.length} layers · ${audio ? 'with narration' : 'silent'}`,
);

/* -------------------------------------------------------------- build */

step(2, 'Building the app');
const distDir = path.join(STUDIO, 'dist');
try {
  await fs.access(path.join(distDir, 'index.html'));
  if (flag('rebuild')) throw new Error('forced');
  ok('dist/ present');
} catch {
  await run('pnpm', ['--filter', '@geomotion/studio', 'build'], { cwd: REPO, maxBuffer: 1024 * 1024 * 32 });
  ok('built');
}

/* ------------------------------------------------------------- render */

step(3, `Rendering ${Math.round(project.duration * project.fps)} frames`);
const t0 = Date.now();
let last = -1;
const { pad, problems } = await renderFrames(project, framesDir, {
  distDir,
  waitForTiles: !draft,
  port: Number(opt('port', 5212)),
  onProgress: (i, total) => {
    const pct = Math.floor((i / total) * 100);
    if (pct === last) return;
    last = pct;
    const rate = i / ((Date.now() - t0) / 1000);
    process.stdout.write(`\r    ${pct}%  ${i}/${total}  ${rate.toFixed(1)} fps   `);
  },
});
process.stdout.write('\n');
ok(`frames in ${Math.round((Date.now() - t0) / 1000)}s`);
if (problems.length) console.warn(`    ! ${problems.length} page errors: ${problems.slice(0, 3).join(' | ')}`);

/* ------------------------------------------------------------- encode */

step(4, 'Encoding');
const mp4 = path.join(outDir, `${slug}${draft ? '-draft' : ''}.mp4`);
await encode({ framesDir, pad, fps: project.fps, audio, out: mp4, crf: draft ? 26 : 18 });

const thumb = path.join(outDir, `${slug}-thumb.png`);
await grabThumbnail({ video: mp4, at: Math.min(project.duration * 0.94, project.duration - 0.1), out: thumb });

if (!flag('keep-frames')) await fs.rm(framesDir, { recursive: true, force: true });

const { stdout: size } = await run('du', ['-h', mp4]);
console.log(`\n\x1b[32mDone\x1b[0m  ${mp4}  (${size.trim().split(/\s+/)[0]})`);
console.log(`      thumbnail  ${thumb}`);
