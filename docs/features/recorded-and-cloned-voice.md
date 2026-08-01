# Recording a voice, and speaking in it

**Design-doc section:** ARCHITECTURE §00 (the frozen-voice scar), §10 (audio clips are scene
children; the mix renders from clips at export), VISION §01 ("the voice drives the clock") ·
**Owner package(s):** `apps/studio`, `apps/pipeline` · **Status:** shipped

Two halves, deliberately separable: **record a line in the editor**, and **use a recording as
the voice the pipeline narrates in**. The first is useful on its own and depends on nothing;
the second rested on an assumption that had to be checked first.

## The spike, and what it found

The question was whether Voicebox can build a voice *from a sample*, or only pick from the
presets the pipeline already used. It can — and the answer was already half-written in this
repo's own comment: *"Chatterbox is multilingual too but is clone-only — it needs a voice
sample you own."*

Confirmed against a running instance. `voicebox 0.5.0` describes itself as a *"voice cloning
API"*, `VoiceProfileCreate.voice_type` is `cloned | preset | designed` with **`cloned` as the
default**, and `POST /profiles/{id}/samples` takes multipart `file` + `reference_text`.

`reference_text` is **required by the API, not optional politeness** — it is what lets the
engine line the audio up with phonemes instead of guessing, and an inaccurate transcript makes
a worse voice than a short sample does.

## Half A — recording in the editor

`● Record` in the toolbar. Stop, and the take lands at the playhead as an ordinary audio cue.

**That last word is the design.** A recording becomes a `File`, and `cueFromFile` already
turns a `File` into a cue with a *measured* duration. So a recorded line ripples, re-times,
ducks and mixes exactly like an imported one, and nothing downstream knows where it came
from. §00's frozen-voice scar is precisely this being a clip rather than a bed: re-record a
line and the picture follows it.

The container is negotiated, not assumed — Chrome and Firefox give WebM/Opus and Safari gives
only MP4/AAC. `MediaRecorder` throws on an unsupported type rather than falling back, so
guessing would fail at "start recording" with nothing useful to say.

**The microphone is released on both paths**, stop and cancel. A live-microphone indicator
that never goes out is the kind of bug people notice in the menu bar hours later.

Recording is a mode, so it looks like one: the button turns red and pulses, and the pulse
respects `prefers-reduced-motion` (§11).

## Half B — narrating in that voice

A script's `voice` block gains two fields:

```jsonc
"voice": {
  "engine": "voicebox",
  "vbEngine": "chatterbox",
  "language": "en",
  "voiceSample": "takes/my-voice.wav",
  "sampleText": "The exact words spoken in that file."
}
```

Supplying `voiceSample` switches profile creation from preset to **cloned**: one `POST
/profiles` and one sample upload, then generation proceeds unchanged. A `presetVoice` still
works and still needs no sample, no consent question and no transcript.

### Two bugs this shape would have had

**Two clones would have shared a profile.** The cached profile name was built from
`presetVoice`, which a clone does not have — so every cloned voice resolved to
`GeoMotion en default`, and the second sample would silently reuse the first one's profile and
speak in the wrong voice. The name now carries the sample's filename.

**Generation would have asked Kokoro to speak a cloned profile.** The engine sent at
`/generate` defaulted to `kokoro`, which is preset-only. It follows the profile's own
`default_engine` now — otherwise the failure arrives as a generation error with nothing
explaining why.

### Measured: the first clone is slow, and the timeout knew nothing about it

An end-to-end run against a live Voicebox created the profile, uploaded the sample and
accepted the generation — then sat in `loading_model` past seven minutes while Chatterbox
fetched its weights. Kokoro's presets are already resident, so this only happens to clones,
and only the first time.

The budget is therefore **600 s for a cloned voice and 180 s for a preset**, and the timeout
message says why:

> Voicebox still loading_model after 600s — a cloned voice downloads its model the first time.
> Leave Voicebox open and run again; the second run is fast.

## Consent

Cloning your own voice is ordinary. Cloning someone else's recording is not something this
should make frictionless, so it is not one click: the script names a file on your own disk and
types out what it says. That is deliberate enough that nobody does it by accident, and it is
the same bar Voicebox itself sets by requiring the sample and its transcript.

## Tests

`apps/studio/src/lib/recorder.test.ts` — the container negotiation and file naming: Opus
preferred, MP4 for Safari, `null` rather than a type that would throw, and no guessing at an
unknown container.

`MediaRecorder` and a live microphone are not simulated. A mock of them tests the mock; the
half worth pinning is the logic, and the rest was exercised by running it.

Half B was verified against a live Voicebox rather than a stub — which is the only reason the
two profile bugs and the model-load budget are in this file rather than in a bug report later.

## Future extensions

- **Re-voice existing narration in place** — the pipeline can already do it by changing the
  script's `voice` block and re-running; an editor command that does it per line would be the
  natural next step.
- **Record straight into a story block**, so the take replaces that line's audio and ripples,
  rather than landing at the playhead as a loose clip.
- **A level meter while recording.** Right now you find out the microphone was muted after
  you stop.
