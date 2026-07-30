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
| D9 | ~~Export uses headless-Chrome screenshots~~ | — | **Closed in M18**: drafts encode in-page, 113s → 35s. The design doc's 10–20× estimate was wrong; see §6.19 |
| D10 | ~~voice bed mixed at compose time~~ | — | **Closed in M11**: cues keep their own audio, and a render re-mixes from their current positions |

### 6.0 Debt found after the initial audit

| # | Debt | Impact | Proposed milestone |
| --- | --- | --- | --- |
| D11 | ~~`noUncheckedIndexedAccess` / `exactOptionalPropertyTypes` missing~~ | — | **Closed in M13**: on in `tsconfig.base.json`, inherited by every project, overridden by none |
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

### 6.16 Audio in the editor (M15b)

With the Studio gone, audio becomes something you bring. **+ Audio** imports files and
places them at the playhead; the chips on the timeline drag to retime and
double-click to remove, through ordinary transactions, so undo covers them.

Design decisions worth recording:

| Decision | Why |
| --- | --- |
| Audio is `project.audio.cues`, not a layer | It has no spatial presence and nothing to draw, so a layer would carry two dozen fields it never uses — the "mode flags that fork a type's meaning" §3.8 rules out. It also means imported audio and generated narration are the same thing to the player and the renderer. |
| Duration comes from decoding, not metadata | A VBR mp3 misreports its own length, and a cue whose `d` disagrees with its audio makes every downstream length calculation wrong. |
| Embedded as a data URL, not an object URL | An object URL is smaller and faster and dies with the tab, which would mean a saved project quietly losing its sound. §1.8 wants documents serializable; this is the honest reading, and the cost is size. |
| `AudioCue` gains an `id` | Everything else editable in this document has identity. Without one a cue cannot be dragged or deleted and React keys it by array position. `migrate` fills it. |

**A silent failure this created, and then fixed.** Embedding audio makes the ~5 MB
localStorage budget reachable in ordinary use, and `saveLocal` swallowed quota errors —
so a project would stop autosaving while the user kept editing, with nothing to say so.
It now reports the failure, the store keeps it, and the toolbar shows **not
autosaving** with the reason.

Export needed one more thing: a video-only mime records no sound even though the track
is in the stream, which only shows up on playback. `pickMimeType` negotiates
`vp9,opus`/`vp8,opus` when the composition has audio.

Verified in Chrome through the real file input: a 6.278s wav imported at the playhead
came back as `d: 6.278` — matching ffprobe to the millisecond — the chip rendered, a
retime moved it to 9.5s and undo returned it to 3s, and a recording produced
`video/webm;codecs=vp8,opus` with **both** an audio and a video track.

### 6.27 Colours that are not colours (M26)

The inspector's colour field is free text beside the picker, and it commits on every
keystroke. Typing `#ff0000` therefore passes through `#ff00`, which the renderer's
`withAlpha` turned into `rgba(255,0,NaN,1)`.

Assigning that to `fillStyle` is a **silent no-op** — verified against real Chrome, not
assumed: the canvas keeps the previous colour. So the shape drew in whatever the last
layer left behind, with no error and nothing blank, varying with draw order. `core` had
a second partial parser with the same flaw feeding `luminance`, which picks readable
ink by comparing against a threshold — and `NaN` compares false against every
threshold, so one branch would have been taken forever.

One total parser in `core` now covers all four CSS hex forms and returns `null` rather
than NaN channels. `#rgba` is a real form, so the mid-typing case is honoured rather
than papered over. Unparseable hex draws transparent: wrong in a way someone can see,
rather than wrong in a way that looks deliberate.

All ten golden frames unchanged — the fixtures were already valid, so this is
hardening, not a fix to what shipped.

### 6.26 Who drives the camera (M25)

Two behaviours can claim the camera on the same frame — a route's `follow` and a
region tour's `driveCamera` — and nothing stops a project from enabling both. They
resolved by assigning to the same local in the evaluator's layer loop, so the winner
was whichever branch ran last: correct, but by accident, and the variable was named
after only one of the two claimants.

Now each claim is pushed onto a list and `resolveCamera` picks the topmost — the same
outcome, verified bit-identical on all ten golden frames, but a stated rule with a test
in both directions rather than an emergent one. Blending was rejected: averaging a
follow with a tour puts the camera where neither behaviour asked, and no user could
predict it.

This is a first slice of ARCHITECTURE §06's normative stack, not the stack itself —
see "Not done" below.

### 6.25 The rest of the inspectors (M24)

Sixteen tests over the six layer inspectors that had none — route, marker, text,
shape, clouds, image. They had been edited twice without coverage: by the
strict-indexing pass and by the package moves.

Each asserts the round trip rather than the rendering, because that is the failure that
hides: a control wired to the wrong field renders perfectly. Two cases target nested
objects specifically — the route's travelling marker and the marker's label — since
that is the shape that broke when the region tour was nested, and a set that replaced
rather than merged would clear the siblings.

### 6.24 Guarding the renderer in CI (M23)

Exact pixel comparison cannot run in CI — GPU rasterisation differs between drivers, so
a committed baseline mismatches for reasons that are not regressions. Rather than fake
determinism, CI now asserts the properties that hold on **any** machine, by describing
a single run instead of comparing two:

- every fixture frame renders,
- none is blank (grid variance above a floor),
- no two are pixel-identical, so the composition actually animates,
- the overlay contributes something in each fixture,
- and the page logs no errors.

**The first version of this check was worthless, and testing it is what showed that.**
Disabling `drawOverlay` entirely left every frame varied and distinct, because the map
still drew the choropleth — blankness and distinctness alone do not notice a whole
surface going missing. Comparing the composite against the map on its own does, and it
is still one run compared with itself. That variant fails both fixtures the moment the
overlay stops drawing, and passes when it is healthy.

It is also scoped per fixture rather than per frame, because a composition legitimately
has moments with nothing on the overlay — the demo's first frame is one.

Stated plainly: this will **not** catch a layer that goes missing for part of the
timeline, which is the M18 failure. That needs a baseline, and a baseline needs a fixed
environment. The exact check remains a local tool.

### 6.23 The evaluator leaves the app (M22)

`evaluate(document, t) -> Scene` was the last engine code in `apps/studio`. It is now
`@geomotion/evaluator`, with `@geomotion/animation` (the easing table) beneath it and
`basemaps` moved into `map`, where the only other MapLibre-shaped code already lives.

The workspace is now nine packages and two apps, and the app holds what an app should:
components, the store, browser persistence, export plumbing, and the bundled example
projects.

**The test suite split along the same line.** `scene.test.ts` ran against
`demoProject` and `indiaTourProject`, which embed boundary data — content, not engine,
and §2 keeps it out of the packages. So the suites needing only a hand-built document
(`cameraAt`, `layerAlpha`, `tourPhases`) went with the evaluator, and the ones
exercising realistic compositions stayed beside the fixtures they use. The same
reasoning that kept the serialisation round-trip in the app in M6.

Also cleared: vitest's `environmentMatchGlobs` deprecation, which printed on every
studio run. Two named projects now, `node` and `dom`, still split by file extension so
a test sits beside what it covers.

Verified as a pure move — 327 tests before and after, all ten golden frames identical.

### 6.22 The renderer and the map become packages (M21)

The two drawing surfaces were the last engine code living in the app. They are now
`@geomotion/renderer` (the 2D compositor) and `@geomotion/map` (MapLibre), with
`@geomotion/entities` under them for the data join that both need.

M8 did the hard part: the renderer already read a declared style contract rather than
the document, so this was a move rather than an untangling. What moved with it:

| To | What, and why |
| --- | --- |
| `core` | `palettes` — colour maths and the ramp table. Both the renderer and the inspector need it, and it has no dependencies. |
| `entities` | `regions` — the join and the framing solver. §2 names this package; the renderer needs only `RegionSet`'s shape. |
| `renderer` | `overlay`, `clouds`, `images`, `styles`, and the render-scene types lifted out of `scene.ts`. The evaluator stays in the app and now imports the types it produces. |
| `map` | `mapsync`, alone. |

**The DOM ban had to be relaxed, but only here and only for the DOM.** A canvas
compositor with no canvas is not a useful abstraction. The dependency law still holds,
and `renderer` still may not import MapLibre — that separation is the entire reason
`map` is its own package, and it is enforced rather than trusted.

Two things worth recording:

- **A later ESLint block replaces a rule rather than merging with it.** Two blocks both
  setting `no-restricted-imports` silently dropped the first, so the renderer's MapLibre
  ban did nothing until each package got exactly one block. Found by testing the rule
  with a deliberate violation, which is the third time that habit has caught a rule
  that enforced nothing.
- **Source-only packages leak their type dependencies.** `entities` type-checks clean
  alone, but a consumer compiles its `.ts` sources under its *own* config, so every
  consumer of a package exposing GeoJSON types needs `@types/geojson` declared too.
  The same phantom-dependency class M4 found, one level up.

Verified as a pure move: 327 tests before and after, and all ten golden frames
bit-identical.

### 6.21 Ducking (M20)

Overlapping clips summed at full level, so a music bed fought the narration — the thing
you would import music *for*. A clip can now be marked a music bed, and it drops while
anything else is playing over it.

That needed the envelope to become a **curve**: gain that varies within a clip, not one
value with fades at the ends. `gainCurve` returns points with straight lines between
them, because that is the one shape all three mixers reproduce exactly — Web Audio
ramps through them, and ffmpeg's `volume` takes an expression generated from the same
points. Two hand-written envelope implementations would have drifted the first time
either was tuned.

Rules worth stating, each with a test: only music ducks, and only under clips that are
not music, so two beds do not fight and narration is never pushed down by a bed; the
duck is relative to the clip's own level, so setting a bed quiet and ducking it stay
independent; and where a fade and a duck disagree the quieter wins, so a bed already
fading out is not pushed back up by a duck ending.

Verified through ffmpeg rather than by ear: a steady bed with one line over it measured
**−21.1 dB before, −33.1 dB during, −21.1 dB after**. The 12.0 dB drop is
20·log₁₀(0.25) to a decimal place, and it returns to exactly its own level.

### 6.20 The inspector gets tests (M19)

The least-protected code in the app, and the most edited: M10 rewrote 42 of its
controls by script when the tour became nested, and M13 touched ten more. Both were
verified by the type checker and the rendered canvas, neither of which can tell whether
a control still writes the field it claims to.

Component tests need a DOM, so `*.test.tsx` runs in jsdom while `*.test.ts` stays in
node — split by extension so a test still sits beside what it covers.

Fifteen tests, aimed at what those refactors could have broken: a tour field writes
into the nested object and not back onto the layer; editing one field merges rather
than replacing the behaviour; the enable toggle sets `tour.enabled` without erasing
the rest; a deliberate `0` survives; the resolution field refuses a value that does not
parse instead of writing `NaN`; and the audio clip's level, fades, retime and removal.

Two things learned by writing them, both worth keeping:

- **A number field cannot be emptied.** Clearing it commits `NaN`, which the control
  rejects and restores the previous value — so tests select and replace. Pinned by its
  own test, because it looks like a bug until you see it is the only sane behaviour for
  a field the document needs a number from.
- **`getByLabelText` does not work here.** `Field` wraps its label around a container
  that can hold several focusable elements, so the association is ambiguous. A small
  `control(label)` helper finds the field and reaches into it, which is also how a
  person finds it.

### 6.19 WebCodecs, and what the estimate missed (M18)

Drafts now encode inside the page instead of capturing PNGs over CDP: **113s → 35s**
for the 1292-frame reference render, with content matching the frame path at every
sampled moment.

The design doc estimated 10–20×. It is **3.2×**, and the difference is the interesting
part.

**Where the time actually goes**, measured per frame at 960×540 before changing
anything:

| Stage | Cost |
| --- | --- |
| `renderFrameAt` | 3.6 ms |
| two rAF waits (four CDP round-trips) | 11.5 ms |
| `page.screenshot` | **33.6 ms** |
| encoding the same frame in-page | 0.8 ms |

Replacing only the capture gives 3.1× because those round-trips remain. Moving the
whole loop into the page removes them — 17.6 ms a frame, 57 fps in a micro-benchmark.

That benchmark was measured on an already-settled scene, and that is what the estimate
missed. **Waiting for MapLibre is real work the screenshot path was doing by
accident.** Rendered without any waiting, the draft was missing the outline and the
choropleth from 8s to 15s: a layer entering the composition means adding a GeoJSON
source, which has to be parsed and tiled, and two animation frames is nowhere near
enough. The frame path never noticed because its four CDP round-trips per frame handed
MapLibre about 48 ms of slack it never asked for.

Waiting on every frame fixed the content and cost the entire advantage — 111s, no
better than PNGs. The fix is to wait only when the GL **layer count** changes, which is
exactly when a source is being added and is free the rest of the time.

Three traps found on the way, each of which fails silently:

| Trap | Symptom |
| --- | --- |
| `-shortest` with `-c:v copy` | The muxed file has **no audio stream at all**. ffmpeg logs the mapping and exits 0; the copied video "ends" before the audio encoder emits a frame, so the empty stream is dropped. The frame path is immune because libx264 paces the video. Bounded by an explicit `-t` now, with an ffmpeg integration test. |
| `map.getStyle()` as the change signal | Serialises every source, including the region layer's inlined GeoJSON, on every frame — the render stalled past puppeteer's 180s protocol timeout and failed with "Promise was collected". `getLayersOrder().length` is the cheap equivalent. |
| Default `protocolTimeout` | One evaluate holding the whole frame loop legitimately outlives 180s on a long composition. Disabled for the render browser. |

**Draft only, deliberately.** A realtime encoder needed 0.6 bits/pixel/frame to look
comparable to `libx264 -crf 26` — at 0.15 it was visibly soft on satellite imagery and
small text, SSIM 0.75 against the frame path. The draft is now 33 MB against 9.6 MB.
That is the right trade for a file rendered constantly and thrown away, and the wrong
one for the file that gets published, which still goes through libx264.

### 6.18 Level and fades (M17)

M15b shipped audio import and left the obvious use case broken: import music and
narration and they sum at full level, so the music fights the voice. `AudioCue` gains
`gain`, `fadeIn` and `fadeOut`, and clips are selectable so the inspector can offer
them.

The clamping lives in one pure function, `envelopeOf`, because there are **three**
mixers — the editor's preview, the editor's export, and ffmpeg — and a value one
accepts while another rejects is a bug that only appears in the finished file. It also
caps fades so they cannot cross: two ramps meeting in the middle of a short clip duck
it to nothing, which sounds like a dropout rather than a fade.

Order matters in the ffmpeg chain and is easy to get wrong silently: `afade` counts
from the start of *its* input, so fading has to happen before `adelay` moves the clip,
or the shape lands on the head of the silence. `volume` comes first so a fade ramps to
the clip's level rather than past it. `clipFilter` is exported and has twelve tests
precisely because ffmpeg accepts every wrong ordering without complaint.

Both mixers were verified numerically rather than by listening:

| Path | Check | Result |
| --- | --- | --- |
| ffmpeg | RMS of the same clip at gain 1 vs 0.25 | −19.83 dB vs −31.88 dB — a difference of 12.04 dB, and 20·log₁₀(0.25) = −12.04 |
| Web Audio | `applyEnvelope` rendered through an `OfflineAudioContext` over a DC signal, so the output *is* the gain curve | gain 0.25 flat at 0.25; a 2s/2s envelope reads 0 → **0.5 at 1s** → 1.0 at 2s → 1.0 at 5s → **0.5 at 9s** → 0 |

### 6.17 Closing the CLI gap (M16)

The gap M15b left: `render-project.mjs` muxed from `cue.file`, and audio imported in
the editor has only a `data:` URL, so a command-line render silently dropped every
clip the user had added by hand.

`planAudio` now treats an embedded `data:` URL as a readable source alongside a path,
and the pipeline writes those out before mixing. A **served** URL is deliberately still
not a source — the renderer has no server to ask, and accepting one would fail at
ffmpeg rather than in the plan.

The split follows the boundary that already exists: deciding *whether* audio can be
read stays in `packages/document`, pure and tested; the filesystem work is
`apps/pipeline/lib/audio-source.mjs`, with nine tests of its own. A clip that cannot
be resolved is reported rather than skipped, because a mix quietly short a track is
worse than one that says so.

Measured end to end: a project whose audio exists *only* as embedded data rendered
with both clips written to `out/<slug>/audio/`, mixed to exactly the 20s composition
length, and speech beginning at **2.007s and 11.007s** — the two cue positions.

### 6.15 The Studio is removed (M15)

A product decision, not a refactor: the five-step in-app generator (LLM script
writing, image generation, voice cloning, render driving) is gone, and audio becomes
something the editor imports.

It was cleanly isolated, which made this a deletion rather than an untangling —
`App.tsx` was the only file importing it, and `studio/api.ts` the only caller of the
dev-server API. 3,094 lines removed: the UI subtree, 606 lines of its CSS, and
`studio-server.mjs`.

Consequences worth stating:

- **The editor is a static site again with no API.** `vite.config.ts` mounts no
  middleware, so `pnpm dev` and `pnpm build` serve the same thing, and `/api/*` now
  returns the SPA shell rather than JSON.
- **No secrets.** The `OPENROUTER_API_KEY` existed only for the Studio's LLM proxy.
  Nothing reads `.env.local` now. (An old one on disk is inert, but rotate it if it
  was ever shared.)
- **The CLI pipeline is untouched** and still does the whole script-to-MP4 job with
  narration. What is lost is the *authoring* of scripts by an LLM, voice cloning, and
  generated illustrations — all recoverable from git history.

### 6.14 The preview stops lying (M14)

M11 fixed the exported video but left the editor playing the pre-mixed bed, so after
a retime the preview *sounded* right while only the export was. An editor that
disagrees with the thing it is previewing is the worst kind of wrong, because there is
nothing to notice.

Narration is now played line by line through Web Audio, scheduled at the positions the
cues actually hold. The timeline stays the clock: a play schedules from the playhead,
a scrub cancels and reschedules, and nothing here ever drives `time` — letting audio
do that would fight the frame-accurate export, which has no audio at all.

`AudioCue` gains a `url` beside its `file`, because the two serve different consumers
and neither substitutes for the other: **the renderer muxes from a path, and a page
cannot fetch one.** That makes the two capabilities independent, and worth stating:

| Document | `isRetimable` | `canPlayPerCue` |
| --- | --- | --- |
| Studio composition (`file` + `url`) | yes | yes |
| CLI render (`file` only) | yes | no |
| Bed only (pre-M11) | no | no |

The scheduling decision is a pure function with eleven tests, because that is where
the mistake would be: a line the playhead has landed inside must start *immediately*
and skip into itself by the same amount, and getting either half wrong sounds like a
sync bug rather than the arithmetic one it is.

Verified in Chrome rather than asserted: three cues, three clips fetched and decoded,
correct offsets from both `t=0` and mid-line (`offset: 0.5, duration: 1.5`), no page
errors. A stale decode cannot play late — each run carries a generation, and a clip
whose moment passed while it was loading is dropped rather than started behind.

### 6.13 A real data-corruption bug, found by a compiler flag (M13)

`apps/studio` under both strict flags: 163 errors at first count, 76 after the engine
work in M12, all now fixed. No project overrides the flags any more.

**One was a silent, visible bug.** `regionSet` builds its rendered FeatureCollection
by mapping `regions` and indexing `parsed.features` **by position** — but a feature
with no rings is skipped when the region list is built. So for any GeoJSON containing
a geometry-less feature anywhere but the end, every region after it was drawn with the
*next* feature's shape: the right name, the right choropleth colour, the wrong
polygon, and nothing anywhere to say so. Regions are now paired back by `id`, which is
the 1-based feature index. The regression test fails against the old code and passes
against the fix — checked both ways.

Two more that could bite:

| Where | What |
| --- | --- |
| `Inspector` resolution field | `v.split('x').map(Number)` was written straight into `project.width`/`height`. A value that did not split into two numbers would have put `NaN` into the document. Now validated before the transaction. |
| `ScriptStep` paste handler | Tested `rows[cursor]` and took `rows[cursor++]` — the same index at evaluation time, so correct, but correct by coincidence. Now reads each row once. |

The rest were provably-safe accesses, and the fixes that matter are the ones that
turned an invariant into something checkable rather than assumed:

- `regionAtStop(set, stop)` replaces `set.regions[set.order[stop]]` at every call
  site. The tour's order-to-region lookup is a double indirection where both halves
  can miss; it now has one name and one definition.
- `cameraAt`, `ringArea`, `ringCentroid`, `unwrap`, `buildPath` and `measure` walk
  consecutive pairs instead of indexing two positions of the same array. Shorter, and
  no assertions.
- `RAMPS` and `BASEMAPS` are typed `[T, ...T[]]`, so the `?? LIST[0]` fallback that
  both `getRamp` and `getBasemap` depend on is guaranteed by the type.

Test-file assertions were inserted by a compiler-driven script rather than by hand: in
a test, a missing element *is* the failure, so asserting there is honest. Where a
whole block wanted the same guard, a small `regionsAt`/`textAt`/`cloudsAt` helper
replaced it and throws with the timestamp instead.

All ten golden frames are bit-identical, and the test count went 232 -> 233.

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
