# In C — Roadmap

A browser-based interactive realization of Terry Riley's *In C*. The player is a **conductor** shaping an autonomous ensemble of up to 20 voices, each cycling through Riley's 53 melodic patterns. Built in JavaScript with Web Audio + Canvas. Sound from the Sonatina Symphonic Orchestra sample library.

This document sketches the phased build order. Each phase is a listenable, playable artifact in its own right — we never build something we can't hear.

---

## Phase 0 — Walking skeleton

The smallest thing that makes a sound and proves the whole pipeline.

- Page loads; ostinato circle pulses on the eighth-note pulse with high-C piano sample
- Single click spawns one voice (vibraphone) playing figure 1 on a loop
- One voice circle appears next to the ostinato, pulses with the rhythm
- No controls, no auto-advance, no conclude — just one voice forever

**Done when:** opening the page, clicking once, and hearing Riley's figure 1 over the ostinato in a browser.

---

## Phase 1 — Core conductor

The full game loop with sensible-default behaviors.

- All 20 voices in fixed roster order, dynamic placement around the ostinato
- Each voice loaded with its own instrument timbre
- Per-voice **hover-reveals** mute button + volume slider; **scroll-wheel-on-circle** for volume; **`m`-key-while-hovering** for mute
- **Left-click** voice = advance one pattern; **right-click** = reverse one pattern
- **Auto-advance rule** (defaults: N=4 loops, K=2 leading-edge window)
- Voice color cool→warm with pattern progress (1→53), size = volume, current pattern number shown inside circle
- Spawn cooldown (start: 20s)
- **Master volume** slider top of screen
- **Conclude** button: voices set N=1 to hurry to #53, then player mutes voices one-by-one to end
- Pulse visualization: simple onset flash (option A from design_holes #5)
- Tempo fixed at ~120 BPM for the eighth-note pulse

**Done when:** a player can play a complete, satisfying ~30–60 minute performance start to finish.

---

## Phase 2 — Visual deepening

Make the screen *teach* the listener what's happening.

- **Leading-edge horizon** (design_holes #5 spirit): a soft rotating beam from center marks the ensemble's collective front; voices behind glow calmly, voices at the edge glow brighter
- **Pattern as geometric signature**: each of the 53 patterns has a distinctive pulse/orbit motion so voices become visually recognizable by their current figure
- **Background breathes** subtly with the ostinato — the whole white canvas as a participant
- Upgrade pulse viz to envelope-pulse + onset-flash combo (option D)

---

## Phase 3 — Personality & living ensemble

Make the simulation feel like *humans*, not agents.

- **Performer personalities**: small per-voice modifiers to the auto-advance rule — *eager*, *patient*, *adventurous* (will sometimes skip a pattern), *clingy* (likes unison with neighbors). Personalities assigned per spawn, optionally visible in the circle's micro-behavior.
- **Unison rewarded visually**: when 2+ voices land on the same pattern, threads of light arc between them (triangle for 3, pentagram for 5, etc.). Encourages chasing Riley's "merge into unison" moments.
- **Rest as gesture**: click-and-drag through multiple voices to mute them all in a single sweep; reverse sweep to bring them back. Silence as one breath.

---

## Phase 4 — The artifact

The performance produces something you can keep.

- On Conclude, the canvas resolves into a **generative print** — a mandala-like trace of every voice's path through the score, every unison moment, every gesture
- One-click download as PNG
- Optional: also export the audio recording of the performance

---

## Phase 5 — Stakes (experimental, optional)

Push toward game-feel if the piece wants it.

- **The ostinato can falter**: if the ensemble strays too far apart (Riley's nightmare), the ostinato starts skipping pulses, the background trembles, and the player must rescue cohesion with their tools. Adds risk; might break the meditative quality. Worth prototyping and deciding by ear.

---

## Phase 6 — Stretch

Things to consider only after the core piece sings.

- **Tap-tempo** by clicking the ostinato in rhythm (design_holes #3 middle path)
- **Global crescendo/diminuendo gesture** (design_holes #2)
- **Touch / mobile** support — single-finger tap = advance, long-press = reverse, two-finger pinch = volume
- **Multi-conductor** — two players sharing the canvas
- **Performance recording** — gesture replay file, not just audio
- **Spotlight** mechanic if it earns its place after playtest

---

## Decisions deferred per phase

The 10 open questions in `design_holes.md` are all addressed somewhere in this roadmap, mostly with sensible v1 defaults that we revisit after listening:

| # | Hole | Resolved in | Default |
|---|---|---|---|
| 1 | Spawn cooldown | Phase 1 | 20s |
| 2 | Crescendo gesture | Phase 6 | (deferred) |
| 3 | Tempo dial | Phase 6 | fixed 120 BPM in Phase 1 |
| 4 | Spotlight | Phase 6 (if ever) | dropped from Phase 1 |
| 5 | Pulse viz | Phase 1 → 2 | onset flash → envelope+flash |
| 6 | Auto-advance N/K | Phase 1 | N=4, K=2 |
| 7 | Conclude transitions | Phase 1 | voices N=1 to hurry, then manual mute-to-end |
| 8 | Per-voice instrument viz | (skipped) | rely on sonic identity + position |
| 9 | Master controls | Phase 1 → 6 | volume + Conclude only in Phase 1 |
| 10 | Recording / persistence | Phase 4 | visual artifact; audio in Phase 6 |
