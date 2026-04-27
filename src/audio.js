// audio.js — Web Audio sample-playback engine with per-voice channels.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.buffers = new Map();      // 'instrument:note' -> AudioBuffer
    this.loadingPromises = new Map(); // 'instrument:note' -> Promise
  }

  async init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(this.ctx.destination);

    // Reverb send: master also feeds a convolver via a wetGain control.
    // Until loadIR is called the convolver has no buffer and is silent, so
    // the audio chain works as dry-only.
    this.convolver = this.ctx.createConvolver();
    this.wetGain = this.ctx.createGain();
    this.wetGain.gain.value = 0.25;
    this.master.connect(this.convolver);
    this.convolver.connect(this.wetGain);
    this.wetGain.connect(this.ctx.destination);
  }

  async loadIR(url) {
    if (!this.ctx) return;
    const arr = await fetch(url).then(r => {
      if (!r.ok) throw new Error(`failed to fetch ${url}`);
      return r.arrayBuffer();
    });
    const buf = await this.ctx.decodeAudioData(arr);
    this.convolver.buffer = buf;
  }

  setWetLevel(v) {
    if (this.wetGain) this.wetGain.gain.value = Math.max(0, Math.min(1, v));
  }

  setMasterGain(v) {
    if (this.master) this.master.gain.value = Math.max(0, Math.min(1, v));
  }

  // A "channel" is a per-voice gain node feeding the master bus.
  createChannel(initialGain = 0.7) {
    const g = this.ctx.createGain();
    g.gain.value = initialGain;
    g.connect(this.master);
    return g;
  }

  async loadSample(instrument, note) {
    const key = `${instrument}:${note}`;
    if (this.buffers.has(key)) return this.buffers.get(key);
    if (this.loadingPromises.has(key)) return this.loadingPromises.get(key);
    const p = (async () => {
      const url = `assets/audio/${instrument}/${note}.mp3`;
      const arr = await fetch(url).then(r => {
        if (!r.ok) throw new Error(`failed to fetch ${url}`);
        return r.arrayBuffer();
      });
      const buf = await this.ctx.decodeAudioData(arr);
      this.buffers.set(key, buf);
      return buf;
    })();
    this.loadingPromises.set(key, p);
    try { return await p; }
    finally { this.loadingPromises.delete(key); }
  }

  // Schedule a buffered note. `channel` is optional; defaults to master.
  // If `duration` is given, applies a gain envelope that holds at full until
  // `when + duration`, then linearly releases to 0 over `releaseTime`, and
  // stops the source. Without `duration`, the sample plays its full natural
  // length (right behavior for percussive samples with intrinsic decay).
  scheduleNote(channel, instrument, note, when, gain = 1.0, duration = null, releaseTime = 0.01) {
    const key = `${instrument}:${note}`;
    const buf = this.buffers.get(key);
    if (!buf) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const noteGain = this.ctx.createGain();
    if (duration != null) {
      const stopAt = when + duration + releaseTime;
      noteGain.gain.setValueAtTime(gain, when);
      noteGain.gain.setValueAtTime(gain, when + duration);
      noteGain.gain.linearRampToValueAtTime(0, stopAt);
      src.connect(noteGain).connect(channel || this.master);
      src.start(when);
      src.stop(stopAt + 0.01);
    } else {
      noteGain.gain.value = gain;
      src.connect(noteGain).connect(channel || this.master);
      src.start(when);
    }
    return when;
  }

  get currentTime() { return this.ctx ? this.ctx.currentTime : 0; }
}
