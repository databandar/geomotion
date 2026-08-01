# The painted-world pilot: "the world painted by income"

**Demo → Painted world.** The series opener: the same night-lights globe, but instead of a
tour that travels the planet it *climbs a ladder* — the richest country on Earth to the
poorest, with a card and a story line at each rung. `paintedWorldProject()` in
`apps/studio/src/lib/fixtures.ts`.

This is the film that introduces the channel's premise, so the intro is the brand: clouds,
a title, and the world painting itself on — every border tracing in while the legend washes
in. Then four stops, one surprise:

- **Luxembourg** — #1, $114,703, "the richest country on Earth is smaller than most cities"
- **Switzerland** — #2, $81,994, "number two — banks, chocolate, watches"
- **The United States** — "you'd bet on first. it's sixth."
- **Burundi** — #169, $261, "the bottom of the scale"

It closes on the world painted, over the line *"One planet, very unequal."*, and teases the
next paint (*life expectancy*) — the hook that makes the series a series.

## A ranked walk needs longer dwells

The plain GDP globe tour visits six countries at 2.2 s each; a ranked walk wants the gap
between rungs to land, so the dwell here is 3.0 s and the tour runs `intro: 8`. Everything
else is the established globe grammar: `tour.enabled` with `driveCamera: false`, the camera
hand-keyframed to the tour's own `arrive`/`depart` times, a `dip` on each depart key.

## The poorest country is the hardest shot

On flipped-inferno a country earning $261 a year is `#000004` — indistinguishable from the
ocean. That is the look's whole point, but it means the final stop cannot lean on its fill.
Two things carry it instead: the camera dives to zoom 7 (Luxembourg, the other tiny country,
gets 6.2; the continents get ~4.5) so the country is large in frame, and the active outline
is heavier (`highlightWidth: 6`). The beat is the white trace around the dark country plus
the card reading "$261". The richest country glows; the poorest is literally in the dark.

## The outro is the money shot

The reference film pulls back to a wide globe whose paint is a thin film over mostly-dark
ocean. For a series opener the outro should *show the world painted*, so the pull-back ends
on the Atlantic view (`[-15, 20]` at zoom 2.6) — Europe and the Americas filling the frame
bright, Africa receding into the ocean.

## Files

- `apps/studio/src/lib/fixtures.ts` — `paintedWorldProject()`
- `apps/studio/src/lib/fixtures.test.ts` — live globe context, the four stops resolve to
  real countries with real values and climb the ladder richest-first, the camera settles on
  each rung when its card reads
- `apps/studio/src/lib/headless.ts` — `loadDemo('painted')`
- `apps/studio/src/lib/dump-globe.test.ts` — dumps the fixture to `/tmp` for the pipeline
- `apps/pipeline/out/painted-world-draft/` — draft render (960×540 @ 15fps)
