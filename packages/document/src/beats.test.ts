import { describe, expect, it } from 'vitest';
import { stagger } from './beats.ts';

describe('stagger', () => {
  it('places a single item at the lead-in', () => {
    expect(stagger(1, [10, 20], { leadIn: 0.3 })).toEqual([10.3]);
  });

  it('spreads count items with the first at leadIn and the last at end-trailMargin', () => {
    const times = stagger(5, [0, 10], { leadIn: 1, trailMargin: 1 });
    expect(times).toHaveLength(5);
    expect(times[0]).toBeCloseTo(1, 6);
    expect(times.at(-1)).toBeCloseTo(9, 6);
  });

  it('is evenly spaced', () => {
    const times = stagger(4, [0, 12]);
    const gaps = times.slice(1).map((t, i) => t - times[i]!);
    expect(gaps[0]).toBeCloseTo(gaps[1]!, 6);
    expect(gaps[1]).toBeCloseTo(gaps[2]!, 6);
  });

  it('returns nothing for zero items, and does not throw', () => {
    expect(stagger(0, [0, 10])).toEqual([]);
  });

  it('defaults leadIn/trailMargin to 0', () => {
    const times = stagger(3, [0, 10]);
    expect(times[0]).toBe(0);
    expect(times.at(-1)).toBe(10);
  });

  /**
   * Regression case: the Dandi March episode's own growing-crowd markers, the
   * pattern this replaces. That hand-written formula divided the usable window by
   * `count` rather than `count - 1`, so its last item landed one interval short of
   * the trailing margin — not wrong exactly (the margin was generous), just not
   * what "first at the lead-in, last at the margin" actually specifies. This
   * confirms `stagger` lands the last item exactly where the original meant to,
   * not one interval early.
   */
  it('lands the last item exactly at the margin, unlike the original hand-written formula', () => {
    const s03: [number, number] = [12.6, 20]; // Dandi March's real S03 scene bounds
    const times = stagger(6, s03, { leadIn: 0.3, trailMargin: 0.3 });
    expect(times.at(-1)).toBeCloseTo(20 - 0.3, 6);

    // The original formula, for comparison — falls short of the margin by one gap.
    const original = Array.from({ length: 6 }, (_, i) => s03[0] + 0.3 + i * ((s03[1] - s03[0] - 0.6) / 6));
    expect(original.at(-1)).toBeLessThan(times.at(-1)!);
  });
});
