# Video pipeline

> **Structure note.** `ENGINEERING_GUIDE.md` §2 calls this `apps/render-cli` — the
> headless renderer and CI golden-frame worker. It keeps its current name until the
> shared `lib/` code moves into packages, so the rename happens once.

Scripts are JSON files you write (or copy from `scripts/`) and run through the command
line. An in-app Studio used to generate them with an LLM and clone voices; it was
removed — see the note at the end.

Script in, finished MP4 out. Narration is synthesised and **measured first**, and
every visual beat is then cut to the length of the line that goes over it — so the
animation is fitted to the voice rather than the voice being squeezed into a
guessed timeline.

```bash
pnpm video -- scripts/anemia-india.json --draft   # fast check
pnpm video -- scripts/anemia-india.json           # the real thing
```

Outputs land in `pipeline/out/<slug>/`:

| File | What it's for |
| --- | --- |
| `<slug>.mp4` | Upload this. H.264 high / yuv420p / faststart, AAC at −14 LUFS. |
| `<slug>.srt` | Subtitles, cue-per-line. Upload alongside — YouTube ranks on them. |
| `<slug>-thumb.png` | 1280px still for the thumbnail. |
| `<slug>.geomotion.json` | The generated project. **Open it in the editor** to hand-tune, then re-render. |
| `voice.wav` | The mixed narration bed. |

## Using your own voice

Any line can be voiced by you instead of the synthesiser. Drop a wav at
`out/_voice/<slug>/manual/<key>.wav` and it wins over TTS for that line; `video.mjs`
reports how many lines came from a recording. Re-running never overwrites one, and
deleting the file reverts that line to synthesis.

The `<key>` is the beat address the pipeline prints while narrating — `b0` for the
first beat, `b3-s2` for the third stop of beat four.

## Editor round trip

Every render writes `<slug>.geomotion.json`. Open it in the editor (**Open**) and you
get the composition as ordinary layers — the region tour with its stops and framing,
every title and picture, and the narration on its own timeline track, one chip per
line, playing in sync with the playhead.

Edit it, then render that file directly:

```bash
node render-project.mjs out/<slug>/<slug>.geomotion.json --draft
```

Hand edits survive, which a script-driven re-render would silently discard. Narration
is re-mixed from the cue positions the project now holds, so **retiming is safe** — move
a layer or a cue and the voice follows it into the output.

**On illustrations:** a stop draws `assets/<slug>/<Region>.jpg` if that file exists, or
whatever `image:` names. Keep them visibly illustrative — a photorealistic image of a
real place, dropped into a data video, reads as documentary footage of somewhere it is
not.

## Requirements

- **ffmpeg + ffprobe** on `PATH` (`brew install ffmpeg`).
- **Chrome** (or Chromium/Brave). Auto-detected; override with `CHROME_PATH`.
- The renderer drives the production build via `window.geomotion`, so it renders
  exactly what the editor shows — there is no second render backend to drift.

## Flags

| Flag | Effect |
| --- | --- |
| `--draft` | Half frame rate, quarter resolution, no tile waiting, and encoded inside the page rather than captured as PNGs — 35s against 113s on the reference render. Timing and layout are identical, so it's the right way to review an edit. The picture is softer and the file bigger; the final render still goes through libx264. |
| `--frames` | Force the PNG path for a draft, which is also the automatic fallback if the browser cannot encode. |
| `--no-audio` | Skip TTS; estimate line lengths from text length. For checking structure without burning API calls. |
| `--frames-only` | Stop after the PNGs. |
| `--keep-frames` | Don't delete frames after encoding. |
| `--rebuild` | Force `pnpm build` first. |
| `--port=N` | Static server port (default 5211). |

## Writing a script

```jsonc
{
  "title": "भारत में एनीमिया",
  "slug": "anemia-india",
  "format": "landscape",        // landscape | short | square
  "basemap": "satellite-labels",
  "dataset": "india-official",  // or india-natural-earth
  "values": "india-anemia-sample",  // preset name, inline {name: value}, or a path
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

None. The LLM proxy that needed an `OPENROUTER_API_KEY` went with the Studio, so
nothing here reads `.env.local` and the editor build has no API to talk to.

If you still have an `OPENROUTER_API_KEY` in `apps/studio/.env.local` from before,
nothing reads it — and if it was ever pasted anywhere shared, rotate it at
<https://openrouter.ai/keys>.

## How the pieces fit

```
tools/nfhs.mjs       CLI to browse/extract survey indicators
video.mjs            orchestrates: narrate → compose → render → encode
render-project.mjs   renders an edited .geomotion.json, re-mixing its narration
lib/tts.mjs          engines, duration probing, the mixed voice bed
lib/compose.mjs      script + measured durations → project JSON + SRT
lib/render.mjs       serves dist/, drives it in headless Chrome, writes PNGs
lib/encode.mjs       ffmpeg: frames + audio → MP4, plus the thumbnail
lib/nfhs.mjs         reads the NFHS pivoted csv, maps names to the boundary set
                     (set NFHS_CSV or pass --csv; the survey data is not vendored)
```

`compose.mjs` emits an ordinary GeoMotion project, which is why the generated
`.geomotion.json` opens in the editor. The usual workflow once a script settles is
to render a draft, open the project, nudge the framing by hand, and re-render —
the pipeline is a starting point, not a black box.


## The Studio, and why it is gone

A five-step in-app generator used to write scripts with an LLM, synthesise or clone the
voice, and drive the render — mounted as dev-server middleware, which meant the editor
needed an API and an OpenRouter key in `.env.local`.

It was removed. The editor is a static site again with no server and no secrets, and
audio is something you bring: import a file in the editor and place it on the timeline.
This pipeline still does the whole script-to-MP4 job from the command line, including
narration, and everything the Studio did is in the git history if it is wanted back.
