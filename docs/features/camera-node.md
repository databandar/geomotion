# The camera is a node

**Status:** landed — per-channel tracks in the document, the shot row derived, format 6.

**Governing sections:** ARCHITECTURE §04 ("cameras observe the scene, they do not
contain it"; every property is a track), §09 (a camera is a node with tracks; a rig is
a behaviour stack on it). ENGINEERING_GUIDE §3.6 (the format chain), §3.8.

## The problem

The camera was the last part of the document that was not an object. Everything else a
user touches — layers, story blocks, contexts, cues — has identity and sits in a named
place; the camera was an anonymous array of whole-camera rows, each keyframe carrying
`center`, `zoom`, `bearing`, `pitch`, `easing` and `dip` together. That shape was
wrong in three ways the design doc calls out:

- §04 fixes every property as a track; the camera had *row* keyframes, so a channel
  could not be animated, bound or expression-driven on its own, and the evaluator had
  to project the rows into tracks on every edit (the `cameraTracks` seam, which its own
  comment described as proving the evaluation "until the document shape changes").
- §09 gives the camera a **rig** — an ordered stack of camera-specialised behaviours —
  and a rig needs a node to live on. An array has nowhere to hang it.
- The flat node store (Decision 01) is a tree of nodes; the camera was the one thing in
  the document that could never become one.

## The shape

```ts
CameraNode {
  id, type: 'camera', name,
  tracks: { center: Track<LngLat>, zoom: Track<number>,
            bearing: Track<number>, pitch: Track<number> },
  behaviours: BehaviourStacks,   // the rig's home (§09); empty until that milestone
}

project.cameras: CameraNode[]    // the first is live; the switcher track is §04-later
```

The array anticipates §04's multiple cameras without another format bump; until the
switcher track exists the live camera is the first, stated here rather than emergent.

## The row is a view, not storage

The editor's camera UX is shot-centric — one diamond on the timeline, one inspector
panel, carrying all four channels plus easing and arc together. That is a good model
and it stays, but as a *derived* view: `shotsOf(camera)` groups channel keys by their
shared id back into rows, and `upsertShot` / `patchShot` / `removeShot` write a row
across the four channels atomically. Nothing in the document stores a row, so the two
cannot disagree. `CameraKeyframe` survives as the name of that view — the DTO the
inspector, timeline and store already spoke.

Per-channel key editing (animating zoom alone) is deliberately *not* exposed yet; every
write path today is atomic, so the four channels always share key ids. When per-channel
editing arrives, keys that no longer line up simply stop forming a row — the view
reports what is there rather than forcing a grid onto it.

## The arc (`dip`) stays per-segment

A shot's arc is segment metadata like easing: "the move leaving this key pulls the zoom
back by this much". It rides the zoom channel's keys as an optional `dip` — the only
channel it acts on — absent when zero, so files carry it only where someone set one.
§09 will absorb it into the rig as `zoomEnvelope`; keeping it on the key until then is
what makes this milestone a pure reshape with zero behavioural change, which the golden
frames verify.

## Migration

Format 6. `5-to-6` converts the rows into one camera node — filling row defaults first,
which is a migration's job, and dropping the old `camera` key rather than leaving two
fields meaning the same thing (§3.6.4). Corrupt rows (no finite centre, no finite time)
are dropped rather than crashing a load. A frozen format-6 fixture joins the chain, and
the CLI composer's format-5 output flows through the same migration on load — the
importer contract is the compatibility story, not a second writer in the pipeline.

## Decisions worth recording

**No projection seam in the evaluator.** `cameraAt` reads the node's tracks directly;
the `cameraTracks` cache and its WeakMap are deleted. Evaluation got *simpler* by the
document getting *more honest*, which is the direction the flat store is supposed to
pay in.

**Per-channel fallback is the whole "empty" story.** There is no "camera has no keys"
branch any more. No camera node → `DEFAULT_CAMERA`; a channel that cannot produce a
value falls back to its `DEFAULT_CAMERA` component. A static centre with a keyframed
zoom — impossible to express in rows — now just works.

**The centre channel is canonical.** A shot is meaningless without a place, so the row
view walks the centre keys and looks siblings up by id.

## Not yet

The rig itself (the `behaviours` map is declared and serialised but nothing evaluates
it). Multiple live cameras and the switcher track. Per-channel camera editing in the
UI — the tracks support it the day a control wants it. `roll` (§09) — a compositor
effect, and the compositor is its own milestone.
