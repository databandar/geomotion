#!/usr/bin/env python3
"""
"The Ice Is Opening a Shortcut" mix: narration (7 segments) + a synthesised bed + the CC0 SFX
pack. One cue per beat, not one per second — same discipline as Malacca's mix.
"""
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
S = str(HERE.parent)
ROOT = HERE.parents[3]
SFX = str(ROOT / "apps/studio/public/sfx")
sched = json.load(open(f"{S}/schedule.json"))
AT, DUR = sched["at"], sched["DUR"]

vo_inputs, vo_filters, vo_labels = [], [], []
for i, (seg_id, seg) in enumerate(AT.items()):
    vo_inputs += ["-i", f"{S}/vo/{seg_id}.wav"]
    delay_ms = round(seg["start"] * 1000)
    vo_filters.append(f"[{i}:a]adelay={delay_ms}|{delay_ms},apad[vo{i}]")
n_vo = len(AT)
vo_labels = [f"[vo{i}]" for i in range(n_vo)]

SFX_CUES = [
    ("rise.ogg",    0.1,                        -19),  # opening push into the Arctic
    ("click.ogg",   AT["s02"]["start"] + 0.15,   -14),  # the route itself, named
    ("select.ogg",  AT["s03"]["start"] + 0.15,   -16),  # the distance stat settles
    ("alert.ogg",   AT["s04"]["start"] + 0.15,   -16),  # the catch — only open part of the year
    ("whoosh.ogg",  AT["s05"]["start"] - 0.1,    -18),  # Russia lights up, the control beat
    ("bong.ogg",    AT["s06"]["start"] + 0.15,   -14),  # the -12%/decade stat
    ("confirm.ogg", AT["s07"]["start"] + 0.15,   -14),  # the closing card
]
sfx_inputs, sfx_filters, sfx_labels = [], [], []
base_i = n_vo
for j, (fname, t, db) in enumerate(SFX_CUES):
    sfx_inputs += ["-i", f"{SFX}/{fname}"]
    idx = base_i + j
    delay_ms = round(t * 1000)
    sfx_filters.append(f"[{idx}:a]volume={db}dB,adelay={delay_ms}|{delay_ms},apad[sfx{j}]")
    sfx_labels.append(f"[sfx{j}]")

sub_dur = DUR + 1
sub = f"sine=f=52:d={sub_dur}:r=48000,tremolo=f={88/60:.4f}:d=0.5,volume=0.20"
# The pink-noise "tex" bed reads as audible background hiss against the quieter passages
# (measured noise floor only ~13dB below narration in a silent gap) — cut hard, from 0.38 to
# 0.09, so it stays a barely-there atmosphere instead of a constant hiss under the whole video.
tex = (
    f"anoisesrc=d={sub_dur}:c=pink:a=0.28:r=48000,bandpass=f=1400:width_type=o:w=1.8,"
    f"volume=0.09"
)
music_filters = [
    f"{sub}[sub]",
    f"{tex}[tex]",
    f"aevalsrc='0.18*sin(2*PI*440*t)*exp(-5*t)':d=1.8:s=48000,"
    f"adelay={round(AT['s05']['start']*1000)}|{round(AT['s05']['start']*1000)},apad[mo1]",
]

all_inputs = vo_inputs + sfx_inputs
filter_complex = ";".join(
    vo_filters + sfx_filters + music_filters + [
        "[sub][tex][mo1]amix=inputs=3:normalize=0[music]",
        "".join(vo_labels) + f"amix=inputs={n_vo}:normalize=0[voall]",
        "".join(sfx_labels) + f"amix=inputs={len(SFX_CUES)}:normalize=0[sfxall]",
        "[voall][music][sfxall]amix=inputs=3:normalize=0:duration=longest[mixed]",
        f"[mixed]atrim=0:{DUR},afade=t=in:st=0:d=0.15,loudnorm=I=-16:TP=-1.5:LRA=11[outa]",
    ]
)

cmd = [
    "ffmpeg", "-y", "-v", "error",
    *all_inputs,
    "-filter_complex", filter_complex,
    "-map", "[outa]",
    "-ar", "48000", "-ac", "2",
    f"{S}/audio.wav",
]
print("mixing", len(all_inputs) // 2, "inputs ...")
subprocess.run(cmd, check=True)
print("wrote", f"{S}/audio.wav")
