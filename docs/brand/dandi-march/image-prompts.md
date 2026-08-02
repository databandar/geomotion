# Image inserts for "The Walk That Broke an Empire"

A plan for adding Flux-generated images, written before any image exists — which beats earn
one, what each should show, and the exact prompt to generate it. Not implemented yet: this is
the planning pass the `map-video-production` skill's own discipline calls for before spending
render time. Wire-up happens after the images exist, using GeoMotion's native `image` layer
(`packages/document/src/schema/layers.ts:475` — a bordered, shadowed card with `x`/`y`/`width`/
`anchor` placement and a slow push-in, not a full-screen swap).

## The style call, and why

DataBandar's whole visual identity so far — every episode, no exceptions — is flat, vector,
schematic: dark navy background, signal green linework, one amber accent, no photorealism
anywhere (the Hyperframe rule is explicit about this: "no photorealism, no attempt at
geography"). Dropping in photoreal or generic-AI-glossy images would read as a different show
bolted onto this one. So every prompt below asks for the *same* restricted palette and flat
illustration treatment as the map itself — this is a design system extending into illustration,
not photography breaking the spell.

**Reusable style suffix** — append to every prompt below:

```
Flat editorial illustration, poster art style, not photorealistic, not a 3D render. Restricted
three-color palette only: near-black navy background (#05070A), signal green (#22C55E) as the
primary linework and accent color, warm amber (#FFC24D) as a single secondary highlight — no
other colors, no gradients beyond subtle shading in those three tones. Bold clean silhouette
shapes, high contrast, minimal fine detail, faint grain texture. No text, no lettering, no
logos, no watermarks, no signature. No recognizable faces anywhere in the frame — silhouette,
back view, hands, or cropped/symbolic framing only. Vertical 4:5 portrait composition with
generous negative space at the edges for cropping into a rounded card.
```

Generate at a portrait ratio (4:5 or 3:4) — that's what the card placement below assumes, and
it crops more forgivingly than a square.

## Why only three beats, not seven

Sparing is the point. The map is already doing the work at every other beat — S02's route
reveal, S03's growing-crowd dots, S06's stat card all already have a strong visual moment of
their own. Adding a card to a beat that's already earning its own attention just competes with
it. The three picked below are exactly the beats that currently have *no* independent visual
hook beyond text over a static or slowly-panning map — S01 (the weakest beat in the film, flagged
in the original review pass: plain landmass under a title for over five seconds), S04 (the
actual event the whole video is named for, currently just a place name and a date), and S05 (a
number with no image beneath it). A fourth, optional one for S06 is included at the end,
lower-priority.

---

## 1. S01 — the opening hook (0.3s–5.5s)

**Why:** the weakest beat in the current cut — plain landmass, no visual reveal, for over five
seconds before anything happens. A small card appearing as the title fades in gives the eye
something concrete in those first three seconds, which is exactly the window every prior
review pass has flagged as the one that decides whether a viewer keeps watching.

**Concept:** a raised fist, salt sifting through the fingers — the film's central image (defying
a tax on salt) stated visually before a single word of narration explains it.

**Suggested placement:** `anchor: 'topLeft'`, `x: 0.08`, `y: 0.58`, `width: 0.34`, fading in with
the title (~`S.s01[0]+0.4`) and out before the S02 push-in (`S.s01[1]`).

**Prompt:**
```
A raised fist, silhouette, fingers slightly open, fine grains of salt sifting down and
catching the light as they fall through the fingers, single dramatic light source from
above-left, plain dark background, nothing else in frame.

Flat editorial illustration, poster art style, not photorealistic, not a 3D render. Restricted
three-color palette only: near-black navy background (#05070A), signal green (#22C55E) as the
primary linework and accent color, warm amber (#FFC24D) as a single secondary highlight — no
other colors, no gradients beyond subtle shading in those three tones. Bold clean silhouette
shapes, high contrast, minimal fine detail, faint grain texture. No text, no lettering, no
logos, no watermarks, no signature. No recognizable faces anywhere in the frame — silhouette,
back view, hands, or cropped/symbolic framing only. Vertical 4:5 portrait composition with
generous negative space at the edges for cropping into a rounded card.
```

---

## 2. S04 — the act (April 6, 1930)

**Why:** this is the actual event the film is named for, and right now it's a place name, a
date, and a marker — no image of the act itself. The highest-value single insert in the video.

**Concept:** cupped hands holding a small mound of salt, the shoreline soft and out of focus
behind — the moment, not a portrait of the man.

**Suggested placement:** `anchor: 'topRight'`, `x: 0.66`, `y: 0.16`, `width: 0.32` — clear of the
Dandi marker/label and the "APRIL 6, 1930" text band, which sit lower and more central.

**Prompt:**
```
Close-up of two cupped hands holding a small mound of coarse salt crystals, catching the
light, an out-of-focus shoreline and faint waves visible behind, low angle, intimate framing.

Flat editorial illustration, poster art style, not photorealistic, not a 3D render. Restricted
three-color palette only: near-black navy background (#05070A), signal green (#22C55E) as the
primary linework and accent color, warm amber (#FFC24D) as a single secondary highlight — no
other colors, no gradients beyond subtle shading in those three tones. Bold clean silhouette
shapes, high contrast, minimal fine detail, faint grain texture. No text, no lettering, no
logos, no watermarks, no signature. No recognizable faces anywhere in the frame — silhouette,
back view, hands, or cropped/symbolic framing only. Vertical 4:5 portrait composition with
generous negative space at the edges for cropping into a rounded card.
```

---

## 3. S05 — the consequence (60,000+ jailed)

**Why:** the biggest, starkest number in the film currently has nothing under it but a map of
India. An image here carries the human weight the stat states but doesn't show.

**Concept:** rows of silhouetted figures standing behind tall bars — mass imprisonment, stated
plainly, not graphically. No violence, no individual faces, no gore — the scale is the point.

**Suggested placement:** `anchor: 'topLeft'`, `x: 0.08`, `y: 0.22`, `width: 0.34` — the "60,000+
JAILED" text sits at `y: 0.79`/`0.865`, so the card lives entirely above it.

**Prompt:**
```
Rows of silhouetted human figures standing shoulder to shoulder, viewed straight-on, behind
tall evenly-spaced vertical bars that fill the foreground, the figures rendered as flat solid
silhouettes with no facial or clothing detail, plain dark background.

Flat editorial illustration, poster art style, not photorealistic, not a 3D render. Restricted
three-color palette only: near-black navy background (#05070A), signal green (#22C55E) as the
primary linework and accent color, warm amber (#FFC24D) as a single secondary highlight — no
other colors, no gradients beyond subtle shading in those three tones. Bold clean silhouette
shapes, high contrast, minimal fine detail, faint grain texture. No text, no lettering, no
logos, no watermarks, no signature. No recognizable faces anywhere in the frame — silhouette,
back view, hands, or cropped/symbolic framing only. Vertical 4:5 portrait composition with
generous negative space at the edges for cropping into a rounded card.
```

---

## 4. (Optional, lower priority) S06 — Time's Man of the Year

**Why it's optional:** S06 already has a clean text callout and a India-context map behind it —
it's not an underserved beat the way S01/S04/S05 are. Include only if the film feels like it
needs a fourth beat of visual variety after the first three are in.

**Guardrail:** do not ask Flux to reproduce the real TIME masthead, its red border, or its logo
— that's a trademark, not a style reference, and a "close but not exact" recreation is still an
infringement risk. Keep it abstract: a blank frame and a light, not a magazine.

**Concept:** an empty cover-shaped frame lit by a single spotlight — recognition, stated
symbolically, with nothing that reproduces a real publication's design.

**Suggested placement:** `anchor: 'topRight'`, `x: 0.66`, `y: 0.16`, `width: 0.30`.

**Prompt:**
```
An empty rectangular frame, like a blank magazine cover mockup with no text, image, or logo
inside it, a single sharp spotlight beam falling on the blank frame from above, otherwise
plain dark background, the frame slightly off-center.

Flat editorial illustration, poster art style, not photorealistic, not a 3D render. Restricted
three-color palette only: near-black navy background (#05070A), signal green (#22C55E) as the
primary linework and accent color, warm amber (#FFC24D) as a single secondary highlight — no
other colors, no gradients beyond subtle shading in those three tones. Bold clean silhouette
shapes, high contrast, minimal fine detail, faint grain texture. No text, no lettering, no
logos, no watermarks, no signature. No recognizable faces anywhere in the frame — silhouette,
back view, hands, or cropped/symbolic framing only. Vertical 4:5 portrait composition with
generous negative space at the edges for cropping into a rounded card.
```

---

## Once the images exist

Drop the files in `docs/brand/dandi-march/assets/` and I can wire each in as an `image` layer
in `build-project.mjs` at the placements above, render a spot-check at each beat, and adjust
position/size against how the actual image looks next to the map and text — the coordinates
above are a starting point, not a guarantee, the same way every camera zoom in this project was
tuned against a real render rather than a formula.
