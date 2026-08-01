---
workflow: general-video
flow: automation
storyboard: no
message: "Income divides the world: one planet, very unequal."
aspect: 1920x1080
language: en
length: 29.5s
angle: documentary data-walk
voice: GeoMotion clone test
---

## Intent

Rebuild the geomotion "world painted by income" film as a HyperFrames composition
layered over the engine's clean globe plate. A dark, cinematic data-documentary
walk down the world's income ladder: Luxembourg #1 ($114,703) → Switzerland #2
($81,994) → United States #6 ($65,298) → Burundi #169 ($261). The globe plate
does the world; the composition owns every title, callout, caption, end card,
and the voicebox narration.

## Assets

- assets/plate.mp4 — the engine's clean 1920x1080 globe plate (no text), 29.5s @ 30fps, muted here; the composition's base track.
- assets/vo-*.wav — voicebox narration (GeoMotion clone test), one clip per beat, generated via the local REST API.

## Customizations

- Rung callouts (lower-third cards) show rank + country + GDP per person, timed to the existing arrive/depart schedule: 11.6–13.8 / 14.6–16.8 / 17.6–19.8 / 20.6–22.8.
- Persistent income-ladder rail on the left (rank 1→169) whose marker drops to each rung as the tour arrives.
- Title card (0.5–6.6) with a paint-sweep accent; outro card "One planet, very unequal." (23.4–28.0) plus next-week tease (26.7–28.9).
- VO narration synced to the beat schedule (see STORYBOARD.md).

## Notes

- Beat timing is fixed by the engine's plate (29.5s total); the composition must not re-time it.
- No life-expectancy data exists in the repo — the tease line only promises next week; callouts carry rank + GDP per person only.
- Fonts: League Gothic (display, condensed) + IBM Plex Mono (data readouts). Accent = inferno ramp's bright yellow (#f7d03c) on near-black, echoing the night-lights basemap.
