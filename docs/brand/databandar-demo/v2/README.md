# "Half of Humanity" v2

A full creative review and rebuild of [`../half-of-humanity.mp4`](../half-of-humanity.mp4),
requested as a professional review cycle, not a quick pass. Read in this order:

1. [`REVIEW.md`](REVIEW.md) — the critique of v1 (grounded in real extracted frames) and the
   six-role internal panel review of the redesign plan.
2. [`REDESIGN.md`](REDESIGN.md) — the storyboard, script, GeoMotion plan, Hyperframe prompt,
   and editing timeline the panel approved.
3. [`CHANGELOG.md`](CHANGELOG.md) — every change that shipped, and why it improves
   understanding or retention. Read this one if you only read one.

**Output:** `half-of-humanity-v2.mp4` (gitignored — 8 MB, rebuild locally below). 1080×1920,
30fps, 34.1s. Verified against the actual last frame of the actual encoded file that it's a
hard cut, not a fade (`CHANGELOG.md`'s "engine bug" entry explains why that needed checking).

## Reproducing it

Needs `pnpm dev` running from the repo root and a local Voicebox on `:17493`.

```bash
# 1. The Hyperframe cold open (density diagram) — independent of the GeoMotion half.
cd ../hyperframe
npx hyperframes render . --output density-diagram.mp4 --quality high
cd ../v2

# 2. Narration.
node tools/narrate.mjs
#    -> vo/*.wav

# 3. Schedule, from measured audio. Warns if a line runs longer than the Hyperframe clip's
#    fixed duration (3.6s) — if so, either shorten the line or lengthen the clip's hold
#    (see the Hyperframe file's comment on the last `tl.to({}, ...)` tween) before continuing.
node tools/retime.mjs
#    -> schedule.json (both the absolute timeline and GeoMotion's own offset view)

# 4. The GeoMotion project — everything from the reveal onward.
node tools/build-project.mjs
#    -> project.geomotion.json, scene-bounds.json

# 5. Render every frame through the studio's headless API (see
#    docs/brand/render/tools/render-frames.mjs for the underlying script — point it at this
#    project.geomotion.json and run in `all` mode).

# 6. Mix.
python3 tools/mix-audio.py
#    -> audio.wav

# 7. Concatenate the Hyperframe clip ahead of the GeoMotion frames, then mux the mix.
ffmpeg -framerate 30 -i frames/f%05d.png -c:v libx264 -pix_fmt yuv420p -crf 12 -preset slow geo-part.mp4
ffmpeg -i ../hyperframe/density-diagram.mp4 -c:v libx264 -pix_fmt yuv420p -crf 12 -preset slow -r 30 hf-part.mp4
printf "file 'hf-part.mp4'\nfile 'geo-part.mp4'\n" > concat.txt
ffmpeg -f concat -safe 0 -i concat.txt -c copy video-only.mp4
ffmpeg -i video-only.mp4 -i audio.wav \
  -c:v libx264 -pix_fmt yuv420p -crf 16 -preset slow -c:a aac -b:a 192k \
  -shortest -movflags +faststart half-of-humanity-v2.mp4
```
