#!/bin/bash
# Synthesises the "World" group of the built-in sound library with ffmpeg —
# no download, no licence to track, reproducible by re-running this file.
#
# Same approach as the three Transitions sounds (hush/whoosh/rise, see
# docs/features/sound-library.md): the Kenney pack this library otherwise draws
# from is UI sounds, and has no ocean, no wind, no engine, no march. Each recipe
# below is filtered noise or a plain sine, not a sample of anything.
#
# Run from anywhere; writes straight into public/sfx/. Requires ffmpeg with
# libopus (`ffmpeg -codecs | grep opus`).
set -euo pipefail
cd "$(dirname "$0")/.."
OUT=public/sfx
TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT

synth() {
  # $1 name, $2 duration-tagged filter graph producing the raw wav, $3 gain
  # needed to bring its peak to about -1 dBFS (measured once per sound and
  # hard-coded here, the same way the rest of the library is peak-normalised).
  local name="$1" wav="$TMP/$1.wav" gain="$3"
  eval "$2" -ac 1 "$wav"
  ffmpeg -y -hide_banner -loglevel error -i "$wav" -af "volume=${gain}dB" -ac 1 -c:a libopus -b:a 96k "$OUT/$name.ogg"
  echo "  $name.ogg"
}

echo "Synthesising World sfx into $OUT ..."

# Ocean waves — brown noise, lowpassed for a soft surf tone, tremolo-swelled at
# surf cadence rather than white-noise flat. Loops reasonably at ~6s.
synth ocean-waves \
  'ffmpeg -y -hide_banner -loglevel error -f lavfi -i "anoisesrc=d=6:color=brown:seed=7" -af "lowpass=f=900,tremolo=f=0.18:d=0.75,afade=t=in:d=1.2,afade=t=out:st=4.8:d=1.2,alimiter=limit=0.92"' \
  4.3

# Wind — pink noise, band-limited, slow gust modulation.
synth wind \
  'ffmpeg -y -hide_banner -loglevel error -f lavfi -i "anoisesrc=d=5:color=pink:seed=3" -af "highpass=f=200,lowpass=f=3200,tremolo=f=0.12:d=0.55,afade=t=in:d=1,afade=t=out:st=4:d=1,alimiter=limit=0.9"' \
  6.5

# Foghorn — a single low blast (foghorns sit ~70-150Hz), light vibrato so it
# doesn't read as a pure test tone, quick attack and a long release.
synth foghorn \
  'ffmpeg -y -hide_banner -loglevel error -f lavfi -i "sine=frequency=130:duration=2.6" -af "vibrato=f=4.5:d=0.15,afade=t=in:d=0.15,afade=t=out:st=1.3:d=1.3,alimiter=limit=0.9"' \
  16.1

# Engine rumble — a sub sine plus lowpassed noise, with a subtle fast tremolo
# standing in for cylinder chug. Loopable at ~4s.
synth engine-rumble \
  'ffmpeg -y -hide_banner -loglevel error -f lavfi -i "sine=frequency=55:duration=4" -f lavfi -i "anoisesrc=d=4:color=brown:seed=11" -filter_complex "[1:a]lowpass=f=300[n];[0:a][n]amix=inputs=2:weights=1 0.6,tremolo=f=7:d=0.12,afade=t=in:d=0.6,afade=t=out:st=3.4:d=0.6,alimiter=limit=0.9"' \
  8.5

# Footsteps (march) — band-passed noise gated at a walking cadence (~2Hz) so
# it reads as a crowd's rhythm, not a hiss.
synth footsteps-march \
  'ffmpeg -y -hide_banner -loglevel error -f lavfi -i "anoisesrc=d=3:color=brown:seed=5" -af "bandpass=f=260:width_type=h:w=220,tremolo=f=2.1:d=0.92,afade=t=in:d=0.2,afade=t=out:st=2.6:d=0.4,alimiter=limit=0.9"' \
  7.4

# Distant thunder — heavily lowpassed noise plus a falling sub sweep (60→45Hz
# over the clip), swelled rather than triggered, for a dramatic turn.
synth distant-thunder \
  'ffmpeg -y -hide_banner -loglevel error -f lavfi -i "anoisesrc=d=4:color=brown:seed=13" -f lavfi -i "aevalsrc=0.5*sin(2*PI*(60-15*t/4)*t):d=4" -filter_complex "[0:a]lowpass=f=180[n];[n][1:a]amix=inputs=2:weights=1 0.7,tremolo=f=0.35:d=0.5,afade=t=in:d=0.8,afade=t=out:st=2.8:d=1.2,alimiter=limit=0.9"' \
  6.2

echo "Done."
