import { describe, expect, it } from 'vitest';
import { createNode, nodeTypeDef, nodeTypes, propsOf, registerNodeType } from './index.ts';
import { createLayer, migrate } from '../project.ts';
import { layersOf } from '../nodes.ts';
import type { Layer } from '../types.ts';

/**
 * The registry is the one description of what a node type is (ENGINEERING_GUIDE §3.4).
 *
 * The test that earns its keep is the coverage one: every field a fresh node carries has to
 * be described or explicitly marked custom. That is what makes "a property without metadata
 * does not appear in the UI" a rule rather than an accident — without it, adding a field to a
 * type and forgetting the inspector is silent, which is exactly how the hand-written panels
 * drifted from the model in the first place.
 */

describe('every registered type', () => {
  const types = nodeTypes();

  it('is there', () => {
    expect(types.map((t) => t.type).sort()).toEqual(
      ['camera', 'clouds', 'group', 'image', 'mapContext', 'marker', 'regions', 'route', 'shape', 'text'].sort(),
    );
  });

  it.each(types.map((t) => t.type))('%s describes every field it constructs', (type) => {
    const node = createNode(type, 0) as unknown as Record<string, unknown>;
    const described = new Set(propsOf(type).map((m) => m.prop));
    const missing = Object.keys(node).filter((key) => !described.has(key));
    expect(missing, `${type} has undescribed properties`).toEqual([]);
  });

  it.each(types.map((t) => t.type))('%s describes nothing it does not have', (type) => {
    // The other direction: metadata for a property that was renamed or removed renders a row
    // wired to nothing, which reads as a broken control rather than a missing one.
    const node = createNode(type, 0) as unknown as Record<string, unknown>;
    const stray = propsOf(type)
      // A property declared `optional` is absent on purpose — absent *is* its meaning, as
      // with a map context's basemap ("the project's own"). Everything else must be there.
      .filter((m) => !m.optional)
      .map((m) => m.prop)
      .filter((prop) => !(prop in node));
    expect(stray, `${type} describes properties it does not have`).toEqual([]);
  });

  it.each(types.map((t) => t.type))('%s gives every row a label', (type) => {
    for (const meta of propsOf(type)) expect(meta.label.length).toBeGreaterThan(0);
  });

  it.each(types.map((t) => t.type))('%s bounds every number it offers a slider for', (type) => {
    // A slider with no range has nothing to scrub between.
    for (const meta of propsOf(type)) {
      if (meta.row.kind === 'number' && meta.row.slider) {
        expect(meta.row.min, `${type}.${meta.prop}`).toBeDefined();
        expect(meta.row.max, `${type}.${meta.prop}`).toBeDefined();
      }
    }
  });

  it.each(types.map((t) => t.type))('%s constructs a node of its own type', (type) => {
    expect((createNode(type, 0) as { type: string }).type).toBe(type);
  });
});

describe('the registry as the source of defaults', () => {
  it('builds the same layer `createLayer` does', () => {
    // Ids and the colour cursor differ by construction; everything else must not.
    const strip = (n: unknown) => JSON.parse(JSON.stringify(n, (k, v) => (k === 'id' || k === 'color' ? '' : v)));
    expect(strip(createNode('marker', 3))).toEqual(strip(createLayer('marker', 3)));
  });

  it('fills a loaded layer from the type that owns it', () => {
    const p = migrate({ layers: [{ type: 'clouds', id: 'c', in: 0 }] });
    const clouds = layersOf(p)[0] as Extract<Layer, { type: 'clouds' }>;
    expect(clouds.coverage).toBe(0.85);
    expect(clouds.clear.kind).toBe('keyframed');
  });

  it('keeps a type nobody registered, rather than rewriting it', () => {
    /*
     * A document from a newer build, or one a plugin's node type made. Converting it into
     * something this build understands would destroy it on the next save; nothing draws it,
     * and it round-trips intact.
     */
    const p = migrate({ layers: [{ type: 'hologram', id: 'h', in: 0, glitter: 3 }] });
    const node = layersOf(p)[0] as unknown as Record<string, unknown>;
    expect(node.type).toBe('hologram');
    expect(node.glitter).toBe(3);
    // Filled with what every layer has, so the timeline and the panel can still show it.
    expect(node.visible).toBe(true);
    expect(typeof node.fade).toBe('number');
    expect(node).not.toHaveProperty('text');
  });
});

describe('registerNodeType', () => {
  it('re-registering the same definition is fine, so a dev reload does not throw', () => {
    const def = nodeTypeDef('marker')!;
    expect(() => registerNodeType(def)).not.toThrow();
  });

  it('refuses a different definition claiming a type that is taken', () => {
    // A plugin shadowing a core node type — §15 forbids it, and a silent replacement would
    // change what every existing project means.
    expect(() =>
      registerNodeType({ type: 'marker', kind: 'Impostor', create: () => createLayer('text', 0), props: [] }),
    ).toThrow(/already registered/);
  });
});
