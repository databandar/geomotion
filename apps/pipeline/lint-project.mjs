#!/usr/bin/env node
/**
 * Run every geometry/overlap/image check this pipeline knows about against a
 * project file, and fail the process if any of them find something.
 *
 *   node pipeline/lint-project.mjs out/foo.geomotion.json --times=1,9,15,22
 *   node pipeline/lint-project.mjs out/foo.geomotion.json --every=3
 *
 * Every one of these checks (antimeridian/polar-clip risk, text/marker/route
 * overlap, routes too small to read, baked-in card borders on source images) was
 * built during real production and, until now, only reachable one-off — a
 * scratch puppeteer script written fresh per check, or a manual eyeball pass.
 * This is that work made a real, reachable command instead.
 *
 * Exits non-zero if any finding turns up, so it can gate a build.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { layersOf, migrate } from '@geomotion/document';
import { renderInPage } from './lib/render.mjs';
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
    'usage: node pipeline/lint-project.mjs <project.geomotion.json> [--times=1,9,15] ' +
      '[--every=2] [--min-fraction=0.3] [--port=5214]',
  );
  process.exit(1);
}

const step = (n, m) => console.log(`\n\x1b[36m[${n}]\x1b[0m ${m}`);
const ok = (m) => console.log(`    \x1b[32m✓\x1b[0m ${m}`);
const bad = (m) => console.log(`    \x1b[31m✗\x1b[0m ${m}`);

const project = JSON.parse(await fs.readFile(path.resolve(file), 'utf8'));

let times;
const timesOpt = opt('times', null);
if (timesOpt) {
  times = timesOpt.split(',').map(Number);
} else {
  const every = Number(opt('every', '2'));
  times = [];
  for (let t = 0; t < project.duration; t += every) times.push(Math.round(t * 100) / 100);
  if (times[times.length - 1] < project.duration - 0.05) times.push(Math.round((project.duration - 0.05) * 100) / 100);
}
const minFraction = Number(opt('min-fraction', '0.3'));

step(1, 'Project');
ok(`${project.width}×${project.height} @ ${project.fps}fps · ${project.duration.toFixed(1)}s · checking ${times.length} timestamps`);

let problems = 0;

/* --------------------------------------------------------------- browser */
/*
 * Every check, including the geometry one, runs inside the page via
 * `window.geomotion` rather than as a direct Node-side import — `checkGeometry`
 * wraps `@geomotion/evaluator`'s `checkProjectGeometry`, and that package pulls
 * in `@geomotion/animation`, which uses a TS parameter-property constructor
 * that Node's own type-stripping can't load outside a bundler. `layersOf`
 * (from `@geomotion/document`, no such dependency) is the one thing here still
 * imported directly, just to list image sources before opening the browser.
 */

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

/*
 * `layersOf` reads the flat node store a *migrated* document has. A project straight
 * from the composer is still format 1 — a plain `layers` array and no `nodes` — so
 * calling it on the raw file threw `Cannot convert undefined or null to object` before
 * a single check ran. The page migrates the document itself; this listing has to do
 * its own, and the raw `project` is still what gets handed to the browser.
 */
const imageSources = layersOf(migrate(project))
  .filter((l) => l.type === 'image')
  .map((l) => ({ id: l.id, name: l.name, src: l.src }));

step(3, `Document, geometry, text fit, overlaps, tiny routes, and ${imageSources.length} source image(s)`);
await renderInPage(project, {
  distDir,
  port: Number(opt('port', 5214)),
  run: async (page) => {
    const geomFindings = await page.evaluate(() => window.geomotion.checkGeometry());
    if (geomFindings.length === 0) {
      ok('geometry: none');
    } else {
      problems += geomFindings.length;
      for (const f of geomFindings) bad(`${f.layerName} (${f.layerId}): ${f.kind} — ${f.detail}`);
    }

    const docFindings = await page.evaluate(() => window.geomotion.checkDocument());
    if (docFindings.length === 0) {
      ok('document: none');
    } else {
      problems += docFindings.length;
      for (const f of docFindings) bad(`${f.layerName} (${f.layerId}): ${f.kind} — ${f.detail}`);
    }

    const textFit = await page.evaluate((ts) => window.geomotion.checkTextFit(ts), times);
    if (textFit.length === 0) {
      ok('text fits the frame: none');
    } else {
      // One layer overflowing is reported once, not once per sampled timestamp.
      const worst = new Map();
      for (const f of textFit) {
        const prev = worst.get(f.layerId);
        if (!prev || f.overflow > prev.overflow) worst.set(f.layerId, f);
      }
      problems += worst.size;
      for (const f of worst.values()) {
        bad(`text off-frame: ${f.layerName} runs ${f.overflow}px past the ${f.sides.join('/')} edge (t=${f.time})`);
      }
    }

    const overlaps = await page.evaluate((ts) => window.geomotion.checkOverlaps(ts), times);
    if (overlaps.length === 0) {
      ok('overlaps: none');
    } else {
      problems += overlaps.length;
      for (const f of overlaps) bad(`overlap at t=${f.time}: ${f.a.name} × ${f.b.name}`);
    }

    const tiny = await page.evaluate(
      (ts, mf) => window.geomotion.checkTinyRoutes(ts, mf),
      times, minFraction,
    );
    if (tiny.length === 0) {
      ok('tiny routes: none');
    } else {
      problems += tiny.length;
      for (const f of tiny) {
        bad(`tiny route at t=${f.time}: ${f.layerName} only ${(f.onScreenFraction * 100).toFixed(0)}% of viewport diagonal`);
      }
    }

    for (const { name, src } of imageSources) {
      const finding = await page.evaluate((s) => window.geomotion.checkImage(s), src);
      if (finding) {
        problems += 1;
        bad(`baked-in card border: ${name}`);
      } else {
        ok(`image clean: ${name}`);
      }
    }
    return {};
  },
});

/* ------------------------------------------------------------------ done */

console.log();
if (problems === 0) {
  console.log('\x1b[32mDone\x1b[0m  no findings');
  process.exit(0);
} else {
  console.log(`\x1b[31mDone\x1b[0m  ${problems} finding(s)`);
  process.exit(1);
}
