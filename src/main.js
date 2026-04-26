// main.js — Phase 0 walking skeleton.
// First click: start audio, begin ostinato, spawn vibraphone voice 1 looping figure 1.
// Subsequent clicks: ignored for now (Phase 1 adds the full conductor toolkit).

import { AudioEngine } from './audio.js';
import { OSTINATO, FIGURE_1 } from './score.js';

const canvas = document.getElementById('canvas');
const ctx2d = canvas.getContext('2d');
const audio = new AudioEngine();

let started = false;
let nextOstinatoTime = 0;
let lastOstinatoOnset = -1;
const voices = []; // { instrument, pattern, nextLoopStart, lastOnsetTime, color }

function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resize();
window.addEventListener('resize', resize);

// --- Scheduler --------------------------------------------------------------
// Lookahead pattern: every 25ms, schedule any events landing in the next 100ms.

const LOOKAHEAD = 0.1;
const SCHEDULE_INTERVAL_MS = 25;

function scheduler() {
  if (!started) return;
  const horizon = audio.currentTime + LOOKAHEAD;

  while (nextOstinatoTime < horizon) {
    audio.scheduleNote('piano', 'c6', nextOstinatoTime, 0.55);
    lastOstinatoOnset = nextOstinatoTime;
    nextOstinatoTime += OSTINATO.duration;
  }

  for (const v of voices) {
    while (v.nextLoopStart < horizon) {
      for (const n of v.pattern.notes) {
        const t = v.nextLoopStart + n.time;
        const gain = n.grace ? 0.45 : 0.75;
        audio.scheduleNote(v.instrument, n.pitch, t, gain);
        if (!n.grace && t > v.lastOnsetTime) v.lastOnsetTime = t;
      }
      v.nextLoopStart += v.pattern.duration;
    }
  }
}
setInterval(scheduler, SCHEDULE_INTERVAL_MS);

// --- Render -----------------------------------------------------------------

function render() {
  const w = canvas.width, h = canvas.height;
  ctx2d.fillStyle = '#ffffff';
  ctx2d.fillRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const now = started ? audio.currentTime : 0;

  // Ostinato (center)
  const ostBase = 26;
  const ostFlash = pulseFlash(now, lastOstinatoOnset, 0.12, 7);
  ctx2d.fillStyle = '#000000';
  drawCircle(cx, cy, ostBase + ostFlash);

  // Voice circles arranged around ostinato (clock positions).
  const orbitRadius = 150;
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    const angle = (i / Math.max(voices.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const x = cx + Math.cos(angle) * orbitRadius;
    const y = cy + Math.sin(angle) * orbitRadius;
    const flash = pulseFlash(now, v.lastOnsetTime, 0.18, 6);
    ctx2d.fillStyle = v.color;
    drawCircle(x, y, 20 + flash);
  }

  if (!started) {
    ctx2d.fillStyle = '#999999';
    ctx2d.font = '14px system-ui, sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.fillText('click anywhere to begin', cx, cy + 70);
  }

  requestAnimationFrame(render);
}

function drawCircle(x, y, r) {
  ctx2d.beginPath();
  ctx2d.arc(x, y, r, 0, Math.PI * 2);
  ctx2d.fill();
}

function pulseFlash(now, lastOnset, decay, amount) {
  if (lastOnset < 0) return 0;
  const dt = now - lastOnset;
  if (dt < 0 || dt > decay) return 0;
  return (1 - dt / decay) * amount;
}

requestAnimationFrame(render);

// --- Interaction ------------------------------------------------------------

canvas.addEventListener('click', async () => {
  if (started) return; // Phase 0: one voice, one click.
  await audio.init();
  await Promise.all([
    audio.loadSample('piano', 'c6'),
    audio.loadSample('vibraphone', 'c4'),
    audio.loadSample('vibraphone', 'e4'),
  ]);

  const t0 = audio.currentTime + 0.1;
  nextOstinatoTime = t0;
  voices.push({
    instrument: 'vibraphone',
    pattern: FIGURE_1,
    nextLoopStart: t0,
    lastOnsetTime: -1,
    color: '#2a8060',
  });
  started = true;
});
