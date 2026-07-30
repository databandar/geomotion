import type { AudioCue } from '@geomotion/document';

/**
 * Turning a file the user picked into a cue the document can hold.
 *
 * Two things have to happen before it can go on the timeline: the real duration has
 * to be measured, and the audio has to become something a saved project can carry.
 *
 * The duration comes from actually decoding the file. Reading it from metadata is
 * cheaper and wrong often enough to matter — a VBR mp3 will lie, and a cue whose `d`
 * disagrees with its audio makes every downstream length calculation wrong.
 *
 * The audio is embedded as a data URL. An object URL would be smaller and faster but
 * dies with the tab, which would mean a saved project quietly losing its sound.
 * ENGINEERING_GUIDE §1.8 wants documents fully serializable, and this is the honest
 * reading of it: the cost is size, and `AUDIO_WARN_BYTES` is where we say so.
 */

/** Above this, embedding is still allowed but worth warning about. */
export const AUDIO_WARN_BYTES = 4 * 1024 * 1024;

export class AudioImportError extends Error {}

const readAsArrayBuffer = (file: File) =>
  new Promise<ArrayBuffer>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as ArrayBuffer);
    r.onerror = () => reject(new AudioImportError(`could not read ${file.name}`));
    r.readAsArrayBuffer(file);
  });

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new AudioImportError(`could not read ${file.name}`));
    r.readAsDataURL(file);
  });

/**
 * Decode a picked file into a cue positioned at `at`.
 *
 * Throws rather than guessing: a file the browser cannot decode would otherwise
 * become a cue with a plausible-looking duration and no sound.
 */
export async function cueFromFile(file: File, at: number): Promise<Omit<AudioCue, 'id'>> {
  const ctx = new AudioContext();
  try {
    const bytes = await readAsArrayBuffer(file);
    let decoded;
    try {
      decoded = await ctx.decodeAudioData(bytes.slice(0));
    } catch {
      throw new AudioImportError(`${file.name} is not audio this browser can decode`);
    }
    if (!(decoded.duration > 0)) throw new AudioImportError(`${file.name} contains no audio`);

    return {
      t: Math.max(0, at),
      d: Math.round(decoded.duration * 1000) / 1000,
      // The file name is what the timeline chip shows, so keep it recognisable.
      text: file.name.replace(/\.[^.]+$/, ''),
      url: await readAsDataUrl(file),
    };
  } finally {
    void ctx.close();
  }
}

/** Roughly how much a document's embedded audio adds to its saved size. */
export function embeddedAudioBytes(cues: AudioCue[]): number {
  let total = 0;
  for (const c of cues) {
    if (!c.url?.startsWith('data:')) continue;
    const base64 = c.url.slice(c.url.indexOf(',') + 1);
    // 4 base64 characters per 3 bytes.
    total += Math.floor((base64.length * 3) / 4);
  }
  return total;
}
