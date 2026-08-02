# "The Strait That Decides" — the Strait of Malacca

Built end to end via the `map-video-production` skill. 49.5s, 1080×1920, GeoMotion only —
no Hyperframe insert, because there's no concept-only beat here: everything in this story has
a coordinate, so GeoMotion draws all of it (the skill's own filter, taken literally).

**Output:** `the-strait-that-decides.mp4` (gitignored — 8.3 MB, rebuild locally below).

## Why this idea

The chokepoint framework already proven out by "Four Doors" (EP001), pointed at a different
strait with different stakes — not one navy's problem, the whole world's trade. Genuinely
distinct from the DataBandar channel's existing population-density identity, which is exactly
the "geopolitics as a second, deliberate lane" the differentiation memo flagged as an option
rather than a default.

## The facts, verified before a word was scripted

Per the skill's own rule — a "well-known" statistic gets checked, not assumed:

| Claim | Figure | Source |
|---|---|---|
| Narrowest point (Phillips Channel) | 2.8 km | [EIA](https://www.eia.gov/todayinenergy/detail.php?id=32452) |
| Share of global seaborne trade | 22% | [CSIS, via WION](https://www.wionews.com/photos/-22-of-world-trade-what-is-malacca-strait-why-this-largest-oil-transit-chokepoint-is-in-focus-amid-hormuz-tensions-1776958833015) |
| Share of global seaborne oil | ~29% (23.2M barrels/day, H1 2025) | EIA |
| Singapore's port | World's busiest *transshipment* port (not overall — Shanghai holds that by volume) | [Maritime Gateway](https://www.maritimegateway.com/singapore-remains-the-worlds-busiest-transshipment-port/) |
| Detour cost via Lombok, the real deep-water alternative for large vessels | +7–8 days | [RSIS](https://rsis.edu.sg/rsis-publication/rsis/1686-maritime-highways-of-southeast/), [Eurasia Review](https://www.eurasiareview.com/11052026-lombok-strait-as-an-alternative-to-the-malacca-strait-prospects-and-challenges-analysis/) |

One figure was checked and *dropped*: a cited "+7,500 nautical miles" detour distance turned
up in the same search, but it reads as a total route length for specific origin-destination
pairs rather than the distance added by avoiding Malacca specifically — too ambiguous to put
on screen. The clean, corroborated number (+7–8 days) carries the point without it.

## Two bugs found by rendering, not by reading the build script

**The detour route was invisible at the wide pull-back.** Correct data, correct curve math,
zero visible line — because a route's stroke width is in screen pixels, and at extreme
globe zoom-out (most of Asia and Australia in frame) a few thousand kilometres of amber line
at width 2.6 compresses to sub-pixel. Confirmed by brute-forcing the width up to 7 and watching
it appear, then settling on 5 as the value that's clearly visible without reading as a marker
pen. The green "main route" line never had this problem because it's drawn early, while the
camera is still tight — this only shows up on a genuinely wide shot, which is exactly the
frame a plan or a spot-check at normal zoom wouldn't have caught.

**The two pulse-marker labels collided once both existed.** Both markers were built with
`out: EDGE` (stay until the end) — reasonable in isolation, wrong in combination: by the S05
wide pull-back both "PHILLIPS CHANNEL" and "SINGAPORE" were on screen at once, close enough
together to overlap into "PHIL[SINGAPORE]NEL." Fixed by ending each marker's label with the
scene that introduced it — a pulse marker's job is to give its own beat life, not to stay
labelled for the rest of the film.

## What's different from a straight port of "Four Doors"

- **Single globe context for the whole film**, deliberately, from the first draft rather than
  discovered as a bug mid-build — the skill already documents the projection-switch export
  bug, so this project never attempted a mid-timeline switch in the first place.
- **A `route`-drawn comparison** (the strait vs. the Lombok detour) instead of a card doing the
  comparing — the same "Detour" shape as EP001, executed as two geometrically real paths.
- **Every closing layer's `out` set to `DUR + 3` from the start** — the fade-to-black bug the
  skill documents, avoided by design rather than caught and re-rendered after the fact.

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
  -shortest -movflags +faststart the-strait-that-decides.mp4
```
