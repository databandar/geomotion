# ADR 0001 — HyperFrames as the composition layer, GeoMotion as the map engine

**Status:** proposed · **Date:** 2026-07-31 · **Supersedes:** the front-end half of
[`VISION.md`](../../VISION.md) and [`ARCHITECTURE.md`](../../ARCHITECTURE.md) §13

> ENGINEERING_GUIDE §2: "changes that contradict [the design doc] require an ADR in
> `docs/adr/` first." This contradicts it, so this is that ADR. Nothing has been built
> against it yet.

## Context

The stated aim changed, or rather was stated plainly for the first time: **the point of this
tool is to publish videos on a YouTube channel.** `VISION.md` answers a different question —
it describes an editor that competes with After Effects and GeoLayers, a multi-year build in
which the map engine is perhaps a fifth of the work.

The gap is measurable in this repository's own history. Milestones M2.2–M2.6 (flat node
store, groups, node-type registry, commands and ⌘K, map-context nodes) are sound engineering
and **did not make a single new video possible**. Meanwhile `apps/pipeline/out/` holds
finished MP4s with narration, subtitles and thumbnails, produced by a script-driven pipeline
that already works end to end.

The question asked was whether to fork [heygen-com/hyperframes][hf] and rebuild on it.

[hf]: https://github.com/heygen-com/hyperframes

## What reading the repo established

Read at commit `main`, 2026-07-31: 14 packages, ~1,920 TypeScript files, Apache-2.0,
Puppeteer + FFmpeg, "Write HTML. Render video. Built for agents."

### 1. A live map inside a HyperFrames composition is forbidden by contract

`packages/engine/src/services/frameCapture.ts` detects live map viewports by selector —
`.maplibregl-map`, `.leaflet-container`, `.mapboxgl-map`, `.gm-style`, `.ol-viewport` — and
records a `live_map_detected` warning:

> "Map tiles load over the network at render time, which the deterministic-render contract
> forbids — frames captured before tiles arrive ship a blank or partial map with no error.
> Bake the map to a video first."

Their own maps module is blunter still (`skills/motion-graphics/categories/maps/module.md`):
MapLibre *does* render live in HyperFrames, "just janky: tiles pop, deep zooms outrun
loading". A per-frame async hook exists — `onBeforeCapture(page, seekTime)`, used internally
for video-frame injection — and exposing it "would make live **smooth** — but it would **not**
remove the need to freeze tiles for determinism + offline reproducibility."

**So the shape originally asked for — the GeoMotion engine as a live consumer inside a
composition — is not available, and would not be sanctioned even with the hook exposed.**

### 2. Their map lane is precisely what GeoMotion already does, and weaker

Their "basemap lane" is `bake-basemap.mjs`: Puppeteer + MapLibre, an eased camera,
`await map.once('idle')` before every frame, then `ffmpeg` to an all-intra MP4, plus a
`coords.json` of projected borders for an SVG overlay.

That is, line for line, this project's render pipeline — including the tile-await guarantee
M18 learned the hard way. What they have on top: projected border draw-on, flag-in-border
clipping, pin rollouts. What they do not have, and name as a gap in their own module:

- **sub-national boundaries** — "aren't in world-atlas (country-only) → use a Natural Earth
  admin-1 TopoJSON, or project centroids as pins";
- a data join, entities, or provenance;
- ranked/choropleth tours with narration-driven pacing;
- a framing solver, label-collision solver, or CVD-checked colour ramps.

Every one of those is built here, tested, and shipped. **GeoMotion is the upgrade to their
weakest category, not a competitor to their framework.**

### 3. Forking is the wrong unit

Every integration point is public: the `hyperframes` CLI, the composition contract in
`@hyperframes/core`, the registry (`hyperframes add`), and 19 agent skills. Nothing about
using HyperFrames requires modifying it.

A fork means owning 14 packages, their release channel, their Lambda and Cloud Run images,
and their skill set — permanently, and for no capability we cannot get by depending on the
published package. The single thing a fork would unlock is exposing `onBeforeCapture` to
composition authors, and even that is better sent upstream as a PR than carried in a fork.

Licence note: HyperFrames is Apache-2.0, this project is MIT. Depending on the published
package keeps that boundary clean; vendoring their source into an MIT tree does not.

## Decision

1. **Adopt HyperFrames as the composition, finishing and delivery layer** — typography,
   captions, stings, charts, audio, transitions, render and publish. Depend on the published
   `hyperframes` package. **Do not fork.**
2. **Keep the GeoMotion engine packages** (`document`, `evaluator`, `renderer`, `map`,
   `entities`, `geometry`, `animation`, `core`) as the asset they are. They are already
   framework-free, and `evaluate(document, t) → RenderScene` is exactly the pure, seekable
   shape this integration wants.
3. **GeoMotion becomes a map-segment renderer**: a headless CLI that takes a map spec and
   emits a frozen video segment plus a projected-geometry sidecar — the `bake-basemap.mjs`
   seam, filled by something far more capable.
4. **Retire `apps/studio` in stages, not at once** (see the plan below). It stays runnable as
   a map-segment previewer until the CLI loop is demonstrably faster for making an episode.
5. **Revisit the live-map hook only if the bake loop proves too slow to iterate on.** If it
   does, the move is an upstream PR exposing `onBeforeCapture`, not a fork.

## Migration plan

Each stage is shippable and reversible; none deletes work before its replacement is proven.

| Stage | What | Done when |
| --- | --- | --- |
| **0. Baseline** | Make one episode with the current pipeline. Record wall-clock, hand-steps, what was painful. | A number to beat exists. |
| **1. Bake CLI** | `geomotion bake <spec>` — a map segment (MP4, and alpha WebM where the overlay needs to float) plus `coords.json`: projected region paths, label anchors, bboxes, at a held camera. Reuses `renderFrames`, the framing solver, entity joins. | A segment drops into a HyperFrames composition and aligns. |
| **2. One hybrid episode** | Same script as stage 0, map segments from stage 1, everything else composed in HyperFrames. | Compare against the stage-0 number, honestly. |
| **3. Decide, on evidence** | If the hybrid wins, adopt it as the production path and freeze editor feature work. If it loses, say why and stop here — the ADR is reversible until this point. | Written down either way. |
| **4. Contribute upstream** | Offer the map capability back as a registry block plus a maps-module revision: sub-national boundaries, data joins, ranked tours. | Merged, or declined with a reason. |
| **5. Retire the editor** | `apps/studio` moves to `examples/` or a branch. The engine packages stay. `VISION.md` is rewritten to say what this actually is. | The editor is no longer on the critical path for an episode. |

Stages 0–2 are days, not weeks, and stage 3 is a real decision point with real evidence.

## Consequences

**Gained:** a delivery pipeline that already exists (cloud/Lambda/local render, captions,
TTS, media catalog, publishing); a motion-graphics vocabulary this project would need years
to grow; an agent-native authoring loop that suits a solo channel; and a place where the map
work is differentiating rather than duplicative.

**Lost, and worth naming honestly:**

- **The interactive editor** — the timeline, inspector, layer tree, double-click-to-fly, the
  canvas. Roughly 6,000 lines of `apps/studio`, plus the four architecture milestones just
  shipped, which were foundations *for that editor*. The engine work underneath them
  survives; the editing surface does not.
- **WYSIWYG map editing.** Composing a map becomes writing a spec and re-baking rather than
  dragging on a canvas. Whether that is worse is exactly what stage 2 measures.
- **The vision as written.** "The editor where the world is the scene graph" becomes "the map
  engine behind a video framework". That is a smaller claim, and it is the one that matches
  what the tool is actually for.

**Kept, and worth naming too:** every engine package, the entity/data join, the framing
solver, the tour choreography, the deterministic clock, the golden-frame harness, the format
chain and its fixtures, and the pipeline that already renders episodes.

## Alternatives rejected

- **Fork and port the engine into HyperFrames' composition model.** Re-expressing
  `evaluate(doc, t)` as HTML/CSS/GSAP would discard the engine's whole shape to gain nothing
  the bake seam does not already give.
- **Keep building the editor.** Defensible if the aim were a product for other people. It is
  not what the channel needs this year.
- **Build the motion-graphics layer inside GeoMotion.** Kinetic type, charts, captions,
  transitions, cloud render — quarters of work to arrive where an Apache-2.0 package already
  is.
