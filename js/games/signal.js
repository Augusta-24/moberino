// ══════════════════════════════════════
//  SIGNAL DRIFT — music survival prototype
// ══════════════════════════════════════
(function() {
  'use strict';

  const COLOR = '#00e5ff';
  const BOARD_KEY = 'signal';
  const LOOP_STEPS = 16;
  const DEFAULT_BEAT_MS = 285;
  const MIN_TEMPO_BPM = 36;
  const MAX_TEMPO_BPM = 88;
  const MAX_ROCKS = 32;
  const MAX_SPARKS = 120;
  const MAX_DRUM_STACK = 6;
  const MAX_PIANO_STACK = 6;
  const SIGNAL_MASTER_GAIN = 2.6;
  const COUNTDOWN_STEP_MS = 1000;
  const DRUM_BUS_GAIN = 0.94;
  const DEFAULT_LAYER_VOLUMES = { drums: 1, bass: 1, keys: 1, chimes: 1, swell: 1, fx: 1 };
  const DRUM_PIECE_GAINS = {
    kick: 0.92,
    tom: 0.82,
    snare: 0.86,
    rim: 0.84,
    hat: 0.62,
    shaker: 0.66,
    cabasa: 0.68,
    guiro: 0.72,
    tri: 0.72,
    bell: 0.76,
    gong: 0.84,
    clave: 0.72,
    clap: 0.82,
  };
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
      { piece: 'snare', label: 'SNARE', color: '#ff66c7' },
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
  const PLAY_ALONG_PATTERNS = [
    { id: 'easy-kick-lights', title: 'KICK LIGHTS', difficulty: 'EASY', settings: { style: 'space-funk', mood: 'minor', tempo: 'medium' }, rounds: [[
      { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
    ]] },
    { id: 'easy-hat-walk', title: 'HAT WALK', difficulty: 'EASY', settings: { style: 'dream-synth', mood: 'major', tempo: 'chill' }, rounds: [[
      { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 2, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'hat', label: 'HAT', lane: 2 },
      { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
      { step: 6, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'hat', label: 'HAT', lane: 2 },
      { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 10, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'hat', label: 'HAT', lane: 2 },
      { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
      { step: 14, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'hat', label: 'HAT', lane: 2 },
    ]] },
    { id: 'easy-tom-answer', title: 'TOM ANSWER', difficulty: 'EASY', settings: { style: 'toy-box', mood: 'major', tempo: 'medium' }, rounds: [[
      { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 3, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'tom', label: 'TOM', lane: 1 },
      { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
      { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 11, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'tom', label: 'TOM', lane: 1 },
      { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
    ]] },
    { id: 'easy-clap-corners', title: 'CLAP CORNERS', difficulty: 'EASY', settings: { style: 'vaporwave', mood: 'minor', tempo: 'chill' }, rounds: [[
      { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'clap', label: 'CLAP', lane: 1 },
      { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'clap', label: 'CLAP', lane: 1 },
    ]] },
    { id: 'easy-rim-spark', title: 'RIM SPARK', difficulty: 'EASY', settings: { style: 'chiptune', mood: 'dorian', tempo: 'medium' }, rounds: [[
      { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'rim', label: 'RIM', lane: 1 },
      { step: 6, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'hat', label: 'HAT', lane: 2 },
      { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'rim', label: 'RIM', lane: 1 },
      { step: 14, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'hat', label: 'HAT', lane: 2 },
    ]] },
    { id: 'easy-shaker-steps', title: 'SHAKER STEPS', difficulty: 'EASY', settings: { style: 'steel-island', mood: 'egyptian', tempo: 'medium' }, rounds: [[
      { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 2, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'shaker', label: 'SHAKER', lane: 2 },
      { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
      { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 10, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'shaker', label: 'SHAKER', lane: 2 },
      { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
    ]] },
    { id: 'medium-bass-anchor', title: 'BASS ANCHOR', difficulty: 'MEDIUM', settings: { style: 'space-funk', mood: 'minor', tempo: 'medium' }, rounds: [
      [
        { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
        { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
      ],
      [
        { step: 0, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 0, label: 'LOW', lane: 0 },
        { step: 7, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 2, label: 'LOW', lane: 0 },
        { step: 8, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 4, label: 'MID', lane: 1 },
        { step: 14, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 3, label: 'MID', lane: 1 },
      ],
    ] },
    { id: 'medium-disco-steps', title: 'DISCO STEPS', difficulty: 'MEDIUM', settings: { style: 'boss-rave', mood: 'dorian', tempo: 'fast' }, rounds: [
      [
        { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 3, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'hat', label: 'HAT', lane: 2 },
        { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
        { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 11, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'hat', label: 'HAT', lane: 2 },
        { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
      ],
      [
        { step: 0, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 0, label: 'LOW', lane: 0 },
        { step: 4, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 3, label: 'MID', lane: 1 },
        { step: 8, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 5, label: 'MID', lane: 1 },
        { step: 12, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 3, label: 'MID', lane: 1 },
      ],
    ] },
    { id: 'medium-low-skip', title: 'LOW SKIP', difficulty: 'MEDIUM', settings: { style: 'dark-minor', mood: 'minor', tempo: 'medium' }, rounds: [
      [
        { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 5, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'rim', label: 'RIM', lane: 1 },
        { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
      ],
      [
        { step: 0, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 0, label: 'LOW', lane: 0 },
        { step: 6, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 1, label: 'LOW', lane: 0 },
        { step: 10, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 4, label: 'MID', lane: 1 },
        { step: 15, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 2, label: 'LOW', lane: 0 },
      ],
    ] },
    { id: 'medium-toy-bounce', title: 'TOY BOUNCE', difficulty: 'MEDIUM', settings: { style: 'toy-box', mood: 'major', tempo: 'medium' }, rounds: [
      [
        { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 2, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'clave', label: 'CLAVE', lane: 2 },
        { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'clap', label: 'CLAP', lane: 1 },
        { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 10, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'clave', label: 'CLAVE', lane: 2 },
        { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'clap', label: 'CLAP', lane: 1 },
      ],
      [
        { step: 0, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 0, label: 'LOW', lane: 0 },
        { step: 3, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 2, label: 'LOW', lane: 0 },
        { step: 8, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 4, label: 'MID', lane: 1 },
        { step: 11, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 2, label: 'LOW', lane: 0 },
      ],
    ] },
    { id: 'medium-crystal-bass', title: 'CRYSTAL BASS', difficulty: 'MEDIUM', settings: { style: 'crystal-cave', mood: 'hirajoshi', tempo: 'chill' }, rounds: [
      [
        { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'bell', label: 'BELL', lane: 2 },
        { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'bell', label: 'BELL', lane: 2 },
      ],
      [
        { step: 0, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 0, label: 'LOW', lane: 0 },
        { step: 5, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 3, label: 'MID', lane: 1 },
        { step: 8, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 5, label: 'MID', lane: 1 },
        { step: 13, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 2, label: 'LOW', lane: 0 },
      ],
    ] },
    { id: 'medium-garage-pulse', title: 'GARAGE PULSE', difficulty: 'MEDIUM', settings: { style: 'cyber-garage', mood: 'blues', tempo: 'fast' }, rounds: [
      [
        { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 3, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'hat', label: 'HAT', lane: 2 },
        { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
        { step: 7, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'hat', label: 'HAT', lane: 2 },
        { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
        { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
      ],
      [
        { step: 0, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 0, label: 'LOW', lane: 0 },
        { step: 4, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 4, label: 'MID', lane: 1 },
        { step: 7, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 5, label: 'MID', lane: 1 },
        { step: 10, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 7, label: 'HIGH', lane: 2 },
        { step: 14, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 4, label: 'MID', lane: 1 },
      ],
    ] },
    { id: 'hard-neon-stack', title: 'NEON STACK', difficulty: 'HARD', settings: { style: 'boss-rave', mood: 'minor', tempo: 'fast' }, rounds: [[
      { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
      { step: 8, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 5, label: 'MID', lane: 1 },
      { step: 10, layerId: 'keys', layerIndex: 2, inst: 'keys', degree: 7, label: 'HIGH', lane: 2 },
      { step: 12, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
      { step: 14, layerId: 'chimes', layerIndex: 3, inst: 'chimes', degree: 9, label: 'HIGH', lane: 2 },
    ]] },
    { id: 'hard-moon-ladder', title: 'MOON LADDER', difficulty: 'HARD', settings: { style: 'dark-minor', mood: 'minor', tempo: 'medium' }, rounds: [[
      { step: 0, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 0, label: 'LOW', lane: 0 },
      { step: 3, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'rim', label: 'RIM', lane: 1 },
      { step: 5, layerId: 'keys', layerIndex: 2, inst: 'keys', degree: 3, label: 'MID', lane: 1 },
      { step: 8, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 5, label: 'MID', lane: 1 },
      { step: 11, layerId: 'chimes', layerIndex: 3, inst: 'chimes', degree: 7, label: 'HIGH', lane: 2 },
      { step: 13, layerId: 'fx', layerIndex: 5, inst: 'fx', piece: 'echo', label: 'ECHO', lane: 0 },
    ]] },
    { id: 'hard-steel-weave', title: 'STEEL WEAVE', difficulty: 'HARD', settings: { style: 'steel-island', mood: 'egyptian', tempo: 'medium' }, rounds: [[
      { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 2, layerId: 'chimes', layerIndex: 3, inst: 'chimes', degree: 2, label: 'LOW', lane: 0 },
      { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'bell', label: 'BELL', lane: 2 },
      { step: 6, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 3, label: 'MID', lane: 1 },
      { step: 9, layerId: 'keys', layerIndex: 2, inst: 'keys', degree: 5, label: 'MID', lane: 1 },
      { step: 12, layerId: 'swell', layerIndex: 4, inst: 'swell', degree: 7, label: 'HIGH', lane: 2 },
    ]] },
    { id: 'hard-vapor-drift', title: 'VAPOR DRIFT', difficulty: 'HARD', settings: { style: 'vaporwave', mood: 'major', tempo: 'chill' }, rounds: [[
      { step: 0, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 0, label: 'LOW', lane: 0 },
      { step: 4, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'clap', label: 'CLAP', lane: 1 },
      { step: 5, layerId: 'keys', layerIndex: 2, inst: 'keys', degree: 4, label: 'MID', lane: 1 },
      { step: 8, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 5, label: 'MID', lane: 1 },
      { step: 10, layerId: 'chimes', layerIndex: 3, inst: 'chimes', degree: 7, label: 'HIGH', lane: 2 },
      { step: 15, layerId: 'fx', layerIndex: 5, inst: 'fx', piece: 'rise', label: 'RISE', lane: 1 },
    ]] },
    { id: 'expert-orbit-split', title: 'ORBIT SPLIT', difficulty: 'EXPERT', settings: { style: 'crystal-cave', mood: 'hirajoshi', tempo: 'fast' }, rounds: [[
      { step: 0, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'kick', label: 'KICK', lane: 0 },
      { step: 1, layerId: 'keys', layerIndex: 2, inst: 'keys', degree: 2, label: 'LOW', lane: 0 },
      { step: 3, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 3, label: 'MID', lane: 1 },
      { step: 6, layerId: 'chimes', layerIndex: 3, inst: 'chimes', degree: 6, label: 'HIGH', lane: 2 },
      { step: 8, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'snare', label: 'SNARE', lane: 1 },
      { step: 9, layerId: 'swell', layerIndex: 4, inst: 'swell', degree: 7, label: 'HIGH', lane: 2 },
      { step: 11, layerId: 'fx', layerIndex: 5, inst: 'fx', piece: 'warp', label: 'WARP', lane: 2 },
      { step: 14, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 4, label: 'MID', lane: 1 },
    ]] },
    { id: 'expert-blackbox', title: 'BLACKBOX', difficulty: 'EXPERT', settings: { style: 'cyber-garage', mood: 'blues', tempo: 'fast' }, rounds: [[
      { step: 0, layerId: 'bass', layerIndex: 1, inst: 'bass', degree: 0, label: 'LOW', lane: 0 },
      { step: 2, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'hat', label: 'HAT', lane: 2 },
      { step: 4, layerId: 'keys', layerIndex: 2, inst: 'keys', degree: 5, label: 'MID', lane: 1 },
      { step: 5, layerId: 'fx', layerIndex: 5, inst: 'fx', piece: 'echo', label: 'ECHO', lane: 0 },
      { step: 7, layerId: 'drums', layerIndex: 0, inst: 'drums', piece: 'rim', label: 'RIM', lane: 1 },
      { step: 9, layerId: 'chimes', layerIndex: 3, inst: 'chimes', degree: 8, label: 'HIGH', lane: 2 },
      { step: 12, layerId: 'swell', layerIndex: 4, inst: 'swell', degree: 4, label: 'MID', lane: 1 },
      { step: 15, layerId: 'fx', layerIndex: 5, inst: 'fx', piece: 'rise', label: 'RISE', lane: 1 },
    ]] },
  ];
  const SIGNAL_PRESETS = {
    style: [
      { id: 'space-funk', label: 'SPACE FUNK' },
      { id: 'dream-synth', label: 'DREAM SYNTH' },
      { id: 'boss-rave', label: 'BOSS RAVE' },
      { id: 'chiptune', label: 'CHIPTUNE' },
      { id: 'dark-minor', label: 'NOIR MOON' },
      { id: 'vaporwave', label: 'VAPORWAVE' },
      { id: 'toy-box', label: 'TOY BOX' },
      { id: 'steel-island', label: 'STEEL ISLAND' },
      { id: 'jazz-club', label: 'JAZZ CLUB' },
      { id: 'velvet-hall', label: 'VELVET HALL' },
      { id: 'haunted-organ', label: 'HAUNTED ORGAN' },
      { id: 'desert-caravan', label: 'DESERT' },
      { id: 'cyber-garage', label: 'CYBER GARAGE' },
      { id: 'crystal-cave', label: 'CRYSTAL CAVE' },
    ],
    mood: [
      { id: 'minor', label: 'MOODY' },
      { id: 'major', label: 'HAPPY' },
      { id: 'blues', label: 'GRITTY' },
      { id: 'dorian', label: 'FLOATY' },
      { id: 'egyptian', label: 'DESERT' },
      { id: 'hirajoshi', label: 'DREAMY' },
    ],
    tempo: [
      { id: 'chill', label: 'CHILL', beatMs: 340 },
      { id: 'medium', label: 'MEDIUM', beatMs: 285 },
      { id: 'fast', label: 'FAST', beatMs: 235 },
    ],
    grooveAssist: [
      { id: 'raw', label: 'NONE' },
      { id: 'light', label: 'LIGHT' },
      { id: 'snap', label: 'MEDIUM' },
      { id: 'locked', label: 'STRONG' },
    ],
    recordingStyle: [
      { id: 'guided', label: 'GUIDED' },
      { id: 'freebuild', label: 'FREE BUILD' },
    ],
  };
  // Palettes: key center + instrument character. Never breaks the pentatonic guarantee.
  const STYLE_DEFS = {
    'space-funk': { root: 110.00, rootSemi: 9, bassWave: 'triangle', keysWave: 'triangle', chimeWave: 'triangle', drumVol: 1, shimmer: 1, bassWeight: 1.08, keyGlow: 1, echo: 0.9, resonance: 1.05 },
    'dream-synth': { root: 123.47, rootSemi: 11, bassWave: 'sine', keysWave: 'sine', chimeWave: 'triangle', drumVol: 0.88, shimmer: 1.5, bassWeight: 0.86, keyGlow: 1.3, echo: 1.35, resonance: 0.85 },
    'boss-rave': { root: 116.54, rootSemi: 10, bassWave: 'sawtooth', keysWave: 'triangle', chimeWave: 'triangle', drumVol: 1.15, shimmer: 1.1, bassWeight: 1.22, keyGlow: 1.08, echo: 0.75, resonance: 1.35, master: 1.06 },
    'chiptune': { root: 146.83, rootSemi: 2, bassWave: 'square', keysWave: 'square', chimeWave: 'square', drumVol: 0.85, shimmer: 0.8, bassWeight: 0.9, keyGlow: 0.86, echo: 0.35, resonance: 1.65 },
    'dark-minor': { root: 103.83, rootSemi: 8, bassWave: 'triangle', keysWave: 'triangle', chimeWave: 'triangle', drumVol: 1.05, shimmer: 0.7, bassWeight: 1.18, keyGlow: 0.9, echo: 0.7, resonance: 1.12, forceMinor: true },
    'vaporwave': { root: 92.50, rootSemi: 6, bassWave: 'sine', keysWave: 'sine', chimeWave: 'triangle', drumVol: 0.85, shimmer: 1.8, bassWeight: 0.8, keyGlow: 1.45, echo: 1.8, resonance: 0.7 },
    'toy-box': { root: 130.81, rootSemi: 0, bassWave: 'triangle', keysWave: 'square', chimeWave: 'sine', drumVol: 0.85, shimmer: 1.35, bassWeight: 0.76, keyGlow: 0.94, echo: 0.65, resonance: 1.45 },
    'steel-island': { root: 98.00, rootSemi: 7, bassWave: 'triangle', keysWave: 'triangle', chimeWave: 'sine', drumVol: 0.92, shimmer: 2.2, bassWeight: 1, keyGlow: 1.08, echo: 1.15, resonance: 1.7 },
    'jazz-club': { root: 116.54, rootSemi: 10, bassWave: 'sine', keysWave: 'triangle', chimeWave: 'sine', drumVol: 0.86, shimmer: 0.9, bassWeight: 0.94, keyGlow: 0.82, echo: 0.55, resonance: 0.95, master: 0.96 },
    'velvet-hall': { root: 98.00, rootSemi: 7, bassWave: 'sine', keysWave: 'triangle', chimeWave: 'sine', drumVol: 0.85, shimmer: 0.72, bassWeight: 1.06, keyGlow: 0.78, echo: 1.2, resonance: 1.28, master: 0.94 },
    'haunted-organ': { root: 87.31, rootSemi: 5, bassWave: 'triangle', keysWave: 'sine', chimeWave: 'triangle', drumVol: 0.86, shimmer: 0.55, bassWeight: 1.12, keyGlow: 1.12, echo: 1.05, resonance: 1.25, forceMinor: true },
    'desert-caravan': { root: 146.83, rootSemi: 2, bassWave: 'triangle', keysWave: 'triangle', chimeWave: 'sine', drumVol: 0.95, shimmer: 1.15, bassWeight: 0.94, keyGlow: 0.96, echo: 0.82, resonance: 1.55 },
    'cyber-garage': { root: 123.47, rootSemi: 11, bassWave: 'sawtooth', keysWave: 'square', chimeWave: 'square', drumVol: 1.15, shimmer: 0.7, bassWeight: 1.25, keyGlow: 1, echo: 0.45, resonance: 1.9, master: 1.08 },
    'crystal-cave': { root: 104.65, rootSemi: 8, bassWave: 'sine', keysWave: 'triangle', chimeWave: 'sine', drumVol: 0.85, shimmer: 2.5, bassWeight: 0.74, keyGlow: 1.35, echo: 1.55, resonance: 1.6 },
  };

  let canvas = null, ctx = null, overlay = null, loopButton = null, resetButton = null, undoButton = null, signalExitButton = null, guidedControls = null, guidedControlsKey = '';
  let freeControls = null, freeChangeButton = null, freeSaveButton = null, freeMenuButton = null;
  let loopButtonStyleCache = null, resetButtonStyleCache = null;
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0, state = 'idle';
  let signalAudioCtx = null, signalMasterGain = null, signalLimiter = null;
  let player, bullets, rocks, sparks, floatTexts, stars, boss;
  let score = 0, signal = 0, distortion = 0, health = 3, elapsed = 0;
  let combo = 0, bestCombo = 0, currentSoloLane = 1;
  let currentLayerIndex = 0, additionsThisLayer = 0, totalAdditions = 0;
  let mode = 'arcade', freeLayerIndex = 0, freeRecording = false;
  let freeLayerMenuKeepsLoop = false;
  let pendingStartMode = 'arcade';
  let setupOpen = false, setupStep = 'palette', guidedStage = 'practice';
  let guidedOverdubBase = null;
  let recordedChoices = [], undoStack = [], grooveByLayer = [], lastGrooveToast = null, replaying = false, replayUntil = 0;
  let undoSeq = 0;
  let replayBall = null, replayHazards = [], replayPickups = [], replayToyScore = 0, replaySpawnAt = 0;
  let jukeboxRows = [], jukeboxBackTarget = 'intro';
  let playAlongPattern = null, playAlongRoundIndex = 0, playAlongListenLoops = 0, playAlongInput = [], playAlongResult = null, playAlongStage = 'listen', playAlongPrevSettings = null;
  let signalSettings = { style: 'space-funk', mood: 'minor', tempo: 'medium', grooveAssist: 'snap', recordingStyle: 'guided' };
  let layerVolumes = { ...DEFAULT_LAYER_VOLUMES };
  let beatMs = DEFAULT_BEAT_MS;
  let laneFlash = [0, 0, 0];
  let loopFlash = [];
  let spawnAt = 0, manualFireAt = 0, beatAt = 0, stepIndex = 0, lastLoopStep = -1;
  let loopEndArmed = false;
  // 'countin': tempo setup before the loop starts.
  let phase = 'countin', countKickPulse = 0, countLockedText = '', tempoPreviewBeatAt = 0, lastTempoPreviewAt = 0, countdown = null;
  let pads = [], padSpawnAt = 0;
  let fxJunk = [], swellInk = 0;
  let loop = [];
  let leftHeld = false, rightHeld = false, pointerActive = false, pointerX = 0, pointerY = 0;
  let pinchActive = false, pinchStartDist = 0, pinchJunk = null, pinchStamped = false;
  let thereminPulse = 0;
  let resizeHandler = null, keyDownHandler = null, keyUpHandler = null;
  let signalShellApplied = false, gestureGuardHandler = null, gestureStartHandler = null, signalHeaderStyles = null, signalHeaderActionStyles = null, signalHeaderBackStyles = null, signalPageStyles = null, signalCanvasStyles = null, signalLoopRowStyles = null, signalLoopButtonStyles = null, signalResetButtonStyles = null, signalUndoButtonStyles = null;
  let imagesReady = false, pilotImg = null;

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function wrapStep(step) {
    const raw = Math.floor(Number(step));
    if (!Number.isFinite(raw)) return 0;
    return ((raw % LOOP_STEPS) + LOOP_STEPS) % LOOP_STEPS;
  }
  function rand(min, max) { return min + Math.random() * (max - min); }
  function now() { return performance.now(); }
  function laneWidth() { return W / LANES.length; }
  function laneIndexForX(x) { return clamp(Math.floor(x / Math.max(1, laneWidth())), 0, LANES.length - 1); }
  function laneCenter(i) { return laneWidth() * (i + 0.5); }
  function isFreeMode() { return mode === 'free'; }
  function isPlayAlongMode() { return mode === 'playalong'; }
  function isGuidedBuildMode() { return mode === 'arcade' && (signalSettings.recordingStyle || 'guided') === 'guided'; }
  function isFreeBuildMode() { return mode === 'arcade' && signalSettings.recordingStyle === 'freebuild'; }
  function isCaptureBuildMode() { return isGuidedBuildMode() && guidedStage === 'record'; }
  function isGuidedReviewStage() { return isGuidedBuildMode() && guidedStage === 'review'; }
  function shouldRecordStamp() { return !isPlayAlongMode() && !(isGuidedBuildMode() && (guidedStage === 'practice' || guidedStage === 'waiting' || guidedStage === 'review')) && (!isFreeMode() || freeRecording); }
  function freeHasRecordedLoop() { return gridStamps().length > 0; }
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
  function guidedCoachActive() { return isGuidedBuildMode() && state === 'playing' && phase === 'build'; }
  // Bottom edge of the loop-grid HUD (title + layer rows + step dots) drawn
  // in drawHud. Every instrument surface must start below this line.
  function loopGridBottom() { return 72 + LAYERS.length * 11 + 8; }
  function playFieldTop() { return guidedCoachActive() ? 286 : loopGridBottom() + 18; }
  function playFieldBottom(limit) {
    const base = H - LOOP_PANEL_H - (guidedCoachActive() ? 124 : 20);
    if (!guidedCoachActive() || !limit) return base;
    return Math.min(base, playFieldTop() + limit);
  }
  function swellSurfaceTop() { return playFieldTop(); }
  function swellSurfaceBottom() { return playFieldBottom(guidedCoachActive() ? 390 : 0); }
  function activeLayerLabel() {
    if (isFreeMode()) return `FREE PLAY: ${activeLayer().name}`;
    if (isPlayAlongMode()) return playAlongStatusLabel();
    if (isGuidedBuildMode()) return `${guidedStage === 'record' ? 'RECORD' : guidedStage === 'review' ? 'REVIEW' : 'PRACTICE'} ${activeLayer().name}`;
    return `PLAY ${activeLayer().name}`;
  }
  function fallbackStepsForType(type) {
    const steps = WRITE_STEPS[type] || [0];
    return steps.map(wrapStep);
  }
  function stepsForChoice(choice) {
    if (choice && Array.isArray(choice.steps) && choice.steps.length) {
      return choice.steps.map(wrapStep);
    }
    return fallbackStepsForType(choice && choice.type);
  }
  function choiceLayerIndex(choice) {
    return clamp(choice && Number.isFinite(choice.layerIndex) ? choice.layerIndex : ((choice && choice.loop ? choice.loop : 1) - 1), 0, LAYERS.length - 1);
  }
  function normalizeLayerVolumes(mix) {
    const src = (mix && mix.layerVolumes) || mix || {};
    const next = { ...DEFAULT_LAYER_VOLUMES };
    LAYERS.forEach(layer => {
      const raw = Number(src[layer.id]);
      next[layer.id] = Number.isFinite(raw) ? clamp(raw, 0, 1.25) : 1;
    });
    return next;
  }
  function layerVolumeForId(id) {
    return Number.isFinite(layerVolumes[id]) ? clamp(layerVolumes[id], 0, 1.25) : 1;
  }
  function slotLayerId(slot) {
    if (slot && DEFAULT_LAYER_VOLUMES.hasOwnProperty(slot.layerId)) return slot.layerId;
    const byIndex = slot && LAYERS[choiceLayerIndex(slot)];
    if (byIndex) return byIndex.id;
    return slot && DEFAULT_LAYER_VOLUMES.hasOwnProperty(slot.inst) ? slot.inst : 'drums';
  }
  function setLayerVolume(id, value) {
    if (!DEFAULT_LAYER_VOLUMES.hasOwnProperty(id)) return;
    const raw = Number(value);
    layerVolumes[id] = Number.isFinite(raw) ? clamp(raw / 100, 0, 1.25) : 1;
    const label = document.getElementById(`signal-mix-value-${id}`);
    if (label) label.textContent = `${Math.round(layerVolumes[id] * 100)}%`;
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
  function ensureFreeControls() {
    if (freeControls || !loopButton || !loopButton.parentElement) return;
    const row = loopButton.parentElement;
    freeControls = document.createElement('div');
    freeControls.style.display = 'none';
    freeControls.style.gap = '5px';
    freeControls.style.alignItems = 'stretch';
    freeControls.style.justifyContent = 'center';
    const makeButton = (text, handler) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'signal-loop-btn';
      btn.style.flex = '0 1 auto';
      btn.style.minWidth = '0';
      btn.style.maxWidth = 'none';
      btn.style.width = '76px';
      btn.style.padding = '0 5px';
      btn.style.fontSize = '8px';
      btn.style.letterSpacing = '0.8px';
      btn.textContent = text;
      btn.addEventListener('click', handler);
      return btn;
    };
    freeChangeButton = makeButton('LAYER', () => showFreeLayerMenu(true));
    freeSaveButton = makeButton('SAVE', showFreeSave);
    freeMenuButton = makeButton('MENU', showIntro);
    freeControls.append(freeChangeButton, freeSaveButton, freeMenuButton);
    row.appendChild(freeControls);
  }
  function cacheButtonStyles() {
    if (!loopButtonStyleCache && loopButton) {
      loopButtonStyleCache = {
        flex: loopButton.style.flex,
        width: loopButton.style.width,
        maxWidth: loopButton.style.maxWidth,
        padding: loopButton.style.padding,
        fontSize: loopButton.style.fontSize,
        letterSpacing: loopButton.style.letterSpacing,
      };
    }
    if (!resetButtonStyleCache && resetButton) {
      resetButtonStyleCache = {
        width: resetButton.style.width,
        fontSize: resetButton.style.fontSize,
        letterSpacing: resetButton.style.letterSpacing,
        padding: resetButton.style.padding,
      };
    }
  }
  function restoreButtonStyles() {
    if (loopButtonStyleCache && loopButton) Object.assign(loopButton.style, loopButtonStyleCache);
    if (resetButtonStyleCache && resetButton) Object.assign(resetButton.style, resetButtonStyleCache);
  }
  function applyFreeButtonStyles() {
    cacheButtonStyles();
    if (loopButton) {
      loopButton.style.flex = '1 1 auto';
      loopButton.style.width = 'auto';
      loopButton.style.maxWidth = 'none';
      loopButton.style.padding = '0 6px';
      loopButton.style.fontSize = '10px';
      loopButton.style.letterSpacing = '1.8px';
    }
    if (resetButton) {
      resetButton.style.width = '72px';
      resetButton.style.fontSize = '9px';
      resetButton.style.letterSpacing = '0.8px';
      resetButton.style.padding = '0 5px';
    }
  }
  function updateFreeControls() {
    ensureFreeControls();
    if (!freeControls) return;
    const show = false;
    const hasLoop = freeHasRecordedLoop();
    freeControls.style.display = show && hasLoop ? 'contents' : 'none';
    if (loopButton && loopButton.parentElement) {
      loopButton.parentElement.style.flexWrap = 'nowrap';
      loopButton.parentElement.style.gap = show ? '7px' : '';
      loopButton.parentElement.style.width = show ? (hasLoop ? 'min(430px, calc(100vw - 18px))' : 'min(360px, calc(100vw - 18px))') : '';
    }
    if (show) applyFreeButtonStyles();
    else restoreButtonStyles();
    if (freeSaveButton) {
      freeChangeButton.classList.toggle('hidden', true);
      freeSaveButton.classList.toggle('hidden', !hasLoop);
      freeMenuButton.classList.toggle('hidden', true);
    }
  }
  function updateLoopButton() {
    if (!loopButton) return;
    const show = state === 'playing' && phase !== 'countin' && phase !== 'countdown';
    // In Guided build the big coach buttons at the bottom own every action.
    // The top bar keeps only UNDO (while recording) and the exit ×.
    const guidedBuild = isGuidedBuildMode() && phase === 'build';
    const showLoop = show && !guidedBuild;
    const wasHidden = loopButton.classList.contains('hidden');
    loopButton.classList.toggle('hidden', !showLoop);
    if (wasHidden === showLoop) fitCanvas();
    if (resetButton) resetButton.classList.toggle('hidden', !(show && phase === 'build' && !isPlayAlongMode() && !guidedBuild));
    if (undoButton) undoButton.classList.toggle('hidden', !(show && phase === 'build' && !isPlayAlongMode() && (!guidedBuild || guidedStage === 'record')));
    if (!show) {
      loopButton.disabled = false;
      updateFreeControls();
      syncSignalChrome();
      updateGuidedControls();
      return;
    }
    const canUndo = canUndoLastStamp();
    loopButton.disabled = false;
    if (isFreeMode()) {
      loopButton.textContent = 'NEXT LAYER ›';
      if (resetButton) {
        resetButton.classList.toggle('hidden', phase !== 'build');
        resetButton.textContent = 'CLEAR';
        resetButton.title = 'Clear Free Mode loop';
        resetButton.setAttribute('aria-label', 'Clear Free Mode loop');
      }
    } else if (!guidedBuild) {
      if (isPlayAlongMode() && phase === 'build') {
        loopButton.textContent = playAlongStage === 'listen' ? `WATCH ${Math.min(playAlongListenLoops + 1, playAlongDemoLoopGoal())}/${playAlongDemoLoopGoal()}` : 'YOUR TURN';
        loopButton.disabled = true;
      } else if (loopEndArmed) loopButton.textContent = 'SAVING LOOP...';
      else loopButton.textContent = currentLayerIndex >= LAYERS.length - 1 ? 'FINISH TRACK' : 'NEXT LAYER ›';
      // Reset (↻) only while actively building a layer — not during count-in.
      if (resetButton) {
        resetButton.classList.toggle('hidden', phase !== 'build' || isPlayAlongMode());
        resetButton.textContent = 'CLEAR';
        resetButton.title = 'Clear this layer';
        resetButton.setAttribute('aria-label', 'Clear this layer');
      }
    }
    if (undoButton) {
      undoButton.disabled = !canUndo;
      undoButton.textContent = 'UNDO';
      undoButton.title = canUndo ? 'Undo last note' : 'Nothing to undo yet';
      undoButton.setAttribute('aria-label', canUndo ? 'Undo last note' : 'Nothing to undo yet');
      undoButton.style.opacity = canUndo ? '1' : '0.46';
      undoButton.style.cursor = canUndo ? 'pointer' : 'default';
    }
    updateFreeControls();
    syncSignalChrome();
    updateGuidedControls();
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
      signalLimiter.threshold.value = -6;
      signalLimiter.knee.value = 6;
      signalLimiter.ratio.value = 6;
      signalLimiter.attack.value = 0.004;
      signalLimiter.release.value = 0.16;
      signalMasterGain.connect(signalLimiter);
      signalLimiter.connect(c.destination);
    }
    refreshSignalOutput();
    return signalMasterGain;
  }

  function refreshSignalOutput() {
    if (!signalMasterGain || !signalLimiter) return;
    const d = soundProfile();
    // The ♪ toggle mutes the arcade's background music, not the instrument
    // the player is holding — game audio stays live regardless.
    signalMasterGain.gain.value = SIGNAL_MASTER_GAIN * (d.master || 1);
    signalLimiter.threshold.value = -6;
    signalLimiter.knee.value = 6;
    signalLimiter.ratio.value = 6;
    signalLimiter.attack.value = 0.004;
    signalLimiter.release.value = 0.16;
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

  function filteredNoise(delay, dur, vol, filterType, cutoff, q, endCutoff) {
    const c = audioCtx();
    if (!c) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur));
    const buffer = c.createBuffer(1, len, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const attack = Math.min(1, i / Math.max(1, c.sampleRate * 0.003));
      const release = Math.pow(1 - i / len, 1.6);
      data[i] = (Math.random() * 2 - 1) * attack * release;
    }
    const src = c.createBufferSource();
    const filter = c.createBiquadFilter();
    const g = c.createGain();
    const t0 = c.currentTime + Math.max(0.006, delay || 0);
    src.buffer = buffer;
    filter.type = filterType || 'bandpass';
    filter.frequency.setValueAtTime(Math.max(40, cutoff || 1800), t0);
    if (endCutoff) filter.frequency.exponentialRampToValueAtTime(Math.max(40, endCutoff), t0 + dur);
    filter.Q.setValueAtTime(q || 1.2, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(Math.max(0.0001, vol), t0 + 0.003);
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
    const pieceGain = DRUM_PIECE_GAINS[piece] || 0.78;
    const v = (vel == null ? 1 : vel) * d.drumVol * DRUM_BUS_GAIN * pieceGain;
    const dl = delay || 0;
    // tune 0..1 maps across the pad row: left = lower/tighter, right = higher/opener.
    const tn = tune == null ? 0.5 : clamp(tune, 0, 1);
    const velvet = signalSettings.style === 'velvet-hall';
    if (piece === 'hat') {
      filteredNoise(dl, (velvet ? 0.070 : 0.046) + tn * 0.030, (velvet ? 0.026 : 0.034) * v, 'highpass', velvet ? 3900 + tn * 1000 : 4700 + tn * 1300, 0.7);
      filteredNoise(dl + 0.010, velvet ? 0.046 : 0.032, (velvet ? 0.014 : 0.016) * v, 'bandpass', 7200 + tn * 900, 1.0);
      filteredNoise(dl + 0.004, 0.020, 0.010 * v, 'bandpass', 3100 + tn * 700, 1.5);
    } else if (piece === 'tri') {
      const f = 2850 + tn * 1150;
      filteredNoise(dl, 0.012, 0.010 * v, 'highpass', 7200, 0.8);
      tone(f, 'sine', dl, 0.46, 0.040 * v, f * 1.002);
      tone(f * 1.505, 'sine', dl + 0.004, 0.30, 0.014 * v, f * 1.508);
      tone(f * 2.01, 'sine', dl + 0.008, 0.20, 0.007 * v, f * 2.012);
    } else if (piece === 'bell') {
      const f = 720 + tn * 260;
      filteredNoise(dl, 0.018, 0.014 * v, 'bandpass', 2400 + tn * 420, 2.8);
      tone(f, 'triangle', dl, 0.22, 0.038 * v, f * 0.996);
      tone(f * 1.47, 'sine', dl + 0.003, 0.18, 0.021 * v, f * 1.465);
      tone(f * 2.18, 'sine', dl + 0.006, 0.11, 0.010 * v, f * 2.17);
    } else if (piece === 'gong') {
      const f = 115 + tn * 42;
      filteredNoise(dl, 0.30 + tn * 0.12, 0.030 * v, 'lowpass', 1800 + tn * 450, 0.8, 520 + tn * 160);
      tone(f, 'sine', dl, 0.34, 0.070 * v, f * 0.74);
      tone(f * 1.56, 'triangle', dl + 0.010, 0.22, 0.025 * v, f * 1.16);
    } else if (piece === 'clave') {
      const f = 1550 + tn * 420;
      filteredNoise(dl, 0.018, 0.010 * v, 'bandpass', f, 5.5);
      tone(f, 'triangle', dl, 0.040, 0.024 * v, f * 0.96);
      tone(f * 0.55, 'sine', dl + 0.002, 0.035, 0.010 * v, f * 0.53);
    } else if (piece === 'guiro') {
      for (let i = 0; i < 7; i++) {
        const scrapeT = i / 6;
        filteredNoise(dl + i * (0.014 + tn * 0.004), 0.020, 0.016 * v, 'bandpass', 760 + scrapeT * (1250 + tn * 700), 5.4, 620 + scrapeT * 900);
      }
      filteredNoise(dl, 0.13 + tn * 0.03, 0.017 * v, 'bandpass', 1180 + tn * 520, 2.2, 760 + tn * 260);
    } else if (piece === 'shaker') {
      filteredNoise(dl, (velvet ? 0.105 : 0.064) + tn * 0.040, (velvet ? 0.026 : 0.030) * v, 'highpass', velvet ? 3000 + tn * 700 : 3900 + tn * 900, 0.8);
      filteredNoise(dl + 0.034, velvet ? 0.060 : 0.036, (velvet ? 0.016 : 0.017) * v, 'highpass', 5000 + tn * 900, 0.9);
    } else if (piece === 'cabasa') {
      for (let i = 0; i < 8; i++) filteredNoise(dl + i * 0.010, 0.016, 0.011 * v, 'highpass', 3300 + tn * 900, 1.4);
      filteredNoise(dl + 0.006, 0.11, 0.020 * v, 'bandpass', 2200 + tn * 650, 3.4, 1750 + tn * 420);
    } else if (piece === 'tom') {
      const f = 112 + tn * 126;
      filteredNoise(dl, 0.020, 0.018 * v, 'lowpass', 1200 + tn * 400, 0.9);
      tone(f, 'sine', dl, 0.190, 0.082 * v, f * 0.58);
      tone(f * 1.35, 'triangle', dl + 0.004, 0.105, 0.020 * v, f * 0.94);
    } else if (piece === 'snare') {
      filteredNoise(dl, 0.105 + tn * 0.030, 0.050 * v, 'highpass', 2100 + tn * 600, 0.9);
      filteredNoise(dl + 0.006, 0.050, 0.026 * v, 'bandpass', 5200 + tn * 900, 1.6);
      tone(185 + tn * 45, 'triangle', dl, 0.070, 0.026 * v, 118 + tn * 16);
    } else if (piece === 'clap') {
      filteredNoise(dl, 0.025, 0.018 * v, 'highpass', 1800, 0.8);
      filteredNoise(dl + 0.018, 0.035, 0.024 * v, 'highpass', 1900, 0.8);
      filteredNoise(dl + 0.042, 0.075, 0.018 * v, 'highpass', 1700, 0.8);
    } else if (piece === 'rim') {
      const f = 470 + tn * 170;
      filteredNoise(dl, 0.018, 0.030 * v, 'bandpass', 1350 + tn * 520, 2.6, 980 + tn * 320);
      filteredNoise(dl + 0.004, 0.030, 0.018 * v, 'highpass', 2400 + tn * 600, 0.7);
      tone(f, 'triangle', dl, 0.046, 0.030 * v, f * 0.72);
      tone(f * 1.92, 'sine', dl + 0.002, 0.022, 0.012 * v, f * 1.42);
    } else if (piece === 'kick') {
      const f = velvet ? 68 + tn * 12 : 82 + tn * 18;
      tone(f * 1.9, 'triangle', dl, 0.018, 0.030 * v, f * 1.18);
      tone(f, 'sine', dl + 0.002, velvet ? 0.22 : 0.175, (velvet ? 0.090 : 0.118) * v, 34 + tn * 8);
      tone(f * 0.52, 'sine', dl + 0.006, velvet ? 0.25 : 0.21, (velvet ? 0.040 : 0.052) * v, 28);
      noise(dl + 0.001, 0.018, (velvet ? 0.008 : 0.015) * v, true);
    } else {
      filteredNoise(dl, 0.045, 0.018 * v, 'bandpass', 1800 + tn * 900, 1.6);
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
    const vel = (slot.vel || 1) * layerVolumeForId(slotLayerId(slot));
    if (slot.inst === 'drums') playInstrument('drums', { pieces: slot.pieces, tunes: slot.tunes, vel });
    else if (slot.inst === 'keys' && slot.notes && slot.notes.length) playInstrument(slot.inst, { notes: slot.notes, vel });
    else if (slot.inst === 'fx') playInstrument(slot.inst, { note: slot.note, piece: slot.piece, vel });
    else playInstrument(slot.inst, { note: slot.note, vel });
  }

  function hasNonFoundationLoopContent() {
    return loop && loop.some(bucket => (bucket || []).some(slot => slot && !slot.foundation));
  }

  function playPulseBed() {
    // Once the player has recorded anything, the loop speaks for itself —
    // no bed underneath in any mode. On an empty loop, one soft kick at the
    // top keeps the pulse findable without sounding like stray percussion.
    if (hasNonFoundationLoopContent()) return;
    if (state !== 'playing' || phase !== 'build') return;
    if (isGuidedBuildMode() && (currentLayerIndex > 0 || guidedStage === 'review')) return;
    if (stepIndex === 0) playDrumPiece('kick', 0.22, 0);
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

  function ensureGuidedControls() {
    if (guidedControls) return guidedControls;
    const host = document.body;
    guidedControls = document.createElement('div');
    guidedControls.id = 'signal-guided-controls';
    Object.assign(guidedControls.style, {
      position: 'fixed',
      left: '10px',
      right: '10px',
      bottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)',
      zIndex: '999999',
      display: 'none',
      gridTemplateColumns: '1fr 1fr',
      gap: '8px',
      pointerEvents: 'auto',
      boxSizing: 'border-box',
    });
    host.appendChild(guidedControls);
    return guidedControls;
  }

  function guidedControlButton(label, handler, primary) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = primary ? 'signal-loop-btn' : 'signal-reset-btn';
    btn.textContent = label;
    Object.assign(btn.style, {
      minHeight: '48px',
      width: '100%',
      maxWidth: 'none',
      minWidth: '0',
      fontSize: '11px',
      letterSpacing: '1.15px',
      lineHeight: '1.12',
      padding: '0 8px',
      boxSizing: 'border-box',
      pointerEvents: 'auto',
      whiteSpace: 'normal',
      borderRadius: '11px',
      border: primary ? '2px solid rgba(0,229,255,.95)' : '2px solid rgba(255,255,255,.45)',
      background: primary ? 'rgba(0,229,255,.20)' : 'rgba(2,4,14,.94)',
      color: primary ? '#eaffff' : '#eaffff',
      boxShadow: primary ? '0 0 24px rgba(0,229,255,.35)' : '0 0 16px rgba(0,0,0,.35)',
    });
    let firedAt = 0;
    const activate = e => {
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
      const t = performance.now();
      if (t - firedAt < 180) return;
      firedAt = t;
      try { if (typeof SFX !== 'undefined' && SFX.menuSelect) SFX.menuSelect(); } catch(err) {}
      handler();
    };
    btn.addEventListener('pointerdown', activate);
    btn.addEventListener('touchend', activate, { passive: false });
    btn.addEventListener('click', activate);
    return btn;
  }

  function updateGuidedControls() {
    const el = ensureGuidedControls();
    const visible = isGuidedBuildMode() && state === 'playing' && phase === 'build';
    if (!visible) {
      el.style.display = 'none';
      if (guidedControlsKey) {
        el.innerHTML = '';
        guidedControlsKey = '';
      }
      return;
    }

    const key = `${guidedStage}:${currentLayerIndex}:${LAYERS.length}:${guidedOverdubBase ? 'redo' : 'base'}`;
    el.style.display = 'grid';
    // Do not rebuild the buttons every animation frame. Recreating the DOM
    // while a finger is down can swallow the click/tap before READY fires.
    if (guidedControlsKey === key && el.childNodes.length) return;

    guidedControlsKey = key;
    el.innerHTML = '';
    el.style.gap = '8px';
    if (guidedStage === 'practice') {
      el.style.gridTemplateColumns = '1fr 1fr';
      el.appendChild(guidedControlButton('SKIP LAYER', skipGuidedLayer, false));
      el.appendChild(guidedControlButton('READY', startGuidedRecordPass, true));
      return;
    }
    if (guidedStage === 'waiting') {
      el.style.gridTemplateColumns = '1fr 1fr';
      el.appendChild(guidedControlButton('BACK TO PRACTICE', () => {
        guidedStage = 'practice';
        updateLoopButton();
        showLayerToast();
      }, false));
      el.appendChild(guidedControlButton('START EMPTY', startGuidedRecordingWithRest, true));
      return;
    }
    if (guidedStage === 'record') {
      el.style.gridTemplateColumns = '1fr';
      const label = document.createElement('div');
      label.textContent = 'RECORDING...';
      Object.assign(label.style, {
        minHeight: '44px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '12px',
        letterSpacing: '1.5px',
        color: '#ffe61a',
        textShadow: '0 0 14px rgba(255,230,26,.6)',
        pointerEvents: 'none',
      });
      el.appendChild(label);
      return;
    }
    if (guidedStage === 'review') {
      el.style.gridTemplateColumns = 'repeat(2, minmax(0, 1fr))';
      const lastLayer = currentLayerIndex >= LAYERS.length - 1;
      if (guidedOverdubBase) {
        el.appendChild(guidedControlButton('REDO ADD', undoLastGuidedOverdub, false));
        el.appendChild(guidedControlButton('START OVER', captureRetryLayer, false));
        el.appendChild(guidedControlButton('ADD MORE', captureAddMoreLayer, false));
        el.appendChild(guidedControlButton(lastLayer ? 'FINISH TRACK' : 'KEEP', captureNextLayer, true));
        return;
      }
      el.appendChild(guidedControlButton('START OVER', captureRetryLayer, false));
      el.appendChild(guidedControlButton('ADD MORE', captureAddMoreLayer, false));
      if (lastLayer) {
        const keep = guidedControlButton('FINISH TRACK', captureNextLayer, true);
        keep.style.gridColumn = '1 / -1';
        el.appendChild(keep);
        return;
      }
      // A proud two-layer loop is a finished track too — no need to march
      // through all six layers to reach the mix screen.
      el.appendChild(guidedControlButton('FINISH TRACK', () => {
        guidedOverdubBase = null;
        finishTrack();
      }, false));
      el.appendChild(guidedControlButton('KEEP', captureNextLayer, true));
    }
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
      signalExitButton.title = 'Quit Space and Sound';
      signalExitButton.setAttribute('aria-label', 'Quit Space and Sound');
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

  function ensureSignalUndoButton() {
    const row = document.querySelector('#pg-signal .signal-loop-row');
    if (!row) return null;
    if (!undoButton) {
      undoButton = document.createElement('button');
      undoButton.id = 'signal-undo-btn';
      undoButton.type = 'button';
      undoButton.className = 'signal-reset-btn signal-undo-btn hidden';
      undoButton.textContent = 'UNDO';
      undoButton.title = 'Undo last note';
      undoButton.setAttribute('aria-label', 'Undo last note');
      undoButton.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        if (canUndoLastStamp()) undoLastStamp();
      });
    }
    if (undoButton.parentNode !== row) row.appendChild(undoButton);
    return undoButton;
  }

  function canUndoLastStamp() {
    if (state !== 'playing' || phase !== 'build' || !undoStack.length) return false;
    const lastUndo = undoStack[undoStack.length - 1];
    return lastUndo && lastUndo.layerIndex === currentLayerIndex;
  }

  function syncSignalChrome() {
    const page = document.getElementById('pg-signal');
    const header = document.querySelector('#pg-signal .cats-header');
    const actions = document.querySelector('#pg-signal .arcade-header-actions');
    const headerBack = document.querySelector('#pg-signal .arcade-exit-btn');
    const row = document.querySelector('#pg-signal .signal-loop-row');
    const inRun = state === 'playing' || state === 'replay';
    const runBarVisible = state === 'playing' && phase === 'build';

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
      // No scores in this game — the shared leaderboard button doesn't apply.
      Array.from(actions.querySelectorAll('.arcade-lb-btn')).forEach(btn => {
        btn.style.display = 'none';
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
    row.style.display = runBarVisible ? 'grid' : 'none';
    if (!runBarVisible) return;
    const exit = ensureSignalExitButton();
    const undo = ensureSignalUndoButton();
    if (resetButton && resetButton.parentNode === row) row.appendChild(resetButton);
    if (undo && undo.parentNode === row) row.appendChild(undo);
    if (loopButton && loopButton.parentNode === row) row.appendChild(loopButton);
    if (exit && exit.parentNode === row) row.appendChild(exit);
    row.style.position = 'absolute';
    row.style.top = 'calc(env(safe-area-inset-top, 0px) + 6px)';
    row.style.left = '8px';
    row.style.right = '8px';
    row.style.width = 'auto';
    row.style.maxWidth = 'none';
    row.style.margin = '0';
    row.style.zIndex = '60';
    row.style.gridTemplateColumns = '58px 58px minmax(0, 1fr) 42px';
    row.style.gap = '5px';
    row.style.alignItems = 'stretch';
    row.style.justifyContent = 'stretch';
    row.style.boxSizing = 'border-box';
    row.style.padding = '0';
    row.style.pointerEvents = 'auto';

    if (loopButton) {
      if (!signalLoopButtonStyles) signalLoopButtonStyles = snapshotStyles(loopButton, ['gridColumn', 'width', 'maxWidth', 'minHeight', 'fontSize', 'letterSpacing', 'padding', 'boxSizing']);
      loopButton.style.gridColumn = '3';
      loopButton.style.width = '100%';
      loopButton.style.maxWidth = 'none';
      loopButton.style.minHeight = '40px';
      loopButton.style.fontSize = '9px';
      loopButton.style.letterSpacing = '1.6px';
      loopButton.style.padding = '0 6px';
      loopButton.style.boxSizing = 'border-box';
    }
    if (resetButton) {
      if (!signalResetButtonStyles) signalResetButtonStyles = snapshotStyles(resetButton, ['gridColumn', 'width', 'minHeight', 'fontSize', 'letterSpacing', 'padding', 'boxSizing']);
      resetButton.style.gridColumn = '1';
      resetButton.style.width = '58px';
      resetButton.style.minHeight = '40px';
      resetButton.style.fontSize = '8px';
      resetButton.style.letterSpacing = '0.4px';
      resetButton.style.padding = '0 3px';
      resetButton.style.boxSizing = 'border-box';
    }
    if (undo) {
      if (!signalUndoButtonStyles) signalUndoButtonStyles = snapshotStyles(undo, ['gridColumn', 'width', 'minHeight', 'fontSize', 'letterSpacing', 'padding', 'boxSizing', 'opacity', 'cursor']);
      const canUndo = canUndoLastStamp();
      undo.classList.toggle('hidden', phase !== 'build' || isPlayAlongMode() || (isGuidedBuildMode() && guidedStage !== 'record'));
      undo.disabled = !canUndo;
      undo.textContent = 'UNDO';
      undo.style.opacity = canUndo ? '1' : '0.46';
      undo.style.cursor = canUndo ? 'pointer' : 'default';
      undo.style.gridColumn = '2';
      undo.style.width = '58px';
      undo.style.minHeight = '40px';
      undo.style.fontSize = '8px';
      undo.style.letterSpacing = '0.4px';
      undo.style.padding = '0 3px';
      undo.style.boxSizing = 'border-box';
    }
    if (exit) {
      exit.style.gridColumn = '4';
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
    restoreStyles(undoButton, signalUndoButtonStyles);
    signalHeaderStyles = null;
    signalHeaderActionStyles = null;
    signalHeaderBackStyles = null;
    signalLoopRowStyles = null;
    signalLoopButtonStyles = null;
    signalResetButtonStyles = null;
    signalUndoButtonStyles = null;
    if (undoButton) {
      undoButton.remove();
      undoButton = null;
    }
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

  function resetRun(nextMode) {
    mode = nextMode || 'arcade';
    freeRecording = false;
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
    if (!isFreeMode()) applySettings();
    currentLayerIndex = isFreeMode() ? freeLayerIndex : 0;
    additionsThisLayer = 0;
    totalAdditions = 0;
    recordedChoices = [];
    undoStack = [];
    undoSeq = 0;
    grooveByLayer = Array.from({ length: LAYERS.length }, () => null);
    lastGrooveToast = null;
    replaying = false;
    replayUntil = 0;
    playAlongPattern = null;
    playAlongRoundIndex = 0;
    playAlongListenLoops = 0;
    playAlongInput = [];
    playAlongResult = null;
    playAlongStage = 'listen';
    layerVolumes = { ...DEFAULT_LAYER_VOLUMES };
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
    guidedStage = 'practice';
    phase = isFreeMode() ? 'build' : 'countin';
    countKickPulse = 0;
    countLockedText = '';
    tempoPreviewBeatAt = 0;
    lastTempoPreviewAt = 0;
    countdown = null;
    padSpawnAt = 0;
    fxJunk = [];
    swellInk = 0;
    pinchActive = false;
    pinchJunk = null;
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

  function initFxJunk() {
    fxJunk = [];
    const top = playFieldTop();
    const bottom = Math.max(top + 160, playFieldBottom(360));
    activeLayer().options.forEach((fx, i) => {
      fxJunk.push({
        ...fx,
        lane: i,
        x: W * (0.23 + i * 0.27),
        y: top + (bottom - top) * (0.34 + (i % 2) * 0.24),
        baseX: W * (0.23 + i * 0.27),
        baseY: top + (bottom - top) * (0.34 + (i % 2) * 0.24),
        r: 24 + i * 3,
        rot: rand(0, Math.PI * 2),
        spin: rand(-0.45, 0.45),
        pulse: 0,
        armed: 0,
        driftSeed: rand(0, Math.PI * 2),
      });
    });
  }

  function initReplayPlayground() {
    replayToyScore = 0;
    replaySpawnAt = performance.now() + 900;
    replayBall = {
      x: W * 0.5,
      y: (H - LOOP_PANEL_H) * 0.45,
      vx: rand(-85, 85) || 70,
      vy: -185,
      r: 9,
      color: '#ffe61a',
      pulse: 0,
    };
    replayHazards = [];
    replayPickups = [];
    bullets = [];
    player = player || { x: W * 0.5, y: H - LOOP_PANEL_H - 28, r: 17, cooldown: 0 };
    player.x = W * 0.5;
    player.y = H - LOOP_PANEL_H - 28;
  }

  function spawnReplayThing() {
    const isPickup = Math.random() < 0.38;
    const x = rand(30, W - 30);
    const y = rand(132, Math.max(160, (H - LOOP_PANEL_H) * 0.48));
    if (isPickup) {
      const deg = Math.floor(rand(0, 9.99));
      replayPickups.push({
        x, y,
        vx: rand(-16, 16),
        vy: rand(12, 28),
        r: rand(7, 11),
        deg,
        color: ['#ff2db8', '#7bffea', '#ffe61a'][Math.floor(Math.random() * 3)],
        pulse: 0,
      });
      return;
    }
    const hp = Math.random() < 0.35 ? 3 : 2;
    const hazard = {
      x, y,
      vx: rand(-26, 26),
      vy: rand(18, 36),
      r: rand(14, 24),
      hp,
      maxHp: hp,
      rot: rand(0, Math.PI * 2),
      spin: rand(-1.3, 1.3),
      color: Math.random() < 0.5 ? '#00e5ff' : '#ff8a3d',
      pulse: 0,
    };
    replayHazards.push(hazard);
    playPitched('chimes', degreeFreq(hp + 1, 4), 0.18, 0);
  }

  function fireReplayProjectile() {
    if (state !== 'replay' || !player) return;
    if (bullets.length > 12) bullets.shift();
    bullets.push({ x: player.x, y: player.y - 20, vy: -440, r: 4 });
    noise(0, 0.018, 0.010, true);
  }

  function resetReplayBall() {
    if (!replayBall) return;
    replayBall.x = W * 0.5;
    replayBall.y = (H - LOOP_PANEL_H) * 0.45;
    replayBall.vx = rand(-90, 90) || 80;
    replayBall.vy = -180;
    replayBall.pulse = 1;
  }

  function updateReplayPlayground(dt, t) {
    if (!replayBall) initReplayPlayground();
    const top = 124;
    const bottom = H - LOOP_PANEL_H - 12;
    const move = (leftHeld ? -1 : 0) + (rightHeld ? 1 : 0);
    if (pointerActive) player.x += (pointerX - player.x) * Math.min(1, dt / 90);
    else player.x += move * 285 * dt / 1000;
    player.x = clamp(player.x, 24, W - 24);
    player.y = H - LOOP_PANEL_H - 28;

    const b = replayBall;
    b.x += b.vx * dt / 1000;
    b.y += b.vy * dt / 1000;
    b.pulse = Math.max(0, b.pulse - dt / 260);
    if (b.x < b.r + 5) { b.x = b.r + 5; b.vx = Math.abs(b.vx); playPitched('chimes', degreeFreq(1, 4), 0.22, 0); }
    if (b.x > W - b.r - 5) { b.x = W - b.r - 5; b.vx = -Math.abs(b.vx); playPitched('chimes', degreeFreq(3, 4), 0.22, 0); }
    if (b.y < top) { b.y = top; b.vy = Math.abs(b.vy); playPitched('keys', degreeFreq(5, 2), 0.24, 0); }
    if (b.y > bottom) {
      noise(0, 0.055, 0.018, false);
      resetReplayBall();
    }

    const paddleW = 58;
    const paddleH = 14;
    if (b.y + b.r >= player.y - paddleH && b.y - b.r <= player.y + 6 && Math.abs(b.x - player.x) <= paddleW * 0.5) {
      const off = clamp((b.x - player.x) / (paddleW * 0.5), -1, 1);
      b.y = player.y - paddleH - b.r;
      b.vx = off * 230;
      b.vy = -Math.max(190, Math.abs(b.vy) + 8);
      b.pulse = 1;
      replayToyScore += 1;
      playDrumPiece('rim', 0.55, 0, (off + 1) * 0.5);
      burst(b.x, b.y, b.color, 6);
    }

    if (t >= replaySpawnAt) {
      spawnReplayThing();
      replaySpawnAt = t + rand(900, 1500);
    }
    replayHazards.forEach(h => {
      h.x += h.vx * dt / 1000;
      h.y += h.vy * dt / 1000;
      h.rot += h.spin * dt / 1000;
      h.pulse = Math.max(0, h.pulse - dt / 300);
      if (h.x < h.r || h.x > W - h.r) h.vx *= -1;
      const dx = b.x - h.x, dy = b.y - h.y;
      const minD = b.r + h.r;
      if (dx * dx + dy * dy <= minD * minD) {
        const a = Math.atan2(dy, dx);
        b.vx = Math.cos(a) * 210;
        b.vy = Math.sin(a) * 210;
        h.hp -= 1;
        h.pulse = 1;
        b.pulse = 1;
        replayToyScore += 2;
        playDrumPiece(h.hp <= 0 ? 'snare' : 'tom', 0.55, 0, clamp(h.x / W, 0, 1));
        burst(h.x, h.y, h.color, 8);
        if (h.hp <= 0) h.broken = true;
      }
    });
    replayPickups.forEach(p => {
      p.x += p.vx * dt / 1000;
      p.y += p.vy * dt / 1000;
      p.pulse = Math.max(0, p.pulse - dt / 280);
      const dx = b.x - p.x, dy = b.y - p.y;
      if (dx * dx + dy * dy <= (b.r + p.r) * (b.r + p.r)) {
        p.pulse = 1;
        p.collected = true;
        b.pulse = 1;
        replayToyScore += 3;
        playPitched('chimes', degreeFreq(p.deg, 4), 0.55, 0);
        burst(p.x, p.y, p.color, 10);
      }
    });
    bullets.forEach(projectile => { projectile.y += projectile.vy * dt / 1000; });
    bullets = bullets.filter(projectile => projectile.y > 104);
    for (let i = replayHazards.length - 1; i >= 0; i--) {
      const h = replayHazards[i];
      for (let j = bullets.length - 1; j >= 0; j--) {
        const projectile = bullets[j];
        const dx = projectile.x - h.x, dy = projectile.y - h.y;
        if (dx * dx + dy * dy <= (projectile.r + h.r) * (projectile.r + h.r)) {
          bullets.splice(j, 1);
          h.hp -= 1;
          h.pulse = 1;
          replayToyScore += 2;
          playFxGesture(h.hp <= 0 ? 'warp' : 'echo', degreeFreq(4 + h.hp, 4), 0.34, 0, { intensity: 0.45, tension: 0.7 });
          burst(h.x, h.y, h.color, 12);
          if (h.hp <= 0) replayHazards.splice(i, 1);
          break;
        }
      }
    }
    replayHazards = replayHazards.filter(h => !h.broken && h.y < bottom + 70).slice(-8);
    replayPickups = replayPickups.filter(p => !p.collected && p.y < bottom + 60).slice(-8);
  }

  function updateFxJunk(dt, t) {
    if (!fxActive()) return;
    if (!fxJunk.length) initFxJunk();
    fxJunk.forEach((j, i) => {
      const time = t * 0.001;
      j.x = clamp(j.baseX + Math.sin(time * 0.45 + j.driftSeed) * 14, j.r + 10, W - j.r - 10);
      j.y = j.baseY + Math.cos(time * 0.38 + j.driftSeed + i) * 10;
      j.rot += j.spin * dt / 1000;
      j.pulse = Math.max(0, j.pulse - dt / 520);
      j.armed = Math.max(0, j.armed - dt / 900);
    });
  }

  function drumsActive() {
    return state === 'playing' && phase === 'build' && activeLayer().inst === 'drums';
  }

  // Which orb-driven layer is live: chimes only. Swell and FX now have
  // their own surfaces so Free Mode does not become six versions of tapping.
  function orbLayerInst() {
    if (state !== 'playing' || phase !== 'build') return null;
    const inst = activeLayer().inst;
    return inst === 'chimes' ? inst : null;
  }

  function chimesActive() {
    return !!orbLayerInst();
  }

  function swellActive() {
    return state === 'playing' && phase === 'build' && activeLayer().inst === 'swell';
  }

  function fxActive() {
    return state === 'playing' && phase === 'build' && activeLayer().inst === 'fx';
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
    // Always size the orb from the playfield bounds so its rings and note
    // wheel never reach up into the loop grid.
    const top = playFieldTop();
    const bottom = playFieldBottom(guidedCoachActive() ? 430 : 0);
    return {
      x: W / 2,
      y: top + (bottom - top) * 0.52,
      maxR: Math.min(W * 0.44, Math.max(110, (bottom - top) * 0.45)),
    };
  }

  function orbPullState() {
    const tc = thereminCenter();
    const dx = pointerX - tc.x;
    const dy = pointerY - tc.y;
    const dist = clamp(Math.hypot(dx, dy) / tc.maxR, 0, 1);
    const angle = Math.atan2(dy, dx);
    const noteT = ((angle + Math.PI * 0.5 + Math.PI * 2) % (Math.PI * 2)) / (Math.PI * 2);
    const deg = Math.round(noteT * 9) % 10;
    const shimmer = 0.5 + 0.5 * Math.sin(angle * 2);
    return { ...tc, dist, angle, deg: clamp(deg, 0, 9), shimmer };
  }

  function padRect(row, col) {
    const left = 38, right = 16, top = playFieldTop();
    const bottom = playFieldBottom(430);
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
    const top = playFieldTop();
    const bottom = Math.max(top + 120, playFieldBottom(350));
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
  function getGrooveAssistedStep(rawStepFloat, assist) {
    const raw = Number.isFinite(rawStepFloat) ? rawStepFloat : stepIndex;
    const base = wrapStep(Math.floor(raw));
    const nearest = wrapStep(Math.round(raw));
    const distance = Math.abs(raw - Math.round(raw));
    const level = assist || signalSettings.grooveAssist || 'snap';
    if (level === 'raw') return base;
    if (level === 'light') return distance <= 0.28 ? nearest : base;
    return nearest;
  }

  function startGuidedRecordingFromFirstNote(t) {
    if (!(isGuidedBuildMode() && state === 'playing' && phase === 'build' && guidedStage === 'waiting')) return false;
    guidedStage = 'record';
    undoStack = [];
    rocks = [];
    bullets = [];
    pointerActive = false;
    pinchActive = false;
    restartLoopPlayback();
    updateLoopButton();
    showLayerToast();
    return true;
  }

  function startGuidedRecordingWithRest() {
    if (!(isGuidedBuildMode() && state === 'playing' && phase === 'build' && guidedStage === 'waiting')) return;
    guidedStage = 'record';
    undoStack = [];
    rocks = [];
    bullets = [];
    pointerActive = false;
    pinchActive = false;
    restartLoopPlayback();
    updateLoopButton();
    showLayerToast();
  }

  function startGuidedChimesFromTouch(pos, t) {
    if (!(isGuidedBuildMode() && state === 'playing' && phase === 'build' && guidedStage === 'waiting' && chimesActive())) return false;
    if (pos) { pointerX = pos.x; pointerY = pos.y; pointerActive = true; }
    guidedStage = 'record';
    undoStack = [];
    rocks = [];
    bullets = [];
    pinchActive = false;
    restartLoopPlayback();
    const pull = orbPullState();
    const note = degreeFreq(pull.deg, activeLayer().mult);
    playPitched('chimes', note, 0.7, 0);
    stampNote({ lane: 1, label: noteNameForDegree(pull.deg), color: '#ff2db8' }, 0, note, true, false);
    thereminPulse = 1;
    updateLoopButton();
    showLayerToast();
    return true;
  }

  // Swell mirrors the chimes promise: the first touch IS the first note and
  // starts the recording pass from the top of the loop.
  function startGuidedSwellFromTouch(pos, t) {
    if (!(isGuidedBuildMode() && state === 'playing' && phase === 'build' && guidedStage === 'waiting' && swellActive())) return false;
    if (pos) { pointerX = pos.x; pointerY = pos.y; pointerActive = true; }
    guidedStage = 'record';
    undoStack = [];
    rocks = [];
    bullets = [];
    pinchActive = false;
    restartLoopPlayback();
    pointerActive = true;
    const pick = swellPickAt(pos || { x: W * 0.5, y: (swellSurfaceTop() + swellSurfaceBottom()) * 0.5 });
    const note = degreeFreq(pick.deg, activeLayer().mult);
    playSwellChord(note, 0.4 + pick.openness * 0.42, 0, { openness: pick.openness, tension: pick.tension });
    stampNote({ lane: 1, label: noteNameForDegree(pick.deg), color: '#ffe61a' }, 0, note, true, false);
    swellInk = Math.max(swellInk, 0.3);
    thereminPulse = 1;
    updateLoopButton();
    showLayerToast();
    return true;
  }

  function swellPickAt(pos) {
    const top = swellSurfaceTop();
    const bottom = swellSurfaceBottom();
    const usableH = Math.max(1, bottom - top);
    const xT = clamp(pos.x / Math.max(1, W), 0, 1);
    const yT = clamp((pos.y - top) / usableH, 0, 1);
    const deg = clamp(Math.round(xT * 9), 0, 9);
    const openness = 1 - yT;
    return { deg, openness, tension: 0.25 + xT * 0.5 + openness * 0.25 };
  }

  // A plain tap on the swell field answers with one chord at the touched
  // spot. Holding and sliding still paints the slow waves.
  function tapSwell(pos) {
    const t = performance.now();
    const pick = swellPickAt(pos);
    const note = degreeFreq(pick.deg, activeLayer().mult);
    playSwellChord(note, 0.4 + pick.openness * 0.42, 0, { openness: pick.openness, tension: pick.tension });
    const timing = captureTiming(t);
    stampNote({ lane: 1, label: noteNameForDegree(pick.deg), color: '#ffe61a' }, timing.target, note, timing.tight, timing.isNextStep);
    pointerActive = true;
    pointerX = pos.x;
    pointerY = pos.y;
    swellInk = Math.max(swellInk, 0.3);
    thereminPulse = 1;
    return true;
  }

  // The chimes orb stays hold-and-pull, but the first tap answers instantly
  // with the note at the pulled angle instead of waiting for a step boundary.
  function tapChimes(pos, t) {
    pointerX = pos.x;
    pointerY = pos.y;
    pointerActive = true;
    const pull = orbPullState();
    if (pull.dist <= 0.12) return false;
    const note = degreeFreq(pull.deg, activeLayer().mult);
    playPitched('chimes', note, 0.7, 0);
    const timing = captureTiming(t || performance.now());
    stampNote({ lane: 1, label: noteNameForDegree(pull.deg), color: '#ff2db8' }, timing.target, note, timing.tight, timing.isNextStep);
    thereminPulse = 1;
    return true;
  }

  function captureTiming(t) {
    if (startGuidedRecordingFromFirstNote(t)) {
      return { isNextStep: false, tight: true, target: 0 };
    }
    const baseBeatAt = beatAt || (t + beatMs);
    const elapsedSinceStep = clamp(beatMs - (baseBeatAt - t), 0, beatMs * 4);
    const rawStepFloat = stepIndex + elapsedSinceStep / beatMs;
    const target = getGrooveAssistedStep(rawStepFloat);
    const advance = (target - stepIndex + LOOP_STEPS) % LOOP_STEPS;
    const isNextStep = advance > 0 && advance <= 4;
    const virtualNextBeatAt = baseBeatAt + advance * beatMs;
    const toNext = Math.max(0, virtualNextBeatAt - t);
    const sincePrev = clamp(beatMs - toNext, 0, beatMs);
    return {
      isNextStep,
      tight: Math.min(sincePrev, toNext) <= beatMs * 0.3,
      target,
    };
  }

  function tapShoot(pos) {
    const t = performance.now();
    if (t < manualFireAt) return;
    if (state === 'replay') {
      fireReplayProjectile();
      manualFireAt = t + 150;
      return;
    }
    if (isGuidedBuildMode() && phase === 'build' && guidedStage === 'review') {
      // Review is for listening back and choosing KEEP / ADD MORE / START OVER.
      // Do not let hidden/under-panel canvas taps preview random drum pads.
      manualFireAt = t + 120;
      return;
    }
    if ((phase === 'countin' || phase === 'countdown') && state === 'playing') {
      playDrumPiece('kick', 0.45, 0);
      countKickPulse = 0.8;
      manualFireAt = t + 160;
      return;
    }
    if (isPlayAlongMode() && phase === 'build' && playAlongStage === 'listen') {
      // Demonstration pass: watch and listen. Your turn comes next loop.
      manualFireAt = t + 120;
      return;
    }
    if (startGuidedChimesFromTouch(pos, t)) {
      manualFireAt = t + 120;
      return;
    }
    if (startGuidedSwellFromTouch(pos, t)) {
      manualFireAt = t + 140;
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
    if (fxActive()) {
      if (pos) tapFxJunk(pos);
      manualFireAt = t + 96;
      return;
    }
    if (swellActive()) {
      if (pos) tapSwell(pos);
      manualFireAt = t + 140;
      return;
    }
    if (chimesActive()) {
      if (pos) tapChimes(pos, t);
      manualFireAt = t + 90;
      return;
    }
    // Music layers never fall through to the dormant shooter path.
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
    signal = clamp(signal + (timing.tight ? 1.3 : 0.3) + (wasLit ? 0.6 : 0), 0, 100);
    distortion = clamp(distortion + (timing.tight ? -0.8 : 2.2), 0, 100);
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

  function playAlongExpectedHits() {
    if (!playAlongPattern) return [];
    return (playAlongPattern.rounds && playAlongPattern.rounds[playAlongRoundIndex]) || [];
  }

  function playAlongDifficulty() {
    return String(playAlongPattern && playAlongPattern.difficulty || 'EASY').toUpperCase();
  }

  function playAlongDemoLoopGoal() {
    const diff = playAlongDifficulty();
    return diff === 'HARD' || diff === 'EXPERT' ? 3 : 2;
  }

  function playAlongLearnBeatMs() {
    const diff = playAlongDifficulty();
    if (diff === 'EASY') return 420;
    if (diff === 'MEDIUM') return 390;
    if (diff === 'HARD') return 360;
    return 340;
  }

  function applyPlayAlongTempo() {
    if (isPlayAlongMode() && playAlongPattern) beatMs = Math.max(beatMs, playAlongLearnBeatMs());
  }

  function playAlongStatusLabel() {
    if (playAlongStage === 'listen') return `PLAY ALONG · WATCH ${Math.min(playAlongListenLoops + 1, playAlongDemoLoopGoal())}/${playAlongDemoLoopGoal()}`;
    return 'PLAY ALONG · YOUR TURN';
  }

  function patternHitToStamp(hit, roundIndex) {
    const layer = LAYERS[choiceLayerIndex(hit)] || LAYERS[0];
    const color = hit.color || (layer.options[hit.lane || 0] && layer.options[hit.lane || 0].color) || COLOR;
    const stamp = {
      layerId: hit.layerId || layer.id,
      layerIndex: choiceLayerIndex(hit),
      inst: hit.inst || layer.inst,
      color,
      label: hit.label || '',
      lane: Number.isFinite(hit.lane) ? hit.lane : 1,
      playAlongRound: Number.isFinite(roundIndex) ? roundIndex : 0,
      tight: true,
      vel: hit.vel || 0.86,
      skip: 0,
    };
    if (stamp.inst === 'drums') {
      stamp.pieces = [hit.piece || 'kick'];
      stamp.tunes = [hit.tune == null ? 0.5 : hit.tune];
    } else if (hit.piece) {
      stamp.piece = hit.piece;
      stamp.note = hit.note || null;
    } else {
      stamp.note = hit.note || degreeFreq(hit.degree || 0, layer.mult);
    }
    return stamp;
  }

  function loopFromPlayAlongPattern(pattern, throughRoundIndex) {
    const nextLoop = Array.from({ length: LOOP_STEPS }, () => []);
    const rounds = pattern.rounds || [];
    const lastRound = Number.isFinite(throughRoundIndex) ? clamp(Math.floor(throughRoundIndex), 0, Math.max(0, rounds.length - 1)) : Math.max(0, rounds.length - 1);
    rounds.slice(0, lastRound + 1).forEach((round, roundIndex) => {
      (round || []).forEach(hit => {
        const target = wrapStep(hit.step);
        nextLoop[target].push(patternHitToStamp(hit, roundIndex));
        while (nextLoop[target].length > 5) nextLoop[target].shift();
      });
    });
    return nextLoop;
  }

  function collectPlayAlongHit(rock, target) {
    if (!isPlayAlongMode() || playAlongStage !== 'respond') return;
    const layer = activeLayer();
    playAlongInput.push({
      step: wrapStep(target),
      layerId: layer.id,
      layerIndex: currentLayerIndex,
      inst: layer.inst,
      piece: rock.piece || null,
      lane: rock.lane,
      label: rock.label,
    });
    if (playAlongInput.length > 64) playAlongInput.shift();
  }

  function playAlongStepDistance(a, b) {
    const d = Math.abs(wrapStep(a) - wrapStep(b));
    return Math.min(d, LOOP_STEPS - d);
  }

  function playAlongHitMatches(expected, actual) {
    if (playAlongStepDistance(expected.step, actual.step) > 1) return false;
    if (Number.isFinite(expected.lane) && Number.isFinite(actual.lane) && expected.lane !== actual.lane) return false;
    return true;
  }

  function playAlongRoundMatched() {
    const used = new Set();
    const expected = playAlongExpectedHits();
    if (!expected.length) return false;
    return expected.every(hit => {
      const found = playAlongInput.findIndex((actual, index) => !used.has(index) && playAlongHitMatches(hit, actual));
      if (found < 0) return false;
      used.add(found);
      return true;
    });
  }

  function cloneLoopSlot(slot) {
    return {
      ...slot,
      pieces: slot.pieces ? slot.pieces.slice() : slot.pieces,
      tunes: slot.tunes ? slot.tunes.slice() : slot.tunes,
      notes: slot.notes ? slot.notes.slice() : slot.notes,
      labels: slot.labels ? slot.labels.slice() : slot.labels,
    };
  }

  function snapshotBucket(bucket) {
    return (bucket || []).map(cloneLoopSlot);
  }

  function snapshotGuidedState() {
    return {
      loop: loop.map(bucket => snapshotBucket(bucket)),
      recordedChoices: recordedChoices.map(ch => ({ ...ch })),
      undoStack: undoStack.map(u => ({ ...u, beforeBucket: snapshotBucket(u.beforeBucket) })),
      additionsThisLayer,
      totalAdditions,
      combo,
      bestCombo,
    };
  }

  function restoreGuidedState(snap) {
    if (!snap) return;
    loop = snap.loop.map(bucket => snapshotBucket(bucket));
    recordedChoices = snap.recordedChoices.map(ch => ({ ...ch }));
    undoStack = snap.undoStack.map(u => ({ ...u, beforeBucket: snapshotBucket(u.beforeBucket) }));
    additionsThisLayer = snap.additionsThisLayer || 0;
    totalAdditions = snap.totalAdditions || 0;
    combo = snap.combo || 0;
    bestCombo = snap.bestCombo || 0;
    grooveByLayer[currentLayerIndex] = null;
  }

  function undoLastGuidedOverdub() {
    if (!isGuidedReviewStage() || !guidedOverdubBase) return;
    restoreGuidedState(guidedOverdubBase);
    guidedStage = 'waiting';
    state = 'playing';
    phase = 'build';
    overlay.classList.add('hidden');
    updateLoopButton();
    restartLoopPlayback();
    showLayerToast();
  }

  function undoLastStamp() {
    if (!canUndoLastStamp()) return;
    const undo = undoStack.pop();
    loop[undo.step] = snapshotBucket(undo.beforeBucket);
    recordedChoices = recordedChoices.filter(ch => ch.undoId !== undo.choiceId);
    totalAdditions = Math.max(0, totalAdditions - 1);
    additionsThisLayer = recordedChoices.filter(ch => choiceLayerIndex(ch) === currentLayerIndex && !ch.foundation).length;
    grooveByLayer[currentLayerIndex] = null;
    combo = 0;
    loopEndArmed = false;
    if (loopFlash[undo.step]) loopFlash[undo.step] = { pulse: 1, color: '#ff2db8', row: currentLayerIndex };
    addFloatText('UNDONE', W * 0.5, H * 0.3, '#ff2db8', 650);
    tone(300, 'triangle', 0, 0.09, 0.035, 170);
    updateLoopButton();
  }

  function startBuildPhase(t) {
    countdown = null;
    phase = 'build';
    stepIndex = 0;
    lastLoopStep = 0;
    beatAt = t + beatMs;
    spawnAt = t + 600;
    countKickPulse = 0;
    if (asteroidSurfaceActive()) initAsteroidSurface();
    playPulseBed();
    (loop[stepIndex] || []).forEach(v => {
      if (v.skip > 0) { v.skip -= 1; return; }
      playStamp(v);
    });
    updateLoopButton();
    showLayerToast();
  }

  function beginLoopCountdown(opts) {
    if (state !== 'playing') return;
    opts = opts || {};
    const t = performance.now();
    phase = 'countdown';
    countdown = {
      start: t,
      // Count in at the loop's own pulse so 3-2-1 teaches the tempo the
      // player is about to play against.
      beat: Math.max(480, tempoBeatMs()),
      last: 0,
      afterClear: !!opts.afterClear,
      guidedRecord: !!opts.guidedRecord,
    };
    stepIndex = 0;
    lastLoopStep = -1;
    beatAt = 0;
    rocks = [];
    bullets = [];
    pointerActive = false;
    pinchActive = false;
    countKickPulse = 1;
    if (activeLayer().inst === 'bass' || activeLayer().inst === 'keys') initAsteroidSurface();
    if (activeLayer().inst === 'fx') initFxJunk();
    if (overlay) overlay.classList.add('hidden');
    updateLoopButton();
    addFloatText(opts.afterClear ? 'RESETTING LOOP' : opts.guidedRecord ? 'READY TO RECORD' : 'GET READY', W * 0.5, H * 0.3, '#ffe61a', 900);
  }

  function skipCountIn() {
    if (phase !== 'countin' || state !== 'playing') return;
    countLockedText = `TEMPO SET · ${tempoBpm()} BPM`;
    beginLoopCountdown();
    addFloatText(countLockedText, W * 0.5, H * 0.34, '#ffe61a');
  }

  // Live capture: stamp the note the player just played into the loop grid.
  function stampNote(rock, target, note, tight, isNextStep) {
    const layer = activeLayer();
    const vel = tight ? 1 : 0.62;
    if (isPlayAlongMode()) collectPlayAlongHit(rock, target);
    if (!shouldRecordStamp()) {
      laneFlash[rock.lane] = Math.max(laneFlash[rock.lane] || 0, tight ? 0.9 : 0.55);
      return;
    }
    const bucket = loop[target];
    const choiceId = ++undoSeq;
    undoStack.push({
      choiceId,
      step: target,
      layerIndex: currentLayerIndex,
      beforeBucket: snapshotBucket(bucket),
    });
    if (undoStack.length > 32) undoStack.shift();
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
      undoId: choiceId,
    });
    if (recordedChoices.length > 128) recordedChoices.shift();
    laneFlash[rock.lane] = Math.max(laneFlash[rock.lane], tight ? 1 : 0.6);
    if (loopFlash[target]) loopFlash[target] = { pulse: 1, color: rock.color || COLOR, row: currentLayerIndex };
    if (isFreeMode() || undoStack.length === 1) updateLoopButton();
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
    if (state !== 'playing' || isFreeMode()) return;
    const committedLayerIndex = currentLayerIndex;
    const groove = scoreLayerGrid(committedLayerIndex);
    grooveByLayer[committedLayerIndex] = groove;
    lastGrooveToast = { layerIndex: committedLayerIndex, groove };
    addFloatText(`${LAYERS[committedLayerIndex].name} ADDED`, W * 0.5, 104, '#ffe61a');
    loopEndArmed = false;
    undoStack = [];
    if (currentLayerIndex >= LAYERS.length - 1) {
      finishTrack();
      return;
    }
    currentLayerIndex += 1;
    guidedStage = isGuidedBuildMode() ? 'practice' : guidedStage;
    additionsThisLayer = 0;
    rocks = [];
    bullets = [];
    applyLayerOptions();
    laneFlash = [1, 1, 1];
    beginLoopCountdown();
    updateLoopButton();
    [0, 2, 4].forEach((deg, i) => playPitched('keys', degreeFreq(deg, 2), 0.8, 0.05 + i * 0.09));
  }

  function finishCaptureLayer() {
    if (state !== 'playing' || isFreeMode() || !isCaptureBuildMode()) return;
    const committedLayerIndex = currentLayerIndex;
    grooveByLayer[committedLayerIndex] = scoreLayerGrid(committedLayerIndex);
    lastGrooveToast = null;
    state = 'playing';
    phase = 'build';
    guidedStage = 'review';
    loopEndArmed = false;
    undoStack = [];
    rocks = [];
    bullets = [];
    pointerActive = false;
    pinchActive = false;
    showCaptureReview(committedLayerIndex);
    [0, 2, 4].forEach((deg, i) => playPitched('keys', degreeFreq(deg, 2), 0.64, 0.04 + i * 0.08));
  }

  function finishPlayAlongRound() {
    if (state !== 'playing' || !isPlayAlongMode()) return;
    playAlongResult = playAlongRoundMatched() ? 'matched' : 'try-again';
    state = 'built';
    phase = 'playalong-review';
    loopEndArmed = false;
    rocks = [];
    bullets = [];
    pointerActive = false;
    pinchActive = false;
    updateLoopButton();
    cancelAnimationFrame(raf);
    showPlayAlongResult();
  }

  function showPlayAlongResult() {
    const matched = playAlongResult === 'matched';
    const isFinalRound = !playAlongPattern || playAlongRoundIndex >= (playAlongPattern.rounds || []).length - 1;
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-tempo-mode');
    overlay.classList.remove('signal-menu-mode');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">${matched ? 'MATCHED' : 'TRY AGAIN'}</div>
        <div class="signal-subtitle">${playAlongPattern ? `${playAlongPattern.title} · ROUND ${playAlongRoundIndex + 1}` : 'PLAY ALONG'}</div>
        ${matched && !isFinalRound ? `<button class="signal-btn" onclick="signalPlayAlongNextRound()">NEXT</button>` : ''}
        ${matched && isFinalRound ? `<button class="signal-btn" onclick="signalShowPlayAlong()">MORE PATTERNS</button>` : ''}
        <button class="signal-btn secondary" onclick="signalPlayAlongRetry()">TRY AGAIN</button>
        <button class="signal-btn secondary" onclick="signalShowIntro()">MENU</button>
      </div>`;
  }

  function restartPlayAlongRound() {
    if (!playAlongPattern) return;
    const expected = playAlongExpectedHits();
    const firstLayer = LAYERS[choiceLayerIndex(expected[0] || {})] || LAYERS[0];
    currentLayerIndex = firstLayer ? LAYERS.indexOf(firstLayer) : 0;
    additionsThisLayer = 0;
    playAlongListenLoops = 0;
    playAlongInput = [];
    playAlongResult = null;
    playAlongStage = 'listen';
    loop = loopFromPlayAlongPattern(playAlongPattern, playAlongRoundIndex);
    applyPlayAlongTempo();
    applyLayerOptions();
    laneFlash = [1, 1, 1];
    state = 'playing';
    phase = 'build';
    overlay.classList.add('hidden');
    updateLoopButton();
    beginLoopCountdown();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function playAlongRetry() {
    if (!isPlayAlongMode() || !playAlongPattern) return;
    restartPlayAlongRound();
  }

  function playAlongNextRound() {
    if (!isPlayAlongMode() || !playAlongPattern) return;
    playAlongRoundIndex = Math.min((playAlongPattern.rounds || []).length - 1, playAlongRoundIndex + 1);
    restartPlayAlongRound();
  }

  function showCaptureReview(layerIndex) {
    const layer = LAYERS[layerIndex] || activeLayer();
    guidedStage = 'review';
    state = 'playing';
    phase = 'build';
    overlay.classList.add('hidden');
    addFloatText(`${layer.name} ADDED`, W * 0.5, 118, '#ffe61a', 1400);
    restartLoopPlayback();
    updateLoopButton();
  }

  function captureNextLayer() {
    if (!(isGuidedReviewStage() && state === 'playing' && phase === 'build')) return;
    if (currentLayerIndex >= LAYERS.length - 1) {
      guidedOverdubBase = null;
      state = 'playing';
      finishTrack();
      return;
    }
    guidedOverdubBase = null;
    currentLayerIndex += 1;
    if (isGuidedBuildMode()) guidedStage = 'practice';
    additionsThisLayer = 0;
    rocks = [];
    bullets = [];
    pointerActive = false;
    pinchActive = false;
    replaying = false;
    applyLayerOptions();
    laneFlash = [1, 1, 1];
    state = 'playing';
    phase = 'build';
    overlay.classList.add('hidden');
    updateLoopButton();
    restartLoopPlayback();
    showLayerToast();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function captureAddMoreLayer() {
    if (!(isGuidedReviewStage() && state === 'playing' && phase === 'build')) return;
    guidedOverdubBase = snapshotGuidedState();
    guidedStage = 'waiting';
    state = 'playing';
    phase = 'build';
    overlay.classList.add('hidden');
    updateLoopButton();
    showLayerToast();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function captureRetryLayer() {
    if (!(isGuidedReviewStage() && state === 'playing' && phase === 'build')) return;
    guidedOverdubBase = null;
    guidedStage = 'practice';
    state = 'playing';
    phase = 'build';
    overlay.classList.add('hidden');
    resetCurrentLoop();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  // Scrap the take: clear the layer you're building and re-record over the
  // groove. Earlier locked layers are untouched.
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
    undoStack = [];
    totalAdditions = Math.max(0, totalAdditions - (before - recordedChoices.length));
    additionsThisLayer = recordedChoices.filter(ch => ch.layerIndex === li).length;
    grooveByLayer[li] = null;
    combo = 0;
    loopEndArmed = false;
    if (isFreeMode()) freeRecording = false;
    if (asteroidSurfaceActive()) initAsteroidSurface();
    addFloatText(isFreeMode() ? 'LOOP CLEARED' : 'LAYER CLEARED', W * 0.5, H * 0.3, '#00e5ff');
    tone(520, 'sine', 0, 0.20, 0.05, 170);
    noise(0.02, 0.12, 0.02, true);
    if (isGuidedBuildMode()) {
      phase = 'build';
      restartLoopPlayback();
      updateLoopButton();
      showLayerToast();
    } else {
      beginLoopCountdown({ afterClear: true });
    }
  }


  function startGuidedRecordPass() {
    if (!isGuidedBuildMode() || state !== 'playing' || phase !== 'build') return;
    guidedOverdubBase = null;
    guidedStage = 'waiting';
    undoStack = [];
    overlay.classList.add('hidden');
    // Keep the backing loop running. The player's first note restarts the
    // loop from step 0 and begins the guided recording pass.
    updateLoopButton();
    showLayerToast();
  }

  function skipGuidedLayer() {
    if (!isGuidedBuildMode() || state !== 'playing' || phase !== 'build') return;
    if (currentLayerIndex >= LAYERS.length - 1) {
      finishTrack();
      return;
    }
    guidedOverdubBase = null;
    currentLayerIndex += 1;
    guidedStage = 'practice';
    additionsThisLayer = 0;
    rocks = [];
    bullets = [];
    pointerActive = false;
    pinchActive = false;
    applyLayerOptions();
    laneFlash = [1, 1, 1];
    phase = 'build';
    restartLoopPlayback();
    updateLoopButton();
    showLayerToast();
  }

  function requestLoopEnd() {
    if (state !== 'playing' || loopEndArmed) return;
    if (phase !== 'build') return;
    if (isPlayAlongMode()) return;
    if (isGuidedBuildMode()) {
      if (guidedStage === 'practice') startGuidedRecordPass();
      else if (guidedStage === 'review') captureNextLayer();
      return;
    }
    if (isFreeMode()) {
      showFreeLayerMenu(true);
      return;
    }
    loopEndArmed = true;
    updateLoopButton();
    playPitched('keys', degreeFreq(2, 2), 0.6, 0);
    playPitched('keys', degreeFreq(4, 2), 0.5, 0.07);
  }

  function finishTrack() {
    if (state !== 'playing' || isFreeMode()) return;
    if (!grooveByLayer[currentLayerIndex]) {
      const groove = scoreLayerGrid(currentLayerIndex);
      grooveByLayer[currentLayerIndex] = groove;
      lastGrooveToast = { layerIndex: currentLayerIndex, groove };
    }
    state = 'built';
    loopEndArmed = false;
    updateLoopButton();
    cancelAnimationFrame(raf);
    signal = Math.max(signal, 82);
    [0, 1, 2, 4, 5].forEach((deg, i) => playPitched('chimes', degreeFreq(deg, 4), 0.8, 0.05 + i * 0.07));
    showMixScreen();
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
    initReplayPlayground();
    overlay.classList.add('hidden');
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function startMixAudition() {
    state = 'mix';
    phase = 'build';
    loopEndArmed = false;
    replaying = false;
    rocks = [];
    bullets = [];
    pointerActive = false;
    pinchActive = false;
    updateLoopButton();
    restartLoopPlayback();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function layerHintText() {
    if (phase === 'countin') return 'SET TEMPO';
    if (phase === 'countdown') return 'GET READY';
    if (isGuidedBuildMode() && phase === 'build') return guidedStage === 'record' ? 'PLAY FOR ONE LOOP' : guidedStage === 'waiting' ? 'PLAY TO START' : guidedStage === 'review' ? 'LISTEN BACK' : 'NOTHING RECORDS YET';
    if (drumsActive()) return 'TAP DRUM PADS';
    if (rockTapActive()) return 'TAP THE ROCKS';
    if (fxActive()) return 'TAP + PINCH JUNK';
    if (swellActive()) return 'HOLD + SLIDE';
    const orb = orbLayerInst();
    if (orb === 'chimes') return 'HOLD + PULL';
    return '';
  }

  function showLayerToast() {
    const layer = activeLayer();
    const hint = layerHintText();
    addFloatText(isGuidedBuildMode() ? `${guidedStage === 'record' ? 'RECORD' : guidedStage === 'waiting' ? 'PLAY WHEN READY' : guidedStage === 'review' ? 'REVIEW' : 'PRACTICE'} ${layer.name}` : (hint ? `${layer.name} · ${hint}` : layer.name), W * 0.5, 132, layer.options[0].color || COLOR, 1800);
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
    signal = clamp(signal + (tight ? 1.3 : 0.3), 0, 100);
    distortion = clamp(distortion + (tight ? -0.8 : 2.2), 0, 100);

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

  function tapFxJunk(pos) {
    const best = fxJunkAt(pos);
    if (!best) return false;
    const power = clamp(1 - best.dist / Math.max(1, best.junk.r + 28), 0.35, 1);
    triggerFxJunk(best.junk, power, performance.now());
    return true;
  }

  function triggerFxJunk(junk, power, t) {
    t = t || performance.now();
    const timing = captureTiming(t);
    const deg = junk.piece === 'echo' ? 2 : junk.piece === 'rise' ? 5 : 8;
    const note = degreeFreq(deg, activeLayer().mult);
    junk.pulse = 1.35;
    junk.armed = 1;
    playFxGesture(junk.piece, note, 0.62 + power * 0.42, 0, { intensity: 0.5 + power * 0.5, tension: power });
    stampNote({ ...junk, lane: junk.lane }, timing.target, note, timing.tight, timing.isNextStep);
    burst(junk.x, junk.y, junk.color, timing.tight ? 14 : 8);
    combo = timing.tight ? combo + 1 : 0;
    bestCombo = Math.max(bestCombo, combo);
    signal = clamp(signal + (timing.tight ? 1.1 : 0.4), 0, 100);
    distortion = clamp(distortion + (timing.tight ? -0.5 : 1.5), 0, 100);
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
    const advance = Math.min(skipped + 1, 4);
    beatAt += advance * beatMs;
    if (t - beatAt > beatMs * 4) beatAt = t + beatMs;
    const previousStep = stepIndex;
    stepIndex = (stepIndex + advance) % LOOP_STEPS;
    playPulseBed();
    const bucket = loop[stepIndex];
    bucket.forEach(v => {
      if (v.skip > 0) { v.skip -= 1; return; }
      if (isPlayAlongMode() && phase === 'build' && playAlongStage === 'respond' && v.playAlongRound === playAlongRoundIndex) return;
      playStamp(v);
    });
    lastLoopStep = stepIndex;
    if (isPlayAlongMode() && phase === 'build' && playAlongStage === 'listen') {
      // Demonstration pass: light up the grid and the surface the player
      // will use, so listening doubles as showing where to play.
      bucket.forEach(v => {
        if (v.skip > 0) return;
        if (v.playAlongRound !== playAlongRoundIndex) return;
        if (loopFlash[stepIndex]) loopFlash[stepIndex] = { pulse: 1, color: v.color || COLOR, row: v.layerIndex || 0 };
        if (v.inst === 'drums' && v.pieces && drumsActive()) {
          v.pieces.forEach(p => { const pad = pads.find(pd => pd.piece === p); if (pad) pad.flash = 1; });
        } else if ((v.inst === 'bass' || v.inst === 'keys') && rockTapActive()) {
          rocks.forEach(r => { if (r.lane === v.lane) r.pulse = 1; });
        }
      });
    }
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
    if (pointerActive && swellActive()) {
      const top = swellSurfaceTop();
      const bottom = swellSurfaceBottom();
      const usableH = Math.max(1, bottom - top);
      const xT = clamp(pointerX / Math.max(1, W), 0, 1);
      const yT = clamp((pointerY - top) / usableH, 0, 1);
      const deg = clamp(Math.round(xT * 9), 0, 9);
      const openness = 1 - yT;
      const tension = 0.25 + xT * 0.5 + openness * 0.25;
      const every = swellInk > 0.72 ? 2 : swellInk > 0.42 ? 3 : 6;
      if (stepIndex % every === 0) {
        const note = degreeFreq(deg, activeLayer().mult);
        playSwellChord(note, 0.34 + swellInk * 0.42, 0, { openness, tension });
        const existing = loop[stepIndex].find(v => v.layerId === activeLayer().id);
        if (!existing || existing.note !== note) {
          stampNote({ lane: 1, label: noteNameForDegree(deg), color: '#ffe61a' }, stepIndex, note, true, false);
        }
      }
    }
    if (isPlayAlongMode() && phase === 'build' && previousStep + advance >= LOOP_STEPS) {
      if (playAlongStage === 'listen') {
        playAlongListenLoops += 1;
        if (playAlongListenLoops < playAlongDemoLoopGoal()) {
          addFloatText(`WATCH ${playAlongListenLoops + 1}`, W * 0.5, H * 0.32, COLOR, 1100);
          updateLoopButton();
          return;
        }
        // The teaching passes just finished. The loop keeps rolling, but
        // the current phrase is muted so the player's hits are the answer.
        playAlongStage = 'respond';
        playAlongInput = [];
        addFloatText('YOUR TURN', W * 0.5, H * 0.32, '#ffe61a', 1500);
        playPitched('keys', degreeFreq(4, 2), 0.6, 0);
        playPitched('keys', degreeFreq(7, 2), 0.5, 0.09);
        updateLoopButton();
      } else {
        finishPlayAlongRound();
        return;
      }
    }
    if (isCaptureBuildMode() && phase === 'build' && previousStep + advance >= LOOP_STEPS) {
      finishCaptureLayer();
      return;
    }
    if (!isFreeMode() && loopEndArmed && stepIndex === 0) endCurrentLoop(false);
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
    if (phase === 'countdown' && state === 'playing') {
      if (!countdown) beginLoopCountdown();
      const elapsedCount = Math.max(0, t - countdown.start);
      const slot = Math.floor(elapsedCount / countdown.beat);
      const number = 3 - slot;
      if (number !== countdown.last && number > 0) {
        countdown.last = number;
        countKickPulse = 1;
        playDrumPiece(number === 1 ? 'hat' : 'kick', number === 1 ? 0.78 : 0.68, 0);
      }
      if (slot >= 3) {
        const afterClear = countdown.afterClear;
        const guidedRecord = countdown.guidedRecord;
        countdown = null;
        if (guidedRecord) {
          guidedStage = 'record';
          phase = 'build';
          restartLoopPlayback();
          updateLoopButton();
          showLayerToast();
        } else if (afterClear || isFreeMode()) {
          phase = 'build';
          if (isFreeMode()) freeRecording = true;
          restartLoopPlayback();
          updateLoopButton();
          showLayerToast();
        } else {
          startBuildPhase(t);
        }
        return;
      }
      for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 360);
      loopFlash.forEach(f => { f.pulse = Math.max(0, f.pulse - dt / 260); });
      countKickPulse = Math.max(0, countKickPulse - dt / 240);
      stars.forEach(s => {
        s.y += s.vy * dt / 1000;
        if (s.y > H) { s.y = -8; s.x = Math.random() * W; }
      });
      floatTexts.forEach(f => { f.age += dt; f.y -= dt * 0.018; });
      floatTexts = floatTexts.filter(f => f.age < f.life);
      return;
    }
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
    if (state === 'mix') {
      for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 420);
      loopFlash.forEach(f => { f.pulse = Math.max(0, f.pulse - dt / 320); });
      stars.forEach(s => {
        s.y += s.vy * dt / 1000;
        if (s.y > H + 5) { s.y = -5; s.x = Math.random() * W; }
      });
      return;
    }
    swellInk = swellActive() && pointerActive ? clamp(swellInk + dt / 1700, 0, 1) : Math.max(0, swellInk - dt / 900);
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
    if (swellActive()) {
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
    if (fxActive()) {
      updateFxJunk(dt, t);
      for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 360);
      loopFlash.forEach(f => { f.pulse = Math.max(0, f.pulse - dt / 300); });
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
      updateReplayPlayground(dt, t);
      for (let i = 0; i < laneFlash.length; i++) laneFlash[i] = Math.max(0, laneFlash[i] - dt / 420);
      loopFlash.forEach(f => { f.pulse = Math.max(0, f.pulse - dt / 320); });
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
    c.font = "10px 'VCR', monospace";
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(r.inst === 'drums' ? '●' : (r.label || '♪'), 0, 1);
    c.restore();
  }

  function drawAsteroidSurface(c) {
    const countdownPreview = phase === 'countdown' && state === 'playing' && (activeLayer().inst === 'bass' || activeLayer().inst === 'keys');
    if (!asteroidSurfaceActive() && !countdownPreview) return;
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
        c.font = "10px 'VCR', monospace";
        c.textAlign = 'left';
        c.fillText(LANES[lane].label, 12, y - 20);
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
        c.font = "10px 'VCR', monospace";
        c.textAlign = 'center';
        c.fillText(r.rangeLabel || LANES[r.lane].label, r.baseX, r.baseY + r.r + 24);
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
    c.font = "10px 'VCR', monospace";
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
      const cr = pad.piece === 'kick' || pad.piece === 'gong' ? 8 : pad.piece === 'tom' || pad.piece === 'snare' || pad.piece === 'clap' ? 6.5 : 5;
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

  function drawSwellSurface(c) {
    const top = swellSurfaceTop();
    const bottom = swellSurfaceBottom();
    const h = bottom - top;
    const layer = activeLayer();
    const grad = c.createLinearGradient(0, top, W, bottom);
    grad.addColorStop(0, 'rgba(255,230,26,0.16)');
    grad.addColorStop(0.45, 'rgba(123,255,234,0.10)');
    grad.addColorStop(1, 'rgba(182,108,255,0.14)');
    c.save();
    c.fillStyle = grad;
    c.globalAlpha = 0.65 + swellInk * 0.35;
    c.fillRect(16, top, W - 32, h);
    c.strokeStyle = 'rgba(255,230,26,0.42)';
    c.lineWidth = 1.5;
    c.strokeRect(16.5, top + 0.5, W - 33, h - 1);
    for (let i = 0; i < 10; i++) {
      const x = 16 + (W - 32) * (i / 9);
      c.globalAlpha = 0.12 + swellInk * 0.10;
      c.strokeStyle = layer.options[i < 3 ? 0 : i < 6 ? 1 : 2].color;
      c.beginPath();
      c.moveTo(x, top);
      c.lineTo(x, bottom);
      c.stroke();
      c.globalAlpha = 0.58;
      c.fillStyle = '#eaffff';
      c.font = "10px 'VCR', monospace";
      c.textAlign = 'center';
      c.fillText(noteNameForDegree(i), x, top + 20);
    }
    ['BRIGHT', 'WARM'].forEach((label, i) => {
      c.globalAlpha = 0.62;
      c.fillStyle = i ? 'rgba(182,108,255,0.85)' : 'rgba(255,230,26,0.9)';
      c.font = "10px 'VCR', monospace";
      c.textAlign = 'left';
      c.fillText(label, 24, i ? bottom - 14 : top + 34);
    });
    if (pointerActive) {
      const x = clamp(pointerX, 18, W - 18);
      const y = clamp(pointerY, top, bottom);
      const r = 18 + swellInk * 34;
      const grd = c.createRadialGradient(x, y, 2, x, y, r);
      grd.addColorStop(0, 'rgba(255,242,160,0.92)');
      grd.addColorStop(0.42, 'rgba(255,230,26,0.28)');
      grd.addColorStop(1, 'rgba(255,230,26,0)');
      c.globalAlpha = 1;
      c.fillStyle = grd;
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#ffe61a';
      c.globalAlpha = 0.75;
      c.beginPath();
      c.arc(x, y, 8 + swellInk * 8, 0, Math.PI * 2);
      c.stroke();
    } else {
      c.globalAlpha = 0.72;
      c.fillStyle = 'rgba(234,255,255,0.7)';
      c.font = "12px 'VCR', monospace";
      c.textAlign = 'center';
      c.fillText('TAP OR HOLD + SLIDE', W * 0.5, top + h * 0.54);
    }
    c.restore();
  }

  function drawFxJunkSurface(c) {
    if (!fxJunk.length) initFxJunk();
    c.save();
    fxJunk.forEach(j => {
      const open = Math.max(j.pulse || 0, j.armed || 0);
      c.save();
      c.translate(j.x, j.y);
      c.rotate(j.rot);
      c.globalAlpha = 0.35 + open * 0.48;
      c.shadowColor = j.color;
      c.shadowBlur = 8 + open * 24;
      c.strokeStyle = j.color;
      c.fillStyle = 'rgba(2,4,14,0.72)';
      c.lineWidth = 1.5 + open * 2;
      c.beginPath();
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * Math.PI * 2;
        const rr = j.r * (0.72 + ((i * 29) % 11) / 30) * (1 + open * 0.55);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      c.fill();
      c.stroke();
      c.rotate(-j.rot);
      c.shadowBlur = 0;
      c.globalAlpha = 0.68 + open * 0.3;
      c.fillStyle = j.color;
      c.font = "9px 'VCR', monospace";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(j.label, 0, 1);
      c.restore();
      if (open > 0.08) {
        c.globalAlpha = 0.16 + open * 0.24;
        c.strokeStyle = j.color;
        c.beginPath();
        c.arc(j.x, j.y, j.r * (1.45 + open * 1.3), 0, Math.PI * 2);
        c.stroke();
      }
    });
    c.globalAlpha = 0.62;
    c.fillStyle = 'rgba(234,255,255,0.72)';
    c.font = "12px 'VCR', monospace";
    c.textAlign = 'center';
    c.fillText('TAP OR PINCH THE JUNK', W * 0.5, H - LOOP_PANEL_H - 42);
    c.restore();
  }

  function drawReplayPlayground(c) {
    if (!replayBall) initReplayPlayground();
    c.save();
    replayPickups.forEach(p => {
      const pulse = p.pulse || 0;
      c.shadowColor = p.color;
      c.shadowBlur = 10 + pulse * 18;
      c.globalAlpha = 0.46 + pulse * 0.35;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.r + pulse * 5, 0, Math.PI * 2);
      c.fill();
      c.shadowBlur = 0;
      c.globalAlpha = 0.74;
      c.fillStyle = '#02040e';
      c.font = "7px 'VCR', monospace";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(noteNameForDegree(p.deg), p.x, p.y + 1);
    });
    replayHazards.forEach(h => {
      const pulse = h.pulse || 0;
      c.save();
      c.translate(h.x, h.y);
      c.rotate(h.rot);
      c.shadowColor = h.color;
      c.shadowBlur = 8 + pulse * 20;
      c.globalAlpha = 0.58 + pulse * 0.34;
      c.fillStyle = 'rgba(2,4,14,0.84)';
      c.strokeStyle = h.color;
      c.lineWidth = 1.5 + pulse * 1.5;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = i / 8 * Math.PI * 2;
        const rr = h.r * (0.78 + ((i * 37) % 10) / 42);
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.closePath();
      c.fill();
      c.stroke();
      c.restore();
      for (let hp = 0; hp < h.maxHp; hp++) {
        c.globalAlpha = hp < h.hp ? 0.86 : 0.22;
        c.fillStyle = h.color;
        c.fillRect(h.x - h.maxHp * 4 + hp * 8, h.y - h.r - 11, 5, 3);
      }
    });
    const b = replayBall;
    c.shadowColor = b.color;
    c.shadowBlur = 18 + b.pulse * 22;
    c.globalAlpha = 0.92;
    c.fillStyle = b.color;
    c.beginPath();
    c.arc(b.x, b.y, b.r + b.pulse * 5, 0, Math.PI * 2);
    c.fill();
    c.shadowBlur = 0;
    c.globalAlpha = 0.30;
    c.strokeStyle = b.color;
    c.beginPath();
    c.arc(b.x, b.y, b.r + 12 + b.pulse * 8, 0, Math.PI * 2);
    c.stroke();
    c.globalAlpha = 1;
    c.fillStyle = 'rgba(0,229,255,0.16)';
    c.strokeStyle = COLOR;
    c.lineWidth = 2;
    c.fillRect(player.x - 30, player.y - 13, 60, 12);
    c.strokeRect(player.x - 30.5, player.y - 13.5, 61, 13);
    c.fillStyle = 'rgba(234,255,255,0.68)';
    c.font = "10px 'VCR', monospace";
    c.textAlign = 'center';
    c.fillText('KEEP THE LOOP ALIVE', W * 0.5, H - LOOP_PANEL_H - 50);
    c.textAlign = 'right';
    c.fillText(String(replayToyScore), W - 14, H - LOOP_PANEL_H - 50);
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
    if (!isFx) {
      const labelR = tc.maxR * 0.84;
      const activeDeg = pull && pull.dist > 0.12 ? pull.deg : -1;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      for (let deg = 0; deg < 10; deg += 1) {
        const a = -Math.PI / 2 + (deg / 10) * Math.PI * 2;
        const label = noteNameForDegree(deg);
        const active = deg === activeDeg;
        c.globalAlpha = active ? 0.96 : 0.42;
        c.fillStyle = active ? '#eaffff' : col;
        c.font = `${active ? 13 : 11}px 'VCR', monospace`;
        c.fillText(label, tc.x + Math.cos(a) * labelR, tc.y + Math.sin(a) * labelR);
      }
    }
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
        c.font = "10px 'VCR', monospace";
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
        c.font = "11px 'VCR', monospace";
        c.textAlign = 'center';
        c.fillStyle = '#eaffff';
        c.fillText(isFx ? fxChoiceForPull(pull).label : noteNameForDegree(pull.deg), pointerX, pointerY - 16);
      }
    } else {
      c.globalAlpha = 0.6;
      c.fillStyle = 'rgba(234,255,255,0.7)';
      c.font = "12px 'VCR', monospace";
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
      c.font = "11px 'VCR', monospace";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(lane.label, x + lw * 0.5, baseY + 17);
    }
    c.restore();
  }

  function drawWrappedCanvasText(c, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text || '').trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    words.forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if (line && c.measureText(next).width > maxWidth) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    const visible = lines.slice(0, maxLines || lines.length);
    if (lines.length > visible.length && visible.length) {
      let last = visible[visible.length - 1];
      while (last.length > 1 && c.measureText(`${last}...`).width > maxWidth) last = last.slice(0, -1);
      visible[visible.length - 1] = `${last}...`;
    }
    const start = y - ((visible.length - 1) * lineHeight) / 2;
    visible.forEach((l, i) => c.fillText(l, x, start + i * lineHeight));
  }


  function drawGuidedCoach(c) {
    if (!isGuidedBuildMode() || state !== 'playing' || phase !== 'build') return;
    const layer = activeLayer();
    const name = layer.name;
    const main = guidedStage === 'record' ? `RECORD ${name}` : guidedStage === 'waiting' ? 'PLAY WHEN READY' : guidedStage === 'review' ? `${name} ADDED` : `PRACTICE ${name}`;
    const sub = guidedStage === 'record' ? 'Keep playing until the bar fills.' : guidedStage === 'waiting' ? 'Your first note starts the take.' : guidedStage === 'review' ? 'Listen back. Keep it, add more, or start over.' : 'Try the sounds. Nothing records yet.';
    const y = 212;
    c.save();
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = 'rgba(2,4,14,0.72)';
    c.strokeStyle = 'rgba(0,229,255,0.45)';
    c.lineWidth = 2;
    const panelW = Math.min(W - 34, 520);
    const panelX = (W - panelW) / 2;
    const panelH = guidedStage === 'review' ? 108 : 98;
    c.fillRect(panelX, y - panelH * 0.5, panelW, panelH);
    c.strokeRect(panelX + 0.5, y - panelH * 0.5 + 0.5, panelW - 1, panelH - 1);
    c.globalAlpha = 0.62;
    c.fillStyle = '#eaffff';
    c.font = "10px 'VCR', monospace";
    c.fillText(`LAYER ${currentLayerIndex + 1} OF ${LAYERS.length}`, W * 0.5, y - panelH * 0.5 + 16);
    c.globalAlpha = 1;
    c.shadowColor = guidedStage === 'record' || guidedStage === 'waiting' ? '#ffe61a' : COLOR;
    c.shadowBlur = 16;
    c.fillStyle = guidedStage === 'record' || guidedStage === 'waiting' ? '#ffe61a' : COLOR;
    c.font = `${W < 380 ? 21 : 24}px 'VCR', monospace`;
    c.fillText(main, W * 0.5, y - 8);
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(234,255,255,0.94)';
    c.font = `${W < 380 ? 11 : 12}px 'VCR', monospace`;
    drawWrappedCanvasText(c, sub, W * 0.5, y + 26, panelW - 28, 15, 2);
    if (guidedStage === 'record') {
      const total = Math.max(1, LOOP_STEPS * beatMs);
      const progress = clamp(((stepIndex * beatMs) + Math.max(0, performance.now() - (beatAt - beatMs))) / total, 0, 1);
      const bw = panelW - 42;
      c.fillStyle = 'rgba(234,255,255,0.16)';
      c.fillRect(panelX + 21, y + 39, bw, 5);
      c.fillStyle = '#ffe61a';
      c.fillRect(panelX + 21, y + 39, bw * progress, 5);
    }
    c.restore();
  }

  function drawHud(c) {
    c.save();
    c.font = "12px 'VCR', monospace";
    c.textBaseline = 'top';
    if (state === 'playing' || state === 'replay' || state === 'mix') {
      const titleY = 58;
      c.fillStyle = 'rgba(234,255,255,0.78)';
      c.fillText(state === 'mix' ? 'MIX PLAYBACK' : state === 'replay' ? (isFreeMode() ? 'FREE REPLAY' : 'REPLAY') : activeLayerLabel(), 12, titleY);
      c.textAlign = 'right';
      c.fillText(isFreeMode() && state === 'playing' && freeRecording ? 'REC' : `${tempoBpm()} BPM`, W - 12, titleY);
    }
    c.textAlign = 'left';
    // Loop rows live up top now, right under the layer title.
    if (state === 'playing' || state === 'replay' || state === 'mix') {
      const loopX = 26, loopY = 72;
      const rowH = 7, rowGap = 4;
      const w = (W - 40) / LOOP_STEPS;
      const cellX = i => loopX + i * w + 1;
      const cellW = Math.max(2, w - 3);
      const playheadX = i => cellX(i) - 1;
      for (let i = 0; i < LOOP_STEPS; i++) {
        const active = i === stepIndex;
        const beatStart = i % 4 === 0;
        c.fillStyle = active ? COLOR : beatStart ? 'rgba(234,255,255,0.24)' : 'rgba(234,255,255,0.12)';
        if (loopEndArmed && i >= LOOP_STEPS - 4) c.fillStyle = active ? '#ffe61a' : 'rgba(255,230,26,0.34)';
        c.fillRect(cellX(i), loopY + LAYERS.length * (rowH + rowGap) + 1, cellW, active ? 7 : beatStart ? 5 : 4);
      }
      for (let row = 0; row < LAYERS.length; row++) {
        const layer = LAYERS[row];
        const y = loopY + row * (rowH + rowGap);
        c.globalAlpha = row === currentLayerIndex && state === 'playing' ? 0.95 : 0.58;
        c.fillStyle = layer.options[0].color;
        c.font = "8px 'VCR', monospace";
        c.textAlign = 'right';
        c.fillText(String(row + 1), loopX - 6, y + rowH + 1);
        for (let i = 0; i < LOOP_STEPS; i++) {
          const slots = layerSlotAt(i, row);
          const beatStart = i % 4 === 0;
          c.fillStyle = beatStart ? 'rgba(234,255,255,0.18)' : 'rgba(234,255,255,0.10)';
          if (loopEndArmed && i >= LOOP_STEPS - 4 && row === currentLayerIndex) c.fillStyle = 'rgba(255,230,26,0.20)';
          c.fillRect(cellX(i), y, cellW, rowH);
          if (beatStart) {
            c.fillStyle = 'rgba(234,255,255,0.22)';
            c.fillRect(playheadX(i), y - 1, 1, rowH + 2);
          }
          if (slots.length) {
            const slot = slots[slots.length - 1];
            c.fillStyle = slot.color;
            c.fillRect(cellX(i), y, cellW, rowH);
            if (slot.inst === 'drums' && slot.pieces && slot.pieces.length > 1) {
              const count = Math.min(slot.pieces.length, MAX_DRUM_STACK);
              c.fillStyle = '#02040e';
              c.globalAlpha = 0.36;
              for (let m = 1; m < count; m++) {
                const mx = cellX(i) + (cellW * m) / count;
                c.fillRect(mx, y, 1, rowH);
              }
              c.globalAlpha = row === currentLayerIndex && state === 'playing' ? 0.95 : 0.58;
            } else if (slot.inst === 'keys' && slot.notes && slot.notes.length > 1) {
              const count = Math.min(slot.notes.length, MAX_PIANO_STACK);
              c.fillStyle = '#02040e';
              c.globalAlpha = 0.30;
              for (let m = 1; m < count; m++) {
                const mx = cellX(i) + (cellW * m) / count;
                c.fillRect(mx, y, 1, rowH);
              }
              c.globalAlpha = row === currentLayerIndex && state === 'playing' ? 0.95 : 0.58;
            }
          }
          const flash = loopFlash[i];
          if (flash && flash.row === row && flash.pulse > 0) {
            c.fillStyle = flash.color;
            c.globalAlpha = 0.35 + flash.pulse * 0.55;
            c.fillRect(cellX(i), y - 1, cellW, rowH + 2);
            c.globalAlpha = row === currentLayerIndex && state === 'playing' ? 0.95 : 0.58;
          }
          if (i === stepIndex) {
            c.fillStyle = row === currentLayerIndex ? '#ffe61a' : 'rgba(0,229,255,0.72)';
            c.fillRect(playheadX(i), y - 1, 2, rowH + 2);
          }
        }
      }
      c.globalAlpha = 1;
      c.textAlign = 'left';
    }

    const counting = phase === 'countin' && state === 'playing';

    if (lastGrooveToast && state !== 'replay') {
      const layer = LAYERS[lastGrooveToast.layerIndex] || LAYERS[0];
      c.font = "10px 'VCR', monospace";
      c.fillStyle = '#ffe61a';
      c.textAlign = 'center';
      c.fillText(`${layer.name} ADDED`, W * 0.5, 128);
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
    const countdownActive = phase === 'countdown' && state === 'playing';
    const padsVisible = drumsActive() || (countdownActive && activeLayer().inst === 'drums');
    const thereminVisible = chimesActive() || (countdownActive && activeLayer().inst === 'chimes');
    const swellVisible = swellActive() || (countdownActive && activeLayer().inst === 'swell');
    const fxVisible = fxActive() || (countdownActive && activeLayer().inst === 'fx');
    const replayVisible = state === 'replay';
    const surfaceVisible = asteroidSurfaceActive() || (countdownActive && (activeLayer().inst === 'bass' || activeLayer().inst === 'keys'));
    if (!counting && !countdownActive && !padsVisible && !thereminVisible && !swellVisible && !fxVisible && !replayVisible && !surfaceVisible) drawLanes(c);
    drawBoss(c);
    if (replayVisible) drawReplayPlayground(c);
    if (padsVisible) drawPads(c);
    if (swellVisible) drawSwellSurface(c);
    if (fxVisible) drawFxJunkSurface(c);
    if (thereminVisible) drawTheremin(c);
    if (surfaceVisible) drawAsteroidSurface(c);
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
    if ((phase === 'countin' || phase === 'countdown') && state === 'playing') {
      c.save();
      const cx = W * 0.5;
      // Keep the 3-2-1 circle below the loop grid, over the playfield.
      const cy = phase === 'countdown' ? Math.max(playFieldTop() + 70, H * 0.3) : H * 0.42;
      const pulse = countKickPulse;
      const r = (phase === 'countdown' ? 38 : 58) + pulse * (phase === 'countdown' ? 8 : 12);
      c.shadowColor = COLOR;
      c.shadowBlur = 18 + pulse * 24;
      c.globalAlpha = phase === 'countdown' ? 1 : 0.16 + pulse * 0.18;
      c.fillStyle = phase === 'countdown' ? '#02040e' : COLOR;
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
      c.font = phase === 'countdown' ? "44px 'VCR', monospace" : "22px 'VCR', monospace";
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      let mainText = `${tempoBpm()} BPM`;
      let subText = 'SET TEMPO';
      if (phase === 'countdown' && countdown) {
        const elapsedCount = Math.max(0, now() - countdown.start);
        const slot = Math.floor(elapsedCount / countdown.beat);
        mainText = String(clamp(3 - slot, 1, 3));
        subText = countdown.afterClear ? 'CLEAR · RESTART' : countdown.guidedRecord ? 'RECORDING NEXT' : 'LOOP START';
      }
      c.fillText(mainText, cx, cy - 2);
      c.globalAlpha = 0.85;
      c.fillStyle = '#eaffff';
      c.font = "9px 'VCR', monospace";
      c.fillText(subText, cx, cy + (phase === 'countdown' ? 35 : 28));
      c.restore();
      c.globalAlpha = 1;
    }
    if (floatTexts && floatTexts.length) {
      c.save();
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.font = "12px 'VCR', monospace";
      floatTexts.forEach(f => {
        c.globalAlpha = clamp(1 - f.age / f.life, 0, 1);
        c.fillStyle = f.color;
        c.fillText(f.text, f.x, f.y);
      });
      c.restore();
      c.globalAlpha = 1;
    }
    if (!counting && !countdownActive && !padsVisible && !thereminVisible && !swellVisible && !fxVisible && !replayVisible && !rockTapActive()) drawShip(c);
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
    drawGuidedCoach(c);
    updateGuidedControls();
  }

  function frame(t) {
    if (state !== 'playing' && state !== 'replay' && state !== 'mix') return;
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
    if (state === 'playing' || state === 'replay' || state === 'mix') raf = requestAnimationFrame(frame);
  }

  function start() {
    fitCanvas();
    resetRun('arcade');
    state = 'playing';
    updateLoopButton();
    silenceArcadeMusic();
    overlay.classList.add('hidden');
    if (isGuidedBuildMode()) {
      phase = 'build';
      guidedStage = 'practice';
      restartLoopPlayback();
      updateLoopButton();
      showLayerToast();
    } else {
      beginLoopCountdown();
    }
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
    if (playAlongPrevSettings) {
      signalSettings = { ...playAlongPrevSettings };
      playAlongPrevSettings = null;
      applySettings();
    }
    mode = 'arcade';
    pendingStartMode = 'arcade';
    setupOpen = false;
    setupStep = 'palette';
    freeRecording = false;
    state = 'idle';
    replaying = false;
    loopEndArmed = false;
    updateLoopButton();
    syncSignalChrome();
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-tempo-mode');
    overlay.classList.add('signal-menu-mode');
    overlay.innerHTML = `
      <div class="signal-panel" style="width:min(460px,calc(100vw - 24px));max-width:460px;padding:18px 16px 16px;box-sizing:border-box">
        <div class="signal-title" style="font-size:24px;line-height:1.1;margin-bottom:14px">SPACE AND SOUND</div>
        <button class="signal-btn secondary" style="min-height:82px;font-size:17px;line-height:1.15;margin-bottom:10px;background:rgba(5,20,42,.78) !important;border:2px solid rgba(0,229,255,.72) !important;color:#00e5ff !important;box-shadow:none !important" onclick="signalShowSetup('arcade')">
          BUILD A TRACK<br><span style="display:block;font-size:14px;letter-spacing:1px;line-height:1.25;color:#eaffff;opacity:.95;margin-top:8px">Make a song one layer at a time.</span>
        </button>
        <button class="signal-btn secondary" style="min-height:82px;font-size:17px;line-height:1.15;margin-bottom:10px;background:rgba(5,20,42,.78) !important;border:2px solid rgba(0,229,255,.72) !important;color:#00e5ff !important;box-shadow:none !important" onclick="signalShowPlayAlong()">
          PLAY ALONG<br><span style="display:block;font-size:14px;letter-spacing:1px;line-height:1.25;color:#eaffff;opacity:.95;margin-top:8px">Watch a phrase, then play it back.</span>
        </button>
        <button class="signal-btn secondary" style="min-height:82px;font-size:17px;line-height:1.15;margin-bottom:10px;background:rgba(5,20,42,.78) !important;border:2px solid rgba(0,229,255,.72) !important;color:#00e5ff !important;box-shadow:none !important" onclick="signalShowSetup('free')">
          FREE PLAY<br><span style="display:block;font-size:14px;letter-spacing:1px;line-height:1.25;color:#eaffff;opacity:.95;margin-top:8px">Mess around with sounds.</span>
        </button>
        <button class="signal-btn secondary" style="min-height:82px;font-size:17px;line-height:1.15;background:rgba(5,20,42,.78) !important;border:2px solid rgba(0,229,255,.72) !important;color:#00e5ff !important;box-shadow:none !important" onclick="signalShowJukebox()">
          JUKEBOX<br><span style="display:block;font-size:14px;letter-spacing:1px;line-height:1.25;color:#eaffff;opacity:.95;margin-top:8px">Play your saved loops.</span>
        </button>
      </div>`;
  }

  function showPlayAlongMenu() {
    cancelAnimationFrame(raf);
    mode = 'playalong';
    pendingStartMode = 'playalong';
    setupOpen = false;
    state = 'idle';
    replaying = false;
    loopEndArmed = false;
    updateLoopButton();
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-tempo-mode');
    overlay.classList.add('signal-menu-mode');
    const diffs = ['EASY', 'MEDIUM', 'HARD', 'EXPERT'];
    const rows = diffs.map(diff => `
      <button class="signal-btn secondary" onclick="signalStartPlayAlongDifficulty('${diff}')">${diff}</button>
    `).join('');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">PLAY ALONG</div>
        <div class="signal-subtitle">WATCH A SHORT PHRASE. THEN PLAY IT BACK.</div>
        ${rows}
        <button class="signal-btn secondary" onclick="signalShowIntro()">BACK TO MENU</button>
      </div>`;
  }

  function startPlayAlongDifficulty(diff) {
    const wanted = String(diff).toUpperCase();
    const candidates = PLAY_ALONG_PATTERNS.filter(p => String(p.difficulty).toUpperCase() === wanted);
    const pattern = candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : PLAY_ALONG_PATTERNS[0];
    if (pattern) startPlayAlong(pattern.id);
  }

  function startPlayAlong(patternId) {
    const pattern = PLAY_ALONG_PATTERNS.find(p => p.id === patternId) || PLAY_ALONG_PATTERNS[0];
    if (!pattern) return;
    fitCanvas();
    resetRun('playalong');
    playAlongPattern = pattern;
    playAlongRoundIndex = 0;
    playAlongInput = [];
    playAlongResult = null;
    // Patterns borrow their own palette/tempo; the player's Build A Track
    // choices come back when they leave Play Along.
    if (!playAlongPrevSettings) playAlongPrevSettings = { ...signalSettings };
    signalSettings = { ...signalSettings, ...(pattern.settings || {}), grooveAssist: 'snap', recordingStyle: signalSettings.recordingStyle || 'guided' };
    applySettings();
    applyPlayAlongTempo();
    loop = loopFromPlayAlongPattern(pattern, 0);
    recordedChoices = [];
    silenceArcadeMusic();
    restartPlayAlongRound();
  }

  function setupNavButtonsHTML(primaryLabel, primaryAction, backAction) {
    return `
      <div style="position:sticky;bottom:0;z-index:2;display:grid;grid-template-columns:.72fr 1fr;gap:10px;margin-top:12px;padding:10px 0 2px;background:linear-gradient(180deg,rgba(3,12,32,0),rgba(3,12,32,.96) 30%,rgba(6,3,22,.98))">
        <button class="signal-btn secondary" style="min-height:46px;font-size:11px;margin-top:0" onclick="${backAction || 'signalShowIntro()'}">BACK</button>
        <button class="signal-btn secondary" style="min-height:46px;font-size:12px;margin-top:0;background:rgba(2,4,14,.94) !important;border:2px solid rgba(0,229,255,.72) !important;color:#eaffff !important;box-shadow:0 0 14px rgba(0,229,255,.16) !important" onclick="${primaryAction}">${primaryLabel}</button>
      </div>`;
  }

  function setupChipGridHTML(key, items, columns) {
    const cols = key === 'style' ? 2 : (columns || 2);
    const chips = items.map(item => {
      const selected = signalSettings[key] === item.id;
      const style = [
        'width:100%',
        'min-width:0',
        'margin:0',
        'box-sizing:border-box',
        'display:flex',
        'align-items:center',
        'justify-content:center',
        'text-align:center',
        `min-height:${key === 'style' ? '50px' : '46px'}`,
        `font-size:${key === 'style' ? '12px' : '12px'}`,
        'line-height:1.08',
        'letter-spacing:1px',
        `border-width:${selected ? '2px' : '1px'}`,
        `box-shadow:${selected ? '0 0 20px rgba(0,229,255,.35)' : 'none'}`,
      ].join(';');
      return `<button type="button" class="signal-chip ${selected ? 'active' : ''}" style="${style}" onclick="signalSetPreset('${key}', '${item.id}')">${selected ? '✓ ' : ''}${item.label}</button>`;
    }).join('');
    return `<div style="display:grid !important;grid-template-columns:repeat(${cols}, minmax(0, 1fr)) !important;gap:8px;width:100%;box-sizing:border-box;align-items:stretch">${chips}</div>`;
  }

  function setupPanelStyle() {
    return [
      'width:min(500px,calc(100vw - 24px))',
      'max-width:500px',
      'max-height:calc(100dvh - 84px - env(safe-area-inset-bottom, 0px))',
      'overflow-y:auto',
      '-webkit-overflow-scrolling:touch',
      'padding:14px 14px calc(env(safe-area-inset-bottom, 0px) + 12px)',
      'box-sizing:border-box',
    ].join(';');
  }

  function showSetup(nextMode, step) {
    pendingStartMode = nextMode === 'free' ? 'free' : 'arcade';
    setupOpen = true;
    if (pendingStartMode === 'free') {
      overlay.classList.remove('hidden');
      overlay.classList.add('signal-menu-mode');
      overlay.classList.remove('signal-tempo-mode');
      overlay.innerHTML = `
        <div class="signal-panel">
          <div class="signal-title">FREE PLAY</div>
          <div class="signal-subtitle">MESS AROUND WITH SOUNDS.</div>
          ${presetControlsHTML(true)}
          <button class="signal-btn" onclick="signalConfirmSetup()">CHOOSE LAYER</button>
          <button class="signal-btn secondary" onclick="signalShowIntro()">BACK TO MENU</button>
        </div>`;
      return;
    }
    setupStep = step || setupStep || 'palette';
    renderBuildSetup();
  }

  function renderBuildSetup() {
    overlay.classList.remove('hidden');
    overlay.classList.add('signal-menu-mode');
    overlay.classList.remove('signal-tempo-mode');
    const panelStyle = setupPanelStyle();
    if (setupStep === 'feel') {
      overlay.innerHTML = `
        <div class="signal-panel" style="${panelStyle}">
          <div class="signal-title" style="font-size:22px;margin-bottom:14px">CHOOSE FEEL</div>
          <div class="signal-preset-label" style="font-size:12px;margin-bottom:8px">MOOD</div>
          ${setupChipGridHTML('mood', SIGNAL_PRESETS.mood, 2)}
          <div class="signal-preset-label" style="font-size:12px;margin-top:14px;margin-bottom:8px">TEMPO</div>
          ${setupChipGridHTML('tempo', SIGNAL_PRESETS.tempo, 3)}
          ${setupNavButtonsHTML('NEXT ›', "signalSetupStep('style')", "signalSetupStep('palette')")}
        </div>`;
      return;
    }
    if (setupStep === 'style') {
      const active = signalSettings.recordingStyle || 'guided';
      const card = (id, title, sub) => `
        <button type="button" class="signal-chip ${active === id ? 'active' : ''}" style="min-height:82px;font-size:15px;line-height:1.15;letter-spacing:1.1px;text-align:left;padding:12px 14px;border-width:${active === id ? '2px' : '1px'};box-shadow:${active === id ? '0 0 22px rgba(0,229,255,.38)' : 'none'}" onclick="signalChooseBuildStyle('${id}')">
          <span style="font-size:17px">${active === id ? '✓ ' : ''}${title}</span><br>
          <span style="display:block;font-size:13px;letter-spacing:.7px;line-height:1.25;opacity:.92;margin-top:7px">${sub}</span>
        </button>`;
      overlay.innerHTML = `
        <div class="signal-panel" style="${panelStyle}">
          <div class="signal-title" style="font-size:22px;line-height:1.15;margin-bottom:14px">HOW DO YOU WANT TO BUILD?</div>
          <div style="display:grid;grid-template-columns:1fr;gap:12px">
            ${card('guided', 'GUIDED', 'Practice first, then record in steps.')}
            ${card('freebuild', 'FREE BUILD', 'Loop runs while you add notes freely.')}
          </div>
          ${setupNavButtonsHTML('START ›', 'signalConfirmSetup()', "signalSetupStep('feel')")}
        </div>`;
      return;
    }
    setupStep = 'palette';
    overlay.innerHTML = `
      <div class="signal-panel" style="${panelStyle}">
        <div class="signal-title" style="font-size:22px;margin-bottom:14px">CHOOSE PALETTE</div>
        ${setupChipGridHTML('style', SIGNAL_PRESETS.style, 2)}
        ${setupNavButtonsHTML('NEXT ›', "signalSetupStep('feel')", "signalShowIntro()")}
      </div>`;
  }

  function confirmSetup() {
    setupOpen = false;
    if (pendingStartMode === 'free') showFreeLayerMenu(false);
    else {
      if ((signalSettings.recordingStyle || 'guided') === 'freebuild') signalSettings.grooveAssist = 'light';
      else {
        signalSettings.recordingStyle = 'guided';
        signalSettings.grooveAssist = 'snap';
      }
      start();
    }
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

  function freeLayerMenuHTML() {
    const rows = LAYERS.map((layer, index) => `
      <button class="signal-chip ${index === freeLayerIndex ? 'active' : ''}" style="min-height:38px" onclick="signalChooseFreeLayer(${index})">▶ ${layer.name}</button>
    `).join('');
    const hasLoop = freeLayerMenuKeepsLoop && freeHasRecordedLoop();
    return `
      <div class="signal-panel">
        <div class="signal-title">FREE PLAY</div>
        <div class="signal-subtitle">${hasLoop ? 'PICK A LAYER — YOUR LOOP KEEPS PLAYING.' : 'TAP A LAYER TO START FREE PLAY.'}</div>
        <div class="signal-tempo-box" style="margin:10px 0 12px;padding:12px">
          <div id="signal-tempo-value" class="signal-tempo-value" style="font-size:22px">${tempoBpm()} BPM</div>
          <input class="signal-tempo-slider" type="range" min="${MIN_TEMPO_BPM}" max="${MAX_TEMPO_BPM}" value="${tempoBpm()}" oninput="signalSetTempo(this.value, true)">
        </div>
        <div class="signal-presets" style="grid-template-columns:repeat(2,minmax(0,1fr));gap:7px">${rows}</div>
        ${hasLoop ? '<button class="signal-btn secondary" onclick="signalShowFreeSave()">SAVE LOOP</button>' : ''}
        <button class="signal-btn secondary" onclick="signalShowIntro()">BACK TO MENU</button>
      </div>`;
  }

  function showFreeLayerMenu(keepLoop) {
    cancelAnimationFrame(raf);
    setupOpen = false;
    freeLayerMenuKeepsLoop = keepLoop == null ? isFreeMode() && (state === 'playing' || freeHasRecordedLoop()) : !!keepLoop;
    mode = 'free';
    state = 'built';
    freeRecording = false;
    loopEndArmed = false;
    updateLoopButton();
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-menu-mode');
    overlay.classList.remove('signal-tempo-mode');
    overlay.innerHTML = freeLayerMenuHTML();
  }

  function switchFreeLayer(index) {
    freeLayerIndex = clamp(Math.floor(index || 0), 0, LAYERS.length - 1);
    currentLayerIndex = freeLayerIndex;
    undoStack = [];
    additionsThisLayer = recordedChoices.filter(ch => choiceLayerIndex(ch) === currentLayerIndex).length;
    rocks = [];
    bullets = [];
    pointerActive = false;
    thereminPulse = 0;
    applyLayerOptions();
    if (asteroidSurfaceActive()) initAsteroidSurface();
    if (fxActive()) initFxJunk();
    laneFlash = [1, 1, 1];
    showLayerToast();
  }

  function startFreeMode(index) {
    freeLayerMenuKeepsLoop = false;
    fitCanvas();
    freeLayerIndex = clamp(Math.floor(index || 0), 0, LAYERS.length - 1);
    resetRun('free');
    switchFreeLayer(freeLayerIndex);
    state = 'playing';
    phase = 'build';
    loopEndArmed = false;
    freeRecording = false;
    silenceArcadeMusic();
    overlay.classList.add('hidden');
    updateLoopButton();
    beginLoopCountdown();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function chooseFreeLayer(index) {
    if (!freeLayerMenuKeepsLoop) {
      startFreeMode(index);
      return;
    }
    freeLayerMenuKeepsLoop = false;
    // Switching instruments keeps everything already recorded — the sandbox
    // is for layering, not for losing work.
    const nextLayer = clamp(Math.floor(index || 0), 0, LAYERS.length - 1);
    switchFreeLayer(nextLayer);
    state = 'playing';
    phase = 'build';
    freeRecording = true;
    overlay.classList.add('hidden');
    updateLoopButton();
    restartLoopPlayback();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function showFreeSave() {
    if (!isFreeMode() || !freeHasRecordedLoop()) return;
    freeRecording = false;
    updateLoopButton();
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-menu-mode');
    overlay.classList.remove('signal-tempo-mode');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">SAVE LOOP</div>
        <div class="signal-subtitle">${activeLayer().name} · ${recipeExtra(currentRecipe())}</div>
        <div style="display:flex;gap:8px;margin-top:14px">
          <input id="signal-name" maxlength="12" placeholder="NAME" style="flex:1;min-width:0;height:42px;box-sizing:border-box;background:#02040e;border:1.5px solid ${COLOR};border-radius:4px;color:#fff;text-align:center;text-transform:uppercase;font-family:'VCR',monospace;font-size:14px;letter-spacing:3px">
          <button id="signal-save-btn" class="signal-btn" style="width:58px;margin:0" onclick="signalSaveRecipe()">▶</button>
        </div>
        <div id="signal-save-status" class="signal-subtitle" style="min-height:18px;margin-top:8px"></div>
        <button class="signal-btn secondary" onclick="signalResumeFreeMode()">BACK TO LOOP</button>
        <button class="signal-btn secondary" onclick="signalShowJukebox()">JUKEBOX</button>
        <button class="signal-btn secondary" onclick="signalShowIntro()">MENU</button>
      </div>`;
    const input = document.getElementById('signal-name');
    if (input) input.focus({ preventScroll: true });
  }

  function resumeFreeMode() {
    if (!isFreeMode()) return;
    state = 'playing';
    phase = 'build';
    overlay.classList.add('hidden');
    updateLoopButton();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  function backButtonHTML() {
    return `<div style="display:flex;justify-content:flex-end;margin-top:14px">
      <button class="signal-btn secondary" style="width:auto;min-width:176px;margin:0;padding:0 14px" onclick="nav('lobby')">BACK TO ARCADE</button>
    </div>`;
  }

  function presetControlsHTML(freeOnly) {
    const group = (key, label) => {
      const items = SIGNAL_PRESETS[key] || [];
      const compact = key !== 'style';
      const chips = items.map(item => `
        <button type="button" class="signal-chip ${signalSettings[key] === item.id ? 'active' : ''}" style="${compact ? 'min-height:38px' : 'min-height:44px'};font-size:11px" onclick="signalSetPreset('${key}', '${item.id}')">${item.label}</button>
      `).join('');
      return `
      <div class="signal-preset-row">
        <div class="signal-preset-label">${label}</div>
        <div class="signal-preset-chip-grid ${compact ? 'compact' : 'wide'}" role="group" aria-label="${label}">
          ${chips}
        </div>
      </div>`;
    };
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
    const layerCount = LAYERS.filter((layer, index) => stamps.some(s => choiceLayerIndex(s) === index || s.layerId === layer.id)).length;
    return `<div class="signal-stats">
      <div class="signal-stat">TRACK<b>${hitCount} HITS</b></div>
      <div class="signal-stat">LAYERS<b>${layerCount}</b></div>
    </div>`;
  }

  function mixControlsHTML() {
    return `<div class="signal-mix-controls">
      ${LAYERS.map(layer => {
        const pct = Math.round(layerVolumeForId(layer.id) * 100);
        return `<label class="signal-mix-row">
          <span class="signal-mix-name" style="color:${layer.options[0].color}">${layer.name}</span>
          <input class="signal-mix-slider" type="range" min="0" max="125" value="${pct}" oninput="signalSetLayerVolume('${layer.id}', this.value)">
          <span id="signal-mix-value-${layer.id}" class="signal-mix-value">${pct}%</span>
        </label>`;
      }).join('')}
    </div>`;
  }

  function grooveSummaryHTML() {
    const stamps = gridStamps();
    const rows = LAYERS.map((layer, index) => {
      const hits = stamps.filter(s => choiceLayerIndex(s) === index || s.layerId === layer.id).reduce((n, s) => n + (s.pieces ? s.pieces.length : s.notes ? s.notes.length : 1), 0);
      return `<div class="signal-stat">${layer.name}<b>${hits ? hits + ' HITS' : 'REST'}</b></div>`;
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
    const freeLayer = LAYERS[freeLayerIndex] || activeLayer();
    const mix = { layerVolumes: normalizeLayerVolumes(layerVolumes) };
    return {
      version: 3,
      settings: { ...signalSettings },
      beatMs,
      score,
      mix,
      meta: isFreeMode() ? { mode: 'free', freeLayerIndex, freeLayerId: freeLayer.id, freeLayerName: freeLayer.name, mix } : { mode: 'arcade', mix },
      layers: LAYERS.map((layer, index) => ({ index, id: layer.id, name: layer.name })),
      grooveByLayer: Object.fromEntries(LAYERS.map((layer, index) => [layer.id, grooveByLayer[index] || null])),
      choices: gridStamps(),
    };
  }

  function recipeExtra(recipe) {
    const settings = recipe && recipe.settings ? recipe.settings : signalSettings;
    const base = `${presetLabel('style', settings.style)} · ${presetLabel('mood', settings.mood)}`;
    if (recipe && recipe.meta && recipe.meta.mode === 'free') {
      return `FREE PLAY · ${recipe.meta.freeLayerName || 'LAYER'} · ${base}`;
    }
    return base;
  }

  function recipeSummary(recipe) {
    const choices = recipe && recipe.choices ? recipe.choices : recordedChoices;
    if (!choices.length) return '';
    if (recipe && recipe.meta && recipe.meta.mode === 'free') {
      const layerName = recipe.meta.freeLayerName || 'FREE';
      const hits = choices.reduce((n, c) => n + (c.pieces ? c.pieces.length : c.notes ? c.notes.length : 1), 0);
      return `FREE ${layerName}: ${hits} HITS`;
    }
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
        <button class="signal-btn secondary" onclick="signalShowMix()">MIX</button>
        <button class="signal-btn" onclick="signalReplayTrack()">REPLAY TRACK</button>
        <button class="signal-btn secondary" onclick="signalEndRun()">END RUN</button>
      </div>`;
  }

  function showMixScreen() {
    cancelAnimationFrame(raf);
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-tempo-mode');
    overlay.classList.remove('signal-menu-mode');
    overlay.innerHTML = `
      <div class="signal-panel signal-mix-panel">
        <div class="signal-title">MIX</div>
        <div class="signal-subtitle">BALANCE EACH LAYER BEFORE REPLAY OR SAVE.</div>
        ${compactTrackStatsHTML()}
        ${mixControlsHTML()}
        <button class="signal-btn" onclick="signalReplayTrack()">REPLAY TRACK</button>
        <button class="signal-btn secondary" onclick="signalEndRun()">SAVE SCREEN</button>
      </div>`;
    startMixAudition();
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
    const hitCount = gridStamps().reduce((n, s) => n + (s.pieces ? s.pieces.length : s.notes ? s.notes.length : 1), 0);
    const canSave = won || hitCount > 0;
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-tempo-mode');
    overlay.classList.remove('signal-menu-mode');
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">TRACK BUILT</div>
        <div class="signal-subtitle">SAVED CHOICES READY FOR REPLAY.</div>
        <div class="signal-stats">
          <div class="signal-stat">TIME<b>${seconds}s</b></div>
          <div class="signal-stat">TRACK<b>${hitCount} HITS</b></div>
        </div>
        ${canSave ? `
          <div style="display:flex;gap:8px;margin-top:14px">
            <input id="signal-name" maxlength="12" placeholder="NAME" style="flex:1;min-width:0;height:42px;box-sizing:border-box;background:#02040e;border:1.5px solid ${COLOR};border-radius:4px;color:#fff;text-align:center;text-transform:uppercase;font-family:'VCR',monospace;font-size:14px;letter-spacing:3px">
            <button id="signal-save-btn" class="signal-btn" style="width:58px;margin:0" onclick="signalSaveRecipe()">▶</button>
          </div>
          <div id="signal-save-status" class="signal-subtitle" style="min-height:18px;margin-top:8px"></div>` : ''}
        ${canSave ? `<button class="signal-btn secondary" onclick="signalShowMix()">MIX</button>` : ''}
        ${won ? `<button class="signal-btn secondary" onclick="signalShowJukebox()">JUKEBOX</button>` : ''}
        <button class="signal-btn secondary" onclick="signalShowIntro()">MENU</button>
        <button class="signal-btn" onclick="signalStart()">PLAY AGAIN</button>
      </div>`;
    const input = document.getElementById('signal-name');
    if (input) input.focus({ preventScroll: true });
  }

  function saveScore() {
    const input = document.getElementById('signal-name');
    const status = document.getElementById('signal-save-status');
    if (status) status.textContent = 'SAVED';
    if (input) input.disabled = true;
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
          const key = `${row.name || ''}:${row.extra || ''}:${row.recipe && row.recipe.choices ? row.recipe.choices.length : 0}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        }).slice(0, 20);
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
    saveSignalRecipes(rows);
    if (status) status.textContent = 'SAVING LOOP...';
    if (input) input.disabled = true;
    if (button) {
      button.disabled = true;
      button.textContent = 'Saving loop...';
      button.style.width = 'auto';
      button.style.minWidth = '190px';
    }
    let recipeOnline = false;
    if (window.SignalRecipeRemote && typeof window.SignalRecipeRemote.submit === 'function') {
      try {
        recipeOnline = await withTimeout(window.SignalRecipeRemote.submit(name, score, extra, recipe), 3500);
      } catch(e) {
      }
    }
    if (status) status.textContent = recipeOnline ? 'SAVED ONLINE · JUKEBOX READY' : 'SAVED LOCAL · JUKEBOX READY';
    if (button) button.textContent = recipeOnline ? 'Saved online' : 'Saved local';
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
        pushStamp(wrapStep(choice.step), {
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
          const piece = choice.role === 'hat' ? 'hat' : (choice.role === 'clap' || choice.role === 'snare') ? 'snare' : 'kick';
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
    mode = recipe.meta && recipe.meta.mode === 'free' ? 'free' : 'arcade';
    freeRecording = false;
    signalSettings = { ...signalSettings, ...(recipe.settings || {}) };
    applySettings();
    layerVolumes = normalizeLayerVolumes((recipe.mix && recipe.mix.layerVolumes) || (recipe.meta && recipe.meta.mix && recipe.meta.mix.layerVolumes));
    // Tapped tempos don't match any preset, so honor the recipe's exact beat.
    if (Number.isFinite(recipe.beatMs)) beatMs = clamp(recipe.beatMs, 170, 420);
    phase = 'build';
    loop = recipeToLoop(recipe);
    recordedChoices = recipe.choices.map(c => ({ ...c, phrase: c.phrase ? c.phrase.slice() : [] }));
    undoStack = [];
    grooveByLayer = LAYERS.map(layer => recipe.grooveByLayer && recipe.grooveByLayer[layer.id] ? recipe.grooveByLayer[layer.id] : null);
    lastGrooveToast = null;
    if (isFreeMode() && recipe.meta && Number.isFinite(recipe.meta.freeLayerIndex)) {
      currentLayerIndex = clamp(recipe.meta.freeLayerIndex, 0, LAYERS.length - 1);
    } else {
      currentLayerIndex = Math.max(0, Math.min(LAYERS.length - 1, ...recordedChoices.map(c => c.layerIndex ?? ((c.loop || 1) - 1))));
    }
    freeLayerIndex = currentLayerIndex;
    additionsThisLayer = 0;
    totalAdditions = recordedChoices.length;
    state = 'replay';
    replaying = true;
    applyLayerOptions();
    updateLoopButton();
    replayUntil = performance.now() + LOOP_STEPS * beatMs * 2;
    overlay.classList.add('hidden');
    rocks = [];
    bullets = [];
    initReplayPlayground();
    if (!stars || !stars.length) initStars();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  async function showJukebox() {
    jukeboxBackTarget = isFreeMode() && (state === 'playing' || state === 'built') ? 'free' : state === 'over' ? 'result' : (state === 'built' && recordedChoices.length ? 'built' : 'intro');
    overlay.classList.remove('hidden');
    overlay.classList.remove('signal-tempo-mode');
    overlay.classList.remove('signal-menu-mode');
    state = 'built';
    loopEndArmed = false;
    updateLoopButton();
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">JUKEBOX</div>
        <div class="signal-subtitle">LOADING SAVED SPACE AND SOUND RECIPES...</div>
      </div>`;
    const result = await loadJukeboxRows();
    const rows = result.rows;
    jukeboxRows = rows;
    const list = rows.length ? rows.slice(0, 8).map((row, i) => `
      <div class="signal-jukebox-row">
        <div>
          <div class="signal-jukebox-name">${i + 1}. ${row.name}</div>
          <div class="signal-jukebox-meta">${row.extra || 'SAVED TRACK'}</div>
          <div class="signal-jukebox-seq">${recipeSummary(row.recipe)}</div>
        </div>
        <button class="signal-chip" style="min-height:44px;padding:0 16px;border:1.5px solid rgba(0,229,255,.72);background:rgba(0,229,255,.14);color:#eaffff;font-size:12px" onclick="signalPlayRecipe('${row.id}')">▶ PLAY</button>
      </div>`).join('') : '<div class="signal-subtitle">NO SAVED TRACKS YET.</div>';
    overlay.innerHTML = `
      <div class="signal-panel">
        <div class="signal-title">JUKEBOX</div>
        <div class="signal-subtitle">${result.online ? 'SHARED SPACE AND SOUND RECIPES.' : 'LOCAL SAVED SPACE AND SOUND RECIPES.'}</div>
        <div class="signal-jukebox">${list}</div>
        <button class="signal-btn secondary" onclick="signalJukeboxBack()">BACK</button>
      </div>`;
  }

  function pointerPos(e) {
    const rect = canvas.getBoundingClientRect();
    const p = e.touches && e.touches.length ? e.touches[0] : e;
    return { x: (p.clientX - rect.left) * (W / rect.width), y: (p.clientY - rect.top) * (H / rect.height) };
  }

  function touchPoint(touch) {
    const rect = canvas.getBoundingClientRect();
    return { x: (touch.clientX - rect.left) * (W / rect.width), y: (touch.clientY - rect.top) * (H / rect.height) };
  }

  function twoTouchState(e) {
    if (!e.touches || e.touches.length < 2) return null;
    const a = touchPoint(e.touches[0]);
    const b = touchPoint(e.touches[1]);
    return {
      a,
      b,
      x: (a.x + b.x) * 0.5,
      y: (a.y + b.y) * 0.5,
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
  }

  function fxJunkAt(pos) {
    if (!fxJunk.length) initFxJunk();
    let best = null;
    let bestScore = Infinity;
    fxJunk.forEach((junk, index) => {
      const hitR = junk.r + 28 + junk.armed * 14;
      const dist = Math.hypot(junk.x - pos.x, junk.y - pos.y);
      if (dist <= hitR && dist - hitR < bestScore) {
        best = { junk, index, dist };
        bestScore = dist - hitR;
      }
    });
    return best;
  }

  function beginFxPinch(e) {
    const two = twoTouchState(e);
    if (!two || !fxActive()) return false;
    const best = fxJunkAt(two);
    if (!best) return false;
    pinchActive = true;
    pinchStartDist = two.dist;
    pinchJunk = best.junk;
    pinchStamped = false;
    pinchJunk.armed = 1;
    pinchJunk.pulse = Math.max(pinchJunk.pulse || 0, 0.7);
    return true;
  }

  function updateFxPinch(e) {
    const two = twoTouchState(e);
    if (!two || !pinchActive || !pinchJunk || !fxActive()) return false;
    const stretch = clamp((two.dist / Math.max(1, pinchStartDist) - 1) / 0.85, 0, 1);
    pinchJunk.armed = Math.max(pinchJunk.armed || 0, stretch);
    pinchJunk.pulse = Math.max(pinchJunk.pulse || 0, 0.5 + stretch);
    pointerX = two.x;
    pointerY = two.y;
    if (stretch > 0.24 && !pinchStamped) {
      triggerFxJunk(pinchJunk, stretch, performance.now());
      pinchStamped = true;
    } else if (stretch > 0.62) {
      playFxGesture(pinchJunk.piece, degreeFreq(pinchJunk.piece === 'echo' ? 2 : pinchJunk.piece === 'rise' ? 5 : 8, activeLayer().mult), 0.26 + stretch * 0.22, 0, { intensity: stretch, tension: stretch });
    }
    return true;
  }

  function attachInput() {
    if (canvas._signalReady) return;
    canvas._signalReady = true;
    canvas.addEventListener('touchstart', e => {
      if (state !== 'playing' && state !== 'replay') return;
      e.preventDefault();
      if (beginFxPinch(e)) return;
      const p = pointerPos(e);
      pointerActive = true;
      pointerX = p.x;
      pointerY = p.y;
      audioCtx();
      tapShoot(p);
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
      if (state !== 'playing' && state !== 'replay') return;
      e.preventDefault();
      if (updateFxPinch(e)) return;
      const p = pointerPos(e);
      pointerX = p.x;
      pointerY = p.y;
    }, { passive: false });
    canvas.addEventListener('touchend', () => { pointerActive = false; pinchActive = false; pinchJunk = null; }, { passive: true });
    canvas.addEventListener('touchcancel', () => { pointerActive = false; pinchActive = false; pinchJunk = null; }, { passive: true });
    canvas.addEventListener('mousemove', e => {
      if (state !== 'playing' && state !== 'replay') return;
      const p = pointerPos(e);
      pointerActive = true;
      pointerX = p.x;
      pointerY = p.y;
    });
    canvas.addEventListener('mousedown', e => {
      if (state !== 'playing' && state !== 'replay') return;
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
  window.signalSetupStep = function(step) {
    setupStep = step || 'palette';
    renderBuildSetup();
  };
  window.signalChooseBuildStyle = function(style) {
    signalSettings.recordingStyle = style === 'freebuild' ? 'freebuild' : 'guided';
    signalSettings.grooveAssist = signalSettings.recordingStyle === 'freebuild' ? 'light' : 'snap';
    renderBuildSetup();
  };
  window.signalStartPlayAlongDifficulty = startPlayAlongDifficulty;
  window.signalSetTempo = function(value, preview) {
    audioCtx();
    setTempoBpm(Number(value));
    if (preview) previewTempoKick();
  };
  window.signalStartTempo = function() {
    skipCountIn();
  };
  window.signalShowFreeLayers = showFreeLayerMenu;
  window.signalShowSetup = showSetup;
  window.signalConfirmSetup = confirmSetup;
  window.signalStartFreeMode = startFreeMode;
  window.signalChooseFreeLayer = chooseFreeLayer;
  window.signalResumeFreeMode = resumeFreeMode;
  window.signalShowFreeSave = showFreeSave;
  window.signalEndLoop = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (phase === 'countin' && state === 'playing') skipCountIn();
    else if (isGuidedBuildMode() && phase === 'build' && guidedStage === 'review') captureNextLayer();
    else requestLoopEnd();
  };
  window.signalResetLoop = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (isGuidedBuildMode() && phase === 'build' && guidedStage === 'practice') skipGuidedLayer();
    else if (isGuidedBuildMode() && phase === 'build' && guidedStage === 'review') captureRetryLayer();
    else resetCurrentLoop();
  };
  window.signalUndoLoop = function(e) {
    if (e && typeof e.preventDefault === 'function') e.preventDefault();
    if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
    if (canUndoLastStamp()) undoLastStamp();
  };
  window.signalSaveScore = saveScore;
  window.signalSaveRecipe = saveRecipe;
  window.signalReplayTrack = startReplay;
  window.signalLoopAgain = continueLooping;
  window.signalCaptureNext = captureNextLayer;
  window.signalCaptureRetry = captureRetryLayer;
  window.signalCaptureAddMore = captureAddMoreLayer;
  window.signalEndRun = endBuiltRun;
  window.signalShowMix = showMixScreen;
  window.signalSetLayerVolume = setLayerVolume;
  window.signalShowPlayAlong = showPlayAlongMenu;
  window.signalStartPlayAlong = startPlayAlong;
  window.signalPlayAlongRetry = playAlongRetry;
  window.signalPlayAlongNextRound = playAlongNextRound;
  window.signalShowJukebox = showJukebox;
  window.signalJukeboxBack = function() {
    if (jukeboxBackTarget === 'result') showResult(true);
    else if (jukeboxBackTarget === 'built' && recordedChoices.length) showBuiltChoice();
    else if (jukeboxBackTarget === 'free') resumeFreeMode();
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
    if (setupOpen) showSetup(pendingStartMode);
    else showIntro();
  };
  window.signalCyclePreset = function(group, dir) {
    const presets = SIGNAL_PRESETS[group];
    if (!presets || !presets.length) return;
    const current = presets.findIndex(p => p.id === signalSettings[group]);
    const next = (current + (dir || 1) + presets.length) % presets.length;
    signalSettings[group] = presets[next].id;
    applySettings();
    if (setupOpen) showSetup(pendingStartMode);
    else showIntro();
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
