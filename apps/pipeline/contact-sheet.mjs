#!/usr/bin/env node
/**
 * Render several timestamps of a project into one grid image for spot-check review.
 *
 *   node pipeline/contact-sheet.mjs out/foo.geomotion.json --times=1,9,15,22,28,33,39
 *   node pipeline/contact-sheet.mjs out/foo.geomotion.json --every=3 --out=review.png
 *
 * A spot-check review has always meant one screenshot per timestamp, each a separate
 * look. This produces a single image instead, so a review is one look, not ten.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { writeContactSheet } from './lib/contact-sheet.mjs';
import { checkDistFreshness, stalenessWarning } from './lib/dist-freshness.mjs';

const run = promisify(execFile);
const APP = path.dirname(fileURLToPath(import.meta.url)); // apps/pipeline
const REPO = path.resolve(APP, '../..');
const STUDIO = path.join(REPO, 'apps/studio');

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const opt = (n, d) => {
  const hit = argv.find((a) => a.startsWith(`--${n}=`));
  return hit ? hit.split('=').slice(1).join('=') : d;
};

if (!file) {
  console.error(
    'usage: node pipeline/contact-sheet.mjs <project.geomotion.json> [--times=1,9,15] ' +
      '[--every=3] [--out=path.png] [--cell=320] [--cols=4]',
  );
  process.exit(1);
}

const step = (n, m) => console.log(`\n\x1b[36m[${n}]\x1b[0m ${m}`);
const ok = (m) => console.log(`    \x1b[32m✓\x1b[0m ${m}`);

const project = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));
const slug = (project.name || 'project').toLowerCase().replace(/[^\w-]+/g, '-').replace(/^-|-$/g, '') || 'project';

let times;
const timesOpt = opt('times', null);
if (timesOpt) {
  times = timesOpt.split(',').map(Number);
} else {
  const every = Number(opt('every', '3'));
  times = [];
  for (let t = 0; t < project.duration; t += every) times.push(Math.round(t * 100) / 100);
  if (times[times.length - 1] < project.duration - 0.05) times.push(Math.round((project.duration - 0.05) * 100) / 100);
}

step(1, 'Project');
ok(`${project.width}×${project.height} @ ${project.fps}fps · ${project.duration.toFixed(1)}s · ${times.length} frames requested`);

step(2, 'Building the app');
const distDir = path.join(STUDIO, 'dist');
try {
  await fs.access(path.join(distDir, 'index.html'));
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

step(3, `Rendering ${times.length} frames into a contact sheet`);
const out = path.resolve(opt('out', path.join(APP, 'out', `${slug}-contact-sheet.png`)));
await writeContactSheet(project, times, out, {
  distDir,
  port: Number(opt('port', 5213)),
  cellWidth: Number(opt('cell', 320)),
  cols: opt('cols', null) ? Number(opt('cols', null)) : null,
});
ok('composited');

console.log(`\n\x1b[32mDone\x1b[0m  ${out}`);
