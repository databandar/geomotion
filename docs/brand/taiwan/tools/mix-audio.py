#!/usr/bin/env python3
"""
Hormuz mix: 8 narration segments at schedule times. FFmpeg-based.
"""
import json
from pathlib import Path
import subprocess

HERE = Path(__file__).resolve().parent
S = str(HERE.parent)
sched = json.load(open(f"{S}/schedule.json"))
AT, DUR = sched["at"], sched["DUR"]

inputs, filters = [], []
for i, (seg_id, seg) in enumerate(AT.items()):
    inputs += ["-i", f"{S}/vo/{seg_id}.wav"]
    delay_ms = round(seg["start"] * 1000)
    filters.append(f"[{i}:a]adelay={delay_ms}|{delay_ms},apad[vo{i}]")

n = len(AT)
label = "".join(f"[vo{i}]" for i in range(n))

cmd = [
    "ffmpeg", "-y", "-v", "error",
    *inputs,
    "-filter_complex",
    f"{';'.join(filters)};{label}amix=inputs={n}:normalize=0:duration=first[outa];[outa]atrim=0:{DUR},loudnorm=I=-16:TP=-1.5:LRA=11[final]",
    "-map", "[final]",
    "-ar", "48000", "-ac", "2",
    f"{S}/audio.wav",
]
print("mixing", len(inputs) // 2, "segments ...")
subprocess.run(cmd, check=True)
print("wrote", f"{S}/audio.wav")