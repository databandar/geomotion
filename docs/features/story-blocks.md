# Story blocks

**Status:** M1 landed — blocks in the document, written by the composer, shown on the
timeline.

**Governing sections:** v2 design §10 (scenes, storytelling & timeline), §01 (first
commitment), §00 ("the frozen voice bed"). ENGINEERING_GUIDE §3.8 (new top-level
section), §3.6.3 (additive change).

## The problem

The design document's first commitment is *"Everything stays editable. No bake step, no
'generated then flattened.'"* The app's primary authoring path broke it.

`compose` thinks in beats — clouds, outline, overview, tour, labels — and then flattens
them into a bare list of layers. `video.mjs` used the beats for a console listing and the
subtitle file, and the structure that produced the video never reached the document. So a
beat could not be retimed, and re-running the composer discarded every hand edit made
since. That is §00's frozen voice bed one level up: the same failure, applied to
structure rather than to audio.

## The shape

A block is a stretch of time owning a narration line and knowing which layers it
choreographs.

- **Ids, not indices or nesting**, for `nodes` — a block survives layers being reordered,
  and one layer can belong to two blocks, which a title spanning a beat boundary
  ordinarily does.
- **`say` is the text, not the audio.** The measured duration lives on the audio cue. The
  line is what a person writes; the measurement is what the voice engine returns.
  Conflating them is how v1 could not re-record without re-timing everything.
- **`kind` records which beat produced a block**, so a re-compose can recognise its own
  work rather than appending a second copy. Absent on a hand-made block — which is the
  signal the composer must leave it alone.
- **A tour is one block**, not one per stop. It is a single narrative beat that visits
  several regions; splitting it would make retiming mean retiming six things that have to
  stay adjacent.
- **`[t, t + d)`**, half-open, so two adjacent blocks never both claim the instant they
  share.

## Why a new top-level section

§3.8 makes this ADR-level. Story structure is not a property of any layer — a block
choreographs several — and it is not derived: "these three layers belong to this
sentence" is a judgement, not a calculation. Entities and assets are the only other
top-level sections, and this is the same kind of thing: a table the rest of the document
refers into.

**Additive, so no format bump.** §3.6.3 — a new optional field whose absence means the
default. Every existing project has no story, which is exactly what a project built layer
by layer is.

## Two bugs found on the way

The story lane went into the track area *before* the camera row while its gutter label
went after, so blocks rendered one row too high. Caught by looking at it.

And the audio lane had **no positioning rule at all** — `.voice-row .cue` set only
`cursor`, so the `left` and `width` the component computes went nowhere and the chips
stacked in normal flow. A project with six narration lines spilled its whole script down
over three layer rows. Invisible with one short cue, which is why it survived this long.

## Not yet

Ripple (M2) — a block is inert until dragging it moves what it choreographs. Until then
blocks are a faithful record and a visible structure, but not yet an editing surface.
