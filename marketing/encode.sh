#!/usr/bin/env bash
# Turns recorded frames into a video that fades into an end card.
#   marketing/encode.sh <frames-dir> <endcard.png> <out.mp4>
# Frames are f00000.png... at 30 fps (record.cjs writes them).
set -euo pipefail
frames=$1 card=$2 out=$3
fps=30 hold=3.2 fade=0.6
count=$(ls "$frames"/f*.png | wc -l)
len=$(awk -v n="$count" -v f="$fps" 'BEGIN { printf "%.3f", n / f }')
offset=$(awk -v l="$len" -v d="$fade" 'BEGIN { printf "%.3f", l - d }')
ffmpeg -y -loglevel error \
  -framerate $fps -i "$frames/f%05d.png" \
  -loop 1 -framerate $fps -t "$hold" -i "$card" \
  -filter_complex "[0:v]format=yuv420p,setsar=1[a];[1:v]format=yuv420p,setsar=1[b];[a][b]xfade=transition=fade:duration=$fade:offset=$offset[v]" \
  -map "[v]" -c:v libx264 -preset slow -crf 18 -tune animation -pix_fmt yuv420p -movflags +faststart "$out"
echo "$out: $(awk -v l="$len" -v h="$hold" -v d="$fade" 'BEGIN { printf "%.1f", l + h - d }')s, $(du -h "$out" | cut -f1)"
