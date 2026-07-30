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
| D4 | `RegionsLayer` monolith (~45 fields) | Guide §1.10 / §3.8 violation; every new capability tempts another flag | M6 |
| D5 | `apps/studio/src/lib/mapref.ts` module-global map handle | Named anti-pattern (guide §15); blocks worker rendering and multiplayer | M7 (with the `RenderScene` boundary, which is what replaces it) |
| D6 | Renderer coupled to React + document (`MapCanvas.tsx` evaluates, syncs GL, draws overlay) | No `RenderScene` boundary; blocks worker export and WebGPU | M7 |
| D7 | ~~npm, not pnpm + Turborepo~~ | — | **Closed in M4** |
| D8 | ~~No CI~~ | — | **Closed in M3**: `.github/workflows/ci.yml` (typecheck, test, build, secret scan) |
| D9 | Export uses headless-Chrome screenshots (~4 fps) | Design doc §14 specifies WebCodecs in-page (10–20×) | M8 |
| D10 | `voice bed` mixed at compose time | Retiming desyncs narration (design doc §00, §10) | M6 |

### 6.0 Debt found after the initial audit

| # | Debt | Impact | Proposed milestone |
| --- | --- | --- | --- |
| D11 | `strict` is on, but the two flags the guide also mandates — `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes` — are not | Guide §2 requires both. Turning them on will surface real indexing and optional-property assumptions across ~12.8k lines | Its own milestone; too noisy to bundle into an infrastructure change |
| D12 | `apps/pipeline` has no tests | The narration-timing and placeholder-resolution logic is where factual errors reach a published video, and it is unguarded | With the `apps/server` / `apps/render-cli` split |

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
