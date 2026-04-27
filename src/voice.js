// voice.js — a single performer in the ensemble.
// Owns its own audio channel, current pattern position, and per-voice mute/gain.

import { midiToFilename } from './score.js';

// Each scheduled note's gain is multiplied by a random factor in
// [1 - VELOCITY_VARIATION/2, 1 + VELOCITY_VARIATION/2]. 0.16 = ±8%.
// The ostinato is intentionally NOT randomized — it stays the metronomic spine.
const VELOCITY_VARIATION = 0.16;

export class Voice {
  constructor({ instrument, range, color, sustained, figures, audio, slotIndex }) {
    this.instrument = instrument;
    this.range = range;
    this.color = color;
    this.sustained = !!sustained;
    this.figures = figures;       // array of patterns [figure 1, figure 2, ..., figure 53]
    this.audio = audio;
    this.slotIndex = slotIndex;   // for stable ordering / placement

    const ch = audio.createPannedChannel(0.0, 0); // start silent + centered, ramp up on spawn
    this.channel = ch.gain;
    this.panner = ch.panner;
    this.gain = 0.7;
    this.muted = false;
    this.channel.gain.linearRampToValueAtTime(this.gain, audio.currentTime + 0.4);

    this.patternIdx = 0;          // 0..52 (figure 1..53)
    this.loopCount = 0;
    this.transposition = 0;
    this.lastOnsetTime = -1;
    this.nextLoopStart = 0;
    this.spawnTime = audio.currentTime;
    this.patternStartTime = audio.currentTime;
    this.repeatLocked = false;    // true = stay on current figure; ignore auto-advance
    this.dismissed = false;       // true = dismantled at the end; gone from render + audio

    this._fitTransposition();
  }

  get currentPattern() { return this.figures[this.patternIdx]; }
  get progress() {
    return this.figures.length > 1 ? this.patternIdx / (this.figures.length - 1) : 0;
  }
  get atEnd() { return this.patternIdx >= this.figures.length - 1; }
  get figureCount() { return this.figures.length; }

  // Choose octave shift to fit the current pattern within this voice's range,
  // preferring shifts that keep the pattern centered in the comfortable register.
  _fitTransposition() {
    const pat = this.currentPattern;
    if (!pat || pat.notes.length === 0) { this.transposition = 0; return; }
    const midis = pat.notes.map(n => n.midi);
    const lo = Math.min(...midis);
    const hi = Math.max(...midis);
    const targetCenter = (this.range[0] + this.range[1]) / 2;

    let best = 0, bestScore = Infinity;
    for (let oct = -3; oct <= 3; oct++) {
      const shift = oct * 12;
      const newLo = lo + shift, newHi = hi + shift;
      let penalty = 0;
      if (newLo < this.range[0]) penalty += this.range[0] - newLo;
      if (newHi > this.range[1]) penalty += newHi - this.range[1];
      const center = (newLo + newHi) / 2;
      const score = penalty * 100 + Math.abs(center - targetCenter);
      if (score < bestScore) { bestScore = score; best = shift; }
    }
    this.transposition = best;
  }

  setGain(g) {
    this.gain = Math.max(0, Math.min(1, g));
    if (!this.muted) this.channel.gain.value = this.gain;
  }

  setMuted(m) {
    this.muted = m;
    if (!this.channel) return;
    const target = this.muted ? 0 : this.gain;
    const t = this.audio.currentTime;
    // Exponential approach to target — smooth ~150ms fade, click-free.
    this.channel.gain.cancelScheduledValues(t);
    this.channel.gain.setTargetAtTime(target, t, 0.05);
  }

  toggleMute() { this.setMuted(!this.muted); }

  toggleRepeat() { this.repeatLocked = !this.repeatLocked; }

  setPan(p) {
    if (!this.panner) return;
    const target = Math.max(-1, Math.min(1, p));
    const t = this.audio.currentTime;
    this.panner.pan.cancelScheduledValues(t);
    this.panner.pan.setTargetAtTime(target, t, 0.08); // smooth re-pan
  }

  // Permanently remove this voice from the ensemble. The visual disappears
  // immediately, but audio continues to fade for a tail (set the time constant
  // higher for a longer audible trail — e.g. timeConstant=1.0 ≈ 3s perceived).
  dismiss(timeConstant = 0.05) {
    if (this.dismissed) return;
    this.dismissed = true;
    this.muted = true;
    this.dismissAudibleUntil = this.audio.currentTime + timeConstant * 5;
    if (this.channel) {
      const t = this.audio.currentTime;
      this.channel.gain.cancelScheduledValues(t);
      this.channel.gain.setTargetAtTime(0, t, timeConstant);
    }
  }

  // Voice keeps producing audio while its dismiss-fade tail is still audible.
  get audible() {
    if (!this.dismissed) return true;
    return this.audio.currentTime < this.dismissAudibleUntil;
  }

  // Move forward/backward in the score by `steps` patterns.
  // Resets loopCount and re-fits transposition.
  advance(steps = 1) {
    const last = this.figures.length - 1;
    const newIdx = Math.max(0, Math.min(last, this.patternIdx + steps));
    if (newIdx !== this.patternIdx) {
      this.patternIdx = newIdx;
      this.loopCount = 0;
      this.patternStartTime = this.audio.currentTime;
      this._fitTransposition();
    }
  }

  // Swap to a different roster instrument while keeping pattern position,
  // gain, mute, audio channel, and loop boundary intact. Re-fits the
  // octave transposition for the new range and preloads the new samples.
  changeInstrument({ instrument, range, color, sustained }) {
    if (instrument === this.instrument) return;
    this.instrument = instrument;
    this.range = range;
    this.color = color;
    this.sustained = !!sustained;
    this._fitTransposition();
    this.preloadSamples().catch(err => console.error('preload failed:', err));
  }

  // Schedule notes from this voice's current pattern up to the audio horizon.
  // tempoFactor scales the score's notional 120-BPM seconds to real seconds
  // (e.g. 0.5 at 240 BPM, 2.0 at 60 BPM).
  // Returns an array of newly-scheduled main-note onset times, so the caller
  // can build a global onset history (used for cross-voice sparkle detection).
  scheduleUpTo(horizon, tempoFactor = 1) {
    const newOnsets = [];
    while (this.nextLoopStart < horizon) {
      const pat = this.currentPattern;
      if (!pat) break;
      const now = this.audio.currentTime;
      for (const n of pat.notes) {
        const t = this.nextLoopStart + n.time * tempoFactor;
        if (t < now - 0.01) continue;
        const midi = n.midi + this.transposition;
        const file = midiToFilename(midi);
        const baseGain = n.grace ? 0.55 : 1.0;
        const noteGain = baseGain * (1 + (Math.random() - 0.5) * VELOCITY_VARIATION);
        const dur = this.sustained && n.duration != null
          ? n.duration * tempoFactor
          : null;
        this.audio.scheduleNote(this.channel, this.instrument, file, t, noteGain, dur);
        if (!n.grace) {
          if (t > this.lastOnsetTime) this.lastOnsetTime = t;
          newOnsets.push(t);
        }
      }
      this.nextLoopStart += pat.duration * tempoFactor;
      this.loopCount++;
    }
    return newOnsets;
  }

  // Preload all chromatic samples we might need across the 53 patterns,
  // accounting for transposition. Called once when the voice spawns.
  async preloadSamples() {
    const seen = new Set();
    // Re-fit transposition for each pattern as we'd play it, collect needed notes.
    const savedIdx = this.patternIdx;
    for (let i = 0; i < this.figures.length; i++) {
      this.patternIdx = i;
      this._fitTransposition();
      for (const n of this.figures[i].notes) {
        const midi = n.midi + this.transposition;
        seen.add(midi);
      }
    }
    this.patternIdx = savedIdx;
    this._fitTransposition();
    await Promise.all(
      [...seen].map(midi =>
        this.audio.loadSample(this.instrument, midiToFilename(midi)).catch(() => null)
      )
    );
  }
}
