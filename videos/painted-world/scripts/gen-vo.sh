#!/bin/bash
# Generate 7 narration lines via Voicebox (GeoMotion clone test), download to assets/.
PROFILE="3fcae208-1d00-44a7-9993-31db01f8f4c6"
DIR="/Users/sugandhkhobragade/Study/geolayer/videos/painted-world/assets"
mkdir -p "$DIR"

lines=(
  "The world painted by income. One hundred and sixty-nine countries."
  "The richest country on Earth — smaller than most cities."
  "Number two — banks, chocolate, watches."
  "You'd bet on first. It's sixth."
  "The bottom of the scale. Two hundred and sixty-one dollars a year."
  "One planet. Very unequal."
  "Next week — the world, painted by life expectancy."
)

for i in "${!lines[@]}"; do
  n=$((i+1))
  text="${lines[$i]}"
  out="$DIR/vo-$n.wav"
  if [ -s "$out" ]; then echo "[$n] cached $out"; continue; fi
  echo "[$n] generating: $text"
  # submit
  resp=$(curl -s -m 15 -X POST http://127.0.0.1:17493/generate \
    -H "Content-Type: application/json" \
    -d "$(python3 -c 'import json,sys
p=sys.argv[1]; t=sys.argv[2]
print(json.dumps({"profile_id":p,"text":t,"engine":"chatterbox","language":"en"}))' "$PROFILE" "$text")")
  id=$(echo "$resp" | python3 -c "import json,sys; print(json.load(sys.stdin).get('id',''))")
  echo "    submitted id=$id"
  # poll
  status=""
  for p in $(seq 1 60); do
    sleep 3
    st=$(curl -s -m 6 "http://127.0.0.1:17493/history/$id" | python3 -c "
import json,sys
try:
  d=json.load(sys.stdin)
  print(d.get('status',''), d.get('error') or '')
except Exception as e:
  print('ERR')
" 2>/dev/null)
    case "$st" in
      completed*) status="$st"; break;;
      failed*) status="$st"; echo "FAILED: $st"; break;;
    esac
  done
  if [[ "$status" == completed* ]]; then
    curl -s -m 10 "http://127.0.0.1:17493/audio/$id" -o "$out"
    dur=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$out" 2>/dev/null)
    echo "    downloaded $out  (${dur}s)"
  else
    echo "    ! did not complete: [$status]"
  fi
done
echo DONE
