#!/usr/bin/env python3
"""
v2 audio mix: narration (8 segments, s00 under the Hyperframe clip) + a synthesised music bed
+ the CC0 SFX pack, on the ABSOLUTE timeline (schedule.json's `at`, not `atGeo`).
"""
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
S = str(HERE.parent)  # docs/brand/databandar-demo/v2/
ROOT = HERE.parents[4]  # repo root
SFX = str(ROOT / "apps/studio/public/sfx")
sched = json.load(open(f"{S}/schedule.json"))
AT, DUR = sched["at"], sched["DUR"]

# ---- 1. narration ----
vo_inputs, vo_filters, vo_labels = [], [], []
for i, (seg_id, seg) in enumerate(AT.items()):
    vo_inputs += ["-i", f"{S}/vo/{seg_id}.wav"]
    delay_ms = round(seg["start"] * 1000)
    vo_filters.append(f"[{i}:a]adelay={delay_ms}|{delay_ms},apad[vo{i}]")
n_vo = len(AT)
vo_labels = [f"[vo{i}]" for i in range(n_vo)]

# ---- 2. SFX — one cue per beat arrival ----
SFX_CUES = [
    ("rise.ogg",    0.1,                       -18),  # under the diagram's dot-resolve
    ("confirm.ogg", AT["s00"]["end"] - 0.15,    -15),  # the match cut into the globe
    ("click.ogg",   AT["s03"]["start"] + 0.25,  -14),  # Bangladesh arrives
    ("whoosh.ogg",  AT["s03"]["end"] - 0.55,    -18),  # the comparison arc draws
    ("select.ogg",  AT["s04"]["start"] + 0.35,  -15),  # Netherlands settles
    ("chime.ogg",   AT["s05"]["start"] + 0.25,  -13),  # India — the big jump
    ("bong.ogg",    AT["s06"]["start"] + 0.25,  -14),  # China — the crossing point
]
sfx_inputs, sfx_filters, sfx_labels = [], [], []
base_i = n_vo
for j, (fname, t, db) in enumerate(SFX_CUES):
    sfx_inputs += ["-i", f"{SFX}/{fname}"]
    idx = base_i + j
    delay_ms = round(t * 1000)
    sfx_filters.append(f"[{idx}:a]volume={db}dB,adelay={delay_ms}|{delay_ms},apad[sfx{j}]")
    sfx_labels.append(f"[sfx{j}]")

# ---- 3. music bed ----
sub_dur = DUR + 1
sub = f"sine=f=55:d={sub_dur}:r=48000,tremolo=f={92/60:.4f}:d=0.55,volume=0.20"
# Texture arrives once the map itself appears (s01) — the diagram plays dry/percussive, the
# map arriving is the "something opens up" moment.
open_t = AT["s01"]["start"]
tex = (
    f"anoisesrc=d={sub_dur}:c=pink:a=0.3:r=48000,bandpass=f=1500:width_type=o:w=1.8,"
    f"volume='if(lt(t,{open_t}),0,0.45*min(1,(t-{open_t})/1.0))':eval=frame"
)
music_filters = [
    f"{sub}[sub]",
    f"{tex}[tex]",
    f"aevalsrc='0.20*sin(2*PI*520*t)*exp(-5*t)':d=1.8:s=48000,"
    f"adelay={round(AT['s05']['start']*1000)}|{round(AT['s05']['start']*1000)},apad[mo1]",
]

all_inputs = vo_inputs + sfx_inputs
filter_complex = ";".join(
    vo_filters + sfx_filters + music_filters + [
        "[sub][tex][mo1]amix=inputs=3:normalize=0[music]",
        "".join(vo_labels) + f"amix=inputs={n_vo}:normalize=0[voall]",
        "".join(sfx_labels) + f"amix=inputs={len(SFX_CUES)}:normalize=0[sfxall]",
        "[voall][music][sfxall]amix=inputs=3:normalize=0:duration=longest[mixed]",
        f"[mixed]atrim=0:{DUR},afade=t=in:st=0:d=0.15,"
        f"loudnorm=I=-16:TP=-1.5:LRA=11[outa]",
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
