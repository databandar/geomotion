# "Half of Humanity" v2 — redesign

Answers the panel's two hard requirements (label-free basemap, a real ending) and the four it
found already satisfied by this plan (compression, camera continuity, a match cut, a
screenshot-test build step). Timings below are the design target; the produced cut's real
numbers are measured from actual audio, same discipline as v1 and EP001 — see
`../v2/CHANGELOG.md` for what the measured cut actually landed on.

## The core structural change

v1 was **world → zoom → stat**, four times, reset each time. v2 is **one journey**: an abstract
idea resolves into a real place, and the camera never returns to the same framing until the
single wide shot reserved for the ending.

```
DIAGRAM (Hyperframe)  →  GLOBE (match cut)  →  BANGLADESH  →  NETHERLANDS  →  INDIA  →  CHINA  →  WIDE (button)
   the ratio, as shape        the real world       push          comparison arc      push+count   crossing point   pull back once
```

## Narration (69 words, down from v1's ~89 across one more beat)

| id | line | words |
|---|---|---|
| s00 | "Same hundred people. Wildly different footprint." | 6 |
| s01 | "This is where they actually live." | 6 |
| s02 | "Four places explain most of it." | 6 |
| s03 | "Bangladesh: twelve hundred people, every square kilometre." | 7 |
| s04 | "Not just South Asia — the Netherlands is nearly as packed." | 10 |
| s05 | "India alone holds eighteen percent of humanity, on three percent of the land." | 13 |
| s06 | "Add China, and the running total passes half — at thirteen percent of the map." | 14 |
| s07 | "Half of us. One-eighth of the Earth." | 7 |

The v1 claim line ("Half of them are standing on just thirteen percent of the land") is gone —
that idea now lives entirely in the Hyperframe visual, so it doesn't need to be said before it's
shown.

**s00 is deliberately not a restatement of the diagram's own on-screen text** ("HALF OF
HUMANITY / 13% OF THE LAND"). It names the *mechanism* — same count, different footprint —
which is what makes the diagram intelligible rather than just decorative.

## Storyboard

### S00 · THE RATIO — Hyperframe, 2.6s

| | |
|---|---|
| **Narration** | "Same hundred people. Wildly different footprint." |
| **On-screen** | HALF OF HUMANITY / 13% OF THE LAND (Hyperframe's own type) |
| **Hyperframe** | 100 dots resolve from nothing; 50 scatter into a wide, sparse spread; 50 contract into a tight, glowing cluster a fraction of the size. Bands and labels arrive after the motion settles. |
| **GeoMotion** | — |
| **Transition out** | **Match cut** — the next shot's globe lands with the landmass occupying roughly the same frame position the glowing cluster just held. |

### S01 · THE REVEAL — GeoMotion, globe

| | |
|---|---|
| **Narration** | "This is where they actually live." |
| **On-screen** | *(none — the cut itself is the reveal)* |
| **GeoMotion** | Globe projection, `dark-clean` basemap (zero default labels). Landmass traced on in the diagram's own green. Camera already at a moderate push — not the tiny distant-dot framing v1 opened with. |
| **Transition out** | Continuous push — no cut — directly toward Bangladesh. |

### S02 · THE SETUP

| | |
|---|---|
| **Narration** | "Four places explain most of it." |
| **On-screen** | *(none)* |
| **GeoMotion** | Camera continues its push, already arcing toward South Asia. No idle hold. |

### S03 · BANGLADESH

| | |
|---|---|
| **Narration** | "Bangladesh: twelve hundred people, every square kilometre." |
| **On-screen** | Built-in tour card: name, value, rank, progress bar |
| **GeoMotion** | Choropleth reveals (sequenced). A pulsing marker lands on Bangladesh at the moment the card appears — secondary motion inside the hold, not just the card sitting static. |
| **Transition out** | **Comparison arc**, not a reset — camera and a thin connecting route both travel from Bangladesh toward the Netherlands, so the next stop arrives already framed by the journey rather than a fresh idle shot. |

### S04 · NETHERLANDS — the comparison beat

| | |
|---|---|
| **Narration** | "Not just South Asia — the Netherlands is nearly as packed." |
| **On-screen** | Built-in tour card |
| **GeoMotion** | The Bangladesh→Netherlands route arc, still visible, fades as the card settles — a visible link between the two stops, which is the "geographic comparison" GeoMotion is asked to own instead of a caption doing the comparing. |
| **Transition out** | Continuous push toward India — no reset. |

### S05 · INDIA — the big jump

| | |
|---|---|
| **Narration** | "India alone holds eighteen percent of humanity, on three percent of the land." |
| **On-screen** | Built-in card + a cumulative counter line ("18% of humanity · 2.3% of land") |
| **GeoMotion** | Wider push than the previous two stops — India's own scale earns a bigger frame. Pulsing marker again. |
| **Transition out** | Continuous push toward China. |

### S06 · CHINA — the crossing point

| | |
|---|---|
| **Narration** | "Add China, and the running total passes half — at thirteen percent of the map." |
| **On-screen** | Built-in card + "crosses 50% at 13% of land" |
| **GeoMotion** | The thesis lands here. Choropleth at its fullest extent (all four stops' color visible in one frame for the first time). |
| **Transition out** | **The one reset in the film** — pull back to a wide framing for the button. |

### S07 · THE BUTTON — ending

| | |
|---|---|
| **Narration** | "Half of us. One-eighth of the Earth." |
| **On-screen** | 50% POPULATION / 13% OF THE LAND — same words as the Hyperframe open, now over the real map, closing the loop |
| **GeoMotion** | Wide pull-back, full choropleth visible, `dark-clean` basemap (still zero clutter). |
| **Transition out** | **Hard cut to black on the last word** — not a fade. The panel's non-negotiable note. |

## GeoMotion production plan

- **Basemap:** `dark-clean` throughout (new — `packages/map/src/styles/dark-clean.json`, Dark
  Matter with all 27 symbol/label layers stripped, tested in `basemaps.test.ts`). Zero default
  place names on any frame.
- **Projection:** globe, single context for the whole film (the same engine limitation
  documented in v1's README still applies — a mid-timeline projection switch doesn't survive
  headless export, so v2 stays on one context exactly like v1 did, this time by design from the
  start rather than discovered mid-build).
- **Camera:** one continuous keyframe path, S01→S06, with no return to a matching pose until
  S06→S07's single pull-back. No stop's camera framing repeats another stop's.
- **Choropleth:** `regions` layer, `forest` ramp flipped (bright = dense, against the dark
  basemap), domain capped at 300 (density is as skewed as the World Tour and v1 fixtures found
  — median 71, max 1,214).
- **Comparison route:** a new `route` layer, Bangladesh↔Netherlands, arc curve, drawn during S03
  and faded during S04 — the one new GeoMotion element v2 adds beyond v1's layer set.
- **Secondary motion:** a `marker` with a `pulse` ring behaviour at Bangladesh and at India,
  landing in sync with each stop's card — continuous small motion inside what were static holds
  in v1.
- **Source mark / DataBandar mark:** unchanged from v1, top-right, same place every frame.

## Hyperframe production plan

One composition, `hyperframe/density-diagram.html` (in this repo). Full prompt-equivalent spec,
since this was hand-authored rather than generated from a text prompt:

```
STYLE
Flat, matte, dark (#05070A background). No gloss, no perspective, no photorealism.
1080×1920, 30fps, 2.6s duration.

CONTENT
A 10×10 grid of 100 dots (14px circles), one per percent of humanity.
0.05s–0.4s: all 100 dots fade and scale in, staggered randomly.
0.5s–1.2s: the top 5 rows (50 dots) spread outward to a 90px pitch, filling a wide sparse
  band. The bottom 5 rows (50 dots) contract to a 40px pitch, forming a small tight glowing
  cluster — same dot count, radically different footprint.
1.15s–1.45s: the tight cluster's dots pick up a green glow (box-shadow), the sparse dots stay
  a flat muted grey — the only color in the frame is the density itself.
1.3s–1.6s: two band outlines fade in around each group (sparse: grey border; dense: green
  border, filled), with small caption tags — "50 OF 100 — PACKED TIGHT" / "THE OTHER 50 —
  SPREAD WIDE".
1.75s–2.15s: "HALF OF HUMANITY" fades up, center, large, white.
2.05s–2.4s: "13% OF THE LAND" fades up beneath it in green.
2.3s–2.6s: hold on the full composition — this is the frame the following match cut lands on.

MOTIF
Same 50 dots on both sides. The only variable is density. No map, no geography — this frame
should not be mistakable for a place, only for a ratio.
```

**Rendered with:** `npx hyperframes render docs/brand/databandar-demo/hyperframe --format mp4 --quality high`
→ `hyperframe/density-diagram.mp4`, 2.6s, 30fps, 1080×1920.

**A bug worth recording:** the first version's "pack tighter" transform used the wrong sign —
`(col-4.5) * 22` as an *added* offset on top of the grid's native 80px pitch, which spread the
dots further apart instead of packing them, precisely backwards from the intent. Only visible by
rendering it and looking — the arithmetic reads plausibly right until you see the dots poking
outside their own labeled band. Fixed by computing each dot's target pitch directly (40px for
the packed group, 90px for the spread group) and deriving the transform as the delta from the
original 80px position, rather than treating the multiplier as free to guess.

## Editing timeline

| Track | Contents |
|---|---|
| V1 | Hyperframe clip (S00) → GeoMotion frame sequence (S01–S07), concatenated — not alpha-composited. S00 has nothing to composite under it; it's the first thing on screen, so a hard concat is simpler and exactly as correct as a dissolve would be less correct (a dissolve between a diagram and a globe would blur the match cut the Editor's note asked for). |
| A1 | Narration, 8 segments, placed at measured start times (see `schedule.json`) |
| A2 | Music bed — same layered synth approach as v1 (sub-bass pulse + a texture that arrives once, not an automated filter sweep) |
| A3 | SFX — CC0 pack, one cue per beat arrival, not one per second |

Pacing: 8 beats in a target ~32–36s — one new visual idea roughly every 4–5s, denser than v1's
~5.7s/beat average, because v1 had 7 narration beats but only 5 genuinely distinct visual
states (three of the four country stops were the same shot re-skinned).

## What v2 does not attempt

- **No literal pixel morph** from the Hyperframe dots into the GeoMotion map. A match cut — the
  two frames share a compositional position, not a continuous deformation — is the honest
  version of "semantic transition" achievable across two independently-rendered engines without
  extensive manual frame-by-frame alignment. Recorded here so the changelog doesn't overclaim.
- **No day/night terminator, no second Hyperframe insert.** One unforgettable visualization,
  per the brief's own instruction to prefer one strong moment over several diluted ones.
