# EP001 — produced

The episode bible ([`../EP001-four-doors.md`](../EP001-four-doors.md)) is the design. This is
what actually rendering it against the real tools found.

**Output:** `EP001-four-doors.mp4` (gitignored — 37 MB, rebuild locally with the steps below).
1080×1920, 30fps, 84.00s, H.264 + AAC.

## What changed between the bible and the render

**Two facts corrected before recording.** Verified against live sources rather than trusted
from the original draft:

- *"Every shore belongs to NATO"* (Baltic) was wrong — Russia has Baltic coastline via
  Kaliningrad and St Petersburg. Rewritten to name the strait's actual shores: *"between
  Denmark and Sweden."*
- *"The harbour needs icebreakers"* (Vladivostok) is outdated. Since a thermal plant opened in
  1984, Golden Horn Bay stays open almost year-round on its own. Rewritten to *"the harbour ices
  over"* — true without implying the old workaround still runs.
- Bosphorus (700 m) and Øresund (4 km) were both confirmed as stated.

**The timing was rebuilt from measured audio, not the word-count estimate.** The bible budgets
narration at 2.65 words/sec (Handbook 1.11). The actual Voicebox voice used —
`am_michael`/kokoro, a preset, not a cloned profile — reads slower. Every one of the 14
narration segments overran its planned slot on the first pass; `s09` alone needed 7.55s against
a 6.8s budget. Rather than cut the lines to fit a schedule that was already wrong, every scene
boundary in `schedule.json` is now derived from the real audio durations plus deliberate gaps —
so picture and voice cannot collide. Total runtime landed at exactly 84.00s, inside the 45–90s
ceiling with room to spare.

**A staging bug in the finale.** The three "door" markers (Baltic, Black Sea, Pacific) were each
given an `out` at their own scene's end, so by the S13 reprise — "same camera, same four
reticles, now all four SIGNAL at once" — only the Northern Fleet marker was still on screen.
Fixed with four dedicated reprise markers that appear only for the closing beat, rather than
stretching the originals across the whole film (which would have left the Baltic marker glowing
during the Bosphorus scene).

**Voice:** Kokoro's `am_michael` preset, not a cloned profile — the handbook's standing
recommendation (1.11) is a locked clone for series consistency, and that's the right call for a
recurring channel; for one sample episode a preset needed no additional setup.

**No Hyperframe.** The bible specifies six Hyperframe shots (a treaty abstraction, an icebreaker
cross-section, motion typography, scale objects). None exist here — Hyperframe isn't wired into
this repo's pipeline, so every beat that called for it either dropped or was carried by
GeoMotion text/graphics instead (e.g. the "700 m" and "4 km" callouts are plain text layers, not
the schematic scale-object diagrams HF-02/HF-03 describe). The map-only cut is what this
demonstrates; the finished brand video would need those shots produced separately.

## Reproducing it

Needs a running dev server (`pnpm dev`, from repo root) and, for narration, a local Voicebox on
`:17493`.

```bash
# 1. Build the GeoMotion project from the (now-corrected) schedule and camera plan.
node tools/build-project.mjs
#    -> ep001.geomotion.json, schedule.json

# 2. Generate narration — one WAV per line, from the real Voicebox.
node tools/narrate.mjs
#    -> vo/*.wav, vo/manifest.json

# 3. Rebuild ep001.geomotion.json if schedule.json's gaps need retuning against the actual
#    vo/*.wav durations (ffprobe each file; the durations are hardcoded in build-project.mjs's
#    VO table — measure once, then paste in, rather than re-deriving on every run).

# 4. Render every frame through the studio's headless API in a real browser.
node tools/render-frames.mjs all
#    -> frames/f00000.png .. f02519.png (2,520 frames at 84s × 30fps)

# 5. Mix narration + synthesised music bed + the CC0 SFX pack.
python3 tools/mix-audio.py
#    -> ep001-audio.wav

# 6. Encode.
ffmpeg -framerate 30 -i frames/f%05d.png -i ep001-audio.wav \
  -c:v libx264 -pix_fmt yuv420p -crf 16 -preset slow -c:a aac -b:a 192k \
  -shortest -movflags +faststart EP001-four-doors.mp4
```

## The music bed

Synthesised rather than sourced (no Musicbed/Artlist access in this environment) — see
`tools/mix-audio.py`. Three layers: a continuous 55Hz sub-bass drone pulsed at 92 BPM via
tremolo (present start to end), a bandpassed pink-noise texture that fades in only at the
reversal (`S10` start) as the "filter opens" moment the handbook calls for, and three sparse
metallic FM blips at the TURN, the HOP, and the reversal itself. The two brand silences (1.10)
are a hard mute of the whole bed: under the S2 dead-hold claim, and for 0.70s after "Gulf of
Mexico."

Automating a filter cutoff smoothly inside one ffmpeg graph is fragile; layering a texture that
only enters at one moment is a simpler way to deliver the same beat and was more reliable to
get right on the first pass.
