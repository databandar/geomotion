import { describe, expect, it } from 'vitest';
import {
  collides,
  labelAppear,
  labelBox,
  labelPriority,
  needsOffset,
  offScreen,
  offsetLabel,
} from './labels.ts';

const v = (value: number | null) => ({ value });

describe('labelPriority', () => {
  it('places tour stops first, in tour order', () => {
    // The inspector's ranking is the on-screen priority, so a reordered tour has to
    // change who survives a collision.
    expect(labelPriority([2, 0], [v(1), v(2), v(3)])).toEqual([2, 0, 1]);
  });

  it('adds the regions the tour skipped, so the closing shot is the whole picture', () => {
    expect(labelPriority([0], [v(1), v(2), v(3)])).toEqual([0, 1, 2]);
  });

  it('leaves out a skipped region that has no value', () => {
    // Nothing to print — an empty box would still take space and push a real label out.
    expect(labelPriority([0], [v(1), v(null), v(3)])).toEqual([0, 2]);
  });

  it('still labels a region with no value if the tour visits it', () => {
    // Visiting it is a deliberate choice; the drawing shows an em dash.
    expect(labelPriority([1], [v(1), v(null)])).toEqual([1, 0]);
  });

  it('never lists a region twice', () => {
    // A saved tour can name the same stop twice; two labels in one place read as a
    // rendering fault, and the second would collide with the first and vanish anyway.
    expect(labelPriority([1, 1, 0], [v(1), v(2)])).toEqual([1, 0]);
  });

  it('drops a stop that no longer resolves to a region', () => {
    // Importing new data under a saved tour leaves indices pointing past the end.
    expect(labelPriority([5, 0], [v(1), v(2)])).toEqual([0, 1]);
  });

  it('handles a tour of nothing', () => {
    expect(labelPriority([], [])).toEqual([]);
  });
});

describe('labelAppear', () => {
  it('is nothing before the outro starts and everything at the end', () => {
    expect(labelAppear(0, 10, 0)).toBe(0);
    expect(labelAppear(1, 10, 9)).toBe(1);
  });

  it('brings the last label in before the outro is over', () => {
    // The `+ 6` overlap exists for this: without it the final label of a long list
    // would still be arriving as the shot ends.
    expect(labelAppear(0.95, 40, 39)).toBe(1);
  });

  it('starts earlier labels first', () => {
    // Early in the outro, so the comparison lands on the ramp rather than on two
    // labels that have both already finished arriving.
    expect(labelAppear(0.05, 20, 1)).toBeGreaterThan(labelAppear(0.05, 20, 2));
  });

  it('stays inside 0..1 however odd the inputs', () => {
    for (const [t, n, i] of [[-1, 5, 0], [9, 5, 0], [0.5, 0, 0], [0.5, 5, 99]] as const) {
      const a = labelAppear(t, n, i);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(1);
    }
  });
});

describe('needsOffset', () => {
  it('pushes the label out when the region is smaller than the text', () => {
    expect(needsOffset(10, 40)).toBe(true);
  });

  it('leaves the label in place on a region with room for it', () => {
    expect(needsOffset(400, 40)).toBe(false);
  });
});

describe('offsetLabel', () => {
  it('pushes away from the centre of the frame', () => {
    // Top-left of frame goes further up and left, so the leader line crosses less map.
    const at = offsetLabel({ x: 100, y: 100 }, 30, 20, 960, 540);
    expect(at.x).toBeLessThan(100);
    expect(at.y).toBeLessThan(100);
  });

  it('pushes the other way from the opposite corner', () => {
    const at = offsetLabel({ x: 860, y: 440 }, 30, 20, 960, 540);
    expect(at.x).toBeGreaterThan(860);
    expect(at.y).toBeGreaterThan(440);
  });

  it('keeps the whole box on screen rather than dropping the label', () => {
    // A region at the very edge would otherwise push its label clean out of frame.
    const w = 60;
    const at = offsetLabel({ x: 955, y: 535 }, w, 20, 960, 540);
    expect(at.x + w).toBeLessThanOrEqual(960);
    expect(at.y).toBeLessThanOrEqual(540);
    expect(at.x - w).toBeGreaterThanOrEqual(0);
  });
});

describe('collides', () => {
  const box = labelBox(100, 100, 40, 20);

  it('sees nothing to collide with in an empty frame', () => {
    expect(collides(box, [])).toBe(false);
  });

  it('rejects a label overlapping one already placed', () => {
    expect(collides(box, [labelBox(120, 100, 40, 20)])).toBe(true);
  });

  it('allows two labels that only touch', () => {
    // Exactly adjacent boxes are legible; treating a shared edge as a collision would
    // drop every second label in a packed column.
    expect(collides(box, [labelBox(180, 100, 40, 20)])).toBe(false);
  });

  it('allows a label clear of the others', () => {
    expect(collides(box, [labelBox(400, 400, 40, 20)])).toBe(false);
  });
});

describe('offScreen', () => {
  it('keeps a label just outside the frame, since it may be pushed back in', () => {
    expect(offScreen({ x: -40, y: -20 }, 960, 540)).toBe(false);
  });

  it('drops one far outside', () => {
    expect(offScreen({ x: -400, y: 200 }, 960, 540)).toBe(true);
  });

  it('drops a point that failed to project', () => {
    // An unprojectable anchor gives NaN, and every comparison against it is false —
    // so without this check the label would be placed at NaN and silently not drawn.
    expect(offScreen({ x: NaN, y: 100 }, 960, 540)).toBe(true);
    expect(offScreen({ x: 100, y: Infinity }, 960, 540)).toBe(true);
  });
});
