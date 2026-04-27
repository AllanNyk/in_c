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

const SPAWN_COOLDOWN     = 10.0;
const AUTO_ADVANCE_MIN_LOOPS = 2;   // a voice plays each figure at least this many times
const AUTO_ADVANCE_MIN_DWELL = 20;  // seconds — and stays at least this long, even on short figures
const BASE_BPM           = 120;  // score is encoded as seconds-at-120-BPM
const BASE_OSTINATO_INTERVAL = 0.25; // eighth at base BPM
const SCHEDULER_LOOKAHEAD = 0.5; // larger buffer so audio survives main-thread stalls (iOS rapid taps)
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

// Phase 3 visual params
const SPARKLE_WINDOW = 0.05;  // seconds — onset coincidence window across voices
const SPARKLE_LIFE   = 0.35;  // seconds — sparkle fade duration
const SPARKLE_HISTORY = 1.5;  // seconds — how long onsets stay in pair-check pool
const BG_DARK_RANGE  = 195;   // bg gradient: 255 (white, unison) → 60 (dark grey, fully spread)

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

// Sparkles for polyrhythmic alignment moments between voices on different figures.
const sparkles = [];                   // { x, y, birth }
const recentSparkleKeys = new Map();   // key -> birth time, for dedup
const recentVoiceOnsets = [];          // { time, voiceIdx, patternIdx } sliding window

// Display-side spread, lerped toward the live spreadFactor each frame so the
// background color fades softly between states instead of snapping.
let displayedSpread = 0;
const SPREAD_LERP_RATE = 0.04; // per rAF frame; ~1.2s to reach 95% of target at 60fps

// Ostinato pitch can be C6 (84, cap), C5 (72, default start), or C4 (60).
// Left-click cycles up (toward the cap), right-click cycles down.
const OSTINATO_PITCH_MAX = 84;
const OSTINATO_PITCH_MIN = 60;
const OSTINATO_PITCH_DEFAULT = 72;
const OSTINATO_PITCH_STEP = 12; // octave

const ostinato = {
  channel: null,
  gain: 0.35,
  muted: false,
  hidden: false,                       // visual-only hide; audio keeps playing
  dismissed: false,                    // permanent removal during the dismantling end
  midi: OSTINATO_PITCH_DEFAULT,
  lastOnsetTime: -1,
  setGain(g) {
    this.gain = Math.max(0, Math.min(1, g));
    if (this.channel && !this.muted) this.channel.gain.value = this.gain;
  },
  setMuted(m) {
    this.muted = m;
    if (!this.channel) return;
    const target = this.muted ? 0 : this.gain;
    const t = audio.currentTime;
    this.channel.gain.cancelScheduledValues(t);
    this.channel.gain.setTargetAtTime(target, t, 0.05);
  },
  toggleMute() { this.setMuted(!this.muted); },
  toggleHidden() { this.hidden = !this.hidden; },
  dismiss(timeConstant = 0.05) {
    if (this.dismissed) return;
    this.dismissed = true;
    this.muted = true;
    this.dismissAudibleUntil = audio.currentTime + timeConstant * 5;
    if (this.channel) {
      const t = audio.currentTime;
      this.channel.gain.cancelScheduledValues(t);
      this.channel.gain.setTargetAtTime(0, t, timeConstant);
    }
  },
  get audible() {
    if (!this.dismissed) return true;
    return audio.currentTime < this.dismissAudibleUntil;
  },
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
const reverbInput    = document.getElementById('reverb');
const reverbValueEl  = document.getElementById('reverb-value');
const concludeBtn    = document.getElementById('conclude-btn');
const randomBtn      = document.getElementById('random-btn');
const helpBtn        = document.getElementById('help-btn');
const helpModal      = document.getElementById('help-modal');
const helpClose      = helpModal.querySelector('.help-close');
const aboutBtn       = document.getElementById('about-btn');
const aboutModal     = document.getElementById('about-modal');
const aboutClose     = aboutModal.querySelector('.about-close');
const endgameActions = document.getElementById('endgame-actions');
const downloadBtn    = document.getElementById('download-btn');
const resetBtn       = document.getElementById('reset-btn');
const touchPanel     = document.getElementById('touch-panel');
const tpName         = touchPanel.querySelector('.tp-name');
const tpSub          = touchPanel.querySelector('.tp-sub');
const tpClose        = touchPanel.querySelector('.tp-close');
const tpVolume       = touchPanel.querySelector('.tp-volume');
const tpInstrRow     = touchPanel.querySelector('.tp-instr-row');
const tpPitchRow     = touchPanel.querySelector('.tp-pitch-row');
const tpFigureRow    = touchPanel.querySelector('.tp-figure-row');
const tpAlignBtn     = touchPanel.querySelector('.tp-align-btn');
const tpLockBtn      = touchPanel.querySelector('.tp-lock-btn');
const tpHideBtn      = touchPanel.querySelector('.tp-hide-btn');

// Touch-panel selection state. selected: null | { kind: 'voice', idx } | { kind: 'ostinato' }
let panelSelected = null;
let lastPanelRefreshT = -1;

// Onboarding state
let everHovered = false;
let everPressedRandomize = false;
let dismantleCompleteTime = -1; // audio time when ostinato + every voice were dismissed

// Performance log — every spawn / figure change / dismiss is recorded so the
// end-of-piece mandala can trace each voice's journey through the score.
const performanceLog = [];
let performanceStartTime = 0;
function logEvent(type, data) {
  performanceLog.push({ t: audio.currentTime, type, ...data });
}

// Transient one-line message, used to give feedback for actions that silently
// failed (e.g. click-to-spawn during cooldown). Cleared automatically by render.
let transientMessage = null; // { text, birth, life }
function transient(text, life = 1.6) {
  transientMessage = { text, birth: audio.currentTime, life };
}

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

reverbInput.addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  audio.setWetLevel(v);
  reverbValueEl.textContent = `${Math.round(v * 100)}%`;
});

concludeBtn.addEventListener('click', () => {
  if (!started) return;
  endingMode = true;
  concludeBtn.disabled = true;
});

function setHelpOpen(open) { helpModal.hidden = !open; }
helpBtn.addEventListener('click', () => setHelpOpen(helpModal.hidden));
helpClose.addEventListener('click', () => setHelpOpen(false));
helpModal.addEventListener('click', (e) => {
  if (e.target === helpModal) setHelpOpen(false);
});

function setAboutOpen(open) { aboutModal.hidden = !open; }
aboutBtn.addEventListener('click', () => setAboutOpen(aboutModal.hidden));
aboutClose.addEventListener('click', () => setAboutOpen(false));
aboutModal.addEventListener('click', (e) => {
  if (e.target === aboutModal) setAboutOpen(false);
});

randomBtn.addEventListener('click', () => randomizeAllFigures());

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
    if (voices[i].dismissed) continue;
    const p = voicePosition(i, voices.length);
    const r = voiceRadius(voices[i]);
    const dx = x - p.x, dy = y - p.y;
    if (dx * dx + dy * dy <= (r + 4) * (r + 4)) return { kind: 'voice', idx: i };
  }
  if (!ostinato.dismissed) {
    const cx = canvas.width / 2, cy = canvas.height / 2;
    const dx = x - cx, dy = y - cy;
    if (dx * dx + dy * dy <= (OSTINATO_RADIUS + 6) * (OSTINATO_RADIUS + 6)) {
      return { kind: 'ostinato' };
    }
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

// iOS Safari can suspend the AudioContext mid-session (sometimes triggered by
// rapid touches or HTML element interactions). Defensively resume on every
// pointerdown anywhere in the document so playback never silently stalls.
document.addEventListener('pointerdown', () => {
  if (audio.ctx && audio.ctx.state !== 'running') {
    audio.ctx.resume().catch(() => {});
  }
}, true);

// Unified mouse + touch input via Pointer Events. Mouse acts on press
// (preserving existing left/right-click semantics + modifier keys); touch
// requires a short tap (no drag) and routes through the on-screen control
// panel since touch has no hover, scroll, right-click or keyboard.

let pressInfo = null;
const TAP_MOVE_THRESHOLD_SQ = 100;

canvas.addEventListener('pointermove', e => {
  // Hover (mouse only)
  if (e.pointerType === 'mouse') {
    hovered = findHover(e.clientX, e.clientY);
    canvas.classList.toggle('hover-target', hovered !== null);
    if (hovered) everHovered = true;
  }
  // Cancel pending tap if the touch dragged
  if (pressInfo) {
    const dx = e.clientX - pressInfo.x;
    const dy = e.clientY - pressInfo.y;
    if (dx * dx + dy * dy > TAP_MOVE_THRESHOLD_SQ) pressInfo = null;
  }
});
canvas.addEventListener('pointerleave', () => {
  hovered = null;
  canvas.classList.remove('hover-target');
});

canvas.addEventListener('pointerdown', async (e) => {
  e.preventDefault();
  if (e.pointerType === 'mouse') {
    await handleClick(e.clientX, e.clientY, {
      button: e.button,
      ctrl: e.ctrlKey,
      meta: e.metaKey,
      shift: e.shiftKey,
      isTouch: false,
    });
  } else {
    pressInfo = { x: e.clientX, y: e.clientY, hit: findHover(e.clientX, e.clientY) };
  }
});

canvas.addEventListener('pointerup', async (e) => {
  if (!pressInfo || e.pointerType === 'mouse') { pressInfo = null; return; }
  const info = pressInfo;
  pressInfo = null;
  await handleClick(info.x, info.y, {
    button: 0,
    ctrl: false, meta: false, shift: false,
    isTouch: true,
    hitOverride: info.hit,
  });
});

canvas.addEventListener('pointercancel', () => { pressInfo = null; });

async function handleClick(x, y, opts) {
  // First click: start the engine + spawn voice 1.
  if (!started) {
    if (!patterns) return;
    await audio.init();
    ostinato.channel = audio.createChannel(ostinato.gain);
    await Promise.all([
      audio.loadSample('piano', 'c4'),
      audio.loadSample('piano', 'c5'),
      audio.loadSample('piano', 'c6'),
      audio.loadIR('assets/audio/ir/theatre41.wav').catch(err => console.error('IR load failed:', err)),
    ]);
    const t0 = audio.currentTime + 0.2;
    nextOstinatoTime = t0;
    ostinatoStartTime = t0;
    lastSpawnTime = audio.currentTime;
    performanceStartTime = audio.currentTime;
    started = true;
    await spawnNextVoice();
    return;
  }

  const hit = opts.hitOverride !== undefined ? opts.hitOverride : findHover(x, y);

  // Dismantling phase: any left-click/tap dismisses the targeted part forever.
  // The very last dismissal (the click that empties the canvas) gets a long
  // 3-second audible trail; earlier dismissals fade quickly so the player
  // can move at their own pace.
  if (endingMode && opts.button === 0) {
    if (hit && hit.kind === 'voice') {
      const v = voices[hit.idx];
      const isLast = ostinato.dismissed && voices.every(vx => vx === v || vx.dismissed);
      v.dismiss(isLast ? 1.0 : 0.05);
      logEvent('dismiss', { kind: 'voice', voiceIdx: hit.idx });
      if (panelSelected && panelSelected.kind === 'voice' && panelSelected.idx === hit.idx) closeTouchPanel();
      return;
    }
    if (hit && hit.kind === 'ostinato') {
      const isLast = voices.every(v => v.dismissed);
      ostinato.dismiss(isLast ? 1.0 : 0.05);
      logEvent('dismiss', { kind: 'ostinato' });
      if (panelSelected && panelSelected.kind === 'ostinato') closeTouchPanel();
      return;
    }
  }

  // Touch: tap on a part opens the control panel; tap on empty space closes
  // an open panel or spawns the next voice.
  if (opts.isTouch) {
    if (hit && hit.kind === 'voice') { openTouchPanel({ kind: 'voice', idx: hit.idx }); return; }
    if (hit && hit.kind === 'ostinato') { openTouchPanel({ kind: 'ostinato' }); return; }
    if (panelSelected) { closeTouchPanel(); return; }
  } else {
    // Mouse: original click semantics.
    if (hit && hit.kind === 'voice') {
      const v = voices[hit.idx];
      const big = opts.ctrl || opts.meta;
      if (opts.button === 0) {
        if (opts.shift) {
          const target = v.patternIdx;
          for (const other of voices) {
            if (other === v) continue;
            other.advance(target - other.patternIdx);
          }
        } else {
          v.advance(big ? 5 : 1);
        }
      } else if (opts.button === 2) {
        v.advance(big ? -5 : -1);
      }
      return;
    }
    if (hit && hit.kind === 'ostinato') {
      if (opts.button === 0) ostinato.shiftPitch(+1);
      else if (opts.button === 2) ostinato.shiftPitch(-1);
      return;
    }
  }

  // Empty-space: try to spawn next voice.
  if (endingMode) { transient('ending mode — spawning disabled'); return; }
  if (voices.length >= ROSTER.length) { transient('all 11 voices in — press R to randomize'); return; }
  const now = audio.currentTime;
  const elapsed = now - lastSpawnTime;
  if (elapsed < SPAWN_COOLDOWN) {
    const remaining = Math.max(1, Math.ceil(SPAWN_COOLDOWN - elapsed));
    transient(`wait — next voice ready in ${remaining}s`);
    return;
  }
  await spawnNextVoice();
  lastSpawnTime = now;
}

// ---- Touch control panel -------------------------------------------------

function openTouchPanel(sel) {
  panelSelected = sel;
  refreshTouchPanel();
  touchPanel.hidden = false;
}
function closeTouchPanel() {
  panelSelected = null;
  touchPanel.hidden = true;
}
function refreshTouchPanel() {
  if (!panelSelected) return;
  if (panelSelected.kind === 'voice') {
    const v = voices[panelSelected.idx];
    if (!v || v.dismissed) { closeTouchPanel(); return; }
    tpName.textContent = v.instrument;
    tpSub.textContent = v.repeatLocked
      ? `figure ${v.patternIdx + 1}/${v.figureCount} · locked`
      : `figure ${v.patternIdx + 1}/${v.figureCount}`;
    tpVolume.value = v.gain;
    tpInstrRow.hidden = false;
    tpPitchRow.hidden = true;
    tpFigureRow.hidden = false;
    tpAlignBtn.hidden = false;
    tpLockBtn.hidden = false;
    tpHideBtn.hidden = true;
    setActive(touchPanel.querySelector('[data-action="mute"]'), v.muted);
    setActive(tpLockBtn, v.repeatLocked);
  } else if (panelSelected.kind === 'ostinato') {
    if (ostinato.dismissed) { closeTouchPanel(); return; }
    tpName.textContent = 'ostinato';
    tpSub.textContent = `${ostinato.noteLabel} · 8th-note pulse${ostinato.hidden ? ' · hidden' : ''}`;
    tpVolume.value = ostinato.gain;
    tpInstrRow.hidden = true;
    tpPitchRow.hidden = false;
    tpFigureRow.hidden = true;
    tpAlignBtn.hidden = true;
    tpLockBtn.hidden = true;
    tpHideBtn.hidden = false;
    setActive(touchPanel.querySelector('[data-action="mute"]'), ostinato.muted);
    setActive(tpHideBtn, ostinato.hidden);
  }
}
function setActive(btn, on) { btn.classList.toggle('active', !!on); }

tpClose.addEventListener('click', closeTouchPanel);
tpVolume.addEventListener('input', () => {
  if (!panelSelected) return;
  const v = parseFloat(tpVolume.value);
  if (panelSelected.kind === 'voice') voices[panelSelected.idx].setGain(v);
  else if (panelSelected.kind === 'ostinato') ostinato.setGain(v);
});

touchPanel.addEventListener('click', (e) => {
  const action = e.target.dataset && e.target.dataset.action;
  if (!action || !panelSelected) return;
  // Belt-and-suspenders for iOS: re-arm the audio context on every panel tap.
  if (audio.ctx && audio.ctx.state !== 'running') audio.ctx.resume().catch(() => {});
  if (panelSelected.kind === 'voice') {
    const v = voices[panelSelected.idx];
    if (!v || v.dismissed) { closeTouchPanel(); return; }
    switch (action) {
      case 'back-5': v.advance(-5); break;
      case 'back-1': v.advance(-1); break;
      case 'fwd-1':  v.advance(+1); break;
      case 'fwd-5':  v.advance(+5); break;
      case 'instr-prev': cycleVoiceInstrument(v, -1); break;
      case 'instr-next': cycleVoiceInstrument(v, +1); break;
      case 'mute': v.toggleMute(); break;
      case 'lock': v.toggleRepeat(); break;
      case 'align': {
        const target = v.patternIdx;
        for (const other of voices) {
          if (other === v) continue;
          other.advance(target - other.patternIdx);
        }
        break;
      }
    }
  } else if (panelSelected.kind === 'ostinato') {
    switch (action) {
      case 'pitch-up':   ostinato.shiftPitch(+1); break;
      case 'pitch-down': ostinato.shiftPitch(-1); break;
      case 'mute': ostinato.toggleMute(); break;
      case 'hide': ostinato.toggleHidden(); break;
    }
  }
  refreshTouchPanel();
});

canvas.addEventListener('wheel', (e) => {
  const target = hoveredTarget();
  if (!target) return;
  e.preventDefault();
  const delta = -Math.sign(e.deltaY) * 0.05;
  target.setGain(target.gain + delta);
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === '?') { e.preventDefault(); setHelpOpen(helpModal.hidden); return; }
  if (e.key === 'Escape') {
    if (!aboutModal.hidden) { setAboutOpen(false); return; }
    if (!helpModal.hidden) { setHelpOpen(false); return; }
  }
  if (!helpModal.hidden || !aboutModal.hidden) return; // swallow game-control keys while a modal is open
  if (e.key === 'm' || e.key === 'M') {
    const target = hoveredTarget();
    if (target) target.toggleMute();
    return;
  }
  // Ostinato-only keys.
  if (hovered && hovered.kind === 'ostinato') {
    if (e.key === 'h' || e.key === 'H') {
      ostinato.toggleHidden();
    }
    return;
  }
  // Voice-only keys.
  if (hovered && hovered.kind === 'voice') {
    if (e.key === 'r' || e.key === 'R') {
      voices[hovered.idx].toggleRepeat();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      cycleVoiceInstrument(voices[hovered.idx], -1);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      cycleVoiceInstrument(voices[hovered.idx], +1);
    }
    return;
  }
  // Global keys (no hover target).
  if (e.key === 'r' || e.key === 'R') {
    if (voices.length >= ROSTER.length && patterns) {
      randomizeAllFigures();
    }
  }
});

// Reroll every (unlocked) voice to a random figure. Available only once the
// full roster has been spawned — gives the player a "reshuffle the texture"
// gesture for the late-game.
function randomizeAllFigures() {
  const total = patterns.figures.length;
  for (const v of voices) {
    if (v.repeatLocked) continue;
    const target = Math.floor(Math.random() * total);
    v.advance(target - v.patternIdx);
  }
  everPressedRandomize = true;
}

function cycleVoiceInstrument(voice, direction) {
  const idx = ROSTER.findIndex(r => r.instrument === voice.instrument);
  const start = idx >= 0 ? idx : 0;
  const newIdx = (start + direction + ROSTER.length) % ROSTER.length;
  voice.changeInstrument(ROSTER[newIdx]);
}

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
    sustained: cfg.sustained,
    figures: patterns.figures,
    audio,
    slotIndex: slot,
  });
  voice.nextLoopStart = alignToOstinatoGrid(audio.currentTime + 0.3);
  voices.push(voice);
  voice.preloadSamples().catch(err => console.error('preload failed:', err));
  logEvent('spawn', { voiceIdx: slot, instrument: cfg.instrument, color: cfg.color });
  showVoiceSpawnHint(voices.length);
  updateAllVoicePans();
}

// Lightweight figure-change tracker. Polls active voices a few times a second
// and logs a 'figure' event whenever a voice's patternIdx has shifted since
// the last tick. Cheaper than wrapping every advance() call site.
setInterval(() => {
  if (!started) return;
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    if (v.dismissed) continue;
    if (v._lastLoggedFigure !== v.patternIdx) {
      logEvent('figure', { voiceIdx: i, patternIdx: v.patternIdx });
      v._lastLoggedFigure = v.patternIdx;
    }
  }
}, 400);

// Endgame buttons: download the current canvas as PNG, or reload to start over.
downloadBtn.addEventListener('click', () => {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');
  const off = renderMandalaArtifact(1080);
  const a = document.createElement('a');
  a.href = off.toDataURL('image/png');
  a.download = `in_c_mandala_${stamp}.png`;
  a.click();
});
resetBtn.addEventListener('click', () => location.reload());

// Pan each voice based on its angular position around the ostinato — voices
// on the right side of the ring pan right, voices on the left pan left,
// top/bottom stay near center. Re-runs every spawn since adding a new voice
// reflows everyone's angles. STEREO_WIDTH caps the maximum pan amount.
const STEREO_WIDTH = 0.6;
function updateAllVoicePans() {
  const total = voices.length;
  if (total === 0) return;
  for (let i = 0; i < total; i++) {
    const angle = (i / total) * Math.PI * 2 - Math.PI / 2;
    voices[i].setPan(Math.cos(angle) * STEREO_WIDTH);
  }
}

// Per-voice intro hints — fired as a transient when each new voice spawns,
// stepping the player through gestures, then visualization, then context
// about the piece itself, finally the ending goal.
const VOICE_SPAWN_HINTS = {
  2:  'each voice auto-advances through the 53 figures every ~20 seconds on its own',
  3:  'ctrl + click a voice to jump 5 figures forward · ctrl + right-click to go back 5',
  4:  'shift + click a voice to align every other voice to its current figure',
  5:  'press R while hovering a voice to lock it on its current figure',
  6:  'press ← or → while hovering a voice to swap its instrument',
  7:  'gold strands link voices on the same figure · colored sparkles mark cross-rhythmic coincidences between different figures',
  8:  '"In C" was composed by Terry Riley in 1964 — a foundational work of musical minimalism',
  9:  'the piece is 53 short melodic figures, performed in sequence by any number of musicians',
  10: 'each performer chooses how many times to repeat a figure before advancing — every performance is unique',
  11: 'get all 11 instruments to figure 53 and then end the piece at your leisure',
};
function showVoiceSpawnHint(count) {
  const text = VOICE_SPAWN_HINTS[count];
  if (text) transient(text, 9);
}

// ---- Auto-advance ---------------------------------------------------------

function checkAutoAdvance() {
  if (voices.length === 0) return;
  const now = audio.currentTime;
  for (const v of voices) {
    if (v.dismissed) continue;
    if (v.repeatLocked) continue;
    if (v.atEnd) continue;
    if (v.loopCount < 1) continue; // always play each figure through at least once
    if (!endingMode) {
      if (v.loopCount < AUTO_ADVANCE_MIN_LOOPS) continue;
      const dwell = now - v.patternStartTime;
      if (dwell < AUTO_ADVANCE_MIN_DWELL) continue;
    }
    v.advance(1);
  }
}

// ---- Scheduler loop -------------------------------------------------------

setInterval(() => {
  if (!started) return;
  const horizon = audio.currentTime + SCHEDULER_LOOKAHEAD;

  while (nextOstinatoTime < horizon) {
    if (ostinato.audible) {
      audio.scheduleNote(ostinato.channel, 'piano', ostinato.noteFilename, nextOstinatoTime, 1.0);
      ostinato.lastOnsetTime = nextOstinatoTime;
      recentOstinatoOnsets.push(nextOstinatoTime);
      if (recentOstinatoOnsets.length > RIPPLE_BUFFER) recentOstinatoOnsets.shift();
    }
    nextOstinatoTime += ostinatoInterval();
  }

  const tf = tempoFactor();
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    if (!v.audible) continue; // dismissed AND its fade tail is finished
    const newOnsets = v.scheduleUpTo(horizon, tf);
    if (v.muted) continue; // muted voices don't seed sparkles
    for (const t of newOnsets) {
      recentVoiceOnsets.push({ time: t, voiceIdx: i, patternIdx: v.patternIdx });
    }
  }
  // Prune old onsets and sparkle dedup keys.
  const cutoff = audio.currentTime - SPARKLE_HISTORY;
  while (recentVoiceOnsets.length > 0 && recentVoiceOnsets[0].time < cutoff) {
    recentVoiceOnsets.shift();
  }
  for (const [k, t] of recentSparkleKeys) {
    if (t < cutoff) recentSparkleKeys.delete(k);
  }
  detectPolyrhythmicSparkles();
  checkAutoAdvance();
}, 25);

// Detect onsets from voices on DIFFERENT figures that fall within SPARKLE_WINDOW
// of each other. Each unique pair-and-time spawns one sparkle at the midpoint
// of the two voices' positions. Direct visualization of Riley's "polyrhythmic
// combinations that spontaneously arise between patterns".
function detectPolyrhythmicSparkles() {
  for (let i = 0; i < recentVoiceOnsets.length; i++) {
    const a = recentVoiceOnsets[i];
    for (let j = i + 1; j < recentVoiceOnsets.length; j++) {
      const b = recentVoiceOnsets[j];
      if (Math.abs(a.time - b.time) > SPARKLE_WINDOW) continue;
      if (a.voiceIdx === b.voiceIdx) continue;
      if (a.patternIdx === b.patternIdx) continue;
      const lo = Math.min(a.voiceIdx, b.voiceIdx);
      const hi = Math.max(a.voiceIdx, b.voiceIdx);
      const onsetTime = Math.max(a.time, b.time);
      const key = `${lo}_${hi}_${onsetTime.toFixed(3)}`;
      if (recentSparkleKeys.has(key)) continue;
      recentSparkleKeys.set(key, onsetTime);
      const pa = voicePosition(a.voiceIdx, voices.length);
      const pb = voicePosition(b.voiceIdx, voices.length);
      sparkles.push({
        x: (pa.x + pb.x) / 2,
        y: (pa.y + pb.y) / 2,
        birth: onsetTime,
        hue: mixHue(voices[a.voiceIdx].color, voices[b.voiceIdx].color),
      });
    }
  }
}

// Average two HSL hues correctly around the circle (so 350 + 30 mixes to 10,
// not to 190). Each sparkle inherits the mid-hue between its two voices'
// colors, so visually you can read which two voices just kissed.
function mixHue(h1, h2) {
  let a = h1, b = h2;
  if (Math.abs(a - b) > 180) {
    if (a < b) a += 360;
    else b += 360;
  }
  return ((a + b) / 2 + 360) % 360;
}

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

function drawHoverPanel(sx, sy, label, sublabel, gain, muted, fillColor, extraHints) {
  const hints = Array.isArray(extraHints) ? extraHints : (extraHints ? [extraHints] : []);
  const w = 168;
  const h = 64 + hints.length * 12;
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

  const barX = sx + 10, barY = sy + 40, barW = 148, barH = 5;
  ctx2d.fillStyle = '#eee';
  ctx2d.fillRect(barX, barY, barW, barH);
  ctx2d.fillStyle = muted ? '#bbb' : fillColor;
  ctx2d.fillRect(barX, barY, barW * gain, barH);

  ctx2d.fillStyle = '#888';
  ctx2d.fillText(muted ? 'M unmute · R lock · scroll vol' : 'M mute · R lock · scroll vol', sx + 10, sy + 50);
  for (let i = 0; i < hints.length; i++) {
    ctx2d.fillText(hints[i], sx + 10, sy + 62 + i * 12);
  }
}

function drawVoicePanel(v, voiceIdx) {
  const p = voicePosition(voiceIdx, voices.length);
  const cx = canvas.width / 2;
  const onLeftHalf = p.x < cx;
  const sx = onLeftHalf ? p.x + 40 : p.x - 178;
  const sy = p.y - 50;
  const total = v.figureCount;
  const sublabel = v.repeatLocked
    ? `figure ${v.patternIdx + 1}/${total} · locked`
    : `figure ${v.patternIdx + 1}/${total}`;
  drawHoverPanel(
    sx, sy,
    v.instrument,
    sublabel,
    v.gain, v.muted, voiceColor(v),
    ['← → swap instrument', 'click ±1 · ctrl+click ±5', 'shift+click: align all'],
  );
}

function drawOstinatoPanel() {
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const sx = cx + 50, sy = cy - 38;
  const w = 158, h = 90;

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
  const status = ostinato.hidden ? ' · hidden' : '';
  ctx2d.fillText(`${ostinato.noteLabel} · 8th-note pulse${status}`, sx + 10, sy + 22);

  const barX = sx + 10, barY = sy + 40, barW = 138, barH = 5;
  ctx2d.fillStyle = '#eee';
  ctx2d.fillRect(barX, barY, barW, barH);
  ctx2d.fillStyle = ostinato.muted ? '#bbb' : '#000';
  ctx2d.fillRect(barX, barY, barW * ostinato.gain, barH);

  ctx2d.fillStyle = '#888';
  ctx2d.fillText(ostinato.muted ? 'M unmute · scroll vol' : 'M mute · scroll vol', sx + 10, sy + 50);
  ctx2d.fillText('L/R click: shift octave', sx + 10, sy + 62);
  ctx2d.fillText(ostinato.hidden ? 'H: show' : 'H: hide visually', sx + 10, sy + 74);
}

function render() {
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2;
  const now = started ? audio.currentTime : 0;

  // ---- Background: white when in unison, gradually grey-black as ensemble spreads
  let targetSpread = 0;
  if (started && voices.length > 1) {
    const distinctFigures = new Set();
    for (const v of voices) {
      if (v.muted) continue;
      distinctFigures.add(v.patternIdx);
    }
    // Fixed palette: scale against the maximum possible distinct figures
    // (=full roster size) so 2 voices on different figures is a slight tint,
    // not full darkness. 11 voices on 11 different figures is full dark.
    targetSpread = Math.max(0, (distinctFigures.size - 1) / (ROSTER.length - 1));
  }
  // Lerp displayed spread toward target so the bg color fades softly.
  displayedSpread += (targetSpread - displayedSpread) * SPREAD_LERP_RATE;
  const bgValue = Math.round(255 - displayedSpread * BG_DARK_RANGE);
  const inkValue = 255 - bgValue; // contrast color for "neutral" elements (ostinato, ripples)
  ctx2d.fillStyle = `rgb(${bgValue}, ${bgValue}, ${bgValue})`;
  ctx2d.fillRect(0, 0, w, h);

  // ---- Background ripples (one per recent ostinato pulse) -----------------
  if (started && !ostinato.muted) {
    ctx2d.lineWidth = 1;
    for (const t of recentOstinatoOnsets) {
      const dt = now - t;
      if (dt < 0 || dt > RIPPLE_MAX_AGE) continue;
      const radius = dt * RIPPLE_SPEED;
      const alpha = 0.06 * (1 - dt / RIPPLE_MAX_AGE);
      ctx2d.strokeStyle = `rgba(${inkValue}, ${inkValue}, ${inkValue}, ${alpha})`;
      ctx2d.beginPath();
      ctx2d.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx2d.stroke();
    }
  }

  // ---- Ostinato ----------------------------------------------------------
  const ostFlash = pulseFlash(now, ostinato.lastOnsetTime, 0.12, 7);
  const ostInk = `rgb(${inkValue}, ${inkValue}, ${inkValue})`;
  const ostinatoVisible = !ostinato.hidden && !ostinato.dismissed;

  // Ostinato rhythm ring (uses parsed ostinato pattern: 8 evenly spaced eighths).
  // Skip when the ostinato is hidden (audio still plays) or dismissed.
  if (started && patterns && patterns.ostinato && ostinatoVisible) {
    const pat = patterns.ostinato;
    const elapsed = now - ostinatoStartTime;
    const actualDuration = pat.duration * tempoFactor();
    const iter = elapsed >= 0 ? Math.floor(elapsed / actualDuration) : 0;
    const loopStart = ostinatoStartTime + iter * actualDuration;
    // Ring lightness inverts with bg so dots remain readable on dark spread bg.
    const ringL = bgValue > 128 ? 12 : 88;
    drawRhythmRing(cx, cy, OSTINATO_RADIUS, pat, loopStart, [0, 0, ringL]);
  }

  if (hovered && hovered.kind === 'ostinato') {
    ctx2d.strokeStyle = '#bbb';
    ctx2d.lineWidth = 2;
    drawCircleStroke(cx, cy, OSTINATO_RADIUS + 8);
  }
  if (ostinatoVisible) {
    if (ostinato.muted) {
      ctx2d.strokeStyle = ostInk;
      ctx2d.lineWidth = 2;
      drawCircleStroke(cx, cy, OSTINATO_RADIUS + ostFlash);
    } else {
      ctx2d.fillStyle = ostInk;
      drawCircle(cx, cy, OSTINATO_RADIUS + ostFlash);
    }
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

  // ---- Unison light bridges --------------------------------------------
  // Group unmuted voices by current patternIdx. Any group of ≥2 gets thin
  // glowing strands drawn between every pair of voice positions. Strands
  // brighten in pulses tied to the cluster's most recent note onset.
  // When the piece is in its final unison (Conclude pressed and all on 53)
  // the strands glow brighter and shimmer with a small jitter.
  const finalUnison = endingMode && voices.length > 0 && voices.every(v => v.dismissed || v.atEnd) && voices.some(v => !v.dismissed);
  if (voices.length > 1) {
    const clusters = new Map();
    for (let i = 0; i < voices.length; i++) {
      if (voices[i].muted || voices[i].dismissed) continue;
      const k = voices[i].patternIdx;
      if (!clusters.has(k)) clusters.set(k, []);
      clusters.get(k).push(i);
    }
    for (const indices of clusters.values()) {
      if (indices.length < 2) continue;
      let clusterLastOnset = -1;
      for (const i of indices) {
        if (voices[i].lastOnsetTime > clusterLastOnset) {
          clusterLastOnset = voices[i].lastOnsetTime;
        }
      }
      const intensity = pulseFlash(now, clusterLastOnset, 0.45, 1) || 0;
      let coreAlpha = 0.22 + intensity * 0.55;
      let haloAlpha = 0.10 + intensity * 0.32;
      let coreWidth = 1;
      let haloWidth = 6;
      if (finalUnison) {
        coreAlpha = 0.55 + intensity * 0.40;
        haloAlpha = 0.30 + intensity * 0.40;
        coreWidth = 1.5;
        haloWidth = 9;
      }
      for (let a = 0; a < indices.length; a++) {
        const pa = voicePosition(indices[a], voices.length);
        for (let b = a + 1; b < indices.length; b++) {
          const pb = voicePosition(indices[b], voices.length);
          let x1 = pa.x, y1 = pa.y, x2 = pb.x, y2 = pb.y;
          if (finalUnison) {
            // Tiny shimmer per strand — high frequency, ~1px amplitude. Each
            // strand uses a different phase so the whole web "breathes".
            const phase = indices[a] * 7 + indices[b] * 11;
            const jx = Math.sin(now * 16 + phase) * 1.1;
            const jy = Math.cos(now * 19 + phase * 1.3) * 1.1;
            x1 += jx; y1 += jy; x2 -= jx; y2 -= jy;
          }
          // Soft halo
          ctx2d.strokeStyle = `rgba(255, 228, 160, ${haloAlpha})`;
          ctx2d.lineWidth = haloWidth;
          ctx2d.beginPath();
          ctx2d.moveTo(x1, y1);
          ctx2d.lineTo(x2, y2);
          ctx2d.stroke();
          // Bright core
          ctx2d.strokeStyle = `rgba(255, 232, 170, ${coreAlpha})`;
          ctx2d.lineWidth = coreWidth;
          ctx2d.stroke();
        }
      }
    }
  }

  // ---- Voices -----------------------------------------------------------
  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    if (v.dismissed) continue; // dismantled — silent and invisible
    const p = voicePosition(i, voices.length);
    const r = voiceRadius(v);
    const flash = pulseFlash(now, v.lastOnsetTime, 0.18, 6);
    const [h, s, l] = voiceHSL(v);

    // Rhythm ring around the voice
    if (v.currentPattern) {
      const loopStart = v.nextLoopStart - v.currentPattern.duration * tempoFactor();
      drawRhythmRing(p.x, p.y, r, v.currentPattern, loopStart, [h, s, l]);
    }

    // Repeat lock: a thin solid ring close to the circle, in voice's color.
    if (v.repeatLocked) {
      ctx2d.strokeStyle = `hsla(${h}, ${s}%, ${l}%, 0.55)`;
      ctx2d.lineWidth = 1.5;
      drawCircleStroke(p.x, p.y, r + 5);
    }

    // Hover ring
    if (hovered && hovered.kind === 'voice' && hovered.idx === i) {
      ctx2d.strokeStyle = '#bbb';
      ctx2d.lineWidth = 2;
      drawCircleStroke(p.x, p.y, r + 8);
    }

    // The circle itself
    if (v.muted) {
      ctx2d.strokeStyle = voiceColor(v);
      ctx2d.lineWidth = 2;
      drawCircleStroke(p.x, p.y, r + flash);
    } else {
      ctx2d.fillStyle = voiceColor(v);
      drawCircle(p.x, p.y, r + flash);
    }

    // Pattern number
    ctx2d.fillStyle = v.muted ? voiceColor(v) : '#fff';
    ctx2d.font = 'bold 12px system-ui, sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.textBaseline = 'middle';
    ctx2d.fillText(String(v.patternIdx + 1), p.x, p.y);
  }

  // ---- Polyrhythmic sparkles -------------------------------------------
  for (let i = sparkles.length - 1; i >= 0; i--) {
    const s = sparkles[i];
    const dt = now - s.birth;
    if (dt < 0) continue; // not visible yet
    if (dt > SPARKLE_LIFE) {
      sparkles.splice(i, 1);
      continue;
    }
    const t = 1 - dt / SPARKLE_LIFE;
    const radius = 1 + t * 2.5;
    const alpha = t;
    const hue = s.hue ?? 250;
    // light halo
    ctx2d.fillStyle = `hsla(${hue}, 70%, 78%, ${alpha * 0.30})`;
    ctx2d.beginPath();
    ctx2d.arc(s.x, s.y, radius * 2.6, 0, Math.PI * 2);
    ctx2d.fill();
    // mid aura
    ctx2d.fillStyle = `hsla(${hue}, 80%, 52%, ${alpha * 0.55})`;
    ctx2d.beginPath();
    ctx2d.arc(s.x, s.y, radius * 1.5, 0, Math.PI * 2);
    ctx2d.fill();
    // saturated dark core
    ctx2d.fillStyle = `hsla(${hue}, 85%, 32%, ${alpha})`;
    ctx2d.beginPath();
    ctx2d.arc(s.x, s.y, radius, 0, Math.PI * 2);
    ctx2d.fill();
  }

  if (hovered && hovered.kind === 'voice') drawVoicePanel(voices[hovered.idx], hovered.idx);
  else if (hovered && hovered.kind === 'ostinato') drawOstinatoPanel();

  // ---- Contextual onboarding hint / transient message -------------------
  if (!started) {
    ctx2d.fillStyle = '#aaa';
    ctx2d.font = '14px system-ui, sans-serif';
    ctx2d.textAlign = 'center';
    ctx2d.fillText(patterns ? 'click anywhere to begin' : 'loading…', cx, cy + 80);
  } else {
    let hintText = null;
    let hintAlpha = 0.85;
    if (transientMessage) {
      const dt = now - transientMessage.birth;
      if (dt > transientMessage.life) {
        transientMessage = null;
      } else {
        hintText = transientMessage.text;
        const t = dt / transientMessage.life;
        hintAlpha = t < 0.5 ? 1.0 : Math.max(0, 1 - (t - 0.5) * 2);
      }
    }
    if (!hintText) hintText = currentHint();
    if (hintText) {
      const hintCol = bgValue > 160
        ? `rgba(120, 120, 120, ${hintAlpha})`
        : `rgba(220, 220, 220, ${hintAlpha})`;
      ctx2d.fillStyle = hintCol;
      drawWrappedText(hintText, cx, h - 26, w - 32);
    }
  }

  // Ending hints: instructional text or final thank-you.
  if (started && endingMode && voices.length > 0) {
    const allDismantled = ostinato.dismissed && voices.every(v => v.dismissed);
    if (allDismantled) {
      if (dismantleCompleteTime < 0) dismantleCompleteTime = now;
      const FADE_DELAY = 2.0;
      const FADE_DURATION = 2.5;
      const elapsed = now - dismantleCompleteTime;
      const fade = Math.max(0, Math.min(1, (elapsed - FADE_DELAY) / FADE_DURATION));
      if (fade > 0) {
        // Curtain is showing — hide the rest of the UI; show endgame buttons.
        if (!topbar.hidden) topbar.hidden = true;
        if (!touchPanel.hidden) touchPanel.hidden = true;
        if (endgameActions.hidden && fade > 0.4) endgameActions.hidden = false;

        // Curtain is intentionally minimal — just title + subtitle. The
        // mandala lives only in the downloadable PNG (rendered offscreen).
        ctx2d.textAlign = 'center';
        const titleRGB = bgValue > 160 ? '68, 68, 68' : '221, 221, 221';
        const subRGB   = bgValue > 160 ? '136, 136, 136' : '187, 187, 187';
        const titleSize = w < 480 ? 44 : 64;
        const subSize   = w < 480 ? 16 : 20;
        const gap       = w < 480 ? 60 : 80;
        ctx2d.fillStyle = `rgba(${titleRGB}, ${fade})`;
        ctx2d.font = `600 ${titleSize}px system-ui, sans-serif`;
        ctx2d.fillText('In C.', cx, cy - gap / 2);
        ctx2d.fillStyle = `rgba(${subRGB}, ${fade})`;
        ctx2d.font = `${subSize}px system-ui, sans-serif`;
        ctx2d.fillText('thank you for playing', cx, cy + gap / 2);
      }
    } else if (voices.every(v => v.dismissed || v.atEnd)) {
      const hintCol = bgValue > 160 ? '#888' : '#ccc';
      ctx2d.fillStyle = hintCol;
      drawWrappedText('click each voice and the ostinato to dismantle the piece', cx, h - 70, w - 32);
    }
  }

  // ---- Touch panel sync -------------------------------------------------
  // Throttled DOM refresh (4 Hz) so figure numbers / mute / lock states stay
  // current as voices auto-advance, but we don't burn 60 fps of DOM mutations
  // (which can starve the audio scheduler on iOS during rapid-tap sequences).
  if (panelSelected && (now - lastPanelRefreshT) > 0.25) {
    refreshTouchPanel();
    lastPanelRefreshT = now;
  }

  // ---- Topbar button visibility ------------------------------------------
  // Random: show once the full roster is in. Conclude: show once everyone
  // has reached the final figure (or once we've already entered ending mode).
  const fullRoster = voices.length >= ROSTER.length;
  const allAtEnd = fullRoster && voices.every(v => v.atEnd);
  if (randomBtn.hidden === fullRoster) randomBtn.hidden = !fullRoster;
  const concludeShown = allAtEnd || endingMode;
  if (concludeBtn.hidden === concludeShown) concludeBtn.hidden = !concludeShown;

  requestAnimationFrame(render);
}

// Draws hint text centered at (anchorX, baselineY), responsive: shrinks the
// font for narrow canvases and wraps onto multiple lines when needed. Lines
// stack upward so the bottom line sits at baselineY.
function drawWrappedText(text, anchorX, baselineY, maxWidth) {
  const w = canvas.width;
  const fontSize = w < 480 ? 14 : (w < 720 ? 18 : 24);
  ctx2d.font = `${fontSize}px system-ui, sans-serif`;
  ctx2d.textAlign = 'center';
  // Wrap by greedy word fit
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? line + ' ' + word : word;
    if (ctx2d.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  const lineHeight = fontSize * 1.3;
  const topY = baselineY - (lines.length - 1) * lineHeight;
  for (let i = 0; i < lines.length; i++) {
    ctx2d.fillText(lines[i], anchorX, topY + i * lineHeight);
  }
}

// Generative print of the just-finished performance. Each voice that spawned
// becomes a radial petal around a central dot — inner radius = spawn time,
// outer = end of performance. Petals are arc-segmented and color-shifted by
// the figure each voice was on at that point, so the petal traces the
// voice's journey through the score.
//
// Drawn into a passed context so we can render to an offscreen canvas for
// the PNG download (the on-screen curtain stays clean).
function drawMandala(ctx, cx, cy, radius, isLightBg) {
  const totalDuration = audio.currentTime - performanceStartTime;
  if (totalDuration <= 0.5) return;
  const N = ROSTER.length;
  const slotSpan = (Math.PI * 2) / N;
  const wedgeWidth = slotSpan * 0.55;

  const tickInterval = 30;
  const ringAlpha = isLightBg ? 0.06 : 0.12;
  ctx.strokeStyle = isLightBg ? `rgba(0,0,0,${ringAlpha})` : `rgba(255,255,255,${ringAlpha})`;
  ctx.lineWidth = 1;
  for (let t = tickInterval; t < totalDuration; t += tickInterval) {
    const r = (t / totalDuration) * radius;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  const spawns = performanceLog.filter(e => e.type === 'spawn');
  for (const spawn of spawns) {
    const i = spawn.voiceIdx;
    const slotAngle = (i / N) * Math.PI * 2 - Math.PI / 2;
    const a1 = slotAngle - wedgeWidth / 2;
    const a2 = slotAngle + wedgeWidth / 2;

    const figures = performanceLog.filter(e => e.type === 'figure' && e.voiceIdx === i);
    const dismiss = performanceLog.find(e => e.type === 'dismiss' && e.kind === 'voice' && e.voiceIdx === i);
    const endTime = dismiss ? dismiss.t : audio.currentTime;
    const segments = [];
    if (figures.length === 0) {
      segments.push({ start: spawn.t, end: endTime, fig: 0 });
    } else {
      for (let j = 0; j < figures.length; j++) {
        const fStart = figures[j].t;
        const fEnd = (j + 1 < figures.length) ? figures[j + 1].t : endTime;
        segments.push({ start: fStart, end: fEnd, fig: figures[j].patternIdx });
      }
      if (figures[0].t > spawn.t) {
        segments.unshift({ start: spawn.t, end: figures[0].t, fig: 0 });
      }
    }

    for (const seg of segments) {
      const r1 = ((seg.start - performanceStartTime) / totalDuration) * radius;
      const r2 = ((seg.end - performanceStartTime) / totalDuration) * radius;
      if (r2 <= r1 + 0.5) continue;
      const figProg = seg.fig / 52;
      const sat = 55 + figProg * 35;
      const light = isLightBg ? (58 - figProg * 18) : (50 + figProg * 18);
      ctx.fillStyle = `hsl(${spawn.color}, ${sat}%, ${light}%)`;
      ctx.beginPath();
      ctx.arc(cx, cy, r2, a1, a2);
      ctx.arc(cx, cy, r1, a2, a1, true);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.fillStyle = isLightBg ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(cx, cy, 5, 0, Math.PI * 2);
  ctx.fill();
}

// Render the mandala into an offscreen square canvas with title + subtitle,
// for the PNG download. The on-screen curtain stays clean (just text).
function renderMandalaArtifact(size = 1080) {
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const oc = off.getContext('2d');
  oc.fillStyle = '#ffffff';
  oc.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.32;

  oc.textAlign = 'center';
  oc.fillStyle = '#444';
  oc.font = '600 56px system-ui, sans-serif';
  oc.fillText('In C.', cx, cy - radius - 28);

  drawMandala(oc, cx, cy, radius, true);

  oc.fillStyle = '#888';
  oc.font = '20px system-ui, sans-serif';
  oc.fillText('thank you for playing', cx, cy + radius + 44);

  return off;
}

// Walks the player through discovery one prompt at a time. Each hint is shown
// only while its condition is true; doing the action makes it false.
function currentHint() {
  if (voices.length < 2) return 'click empty space to add the next instrument · press ? for help';
  if (!everHovered) return 'hover any voice or the ostinato to see its controls · press ? for help';
  if (voices.length >= ROSTER.length) {
    const allAtEnd = voices.every(v => v.atEnd);
    if (!allAtEnd) return 'bring every voice to figure 53 — Conclude unlocks when they all arrive';
    if (allAtEnd && !endingMode) return 'all 11 on figure 53 — press Conclude to begin the ending';
  }
  return null;
}

requestAnimationFrame(render);
