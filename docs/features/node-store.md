# The flat node store

**Design-doc section:** §04 (Decision 01, "logical tree, flat storage") ·
**Owner package(s):** `@geomotion/document` ·
**Status:** shipped

ENGINEERING_GUIDE §3.1: "Physical storage: **flat** `Map<NodeId, Node>` with `parentId` and a
fractional-index `order` string. Never store children arrays; child lists are derived (and
cached) from the flat map. Reparenting = one patch to `parentId` + `order`."

## Problem

The document still stores its scene as v1 did: `project.layers` is an array and
`project.cameras` is a second array beside it. Nothing a user does today is broken by that,
but four things the design calls for cannot be built on it:

- **Nothing can contain anything.** A group, a scene, an inset map context and a nested
  composition are all "a node with children". An array of layers has no place to put a
  parent, so §04's entire logical tree — the thing the product is named after — has no
  storage.
- **Patches address positions, not objects.** Reordering a layer emits patches at
  `/layers/2` and `/layers/3`. Two people reordering different layers produce patches that
  overwrite each other's *positions*, which is the tree-merge nightmare Decision 01 exists
  to avoid. A move is also two patches where it should be one field.
- **Deleting is an index hunt.** Every write path does `findIndex` then `splice`, so every
  new path re-derives "which slot is this layer in", and every one of them can be off by one.
- **Two stores for one kind of thing.** A camera is already a node (`type: 'camera'`, tracks,
  an empty `behaviours` stack) sitting in its own array purely for historical reasons. §04
  is explicit that cameras are *siblings* of content — observers in the same graph, not a
  parallel list.

## User story

As a **geography YouTuber** (§03) I want to group the four layers that make up one beat so I
can move, hide and retime them as one thing — and as an **election war room** I want two
people editing different parts of the same map without one of them silently reordering the
other's work. Neither is possible on an array; both are ordinary on a flat store.

Nothing in this milestone is visible in the editor. It is the storage change that makes those
two features buildable, and it is deliberately shipped on its own so the picture can be proved
identical before anything starts depending on it.

## UX

None. The layer panel, the timeline gutter, the inspector and the stage all read the same
ordered list of layers they read before — `layersOf(project)` in place of `project.layers`.
Move up / move down keep their behaviour exactly: they swap a layer with its neighbour in
draw order.

The one seam left open on purpose: rows are still flat, because there are no parents to show
yet. `parentId` is written on every node from day one so the panel can grow a disclosure
triangle without another format bump.

## Document model

### Storage

```ts
type NodeId = string;
type DocNode = Layer | CameraNode;      // group / scene / mapContext join later

interface Project {
  nodes: Record<NodeId, DocNode>;       // flat, keyed by id
  // layers: Layer[]      — gone
  // cameras: CameraNode[] — gone
}
```

Every node gains two fields, on `LayerBase` and on `CameraNode`:

| Field | Meaning |
| --- | --- |
| `parentId: NodeId \| null` | `null` = a root of the project. The scene nodes §04 wants become the first non-null parents. |
| `order: string` | Fractional index among siblings. Sorted ascending; ascending **is** draw order, so `layersOf` returns exactly what `project.layers` used to hold. |

`order` is a string rather than a number because between any two strings there is always
another string, and between two floats there is eventually not. A thousand drops onto the same
boundary must never need a renumbering pass, because a renumbering pass rewrites every
sibling — the patch storm Decision 01 rules out.

### Ordering

`orderBetween(a, b)` returns a key that sorts strictly between its arguments, over the
62-digit alphabet `0-9A-Za-z` (ASCII-ascending, so plain `<` on strings is the order). Either
end may be `null` for "no neighbour". Keys never end in the lowest digit, so no two distinct
keys compare equal. Ties on identical keys — only reachable through a hand-edited file — break
by node id, so ordering is total and deterministic whatever the document says.

### Format 7 migration

`6 → 7` reads `layers` and `cameras`, assigns each node `parentId: null` and successive order
keys, and writes `nodes`. The old keys are deleted rather than ignored (§3.6.4). Relative
order within the layer list is preserved, which is what keeps the picture identical.

Two defences, because this runs against files this project did not write: a node with no
usable id gets one, and a node whose id collides with one already placed gets a fresh one —
a record silently keeps the last writer, and silently losing a layer on load is the worst
failure a migration has.

`format-7.geomotion.json` joins the frozen fixture set (§3.6.5).

## Transactions & commands

No new commands. The store's existing actions are rewritten over four mutators, which run
inside `transact()` and mutate the draft like every other editing helper in this package:

| Mutator | Replaces |
| --- | --- |
| `addNode(draft, node, { parentId, after })` | `p.layers.push(l)` / `splice(i + 1, 0, copy)` |
| `removeNode(draft, id)` | `p.layers = p.layers.filter(…)` — and removes the subtree, so a group cannot outlive its children |
| `moveNodeBy(draft, id, dir)` | the two-slot swap in `moveLayer` |
| `setNodeParent(draft, id, parentId, after)` | nothing yet — the seam groups will use |

Coalescing keys are unchanged: they key off node id, which is now the only address a write
needs.

## Evaluation

`evaluate(doc, t)` walks `layersOf(project)` where it walked `project.layers`, and reads
`liveCamera(project)` where it read `project.cameras[0]`. Same nodes, same order, same output
— the evaluator suite and the golden frames are the proof, and both came out identical.

## Rendering

Untouched. The renderer never saw the document (§1.6); it sees a `Scene`, and the scene is
built from the same layers in the same order.

## Timeline

Row order in the gutter and the track area follows `layersOf`, as it followed the array.
Ripple is unchanged: it takes the layers, shifts the ones a block owns, and the store writes
each changed layer back by id instead of replacing an array.

## Inspector

Unchanged — it edits the selected layer by id, and id lookup is what the store now does
natively.

## Entities & data

None. Entity ids are semantic and unaffected (§3.2); a node id is still a ULID.

## Plugin API

Not exposed yet. This is the shape a plugin-contributed node type will be stored in, which is
why it lands before the SDK rather than after.

## Performance

`layersOf` sorts, and the evaluator calls it every frame — so it is memoised in a `WeakMap`
keyed by the `nodes` object itself. Immer's structural sharing gives a fresh `nodes` object
exactly when a node changed, so the cache key *is* the invalidation story: playback with no
edits sorts once, and an edit sorts once. A `WeakMap` needs no eviction budget because the
entry dies with the document version that keyed it. Drafts are deliberately **not** cached:
a draft keeps its identity while its contents change, so an entry recorded halfway through a
recipe would be handed back to the next mutator in the same recipe.

The React selectors need the memo too, and for correctness rather than speed: `useStore((s)
=> layersOf(s.project))` returning a fresh array every render is an infinite render loop
under zustand's snapshot check.

Measured at the §10 target scale — 1,000 nodes, this machine:

| Path | Cost | Budget |
| --- | --- | --- |
| `layersOf` on an unchanged document (per frame) | ~0 ms (memo hit) | part of ≤ 4 ms eval |
| `layersOf` after a change (one sort) | 0.19 ms | " |
| `transact`, one node property | 0.25 ms | ≤ 1 ms |
| `transact`, add a layer | **0.59 ms** | ≤ 1 ms |
| `transact`, reorder a layer | **0.57 ms** | ≤ 1 ms |

The last two were 1.52 ms first time round, and the cause is worth recording: reading a value
out of an Immer draft *creates* a draft of it, so `Object.values(d.nodes)` built 1,000
proxies — 1.25 ms of a 1 ms budget spent working out where one layer goes. Positions live in
the base state until a mutator moves one, so the sibling scan reads the base directly and
takes only recipe-added keys from the draft; the mutators that rewrite a position in place
mark the draft so later reads in that recipe fall back to the full read.

## Tests

- `order.test.ts` — a key lands strictly between its neighbours; open ends both ways; 1,000
  successive inserts at the head, at the tail and repeatedly into the same gap all stay
  strictly ascending; no key ends in the lowest digit; inverted arguments throw.
- `nodes.test.ts` — add appends and inserts after a sibling; remove takes the subtree;
  move-by swaps with the neighbour and refuses at the ends; `layersOf` excludes cameras and
  keeps draw order; the ordering cache returns an identical reference until `nodes` changes,
  and a changed reference after; ties break by id.
- `migrations.test.ts` — the format-6 fixture migrates to nodes with layer order preserved,
  cameras included, and `layers`/`cameras` gone; duplicate ids survive as two nodes; a
  document with neither array migrates to an empty store rather than throwing.
- Round-trip (`persistence.test.ts`), undo (`store.test.tsx`) and evaluation
  (`scene.test.ts`) suites carry over unchanged in intent, rewritten to the new accessors.
- Golden frames: **all ten bit-identical** (`0/576 cells changed` on every fixture). This
  milestone moved no pixel, which is the claim it exists to be able to make.
- Driven in a real browser as well as in jsdom: add, rename, reorder, duplicate, four undos
  back to the starting list, and a camera keyframe written at the playhead — no page errors,
  and the layer list returns exactly to where it started.

## Docs

CHANGELOG entry under "The document model". `packages/document/src/index.ts`'s header note
("the flat node store … is not built yet") is now false and is replaced by what is actually
there.

## Future extensions

Deliberately **not** in this milestone, each with the seam it will use:

- **`space: 'world' | 'screen'`** on the node (§04). It is derivable from the layer type
  today, and adding it now would create a second source of truth for something that also
  changes z-order (world composites under screen). It arrives with the group work, which is
  where inherited space first means something.
- **`props: Record<string, Track>`.** Layer payloads keep their named fields. Converting them
  is the property-track milestone's job, and doing both at once would make it impossible to
  tell a storage regression from a property regression.
- **Groups, scenes, map-context nodes.** All are "a node with a parent", which is now storable.
- **Reparenting UI.** `setNodeParent` exists and is tested; nothing in the editor calls it
  until there is something to be a parent.

## Found on the way

**A pre-existing render loop, now fixed.** Driving the real editor turned up something older
than this milestone: selecting a camera keyframe logged "The result of getSnapshot should be
cached", then "Maximum update depth exceeded", and the editor stopped repainting.
`useSelectedKeyframe` selected through `shotAt`, which derives a fresh row object from the
camera's per-channel tracks on every call — so the selector never returned the same object
twice. Confirmed against the previous commit before changing anything, so it is a fix rather
than a regression. It now selects the camera node and the id (both stable) and derives the
row in a `useMemo` — the same rule the ordered views follow, applied where the React
constraint actually lives.

**A field-name collision the format chain had to be told about.** A region layer written
before M9 nested the tour carries a flat `order` — the *region* ordering, `valueDesc` or
`alpha` — and this milestone writes a fractional index into a field of that name on every
node. §3.6.4 forbids repurposing a field, so 6→7 moves the old meaning aside as `tourOrder`
(the same disambiguating rename `tourPitch` and `cameraBow` already went through), and the
tour migration now validates what it reads rather than trusting the slot.

**The composer's merge would have discarded hand work.** `mergeComposed` keeps the layers you
added when a script is re-composed, and it recognised them by reading `existing.layers`. A
project that had been through the editor and saved comes back as a node store, so the merge
would have found no layers, concluded there was nothing to keep, and overwritten every hand
edit *while printing that it had merged*. It now reads either shape.
