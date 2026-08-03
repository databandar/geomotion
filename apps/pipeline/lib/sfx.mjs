import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { probeDuration } from './tts.mjs';

/**
 * Placing a library sound from a build script — the pipeline-side half of
 * `apps/studio/src/lib/sfx.ts`'s `cueFromLibrary`. Every route-style episode this
 * pipeline has produced (Four Doors, Malacca, Arctic, Dandi March) had narration
 * and nothing else in its audio; a hush under a clearing layer or a click on a
 * region reveal meant opening the editor by hand. This is the same library, the
 * same `role: 'sfx'` cue shape, callable from `build-project.mjs`.
 *
 * A cue this returns carries `file` (an absolute disk path), not `url` (a data
 * URL) — the distinction `AudioCue` itself documents: `file` is for the CLI
 * renderer, which has direct filesystem access and no page to fetch a data URL
 * into, exactly like every narration cue `tts.mjs` produces already.
 *
 * Metadata comes from `sfx-library.json`, the one file both this module and the
 * Studio editor's picker read, so a sound added to the library shows up in both
 * places without being named twice.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url)); // apps/pipeline/lib
const STUDIO = path.resolve(HERE, '../../studio');
const SFX_DIR = path.join(STUDIO, 'public/sfx');

const uid = () => Math.random().toString(36).slice(2, 10);
const round = (n) => Math.round(n * 1000) / 1000;

let cached = null;

/** The library's own entries — `{id, label, hint, group}` — for a script that
 * wants to list or validate what's available rather than guess a name. */
export async function sfxLibrary() {
  if (!cached) {
    const raw = await fs.readFile(path.join(STUDIO, 'src/lib/sfx-library.json'), 'utf8');
    cached = JSON.parse(raw);
  }
  return cached;
}

/**
 * A library sound as an `AudioCue`, positioned at `at`.
 *
 * `gain` defaults to 0.7, matching the Studio picker's own `SFX_GAIN` — the
 * files are peak-normalised to about -1 dBFS, right for auditioning and too
 * loud sitting next to narration. `fadeIn`/`fadeOut` are left unset unless
 * given: most of these sounds already carry their own fade in the file (see
 * `synth-sfx.sh`), and a UI click should land on the exact frame it was picked
 * for, not soften into it.
 */
export async function sfxCue(id, at, opts = {}) {
  const entry = (await sfxLibrary()).find((e) => e.id === id);
  if (!entry) {
    const known = (await sfxLibrary()).map((e) => e.id).join(', ');
    throw new Error(`unknown sfx "${id}". Available: ${known}`);
  }

  const file = path.join(SFX_DIR, `${id}.ogg`);
  const d = round(await probeDuration(file));

  return {
    id: uid(),
    t: Math.max(0, round(at)),
    d,
    text: entry.label,
    file,
    role: 'sfx',
    gain: opts.gain ?? 0.7,
    ...(opts.fadeIn !== undefined ? { fadeIn: opts.fadeIn } : {}),
    ...(opts.fadeOut !== undefined ? { fadeOut: opts.fadeOut } : {}),
  };
}
