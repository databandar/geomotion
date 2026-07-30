# GeoMotion Engineering Guide

**The constitution of this codebase.** Every contributor — human or AI coding agent — follows this document. It converts the architecture in [`docs/geomotion-v2-design.html`](docs/geomotion-v2-design.html) (the design doc, cited below as §NN) into binding engineering rules. When this guide and your instinct disagree, this guide wins. When this guide is silent, extend the nearest existing pattern; do not invent a new one.

The key words **MUST**, **MUST NOT**, **SHOULD**, and **NEVER** are used as in RFC 2119.

> **Repository status — read this first.**
> The code under `apps/studio/` and `apps/pipeline/` is **GeoMotion v1**: the shipped prototype that the design doc learned from. It now sits inside the §2 workspace and is being **converted in place** — the editor keeps its address at `apps/studio` while the engine is lifted out beneath it into `packages/`, rather than a parallel v2 app being grown alongside. That choice is deliberate: it keeps one shippable editor at all times and makes every step reviewable.
>
> Do not extend v1 except for critical fixes; do port v1 algorithms (framing solver, great-circle math, border dissolve, scale validator, voice engines) into their packages, with tests, when a feature needs them. A package's §2 contract row is fixed before code moves into it. The v1 project importer (§3.7) is the compatibility contract.

---

## 1. Core engineering principles

These ten principles are the reason the architecture looks the way it does. Every one traces to a shipped v1 bug or win.

1. **Everything is editable.** No feature may produce output the user cannot open and change with ordinary tools. A preset instantiates an inspectable behavior stack; an AI action produces reviewable document edits; an import produces normal nodes. "Generated then frozen" is a design rejection, not a trade-off. *(v1: the Studio originally compiled beats away; users lost their edits on re-render.)*

2. **One source of truth.** A value lives in exactly one place; everything else derives from it. Region names come from entities, never typed twice. A legend binds to the same scale object as its map. If two features could disagree about a fact, the model is wrong — fix the model. *(v1: labels, callouts, and narration each carried their own copy of names/values.)*

3. **Transactions over mutations.** The document changes only through `transact()`, which produces a patch set. UI, AI, plugins, and importers all go through the same door. Direct mutation of document objects is forbidden everywhere, enforced by frozen dev builds. *(Why: undo, collaboration, audit, and AI review are all patch consumers; one mutation path makes them all correct by construction.)*

4. **Undo every action.** If it changes the document, it is undoable — including AI patches, plugin edits, and geometry operations. Coalescing (slider drags) is a labeled transaction feature, not an exemption. Actions that cannot be undone (file deletion on disk) require a confirm and are rare.

5. **Deterministic rendering.** `evaluate(document, t)` is a pure function. No `Date.now()`, no unseeded random, no reading ambient state, no I/O inside evaluation. The only clock is the `t` argument. *(v1: a stray MapLibre `move` event re-rendered export frames with the wrong playhead — a whole render was silently wrong.)*

6. **The renderer never sees the document.** The evaluator produces a plain-data `RenderScene`; the renderer consumes only that. The renderer owns GPU state and nothing else; it never mutates the document, never imports from `@geomotion/document`, and never touches React.

7. **AI never owns the document.** Copilots propose patches through the same transaction API as humans and plugins; a human accepts, edits, or rejects. AI writes entity *references*, never literal facts — the fact engine fills values. *(v1: the model typed numbers into narration and once read `{previous}` aloud.)*

8. **Everything is serializable.** Any state worth keeping round-trips through the versioned document format. If a feature's state cannot be serialized, it belongs in editor/transient state (§4) — decide which before writing code, not after.

9. **Performance by design.** Budgets (§10) are requirements reviewed like correctness. A feature that cannot meet its budget at target scale (1,000 nodes, 36–700 regions) redesigns before it lands. Hot paths allocate nothing per frame.

10. **Composition over inheritance.** Nodes compose small typed parts (tracks, behaviors, constraints); there are no class hierarchies of layer types. New capability = new node type or new behavior — never a subclass, never a boolean flag forking an existing type's meaning. *(v1: the 40-field regions monolith is the cautionary tale.)*

---

## 2. Repository structure

pnpm workspace + Turborepo. TypeScript strict everywhere (`strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`). ESM only. Named exports only. No TypeScript `enum` (use union types / `as const` objects). Files kebab-case; types PascalCase; no `I` prefixes.

```
apps/
  studio/           # the editor application (React 19)
  server/           # dev/cloud middleware: LLM proxy, voice, render farm API
  render-cli/       # headless renderer (farm worker; CI golden frames)
packages/
  core/             # primitives shared by everything
  document/         # the document model: store, schema, transactions, migrations
  entities/         # smart objects: registry, facts, provenance, joins
  geometry/         # geo math, topology store, booleans, simplify, projections
  animation/        # tracks, keyframes, easing, expressions, behavior graph runtime
  evaluator/        # evaluate(document, t) -> RenderScene
  renderer/         # RHI + compositor: WebGL2 (WebGPU later), text atlas, picking
  map/              # map contexts, MapLibre integration, tiles, terrain
  audio/            # audio graph, offline mix, waveform peaks
  export/           # WebCodecs encode, muxers, render queue
  ui/               # design-system React components (panels, inputs, scrubbers)
  commands/         # command registry: every user action, palette, shortcuts
  plugin-sdk/       # public plugin API types + host sandbox runtime
  ai/               # copilot patch-proposal framework (client side)
  testing/          # shared test utils: doc builders, golden-frame harness
examples/           # example projects + example plugins (compiled in CI)
docs/               # design doc, ADRs, this guide's appendices
tools/              # codegen, release scripts, benchmarks
```

### Package contract table

For each package: purpose → public API → may depend on → **must never depend on**.

| Package | Purpose / responsibilities | Public API (illustrative) | Depends on | Forbidden deps |
|---|---|---|---|---|
| `core` | IDs, `Result<T,E>`, seconds/units, vec/color/bezier math, seeded noise, event emitter | `createId`, `Result`, `Vec2`, `parseColor`, `noise(seed,…)` | — (zero deps) | everything |
| `document` | Node store (flat map + parentId + fractional order), schema registry, `transact`, patches, undo, serialization, migrations | `createDocument`, `transact`, `applyPatches`, `registerNodeType`, `migrate` | `core` | React, renderer, DOM |
| `entities` | Entity registry, geometry versions, fact tables + provenance, the one join, computed facts | `resolveFact`, `joinDataset`, `entityRef` | `core`, `document` | renderer, React |
| `geometry` | Planar topology store, shared edges, booleans, simplify, buffer, projections, great-circle | `topologyFrom`, `union`, `simplify`, `slerp`, `projectionMorph` | `core` | document, React |
| `animation` | Track evaluation (static/keyframed/bound/expr), easing, behavior graph runtime, expression DSL | `evalTrack`, `evalGraph`, `compileExpression` | `core`, `document` (types only), `entities` (fact resolution) | renderer, React, DOM |
| `evaluator` | Pure scene evaluation; produces `RenderScene` (structured-clone-safe plain data) | `evaluate(doc, t, opts): RenderScene` | `core`, `document`, `entities`, `animation`, `geometry`, `map` (types) | renderer, React, DOM APIs |
| `renderer` | RHI, passes, blend/mask compositing, text atlas, GPU picking, resource pools | `createRenderer(canvas)`, `render(scene)`, `pick(x,y)` | `core` **only** | document, entities, React |
| `map` | Map context runtime, MapLibre lifecycle, tile/terrain sources, basemap registry | `createMapContext`, `basemaps` | `core`, `geometry` | document mutation, React |
| `audio` | Clip graph, live + `OfflineAudioContext` render, peaks cache | `mixdown(clips, dur)`, `peaksFor(asset)` | `core` | renderer, React |
| `export` | Deterministic frame stepping, WebCodecs, mux workers, queue | `exportComposition(job)` | `core`, `evaluator`, `renderer`, `audio` | React |
| `ui` | Reusable widgets, tokens, drag/scrub/snap hooks, schema-driven inspector rows | `<Inspector>`, `<Scrubber>`, `useDrag` | `core`, React | document (goes through commands), renderer |
| `commands` | Command registry (id, title, shortcut, run), keymap, palette source | `registerCommand`, `runCommand` | `core`, `document` | React (UI binds separately) |
| `plugin-sdk` | Stable typed plugin surface + worker host | `definePlugin`, host runtime | `core`, `document` (patch types) | renderer internals |
| `ai` | Patch-proposal lifecycle, prompt assembly client, validators | `propose`, `PatchProposal` | `core`, `document`, `entities`, `commands` | direct network with keys (server does that) |
| `testing` | doc builders, golden-frame harness, determinism asserts | `docWith(…)`, `expectGolden` | anything (dev-only) | shipped code may not import it |

**Dependency law:** arrows point downward only: `apps → (ui, commands, ai, export, …) → evaluator → (animation, entities, map, geometry) → document → core`. `renderer` is a leaf reachable only from `evaluator`'s consumers (apps, export) — never the other way. Enforced by `eslint-plugin-boundaries` in CI; a violated boundary fails the build, no exceptions.

**Ownership:** each package header comment names its governing design-doc section (e.g. `renderer` → §14). The design doc section is the owner of record; changes that contradict it require an ADR in `docs/adr/` first.

---

## 3. Document model rules

### 3.1 Hierarchy and storage

Logical hierarchy (§04): `Project → Scene → (Cameras | MapContext → map layers | UI group | Audio group | Effects group)`. Physical storage: **flat** `Map<NodeId, Node>` with `parentId` and a fractional-index `order` string. Never store children arrays; child lists are derived (and cached) from the flat map. Reparenting = one patch to `parentId` + `order`.

### 3.2 Nodes

```ts
type Node = {
  id: NodeId;              // "nd_" + ULID — sortable, collision-free
  type: string;            // registered node type name, camelCase: 'regionLayer'
  name: string;
  parentId: NodeId | null; // null only for Scene roots
  order: string;           // fractional index among siblings
  space: 'world' | 'screen';
  props: Record<string, Track>;   // EVERY editable property is a Track (§04)
  locked?: boolean;
  hidden?: boolean;
};
```

- **IDs**: prefixed ULIDs — `nd_` nodes, `sc_` scenes, `as_` assets, `pr_` proposals. Entities are the exception: **semantic stable IDs** (`geo:in-wb`) because they must survive across projects and registries. Never derive meaning from a ULID; never rename an entity ID.
- **References** between nodes/entities/assets are typed wrappers (`{ kind: 'entity', id }`), never bare strings, so refactors and integrity checks can find them. Dangling references are a validation error at load, a warning badge in the editor — never a crash, never silently dropped.
- **Ownership**: a node is owned by its parent chain up to a Scene. Deleting a node deletes its subtree in the same transaction. Cross-references (a label referencing an entity) are non-owning.

### 3.3 Tracks

Every property is one of four `Track` kinds — `static`, `keyframed`, `bound`, `expr` (§04). Adding a fifth kind is an ADR-level change. Features MUST NOT invent parallel animation mechanisms (no `animatedX: boolean` flags, no bespoke tween fields — the v1 anti-pattern).

### 3.4 Schema

Each node type registers: a **zod schema** for its props (used at load/import/plugin boundaries only — hot paths use the inferred plain types), **property metadata** (label, unit, min/max/step, inspector row kind), and **defaults**. One module per node type in the owning package. The schema-driven inspector (§11) reads this metadata; a property without metadata does not appear in the UI — that is intentional pressure to document properties.

### 3.5 Serialization

- Format: JSON envelope `{ format: number, project, scenes, nodes, entities, bindings, assets }`.
- Assets are content-addressed references (`as_…` → hash), blobs in OPFS / archive sidecar. **Binary data never inlines into the document** (v1 shipped 1.7 MB projects full of base64 — banned).
- Document values are JSON-safe primitives. Colors are 8-digit hex strings; times are **seconds (float64)**; world coords `[lng, lat]` degrees; screen coords in **stage units** (1 su = 1 px at 1080p reference height — v1's resolution-independence rule, kept).

### 3.6 Schema evolution

1. `format` is a single monotonically increasing integer for the whole document.
2. Migrations are pure functions `migrateNtoN+1(doc): doc`, chained at load, in `document/migrations/`.
3. **Additive first**: new optional field with default → no bump needed if absent-means-default. Renames, splits, semantic changes → bump + migration.
4. **Never repurpose a field.** Deprecated fields keep their name until a migration removes them.
5. Every format version keeps a frozen fixture document in `packages/document/fixtures/` forever; the migration test suite loads all of them to current (§12).

### 3.7 The v1 importer

`document/migrations/import-v1.ts` maps v1 `.geomotion.json` (nested tree, monolith regions layer, embedded data URLs) into v2 (flat nodes, decomposed layers, extracted assets, entities joined from the values table). It is a supported public entry point with its own fixtures. Breaking it is a release blocker.

### 3.8 Extending the model — the decision tree

When a feature needs new document state, in order:

1. **A property on an existing node type?** Only if every instance of that type meaningfully has it. Never add mode flags that fork a type's meaning.
2. **A new behavior/graph node?** For anything animatable-procedural. Preferred for visual effects.
3. **A new node type?** For a genuinely new kind of scene object. Must ship the full §5 checklist.
4. **A new top-level document section?** ADR required. (Entities and assets are the only current examples.)

Derived data (ranks, waveform peaks, tessellations) **never** enters the document — it lives in caches keyed by content hash (§4).

---

## 4. State management

Five stores. Every piece of state belongs to exactly one; deciding which is part of feature design, and reviews check it.

| Store | Lives in | Persisted? | Undoable? | Synced (future CRDT)? | Examples |
|---|---|---|---|---|---|
| **Document** | `@geomotion/document` custom store | yes | yes | yes | nodes, tracks, entities, facts, scene order, bindings, asset refs |
| **Editor** | zustand slices in `apps/studio` | partially (prefs) | no | presence only | selection, active tool, active scene, open panels, snapping toggles, proposal being reviewed |
| **Viewport** | zustand slice in `apps/studio` | no | no | follow-mode only | free-look preview camera, zoom of the timeline ruler, canvas proxy-quality toggle |
| **UI (component)** | React component state | no | no | no | popover open, input draft text before commit, hover |
| **Transient / derived** | caches in owning packages | no (rebuildable) | no | no | evaluation memos, waveform peaks, tessellated geometry, GPU texture pools, tile cache |

Rules of thumb (apply in order): *Would two collaborators need to see it? → document. Would losing it lose user work? → document. Is it about how **you** are looking at the document? → editor/viewport. Can it be recomputed from the document + assets? → transient, keyed by content hash, with an eviction budget.*

Two boundary cases decided now:

- **Scene cameras are document state** (they render in the export). The **free-look camera** you use while browsing the map is viewport state; "Capture view" (a command) writes it into a scene camera via a transaction — the v1 pattern, kept.
- **Playhead** is editor state (not undoable, not exported). Export never reads it — the export clock steps frames itself (§1.5).

Renderer state (GL programs, textures, framebuffers) is invisible outside `renderer`. Nothing else may hold a GPU handle.

---

## 5. Feature development workflow

Every feature follows this checklist, in this order. PRs state explicitly which steps were N/A and why.

1. **Feature doc** — fill the template (§16) in `docs/features/<name>.md`. For anything touching the document model or public APIs, get it reviewed before coding.
2. **Schema** — node types / properties with zod schema + property metadata + defaults; bump `format` + migration if not purely additive; add a fixture if bumped.
3. **Types & validation** — inferred types exported from the owning package; boundary validation wired (load, import, plugin input).
4. **Transactions** — all mutations as functions that run inside `transact()`, colocated with the schema. Choose coalescing keys for continuous gestures now, not later.
5. **Commands** — register user-facing actions in `commands` (id, title, default shortcut, palette visibility). UI buttons invoke commands; commands invoke transactions. Nothing else calls transactions from UI code.
6. **Evaluation** — extend `evaluator` (and `animation` behaviors if procedural). Pure; deterministic; unit-tested against fixed `(doc, t)` pairs.
7. **Rendering** — new primitives → renderer pass work; otherwise emit existing `RenderScene` primitives. Renderer additions come with a golden-frame test.
8. **Inspector** — property metadata gives you default rows for free; write a custom editor only when the default genuinely cannot work, in `ui`.
9. **Timeline** — how does it appear as bars/keyframe rows/story blocks? Ripple behavior defined and tested.
10. **Serialization round-trip test** — build → save → load → deep-equal. Mandatory for every new node type.
11. **Undo test** — apply the feature's transactions, undo, assert deep-equal with before. Mandatory.
12. **Performance** — run the relevant bench at target scale; add one if none covers the new path. Budgets in §10.
13. **Accessibility & shortcuts** — keyboard path exists; focus visible; reduced-motion respected for editor chrome.
14. **Docs** — update the feature doc to as-built; add to the user-facing changelog; note any new patterns in this guide's appendix rather than inventing silent conventions.

---

## 6. Rendering architecture

### 6.1 Data flow

```
document ──transact──▶ patches ──▶ dirty analysis
document + t ──evaluate (pure)──▶ RenderScene (plain data)
RenderScene ──renderer──▶ pass list ──▶ GPU ──▶ canvas / encoder
```

`RenderScene` is structured-clone-safe: plain objects, typed arrays, no functions, no document references. This is what lets the same evaluation run on the main thread (preview) or in a worker (export, background render) with identical results — and what keeps the renderer document-blind (§1.6).

### 6.2 Frame loop & invalidation

- **No free-running RAF.** The loop sleeps until invalidated by: a document patch, playhead movement, viewport change, or an async resource arrival (tile, image, font). One RAF per invalidation burst (v1's schedule pattern, formalized).
- Dirty analysis maps patch paths → affected nodes → affected passes. Full re-evaluation is the fallback, never the habit; the evaluator memoizes per-node results keyed by `(node content hash, t-relevant inputs)`.
- Static subtrees (no time-varying tracks in range) render once to cached textures and composite until invalidated.

### 6.3 GPU resources & asset loading

- All GPU objects come from renderer-owned pools, keyed by content hash; eviction by LRU byte budget (§10). Callers hold opaque handles, never raw GL objects.
- Assets load lazily and async; evaluation returns placeholder primitives with a `pending` flag rather than blocking. **Export awaits readiness explicitly per frame** — frames never ship half-loaded (v1's tile-await guarantee, generalized to all assets, including decoded images — a v1 bug where frames could miss late-decoding images).

### 6.4 Evaluation order (normative)

For each node, per frame: **base track → expression wrap → behavior/graph stack → constraints (cross-space attach, look-at) → parent transform inheritance → camera/view transform → pass emission.** Camera rigs evaluate before world-space projection; screen-space nodes skip projection. This order is part of the public contract — behaviors observing "the value so far" see exactly the previous stages.

### 6.5 Picking, hit-testing, z-order

- Z-order = depth-first document order (fractional indices) within each space; world space composites under screen space; effects/adjustment groups composite over their siblings' subtree.
- Picking: ID-buffer GPU pass (node id encoded as color) for shapes; CPU bounding tests for text/handles. `renderer.pick(x, y)` returns `NodeId | null`; the editor maps that to selection. Hit-testing never queries the document — only the last `RenderScene`.

### 6.6 Workers

Protocol: `postMessage` of `RenderScene` (transferables for typed arrays). Workers never receive the document. The export worker owns its own evaluator instance fed by serialized document snapshots — never live references.

---

## 7. Animation system

- **Keyframes**: per-channel; interpolation `linear | hold | bezier` with per-key handles; spatial position keys carry path handles in the layer's space (world paths interpolate on the great circle — port v1 `slerp`).
- **Easing**: the named preset set (including `easeOutBack`) is data — presets resolve to bezier handles; no hardcoded easing constants in feature code (v1's `TRACE_TIME` constants are the anti-pattern: all such values are behavior parameters now).
- **Behaviors / procedural graph**: one substrate, three skins (§06). A behavior is a graph fragment with typed ports; a stack is a linear graph; the graph editor exposes the same structure. Behaviors are pure: `(inputs, params, t, seed) → outputs`. Randomness only via `core` seeded noise, seed stored in the document.
- **Expressions**: the deterministic DSL only (§06 Decision 3) — no user JS. Compiled in `animation`, evaluated with static dependency extraction for memoization; a cyclic dependency is a validation error shown in the inspector, never a runtime hang.
- **Nested scenes**: a scene placed as a clip evaluates in its own local time (`t_local = (t - clipStart) * rate`), receives exposed-parameter overrides as if they were `static` tracks, and returns a composited primitive group.
- **Reusable animations**: presets = serialized behavior stacks + parameter values, stored as assets; applying = instantiating nodes/tracks via a transaction (fully editable after — §1.1).
- **Baking**: any stack/graph can bake to keyframes through one shared utility (sampling at scene fps, then simplifying curves). Baking is a labeled, undoable transaction.

**Story blocks & audio timing** (§10 of design doc): a story block owns its time range and narration clip; ripple edits move linked children in the same transaction. Narration length is *measured* from the audio asset — never estimated when the asset exists (v1's frozen-bed lesson: timing always re-derives from clips).

---

## 8. Camera system

- A camera is a node with tracks: `center [lng,lat]`, `zoom`, `bearing`, `pitch`, `roll`. Cameras are observers — siblings of content, never parents of it (§04).
- **Rigs** are ordered camera-specialized behavior stacks: `followPath`, `lookAt(entityRef)`, `orbit`, `zoomEnvelope`, `shake(seed)`, `dofStylized`. Same evaluation rules as §7; each stage toggleable and keyframable; named stacks saved as rig-preset assets.
- **Look-at targets are entity references**, resolved through the entity's *current geometry version* — a camera survives a geometry edit (§05).
- **Framing solver** (`geometry`/`evaluator`): the pure fitBounds function ported from v1 (padding, pitch compensation, small-region max-zoom clamp). It is the *only* way any code — human command, AI copilot, double-click gesture — turns "frame this entity" into camera values. One solver, identical framing everywhere.
- **World vs screen**: the camera defines the world→screen projection each frame; screen-space nodes bypass it; cross-space constraints (a screen callout following a world anchor) resolve *after* projection (§6.4).
- **Roll and DOF are compositor effects** (MapLibre supplies neither) — documented stylizations, implemented in renderer post passes, never faked inside the evaluator.
- The editor free-look camera is viewport state; `camera.captureView` is the command that commits it (§4).

---

## 9. Plugin architecture

Plugins are the extension mechanism for node types, behaviors, data connectors, panels, import/export, and copilots (§15). The AI framework and the automation console consume the same API — one surface, one security review.

- **Runtime**: each plugin runs in a dedicated Worker sandbox. No DOM, no ambient network. Network only to origins declared in the manifest and granted at install.
- **Manifest**: `{ id, version (semver), apiVersion, permissions: [...], contributes: { nodeTypes, behaviors, commands, panels, connectors, importers } }`.
- **Lifecycle**: `activate(host)` → registrations → event subscriptions → `deactivate()`. Idempotent activation; the host may restart workers at will.
- **Document access**: read via immutable snapshots; write via **proposed transactions** only — the host applies them through the same `transact()` door, attributed to the plugin, undoable like anything else. Plugins never hold live document references.
- **Custom rendering**: plugins never touch the GPU. A plugin node type ships an evaluator function (runs in the plugin worker) that emits **standard `RenderScene` primitives** (paths, meshes, sprites, text runs). The core renderer draws them. This single rule keeps plugins portable across renderer backends (WebGL2 → WebGPU) and safe.
- **Inspectors**: property metadata gives plugin nodes the schema-driven inspector for free; custom panels are declarative UI schemas in v1 of the SDK (arbitrary plugin React is deliberately deferred — an ADR gate).
- **Versioning**: `apiVersion` is semver; the host supports the current major and one previous (`N-1`). Breaking SDK changes require a major bump, a migration note, and a deprecation release in between. Types in `plugin-sdk` are the *only* public surface — anything not exported there is internal and may change without notice.

---

## 10. Performance standards

Reference machine: Apple M1 / equivalent, integrated GPU, 16 GB. Target project: 1,000 nodes, one 4K scene, 700-region country, 10-minute narration.

| Budget | Limit | Enforced by |
|---|---|---|
| Interactive frame (1080p preview) | ≤ 16 ms end-to-end | bench + manual profile on review |
| Evaluation, 1k nodes | ≤ 4 ms | `tools/bench` CI, fail > +10 % vs baseline |
| Drag feedback latency | < 16 ms | §02 philosophy; UI review |
| Seek-and-show (proxy) | < 250 ms | bench |
| Export throughput (1080p30) | ≥ 2× realtime on reference machine | export bench |
| Document transaction (typical) | ≤ 1 ms | bench |
| Memory, typical project open | ≤ 500 MB JS heap + ≤ 1 GB GPU | heap snapshot in CI smoke |
| Cold load to interactive | ≤ 3 s | Lighthouse-style CI check |

Rules behind the numbers:

- **Zero allocations in per-frame hot loops** (evaluator inner loops, renderer passes). Reuse scratch typed arrays and object pools; the bench suite runs with allocation sampling and flags regressions. *(Why: GC pauses are the difference between "feels like Figma" and "feels like a webpage".)*
- **Caches must have keys and budgets.** Every cache declares its content-hash key and byte/entry budget with LRU eviction. A cache without an invalidation story is a bug factory (v1's `setPaintProperty` cache bit us exactly this way).
- **Lazy everything at the edges**: tiles, images, fonts, waveforms, boundary files stream on demand; only the document itself loads eagerly.
- **Workers for anything > 4 ms**: geometry booleans, simplification, waveform decode, export — off the main thread, always.

---

## 11. UI development standards

- **Schema-driven inspectors by default.** Property metadata (§3.4) renders standard rows — number scrub, color, select, entity picker, track-source pip — automatically. Custom property editors are exceptions living in `ui`, never inline in feature code. *(Why: 100 features × hand-built panels = drift; one generator = consistency for free.)*
- **Commands, not handlers.** Every user-visible action is a registered command with an id, title, and optional shortcut; toolbars, menus, shortcuts, and the ⌘K palette all bind to commands. UI components never call `transact()` directly.
- **Editing philosophy is law** (§02): style edits in on-canvas popovers, never modal dialogs; dialogs only for destructive/file-system acts; every number scrubs; drags go through the shared `useDrag` (pointer capture, Escape cancels, modifier keys standardized: Shift = coarse, Alt = fine).
- **Snapping** is one central service (playhead, edges, block bounds, vertices, graticule, audio transients) consumed by canvas and timeline alike — features register snap sources, never implement their own snapping.
- **Keyboard**: reserved keys per §02 (`V H P C Space J K L U [ ] ⌘K ⌘D F`). New shortcuts are proposed in the feature doc and registered centrally; collisions fail CI.
- **Accessibility**: every control keyboard-reachable with visible focus; panels are labeled regions; canvas operations have command equivalents; editor chrome respects `prefers-reduced-motion`; contrast per tokens. The scale editor's CVD validation (§07) is a product feature — don't undermine it with inaccessible chrome.
- **React discipline**: function components; state per §4 taxonomy; no document objects in React state (subscribe to the store, select narrowly); renderer canvas is a leaf component with an imperative handle — React never renders per frame.

---

## 12. Testing standards

Framework: Vitest (unit/bench), Playwright (E2E), golden frames via `render-cli` under software GL in CI.

Every feature ships, minimum:

1. **Unit tests** for evaluation logic against fixed `(doc, t)` fixtures built with `testing` builders.
2. **Serialization round-trip**: build → save → load → deep-equal. Every node type, no exceptions.
3. **Migration fixtures**: schema bump ⇒ frozen old-format fixture + assertion it migrates and validates.
4. **Undo/redo**: transaction → undo → deep-equal with before; redo → deep-equal with after. The `testing` package provides a one-line harness; use it.
5. **Determinism**: `evaluate(doc, t)` twice, and across the worker boundary → byte-identical `RenderScene`. Any feature adding evaluator code extends this suite.
6. **Golden frames** for renderer-visible changes: perceptual diff (pixelmatch) against stored PNGs, tolerance 0.5 %, updated only via explicit `--update-golden` with the diff attached to the PR.
7. **Benches** for hot paths, with CI baselines (> +10 % fails).
8. **E2E** for the critical flows only (open, edit, undo, export a 2-second draft) — broad E2E is not a substitute for the layers above.

Tests are the spec for AI agents: when behavior is ambiguous, the fixture corpus is the tiebreaker, and new decisions get encoded as fixtures.

---

## 13. AI coding guidelines

You are probably an AI coding agent. Read this section as binding operating instructions.

**Before writing any code:**

1. Read this guide, then the design-doc section (§NN) governing your area.
2. `grep` for prior art: the type, the pattern, the utility you are about to write almost certainly exists. Extending beats creating; creating a parallel version of an existing mechanism is the single most damaging thing you can do here.
3. Locate the owning package via §2. If your change spans packages against the dependency arrows, your design is wrong — stop and redesign.

**Always:**

- Extend existing systems: new visual capability → behavior or node type via §3.8; new user action → command; new data → entity facts or assets.
- Follow the §5 checklist end-to-end — schema, transactions, commands, evaluation, tests, docs. Half-features do not merge.
- Update types, validators, serialization, and migrations in the same PR as the schema change.
- Keep evaluation pure and seeded; keep budgets (§10); keep boundaries (§2).
- Run `pnpm typecheck && pnpm test` and report the actual output. Never claim untested success.
- When the guide is silent, copy the nearest existing pattern and note the gap in the PR description.

**Never:**

- Never mutate the document outside `transact()` — not in tests, not in "just this once" tooling.
- Never duplicate functionality because finding the original was hard. Search first; ask in the PR if genuinely absent.
- Never introduce hidden state: module-level mutable globals, singletons with setters, caches without keys/budgets. (v1's `mapref.ts` global was pragmatic then; it is banned now.)
- Never let the renderer import the document, React, or the DOM; never let UI hold GPU handles; never render React per frame.
- Never invent public APIs on `plugin-sdk`, `document`, or `core` without an ADR.
- Never add a dependency (npm package) without an ADR — including "small" ones.
- Never use `any`, `@ts-ignore`, unseeded randomness in evaluation, `Date.now()` outside genuinely wall-clock features, or swallowed exceptions (`catch {}` hid a full rendering failure in v1 — every catch either handles, converts to `Result`, or reports via `core`'s `reportError`).
- Never encode facts in AI-generated content — emit entity references and let the fact engine fill them (§1.7).
- Never "fix" a failing golden/determinism test by loosening it. Investigate; the test is the contract.

---

## 14. Code review checklist

A PR merges only when every line below is checked or explicitly N/A-ed with a reason:

- [ ] Feature doc exists / updated (§16); design-doc section cited
- [ ] Package boundaries respected (CI green on boundary lint)
- [ ] All document changes via transactions; coalescing keys chosen for gestures
- [ ] Undo/redo test present and passing
- [ ] Serialization round-trip test; migration + fixture if `format` bumped
- [ ] Evaluation pure & deterministic; determinism suite extended if needed
- [ ] Renderer untouched by document/React types; golden frames for visual changes
- [ ] Commands registered; shortcuts collision-free; palette entries titled for humans
- [ ] Inspector via schema metadata (custom editor justified if present)
- [ ] Benches run; budgets met; no hot-loop allocations introduced
- [ ] Accessibility: keyboard path, focus, labels, reduced motion
- [ ] Errors handled or reported — no empty catches
- [ ] Backwards compatibility: v1 importer + last-format fixtures still pass
- [ ] Docs/changelog updated; no silent new conventions

---

## 15. Anti-patterns

Named so reviews can cite them. Each earned its place.

| Anti-pattern | Why it is banned |
|---|---|
| **Mutable module globals** | Invisible coupling; breaks worker isolation and multiplayer; untestable. v1's `mapref.ts` global map handle is the local cautionary tale. |
| **Singleton abuse** | A singleton is a global with ceremony. Pass capabilities explicitly; construct per-context (main thread vs worker). |
| **UI writing the document directly** | Bypasses commands → breaks palette, shortcuts, AI parity, and audit. UI → command → transaction, always. |
| **Renderer coupled to React or the document** | Kills worker export, WebGPU migration, and testability in one stroke. The `RenderScene` boundary exists precisely here. |
| **Duplicated business logic** | Two framing solvers = two framings = AI and humans disagree on screen. One function, one owner package. |
| **Hardcoded animation constants** | v1's `TRACE_TIME = 0.65` fossilized design into code. Timing/easing are behavior parameters with metadata, tunable in the inspector. |
| **Hidden caches** | A cache without a content-hash key and eviction budget is stale-bug generator. Declare key, budget, and invalidation in the cache's doc comment. |
| **Derived data in the document** | Ranks, peaks, tessellations serialized once become lies later. Derive, cache, never persist. |
| **Name-based data joins** | v1 fought alias tables in every dataset. Joins happen once into entities; everything else uses entity IDs (§1.2). |
| **Boolean mode flags forking a type** | `isTourMode`-style flags recreate the monolith. Compose behaviors or add a node type. |
| **Swallowed errors** | `catch { /* style mid-swap */ }` hid a total sync failure in v1 for days. Handle, convert to `Result`, or report — silence is forbidden. |
| **Estimated timing when measurement exists** | Narration length comes from the decoded asset, never a words-per-second guess, whenever the asset is present. |
| **Binary data inlined in the document** | Bloats every save/undo/sync; assets are content-addressed references. |

---

## 16. Feature template

Copy to `docs/features/<kebab-name>.md`. Delete nothing — write "N/A + reason" instead.

```markdown
# Feature: <name>

**Design-doc section:** §NN · **Owner package(s):** … · **Status:** proposal | accepted | shipped

## Problem
What cannot users do today? One paragraph, user language.

## User story
As a <persona §03>, I want … so that …

## UX
Entry points (canvas / inspector / timeline / palette). One-click, drag, and keyboard
paths per the editing philosophy (§02). Popovers over dialogs. Sketches welcome.

## Document model
New node types / properties / behaviors, per the §3.8 decision tree.
Schema deltas, defaults, property metadata. `format` bump? Migration plan.

## Transactions & commands
Named transactions with coalescing keys. Command ids, titles, default shortcuts.

## Evaluation
What `evaluate(doc, t)` produces; determinism notes; behavior graph shape if procedural.

## Rendering
New primitives or existing ones; pass changes; golden-frame plan.

## Timeline
Bars / keyframe rows / story-block interaction; ripple semantics.

## Inspector
Schema-driven rows expected; any custom editor and its justification.

## Entities & data
Facts read or written; binding paths; join implications; provenance.

## Plugin API
Exposed via SDK? New contribution points? Version impact.

## Performance
Expected cost at target scale (§10); benches to add; caching strategy + keys.

## Tests
Unit / round-trip / undo / determinism / golden / bench — enumerate actual cases.

## Docs
User-facing changelog line; guide appendix updates if a new pattern was needed.

## Future extensions
What this deliberately does not do, and the seam left for it.
```

---

*This guide is versioned with the repository. Changing a MUST/NEVER requires an ADR in `docs/adr/` and a PR that updates every violated call-site or explicitly schedules the debt. Silence is never a convention: if you needed a rule that wasn't here, add it.*
