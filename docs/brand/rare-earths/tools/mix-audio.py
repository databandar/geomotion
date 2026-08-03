#!/usr/bin/env python3
"""Rare Earths v2 — narration + SFX mixed to schedule times. FFmpeg-based."""
import json, subprocess
from pathlib import Path

HERE = Path(__file__).resolve().parent
S = str(HERE.parent)
SFX = "/Users/sugandhkhobragade/Study/geolayer/apps/studio/public/sfx"
sched = json.load(open(f"{S}/schedule.json"))
AT, DUR = sched["at"], sched["DUR"]

# narration segments (order by start)
segs = sorted(AT.items(), key=lambda kv: kv[1]["start"])
inputs, filters = [], []
idx = 0
for i, (seg_id, seg) in enumerate(segs):
    inputs += ["-i", f"{S}/vo/{seg_id}.wav"]
    delay_ms = round(seg["start"] * 1000)
    filters.append(f"[{i}:a]adelay={delay_ms}|{delay_ms},apad[vo{i}]")
    idx = i + 1

# SFX cues: (file, start_s, gain)
sfx_cues = [
    # S01 hook camera whoosh
    (f"{SFX}/whoosh.ogg", AT["s01"]["start"]+0.1, 0.5),
    (f"{SFX}/rise.ogg",   AT["s01"]["start"]+2.0, 0.4),
    # S02 element reveals — plucks
    (f"{SFX}/pluck.ogg", AT["s02"]["start"]+1.0, 0.5),
    (f"{SFX}/pluck.ogg", AT["s02"]["start"]+2.0, 0.5),
    (f"{SFX}/pluck.ogg", AT["s02"]["start"]+3.0, 0.5),
    (f"{SFX}/pluck.ogg", AT["s02"]["start"]+4.0, 0.5),
    # S03 China reveal — whoosh + chime
    (f"{SFX}/whoosh.ogg", AT["s03"]["start"]+0.2, 0.5),
    (f"{SFX}/confirm.ogg", AT["s03"]["start"]+1.0, 0.5),
    (f"{SFX}/confirm.ogg", AT["s03"]["start"]+2.5, 0.5),
    # S04 mine spread — ticks
    (f"{SFX}/tick.ogg", AT["s04"]["start"]+0.8, 0.5),
    (f"{SFX}/tick.ogg", AT["s04"]["start"]+1.8, 0.5),
    (f"{SFX}/tick.ogg", AT["s04"]["start"]+2.8, 0.5),
    (f"{SFX}/tick.ogg", AT["s04"]["start"]+3.8, 0.5),
    # S05 US — whoosh + select
    (f"{SFX}/whoosh.ogg", AT["s05"]["start"]+0.2, 0.5),
    (f"{SFX}/select.ogg", AT["s05"]["start"]+1.2, 0.5),
    # S06 India — rise
    (f"{SFX}/rise.ogg", AT["s06"]["start"]+0.3, 0.5),
    # S07 close — chime
    (f"{SFX}/chime.ogg", AT["s07"]["start"]+0.5, 0.5),
]

sfx_filters = []
for sfx_id, (file, t, gain) in enumerate(sfx_cues):
    inputs += ["-i", file]
    n = idx + sfx_id
    delay_ms = round(t * 1000)
    # gain then delay; volume then apad
    sfx_filters.append(f"[{n}:a]volume={gain},adelay={delay_ms}|{delay_ms},apad[sf{sfx_id}]")

all_labels = [f"[vo{i}]" for i in range(len(segs))] + [f"[sf{s}]" for s in range(len(sfx_cues))]
n_in = len(all_labels)

fc = ";".join(filters + sfx_filters)
fc += f";{''.join(all_labels)}amix=inputs={n_in}:normalize=0:duration=first[outa]"
fc += f";[outa]atrim=0:{DUR},loudnorm=I=-16:TP=-1.5:LRA=11[final]"

cmd = ["ffmpeg", "-y", "-v", "error", *inputs, "-filter_complex", fc, "-map", "[final]", "-ar", "48000", "-ac", "2", f"{S}/audio.wav"]
print("mixing", len(segs), "narration +", len(sfx_cues), "sfx")
subprocess.run(cmd, check=True)
print("wrote", f"{S}/audio.wav")