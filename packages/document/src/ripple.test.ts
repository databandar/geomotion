import { describe, expect, it } from 'vitest';
import { createLayer } from './project.ts';
import { cuesIn, rippleBlockLength, rippleBlockTo, shiftLayer } from './ripple.ts';
import type { AudioCue, Layer, RouteLayer } from './types.ts';
import type { StoryBlock } from './story.ts';

/**
 * Ripple is what makes the frozen voice bed impossible in both directions: the picture
 * follows the voice when a line is retimed, and the voice follows the picture when a beat
 * is dragged. It touches most of the document at once, so the edges are where it counts.
 */
const block = (id: string, t: number, d: number, nodes: string[]): StoryBlock => ({ id, t, d, nodes });
const cue = (id: string, t: number, d = 1): AudioCue => ({ id, t, d, text: id } as AudioCue);

const route = (id: string, at: number): RouteLayer => {
  const l = createLayer('route', at) as RouteLayer;
  return { ...l, id, out: at + 6 };
};

describe('shiftLayer', () => {
  it('carries the layer and its keyframes together', () => {
    /*
     * Track times are absolute — a route created at 5s has its progress keys at 5 and 9.
     * Shifting only in/out would leave the reveal behind, and the layer would draw itself
     * at a moment it is no longer on screen.
     */
    const before = route('r', 5);
    const after = shiftLayer(before, 3);
    expect(after.in).toBe(8);
    expect(after.out).toBe(before.out + 3);
    expect((after.progress as { keys: { t: number }[] }).keys.map((k) => k.t)).toEqual([8, 12]);
  });

  it('leaves behaviours alone, because they key off local time', () => {
    // The asymmetry is the point of the track/behaviour split: a behaviour moves with its
    // layer by construction, so shifting it too would move it twice.
    const marker = createLayer('marker', 4) as Layer & { behaviours: Record<string, unknown[]> };
    const after = shiftLayer(marker, 5) as typeof marker;
    expect(after.behaviours).toEqual(marker.behaviours);
  });

  it('is a no-op for zero', () => {
    const l = route('r', 5);
    expect(shiftLayer(l, 0)).toBe(l);
  });

  it('does not mutate what it was given', () => {
    const l = route('r', 5);
    const snapshot = JSON.stringify(l);
    shiftLayer(l, 4);
    expect(JSON.stringify(l)).toBe(snapshot);
  });
});

describe('cuesIn', () => {
  const cues = [cue('a', 0), cue('b', 5), cue('c', 9)];

  it('claims a cue by where it starts', () => {
    // A line that overruns its beat is common — that is what makes timing hard — and
    // claiming it by span would let two blocks both move it.
    expect(cuesIn(cues, block('x', 4, 4, [])).map((c) => c.id)).toEqual(['b']);
  });

  it('gives a cue on a boundary to the later block', () => {
    expect(cuesIn(cues, block('x', 0, 5, [])).map((c) => c.id)).toEqual(['a']);
    expect(cuesIn(cues, block('y', 5, 5, [])).map((c) => c.id)).toEqual(['b', 'c']);
  });

  it('claims a cue that starts a hair before its block', () => {
    /*
     * Found on a real composed project, not a fixture. The composer writes cue times
     * rounded and block times not, so an "overview" beat starting at 6.1044 owned a line
     * starting at 6.1040 — and an exact comparison left three of six lines behind when
     * their blocks moved, which is the frozen voice bed this milestone exists to prevent.
     */
    const near = [cue('early', 6.104)];
    expect(cuesIn(near, block('overview', 6.1044, 5)).map((c) => c.id)).toEqual(['early']);
  });

  it('still claims a cue exactly once across adjacent blocks', () => {
    // The tolerance is on both bounds, or it would hand the same line to two blocks and
    // ripple would move it twice.
    const near = [cue('x', 6.104)];
    const claims = [block('a', 1.1, 5.0044), block('b', 6.1044, 5)].filter(
      (bl) => cuesIn(near, bl).length > 0,
    );
    expect(claims.map((c) => c.id)).toEqual(['b']);
  });
});

describe('rippleBlockTo', () => {
  const setup = () => ({
    story: [block('a', 0, 5, ['l1']), block('b', 5, 5, ['l2']), block('c', 10, 5, ['l3'])],
    layers: [route('l1', 0), route('l2', 5), route('l3', 10)] as Layer[],
    cues: [cue('c1', 0), cue('c2', 5), cue('c3', 10)],
  });

  it('moves the block, its layers and its voice together', () => {
    const { story, layers, cues } = setup();
    const out = rippleBlockTo(story, layers, cues, 'b', 7);
    expect(out.story.find((x) => x.id === 'b')?.t).toBe(7);
    expect(out.layers.find((x) => x.id === 'l2')?.in).toBe(7);
    expect(out.cues.find((x) => x.id === 'c2')?.t).toBe(7);
  });

  it('re-anchors what follows and leaves what precedes', () => {
    const { story, layers, cues } = setup();
    const out = rippleBlockTo(story, layers, cues, 'b', 7);
    expect(out.story.find((x) => x.id === 'c')?.t).toBe(12);
    expect(out.layers.find((x) => x.id === 'l3')?.in).toBe(12);
    expect(out.story.find((x) => x.id === 'a')?.t).toBe(0);
    expect(out.layers.find((x) => x.id === 'l1')?.in).toBe(0);
  });

  it('carries a following block\'s keyframes too', () => {
    const { story, layers, cues } = setup();
    const out = rippleBlockTo(story, layers, cues, 'b', 7);
    const l3 = out.layers.find((x) => x.id === 'l3') as RouteLayer;
    expect((l3.progress as { keys: { t: number }[] }).keys[0]?.t).toBe(12);
  });

  it('refuses to go before zero rather than squashing into the next block', () => {
    // Clamping the whole ripple, not the block alone: otherwise dragging the first block
    // left would overlap its successor instead of simply refusing.
    const { story, layers, cues } = setup();
    const out = rippleBlockTo(story, layers, cues, 'a', -5);
    expect(out.story.map((x) => x.t)).toEqual([0, 5, 10]);
  });

  it('moves a shared layer once', () => {
    // Overlap is ordinary — a title spanning a beat boundary — and moving it per block
    // would move it twice.
    const story = [block('a', 0, 5, ['shared']), block('b', 5, 5, ['shared'])];
    const layers = [route('shared', 0)] as Layer[];
    const out = rippleBlockTo(story, layers, [], 'a', 2);
    expect(out.layers[0]?.in).toBe(2);
  });

  it('does nothing for a block it does not have', () => {
    const { story, layers, cues } = setup();
    const out = rippleBlockTo(story, layers, cues, 'nope', 9);
    expect(out.story).toEqual(story);
  });
});

describe('rippleBlockLength', () => {
  const setup = () => ({
    story: [block('a', 0, 5, ['l1']), block('b', 5, 5, ['l2'])],
    layers: [route('l1', 0), route('l2', 5)] as Layer[],
    cues: [cue('c1', 0), cue('c2', 5)],
  });

  it('pushes what follows when a line runs longer', () => {
    // What "re-recording a line re-measures and ripples" means: a longer take does not
    // overlap the next beat, it moves it.
    const { story, layers, cues } = setup();
    const out = rippleBlockLength(story, layers, cues, 'a', 8);
    expect(out.story.find((x) => x.id === 'a')?.d).toBe(8);
    expect(out.story.find((x) => x.id === 'b')?.t).toBe(8);
    expect(out.layers.find((x) => x.id === 'l2')?.in).toBe(8);
    expect(out.cues.find((x) => x.id === 'c2')?.t).toBe(8);
  });

  it('pulls what follows back when a line runs shorter', () => {
    const { story, layers, cues } = setup();
    const out = rippleBlockLength(story, layers, cues, 'a', 3);
    expect(out.story.find((x) => x.id === 'b')?.t).toBe(3);
  });

  it('leaves the resized block\'s own layers where they are', () => {
    // Its start has not moved, so neither has what it choreographs.
    const { story, layers, cues } = setup();
    const out = rippleBlockLength(story, layers, cues, 'a', 8);
    expect(out.layers.find((x) => x.id === 'l1')?.in).toBe(0);
  });

  it('refuses a length of zero', () => {
    // A block with no duration owns no moment and can never be selected again.
    const { story, layers, cues } = setup();
    expect(rippleBlockLength(story, layers, cues, 'a', 0).story[0]?.d).toBeGreaterThan(0);
  });
});
