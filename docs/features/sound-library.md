# The sound library

Eighteen sounds built into the editor. `+ Sound` in the toolbar, preview one, click it, and it
lands at the playhead.

## What a library sound is

An ordinary audio cue.

That is the whole design. Picking a sound fetches the file and hands it to `cueFromFile` —
the same function an imported file goes through — so it is decoded, measured, embedded as a
data URL, and dropped into `audio.cues` like anything else. From that point nothing knows it
came from the library. It ripples when a block moves, it retimes when you drag it, it mixes
in the preview and in the render through code that was already there, and a project that used
one still opens on a machine that has never seen this repo.

The alternative — a separate `SfxCue` type with its own timing, its own mixing path and its own
migration — would have been a second, worse audio model to keep in step with the first.

## The one thing that is genuinely new: `role: 'sfx'`

`AudioCue.role` was `'music' | undefined`. It is now `'music' | 'sfx' | undefined`.

Ducking, before this: a `music` clip drops to a quarter of its level whenever **any**
non-music clip plays over it, with a 0.3 s fade either side.

A click is 0.1 s long. Ducking a score under it would mean 0.3 s down, 0.1 s held, 0.3 s back
up — the fades are six times longer than the sound that caused them, and what you hear is not
room being made, it is the music pumping. Every sound in this library is shorter than the duck
fade except the three transitions.

So `sfx` is foreground like narration — never ducked itself — but it does not *cause* a duck.
Only speech is worth making room for.

`gainCurve` skips `sfx` clips when looking for something to duck under. It skips them
individually, not the whole list, so an effect playing at the same moment as a line does not
suppress that line's duck.

No migration: no document written before this can contain the new value.

## Why the Inspector grew a Role select

It had a **Music bed** toggle. A toggle has two states and the role now has three, so an effect
would have shown as "not music", and touching the control twice would have landed it on
foreground — which is exactly the state that ducks the score under a click.

It is now `Voice / foreground · Music bed · Sound effect`.

### A bug this uncovered

The toggle could be turned on and never off. `set({ role: undefined })` reached
`assignChanged`, which skipped any patch value that was `undefined` — so clearing a field
through it was impossible, and the toggle snapped back.

Absent and explicitly-undefined are distinguishable (`Object.keys({a: undefined})` is `['a']`),
so `assignChanged` now deletes on an explicit `undefined` and still ignores an absent key.
`exactOptionalPropertyTypes` does the rest: a property not declared `| undefined` cannot be
handed one. Undo restores the deleted field, which is the half worth testing and is tested.

## The sounds

Eighteen, in four groups, chosen for moments that come up in a map video. Small on purpose — a
hundred sounds is a worse library than fifteen if finding the click means auditioning all
hundred. The Kenney pack ships six clicks; this takes one.

| Group | Sounds |
|---|---|
| Interface | click, tick, select, toggle, switch |
| Accents | bong, pluck, chime, confirm, drop, alert |
| Panels | card-in, card-out, zoom-in, zoom-out |
| Transitions | hush, whoosh, rise |

They are peak-normalised to about −1 dBFS, which is right for a library — you can hear what
you are picking — and too loud next to narration, so a placed sound starts at `gain: 0.7`. It
is an ordinary cue gain; the Inspector changes it like any other.

Preview plays at that same 0.7, so the audition is not louder than the result.

## Licensing

Everything here is CC0, and both halves are checkable rather than asserted.

- **Fifteen sounds** are from [Kenney's Interface Sounds](https://kenney.nl/assets/interface-sounds),
  curated down from the pack's hundred. The pack's own licence text ships beside them at
  `apps/studio/public/sfx/KENNEY-LICENSE.txt`: *"License: (Creative Commons Zero, CC0) …
  free to use in personal, educational and commercial projects."* Crediting Kenney is not
  required; this file is the credit anyway.
- **Three transitions** — `hush`, `whoosh`, `rise` — were synthesised for this repo with
  ffmpeg, because the Kenney pack is interface sounds and has no whooshes, and a hush under a
  clearing layer was the example that prompted the feature. Pink noise through a lowpass with a
  long tail; band-passed noise with a swell; a 150→550 Hz chirp. Generated, so their provenance
  is not a claim about a download.

All eighteen are Opus in `.ogg`, mono, ~96 kbps — 224 KB for the set.

## What this deliberately does not do

**Sounds are placed by hand.** The request that started this was "a hush after the cloud
disappears, a click when the state is selected" — a sound triggered by something happening.
That is a behaviour (ARCHITECTURE §06), and it needs an event model the document does not
have: nothing in GeoMotion emits "this layer finished fading" for anything else to listen to.

Inventing one to carry eighteen ogg files would be building the wrong thing first, and it
would be the third timing mechanism in the app. When behaviours arrive they can trigger these
same sounds, and none of this changes — a triggered sound still resolves to a cue.

**There is no script syntax for a library sound.** Once picked, a sound is embedded in the
document, so the pipeline needs nothing to render it. Naming sounds from a script is a
different feature and is not needed by this one.

## Files

- `apps/studio/public/sfx/*.ogg` — the sounds, plus `KENNEY-LICENSE.txt`
- `apps/studio/src/lib/sfx.ts` — the manifest and `cueFromLibrary`
- `apps/studio/src/lib/sfx.test.ts` — manifest and files must agree in both directions; an id
  with no file is a 404 at the moment someone clicks it, which no type checker would catch
- `packages/document/src/audio.ts` — `gainCurve`, and which roles trigger a duck
