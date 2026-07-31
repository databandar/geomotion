import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAT_KINDS, collectLines, compose, prepareScript, validateScript } from './compose.mjs';

/**
 * Behavioural spec for script composition — the first tests this app has had
 * (docs/AUDIT.md debt D12).
 *
 * These guard the two defects that a full render surfaced, both of which passed
 * every other check because nothing here reads the finished frame:
 *
 * - D13: the credit line is the tile attribution. Drawn bare onto satellite
 *   imagery it collided with the basemap's own place labels and became
 *   unreadable, and illegible attribution does not satisfy the licence.
 * - D14: on-screen text is Latin; Hindi belongs in the audio. Both are authored
 *   in the same script file, so it is easy to fix one and forget the other.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPTS = path.join(HERE, '..', 'scripts');

const DEVANAGARI = /[ऀ-ॿ]/;

async function bundledScripts() {
  const names = (await fs.readdir(SCRIPTS)).filter((f) => f.endsWith('.json') && !f.startsWith('_'));
  return Promise.all(
    names.map(async (name) => [name, JSON.parse(await fs.readFile(path.join(SCRIPTS, name), 'utf8'))]),
  );
}

/** Every string in the script that ends up drawn into the frame. */
function onScreenStrings(script) {
  const out = [];
  const add = (where, v) => {
    if (typeof v === 'string' && v.length) out.push([where, v]);
  };
  add('title', script.title);
  add('credit', script.credit);
  add('metric.label', script.metric?.label);
  add('metric.legend', script.metric?.legend);
  for (const [i, beat] of (script.beats ?? []).entries()) {
    add(`beats[${i}].onScreen`, beat.onScreen);
    add(`beats[${i}].heading`, beat.heading);
    for (const [j, stop] of (beat.stops ?? []).entries()) {
      add(`beats[${i}].stops[${j}].onScreen`, stop.onScreen);
    }
  }
  return out;
}

describe('bundled scripts', () => {
  it('there are scripts to check', async () => {
    expect((await bundledScripts()).length).toBeGreaterThan(0);
  });

  it('on-screen text is Latin — Hindi lives in the audio', async () => {
    for (const [name, script] of await bundledScripts()) {
      for (const [where, value] of onScreenStrings(script)) {
        expect(DEVANAGARI.test(value), `${name} ${where}: ${value}`).toBe(false);
      }
    }
  });

  it('narration is still Hindi, so the rule above has not been over-applied', async () => {
    // Guards the opposite mistake: "translate the on-screen text" must not turn
    // into "translate the script".
    for (const [name, script] of await bundledScripts()) {
      const spoken = (script.beats ?? []).flatMap((b) => [b.say, ...(b.stops ?? []).map((s) => s.say)]);
      const hindi = spoken.filter((s) => typeof s === 'string' && DEVANAGARI.test(s));
      expect(hindi.length, `${name} has no Hindi narration left`).toBeGreaterThan(0);
    }
  });

  /**
   * Who each basemap obliges us to name.
   *
   * Mirrors the attribution strings in apps/studio/src/lib/basemaps.ts, which this
   * app cannot import across the boundary. Duplicated deliberately and narrowly:
   * a basemap added there without a row here fails the test below rather than
   * shipping unattributed.
   */
  const REQUIRED = {
    satellite: /Esri/,
    'satellite-labels': /Esri/,
    'terrain-raster': /Esri/,
    dark: /OpenStreetMap|OSM/,
    positron: /OpenStreetMap|OSM/,
    voyager: /OpenStreetMap|OSM/,
    liberty: /OpenStreetMap|OSM/,
    bright: /OpenStreetMap|OSM/,
    blank: null,
  };

  it('credits the providers its own basemap requires', async () => {
    // Not a blanket "must say OpenStreetMap": the satellite basemaps serve Esri
    // tiles and no OSM data, so crediting OSM there would be a false statement,
    // which is its own kind of licence problem.
    for (const [name, script] of await bundledScripts()) {
      const basemap = script.basemap ?? 'satellite-labels';
      expect(Object.keys(REQUIRED), `${name} uses unknown basemap "${basemap}"`).toContain(basemap);
      const needed = REQUIRED[basemap];
      if (!needed) continue;
      expect(script.credit, `${name} has no credit line`).toBeTruthy();
      expect(script.credit, `${name} credit omits the provider for "${basemap}"`).toMatch(needed);
    }
  });

  it('keeps the credit short enough to stay legible in frame', async () => {
    // The original ran to ~100 characters, right-aligned across the frame at
    // 15px. Length is the difference between a readable line and a smear.
    for (const [name, script] of await bundledScripts()) {
      expect(script.credit.length, `${name} credit is too long to read`).toBeLessThanOrEqual(80);
    }
  });
});

describe('compose', () => {
  /**
   * The landscape script, composed with plausible narration timings.
   *
   * `collectLines` is what assigns the `__key` each timing is looked up by — in
   * the real pipeline it runs so the lines can be sent to the voice engine, and
   * composing without it silently falls back to default beat lengths.
   */
  async function composed(name = 'anemia-india.json') {
    const script = JSON.parse(await fs.readFile(path.join(SCRIPTS, name), 'utf8'));
    const { script: prepared } = await prepareScript(script);
    const timings = new Map(collectLines(prepared).map((l) => [l.key, 2.5]));
    const { project } = await compose(prepared, timings);
    return project;
  }

  it('produces a project with a positive duration and layers', async () => {
    const project = await composed();
    expect(project.duration).toBeGreaterThan(0);
    expect(project.fps).toBeGreaterThan(0);
    expect(project.layers.length).toBeGreaterThan(0);
  });

  it('draws the attribution on a scrim so it stays readable over imagery', async () => {
    const project = await composed();
    const credit = project.layers.find((l) => l.name === 'Credit');
    expect(credit, 'no Credit layer').toBeTruthy();
    expect(credit.background, 'attribution has no scrim behind it').toBe(true);
    expect(credit.backgroundColor).toMatch(/rgba?\(/);
  });

  it('keeps the attribution on screen for the whole video', async () => {
    // Attribution that appears for three seconds does not satisfy the licence.
    const project = await composed();
    const credit = project.layers.find((l) => l.name === 'Credit');
    expect(credit.in).toBe(0);
    expect(credit.out).toBeGreaterThanOrEqual(project.duration - 0.01);
  });

  it('resolves every placeholder before anything is drawn or spoken', async () => {
    // A leftover {value} is read aloud verbatim and printed with braces.
    const script = JSON.parse(await fs.readFile(path.join(SCRIPTS, 'anemia-india.json'), 'utf8'));
    const { unresolved } = await prepareScript(script);
    expect(unresolved).toEqual([]);
  });

  it('matches every tour stop to a value in the dataset', async () => {
    const script = JSON.parse(await fs.readFile(path.join(SCRIPTS, 'anemia-india.json'), 'utf8'));
    const { missing } = await prepareScript(script);
    expect(missing).toEqual([]);
  });

  it('rejects an unknown values preset with a message naming the alternatives', async () => {
    await expect(prepareScript({ values: 'no-such-preset', beats: [] })).rejects.toThrow(
      /unknown values preset.*Available presets/s,
    );
  });
});

describe('validateScript', () => {
  const beats = (...b) => ({ beats: b });

  it('accepts every kind the composer can build', () => {
    for (const kind of BEAT_KINDS) {
      const beat = kind === 'tour' ? { kind, stops: [] } : { kind };
      expect(() => validateScript(beats(beat))).not.toThrow();
    }
  });

  it('rejects a beat with no kind, and says what the kinds are', () => {
    /*
     * The failure this exists for. A beat is looked up by `kind`, so one without it is
     * never found — and the composer built the project anyway and reported success at
     * every step. A script whose beats all lacked `kind` produced a 13-second video of
     * an empty map with a credit line, after paying for speech synthesis, a render and
     * an encode. The only hints were "1 layers" and `undefined` in the beat listing.
     */
    expect(() => validateScript(beats({ say: 'hello' }))).toThrow(/no "kind"/);
    expect(() => validateScript(beats({ say: 'hello' }))).toThrow(/clouds, hook, outline, overview, tour, labels/);
  });

  it('rejects a misspelt kind rather than silently skipping it', () => {
    expect(() => validateScript(beats({ kind: 'overveiw' }))).toThrow(/unknown kind "overveiw"/);
  });

  it('lists every bad beat at once, not just the first', () => {
    // Fixing them one render at a time is the slow way to find out.
    const e = (() => {
      try {
        validateScript(beats({ say: 'a' }, { kind: 'nope' }, { kind: 'tour', stops: [] }));
      } catch (err) {
        return String(err);
      }
    })();
    expect(e).toMatch(/beat 1/);
    expect(e).toMatch(/beat 2/);
  });

  it('rejects a tour with no stops array', () => {
    expect(() => validateScript(beats({ kind: 'tour' }))).toThrow(/"stops" array/);
  });

  it('rejects a script with no beats at all', () => {
    expect(() => validateScript({ beats: [] })).toThrow(/no beats/);
    expect(() => validateScript({})).toThrow(/no beats/);
  });

  it('numbers beats from one, as a person reading the file would', () => {
    expect(() => validateScript(beats({ kind: 'clouds' }, { say: 'x' }))).toThrow(/beat 2/);
  });
});
