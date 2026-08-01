# The world tour demo

**Demo → World tour.** 176 countries coloured by GDP per person, with the camera visiting nine
of them. `worldTourProject()` in `apps/studio/src/lib/fixtures.ts`.

It exists to exercise the region tour at the opposite end of its range from the India fixture,
which is where the interesting differences are.

## It tours nine of 169, not all of them

The India film tours **every** region it colours — 37 states, one after another. The world
cannot: 169 countries at 2.6 s each is seven minutes of video.

`order: 'custom'` is what makes that possible. `customOrder` picks the stops *as well as* their
order, so everything gets a colour and a rank while the camera visits a chosen few.

The nine run west to east — Americas, Europe, Africa, Asia, Oceania — so the camera makes one
circuit of the globe instead of teleporting between whichever countries happen to rank next to
each other.

`customOrder` resolves by name and **silently drops** what it cannot find. A country spelled the
way an atlas spells it rather than the way Natural Earth spells it is a missing stop, not an
error — the film just gets shorter and skips a continent. `fixtures.test.ts` checks all nine
resolve and all nine have values.

## The data

Both the geometry and the numbers are **Natural Earth 1:110m Admin 0 Countries**, public
domain. Unlike the India fixture — whose anaemia figures are invented sample values, flagged as
such — there is nothing made up here. GDP per person is `GDP_MD / POP_EST`, both fields as
published, mostly 2019 estimates.

Spot-checked against reality: United States $65,298, Switzerland $81,994, Burundi $261.

Natural Earth is a *cartographic* dataset that happens to carry these attributes, not an
economic one. Fine for a demo; not a citable source, which is what the data file's `_note`
says.

### Who gets a value

169 of the 176 countries. Left out: territories (`TYPE` of `Dependency` or `Indeterminate`) and
anywhere under 100,000 people.

The population floor is there because a per-person figure over a few thousand residents is an
artefact rather than a measurement — the Falkland Islands' 3,398 people give it a GDP per
person above Switzerland's, and it would have led any "richest" ordering.

The first attempt filtered on `TYPE in ('Sovereign country', 'Country')`, which looked
principled and quietly dropped **Kazakhstan, Cuba and Israel** — Natural Earth files those as
`Sovereignty` and `Disputed`. Excluding what is actually being excluded works better than
whitelisting what looks canonical.

Antarctica is dropped from the geometry too: uninhabited, so it has no GDP per person, and it
fills the bottom of a Mercator frame.

## Three things that needed tuning, and why

**The colour scale is capped at $46,000, not automatic.** GDP per person is log-distributed —
median about $5,500, maximum $114,703. On a linear ramp to the true maximum, two-thirds of the
world sits in the darkest tenth of the scale and Africa, South Asia and South America are one
indistinguishable black. Capping at the 90th percentile spends the ramp where the countries
are. The stops still read their real values; only the colour saturates. The caption says the
scale is capped so the legend's top label cannot be read as the maximum.

The engine has no log or quantile scale — only a linear `min`/`max` domain. A capped domain is
working within that, not around it.

**`maxZoom` is 5.5 and `padding` is 0.14.** The defaults (8 and 0.22) framed every stop from so
far out that India arrived with the whole of Asia and half of Africa in shot — at zoom 4.2 the
frame is 155° of longitude wide. Tighter padding also helps the overview, below.

**Switzerland, not Norway.** Norway ranks higher and was the first choice. Natural Earth's
Norway includes Svalbard, so its bounding box reaches 80°N: framing it puts the camera over
Greenland with mainland Norway a sliver at the bottom edge. Switzerland is compact, ranks #2,
and frames western Europe.

## The opening titles have a scrim; India's do not

India opens over satellite imagery, which is dark everywhere. This one opens over the
choropleth itself, and the bright end of the ramp runs straight through where the title sits —
white on pale yellow across Europe is unreadable. `background: true` on both text layers.

## A limitation worth knowing

**The overview beats show a sliver of the next world copy at the frame edges.**

This is structural, not a bug in the fixture. Fitting 360° of longitude into 16:9 is always
bound by height, so the world never quite fills the width: a 1920-wide frame would need to be
about 1250 tall for the fit to come out even. Tightening `padding` reduces it — it went from
roughly two and a half world copies to slivers — but cannot remove it.

`renderWorldCopies: false` on the map would remove it and is deliberately **not** set: the
Trans-Pacific demo's route runs from San Francisco to Tokyo across the antimeridian, and
without world copies that line is drawn the long way round the map.

It only affects the intro and outro. Every tour stop is framed on one country.

## Files

- `apps/studio/src/data/world-countries.json` — 176 countries, `name`/`iso`/`continent` only,
  coordinates at 3 decimals (~100 m, plenty at world scale). 184 KB.
- `apps/studio/src/data/world-gdp-per-person.json` — the metric, with its `_note` and `_source`
- `apps/studio/src/lib/fixtures.ts` — `worldTourProject()`
- `apps/studio/src/lib/fixtures.test.ts` — the stops resolve and have values
- `apps/studio/src/lib/headless.ts` — `loadDemo('world')`, so the render harness can drive it
