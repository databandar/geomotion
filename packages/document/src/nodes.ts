/**
 * The flat node store — ARCHITECTURE §04 Decision 01, ENGINEERING_GUIDE §3.1.
 *
 * "The scene graph is the logical model. Physically, nodes live in a flat
 * `Map<NodeId, Node>` with `parentId` + fractional-index `order`."
 *
 * So: one record keyed by id holds every node in the document — layers and cameras today,
 * groups and scenes when they exist. The tree is read off `parentId`; sibling order is read
 * off `order`. Child arrays are never stored, because a child list stored in two places is
 * a child list that can disagree with itself.
 *
 * What this buys, in the order the design doc asks for it:
 *
 * - **A parent exists.** Groups, scenes, nested map contexts and nested compositions are all
 *   "a node with children", and none of them are storable in an array of layers.
 * - **Patches address objects, not slots.** A reorder is one patch to one node's `order`
 *   rather than two patches to two array positions — which is what makes §16's per-property
 *   CRDT a merge problem instead of a tree-merge problem.
 * - **Deletion is by id.** Every write path had to find an index first; each one was a place
 *   to be off by one.
 */
import { isDraft, original } from 'immer';
import { compareOrder, orderBetween } from './order.ts';
import type { CameraNode, Layer, Project } from './types.ts';

export type NodeId = string;

/**
 * Anything the store holds.
 *
 * A union rather than a base class: §1.10 asks for composition, and a node type is exactly
 * "a `type` string plus the fields that type needs". Groups and scenes join this union
 * without any existing member changing.
 */
export type DocNode = Layer | CameraNode;

/** The store itself. A plain record, so it serialises and structurally shares as it stands. */
export type NodeStore = Record<NodeId, DocNode>;

/** Whether a node draws. The complement of `isCameraNode`; the two must stay exhaustive. */
export function isLayerNode(node: DocNode): node is Layer {
  return node.type !== 'camera';
}

export function isCameraNode(node: DocNode): node is CameraNode {
  return node.type === 'camera';
}

/* ------------------------------------------------------------------- reading */

/**
 * Sorted, uncached. Every view is built from this one.
 */
function sortedIn(nodes: NodeStore): DocNode[] {
  return Object.values(nodes).sort(compareOrder);
}

/**
 * The memo behind the ordered views, keyed by the `nodes` record itself.
 *
 * Immer gives a fresh record exactly when some node changed and shares the old one
 * otherwise, so identity *is* the invalidation story (§10: "a cache without an invalidation
 * story is a bug factory"). A `WeakMap` needs no byte budget — an entry dies with the
 * document version that keyed it, and a version nothing holds is unreachable.
 *
 * This is not only about speed. `useStore((s) => layersOf(s.project))` returning a freshly
 * built array on every render is an infinite render loop under zustand's snapshot check, so
 * the memo is what makes a derived view usable as a selector at all.
 */
const allCache = new WeakMap<NodeStore, DocNode[]>();
const layerCache = new WeakMap<NodeStore, Layer[]>();
const cameraCache = new WeakMap<NodeStore, CameraNode[]>();

function memo<T>(store: WeakMap<NodeStore, T>, nodes: NodeStore, build: () => T): T {
  /*
   * A draft is never cached. Its identity is stable while its contents change — that is
   * what a draft is — so an entry recorded halfway through a recipe would be handed back
   * to the next call in the same recipe, after another mutator had already moved things.
   * Committed documents are frozen and get the memo; drafts recompute, which is a
   * transaction-rate cost, not a frame-rate one.
   */
  if (isDraft(nodes)) return build();
  const existing = store.get(nodes);
  if (existing) return existing;
  const built = build();
  store.set(nodes, built);
  return built;
}

/** Every node, in a stable order. */
export function nodesOf(project: Project): DocNode[] {
  return memo(allCache, project.nodes, () => sortedIn(project.nodes));
}

/** One node by id, or nothing. */
export function nodeAt(project: Project, id: NodeId): DocNode | undefined {
  return project.nodes[id];
}

/** The children of `parentId`, in order. `null` asks for the roots. */
export function childrenOf(project: Project, parentId: NodeId | null = null): DocNode[] {
  return nodesOf(project).filter((n) => (n.parentId ?? null) === parentId);
}

/**
 * The layers, in draw order — what `project.layers` used to be, exactly.
 *
 * Ascending `order` is bottom-to-top, which is the array order every consumer already
 * expects: the evaluator draws in list order, and the layer panel reverses it so the topmost
 * layer sits at the top of the list.
 *
 * Flat for now: this returns *every* layer in the document rather than only the roots,
 * because nothing can have a parent yet. When groups land it becomes a depth-first walk, and
 * §6.5's "depth-first document order" is the rule it will walk by.
 */
export function layersOf(project: Project): Layer[] {
  return memo(layerCache, project.nodes, () => sortedIn(project.nodes).filter(isLayerNode));
}

/** The cameras, in order. Cameras observe; they never appear in `layersOf`. */
export function camerasOf(project: Project): CameraNode[] {
  return memo(cameraCache, project.nodes, () => sortedIn(project.nodes).filter(isCameraNode));
}

/**
 * The camera the composition renders from.
 *
 * The first one, until §04's switcher track exists to choose between several. `undefined` is
 * a legitimate answer — a camera is an observer, and a composition with none has an
 * unauthored view rather than a broken file; the evaluator falls back to its default.
 */
export function liveCamera(project: Project): CameraNode | undefined {
  return camerasOf(project)[0];
}

/** One layer by id. Returns nothing for a camera id, which is not a layer. */
export function layerAt(project: Project, id: NodeId): Layer | undefined {
  const node = project.nodes[id];
  return node && isLayerNode(node) ? node : undefined;
}

/**
 * Every descendant of `id`, excluding `id` itself.
 *
 * Walked off `parentId` rather than a stored child list. A cycle in a hand-edited file would
 * hang the delete path, so a node already seen is never queued twice.
 */
export function descendantsOf(project: Project, id: NodeId): NodeId[] {
  return descendantsIn(project.nodes, id);
}

function descendantsIn(nodes: NodeStore, id: NodeId): NodeId[] {
  const byParent = new Map<NodeId, NodeId[]>();
  for (const node of Object.values(nodes)) {
    const parent = node.parentId ?? null;
    if (parent === null) continue;
    const list = byParent.get(parent);
    if (list) list.push(node.id);
    else byParent.set(parent, [node.id]);
  }

  const out: NodeId[] = [];
  const seen = new Set<NodeId>([id]);
  const queue = [id];
  while (queue.length > 0) {
    const next = queue.shift() as NodeId;
    for (const child of byParent.get(next) ?? []) {
      if (seen.has(child)) continue;
      seen.add(child);
      out.push(child);
      queue.push(child);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ writing */

/**
 * The mutators below run **inside** a `transact()` recipe and mutate the draft they are
 * handed, exactly like the camera's shot helpers. They are the only code that writes
 * `parentId` or `order`; nothing else should compute an order key by hand.
 */

/**
 * Nodes to read positions from, without drafting the whole store.
 *
 * Reading a value out of an Immer draft creates a draft of it, so `Object.values(d.nodes)`
 * on a 1,000-node project builds 1,000 proxies — measured at 1.25 ms, which is most of a
 * transaction budget spent working out where one layer goes (§10: ≤ 1 ms).
 *
 * Positions live in the *base* state until one of the mutators below moves one, so the base
 * is read directly and only keys the recipe has added are taken from the draft. If a
 * position has actually been rewritten in this recipe the base is stale, so those mutators
 * mark the draft and the full read is used from then on — correctness first, with the fast
 * path covering the ordinary case of one placement per transaction.
 */
const rewritten = new WeakSet<NodeStore>();

function positionsIn(nodes: NodeStore): DocNode[] {
  const base = isDraft(nodes) && !rewritten.has(nodes) ? (original(nodes) as NodeStore | undefined) : undefined;
  if (!base) return Object.values(nodes);

  const out: DocNode[] = [];
  for (const key of Object.keys(nodes)) {
    const node = base[key] ?? nodes[key];
    if (node) out.push(node);
  }
  return out;
}

/** Siblings of `parentId` in a store — a draft or a document. */
function siblingsIn(nodes: NodeStore, parentId: NodeId | null): DocNode[] {
  return positionsIn(nodes)
    .filter((n) => (n.parentId ?? null) === parentId)
    .sort(compareOrder);
}

/** The order key that puts a node last among `parentId`'s children. */
function orderAtEnd(nodes: NodeStore, parentId: NodeId | null): string {
  const siblings = siblingsIn(nodes, parentId);
  return orderBetween(siblings[siblings.length - 1]?.order ?? null, null);
}

/**
 * The order key that puts a node directly after `afterId`.
 *
 * Falls back to the end when that sibling is not there — a duplicate whose source vanished
 * in the same gesture should still land, at the end, rather than not land at all.
 */
function orderAfter(nodes: NodeStore, parentId: NodeId | null, afterId: NodeId): string {
  const siblings = siblingsIn(nodes, parentId);
  const i = siblings.findIndex((n) => n.id === afterId);
  if (i < 0) return orderAtEnd(nodes, parentId);
  return orderBetween(siblings[i]?.order ?? null, siblings[i + 1]?.order ?? null);
}

/**
 * Put a node in the store, assigning its parent and its place among the siblings.
 *
 * The caller builds the node (`createLayer`, `createCamera`) and this decides where it sits:
 * a constructor cannot know its siblings, and letting it guess is how two nodes end up
 * claiming one order key.
 *
 * Returns nothing on purpose. `transact` reads an object returned from a recipe as "replace
 * the whole document", so `transact(p, (d) => addNode(d, layer))` — the most natural way to
 * write it — would hand Immer a node where it expected a project. The caller already holds
 * the node it built, and its id is the only part that matters afterwards.
 */
export function addNode(
  draft: Project,
  node: DocNode,
  opts: { parentId?: NodeId | null; after?: NodeId } = {},
): void {
  const parentId = opts.parentId ?? null;
  const placed = {
    ...node,
    parentId,
    order: opts.after ? orderAfter(draft.nodes, parentId, opts.after) : orderAtEnd(draft.nodes, parentId),
  } as DocNode;
  draft.nodes[placed.id] = placed;
}

/**
 * Remove a node and everything under it, in one transaction.
 *
 * §3.2: "Deleting a node deletes its subtree in the same transaction." A flat store makes
 * the alternative — children still in the store but reachable from nothing — the *default*
 * failure, so the subtree walk is not optional.
 */
export function removeNode(draft: Project, id: NodeId): void {
  if (!draft.nodes[id]) return;
  for (const child of descendantsIn(draft.nodes, id)) delete draft.nodes[child];
  delete draft.nodes[id];
}

/**
 * Move a node one place up or down among the siblings of its own kind.
 *
 * `+1` is toward the front of the draw order (later, on top) — what the layer panel's "Move
 * up" meant when it swapped array slots. Refuses at the ends rather than wrapping.
 *
 * *Of its own kind*, because until groups exist a camera and a layer are siblings by
 * accident: §04 puts cameras in their own group beside the map context, and there is nowhere
 * else to park them yet. A camera has no place in draw order, so stepping a layer past one
 * would be a move that changes nothing on screen and reads as a broken button.
 *
 * The neighbour is not touched: the moving node takes a key on the far side of it. That is
 * the difference from the array swap this replaces — one patch to one field, so two people
 * reordering different layers cannot overwrite each other's positions.
 */
export function moveNodeBy(draft: Project, id: NodeId, dir: -1 | 1): void {
  const node = draft.nodes[id];
  if (!node) return;
  const kind = isLayerNode(node) ? isLayerNode : isCameraNode;
  const siblings = siblingsIn(draft.nodes, node.parentId ?? null).filter(kind);
  const i = siblings.findIndex((n) => n.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= siblings.length) return;

  const target = siblings[j];
  if (!target) return;
  // The sibling on the far side of the target bounds the new key; absent, the node is
  // moving to an end and that side is open.
  const beyond = siblings[dir === 1 ? j + 1 : j - 1];
  node.order =
    dir === 1 ? orderBetween(target.order, beyond?.order ?? null) : orderBetween(beyond?.order ?? null, target.order);
  rewritten.add(draft.nodes);
}

/**
 * Reparent a node, optionally after a given sibling.
 *
 * Nothing in the editor calls this yet — there is nothing to be a parent. It exists, and is
 * tested, because it is the point of storing `parentId` at all: reparenting is one patch to
 * two fields, and groups will need no new mechanism.
 *
 * Refuses to put a node inside its own subtree, which would detach that subtree from the
 * document while leaving it in the store.
 */
export function setNodeParent(draft: Project, id: NodeId, parentId: NodeId | null, after?: NodeId): void {
  const node = draft.nodes[id];
  if (!node) return;
  if (parentId !== null && (parentId === id || descendantsIn(draft.nodes, id).includes(parentId))) return;
  node.parentId = parentId;
  node.order = after ? orderAfter(draft.nodes, parentId, after) : orderAtEnd(draft.nodes, parentId);
  rewritten.add(draft.nodes);
}
