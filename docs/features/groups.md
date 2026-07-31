# Groups

**Design-doc section:** §04 (the logical tree; "every node inherits from its parent"),
§6.5 (z-order is depth-first document order) ·
**Owner package(s):** `@geomotion/document`, `@geomotion/evaluator`, `apps/studio` ·
**Status:** shipped

## Problem

A composition of any size is a flat list. The anaemia demo is seven layers; a real
narrated piece is thirty or forty, and every one of them sits in one column with no
structure. Three things follow from that, and all three are ordinary complaints:

- **You cannot hide a beat.** Turning off "the intro" means finding its four layers and
  clicking four eyes, then remembering which four when you want them back.
- **You cannot move a beat.** Reordering the title, the callout and the highlight past
  another beat is six "Move up" presses that must not be interrupted.
- **You cannot name a beat.** The document has no place to write down that these four
  layers are one thing, so the knowledge lives in the layer names or in nobody's head.

§04's tree has always had the answer — the shape it draws is `Scene → MapContext → layers`,
and every level of that is a node with children. [[node-store]] made a parent storable.
This is the first node type that uses one.

## User story

As a **geography YouTuber** (§03) I want the four layers that make up one beat to be one
thing I can name, hide, lock and move — so that reordering my story is one drag rather than
six, and so that the layer panel reads like my script instead of like a pile.

## UX

- **Group** (`⌘G`) takes the selected layers and puts them in a new group at the position of
  the topmost one. **Ungroup** (`⇧⌘G`) puts the children back where the group was.
- The layer list is a **tree**: a group row carries a disclosure triangle, its child count,
  an eye and a lock, and its children are indented under it. Collapsing is a view state, not
  a document one — two people looking at the same project may reasonably have different
  rows open.
- **Multi-select** in the panel: `⌘`/`Ctrl`-click toggles a row into the selection,
  `Shift`-click extends to it. The last row clicked is the *primary* selection — the one the
  inspector edits — so a multi-selection never leaves the inspector guessing which of five
  layers it is showing.
- A new layer is added **inside the selected group** (or inside the group containing the
  selected layer). Without that a group is a one-way door: you could make one and never put
  anything else in it.
- A group's eye and lock apply to everything under it, and the rows inside show it: a child
  of a hidden group draws its eye dimmed, because the child's own `visible` is still true and
  the panel must not claim otherwise.

## Document model

A new node type, per §3.8's decision tree — "a genuinely new kind of scene object".

```ts
interface GroupNode {
  id, type: 'group', name, parentId, order;   // the node-store fields
  visible: boolean;
  locked?: boolean;
  opacity: Track<number>;        // multiplies into every descendant's alpha
  behaviours: BehaviourStacks;   // empty; the home §06 gives every node
}
```

`GroupNode` joins `DocNode` beside `Layer` and `CameraNode`. It is **not** a `Layer`:
`layersOf` returns things that draw, and a group draws nothing. That distinction is what
keeps the evaluator's loop honest — it never has to ask "is this one of the drawable ones".

### What a group deliberately does not have

**A time window.** No `in`, `out` or `fade`. A group whose window clipped its children would
silently truncate a layer whose bar you can see, at its authored length, on the timeline —
the composition would disagree with its own timeline, which is the class of bug §00's
time-source lesson is about. Children keep their own timing, and ripple already moves a beat
as a unit through story blocks (§10).

The seam: when nested scenes land (§10, "scenes nest as clips with exposed parameters"),
*that* node type is the one that owns a window and a local clock. A group is a container; a
nested scene is a composition. Conflating them is what makes precomps confusing in After
Effects.

**A transform.** §04 says nodes inherit transforms from their parents, and they will — but
layers today have no shared transform to inherit (a route has `coords`, a marker a `coord`,
a text `x`/`y`). Transform inheritance arrives with the property-track milestone that gives
every node one. Opacity is the part of inheritance that *is* expressible now, so it is the
part that ships.

### Ordering and z-order

`layersOf` becomes a depth-first walk: siblings in `order`, descending into each group at the
position the group occupies. That is §6.5's rule exactly — "depth-first document order within
each space" — and for a project with no groups it returns precisely what it returned before.

Move up / move down operate on siblings that draw, so a layer steps past its group-mates and
a group steps past its peers. Cameras stay out of it (they have no place in draw order).

### Format

**Additive: no bump.** No existing type gains or loses a field; a `group` node simply appears
in the store of a project that uses one, and a project that does not is byte-identical to
what format 7 already writes.

## Transactions & commands

| Action | Transaction |
| --- | --- |
| Group selection | one transaction: create the group, reparent each selected node in order |
| Ungroup | one transaction: reparent the children to the group's parent at its position, delete the group |
| Duplicate a group | deep-copies the subtree with fresh ids — a duplicate that shared child ids would be two rows editing one layer |
| Delete a group | `removeNode` already takes the subtree ([[node-store]]) |

Shortcuts: `⌘G` / `⇧⌘G`. Registered in the editor's key handler; they move to the `commands`
package when it exists (roadmap #4), which is where §11 wants them.

## Evaluation

One addition to `evaluate(doc, t)`: a layer's alpha is multiplied by the alpha of every group
above it —

```
alpha(layer) = layerAlpha(layer, t) × Π over ancestor groups g of
                 (g.visible && !hiddenByContext(g) ? evalTrack(g.opacity, t) : 0)
```

computed once per frame as a cumulative value per group, not walked per layer. A project with
no groups allocates nothing and takes the same path it took before.

A map context that hides a group hides its whole subtree, which is the answer someone
switching off "the intro" during a close-up expects.

## Rendering

Nothing. Groups emit no primitives; they change the alpha the existing primitives already
carry, and the draw order they were already drawn in.

## Timeline

Group rows are not drawn on the timeline in this milestone — the gutter lists drawable layers
and their keyframe rows, and a group has no bar to show without a window. The tree lives in
the layer panel. (A collapsed group summarising its children's bars is the obvious next step
and is deliberately not guessed at here.)

## Inspector

A small group inspector: name, and opacity as a tracked number with the source pip every
other tracked property has, so a group can fade as a unit and the fade is keyframable.

## Entities & data

None.

## Plugin API

Not exposed yet. A plugin node type will be stored as a node with a parent like any other.

## Performance

The depth-first walk replaces a sort of the same nodes and is memoised identically
([[node-store]]). Measured at the §10 target scale — 1,000 layers, this machine:

| Path | Cost |
| --- | --- |
| `layersOf`, unchanged document (per frame) | ~0 ms (memo hit) |
| `layersOf` after a change, no groups | 0.27 ms |
| `layersOf` after a change, 1,000 layers in 50 groups | 0.42 ms |
| `transact`, add a layer inside a group | 0.43 ms (budget ≤ 1 ms) |

The per-frame group-alpha map is allocated only when the project has groups, and is sized by
the number of groups rather than the number of layers.

## Tests

- `nodes.test.ts` — depth-first order with nesting; a group is not a layer; ancestors;
  duplicate-a-subtree gives fresh ids and keeps relative order; ungroup keeps position.
- `groups.test.ts` (evaluator) — a hidden group zeroes its subtree; opacity multiplies down
  two levels; a keyframed group opacity ramps its children; no groups means no change.
- `store.test.tsx` — group/ungroup are one undo step each; lock inheritance refuses a child
  edit; a new layer lands inside the selected group; multi-select survives a delete.
- Round-trip and migration suites cover the new type through the existing fixtures.
- Golden frames: **unchanged, all ten bit-identical** — no bundled fixture uses a group,
  which is the point: adding a node type must not move the projects that do not use it.
- Driven in a real browser: grouping the demo's two markers put a `Group` row exactly where
  the topmost marker sat, collapsing removed its two child rows, hiding it dimmed all three,
  the inspector showed the group with its opacity and "2 layers", and two undos restored the
  original list. No page errors.

## Docs

Changelog under "The document model". This doc.

## Found on the way

**A re-compose would have flattened every group.** The composer writes the oldest document
shape and merges hand-added layers into it, so a project that goes editor → composer →
editor arrives at the format chain as an array of nodes that already carry a `parentId`.
Migration 6→7 assigned `parentId: null` to everything it saw, which was right for a real
format-6 file and silently destructive for that one. It now keeps a parent and an order key a
node already declares — with the pre-M9 region layer's `order` still excepted, since there
that field means the region ordering rather than a position.

## Future extensions

- **Transform inheritance**, once nodes have a transform.
- **Nested scenes** as the node type that owns a window and a local clock (§10).
- **Drag into a group** in the panel; `setNodeParent` is already the transaction it needs.
- **Group rows on the timeline**, summarising their children's bars.
- **Solo**, which is a group-shaped idea (everything else at zero) and wants the same
  inherited-alpha machinery.
