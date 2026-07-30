import { describe, expect, it } from 'vitest';
import { clipFilter, volumeExpression } from './tts.mjs';

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

describe('volumeExpression', () => {
  /** Evaluate the expression the way ffmpeg would, to check the shape it describes. */
  function evaluate(expr, t) {
    const fn = new Function('t', `const lt=(a,b)=>a<b; return ${expr.replace(/if\(/g, 'iff(')};`);
    const iff = (c, a, b) => (c ? a : b);
    return new Function('t', 'iff', 'lt', `return ${expr.replace(/if\(/g, 'iff(')};`)(t, iff, (a, b) => a < b) ?? fn;
  }

  it('is a constant for a flat curve', () => {
    expect(volumeExpression([{ t: 0, gain: 0.5 }, { t: 10, gain: 0.5 }])).toBe('0.5000');
  });

  it('is 1 for an empty curve, which means leave it alone', () => {
    expect(volumeExpression([])).toBe('1');
  });

  it('interpolates linearly between points', () => {
    const expr = volumeExpression([
      { t: 0, gain: 0 },
      { t: 2, gain: 1 },
      { t: 10, gain: 1 },
    ]);
    expect(evaluate(expr, 0)).toBeCloseTo(0, 3);
    expect(evaluate(expr, 1)).toBeCloseTo(0.5, 3);
    expect(evaluate(expr, 2)).toBeCloseTo(1, 3);
    expect(evaluate(expr, 6)).toBeCloseTo(1, 3);
  });

  it('describes a duck as a dip and a recovery', () => {
    const expr = volumeExpression([
      { t: 0, gain: 1 },
      { t: 4, gain: 1 },
      { t: 4.3, gain: 0.25 },
      { t: 8, gain: 0.25 },
      { t: 8.3, gain: 1 },
      { t: 12, gain: 1 },
    ]);
    expect(evaluate(expr, 2)).toBeCloseTo(1, 3);
    expect(evaluate(expr, 6)).toBeCloseTo(0.25, 3);
    expect(evaluate(expr, 10)).toBeCloseTo(1, 3);
    // Mid-ramp, halfway down.
    expect(evaluate(expr, 4.15)).toBeCloseTo(0.625, 2);
  });

  it('holds the first value before the curve starts and the last after it ends', () => {
    const expr = volumeExpression([{ t: 2, gain: 0.2 }, { t: 6, gain: 0.9 }]);
    expect(evaluate(expr, 0)).toBeCloseTo(0.2, 3);
    expect(evaluate(expr, 99)).toBeCloseTo(0.9, 3);
  });

  it('survives two points at the same instant without dividing by zero', () => {
    const expr = volumeExpression([{ t: 0, gain: 1 }, { t: 5, gain: 1 }, { t: 5, gain: 0.3 }, { t: 9, gain: 0.3 }]);
    expect(Number.isFinite(evaluate(expr, 5))).toBe(true);
    expect(evaluate(expr, 7)).toBeCloseTo(0.3, 3);
  });
});

describe('clipFilter with a curve', () => {
  it('uses the curve instead of separate volume and fades', () => {
    const f = clipFilter(0, {
      start: 2,
      duration: 10,
      gain: 1,
      fadeIn: 1,
      fadeOut: 1,
      curve: [{ t: 0, gain: 0 }, { t: 1, gain: 1 }, { t: 9, gain: 1 }, { t: 10, gain: 0 }],
    });
    expect(f).toContain('volume=eval=frame');
    expect(f).not.toContain('afade');
  });

  it('still evaluates the curve before the clip is moved into place', () => {
    // volume is evaluated in the input's own time; after adelay the curve would be
    // measured from the head of the silence.
    const f = clipFilter(0, {
      start: 5,
      duration: 4,
      curve: [{ t: 0, gain: 1 }, { t: 4, gain: 0 }],
    });
    expect(f.indexOf('volume')).toBeLessThan(f.indexOf('adelay'));
  });

  it('omits the filter entirely for a flat unity curve', () => {
    const f = clipFilter(0, { start: 0, duration: 5, curve: [{ t: 0, gain: 1 }, { t: 5, gain: 1 }] });
    expect(f).toBe('[1:a]adelay=0|0[a0]');
  });
});
