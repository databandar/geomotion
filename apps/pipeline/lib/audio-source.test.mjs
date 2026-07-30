import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { materialiseClips } from './audio-source.mjs';

/**
 * Behavioural spec for resolving clip sources to files.
 *
 * The case that matters is audio imported in the editor: it exists only as a `data:`
 * URL inside the project, so without this a CLI render silently drops every clip the
 * user added by hand.
 */

const dirs = [];
async function tmp() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'gm-audio-'));
  dirs.push(d);
  return d;
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

/** A tiny but real base64 payload. */
const dataUrl = (mime = 'audio/wav') => `data:${mime};base64,${Buffer.from('riff-ish').toString('base64')}`;

describe('materialiseClips', () => {
  it('passes an existing path through untouched', async () => {
    const dir = await tmp();
    const existing = path.join(dir, 'line.wav');
    await fs.writeFile(existing, 'x');

    const out = await materialiseClips([{ source: existing, start: 2 }], path.join(dir, 'embedded'));
    // The envelope travels with the clip; only the resolved file is added.
    expect(out.clips).toEqual([{ source: existing, file: existing, start: 2 }]);
    expect(out.embedded).toBe(0);
    expect(out.missing).toEqual([]);
  });

  it('writes an embedded clip out and returns its path', async () => {
    const dir = await tmp();
    const out = await materialiseClips([{ source: dataUrl(), start: 4 }], path.join(dir, 'embedded'));

    expect(out.embedded).toBe(1);
    expect(out.clips).toHaveLength(1);
    expect(out.clips[0].start).toBe(4);
    await expect(fs.readFile(out.clips[0].file, 'utf8')).resolves.toBe('riff-ish');
  });

  it('names the file by its media type, for legibility on disk', async () => {
    const dir = await tmp();
    const mp3 = await materialiseClips([{ source: dataUrl('audio/mpeg'), start: 0 }], dir);
    expect(mp3.clips[0].file.endsWith('.mp3')).toBe(true);
    const unknown = await materialiseClips([{ source: dataUrl('audio/weird'), start: 0 }], dir);
    expect(unknown.clips[0].file.endsWith('.bin')).toBe(true);
  });

  it('keeps positions when mixing embedded and on-disk clips', async () => {
    const dir = await tmp();
    const existing = path.join(dir, 'line.wav');
    await fs.writeFile(existing, 'x');

    const out = await materialiseClips(
      [
        { source: existing, start: 1 },
        { source: dataUrl(), start: 7 },
      ],
      path.join(dir, 'embedded'),
    );
    expect(out.clips.map((c) => c.start)).toEqual([1, 7]);
    expect(out.embedded).toBe(1);
  });

  it('reports a path that is not there rather than dropping it quietly', async () => {
    // A mix that is silently short a track is worse than one that says so.
    const dir = await tmp();
    const out = await materialiseClips([{ source: path.join(dir, 'gone.wav'), start: 0 }], dir);
    expect(out.clips).toEqual([]);
    expect(out.missing).toHaveLength(1);
  });

  it('reports a malformed data URL', async () => {
    const dir = await tmp();
    const out = await materialiseClips(
      [
        { source: 'data:audio/wav,not-base64', start: 0 },
        { source: 'data:audio/wav;base64,', start: 1 },
      ],
      dir,
    );
    expect(out.clips).toEqual([]);
    expect(out.missing).toHaveLength(2);
  });

  it('creates the output directory only when something needs writing', async () => {
    const dir = await tmp();
    const target = path.join(dir, 'embedded');
    const existing = path.join(dir, 'line.wav');
    await fs.writeFile(existing, 'x');

    await materialiseClips([{ source: existing, start: 0 }], target);
    await expect(fs.access(target)).rejects.toThrow();
  });

  it('gives each embedded clip its own file', async () => {
    const dir = await tmp();
    const out = await materialiseClips(
      [
        { source: dataUrl(), start: 0 },
        { source: dataUrl(), start: 3 },
      ],
      dir,
    );
    expect(new Set(out.clips.map((c) => c.file)).size).toBe(2);
  });
});
