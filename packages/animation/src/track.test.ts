import { describe, expect, it } from 'vitest';
import { keyframedTrack, staticTrack, isAnimated, restValue, type Keyframe } from '@geomotion/document';
import { evalTrack, holdValue, lerpNumber, trackKindSupported } from './track.ts';

/**
 * `evalTrack` is the `base(t)` of §06's pipeline: expressions, bindings and behaviour
 * stacks all wrap it rather than reimplementing keyframe lookup. Everything animated in
 * the app will eventually resolve through this function, so it is tested at the level of
 * "no input a document can hold produces a throw or a NaN" rather than by example.
 */

let n = 0;
const key = (t: number, value: number, easing = 'linear', hold?: boolean): Keyframe<number> => ({
  id: `k${n++}`,
  t,
  value,
  easing: easing as Keyframe<number>['easing'],
  ...(hold === undefined ? {} : { hold }),
});

describe('static tracks', () => {
  it('reads the same value at any time', () => {
    const t = staticTrack(42);
    for (const time of [-100, 0, 3.5, 1e6]) expect(evalTrack(t, time)).toBe(42);
  });

  it('carries a non-numeric value untouched', () => {
    expect(evalTrack(staticTrack('slideUp'), 5, { interpolate: holdValue })).toBe('slideUp');
  });
});

describe('keyframed tracks', () => {
  const ramp = () => keyframedTrack([key(1, 0), key(3, 10)]);

  it('interpolates across a segment', () => {
    expect(evalTrack(ramp(), 2)).toBe(5);
    expect(evalTrack(ramp(), 1.5)).toBe(2.5);
  });

  it('reads exactly the authored value at a key', () => {
    // The instant a key sits on must be its own value, not a blend one step either side.
    expect(evalTrack(ramp(), 1)).toBe(0);
    expect(evalTrack(ramp(), 3)).toBe(10);
  });

  it('clamps outside the keyed range rather than extrapolating', () => {
    /*
     * Extrapolation invents values nobody authored. On a track whose first key sits at
     * one second, frame zero would otherwise show something visibly wrong.
     */
    expect(evalTrack(ramp(), -5)).toBe(0);
    expect(evalTrack(ramp(), 0.99)).toBe(0);
    expect(evalTrack(ramp(), 100)).toBe(10);
  });

  it('sorts keys given out of order, so authoring order cannot change playback', () => {
    const t = keyframedTrack([key(3, 10), key(1, 0)]);
    expect(evalTrack(t, 2)).toBe(5);
  });

  it('walks a run of segments, each with its own easing', () => {
    const t = keyframedTrack([key(0, 0), key(1, 10), key(2, 0)]);
    expect(evalTrack(t, 0.5)).toBe(5);
    expect(evalTrack(t, 1)).toBe(10);
    expect(evalTrack(t, 1.5)).toBe(5);
  });

  it('applies the easing of the key the segment leaves, not the one it arrives at', () => {
    // The camera's existing convention. Reversing it would silently retime every project
    // that has a keyframe in it.
    const out = keyframedTrack([key(0, 0, 'easeIn'), key(1, 10, 'linear')]);
    const lin = keyframedTrack([key(0, 0, 'linear'), key(1, 10, 'easeIn')]);
    expect(evalTrack(out, 0.5)).toBeLessThan(evalTrack(lin, 0.5));
  });

  it('holds a value to the next key when the key says so', () => {
    // A step, not a ramp — how an enum or a visibility flag animates.
    const t = keyframedTrack([key(0, 0, 'linear', true), key(2, 10)]);
    expect(evalTrack(t, 0)).toBe(0);
    expect(evalTrack(t, 1.99)).toBe(0);
    expect(evalTrack(t, 2)).toBe(10);
  });

  it('steps between two keys sharing an instant instead of dividing by zero', () => {
    // A zero span gives Infinity, and an eased Infinity is NaN — which draws nothing.
    const t = keyframedTrack([key(1, 0), key(1, 10)]);
    expect(evalTrack(t, 1)).toBe(10);
    expect(Number.isNaN(evalTrack(t, 1))).toBe(false);
  });

  it('reads a single key as a constant', () => {
    const t = keyframedTrack([key(5, 7)]);
    for (const time of [0, 5, 500]) expect(evalTrack(t, time)).toBe(7);
  });

  it('falls back rather than throwing on a track with no keys', () => {
    // Reachable: deleting the last keyframe of a property leaves the track empty.
    expect(evalTrack(keyframedTrack<number>([]), 3, { interpolate: lerpNumber, fallback: -1 })).toBe(-1);
  });

  it('never produces NaN, whatever the time', () => {
    const t = keyframedTrack([key(0, 0), key(2, 10), key(2, 20, 'linear', true), key(4, 5)]);
    for (const time of [-Infinity, -1, 0, 1, 2, 3, 4, 99, Infinity]) {
      expect(Number.isNaN(evalTrack(t, time))).toBe(false);
    }
  });
});

describe('interpolation is the caller\'s choice', () => {
  it('blends a non-numeric channel however it was told to', () => {
    // Angles take the short way round; longitude wraps; colours hold. The animation
    // package must not know which is which — see the feature doc.
    const shortWay = (a: number, b: number, e: number) => {
      const d = ((b - a + 540) % 360) - 180;
      return a + d * e;
    };
    const t = keyframedTrack([key(0, 350), key(1, 10)]);
    // Straight lerp would sweep backwards through 180; the short way passes 0.
    expect(evalTrack(t, 0.5, { interpolate: shortWay })).toBeCloseTo(360, 5);
    expect(evalTrack(t, 0.5)).toBeCloseTo(180, 5);
  });

  it('holds a value that cannot be blended', () => {
    const t = keyframedTrack([key(0, 'a' as never), key(2, 'b' as never)]);
    expect(evalTrack(t as never, 1, { interpolate: holdValue })).toBe('a');
    expect(evalTrack(t as never, 2, { interpolate: holdValue })).toBe('b');
  });
});

describe('bound tracks', () => {
  const table: Record<string, number> = { 'geo:IN-WB|value': 64.3, 'geo:IN-WB|rank': 12 };
  const facts = (ref: string, path: string) => table[`${ref}|${path}`];

  it('reads a fact off an entity', () => {
    // §05's bindings out: a property reads a value by stable id rather than by spelling.
    expect(evalTrack({ kind: 'bound', ref: 'geo:IN-WB', path: 'value' }, 0, { facts })).toBe(64.3);
    expect(evalTrack({ kind: 'bound', ref: 'geo:IN-WB', path: 'rank' }, 0, { facts })).toBe(12);
  });

  it('scales the fact into the property\'s units', () => {
    // A population is not a marker size; `scale` is what maps one onto the other.
    expect(evalTrack({ kind: 'bound', ref: 'geo:IN-WB', path: 'value', scale: 0.5 }, 0, { facts })).toBe(32.15);
  });

  it('ignores time — a fact does not move', () => {
    for (const t of [0, 5, 100]) {
      expect(evalTrack({ kind: 'bound', ref: 'geo:IN-WB', path: 'value' }, t, { facts })).toBe(64.3);
    }
  });

  it('falls back rather than resolving a missing fact to zero', () => {
    /*
     * Zero is a real value in every one of these datasets. A region with no figure
     * rendering as zero is indistinguishable from a genuine low — which is the whole
     * failure the "no data" colour exists to prevent.
     */
    expect(evalTrack({ kind: 'bound', ref: 'geo:IN-XX', path: 'value' }, 0, { facts, fallback: 8 })).toBe(8);
    expect(evalTrack({ kind: 'bound', ref: 'geo:IN-WB', path: 'nope' }, 0, { facts, fallback: 8 })).toBe(8);
  });

  it('falls back when nothing can resolve facts at all', () => {
    // A document opened without a registry must not throw or invent a number.
    expect(evalTrack({ kind: 'bound', ref: 'a', path: 'b' }, 0, { fallback: 3 })).toBe(3);
  });

  it('refuses a fact that is not a finite number', () => {
    const odd = () => 'a string' as unknown as number;
    expect(evalTrack({ kind: 'bound', ref: 'a', path: 'b' }, 0, { facts: odd, fallback: 5 })).toBe(5);
    expect(evalTrack({ kind: 'bound', ref: 'a', path: 'b' }, 0, { facts: () => NaN, fallback: 5 })).toBe(5);
  });
});

describe('the kinds that are still not evaluated', () => {
  it('reports expr as unsupported instead of pretending', () => {
    /*
     * Declared in the union from the start so every switch over a track is exhaustive —
     * adding evaluation later is a compile error at each site that must handle it, rather
     * than a silent fallthrough returning a default. `bound` landed in M9; `expr` waits
     * for the DSL.
     */
    expect(trackKindSupported({ kind: 'bound', ref: 'geo:in-wb', path: 'population' })).toBe(true);
    expect(trackKindSupported({ kind: 'expr', source: 'a + 1' })).toBe(false);
    expect(trackKindSupported(staticTrack(1))).toBe(true);
    expect(trackKindSupported(keyframedTrack([key(0, 1)]))).toBe(true);
  });

  it('returns the fallback rather than a wrong number', () => {
    expect(evalTrack({ kind: 'bound', ref: 'x', path: 'y' }, 1, { interpolate: lerpNumber, fallback: 99 })).toBe(99);
  });
});

describe('track helpers', () => {
  it('knows what can move', () => {
    expect(isAnimated(staticTrack(1))).toBe(false);
    expect(isAnimated(keyframedTrack([key(0, 1)]))).toBe(false);
    expect(isAnimated(keyframedTrack([key(0, 1), key(1, 2)]))).toBe(true);
  });

  it('gives the inspector something to show without a playhead', () => {
    expect(restValue(staticTrack(3))).toBe(3);
    expect(restValue(keyframedTrack([key(2, 8), key(4, 9)]))).toBe(8);
    expect(restValue({ kind: 'bound', ref: 'x', path: 'y' })).toBeUndefined();
  });
});
