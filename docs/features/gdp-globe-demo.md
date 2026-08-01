# The GDP-per-person globe demo

**Demo → GDP per person — globe.** The world tour's choropleth — every country coloured by
GDP per person, Natural Earth 1:110m — wrapped onto MapLibre's globe, with the camera
visiting six countries. `globeGdpTourProject()` in `apps/studio/src/lib/fixtures.ts`.

It is the meeting point of the two templates already in the file: the world tour's region
engine and the globe tour's camera. Same data, same dark basemap, same flipped-inferno
night-lights ramp; the difference is that the Earth is a ball in the frame instead of a flat
Mercator plane.

## The tour engine drives the readouts, not the camera

The automated tour frames each stop with `fitBounds`, which solves on a Mercator plane — on a
sphere that framing does not transfer. So the regions layer keeps `tour.enabled` (the phases,
the trace reveal, the dimming and the per-stop readout card all run) but sets
`driveCamera: false`, and the view is hand-keyframed like the globe tour's.

The camera follows the tour's own schedule:

- `arrive = stop + moveTime` — the camera lands on the country just as its card starts to rise.
- `depart = stop + dwell` — it holds through the dwell so the card reads against a still frame.
- The `dip` on the depart key arcs the flight over the planet's curve to the next stop.

Both keys sit on the same country, so the two-key hold is explicit; the arc rides the zoom
channel's `dip`, exactly as the globe tour's city dives do.

## The night-lights look, and why the visited country still reads

Flipped inferno on the dark basemap makes rich countries glow and poor ones sink into the
ocean — the same metaphor as the flat world tour. On the flat map a visited country is framed
to fill the viewport, so its shape carries the stop even when its fill is dark. On the globe
the visited country sits in a sea of dark ocean, so the demo gives the active region a heavier
white outline (`highlightWidth: 5`); the white trace around the country plus the card is what
makes "we are at Ethiopia" read.

## Files

- `apps/studio/src/lib/fixtures.ts` — `globeGdpTourProject()`
- `apps/studio/src/lib/fixtures.test.ts` — the context is globe for the whole film, the stops
  resolve to real countries with real values and run west to east, the camera settles on each
  country when its card reads
- `apps/studio/src/lib/headless.ts` — `loadDemo('globe-gdp')`, so the render harness can drive it
- `apps/studio/src/lib/dump-globe.test.ts` — dumps both globe demos to `/tmp` for the pipeline
