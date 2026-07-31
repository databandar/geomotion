# Changelog

Notable changes to GeoMotion. Newest first.

This project is working towards the v2 design in `docs/geomotion-v2-design.html`; entries
name the section each change answers to.

## Unreleased

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
