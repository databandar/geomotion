# Map contexts

**Status:** landed — basemap, terrain and layer visibility switch per story block; the
camera default applies where a block is not keyframed. **Projection is carried in the
document but not yet applied** — see below.

**Governing sections:** v2 §04 (scene graph, map context), §10.

## What this is instead of

§04 puts the map context inside a scene, which also owns cameras, layers and audio. Story
blocks turned out to carry most of what scenes were wanted for — narrative structure,
ripple, a storyboard, a round trip — so the container is postponed and only the part with
no other home is built: **what the map looks like during a stretch of time**.

## Compatible with scenes arriving later

Contexts are a **top-level table keyed by id**, and a block *references* one.

- Two blocks can share a context — a tour that returns to the same view.
- A scene container, if one is ever added, references a context by the same id with
  nothing here moving.
- Had a block owned its context inline, adopting scenes would mean a migration guessing
  which inline copies were meant to be the same thing.

**Partial override.** A context names only what it changes; everything else falls through
to the project. That keeps a context that switches the basemap down to three fields, and
it is the same merge a scene would use, so the rule does not have to change either.

**The camera is a default, never an override.** It applies only where no camera keyframe
falls inside the block. Keyframing is deliberate authoring, and a default that beat it
would make the timeline lie: the diamond says one thing, the map another.

**Hidden, not deleted.** A layer held back by a context still belongs to the composition
— it is this stretch of it that wants the layer gone, like a reference map during a
close-up.

## Projection: carried, not applied

`MapContext.projection` is in the document and resolved, and deliberately **not** applied.

MapLibre 5.24 throws from inside its own next frame when the projection changes after a
`setStyle` — which is exactly what a story that switches basemap and then asks for the
globe does. Isolated to that pair: a globe context alone is clean, a basemap switch alone
is clean, the two in sequence throw
`TypeError: Cannot read properties of undefined (reading 'signal')`.

Three guards were tried and none held, because the throw is asynchronous and lands past
where a caller's `try`/`catch` reaches:

1. `isStyleLoaded()` before calling — MapLibre reports true while its transform is still
   being rebuilt.
2. Wrapping the *read* of the current projection as well as the write.
3. Deferring the whole thing to the map's own `idle` event.

Shipping it would mean an uncaught error on an ordinary edit, and the CI render job
rightly treats a page error as a failure. The field stays in the document so projects can
carry it and nothing has to migrate when it works; applying it waits on a fix upstream or
a crossfade of our own, which §07 says raster basemaps need for projection changes anyway.
