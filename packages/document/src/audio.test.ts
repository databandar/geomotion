import { describe, expect, it } from 'vitest';
import type { AudioCue, Project } from './types.ts';
import { emptyProject } from './project.ts';
import { canPlayPerCue, isRetimable, planAudio, scheduleFrom } from './audio.ts';

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

describe('scheduleFrom', () => {
  const withUrl = (t: number, d: number, url: string): AudioCue => ({ t, d, text: '', url });

  it('schedules future lines at their offset from now', () => {
    const cues = [withUrl(2, 3, '/a.wav'), withUrl(10, 2, '/b.wav')];
    expect(scheduleFrom(cues, 0)).toEqual([
      { url: '/a.wav', when: 2, offset: 0, duration: 3 },
      { url: '/b.wav', when: 10, offset: 0, duration: 2 },
    ]);
  });

  it('starts a line the playhead landed inside immediately, skipped into itself', () => {
    // The case that sounds like a sync bug when it is really an arithmetic one:
    // both halves have to move by the same amount.
    expect(scheduleFrom([withUrl(10, 4, '/a.wav')], 11.5)).toEqual([
      { url: '/a.wav', when: 0, offset: 1.5, duration: 2.5 },
    ]);
  });

  it('drops lines that already finished', () => {
    expect(scheduleFrom([withUrl(0, 2, '/a.wav')], 5)).toEqual([]);
  });

  it('treats a line ending exactly at the playhead as finished', () => {
    expect(scheduleFrom([withUrl(0, 2, '/a.wav')], 2)).toEqual([]);
  });

  it('plays a line starting exactly at the playhead from its beginning', () => {
    expect(scheduleFrom([withUrl(2, 1, '/a.wav')], 2)).toEqual([
      { url: '/a.wav', when: 0, offset: 0, duration: 1 },
    ]);
  });

  it('skips cues with no url, since a page cannot fetch a filesystem path', () => {
    const cues: AudioCue[] = [{ t: 0, d: 2, text: '', file: '/abs/a.wav' }, withUrl(3, 1, '/b.wav')];
    expect(scheduleFrom(cues, 0).map((c) => c.url)).toEqual(['/b.wav']);
  });

  it('skips zero and negative durations rather than scheduling a silent source', () => {
    expect(scheduleFrom([withUrl(1, 0, '/a.wav'), withUrl(2, -1, '/b.wav')], 0)).toEqual([]);
  });

  it('returns lines in the order they will be heard', () => {
    const cues = [withUrl(9, 1, '/c.wav'), withUrl(1, 1, '/a.wav'), withUrl(5, 1, '/b.wav')];
    expect(scheduleFrom(cues, 0).map((c) => c.url)).toEqual(['/a.wav', '/b.wav', '/c.wav']);
  });

  it('never schedules anything in the past', () => {
    for (const t of [0, 3.3, 7, 12]) {
      for (const s of scheduleFrom([withUrl(2, 3, '/a.wav'), withUrl(6, 2, '/b.wav')], t)) {
        expect(s.when, `t=${t}`).toBeGreaterThanOrEqual(0);
        expect(s.offset, `t=${t}`).toBeGreaterThanOrEqual(0);
        expect(s.duration, `t=${t}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('canPlayPerCue', () => {
  it('is true when the lines are individually fetchable', () => {
    expect(canPlayPerCue(withAudio([cue(0, 'a', '/v/1.wav')].map((c) => ({ ...c, url: '/v/1.wav' }))))).toBe(true);
  });

  it('is false for a document that only has the mixed bed', () => {
    expect(canPlayPerCue(withAudio([cue(0, 'a')], { url: '/v/t.wav', file: '/abs/t.wav' }))).toBe(false);
  });

  it('is false with no audio at all', () => {
    expect(canPlayPerCue(emptyProject())).toBe(false);
  });
});

describe('the two capabilities are independent', () => {
  /*
   * `file` and `url` serve different consumers and neither substitutes for the
   * other: the renderer muxes from a path, and a page cannot fetch one. So a
   * document can be previewable but not re-mixable, or the reverse — and a real
   * Studio composition is both, which is the case that matters.
   */
  const both: AudioCue = { t: 1, d: 2, text: 'hi', file: '/abs/1.wav', url: '/voice-out/s/1.wav' };

  it('a Studio composition is both re-mixable and previewable per line', () => {
    const p = withAudio([both]);
    expect(isRetimable(p)).toBe(true);
    expect(canPlayPerCue(p)).toBe(true);
  });

  it('url only: the preview follows the cues, the render cannot', () => {
    const p = withAudio([{ t: 1, d: 2, text: 'hi', url: '/voice-out/s/1.wav' }]);
    expect(canPlayPerCue(p)).toBe(true);
    expect(isRetimable(p)).toBe(false);
  });

  it('file only, as the CLI writes it: the render follows the cues, the preview cannot', () => {
    const p = withAudio([{ t: 1, d: 2, text: 'hi', file: '/abs/1.wav' }]);
    expect(isRetimable(p)).toBe(true);
    expect(canPlayPerCue(p)).toBe(false);
  });
});
