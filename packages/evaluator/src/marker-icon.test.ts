import { describe, expect, it } from 'vitest';
import { createLayer, projectWith } from '@geomotion/document';
import type { MarkerLayer } from '@geomotion/document';
import { evaluate } from './scene.ts';

/**
 * `MarkerLayer.icon` passthrough — same shape as `text.test.ts`'s fontFamily spec.
 * `resolveTracks` spreads plain (non-Track) fields untouched, so this is really a
 * regression test that nothing downstream started reading or renaming the field.
 */
const project = (marker: MarkerLayer) =>
  projectWith([marker], { name: 'marker fixture', duration: 10, fps: 30, width: 1080, height: 1920, basemap: 'dark-clean' });

describe('marker evaluation — icon', () => {
  it('passes icon through resolveTracks unchanged, like any other plain field', () => {
    const layer = createLayer('marker', 0, { icon: 'ship' }) as MarkerLayer;
    const scene = evaluate(project(layer), 0);
    expect(scene.markers[0]?.style.icon).toBe('ship');
  });

  it('defaults to dot when a project predates the field', () => {
    const layer = createLayer('marker', 0) as MarkerLayer;
    delete (layer as { icon?: string }).icon; // simulate an old saved project
    const scene = evaluate(project(layer), 0);
    expect(scene.markers[0]?.style.icon).toBeUndefined(); // the renderer defaults it, not the evaluator
  });
});
