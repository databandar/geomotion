import type { AudioCue } from '@geomotion/document';
import { cueFromFile } from './audio-import';
import sfxLibraryData from './sfx-library.json';

/**
 * The built-in sound library.
 *
 * **A library sound is an ordinary audio cue.** Picking one fetches the file and hands it to
 * `cueFromFile`, exactly as if it had been dragged in — so it is measured, embedded, rippled,
 * re-timed and mixed by the code that already does all of that. Nothing downstream knows a
 * sound came from the library, and a project that used one still opens on a machine that has
 * never seen this app's assets.
 *
 * **What it deliberately is not.** It is not "a click plays when a state is selected". That
 * is a sound triggered by something happening, which needs an event model the document does
 * not have (§06 behaviours). Inventing one here to carry two dozen ogg files would be building
 * the wrong thing first. These are placed on the timeline by hand, like every other clip, and
 * when behaviours arrive they can trigger these same sounds without any of this changing.
 *
 * Licensing: see `public/sfx/KENNEY-LICENSE.txt` and docs/features/sound-library.md. Every
 * sound here is CC0 — the pack ships its own licence text, and the World group plus the three
 * transitions were synthesised for this repo (`apps/studio/scripts/synth-sfx.sh`).
 */

export type SfxGroup = 'Accents' | 'Interface' | 'Panels' | 'Transitions' | 'World';

export interface SfxEntry {
  /** Also the file name: `public/sfx/{id}.ogg`. */
  id: string;
  /** What the timeline chip will say. */
  label: string;
  /** The job it does, in the picker. Written as a moment in a map video, not as a waveform. */
  hint: string;
  group: SfxGroup;
}

/**
 * Twenty-four sounds, chosen for jobs that actually come up in a map video.
 *
 * Small on purpose. A hundred sounds is a worse library than fifteen if you have to audition
 * all hundred to find the click; the Kenney pack has six clicks and this takes one.
 *
 * The list itself lives in `sfx-library.json`, not here, so `apps/pipeline` (plain .mjs, no
 * bundler) can read the same entries a build script needs to place a library sound by name —
 * see `apps/pipeline/lib/sfx.mjs`. This module adds the browser-only parts: fetching a file
 * and turning it into a cue.
 */
export const SFX_LIBRARY: readonly SfxEntry[] = sfxLibraryData as SfxEntry[];

export const SFX_GROUPS: readonly SfxGroup[] = ['Interface', 'Accents', 'Panels', 'Transitions', 'World'];

/**
 * Where a library sound is served from.
 *
 * Through `BASE_URL` rather than a bare `/sfx/…` so the app still finds its own sounds when
 * it is deployed under a sub-path.
 */
export function sfxUrl(id: string): string {
  return `${import.meta.env.BASE_URL}sfx/${id}.ogg`;
}

/**
 * The level a library sound starts at.
 *
 * The files are peak-normalised to about −1 dBFS, which is right for a library — you can hear
 * what you are picking — and too loud sitting next to narration. Starting under lets a sound
 * be added without immediately having to fix it, and it is an ordinary cue gain, so the
 * Inspector changes it like any other.
 */
export const SFX_GAIN = 0.7;

export class SfxError extends Error {}

/**
 * Fetch a library sound and turn it into a cue at `at`.
 *
 * The label rather than the file name becomes the cue's text, because "Card in" reads better
 * on a timeline chip than "card-in", and that string is also what subtitles would show.
 */
export async function cueFromLibrary(entry: SfxEntry, at: number): Promise<Omit<AudioCue, 'id'>> {
  let bytes: Blob;
  try {
    const res = await fetch(sfxUrl(entry.id));
    if (!res.ok) throw new SfxError(`${entry.label} could not be loaded (${res.status})`);
    bytes = await res.blob();
  } catch (err) {
    if (err instanceof SfxError) throw err;
    throw new SfxError(`${entry.label} could not be loaded`);
  }

  const file = new File([bytes], `${entry.id}.ogg`, { type: 'audio/ogg' });
  const cue = await cueFromFile(file, at);
  return { ...cue, text: entry.label, role: 'sfx', gain: SFX_GAIN };
}
