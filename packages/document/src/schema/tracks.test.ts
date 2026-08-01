import { describe, expect, it } from 'vitest';
import { createNode, nodeTypes, trackFallbacksOf, trackPropsOf, valueAtPath } from './index.ts';
import { createLayer, migrate } from '../project.ts';
import { layersOf } from '../nodes.ts';
import { isTrack } from '../track.ts';
import { CURRENT_FORMAT } from '../migrations/index.ts';

/**
 * Format 9 — every declared number is a track
 * (docs/features/every-property-a-track.md).
 *
 * §12.2 makes a serialization round-trip mandatory for every node type, and §12.3 a
 * migration fixture for every bump. Both are here because this change altered the *shape* of
 * twenty-eight properties across seven types, which is the largest surface any format step
 * has touched.
 */

describe('the declaration and the storage agree', () => {
  it.each(nodeTypes().map((t) => t.type))(
    '%s stores a real track at every path it declares as one',
    (type) => {
      /*
       * The failure this catches: a row flipped to `kind: 'track'` while `create` still
       * returns a bare number. Nothing else notices — the inspector renders a source pip
       * over a number, the evaluator resolves nothing, and the property silently stops
       * being animatable at the moment it was supposed to start.
       */
      const node = createNode(type, 0);
      for (const path of trackPropsOf(type)) {
        expect(isTrack(valueAtPath(node, path)), `${type}.${path}`).toBe(true);
      }
    },
  );

  it.each(nodeTypes().map((t) => t.type))('%s has a numeric fallback for every track', (type) => {
    // A fallback of 0 for `scale` or `opacity` is a real and wrong value; the type's own
    // default is the honest answer when a binding cannot resolve.
    const fallbacks = trackFallbacksOf(type);
    for (const path of trackPropsOf(type)) {
      expect(Number.isFinite(fallbacks[path]), `${type}.${path}`).toBe(true);
    }
  });
});

describe('round trip', () => {
  it.each(nodeTypes().map((t) => t.type))('%s survives save → load → deep-equal', (type) => {
    const node = createNode(type, 2)!;
    // Keyed by its own id: the store normalises a node's `id` to its key on load, so keying
    // it under anything else would fail on the id rather than on the properties under test.
    const saved = JSON.parse(JSON.stringify({ format: CURRENT_FORMAT, nodes: { [node.id]: node }, story: [] }));
    const loaded = migrate(saved);
    expect(loaded.nodes[node.id]).toEqual(node);
  });
});

describe('the format 9 migration', () => {
  it('wraps a bare number into a static track', () => {
    const out = migrate({
      format: 8,
      nodes: { t: { id: 't', type: 'text', name: 'T', parentId: null, order: 's', visible: true, in: 0, out: 5, fade: 0.4, size: 72 } },
      story: [],
    });
    const text = layersOf(out)[0] as unknown as Record<string, unknown>;
    expect(text.size).toMatchObject({ kind: 'static', value: 72 });
  });

  it('reaches into a grouped object', () => {
    const out = migrate({
      format: 8,
      nodes: {
        r: {
          id: 'r', type: 'route', name: 'R', parentId: null, order: 's', visible: true, in: 0, out: 5, fade: 0.4,
          marker: { enabled: true, icon: 'plane', color: '#fff', size: 12, rotate: true },
          follow: { enabled: false, zoom: 7, pitch: 40, faceHeading: true },
        },
      },
      story: [],
    });
    const route = layersOf(out)[0] as unknown as { marker: Record<string, unknown>; follow: Record<string, unknown> };
    expect(route.marker.size).toMatchObject({ kind: 'static', value: 12 });
    expect(route.follow.zoom).toMatchObject({ kind: 'static', value: 7 });
    // The siblings survive the walk.
    expect(route.marker.icon).toBe('plane');
    expect(route.follow.faceHeading).toBe(true);
  });

  it('leaves a value that is already a track alone', () => {
    /*
     * A file written by a build part-way through this change, or by a plugin. Wrapping it
     * again would bury the real track inside a static one and freeze the animation — the
     * worst kind of migration bug, because the file still opens.
     */
    const keyed = { kind: 'keyframed', keys: [{ id: 'k', t: 0, value: 30, easing: 'linear' }] };
    const out = migrate({
      format: 8,
      nodes: { t: { id: 't', type: 'text', name: 'T', parentId: null, order: 's', visible: true, in: 0, out: 5, fade: 0.4, size: keyed } },
      story: [],
    });
    expect((layersOf(out)[0] as unknown as Record<string, unknown>).size).toMatchObject({ kind: 'keyframed' });
  });

  it('leaves a non-numeric value alone rather than wrapping nonsense', () => {
    const out = migrate({
      format: 8,
      nodes: { t: { id: 't', type: 'text', name: 'T', parentId: null, order: 's', visible: true, in: 0, out: 5, fade: 0.4, size: 'big' } },
      story: [],
    });
    // Repaired to the default by `coerceToDefaults`, not wrapped into `static: "big"`.
    expect((layersOf(out)[0] as unknown as Record<string, unknown>).size).toMatchObject({ kind: 'static' });
  });

  it('does not touch a node type it has never heard of', () => {
    const out = migrate({
      format: 8,
      nodes: { h: { id: 'h', type: 'hologram', name: 'H', parentId: null, order: 's', visible: true, in: 0, out: 5, fade: 0.4, glitter: 3 } },
      story: [],
    });
    expect((layersOf(out)[0] as unknown as Record<string, unknown>).glitter).toBe(3);
  });
});

describe('a newly tracked property', () => {
  it('is animatable, which is the whole point', () => {
    // Before format 9 this was a number and could not carry a key at all.
    const text = createLayer('text', 0) as unknown as Record<string, unknown>;
    expect(isTrack(text.letterSpacing)).toBe(true);
    expect(isTrack(text.x)).toBe(true);
    expect(isTrack(text.y)).toBe(true);
  });

  it('leaves timing and formatting numbers alone', () => {
    /*
     * `in`/`out`/`fade` are a layer's window on the timeline, not its appearance — animating
     * them is meaningless. `decimals` describes how data reads. Converting them would have
     * been the easy over-reach.
     */
    const regions = createLayer('regions', 0) as unknown as Record<string, unknown>;
    expect(typeof regions.in).toBe('number');
    expect(typeof regions.out).toBe('number');
    expect(typeof regions.fade).toBe('number');
    expect(typeof regions.decimals).toBe('number');
  });
});
