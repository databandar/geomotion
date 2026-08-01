# DataBandar demo — "Half of Humanity"

The differentiation strategy in [`../databandar-differentiation.md`](../databandar-differentiation.md),
produced as an actual video, not left as a recommendation.

> **A full creative review superseded this cut.** [`v2/`](v2/) has the critique, a six-role
> panel review, a redesigned storyboard/script/GeoMotion plan, a new Hyperframe cold open, a
> label-free basemap, and the rebuilt video — see [`v2/CHANGELOG.md`](v2/CHANGELOG.md) for
> exactly what changed and why. This file describes the cut that review is *of*.

**Output:** `half-of-humanity.mp4` (gitignored — 9 MB, rebuild locally with the steps below).
1080×1920, 30fps, 40.05s, H.264 + AAC.

## The claim, and how it was checked

*"Half of everyone alive fits inside a surprisingly small part of the map — 13% of the land."*

This did **not** start as this claim. The first idea was the "Valeriepieris circle" (a circle
that famously contains most of the world's population) — verified via Wikipedia that it's real,
but different sources disagree meaningfully on its center, radius, and even whether the original
was drawn on a flat projection rather than a true geodesic circle (3,300 km from Myanmar; 3,386
km from 29°N,105°E; 4,000 km from Yunnan — three different circles from three different
authors). A first attempt to compute the inside/outside population split myself, using each
country's POP_EST apportioned by the area-fraction of the country inside the circle, came out
**46.8% inside** — the *minority*, contradicting every published source, which all say inside is
the majority. The mechanism: that method assumes uniform population density within a country,
which is badly wrong for Indonesia specifically (56% of its population lives on Java, which is
7% of its land) and for Russia (population concentrated far from the circle-adjacent Siberian
sliver). Rather than publish a number I had direct evidence was wrong, or borrow a published
figure I couldn't verify precisely enough to justify a specific radius/center on screen, the
claim was dropped.

**What replaced it is fully self-computed and independently checkable.** Rank all 176 Natural
Earth countries by population density (density computed as POP_EST divided by a real geodesic
land area, via a Mollweide equal-area projection — not a published field, not a Mercator
guess), accumulate population from the densest country down, and find where the running total
crosses 50%. It crosses at China — 55.5% of world population, having used 13.16% of world land.
Sanity-checked against known real figures: Bangladesh computed at 1,214 people/km² (published
figures put it around 1,265), Netherlands at 434 (published ~508), India at 433 (published
~464) — all in the right range, confirming the method.

**Caveat stated in the data file, not hidden:** this is country-level granularity. It cannot see
city-level concentration within a country — the true "how little land holds half of humanity"
figure, computed at grid resolution, would be smaller than 13%. That's a stronger version of
the same story, not a contradiction of this one, and it needs gridded population data this
repo doesn't have.

## Applying the differentiation strategy

- **The dark globe open** — the signature device the strategy recommends, proven free to build
  in the `globe-visual-styles` skill.
- **One locked ramp** ('forest', DataBandar's green) instead of a different palette per post.
- **A camera grammar**, not a screenshot: settle, push, hold — reused across every stop.
- **A fixed-corner source mark**, same place and size for the whole film: top-right,
  `NATURAL EARTH · POP_EST` and `DATABANDAR`.
- **Stayed on the globe for the whole film**, not just the open — see the engine-limitation
  note below for why, and `databandar-differentiation.md`'s "don't put every video on a globe"
  section for why that's still consistent with the strategy: the rule is about *regional*
  content, and every stop here is being read as a data point in a world pattern, not a local
  story on its own — which is exactly the case the strategy says the globe is *for*.

## A real engine limitation, found and routed around, not patched

The original design used a story-block map-context switch — globe for the open, flat Mercator
for the density reveal — the same pattern the World tour and EP001 fixtures use for basemap.
Rendered, the projection never switched: camera and text correctly updated for the requested
export frame, but the globe stayed a globe straight through the density scenes.

Traced to the source: `basemap`, `terrain`, and `projection` in `MapCanvas.tsx` are all
resolved reactively off `useStore(s => resolveMapContext(s.project, s.time)...)` — keyed to the
**editor's own live timecode**, not to the explicit `atTime` a headless export frame requests.
Camera and overlay content (`evaluate(project, atTime)`) correctly use the requested time; the
map's own projection/basemap/terrain do not, because nothing in the `renderFrameAt` path ever
updates `store.time` to match. Scrubbing the timeline in the browser works fine — only export
is affected, silently: what plays in the editor and what renders to video would diverge for any
project using a mid-timeline context switch of basemap, terrain, or projection.

This is a real, confirmed gap in the render/export path, not specific to this video. It wasn't
fixed here: the fix needs to synchronize `render()`'s explicit-time path with the async
MapLibre style-reload lifecycle those effects already have hard-won handling for (see the
`MapCanvas.tsx` comment on the MapLibre 5.24 crash that pairing a basemap swap with a
projection change can trigger) — real work, and risky to rush under a content deadline. Routed
around here by keeping the whole film on one map context instead. Documented in the
`globe-visual-styles` skill so it's known before the next attempt.

## The voice question

Four presets of the same line — `"Half of everyone alive fits inside a surprisingly small part
of the map."`, generated through the local Voicebox — are in `voice-compare/`:
`af_heart.wav`, `af_sarah.wav`, `af_nicole.wav` (female), `am_michael.wav` (the EP001 baseline,
male). Listen and pick; a written opinion about voice color isn't a substitute for hearing it.

**The reasoning for trying female voices at all:** every reference channel named in the original
brief — RealLifeLore, Johnny Harris, Neo, Half as Interesting, Bloomberg's own map-explainer
work — is male-narrated. A distinctive female voice is real audio differentiation in a genre
that's audibly homogeneous right now, on top of whatever it does for tone. That's a stronger
argument for trying it than any claim about which voice "suits data better."

**`af_heart` was used for the produced video** — a judgment call among the three female
options, not a verified-best pick; it's the one worth confirming or overriding by ear.

## Pexels

A Pexels API key was offered for this video. Not used, and not stored in any committed file —
the brand's own rule (Handbook 1.3's forbidden list: no stock b-roll, "every second must
carry information") argues directly against it here: every frame in this piece is the map or a
number, which is the entire differentiation argument in `databandar-differentiation.md`.
Real photography earns a place in a future piece where a specific photo *is* the evidence — a
named port, a named dam — not as texture behind a title card.

## Reproducing it

Needs `pnpm dev` running and a local Voicebox on `:17493`.

```bash
node tools/build-project.mjs   # placeholder schedule.json on first run
node tools/narrate.mjs         # -> vo/*.wav
node tools/retime.mjs          # rebuilds schedule.json from measured audio
node tools/build-project.mjs   # rebuild against the real schedule
node tools/render-frames.mjs all   # (reuses docs/brand/render/tools/render-frames.mjs's
                                    #  pattern — see that file; point it at this project)
python3 tools/mix-audio.py     # -> audio.wav
ffmpeg -framerate 30 -i frames/f%05d.png -i audio.wav \
  -c:v libx264 -pix_fmt yuv420p -crf 16 -preset slow -c:a aac -b:a 192k \
  -shortest -movflags +faststart half-of-humanity.mp4
```
