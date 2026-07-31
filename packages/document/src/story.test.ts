import { describe, expect, it } from 'vitest';
import { blockAt, blocksFor, storyEnd, storyInOrder, type StoryBlock } from './story.ts';

/**
 * Story blocks are the structure the composer used to destroy. Everything the editor
 * will do with them — retiming, rippling, a storyboard — reads through these, so the
 * boundaries matter more than they look.
 */
const b = (id: string, t: number, d: number, nodes: string[] = [], say?: string): StoryBlock => ({
  id, t, d, nodes, ...(say ? { say } : {}),
});

const story = () => [b('c', 10, 5, ['l3']), b('a', 0, 4, ['l1', 'l2'], 'First line'), b('b', 4, 6, ['l2'])];

describe('storyInOrder', () => {
  it('puts blocks in playing order whatever order they are stored in', () => {
    // The document does not promise sorted; every reader would otherwise sort for itself.
    expect(storyInOrder(story()).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });

  it('does not disturb the array it was given', () => {
    const s = story();
    storyInOrder(s);
    expect(s[0]?.id).toBe('c');
  });
});

describe('blockAt', () => {
  it('finds the block covering a moment', () => {
    expect(blockAt(story(), 2)?.id).toBe('a');
    expect(blockAt(story(), 5)?.id).toBe('b');
  });

  it('gives a shared instant to exactly one block', () => {
    /*
     * Half-open `[t, t + d)`. With both ends inclusive, the moment two adjacent blocks
     * meet belongs to both, and scrubbing across a boundary would show whichever the
     * sort happened to put first.
     */
    expect(blockAt(story(), 4)?.id).toBe('b');
    expect(blockAt(story(), 3.999)?.id).toBe('a');
  });

  it('finds nothing in a gap or past the end', () => {
    // A composition may legitimately run on after the last line.
    expect(blockAt(story(), 20)).toBeUndefined();
    expect(blockAt([b('a', 5, 1)], 2)).toBeUndefined();
  });

  it('finds nothing in an empty story', () => {
    // Every project built layer by layer has one.
    expect(blockAt([], 3)).toBeUndefined();
  });
});

describe('blocksFor', () => {
  it('finds every block that choreographs a layer', () => {
    // One layer may belong to two blocks — a title spanning a beat boundary is ordinary,
    // not an error, which is why this returns a list.
    expect(blocksFor(story(), 'l2').map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('finds none for a layer no block mentions', () => {
    expect(blocksFor(story(), 'nope')).toEqual([]);
  });
});

describe('storyEnd', () => {
  it('is the furthest any block reaches, not the last one to start', () => {
    // A long block starting early can outlast a short one starting late.
    expect(storyEnd([b('a', 0, 20), b('b', 5, 2)])).toBe(20);
  });

  it('is zero for an empty story', () => {
    expect(storyEnd([])).toBe(0);
  });
});
