// ══════════════════════════════════════
//  SIGNAL DRIFT — music survival prototype
// ══════════════════════════════════════
(function() {
  'use strict';

  const COLOR = '#00e5ff';
  const BOARD_KEY = 'signal';
  const LOOP_STEPS = 16;
  const DEFAULT_BEAT_MS = 285;
  const LOOP_GOAL = 3;
  const MAX_LOOP_GOAL = 6;
  const ADDS_PER_LOOP = 3;
  const MAX_BULLETS = 18;
  const MAX_ROCKS = 18;
  const MAX_SPARKS = 120;
  const ROCK_TYPES = [
    { id: 'drum', label: 'DRUM', color: '#00e5ff', radius: 18 },
    { id: 'bass', label: 'BASS', color: '#ffe61a', radius: 22 },
    { id: 'melody', label: 'NOTE', color: '#ff2db8', radius: 16 },
  ];
  const LANES = [
    { type: 'drum', label: 'DRUM', color: '#00e5ff' },
    { type: 'bass', label: 'BASS', color: '#ffe61a' },
    { type: 'melody', label: 'LEAD', color: '#ff2db8' },
  ];
  const OPTION_SETS = [
    [
      { type: 'drum', label: 'PULSE', color: '#00e5ff', role: 'kick' },
      { type: 'bass', label: 'SUB', color: '#ffe61a', role: 'sub' },
      { type: 'melody', label: 'GLASS', color: '#ff2db8', role: 'glass' },
    ],
    [
      { type: 'drum', label: 'CLAP', color: '#ff8a3d', role: 'clap' },
      { type: 'bass', label: 'WALK', color: '#33ff66', role: 'walk' },
      { type: 'melody', label: 'ARP', color: '#b66cff', role: 'arp' },
    ],
    [
      { type: 'drum', label: 'SHAKE', color: '#eaffff', role: 'hat' },
      { type: 'bass', label: 'CHORD', color: '#00e5ff', role: 'chord' },
      { type: 'melody', label: 'SOLO', color: '#ff2db8', role: 'solo' },
    ],
  ];
  const SONG = [
    { root: 130.81, bass: [65.41, 98.0, 130.81, 98.0], lead: [261.63, 311.13, 392.0, 466.16] },
    { root: 103.83, bass: [51.91, 77.78, 103.83, 155.56], lead: [311.13, 349.23, 415.3, 523.25] },
    { root: 155.56, bass: [77.78, 116.54, 155.56, 116.54], lead: [311.13, 392.0, 466.16, 622.25] },
    { root: 116.54, bass: [58.27, 87.31, 116.54, 174.61], lead: [233.08, 293.66, 349.23, 466.16] },
  ];
  const DRUM_KICK = 82;
  const DRUM_SNARE = 146;
  const WRITE_STEPS = {
    drum: [0, 4, 8, 12],
    bass: [0, 4, 8, 12],
    melody: [2, 6, 10, 14],
  };
  const SIGNAL_PRESETS = {
    mode: [
      { id: 'arcade', label: 'ARCADE BUILD' },
      { id: 'studio', label: 'STUDIO DRIFT' },
    ],
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
  const STYLE_TONE = {
    'space-funk': { transpose: 1, bassWave: 'triangle', leadWave: 'sine', shimmer: 1, drum: 1 },
    'dream-synth': { transpose: 1.125, bassWave: 'sine', leadWave: 'triangle', shimmer: 1.45, drum: 0.78 },
    'boss-rave': { transpose: 1.06, bassWave: 'sawtooth', leadWave: 'square', shimmer: 1.2, drum: 1.25 },
    'chiptune': { transpose: 1.5, bassWave: 'square', leadWave: 'square', shimmer: 0.9, drum: 0.85 },
    'dark-minor': { transpose: 0.89, bassWave: 'triangle', leadWave: 'sawtooth', shimmer: 0.72, drum: 1.05, forceMinor: true },
  };

  let canvas = null, ctx = null, overlay = null;
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, state = 'idle';
  let player, bullets, rocks, sparks, stars, boss;
  let score = 0, signal = 0, distortion = 0, health = 3, elapsed = 0;
  let combo = 0, bestCombo = 0, currentSoloLane = 1;
  let loopRound = 1, additionsThisLoop = 0, totalAdditions = 0;
  let recordedChoices = [], replaying = false, replayUntil = 0;
  let jukeboxRows = [];
  let signalSettings = { mode: 'arcade', style: 'space-funk', mood: 'minor', tempo: 'medium' };
  let beatMs = DEFAULT_BEAT_MS;
  let laneFlash = [0, 0, 0];
  let spawnAt = 0, fireAt = 0, beatAt = 0, stepIndex = 0, lastLoopStep = -1;
  let loop = [];
  let leftHeld = false, rightHeld = false, pointerActive = false, pointerX = 0;
  let resizeHandler = null, keyDownHandler = null, keyUpHandler = null;
  let imagesReady = false, pilotImg = null;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function now() { return performance.now(); }
  function laneWidth() { return W / LANES.length; }
  function laneIndexForX(x) { return clamp(Math.floor(x / Math.max(1, laneWidth())), 0, LANES.length - 1); }
  function laneCenter(i) { return laneWidth() * (i + 0.5); }
  function laneForType(type) { return Math.max(0, LANES.findIndex(l => l.type === type)); }
  function songPartForStep(step) { return SONG[Math.floor((step % LOOP_STEPS) / 4) % SONG.length]; }
  function phrasePartForRock() { return themedPart(songPartForStep(stepIndex)); }
  function applyOptionSet() {
    const set = OPTION_SETS[(loopRound - 1) % OPTION_SETS.length];
    for (let i = 0; i < LANES.length; i++) LANES[i] = { ...set[i] };
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
  function styleTone() {
    return STYLE_TONE[signalSettings.style] || STYLE_TONE['space-funk'];
  }
  function themedPart(part) {
    const toneDef = styleTone();
    const root = part.root * toneDef.transpose;
    if (!toneDef.forceMinor && signalSettings.mood === 'major') {
      return {
        root,
        bass: [root * 0.5, root * 0.75, root, root * 1.25],
        lead: [root * 2, root * 2.5, root * 3, root * 4],
      };
    }
    return {
      root,
      bass: part.bass.map(n => n * toneDef.transpose),
      lead: part.lead.map(n => n * toneDef.transpose),
    };
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

  function playHit(type, note, aligned) {
    const toneDef = styleTone();
    const tune = aligned ? 1 : 0.965;
    const vol = aligned ? 1 : 0.62;
    if (type === 'drum') {
      tone((note || 105) * tune, 'sine', 0, 0.12, 0.11 * vol * toneDef.drum, 48);
      noise(0.002, 0.045, 0.032 * vol * toneDef.drum, !aligned);
    } else if (type === 'bass') {
      tone((note || 110) * tune, toneDef.bassWave, 0, 0.18, 0.10 * vol, (note || 110) * 0.72);
      tone((note || 110) * 2 * tune, 'sine', 0.03, 0.10, 0.03 * vol);
    } else {
      tone((note || 330) * tune, toneDef.leadWave, 0, 0.13, 0.085 * vol);
      tone((note || 330) * (1.5 + toneDef.shimmer * 0.5) * tune, 'sine', 0.05, 0.09, 0.03 * vol);
    }
  }

  function playLoopVoice(slot) {
    if (!slot) return;
    const toneDef = styleTone();
    const note = slot.note;
    if (slot.type === 'drum') {
      if (slot.role === 'hat') {
        noise(0, 0.035, 0.018 * toneDef.drum, true);
      } else if (slot.role === 'clap' || slot.role === 'snare') {
        noise(0, 0.055, 0.032 * toneDef.drum, true);
        tone(DRUM_SNARE, 'triangle', 0, 0.055, 0.026 * toneDef.drum, 95);
      } else {
        tone(note || DRUM_KICK, 'sine', 0, 0.10, 0.052 * toneDef.drum, 44);
      }
    } else if (slot.type === 'bass') {
      tone(note, toneDef.bassWave, 0, 0.18, 0.048, note * 0.82);
      if (slot.role === 'chord') {
        tone(note * 1.5, 'sine', 0.02, 0.22, 0.02);
        tone(note * 2, 'sine', 0.04, 0.20, 0.014);
      }
    } else {
      tone(note, toneDef.leadWave, 0, 0.12, 0.038);
      tone(note * (slot.role === 'glass' ? 1.5 + toneDef.shimmer * 0.5 : 1.25 + toneDef.shimmer * 0.25), 'triangle', 0.04, 0.09, 0.012);
    }
  }

  function playSongBed() {
    if (stepIndex % 2 === 0) noise(0.006, 0.022, 0.009, true);
    if (stepIndex % 4 !== 0) return;
    const part = themedPart(songPartForStep(stepIndex));
    tone(part.root, 'sine', 0, 0.32, 0.012);
    tone(part.root * 1.5, 'sine', 0.02, 0.28, 0.007);
  }

  function playBossMotif() {
    const motif = boss && boss.phrase ? boss.phrase : [392, 330, 440, 294];
    motif.forEach((f, i) => tone(f, 'sine', i * 0.08, 0.11, 0.035));
  }

  function fitCanvas() {
    if (!canvas) return;
    const header = document.querySelector('#pg-signal .cats-header');
    const top = header ? header.offsetHeight : 56;
    const availW = window.innerWidth || document.documentElement.clientWidth || 360;
    const availH = (window.innerHeight || document.documentElement.clientHeight || 640) - top;
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
      player.y = H - 64;
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
    player = { x: W * 0.5, y: H - 64, r: 17, cooldown: 0 };
    bullets = [];
    rocks = [];
    sparks = [];
    boss = null;
    score = 0;
    signal = 18;
    distortion = 8;
    health = 3;
    combo = 0;
    bestCombo = 0;
    currentSoloLane = 1;
    applySettings();
    loopRound = 1;
    additionsThisLoop = 0;
    totalAdditions = 0;
    recordedChoices = [];
    replaying = false;
    replayUntil = 0;
    applyOptionSet();
    laneFlash = [0, 0, 0];
    elapsed = 0;
    spawnAt = 0;
    fireAt = 0;
    beatAt = 0;
    stepIndex = 0;
    lastLoopStep = -1;
    loop = Array.from({ length: LOOP_STEPS }, () => []);
    initStars();
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

  function rockTypeForTime() {
    const t = elapsed / 1000;
    const roll = Math.random();
    if (t > 35 && roll < 0.42) return ROCK_TYPES[2];
    if (roll < 0.34) return ROCK_TYPES[0];
    if (roll < 0.62) return ROCK_TYPES[1];
    return ROCK_TYPES[2];
  }

  function spawnRock(forceType) {
    const lane = Number.isFinite(forceType) ? forceType : Math.floor(Math.random() * LANES.length);
    const option = LANES[lane];
    const type = ROCK_TYPES.find(t => t.id === option.type) || ROCK_TYPES[0];
    const part = phrasePartForRock();
    const phrase = makePhrase(option, part);
    const note = phrase[0];
    const r = type.radius + rand(-3, 5);
    const lw = laneWidth();
    rocks.push({
      type: type.id,
      label: option.label,
      color: option.color,
      role: option.role,
      lane,
      note,
      phrase,
      phraseStep: 0,
      cleanHits: 0,
      r,
      x: clamp(laneCenter(lane) + rand(-lw * 0.24, lw * 0.24), 26, W - 26),
      y: -r - rand(0, 60),
      vx: rand(-10, 10),
      vy: rand(48, 76) + elapsed * 0.0025,
      hp: phrase.length,
      maxHp: phrase.length,
      spin: rand(-2, 2),
      rot: rand(0, Math.PI * 2),
    });
  }

  function makePhrase(option, part) {
    if (option.type === 'drum') {
      if (option.role === 'clap') return [DRUM_SNARE, DRUM_SNARE, DRUM_SNARE, DRUM_SNARE];
      if (option.role === 'hat') return [220, 260, 220, 300];
      return Math.random() < 0.5
        ? [DRUM_KICK, DRUM_SNARE, DRUM_KICK, DRUM_SNARE]
        : [DRUM_KICK, DRUM_KICK, DRUM_SNARE, DRUM_KICK];
    }
    if (option.type === 'bass') {
      if (option.role === 'chord') return [part.root, part.root * 1.25, part.root * 1.5, part.root * 2];
      if (option.role === 'walk') return [part.bass[0], part.bass[1], part.bass[2], part.bass[3]];
      return [part.bass[0], part.bass[2], part.bass[0], part.bass[1]];
    }
    if (option.role === 'arp') return [part.lead[0], part.lead[2], part.lead[1], part.lead[3]];
    if (option.role === 'solo') return [part.lead[3], part.lead[2], part.lead[1], part.lead[0]];
    return [part.lead[1], part.lead[0], part.lead[2], part.lead[3]];
  }

  function ensureBoss() {
    return;
  }

  function hitBoss() {
    return;
  }

  function shoot() {
    if (bullets.length >= MAX_BULLETS) bullets.shift();
    bullets.push({ x: player.x, y: player.y - 18, vy: -420, r: 4 });
    tone(650, 'triangle', 0, 0.035, 0.018, 920);
  }

  function tapShoot() {
    const t = performance.now();
    if (t < fireAt) return;
    shoot();
    fireAt = t + 130;
  }

  function registerAddition(rock, perfectPhrase) {
    if (!perfectPhrase) return false;
    additionsThisLoop = Math.min(ADDS_PER_LOOP, additionsThisLoop + 1);
    totalAdditions += 1;
    recordedChoices.push({
      loop: loopRound,
      lane: rock.lane,
      label: rock.label,
      type: rock.type,
      role: rock.role,
      color: rock.color,
      phrase: rock.phrase ? rock.phrase.slice() : [],
    });
    score += 45;
    signal = clamp(signal + 8, 0, 100);
    laneFlash[rock.lane] = 1.2;
    tone(523, 'triangle', 0, 0.10, 0.05);
    tone(659, 'triangle', 0.08, 0.12, 0.045);
    if (additionsThisLoop >= ADDS_PER_LOOP) advanceLoopPass();
    return true;
  }

  function advanceLoopPass() {
    if (loopRound >= LOOP_GOAL) {
      finishTrack();
      return;
    }
    loopRound += 1;
    additionsThisLoop = 0;
    rocks = [];
    applyOptionSet();
    laneFlash = [1, 1, 1];
    tone(392, 'triangle', 0, 0.12, 0.05);
    tone(523, 'triangle', 0.11, 0.14, 0.05);
    tone(659, 'sine', 0.24, 0.18, 0.04);
  }

  function finishTrack() {
    if (state !== 'playing') return;
    state = 'built';
    cancelAnimationFrame(raf);
    signal = Math.max(signal, 82);
    score += Math.max(0, 220 - Math.floor(elapsed / 1000)) + bestCombo * 4;
    tone(262, 'triangle', 0, 0.14, 0.06);
    tone(330, 'triangle', 0.1, 0.14, 0.06);
    tone(392, 'triangle', 0.2, 0.16, 0.06);
    tone(523, 'sine', 0.32, 0.22, 0.05);
    showBuiltChoice();
  }

  function continueLooping() {
    if (state !== 'built' && state !== 'replay') return;
    if (loopRound < MAX_LOOP_GOAL) loopRound += 1;
    additionsThisLoop = 0;
    rocks = [];
    replaying = false;
    applyOptionSet();
    overlay.classList.add('hidden');
    state = 'playing';
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function startReplay() {
    if (!recordedChoices.length) return;
    state = 'replay';
    replaying = true;
    replayUntil = performance.now() + LOOP_STEPS * beatMs * 4;
    rocks = [];
    bullets = [];
    overlay.classList.add('hidden');
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function addLoopVoice(rock, lockedTrack) {
    const steps = WRITE_STEPS[rock.type] || [stepIndex];
    steps.forEach((target, i) => {
      const phraseNote = rock.phrase[i % rock.phrase.length];
      const slot = {
        type: rock.type,
        note: phraseNote,
        role: rock.role || (rock.type === 'drum' && (i % 2) ? 'snare' : 'kick'),
        color: rock.color,
        ttl: lockedTrack ? Infinity : (rock.type === 'melody' ? 16 : 18),
        locked: !!lockedTrack,
      };
      const bucket = loop[target];
      const same = bucket.findIndex(v => v.type === slot.type);
      if (same >= 0) bucket[same] = slot;
      else bucket.push(slot);
      while (bucket.length > 3) bucket.shift();
    });
  }

  function burst(x, y, color, n) {
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
    if (sparks.length > MAX_SPARKS) sparks.splice(0, sparks.length - MAX_SPARKS);
  }

  function hitRock(rock) {
    const playerLane = laneIndexForX(player.x);
    const aligned = playerLane === rock.lane;
    const solo = aligned && playerLane === currentSoloLane && boss;
    const phraseNote = rock.phrase && rock.phrase.length
      ? rock.phrase[rock.phraseStep % rock.phrase.length]
      : rock.note;
    rock.phraseStep += 1;
    rock.hp -= 1;
    rock.note = phraseNote;
    if (aligned) rock.cleanHits += 1;
    playHit(rock.type, phraseNote, aligned);
    burst(rock.x, rock.y, rock.color, aligned ? 7 : 4);
    laneFlash[rock.lane] = aligned ? 0.8 : 0.42;
    combo = aligned ? combo + 1 : 0;
    bestCombo = Math.max(bestCombo, combo);
    score += aligned ? 3 + combo : 1;
    signal = clamp(signal + (aligned ? 0.95 : 0.1), 0, 100);
    distortion = clamp(distortion + (aligned ? -0.45 : 1.7), 0, 100);

    if (rock.hp > 0) return false;

    const perfectPhrase = rock.cleanHits >= rock.maxHp;
    const lockedTrack = registerAddition(rock, perfectPhrase);
    addLoopVoice(rock, lockedTrack);
    laneFlash[rock.lane] = perfectPhrase ? 1 : 0.7;
    score += (rock.type === 'bass' ? 18 : rock.type === 'melody' ? 22 : 14) + (perfectPhrase ? 28 : 6) + (solo ? 18 : 0);
    signal = clamp(signal + (perfectPhrase ? 6.8 : 1.8) + (solo ? 2.6 : 0), 0, 100);
    distortion = clamp(distortion + (perfectPhrase ? -3.2 : 2.4), 0, 100);
    if (solo) {
      tone(784, 'triangle', 0, 0.08, 0.035);
      tone(1047, 'sine', 0.06, 0.11, 0.025);
    }
    burst(rock.x, rock.y, rock.color, 12);
    return true;
  }

  function playerDamage(amount) {
    distortion = clamp(distortion + 5, 0, 100);
    signal = clamp(signal - 2, 0, 100);
    combo = 0;
    noise(0, 0.12, 0.045, false);
    tone(190, 'sawtooth', 0, 0.16, 0.06, 70);
    burst(player.x, player.y, '#ff8a3d', 12);
  }

  function tickBeat(t) {
    if (!beatAt) beatAt = t + beatMs;
    if (t < beatAt) return;
    while (t >= beatAt) beatAt += beatMs;
    stepIndex = (stepIndex + 1) % LOOP_STEPS;
    playSongBed();
    const bucket = loop[stepIndex];
    bucket.forEach(playLoopVoice);
    bucket.forEach(v => { v.ttl -= 1; });
    loop[stepIndex] = bucket.filter(v => v.ttl > 0);
    lastLoopStep = stepIndex;
    distortion = clamp(distortion + (signalSettings.mode === 'studio' ? 0.02 : 0.12), 0, 100);
    if (stepIndex % 8 === 0 && signal > 22) signal = clamp(signal - 0.35, 0, 100);
    if (boss && stepIndex % 8 === 0) playBossMotif();
    if (boss && stepIndex % 8 === 0) {
      currentSoloLane = (currentSoloLane + 1 + Math.floor(Math.random() * 2)) % LANES.length;
      laneFlash[currentSoloLane] = Math.max(laneFlash[currentSoloLane], 0.8);
    }
  }

  function update(dt, t) {
    elapsed += dt;
    tickBeat(t);
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
      if (rocks.length > MAX_ROCKS) rocks.splice(0, rocks.length - MAX_ROCKS);
      const cadence = clamp(820 - elapsed * 0.004, 420, 820);
      spawnAt = t + cadence;
    }

    if (boss) {
      boss.phase += dt / 1000;
      boss.x = W * 0.5 + Math.sin(boss.phase * 1.3) * W * 0.22;
      if (t >= boss.nextSpawn) {
        spawnRock(ROCK_TYPES[currentSoloLane]);
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
      } else if (r.y > H + r.r) {
        rocks.splice(i, 1);
        distortion = clamp(distortion + 0.45, 0, 100);
        combo = 0;
      }
    }

    sparks.forEach(p => {
      p.age += dt;
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.vy += 80 * dt / 1000;
    });
    sparks = sparks.filter(p => p.age < p.life);

    if (signal >= 100 && loopRound >= LOOP_GOAL && additionsThisLoop >= ADDS_PER_LOOP) finish(true);
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
    c.fillStyle = r.type === 'bass' ? '#2c2608' : r.type === 'melody' ? '#26061e' : '#062432';
    c.strokeStyle = r.color;
    c.lineWidth = r.hp < r.maxHp ? 3 : 2;
    c.beginPath();
    const points = r.type === 'bass' ? 8 : 7;
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
    c.fillText(r.type === 'drum' ? '●' : r.type === 'bass' ? 'B' : '♪', 0, 1);
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

  function drawLanes(c) {
    const lw = laneWidth();
    const baseY = H - 78;
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
      c.fillRect(x + 3, 58, lw - 6, H - 98);
      c.globalAlpha = 0.24 + pulse * 0.35 + (isSelected ? 0.3 : 0) + (isSolo ? 0.22 : 0) + (isLocked ? 0.28 : 0);
      c.strokeStyle = lane.color;
      c.lineWidth = isSelected ? 2 : 1;
      c.strokeRect(x + 5, baseY, lw - 10, 34);
      c.globalAlpha = 0.95;
      c.font = "9px 'VCR', monospace";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(lane.label, x + lw * 0.5, baseY + 17);
      c.font = "7px 'VCR', monospace";
      c.fillText('ADD', x + lw * 0.5, baseY - 8);
    }
    c.restore();
  }

  function drawHud(c) {
    c.save();
    c.font = "10px 'VCR', monospace";
    c.textBaseline = 'top';
    c.fillStyle = 'rgba(234,255,255,0.66)';
    c.fillText('SIGNAL', 12, 12);
    c.fillText('SPACE', 12, 38);
    c.fillText('LOOP ' + loopRound, W - 72, 12);
    c.fillText(String(score), W - 72, 38);
    if (combo > 1) {
      c.fillStyle = LANES[laneIndexForX(player.x)].color;
      c.fillText('COMBO ' + combo, 12, 62);
    }
    drawBar(c, 72, 13, W - 144, 10, signal / 100, COLOR);
    drawBar(c, 72, 39, W - 144, 10, 1 - clamp(distortion / 100, 0, 1), '#ffe61a');

    c.textAlign = 'center';
    c.font = "9px 'VCR', monospace";
    c.fillStyle = 'rgba(234,255,255,0.78)';
    const objective = state === 'replay'
      ? 'REPLAYING TRACK: ' + recordedChoices.map(c => c.label).slice(-9).join(' / ')
      : `LOOP ${loopRound}${loopRound > LOOP_GOAL ? '+' : '/' + LOOP_GOAL}: ADD ${additionsThisLoop}/${ADDS_PER_LOOP}  ` + LANES.map(l => l.label).join(' / ');
    c.fillText(objective, W * 0.5, 64);
    c.textAlign = 'left';

    const loopX = 18, loopY = H - 28;
    const w = (W - 36) / LOOP_STEPS;
    for (let i = 0; i < LOOP_STEPS; i++) {
      const active = i === stepIndex;
      c.fillStyle = active ? COLOR : 'rgba(234,255,255,0.12)';
      c.fillRect(loopX + i * w + 1, loopY, Math.max(2, w - 3), active ? 12 : 7);
      if (loop[i] && loop[i].length) {
        c.fillStyle = loop[i][loop[i].length - 1].color;
        c.fillRect(loopX + i * w + 1, loopY - 7, Math.max(2, w - 3), 4);
      }
    }
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

    drawLanes(c);
    drawBoss(c);
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
    drawShip(c);
    drawHud(c);
  }

  function frame(t) {
    if (state !== 'playing' && state !== 'replay') return;
    const dt = Math.min(40, t - (last || t));
    last = t;
    try {
      update(dt, t);
      draw();
    } catch (e) {
      console.warn('[Signal Drift copy] recovered frame error', e);
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
    if (typeof ArcadeMusic !== 'undefined' && ArcadeMusic.duck) ArcadeMusic.duck();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function finish(won) {
    if (state !== 'playing') return;
    state = 'over';
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
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">SIGNAL DRIFT</div>
        <div class="signal-subtitle">MOVE LEFT/RIGHT. TAP OR CLICK TO SHOOT.<br>HIT A ROCK'S WHOLE PHRASE IN ITS LANE TO ADD IT. LET IT PASS TO LEAVE A REST.</div>
        ${presetControlsHTML()}
        <div class="signal-stats">
          <div class="signal-stat">LOOP 1<b>FOUNDATION</b></div>
          <div class="signal-stat">LOOP 2<b>VARIATION</b></div>
          <div class="signal-stat">LOOP 3<b>FINISH</b></div>
          <div class="signal-stat">CLEAN PHRASE<b>ADD</b></div>
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
      ${group('mode', 'MODE')}
      ${group('style', 'STYLE')}
      ${group('mood', 'MOOD')}
      ${group('tempo', 'TEMPO')}
    </div>`;
  }

  function choiceSummaryHTML() {
    if (!recordedChoices.length) return '<div class="signal-subtitle">NO CHOICES RECORDED YET.</div>';
    return `<div class="signal-stats">` + recordedChoices.slice(-12).map(choice =>
      `<div class="signal-stat">LOOP ${choice.loop}<b style="color:${choice.color}">${choice.label}</b></div>`
    ).join('') + `</div>`;
  }

  function currentRecipe() {
    return {
      version: 1,
      settings: { ...signalSettings },
      beatMs,
      score,
      choices: recordedChoices.map(c => ({
        loop: c.loop,
        lane: c.lane,
        label: c.label,
        type: c.type,
        role: c.role,
        color: c.color,
        phrase: c.phrase ? c.phrase.slice() : [],
      })),
    };
  }

  function recipeExtra(recipe) {
    const settings = recipe && recipe.settings ? recipe.settings : signalSettings;
    return `${presetLabel('style', settings.style)} · ${presetLabel('mood', settings.mood)}`;
  }

  function recipeSummary(recipe) {
    const choices = recipe && recipe.choices ? recipe.choices : recordedChoices;
    return choices.map(c => c.label).join(' / ');
  }

  function showBuiltChoice() {
    cancelAnimationFrame(raf);
    state = 'built';
    replaying = false;
    overlay.classList.remove('hidden');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">TRACK BUILT</div>
        <div class="signal-subtitle">REPLAY WHAT YOU MADE, LOOP AROUND FOR MORE OPTIONS, OR END THE RUN.</div>
        ${choiceSummaryHTML()}
        <button class="signal-btn" onclick="signalReplayTrack()">REPLAY TRACK</button>
        <button class="signal-btn secondary" onclick="signalLoopAgain()">LOOP AROUND</button>
        <button class="signal-btn secondary" onclick="signalEndRun()">END RUN</button>
      </div>`;
  }

  function endBuiltRun() {
    cancelAnimationFrame(raf);
    state = 'over';
    replaying = false;
    showResult(true);
  }

  function showResult(won) {
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
          <div class="signal-stat">SIGNAL<b>${Math.round(signal)}%</b></div>
          <div class="signal-stat">SPACE<b>${Math.round(100 - distortion)}%</b></div>
          <div class="signal-stat">ADDS<b>${totalAdditions}</b></div>
          <div class="signal-stat">BEST COMBO<b>${bestCombo}</b></div>
        </div>
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
      const remoteRows = await window.SignalRecipeRemote.fetchTop(20);
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
        await window.SignalRecipeRemote.submit(name, score, extra, recipe);
        if (status) status.textContent = 'SAVED ONLINE';
      } catch(e) {
        if (status) status.textContent = 'SAVED LOCAL';
      }
    }
    showJukebox();
  }

  function recipeToLoop(recipe) {
    const savedLoop = Array.from({ length: LOOP_STEPS }, () => []);
    (recipe.choices || []).forEach(choice => {
      const steps = WRITE_STEPS[choice.type] || [0];
      steps.forEach((target, i) => {
        const phrase = choice.phrase && choice.phrase.length ? choice.phrase : [DRUM_KICK];
        savedLoop[target].push({
          type: choice.type,
          note: phrase[i % phrase.length],
          role: choice.role || (choice.type === 'drum' && (i % 2) ? 'snare' : 'kick'),
          color: choice.color || COLOR,
          ttl: Infinity,
          locked: true,
        });
      });
    });
    return savedLoop;
  }

  function playRecipe(recipe) {
    if (!recipe || !recipe.choices || !recipe.choices.length) return;
    signalSettings = { ...signalSettings, ...(recipe.settings || {}) };
    applySettings();
    loop = recipeToLoop(recipe);
    recordedChoices = recipe.choices.map(c => ({ ...c, phrase: c.phrase ? c.phrase.slice() : [] }));
    loopRound = Math.max(LOOP_GOAL, ...recordedChoices.map(c => c.loop || 1));
    additionsThisLoop = ADDS_PER_LOOP;
    totalAdditions = recordedChoices.length;
    state = 'replay';
    replaying = true;
    replayUntil = performance.now() + LOOP_STEPS * beatMs * 4;
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
      pointerActive = true;
      pointerX = pointerPos(e).x;
      audioCtx();
      tapShoot();
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      if (state !== 'playing') return;
      e.preventDefault();
      pointerX = pointerPos(e).x;
    }, { passive: false });
    canvas.addEventListener('touchend', () => { pointerActive = false; }, { passive: true });
    canvas.addEventListener('touchcancel', () => { pointerActive = false; }, { passive: true });
    canvas.addEventListener('mousemove', e => {
      if (state !== 'playing') return;
      pointerActive = true;
      pointerX = pointerPos(e).x;
    });
    canvas.addEventListener('mousedown', e => {
      if (state !== 'playing') return;
      pointerActive = true;
      pointerX = pointerPos(e).x;
      audioCtx();
      tapShoot();
    });
    canvas.addEventListener('mouseleave', () => { pointerActive = false; });
  }

  window.signalStart = start;
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
    if (!canvas || !overlay) return;
    fitCanvas();
    loadPilot();
    attachInput();
    resetRun();
    state = 'idle';
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
    leftHeld = false;
    rightHeld = false;
    pointerActive = false;
    if (overlay) overlay.classList.remove('hidden');
  };

})();
