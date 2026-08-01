# Map contexts

**Status:** landed — basemap, terrain, projection and layer visibility switch per story
block; the camera default applies where a block is not keyframed. **Projection is applied**
for a whole-film globe, with a documented limitation when basemap *and* projection change
mid-film — see below.

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

## Projection: applied, one sequence still crashes

`MapContext.projection` is in the document, resolved, and applied by `MapCanvas` in two
places:

- **The `style.load` handler** re-applies the projection against the style that just
  finished loading. This is the safe seat: applying there never rides a half-built style.
- **The `projection` subscription** re-applies on a pure projection change.

MapLibre 5.24 still throws from inside its own next frame when the projection changes
*after* a `setStyle` — a story that switches basemap and then asks for the globe, where
`style.load` has already set `mercator` against the old style and `setStyle` and
`setProjection` land in the same frame, throws
`TypeError: Cannot read properties of undefined (reading 'signal')`. Isolated to that
pair: a globe context alone is clean, a basemap switch alone is clean, the two in
sequence still throw.

Three guards were tried and none held, because the throw is asynchronous and lands past
where a caller's `try`/`catch` reaches:

1. `isStyleLoaded()` before calling — MapLibre reports true while its transform is still
   being rebuilt.
2. Wrapping the *read* of the current projection as well as the write.
3. Deferring the whole thing to the map's own `idle` event.

The line drawn: a globe tour — one basemap, one context, the whole film in `globe` — is
exactly the case this supports. A mid-film basemap **and** projection swap is still the
documented limitation; it waits on a fix upstream or a crossfade of our own, which §07
says raster basemaps need for projection changes anyway.
