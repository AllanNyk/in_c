// voice.js — a single performer in the ensemble.
// Owns its own audio channel, current pattern position, and per-voice mute/gain.

import { midiToFilename } from './score.js';

export class Voice {
  constructor({ instrument, range, color, sustained, figures, audio, slotIndex }) {
    this.instrument = instrument;
    this.range = range;
    this.color = color;
    this.sustained = !!sustained;
    this.figures = figures;       // array of patterns [figure 1, figure 2, ..., figure 53]
    this.audio = audio;
    this.slotIndex = slotIndex;   // for stable ordering / placement

    this.channel = audio.createChannel(0.0); // start silent, ramp up on spawn
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
    this.channel.gain.value = this.muted ? 0 : this.gain;
  }

  toggleMute() { this.setMuted(!this.muted); }

  toggleRepeat() { this.repeatLocked = !this.repeatLocked; }

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
  scheduleUpTo(horizon, tempoFactor = 1) {
    while (this.nextLoopStart < horizon) {
      const pat = this.currentPattern;
      if (!pat) break;
      const now = this.audio.currentTime;
      for (const n of pat.notes) {
        const t = this.nextLoopStart + n.time * tempoFactor;
        if (t < now - 0.01) continue;
        const midi = n.midi + this.transposition;
        const file = midiToFilename(midi);
        const noteGain = n.grace ? 0.55 : 1.0;
        // Sustained instruments cut at the note's written end with a short
        // release. Percussive instruments play the full sample (their
        // recorded decay is the intended sound).
        const dur = this.sustained && n.duration != null
          ? n.duration * tempoFactor
          : null;
        this.audio.scheduleNote(this.channel, this.instrument, file, t, noteGain, dur);
        if (!n.grace && t > this.lastOnsetTime) this.lastOnsetTime = t;
      }
      this.nextLoopStart += pat.duration * tempoFactor;
      this.loopCount++;
    }
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
