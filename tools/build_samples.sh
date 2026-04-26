#!/usr/bin/env bash
# build_samples.sh
# Generate chromatic MP3 sample banks from Sonatina Symphonic Orchestra FLAC samples.
# Output: ../assets/audio/<instrument>/<note>.mp3   e.g. vibraphone/c4.mp3, vibraphone/cs4.mp3
# Sharps are written as 's' (cs4 = C#4) so filenames are URL-safe.

set -euo pipefail

SOURCE_ROOT="C:/Min Fynske Barndom/Min Fynske Barndom_game/assets/audio/Sonatina Symphonic Orchestra/Samples"
DEST_ROOT="C:/myapps/in_c/assets/audio"
TARGET_RATE=44100
MP3_BITRATE=128k

# ---- Note <-> MIDI helpers (C4 = MIDI 60) ----

midi_to_note() {
  local midi=$1
  local octave=$(( midi / 12 - 1 ))
  local pc=$(( midi % 12 ))
  local names=("c" "cs" "d" "ds" "e" "f" "fs" "g" "gs" "a" "as" "b")
  echo "${names[$pc]}${octave}"
}

# Pitch-shift a flac to an mp3 by N semitones (positive = up, negative = down).
# Args: in_flac semitones out_mp3
shift_to_mp3() {
  local in="$1"
  local semis="$2"
  local out="$3"
  if [[ "$semis" == "0" ]]; then
    ffmpeg -y -loglevel error -i "$in" -b:a "$MP3_BITRATE" "$out"
  else
    local new_rate
    new_rate=$(awk -v r="$TARGET_RATE" -v s="$semis" 'BEGIN { printf "%d", r * 2.0^(s/12.0) }')
    ffmpeg -y -loglevel error -i "$in" -af "asetrate=${new_rate},aresample=${TARGET_RATE}" -b:a "$MP3_BITRATE" "$out"
  fi
}

# Build a chromatic bank for one instrument.
#   $1 instrument_name (output folder under DEST_ROOT)
#   $2 source_subdir (under SOURCE_ROOT)
#   $3 low_midi
#   $4 high_midi
#   $5..  pairs of: source_midi source_filename
build_instrument() {
  local name="$1" src_subdir="$2" low="$3" high="$4"
  shift 4
  local out_dir="${DEST_ROOT}/${name}"
  mkdir -p "$out_dir"

  local -a src_midis=() src_files=()
  while [[ $# -gt 0 ]]; do
    src_midis+=("$1"); src_files+=("$2"); shift 2
  done

  local count=$((high - low + 1))
  echo "[$name] generating $count semitones (MIDI $low..$high) from ${#src_midis[@]} sources"

  local target nearest_idx nearest_dist d delta out_name out_path src_path
  for (( target=low; target<=high; target++ )); do
    nearest_idx=0; nearest_dist=999
    for i in "${!src_midis[@]}"; do
      d=$(( target - src_midis[i] )); d=${d#-}
      if (( d < nearest_dist )); then nearest_dist=$d; nearest_idx=$i; fi
    done
    delta=$(( target - src_midis[nearest_idx] ))
    out_name=$(midi_to_note "$target")
    out_path="${out_dir}/${out_name}.mp3"
    src_path="${SOURCE_ROOT}/${src_subdir}/${src_files[nearest_idx]}"
    shift_to_mp3 "$src_path" "$delta" "$out_path"
  done
  echo "[$name] done -> $out_dir"
}

# =====================================================================
# Instrument configs
# Add new instruments by appending build_instrument calls below.
# =====================================================================

# Vibraphone — sampled at minor thirds, range C3..F6.
# Target chromatic C3..C7 (MIDI 48..96).
build_instrument "vibraphone" "Vibraphone" 48 96 \
  48 "vibraphone-c3.flac" \
  51 "vibraphone-d#3.flac" \
  54 "vibraphone-f#3.flac" \
  57 "vibraphone-a3.flac" \
  60 "vibraphone-c4.flac" \
  64 "vibraphone-e4.flac" \
  66 "vibraphone-f#4.flac" \
  69 "vibraphone-a4.flac" \
  72 "vibraphone-c5.flac" \
  75 "vibraphone-d#5.flac" \
  78 "vibraphone-f#5.flac" \
  81 "vibraphone-a5.flac" \
  84 "vibraphone-c6.flac" \
  87 "vibraphone-d#6.flac" \
  89 "vibraphone-f6.flac"

# Grand Piano — using PP velocity for a soft Riley ostinato character.
# Target chromatic C4..C7 (MIDI 60..96) — high register only for now.
build_instrument "piano" "Grand Piano" 60 96 \
  60 "PP C4.flac" \
  62 "PP D4.flac" \
  64 "PP E4.flac" \
  65 "PP F4.flac" \
  67 "PP G4.flac" \
  69 "PP A4.flac" \
  70 "PP A#4.flac" \
  71 "PP B4.flac" \
  73 "PP C#5.flac" \
  74 "PP D5.flac" \
  75 "PP D#5.flac" \
  78 "PP F#5.flac" \
  81 "PP A5.flac" \
  82 "PP A#5.flac" \
  83 "PP B5.flac" \
  84 "PP C6.flac" \
  85 "PP C#6.flac" \
  86 "PP D6.flac" \
  87 "PP D#6.flac" \
  88 "PP E6.flac" \
  89 "PP F6.flac" \
  90 "PP F#6.flac" \
  91 "PP G6.flac" \
  92 "PP G#6.flac" \
  93 "PP A6.flac" \
  94 "PP A#6.flac" \
  95 "PP B6.flac" \
  96 "PP C7.flac"

# Marimba — fully chromatic C2..C7. We use minor-third sources to limit pitch shift.
# Filename pattern: marimba-yarn-ff-<note>.flac
build_instrument "marimba" "Marimba" 48 84 \
  48 "marimba-yarn-ff-c3.flac" \
  51 "marimba-yarn-ff-d#3.flac" \
  54 "marimba-yarn-ff-f#3.flac" \
  57 "marimba-yarn-ff-a3.flac" \
  60 "marimba-yarn-ff-c4.flac" \
  63 "marimba-yarn-ff-d#4.flac" \
  66 "marimba-yarn-ff-f#4.flac" \
  69 "marimba-yarn-ff-a4.flac" \
  72 "marimba-yarn-ff-c5.flac" \
  75 "marimba-yarn-ff-d#5.flac" \
  78 "marimba-yarn-ff-f#5.flac" \
  81 "marimba-yarn-ff-a5.flac" \
  84 "marimba-yarn-ff-c6.flac"

# Celeste — sampled only at C, E, G# (major thirds). Use the "hard" variant.
build_instrument "celeste" "Celeste" 60 96 \
  60 "celeste-c4-hard.flac" \
  64 "celeste-e4-hard.flac" \
  68 "celeste-g#4-hard.flac" \
  72 "celeste-c5-hard.flac" \
  76 "celeste-e5-hard.flac" \
  80 "celeste-g#5-hard.flac" \
  84 "celeste-c6-hard.flac" \
  88 "celeste-e6-hard.flac" \
  92 "celeste-g#6-hard.flac" \
  96 "celeste-c7-hard.flac"

# Concert Harp — WAV files (ffmpeg auto-detects). Sampled at major 3rds.
build_instrument "harp" "Harp" 48 84 \
  48 "harp-c3.wav" \
  51 "harp-d#3.wav" \
  54 "harp-f#3.wav" \
  57 "harp-a3.wav" \
  60 "harp-c4.wav" \
  63 "harp-d#4.wav" \
  66 "harp-f#4.wav" \
  69 "harp-a4.wav" \
  72 "harp-c5.wav" \
  75 "harp-d#5.wav" \
  78 "harp-f#5.wav" \
  81 "harp-a5.wav" \
  84 "harp-c6.wav"

echo "All done."
