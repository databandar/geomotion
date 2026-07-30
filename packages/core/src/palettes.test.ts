import { describe, expect, it } from 'vitest';
import { RAMPS, getRamp, luminance, rampColor } from './palettes.ts';

/**
 * Behavioural spec for the sequential colour ramps, bound for the scale editor
 * in `packages/document`/`packages/map` (ARCHITECTURE §07).
 *
 * The monotonic-lightness assertion below is not a style preference: it is the
 * property that lets a viewer rank two regions by colour alone. ARCHITECTURE §07
 * and §12 both treat it as a hard gate that the AI palette advisor may not
 * override. If a future ramp fails this test, the ramp is wrong — do not relax
 * the test.
 */

describe('shipped ramps', () => {
  it('every ramp has an id, a name, and at least five steps', () => {
    expect(RAMPS.length).toBeGreaterThan(0);
    for (const ramp of RAMPS) {
      expect(ramp.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(ramp.name.length).toBeGreaterThan(0);
      expect(ramp.steps.length).toBeGreaterThanOrEqual(5);
    }
  });

  it('every step is a valid 6-digit hex colour', () => {
    for (const ramp of RAMPS) {
      for (const step of ramp.steps) {
        expect(step).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });

  it('has no duplicate ramp ids', () => {
    const ids = RAMPS.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  // ---- the accessibility gate -------------------------------------------

  it('EVERY ramp is strictly monotonic in luminance, light to dark', () => {
    for (const ramp of RAMPS) {
      const lums = ramp.steps.map(luminance);
      for (let i = 1; i < lums.length; i++) {
        expect(
          lums[i],
          `ramp "${ramp.id}" breaks monotonicity at step ${i} ` +
            `(${ramp.steps[i - 1]} L=${lums[i - 1]!.toFixed(3)} -> ${ramp.steps[i]} L=${lums[i]!.toFixed(3)})`,
        ).toBeLessThan(lums[i - 1]!);
      }
    }
  });

  it('spans a wide enough luminance range to be readable as a scale', () => {
    for (const ramp of RAMPS) {
      const lums = ramp.steps.map(luminance);
      const span = Math.max(...lums) - Math.min(...lums);
      expect(span, `ramp "${ramp.id}" span too narrow`).toBeGreaterThan(0.4);
    }
  });
});

describe('luminance', () => {
  it('matches the WCAG anchors', () => {
    expect(luminance('#ffffff')).toBeCloseTo(1, 5);
    expect(luminance('#000000')).toBeCloseTo(0, 5);
    expect(luminance('#808080')).toBeCloseTo(0.2159, 3);
  });

  it('orders greys correctly', () => {
    expect(luminance('#cccccc')).toBeGreaterThan(luminance('#333333'));
  });
});

describe('getRamp', () => {
  it('resolves a known id', () => {
    expect(getRamp('ember').id).toBe('ember');
  });

  it('falls back to the first ramp for an unknown id rather than throwing', () => {
    // Documents written against a newer build must still open.
    expect(getRamp('does-not-exist')).toBe(RAMPS[0]);
  });
});

describe('rampColor', () => {
  const ramp = getRamp('ember');

  it('returns the ramp endpoints at 0 and 1', () => {
    expect(rampColor(ramp, 0, false)).toBe(ramp.steps[0]);
    expect(rampColor(ramp, 1, false)).toBe(ramp.steps.at(-1));
  });

  it('flips the anchor when asked, for dark surfaces', () => {
    expect(rampColor(ramp, 0, true)).toBe(ramp.steps.at(-1));
    expect(rampColor(ramp, 1, true)).toBe(ramp.steps[0]);
  });

  it('clamps out-of-domain values instead of producing garbage', () => {
    expect(rampColor(ramp, -3, false)).toBe(rampColor(ramp, 0, false));
    expect(rampColor(ramp, 7, false)).toBe(rampColor(ramp, 1, false));
  });

  it('treats a non-finite input as the low end rather than emitting NaN', () => {
    // Real datasets contain holes; a missing value must never render as "#NaNNaNNaN".
    expect(rampColor(ramp, NaN, false)).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('always returns a well-formed hex colour across the domain', () => {
    for (let t = 0; t <= 1.0001; t += 0.02) {
      expect(rampColor(ramp, t, false)).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('darkens monotonically across the sampled domain', () => {
    // The sampled ramp must inherit the monotonicity of its steps, or the
    // interpolation is broken even though the source ramp is fine.
    let prev = Infinity;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const l = luminance(rampColor(ramp, t, false));
      expect(l).toBeLessThanOrEqual(prev + 1e-6);
      prev = l;
    }
  });

  it('is deterministic', () => {
    for (const t of [0, 0.137, 0.5, 0.921, 1]) {
      expect(rampColor(ramp, t, false)).toBe(rampColor(ramp, t, false));
    }
  });
});
