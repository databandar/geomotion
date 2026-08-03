import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import { sfxCue, sfxLibrary } from './sfx.mjs';

/**
 * Real ffprobe calls against the real files in `apps/studio/public/sfx/`, not
 * mocked — this is fast and fully local (no network, no TTS server), so there is
 * no reason to fake it the way `narrateSchedule` fakes nothing either.
 */
describe('sfxLibrary', () => {
  it('lists both the original Kenney/synthesised sounds and the new World group', async () => {
    const lib = await sfxLibrary();
    const ids = lib.map((e) => e.id);
    expect(ids).toContain('click');
    expect(ids).toContain('ocean-waves');
    expect(ids).toContain('foghorn');
    expect(lib.find((e) => e.id === 'ocean-waves')?.group).toBe('World');
  });
});

describe('sfxCue', () => {
  it('builds an AudioCue with a real measured duration and file path', async () => {
    const cue = await sfxCue('click', 5);
    expect(cue.t).toBe(5);
    expect(cue.role).toBe('sfx');
    expect(cue.gain).toBe(0.7);
    expect(cue.text).toBe('Click');
    expect(cue.d).toBeGreaterThan(0);
    expect(cue.file).toMatch(/click\.ogg$/);
    await expect(fs.access(cue.file)).resolves.toBeUndefined();
  });

  it('measures a real duration for one of the new World sounds', async () => {
    const cue = await sfxCue('ocean-waves', 0);
    expect(cue.d).toBeGreaterThan(4); // synthesised at 6s, faded
    expect(cue.d).toBeLessThan(7);
  });

  it('honours an explicit gain and fade', async () => {
    const cue = await sfxCue('foghorn', 2.5, { gain: 0.5, fadeIn: 0.3, fadeOut: 1 });
    expect(cue.gain).toBe(0.5);
    expect(cue.fadeIn).toBe(0.3);
    expect(cue.fadeOut).toBe(1);
  });

  it('leaves fadeIn/fadeOut unset when not given, rather than defaulting to 0', async () => {
    const cue = await sfxCue('click', 0);
    expect(cue).not.toHaveProperty('fadeIn');
    expect(cue).not.toHaveProperty('fadeOut');
  });

  it('rejects an unknown sound with the list of what is available', async () => {
    await expect(sfxCue('kaboom', 0)).rejects.toThrow(/unknown sfx "kaboom".*click/s);
  });

  it('clamps a negative "at" to 0, like the rest of the pipeline', async () => {
    const cue = await sfxCue('click', -3);
    expect(cue.t).toBe(0);
  });
});
