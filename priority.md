# Task priority

Five requested tasks, ranked by value against risk, with what each actually needs. Ordered to
be done **one at a time**, top first.

Grounded in the code as it is today, not in what the tasks assume.

| # | Task | Verdict | Size | Order |
| --- | --- | --- | --- | --- |
| 5 | Basemap tiles not loaded before render | **Do first — it is a bug, and I found the cause** | S | 1 |
| 4 | More card styles, or no card | **Yes** — half of it already exists | M | 2 |
| 1 | Transparent background after image upload | **Yes, in two stages** | M → L | 3 |
| 3 | Sound library | **Yes, but smaller than asked** | L | 4 |
| 2 | Record audio, re-voice with Voicebox | **Split it** — half is easy, half needs a spike | M + ? | 5 |

---

## 1. Basemap tiles — the loading blocks *(task 5)*

**This is a real bug and I have the cause.** Two of them.

**Cause A — drafts never wait.** `render-project.mjs:140` and `video.mjs:232` both pass
`waitForTiles: !draft`. A draft skips tile waiting entirely, by design, for speed. That is
why you see grey blocks in drafts.

**Cause B — the wait gives up silently, and this is the real defect.**
`apps/studio/src/render/host.ts:52`:

```ts
const timer = setTimeout(finish, timeoutMs);   // finish() RESOLVES
```

When tiles do not arrive within 12 s, the promise **resolves as though they had**. The frame
is captured with the blocks still showing and the render reports success. Nothing anywhere
says a frame went out unfinished.

**Procedure**

1. `waitForIdle` returns `boolean` — `true` settled, `false` timed out. No behaviour change.
2. The render loop counts timeouts and their frame numbers.
3. At the end, report them: `⚠ 3 frames captured before tiles finished (frames 41, 42, 88)`.
   A silent bad frame becomes a loud one.
4. `--strict-tiles` fails the render instead of warning, for CI.
5. **Pre-warm before frame 0**: seek to the first frame, wait with a longer budget (30 s),
   *then* start capturing. Most timeouts are the cold start, not the middle.
6. `--wait-tiles` lets a draft opt into waiting when the draft is for judging the picture
   rather than the timing.

**Risk:** low. No document change, no renderer change. Golden frames must stay Δ0.

---

## 2. Card styles, and no card *(task 4)*

**Half of this exists.** `showCallout: boolean` and `calloutSize` are already on the regions
layer, and `tour.labelAll` already prints every region's value on the map. So *"no card, just
the numbers"* is reachable today — it is a discoverability problem, not a missing feature.

What is missing is **styles**. The card is one hard-coded look in
`packages/renderer/src/legend.ts`.

**Procedure**

1. Add `calloutStyle` to the regions layer: `'card' | 'plain' | 'underline' | 'pill' | 'none'`.
   `'none'` is the same as `showCallout: false`, so the migration folds the boolean into the
   enum and the old field goes — two fields meaning one thing is what §3.6.4 forbids.
2. Format bump + fixture.
3. One draw function per style in the renderer, chosen by the enum. Placement logic
   (`legend.ts`) is shared and unchanged.
4. Golden frames: **these will change** for any project using a new style. The existing ten
   use `'card'`, so they must stay Δ0; add new goldens for the new styles.

**Risk:** low-medium. Contained in the renderer plus one document field.

---

## 3. Transparent image background *(task 1)*

Two honest options, and I would ship them in this order.

**Stage A — colour key from the corners.** Sample the four corners, flood-fill outward
removing pixels within a tolerance, feather the edge. Runs in a canvas, no dependency, no
model download.
*Works on:* logos, flags, charts, screenshots, anything with a flat background — which is most
of what goes into a map video.
*Fails on:* photographs. It must **say so** rather than produce a bad cut-out; a tolerance
slider and a live preview make the failure visible instead of silent.

**Stage B — a real matte.** `onnxruntime-web` + U²-Net (quantised, ~4.7 MB). Handles photos.
Adds a runtime dependency and a model asset, so per §13 it needs an ADR before any code.

**Procedure (Stage A)**

1. `removeBackground(imageData, { tolerance, feather })` in `@geomotion/core` — pure, seeded,
   unit-testable, no DOM.
2. Store the result as the layer's `src` (already a data URL) and **keep the original** in a
   new `srcOriginal`, so the edit is non-destructive and the tolerance stays adjustable. §01's
   first commitment is "everything stays editable".
3. Inspector: a "Remove background" toggle plus a tolerance slider, in the image panel's
   generated rows.
4. Format bump for `srcOriginal`.

**Risk:** medium. Stage A is contained; Stage B needs the ADR and a size budget.

---

## 4. Sound library *(task 3)*

**Smaller than asked, in the first pass.** Two separate problems are bundled in the request.

**Problem 1 — the document cannot hold a sound effect.** `packages/document/src/audio.ts`
models narration cues and a remix plan. There is no SFX clip. That is the real work, and it is
a document change.

**Problem 2 — "a hush when the cloud clears, a click when a state is selected"** is not a
clip on a timeline; it is a sound *triggered by a thing happening*. That is a behaviour (§06),
and it needs the event model that does not exist yet. **Doing it now would invent an
architecture.** Place the sounds by hand on the timeline first; auto-triggering is its own
milestone once behaviours can emit.

**Licensing is the other real constraint.** "Open source sounds" is not one thing. Only **CC0
/ public domain** should be bundled — CC-BY needs per-asset attribution plumbed into the
credits generator (§05), which does not exist yet. So: CC0 only, each with `licence` and
`source` fields, which §11 already requires of every asset.

**Procedure**

1. `SfxCue` on the audio model: `{ id, file, at, gain, fadeIn, fadeOut }`. Format bump.
2. `planAudio` mixes SFX alongside narration — it already re-mixes from cue positions (D10),
   so retiming keeps working.
3. A small bundled CC0 pack (10–15 sounds: click, whoosh, hush, chime, tick, page-turn),
   each carrying licence and source.
4. Timeline: an SFX lane. Drag a sound onto it.

**Risk:** medium-high. Touches the document, the mix, the timeline and the asset browser.

---

## 5. Record audio, and re-voice it *(task 2)*

**Split this.** One half is straightforward and useful on its own; the other half rests on an
assumption I have not verified.

**Half A — record narration in the app.** `MediaRecorder` in the browser, the blob becomes an
audio cue like any imported one. The measured-duration path (D10) already exists, so a
re-recorded line re-measures and ripples. Self-contained and genuinely useful.

**Half B — use the recording to generate other voices.** This assumes Voicebox can build a
voice *profile from a sample*. The pipeline uses Voicebox for preset voices only
(`presetVoice: 'hf_alpha'`), and I have not confirmed it does cloning.

**Procedure**

1. **Spike first, an hour, before any code:** query a local Voicebox for its profile API and
   confirm whether a sample can create a profile. If it cannot, Half B is not this task —
   it is "choose a voice-cloning engine", which needs an ADR.
2. Half A regardless: record → cue → measure → ripple.
3. Half B only if the spike says yes.

**Also worth saying:** voice cloning has consent implications. Cloning your own voice is
fine; the UI should not make cloning *someone else's* recording the frictionless default.

**Risk:** Half A low. Half B unknown until the spike, and it depends on a tool that has to be
running locally.

---

## What I am doing now

Task 5 — the basemap bug. It is the smallest, it is the only one that is a defect rather than
a feature, and it silently degrades output you have already shipped.
