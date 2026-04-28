# In C — Roadmap

A browser-based interactive realization of Terry Riley's *In C*. The player
is a **conductor** shaping an autonomous ensemble of voices through Riley's
53 melodic patterns. Built in vanilla JavaScript with Web Audio + Canvas.

This document tracks the phased build order. Each phase is a listenable,
playable artifact in its own right — we never build something we can't hear.
Phases 0–4 are essentially done; Phase 5 (stakes) is open by choice;
Phase 6 (stretch) is the future.

---

## Phase 0 — Walking skeleton ✓

Single click → ostinato pulses, vibraphone plays figure 1 looped. Proof
the audio + render + parser pipeline works.

**Status:** done.

---

## Phase 1 — Core conductor ✓

Full game loop with 11 voices, mid/late-game UI:

- Mallets/keyboards: vibraphone, marimba, celeste, harpsichord, piano
- Plucked: harp
- Woodwinds (sustained): flute, clarinet, oboe
- Strings (sustained): cello, doublebass
- Crotales benched (see `unused_instruments.md`)
- Per-voice hover panel + scroll-volume + M-mute + ←→-instrument-swap
- Left-click advance, right-click reverse
- Auto-advance on dwell + min-loops
- Tempo slider, master volume, Conclude
- Sample envelope cuts sustained-instrument legato

**Status:** done.

---

## Phase 2 — Visual deepening ✓

Make the screen *teach* the listener what's happening:

- **Rhythm rings** around each voice + the ostinato — note positions in the
  loop, dots brighten on play.
- **Background ripples** from canvas center on every ostinato pulse.
- **Background spread gradient** white → dark grey as the ensemble spreads
  across many figures. Lerps smoothly.
- ~~Leading-edge horizon~~ — built then removed (encouraged a stuck-feeling
  ensemble; new spawns reset minIdx to figure 1, capping leaders).

**Status:** done.

---

## Phase 3 — Personality & living ensemble ✓ (mostly)

Make the simulation feel alive:

- **Unison strands** ✓ — voices on the same figure are linked by warm
  gold/cream halo + core lines that pulse on shared note onsets. In the
  final-unison state (ending mode + every voice at the last figure) the
  strands brighten and shimmer.
- **Polyrhythmic sparkles** ✓ — small colored pinpoints flash at the
  midpoint between voices on different figures whose notes coincide within
  ~50 ms. Each sparkle takes the average HSL hue of the two contributing
  voices, so the canvas reads which voices just kissed.
- **Per-note humanization** ✓ — velocity ±8 %, timing jitter ±5 / ±10 ms,
  per-voice detune ±5 cents.
- **Stereo positioning** ✓ — voices pan based on angular position in the ring.
- **Convolution reverb** ✓ — Theatre@41 IR, slider-controlled wet level.
- **Master 3-band EQ + compressor** ✓ — bass +6 dB default, mid 0, treble 0.
- **Performer personalities** — per-voice dwell-time modifiers (eager,
  patient, adventurous, clingy). *(open)*
- **Rest as gesture** — drag-through-voices to bulk-mute. *(open)*

**Status:** mostly done.

---

## Phase 4 — The artifact ✓

- On Conclude → curtain fades in with title + subtitle + Download / Reset
  buttons. The mandala visualization lives only in the downloadable PNG —
  the on-screen curtain stays minimal.
- `Download mandala` renders the performance log to a 1080×1080 offscreen
  canvas and triggers a PNG download. Each voice's path through the score
  becomes a radial petal arc-segmented by figure progression.
- `Start over` reloads the page for a fresh performance.
- ~~Audio recording / export~~ — not implemented; deferred to Phase 6.

**Status:** done (visual artifact). Audio export deferred.

---

## Beyond the core (added on the way)

Smaller features that emerged during the Phase 1–4 iteration:

- **Ostinato pitch shifting** — left/right click cycles C4 / C5 / C6 (default C5)
- **Ostinato hide (H)** — visually hides the central circle without muting
- **Repeat lock (R)** — voice stops auto-advancing; visualized as a thin
  in-color ring just outside the circle
- **Instrument swapping (← / →)** — cycle a voice's timbre through the roster
- **Power moves** — ctrl + click for ±5 figure jumps; shift + left-click to
  align every other voice to the clicked voice's figure
- **Random button + R-key** — when the full roster is in, reroll all unlocked
  voices to random figures with one click
- **Eighth-note grid alignment** — new voices snap their first beat to the
  ostinato pulse so the rhythm never tilts
- **Mute fades** — ~150 ms exponential approach when muting/unmuting; the
  final dismissal during Conclude trails for 3 seconds
- **Sustained-instrument note envelope** — winds and bowed strings cut at
  the written note end with a 10 ms release so long sample tails don't smear
- **Volume-driven voice circle size** — voice circles range from ~2 px
  (almost invisible) at 0% volume to ~45 px at 100%
- **Help modal + onboarding hints** — `?` button opens a full controls
  reference; per-voice spawn fires a 9 s introductory hint walking the
  player through controls, visualization, the piece's history, the ending
  goal
- **About modal** — credits Allan / Riley / Theatre@41 IR authors
- **Conclude unlocking** — Conclude button hidden until every voice is on
  the final figure
- **Dismantling ending** — after Conclude, tap any part to dismiss it; once
  everything is gone, fade in to "In C. / thank you for playing"
- **Touch / mobile** support — pointer events, on-screen control panel,
  responsive top bar, viewport zoom locked, defensive AudioContext resume,
  larger scheduler lookahead to survive iOS rapid-tap stalls
- **Open Graph / SEO meta** + OG preview image, favicon
- **Deploy automation** — pushes to `master` trigger a GitHub Actions
  workflow that uploads to one.com via SFTP

---

## Phase 5 — Stakes (experimental, optional)

- **The ostinato can falter** — if the ensemble strays too far apart, the
  ostinato starts skipping pulses, the background trembles, and the player
  must rescue cohesion. May break the meditative quality; prototype and
  decide by ear.

---

## Phase 6 — Stretch

- **Audio recording / WAV or MP3 export** — capture the performance as
  audio, downloadable alongside the mandala PNG
- **Tap-tempo** by clicking the ostinato in rhythm
- **Global crescendo / diminuendo gesture**
- **Multi-conductor** — two players sharing the canvas
- **Performance recording** (gesture replay file)
- **Spotlight** mechanic if it earns its place
- **Spawn-at-leading-edge** — opt-in mode where new voices join at the
  slowest current voice's figure instead of figure 1, for tighter ensemble
  feel
- **Performer personalities** (Phase 3 leftover) — per-voice dwell modifiers
- **Sweep-mute gesture** (Phase 3 leftover) — drag through voices to bulk-mute
- **Fractal / recursive visuals** — explored conceptually; rejected as
  competing with the existing meditative legibility, except possibly in the
  mandala (already a self-similar form)
