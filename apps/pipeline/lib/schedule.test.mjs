import { describe, expect, it } from 'vitest';
import { sceneBoundsFrom } from './schedule.mjs';

/**
 * `narrateSchedule` isn't unit-tested here for the same reason `speak()` itself
 * isn't in tts.test.mjs — it's a live TTS call, and a mock of it would test the
 * mock. It's validated the way this whole pipeline validates anything
 * network/browser-dependent: for real, against a real Voicebox call, not with a
 * fake standing in for one.
 */
describe('sceneBoundsFrom', () => {
  it('spans each beat from its own start to the next beat\'s start, not its own end', () => {
    const schedule = {
      at: {
        a: { start: 0, end: 2, duration: 2 },
        b: { start: 3, end: 6, duration: 3 }, // 1s gap after `a`
      },
      DUR: 8,
    };
    const S = sceneBoundsFrom(schedule);
    expect(S.a).toEqual([0, 3]); // ends at b's start, not a's own end (2)
    expect(S.b).toEqual([3, 8]); // last beat runs to DUR
  });

  it('reproduces the real Dandi March episode\'s committed scene-bounds.json exactly', () => {
    // schedule.json and scene-bounds.json as actually committed at
    // docs/brand/dandi-march/ — this is the hand-written loop every episode's
    // build-project.mjs duplicated, confirmed to produce the identical result.
    const schedule = {
      at: {
        s01: { start: 0, end: 5.55, duration: 5.55 },
        s02: { start: 5.95, end: 12.1, duration: 6.15 },
        s03: { start: 12.6, end: 18.8, duration: 6.2 },
        s04: { start: 20, end: 24.7, duration: 4.7 },
        s05: { start: 26, end: 31.3, duration: 5.3 },
        s06: { start: 31.9, end: 35.67, duration: 3.78 },
        s07: { start: 36.38, end: 39.03, duration: 2.65 },
      },
      DUR: 42.43,
    };
    expect(sceneBoundsFrom(schedule)).toEqual({
      s01: [0, 5.95],
      s02: [5.95, 12.6],
      s03: [12.6, 20],
      s04: [20, 26],
      s05: [26, 31.9],
      s06: [31.9, 36.38],
      s07: [36.38, 42.43],
    });
  });

  it('handles a single beat', () => {
    expect(sceneBoundsFrom({ at: { only: { start: 0, end: 2, duration: 2 } }, DUR: 5 })).toEqual({
      only: [0, 5],
    });
  });

  it('preserves beat order from the object\'s own key order, matching how schedule.json is written', () => {
    const S = sceneBoundsFrom({
      at: {
        s01: { start: 0, end: 1, duration: 1 },
        s02: { start: 1.5, end: 2.5, duration: 1 },
        s03: { start: 3, end: 4, duration: 1 },
      },
      DUR: 5,
    });
    expect(Object.keys(S)).toEqual(['s01', 's02', 's03']);
  });
});
