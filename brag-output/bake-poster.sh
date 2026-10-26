#!/usr/bin/env bash
# Bakes brag.jpg in as frame 0 of brag.mp4, so the poster is the idle thumbnail everywhere.
#   ./bake-poster.sh <rendered.mp4> <poster.jpg> <out.mp4>
set -euo pipefail
src="$1"
poster="$2"
out="$3"
ffmpeg -v error -y -i "$src" -loop 1 -framerate 30 -t 0.0334 -i "$poster" -filter_complex \
  "[1:v]scale=1920:1080,setsar=1,format=yuv420p,trim=end_frame=1,setpts=PTS-STARTPTS[p];[0:v]trim=start_frame=1,setpts=PTS-STARTPTS[v];[p][v]concat=n=2:v=1:a=0[o]" \
  -map "[o]" -r 30 -c:v libx264 -preset slow -crf 16 -pix_fmt yuv420p -movflags +faststart "$out"
