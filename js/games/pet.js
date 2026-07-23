// ══════════════════════════════════════
//  PET MOBE — game-led virtual pet care inside the arcade
// ══════════════════════════════════════
// Self-contained IIFE mirroring snoob.js / signal.js. Exposes window.initPet
// (nav-in) and window.petBack (nav-out). One "species" — the MOBLING — hatched
// from an egg, grown through baby -> juvenile -> adult, branching into one of
// four collectible adult forms based on how it was raised.
//
// Design principles:
//  - Feed, play, rest, and guard are arcade games. The first meaningful beat
//    banks useful care; longer/skilled runs improve grades, tickets, and traits.
//  - Affection is direct, unlimited, and deliberately separate from progression.
//  - Needs communicate personality and opportunity, never punishment: they
//    decay slowly, stop at a safe floor, and do not erase growth or collections.
//  - Four adult forms reflect how the player actually played: joy, spark,
//    balance, or brave comebacks after imperfect runs.
//  - Icons reuse the arcade `projectiles/*.png` asset bank; the heart is SVG.
(function() {
  const COLOR = '#ff6ec7';
  const BOARD_KEY = 'pet';
  const SAVE_KEY = 'moberino-pet-v1';

  // ── Tunables ─────────────────────────────────────────────────────────────
  // Needs describe the pet's current comfort; they are not a punishment clock.
  // A full bar takes roughly two days to reach the safe floor, and nothing falls
  // below that floor while the player is away. Challenge lives in the games.
  const DECAY = { hunger: 0.026, happiness: 0.020, energy: 0.018, safety: 0.016 }; // per real minute
  const NEED_FLOOR = 24;
  const MAX_GAP_MIN = 60 * 24 * 7;
  const MOMENT_EVERY_MIN = 60 * 8;
  const MAX_MOMENTS = 3;
  const STAGE_NAMES = ['EGG', 'BABY', 'JUVENILE', 'ADULT'];
  const STAGE_THRESHOLD = [5, 10, 16];   // care-progress needed to leave egg / baby / juvenile
  const STAGE_MIN_ACTIONS = [4, 6, 8];   // soft gate so evolution never fires on one big tick
  const COOLDOWN = { feed: 12000, play: 18000, rest: 24000, pet: 0, guard: 18000 };
  const ACTION_COLOR = {
    feed: ['#ff9933', 'rgba(255,153,51,0.06)'],
    play: ['#ff6ec7', 'rgba(255,110,199,0.06)'],
    rest: ['#33ff99', 'rgba(51,255,153,0.06)'],
    pet: ['#ff6ec7', 'rgba(255,110,199,0.06)'],
    guard: ['#4fd8ff', 'rgba(79,216,255,0.06)'],
  };
  const MOOD_TAGS = {
    idle: 'CONTENT', happy: 'HAPPY!', hungry: 'HUNGRY', tired: 'SLEEPY',
    lonely: 'LONELY', sick: 'NOT WELL', alert: 'NERVOUS', celebrate: 'YAY!',
    dormant: 'RESTING',
  };
  const MOOD_SPEECH = {
    idle: 'WHAT SHOULD WE DO?',
    happy: 'I SAVED THIS SMILE FOR YOU!',
    hungry: 'MY TUMMY IS BEEPING…',
    tired: 'ONE SOFT SONG?',
    lonely: 'STAY A MINUTE?',
    sick: 'I NEED A GENTLE ROUND.',
    alert: 'LET’S PRACTICE A DODGE!',
    celebrate: 'WE DID IT!',
    dormant: 'I’M TAKING A QUIET BREAK.',
  };
  const RETURN_MOMENTS = [
    { text: 'MOBLING FOUND AN ARCADE TOKEN UNDER THE BED.', tickets: 2 },
    { text: 'MOBLING DREAMED UP A NEW HIGH-SCORE POSE.', tickets: 2 },
    { text: 'A TINY PRIZE CAPSULE ROLLED INTO THE VIVARIUM.', tickets: 3 },
    { text: 'MOBLING SAVED A SHINY STAR JUST FOR YOU.', tickets: 2 },
    { text: 'THE ARCADE LEFT A WELCOME-BACK BONUS.', tickets: 3 },
  ];

  const SOUND_FILES = {
    fanfare1: 'snoob/FANFARE.WAV',
    fanfare2: 'snoob/FANFARE2.WAV',
    please: 'snoob/PLEASE.WAV',
    lockin: 'snoob/LOCKIN.WAV',
    whoosh: 'snoob/WHOOSH.WAV',
    miss: 'snoob/MISS.WAV',
  };

  // Adult forms — how each is reached is surfaced in the DEX screen.
  const FORMS = {
    solara: { name: 'SOLARA', how: 'RAISED ON HIGH HAPPINESS' },
    volt:   { name: 'VOLT',   how: 'RAISED ON HIGH ENERGY' },
    harmon: { name: 'HARMON', how: 'RAISED ON BALANCED CARE' },
    ember:  { name: 'EMBER',  how: 'RAISED THROUGH BRAVE COMEBACKS' },
  };
  const FORM_ORDER = ['solara', 'volt', 'harmon', 'ember'];

  const PRIZES = {
    lamp:   { name: 'STAR LAMP',    cost: 4,  how: 'MORE TWINKLE IN THE VIVARIUM' },
    bed:    { name: 'MOON BED',     cost: 6,  how: 'A COZY SLEEP CORNER' },
    ball:   { name: 'ARCADE BALL',  cost: 8,  how: 'A BOUNCY IDLE TOY' },
    drone:  { name: 'SHIELD DRONE', cost: 10, how: 'A TINY FLOATING GUARD' },
    crown:  { name: 'NEON CROWN',   cost: 12, how: 'ROYAL ARCADE GLOW' },
    comet:  { name: 'COMET TRAIL',  cost: 15, how: 'SPARKS FOLLOW EVERY BOUNCE' },
  };

  // Cosmetic hatch customization — tints the egg/baby/juvenile only. Adult
  // forms take over with their own signature palette (that's the collectible
  // hook), so this shapes the journey, not the destination.
  const COLOR_PALETTE = {
    coral:  { main: '#ff6ec7', deep: '#c8438f', glow: '#ffb3e4', label: 'CORAL' },
    aqua:   { main: '#4fd8ff', deep: '#1f7fa8', glow: '#b8f3ff', label: 'AQUA' },
    lime:   { main: '#8aff4f', deep: '#4a9a20', glow: '#d4ffb3', label: 'LIME' },
    violet: { main: '#b48cff', deep: '#6a3fd0', glow: '#e4d4ff', label: 'VIOLET' },
    amber:  { main: '#ffb347', deep: '#c9781a', glow: '#ffe0a8', label: 'AMBER' },
  };
  const SHAPE_CHOICES = [
    { key: 'round',  label: 'ROUND' },
    { key: 'tall',   label: 'TALL' },
    { key: 'chunky', label: 'CHUNKY' },
  ];
  // Body silhouette + anchor geometry per shape choice. Kept separate from
  // color so any palette can pair with any shape.
  const SHAPE_GEOM = {
    round: {
      body: 'M60 34 C88 34 100 56 100 78 C100 104 82 116 60 116 C38 116 20 104 20 78 C20 56 32 34 60 34 Z',
      footL: 44, footR: 76, footY: 112, shadowRx: 28, shadowCy: 118,
      antL: 46, antR: 74, antTopY: 34,
      belly: { cx: 60, cy: 88, rx: 24, ry: 20 },
    },
    tall: {
      body: 'M60 26 C82 26 92 50 92 80 C92 110 78 124 60 124 C42 124 28 110 28 80 C28 50 38 26 60 26 Z',
      footL: 48, footR: 72, footY: 120, shadowRx: 22, shadowCy: 126,
      antL: 50, antR: 70, antTopY: 26,
      belly: { cx: 60, cy: 92, rx: 20, ry: 26 },
    },
    chunky: {
      body: 'M60 42 C94 42 106 60 106 76 C106 98 86 108 60 108 C34 108 14 98 14 76 C14 60 26 42 60 42 Z',
      footL: 36, footR: 84, footY: 104, shadowRx: 34, shadowCy: 110,
      antL: 40, antR: 80, antTopY: 42,
      belly: { cx: 60, cy: 78, rx: 30, ry: 16 },
    },
  };

  // Icon asset bank — reuses the arcade's existing projectile art instead of
  // emoji. Each stat's action button doubles as that stat's icon.
  const ICON = {
    hunger: 'projectiles/pizza.png',
    energy: 'projectiles/lightning.png',
    health: 'projectiles/hp_icon.png',
    safety: 'projectiles/shield.png',
    play: 'projectiles/tennisball.png',
  };
  const REST_ICONS = ['projectiles/piano.png', 'projectiles/guitar.png', 'projectiles/saxophone.png'];
  const FEED_SNACKS = [
    { key: 'slice', label: 'SLICE', src: 'projectiles/pizza.png', color: '#ff9933' },
    { key: 'berry', label: 'BERRY', src: 'projectiles/green_orb.png', color: '#8aff4f' },
    { key: 'frost', label: 'FROST', src: 'projectiles/snowflake.png', color: '#4fd8ff' },
    { key: 'heart', label: 'HEART', src: 'projectiles/hp_icon.png', color: '#ff6ec7' },
  ];

  // Per-stage mini-game objectives — accomplished, not timed. Ramp up as the
  // pet grows; baby is doable, not trivial.
  const GOALS = {
    feed:  { 1: 3, 2: 3, 3: 3 },
    play:  { 1: 8, 2: 12, 3: 16 },
    rest:  { 1: 6, 2: 9, 3: 12 },
    pet:   { 1: 1, 2: 1, 3: 1 },      // always a full clear
    guard: { 1: 4, 2: 6, 3: 8 },
  };
  // Foil grid size scales with stage too, so a full (100%) clear stays a real
  // objective rather than a shrinking target.
  const FOIL_GRID = { 1: { cols: 8, rows: 9 }, 2: { cols: 9, rows: 10 }, 3: { cols: 10, rows: 10 } };
  const KITCHEN_TUNE = {
    1: { rushMs: 30000, graceMs: 12000 },
    2: { rushMs: 34000, graceMs: 10000 },
    3: { rushMs: 38000, graceMs: 9000 },
  };
  const KITCHEN_STATIONS = {
    prep:  { label: 'PREP',  action: 'CHOP + MIX', duration: 1800, color: '#8aff4f' },
    heat:  { label: 'HEAT',  action: 'TOAST',      duration: 3200, color: '#ff9933' },
    chill: { label: 'CHILL', action: 'FLASH-FROST', duration: 2500, color: '#4fd8ff' },
  };
  const KITCHEN_ROUTE = {
    slice: 'heat',
    berry: 'prep',
    frost: 'chill',
    heart: 'prep',
  };
  const KITCHEN_RECIPES = [
    { name: 'COMET SLICE', components: ['slice', 'berry'], minStage: 1 },
    { name: 'HEARTY SLICE', components: ['slice', 'heart'], minStage: 1 },
    { name: 'POLAR POP', components: ['frost', 'berry'], minStage: 1 },
    { name: 'NEON PARFAIT', components: ['berry', 'frost', 'heart'], minStage: 2 },
    { name: 'STAR SUPPER', components: ['slice', 'berry', 'frost'], minStage: 2 },
    { name: 'MOBLING SPECIAL', components: ['slice', 'berry', 'frost', 'heart'], minStage: 3 },
  ];
  const PLAY_TUNE  = { 1: { popGap: 680 }, 2: { popGap: 560 }, 3: { popGap: 460 } };
  // GUARD mirrors Space Red: aim tracks the player, locks late in the charge,
  // then fires an aimed projectile. Older stages add short attack bursts.
  const GUARD_TUNE = {
    1: { driftSpeed: 28, charge: 920, aimLock: 700, strike: 330, gap: 520, tol: 12, burst: 1 },
    2: { driftSpeed: 38, charge: 780, aimLock: 560, strike: 280, gap: 360, tol: 11, burst: 2 },
    3: { driftSpeed: 48, charge: 650, aimLock: 450, strike: 230, gap: 260, tol: 10, burst: 3 },
  };
  // REST: Signal's note-constellation — three bands (LOW/MID/HIGH), each a
  // row of connected hex nodes carrying its own note; tap a node to play it.
  const NOTE_LETTERS = ['C', 'D', 'E', 'G', 'A', 'C', 'D', 'E', 'G', 'A'];
  const REST_BANDS = [
    { label: 'LOW', color: '#00e5ff', degs: [0, 1, 2] },
    { label: 'MID', color: '#ff6ec7', degs: [2, 3, 4] },
    { label: 'HIGH', color: '#33ff99', degs: [5, 6, 7, 8] },
  ];

  let pet = null;          // active pet state object
  let tickTimer = null;
  let cdTimer = null;
  let saveTimer = null;
  let mini = null;         // active mini-interaction descriptor
  let openPanel = null;    // prize shelf / dex / generation confirmation
  let soundCache = new Map();
  let lastMood = '';
  let pickerState = { color: 'coral', shape: 'round' };

  function stageIdx() { return Math.min(3, Math.max(1, pet.stage)); }

  // ── Persistence (shared player-tag profile store, same shape as others) ──
  function activeTag() {
    const t = (window.PlayerID && PlayerID.get && PlayerID.get()) || 'GUEST';
    return t;
  }
  function loadStore() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function saveStore(store) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(store)); } catch (e) {}
  }
  function persist() {
    if (!pet) return;
    const store = loadStore();
    store.profiles ||= {};
    store.profiles[pet.tag] = pet;
    store.active = pet.tag;
    saveStore(store);
  }
  function schedulePersist() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(persist, 400);
  }

  function newPet(tag) {
    const now = Date.now();
    return {
      tag,
      name: 'MOBLING',
      createdAt: now,
      familyStartedAt: now,
      lastTick: now,
      stage: 0,                 // 0 egg, 1 baby, 2 juvenile, 3 adult
      form: null,
      colorChoice: 'coral',     // defaults render the egg before hatch customization
      shape: 'round',
      sawIntro: true,           // retired; retained only for save compatibility
      tipsSeen: [],
      lowHintDismissed: false,
      hunger: 100, happiness: 100, energy: 100, safety: 100, health: 100,
      stageProgress: 0,         // care-quality accumulated toward next stage
      stageActions: 0,          // beneficial actions this stage
      care: { happy: 0, energy: 0, balance: 0, comeback: 0 },
      activityCounts: { feed: 0, play: 0, rest: 0, guard: 0 },
      happinessSum: 0, happinessCount: 0,          // lifetime averages
      safetySum: 0, safetyCount: 0,
      streak: { days: 1, lastDay: dayIndex(now) },
      collected: [],            // forms reached (dex)
      tickets: 0,
      moments: [],
      unlocks: [],
      equipped: null,
      generations: 0,
      memories: 0,
      dormant: false,
      wasDormant: false,        // ever recovered from neglect -> EMBER eligible
      recovery: 0,
      cd: { feed: 0, play: 0, rest: 0, pet: 0, guard: 0 },
    };
  }

  function dayIndex(ms) {
    // local calendar day
    const d = new Date(ms);
    return Math.floor((ms - d.getTimezoneOffset() * 60000) / 86400000);
  }

  function ensurePet() {
    const tag = activeTag();
    const store = loadStore();
    const saved = store.profiles && store.profiles[tag];
    if (saved) {
      pet = saved;
      // backfill any fields added after a save was written
      pet.tag = tag;
      pet.care ||= { happy: 0, energy: 0, balance: 0 };
      if (typeof pet.care.comeback !== 'number') pet.care.comeback = 0;
      pet.activityCounts ||= { feed: 0, play: 0, rest: 0, guard: 0 };
      pet.streak ||= { days: 1, lastDay: dayIndex(Date.now()) };
      pet.cd ||= { feed: 0, play: 0, rest: 0, pet: 0, guard: 0 };
      if (pet.cd.guard == null) pet.cd.guard = 0;
      pet.collected ||= [];
      if (typeof pet.tickets !== 'number') pet.tickets = 0;
      pet.moments ||= [];
      pet.unlocks ||= [];
      if (typeof pet.equipped === 'undefined') pet.equipped = null;
      if (typeof pet.generations !== 'number') pet.generations = 0;
      if (typeof pet.memories !== 'number') pet.memories = 0;
      pet.familyStartedAt ||= pet.createdAt || Date.now();
      if (typeof pet.health !== 'number') pet.health = 100;
      if (typeof pet.safety !== 'number') pet.safety = 100;
      if (typeof pet.safetySum !== 'number') { pet.safetySum = 0; pet.safetyCount = 0; }
      // Pets that already progressed past the egg before this feature existed
      // never got a chance to choose — default them silently instead of
      // retroactively prompting an already-hatched pet.
      if (!pet.colorChoice) pet.colorChoice = 'coral';
      if (!pet.shape) pet.shape = 'round';
      pet.sawIntro = true;
      pet.tipsSeen ||= [];
      if (typeof pet.lowHintDismissed !== 'boolean') pet.lowHintDismissed = false;
      // Migrate the old punitive "wandered off" state into a safe resting state.
      if (pet.dormant) {
        pet.dormant = false;
        pet.recovery = 0;
        pet.hunger = Math.max(NEED_FLOOR, pet.hunger || 0);
        pet.happiness = Math.max(NEED_FLOOR, pet.happiness || 0);
        pet.energy = Math.max(NEED_FLOOR, pet.energy || 0);
        pet.safety = Math.max(NEED_FLOOR, pet.safety || 0);
      }
    } else {
      pet = newPet(tag);
      persist();
    }
  }

  // ── Time-based catch-up: apply decay for the whole elapsed gap ──
  function catchUp() {
    const now = Date.now();
    let gap = (now - (pet.lastTick || now)) / 60000; // minutes
    pet.lastTick = now;
    if (gap <= 0) return;
    gap = Math.min(gap, MAX_GAP_MIN);
    if (pet.stage === 0) return; // eggs don't need care while you're away
    applyDecay(gap, true);
    addReturnMoments(gap);
  }

  function applyDecay(minutes, isGap) {
    pet.hunger = clamp(pet.hunger - DECAY.hunger * minutes, NEED_FLOOR, 100);
    pet.happiness = clamp(pet.happiness - DECAY.happiness * minutes, NEED_FLOOR, 100);
    pet.energy = clamp(pet.energy - DECAY.energy * minutes, NEED_FLOOR, 100);
    pet.safety = clamp(pet.safety - DECAY.safety * minutes, NEED_FLOOR, 100);
    pet.health = (pet.hunger + pet.happiness + pet.energy + pet.safety) / 4;
    // Lifetime averages sampled on the gap too (weighted lightly).
    if (isGap) {
      const samples = Math.min(minutes / 5, 6);
      pet.happinessSum += pet.happiness * samples; pet.happinessCount += samples;
      pet.safetySum += pet.safety * samples; pet.safetyCount += samples;
    }
  }

  function addReturnMoments(gapMinutes) {
    if (gapMinutes < MOMENT_EVERY_MIN || pet.moments.length >= MAX_MOMENTS) return;
    const count = Math.min(MAX_MOMENTS - pet.moments.length, Math.floor(gapMinutes / MOMENT_EVERY_MIN));
    for (let i = 0; i < count; i++) {
      const moment = RETURN_MOMENTS[(pet.memories + i) % RETURN_MOMENTS.length];
      pet.moments.push({ ...moment, id: `${Date.now()}-${i}` });
    }
  }

  function daysTogether() {
    return Math.max(1, Math.floor((Date.now() - (pet.familyStartedAt || pet.createdAt || Date.now())) / 86400000) + 1);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ── Mood derivation ──
  function currentMood() {
    if (pet.dormant) return 'dormant';
    if (pet.stage === 0) return 'idle';
    if (pet._celebrateUntil && Date.now() < pet._celebrateUntil) return 'celebrate';
    if (pet.health < 30) return 'sick';
    const lowest = [
      ['hungry', pet.hunger],
      ['lonely', pet.happiness],
      ['tired', pet.energy],
      ['alert', pet.safety],
    ].sort((a, b) => a[1] - b[1])[0];
    if (lowest[1] < 42) return lowest[0];
    if (pet.hunger > 70 && pet.happiness > 70 && pet.energy > 55) return 'happy';
    return 'idle';
  }

  // ══════════════════════════════════════
  //  ICONS — projectile asset bank + drawn shapes (no emoji anywhere)
  // ══════════════════════════════════════
  function iconImg(src, size, cls) {
    return `<img src="${src}" class="pet-icon ${cls || ''}" style="width:${size}px;height:${size}px" alt="" draggable="false">`;
  }
  function heartSVG(size, color) {
    color = color || COLOR;
    return `<svg class="pet-icon" width="${size}" height="${size * 0.86}" viewBox="0 0 32 28" style="overflow:visible;filter:drop-shadow(0 0 6px ${color}aa)">
      <path d="M16 26 C4 18 0 11 0 6.5 C0 2 3.5 0 7 0 C10 0 13 2 16 6 C19 2 22 0 25 0 C28.5 0 32 2 32 6.5 C32 11 28 18 16 26 Z" fill="${color}"/>
    </svg>`;
  }
  function starSVG(size, color, opacity) {
    color = color || '#ffe61a';
    return `<svg width="${size}" height="${size}" viewBox="0 0 20 20" style="overflow:visible;opacity:${opacity == null ? 1 : opacity}">
      <path d="M10 0 L12.2 7.2 L20 8 L13.6 12.6 L15.8 20 L10 15.6 L4.2 20 L6.4 12.6 L0 8 L7.8 7.2 Z" fill="${color}"/>
    </svg>`;
  }
  function lockSVG(size) {
    return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" style="overflow:visible;opacity:0.55">
      <rect x="9" y="18" width="22" height="17" rx="3" fill="none" stroke="#f2efe8" stroke-width="2.5"/>
      <path d="M14 18 v-5 a6 6 0 0 1 12 0 v5" fill="none" stroke="#f2efe8" stroke-width="2.5"/>
      <circle cx="20" cy="26" r="2.6" fill="#f2efe8"/>
    </svg>`;
  }
  function shardSVG(size, color, opacity) {
    color = color || '#ff3344';
    return `<svg width="${size}" height="${size}" viewBox="0 0 40 40" style="overflow:visible;opacity:${opacity == null ? 1 : opacity};filter:drop-shadow(0 0 8px ${color})">
      <path d="M20 2 L34 20 L20 38 L6 20 Z" fill="${color}"/>
      <path d="M20 11 L27 20 L20 29 L13 20 Z" fill="#fff" opacity="0.55"/>
    </svg>`;
  }
  // Signal-style band: a row of connected hex nodes, one per note.
  function bandSVG(nodes, color) {
    const n = nodes.length;
    const W = 300, H = 90, r = 26;
    const xs = nodes.map((_, i) => (i + 0.5) / n * W);
    const y = H / 2;
    const lines = xs.slice(0, -1).map((x, i) =>
      `<line x1="${x}" y1="${y}" x2="${xs[i + 1]}" y2="${y}" stroke="${color}" stroke-width="1.5" opacity="0.35"/>`).join('');
    const hexPoints = (cx, cy, rr) => {
      const pts = [];
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; pts.push(`${cx + rr * Math.cos(a)},${cy + rr * Math.sin(a)}`); }
      return pts.join(' ');
    };
    const polys = nodes.map((note, i) => `
      <g class="pet-rest-node" data-note="${note.deg}" tabindex="0" focusable="true" role="button" aria-label="Play note ${note.letter}">
        <polygon points="${hexPoints(xs[i], y, r)}" fill="rgba(5,2,16,0.65)" stroke="${color}" stroke-width="2.5" style="filter:drop-shadow(0 0 6px ${color}aa)"/>
        <text x="${xs[i]}" y="${y + 6}" text-anchor="middle" font-family="'VCR',monospace" font-size="16" fill="${color}">${note.letter}</text>
      </g>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">${lines}${polys}</svg>`;
  }

  // ══════════════════════════════════════
  //  PET SVG — one base creature, parameterised by stage / form / shape / mood
  // ══════════════════════════════════════
  function petSVG(stage, form, mood, shapeKey, colorKey) {
    if (stage === 0) return eggSVG(colorKey || (pet && pet.colorChoice) || 'coral');
    shapeKey = shapeKey || (pet && pet.shape) || 'round';
    colorKey = colorKey || (pet && pet.colorChoice) || 'coral';
    const geom = SHAPE_GEOM[shapeKey] || SHAPE_GEOM.round;
    const body = form ? FORM_TINT[form] : (COLOR_PALETTE[colorKey] || COLOR_PALETTE.coral);
    const scale = [0, 0.72, 0.86, 1][stage];
    const detail = stage >= 2;      // juvenile+ get antennae orbs
    const adult = stage === 3;

    const eyes = eyeMarkup(mood);
    const mouth = mouthMarkup(mood);
    const crown = adult ? crownMarkup(form, body) : '';
    const aura = adult ? `<circle cx="60" cy="66" r="46" fill="${body.glow}" opacity="0.10"/>` : '';
    const gradId = `pet-body-${stage}-${shapeKey}-${form || colorKey}`;

    return `
    <svg class="pet-stage-svg mood-${mood}" viewBox="0 0 120 140" width="100%">
      <defs>
        <radialGradient id="${gradId}" cx="42%" cy="34%" r="72%">
          <stop offset="0%" stop-color="${body.glow}"/>
          <stop offset="58%" stop-color="${body.main}"/>
          <stop offset="100%" stop-color="${body.deep}"/>
        </radialGradient>
      </defs>
      <g transform="translate(60 72) scale(${scale}) translate(-60 -72)">
        ${aura}
        <!-- shadow -->
        <ellipse cx="60" cy="${geom.shadowCy}" rx="${geom.shadowRx}" ry="6" fill="#000" opacity="0.3"/>
        <!-- antenna stalks -->
        <path d="M${geom.antL} ${geom.antTopY} Q${geom.antL - 6} ${geom.antTopY - 22} ${geom.antL - 14} ${geom.antTopY - 28}" stroke="${body.deep}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M${geom.antR} ${geom.antTopY} Q${geom.antR + 6} ${geom.antTopY - 22} ${geom.antR + 14} ${geom.antTopY - 28}" stroke="${body.deep}" stroke-width="4" fill="none" stroke-linecap="round"/>
        <circle cx="${geom.antL - 14}" cy="${geom.antTopY - 28}" r="${detail ? 7 : 5}" fill="${body.glow}">
          ${detail ? `<animate attributeName="opacity" values="0.7;1;0.7" dur="2.4s" repeatCount="indefinite"/>` : ''}
        </circle>
        <circle cx="${geom.antR + 14}" cy="${geom.antTopY - 28}" r="${detail ? 7 : 5}" fill="${body.glow}">
          ${detail ? `<animate attributeName="opacity" values="1;0.7;1" dur="2.4s" repeatCount="indefinite"/>` : ''}
        </circle>
        <!-- feet -->
        <ellipse cx="${geom.footL}" cy="${geom.footY}" rx="11" ry="7" fill="${body.deep}"/>
        <ellipse cx="${geom.footR}" cy="${geom.footY}" rx="11" ry="7" fill="${body.deep}"/>
        <!-- body -->
        <path d="${geom.body}" fill="url(#${gradId})" stroke="${body.deep}" stroke-width="3"/>
        <!-- belly highlight -->
        <ellipse cx="${geom.belly.cx}" cy="${geom.belly.cy}" rx="${geom.belly.rx}" ry="${geom.belly.ry}" fill="#fff" opacity="0.16"/>
        ${crown}
        ${eyes}
        ${mouth}
      </g>
    </svg>`;
  }

  const FORM_TINT = {
    solara: { main: '#ffb347', deep: '#e07a1a', glow: '#ffe08a' },
    volt:   { main: '#7ce7ff', deep: '#1f8fc0', glow: '#d6faff' },
    harmon: { main: '#b48cff', deep: '#6a3fd0', glow: '#e4d4ff' },
    ember:  { main: '#ff5a5a', deep: '#a01f2f', glow: '#ffb3a3' },
  };

  function eggSVG(colorKey) {
    const c = COLOR_PALETTE[colorKey] || COLOR_PALETTE.coral;
    return `
    <div class="pet-egg-crack" id="pet-egg">
      <svg viewBox="0 0 120 140" width="120" height="140" style="overflow:visible">
        <defs>
          <radialGradient id="pet-egg-g" cx="40%" cy="30%" r="75%">
            <stop offset="0%" stop-color="${c.glow}"/>
            <stop offset="60%" stop-color="${c.main}"/>
            <stop offset="100%" stop-color="${c.deep}"/>
          </radialGradient>
        </defs>
        <ellipse cx="60" cy="128" rx="26" ry="6" fill="#000" opacity="0.3"/>
        <path d="M60 14 C92 14 100 66 100 90 C100 118 82 130 60 130 C38 130 20 118 20 90 C20 66 28 14 60 14 Z"
              fill="url(#pet-egg-g)" stroke="${c.deep}" stroke-width="3"/>
        <g opacity="0.85" stroke="#fff" stroke-width="2" fill="none">
          <path d="M34 62 l10 6 l-8 8 l12 6"/>
          <path d="M84 54 l-8 8 l8 6 l-10 8"/>
        </g>
        <path d="M42 96 l8 -8 l8 8 l8 -8 l8 8 l6 -6" stroke="#fff" stroke-width="2.5" fill="none" opacity="0.5"/>
        <circle cx="46" cy="40" r="4" fill="#fff" opacity="0.55"/>
      </svg>
    </div>`;
  }

  function eyeMarkup(mood) {
    if (mood === 'sick') return `
      <path d="M40 66 l10 8 M50 66 l-10 8" stroke="#3a2030" stroke-width="3" stroke-linecap="round"/>
      <path d="M70 66 l10 8 M80 66 l-10 8" stroke="#3a2030" stroke-width="3" stroke-linecap="round"/>`;
    if (mood === 'tired') return `
      <path d="M38 70 q7 5 14 0" stroke="#3a2030" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M68 70 q7 5 14 0" stroke="#3a2030" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (mood === 'lonely') return `
      <path d="M38 71 q7 -4 14 1" stroke="#3a2030" stroke-width="3" fill="none" stroke-linecap="round"/>
      <path d="M68 72 q7 -5 14 -1" stroke="#3a2030" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="79" cy="80" r="2.4" fill="#9de9ff" opacity="0.9"/>`;
    if (mood === 'happy' || mood === 'celebrate') return `
      <path d="M38 72 q7 -9 14 0" stroke="#2a1420" stroke-width="3.4" fill="none" stroke-linecap="round"/>
      <path d="M68 72 q7 -9 14 0" stroke="#2a1420" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
    if (mood === 'alert') return `
      <circle cx="45" cy="70" r="8.5" fill="#2a1420" stroke="#fff" stroke-width="1"/>
      <circle cx="75" cy="70" r="8.5" fill="#2a1420" stroke="#fff" stroke-width="1"/>
      <circle cx="45" cy="67.5" r="2.8" fill="#fff"/>
      <circle cx="75" cy="67.5" r="2.8" fill="#fff"/>`;
    // default open eyes (idle/hungry) — thin outline ring for a slightly more toy/vinyl look
    return `
      <circle cx="45" cy="70" r="7" fill="#2a1420" stroke="#00000055" stroke-width="0.6"/>
      <circle cx="75" cy="70" r="7" fill="#2a1420" stroke="#00000055" stroke-width="0.6"/>
      <circle cx="42.6" cy="67.6" r="2.2" fill="#fff"/>
      <circle cx="72.6" cy="67.6" r="2.2" fill="#fff"/>`;
  }

  function mouthMarkup(mood) {
    if (mood === 'happy' || mood === 'celebrate') return `<path d="M50 88 q10 12 20 0" stroke="#2a1420" stroke-width="3.2" fill="#7a2647" stroke-linecap="round"/>`;
    if (mood === 'hungry') return `<ellipse cx="60" cy="90" rx="7" ry="8" fill="#7a2647"/>`;
    if (mood === 'sick') return `<path d="M50 92 q10 -6 20 0" stroke="#2a1420" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (mood === 'tired') return `<ellipse cx="60" cy="90" rx="5" ry="6" fill="#7a2647"/>`;
    if (mood === 'lonely') return `<path d="M51 93 q9 -7 18 0" stroke="#2a1420" stroke-width="3" fill="none" stroke-linecap="round"/>`;
    if (mood === 'alert') return `<ellipse cx="60" cy="90" rx="4" ry="5" fill="#7a2647"/>`;
    return `<path d="M52 89 q8 6 16 0" stroke="#2a1420" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  }

  function crownMarkup(form, body) {
    if (form === 'solara') return `
      <g transform="translate(60 30)" fill="${body.glow}" stroke="${body.deep}" stroke-width="1.5">
        <path d="M0 -20 l5 12 l-5 -3 l-5 3 Z"/>
        <path d="M-14 -14 l3 12 l-6 -1 Z" opacity="0.9"/>
        <path d="M14 -14 l-3 12 l6 -1 Z" opacity="0.9"/>
      </g>`;
    if (form === 'volt') return `
      <g transform="translate(60 26)" fill="${body.glow}" stroke="${body.deep}" stroke-width="1.5">
        <path d="M-4 -18 l-6 12 l6 -2 l-4 12 l12 -16 l-7 2 l5 -10 Z"/>
      </g>`;
    if (form === 'harmon') return `
      <g transform="translate(60 28)">
        <path d="M0 -18 l7 7 l-7 7 l-7 -7 Z" fill="${body.glow}" stroke="${body.deep}" stroke-width="1.5"/>
      </g>`;
    if (form === 'ember') return `
      <g transform="translate(60 28)" fill="${body.glow}" stroke="${body.deep}" stroke-width="1.5">
        <path d="M0 -20 q6 8 0 16 q-6 -8 0 -16 Z"/>
        <path d="M-9 -12 q4 6 0 12 q-4 -6 0 -12 Z" opacity="0.8"/>
        <path d="M9 -12 q-4 6 0 12 q4 -6 0 -12 Z" opacity="0.8"/>
      </g>`;
    return '';
  }

  // ── Environment decor: textured floor + twinkling stars up top ──
  function starsSVG() {
    const pts = [[10, 14, 0.0], [24, 8, 0.6], [40, 20, 1.1], [55, 10, 0.3], [70, 16, 0.9], [85, 7, 1.4], [92, 24, 0.5], [16, 28, 1.7]];
    return pts.map(([x, y, delay], i) =>
      `<span class="pet-star" style="left:${x}%;top:${y}%;animation-delay:${delay}s">${starSVG(i % 3 === 0 ? 8 : 5, '#fff', 0.8)}</span>`
    ).join('');
  }

  function statusFx(mood) {
    if (mood === 'hungry') return `<div class="pet-status-fx pet-status-fx-hungry">${iconImg(ICON.hunger, 24)}</div>`;
    if (mood === 'tired') return `<div class="pet-status-fx pet-status-fx-tired"><i>Z</i><i>Z</i><i>Z</i></div>`;
    if (mood === 'lonely') return `<div class="pet-status-fx pet-status-fx-lonely">${heartSVG(23, '#8b6a86')}</div>`;
    if (mood === 'alert') return `<div class="pet-status-fx pet-status-fx-alert">${iconImg(ICON.safety, 25)}</div>`;
    if (mood === 'sick') return `<div class="pet-status-fx pet-status-fx-sick">+ + +</div>`;
    return '';
  }

  function needChips() {
    const needs = [
      ['hunger', pet.hunger, iconImg(ICON.hunger, 13), 'HUNGRY'],
      ['happiness', pet.happiness, heartSVG(12), 'LONELY'],
      ['energy', pet.energy, iconImg(ICON.energy, 13), 'SLEEPY'],
      ['safety', pet.safety, iconImg(ICON.safety, 13), 'NERVOUS'],
    ].filter(([, value]) => value < 55).sort((a, b) => a[1] - b[1]);
    if (!needs.length) return '';
    return `<div class="pet-need-chips">${needs.map(([key, value, icon, label]) =>
      `<span class="${value < 38 ? 'urgent' : ''}" data-need="${key}">${icon}<b>${label}</b></span>`).join('')}</div>`;
  }

  function roomDecor() {
    if (!pet.equipped) return '';
    const decor = {
      lamp: `<span class="pet-room-item pet-room-lamp">✦</span>`,
      bed: `<span class="pet-room-item pet-room-bed">☾</span>`,
      ball: `<span class="pet-room-item pet-room-ball">${iconImg(ICON.play, 26)}</span>`,
      drone: `<span class="pet-room-item pet-room-drone">${iconImg(ICON.safety, 24)}</span>`,
      crown: `<span class="pet-room-item pet-room-crown">♛</span>`,
      comet: `<span class="pet-room-item pet-room-comet">✦</span>`,
    };
    return decor[pet.equipped] || '';
  }

  // ══════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════
  function render() {
    const host = document.getElementById('pet-wrap');
    if (!host) return;
    openPanel = null;
    const mood = currentMood();
    const stageLabel = pet.stage === 3 && pet.form ? FORMS[pet.form].name : STAGE_NAMES[pet.stage];
    host.innerHTML = `
      <div class="pet-shell">
        <div class="pet-topbar">
          <div class="pet-name-block">
            <div class="pet-name" id="pet-name">${escapeHtml(pet.name)}</div>
            <div class="pet-stage-label">${stageLabel} · MOBLING</div>
          </div>
          <div class="pet-life-meta">
            <span>TOGETHER <b id="pet-days">${daysTogether()}D</b></span>
            <span class="pet-ticket-count">TICKETS <b id="pet-tickets">${pet.tickets}</b></span>
          </div>
        </div>

        <div class="pet-tank mood-${mood}" id="pet-tank" data-decor="${pet.equipped || ''}">
          <div class="pet-tank-rail"></div>
          <div class="pet-tank-stars" id="pet-tank-stars">${starsSVG()}</div>
          <div class="pet-tank-floor"></div>
          <div class="pet-tank-mood-tag" id="pet-mood-tag">${MOOD_TAGS[mood]}</div>
          ${growthProgress()}
          ${pet.stage === 1 && pet.stageActions < 3 ? '<div class="pet-goal-copy">EVERY GAME BUILDS A TRAIT — PLAY YOUR WAY</div>' : ''}
          <div class="pet-speech" id="pet-speech" aria-live="polite">${MOOD_SPEECH[mood]}</div>
          <div id="pet-need-cues" aria-live="polite">${needChips()}</div>
          ${roomDecor()}
          <div id="pet-status-cues" aria-hidden="true">${statusFx(mood)}</div>
          <div id="pet-avatar" role="button" tabindex="0" aria-label="Pet your Mobling">${petSVG(pet.stage, pet.form, mood)}</div>
          <div class="pet-mini" id="pet-mini"></div>
          <div class="pet-dex" id="pet-dex"></div>
          <div class="pet-prizes" id="pet-prizes"></div>
          <div class="pet-generation" id="pet-generation"></div>
        </div>

        ${returnMoment()}
        <div class="pet-tip-slot" id="pet-tip-slot"></div>
        <div class="pet-stats">
          ${statRow('hunger', iconImg(ICON.hunger, 17), 'f-hunger')}
          ${statRow('happiness', heartSVG(16), 'f-happy')}
          ${statRow('energy', iconImg(ICON.energy, 17), 'f-energy')}
          ${statRow('safety', iconImg(ICON.safety, 17), 'f-safety')}
        </div>

        <div class="pet-actions">
          ${actBtn('feed', iconImg(ICON.hunger, 22), 'FEED', 'MOBE KITCHEN')}
          ${actBtn('play', iconImg(ICON.play, 22), 'PLAY', 'BOP RUN')}
          ${actBtn('rest', iconImg(ICON.energy, 22), 'REST', 'LULLABY')}
          ${actBtn('pet', heartSVG(20), 'CUDDLE', 'ANYTIME')}
          ${actBtn('guard', iconImg(ICON.safety, 22), 'GUARD', 'DODGE TRAINING')}
        </div>

        <div class="pet-footer">
          <button class="pet-foot-btn prize" onclick="petOpenPrizes()">PRIZES <b>${pet.tickets}</b></button>
          <button class="pet-foot-btn" onclick="petOpenDex()">FORM DEX</button>
          <button class="pet-foot-btn alt" onclick="petStatus()">STATUS</button>
          ${pet.stage === 3 ? '<button class="pet-foot-btn generation" onclick="petOpenGeneration()">NEXT EGG</button>' : ''}
        </div>
      </div>`;
    lastMood = mood;
    bindActions();
    // In the egg stage, tapping the egg itself hatches it (the action buttons
    // funnel to the same hatchTap, but tapping the egg reads more naturally).
    if (pet.stage === 0) {
      const av = document.getElementById('pet-avatar');
      if (av) av.style.cursor = 'pointer';
      if (av) av.onclick = () => { if (pet.stage === 0 && !mini) hatchTap(); };
    } else {
      const av = document.getElementById('pet-avatar');
      if (av) {
        av.onclick = () => { if (!mini) directAffection(); };
        av.onkeydown = e => {
          if ((e.key === 'Enter' || e.key === ' ') && !mini) {
            e.preventDefault();
            directAffection();
          }
        };
      }
    }
    updateStats();
    updateCooldowns();
  }

  function growthProgress() {
    if (pet.stage >= 3) return '';
    const pct = clamp((pet.stageProgress / STAGE_THRESHOLD[pet.stage]) * 100, 0, 100);
    const next = STAGE_NAMES[pet.stage + 1];
    return `<div class="pet-growth" id="pet-growth">
      <div class="pet-growth-label">→ ${next}</div>
      <div class="pet-growth-track"><div class="pet-growth-fill" id="pet-growth-fill" style="width:${pct}%"></div></div>
    </div>`;
  }

  function hasSeenTip(id) { return pet.tipsSeen && pet.tipsSeen.includes(id); }
  function showTip(id, text) {
    if (hasSeenTip(id)) return;
    const slot = document.getElementById('pet-tip-slot');
    if (!slot || slot.firstChild) return;
    const tip = document.createElement('button');
    tip.type = 'button';
    tip.className = 'pet-context-tip';
    tip.textContent = text;
    slot.appendChild(tip);
    let timer = 0;
    const dismiss = () => {
      clearTimeout(timer);
      if (!hasSeenTip(id)) pet.tipsSeen.push(id);
      tip.classList.add('leaving');
      setTimeout(() => tip.remove(), 180);
      persist();
    };
    tip.onclick = dismiss;
    timer = setTimeout(dismiss, 8000);
  }

  // ── Hatch-time customize screen (color + shape) ──
  function renderPicker() {
    const host = document.getElementById('pet-wrap');
    if (!host) return;
    host.innerHTML = `
      <div class="pet-picker">
        <div class="pet-picker-kicker">IT HATCHED!</div>
        <div class="pet-picker-title">MAKE YOUR MOBLING YOURS</div>
        <div class="pet-picker-preview" id="pet-picker-preview">${petSVG(1, null, 'happy', pickerState.shape, pickerState.color).replace('class="pet-stage-svg mood-happy"', 'class="pet-picker-svg"')}</div>
        <div class="pet-picker-label">COLOR</div>
        <div class="pet-picker-swatches" id="pet-picker-swatches">
          ${Object.entries(COLOR_PALETTE).map(([k, c]) => `<button class="pet-swatch ${k === pickerState.color ? 'sel' : ''}" data-c="${k}" style="--sc:${c.main}" aria-label="${c.label}"></button>`).join('')}
        </div>
        <div class="pet-picker-label">SHAPE</div>
        <div class="pet-picker-shapes" id="pet-picker-shapes">
          ${SHAPE_CHOICES.map(s => `<button class="pet-shape-btn ${s.key === pickerState.shape ? 'sel' : ''}" data-s="${s.key}">${s.label}</button>`).join('')}
        </div>
        <button class="pet-foot-btn" id="pet-picker-confirm">MEET MY MOBLING ▶</button>
      </div>`;
    function refreshPreview() {
      const pv = document.getElementById('pet-picker-preview');
      if (pv) pv.innerHTML = petSVG(1, null, 'happy', pickerState.shape, pickerState.color).replace('class="pet-stage-svg mood-happy"', 'class="pet-picker-svg"');
    }
    host.querySelectorAll('.pet-swatch').forEach(b => b.onclick = () => {
      pickerState.color = b.dataset.c;
      host.querySelectorAll('.pet-swatch').forEach(x => x.classList.toggle('sel', x === b));
      SFX && SFX.menuSelect && SFX.menuSelect();
      refreshPreview();
    });
    host.querySelectorAll('.pet-shape-btn').forEach(b => b.onclick = () => {
      pickerState.shape = b.dataset.s;
      host.querySelectorAll('.pet-shape-btn').forEach(x => x.classList.toggle('sel', x === b));
      SFX && SFX.menuSelect && SFX.menuSelect();
      refreshPreview();
    });
    const confirmBtn = document.getElementById('pet-picker-confirm');
    if (confirmBtn) confirmBtn.onclick = () => {
      pet.colorChoice = pickerState.color;
      pet.shape = pickerState.shape;
      persist();
      SFX && SFX.menuSelect && SFX.menuSelect();
      lastMood = '';
      render();
      showTip('care_intro', 'CARE BANKS AS YOU PLAY — KEEP GOING ONLY WHEN YOU WANT THE BIGGER PRIZE.');
    };
  }

  function returnMoment() {
    if (!pet.moments || !pet.moments.length) return '';
    const moment = pet.moments[0];
    return `<button class="pet-return-moment" type="button" onclick="petClaimMoment()">
      <span>WELCOME-BACK SURPRISE</span>
      <b>${escapeHtml(moment.text)}</b>
      <small>TAP TO OPEN · +${moment.tickets} TICKETS</small>
    </button>`;
  }

  function statRow(key, iconHtml, cls) {
    const names = { hunger: 'FULL', happiness: 'JOY', energy: 'ENERGY', safety: 'COURAGE', health: 'OVERALL' };
    return `
      <div class="pet-stat-row ${key === 'health' ? 'pet-stat-health' : ''}" aria-label="${names[key]}">
        <div class="pet-stat-icon">${iconHtml}</div>
        <span class="pet-stat-name">${names[key]}</span>
        <div class="pet-stat-track"><div class="pet-stat-fill ${cls}" id="pet-fill-${key}"></div></div>
        <div class="pet-stat-val" id="pet-val-${key}">0</div>
      </div>`;
  }

  function actBtn(key, iconHtml, label, detail) {
    const [color, tint] = ACTION_COLOR[key];
    return `
      <button class="pet-act-btn" id="pet-act-${key}" data-act="${key}" style="--act-color:${color};--act-tint:${tint}">
        <span class="pet-act-icon">${iconHtml}</span>
        <span class="pet-act-copy">${label}<small>${detail}</small></span>
        <span class="pet-act-cd" id="pet-cd-${key}"></span>
      </button>`;
  }

  function updateStats() {
    [['hunger', pet.hunger], ['happiness', pet.happiness], ['energy', pet.energy], ['safety', pet.safety], ['health', pet.health]]
      .forEach(([key, val]) => {
        const fill = document.getElementById(`pet-fill-${key}`);
        const num = document.getElementById(`pet-val-${key}`);
        const v = Math.round(val);
        if (fill) {
          fill.style.width = clamp(v, 0, 100) + '%';
          fill.classList.toggle('is-low', v < 25);
        }
        if (num) num.textContent = v;
      });
    const tag = document.getElementById('pet-mood-tag');
    if (tag) tag.textContent = MOOD_TAGS[currentMood()];
    const tickets = document.getElementById('pet-tickets');
    if (tickets) tickets.textContent = pet.tickets;
    const tank = document.getElementById('pet-tank');
    if (tank) {
      tank.className = `pet-tank mood-${currentMood()}${currentMood() === 'happy' || currentMood() === 'celebrate' ? ' mood-bright' : ''}`;
    }
    const low = [['hunger', 'feed', 'HUNGRY', 'FEED'], ['happiness', 'pet', 'LONELY', 'PET'], ['energy', 'rest', 'TIRED', 'REST'], ['safety', 'guard', 'UNSAFE', 'GUARD']]
      .find(([stat]) => pet[stat] < 30);
    const guideLow = !!low && pet.stageActions < 5 && !pet.lowHintDismissed;
    document.querySelectorAll('.pet-act-btn').forEach(btn => btn.classList.toggle('needs-care', guideLow && btn.dataset.act === low[1]));
    if (guideLow) showTip('low_stat', `${low[2]} OPPORTUNITY READY — ${low[3]} WILL HELP, AND YOUR REWARD BANKS AS YOU PLAY.`);
  }

  function refreshAvatarIfMoodChanged() {
    const mood = currentMood();
    const needs = document.getElementById('pet-need-cues');
    if (needs) needs.innerHTML = needChips();
    if (mood === lastMood) return;
    lastMood = mood;
    const av = document.getElementById('pet-avatar');
    if (av) av.innerHTML = petSVG(pet.stage, pet.form, mood);
    const speech = document.getElementById('pet-speech');
    if (speech) speech.textContent = MOOD_SPEECH[mood];
    const status = document.getElementById('pet-status-cues');
    if (status) status.innerHTML = statusFx(mood);
  }

  function updateCooldowns() {
    const now = Date.now();
    ['feed', 'play', 'rest', 'pet', 'guard'].forEach(key => {
      const btn = document.getElementById(`pet-act-${key}`);
      const bar = document.getElementById(`pet-cd-${key}`);
      if (!btn || !bar) return;
      if (key === 'pet') {
        btn.disabled = !!mini || !!openPanel;
        bar.style.width = '0%';
        return;
      }
      const until = pet.cd[key] || 0;
      const remain = until - now;
      if (remain > 0) {
        btn.disabled = true;
        bar.style.width = (100 * remain / COOLDOWN[key]) + '%';
      } else {
        btn.disabled = !!mini || !!openPanel;
        bar.style.width = '0%';
      }
    });
    document.querySelectorAll('.pet-footer .pet-foot-btn').forEach(btn => {
      btn.disabled = !!openPanel || !!mini;
    });
  }

  // ══════════════════════════════════════
  //  ACTIONS + mini-interactions (Bitzee-flavored gestures)
  // ══════════════════════════════════════
  function bindActions() {
    document.querySelectorAll('.pet-act-btn').forEach(btn => {
      btn.onclick = () => startAction(btn.dataset.act);
    });
  }

  function onCooldown(key) { return (pet.cd[key] || 0) > Date.now(); }
  function allOnCooldown() {
    const now = Date.now();
    return ['feed', 'play', 'rest', 'pet', 'guard'].every(key => (pet.cd[key] || 0) > now);
  }

  function directAffection() {
    const av = document.getElementById('pet-avatar');
    const tank = document.getElementById('pet-tank');
    if (!av || !tank) return;
    const svg = av.querySelector('.pet-stage-svg');
    if (svg) {
      svg.classList.remove('idle-tapped');
      void svg.getBoundingClientRect();
      svg.classList.add('idle-tapped');
      setTimeout(() => svg.classList.remove('idle-tapped'), 240);
    }
    pentaNote(Math.floor(Math.random() * PENTA.length), 0.045, 0.12);
    pet.happiness = clamp(pet.happiness + 3, 0, 100);
    pet.energy = clamp(pet.energy + 0.5, 0, 100);
    pet.health = (pet.hunger + pet.happiness + pet.energy + pet.safety) / 4;
    const bubble = document.createElement('span');
    bubble.className = 'pet-idle-reaction';
    bubble.textContent = ['♥', 'PURR', '!', '~'][Math.floor(Math.random() * 4)];
    tank.appendChild(bubble);
    setTimeout(() => bubble.remove(), 520);
    const speech = document.getElementById('pet-speech');
    if (speech) speech.textContent = ['AGAIN!', 'I LIKE THAT.', 'YOU FOUND THE SPOT!', 'STAY A LITTLE LONGER.'][Math.floor(Math.random() * 4)];
    fx(heartSVG(17));
    updateStats();
    schedulePersist();
  }

  // Each care action is a compact mini modeled on another arcade game.
  // The objective is aspirational; leaving early keeps whatever care was banked.
  function startAction(key) {
    if (mini || openPanel) return;
    if (pet.stage > 0 && key === 'pet') {
      directAffection();
      return;
    }
    if (onCooldown(key)) return;
    pet.lowHintDismissed = true;
    document.querySelectorAll('.pet-act-btn').forEach(btn => btn.classList.remove('needs-care'));
    if (pet.stage === 0) { hatchTap(); return; }
    if (key === 'feed') miniCatch();        // solo kitchen workflow with parallel stations
    else if (key === 'play') miniWhack();   // WHACK — bop the popping toys
    else if (key === 'rest') miniPads();    // SIGNAL — pentatonic lullaby pads
    else if (key === 'guard') miniGuard();  // SPACE red-enemy — dodge telegraphed threats
  }

  // Egg hatches from repeated taps (its "care" before it has stats).
  function hatchTap() {
    pet.stageActions++;
    pet.stageProgress += 1.4;
    const egg = document.getElementById('pet-egg');
    if (egg) { egg.classList.add('wobbling'); setTimeout(() => egg.classList.remove('wobbling'), 340); }
    pentaNote(pet.stageActions + 2, 0.09);
    fx(starSVG(20, '#ffe61a'));
    const progress = document.getElementById('pet-growth-fill');
    if (progress) progress.style.width = clamp((pet.stageProgress / STAGE_THRESHOLD[0]) * 100, 0, 100) + '%';
    if (pet.stageProgress >= STAGE_THRESHOLD[0] && pet.stageActions >= STAGE_MIN_ACTIONS[0]) evolve();
    else schedulePersist();
  }

  function miniEl() { return document.getElementById('pet-mini'); }

  function showMini() {
    const el = miniEl();
    if (!el) return;
    el.classList.add('show');
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'pet-mini-close';
    close.setAttribute('aria-label', 'Leave mini-game');
    close.textContent = '✕';
    close.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      settleMini(false);
    };
    el.appendChild(close);
    const reward = document.createElement('div');
    reward.className = 'pet-mini-reward';
    reward.innerHTML = `
      <div class="pet-mini-reward-copy"><span id="pet-mini-grade" aria-live="polite">PLAY TO BANK CARE</span><b id="pet-mini-ticket-preview">+0 TICKETS</b></div>
      <div class="pet-mini-reward-track"><i id="pet-mini-reward-fill"></i></div>
      <small>✕ KEEPS WHAT YOU EARN</small>`;
    el.appendChild(reward);
  }

  function miniProgressAmount(state) {
    state = state || mini;
    if (!state) return 0;
    if (state.key === 'feed') return state.orders;
    if (state.key === 'play') return state.hits;
    if (state.key === 'rest') return state.notes;
    if (state.key === 'guard') return state.dodged + (state.training || 0);
    return 0;
  }

  function miniRawProgress(state) {
    state = state || mini;
    return state && state.goal ? miniProgressAmount(state) / state.goal : 0;
  }

  function miniQuality(state) {
    state = state || mini;
    if (!state) return 0;
    const amount = miniProgressAmount(state);
    const bankAt = state.bankAt || 1;
    if (amount < bankAt) return 0;
    const mastered = clamp((amount - bankAt) / Math.max(1, state.goal - bankAt), 0, 1);
    return clamp(
      0.60 + mastered * 0.40 + Math.min(0.12, state.skillBonus || 0)
      - Math.min(0.18, (state.mistakes || 0) * 0.025),
      0.35,
      1
    );
  }

  function miniGrade(quality) {
    if (quality >= 0.96) return 'JACKPOT CARE';
    if (quality >= 0.84) return 'GOLD CARE';
    if (quality >= 0.70) return 'SILVER CARE';
    if (quality > 0) return 'CARE BANKED';
    return 'PLAY TO BANK CARE';
  }

  function ticketReward(quality, complete) {
    if (quality <= 0) return 0;
    return Math.max(1, Math.floor(quality * 3) + (complete && quality >= 0.9 ? 1 : 0));
  }

  function updateMiniReward() {
    if (!mini) return;
    const quality = miniQuality(mini);
    const raw = clamp(miniRawProgress(mini), 0, 1);
    const fill = document.getElementById('pet-mini-reward-fill');
    const grade = document.getElementById('pet-mini-grade');
    const tickets = document.getElementById('pet-mini-ticket-preview');
    if (fill) fill.style.width = (raw * 100) + '%';
    if (grade) grade.textContent = quality > 0 ? miniGrade(quality) : raw > 0 ? 'ALMOST BANKED' : 'PLAY TO BANK CARE';
    if (tickets) tickets.textContent = `+${ticketReward(quality, raw >= 1)} TICKETS`;
  }

  function settleMini(complete, title) {
    if (!mini) return;
    const state = mini;
    const quality = miniQuality(state);
    const applyFn = { feed: applyFeed, play: applyPlay, rest: applyRest, guard: applyGuard }[state.key];
    const finish = () => {
      endMini();
      if (quality > 0 && applyFn) {
        applyFn(quality, {
          tickets: ticketReward(quality, complete),
          complete,
          mistakes: state.mistakes || 0,
        });
      } else {
        pet.cd[state.key] = Date.now() + 2000;
        schedulePersist();
        updateCooldowns();
      }
    };
    if (!complete) {
      finish();
      return;
    }
    if (state.raf) cancelAnimationFrame(state.raf);
    if (state.timer) clearTimeout(state.timer);
    if (state.iv) clearInterval(state.iv);
    if (state.timeouts) state.timeouts.forEach(clearTimeout);
    state.raf = 0; state.timer = 0; state.iv = 0;
    const el = miniEl();
    if (el) {
      el.onpointerdown = el.onpointermove = el.onpointerup = el.onpointercancel = null;
      el.innerHTML = `<div class="pet-mini-complete">
        <div class="pet-mini-complete-check">${heartSVG(40, '#33ff99')}</div>
        <div class="pet-mini-complete-text">${title || 'CARE BANKED!'}</div>
        <div class="pet-mini-complete-grade">${miniGrade(quality)} · +${ticketReward(quality, true)} TICKETS</div>
      </div>`;
    }
    playConfirm();
    setTimeout(finish, 650);
  }

  function endMini() {
    const el = miniEl();
    const wasKitchen = !!(el && el.classList.contains('pet-kitchen-mode'));
    if (mini) {
      if (mini.raf) cancelAnimationFrame(mini.raf);
      if (mini.timer) clearTimeout(mini.timer);
      if (mini.iv) clearInterval(mini.iv);
      if (mini.timeouts) mini.timeouts.forEach(clearTimeout);
      if (mini.dragCleanup) mini.dragCleanup();
    }
    if (el) {
      el.classList.remove('show', 'pet-kitchen-mode');
      el.innerHTML = '';
      el.onpointerdown = el.onpointermove = el.onpointerup = el.onpointercancel = null;
      if (wasKitchen) {
        const tank = document.getElementById('pet-tank');
        if (tank && el.parentElement !== tank) tank.appendChild(el);
      }
    }
    if (wasKitchen && window.setArcadeExitVisible) window.setArcadeExitVisible(true);
    mini = null;
    updateCooldowns();
  }

  // Small floating readout inside the active mini — "+1 FED", "OUCH -1",
  // "DODGED!", etc. — so every action has a visible, immediate result.
  let toastSeq = 0;
  function miniToast(text, kind) {
    const el = miniEl();
    if (!el || !el.classList.contains('show')) return;
    const id = ++toastSeq;
    const span = document.createElement('div');
    span.className = 'pet-mini-toast' + (kind === 'bad' ? ' bad' : kind === 'good' ? ' good' : '');
    span.textContent = text;
    span.dataset.seq = id;
    el.appendChild(span);
    setTimeout(() => { if (span.isConnected) span.remove(); }, 620);
  }

  // Swaps the mini overlay to a brief "complete" beat before handing off to
  // the apply*/afterAction pipeline, so finishing an objective is felt, not
  // just silently absorbed. Stops the mini's own loop/interval first so it
  // can't keep redrawing over the celebration markup.
  function completeMini(title) {
    settleMini(true, title);
  }

  function flashTank(kind) {
    const tank = document.getElementById('pet-tank');
    if (!tank) return;
    tank.classList.add(kind === 'bad' ? 'flash-bad' : 'flash-good');
    setTimeout(() => tank.classList.remove(kind === 'bad' ? 'flash-bad' : 'flash-good'), 220);
  }

  // ── FEED · Mobe Kitchen: prepare, process, plate, and serve ──
  function miniCatch() {
    const el = miniEl();
    if (!el) return;
    const stage = stageIdx();
    const goal = GOALS.feed[stage];
    const tune = KITCHEN_TUNE[stage];
    const page = document.getElementById('pg-pet');
    if (page && el.parentElement !== page) page.appendChild(el);
    if (window.setArcadeExitVisible) window.setArcadeExitVisible(false);

    el.classList.add('pet-kitchen-mode');
    el.innerHTML = `
      <div class="pet-kitchen-shell">
        <header class="pet-kitchen-header">
          <div>
            <div class="pet-kitchen-kicker">SOLO SHIFT · NO ORDER EXPIRY</div>
            <h2>MOBE KITCHEN</h2>
          </div>
          <div class="pet-kitchen-score">
            <b><span id="pet-kitchen-n">0</span>/${goal}</b>
            <small>ORDERS</small>
          </div>
        </header>

        <section class="pet-kitchen-order" aria-label="Current order">
          <div class="pet-kitchen-order-copy">
            <span>ORDER UP</span>
            <b id="pet-kitchen-recipe">COMET SLICE</b>
            <small>PREP THE PARTS · PLATE WHEN READY</small>
          </div>
          <div class="pet-kitchen-components" id="pet-kitchen-components"></div>
          <div class="pet-kitchen-rush">
            <div><i id="pet-kitchen-rush-fill"></i></div>
            <span id="pet-kitchen-rush-copy">RUSH BONUS</span>
          </div>
        </section>

        <section class="pet-kitchen-chef">
          <div class="pet-kitchen-chef-art" aria-hidden="true">
            ${petSVG(pet.stage, pet.form, 'happy').replace('pet-stage-svg', 'pet-stage-svg pet-kitchen-chef-svg')}
          </div>
          <div class="pet-kitchen-speech" id="pet-kitchen-speech" aria-live="polite">
            START TWO STATIONS AND LET THEM WORK TOGETHER!
          </div>
          <div class="pet-kitchen-held" id="pet-kitchen-held">
            <small>YOUR HAND</small><b>EMPTY</b>
          </div>
        </section>

        <main class="pet-kitchen-workspace">
          <section class="pet-kitchen-zone pet-kitchen-pantry">
            <div class="pet-kitchen-zone-head">
              <span>1 · PANTRY</span><small>DRAG OR TAP AN INGREDIENT</small>
            </div>
            <div class="pet-kitchen-pantry-grid">
              ${FEED_SNACKS.map(snack => `
                <button class="pet-kitchen-ingredient" type="button" data-ingredient="${snack.key}"
                  style="--ingredient:${snack.color}" aria-label="Pick up ${snack.label}">
                  <img src="${snack.src}" alt="">
                  <b>${snack.label}</b>
                  <small>${KITCHEN_STATIONS[KITCHEN_ROUTE[snack.key]].label}</small>
                </button>`).join('')}
            </div>
          </section>

          <section class="pet-kitchen-zone pet-kitchen-line">
            <div class="pet-kitchen-zone-head">
              <span>2 · KITCHEN LINE</span><small>STATIONS RUN AT THE SAME TIME</small>
            </div>
            <div class="pet-kitchen-stations">
              ${Object.entries(KITCHEN_STATIONS).map(([key, station]) => `
                <button class="pet-kitchen-station" id="pet-kitchen-${key}" type="button"
                  data-dropzone="${key}" style="--station:${station.color}"
                  aria-label="${station.label} station"></button>`).join('')}
              <button class="pet-kitchen-station pet-kitchen-plate" id="pet-kitchen-plate"
                type="button" data-dropzone="plate" aria-label="Plate station"></button>
            </div>
          </section>
        </main>

        <footer class="pet-kitchen-actions">
          <div class="pet-kitchen-tip" id="pet-kitchen-tip">
            ONE DISH BANKS CARE · KEEP COOKING FOR GOLD
          </div>
          <button class="pet-kitchen-serve" id="pet-kitchen-serve" type="button" disabled>
            <span>SERVE TO MOBLING</span><small>FINISH THE PLATE FIRST</small>
          </button>
        </footer>
      </div>`;

    showMini();
    mini = {
      key: 'feed',
      orders: 0,
      goal,
      bankAt: 1,
      mistakes: 0,
      skillBonus: 0,
      stations: { prep: null, heat: null, chill: null },
      plated: [],
      held: null,
      recipe: null,
      previousRecipe: '',
      flowPeak: 0,
      orderMistakesStart: 0,
      rushStartedAt: 0,
      rushEndsAt: 0,
      locked: false,
      finished: false,
      iv: 0,
      timeouts: [],
      dragCleanup: null,
      suppressClickUntil: 0,
    };

    const recipeEl = document.getElementById('pet-kitchen-recipe');
    const componentsEl = document.getElementById('pet-kitchen-components');
    const speechEl = document.getElementById('pet-kitchen-speech');
    const heldEl = document.getElementById('pet-kitchen-held');
    const rushFillEl = document.getElementById('pet-kitchen-rush-fill');
    const rushCopyEl = document.getElementById('pet-kitchen-rush-copy');
    const countEl = document.getElementById('pet-kitchen-n');
    const tipEl = document.getElementById('pet-kitchen-tip');
    const serveEl = document.getElementById('pet-kitchen-serve');
    const plateEl = document.getElementById('pet-kitchen-plate');
    const chefEl = el.querySelector('.pet-kitchen-chef-art');
    const pantryButtons = [...el.querySelectorAll('.pet-kitchen-ingredient')];
    const stationButtons = Object.fromEntries(
      Object.keys(KITCHEN_STATIONS).map(key => [key, document.getElementById(`pet-kitchen-${key}`)])
    );

    function snackByKey(key) {
      return FEED_SNACKS.find(snack => snack.key === key);
    }

    function ingredientImage(key, extraClass) {
      const snack = snackByKey(key);
      return `<img class="${extraClass || ''}" src="${snack.src}" alt=""><b>${snack.label}</b>`;
    }

    function say(message, kind) {
      if (!speechEl) return;
      speechEl.textContent = message;
      speechEl.classList.toggle('good', kind === 'good');
      speechEl.classList.toggle('nudge', kind === 'nudge');
    }

    function flashStation(target, kind) {
      if (!target) return;
      target.classList.remove('kitchen-bump', 'kitchen-ready-pop');
      void target.offsetWidth;
      target.classList.add(kind === 'good' ? 'kitchen-ready-pop' : 'kitchen-bump');
      mini.timeouts.push(setTimeout(() => {
        if (target) target.classList.remove('kitchen-bump', 'kitchen-ready-pop');
      }, 420));
    }

    function stationContaining(key) {
      return Object.entries(mini.stations).find(([, job]) => job && job.key === key);
    }

    function componentState(key) {
      if (mini.plated.includes(key)) return { label: 'PLATED', cls: 'plated', progress: 1 };
      if (mini.held && mini.held.key === key) {
        return { label: mini.held.processed ? 'READY IN HAND' : 'IN HAND', cls: 'held', progress: 0 };
      }
      const entry = stationContaining(key);
      if (entry) {
        const [stationKey, job] = entry;
        const progress = clamp((Date.now() - job.startedAt) / (job.endsAt - job.startedAt), 0, 1);
        if (job.ready) return { label: job.over ? 'STILL GOOD' : 'READY', cls: 'ready', progress: 1 };
        return { label: KITCHEN_STATIONS[stationKey].action, cls: 'working', progress };
      }
      const station = KITCHEN_STATIONS[KITCHEN_ROUTE[key]];
      return { label: `NEEDS ${station.label}`, cls: '', progress: 0 };
    }

    function ingredientIsAvailable(key) {
      if (!mini.recipe || !mini.recipe.components.includes(key)) return false;
      if (mini.plated.includes(key)) return false;
      if (mini.held && mini.held.key === key) return false;
      return !stationContaining(key);
    }

    function renderPantry() {
      pantryButtons.forEach(button => {
        const key = button.dataset.ingredient;
        const needed = mini.recipe && mini.recipe.components.includes(key);
        const available = ingredientIsAvailable(key);
        button.classList.toggle('needed', !!needed);
        button.classList.toggle('used', !!needed && !available);
        button.disabled = !needed || !available || mini.locked;
        button.setAttribute('aria-label', needed
          ? `${available ? 'Pick up' : 'Already cooking or plated'} ${snackByKey(key).label}`
          : `${snackByKey(key).label} is not in this order`);
      });
    }

    function renderHeld() {
      if (!mini.held) {
        heldEl.classList.remove('loaded');
        heldEl.innerHTML = '<small>YOUR HAND</small><b>EMPTY</b>';
        return;
      }
      const snack = snackByKey(mini.held.key);
      heldEl.classList.add('loaded');
      heldEl.style.setProperty('--held', snack.color);
      heldEl.innerHTML = `
        <small>${mini.held.processed ? 'READY TO PLATE' : `TAKE TO ${KITCHEN_STATIONS[mini.held.station].label}`}</small>
        <span><img src="${snack.src}" alt=""><b>${snack.label}</b></span>`;
    }

    function renderOrder() {
      if (!mini.recipe) return;
      recipeEl.textContent = mini.recipe.name;
      componentsEl.innerHTML = mini.recipe.components.map(key => {
        const snack = snackByKey(key);
        const state = componentState(key);
        return `<div class="pet-kitchen-component ${state.cls}" style="--ingredient:${snack.color}">
          <div>${ingredientImage(key)}</div>
          <span>${state.label}</span>
          <i><em style="width:${Math.round(state.progress * 100)}%"></em></i>
        </div>`;
      }).join('');
    }

    function renderStations() {
      Object.entries(KITCHEN_STATIONS).forEach(([key, station]) => {
        const button = stationButtons[key];
        const job = mini.stations[key];
        if (!job) {
          button.className = 'pet-kitchen-station';
          button.innerHTML = `
            <span class="pet-kitchen-station-name">${station.label}</span>
            <b>${station.action}</b>
            <small>${mini.held && !mini.held.processed && mini.held.station === key ? 'TAP TO START' : 'DROP INGREDIENT HERE'}</small>
            <i class="pet-kitchen-station-progress"><em></em></i>`;
          button.disabled = mini.locked;
          return;
        }
        const snack = snackByKey(job.key);
        const progress = clamp((Date.now() - job.startedAt) / (job.endsAt - job.startedAt), 0, 1);
        button.className = `pet-kitchen-station ${job.ready ? 'ready' : 'working'} ${job.over ? 'cozy' : ''}`;
        button.innerHTML = `
          <span class="pet-kitchen-station-name">${station.label}</span>
          <div class="pet-kitchen-station-item">${ingredientImage(job.key)}</div>
          <small>${job.ready ? (job.over ? 'STILL DELICIOUS · PICK UP' : 'READY · TAP TO PICK UP') : `${station.action} · ${Math.round(progress * 100)}%`}</small>
          <i class="pet-kitchen-station-progress"><em style="width:${Math.round(progress * 100)}%"></em></i>`;
        button.style.setProperty('--ingredient', snack.color);
        button.disabled = mini.locked;
      });

      const complete = mini.recipe && mini.recipe.components.every(key => mini.plated.includes(key));
      const plateItems = mini.plated.map(key => `<span style="--ingredient:${snackByKey(key).color}">${ingredientImage(key)}</span>`).join('');
      plateEl.className = `pet-kitchen-station pet-kitchen-plate ${mini.plated.length ? 'loaded' : ''} ${complete ? 'complete' : ''}`;
      plateEl.innerHTML = `
        <span class="pet-kitchen-station-name">PLATE</span>
        <div class="pet-kitchen-plate-items">${plateItems || '<i>+</i>'}</div>
        <small>${complete ? 'ORDER COMPLETE!' : mini.held && mini.held.processed ? 'TAP TO ADD' : 'BRING READY FOOD HERE'}</small>`;
      plateEl.disabled = mini.locked;
      serveEl.disabled = !complete || mini.locked;
      serveEl.classList.toggle('ready', !!complete && !mini.locked);
      serveEl.querySelector('small').textContent = complete ? 'CARE IS READY TO BANK' : 'FINISH THE PLATE FIRST';
    }

    function renderKitchen() {
      if (!mini || mini.key !== 'feed') return;
      renderPantry();
      renderHeld();
      renderOrder();
      renderStations();
      countEl.textContent = mini.orders;
    }

    function selectRaw(key) {
      if (!mini || mini.locked) return false;
      if (mini.held) {
        say(mini.held.processed ? 'PLATE THE READY ITEM FIRST.' : 'PLACE WHAT YOU ARE HOLDING FIRST.', 'nudge');
        return false;
      }
      if (!ingredientIsAvailable(key)) return false;
      mini.held = { key, station: KITCHEN_ROUTE[key], processed: false };
      pentaNote(FEED_SNACKS.findIndex(item => item.key === key) + 1, 0.035, 0.07);
      say(`GOT ${snackByKey(key).label}. TAKE IT TO ${KITCHEN_STATIONS[KITCHEN_ROUTE[key]].label}.`);
      renderKitchen();
      return true;
    }

    function placeHeld(destination) {
      if (!mini || !mini.held || mini.locked) return false;
      const item = mini.held;
      if (destination === 'plate') {
        if (!item.processed) {
          mini.mistakes += 0.15;
          say(`${snackByKey(item.key).label} NEEDS ${KITCHEN_STATIONS[item.station].label} FIRST.`, 'nudge');
          flashStation(plateEl);
          updateMiniReward();
          return false;
        }
        if (mini.plated.includes(item.key)) return false;
        mini.plated.push(item.key);
        mini.held = null;
        playConfirm();
        miniToast('PLATED!', 'good');
        say('NICE PLATE! KEEP THE KITCHEN MOVING.', 'good');
        flashStation(plateEl, 'good');
        renderKitchen();
        return true;
      }

      const station = KITCHEN_STATIONS[destination];
      if (!station) return false;
      if (item.processed) {
        say('THAT PART IS READY—TAKE IT TO THE PLATE.', 'nudge');
        flashStation(stationButtons[destination]);
        return false;
      }
      if (item.station !== destination) {
        mini.mistakes += 0.15;
        say(`${snackByKey(item.key).label} GOES TO ${KITCHEN_STATIONS[item.station].label}.`, 'nudge');
        flashStation(stationButtons[destination]);
        updateMiniReward();
        return false;
      }
      if (mini.stations[destination]) {
        say(`${station.label} IS BUSY—START ANOTHER STATION WHILE IT WORKS.`, 'nudge');
        flashStation(stationButtons[destination]);
        return false;
      }

      const now = Date.now();
      mini.stations[destination] = {
        key: item.key,
        startedAt: now,
        endsAt: now + station.duration,
        overAt: now + station.duration + tune.graceMs,
        ready: false,
        over: false,
      };
      mini.held = null;
      const concurrent = Object.values(mini.stations).filter(Boolean).length;
      mini.flowPeak = Math.max(mini.flowPeak, concurrent);
      pentaNote(Object.keys(KITCHEN_STATIONS).indexOf(destination) + 2, 0.06, 0.09);
      if (concurrent > 1) {
        miniToast(`KITCHEN FLOW ×${concurrent}!`, 'good');
        say(`${concurrent} STATIONS MOVING TOGETHER—THAT'S KITCHEN FLOW!`, 'good');
      } else {
        say(`${station.action} STARTED! LOAD ANOTHER STATION WHILE IT RUNS.`, 'good');
      }
      renderKitchen();
      return true;
    }

    function interactStation(key) {
      if (!mini || mini.locked) return;
      const job = mini.stations[key];
      if (job && job.ready) {
        if (mini.held) {
          say('YOUR HAND IS FULL—PLATE OR PLACE IT FIRST.', 'nudge');
          return;
        }
        mini.held = { key: job.key, station: key, processed: true };
        mini.stations[key] = null;
        pentaNote(5, 0.07, 0.11);
        miniToast('READY!', 'good');
        say('PERFECT! TAKE IT TO THE PLATE.', 'good');
        renderKitchen();
        return;
      }
      if (job) {
        say(`${KITCHEN_STATIONS[key].action} IS UNDERWAY—WORK ANOTHER STATION!`);
        return;
      }
      if (mini.held) {
        placeHeld(key);
        return;
      }
      say(`PICK AN INGREDIENT MARKED ${KITCHEN_STATIONS[key].label} FROM THE PANTRY.`);
    }

    function interactPlate() {
      if (!mini || mini.locked) return;
      if (mini.held) {
        placeHeld('plate');
        return;
      }
      say(mini.plated.length ? 'THE PLATE IS WAITING FOR THE REST OF THE ORDER.' : 'PROCESS AN INGREDIENT, THEN BRING IT HERE.');
    }

    function beginHeldDrag(event, key) {
      event.preventDefault();
      const snack = snackByKey(key);
      const ghost = document.createElement('div');
      ghost.className = 'pet-kitchen-drag-ghost';
      ghost.style.setProperty('--ingredient', snack.color);
      ghost.innerHTML = ingredientImage(key);
      el.appendChild(ghost);
      const startX = event.clientX;
      const startY = event.clientY;
      let moved = false;

      const moveGhost = (x, y) => {
        ghost.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      };
      moveGhost(startX, startY);

      const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onEnd);
        window.removeEventListener('pointercancel', onEnd);
        if (ghost.isConnected) ghost.remove();
        if (mini) mini.dragCleanup = null;
      };
      const onMove = (moveEvent) => {
        moveEvent.preventDefault();
        if (Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) > 8) moved = true;
        moveGhost(moveEvent.clientX, moveEvent.clientY);
      };
      const onEnd = (endEvent) => {
        if (mini) mini.suppressClickUntil = performance.now() + 280;
        if (moved) {
          const target = document.elementFromPoint(endEvent.clientX, endEvent.clientY);
          const dropzone = target && target.closest('[data-dropzone]');
          if (dropzone) placeHeld(dropzone.dataset.dropzone);
          else say('STILL IN YOUR HAND—TAP A GLOWING STATION TO PLACE IT.');
        }
        cleanup();
      };
      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onEnd);
      window.addEventListener('pointercancel', onEnd);
      mini.dragCleanup = cleanup;
    }

    function beginPantryDrag(event, key) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!selectRaw(key)) return;
      beginHeldDrag(event, key);
    }

    function beginStationDrag(event, stationKey) {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      if (!mini || mini.locked || mini.held) return;
      const job = mini.stations[stationKey];
      if (!job || !job.ready) return;
      mini.held = { key: job.key, station: stationKey, processed: true };
      mini.stations[stationKey] = null;
      pentaNote(5, 0.07, 0.11);
      say('READY! DRAG IT STRAIGHT TO THE PLATE.', 'good');
      renderKitchen();
      beginHeldDrag(event, job.key);
    }

    function chooseRecipe() {
      let options = KITCHEN_RECIPES.filter(recipe => recipe.minStage <= stage);
      if (stage === 1) options = options.filter(recipe => recipe.components.length === 2);
      if (stage === 2) options = options.filter(recipe => recipe.components.length === 3);
      if (stage === 3) options = options.filter(recipe => recipe.components.length >= 3);
      const fresh = options.filter(recipe => recipe.name !== mini.previousRecipe);
      if (fresh.length) options = fresh;
      const seed = pet.memories + mini.orders + Math.floor(Math.random() * options.length);
      return options[seed % options.length];
    }

    function newRecipe() {
      if (!mini || mini.key !== 'feed') return;
      const recipe = chooseRecipe();
      mini.previousRecipe = recipe.name;
      mini.recipe = recipe;
      mini.plated = [];
      mini.held = null;
      mini.stations = { prep: null, heat: null, chill: null };
      mini.flowPeak = 0;
      mini.orderMistakesStart = mini.mistakes;
      mini.locked = false;
      mini.rushStartedAt = Date.now();
      mini.rushEndsAt = mini.rushStartedAt + tune.rushMs;
      tipEl.textContent = mini.orders
        ? 'CARE BANKED · ANOTHER DISH BUILDS YOUR TICKET BONUS'
        : 'ONE DISH BANKS CARE · KEEP COOKING FOR GOLD';
      say(mini.orders
        ? `${recipe.name}! FIND WHAT CAN RUN AT THE SAME TIME.`
        : 'START TWO STATIONS AND LET THEM WORK TOGETHER!');
      renderKitchen();
    }

    function serveOrder() {
      if (!mini || mini.locked || !mini.recipe) return;
      const complete = mini.recipe.components.every(key => mini.plated.includes(key));
      if (!complete) return;
      mini.locked = true;
      const rush = Date.now() <= mini.rushEndsAt;
      const clean = mini.mistakes === mini.orderMistakesStart;
      mini.skillBonus = Math.min(
        0.12,
        mini.skillBonus + (rush ? 0.03 : 0) + (mini.flowPeak > 1 ? 0.02 : 0) + (clean ? 0.01 : 0)
      );
      mini.orders++;
      countEl.textContent = mini.orders;
      updateMiniReward();
      playConfirm();
      miniToast(rush && clean ? 'PERFECT SERVE!' : rush ? 'RUSH SERVE!' : 'ORDER SERVED!', 'good');
      say(rush && mini.flowPeak > 1
        ? 'WOW—KITCHEN FLOW! RUSH BONUS EARNED.'
        : clean ? 'CLEAN PLATE! CARE BANKED.' : 'DELICIOUS! CARE BANKED.', 'good');
      chefEl.classList.remove('celebrate');
      void chefEl.offsetWidth;
      chefEl.classList.add('celebrate');
      if (mini.orders >= mini.goal) {
        mini.finished = true;
        mini.timeouts.push(setTimeout(() => completeMini('KITCHEN JACKPOT!'), 520));
        return;
      }
      mini.timeouts.push(setTimeout(newRecipe, 820));
    }

    function updateKitchen() {
      if (!mini || mini.key !== 'feed' || mini.finished) return;
      const now = Date.now();
      let stateChanged = false;
      Object.entries(mini.stations).forEach(([key, job]) => {
        if (!job) return;
        if (!job.ready && now >= job.endsAt) {
          job.ready = true;
          stateChanged = true;
          pentaNote(Object.keys(KITCHEN_STATIONS).indexOf(key) + 5, 0.06, 0.1);
          say(`${snackByKey(job.key).label} IS READY AT ${KITCHEN_STATIONS[key].label}!`, 'good');
          flashStation(stationButtons[key], 'good');
        }
        if (job.ready && !job.over && now >= job.overAt) {
          job.over = true;
          mini.mistakes += 0.5;
          stateChanged = true;
          say(`${snackByKey(job.key).label} GOT A LITTLE EXTRA—STILL DELICIOUS, STILL USABLE.`);
          updateMiniReward();
        }
      });

      const rushLeft = clamp((mini.rushEndsAt - now) / Math.max(1, mini.rushEndsAt - mini.rushStartedAt), 0, 1);
      rushFillEl.style.width = `${rushLeft * 100}%`;
      if (rushLeft > 0) {
        rushCopyEl.textContent = 'RUSH BONUS';
        rushCopyEl.classList.remove('ended');
      } else {
        rushCopyEl.textContent = 'TAKE YOUR TIME · ORDER STAYS';
        rushCopyEl.classList.add('ended');
      }
      renderOrder();
      renderStations();
      if (stateChanged) renderPantry();
    }

    pantryButtons.forEach(button => {
      const key = button.dataset.ingredient;
      button.addEventListener('pointerdown', event => beginPantryDrag(event, key));
      button.addEventListener('click', () => {
        if (!mini || performance.now() < mini.suppressClickUntil) return;
        selectRaw(key);
      });
    });
    Object.entries(stationButtons).forEach(([key, button]) => {
      button.addEventListener('pointerdown', event => beginStationDrag(event, key));
      button.addEventListener('click', () => {
        if (!mini || performance.now() < mini.suppressClickUntil) return;
        interactStation(key);
      });
    });
    plateEl.addEventListener('click', interactPlate);
    serveEl.addEventListener('click', serveOrder);

    updateMiniReward();
    updateCooldowns();
    newRecipe();
    mini.iv = setInterval(updateKitchen, 100);
  }

  // ── PLAY · Whack-flavored: multi-pop toys with misses and combos ──
  function miniWhack() {
    const el = miniEl();
    if (!el) return;
    const SPOTS = 6;
    const goal = GOALS.play[stageIdx()];
    const tune = PLAY_TUNE[stageIdx()];
    el.innerHTML = `
      <div class="pet-mini-title">PLAYTIME!</div>
      <div class="pet-mini-hint">4 BOPS EARNS CARE · COMBOS WIN MORE</div>
      <div class="pet-whack-grid" id="pet-whack-grid">${Array.from({ length: SPOTS }, () =>
        `<button class="pet-whack-hole" type="button" aria-label="Bop toy"><span class="pet-whack-toy">${iconImg(ICON.play, 30)}</span></button>`).join('')}</div>
      <div class="pet-whack-score-row"><div class="pet-mini-count"><span id="pet-whack-n">0</span>/${goal} BOPS</div><div class="pet-whack-combo" id="pet-whack-combo"></div></div>`;
    showMini();
    const stage = stageIdx();
    const popCount = stage === 1 ? 1 : stage === 2 ? 2 : 2 + (Math.random() < 0.5 ? 0 : 1);
    const windowMs = stage === 1 ? 1200 : stage === 2 ? 900 : 700;
    mini = { key: 'play', hits: 0, combo: 0, goal, bankAt: 4, mistakes: 0, iv: 0, timeouts: [], popToken: 0 };
    updateMiniReward();
    updateCooldowns();
    const holes = [...el.querySelectorAll('.pet-whack-hole')];
    const nEl = document.getElementById('pet-whack-n');
    const comboEl = document.getElementById('pet-whack-combo');
    const grid = document.getElementById('pet-whack-grid');
    holes.forEach(h => h.onpointerdown = (e) => {
      e.preventDefault();
      if (!mini || !h.classList.contains('up')) return;
      h.classList.remove('up');
      h.dataset.hit = '1';
      h.classList.add('bonk');
      setTimeout(() => h.classList.remove('bonk'), 150);
      mini.hits++;
      mini.combo++;
      if (mini.combo % 5 === 0) {
        mini.hits++;
        grid.classList.add('milestone');
        setTimeout(() => grid.classList.remove('milestone'), 360);
        miniToast(`×${mini.combo} BONUS +1`, 'good');
      } else {
        miniToast('+1 BOP', 'good');
      }
      if (nEl) nEl.textContent = mini.hits;
      if (comboEl) comboEl.textContent = mini.combo > 1 ? `×${mini.combo} COMBO` : '';
      pentaNote(mini.hits + 3, 0.09);
      updateMiniReward();
      if (mini.hits >= mini.goal) { completeMini('PLAYTIME JACKPOT!'); return; }
    });
    function pop() {
      if (!mini || mini.key !== 'play') return;
      const available = holes.filter(h => !h.classList.contains('up')).sort(() => Math.random() - 0.5);
      available.slice(0, popCount).forEach(h => {
        const token = ++mini.popToken;
        h.dataset.popToken = token;
        h.dataset.hit = '0';
        h.classList.remove('missed');
        h.classList.add('up');
        const timeout = setTimeout(() => {
          if (!mini || mini.key !== 'play' || +h.dataset.popToken !== token || !h.classList.contains('up')) return;
          h.classList.remove('up');
          h.classList.add('missed');
          setTimeout(() => h.classList.remove('missed'), 240);
          mini.combo = 0;
          mini.mistakes++;
          updateMiniReward();
          if (comboEl) comboEl.textContent = '';
          if (typeof CSFX !== 'undefined' && CSFX.back) CSFX.back();
        }, windowMs);
        mini.timeouts.push(timeout);
      });
    }
    pop();
    mini.iv = setInterval(pop, tune.popGap);
  }

  // ── REST · Simon-style pentatonic echo sequence ──
  function miniPads() {
    const el = miniEl();
    if (!el) return;
    const goal = GOALS.rest[stageIdx()];
    el.innerHTML = `
      <div class="pet-mini-title">SIGNAL LULLABY</div>
      <div class="pet-mini-hint" id="pet-rest-hint">ONE MELODY EARNS CARE · EVERY NOTE COUNTS</div>
      <div class="pet-rest-board" id="pet-rest-board">
        ${REST_BANDS.map(b => `
          <div class="pet-rest-band-row">
            <div class="pet-rest-band-label" style="color:${b.color}">${b.label}</div>
            <div class="pet-rest-band-svg">${bandSVG(b.degs.map(d => ({ deg: d, letter: NOTE_LETTERS[d] })), b.color)}</div>
          </div>`).join('')}
      </div>
      <div class="pet-mini-count"><span id="pet-rest-n">0</span>/${goal} LULLABY</div>`;
    showMini();
    const stage = stageIdx();
    const sequenceLength = stage + 2;
    const award = stage === 1 ? 2 : stage === 2 ? 3 : 4;
    mini = { key: 'rest', notes: 0, goal, bankAt: award, sequence: [], input: 0, accepting: false, mistakes: 0, timeouts: [] };
    updateMiniReward();
    updateCooldowns();
    const nEl = document.getElementById('pet-rest-n');
    const board = document.getElementById('pet-rest-board');
    const hint = document.getElementById('pet-rest-hint');
    const nodes = [...el.querySelectorAll('.pet-rest-node')];
    nodes.forEach((node, idx) => {
      node.dataset.nodeIndex = idx;
      node.dataset.letter = node.querySelector('text').textContent;
      const chooseNode = (e) => {
        e.preventDefault();
        if (!mini || !mini.accepting) return;
        const deg = +node.dataset.note;
        pentaNote(deg, 0.11, 0.45);
        const expected = mini.sequence[mini.input];
        if (idx !== expected) {
          mini.accepting = false;
          mini.mistakes++;
          node.classList.add('wrong');
          synthTone(150, 'sine', 0, 0.18, 0.05, 110);
          if (hint) hint.textContent = 'CUTE REMIX! TRY THE SAME MELODY AGAIN';
          updateMiniReward();
          mini.timeouts.push(setTimeout(() => {
            node.classList.remove('wrong');
            playSequence();
          }, 520));
          return;
        }
        mini.input++;
        node.classList.add('hit');
        node.querySelector('text').textContent = mini.input;
        mini.timeouts.push(setTimeout(() => node.classList.remove('hit'), 260));
        if (mini.input === mini.sequence.length) {
          mini.accepting = false;
          mini.notes += award;
          if (nEl) nEl.textContent = Math.min(mini.goal, mini.notes);
          miniToast(`ECHO! +${award}`, 'good');
          updateMiniReward();
          if (mini.notes >= mini.goal) { completeMini('LULLABY JACKPOT!'); return; }
          mini.timeouts.push(setTimeout(newSequence, 650));
        }
      };
      node.addEventListener('pointerdown', chooseNode);
      node.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') chooseNode(e);
      });
    });
    function resetNodeLabels() {
      nodes.forEach(node => {
        node.classList.remove('hit', 'wrong', 'playing');
        node.querySelector('text').textContent = node.dataset.letter;
      });
    }
    function playSequence() {
      if (!mini || mini.key !== 'rest') return;
      mini.input = 0;
      mini.accepting = false;
      resetNodeLabels();
      board.classList.add('playback');
      if (hint) hint.textContent = 'WATCH · LISTEN';
      mini.sequence.forEach((idx, i) => {
        mini.timeouts.push(setTimeout(() => {
          const node = nodes[idx];
          node.classList.add('playing');
          pentaNote(+node.dataset.note, 0.1, 0.3);
          mini.timeouts.push(setTimeout(() => node.classList.remove('playing'), 300));
        }, i * 500));
      });
      mini.timeouts.push(setTimeout(() => {
        if (!mini || mini.key !== 'rest') return;
        board.classList.remove('playback');
        mini.accepting = true;
        if (hint) hint.textContent = 'YOUR TURN · REPEAT';
      }, mini.sequence.length * 500));
    }
    function newSequence() {
      if (!mini || mini.key !== 'rest') return;
      mini.sequence = Array.from({ length: sequenceLength }, () => Math.floor(Math.random() * nodes.length));
      playSequence();
    }
    newSequence();
  }

  // ── PET · holographic scratch-off: rub the foil off to reveal the love ──
  function miniScratch() {
    const el = miniEl();
    if (!el) return;
    const { cols: COLS, rows: ROWS } = FOIL_GRID[stageIdx()];
    const TOTAL = COLS * ROWS;
    const goal = GOALS.pet[stageIdx()];
    const bonusCells = new Set();
    const bonusCount = 3 + Math.floor(Math.random() * 3);
    while (bonusCells.size < bonusCount) bonusCells.add(Math.floor(Math.random() * TOTAL));
    el.innerHTML = `
      <div class="pet-mini-title">SCRATCH & PET</div>
      <div class="pet-mini-hint">RUB OFF THE FOIL TO REVEAL THE LOVE</div>
      <div class="pet-scratch" id="pet-scratch">
        <div class="pet-scratch-reveal">${heartSVG(64)}
          <div class="pet-scratch-bonuses" style="grid-template-columns:repeat(${COLS},1fr)">${
            Array.from({ length: TOTAL }, (_, i) => `<i>${bonusCells.has(i) ? (i % 2 ? '★' : '♥') : ''}</i>`).join('')}</div>
        </div>
        <div class="pet-foil" id="pet-foil" style="grid-template-columns:repeat(${COLS},1fr)">${
          Array.from({ length: TOTAL }, (_, i) => `<i class="pet-foil-cell" data-index="${i}"></i>`).join('')}</div>
      </div>
      <div class="pet-mini-count"><span id="pet-scratch-n">0</span>% CLEARED</div>`;
    showMini();
    const nEl = document.getElementById('pet-scratch-n');
    mini = { key: 'pet', cleared: 0, total: TOTAL, goal, down: false, lastNote: 0, bonusCells };
    updateCooldowns();
    function clearAt(x, y) {
      const cell = document.elementFromPoint(x, y);
      if (!cell || !cell.classList || !cell.classList.contains('pet-foil-cell') || cell._gone) return;
      cell._gone = true;
      cell.classList.add('gone');
      mini.cleared++;
      if (nEl) nEl.textContent = Math.round(100 * mini.cleared / mini.total);
      const now = performance.now();
      if (mini.bonusCells.has(+cell.dataset.index)) {
        pentaNote(5, 0.08, 0.12);
        pentaNote(8, 0.08, 0.16, 0.07);
        miniToast('BONUS! ✦');
        const yay = document.createElement('span');
        yay.className = 'pet-scratch-yay';
        yay.textContent = 'YAY!';
        cell.parentElement.parentElement.appendChild(yay);
        setTimeout(() => yay.remove(), 650);
      } else if (now - mini.lastNote > 65) {
        pentaNote(mini.cleared + 2, 0.06, 0.14);
        mini.lastNote = now;
      }
      if (mini.cleared / mini.total >= goal) { completeMini('ALL CLEARED!', applyPet); return; }
    }
    el.onpointerdown = (e) => { e.preventDefault(); if (mini) { mini.down = true; clearAt(e.clientX, e.clientY); } };
    el.onpointermove = (e) => { if (mini && mini.down) clearAt(e.clientX, e.clientY); };
    const up = () => { if (mini) mini.down = false; };
    el.onpointerup = up;
    el.onpointercancel = up;
  }

  // ── GUARD · Space Red's tracking charge, lock reticle, and aimed shot ──
  function miniGuard() {
    const el = miniEl();
    if (!el) return;
    const goal = GOALS.guard[stageIdx()];
    const tune = GUARD_TUNE[stageIdx()];
    el.innerHTML = `
      <div class="pet-mini-title">ON GUARD</div>
      <div class="pet-mini-hint">2 DODGES EARNS CARE · MOVE AFTER IT LOCKS</div>
      <div class="pet-guard-field" id="pet-guard-field">
        <span class="pet-guard-enemy" id="pet-guard-enemy">${shardSVG(28, '#ff3344')}</span>
        <span class="pet-guard-aim" id="pet-guard-aim"></span>
        <span class="pet-guard-reticle" id="pet-guard-reticle"></span>
        <span class="pet-guard-shot" id="pet-guard-shot">${shardSVG(20, '#ff3344')}</span>
        <div class="pet-guard-track" id="pet-guard-track" role="slider" tabindex="0" aria-label="Move shield"
          aria-valuemin="6" aria-valuemax="94" aria-valuenow="50"><div class="pet-guard-ship" id="pet-guard-ship">${iconImg(ICON.safety, 26)}</div></div>
      </div>
      <div class="pet-mini-count"><span id="pet-guard-n">0</span>/${goal} DODGED</div>`;
    showMini();
    const field = document.getElementById('pet-guard-field');
    const track = document.getElementById('pet-guard-track');
    const ship = document.getElementById('pet-guard-ship');
    const enemyEl = document.getElementById('pet-guard-enemy');
    const aimEl = document.getElementById('pet-guard-aim');
    const reticleEl = document.getElementById('pet-guard-reticle');
    const shotEl = document.getElementById('pet-guard-shot');
    const nEl = document.getElementById('pet-guard-n');
    mini = {
      key: 'guard', dodged: 0, goal, shipX: 50, enemyX: 50, enemyDir: 1,
      phase: 'drift', t0: 0, t1: 0, lockX: 50, shotStartX: 50, burstLeft: 0,
      bankAt: 2, mistakes: 0, training: 0, raf: 0, prev: performance.now(), nextLockAt: performance.now() + 420,
    };
    updateMiniReward();
    updateCooldowns();
    function setShipPct(value) {
      mini.shipX = clamp(value, 6, 94);
      ship.style.left = mini.shipX + '%';
      track.setAttribute('aria-valuenow', Math.round(mini.shipX));
    }
    function setShipX(clientX) {
      const rect = track.getBoundingClientRect();
      setShipPct(((clientX - rect.left) / rect.width) * 100);
    }
    track.onpointerdown = (e) => { e.preventDefault(); setShipX(e.clientX); };
    track.onpointermove = (e) => setShipX(e.clientX);
    field.onpointerdown = (e) => setShipX(e.clientX);
    field.onpointermove = (e) => { if (mini) setShipX(e.clientX); };
    track.onkeydown = (e) => {
      if (!mini || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      setShipPct(mini.shipX + (e.key === 'ArrowLeft' ? -14 : 14));
    };
    enemyEl.style.left = '50%';
    shotEl.style.opacity = '0';
    aimEl.style.opacity = '0';
    reticleEl.style.opacity = '0';
    function updateAimLine() {
      const rect = field.getBoundingClientRect();
      const x1 = rect.width * mini.enemyX / 100;
      const y1 = rect.height * 0.13;
      const x2 = rect.width * mini.lockX / 100;
      const y2 = rect.height * 0.86;
      const dx = x2 - x1;
      const dy = y2 - y1;
      aimEl.style.left = x1 + 'px';
      aimEl.style.top = y1 + 'px';
      aimEl.style.width = Math.hypot(dx, dy) + 'px';
      aimEl.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`;
      reticleEl.style.left = mini.lockX + '%';
    }
    function resolve() {
      const hit = Math.abs(mini.lockX - mini.shipX) < tune.tol;
      shotEl.style.opacity = '0';
      if (hit) {
        mini.mistakes++;
        mini.training += 0.25;
        playSound('miss');
        flashTank('bad');
        miniToast('HIT · +¼ TRAINING', 'bad');
      } else {
        mini.dodged++;
        playShieldPing();
        miniToast('DODGED! +1', 'good');
      }
      if (nEl) nEl.textContent = Math.floor(mini.dodged);
      updateMiniReward();
      mini.burstLeft--;
      mini.phase = 'drift';
      mini.nextLockAt = performance.now() + tune.gap * (mini.burstLeft > 0 ? 1 : 2.1);
      reticleEl.style.opacity = '0';
      if (mini.dodged >= mini.goal) completeMini('GUARD JACKPOT!');
    }
    function loop(now) {
      if (!mini || mini.key !== 'guard') return;
      const dt = Math.min(0.05, (now - mini.prev) / 1000 || 0.016);
      mini.prev = now;
      try {
        if (mini.phase === 'drift') {
          mini.enemyX += mini.enemyDir * tune.driftSpeed * dt;
          if (mini.enemyX > 88) { mini.enemyX = 88; mini.enemyDir = -1; }
          if (mini.enemyX < 12) { mini.enemyX = 12; mini.enemyDir = 1; }
          enemyEl.style.left = mini.enemyX + '%';
          if (now >= mini.nextLockAt) {
            mini.phase = 'lock';
            mini.t0 = now;
            mini.lockX = mini.shipX;
            if (mini.burstLeft <= 0) mini.burstLeft = tune.burst;
            enemyEl.classList.add('locking');
            aimEl.classList.remove('locked');
            aimEl.style.opacity = '1';
            reticleEl.classList.remove('locked');
            reticleEl.style.opacity = '1';
            playGuardChargeCue();
          }
        } else if (mini.phase === 'lock') {
          const elapsed = now - mini.t0;
          const p = clamp(elapsed / tune.charge, 0, 1);
          if (elapsed < tune.aimLock) {
            mini.lockX = mini.shipX;
          } else {
            aimEl.classList.add('locked');
            reticleEl.classList.add('locked');
          }
          updateAimLine();
          enemyEl.style.transform = `translateX(-50%) scale(${1 + p * 0.4})`;
          if (p >= 1) {
            mini.phase = 'shot';
            mini.t1 = now;
            mini.shotStartX = mini.enemyX;
            enemyEl.classList.remove('locking');
            enemyEl.style.transform = 'translateX(-50%) scale(1)';
            aimEl.style.opacity = '0';
            shotEl.style.left = mini.shotStartX + '%';
            shotEl.style.top = '10%';
            shotEl.style.opacity = '1';
          }
        } else if (mini.phase === 'shot') {
          const p = clamp((now - mini.t1) / tune.strike, 0, 1);
          shotEl.style.left = (mini.shotStartX + (mini.lockX - mini.shotStartX) * p) + '%';
          shotEl.style.top = (10 + p * 76) + '%';
          if (p >= 1) resolve();
        }
      } catch (err) {
        console.warn('[pet] guard loop error', err);
      }
      if (mini && mini.key === 'guard') mini.raf = requestAnimationFrame(loop);
    }
    mini.raf = requestAnimationFrame(loop);
  }

  // ── Apply banked results. The first short game beat earns useful care;
  // continuing improves the grade, tickets, trait influence, and jackpot.
  function applyFeed(q, meta) {
    pet.hunger = clamp(pet.hunger + 18 + 30 * q, 0, 100);
    pet.happiness = clamp(pet.happiness + 4, 0, 100);
    pet.energy = clamp(pet.energy - 3 * q, 0, 100);
    afterAction('feed', q, 'balance', iconImg(ICON.hunger, 22), meta);
    playConfirm();
  }
  function applyRest(q, meta) {
    pet.energy = clamp(pet.energy + 18 + 32 * q, 0, 100);
    pet.happiness = clamp(pet.happiness + 3, 0, 100);
    afterAction('rest', q, 'energy', iconImg(ICON.energy, 22), meta);
    playConfirm();
  }
  function applyPlay(q, meta) {
    pet.happiness = clamp(pet.happiness + 14 + 28 * q, 0, 100);
    pet.energy = clamp(pet.energy - (6 + 7 * q), 0, 100);
    pet.hunger = clamp(pet.hunger - 3 * q, 0, 100);
    afterAction('play', q, 'happy', iconImg(ICON.play, 22), meta);
    playConfirm();
  }
  function applyPet(q) {
    pet.happiness = clamp(pet.happiness + 12 + 18 * q, 0, 100);
    pet.energy = clamp(pet.energy + 3, 0, 100);
    pet.hunger = clamp(pet.hunger + 2, 0, 100);
    afterAction('pet', q, 'happy', heartSVG(22));
    playConfirm();
  }
  function applyGuard(q, meta) {
    pet.safety = clamp(pet.safety + 18 + 32 * q, 0, 100);
    pet.happiness = clamp(pet.happiness + 2, 0, 100);
    afterAction('guard', q, 'energy', iconImg(ICON.safety, 22), meta);
    playConfirm();
  }

  function afterAction(key, quality, careAxis, iconHtml, meta) {
    meta ||= {};
    pet.cd[key] = Date.now() + COOLDOWN[key] * (0.35 + quality * 0.65);
    pet.tickets += meta.tickets || 0;
    pet.memories++;
    pet.activityCounts[key] = (pet.activityCounts[key] || 0) + quality;
    if (meta.complete && (meta.mistakes || 0) >= 2) pet.care.comeback += quality;
    // Stage progress from a quality action + branch tally
    if (quality > 0.35) {
      pet.stageActions++;
      pet.stageProgress += 0.6 + quality * 1.2;
      pet.care[careAxis] = (pet.care[careAxis] || 0) + (0.6 + quality);
    }
    if (allBalanced()) pet.care.balance = (pet.care.balance || 0) + 0.15 * quality;
    registerCareDay();
    pet.health = (pet.hunger + pet.happiness + pet.energy + pet.safety) / 4;
    pet._celebrateUntil = Date.now() + 1200;
    maybeEvolve();
    if (!pet._evolving) {
      lastMood = '';
      render();
    } else {
      const growth = document.getElementById('pet-growth-fill');
      if (growth && pet.stage < 3) growth.style.width = '100%';
      refreshAvatarIfMoodChanged();
      updateStats();
      updateCooldowns();
    }
    fx(iconHtml);
    showRewardReceipt(quality, meta.tickets || 0);
    showTip('cooldowns', 'CARE BANKED! THE CABINET RECHARGES WHILE ANOTHER GAME LIGHTS UP.');
    if (pet.stage < 3 && pet.stageProgress >= STAGE_THRESHOLD[pet.stage] * 0.5) {
      showTip('growth_half', 'YOUR MOBLING IS GROWING — KEEP CARING FOR IT TO REACH THE NEXT STAGE.');
    }
    schedulePersist();
  }

  function showRewardReceipt(quality, tickets) {
    const tank = document.getElementById('pet-tank');
    if (!tank) return;
    const receipt = document.createElement('div');
    receipt.className = 'pet-reward-receipt';
    receipt.innerHTML = `<b>${miniGrade(quality)}</b><span>+${tickets} TICKETS · +${Math.round(quality * 100)} CARE</span>`;
    tank.appendChild(receipt);
    setTimeout(() => receipt.remove(), 1600);
  }

  function allBalanced() {
    const lo = Math.min(pet.hunger, pet.happiness, pet.energy, pet.safety);
    const hi = Math.max(pet.hunger, pet.happiness, pet.energy, pet.safety);
    return lo > 55 && (hi - lo) < 28;
  }

  function registerCareDay() {
    const today = dayIndex(Date.now());
    const last = pet.streak.lastDay;
    if (today === last) return;
    if (today === last + 1) pet.streak.days++;
    else pet.streak.days = 1;
    pet.streak.lastDay = today;
  }

  // ══════════════════════════════════════
  //  EVOLUTION (sustained care quality gates each stage)
  // ══════════════════════════════════════
  function maybeEvolve() {
    if (pet.stage >= 3) return;
    const idx = pet.stage; // 0..2 uses STAGE_THRESHOLD[idx]
    if (pet.stageProgress >= STAGE_THRESHOLD[idx] && pet.stageActions >= STAGE_MIN_ACTIONS[idx]) evolve();
  }

  function evolve() {
    if (pet._evolving) return;
    pet._evolving = true;
    const bar = document.getElementById('pet-growth-fill');
    if (bar) {
      bar.style.width = '100%';
      bar.classList.add('complete');
    }
    setTimeout(finishEvolution, bar ? 220 : 0);
  }

  function finishEvolution() {
    pet.stage++;
    pet.stageProgress = 0;
    pet.stageActions = 0;
    pet._evolving = false;
    if (pet.stage === 3) {
      pet.form = decideForm();
      if (!pet.collected.includes(pet.form)) pet.collected.push(pet.form);
    }
    pet._celebrateUntil = Date.now() + 2600;
    playFanfare();
    lastMood = '';
    if (pet.stage === 1) renderPicker();
    else if (pet.stage === 3) renderEvolutionAnnouncement();
    else render();
    // celebratory burst
    for (let i = 0; i < 6; i++) setTimeout(() => fx(starSVG(18, i % 2 ? '#ffe61a' : '#fff')), i * 90);
    persist();
  }

  function renderEvolutionAnnouncement() {
    const host = document.getElementById('pet-wrap');
    if (!host || !pet.form) { render(); return; }
    const form = FORMS[pet.form];
    const tint = FORM_TINT[pet.form];
    const art = petSVG(3, pet.form, 'happy')
      .replace(/class="pet-stage-svg mood-happy"/, 'class="pet-evolution-svg"');
    host.innerHTML = `
      <button class="pet-evolution-screen" id="pet-evolution-screen" type="button" style="--form-tint:${tint.main};--form-glow:${tint.glow}">
        <div class="pet-evolution-glow"></div>
        <div class="pet-evolution-art">${art}</div>
        <div class="pet-evolution-title">YOUR MOBLING EVOLVED INTO ${form.name}!</div>
        <div class="pet-evolution-how">[${form.how}]</div>
        <div class="pet-evolution-skip">TAP TO CONTINUE</div>
      </button>`;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      render();
      for (let i = 0; i < 6; i++) setTimeout(() => fx(starSVG(18, i % 2 ? '#ffe61a' : tint.glow)), i * 90);
    };
    document.getElementById('pet-evolution-screen').onclick = finish;
    setTimeout(finish, 2500);
  }

  function decideForm() {
    const a = pet.activityCounts || { feed: 0, play: 0, rest: 0, guard: 0 };
    if ((pet.care.comeback || 0) >= 2.4) return 'ember';
    const variety = Math.min(a.feed || 0, a.play || 0, a.rest || 0, a.guard || 0) * 1.3;
    const joy = a.play || 0;
    const spark = ((a.rest || 0) + (a.guard || 0)) / 2;
    const entries = [['solara', joy], ['volt', spark], ['harmon', variety]];
    entries.sort((a, b) => b[1] - a[1]);
    // If nothing clearly dominates, call it balanced.
    if (entries[0][1] - entries[1][1] < 1.2) return 'harmon';
    return entries[0][0];
  }

  // ══════════════════════════════════════
  //  TICK LOOP
  // ══════════════════════════════════════
  function startTick() {
    stopTick();
    tickTimer = setInterval(() => {
      if (!pet || pet.dormant || pet.stage === 0) { schedulePersist(); return; }
      applyDecay(1 / 6, false);  // ~10s of real decay each tick
      pet.happinessSum += pet.happiness; pet.happinessCount++;
      pet.safetySum += pet.safety; pet.safetyCount++;
      pet.lastTick = Date.now();
      refreshAvatarIfMoodChanged();
      updateStats();
      if (Math.random() < 0.25) schedulePersist();
    }, 10000);
    cdTimer = setInterval(() => { if (pet) { updateCooldowns(); refreshAvatarIfMoodChanged(); } }, 500);
  }
  function stopTick() {
    clearInterval(tickTimer); tickTimer = null;
    clearInterval(cdTimer); cdTimer = null;
  }

  // ══════════════════════════════════════
  //  FX + SOUND
  // ══════════════════════════════════════
  function fx(iconHtml) {
    const tank = document.getElementById('pet-tank');
    if (!tank) return;
    const span = document.createElement('span');
    span.className = 'pet-fx';
    span.innerHTML = iconHtml;
    span.style.left = (40 + Math.random() * 40) + '%';
    span.style.top = '46%';
    tank.appendChild(span);
    setTimeout(() => span.remove(), 1000);
  }

  function petAudioMuted() {
    return typeof ArcadeMusic !== 'undefined' && ArcadeMusic.muted;
  }
  function playSound(key) {
    const src = SOUND_FILES[key];
    if (!src || petAudioMuted()) return;
    try {
      let audio = soundCache.get(src);
      if (!audio) { audio = new Audio(src); audio.preload = 'auto'; audio.volume = 0.72; soundCache.set(src, audio); }
      audio.pause(); audio.currentTime = 0;
      const p = audio.play();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {}
  }
  function playFanfare() {
    playSound('fanfare1');
    setTimeout(() => playSound('fanfare2'), 420);
  }

  // Space-flavored synth: triangle fundamental + a quiet sine octave (the same
  // "piano" voicing space.js uses), tuned to a C major pentatonic so every note
  // lands sweet — the "no wrong notes" idea the pads/scratch lean on.
  const PENTA = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25, 587.33, 659.25, 784.00, 880.00];
  function synthTone(freq, type, start, dur, vol, endFreq) {
    if (petAudioMuted()) return;
    try {
      if (typeof getAudioCtx !== 'function') return;
      const c = getAudioCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      const t0 = c.currentTime + Math.max(start || 0, 0.01);
      o.type = type || 'triangle';
      o.frequency.setValueAtTime(freq, t0);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t0); o.stop(t0 + dur + 0.02);
    } catch (e) {}
  }
  function petNote(freq, vol, dur, start) {
    vol = vol || 0.08; dur = dur || 0.16; start = start || 0;
    synthTone(freq, 'triangle', start, dur, vol, freq * 0.994);
    synthTone(freq * 2.01, 'sine', start + 0.002, dur * 0.42, vol * 0.26, freq * 1.99);
  }
  function pentaNote(i, vol, dur, start) {
    const n = PENTA.length;
    petNote(PENTA[((Math.round(i) % n) + n) % n], vol, dur, start);
  }
  // Little rising three-note arpeggio on a completed action.
  function playConfirm() {
    pentaNote(3, 0.08, 0.16, 0);
    pentaNote(5, 0.08, 0.16, 0.09);
    pentaNote(7, 0.09, 0.24, 0.18);
  }
  // Bright clean ping for a successful GUARD dodge — distinct from the
  // pentatonic confirm arpeggio, reads like a shield deflect.
  function playShieldPing() {
    synthTone(1046.5, 'sine', 0, 0.1, 0.07, 1400);
    synthTone(1568, 'sine', 0.02, 0.08, 0.04, 1800);
  }
  function playGuardChargeCue() {
    // Same two-step rising warning language as Space Mobe's Red attack.
    synthTone(132, 'sawtooth', 0, 0.16, 0.026, 176);
    synthTone(176, 'triangle', 0.23, 0.18, 0.03, 264);
  }

  // ══════════════════════════════════════
  //  POSITIVE RETURN MOMENTS + PRIZE SHELF
  // ══════════════════════════════════════
  window.petClaimMoment = function() {
    if (!pet || !pet.moments || !pet.moments.length) return;
    const moment = pet.moments.shift();
    pet.tickets += moment.tickets || 0;
    pet.happiness = clamp(pet.happiness + 5, 0, 100);
    pet.memories++;
    persist();
    render();
    playFanfare();
    fx(starSVG(22, '#ffe61a'));
    showTip(`moment_${moment.id}`, `SURPRISE OPENED · +${moment.tickets} TICKETS · NOTHING EXPIRES WHILE YOU’RE AWAY.`);
  };

  function prizeArt(key) {
    if (key === 'lamp') return starSVG(30, '#ffe61a');
    if (key === 'bed') return `<span class="pet-prize-glyph">☾</span>`;
    if (key === 'ball') return iconImg(ICON.play, 32);
    if (key === 'drone') return iconImg(ICON.safety, 32);
    if (key === 'crown') return `<span class="pet-prize-glyph">♛</span>`;
    return `<span class="pet-prize-glyph">☄</span>`;
  }

  window.petOpenPrizes = function() {
    const panel = document.getElementById('pet-prizes');
    if (!panel) return;
    openPanel = 'prizes';
    SFX && SFX.menuSelect && SFX.menuSelect();
    panel.innerHTML = `
      <div class="pet-prizes-title">PRIZE SHELF</div>
      <div class="pet-prizes-wallet">${pet.tickets} TICKETS · PLAY GAMES TO EARN MORE</div>
      <div class="pet-prizes-grid">
        ${Object.entries(PRIZES).map(([key, prize]) => {
          const owned = pet.unlocks.includes(key);
          const equipped = pet.equipped === key;
          const disabled = !owned && pet.tickets < prize.cost;
          return `<button class="pet-prize-cell ${owned ? 'owned' : ''} ${equipped ? 'equipped' : ''}" type="button"
              onclick="petChoosePrize('${key}')" ${disabled ? 'disabled' : ''}>
            <span class="pet-prize-art">${prizeArt(key)}</span>
            <b>${prize.name}</b>
            <small>${prize.how}</small>
            <em>${equipped ? 'IN ROOM' : owned ? 'EQUIP' : `${prize.cost} TICKETS`}</em>
          </button>`;
        }).join('')}
      </div>
      <button class="pet-dex-close" onclick="petClosePrizes()">◀ BACK TO PET</button>`;
    panel.classList.add('show');
    updateCooldowns();
  };

  window.petChoosePrize = function(key) {
    const prize = PRIZES[key];
    if (!prize) return;
    const owned = pet.unlocks.includes(key);
    if (!owned) {
      if (pet.tickets < prize.cost) return;
      pet.tickets -= prize.cost;
      pet.unlocks.push(key);
      playFanfare();
    } else {
      SFX && SFX.menuSelect && SFX.menuSelect();
    }
    pet.equipped = key;
    persist();
    render();
    window.petOpenPrizes();
  };

  window.petClosePrizes = function() {
    const panel = document.getElementById('pet-prizes');
    if (panel) panel.classList.remove('show');
    openPanel = null;
    SFX && SFX.menuSelect && SFX.menuSelect();
    updateCooldowns();
  };

  // ══════════════════════════════════════
  //  GENERATIONS — keep the grown form, raise another egg
  // ══════════════════════════════════════
  window.petOpenGeneration = function() {
    if (!pet || pet.stage !== 3) return;
    const panel = document.getElementById('pet-generation');
    if (!panel) return;
    openPanel = 'generation';
    panel.innerHTML = `
      <div class="pet-generation-art">${petSVG(3, pet.form, 'happy').replace(/class="pet-stage-svg mood-happy"/, 'class="pet-generation-svg"')}</div>
      <div class="pet-generation-kicker">HEADLINE COMPLETE</div>
      <div class="pet-generation-title">READY FOR A NEW EGG?</div>
      <p>${FORMS[pet.form].name} STAYS IN YOUR FORM DEX. TICKETS, PRIZES, DAYS TOGETHER, AND EVERY DISCOVERY CARRY FORWARD.</p>
      <div class="pet-generation-actions">
        <button class="pet-foot-btn" onclick="petCloseGeneration()">KEEP THIS MOBLING</button>
        <button class="pet-foot-btn alt" onclick="petConfirmGeneration()">START NEXT EGG ▶</button>
      </div>`;
    panel.classList.add('show');
    updateCooldowns();
  };

  window.petCloseGeneration = function() {
    const panel = document.getElementById('pet-generation');
    if (panel) panel.classList.remove('show');
    openPanel = null;
    updateCooldowns();
  };

  window.petConfirmGeneration = function() {
    if (!pet || pet.stage !== 3) return;
    const previous = pet;
    const next = newPet(previous.tag);
    next.familyStartedAt = previous.familyStartedAt;
    next.collected = [...previous.collected];
    next.tickets = previous.tickets;
    next.unlocks = [...previous.unlocks];
    next.equipped = previous.equipped;
    next.generations = (previous.generations || 0) + 1;
    next.memories = previous.memories || 0;
    next.tipsSeen = [...(previous.tipsSeen || [])];
    next.moments = [...(previous.moments || [])];
    pet = next;
    pickerState = { color: 'coral', shape: 'round' };
    lastMood = '';
    persist();
    render();
    playFanfare();
    startTick();
  };

  // ══════════════════════════════════════
  //  DEX (form gallery)
  // ══════════════════════════════════════
  window.petOpenDex = function() {
    const dex = document.getElementById('pet-dex');
    if (!dex) return;
    openPanel = 'dex';
    SFX && SFX.menuSelect && SFX.menuSelect();
    dex.innerHTML = `
      <div class="pet-dex-title">FORM DEX</div>
      <div class="pet-dex-grid">
        ${FORM_ORDER.map(f => {
          const got = pet.collected.includes(f);
          // Strip the absolutely-positioned/animated tank class so the portrait
          // sits inside its dex cell instead of floating to the tank center.
          const svg = petSVG(3, f, 'happy')
            .replace(/class="pet-stage-svg mood-happy"/, 'class="pet-dex-svg"')
            .replace('width="100%"', 'width="76" height="76"');
          return `<div class="pet-dex-cell ${got ? '' : 'locked'}">
            <div class="pet-dex-art">${got ? svg : lockSVG(34)}</div>
            <div class="pet-dex-name">${got ? FORMS[f].name : '???'}</div>
            <div class="pet-dex-how">${FORMS[f].how}</div>
          </div>`;
        }).join('')}
      </div>
      <div class="pet-dex-summary">RAISED ${pet.collected.length}/4 FORMS · ${pet.generations} COMPLETED GENERATIONS</div>
      <button class="pet-dex-close" onclick="petCloseDex()">◀ BACK TO PET</button>`;
    dex.classList.add('show');
    updateCooldowns();
  };
  window.petCloseDex = function() {
    const dex = document.getElementById('pet-dex');
    if (dex) dex.classList.remove('show');
    openPanel = null;
    SFX && SFX.menuSelect && SFX.menuSelect();
    updateCooldowns();
  };

  // ══════════════════════════════════════
  //  STATUS — auto-saving standing screen (no name entry)
  // ══════════════════════════════════════
  function lifetimeHappyAvg() {
    if (!pet.happinessCount) return Math.round(pet.happiness);
    return pet.happinessSum / pet.happinessCount;
  }
  function lifetimeSafetyAvg() {
    if (!pet.safetyCount) return Math.round(pet.safety);
    return pet.safetySum / pet.safetyCount;
  }
  function composeScore() {
    const happy = clamp(Math.round(lifetimeHappyAvg()), 0, 99);
    return (daysTogether() * 100) + (pet.stage * 200) + (pet.collected.length * 500) +
      (pet.memories * 25) + (pet.unlocks.length * 100) + happy;
  }

  function statMini(iconHtml, val, cls) {
    const v = clamp(Math.round(val), 0, 100);
    const health = cls === 'f-health';
    return `<div class="pet-stat-row ${health ? 'pet-stat-health' : ''}"><div class="pet-stat-icon">${iconHtml}</div>
      ${health ? '<span class="pet-stat-overall">OVERALL</span>' : ''}
      <div class="pet-stat-track"><div class="pet-stat-fill ${cls}" style="width:${v}%"></div></div>
      <div class="pet-stat-val">${v}</div></div>`;
  }

  // Auto-save (no name-entry gate): local cache always, remote best-effort,
  // both keyed by the shared player tag.
  async function autoSaveScore(score, extra) {
    const tag = (window.PlayerID && PlayerID.get && PlayerID.get()) || 'GUEST';
    try { if (typeof LB !== 'undefined') LB.add(BOARD_KEY, tag, score, extra, false); } catch (e) {}
    let remote = false;
    try {
      if (typeof RemoteLB !== 'undefined' && RemoteLB.submit) remote = await RemoteLB.submit(BOARD_KEY, tag, score, 0, extra);
    } catch (e) {}
    return { tag, remote };
  }

  window.petStatus = function() {
    if (!pet) return;
    SFX && SFX.menuSelect && SFX.menuSelect();
    stopTick();
    const host = document.getElementById('pet-wrap');
    if (!host) return;
    const score = composeScore();
    const formName = pet.stage === 3 && pet.form ? FORMS[pet.form].name : STAGE_NAMES[pet.stage];
    const together = daysTogether();
    const extra = `${formName} · ${together}D`;
    const happyAvg = clamp(Math.round(lifetimeHappyAvg()), 0, 99);
    const safetyAvg = clamp(Math.round(lifetimeSafetyAvg()), 0, 99);
    const tendingForm = pet.stage >= 1 && pet.stage <= 2 ? decideForm() : null;
    const tendency = tendingForm ? FORMS[tendingForm] : null;
    const tendencyTint = tendingForm ? FORM_TINT[tendingForm].main : '';
    const bg = petSVG(pet.stage, pet.form, 'happy').replace(/class="pet-stage-svg mood-happy"/, 'class="pet-status-svg"');
    document.body.classList.add('arcade-selection-open');
    setArcadeExitVisible && setArcadeExitVisible(false);
    host.innerHTML = `
      <div class="pet-status-card">
        <div class="pet-status-bg">${bg}</div>
        <div class="pet-status-inner">
          <div class="pet-status-marquee">STATUS</div>
          <div class="pet-status-score-label">CARE SCORE</div>
          <div class="pet-status-score">${score}</div>
          <div class="pet-status-sub">${formName} · ${together} DAYS TOGETHER · ${pet.tickets} TICKETS</div>
          <div class="pet-status-stats">
            ${statMini(iconImg(ICON.hunger, 16), pet.hunger, 'f-hunger')}
            ${statMini(heartSVG(15), pet.happiness, 'f-happy')}
            ${statMini(iconImg(ICON.energy, 16), pet.energy, 'f-energy')}
            ${statMini(iconImg(ICON.safety, 16), pet.safety, 'f-safety')}
            ${statMini(iconImg(ICON.health, 16), pet.health, 'f-health')}
          </div>
          ${tendency ? `<div class="pet-status-tendency">TRENDING TOWARD: <b style="color:${tendencyTint}">${tendency.name}</b><span>${tendency.how}</span></div>` : ''}
          <div class="pet-status-meta">JOY AVG ${happyAvg} · COURAGE AVG ${safetyAvg} · FORMS ${pet.collected.length}/4 · GENERATIONS ${pet.generations}</div>
          <div class="pet-status-saved" id="pet-status-saved">SAVING…</div>
          <div class="pet-status-btns">
            <button class="pet-foot-btn" onclick="petResume()">◀ BACK TO PET</button>
            <button class="pet-foot-btn alt" onclick="nav('lobby')">ARCADE MENU</button>
          </div>
        </div>
      </div>`;
    autoSaveScore(score, extra).then(() => {
      const el = document.getElementById('pet-status-saved');
      if (el) el.textContent = 'SAVED';
    });
  };

  window.petResume = function() {
    SFX && SFX.menuSelect && SFX.menuSelect();
    document.body.classList.remove('arcade-selection-open');
    setArcadeExitVisible && setArcadeExitVisible(true);
    catchUp();
    lastMood = '';
    render();
    startTick();
  };

  function escapeHtml(s) {
    return String(s || '').replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  }

  // ══════════════════════════════════════
  //  ENTRY / EXIT (nav glue)
  // ══════════════════════════════════════
  window.initPet = function() {
    ensurePet();
    catchUp();
    document.body.classList.remove('arcade-selection-open');
    setArcadeExitVisible && setArcadeExitVisible(true);
    setArcadeModeSelect && setArcadeModeSelect(false);
    lastMood = '';
    render();
    startTick();
  };

  window.petBack = function() {
    stopTick();
    endMini();
    if (pet) { pet.lastTick = Date.now(); persist(); }
    document.body.classList.remove('arcade-selection-open');
  };

  // Save on tab hide so long-gap catch-up has an accurate lastTick.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && pet) { pet.lastTick = Date.now(); persist(); }
  });
})();
