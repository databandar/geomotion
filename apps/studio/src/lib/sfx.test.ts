import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { SFX_GROUPS, SFX_LIBRARY } from './sfx';

/**
 * The manifest and the files have to agree.
 *
 * This is the whole bug worth guarding against here. An id that does not match a file is a
 * 404 at the moment someone clicks the sound — not at build, not in the type checker, not in
 * any test that only reads the manifest. Fetching and decoding needs a browser, so the part
 * that can be checked on disk is checked on disk.
 */

const dir = fileURLToPath(new URL('../../public/sfx', import.meta.url));
const onDisk = readdirSync(dir)
  .filter((f) => f.endsWith('.ogg'))
  .map((f) => f.replace(/\.ogg$/, ''))
  .sort();

describe('the sound library manifest', () => {
  it('names a file that exists for every entry', () => {
    const missing = SFX_LIBRARY.filter((e) => !onDisk.includes(e.id)).map((e) => e.id);
    expect(missing).toEqual([]);
  });

  it('has an entry for every file, so nothing ships unreachable', () => {
    const ids = SFX_LIBRARY.map((e) => e.id);
    expect(onDisk.filter((f) => !ids.includes(f))).toEqual([]);
  });

  it('keeps ids unique — a duplicate would silently shadow a sound in the picker', () => {
    const ids = SFX_LIBRARY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('puts every entry in a group the picker renders', () => {
    // A typo'd group is an entry that exists, passes every other test, and is invisible.
    for (const e of SFX_LIBRARY) expect(SFX_GROUPS).toContain(e.group);
  });

  it('ships the licence next to the sounds it covers', () => {
    expect(readdirSync(dir)).toContain('KENNEY-LICENSE.txt');
  });

  it('describes each sound by what it is for', () => {
    for (const e of SFX_LIBRARY) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.hint.length).toBeGreaterThan(0);
    }
  });
});
