import { describe, expect, it } from 'vitest';
import { RAMPS, getRamp, luminance, parseHex, rampColor, withAlpha } from './palettes.ts';

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

describe('parseHex', () => {
  it('reads all four CSS hex forms', () => {
    expect(parseHex('#f00')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseHex('#ff0000')).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseHex('#f008')).toEqual({ r: 255, g: 0, b: 0, a: 136 / 255 });
    expect(parseHex('#ff000088')).toEqual({ r: 255, g: 0, b: 0, a: 136 / 255 });
  });

  it('is case-insensitive', () => {
    expect(parseHex('#AbCdEf')).toEqual(parseHex('#abcdef'));
  });

  it('refuses what is not a colour instead of returning NaN channels', () => {
    // Each of these used to parse to an rgba() string with a NaN in it, which the
    // canvas discards silently — leaving the previous fill in place.
    for (const bad of ['#', '#z', '#12345', '#zzzzzz', '#1234567', 'red', 'rgb(1,2,3)']) {
      expect(parseHex(bad)).toBeNull();
    }
  });
});

describe('withAlpha', () => {
  it('scales the colour\'s own alpha rather than replacing it', () => {
    // A half-transparent red at 50% is a quarter, not a half.
    expect(withAlpha('#ff000080', 0.5)).toBe(`rgba(255,0,0,${(128 / 255) * 0.5})`);
  });

  it('lets a named or functional colour through untouched', () => {
    expect(withAlpha('red', 0.5)).toBe('red');
    expect(withAlpha('rgb(1,2,3)', 0.5)).toBe('rgb(1,2,3)');
  });

  it('never emits a channel the canvas will reject', () => {
    // The property this exists for. `fillStyle = 'rgba(240,10,NaN,0.5)'` is a no-op in
    // Chrome — verified against the real browser — so the shape draws in whatever
    // colour the previous layer left behind, varying with draw order.
    for (const bad of ['#', '#z', '#12345', '#zzzzzz']) {
      expect(withAlpha(bad, 0.5)).not.toMatch(/NaN/);
    }
  });

  it('stays a colour at every keystroke of typing #ff0000', () => {
    // The inspector's colour text field commits on each keystroke, so these are all
    // states a user passes through in normal use, not malformed input.
    for (const partial of ['#f', '#ff', '#ff0', '#ff00', '#ff000', '#ff0000']) {
      expect(withAlpha(partial, 1)).not.toMatch(/NaN/);
    }
    // Four digits is a real `#rgba`, so it is honoured rather than discarded.
    expect(withAlpha('#ff00', 1)).toBe('rgba(255,255,0,0)');
  });
});

describe('luminance', () => {
  it('falls back to black rather than NaN for a colour it cannot read', () => {
    // Callers compare against a threshold to pick readable ink; NaN compares false
    // against every threshold, so one branch would be taken forever.
    expect(luminance('#zzzzzz')).toBe(0);
    expect(Number.isNaN(luminance('#12345'))).toBe(false);
  });
});
