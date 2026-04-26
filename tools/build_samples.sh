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

# Grand Piano — PP velocity throughout for a soft Riley ostinato character.
# Target chromatic C3..C7 (MIDI 48..96) — extended low range so the piano can
# also serve as a mid/low roster voice distinct from the high-C ostinato.
build_instrument "piano" "Grand Piano" 48 96 \
  48 "PP C3.flac" \
  50 "PP D3.flac" \
  52 "PP E3.flac" \
  53 "PP F3.flac" \
  55 "PP G3.flac" \
  57 "PP A3.flac" \
  59 "PP B3.flac" \
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

# Crotales — high metallic shimmer, naturally high register.
# Naming: crotale-<note>-ff.flac. Sampled chromatically; we use minor-third sources.
build_instrument "crotales" "Crotales" 84 96 \
  84 "crotale-c6-ff.flac" \
  87 "crotale-d#6-ff.flac" \
  90 "crotale-f#6-ff.flac" \
  93 "crotale-a6-ff.flac" \
  96 "crotale-c7-ff.flac"

# Harpsichord — plucked keyboard. Use the High set ("Sustains/High"), with
# Sonatina's "Far" mic position for a rounder tone. Naming is unique:
# HarpsiRH_High_Far_<note>_rr1.flac.
build_instrument "harpsichord" "Harpsichord/Sustains/High" 48 72 \
  49 "HarpsiRH_High_Far_C#3_rr1.flac" \
  52 "HarpsiRH_High_Far_E3_rr1.flac" \
  54 "HarpsiRH_High_Far_F#3_rr1.flac" \
  56 "HarpsiRH_High_Far_G#3_rr1.flac" \
  57 "HarpsiRH_High_Far_A3_rr2.flac" \
  61 "HarpsiRH_High_Far_C#4_rr1.flac" \
  62 "HarpsiRH_High_Far_D4_rr1.flac" \
  64 "HarpsiRH_High_Far_E4_rr1.flac" \
  66 "HarpsiRH_High_Far_F#4_rr1.flac" \
  68 "HarpsiRH_High_Far_G#4_rr1.flac" \
  70 "HarpsiRH_High_Far_A#4_rr1.flac" \
  72 "HarpsiRH_High_Far_C5_rr1.flac"

# Flute — woodwind, sampled at minor thirds. Naming: flute-<note>.wav.
build_instrument "flute" "Flute" 60 84 \
  57 "flute-a3.wav" \
  60 "flute-c4.wav" \
  63 "flute-d#4.wav" \
  66 "flute-f#4.wav" \
  69 "flute-a4.wav" \
  72 "flute-c5.wav" \
  75 "flute-d#5.wav" \
  78 "flute-f#5.wav" \
  81 "flute-a5.wav" \
  84 "flute-c6.wav"

# Clarinet — mellow woodwind. Sampled at minor thirds D/F/G#/B per octave.
build_instrument "clarinet" "Clarinet" 50 83 \
  50 "clarinet-d3.wav" \
  53 "clarinet-f3.wav" \
  56 "clarinet-g#3.wav" \
  59 "clarinet-b3.wav" \
  62 "clarinet-d4.wav" \
  65 "clarinet-f4.wav" \
  68 "clarinet-g#4.wav" \
  71 "clarinet-b4.wav" \
  74 "clarinet-d5.wav" \
  77 "clarinet-f5.wav" \
  80 "clarinet-g#5.wav" \
  83 "clarinet-b5.wav" \
  86 "clarinet-d6.wav"

# Oboe — reedy woodwind. Sampled at major-third intervals A#/C#/E/G.
build_instrument "oboe" "Oboe" 58 82 \
  58 "oboe-a#3.wav" \
  61 "oboe-c#4.wav" \
  64 "oboe-e4.wav" \
  67 "oboe-g4.wav" \
  70 "oboe-a#4.wav" \
  73 "oboe-c#5.wav" \
  76 "oboe-e5.wav" \
  79 "oboe-g5.wav" \
  82 "oboe-a#5.wav" \
  84 "oboe-c6.wav"

# Double bass (solo) — bowed sustained, deep low register.
# Filename pattern: bass-sus-<note>.flac. Sampled at minor thirds.
build_instrument "doublebass" "Bass" 28 60 \
  24 "bass-sus-c1.flac" \
  27 "bass-sus-d#1.flac" \
  30 "bass-sus-f#1.flac" \
  33 "bass-sus-a1.flac" \
  36 "bass-sus-c2.flac" \
  39 "bass-sus-d#2.flac" \
  42 "bass-sus-f#2.flac" \
  45 "bass-sus-a2.flac" \
  48 "bass-sus-c3.flac" \
  51 "bass-sus-d#3.flac" \
  54 "bass-sus-f#3.flac" \
  57 "bass-sus-a3.flac" \
  60 "bass-sus-c4.flac"

# Cello — bowed string warmth in the low register.
build_instrument "cello" "Cello" 36 65 \
  36 "cello-c2.wav" \
  39 "cello-d#2.wav" \
  42 "cello-f#2.wav" \
  45 "cello-a2.wav" \
  48 "cello-c3.wav" \
  51 "cello-d#3.wav" \
  54 "cello-f#3.wav" \
  57 "cello-a3.wav" \
  60 "cello-c4.wav" \
  63 "cello-d#4.wav" \
  66 "cello-f#4.wav"

echo "All done."
