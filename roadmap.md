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

Smaller features that emerged during Phase 1 / 2 iteration:

- **Ostinato pitch shifting** — left/right click cycles C4 / C5 / C6 (default C5)
- **Repeat lock (R)** — voice stops auto-advancing; visualized as a thin
  in-color ring just outside the circle. Locked voices opt out of the
  ensemble's leading-edge calculation entirely.
- **Instrument swapping (← / →)** — cycle a voice's timbre through the roster
  while keeping its pattern position, gain, mute, channel
- **Eighth-note grid alignment** — new voices snap their first beat to the
  ostinato pulse so the rhythm never tilts

---

## Phase 3 — Personality & living ensemble

Make the simulation feel like *humans*, not agents.

- **Performer personalities** — small per-voice modifiers to dwell time:
  *eager* (shorter dwell), *patient* (longer), *adventurous* (occasionally
  skips a figure), *clingy* (likes unison with neighbors).
- **Unison rewarded visually** — when 2+ voices land on the same figure,
  threads of light arc between them (triangle for 3, pentagram for 5, etc.).
- **Rest as gesture** — click-and-drag through multiple voices to mute them
  all in one breath; reverse sweep to bring them back.

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
