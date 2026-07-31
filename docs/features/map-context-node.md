# The map context becomes a node

**Design-doc section:** §04 (the map context is a node; world-space descendants project
through it), §10 (story blocks) ·
**Owner package(s):** `@geomotion/document`, `@geomotion/evaluator`, `apps/studio` ·
**Status:** shipped

**Decision recorded:** story blocks remain the primary structural unit. `Scene` is *not*
introduced as a document abstraction. See *The scene seam* below for what a future one would
attach to, and why nothing has to move for it to arrive.

## Problem

A map context — "what the map looks like during this stretch" — was a row in a side table
(`project.contexts`), referenced by id from a story block. That shape was chosen deliberately
([[map-contexts]]) and it was right for what it did. Three things it cannot do:

- **Nothing can belong to it.** §04's map context *contains* the world-space layers that
  project through it; an inset is a nested one. A side-table row has no children, so the only
  way to scope a layer to a stretch was `hidden: string[]` — a list of ids, maintained by
  hand, that says what to take away rather than what belongs.
- **It has no identity in the editor.** No row in the layer panel, no inspector, no command.
  In practice contexts were reachable only by hand-editing the file, which is why nothing in
  the product ever wrote one.
- **It is a second kind of thing.** Layers, cameras and groups are nodes in one store with
  one set of rules — order, parent, lock, visibility, undo granularity. A context beside them
  in a parallel array is the shape the flat store was built to remove ([[node-store]]).

## User story

As a **geography YouTuber** I want the reference map, the inset labels and the graticule to
*belong* to my "overview" beat, so that they appear during it and nowhere else — without
maintaining a list of layer ids that has to be right. And I want to name that look once and
point three beats at it.

## What is deliberately not built

**A `Scene` node.** §10 describes a project as a sequence of scenes; this codebase found that
story blocks already carry what scenes were wanted for — narrative structure, ripple, a
storyboard, a round trip — and the creator's mental model is the *script*, not a slide stack.
Introducing scenes now would restructure the timeline and the composer for an abstraction
nobody is asking for yet.

## Document model

`mapContext` becomes a node type, alongside `group` and `camera` (§3.8: "a genuinely new kind
of scene object").

```ts
interface MapContextNode {
  id, type: 'mapContext', name, parentId, order;   // the node-store fields
  visible: boolean;
  locked?: boolean;
  basemap?: string;                    // absent = the project's own
  terrain?: boolean;
  terrainExaggeration?: number;
  projection?: 'mercator' | 'globe';
  camera?: { center?, zoom?, bearing?, pitch? };   // a default, never an override
  hidden?: string[];                   // the flat predecessor; still honoured
  behaviours: BehaviourStacks;
}
```

Every field except the node-store ones is optional, and that is the same **partial override**
the side table had: a context names only what it changes and the rest falls through to the
project. A context that switches the basemap is still three fields.

`StoryBlock.context` is unchanged — a block still *references* a context by id. The id is now
a node id. That is the whole point of the previous shape being a table keyed by id rather than
an inline copy: the reference survived the container changing underneath it.

### Membership: what a context's children mean

A layer parented to a context **draws only while that context is live**. That is §04's
sentence — "world-space descendants project through it" — with one map: a context that is not
the map right now has no viewport for its children to project into.

Which context is live is decided exactly as before: by the story block under the playhead.
The mental model does not move. What changes is that "these layers belong to the overview" is
now *structure* rather than a list of ids in a `hidden` array.

`hidden` still works, for documents that use it and because it expresses the opposite thing
(a layer that belongs to the composition generally and is held back for this stretch).
Membership says what a stretch is made of; `hidden` says what it leaves out. Both resolve in
one place.

A context that **no block names is never live**, so its children never draw. That is honest
rather than surprising, and the panel says so on the row instead of leaving you to wonder.

### Nesting, and the inset seam

A context inside a context is storable today and draws nothing, because only one context can
be live and an inset needs a second render surface. That is the inset seam: when §07's inset
lands, the nested context is where it hangs, and nothing about the document has to change.

### The scene seam

If nested compositions ever become a real requirement, a `scene` node would wrap **story
blocks**, not replace them:

- a `scene` node type in the same store, with children like any other container;
- `StoryBlock` gains an optional `scene?: NodeId` — one field, additive, no migration for
  projects that never use one;
- context resolution walks up from the block: its own context, else its scene's.

Nothing in this milestone forecloses that, and nothing requires it. Scenes stay optional
because the unit a creator thinks in is the beat.

### Format 8

`project.contexts[]` becomes `mapContext` nodes in the store; blocks keep their `context` id
untouched. Contexts are appended after the layers, so no draw order moves. The old key is
deleted rather than ignored (§3.6.4), and a frozen `format-8.geomotion.json` joins the fixture
set.

## Transactions & commands

| Command | Does |
| --- | --- |
| `context.add` | Adds a map context node, and puts the selected layers inside it if any are selected — the same gesture as Group, because that is what making a context out of a beat is |
| `context.assign` | Points the block under the playhead at the selected context |
| `context.clear` | Takes the block under the playhead back to the project's own look |

All ordinary transactions; all undoable.

## Evaluation

One line of the alpha chain (from [[groups]]) learns a second container kind:

```
container alpha = group   → visible ? opacity(t) : 0
                | context → (live at t) ? 1 : 0
```

cumulative down the tree, so a layer under a group inside a context gets both. A project with
no containers allocates nothing and takes the path it always took.

`resolveMapContext(project, t)` returns the same `ResolvedContext` it always did — the map
runtime and `MapCanvas` are untouched.

## Rendering

Nothing. Contexts emit no primitives; they change the alpha their descendants already carry.

## Timeline

Unchanged. A context has no bar: it is a *look*, and when it applies is the story block's
business, which the story lane already draws.

## Inspector

Generated from the registry ([[schema-registry]]) — basemap, terrain, exaggeration and
projection with no hand-written panel. The basemap row is the first to name an **options
source** rather than a literal list: the basemap ids live in `@geomotion/map`, which
`document` may not depend on, so the metadata says `optionsFrom: 'basemap'` and the app
supplies the list. That is the seam the entity-picker and ramp rows will use.

## Entities & data

None.

## Performance

One extra pass over the containers per frame, sized by the number of contexts and groups
rather than layers, and skipped entirely for a project with neither.

## Tests

- Node behaviour: a context is not a layer; its children appear in draw order where it sits;
  it takes its subtree when deleted; ancestors resolve.
- Membership: a layer under the live context draws; the same layer under an inactive one is
  at zero; a context nobody names never draws; a group inside a context multiplies both.
- `hidden` still holds, and the camera default still yields to a keyframe inside the block.
- Migration: format 7 contexts become nodes, blocks keep their ids, `contexts` is gone; the
  frozen fixture set loads to current.
- Commands: add/assign/clear are one undo step each and refuse cleanly with no block.
- Golden frames: unchanged.

## Future extensions

- **Insets** — a nested context with its own surface (§07).
- **Projection**, still carried and not applied ([[map-contexts]] records why).
- **A context lane** on the timeline, if assigning them per block from the storyboard turns
  out not to be enough.
- **Scenes**, exactly as described above, if and only if nested compositions become real.
