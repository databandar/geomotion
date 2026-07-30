import { describe, expect, it } from 'vitest';
import { DEFAULT_TOLERANCE, compare, describe as describeDiff, matches, type Signature } from './signature.ts';

/**
 * Behavioural spec for the comparison itself.
 *
 * This is the half of the harness that runs in CI: capturing needs a browser and
 * a GPU, but deciding whether two signatures agree is arithmetic. The properties
 * that matter are that identical frames always pass, that a real regression is
 * never absorbed by the tolerance, and that a grid mismatch is an error rather
 * than a silent pass.
 */

function sig(w: number, h: number, fill: (i: number) => [number, number, number]): Signature {
  const cells: number[] = [];
  for (let i = 0; i < w * h; i++) cells.push(...fill(i));
  return { w, h, cells };
}

const flat = (w: number, h: number, v: number) => sig(w, h, () => [v, v, v]);

describe('compare', () => {
  it('reports no change for identical signatures', () => {
    const a = flat(8, 8, 120);
    const d = compare(a, flat(8, 8, 120));
    expect(d.maxDelta).toBe(0);
    expect(d.meanDelta).toBe(0);
    expect(d.changedCells).toBe(0);
    expect(d.totalCells).toBe(64);
  });

  it('measures a uniform shift on every cell', () => {
    const d = compare(flat(4, 4, 100), flat(4, 4, 110));
    expect(d.maxDelta).toBe(10);
    expect(d.meanDelta).toBeCloseTo(10, 6);
    expect(d.changedCells).toBe(16);
  });

  it('locates the single cell that changed', () => {
    const a = flat(4, 4, 50);
    const b = flat(4, 4, 50);
    // Row 2, column 1.
    const i = 2 * 4 + 1;
    b.cells[i * 3 + 1] = 200;
    const d = compare(a, b);
    expect(d.changedCells).toBe(1);
    expect(d.worst).toEqual({ x: 1, y: 2, delta: 150 });
  });

  it('takes the largest of the three channels for a cell', () => {
    const a = flat(2, 2, 0);
    const b = flat(2, 2, 0);
    b.cells[0] = 3;
    b.cells[1] = 30;
    b.cells[2] = 1;
    expect(compare(a, b).maxDelta).toBe(30);
  });

  it('throws rather than silently passing when the grids differ', () => {
    // A changed grid size means the baseline is stale; treating that as "no
    // change" would be the worst possible failure mode for this harness.
    expect(() => compare(flat(4, 4, 0), flat(8, 8, 0))).toThrow(/grids differ/);
  });

  it('is symmetric', () => {
    const a = sig(4, 4, (i) => [i * 3, 10, 200 - i]);
    const b = sig(4, 4, (i) => [i, 40, 100]);
    expect(compare(a, b).maxDelta).toBe(compare(b, a).maxDelta);
    expect(compare(a, b).meanDelta).toBeCloseTo(compare(b, a).meanDelta, 9);
  });
});

describe('matches', () => {
  it('accepts identical frames', () => {
    expect(matches(flat(16, 16, 90), flat(16, 16, 90))).toBe(true);
  });

  it('rejects even a single-unit change by default', () => {
    // Measured, not assumed: three consecutive captures of the fixture frames
    // were bit-identical, so a delta of 1 is a real change in what was drawn.
    const a = flat(16, 16, 90);
    const b = flat(16, 16, 90);
    b.cells[7 * 3] = 91;
    expect(matches(a, b)).toBe(false);
  });

  it('rejects the subtle shift that a loose tolerance let through', () => {
    // A 4px change to the legend bar moved a handful of cells by 1-2 units and
    // passed at tolerance 6. That is the regression class this harness is for.
    const a = flat(16, 16, 90);
    const b = flat(16, 16, 90);
    for (const i of [200, 201, 202]) b.cells[i * 3 + 1] = 92;
    expect(matches(a, b)).toBe(false);
  });

  it('can be loosened deliberately by a caller that has measured a reason to', () => {
    const a = flat(16, 16, 90);
    const b = sig(16, 16, (i) => [90 + (i % 2), 90, 90 - (i % 3)]);
    expect(matches(a, b, 4, 8)).toBe(true);
  });

  it('rejects a layer that stopped drawing', () => {
    // The failure this harness exists for: hundreds of cells move at once.
    const a = sig(16, 16, (i) => (i > 100 ? [200, 30, 30] : [10, 10, 10]));
    const b = flat(16, 16, 10);
    expect(matches(a, b)).toBe(false);
  });

  it('rejects an inverted colour ramp even though overall brightness is similar', () => {
    // The palettes bug from M3, seen through the renderer instead of the ramp.
    const a = sig(8, 8, (i) => [i * 4, 20, 255 - i * 4]);
    const b = sig(8, 8, (i) => [255 - i * 4, 20, i * 4]);
    expect(matches(a, b)).toBe(false);
  });

  it('the default tolerance is exact', () => {
    expect(DEFAULT_TOLERANCE).toBe(0);
  });
});

describe('describe', () => {
  it('names the region that moved', () => {
    const a = flat(4, 4, 0);
    const b = flat(4, 4, 0);
    b.cells[(1 * 4 + 3) * 3] = 99;
    const line = describeDiff('tour-mid', compare(a, b));
    expect(line).toContain('tour-mid');
    expect(line).toContain('(3,1)');
    expect(line).toContain('1/16');
  });
});
