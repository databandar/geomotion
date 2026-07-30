import { applyPatches as immerApplyPatches, enablePatches, produceWithPatches, setAutoFreeze, type Patch } from 'immer';
import type { Project } from './types.ts';

/**
 * Document transactions.
 *
 * ENGINEERING_GUIDE §1.3 ("transactions over mutations") and §1.4 ("undo
 * everything") ask for one write path that produces a patch pair, so history is a
 * log of changes rather than a pile of snapshots.
 *
 * What this replaces: v1's store deep-cloned the entire project through
 * `JSON.parse(JSON.stringify(p))` on every edit, then pushed the previous whole
 * project onto an 80-deep undo stack. With the bundled India boundaries inlined on
 * a layer that is a 246 KB document — 0.2 ms per pointer-move event and ~19 MB of
 * retained history, both scaling linearly with the geometry a user loads. A
 * detailed world boundary set turns that into visible drag latency.
 *
 * Structural sharing means an edit copies only the spine down to what changed;
 * the untouched layers, and the multi-megabyte GeoJSON strings hanging off them,
 * are shared by reference.
 */

enablePatches();

/**
 * Produced documents are deeply frozen, so a mutation outside `transact` throws
 * instead of silently bypassing undo and leaving the map showing state that no
 * history entry can restore. v1 already routed every write through the store's
 * `patch`, so this locks in an invariant that already held rather than imposing a
 * new one.
 */
setAutoFreeze(true);

export type { Patch };

/** One committed change: how to redo it, and how to undo it. */
export interface Transaction {
  next: Project;
  forward: Patch[];
  backward: Patch[];
}

/**
 * Apply `recipe` to a draft of `doc` and commit the result.
 *
 * The recipe mutates the draft freely — that is Immer's draft, not the real
 * document — and returns nothing. To swap the document wholesale (loading a
 * file), return the replacement instead; the patch pair then carries a whole
 * project each way, which is the honest cost of a wholesale load.
 */
export function transact(doc: Project, recipe: (draft: Project) => void | Project): Transaction {
  const [next, forward, backward] = produceWithPatches(doc, (draft: Project) => {
    const result = recipe(draft);
    // Only an object counts as a deliberate replacement. A concise arrow body is
    // the natural way to write a one-line edit — `(d) => d.layers.push(layer)` —
    // and it returns the array's new length, which Immer would otherwise reject
    // as "returned a new value *and* modified its draft". Mutating *and*
    // returning a document is still an error, and still throws.
    return (result && typeof result === 'object' ? result : undefined) as Project;
  });
  return { next, forward, backward };
}

/** Replay patches onto a document. Used by undo and redo. */
export function applyPatches(doc: Project, patches: Patch[]): Project {
  return immerApplyPatches(doc, patches);
}

/**
 * Whether a transaction changed anything.
 *
 * A recipe that bails out early (`if (i < 0) return`) is a legitimate no-op, and
 * committing it would otherwise put an empty step on the undo stack — so undo
 * would appear to do nothing on the first press.
 */
export const isNoop = (tx: Transaction) => tx.forward.length === 0;
