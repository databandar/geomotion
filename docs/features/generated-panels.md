# The layer panels are generated

**Design-doc section:** ENGINEERING_GUIDE §3.4 (schema), §11 ("schema-driven inspectors by
default"), §5.8 ("property metadata gives you default rows for free"), ARCHITECTURE §15 ·
**Owner package(s):** `@geomotion/document`, `apps/studio` ·
**Status:** shipped — six of seven panels generated. Regions remains; see *Future extensions*.

The follow-on named by [[schema-registry]] → *Future extensions*: "Convert the seven panels,
one type per change, smallest first (clouds, image, text, shape, marker), leaving route and
regions — whose panels are half data-import flow — last. Each conversion needs the row
language to grow."

## Problem

M2.4 registered every node type's defaults and property metadata in one place, and pointed a
generator at it. It then **left the seven layer panels hand-written**, deliberately, so a
regression in the registry and a regression in a panel could be told apart.

The cost of leaving them was predicted and has now been paid: **the two descriptions have
drifted, and nothing can see it.** Measured against `main` before this change:

| Type | Property | Metadata declares | The panel actually uses |
| --- | --- | --- | --- |
| clouds | `coverage` | max `1` | max `1.4` |
| clouds | `scale` | `0.2 – 4` | `0.3 – 3` |
| clouds | `speed` | max `100` | max `120` |
| clouds | `clear` | a `track` row | an enable toggle + a start/end/easing window |
| image | `width` | min `0.02` | min `0.05` |
| image | `x`, `y` | step `0.01` | step `0.005` |
| image | `anim` | "Ken Burns" | "Slow push in" |
| image | `caption` | section `Style` | section `Image` |
| text | `x`, `y` | step `0.01` | step `0.001` |
| text | `anim` | section `Reveal` | section `Text` |
| text | Style order | Size · Colour · Weight · Align · Tracking | Size · Weight · Colour · Tracking · Align |
| shape | `lineWidth` | max `12` | max `16` |
| shape | trace / extrude / height | sections `Reveal`, `3D` | all under `Style` |
| marker | `labelSize` | max `48` | max `120` |
| marker | `labelOffset` | min `0` | min **`-80`** — a label above the dot |
| marker | `halo` | section `Label` | section `Style` |
| route | `width` | step `0.5` | step `0.1` |
| route | line rows | sections `Shape`, `Style` | one `Line style` |
| route | `progress` | a `track` row | a start/end/easing window |

`schema-registry.md` claims the metadata is "aligned to the labels and ranges those panels
actually use, and tested". Twenty rows say otherwise, one of them functional — a marker label
could sit above its dot and the declaration forbade it. The coverage test cannot catch it:
`schema.test.ts` asserts a slider's `min`/`max` are *defined*, which is all it can do while
the number the user scrubs is typed out somewhere else.

The drift is not the interesting part. **What it costs is the §15 promise**: a plugin's node
type, or a node from a newer build, has no hand-written panel and never will. Every property
whose real control lives in `Inspector.tsx` is a property the generator cannot draw, so
"plugins get an inspector for free" holds only for the kinds of row that no shipped panel
needed to exceed.

## User story

As **whoever adds a property to a layer**, I want one edit — the declaration — and to see the
control appear with the range I declared, because there is no second place that can disagree
with me.

As a **plugin author** (§15), I want the row kinds the built-in layers use, not a poorer
subset — a conditional row and a windowed track are ordinary needs, not core-team privileges.

## UX

**No visible change.** This is a like-for-like conversion: the same sections in the same
order, the same labels, the same controls, the same ranges. Where the two descriptions
disagreed, **the panel wins** — those numbers are what shipped, what users have been scrubbing
and what existing projects were authored against. The metadata is corrected to match.

The one exception is stated plainly because it is a behaviour change: clouds `coverage` gains
back its `1.0 – 1.4` range in the *declaration*, which the metadata had been under-reporting;
nothing about the control the user sees moves.

## Document model

**No change.** No new field, no format bump, no migration. A project saved before and after
this change is byte-identical. What grows is the *description* of the model — three additions
to the row language, all in `packages/document/src/schema/meta.ts`:

```ts
/** A bound the registry cannot know when the metadata is declared. */
export type BoundFrom = 'duration';

/**
 * Draw this row only when a sibling property says so.
 *
 * Declarative, not a predicate function: §15 sends a plugin's contribution across a worker
 * boundary, and a function does not survive being structured-cloned. `prop` accepts a dotted
 * path so a row can depend on the *kind* of a track, not only on a value.
 */
export interface RowCondition {
  prop: string;            // 'border', or 'clear.kind'
  equals?: unknown;        // draw when it equals this (default: true)
  not?: unknown;           // draw when it does NOT equal this
}
```

`PropertyMeta` gains `when?: RowCondition`. `NodeTypeDef` gains
`sections?: Record<string, string>` — the explanatory note a section carries above its rows,
which several panels have and the generator had no way to render.

`PropertyRow` gains one kind and two flags:

```ts
/**
 * A `Track<number>` edited as a *window* — start, end, easing. `switchable` adds the derived
 * enable toggle: off collapses the track to the constant `off`, on restores a window over
 * the layer's own span. Opt-in, because a cloud that never parts is a legitimate cloud and a
 * route that never reveals is just invisible — route's panel offered no toggle.
 */
| { kind: 'window'; maxFrom?: BoundFrom; off?: number; switchable?: boolean }
```

`kind: 'number'` and `kind: 'track'` gain `maxFrom?: BoundFrom` for the same reason, and
`kind: 'select'` gains `numeric?: boolean` — a `<select>` yields a string and text's `weight`
is stored as a number, which the hand-written panel handled with a `parseInt` on the way out.

**Grouped sub-objects.** A `prop` may be a dotted path. Route's `marker` and `follow` are
objects the evaluator reads whole, so a row on `marker.size` reads through the path and writes
`{ marker: { …marker, size } }` back around it (`patchAtPath`). Writing `{ size }` would put a
stray field on the layer, leave the marker untouched, and draw identically — which is why
both objects were `custom` until the path existed.

**Why a named source and not a function.** This is the `optionsFrom` idiom already in the
file: metadata is a static declaration evaluated once at module load, and the composition's
duration is neither static nor knowable to `@geomotion/document` at that moment. The metadata
names the source; the app resolves it. Same reason, same shape, and it crosses the plugin
boundary intact.

## Transactions & commands

**None new.** Generated rows call the same `updateLayer` / `setLayerWindow` / `clearNodeProp`
store actions the hand-written rows did, coalescing by property name so one slider drag
remains one undo step.

## Evaluation & rendering

**Untouched.** Nothing here reaches the evaluator or the renderer, which is what makes the
golden frames a real check on this change rather than a formality: ten identical frames mean
the conversion moved no value.

## Inspector

`SchemaRows` grows four capabilities and keeps its shape:

- **`when`** resolves a dotted path against the node and compares. A row whose condition fails
  is not rendered — the same as the hand-written `{layer.border && …}`.
- **`window`** renders `TrackWindow`, which moves out of `Inspector.tsx` into a component the
  generator can reach, with the enable toggle when `switchable`.
- **section notes** render above a section's rows.
- **`blocks`** — the bespoke content a section carries, in one map with three positions:
  `head` (a control in the heading that acts on the section, like marker's "Place"), `before`
  (an editor a row cannot be — image's file picker, shape's GeoJSON, route's point list), and
  `after` (a readout derived from the rows above it — route's km/s). Every surviving panel
  needed exactly these three, and without the positions the conversions would have had to
  move things.

Six `*Inspector` components are deleted. What stays hand-written is declared `custom: true`
so the decision is on the record, per §5.8 ("write a custom editor only when the default
genuinely cannot work"): image's file picker, shape's GeoJSON editor, marker's coordinate pair
and behaviour stack, route's point list and its icon select — the last because picking "none"
also clears `marker.enabled`, and a row that writes one field cannot write two.

**A section is grouped over every declared property, then filtered.** Grouping the *filtered*
list instead drops a section whose properties are all `custom` — shape's GeoJSON is exactly
that — leaving its bespoke block nowhere to render.

## Timeline · Entities & data

N/A — this change touches neither.

## Plugin API

This is the point of the change. After it, the row kinds available to a plugin's
`contributes.nodeTypes` are the row kinds the built-in layers use, because the built-in layers
have stopped using anything else.

## Performance

Not on a frame path. `propsOf` is a map lookup; `when` is a property read and a comparison,
evaluated per row per render of a panel that draws on selection.

## Tests

As built — 51 new tests, 996 → 1047 across the workspace.

- **Row language, unit** (`schema/conditions.test.ts`) — `valueAtPath` through a dotted path
  and off the end of one; `conditionHolds` with the default, `equals`, `not`, a missing
  property, and `equals: false` (the `?? true` bug that would swallow it).
- **Coverage, extended into groups** (`schema.test.ts`) — a dotted declaration describes the
  object it reaches into, and every field of that object must itself be described. Route's
  `marker` and `follow` were `custom` whole objects until now, which meant a field added to
  either was described by nothing and shown by nothing.
- **Six generated panels** (`SchemaRows.panels.test.tsx`) — the sections, labels and order the
  hand-written panels drew; their notes; the ranges that *shipped*; every conditional row
  appearing and disappearing with the property that gates it; grouped writes preserving their
  siblings; and a drag coalescing to one undo.
- **The drift guard** — every non-custom row a generated type declares must actually appear.
  This is the check M2.7 wanted and could not write while a panel typed its own ranges. It
  covers six types; regions joins the list on the day it is converted.
- **Regression** — the existing `Inspector.*.test.tsx` suites pass untouched.
- **Golden frames** — all ten byte-identical, max Δ0, after every conversion.

### Found on the way

**`maxFrom` could not be tested through the DOM.** The first bound test asserted a `max`
attribute on the Start field. `Num` clamps on commit and never writes one, so the assertion
failed against a bound that was working — and had it passed, it would have passed against no
bound at all. It now types past the end and asserts the clamp.

**A window is not always switchable.** Declaring route's `progress` as a `window` added an
enable toggle its panel never had — a real regression, caught by a test whose own click landed
on the wrong "Enabled". Hence `switchable`, opt-in rather than default.

**An unsectioned `custom` property splits its section in two.** `marker.enabled` is derived
from the icon and never drawn, and having no `section` broke the run: route grew two
"Travelling marker" headings, one of them empty. Custom properties carry a section for the
same reason visible ones do.

**A `window` row's label is never a field label.** The drift guard flagged clouds' "Clearing"
and route's "Reveal" as declared-but-not-drawn. `TrackWindow` draws Start / End / Easing and
uses the label only in its "keyframed beyond a simple window" fallback — the hand-written
panels behaved identically, so the guard was taught the contract rather than the code changed.

**A fresh image ships with its border on**, and a fresh text has no backing. Two conditional
tests were written assuming the opposite and failed on the default rather than the feature —
the shape of mistake `when` invites.

## Future extensions

- **Regions, the seventh.** Deliberately not attempted here. Its panel is 401 lines over
  seven sections and is *mostly* not rows: a boundary loader with three preset datasets, a
  paste importer with its own parser and diagnostics, a live per-region value table, a ramp
  preview strip, a tri-state anchor that maps three options onto `boolean | null`, a custom
  stop order, and a derived stop list that seeks the playhead. The genuinely generatable
  parts — Borders, Opening & closing, Readouts, and the row half of Tour and Colour scale —
  are real, and the rest would be `blocks`; but each block needs the same derived
  `regionSet(layer, dark)`, so the conversion is a restructuring of that panel rather than a
  transcription of it. It is also the type the golden tours exercise. Its own change, which
  is what "one type per change" was for.
- **Extend the drift guard to seven** on that day, and `HAS_PANEL` disappears with it.
- **Move the row components to a `ui` package** (§2 names one) — still outstanding from M2.4.
- **Move the row components to a `ui` package** (§2 names one) — still outstanding from M2.4.
- **Zod at the plugin boundary**, with the ADR.
