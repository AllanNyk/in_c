// main.js — Phase 1 conductor.
// First click: start audio + spawn voice 1.
// Click on empty: spawn next voice (cooldown gated).
// Click on voice: advance one pattern. Right-click on voice: reverse one pattern.
// Hover voice OR ostinato: panel + scroll-wheel volume + `m` to mute.
// The ostinato has volume / mute but no pattern advance — it just keeps the pulse.

import { AudioEngine } from './audio.js';
import { loadPatterns } from './score.js';
import { Voice } from './voice.js';
import { ROSTER } from './roster.js';

// ---- Tunable parameters ---------------------------------------------------

const SPAWN_COOLDOWN     = 20.0;
const AUTO_ADVANCE_N     = 4;
const AUTO_ADVANCE_K     = 2;
const ENDING_N           = 1;
const OSTINATO_INTERVAL  = 0.25; // eighth at 120 BPM
const SCHEDULER_LOOKAHEAD = 0.15;
const OSTINATO_RADIUS    = 26;

// ---- State ----------------------------------------------------------------

const audio = new AudioEngine();
let patterns = null;
let started = false;
let endingMode = false;

const voices = [];
let lastSpawnTime = 0;
let nextOstinatoTime = 0;

// Ostinato is a special "voice": it has a channel, gain, mute, and visual flash,
// but it never advances — it just pulses on every eighth.
const ostinato = {
  channel: null,
  gain: 0.55,
  muted: false,
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
};

// hovered = null | { kind: 'voice', idx } | { kind: 'ostinato' }
let hovered = null;

// ---- DOM ------------------------------------------------------------------

const canvas = document.getElementById('canvas');
const ctx2d  = canvas.getContext('2d');
const masterVolInput = document.getElementById('master-vol');
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

  // First click: start engine + spawn voice 1.
  if (!started) {
    if (!patterns) return;
    await audio.init();
    ostinato.channel = audio.createChannel(ostinato.gain);
    await audio.loadSample('piano', 'c6');
    const t0 = audio.currentTime + 0.2;
    nextOstinatoTime = t0;
    lastSpawnTime = audio.currentTime;
    started = true;
    await spawnNextVoice();
    return;
  }

  const hit = findHover(e.clientX, e.clientY);

  // Voice click: advance / reverse.
  if (hit && hit.kind === 'voice') {
    if (e.button === 0) voices[hit.idx].advance(1);
    else if (e.button === 2) voices[hit.idx].advance(-1);
    return;
  }

  // Ostinato click: do nothing (use scroll wheel or 'm' to mute / set volume).
  if (hit && hit.kind === 'ostinato') return;

  // Empty-space click: try to spawn next voice.
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

// Snap a target time up to the next ostinato pulse so new voices always
// enter locked to the eighth-note grid.
function alignToOstinatoGrid(targetTime) {
  let t = nextOstinatoTime;
  while (t < targetTime) t += OSTINATO_INTERVAL;
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
    audio.scheduleNote(ostinato.channel, 'piano', 'c6', nextOstinatoTime, 1.0);
    ostinato.lastOnsetTime = nextOstinatoTime;
    nextOstinatoTime += OSTINATO_INTERVAL;
  }

  for (const v of voices) v.scheduleUpTo(horizon);
  checkAutoAdvance();
}, 25);

// ---- Render ---------------------------------------------------------------

function colorForVoice(v) {
  const hue = v.color;
  const sat = 50 + v.progress * 35;
  const light = 56 - v.progress * 16;
  return `hsl(${hue}, ${sat}%, ${light}%)`;
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

function drawVoicePanel(v, voiceIdx) {
  const p = voicePosition(voiceIdx, voices.length);
  const cx = canvas.width / 2;
  const onLeftHalf = p.x < cx;
  const sx = onLeftHalf ? p.x + 40 : p.x - 170;
  const sy = p.y - 32;
  drawHoverPanel(sx, sy, v.instrument, `figure ${v.patternIdx + 1}/53`, v.gain, v.muted, colorForVoice(v));
}

function drawOstinatoPanel() {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const sx = cx + 50, sy = cy - 32;
  drawHoverPanel(sx, sy, 'ostinato', '8th-note pulse', ostinato.gain, ostinato.muted, '#000');
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

function render() {
  const w = canvas.width, h = canvas.height;
  ctx2d.fillStyle = '#fff';
  ctx2d.fillRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const now = started ? audio.currentTime : 0;

  // Ostinato
  const ostFlash = pulseFlash(now, ostinato.lastOnsetTime, 0.12, 7);

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

  // Cooldown ring around ostinato (when waiting between spawns)
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

  // Voices
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    const p = voicePosition(i, voices.length);
    const r = voiceRadius(v);
    const flash = pulseFlash(now, v.lastOnsetTime, 0.18, 6);

    if (hovered && hovered.kind === 'voice' && hovered.idx === i) {
      ctx2d.strokeStyle = '#bbb';
      ctx2d.lineWidth = 2;
      drawCircleStroke(p.x, p.y, r + 8);
    }

    if (v.muted) {
      ctx2d.strokeStyle = colorForVoice(v);
      ctx2d.lineWidth = 2;
      drawCircleStroke(p.x, p.y, r + flash);
    } else {
      ctx2d.fillStyle = colorForVoice(v);
      drawCircle(p.x, p.y, r + flash);
    }

    ctx2d.fillStyle = v.muted ? colorForVoice(v) : '#fff';
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
