# The globe tour demo

**Demo → Globe tour.** The Earth as a sphere — MapLibre's globe projection — with the camera
flying between four cities. `globeTourProject()` in `apps/studio/src/lib/fixtures.ts`.

It exists to exercise `MapContext.projection` end to end, which nothing else does. Until this
demo, `projection` was carried in the document and resolved but deliberately **not** applied
(see `map-contexts.md`); the globe tour is the case that is safe to apply.

## The whole film is one globe context

A story block owns the context for the full duration, and the context sets `projection:
'globe'`. Nothing else in it changes — the basemap stays `satellite-labels` and terrain stays
off.

That shape matters: the MapLibre crash (projection change riding a `setStyle`) is isolated to
a basemap *and* projection change in sequence. A single-context globe film never builds that
sequence, so `MapCanvas` applies the projection from the `style.load` handler and the
`projection` subscription. Mid-film basemap + projection swaps remain the documented
limitation.

## Space is black, and that took two fixes

MapLibre's globe draws the sky as a style-level setting. Two things had to happen for space to
read as space:

**A dark sky for the globe.** `MapCanvas` now carries three sky constants. Flat terrain keeps
a daylight sky (dark or light to match the basemap); the globe always gets `SPACE_SKY`, a
near-black blue with `atmosphere-blend: 0.25`. From orbit the planet is what is bright; the
sky behind it is black. The atmosphere at 0.25 keeps a thin limb glow on the day side instead
of a hard disc edge.

**The draft encoder fills its capture canvas first.** The in-page encoder (`render-encoded.mjs`)
draws the WebGL canvas into a 2D canvas, and `VideoFrame` reads WebGL-drawn transparent
pixels — the space around the globe — back as bright. The draft now fills the canvas with the
same near-black before drawing, matching what the frame path already composited against the
stage background.

## The shot list

Intro rotates the whole sphere slowly, clouds part to reveal it, then each stop is a pitched
dive (zoom 4.3, pitch 55) with an arc between cities, and the outro pulls back out to the
whole sphere.

The clouds are the one layer that had to be re-tuned: at full coverage they fill the **whole**
overlay — including the space around the planet — so the reveal was leaving a grey haze in
space well into the first dive. The clear window was tightened to 1.4–3.8 s so space is dark
again before the camera leaves the intro.

The camera is framed the way a globe tour should be: far enough out that the planet never
fills the frame and the dark space reads as space, close enough that each city dive still
lands with a marker pulse on the skyline.

## Files

- `apps/studio/src/components/MapCanvas.tsx` — globe projection applied from `style.load` and
  the `projection` subscription; the three sky constants
- `apps/studio/src/lib/fixtures.ts` — `globeTourProject()`
- `apps/studio/src/lib/fixtures.test.ts` — the context is globe for the whole film, the stops
  resolve, the camera keys every stop
- `apps/studio/src/lib/headless.ts` — `loadDemo('globe')`, so the render harness can drive it
- `apps/pipeline/lib/render-encoded.mjs` — the draft encoder fills a dark capture background
