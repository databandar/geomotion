#!/usr/bin/env python3
"""
EP001 audio mix: narration + music bed + SFX, built with ffmpeg filter_complex.

The music bed is layered rather than one source with an automated lowpass, because
automating a filter cutoff smoothly across a single ffmpeg graph is fragile; layering a
texture that only enters at the reversal is a simpler and equally legible way to deliver
the brief's "filter opens" moment (Handbook 1.10).
"""
import json, subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
S = str(HERE.parent)  # docs/brand/render/
ROOT = HERE.parents[3]  # repo root
SFX = str(ROOT / "apps/studio/public/sfx")
sched = json.load(open(f"{S}/schedule.json"))
AT, SC, DUR = sched["at"], sched["S"], sched["DUR"]

# ---- 1. narration: place each line at its measured start ----
vo_inputs, vo_filters, vo_labels = [], [], []
for i, (seg_id, t) in enumerate([(k, v["start"]) for k, v in AT.items()]):
    vo_inputs += ["-i", f"{S}/vo/{seg_id}.wav"]
    delay_ms = round(t * 1000)
    vo_filters.append(f"[{i}:a]adelay={delay_ms}|{delay_ms},apad[vo{i}]")
    vo_labels.append(f"[vo{i}]")
n_vo = len(AT)

# ---- 2. SFX cues: (file, time, gain_db) ----
SFX_CUES = [
    ("rise.ogg",    0.3,               -22),   # under the descent
    ("hush.ogg",    SC["S2"][0],       -15),   # the colour drop
    ("click.ogg",   SC["S3"][0] + 0.4, -14),
    ("click.ogg",   SC["S3"][0] + 0.9, -14),
    ("click.ogg",   SC["S3"][0] + 1.4, -14),
    ("click.ogg",   SC["S3"][0] + 1.9, -14),
    ("whoosh.ogg",  SC["S4"][0] + 0.15,-18),   # Baltic route draws
    ("select.ogg",  SC["S4"][1] - 0.6, -15),   # pinch settle
    ("click.ogg",   SC["S5"][1] - 4.2, -14),   # 700m lands
    ("whoosh.ogg",  SC["S7"][1] - 1.25,-19),
    ("whoosh.ogg",  SC["S7"][1] - 1.05,-19),
    ("whoosh.ogg",  SC["S7"][1] - 0.85,-19),
    ("drop.ogg",    SC["S8"][1] - 0.4, -14),   # ice contact
    ("click.ogg",   SC["S9"][0] + 2.5, -16),   # Murmansk lands
    ("confirm.ogg", SC["S11"][0] + 0.6,-17),   # 1 PORT
    ("click.ogg",   SC["S12"][0] + 2.6,-15),
    ("click.ogg",   SC["S12"][0] + 2.8,-15),
    ("click.ogg",   SC["S12"][0] + 3.0,-15),
]
sfx_inputs, sfx_filters, sfx_labels = [], [], []
base_i = n_vo
for j, (fname, t, db) in enumerate(SFX_CUES):
    sfx_inputs += ["-i", f"{SFX}/{fname}"]
    idx = base_i + j
    delay_ms = round(t * 1000)
    sfx_filters.append(f"[{idx}:a]volume={db}dB,adelay={delay_ms}|{delay_ms},apad[sfx{j}]")
    sfx_labels.append(f"[sfx{j}]")

# ---- 3. music bed, synthesised, layered ----
# SUB — a continuous 55Hz drone, pulsed at 92 BPM via tremolo. Present start to end, silenced
# only in the two brand silences below.
sub_dur = DUR + 1
music_filter = (
    f"sine=f=55:d={sub_dur}:r=48000,"
    f"tremolo=f={92/60:.4f}:d=0.55,"
    f"volume=0.22"
)
# TEXTURE — bandpassed pink noise, the "filter opens" layer: silent until the reversal, then
# faded in, giving the single audible brightening event the brief asks for.
open_t = SC["S10"][0]
texture_filter = (
    f"anoisesrc=d={sub_dur}:c=pink:a=0.35:r=48000,"
    f"bandpass=f=1500:width_type=o:w=1.8,"
    f"volume='if(lt(t,{open_t}),0,0.5*min(1,(t-{open_t})/1.2))':eval=frame"
)

music_filters = [
    f"{music_filter}[sub]",
    f"{texture_filter}[tex]",
    # METALLIC MOTIF — three sparse FM blips: the TURN, the HOP, and the reversal itself.
    f"aevalsrc='0.16*sin(2*PI*880*t)*exp(-6*t)':d=1.6:s=48000,adelay={round(SC['S3'][1]*1000)}|{round(SC['S3'][1]*1000)},apad[mo1]",
    f"aevalsrc='0.16*sin(2*PI*660*t)*exp(-6*t)':d=1.6:s=48000,adelay={round((SC['S7'][0]+0.4)*1000)}|{round((SC['S7'][0]+0.4)*1000)},apad[mo2]",
    f"aevalsrc='0.22*sin(2*PI*440*t)*exp(-4*t)':d=2.2:s=48000,adelay={round(open_t*1000)}|{round(open_t*1000)},apad[mo3]",
]

# The two brand silences: full mute of the whole music bed across each window.
# S10[1] equals S11[0] (scene boundaries touch), which would make this window zero-width —
# the actual silence has to start where the s10 *audio* ends, not where the S10 scene does.
sil1_a, sil1_b = SC["S2"][0], SC["S3"][0]      # under s02 + the 1.0s gap
sil2_a, sil2_b = AT["s10"]["end"], SC["S11"][0]  # silence #2, after "Gulf of Mexico"
mute_expr = (
    f"if(between(t,{sil1_a},{sil1_b}),0,"
    f"if(between(t,{sil2_a},{sil2_b}),0,1))"
)

# ---- assemble ----
all_inputs = vo_inputs + sfx_inputs
filter_complex = ";".join(
    vo_filters + sfx_filters + music_filters + [
        "[sub][tex][mo1][mo2][mo3]amix=inputs=5:normalize=0[musicraw]",
        f"[musicraw]volume='{mute_expr}':eval=frame,"
        f"afade=t=in:st=0:d=1.2,"
        f"afade=t=out:st={DUR-3.5}:d=3.5[music]",
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
    f"{S}/ep001-audio.wav",
]
print("mixing", len(all_inputs) // 2, "inputs ...")
subprocess.run(cmd, check=True)
print("wrote", f"{S}/ep001-audio.wav")
