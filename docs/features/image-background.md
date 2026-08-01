# Keying a background out of an uploaded image

**Design-doc section:** VISION §01 ("everything stays editable — no bake step"), §02 (never a
dialog; every number scrubs), ARCHITECTURE §11 (assets) ·
**Owner package(s):** `@geomotion/core`, `@geomotion/document`, `apps/studio` ·
**Status:** shipped — stage A

## Problem

An image dropped on the map arrives with its background. A flag, a logo, a chart or a
screenshot on flat white sits in a white rectangle over the terrain, and the only fix today is
to leave the editor, open something else, and come back.

## What this is, and what it is not

**It is a colour key flooded in from the border.** That handles logos, flags, charts,
diagrams, screenshots — most of what goes into a map video.

**It is not a matte.** It cannot separate a person from a park, and it does not pretend to:
`removeBackground` returns how much it removed and a `warning` when the result looks wrong,
and the panel prints that instead of presenting a bad cut-out as a good one.

A real matte (a small U²-Net through `onnxruntime-web`) is stage B. It needs a new runtime
dependency and a model file, so per §13 it needs an ADR before any code — which is exactly why
it is not bundled into this change.

## Two decisions worth the words

**Flooded from the border, not keyed globally.** "Remove every white pixel" also removes the
white *inside* a logo — the counter of an O, the highlight on a chart — and the shape renders
with holes over the map. Only background connected to the edge is background; everything the
subject encloses belongs to the subject. That is one flood fill instead of one threshold, and
it is the difference between the feature working and looking broken.

**The seed is the median of four corners, not one.** A single pixel can be a compression
artefact or a stray mark. Four corners disagree honestly when the background is not flat, and
the median of them is stable against one outlier.

## Document model

**No format bump.** Three additive fields, filled by `coerceToDefaults` on load like any other
default:

```ts
srcOriginal?: string;   // the upload before keying — absent until it is applied
bgTolerance: number;    // how close to the border colour counts as background, 0..1
bgFeather: number;      // softening at the cut, in pixels
```

`srcOriginal` is what makes this **non-destructive**. The tolerance stays re-tunable and
"Restore original" is exact rather than approximate. §01's first commitment is that everything
stays editable, and pixels you have thrown away are a bake step by another name.

Re-applying always keys **from the original**, never from the already-keyed result — otherwise
each re-apply eats another slice of the subject.

## Where the code lives

`removeBackground` is in `@geomotion/core`: pure, DOM-free, deterministic, takes pixels and
returns pixels. It is unit-testable without a canvas and could move to a worker unchanged.

The DOM half — decode, run, re-encode to a PNG data URL — stays in the app, because it is the
app that owns a canvas.

## UX

A **button**, not a live slider. Keying re-decodes the whole bitmap, so a slider wired
straight to it would re-run the flood on every pointer move. The two generated rows set
tolerance and feather; the button applies them; the result says what it did:

> Removed 64% of the image.
> …or: *almost nothing was removed — the background may not be a flat colour*

**A cross-origin image gets a real explanation.** Reading pixels from another site's image
throws a `SecurityError`, and the panel says "download it and pick the file instead" rather
than "could not read that image".

## Tests

`packages/core/src/background.test.ts` — 10, written as pictures in characters so the test
reads as the thing it tests:

- a flat background removed, the subject kept, the fraction correct;
- **an enclosed hole surviving** — the case that separates this from a threshold;
- background reached round a concave corner;
- tolerance deciding whether a near-white pixel is noise or content;
- the two warnings, on a photograph and on an all-background image;
- the input never mutated, and the same input always giving the same output.

Verified end-to-end on a real 200×200 bitmap — a red square with a white hole on white: 64%
removed, outside transparent, subject opaque, **hole intact**.

### Found on the way

`exactOptionalPropertyTypes` will not let an optional field be written as `undefined`, which
is the right rule: "restore" must *remove* `srcOriginal`, not blank it, because absent is what
"never keyed" means and what both the button label and the re-apply source read.

## Future extensions

- **Stage B: a real matte** behind an ADR — `onnxruntime-web` plus a quantised U²-Net (~4.7 MB).
- **A preview before applying**, so tolerance can be judged without a round trip.
- **Pick the key colour** by clicking the image, for a background the corners do not represent.
