// ══════════════════════════════════════
//  SIGNAL DRIFT — music survival prototype
// ══════════════════════════════════════
(function() {
  'use strict';

  const COLOR = '#00e5ff';
  const BOARD_KEY = 'signal';
  const LOOP_STEPS = 24;
  const DEFAULT_BEAT_MS = 285;
  const MIN_TEMPO_BPM = 36;
  const MAX_TEMPO_BPM = 88;
  const MAX_ROCKS = 32;
  const MAX_SPARKS = 120;
  const MAX_DRUM_STACK = 6;
  const MAX_PIANO_STACK = 6;
  const SIGNAL_MASTER_GAIN = 1.30;
  // Small reserved footer; gameplay now uses the room formerly occupied by beat dots.
  const LOOP_PANEL_H = 24;
  const PAD_COLS = 4;
  const PAD_ROWS = [
    { label: 'METAL', lane: 2, cells: [
      { piece: 'tri', label: 'TRI', color: '#eaffff' },
      { piece: 'bell', label: 'BELL', color: '#b8fff8' },
      { piece: 'gong', label: 'GONG', color: '#ffe61a' },
      { piece: 'clave', label: 'CLAVE', color: '#d8ff8a' },
    ] },
    { label: 'SHAKE', lane: 1, cells: [
      { piece: 'guiro', label: 'GUIRO', color: '#ff9f4a' },
      { piece: 'shaker', label: 'SHKR', color: '#ffd23d' },
      { piece: 'cabasa', label: 'CAB', color: '#ffbd66' },
      { piece: 'hat', label: 'HAT', color: '#eaffff' },
    ] },
    { label: 'DRUM', lane: 0, cells: [
      { piece: 'kick', label: 'KICK', color: '#00e5ff' },
      { piece: 'tom', label: 'TOM', color: '#ff8a3d' },
      { piece: 'clap', label: 'CLAP', color: '#ff66c7' },
      { piece: 'rim', label: 'RIM', color: '#7bffea' },
    ] },
  ];
  const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  // One pentatonic scale per run: any note against any other always sounds good.
  const MOOD_SEMIS = {
    minor: [0, 3, 5, 7, 10],
    major: [0, 2, 4, 7, 9],
    blues: [0, 3, 5, 6, 7, 10],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    egyptian: [0, 2, 5, 7, 10],
    hirajoshi: [0, 2, 3, 7, 8],
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
    { id: 'fx', name: 'FX', inst: 'fx', mult: 4, options: [
      { label: 'ECHO', piece: 'echo', color: '#7bffea' },
      { label: 'RISE', piece: 'rise', color: '#ff66c7' },
      { label: 'WARP', piece: 'warp', color: '#ffe61a' },
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
    fx: [1, 4],
  };
  const SIGNAL_PRESETS = {
    style: [
      { id: 'space-funk', label: 'SPACE FUNK' },
      { id: 'dream-synth', label: 'DREAM SYNTH' },
      { id: 'boss-rave', label: 'BOSS RAVE' },
      { id: 'chiptune', label: 'CHIPTUNE' },
      { id: 'dark-minor', label: 'DARK MINOR' },
      { id: 'vaporwave', label: 'VAPORWAVE' },
      { id: 'toy-box', label: 'TOY BOX' },
      { id: 'steel-island', label: 'STEEL ISLAND' },
      { id: 'jazz-club', label: 'JAZZ CLUB' },
      { id: 'haunted-organ', label: 'HAUNTED ORGAN' },
      { id: 'desert-caravan', label: 'DESERT' },
      { id: 'cyber-garage', label: 'CYBER GARAGE' },
      { id: 'crystal-cave', label: 'CRYSTAL CAVE' },
    ],
    mood: [
      { id: 'minor', label: 'MINOR' },
      { id: 'major', label: 'MAJOR' },
      { id: 'blues', label: 'BLUES' },
      { id: 'dorian', label: 'DORIAN' },
      { id: 'egyptian', label: 'EGYPTIAN' },
      { id: 'hirajoshi', label: 'HIRO' },
    ],
    tempo: [
      { id: 'chill', label: 'CHILL', beatMs: 340 },
      { id: 'medium', label: 'MEDIUM', beatMs: 285 },
      { id: 'fast', label: 'FAST', beatMs: 235 },
    ],
  };
  // Palettes: key center + instrument character. Never breaks the pentatonic guarantee.
  const STYLE_DEFS = {
    'space-funk': { root: 110.00, rootSemi: 9, bassWave: 'triangle', keysWave: 'triangle', chimeWave: 'triangle', drumVol: 1, shimmer: 1, bassWeight: 1.08, keyGlow: 1, echo: 0.9, resonance: 1.05 },
    'dream-synth': { root: 123.47, rootSemi: 11, bassWave: 'sine', keysWave: 'sine', chimeWave: 'triangle', drumVol: 0.8, shimmer: 1.5, bassWeight: 0.86, keyGlow: 1.3, echo: 1.35, resonance: 0.85 },
    'boss-rave': { root: 116.54, rootSemi: 10, bassWave: 'sawtooth', keysWave: 'triangle', chimeWave: 'triangle', drumVol: 1.22, shimmer: 1.1, bassWeight: 1.22, keyGlow: 1.08, echo: 0.75, resonance: 1.35, master: 1.06 },
    'chiptune': { root: 146.83, rootSemi: 2, bassWave: 'square', keysWave: 'square', chimeWave: 'square', drumVol: 0.85, shimmer: 0.8, bassWeight: 0.9, keyGlow: 0.86, echo: 0.35, resonance: 1.65 },
    'dark-minor': { root: 103.83, rootSemi: 8, bassWave: 'triangle', keysWave: 'triangle', chimeWave: 'triangle', drumVol: 1.05, shimmer: 0.7, bassWeight: 1.18, keyGlow: 0.9, echo: 0.7, resonance: 1.12, forceMinor: true },
    'vaporwave': { root: 92.50, rootSemi: 6, bassWave: 'sine', keysWave: 'sine', chimeWave: 'triangle', drumVol: 0.72, shimmer: 1.8, bassWeight: 0.8, keyGlow: 1.45, echo: 1.8, resonance: 0.7 },
    'toy-box': { root: 130.81, rootSemi: 0, bassWave: 'triangle', keysWave: 'square', chimeWave: 'sine', drumVol: 0.74, shimmer: 1.35, bassWeight: 0.76, keyGlow: 0.94, echo: 0.65, resonance: 1.45 },
    'steel-island': { root: 98.00, rootSemi: 7, bassWave: 'triangle', keysWave: 'triangle', chimeWave: 'sine', drumVol: 0.92, shimmer: 2.2, bassWeight: 1, keyGlow: 1.08, echo: 1.15, resonance: 1.7 },
    'jazz-club': { root: 116.54, rootSemi: 10, bassWave: 'sine', keysWave: 'triangle', chimeWave: 'sine', drumVol: 0.86, shimmer: 0.9, bassWeight: 0.94, keyGlow: 0.82, echo: 0.55, resonance: 0.95, master: 0.96 },
    'haunted-organ': { root: 87.31, rootSemi: 5, bassWave: 'triangle', keysWave: 'sine', chimeWave: 'triangle', drumVol: 0.78, shimmer: 0.55, bassWeight: 1.12, keyGlow: 1.12, echo: 1.05, resonance: 1.25, forceMinor: true },
    'desert-caravan': { root: 146.83, rootSemi: 2, bassWave: 'triangle', keysWave: 'triangle', chimeWave: 'sine', drumVol: 0.95, shimmer: 1.15, bassWeight: 0.94, keyGlow: 0.96, echo: 0.82, resonance: 1.55 },
    'cyber-garage': { root: 123.47, rootSemi: 11, bassWave: 'sawtooth', keysWave: 'square', chimeWave: 'square', drumVol: 1.35, shimmer: 0.7, bassWeight: 1.25, keyGlow: 1, echo: 0.45, resonance: 1.9, master: 1.08 },
    'crystal-cave': { root: 104.65, rootSemi: 8, bassWave: 'sine', keysWave: 'triangle', chimeWave: 'sine', drumVol: 0.66, shimmer: 2.5, bassWeight: 0.74, keyGlow: 1.35, echo: 1.55, resonance: 1.6 },
  };

  let canvas = null, ctx = null, overlay = null, loopButton = null, resetButton = null, signalExitButton = null;
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, state = 'idle';
  let signalAudioCtx = null, signalMasterGain = null, signalLimiter = null;
  let player, bullets, rocks, sparks, floatTexts, stars, boss;
  let score = 0, signal = 0, distortion = 0, health = 3, elapsed = 0;
  let combo = 0, bestCombo = 0, currentSoloLane = 1;
  let currentLayerIndex = 0, additionsThisLayer = 0, totalAdditions = 0;
  let recordedChoices = [], grooveByLayer = [], lastGrooveToast = null, replaying = false, replayUntil = 0;
  let jukeboxRows = [], jukeboxBackTarget = 'intro';
  let signalSettings = { style: 'space-funk', mood: 'minor', tempo: 'medium' };
  let beatMs = DEFAULT_BEAT_MS;
  let laneFlash = [0, 0, 0];
  let loopFlash = [];
  let spawnAt = 0, manualFireAt = 0, beatAt = 0, stepIndex = 0, lastLoopStep = -1;
  let loopEndArmed = false;
  // 'countin': tempo setup before the loop starts. It seeds an even kick floor.
  let phase = 'countin', countKickPulse = 0, countLockedText = '', tempoPreviewBeatAt = 0, lastTempoPreviewAt = 0;
  let pads = [], padSpawnAt = 0;
  let loop = [];
  let leftHeld = false, rightHeld = false, pointerActive = false, pointerX = 0, pointerY = 0;
  let thereminPulse = 0;
  let resizeHandler = null, keyDownHandler = null, keyUpHandler = null;
  let signalShellApplied = false, gestureGuardHandler = null, gestureStartHandler = null, signalHeaderStyles = null, signalHeaderActionStyles = null, signalHeaderBackStyles = null, signalPageStyles = null, signalCanvasStyles = null, signalLoopRowStyles = null, signalLoopButtonStyles = null, signalResetButtonStyles = null;
  let imagesReady = false, pilotImg = null;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function now() { return performance.now(); }
  function laneWidth() { return W / LANES.length; }
  function laneIndexForX(x) { return clamp(Math.floor(x / Math.max(1, laneWidth())), 0, LANES.length - 1); }
  function laneCenter(i) { return laneWidth() * (i + 0.5); }
  function styleDef() { return STYLE_DEFS[signalSettings.style] || STYLE_DEFS['space-funk']; }
  function soundProfile() {
    return {
      bassWeight: 1,
      keyGlow: 1,
      echo: 1,
      resonance: 1,
      shimmer: 1,
      master: 1,
      ...styleDef(),
    };
  }
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
    if (wasHidden === show) fitCanvas();
    if (resetButton) resetButton.classList.toggle('hidden', !(show && phase === 'build'));
    if (!show) {
      syncSignalChrome();
      return;
    }
    if (phase === 'countin') loopButton.textContent = 'START LOOP';
    else if (loopEndArmed) loopButton.textContent = 'SAVING LOOP...';
    else loopButton.textContent = currentLayerIndex >= LAYERS.length - 1 ? 'FINISH TRACK' : 'NEXT LOOP ›';
    // Reset (↻) only while actively building a layer — not during count-in.
    if (resetButton) resetButton.classList.toggle('hidden', phase !== 'build');
    syncSignalChrome();
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
    refreshSignalOutput();
  }
  function tempoBpm() {
    return clamp(Math.round(60000 / (beatMs * 4)), MIN_TEMPO_BPM, MAX_TEMPO_BPM);
  }
  function beatMsForBpm(bpm) {
    return clamp(Math.round(60000 / (clamp(Math.round(bpm || tempoBpm()), MIN_TEMPO_BPM, MAX_TEMPO_BPM) * 4)), 170, 420);
  }
  function tempoBeatMs() {
    return beatMs * 4;
  }
  function setTempoBpm(bpm) {
    beatMs = beatMsForBpm(bpm);
    const label = document.getElementById('signal-tempo-value');
    if (label) label.textContent = `${tempoBpm()} BPM`;
  }
  function previewTempoKick() {
    const t = performance.now();
    if (t - lastTempoPreviewAt < 130) return;
    lastTempoPreviewAt = t;
    tempoPreviewBeatAt = t + tempoBeatMs();
    countKickPulse = 0.9;
    playDrumPiece('kick', 0.65, 0);
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

  function signalOutput() {
    const c = audioCtx();
    if (!c) return null;
    if (signalAudioCtx !== c || !signalMasterGain || !signalLimiter) {
      signalAudioCtx = c;
      signalMasterGain = c.createGain();
      signalLimiter = c.createDynamicsCompressor();
      signalMasterGain.gain.value = SIGNAL_MASTER_GAIN;
      signalLimiter.threshold.value = -8;
      signalLimiter.knee.value = 16;
      signalLimiter.ratio.value = 6;
      signalLimiter.attack.value = 0.003;
      signalLimiter.release.value = 0.12;
      signalMasterGain.connect(signalLimiter);
      signalLimiter.connect(c.destination);
    }
    refreshSignalOutput();
    return signalMasterGain;
  }

  function refreshSignalOutput() {
    if (!signalMasterGain || !signalLimiter) return;
    const d = soundProfile();
    signalMasterGain.gain.value = SIGNAL_MASTER_GAIN * (d.master || 1);
    signalLimiter.threshold.value = -7.2;
    signalLimiter.knee.value = 18;
    signalLimiter.ratio.value = 5.2;
    signalLimiter.attack.value = 0.003;
    signalLimiter.release.value = 0.14;
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
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(g);
    g.connect(signalOutput());
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
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    o.connect(filter);
    filter.connect(g);
    g.connect(signalOutput());
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
      eg.connect(signalOutput());
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
    for (let i = 0; i < len; i++) {
      const attack = Math.min(1, i / Math.max(1, c.sampleRate * 0.006));
      const release = 1 - i / len;
      data[i] = (Math.random() * 2 - 1) * attack * release;
    }
    const src = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const g = c.createGain();
    const t0 = c.currentTime + Math.max(0.006, delay || 0);
    src.buffer = buffer;
    filter.type = highpass ? 'highpass' : 'lowpass';
    filter.frequency.setValueAtTime(highpass ? 3300 : 900, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(signalOutput());
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  }

  // ── Instrument recipes ported from space.js: little acoustic caricatures
  //    built from 2-3 stacked tones with slight detune drift.
  function playDrumPiece(piece, vel, delay, tune) {
    const d = soundProfile();
    const v = (vel == null ? 1 : vel) * d.drumVol;
    const dl = delay || 0;
    // tune 0..1 maps across the pad row: left = lower/tighter, right = higher/opener.
    const tn = tune == null ? 0.5 : clamp(tune, 0, 1);
    if (piece === 'hat') {
      noise(dl, 0.024 + tn * 0.032, 0.020 * v, true);
      synth(5600 + tn * 1300, 'triangle', dl, 0.026 + tn * 0.020, 0.0045 * v, { filter: 'highpass', cutoff: 3600, q: 0.75 });
    } else if (piece === 'tri') {
      const f = 2100 + tn * 900;
      tone(f, 'sine', dl, 0.34, 0.036 * v, f * 1.006);
      tone(f * 2.01, 'sine', dl + 0.006, 0.25, 0.012 * v, f * 2.02);
      tone(520 + tn * 120, 'triangle', dl, 0.11, 0.008 * v, 460 + tn * 90);
    } else if (piece === 'bell') {
      const f = 980 + tn * 420;
      tone(f, 'triangle', dl, 0.30, 0.042 * v, f * 0.998);
      tone(f * 2.42, 'sine', dl + 0.004, 0.22, 0.014 * v, f * 2.44);
      tone(f * 0.5, 'sine', dl + 0.002, 0.16, 0.012 * v, f * 0.48);
    } else if (piece === 'gong') {
      const f = 190 + tn * 80;
      tone(f, 'sine', dl, 0.58, 0.055 * v, f * 0.82);
      tone(f * 1.47, 'triangle', dl + 0.015, 0.48, 0.030 * v, f * 1.20);
      noise(dl + 0.004, 0.09, 0.018 * v, false);
    } else if (piece === 'clave') {
      const f = 980 + tn * 280;
      synth(f, 'triangle', dl, 0.070, 0.026 * v, { filter: 'bandpass', cutoff: f, q: 3.8 });
      tone(f * 0.72, 'sine', dl + 0.003, 0.060, 0.018 * v, f * 0.70);
    } else if (piece === 'guiro') {
      for (let i = 0; i < 4; i++) noise(dl + i * (0.018 + tn * 0.006), 0.022, 0.009 * v, true);
      synth(950 + tn * 560, 'triangle', dl, 0.14, 0.012 * v, { filter: 'bandpass', cutoff: 1050 + tn * 600, q: 3.2 });
    } else if (piece === 'shaker') {
      noise(dl, 0.058 + tn * 0.042, 0.016 * v, true);
      noise(dl + 0.038, 0.030, 0.008 * v, true);
    } else if (piece === 'cabasa') {
      for (let i = 0; i < 5; i++) noise(dl + i * 0.013, 0.018, 0.0065 * v, true);
      synth(2600 + tn * 500, 'triangle', dl, 0.10, 0.006 * v, { filter: 'bandpass', cutoff: 2300 + tn * 450, q: 2.2 });
    } else if (piece === 'tom') {
      const f = 150 + tn * 110;
      tone(f, 'triangle', dl, 0.130, 0.078 * v, f * 0.66);
      tone(f * 1.42, 'sine', dl + 0.004, 0.090, 0.026 * v, f * 1.02);
      noise(dl, 0.026, 0.010 * v, false);
    } else if (piece === 'clap') {
      noise(dl, 0.030, 0.014 * v, true);
      noise(dl + 0.020, 0.040, 0.022 * v, true);
      noise(dl + 0.045, 0.070, 0.012 * v, true);
      tone(220, 'triangle', dl + 0.006, 0.060, 0.014 * v, 160);
    } else if (piece === 'rim') {
      const f = 1450 + tn * 300;
      synth(f, 'triangle', dl, 0.056, 0.022 * v, { filter: 'bandpass', cutoff: f, q: 4.2 });
      tone(f * 0.48, 'sine', dl + 0.003, 0.052, 0.018 * v, f * 0.45);
    } else {
      const f = 82 + tn * 18;
      tone(f, 'sine', dl, 0.145, 0.135 * v, 34 + tn * 8);
      tone(f * 0.52, 'sine', dl + 0.004, 0.18, 0.064 * v, 28);
      noise(dl + 0.001, 0.036, 0.027 * v, false);
    }
  }

  // Slow-attack pad chord for the SWELL layer: a gravity bloom that gets
  // brighter and wider as the player pulls farther from the orb.
  function playSwellChord(note, vel, delay, shape) {
    const c = audioCtx();
    if (!c) return;
    const d = soundProfile();
    const opts = shape || {};
    const v = vel == null ? 1 : vel;
    const f = Math.max(30, note || styleDef().root * 2);
    const openness = clamp(opts.openness == null ? 0.45 : opts.openness, 0, 1);
    const tension = clamp(opts.tension == null ? 0.5 : opts.tension, 0, 1);
    const dur = 1.25 + openness * 0.72;
    const attack = 0.20 + (1 - openness) * 0.24;
    const cutoff = (520 + openness * 1120 + tension * 340) * d.resonance;
    [[1, 0.030], [1.5, 0.018], [2, 0.012], [2.5, 0.006 * tension]].forEach(([m, vol], i) => {
      const t0 = c.currentTime + (delay || 0) + 0.01 + i * 0.035;
      const o = c.createOscillator();
      const filter = c.createBiquadFilter();
      const g = c.createGain();
      o.type = i === 0 ? 'triangle' : 'sine';
      o.frequency.setValueAtTime(f * m * (1 + (tension - 0.5) * 0.002 * i), t0);
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(cutoff + i * 180, t0);
      filter.frequency.exponentialRampToValueAtTime(Math.max(220, cutoff * 0.64), t0 + dur);
      filter.Q.setValueAtTime((0.7 + tension * 0.9) * d.resonance, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.linearRampToValueAtTime(vol * v, t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(filter);
      filter.connect(g);
      g.connect(signalOutput());
      if (i < 2 && openness > 0.35 && d.echo > 0.45) {
        const delayNode = c.createDelay();
        const fb = c.createGain();
        const eg = c.createGain();
        delayNode.delayTime.setValueAtTime(0.18 + tension * 0.08, t0);
        fb.gain.setValueAtTime((0.16 + openness * 0.06) * d.echo, t0);
        eg.gain.setValueAtTime((0.07 + openness * 0.05) * d.echo, t0);
        g.connect(delayNode);
        delayNode.connect(fb);
        fb.connect(delayNode);
        delayNode.connect(eg);
        eg.connect(signalOutput());
      }
      o.start(t0);
      o.stop(t0 + dur + 0.08);
    });
  }

  function fxChoiceForPull(pull) {
    const angle = ((pull.angle + Math.PI * 2.5) % (Math.PI * 2));
    const idx = Math.floor(angle / (Math.PI * 2 / 3)) % 3;
    return activeLayer().options[idx] || activeLayer().options[0];
  }

  function playFxGesture(piece, note, vel, delay, shape) {
    const d = soundProfile();
    const opts = shape || {};
    const v = vel == null ? 1 : vel;
    const dl = delay || 0;
    const f = Math.max(80, note || styleDef().root * 4);
    const intensity = clamp(opts.intensity == null ? 0.55 : opts.intensity, 0, 1);
    const tension = clamp(opts.tension == null ? 0.5 : opts.tension, 0, 1);
    if (piece === 'rise') {
      noise(dl, 0.12 + intensity * 0.10, 0.010 + intensity * 0.014, true);
      synth(f * 0.5, 'triangle', dl + 0.006, 0.34 + intensity * 0.18, 0.026 * v, {
        filter: 'bandpass',
        cutoff: (620 + intensity * 1200) * d.resonance,
        endCutoff: (1800 + intensity * 1700) * d.resonance,
        q: (1.2 + tension * 2.4) * d.resonance,
        endFreq: f * (1.04 + intensity * 0.34),
        echo: d.echo > 0.4,
        echoTime: 0.16,
        echoFeedback: 0.14 * d.echo,
        echoGain: 0.08 * d.echo,
      });
      return;
    }
    if (piece === 'warp') {
      synth(f * (0.76 + tension * 0.18), 'sawtooth', dl, 0.18 + intensity * 0.12, 0.021 * v, {
        cutoff: (760 + intensity * 980) * d.resonance,
        endCutoff: 260 + tension * 320,
        q: 2.6 * d.resonance,
        endFreq: f * (0.52 + intensity * 0.12),
      });
      tone(f * 1.5, 'sine', dl + 0.026, 0.16, 0.010 * v, f * (1.32 - tension * 0.18));
      return;
    }
    synth(f, d.chimeWave || 'triangle', dl, 0.22 + intensity * 0.10, 0.028 * v, {
      filter: 'bandpass',
      cutoff: (1100 + intensity * 1200) * d.resonance,
      q: 2.2 * d.resonance,
      echo: d.echo > 0.35,
      echoTime: 0.18 + tension * 0.08,
      echoFeedback: 0.22 * d.echo,
      echoGain: (0.16 + intensity * 0.06) * d.echo,
    });
    tone(f * 2.01, 'sine', dl + 0.018, 0.14, 0.008 * v, f * 2.04);
  }

  function playPitched(inst, note, vel, delay) {
    const d = soundProfile();
    const v = vel == null ? 1 : vel;
    const dl = delay || 0;
    const f = Math.max(30, note || d.root);
    if (inst === 'bass') {
      const wave = d.bassWave || 'triangle';
      if (wave === 'sawtooth' || wave === 'square') {
        synth(f, wave, dl, 0.26, 0.085 * v * d.bassWeight, { cutoff: 900 * d.resonance, endCutoff: 260, q: 1.4 * d.resonance, endFreq: f * 0.988 });
      } else {
        tone(f, wave, dl, 0.26, 0.085 * v * d.bassWeight, f * 0.988);
      }
      tone(f * 2.01, 'sine', dl + 0.004, 0.11, 0.020 * v * d.bassWeight, f * 1.98);
    } else if (inst === 'keys') {
      // The space.js piano: triangle + sine an octave up, both drifting slightly flat.
      tone(f, d.keysWave || 'triangle', dl, 0.150, 0.070 * v * d.keyGlow, f * 0.992);
      tone(f * 2.01, 'sine', dl + 0.003, 0.065, 0.021 * v * d.keyGlow * d.shimmer, f * 1.99);
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
      const seen = {};
      (o.pieces || [o.piece || 'kick']).forEach((p, i) => {
        const repeat = seen[p] || 0;
        seen[p] = repeat + 1;
        const flam = i * 0.004 + repeat * 0.018;
        playDrumPiece(p, o.vel, (o.delay || 0) + flam, o.tunes ? o.tunes[i] : o.tune);
      });
      return;
    }
    if (inst === 'swell') {
      playSwellChord(o.note, o.vel, o.delay);
      return;
    }
    if (inst === 'fx') {
      playFxGesture(o.piece || 'echo', o.note, o.vel, o.delay);
      return;
    }
    if (Array.isArray(o.notes) && o.notes.length) {
      const seen = {};
      o.notes.slice(0, MAX_PIANO_STACK).forEach((note, i) => {
        const key = Math.round(note || 0);
        const repeat = seen[key] || 0;
        seen[key] = repeat + 1;
        const split = i * 0.012 + repeat * 0.018;
        playPitched(inst, note, (o.vel || 1) * 0.86, (o.delay || 0) + split);
      });
      return;
    }
    playPitched(inst, o.note, o.vel, o.delay);
  }

  function playStamp(slot) {
    if (!slot || !slot.inst) return;
    const vel = (slot.vel || 1) * 0.8;
    if (slot.inst === 'drums') playInstrument('drums', { pieces: slot.pieces, tunes: slot.tunes, vel });
    else if (slot.inst === 'keys' && slot.notes && slot.notes.length) playInstrument(slot.inst, { notes: slot.notes, vel });
    else if (slot.inst === 'fx') playInstrument(slot.inst, { note: slot.note, piece: slot.piece, vel });
    else playInstrument(slot.inst, { note: slot.note, vel });
  }

  function playPulseBed() {
    // The session band behind the player: a quiet high bed in their key
    // and tempo. The player's kick owns the low pulse during the build.
    if (stepIndex % 4 === 2) noise(0.004, 0.024, 0.007, true);
    if (stepIndex === 0) {
      noise(0.004, 0.020, 0.010, true);
    }
  }

  function playBossMotif() {
    [4, 2, 5, 1].forEach((deg, i) => playPitched('chimes', degreeFreq(deg, 4), 0.7, i * 0.08));
  }

  function silenceArcadeMusic() {
    try {
      if (typeof ArcadeMusic !== 'undefined' && typeof ArcadeMusic.stop === 'function') ArcadeMusic.stop();
      else if (typeof ArcadeMusic !== 'undefined' && typeof ArcadeMusic.duck === 'function') ArcadeMusic.duck();
      if (typeof updateArcadeMusicPrompt === 'function') updateArcadeMusicPrompt();
    } catch(e) {}
  }

  function snapshotStyles(el, props) {
    if (!el) return null;
    const out = {};
    props.forEach(p => { out[p] = el.style[p]; });
    return out;
  }

  function restoreStyles(el, snap) {
    if (el && snap) Object.assign(el.style, snap);
  }

  function ensureSignalExitButton() {
    const row = document.querySelector('#pg-signal .signal-loop-row');
    if (!row) return null;
    if (!signalExitButton) {
      signalExitButton = document.createElement('button');
      signalExitButton.id = 'signal-exit-btn';
      signalExitButton.type = 'button';
      signalExitButton.className = 'arcade-exit-btn signal-exit-btn';
      signalExitButton.textContent = '×';
      signalExitButton.title = 'Quit Signal Drift';
      signalExitButton.setAttribute('aria-label', 'Quit Signal Drift');
      signalExitButton.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        try { if (typeof SFX !== 'undefined' && SFX.menuSelect) SFX.menuSelect(); } catch(err) {}
        if (typeof nav === 'function') nav('lobby');
      });
    }
    if (signalExitButton.parentNode !== row) row.appendChild(signalExitButton);
    return signalExitButton;
  }

  function syncSignalChrome() {
    const page = document.getElementById('pg-signal');
    const header = document.querySelector('#pg-signal .cats-header');
    const actions = document.querySelector('#pg-signal .arcade-header-actions');
    const headerBack = document.querySelector('#pg-signal .arcade-exit-btn');
    const row = document.querySelector('#pg-signal .signal-loop-row');
    const inRun = state === 'playing' || state === 'replay';

    if (header) {
      if (!signalHeaderStyles) signalHeaderStyles = snapshotStyles(header, ['display', 'height', 'padding', 'background', 'backdropFilter', 'webkitBackdropFilter', 'alignItems', 'justifyContent', 'gap', 'position', 'zIndex', 'left', 'right', 'top', 'pointerEvents', 'width', 'alignSelf', 'boxSizing', 'flexWrap']);
      header.style.display = inRun ? 'none' : 'flex';
      header.style.height = '46px';
      header.style.padding = '6px 10px';
      header.style.background = 'transparent';
      header.style.backdropFilter = 'none';
      header.style.webkitBackdropFilter = 'none';
      header.style.alignItems = 'center';
      header.style.justifyContent = 'space-between';
      header.style.gap = '8px';
      header.style.flexWrap = 'nowrap';
      header.style.position = inRun ? 'absolute' : 'relative';
      header.style.zIndex = '40';
      header.style.pointerEvents = 'auto';
      header.style.width = '100%';
      header.style.boxSizing = 'border-box';
    }
    if (actions) {
      if (!signalHeaderActionStyles) signalHeaderActionStyles = snapshotStyles(actions, ['display', 'alignItems', 'gap', 'order', 'flexShrink', 'marginLeft', 'marginRight']);
      actions.style.display = 'flex';
      actions.style.alignItems = 'center';
      actions.style.gap = '8px';
      actions.style.order = '0';
      actions.style.flexShrink = '0';
      actions.style.marginLeft = '0';
      actions.style.marginRight = 'auto';
      Array.from(actions.querySelectorAll('button')).forEach(btn => {
        btn.style.height = '32px';
        btn.style.boxSizing = 'border-box';
        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.flexShrink = '0';
      });
    }
    if (headerBack) {
      if (!signalHeaderBackStyles) signalHeaderBackStyles = snapshotStyles(headerBack, ['order', 'marginLeft', 'flexShrink', 'height', 'boxSizing', 'display', 'alignItems', 'justifyContent', 'fontSize', 'letterSpacing', 'padding', 'maxWidth', 'whiteSpace']);
      headerBack.style.order = '1';
      headerBack.style.marginLeft = 'auto';
      headerBack.style.flexShrink = '0';
      headerBack.style.height = '32px';
      headerBack.style.boxSizing = 'border-box';
      headerBack.style.display = 'inline-flex';
      headerBack.style.alignItems = 'center';
      headerBack.style.justifyContent = 'center';
      headerBack.style.fontSize = '9px';
      headerBack.style.letterSpacing = '1px';
      headerBack.style.padding = '0 8px';
      headerBack.style.maxWidth = '164px';
      headerBack.style.whiteSpace = 'nowrap';
    }

    if (!row) return;
    if (!signalLoopRowStyles) signalLoopRowStyles = snapshotStyles(row, ['position', 'zIndex', 'left', 'right', 'top', 'width', 'maxWidth', 'margin', 'display', 'gridTemplateColumns', 'gap', 'alignItems', 'justifyContent', 'boxSizing', 'padding', 'pointerEvents']);
    row.style.display = inRun ? 'grid' : 'none';
    if (!inRun) return;
    const exit = ensureSignalExitButton();
    if (resetButton && loopButton && resetButton.parentNode === row && loopButton.parentNode === row) row.insertBefore(resetButton, loopButton);
    row.style.position = 'absolute';
    row.style.top = 'calc(env(safe-area-inset-top, 0px) + 6px)';
    row.style.left = '8px';
    row.style.right = '8px';
    row.style.width = 'auto';
    row.style.maxWidth = 'none';
    row.style.margin = '0';
    row.style.zIndex = '60';
    row.style.gridTemplateColumns = '56px minmax(0, 1fr) 42px';
    row.style.gap = '8px';
    row.style.alignItems = 'stretch';
    row.style.justifyContent = 'stretch';
    row.style.boxSizing = 'border-box';
    row.style.padding = '0';
    row.style.pointerEvents = 'auto';

    if (loopButton) {
      if (!signalLoopButtonStyles) signalLoopButtonStyles = snapshotStyles(loopButton, ['gridColumn', 'width', 'maxWidth', 'minHeight', 'fontSize', 'letterSpacing', 'padding', 'boxSizing']);
      loopButton.style.gridColumn = '2';
      loopButton.style.width = '100%';
      loopButton.style.maxWidth = 'none';
      loopButton.style.minHeight = '40px';
      loopButton.style.fontSize = '10px';
      loopButton.style.letterSpacing = '2px';
      loopButton.style.padding = '0 8px';
      loopButton.style.boxSizing = 'border-box';
    }
    if (resetButton) {
      if (!signalResetButtonStyles) signalResetButtonStyles = snapshotStyles(resetButton, ['gridColumn', 'width', 'minHeight', 'fontSize', 'boxSizing']);
      resetButton.style.gridColumn = '1';
      resetButton.style.width = '56px';
      resetButton.style.minHeight = '40px';
      resetButton.style.fontSize = '22px';
      resetButton.style.boxSizing = 'border-box';
    }
    if (exit) {
      exit.style.gridColumn = '3';
      exit.style.width = '42px';
      exit.style.minWidth = '42px';
      exit.style.minHeight = '40px';
      exit.style.padding = '0';
      exit.style.fontSize = '20px';
      exit.style.letterSpacing = '0';
      exit.style.borderColor = 'rgba(255,0,204,0.45)';
      exit.style.background = 'rgba(2,4,14,0.88)';
      exit.style.color = '#ff2db8';
      exit.style.boxShadow = '0 0 14px rgba(255,45,184,0.18)';
      exit.style.display = 'inline-flex';
      exit.style.alignItems = 'center';
      exit.style.justifyContent = 'center';
    }
  }

  function applySignalShell() {
    if (signalShellApplied) return;
    const page = document.getElementById('pg-signal');
    if (page) {
      signalPageStyles = { overflow: page.style.overflow, touchAction: page.style.touchAction, justifyContent: page.style.justifyContent };
      page.style.overflow = 'hidden';
      page.style.touchAction = 'none';
      page.style.justifyContent = 'flex-start';
    }
    if (canvas) {
      signalCanvasStyles = { touchAction: canvas.style.touchAction };
      canvas.style.touchAction = 'none';
    }
    syncSignalChrome();
    gestureGuardHandler = e => {
      if (!document.body.classList.contains('on-signal')) return;
      if (e.touches && e.touches.length > 1) e.preventDefault();
    };
    gestureStartHandler = e => {
      if (document.body.classList.contains('on-signal')) e.preventDefault();
    };
    document.addEventListener('touchmove', gestureGuardHandler, { passive: false });
    document.addEventListener('gesturestart', gestureStartHandler, { passive: false });
    signalShellApplied = true;
  }

  function restoreSignalShell() {
    const page = document.getElementById('pg-signal');
    const header = document.querySelector('#pg-signal .cats-header');
    const actions = document.querySelector('#pg-signal .arcade-header-actions');
    const headerBack = document.querySelector('#pg-signal .arcade-exit-btn');
    const row = document.querySelector('#pg-signal .signal-loop-row');
    if (page && signalPageStyles) {
      Object.assign(page.style, signalPageStyles);
      signalPageStyles = null;
    }
    if (canvas && signalCanvasStyles) {
      Object.assign(canvas.style, signalCanvasStyles);
      signalCanvasStyles = null;
    }
    restoreStyles(header, signalHeaderStyles);
    restoreStyles(actions, signalHeaderActionStyles);
    restoreStyles(headerBack, signalHeaderBackStyles);
    restoreStyles(row, signalLoopRowStyles);
    restoreStyles(loopButton, signalLoopButtonStyles);
    restoreStyles(resetButton, signalResetButtonStyles);
    signalHeaderStyles = null;
    signalHeaderActionStyles = null;
    signalHeaderBackStyles = null;
    signalLoopRowStyles = null;
    signalLoopButtonStyles = null;
    signalResetButtonStyles = null;
    if (signalExitButton) {
      signalExitButton.remove();
      signalExitButton = null;
    }
    if (gestureGuardHandler) {
      document.removeEventListener('touchmove', gestureGuardHandler);
      gestureGuardHandler = null;
    }
    if (gestureStartHandler) {
      document.removeEventListener('gesturestart', gestureStartHandler);
      gestureStartHandler = null;
    }
    signalShellApplied = false;
  }

  function fitCanvas() {
    if (!canvas) return;
    const vv = window.visualViewport;
    const availW = (vv && vv.width) || window.innerWidth || document.documentElement.clientWidth || 360;
    const safeTop = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sat') || '0') || 0;
    const safeBottom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sab') || '0') || 0;
    const availH = ((vv && vv.height) || window.innerHeight || document.documentElement.clientHeight || 640) - safeTop - safeBottom;
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
    loopFlash = Array.from({ length: LOOP_STEPS }, () => ({ pulse: 0, color: COLOR, row: 0 }));
    elapsed = 0;
    spawnAt = 0;
    manualFireAt = 0;
    beatAt = 0;
    stepIndex = 0;
    lastLoopStep = -1;
    loopEndArmed = false;
    phase = 'countin';
    countKickPulse = 0;
    countLockedText = '';
    tempoPreviewBeatAt = 0;
    lastTempoPreviewAt = 0;
    padSpawnAt = 0;
    initPads();
    loop = Array.from({ length: LOOP_STEPS }, () => []);
    initStars();
  }

  function initPads() {
    pads = [];
    PAD_ROWS.forEach((rowDef, row) => {
      for (let col = 0; col < PAD_COLS; col++) {
        const cell = rowDef.cells[col] || rowDef.cells[rowDef.cells.length - 1];
        pads.push({ row, col, piece: cell.piece, label: cell.label, color: cell.color, lane: rowDef.lane, lit: 0, flash: 0 });
      }
    });
  }

  function drumsActive() {
    return state === 'playing' && phase === 'build' && activeLayer().inst === 'drums';
  }

  // Which orb-driven layer is live: chimes, swell, final FX, or null.
  function orbLayerInst() {
    if (state !== 'playing' || phase !== 'build') return null;
    const inst = activeLayer().inst;
    return inst === 'chimes' || inst === 'swell' || inst === 'fx' ? inst : null;
  }

  function chimesActive() {
    return !!orbLayerInst();
  }

  function rockTapActive() {
    if (state !== 'playing' || phase !== 'build') return false;
    const inst = activeLayer().inst;
    return inst === 'bass' || inst === 'keys';
  }

  function asteroidSurfaceActive() {
    return rockTapActive();
  }

  function thereminCenter() {
    return { x: W / 2, y: (H - LOOP_PANEL_H) * 0.52, maxR: Math.min(W, H - LOOP_PANEL_H) * 0.44 };
  }

  function orbPullState() {
    const tc = thereminCenter();
    const dx = pointerX - tc.x;
    const dy = pointerY - tc.y;
    const dist = clamp(Math.hypot(dx, dy) / tc.maxR, 0, 1);
    const angle = Math.atan2(dy, dx);
    const deg = Math.round((dist - 0.12) / 0.88 * 9);
    const shimmer = 0.5 + 0.5 * Math.sin(angle * 2);
    return { ...tc, dist, angle, deg: clamp(deg, 0, 9), shimmer };
  }

  function padRect(row, col) {
    const left = 38, right = 16, top = 146;
    const bottom = H - LOOP_PANEL_H - 8;
    const colGap = 10, rowGap = 12;
    const gw = (W - left - right - (PAD_COLS - 1) * colGap) / PAD_COLS;
    const gh = (bottom - top - 2 * rowGap) / 3;
    return { x: left + col * (gw + colGap), y: top + row * (gh + rowGap), w: gw, h: gh };
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

  function makeAsteroidRock(layer, option, lane, deg, x, y, r, role) {
    return {
      inst: layer.inst,
      label: layer.inst === 'drums' ? option.label : noteNameForDegree(deg),
      color: option.color,
      lane,
      deg,
      x,
      y,
      baseX: x,
      baseY: y,
      r,
      vx: 0,
      vy: 0,
      spin: role === 'bass-anchor' ? rand(-0.45, 0.45) : rand(-0.75, 0.75),
      rot: rand(0, Math.PI * 2),
      surface: true,
      role,
      rangeLabel: option.label,
      driftSeed: rand(0, Math.PI * 2),
      pulse: 0,
    };
  }

  function initAsteroidSurface() {
    const layer = activeLayer();
    if (layer.inst !== 'bass' && layer.inst !== 'keys') return;
    rocks = [];
    bullets = [];
    const top = 142;
    const bottom = Math.max(top + 120, H - LOOP_PANEL_H - 78);
    const spanY = bottom - top;
    if (layer.inst === 'bass') {
      layer.options.forEach((option, lane) => {
        const degLo = option.degLo || 0;
        const degHi = option.degHi == null ? degLo : option.degHi;
        const deg = Math.round((degLo + degHi) / 2);
        const x = laneCenter(lane);
        const y = top + spanY * (0.52 + (lane - 1) * 0.10);
        const r = [34, 30, 26][lane] || 28;
        rocks.push(makeAsteroidRock(layer, option, lane, deg, x, y, r, 'bass-anchor'));
      });
      return;
    }

    layer.options.forEach((option, lane) => {
      const degLo = option.degLo || 0;
      const degHi = option.degHi == null ? degLo : option.degHi;
      const count = Math.max(3, degHi - degLo + 1);
      const beltY = top + spanY * (0.18 + lane * 0.31);
      for (let i = 0; i < count; i++) {
        const deg = degLo + Math.min(degHi - degLo, i);
        const pitchT = count <= 1 ? 0 : i / (count - 1);
        const x = (W * (i + 1)) / (count + 1);
        const y = beltY + Math.sin((i / Math.max(1, count - 1)) * Math.PI) * 16;
        const r = 27 - pitchT * 8;
        rocks.push(makeAsteroidRock(layer, option, lane, deg, x, y, r, 'keys-belt'));
      }
    });
  }

  function rocksOverlap(a, b, margin) {
    if (!a || !b) return false;
    const minDist = (a.r || 0) + (b.r || 0) + (margin == null ? 8 : margin);
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return dx * dx + dy * dy < minDist * minDist;
  }

  function findRockSpawnPosition(rock, forceLane) {
    for (let tries = 0; tries < 28; tries++) {
      const lane = rock.lane;
      const lw = laneWidth();
      const x = clamp(laneCenter(lane) + rand(-lw * 0.24, lw * 0.24), rock.r + 8, W - rock.r - 8);
      const y = -rock.r - rand(0, 96) - tries * 6;
      const candidate = { ...rock, lane, x, y };
      if (!rocks.some(r => rocksOverlap(candidate, r, 10))) return candidate;
    }
    return null;
  }

  function spawnRock(forceLane) {
    if (rocks.length >= MAX_ROCKS) rocks.splice(0, rocks.length - MAX_ROCKS + 1);
    const lane = Number.isFinite(forceLane) ? clamp(Math.floor(forceLane), 0, LANES.length - 1) : Math.floor(Math.random() * LANES.length);
    const option = LANES[lane];
    const layer = activeLayer();
    const rock = {
      inst: layer.inst,
      label: option.label,
      color: option.color,
      lane,
      vx: rand(-10, 10),
      vy: rand(31, 49) + elapsed * 0.0016,
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
      if (layer.inst === 'keys') {
        const span = Math.max(1, degHi - degLo);
        const pitchT = clamp((rock.deg - degLo) / span, 0, 1);
        rock.r = 26 - pitchT * 8 + rand(-1.2, 1.2);
      } else {
        rock.r = 22 - rock.deg * 0.9 + rand(-2, 3);
      }
    }
    const placed = findRockSpawnPosition(rock, forceLane);
    if (placed) rocks.push(placed);
    return placed;
  }

  function ensureBoss() {
    return;
  }

  function hitBoss() {
    return;
  }

  function shoot() {
    // Dormant build-era shooter path, reserved for a future boss-duet finale.
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
      playDrumPiece('kick', 0.45, 0);
      countKickPulse = 0.8;
      manualFireAt = t + 160;
      return;
    }
    if (drumsActive()) {
      if (pos && whackPad(pos, t)) manualFireAt = t + 58;
      else manualFireAt = t + 18;
      return;
    }
    if (rockTapActive()) {
      if (pos) tapRock(pos);
      manualFireAt = t + 78;
      return;
    }
    shoot();
    manualFireAt = t + 125;
  }

  function whackPad(pos, t) {
    const pad = padAt(pos.x, pos.y);
    if (!pad) return false;
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
    return true;
  }

  function seedFoundationKicks() {
    for (let step = 0; step < LOOP_STEPS; step += 4) {
      if (loop[step].some(v => v.foundation)) continue;
      loop[step].push({ layerId: 'drums', layerIndex: 0, inst: 'drums', pieces: ['kick'], tunes: [0.3], color: '#00e5ff', label: 'KICK', tight: true, vel: 0.85, skip: 0, foundation: true });
      recordedChoices.push({ step, layerIndex: 0, layerId: 'drums', layerName: 'DRUMS', inst: 'drums', note: null, piece: 'kick', lane: 0, label: 'KICK', color: '#00e5ff', tight: true, foundation: true });
      additionsThisLayer += 1;
      totalAdditions += 1;
    }
  }

  function startBuildPhase(t) {
    phase = 'build';
    stepIndex = 0;
    lastLoopStep = 0;
    beatAt = t + beatMs;
    spawnAt = t + 600;
    countKickPulse = 0;
    if (asteroidSurfaceActive()) initAsteroidSurface();
    updateLoopButton();
    showLayerToast();
  }

  function skipCountIn() {
    if (phase !== 'countin' || state !== 'playing') return;
    seedFoundationKicks();
    countLockedText = `TEMPO SET · ${tempoBpm()} BPM`;
    if (overlay) overlay.classList.add('hidden');
    const t = performance.now();
    startBuildPhase(t);
    addFloatText(countLockedText, W * 0.5, H * 0.34, '#ffe61a');
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
        slot.pieces = slot.pieces || [];
        slot.tunes = slot.tunes || slot.pieces.map(() => 0.5);
        slot.pieces.push(rock.piece);
        slot.tunes.push(tune);
        while (slot.pieces.length > MAX_DRUM_STACK) {
          slot.pieces.shift();
          slot.tunes.shift();
        }
        slot.color = rock.color;
        slot.label = rock.label;
        slot.tight = slot.tight && tight;
        slot.vel = Math.max(slot.vel, vel);
        slot.skip = isNextStep ? 1 : 0;
      } else {
        slot = { layerId: layer.id, layerIndex: currentLayerIndex, inst: 'drums', pieces: [rock.piece], tunes: [tune], color: rock.color, label: rock.label, tight, vel, skip: isNextStep ? 1 : 0 };
        bucket.push(slot);
      }
    } else if (layer.inst === 'keys') {
      const label = rock.label || noteNameForDegree(rock.deg || 0);
      if (slot) {
        slot.notes = slot.notes || (slot.note ? [slot.note] : []);
        slot.labels = slot.labels || (slot.label ? [slot.label] : []);
        slot.notes.push(note);
        slot.labels.push(label);
        while (slot.notes.length > MAX_PIANO_STACK) {
          slot.notes.shift();
          slot.labels.shift();
        }
        slot.note = slot.notes[slot.notes.length - 1];
        slot.label = slot.labels[slot.labels.length - 1] || label;
        slot.color = rock.color;
        slot.tight = slot.tight && tight;
        slot.vel = Math.max(slot.vel, vel);
        slot.skip = isNextStep ? 1 : 0;
      } else {
        slot = { layerId: layer.id, layerIndex: currentLayerIndex, inst: layer.inst, note, notes: [note], label, labels: [label], color: rock.color, tight, vel, skip: isNextStep ? 1 : 0 };
        bucket.push(slot);
      }
    } else {
      const stamp = { layerId: layer.id, layerIndex: currentLayerIndex, inst: layer.inst, note, piece: rock.piece || null, color: rock.color, label: rock.label, lane: rock.lane, tight, vel, skip: isNextStep ? 1 : 0 };
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
    if (loopFlash[target]) loopFlash[target] = { pulse: 1, color: rock.color || COLOR, row: currentLayerIndex };
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
    if (asteroidSurfaceActive()) initAsteroidSurface();
    laneFlash = [1, 1, 1];
    if (restartPlayback !== false) restartLoopPlayback();
    updateLoopButton();
    showLayerToast();
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
    if (asteroidSurfaceActive()) initAsteroidSurface();
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
    showLayerToast();
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

  function layerHintText() {
    if (phase === 'countin') return 'SET TEMPO';
    if (drumsActive()) return 'TAP DRUM PADS';
    if (rockTapActive()) return 'TAP THE ROCKS';
    const orb = orbLayerInst();
    if (orb === 'fx') return 'HOLD + SHAPE FX';
    if (orb === 'swell') return 'HOLD + PULL';
    if (orb === 'chimes') return 'HOLD + PULL';
    return '';
  }

  function showLayerToast() {
    const layer = activeLayer();
    const hint = layerHintText();
    addFloatText(hint ? `${layer.name} · ${hint}` : layer.name, W * 0.5, 132, layer.options[0].color || COLOR, 1800);
  }

  function addFloatText(text, x, y, color, life) {
    if (!floatTexts) floatTexts = [];
    floatTexts.push({ text, x, y, color, age: 0, life: life || 850 });
    if (floatTexts.length > 12) floatTexts.shift();
  }

  function separateRocks() {
    if (!rocks || rocks.length < 2) return;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < rocks.length; i++) {
        for (let j = i + 1; j < rocks.length; j++) {
          const a = rocks[i], b = rocks[j];
          const minDist = a.r + b.r + 8;
          let dx = b.x - a.x;
          let dy = b.y - a.y;
          let dist = Math.hypot(dx, dy);
          if (dist >= minDist) continue;
          if (dist < 0.001) {
            dx = (b.lane - a.lane) || 1;
            dy = 0.5;
            dist = Math.hypot(dx, dy);
          }
          const nx = dx / dist;
          const ny = dy / dist;
          const push = (minDist - dist) * 0.5;
          a.x = clamp(a.x - nx * push, a.r + 6, W - a.r - 6);
          b.x = clamp(b.x + nx * push, b.r + 6, W - b.r - 6);
          a.y -= ny * push;
          b.y += ny * push;
          const vxPush = nx * Math.min(18, push * 4);
          a.vx -= vxPush;
          b.vx += vxPush;
        }
      }
    }
  }

  function updateAsteroidSurface(dt, t) {
    if (!asteroidSurfaceActive()) return;
    if (!rocks || !rocks.length) initAsteroidSurface();
    rocks.forEach((r, i) => {
      const time = t * 0.001;
      const amp = r.role === 'bass-anchor' ? 4 : 7;
      r.x = clamp(r.baseX + Math.sin(time * 0.62 + r.driftSeed) * amp, r.r + 8, W - r.r - 8);
      r.y = r.baseY + Math.cos(time * 0.48 + r.driftSeed + i) * (amp * 0.55);
      r.rot += r.spin * dt / 1000;
      r.pulse = Math.max(0, (r.pulse || 0) - dt / 220);
    });
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
    const note = rock.inst === 'drums' ? null : degreeFreq(rock.deg, activeLayer().mult);
    if (rock.inst !== 'drums') rock.label = noteNameForDegree(rock.deg);
    playInstrument(rock.inst, { note, piece: rock.piece, vel: 1 });
    stampNote(rock, target, note, tight, isNextStep);
    rock.pulse = 1;
    burst(rock.x, rock.y, rock.color, tight ? 8 : 4);
    combo = tight ? combo + 1 : 0;
    bestCombo = Math.max(bestCombo, combo);
    score += tight ? 4 + combo : 1;
    signal = clamp(signal + (tight ? 1.3 : 0.3), 0, 100);
    distortion = clamp(distortion + (tight ? -0.8 : 2.2), 0, 100);

    score += tight ? 24 : 8;
    burst(rock.x, rock.y, rock.color, 12);
    return true;
  }

  function tapRock(pos) {
    let best = null;
    let bestScore = Infinity;
    rocks.forEach((rock, index) => {
      const hitR = rock.r + 14;
      const dist = Math.hypot(rock.x - pos.x, rock.y - pos.y);
      if (dist <= hitR && dist - hitR < bestScore) {
        best = { rock, index };
        bestScore = dist - hitR;
      }
    });
    if (!best) return false;
    if (hitRock(best.rock) && !best.rock.surface) rocks.splice(best.index, 1);
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
    // Orb drift (chimes theremin / swell pads): while the player holds and
    // pulls from the center, distance picks the scale degree and the density.
    const orbInst = pointerActive ? orbLayerInst() : null;
    if (orbInst) {
      const pull = orbPullState();
      if (pull.dist > 0.12) {
        const isSwell = orbInst === 'swell';
        const isFx = orbInst === 'fx';
        const every = isFx ? (pull.dist > 0.72 ? 6 : 12) : isSwell ? (pull.dist > 0.76 ? 3 : 6) : (pull.dist > 0.7 ? 1 : pull.dist > 0.4 ? 2 : 4);
        if (stepIndex % every === 0) {
          const note = degreeFreq(pull.deg, activeLayer().mult);
          if (isFx) {
            const fx = fxChoiceForPull(pull);
            playFxGesture(fx.piece, note, 0.52 + pull.dist * 0.36, 0, { intensity: pull.dist, tension: pull.shimmer });
            const existing = loop[stepIndex].find(v => v.layerId === activeLayer().id);
            if (!existing || existing.note !== note || existing.piece !== fx.piece) {
              stampNote({ ...fx, lane: activeLayer().options.indexOf(fx) }, stepIndex, note, true, false);
            }
            thereminPulse = 0.95 + pull.dist * 0.35;
          } else if (isSwell) playSwellChord(note, 0.34 + pull.dist * 0.52, 0, { openness: pull.dist, tension: pull.shimmer });
          else {
            playPitched('chimes', note, 0.55 + pull.dist * 0.45, 0);
            tone(note * (2.01 + pull.shimmer * 0.5), 'sine', 0.018, 0.070, 0.006 + pull.shimmer * 0.009, note * (2.03 + pull.shimmer * 0.5));
            if (pull.shimmer > 0.72) tone(note * 3.02, 'sine', 0.038, 0.045, 0.0045 * pull.shimmer, note * 3.04);
          }
          if (!isFx) {
            // Only re-stamp when the note at this step actually changes,
            // so a held position doesn't flood the capture log.
            const existing = loop[stepIndex].find(v => v.layerId === activeLayer().id);
            if (!existing || existing.note !== note) {
              stampNote({ lane: 1, label: noteNameForDegree(pull.deg), color: isSwell ? '#ffe61a' : '#ff2db8' }, stepIndex, note, true, false);
            }
            thereminPulse = isSwell ? 1 : 0.75 + pull.shimmer * 0.35;
          }
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
      // Tempo preview: an audible kick floor before the run starts.
      if (!tempoPreviewBeatAt) tempoPreviewBeatAt = t + 180;
      if (t >= tempoPreviewBeatAt) {
        playDrumPiece('kick', 0.72, 0);
        countKickPulse = 1;
        tempoPreviewBeatAt += tempoBeatMs();
        if (t - tempoPreviewBeatAt > tempoBeatMs() * 2) tempoPreviewBeatAt = t + tempoBeatMs();
      }
      for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 360);
      loopFlash.forEach(f => { f.pulse = Math.max(0, f.pulse - dt / 260); });
      countKickPulse = Math.max(0, countKickPulse - dt / 240);
      stars.forEach(s => {
        s.y += s.vy * dt / 1000;
        if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
      });
      if (floatTexts) {
        floatTexts.forEach(f => { f.age += dt; f.y -= 28 * dt / 1000; });
        floatTexts = floatTexts.filter(f => f.age < f.life);
      }
      return;
    }
    tickBeat(t);
    if (drumsActive()) {
      for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 360);
      loopFlash.forEach(f => { f.pulse = Math.max(0, f.pulse - dt / 260); });
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
      loopFlash.forEach(f => { f.pulse = Math.max(0, f.pulse - dt / 300); });
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
      loopFlash.forEach(f => { f.pulse = Math.max(0, f.pulse - dt / 320); });
      stars.forEach(s => {
        s.y += s.vy * dt / 1000;
        if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
      });
      if (t >= replayUntil) showBuiltChoice();
      return;
    }
    ensureBoss();
    for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 360);
    loopFlash.forEach(f => { f.pulse = Math.max(0, f.pulse - dt / 260); });

    const directTapLayer = rockTapActive();
    const move = (leftHeld ? -1 : 0) + (rightHeld ? 1 : 0);
    if (!directTapLayer) {
      if (pointerActive) player.x += (pointerX - player.x) * Math.min(1, dt / 100);
      else player.x += move * 260 * dt / 1000;
      player.x = clamp(player.x, 24, W - 24);
    }

    if (asteroidSurfaceActive()) {
      updateAsteroidSurface(dt, t);
    } else if (t >= spawnAt) {
      spawnRock();
      if (activeLayer().inst === 'keys' && Math.random() < 0.28) spawnRock();
      const isKeys = activeLayer().inst === 'keys';
      const cadence = isKeys
        ? clamp(760 - elapsed * 0.0022, 420, 760)
        : clamp(1080 - elapsed * 0.0025, 560, 1080);
      spawnAt = t + cadence;
    }

    if (boss) {
      boss.phase += dt / 1000;
      boss.x = W * 0.5 + Math.sin(boss.phase * 1.3) * W * 0.22;
      if (t >= boss.nextSpawn) {
        const spawned = spawnRock(currentSoloLane);
        if (spawned) {
          spawned.x = clamp(spawned.x, spawned.r + 8, W - spawned.r - 8);
          spawned.vy += 24;
        }
        boss.nextSpawn = t + 1150;
      }
    }

    stars.forEach(s => {
      s.y += s.vy * dt / 1000;
      if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
    });

    if (!directTapLayer) {
      bullets.forEach(b => { b.y += b.vy * dt / 1000; });
      bullets = bullets.filter(b => b.y > -20);
    } else {
      bullets = [];
    }

    if (boss && !directTapLayer) {
      for (let j = bullets.length - 1; j >= 0; j--) {
        const b = bullets[j];
        const dx = boss.x - b.x, dy = boss.y - b.y;
        if (dx * dx + dy * dy <= (boss.r + b.r) * (boss.r + b.r)) {
          bullets.splice(j, 1);
          hitBoss();
        }
      }
    }

    if (!asteroidSurfaceActive()) {
      rocks.forEach(r => {
        r.x += r.vx * dt / 1000;
        r.y += r.vy * dt / 1000;
        r.rot += r.spin * dt / 1000;
        if (r.x < r.r || r.x > W - r.r) r.vx *= -1;
      });
      separateRocks();
    }

    for (let i = rocks.length - 1; i >= 0; i--) {
      const r = rocks[i];
      if (!directTapLayer) {
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
    }

    if (!asteroidSurfaceActive()) {
      for (let i = rocks.length - 1; i >= 0; i--) {
        const r = rocks[i];
        const dx = r.x - player.x, dy = r.y - player.y;
        if (!directTapLayer && dx * dx + dy * dy <= (r.r + player.r) * (r.r + player.r)) {
          rocks.splice(i, 1);
          playerDamage(1);
        } else if (r.y - r.r > H - LOOP_PANEL_H) {
          rocks.splice(i, 1);
          if (Math.random() < 0.18) addFloatText('REST', clamp(r.x, 28, W - 28), H - LOOP_PANEL_H - 30, 'rgba(234,255,255,0.58)');
        }
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
    c.shadowBlur = 14 + (r.pulse || 0) * 22;
    c.fillStyle = r.inst === 'bass' ? '#2c2608' : r.inst === 'keys' ? '#26061e' : r.inst === 'chimes' ? '#1c0a26' : '#062432';
    c.strokeStyle = r.color;
    c.lineWidth = 2 + (r.pulse || 0) * 1.5;
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
    c.restore();
  }

  function drawAsteroidSurface(c) {
    if (!asteroidSurfaceActive()) return;
    const layer = activeLayer();
    c.save();
    if (layer.inst === 'keys') {
      for (let lane = 0; lane < LANES.length; lane++) {
        const laneRocks = rocks.filter(r => r.lane === lane);
        if (!laneRocks.length) continue;
        const y = laneRocks.reduce((sum, r) => sum + r.baseY, 0) / laneRocks.length;
        const color = LANES[lane].color;
        c.strokeStyle = color;
        c.globalAlpha = 0.18 + laneFlash[lane] * 0.16;
        c.lineWidth = 2;
        c.beginPath();
        laneRocks.forEach((r, i) => {
          const yy = y + Math.sin(i / Math.max(1, laneRocks.length - 1) * Math.PI) * 16;
          if (i === 0) c.moveTo(r.baseX, yy); else c.lineTo(r.baseX, yy);
        });
        c.stroke();
        c.globalAlpha = 0.72;
        c.fillStyle = color;
        c.font = "8px 'VCR', monospace";
        c.textAlign = 'left';
        c.fillText(LANES[lane].label, 12, y - 18);
      }
    } else if (layer.inst === 'bass') {
      c.strokeStyle = 'rgba(255,230,26,0.18)';
      c.lineWidth = 2;
      c.beginPath();
      rocks.forEach((r, i) => {
        if (i === 0) c.moveTo(r.baseX, r.baseY);
        else c.lineTo(r.baseX, r.baseY);
      });
      c.stroke();
      rocks.forEach(r => {
        c.globalAlpha = 0.18 + (r.pulse || 0) * 0.16;
        c.strokeStyle = r.color;
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(r.baseX, r.baseY, r.r + 13 + (r.pulse || 0) * 9, 0, Math.PI * 2);
        c.stroke();
        c.globalAlpha = 0.82;
        c.fillStyle = r.color;
        c.font = "8px 'VCR', monospace";
        c.textAlign = 'center';
        c.fillText(r.rangeLabel || LANES[r.lane].label, r.baseX, r.baseY + r.r + 20);
      });
    }
    c.restore();
    rocks.forEach(r => drawRock(c, r));
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
    c.save();
    c.font = "8px 'VCR', monospace";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    PAD_ROWS.forEach((rowDef, row) => {
      const r0 = padRect(row, 0);
      c.fillStyle = rowDef.cells[0].color;
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
      c.fillStyle = pad.color;
      c.globalAlpha = 0.10 + pad.flash * 0.34;
      c.fillRect(r.x, r.y, r.w, r.h);
      c.strokeStyle = pad.color;
      c.lineWidth = lit ? 2 : 1;
      c.globalAlpha = 0.34 + pad.flash * 0.62;
      c.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
      const cr = pad.piece === 'kick' || pad.piece === 'gong' ? 8 : pad.piece === 'tom' || pad.piece === 'clap' ? 6.5 : 5;
      c.globalAlpha = 0.42 + pad.flash * 0.48;
      c.beginPath();
      c.arc(r.x + r.w / 2, r.y + r.h / 2, cr + pad.flash * 4, 0, Math.PI * 2);
      if (pad.piece === 'hat' || pad.piece === 'tri' || pad.piece === 'guiro' || pad.piece === 'shaker' || pad.piece === 'cabasa') c.stroke(); else c.fill();
      c.globalAlpha = 0.62 + pad.flash * 0.28;
      c.fillStyle = pad.color;
      c.font = "14px 'VCR', monospace";
      c.fillText(pad.label, r.x + r.w / 2, r.y + r.h - 16);
    });
    c.globalAlpha = 1;
    c.restore();
  }

  function drawTheremin(c) {
    const t = now();
    const tc = thereminCenter();
    const orbInst = orbLayerInst();
    const isSwell = orbInst === 'swell';
    const isFx = orbInst === 'fx';
    const pull = pointerActive ? orbPullState() : null;
    // Chimes orb: sharp pink rings, quick shimmer. Swell orb: gold dashed
    // rings breathing slowly — you can tell which instrument you're holding.
    const col = isFx ? '#7bffea' : isSwell ? '#ffe61a' : '#ff2db8';
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
    if (!isSwell) {
      for (let i = 0; i < 8; i += 1) {
        const a = -Math.PI / 2 + i / 8 * Math.PI * 2;
        const orbitR = tc.maxR * (i % 2 ? 0.82 : 0.62);
        const delta = pull ? Math.abs(Math.atan2(Math.sin(pull.angle - a), Math.cos(pull.angle - a))) : Math.PI;
        const active = pull && delta < 0.42;
        c.globalAlpha = active ? 0.72 : 0.20;
        c.fillStyle = active ? '#eaffff' : col;
        c.beginPath();
        c.arc(tc.x + Math.cos(a) * orbitR, tc.y + Math.sin(a) * orbitR, active ? 3.8 : 2, 0, Math.PI * 2);
        c.fill();
      }
    }
    if (isFx) {
      activeLayer().options.forEach((fx, i) => {
        const a = -Math.PI / 2 + i / 3 * Math.PI * 2;
        const chosen = pull && fxChoiceForPull(pull).piece === fx.piece;
        c.globalAlpha = chosen ? 0.82 : 0.34;
        c.fillStyle = chosen ? fx.color : 'rgba(234,255,255,0.55)';
        c.font = "8px 'VCR', monospace";
        c.textAlign = 'center';
        c.fillText(fx.label, tc.x + Math.cos(a) * tc.maxR * 0.72, tc.y + Math.sin(a) * tc.maxR * 0.72);
      });
    }
    // The orb
    c.shadowColor = col;
    c.shadowBlur = (isSwell ? 26 : 18) + thereminPulse * 22;
    c.globalAlpha = 0.75 + thereminPulse * 0.25;
    c.fillStyle = col;
    c.beginPath();
    c.arc(tc.x, tc.y, (isSwell ? 13 : 10) + thereminPulse * 6 + breathe, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    if (pull) {
      const dist = pull.dist;
      c.globalAlpha = 0.55;
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(tc.x, tc.y);
      c.lineTo(pointerX, pointerY);
      c.stroke();
      if (!isSwell && !isFx) {
        c.globalAlpha = 0.18 + pull.shimmer * 0.34;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(tc.x, tc.y, tc.maxR * (0.42 + pull.shimmer * 0.20), pull.angle - 0.42, pull.angle + 0.42);
        c.stroke();
        c.globalAlpha = 0.45 + pull.shimmer * 0.25;
        c.beginPath();
        c.arc(tc.x + Math.cos(pull.angle) * tc.maxR * 0.28, tc.y + Math.sin(pull.angle) * tc.maxR * 0.28, 3 + pull.shimmer * 3, 0, Math.PI * 2);
        c.fill();
      } else if (isSwell) {
        c.setLineDash([10, 8]);
        for (let i = 0; i < 3; i += 1) {
          c.globalAlpha = 0.10 + pull.dist * 0.16 - i * 0.025;
          c.lineWidth = 2 + i;
          c.beginPath();
          c.arc(tc.x, tc.y, tc.maxR * (0.26 + pull.dist * 0.18 + i * 0.16) + breathe, pull.angle - 1.05, pull.angle + 1.05);
          c.stroke();
        }
        c.setLineDash([]);
        c.globalAlpha = 0.20 + pull.dist * 0.30;
        c.lineWidth = 1.5;
        c.beginPath();
        c.arc(pointerX, pointerY, 14 + pull.dist * 16, 0, Math.PI * 2);
        c.stroke();
      } else if (isFx) {
        const fx = fxChoiceForPull(pull);
        c.globalAlpha = 0.24 + pull.dist * 0.30;
        c.strokeStyle = fx.color;
        c.lineWidth = 2;
        c.beginPath();
        c.arc(tc.x, tc.y, tc.maxR * (0.34 + pull.dist * 0.44), pull.angle - 0.28, pull.angle + 0.28);
        c.stroke();
        c.globalAlpha = 0.20 + pull.dist * 0.28;
        c.beginPath();
        c.arc(pointerX, pointerY, 12 + pull.dist * 18, 0, Math.PI * 2);
        c.stroke();
      }
      c.globalAlpha = 0.9;
      c.beginPath();
      c.arc(pointerX, pointerY, 6 + dist * 4, 0, Math.PI * 2);
      c.fill();
      if (dist > 0.12) {
        c.font = "9px 'VCR', monospace";
        c.textAlign = 'center';
        c.fillStyle = '#eaffff';
        c.fillText(isFx ? fxChoiceForPull(pull).label : noteNameForDegree(pull.deg), pointerX, pointerY - 16);
      }
    } else {
      c.globalAlpha = 0.6;
      c.fillStyle = 'rgba(234,255,255,0.7)';
      c.font = "9px 'VCR', monospace";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(isFx ? 'HOLD + SHAPE FX' : isSwell ? 'HOLD + PULL — SLOW WAVES' : 'HOLD + PULL', tc.x, tc.y + tc.maxR * 0.55);
    }
    c.restore();
    c.globalAlpha = 1;
  }

  function drawLanes(c) {
    const lw = laneWidth();
    const baseY = H - LOOP_PANEL_H - 30;
    const selected = rockTapActive() ? -1 : laneIndexForX(player.x);
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
    if (state === 'playing' || state === 'replay') {
      const titleY = 58;
      c.fillStyle = 'rgba(234,255,255,0.78)';
      c.fillText(state === 'replay' ? 'REPLAY' : activeLayerLabel(), 12, titleY);
      c.textAlign = 'right';
      c.fillText(String(score), W - 12, titleY);
    }
    c.textAlign = 'left';
    // Loop rows live up top now, right under the layer title.
    if (state === 'playing' || state === 'replay') {
      const loopX = 26, loopY = 72;
      const rowH = 7, rowGap = 4;
      const w = (W - 40) / LOOP_STEPS;
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
            c.fillStyle = slot.color;
            c.fillRect(loopX + i * w + 1, y, Math.max(2, w - 3), rowH);
            if (slot.inst === 'drums' && slot.pieces && slot.pieces.length > 1) {
              const count = Math.min(slot.pieces.length, MAX_DRUM_STACK);
              const cellW = Math.max(2, w - 3);
              c.fillStyle = '#02040e';
              c.globalAlpha = 0.36;
              for (let m = 1; m < count; m++) {
                const mx = loopX + i * w + 1 + (cellW * m) / count;
                c.fillRect(mx, y, 1, rowH);
              }
              c.globalAlpha = row === currentLayerIndex && state === 'playing' ? 0.95 : 0.58;
            } else if (slot.inst === 'keys' && slot.notes && slot.notes.length > 1) {
              const count = Math.min(slot.notes.length, MAX_PIANO_STACK);
              const cellW = Math.max(2, w - 3);
              c.fillStyle = '#02040e';
              c.globalAlpha = 0.30;
              for (let m = 1; m < count; m++) {
                const mx = loopX + i * w + 1 + (cellW * m) / count;
                c.fillRect(mx, y, 1, rowH);
              }
              c.globalAlpha = row === currentLayerIndex && state === 'playing' ? 0.95 : 0.58;
            }
          }
          const flash = loopFlash[i];
          if (flash && flash.row === row && flash.pulse > 0) {
            c.fillStyle = flash.color;
            c.globalAlpha = 0.35 + flash.pulse * 0.55;
            c.fillRect(loopX + i * w, y - 1, Math.max(3, w - 1), rowH + 2);
            c.globalAlpha = row === currentLayerIndex && state === 'playing' ? 0.95 : 0.58;
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

    const counting = phase === 'countin' && state === 'playing';

    if (lastGrooveToast && state !== 'replay') {
      const layer = LAYERS[lastGrooveToast.layerIndex] || LAYERS[0];
      c.font = "7px 'VCR', monospace";
      c.fillStyle = '#ffe61a';
      c.textAlign = 'center';
      c.fillText(`${layer.name} LOCKED · +${lastGrooveToast.groove.total}`, W * 0.5, 128);
      c.textAlign = 'left';
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

    const counting = phase === 'countin' && state === 'playing';
    const padsVisible = drumsActive();
    const thereminVisible = chimesActive();
    const surfaceVisible = asteroidSurfaceActive();
    if (!counting && !padsVisible && !thereminVisible && !surfaceVisible) drawLanes(c);
    drawBoss(c);
    if (padsVisible) drawPads(c);
    if (thereminVisible) drawTheremin(c);
    if (asteroidSurfaceActive()) drawAsteroidSurface(c);
    else rocks.forEach(r => drawRock(c, r));
    if (!rockTapActive()) bullets.forEach(b => {
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
      c.save();
      const cx = W * 0.5;
      const cy = H * 0.42;
      const pulse = countKickPulse;
      const r = 58 + pulse * 12;
      c.shadowColor = COLOR;
      c.shadowBlur = 18 + pulse * 24;
      c.globalAlpha = 0.16 + pulse * 0.18;
      c.fillStyle = COLOR;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.fill();
      c.globalAlpha = 0.88;
      c.strokeStyle = COLOR;
      c.lineWidth = 3;
      c.beginPath();
      c.arc(cx, cy, r, 0, Math.PI * 2);
      c.stroke();
      c.shadowBlur = 0;
      c.globalAlpha = 0.45;
      c.lineWidth = 1;
      c.beginPath();
      c.arc(cx, cy, r * 0.68, 0, Math.PI * 2);
      c.stroke();
      c.globalAlpha = 0.95;
      c.fillStyle = '#eaffff';
      c.font = "22px 'VCR', monospace";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(`${tempoBpm()} BPM`, cx, cy - 2);
      c.globalAlpha = 0.85;
      c.fillStyle = '#eaffff';
      c.font = "9px 'VCR', monospace";
      c.fillText('SET TEMPO', cx, cy + 28);
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
    if (!counting && !padsVisible && !thereminVisible && !rockTapActive()) drawShip(c);
    // Minimal footer line; the old beat-dot panel space belongs to gameplay now.
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
    updateLoopButton();
    silenceArcadeMusic();
    showTempoSetup();
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
    cancelAnimationFrame(raf);
    if (state !== 'playing') state = 'idle';
    replaying = false;
    loopEndArmed = false;
    updateLoopButton();
    syncSignalChrome();
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-tempo-mode');
    overlay.classList.add('signal-menu-mode');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">SIGNAL DRIFT</div>
        ${presetControlsHTML()}
        <button class="signal-btn" onclick="signalStart()">START SIGNAL</button>
        <button class="signal-btn secondary" onclick="signalShowJukebox()">JUKEBOX</button>
      </div>`;
  }

  function showTempoSetup() {
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-menu-mode');
    overlay.classList.add('signal-tempo-mode');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">SET TEMPO</div>
        <div class="signal-tempo-box">
          <div id="signal-tempo-value" class="signal-tempo-value">${tempoBpm()} BPM</div>
          <input class="signal-tempo-slider" type="range" min="${MIN_TEMPO_BPM}" max="${MAX_TEMPO_BPM}" value="${tempoBpm()}" oninput="signalSetTempo(this.value, true)">
          <div class="signal-tempo-scale"><span>SLOW</span><span>FAST</span></div>
        </div>
        <button class="signal-btn" onclick="signalStartTempo()">START LOOP</button>
      </div>`;
  }

  function backButtonHTML() {
    return `<div style="display:flex;justify-content:flex-end;margin-top:14px">
      <button class="signal-btn secondary" style="width:auto;min-width:176px;margin:0;padding:0 14px" onclick="nav('lobby')">BACK TO ARCADE</button>
    </div>`;
  }

  function presetControlsHTML() {
    const group = (key, label) => `
      <div class="signal-preset-row">
        <div class="signal-preset-label">${label}</div>
        <div class="signal-stepper" role="group" aria-label="${label}">
          <button type="button" class="signal-stepper-btn" onclick="signalCyclePreset('${key}', -1)" aria-label="Previous ${label}">‹</button>
          <button type="button" class="signal-stepper-value" onclick="signalCyclePreset('${key}', 1)" aria-label="Change ${label}">${presetLabel(key, signalSettings[key])}</button>
          <button type="button" class="signal-stepper-btn" onclick="signalCyclePreset('${key}', 1)" aria-label="Next ${label}">›</button>
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
      if (layer.inst === 'keys') {
        const hits = picks.reduce((n, s) => n + (s.notes ? s.notes.length : 1), 0);
        const seq = picks.flatMap(s => s.labels && s.labels.length ? s.labels : [s.label]).slice(0, 10).join(' ') + (hits > 10 ? ' …' : '');
        return `<div class="signal-stat">${layer.name}<b style="color:${picks[0].color};font-size:11px;letter-spacing:1px">${seq || `${hits} HITS`}</b></div>`;
      }
      const seq = picks.slice(0, 10).map(s => s.label).join(' ') + (picks.length > 10 ? ' …' : '');
      return `<div class="signal-stat">${layer.name}<b style="color:${picks[0].color};font-size:11px;letter-spacing:1px">${seq}</b></div>`;
    }).join('');
    return `<div class="signal-stats">${rows}</div>`;
  }

  function compactTrackStatsHTML() {
    const stamps = gridStamps();
    const hitCount = stamps.reduce((n, s) => n + (s.pieces ? s.pieces.length : s.notes ? s.notes.length : 1), 0);
    const grooveTotal = grooveByLayer.reduce((sum, g) => sum + (g && !g.rest ? g.total : 0), 0);
    return `<div class="signal-stats">
      <div class="signal-stat">TRACK<b>${hitCount} HITS</b></div>
      <div class="signal-stat">GROOVE<b>${grooveTotal}</b></div>
    </div>`;
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
  // The cap keeps long experiments small enough for local and shared jukeboxes.
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
          notes: v.notes ? v.notes.slice() : null,
          piece: v.piece || null,
          pieces: v.pieces ? v.pieces.slice() : null,
          tunes: v.tunes ? v.tunes.slice() : null,
          label: v.label || '',
          labels: v.labels ? v.labels.slice() : null,
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
    overlay.classList.remove('signal-tempo-mode');
    overlay.classList.remove('signal-menu-mode');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">TRACK BUILT</div>
        <div class="signal-subtitle">REPLAY WHAT YOU MADE OR END THE RUN.</div>
        ${compactTrackStatsHTML()}
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
    const hitCount = gridStamps().reduce((n, s) => n + (s.pieces ? s.pieces.length : s.notes ? s.notes.length : 1), 0);
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-tempo-mode');
    overlay.classList.remove('signal-menu-mode');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">TRACK BUILT</div>
        <div class="signal-subtitle">SAVED CHOICES READY FOR REPLAY.</div>
        <div class="signal-stats">
          <div class="signal-stat">SCORE<b>${score}</b></div>
          <div class="signal-stat">TIME<b>${seconds}s</b></div>
          <div class="signal-stat">GROOVE<b>${Math.round(signal)}%</b></div>
          <div class="signal-stat">TRACK<b>${hitCount} HITS</b></div>
        </div>
        ${canSave ? `
          <div style="display:flex;gap:8px;margin-top:14px">
            <input id="signal-name" maxlength="12" placeholder="NAME" style="flex:1;min-width:0;height:42px;box-sizing:border-box;background:#02040e;border:1.5px solid ${COLOR};border-radius:4px;color:#fff;text-align:center;text-transform:uppercase;font-family:'VCR',monospace;font-size:14px;letter-spacing:3px">
            <button id="signal-save-btn" class="signal-btn" style="width:58px;margin:0" onclick="signalSaveRecipe()">▶</button>
          </div>
          <div id="signal-save-status" class="signal-subtitle" style="min-height:18px;margin-top:8px"></div>` : ''}
        ${won ? `<button class="signal-btn secondary" onclick="signalShowJukebox()">JUKEBOX</button>` : ''}
        <button class="signal-btn secondary" onclick="signalShowIntro()">LAUNCH MENU</button>
        <button class="signal-btn" onclick="signalStart()">PLAY AGAIN</button>
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
      if (remoteRows && remoteRows.length) {
        const seen = new Set();
        const rows = remoteRows.concat(localRows).filter(row => {
          const key = `${row.name || ''}:${row.score || 0}:${row.extra || ''}:${row.recipe && row.recipe.choices ? row.recipe.choices.length : 0}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 20);
        return { rows, online: true };
      }
    } catch(e) {}
    return { rows: localRows, online: false };
  }

  async function saveRecipe() {
    const input = document.getElementById('signal-name');
    const button = document.getElementById('signal-save-btn');
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
    if (status) status.textContent = 'SAVING LOOP...';
    if (input) input.disabled = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving loop...';
      button.style.width = 'auto';
      button.style.minWidth = '190px';
    }
    let scoreOnline = false;
    if (window.RemoteLB && typeof window.RemoteLB.submit === 'function') {
      try {
        scoreOnline = await withTimeout(window.RemoteLB.submit(BOARD_KEY, name, score, Math.round(elapsed / 1000), extra), 3500);
      } catch(e) {}
    }
    let recipeOnline = false;
    if (window.SignalRecipeRemote && typeof window.SignalRecipeRemote.submit === 'function') {
      try {
        recipeOnline = await withTimeout(window.SignalRecipeRemote.submit(name, score, extra, recipe), 3500);
      } catch(e) {
      }
    }
    if (status) status.textContent = scoreOnline || recipeOnline ? 'SAVED ONLINE · JUKEBOX READY' : 'SAVED LOCAL · JUKEBOX READY';
    if (button) button.textContent = scoreOnline || recipeOnline ? 'Saved online' : 'Saved local';
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
          notes: choice.notes ? choice.notes.slice() : null,
          piece: choice.piece || (choice.inst === 'fx' && choice.pieces && choice.pieces[0]) || null,
          pieces: choice.pieces ? choice.pieces.slice() : (choice.piece ? [choice.piece] : null),
          tunes: choice.tunes ? choice.tunes.slice() : null,
          label: choice.label || '',
          labels: choice.labels ? choice.labels.slice() : null,
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
    silenceArcadeMusic();
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
    jukeboxBackTarget = state === 'over' ? 'result' : (state === 'built' && recordedChoices.length ? 'built' : 'intro');
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-tempo-mode');
    overlay.classList.remove('signal-menu-mode');
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
  window.signalSetTempo = function(value, preview) {
    audioCtx();
    setTempoBpm(Number(value));
    if (preview) previewTempoKick();
  };
  window.signalStartTempo = function() {
    skipCountIn();
  };
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
    if (jukeboxBackTarget === 'result') showResult(true);
    else if (jukeboxBackTarget === 'built' && recordedChoices.length) showBuiltChoice();
    else showIntro();
  };
  window.signalShowIntro = showIntro;
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
  window.signalCyclePreset = function(group, dir) {
    const presets = SIGNAL_PRESETS[group];
    if (!presets || !presets.length) return;
    const current = presets.findIndex(p => p.id === signalSettings[group]);
    const next = (current + (dir || 1) + presets.length) % presets.length;
    signalSettings[group] = presets[next].id;
    applySettings();
    showIntro();
  };

  window.initSignal = function() {
    canvas = document.getElementById('signal-canvas');
    overlay = document.getElementById('signal-overlay');
    loopButton = document.getElementById('signal-loop-btn');
    resetButton = document.getElementById('signal-reset-btn');
    if (!canvas || !overlay) return;
    applySignalShell();
    silenceArcadeMusic();
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
      if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', resizeHandler);
        window.visualViewport.addEventListener('scroll', resizeHandler);
      }
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
    restoreSignalShell();
    if (overlay) overlay.classList.remove('hidden');
  };

})();
