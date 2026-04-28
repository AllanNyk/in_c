# In C — project guide

Browser-based interactive realization of Terry Riley's *In C* (1964). The
player acts as **conductor**, shaping an autonomous ensemble of up to 11
voices, each cycling through Riley's 53 melodic patterns at its own pace.

Live at https://allansjoelin.com/in_c/. Source at
https://github.com/AllanNyk/in_c.

## Stack

- Vanilla JavaScript (ES modules), no framework, no build step.
- Web Audio API for sample playback, per-voice gain + pan channels, per-voice
  EQ, master 3-band EQ, convolution reverb, master bus compressor.
- Canvas 2D for visualization. HTML overlay for top bar + modals + touch panel.
- Pointer Events for unified mouse / touch handling.
- Sample library: Sonatina Symphonic Orchestra (CC0). Source FLACs live in
  another project; chromatic MP3 banks are pre-rendered into `assets/audio/`
  by an offline script.
- Reverb IR: Theatre@41 from openairlib.net (CC-BY, University of York).
- Target deploy: static hosting (one.com). GitHub Actions workflow uploads
  changes to `webroots/www/in_c/` on every push to `master`.

## How to run locally

From the project root:

```sh
python -m http.server 8000
# then open http://localhost:8000
```

ES modules require an HTTP origin — opening `index.html` directly via
`file://` will not work. You also need `In C.xml` at the project root for
the parser to find anything (see "Score source files" below).

## File structure

```
index.html                 — single page: top bar, canvas, help/about modals,
                             endgame buttons, touch panel
src/
  main.js                  — orchestration: scheduler, render loop, all input
                             handling, mandala generation
  audio.js                 — AudioEngine: sample loading, per-voice channels
                             (gain + pan + EQ), master EQ + compressor +
                             convolution reverb, optional duration envelope
                             for sustained instruments
  score.js                 — MusicXML parser + midiToFilename helper. Loads
                             the ostinato (bar 1) and 53 figures from
                             `In C.xml`.
  voice.js                 — Voice class: per-voice state, octave-fitting
                             transposition, sample preload, manual + auto
                             advance, per-note velocity / timing / detune
                             humanization, mute / gain / pan
  roster.js                — fixed-order list of instruments
                             (instrument, range, color, sustained?) — voices
                             spawn in this order
tools/
  build_samples.sh         — runs ffmpeg over Sonatina FLACs to generate
                             chromatic MP3 banks under
                             assets/audio/<instrument>/<note>.mp3.
                             Sharps written as 's' (cs4 = C#4) for URL safety.
assets/audio/<instrument>/ — pre-rendered MP3 banks (one folder per instrument)
assets/audio/ir/           — convolution reverb IR (theatre41.wav)
assets/og_preview.png      — social-card preview image
.github/workflows/
  deploy.yml               — SFTP deploy to one.com on push to master
In C.xml                   — MusicXML transcription (NOT in the public repo —
                             see "Score source files" below)
roadmap.md                 — phased build plan + status
design_holes.md            — open design questions
unused_instruments.md      — instruments built but not currently in the roster
```

## Conductor controls (current)

Per-voice (hover a voice circle):
- **left-click** — advance one figure (next loop iteration uses the new figure)
- **right-click** — reverse one figure
- **ctrl + click** — advance / reverse by 5 figures
- **shift + left-click** — align every other voice to this voice's current figure
- **scroll wheel** — adjust per-voice volume
- **M** — mute / unmute (~150ms exponential fade, click-free)
- **R** — repeat-lock (voice stops auto-advancing; manual advance still works)
- **← / →** — swap to previous / next instrument in the roster (wraps)

Per-ostinato (hover the central black circle):
- **left-click** — shift pitch up one octave (cap C6)
- **right-click** — shift pitch down one octave (floor C4)
- **scroll wheel** — volume
- **M** — mute / unmute
- **H** — hide visually (audio keeps playing; hover area unchanged)
- Default pitch C5; never advances figures (just holds the eighth-note pulse)

Top bar (left to right):
- **volume** — master gain (default 0.85)
- **tempo** — slider, 60–200 BPM (default 120 — score is encoded at notional
  120 BPM and scaled at scheduling time)
- **reverb** — wet level for Theatre@41 IR (default 25%)
- **bass / mid / treble** — 3-band master EQ, ±12 dB. Defaults: bass +6,
  mid 0, treble 0.
- **Random** — visible only after all 11 voices spawned; rerolls every
  unlocked voice to a random figure (same as global R-key)
- **Conclude** — hidden until all 11 voices have reached the final figure;
  triggers ending mode (the "dismantling" — see below)
- **About** — credits modal (Allan Sjølin, Terry Riley, Theatre@41 IR
  attribution)
- **?** — opens the help modal listing all controls

Global keys (no hover required):
- **R** (when nothing is hovered) — randomize all unlocked voices' figures
  (only effective once 11 voices are spawned)
- **?** — toggle the help modal
- **Esc** — close any modal

Click on empty canvas:
- First click starts the engine + spawns voice 1 from the roster.
- Subsequent clicks spawn the next roster voice, gated by a 10 s cooldown
  (a thin gray arc around the ostinato shows the cooldown progress).
- If the click can't spawn (cooldown active, roster full, or in ending mode),
  a transient feedback message appears at the bottom of the screen.

Touch / mobile:
- Tap a voice or the ostinato to open the bottom-screen `#touch-panel`. All
  voice / ostinato actions are exposed as buttons + a volume slider — touch
  has no hover/scroll/keyboard.
- Tap empty space spawns (or closes the panel if open).
- Mouse and touch events go through a single `pointerdown` handler in
  `main.js` (`handleClick`); `e.pointerType` branches between the two paths.
- Canvas-drawn hover panel + keyboard shortcuts are mouse-only.
- Page disables pinch-zoom and double-tap-zoom (viewport meta + touch-action).
- `audio.ctx.resume()` is called defensively on every pointerdown to keep
  iOS Safari from silently suspending playback.

## Auto-advance rule

A voice auto-advances when **all** of these hold:
1. It has looped the current figure at least `AUTO_ADVANCE_MIN_LOOPS` times (default 2).
2. It has spent at least `AUTO_ADVANCE_MIN_DWELL` seconds on the current figure (default 20).
3. It is not repeat-locked.
4. It is not at the last figure.

In ending mode, only conditions 3 and 4 (and ≥1 loop) apply, so voices hurry
to the end. There is no leading-edge constraint — voices advance independently.
Spread between voices is expected (and Riley-faithful; performers come and go
at their own pace).

## Audio chain

```
voice source → noteGain → voice channel.gain → voice highpass → voice presence (peaking)
                                                              → voice panner → master gain
ostinato source → noteGain → ostinato channel.gain → master gain
master gain → eqBass (low shelf) → eqMid (peaking) → eqTreble (high shelf) → compressor → destination
master gain → convolver (Theatre@41) → wetGain → eqBass (same chain)
```

Per-voice in `audio.createPannedChannel`:
- highpass at 30 Hz for low instruments (cello, doublebass) or 80 Hz otherwise
- peaking +1.5 dB at 4 kHz (gentle air)
- StereoPannerNode driven by voice's angular position in the ring

Master:
- 3-band EQ (`audio.eqBass`, `eqMid`, `eqTreble`), ±12 dB each
- DynamicsCompressorNode (threshold −18 dB, knee 12, ratio 3:1, attack 5 ms,
  release 150 ms) — gentle gluing
- ConvolverNode loaded from `assets/audio/ir/theatre41.wav` for room sound;
  mixed with master via `wetGain`

## Humanization

On top of the per-instrument EQ + room reverb, every voice note is humanized:

- **Per-note velocity** — gain × `1 + (rand − 0.5) × 0.16` (±8%).
- **Per-note timing jitter** — onset shifted by ±5 ms (percussive) or ±10 ms
  (sustained). Loop boundaries stay on the grid; only individual onsets wobble.
- **Per-voice detune** — each Voice draws a random offset in ±5 cents at
  spawn (stable for that voice's lifetime). Two voices on the same note beat
  slightly. The ostinato stays at exact concert pitch as the metronomic spine.

The ostinato is intentionally *not* humanized — it's the rhythmic anchor.

## Sustained vs percussive

Each note scheduled on a sustained instrument is wrapped in a gain envelope:
hold at full from `when` to `when + duration`, then linear release to 0 over
`releaseTime` (default 0.01 s — a sharp cut), then `.stop()` the source.
Prevents long sample tails (clarinet, cello, doublebass, etc.) from bleeding
into the next note as accidental legato.

Percussive instruments (vibraphone, marimba, celeste, harp, harpsichord,
piano, crotales) play the full sample naturally — their recorded decay is
the intended sound.

## Visual encoding

- **Ostinato (center)** — black circle (inverts to light grey on dark bg),
  pulses on every eighth-note. Surrounded by an 8-dot rhythm ring (clock face)
  showing the active pulse. Hidden when `H`-toggled.
- **Voice circles** — arranged dynamically around the ostinato. Color =
  instrument hue; saturation/brightness shift cool→warm with figure progress
  1→last. **Size scales linearly with volume**: ~2 px at 0% volume, ~45 px at
  100% volume (~50% larger than the previous max). Outline-only when muted.
  Thin in-color ring at r+5 when repeat-locked. Figure number drawn inside
  (fades out when the circle becomes too small). Hit area always ≥ 22 px so
  quiet voices remain easy to grab.
- **Voice rhythm rings** — small dots around each voice circle at angles
  representing each non-grace note's position in the loop. Brighten on play.
- **Background ripples** — faint expanding circles from canvas center on every
  ostinato pulse (color inverts with bg darkness so they remain visible).
- **Background gradient (spread)** — bg goes from white (all voices in unison)
  to near-black (full roster on different figures), scaled against
  `ROSTER.length` so 2 voices on different figures only nudges slightly grey.
  Lerps smoothly toward the target each frame.
- **Unison strands** — gold/cream lines link voices that share a figure, with
  a soft halo + bright core. Brighten in pulses on cluster note onsets. In
  the final unison (ending mode + every voice on the last figure) the strands
  brighten dramatically and shimmer with a small per-strand sine-wave jitter.
- **Polyrhythmic sparkles** — small colored pinpoints flash at the midpoint
  between any two voices on different figures whose notes coincide within
  ~50 ms. Each sparkle takes the average HSL hue of the two voices that
  triggered it.

## Endgame & mandala

Pressing **Conclude** when all 11 voices are on figure 53 enters the
**dismantling phase**: tapping any voice or the ostinato dismisses it
permanently with a 150 ms fade. The very last dismissal gets a 3-second
audible trail (long fade-out) before the canvas resolves to white.

After a 2-second silence, the curtain fades in:

```
            In C.

      thank you for playing

[ Download mandala ] [ Start over ]
```

The on-canvas curtain is intentionally minimal. The **mandala artifact** lives
only in the downloadable PNG: clicking *Download mandala* renders the
visualization to an offscreen 1080×1080 canvas and saves it as
`in_c_mandala_<timestamp>.png`. Each voice that spawned becomes a radial
petal arc-segmented by the figures it traversed; petal length encodes time
present, color progression encodes journey through the score. Faint
concentric rings mark every 30 seconds.

The performance log (`performanceLog` in main.js) records spawns / figure
changes / dismissals during play; the mandala renderer reads it.

## Onboarding & feedback

- **Per-voice spawn hints** — each new voice spawn fires a 9 s transient at
  the bottom of the canvas, walking the player through controls (voices 2–6),
  visualization (voice 7), context about the piece (voices 8–10), and the
  ending goal (voice 11). See `VOICE_SPAWN_HINTS` in `main.js`.
- **Persistent contextual hints** — when no transient is active, the bottom
  slot shows the most relevant next-step prompt.
- **Transient click-feedback** — when a click can't spawn, a 1.6 s message
  explains why ("wait — next voice ready in Xs", "all 11 voices in — press R
  to randomize", "ending mode — spawning disabled").
- **Help modal** (top-bar `?` or keyboard `?`) — full HTML reference of all
  controls, organized by context. Game keys are swallowed while it's open.
- **About modal** (top-bar *About*) — credits.

## Adding a new instrument

1. Find the source samples under
   `C:\Min Fynske Barndom\Min Fynske Barndom_game\assets\audio\Sonatina Symphonic Orchestra\Samples\<Folder>`.
2. Add a `build_instrument` call to `tools/build_samples.sh` mapping each
   available source's MIDI number to its filename, plus target chromatic range.
3. Run `bash tools/build_samples.sh` (requires ffmpeg).
4. Add the instrument to `ROSTER` in `src/roster.js`. Mark `sustained: true`
   for tone-holding instruments (winds, bowed strings).
5. Add the instrument to the `mkdir` + `put` lines in
   `.github/workflows/deploy.yml` so the deploy uploads it.

## Pattern data + grace notes

`score.js` parses `In C.xml` once at page load. The encoding has:

- One bar per measure; bar 1 is the ostinato; figures are subsequent bars
  with pitched notes (rest-only spacer bars are skipped).
- Time signatures persist across measures (only emitted when changed).
- Grace notes are encoded by Sibelius as `<grace />` notes with no
  `<duration>`. We render them as 32nd-note ornaments
  (`GRACE_OFFSET = 0.0625 s` at base BPM) played just before their main note
  (time = mainTime − GRACE_OFFSET — may be negative for the first beat,
  which the scheduler handles by landing the grace in the previous loop
  iteration's tail).
- Ties (`<tie type="stop">`) extend the previous note's duration rather than
  re-onsetting.
- Note times and durations are stored in seconds at 120 BPM. The scheduler
  scales by `tempoFactor = 120 / currentBPM` at every scheduling boundary.

## Eighth-note grid

The ostinato is the metronomic spine. New voices snap their first beat to
the next eighth-note pulse on the ostinato grid (`alignToOstinatoGrid` in
main.js). Pattern durations are all multiples of
`OSTINATO_INTERVAL = 0.25 s` at 120 BPM, so once aligned a voice never drifts.
Tempo changes cause a small grid kink since we don't reset
`ostinatoStartTime` on slider movement; this is acceptable for slow drags.

## Tunable constants

In `src/main.js`:

- `SPAWN_COOLDOWN` — seconds between voice spawns (default 10)
- `AUTO_ADVANCE_MIN_LOOPS` — minimum loops before auto-advance (default 2)
- `AUTO_ADVANCE_MIN_DWELL` — minimum seconds on a figure before auto-advance
  (default 20)
- `BASE_BPM`, `BASE_OSTINATO_INTERVAL` — score's notional tempo (don't change
  without re-thinking score.js)
- `SCHEDULER_LOOKAHEAD` — audio buffer ahead of `currentTime` (default 0.5 s,
  large enough to survive iOS rapid-tap stalls)
- `STEREO_WIDTH` — max ±pan amount based on voice angle (default 0.6)
- `RIPPLE_*`, `RING_OFFSET`, `DOT_*` — visual params
- `BG_DARK_RANGE` — how dark the bg gets at full spread (default 195, so
  fully-spread bg = rgb(60, 60, 60))
- `SPARKLE_*` — polyrhythmic sparkle params
- `SPREAD_LERP_RATE` — how fast bg fades between spread states

In `src/voice.js`:

- `VELOCITY_VARIATION` — per-note gain randomness (default 0.16, ±8%)
- `TIMING_JITTER_PERCUSSIVE`, `TIMING_JITTER_SUSTAINED` — per-note onset jitter
- `DETUNE_RANGE` — per-voice detune range in cents (default 10, ±5)

Per-instrument config in `src/roster.js`.

## Score source files

`In C.xml` and `In_C_score_and_text.pdf` are intentionally `.gitignore`d and
not included in the public repository. They are derivatives of Terry Riley's
copyrighted 1964 score.

To run the app you need `In C.xml` at the project root (path: `./In C.xml`),
since `score.js` fetches it on page load. You can obtain it by:

- transcribing the score yourself in any notation editor (Sibelius,
  MuseScore, Dorico, etc.) and exporting MusicXML; or
- locating an existing MusicXML transcription online.

The structure the parser expects:

- bar 1 contains the eighth-note ostinato (eight C5 eighths in 4/4, with a
  `<transpose><octave-change>1</octave-change></transpose>` so the C5
  written sounds at C6);
- bars with pitched notes after that are the 53 figures, in order;
- spacer bars (rest-only) between figures are skipped automatically;
- grace notes are encoded as `<grace />` elements with no `<duration>` and
  are played as 32nd-note ornaments before their main note.

## Conventions

- HTML widgets only for: top bar, help modal, about modal, touch panel,
  endgame buttons. Voice / ostinato interaction happens on the canvas.
- Voice positions are recomputed every frame by `voicePosition(i, total)`,
  evenly spaced clock-face style around the ostinato.
- AudioContext is created on first user click (browser autoplay policy) and
  defensively resumed on every pointerdown.
- Sample paths are relative (`assets/audio/<instr>/<note>.mp3`) so the page
  works under any URL prefix.
- Range-input sliders carry `autocomplete="off"` and have their values
  re-applied in JS on page load, so browser session caching never overrides
  the intended defaults.
