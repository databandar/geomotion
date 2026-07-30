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

/** What the renderer should do about narration. */
export type AudioPlan =
  | { kind: 'silent' }
  /** Re-mix these lines at these positions. */
  | { kind: 'remix'; clips: { file: string; start: number }[]; duration: number }
  /** Use the pre-mixed bed as-is; the document cannot be re-mixed. */
  | { kind: 'bed'; file: string; reason: string };

/** A cue that can be re-mixed: it knows its own audio and where it belongs. */
function isRemixable(cue: AudioCue): cue is AudioCue & { file: string } {
  return typeof cue.file === 'string' && cue.file.length > 0 && Number.isFinite(cue.t) && cue.t >= 0;
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
  const remixable = cues.filter(isRemixable);

  if (cues.length > 0 && remixable.length === cues.length) {
    return {
      kind: 'remix',
      // Sorted so the mix is deterministic regardless of cue order in the file.
      clips: remixable
        .map((c) => ({ file: c.file, start: c.t }))
        .sort((a, b) => a.start - b.start || a.file.localeCompare(b.file)),
      duration: project.duration,
    };
  }

  if (audio.file) {
    const reason =
      cues.length === 0
        ? 'no cues in the document'
        : `${cues.length - remixable.length} of ${cues.length} cues have no per-line audio`;
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

/** One line, ready to hand to an audio clock. */
export interface ScheduledCue {
  url: string;
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

    if (cue.t >= time) {
      out.push({ url: cue.url, when: cue.t - time, offset: 0, duration: cue.d });
    } else {
      const offset = time - cue.t;
      out.push({ url: cue.url, when: 0, offset, duration: cue.d - offset });
    }
  }
  return out.sort((a, b) => a.when - b.when);
}

/** Whether the editor can play the lines individually rather than the mixed bed. */
export const canPlayPerCue = (project: Project) =>
  (project.audio?.cues ?? []).some((c) => c.url) &&
  (project.audio?.cues ?? []).every((c) => c.url || !(c.d > 0));
