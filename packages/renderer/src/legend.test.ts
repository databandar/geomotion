import { describe, expect, it } from 'vitest';
import { formatValue, legendMetrics, placeReadout, scaleAt } from './legend.ts';

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

describe('placeReadout', () => {
  const frame = { width: 1920, height: 1080 };
  const place = (ax: number, ay: number, w = 400, h = 260, cardScale = 1) =>
    placeReadout({ x: ax, y: ay }, w, h, frame, 1, cardScale);

  it('centres the card over its region', () => {
    const { x, below } = place(960, 700);
    expect(x).toBe(960 - 200);
    expect(below).toBe(false);
  });

  it('leaves a gap between the card and the region', () => {
    const { y } = place(960, 700, 400, 260);
    expect(y + 260).toBe(700 - 30);
  });

  it('flips below when there is no room above', () => {
    // Ordinary during a tour: the camera frames each region in turn, and one near the
    // top of the shot has nothing above it.
    const { y, below } = place(960, 100);
    expect(below).toBe(true);
    expect(y).toBe(100 + 30);
  });

  it('slides back in at the left and right edges', () => {
    expect(place(20, 700).x).toBe(14);
    expect(place(1900, 700).x).toBe(1920 - 400 - 14);
  });

  it('never leaves the frame, wherever the region is', () => {
    for (const ax of [-200, 0, 40, 960, 1880, 2200]) {
      for (const ay of [-100, 0, 30, 540, 1050, 1400]) {
        const { x, y } = place(ax, ay);
        expect(x).toBeGreaterThanOrEqual(14);
        expect(x + 400).toBeLessThanOrEqual(1920 - 14 + 0.001);
        expect(y).toBeGreaterThanOrEqual(14);
      }
    }
  });

  it('keeps the top of a card too tall for the frame', () => {
    // `calloutSize` reaches this. The name and the number are at the top of the card,
    // so that is the part worth keeping on screen — centring it would cut both.
    const { y } = place(960, 200, 400, 1400);
    expect(y).toBe(14);
  });

  it('scales the gap with the card but not the margin', () => {
    // The card grows with calloutSize; its clearance from the edge of the video does not.
    const big = placeReadout({ x: 960, y: 700 }, 400, 260, frame, 1, 2);
    expect(big.y + 260).toBe(700 - 60);
    expect(placeReadout({ x: 0, y: 700 }, 400, 260, frame, 1, 2).x).toBe(14);
  });
});
