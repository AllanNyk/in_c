# In C — Open Design Questions

Browser-based generative-art game / visualization of Terry Riley's *In C*. The player is the **conductor** of an autonomous ensemble of up to 20 voices, each cycling through Riley's 53 melodic patterns. See conversation log for decided design; this file lists what's still open.

---

## 1. Spawn cooldown duration

How long after spawning a voice before the next can be spawned?

- **Tradeoff:** short cooldown lets the player build texture quickly (more dramatic, less Riley); long cooldown enforces the slow accumulation that makes the opening spacious.
- **Proposal:** 20–30 seconds. Long enough for a new voice to settle in and the player to listen; short enough that all 20 voices can enter inside the first ~10 minutes.
- **Variants worth considering:**
  - Cooldown *shortens* as more voices are present (a thicker ensemble absorbs new entries faster).
  - Cooldown *lengthens* over time (preserves contemplative pacing through the piece).

## 2. Global crescendo / diminuendo gesture

Riley specifies the ensemble should swell together. How does the conductor invoke this?

- **A. Vertical mouse drag in empty space.** Hold + drag up = crescendo, down = diminuendo. Most physical; risks accidental triggers.
- **B. A slider at the top of the screen** next to the master volume. Discoverable, less expressive.
- **C. Hold a key (e.g. spacebar) + scroll-wheel.** Composable with other gestures, slightly hidden.
- **D. A dedicated zone** at the bottom of the screen — drag horizontally to shape a swell over time.

## 3. Tempo dial

Riley leaves tempo to performers. Should the conductor have a tempo control?

- **Pro:** another expressive lever; useful for slowing into the Conclude or pushing through dense passages.
- **Con:** a fixed dial implies a fixed tempo, which the piece resists.
- **Middle path:** no dial, but the player can **tap-tempo by clicking the ostinato** in rhythm; the engine drifts toward the tapped tempo.

## 4. Spotlight mechanic

Earlier proposed; worth deciding whether it earns its place.

- **A. Hold-to-spotlight:** ducks every other voice's volume while held, focusing one voice.
- **B. Momentary boost:** boosts the targeted voice without ducking others.
- **C. Drop it.** Mute + volume + nudge + reverse already give rich texture control.

Lean: **C**, unless playtest shows the player wants a "hero" gesture.

## 5. Pulse / rhythm visualization

How does each voice's circle visualize the rhythm of its current pattern?

- **A. Onset flash.** Circle brightens on each note onset. Simple, legible, you can count rhythms.
- **B. Envelope pulse.** Radius breathes with attack/decay matching each note. Smoother, more analog.
- **C. Mini-score ring.** Small dots arranged around the circle trace the pattern; each lights as it plays. A literal score-around-orbit visual.
- **D. Combined.** Radius pulses with envelope, color/brightness flashes on onset.

## 6. Auto-advance rule numbers

Voice auto-advances when it has looped its current pattern ≥ **N** times **AND** is no further than **K** patterns behind the ensemble's leading edge.

- Proposed defaults: **N = 4, K = 2**.
- Both should be tunable via a config so we can taste-test once it's running.

## 7. Conclude transitions

High-level flow is decided (press 1 → ending mode → all hurry to #53 → conduct final crescendos → fade out). Specifics still open:

- In ending mode, how fast do trailing voices catch up? Just set N = 1, or shorten N progressively, or remove the K-window cap?
- After all voices are on #53: does the player mute them one-by-one? Press Conclude a second time to fade the master? Both options simultaneously available?

## 8. Visual identity per voice

Decided: position around the ostinato, color cool→warm with pattern progress, size = volume, current pattern number as text inside.

Open: should each voice's **instrument** be visually identifiable too?

- **A. Distinct icon or glyph** (e.g. a small flute silhouette inside the flute circle).
- **B. Distinct hue family** per instrument (warm browns for bassoon, cool silvers for vibraphone).
- **C. Skip it** — rely on sonic identity, keep visuals abstract.

## 9. Master controls layout

Top-of-screen controls are agreed in principle. Open: exact set and arrangement.

- Master volume slider — confirmed.
- Conclude button — confirmed.
- Crescendo/diminuendo control (depends on #2).
- Tempo display or tap target (depends on #3).
- Anything else? (Pause? Reset? Save recording?)

## 10. Recording / persistence

Not discussed yet but worth flagging: should a performance be **recordable** (audio export, or a replay file capturing the player's gestures)? An artistic piece often gains a lot from being shareable as a finished artifact.
