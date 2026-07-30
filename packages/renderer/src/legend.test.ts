import { describe, expect, it } from 'vitest';
import { formatValue, legendMetrics, scaleAt } from './legend.ts';

describe('legendMetrics', () => {
  it('sits at the bottom-left of the frame', () => {
    const m = legendMetrics(1, 1080, false);
    expect(m.x).toBe(28);
    expect(m.y + m.boxH).toBe(1080 - 28);
  });

  it('scales everything together, so the legend is the same size at any resolution', () => {
    // A legend fixed in pixels is unreadable at 4K and covers the map at 480p.
    const small = legendMetrics(1, 1080, false);
    const big = legendMetrics(2, 2160, false);
    expect(big.boxW).toBe(small.boxW * 2);
    expect(big.boxH).toBe(small.boxH * 2);
    expect(big.barW).toBe(small.barW * 2);
  });

  it('grows upward for the no-data row rather than downward', () => {
    // Downward would push the tick labels off the bottom of the frame.
    const without = legendMetrics(1, 1080, false);
    const with_ = legendMetrics(1, 1080, true);
    expect(with_.boxH).toBeGreaterThan(without.boxH);
    expect(with_.y).toBeLessThan(without.y);
    expect(with_.y + with_.boxH).toBe(without.y + without.boxH);
  });

  it('keeps the bar inside the box', () => {
    for (const hasNoData of [false, true]) {
      const m = legendMetrics(1.5, 900, hasNoData);
      expect(m.barY).toBeGreaterThan(m.y);
      expect(m.barY + m.barH).toBeLessThan(m.y + m.boxH);
      expect(m.x + m.pad + m.barW).toBeLessThanOrEqual(m.x + m.boxW);
    }
  });

  it('keeps the no-data row inside the box', () => {
    const m = legendMetrics(1, 1080, true);
    expect(m.noDataY).toBeGreaterThan(m.barY + m.barH);
    expect(m.noDataY).toBeLessThanOrEqual(m.y + m.boxH);
  });
});

describe('scaleAt', () => {
  it('places a value along the domain', () => {
    expect(scaleAt(50, [0, 100])).toBe(0.5);
    expect(scaleAt(0, [0, 100])).toBe(0);
    expect(scaleAt(100, [0, 100])).toBe(1);
  });

  it('clamps a value outside a hand-set domain', () => {
    // The domain can be set by hand, so a region may legitimately fall outside it —
    // and an unclamped callout would point off the end of the bar.
    expect(scaleAt(-40, [0, 100])).toBe(0);
    expect(scaleAt(500, [0, 100])).toBe(1);
  });

  it('survives every region carrying the same number', () => {
    // Ordinary data, not an error. Dividing by the zero-width span puts the callout at
    // NaN, which draws nothing at all and looks like the feature is broken.
    expect(scaleAt(7, [7, 7])).toBe(0);
    expect(Number.isNaN(scaleAt(7, [7, 7]))).toBe(false);
  });

  it('does not produce NaN from a non-finite value or domain', () => {
    for (const [v, d] of [
      [NaN, [0, 100]],
      [5, [NaN, 100]],
      [5, [0, Infinity]],
    ] as [number, [number, number]][]) {
      expect(Number.isNaN(scaleAt(v, d))).toBe(false);
    }
  });

  it('handles a domain that runs downward', () => {
    // `autoDomain` off plus a min above the max is reachable from the inspector.
    expect(scaleAt(25, [100, 0])).toBe(0.75);
  });
});

describe('formatValue', () => {
  it('renders the same number differently per locale, on request', () => {
    // The bug this parameter exists for: these all came out of the *machine's* locale
    // before, so one project produced different pixels on different laptops.
    expect(formatValue(1234.5, 1, '', 'en-US')).toBe('1,234.5');
    expect(formatValue(1234.5, 1, '', 'de-DE')).toBe('1.234,5');
  });

  it('groups by lakh and crore when asked, which the shipped demo needs', () => {
    expect(formatValue(1234567.8, 1, '', 'hi-IN')).toBe('12,34,567.8');
  });

  it('honours the decimal count exactly, padding as well as rounding', () => {
    expect(formatValue(3, 2, '', 'en-US')).toBe('3.00');
    expect(formatValue(3.456, 1, '', 'en-US')).toBe('3.5');
    expect(formatValue(3.6, 0, '', 'en-US')).toBe('4');
  });

  it('sets a short unit tight and a word apart', () => {
    expect(formatValue(50, 0, '%', 'en-US')).toBe('50%');
    expect(formatValue(12, 0, 'km', 'en-US')).toBe('12km');
    expect(formatValue(12, 0, 'people', 'en-US')).toBe('12 people');
  });

  it('leaves the number alone when there is no unit', () => {
    expect(formatValue(12, 0, '', 'en-US')).toBe('12');
  });

  it('handles negatives and zero', () => {
    expect(formatValue(-1234.5, 1, '', 'en-US')).toBe('-1,234.5');
    expect(formatValue(0, 1, '%', 'en-US')).toBe('0.0%');
  });
});
