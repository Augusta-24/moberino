// ══════════════════════════════════════
//  PET MOBE — original virtual pet (Tamagotchi loop + Bitzee touches)
// ══════════════════════════════════════
// Self-contained IIFE mirroring snoob.js / signal.js. Exposes window.initPet
// (nav-in) and window.petBack (nav-out). One "species" — the MOBLING — hatched
// from an egg, grown through baby -> juvenile -> adult, branching into one of
// four collectible adult forms based on how it was raised.
//
// Design decisions (see PR/commit notes):
//  - Accent: coral/pink #ff6ec7 (previously unclaimed neon slot).
//  - NO permanent death. Sustained neglect sends the pet to a recoverable
//    "wandered off" dormant state; a short care streak brings it back, and it
//    loses only its progress toward the CURRENT evolution stage, never the save
//    or forms already collected.
//  - Four adult forms: SOLARA (happiness-led), VOLT (energy-led),
//    HARMON (balanced care), EMBER (raised back from neglect).
//  - Five stats: Hunger, Happiness, Energy, Safety (each with its own action +
//    mini-game), plus Health, derived from the weakest of the other four.
//  - Every mini-game is an objective to clear (goal-based), not a timer — it
//    ramps in difficulty as the pet grows from baby -> juvenile -> adult.
//  - Icons are the existing arcade `projectiles/*.png` asset bank (no emoji);
//    the one glyph with no matching asset (a heart, for Happiness/PET) is
//    drawn as an inline SVG shape, same as everything else in the arcade.
(function() {
  const COLOR = '#ff6ec7';
  const BOARD_KEY = 'pet';
  const SAVE_KEY = 'moberino-pet-v1';

  // ── Tunables (playtest-adjust; kept modest so evolution is observable) ──
  const DECAY = { hunger: 0.55, happiness: 0.48, energy: 0.42, safety: 0.50 };   // per real minute
  const MAX_GAP_MIN = 60 * 24 * 3;   // cap catch-up decay at ~3 days of absence
  const STAGE_NAMES = ['EGG', 'BABY', 'JUVENILE', 'ADULT'];
  const STAGE_THRESHOLD = [5, 10, 16];   // care-progress needed to leave egg / baby / juvenile
  const STAGE_MIN_ACTIONS = [4, 6, 8];   // soft gate so evolution never fires on one big tick
  const COOLDOWN = { feed: 20000, play: 20000, rest: 24000, pet: 13000, guard: 22000 };
  const DORMANT_RECOVERY = 4;            // care actions to wake a wandered pet
  const MOOD_TAGS = {
    idle: 'CONTENT', happy: 'HAPPY!', hungry: 'HUNGRY', tired: 'SLEEPY',
    sick: 'NOT WELL', alert: 'ON GUARD', celebrate: 'YAY!', dormant: 'WANDERED OFF',
  };

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
    ember:  { name: 'EMBER',  how: 'BROUGHT BACK FROM NEGLECT' },
  };
  const FORM_ORDER = ['solara', 'volt', 'harmon', 'ember'];

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
  const JUNK = ['projectiles/junk_duck.png', 'projectiles/junk_boot.png', 'projectiles/junk_basketball.png', 'projectiles/junk_trashcan.png'];
  const REST_ICONS = ['projectiles/piano.png', 'projectiles/guitar.png', 'projectiles/saxophone.png'];

  // Per-stage mini-game objectives — accomplished, not timed. Ramp up as the
  // pet grows; baby is doable, not trivial.
  const GOALS = {
    feed:  { 1: 10, 2: 15, 3: 20 },
    play:  { 1: 10, 2: 15, 3: 20 },
    rest:  { 1: 8, 2: 12, 3: 16 },
    pet:   { 1: 1, 2: 1, 3: 1 },      // always a full clear
    guard: { 1: 8, 2: 12, 3: 16 },
  };
  // Foil grid size scales with stage too, so a full (100%) clear stays a real
  // objective rather than a shrinking target.
  const FOIL_GRID = { 1: { cols: 8, rows: 9 }, 2: { cols: 9, rows: 10 }, 3: { cols: 10, rows: 10 } };
  // FEED: real ship-scroller pacing — the basket eases toward the drag point
  // (capped speed, not an instant teleport) and obstacles spawn in patterns
  // (walls with a gap, sweeps, scatters) instead of one uniform random drop,
  // so camping in the middle no longer wins passively.
  const FEED_TUNE  = { 1: { vyMin: 24, vyMax: 34, junk: 0.25, gap: 950, shipSpeed: 230 }, 2: { vyMin: 30, vyMax: 42, junk: 0.32, gap: 820, shipSpeed: 230 }, 3: { vyMin: 36, vyMax: 50, junk: 0.40, gap: 700, shipSpeed: 230 } };
  const PLAY_TUNE  = { 1: { popGap: 680 }, 2: { popGap: 560 }, 3: { popGap: 460 } };
  // GUARD: the enemy actively patrols (drifts side to side) at all times —
  // it stops to charge wherever it currently is, then fires straight down
  // from there. The ship (dragged along a bottom track) has the charge+
  // travel window to read the enemy's position and move off that line.
  const GUARD_TUNE = {
    1: { driftSpeed: 26, telegraph: 750, strike: 380, gap: 700, tol: 8 },
    2: { driftSpeed: 34, telegraph: 620, strike: 340, gap: 600, tol: 7 },
    3: { driftSpeed: 42, telegraph: 520, strike: 300, gap: 500, tol: 6 },
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
      lastTick: now,
      stage: 0,                 // 0 egg, 1 baby, 2 juvenile, 3 adult
      form: null,
      colorChoice: 'coral',     // defaults render the egg before hatch customization
      shape: 'round',
      sawIntro: true,           // retired; retained only for save compatibility
      tipsSeen: [],
      hunger: 100, happiness: 100, energy: 100, safety: 100, health: 100,
      stageProgress: 0,         // care-quality accumulated toward next stage
      stageActions: 0,          // beneficial actions this stage
      care: { happy: 0, energy: 0, balance: 0 },  // branch tallies (adult decision)
      happinessSum: 0, happinessCount: 0,          // lifetime averages
      safetySum: 0, safetyCount: 0,
      streak: { days: 1, lastDay: dayIndex(now) },
      collected: [],            // forms reached (dex)
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
      pet.streak ||= { days: 1, lastDay: dayIndex(Date.now()) };
      pet.cd ||= { feed: 0, play: 0, rest: 0, pet: 0, guard: 0 };
      if (pet.cd.guard == null) pet.cd.guard = 0;
      pet.collected ||= [];
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
    if (pet.stage === 0) return; // eggs don't starve while you're away
    if (pet.dormant) return;     // already wandered — nothing left to decay
    applyDecay(gap, true);
  }

  function applyDecay(minutes, isGap) {
    pet.hunger = clamp(pet.hunger - DECAY.hunger * minutes, 0, 100);
    pet.happiness = clamp(pet.happiness - DECAY.happiness * minutes, 0, 100);
    pet.energy = clamp(pet.energy - DECAY.energy * minutes, 0, 100);
    pet.safety = clamp(pet.safety - DECAY.safety * minutes, 0, 100);
    // Health trends toward the weakest stat: running low actually hurts it.
    const weakest = Math.min(pet.hunger, pet.happiness, pet.energy, pet.safety);
    if (weakest < 22) pet.health = clamp(pet.health - (22 - weakest) * 0.12 * minutes, 0, 100);
    else pet.health = clamp(pet.health + 1.4 * minutes, 0, 100);
    // Lifetime averages sampled on the gap too (weighted lightly).
    if (isGap) {
      pet.happinessSum += pet.happiness; pet.happinessCount += Math.min(minutes / 5, 6);
      pet.safetySum += pet.safety; pet.safetyCount += Math.min(minutes / 5, 6);
    }
    // Neglect check: bottomed out AND unhealthy -> wander off (recoverable).
    if (!pet.dormant && pet.health <= 0 && weakest <= 4) enterDormant();
  }

  function enterDormant() {
    if (pet.dormant) return;
    pet.dormant = true;
    pet.wasDormant = true;
    pet.recovery = 0;
    // Losing progress toward the CURRENT stage only — save + forms are kept.
    pet.stageProgress = 0;
    pet.stageActions = 0;
    playSound('whoosh');
  }

  function wakeFromDormant() {
    pet.dormant = false;
    pet.recovery = 0;
    pet.hunger = 55; pet.happiness = 55; pet.energy = 55; pet.safety = 55; pet.health = 55;
    pet.lastTick = Date.now();
    playFanfare();
    fx(heartSVG(22));
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ── Mood derivation ──
  function currentMood() {
    if (pet.dormant) return 'dormant';
    if (pet.stage === 0) return 'idle';
    if (pet._celebrateUntil && Date.now() < pet._celebrateUntil) return 'celebrate';
    if (pet.health < 30) return 'sick';
    if (pet.hunger < 28) return 'hungry';
    if (pet.safety < 28) return 'alert';
    if (pet.energy < 28) return 'tired';
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
      <g class="pet-rest-node" data-note="${note.deg}" tabindex="-1">
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

  // ══════════════════════════════════════
  //  RENDER
  // ══════════════════════════════════════
  function render() {
    const host = document.getElementById('pet-wrap');
    if (!host) return;
    const mood = currentMood();
    const stageLabel = pet.stage === 3 && pet.form ? FORMS[pet.form].name : STAGE_NAMES[pet.stage];
    host.innerHTML = `
      <div class="pet-shell">
        <div class="pet-topbar">
          <div class="pet-name-block">
            <div class="pet-name" id="pet-name">${escapeHtml(pet.name)}</div>
            <div class="pet-stage-label">${stageLabel} · MOBLING</div>
          </div>
          <div class="pet-streak">STREAK<b id="pet-streak">${pet.streak.days}</b>DAYS</div>
        </div>

        <div class="pet-tank" id="pet-tank">
          <div class="pet-tank-rail"></div>
          <div class="pet-tank-stars" id="pet-tank-stars">${starsSVG()}</div>
          <div class="pet-tank-floor"></div>
          <div class="pet-tank-mood-tag" id="pet-mood-tag">${MOOD_TAGS[mood]}</div>
          ${growthProgress()}
          ${pet.stage === 1 && pet.stageActions < 6 ? '<div class="pet-goal-copy">RAISE YOUR MOBLING TO ADULTHOOD — HOW YOU CARE FOR IT DECIDES WHAT IT BECOMES</div>' : ''}
          <div id="pet-avatar">${petSVG(pet.stage, pet.form, mood)}</div>
          <div class="pet-mini" id="pet-mini"></div>
          <div class="pet-dex" id="pet-dex"></div>
        </div>

        ${pet.dormant ? dormantNote() : ''}

        <div class="pet-tip-slot" id="pet-tip-slot"></div>
        <div class="pet-stats">
          ${statRow('hunger', iconImg(ICON.hunger, 17), 'f-hunger')}
          ${statRow('happiness', heartSVG(16), 'f-happy')}
          ${statRow('energy', iconImg(ICON.energy, 17), 'f-energy')}
          ${statRow('safety', iconImg(ICON.safety, 17), 'f-safety')}
          ${statRow('health', iconImg(ICON.health, 17), 'f-health')}
        </div>

        <div class="pet-actions">
          ${actBtn('feed', iconImg(ICON.hunger, 22), 'FEED')}
          ${actBtn('play', iconImg(ICON.play, 22), 'PLAY')}
          ${actBtn('rest', iconImg(ICON.energy, 22), 'REST')}
          ${actBtn('pet', heartSVG(20), 'PET')}
          ${actBtn('guard', iconImg(ICON.safety, 22), 'GUARD')}
        </div>

        <div class="pet-footer">
          <button class="pet-foot-btn" onclick="petOpenDex()">FORM DEX</button>
          <button class="pet-foot-btn alt" onclick="petStatus()">STATUS</button>
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
      showTip('care_intro', "KEEP YOUR MOBLING'S STATS UP — TAP AN ACTION WHEN A BAR RUNS LOW.");
    };
  }

  function dormantNote() {
    return `<div class="pet-dormant-note">YOUR MOBLING WANDERED OFF FROM NEGLECT.<br>KEEP CARING FOR IT — ${pet.recovery}/${DORMANT_RECOVERY} — TO COAX IT BACK.</div>`;
  }

  function statRow(key, iconHtml, cls) {
    return `
      <div class="pet-stat-row">
        <div class="pet-stat-icon">${iconHtml}</div>
        <div class="pet-stat-track"><div class="pet-stat-fill ${cls}" id="pet-fill-${key}"></div></div>
        <div class="pet-stat-val" id="pet-val-${key}">0</div>
      </div>`;
  }

  function actBtn(key, iconHtml, label) {
    return `
      <button class="pet-act-btn" id="pet-act-${key}" data-act="${key}">
        <span class="pet-act-icon">${iconHtml}</span>
        <span>${label}</span>
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
    const streak = document.getElementById('pet-streak');
    if (streak) streak.textContent = pet.streak.days;
    const tank = document.getElementById('pet-tank');
    if (tank) tank.classList.toggle('mood-bright', currentMood() === 'happy' || currentMood() === 'celebrate');
    const low = [['hunger', 'feed', 'HUNGRY', 'FEED'], ['happiness', 'pet', 'LONELY', 'PET'], ['energy', 'rest', 'TIRED', 'REST'], ['safety', 'guard', 'UNSAFE', 'GUARD']]
      .find(([stat]) => pet[stat] < 30);
    document.querySelectorAll('.pet-act-btn').forEach(btn => btn.classList.toggle('needs-care', !!low && pet.stageActions < 5 && btn.dataset.act === low[1]));
    if (low) showTip('low_stat', `YOUR MOBLING IS ${low[2]} — TRY ${low[3]}!`);
  }

  function refreshAvatarIfMoodChanged() {
    const mood = currentMood();
    if (mood === lastMood) return;
    lastMood = mood;
    const av = document.getElementById('pet-avatar');
    if (av) av.innerHTML = petSVG(pet.stage, pet.form, mood);
  }

  function updateCooldowns() {
    const now = Date.now();
    ['feed', 'play', 'rest', 'pet', 'guard'].forEach(key => {
      const btn = document.getElementById(`pet-act-${key}`);
      const bar = document.getElementById(`pet-cd-${key}`);
      if (!btn || !bar) return;
      const until = pet.cd[key] || 0;
      const remain = until - now;
      if (remain > 0) {
        btn.disabled = true;
        bar.style.width = (100 * remain / COOLDOWN[key]) + '%';
      } else {
        btn.disabled = !!mini;
        bar.style.width = '0%';
      }
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

  // Each action is a compact mini modeled on one of the other arcade games.
  // Every mini is goal-based (accomplished, not timed) and ramps by stage.
  function startAction(key) {
    if (mini || onCooldown(key)) return;
    document.querySelectorAll('.pet-act-btn').forEach(btn => btn.classList.remove('needs-care'));
    if (pet.stage === 0) { hatchTap(); return; }
    if (key === 'feed') miniCatch();        // SPACE — slide-bar catcher, dodge junk food
    else if (key === 'play') miniWhack();   // WHACK — bop the popping toys
    else if (key === 'rest') miniPads();    // SIGNAL — pentatonic lullaby pads
    else if (key === 'pet') miniScratch();  // holographic scratch-off foil
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
    if (pet.stageProgress >= STAGE_THRESHOLD[0] && pet.stageActions >= STAGE_MIN_ACTIONS[0]) evolve();
    else schedulePersist();
  }

  function miniEl() { return document.getElementById('pet-mini'); }

  function endMini() {
    const el = miniEl();
    if (mini) {
      if (mini.raf) cancelAnimationFrame(mini.raf);
      if (mini.timer) clearTimeout(mini.timer);
      if (mini.iv) clearInterval(mini.iv);
    }
    if (el) { el.classList.remove('show'); el.innerHTML = ''; el.onpointerdown = el.onpointermove = el.onpointerup = el.onpointercancel = null; }
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
  function completeMini(title, applyFn) {
    if (mini) {
      if (mini.raf) cancelAnimationFrame(mini.raf);
      if (mini.timer) clearTimeout(mini.timer);
      if (mini.iv) clearInterval(mini.iv);
      mini.raf = 0; mini.timer = 0; mini.iv = 0;
    }
    const el = miniEl();
    if (el) {
      el.onpointerdown = el.onpointermove = el.onpointerup = el.onpointercancel = null;
      el.innerHTML = `<div class="pet-mini-complete">
        <div class="pet-mini-complete-check">${heartSVG(40, '#33ff99')}</div>
        <div class="pet-mini-complete-text">${title}</div>
      </div>`;
    }
    playConfirm();
    setTimeout(() => { endMini(); applyFn(1); }, 520);
  }

  function flashTank(kind) {
    const tank = document.getElementById('pet-tank');
    if (!tank) return;
    tank.classList.add(kind === 'bad' ? 'flash-bad' : 'flash-good');
    setTimeout(() => tank.classList.remove(kind === 'bad' ? 'flash-bad' : 'flash-good'), 220);
  }

  // ── FEED · Space-flavored: slide-bar basket, catch food, dodge junk ──
  function miniCatch() {
    const el = miniEl();
    if (!el) return;
    const goal = GOALS.feed[stageIdx()];
    const tune = FEED_TUNE[stageIdx()];
    el.innerHTML = `
      <div class="pet-mini-title">SNACK RUN</div>
      <div class="pet-mini-hint">WEAVE THE TRAY THROUGH THE GAPS — DODGE THE JUNK</div>
      <div class="pet-catch-field" id="pet-catch-field">
        <div class="pet-feed-track" id="pet-feed-track"><div class="pet-feed-basket" id="pet-feed-basket"></div></div>
      </div>
      <div class="pet-mini-count"><span id="pet-catch-n">0</span>/${goal} FED</div>`;
    el.classList.add('show');
    const field = document.getElementById('pet-catch-field');
    const track = document.getElementById('pet-feed-track');
    const basket = document.getElementById('pet-feed-basket');
    const nEl = document.getElementById('pet-catch-n');
    mini = { key: 'feed', good: 0, goal, items: [], raf: 0, prev: performance.now(), lastSpawn: 0, basketX: 50, targetX: 50 };
    function setTargetX(clientX) {
      const rect = track.getBoundingClientRect();
      mini.targetX = clamp(((clientX - rect.left) / rect.width) * 100, 6, 94);
    }
    track.onpointerdown = (e) => { e.preventDefault(); setTargetX(e.clientX); };
    track.onpointermove = (e) => setTargetX(e.clientX);
    field.onpointerdown = (e) => setTargetX(e.clientX);
    field.onpointermove = (e) => { if (mini) setTargetX(e.clientX); };
    function spawnItem(x, vy, bad, delayOffset) {
      const span = document.createElement('img');
      span.src = bad ? JUNK[Math.floor(Math.random() * JUNK.length)] : ICON.hunger;
      span.className = 'pet-catch-item' + (bad ? ' is-junk' : '');
      span.draggable = false;
      const y0 = -14 - (delayOffset || 0);
      span.dataset.x = String(x);
      span.dataset.y = String(y0);
      span.dataset.vy = String(vy);
      span.style.left = x + '%';
      span.style.top = y0 + '%';
      span._bad = bad;
      field.appendChild(span);
      mini.items.push(span);
    }
    // Real patterns instead of one uniform random drop each tick — a wall
    // with a single gap to thread, a diagonal sweep to weave through, or a
    // scatter of spaced-out picks. Standing still no longer wins.
    function spawnWave() {
      const vy = tune.vyMin + Math.random() * (tune.vyMax - tune.vyMin);
      const pattern = Math.floor(Math.random() * 3);
      if (pattern === 0) {
        const gapX = 14 + Math.random() * 66;
        for (let x = 9; x <= 91; x += 12.5) {
          if (Math.abs(x - gapX) < 8) continue;
          spawnItem(x, vy, true, 0);
        }
        spawnItem(gapX, vy, false, 0);
      } else if (pattern === 1) {
        const n = 5;
        for (let i = 0; i < n; i++) {
          const x = 10 + (i / (n - 1)) * 80;
          spawnItem(x, vy, i % 2 === 1 && Math.random() < 0.75, i * 80);
        }
      } else {
        const n = 3 + Math.floor(Math.random() * 2);
        const used = [];
        for (let i = 0; i < n; i++) {
          let x; do { x = 8 + Math.random() * 84; } while (used.some(u => Math.abs(u - x) < 12));
          used.push(x);
          spawnItem(x, vy, Math.random() < tune.junk, 0);
        }
      }
    }
    function loop(now) {
      if (!mini || mini.key !== 'feed') return;
      const dt = Math.min(0.05, (now - mini.prev) / 1000 || 0.016);
      mini.prev = now;
      // Ship-like eased movement toward the drag point — capped speed, not
      // an instant teleport, so the tray has real weight to it.
      const dx = mini.targetX - mini.basketX;
      const maxStep = tune.shipSpeed * dt;
      mini.basketX += clamp(dx, -maxStep, maxStep);
      basket.style.left = mini.basketX + '%';
      if (now - mini.lastSpawn > tune.gap) { spawnWave(); mini.lastSpawn = now; }
      mini.items.forEach(s => {
        if (s._done || !s.isConnected) return;
        const y = parseFloat(s.dataset.y) + parseFloat(s.dataset.vy) * dt;
        s.dataset.y = String(y);
        s.style.top = y + '%';
        if (y >= 82 && y < 98 && Math.abs(parseFloat(s.dataset.x) - mini.basketX) < 7.5) {
          s._done = true;
          if (s._bad) {
            mini.good = Math.max(0, mini.good - 1);
            playSound('miss');
            flashTank('bad');
            miniToast('JUNK! −1', 'bad');
          } else {
            mini.good++;
            pentaNote(mini.good + 2, 0.09);
            miniToast('+1 FED', 'good');
          }
          if (nEl) nEl.textContent = mini.good;
          s.classList.add('caught');
          setTimeout(() => s.remove(), 160);
          if (mini.good >= mini.goal) { completeMini('SNACK RUN CLEAR!', applyFeed); return; }
        } else if (y > 104) {
          s._done = true; s.remove();
        }
      });
      mini.raf = requestAnimationFrame(loop);
    }
    mini.raf = requestAnimationFrame(loop);
  }

  // ── PLAY · Whack-flavored: a toy pops up, bop it in its window ──
  function miniWhack() {
    const el = miniEl();
    if (!el) return;
    const SPOTS = 6;
    const goal = GOALS.play[stageIdx()];
    const tune = PLAY_TUNE[stageIdx()];
    el.innerHTML = `
      <div class="pet-mini-title">PLAYTIME!</div>
      <div class="pet-mini-hint">BOP THE TOYS!</div>
      <div class="pet-whack-grid" id="pet-whack-grid">${Array.from({ length: SPOTS }, () =>
        `<button class="pet-whack-hole" type="button"><span class="pet-whack-toy">${iconImg(ICON.play, 30)}</span></button>`).join('')}</div>
      <div class="pet-mini-count"><span id="pet-whack-n">0</span>/${goal} BOPS</div>`;
    el.classList.add('show');
    mini = { key: 'play', hits: 0, goal, iv: 0, timer: 0 };
    const holes = [...el.querySelectorAll('.pet-whack-hole')];
    const nEl = document.getElementById('pet-whack-n');
    holes.forEach(h => h.onpointerdown = (e) => {
      e.preventDefault();
      if (!mini || !h.classList.contains('up')) return;
      h.classList.remove('up');
      h.classList.add('bonk');
      setTimeout(() => h.classList.remove('bonk'), 150);
      mini.hits++;
      if (nEl) nEl.textContent = mini.hits;
      pentaNote(mini.hits + 3, 0.09);
      miniToast('+1 BOP', 'good');
      if (mini.hits >= mini.goal) { completeMini('PLAYTIME CLEAR!', applyPlay); return; }
    });
    function pop() {
      holes.forEach(h => h.classList.remove('up'));
      const i = Math.floor(Math.random() * holes.length);
      holes[i].classList.add('up');
    }
    pop();
    mini.iv = setInterval(pop, tune.popGap);
  }

  // ── REST · Signal's actual note-constellation ──
  // Three bands (LOW/MID/HIGH), each a row of connected hex nodes carrying
  // its own note — tap any node to play it. Nodes stay tappable repeatedly
  // (this is the calm one; no falling, no pressure, just build the loop).
  function miniPads() {
    const el = miniEl();
    if (!el) return;
    const goal = GOALS.rest[stageIdx()];
    el.innerHTML = `
      <div class="pet-mini-title">SIGNAL LULLABY</div>
      <div class="pet-mini-hint">TAP THE NODES · NO WRONG NOTES</div>
      <div class="pet-rest-board" id="pet-rest-board">
        ${REST_BANDS.map(b => `
          <div class="pet-rest-band-row">
            <div class="pet-rest-band-label" style="color:${b.color}">${b.label}</div>
            <div class="pet-rest-band-svg">${bandSVG(b.degs.map(d => ({ deg: d, letter: NOTE_LETTERS[d] })), b.color)}</div>
          </div>`).join('')}
      </div>
      <div class="pet-mini-count"><span id="pet-rest-n">0</span>/${goal} NOTES</div>`;
    el.classList.add('show');
    mini = { key: 'rest', notes: 0, goal };
    const nEl = document.getElementById('pet-rest-n');
    el.querySelectorAll('.pet-rest-node').forEach(node => {
      node.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (!mini) return;
        const deg = +node.dataset.note;
        pentaNote(deg, 0.11, 0.45);
        node.classList.add('hit');
        setTimeout(() => node.classList.remove('hit'), 260);
        mini.notes++;
        if (nEl) nEl.textContent = mini.notes;
        miniToast('+1 NOTE', 'good');
        if (mini.notes >= mini.goal) { completeMini('LULLABY CLEAR!', applyRest); return; }
      });
    });
  }

  // ── PET · holographic scratch-off: rub the foil off to reveal the love ──
  function miniScratch() {
    const el = miniEl();
    if (!el) return;
    const { cols: COLS, rows: ROWS } = FOIL_GRID[stageIdx()];
    const TOTAL = COLS * ROWS;
    const goal = GOALS.pet[stageIdx()];
    el.innerHTML = `
      <div class="pet-mini-title">SCRATCH & PET</div>
      <div class="pet-mini-hint">RUB OFF THE FOIL TO REVEAL THE LOVE</div>
      <div class="pet-scratch" id="pet-scratch">
        <div class="pet-scratch-reveal">${heartSVG(64)}</div>
        <div class="pet-foil" id="pet-foil" style="grid-template-columns:repeat(${COLS},1fr)">${
          Array.from({ length: TOTAL }, () => `<i class="pet-foil-cell"></i>`).join('')}</div>
      </div>
      <div class="pet-mini-count"><span id="pet-scratch-n">0</span>% CLEARED</div>`;
    el.classList.add('show');
    const nEl = document.getElementById('pet-scratch-n');
    mini = { key: 'pet', cleared: 0, total: TOTAL, goal, down: false, lastNote: 0 };
    function clearAt(x, y) {
      const cell = document.elementFromPoint(x, y);
      if (!cell || !cell.classList || !cell.classList.contains('pet-foil-cell') || cell._gone) return;
      cell._gone = true;
      cell.classList.add('gone');
      mini.cleared++;
      if (nEl) nEl.textContent = Math.round(100 * mini.cleared / mini.total);
      const now = performance.now();
      if (now - mini.lastNote > 65) { pentaNote(mini.cleared + 2, 0.06, 0.14); mini.lastNote = now; }
      if (mini.cleared / mini.total >= goal) { completeMini('ALL CLEARED!', applyPet); return; }
    }
    el.onpointerdown = (e) => { e.preventDefault(); if (mini) { mini.down = true; clearAt(e.clientX, e.clientY); } };
    el.onpointermove = (e) => { if (mini && mini.down) clearAt(e.clientX, e.clientY); };
    const up = () => { if (mini) mini.down = false; };
    el.onpointerup = up;
    el.onpointercancel = up;
  }

  // ── GUARD · Space red-enemy flavored: an actual ship dodge ──
  // The enemy actively patrols (never sits still) — it stops wherever it
  // currently is to charge up, then fires straight down from there. The
  // Mobling rides a bottom track (drag it, same feel as FEED's tray) and has
  // the whole charge+travel window to read the enemy's position and move.
  function miniGuard() {
    const el = miniEl();
    if (!el) return;
    const goal = GOALS.guard[stageIdx()];
    const tune = GUARD_TUNE[stageIdx()];
    el.innerHTML = `
      <div class="pet-mini-title">ON GUARD</div>
      <div class="pet-mini-hint">WATCH IT PATROL — DODGE WHERE IT STOPS TO FIRE</div>
      <div class="pet-guard-field" id="pet-guard-field">
        <span class="pet-guard-enemy" id="pet-guard-enemy">${shardSVG(28, '#ff3344')}</span>
        <span class="pet-guard-shot" id="pet-guard-shot">${shardSVG(20, '#ff3344')}</span>
        <div class="pet-guard-track" id="pet-guard-track"><div class="pet-guard-ship" id="pet-guard-ship">${iconImg(ICON.safety, 26)}</div></div>
      </div>
      <div class="pet-mini-count"><span id="pet-guard-n">0</span>/${goal} DODGED</div>`;
    el.classList.add('show');
    const field = document.getElementById('pet-guard-field');
    const track = document.getElementById('pet-guard-track');
    const ship = document.getElementById('pet-guard-ship');
    const enemyEl = document.getElementById('pet-guard-enemy');
    const shotEl = document.getElementById('pet-guard-shot');
    const nEl = document.getElementById('pet-guard-n');
    mini = {
      key: 'guard', dodged: 0, goal, shipX: 50, enemyX: 50, enemyDir: 1,
      phase: 'drift', t0: 0, t1: 0, lockX: 50, raf: 0, prev: performance.now(),
      nextLockAt: performance.now() + 500,
    };
    function setShipX(clientX) {
      const rect = track.getBoundingClientRect();
      mini.shipX = clamp(((clientX - rect.left) / rect.width) * 100, 6, 94);
      ship.style.left = mini.shipX + '%';
    }
    track.onpointerdown = (e) => { e.preventDefault(); setShipX(e.clientX); };
    track.onpointermove = (e) => setShipX(e.clientX);
    field.onpointerdown = (e) => setShipX(e.clientX);
    field.onpointermove = (e) => { if (mini) setShipX(e.clientX); };
    enemyEl.style.left = '50%';
    shotEl.style.opacity = '0';
    function resolve() {
      const hit = Math.abs(mini.lockX - mini.shipX) < tune.tol;
      shotEl.style.opacity = '0';
      if (hit) {
        mini.dodged = Math.max(0, mini.dodged - 1);
        playSound('miss');
        flashTank('bad');
        miniToast('HIT! −1', 'bad');
      } else {
        mini.dodged++;
        playShieldPing();
        miniToast('DODGED! +1', 'good');
      }
      if (nEl) nEl.textContent = mini.dodged;
      mini.phase = 'drift';
      mini.nextLockAt = performance.now() + tune.gap;
      if (mini.dodged >= mini.goal) completeMini('ON GUARD CLEAR!', applyGuard);
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
            mini.lockX = mini.enemyX;
            enemyEl.classList.add('locking');
          }
        } else if (mini.phase === 'lock') {
          const p = clamp((now - mini.t0) / tune.telegraph, 0, 1);
          enemyEl.style.transform = `translateX(-50%) scale(${1 + p * 0.4})`;
          if (p >= 1) {
            mini.phase = 'shot';
            mini.t1 = now;
            enemyEl.classList.remove('locking');
            enemyEl.style.transform = 'translateX(-50%) scale(1)';
            shotEl.style.left = mini.lockX + '%';
            shotEl.style.top = '10%';
            shotEl.style.opacity = '1';
          }
        } else if (mini.phase === 'shot') {
          const p = clamp((now - mini.t1) / tune.strike, 0, 1);
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

  // ── Apply results (quality is always 1 — minis are goal-based, not timed) ──
  function applyFeed(q) {
    pet.hunger = clamp(pet.hunger + 20 + 30 * q, 0, 100);
    pet.happiness = clamp(pet.happiness + 4, 0, 100);
    pet.energy = clamp(pet.energy - 4, 0, 100);
    afterAction('feed', q, 'balance', iconImg(ICON.hunger, 22));
    playConfirm();
  }
  function applyRest(q) {
    pet.energy = clamp(pet.energy + 22 + 30 * q, 0, 100);
    pet.happiness = clamp(pet.happiness + 3, 0, 100);
    afterAction('rest', q, 'energy', iconImg(ICON.energy, 22));
    playConfirm();
  }
  function applyPlay(q) {
    pet.happiness = clamp(pet.happiness + 16 + 26 * q, 0, 100);
    pet.energy = clamp(pet.energy - 14, 0, 100);
    pet.hunger = clamp(pet.hunger - 6, 0, 100);
    afterAction('play', q, 'happy', iconImg(ICON.play, 22));
    playConfirm();
  }
  function applyPet(q) {
    pet.happiness = clamp(pet.happiness + 12 + 18 * q, 0, 100);
    pet.energy = clamp(pet.energy + 3, 0, 100);
    pet.hunger = clamp(pet.hunger + 2, 0, 100);
    afterAction('pet', q, 'happy', heartSVG(22));
    playConfirm();
  }
  function applyGuard(q) {
    pet.safety = clamp(pet.safety + 24 + 30 * q, 0, 100);
    pet.happiness = clamp(pet.happiness + 2, 0, 100);
    afterAction('guard', q, 'balance', iconImg(ICON.safety, 22));
    playConfirm();
  }

  function afterAction(key, quality, careAxis, iconHtml) {
    pet.cd[key] = Date.now() + COOLDOWN[key];
    // Dormant recovery path
    if (pet.dormant) {
      pet.recovery++;
      if (pet.recovery >= DORMANT_RECOVERY) wakeFromDormant();
      fx(iconHtml);
      registerCareDay();
      render();
      schedulePersist();
      return;
    }
    // Stage progress from a quality action + branch tally
    if (quality > 0.35) {
      pet.stageActions++;
      pet.stageProgress += 0.8 + quality;
      pet.care[careAxis] = (pet.care[careAxis] || 0) + (0.6 + quality);
    }
    // Balanced-care bonus: if all four stats are in a healthy band after the action.
    if (allBalanced()) pet.care.balance = (pet.care.balance || 0) + 0.8;
    registerCareDay();
    pet._celebrateUntil = Date.now() + 1200;
    fx(iconHtml);
    maybeEvolve();
    refreshAvatarIfMoodChanged();
    updateStats();
    updateCooldowns();
    showTip('cooldowns', 'NICE! EACH ACTION HAS A COOLDOWN — TRY A DIFFERENT ONE WHILE IT RECHARGES.');
    if (pet.stage < 3 && pet.stageProgress >= STAGE_THRESHOLD[pet.stage] * 0.5) {
      showTip('growth_half', 'YOUR MOBLING IS GROWING — KEEP CARING FOR IT TO REACH THE NEXT STAGE.');
    }
    schedulePersist();
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
    else render();
    // celebratory burst
    for (let i = 0; i < 6; i++) setTimeout(() => fx(starSVG(18, i % 2 ? '#ffe61a' : '#fff')), i * 90);
    persist();
  }

  function decideForm() {
    if (pet.wasDormant) return 'ember';   // brought back from neglect
    const c = pet.care;
    const entries = [['solara', c.happy || 0], ['volt', c.energy || 0], ['harmon', c.balance || 0]];
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

  // ══════════════════════════════════════
  //  DEX (form gallery)
  // ══════════════════════════════════════
  window.petOpenDex = function() {
    const dex = document.getElementById('pet-dex');
    if (!dex) return;
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
      <div class="pet-dex-summary">RAISED ${pet.collected.length}/4 FORMS · EACH MOBLING BRANCHES ON HOW YOU RAISE IT</div>
      <button class="pet-dex-close" onclick="petCloseDex()">◀ BACK TO PET</button>`;
    dex.classList.add('show');
  };
  window.petCloseDex = function() {
    const dex = document.getElementById('pet-dex');
    if (dex) dex.classList.remove('show');
    SFX && SFX.menuSelect && SFX.menuSelect();
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
    const streakDays = pet.streak.days || 1;
    const stageIndex = pet.stage;
    const happy = clamp(Math.round(lifetimeHappyAvg()), 0, 99);
    return (streakDays * 1000) + (stageIndex * 100) + happy;
  }

  function statMini(iconHtml, val, cls) {
    const v = clamp(Math.round(val), 0, 100);
    return `<div class="pet-stat-row"><div class="pet-stat-icon">${iconHtml}</div>
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
    const streakDays = pet.streak.days || 1;
    const extra = `${formName} · ${streakDays}D`;
    const happyAvg = clamp(Math.round(lifetimeHappyAvg()), 0, 99);
    const safetyAvg = clamp(Math.round(lifetimeSafetyAvg()), 0, 99);
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
          <div class="pet-status-sub">${formName} · ${STAGE_NAMES[pet.stage]} · ${streakDays} DAY STREAK</div>
          <div class="pet-status-stats">
            ${statMini(iconImg(ICON.hunger, 16), pet.hunger, 'f-hunger')}
            ${statMini(heartSVG(15), pet.happiness, 'f-happy')}
            ${statMini(iconImg(ICON.energy, 16), pet.energy, 'f-energy')}
            ${statMini(iconImg(ICON.safety, 16), pet.safety, 'f-safety')}
            ${statMini(iconImg(ICON.health, 16), pet.health, 'f-health')}
          </div>
          <div class="pet-status-meta">HAPPINESS AVG ${happyAvg} · SAFETY AVG ${safetyAvg} · FORMS ${pet.collected.length}/4</div>
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
