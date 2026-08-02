# "The Ice Is Opening a Shortcut" — Arctic shipping lanes

Built end to end via the `map-video-production` skill. 45.3s, 1080×1920, GeoMotion only —
one continuous globe context, no Hyperframe insert, following the same "if it has a
coordinate, GeoMotion draws it" rule as Malacca.

**Output:** `the-ice-is-opening-a-shortcut.mp4` (gitignored — 8.6 MB, rebuild locally below).

## Why this idea

Own top pick from the 10-idea rating exercise: a real, moving chokepoint story — melting ice
opening a route, and Russia's control over who gets to use it — with the same "geography +
political leverage" spine as Four Doors and Malacca, but the *first* of the three where the
chokepoint itself is changing over time rather than fixed. That's also the reason for the one
genuinely new mechanic in this episode: a cross-fading seasonal ice shape, instead of another
static route/detour comparison.

## The facts, verified before a word was scripted

| Claim | Figure | Source |
|---|---|---|
| Rotterdam–Yokohama, Arctic vs. Suez | 7,300 nm vs 11,000 nm (~35–40% shorter) | gCaptain, Ship Universe |
| Navigable season | Typically Aug–Oct; 2025's hardest sections open as little as ~2 weeks | Centre for High North Logistics |
| Who controls access | Russia's Northern Sea Route Administration + Rosatom (state nuclear energy corporation); 15-day advance permit required | globalsecurity.org, russiancouncil.ru |
| Ice trend | September Arctic sea ice down ~12–13%/decade since 1979 | NSIDC |

The on-screen ice shapes are explicitly labelled "ICE SHAPES SCHEMATIC" in the source line —
they're hand-authored illustrative polygons, not traced NSIDC shapefiles. The narration's
12%/decade figure is the real, sourced number; the shapes carry the concept of shrinking ice,
not claimed precision.

## Three bugs found by rendering, not by reading the build script

**Ice polygons crossed the antimeridian.** The first draft of the winter/summer ice rings
wrapped through 172°→-170°→-155° to close a loop around the pole. A GeoJSON polygon that
crosses ±180° without continuous (unwrapped) longitude renders as a self-intersecting mess on
this engine — a broken crescent from wide out, a nonsense edge from close in. Fixed by
redesigning both rings to stay entirely within 15°E–175°E, where the story's whole geography
(Kara Gate to the Bering Strait) already fits.

**Camera framing hid the comparison and broke the close-up.** S03 (both routes) was too wide
(zoom 1.35), pushing the amber Suez route to sub-pixel even at width 4.5 — fixed by tightening
to zoom 2.15 and widening the route to 5.5. S04 (the ice cap as a whole shape) was too tight
(zoom 3.0, centered inside the polygon's own edge), producing a disorienting close-up with a
stray artifact dot — fixed by pulling back to zoom 1.9, recentered to [95, 77].

**A polygon vertex above 85.05°N broke MapLibre's globe fill.** The summer ice shape's top edge
originally peaked at 87°N. Web Mercator — which MapLibre's globe projection is still built on
underneath (the tile pyramid is bent onto a sphere, not replaced by a true orthographic
projection) — has a hard latitude limit of ±85.0511°, past which the coordinate system breaks
down. The polygon didn't just render coarsely, it clipped into a genuinely broken two-lobe fold.
This one took two failed attempts to diagnose: densifying the ring's vertices from 5° to 1.5°
spacing produced a pixel-identical broken shape both times, which is what gave away that the
problem wasn't edge-straightness (the usual fix for coarse geometry at high latitude) but an
out-of-bounds coordinate. Fixed by redesigning the shape to stay under 85°N — pulled back from
the coastline (smaller footprint) rather than pushed toward the pole, which reads correctly as
"less ice" without needing to approach the singularity at all.

## One more bug found on the full-file screenshot test

**The closing title sat on top of the thing it was describing.** "THE ICE RETREATS" was placed
at mid-screen (y=0.40), the same band the closing ice sliver occupies at the wide final shot —
so the caption visually collided with and partly obscured the one element it was pointing at.
Every other stat callout in this film (Distance, Catch, Control, Trend) already uses a
consistent lower-band position (y≈0.79/0.855); only the closing pair broke that rhythm. Fixed
by moving both closing lines down to match.

## What's different from Malacca

- **A time-based visual mechanic** (the ice cross-fade) instead of a purely spatial one (the
  detour route) — the same "route-drawn comparison, not a card doing the comparing" principle,
  applied to something that changes by season rather than by point A vs. point B.
- **A country lit at low opacity for the control beat** (`russia`, S05) rather than stated only
  in narration — subtle by design, shown rather than told.
- **The 85.05° Mercator limit** is a new addition to the technical rules this format has to
  respect, alongside the antimeridian-crossing rule Malacca and this episode both hit
  independently — both are "the engine is still Mercator-based underneath, even in globe mode"
  bugs, just at opposite edges of the coordinate space (±180° longitude vs. ±85° latitude).

## Reproducing it

Needs `pnpm dev` running and a local Voicebox on `:17493`.

```bash
node tools/narrate.mjs      # -> vo/*.wav
node tools/retime.mjs       # -> schedule.json, from measured audio
node tools/build-project.mjs
# render every frame through the studio's headless API (see docs/brand/render/tools/ or
# docs/brand/databandar-demo/v2/tools/ for the render-frames pattern), then:
python3 tools/mix-audio.py  # -> audio.wav
ffmpeg -framerate 30 -i frames/f%05d.png -i audio.wav \
  -c:v libx264 -pix_fmt yuv420p -crf 16 -preset slow -c:a aac -b:a 192k \
  -shortest -movflags +faststart the-ice-is-opening-a-shortcut.mp4
```
