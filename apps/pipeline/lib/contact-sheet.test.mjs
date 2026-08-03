import { describe, expect, it } from 'vitest';
import { gridDims } from './contact-sheet.mjs';

/**
 * `contactSheet`/`writeContactSheet` themselves aren't unit-tested here for the same
 * reason `narrateSchedule` isn't in schedule.test.mjs — they drive a real browser
 * page, and a mock of that would test the mock. Validated for real instead, against
 * the committed Dandi March project (12 frames at t=0..42.38, --every=4): a real
 * 4x3 grid PNG inspected by eye, correct route rendering, correct z-order, correct
 * per-cell labels, no misaligned cells.
 */
describe('gridDims', () => {
  it('picks a square-ish grid for a typical spot-check count', () => {
    expect(gridDims(12)).toEqual({ gridCols: 4, gridRows: 3 });
    expect(gridDims(9)).toEqual({ gridCols: 3, gridRows: 3 });
    expect(gridDims(7)).toEqual({ gridCols: 3, gridRows: 3 });
  });

  it('handles a single frame', () => {
    expect(gridDims(1)).toEqual({ gridCols: 1, gridRows: 1 });
  });

  it('honours an explicit column count, sizing rows to fit', () => {
    expect(gridDims(12, 6)).toEqual({ gridCols: 6, gridRows: 2 });
    expect(gridDims(10, 4)).toEqual({ gridCols: 4, gridRows: 3 }); // last row partial
  });
});
