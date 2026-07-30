import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { muxEncoded } from './encode.mjs';

/**
 * Integration spec for muxing an in-page-encoded stream.
 *
 * This one has to run ffmpeg. The bug it guards cannot be caught any other way:
 * `-shortest` alongside `-c:v copy` produces a file with **no audio stream**, while
 * ffmpeg reports the mapping in its log and exits 0. Nothing short of inspecting the
 * output notices, and the frame-based path is immune because libx264 paces the video
 * while it encodes — so the trap only appears on the fast path.
 */

const run = promisify(execFile);

/**
 * Checked at module scope, not in `beforeAll`.
 *
 * `describe.runIf` takes a boolean and evaluates it while collecting, so a flag set
 * later is always still `true` — the suite would run and fail on a machine without
 * ffmpeg rather than skipping. Top-level await gets the answer in time.
 */
const available = await run('ffmpeg', ['-version']).then(
  () => true,
  () => false,
);

let dir;
let video;
let audio;

beforeAll(async () => {
  if (!available) return;
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gm-encode-'));
  video = path.join(dir, 'v.h264');
  audio = path.join(dir, 'a.wav');
  // Three seconds of video, and deliberately longer audio: the mismatch is what
  // `-shortest` used to resolve by throwing the audio away.
  await run('ffmpeg', [
    '-y', '-v', 'error',
    '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=15:duration=3',
    '-c:v', 'libx264', '-bsf:v', 'h264_mp4toannexb', '-f', 'h264', video,
  ]);
  await run('ffmpeg', ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-ar', '48000', audio]);
}, 120000);

afterAll(async () => {
  if (dir) await fs.rm(dir, { recursive: true, force: true });
});

async function streamsOf(file) {
  const { stdout } = await run('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_type', '-of', 'csv=p=0', file,
  ]);
  return stdout.trim().split('\n').filter(Boolean);
}

describe.runIf(available)('muxEncoded', () => {
  it('keeps the audio stream when the video is stream-copied', async () => {
    const out = path.join(dir, 'with-audio.mp4');
    await muxEncoded({ videoFile: video, fps: 15, duration: 3, audio, out });
    expect(await streamsOf(out)).toEqual(['video', 'audio']);
  }, 120000);

  it('bounds the file by the stated duration rather than the longest input', async () => {
    const out = path.join(dir, 'bounded.mp4');
    await muxEncoded({ videoFile: video, fps: 15, duration: 3, audio, out });
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out,
    ]);
    // The audio is 10s; the composition is 3s.
    expect(Number(stdout.trim())).toBeCloseTo(3, 1);
  }, 120000);

  it('does not re-encode the video', async () => {
    // The point of the fast path: transcoding here would hand back the time the
    // in-page encoder saved.
    const out = path.join(dir, 'copied.mp4');
    await muxEncoded({ videoFile: video, fps: 15, duration: 3, audio, out });
    const { stdout } = await run('ffprobe', [
      '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', out,
    ]);
    expect(stdout.trim()).toBe('h264');
  }, 120000);

  it('produces a video-only file when there is no audio', async () => {
    const out = path.join(dir, 'silent.mp4');
    await muxEncoded({ videoFile: video, fps: 15, duration: 3, out });
    expect(await streamsOf(out)).toEqual(['video']);
  }, 120000);
});
