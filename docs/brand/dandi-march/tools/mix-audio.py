#!/usr/bin/env python3
"""
"The Walk That Broke an Empire" mix: narration (7 segments) + a synthesised bed + the CC0 SFX
pack. One cue per beat, not one per second — same discipline as Malacca/Arctic's mix, and the
same pink-noise-bed lesson from Arctic's post-release fix applied from the start here (kept
quiet, volume 0.09, not the 0.38 that read as audible hiss).
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
    ("rise.ogg",    0.1,                        -19),  # opening push into the story
    ("click.ogg",   AT["s02"]["start"] + 0.15,   -14),  # the march is named
    ("pluck.ogg",   AT["s03"]["start"] + 0.15,   -16),  # the crowd starts growing
    ("drop.ogg",    AT["s04"]["start"] + 0.15,   -14),  # the salt is picked up, the law is broken
    ("alert.ogg",   AT["s05"]["start"] - 0.1,    -16),  # the crackdown
    ("chime.ogg",   AT["s06"]["start"] + 0.15,   -15),  # Time's Man of the Year
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
sub = f"sine=f=53:d={sub_dur}:r=48000,tremolo=f={86/60:.4f}:d=0.5,volume=0.20"
# Kept quiet from the start — Arctic's first mix had this at 0.38 and it read as audible
# background hiss; 0.09 keeps it a barely-there atmosphere instead.
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
