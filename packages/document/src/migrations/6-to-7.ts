/**
 * Format 6 → 7: the scene becomes a flat node store.
 *
 * Format 6 keeps two arrays side by side — `layers` and `cameras`. Format 7 keeps one
 * record, `nodes`, keyed by id, where each node carries `parentId` and a fractional-index
 * `order` (ARCHITECTURE §04 Decision 01; docs/features/node-store.md).
 *
 * Order keys are handed out in one ascending run over the cameras and then the layers, so
 * the layers keep their relative positions — and relative position is draw order, which is
 * the one thing this migration must not disturb. Cameras first because they do not draw:
 * putting them at the head costs nothing and keeps the layer run contiguous.
 *
 * Both old keys are deleted rather than left behind (§3.6.4): two fields meaning the same
 * thing let two readers disagree about which is authoritative, and a stale `layers` array
 * is exactly the sort of thing a later importer would "helpfully" read.
 */
import { createId } from '@geomotion/core';
import { orderBetween } from '../order.ts';

type Loose = Record<string, unknown>;

export function migrate6to7(doc: Loose): Loose {
  const out = { ...doc };
  const cameras = Array.isArray(doc.cameras) ? (doc.cameras as Loose[]) : [];
  const layers = Array.isArray(doc.layers) ? (doc.layers as Loose[]) : [];
  delete out.cameras;
  delete out.layers;

  const nodes: Record<string, Loose> = {};
  let order: string | null = null;

  for (const node of [...cameras, ...layers]) {
    if (!node || typeof node !== 'object') continue;

    /*
     * A record silently keeps the last writer, so a duplicate id would delete a layer on
     * load — the worst failure a migration can have, because the file still opens and the
     * loss looks like something the user did. Both a missing id and a colliding one get a
     * fresh one; the node keeps everything else it had.
     *
     * A re-keyed node loses any story-block link that named it. That is the lesser harm: a
     * block pointing at a node that no longer exists is a no-op ripple, while dropping the
     * node is content gone.
     */
    const claimed = typeof node.id === 'string' && node.id.length > 0 ? node.id : null;
    const id = claimed !== null && !(claimed in nodes) ? claimed : createId();

    order = orderBetween(order, null);
    nodes[id] = { ...node, ...movedAside(node), id, parentId: null, order };
  }

  out.nodes = nodes;
  return out;
}

/**
 * The one field name this migration would otherwise destroy.
 *
 * A region layer written before M9 nested the tour carries a flat `order` — the *region*
 * ordering, `valueDesc` or `alpha` — and this step is about to write a fractional index
 * into a field of that name on every node. §3.6.4 forbids repurposing a field, and this is
 * the one place where the new shape and the old one collide.
 *
 * So the old meaning moves aside under a disambiguated name, exactly as `tourPitch`,
 * `cameraOvershoot` and `cameraBow` did when those fields stopped being siblings of
 * anything. `migrateTour` in project.ts reads it there.
 *
 * Only for a layer whose tour is still flat: once `tour` is an object, its `order` lives
 * inside it and this field is already gone.
 */
function movedAside(node: Loose): Loose {
  const flatTour = !(node.tour && typeof node.tour === 'object');
  if (node.type !== 'regions' || !flatTour || typeof node.order !== 'string') return {};
  return { tourOrder: node.order };
}
