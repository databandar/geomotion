import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Turning a plan's clip sources into files ffmpeg can read.
 *
 * A clip's source is either a path — narration the pipeline synthesised — or a
 * `data:` URL, which is what audio imported in the editor looks like. The mixer takes
 * files, so the embedded ones are written out first.
 *
 * Kept separate from the mixing so the decision "can this be read at all" stays in
 * `planAudio` (pure, tested) and the filesystem work stays here.
 */

const EXTENSIONS = {
  'audio/wav': '.wav',
  'audio/x-wav': '.wav',
  'audio/wave': '.wav',
  'audio/mpeg': '.mp3',
  'audio/mp3': '.mp3',
  'audio/mp4': '.m4a',
  'audio/aac': '.aac',
  'audio/ogg': '.ogg',
  'audio/webm': '.webm',
  'audio/flac': '.flac',
};

/** ffmpeg sniffs the container anyway; the extension is for legibility on disk. */
function extensionFor(mime) {
  return EXTENSIONS[mime] ?? '.bin';
}

function parseDataUrl(url) {
  const comma = url.indexOf(',');
  if (comma < 0) return null;
  const header = url.slice(5, comma); // after "data:"
  if (!header.endsWith(';base64')) return null; // only base64 payloads
  return {
    mime: header.slice(0, -';base64'.length) || 'application/octet-stream',
    bytes: Buffer.from(url.slice(comma + 1), 'base64'),
  };
}

/**
 * Resolve every clip source to a readable file path.
 *
 * Embedded clips are written into `dir`. A clip that cannot be resolved is dropped
 * and named in `missing` rather than silently skipped — a mix that is quietly short a
 * track is worse than one that reports it.
 */
export async function materialiseClips(clips, dir) {
  const resolved = [];
  const missing = [];
  let embedded = 0;

  for (const [i, clip] of clips.entries()) {
    if (!clip.source.startsWith('data:')) {
      try {
        await fs.access(clip.source);
        resolved.push({ ...clip, file: clip.source });
      } catch {
        missing.push(clip.source);
      }
      continue;
    }

    const parsed = parseDataUrl(clip.source);
    if (!parsed || parsed.bytes.length === 0) {
      missing.push(`embedded clip ${i + 1}`);
      continue;
    }
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `embedded-${String(i).padStart(3, '0')}${extensionFor(parsed.mime)}`);
    await fs.writeFile(file, parsed.bytes);
    resolved.push({ ...clip, file });
    embedded++;
  }

  return { clips: resolved, missing, embedded };
}
