import { describe, expect, it } from 'vitest';
import type { AudioCue, Project } from './types.ts';
import { emptyProject } from './project.ts';
import { isRetimable, planAudio } from './audio.ts';

/**
 * Behavioural spec for the narration plan (docs/AUDIT.md D10).
 *
 * The property that matters is the one that was broken: if the document knows
 * where each line goes and what it sounds like, a render must mix from *those*
 * positions rather than reusing a bed frozen when the script was composed.
 *
 * The second property matters just as much — a document that cannot be re-mixed
 * must fall back to the bed rather than silently dropping the lines it cannot
 * place. Out of step is bad; missing narration is worse.
 */

const cue = (t: number, text: string, file?: string): AudioCue => ({ t, d: 2, text, ...(file ? { file } : {}) });

function withAudio(cues: AudioCue[], bed?: { url: string; file?: string }): Project {
  return {
    ...emptyProject(),
    duration: 60,
    audio: { url: bed?.url ?? '/voice/track.wav', ...(bed?.file ? { file: bed.file } : {}), cues },
  };
}

describe('planAudio', () => {
  it('is silent with no audio block', () => {
    expect(planAudio(emptyProject())).toEqual({ kind: 'silent' });
  });

  it('re-mixes when every cue carries its own audio', () => {
    const plan = planAudio(withAudio([cue(0, 'one', '/v/1.wav'), cue(5, 'two', '/v/2.wav')]));
    expect(plan).toEqual({
      kind: 'remix',
      clips: [
        { file: '/v/1.wav', start: 0 },
        { file: '/v/2.wav', start: 5 },
      ],
      duration: 60,
    });
  });

  it('re-mixes from the cue positions, so retiming is honoured', () => {
    // The whole point: move a cue, and the mix follows.
    const moved = planAudio(withAudio([cue(12.5, 'one', '/v/1.wav')]));
    expect(moved.kind === 'remix' && moved.clips[0]!.start).toBe(12.5);
  });

  it('orders clips by time regardless of how they sit in the file', () => {
    const plan = planAudio(withAudio([cue(9, 'c', '/v/c.wav'), cue(1, 'a', '/v/a.wav'), cue(4, 'b', '/v/b.wav')]));
    expect(plan.kind === 'remix' && plan.clips.map((c) => c.start)).toEqual([1, 4, 9]);
  });

  it('falls back to the bed when the per-line audio was never kept', () => {
    // Pre-D10 documents. They still render; they just cannot be retimed.
    const plan = planAudio(withAudio([cue(0, 'one'), cue(5, 'two')], { url: '/v/t.wav', file: '/abs/t.wav' }));
    expect(plan.kind).toBe('bed');
    expect(plan.kind === 'bed' && plan.file).toBe('/abs/t.wav');
    expect(plan.kind === 'bed' && plan.reason).toMatch(/2 of 2/);
  });

  it('does not partially re-mix, which would drop lines silently', () => {
    // Half a narration track is a worse failure than one that is out of step,
    // because nothing about the output says a line went missing.
    const plan = planAudio(
      withAudio([cue(0, 'one', '/v/1.wav'), cue(5, 'two')], { url: '/v/t.wav', file: '/abs/t.wav' }),
    );
    expect(plan.kind).toBe('bed');
    expect(plan.kind === 'bed' && plan.reason).toMatch(/1 of 2/);
  });

  it('is silent when there is neither usable cue audio nor a bed', () => {
    expect(planAudio(withAudio([cue(0, 'one')])).kind).toBe('silent');
  });

  it('uses the bed when there are no cues at all', () => {
    const plan = planAudio(withAudio([], { url: '/v/t.wav', file: '/abs/t.wav' }));
    expect(plan.kind).toBe('bed');
    expect(plan.kind === 'bed' && plan.reason).toMatch(/no cues/);
  });

  it('rejects a cue with a nonsensical position rather than mixing it at zero', () => {
    for (const t of [Number.NaN, -1, Number.POSITIVE_INFINITY]) {
      const plan = planAudio(withAudio([cue(t, 'bad', '/v/1.wav')], { url: '/v/t.wav', file: '/abs/t.wav' }));
      expect(plan.kind, `t=${t}`).toBe('bed');
    }
  });

  it('ignores an empty file string, which is not a path', () => {
    const plan = planAudio(withAudio([cue(0, 'one', '')], { url: '/v/t.wav', file: '/abs/t.wav' }));
    expect(plan.kind).toBe('bed');
  });
});

describe('isRetimable', () => {
  it('is true only when the narration will follow the timeline', () => {
    expect(isRetimable(withAudio([cue(0, 'one', '/v/1.wav')]))).toBe(true);
    expect(isRetimable(withAudio([cue(0, 'one')], { url: '/v/t.wav', file: '/abs/t.wav' }))).toBe(false);
    expect(isRetimable(emptyProject())).toBe(false);
  });
});
