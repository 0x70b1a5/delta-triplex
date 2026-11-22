#!/usr/bin/env bash
# Cuts a looping GIF from recorded frames.
#   marketing/gif.sh <frames-dir> <first-frame> <last-frame> <out.gif> [width] [speed]
# The trailer's GIF: marketing/gif.sh /tmp/frames-desk <first> <last> marketing/delta-triplex-play.gif 800 1.25
set -euo pipefail
frames=$1 first=$2 last=$3 out=$4 width=${5:-800} speed=${6:-1}
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
k=0
for ((i = first; i <= last; i++)); do ln -s "$(realpath "$frames")/$(printf 'f%05d.png' $i)" "$tmp/$(printf 'g%05d.png' $k)"; k=$((k + 1)); done
# 15 fps after the speed-up; one palette for the whole loop keeps colours steady.
filters="setpts=PTS/$speed,fps=15,scale=$width:-1:flags=lanczos"
ffmpeg -y -loglevel error -framerate 30 -i "$tmp/g%05d.png" \
  -vf "$filters,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  -loop 0 "$out"
echo "$out: $(du -h "$out" | cut -f1)"
