#!/bin/bash
# Generate narration for "Circle of Humanity" using kokoro af_heart (GeoMotion af_heart).
PROFILE="1f3a52f4-4789-42e8-8753-b99496ba4b5e"
DIR="/Users/sugandhkhobragade/Study/geolayer/videos/circle-of-humanity/assets"
mkdir -p "$DIR"
[ -f "$DIR/.done" ] && { echo "already done"; exit 0; }

# id|line  -- each line is one VO clip
lines=(
  "vo-1|Eight billion people. Half of all humans — live in one circle."
  "vo-2|Tokyo. 37 million."
  "vo-3|Delhi. 31 million."
  "vo-4|Shanghai. 28 million."
  "vo-5|Mumbai. 21 million."
  "vo-6|Dhaka. 22 million."
  "vo-7|Karachi. 16 million."
  "vo-8|Jakarta. 11 million."
  "vo-9|Bangalore. 13 million."
  "vo-10|More people than every other continent. Combined. This is where the world lives."
)

for entry in "${lines[@]}"; do
  key="${entry%%|*}"; text="${entry#*|}"
  out="$DIR/$key.wav"
  if [ -s "$out" ]; then echo "[$key] cached"; continue; fi
  echo "[$key] generating: $text"
  resp=$(curl -s -m 15 -X POST http://127.0.0.1:17493/generate \
    -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys
print(json.dumps({"profile_id":sys.argv[1],"text":sys.argv[2],"engine":"kokoro","language":"en"}))' "$PROFILE" "$text")")
  id=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
  for p in $(seq 1 40); do
    sleep 3
    st=$(curl -s -m 6 "http://127.0.0.1:17493/history/$id" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
    case "$st" in completed) break;; failed) echo "FAILED"; break;; esac
  done
  curl -s -m 8 "http://127.0.0.1:17493/audio/$id" -o "$out"
  ffmpeg -y -v error -i "$out" -af "silenceremove=start_periods=0:stop_periods=1:stop_threshold=-45dB:stop_duration=0.3" -f wav "$out"
  echo "    -> $key $(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$out" 2>/dev/null)s"
done
touch "$DIR/.done"
echo DONE
