# GeoMotion — Architecture

> Canonical source: [`docs/geomotion-v2-design.html`](docs/geomotion-v2-design.html).
> This file is the greppable markdown distillation of it, preserving the same `§NN` section
> numbering that [`ENGINEERING_GUIDE.md`](ENGINEERING_GUIDE.md) cites throughout. If the two
> disagree, the design doc wins; report the drift.
>
> **Implementation status:** the code in `apps/studio/` and `apps/pipeline/` is v1 (the
> shipped prototype this architecture learned from), now inside the §2 workspace and being
> converted in place. `packages/` is where the engine lands as it is extracted. See
> [`docs/AUDIT.md`](docs/AUDIT.md) for the migration debt register.

---

## §00 Lessons from v1

Six scars that justify the design. Every one is a shipped bug or a validated win.

| Lesson | Was | Now |
| --- | --- | --- |
| **Monolith layer** | One `regions` layer with ~45 fused fields | A scene graph of small nodes; the tour decomposes into a camera rig plus a scene sequence |
| **Time-source bug** | A stray map event re-rendered export frames at the wrong `t` | One deterministic clock; every evaluator is a pure function of `(document, t)` |
| **Frozen voice bed** | Narration mixed once; any retime broke sync forever | Audio clips are scene children; the mix renders from clips at export |
| **LLMs typed the numbers** | The model wrote figures literally and once read `{previous}` aloud | Facts belong to smart objects; models write references; AI output is validated |
| **Fragile join** | Datasets joined to geometry by name, per project, with alias tables | Joins happen once into entities with stable IDs |
| **WYSIWYG or nothing** | *(right in v1, kept)* | Preview renders at output resolution; one render path for screen and export |

---

## §04 Scene graph

Content lives in a world; **cameras observe it**, they do not contain it. Every node inherits
transforms from its parent and declares its space: `world` (lng/lat) or `screen` (composition
units).

```
Project
  Scene
    Cameras            (A, B, … + switcher track)
    MapContext         (projection, basemap, terrain)
      Region layer
      Marker layer
      Heatmap layer
      Route layer
      Label layer
      MapContext       (nested = inset)
    UI group           (screen space: titles, legend, lower thirds)
    Audio group        (voice, music, SFX)
    Effects group      (adjustment layers, grade)
```

Consequences of the shape: insets are nested map contexts; a second camera is a hard cut away;
world-space groups pan with the planet while the UI group holds still; "which camera is live" is
itself an animatable track.

### Storage — Decision 01: logical tree, flat storage

The hierarchy above is *logical*. Physically nodes live in a flat `Map<NodeId, Node>` with
`parentId` and a fractional-index `order` (Figma's shape). Undo is an inverse-patch log; AI
proposals are patch sets; multiplayer becomes a per-property CRDT problem instead of a
tree-merge nightmare.

*Rejected:* v1's nested JSON, which deep-cloned the whole project per keystroke.

**Built** (document format 7): `project.nodes` is that flat record, layers and cameras
together, every node carrying `parentId` and a fractional-index `order`; the ordered lists —
`layersOf`, `camerasOf`, `childrenOf` — are derived and memoised, never stored. See
[`docs/features/node-store.md`](docs/features/node-store.md). Still to come on top of it:
group and scene node types, `space` on the node, and `props: Record<string, Track>`.

### Every property is a track

```ts
Node  { id, type, name, parentId, order, space: 'world'|'screen',
        props: Record<string, Track>, locked, hidden }

Track = { kind: 'static',    value }
      | { kind: 'keyframed', keys: Keyframe[] }
      | { kind: 'bound',     ref, path, scale }   // §05
      | { kind: 'expr',      source, inputs }     // §06

value(t) = behaviors( expr( base(t) ) )           // one pipeline, whole app
```

The inspector shows a source pip per property (grey static · teal keyframed · violet bound ·
amber expression) and any property can be retargeted between kinds in place. Assets are
content-addressed blobs referenced by hash; the project file is small, diffable, versioned JSON
with per-version migrations.

---

## §05 Smart objects

The keystone. A smart object is an entity with a **stable ID** (`geo:in-wb` is West Bengal,
forever) owning three things:

1. **Geometry, in versions** — official depiction, Natural Earth, historical snapshots by date,
   and any user edit from the geometry editor (§08). A project sets a boundary policy; layers
   reference the entity, not a file.
2. **Facts, with provenance** — a typed table where every fact carries `{value, source, asOf}`.
   Imported datasets merge in as fact columns through one join with loud diagnostics. Computed
   facts (rank, delta vs previous round) derive automatically.
3. **Bindings out** — anything may reference `{entity.capital}`, `{entity.population}`,
   `{entity.rank}`: labels, callout fields, chart series, narration lines, thumbnail text,
   legend domains, camera look-at targets, region masks.

Provenance is functional, not decorative: the credits line can be *generated* from the facts the
video actually used.

### Decision 02: entities are the join; layers never join data themselves

Datasets join once, into entity facts, at import — with unmatched-key diagnostics at that single
choke point. Every layer, label, chart, and narration line then binds by entity ID. v1 joined by
name inside the regions layer and re-fought alias battles per dataset.

---

## §06 Motion engine — one substrate, three skins

Underneath, every animation is a **procedural graph** of typed nodes. Almost nobody needs to see
it. The same substrate wears three skins, and you can drop a level at any time without
conversion:

1. **Preset** — drag "Trace Border" onto a region. Done. (Instantiated a graph.)
2. **Stack** — the inspector shows it as an ordered behavior list with parameters; reorder,
   retime, toggle. (Apple Motion's idea, kept linear.)
3. **Graph** — "Open as graph" reveals the node editor for branching and custom wiring.

Example graph: `Region border → Noise(seeded) → Trim path → Glow → Repeat → Mask to region → Composite`

| Capability | Design |
| --- | --- |
| Keyframes & curves | Per-channel bezier + hold + linear; graph editor as a timeline drawer; preset curves incl. `easeOutBack`; roving keys |
| Spatial paths | Position keys form a draggable bezier in the layer's space — world paths interpolate on the great circle |
| Parenting & constraints | Transform inheritance within a space; cross-space attachment resolves *after* projection |
| Masks & mattes | Path masks, alpha/luma mattes, and **region masks by entity reference** |
| Blend modes, groups, components | GPU blend passes; groups inherit transform/opacity; Figma-style components with typed overridable props |
| Expressions | A deterministic side-effect-free DSL (no user JS) with static dependency extraction |
| Bake anywhere | Any preset/stack/graph bakes to raw keyframes — one-way, labelled, undoable |

### Decision 03: graphs are the substrate, never the front door

Node-graph-*first* authoring is rejected (the Fusion problem). The graph exists *underneath* as
the common representation of presets and stacks, exposed only on request. One implementation,
progressive disclosure, no ceiling.

**Evaluation order (normative):** base track → expression wrap → behavior/graph stack →
constraints → parent transform inheritance → camera/view transform → pass emission.

---

## §07 Map system

A map is a **context node**, not a background: it defines projection, basemap, terrain;
world-space descendants project through it.

| Element | Design |
| --- | --- |
| Boundaries | Entity-referenced (§05): countries, states, districts, cities in multiple depictions and historical snapshots; PMTiles at scale |
| Region layers | Bind fills/strokes/opacity to entity facts through validated scales (lightness-monotonic, CVD-checked). Legends bind to the same scale object, so they cannot disagree with the map |
| Animated borders & fills | Stroke-draw on true topology (shared edges trace once); fills sweep from centroid, flood from a border, or stagger by rank |
| Points, routes, flows | Geodesic/arc routes with travelling markers and camera-follow; flow maps as OD arc bundles with animated particles |
| Labels | An engine, not hand placement: deterministic collision solver, leader lines for small regions, persistent per-label overrides. Names come from entities |
| Heatmaps / hexbins | GPU aggregation over point datasets |
| Terrain & imagery | DEM terrain with animatable exaggeration; satellite/hybrid basemaps |
| Projection changes | Vector layers morph between projections; raster basemaps crossfade through the morph (honest limitation, staged with craft) |

### Decision 04: MapLibre renders the ground; GeoMotion renders everything that moves

MapLibre keeps tiles, terrain, and projection math. Data layers, regions, labels, and all
animation move into our compositor — v1 spent real effort fighting `setPaintProperty` caches and
feature-state for per-frame animation, and that model caps out. Forking MapLibre and building
tiles from scratch were both rejected.

---

## §08 Geometry editor

The feature no motion tool ships: creators should not need QGIS to fix a border. GeoMotion
becomes **QGIS-lite** — the 20% of GIS editing this audience uses, native, non-destructive, and
animatable the moment the edit lands.

Organising principle: **topology first.** Region geometry is a planar arrangement — shared edges
exist once, referenced by the regions either side. Move the Bengal–Jharkhand border and both
regions update; no slivers, ever.

| Tool | Design |
| --- | --- |
| Pen `P` | Bezier drawing in world space; closes into topology-aware polygons |
| Vertex editing | Drag vertices/edges with snapping to vertices, edges, graticule, other layers |
| Boolean ops | Union (merge districts), subtract, intersect, split-by-drawn-line |
| Simplify & smooth | Topology-preserving simplification with a live vertex-count/fidelity slider |
| Offset / buffer | Inset & outset paths — coastline glows, territorial-waters bands |
| Disputed borders | Edge *classification*, not a hack: `disputed(claimants…)` renders per the project's boundary policy |
| Non-destructive | Every edit session produces a new geometry **version** on the entity; official depictions are never mutated |

---

## §09 Camera rigs

A camera is a node with tracks: `center`, `zoom`, `bearing`, `pitch`, `roll`. Cameras are
observers — siblings of content, never parents of it.

A **rig** is an ordered camera-specialised behavior stack, evaluated like any §06 stack:

```
Camera base (tracks)
  → Follow path (bezier on the map)
  → Look at (target: entity ref)
  → Orbit (radius, period)
  → Zoom envelope (pull-back mid-move)
  → Shake (seeded handheld)
  → DOF (stylised tilt-shift)
  → Rendered view
```

- **Look-at targets are entity references**, resolved through the entity's current geometry
  version — a camera survives a geometry edit.
- **The framing solver** is the *only* way any code — human command, AI copilot, or the
  double-click gesture — turns "frame this entity" into camera values. One solver, identical
  framing everywhere. (Ported from v1: padding, pitch compensation, small-region max-zoom clamp.)
- **Roll and DOF are compositor effects** (MapLibre supplies neither) — documented
  stylisations implemented in renderer post passes, never faked inside the evaluator.
- The editor's free-look camera is viewport state; `camera.captureView` commits it.

---

## §10 Scenes, storytelling & timeline

A project is a **sequence of scenes**; a scene is a composition that is also a reusable unit.
Two views of one structure:

- **Storyboard view** — scenes as slide thumbnails: reorder by drag, duplicate, borrow from
  another project, read the narration under each card.
- **Timeline view** — the full editor underneath: tracks, clips, keyframe rows, curves.

Inside scenes live **story blocks**: a time range owning a narration line (text + measured
audio) and links to the nodes it choreographs. Dragging a block ripples its children and
re-anchors what follows; re-recording a line re-measures and ripples. The frozen-bed bug is
structurally impossible, in both directions.

| Feature | Design |
| --- | --- |
| Tracks | Lanes for graphics, cameras, audio, and the story track. Lanes are *views* — a node owns its timing |
| Edit grammar | Ripple, roll, slip; range select; snapping to playhead, edges, block bounds, audio transients; markers; folders |
| Audio | Clips with cached peaks, per-clip gain/fades, ducking as an audio behavior, −14 LUFS target |
| Nesting | Scenes nest as clips with exposed parameters — a parameterised scene *is* a template |
| Keyframe lane | Layers expand to per-property rows inline; the curve editor is a drawer |
| Transitions | Transition nodes spanning clips: crossfade, wipe, and the camera-bridge |

---

## §11 Assets & the animation library

One browser — searchable, draggable, provenance-aware — over local, organisation, and community
scopes: boundaries & maps · datasets · icons · flags · photos · charts · components · camera
rigs · animations · templates/scenes · fonts · voices · music.

Every asset carries licence and source fields (consumed by the credits generator, §05).

The **animation library** is the shelf that sells the product — genre moves as drag-drop
presets, each opening into a stack, each a graph underneath: Trace Border · Country Reveal ·
Zoom Highlight · Battle Arrow · Radar Sweep · Satellite Scan · Pulse · Flash · Heat Ripple ·
Election Swing · Migration Flow · Count-Up · Ken Burns · Typewriter.

---

## §12 AI copilot

**AI writes patches, never pixels.** Every copilot emits a `DocumentPatch` — the same typed
transaction a human edit produces — shown as a reviewable proposal, then accepted, edited, or
rejected. Accepted output is indistinguishable from hand work because it *is* ordinary document
content. Models write entity **references**; the fact engine fills values.

| Copilot | Proposes | Stays deterministic |
| --- | --- | --- |
| Narration writer | Lines per story block, any language | Region lists, ordering, every number |
| Camera choreographer | Rig stacks and keyframes | Framing solver output |
| Highlight scout | Outliers, reversals, movers as draft scenes | The statistics themselves |
| Label & palette | Emphasis, styles, ramp moods | Collision solver; monotonicity + CVD gates |
| Fact scout | Wikidata/portal facts, drafted joins | The join + diagnostics; user approves |
| Timing fitter | Pad/gap adjustments; dead-air flags | Measured audio durations |
| Chart & thumbnail | Chart specs; thumbnail comps as editable stills | Data pipeline; honesty defaults |

### Decision 05: copilots ride the plugin API

AI features consume the same typed, sandboxed document API as plugins and the automation
console. One capability model, one security review — and the community can ship copilots we did
not imagine. Keys stay server-side.

---

## §13 UX & panels

One window, one document, three workspaces (no modal Studio owning state the editor cannot see
— the v1 sin, corrected structurally):

- **Story** — storyboard, script and narration per scene, data and fact tables, AI proposals
  inline. Dataset-first onboarding: pick data → working draft in 60 seconds → all of it editable.
- **Design** — canvas centre; left rail Layers/Assets/Data; right inspector with source pips;
  `V` objects vs `H` world; geometry tools as a canvas mode, not an app.
- **Deliver** — formats, render queue, publish targets, reframe review for 16:9 → 9:16 with
  per-layer safe-area pinning.

The timeline docks under all three. `⌘K` reaches everything.

---

## §14 Rendering engine

```
document ──transact──▶ patches ──▶ dirty analysis
document + t ──evaluate (pure)──▶ RenderScene (plain data)
RenderScene ──renderer──▶ pass list ──▶ GPU ──▶ canvas / encoder
```

`RenderScene` is structured-clone-safe: plain objects, typed arrays, no functions, no document
references. That is what lets the same evaluation run on the main thread (preview) or in a worker
(export, background render) with identical results, and what keeps the renderer document-blind.

| Concern | Design |
| --- | --- |
| Preview | Dirty-flag evaluation; static subtrees cached to GPU textures; proxy (half-res) toggle. 60 fps at 1080p, 30 fps at 4K |
| Export | Deterministic clock; assets awaited per frame; WebCodecs encodes in-page (10–20× v1's headless screenshots); muxing in a worker; audio re-rendered from clips via `OfflineAudioContext` |
| Background & queue | Second evaluator in a worker with `OffscreenCanvas`; per-job format/range/quality |
| Incremental | Frame hashes over evaluated scenes: unchanged frames reuse encoded chunks on re-export |
| Resolution | 4K native; 8K by tiled render (2×2 stitch); HDR experimental until WebCodecs settles |
| Alpha & formats | Transparent WebM + PNG sequences; ProRes 4444 via the server farm; GIF and stills trivially; SVG/Lottie for validated pure-vector comps only |
| Picking | ID-buffer GPU pass for shapes, CPU bounds for text/handles. Hit-testing reads the last `RenderScene`, never the document |
| Z-order | Depth-first document order within each space; world under screen; effects groups over their siblings' subtree |

### Decision 06: WebGL2 now, WebGPU behind an abstraction

The compositor targets a thin RHI. WebGL2 ships (universal today); WebGPU lands as a backend for
compute label layout and particles once Safari support is boring. No feature may be WebGPU-only
until then.

---

## §15 Plugin SDK & marketplace

A plugin is a sandboxed **Worker** with a typed capability API. No DOM, no ambient network;
network only to manifest-declared origins granted at install.

- **Manifest:** `{ id, version, apiVersion, permissions, contributes: { nodeTypes, behaviors, commands, panels, connectors, importers } }`
- **Lifecycle:** `activate(host)` → registrations → `deactivate()`. Idempotent; the host may
  restart workers at will.
- **Document access:** read via immutable snapshots; write via *proposed transactions* only,
  applied by the host through the same `transact()` door, attributed and undoable.
- **Custom rendering:** plugins never touch the GPU. A plugin node type emits standard
  `RenderScene` primitives; the core renderer draws them. This keeps plugins portable across
  renderer backends and safe.
- **Versioning:** `apiVersion` is semver; the host supports current major and `N-1`.

**Domain packs** are the point — whole genres without touching core: earthquakes, flight radar,
weather systems, historical borders, ship tracking, trade flows, population pyramids, ORBAT,
wildfire perimeters. The marketplace sells packages (assets + components + presets + connectors +
copilots); everything you buy opens into the stack view — no purchased black boxes.

---

## §16 Collaboration & cloud

A first-class pillar, not a stretch goal. The flat store + patch model makes each step
incremental:

- **Multiplayer** — per-property CRDT merge, presence cursors, follow-mode
- **Comments** — anchored to a node *and* a time range ("this label, at 0:42")
- **Version history** — every change patch-logged; visual diffs render two frames side by side
- **Approval workflow** — draft → review → approved; approved scenes lock
- **Render cloud** — the same deterministic engine on servers for 8K/ProRes/batch
- **Live program-out** — a headless viewer URL captured by OBS/vMix, driven from the editor
- **Living embeds** — published scenes re-render when their bound data updates

---

## §17 Competitive analysis

| Competitor | Copy | Avoid |
| --- | --- | --- |
| GeoLayers 3 | Map-object mental model; buffered basemaps | Host-app dependency; pricing stack |
| After Effects | Curve editor; `U`; pick-whip (as drag-to-bind) | Modal sprawl; asset chaos |
| DaVinci Resolve | Edit grammar; proxies; deliver queue | Node-graph-first authoring; page-modal workspaces |
| Blender | Modifier stack; graph-as-substrate | Its UI as a model for anything here |
| Cavalry | Generators/behaviors split | Gating core features by tier |
| Apple Motion | The behavior concept wholesale | Template-browser identity |
| Flourish | The onboarding gradient | The ceiling |
| QGIS | Topology-aware editing, scoped to 20% | Trying to be a full GIS |

**The synthesis:** Flourish's first minute, Motion's behaviors, AE's curves, Resolve's timeline,
Blender's graph-as-substrate, GeoLayers' subject depth — unified by the three things nobody has
together: smart objects, a geometry editor inside a motion tool, and a voice track that drives
the clock.

---

## §18 Roadmap

Sizes assume 2–3 senior engineers. S < 2 person-weeks · M = 2–6 pw · L = 6–12 pw · XL =
quarter-scale.

### Phase 1 — Professional map editor (~5–7 months)

| Feature | Size |
| --- | --- |
| Flat document store, scenes, transactions, undo, versioned format + v1 importer | L |
| Smart-object core: entity registry, fact tables, provenance, one-join diagnostics, bindings | L |
| Property tracks + single resolution pipeline (static / keys / bound) | L |
| GPU compositor v1 (WebGL2) over MapLibre | L |
| Map layers at v1 parity, decomposed: regions, routes, labels, legend component | L |
| Timeline + storyboard v1: lanes, clips, keyframe rows, story blocks, audio clips | L |
| Camera node + framing solver + double-click-to-fly | M |
| WebCodecs export + OfflineAudio mix + render queue + asset browser v1 | M |

### Phase 2 — Motion graphics & geometry (+5–7 months)

Curve editor, spatial paths, roving keys; parenting, constraints, groups, nested scenes (L) ·
behavior stacks + procedural graph substrate + graph editor (L) · animation library v1 +
components with overrides (M) · **geometry editor** (XL, staged: vertex + simplify first) ·
masks incl. region masks, blend modes, adjustment layers (L) · camera rig stacks + expression
DSL (M) · projection morph, flow maps, fill behaviors, background render + incremental
re-export (L)

### Phase 3 — AI-assisted editor (+3–4 months)

Patch-proposal framework (M) · narration writer + timing fitter + voice pipeline (M) · camera
choreographer, highlight scout, label & palette advisors (M) · fact scout with provenance (M)

### Phase 4 — Professional studio (+6–9 months)

CRDT multiplayer + presence + comments (XL) · cloud projects, version history with visual
diffs, approvals (L) · plugin SDK + registry + marketplace (L) · live data sources, program-out,
living embeds (L) · server render farm (M)
