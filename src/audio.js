// audio.js — minimal Web Audio sample-playback engine for Phase 0.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = new Map(); // 'instrument:note' -> AudioBuffer
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);
  }

  async loadSample(instrument, note) {
    const key = `${instrument}:${note}`;
    if (this.buffers.has(key)) return;
    const url = `assets/audio/${instrument}/${note}.mp3`;
    const arr = await fetch(url).then(r => {
      if (!r.ok) throw new Error(`failed to fetch ${url}`);
      return r.arrayBuffer();
    });
    const buf = await this.ctx.decodeAudioData(arr);
    this.buffers.set(key, buf);
  }

  // Schedule a note to play at the given audio-context time.
  // Returns the actual onset time so callers can sync visuals.
  scheduleNote(instrument, note, when, gain = 1.0) {
    const key = `${instrument}:${note}`;
    const buf = this.buffers.get(key);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    src.connect(g).connect(this.master);
    src.start(when);
    return when;
  }

  get currentTime() {
    return this.ctx ? this.ctx.currentTime : 0;
  }
}
