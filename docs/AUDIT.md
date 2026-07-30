# Repository audit — 2026-07-30

Baseline audit performed before any structural change, per ENGINEERING_GUIDE.md §5 and the
lead-engineer onboarding brief. This is a point-in-time record; it is not maintained.

## 1. Constitution: what actually exists

| Document | Status |
| --- | --- |
| `ENGINEERING_GUIDE.md` | Present (473 lines). Authoritative. |
| `README.md` | Present (262 lines). Accurate user-facing docs for v1. |
| `docs/geomotion-v2-design.html` | Present. **The** architecture source of truth (§00–§18). |
| `VISION.md` | **Was missing** → authored in M1 from the design doc. |
| `ARCHITECTURE.md` | **Was missing** → authored in M1 as a greppable markdown distillation of the design doc, preserving its §NN numbering so `ENGINEERING_GUIDE.md`'s cross-references resolve. |

The design doc was HTML-only. Coding agents cannot usefully grep HTML, and the guide cites
`§NN` throughout, so markdown equivalents were a prerequisite for autonomous work.

## 2. Repository state

- **Not a git repository.** No `.git`, no history. Target remote `databandar/geomotion`
  exists, is public, empty, default branch `main`. First push is therefore a clean initial
  commit — no conflict or history-rewrite risk.
- Build: `tsc --noEmit` clean; `vite build` succeeds.
- **Zero tests.** No test runner, no fixtures, no CI. This is the single largest risk in the
  repository and the reason M3 exists.
- Package manager: npm. The guide specifies pnpm + Turborepo for the v2 monorepo. Not
  converted in this session — see §6 Debt.

## 3. Code inventory (v1, ~12.8k lines)

Paths below are as of M4, which moved the tree into the workspace. Sections 4 and 5
record the state at audit time and keep their original paths.

```
apps/studio/src/lib/          engine: geo math, scene evaluation, overlay renderer, mapsync,
                              regions/framing, palettes, clouds, project/serialisation, export, zip
apps/studio/src/components/   editor UI: MapCanvas, Timeline, Inspector (1138 lines), Toolbar, panels
apps/studio/src/studio/       generator UI: 5-step Studio + client API
apps/studio/src/data/         vendored boundary sets + sample values
apps/pipeline/                node-side: compose, tts, render, encode, nfhs, studio dev-server
packages/                     declared, empty — the landing site for the extraction
```

Architecture as built (v1), mapped to the v2 target:

| Concern | v1 reality | v2 target (design doc §) |
| --- | --- | --- |
| Document model | Nested JSON `Project`, deep-cloned per edit | Flat node store + patches (§04) |
| Layer model | 7 union types; `RegionsLayer` carries ~45 fields | Composed nodes + behaviors (§04, §06) |
| Evaluation | `evaluate(project, t)` — already pure | Same contract, richer scene (§14) |
| Renderer | MapLibre GL layers + a 2D canvas overlay | RHI compositor, `RenderScene` boundary (§14) |
| Transactions | `patch(fn)` mutating a clone; no patch objects | `transact()` producing patch sets (§04) |
| Entities | None — datasets joined by name per layer | Smart objects with stable IDs (§05) |
| Timeline | Layer bars + camera diamonds + narration cues | Tracks, story blocks, ripple (§10) |
| Camera | Keyframes + hardcoded `dip`/follow special-cases | Camera node + rig stacks (§09) |
| Plugins | None | Worker SDK (§15) |
| Tests | None | §12 |

**Genuine strengths to preserve** (all validated by shipped renders):
`evaluate()` is already a pure function of `(project, t)`; preview renders at output
resolution (one render path, no preview/export drift); the framing solver, great-circle
math, topological border dissolve, and the colour-ramp validator are correct and
well-isolated; narration timing is measured from audio, not estimated.

## 4. Dead code — verified unused

Each confirmed by grep across `src/` and `pipeline/`:

| Symbol / file | Where | Evidence |
| --- | --- | --- |
| `isRoute` `isMarker` `isText` `isShape` `isRegions` `isClouds` `isImage` | `src/lib/scene.ts` | Defined, exported, never imported. Written speculatively. |
| `clearImageCache` | `src/lib/images.ts` | Never called. |
| `inkOn` | `src/lib/palettes.ts` | Never called (and its only consumer of `luminance`). |
| `boundsOf` | `src/lib/geo.ts` | Never called. |
| `collectCoords` (+ helper `walk`) | `src/lib/geo.ts` | Never called outside its own module. |
| `speak`, `manualPath` imports | `pipeline/studio-server.mjs` | Imported, never called — residue of the `lineAudio` refactor. |
| `src/data/india-internet-nfhs.json` | — | Unreferenced. Generated artifact from a `tools/nfhs.mjs extract` demo; the pipeline now reads the CSV live via `{nfhs: …}`. |

**Over-exported internals** (used only inside their defining module; exporting them
enlarges the public surface for no consumer): `withAlpha`, `luminance`,
`REFERENCE_HEIGHT`, `PALETTE`, `layerAlpha`, `DEFAULT_CAMERA`, `probeDuration`.

## 5. Untracked artifacts

`pipeline/out/` (1.1 GB of rendered video), `dist/`, `node_modules/`, `.DS_Store` ×3,
`tsconfig.tsbuildinfo`, `pipeline/scripts/_studio-*.json` (generated by Studio runs).
All either already ignored or added to `.gitignore` in M1. **`.env.local` contains a live
OpenRouter key and is ignored** — verified absent from the initial commit.

## 6. Technical debt register

Ordered by risk × cost of delay.

| # | Debt | Impact | Proposed milestone |
| --- | --- | --- | --- |
| D1 | ~~Zero tests~~ | — | **Closed in M3**: 157 tests over the six pure modules |
| D2 | ~~No monorepo / package boundaries~~ | — | **Closed in M5**: workspace in M4, first packages + enforced dependency law in M5 |
| D3 | ~~Document mutations clone the whole project~~ | — | **Closed in M6**: `transact` with structural sharing; history is a patch log |
| D4 | ~~`RegionsLayer` monolith~~ | — | **Closed in M10**: the tour is one nested behaviour; the layer went 46 -> 26 fields |
| D5 | ~~`mapref.ts` module-global map handle~~ | — | **Closed in M7**: an explicit `RenderHost`, provided by whoever owns the canvas |
| D6 | ~~Renderer reads the document through `Scene`~~ | — | **Closed in M8**: scene items carry a declared `style`, and an import ban keeps it that way |
| D7 | ~~npm, not pnpm + Turborepo~~ | — | **Closed in M4** |
| D8 | ~~No CI~~ | — | **Closed in M3**: `.github/workflows/ci.yml` (typecheck, test, build, secret scan) |
| D9 | Export uses headless-Chrome screenshots | Measured 11 fps at 960×540 draft (1292 frames in 1m58s) — better than the ~4 fps first recorded, but that was full resolution. Design doc §14 specifies WebCodecs in-page | M9 |
| D10 | ~~voice bed mixed at compose time~~ | — | **Closed in M11**: cues keep their own audio, and a render re-mixes from their current positions |

### 6.0 Debt found after the initial audit

| # | Debt | Impact | Proposed milestone |
| --- | --- | --- | --- |
| D11 | Both flags on for `packages/*`; **off for `apps/studio`** | 163 errors against v1 app code. `tsconfig.base.json` has them on, so anything new is strict by default and the exemption is written down where someone will look | Its own milestone |
| D12 | `apps/pipeline` tests | Composition and attribution are covered as of M9 (11 tests); narration timing, voice mixing and encode are still unguarded | Remainder with the `apps/server` / `apps/render-cli` split |

### 6.1 Bugs found by the M3 suite

Writing the behavioural spec surfaced one real defect in shipped code, which is the
argument for having written it:

| Where | Defect | Fix |
| --- | --- | --- |
| `src/lib/palettes.ts` | The `inferno` ramp carried a stray `.reverse()`, so selecting it inverted the entire colour scale — high values rendered light, low values dark. Every other ramp reads light→dark. | Ramp authored light→dark like its siblings; `palettes.test.ts` now asserts strict luminance monotonicity across **every** ramp, so a reintroduction fails CI. |

Two further failures on the first run were faults in my own assertions, not the code:
`slerp` endpoints round-trip through trigonometry and land within ~1e-12 rather than
bit-exact, and `headingAt` genuinely varies along a great circle (that is what
distinguishes a geodesic from a rhumb line). Both tests were corrected to assert the
real contract, with comments recording it for the port.

### 6.2 Bugs found by the M4 migration

| Where | Defect | Fix |
| --- | --- | --- |
| `apps/studio/package.json` | **Phantom dependency.** Source used the global `GeoJSON` type namespace, which was never declared — it arrived via npm hoisting `@types/geojson` out of `maplibre-gl`'s dependency tree. A maplibre release that dropped or renamed that dependency would have broken our typecheck for no visible reason. pnpm's non-hoisted layout turned it into 20 immediate errors. | `@types/geojson` declared directly. |
| `apps/pipeline/scripts/*.json` | Both bundled example scripts set `"values": "anemia-sample"`, but the data file is `india-anemia-sample.json` — a name that has never existed in any commit. `pnpm video` on either example died on an ENOENT before rendering a frame. | Preset names corrected; `resolveValues` now reports the unknown name and lists the available presets instead of throwing a raw stack trace. |

Both were found by *running* the pipeline, which the build and the unit suite do not do —
the argument for D12.

### 6.4 Measured: what the whole-project clone actually cost (M6)

Against the bundled India boundary set, inlined on a layer as v1 stores it:

| | per edit | per second of dragging | history after a 500-event drag |
| --- | --- | --- | --- |
| Before (`JSON.parse(JSON.stringify(p))`) | 0.172 ms | 20.6 ms | 500 steps, capped at 80 × 246 KB ≈ 19 MB |
| After (`transact`, coalesced) | 0.010 ms | 1.2 ms | **1 step** of patches |

17.6× per edit, not the ~500× a bare structural copy would give, because generating
the patch pair costs something — that cost buys patch-based undo and is worth it. The
memory figure is the bigger win, and both numbers scale with the geometry a user
loads: a detailed world boundary set turns 20 ms/second of drag into visible latency.

Two things the measurement did not catch, found by driving the real editor in a
headless browser instead:

| Where | Finding |
| --- | --- |
| `transact` | A concise arrow body — `(d) => d.layers.push(layer)`, the most natural way to write a one-line edit — returns the array's new length, and Immer rejects a recipe that both returns a value and mutates the draft. The most idiomatic call would have thrown at runtime. `transact` now ignores non-object returns; mutating *and* returning a document is still an error. |
| `store.ts` history replay | Undoing a project load restored a shorter composition without moving the playhead, leaving it stranded past the end (the editor read `01:38 / 00:15`). Now clamped. |

### 6.12 Strict indexing, and four suppressions that were fine (M12)

Two jobs, both of them "check the thing I have twice said was unchecked".

**The `exhaustive-deps` suppressions.** All four turned out to be legitimate — but
nobody had established that, and an unexplained directive hides the *next* genuinely
missing dependency as effectively as the one it was written for.

- `MapCanvas` × 3: the effects closed over `render`, which is rebuilt every commit.
  Safe, because the whole render chain reads `useStore.getState()` and refs at call
  time rather than capturing values. Rather than document three suppressions, the
  effects now call through the `renderRef` added in M7 — always the current
  closure, so **the warnings are gone rather than silenced**, and the staleness
  question is moot instead of argued.
- `VoiceStep` × 1: `refresh` closes over `vbEngine`, which is already in the
  dependency array, so the closure and the effect regenerate together. Kept, with
  the reason written down.

**The strict flags.** `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`
are on for every package: 40 errors, all fixed, no behaviour change (the geometry
port contract's 25 tests pass untouched and all ten golden frames are identical).
`apps/studio` reported 163 and stays exempt, documented in `tsconfig.base.json`.

Nothing in the packages was a latent crash — every flagged index was provably in
range — but two fixes are real improvements rather than appeasement:

| Where | What changed |
| --- | --- |
| `geometry` path accessors | `upperBound` returned an index whose validity only a comment guaranteed, and three callers indexed `coords`/`cum` on that trust. Replaced by `segmentAt`, which returns the endpoints and their distances or null. The invariant is now a type, checked once, instead of a convention repeated in three places. |
| `document` `History.key` | Declared `key?: string` while the code deliberately assigns `undefined` to break coalescing after an undo. Under `exactOptionalPropertyTypes` "may be absent" and "may be undefined" are different claims; it is now `string \| undefined`, which is the true one. |

The rest were array destructuring that wanted tuple types, and test assertions where
a missing element is itself the failure.

### 6.11 Un-freezing the narration (M11)

The mix was always position-driven — each line is delayed to its cue and summed. The
only thing missing was keeping the positions, and each line's audio, in the document.
So the fix is small: `AudioCue` gains a `file`, and `planAudio` decides between
re-mixing from the cues and falling back to the bed.

Three separate bugs turned out to be hiding behind the one register entry:

| # | Bug |
| --- | --- |
| 1 | **The bed could not be retimed.** As recorded: mixed once at compose time, per-line audio discarded, so any later edit moved the picture and left the voice behind for good. |
| 2 | **The CLI's exported project had no narration at all.** The project JSON was written *before* the voice track was built, so the file the tool invites you to "open in the editor to tweak by hand" carried no audio — the editor played nothing and re-rendering it came out silent. Worse than a desync, and nobody had noticed. |
| 3 | **`migrate` deleted narration that had no playback URL.** It required `audio.url`, which the CLI cannot produce (no server to serve one, and a page may not load `file://`). Fixing bug 2 would have walked straight into this: the audio block would have been dropped the moment the project was opened. |

Measured, not assumed. Shifting every cue 5s and re-mixing moves the first speech
onset from **0.357s to 5.357s** — exactly the 5s the cues moved, per `silencedetect`.
The editor-export path logs `re-mixed 16 narration clips at their current cue times`
and renders 91.1s with narration.

Also found: **the document package was not importable from plain node.** `History`
used a constructor parameter property, which node's strip-only type stripping cannot
handle — it needs code transformation, not just removal. Since the pipeline is `.mjs`
and `apps/render-cli` will be, the whole package was unusable there, failing with a
message that named neither the file nor the feature. Now a plain field, with a test
that imports the package from `.mjs` because no typecheck can catch this.

Still open: the editor previews the *bed*, so it plays the narration as originally
mixed even when the cues have moved. The exported video is correct; the preview is
not. Per-cue playback needs the Web Audio graph the design doc specifies, and the
timeline now shows a warning marker when a composition's narration cannot follow it.

### 6.10 The tour becomes a behaviour (M10)

`RegionsLayer` carried 46 fields where no other layer has more than 13, and
ENGINEERING_GUIDE §3.8 names the reason directly: *"never add mode flags that fork
a type's meaning."* `tour: boolean` forked it in the plainest way — a static
choropleth and a self-touring one are different objects, and twenty-one of the
layer's fields meant nothing unless that flag was set.

Those twenty-one are now a nested `RegionTour`, and the layer has 26 fields. §3.8
also says what this should eventually become — "a new behavior/graph node" — so the
shape is chosen to be lifted out unchanged when the behaviour stack exists. Three
fields lost prefixes that only existed to disambiguate siblings they no longer have:
`tourPitch` -> `pitch`, `cameraOvershoot` -> `overshoot`, `cameraBow` -> `bow`.

**The harness earned its place here.** Typecheck was clean and all 182 unit tests
passed with the tour completely broken. Two writers set the flat fields and neither
was type-checked into telling us:

| Where | Why the compiler stayed quiet |
| --- | --- |
| `apps/studio/src/lib/fixtures.ts` | The object was cast `as Partial<Layer>`, and a cast erases excess-property checking. Now cast to `Partial<RegionsLayer>`, which is what would have caught it. |
| `apps/pipeline/lib/compose.mjs` | Plain `.mjs`; there is no checking to do. The flat keys were simply ignored and the tour silently fell back to defaults. |

`golden:check` reported 5 of 10 frames changed, up to 100% of cells. Nothing else in
the repository would have noticed until someone watched a finished video.

One bug in the migration itself, found by its own test: `filled.tour` is the *legacy
boolean* for a pre-M9 document, so `current ?? defaultTour()` kept the boolean —
`??` guards null, not the wrong type — and every default read as `undefined`.

### 6.9 What the attribution fix actually took (M9)

The audit entry for D13 was wrong about the cause. It recorded "the caption collides
with the basemap's attribution", implying two of our own texts overlapping. There is
only one bottom text layer. What actually happens: the pipeline adds a Credit layer —
the tile attribution, and not optional — at `background: false`, so a 100-character
Devanagari line was drawn bare, right-aligned across the frame, directly over
satellite imagery and the basemap's own place labels.

Fixing it took three passes, and only looking at rendered frames showed why:

1. Latin and shorter (69 characters). Better, still unreadable.
2. A 45% black scrim, matching what the editor's own export path draws. **Still
   unreadable** — MapLibre draws place labels into the GL canvas *underneath* the
   overlay, so "Kuala Lumpur" read straight through the translucent panel and
   interleaved with the credit's glyphs.
3. An opaque chip at `rgba(10,13,18,0.82)`, the legend's own panel colour. Legible.

Also corrected: the credit named OpenStreetMap while the script uses Esri satellite
tiles and no OSM data. Crediting a provider whose data you are not using is its own
kind of licence problem, so the test now checks the providers each **basemap**
requires rather than asserting a blanket "must say OpenStreetMap".

That test immediately found a third bundled script, `child-marriage-short.json`,
which nothing in this session had touched — its attribution is correct for its
basemap, which the rigid version of the assertion would have failed.

A two-minute, 1292-frame render is the wrong loop for "is this dark enough". A
one-frame shot through the running editor answers it in fifteen seconds.

### 6.8 D6, closed without a rewrite (M8)

The literal reading of ARCHITECTURE §14 is to flatten every field the renderer
reads onto the scene item — 57 distinct properties across ~150 reads. That would
have worked, and it would have created a parallel type hierarchy to keep in step
with the document for as long as v1's renderer lives.

What shipped instead: `apps/studio/src/render/styles.ts` declares, per layer type,
exactly the fields the renderer reads. Document layer types are structural
supersets of those interfaces, so the evaluator assigns a layer straight into
`style` — no copy, no runtime cost — and the narrowing lives entirely in the type
system. The renderer now imports nothing from `@geomotion/document`, and a
`no-restricted-imports` rule on those three files says it never will again: a new
draw routine has to add the field to `styles.ts` first, and notice it is doing so.

Two things this had to get right, and did:

- **It is provably a no-op.** All ten fixture frames are bit-identical before and
  after. That is the harness from M7b earning its keep on the first change it was
  built for — without it, "this refactor changed nothing visually" would have been
  a claim rather than a measurement.
- **`headless.debug()` reported a layer's `name`**, which is document metadata the
  renderer has no business seeing. Rather than widen the render contract to keep
  the diagnostic working, it now reads the name from the project, matched by id.

Note what remains: the two renderer files still import `maplibre-gl`, and still
live in `apps/studio`. `packages/renderer` and `packages/map` need `overlay.ts`
(canvas2D) separated from `mapsync.ts` (MapLibre) as distinct packages, which is a
move, not a redesign — the type boundary that made it hard is now gone.

### 6.7 The harness that nearly did not work (M7b)

`packages/testing` reduces a frame to a 32×18 grid of mean RGB values so a render
change is visible as readable, diffable JSON rather than a binary blob.

Its first version had a per-channel tolerance of 6, chosen defensively without
measuring anything. Testing it the same way the boundary lint was tested — by making
a deliberate change and watching what happened — showed a 4px narrowing of the legend
bar produced deltas of 1–2 and **passed**. The harness detected the change and
reported it as fine.

Three consecutive captures of all ten frames then came back bit-identical, so the
tolerance is now zero. The same 4px change fails 5 of 10 frames, correctly leaves the
4 demo frames (which have no legend) alone, and points at grid row 16 where the legend
sits.

The lesson generalises past this harness: a threshold nobody measured is a threshold
that silently defines what you are willing to miss.

### 6.6 Found by removing the global (M7)

| Where | Finding |
| --- | --- |
| `App.tsx` `useShortcuts` | Threading the host through a hook introduced a **stale closure**: the keydown listener is attached once with `[]` deps, so capturing `host` directly pinned it to its first-render value of `null`. Pressing K would have added a keyframe with default camera values instead of the current view, silently, forever. Caught by `react-hooks/exhaustive-deps` — the rule installed in M5 that had never been able to run. Now read through a ref. |
| `mapref.ts`, `store.ts` | The four `window.__geomotion_*` globals had **no consumer**. The video pipeline drives `window.geomotion` (the `HeadlessApi`); the other family was residue from an earlier approach. This corrects the M5 note that described them as "a real cross-process API contract" — they were vestigial, and went with `mapref.ts`. |

The stale closure is the useful lesson: a module global has no dependency array, so
converting one into a prop or context can silently introduce a staleness bug that the
global could not have had. Worth expecting on the remaining conversions.

### 6.5 Found by watching a finished render (M6 verification)

A full draft render was run end to end to confirm the M4 path rewrites: 16 narration
lines measured, an 86.1s timeline composed over 12 stops, voice bed mixed, 1292 frames
captured at 11 fps, encoded to a valid 9.3 MB H.264/AAC MP4 with subtitles and a
thumbnail. Looking at the output frame rather than just the exit code turned up two
defects, both pre-existing and neither caused by the refactors:

| # | Defect | Impact |
| --- | --- | --- |
| D13 | ~~Attribution unreadable over imagery~~ | **Closed in M9.** Not a collision between two of our own texts, as first recorded: it is the credit line drawn bare over satellite imagery and the basemap's own place labels |
| D14 | ~~Devanagari on screen~~ | **Closed in M9.** Six strings, not one: title, credit, metric label, legend title and two beat captions |

### 6.3 Found by turning on the linter (M5)

There was no ESLint configuration at all, so a handful of things had never been checked:

| Where | Finding |
| --- | --- |
| 5 call sites across `MapCanvas.tsx`, `VoiceStep.tsx` | `// eslint-disable-next-line react-hooks/exhaustive-deps` comments suppressing a rule **that was never installed**. The suppressions did nothing and the dependency arrays had never been verified. The plugin is now installed and the rule enforced. |
| `mapref.ts`, `store.ts` | The headless renderer drives frame stepping through `window.__geomotion_*` globals attached via `as any` — a real cross-process API contract with no type. Renaming one would have broken rendering with no typecheck error. Now declared in `apps/studio/src/automation.d.ts`. |
| `App.tsx` | `e.shiftKey ? s.redo() : s.undo()` — a ternary evaluated for side effects, which reads as a value and returns one nobody uses. |
| `scene.ts`, `Inspector.tsx` | Three `let` bindings never reassigned. |

**A rule that enforces nothing is worse than no rule**, and this milestone nearly shipped
one: `boundaries/element-types` governs only imports it can resolve to a local file, and
workspace packages are symlinked into `node_modules` — so `import '@geomotion/geometry'`
read as third-party and was skipped in silence. The first version of the config passed a
deliberately illegal import. Package-name imports are now covered by `boundaries/external`
alongside it, and both rules are derived from one table. Any future boundary work should
be checked the same way: commit a violation, watch it fail, then delete it.

## 7. Conclusion

The v1 codebase is healthier than its size suggests: the pure-evaluation core, the geo
algorithms, and the resolution-independence rule are all sound and worth porting rather
than rewriting. The two things blocking safe progress are the absence of tests (D1) and the
absence of package boundaries (D2), in that order — tests first, because the algorithms
being ported need a behavioural spec before they move.

No architectural changes were made during this audit.

**Update after M3.** D1 and D8 are closed. The pure core now has a behavioural
contract — 157 tests over `geo`, `easing`, `palettes`, `regions`, `scene`, and
`project` — and CI enforces it.

**Update after M11.** D10 is closed and the register has no open user-facing
correctness items left. What remains is all structural: `packages/renderer` and
`packages/map` (a move now that the type boundary is gone), WebCodecs export (D9),
the two strict flags (D11), and the rest of the pipeline's coverage (D12).

**Update after M10.** D4 is closed. The remaining flat surface on `RegionsLayer` is
genuinely per-layer state — geometry, the value join, the colour scale, borders and
readouts — and the tour sits beside it as the behaviour §3.8 asks for, ready to move
into a behaviour stack as a lift rather than a redesign.

**Update after M9.** D13 and D14 are closed, and D12 is partly closed: `apps/pipeline`
has its first 11 tests, covering the two properties that a render surfaced and nothing
else could catch — on-screen text is Latin while narration stays Hindi, and the
attribution is legible, complete for its basemap, and on screen for the whole video.

**Update after M8.** D6 is closed. The renderer sees a declared style contract
instead of the document, enforced by an import ban, and the render-signature
harness proved the change altered no pixel in any of the ten fixture frames.

**Update after M7.** D5 is closed. The live map is no longer reachable by import:
`RenderHost` is created by the component that owns the canvas and handed down, so
React consumers take it from context and the export and automation paths take it as
a parameter — the dependency is visible in their signatures.

D6 is re-scoped rather than done. Its dangerous half — the renderer mutating the
document through `Scene` — was already closed in M6 by freezing documents. What is
left is a dependency concern across ~127 field reads, which is a mechanical but large
change to 1173 lines of rendering code, and the type checker catches every missed
field. It is M8.

**Update after M6.** D3 is closed. Every document write goes through one
transaction that produces a patch pair, documents are frozen so a write outside a
transaction throws rather than silently bypassing undo, and history is a log of
patches instead of a stack of whole projects. The §2 DOM prohibition is now
executable too, which is what forced browser persistence out of the document model
and into the app where it belongs.

Still v1's *shape*: a project holding arrays of layers and keyframes, not §3's flat
node store with fractional ordering and a schema registry. That is deliberate — the
write path is now the thing that can change independently of the shape.

**Update after M5.** D2 is fully closed. `packages/core` and `packages/geometry` exist,
the dependency law is executable, and the M3 port contract travelled with the code —
which is what made the move checkable rather than hopeful. The next structural blocker is
D3/D5: the document store clones the whole project per edit, and `mapref.ts` is a module
global the renderer reaches through.

**Update after M4.** D7 is closed and D2 is half closed: the pnpm + Turborepo
workspace exists, `packages/` is declared, and v1 has moved to `apps/studio` +
`apps/pipeline` to be converted in place. What is *not* yet true is boundary
enforcement — the dependency law in guide §2 is still only a document, because there
are no packages to police. That lands with the first extracted package, which is the
next milestone: `packages/core` and `packages/geometry`, the two lowest layers and
the two already covered by the M3 port contract.
