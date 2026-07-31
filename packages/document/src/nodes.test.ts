import { describe, expect, it } from 'vitest';
import { createCamera } from './camera.ts';
import {
  addNode,
  ancestorsOf,
  camerasOf,
  childrenOf,
  descendantsOf,
  duplicateNode,
  isGroupNode,
  isLayerNode,
  layerAt,
  layersOf,
  liveCamera,
  moveNodeBy,
  nodeAt,
  removeNode,
  setNodeParent,
} from './nodes.ts';
import { createLayer, emptyProject } from './project.ts';
import { createGroup } from './schema/index.ts';
import { transact } from './transact.ts';
import type { LayerType, Project } from './types.ts';
import type { DocNode } from './nodes.ts';

/** A project with `types` added in order, plus the camera `emptyProject` starts with. */
function projectWith(...types: LayerType[]): Project {
  return transact(emptyProject(), (d) => {
    for (const type of types) addNode(d, createLayer(type, 0));
  }).next;
}

const names = (p: Project) => layersOf(p).map((l) => l.name);

describe('the node store', () => {
  it('keeps layers in the order they were added', () => {
    const p = projectWith('route', 'marker', 'text');
    expect(names(p)).toEqual(['Route', 'Marker', 'Text']);
  });

  it('gives every node a distinct order key', () => {
    const p = projectWith('route', 'marker', 'text', 'shape');
    const keys = Object.values(p.nodes).map((n) => n.order);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('inserts after a named sibling', () => {
    const p = projectWith('route', 'marker', 'text');
    const marker = layersOf(p)[1]!;
    const next = transact(p, (d) => {
      addNode(d, createLayer('shape', 0), { after: marker.id });
    }).next;
    expect(names(next)).toEqual(['Route', 'Marker', 'Shape', 'Text']);
  });

  it('appends when the sibling it was told to follow is gone', () => {
    // A duplicate whose source was deleted in the same gesture must still land.
    const p = projectWith('route', 'marker');
    const next = transact(p, (d) => {
      addNode(d, createLayer('text', 0), { after: 'nd_vanished' });
    }).next;
    expect(names(next)).toEqual(['Route', 'Marker', 'Text']);
  });

  it('keeps cameras out of the layer list, and layers out of the camera list', () => {
    const p = projectWith('route');
    expect(layersOf(p).map((l) => l.type)).toEqual(['route']);
    expect(camerasOf(p).map((c) => c.type)).toEqual(['camera']);
    expect(liveCamera(p)).toBe(camerasOf(p)[0]);
    expect(layerAt(p, camerasOf(p)[0]?.id ?? '')).toBeUndefined();
  });

  it('reads a node of either kind by id', () => {
    const p = projectWith('route');
    const layer = layersOf(p)[0];
    expect(nodeAt(p, layer?.id ?? '')).toBe(layer);
    expect(nodeAt(p, 'nd_nothing')).toBeUndefined();
  });
});

describe('moveNodeBy', () => {
  it('swaps a layer with the neighbour above it', () => {
    const p = projectWith('route', 'marker', 'text');
    const marker = layersOf(p)[1];
    const next = transact(p, (d) => moveNodeBy(d, marker?.id ?? '', 1)).next;
    expect(names(next)).toEqual(['Route', 'Text', 'Marker']);
  });

  it('swaps a layer with the neighbour below it', () => {
    const p = projectWith('route', 'marker', 'text');
    const marker = layersOf(p)[1];
    const next = transact(p, (d) => moveNodeBy(d, marker?.id ?? '', -1)).next;
    expect(names(next)).toEqual(['Marker', 'Route', 'Text']);
  });

  it('refuses at the ends rather than wrapping', () => {
    const p = projectWith('route', 'marker');
    const first = layersOf(p)[0];
    const tx = transact(p, (d) => moveNodeBy(d, first?.id ?? '', -1));
    expect(tx.forward).toEqual([]);
  });

  it('touches only the moving node', () => {
    // The point of fractional indices: a reorder is one patch to one field, so two people
    // reordering different layers cannot overwrite each other's positions (§04 D01).
    const p = projectWith('route', 'marker', 'text');
    const marker = layersOf(p)[1];
    const tx = transact(p, (d) => moveNodeBy(d, marker?.id ?? '', 1));
    expect(tx.forward).toHaveLength(1);
    expect(tx.forward[0]?.path).toEqual(['nodes', marker?.id, 'order']);
  });

  it('survives repeated moves into the same gap', () => {
    let p = projectWith('route', 'marker', 'text', 'shape');
    for (let i = 0; i < 200; i++) {
      const id = layersOf(p)[0]?.id ?? '';
      p = transact(p, (d) => moveNodeBy(d, id, 1)).next;
      p = transact(p, (d) => moveNodeBy(d, id, -1)).next;
    }
    expect(names(p)).toEqual(['Route', 'Marker', 'Text', 'Shape']);
  });
});

describe('removeNode', () => {
  it('removes the node', () => {
    const p = projectWith('route', 'marker');
    const route = layersOf(p)[0];
    const next = transact(p, (d) => removeNode(d, route?.id ?? '')).next;
    expect(names(next)).toEqual(['Marker']);
  });

  it('removes the subtree, so nothing is left unreachable', () => {
    // §3.2: deleting a node deletes its subtree in the same transaction. On a flat store
    // the alternative — children still in the record, reachable from nothing — is the
    // default failure rather than an unlikely one.
    const p = projectWith('route', 'marker', 'text');
    const [route, marker, text] = layersOf(p);
    const nested = transact(p, (d) => {
      setNodeParent(d, marker?.id ?? '', route?.id ?? '');
      setNodeParent(d, text?.id ?? '', marker?.id ?? '');
    }).next;
    expect(descendantsOf(nested, route?.id ?? '')).toEqual([marker?.id, text?.id]);

    const next = transact(nested, (d) => removeNode(d, route?.id ?? '')).next;
    expect(layersOf(next)).toEqual([]);
  });

  it('does nothing for an id that is not there', () => {
    const p = projectWith('route');
    expect(transact(p, (d) => removeNode(d, 'nd_nothing')).forward).toEqual([]);
  });
});

describe('setNodeParent', () => {
  it('moves a node under another and reports it as a child', () => {
    const p = projectWith('route', 'marker');
    const [route, marker] = layersOf(p);
    const next = transact(p, (d) => setNodeParent(d, marker?.id ?? '', route?.id ?? '')).next;

    expect(childrenOf(next, route?.id ?? '').map((n) => n.id)).toEqual([marker?.id]);
    expect(childrenOf(next, null).map((n) => n.id)).not.toContain(marker?.id);
  });

  it('refuses to put a node inside its own subtree', () => {
    // Which would detach the subtree from the document while leaving it in the store.
    const p = projectWith('route', 'marker');
    const [route, marker] = layersOf(p);
    const nested = transact(p, (d) => setNodeParent(d, marker?.id ?? '', route?.id ?? '')).next;
    const tx = transact(nested, (d) => setNodeParent(d, route?.id ?? '', marker?.id ?? ''));
    expect(tx.forward).toEqual([]);
  });
});

describe('the ordered views', () => {
  it('return the same array until the store changes', () => {
    // Load-bearing, not an optimisation: a selector returning a fresh array every render is
    // an infinite render loop under zustand's snapshot check.
    const p = projectWith('route');
    expect(layersOf(p)).toBe(layersOf(p));
    expect(camerasOf(p)).toBe(camerasOf(p));

    const next = transact(p, (d) => addNode(d, createLayer('marker', 0))).next;
    expect(layersOf(next)).not.toBe(layersOf(p));
    expect(layersOf(next)).toHaveLength(2);
  });

  it('read a draft as it stands now, not as it stood earlier in the recipe', () => {
    /*
     * A draft keeps its identity while its contents change, so caching one would hand the
     * second call in a recipe the list from before the first mutator ran — and two nodes
     * would be handed the same order key. Adding three layers in one transaction is the
     * ordinary case that would break.
     */
    const p = transact(emptyProject(), (d) => {
      addNode(d, createLayer('route', 0));
      expect(layersOf(d)).toHaveLength(1);
      addNode(d, createLayer('marker', 0));
      expect(layersOf(d)).toHaveLength(2);
      addNode(d, createLayer('text', 0));
    }).next;

    expect(names(p)).toEqual(['Route', 'Marker', 'Text']);
    expect(new Set(Object.values(p.nodes).map((n) => n.order)).size).toBe(4);
  });

  it('place a node correctly after another node was moved in the same recipe', () => {
    /*
     * Positions are read from the base state to avoid drafting every node in the store —
     * so a recipe that *rewrites* a position has made that base stale, and the reads after
     * it must fall back. Reordering and then adding in one transaction is the case.
     */
    const p = projectWith('route', 'marker', 'text');
    const route = layersOf(p)[0]!;
    const next = transact(p, (d) => {
      moveNodeBy(d, route.id, 1);
      addNode(d, createLayer('shape', 0), { after: route.id });
    }).next;

    expect(names(next)).toEqual(['Marker', 'Route', 'Shape', 'Text']);
    expect(new Set(Object.values(next.nodes).map((n) => n.order)).size).toBe(5);
  });

  it('order two nodes that claim the same key by id, so every machine agrees', () => {
    // Unreachable through the mutators; reachable through a hand-edited file, and "which of
    // these draws on top" still has to have one answer.
    const p = projectWith('route', 'marker');
    const [a, b] = layersOf(p);
    const clashed = transact(p, (d) => {
      const node = d.nodes[b?.id ?? ''];
      if (node) node.order = a?.order ?? '';
    }).next;
    const ids = layersOf(clashed).map((l) => l.id);
    expect(ids).toEqual([...ids].sort());
  });
});

describe('a camera in the store', () => {
  it('is added like any other node', () => {
    const p = transact(emptyProject(), (d) => addNode(d, createCamera())).next;
    expect(camerasOf(p)).toHaveLength(2);
    expect(liveCamera(p)).toBe(camerasOf(p)[0]);
  });
});

describe('groups in the store', () => {
  /** A project with `Beat` holding two layers, plus one at the root above it. */
  function nested() {
    const group = createGroup('Beat');
    const inner1 = createLayer('marker', 0);
    const inner2 = createLayer('text', 0);
    const outer = createLayer('shape', 0);
    const project = transact(emptyProject(), (d) => {
      addNode(d, group);
      addNode(d, inner1, { parentId: group.id });
      addNode(d, inner2, { parentId: group.id });
      addNode(d, outer);
    }).next;
    return { project, group, inner1, inner2, outer };
  }

  it('is not a layer, and does not appear in the draw order', () => {
    const { project, group } = nested();
    expect(isGroupNode(project.nodes[group.id] as DocNode)).toBe(true);
    expect(isLayerNode(project.nodes[group.id] as DocNode)).toBe(false);
    expect(layersOf(project).map((l) => l.id)).not.toContain(group.id);
  });

  it('draws its children where it sits, not at either end', () => {
    const { project, inner1, inner2, outer } = nested();
    expect(layersOf(project).map((l) => l.id)).toEqual([inner1.id, inner2.id, outer.id]);
  });

  it('reports the nodes above a layer, nearest first', () => {
    const { project, group, inner1 } = nested();
    expect(ancestorsOf(project, inner1.id).map((n) => n.id)).toEqual([group.id]);
    expect(ancestorsOf(project, group.id)).toEqual([]);
  });

  it('steps a layer past a group, because both hold a place in the draw order', () => {
    const { project, group, outer } = nested();
    const next = transact(project, (d) => moveNodeBy(d, outer.id, -1)).next;
    // The camera is a root too, and is deliberately not in the draw order — a layer that
    // sorts either side of it renders identically, which is why it is filtered here.
    const drawn = childrenOf(next, null).filter((n) => n.type !== 'camera');
    expect(drawn.map((n) => n.id)).toEqual([outer.id, group.id]);
  });

  it('duplicates a subtree with fresh ids and the same order', () => {
    const { project, group, inner1, inner2 } = nested();
    let copyId: string | undefined;
    const next = transact(project, (d) => {
      copyId = duplicateNode(d, group.id, (name) => name + ' copy');
    }).next;

    const copied = childrenOf(next, copyId as string);
    expect(next.nodes[copyId as string]?.name).toBe('Beat copy');
    expect(copied.map((n) => n.type)).toEqual(['marker', 'text']);
    expect(copied.map((n) => n.id)).not.toContain(inner1.id);
    expect(copied.map((n) => n.id)).not.toContain(inner2.id);
    // Both subtrees are intact and independent.
    expect(childrenOf(next, group.id)).toHaveLength(2);
  });

  it('takes the subtree when the group is deleted', () => {
    const { project, group, outer } = nested();
    const next = transact(project, (d) => removeNode(d, group.id)).next;
    expect(Object.keys(next.nodes).filter((id) => id !== outer.id && next.nodes[id]?.type !== 'camera')).toEqual([]);
  });

  it('stops rather than looping on a parent cycle', () => {
    // Only reachable through a hand-edited file. The requirement is that the walk and the
    // ancestor read both terminate — a hung tab is worse than a wrong row.
    const a = createGroup('A');
    const b = createGroup('B');
    const project = transact(emptyProject(), (d) => {
      addNode(d, a);
      addNode(d, b, { parentId: a.id });
      const nodeA = d.nodes[a.id];
      if (nodeA) nodeA.parentId = b.id;
    }).next;

    expect(() => layersOf(project)).not.toThrow();
    expect(ancestorsOf(project, a.id).length).toBeLessThanOrEqual(2);
  });
});
