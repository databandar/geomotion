#!/usr/bin/env node
/**
 * Script → finished video.
 *
 *   node pipeline/video.mjs pipeline/scripts/anemia-india.json
 *
 * Stages: narrate → time → compose → render → encode. Narration is measured
 * before anything visual is decided, so the animation is cut to the voice rather
 * than the voice being squeezed into a guessed timeline.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { collectLines, compose, buildSrt, mergeComposed, prepareScript, validateScript } from './lib/compose.mjs';
import { lineAudio, buildVoiceTrack } from './lib/tts.mjs';
import { renderFrames } from './lib/render.mjs';
import { encode, grabThumbnail } from './lib/encode.mjs';
import { checkDistFreshness, stalenessWarning } from './lib/dist-freshness.mjs';

const run = promisify(execFile);
// Path anchors. Named explicitly because a single ambiguous "ROOT" is what broke
// when this pipeline moved under apps/ — each of these means something different.
const APP = path.dirname(fileURLToPath(import.meta.url)); // apps/pipeline
const REPO = path.resolve(APP, '../..');
const STUDIO = path.join(REPO, 'apps/studio');

const argv = process.argv.slice(2);
const scriptPath = argv.find((a) => !a.startsWith('--'));
const flag = (name) => argv.includes('--' + name);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : fallback;
};

if (!scriptPath) {
  console.error('usage: node pipeline/video.mjs <script.json> [--draft] [--no-audio] [--frames-only] [--keep-frames]');
  process.exit(1);
}

const step = (n, msg) => console.log(`\n\x1b[36m[${n}]\x1b[0m ${msg}`);
const ok = (msg) => console.log(`    \x1b[32m✓\x1b[0m ${msg}`);

/*
 * A failure here is a bad script or a missing input, and both arrive with a message
 * written to be read. A stack trace buries it under frames from inside the composer.
 */
process.on('uncaughtException', (e) => {
  console.error('\n' + (e instanceof Error ? e.message : String(e)) + '\n');
  process.exit(1);
});

const script = JSON.parse(await fs.readFile(scriptPath, 'utf8'));
// Before narration, which is the expensive step and runs first.
validateScript(script);
const slug = script.slug ?? path.basename(scriptPath, '.json');
const draft = flag('draft');

if (draft) {
  // Quarter-ish resolution and half the frame rate: a two-minute check instead
  // of a twenty-minute render. Timing and layout are identical.
  script.fps = 15;
  if (script.format === 'short') {
    script.__draftSize = { width: 540, height: 960 };
  } else {
    script.__draftSize = { width: 960, height: 540 };
  }
}

const outDir = path.join(APP, 'out', slug + (draft ? '-draft' : ''));
const framesDir = path.join(outDir, 'frames');
await fs.mkdir(outDir, { recursive: true });

/* ------------------------------------------------------------ 1. narrate */

step(1, `Narrating (${script.voice?.engine ?? 'say'})`);
const { missing, unresolved } = await prepareScript(script);
if (missing.length) {
  console.warn(`    ! tour stops with no value in the data: ${[...new Set(missing)].join(', ')}`);
}
if (unresolved?.length) {
  // Speaking a literal "{value}" is worse than failing, so this is loud.
  console.warn('    ! UNRESOLVED PLACEHOLDERS — these would be read aloud verbatim:');
  unresolved.forEach((u) => console.warn(`      ${u}`));
}
const lines = collectLines(script);
const timings = new Map();
const clipFiles = new Map();
let cachedCount = 0;

if (flag('no-audio')) {
  // Estimate from syllable-ish length so the timeline is still sane.
  for (const line of lines) timings.set(line.key, Math.max(1.6, line.text.length / 13));
  ok(`${lines.length} lines estimated (no audio)`);
} else {
  let manualCount = 0;
  for (const line of lines) {
    const { file, duration, cached, manual } = await lineAudio({
      voiceRoot: path.join(APP, 'out/_voice'),
      slug,
      key: line.key,
      text: line.text,
      voice: script.voice ?? { engine: 'say', voice: 'Lekha', rate: 165 },
    });
    timings.set(line.key, duration);
    clipFiles.set(line.key, file);
    if (cached) cachedCount++;
    if (manual) manualCount++;
  }
  const total = [...timings.values()].reduce((a, b) => a + b, 0);
  ok(
    `${lines.length} lines, ${total.toFixed(1)}s of speech ` +
      `(${cachedCount} from cache${manualCount ? `, ${manualCount} your own recording` : ''})`,
  );
}

/* ------------------------------------------------------------ 2. compose */

step(2, 'Composing timeline');
const { project, beats, duration } = await compose(script, timings);
if (script.__draftSize) Object.assign(project, script.__draftSize);

await fs.writeFile(path.join(outDir, `${slug}.srt`), buildSrt(beats));
ok(`${duration.toFixed(1)}s · ${project.width}×${project.height} @ ${project.fps}fps · ${project.layers.length} layers`);
for (const b of beats) {
  const label = b.kind === 'tour' ? `tour (${b.stops.length} stops)` : b.kind;
  console.log(`      ${b.start.toFixed(1).padStart(6)}s  ${label}`);
}

/* -------------------------------------------------------- 3. voice track */

let voiceTrack = null;
if (!flag('no-audio')) {
  step(3, 'Building voice track');
  const clips = [];
  // Keyed by file so the cue can report what was said and how long it ran.
  const clipDurations = new Map();
  const clipTexts = new Map();
  const note = (key, file, text) => {
    clipDurations.set(file, timings.get(key) ?? 0);
    clipTexts.set(file, text ?? '');
  };
  for (const beat of beats) {
    if (beat.kind === 'tour') {
      let t = beat.start;
      for (const stop of beat.stops) {
        if (clipFiles.has(stop.__key)) {
          const file = clipFiles.get(stop.__key);
          clips.push({ file, start: t });
          note(stop.__key, file, stop.say);
        }
        t += stop.duration;
      }
    } else if (clipFiles.has(beat.__key)) {
      const file = clipFiles.get(beat.__key);
      clips.push({ file, start: beat.start });
      note(beat.__key, file, beat.say);
    }
  }
  voiceTrack = path.join(outDir, 'voice.wav');
  await buildVoiceTrack(clips, voiceTrack, duration);
  ok(`${clips.length} clips mixed onto a ${duration.toFixed(1)}s bed`);

  /*
   * Attach the narration to the project, keeping each line's own audio.
   *
   * Two bugs closed here. The project used to be written out *before* this step,
   * so the file the CLI invites you to "open in the editor to tweak by hand" had
   * no narration at all — the editor played nothing, and re-rendering it came out
   * silent. And the bed alone cannot be retimed: with each cue's file kept, a
   * later render re-mixes at whatever positions the timeline has by then (see
   * planAudio in @geomotion/document).
   */
  const round3 = (n) => Math.round(n * 1000) / 1000;
  project.audio = {
    // No `url`: there is no server here to serve one, and a page may not load a
    // file:// resource — the headless renderer logs it as an error if you try.
    file: voiceTrack,
    cues: clips.map((c) => ({
      t: round3(c.start),
      d: round3(clipDurations.get(c.file) ?? 0),
      text: clipTexts.get(c.file) ?? '',
      file: c.file,
    })),
  };
}

// Written after the voice track so it carries the narration with it.
/*
 * Fold into whatever is already there, unless asked not to.
 *
 * Merging is the default because overwriting is the surprising outcome: the line printed
 * at the end of this script invites hand editing, and a re-run that silently discarded it
 * was the tool contradicting itself. `--fresh` is the escape hatch for genuinely starting
 * over.
 */
const projectPath = path.join(outDir, `${slug}.geomotion.json`);
let toWrite = project;
if (!flag('fresh')) {
  const existing = await fs.readFile(projectPath, 'utf8').then(JSON.parse, () => null);
  if (existing) {
    toWrite = mergeComposed(existing, project);
    const kept = toWrite.layers.length - project.layers.length;
    const keptBlocks = toWrite.story.length - project.story.length;
    if (kept || keptBlocks) {
      console.log(`    \x1b[32m✓\x1b[0m kept ${kept} hand-added layer(s) and ${keptBlocks} hand-made block(s)`);
    }
  }
}
await fs.writeFile(projectPath, JSON.stringify(toWrite, null, 2));

/* -------------------------------------------------------------- 4. build */

step(4, 'Building the app');
const distDir = path.join(STUDIO, 'dist');
try {
  await fs.access(path.join(distDir, 'index.html'));
  if (flag('rebuild')) throw new Error('forced');
  ok('dist/ present (pass --rebuild to force)');
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

/* ------------------------------------------------------------- 5. render */

step(5, `Rendering ${Math.round(duration * project.fps)} frames`);
const t0 = Date.now();
let lastPct = -1;
const { pad, problems } = await renderFrames(project, framesDir, {
  distDir,
  waitForTiles: !draft,
  port: Number(opt('port', 5211)),
  onProgress: (i, total) => {
    const pct = Math.floor((i / total) * 100);
    if (pct !== lastPct) {
      lastPct = pct;
      const rate = i / ((Date.now() - t0) / 1000);
      const eta = (total - i) / Math.max(rate, 0.01);
      process.stdout.write(`\r    ${pct}%  ${i}/${total}  ${rate.toFixed(1)} fps  eta ${fmt(eta)}   `);
    }
  },
});
process.stdout.write('\n');
ok(`frames in ${fmt((Date.now() - t0) / 1000)}`);
if (problems.length) console.warn(`    ! ${problems.length} page errors: ${problems.slice(0, 3).join(' | ')}`);

if (flag('frames-only')) {
  console.log(`\nFrames in ${framesDir}`);
  process.exit(0);
}

/* ------------------------------------------------------------- 6. encode */

step(6, 'Encoding');
const mp4 = path.join(outDir, `${slug}${draft ? '-draft' : ''}.mp4`);
await encode({
  framesDir,
  pad,
  fps: project.fps,
  audio: voiceTrack,
  out: mp4,
  crf: draft ? 26 : (script.crf ?? 18),
  music: script.music ? path.resolve(REPO, script.music) : null,
  musicGain: script.musicGain ?? -22,
});

// Default to the closing full-map shot: it is the most informative frame in the
// video, and t=0 is usually the emptiest.
const thumbAt = Math.min(script.thumbnailAt ?? duration * 0.94, duration - 0.1);
const thumb = path.join(outDir, `${slug}-thumb.png`);
await grabThumbnail({ video: mp4, at: thumbAt, out: thumb });

if (!flag('keep-frames') && !draft) {
  await fs.rm(framesDir, { recursive: true, force: true });
}

const { stdout: size } = await run('du', ['-h', mp4]);
console.log(`\n\x1b[32mDone\x1b[0m  ${mp4}  (${size.trim().split(/\s+/)[0]})`);
console.log(`      subtitles  ${path.join(outDir, slug + '.srt')}`);
console.log(`      thumbnail  ${thumb}`);
console.log(`      project    ${path.join(outDir, slug + '.geomotion.json')}  ← open this in the editor to tweak by hand`);

function fmt(s) {
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m${String(Math.round(s % 60)).padStart(2, '0')}s`;
}
