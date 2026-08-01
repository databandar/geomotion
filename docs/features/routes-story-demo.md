# The routes-as-stories pilot: "the long way home"

**Demo → Long way home.** The other half of the series' vocabulary: where the painted-world
films colour a static globe, these move through it. One great-circle flight — San Francisco,
Tokyo, Dubai, London, New York — told as a journey. `routeStoryProject()` in
`apps/studio/src/lib/fixtures.ts`.

A plane marker rides a geodesic as it draws on around the world; the camera dives to each
city the moment the plane arrives; a pulsing ring and a caption tell the leg that just
happened. It closes on the lesson the whole format is built on: *"the shortest path between
two cities is a curve."*

## The journey is timed by the geometry itself

`progress` sweeps 0→1 over a fixed window, and the marker rides the cumulative great-circle
distance, so each arrival time is `journeyStart + journeyTime × (distance-so-far ÷ total)`.
The camera keys and the captions are both computed from those arrival times — the plane and
the camera can never drift apart, because both come from the same maths. `arrival(i)` is the
only source of truth; the marker layers derive their `in` from it too.

## Two things the flat demo didn't have to think about

- **The route outlives the flight.** The Trans-Pacific demo fades its route at the same time
  it finishes drawing; a five-leg journey has to keep the line on screen for the whole
  flight, so `out: duration` is set explicitly. The layer base's `in + 6` default would cut
  the line off over the Indian Ocean.
- **Geodesics cross the antimeridian.** Tokyo→Dubai→London→New York walks longitude past
  −180, so the built path's coordinates run past the seam. MapLibre renders the wrap fine on
  the globe, and the head marker projects back onto the right meridian.

## Files

- `apps/studio/src/lib/fixtures.ts` — `routeStoryProject()`
- `apps/studio/src/lib/fixtures.test.ts` — live globe context, one geodesic route, the
  camera keys to the plane's arrival at each city, a marker and a caption per city
- `apps/studio/src/lib/headless.ts` — `loadDemo('routes')`
- `apps/studio/src/lib/dump-globe.test.ts` — dumps the fixture to `/tmp` for the pipeline
- `apps/pipeline/out/route-story-draft/` — draft render (960×540 @ 15fps)
