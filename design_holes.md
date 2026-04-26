# In C — Open Design Questions

Browser-based generative-art game / visualization of Terry Riley's *In C*.
The player is the **conductor** of an autonomous ensemble of up to N voices,
each cycling through Riley's 53 melodic patterns. See `roadmap.md` for the
phased build status; this file lists what's still open.

Resolved questions are documented at the bottom for reference.

---

## 1. Spawn cooldown duration (revisit?)

Currently fixed at 20 s. Long enough that adding 11 voices spans roughly
3.5 minutes of accumulation. Open: should it shorten as more voices are present
(thicker ensemble absorbs new entries faster), or lengthen (preserves
contemplative pacing)?

## 2. Global crescendo / diminuendo gesture

Riley specifies the ensemble should swell together. Still no explicit gesture.

- **A. Vertical mouse drag in empty space.** Hold + drag up = crescendo, down = diminuendo.
- **B. Slider at the top of the screen** next to master volume.
- **C. Hold spacebar + scroll-wheel.** Composable with other gestures.
- **D. Dedicated zone** at the bottom of the screen.

Tempo slider already lives in the top bar; an additional swell control there
might overload it. The drag-in-empty-space option (A) is the most physical but
risks accidental triggers when spawning voices.

## 3. Spotlight mechanic — drop entirely, or earn its place?

Currently dropped from the active toolkit. Mute/volume/repeat-lock probably
cover the expressive needs. Revisit only if playtest finds a "hero a single
voice" gesture missing.

## 4. Conclude transitions — finer specifics

High-level flow is decided and implemented (press 1 → ending mode → all hurry
to the last figure → manual mute-to-end). Specifics still open:

- Currently in ending mode all dwell/loop checks are bypassed (effectively
  N=1, T=0). Voices race to the end. Is that too abrupt? Should we keep MIN_LOOPS
  but skip the dwell?
- Should Conclude force-unlock all R-locked voices? Currently it doesn't, which
  means a locked voice will never reach the final figure unless the user
  manually unlocks. Live anchor or annoyance?
- After all on the final figure: a second Conclude press could fade master to
  zero as an alternative to one-by-one muting.

## 5. Per-voice instrument visual identity

Decided: rely on color hue + sonic identity + position; no per-instrument icon.
Could revisit if 11+ voices feel hard to distinguish at a glance.

## 6. Recording / persistence

Phase 4 territory. Decisions:

- Visual artifact (mandala / trace): planned for Phase 4.
- Audio recording / export: Phase 6.
- Gesture-replay file: Phase 6.

---

## Resolved

- **Spawn cooldown: 20s** — locked in.
- **Crescendo gesture: tempo slider lives there but no swell-only control yet.**
- **Tempo dial: ✓** added in Phase 2 (60–200 BPM slider, default 120).
- **Pulse viz: ✓** rhythm rings (per-voice + ostinato) added in Phase 2.
- **Auto-advance rule: ✓** redesigned during Phase 2 follow-up. Now uses
  MIN_LOOPS=2 + MIN_DWELL=20s. Leading-edge K constraint was tried and
  removed — it caused an ensemble traffic jam where each new spawn pulled
  `minIdx` back to figure 1 and capped the leaders.
- **Master controls: ✓** volume + tempo + Conclude in top bar.
- **Per-voice instrument viz: skipped** — color + position is enough.
