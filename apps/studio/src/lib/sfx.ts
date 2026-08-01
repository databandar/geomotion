import type { AudioCue } from '@geomotion/document';
import { cueFromFile } from './audio-import';

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
 * not have (§06 behaviours). Inventing one here to carry eighteen ogg files would be building
 * the wrong thing first. These are placed on the timeline by hand, like every other clip, and
 * when behaviours arrive they can trigger these same sounds without any of this changing.
 *
 * Licensing: see `public/sfx/KENNEY-LICENSE.txt` and docs/features/sound-library.md. Every
 * sound here is CC0 — the pack ships its own licence text, and the three transitions were
 * synthesised for this repo.
 */

export type SfxGroup = 'Accents' | 'Interface' | 'Panels' | 'Transitions';

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
 * Eighteen sounds, chosen for jobs that actually come up in a map video.
 *
 * Small on purpose. A hundred sounds is a worse library than fifteen if you have to audition
 * all hundred to find the click; the Kenney pack has six clicks and this takes one.
 */
export const SFX_LIBRARY: readonly SfxEntry[] = [
  // Short, bright, land on a single frame.
  { id: 'click', label: 'Click', hint: 'a region is selected', group: 'Interface' },
  { id: 'tick', label: 'Tick', hint: 'a counter steps', group: 'Interface' },
  { id: 'select', label: 'Select', hint: 'a marker is picked out', group: 'Interface' },
  { id: 'toggle', label: 'Toggle', hint: 'a layer comes on', group: 'Interface' },
  { id: 'switch', label: 'Switch', hint: 'the view changes mode', group: 'Interface' },

  // Musical, for a moment that means something.
  { id: 'bong', label: 'Bong', hint: 'a marker arrives', group: 'Accents' },
  { id: 'pluck', label: 'Pluck', hint: 'a label appears', group: 'Accents' },
  { id: 'chime', label: 'Chime', hint: 'a number lands', group: 'Accents' },
  { id: 'confirm', label: 'Confirm', hint: 'a total is revealed', group: 'Accents' },
  { id: 'drop', label: 'Drop', hint: 'something falls into place', group: 'Accents' },
  { id: 'alert', label: 'Alert', hint: 'a warning beat', group: 'Accents' },

  // Things opening and closing.
  { id: 'card-in', label: 'Card in', hint: 'a card opens', group: 'Panels' },
  { id: 'card-out', label: 'Card out', hint: 'a card closes', group: 'Panels' },
  { id: 'zoom-in', label: 'Zoom in', hint: 'the camera pushes in', group: 'Panels' },
  { id: 'zoom-out', label: 'Zoom out', hint: 'the camera pulls back', group: 'Panels' },

  // Longer, and meant to sit under a move rather than mark an instant.
  { id: 'hush', label: 'Hush', hint: 'a layer clears and the frame settles', group: 'Transitions' },
  { id: 'whoosh', label: 'Whoosh', hint: 'the camera flies past', group: 'Transitions' },
  { id: 'rise', label: 'Rise', hint: 'a build into a reveal', group: 'Transitions' },
];

export const SFX_GROUPS: readonly SfxGroup[] = ['Interface', 'Accents', 'Panels', 'Transitions'];

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
