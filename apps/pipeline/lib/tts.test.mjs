import { describe, expect, it } from 'vitest';
import { clipFilter } from './tts.mjs';

/**
 * Behavioural spec for the per-clip filter chain.
 *
 * This is string construction that ffmpeg accepts either way: get the order or the
 * offsets wrong and you get a mix at the wrong level, or a fade over silence, rather
 * than an error. So it is checked here instead of by listening.
 */

const clip = (patch = {}) => ({ start: 0, duration: 10, gain: 1, fadeIn: 0, fadeOut: 0, ...patch });

describe('clipFilter', () => {
  it('positions a plain clip and nothing else', () => {
    expect(clipFilter(0, clip({ start: 2.5 }))).toBe('[1:a]adelay=2500|2500[a0]');
  });

  it('labels inputs and outputs by index', () => {
    // Input 0 is the silent bed, so clip N is input N+1.
    expect(clipFilter(3, clip())).toBe('[4:a]adelay=0|0[a3]');
  });

  it('omits volume at unity rather than emitting a no-op', () => {
    expect(clipFilter(0, clip({ gain: 1 }))).not.toContain('volume');
  });

  it('applies a level below unity, which is the music-under-voice case', () => {
    expect(clipFilter(0, clip({ gain: 0.25 }))).toContain('volume=0.2500');
  });

  it('fades in from the head of the audio', () => {
    expect(clipFilter(0, clip({ fadeIn: 1.5 }))).toContain('afade=t=in:st=0:d=1.500');
  });

  it('measures the fade-out back from the end of the clip', () => {
    expect(clipFilter(0, clip({ duration: 10, fadeOut: 2 }))).toContain('afade=t=out:st=8.000:d=2.000');
  });

  it('fades before delaying, so the shape lands on the audio and not the silence', () => {
    // afade counts from the start of its input. Delay first and the fade would be
    // applied to the head of the padding instead of the head of the clip.
    const f = clipFilter(0, clip({ start: 5, fadeIn: 1 }));
    expect(f.indexOf('afade')).toBeLessThan(f.indexOf('adelay'));
  });

  it('applies level before fades, so a fade ramps to the clip level', () => {
    const f = clipFilter(0, clip({ gain: 0.5, fadeIn: 1 }));
    expect(f.indexOf('volume')).toBeLessThan(f.indexOf('afade'));
  });

  it('combines everything in one chain', () => {
    expect(clipFilter(1, clip({ start: 3, duration: 8, gain: 0.5, fadeIn: 1, fadeOut: 2 }))).toBe(
      '[2:a]volume=0.5000,afade=t=in:st=0:d=1.000,afade=t=out:st=6.000:d=2.000,adelay=3000|3000[a1]',
    );
  });

  it('skips a fade-out on a clip with no known length', () => {
    expect(clipFilter(0, clip({ duration: 0, fadeOut: 2 }))).not.toContain('t=out');
  });

  it('rounds the delay to whole milliseconds, the unit adelay takes', () => {
    expect(clipFilter(0, clip({ start: 1.23456 }))).toContain('adelay=1235|1235');
  });

  it('defaults a missing gain to unity rather than silence', () => {
    // Narration clips built by the pipeline predate the envelope.
    expect(clipFilter(0, { start: 0, duration: 5, fadeIn: 0, fadeOut: 0 })).toBe('[1:a]adelay=0|0[a0]');
  });
});
