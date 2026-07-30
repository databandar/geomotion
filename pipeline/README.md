# Video pipeline

There are two ways in: the **Studio** (a UI over all of this — click ✦ Studio in the
editor toolbar, `npm run dev`), or a JSON script on the command line as below. They
share every stage; the Studio just writes the script for you.

Script in, finished MP4 out. Narration is synthesised and **measured first**, and
every visual beat is then cut to the length of the line that goes over it — so the
animation is fitted to the voice rather than the voice being squeezed into a
guessed timeline.

```bash
npm run video -- pipeline/scripts/anemia-india.json --draft   # fast check
npm run video -- pipeline/scripts/anemia-india.json           # the real thing
```

Outputs land in `pipeline/out/<slug>/`:

| File | What it's for |
| --- | --- |
| `<slug>.mp4` | Upload this. H.264 high / yuv420p / faststart, AAC at −14 LUFS. |
| `<slug>.srt` | Subtitles, cue-per-line. Upload alongside — YouTube ranks on them. |
| `<slug>-thumb.png` | 1280px still for the thumbnail. |
| `<slug>.geomotion.json` | The generated project. **Open it in the editor** to hand-tune, then re-render. |
| `voice.wav` | The mixed narration bed. |

## Studio

`npm run dev`, then **✦ Studio** in the toolbar. Five steps, left to right:

| Step | What it does |
| --- | --- |
| **Data** | Browse all 101 NFHS indicators, pick one, see the ranking and the biggest movers since the last round. Picking one sets the metric, legend, title and slug. |
| **Script** | Beats list with per-beat narration and on-screen text. **Write with AI** drafts it, or bring your own: **Import** a `.json`, **Export** to keep one, or **Paste text** to drop one line per beat straight in. |
| **Script** (states) | Beats list with per-beat narration and on-screen text. **Write with AI** drafts the whole thing. Tour stops are a dropdown of the 37 real region names — a state can't be misspelled, and ↑↓ set the visit order. |
| **Script** (images) | Each stop has an **Illustrate** button — Gemini 3.1 Flash Lite via OpenRouter, ~3s and a fraction of a cent each. **Illustrate all** does the whole tour. Files land in `pipeline/assets/<slug>/<Region>.jpg`, exactly where the renderer already looks. |
| **Voice** | Pick a Voicebox voice, or record 30s and clone your own. **Generate all lines** synthesises everything and shows each line's duration with playback. Each line also has **● Record** — say it yourself and your take replaces the synthesised one. |
| **Look** | Format (9:16 / 16:9 / 1:1), basemap, terrain, colour ramp, camera pitch/bow/fly-time, credit line. |
| **Render** | **Open in editor** first: Studio minimises, the composition loads, and you can scrub it with the narration playing. Then **Export MP4 from editor** renders exactly what you see. Or skip the editor and render straight from the script. |

The status dots top-right show whether the LLM key, Voicebox, ffmpeg and the NFHS
csv are all reachable before you start.

## Your own voice

Two different things, both supported:

1. **Clone your voice once**, then let it read everything — Voice step, right-hand
   column. Read the passage, upload, and the profile appears in the voice list.
2. **Record individual lines** — the **● Record** button on any line in the
   narration list. Your take is stored in `pipeline/out/_voice/<slug>/manual/` and
   always wins over the synthesiser, so you can voice the lines that matter and
   leave the rest generated. Re-running the pipeline never overwrites a recording;
   the `×` next to it reverts that line to synthesis.

The CLI honours recordings too — `video.mjs` reports how many lines came from your
own voice.

## Editor round trip

**Render → Open in editor** composes the timeline and minimises Studio (a pill in
the corner brings it back, with all your work intact). In the editor you get:

- the **narration on its own timeline track**, one chip per line, playing in sync
  with the playhead — the speaker button in the transport mutes it
- **states** as the region layer, with the tour stops and framing in the inspector
- every **title and picture** as an ordinary layer you can move, reword or restyle

Then **Export MP4 from editor** renders the live project — hand edits survive,
which a script-driven render would silently discard.

One limit worth knowing: the voice bed is mixed at compose time against the
composed beat timings. Restyling, rewording and repositioning are all safe, but
**retiming a layer will pull it out of sync with the narration** — change pacing in
Studio (or the beat's `pad`) rather than by dragging bars.

**On the generated illustrations:** the default prompt asks for a *flat vector
motif* — no text, no map, no borders, no faces. That is deliberate. A
photorealistic AI image of a real state, dropped into a data video, reads as
documentary footage of that place, which it is not. Edit the shared look under
**Style…** if you want a different treatment, but keep it visibly illustrative.

**On the AI writer:** it does not choose which states appear. The stop list is
computed from the data — top N plus the lowest one for contrast — and the model is
only asked for the words, matched back by index. Letting it pick regions is where
factual errors come from: it reorders the ranking and then narrates "number three"
over the wrong state. Numbers stay as `{value}` placeholders filled from the data
after generation, so the narration can't contradict the map.

## Requirements

- **ffmpeg + ffprobe** on `PATH` (`brew install ffmpeg`).
- **Chrome** (or Chromium/Brave). Auto-detected; override with `CHROME_PATH`.
- The renderer drives the production build via `window.geomotion`, so it renders
  exactly what the editor shows — there is no second render backend to drift.

## Flags

| Flag | Effect |
| --- | --- |
| `--draft` | Half frame rate, quarter resolution, no tile waiting. Minutes instead of tens of minutes. Timing and layout are identical, so it's the right way to review an edit. |
| `--no-audio` | Skip TTS; estimate line lengths from text length. For checking structure without burning API calls. |
| `--frames-only` | Stop after the PNGs. |
| `--keep-frames` | Don't delete frames after encoding. |
| `--rebuild` | Force `npm run build` first. |
| `--port=N` | Static server port (default 5211). |

## Writing a script

```jsonc
{
  "title": "भारत में एनीमिया",
  "slug": "anemia-india",
  "format": "landscape",        // landscape | short | square
  "basemap": "satellite-labels",
  "dataset": "india-official",  // or india-natural-earth
  "values": "anemia-sample",    // preset name, inline {name: value}, or a path
  "ramp": "ember",
  "credit": "…",                // burned in bottom-right, always on
  "voice": { "engine": "say", "voice": "Lekha", "rate": 168 },
  "metric": { "label": "…", "unit": "%", "decimals": 1, "legend": "…" },

  "beats": [
    { "kind": "clouds",   "say": "…", "onScreen": "भारत में एनीमिया" },
    { "kind": "outline",  "say": "…" },
    { "kind": "overview", "say": "…", "onScreen": "…" },
    { "kind": "tour", "stops": [
        { "region": "Ladakh", "say": "लद्दाख — {value} प्रतिशत।" }
    ]},
    { "kind": "labels", "labelAll": true, "say": "…" }
  ]
}
```

### The five beat kinds

| `kind` | What you see |
| --- | --- |
| `clouds` | Cloud cover over a top-down view, parting to reveal the map. The title card. |
| `outline` | The national boundary traces itself on in colour. |
| `overview` | The whole choropleth, with every state border drawing on. |
| `tour` | One region per stop: camera flies in, border traces, value counts up. |
| `labels` | Camera pulls back out; with `labelAll`, every region's value appears. |

Every beat is optional and order is up to you — `compose.mjs` looks each one up by
kind. Timing knobs: `pad` / `minLength` per beat, `stopPad` / `minStop` per tour,
and `beatGap`, `leadIn`, `tailOut` on the script.

### Placeholders

In a tour stop's `say` or `onScreen`: `{region}`, `{value}`, `{rank}`. These are
filled from the value table **before** synthesis, so if you change a number the
voiceover changes with it instead of quietly contradicting the map. A stop naming
a region that has no value is reported as a warning.

## Voice engines

| `engine` | Quality | Notes |
| --- | --- | --- |
| `voicebox` | Good, local, free | **Default.** [Voicebox](https://github.com/jamiepine/voicebox) running locally. Its Kokoro engine ships four Hindi voices: `hf_alpha`, `hf_beta` (female), `hm_omega`, `hm_psi` (male). No key, no cloud, no cloning. |
| `say` | Rough | macOS built-in, Hindi voice `Lekha`. Free and offline; sounds like a screen reader. Useful when Voicebox isn't running. |
| `elevenlabs` | Best | Set `ELEVENLABS_API_KEY` and a `voiceId`. |
| `google` | Good | Set `GOOGLE_TTS_API_KEY`; `hi-IN-Neural2-*` voices. |
| `http` | — | Any local server that takes JSON and returns audio. |

### Voicebox setup

The app must be open — nothing here can start it.

```bash
open -a Voicebox                                   # leave it running
curl http://127.0.0.1:17493/profiles/presets/kokoro   # list voices
```

```json
"voice": {
  "engine": "voicebox",
  "vbEngine": "kokoro",
  "presetVoice": "hf_alpha",
  "language": "hi",
  "profileName": "GeoMotion Hindi (hf_alpha)"
}
```

The pipeline finds or creates that profile on first use. Swap `presetVoice` to
audition the other three — it costs one re-run and only re-synthesises changed
lines.

Voicebox's **Chatterbox** engine is also multilingual and higher quality, but it
is clone-only: it has no preset voices and needs a reference recording. Use it
with a sample of *your own* voice — record ~30s, add it to a profile in the app,
then set `"vbEngine": "chatterbox"`. Don't clone someone else's voice for a public
channel.

Clips are cached on a hash of (engine, voice, text), so re-running after a visual
tweak costs nothing and doesn't re-bill you. Change a line and only that line is
re-synthesised.

**On numbers in Hindi:** `say`/Lekha reads `92.8` acceptably, but the neural
engines pronounce Devanagari numerals more naturally. If a number comes out wrong,
write it in words in the script.

## Publishing checklist

The MP4 is ready to upload as-is, but:

1. **Replace the sample values.** The bundled anaemia figures are placeholders,
   and the default credit line says so. Put your real source in `credit`.
2. **Add music** if you want it: `"music": "path/to/bed.mp3"` and optional
   `"musicGain"` (default −22 dB under the voice). Use something you have a
   licence for.
3. **Upload the `.srt`.** Auto-captions on Hindi are poor and captions are a
   ranking signal.
4. **Check the thumbnail.** `thumbnailAt` picks the second to grab from; the
   default is the closing full-map shot.

## Adding a new topic

Nothing in the pipeline is India-specific except the two bundled datasets. For
somewhere else: drop a GeoJSON of the regions in `src/data/`, add it to `DATASETS`
in [`lib/compose.mjs`](lib/compose.mjs), and point a script at it. The value table
can be an inline object or a path to a `{name: value}` JSON file.

## Secrets

`.env.local` (gitignored) holds `OPENROUTER_API_KEY`. It is read **only** by the
dev-server middleware — nothing prefixed `VITE_` exists, so the key never reaches
the browser bundle. `npm run build` produces a static site with no Studio API at
all, which is what the renderer loads; rendered frames never depend on it.

## How the pieces fit

```
studio-server.mjs    dev-server API behind the Studio UI (LLM, data, voice, render)
tools/nfhs.mjs       CLI to browse/extract survey indicators
video.mjs            orchestrates: narrate → compose → render → encode
lib/tts.mjs          engines, duration probing, the mixed voice bed
lib/compose.mjs      script + measured durations → project JSON + SRT
lib/render.mjs       serves dist/, drives it in headless Chrome, writes PNGs
lib/encode.mjs       ffmpeg: frames + audio → MP4, plus the thumbnail
lib/nfhs.mjs         reads the NFHS pivoted csv, maps names to the boundary set
```

`compose.mjs` emits an ordinary GeoMotion project, which is why the generated
`.geomotion.json` opens in the editor. The usual workflow once a script settles is
to render a draft, open the project, nudge the framing by hand, and re-render —
the pipeline is a starting point, not a black box.
