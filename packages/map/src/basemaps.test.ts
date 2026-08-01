import { describe, expect, it } from 'vitest';
import { BASEMAPS, getBasemap } from './basemaps.ts';

/**
 * The "clean cinematic basemap" requirement (docs/brand/HANDBOOK.md 1.6): a story directs
 * attention with its own callouts, not with whatever place names a default vector style
 * shipped. The `-clean` basemaps exist specifically to have zero symbol layers — this pins
 * that, because a future upstream style refresh re-filtered by hand could silently leave one
 * back in, and the only way that shows up otherwise is a stray label in a rendered frame.
 */
describe('the label-free basemaps', () => {
  for (const id of ['dark-clean', 'positron-clean']) {
    it(`${id} has no symbol layers`, () => {
      const style = getBasemap(id).style;
      if (typeof style === 'string') throw new Error('expected an inline style');
      const symbols = style.layers.filter((l) => l.type === 'symbol');
      expect(symbols).toEqual([]);
    });

    it(`${id} still has real geometry — filtering did not empty the style`, () => {
      const style = getBasemap(id).style;
      if (typeof style === 'string') throw new Error('expected an inline style');
      const nonBackground = style.layers.filter((l) => l.type !== 'background');
      expect(nonBackground.length).toBeGreaterThan(20);
    });
  }

  it('the clean variants keep their source basemap dark/light flag', () => {
    expect(getBasemap('dark-clean').dark).toBe(true);
    expect(getBasemap('positron-clean').dark).toBe(false);
  });

  it('every basemap id in the list is unique', () => {
    const ids = BASEMAPS.map((b) => b.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
