import { describe, expect, it } from 'vitest';
import { createLayer, projectWith } from '@geomotion/document';
import type { TextLayer } from '@geomotion/document';
import { evaluate } from './scene.ts';

/**
 * Behavioural spec for `text` layer evaluation specifically — font family
 * passthrough and the `pop` animation, added to give GeoMotion's own text layer
 * more of the expressive range that had otherwise meant reaching for a separate
 * tool (Hyperframe) for anything beyond a plain fade/slide.
 */
const project = (text: TextLayer) =>
  projectWith([text], { name: 'text fixture', duration: 10, fps: 30, width: 1080, height: 1920, basemap: 'dark-clean' });

describe('text evaluation — fontFamily', () => {
  it('passes fontFamily through resolveTracks unchanged, like any other plain field', () => {
    const layer = createLayer('text', 0, { text: 'Hi', fontFamily: 'serif' }) as TextLayer;
    const scene = evaluate(project(layer), 0);
    expect(scene.texts[0]?.style.fontFamily).toBe('serif');
  });

  it('defaults to sans when a project predates the field', () => {
    const layer = createLayer('text', 0, { text: 'Hi' }) as TextLayer;
    delete (layer as { fontFamily?: string }).fontFamily; // simulate an old saved project
    const scene = evaluate(project(layer), 0);
    expect(scene.texts[0]?.style.fontFamily).toBeUndefined(); // the renderer defaults it, not the evaluator
  });
});

describe('text evaluation — pop animation', () => {
  it('is always 1 (no scale change) for every animation except pop', () => {
    for (const anim of ['none', 'fade', 'slideUp', 'typewriter', 'wipe'] as const) {
      const layer = createLayer('text', 0, { text: 'Hi', anim, fade: 1, in: 0, out: 5 }) as TextLayer;
      const scene = evaluate(project(layer), 0.5);
      expect(scene.texts[0]?.pop).toBe(1);
    }
  });

  it('overshoots past 1 then settles exactly at 1 for pop, the whole point of easeOutBack', () => {
    const layer = createLayer('text', 0, { text: 'Hi', anim: 'pop', fade: 1, in: 0, out: 5 }) as TextLayer;
    const samples = Array.from({ length: 20 }, (_, i) => evaluate(project(layer), (i / 19) * 1).texts[0]!.pop);
    expect(Math.max(...samples)).toBeGreaterThan(1);
    expect(samples.at(-1)).toBeCloseTo(1, 2);
  });

  it('starts at 0 (invisible-small) right at the layer\'s own in-point', () => {
    const layer = createLayer('text', 2, { text: 'Hi', anim: 'pop', fade: 1, in: 2, out: 8 }) as TextLayer;
    const scene = evaluate(project(layer), 2);
    expect(scene.texts[0]?.pop).toBeCloseTo(0, 6);
  });
});
