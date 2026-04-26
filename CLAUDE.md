# In C — project guide

Browser-based interactive realization of Terry Riley's *In C* (1964). The player
acts as **conductor**, shaping an autonomous ensemble of up to N voices, each
cycling through Riley's 53 melodic patterns at its own pace.

## Stack

- Vanilla JavaScript (ES modules), no framework, no build step.
- Web Audio API for sample playback + per-voice gain channels.
- Canvas 2D for visualization.
- Sample library: Sonatina Symphonic Orchestra (CC0). Source FLACs live in
  another project; chromatic MP3 banks are pre-rendered into `assets/audio/`
  by an offline script.
- Target deploy: static hosting (one.com). Just upload the folder.

## How to run

From the project root:

```sh
python -m http.server 8000
# then open http://localhost:8000
```

ES modules require an HTTP origin — opening `index.html` directly via `file://`
will not work.

## File structure

```
index.html                 — single page, top bar (volume / tempo / Conclude) + canvas
src/
  main.js                  — orchestration: scheduler, render loop, all input handling
  audio.js                 — AudioEngine: sample loading + per-voice gain channels +
                             optional duration envelope for sustained instruments
  score.js                 — MusicXML parser + midiToFilename helper. Loads the
                             ostinato (bar 1) and 53 figures from `In C.xml`.
  voice.js                 — Voice class: per-voice state, octave-fitting transposition,
                             sample preload, manual / auto advance, mute / gain
  roster.js                — fixed-order list of instruments (instrument, range, color,
                             sustained?) — voices spawn in this order
tools/
  build_samples.sh         — runs ffmpeg over Sonatina FLACs to generate chromatic
                             MP3 banks under assets/audio/<instrument>/<note>.mp3.
                             Sharps written as 's' (cs4 = C#4) for URL safety.
assets/audio/<instrument>/ — the pre-rendered MP3 banks (one folder per instrument)
In C.xml                   — MusicXML transcription of Riley's score
roadmap.md                 — phased build plan + status
design_holes.md            — open design questions
unused_instruments.md      — instruments built but not currently in the roster
```

## Conductor controls (current)

Per-voice (hover a voice circle):
- **left-click**  advance one figure (next loop iteration uses the new figure)
- **right-click** reverse one figure
- **scroll wheel** adjust per-voice volume
- **M** mute / unmute
- **R** repeat-lock (voice stops auto-advancing; manual advance still works)
- **← / →** swap to previous / next instrument in the roster (wraps)

Per-ostinato (hover the central black circle):
- **left-click**  shift pitch up one octave (cap C6)
- **right-click** shift pitch down one octave (floor C4)
- **scroll wheel** volume
- **M** mute / unmute
- Default pitch C5; never advances figures (just holds the eighth-note pulse)

Top bar:
- **volume** master gain
- **tempo** slider, 60–200 BPM (score is encoded at notional 120 BPM and scaled at scheduling time)
- **Conclude** — ending mode: voices hurry to the final figure regardless of dwell;
  once all are at the last figure, mute them one-by-one to end

Click on empty canvas:
- First click starts the engine + spawns voice 1 from the roster.
- Subsequent clicks spawn the next roster voice, gated by a 20s cooldown
  (a thin gray arc around the ostinato shows the cooldown progress).

## Auto-advance rule

A voice auto-advances when **all** of these hold:
1. It has looped the current figure at least `AUTO_ADVANCE_MIN_LOOPS` times (default 2).
2. It has spent at least `AUTO_ADVANCE_MIN_DWELL` seconds on the current figure (default 20).
3. It is not repeat-locked.
4. It is not at the last figure.

In ending mode, only conditions 3 and 4 (and ≥1 loop) apply, so voices hurry to the end.

There is no leading-edge constraint — voices advance independently. Spread
between voices is expected (and Riley-faithful; performers come and go at
their own pace).

## Visual encoding

- Ostinato (center): black circle, pulses on every eighth-note. Surrounded by an
  8-dot rhythm ring (clock face) showing the active pulse.
- Voice circles: arranged dynamically around the ostinato. Color = instrument hue
  (saturation/brightness shifts cool→warm with figure progress 1→last).
  Size scales with volume. Outline-only when muted. Thin in-color ring at r+5
  when repeat-locked. Current figure number drawn inside.
- Each voice has a **rhythm ring**: dots arranged at angles representing each
  non-grace note's position in the loop. Dots brighten on play.
- **Background ripples** expand from canvas center on every ostinato pulse.

## Adding a new instrument

1. Find the instrument's source samples under
   `C:\Min Fynske Barndom\Min Fynske Barndom_game\assets\audio\Sonatina Symphonic Orchestra\Samples\<Folder>`.
2. Add a `build_instrument` call to `tools/build_samples.sh` mapping each available
   source's MIDI number to its filename, and target chromatic range.
3. Run `bash tools/build_samples.sh` (requires ffmpeg).
4. Add the instrument to `ROSTER` in `src/roster.js`. Mark `sustained: true`
   for tone-holding instruments (winds, bowed strings).

## Pattern data + grace notes

`score.js` parses `In C.xml` once at page load. The encoding has:

- One bar per measure; bar 1 is the ostinato; figures are subsequent bars
  with pitched notes (rest-only spacer bars are skipped).
- Time signatures persist across measures (only emitted when changed).
- Grace notes are encoded by Sibelius as `<grace />` notes with no `<duration>`.
  We render them as 32nd-note ornaments (`GRACE_OFFSET = 0.0625s` at base BPM)
  played just before their main note (time = mainTime − GRACE_OFFSET — may be
  negative for the first beat, which the scheduler handles by landing the grace
  in the previous loop iteration's tail).
- Ties (`<tie type="stop">`) extend the previous note's duration rather than
  re-onsetting.
- Note times and durations are stored in seconds at 120 BPM. The scheduler
  scales by `tempoFactor = 120 / currentBPM` at every scheduling boundary.

## Sustained vs percussive

Each note that's scheduled on a sustained instrument is wrapped in a gain
envelope: hold at full from `when` to `when + duration`, then linearly release
to 0 over `releaseTime` (default 0.01s — a sharp cut), then `.stop()` the
source. This prevents long sample tails (clarinet, cello, etc.) from bleeding
into the next note as accidental legato.

Percussive instruments (vibraphone, marimba, celeste, harp, harpsichord, piano)
play the full sample naturally — their recorded decay is the intended sound.

## Eighth-note grid

The ostinato is the metronomic spine. New voices snap their first beat to the
next eighth-note pulse on the ostinato grid (`alignToOstinatoGrid` in main.js).
Pattern durations are all multiples of `OSTINATO_INTERVAL = 0.25s` at 120 BPM,
so once aligned a voice never drifts. Tempo changes cause a small grid kink
since we don't reset `ostinatoStartTime` on slider movement; this is acceptable
for slow drags.

## Tunable constants

In `src/main.js`:

- `SPAWN_COOLDOWN` — seconds between voice spawns (default 20)
- `AUTO_ADVANCE_MIN_LOOPS` — minimum loops before auto-advance (default 2)
- `AUTO_ADVANCE_MIN_DWELL` — minimum seconds on a figure before auto-advance (default 20)
- `BASE_BPM`, `BASE_OSTINATO_INTERVAL` — score's notional tempo (don't change
  without re-thinking score.js)
- `RIPPLE_*`, `RING_OFFSET`, `DOT_*` — Phase 2 visual params

Per-voice constants live on Voice instances; per-instrument config in `roster.js`.

## Conventions

- No HTML widgets except the top bar (volume / tempo / Conclude). All voice
  interaction happens on the canvas.
- Voice positions are recomputed every frame by `voicePosition(i, total)`,
  evenly spaced clock-face style around the ostinato.
- Audio context is created on first user click (browser autoplay policy).
- Sample paths are relative (`assets/audio/<instr>/<note>.mp3`) so the page
  works under any URL prefix.
