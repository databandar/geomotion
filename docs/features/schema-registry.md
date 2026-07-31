# The node-type registry

**Design-doc section:** ENGINEERING_GUIDE §3.4 (schema), §11 (schema-driven inspectors),
ARCHITECTURE §15 (plugins get an inspector for free) ·
**Owner package(s):** `@geomotion/document`, `apps/studio` ·
**Status:** shipped — foundation and first consumers; the seven layer panels are not yet
generated (see *Future extensions*)

## Problem

Two things about a node type were written down twice, in places that could not check each
other:

- **What a fresh one holds.** One `switch` in `project.ts` built all seven layer types; the
  load repair then read the defaults back out of a freshly constructed layer. It worked, and
  it meant a new node type was an edit to a function that already knew about seven others.
- **How each property is edited.** 1,600 lines of hand-written inspector rows, each typing
  out a label, a range, a step and a unit beside its field. Nothing related the two, so a
  property could be added to the model and never appear in the UI; or appear with a range
  that nothing else enforced; or be renamed in one place and not the other.

§3.4 already says what to do about it: "Each node type registers a zod schema for its props,
**property metadata** (label, unit, min/max/step, inspector row kind), and **defaults**. One
module per node type in the owning package. The schema-driven inspector reads this metadata;
a property without metadata does not appear in the UI — that is intentional pressure to
document properties."

The reason it matters beyond tidiness is §15: a plugin's node type, or a node from a newer
build, has no hand-written panel and never will. Either the editor can render a node from its
declared metadata, or plugin node types are second-class forever.

## User story

As a **plugin author** (§15) I want to contribute a node type and have the editor show it —
inspector rows, labels, ranges, the source pip — without shipping any UI. And as **whoever
maintains this**, I want adding a property to a node type to be one edit rather than two that
can disagree.

## Document model

No document change. This is a description *of* the model, not a change to it — no new field,
no format bump, and a project saved before and after is byte-identical.

```ts
interface NodeTypeDef {
  type: string;                  // the discriminator stored in the document
  kind: string;                  // what it is called in the UI — "Choropleth layer"
  create: (at: number) => DocNode;   // a fresh one; its fields *are* the defaults
  props: PropertyMeta[];
}

interface PropertyMeta {
  prop: string;
  label: string;
  row: PropertyRow;              // number | track | color | toggle | select | text
  section?: string;              // which inspector section it belongs under
  help?: string;
  custom?: boolean;              // has a bespoke editor; the generator skips it
}
```

`PropertyRow` is a closed union, so adding a row kind is a compile error at the one place
that draws them rather than a property that silently renders nothing.

`custom` is declared rather than implied by omission. "No generated row" is then a decision
on the record — and the coverage test can insist that every field is either described or
explicitly excused.

### Where it lives

`packages/document/src/schema/`: `meta.ts` (the registry), `layers.ts` (the seven layer
types), `containers.ts` (group and camera), `index.ts` (registers them). §3.4 asks for one
module per node type; the seven layers share a base and a colour cursor, so splitting them
into seven files would spread one small thing across a directory. The unit that matters is
the *definition* — each type's defaults and metadata sit together, and nothing else in the
codebase describes either.

### Not zod, yet

§3.4 names zod for boundary validation. This package already validates at the load boundary
by checking each field against **the type of its default** (`coerceToDefaults` — "the defaults
are the schema"), which is tested and covers the shapes a file actually arrives in. Adding a
second description of the same fields — one to validate, one to repair — is how the two
drift, which is the problem this milestone exists to fix. Zod arrives with the plugin
boundary, where input is genuinely untrusted and the right failure is an error rather than a
repair, and it comes with the ADR §13 requires for a new dependency.

## Transactions & commands

None new. The generated rows call the same `updateLayer` / `setLayerTrack` store actions the
hand-written ones do, coalescing by property name so one slider drag is one undo step.

## Evaluation & rendering

Untouched. Nothing here reaches the evaluator or the renderer.

## Inspector

`SchemaRows` renders a node from `propsOf(node.type)`, grouped into sections in declaration
order. It draws:

- **the group** — its opacity row is now generated rather than hand-written;
- **any node type with no hand-written panel** — a plugin's, or one from a newer build.

The seven layer types keep their panels. Their metadata is written, aligned to the labels and
ranges those panels actually use, and tested — but each panel also carries behaviour the row
language cannot yet express: a bound that depends on the composition's duration, a colour
field that appears only when a backing is switched on, a "use map centre" button beside a
coordinate. Converting them is a milestone of its own; doing it in the same change as the
registry would make a regression in either impossible to attribute.

## Entities & data

None.

## Plugin API

This is the shape a plugin's `contributes.nodeTypes` will register. `registerNodeType` is
idempotent for the same definition (a dev-server reload must not throw) and refuses a
*different* definition claiming a type that is taken — a plugin shadowing a core node type,
which §15 forbids and which would change what every existing project means.

## Performance

Registration is module-load work over nine types. `propsOf` is a map lookup. Nothing here is
on a frame path.

## Tests

- **Coverage, both directions** (`schema.test.ts`): every field a fresh node constructs is
  described or marked custom, and nothing is described that the node does not have. Both
  failures are silent in a hand-written panel — a property with no row, or a row wired to a
  field that was renamed.
- Every row has a label; every slider has bounds to scrub between.
- The registry builds the same layer `createLayer` does, and fills a loaded one from the type
  that owns it.
- An unregistered type keeps its own fields rather than being rewritten (see below).
- `registerNodeType` is idempotent, and refuses a conflicting claim.
- `SchemaRows.test.tsx` registers a node type the editor has never heard of and asserts its
  rows appear and write back — number, select, toggle and a track with its source pip — with
  no change to the inspector. That is §15's "for free", tested rather than asserted.
- Golden frames: **all ten unchanged**; `pnpm verify` green at 819 tests.

## Found on the way

**An unknown node type crashed the properties panel.** The subject header looked its icon up
in a map keyed by the seven known types and passed `undefined` to `Icon`, which read `.paths`
off it. Found by the plugin-node test, which is exactly the case it will be hit by in
practice. The icon now falls back and `Icon` draws nothing for a name it does not know — a
missing glyph is a far better failure than a panel that will not render.

**A node type from a newer build was being rewritten into a text layer.** The load repair
filled unknown types from the text-layer defaults, so a `hologram` node came back carrying
`text: "Your title here"`, `x`, `y` and `size` — and the next save wrote that to disk. It now
fills only the fields every layer shares and keeps everything else untouched, so a document
from a newer build (or a plugin's node) round-trips intact through an older editor. Nothing
draws it, the panel lists it, and its own properties survive.

**A second table of display names.** "Choropleth layer" and its six siblings lived in the
inspector; a type missing from that map showed a blank subtitle. The name now comes from the
registry along with everything else.

## Future extensions

- **Convert the seven panels**, one type per change, smallest first (clouds, image, text,
  shape, marker), leaving route and regions — whose panels are half data-import flow — last.
  Each conversion needs the row language to grow: dynamic bounds, a `when` predicate for
  conditional rows, and grouped sub-objects (`marker.icon`, `follow.zoom`).
- **Zod at the plugin boundary**, with the ADR.
- **Move the row components to a `ui` package** (§2 names one); they are in `apps/studio`
  today because that is where they already were.
- **Entity-picker and ramp rows**, which §11 lists and no node type can currently declare.
