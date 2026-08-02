# "The Walk That Broke an Empire" — the Dandi March

Pilot episode of **Walk to Remember**, a new DataBandar series mapping historic long-distance
walks. Built end to end via the `map-video-production` skill. 42.4s, 1080×1920, GeoMotion
only — single map context throughout, no Hyperframe insert.

**Output:** `the-walk-that-broke-an-empire.mp4` (gitignored — 4.6 MB, rebuild locally below).

## Why this idea, and why first

Reviewed against three other candidate walks for the series (Rahul Gandhi's Bharat Jodo Yatra,
Y.S. Jagan Mohan Reddy's Praja Sankalpa Yatra, the Pandharpur Wari) before picking this one to
build first. Dandi March and Pandharpur Wari were rated strong fits — globally legible, zero
partisan risk. The two contemporary party-political yatras were flagged as a real brand risk
for a channel with no prior domestic-politics content, not a default include — covering both
a Congress leader's and a YSRCP leader's walk on the same series would invite "which side is
this channel on" reads regardless of how neutral the treatment is. Dandi March was the obvious
pilot: it's the historical root the "walk as protest" idea traces back to, and the series' own
name (a walk people still remember, nearly a century later) is close to a paraphrase of its
last line.

## The facts, verified before a word was scripted

| Claim | Figure | Source |
|---|---|---|
| Distance / duration | 387 km (240 mi), 24 days, March 12 – April 5 1930 | History.com, Britannica |
| Starting group | 78 volunteers | History.com |
| Crowd by the coast | Tens of thousands | History.com |
| The act | Salt law broken the morning of April 6, 1930 | History.com |
| Aftermath | 60,000+ jailed within a month; Gandhi arrested May 5, 1930 | History Skills, History.com |
| Recognition | Time magazine's Man of the Year, 1930 | History.com |

## Three bugs found by rendering, not by reading the build script

**The route was invisible at the camera zoom carried over from Malacca/Arctic.** Those
episodes' routes span thousands of kilometres; Dandi's is 387 km — two orders of magnitude
smaller. A calculated zoom estimate (~8.7, derived from a standard web-mercator doubling
formula) still left the route a near-invisible sliver, and a naive attempt to compensate
(zoom 11.3) overflowed the frame entirely and made the base landmass data (110m-resolution
Natural Earth, not meant for this close a zoom) render blank. What actually worked was found
empirically, not by formula: querying the studio's own `window.geomotion.debug(t)` API — which
reports the real evaluated camera zoom, not a guess from pixels — and bisecting between "too
small" and "overflowing" until zoom 8.9 held both a fully visible route and legible coastline.
A direct JSON patch of the camera node to a "static" track, tried as a shortcut mid-diagnosis,
turned out to evaluate inconsistently regardless of the value set — the real keyframed pipeline
was the only trustworthy way to test this.

**Two separate marker-label collisions with the closing title.** The Dandi marker's label
originally persisted to `EDGE` like the route — reasonable in isolation, but at the S07 wide
reveal it landed in the same lower band as "THE TAX DIDN'T LAST," directly overlapping it.
Fixed the same way Malacca fixed its pulse-marker collision: end the label with its own beat
(S05 start), not the whole film. A second, smaller collision remained after that fix — the
`route` layer type's own default leading-edge marker (a separate white dot, distinct from the
explicit pulse markers, enabled by default and sitting at the route's final coordinate once
`progress` completes) was still parked on top of the text. Fixed by explicitly disabling it.

**A series-tag/source-citation text collision.** The new "WALK TO REMEMBER · EP. 1" tag was
placed in the same top row as the persistent source citation; even left-aligned, its actual
rendered width reached far enough right to overlap. Fixed by moving it to its own row below the
title instead of trying to share space with the top-right corner block.

## Post-release fix: the route was a straight line

User feedback after the first cut: the route was a straight line between Sabarmati and Dandi
and never named a single place in between — accurate to the endpoints, but not to the actual
march, and a missed chance to make the "walk through real places" feeling concrete. The march
wasn't a straight line; it bowed east through central Gujarat before turning back to the coast.

Fixed by looking up the real overnight-halt villages (History.com, Outlook Traveller) and
rebuilding both the route and the growing-crowd markers around them: Sabarmati → Aslali →
Nadiad → Anand → Borsad → Ankleshwar → Navsari → Dandi. Three of the six crowd-beat markers
(Nadiad, Anand, Ankleshwar) now carry the village name on screen — real, recognizable stops,
not per-village crowd counts (no source gives a number at these specific points, so the
narration's two verified totals still carry all the precision). The camera's horizontal
centering was nudged east (72.69° → 72.80°) to keep the new bulge in frame; the vertical
extent and every other beat's framing were untouched since the route's north-south span didn't
change. Re-rendered and re-screenshot-tested; the audio mix was untouched and didn't need
re-generating.

## Post-release addition: Flux image inserts

Four images from `image-prompts.md`'s plan, generated in Flux and wired in as GeoMotion's
native `image` layer (a bordered, shadowed card with position/width/anchor placement — see
`packages/document/src/schema/layers.ts:475`) at S01, S04, S05, and S06. Embedded as base64
data URIs directly in the project JSON rather than served from a public folder, keeping the
whole build self-contained the same way the rest of this pipeline is.

**Two bugs found by rendering, not by reading the build script:**

- **The source PNGs had an opaque white rounded-corner card baked in** (RGB, no real alpha —
  confirmed by sampling corner pixels) rather than true transparency, so the engine's own
  border/radius doubled up against it. A naive "make near-white transparent" pass would have
  also punched holes in the white salt crystals in one of the images, so the actual fix was a
  flood-fill from each of the four image corners — only the region connected to the corner
  through near-white pixels gets cleared, leaving internal white content untouched.
- **Two placements collided with the map itself.** The S04 card, planned at `topRight`, landed
  on top of the route's final approach into Dandi (which enters that tight close-up from the
  upper-right) — moved to `topLeft`. The S06 card's `topRight` anchor with a wide `x` value put
  its left edge past screen-center, reading as centered rather than corner-placed, and looked
  repetitive back-to-back with S05's similarly-sized card — pushed further into the actual
  corner and narrowed.

One deviation from the original plan: the user generated their own alternate for S04 — a
walking silhouette (glasses, cane, dhoti) rather than the planned cupped-hands image — and
picked it over the original. It works even better than planned, since the figure faces toward
the Dandi marker in that shot, reading as "walking toward this point." The original
cupped-hands image is kept in `assets/` as a documented alternate, unused in the current build.

## What's new for this series vs. Malacca/Arctic

- **A growing-crowd mechanic**: small pulse markers appear one by one along the already-drawn
  route during the "78 volunteers to tens of thousands" beat — the same "if it has a
  coordinate, GeoMotion draws it" discipline applied to a crowd-size story instead of a
  distance or seasonal one. Deliberately un-labelled (no fabricated per-point numbers); the
  narration's two verified totals carry the precision, the dots carry the feeling of growth.
- **Regional, not global, scale** — the first episode in this format where the whole story
  happens inside one state. The zoom-calibration lesson above is the concrete result of that:
  the camera math that worked for ocean-spanning chokepoints doesn't transfer to a 387 km walk.
- **A series identity layer** (the "WALK TO REMEMBER · EP. 1" tag) — this format's first
  attempt at signalling a recurring series rather than a one-off explainer.

## Reproducing it

Needs `pnpm dev` running and a local Voicebox on `:17493`.

```bash
node tools/narrate.mjs      # -> vo/*.wav
node tools/retime.mjs       # -> schedule.json, from measured audio
node tools/build-project.mjs
# render every frame through the studio's headless API (see docs/brand/arctic-route/tools/ or
# docs/brand/databandar-demo/v2/tools/ for the render-frames pattern), then:
python3 tools/mix-audio.py  # -> audio.wav
ffmpeg -framerate 30 -i frames/f%05d.png -i audio.wav \
  -c:v libx264 -pix_fmt yuv420p -crf 16 -preset slow -c:a aac -b:a 192k \
  -shortest -movflags +faststart the-walk-that-broke-an-empire.mp4
```
