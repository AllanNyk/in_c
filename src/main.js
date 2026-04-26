// main.js — Phase 2 conductor with visual deepening.
//
// Phase 1 mechanics: spawn cooldown, hover/scroll/M, click advance/right-click reverse,
// auto-advance with leading-edge window, conclude flow, ostinato hover.
//
// Phase 2 visuals: per-voice/ostinato rhythm rings (dots showing each note's
// position in the loop, lit on play), background ripples expanding from center
// on every ostinato pulse, leading-edge halo on voices furthest along the score
// with a slight dim on those falling behind.

import { AudioEngine } from './audio.js';
import { loadPatterns, midiToFilename } from './score.js';
import { Voice } from './voice.js';
import { ROSTER } from './roster.js';

// ---- Tunable parameters ---------------------------------------------------

const SPAWN_COOLDOWN     = 20.0;
const AUTO_ADVANCE_N     = 4;
const AUTO_ADVANCE_K     = 2;
const ENDING_N           = 1;
const BASE_BPM           = 120;  // score is encoded as seconds-at-120-BPM
const BASE_OSTINATO_INTERVAL = 0.25; // eighth at base BPM
const SCHEDULER_LOOKAHEAD = 0.15;
const OSTINATO_RADIUS    = 26;

// Phase 2 visual params
const RIPPLE_MAX_AGE = 0.7;
const RIPPLE_SPEED   = 280;  // px/s — ripple radius growth rate
const RIPPLE_BUFFER  = 8;    // how many recent ostinato pulses to track for ripples
const RING_OFFSET    = 14;   // distance of rhythm ring beyond the circle edge
const DOT_BASE_R     = 2;
const DOT_DECAY      = 0.35; // seconds for a played dot to fade back
const DOT_BASE_ALPHA = 0.18;
const DOT_FLASH_ALPHA = 0.7;

// ---- State ----------------------------------------------------------------

const audio = new AudioEngine();
let patterns = null;
let started = false;
let endingMode = false;
let tempoBPM = BASE_BPM;

// Live-derived helpers — recomputed implicitly each scheduler tick.
function tempoFactor() { return BASE_BPM / tempoBPM; }
function ostinatoInterval() { return BASE_OSTINATO_INTERVAL * tempoFactor(); }

const voices = [];
let lastSpawnTime = 0;
let nextOstinatoTime = 0;
let ostinatoStartTime = 0;
const recentOstinatoOnsets = [];

// Ostinato pitch can be C6 (84, default cap), C5 (72), or C4 (60).
// Left-click cycles up (toward the cap), right-click cycles down.
const OSTINATO_PITCH_MAX = 84;
const OSTINATO_PITCH_MIN = 60;
const OSTINATO_PITCH_STEP = 12; // octave

const ostinato = {
  channel: null,
  gain: 0.55,
  muted: false,
  midi: OSTINATO_PITCH_MAX,
  lastOnsetTime: -1,
  setGain(g) {
    this.gain = Math.max(0, Math.min(1, g));
    if (this.channel && !this.muted) this.channel.gain.value = this.gain;
  },
  setMuted(m) {
    this.muted = m;
    if (this.channel) this.channel.gain.value = this.muted ? 0 : this.gain;
  },
  toggleMute() { this.setMuted(!this.muted); },
  shiftPitch(direction) {
    const next = this.midi + direction * OSTINATO_PITCH_STEP;
    if (next < OSTINATO_PITCH_MIN || next > OSTINATO_PITCH_MAX) return;
    this.midi = next;
  },
  get noteFilename() { return midiToFilename(this.midi); },
  get noteLabel() { return this.noteFilename.toUpperCase(); },
};

let hovered = null; // null | { kind: 'voice', idx } | { kind: 'ostinato' }

// ---- DOM ------------------------------------------------------------------

const canvas = document.getElementById('canvas');
const ctx2d  = canvas.getContext('2d');
const masterVolInput = document.getElementById('master-vol');
const tempoInput     = document.getElementById('tempo');
const tempoValueEl   = document.getElementById('tempo-value');
const concludeBtn    = document.getElementById('conclude-btn');

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// ---- Boot -----------------------------------------------------------------

loadPatterns()
  .then(p => { patterns = p; })
  .catch(err => { console.error('Failed to load score:', err); });

masterVolInput.addEventListener('input', e => audio.setMasterGain(parseFloat(e.target.value)));

tempoInput.addEventListener('input', e => {
  tempoBPM = parseInt(e.target.value, 10);
  tempoValueEl.textContent = tempoBPM;
});

concludeBtn.addEventListener('click', () => {
  if (!started) return;
  endingMode = true;
  concludeBtn.disabled = true;
});

// ---- Geometry / hit testing ----------------------------------------------

function voicePosition(i, total) {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const r = Math.min(canvas.width, canvas.height) * 0.32;
  const angle = (i / Math.max(total, 1)) * Math.PI * 2 - Math.PI / 2;
  return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
}

function voiceRadius(v) { return 22 + v.gain * 8; }

function findHover(x, y) {
  for (let i = 0; i < voices.length; i++) {
    const p = voicePosition(i, voices.length);
    const r = voiceRadius(voices[i]);
    const dx = x - p.x, dy = y - p.y;
    if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return { kind: 'voice', idx: i };
  }
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const dx = x - cx, dy = y - cy;
  if (dx * dx + dy * dy <= (OSTINATO_RADIUS + 6) * (OSTINATO_RADIUS + 6)) {
    return { kind: 'ostinato' };
  }
  return null;
}

function hoveredTarget() {
  if (!hovered) return null;
  if (hovered.kind === 'voice') return voices[hovered.idx];
  if (hovered.kind === 'ostinato') return ostinato;
  return null;
}

// ---- Input ----------------------------------------------------------------

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousemove', e => {
  hovered = findHover(e.clientX, e.clientY);
  canvas.classList.toggle('hover-target', hovered !== null);
});
canvas.addEventListener('mouseleave', () => {
  hovered = null;
  canvas.classList.remove('hover-target');
});

canvas.addEventListener('mousedown', async (e) => {
  e.preventDefault();

  if (!started) {
    if (!patterns) return;
    await audio.init();
    ostinato.channel = audio.createChannel(ostinato.gain);
    // Preload all three pitch options so cycling is instant.
    await Promise.all([
      audio.loadSample('piano', 'c4'),
      audio.loadSample('piano', 'c5'),
      audio.loadSample('piano', 'c6'),
    ]);
    const t0 = audio.currentTime + 0.2;
    nextOstinatoTime = t0;
    ostinatoStartTime = t0;
    lastSpawnTime = audio.currentTime;
    started = true;
    await spawnNextVoice();
    return;
  }

  const hit = findHover(e.clientX, e.clientY);

  if (hit && hit.kind === 'voice') {
    if (e.button === 0) voices[hit.idx].advance(1);
    else if (e.button === 2) voices[hit.idx].advance(-1);
    return;
  }
  if (hit && hit.kind === 'ostinato') {
    // Left = up (toward cap C6), right = down toward C4.
    if (e.button === 0) ostinato.shiftPitch(+1);
    else if (e.button === 2) ostinato.shiftPitch(-1);
    return;
  }

  if (endingMode) return;
  if (voices.length >= ROSTER.length) return;
  const now = audio.currentTime;
  if (now - lastSpawnTime < SPAWN_COOLDOWN) return;
  await spawnNextVoice();
  lastSpawnTime = now;
});

canvas.addEventListener('wheel', (e) => {
  const target = hoveredTarget();
  if (!target) return;
  e.preventDefault();
  const delta = -Math.sign(e.deltaY) * 0.05;
  target.setGain(target.gain + delta);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') {
    const target = hoveredTarget();
    if (target) target.toggleMute();
  }
});

// ---- Spawn ----------------------------------------------------------------

function alignToOstinatoGrid(targetTime) {
  let t = nextOstinatoTime;
  while (t < targetTime) t += ostinatoInterval();
  return t;
}

async function spawnNextVoice() {
  const slot = voices.length;
  if (slot >= ROSTER.length) return;
  const cfg = ROSTER[slot];
  const voice = new Voice({
    instrument: cfg.instrument,
    range: cfg.range,
    color: cfg.color,
    figures: patterns.figures,
    audio,
    slotIndex: slot,
  });
  voice.nextLoopStart = alignToOstinatoGrid(audio.currentTime + 0.3);
  voices.push(voice);
  voice.preloadSamples().catch(err => console.error('preload failed:', err));
}

// ---- Auto-advance ---------------------------------------------------------

function checkAutoAdvance() {
  if (voices.length === 0) return;
  const minIdx = Math.min(...voices.map(v => v.patternIdx));
  const N = endingMode ? ENDING_N : AUTO_ADVANCE_N;
  for (const v of voices) {
    if (v.atEnd) continue;
    if (v.loopCount < N) continue;
    if (!endingMode && v.patternIdx + 1 > minIdx + AUTO_ADVANCE_K) continue;
    v.advance(1);
  }
}

// ---- Scheduler loop -------------------------------------------------------

setInterval(() => {
  if (!started) return;
  const horizon = audio.currentTime + SCHEDULER_LOOKAHEAD;

  while (nextOstinatoTime < horizon) {
    audio.scheduleNote(ostinato.channel, 'piano', ostinato.noteFilename, nextOstinatoTime, 1.0);
    ostinato.lastOnsetTime = nextOstinatoTime;
    recentOstinatoOnsets.push(nextOstinatoTime);
    if (recentOstinatoOnsets.length > RIPPLE_BUFFER) recentOstinatoOnsets.shift();
    nextOstinatoTime += ostinatoInterval();
  }

  const tf = tempoFactor();
  for (const v of voices) v.scheduleUpTo(horizon, tf);
  checkAutoAdvance();
}, 25);

// ---- Render ---------------------------------------------------------------

function voiceHSL(v) {
  return [v.color, 50 + v.progress * 35, 56 - v.progress * 16];
}

function voiceColor(v, alpha = 1) {
  const [h, s, l] = voiceHSL(v);
  return `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
}

function drawCircle(x, y, r) {
  ctx2d.beginPath(); ctx2d.arc(x, y, r, 0, Math.PI * 2); ctx2d.fill();
}
function drawCircleStroke(x, y, r) {
  ctx2d.beginPath(); ctx2d.arc(x, y, r, 0, Math.PI * 2); ctx2d.stroke();
}

function pulseFlash(now, lastOnset, decay, amount) {
  if (lastOnset < 0) return 0;
  const dt = now - lastOnset;
  if (dt < 0 || dt > decay) return 0;
  return (1 - dt / decay) * amount;
}

// Draws small dots around (cx,cy) at radius (baseRadius + RING_OFFSET) at angles
// determined by each non-grace note's position in the loop. Dots brighten on play.
function drawRhythmRing(cx, cy, baseRadius, pattern, loopStartTime, hslBase) {
  if (!pattern || !pattern.notes || pattern.notes.length === 0) return;
  const ringR = baseRadius + RING_OFFSET;
  const now = audio.currentTime;
  const [h, s, l] = hslBase;
  const tf = tempoFactor();
  const actualDuration = pattern.duration * tf;

  for (const note of pattern.notes) {
    if (note.grace) continue;
    const angle = (note.time / pattern.duration) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(angle) * ringR;
    const py = cy + Math.sin(angle) * ringR;

    const noteThisLoop = loopStartTime + note.time * tf;
    const lastPlay = noteThisLoop <= now ? noteThisLoop : noteThisLoop - actualDuration;
    const dt = now - lastPlay;
    const intensity = Math.max(0, 1 - dt / DOT_DECAY);
    const alpha = DOT_BASE_ALPHA + intensity * DOT_FLASH_ALPHA;

    ctx2d.fillStyle = `hsla(${h}, ${s}%, ${l}%, ${alpha})`;
    ctx2d.beginPath();
    ctx2d.arc(px, py, DOT_BASE_R + intensity * 1.6, 0, Math.PI * 2);
    ctx2d.fill();
  }
}

function drawHoverPanel(sx, sy, label, sublabel, gain, muted, fillColor) {
  const w = 140, h = 64;
  ctx2d.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx2d.strokeStyle = '#d0d0d0';
  ctx2d.lineWidth = 1;
  ctx2d.fillRect(sx, sy, w, h);
  ctx2d.strokeRect(sx, sy, w, h);

  ctx2d.fillStyle = '#444';
  ctx2d.font = '11px system-ui, sans-serif';
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'top';
  ctx2d.fillText(label, sx + 10, sy + 8);
  ctx2d.fillStyle = '#999';
  ctx2d.fillText(sublabel, sx + 10, sy + 22);

  const barX = sx + 10, barY = sy + 40, barW = 120, barH = 5;
  ctx2d.fillStyle = '#eee';
  ctx2d.fillRect(barX, barY, barW, barH);
  ctx2d.fillStyle = muted ? '#bbb' : fillColor;
  ctx2d.fillRect(barX, barY, barW * gain, barH);

  ctx2d.fillStyle = '#888';
  ctx2d.fillText(muted ? 'M: unmute · scroll: vol' : 'M: mute · scroll: vol', sx + 10, sy + 50);
}

function drawVoicePanel(v, voiceIdx) {
  const p = voicePosition(voiceIdx, voices.length);
  const cx = canvas.width / 2;
  const onLeftHalf = p.x < cx;
  const sx = onLeftHalf ? p.x + 40 : p.x - 170;
  const sy = p.y - 32;
  drawHoverPanel(sx, sy, v.instrument, `figure ${v.patternIdx + 1}/53`, v.gain, v.muted, voiceColor(v));
}

function drawOstinatoPanel() {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const sx = cx + 50, sy = cy - 32;
  const w = 150, h = 78;

  ctx2d.fillStyle = 'rgba(255, 255, 255, 0.96)';
  ctx2d.strokeStyle = '#d0d0d0';
  ctx2d.lineWidth = 1;
  ctx2d.fillRect(sx, sy, w, h);
  ctx2d.strokeRect(sx, sy, w, h);

  ctx2d.fillStyle = '#444';
  ctx2d.font = '11px system-ui, sans-serif';
  ctx2d.textAlign = 'left';
  ctx2d.textBaseline = 'top';
  ctx2d.fillText('ostinato', sx + 10, sy + 8);
  ctx2d.fillStyle = '#999';
  ctx2d.fillText(`${ostinato.noteLabel} · 8th-note pulse`, sx + 10, sy + 22);

  const barX = sx + 10, barY = sy + 40, barW = 130, barH = 5;
  ctx2d.fillStyle = '#eee';
  ctx2d.fillRect(barX, barY, barW, barH);
  ctx2d.fillStyle = ostinato.muted ? '#bbb' : '#000';
  ctx2d.fillRect(barX, barY, barW * ostinato.gain, barH);

  ctx2d.fillStyle = '#888';
  ctx2d.fillText(ostinato.muted ? 'M: unmute · scroll: vol' : 'M: mute · scroll: vol', sx + 10, sy + 50);
  ctx2d.fillText('L/R click: shift octave', sx + 10, sy + 62);
}

function render() {
  const w = canvas.width, h = canvas.height;
  ctx2d.fillStyle = '#fff';
  ctx2d.fillRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const now = started ? audio.currentTime : 0;

  // ---- Background ripples (one per recent ostinato pulse) -----------------
  if (started && !ostinato.muted) {
    ctx2d.lineWidth = 1;
    for (const t of recentOstinatoOnsets) {
      const dt = now - t;
      if (dt < 0 || dt > RIPPLE_MAX_AGE) continue;
      const radius = dt * RIPPLE_SPEED;
      const alpha = 0.05 * (1 - dt / RIPPLE_MAX_AGE);
      ctx2d.strokeStyle = `rgba(0, 0, 0, ${alpha})`;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx2d.stroke();
    }
  }

  // ---- Ostinato ----------------------------------------------------------
  const ostFlash = pulseFlash(now, ostinato.lastOnsetTime, 0.12, 7);

  // Ostinato rhythm ring (uses parsed ostinato pattern: 8 evenly spaced eighths)
  if (started && patterns && patterns.ostinato) {
    const pat = patterns.ostinato;
    // Current iteration start = last grid-aligned multiple of pat.duration (tempo-scaled).
    // Since the ostinato grid kinks at tempo changes (we don't reset the start time),
    // this is approximate during/right after a tempo change but resyncs quickly.
    const elapsed = now - ostinatoStartTime;
    const actualDuration = pat.duration * tempoFactor();
    const iter = elapsed >= 0 ? Math.floor(elapsed / actualDuration) : 0;
    const loopStart = ostinatoStartTime + iter * actualDuration;
    drawRhythmRing(cx, cy, OSTINATO_RADIUS, pat, loopStart, [0, 0, 12]);
  }

  if (hovered && hovered.kind === 'ostinato') {
    ctx2d.strokeStyle = '#bbb';
    ctx2d.lineWidth = 2;
    drawCircleStroke(cx, cy, OSTINATO_RADIUS + 8);
  }
  if (ostinato.muted) {
    ctx2d.strokeStyle = '#000';
    ctx2d.lineWidth = 2;
    drawCircleStroke(cx, cy, OSTINATO_RADIUS + ostFlash);
  } else {
    ctx2d.fillStyle = '#000';
    drawCircle(cx, cy, OSTINATO_RADIUS + ostFlash);
  }

  // Cooldown ring
  if (started && !endingMode && voices.length > 0 && voices.length < ROSTER.length) {
    const elapsed = now - lastSpawnTime;
    const t = Math.min(1, elapsed / SPAWN_COOLDOWN);
    if (t < 1) {
      ctx2d.strokeStyle = '#e8e8e8';
      ctx2d.lineWidth = 3;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, 50, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * t);
      ctx2d.stroke();
    }
  }

  // ---- Voices -----------------------------------------------------------
  const leadingEdge = voices.length > 0 ? Math.max(...voices.map(v => v.patternIdx)) : 0;

  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    const p = voicePosition(i, voices.length);
    const r = voiceRadius(v);
    const flash = pulseFlash(now, v.lastOnsetTime, 0.18, 6);

    const lag = leadingEdge - v.patternIdx;
    const isLeader = (lag === 0) && voices.length > 1;
    const dimAlpha = lag <= 1 ? 1.0 : Math.max(0.55, 1.0 - (lag - 1) * 0.15);
    const [h, s, l] = voiceHSL(v);

    // Rhythm ring around the voice
    if (v.currentPattern) {
      const loopStart = v.nextLoopStart - v.currentPattern.duration * tempoFactor();
      drawRhythmRing(p.x, p.y, r, v.currentPattern, loopStart, [h, s, l]);
    }

    // Leader halo: two faint rings
    if (isLeader) {
      ctx2d.strokeStyle = `hsla(${h}, ${s}%, ${l}%, 0.28)`;
      ctx2d.lineWidth = 1.5;
      drawCircleStroke(p.x, p.y, r + 11);
      ctx2d.strokeStyle = `hsla(${h}, ${s}%, ${l}%, 0.14)`;
      drawCircleStroke(p.x, p.y, r + 17);
    }

    // Hover ring
    if (hovered && hovered.kind === 'voice' && hovered.idx === i) {
      ctx2d.strokeStyle = '#bbb';
      ctx2d.lineWidth = 2;
      drawCircleStroke(p.x, p.y, r + 8);
    }

    // The circle itself
    if (v.muted) {
      ctx2d.strokeStyle = voiceColor(v, dimAlpha);
      ctx2d.lineWidth = 2;
      drawCircleStroke(p.x, p.y, r + flash);
    } else {
      ctx2d.fillStyle = voiceColor(v, dimAlpha);
      drawCircle(p.x, p.y, r + flash);
    }

    // Pattern number
    ctx2d.fillStyle = v.muted ? voiceColor(v, dimAlpha) : `rgba(255, 255, 255, ${dimAlpha})`;
    ctx2d.font = 'bold 12px system-ui, sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(String(v.patternIdx + 1), p.x, p.y);
  }

  if (hovered && hovered.kind === 'voice') drawVoicePanel(voices[hovered.idx], hovered.idx);
  else if (hovered && hovered.kind === 'ostinato') drawOstinatoPanel();

  if (!started) {
    ctx2d.fillStyle = '#aaa';
    ctx2d.font = '14px system-ui, sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.fillText(patterns ? 'click anywhere to begin' : 'loading…', cx, cy + 80);
  }

  if (started && endingMode && voices.every(v => v.atEnd)) {
    ctx2d.fillStyle = '#888';
    ctx2d.font = '12px system-ui, sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.fillText('all voices on figure 53 — mute them one by one to end', cx, h - 24);
  }

  requestAnimationFrame(render);
}

requestAnimationFrame(render);
