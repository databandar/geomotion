import { describe, expect, it } from 'vitest';
import type { AudioCue, Project } from './types.ts';
import { emptyProject } from './project.ts';
import { canPlayPerCue, envelopeOf, gainCurve, isRetimable, planAudio, scheduleFrom } from './audio.ts';

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

/** The curve of a plain clip with no fades and nothing over it. */
const flat = (d: number) => [
  { t: 0, gain: 1 },
  { t: d, gain: 1 },
];

const cue = (t: number, text: string, file?: string): AudioCue =>
  ({ id: `c-${t}-${text}`, t, d: 2, text, ...(file ? { file } : {}) });

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
        { source: '/v/1.wav', start: 0, duration: 2, gain: 1, fadeIn: 0, fadeOut: 0, curve: flat(2) },
        { source: '/v/2.wav', start: 5, duration: 2, gain: 1, fadeIn: 0, fadeOut: 0, curve: flat(2) },
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
  const withUrl = (t: number, d: number, url: string): AudioCue => ({ id: `u-${t}`, t, d, text: '', url });

  it('schedules future lines at their offset from now', () => {
    const cues = [withUrl(2, 3, '/a.wav'), withUrl(10, 2, '/b.wav')];
    expect(scheduleFrom(cues, 0)).toMatchObject([
      { url: '/a.wav', when: 2, offset: 0, duration: 3 },
      { url: '/b.wav', when: 10, offset: 0, duration: 2 },
    ]);
  });

  it('starts a line the playhead landed inside immediately, skipped into itself', () => {
    // The case that sounds like a sync bug when it is really an arithmetic one:
    // both halves have to move by the same amount.
    expect(scheduleFrom([withUrl(10, 4, '/a.wav')], 11.5)).toMatchObject([
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
    expect(scheduleFrom([withUrl(2, 1, '/a.wav')], 2)).toMatchObject([
      { url: '/a.wav', when: 0, offset: 0, duration: 1 },
    ]);
  });

  it('skips cues with no url, since a page cannot fetch a filesystem path', () => {
    const cues: AudioCue[] = [{ id: 'a', t: 0, d: 2, text: '', file: '/abs/a.wav' }, withUrl(3, 1, '/b.wav')];
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
  const both: AudioCue = { id: 'b1', t: 1, d: 2, text: 'hi', file: '/abs/1.wav', url: '/voice-out/s/1.wav' };

  it('a Studio composition is both re-mixable and previewable per line', () => {
    const p = withAudio([both]);
    expect(isRetimable(p)).toBe(true);
    expect(canPlayPerCue(p)).toBe(true);
  });

  it('url only: the preview follows the cues, the render cannot', () => {
    const p = withAudio([{ id: 'u1', t: 1, d: 2, text: 'hi', url: '/voice-out/s/1.wav' }]);
    expect(canPlayPerCue(p)).toBe(true);
    expect(isRetimable(p)).toBe(false);
  });

  it('file only, as the CLI writes it: the render follows the cues, the preview cannot', () => {
    const p = withAudio([{ id: 'f1', t: 1, d: 2, text: 'hi', file: '/abs/1.wav' }]);
    expect(isRetimable(p)).toBe(true);
    expect(canPlayPerCue(p)).toBe(false);
  });
});

describe('planAudio with audio imported in the editor', () => {
  const DATA = 'data:audio/wav;base64,AAAA';

  it('re-mixes embedded audio, which is all an imported clip has', () => {
    // Refusing a data URL would mean a CLI render silently dropping everything the
    // user added by hand in the editor.
    const p = withAudio([{ id: 'c1', t: 4, d: 2, text: 'music', url: DATA }]);
    expect(planAudio(p)).toMatchObject({ kind: 'remix', clips: [{ source: DATA, start: 4, gain: 1 }], duration: 60 });
  });

  it('mixes embedded and on-disk clips together', () => {
    const p = withAudio([
      { id: 'a', t: 0, d: 2, text: 'line', file: '/abs/1.wav' },
      { id: 'b', t: 5, d: 2, text: 'music', url: DATA },
    ]);
    const plan = planAudio(p);
    expect(plan.kind === 'remix' && plan.clips.map((c) => c.source)).toEqual(['/abs/1.wav', DATA]);
  });

  it('prefers the path when a cue has both', () => {
    // Narration has both; the path costs nothing to read and needs no decoding.
    const p = withAudio([{ id: 'a', t: 0, d: 2, text: 'x', file: '/abs/1.wav', url: DATA }]);
    expect(plan_source(planAudio(p))).toEqual(['/abs/1.wav']);
  });

  it('does not treat a served URL as something a renderer can read', () => {
    // The CLI has no server to ask for /voice-out/x.wav.
    const p = withAudio([{ id: 'a', t: 0, d: 2, text: 'x', url: '/voice-out/s/1.wav' }]);
    expect(planAudio(p).kind).toBe('silent');
  });

  function plan_source(plan: ReturnType<typeof planAudio>) {
    return plan.kind === 'remix' ? plan.clips.map((c) => c.source) : [];
  }
});

describe('envelopeOf', () => {
  const cue = (patch: Partial<AudioCue>) => envelopeOf({ d: 10, ...patch });

  it('defaults to full level and no fades', () => {
    expect(cue({})).toEqual({ gain: 1, fadeIn: 0, fadeOut: 0 });
  });

  it('passes sensible values through', () => {
    expect(cue({ gain: 0.3, fadeIn: 1, fadeOut: 2 })).toEqual({ gain: 0.3, fadeIn: 1, fadeOut: 2 });
  });

  it('clamps gain to something playable rather than distorting', () => {
    expect(cue({ gain: -1 }).gain).toBe(0);
    expect(cue({ gain: 99 }).gain).toBe(4);
    expect(cue({ gain: Number.NaN }).gain).toBe(1);
  });

  it('never lets a fade exceed the clip', () => {
    expect(cue({ d: 2, fadeIn: 5 }).fadeIn).toBe(2);
    expect(cue({ d: 2, fadeOut: 5 }).fadeOut).toBe(2);
  });

  it('shares a short clip between fades instead of letting them cross', () => {
    // Two ramps crossing mid-clip would duck it to nothing in the middle, which
    // sounds like a dropout rather than a fade.
    const e = cue({ d: 4, fadeIn: 3, fadeOut: 3 });
    expect(e.fadeIn + e.fadeOut).toBeCloseTo(4, 6);
    expect(e.fadeIn).toBeCloseTo(2, 6);
  });

  it('treats nonsense as no fade', () => {
    expect(cue({ fadeIn: -2 }).fadeIn).toBe(0);
    expect(cue({ fadeOut: Number.NaN }).fadeOut).toBe(0);
  });

  it('yields no fades for a clip with no length', () => {
    expect(envelopeOf({ d: 0, fadeIn: 1, fadeOut: 1 })).toEqual({ gain: 1, fadeIn: 0, fadeOut: 0 });
  });
});

describe('gainCurve', () => {
  const music = (patch: Partial<AudioCue> = {}): AudioCue =>
    ({ id: 'm', t: 0, d: 20, text: 'bed', role: 'music', url: '/m.wav', ...patch });
  const voice = (t: number, d: number, id = 'v'): AudioCue => ({ id, t, d, text: 'line', url: '/v.wav' });

  /** The curve's value at a time, with straight lines between points. */
  const at = (points: { t: number; gain: number }[], t: number) => {
    let prev = points[0]!;
    for (const p of points) {
      if (p.t >= t) {
        if (p.t === prev.t) return p.gain;
        const f = (t - prev.t) / (p.t - prev.t);
        return prev.gain + (p.gain - prev.gain) * f;
      }
      prev = p;
    }
    return prev.gain;
  };

  it('is flat at the clip level with no fades and nothing over it', () => {
    const points = gainCurve(music({ gain: 0.8 }));
    expect(at(points, 0)).toBeCloseTo(0.8, 6);
    expect(at(points, 10)).toBeCloseTo(0.8, 6);
    expect(at(points, 20)).toBeCloseTo(0.8, 6);
  });

  it('carries the clip\'s own fades', () => {
    const points = gainCurve(music({ gain: 1, fadeIn: 2, fadeOut: 2 }));
    expect(at(points, 0)).toBeCloseTo(0, 6);
    expect(at(points, 1)).toBeCloseTo(0.5, 6);
    expect(at(points, 10)).toBeCloseTo(1, 6);
    expect(at(points, 19)).toBeCloseTo(0.5, 6);
  });

  it('ducks a bed while a line plays over it, and lifts it after', () => {
    // The whole point of the feature.
    const points = gainCurve(music({ gain: 1 }), [voice(8, 4)]);
    expect(at(points, 4)).toBeCloseTo(1, 6);
    expect(at(points, 9)).toBeCloseTo(0.25, 6);
    expect(at(points, 11)).toBeCloseTo(0.25, 6);
    expect(at(points, 16)).toBeCloseTo(1, 6);
  });

  it('ramps into and out of the duck rather than stepping', () => {
    const points = gainCurve(music({ gain: 1, duckFade: 1 }), [voice(10, 4)]);
    // Halfway down at half a second before the line starts.
    expect(at(points, 9.5)).toBeCloseTo(0.625, 3);
    expect(at(points, 14.5)).toBeCloseTo(0.625, 3);
  });

  it('honours a custom duck depth, relative to the clip\'s own level', () => {
    const points = gainCurve(music({ gain: 0.8, duck: 0.5 }), [voice(5, 5)]);
    expect(at(points, 7)).toBeCloseTo(0.4, 6);
  });

  it('does not duck a clip that is not music', () => {
    const points = gainCurve({ ...voice(0, 20, 'a'), gain: 1 }, [voice(5, 5, 'b')]);
    expect(at(points, 7)).toBeCloseTo(1, 6);
  });

  it('does not let one bed duck another', () => {
    const points = gainCurve(music({ gain: 1 }), [music({ id: 'm2', t: 5, d: 5 })]);
    expect(at(points, 7)).toBeCloseTo(1, 6);
  });

  it('ignores lines that do not overlap the bed at all', () => {
    const points = gainCurve(music({ t: 0, d: 10, gain: 1 }), [voice(50, 5)]);
    expect(points.every((p) => p.gain === 1)).toBe(true);
  });

  it('ducks for a line that starts before the bed does', () => {
    // The line is already speaking when the music comes in.
    const points = gainCurve(music({ t: 10, d: 10, gain: 1 }), [voice(6, 8)]);
    expect(at(points, 0)).toBeCloseTo(0.25, 6);
  });

  it('handles several lines over one bed', () => {
    const points = gainCurve(music({ gain: 1 }), [voice(3, 2, 'a'), voice(10, 2, 'b')]);
    expect(at(points, 4)).toBeCloseTo(0.25, 6);
    expect(at(points, 7)).toBeCloseTo(1, 6);
    expect(at(points, 11)).toBeCloseTo(0.25, 6);
  });

  it('takes the quieter value where a fade and a duck meet', () => {
    // A bed already fading out must not be pushed back up by a duck ending.
    const points = gainCurve(music({ gain: 1, fadeOut: 4 }), [voice(14, 2)]);
    expect(at(points, 20)).toBeCloseTo(0, 6);
    expect(points.every((p) => p.gain <= 1 + 1e-9)).toBe(true);
  });

  it('stays inside the clip and never goes negative', () => {
    const points = gainCurve(music({ gain: 1, fadeIn: 1, fadeOut: 1 }), [voice(-5, 30, 'x')]);
    for (const p of points) {
      expect(p.t).toBeGreaterThanOrEqual(0);
      expect(p.t).toBeLessThanOrEqual(20);
      expect(p.gain).toBeGreaterThanOrEqual(0);
    }
  });
});
