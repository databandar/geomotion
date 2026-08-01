# Every declared number is a track

**Design-doc section:** ARCHITECTURE §04 ("Every property is a track"; `value(t) =
behaviors(expr(base(t)))` — "one pipeline, whole app"), §06 (motion engine), §18 Phase 1
("Property tracks + single resolution pipeline", size L) ·
**Owner package(s):** `@geomotion/document`, `@geomotion/evaluator`, `apps/studio` ·
**Status:** shipped — format 9

## Problem

§04 states the model in one line: **every property is a track.**

```ts
Node  { …, props: Record<string, Track> }
Track = static | keyframed | bound | expr
value(t) = behaviors( expr( base(t) ) )      // one pipeline, whole app
```

The pipeline is built. All four track kinds evaluate, behaviours apply over them, the source
pip retargets a property between kinds, and the timeline draws keyframe rows. It has been
built since M-tracks, and it is correct.

**It is wired to three properties.** Of the 89 properties the node-type registry declares,
exactly three are tracks: a group's `opacity`, a marker's `size`, and a route's `progress`
(plus a cloud's `clear`, as a window). The other 86 are plain numbers, strings and booleans
that can never be keyframed, bound to a fact, or driven by an expression — because the
document stores them as bare values and the evaluator hands them to the renderer untouched
(`style: layer`).

So the sentence "every property is a track" is true of the machinery and false of the
document. Everything that reads as a missing feature downstream is really this one gap:

- **A curve editor** (§06) has three curves to edit.
- **Bindings out** (§05: "labels, callout fields, chart series, narration lines, thumbnail
  text, legend domains") reach one property, because `bound` is a track kind and almost
  nothing is a track.
- **Transform inheritance** (§04) is blocked outright — `groups.md` says so in as many
  words: "Transform inheritance arrives with the property-track milestone that gives every
  node one."
- **Camera rigs** (§09) are a behaviour stack over camera tracks; behaviours apply to tracks.
- **AI patches** (§12) and **per-property CRDT merge** (§16) both assume properties are
  uniform. Today they are two kinds of thing.

## Why this milestone, and why now

**Dependency ordering.** It sits under four of the five milestones that follow it in the
roadmap. Nothing above it in the ranking is blocked *by* anything else; everything below it
is blocked by it.

**It is cheap for exactly one reason, and that reason is new.** Flipping a property from a
number to a track changes its inspector control. Until [[generated-panels]] landed, that
meant hand-editing six panels — 28 controls across 1,551 lines, each an opportunity to
introduce the drift that milestone existed to remove. The panels are now generated from the
same registry that declares the property, so **the inspector change is the row kind and
nothing else**. This milestone is a week's work today and was a month's work last week.

**Risk is bounded by the machinery being proven.** No new evaluation semantics: a migrated
property becomes a `static` track, and `evalTrack` on a static track returns its value. The
golden frames are the proof — if a single number moved, ten frames would say so.

## User story

As a **geography YouTuber**, I want to keyframe the thing I am looking at — a title's size,
a cloud's coverage, a route's width — because "you can animate this one but not that one" is
not a rule anyone can hold in their head.

As a **data journalist**, I want to bind any number to a fact, not just a marker's size,
because §05's promise is that a place's data drives the picture.

## What is deliberately not built

**`props: Record<string, Track>`.** §04's node shape puts every property in one map. This
milestone keeps properties as named fields and changes their *type*. The map is a second,
separable change: it buys uniform iteration and a smaller CRDT surface, and it costs every
type in the codebase its field names. Doing both at once would mean a regression in either
being impossible to attribute — and the named fields are what make the compiler find every
call site here, which is this milestone's main safety net.

**Non-numeric tracks.** `Track<T>` is generic and `Track<LngLat>` already ships on the
camera. Colours, booleans and enums stay plain: animating a colour needs an interpolator and
a picker that understands keys, which is its own change with its own design.

**Timing and formatting numbers stay plain.** `in`, `out`, `fade` are a layer's window on the
timeline, not properties of its appearance — animating them is meaningless. `decimals` and
`min`/`max` describe how data is read, not how it is drawn.

## Document model

**Format 8 → 9.** For every property whose registry row is now `track`, a bare number becomes
`{ kind: 'static', value: n }`. The migration is mechanical and reads the registry, so it
cannot disagree with the declaration that drove it.

Twenty-eight properties convert, across all seven layer types:

| Type | Properties |
| --- | --- |
| text | `size`, `letterSpacing`, `x`, `y` |
| image | `x`, `y`, `width`, `opacity`, `radius` |
| shape | `fillOpacity`, `lineWidth`, `extrudeHeight` |
| clouds | `coverage`, `scale`, `speed`, `direction`, `opacity` |
| marker | `labelSize`, `labelOffset` |
| route | `width`, `opacity`, `marker.size`, `follow.zoom`, `follow.pitch` |
| regions | `fillOpacity`, `borderWidth`, `highlightWidth`, `calloutSize` |

A grouped path (`marker.size`) converts like any other — [[generated-panels]] made a dotted
`prop` address a field inside a nested object, and the migration walks the same path.

## The resolution pipeline

Today the evaluator hands the renderer the document node itself (`style: layer`) and spells
out the one or two tracked properties by hand:

```ts
style: { ...layer, size: evalTrack(layer.size, time, { facts, fallback: 8 }) }
```

That does not scale to 28 and, more importantly, it is 28 chances to forget one — a property
that is a track in the document and is handed to the renderer unresolved draws as `[object
Object]` or `NaN`, and only at that layer, only at that time.

It becomes **one pass, driven by the registry**:

```ts
resolveTracks(node, time, { facts })   // → Resolved<Node>
```

It reads `trackPropsOf(node.type)` — the paths the registry declares as tracks — evaluates
each, and writes the plain value back at its path. A node type nobody in core knows about
gets the same treatment, which is §15's "for free" extended from the inspector to the
evaluator.

**The fallback is the type's own default**, memoised per type. A `bound` track whose fact is
missing, or an empty keyframe list, resolves to what a fresh layer of that type carries —
not to `0`, which is a real and wrong value for `scale`, `opacity` and `size` alike.

**The renderer stays document-blind and gains a type that says so.** `SceneItem.style` becomes
`Resolved<L>`:

```ts
type Resolved<T> = { [K in keyof T]: T[K] extends Track<infer V> ? V : T[K] };
```

The renderer therefore cannot be handed an unresolved track without a compile error, which is
the property that makes the conversion safe to do in one change.

## Transactions & commands

**None new, but all three track actions changed.** `setLayerTrack`, `toggleLayerTrack` and
`setLayerWindow` took a property *name* and wrote it at the top level. Since a track can now
sit inside a grouped object, they take a *path* and resolve the owner first — otherwise
`marker.size` writes a literal dotted key beside the real object, the write appears to
succeed, undo records it, and nothing on screen ever changes. Coalescing is unchanged, so a
drag is still one undo step. `updateLayer` continues to write whole values for plain
properties.

## Evaluation & rendering

Evaluation gains the generic pass above and loses its per-property special cases. **Rendering
is untouched** — it receives the same plain numbers it receives today, which is what makes
the golden frames a real check rather than a formality.

## Inspector

**No hand-written change.** Six of the seven panels are generated, so flipping a row from
`number` to `track` swaps a slider for a `TrackedNumber` with its source pip. Regions still
draws its own panel and needs its four rows changed by hand — the last argument for finishing
that conversion.

## Timeline

A property with keys already draws a keyframe row; 28 more properties can now have keys.
No timeline change.

## Tests

As built — 51 new tests, 1,057 → 1,108 across the workspace.

- **The declaration and the storage agree** (`schema/tracks.test.ts`) — over every registered
  type, every path declared a track holds a real track, and has a finite fallback. The failure
  this catches is a row flipped to `track` while `create` still returns a bare number: the
  inspector draws a source pip over a plain value and the property silently stops being
  animatable at the moment it was meant to start.
- **Round trip** — save → load → deep-equal for all ten node types (§12.2).
- **The migration** — a bare number wrapped; a grouped path reached without losing its
  siblings; a value that is *already* a track left alone; a non-numeric value repaired rather
  than wrapped into nonsense; an unknown node type untouched.
- **A frozen `format-9.geomotion.json`**, carrying a route so the nested `marker.size` and
  `follow.zoom` paths are frozen too — where the migration walks deepest (§12.3).
- **The resolver** (`evaluator/resolve.test.ts`, 14) — every declared track on every type
  resolves to a number, asserted *over the registry* rather than a list, so a property added
  tomorrow is covered without anyone remembering; a keyframed property read at three times; a
  broken binding falling back to the type default rather than zero; the document never
  mutated; determinism; and a node type it has never heard of returned untouched.
- **Golden frames** — all ten byte-identical, max Δ0.
- **The pipeline end to end** — a v1 document rendered through all nine migrations, because
  the build and the unit suite do not run it (debt D12).

### Found on the way

**`setLayerTrack` wrote to the top level.** Every track store action took a property *name*,
so a dotted `marker.size` wrote a literal key with a dot in it beside the real object — the
write appeared to succeed, undo recorded it, and nothing on screen ever changed. It is the
worst shape of bug this change could have had, and only a round-trip test on a *nested*
property found it. All three track actions now resolve the owner first.

**A tracked field's control is no longer the first control in it.** A property with a track
carries a source pip — a button — beside its label, so a test helper querying
`input, select, textarea, button` started returning the pip and editing nothing. Inputs now
win; buttons are the fallback.

**A test that assumed tracks were rare.** `Inspector.tracks.test.tsx` found its subject with
"the tracked one is the only field carrying a pip". That was true of three properties and is
false of thirty-one — which is the milestone working. Its queries are scoped to the field
under test now.

**Turbo's cache hid a missing function.** A module-scope helper failed to insert, and a cached
`typecheck` task reported success over the previous input. The runtime test caught it, which
is the argument for not treating a green typecheck as proof on its own.

**`labelSize` is two different properties.** A marker's is a track; a region tour's is a plain
number. A bulk rewrite over property names converted both — the kind of mistake that only
type-checks because both were numbers a moment ago.

## Docs

This file to as-built; ARCHITECTURE §04's "still to come" list loses `props: Record<string,
Track>`'s first half; `groups.md`'s note that transform inheritance is blocked; a CHANGELOG
entry.

## Future extensions

- **Transform inheritance and `space`** — the next milestone, and now unblocked.
- **`props: Record<string, Track>`** — the shape §04 actually names.
- **Colour, boolean and enum tracks** — each needs an interpolator and a control.
- **A curve editor** over the 31 tracks this leaves behind.
