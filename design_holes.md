# In C — Open Design Questions

Browser-based generative-art game / visualization of Terry Riley's *In C*.
The player is the **conductor** of an autonomous ensemble of up to 11 voices,
each cycling through Riley's 53 melodic patterns. See `roadmap.md` for the
phased build status and `CLAUDE.md` for the project guide; this file is
just the running list of design questions still up for grabs.

---

## 1. Performer personalities

Phase 3 leftover. Per-voice dwell-time modifiers — *eager* (shorter dwell),
*patient* (longer), *adventurous* (occasionally skips a figure), *clingy*
(biased toward the most-common figure in the ensemble). Would push the
ensemble further from "11 identical agents" toward "11 humans".

Open: assign random per spawn (replay value), tied to instrument
(predictable), or player-pickable? Subtle behavior or visible glyph?

## 2. Sweep-mute gesture

Phase 3 leftover. Click-and-drag through voices to mute them all in one
breath; reverse sweep to bring them back. Riley's "drop out and listen" as
a single physical gesture.

Open: on touch the same gesture is just a swipe — works fine. On desktop
needs a clear distinction from regular mouse-drag (which currently does
nothing). Maybe shift-drag.

## 3. Spawn cooldown duration (revisit?)

Currently 10 s. Long enough to feel paced, short enough that a full
ensemble accretes in under 2 minutes. Could shorten as more voices are
present (a thicker ensemble absorbs new entries faster), or stay flat.

## 4. Crescendo / diminuendo gesture

Riley specifies the ensemble should swell together. There's no explicit
gesture for ensemble-wide dynamics. Could be a vertical drag in empty
space, a top-bar slider, or simply move on (the per-voice volume control
already lets you do this manually one voice at a time).

## 5. Conclude transitions — finer specifics

High-level flow is decided and implemented. Specifics still open:

- Currently in ending mode all dwell/loop checks are bypassed. Voices race
  to the end. Is that too abrupt for voices that are far from figure 53?
- Should Conclude force-unlock all R-locked voices? Currently it doesn't,
  which means a locked voice will never reach the final figure unless the
  player manually unlocks. Live anchor or annoyance?

## 6. Audio recording / export

Phase 6 territory. Capture the performance as audio (WAV or MP3),
downloadable alongside the mandala PNG. Web Audio's `MediaStreamDestination`
+ `MediaRecorder` is the standard route.

## 7. Performer-relationship visuals (beyond what's there)

We have unison strands and polyrhythmic sparkles. There could be subtler
ones — e.g. a faint "watching" line between voices about to hit unison;
"shadow" trails behind voices that recently advanced. Probably overkill
given the existing visual density; flag for future tasteful additions only.

## 8. Crotales — bring back?

Benched in `unused_instruments.md` because they were too insistent at the
default mix levels. Now that we have per-voice EQ and master EQ, we could
revisit — gently filter the high frequencies and they might sit better.

---

## Resolved (footer)

- **Spawn cooldown 10 s** — settled.
- **Tempo dial** — top bar slider, 60–200 BPM.
- **Reverb** — Theatre@41 convolution + slider control.
- **3-band master EQ** — bass / mid / treble, ±12 dB.
- **Stereo positioning** — voices panned by angular position.
- **Per-note humanization** — velocity, timing, detune.
- **Pulse / rhythm visualization** — rhythm rings (per-voice + ostinato).
- **Auto-advance rule** — MIN_LOOPS=2 + MIN_DWELL=20s, no leading-edge K
  constraint (tried and removed).
- **Master controls** — volume + tempo + reverb + bass/mid/treble + Random
  + Conclude + About + ?
- **Per-voice instrument viz** — color + position is enough.
- **Mandala artifact** — PNG download via offscreen render.
- **Touch / mobile** — pointer events + on-screen control panel.
- **Spotlight mechanic** — dropped, expressive needs covered by mute / volume
  / lock / advance / reverse.
