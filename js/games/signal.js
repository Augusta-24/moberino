// ══════════════════════════════════════
//  SIGNAL DRIFT — music survival prototype
// ══════════════════════════════════════
(function() {
  'use strict';

  const COLOR = '#00e5ff';
  const BOARD_KEY = 'signal';
  const LOOP_STEPS = 24;
  const DEFAULT_BEAT_MS = 285;
  const MAX_ROCKS = 32;
  const MAX_SPARKS = 120;
  // Reserved band at the bottom of the canvas where the loop rows live —
  // gameplay (ship, lanes, pads, rocks) stays above it.
  const LOOP_PANEL_H = 76;
  const PAD_COLS = 6;
  const PAD_ROWS = [
    { piece: 'hat', label: 'HAT', color: '#eaffff', lane: 2 },
    { piece: 'tom', label: 'TOM', color: '#ff8a3d', lane: 1 },
    { piece: 'kick', label: 'KICK', color: '#00e5ff', lane: 0 },
  ];
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  // One pentatonic scale per run: any note against any other always sounds good.
  const MOOD_SEMIS = {
    minor: [0, 3, 5, 7, 10],
    major: [0, 2, 4, 7, 9],
  };
  const LANES = [
    { label: 'KICK', color: '#00e5ff' },
    { label: 'TOM', color: '#ff8a3d' },
    { label: 'HAT', color: '#eaffff' },
  ];
  const LAYERS = [
    { id: 'drums', name: 'DRUMS', inst: 'drums', mult: 1, options: [
      { label: 'KICK', piece: 'kick', color: '#00e5ff' },
      { label: 'TOM', piece: 'tom', color: '#ff8a3d' },
      { label: 'HAT', piece: 'hat', color: '#eaffff' },
    ] },
    { id: 'bass', name: 'BASS', inst: 'bass', mult: 1, options: [
      { label: 'LOW', degLo: 0, degHi: 2, color: '#ffe61a' },
      { label: 'MID', degLo: 3, degHi: 5, color: '#33ff66' },
      { label: 'HIGH', degLo: 6, degHi: 9, color: '#d7ff65' },
    ] },
    { id: 'keys', name: 'KEYS', inst: 'keys', mult: 2, options: [
      { label: 'LOW', degLo: 0, degHi: 2, color: '#00e5ff' },
      { label: 'MID', degLo: 3, degHi: 5, color: '#b66cff' },
      { label: 'HIGH', degLo: 6, degHi: 9, color: '#7bffea' },
    ] },
    { id: 'chimes', name: 'CHIMES', inst: 'chimes', mult: 4, options: [
      { label: 'LOW', degLo: 0, degHi: 2, color: '#ff2db8' },
      { label: 'MID', degLo: 3, degHi: 5, color: '#b66cff' },
      { label: 'HIGH', degLo: 6, degHi: 9, color: '#ff7bd5' },
    ] },
    { id: 'swell', name: 'SWELL', inst: 'swell', mult: 2, options: [
      { label: 'LOW', degLo: 0, degHi: 2, color: '#ffe61a' },
      { label: 'MID', degLo: 3, degHi: 5, color: '#ffd23d' },
      { label: 'HIGH', degLo: 6, degHi: 9, color: '#fff2a0' },
    ] },
  ];
  // Legacy v2 recipes only: old rock types stored per-role step masks.
  const WRITE_STEPS = {
    drum: [0, 4, 8, 12],
    bass: [0, 4, 8, 12],
    melody: [2, 6, 10, 14],
  };
  const LAYER_DENSITY_BANDS = {
    drums: [4, 10],
    bass: [3, 8],
    keys: [2, 6],
    chimes: [3, 8],
    swell: [2, 8],
  };
  const SIGNAL_PRESETS = {
    style: [
      { id: 'space-funk', label: 'SPACE FUNK' },
      { id: 'dream-synth', label: 'DREAM SYNTH' },
      { id: 'boss-rave', label: 'BOSS RAVE' },
      { id: 'chiptune', label: 'CHIPTUNE' },
      { id: 'dark-minor', label: 'DARK MINOR' },
    ],
    mood: [
      { id: 'minor', label: 'MINOR' },
      { id: 'major', label: 'MAJOR' },
    ],
    tempo: [
      { id: 'chill', label: 'CHILL', beatMs: 340 },
      { id: 'medium', label: 'MEDIUM', beatMs: 285 },
      { id: 'fast', label: 'FAST', beatMs: 235 },
    ],
  };
  // Palettes: key center + instrument character. Never breaks the pentatonic guarantee.
  const STYLE_DEFS = {
    'space-funk': { root: 110.00, rootSemi: 9, bassWave: 'triangle', keysWave: 'triangle', chimeWave: 'triangle', drumVol: 1, shimmer: 1 },
    'dream-synth': { root: 123.47, rootSemi: 11, bassWave: 'sine', keysWave: 'sine', chimeWave: 'triangle', drumVol: 0.8, shimmer: 1.5 },
    'boss-rave': { root: 116.54, rootSemi: 10, bassWave: 'sawtooth', keysWave: 'triangle', chimeWave: 'triangle', drumVol: 1.22, shimmer: 1.1 },
    'chiptune': { root: 146.83, rootSemi: 2, bassWave: 'square', keysWave: 'square', chimeWave: 'square', drumVol: 0.85, shimmer: 0.8 },
    'dark-minor': { root: 103.83, rootSemi: 8, bassWave: 'triangle', keysWave: 'triangle', chimeWave: 'triangle', drumVol: 1.05, shimmer: 0.7, forceMinor: true },
  };

  let canvas = null, ctx = null, overlay = null, loopButton = null, resetButton = null;
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, state = 'idle';
  let player, bullets, rocks, sparks, floatTexts, stars, boss;
  let score = 0, signal = 0, distortion = 0, health = 3, elapsed = 0;
  let combo = 0, bestCombo = 0, currentSoloLane = 1;
  let currentLayerIndex = 0, additionsThisLayer = 0, totalAdditions = 0;
  let recordedChoices = [], grooveByLayer = [], lastGrooveToast = null, replaying = false, replayUntil = 0;
  let jukeboxRows = [];
  let signalSettings = { style: 'space-funk', mood: 'minor', tempo: 'medium' };
  let beatMs = DEFAULT_BEAT_MS;
  let laneFlash = [0, 0, 0];
  let spawnAt = 0, manualFireAt = 0, beatAt = 0, stepIndex = 0, lastLoopStep = -1;
  let loopEndArmed = false;
  // 'countin': the player taps 4 beats to set their own tempo before the loop starts.
  let phase = 'countin', countTaps = [], countRings = [], countPadAt = 0;
  let pads = [], padSpawnAt = 0;
  let loop = [];
  let leftHeld = false, rightHeld = false, pointerActive = false, pointerX = 0, pointerY = 0;
  let thereminPulse = 0;
  let resizeHandler = null, keyDownHandler = null, keyUpHandler = null;
  let imagesReady = false, pilotImg = null;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function now() { return performance.now(); }
  function laneWidth() { return W / LANES.length; }
  function laneIndexForX(x) { return clamp(Math.floor(x / Math.max(1, laneWidth())), 0, LANES.length - 1); }
  function laneCenter(i) { return laneWidth() * (i + 0.5); }
  function styleDef() { return STYLE_DEFS[signalSettings.style] || STYLE_DEFS['space-funk']; }
  function moodSemis() {
    const id = styleDef().forceMinor ? 'minor' : (signalSettings.mood || 'minor');
    return MOOD_SEMIS[id] || MOOD_SEMIS.minor;
  }
  function degreeFreq(deg, mult) {
    const semis = moodSemis();
    const d = Math.max(0, Math.floor(deg || 0));
    const oct = Math.floor(d / semis.length);
    const st = semis[d % semis.length] + 12 * oct;
    return styleDef().root * (mult || 1) * Math.pow(2, st / 12);
  }
  function noteNameForDegree(deg) {
    const semis = moodSemis();
    const d = Math.max(0, Math.floor(deg || 0));
    const st = semis[d % semis.length];
    return NOTE_NAMES[(styleDef().rootSemi + st) % 12];
  }
  function activeLayer() { return LAYERS[clamp(currentLayerIndex, 0, LAYERS.length - 1)] || LAYERS[0]; }
  function activeLayerLabel() { return `LAYER ${currentLayerIndex + 1}: ${activeLayer().name}`; }
  function fallbackStepsForType(type) {
    const steps = WRITE_STEPS[type] || [0];
    return steps.slice();
  }
  function stepsForChoice(choice) {
    if (choice && Array.isArray(choice.steps) && choice.steps.length) {
      return choice.steps.map(s => clamp(Math.floor(s), 0, LOOP_STEPS - 1));
    }
    return fallbackStepsForType(choice && choice.type);
  }
  function choiceLayerIndex(choice) {
    return clamp(choice && Number.isFinite(choice.layerIndex) ? choice.layerIndex : ((choice && choice.loop ? choice.loop : 1) - 1), 0, LAYERS.length - 1);
  }
  function layerSlotAt(step, layerIndex) {
    const layer = LAYERS[layerIndex];
    return (loop[step] || []).filter(v => (v.layerId || '') === layer.id);
  }
  function layerFilledSteps(layerIndex) {
    const filled = [];
    for (let i = 0; i < LOOP_STEPS; i++) {
      if (layerSlotAt(i, layerIndex).length) filled.push(i);
    }
    return filled;
  }
  function scoreLayerGrid(layerIndex) {
    const layer = LAYERS[layerIndex] || LAYERS[0];
    const filled = layerFilledSteps(layerIndex);
    const filledSet = new Set(filled);
    const layerChoices = recordedChoices.filter(c => choiceLayerIndex(c) === layerIndex);
    if (!layerChoices.length) {
      return { total: 0, density: 0, breath: 0, clean: 0, interlock: 0, filled: 0, cleanCount: 0, captures: 0, rest: true };
    }
    const bandScale = LOOP_STEPS / 16;
    const densityBand = (LAYER_DENSITY_BANDS[layer.id] || [3, 8]).map(v => Math.round(v * bandScale));
    const count = filled.length;
    let density = 80;
    if (count < densityBand[0]) density = Math.round(80 * (count / Math.max(1, densityBand[0])));
    else if (count > densityBand[1]) density = Math.max(0, Math.round(80 * (1 - (count - densityBand[1]) / Math.max(1, LOOP_STEPS - densityBand[1]))));
    let breath = 0;
    for (let start = 0; start < LOOP_STEPS; start += 4) {
      let emptyQuarter = true;
      for (let i = start; i < start + 4; i++) {
        if (filledSet.has(i)) emptyQuarter = false;
      }
      if (emptyQuarter) { breath += 25; break; }
    }
    const quarters = [];
    for (let s = 0; s < LOOP_STEPS; s += 4) quarters.push(s);
    if (layer.id === 'drums' || !quarters.every(s => filledSet.has(s))) breath += 25;
    const cleanCount = layerChoices.filter(c => c.tight).length;
    const clean = layerChoices.length ? Math.round(70 * (cleanCount / layerChoices.length)) : 35;
    let interlock = 0;
    if (layerIndex > 0) {
      filled.forEach(step => {
        if (!layerSlotAt(step, layerIndex - 1).length) interlock += 10;
      });
    } else {
      interlock = Math.min(50, count * 5);
    }
    interlock = Math.min(50, interlock);
    const total = density + Math.min(50, breath) + clean + interlock;
    return { total, density, breath: Math.min(50, breath), clean, interlock, filled: count, cleanCount, captures: layerChoices.length };
  }
  function applyLayerOptions() {
    const layer = activeLayer();
    for (let i = 0; i < LANES.length; i++) LANES[i] = { ...layer.options[i], inst: layer.inst, mult: layer.mult };
  }
  function updateLoopButton() {
    if (!loopButton) return;
    const show = state === 'playing';
    const wasHidden = loopButton.classList.contains('hidden');
    loopButton.classList.toggle('hidden', !show);
    // Button sits in flow above the canvas, so visibility changes the space left for it.
    if (wasHidden === show) fitCanvas();
    if (!show) return;
    if (phase === 'countin') loopButton.textContent = 'SKIP COUNT-IN';
    else if (loopEndArmed) loopButton.textContent = currentLayerIndex >= LAYERS.length - 1 ? 'FINISHING...' : 'LOCKING...';
    else loopButton.textContent = currentLayerIndex >= LAYERS.length - 1 ? 'FINISH TRACK' : 'END LOOP';
    // Reset (↻) only while actively building a layer — not during count-in.
    if (resetButton) resetButton.classList.toggle('hidden', !(show && phase === 'build'));
  }
  function presetLabel(group, id) {
    const item = (SIGNAL_PRESETS[group] || []).find(p => p.id === id);
    return item ? item.label : String(id || '').toUpperCase();
  }
  function recipeStyleLabel() {
    return `${presetLabel('style', signalSettings.style)} · ${presetLabel('mood', signalSettings.mood)}`;
  }
  function applySettings() {
    const tempo = SIGNAL_PRESETS.tempo.find(t => t.id === signalSettings.tempo) || SIGNAL_PRESETS.tempo[1];
    beatMs = tempo.beatMs || DEFAULT_BEAT_MS;
  }
  function withTimeout(promise, ms) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
    ]);
  }
  function audioCtx() {
    if (typeof getAudioCtx === 'function') return getAudioCtx();
    return null;
  }

  function tone(freq, type, delay, dur, vol, endFreq) {
    const c = audioCtx();
    if (!c) return;
    const t0 = c.currentTime + Math.max(0.006, delay || 0);
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
    g.gain.setValueAtTime(Math.max(0.0001, vol), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(c.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.03);
  }

  function synth(freq, type, delay, dur, vol, options) {
    const c = audioCtx();
    if (!c) return;
    const opts = options || {};
    const t0 = c.currentTime + Math.max(0.006, delay || 0);
    const o = c.createOscillator();
    const filter = c.createBiquadFilter();
    const g = c.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(Math.max(20, freq), t0);
    if (opts.endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.endFreq), t0 + dur);
    filter.type = opts.filter || 'lowpass';
    filter.frequency.setValueAtTime(opts.cutoff || 1800, t0);
    if (opts.endCutoff) filter.frequency.exponentialRampToValueAtTime(Math.max(60, opts.endCutoff), t0 + dur);
    filter.Q.setValueAtTime(opts.q || 0.8, t0);
    g.gain.setValueAtTime(Math.max(0.0001, vol), t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    if (opts.echo) {
      const d = c.createDelay();
      const fb = c.createGain();
      const eg = c.createGain();
      d.delayTime.setValueAtTime(opts.echoTime || 0.16, t0);
      fb.gain.setValueAtTime(opts.echoFeedback || 0.18, t0);
      eg.gain.setValueAtTime(opts.echoGain || 0.22, t0);
      g.connect(d);
      d.connect(fb);
      fb.connect(d);
      d.connect(eg);
      eg.connect(c.destination);
    }
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }

  function noise(delay, dur, vol, highpass) {
    const c = audioCtx();
    if (!c) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const g = c.createGain();
    const t0 = c.currentTime + Math.max(0.006, delay || 0);
    src.buffer = buffer;
    filter.type = highpass ? 'highpass' : 'lowpass';
    filter.frequency.setValueAtTime(highpass ? 4200 : 900, t0);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(c.destination);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ── Instrument recipes ported from space.js: little acoustic caricatures
  //    built from 2-3 stacked tones with slight detune drift.
  function playDrumPiece(piece, vel, delay, tune) {
    const v = (vel == null ? 1 : vel) * styleDef().drumVol;
    const dl = delay || 0;
    // tune 0..1 maps across the pad row: left = lower/tighter, right = higher/opener.
    const tn = tune == null ? 0.5 : clamp(tune, 0, 1);
    if (piece === 'hat') {
      noise(dl, 0.025 + tn * 0.045, 0.021 * v, true);
      synth(4600 + tn * 1400, 'square', dl, 0.020 + tn * 0.030, 0.007 * v, { filter: 'highpass', cutoff: 3200 });
    } else if (piece === 'tom') {
      const f = 112 + tn * 96;
      tone(f, 'sine', dl, 0.085, 0.062 * v, f * 0.72);
      tone(f * 1.5, 'triangle', dl + 0.004, 0.060, 0.022 * v, f * 1.12);
      noise(dl, 0.030, 0.012 * v, false);
    } else {
      const f = 112 + tn * 26;
      tone(f, 'sine', dl, 0.115, 0.115 * v, 40 + tn * 10);
      tone(f * 0.6, 'sine', dl + 0.005, 0.14, 0.055 * v, 32);
      noise(dl + 0.002, 0.050, 0.022 * v, false);
    }
  }

  // Slow-attack pad chord for the SWELL layer: root + fifth + octave breathing in.
  function playSwellChord(note, vel, delay) {
    const c = audioCtx();
    if (!c) return;
    const v = vel == null ? 1 : vel;
    const f = Math.max(30, note || styleDef().root * 2);
    [[1, 0.034], [1.5, 0.020], [2, 0.013]].forEach(([m, vol], i) => {
      const t0 = c.currentTime + (delay || 0) + 0.01 + i * 0.035;
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f * m, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol * v, t0 + 0.32);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + 1.7);
      o.connect(g);
      g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + 1.8);
    });
  }

  function playPitched(inst, note, vel, delay) {
    const d = styleDef();
    const v = vel == null ? 1 : vel;
    const dl = delay || 0;
    const f = Math.max(30, note || d.root);
    if (inst === 'bass') {
      const wave = d.bassWave || 'triangle';
      if (wave === 'sawtooth' || wave === 'square') {
        synth(f, wave, dl, 0.26, 0.085 * v, { cutoff: 900, endCutoff: 260, q: 1.4, endFreq: f * 0.988 });
      } else {
        tone(f, wave, dl, 0.26, 0.085 * v, f * 0.988);
      }
      tone(f * 2.01, 'sine', dl + 0.004, 0.11, 0.020 * v, f * 1.98);
    } else if (inst === 'keys') {
      // The space.js piano: triangle + sine an octave up, both drifting slightly flat.
      tone(f, d.keysWave || 'triangle', dl, 0.150, 0.070 * v, f * 0.992);
      tone(f * 2.01, 'sine', dl + 0.003, 0.065, 0.021 * v, f * 1.99);
    } else {
      // Handpan / music box: soft metallic tap with an overtone stack.
      const sh = d.shimmer || 1;
      tone(f, d.chimeWave || 'triangle', dl, 0.160, 0.048 * v, f * 1.004);
      tone(f * 2.01, 'sine', dl + 0.002, 0.090, 0.015 * v * sh, f * 2.02);
      tone(f * 3.02, 'sine', dl + 0.014, 0.055, 0.008 * v * sh, f * 3.03);
    }
  }

  function playInstrument(inst, opts) {
    const o = opts || {};
    if (inst === 'drums') {
      (o.pieces || [o.piece || 'kick']).forEach((p, i) => playDrumPiece(p, o.vel, (o.delay || 0) + i * 0.004, o.tunes ? o.tunes[i] : o.tune));
      return;
    }
    if (inst === 'swell') {
      playSwellChord(o.note, o.vel, o.delay);
      return;
    }
    playPitched(inst, o.note, o.vel, o.delay);
  }

  function playStamp(slot) {
    if (!slot || !slot.inst) return;
    const vel = (slot.vel || 1) * 0.8;
    if (slot.inst === 'drums') playInstrument('drums', { pieces: slot.pieces, tunes: slot.tunes, vel });
    else playInstrument(slot.inst, { note: slot.note, vel });
  }

  function playPulseBed() {
    // The session band behind the player: a quiet backing groove in their key
    // and tempo. Offbeat hat breaths + a root pluck at the top of each loop.
    const root = styleDef().root;
    if (stepIndex % 4 === 2) noise(0.004, 0.024, 0.007, true);
    if (stepIndex === 0) {
      noise(0.004, 0.020, 0.010, true);
      tone(root * 0.5, 'sine', 0, 0.55, 0.013);
      tone(root * 0.75, 'sine', 0.02, 0.45, 0.007);
      playPitched('bass', degreeFreq(0, 1), 0.22, 0.01);
    }
    if (stepIndex === LOOP_STEPS / 2) playPitched('bass', degreeFreq(3, 1), 0.16, 0.01);
  }

  function playBossMotif() {
    [4, 2, 5, 1].forEach((deg, i) => playPitched('chimes', degreeFreq(deg, 4), 0.7, i * 0.08));
  }

  function fitCanvas() {
    if (!canvas) return;
    const header = document.querySelector('#pg-signal .cats-header');
    const top = header ? header.offsetHeight : 56;
    const btnSpace = loopButton && !loopButton.classList.contains('hidden') ? loopButton.offsetHeight + 12 : 0;
    const availW = window.innerWidth || document.documentElement.clientWidth || 360;
    const availH = (window.innerHeight || document.documentElement.clientHeight || 640) - top - btnSpace;
    const ratio = 9 / 16;
    let cssH = Math.max(320, availH);
    let cssW = cssH * ratio;
    if (cssW > availW) {
      cssW = availW;
      cssH = cssW / ratio;
    }
    cssW = Math.floor(cssW);
    cssH = Math.floor(cssH);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = cssW;
    H = cssH;
    if (player) {
      player.x = clamp(player.x, 22, W - 22);
      player.y = H - LOOP_PANEL_H - 28;
    }
  }

  function initStars() {
    stars = Array.from({ length: 54 }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      r: rand(0.7, 1.8),
      vy: rand(8, 28),
      a: rand(0.22, 0.9),
    }));
  }

  function resetRun() {
    player = { x: W * 0.5, y: H - LOOP_PANEL_H - 28, r: 17, cooldown: 0 };
    bullets = [];
    rocks = [];
    sparks = [];
    floatTexts = [];
    boss = null;
    score = 0;
    signal = 28;
    distortion = 0;
    health = 3;
    combo = 0;
    bestCombo = 0;
    currentSoloLane = 1;
    applySettings();
    currentLayerIndex = 0;
    additionsThisLayer = 0;
    totalAdditions = 0;
    recordedChoices = [];
    grooveByLayer = Array.from({ length: LAYERS.length }, () => null);
    lastGrooveToast = null;
    replaying = false;
    replayUntil = 0;
    applyLayerOptions();
    laneFlash = [0, 0, 0];
    elapsed = 0;
    spawnAt = 0;
    manualFireAt = 0;
    beatAt = 0;
    stepIndex = 0;
    lastLoopStep = -1;
    loopEndArmed = false;
    phase = 'countin';
    countTaps = [];
    countRings = [];
    countPadAt = 0;
    padSpawnAt = 0;
    initPads();
    loop = Array.from({ length: LOOP_STEPS }, () => []);
    initStars();
  }

  function initPads() {
    pads = [];
    PAD_ROWS.forEach((rowDef, row) => {
      for (let col = 0; col < PAD_COLS; col++) {
        pads.push({ row, col, piece: rowDef.piece, label: rowDef.label, color: rowDef.color, lane: rowDef.lane, lit: 0, flash: 0 });
      }
    });
  }

  function drumsActive() {
    return state === 'playing' && phase === 'build' && activeLayer().inst === 'drums';
  }

  // Which orb-driven layer is live: 'chimes' (theremin taps), 'swell' (slow pads), or null.
  function orbLayerInst() {
    if (state !== 'playing' || phase !== 'build') return null;
    const inst = activeLayer().inst;
    return inst === 'chimes' || inst === 'swell' ? inst : null;
  }

  function chimesActive() {
    return !!orbLayerInst();
  }

  function thereminCenter() {
    return { x: W / 2, y: (H - LOOP_PANEL_H) * 0.52, maxR: Math.min(W, H - LOOP_PANEL_H) * 0.44 };
  }

  function padRect(row, col) {
    const left = 46, right = 12, top = 122;
    const bottom = H - LOOP_PANEL_H - 16;
    const gw = (W - left - right - (PAD_COLS - 1) * 8) / PAD_COLS;
    const gh = (bottom - top - 2 * 10) / 3;
    return { x: left + col * (gw + 8), y: top + row * (gh + 10), w: gw, h: gh };
  }

  function padAt(x, y) {
    for (const pad of pads) {
      const r = padRect(pad.row, pad.col);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return pad;
    }
    return null;
  }

  function loadPilot() {
    try {
      const idx = typeof getGlobalChar === 'function' ? getGlobalChar() : 0;
      const ch = typeof GAME_CHARS !== 'undefined' && GAME_CHARS[idx];
      const src = ch && (ch.imgHappy || ch.img);
      if (!src) return;
      pilotImg = new Image();
      pilotImg.onload = () => { imagesReady = true; };
      pilotImg.src = src;
    } catch(e) {}
  }

  function spawnRock(forceLane) {
    if (rocks.length >= MAX_ROCKS) rocks.splice(0, rocks.length - MAX_ROCKS + 1);
    const lane = Number.isFinite(forceLane) ? clamp(Math.floor(forceLane), 0, LANES.length - 1) : Math.floor(Math.random() * LANES.length);
    const option = LANES[lane];
    const layer = activeLayer();
    const lw = laneWidth();
    const rock = {
      inst: layer.inst,
      label: option.label,
      color: option.color,
      lane,
      runStep: 0,
      hp: 1,
      maxHp: 1,
      x: clamp(laneCenter(lane) + rand(-lw * 0.24, lw * 0.24), 26, W - 26),
      vx: rand(-10, 10),
      vy: rand(48, 76) + elapsed * 0.0025,
      spin: rand(-2, 2),
      rot: rand(0, Math.PI * 2),
    };
    if (layer.inst === 'drums') {
      rock.piece = option.piece;
      rock.r = 18 + rand(-3, 4);
    } else {
      const degLo = option.degLo || 0;
      const degHi = option.degHi == null ? degLo : option.degHi;
      rock.deg = degLo + Math.floor(Math.random() * (degHi - degLo + 1));
      rock.label = noteNameForDegree(rock.deg);
      // Multi-hit rocks: 'up' walks the scale, 'same' repeats its note —
      // drum a rhythm on one pitch.
      const roll = Math.random();
      if (roll < 0.2) { rock.hp = 3; rock.maxHp = 3; rock.runMode = 'up'; }
      else if (roll < 0.42) { rock.hp = Math.random() < 0.5 ? 2 : 3; rock.maxHp = rock.hp; rock.runMode = 'same'; }
      rock.r = 22 - rock.deg * 0.9 + rand(-2, 3) + (rock.maxHp > 1 ? 4 : 0);
    }
    rock.y = -rock.r - rand(0, 60);
    rocks.push(rock);
  }

  function ensureBoss() {
    return;
  }

  function hitBoss() {
    return;
  }

  function shoot() {
    if (!bullets) return;
    if (bullets.length > 18) bullets.splice(0, bullets.length - 18);
    bullets.push({ x: player.x, y: player.y - 18, vy: -420, r: 4 });
    noise(0, 0.025, 0.013, true);
  }

  // Shared by every capture mechanic: where does an action landing NOW sit on
  // the loop grid, and was it in the pocket?
  function captureTiming(t) {
    const toNext = Math.max(0, beatAt - t);
    const sincePrev = Math.max(0, beatMs - toNext);
    const isNextStep = toNext < sincePrev;
    return {
      isNextStep,
      tight: Math.min(sincePrev, toNext) <= beatMs * 0.3,
      target: isNextStep ? (stepIndex + 1) % LOOP_STEPS : stepIndex,
    };
  }

  function tapShoot(pos) {
    const t = performance.now();
    if (t < manualFireAt) return;
    if (phase === 'countin' && state === 'playing') {
      countInTap(t);
      manualFireAt = t + 90;
      return;
    }
    if (drumsActive()) {
      if (pos) whackPad(pos, t);
      manualFireAt = t + 90;
      return;
    }
    shoot();
    manualFireAt = t + 125;
  }

  function whackPad(pos, t) {
    const pad = padAt(pos.x, pos.y);
    if (!pad) return;
    const wasLit = pad.lit > t;
    pad.lit = 0;
    pad.flash = 1;
    const tune = pad.col / Math.max(1, PAD_COLS - 1);
    playDrumPiece(pad.piece, 1, 0, tune);
    const timing = captureTiming(t);
    stampNote({ ...pad, tune }, timing.target, null, timing.tight, timing.isNextStep);
    const r = padRect(pad.row, pad.col);
    burst(r.x + r.w / 2, r.y + r.h / 2, pad.color, timing.tight ? 8 : 4);
    combo = timing.tight ? combo + 1 : 0;
    bestCombo = Math.max(bestCombo, combo);
    score += (timing.tight ? 4 + combo : 1) + (wasLit ? 6 : 0);
    signal = clamp(signal + (timing.tight ? 1.3 : 0.3) + (wasLit ? 0.6 : 0), 0, 100);
    distortion = clamp(distortion + (timing.tight ? -0.8 : 2.2), 0, 100);
    if (wasLit && timing.tight) addFloatText('POCKET', r.x + r.w / 2, r.y - 6, pad.color);
  }

  function countInTap(t) {
    countTaps.push(t);
    countRings.push({ x: W * 0.5, y: H * 0.42, t0: t });
    playDrumPiece('kick', 0.9, 0);
    addFloatText(String(countTaps.length), W * 0.5, H * 0.42, '#00e5ff');
    if (countTaps.length < 4) return;
    // The player's tap interval is one beat = 4 loop steps. Median of the
    // last 3 intervals, so one nervous tap doesn't skew the tempo.
    const iv = [];
    for (let i = 1; i < countTaps.length; i++) iv.push(countTaps[i] - countTaps[i - 1]);
    iv.sort((a, b) => a - b);
    const median = iv[Math.floor(iv.length / 2)];
    beatMs = clamp(Math.round(median / 4), 170, 420);
    // Their tapped pulse becomes the track's first drum hits: on the floor,
    // continued across the whole loop.
    for (let step = 0; step < LOOP_STEPS; step += 4) {
      loop[step].push({ layerId: 'drums', layerIndex: 0, inst: 'drums', pieces: ['kick'], tunes: [0.3], color: '#00e5ff', label: 'KICK', tight: true, vel: 0.85, skip: 0, foundation: true });
      recordedChoices.push({ step, layerIndex: 0, layerId: 'drums', layerName: 'DRUMS', inst: 'drums', note: null, piece: 'kick', lane: 0, label: 'KICK', color: '#00e5ff', tight: true, foundation: true });
      additionsThisLayer += 1;
      totalAdditions += 1;
    }
    startBuildPhase(t);
    addFloatText('PULSE SET', W * 0.5, H * 0.34, '#ffe61a');
  }

  function startBuildPhase(t) {
    phase = 'build';
    stepIndex = 0;
    lastLoopStep = 0;
    beatAt = t + beatMs;
    spawnAt = t + 600;
    countRings = [];
    updateLoopButton();
  }

  function skipCountIn() {
    if (phase !== 'countin' || state !== 'playing') return;
    applySettings();
    startBuildPhase(performance.now());
  }

  // Live capture: stamp the note the player just played into the loop grid.
  function stampNote(rock, target, note, tight, isNextStep) {
    const layer = activeLayer();
    const vel = tight ? 1 : 0.62;
    const bucket = loop[target];
    let slot = bucket.find(v => v.layerId === layer.id);
    if (layer.inst === 'drums') {
      const tune = rock.tune == null ? 0.5 : rock.tune;
      if (slot) {
        const idx = slot.pieces.indexOf(rock.piece);
        if (idx < 0) {
          slot.pieces.push(rock.piece);
          (slot.tunes = slot.tunes || slot.pieces.map(() => 0.5))[slot.pieces.length - 1] = tune;
        } else if (slot.tunes) {
          slot.tunes[idx] = tune;
        }
        slot.tight = slot.tight && tight;
        slot.vel = Math.max(slot.vel, vel);
        slot.skip = isNextStep ? 1 : 0;
      } else {
        slot = { layerId: layer.id, layerIndex: currentLayerIndex, inst: 'drums', pieces: [rock.piece], tunes: [tune], color: rock.color, label: rock.label, tight, vel, skip: isNextStep ? 1 : 0 };
        bucket.push(slot);
      }
    } else {
      const stamp = { layerId: layer.id, layerIndex: currentLayerIndex, inst: layer.inst, note, color: rock.color, label: rock.label, tight, vel, skip: isNextStep ? 1 : 0 };
      if (slot) Object.assign(slot, stamp);
      else bucket.push(stamp);
    }
    while (bucket.length > 5) bucket.shift();
    additionsThisLayer += 1;
    totalAdditions += 1;
    recordedChoices.push({
      step: target,
      layerIndex: currentLayerIndex,
      layerId: layer.id,
      layerName: layer.name,
      inst: layer.inst,
      note: note || null,
      piece: rock.piece || null,
      lane: rock.lane,
      label: rock.label,
      color: rock.color,
      tight,
    });
    if (recordedChoices.length > 128) recordedChoices.shift();
    laneFlash[rock.lane] = Math.max(laneFlash[rock.lane], tight ? 1 : 0.6);
  }

  function restartLoopPlayback() {
    const t = performance.now();
    stepIndex = 0;
    lastLoopStep = -1;
    beatAt = t + beatMs;
    playPulseBed();
    const bucket = loop[stepIndex] || [];
    bucket.forEach(playStamp);
    lastLoopStep = stepIndex;
  }

  function endCurrentLoop(restartPlayback) {
    if (state !== 'playing') return;
    const committedLayerIndex = currentLayerIndex;
    const groove = scoreLayerGrid(committedLayerIndex);
    grooveByLayer[committedLayerIndex] = groove;
    score += groove.total;
    lastGrooveToast = { layerIndex: committedLayerIndex, groove };
    addFloatText(`${LAYERS[committedLayerIndex].name} +${groove.total}`, W * 0.5, 104, '#ffe61a');
    loopEndArmed = false;
    if (currentLayerIndex >= LAYERS.length - 1) {
      finishTrack();
      return;
    }
    currentLayerIndex += 1;
    additionsThisLayer = 0;
    rocks = [];
    bullets = [];
    applyLayerOptions();
    laneFlash = [1, 1, 1];
    if (restartPlayback !== false) restartLoopPlayback();
    updateLoopButton();
    [0, 2, 4].forEach((deg, i) => playPitched('keys', degreeFreq(deg, 2), 0.8, 0.05 + i * 0.09));
  }

  // Scrap the take: clear the layer you're building and re-record over the
  // groove. Earlier locked layers are untouched; on DRUMS the count-in kicks
  // (the tempo floor) survive so the loop never goes pulseless.
  function resetCurrentLoop() {
    if (state !== 'playing' || phase !== 'build') return;
    const li = currentLayerIndex;
    for (let s = 0; s < LOOP_STEPS; s++) {
      const bucket = loop[s];
      for (let i = bucket.length - 1; i >= 0; i--) {
        const v = bucket[i];
        if (v.layerIndex !== li) continue;
        if (v.foundation) {
          v.pieces = ['kick'];
          v.tunes = [0.3];
          v.vel = 0.85;
          v.tight = true;
          v.skip = 0;
        } else {
          bucket.splice(i, 1);
        }
      }
    }
    const before = recordedChoices.length;
    recordedChoices = recordedChoices.filter(ch => ch.layerIndex !== li || ch.foundation);
    totalAdditions = Math.max(0, totalAdditions - (before - recordedChoices.length));
    additionsThisLayer = recordedChoices.filter(ch => ch.layerIndex === li).length;
    grooveByLayer[li] = null;
    combo = 0;
    loopEndArmed = false;
    updateLoopButton();
    addFloatText('LAYER CLEARED', W * 0.5, H * 0.3, '#00e5ff');
    tone(520, 'sine', 0, 0.20, 0.05, 170);
    noise(0.02, 0.12, 0.02, true);
  }

  function requestLoopEnd() {
    if (state !== 'playing' || loopEndArmed) return;
    loopEndArmed = true;
    updateLoopButton();
    playPitched('keys', degreeFreq(2, 2), 0.6, 0);
    playPitched('keys', degreeFreq(4, 2), 0.5, 0.07);
  }

  function finishTrack() {
    if (state !== 'playing') return;
    if (!grooveByLayer[currentLayerIndex]) {
      const groove = scoreLayerGrid(currentLayerIndex);
      grooveByLayer[currentLayerIndex] = groove;
      score += groove.total;
      lastGrooveToast = { layerIndex: currentLayerIndex, groove };
    }
    state = 'built';
    loopEndArmed = false;
    updateLoopButton();
    cancelAnimationFrame(raf);
    signal = Math.max(signal, 82);
    score += Math.max(0, 220 - Math.floor(elapsed / 1000)) + bestCombo * 4;
    [0, 1, 2, 4, 5].forEach((deg, i) => playPitched('chimes', degreeFreq(deg, 4), 0.8, 0.05 + i * 0.07));
    showBuiltChoice();
  }

  function continueLooping() {
    if (state !== 'built' && state !== 'replay') return;
    loopEndArmed = false;
    phase = 'build';
    currentLayerIndex = Math.min(LAYERS.length - 1, currentLayerIndex + 1);
    additionsThisLayer = 0;
    rocks = [];
    replaying = false;
    applyLayerOptions();
    overlay.classList.add('hidden');
    state = 'playing';
    updateLoopButton();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function startReplay() {
    state = 'replay';
    phase = 'build';
    loopEndArmed = false;
    updateLoopButton();
    replaying = true;
    replayUntil = performance.now() + LOOP_STEPS * beatMs * 2;
    rocks = [];
    bullets = [];
    overlay.classList.add('hidden');
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function addFloatText(text, x, y, color) {
    if (!floatTexts) floatTexts = [];
    floatTexts.push({ text, x, y, color, age: 0, life: 850 });
    if (floatTexts.length > 12) floatTexts.shift();
  }

  function burst(x, y, color, n) {
    if (sparks.length > MAX_SPARKS) sparks.splice(0, sparks.length - MAX_SPARKS);
    for (let i = 0; i < n; i++) {
      sparks.push({
        x, y,
        vx: rand(-110, 110),
        vy: rand(-120, 80),
        life: rand(220, 480),
        age: 0,
        color,
        r: rand(1.5, 4),
      });
    }
  }

  function hitRock(rock) {
    const t = performance.now();
    // The note plays NOW; it lands on the loop at the nearest step —
    // the player's timing is the rhythm.
    const { target, tight, isNextStep } = captureTiming(t);
    const degStep = rock.runMode === 'up' ? rock.runStep : 0;
    const note = rock.inst === 'drums' ? null : degreeFreq(rock.deg + degStep, activeLayer().mult);
    if (rock.inst !== 'drums') rock.label = noteNameForDegree(rock.deg + degStep);
    playInstrument(rock.inst, { note, piece: rock.piece, vel: 1 });
    stampNote(rock, target, note, tight, isNextStep);
    rock.runStep += 1;
    rock.hp -= 1;
    burst(rock.x, rock.y, rock.color, tight ? 8 : 4);
    combo = tight ? combo + 1 : 0;
    bestCombo = Math.max(bestCombo, combo);
    score += tight ? 4 + combo : 1;
    signal = clamp(signal + (tight ? 1.3 : 0.3), 0, 100);
    distortion = clamp(distortion + (tight ? -0.8 : 2.2), 0, 100);

    if (rock.hp > 0) return false;

    if (rock.maxHp > 1) addFloatText('RUN!', rock.x, rock.y - rock.r - 8, rock.color);
    score += tight ? 24 : 8;
    burst(rock.x, rock.y, rock.color, 12);
    return true;
  }

  function playerDamage(amount) {
    combo = 0;
    distortion = clamp(distortion + 8, 0, 100);
    tone(90, 'sine', 0, 0.12, 0.05, 55);
    noise(0, 0.06, 0.028, false);
    burst(player.x, player.y, '#ff8a3d', 10);
    addFloatText('CLAM', player.x, player.y - 34, '#ff8a3d');
  }

  function tickBeat(t) {
    if (!beatAt) beatAt = t + beatMs;
    if (t < beatAt) return;
    const skipped = Math.floor((t - beatAt) / beatMs);
    beatAt += Math.min(skipped + 1, 4) * beatMs;
    if (t - beatAt > beatMs * 4) beatAt = t + beatMs;
    stepIndex = (stepIndex + 1) % LOOP_STEPS;
    playPulseBed();
    const bucket = loop[stepIndex];
    bucket.forEach(v => {
      if (v.skip > 0) { v.skip -= 1; return; }
      playStamp(v);
    });
    lastLoopStep = stepIndex;
    // Invite drum pads on the beat grid, not a wall-clock timer, so the
    // lighting reads as part of the groove instead of random flicker.
    if (drumsActive() && stepIndex % 4 === 2) {
      const litCount = pads.filter(p => p.lit > t).length;
      if (litCount < 3) {
        const nextIsDownbeat = ((stepIndex + 2) % 8) === 0;
        const roll = Math.random();
        const piece = nextIsDownbeat && roll < 0.5 ? 'kick' : roll < 0.55 ? 'hat' : roll < 0.8 ? 'tom' : 'kick';
        const rowPads = pads.filter(p => p.piece === piece && p.lit <= t);
        if (rowPads.length) {
          const pad = rowPads[Math.floor(Math.random() * rowPads.length)];
          pad.lit = beatAt + beatMs * 3;
        }
      }
    }
    // Orb drift (chimes theremin / swell pads): while the player holds and
    // pulls from the center, distance picks the scale degree and the density.
    const orbInst = pointerActive ? orbLayerInst() : null;
    if (orbInst) {
      const tc = thereminCenter();
      const dist = clamp(Math.hypot(pointerX - tc.x, pointerY - tc.y) / tc.maxR, 0, 1);
      if (dist > 0.12) {
        const deg = Math.round((dist - 0.12) / 0.88 * 9);
        const isSwell = orbInst === 'swell';
        const every = isSwell ? (dist > 0.7 ? 2 : 4) : (dist > 0.7 ? 1 : dist > 0.4 ? 2 : 4);
        if (stepIndex % every === 0) {
          const note = degreeFreq(deg, activeLayer().mult);
          if (isSwell) playSwellChord(note, 0.4 + dist * 0.6, 0);
          else playPitched('chimes', note, 0.55 + dist * 0.45, 0);
          // Only re-stamp when the note at this step actually changes,
          // so a held position doesn't flood the capture log.
          const existing = loop[stepIndex].find(v => v.layerId === activeLayer().id);
          if (!existing || existing.note !== note) {
            stampNote({ lane: 1, label: noteNameForDegree(deg), color: isSwell ? '#ffe61a' : '#ff2db8' }, stepIndex, note, true, false);
          }
          thereminPulse = 1;
        }
      }
    }
    if (loopEndArmed && stepIndex === 0) endCurrentLoop(false);
    distortion = clamp(distortion - 0.4, 0, 100);
    if (stepIndex % 8 === 0 && signal > 22) signal = clamp(signal - 0.12, 0, 100);
    if (boss && stepIndex % 8 === 0) playBossMotif();
    if (boss && stepIndex % 8 === 0) {
      currentSoloLane = (currentSoloLane + 1 + Math.floor(Math.random() * 2)) % LANES.length;
      laneFlash[currentSoloLane] = Math.max(laneFlash[currentSoloLane], 0.8);
    }
  }

  function update(dt, t) {
    elapsed += dt;
    if (phase === 'countin' && state === 'playing') {
      // Ambient key pad so the first tap never lands in dead air.
      if (t >= countPadAt) {
        const root = styleDef().root;
        tone(root, 'sine', 0, 1.4, 0.011);
        tone(root * 1.5, 'sine', 0.06, 1.2, 0.007);
        tone(root * 2, 'sine', 0.12, 1.0, 0.004);
        countPadAt = t + 2600;
      }
      for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 360);
      stars.forEach(s => {
        s.y += s.vy * dt / 1000;
        if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
      });
      countRings = countRings.filter(ring => t - ring.t0 < 900);
      if (floatTexts) {
        floatTexts.forEach(f => { f.age += dt; f.y -= 28 * dt / 1000; });
        floatTexts = floatTexts.filter(f => f.age < f.life);
      }
      return;
    }
    tickBeat(t);
    if (drumsActive()) {
      for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 360);
      pads.forEach(p => { p.flash = Math.max(0, p.flash - dt / 260); });
      stars.forEach(s => {
        s.y += s.vy * dt / 1000;
        if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
      });
      sparks.forEach(p => {
        p.age += dt;
        p.x += p.vx * dt / 1000;
        p.y += p.vy * dt / 1000;
        p.vy += 80 * dt / 1000;
      });
      sparks = sparks.filter(p => p.age < p.life).slice(-MAX_SPARKS);
      if (floatTexts) {
        floatTexts.forEach(f => { f.age += dt; f.y -= 28 * dt / 1000; });
        floatTexts = floatTexts.filter(f => f.age < f.life);
      }
      return;
    }
    if (chimesActive()) {
      for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 360);
      thereminPulse = Math.max(0, thereminPulse - dt / 320);
      stars.forEach(s => {
        s.y += s.vy * dt / 1000;
        if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
      });
      sparks.forEach(p => {
        p.age += dt;
        p.x += p.vx * dt / 1000;
        p.y += p.vy * dt / 1000;
        p.vy += 80 * dt / 1000;
      });
      sparks = sparks.filter(p => p.age < p.life).slice(-MAX_SPARKS);
      if (floatTexts) {
        floatTexts.forEach(f => { f.age += dt; f.y -= 28 * dt / 1000; });
        floatTexts = floatTexts.filter(f => f.age < f.life);
      }
      return;
    }
    if (state === 'replay') {
      for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 420);
      stars.forEach(s => {
        s.y += s.vy * dt / 1000;
        if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
      });
      if (t >= replayUntil) showBuiltChoice();
      return;
    }
    ensureBoss();
    for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 360);

    const move = (leftHeld ? -1 : 0) + (rightHeld ? 1 : 0);
    if (pointerActive) player.x += (pointerX - player.x) * Math.min(1, dt / 100);
    else player.x += move * 260 * dt / 1000;
    player.x = clamp(player.x, 24, W - 24);

    if (t >= spawnAt) {
      spawnRock();
      const cadence = clamp(820 - elapsed * 0.004, 420, 820);
      spawnAt = t + cadence;
    }

    if (boss) {
      boss.phase += dt / 1000;
      boss.x = W * 0.5 + Math.sin(boss.phase * 1.3) * W * 0.22;
      if (t >= boss.nextSpawn) {
        spawnRock(currentSoloLane);
        rocks[rocks.length - 1].x = clamp(laneCenter(currentSoloLane) + rand(-laneWidth() * 0.2, laneWidth() * 0.2), 28, W - 28);
        rocks[rocks.length - 1].vy += 24;
        boss.nextSpawn = t + 1150;
      }
    }

    stars.forEach(s => {
      s.y += s.vy * dt / 1000;
      if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
    });

    bullets.forEach(b => { b.y += b.vy * dt / 1000; });
    bullets = bullets.filter(b => b.y > -20);

    if (boss) {
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        const dx = boss.x - b.x, dy = boss.y - b.y;
        if (dx * dx + dy * dy <= (boss.r + b.r) * (boss.r + b.r)) {
          bullets.splice(j, 1);
          hitBoss();
        }
      }
    }

    rocks.forEach(r => {
      r.x += r.vx * dt / 1000;
      r.y += r.vy * dt / 1000;
      r.rot += r.spin * dt / 1000;
      if (r.x < r.r || r.x > W - r.r) r.vx *= -1;
    });

    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i];
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        const dx = r.x - b.x, dy = r.y - b.y;
        if (dx * dx + dy * dy <= (r.r + b.r) * (r.r + b.r)) {
          bullets.splice(j, 1);
          if (hitRock(r)) rocks.splice(i, 1);
          break;
        }
      }
    }

    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i];
      const dx = r.x - player.x, dy = r.y - player.y;
      if (dx * dx + dy * dy <= (r.r + player.r) * (r.r + player.r)) {
        rocks.splice(i, 1);
        playerDamage(1);
      } else if (r.y - r.r > H - LOOP_PANEL_H) {
        rocks.splice(i, 1);
        if (Math.random() < 0.18) addFloatText('REST', clamp(r.x, 28, W - 28), H - LOOP_PANEL_H - 30, 'rgba(234,255,255,0.58)');
      }
    }

    sparks.forEach(p => {
      p.age += dt;
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.vy += 80 * dt / 1000;
    });
    sparks = sparks.filter(p => p.age < p.life).slice(-MAX_SPARKS);
    if (floatTexts) {
      floatTexts.forEach(f => {
        f.age += dt;
        f.y -= 28 * dt / 1000;
      });
      floatTexts = floatTexts.filter(f => f.age < f.life);
    }

  }

  function drawShip(c) {
    c.save();
    c.translate(player.x, player.y);
    c.shadowColor = COLOR;
    c.shadowBlur = 12;
    c.fillStyle = '#03283a';
    c.strokeStyle = COLOR;
    c.lineWidth = 2;
    c.beginPath();
    c.moveTo(0, -20);
    c.lineTo(16, 18);
    c.lineTo(0, 10);
    c.lineTo(-16, 18);
    c.closePath();
    c.fill();
    c.stroke();
    c.fillStyle = '#33ff66';
    c.globalAlpha = 0.68 + Math.sin(now() * 0.02) * 0.2;
    c.beginPath();
    c.ellipse(0, 20, 7, 5, 0, 0, Math.PI * 2);
    c.fill();
    if (pilotImg && imagesReady) {
      c.save();
      c.beginPath();
      c.arc(0, -3, 7, 0, Math.PI * 2);
      c.clip();
      c.drawImage(pilotImg, -7, -10, 14, 14);
      c.restore();
    }
    c.restore();
  }

  function drawRock(c, r) {
    c.save();
    c.translate(r.x, r.y);
    c.rotate(r.rot);
    c.shadowColor = r.color;
    c.shadowBlur = 14;
    c.fillStyle = r.inst === 'bass' ? '#2c2608' : r.inst === 'keys' ? '#26061e' : r.inst === 'chimes' ? '#1c0a26' : '#062432';
    c.strokeStyle = r.color;
    c.lineWidth = r.hp < r.maxHp ? 3 : 2;
    c.beginPath();
    const points = r.inst === 'bass' ? 8 : 7;
    for (let i = 0; i < points; i++) {
      const a = i / points * Math.PI * 2;
      const rr = r.r * (0.78 + ((i * 37) % 10) / 42);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.closePath();
    c.fill();
    c.stroke();
    c.rotate(-r.rot);
    c.fillStyle = r.color;
    c.font = "8px 'VCR', monospace";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(r.inst === 'drums' ? '●' : (r.label || '♪'), 0, 1);
    if (r.maxHp > 1) {
      const done = r.maxHp - r.hp;
      for (let i = 0; i < r.maxHp; i++) {
        const a = -Math.PI / 2 + i / r.maxHp * Math.PI * 2;
        c.globalAlpha = i < done ? 0.95 : 0.28;
        c.beginPath();
        c.arc(Math.cos(a) * (r.r + 6), Math.sin(a) * (r.r + 6), 2.1, 0, Math.PI * 2);
        c.fill();
      }
      c.globalAlpha = 1;
    }
    c.restore();
  }

  function drawBoss(c) {
    if (!boss) return;
    c.save();
    c.translate(boss.x, boss.y);
    c.shadowColor = '#7b61ff';
    c.shadowBlur = 24;
    c.strokeStyle = '#7b61ff';
    c.fillStyle = 'rgba(36,10,80,0.82)';
    c.lineWidth = 3;
    c.beginPath();
    c.ellipse(0, 0, boss.r * 1.25, boss.r * 0.52, Math.sin(boss.phase) * 0.08, 0, Math.PI * 2);
    c.fill();
    c.stroke();
    for (let i = 0; i < 4; i++) {
      const a = boss.phase + i * Math.PI * 0.5;
      c.fillStyle = i % 2 ? '#ff2db8' : COLOR;
      c.beginPath();
      c.arc(Math.cos(a) * 32, Math.sin(a) * 12, 4, 0, Math.PI * 2);
      c.fill();
    }
    c.font = "16px 'VCR', monospace";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = '#eaffff';
    c.fillText('♪', 0, -2);
    const lane = LANES[currentSoloLane];
    c.font = "8px 'VCR', monospace";
    c.fillStyle = lane.color;
    c.fillText(lane.label, 0, 27);
    c.restore();
  }

  function drawPads(c) {
    const t = now();
    // Lit pads breathe with the loop: brightest at each step tick, fading until
    // the next — every lit pad pulses in phase with the music.
    const beatFrac = beatAt > 0 ? clamp(1 - (beatAt - t) / beatMs, 0, 1) : 0;
    const beatPulse = 1 - beatFrac;
    c.save();
    c.font = "7px 'VCR', monospace";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    PAD_ROWS.forEach((rowDef, row) => {
      const r0 = padRect(row, 0);
      c.fillStyle = rowDef.color;
      c.globalAlpha = 0.75;
      c.save();
      c.translate(22, r0.y + r0.h / 2);
      c.rotate(-Math.PI / 2);
      c.fillText(rowDef.label, 0, 0);
      c.restore();
    });
    pads.forEach(pad => {
      const r = padRect(pad.row, pad.col);
      const lit = pad.lit > t;
      const pulse = lit ? 0.45 + 0.55 * beatPulse : 0;
      c.fillStyle = pad.color;
      c.globalAlpha = 0.09 + pad.flash * 0.30 + pulse * 0.22;
      c.fillRect(r.x, r.y, r.w, r.h);
      c.strokeStyle = pad.color;
      c.lineWidth = lit ? 2 : 1;
      c.globalAlpha = 0.30 + pad.flash * 0.6 + pulse * 0.55;
      c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      const cr = pad.piece === 'kick' ? 6 : pad.piece === 'tom' ? 4.5 : 3;
      c.globalAlpha = 0.35 + pad.flash * 0.5 + pulse * 0.4;
      c.beginPath();
      c.arc(r.x + r.w / 2, r.y + r.h / 2, cr + pad.flash * 3, 0, Math.PI * 2);
      if (pad.piece === 'hat') c.stroke(); else c.fill();
    });
    c.globalAlpha = 1;
    c.restore();
  }

  function drawTheremin(c) {
    const t = now();
    const tc = thereminCenter();
    const isSwell = orbLayerInst() === 'swell';
    // Chimes orb: sharp pink rings, quick shimmer. Swell orb: gold dashed
    // rings breathing slowly — you can tell which instrument you're holding.
    const col = isSwell ? '#ffe61a' : '#ff2db8';
    const breathe = isSwell ? Math.sin(t * 0.0022) * 3 : Math.sin(t * 0.006) * 1.5;
    c.save();
    c.strokeStyle = col;
    if (isSwell) c.setLineDash([5, 6]);
    [0.12, 0.4, 0.7, 1].forEach((band, i) => {
      c.globalAlpha = 0.10 + (i === 0 ? 0.06 : 0);
      c.lineWidth = 1;
      c.beginPath();
      c.arc(tc.x, tc.y, tc.maxR * band + (isSwell ? breathe : 0), 0, Math.PI * 2);
      c.stroke();
    });
    c.setLineDash([]);
    // The orb
    c.shadowColor = col;
    c.shadowBlur = (isSwell ? 26 : 18) + thereminPulse * 22;
    c.globalAlpha = 0.75 + thereminPulse * 0.25;
    c.fillStyle = col;
    c.beginPath();
    c.arc(tc.x, tc.y, (isSwell ? 13 : 10) + thereminPulse * 6 + breathe, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    if (pointerActive) {
      const dist = clamp(Math.hypot(pointerX - tc.x, pointerY - tc.y) / tc.maxR, 0, 1);
      c.globalAlpha = 0.55;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(tc.x, tc.y);
      c.lineTo(pointerX, pointerY);
      c.stroke();
      c.globalAlpha = 0.9;
      c.beginPath();
      c.arc(pointerX, pointerY, 6 + dist * 4, 0, Math.PI * 2);
      c.fill();
      if (dist > 0.12) {
        const deg = Math.round((dist - 0.12) / 0.88 * 9);
        c.font = "9px 'VCR', monospace";
        c.textAlign = 'center';
        c.fillStyle = '#eaffff';
        c.fillText(noteNameForDegree(deg), pointerX, pointerY - 16);
      }
    } else {
      c.globalAlpha = 0.6;
      c.fillStyle = 'rgba(234,255,255,0.7)';
      c.font = "9px 'VCR', monospace";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(isSwell ? 'HOLD + PULL — SLOW WAVES' : 'HOLD + PULL', tc.x, tc.y + tc.maxR * 0.55);
    }
    c.restore();
    c.globalAlpha = 1;
  }

  function drawLanes(c) {
    const lw = laneWidth();
    const baseY = H - LOOP_PANEL_H - 42;
    const selected = laneIndexForX(player.x);
    c.save();
    for (let i = 0; i < LANES.length; i++) {
      const lane = LANES[i];
      const x = i * lw;
      const isSelected = i === selected;
      const isSolo = false;
      const isLocked = false;
      const pulse = laneFlash[i];
      c.fillStyle = lane.color;
      c.globalAlpha = 0.04 + (isSelected ? 0.08 : 0) + pulse * 0.16 + (isSolo ? 0.05 : 0) + (isLocked ? 0.06 : 0);
      c.fillRect(x + 3, 118, lw - 6, baseY - 124);
      c.globalAlpha = 0.24 + pulse * 0.35 + (isSelected ? 0.3 : 0) + (isSolo ? 0.22 : 0) + (isLocked ? 0.28 : 0);
      c.strokeStyle = lane.color;
      c.lineWidth = isSelected ? 2 : 1;
      c.strokeRect(x + 5, baseY, lw - 10, 34);
      c.globalAlpha = 0.95;
      c.font = "9px 'VCR', monospace";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(lane.label, x + lw * 0.5, baseY + 17);
    }
    c.restore();
  }

  function drawHud(c) {
    c.save();
    c.font = "10px 'VCR', monospace";
    c.textBaseline = 'top';
    c.fillStyle = 'rgba(234,255,255,0.78)';
    c.fillText(state === 'replay' ? 'REPLAY' : activeLayerLabel(), 12, 12);
    c.textAlign = 'right';
    c.fillText(String(score), W - 12, 12);
    c.textAlign = 'left';
    // Loop rows live up top now, right under the layer title.
    if (phase !== 'countin' || state !== 'playing') {
      const loopX = 30, loopY = 26;
      const rowH = 5, rowGap = 3;
      const w = (W - 48) / LOOP_STEPS;
      for (let i = 0; i < LOOP_STEPS; i++) {
        const active = i === stepIndex;
        c.fillStyle = active ? COLOR : 'rgba(234,255,255,0.12)';
        if (loopEndArmed && i >= LOOP_STEPS - 4) c.fillStyle = active ? '#ffe61a' : 'rgba(255,230,26,0.34)';
        c.fillRect(loopX + i * w + 1, loopY + LAYERS.length * (rowH + rowGap) + 1, Math.max(2, w - 3), active ? 7 : 4);
      }
      for (let row = 0; row < LAYERS.length; row++) {
        const layer = LAYERS[row];
        const y = loopY + row * (rowH + rowGap);
        c.globalAlpha = row === currentLayerIndex && state === 'playing' ? 0.95 : 0.58;
        c.fillStyle = layer.options[0].color;
        c.font = "6px 'VCR', monospace";
        c.textAlign = 'right';
        c.fillText(String(row + 1), loopX - 6, y + rowH + 1);
        for (let i = 0; i < LOOP_STEPS; i++) {
          const slots = layerSlotAt(i, row);
          c.fillStyle = 'rgba(234,255,255,0.10)';
          if (loopEndArmed && i >= LOOP_STEPS - 4 && row === currentLayerIndex) c.fillStyle = 'rgba(255,230,26,0.20)';
          c.fillRect(loopX + i * w + 1, y, Math.max(2, w - 3), rowH);
          if (slots.length) {
            const slot = slots[slots.length - 1];
            c.fillStyle = slot.tight === false ? 'rgba(234,255,255,0.38)' : slot.color;
            c.fillRect(loopX + i * w + 1, y, Math.max(2, w - 3), rowH);
          }
          if (i === stepIndex) {
            c.fillStyle = row === currentLayerIndex ? '#ffe61a' : 'rgba(0,229,255,0.72)';
            c.fillRect(loopX + i * w + Math.max(2, w - 3) * 0.42, y - 1, 2, rowH + 2);
          }
        }
      }
      c.globalAlpha = 1;
      c.textAlign = 'left';
    }

    c.textAlign = 'center';
    c.font = "9px 'VCR', monospace";
    c.fillStyle = 'rgba(234,255,255,0.78)';
    const counting = phase === 'countin' && state === 'playing';
    const objective = counting
      ? 'SET THE PULSE'
      : state === 'replay'
        ? 'REPLAYING TRACK'
        : orbLayerInst() === 'swell' ? 'SWELL · SLOW WAVES'
        : chimesActive() ? 'CHIMES · THEREMIN DRIFT'
        : LANES.map(l => l.label).join(' / ');
    c.fillText(objective, W * 0.5, 84);
    if (state !== 'replay') {
      c.font = "7px 'VCR', monospace";
      c.fillStyle = 'rgba(234,255,255,0.58)';
      const hint = counting
        ? `TAP THE BEAT ANYWHERE · ${countTaps.length}/4 · YOUR TEMPO, YOUR TRACK`
        : loopEndArmed ? 'LOCKING AT THE ONE...'
        : drumsActive() ? 'WHACK PADS TO DRUM · LIT PADS SIT IN THE GROOVE'
        : orbLayerInst() === 'swell' ? 'HOLD + PULL · LONG SWELLS BLOOM ON THE BAR'
        : chimesActive() ? 'HOLD + PULL FROM THE CENTER · FURTHER = HIGHER AND FULLER'
        : 'EVERY HIT RECORDS · SHOOT ON THE PULSE · SPACE IS PART OF THE TRACK';
      c.fillText(hint, W * 0.5, 96);
    }
    c.textAlign = 'left';

    if (lastGrooveToast && state !== 'replay') {
      const layer = LAYERS[lastGrooveToast.layerIndex] || LAYERS[0];
      c.font = "7px 'VCR', monospace";
      c.fillStyle = '#ffe61a';
      c.fillText(`${layer.name} LOCKED · GROOVE +${lastGrooveToast.groove.total}`, W * 0.5, 108);
    }

    // Bottom panel: big beat dots, the loop's coarse heartbeat.
    if (phase !== 'countin' || state !== 'playing') {
      const t2 = now();
      const beats = LOOP_STEPS / 4;
      const beatIdx = Math.floor(stepIndex / 4);
      const frac2 = beatAt > 0 ? clamp(1 - (beatAt - t2) / beatMs, 0, 1) : 0;
      const stepInBeat = (stepIndex % 4 + frac2) / 4;
      const bw = Math.min(40, (W - 48) / beats);
      const bx = W / 2 - (bw * beats) / 2;
      const by = H - LOOP_PANEL_H / 2;
      for (let b = 0; b < beats; b++) {
        const cx2 = bx + b * bw + bw / 2;
        const active = b === beatIdx;
        c.beginPath();
        c.fillStyle = COLOR;
        if (active) {
          c.globalAlpha = 0.95;
          c.arc(cx2, by, 7 + (1 - stepInBeat) * 3.5, 0, Math.PI * 2);
          c.fill();
        } else {
          c.globalAlpha = b < beatIdx ? 0.5 : 0.2;
          c.arc(cx2, by, 4.2, 0, Math.PI * 2);
          c.fill();
        }
      }
      c.globalAlpha = 1;
      if (combo > 1) {
        c.fillStyle = '#ffe61a';
        c.font = "9px 'VCR', monospace";
        c.textAlign = 'left';
        c.textBaseline = 'middle';
        c.fillText('COMBO ' + combo, 12, by);
      }
    }
    c.globalAlpha = 1;
    c.textAlign = 'left';
    c.restore();
  }

  function drawBar(c, x, y, w, h, pct, color) {
    c.fillStyle = 'rgba(234,255,255,0.12)';
    c.fillRect(x, y, w, h);
    c.fillStyle = color;
    c.fillRect(x, y, w * clamp(pct, 0, 1), h);
  }

  function draw() {
    const c = ctx;
    c.clearRect(0, 0, W, H);
    c.fillStyle = '#02040e';
    c.fillRect(0, 0, W, H);

    stars.forEach(s => {
      c.globalAlpha = s.a;
      c.fillStyle = '#eaffff';
      c.beginPath();
      c.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      c.fill();
    });
    c.globalAlpha = 1;

    c.save();
    c.strokeStyle = 'rgba(0,229,255,0.13)';
    c.lineWidth = 1;
    for (let y = 74; y < H; y += 58) {
      c.beginPath();
      for (let x = 0; x <= W; x += 12) {
        const yy = y + Math.sin((x + now() * 0.045) * 0.045) * 5;
        if (x === 0) c.moveTo(x, yy); else c.lineTo(x, yy);
      }
      c.stroke();
    }
    c.restore();

    // Playhead sweep: a light band crossing the field in sync with the loop.
    if ((state === 'playing' && phase === 'build') || state === 'replay') {
      const t = now();
      const frac = beatAt > 0 ? clamp(1 - (beatAt - t) / beatMs, 0, 1) : 0;
      const x = (((stepIndex + frac) % LOOP_STEPS) / LOOP_STEPS) * W;
      const sweepTop = 118, sweepBot = H - LOOP_PANEL_H;
      const grad = c.createLinearGradient(x - 52, 0, x, 0);
      grad.addColorStop(0, 'rgba(0,229,255,0)');
      grad.addColorStop(1, 'rgba(0,229,255,0.09)');
      c.fillStyle = grad;
      c.fillRect(x - 52, sweepTop, 52, sweepBot - sweepTop);
      c.strokeStyle = stepIndex % 4 === 0 && frac < 0.4 ? 'rgba(0,229,255,0.55)' : 'rgba(0,229,255,0.28)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x + 0.5, sweepTop);
      c.lineTo(x + 0.5, sweepBot);
      c.stroke();
    }

    const counting = phase === 'countin' && state === 'playing';
    const padsVisible = drumsActive();
    const thereminVisible = chimesActive();
    if (!counting && !padsVisible && !thereminVisible) drawLanes(c);
    drawBoss(c);
    if (padsVisible) drawPads(c);
    if (thereminVisible) drawTheremin(c);
    rocks.forEach(r => drawRock(c, r));
    bullets.forEach(b => {
      c.save();
      c.shadowColor = COLOR;
      c.shadowBlur = 12;
      c.fillStyle = '#eaffff';
      c.beginPath();
      c.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      c.fill();
      c.restore();
    });
    sparks.forEach(p => {
      const a = 1 - p.age / p.life;
      c.globalAlpha = a;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.r * a, 0, Math.PI * 2);
      c.fill();
    });
    c.globalAlpha = 1;
    if (phase === 'countin' && state === 'playing') {
      const t = now();
      c.save();
      countRings.forEach(ring => {
        const age = t - ring.t0;
        const a = clamp(1 - age / 900, 0, 1);
        c.globalAlpha = a * 0.7;
        c.strokeStyle = COLOR;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(ring.x, ring.y, 18 + age * 0.16, 0, Math.PI * 2);
        c.stroke();
      });
      c.globalAlpha = 0.85;
      c.fillStyle = '#eaffff';
      c.font = "13px 'VCR', monospace";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText('TAP THE BEAT', W * 0.5, H * 0.42);
      c.restore();
      c.globalAlpha = 1;
    }
    if (floatTexts && floatTexts.length) {
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = "10px 'VCR', monospace";
      floatTexts.forEach(f => {
        c.globalAlpha = clamp(1 - f.age / f.life, 0, 1);
        c.fillStyle = f.color;
        c.fillText(f.text, f.x, f.y);
      });
      c.restore();
      c.globalAlpha = 1;
    }
    if (!counting && !padsVisible && !thereminVisible) drawShip(c);
    // Reserved loop panel: gameplay slides behind it, loop rows own the space.
    c.fillStyle = '#02040e';
    c.fillRect(0, H - LOOP_PANEL_H, W, LOOP_PANEL_H);
    c.strokeStyle = 'rgba(0,229,255,0.22)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(0, H - LOOP_PANEL_H + 0.5);
    c.lineTo(W, H - LOOP_PANEL_H + 0.5);
    c.stroke();
    drawHud(c);
  }

  function frame(t) {
    if (state !== 'playing' && state !== 'replay') return;
    const dt = Math.min(40, t - (last || t));
    last = t;
    try {
      update(dt, t);
      draw();
    } catch(e) {
      console.warn('[Signal Drift] recovered frame error', e);
      rocks = [];
      bullets = [];
      sparks = [];
      beatAt = t + beatMs;
      draw();
    }
    if (state === 'playing' || state === 'replay') raf = requestAnimationFrame(frame);
  }

  function start() {
    fitCanvas();
    resetRun();
    state = 'playing';
    overlay.classList.add('hidden');
    updateLoopButton();
    if (typeof ArcadeMusic !== 'undefined' && ArcadeMusic.duck) ArcadeMusic.duck();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function finish(won) {
    if (state !== 'playing') return;
    state = 'over';
    loopEndArmed = false;
    updateLoopButton();
    cancelAnimationFrame(raf);
    if (won) {
      signal = 100;
      score += Math.max(0, 300 - Math.floor(elapsed / 1000)) + bestCombo * 5;
      tone(262, 'triangle', 0, 0.14, 0.06);
      tone(330, 'triangle', 0.1, 0.14, 0.06);
      tone(392, 'triangle', 0.2, 0.16, 0.06);
      tone(523, 'sine', 0.32, 0.22, 0.05);
    } else {
      tone(220, 'sawtooth', 0, 0.18, 0.055, 110);
      tone(120, 'sawtooth', 0.14, 0.26, 0.06, 55);
    }
    showResult(won);
  }

  function showIntro() {
    updateLoopButton();
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">SIGNAL DRIFT</div>
        <div class="signal-subtitle">TAP 4 BEATS TO COUNT YOURSELF IN — YOUR TEMPO, YOUR TRACK.<br>EVERY SHOT PLAYS A NOTE AND RECORDS IT INTO YOUR LOOP.<br>ALL NOTES FIT THE KEY — NO WRONG NOTES.</div>
        ${presetControlsHTML()}
        <div class="signal-stats">
          <div class="signal-stat">LAYER 1<b>DRUMS</b></div>
          <div class="signal-stat">LAYER 2<b>BASS</b></div>
          <div class="signal-stat">LAYER 3<b>KEYS</b></div>
          <div class="signal-stat">LAYER 4<b>CHIMES</b></div>
          <div class="signal-stat">LAYER 5<b>SWELL</b></div>
          <div class="signal-stat">WRONG NOTES<b>NONE</b></div>
        </div>
        <button class="signal-btn" onclick="signalStart()">START SIGNAL</button>
        <button class="signal-btn secondary" onclick="signalShowJukebox()">JUKEBOX</button>
        <button class="signal-btn secondary" onclick="nav('lobby')">BACK TO ARCADE</button>
      </div>`;
  }

  function presetControlsHTML() {
    const group = (key, label) => `
      <div class="signal-preset-row">
        <div class="signal-preset-label">${label}</div>
        <div class="signal-preset-options">
          ${SIGNAL_PRESETS[key].map(p => `<button type="button" class="signal-chip ${signalSettings[key] === p.id ? 'active' : ''}" onclick="signalSetPreset('${key}','${p.id}')">${p.label}</button>`).join('')}
        </div>
      </div>`;
    return `<div class="signal-presets">
      ${group('style', 'PALETTE')}
      ${group('mood', 'MOOD')}
      ${group('tempo', 'TEMPO')}
    </div>`;
  }

  function choiceSummaryHTML() {
    // Summarize from the loop grid itself — recordedChoices is a rolling log
    // and can shed old entries on long runs.
    const stamps = gridStamps();
    if (!stamps.length) return '<div class="signal-subtitle">NO CHOICES RECORDED YET.</div>';
    const rows = LAYERS.map((layer, index) => {
      const picks = stamps.filter(s => s.layerIndex === index);
      if (!picks.length) return `<div class="signal-stat">${layer.name}<b>REST</b></div>`;
      if (layer.inst === 'drums') {
        const hits = picks.reduce((n, s) => n + (s.pieces ? s.pieces.length : 1), 0);
        return `<div class="signal-stat">${layer.name}<b style="color:${picks[0].color}">${hits} HITS</b></div>`;
      }
      const seq = picks.slice(0, 10).map(s => s.label).join(' ') + (picks.length > 10 ? ' …' : '');
      return `<div class="signal-stat">${layer.name}<b style="color:${picks[0].color};font-size:11px;letter-spacing:1px">${seq}</b></div>`;
    }).join('');
    return `<div class="signal-stats">${rows}</div>`;
  }

  function grooveSummaryHTML() {
    const rows = LAYERS.map((layer, index) => {
      const groove = grooveByLayer[index];
      if (!groove || groove.rest || groove.total <= 0) return `<div class="signal-stat">${layer.name}<b>REST</b></div>`;
      return `<div class="signal-stat">${layer.name}<b>${groove.total}</b></div>`;
    }).join('');
    return `<div class="signal-stats">${rows}</div>`;
  }

  // Serialize the loop grid itself — the final truth of what the player built.
  // Max 4 layers x 16 steps = 64 stamps, which is the supabase choices cap.
  function gridStamps() {
    const out = [];
    for (let s = 0; s < LOOP_STEPS; s++) {
      (loop[s] || []).forEach(v => {
        if (!v || !v.inst) return;
        out.push({
          step: s,
          layerIndex: v.layerIndex,
          layerId: v.layerId,
          inst: v.inst,
          note: v.note || null,
          pieces: v.pieces ? v.pieces.slice() : null,
          tunes: v.tunes ? v.tunes.slice() : null,
          label: v.label || '',
          color: v.color,
          tight: !!v.tight,
          vel: v.vel || 1,
        });
      });
    }
    return out.slice(0, 128);
  }

  function currentRecipe() {
    return {
      version: 3,
      settings: { ...signalSettings },
      beatMs,
      score,
      layers: LAYERS.map((layer, index) => ({ index, id: layer.id, name: layer.name })),
      grooveByLayer: Object.fromEntries(LAYERS.map((layer, index) => [layer.id, grooveByLayer[index] || null])),
      choices: gridStamps(),
    };
  }

  function recipeExtra(recipe) {
    const settings = recipe && recipe.settings ? recipe.settings : signalSettings;
    return `${presetLabel('style', settings.style)} · ${presetLabel('mood', settings.mood)}`;
  }

  function recipeSummary(recipe) {
    const choices = recipe && recipe.choices ? recipe.choices : recordedChoices;
    if (!choices.length) return '';
    const layerNames = (recipe && recipe.layers ? recipe.layers.map(l => l.name) : LAYERS.map(l => l.name));
    return layerNames.map((name, index) => {
      const count = choices.filter(c => (c.layerIndex ?? ((c.loop || 1) - 1)) === index).length;
      return `${name}: ${count ? count + ' HITS' : 'REST'}`;
    }).join(' / ');
  }

  function showBuiltChoice() {
    cancelAnimationFrame(raf);
    state = 'built';
    replaying = false;
    updateLoopButton();
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">TRACK BUILT</div>
        <div class="signal-subtitle">REPLAY WHAT YOU MADE OR END THE RUN.</div>
        ${grooveSummaryHTML()}
        ${choiceSummaryHTML()}
        <button class="signal-btn" onclick="signalReplayTrack()">REPLAY TRACK</button>
        <button class="signal-btn secondary" onclick="signalEndRun()">END RUN</button>
      </div>`;
  }

  function endBuiltRun() {
    cancelAnimationFrame(raf);
    state = 'over';
    replaying = false;
    updateLoopButton();
    showResult(true);
  }

  function showResult(won) {
    updateLoopButton();
    const seconds = Math.round(elapsed / 1000);
    const canSave = won || score > 0;
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">TRACK BUILT</div>
        <div class="signal-subtitle">SAVED CHOICES READY FOR REPLAY.</div>
        <div class="signal-stats">
          <div class="signal-stat">SCORE<b>${score}</b></div>
          <div class="signal-stat">TIME<b>${seconds}s</b></div>
          <div class="signal-stat">GROOVE<b>${Math.round(signal)}%</b></div>
          <div class="signal-stat">LAYERS<b>${LAYERS.length}</b></div>
          <div class="signal-stat">ADDS<b>${totalAdditions}</b></div>
          <div class="signal-stat">BEST COMBO<b>${bestCombo}</b></div>
        </div>
        ${won ? grooveSummaryHTML() : ''}
        ${won ? choiceSummaryHTML() : ''}
        ${canSave ? `
          <div style="display:flex;gap:8px;margin-top:14px">
            <input id="signal-name" maxlength="12" placeholder="NAME" style="flex:1;min-width:0;height:42px;box-sizing:border-box;background:#02040e;border:1.5px solid ${COLOR};border-radius:4px;color:#fff;text-align:center;text-transform:uppercase;font-family:'VCR',monospace;font-size:14px;letter-spacing:3px">
            <button class="signal-btn" style="width:58px;margin:0" onclick="signalSaveRecipe()">▶</button>
          </div>
          <div id="signal-save-status" class="signal-subtitle" style="min-height:18px;margin-top:8px"></div>` : ''}
        ${won ? `<button class="signal-btn secondary" onclick="signalShowJukebox()">LOCAL JUKEBOX</button>` : ''}
        <button class="signal-btn" onclick="signalStart()">PLAY AGAIN</button>
        <button class="signal-btn secondary" onclick="nav('lobby')">BACK TO ARCADE</button>
      </div>`;
    const input = document.getElementById('signal-name');
    if (input) input.focus({ preventScroll: true });
  }

  function saveScore() {
    const input = document.getElementById('signal-name');
    const status = document.getElementById('signal-save-status');
    const name = ((input && input.value) || '').trim() || 'MOBE';
    if (typeof LB !== 'undefined' && typeof LB.add === 'function') {
      LB.add(BOARD_KEY, name, score, Math.round(signal) + '%', false);
      if (status) status.textContent = 'SAVED';
      if (input) input.disabled = true;
    }
  }

  function loadSignalRecipes() {
    try { return JSON.parse(localStorage.getItem('signal-recipes-v1') || '[]'); }
    catch(e) { return []; }
  }

  function saveSignalRecipes(rows) {
    localStorage.setItem('signal-recipes-v1', JSON.stringify(rows.slice(0, 20)));
  }

  async function loadJukeboxRows() {
    const localRows = loadSignalRecipes();
    if (!window.SignalRecipeRemote || typeof window.SignalRecipeRemote.fetchTop !== 'function') {
      return { rows: localRows, online: false };
    }
    try {
      const remoteRows = await withTimeout(window.SignalRecipeRemote.fetchTop(20), 3500);
      if (remoteRows && remoteRows.length) return { rows: remoteRows, online: true };
    } catch(e) {}
    return { rows: localRows, online: false };
  }

  async function saveRecipe() {
    const input = document.getElementById('signal-name');
    const status = document.getElementById('signal-save-status');
    const name = ((input && input.value) || '').trim() || 'MOBE';
    const recipe = currentRecipe();
    const extra = recipeExtra(recipe);
    const row = {
      id: Date.now().toString(36),
      name: name.trim().slice(0, 12).toUpperCase(),
      score,
      extra,
      date: new Date().toLocaleDateString(),
      recipe,
    };
    const rows = loadSignalRecipes();
    rows.unshift(row);
    rows.sort((a, b) => b.score - a.score);
    saveSignalRecipes(rows);
    try {
      if (typeof LB !== 'undefined' && typeof LB.add === 'function') LB.add(BOARD_KEY, name, score, extra, false);
    } catch(e) {}
    if (status) status.textContent = 'SAVED LOCAL. SYNCING...';
    if (input) input.disabled = true;
    if (window.SignalRecipeRemote && typeof window.SignalRecipeRemote.submit === 'function') {
      try {
        await withTimeout(window.SignalRecipeRemote.submit(name, score, extra, recipe), 3500);
        if (status) status.textContent = 'SAVED ONLINE';
      } catch(e) {
        if (status) status.textContent = 'SAVED LOCAL';
      }
    }
    showJukebox();
  }

  function recipeToLoop(recipe) {
    const savedLoop = Array.from({ length: LOOP_STEPS }, () => []);
    const pushStamp = (target, stamp) => {
      const bucket = savedLoop[target];
      const same = bucket.findIndex(v => v.layerId === stamp.layerId);
      if (same >= 0) bucket[same] = stamp;
      else bucket.push(stamp);
      while (bucket.length > 5) bucket.shift();
    };
    (recipe.choices || []).forEach(choice => {
      if (Number.isFinite(choice.step) && choice.inst) {
        pushStamp(clamp(Math.floor(choice.step), 0, LOOP_STEPS - 1), {
          layerId: choice.layerId || 'drums',
          layerIndex: choiceLayerIndex(choice),
          inst: choice.inst,
          note: choice.note || null,
          pieces: choice.pieces ? choice.pieces.slice() : (choice.piece ? [choice.piece] : null),
          tunes: choice.tunes ? choice.tunes.slice() : null,
          label: choice.label || '',
          color: choice.color || COLOR,
          tight: choice.tight !== false,
          vel: choice.vel || 1,
        });
        return;
      }
      // Legacy v2 recipes: role/phrase choices spread over step masks.
      const steps = stepsForChoice(choice);
      const phrase = choice.phrase && choice.phrase.length ? choice.phrase : [styleDef().root];
      steps.forEach((target, i) => {
        let stamp;
        if (choice.type === 'drum') {
          const piece = choice.role === 'hat' ? 'hat' : (choice.role === 'clap' || choice.role === 'snare') ? 'tom' : 'kick';
          stamp = { inst: 'drums', pieces: [piece] };
        } else if (choice.type === 'bass') {
          stamp = { inst: 'bass', note: phrase[i % phrase.length] };
        } else {
          stamp = { inst: 'keys', note: phrase[i % phrase.length] };
        }
        stamp.layerId = `${choice.layerId || `legacy-${choice.type}`}:${choice.role || ''}`;
        stamp.layerIndex = choiceLayerIndex(choice);
        stamp.label = choice.label || '';
        stamp.color = choice.color || COLOR;
        stamp.tight = !choice.faded;
        stamp.vel = choice.faded ? 0.62 : 1;
        pushStamp(target, stamp);
      });
    });
    return savedLoop;
  }

  function playRecipe(recipe) {
    if (!recipe || !Array.isArray(recipe.choices)) return;
    signalSettings = { ...signalSettings, ...(recipe.settings || {}) };
    applySettings();
    // Tapped tempos don't match any preset, so honor the recipe's exact beat.
    if (Number.isFinite(recipe.beatMs)) beatMs = clamp(recipe.beatMs, 170, 420);
    phase = 'build';
    loop = recipeToLoop(recipe);
    recordedChoices = recipe.choices.map(c => ({ ...c, phrase: c.phrase ? c.phrase.slice() : [] }));
    grooveByLayer = LAYERS.map(layer => recipe.grooveByLayer && recipe.grooveByLayer[layer.id] ? recipe.grooveByLayer[layer.id] : null);
    lastGrooveToast = null;
    currentLayerIndex = Math.max(0, Math.min(LAYERS.length - 1, ...recordedChoices.map(c => c.layerIndex ?? ((c.loop || 1) - 1))));
    additionsThisLayer = 0;
    totalAdditions = recordedChoices.length;
    state = 'replay';
    replaying = true;
    updateLoopButton();
    replayUntil = performance.now() + LOOP_STEPS * beatMs * 2;
    overlay.classList.add('hidden');
    rocks = [];
    bullets = [];
    if (!stars || !stars.length) initStars();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  async function showJukebox() {
    overlay.classList.remove('hidden');
    state = 'built';
    loopEndArmed = false;
    updateLoopButton();
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">JUKEBOX</div>
        <div class="signal-subtitle">LOADING SAVED SIGNAL DRIFT RECIPES...</div>
      </div>`;
    const result = await loadJukeboxRows();
    const rows = result.rows;
    jukeboxRows = rows;
    const list = rows.length ? rows.slice(0, 8).map((row, i) => `
      <div class="signal-jukebox-row">
        <div>
          <div class="signal-jukebox-name">${i + 1}. ${row.name}</div>
          <div class="signal-jukebox-meta">${row.score} · ${row.extra || ''}</div>
          <div class="signal-jukebox-seq">${recipeSummary(row.recipe)}</div>
        </div>
        <button class="signal-chip active" onclick="signalPlayRecipe('${row.id}')">PLAY</button>
      </div>`).join('') : '<div class="signal-subtitle">NO SAVED TRACKS YET.</div>';
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">JUKEBOX</div>
        <div class="signal-subtitle">${result.online ? 'SHARED SIGNAL DRIFT RECIPES.' : 'LOCAL SAVED SIGNAL DRIFT RECIPES.'}</div>
        <div class="signal-jukebox">${list}</div>
        <button class="signal-btn secondary" onclick="signalJukeboxBack()">BACK</button>
      </div>`;
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches && e.touches.length ? e.touches[0] : e;
    return { x: (p.clientX - rect.left) * (W / rect.width), y: (p.clientY - rect.top) * (H / rect.height) };
  }

  function attachInput() {
    if (canvas._signalReady) return;
    canvas._signalReady = true;
    canvas.addEventListener('touchstart', e => {
      if (state !== 'playing') return;
      e.preventDefault();
      const p = pointerPos(e);
      pointerActive = true;
      pointerX = p.x;
      pointerY = p.y;
      audioCtx();
      tapShoot(p);
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      if (state !== 'playing') return;
      e.preventDefault();
      const p = pointerPos(e);
      pointerX = p.x;
      pointerY = p.y;
    }, { passive: false });
    canvas.addEventListener('touchend', () => { pointerActive = false; }, { passive: true });
    canvas.addEventListener('touchcancel', () => { pointerActive = false; }, { passive: true });
    canvas.addEventListener('mousemove', e => {
      if (state !== 'playing') return;
      const p = pointerPos(e);
      pointerActive = true;
      pointerX = p.x;
      pointerY = p.y;
    });
    canvas.addEventListener('mousedown', e => {
      if (state !== 'playing') return;
      const p = pointerPos(e);
      pointerActive = true;
      pointerX = p.x;
      pointerY = p.y;
      audioCtx();
      tapShoot(p);
    });
    canvas.addEventListener('mouseleave', () => { pointerActive = false; });
  }

  window.signalStart = start;
  window.signalEndLoop = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (phase === 'countin' && state === 'playing') skipCountIn();
    else requestLoopEnd();
  };
  window.signalResetLoop = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    resetCurrentLoop();
  };
  window.signalSaveScore = saveScore;
  window.signalSaveRecipe = saveRecipe;
  window.signalReplayTrack = startReplay;
  window.signalLoopAgain = continueLooping;
  window.signalEndRun = endBuiltRun;
  window.signalShowJukebox = showJukebox;
  window.signalJukeboxBack = function() {
    if (recordedChoices.length) showBuiltChoice();
    else showIntro();
  };
  window.signalPlayRecipe = function(id) {
    const row = jukeboxRows.find(r => r.id === id) || loadSignalRecipes().find(r => r.id === id);
    if (row) playRecipe(row.recipe);
  };
  window.signalSetPreset = function(group, value) {
    if (!SIGNAL_PRESETS[group] || !SIGNAL_PRESETS[group].some(p => p.id === value)) return;
    signalSettings[group] = value;
    applySettings();
    showIntro();
  };

  window.initSignal = function() {
    canvas = document.getElementById('signal-canvas');
    overlay = document.getElementById('signal-overlay');
    loopButton = document.getElementById('signal-loop-btn');
    resetButton = document.getElementById('signal-reset-btn');
    if (!canvas || !overlay) return;
    fitCanvas();
    loadPilot();
    attachInput();
    resetRun();
    state = 'idle';
    updateLoopButton();
    showIntro();
    draw();
    if (!resizeHandler) {
      resizeHandler = () => {
        fitCanvas();
        if (state !== 'playing') draw();
      };
      window.addEventListener('resize', resizeHandler);
      window.addEventListener('orientationchange', resizeHandler);
    }
    if (!keyDownHandler) {
      keyDownHandler = e => {
        if (!document.body.classList.contains('on-signal')) return;
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') leftHeld = true;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightHeld = true;
        if (e.key === 'Enter' && state !== 'playing') start();
      };
      keyUpHandler = e => {
        if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') leftHeld = false;
        if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') rightHeld = false;
      };
      window.addEventListener('keydown', keyDownHandler);
      window.addEventListener('keyup', keyUpHandler);
    }
  };

  window.signalBack = function() {
    cancelAnimationFrame(raf);
    state = 'idle';
    loopEndArmed = false;
    updateLoopButton();
    leftHeld = false;
    rightHeld = false;
    pointerActive = false;
    if (overlay) overlay.classList.remove('hidden');
  };

})();
