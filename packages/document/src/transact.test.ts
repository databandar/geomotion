import { describe, expect, it } from 'vitest';
import type { Layer, Project, RegionsLayer, TextLayer } from './types.ts';
import { createLayer, emptyProject, projectWith as buildProject } from './project.ts';
import { addNode, camerasOf, layersOf } from './nodes.ts';
import { applyPatches, isNoop, transact } from './transact.ts';

/**
 * Behavioural spec for the write path.
 *
 * ENGINEERING_GUIDE §1.3 makes `transact` the only way a document changes, and
 * §1.4 requires every change to be undoable. The properties that matter are that
 * the input is never touched, that the patch pair round-trips exactly, and that
 * untouched subtrees are *shared* rather than copied — the last one is the whole
 * reason this exists, and it is invisible unless asserted by identity.
 */

function projectWith(...layers: Layer[]): Project {
  return buildProject(layers);
}

/** The nth layer in draw order, as the array index used to mean. */
const layerAt = (p: Project, i: number) => layersOf(p)[i];

/** A layer carrying a big payload, standing in for inlined GeoJSON. */
function heavyRegions(id: string): RegionsLayer {
  const layer = createLayer('regions', 0) as RegionsLayer;
  return Object.assign(layer, { id, geojson: 'x'.repeat(200_000) });
}

describe('transact', () => {
  it('never mutates the document it was given', () => {
    const doc = projectWith(createLayer('text', 0));
    const before = JSON.stringify(doc);
    transact(doc, (d) => {
      d.duration = 999;
      addNode(d, createLayer('marker', 1));
    });
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('applies the recipe to the produced document', () => {
    const doc = projectWith();
    const { next } = transact(doc, (d) => {
      d.name = 'Renamed';
      d.duration = 42;
    });
    expect(next.name).toBe('Renamed');
    expect(next.duration).toBe(42);
  });

  it('shares untouched subtrees by reference instead of copying them', () => {
    // The point of the whole exercise: editing one layer must not copy the
    // multi-megabyte GeoJSON hanging off another.
    const heavy = heavyRegions('heavy');
    const text = createLayer('text', 0);
    const doc = projectWith(heavy, text);

    const { next } = transact(doc, (d) => {
      (layersOf(d)[1] as TextLayer).text = 'edited';
    });

    expect(next).not.toBe(doc);
    expect(layerAt(next, 1)).not.toBe(layerAt(doc, 1)); // the edited one is new
    expect(layerAt(next, 0)).toBe(layerAt(doc, 0)); // the heavy one is the same object
    expect(camerasOf(next)[0]).toBe(camerasOf(doc)[0]); // and so is everything else
  });

  it('produces a patch pair that round-trips exactly', () => {
    const doc = projectWith(createLayer('text', 0));
    const tx = transact(doc, (d) => {
      d.duration = 77;
      addNode(d, createLayer('shape', 2));
    });

    expect(applyPatches(doc, tx.forward)).toEqual(tx.next);
    expect(applyPatches(tx.next, tx.backward)).toEqual(doc);
  });

  it('round-trips through a long chain of edits', () => {
    let doc = projectWith(createLayer('text', 0));
    const original = doc;
    const undos: ReturnType<typeof transact>['backward'][] = [];

    for (let i = 0; i < 25; i++) {
      const tx = transact(doc, (d) => {
        d.duration = i;
        if (i % 3 === 0) addNode(d, createLayer('marker', i));
        const layers = layersOf(d);
        if (i % 7 === 0 && layers.length > 1) delete d.nodes[layers[layers.length - 1]!.id];
      });
      undos.push(tx.backward);
      doc = tx.next;
    }
    for (const patches of undos.reverse()) doc = applyPatches(doc, patches);

    expect(doc).toEqual(original);
  });

  it('reports a recipe that changed nothing as a no-op', () => {
    const doc = projectWith(createLayer('text', 0));
    const tx = transact(doc, () => {
      /* an early return, as when a lookup misses */
    });
    expect(isNoop(tx)).toBe(true);
    expect(tx.next).toBe(doc);
  });

  it('does not report a real change as a no-op', () => {
    expect(isNoop(transact(projectWith(), (d) => void (d.duration = 5)))).toBe(false);
  });

  it('replaces the document wholesale when the recipe returns one', () => {
    const doc = projectWith(createLayer('text', 0));
    const loaded = { ...emptyProject(), name: 'Loaded', duration: 12 };
    const tx = transact(doc, () => loaded);

    expect(tx.next.name).toBe('Loaded');
    expect(applyPatches(tx.next, tx.backward)).toEqual(doc);
  });

  it('freezes the result so a write outside a transaction fails loudly', () => {
    // A silent mutation would bypass undo and leave the map showing state no
    // history entry can restore.
    const { next } = transact(projectWith(createLayer('text', 0)), (d) => void (d.duration = 3));
    expect(() => {
      (next as { duration: number }).duration = 99;
    }).toThrow();
    expect(() => {
      next.nodes.injected = createLayer('marker', 0);
    }).toThrow();
  });

  it('tolerates a concise arrow body that returns a value incidentally', () => {
    // `(d) => d.story.push(x)` returns the new array length. That is the most natural way
    // to write a one-line edit, so it must not be an error.
    const doc = projectWith();
    const tx = transact(doc, (d) => d.story.push({ id: 'b', t: 0, d: 1, nodes: [] }) as unknown as void);
    expect(tx.next.story).toHaveLength(1);
    expect(applyPatches(tx.next, tx.backward)).toEqual(doc);
  });

  it('still rejects mutating the draft and returning a document', () => {
    // That is genuinely ambiguous — which one did the caller mean?
    expect(() =>
      transact(projectWith(), (d) => {
        d.duration = 5;
        return emptyProject();
      }),
    ).toThrow();
  });

  it('handles deep edits inside a layer', () => {
    const regions = createLayer('regions', 0) as RegionsLayer;
    const doc = projectWith(regions);
    const tx = transact(doc, (d) => {
      const l = layersOf(d)[0] as RegionsLayer;
      l.values = { Kerala: 1 };
      l.tour.customOrder.push('Kerala');
    });
    expect((layerAt(tx.next, 0) as RegionsLayer).values).toEqual({ Kerala: 1 });
    expect(applyPatches(tx.next, tx.backward)).toEqual(doc);
  });
});
