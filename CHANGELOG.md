# Changelog

Notable changes to GeoMotion. Newest first.

This project is working towards the v2 design in `docs/geomotion-v2-design.html`; entries
name the section each change answers to.

## Unreleased

### Fixed — a frame no longer goes out before its basemap tiles (§00, §14)

- **Rendered videos could contain grey loading blocks, and nothing said so.** `waitForIdle`
  resolved on both the `idle` event *and* its timeout, so a tile that never arrived was
  indistinguishable from one that arrived instantly. The frame was captured with the blocks
  in it and the render reported success.
- It **returns a verdict** now — `true` settled, `false` gave up. Still a resolve, not a
  reject: a render must not unwind on frame 41 of 700. Timing out stays legal; pretending it
  did not happen does not.
- Both frame loops **count the early frames and report them**, with indices:
  `! 3 of 724 frames were captured before their basemap tiles finished.`
- **Tiles are warmed before frame 0** on a 30 s budget rather than 12. Most timeouts are the
  cold start, not the middle of a render.
- **`--wait-tiles`** buys a draft the waiting back (19 s → 74 s on the 724-frame example, so
  it stays opt-in); **`--strict-tiles`** turns an unfinished frame into a failed render, for
  CI.
- See [`docs/features/tile-readiness.md`](docs/features/tile-readiness.md).

### The document model — M3.1, every declared number is a track (§04, §06, §18 Phase 1)

- **§04's "every property is a track" was true of the machinery and false of the document.**
  All four track kinds evaluated, behaviours applied over them, the source pip retargeted a
  property between kinds — wired to **three** of the 89 properties the registry declares. The
  other 86 were bare values the evaluator handed to the renderer untouched, so they could
  never be keyframed, bound to a fact, or driven by an expression.
- **Twenty-eight properties convert**, across all seven layer types — a title's size and
  position, a cloud's coverage and drift, a route's width and its travelling marker, a
  region's fill and borders. **Format 8 → 9**, with a frozen fixture.
  - The migration **reads the registry** rather than a list of its own, so it cannot convert a
    property the inspector still shows as a plain number, nor miss one it shows as a track.
  - Timing (`in`/`out`/`fade`) and formatting (`decimals`) stay plain: they are not properties
    of a layer's appearance, and animating them means nothing.
- **One resolution pass replaces twenty-eight special cases.** The evaluator used to hand the
  renderer the document node and spell out the one or two tracked properties by hand. It now
  calls `resolveTracks(node, time, { facts })` — registry-driven, so a node type from a plugin
  or a newer document resolves by the same rule. That extends §15's "for free" from the
  inspector to evaluation.
  - **The fallback is the type's own default**, not zero. Zero is a real and wrong value for
    `scale`, `opacity` and `size`: a broken binding would render as a genuine low rather than
    as a failure.
  - **`Resolved<T>`** makes the renderer's blindness a type. Handing it an unresolved track is
    now a compile error, which is what made converting twenty-eight properties in one change
    safe rather than hopeful.
- **The inspector needed no hand-written change** for six of the seven panels, because M2.7
  generated them from the same registry. Flipping a row from `number` to `track` swapped a
  slider for a tracked one with its source pip. Regions still draws its own panel, so its four
  rows were the only manual work — the last argument for finishing that conversion.
- **Golden frames all ten byte-identical, max Δ0**, and a v1 document rendered end-to-end
  through all nine migrations. A static track evaluates to the number it replaced, so any
  movement would have been a bug in the migration or the resolver.
- 51 new tests (1,057 → 1,108), including coverage asserted *over the registry* rather than a
  list, so a property added tomorrow is covered without anyone remembering.
- **Found on the way:** every track store action wrote at the **top level**, so a dotted
  `marker.size` created a literal key with a dot in it beside the real object — the write
  appeared to succeed, undo recorded it, and nothing on screen ever changed. Only a round-trip
  test on a *nested* property found it. All three actions resolve the owner first now.
  - A tracked field carries a source pip, so a test helper querying `input, …, button` began
    returning the pip and editing nothing; and a suite that found its subject as "the only
    field with a pip" stopped naming anything, which is the milestone working.
  - A cached `typecheck` task reported success over stale input and hid a missing module-scope
    function. The runtime test caught it — a green typecheck is not proof on its own.

### The editor — M2.7, six of the seven layer panels are generated (§3.4, §11, §15)

- **Six hand-written panels are gone.** Clouds, image, text, shape, marker and route are
  drawn from their property metadata, like the group and like any node type a plugin
  registers. `Inspector.tsx` goes 1,551 → 1,194 lines and stops being the place a layer's
  ranges are decided. Regions keeps its panel — see the last bullet.
- **The two descriptions had already drifted, and nothing could see it.** M2.4 registered the
  metadata and left the panels hand-written on purpose; this change measured the cost.
  **Twenty rows disagreed** across the six, and **the panel won every one** — those are the
  numbers users have been scrubbing and existing projects were authored against.
  - **One was functional.** A marker's label offset ran `-80 … 80` in the panel — a label
    above the dot — and the declaration floored it at 0. Generating from the declaration
    without checking would have quietly removed a placement people had already used.
  - The rest were ranges, steps, section headings that never existed, and one option label
    ("Ken Burns" declared, "Slow push in" shown). The full table is in the feature doc.
  - The coverage test could not have caught it: it asserts a slider's bounds are *defined*,
    which is all a test can do while the number the user scrubs is typed somewhere else.
    Generating the row is what makes the assertion mean something.
- **The row language grew only what the conversions needed**, one addition per panel that
  could not otherwise be drawn:
  - **`when`** — a row drawn only when a sibling says so, which is what `{layer.border && …}`
    was. **Declarative**, not a predicate function, because §15 sends a plugin's node type
    across a worker boundary and a function does not survive being structured-cloned. `prop`
    takes a dotted path, so a row can depend on a track's *kind* (`clear.kind`).
  - **`window`** — a track edited as start/end/easing, with an optional (`switchable`) enable
    toggle. Two panels drew this by hand, so it was never one control's quirk. `TrackWindow`
    moves out of `Inspector.tsx` into a module the generator can reach.
  - **`maxFrom: 'duration'`** — a bound the registry cannot know when the declaration is
    evaluated at module load. The same idiom as `optionsFrom`: the metadata names the source,
    the app resolves it, and it crosses the plugin boundary intact.
  - **Grouped sub-objects** — a `prop` may be a dotted path. Route's `marker` and `follow`
    are objects the evaluator reads whole, so a row on `marker.size` writes
    `{ marker: { …marker, size } }` back around it. Writing `{ size }` would put a stray
    field on the layer and draw identically, which is why both were `custom` until now.
  - **`numeric` on a select** — `<select>` yields a string and text's `weight` is stored as a
    number; the hand-written panel called `parseInt` on the way out.
  - Plus **section notes** — the sentence several panels opened a section with, which the
    generator previously had nowhere to read and would have silently dropped.
- **What cannot be a row stays hand-written**, declared `custom: true` so the decision is on
  the record, and rendered *inside* its generated section through one `blocks` mechanism with
  three positions — a control in the heading, an editor before the rows, a readout after them.
  Every surviving panel needed exactly those three: image's file picker, shape's GeoJSON
  editor, marker's coordinate pair, behaviour stack and "Place" mode, route's point list, its
  km/s readout, and its icon select — the last because picking "none" also clears
  `marker.enabled`, and a row that writes one field cannot write two.
- **No document change**: no new field, no format bump, no migration. Golden frames all ten
  byte-identical, max Δ0 — which is the real check on a like-for-like conversion.
- **The drift guard, finally writable.** Every non-custom row a generated type declares must
  now actually appear — the check this milestone wanted and could not write while a panel
  typed its own ranges. Coverage also follows a dotted row into its object, so a field added
  to `marker` or `follow` can no longer be described by nothing and shown by nothing.
- 51 new tests (996 → 1047).
- **Regions is deliberately not converted.** Its panel is 401 lines over seven sections and is
  mostly not rows — a boundary loader, a paste importer with its own parser, a live
  per-region value table, a ramp preview, a tri-state anchor over `boolean | null`, and a
  derived stop list that seeks the playhead. Every block would need the same derived
  `regionSet`, so it is a restructuring of that panel rather than a transcription, and it is
  the type the golden tours exercise. Its own change — which is what "one type per change"
  was for.
- **Found on the way:**
  - The first `maxFrom` test asserted a `max` attribute on the DOM. `Num` clamps on commit and
    never writes one, so it failed against a bound that worked — and had it passed, it would
    have passed against no bound at all. It now types past the end and asserts the clamp.
  - Declaring route's `progress` as a window **added an enable toggle its panel never had**.
    Hence `switchable`: a cloud that never parts is a legitimate cloud, a route that never
    reveals is just invisible.
  - A `custom` property with no `section` splits its section in two — route grew a second,
    empty "Travelling marker" heading before `marker.enabled` was given one.
  - A section whose properties are *all* custom was not built at all, leaving shape's GeoJSON
    editor nowhere to render. Sections are now grouped over every declared property and only
    then filtered.

### The document model — M2.6, the map context becomes a node (§04)

- **A map context is a node, and things can belong to it.** `project.contexts[]` is gone; a
  context lives in the flat store with the layers, groups and cameras, and the layers
  parented to it are the ones it draws. That is §04's "world-space descendants project
  through it", with one map: a context that is not live has no viewport for its children.
  - **Story blocks remain the structural unit.** Which context is live is still decided by
    the block under the playhead, and a block still references a context by id — the reason
    the old shape was a table keyed by id rather than an inline copy. `Scene` is deliberately
    *not* introduced; a future one would wrap story blocks rather than replace them, needing
    one optional field on a block and no migration.
  - Membership replaces maintaining a list of layer ids by hand. `hidden` still works, and
    says the opposite thing: membership is what a stretch is *made of*, `hidden` is what an
    otherwise-complete composition leaves out.
  - A context nobody names is never live, so its subtree never draws — stated, and shown on
    the panel row rather than left to be discovered.
- **Its inspector is generated** from the registry, with no hand-written panel — the first
  real payoff of the node-type registry. The basemap row is also the first to name an
  **options source** rather than a literal list, because basemap ids live in
  `@geomotion/map` and the document package may not depend on it.
- **`optional` is now part of property metadata.** A map context's settings are absent on
  purpose — absent *means* "the project's own" — so the inspector offers "use the project's"
  and clearing a field removes it rather than writing a blank.
- Contexts are picked per beat in the storyboard, and by three commands (`context.add`,
  `context.assign`, `context.clear`). Nesting is storable today and draws nothing: that is
  the seam an inset (§07) will use.
- **Format 7 → 8** with a frozen fixture. Contexts append after the layers, so no draw order
  moves; golden frames unchanged.
- **Fixed on the way:** three of the store's ordered views were uncached, and the third one
  used as a React selector took the editor into "Maximum update depth exceeded". Every
  ordered view is memoised now, with a test that enumerates them so the next one cannot
  repeat it.

### The editor — M2.5, commands and ⌘K (§02, §11, §13)

- **⌘K reaches everything.** A command palette over every action the editor has: type a few
  letters, `↑`/`↓`, `Enter`. Results are ranked rather than filtered — "gr" finds *Group
  selection* before *Toggle text background* — and match category and keywords too, so
  "choropleth" finds *Add regions*.
  - A command that cannot run right now is **greyed, not hidden**: one that vanishes when it
    does not apply teaches nobody that it exists.
- **Shortcuts are data.** The keymap is a lookup in the same registry the palette draws, so a
  binding exists only because some command claims it, and the palette shows the shortcut the
  keyboard actually obeys. `⌘D`, `⌘L`, `⌘G`, `⌘↑`/`⌘↓`, `F`, `V`/`R`/`M` are new; the old
  hand-written `switch` is gone.
  - **Two commands claiming one shortcut now fails CI** (§11), whichever way each was
    spelled — `Shift+Mod+G` and `mod+shift+g` normalise to one binding before comparison.
  - §02's reserved keys are listed in the package and tested against the features the design
    doc reserved them for, so nothing can quietly take one.
- **A new package, `@geomotion/commands`**: the registry, chord normalisation, key
  resolution, palette ranking and collision detection. No DOM, no React, no store — a
  command's `run` is a closure its registrar supplies, which is what will let a plugin (§15)
  or a copilot (§12) register through the same door without the registry learning anything
  new.
- No document change; golden frames unchanged.

### The document model — M2.4, the node-type registry (§3.4, §11, §15)

- **One description per node type.** What a fresh node holds and how each of its properties
  is edited now live together, in `document/schema/` — nine types, defaults and property
  metadata side by side. Construction, the load repair and the inspector all read it.
  - Previously the defaults were a `switch` in `project.ts` and the editing metadata was
    1,600 lines of hand-written inspector rows, with nothing relating the two: a property
    could be added to the model and never appear in the UI, or appear with a range nothing
    enforced, or be renamed in one place and not the other.
  - **A coverage test in both directions** keeps it honest: every field a fresh node
    constructs is described or explicitly marked `custom`, and nothing is described that the
    node does not have. Both failures are invisible in a hand-written panel.
- **A node type the editor has never heard of gets an inspector from its metadata alone** —
  §15's promise, now tested by registering one and driving its rows. That is what makes
  plugin node types first-class rather than second.
- The group's opacity row is the first generated one. The seven layer types keep their
  hand-written panels for now; their metadata is written and aligned to the labels and ranges
  those panels use, and converting them is a milestone of its own.
- No document change, no format bump, and all ten golden frames unchanged.
- **Fixed on the way:** an unknown node type crashed the properties panel (an icon lookup
  that returned `undefined`), and a node from a newer build was being rewritten into a text
  layer on load — complete with "Your title here" — which the next save then wrote to disk.
  Unknown types now round-trip intact.

### The editor — M2.3, groups (§04, §6.5)

- **Layers can be grouped.** `⌘G` puts the selected layers in a named group where the
  topmost of them sat; `⇧⌘G` puts them back. The layer panel is a tree: a disclosure
  triangle, a child count, an eye and a lock per group, children indented under it.
  - A group is a **node type**, not a flag — the first one to use the `parentId` the flat
    store put on every node. It draws nothing, so it is not a `Layer`, and the evaluator's
    loop never has to ask which of the things it is holding are drawable.
  - **Hiding, locking and opacity apply to everything under it.** Opacity is a track, so a
    beat fades as one thing and the fade is keyframable; the child's own `visible` is left
    alone, so the panel can show inheritance rather than rewriting what you set.
  - Draw order is §6.5's rule exactly: depth-first document order. A group occupies a
    position, so a layer steps past it.
  - Deleting takes the subtree; duplicating deep-copies it with fresh ids.
- **Multi-select in the layer panel.** ⌘/Ctrl-click toggles, Shift-click extends, and the
  last row clicked stays the primary — the one the inspector edits, so a selection of five
  never leaves the panel guessing which one it is showing.
- **A new layer lands inside the selected group**, so a group is not a one-way door.
- **What a group deliberately does not have**: a time window (a group that clipped its
  children would silently truncate a layer whose bar you can see at its authored length —
  nested scenes are the node type that owns a clock, §10) and a transform (nothing has a
  shared one to inherit yet).
- **Additive: no format bump**, and all ten golden frames are unchanged — a new node type
  must not move the projects that do not use it.
- **Fixed on the way:** re-composing a project that had been through the editor would have
  flattened every group. The composer writes the oldest document shape, so those nodes reach
  the format chain already carrying a parent, and the 6→7 step was overwriting it.

### The document model — M2.2, the flat node store (§04 Decision 01)

- **The scene becomes one flat store.** `project.layers` and `project.cameras` are gone;
  a project holds `nodes: Record<NodeId, Node>`, and every node carries `parentId` and a
  fractional-index `order`. Layers and cameras sit in it side by side, which is what §04
  means by "cameras are siblings of content: observers, not containers".
  - Every ordered list is **derived**, never stored: `layersOf` (draw order, exactly what
    the array used to hold), `camerasOf`, `liveCamera`, `childrenOf`, `nodeAt`. Views are
    memoised per document version, which they have to be — a selector that rebuilds its
    array on every render is an infinite loop under zustand's snapshot check.
  - Writes go through `addNode` / `removeNode` / `moveNodeBy` / `setNodeParent`, the only
    code that computes an order key. Deleting takes the subtree with it (§3.2).
  - **A reorder is now one patch to one field** instead of two patches to two array slots.
    That is the whole point: it is what turns multiplayer into a per-property merge rather
    than a tree merge, and it is what makes groups, scenes and nested compositions storable
    at all — they are "a node with a parent", and an array had nowhere to put one.
  - `order` is a string, not a number, because between any two strings there is always
    another. A thousand drops onto the same boundary never need a renumbering pass.
- **Format 6 → 7 migration**, with a frozen `format-7.geomotion.json` fixture. Relative
  layer order is preserved, so the picture is unchanged; a node with a missing or colliding
  id gets a fresh one rather than being silently dropped by the record.
- **Nothing moved on screen.** All ten golden frames are bit-identical, and the editor was
  driven in a real browser through add, rename, reorder, duplicate, undo and a camera
  keyframe with no page errors.
- **Fixed on the way:** selecting a camera keyframe put React into an infinite update loop
  (`Maximum update depth exceeded`) — a defect older than this change, confirmed against
  the previous commit. The selector derived a fresh shot row on every render.

### The document model — M2.1, the camera is a node (§04, §09)

- **The camera becomes a node.** A project now holds `cameras: CameraNode[]` — the
  first is the live camera until §04's switcher track exists — and each channel
  (`center`/`zoom`/`bearing`/`pitch`) is a property track like any layer's, evaluated
  by the same rule. The evaluator's old per-frame projection of whole-camera rows is
  gone; the document holds the tracks itself.
  - The shot row is a **derived view** (`shotsOf`), never storage: the editor keeps
    speaking of one row carrying all four channels, easing and arc, and
    `upsertShot`/`patchShot`/`removeShot` write a row across the channels atomically.
    Re-aiming a shot at the playhead replaces it, keeping its id and time, so the
    selection and the timeline stay put.
  - `behaviours: {}` is declared on the node now — the empty home of the rig stack §09
    will fill.
- **Format 5 → 6 migration.** Rows convert to per-channel tracks, the old `camera` key
  is deleted rather than ignored (§3.6.4), and rows too broken to mean anything are
  dropped rather than crashing the load. `CURRENT_FORMAT` is 6 and a frozen
  `format-6.geomotion.json` fixture joins the suite that proves every historical format
  still opens.
- **Zero behavioural change.** The camera's evaluation (interpolation, dip arc,
  map-context defaulting) is untouched; golden frames stay identical. The stored shape
  changed so the write path can, not because the picture should.

### The editor itself

- **Locked layers.** A lock on each row; a locked layer refuses every edit — property
  changes, retiming, keyframes, reordering, deletion — and says so where you tried.
  - The refusal lives in the store, not the components. There are already a dozen paths
    that reach a layer, and a lock each control has to remember about is a lock the
    thirteenth control forgets. One gate, so the answer is the same wherever the edit
    came from.
  - The inspector's fields go inert rather than staying live and snapping back, via a
    single disabled `fieldset` — measured in a browser: 18 controls inert while locked,
    all 18 live again on unlock.
  - Duplicating a locked layer gives an **unlocked** copy. A divergence from After
    Effects and Figma, chosen because duplicating is how you get an editable version of
    the thing you locked, and the copy is selected immediately.
  - Unlocking removes the field rather than writing `false`, so a project that was never
    locked and one that was locked and unlocked save identically.
- **One "Add layer" button** in place of the seven-button grid. The grid was faster per
  layer but held a fifth of the panel's height permanently, for an action taken a handful
  of times per project.
- **Row actions folded into a `…` menu**, which puts Delete two deliberate steps from
  Move up on a row people click constantly.
- **Stage chrome.** The shot the picture comes from, named and clickable — it selects the
  keyframe that decides the framing. Plus Fit (frames everything in the project, using
  the same `fitBounds` solver as the tour and double-click-to-fly) and fullscreen.
- **The transport moved inside the stage card**, so the controls that drive the
  composition sit on the same surface it is drawn on.
- **Record mode.** Armed, a settled map view writes a camera keyframe at the playhead —
  the counterpart to `K`, which could only place one shot at a time. It listens on
  `moveend` and only for moves a person made: MapLibre moves itself on every playback
  frame, so without that check arming record and pressing play would carpet the timeline
  with keyframes describing the animation it was already playing.
- **A dozen hardcoded dark surfaces now follow the theme.** They were invisible in light
  mode's first pass — a dark hover on a white row, a near-black command box on a white
  panel, a white keyframe diamond on a white panel, and a teal source pip at 1.9:1.
  Colours are declared once with `light-dark()` instead of a light palette written twice,
  which is what let a token be added to one copy and not the other.

- **Light mode.** The colour tokens are now a pair rather than one dark set, and every
  surface is styled through them. The default follows `prefers-color-scheme`; the toggle
  in the rail cycles system → light → dark and is remembered. Choosing *system* removes
  the override rather than freezing today's answer, so the editor still follows the OS
  when it changes at dusk.
  - Editor theme is a preference, not document data — it is not undoable and never
    reaches a saved project (guide §4). A composition's basemap stays whatever the
    project says; a light editor around a dark map is a correct picture, not a bug.
- **A section rail.** Layers, Assets, Audio, Camera, Text, Data and Scenes down the left
  edge. Sections without an implementation are shown disabled with the reason on hover
  rather than hidden — a gap you can see is information, and a menu that silently grows
  over releases teaches nobody where anything is.
- **Toolbar, inspector and timeline restyled** to match: a project chip with its save
  state, centred place search, the subject of the inspector named in a header chip, and a
  zoom slider on the timeline.
- The active rail label uses full-strength ink instead of the accent. Measured from
  composited pixels — accent-on-wash came out 3.39:1 in dark and 3.97:1 in light, both
  under 4.5 for text, because a mid-purple on a purple-tinted wash is two steps of one
  hue. The bar and icon carry the state; the word stays readable.

### Storytelling (v2 §10)

- **Re-composing keeps your work.** `video.mjs` overwrote the project file outright while
  printing "open this in the editor to tweak by hand" about it — so changing one line of
  the script destroyed every hand edit. It now merges: the composer owns what it made,
  and anything you added is yours. `--fresh` starts over deliberately.

- **Ripple.** Dragging a story block moves the layers it choreographs and the narration
  it owns, and re-anchors every block after it. Re-lengthening a block pushes or pulls
  what follows. §00's frozen voice bed is now impossible in both directions: the picture
  follows the voice, and the voice follows the picture.
  - Moving a layer carries its keyframes. Track times are absolute, so shifting only
    `in`/`out` would leave a route's reveal behind.
  - Cue ownership is compared with a tolerance. The composer writes cue times rounded and
    block times not, so three of six lines in a real project were orphaned by four
    ten-thousandths of a second.
- **Storyboard panel.** The script, in order, with the beat under the playhead marked and
  each card a jump into the composition. A timeline is the right tool for *when*
  something happens and the wrong one for *what is being said* — the lane shows a
  truncated line in a chip a centimetre wide.
- **Story blocks live in the document.** The composer wrote its beats to a subtitle file
  and a console listing, then flattened them away — so a beat could not be retimed and
  re-composing discarded every hand edit. They are now a top-level document section,
  shown as a lane on the timeline. Purely additive: no format bump.

### Map contexts (v2 §04)

- **A story block can switch what the map looks like** — basemap, terrain, and which
  layers are held back — for the stretch of time it covers. A lightweight stand-in for
  §04's scene-owned map context, kept compatible with scene containers arriving later:
  contexts are a top-level table keyed by id and a block references one.
- A context's camera is a **default**, applying only where the block is not keyframed.
- **Projection is carried but not applied.** MapLibre 5.24 throws asynchronously when the
  projection changes after a basemap switch; three guards failed to contain it, and
  shipping an uncaught error on an ordinary edit is worse than the feature is worth. See
  `docs/features/map-contexts.md`.

### Cameras (v2 §02, §09)

- **Double-click a region and the camera frames it** — the design document's signature
  gesture. It writes a camera keyframe at the playhead, so the camera animates into the
  region from wherever the previous key left it: an authoring act, not a navigation
  shortcut. Framing comes from the same `fitBounds` solver the automated tour uses, so a
  shot placed by hand and one placed by the composer are identical for identical inputs.

### Motion engine (v2 §04, §06)

- **Expression tracks** — the fourth track kind evaluates. A property can now compute
  its value: `8 + 2 * sin(t * 3)` breathes, `pop / 1000000` sizes by a fact. Parsed and
  walked, never `eval`'d — a project file is untrusted input — and total, deterministic
  and cycle-free by construction: failures fall back rather than throw, there is no
  clock or random in the grammar, and inputs read entity facts, never other tracks.
  An `fx` button beside the source pip toggles a property to a formula seeded with the
  value on screen, and the inspector shows what it comes to at the playhead — or why it
  does not.
- **Behaviour stacks**, keyed by the property each modifies. `pop` and `pulse` were
  booleans with their constants inlined in the evaluator; both are now toggleable,
  parameterised entries. Curves preserved exactly.
- **Property tracks** — `static`, `keyframed` and `bound` evaluate through one pipeline.
  Any tracked property can be animated from the inspector's source pip and retimed on a
  keyframe row.
- **`drawStart`/`drawEnd` and `dissipate*` deleted**, collapsed onto tracks. A route can
  now pause mid-draw or run backwards, which the old window could not express.
- **The camera is four property tracks**, each with its own interpolator.

### Smart objects (v2 §05)

- **Entity registry** with stable ids, aliases and facts carrying `{value, source,
  asOf}`; `sourcesUsed` generates a credit line from the facts a video actually used.
- **One join.** Three private joins — the survey reader's alias table, the editor's paste
  box, the layer's name map — became one. Pasting `Jammu & Kashmir` into the editor used
  to be rejected while the same spelling imported cleanly on the command line.
- **`bound` tracks**: a property reads a fact by reference, so a marker can be sized by a
  region's value.

### Document

- **Format chain** (`document/migrations/`) with a frozen fixture per version, all loaded
  to current by the test suite.
- Wrongly typed fields are repaired at load rather than crashing the render loop.

### Fixes

- Audio cues had no positioning rule and stacked in normal flow; a project with six
  narration lines spilled its script over three layer rows.
- The Dashed toggle threw on every use — `line-dasharray` is a paint property and was
  being set through the layout API.
- A glow switched on after its layer existed drew *over* its own line.
- Rendered numbers depended on the exporting machine's locale.
- A script with invalid beats rendered an empty map and reported success at every step.
- A draft of a square composition came out widescreen.
