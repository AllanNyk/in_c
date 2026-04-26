# In C — Roadmap

A browser-based interactive realization of Terry Riley's *In C*. The player is
a **conductor** shaping an autonomous ensemble of up to N voices, each cycling
through Riley's 53 melodic patterns. Built in vanilla JavaScript with Web
Audio + Canvas. Sound from the Sonatina Symphonic Orchestra sample library.

This document tracks the phased build order. Each phase is a listenable,
playable artifact in its own right — we never build something we can't hear.
Phases 0–2 are implemented; everything from Phase 3 onward is open.

---

## Phase 0 — Walking skeleton ✓

The smallest thing that makes a sound and proves the whole pipeline.

- Page loads; ostinato circle pulses on the eighth-note pulse with high-C piano
- Single click spawns one voice (vibraphone) playing figure 1 on a loop

**Status:** done.

---

## Phase 1 — Core conductor ✓

The full game loop with sensible-default behaviors.

- 11 voices in fixed roster order, dynamic placement around the ostinato
  (vibraphone, marimba, celeste, harpsichord, piano, harp, flute, clarinet,
  oboe, cello, doublebass — crotales benched, see `unused_instruments.md`)
- Each voice loaded with its own instrument timbre
- Per-voice **hover-reveals** mute button + volume slider; **scroll-wheel** for
  volume; **M** for mute
- **Left-click** voice = advance one figure; **right-click** = reverse
- **Auto-advance rule** — switched from N-loops-only to (≥2 loops AND ≥20s dwell);
  no leading-edge constraint (voices roam independently)
- Voice color cool→warm with progress; size = volume; figure number inside
- Spawn cooldown 20s with arc indicator
- **Master volume** + **tempo slider** (60–200 BPM) + **Conclude** in top bar
- Pulse viz: simple onset flash
- Sample envelope cuts sustained notes (clarinet/oboe/flute/cello/doublebass)
  at the written note end + 10ms release

**Status:** done.

---

## Phase 2 — Visual deepening ✓

Make the screen *teach* the listener what's happening.

- **Rhythm rings** around each voice and the ostinato — small dots at angles
  representing each note's position in the loop, brightening on play
- **Background ripples** expanding from canvas center on every ostinato pulse
- ~~Leading-edge horizon~~ — built then removed; encouraged a stuck-feeling
  ensemble (each new spawn pulled `minIdx` back to figure 1, capping leaders)
- Pulse viz: onset flash retained; envelope breathing not added

**Status:** done. Leading-edge feature deliberately reverted.

---

## Beyond the core (added on the way)

Smaller features that emerged during the Phase 1–3 iteration:

- **Ostinato pitch shifting** — left/right click cycles C4 / C5 / C6 (default C5)
- **Ostinato hide (H)** — visually hides the central circle without muting
- **Repeat lock (R)** — voice stops auto-advancing; visualized as a thin
  in-color ring just outside the circle
- **Instrument swapping (← / →)** — cycle a voice's timbre through the roster
  while keeping its pattern position, gain, mute, channel
- **Power moves** — ctrl + click for ±5 figure jumps; shift + left-click to
  align every other voice to the clicked voice's figure
- **Random button + R-key** — when the full roster is in, reroll all unlocked
  voices to random figures with one click
- **Eighth-note grid alignment** — new voices snap their first beat to the
  ostinato pulse so the rhythm never tilts
- **Mute fades** — ~150 ms exponential approach when muting/unmuting
  (Web Audio `setTargetAtTime`); click-free
- **Sustained-instrument note envelope** — winds and bowed strings cut at the
  written note end with a 10 ms release so long sample tails don't smear
- **Help modal + onboarding hints** — `?` button opens a full controls
  reference; per-voice spawn fires a 9 s introductory hint walking the player
  through controls, visualization, the piece's history, and the ending goal
- **Conclude unlocking** — Conclude button hidden until every voice is on the
  final figure; persistent hint nudges the player toward the goal
- **Deploy automation** — pushes to `master` trigger a GitHub Actions workflow
  that uploads to one.com via SFTP (mirrors the SubjectQuiz pattern)

---

## Phase 3 — Personality & living ensemble (in progress)

Make the simulation feel like *humans*, not agents.

- **Unison rewarded visually** ✓ — voices on the same figure are linked by
  warm gold strands (halo + bright core), pulsing on cluster note onsets. In
  the final-unison state (ending mode + every voice on the last figure) the
  strands brighten dramatically and shimmer with a small per-strand jitter.
- **Polyrhythmic sparkles** ✓ (added beyond the original Phase 3 scope) —
  small colored pinpoints flash at the midpoint between voices on different
  figures whose notes coincide within ~50 ms. Each sparkle takes the average
  HSL hue of the two voices, so the canvas reads which voices just kissed.
- **Background spread gradient** ✓ — bg fades from white (full unison) to
  near-black (11 voices on 11 different figures), anchored to the absolute
  roster size. Lerps softly between states. Pairs with the gold strands as a
  convergence/divergence duality.
- **Performer personalities** — small per-voice modifiers to dwell time:
  *eager* (shorter dwell), *patient* (longer), *adventurous* (occasionally
  skips a figure), *clingy* (likes unison with neighbors). *(open)*
- **Rest as gesture** — click-and-drag through multiple voices to mute them
  all in one breath; reverse sweep to bring them back. *(open)*

---

## Phase 4 — The artifact

- On Conclude, the canvas resolves into a **generative print** — a mandala-like
  trace of every voice's path through the score, every unison moment, every
  gesture. One-click PNG download.
- Optional: also export the audio recording.

---

## Phase 5 — Stakes (experimental, optional)

- **The ostinato can falter** — if the ensemble strays too far apart, the
  ostinato starts skipping pulses, the background trembles, and the player must
  rescue cohesion. May break the meditative quality; prototype and decide by ear.

---

## Phase 6 — Stretch

- **Tap-tempo** by clicking the ostinato in rhythm
- **Global crescendo / diminuendo gesture**
- **Touch / mobile** support
- **Multi-conductor** — two players sharing the canvas
- **Performance recording** (gesture replay file)
- **Spotlight** mechanic if it earns its place
- **Spawn-at-leading-edge** — opt-in mode where new voices join at the slowest
  current voice's figure instead of figure 1, for tighter ensemble feel
