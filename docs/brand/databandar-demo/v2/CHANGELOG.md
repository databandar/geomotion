# v1 → v2 changelog

Every change below exists because a specific weakness was found by watching the actual render
— see `REVIEW.md` for the critique and the panel notes, `REDESIGN.md` for the plan. This is the
record of what shipped and why each change earns its place.

## Structural

**Cold open replaced.** v1 opened on a static, tiny, dark globe for 3+ seconds — no motion, no
number, title text overlapping the globe's rim. v2 opens on a Hyperframe density diagram,
already resolving, with the first spoken word inside the first second. *Why it's better:* the
brief's "wait, what?" test needs an unresolved, surprising *image* in frame 1, and a place
cannot do that — a ratio, rendered as a shape nobody expects, can.

**One continuous camera path, not four resets.** v1's camera returned to nearly the same idle
framing before every one of four country stops — "world / zoom / stat / world / zoom / stat,"
named directly in the brief as the pattern to avoid. v2's camera never repeats a framing between
S01 and S06; the one reset in the film is reserved for the final button. *Why it's better:* a
repeated pattern is legible after the second repetition, and a viewer who can predict the next
shot has already started planning to leave.

**A real semantic transition.** v1 cut between locations with no transition device at all. v2's
Hyperframe clip ends on a tight glowing cluster occupying roughly the same frame position the
globe's landmass occupies the instant the cut lands — a match cut, not an arbitrary one. *Why
it's better:* the cut itself now carries meaning (this abstract idea *is* a real place) instead
of just changing the subject.

**A geographic comparison GeoMotion draws, not a line of narration.** v1's Netherlands beat was
narrated as a comparison ("not just South Asia...") with nothing on screen connecting it to
Bangladesh. v2 draws an actual arc between the two countries, visible as the camera travels from
one to the other. *Why it's better:* "the brief asks GeoMotion to own geographic comparisons" —
this is that, replacing a sentence with a shape.

## The basemap (the single largest fix)

**Every default label removed.** v1 covered every zoomed-in shot in default place names —
country names, city names, sub-national regions (Normandy, Bavaria, Saxony-Anhalt) — competing
directly with the callout cards and, at the closing statistic, with the film's entire thesis.
v2 uses a new basemap (`dark-clean`, `packages/map/src/styles/dark-clean.json`) with all 27
symbol/label layers stripped from the upstream CartoDB style, tested to guarantee it stays that
way (`basemaps.test.ts`). *Why it's better:* every frame now shows exactly what was deliberately
added and nothing else — which is the "clean cinematic basemap" requirement stated directly, and
independently the single biggest visible quality jump between the two cuts.

## Hyperframe — new, not present in v1

**One diagram, built for the one idea a map cannot show.** v1 stated its thesis ("half of
people, 13% of land") only as narration plus a number. v2 opens on a 100-dot density diagram —
50 dots packed into a tight glowing cluster, 50 spread wide across the same grid — that shows
the ratio as a shape before any geography appears. *Why it's better:* this is the brief's
"unforgettable explanatory visualization" requirement — an idea a static image or a sentence
could not carry as directly as a shape whose only variable is density.

**A real bug, caught by rendering it.** The first version of the diagram's "pack tighter"
transform used `(col-4.5) * 22` as an *added* offset on top of the grid's native spacing —
which spread the dots further apart, precisely backwards from the intent. The arithmetic read
plausibly right until the render showed dots poking outside their own labeled band. Fixed by
computing each dot's *target* pitch directly and deriving the transform as a delta from the
original position, rather than guessing a multiplier's sign.

## A real engine bug, found and worked around by design

**The hard-cut ending, and why v1 never had one.** Every GeoMotion layer fades out over its own
`fade` duration as it nears its `out` time — including a layer whose `out` happens to be the
project's final frame, which quietly turns "ends at the last frame" into "fades to black exactly
as the video ends." v1's closing hold was genuinely fading, not a design choice — checked by
extracting the actual last frame of the actual render, where the whole scene had visibly dimmed.
v2 pushes every closing layer's `out` past the visible timeline (`EDGE = DUR + 3`) so nothing has
begun fading by the time playback stops. *Why it's better:* the panel's one non-negotiable note
was a hard cut, not a fade — and it's now verified against the literal last frame of the shipped
file, not assumed from the layer list.

## Narration

**89 words → 69, one fewer beat.** v1's separate claim line ("Half of them are standing on just
thirteen percent of the land") is gone — that idea now lives entirely in the Hyperframe visual,
so saying it before showing it would be telling the audience what they're about to see instead
of letting them see it. *Why it's better:* "remove unnecessary narration, compress wherever
possible" — every remaining line does work no other line or visual is already doing.

**The closing line changes what it does, not what it says.** v1 ended with "The other half of
humanity has the remaining eighty seven percent to itself" — a restatement. v2 ends with "Half
of us. One-eighth of the Earth" over on-screen text that echoes the *opening* diagram's own
words, closing the loop the structural change opened. *Why it's better:* "avoid endings that
fade out... a lasting insight" — the callback is the insight; a viewer who saw the diagram
recognizes the ending as the same idea now made concrete.

## Secondary motion — new, not present in v1

**Pulsing markers at Bangladesh and India**, landing in sync with each stop's card, so the holds
have motion inside them beyond the choropleth's own reveal. *Why it's better:* "the world should
always feel alive" — a card sitting static for 4+ seconds was one of the screenshot test's
recurring failure modes in v1; the pulse gives those seconds a second thing to look at.

## What did not change

**The choropleth, the tour mechanics, the fixed-corner source/brand marks, the density data and
its methodology.** All of it held up under the review — the panel's Journalist role checked the
compressed narration for dropped caveats and found none; the data's own `_note` field already
carries the country-level-granularity caveat, unchanged from v1.

## Numbers

| | v1 | v2 |
|---|---|---|
| Runtime | 40.05s | 34.1s |
| Narration | 89 words, 7 beats | 69 words, 8 beats (one is the Hyperframe diagram) |
| Distinct camera framings | 4 (repeated) | 7 (none repeated except the final reset) |
| Basemap default labels visible | ~15-30 per zoomed shot | 0 |
| Hyperframe content | none | one 3.6s composition |
| Screenshot-test frames sampled / passing | 18 / ~8 | 34 / ~30 |
