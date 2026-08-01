#!/usr/bin/env python3
"""
DataBandar demo mix: narration + a synthesised music bed + the CC0 SFX pack.

Adapted from docs/brand/render/tools/mix-audio.py — same layered-bed approach (a texture
that fades in rather than an automated filter sweep), scaled down for a 40s piece with four
tour-stop reveals instead of thirteen scenes.
"""
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
S = str(HERE.parent)  # docs/brand/databandar-demo/
ROOT = HERE.parents[3]  # repo root
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

# ---- 2. SFX cues — one per beat, not one per second ----
SFX_CUES = [
    ("rise.ogg",    0.2,                 -20),  # under the globe descent
    ("click.ogg",   AT["s03"]["start"] + 0.2, -15),  # density reveal begins
    ("select.ogg",  AT["s04"]["start"] + 0.15, -16), # Netherlands
    ("chime.ogg",   AT["s05"]["start"] + 0.15, -14), # India — the big jump gets the brightest cue
    ("confirm.ogg", AT["s06"]["start"] + 0.15, -15), # China — the crossing point
    ("bong.ogg",    AT["s07"]["start"] + 0.3,  -14), # the closing stat lands
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
# Texture fades in once the density reveal begins (s03) — the "something more is here now"
# moment — rather than staying static under the cold open.
open_t = AT["s03"]["start"]
tex = (
    f"anoisesrc=d={sub_dur}:c=pink:a=0.3:r=48000,bandpass=f=1500:width_type=o:w=1.8,"
    f"volume='if(lt(t,{open_t}),0,0.45*min(1,(t-{open_t})/1.0))':eval=frame"
)
music_filters = [
    f"{sub}[sub]",
    f"{tex}[tex]",
    # One motif hit: India's stop, the single biggest number in the piece.
    f"aevalsrc='0.20*sin(2*PI*520*t)*exp(-5*t)':d=1.8:s=48000,"
    f"adelay={round(AT['s05']['start']*1000)}|{round(AT['s05']['start']*1000)},apad[mo1]",
]

# One brand silence: the claim (s02) plays dry, same device as EP001's dead-hold.
sil_a, sil_b = AT["s02"]["start"], AT["s03"]["start"]
mute_expr = f"if(between(t,{sil_a},{sil_b}),0,1)"

all_inputs = vo_inputs + sfx_inputs
filter_complex = ";".join(
    vo_filters + sfx_filters + music_filters + [
        "[sub][tex][mo1]amix=inputs=3:normalize=0[musicraw]",
        f"[musicraw]volume='{mute_expr}':eval=frame,"
        f"afade=t=in:st=0:d=1.0,afade=t=out:st={DUR-3.0}:d=3.0[music]",
        "".join(vo_labels) + f"amix=inputs={n_vo}:normalize=0[voall]",
        "".join(sfx_labels) + f"amix=inputs={len(SFX_CUES)}:normalize=0[sfxall]",
        "[voall][music][sfxall]amix=inputs=3:normalize=0:duration=longest[mixed]",
        f"[mixed]atrim=0:{DUR},loudnorm=I=-16:TP=-1.5:LRA=11[outa]",
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
