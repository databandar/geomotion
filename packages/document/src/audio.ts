import type { AudioCue, Project, ProjectAudio } from './types.ts';

/**
 * Deciding how a composition's narration reaches the renderer.
 *
 * The bug this closes (docs/AUDIT.md D10): the voice bed was mixed once, when the
 * script was composed, and the per-line audio was discarded. Everything after that
 * — retiming a layer, giving a stop longer to breathe, trimming the intro — moved
 * the picture and left the voice where it was, permanently, with no way back short
 * of regenerating the video from the script.
 *
 * The mix itself was always position-driven (each line is delayed to its cue and
 * summed). All that was missing was keeping the positions, and each line's audio,
 * in the document.
 */

/**
 * One clip to place in the mix.
 *
 * `source` is either a filesystem path or a self-contained `data:` URL. Both are
 * things a renderer can resolve without a network or a server; a served URL like
 * `/voice-out/x.wav` is not, which is why it does not qualify below.
 */
export interface RemixClip {
  source: string;
  start: number;
  /** Clip length, which a fade-out has to be measured back from. */
  duration: number;
  /** Level and fades, already clamped — see `envelopeOf`. */
  gain: number;
  fadeIn: number;
  fadeOut: number;
  /** The full gain curve in clip time, including any ducking. */
  curve: GainPoint[];
}

/** What the renderer should do about narration. */
export type AudioPlan =
  | { kind: 'silent' }
  /** Re-mix these clips at these positions. */
  | { kind: 'remix'; clips: RemixClip[]; duration: number }
  /** Use the pre-mixed bed as-is; the document cannot be re-mixed. */
  | { kind: 'bed'; file: string; reason: string };

/**
 * Where a cue's audio can be read from by a renderer, or undefined if nowhere.
 *
 * A path works, and so does an embedded `data:` URL — audio imported in the editor
 * has only the latter, and refusing it would mean a CLI render silently dropping
 * everything the user added by hand. A served URL is deliberately excluded: the
 * renderer has no server to ask.
 */
function remixSource(cue: AudioCue): string | undefined {
  if (!Number.isFinite(cue.t) || cue.t < 0) return undefined;
  if (cue.file) return cue.file;
  if (cue.url?.startsWith('data:')) return cue.url;
  return undefined;
}

/**
 * Work out how to produce the narration track for a render.
 *
 * Re-mixing is preferred whenever every cue carries its own audio, because that is
 * the only path that honours edits made after the script was composed. A document
 * with *some* cues missing audio is not partially re-mixed — that would silently
 * drop the lines it cannot place, which is worse than being out of step.
 */
export function planAudio(project: Project): AudioPlan {
  const audio: ProjectAudio | undefined = project.audio;
  if (!audio) return { kind: 'silent' };

  const cues = audio.cues ?? [];
  const sources = cues.map((c) => ({ cue: c, source: remixSource(c) }));
  const remixable = sources.filter((s): s is { cue: AudioCue; source: string } => !!s.source);

  if (cues.length > 0 && remixable.length === cues.length) {
    return {
      kind: 'remix',
      // Sorted so the mix is deterministic regardless of cue order in the file.
      clips: remixable
        .map(({ cue, source }) => ({
          source,
          start: cue.t,
          duration: cue.d,
          ...envelopeOf(cue),
          curve: gainCurve(cue, cues),
        }))
        .sort((a, b) => a.start - b.start || a.source.localeCompare(b.source)),
      duration: project.duration,
    };
  }

  if (audio.file) {
    const reason =
      cues.length === 0
        ? 'no cues in the document'
        : `${cues.length - remixable.length} of ${cues.length} cues have no usable audio`;
    return { kind: 'bed', file: audio.file, reason };
  }

  return { kind: 'silent' };
}

/**
 * Whether the narration will follow the timeline if it is edited.
 *
 * Surfaced so the editor can say so rather than letting someone retime a
 * composition and discover the problem in the finished video.
 */
export const isRetimable = (project: Project) => planAudio(project).kind === 'remix';

/** How loud a clip plays, and how it enters and leaves. */
export interface ClipEnvelope {
  gain: number;
  fadeIn: number;
  fadeOut: number;
}

/** Louder than this is distortion rather than emphasis. */
const MAX_GAIN = 4;

/**
 * The envelope for a clip, with every value clamped to something playable.
 *
 * Clamping belongs here rather than in each mixer because there are three of them —
 * the editor's preview, the editor's export, and ffmpeg — and a value one accepts and
 * another rejects is a bug that only shows up in the finished file. Fades are also
 * capped so they cannot overlap: two ramps crossing in the middle of a short clip
 * would duck it to nothing in the middle, which reads as a dropout.
 */
export function envelopeOf(cue: Pick<AudioCue, 'd' | 'gain' | 'fadeIn' | 'fadeOut'>): ClipEnvelope {
  const clamp = (v: number | undefined, hi: number) =>
    !Number.isFinite(v ?? NaN) || (v as number) < 0 ? 0 : Math.min(v as number, hi);

  const gain = cue.gain === undefined || !Number.isFinite(cue.gain) ? 1 : Math.min(Math.max(cue.gain, 0), MAX_GAIN);
  const length = Number.isFinite(cue.d) && cue.d > 0 ? cue.d : 0;
  let fadeIn = clamp(cue.fadeIn, length);
  let fadeOut = clamp(cue.fadeOut, length);
  if (fadeIn + fadeOut > length) {
    // Share the clip between them rather than letting them cross.
    const scale = length / (fadeIn + fadeOut);
    fadeIn *= scale;
    fadeOut *= scale;
  }
  return { gain, fadeIn, fadeOut };
}

/** A point on a clip's gain curve, in seconds from the start of that clip. */
export interface GainPoint {
  t: number;
  gain: number;
}

/** Defaults for a music clip that has not said otherwise. */
const DUCK_TO = 0.25;
const DUCK_FADE = 0.3;

/**
 * The gain curve for a clip: its own fades, plus ducking under anything speaking.
 *
 * Returned as points with straight lines between them, because that is the one shape
 * all three mixers can follow exactly — Web Audio ramps to it, and ffmpeg's `volume`
 * takes an expression built from it. Anything smarter would sound different in the
 * preview than in the file.
 *
 * Only `music` clips duck, and only under clips that are not music: two beds do not
 * fight each other, and narration is never pushed down by a bed.
 */
export function gainCurve(cue: AudioCue, others: AudioCue[] = []): GainPoint[] {
  const { gain, fadeIn, fadeOut } = envelopeOf(cue);
  const length = Number.isFinite(cue.d) && cue.d > 0 ? cue.d : 0;
  const points: GainPoint[] = [];
  const add = (t: number, g: number) => points.push({ t: Math.max(0, Math.min(length, t)), gain: g });

  if (length === 0) return [{ t: 0, gain }];

  // The clip's own shape first.
  add(0, fadeIn > 0 ? 0 : gain);
  if (fadeIn > 0) add(fadeIn, gain);
  if (fadeOut > 0) add(length - fadeOut, gain);
  add(length, fadeOut > 0 ? 0 : gain);

  if (cue.role !== 'music') return points;

  const floor = clampUnit(cue.duck, DUCK_TO) * gain;
  const ramp = Math.max(0.01, cue.duckFade === undefined ? DUCK_FADE : Math.max(0, cue.duckFade));

  for (const other of others) {
    if (other === cue || other.id === cue.id || other.role === 'music') continue;
    if (!(other.d > 0)) continue;

    // In this clip's own time.
    const from = other.t - cue.t;
    const to = from + other.d;
    if (to <= 0 || from >= length) continue;

    add(from - ramp, gain);
    add(from, floor);
    add(to, floor);
    add(to + ramp, gain);
  }

  points.sort((a, b) => a.t - b.t);

  // Where the clip's own fade and a duck disagree, the quieter one wins: a fade-out
  // that has already brought the bed down should not be pushed back up by a duck
  // ending. Collapsing duplicates keeps the curve single-valued.
  const merged: GainPoint[] = [];
  for (const p of points) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.t - p.t) < 1e-6) last.gain = Math.min(last.gain, p.gain);
    else merged.push({ ...p });
  }
  return merged;
}

const clampUnit = (v: number | undefined, fallback: number) =>
  v === undefined || !Number.isFinite(v) ? fallback : Math.min(Math.max(v, 0), 1);

/** One line, ready to hand to an audio clock. */
export interface ScheduledCue {
  url: string;
  /** Level and fades for this clip, clamped. */
  envelope: ClipEnvelope;
  /** The full gain curve in clip time, including any ducking. */
  curve: GainPoint[];
  /** seconds from now until it should start; 0 means immediately */
  when: number;
  /** seconds into the clip to begin at, for a line already underway */
  offset: number;
  /** how much of the clip is left to play */
  duration: number;
}

/**
 * What to play, and when, if playback starts at `time`.
 *
 * Pure, because this is where the mistakes are: a line the playhead has landed in
 * the middle of has to start immediately *and* skip into itself by the same amount,
 * and getting either half wrong sounds like a sync bug rather than a maths one.
 *
 * Cues without a `url` are skipped — the renderer can mux from a path, a page
 * cannot fetch one.
 */
export function scheduleFrom(cues: AudioCue[], time: number): ScheduledCue[] {
  const out: ScheduledCue[] = [];
  for (const cue of cues) {
    if (!cue.url || !(cue.d > 0)) continue;
    const end = cue.t + cue.d;
    if (end <= time) continue; // already finished

    const envelope = envelopeOf(cue);
    const curve = gainCurve(cue, cues);
    if (cue.t >= time) {
      out.push({ url: cue.url, when: cue.t - time, offset: 0, duration: cue.d, envelope, curve });
    } else {
      const offset = time - cue.t;
      out.push({ url: cue.url, when: 0, offset, duration: cue.d - offset, envelope, curve });
    }
  }
  return out.sort((a, b) => a.when - b.when);
}

/** Whether the editor can play the lines individually rather than the mixed bed. */
export const canPlayPerCue = (project: Project) =>
  (project.audio?.cues ?? []).some((c) => c.url) &&
  (project.audio?.cues ?? []).every((c) => c.url || !(c.d > 0));
