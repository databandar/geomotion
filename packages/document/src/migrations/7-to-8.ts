/**
 * Format 7 → 8: the map context becomes a node.
 *
 * Format 7 keeps `contexts` — a side table of "what the map looks like during a stretch",
 * referenced by id from a story block. Format 8 keeps them in the one flat store as
 * `mapContext` nodes, so a context can hold the layers that belong to it and can be selected,
 * named, locked and undone like anything else (docs/features/map-context-node.md).
 *
 * **Story blocks are untouched.** A block still references a context by id, and that id is now
 * a node id — which is exactly why the previous shape was a table keyed by id rather than an
 * inline copy on the block. The reference survives the container changing underneath it.
 *
 * Contexts are appended after everything already in the store, so no layer's position in the
 * draw order moves and the picture is identical.
 */
import { createId } from '@geomotion/core';
import { orderBetween } from '../order.ts';

type Loose = Record<string, unknown>;

export function migrate7to8(doc: Loose): Loose {
  const out = { ...doc };
  const contexts = Array.isArray(doc.contexts) ? (doc.contexts as Loose[]) : [];
  // Removed rather than left behind: two fields meaning the same thing let two readers
  // disagree about which is authoritative (§3.6.4).
  delete out.contexts;
  if (contexts.length === 0) return out;

  const nodes: Record<string, Loose> = { ...((doc.nodes as Record<string, Loose>) ?? {}) };

  // After the last node, so nothing that draws changes place.
  let order: string | null = null;
  for (const node of Object.values(nodes)) {
    const key = typeof node?.order === 'string' ? node.order : null;
    if (key !== null && (order === null || key > order)) order = key;
  }

  for (const ctx of contexts) {
    if (!ctx || typeof ctx !== 'object') continue;
    /*
     * A context whose id already names a node would replace it — deleting a layer on load,
     * which is the worst failure a migration can have because the file still opens. Both a
     * missing id and a colliding one get a fresh one; a block that referenced the old id then
     * points at nothing, which resolves to the project's own look rather than crashing.
     */
    const claimed = typeof ctx.id === 'string' && ctx.id.length > 0 ? ctx.id : null;
    const id = claimed !== null && !(claimed in nodes) ? claimed : createId();

    order = orderBetween(order, null);
    nodes[id] = {
      ...ctx,
      id,
      type: 'mapContext',
      name: typeof ctx.name === 'string' ? ctx.name : 'Map context',
      parentId: null,
      order,
      visible: true,
      behaviours: {},
    };
  }

  out.nodes = nodes;
  return out;
}
