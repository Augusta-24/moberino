// ══════════════════════════════════════
//  SPACE MOBE — Vertical Scroller
// ══════════════════════════════════════
(function() {
  'use strict';

  let canvas, ctx, W, H, raf, state = 'idle';
  let spaceIntroShown = false; // first-time-only objective intro, before the real run starts
  let player, bullets, obstacles, stars, score, health, wave, waveKills, highScore, spawnsRemaining;
  let campaignRebootUsed = false; // one campaign continue: SYSTEM BACK ONLINE
  let leftHeld = false, rightHeld = false, lastAutoFire = 0, lastPizzaFire = 0, activeChar = getGlobalChar();
  let enemyBullets = [], lastEnemyFire = 0;
  let blackoutHitFlashes = []; // short-lived full-color snapshots shown above BLACKOUT darkness
  let lastDamageCause = '';
  let lastDamageAmount = 0;
  let lastDamageAt = 0;
  let lastDamageWave = 0;
  let deathCause = '';
  let deathDamageAmount = 0;
  let deathWave = 0;
  let deathWaveTheme = '';
  let blackoutShooterIndex = 0;
  let dangerY = 0, socketAnchorY = 0, lineFlashA = 0;
  const SPACE_SHIP_BOTTOM_OFFSET = 40;
  const SPACE_SOCKET_ANCHOR_BOTTOM_OFFSET = 94;
  const SPACE_DANGER_LINE_RAISE = 10;
  // REVERSE theme: a separate fixed "escape" line near the top, just below the
  // HUD/banner strip — kept independent of dangerY on purpose, since dangerY tracks
  // the player position and also drives the socket column's placement; repurposing
  // it for this would yank the sockets up to the top during a reverse wave.
  const REVERSE_LINE_Y = 92;
  let floatTexts = []; // {text, x, y, color, a, vy, size}
  let currentCfg = null;
  let spaceRunMode = 'campaign'; // campaign | academy | bossrun | endless | debug
  let bossRunQueue = [];
  let bossRunIndex = 0;
  let powerups = []; // {type:'speed'|'gun'|'bomb'|'shield'|'hp'|'mystery', x, y, vy, r}
  let buffSpeedUntil = 0, buffGunUntil = 0, buffShieldUntil = 0;
  // Frozen (movement x0.5, bullets render as snowflakes — cosmetic only) and zapped
  // (bullets deal 0 damage, render as farts — the skin IS the mechanical tell) are
  // the two "disabled state" debuffs shared by the ICE/EMP mini-bosses and the
  // mystery box's bad outcomes — one timer each, regardless of source.
  let buffFrozenUntil = 0, buffZappedUntil = 0;
  let blasterDisabledUntil = 0;
  let buffPizzaUntil = 0; // mystery "pizza blast" — fires a shotgun spread of pizza-slice bullets instead of one straight shot
  let snowingUntil = 0; // mystery "negative one" — ambient snow; any hit taken while it's active also freezes for 2s
  let bossInkBlindUntil = 0; // Cosmic Octo ink hit: brief screen-ink vignette during boss fights
  let lastRaveConfetti = 0; // throttles RAVE's periodic confetti bursts
  let snowParticles = [];
  let controlsReversedUntil = 0; // mystery box: left/right flipped, briefly
  let twin = null; // mystery box "twin ship" — {x,y,lastFire}, mirrors player and auto-fires
  let rebound = null; // mystery box "rebound" penalty — a bouncing hazard ball that can hit the player

  // Powerup inventory — speed/gun/shield/bomb are now banked on catch (max 1 each)
  // and deployed on demand instead of applying instantly. HP and mystery boxes are
  // unaffected — both still apply immediately on catch, same as before.
  let inventory = { gun: false, shield: false, bomb: false };
  const SOCKET_TYPES = ['gun', 'shield', 'bomb'];
  const SOCKET_COLOR = { gun: '#ffe61a', shield: '#00e5ff', bomb: '#ff8800' };
  const SOCKET_GLYPH = { gun: '⚡', bomb: '💣' }; // fallback only; sockets prefer PNGs now
  const SOCKET_SIZE = 34, SOCKET_GAP = 8, SOCKET_X = 10;
  // Anchored to the old danger line position rather than the actual current
  // danger boundary, so the sockets stay where they were even if the line moves.
  function socketRect(i) {
    const n = SOCKET_TYPES.length;
    const totalH = n * SOCKET_SIZE + (n - 1) * SOCKET_GAP;
    const groupTop = (socketAnchorY - 14) - totalH;
    return { x: SOCKET_X, y: groupTop + i * (SOCKET_SIZE + SOCKET_GAP), w: SOCKET_SIZE, h: SOCKET_SIZE };
  }
  function spaceDangerLineY() {
    // Raise only the safety line/ship lane; socket anchoring stays unchanged.
    return socketAnchorY + (H - socketAnchorY) * 0.5 - SPACE_DANGER_LINE_RAISE;
  }
  // Returns the socket type hit by a canvas-space point, or null — used both for
  // touch (reserving that column from also moving the ship) and desktop clicks.
  function hitSocket(x, y) {
    for (let i = 0; i < SOCKET_TYPES.length; i++) {
      const r = socketRect(i);
      if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return SOCKET_TYPES[i];
    }
    return null;
  }
  function deploySocket(type) {
    if (!inventory[type]) return;
    inventory[type] = false;
    applyPowerup(type);
  }
  let mysteryTimer = null;
  let shakeMag = 0; // screen shake on big hits — decays each frame
  function triggerShake(amount) { shakeMag = Math.max(shakeMag, amount); }
  // Rescued hero escort — temporary wingman, cap 1 (rescuing again refreshes/replaces it).
  // null when inactive. state: 'active' while escorting, 'leaving' during its fly-off.
  let escort = null;
  const ESCORT_DURATION_MS = 10000;
  // Boss waves — starting wave 3 and every 5 waves after, a big scary creature (not
  // one of the family characters) hovers near the top (never crosses the danger line),
  // alternates a telegraphed laser and a machine-gun burst, and periodically deploys
  // a regular enemy of its own. Asteroids are paused for the duration of the fight so
  // the encounter stays the focus.
  let boss = null;
  let bossDeployTimer = 0;
  let pendingBossCreature = null;
  const campaignSeenBossNames = new Set();
  const rescuedChars = new Set();
  let rescueBanner = null;
  const missionTrappedChars = [];
  const missionEnemyChars = [];
  const missionRetryCaptives = [];
  const waveCaptivesSeen = new Set();
  let traitorSpawnFlip = 0;
  // Phase 2 campaign structure: 8-character mission cast = 2 captors + 6 captured Mobes.
  // The authored campaign ends at Wave 13; Endless/Boss Run will branch from the menu later.
  const SPACE_MISSION_CAST_COUNT = 8;
  const SPACE_MISSION_CAPTOR_COUNT = 2;
  const SPACE_RESCUE_TARGET_COUNT = 6;
  const SPACE_CAMPAIGN_FINAL_WAVE = 13;
  const SPACE_FINAL_GIZMO_WAVE = SPACE_CAMPAIGN_FINAL_WAVE;
  // Final campaign-pacing checklist for the campaign-order pass:
  // audit wave-cleared beat duration, announcement hold, boss-rescue unlock, Gizmo escape,
  // victory handoff, and whether any overlay appears over live hazards.
  // Themed waves run on a light chapter cadence instead of pure randomness.
  // Regular waves still exist as breathers, but boss/captive fights are chapter
  // gates and the wave immediately after them is always a special "new tier" wave.
  let waveTheme = null; // null = normal wave, else one of WAVE_THEMES
  let themeEffectsAt = 0; // BLACKOUT's vignette waits until this time so it doesn't visually swallow the wave/theme announcement
  let waveTransitioning = false; // true from nextWave() through the short instruction read window before hazards resume
  let pendingBossWin = null; // boss defeated, but the victory cinematic is held until the board (minions/asteroids) is clear
  let mirrorSequenceActive = false, mirrorStageTimers = [];
  let spaceBriefingTimers = [];
  let spaceFlowToken = 0;
  const SPACE_WAVE_INSTRUCTION_READ_MS = 1500;
  const SPACE_BLACKOUT_VISUAL_READ_MS = 2600;
  let academyMode = false;
  let academyStep = 0;
  let academyStepStarted = 0;
  let academyStepArmed = false;
  let academyTimers = [];
  let academyMysteryIndex = 0;
  let academyShieldNoticeAt = 0; // Space Tutorial safety net: lessons teach without causing campaign/game-over state
  let academyGoalComplete = false;
  let academyRetryNoticeAt = 0;
  let academyCompleting = false; // Keeps the tutorial-complete beat from being mistaken for a finished campaign wave.
  // 'flip' (not 'reverse') for the wave theme key — the mystery outcome list below
  // already uses 'reverse' for reversed controls, an unrelated effect; same string
  // in both would be confusing to read even though they're different variables.
  const WAVE_THEMES = ['asteroids','enemies','ghost','captive','rave','swarm','blackout','mirror','bomber','emp','goldrush','boss','gizmo','music','flip'];
  const THEME_LABEL = {
    asteroids: 'ASTEROID FIELD', enemies: 'ENEMY ATTACK', ghost: 'GHOST ATTACK', captive: 'RESCUE MISSION',
    rave: 'PARTY RAVE MODE', swarm: 'SWARM', blackout: 'BLACKOUT', mirror: 'MIRROR ENEMY',
    bomber: 'BOMBER RUN', emp: 'EMP WARNING', goldrush: 'GOLD RUSH', boss: 'BOSS',
    gizmo: 'GIZMO',
    music: 'JAM SESSION', flip: 'REVERSE',
  };
  const EARLY_SPECIALS = ['asteroids', 'swarm'];
  const MID_SPECIALS = ['bomber', 'mirror', 'music', 'blackout'];
  const LATE_SPECIALS = ['ghost', 'emp', 'flip', 'rave'];
  const POST_BOSS_SPECIALS = ['swarm', 'bomber', 'asteroids', 'rave'];
  function chapterPick(pool, w, previousTheme, offset) {
    const choices = pool.filter(t => t !== previousTheme);
    const list = choices.length ? choices : pool;
    return list[(Math.floor(w / 5) + (offset || 0)) % list.length];
  }
  function pickWaveTheme(w, previousTheme) {
    // Phase 2 authored campaign: shorter, clearer, and rescue beats are intentional.
    // Random/chaos modes move later into Endless/Boss Run instead of appearing in the
    // first campaign pass. Six captives are tied to Waves 4, 6, 7, 9, 11, and 13.
    const campaign = {
      1: 'asteroids', // movement / dodge basics
      2: 'enemies',   // red traitor intro: direct flute shots
      3: 'enemies',   // purple traitor intro: Purple Rain
      4: 'boss',      // Star Ogre + captive 1
      5: 'swarm',     // first pressure wave / bomb lesson
      6: 'captive',   // captive 2 lock rescue + both traitors
      7: 'boss',      // Dark Knight + captive 3
      8: 'blackout',  // authored special event, isolated
      9: 'boss',      // random mid boss + captive 4
      10: 'music',    // fun/reward wave
      11: 'boss',     // random late boss + captive 5
      12: 'goldrush', // final prep: stock sockets / HP
      13: 'gizmo',    // final Gizmo + captive 6
    };
    if (Object.prototype.hasOwnProperty.call(campaign, w)) return campaign[w];

    // Post-campaign / debug endless fallback keeps the old variety available after
    // the authored rescue run. This is intentionally separate from the campaign.
    if (previousTheme === 'boss' || previousTheme === 'captive' || previousTheme === 'gizmo') return chapterPick(POST_BOSS_SPECIALS, w, previousTheme, 0);
    if (w % 9 === 0) return 'boss';
    const pos = ((w - 1) % 5) + 1;
    if (pos === 2) return chapterPick(LATE_SPECIALS, w, previousTheme, 2);
    if (pos === 3) return chapterPick(EARLY_SPECIALS, w, previousTheme, 0);
    if (pos === 4) return chapterPick(MID_SPECIALS, w, previousTheme, 1);
    return null;
  }

  // Lighter-weight boss-style encounter for GHOST/ICE/EMP — deliberately separate
  // from `boss` so the "pause all normal spawning" behavior tied to a real boss
  // fight doesn't also apply here; mini-bosses are a wave feature, not a takeover.
  // (MINIBOSS_R/MINIBOSS_HP are declared further down, right after FACE_R/BOSS_R.)
  let miniBoss = null;
  // Small retro pixel-sprite system instead of emoji for boss faces. Each sprite is
  // its LEFT HALF only (mirrored when drawn) — keeps every creature symmetric by
  // construction. '.' = transparent, other letters look up a color in that
  // creature's own palette.
  const BOSS_CREATURES = [
    { name: 'STAR OGRE', palette: { A:'#5a8c3a', K:'#0a1a05', B:'#345420', W:'#fff8e0' }, sprite: [
      ".AAAAA.",
      "AAAAAAA",
      "AAAAAAA",
      "AAAKAAA",
      "AAAKAAA",
      "AAABAAA",
      "AAAAAAA",
      "AAWAAAA",
      "AAAAAAA",
      ".AAAAA.",
      "..AAA..",
    ]},
    { name: 'SKY DRAGON', palette: { A:'#dd4422', K:'#2a0a00', B:'#a82a10' }, sprite: [
      "....A..",
      "...AAA.",
      "..AAAAA",
      ".AAAAAA",
      "AAAKAAA",
      "AAAAAAA",
      "AABBBAA",
      "AAAAAAA",
      ".AAAAA.",
      "..AAA..",
      "...A...",
    ]},
    { name: 'DARK KNIGHT', palette: { A:'#4a9c4a', K:'#0a2a0a', W:'#fff8e0' }, sprite: [
      ".AAAAA.",
      "AAAAAAA",
      "AAAAAAA",
      "AAAKAAA",
      "AAAAAAA",
      "AAAAAAA",
      "AWAWAWA",
      "AAAAAAA",
      ".AAAAA.",
      "..AAA..",
      "...A...",
    ]},
    { name: 'GRAY VISITOR', palette: { A:'#9aa8a0', K:'#0a0a0a' }, sprite: [
      "...AAA.",
      "..AAAAA",
      ".AAAAAA",
      "AAAAAAA",
      "AAKKKAA",
      "AAKKKAA",
      "AAAAAAA",
      "AAAAAAA",
      ".AAAAA.",
      "..AAA..",
      "...A...",
    ]},
    { name: 'SPACE SHARK', palette: { A:'#2f8fb8', B:'#14506f', K:'#031018', W:'#f4fbff' }, sprite: [
      "...AAA.",
      "..AAAAA",
      ".AAAAAA",
      "AAAAAAA",
      "AAAKKAA",
      "AAAAAAA",
      "AWWWWAA",
      "AAAAAAA",
      ".AAAAA.",
      "..BBA..",
      "...B...",
    ]},
    { name: 'MEAN TACO', palette: { A:'#d99a2b', B:'#6fcf45', C:'#cc3322', K:'#2a1400', W:'#fff4c8' }, sprite: [
      "..AAAA.",
      ".AAAAAA",
      "AAAAAAA",
      "AABCBBA",
      "ABCKCBA",
      "AABCBBA",
      "AAAAAAA",
      "AWWWWAA",
      ".AAAAA.",
      "..AAA..",
      "...A...",
    ]},
    { name: 'COSMIC OCTO', palette: { A:'#b34cff', B:'#5ab1ff', K:'#170025', W:'#f7edff' }, sprite: [
      "..AAAA.",
      ".AAAAAA",
      "AAAAAAA",
      "AAAKAAA",
      "AAAKAAA",
      "AAAAAAA",
      "AABBAAA",
      "AA.AA.A",
      "A..A..A",
      "A.A.A.A",
      ".A...A.",
    ]},
  ];

  const BOSS_STYLE = {
    'STAR OGRE': 'donkey',
    'SKY DRAGON': 'fire',
    'DARK KNIGHT': 'sword',
    'GRAY VISITOR': 'tether',
    'SPACE SHARK': 'fish',
    'MEAN TACO': 'sombrero',
    'COSMIC OCTO': 'ink',
    'GIZMO': 'gizmo',
  };
  // Phase 2D: single tuning table for boss feel. Boss patterns say what the
  // boss does; these values say how demanding that fight should feel.
  const BOSS_TUNING = {
    'STAR OGRE':    { rMult: 1.10, hpMult: 1.24, attackDelayMult: 0.64, projectileSpeedMult: 1.10, damageMult: 1.0, vulnerabilityWindowMult: 1.0, spawnClutterAllowed: false, signatureClutterAllowed: false, notes: 'Large commander. Donkey dodging is the fight.' },
    'SKY DRAGON':   { rMult: 1.12, hpMult: 1.02, attackDelayMult: 0.52, projectileSpeedMult: 1.44, damageMult: 1.0, vulnerabilityWindowMult: 1.0, spawnClutterAllowed: false, signatureClutterAllowed: false, notes: 'Big readable target while reading fire split.' },
    'DARK KNIGHT':  { rMult: 0.84, hpMult: 0.92, attackDelayMult: 0.76, projectileSpeedMult: 1.0, damageMult: 1.0, vulnerabilityWindowMult: 1.0, spawnClutterAllowed: false, signatureClutterAllowed: false, notes: 'Precise sword fight, not an HP sponge.' },
    'GRAY VISITOR': { rMult: 0.58, hpMult: 0.68, attackDelayMult: 0.92, projectileSpeedMult: 1.04, damageMult: 1.0, vulnerabilityWindowMult: 1.15, spawnClutterAllowed: false, signatureClutterAllowed: false, notes: 'Small glitch boss. Break the tether source to drop the forcefield.' },
    'SPACE SHARK':  { rMult: 0.95, hpMult: 0.92, attackDelayMult: 0.55, projectileSpeedMult: 1.08, damageMult: 1.0, vulnerabilityWindowMult: 1.0, spawnClutterAllowed: false, signatureClutterAllowed: false, notes: 'Aggressive pattern boss.' },
    'MEAN TACO':    { rMult: 1.12, hpMult: 1.08, attackDelayMult: 1.0, projectileSpeedMult: 1.0, damageMult: 1.0, vulnerabilityWindowMult: 1.0, spawnClutterAllowed: false, signatureClutterAllowed: false, notes: 'Large target, but defense windows justify some extra HP.' },
    'COSMIC OCTO':  { rMult: 1.10, hpMult: 0.98, attackDelayMult: 1.0, projectileSpeedMult: 1.0, damageMult: 1.0, vulnerabilityWindowMult: 1.0, spawnClutterAllowed: false, signatureClutterAllowed: false, notes: 'Large target, but ink can steal player attack time.' },
    'GIZMO':        { rMult: 0.94, hpMult: 1.00, attackDelayMult: 1.0, projectileSpeedMult: 1.0, damageMult: 1.0, vulnerabilityWindowMult: 1.0, spawnClutterAllowed: false, signatureClutterAllowed: false, notes: 'Normal Gizmo baseline.' },
  };
  function bossTuningFor(creature, options) {
    const base = Object.assign({ rMult: 1, hpMult: 1, attackDelayMult: 1, projectileSpeedMult: 1, damageMult: 1, vulnerabilityWindowMult: 1, spawnClutterAllowed: false, signatureClutterAllowed: false }, BOSS_TUNING[creature && creature.name] || {});
    if (creature && creature.isGizmo && options && options.final) return Object.assign({}, base, { rMult: 1.00, hpMult: 1.62, attackDelayMult: 0.95, notes: 'Final Gizmo should feel bigger and tougher, not endless.' });
    if (creature && creature.isGizmo && options && options.escape) return Object.assign({}, base, { rMult: 0.95, hpMult: 0.85, notes: 'Early/escape Gizmo should not be the real finale.' });
    return base;
  }

  // Phase 3A: small boss-system helpers so pattern code can read tuning values
  // without scattering multiplier math through every attack branch.
  function bossTuneValue(b, key, fallback) {
    return (b && b.tuning && typeof b.tuning[key] === 'number') ? b.tuning[key] : fallback;
  }
  function bossDamage(b, base) {
    return Math.max(1, Math.round(base * bossTuneValue(b, 'damageMult', 1)));
  }
  function bossProjectileSpeed(b, base) {
    return base * bossTuneValue(b, 'projectileSpeedMult', 1);
  }
  function bossWindowMs(b, base) {
    return Math.max(120, Math.round(base * bossTuneValue(b, 'vulnerabilityWindowMult', 1)));
  }
  function bossAllowsClutter(b, signature) {
    if (!b || !b.tuning) return false;
    return signature ? !!b.tuning.signatureClutterAllowed : !!b.tuning.spawnClutterAllowed;
  }
  const BOSS_IMAGE_SRC = {
    'STAR OGRE': 'bosses/boss_ogre.png',
    'SKY DRAGON': 'bosses/boss_dragon.png',
    'DARK KNIGHT': 'bosses/boss_knight.png',
    'GRAY VISITOR': 'bosses/boss_gray_visitor.png',
    'SPACE SHARK': 'bosses/boss_shark.png',
    'MEAN TACO': 'bosses/boss_taco.png',
    'COSMIC OCTO': 'bosses/boss_octopus.png',
    'GIZMO': 'bosses/boss_gizmo.png',
  };
  const BOSS_GLOW = {
    'STAR OGRE': { main: '#b7ff68', alt: '#6f9d42' },
    'SKY DRAGON': { main: '#ff8a00', alt: '#ffe06a' },
    'DARK KNIGHT': { main: '#c8d4ff', alt: '#5b6f9f' },
    'GRAY VISITOR': { main: '#7dffbb', alt: '#33ff66' },
    'SPACE SHARK': { main: '#5ab1ff', alt: '#00e5ff' },
    'MEAN TACO': { main: '#ffe48c', alt: '#ff442f' },
    'COSMIC OCTO': { main: '#ff4fd8', alt: '#d82cff' },
    'GIZMO': { main: '#b987ff', alt: '#fff8e8' },
  };
  const BOSS_IMAGE_SCALE = {
    'GIZMO': 1.04,
    'SPACE SHARK': 1.1,
    'SKY DRAGON': 1.12,
    'COSMIC OCTO': 1.1,
  };
  const BOSS_IMAGE_OFFSET = {
    'STAR OGRE': { x: 0, y: -0.025 },
    'SKY DRAGON': { x: 0.015, y: -0.015 },
    'DARK KNIGHT': { x: 0, y: -0.025 },
    'GRAY VISITOR': { x: 0, y: -0.02 },
    'SPACE SHARK': { x: 0.015, y: -0.015 },
    'MEAN TACO': { x: 0, y: -0.04 },
    'COSMIC OCTO': { x: 0, y: 0.025 },
    'GIZMO': { x: 0, y: -0.02 },
  };
  Object.values(BOSS_IMAGE_SRC).forEach(src => _getImg(src));
  const PROJECTILE_IMAGE_SRC = {
    donkey: 'projectiles/donkey.png',
    fire: 'projectiles/fireball.png',
    greenOrb: 'projectiles/green_orb.png',
    fish: 'projectiles/shark_tooth.png',
    sombrero: 'projectiles/sombrero.png',
    ink: 'projectiles/ink_burst.png',
    shield: 'projectiles/shield.png',
    lock: 'projectiles/blue_bone.png',
    tennis: 'projectiles/tennisball.png',
    ice: 'projectiles/snowflake.png',
    zap: 'projectiles/fart_cloud.png',
    pizza: 'projectiles/pizza.png',
    hp: 'projectiles/hp_icon.png',
    gun: 'projectiles/lightning.png',
    bomb: 'projectiles/bomb.png',
    powerShield: 'projectiles/shield.png',
    mystery: 'projectiles/mystery_crate.png',
    guitar: 'projectiles/guitar.png',
    piano: 'projectiles/piano.png',
    saxophone: 'projectiles/saxophone.png',
    sword: 'projectiles/sword.png',
  };
  Object.values(PROJECTILE_IMAGE_SRC).forEach(src => _getImg(src));

  function bossAttackTypeFor(creature) {
    const style = BOSS_STYLE[creature.name];
    if (style) return style;
    return Math.random() < 0.5 ? 'laser' : 'machinegun';
  }

  function campaignBossForWave(w) {
    // Fixed teaching bosses first, then swapped bosses for replay. Gizmo is handled
    // by the gizmo theme/final wave, not picked from this list.
    if (w === 4) return BOSS_CREATURES.find(c => c.name === 'STAR OGRE');
    if (w === 7) return BOSS_CREATURES.find(c => c.name === 'DARK KNIGHT');
    const pool9 = ['SKY DRAGON', 'SPACE SHARK', 'GRAY VISITOR'];
    const pool11 = ['MEAN TACO', 'SKY DRAGON', 'SPACE SHARK', 'GRAY VISITOR', 'COSMIC OCTO'];
    const names = w === 9 ? pool9 : w === 11 ? pool11 : null;
    if (names) {
      const choices = BOSS_CREATURES.filter(c => names.includes(c.name));
      const fresh = choices.filter(c => !campaignSeenBossNames.has(c.name));
      const pool = fresh.length ? fresh : choices;
      return pool[Math.floor(Math.random() * pool.length)] || pool[0];
    }
    return null;
  }

  function pickBossCreature() {
    if (waveTheme === 'gizmo') return { name: 'GIZMO', isGizmo: true };
    const campaignBoss = campaignBossForWave(wave);
    if (campaignBoss) return campaignBoss;
    return BOSS_CREATURES[Math.floor(Math.random() * BOSS_CREATURES.length)];
  }

  function addFloatText(text, x, y, color, size, opts) {
    opts = opts || {};
    floatTexts.push({
      text, x, y, color, a: 1,
      vy: opts.vy != null ? opts.vy : -1.5,
      fade: opts.fade != null ? opts.fade : 0.02,
      holdMs: opts.holdMs || 0,
      startedAt: Date.now(),
      size: size || 20,
      tag: opts.tag || null
    });
  }

  function playDonkeyHeeHaw() {
    try {
      if (typeof getAudioCtx === 'function') {
        const c = getAudioCtx();
        const now = c.currentTime + 0.01;
        const notes = [
          { f: 260, start: 0, dur: 0.18, end: 155, type: 'sawtooth', vol: 0.09 },
          { f: 420, start: 0.08, dur: 0.12, end: 310, type: 'triangle', vol: 0.05 },
          { f: 185, start: 0.24, dur: 0.28, end: 92, type: 'sawtooth', vol: 0.1 },
          { f: 122, start: 0.34, dur: 0.22, end: 70, type: 'square', vol: 0.055 },
        ];
        notes.forEach(n => {
          const osc = c.createOscillator();
          const gain = c.createGain();
          osc.type = n.type;
          osc.frequency.setValueAtTime(n.f, now + n.start);
          osc.frequency.exponentialRampToValueAtTime(Math.max(1, n.end), now + n.start + n.dur);
          gain.gain.setValueAtTime(n.vol, now + n.start);
          gain.gain.exponentialRampToValueAtTime(0.001, now + n.start + n.dur);
          osc.connect(gain); gain.connect(c.destination);
          osc.start(now + n.start); osc.stop(now + n.start + n.dur + 0.02);
        });
        return;
      }
    } catch(e) {}
    if (SFX.gizmoBark) SFX.gizmoBark();
    else if (SFX.bomberDive) SFX.bomberDive();
  }

  function shuffleList(list) {
    const out = list.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = out[i]; out[i] = out[j]; out[j] = tmp;
    }
    return out;
  }

  function spawnOgreAsteroidSprinkle(count = 2) {
    if (!currentCfg) return;
    for (let k = 0; k < count; k++) {
      const r = rand(ASTEROID_R_MIN, ASTEROID_R_MAX * 0.9);
      const sides = 7 + Math.floor(Math.random() * 5);
      const verts = Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * Math.PI * 2;
        const rr = r * (0.7 + Math.random() * 0.3);
        return [Math.cos(a) * rr, Math.sin(a) * rr];
      });
      obstacles.push({
        type: 'asteroid',
        x: rand(r, W - r),
        y: -r - 20 - k * 54,
        vx: rand(-0.12, 0.12) * currentCfg.speed,
        vy: currentCfg.speed * rand(0.58, 0.78),
        r, verts, rot: 0,
        rotSpeed: rand(-0.018, 0.018),
        hp: 1,
        shadeSeed: Math.random() * 1000,
        rockStyle: Math.floor(Math.random() * 3),
        bossSprinkle: true,
      });
    }
  }

  function beginOgreDonkeyWave() {
    if (!boss || boss.attackType !== 'donkey') return;
    const now = Date.now();
    const count = 5;
    const ogreSpeedMult = bossProjectileSpeed(boss, 1);
    const targetY = Math.min(H * 0.53, Math.max(boss.y + boss.r * 1.25, H * 0.42));
    const donkeys = [];
    for (let k = 0; k < count; k++) {
      const x = W * ((k + 1) / (count + 1));
      const d = {
        x, y: boss.y + boss.r * 0.68,
        targetX: x, targetY,
        vx: 0, vy: 0, r: 10.4,
        theme: 'donkey',
        damage: 20,
        visualScale: 4.0,
        donkeyLine: true,
        donkeyState: 'deploy',
        born: now,
        readyAt: now + 420,
      };
      donkeys.push(d);
      enemyBullets.push(d);
    }
    boss.ogreLine = {
      donkeys,
      order: shuffleList(donkeys),
      nextIndex: 0,
      waveNo: (boss.ogreWaveNo || 0) + 1,
      nextChargeAt: now + 560,
    };
    boss.ogreWaveNo = boss.ogreLine.waveNo;
    spawnOgreAsteroidSprinkle(boss.ogreWaveNo === 1 ? 2 : 1);
    addFloatText(`DONKEY WAVE ${boss.ogreWaveNo}/4`, boss.x, boss.y + boss.r + 18, '#c7a16b', 16);
  }

  function updateOgreDonkeyLine() {
    if (!boss || !boss.ogreLine) return;
    const line = boss.ogreLine;
    const now = Date.now();
    let activeCharges = 0;
    for (const d of line.donkeys) {
      if (d._hit || d._gone) continue;
      if (d.donkeyState === 'deploy') {
        d.x += (d.targetX - d.x) * 0.24;
        d.y += (d.targetY - d.y) * 0.24;
        if (Math.abs(d.y - d.targetY) < 1.5 || now > d.readyAt) {
          d.x = d.targetX; d.y = d.targetY; d.donkeyState = 'hold';
        }
      } else if (d.donkeyState === 'charge') {
        activeCharges++;
      }
    }
    const allReady = line.donkeys.every(d => d._hit || d._gone || d.donkeyState !== 'deploy');
    if (allReady && activeCharges < 2 && line.nextIndex < line.order.length && now > line.nextChargeAt) {
      const d = line.order[line.nextIndex++];
      if (d && !d._hit && !d._gone) {
        const dx = player.x - d.x;
        const dy = player.y - d.y;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = (9.1 + Math.min(1.9, campaignTier(wave) * 0.34)) * bossProjectileSpeed(boss, 1);
        d.vx = (dx / dist) * speed;
        d.vy = (dy / dist) * speed;
        d.donkeyState = 'charge';
        d.chargeBorn = now;
        line.nextChargeAt = now + 390;
        spaceSfx('boss.ogre.projectile');
      }
    }
    const allDone = line.donkeys.every(d => d._hit || d._gone);
    if (allDone) {
      boss.ogreLine = null;
      boss.nextAttack = now + bossWindowMs(boss, boss.ogreWaveNo >= 4 ? 1300 : 420);
      if (boss.ogreWaveNo >= 4) boss.ogreWaveNo = 0;
    }
  }


  const P_SPEED = 5, B_SPEED = 9.45, O_SPEED_BASE = 2.0; // +10% over original 1.8; blaster +5% over 9
  const AUTO_FIRE_MS = 200;
  const FACE_R = 22, ASTEROID_R_MIN = 14, ASTEROID_R_MAX = 30;
  const CAPTIVE_RING_HP = 15;
  const BOSS_R = FACE_R * 2.5, BOSS_HP = 35;
  const MINIBOSS_R = FACE_R * 1.6, MINIBOSS_HP = 6;

  // PARTY RAVE wave theme: a lookup-table + wrapper instead of refactoring every
  // draw function — call sites wrap their existing color literal in C(...), no
  // structural changes. Gameplay canvas only; DOM/HTML overlays are untouched.
  const NEON_PALETTE = {
    '#5c526c':'#ff00ff', '#7a6a90':'#00ffff', '#ffe61a':'#39ff14',
    '#00e5ff':'#ff00aa', '#33ff66':'#ffff00', '#ff4444':'#ff5500', '#ff6666':'#ff77ff',
  };
  function C(hex) { return waveTheme === 'rave' ? (NEON_PALETTE[hex] || hex) : hex; }

  function rand(a,b){ return a + Math.random()*(b-a); }
  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  function blackoutHeadlightGeometry() {
    if (!player) return null;
    const coneTopY = Math.max(115, player.y - Math.min(H * 0.36, 255));
    const coneHalfW = Math.min(W * 0.24, 76 + H * 0.036);
    const beamBaseY = player.y - player.r * 0.8;
    return { coneTopY, coneHalfW, beamBaseY };
  }

  function isPointInBlackoutHeadlight(x, y, radius) {
    const g = blackoutHeadlightGeometry();
    if (!g) return false;
    radius = radius || 0;
    const denom = Math.max(1, g.beamBaseY - g.coneTopY);
    const t = (g.beamBaseY - y) / denom;
    if (t < -0.08 || t > 1.08) return false;
    const halfAtY = g.coneHalfW * (0.16 + 0.84 * clamp(t, 0, 1));
    return Math.abs(x - player.x) <= halfAtY + radius;
  }

  function clipToBlackoutHeadlight() {
    const g = blackoutHeadlightGeometry();
    if (!g) return null;
    ctx.beginPath();
    ctx.moveTo(player.x, g.beamBaseY);
    ctx.lineTo(Math.max(0, player.x - g.coneHalfW * 0.9), g.coneTopY);
    ctx.lineTo(Math.min(W, player.x + g.coneHalfW * 0.9), g.coneTopY);
    ctx.closePath();
    ctx.clip();
    return g;
  }

  function shuffledSpaceCharIndexes(excludeIdx) {
    const arr = GAME_CHARS.map((_, i) => i).filter(i => i !== excludeIdx);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function prepareSpaceMission() {
    const pool = shuffledSpaceCharIndexes(activeChar);
    const cast = pool.slice(0, Math.min(SPACE_MISSION_CAST_COUNT, pool.length));
    missionEnemyChars.splice(0, missionEnemyChars.length, ...cast.slice(0, SPACE_MISSION_CAPTOR_COUNT));
    missionTrappedChars.splice(0, missionTrappedChars.length, ...cast.slice(SPACE_MISSION_CAPTOR_COUNT, SPACE_MISSION_CAPTOR_COUNT + SPACE_RESCUE_TARGET_COUNT));
    missionRetryCaptives.splice(0, missionRetryCaptives.length);
    traitorSpawnFlip = 0;
    campaignSeenBossNames.clear();
    rescuedChars.clear();
  }

  function unrescuedMissionCaptives() {
    return missionTrappedChars.filter(i => !rescuedChars.has(i));
  }
  function hasUnrescuedMissionCaptive() {
    return unrescuedMissionCaptives().length > 0;
  }

  function nextMissionCaptiveIndex(excludeSet) {
    const excluded = excludeSet || new Set();
    const activeCaptives = new Set(obstacles.filter(o => o.isTrapped).map(o => o.ci));
    const open = unrescuedMissionCaptives().filter(ci => !excluded.has(ci) && !activeCaptives.has(ci));
    while (missionRetryCaptives.length) {
      const retry = missionRetryCaptives.shift();
      if (open.includes(retry)) return retry;
    }
    if (open.length) return open[Math.floor(Math.random() * open.length)];
    return -1;
  }

  function nextMissionEnemyIndex() {
    const pool = missionEnemyChars.length ? missionEnemyChars : GAME_CHARS.map((_, i) => i).filter(i => i !== activeChar);
    return pool[Math.floor(Math.random() * pool.length)] || 0;
  }
  function missionTraitorIndexForType(type) {
    // Keep one stable red traitor and one stable purple traitor for the full run.
    if (!missionEnemyChars.length) return nextMissionEnemyIndex();
    if (type === 'purple') return missionEnemyChars[1] == null ? missionEnemyChars[0] : missionEnemyChars[1];
    return missionEnemyChars[0];
  }

  function rescueMissionChar(ci, x, y, label) {
    if (ci == null || ci < 0) return false;
    const wasNew = !rescuedChars.has(ci);
    rescuedChars.add(ci);
    for (let i = missionRetryCaptives.length - 1; i >= 0; i--) if (missionRetryCaptives[i] === ci) missionRetryCaptives.splice(i, 1);
    escort = { ci, state: 'active', expiresAt: Date.now() + ESCORT_DURATION_MS, x: player.x - 40, y: player.y, lastFire: 0, opacity: 1 };
    rescueBanner = { ci, startedAt: Date.now(), rescued: rescuedChars.size, total: missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT };
    faceFlash(ci, 'happy', x, y);
    playRescueFlourish();
    addFloatText(label || '+150 RESCUED!', x, y, '#00e5ff', 22);
    if (wasNew && rescuedChars.size >= missionTrappedChars.length && missionTrappedChars.length) {
      score += 750;
      addFloatText('ALL MOBES RESCUED! +750', W / 2, H * 0.28, '#33ff66', 22);
      showTopBanner('ALL MOBES RESCUED!', 'good');
      ticketConfetti(true);
    }
    return wasNew;
  }

  function queueMissionCaptiveRetry(ci) {
    if (ci == null || ci < 0 || rescuedChars.has(ci) || missionRetryCaptives.includes(ci)) return;
    missionRetryCaptives.push(ci);
  }

  function mkStars() {
    stars = Array.from({length:45}, () => ({
      x: rand(0,W), y: rand(0,H),
      r: rand(0.5,2), speed: rand(0.15,0.65),
      a: rand(0.135,0.63),
    }));
  }

  function campaignTier(w) {
    if (w < 4) return 0;                          // basics: asteroids, enemies, swarm
    if (w < 8) return 1;                          // first boss/rescue loop
    if (w < SPACE_CAMPAIGN_FINAL_WAVE) return 2;  // mid/late campaign pressure
    if (w === SPACE_CAMPAIGN_FINAL_WAVE) return 3; // final Gizmo
    return 4;                                     // post-campaign endless/debug ramp
  }

  function campaignWaveTuning(w) {
    // Phase 2B: explicit campaign balance layer. The authored 13-wave campaign
    // should teach one main threat at a time; Endless can keep the chaotic mixes.
    // spawnsRemaining is exact for these campaign waves so startWaveSpawn() does
    // not re-inflate them with the older theme multipliers.
    const tuning = {
      // Asteroid-field waves use slower cadence instead of dumping rocks faster.
      // Wave 5 also staggers three normal enemies into fixed slots; the pool still
      // ends through spawnsRemaining/board-clear, so it cannot overlap nextWave().
      1: { spawnsRemaining: 40, speedOverride: 2.86, spawnMsOverride: 930, asteroidRatioOverride: 1, enemyFireMult: 0, allowMystery: false, allowPowerups: false, allowHp: true, hpDelayRange: [2600, 5200], spawnCadenceMult: 0.9, activeObstacleCap: 6, notes: 'Intro is dangerous: small rocks cost 5 HP and big rocks cost 10 HP, with early HP drops teaching recovery.' },
      2: { spawnsRemaining: 14, speedOverride: 2.62, spawnMsOverride: 1030, asteroidRatioOverride: 0, enemyHpOverride: 3, enemyFireMult: 1.32, enemyFireRateMult: 0.62, enemyVyMult: 1.28, enemyDriftMult: 2.04, enemyDodgeMult: 1.36, allowMystery: false, allowPowerups: true, allowHp: true, forcePowerupType: 'bomb', maxSocketPowerups: 1, powerupDelayRange: [1700, 2600], hpDelayRange: [2600, 5200], spawnCadenceMult: 0.94, activeObstacleCap: 4, notes: '14 normal enemies: faster, evasive, 3-hit duel targets with tighter red pressure.' },
      3: { spawnsRemaining: 19, wave3EnemyTotal: 5, wave3EnemyScreenCap: 2, wave3AsteroidTotal: 14, speedOverride: 2.62, spawnMsOverride: 1180, asteroidRatioOverride: 0.70, allowEnemyAsteroids: true, enemyHpOverride: 3, enemyFireMult: 0.86, enemyFireRateMult: 0.94, enemyVyMult: 1.14, enemyDriftMult: 1.58, enemyDodgeMult: 1.04, allowMystery: false, allowPowerups: true, allowHp: true, forcePowerupType: 'shield', maxSocketPowerups: 1, powerupDelayRange: [1600, 2400], hpDelayRange: [3000, 5600], spawnCadenceMult: 1.08, notes: 'Purple Rain intro: five solo rain enemies, asteroid-heavy spacing, shoot during rain pauses.' },
      4: { spawnsRemaining: 0, allowMystery: false, allowPowerups: false, allowHp: true, hpDelayRange: [7600, 11600], enemyFireMult: 0.75 },
      5: { spawnsRemaining: 26, speedOverride: 2.72, spawnMsOverride: 1087, asteroidRatioOverride: 0, enemyHpOverride: 1, enemyFireMult: 0.34, allowMystery: false, allowPowerups: true, allowHp: true, forcePowerupType: 'bomb', maxSocketPowerups: 1, powerupDelayRange: [900, 1300], hpDelayRange: [2200, 4400], swarmCap: 5, activeObstacleCap: 5, spawnCadenceMult: 1.02, notes: 'Swarm moved from Wave 3 so traitors get clean introductions first.' },
      6: { spawnsRemaining: 14, speedOverride: 2.72, spawnMsOverride: 880, asteroidRatioOverride: 0.36, enemyHpOverride: 3, enemyFireMult: 0.94, enemyFireRateMult: 0.70, enemyVyMult: 1.24, enemyDriftMult: 1.86, enemyDodgeMult: 1.12, allowMystery: false, allowPowerups: true, allowHp: true, forcePowerupType: 'shield', maxSocketPowerups: 1, rescueRingHp: 30, powerupDelayRange: [3600, 6200], hpDelayRange: [4800, 7800], spawnCadenceMult: 0.86, activeObstacleCap: 4 },
      7: { spawnsRemaining: 0, allowMystery: false, allowPowerups: false, allowHp: true, hpDelayRange: [8000, 12000], enemyFireMult: 0.85 },
      8: { spawnsRemaining: 16, speedOverride: 2.76, spawnMsOverride: 820, asteroidRatioOverride: 1, enemyFireMult: 0.82, allowMystery: false, allowPowerups: false, allowHp: true, hpDelayRange: [5600, 9000], spawnCadenceMult: 1.0, activeObstacleCap: 8 },
      9: { spawnsRemaining: 0, allowMystery: false, allowPowerups: true, allowHp: true, maxSocketPowerups: 1, powerupDelayRange: [6400, 9800], hpDelayRange: [7000, 11000], enemyFireMult: 0.9 },
      10: { spawnsRemaining: 24, speedOverride: 3.08, spawnMsOverride: 780, asteroidRatioOverride: 0.52, enemyHpOverride: 3, enemyFireMult: 1.16, enemyFireRateMult: 0.68, enemyVyMult: 1.24, enemyDriftMult: 1.94, enemyDodgeMult: 1.2, allowMystery: true, allowPowerups: true, allowHp: true, maxSocketPowerups: 2, maxInstruments: 9, instrumentDelayRange: [650, 980], powerupDelayRange: [4100, 6600], hpDelayRange: [4800, 8000], mysteryDelayRange: [6500, 10500], spawnCadenceMult: 0.82, activeObstacleCap: 5 },
      11: { spawnsRemaining: 0, allowMystery: false, allowPowerups: true, allowHp: true, maxSocketPowerups: 1, powerupDelayRange: [7200, 10400], hpDelayRange: [7600, 11200], enemyFireMult: 1.0 },
      12: { spawnsRemaining: 30, speedOverride: 3.06, spawnMsOverride: 820, asteroidRatioOverride: 0.70, enemyHpOverride: 3, enemyFireMult: 1.12, enemyFireRateMult: 0.70, enemyVyMult: 1.22, enemyDriftMult: 1.82, enemyDodgeMult: 1.08, allowMystery: true, allowPowerups: true, allowHp: true, forcePowerupType: 'bomb', maxSocketPowerups: 4, powerupDelayRange: [3000, 5000], hpDelayRange: [3600, 6000], mysteryDelayRange: [5200, 8800], spawnCadenceMult: 0.84, activeObstacleCap: 5, notes: 'Hard final prep with fewer, evasive normal enemies.' },
      13: { spawnsRemaining: 0, allowMystery: false, allowPowerups: false, allowHp: true, hpDelayRange: [8500, 12500], enemyFireMult: 1.0, finalBossHpNote: 'Final Gizmo HP is tuned through BOSS_TUNING final override.' },
    };
    return tuning[w] || null;
  }

  function campaignAllows(kind) {
    if (!currentCfg || currentCfg[kind] == null) return true;
    return !!currentCfg[kind];
  }

  function waveConfig(w) {
    const tier = campaignTier(w);
    const endless = Math.max(0, w - SPACE_CAMPAIGN_FINAL_WAVE);
    // Difficulty now rises by campaign tier first, wave number second. Campaign
    // waves are then overlaid with explicit tuning so early waves teach one skill
    // at a time instead of mixing every threat immediately.
    const base = {
      poolSize: 10 + w * 3 + tier * 3 + endless * 2,
      speed: O_SPEED_BASE + Math.min(w, 10) * 0.13 + tier * 0.22 + endless * 0.18,
      spawnMs: Math.max(390, 1760 - Math.min(w, 12) * 62 - tier * 70 - endless * 34),
      asteroidRatio: Math.max(0.2, 0.64 - tier * 0.055 - endless * 0.012),
      tier,
      allowMystery: true,
      allowPowerups: true,
      allowHp: true,
    };
    const tuned = campaignWaveTuning(w);
    if (tuned) Object.assign(base, tuned);
    if (base.speedOverride != null) base.speed = base.speedOverride;
    if (base.spawnMsOverride != null) base.spawnMs = base.spawnMsOverride;
    if (base.asteroidRatioOverride != null) base.asteroidRatio = base.asteroidRatioOverride;
    return base;
  }

  function enemyFireAt(shooter, speedMult, cause) {
    if (shooter && shooter.traitorType === 'purple' && cause !== 'BLACKOUT SHOT') {
      firePurpleTraitorRain(shooter);
      return;
    }
    const fireAimedEnemyBullet = (shotSpeedMult, shotCause) => {
      if (!shooter || shooter.alive === false || !player) return;
      const dx = player.x - shooter.x;
      const dy = player.y - shooter.y;
      const dist = Math.sqrt(dx*dx+dy*dy) || 1;
      const tier = currentCfg ? currentCfg.tier : campaignTier(wave);
      const balanceMult = currentCfg && currentCfg.enemyFireMult != null ? currentCfg.enemyFireMult : 1;
      const bulletSpeed = (3.0 + tier * 0.45 + Math.min(wave, 12) * 0.16 + Math.max(0, wave - 18) * 0.18) * (shotSpeedMult || 1) * balanceMult;
      enemyBullets.push({ x: shooter.x, y: shooter.y + shooter.r, vx: (dx/dist)*bulletSpeed, vy: (dy/dist)*bulletSpeed, r: 4, damage: 3, damageCause: shotCause || 'ENEMY SHOT', traitorShot: shooter && shooter.traitorType });
    };
    if (shooter && shooter.traitorType === 'red' && cause !== 'BLACKOUT SHOT') {
      fireAimedEnemyBullet(speedMult, 'RED SHOT');
      playTraitorShotSfx('red');
      const redEchoProfile = wave <= 2
        ? { chance: 0.56, delayMs: 330, speedMult: 0.90 }
        : wave <= 5
          ? { chance: 0.55, delayMs: 320, speedMult: 0.84 }
          : wave <= 9
            ? { chance: 0.72, delayMs: 290, speedMult: 0.90 }
            : { chance: 0.82, delayMs: 260, speedMult: 0.96 };
      const activeRed = obstacles.filter(o => o.type === 'face' && o.traitorType === 'red' && !o.isTrapped && o.alive !== false).length;
      const echoChance = activeRed >= 3 ? redEchoProfile.chance * 0.55 : redEchoProfile.chance;
      if (Math.random() >= echoChance) return;
      const now = Date.now();
      const token = spaceFlowToken;
      const followDelayMs = redEchoProfile.delayMs;
      shooter.redEchoMuzzleUntil = now + followDelayMs;
      setTimeout(() => {
        if (token !== spaceFlowToken || state !== 'playing' || waveTransitioning || !shooter || shooter.alive === false) return;
        fireAimedEnemyBullet((speedMult || 1) * redEchoProfile.speedMult, 'RED ECHO SHOT');
        playTraitorShotSfx('red');
      }, followDelayMs);
      return;
    }
    fireAimedEnemyBullet(speedMult, cause || 'ENEMY SHOT');
  }

  function traitorTypeForWave(w) {
    // Authored intro order: Wave 2 red, Wave 3 purple, Wave 6 teaches both.
    if (w === 3) return 'purple';
    if (w === 6) return (traitorSpawnFlip++ % 2) ? 'purple' : 'red';
    if (w > 6) return Math.random() < 0.48 ? 'purple' : 'red';
    return 'red';
  }

  function purpleWaveProfileForWave(w) {
    const waveNo = Math.max(1, w || wave || 1);
    const bucket = waveNo <= 3 ? 0 : waveNo <= 6 ? 1 : waveNo <= 10 ? 2 : 3;
    const profiles = [
      { label: 'easy', driftMult: 1.16, dodgeMult: 1.18, rainDropsMin: 12, rainDropsMax: 14, rainGapMs: 1000 },
      { label: 'mid', driftMult: 1.22, dodgeMult: 1.26, rainDropsMin: 13, rainDropsMax: 15, rainGapMs: 940 },
      { label: 'hard', driftMult: 1.28, dodgeMult: 1.34, rainDropsMin: 14, rainDropsMax: 16, rainGapMs: 880 },
      { label: 'harder', driftMult: 1.34, dodgeMult: 1.42, rainDropsMin: 15, rainDropsMax: 17, rainGapMs: 820 },
    ];
    return Object.assign({ screenCap: 2 }, profiles[bucket]);
  }

  function purpleRainActive(o, now) {
    return !!(o && o.traitorType === 'purple' && now < (o.purpleRainUntil || 0));
  }

  function firePurpleTraitorRain(shooter) {
    if (!shooter || shooter.alive === false || state !== 'playing' || waveTransitioning) return;
    const now = Date.now();
    if (now < (shooter.nextPurpleRainAt || 0) || purpleRainActive(shooter, now)) return;
    const tier = currentCfg ? currentCfg.tier : campaignTier(wave);
    const purpleProfile = purpleWaveProfileForWave(wave);
    const rainDropSpacingMs = 116;
    const duration = rainDropSpacingMs * Math.max(0, purpleProfile.rainDropsMax - 1) + 140;
    const drops = Math.floor(rand(purpleProfile.rainDropsMin, purpleProfile.rainDropsMax + 1));
    shooter.purpleRainUntil = now + duration;
    shooter.nextPurpleRainAt = now + duration + purpleProfile.rainGapMs;
    for (let i = 0; i < drops; i++) {
      const token = spaceFlowToken;
      setTimeout(() => {
        if (token !== spaceFlowToken || state !== 'playing' || waveTransitioning || !purpleRainActive(shooter, Date.now())) return;
        const spread = ((i % 3) - 1) * shooter.r * 0.28 + rand(-5, 5);
        enemyBullets.push({
          x: Math.max(8, Math.min(W - 8, shooter.x + spread)),
          y: shooter.y + shooter.r * 0.82,
          vx: rand(-0.16, 0.16),
          vy: 3.1 + tier * 0.10 + (purpleProfile.driftMult - 1) * 0.52 + Math.random() * 0.26,
          r: 2.4,
          theme: 'purpleRain',
          damage: 3,
          damageCause: 'PURPLE RAIN',
          born: Date.now(),
        });
      }, i * rainDropSpacingMs);
    }
    playTraitorShotSfx('purple');
  }

  function warnAndFireBlackoutEnemy(shooter) {
    if (!shooter || shooter.alive === false) return;
    const now = Date.now();
    shooter.blackoutMuzzleUntil = now + 360;
    shooter.blackoutHoldUntil = now + 420;
    setTimeout(() => {
      if (state !== 'playing' || waveTheme !== 'blackout' || shooter.alive === false || shooter._crossed) return;
      enemyFireAt(shooter, 1, 'BLACKOUT SHOT');
    }, 280);
  }

  function normalEnemyAwarenessForWave(w) {
    // Normal enemies should feel teachable early, then increasingly spatially
    // aware later: more dodges, more run-away movement, and fewer lazy drift rolls.
    // This only affects normal hold/drift enemies; swarmers, bombers, captives,
    // bosses, and tutorial spawns keep their authored behavior.
    const tier = campaignTier(w || wave || 1);
    const postCampaign = Math.max(0, (w || wave || 1) - SPACE_CAMPAIGN_FINAL_WAVE);
    return clamp(0.16 + tier * 0.16 + Math.max(0, (w || wave || 1) - 5) * 0.035 + postCampaign * 0.025, 0.16, 0.92);
  }

  function updateHoldDriftEnemy(o, now) {
    if (!o || o.behavior !== 'holdDrift' || waveTheme === 'flip') return false;
    // Normal enemies are allowed to occupy more of the board now: roughly the
    // upper 75% of the playfield, while still staying safely above the player line.
    const safeMaxY = Math.max(132, Math.min(dangerY - 72, H * 0.75));
    const targetY = o.holdY == null ? Math.min(safeMaxY, Math.max(118, H * 0.42)) : Math.min(o.holdY, safeMaxY);
    if (!o.holdSettled) {
      if (o.y < targetY) {
        o.y += Math.max(1.2, Math.abs(o.vy || 1.8));
        if (o.y > targetY) o.y = targetY;
        return true;
      }
      o.y = targetY;
      o.baseY = targetY;
      o.holdSettled = true;
      o.holdSettledAt = now;
    }
    if (o.baseY == null) o.baseY = targetY;
    if (o.driftSeed == null) o.driftSeed = Math.random() * Math.PI * 2;
    const awareness = o.academyObstacle ? 0.28 : (o.enemyAwareness != null ? o.enemyAwareness : normalEnemyAwarenessForWave(wave));
    const driftMult = o.enemyDriftMult || 1;
    const dodgeMult = o.enemyDodgeMult || 0;
    const jukeMult = o.enemyJukeMult || 1;
    const age = now - (o.holdSettledAt || now);
    const bob = Math.sin(age * 0.00125 * Math.min(1.8, driftMult) + o.driftSeed) * (o.driftAmpY || 8);
    // Ease toward the bob target instead of snapping y directly every frame. The
    // direct assignment made the upward part of the bob look jittery/glitchy.
    let driftTargetY = clamp(o.baseY + bob, o.r + 84, safeMaxY);

    // Soft separation: hold/drift enemies repel each other if they clump. This keeps
    // the lower hold band readable without turning the movement into hard snapping.
    let repelX = 0, repelY = 0;
    const minSep = Math.max(o.r * (2.45 + awareness * 0.42), 48 + awareness * 14);
    for (const other of obstacles) {
      if (!other || other === o || other.behavior !== 'holdDrift' || other.alive === false) continue;
      if (!other.holdSettled || other.y < 0) continue;
      const dx = o.x - other.x;
      const dy = o.y - other.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 0.01 || distSq > minSep * minSep) continue;
      const dist = Math.sqrt(distSq);
      const push = (minSep - dist) / minSep;
      repelX += (dx / dist) * push;
      repelY += (dy / dist) * push * 0.55;
    }
    if (repelX || repelY) {
      o.vx = clamp(o.vx + repelX * 0.18 * driftMult, -1.15 * driftMult, 1.15 * driftMult);
      o.x = clamp(o.x + repelX * 0.42 * driftMult, o.r, W - o.r);
      driftTargetY = clamp(driftTargetY + repelY * 8, o.r + 84, safeMaxY);
    }

    // Normal enemy awareness: early enemies still make readable mistakes, but late
    // enemies scan wider bullet lanes, dodge sooner, and sometimes retreat away
    // from the player's current lane. Cooldowns keep them hittable.
    if (dodgeMult > 0 && now > (o.nextDodgeAt || 0)) {
      const threatX = o.r * (1.62 + awareness * 1.05);
      const threatY = 170 + awareness * 105;
      const threat = bullets.find(b => b && b.vy < 0 && b.y > o.y && Math.abs(b.x - o.x) < threatX && (b.y - o.y) < threatY);
      if (threat) {
        const away = threat.x <= o.x ? 1 : -1;
        const edgeBias = o.x < o.r + 26 ? 1 : o.x > W - o.r - 26 ? -1 : away;
        const dodgeKick = (0.98 + awareness * 0.72 + Math.random() * 0.55) * dodgeMult;
        o.vx = clamp(o.vx + edgeBias * dodgeKick, -2.18 * driftMult * (1 + awareness * 0.18), 2.18 * driftMult * (1 + awareness * 0.18));
        o.baseY = clamp(o.baseY + rand(-11, 9) * dodgeMult * (0.85 + awareness * 0.32), o.r + 84, safeMaxY);
        o.nextDodgeAt = now + rand(420 - awareness * 150, 760 - awareness * 190);
        o.dodgeWobbleUntil = now + 220;
      }
    }

    if (!o.academyObstacle && awareness > 0.32 && player && now > (o.nextRetreatAt || 0)) {
      const dxp = o.x - player.x;
      const dyp = player.y - o.y;
      const laneDanger = Math.abs(dxp) < o.r * (2.0 + awareness * 2.0) && dyp > 0 && dyp < H * (0.42 + awareness * 0.13);
      if (laneDanger || (awareness > 0.62 && Math.random() < 0.018 * awareness)) {
        const away = dxp >= 0 ? 1 : -1;
        const edgeBias = o.x < o.r + 34 ? 1 : o.x > W - o.r - 34 ? -1 : away;
        o.vx = clamp(o.vx + edgeBias * (0.58 + awareness * 0.92) * driftMult, -2.05 * driftMult, 2.05 * driftMult);
        // "Run away" is mostly lateral, with a slight climb upward when possible.
        o.baseY = clamp(o.baseY - rand(4, 15) * awareness, o.r + 84, safeMaxY);
        o.nextRetreatAt = now + rand(520, 1040) * (1.05 - awareness * 0.34);
      }
    }

    o.y += (driftTargetY - o.y) * Math.min(0.12, 0.075 * driftMult);
    if (Math.abs(driftTargetY - o.y) < 0.05) o.y = driftTargetY;
    if (Math.abs(o.vx) < 0.15) o.vx = (Math.random() < 0.5 ? -1 : 1) * 0.45 * driftMult;
    if (now > (o.nextDriftTurnAt || 0)) {
      o.vx += rand(-0.18 - awareness * 0.10, 0.18 + awareness * 0.10) * driftMult;
      o.vx = clamp(o.vx, -1.0 * driftMult * (1 + awareness * 0.22), 1.0 * driftMult * (1 + awareness * 0.22));
      o.nextDriftTurnAt = now + rand(850 - awareness * 220, 1550 - awareness * 360) / Math.min(1.5, driftMult);
    }
    if (now > (o.nextJukeAt || 0)) {
      o.vx = clamp(o.vx + rand(-0.48 - awareness * 0.22, 0.48 + awareness * 0.22) * driftMult, -1.65 * driftMult * (1 + awareness * 0.18), 1.65 * driftMult * (1 + awareness * 0.18));
      o.baseY = clamp(o.baseY + rand(-9 - awareness * 7, 8 + awareness * 4) * driftMult, o.r + 84, safeMaxY);
      o.nextJukeAt = now + (rand(760 - awareness * 220, 1450 - awareness * 420) * jukeMult) / Math.min(1.5, driftMult);
    }
    return true;
  }

  // REVERSE theme: spawns from the bottom moving upward instead of the normal
  // top-down fall. Rather than threading a flip through every push() site below
  // (asteroid/swarm/bomber/normal/mirror all have their own hardcoded y/vy), this
  // wrapper just corrects whatever _spawnObstacleReal() actually pushed afterward.
  function spawnObstacle(cfg, opts) {
    const before = obstacles.length;
    _spawnObstacleReal(cfg, opts || {});
    if (waveTheme === 'flip' && obstacles.length > before) {
      const o = obstacles[obstacles.length - 1];
      o.y = H + o.r + 10;
      o.vy = -Math.abs(o.vy);
      // The normal "pause partway down, then burst-fire" behavior assumes top-down
      // travel — with obstacles now moving continuously upward instead, force it
      // off so nothing gets stuck mid-pause or fires unexpectedly close-range.
      o.pausedBurstDone = true;
    }
  }
  function _spawnObstacleReal(cfg, opts) {
    // Themed waves bend the asteroid/enemy mix and a few spawn stats without
    // touching waveConfig(cfg) itself — purely a local override of this one roll.
    let ratio = cfg.asteroidRatio;
    if (waveTheme === 'asteroids' || waveTheme === 'ghost' || waveTheme === 'emp') ratio = 1;
    else if (waveTheme === 'enemies' && !cfg.allowEnemyAsteroids) ratio = 0;
    else if (waveTheme === 'swarm') ratio = 0.1;
    else if (waveTheme === 'goldrush') ratio = 0.85;
    else if (waveTheme === 'mirror') ratio = 1;
    const activeFaceCap = cfg.activeFaceCap || 0;
    const faceCapReached = activeFaceCap && obstacles.filter(o => o.type === 'face' && !o.isTrapped && o.alive !== false).length >= activeFaceCap;
    const forceAsteroid = !!(opts && opts.forceAsteroid);
    const forceFace = !!(opts && opts.forceFace);
    const isAsteroid = !forceFace && (forceAsteroid || faceCapReached || (!(opts && opts.forceNormalEnemy) && Math.random() < ratio));
    if (isAsteroid) {
      const r = rand(ASTEROID_R_MIN, ASTEROID_R_MAX);
      const sides = 7 + Math.floor(Math.random() * 5);
      const verts = Array.from({length:sides}, (_,i) => {
        const a = (i/sides)*Math.PI*2;
        const rr = r * (0.7 + Math.random()*0.3);
        return [Math.cos(a)*rr, Math.sin(a)*rr];
      });
      // ALL ASTEROIDS: controlled storm, not a single screen-flood. Same direction,
      // slightly slower than normal rock speed, and tiny lane drift so it feels alive
      // without creating impossible diagonal clumps.
      const jitter = waveTheme !== 'asteroids';
      const rockSpeedMult = cfg.asteroidSpeedMult == null ? 1 : cfg.asteroidSpeedMult;
      obstacles.push({ type:'asteroid', x:rand(r,W-r), y:-r-10, vx: jitter ? rand(-0.4,0.4)*cfg.speed*rockSpeedMult : rand(-0.08,0.08)*cfg.speed*rockSpeedMult, vy: (jitter ? cfg.speed*(0.8+Math.random()*0.4) : cfg.speed*0.82) * rockSpeedMult, r, verts, rot:0, rotSpeed:rand(-0.02,0.02), hp:1, shadeSeed: Math.random() * 1000, rockStyle: Math.floor(Math.random() * 3) });
    } else {
      // Random trapped heroes in regular waves are disabled. The campaign already
      // has one rescue target per boss/chapter beat, so surprise hero spawns made the
      // rescue count feel noisy instead of intentional.
      const canRandomRescue = false;
      let isTrapped = false;
      let traitorType = (opts && opts.forceTraitorType) || traitorTypeForWave(wave);
      const purpleProfile = purpleWaveProfileForWave(wave);
      if (traitorType === 'purple' && !(opts && opts.ignorePurpleCap)) {
        const activePurple = obstacles.filter(o => o.type === 'face' && o.traitorType === 'purple' && !o.isTrapped && o.alive !== false).length;
        if (activePurple >= purpleProfile.screenCap) traitorType = 'red';
      }
      let ci = isTrapped ? nextMissionCaptiveIndex(waveCaptivesSeen) : missionTraitorIndexForType(traitorType);
      if (isTrapped && ci < 0) { isTrapped = false; ci = missionTraitorIndexForType(traitorType); }
      if (isTrapped) waveCaptivesSeen.add(ci);
      // Enemies take 3 hits to clear; trapped heroes still resolve via the ring, hp unused for them.
      // Non-hero enemies descend slower and pause partway down for a burst of fire before
      // continuing — a middle ground between "charges the line" and "just hovers and shoots":
      // keeps some advance pressure but spaces out how much is closing in on the player at once.
      if (waveTheme === 'swarm') {
        // Many small, weak, fast enemies instead of a few tough ones. Faster now
        // that powerups are banked, not lost if you can't immediately catch one —
        // there's more of a safety net to draw on, so this can push harder.
        const r = FACE_R * 0.56;
        obstacles.push({ type:'face', behavior:'swarmer', x:rand(r,W-r), y:-r-10, vx:rand(-0.55,0.55)*cfg.speed, vy:cfg.speed*1.62, r, ci: nextMissionEnemyIndex(), hp:cfg.enemyHpOverride || 1, isTrapped:false, ringHp:0, pausedBurstDone:true, paused:false, pauseUntil:0, burstShotsLeft:0, lastBurstShot:0, swarmerFlashSeed: Math.random() * 1000 });
        return;
      }
      if (waveTheme === 'bomber') {
        // Capped at 1 on screen at a time. Bomber is funniest as a readable dive,
        // not a stack of overlapping dives on a phone-sized lane.
        if (obstacles.filter(o => o.isBomber).length < 1) {
          const x = rand(FACE_R, W-FACE_R);
          const dx = (player ? player.x - x : 0);
          // Faster dive and more HP than before — same "banked powerups give more
          // safety net" reasoning as SWARM.
          obstacles.push({ type:'face', x, y:-FACE_R-10, vx: dx*0.008, vy: cfg.speed*1.45, r:FACE_R, ci: nextMissionEnemyIndex(), hp:4, isTrapped:false, ringHp:0, pausedBurstDone:true, paused:false, pauseUntil:0, burstShotsLeft:0, lastBurstShot:0, isBomber:true });
          SFX.bomberDive();
          return;
        }
      }
      const faceVyMult = cfg.enemyVyMult == null ? 1 : cfg.enemyVyMult;
      const enemyAwareness = normalEnemyAwarenessForWave(wave);
      const enemyDriftMult = (cfg.enemyDriftMult == null ? 1 : cfg.enemyDriftMult) * (1 + enemyAwareness * 0.10);
      const enemyDodgeMult = (cfg.enemyDodgeMult == null ? 0 : cfg.enemyDodgeMult) * (1 + enemyAwareness * 0.22);
      const personalityRoll = Math.random();
      const looseCutoff = Math.max(0.02, 0.12 - enemyAwareness * 0.11);
      const peskyCutoff = Math.max(looseCutoff + 0.28, 0.62 - enemyAwareness * 0.18);
      const elusiveCutoff = Math.max(peskyCutoff + 0.18, 0.90 - enemyAwareness * 0.12);
      const enemyPersonality = personalityRoll < looseCutoff ? 'loose' : personalityRoll < peskyCutoff ? 'shifty' : personalityRoll < elusiveCutoff ? 'pesky' : 'elusive';
      const personalityDrift = enemyPersonality === 'elusive' ? 1.64 : enemyPersonality === 'pesky' ? 1.44 : enemyPersonality === 'loose' ? 1.02 : 1.2;
      const personalityDodge = enemyPersonality === 'elusive' ? 2.06 : enemyPersonality === 'pesky' ? 1.72 : enemyPersonality === 'loose' ? 0.96 : 1.26;
      const personalityJuke = enemyPersonality === 'elusive' ? 0.36 : enemyPersonality === 'pesky' ? 0.46 : enemyPersonality === 'loose' ? 1.08 : 0.74;
      const traitorDrift = traitorType === 'purple' ? purpleProfile.driftMult : 1;
      const traitorDodge = traitorType === 'purple' ? purpleProfile.dodgeMult : 1;
      const faceHp = isTrapped ? 1 : (cfg.enemyHpOverride || 3);
      const faceR = FACE_R;
      const holdMinY = Math.max(118, H * 0.26);
      const holdMaxY = Math.max(holdMinY + 42, Math.min(dangerY - 78, H * 0.75));
      const holdY = rand(holdMinY, holdMaxY);
      const nearbyHold = obstacles.filter(o => o.behavior === 'holdDrift' && o.y > 0 && Math.abs(o.y - holdY) < FACE_R * 3.2).sort((a, b) => Math.abs(a.x - W / 2) - Math.abs(b.x - W / 2));
      let spawnX = rand(faceR, W - faceR);
      if (nearbyHold.length) {
        for (let tries = 0; tries < 8; tries++) {
          const candidate = rand(faceR, W - faceR);
          const tooClose = nearbyHold.some(o => Math.abs(o.x - candidate) < FACE_R * 2.6);
          if (!tooClose) { spawnX = candidate; break; }
        }
      }
      obstacles.push({ type:'face', behavior: isTrapped ? 'captiveDrift' : 'holdDrift', x:spawnX, y:-faceR-10, vx:rand(-0.55,0.55)*cfg.speed*0.22*enemyDriftMult*personalityDrift*traitorDrift, vy:cfg.speed*(0.7+Math.random()*0.5)*(isTrapped?0.82:0.38)*faceVyMult, r:faceR, ci, hp: faceHp, isTrapped, ringHp: isTrapped ? CAPTIVE_RING_HP : 0, maxRingHp: isTrapped ? CAPTIVE_RING_HP : 0, pausedBurstDone: true, paused: false, pauseUntil: 0, burstShotsLeft: 0, lastBurstShot: 0, holdY, baseY: holdY, born: Date.now(), driftSeed: Math.random() * Math.PI * 2, driftAmpY: rand(7, 12 + enemyAwareness * 7) * enemyDriftMult * personalityDrift * traitorDrift, enemyDriftMult: enemyDriftMult * personalityDrift * traitorDrift, enemyDodgeMult: enemyDodgeMult * personalityDodge * traitorDodge, enemyJukeMult: personalityJuke, enemyAwareness, enemyPersonality, traitorType, nextDodgeAt: Date.now() + rand(420 - enemyAwareness * 120, 980 - enemyAwareness * 260), nextDriftTurnAt: Date.now() + rand(580 - enemyAwareness * 120, 1220 - enemyAwareness * 260) / Math.min(1.55, enemyDriftMult * personalityDrift * traitorDrift), nextJukeAt: Date.now() + rand(520 - enemyAwareness * 130, 1300 - enemyAwareness * 300) * personalityJuke });
    }
  }

  function spawnBlackoutHiddenEnemies() {
    if (waveTheme !== 'blackout' || !currentCfg || obstacles.some(o => o.blackoutHiddenEnemy)) return;
    [0.16, 0.33, 0.5, 0.67, 0.84].forEach((xp, i) => {
      obstacles.push({
        type: 'face',
        x: clamp(W * xp, FACE_R, W - FACE_R),
        y: -FACE_R - 60 - i * 90,
        vx: 0,
        vy: currentCfg.speed * 0.44,
        r: FACE_R,
        ci: nextMissionEnemyIndex(),
        hp: 3,
        isTrapped: false,
        ringHp: 0,
        pausedBurstDone: true,
        paused: false,
        pauseUntil: 0,
        burstShotsLeft: 0,
        lastBurstShot: 0,
        blackoutHiddenEnemy: true
      });
    });
  }

  function grayTetherTemplate(index) {
    const safeTop = Math.max(120, Math.min(176, H * 0.16 + 24));
    const templates = [
      { gray: { x: W * 0.24, y: safeTop }, node: { x: W * 0.74, y: H * 0.54 }, label: 'BREAK TETHER' },
      { gray: { x: W * 0.76, y: safeTop + 8 }, node: { x: W * 0.26, y: H * 0.54 }, label: 'SHIELD NODE' },
      { gray: { x: W * 0.50, y: safeTop - 2 }, node: { x: W * 0.50, y: H * 0.62 }, label: 'TETHER CORE' },
      { gray: { x: W * 0.34, y: safeTop + 12 }, node: { x: W * 0.78, y: H * 0.48 }, label: 'ALIEN SOURCE' },
      { gray: { x: W * 0.66, y: safeTop + 12 }, node: { x: W * 0.22, y: H * 0.48 }, label: 'ALIEN SOURCE' }
    ];
    const t = templates[index % templates.length];
    const bossR = boss ? boss.r : BOSS_R;
    const clampPoint = p => ({
      x: clamp(p.x, bossR + 30, W - bossR - 30),
      y: clamp(p.y, 82, Math.min(H - 92, H * 0.80))
    });
    return { gray: clampPoint(t.gray), node: clampPoint(t.node), label: t.label };
  }

  function graySetPhase(b, phase, duration, now) {
    b.grayState.phase = phase;
    b.grayState.phaseStarted = now;
    b.grayState.phaseUntil = now + duration;
  }

  function initGrayVisitorState(b, now) {
    if (!b || b.attackType !== 'tether') return;
    const firstTemplate = grayTetherTemplate(0);
    b.x = firstTemplate.gray.x;
    b.y = firstTemplate.gray.y;
    b.vx = 0;
    b.nextAttack = now + 999999;
    b.grayState = {
      phase: 'appear',
      phaseStarted: now,
      phaseUntil: now + 850,
      templateIndex: 0,
      cycle: 0,
      tetherSpawned: false
    };
    b.ghostUntil = now + 620;
    b.phaseAlphaUntil = now + 720;
    b.invisibleUntil = 0;
    b.tetherShieldActive = false;
    b.tetherSource = null;
    b.tetherVulnerableUntil = 0;
    b.grayTeleport = null;
  }

  function grayFireAlienOrbs(b, now) {
    const bt = campaignTier(wave);
    const count = bt >= 2 ? 4 : 3;
    const speed = bossProjectileSpeed(b, (3.75 + bt * 0.18) * 2);
    for (let k = 0; k < count; k++) {
      const spread = count === 1 ? 0 : (k - (count - 1) / 2) * 0.18;
      const aim = Math.atan2((player ? player.y : H * 0.78) - b.y, (player ? player.x : W / 2) - b.x) + spread;
      enemyBullets.push({
        x: b.x, y: b.y + b.r * 0.56,
        vx: Math.cos(aim) * speed, vy: Math.sin(aim) * speed,
        r: 27.8, theme: 'greenOrb', damage: bossDamage(b, 12), born: now,
        homing: 0.018,
        maxSpeed: speed * 2 + 0.56,
        visualScale: 0.92
      });
    }
    addFloatText('ORB SHOTS', b.x, b.y + b.r + 18, '#65f0ff', 14);
  }

  function graySpawnTetherSource(b, now) {
    const st = b.grayState;
    const t = grayTetherTemplate(st.templateIndex);
    b.tetherShieldActive = true;
    b.tetherVulnerableUntil = 0;
    b.tetherSource = {
      x: t.node.x,
      y: t.node.y,
      r: clamp(Math.min(W, H) * 0.033, 17, 24),
      hp: 3 + Math.min(2, Math.floor(campaignTier(wave) / 2)),
      maxHp: 3 + Math.min(2, Math.floor(campaignTier(wave) / 2)),
      born: now,
      baseX: t.node.x,
      baseY: t.node.y,
      ampX: clamp(W * 0.08, 20, 42),
      ampY: clamp(H * 0.028, 12, 24),
      driftSeed: Math.random() * Math.PI * 2,
      hitUntil: 0,
      zapUntil: 0
    };
    // Gray's shield is a tether puzzle now, not a portal/trick-shot puzzle.
    addFloatText(t.label, b.tetherSource.x, b.tetherSource.y - b.tetherSource.r - 16, '#65f0ff', 14);
    addFloatText('SHOOT THE TETHER!', b.x, b.y + b.r + 18, '#b36bff', 16);
    spaceSfx('boss.gray.projectile');
  }

  function grayUpdateTetherSource(b, now) {
    const src = b && b.tetherSource;
    if (!src) return;
    // Keep the shield source floating, but constrained so the tether stays readable
    // and the target never drifts into Gray's body or off the mobile play area.
    const age = now - (src.born || now);
    src.x = clamp(src.baseX + Math.sin(age * 0.00125 + src.driftSeed) * src.ampX, src.r + 24, W - src.r - 24);
    src.y = clamp(src.baseY + Math.cos(age * 0.00105 + src.driftSeed * 1.7) * src.ampY, 110, Math.min(H - 110, H * 0.78));
  }

  function updateGrayVisitorBoss(b, now) {
    if (!b || b.attackType !== 'tether') return;
    if (!b.grayState) initGrayVisitorState(b, now);
    const st = b.grayState;
    b.vx = 0;
    grayUpdateTetherSource(b, now);
    if (st.phase === 'appear' && now >= st.phaseUntil) {
      st.tetherSpawned = false;
      graySetPhase(b, 'tetherShield', 6200, now);
    } else if (st.phase === 'dissolve' && now >= st.phaseUntil) {
      const nextTemplate = grayTetherTemplate(st.templateIndex + 1);
      b.grayTeleport = {
        fromX: b.x, fromY: b.y,
        toX: nextTemplate.gray.x, toY: nextTemplate.gray.y,
        start: now,
        departAt: now,
        reappearAt: now + 980,
        end: now + 1280,
        arrived: false
      };
      st.templateIndex++;
      graySetPhase(b, 'ghostMove', 980, now);
    } else if (st.phase === 'ghostMove' && now >= st.phaseUntil) {
      const current = grayTetherTemplate(st.templateIndex);
      b.x = current.gray.x;
      b.y = current.gray.y;
      b.grayTeleport = null;
      b.invisibleUntil = 0;
      b.ghostUntil = now + 620;
      b.phaseAlphaUntil = now + 620;
      miniExplosion(b.x, b.y, '#65f0ff');
      addFloatText('REAPPEAR!', b.x, b.y + b.r + 18, '#65f0ff', 14);
      graySetPhase(b, 'reappear', 680, now);
    } else if (st.phase === 'reappear' && now >= st.phaseUntil) {
      st.tetherSpawned = false;
      graySetPhase(b, 'tetherShield', 6200, now);
    } else if (st.phase === 'tetherShield') {
      if (!st.tetherSpawned) {
        graySpawnTetherSource(b, now);
        st.nextOrbAt = now + 260;
        st.tetherSpawned = true;
      }
      if (now >= (st.nextOrbAt || 0)) {
        grayFireAlienOrbs(b, now);
        st.nextOrbAt = now + 1000;
      }
      if (now >= st.phaseUntil) {
        st.cycle++;
        st.tetherSpawned = false;
        b.tetherSource = null;
        b.tetherShieldActive = true;
        graySetPhase(b, 'dissolve', 620, now);
        b.ghostUntil = now + 2100;
        b.invisibleUntil = now + 720;
        b.phaseAlphaUntil = now + 2100;
        b._glitchAt = now;
        addFloatText('GLITCH SHIFT', b.x, b.y + b.r + 18, '#b36bff', 14);
      }
    } else if (st.phase === 'vulnerable' && now >= st.phaseUntil) {
      graySetPhase(b, 'dissolve', 620, now);
      b.tetherVulnerableUntil = 0;
      b.tetherShieldActive = true;
      b.ghostUntil = now + 2100;
      b.invisibleUntil = now + 720;
      b.phaseAlphaUntil = now + 2100;
      b._glitchAt = now;
      addFloatText('SHIELD REFORMING', b.x, b.y + b.r + 18, '#b36bff', 14);
    }
  }

  function grayBreakTether(b, now) {
    if (!b || b.attackType !== 'tether' || !b.grayState) return;
    b.tetherSource = null;
    b.tetherShieldActive = false;
    b.tetherVulnerableUntil = now + bossWindowMs(b, 3400);
    b.forcefieldFlashUntil = now + 520;
    b.forcefieldShakeUntil = now + 320;
    b.forcefieldShakeSeed = Math.random() * Math.PI * 2;
    b.grayState.tetherSpawned = false;
    graySetPhase(b, 'vulnerable', b.tetherVulnerableUntil - now, now);
    miniExplosion(b.x, b.y, '#65f0ff');
    addFloatText('SHIELD DOWN!', b.x, b.y - b.r - 20, '#33ff66', 18);
    spaceSfx('boss.gray.projectile');
  }

  function grayHandleTetherSourceHit(shot, b, now) {
    const src = b && b.tetherSource;
    if (!src || !b.tetherShieldActive || shot.vy === 999) return false;
    if (Math.hypot(shot.x - src.x, shot.y - src.y) >= src.r + 6) return false;
    shot.vy = 999;
    src.hp--;
    src.hitUntil = now + 220;
    src.zapUntil = now + 420;
    miniExplosion(shot.x, shot.y, '#65f0ff');
    if (src.hp <= 0) {
      grayBreakTether(b, now);
    } else {
      addFloatText('TETHER HIT', src.x, src.y - src.r - 12, '#65f0ff', 13);
      if (SFX.hit) SFX.hit();
    }
    return true;
  }

  function grayShieldBlocksBossHit(b, now) {
    if (!b || b.attackType !== 'tether') return false;
    if (now < (b.invisibleUntil || 0)) return true;
    if (b.grayState && (b.grayState.phase === 'dissolve' || b.grayState.phase === 'ghostMove' || b.grayState.phase === 'appear')) return true;
    if (b.tetherShieldActive) return true;
    return now > (b.tetherVulnerableUntil || 0);
  }

  function grayBounceShieldShot(shot, b, now) {
    shot.vy = 999;
    b.forcefieldFlashUntil = now + 320;
    b.forcefieldShakeUntil = now + 260;
    b.forcefieldShakeSeed = Math.random() * Math.PI * 2;
    addFloatText(b.tetherSource ? 'BREAK TETHER!' : 'PHASING!', b.x, b.y - b.r - 20, '#b36bff', 14);
    miniExplosion(shot.x, shot.y, '#b36bff');
    playShieldBellPing();
  }

  function drawGrayTetherField(b, now) {
    const src = b.tetherSource;
    const shieldOn = b.tetherShieldActive || now < (b.forcefieldFlashUntil || 0);
    if (src) {
      const sx = src.x - b.x, sy = src.y - b.y;
      const hot = now < (src.hitUntil || 0);
      ctx.save();
      ctx.globalAlpha = 0.56 + (hot ? 0.26 : 0);
      ctx.strokeStyle = hot ? 'rgba(234,255,255,0.94)' : 'rgba(101,240,255,0.78)';
      ctx.lineWidth = hot ? 4.2 : 3;
      ctx.setLineDash([10, 7]);
      ctx.lineDashOffset = -((now / 58) % 17);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sx, sy); ctx.stroke();
      ctx.setLineDash([]);
      if (now < (src.zapUntil || 0)) {
        const zap = Math.max(0, Math.min(1, (src.zapUntil - now) / 420));
        ctx.globalAlpha = 0.62 + zap * 0.35;
        ctx.shadowColor = '#eaffff';
        ctx.shadowBlur = 18 + zap * 18;
        ctx.strokeStyle = '#eaffff';
        ctx.lineWidth = 3.2 + zap * 2.4;
        ctx.beginPath();
        for (let i = 0; i <= 9; i++) {
          const t = i / 9;
          const jitter = i === 0 || i === 9 ? 0 : Math.sin(now * 0.08 + i * 2.1) * (5 + zap * 7);
          const nx = -sy / (Math.hypot(sx, sy) || 1);
          const ny = sx / (Math.hypot(sx, sy) || 1);
          const x = sx * (1 - t) + nx * jitter;
          const y = sy * (1 - t) + ny * jitter;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.shadowColor = '#65f0ff';
      ctx.shadowBlur = hot ? 18 : 10;
      const pulse = 1 + Math.sin(now * 0.014) * 0.08;
      ctx.fillStyle = 'rgba(101,240,255,0.18)';
      ctx.beginPath(); ctx.arc(sx, sy, src.r * 1.55 * pulse, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#65f0ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(sx, sy, src.r * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#dffcff';
      ctx.beginPath(); ctx.arc(sx, sy, src.r * 0.45, 0, Math.PI * 2); ctx.fill();
      const pct = Math.max(0, src.hp / src.maxHp);
      ctx.shadowBlur = 0;
      ctx.fillStyle = 'rgba(8,16,42,0.82)';
      ctx.fillRect(sx - src.r, sy + src.r + 8, src.r * 2, 4);
      ctx.fillStyle = '#33ff66';
      ctx.fillRect(sx - src.r, sy + src.r + 8, src.r * 2 * pct, 4);
      ctx.restore();
    }
    if (shieldOn) {
      const flash = now < (b.forcefieldFlashUntil || 0) ? 1 : 0;
      const shaking = now < (b.forcefieldShakeUntil || 0);
      const shakeT = shaking ? (b.forcefieldShakeUntil - now) / 260 : 0;
      const shakeSeed = b.forcefieldShakeSeed || 0;
      const pulse = 1 + Math.sin(now * 0.012) * 0.035;
      ctx.save();
      if (shaking) {
        ctx.translate(Math.sin(now * 0.13 + shakeSeed) * 6 * shakeT, Math.cos(now * 0.17 + shakeSeed) * 4 * shakeT);
      }
      const shieldPulse = 1 + Math.sin(now * 0.009) * 0.12;
      ctx.shadowColor = flash ? '#eaffff' : '#b36bff';
      ctx.shadowBlur = b.tetherShieldActive ? 22 + Math.sin(now * 0.014) * 8 : 10;
      ctx.globalAlpha = b.tetherShieldActive ? (0.72 + flash * 0.24 + shakeT * 0.12) : (0.24 + flash * 0.18);
      ctx.strokeStyle = flash ? 'rgba(234,255,255,0.98)' : 'rgba(179,107,255,0.96)';
      ctx.lineWidth = flash || shaking ? 6.4 : 4.8;
      ctx.setLineDash([8, 7]);
      ctx.lineDashOffset = -((now / 65) % 15);
      ctx.beginPath(); ctx.arc(0, 0, b.r * 1.34 * pulse * shieldPulse, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(101,240,255,0.82)';
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.arc(0, 0, b.r * 1.12 * pulse, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = b.tetherShieldActive ? (0.25 + flash * 0.14 + shakeT * 0.08) : 0.10;
      ctx.fillStyle = 'rgba(101,240,255,0.34)';
      ctx.beginPath(); ctx.arc(0, 0, b.r * 1.24 * pulse * shieldPulse, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  // captive=true reskins this exact fight as "free the hero from the jail cell" —
  // same HP/attack pattern/minion-deploy/defeat-reward underneath (those only ever
  // reference boss.x/y/r/hp/..., never the creature directly outside drawBoss()'s
  // body-rendering branch and the three text spots below), just a different look
  // and no minion deploys (a jail cell shouldn't be dispatching reinforcements).
  function spawnBoss(captive, options) {
    options = options || {};
    if (boss) return;
    const guardedRescue = !!options.guardedRescue;
    const captiveCi = (captive || guardedRescue) ? nextMissionCaptiveIndex() : -1;
    if (captive && captiveCi < 0) {
      spawnBoss(false);
      return;
    }
    const creature = captive ? BOSS_CREATURES[Math.floor(Math.random() * BOSS_CREATURES.length)] : (pendingBossCreature || pickBossCreature());
    pendingBossCreature = null;
    if (!captive && creature && creature.name && !creature.isGizmo && [9,11].includes(wave)) campaignSeenBossNames.add(creature.name);
    const gizmoEscape = !!(creature.isGizmo && options.escape);
    const gizmoFinal = !!(creature.isGizmo && options.final);
    const tier = campaignTier(wave);
    const tuning = captive ? { rMult: 1, hpMult: 1, attackDelayMult: 1 } : bossTuningFor(creature, options);
    const hpBase = gizmoEscape ? Math.round(BOSS_HP * (wave === 2 ? 0.82 : 1.06)) : gizmoFinal ? Math.round(BOSS_HP * 1.48) : BOSS_HP;
    const hpUntuned = hpBase + tier * (captive ? 5 : gizmoFinal ? 12 : 8) + Math.min(captive ? 16 : gizmoFinal ? 36 : 24, Math.floor(wave * (captive ? 1.0 : gizmoFinal ? 1.9 : 1.35)));
    const hp = Math.max(1, Math.round(hpUntuned * (tuning.hpMult || 1)));
    const bossR = BOSS_R * (tuning.rMult || 1);
    const attackType = captive ? 'lockpulse' : bossAttackTypeFor(creature);
    const rawAttackDelay = attackType === 'sword'
      ? 3900
      : captive ? Math.max(1650, 2450 - tier * 150 - wave * 12) : Math.max(gizmoFinal ? 1250 : 1450, 2380 - tier * 155 - wave * 14);
    boss = {
      creature, x: W / 2, y: 185, vx: (Math.random() < 0.5 ? -1 : 1) * (captive ? 0.72 : 1.1),
      r: bossR, hp, maxHp: hp,
      tuning,
      attackType,
      nextAttack: Date.now() + (captive ? 2200 : 1800),
      attackDelay: Math.max(900, Math.round(rawAttackDelay * (tuning.attackDelayMult || 1))),
      burstCount: Math.min(gizmoFinal ? 8 : 6, 3 + tier + Math.floor(Math.max(0, wave - 10) / 8)),
      laserPhase: null, laserChargeStart: 0, laserX: 0,
      hitFlash: 0,
      isCaptive: !!captive,
      isGizmo: !!creature.isGizmo,
      isGizmoEscape: gizmoEscape,
      isFinalGizmo: gizmoFinal,
      guardedRescue,
      captiveCi,
      ogreLine: null,
      ogreWaveNo: 0,
      patternData: {},
      signatureActive: false,
      vulnerable: true,
      support: null,
      tacoGuardUntil: 0,
      tacoOpenUntil: 0,
      tacoGuardFlashUntil: 0,
      octoGuardUntil: 0,
      octoDescendUntil: 0,
      octoSpinUntil: 0,
      octoRecoverUntil: 0,
      octoHomeY: 0,
      octoTargetY: 0,
    };
    if (attackType === 'fire') {
      // Phase 3C.5: Dragon breath reads well now; make the boss sweep
      // side-to-side faster so the breath chain snakes across the arena.
      boss.vx *= 2.15;
    } else if (attackType === 'tether') {
      initGrayVisitorState(boss, Date.now());
    }
    bossDeployTimer = Date.now() + 3500; // first reinforcement a little after the fight starts
    addFloatText(captive ? `FREE ${GAME_CHARS[captiveCi].name}!` : `${creature.name} INCOMING`, W / 2, 140, captive ? '#00e5ff' : '#ff4444', 22);
    if (!captive && creature && creature.name === 'GRAY VISITOR') {
      addFloatText('SHOOT THE VISITOR — USE PORTALS', W / 2, 176, '#b36bff', 15, { vy: -0.05, fade: 0.004 });
    }
    if (captive) showTopBanner(`FREE ${GAME_CHARS[captiveCi].name}`, 'good');
    else if (guardedRescue && captiveCi >= 0) showTopBanner(`${creature.name} HAS ${GAME_CHARS[captiveCi].name}`, 'bad');
    SFX.over();
  }

  // Lighter-weight encounter for GHOST ATTACK (teleports, bounces, fires ice shots)
  // and EMP (holds still, fires zap shots) — see the `if (miniBoss)` block in
  // loop() for movement/attack behavior. Reuses BOSS_CREATURES/drawPixelSprite, no
  // new assets. GHOST is treated like a real boss fight (normal spawning fully
  // paused via the same check as `boss` — see startWaveSpawn's doSpawn): tankier,
  // smaller (half the real boss's radius, since it's also bouncing and harder to
  // pin down), and constantly moving instead of just sitting between teleports.
  function spawnMiniBoss(kind) {
    if (miniBoss) return;
    const creature = BOSS_CREATURES[Math.floor(Math.random() * BOSS_CREATURES.length)];
    const isGhost = kind === 'ghost';
    const r = isGhost ? BOSS_R * 0.5 : MINIBOSS_R;
    const hp = isGhost ? 25 : MINIBOSS_HP;
    miniBoss = {
      kind, creature, x: rand(r + 20, W - r - 20), y: 140,
      r, hp, maxHp: hp,
      vx: isGhost ? (Math.random() < 0.5 ? -1 : 1) * 2.2 : 0,
      vy: isGhost ? (Math.random() < 0.5 ? -1 : 1) * 1.6 : 0,
      nextAttack: Date.now() + 1500, hitFlash: 0, opacity: 1,
      phase: 'active', phaseStart: Date.now(),
      teleportAt: isGhost ? Date.now() + 3000 + Math.random() * 1500 : Infinity,
    };
    addFloatText(isGhost ? 'GHOST ATTACK!' : 'EMP WARNING!', W / 2, 140, '#ff4444', 22);
    SFX.over();
  }

  // Mirror mode is three readable beats, not a single blob: one scout, then a
  // small triangle, then a bowling-pin triangle. Each enemy hovers and tracks the
  // player's x every frame — see the obstacle-update loop for the tracking.
  function spawnMirrorGroup(layout, label) {
    const baseY = H * 0.18;
    layout.forEach(([offset, row], i) => {
      const ci = nextMissionEnemyIndex();
      obstacles.push({
        type:'face', x: Math.max(FACE_R, Math.min(W - FACE_R, W / 2 + offset)), y: baseY + row * 38,
        vx:0, vy:0, r:FACE_R * 0.95, ci, hp:4, isTrapped:false, ringHp:0,
        pausedBurstDone:true, paused:false, pauseUntil:0, burstShotsLeft:0, lastBurstShot:0,
        isMirror:true, mirrorOffset: offset, mirrorEase: 0.085 + i * 0.018
      });
    });
    addFloatText(label, W/2, 140, '#ff4444', 20);
  }
  function spawnMirrorEnemy() {
    mirrorStageTimers.forEach(clearTimeout);
    mirrorStageTimers = [];
    mirrorSequenceActive = true;
    const gap = Math.min(72, W * 0.17);
    const stages = [
      { delay: 0, label: 'MIRROR SCOUT!', layout: [[0, 0]] },
      { delay: 3900, label: 'MIRROR TRIANGLE!', layout: [[0, 0], [-gap, 1], [gap, 1]] },
      { delay: 8300, label: 'MIRROR SWARM!', layout: [[0, 0], [-gap * 0.72, 1], [gap * 0.72, 1], [-gap * 1.44, 2], [0, 2], [gap * 1.44, 2]] },
    ];
    stages.forEach((stage, idx) => {
      const timer = setTimeout(() => {
        if (state !== 'playing' || waveTheme !== 'mirror') return;
        spawnMirrorGroup(stage.layout, stage.label);
        if (idx === stages.length - 1) mirrorSequenceActive = false;
      }, stage.delay);
      mirrorStageTimers.push(timer);
    });
  }

  function spawnCampaignRescueLock() {
    if (!player || wave !== 6 || waveCaptivesSeen.has('campaign-lock')) return;
    const ci = nextMissionCaptiveIndex(waveCaptivesSeen);
    if (ci < 0) return;
    waveCaptivesSeen.add('campaign-lock');
    waveCaptivesSeen.add(ci);
    const r = FACE_R * 1.08;
    const ringHp = currentCfg && currentCfg.rescueRingHp ? currentCfg.rescueRingHp : 24;
    obstacles.push({
      type:'face', x: W / 2, y: Math.max(92, H * 0.18), vx: 0, vy: (currentCfg ? currentCfg.speed : O_SPEED_BASE) * 0.12,
      r, ci, hp: 1, isTrapped: true, ringHp, maxRingHp: ringHp,
      pausedBurstDone: true, paused: false, pauseUntil: 0, burstShotsLeft: 0, lastBurstShot: 0,
      campaignRescueLock: true
    });
    const rescueName = GAME_CHARS[ci] && GAME_CHARS[ci].name ? GAME_CHARS[ci].name.toUpperCase() : 'THE MOBE';
    addFloatText(`HELP FREE ${rescueName}!`, W / 2, H * 0.31, '#00e5ff', 44, { vy: -0.18, fade: 0.0038 });
    showTopBanner(`HELP FREE ${rescueName}`, 'good');
  }


  const POWERUP_R = 16; // Phase 2C.1: 10% smaller pickups reduce visual clutter
  // Phase 1 tuning: banked socket pickups should be readable/catchable, not frantic.
  // They already fall straight down (vy only, no vx); keep the motion simple and slow
  // enough that the player can make a real socket-inventory decision.
  function hpFallSpeed() { return (currentCfg ? currentCfg.speed : O_SPEED_BASE) * 1.35; }
  function powerupFallSpeed() { return hpFallSpeed() * 1.05; }

  function spawnPowerup(forcedType) {
    if (currentCfg && currentCfg.maxSocketPowerups != null) {
      currentCfg._socketPowerupsSpawned = currentCfg._socketPowerupsSpawned || 0;
      if (currentCfg._socketPowerupsSpawned >= currentCfg.maxSocketPowerups) return false;
    }
    const types = ['gun', 'bomb', 'shield'];
    let type = forcedType;
    if (!type && currentCfg && currentCfg.forcePowerupType && !currentCfg._forcedPowerupSpawned) {
      type = currentCfg.forcePowerupType;
      currentCfg._forcedPowerupSpawned = true;
    }
    if (!type || !types.includes(type)) type = types[Math.floor(Math.random() * types.length)];
    powerups.push({ type, x: rand(POWERUP_R, W - POWERUP_R), y: -POWERUP_R - 10, vy: powerupFallSpeed(), r: POWERUP_R, bob: Math.random() * Math.PI * 2 });
    if (currentCfg) currentCfg._socketPowerupsSpawned = (currentCfg._socketPowerupsSpawned || 0) + 1;
    return true;
  }

  // Rare, risky pickup — could be great or could backfire. "Just enough to be
  // special": a much longer random interval than the other two schedules.
  function spawnMysteryBox() {
    // Falls a lot slower than every other pickup — it's on a parachute, it's rare,
    // and now it's a shoot target (ringHp) rather than something to catch, so there's
    // no rush to intercept it before it lands.
    powerups.push({ type: 'mystery', x: rand(POWERUP_R, W - POWERUP_R), y: -POWERUP_R - 10, vy: powerupFallSpeed() * 0.2, r: POWERUP_R, bob: Math.random() * Math.PI * 2, ringHp: 5 });
  }
  function scheduleMysteryBox() {
    clearTimeout(mysteryTimer);
    const range = currentCfg && currentCfg.mysteryDelayRange ? currentCfg.mysteryDelayRange : [9000, 15000];
    mysteryTimer = setTimeout(() => {
      if (state !== 'playing') return;
      if (campaignAllows('allowMystery') && !boss && !waveTransitioning) spawnMysteryBox();
      scheduleMysteryBox();
    }, range[0] + Math.random() * (range[1] - range[0]));
  }

  // MUSIC ("JAM SESSION") theme — purely fun, no extra danger: asteroids/enemies
  // fall exactly as normal, but instrument pickups also drop. Shoot one (not catch
  // — same shoot-target language as the mystery ring) for its own note/sound and points.
  const INSTRUMENT_KINDS = ['guitar', 'piano', 'saxophone'];
  function spawnInstrument() {
    if (currentCfg && currentCfg.maxInstruments != null) {
      currentCfg._instrumentsSpawned = currentCfg._instrumentsSpawned || 0;
      if (currentCfg._instrumentsSpawned >= currentCfg.maxInstruments) return false;
    }
    const kind = INSTRUMENT_KINDS[Math.floor(Math.random() * INSTRUMENT_KINDS.length)];
    powerups.push({ type: 'instrument', kind, x: rand(POWERUP_R, W - POWERUP_R), y: -POWERUP_R - 10, vy: powerupFallSpeed() * 0.55, r: POWERUP_R, bob: Math.random() * Math.PI * 2 });
    if (currentCfg) currentCfg._instrumentsSpawned = (currentCfg._instrumentsSpawned || 0) + 1;
    return true;
  }
  let instrumentTimer = null;
  function scheduleInstrument() {
    clearTimeout(instrumentTimer);
    const range = currentCfg && currentCfg.instrumentDelayRange ? currentCfg.instrumentDelayRange : [520, 860];
    instrumentTimer = setTimeout(() => {
      if (state !== 'playing') return;
      if (waveTheme === 'music' && !boss && !waveTransitioning) spawnInstrument();
      scheduleInstrument();
    }, range[0] + Math.random() * (range[1] - range[0]));
  }

  let powerupTimer = null;
  function schedulePowerup() {
    clearTimeout(powerupTimer);
    // GOLD RUSH: heavy powerup rain, the whole point of the wave — unaffected by the
    // halving below. Normal rate halved now that catching one banks it instead of
    // using it instantly — no longer "use it now or it's wasted," so it can afford
    // to be rarer and feel more deliberate.
    const tier = campaignTier(wave);
    const range = currentCfg && currentCfg.powerupDelayRange
      ? currentCfg.powerupDelayRange
      : waveTheme === 'goldrush' ? [600, 1500] : [Math.max(8200, 10400 - tier * 420), Math.max(15000, 19500 - tier * 750)];
    powerupTimer = setTimeout(() => {
      if (state !== 'playing') return;
      if (campaignAllows('allowPowerups') && !boss && !waveTransitioning) spawnPowerup();
      schedulePowerup();
    }, range[0] + Math.random() * (range[1] - range[0]));
  }

  // Small green orb HP pickup with a plus sign — a smooth circle rather than a jagged
  // asteroid shape, so it's never visually confused with an actual (hostile) asteroid
  // at a glance.
  function spawnHpPowerup() {
    const roll = Math.random();
    const hpValue = roll < 0.15 ? 5 : roll < 0.5 ? 3 : 2;
    const r = hpValue === 5 ? 18 : hpValue === 3 ? 13.5 : 11;
    powerups.push({ type:'hp', hpValue, x: rand(r, W-r), y: -r-10, vy: hpFallSpeed(), r, bob: Math.random() * Math.PI * 2 });
  }

  function spawnBossHpDrop(b) {
    const r = 13.5;
    const x = rand(r + 18, W - r - 18);
    powerups.push({ type:'hp', hpValue: 3, x, y: -r-10, vy: hpFallSpeed() * 0.94, r, bob: Math.random() * Math.PI * 2, bossSupport: true });
    return true;
  }

  function spawnBossSocketDrop(b) {
    const types = ['shield', 'bomb', 'gun'];
    let type = b && b.attackType === 'sword' ? 'shield' : types[Math.floor(Math.random() * types.length)];
    powerups.push({ type, x: rand(POWERUP_R, W - POWERUP_R), y: -POWERUP_R - 10, vy: powerupFallSpeed() * 0.96, r: POWERUP_R, bob: Math.random() * Math.PI * 2, bossSupport: true });
    return true;
  }

  function bossSupportQuietWindow(b) {
    if (!b || b.isCaptive || waveTransitioning) return false;
    if (b.ogreLine) return false;
    const activeSignature = enemyBullets.some(x => x.donkeyLine || x.knightLaneSword || x.portalExit || x.portalEnter || x.tennis || x.bone || x.theme === 'sword');
    if (activeSignature && b.attackType !== 'gizmo') return false;
    // Drops should usually show up in the tense beat before the next pattern,
    // not while the strike is already active. That creates the tradeoff: go for
    // HP/powerup now, or stay positioned for the incoming attack?
    const untilNext = (b.nextAttack || 0) - Date.now();
    return untilNext < 1450 || untilNext > 99999;
  }

  function updateBossSupportDrops() {
    if (!boss || boss.isCaptive || waveTransitioning || state !== 'playing') return;
    const now = Date.now();
    if (!boss.support) {
      boss.support = {
        hpDrops: 0,
        powerupDrops: 0,
        maxHp: boss.isFinalGizmo ? 3 : boss.attackType === 'sword' ? 3 : 2,
        maxPowerups: 1,
        nextHpAt: now + (boss.isFinalGizmo ? 5200 : 3600),
        nextPowerupAt: now + (boss.isFinalGizmo ? 7200 : 5400),
      };
    }
    const sup = boss.support;
    if (!bossSupportQuietWindow(boss)) return;
    if (sup.powerupDrops < sup.maxPowerups && now >= sup.nextPowerupAt) {
      spawnBossSocketDrop(boss);
      sup.powerupDrops++;
      sup.nextPowerupAt = Infinity;
      addFloatText('BOSS DROP!', W / 2, H * 0.28, '#ffe61a', 18);
    }
    if (sup.hpDrops < sup.maxHp && now >= sup.nextHpAt) {
      spawnBossHpDrop(boss);
      sup.hpDrops++;
      sup.nextHpAt = now + (boss.isFinalGizmo ? 5400 : 4300);
    }
  }

  let hpPowerupTimer = null;
  function scheduleHpPowerup() {
    clearTimeout(hpPowerupTimer);
    const tier = campaignTier(wave);
    const hpRange = currentCfg && currentCfg.hpDelayRange ? currentCfg.hpDelayRange : null;
    const minDelay = hpRange ? hpRange[0] : 3150 + Math.min(1800, tier * 360);
    const maxDelay = hpRange ? hpRange[1] : 6300 + Math.min(2600, tier * 520);
    hpPowerupTimer = setTimeout(() => {
      if (state !== 'playing') return;
      if (campaignAllows('allowHp') && !boss && !waveTransitioning) spawnHpPowerup();
      scheduleHpPowerup();
    }, minDelay + Math.random() * (maxDelay - minDelay));
  }


  // Wooden crate on a parachute, falling slower than every other pickup — visually
  // distinct from the start (not just a colored circle) and an obvious "special,
  // worth a beat to notice" silhouette even before it's close enough to read the "?".
  function drawMysteryBox(p) {
    ctx.save(); ctx.translate(p.x, p.y);
    const sway = 0; // Phase 2: mystery crate falls visually straight; ring may pulse, but crate does not drift.
    // Canopy — semi-transparent, not a flat solid fill. Shrunk smaller now that the
    // ring is the main visual signal, not the parachute.
    ctx.save(); ctx.rotate(sway * 0.01);
    ctx.beginPath(); ctx.ellipse(0, -p.r * 1.35, p.r * 0.68, p.r * 0.49, 0, Math.PI, 0);
    ctx.fillStyle = 'rgba(204,102,255,0.26)'; ctx.fill();
    ctx.strokeStyle = 'rgba(150,210,255,0.42)'; ctx.lineWidth = 1.3; ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(i * p.r * 0.58, -p.r * 1.35);
      ctx.lineTo(i * p.r * 0.32 + sway * 0.3, -p.r * 0.52);
      ctx.strokeStyle = 'rgba(255,255,255,0.32)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
    // Crate — square (not the wider rect that read as an envelope), with horizontal
    // plank lines and corner brackets for actual texture instead of a flap-like X.
    ctx.translate(sway * 0.3, 0);
    const s = p.r * 0.72; // crate is tighter; the glow remains sized from p.r below
    // Soft translucent halo behind the crate, enlarged and sized off p.r (not the
    // now-smaller crate half-size s) so shrinking the crate doesn't also shrink it.
    const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
    const haloR = p.r * 1.45 * pulse + 16;
    const halo = ctx.createRadialGradient(0, 0, p.r * 0.25, 0, 0, haloR);
    halo.addColorStop(0, 'rgba(255,120,220,0.34)');
    halo.addColorStop(0.38, 'rgba(195,90,255,0.28)');
    halo.addColorStop(0.72, 'rgba(70,170,255,0.18)');
    halo.addColorStop(1, 'rgba(70,170,255,0)');
    ctx.beginPath(); ctx.arc(0, 0, haloR, 0, Math.PI * 2);
    ctx.fillStyle = halo; ctx.fill();
    if (!drawProjectileImage('mystery', 0, 0, p.r * 1.7, 0, '#cc66ff', true)) {
      const glow = ctx.createLinearGradient(-s, -s, s, s);
      glow.addColorStop(0, 'rgba(255,105,210,0.26)');
      glow.addColorStop(0.5, 'rgba(170,80,255,0.16)');
      glow.addColorStop(1, 'rgba(90,170,255,0.24)');
      ctx.fillStyle = glow;
      ctx.fillRect(-s - 3, -s - 3, s * 2 + 6, s * 2 + 6);
      ctx.fillStyle = '#7a4a28'; ctx.fillRect(-s, -s, s * 2, s * 2);
      // Plank seams
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1.5;
      for (const fy of [-s * 0.34, s * 0.34]) {
        ctx.beginPath(); ctx.moveTo(-s, fy); ctx.lineTo(s, fy); ctx.stroke();
      }
      // Grain flecks
      ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1;
      for (let i = 0; i < 4; i++) {
        const gy = -s + (i + 0.5) * (s * 2 / 4);
        ctx.beginPath(); ctx.moveTo(-s * 0.7, gy + 3); ctx.lineTo(s * 0.7, gy - 2); ctx.stroke();
      }
      ctx.strokeStyle = '#4a2c14'; ctx.lineWidth = 2.5;
      ctx.strokeRect(-s, -s, s * 2, s * 2);
      // Corner metal brackets
      ctx.strokeStyle = '#cfae6a'; ctx.lineWidth = 2;
      for (const [cx, cy] of [[-s,-s],[s,-s],[s,s],[-s,s]]) {
        const ix = cx > 0 ? -1 : 1, iy = cy > 0 ? -1 : 1;
        ctx.beginPath(); ctx.moveTo(cx, cy + iy*s*0.32); ctx.lineTo(cx, cy); ctx.lineTo(cx + ix*s*0.32, cy); ctx.stroke();
      }
      ctx.fillStyle = '#ffd700';
      ctx.font = `bold ${s * 1.5}px 'Bebas Neue', cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.strokeStyle = '#2a1a40'; ctx.lineWidth = 3;
      ctx.strokeText('?', 0, 3);
      ctx.fillText('?', 0, 3);
    }
    ctx.save();
    ctx.rotate(Date.now() * 0.002 + p.bob);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const rr = s * (1.25 + 0.12 * Math.sin(Date.now() * 0.005 + i));
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      ctx.fillStyle = i % 2 ? 'rgba(255,228,119,0.9)' : 'rgba(255,132,247,0.86)';
      ctx.beginPath();
      ctx.moveTo(x, y - 4);
      ctx.lineTo(x + 2.5, y - 1.2);
      ctx.lineTo(x + 5, y);
      ctx.lineTo(x + 2.5, y + 1.2);
      ctx.lineTo(x, y + 4);
      ctx.lineTo(x - 2.5, y + 1.2);
      ctx.lineTo(x - 5, y);
      ctx.lineTo(x - 2.5, y - 1.2);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Purple dashed "shoot this" ring — same rotating-dots language as the trapped
    // hero's rescue ring, pulled in to overlap the crate's edge rather than floating
    // outside it (same tightening as the enemy reticle). It's now a shoot target,
    // not a catch target, so this ring is the whole signal for that.
    if (p.ringHp > 0) {
      const t2 = Date.now() * 0.003;
      ctx.save();
      ctx.rotate(t2);
      const ringPulse = 1 + Math.sin(Date.now() * 0.008 + p.bob) * 0.05;
      // Ring radii enlarged 25% (1.37→1.7125, 1.22→1.525) — bigger "shoot this" target.
      ctx.beginPath(); ctx.arc(0, 0, s * 1.7125 * ringPulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,120,220,0.26)'; ctx.lineWidth = 9; ctx.stroke();
      const ringGrad = ctx.createLinearGradient(-s, -s, s, s);
      ringGrad.addColorStop(0, '#ff76d2');
      ringGrad.addColorStop(0.5, '#cc66ff');
      ringGrad.addColorStop(1, '#5ab1ff');
      ctx.beginPath(); ctx.arc(0, 0, s * 1.525 * ringPulse, 0, Math.PI * 2);
      ctx.strokeStyle = ringGrad; ctx.lineWidth = 3.2; ctx.stroke();
      for (let d = 0; d < 4; d++) {
        const a = (d / 4) * Math.PI * 2 + t2;
        ctx.fillStyle = d % 2 ? '#fff' : '#ff9be3';
        ctx.beginPath(); ctx.arc(Math.cos(a) * s * 1.525 * ringPulse, Math.sin(a) * s * 1.525 * ringPulse, 3.6, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function drawChunkyLightning(x, y, size, rotation, glowColor) {
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = size * 0.256; // glow dialed back ~20%
    }
    ctx.beginPath();
    ctx.moveTo(-size * 0.06, -size * 0.5);
    ctx.lineTo(size * 0.3, -size * 0.5);
    ctx.lineTo(size * 0.1, -size * 0.04);
    ctx.lineTo(size * 0.38, -size * 0.04);
    ctx.lineTo(-size * 0.15, size * 0.56);
    ctx.lineTo(-size * 0.02, size * 0.13);
    ctx.lineTo(-size * 0.33, size * 0.13);
    ctx.closePath();
    ctx.fillStyle = '#ffe61a';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1.5, size * 0.09);
    ctx.strokeStyle = '#2f2300';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 0.03, -size * 0.38);
    ctx.lineTo(size * 0.16, -size * 0.38);
    ctx.lineTo(size * 0.03, -size * 0.08);
    ctx.lineTo(size * 0.17, -size * 0.08);
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  function drawIceShard(x, y, size, rotation, glowColor) {
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (glowColor) {
      ctx.shadowColor = glowColor;
      ctx.shadowBlur = size * 0.224; // glow dialed back ~20%
    }
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.58);
    ctx.lineTo(size * 0.38, -size * 0.12);
    ctx.lineTo(size * 0.2, size * 0.5);
    ctx.lineTo(-size * 0.25, size * 0.45);
    ctx.lineTo(-size * 0.42, -size * 0.08);
    ctx.closePath();
    ctx.fillStyle = '#8ee8ff';
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1.4, size * 0.07);
    ctx.strokeStyle = '#1f6f9e';
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.46);
    ctx.lineTo(size * 0.1, size * 0.3);
    ctx.lineTo(-size * 0.18, size * 0.28);
    ctx.strokeStyle = 'rgba(245,255,255,0.78)';
    ctx.lineWidth = Math.max(1, size * 0.045);
    ctx.stroke();
    ctx.restore();
    return true;
  }

  // Shared 6-spoke fallback snowflake — kept for tiny ambient sparkle cases.
  function drawSnowflake(x, y, R, color, glowColor) {
    ctx.save();
    ctx.translate(x, y);
    if (glowColor) { ctx.shadowColor = glowColor; ctx.shadowBlur = R * 0.68; } // glow dialed back ~20%
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(1, R * 0.21); ctx.lineCap = 'round';
    const branch = R * 0.35;
    for (let k = 0; k < 6; k++) {
      const a = k * Math.PI / 3;
      const ex = Math.cos(a) * R, ey = Math.sin(a) * R;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(ex, ey); ctx.stroke();
      const mx = ex * 0.6, my = ey * 0.6;
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a + 1) * branch, my + Math.sin(a + 1) * branch); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(mx + Math.cos(a - 1) * branch, my + Math.sin(a - 1) * branch); ctx.stroke();
    }
    ctx.restore();
  }

  function projectileImageForType(type) {
    return PROJECTILE_IMAGE_SRC[type] || null;
  }
  const PROJECTILE_FX = {
    fire: { glow: '#ff5b20', spin: 0.0008, wobble: 0.07, trail: '#ff6b1f', sparks: '#ffd33d' },
    greenOrb: { glow: '#6dff24', spin: 0.0018, wobble: 0.09, pulse: 0.1, orbit: '#d8ff78' },
    ink: { glow: '#bd35ff', spin: -0.0016, wobble: 0.08, splat: '#ff70e8' },
    lock: { glow: '#3db8ff', spin: 0.0013, wobble: 0.06, orbit: '#b9f7ff' },
    tennis: { glow: '#c6ff3a', spin: 0.0016, wobble: 0.05 },
    ice: { glow: '#73e6ff', spin: 0.0022, wobble: 0.05, orbit: '#eaffff' },
    zap: { glow: '#aaff33', spin: -0.001, wobble: 0.08, fumes: '#baff3b' },
    shield: { glow: '#20dfff', spin: 0.001, wobble: 0.04, orbit: '#eaffff' },
    sombrero: { glow: '#ffd34a', spin: 0.0027, wobble: 0.1 },
    donkey: { glow: '#c7a16b', spin: 0.0007, wobble: 0.08 },
    fish: { glow: '#6bd7ff', spin: 0, wobble: 0, trail: '#7fe3ff' },
    gun: { glow: '#ffe928', spin: 0.001, wobble: 0.07, sparks: '#fff7a6' },
    bomb: { glow: '#8b55ff', spin: -0.0007, wobble: 0.05 },
    hp: { glow: '#33ff66', spin: 0.0012, wobble: 0.05, orbit: '#eaffd8' },
    powerShield: { glow: '#20dfff', spin: 0.001, wobble: 0.04, orbit: '#eaffff' },
    mystery: { glow: '#d25cff', spin: 0.001, wobble: 0.06, orbit: '#ffe477', sparks: '#ff84f7' },
    pizza: { glow: '#ffb13d', spin: 0.0014, wobble: 0.06 },
    guitar: { glow: '#ff7133', spin: 0.001, wobble: 0.08, sparks: '#ffe6a0' },
    piano: { glow: '#78b7ff', spin: -0.0008, wobble: 0.05, sparks: '#f5f3ec' },
    saxophone: { glow: '#ffd34a', spin: 0.0011, wobble: 0.08, sparks: '#ffe48a' },
    sword: { glow: '#c8d4ff', spin: 0, wobble: 0.02, sparks: '#ffffff' },
  };
  function rgbaFromHex(hex, alpha) {
    const h = (hex || '#ffffff').replace('#', '');
    const r = parseInt(h.slice(0, 2), 16) || 255;
    const g = parseInt(h.slice(2, 4), 16) || 255;
    const b = parseInt(h.slice(4, 6), 16) || 255;
    return `rgba(${r},${g},${b},${alpha})`;
  }
  function drawProjectileImage(type, x, y, size, rotation, glowColor, staticIcon, mutedIcon) {
    const src = projectileImageForType(type);
    if (!src) return false;
    const img = _getImg(src);
    if (!img.complete || !img.naturalWidth) return false;
    const fx = PROJECTILE_FX[type] || {};
    const t = Date.now();
    const activeGlow = mutedIcon ? null : (glowColor || (fx.glow ? rgbaFromHex(fx.glow, 0.78) : null));
    const pulse = mutedIcon ? 1 : 1 + Math.sin(t * 0.006 + x * 0.01 + y * 0.01) * (fx.pulse || 0.035);
    const wobble = (mutedIcon || staticIcon) ? 0 : Math.sin(t * 0.005 + x * 0.02) * (fx.wobble || 0);
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    // Static badges (HUD buff icons, inventory sockets) hold their printed orientation —
    // only projectiles actually in flight get the continuous spin. Otherwise an icon like
    // the bomb (fuse pointing up) could land sideways at any given instant and read wrong.
    if (fx.spin && !staticIcon) ctx.rotate(t * fx.spin);
    if (wobble) ctx.rotate(wobble);
    if (!mutedIcon && fx.trail) {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = rgbaFromHex(fx.trail, 0.2);
      ctx.beginPath();
      ctx.ellipse(0, size * 0.36, size * 0.28, size * 0.54, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (!mutedIcon && fx.fumes) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = rgbaFromHex(fx.fumes, 0.32);
      for (let i = 0; i < 3; i++) {
        const a = t * 0.002 + i * 2.1;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * size * 0.34, Math.sin(a) * size * 0.26 + size * 0.08, size * (0.08 + i * 0.012), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (!mutedIcon && fx.orbit) {
      ctx.save();
      ctx.rotate(t * 0.003);
      ctx.strokeStyle = rgbaFromHex(fx.orbit, 0.38);
      ctx.lineWidth = Math.max(1.2, size * 0.035);
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.48, size * 0.34, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = rgbaFromHex(fx.orbit, 0.9);
      ctx.beginPath();
      ctx.arc(size * 0.48, 0, Math.max(1.5, size * 0.045), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (!mutedIcon && fx.sparks) {
      ctx.save();
      ctx.fillStyle = rgbaFromHex(fx.sparks, 0.82);
      for (let i = 0; i < 2; i++) {
        const a = t * 0.004 + i * Math.PI + x * 0.01;
        const rr = size * (0.5 + i * 0.08);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, Math.max(1.4, size * 0.035), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (activeGlow) {
      ctx.shadowColor = activeGlow;
      ctx.shadowBlur = size * 0.24; // glow dialed back ~20%
    }
    if (mutedIcon) {
      ctx.globalAlpha *= 0.55;
      ctx.filter = 'grayscale(1) saturate(0.25) brightness(0.75)';
    }
    ctx.drawImage(img, -size * pulse / 2, -size * pulse / 2, size * pulse, size * pulse);
    ctx.restore();
    return true;
  }
  function drawPickupImage(type, p, size, glowColor) {
    const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
    ctx.save();
    ctx.translate(p.x, p.y);
    // Keep pickup icons visually upright while falling. The halo can pulse, but the
    // icon itself should not spin/wobble or it reads like the pickup is drifting.
    ctx.beginPath();
    const haloR = p.r * pulse + 7;
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const rr = haloR * (k % 2 ? 0.86 : 1.04);
      const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
      if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fillStyle = glowColor || 'rgba(255,230,26,0.18)';
    ctx.fill();
    ctx.restore();
    return drawProjectileImage(type, p.x, p.y, size, 0, glowColor ? glowColor.replace(/0\.\d+\)/, '0.8)') : null, true);
  }

  // MUSIC theme instrument pickups. One hit to "play" and clear.
  function drawInstrument(p) {
    if (drawPickupImage(p.kind, p, p.r * 2.25, 'rgba(255,230,26,0.18)')) return;
    ctx.save(); ctx.translate(p.x, p.y);
    const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
    ctx.beginPath(); ctx.arc(0, 0, p.r * pulse + 6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,230,26,0.15)'; ctx.fill();
    const s = p.r;
    if (p.kind === 'guitar') {
      ctx.strokeStyle = '#3a2410'; ctx.lineWidth = 3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -s * 0.2); ctx.lineTo(0, -s * 1.15); ctx.stroke();
      ctx.fillStyle = '#1a1008'; ctx.fillRect(-s * 0.12, -s * 1.25, s * 0.24, s * 0.18);
      ctx.beginPath(); ctx.ellipse(-s * 0.18, s * 0.15, s * 0.42, s * 0.55, -0.2, 0, Math.PI * 2);
      ctx.fillStyle = '#c47a32'; ctx.fill();
      ctx.strokeStyle = '#7a4a1a'; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(-s * 0.18, s * 0.15, s * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = '#2a1a0a'; ctx.fill();
      ctx.strokeStyle = '#eee'; ctx.lineWidth = 1;
      for (const dx of [-0.32, -0.18, -0.04]) { ctx.beginPath(); ctx.moveTo(dx * s, -s * 0.2); ctx.lineTo(dx * s + s * 0.14, s * 0.62); ctx.stroke(); }
    } else if (p.kind === 'piano') {
      ctx.fillStyle = '#161616'; ctx.fillRect(-s * 0.85, -s * 0.55, s * 1.7, s * 1.1);
      ctx.strokeStyle = '#555'; ctx.lineWidth = 1.5; ctx.strokeRect(-s * 0.85, -s * 0.55, s * 1.7, s * 1.1);
      const keyW = s * 1.6 / 5;
      ctx.fillStyle = '#f5f3ec';
      for (let k = 0; k < 5; k++) ctx.fillRect(-s * 0.8 + k * keyW, -s * 0.05, keyW * 0.92, s * 0.5);
      ctx.fillStyle = '#161616';
      for (let k = 0; k < 4; k++) ctx.fillRect(-s * 0.8 + (k + 0.7) * keyW, -s * 0.05, keyW * 0.36, s * 0.3);
    } else {
      ctx.strokeStyle = '#9b6a17'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-s * 0.62, s * 0.45); ctx.quadraticCurveTo(-s * 0.1, -s * 0.38, s * 0.56, -s * 0.3); ctx.stroke();
      ctx.fillStyle = '#e6ad2e';
      ctx.beginPath(); ctx.ellipse(s * 0.53, -s * 0.26, s * 0.36, s * 0.22, -0.15, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-s * 0.6, s * 0.48, s * 0.24, s * 0.33, 0.75, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ffe48a'; ctx.lineWidth = 1.5;
      for (const t of [-0.24, -0.02, 0.2]) { ctx.beginPath(); ctx.moveTo(t * s, -s * 0.18); ctx.lineTo((t + 0.04) * s, -s * 0.03); ctx.stroke(); }
    }
    ctx.restore();
  }


  function queueBlackoutHitFlash(o, duration, killed) {
    if (waveTheme !== 'blackout' || !o) return;
    const now = Date.now();
    const snap = {
      ...o,
      alive: true,
      isDeflected: false,
      litUntil: now + (duration || 320),
      flashBorn: now,
      blackoutKillFlash: !!killed,
      verts: Array.isArray(o.verts) ? o.verts.map(v => [v[0], v[1]]) : o.verts,
    };
    blackoutHitFlashes.push(snap);
    if (blackoutHitFlashes.length > 14) blackoutHitFlashes.shift();
  }

  function drawPowerup(p) {
    if (p.type === 'mystery') { drawMysteryBox(p); return; }
    if (p.type === 'instrument') { drawInstrument(p); return; }
    if (p.type === 'hp') {
      if (drawPickupImage('hp', p, p.r * 2.25, 'rgba(51,255,102,0.18)')) return;
      ctx.save(); ctx.translate(p.x, p.y);
      const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
      ctx.beginPath(); ctx.arc(0, 0, p.r * pulse + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(51,255,102,0.18)'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fillStyle = '#1a5c2e'; ctx.fill();
      ctx.strokeStyle = C('#33ff66'); ctx.lineWidth = 2; ctx.stroke();
      ctx.strokeStyle = '#eafff0'; ctx.lineWidth = Math.max(3, p.r * 0.22); ctx.lineCap = 'round';
      const armLen = p.r * (p.hpValue >= 3 ? 0.34 : 0.45);
      ctx.beginPath(); ctx.moveTo(-armLen, 0); ctx.lineTo(armLen, 0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -armLen); ctx.lineTo(0, p.hpValue >= 3 ? armLen * 0.2 : armLen); ctx.stroke();
      if (p.hpValue >= 3) {
        ctx.fillStyle = '#eafff0';
        ctx.font = `bold ${Math.max(9, p.r * 0.62)}px 'Bebas Neue', cursive`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(p.hpValue), 0, p.r * 0.46);
      }
      ctx.restore();
      return;
    }
    if (p.type === 'shield') {
      if (drawPickupImage('powerShield', p, p.r * 2.25, 'rgba(0,229,255,0.18)')) return;
      ctx.save(); ctx.translate(p.x, p.y);
      const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
      ctx.beginPath(); ctx.arc(0, 0, p.r * pulse + 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,229,255,0.18)'; ctx.fill();
      ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1530'; ctx.fill();
      ctx.strokeStyle = C('#00e5ff'); ctx.lineWidth = 2; ctx.stroke();
      // Bold hexagon badge instead of a soft shield silhouette — reads clearly as
      // "protection" at small sizes without needing to be a literal shield outline.
      const hr = p.r * 0.62;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3;
        const x = Math.cos(a) * hr, y = Math.sin(a) * hr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#00e5ff'; ctx.fill();
      ctx.strokeStyle = '#eafffd'; ctx.lineWidth = 2; ctx.stroke();
      // Small inner bolt accent so it doesn't read as a blank badge
      ctx.fillStyle = '#1a1530';
      ctx.beginPath();
      ctx.moveTo(-hr*0.12, -hr*0.55); ctx.lineTo(hr*0.32, -hr*0.05); ctx.lineTo(0, -hr*0.05);
      ctx.lineTo(hr*0.12, hr*0.55); ctx.lineTo(-hr*0.32, hr*0.05); ctx.lineTo(0, hr*0.05);
      ctx.closePath(); ctx.fill();
      ctx.restore();
      return;
    }
    const pickupType = p.type === 'gun' ? 'gun' : p.type === 'bomb' ? 'bomb' : null;
    if (pickupType && drawPickupImage(pickupType, p, p.r * 2.25, p.type === 'bomb' ? 'rgba(255,136,0,0.18)' : 'rgba(255,230,26,0.18)')) return;
    ctx.save(); ctx.translate(p.x, p.y);
    const pulse = 0.85 + Math.sin(Date.now() * 0.006 + p.bob) * 0.15;
    const ringColor = p.type === 'bomb' ? '#ff8800' : '#ffe61a';
    ctx.beginPath(); ctx.arc(0, 0, p.r * pulse + 6, 0, Math.PI * 2);
    ctx.fillStyle = p.type === 'bomb' ? 'rgba(255,136,0,0.18)' : 'rgba(255,230,26,0.18)'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, p.r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a1530'; ctx.fill();
    ctx.strokeStyle = C(ringColor); ctx.lineWidth = 2; ctx.stroke();
    ctx.font = `${p.r * 1.3}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.type === 'gun' ? '⚡' : '💣', 0, 1);
    ctx.restore();
  }


  // Mystery box "rebound" penalty — a single hazard ball that bounces off the side
  // walls and the top, so it keeps re-aiming back into the play field ("bounces off
  // and shoots back at you") instead of just drifting offscreen. Disappears either
  // on hitting the player (after dealing damage) or once its timer runs out.
  function spawnRebound() {
    const ang = Math.PI * 0.25 + Math.random() * Math.PI * 0.5; // roughly downward, varied angle
    const speed = 3.5;
    rebound = {
      x: W / 2, y: H * 0.25,
      vx: Math.cos(ang) * speed * (Math.random() < 0.5 ? -1 : 1),
      vy: Math.sin(ang) * speed,
      r: 15, expiresAt: Date.now() + 9000, nextFire: 0,
    };
  }

  function handleDuplicatePowerup(type, source) {
    // Phase 1: duplicates are no longer a silent "already held" miss. Keep the bonus
    // small and very explicit so it feels like "not wasted" instead of a new strategy
    // that encourages hoarding full sockets.
    const sx = source && typeof source.x === 'number' ? source.x : player.x;
    const sy = source && typeof source.y === 'number' ? source.y : player.y;
    if (type === 'bomb') {
      const radius = 92;
      let cleared = 0;
      obstacles.forEach(o => {
        if (o.isTrapped || o.alive === false) return;
        const dist = Math.hypot(o.x - player.x, o.y - player.y);
        if (dist <= radius + (o.r || 0)) {
          miniExplosion(o.x, o.y, o.type === 'asteroid' ? '#7a6a90' : GAME_CHARS[o.ci].color);
          score += o.type === 'asteroid' ? 12 : 25;
          waveKills++;
          cleared++;
          o.alive = false;
        }
      });
      obstacles = obstacles.filter(o => o.alive !== false);
      enemyBullets = enemyBullets.filter(b => Math.hypot(b.x - player.x, b.y - player.y) > radius + (b.r || 0));
      triggerShake(4);
      miniExplosion(player.x, player.y, '#ff8800');
      addFloatText(`EXTRA BOMB POP! +${cleared}`, W / 2, H * 0.38, '#ff8800', 24);
      showTopBanner('SOCKET FULL — MINI POP', 'good');
      playNormalInstrumentSfx('bomb');
    } else if (type === 'shield') {
      health = Math.min(100, health + 5);
      miniExplosion(sx, sy, '#00e5ff');
      addFloatText('SOCKET FULL +5 HP', W / 2, H * 0.38, '#00e5ff', 22);
      showTopBanner('SOCKET FULL — +5 HP', 'good');
      playNormalInstrumentSfx('hp');
    } else if (type === 'gun') {
      score += 250;
      miniExplosion(sx, sy, '#ffe61a');
      addFloatText('SOCKET FULL +250', W / 2, H * 0.38, '#ffe61a', 22);
      showTopBanner('SOCKET FULL — +250', 'good');
      playNormalInstrumentSfx('powerup');
    }
  }

  function applyPowerup(type) {
    if (type === 'gun') {
      buffGunUntil = Date.now() + 8000;
      addFloatText('MACHINE GUN!', player.x, player.y - 50, '#ffe61a', 20);
      showTopBanner('MACHINE GUN', 'good');
      playNormalInstrumentSfx('powerup');
    } else if (type === 'bomb') {
      let cleared = 0;
      obstacles.forEach(o => {
        if (o.isTrapped) return; // spare heroes — bomb only hits hostiles
        bigExplosion(o.x, o.y, o.type === 'asteroid' ? '#7a6a90' : GAME_CHARS[o.ci].color);
        score += o.type === 'asteroid' ? (10 + wave * 2) : (25 + wave * 5);
        waveKills++; cleared++;
        o.alive = false;
      });
      obstacles = obstacles.filter(o => o.alive !== false);
      if (boss && !boss.isCaptive) {
        const bossBombDamage = boss.isFinalGizmo ? 7 : 6;
        boss.hp = Math.max(1, boss.hp - bossBombDamage);
        boss.hitFlash = 1;
        miniExplosion(boss.x, boss.y, '#ff8800');
        addFloatText(`BOMB HIT -${bossBombDamage}`, boss.x, boss.y - boss.r - 20, '#ff8800', 18);
      }
      addFloatText(`BOMB! +${cleared}`, player.x, player.y - 50, '#ff8800', 22);
      showTopBanner(`BOMB +${cleared}`, 'good');
      playNormalInstrumentSfx('bomb');
    } else if (type === 'hp') {
      const gain = arguments[1] || 2;
      health = Math.min(100, health + gain);
      addFloatText(`+${gain} HP`, player.x, player.y - 50, '#33ff66', 20);
      showTopBanner(`+${gain} HP`, 'good');
      playNormalInstrumentSfx('hp');
    } else if (type === 'shield') {
      buffShieldUntil = Date.now() + 8000;
      addFloatText('SHIELD UP!', player.x, player.y - 50, '#00e5ff', 20);
      showTopBanner('SHIELD UP', 'good');
      playNormalInstrumentSfx('shield');
    } else if (type === 'mystery') {
      playNormalInstrumentSfx('mystery');
      if (academyMode) {
        academyMysteryIndex++;
        if (academyMysteryIndex === 1) {
          twin = { x: player.x + 40, y: player.y, lastFire: 0, expiresAt: Date.now() + 6000 };
          addFloatText('MYSTERY: TWIN SHIP!', player.x, player.y - 50, '#ffe61a', 20);
          showTopBanner('MYSTERY: TWIN SHIP', 'good');
        } else {
          buffPizzaUntil = Date.now() + 6000;
          addFloatText('MYSTERY: PIZZA BLAST!', player.x, player.y - 50, '#ffcc44', 20);
          showTopBanner('MYSTERY: PIZZA BLAST', 'good');
        }
        playNormalInstrumentSfx('mystery');
        return;
      }
      // No plain "bomb" here — that's already a normal pickup with no twist on it.
      // Every outcome below is either not a regular powerup at all, or a clear
      // escalation of one (tripleBuff stacks all 3 AND extends on top of whatever's
      // already running, never just resetting/wasting active time).
      const outcomes = ['bigHp', 'tripleBuff', 'twin', 'pizzaBlast', 'frozen', 'zapped', 'reverse', 'tiny', 'rebound', 'snowing'];
      const roll = outcomes[Math.floor(Math.random() * outcomes.length)];
      if (roll === 'bigHp') {
        health = Math.min(100, health + 25);
        addFloatText('MYSTERY: +25 HP!', player.x, player.y - 50, '#33ff66', 20);
        showTopBanner('MYSTERY: +25 HP!', 'good');
        playNormalInstrumentSfx('hp');
      } else if (roll === 'tripleBuff') {
        const now = Date.now();
        buffSpeedUntil = Math.max(buffSpeedUntil, now) + 8000;
        buffGunUntil = Math.max(buffGunUntil, now) + 8000;
        buffShieldUntil = Math.max(buffShieldUntil, now) + 8000;
        addFloatText('MYSTERY: TRIPLE BUFF!', player.x, player.y - 50, '#ffe61a', 20);
        showTopBanner('MYSTERY: TRIPLE BUFF!', 'good');
        playNormalInstrumentSfx('mystery'); ticketConfetti(true);
      } else if (roll === 'twin') {
        twin = { x: player.x + 40, y: player.y, lastFire: 0, expiresAt: Date.now() + 8000 };
        addFloatText('MYSTERY: TWIN SHIP!', player.x, player.y - 50, '#ffe61a', 20);
        showTopBanner('MYSTERY: TWIN SHIP!', 'good');
        playNormalInstrumentSfx('mystery'); ticketConfetti(true);
      } else if (roll === 'pizzaBlast') {
        buffPizzaUntil = Date.now() + 8000;
        addFloatText('MYSTERY: PIZZA BLAST!', player.x, player.y - 50, '#ffcc44', 20);
        showTopBanner('MYSTERY: PIZZA BLAST!', 'good');
        playNormalInstrumentSfx('mystery');
      } else if (roll === 'frozen') {
        buffFrozenUntil = Date.now() + 5000;
        addFloatText('MYSTERY: FROZEN!', player.x, player.y - 50, '#66ddff', 20);
        showTopBanner('MYSTERY: FROZEN!', 'bad');
        playFrozenGlassShimmer();
      } else if (roll === 'zapped') {
        buffZappedUntil = Date.now() + 5000;
        addFloatText('MYSTERY: FARTED!', player.x, player.y - 50, '#cc99ff', 20);
        showTopBanner('MYSTERY: FARTED!', 'bad');
        playZappedGlitchPop();
      } else if (roll === 'reverse') {
        controlsReversedUntil = Date.now() + 4000;
        addFloatText('MYSTERY: REVERSED!', player.x, player.y - 50, '#ff5500', 20);
        showTopBanner('MYSTERY: REVERSED!', 'bad');
        playNormalInstrumentSfx('bad');
      } else if (roll === 'tiny') {
        player.r = Math.max(8, player.r * 0.6);
        addFloatText('MYSTERY: TINY SHIP!', player.x, player.y - 50, '#cc66ff', 20);
        showTopBanner('MYSTERY: TINY SHIP!', 'bad');
        playNormalInstrumentSfx('bad');
        setTimeout(() => { if (state === 'playing') player.r = 18; }, 6000);
      } else if (roll === 'rebound') {
        spawnRebound();
        addFloatText('MYSTERY: REBOUND!', player.x, player.y - 50, '#ff4444', 20);
        showTopBanner('MYSTERY: REBOUND!', 'bad');
        playNormalInstrumentSfx('bad');
      } else if (roll === 'snowing') {
        snowingUntil = Date.now() + 12000;
        addFloatText('MYSTERY: SNOWSTORM!', player.x, player.y - 50, '#aee8ff', 20);
        showTopBanner('MYSTERY: SNOWSTORM!', 'bad');
        playFrozenGlassShimmer();
      }
    }
  }

  // Locked aspect ratio instead of a free-stretching height — see the CSS comment on
  // #pg-space for why (orientation/screen-shape was silently changing difficulty by
  // changing how far obstacles had to fall to reach the danger line). Computes the
  // largest box at SPACE_RATIO that fits the space below the header, sets it as the
  // canvas's actual CSS size via inline style. The backing bitmap is scaled up for
  // high-DPI displays, while W/H stay in CSS/game coordinates so gameplay speed and
  // collision math do not change.
  const SPACE_RATIO = 9 / 16; // width / height
  let spaceDpr = 1;
  function fitSpaceCanvas() {
    const wrap = document.getElementById('pg-space');
    if (!wrap || !canvas) return;
    const headerEl = wrap.querySelector('.cats-header');
    const availW = wrap.clientWidth || window.innerWidth;
    const availH = (wrap.clientHeight || window.innerHeight) - (headerEl ? headerEl.offsetHeight : 0);
    let w = availW, h = w / SPACE_RATIO;
    if (h > availH) { h = availH; w = h * SPACE_RATIO; }
    w = Math.floor(w); h = Math.floor(h);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    spaceDpr = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2.5);
    W = w;
    H = h;
    canvas.width = Math.max(1, Math.round(w * spaceDpr));
    canvas.height = Math.max(1, Math.round(h * spaceDpr));
    if (ctx) {
      ctx.setTransform(spaceDpr, 0, 0, spaceDpr, 0, 0);
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
    }
  }

  function reset() {
    fitSpaceCanvas();
    academyMode = false;
    academyCompleting = false;
    player = { x:W/2, y:H-SPACE_SHIP_BOTTOM_OFFSET, r:18 };
    bullets=[]; obstacles=[]; score=0; health=100; wave=1; waveKills=0; campaignRebootUsed=false;
    lastDamageCause=''; lastDamageAmount=0; lastDamageAt=0; lastDamageWave=0; deathCause=''; deathDamageAmount=0; deathWave=0; deathWaveTheme='';
    enemyBullets=[]; lastEnemyFire=0; floatTexts=[]; blackoutHitFlashes=[]; blackoutShooterIndex=0; lineFlashA=0;
    powerups=[]; buffSpeedUntil=0; buffGunUntil=0; buffShieldUntil=0; escort=null; shakeMag=0;
    boss=null; rescuedChars.clear(); rescueBanner = null; missionRetryCaptives.splice(0, missionRetryCaptives.length); campaignSeenBossNames.clear(); waveCaptivesSeen.clear();
    waveTheme = null; miniBoss = null; themeEffectsAt = 0; waveTransitioning = false; pendingBossWin = null;
    mirrorSequenceActive = false; mirrorStageTimers.forEach(clearTimeout); mirrorStageTimers = [];
    buffFrozenUntil = 0; buffZappedUntil = 0; blasterDisabledUntil = 0; controlsReversedUntil = 0; twin = null; rebound = null; buffPizzaUntil = 0; snowingUntil = 0; snowParticles = [];
    inventory = { gun: false, shield: false, bomb: false };
    socketAnchorY = H - SPACE_SOCKET_ANCHOR_BOTTOM_OFFSET;
    dangerY = spaceDangerLineY();
    player.y = dangerY + player.r * 1.1;
    highScore = parseInt(localStorage.getItem(getSpaceBestKey())||'0');
    leftHeld=false; rightHeld=false; lastAutoFire=0; lastPizzaFire=0;
    mkStars();
    currentCfg = waveConfig(wave);
    waveTheme = pickWaveTheme(wave, null);
    startWaveSpawn(currentCfg);
    if (waveTheme === 'blackout') { spawnBlackoutHiddenEnemies(); spaceSfx('wave.blackout'); }
    if (waveTheme === 'captive' && wave === 6) spawnCampaignRescueLock();
    scheduleHpPowerup();
    schedulePowerup();
    scheduleMysteryBox();
    scheduleInstrument();
    const flowToken = spaceFlowToken;
    setTimeout(() => {
      if (flowToken === spaceFlowToken && state === 'playing' && wave === 1) showTopBanner('CLEAR THE ROCKS', 'good');
    }, 900);
    // Wave 1 starts at full HP, so the existing random HP-crate timer can land while
    // the player is already capped and never feel like real support. Guarantee one
    // extra, clearly-timed HP crate after the player has likely taken an early hit.
    setTimeout(() => {
      if (flowToken === spaceFlowToken && state === 'playing' && wave === 1 && !boss && !waveTransitioning) spawnHpPowerup();
    }, 4200);
  }

  function clearSpaceRuntimeTimers() {
    spaceFlowToken++;
    clearTimeout(spawnTimer);
    clearTimeout(hpPowerupTimer);
    clearTimeout(powerupTimer);
    clearTimeout(mysteryTimer);
    clearTimeout(instrumentTimer);
    mirrorStageTimers.forEach(clearTimeout);
    mirrorStageTimers = [];
    mirrorSequenceActive = false;
  }

  function clearSpaceBonusObjects() {
    // Optional rewards should never keep a wave alive or fall behind intermission cards.
    powerups = [];
    bullets = [];
    enemyBullets = [];
  }

  function clearSpaceCinematicOverlays() {
    document.querySelectorAll('.space-rescue-briefing,.space-intro-overlay,.space-wave-cleared,.space-wave-announce,.space-reboot-overlay').forEach(el => el.remove());
    // Removing the DOM is not enough: briefing timers can still fire later and
    // stack an old announcement on top of the next wave/boss beat.
    spaceBriefingTimers.forEach(clearTimeout);
    spaceBriefingTimers = [];
  }

  function spaceDamageSuppressed() {
    return state !== 'playing' || waveTransitioning || !!document.querySelector('.space-rescue-briefing,.space-intro-overlay,.space-wave-cleared,.space-wave-announce,.space-reboot-overlay');
  }

  function clearSpaceAcademyTimers() {
    academyTimers.forEach(clearTimeout);
    academyTimers = [];
  }

  const SPACE_ACADEMY_LESSONS = [
    { title: 'DRAG TO MOVE', detail: 'DODGE ROCKS AND STAY BELOW THE LINE', confirm: 'GOOD DODGING!' },
    { title: 'NORMAL ENEMIES', detail: 'THEY HOLD, DRIFT, AND SHOOT', confirm: 'ENEMY CLEARED!' },
    { title: 'RED SWARMERS', detail: 'FLASHING RED ENEMIES RUSH THE LINE', confirm: 'SWARMER STOPPED!' },
    { title: 'CATCH POWERUPS', detail: 'LEFT SOCKETS STORE GUN / SHIELD / BOMB', confirm: 'SOCKETS STOCKED!' },
    { title: 'TAP A SOCKET', detail: 'BOMB SOCKET CLEARS DANGER', confirm: 'BOMB DEPLOYED!' },
    { title: 'SHOOT THE ? CRATE', detail: 'IT CAN HELP OR HURT', confirm: 'MYSTERY LEARNED!' },
    { title: 'BREAK THE BLUE LOCK', detail: 'SHOOT THE RING, NOT THE MOBE', confirm: 'RESCUE UNLOCKED!' },
    { title: 'BLACKOUT', detail: 'SLOW DOWN. WATCH THE LINE.', confirm: 'TRAINING COMPLETE!' },
  ];

  function academyTimer(fn, delay) {
    const t = setTimeout(fn, delay);
    academyTimers.push(t);
    return t;
  }

  // ── Single-slot academy message panel ───────────────────────────────────
  // Tutorial copy used to be independent floating texts (title/detail/hint),
  // each fading on its own clock — title still fading while detail appeared,
  // hint stacking on top of both. This is ONE slot: showing a new message always
  // fully replaces whatever was on screen, so by construction only one message
  // (or one title+detail pair) is ever visible — never stacked, never racing.
  let academyMsgPanel = null; // {title, detail, kind, x, y, startedAt, holdMs}
  const ACADEMY_MSG_FADE_IN = 180, ACADEMY_MSG_FADE_OUT = 260;
  const ACADEMY_INTRO_HOLD_MS = 2000;
  function academyMsgDuration(holdMs) {
    return ACADEMY_MSG_FADE_IN + holdMs + ACADEMY_MSG_FADE_OUT;
  }
  function academyTargetArmY() {
    return 56 + 14 + 24; // HP bar bottom plus enough room for the target to read.
  }
  function academyShowMsg(title, detail, opts) {
    opts = opts || {};
    academyMsgPanel = {
      title, detail: detail || '',
      kind: opts.kind || 'good',
      x: opts.x != null ? opts.x : W / 2,
      y: opts.y != null ? opts.y : H * 0.26,
      titleSize: opts.titleSize || 25,
      detailSize: opts.detailSize || 16,
      startedAt: Date.now(),
      holdMs: opts.holdMs != null ? opts.holdMs : 1500,
    };
  }
  function academyClearMsg() {
    academyMsgPanel = null;
  }
  function drawAcademyMsgPanel() {
    if (!academyMsgPanel) return;
    const m = academyMsgPanel;
    const elapsed = Date.now() - m.startedAt;
    const total = ACADEMY_MSG_FADE_IN + m.holdMs + ACADEMY_MSG_FADE_OUT;
    if (elapsed > total) { academyMsgPanel = null; return; }
    let a;
    if (elapsed < ACADEMY_MSG_FADE_IN) a = elapsed / ACADEMY_MSG_FADE_IN;
    else if (elapsed < ACADEMY_MSG_FADE_IN + m.holdMs) a = 1;
    else a = 1 - (elapsed - ACADEMY_MSG_FADE_IN - m.holdMs) / ACADEMY_MSG_FADE_OUT;
    const titleColor = m.kind === 'bad' ? '#ff4444' : '#33ff66';
    ctx.save();
    ctx.globalAlpha = Math.max(0, a);
    ctx.textAlign = 'center';
    ctx.shadowColor = titleColor;
    ctx.shadowBlur = 0;
    ctx.fillStyle = titleColor;
    ctx.font = `bold ${m.titleSize}px 'Bebas Neue', cursive`;
    ctx.fillText(m.title, m.x, m.y);
    if (m.detail) {
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffe61a';
      ctx.font = `${m.detailSize}px 'Bebas Neue', cursive`;
      ctx.fillText(m.detail, m.x, m.y + 26);
    }
    ctx.restore();
  }

  function academyMessage(lesson) {
    academyShowMsg(lesson.title, lesson.detail, { kind: 'good', holdMs: ACADEMY_INTRO_HOLD_MS });
  }

  function academyAfterIntro(fn, extraDelay) {
    academyTimer(() => {
      if (!academyMode || state !== 'playing') return;
      academyClearMsg();
      bullets = [];
      fn();
    }, academyMsgDuration(ACADEMY_INTRO_HOLD_MS) + 120 + (extraDelay || 0));
  }

  function academyConfirm(text) {
    if (!academyMode || state !== 'playing') return;
    academyShowMsg(text || 'NICE!', '', { kind: 'good', holdMs: 1100, titleSize: 27 });
  }

  function academyTryAgain(text, onDone) {
    const now = Date.now();
    if (academyMsgPanel) return false;
    if (now - academyRetryNoticeAt < 1200) return false;
    academyRetryNoticeAt = now;
    academyShowMsg(text || 'TRY AGAIN!', '', { kind: 'bad', holdMs: 900, titleSize: 21 });
    academyTimer(() => {
      if (!academyMode || state !== 'playing') return;
      academyClearMsg();
      if (onDone) onDone();
    }, academyMsgDuration(900) + 120);
    return true;
  }

  function academySafeTimeoutMs(index) {
    // Checkpoint E: every Academy lesson has a deterministic escape hatch. The
    // player can finish by doing the mechanic, but missed pickups/crates/targets
    // never strand the tutorial or bleed into campaign state.
    const lessonTimeouts = [12500, 16000, 16000, 20000, 17000, 20000, 20000, 13200];
    return lessonTimeouts[index] || 10000;
  }

  function spawnAcademyAsteroid(x, y, speed) {
    const r = 20;
    const verts = Array.from({ length: 8 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      const rr = r * (0.74 + (i % 3) * 0.08);
      return [Math.cos(a) * rr, Math.sin(a) * rr];
    });
    obstacles.push({ type: 'asteroid', x, y, vx: 0, vy: speed, r, verts, rot: 0, rotSpeed: 0.01, hp: 1, shadeSeed: 0, rockStyle: 1, academyObstacle: true });
  }

  function spawnAcademyEnemy(x, y, hp, behavior) {
    const now = Date.now();
    if (behavior === 'swarmer') {
      const r = FACE_R * 0.56;
      obstacles.push({ type: 'face', behavior: 'swarmer', x: clamp(x, r, W - r), y, vx: 0, vy: 2.45, r, ci: nextMissionEnemyIndex(), hp: hp || 1, isTrapped: false, ringHp: 0, pausedBurstDone: true, paused: false, pauseUntil: 0, burstShotsLeft: 0, lastBurstShot: 0, swarmerFlashSeed: Math.random() * 1000, academyObstacle: true, academyGoal: 'swarmer', academyArmY: academyTargetArmY() });
      return;
    }
    const holdY = clamp(y > 0 ? y : H * 0.34, Math.max(118, H * 0.24), Math.min(dangerY - 86, H * 0.68));
    obstacles.push({ type: 'face', behavior: 'holdDrift', x: clamp(x, FACE_R, W - FACE_R), y: -FACE_R - 10, vx: 0.34 * (x < W / 2 ? 1 : -1), vy: 1.18, r: FACE_R, ci: nextMissionEnemyIndex(), hp: hp || 1, isTrapped: false, ringHp: 0, pausedBurstDone: true, paused: false, pauseUntil: 0, burstShotsLeft: 0, lastBurstShot: 0, holdY, baseY: holdY, born: now, holdSettled: false, driftSeed: Math.random() * Math.PI * 2, driftAmpY: 5, nextDriftTurnAt: now + 1200, academyObstacle: true, academyGoal: 'normalEnemy', academyArmY: Math.min(holdY - 8, academyTargetArmY()) });
  }

  function spawnAcademyPowerup(type, x, delay) {
    academyTimer(() => {
      if (!academyMode || state !== 'playing') return;
      powerups.push({ type, x, y: -POWERUP_R - 10, vy: 1.25, r: POWERUP_R, bob: Math.random() * Math.PI * 2, academyPowerup: true });
    }, delay || 0);
  }

  function spawnAcademyMystery(x, delay) {
    academyTimer(() => {
      if (!academyMode || state !== 'playing') return;
      powerups.push({ type: 'mystery', x, y: -POWERUP_R - 10, vy: 0.72, r: POWERUP_R, bob: 0, ringHp: 2, academyMystery: true, academyArmY: academyTargetArmY() });
    }, delay || 0);
  }

  function spawnAcademyRescueLock() {
    const ci = missionTrappedChars[0] != null ? missionTrappedChars[0] : nextMissionEnemyIndex();
    const r = FACE_R * 1.08;
    obstacles.push({ type: 'face', x: W / 2, y: Math.max(112, H * 0.20), vx: 0, vy: 0, r, ci, hp: 1, isTrapped: true, ringHp: 5, maxRingHp: 5, pausedBurstDone: true, paused: false, pauseUntil: 0, burstShotsLeft: 0, lastBurstShot: 0, academyObstacle: true, academyGoal: 'rescueLock' });
  }

  function enterSpaceAcademyLesson(index) {
    clearSpaceAcademyTimers();
    academyStep = index;
    academyStepStarted = Date.now();
    academyStepArmed = false;
    academyGoalComplete = false;
    academyRetryNoticeAt = 0;
    if (index === 5) academyMysteryIndex = 0;
    bullets = [];
    enemyBullets = [];
    obstacles = [];
    powerups = [];
    blackoutHitFlashes = [];
    waveTheme = null;
    themeEffectsAt = 0;
    academyClearMsg();
    currentCfg = Object.assign(waveConfig(1), { speed: 1.65, tier: 0, enemyFireMult: 0.55, allowHp: false, allowPowerups: false, allowMystery: false });
    const lesson = SPACE_ACADEMY_LESSONS[index];
    if (!lesson) { completeSpaceAcademy(); return; }
    academyMessage(lesson);
    // Tutorial scenes breathe in three beats: read the card, clear it, then play.
    // Success/retry cards happen only after the active lesson objects are gone.
    if (index === 0) {
      academyAfterIntro(() => {
        [0.28, 0.5, 0.72].forEach((xp, i) => spawnAcademyAsteroid(W * xp, -40 - i * 130, 1.0));
      });
    } else if (index === 1) {
      academyAfterIntro(() => {
        [0.20, 0.40, 0.60, 0.80].forEach((xp, i) => {
          spawnAcademyEnemy(W * xp, H * (0.31 + (i % 2) * 0.12), 1, 'holdDrift');
        });
      });
    } else if (index === 2) {
      academyAfterIntro(() => spawnAcademyEnemy(W * 0.5, -40, 1, 'swarmer'));
    } else if (index === 3) {
      academyAfterIntro(() => {
        spawnAcademyPowerup('gun', W * 0.28, 0);
        spawnAcademyPowerup('shield', W * 0.5, 1150);
        spawnAcademyPowerup('bomb', W * 0.72, 2300);
      });
    } else if (index === 4) {
      inventory.bomb = true;
      academyAfterIntro(() => {
        for (let i = 0; i < 5; i++) academyTimer(() => academyMode && spawnAcademyEnemy(W * (0.2 + i * 0.15), -35, 1, 'swarmer'), i * 260);
      });
    } else if (index === 5) {
      academyAfterIntro(() => {
        spawnAcademyMystery(W * 0.38, 0);
        spawnAcademyMystery(W * 0.62, 2600);
      });
    } else if (index === 6) {
      academyAfterIntro(() => spawnAcademyRescueLock());
    } else if (index === 7) {
      academyAfterIntro(() => {
        waveTheme = 'blackout';
        themeEffectsAt = Date.now();
        [0.34, 0.66].forEach((xp, i) => spawnAcademyAsteroid(W * xp, -35 - i * 160, 0.86));
      });
    }
  }

  // Reuses the same fade-in/hold/fade-out DOM-overlay pattern as the other
  // cinematic beats (showBossDefeatedBeat etc.) instead of a canvas topBanner —
  // the old code called showTopBanner() then immediately cancelled the render
  // loop and swapped in the menu overlay on the same tick, so the "complete"
  // message was set but never actually drawn; the tutorial just cut to the menu.
  function showAcademyCompleteBeat(onDone) {
    const flowToken = spaceFlowToken;
    clearSpaceCinematicOverlays();
    const el = document.createElement('div');
    el.className = 'space-wave-cleared';
    el.style.cssText = 'position:fixed;inset:0;z-index:9997;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity 0.25s ease;text-align:center';
    el.innerHTML = `
      <div style="text-align:center">
        <div style="font-family:'Bebas Neue',cursive;font-size:clamp(32px,7.5vw,52px);letter-spacing:4px;line-height:1;color:#33ff66;text-shadow:0 0 22px #33ff6688,0 0 44px #33ff6644;transform:scale(0.85);transition:transform 0.35s cubic-bezier(.2,1.15,.35,1)">SPACE TUTORIAL COMPLETE</div>
        <div style="margin-top:14px;font-family:'VCR',monospace;font-size:13px;letter-spacing:2px;color:rgba(242,239,232,0.75)">YOU ARE READY FOR THE CAMPAIGN</div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.querySelector('div > div').style.transform = 'scale(1)';
    });
    setTimeout(() => {
      if (flowToken !== spaceFlowToken) { el.remove(); return; }
      el.style.opacity = '0';
      setTimeout(() => {
        el.remove();
        if (onDone) onDone();
      }, 260);
    }, 2200);
  }

  function completeSpaceAcademy() {
    clearSpaceAcademyTimers();
    academyMode = false;
    academyCompleting = true;
    academyShieldNoticeAt = 0;
    academyClearMsg();
    // Clear the board before the beat starts (not after) — academyMode is now
    // false, so the training shield no longer blocks real damage, and the beat
    // keeps state==='playing' (and the render loop running) for its duration.
    obstacles = [];
    enemyBullets = [];
    bullets = [];
    powerups = [];
    blackoutHitFlashes = [];
    waveTheme = null;
    showAcademyCompleteBeat(() => {
      clearSpaceRuntimeTimers();
      clearSpaceBonusObjects();
      academyCompleting = false;
      state = 'idle';
      cancelAnimationFrame(raf);
      showSpaceOverlay('select');
    });
  }

  function academyRespawnLessonObjects(elapsed) {
    if (!academyMode || state !== 'playing' || academyStepArmed) return;
    const activeAcademyObstacles = obstacles.filter(o => o.academyObstacle && o.alive !== false && !o._crossed);
    const activeAcademyPowerups = powerups.filter(p => p.academyPowerup || p.academyMystery);
    if (academyStep === 1) {
      if (elapsed > 5200 && !academyGoalComplete && activeAcademyObstacles.length === 0) {
        academyTryAgain('TRY AGAIN: CLEAR THE DRIFTERS', () => {
          [0.24, 0.42, 0.58, 0.76].forEach((xp, i) => spawnAcademyEnemy(W * xp, H * (0.32 + (i % 2) * 0.12), 1, 'holdDrift'));
        });
      }
      if (elapsed > 3600 && Date.now() - lastEnemyFire > 1150) {
        const shooters = obstacles.filter(o => o.academyObstacle && o.behavior === 'holdDrift' && o.y > 0);
        if (shooters.length) {
          enemyFireAt(shooters[Math.floor(Math.random() * shooters.length)], 0.70, 'TRAINING SHOT');
          lastEnemyFire = Date.now();
        }
      }
    } else if (academyStep === 2) {
      if (elapsed > 4300 && !academyGoalComplete && !obstacles.some(o => o.academyObstacle && o.behavior === 'swarmer')) {
        academyTryAgain('TRY AGAIN: STOP THE RED SWARMER', () => spawnAcademyEnemy(W * rand(0.35, 0.65), -40, 1, 'swarmer'));
      }
    } else if (academyStep === 3) {
      if (elapsed > 5600 && !(inventory.gun && inventory.shield && inventory.bomb) && activeAcademyPowerups.length === 0) {
        academyTryAgain('MISSED ONE - NEW POWERUPS', () => {
          if (!inventory.gun) spawnAcademyPowerup('gun', W * 0.30, 0);
          if (!inventory.shield) spawnAcademyPowerup('shield', W * 0.50, inventory.gun ? 0 : 900);
          if (!inventory.bomb) spawnAcademyPowerup('bomb', W * 0.70, (inventory.gun && inventory.shield) ? 0 : 1800);
        });
      }
    } else if (academyStep === 4) {
      if (elapsed > 5200 && inventory.bomb && activeAcademyObstacles.length === 0) {
        academyTryAgain('TRY AGAIN: TAP THE BOMB SOCKET', () => {
          for (let i = 0; i < 4; i++) spawnAcademyEnemy(W * (0.24 + i * 0.17), -35 - i * 38, 1, 'swarmer');
        });
      }
    } else if (academyStep === 5) {
      if (elapsed > 6200 && academyMysteryIndex < 2 && activeAcademyPowerups.length === 0) {
        academyTryAgain('TRY AGAIN: SHOOT THE ? CRATE', () => spawnAcademyMystery(W * 0.5, 0));
      }
    } else if (academyStep === 6) {
      if (elapsed > 5200 && !academyGoalComplete && activeAcademyObstacles.length === 0) {
        academyTryAgain('TRY AGAIN: BREAK THE BLUE LOCK', () => spawnAcademyRescueLock());
      }
    }
  }

  function updateSpaceAcademy() {
    if (!academyMode || state !== 'playing' || academyStepArmed) return;
    const elapsed = Date.now() - academyStepStarted;
    academyRespawnLessonObjects(elapsed);
    let done = false;
    if (academyStep === 0) done = elapsed > 3000 && obstacles.length === 0;
    else if (academyStep === 1 || academyStep === 2 || academyStep === 6) done = elapsed > 2600 && academyGoalComplete && obstacles.length === 0;
    else if (academyStep === 3) done = elapsed > 4200 && inventory.gun && inventory.shield && inventory.bomb;
    else if (academyStep === 4) done = elapsed > 3200 && !inventory.bomb && obstacles.length === 0;
    else if (academyStep === 5) done = elapsed > 5200 && academyMysteryIndex >= 2 && powerups.length === 0;
    else if (academyStep === 7) done = elapsed > 12200 && obstacles.length === 0;
    // Every lesson gets the same deterministic escape hatch, not just the three
    // read-only ones — interactive lessons (1-6) previously had no fallback at
    // all, so a player who couldn't land the required hit/catch/tap could be
    // stuck on that step indefinitely with no way to advance or skip.
    const timedOut = !done && elapsed > academySafeTimeoutMs(academyStep);
    if (timedOut) done = true;
    if (!done) return;
    academyStepArmed = true;
    bullets = [];
    enemyBullets = [];
    if (timedOut) {
      obstacles = [];
      powerups = [];
    }
    const lesson = SPACE_ACADEMY_LESSONS[academyStep];
    academyConfirm(lesson && lesson.confirm ? lesson.confirm : 'NICE!');
    academyTimer(() => {
      if (!academyMode || state !== 'playing') return;
      if (academyStep >= SPACE_ACADEMY_LESSONS.length - 1) completeSpaceAcademy();
      else enterSpaceAcademyLesson(academyStep + 1);
    }, academyStep >= SPACE_ACADEMY_LESSONS.length - 1 ? 1850 : 1650);
  }


  function beginConfiguredWave(startWave, forcedBossName) {
    academyMode = false;
    academyCompleting = false;
    clearSpaceAcademyTimers();
    clearSpaceRuntimeTimers();
    clearSpaceCinematicOverlays();
    bullets = []; obstacles = []; enemyBullets = []; powerups = []; floatTexts = []; blackoutHitFlashes = []; topBanner = null; blackoutShooterIndex = 0;
    boss = null; miniBoss = null; rescueBanner = null; waveCaptivesSeen.clear();
    lastDamageCause=''; lastDamageAmount=0; lastDamageAt=0; lastDamageWave=0; deathCause=''; deathDamageAmount=0; deathWave=0; deathWaveTheme='';
    wave = startWave;
    traitorSpawnFlip = 0;
    waveKills = 0;
    health = 100;
    blasterDisabledUntil = 0;
    score = Math.max(score || 0, (startWave - 1) * 100);
    currentCfg = waveConfig(wave);
    waveTheme = pickWaveTheme(wave, null);
    if (forcedBossName) {
      waveTheme = forcedBossName === 'GIZMO' ? 'gizmo' : 'boss';
      pendingBossCreature = forcedBossName === 'GIZMO'
        ? { name: 'GIZMO', isGizmo: true }
        : BOSS_CREATURES.find(c => c.name === forcedBossName) || pickBossCreature();
    } else {
      pendingBossCreature = (waveTheme === 'boss' || waveTheme === 'gizmo') ? pickBossCreature() : null;
    }
    spawnsRemaining = 0;
    themeEffectsAt = waveTheme === 'blackout' ? Date.now() + SPACE_BLACKOUT_VISUAL_READ_MS : 0;
    waveTransitioning = false;
    pendingBossWin = null;
    startWaveSpawn(currentCfg);
    if (waveTheme === 'blackout') { spawnBlackoutHiddenEnemies(); spaceSfx('wave.blackout'); }
    if (waveTheme === 'captive' && wave === 6) spawnCampaignRescueLock();
    scheduleHpPowerup();
    schedulePowerup();
    scheduleMysteryBox();
    scheduleInstrument();
    if (waveTheme === 'boss') spawnBoss(false, { guardedRescue: [4,7,9,11].includes(wave) && hasUnrescuedMissionCaptive() });
    if (waveTheme === 'gizmo') spawnBoss(false, { guardedRescue: hasUnrescuedMissionCaptive(), escape: !forcedBossName && wave !== SPACE_FINAL_GIZMO_WAVE, final: !forcedBossName && wave === SPACE_FINAL_GIZMO_WAVE });
    if (waveTheme === 'captive' && wave !== 6) spawnBoss(true);
    if (waveTheme === 'ghost' || waveTheme === 'emp') { spawnMiniBoss(waveTheme); if (waveTheme === 'emp') spaceSfx('status.emp'); }
    if (waveTheme === 'mirror') spawnMirrorEnemy();
    if (waveTheme === 'rave') playRaveDiscoStab();
    if (waveTheme !== 'blackout' && waveTheme !== 'music') showTopBanner(forcedBossName ? `TEST ${forcedBossName}` : `DEBUG WAVE ${wave}`, 'good');
    showSkillCalloutForWave();
  }

  let spawnTimer = null;
  function startWaveSpawn(cfg) {
    clearTimeout(spawnTimer);
    if (wave === 3) {
      let enemiesRemaining = Math.max(0, cfg.wave3EnemyTotal || 5);
      let asteroidsRemaining = Math.max(0, cfg.wave3AsteroidTotal || 14);
      const enemyScreenCap = Math.max(1, cfg.wave3EnemyScreenCap || 2);
      spawnsRemaining = enemiesRemaining + asteroidsRemaining;
      const totalSpawns = spawnsRemaining;
      let nextEnemyAt = 0;
      let nextAsteroidAt = 0;
      function doWave3Spawn() {
        if (state !== 'playing') return;
        if (boss || (miniBoss && miniBoss.kind === 'ghost')) { spawnTimer = setTimeout(doWave3Spawn, 500); return; }
        if (spawnsRemaining <= 0) return;
        const now = Date.now();
        const activePurpleEnemies = obstacles.filter(o => o.type === 'face' && o.traitorType === 'purple' && !o.isTrapped && o.alive !== false).length;
        let spawned = false;
        if (enemiesRemaining > 0 && activePurpleEnemies < enemyScreenCap && now >= nextEnemyAt) {
          spawnObstacle(cfg, { forceFace: true, forceTraitorType: 'purple', ignorePurpleCap: true });
          enemiesRemaining--;
          spawnsRemaining--;
          nextEnemyAt = now + rand(760, 1120);
          spawned = true;
        }
        if (asteroidsRemaining > 0 && now >= nextAsteroidAt) {
          spawnObstacle(cfg, { forceAsteroid: true });
          asteroidsRemaining--;
          spawnsRemaining--;
          nextAsteroidAt = now + rand(300, 620);
          spawned = true;
        }
        if (spawnsRemaining <= 0) return;
        const wait = spawned ? 150 : 180;
        spawnTimer = setTimeout(doWave3Spawn, wait);
      }
      spawnTimer = setTimeout(doWave3Spawn, 900);
      return;
    }
    // Boss/captive waves are true encounter waves now: beat the boss, then advance
    // into the next chapter beat instead of resuming a hidden regular spawn pool.
    if (waveTheme === 'boss' || (waveTheme === 'captive' && wave !== 6) || waveTheme === 'gizmo') spawnsRemaining = 0;
    else if (cfg.spawnsRemaining != null) spawnsRemaining = cfg.spawnsRemaining;
    else if (waveTheme === 'asteroids') spawnsRemaining = Math.max(1, Math.ceil(cfg.poolSize * (wave === 5 ? 0.9 : 1.35)));
    else if (waveTheme === 'enemies') spawnsRemaining = Math.max(8, Math.ceil(cfg.poolSize * 0.72));
    else if (waveTheme === 'mirror') spawnsRemaining = Math.max(4, Math.ceil(cfg.poolSize * 0.34));
    else if (waveTheme === 'bomber') spawnsRemaining = Math.max(4, Math.ceil(cfg.poolSize * 0.48));
    else spawnsRemaining = cfg.poolSize;
    const totalSpawns = spawnsRemaining;
    const normalEnemySlots = Array.isArray(cfg.normalEnemySlots) ? cfg.normalEnemySlots : [];
    function doSpawn() {
      if (state !== 'playing') return;
      // Paused entirely while a boss fight is active — it's deploying its own minions
      // instead, not stacked on top of the regular wave queue. GHOST gets the same
      // full pause because it is meant to read as a real encounter.
      if (boss || (miniBoss && miniBoss.kind === 'ghost')) { spawnTimer = setTimeout(doSpawn, 500); return; }
      if (spawnsRemaining <= 0) return; // pool exhausted — let the board clear naturally, no forced wipe
      // SWARM: cap how many enemies are falling at once. Same total pool over the
      // wave (we re-queue rather than consume a spawn), just fewer on screen
      // simultaneously so it reads as a steady stream, not a flood.
      const activeCap = cfg.activeObstacleCap || (waveTheme === 'swarm' ? (cfg.swarmCap || 5) : 0);
      const activeThreats = obstacles.filter(o => o.alive !== false && !o.isTrapped).length;
      if (activeCap && activeThreats >= activeCap) { spawnTimer = setTimeout(doSpawn, 260); return; }
      const spawnIndex = totalSpawns - spawnsRemaining + 1;
      spawnObstacle(cfg, { forceNormalEnemy: normalEnemySlots.includes(spawnIndex) });
      spawnsRemaining--;
      // SWARM speeds up by cadence, not by screen-flooding. ALL ASTEROIDS now works
      // the same way: more total rocks across the wave, but no triple-dumps that
      // make one bomb erase the whole mode or create impossible clumps.
      const themeSpeedup = waveTheme === 'swarm' ? 0.65 : waveTheme === 'goldrush' ? 0.6 : waveTheme === 'asteroids' ? 0.95 : waveTheme === 'mirror' ? 1.25 : waveTheme === 'bomber' ? 1.18 : 1;
      const balanceCadence = cfg.spawnCadenceMult == null ? 1 : cfg.spawnCadenceMult;
      spawnTimer = setTimeout(doSpawn, cfg.spawnMs * 0.8 * themeSpeedup * balanceCadence * (0.7 + Math.random()*0.6));
    }
    spawnTimer = setTimeout(doSpawn, 1500);
  }

  // Phase 2B transition/pacing audit note:
  // After campaign balance changes, re-check that these full-screen beats never
  // appear over live hazards: wave-cleared beat, announceWave(), boss rescue unlock,
  // Gizmo victory briefing, campaign complete overlay, Blackout start/end, Music
  // start/end, and debug jumps. Large overlays should either pause damage or wait
  // for the board to clear first.

  // Brief "WAVE N CLEARED" checkmark beat, same language as the equivalent moment
  // in Whack-a-Mobe — a clean confirmation that the wave is actually done, shown
  // for ~1s before the slot-machine announcement for the next wave begins.
  function showWaveClearedBeat(clearedWave, onDone) {
    const flowToken = spaceFlowToken;
    playMusicBoxArpeggio();
    const el = document.createElement('div');
    el.className = 'space-wave-cleared';
    el.style.cssText = 'position:fixed;inset:0;z-index:9997;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity 0.2s ease-in-out;background:rgba(3,1,16,0.7)';
    el.innerHTML = `
      <div style="font-size:min(30vw,120px);color:#33ff66;text-shadow:0 0 30px #33ff66,0 0 60px #33ff6688;line-height:1">✓</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:26px;letter-spacing:4px;color:#33ff66;text-shadow:0 0 14px #33ff66;margin-top:8px">WAVE ${clearedWave} CLEARED</div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      if (flowToken !== spaceFlowToken || state !== 'playing') { el.remove(); return; }
      el.style.opacity = '0';
      setTimeout(() => { if (flowToken !== spaceFlowToken || state !== 'playing') { el.remove(); return; } el.remove(); onDone(); }, 200);
    }, 1000);
  }

  function showGizmoEscapeBeat(rescuedCi, onDone) {
    const flowToken = spaceFlowToken;
    waveTransitioning = true;
    const isEarlyWave = (wave <= 2 || wave === 10 || wave === 11);
    const holdMs = isEarlyWave ? 7800 : 3300;
    const flyDur = isEarlyWave ? 1.8 : 1.45;
    const flyDelay = isEarlyWave ? 5.2 : 0.25;
    const el = document.createElement('div');
    el.className = 'space-wave-cleared';
    el.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(3,1,16,0.9);opacity:0;transition:opacity 0.25s ease;pointer-events:none';
    const rescueLine = rescuedCi >= 0 ? `BUT ${GAME_CHARS[rescuedCi].name.toUpperCase()} IS FREE` : 'BUT A MOBE IS FREE';
    const hahaHTML = isEarlyWave ? `
      <div style="position:absolute;inset:0;pointer-events:none;overflow:hidden">
        <div style="position:absolute;top:12%;left:8%;font-family:'Bebas Neue',cursive;font-size:28px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 0.5s forwards">HA</div>
        <div style="position:absolute;top:22%;right:12%;font-family:'Bebas Neue',cursive;font-size:34px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 0.9s forwards">HA HA</div>
        <div style="position:absolute;top:8%;left:42%;font-family:'Bebas Neue',cursive;font-size:22px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 1.3s forwards">HA</div>
        <div style="position:absolute;top:32%;left:18%;font-family:'Bebas Neue',cursive;font-size:30px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 1.7s forwards">HA HA</div>
        <div style="position:absolute;top:16%;right:28%;font-family:'Bebas Neue',cursive;font-size:26px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 2.0s forwards">HA</div>
        <div style="position:absolute;top:38%;right:8%;font-family:'Bebas Neue',cursive;font-size:32px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 2.3s forwards">HA HA HA</div>
        <div style="position:absolute;top:5%;left:22%;font-family:'Bebas Neue',cursive;font-size:20px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 2.6s forwards">HA</div>
        <div style="position:absolute;top:28%;left:52%;font-family:'Bebas Neue',cursive;font-size:24px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 2.9s forwards">HA HA</div>
        <div style="position:absolute;top:42%;left:6%;font-family:'Bebas Neue',cursive;font-size:27px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 3.2s forwards">HA</div>
        <div style="position:absolute;top:18%;left:62%;font-family:'Bebas Neue',cursive;font-size:30px;color:#cc66ff;text-shadow:0 0 14px #cc66ff88;opacity:0;animation:sp-haha-float 0.4s ease-out 3.5s forwards">HA HA</div>
      </div>` : '';
    el.innerHTML = `
      ${hahaHTML}
      <div style="position:absolute;left:50%;top:50%;width:118px;text-align:center;animation:sp-gizmo-centered-out ${flyDur}s ease-in ${flyDelay}s both">
        <div style="animation:sp-gizmo-laugh-rock 0.92s ease-in-out infinite">${spaceBriefingBoss('hold')}</div>
      </div>
      <div style="position:absolute;left:50%;top:calc(50% + 88px);width:min(92vw,390px);transform:translateX(-50%);text-align:center">
        <div style="font-family:'Bebas Neue',cursive;font-size:48px;letter-spacing:5px;line-height:1;color:#cc66ff;text-shadow:0 0 18px #cc66ff88">GIZMO ESCAPED!</div>
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:#00e5ff;text-shadow:0 0 10px #00e5ff;margin-top:12px">${rescueLine}</div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    if (isEarlyWave) SFX.scaryLaugh();
    setTimeout(() => {
      if (flowToken !== spaceFlowToken || state !== 'playing') { el.remove(); return; }
      el.style.opacity = '0';
      setTimeout(() => { if (flowToken !== spaceFlowToken || state !== 'playing') { el.remove(); return; } el.remove(); waveTransitioning = false; if (onDone) onDone(); }, 260);
    }, holdMs);
  }

  function showMissionFailedBeat(onDone) {
    const gc = GAME_CHARS[activeChar];
    const isBossRunFail = spaceRunMode === 'bossrun';
    const rescued = rescuedChars.size;
    const total = missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT;
    const bossTotal = bossRunQueue.length || 8;
    const bossesDefeated = Math.min(Math.max(0, bossRunIndex || 0), bossTotal);
    const allSaved = isBossRunFail ? bossesDefeated >= bossTotal : rescued >= total;
    const captiveGrid = missionTrappedChars.length ? missionTrappedChars.map(ci => {
      const g = GAME_CHARS[ci];
      const freed = rescuedChars.has(ci);
      return `<div style="width:42px;text-align:center">
        <div style="position:relative;width:42px;height:42px;border-radius:50%;overflow:visible;filter:${freed ? 'none' : 'grayscale(0.9) brightness(0.55)'}">
          ${charFace(g, freed ? 'happy' : 'sad')}
          ${freed ? `<div style="position:absolute;right:-2px;bottom:-2px;width:14px;height:14px;border-radius:50%;background:#0c1a12;border:1.5px solid #33ff66;display:flex;align-items:center;justify-content:center;font-size:9px;line-height:1;color:#33ff66;box-shadow:0 0 6px rgba(51,255,102,0.65)">&#10003;</div>` : ''}
        </div>
        <div style="font-family:'VCR',monospace;font-size:6px;letter-spacing:0.5px;color:${freed ? 'rgba(242,239,232,0.7)' : 'rgba(242,239,232,0.3)'};margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${g.name}</div>
      </div>`;
    }).join('') : '';
    const el = document.createElement('div');
    el.className = 'space-wave-cleared';
    el.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(3,1,16,0);opacity:1;transition:background 0.35s ease;pointer-events:none';
    el.innerHTML = `
      <div style="width:min(94vw,410px);text-align:center;opacity:0;transform:scale(0.96);transition:opacity 0.35s ease,transform 0.35s ease">
        <div style="font-family:'Bebas Neue',cursive;font-size:52px;letter-spacing:6px;line-height:0.95;color:#ff4444;text-shadow:0 0 22px #ff444488;margin-bottom:18px">MISSION FAILED</div>
        <div style="width:110px;height:110px;margin:0 auto 14px;border-radius:18px;overflow:hidden;border:3px solid ${gc.color}66;background:${gc.color}11;box-shadow:0 0 18px ${gc.color}33">${charFace(gc, 'sad')}</div>
        <div style="font-family:'VCR',monospace;font-size:12px;letter-spacing:3px;color:rgba(242,239,232,0.5);margin-bottom:6px">${gc.name}</div>
        <div style="font-family:'Bebas Neue',cursive;font-size:36px;letter-spacing:4px;line-height:1;color:${allSaved ? '#33ff66' : '#00e5ff'};text-shadow:0 0 14px ${allSaved ? '#33ff66' : '#00e5ff'}88;margin-bottom:6px">${isBossRunFail ? `${bossesDefeated}/${bossTotal} BOSSES DEFEATED` : `${rescued}/${total} HEROES SAVED`}</div>
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:rgba(242,239,232,0.45);margin-bottom:12px">WAVE ${wave} · SCORE ${score}</div>
        <div style="width:min(92vw,360px);margin:0 auto 18px;padding:10px 12px;border:1px solid rgba(255,68,68,0.42);background:rgba(255,68,68,0.10);border-radius:12px;text-align:left;font-family:'VCR',monospace;line-height:1.35">
          <div style="font-size:9px;letter-spacing:2px;color:rgba(242,239,232,0.55);margin-bottom:4px">CAUSE OF DEFEAT</div>
          <div style="font-family:'Bebas Neue',cursive;font-size:28px;letter-spacing:3px;line-height:1;color:#ff6666;text-shadow:0 0 10px rgba(255,68,68,0.55)">${prettyDamageCause(deathCause || lastDamageCause || 'UNKNOWN HAZARD')}</div>
          <div style="font-size:10px;letter-spacing:1.4px;color:rgba(242,239,232,0.72);margin-top:5px">WAVE ${deathWave || wave} — ${deathWaveTheme || waveNameForDeath()}${(deathDamageAmount || lastDamageAmount) ? ` / -${deathDamageAmount || lastDamageAmount} HP` : ''}</div>
        </div>
        ${(!isBossRunFail && captiveGrid) ? `<div style="display:grid;grid-template-columns:repeat(3,42px);justify-content:center;gap:10px 18px;margin:0 auto 20px">${captiveGrid}</div>` : ''}
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:rgba(242,239,232,0.4)">${isBossRunFail ? 'THE BOSSES ARE STILL WAITING' : 'THEY STILL NEED YOU'}</div>
      </div>`;
    document.body.appendChild(el);
    const card = el.firstElementChild;
    requestAnimationFrame(() => {
      el.style.background = 'rgba(3,1,16,0.94)';
      card.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });
    setTimeout(() => {
      // Build the leaderboard/result overlay BEFORE the mission-failed card fades out,
      // so the player never sees the stale launch menu underneath during the handoff.
      if (onDone) onDone();
      requestAnimationFrame(() => {
        el.style.background = 'rgba(3,1,16,0)';
        card.style.opacity = '0';
        card.style.transform = 'scale(1.04)';
        setTimeout(() => { el.remove(); }, 350);
      });
    }, 4800);
  }

  function showBossDefeatedBeat(bossName, x, y, onDone) {
    const flowToken = spaceFlowToken;
    waveTransitioning = true;
    rescueBanner = null;
    clearSpaceCinematicOverlays();
    const el = document.createElement('div');
    el.className = 'space-wave-cleared';
    el.style.cssText = 'position:fixed;inset:0;z-index:9997;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity 0.2s ease';
    el.innerHTML = `
      <div style="text-align:center">
        <div style="font-family:'Bebas Neue',cursive;font-size:clamp(36px,8vw,58px);letter-spacing:5px;line-height:1;color:#ffe61a;text-shadow:0 0 22px #ffe61a88,0 0 44px #ffe61a44;transform:scale(0.85);transition:transform 0.35s cubic-bezier(.2,1.15,.35,1)">${(bossName || 'BOSS').toUpperCase()} DEFEATED!</div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => {
      el.style.opacity = '1';
      el.querySelector('div > div').style.transform = 'scale(1)';
    });
    setTimeout(() => {
      if (flowToken !== spaceFlowToken || state !== 'playing') { el.remove(); return; }
      el.style.opacity = '0';
      setTimeout(() => {
        if (flowToken !== spaceFlowToken || state !== 'playing') { el.remove(); return; }
        el.remove();
        waveTransitioning = false;
        if (onDone) onDone();
      }, 220);
    }, 1800);
  }

  function showBossRescueUnlockBeat(rescuedCi, bossName, onDone) {
    const flowToken = spaceFlowToken;
    if (rescuedCi == null || rescuedCi < 0) { if (onDone) onDone(); return; }
    waveTransitioning = true;
    const gc = GAME_CHARS[rescuedCi];
    const el = document.createElement('div');
    el.className = 'space-wave-cleared';
    el.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 42%,rgba(0,229,255,0.34),rgba(6,30,72,0.96) 48%,rgba(3,1,16,0.98) 100%);opacity:0;transition:opacity 0.25s ease;pointer-events:none;overflow:hidden';
    const img = gc.imgHappy || gc.img;
    el.innerHTML = `
      <div style="position:absolute;inset:-20%;background:repeating-linear-gradient(115deg,rgba(90,190,255,0.08) 0 2px,transparent 2px 36px);animation:sp-brief-star-drift 4s linear infinite"></div>
      <div style="width:min(92vw,410px);text-align:center;position:relative">
        <div style="font-family:'VCR',monospace;font-size:12px;letter-spacing:3px;color:#b9f7ff;text-shadow:0 0 12px #00e5ff;margin-bottom:14px">${bossName || 'BOSS'} LOCK BROKEN</div>
        <div style="position:relative;width:154px;height:154px;margin:0 auto 18px">
          <div style="position:absolute;inset:-10px;border-radius:50%;border:8px solid rgba(0,229,255,0.24);box-shadow:0 0 28px rgba(0,229,255,0.72);animation:sp-ring-spin 2.2s linear infinite"></div>
          <div style="position:absolute;inset:5px;border-radius:50%;border:3px solid #00e5ff;box-shadow:inset 0 0 18px rgba(0,229,255,0.5),0 0 18px rgba(0,229,255,0.5)"></div>
          <div style="position:absolute;inset:22px;border-radius:50%;background:${gc.color || '#33d4e0'};box-shadow:0 0 22px ${gc.color || '#33d4e0'}88;overflow:hidden">
            ${img ? `<img src="${img}" alt="" style="width:100%;height:100%;object-fit:contain;filter:saturate(1.15)">` : `<div style="font-size:62px;line-height:110px">${gc.happy || gc.emoji || ''}</div>`}
          </div>
        </div>
        <div style="font-family:'Bebas Neue',cursive;font-size:54px;letter-spacing:6px;line-height:0.95;color:#33ff66;text-shadow:0 0 22px #33ff6688">${gc.name.toUpperCase()} IS FREE!</div>
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:#b9f7ff;text-shadow:0 0 10px #00e5ff;margin-top:12px">RESCUED ${rescuedChars.size}/${missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT}</div>
      </div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    playRescueFlourish();
    ticketConfetti(true);
    setTimeout(() => {
      if (flowToken !== spaceFlowToken) { el.remove(); return; }
      el.style.opacity = '0';
      setTimeout(() => {
        if (flowToken !== spaceFlowToken) { el.remove(); return; }
        el.remove(); rescueBanner = null; clearSpaceCinematicOverlays(); waveTransitioning = false; if (onDone) onDone();
      }, 260);
    }, 4800);
  }

  function freeAllRemainingMobes() {
    unrescuedMissionCaptives().forEach(ci => rescuedChars.add(ci));
    missionRetryCaptives.splice(0, missionRetryCaptives.length);
    rescueBanner = { ci: activeChar, startedAt: Date.now(), rescued: rescuedChars.size, total: missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT };
  }

  function showSpaceVictoryBriefing(onDone) {
    clearSpaceRuntimeTimers();
    clearSpaceBonusObjects();
    clearSpaceCinematicOverlays();
    rescueBanner = null;
    topBanner = null;
    const flowToken = spaceFlowToken;
    waveTransitioning = true;
    const ov = document.createElement('div');
    ov.className = 'space-rescue-briefing';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,1,16,0);transition:background 0.35s ease;pointer-events:none';
    const allMobes = [...missionEnemyChars, ...missionTrappedChars];
    const gridStyle = "display:grid;grid-template-columns:repeat(4,72px);justify-content:center;align-items:start;gap:16px 18px";
    ov.innerHTML = `
      <div style="width:min(94vw,430px);text-align:center;opacity:0;transform:scale(0.96);transition:opacity 0.35s ease,transform 0.35s ease">
        <div style="font-family:'Bebas Neue',cursive;font-size:54px;letter-spacing:6px;line-height:0.96;color:#33ff66;text-shadow:0 0 22px #33ff6688;margin-bottom:14px">GIZMO DEFEATED!</div>
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:3px;color:#ffe61a;text-shadow:0 0 12px #ffe61a;margin-bottom:16px">LIFE IS BACK TO NORMAL</div>
        <div style="${gridStyle}">${allMobes.map(ci => spaceBriefingFace(ci, 'happy')).join('')}</div>
      </div>`;
    document.body.appendChild(ov);
    const card = ov.firstElementChild;
    playMusicBoxArpeggio(); ticketConfetti(true);
    requestAnimationFrame(() => {
      ov.style.background = 'rgba(3,1,16,0.94)';
      card.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });
    setTimeout(() => {
      if (flowToken !== spaceFlowToken || state !== 'playing') { ov.remove(); return; }
      ov.style.background = 'rgba(3,1,16,0)';
      card.style.opacity = '0';
      card.style.transform = 'scale(1.04)';
      setTimeout(() => {
        if (flowToken !== spaceFlowToken || state !== 'playing') { ov.remove(); return; }
        ov.remove(); waveTransitioning = false; if (onDone) onDone();
      }, 350);
    }, 5200);
  }

function nextWave() {
    if (waveTransitioning) return;

    waveTransitioning = true;
    clearSpaceRuntimeTimers();
    clearSpaceBonusObjects();
    blackoutHitFlashes = [];
    themeEffectsAt = 0;

    // Reward player for clearing a wave
    health = Math.min(100, health + 5);
    addFloatText('+5 HP', player.x, player.y - 50, '#33ff66', 22);
    showTopBanner('+5 HP', 'good');

    const clearedWave = wave;
    const previousTheme = waveTheme;
    wave++;
    waveKills=0;
    blackoutShooterIndex = 0;
    waveCaptivesSeen.clear();
    currentCfg = waveConfig(wave);
    waveTheme = pickWaveTheme(wave, previousTheme);
    // Post-campaign/Endless Blackout otherwise inherits the unbounded endless
    // spawn ramp (no cap, faster cadence, much larger pool than the authored
    // Wave 8 Blackout). Clamp it back to that wave's safe, readable values.
    if (waveTheme === 'blackout' && wave !== 8) {
      currentCfg = Object.assign({}, currentCfg, {
        spawnMs: Math.max(currentCfg.spawnMs, 820),
        activeObstacleCap: Math.min(currentCfg.activeObstacleCap || 8, 8),
        spawnsRemaining: Math.min(currentCfg.spawnsRemaining || 16, 16),
      });
    }
    pendingBossCreature = (waveTheme === 'boss' || waveTheme === 'gizmo') ? pickBossCreature() : null;
    const announceMs = 7000;
    clearSpaceCinematicOverlays();
    rescueBanner = null;
    showWaveClearedBeat(clearedWave, () => {
      themeEffectsAt = Date.now() + announceMs;
      // Nothing for the new wave spawns until the announcement is actually gone —
      // previously these fired on their own shorter timers, racing the announcement
      // rather than waiting for it.
      announceWave(wave, announceMs, () => {
        if (state !== 'playing') return;
        const flowToken = spaceFlowToken;
        themeEffectsAt = waveTheme === 'blackout' ? Date.now() + SPACE_BLACKOUT_VISUAL_READ_MS : 0;
        showSkillCalloutForWave({ delayMs: 0, allowDuringTransition: true });
        // Keep the board quiet for a short read window so wave instructions like
        // BLACKOUT / STAY IN THE LIGHT are not swallowed by immediate hazards.
        setTimeout(() => {
          if (flowToken !== spaceFlowToken || state !== 'playing') return;
          waveTransitioning = false;
          startWaveSpawn(currentCfg);
          // Fresh campaign waves need their support-drop timers restarted here too.
          // The Wave 2/3 configs already allow HP/bombs; without these schedules,
          // normal next-wave flow never gave those drops a chance to fire.
          scheduleHpPowerup();
          schedulePowerup();
          scheduleMysteryBox();
          scheduleInstrument();
          if (waveTheme === 'blackout') { spawnBlackoutHiddenEnemies(); spaceSfx('wave.blackout'); }
          if (waveTheme === 'captive' && wave === 6) spawnCampaignRescueLock();
          if (waveTheme === 'boss') spawnBoss(false, { guardedRescue: [4,7,9,11].includes(wave) && hasUnrescuedMissionCaptive() });
          if (waveTheme === 'gizmo') spawnBoss(false, { guardedRescue: hasUnrescuedMissionCaptive(), escape: wave !== SPACE_FINAL_GIZMO_WAVE, final: wave === SPACE_FINAL_GIZMO_WAVE });
          if (waveTheme === 'captive' && wave !== 6) spawnBoss(true);
          if (waveTheme === 'ghost' || waveTheme === 'emp') { spawnMiniBoss(waveTheme); if (waveTheme === 'emp') spaceSfx('status.emp'); }
          if (waveTheme === 'mirror') spawnMirrorEnemy();
          if (waveTheme === 'rave') playRaveDiscoStab();
        }, SPACE_WAVE_INSTRUCTION_READ_MS);
      });
    });
  }

  function skillCalloutForWave() {
    if (wave === 1) return 'CLEAR THE ROCKS';
    if (wave === 2) return 'RED TRAITOR. DODGE FLUTE SHOTS.';
    if (wave === 3) return 'PURPLE RAIN';
    if (wave === 4) return 'FIRST CAPTIVE. BEAT THE BOSS.';
    if (wave === 5) return 'SWARM. BOMB OR DODGE CLEAN.';
    if (wave === 6) return 'BREAK THE LOCK. WATCH BOTH TRAITORS.';
    if (wave === 8) return 'BLACKOUT. FIND THE SHOOTERS.';
    if (wave === 10) return 'JAM SESSION. HAVE FUN.';
    if (wave === 12) return 'FINAL PREP. FILL SOCKETS.';
    if (wave === SPACE_FINAL_GIZMO_WAVE) return 'FINAL GIZMO. USE EVERYTHING.';
    if (waveTheme === 'boss' && boss && boss.creature && boss.creature.name === 'DARK KNIGHT') return 'WATCH THE SWORD GLOW';
    if (waveTheme === 'boss') return 'SAVE RAPID FIRE FOR BOSS';
    if (waveTheme === 'captive') return 'BREAK THE LOCK FIRST';
    if (waveTheme === 'swarm') return 'BOMB NOW OR DODGE CLEAN';
    if (waveTheme === 'bomber') return 'KILL BOMBERS EARLY';
    if (waveTheme === 'mirror') return 'FIND THE TRIANGLE GAP';
    if (waveTheme === 'asteroids') return 'CLEAR THE ROCKS';
    if (waveTheme === 'enemies') return 'SHOOT FACES. DODGE SHOTS.';
    if (waveTheme === 'blackout') return 'FIND THE SHOOTERS';
    if (waveTheme === 'emp') return 'DODGE THE ZAPS';
    if (waveTheme === 'ghost') return 'TRACK THE GHOST';
    return null;
  }

  function showSkillCalloutForWave(opts) {
    opts = opts || {};
    const text = skillCalloutForWave();
    if (!text) return;
    const flowToken = spaceFlowToken;
    setTimeout(() => {
      if (flowToken !== spaceFlowToken || state !== 'playing' || (waveTransitioning && !opts.allowDuringTransition)) return;
      if (waveTheme === 'blackout') {
        addFloatText('BLACKOUT!', W / 2, H * 0.35, '#ffe61a', 32, { holdMs: 2200, fade: 0.012 });
        addFloatText('STAY IN THE LIGHT', W / 2, H * 0.35 + 30, '#33ff66', 20, { holdMs: 2200, fade: 0.012 });
      } else {
        showTopBanner(text, waveTheme === 'boss' || waveTheme === 'gizmo' || waveTheme === 'captive' ? 'bad' : 'good', { holdMs: 1800 });
      }
    }, opts.delayMs != null ? opts.delayMs : 420);
  }

  const SLOT_SPIN_LABELS = ['SURVIVE', ...WAVE_THEMES.map(t => THEME_LABEL[t])];

  // TYPE (theme name, or SURVIVE for a normal wave) is the headline, with the wave
  // number underneath as the smaller secondary line. Before landing on the actual
  // roll, it spins through random labels like a slot machine, slowing down toward
  // the end — gives the player a clear, dramatic beat to register what's coming
  // instead of an instant reveal. The outer fade-in/out animation runs once across
  // the whole duration; only the type line's text/color is touched during the spin.
  // Captive roster shown on every between-wave break — dim/grayscale (like an empty
  // power-up socket) for Mobes still jailed, full-color happy face + rescued check
  // for ones already freed this run. Reuses the same charFace() the rest of the game
  // draws faces with, just with a CSS filter instead of a separate jail-cell effect.
  function waveCaptiveFace(ci) {
    const gc = GAME_CHARS[ci];
    const freed = rescuedChars.has(ci);
    const size = 54;
    return `<div style="width:${size}px;text-align:center;font-family:'VCR',monospace;font-size:7.5px;letter-spacing:0.5px;color:${freed ? 'rgba(242,239,232,0.7)' : 'rgba(242,239,232,0.38)'}">
      <div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;overflow:visible;filter:${freed ? 'none' : 'grayscale(0.9) brightness(0.55)'}">
        ${charFace(gc, freed ? 'happy' : 'normal')}
        ${freed ? `<div style="position:absolute;right:-2px;bottom:-2px;width:16px;height:16px;border-radius:50%;background:#0c1a12;border:1.5px solid #33ff66;display:flex;align-items:center;justify-content:center;font-size:10px;line-height:1;color:#33ff66;box-shadow:0 0 6px rgba(51,255,102,0.65)">&#10003;</div>` : ''}
      </div>
      <div style="margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${gc.name}</div>
    </div>`;
  }

  function announceWave(w, duration, onDone) {
    const flowToken = spaceFlowToken;
    const ann = document.createElement('div');
    ann.className = 'space-wave-announce';
    // A real dark "intermission" backdrop, not just text floating over still-visible
    // gameplay — this isn't a rush game, a clear break between waves is fine. Fades
    // in/out on its own short transition rather than riding the text's scale/opacity
    // keyframe, so the backdrop itself doesn't appear to "shrink."
    ann.style.cssText='position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow-y:auto;padding:10px 0;pointer-events:none;background:rgba(3,1,16,0);transition:background 0.45s ease';
    const ds = (duration / 1000).toFixed(2);
    // Folding the captive grid into the same centered, animated block naturally pulls
    // the slot-machine text up a bit too — the taller block still centers as a whole.
    const captiveGridHTML = missionTrappedChars.length ? `
      <div style="margin-top:22px;display:grid;grid-template-columns:repeat(3,54px);justify-content:center;gap:12px 16px">${missionTrappedChars.map(waveCaptiveFace).join('')}</div>` : '';
    ann.innerHTML=`<div style="text-align:center;animation:wave-announce ${ds}s ease-out forwards">
      <div id="sp-wave-incoming" style="font-family:'VCR',monospace;font-size:11px;letter-spacing:5px;color:#33ff66">INCOMING</div>
      <div id="sp-wave-type" style="font-family:'Bebas Neue',cursive;font-size:clamp(30px, 8vh, 60px);letter-spacing:6px;color:#33ff66;text-shadow:0 0 20px #33ff66,0 0 40px #33ff6688;line-height:1;transition:transform 0.3s ease-out">SURVIVE</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:clamp(17px, 3.4vh, 26px);letter-spacing:4px;color:#33ff66;text-shadow:0 0 10px #33ff6688;margin-top:6px">WAVE ${w}</div>
      ${captiveGridHTML}
    </div>`;
    document.body.appendChild(ann);
    requestAnimationFrame(() => { ann.style.background = 'rgba(3,1,16,0.88)'; });
    setTimeout(() => { if (flowToken === spaceFlowToken && state === 'playing') ann.style.background = 'rgba(3,1,16,0)'; }, Math.max(0, duration - 450));
    const typeEl = ann.querySelector('#sp-wave-type'), incomingEl = ann.querySelector('#sp-wave-incoming');
    // BOSS is now just another theme entry, with its own THEME_LABEL — no more
    // separate wave-number-based fallback needed.
    const finalLabel = wave === 3 ? 'PURPLE RAIN' : (waveTheme === 'boss' && pendingBossCreature ? pendingBossCreature.name : (waveTheme ? THEME_LABEL[waveTheme] : 'SURVIVE'));
    const finalColor = waveTheme ? '#ff00cc' : '#33ff66';
    const spinDelays = [60,60,70,80,90,110,140,180,230,300,400];
    let i = 0;
    function spin() {
      if (i >= spinDelays.length) {
        typeEl.textContent = finalLabel;
        typeEl.style.color = finalColor;
        typeEl.style.textShadow = `0 0 20px ${finalColor},0 0 40px ${finalColor}88`;
        incomingEl.style.color = finalColor;
        typeEl.style.transform = 'scale(1.18)';
        setTimeout(() => { typeEl.style.transform = 'scale(1)'; }, 10);
        SFX.slotLand();
        return;
      }
      typeEl.textContent = SLOT_SPIN_LABELS[Math.floor(Math.random() * SLOT_SPIN_LABELS.length)];
      typeEl.style.color = '#999';
      typeEl.style.textShadow = 'none';
      SFX.slotTick();
      setTimeout(spin, spinDelays[i++]);
    }
    spin();
    setTimeout(() => { if (flowToken !== spaceFlowToken || state !== 'playing') { ann.remove(); return; } ann.remove(); if (onDone) onDone(); }, duration);
  }


  function prettyDamageCause(cause) {
    return String(cause || 'UNKNOWN HAZARD').toUpperCase();
  }

  function waveNameForDeath() {
    if (boss && boss.creature && boss.creature.name) return boss.creature.name;
    if (miniBoss && miniBoss.kind === 'ghost') return 'GHOST ATTACK';
    if (miniBoss && miniBoss.kind === 'emp') return 'EMP WARNING';
    return THEME_LABEL[waveTheme] || 'SPACE MOBE';
  }


  function spaceLeaderboardMode() {
    if (spaceRunMode === 'bossrun') return 'bossrun';
    if (spaceRunMode === 'endless') return 'endless';
    if (spaceRunMode === 'academy' || spaceRunMode === 'debug') return null;
    return 'campaign';
  }

  function getSpaceLeaderboardKey() {
    const mode = spaceLeaderboardMode();
    if (mode === 'bossrun') return 'space-bossrun';
    if (mode === 'endless') return 'space-endless';
    return 'space-campaign';
  }

  function getSpaceBestKey() {
    const mode = spaceLeaderboardMode();
    if (mode === 'bossrun') return 'space-best-bossrun';
    if (mode === 'endless') return 'space-best-endless';
    return 'space-best-campaign';
  }

  function getSpaceResultField() {
    const mode = spaceLeaderboardMode();
    if (mode === 'bossrun') return 'bosses';
    if (mode === 'endless') return 'wave';
    return 'score';
  }

  function getSpaceResultLabel() {
    const mode = spaceLeaderboardMode();
    if (mode === 'bossrun') return 'BOSSES DEFEATED';
    if (mode === 'endless') return 'WAVE REACHED';
    return 'CAMPAIGN SCORE';
  }

  function getSpaceResultValue() {
    const mode = spaceLeaderboardMode();
    if (mode === 'bossrun') return Math.max(0, bossRunIndex || 0);
    if (mode === 'endless') return Math.max(0, wave || 0);
    return Math.max(0, score || 0);
  }

  function getSpaceResultExtraLine() {
    const mode = spaceLeaderboardMode();
    if (mode === 'bossrun') return `${Math.max(0, bossRunIndex || 0)}/${bossRunQueue.length || 8} BOSSES DEFEATED / SCORE ${score}`;
    if (mode === 'endless') return `SCORE ${score}`;
    return `RESCUED ${rescuedChars.size}/${missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT} / WAVE ${wave}`;
  }

  function recordDamageCause(amount, cause) {
    lastDamageCause = prettyDamageCause(cause);
    lastDamageAmount = amount || 0;
    lastDamageAt = Date.now();
    lastDamageWave = wave || 0;
  }

  function lockDeathCause(amount, cause) {
    deathCause = prettyDamageCause(cause || lastDamageCause || 'UNKNOWN HAZARD');
    deathDamageAmount = amount || lastDamageAmount || 0;
    deathWave = wave || lastDamageWave || 0;
    deathWaveTheme = waveNameForDeath();
  }

  function projectileDamageCause(b) {
    if (!b) return 'ENEMY SHOT';
    if (b.damageCause) return b.damageCause;
    if (b.isLock) return 'SHOTGUN BONES';
    if (b.tennis || b.theme === 'tennis') return 'TENNIS BALL';
    if (b.theme === 'donkey') return 'DONKEY CHARGE';
    if (b.theme === 'sword') return 'KNIGHT SWORD';
    if (b.splat || b.theme === 'ink') return 'OCTO INK';
    if (b.theme === 'fire') return 'DRAGON FIRE';
    if (b.theme === 'fish') return 'SHARK TOOTH';
    if (b.theme === 'sombrero') return 'SOMBRERO HIT';
    if (b.theme === 'portalOrb') return 'TRACKING ORB';
    if (b.theme === 'shield') return 'SHIELD BURST';
    if (b.theme === 'rebound') return 'REBOUND SHOT';
    if (b.theme === 'purpleRain') return 'PURPLE RAIN';
    if (b.isIce) return 'ICE SHOT';
    if (b.isZap) return 'EMP SHOT';
    return 'ENEMY SHOT';
  }

  function gameOverCauseHTML() {
    const cause = prettyDamageCause(deathCause || lastDamageCause || 'UNKNOWN HAZARD');
    const dmg = deathDamageAmount || lastDamageAmount || 0;
    const w = deathWave || wave || 0;
    const theme = deathWaveTheme || waveNameForDeath();
    return `<div style="margin-top:10px;padding:10px 12px;border:1px solid rgba(255,68,68,0.42);background:rgba(255,68,68,0.10);border-radius:12px;text-align:left;font-family:'VCR',monospace;line-height:1.35">
      <div style="font-size:10px;letter-spacing:2px;color:rgba(242,239,232,0.55);margin-bottom:4px">CAUSE OF DEFEAT</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:26px;letter-spacing:3px;line-height:1;color:#ff6666;text-shadow:0 0 10px rgba(255,68,68,0.55)">${cause}</div>
      <div style="font-size:11px;letter-spacing:1.5px;color:rgba(242,239,232,0.72);margin-top:6px">WAVE ${w} — ${theme}${dmg ? ` / -${dmg} HP` : ''}</div>
    </div>`;
  }

  function triggerCampaignReboot() {
    if (campaignRebootUsed) return false;
    campaignRebootUsed = true;
    const rebootWave = wave;
    state = 'rebooting';
    waveTransitioning = true;
    clearSpaceRuntimeTimers();
    clearSpaceBonusObjects();
    obstacles = [];
    boss = null; miniBoss = null; pendingBossWin = null; mirrorSequenceActive = false;
    cancelAnimationFrame(raf);
    const ov = document.createElement('div');
    ov.className = 'space-reboot-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;background:rgba(3,1,16,0.94);opacity:0;transition:opacity 0.22s ease;pointer-events:none;text-align:center;padding:18px;overflow:hidden';
    const renderRebootCard = (failed) => {
      ov.innerHTML = failed ? `<div style="font-family:'Bebas Neue',cursive;color:#ff4444;text-shadow:0 0 22px #ff4444,0 0 44px #ff444488;letter-spacing:5px;line-height:1;transform:translateY(-18px);animation:sp-reboot-drop 0.55s cubic-bezier(.2,1.15,.35,1) forwards">
        <div style="font-size:clamp(38px,12vw,78px)">YOU FAILED</div>
        <div style="font-family:'VCR',monospace;font-size:clamp(18px,5vw,32px);letter-spacing:3px;color:#ffe61a;text-shadow:0 0 16px #ffe61a;margin-top:18px">REBOOT SIGNAL FOUND</div>
      </div>` : `<div style="font-family:'Bebas Neue',cursive;color:#33ff66;text-shadow:0 0 22px #33ff66,0 0 44px #33ff6688;letter-spacing:5px;line-height:1;transform:translateY(24px);animation:sp-reboot-rise 0.55s cubic-bezier(.2,1.15,.35,1) forwards">
        <div style="font-size:clamp(36px,12vw,76px)">SYSTEM BACK ONLINE</div>
        <div style="font-family:'VCR',monospace;font-size:clamp(14px,3.8vw,22px);letter-spacing:3px;color:#ffe61a;text-shadow:0 0 12px #ffe61a;margin-top:14px">REBOOTING AT WAVE ${rebootWave}</div>
      </div>`;
    };
    if (!document.getElementById('space-reboot-keyframes')) {
      const style = document.createElement('style');
      style.id = 'space-reboot-keyframes';
      style.textContent = `@keyframes sp-reboot-drop{from{opacity:0;transform:translateY(-34px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}@keyframes sp-reboot-rise{from{opacity:0;transform:translateY(34px) scale(.96)}to{opacity:1;transform:translateY(0) scale(1)}}`;
      document.head.appendChild(style);
    }
    renderRebootCard(true);
    document.body.appendChild(ov);
    requestAnimationFrame(() => { ov.style.opacity = '1'; });
    SFX.over && SFX.over();
    setTimeout(() => {
      renderRebootCard(false);
      playMusicBoxArpeggio();
    }, 1150);
    setTimeout(() => {
      ov.style.opacity = '0';
      setTimeout(() => {
        ov.remove();
        if (!document.body.classList.contains('on-space')) { state = 'idle'; waveTransitioning = false; return; }
        state = 'playing';
        beginConfiguredWave(rebootWave);
        health = 60;
        waveTransitioning = false;
        showTopBanner('SYSTEM BACK ONLINE', 'good');
        raf = requestAnimationFrame(loop);
      }, 240);
    }, 2950);
    return true;
  }

  function takeDamage(amount, cause) {
    if (spaceDamageSuppressed()) return;
    if (academyMode) {
      const now = Date.now();
      if (now - academyShieldNoticeAt > 850) {
        academyShieldNoticeAt = now;
        addFloatText('TRAINING SHIELD', player.x, player.y - 44, '#00e5ff', 16, { vy: -0.9, fade: 0.035 });
        miniExplosion(player.x, player.y, '#00e5ff');
      }
      return;
    }
    if (Date.now() < buffShieldUntil) {
      addFloatText('BLOCKED!', player.x, player.y - 40, '#00e5ff', 18);
      miniExplosion(player.x, player.y, '#00e5ff');
      playShieldBellPing();
      return; // shield fully absorbs the hit — no health loss
    }
    recordDamageCause(amount, cause);
    health = Math.max(0, health - amount);
    addFloatText(`-${amount}`, player.x, player.y - 40, '#ff4444', 20);
    miniExplosion(player.x, player.y, '#ff4444');
    triggerShake(amount * 1.2);
    spaceSfx('player.hit');
    // Mystery "snowing" outcome — getting hit at all while it's snowing also
    // freezes you briefly, on top of the normal damage. Reuses the existing
    // FROZEN debuff (movement slow + snowflake bullets) rather than a new state.
    if (Date.now() < snowingUntil) {
      buffFrozenUntil = Math.max(buffFrozenUntil, Date.now() + 2000);
      addFloatText('FROZEN!', player.x, player.y - 60, '#66ddff', 16);
      playFrozenGlassShimmer();
    }
    if (health <= 0 && state === 'playing') lockDeathCause(amount, cause);
    if (health <= 0 && state === 'playing' && spaceRunMode === 'campaign' && wave <= SPACE_CAMPAIGN_FINAL_WAVE && !campaignRebootUsed) {
      if (triggerCampaignReboot()) return;
    }
    if (health <= 0) {
      // 'dying' (not 'over' yet) — loop() keeps redrawing a frozen frame (background,
      // stars, frozen obstacles/player) for this window instead of stopping outright.
      // Cancelling the loop immediately here used to leave the death explosion's own
      // particle frames smeared on a canvas nothing was clearing anymore.
      state = 'dying';
      waveTransitioning = false;
      clearTimeout(spawnTimer);
      SFX.over();
      triggerShake(18);
      bigExplosion(player.x, player.y, GAME_CHARS[activeChar].color);
      const resultBestValue = getSpaceResultValue();
      if (resultBestValue > highScore) { highScore = resultBestValue; localStorage.setItem(getSpaceBestKey(), resultBestValue); }
      // Freeze on the death frame for 3s before showing the game-over overlay
      setTimeout(() => {
        waveTransitioning = false;
        state = 'over';
        cancelAnimationFrame(raf);
        showSpaceOverlay('over');
      }, 3000);
    }
  }

  function shieldDeflectObstacle(o) {
    if (!o || o.isTrapped || o.isDeflected) return false;
    const dx = o.x - player.x;
    const dy = o.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    o.isDeflected = true;
    o.deflectStart = Date.now();
    o.deflectDuration = 620;
    o.deflectScale = 1;
    o.deflectSpin = (Math.random() < 0.5 ? -1 : 1) * (0.22 + Math.random() * 0.08);
    o.vx = (dx / dist) * 8;
    o.vy = -Math.abs((dy / dist) * 8) - 5;
    o.paused = false;
    o.pausedBurstDone = true;
    o.burstShotsLeft = 0;
    waveKills++;
    score += o.type === 'asteroid' ? 10 + wave * 2 : 25 + wave * 5;
    addFloatText('DEFLECT!', o.x, o.y - 10, '#00e5ff', 18);
    miniExplosion(o.x, o.y, '#00e5ff');
    playShieldBellPing();
    return true;
  }

  function drawCanvasMobe(gc, expr, x, y, w, h, options) {
    options = options || {};
    const src = expr === 'happy' ? (gc.imgHappy || gc.img)
      : expr === 'sad' ? (gc.imgSad || gc.img)
      : gc.img;
    const img = src ? _getImg(src) : null;
    ctx.save();
    if (options.glowColor) {
      ctx.shadowColor = options.glowColor;
      ctx.shadowBlur = options.glowBlur || Math.max(w, h) * 0.18;
    }
    if (img && img.complete && img.naturalWidth) {
      if (options.whiteOutline) {
        ctx.shadowBlur = 0;
        ctx.globalAlpha *= 0.92;
        ctx.filter = 'brightness(0) invert(1)';
        const o = options.outlineSize || Math.max(2, Math.min(w, h) * 0.08);
        for (const [dx, dy] of [[-o,0],[o,0],[0,-o],[0,o],[-o,-o],[o,-o],[-o,o],[o,o]]) {
          ctx.drawImage(img, x + dx, y + dy, w, h);
        }
        ctx.filter = 'none';
        ctx.globalAlpha /= 0.92;
        if (options.glowColor) {
          ctx.shadowColor = options.glowColor;
          ctx.shadowBlur = options.glowBlur || Math.max(w, h) * 0.18;
        }
      }
      ctx.drawImage(img, x, y, w, h);
    } else {
      ctx.font = `${Math.min(w, h) * 0.72}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(expr === 'happy' ? gc.happy : expr === 'sad' ? gc.sad : gc.emoji, x + w / 2, y + h / 2);
    }
    ctx.restore();
  }

  function drawPlayer() {
    const p = player, gc = GAME_CHARS[activeChar];
    ctx.save(); ctx.translate(p.x, p.y);
    if (Date.now() < buffShieldUntil) {
      const t = Date.now() * 0.005;
      const pulse = 0.95 + Math.sin(t * 1.6) * 0.06;
      const r = p.r * 1.82 * pulse;
      ctx.save();
      ctx.rotate(t * 0.45);
      ctx.beginPath();
      for (let k = 0; k < 8; k++) {
        const a = k * Math.PI / 4;
        const rr = r * (k % 2 ? 0.9 : 1.05);
        const x = Math.cos(a) * rr, y = Math.sin(a) * rr;
        if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = 'rgba(0,229,255,0.1)';
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,229,255,0.72)';
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(234,255,255,0.9)';
      ctx.stroke();
      for (let k = 0; k < 4; k++) {
        const a = t * 1.4 + k * Math.PI / 2;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        ctx.fillStyle = k % 2 ? '#eaffff' : '#00e5ff';
        ctx.beginPath(); ctx.rect(x - 2.4, y - 2.4, 4.8, 4.8); ctx.fill();
      }
      ctx.restore();
    }
    // thruster glow — no shadowBlur for perf; use a larger semi-transparent fill instead
    ctx.beginPath(); ctx.moveTo(-10,10); ctx.lineTo(0,28); ctx.lineTo(10,10); ctx.closePath();
    ctx.fillStyle='rgba(0,229,255,0.5)'; ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0,-p.r*1.1);
    ctx.lineTo(p.r*0.75, p.r*0.5);
    ctx.lineTo(p.r*0.4,  p.r*0.8);
    ctx.lineTo(-p.r*0.4, p.r*0.8);
    ctx.lineTo(-p.r*0.75,p.r*0.5);
    ctx.closePath();
    ctx.fillStyle=gc.color; ctx.fill();
    ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke();
    const fr = p.r*0.52;
    ctx.beginPath(); ctx.arc(0,-fr*0.3,fr+2,0,Math.PI*2);
    ctx.fillStyle='#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(0,-fr*0.3,fr,0,Math.PI*2);
    ctx.fillStyle=gc.color; ctx.fill();
    drawCanvasMobe(gc, 'normal', -fr, -fr * 1.3, fr * 2, fr * 2);
    ctx.restore();
  }

  function drawObstacle(o) {
    ctx.save(); ctx.translate(o.x,o.y);
    if (o.isDeflected) {
      ctx.globalAlpha *= Math.max(0, o.deflectScale == null ? 1 : o.deflectScale);
      ctx.rotate((Date.now() - (o.deflectStart || Date.now())) * 0.02 * (o.deflectSpin || 0.2));
      ctx.scale(Math.max(0.08, o.deflectScale || 1), Math.max(0.08, o.deflectScale || 1));
    }
    if (o.type==='asteroid') {
      ctx.rotate(o.rot);
      const rockStyle = o.rockStyle || 0;
      const fill = rockStyle === 1 ? '#6a5b78' : rockStyle === 2 ? '#4f596f' : '#5c526c';
      const stroke = rockStyle === 1 ? '#9b86a8' : rockStyle === 2 ? '#7f94a8' : '#8b7fa3';
      const dark = rockStyle === 1 ? '#3c3048' : rockStyle === 2 ? '#2f3848' : '#362f42';
      ctx.beginPath();
      o.verts.forEach(([x,y],i)=>i===0?ctx.moveTo(x,y):ctx.lineTo(x,y));
      ctx.closePath();
      ctx.fillStyle=C(fill); ctx.fill();
      ctx.strokeStyle=C(dark); ctx.lineWidth=Math.max(3, o.r * 0.16); ctx.stroke();
      ctx.strokeStyle=C(stroke); ctx.lineWidth=Math.max(1.5, o.r * 0.06); ctx.stroke();

      const facets = [
        [[-0.55,-0.18],[-0.2,-0.58],[0.08,-0.2],[-0.12,0.08]],
        [[0.05,-0.48],[0.54,-0.26],[0.32,0.12],[-0.02,0.02]],
        [[-0.42,0.08],[-0.06,0.24],[-0.2,0.58],[-0.58,0.42]],
        [[0.16,0.16],[0.5,0.04],[0.42,0.48],[0.02,0.55]],
      ];
      facets.forEach((poly, i) => {
        ctx.beginPath();
        poly.forEach(([px, py], k) => k ? ctx.lineTo(px * o.r, py * o.r) : ctx.moveTo(px * o.r, py * o.r));
        ctx.closePath();
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.16)';
        ctx.fill();
      });
      ctx.strokeStyle='rgba(25,20,34,0.34)'; ctx.lineWidth=Math.max(1.2, o.r * 0.045);
      ctx.beginPath(); ctx.moveTo(-o.r*0.44,-o.r*0.22); ctx.lineTo(o.r*0.18,o.r*0.22); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(o.r*0.12,-o.r*0.44); ctx.lineTo(o.r*0.44,o.r*0.08); ctx.stroke();
    } else {
      const gc=GAME_CHARS[o.ci];
      if (o.isTrapped) {
        const jailS = o.r * 1.85;
        ctx.fillStyle = 'rgba(0,229,255,0.12)';
        ctx.fillRect(-jailS/2, -jailS/2, jailS, jailS);
        ctx.strokeStyle = '#00e5ff';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(-jailS/2, -jailS/2, jailS, jailS);
        ctx.fillStyle = 'rgba(0,229,255,0.22)';
        ctx.fillRect(-jailS/2, -jailS/2, jailS, jailS);
        ctx.strokeStyle = 'rgba(234,255,255,0.72)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-jailS * 0.22, -jailS/2); ctx.lineTo(-jailS * 0.22, jailS/2); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(jailS * 0.22, -jailS/2); ctx.lineTo(jailS * 0.22, jailS/2); ctx.stroke();
        ctx.save();
        ctx.beginPath(); ctx.rect(-jailS/2, -jailS/2, jailS, jailS); ctx.clip();
      }
      const faceScale = o.isTrapped ? 2.12 : (o.behavior === 'swarmer' ? 2.05 : 2.24);
      const traitorGlow = o.traitorType === 'purple' ? 'rgba(179,107,255,0.58)' : 'rgba(255,68,68,0.45)';
      drawCanvasMobe(gc, o.isTrapped ? 'sad' : 'normal', -o.r * faceScale / 2, -o.r * faceScale / 2, o.r * faceScale, o.r * faceScale, {
        glowColor: o.isTrapped ? 'rgba(0,229,255,0.72)' : (o.behavior === 'swarmer' ? 'rgba(255,0,0,0.78)' : traitorGlow),
        glowBlur: o.r * (o.isTrapped ? 0.35 : (o.behavior === 'swarmer' ? 0.42 : 0.18)),
      });
      if (!o.isTrapped && o.traitorType === 'purple') {
        const spin = Date.now() * 0.011 + (o._pulseSeed || 0);
        const pulse = 0.86 + Math.sin(Date.now() * 0.008 + (o._pulseSeed || 0)) * 0.14;
        const raining = purpleRainActive(o, Date.now());
        ctx.save();
        ctx.globalAlpha = 0.86 + pulse * 0.14;
        ctx.shadowColor = '#6f00ff';
        ctx.shadowBlur = o.r * (1.1 + pulse * 0.6);
        ctx.lineCap = 'round';

        // Broken 2D rings make the spin readable; draw the gaps manually so the
        // first purple enemy does not depend on canvas dash state.
        const drawSpinSegments = (radius, phase, color, width, segments) => {
          ctx.strokeStyle = color;
          ctx.lineWidth = width;
          for (let i = 0; i < segments; i++) {
            const a = phase + i * Math.PI * 2 / segments;
            ctx.beginPath();
            ctx.arc(0, 0, radius, a, a + Math.PI * 0.28);
            ctx.stroke();
          }
        };
        drawSpinSegments(o.r * 1.28, spin, '#6f00ff', 4, 5);
        drawSpinSegments(o.r * 1.55, -spin * 1.35, '#a233ff', 3, 6);
        if (raining) {
          for (let i = 0; i < 4; i++) {
            const a = spin * (i % 2 ? -1.35 : 1.15) + i * Math.PI / 2;
            const rr = i % 2 ? o.r * 1.55 : o.r * 1.28;
            ctx.fillStyle = i % 2 ? 'rgba(235,216,255,0.95)' : 'rgba(162,51,255,0.98)';
            ctx.beginPath();
            ctx.arc(Math.cos(a) * rr, Math.sin(a) * rr, o.r * 0.11, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        if (raining) {
          const rainGlow = 0.94 + Math.sin(Date.now() * 0.0026 + (o._pulseSeed || 0) * 0.7) * 0.06;
          ctx.globalAlpha = 0.46 * rainGlow;
          ctx.fillStyle = 'rgba(130,60,196,0.62)';
          ctx.beginPath();
          // Lightweight glow only around drizzle area.
          ctx.ellipse(0, o.r * 1.20, o.r * 0.78, o.r * 0.30, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.70;
          ctx.fillStyle = 'rgba(232,210,255,0.88)';
          const rainDots = [[-0.54, 1.14], [-0.32, 1.26], [-0.10, 1.17], [0.12, 1.28], [0.34, 1.16], [0.56, 1.24]];
          for (let i = 0; i < rainDots.length; i++) {
            const x = rainDots[i][0] * o.r + Math.sin(spin + i * 0.7) * 0.9;
            const y = rainDots[i][1] * o.r;
            ctx.beginPath();
            ctx.arc(x, y, o.r * 0.075, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        ctx.restore();
      }
      if (!o.isTrapped && o.traitorType === 'red') {
        const nowRed = Date.now();
        const echoLeft = Math.max(0, (o.redEchoMuzzleUntil || 0) - nowRed);
        const echoA = Math.max(0, Math.min(1, echoLeft / 380));
        const spinRed = nowRed * 0.0105 + (o._pulseSeed || 0) * 0.7;
        ctx.save();
        ctx.globalAlpha = 0.28 + echoA * 0.48;
        ctx.strokeStyle = echoA > 0 ? 'rgba(255,132,110,0.96)' : 'rgba(255,96,96,0.62)';
        ctx.lineWidth = 2.2;
        for (let i = 0; i < 3; i++) {
          const a = spinRed + i * (Math.PI * 2 / 3);
          const r = o.r * (1.08 + i * 0.07);
          const x = Math.cos(a) * r;
          const y = Math.sin(a) * r;
          ctx.beginPath();
          ctx.moveTo(x * 0.66, y * 0.66);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        if (echoA > 0) {
          ctx.fillStyle = 'rgba(255,108,88,0.24)';
          ctx.beginPath();
          ctx.arc(0, o.r * 0.84, o.r * (0.26 + (1 - echoA) * 0.22), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      if (o.isTrapped) {
        ctx.restore();
        ctx.fillStyle = 'rgba(0,229,255,0.32)';
        ctx.fillRect(-o.r, -o.r, o.r * 2, o.r * 2);
      }
      if (!o.isTrapped) {
        if (o.behavior === 'swarmer') {
          const flash = 0.55 + Math.sin(Date.now() * 0.018 + (o.swarmerFlashSeed || 0)) * 0.45;
          ctx.save();
          ctx.globalAlpha = 0.40 + flash * 0.42;
          ctx.strokeStyle = '#ff0000';
          ctx.fillStyle = 'rgba(255,0,0,0.16)';
          ctx.lineWidth = 3.4;
          ctx.beginPath();
          ctx.arc(0, 0, o.r * (1.55 + flash * 0.22), 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          ctx.strokeStyle = 'rgba(255,235,235,0.9)';
          ctx.lineWidth = 2.2;
          ctx.beginPath();
          ctx.moveTo(-o.r * 0.72, -o.r * 1.18); ctx.lineTo(0, -o.r * 1.62); ctx.lineTo(o.r * 0.72, -o.r * 1.18);
          ctx.stroke();
          ctx.restore();
        }
        // Enemy target lock: keep the red language outside the face so the character
        // art stays readable, then add small inward ticks that say "shoot this."
        ctx.lineCap = 'round';
        if (o._pulseSeed === undefined) o._pulseSeed = Math.random() * 1000;
        const pulse = 0.94 + Math.sin(Date.now() * 0.004 + o._pulseSeed) * 0.06;
        const isPurpleTraitor = o.traitorType === 'purple';
        const isRedTraitor = o.traitorType === 'red';
        const lockSoft = isPurpleTraitor ? 'rgba(179,107,255,0.30)' : 'rgba(255,92,64,0.30)';
        const lockHard = isPurpleTraitor ? '#b36bff' : '#ff5a3c';
        const tickColor = isPurpleTraitor ? 'rgba(238,220,255,0.86)' : 'rgba(255,231,210,0.90)';
        ctx.save();
        ctx.scale(pulse, pulse);
        ctx.beginPath();
        ctx.arc(0, 0, o.r * 1.18, 0.12 * Math.PI, 1.88 * Math.PI);
        ctx.strokeStyle = lockSoft; ctx.lineWidth = 9; ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, o.r * 1.18, 0.12 * Math.PI, 1.88 * Math.PI);
        ctx.strokeStyle = lockHard; ctx.lineWidth = 3.2; ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = tickColor;
        ctx.lineWidth = 1.8;
        if (isRedTraitor) {
          const t3 = Date.now() * 0.007 + (o._pulseSeed || 0) * 0.4;
          const ringR = o.r * 1.12;
          ctx.save();
          ctx.rotate(t3);
          ctx.strokeStyle = 'rgba(255,108,88,0.92)';
          ctx.lineWidth = 2.2;
          for (let i = 0; i < 4; i++) {
            const a = i * Math.PI * 0.5 + Math.PI * 0.08;
            ctx.beginPath();
            ctx.arc(0, 0, ringR, a, a + Math.PI * 0.24);
            ctx.stroke();
          }
          ctx.restore();
          ctx.strokeStyle = 'rgba(255,235,220,0.92)';
          ctx.lineWidth = 1.9;
          for (let i = 0; i < 3; i++) {
            const a = t3 * 1.2 + i * (Math.PI * 2 / 3);
            const x = Math.cos(a) * o.r * 1.22;
            const y = Math.sin(a) * o.r * 1.22;
            ctx.beginPath();
            ctx.moveTo(x * 0.88, y * 0.88);
            ctx.lineTo(x, y);
            ctx.stroke();
          }
        } else {
          ctx.beginPath(); ctx.moveTo(-o.r * 1.05, 0); ctx.lineTo(-o.r * 0.62, 0); ctx.moveTo(o.r * 0.62, 0); ctx.lineTo(o.r * 1.05, 0); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, -o.r * 1.05); ctx.lineTo(0, -o.r * 0.68); ctx.moveTo(0, o.r * 0.68); ctx.lineTo(0, o.r * 1.05); ctx.stroke();
        }
      }
      if (o.isTrapped && o.ringHp > 0) {
        // Same "special shoot target" language as the mystery crate, but blue:
        // a soft outer glow, a bright inner ring, and orbiting dots that read as
        // rescue tech instead of a plain selection outline.
        const ringR = o.r * 0.76;
        const t2 = Date.now() * 0.003;
        const seed = o._pulseSeed || 0;
        const ringPulse = 1 + Math.sin(Date.now() * 0.008 + seed) * 0.05;
        ctx.save();
        ctx.rotate(t2);
        ctx.beginPath(); ctx.arc(0, 0, ringR * 1.14 * ringPulse, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(90,190,255,0.26)'; ctx.lineWidth = 8; ctx.stroke();
        const ringGrad = ctx.createLinearGradient(-ringR, -ringR, ringR, ringR);
        ringGrad.addColorStop(0, '#5ab1ff');
        ringGrad.addColorStop(0.48, '#00e5ff');
        ringGrad.addColorStop(1, '#b9f7ff');
        ctx.beginPath(); ctx.arc(0, 0, ringR * 1.02 * ringPulse, 0, Math.PI * 2);
        ctx.strokeStyle = ringGrad; ctx.lineWidth = 2.8; ctx.stroke();
        for (let d = 0; d < 4; d++) {
          const a = (d / 4) * Math.PI * 2 + t2;
          ctx.fillStyle = d % 2 ? '#eaffff' : '#5ab1ff';
          ctx.beginPath(); ctx.arc(Math.cos(a) * ringR * 1.02 * ringPulse, Math.sin(a) * ringR * 1.02 * ringPulse, 3.2, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        if (o.maxRingHp) {
          ctx.font = `bold ${Math.max(10, o.r * 0.54)}px 'Bebas Neue', cursive`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillStyle = '#eaffff';
          ctx.strokeStyle = 'rgba(0,0,0,0.72)'; ctx.lineWidth = 3;
          const hpText = `${Math.max(0, o.ringHp)}/${o.maxRingHp}`;
          ctx.strokeText(hpText, 0, o.r + 14);
          ctx.fillText(hpText, 0, o.r + 14);
        }
      }
    }
    ctx.restore();
  }

  // RAVE wave: a disco ball hanging at the top, slowly spinning, throwing off a
  // few sparkle glints. SVG-style vector shapes (facets + lines), not emoji.
  function drawDiscoBall() {
    const x = W / 2, y = 46, r = 22;
    const t = Date.now() * 0.0012;
    // Rotating colored light beams sweeping down from the ball — drawn first so
    // the ball itself sits in front of them.
    const beamColors = ['255,0,255', '0,255,255', '255,255,0', '57,255,20'];
    for (let i = 0; i < beamColors.length; i++) {
      const a = t * 1.3 + (i / beamColors.length) * Math.PI * 2;
      const len = H * 0.5;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      const grad = ctx.createLinearGradient(0, 0, 0, len);
      grad.addColorStop(0, `rgba(${beamColors[i]},0.22)`);
      grad.addColorStop(1, `rgba(${beamColors[i]},0)`);
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.lineTo(34, len); ctx.lineTo(-34, len);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(200,200,210,0.5)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -r - 18); ctx.lineTo(0, -r); ctx.stroke();
    ctx.rotate(Math.sin(t) * 0.25);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#aab0c0'; ctx.fill();
    // Faceted mirror tiles — a small grid of quads, alternating shade for a
    // checkered-mirror look, clipped to the circle.
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.clip();
    const cols = 7;
    for (let row = -cols; row <= cols; row++) {
      for (let col = -cols; col <= cols; col++) {
        const tx = col * (r * 2 / cols), ty = row * (r * 2 / cols);
        if (Math.hypot(tx, ty) > r + 4) continue;
        const shade = (row + col + Math.floor(t * 2)) % 2 === 0 ? 'rgba(255,255,255,0.35)' : 'rgba(40,40,60,0.35)';
        ctx.fillStyle = shade;
        ctx.fillRect(tx - r/cols + 0.5, ty - r/cols + 0.5, r*2/cols - 1, r*2/cols - 1);
      }
    }
    ctx.restore();
    ctx.restore();
    // Sparkle glints flung outward, twinkling on/off.
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + t * 1.6;
      const dist = r + 14 + Math.sin(t * 3 + i) * 6;
      const spx = x + Math.cos(a) * dist, spy = y + Math.sin(a) * dist * 0.6;
      const tw = Math.abs(Math.sin(t * 4 + i * 1.7));
      if (tw < 0.4) continue;
      ctx.beginPath(); ctx.arc(spx, spy, 1.6, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${tw})`; ctx.fill();
    }
  }

  function drawHUD() {
    // Score (top left) — hidden while the top banner is showing (appears through
    // its full fade-in/hold/fade-out) rather than competing with it; nobody reads
    // it that closely mid-action anyway.
    if (!topBanner) {
      ctx.fillStyle = 'rgba(242,239,232,0.92)';
      ctx.font = `bold 23px 'Bebas Neue', cursive`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(`SCORE ${score}`, 10, 6);
    }

    // Wave number / HP percent text both removed — the health bar fill is already
    // the at-a-glance signal, and wave number isn't something players read mid-action.
    const barY = 56;
    const barW = W; // spans the full screen edge-to-edge, not inset
    const barX = 0;
    const barH = 14;
    const hp = Math.max(0, health) / 100;

    // Background track
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(barX, barY, barW, barH);

    // Health fill — no shadowBlur; use a brighter overlay strip for effect
    ctx.fillStyle = hp > 0.6 ? '#33ff66' : hp > 0.3 ? '#ffe61a' : '#ff4444';
    ctx.fillRect(barX, barY, barW * hp, barH);
    ctx.fillStyle = hp > 0.6 ? 'rgba(51,255,102,0.3)' : hp > 0.3 ? 'rgba(255,230,26,0.3)' : 'rgba(255,68,68,0.3)';
    ctx.fillRect(barX, barY, barW * hp, barH * 0.4);

    // Section dividers (10 segments = 10 HP each)
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1.5;
    for (let i = 1; i < 10; i++) {
      const sx = barX + barW * (i / 10);
      ctx.beginPath(); ctx.moveTo(sx, barY); ctx.lineTo(sx, barY + barH); ctx.stroke();
    }

    // Active buff indicators (top right, under the health bar now). Right-aligned at
    // W-10, so a long string only ever grows further left — drawBuffLine() shrinks the
    // font until it fits within the canvas width instead of risking it running off
    // the left edge on a narrow screen.
    function drawBuffLine(text, y, color, baseSize) {
      let size = baseSize;
      ctx.font = `bold ${size}px 'Bebas Neue', cursive`;
      // Extra margin beyond the raw fit check — emoji glyphs (especially ones with a
      // variation selector) can render wider than measureText() reports on some
      // platforms, so don't cut it exactly at the limit.
      while (ctx.measureText(text).width > W - 28 && size > 9) {
        size--;
        ctx.font = `bold ${size}px 'Bebas Neue', cursive`;
      }
      ctx.fillStyle = color;
      ctx.fillText(text, W - 10, y);
    }
    function drawBuffIconLine(iconType, text, y, color, baseSize) {
      let size = baseSize;
      const iconSize = Math.max(16, baseSize + 5);
      ctx.font = `bold ${size}px 'Bebas Neue', cursive`;
      while (ctx.measureText(text).width + iconSize + 7 > W - 28 && size > 9) {
        size--;
        ctx.font = `bold ${size}px 'Bebas Neue', cursive`;
      }
      const textW = ctx.measureText(text).width;
      const iconX = W - 10 - textW - 7 - iconSize / 2;
      const iconY = y - Math.max(5, size * 0.36);
      drawProjectileImage(iconType, iconX, iconY, iconSize, 0, color, true);
      ctx.textAlign = 'right';
      ctx.fillStyle = color;
      ctx.fillText(text, W - 10, y);
    }
    ctx.textAlign = 'right';
    let buffY = barY + barH + 16;
    const now = Date.now();
    if (now < buffSpeedUntil) {
      drawBuffIconLine('gun', `SPEED ${Math.ceil((buffSpeedUntil - now) / 1000)}s`, buffY, '#ffe61a', 13);
      buffY += 18;
    }
    if (now < buffGunUntil) {
      drawBuffIconLine('gun', `RAPID FIRE ${Math.ceil((buffGunUntil - now) / 1000)}s`, buffY, '#ffe61a', 13);
      buffY += 18;
    }
    if (now < buffShieldUntil) {
      drawBuffIconLine('powerShield', `SHIELD ${Math.ceil((buffShieldUntil - now) / 1000)}s`, buffY, '#00e5ff', 13);
      buffY += 18;
    }
    if (now < buffFrozenUntil) {
      drawBuffIconLine('ice', `FROZEN ${Math.ceil((buffFrozenUntil - now) / 1000)}s`, buffY, '#66ddff', 13);
      buffY += 18;
    }
    if (now < buffZappedUntil) {
      drawBuffIconLine('zap', `FART ${Math.ceil((buffZappedUntil - now) / 1000)}s`, buffY, '#cc99ff', 13);
      buffY += 18;
    }
    if (now < blasterDisabledUntil) {
      drawBuffLine(`BLASTER JAM ${Math.ceil((blasterDisabledUntil - now) / 1000)}s`, buffY, '#ff76d2', 13);
      buffY += 18;
    }
    if (now < controlsReversedUntil) {
      drawBuffLine(`🔀 REVERSED ${Math.ceil((controlsReversedUntil - now) / 1000)}s`, buffY, '#ff5500', 13);
      buffY += 18;
    }
    if (now < buffPizzaUntil) {
      drawBuffIconLine('pizza', `PIZZA BLAST ${Math.ceil((buffPizzaUntil - now) / 1000)}s`, buffY, '#ffcc44', 13);
      buffY += 18;
    }
    if (waveTheme === 'rave') {
      drawBuffLine('🪩 RAVE MODE!', buffY, '#ff00aa', 13);
      buffY += 18;
    }
    if (escort && escort.state === 'active') {
      // 2 sizes larger than the other buff lines
      drawBuffLine(`🤝 ESCORT ${Math.max(0, Math.ceil((escort.expiresAt - now) / 1000))}s`, buffY, '#33ff66', 19);
    }

    ctx.textBaseline = 'alphabetic';

    if (spaceRunMode === 'bossrun') {
      const total = bossRunQueue.length || 8;
      const defeated = Math.min(Math.max(0, bossRunIndex || 0), total);
      ctx.textAlign = 'left';
      ctx.font = `bold 13px 'Bebas Neue', cursive`;
      ctx.fillStyle = '#ffe61a';
      ctx.fillText(`BOSSES ${defeated}/${total}`, 10, barY + barH + 16);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(10, barY + barH + 23, 92, 4);
      ctx.fillStyle = '#ffe61a';
      ctx.fillRect(10, barY + barH + 23, 92 * (defeated / total), 4);
      if (boss && boss.creature && boss.creature.name) {
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const label = boss.creature.name.toUpperCase();
        ctx.font = `bold ${Math.max(24, Math.min(34, W * 0.072))}px 'Bebas Neue', cursive`;
        ctx.fillStyle = boss.creature.isGizmo ? '#ffe61a' : '#ff4444';
        ctx.shadowColor = boss.creature.isGizmo ? 'rgba(255,230,26,0.58)' : 'rgba(255,68,68,0.62)';
        ctx.shadowBlur = 16;
        ctx.fillText(label, W / 2, barY + barH + 14);
        ctx.shadowBlur = 0;
        ctx.font = `bold 10px 'VCR', monospace`;
        ctx.letterSpacing = '2px';
        ctx.fillStyle = 'rgba(242,239,232,0.68)';
        ctx.fillText(`BOSS ${Math.min(bossRunIndex + 1, total)}/${total}`, W / 2, barY + barH + 48);
        ctx.restore();
      }
      ctx.textBaseline = 'alphabetic';
    } else if (missionTrappedChars.length) {
      const total = missionTrappedChars.length;
      const rescued = Math.min(rescuedChars.size, total);
      const done = rescued >= total;
      ctx.textAlign = 'left';
      ctx.font = `bold 13px 'Bebas Neue', cursive`;
      ctx.fillStyle = done ? '#33ff66' : '#00e5ff';
      ctx.fillText(`RESCUED ${rescued}/${total}`, 10, barY + barH + 16);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(10, barY + barH + 23, 92, 4);
      ctx.fillStyle = done ? '#33ff66' : '#00e5ff';
      ctx.fillRect(10, barY + barH + 23, 92 * (rescued / total), 4);
      ctx.textBaseline = 'alphabetic';
    }
  }

  function drawRescueBanner() {
    if (!rescueBanner) return;
    const age = Date.now() - rescueBanner.startedAt;
    const hold = 1850;
    if (age > hold) { rescueBanner = null; return; }
    const inA = Math.min(1, age / 220);
    const outA = age > hold - 360 ? Math.max(0, (hold - age) / 360) : 1;
    const a = inA * outA;
    const gc = GAME_CHARS[rescueBanner.ci];
    const x = W / 2, y = H * 0.29;
    const scale = 0.88 + Math.min(1, age / 260) * 0.12;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = 'rgba(3,1,16,0.72)';
    ctx.strokeStyle = 'rgba(0,229,255,0.72)';
    ctx.lineWidth = 2;
    const bx = -132, by = -62, bw = 264, bh = 124, br = 12;
    ctx.beginPath();
    ctx.moveTo(bx + br, by);
    ctx.lineTo(bx + bw - br, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + br);
    ctx.lineTo(bx + bw, by + bh - br);
    ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - br, by + bh);
    ctx.lineTo(bx + br, by + bh);
    ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - br);
    ctx.lineTo(bx, by + br);
    ctx.quadraticCurveTo(bx, by, bx + br, by);
    ctx.fill(); ctx.stroke();

    const ringPulse = 1 + Math.sin(Date.now() * 0.01) * 0.05;
    ctx.save();
    ctx.translate(-76, 0);
    ctx.beginPath(); ctx.arc(0, 0, 36 * ringPulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,229,255,0.35)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 31 * ringPulse, 0.16 * Math.PI, 1.82 * Math.PI);
    ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 3; ctx.stroke();
    ctx.strokeStyle = '#eaffff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-34, -10); ctx.lineTo(-44, -22); ctx.lineTo(-35, -33); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(30, 12); ctx.lineTo(45, 20); ctx.lineTo(35, 33); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 23, 0, Math.PI * 2);
    ctx.fillStyle = gc.color; ctx.fill();
    const img = _getImg(gc.imgHappy || gc.img);
    if (img && img.complete && img.naturalWidth) ctx.drawImage(img, -21, -21, 42, 42);
    else {
      ctx.font = '29px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(gc.happy || gc.emoji, 0, 1);
    }
    ctx.restore();

    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = `bold 23px 'Bebas Neue', cursive`;
    ctx.fillStyle = '#00e5ff';
    ctx.fillText('MOBE RESCUED', -25, -18);
    ctx.font = `bold 18px 'Bebas Neue', cursive`;
    ctx.fillStyle = '#33ff66';
    ctx.fillText(`${rescueBanner.rescued}/${rescueBanner.total} MOBES RESCUED`, -25, 12);
    ctx.restore();
  }

  function drawCaptiveWaveBackdrop() {
    if (!(boss && boss.isCaptive)) return;
    const t = Date.now() * 0.001;
    ctx.save();
    const pulse = 0.12 + Math.sin(t * 3.2) * 0.035;
    const grad = ctx.createRadialGradient(boss.x, boss.y, 30, boss.x, boss.y, Math.max(W, H) * 0.72);
    grad.addColorStop(0, `rgba(0,229,255,${pulse})`);
    grad.addColorStop(0.38, 'rgba(0,120,255,0.055)');
    grad.addColorStop(1, 'rgba(0,229,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    ctx.strokeStyle = 'rgba(0,229,255,0.11)';
    ctx.lineWidth = 1;
    const gap = 38;
    const offset = (t * 18) % gap;
    for (let x = -gap + offset; x < W + gap; x += gap) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + H * 0.32, H); ctx.stroke();
    }
    for (let x = W + gap - offset; x > -gap; x -= gap) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - H * 0.32, H); ctx.stroke();
    }
    ctx.restore();
  }

  function drawCaptiveObjectiveHUD() {
    if (!(boss && boss.isCaptive)) return;
    const gc = GAME_CHARS[boss.captiveCi];
    const x = W / 2, y = 86;
    const pct = Math.max(0, boss.hp / boss.maxHp);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(3,1,16,0.76)';
    ctx.fillRect(x - 116, y - 23, 232, 46);
    ctx.strokeStyle = 'rgba(0,229,255,0.64)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - 116, y - 23, 232, 46);
    ctx.font = `bold 15px 'Bebas Neue', cursive`;
    ctx.fillStyle = '#00e5ff';
    ctx.fillText(`FREE ${gc.name}`, x, y - 7);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(x - 72, y + 7, 144, 6);
    ctx.fillStyle = '#00e5ff';
    ctx.fillRect(x - 72, y + 7, 144 * pct, 6);
    ctx.font = `bold 10px 'VCR', monospace`;
    ctx.fillStyle = 'rgba(234,255,255,0.72)';
    ctx.fillText('BREAK THE LOCK', x, y + 21);
    ctx.restore();
  }

  function loop(ts) {
    if (state === 'dying') {
      // Frozen frame: redraw background/stars/entities as-is (no movement, spawning,
      // or input) so the death explosion still animates against a properly-cleared
      // canvas instead of smearing on a static one.
      raf = requestAnimationFrame(loop);
      ctx.fillStyle = '#030110'; ctx.fillRect(0, 0, W, H);
      for (const s of stars) {
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${s.a})`; ctx.fill();
      }
      obstacles.forEach(drawObstacle);
      if (boss) drawBoss();
      if (escort) drawEscort();
      drawPlayer();
      drawHUD();
      return;
    }
    if (state!=='playing') return;
    raf=requestAnimationFrame(loop);

    ctx.save();
    if (shakeMag > 0.4) {
      ctx.translate((Math.random()-0.5)*shakeMag, (Math.random()-0.5)*shakeMag);
      shakeMag *= 0.85;
    } else {
      shakeMag = 0;
    }

    ctx.fillStyle='#030110'; ctx.fillRect(0,0,W,H);

    const _rave = waveTheme === 'rave';
    const RAVE_STAR_COLORS = ['255,0,255', '0,255,255', '57,255,20', '255,0,170', '255,255,0'];
    for(const s of stars){
      s.y+=s.speed;
      if(s.y>H) { s.y=-2; s.x=rand(0,W); }
      ctx.beginPath(); ctx.arc(s.x,s.y,s.r,0,Math.PI*2);
      // Stars are the one thing neon mode missed before — index into a small neon
      // set instead of plain white, every star, the whole wave.
      ctx.fillStyle = _rave ? `rgba(${RAVE_STAR_COLORS[Math.floor(s.x + s.y) % RAVE_STAR_COLORS.length]},${s.a})` : `rgba(255,255,255,${s.a})`;
      ctx.fill();
    }
    if (_rave) {
      drawDiscoBall();
      // Periodic confetti bursts — reuses the same celebratory effect used for
      // mini-boss kills/triple-buff elsewhere, just on a timer instead of an event.
      if (Date.now() - lastRaveConfetti > 2800) { ticketConfetti(true); lastRaveConfetti = Date.now(); }
    }
    drawCaptiveWaveBackdrop();

    // Mystery "snowing" outcome — ambient, not overly dense, purely atmospheric on
    // its own. takeDamage() is what actually punishes getting hit while this is up.
    if (Date.now() < snowingUntil) {
      while (snowParticles.length < 22) snowParticles.push({ x: rand(0, W), y: rand(-20, H), speed: 0.6 + Math.random() * 0.9, r: 6 + Math.random() * 4, drift: Math.random() * Math.PI * 2, rot: Math.random() * Math.PI });
      for (const sp of snowParticles) {
        sp.y += sp.speed;
        sp.x += Math.sin(sp.drift + sp.y * 0.02) * 0.4;
        sp.rot += 0.015;
        if (sp.y > H) { sp.y = -10; sp.x = rand(0, W); }
        drawIceShard(sp.x, sp.y, sp.r * 1.55, sp.rot, null);
      }
    } else if (snowParticles.length) {
      snowParticles = [];
    }

    const _now = Date.now();
    const _frozen = _now < buffFrozenUntil, _zapped = _now < buffZappedUntil, _blasterJammed = _now < blasterDisabledUntil;
    const _pizza = _now < buffPizzaUntil;
    const curFireMs = _now < buffGunUntil ? AUTO_FIRE_MS * 0.4 : AUTO_FIRE_MS;
    if (!waveTransitioning && !_blasterJammed && _pizza) {
      // Its own much slower, separate cadence — a deliberate pump-shotgun rhythm,
      // not rapid fire — plus slower bullets so each blast reads as heavy rather
      // than just "more bullets at the normal speed."
      const PIZZA_FIRE_MS = 950;
      if (ts - lastPizzaFire > PIZZA_FIRE_MS) {
        for (const a of [-0.36, -0.18, 0, 0.18, 0.36]) {
          bullets.push({x:player.x,y:player.y-player.r*1.2,vy:-B_SPEED*0.5*Math.cos(a),vx:-B_SPEED*0.5*Math.sin(a),isPizza:true});
        }
        SFX.bomberDive();
        lastPizzaFire = ts;
      }
    } else if(!waveTransitioning && !_blasterJammed && ts-lastAutoFire>curFireMs){
      bullets.push({x:player.x,y:player.y-player.r*1.2,vy:-B_SPEED});
      if (_zapped) SFX.fart(); else playNormalInstrumentSfx('blaster');
      lastAutoFire=ts;
    }

    let curSpeed = _now < buffSpeedUntil ? P_SPEED * 1.6 : P_SPEED;
    if (_frozen) curSpeed *= 0.5; // FROZEN — the only real penalty; the snowflake bullet skin is just its visible tell
    const reversed = _now < controlsReversedUntil;
    const goLeft = reversed ? rightHeld : leftHeld, goRight = reversed ? leftHeld : rightHeld;
    if(goLeft)  player.x=Math.max(player.r,     player.x-curSpeed);
    if(goRight) player.x=Math.min(W-player.r,   player.x+curSpeed);

    // Hero escort: appears at the player's side, follows and auto-fires while active,
    // then flies off with a "thanks" instead of just vanishing once its time is up.
    // The departure is deliberately slow — it was easy to miss before. (Used to fly in
    // from the rescue spot first, but with everything else already converging on the
    // player, that extra moving piece just added to the clutter — appearing instantly
    // reads cleaner.)
    if (escort) {
      if (escort.state === 'active') {
        escort.x = player.x - 40;
        escort.y = player.y + 4;
        if (Date.now() > escort.expiresAt) {
          escort.state = 'leaving';
          addFloatText('THANKS!', escort.x, escort.y - 20, '#33ff66', 16);
        } else if (!waveTransitioning && !_blasterJammed && ts - escort.lastFire > AUTO_FIRE_MS * 1.6) {
          bullets.push({x:escort.x, y:escort.y-14, vy:-B_SPEED});
          escort.lastFire = ts;
        }
      } else {
        escort.y -= 1.6;
        escort.opacity -= 0.007;
        if (escort.opacity <= 0 || escort.y < -60) escort = null;
      }
    }

    // Mystery-box "twin ship" — mirrors the player at a fixed offset and auto-fires
    // alongside them for its duration, same auto-fire rate as the real ship.
    if (twin) {
      twin.x = player.x + 40; twin.y = player.y;
      if (Date.now() > twin.expiresAt) { twin = null; }
      else if (!waveTransitioning && !_blasterJammed && ts - twin.lastFire > AUTO_FIRE_MS) {
        bullets.push({x:twin.x, y:twin.y-player.r*1.2, vy:-B_SPEED});
        twin.lastFire = ts;
      }
    }

    // Mystery box "rebound" hazard — bounces off the side walls/top AND off any
    // enemy or asteroid it touches (true reflection off the obstacle's surface,
    // not just a wall-style axis flip), so its path stays unpredictable rather
    // than passing straight through the rest of the wave. Hits the player once
    // for real damage (shield still blocks it) then clears, or expires on its own.
    if (rebound) {
      rebound.x += rebound.vx; rebound.y += rebound.vy;
      if (rebound.x < rebound.r || rebound.x > W - rebound.r) rebound.vx *= -1;
      if (rebound.y < rebound.r) rebound.vy *= -1;
      if (rebound.y > dangerY) rebound.vy *= -1; // stays in the playfield, doesn't sneak through as a free hit at the line
      for (const o of obstacles) {
        if (o.alive === false) continue;
        const odx = rebound.x - o.x, ody = rebound.y - o.y;
        const dist = Math.hypot(odx, ody);
        const minDist = rebound.r + o.r;
        if (dist > 0 && dist < minDist) {
          const nx = odx / dist, ny = ody / dist;
          const dot = rebound.vx * nx + rebound.vy * ny;
          rebound.vx -= 2 * dot * nx; rebound.vy -= 2 * dot * ny;
          rebound.x += nx * (minDist - dist); rebound.y += ny * (minDist - dist);
          miniExplosion(rebound.x, rebound.y, '#ff8855');
          break; // one bounce per frame is plenty
        }
      }
      if (Math.hypot(rebound.x - player.x, rebound.y - player.y) < rebound.r + player.r * 0.8) {
        takeDamage(15, 'REBOUND HIT');
        miniExplosion(rebound.x, rebound.y, '#ff4444');
        rebound = null;
      } else if (Date.now() > rebound.expiresAt) {
        rebound = null;
      } else if (Date.now() > rebound.nextFire) {
        // Fires along its own spin angle (same formula drawRebound uses to rotate
        // it visually) — rapid-fire that sweeps through every direction as it spins,
        // rather than aiming at the player.
        const spinAngle = Date.now() * 0.006;
        const fireSpeed = 4;
        enemyBullets.push({ x: rebound.x, y: rebound.y, vx: Math.cos(spinAngle) * fireSpeed, vy: Math.sin(spinAngle) * fireSpeed, r: 4, theme: 'rebound', damageCause: 'REBOUND SHOT' });
        rebound.nextFire = Date.now() + 130;
      }
    }

    // Boss: hovers near the top (never crosses the danger line), alternates a
    // telegraphed laser (dodge sideways during the charge-up) and a machine-gun burst,
    // and periodically deploys a minion of its own — the only enemies that show up
    // during the fight, since the regular wave queue is paused for its duration.
    if (boss) {
      boss.x += boss.vx;
      if (boss.attackType === 'tether' && boss.grayTeleport && !boss.grayTeleport.arrived) {
        const gtNow = Date.now();
        const g = boss.grayTeleport;
        boss.vx = 0;
        if (gtNow < g.departAt) {
          boss.x = g.fromX;
          boss.y = g.fromY;
        } else if (gtNow < g.reappearAt) {
          // Make Gray read as a ghost glide, not a tiny in-place glitch: during the
          // dissolve/travel beat his actual collision/body position eases across
          // the board along the same path the visual afterimage uses.
          const t = Math.max(0, Math.min(1, (gtNow - g.departAt) / Math.max(1, g.reappearAt - g.departAt)));
          const e = t * t * (3 - 2 * t);
          boss.x = g.fromX + (g.toX - g.fromX) * e;
          boss.y = g.fromY + (g.toY - g.fromY) * e + Math.sin(t * Math.PI) * -18;
        } else {
          boss.x = g.toX;
          boss.y = g.toY;
          boss.grayTeleport.arrived = true;
          boss.ghostUntil = gtNow + 480;
          boss.invisibleUntil = 0;
          boss.phaseAlphaUntil = gtNow + 520;
          boss.vx = boss.grayState ? 0 : (Math.random() < 0.5 ? -1 : 1) * 0.38;
          if (!boss.grayState) {
            miniExplosion(boss.x, boss.y, '#65f0ff');
            addFloatText('REAPPEAR!', boss.x, boss.y + boss.r + 18, '#65f0ff', 14);
          }
        }
      }
      if (boss.attackType === 'fire' && Date.now() < (boss.dragonBreathUntil || 0)) {
        // During a breath chain the Dragon sweeps harder so the moving mouth
        // paints the lane edges/corners instead of leaving a safe wall pocket.
        const dir = boss.vx >= 0 ? 1 : -1;
        const minSweep = 2.35 + campaignTier(wave) * 0.14;
        if (Math.abs(boss.vx) < minSweep) boss.vx = dir * minSweep;
      }
      if (boss.attackType === 'ink') {
        const now = Date.now();
        if (now < (boss.octoRecoverUntil || 0)) {
          const homeY = boss.octoHomeY || 185;
          const targetY = boss.octoTargetY || Math.min(H * 0.42, homeY + 112);
          if (now < (boss.octoDescendUntil || 0)) {
            const t = 1 - Math.max(0, (boss.octoDescendUntil - now) / 760);
            boss.y = homeY + (targetY - homeY) * (t * t * (3 - 2 * t));
            boss.vx *= 0.94;
          } else if (now < (boss.octoSpinUntil || 0)) {
            boss.y = targetY + Math.sin(now * 0.012) * 5;
            boss.vx *= 0.90;
          } else {
            const t = 1 - Math.max(0, (boss.octoRecoverUntil - now) / 720);
            boss.y = targetY + (homeY - targetY) * (t * t * (3 - 2 * t));
          }
        }
      }
      if (boss.x < boss.r + 20 || boss.x > W - boss.r - 20) boss.vx *= -1;
      boss.hitFlash = Math.max(0, boss.hitFlash - 0.05);

      // A jail cell shouldn't be dispatching reinforcements — captive fights are just
      // rescue + dodge attacks, no minions.
      if (!boss.isCaptive && bossAllowsClutter(boss, false) && boss.attackType !== 'donkey' && Date.now() > bossDeployTimer) {
        // Spawns from right behind the boss, not a random spot at the top — reads as
        // the boss actually deploying it rather than an unrelated arrival.
        const side = Math.random() < 0.5 ? -1 : 1;
        obstacles.push({ type:'face', x: Math.max(FACE_R, Math.min(W-FACE_R, boss.x + side*boss.r*0.7)), y: boss.y + boss.r*0.5, vx:rand(-0.6,0.6)*currentCfg.speed, vy:currentCfg.speed*0.55, r:FACE_R, ci: nextMissionEnemyIndex(), hp:3, isTrapped:false, ringHp:0, pausedBurstDone:false, paused:false, pauseUntil:0, burstShotsLeft:0, lastBurstShot:0 });
        bossDeployTimer = Date.now() + 4000 + Math.random()*1500;
      }

      updateOgreDonkeyLine();
      updateBossSupportDrops();
      if (boss.attackType === 'tether') updateGrayVisitorBoss(boss, Date.now());

      if (Date.now() > boss.nextAttack && boss.attackType !== 'tether' && !boss.laserPhase && !(boss.attackType === 'donkey' && boss.ogreLine)) {
        const bt = campaignTier(wave);
        if (boss.isCaptive) {
          const count = Math.min(7, 4 + Math.floor(bt / 2));
          const speed = 2.55 + bt * 0.28 + Math.max(0, wave - 18) * 0.08;
          for (let k = 0; k < count; k++) {
            const spread = count === 1 ? 0 : (k - (count - 1) / 2) / ((count - 1) / 2);
            const vx = spread * speed * 0.55;
            const vy = speed * (0.92 + Math.abs(spread) * 0.12);
            enemyBullets.push({ x: boss.x + spread * boss.r * 0.55, y: boss.y + boss.r * 0.72, vx, vy, r: 6.6, isLock: true });
          }
          addFloatText('LOCK PULSE!', boss.x, boss.y + boss.r + 18, '#00e5ff', 16);
          playRaveDiscoStab();
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'donkey') {
          beginOgreDonkeyWave();
          boss.nextAttack = Date.now() + 999999;
        } else if (boss.attackType === 'fire') {
          // Phase 3C.7 Dragon: restore the clean breath-chain mechanic.
          // Fireballs release one-by-one from the moving/swaying head, not as a
          // dumped spread. The head sway is wide enough to reach wall lanes.
          const now = Date.now();
          const breathCount = bt >= 2 ? 21 : 18;
          const interval = bt >= 2 ? 82 : 92;
          const baseSpeed = bossProjectileSpeed(boss, 4.16 + bt * 0.12 + Math.max(0, wave - 18) * 0.05);
          const seed = Math.random() * Math.PI * 2;
          boss.dragonBreathUntil = now + breathCount * interval + 420;
          boss.dragonBreathSeed = seed;
          const targetX = player ? player.x : W / 2;
          const cornerBias = targetX < W * 0.24 ? -1 : targetX > W * 0.76 ? 1 : 0;
          for (let k = 0; k < breathCount; k++) {
            enemyBullets.push({
              x: boss.x,
              y: boss.y + boss.r * 0.62,
              vx: 0,
              vy: baseSpeed,
              r: 8.6 + Math.min(1.2, bt * 0.35),
              theme: 'fire',
              damage: bossDamage(boss, 17),
              glowColor: '#ff2d00', glowAlt: '#ffd21a',
              dragonBreath: true,
              dragonSeq: k,
              dragonSeed: seed,
              cornerBias,
              releaseSpeed: baseSpeed,
              delayUntil: now + k * interval,
              waveAmp: 0.42 + bt * 0.05,
              waveFreq: 0.014,
              hideBeforeRelease: true,
              born: now
            });
          }
          addFloatText('DRAGON BREATH!', boss.x, boss.y + boss.r + 18, '#ff6600', 16);
          spaceSfx('boss.dragon.projectile');
          boss.nextAttack = now + Math.max(2950, Math.round((breathCount * interval + 1320) * bossTuneValue(boss, 'attackDelayMult', 1)));
        } else if (boss.attackType === 'sword') {
          // Phase 3B.2 Knight: seven lane swords line up like Ogre's donkey row.
          // They fire straight down, one after another, in a shuffled lane order.
          // This creates a cat-and-mouse lane dodge instead of a targeted shot.
          const now = Date.now();
          const laneCount = 7;
          const swordY = Math.min(H * 0.36, boss.y + boss.r * 1.58);
          const left = W * 0.14, right = W * 0.86;
          const lanes = Array.from({ length: laneCount }, (_, i) => left + (right - left) * (i / (laneCount - 1)));
          const order = shuffleList(lanes.map((_, i) => i));
          const telegraphMs = bossWindowMs(boss, 760);
          const stepMs = Math.max(205, Math.round(310 * bossTuneValue(boss, 'attackDelayMult', 1)));
          order.forEach((laneIndex, seq) => {
            const launchAt = now + telegraphMs + seq * stepMs;
            enemyBullets.push({
              x: lanes[laneIndex], y: swordY,
              vx: 0, vy: 0, r: 8.0,
              theme: 'sword',
              damage: bossDamage(boss, 35),
              visualScale: 5.0,
              telegraph: true,
              knightLaneSword: true,
              knightSeq: seq,
              telegraphStart: now,
              launchAt,
              expiresAt: launchAt + 2100,
              displayRotation: Math.PI,
              born: now,
            });
          });
          addFloatText('SWORD LANES!', boss.x, boss.y + boss.r + 18, '#c8d4ff', 16);
          spaceSfx('boss.knight.projectile');
          boss.nextAttack = now + Math.max(2450, (boss.attackDelay || 3900) + 150);
        } else if (boss.attackType === 'fish') {
          // Phase 3C.1 Shark: continuous tooth deployment, not a single wave.
          // Each attack tick adds a few teeth, then the reload is short so the
          // player reads a steady stream.
          const count = bt >= 2 ? 3 : 2;
          const lanes = 6;
          const speed = bossProjectileSpeed(boss, 3.75 + bt * 0.2 + Math.max(0, wave - 18) * 0.06);
          const left = W * 0.14, right = W * 0.86;
          const order = shuffleList(Array.from({ length: lanes }, (_, i) => i)).slice(0, count);
          order.forEach((laneIndex, seq) => {
            const x = left + (right - left) * (laneIndex / Math.max(1, lanes - 1));
            enemyBullets.push({
              x, y: boss.y + boss.r * 0.62 - seq * 20,
              vx: (seq % 2 ? -1 : 1) * speed * 0.36, vy: speed,
              r: 7.9, theme: 'fish', damage: bossDamage(boss, 22), displayRotation: 0, fixedRotation: true,
              zigZagTooth: true, nextZigAt: Date.now() + 300 + seq * 45, zigMs: 300,
              laneMin: Math.max(20, x - W * 0.12), laneMax: Math.min(W - 20, x + W * 0.12),
              born: Date.now()
            });
          });
          if (!boss._sharkWarnAt || Date.now() - boss._sharkWarnAt > 2400) {
            addFloatText('ZIG-ZAG TEETH!', boss.x, boss.y + boss.r + 18, '#5ab1ff', 16);
            boss._sharkWarnAt = Date.now();
          }
          spaceSfx('boss.shark.projectile');
          boss.nextAttack = Date.now() + Math.max(680, Math.round((boss.attackDelay || 1200) * bossTuneValue(boss, 'attackDelayMult', 1)));
        } else if (boss.attackType === 'sombrero') {
          const now = Date.now();
          const shieldMs = 1100;
          const openMs = 1150;
          boss.tacoGuardUntil = now + shieldMs;
          boss.tacoOpenUntil = now + shieldMs + openMs;
          boss.tacoGuardFlashUntil = now + shieldMs;
          [0.3, 0.5, 0.7].forEach((xp, i) => {
            const side = xp < 0.5 ? -1 : xp > 0.5 ? 1 : 0;
            enemyBullets.push({
              x: W * xp, y: boss.y + boss.r * (0.96 + (i % 2) * 0.12),
              vx: 0, vy: 0, r: 8.6, theme: 'sombrero', damage: 0,
              tacoGuard: true, tacoDropAt: now + shieldMs, tacoSide: side,
              telegraph: true, telegraphStart: now, launchAt: now + shieldMs,
              expiresAt: now + 4200, born: now, visualScale: 5.2,
            });
          });
          const count = bt >= 3 ? 5 : 4;
          const base = Math.atan2(player.y - boss.y, player.x - boss.x);
          const speed = bossProjectileSpeed(boss, 3.05 + bt * 0.18 + Math.max(0, wave - 18) * 0.06);
          for (let k = 0; k < count; k++) {
            const ang = base + (k - (count - 1) / 2) * 0.28;
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r * 0.55, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 7.7, theme: 'sombrero', damage: bossDamage(boss, 16), boomerang: 0.012, born: Date.now() });
          }
          addFloatText('SOMBRERO GUARD!', boss.x, boss.y + boss.r + 18, '#d99a2b', 16);
          setTimeout(() => {
            if (state === 'playing' && boss && boss.attackType === 'sombrero' && Date.now() < (boss.tacoOpenUntil || 0)) addFloatText('OPEN!', boss.x, boss.y - boss.r - 20, '#33ff66', 18);
          }, shieldMs);
          spaceSfx('boss.taco.projectile');
          boss.nextAttack = now + shieldMs + openMs + 350;
        } else if (boss.attackType === 'ink') {
          const now = Date.now();
          boss.octoHomeY = boss.octoHomeY || boss.y;
          boss.octoTargetY = Math.min(H * 0.43, Math.max(boss.y + 108, H * 0.32));
          boss.octoGuardUntil = now + 1180;
          boss.octoDescendUntil = now + 1860;
          boss.octoSpinUntil = now + 3850;
          boss.octoRecoverUntil = now + 4580;
          const count = Math.min(13, 8 + bt);
          const speed = bossProjectileSpeed(boss, 4.05 + bt * 0.24 + Math.max(0, wave - 18) * 0.08);
          for (let k = 0; k < count; k++) {
            const ang = Math.PI * 0.15 + (k / (count - 1)) * Math.PI * 0.7;
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r * 0.35, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 7.4, theme: 'ink', damage: bossDamage(boss, 5), splat: true, born: Date.now() });
          }
          const spinShots = 22 + bt * 2;
          const spinStart = now + 1280;
          for (let k = 0; k < spinShots; k++) {
            enemyBullets.push({
              x: boss.x, y: boss.y + boss.r * 0.35, vx: 0, vy: 0, r: 6.3,
              theme: 'purpleOrb', damage: bossDamage(boss, 9),
              octoSpinShot: true, spinStart, spinSeq: k,
              delayUntil: spinStart + k * 78, expiresAt: now + 5600,
              born: now,
            });
          }
          addFloatText('INK GUARD!', boss.x, boss.y + boss.r + 18, '#7040b8', 16);
          spaceSfx('boss.octo.projectile');
          boss.nextAttack = now + 5000;
        } else if (boss.attackType === 'gizmo') {
          // Gizmo lobs tennis balls that ricochet off the side walls and rain back
          // down on you — each ball is a single 20 HP hit (consumed on contact). He
          // barks on every deploy. Wave 10+ adds a ball and a touch more speed.
          const ballCount = (boss.isFinalGizmo || wave >= 10) ? 3 : 2;
          const ballSpeed = bossProjectileSpeed(boss, (wave >= 10 ? 3.9 : 3.4) + Math.max(0, wave - 18) * 0.06); // medium-fast
          for (let k = 0; k < ballCount; k++) {
            // Aim each ball toward a side wall (alternating) on a downward angle, so
            // it bounces off the wall and comes back down into the play field.
            const toRight = (k % 2 === 0);
            const vx = (toRight ? 1 : -1) * ballSpeed * (0.8 + Math.random() * 0.15);
            const vy = ballSpeed * (0.62 + Math.random() * 0.12);
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r * 0.5, vx, vy, r: 9, theme: 'tennis', damage: bossDamage(boss, 20), tennis: true, bounce: true, visualScale: 3.2, born: Date.now() });
          }
          addFloatText('TENNIS SMASH!', boss.x, boss.y + boss.r + 18, '#c6ff3a', 16);
          spaceSfx('boss.gizmo.projectile');
          if (boss.isFinalGizmo) {
            // FINAL GIZMO: the tennis barrage AND the classic bone shotgun together.
            const boneCount = 6;
            const boneSpeed = bossProjectileSpeed(boss, 2.9 + bt * 0.24 + Math.max(0, wave - 18) * 0.08);
            for (let k = 0; k < boneCount; k++) {
              const spread = (k - (boneCount - 1) / 2) / ((boneCount - 1) / 2);
              enemyBullets.push({ x: boss.x + spread * boss.r * 0.58, y: boss.y + boss.r * 0.5, vx: spread * boneSpeed * 0.45, vy: boneSpeed, r: 7.8, isLock: true, damage: bossDamage(boss, 14), visualScale: 4.1, homing: 0.012, maxSpeed: boneSpeed + 0.55, born: Date.now() });
            }
          }
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'laser') {
          boss.laserPhase = 'charging';
          boss.laserChargeStart = Date.now();
          boss.laserX = boss.x;
        } else {
          const count = boss.burstCount || 4;
          for (let k = 0; k < count; k++) {
            const dx = player.x - boss.x, dy = player.y - boss.y;
            const ang = Math.atan2(dy, dx) + (k - (count - 1) / 2) * 0.12;
            const bulletSpeed = 4 + wave * 0.15;
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r*0.6, vx: Math.cos(ang)*bulletSpeed, vy: Math.sin(ang)*bulletSpeed, r: 6, damageCause: 'BOSS BULLET' });
          }
          SFX.tone && SFX.tone(300,'square',0,0.04,0.08,200);
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        }
      }
      if (boss.laserPhase === 'charging' && Date.now() - boss.laserChargeStart > 700) {
        boss.laserPhase = 'firing';
        boss.laserFireStart = Date.now();
        boss.laserHasHit = false;
      } else if (boss.laserPhase === 'firing') {
        if (!boss.laserHasHit && Math.abs(player.x - boss.laserX) < player.r + 14) {
          takeDamage(bossDamage(boss, 20), 'BOSS LASER');
          boss.laserHasHit = true;
        }
        if (Date.now() - boss.laserFireStart > 220) {
          boss.laserPhase = null;
          boss.nextAttack = Date.now() + (boss.attackDelay || 2400);
        }
      }
    }

    // Mini-boss: a wave feature, not a takeover (normal spawning is suppressed via
    // asteroidRatio for that wave, not the boss-pause mechanism). GHOST teleports on
    // a cycle and fires ice-flagged shots; EMP holds still and fires zap-flagged shots.
    if (miniBoss) {
      const mb = miniBoss;
      mb.hitFlash = Math.max(0, mb.hitFlash - 0.05);
      if (mb.kind === 'ghost') {
        // Bounces around the upper field continuously while active — "bouncing all
        // over," not just sitting still between teleports.
        if (mb.phase === 'active') {
          mb.x += mb.vx; mb.y += mb.vy;
          if (mb.x < mb.r + 20 || mb.x > W - mb.r - 20) mb.vx *= -1;
          if (mb.y < 80 || mb.y > H * 0.45) mb.vy *= -1;
        }
        if (mb.phase === 'active' && Date.now() > mb.teleportAt) {
          mb.phase = 'vanishing'; mb.phaseStart = Date.now();
          miniExplosion(mb.x, mb.y, '#8855ff');
          SFX.ghostTeleport();
        } else if (mb.phase === 'vanishing') {
          mb.opacity = Math.max(0, 1 - (Date.now() - mb.phaseStart) / 300);
          if (Date.now() - mb.phaseStart > 300) {
            mb.x = rand(mb.r + 20, W - mb.r - 20); mb.y = rand(100, H * 0.4);
            mb.phase = 'appearing'; mb.phaseStart = Date.now();
          }
        } else if (mb.phase === 'appearing') {
          // Flickering, untouchable telegraph — reappearing should never feel like a
          // cheap ambush.
          const t = Date.now() - mb.phaseStart;
          mb.opacity = 0.4 + 0.3 * Math.abs(Math.sin(t * 0.02));
          if (t > 400) { mb.phase = 'active'; mb.opacity = 1; mb.teleportAt = Date.now() + 3000 + Math.random() * 1500; mb.nextAttack = Date.now() + 1400; }
        }
      }
      if (mb.phase === 'active' && Date.now() > mb.nextAttack) {
        const dx = player.x - mb.x, dy = player.y - mb.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const bulletSpeed = 3.2 + wave * 0.3;
        enemyBullets.push({ x: mb.x, y: mb.y + mb.r, vx: (dx/dist)*bulletSpeed, vy: (dy/dist)*bulletSpeed, r: 5, isIce: mb.kind === 'ghost', isZap: mb.kind === 'emp', damageCause: mb.kind === 'ghost' ? 'ICE SHOT' : 'EMP SHOT' });
        mb.nextAttack = Date.now() + 1400;
      }
    }

    bullets=bullets.filter(b=>b.y>-10);
    bullets.forEach(b=>{
      if (_frozen) {
        // Was moving at full normal speed despite the icy snowflake skin implying
        // otherwise — slowed to actually feel cold/sluggish, not just look different.
        b.y += b.vy * 0.4;
        if (b.vx) b.x += b.vx * 0.4;
      } else if (_zapped) {
        // Even floatier and gassier — drifts up slowly with a wide, loose wobble
        // instead of a clean straight shot, on top of dealing 0 damage.
        b.y += b.vy * 0.28;
        b._wob = (b._wob || Math.random()*10) + 0.09;
        b.x += Math.sin(b._wob) * 2.2;
      } else {
        b.y += b.vy;
        if (b.vx) b.x += b.vx;
      }
    });

    // Power-ups: drift down, draw, collect by touch only — bullets pass straight
    // through them. SHOOT is for hostiles, CATCH is for pickups; letting bullets
    // also collect them blurred that distinction. Mystery is the one deliberate
    // exception now — it's a shoot target (ring takes 7 hits to break, then the
    // outcome applies automatically), not something you fly into to catch.
    powerups = powerups.filter(p => p.y < H + 40);
    for (const p of powerups) {
      if (!waveTransitioning) p.y += p.vy;
      // Mystery boxes now fall straight like other pickups; the pulsing ring/crate art is the tell.
      if (!waveTransitioning && p.rotSpeed) p.rot += p.rotSpeed;
      drawPowerup(p);
      if (waveTransitioning) continue;
      if (p.type === 'mystery' && p.ringHp > 0) {
        if (academyMode && p.academyMystery && p.y < (p.academyArmY || academyTargetArmY())) continue;
        for (const b of bullets) {
          if (b.vy === 999) continue; // already spent on something else this frame
          if (Math.hypot(b.x - p.x, b.y - p.y) < p.r * 1.1) {
            b.vy = 999;
            p.litUntil = Date.now() + 320;
            p.ringHp--;
            if (p.ringHp <= 0) {
              miniExplosion(p.x, p.y, '#cc66ff');
              applyPowerup('mystery');
              p._collected = true;
            } else {
              SFX.score();
            }
            break;
          }
        }
        if (p._collected) continue;
      }
      if (p.type === 'instrument') {
        // One hit and it's gone — pure fun, no ring/HP, just a note + points.
        for (const b of bullets) {
          if (b.vy === 999) continue;
          if (Math.hypot(b.x - p.x, b.y - p.y) < p.r * 1.1) {
            b.vy = 999;
            p.litUntil = Date.now() + 320;
            score += 20;
            addFloatText('♪ +20', p.x, p.y - 10, '#ffe61a', 18);
            miniExplosion(p.x, p.y, p.kind === 'guitar' ? '#c47a32' : p.kind === 'piano' ? '#f5f3ec' : '#e6ad2e');
            if (p.kind === 'guitar') SFX.guitarNote();
            else if (p.kind === 'piano') playMainPianoChord();
            else playObviousSaxSound();
            p._collected = true;
            break;
          }
        }
        if (p._collected) continue;
      }
      let gotIt = p.type !== 'mystery' && p.type !== 'instrument' && Math.hypot(p.x - player.x, p.y - player.y) < p.r + player.r * 0.9;
      // An active escort can also catch pickups itself, not just the player ship —
      // it's right there next to you, no reason it should be unable to grab one.
      if (!gotIt && p.type !== 'mystery' && p.type !== 'instrument' && escort && escort.state === 'active') {
        gotIt = Math.hypot(p.x - escort.x, p.y - escort.y) < p.r + 16 * 0.9;
      }
      if (gotIt) {
        if (SOCKET_TYPES.includes(p.type)) {
          // Banked, not applied — deployed later by tapping its socket. HP and
          // mystery boxes aren't bankable and keep applying instantly below.
          if (inventory[p.type]) {
            handleDuplicatePowerup(p.type, p);
          } else {
            inventory[p.type] = true;
            showTopBanner(p.type.toUpperCase() + ' ADDED', 'good');
            playNormalInstrumentSfx(p.type === 'hp' ? 'hp' : 'powerup');
          }
        } else {
          applyPowerup(p.type, p.type === 'hp' ? p.hpValue : undefined);
        }
        miniExplosion(p.x, p.y, p.type === 'hp' ? '#33ff66' : p.type === 'mystery' ? '#cc66ff' : '#ffe61a');
        p._collected = true;
      }
    }
    powerups = powerups.filter(p => !p._collected);

    obstacles=obstacles.filter(o=>o.y<H+60&&o.x>-60&&o.x<W+60);
    for(const o of obstacles){
      if (o.isDeflected) {
        const elapsed = Date.now() - (o.deflectStart || Date.now());
        const t = Math.min(1, elapsed / (o.deflectDuration || 620));
        o.x += o.vx;
        o.y += o.vy;
        o.vx *= 0.985;
        o.vy *= 0.955;
        o.deflectScale = 1 - t * 0.92;
        if (o.type === 'asteroid') o.rot += (o.deflectSpin || 0.24);
        if (t >= 1) o.alive = false;
        continue;
      }
      // MIRROR ENEMY: hovers at a fixed height and tracks the player's x every frame
      // instead of falling — skips the normal vx/vy movement entirely.
      if (o.isMirror) {
        const targetX = Math.max(o.r, Math.min(W - o.r, player.x + (o.mirrorOffset || 0)));
        o.x += (targetX - o.x) * (o.mirrorEase || 0.12);
        continue;
      }
      o.x+=o.vx;
      if(o.x<o.r&&o.vx<0) o.vx*=-1;
      if(o.x>W-o.r&&o.vx>0) o.vx*=-1;
      const nowMove = Date.now();
      if (updateHoldDriftEnemy(o, nowMove)) continue;
      if (o.blackoutHiddenEnemy && nowMove < (o.blackoutHoldUntil || 0)) continue;

      // Non-hero enemies pause once, partway down, for a quick burst of fire before
      // resuming their descent — see the note in spawnObstacle() for why.
      if (o.type === 'face' && !o.isTrapped && !o.pausedBurstDone) {
        if (!o.paused && o.y > H * 0.4) {
          o.paused = true; o.pauseUntil = Date.now() + 1000; o.burstShotsLeft = 3; o.lastBurstShot = 0;
        }
        if (o.paused) {
          if (Date.now() > o.pauseUntil) {
            o.paused = false; o.pausedBurstDone = true;
          } else {
            if (o.burstShotsLeft > 0 && Date.now() - o.lastBurstShot > 320) {
              enemyFireAt(o, 1.15, 'ENEMY BURST');
              o.burstShotsLeft--; o.lastBurstShot = Date.now();
            }
            continue; // hold position while paused
          }
        }
      }

      o.y+=o.vy;
      if(o.type==='asteroid') o.rot+=o.rotSpeed;
    }
    // Danger line crossing — REVERSE flips both which line and which direction
    // counts as "crossed", since obstacles travel upward toward REVERSE_LINE_Y
    // instead of downward toward dangerY.
    const _lineY = waveTheme === 'flip' ? REVERSE_LINE_Y : dangerY;
    for(const o of obstacles){
      if (o.isDeflected) continue;
      const _crossedLine = waveTheme === 'flip' ? o.y < _lineY : o.y > _lineY;
      if(!o._crossed && _crossedLine){
        o._crossed = true;
        o.alive = false;
        lineFlashA = 1.0;
        if(o.type==='asteroid'){
          const rockDamage = o.r < 22 ? 5 : 10;
          takeDamage(rockDamage, waveTheme === 'flip' ? 'REVERSE ASTEROID ESCAPE' : 'ASTEROID REACHED LINE');
          bigExplosion(o.x, _lineY, '#aa8855');
          playPlayerDamageThud(); // musical thud sound
          waveKills++;
        } else if(!o.isTrapped){
          // enemy crosses line — big damage
          takeDamage(30, 'ENEMY REACHED LINE');
          bigExplosion(o.x, _lineY, GAME_CHARS[o.ci].color);
          if (!o.blackoutHiddenEnemy) faceFlash(o.ci, 'sad', o.x, _lineY - 30);
          playPlayerDamageThud();
          waveKills++;
        } else {
          // trapped hero crosses line — not gone forever, queued back into the rescue pool
          queueMissionCaptiveRetry(o.ci);
          addFloatText('TRY AGAIN!', o.x, o.y, '#00e5ff', 24);
          faceFlash(o.ci, 'sad', o.x, o.y - 20);
          playPlayerDamageThud();
          waveKills++;
        }
        if(state==='over') return;
      }
    }
    obstacles=obstacles.filter(o=>!o._crossed);

    obstacles.forEach(o => { if (!o.blackoutHiddenEnemy) drawObstacle(o); });

    // Draw all bullets in one batch (no per-bullet ctx.save/restore or shadowBlur).
    // FROZEN/ZAPPED are purely cosmetic reskins of the SAME bullets, except zapped
    // bullets also genuinely deal 0 damage (gated below) — the fart skin is the
    // visible reason why, same idea as the snowflake being the tell for the slow.
    // (_frozen/_zapped computed once near the top of loop() and reused throughout.)
    ctx.fillStyle=C('#ffe61a');
    for(const b of bullets){
      if (_frozen) {
        drawIceShard(b.x, b.y, 28, (b._wob || 0) * 0.5, 'rgba(102,221,255,0.72)');
      } else if (_zapped) {
        if (drawProjectileImage('zap', b.x, b.y, 34, b._wob || 0, 'rgba(204,153,255,0.72)')) continue;
        // Hand-drawn puff cluster instead of the emoji glyph — soft translucent
        // greenish-brown blobs, comedic rather than a clean projectile. Bigger and
        // more spread out than a normal bullet — it should read as a cloud, not a shot.
        ctx.save();
        ctx.translate(b.x, b.y);
        const wob = b._wob || 0;
        ctx.fillStyle = 'rgba(150,200,90,0.45)';
        ctx.beginPath(); ctx.arc(0, 0, 17, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(180,160,90,0.38)';
        ctx.beginPath(); ctx.arc(Math.cos(wob)*14, Math.sin(wob)*10, 12, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-Math.cos(wob)*14, 10, 11, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(150,200,90,0.32)';
        ctx.beginPath(); ctx.arc(Math.sin(wob)*11, -13, 9, 0, Math.PI*2); ctx.fill();
        ctx.beginPath(); ctx.arc(-Math.sin(wob)*12, 4, 7.5, 0, Math.PI*2); ctx.fill();
        ctx.fillStyle = 'rgba(180,160,90,0.28)';
        ctx.beginPath(); ctx.arc(Math.cos(wob*0.7)*16, -4, 7, 0, Math.PI*2); ctx.fill();
        ctx.restore();
      } else if (b.isPizza) {
        if (drawProjectileImage('pizza', b.x, b.y, 27, Math.atan2(b.vy, b.vx) + Math.PI / 2, 'rgba(255,204,68,0.7)')) continue;
        // Hand-drawn pizza slice — wedge and pepperoni dots,
        // rotated to face the direction it's actually flying (the shotgun spread
        // fans out at angles, not just straight up).
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(Math.atan2(b.vy, b.vx) + Math.PI / 2);
        ctx.beginPath();
        ctx.moveTo(0, -10); ctx.lineTo(-7, 8); ctx.lineTo(7, 8); ctx.closePath();
        ctx.fillStyle = '#ffcc44'; ctx.fill();
        ctx.strokeStyle = '#e8a020'; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.fillStyle = '#cc3322';
        ctx.beginPath(); ctx.arc(-2.5, -1, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(2.5, 2, 1.6, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(0.5, -4.5, 1.4, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else {
        const rapidVisual = _now < buffGunUntil;
        const coreColor = rapidVisual ? '#7df6ff' : C('#ffe61a');
        const glowColor = rapidVisual ? 'rgba(125,246,255,0.34)' : 'rgba(255,230,26,0.34)';
        // Keep the familiar line silhouette, but render as a rounded capsule so
        // it reads smoother in motion than hard pixel-rect edges.
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = rapidVisual ? 8 : 7;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 14);
        ctx.lineTo(b.x, b.y + 4);
        ctx.stroke();
        ctx.strokeStyle = coreColor;
        ctx.lineWidth = rapidVisual ? 4.2 : 3.6;
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 12);
        ctx.lineTo(b.x, b.y + 2);
        ctx.stroke();
        ctx.fillStyle = C('#ffe61a');
      }
    }

    const activeTacoGuards = boss && boss.attackType === 'sombrero'
      ? enemyBullets.filter(g => g.tacoGuard && g.telegraph && !g._gone)
      : [];
    if (activeTacoGuards.length) {
      for (const b of bullets) {
        if (b.vy === 999 || b.tacoDeflected || b.octoDeflected) continue;
        for (const g of activeTacoGuards) {
          const blockR = (g.r || 8) * 5.4;
          if (Math.hypot(b.x - g.x, b.y - g.y) < blockR) {
            const side = g.tacoSide || (b.x < g.x ? -1 : 1);
            b.x += side * 6;
            b.vx = side * (4.7 + Math.random() * 1.3);
            b.vy = 4.4 + Math.random() * 1.1;
            b.tacoDeflected = true;
            b.portalCooldownUntil = Date.now() + 999;
            g.litUntil = Date.now() + 260;
            boss.tacoGuardFlashUntil = Date.now() + 260;
            miniExplosion(b.x, b.y, '#d99a2b');
            playShieldBellPing();
            break;
          }
        }
      }
    }

    // Bullet vs boss — skipped entirely while zapped, so "deals 0 damage" is literal.
    if (boss && !_zapped) {
      for (const b of bullets) {
        if (b.vy === 999 || b.tacoDeflected || b.octoDeflected) continue;
        const hitGrayTetherSource = boss.attackType === 'tether' && grayHandleTetherSourceHit(b, boss, Date.now());
        if (hitGrayTetherSource) continue;
        if (Math.hypot(b.x - boss.x, b.y - boss.y) < boss.r + 3) {
          if (boss.attackType === 'tether' && grayShieldBlocksBossHit(boss, Date.now())) {
            grayBounceShieldShot(b, boss, Date.now());
            continue;
          }
          if (boss.attackType === 'shield' && Date.now() < (boss.shieldUntil || 0)) {
            b.vy = 999;
            enemyBullets.push({ x: b.x, y: b.y, vx: (b.vx || 0) * 0.35, vy: 5.4 + wave * 0.08, r: 5.5, theme: 'shield', damageCause: 'SHIELD BURST' });
            addFloatText('DEFLECTED!', boss.x, boss.y - boss.r - 20, '#c8d4ff', 16);
            miniExplosion(b.x, b.y, '#c8d4ff');
            playShieldBellPing();
            continue;
          }
          if (boss.attackType === 'sombrero' && Date.now() < (boss.tacoGuardUntil || 0)) {
            const side = b.x < boss.x ? -1 : 1;
            b.x += side * 6;
            b.vx = side * 5.4;
            b.vy = 4.8;
            b.tacoDeflected = true;
            boss.tacoGuardFlashUntil = Date.now() + 260;
            addFloatText('GUARDED!', boss.x, boss.y - boss.r - 20, '#d99a2b', 16);
            miniExplosion(b.x, b.y, '#d99a2b');
            playShieldBellPing();
            continue;
          }
          if (boss.attackType === 'ink' && Date.now() < (boss.octoGuardUntil || 0)) {
            const side = b.x < boss.x ? -1 : 1;
            b.x += side * 5;
            b.vx = side * 4.8;
            b.vy = 4.3;
            b.octoDeflected = true;
            boss.octoGuardFlashUntil = Date.now() + 260;
            addFloatText('INK GUARD!', boss.x, boss.y - boss.r - 20, '#ff76d2', 16);
            miniExplosion(b.x, b.y, '#ff76d2');
            playRaveDiscoStab();
            continue;
          }
          b.vy = 999;
          boss.hp--; boss.hitFlash = 1;
          miniExplosion(b.x, b.y, boss.isCaptive ? '#00e5ff' : '#ff8888');
          if (boss.isCaptive && boss.hp > 0 && boss.hp % 10 === 0) addFloatText('LOCK CRACKING!', boss.x, boss.y - boss.r - 24, '#00e5ff', 16);
          if (boss.hp <= 0) {
            const defeatedBoss = boss;
            const hpGain = Math.round(health * 0.5);
            health = Math.min(100, health + hpGain);
            score += 500 + wave * 20;
            let rescuedCi = -1;
            if ((defeatedBoss.isCaptive || defeatedBoss.guardedRescue) && defeatedBoss.captiveCi >= 0) {
              rescuedCi = defeatedBoss.captiveCi;
              rescueMissionChar(defeatedBoss.captiveCi, defeatedBoss.x, defeatedBoss.y, ' ');
              rescueBanner = null;
            }
            triggerShake(14);
            bigExplosion(defeatedBoss.x, defeatedBoss.y, '#ff4444');
            if (!defeatedBoss.isCaptive) addFloatText(defeatedBoss.isGizmoEscape ? 'GIZMO RETREATS!' : defeatedBoss.isFinalGizmo ? 'GIZMO DOWN!' : 'BOSS DOWN! +500', defeatedBoss.x, defeatedBoss.y, '#ffe61a', 22);
            if (hpGain > 0) addFloatText(`+${hpGain} HP`, defeatedBoss.x, defeatedBoss.y - 30, '#33ff66', 16);
            playMusicBoxArpeggio();
            boss = null;
            bullets = [];
            enemyBullets = [];
            powerups = [];
            // Hold the victory cinematic until the board is actually clear — the
            // boss's minions/asteroids can still be falling, and it reads as confusing
            // to have enemies on screen behind the next scene (most visible on Gizmo).
            // The loop fires this once obstacles.length === 0 (see pendingBossWin).
            pendingBossWin = () => {
              if (spaceRunMode === 'bossrun') {
                showBossDefeatedBeat(defeatedBoss.creature.name, defeatedBoss.x, defeatedBoss.y, () => {
                  if (state === 'playing') advanceBossRun();
                });
              } else if (defeatedBoss.isGizmoEscape) {
                showGizmoEscapeBeat(rescuedCi, () => {
                  if (state !== 'playing') return;
                  if (rescuedCi >= 0) showBossRescueUnlockBeat(rescuedCi, defeatedBoss.creature.name, () => { if (state === 'playing') nextWave(); });
                  else nextWave();
                });
              } else if (defeatedBoss.isFinalGizmo) {
                freeAllRemainingMobes();
                showSpaceVictoryBriefing(() => { if (state === 'playing') completeSpaceCampaign(); });
              } else if (rescuedCi >= 0) {
                showBossDefeatedBeat(defeatedBoss.creature.name, defeatedBoss.x, defeatedBoss.y, () => {
                  if (state !== 'playing') return;
                  showBossRescueUnlockBeat(rescuedCi, defeatedBoss.creature.name, () => { if (state === 'playing') nextWave(); });
                });
              } else if (!defeatedBoss.isCaptive) {
                showBossDefeatedBeat(defeatedBoss.creature.name, defeatedBoss.x, defeatedBoss.y);
              }
            };
            break;
          } else {
            playBossImpactSound();
          }
        }
      }
    }

    // Bullet vs mini-boss
    if (miniBoss && !_zapped && miniBoss.phase === 'active') {
      for (const b of bullets) {
        if (b.vy === 999) continue;
        if (Math.hypot(b.x - miniBoss.x, b.y - miniBoss.y) < miniBoss.r + 3) {
          b.vy = 999;
          miniBoss.hp--; miniBoss.hitFlash = 1;
          miniExplosion(b.x, b.y, '#ff8888');
          playBossImpactSound();
          if (miniBoss.hp <= 0) {
            score += 150 + wave * 10;
            bigExplosion(miniBoss.x, miniBoss.y, '#ff4444');
            ticketConfetti(true);
            addFloatText('MINI-BOSS DOWN!', miniBoss.x, miniBoss.y, '#ffe61a', 20);
            SFX.miniBossDown();
            miniBoss = null;
            break;
          }
        }
      }
    }

    if (!_zapped) for(const b of bullets){
      for(const o of obstacles){
        if(o.alive===false) continue;
        if (academyMode && o.academyObstacle && o.y < (o.academyArmY || academyTargetArmY())) continue;
        const hitRadius = (o.type==='face' && o.isTrapped && o.ringHp > 0) ? o.r+12 : o.r+3;
        if(Math.hypot(b.x-o.x,b.y-o.y)<hitRadius){
          b.vy=999;
          o.litUntil = Date.now() + 320;
          queueBlackoutHitFlash(o);
          if(o.type==='face'){
            if(o.isTrapped && o.ringHp > 0){
              // Hit the rescue ring
              o.ringHp--;
              if(o.ringHp <= 0){
                // Ring destroyed — rescued! Becomes a temporary escort (cap 1 — rescuing
                // again just replaces/refreshes it with the newest hero, no stacking).
                score += 150; waveKills++;
                o.alive=false;
                playRescueFlourish();
                miniExplosion(o.x,o.y,'#00e5ff');
                if (academyMode && o.academyGoal === 'rescueLock') academyGoalComplete = true;
                rescueMissionChar(o.ci, o.x, o.y, '+150 RESCUED!');
                const hpGain = Math.min(30, 100 - health);
                if(hpGain > 0){ health = Math.min(100, health + 30); addFloatText(`+${hpGain} HP`, o.x, o.y - 30, '#33ff66', 18); }
              } else {
                addFloatText('RING HIT!', o.x, o.y, '#00e5ff', 18);
                SFX.score();
                b.vy=999; // bullet spent but obstacle survives
              }
            } else if(o.isTrapped && o.ringHp === 0){
              // Ring already destroyed but player shot the face — penalty!
              playPlayerDamageThud();
              o.alive=false;
              addFloatText('OOPS!', o.x, o.y, '#ff4444', 24);
              miniExplosion(o.x, o.y, '#ff4444');
              faceFlash(o.ci,'sad',o.x,o.y);
              takeDamage(30, 'CAPTIVE FACE HIT');
              if(state==='over') return;
            } else {
              // Normal enemy face — takes 3 hits to clear
              if (purpleRainActive(o, Date.now())) {
                b.vy = 999;
                addFloatText('RAIN SHIELD', o.x, o.y - 18, '#a233ff', 13);
                playShieldBellPing();
                break;
              }
              o.hp--;
              if (o.hp > 0) {
                playEnemyHitPairSfx(o.hp);
                miniExplosion(o.x, o.y, 'rgba(255,255,255,0.7)'); // hurt flicker, not destroyed yet
                addFloatText('HIT!', o.x, o.y - 14, '#ffffff', 14);
              } else {
                const pts = 25+(wave*5);
                score+=pts; playTargetBreakSfx('enemy');
                if (!o.blackoutHiddenEnemy) {
                  miniExplosion(o.x,o.y,GAME_CHARS[o.ci].color);
                  faceFlash(o.ci,'sad',o.x,o.y);
                  addFloatText('+'+pts, o.x, o.y, GAME_CHARS[o.ci].color, 18);
                } else {
                  queueBlackoutHitFlash(o, 520, true);
                  miniExplosion(o.x, o.y, 'rgba(255,90,90,0.55)');
                }
                waveKills++;
                if (academyMode && (o.academyGoal === 'normalEnemy' || o.academyGoal === 'swarmer')) academyGoalComplete = true;
                o.alive=false;
              }
            }
          } else {
            // Asteroid
            const pts = 10+(wave*2);
            score+=pts; playTargetBreakSfx('asteroid');
            miniExplosion(o.x,o.y,'#7a6a90');
            if(o.r > 22 && currentCfg){
              for(let s=0; s<2; s++){
                obstacles.push({
                  type:'asteroid', alive:true,
                  x: o.x + (s===0?-1:1)*o.r*0.5, y: o.y,
                  vx: (Math.random()-0.5)*currentCfg.speed*1.8,
                  vy: currentCfg.speed*(0.6+Math.random()*0.4),
                  r: o.r*0.52,
                  verts: Array.from({length:6},(_,i)=>{
                    const a=(i/6)*Math.PI*2; const rr=o.r*0.52*(0.7+Math.random()*0.3);
                    return [Math.cos(a)*rr, Math.sin(a)*rr];
                  }),
                  rot:0, rotSpeed:(Math.random()-0.5)*0.06, hp:1,
                  shadeSeed: Math.random() * 1000,
                  rockStyle: o.rockStyle == null ? Math.floor(Math.random() * 3) : o.rockStyle
                });
              }
            }
            waveKills++;
            o.alive=false;
          }
          break;
        }
      }
    }
    obstacles=obstacles.filter(o=>o.alive!==false);
    bullets=bullets.filter(b=>b.vy!==999);

    // REVERSE: obstacles spawn right next to the ship and immediately retreat
    // upward — they're not "attacking" by being close, so simple contact doesn't
    // hurt here. Shooting them (still works normally, bullets pass right through
    // this check) is the only way they actually do anything to the player.
    if (waveTheme !== 'flip') {
      for(const o of obstacles){
        if(Math.hypot(o.x-player.x,o.y-player.y)<o.r+player.r*0.7){
          if (Date.now() < buffShieldUntil && shieldDeflectObstacle(o)) {
            continue;
          }
          o.alive=false; playPlayerDamageThud();
          takeDamage(o.type==='face' ? 30 : (o.r < 22 ? 5 : 10), o.type==='face' ? 'ENEMY COLLISION' : 'ASTEROID COLLISION');
          if(state==='over') return;
        }
      }
      obstacles=obstacles.filter(o=>o.alive!==false);
    }

    // Wave ends naturally once the spawn pool is exhausted, the board has cleared,
    // AND every falling powerup has resolved (caught, broken, or fallen off-screen)
    // — no forced wipe, and nothing is still visibly falling once the wave-transition
    // announcement covers the screen.
    // Boss beaten: play the held victory cinematic only once every enemy and
    // asteroid is gone, so the next scene never appears over a populated board.
    if (pendingBossWin && obstacles.length === 0 && enemyBullets.length === 0 && !boss && !miniBoss && state === 'playing') {
      const runWin = pendingBossWin; pendingBossWin = null; runWin();
    }
    if (!academyMode && !academyCompleting && spaceRunMode !== 'bossrun' && spawnsRemaining <= 0 && obstacles.length === 0 && !boss && !miniBoss && !mirrorSequenceActive && !pendingBossWin && state === 'playing') {
      nextWave();
    }
    updateSpaceAcademy();

    // Enemy fire ramps by campaign tier, not raw wave flood. Later chapters ask for
    // better dodging and target priority, but keep a readable cadence on mobile.
    const fireTier = currentCfg ? currentCfg.tier : campaignTier(wave);
    const fireRateMult = currentCfg && currentCfg.enemyFireRateMult != null ? currentCfg.enemyFireRateMult : 1;
    const enemyFireInterval = Math.max(360, (1280 - fireTier * 125 - Math.min(wave, 12) * 28 - Math.max(0, wave - 18) * 35) * 0.85 * fireRateMult);
    if(!academyMode && Date.now() - lastEnemyFire > enemyFireInterval){
      const shooters = obstacles.filter(o => o.type==='face' && o.behavior !== 'swarmer' && !o.isTrapped && o.y > 0);
      if(shooters.length > 0){
        let chosen;
        if (waveTheme === 'blackout') {
          const hiddenShooters = shooters.filter(s => s.blackoutHiddenEnemy).sort((a, b) => a.x - b.x);
          const pool = hiddenShooters.length ? hiddenShooters : shooters.sort((a, b) => a.x - b.x);
          chosen = [pool[blackoutShooterIndex % pool.length]];
          blackoutShooterIndex++;
        } else {
          const numShots = Math.min(shooters.length, 1 + Math.floor(fireTier / 2) + Math.floor(Math.max(0, wave - 14) / 7));
          chosen = shooters.map(s => [Math.random(), s]).sort((a,b) => a[0]-b[0]).slice(0, numShots).map(p => p[1]);
        }
        chosen.forEach(shooter => waveTheme === 'blackout' && shooter.blackoutHiddenEnemy ? warnAndFireBlackoutEnemy(shooter) : enemyFireAt(shooter, 1, 'ENEMY SHOT'));
        lastEnemyFire = Date.now();
        SFX.tone && SFX.tone(420, 'square', 0, 0.03, 0.08, 280);
      }
    }
    enemyBullets.forEach(b => {
      const now = Date.now();
      if (!b.born) b.born = now;
      const age = now - b.born;
      if (b.delayUntil) {
        if (b.dragonBreath && boss) {
          const seq = b.dragonSeq || 0;
          const seed = b.dragonSeed || 0;
          // While waiting to release, each fireball stays attached to the
          // Dragon's mouth/head. The source moves smoothly over time, so the
          // released shots form a chain instead of a dumped spread.
          const t = now * 0.0065 + seed;
          const headSway = Math.sin(t) * W * 0.26 + Math.sin(t * 1.7 + seq * 0.05) * W * 0.09;
          const bias = (b.cornerBias || 0) * Math.min(W * 0.14, 18 + seq * 3.0);
          b.x = Math.max(8, Math.min(W - 8, boss.x + headSway + bias));
          b.y = boss.y + boss.r * 0.60;
        }
        if (b.octoSpinShot && boss && boss.attackType === 'ink') {
          b.x = boss.x;
          b.y = boss.y + boss.r * 0.42;
        }
        if (now < b.delayUntil) return;
        b.delayUntil = 0;
        b.born = now;
        if (b.dragonBreath) {
          const pull = player ? Math.max(-0.42, Math.min(0.42, (player.x - b.x) * 0.0016)) : 0;
          b.vx = (b.vx || 0) + pull;
          b.vy = b.releaseSpeed || b.vy || bossProjectileSpeed(boss, 4.1);
        } else if (b.octoSpinShot) {
          const spinT = now - (b.spinStart || now);
          const phase = ((spinT * 0.0019) + (b.spinSeq || 0) * 0.135) % 1;
          const angle = Math.PI * (0.12 + phase * 0.76);
          const speed = bossProjectileSpeed(boss, 3.35 + campaignTier(wave) * 0.12);
          b.vx = Math.cos(angle) * speed;
          b.vy = Math.sin(angle) * speed;
          b.theme = 'purpleOrb';
          b.maxSpeed = speed;
          SFX.tone && SFX.tone(300 + ((b.spinSeq || 0) % 5) * 34, 'triangle', 0, 0.025, 0.05, 80);
        }
      }
      if (b.bulletPortal && now >= (b.expiresAt || now + 1)) { b._gone = true; return; }
      if ((b.portalEnter || b.portalSeed) && now >= (b.expiresAt || now + 1)) { b._gone = true; return; }
      if (b.tacoGuard && now >= (b.expiresAt || now + 1)) { b._gone = true; return; }
      if (b.octoSpinShot && now >= (b.expiresAt || now + 1)) { b._gone = true; return; }
      if (b.theme === 'purpleRain' && now - (b.born || now) > 3600) { b._gone = true; return; }
      if (b.portalExit && b.telegraph && now >= b.launchAt) {
        if (b.chosenPortal) {
          b.telegraph = false;
          b.portalExit = false;
          b.theme = 'portalOrb';
          const aim = player ? Math.max(-0.95, Math.min(0.95, (player.x - b.x) * 0.008)) : 0;
          b.vx = aim * 1.15;
          b.vy = bossProjectileSpeed(boss, 6.35 + campaignTier(wave) * 0.22);
          b.r = 10.4;
          b.homing = 0;
          b.maxSpeed = Math.hypot(b.vx, b.vy) + 0.5;
          b.portalBurst = true;
          b.born = now;
          SFX.missionZap ? SFX.missionZap() : (SFX.emp && SFX.emp());
        } else {
          b._gone = true; return;
        }
      }
      if (b.decoySword && now >= (b.expiresAt || b.launchAt || now + 1)) {
        b._gone = true;
        return;
      }
      if (b.tacoGuard) {
        b.displayRotation = now * 0.018 * (b.tacoSide || 1);
        if (b.telegraph && now >= (b.tacoDropAt || b.launchAt || now + 1)) {
          b.telegraph = false;
          b.damage = bossDamage(boss, 14);
          b.vx = (b.tacoSide || 0) * 1.6;
          b.vy = 4.25 + campaignTier(wave) * 0.12;
          b.born = now;
        }
      }
      if (b.telegraph && !b.decoySword && now >= b.launchAt) {
        const speed = bossProjectileSpeed(boss, 20.5 + Math.min(2.8, campaignTier(wave) * 0.5));
        if (b.knightLaneSword) {
          b.vx = 0;
          b.vy = speed;
        } else {
          const dxs = player.x - b.x, dys = player.y - b.y;
          const dist = Math.hypot(dxs, dys) || 1;
          b.vx = (dxs / dist) * speed;
          b.vy = (dys / dist) * speed;
        }
        b.telegraph = false;
        b.displayRotation = null;
        b.born = now;
        SFX.missionZap ? SFX.missionZap() : (SFX.blaster && SFX.blaster());
      }
      if (!b.donkeyLine && b.gravity) b.vy += b.gravity;
      if (!b.telegraph && b.homing && player) {
        const dxh = player.x - b.x, dyh = player.y - b.y;
        const dist = Math.hypot(dxh, dyh) || 1;
        b.vx += (dxh / dist) * b.homing;
        b.vy += (dyh / dist) * b.homing;
        const sp = Math.hypot(b.vx, b.vy) || 1;
        const maxSp = b.maxSpeed || 4.2;
        if (sp > maxSp) { b.vx = (b.vx / sp) * maxSp; b.vy = (b.vy / sp) * maxSp; }
      }
      if (b.boomerang && age > 360 && boss) {
        b.vx += Math.max(-0.08, Math.min(0.08, (boss.x - b.x) * b.boomerang));
      }
      if (b.zigZagTooth) {
        if (now >= (b.nextZigAt || 0)) {
          b.vx *= -1;
          b.nextZigAt = now + (b.zigMs || 330);
        }
        if (b.x < (b.laneMin || 10)) { b.x = b.laneMin || 10; b.vx = Math.abs(b.vx); }
        if (b.x > (b.laneMax || W - 10)) { b.x = b.laneMax || W - 10; b.vx = -Math.abs(b.vx); }
      }
      if (b.waveAmp) {
        b.x += Math.sin(age * (b.waveFreq || 0.012) + (b.phase || 0)) * b.waveAmp;
      }
      if (!b.splitDone && ((b.splitAt && age > b.splitAt) || (b.splitAtY && b.y >= b.splitAtY))) {
        b.splitDone = true;
        const base = Math.atan2(b.vy, b.vx || 0);
        const speed = b.splitSpeed || 2.4;
        const offsets = b.splitOffsets || [-0.34, 0.34];
        offsets.forEach(off => {
          const ang = base + off;
          enemyBullets.push({ x: b.x, y: b.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: Math.max(4.2, (b.r || 6) * 0.62), theme: b.splitTheme || b.theme, damage: b.splitDamage || b.damage || 12, glowColor: b.glowColor, glowAlt: b.glowAlt, born: now });
        });
        if (b.dragonTwist) {
          // Twist: after the big split, two side embers cut inward so the
          // player reads both the fan and a crossing lane, not just a simple spread.
          const sideSpeed = speed * 0.82;
          enemyBullets.push({ x: Math.max(18, b.x - W * 0.26), y: b.y - 8, vx: sideSpeed * 0.58, vy: sideSpeed * 0.92, r: Math.max(5.2, (b.r || 6) * 0.5), theme: b.splitTheme || b.theme, damage: b.splitDamage || b.damage || 12, glowColor: b.glowColor, glowAlt: b.glowAlt, born: now });
          enemyBullets.push({ x: Math.min(W - 18, b.x + W * 0.26), y: b.y - 8, vx: -sideSpeed * 0.58, vy: sideSpeed * 0.92, r: Math.max(5.2, (b.r || 6) * 0.5), theme: b.splitTheme || b.theme, damage: b.splitDamage || b.damage || 12, glowColor: b.glowColor, glowAlt: b.glowAlt, born: now });
          addFloatText('FIRE CROSS!', b.x, b.y, '#ff8a00', 14);
        }
        b._gone = true;
      }
      if (b.delayUntil && now < b.delayUntil) {
        // Staged boss shots stay parked and hidden until the visual cue finishes.
      } else if (!b.telegraph && !(b.donkeyLine && b.donkeyState !== 'charge')) {
        b.x += b.vx; b.y += b.vy;
      }
      if (b.donkeyLine && b.donkeyState === 'charge' && (b.y > H + 18 || b.y < -18 || b.x < -18 || b.x > W + 18)) {
        b._gone = true;
      }
      if (b.bounce) {
        // Ricochet off the side walls only — keeps the ball in the play field so it
        // re-aims back down at the player instead of sailing off-screen.
        const br = b.r || 6;
        if (b.x < br) { b.x = br; b.vx = Math.abs(b.vx); }
        else if (b.x > W - br) { b.x = W - br; b.vx = -Math.abs(b.vx); }
      }
      if (b.hideBeforeRelease && b.delayUntil && now < b.delayUntil) return;
      if (b.theme) {
        ctx.save();
        ctx.translate(b.x, b.y);
        const rot = b.displayRotation != null ? b.displayRotation : Math.atan2(b.vy, b.vx || 0) + Math.PI / 2 + (b.rotationOffset || 0);
        ctx.rotate(rot);
        const rr = b.r || 5;
      if (b.telegraph) {
        const charge = Math.max(0, Math.min(1, (now - (b.telegraphStart || now)) / Math.max(1, (b.launchAt || now + 1) - (b.telegraphStart || now))));
        let decoyAlpha = b.decoySword ? 0.52 : 1;
        if (b.knightLaneSword) {
          const untilLaunch = (b.launchAt || now) - now;
          decoyAlpha = untilLaunch < 520 ? 1 : 0.44;
        }
        const pulse = 1 + Math.sin(now * 0.02) * (0.07 + charge * 0.16);
        ctx.save();
        ctx.globalAlpha = (0.18 + charge * 0.56) * decoyAlpha;
        ctx.strokeStyle = `rgba(200,212,255,${0.48 + charge * 0.42})`;
        ctx.lineWidth = 2.2 + charge * 2.8;
        ctx.beginPath(); ctx.arc(0, 0, rr * (3.15 + charge * 1.25) * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, rr * (1.95 + charge * 0.92) * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
        const themedScale = b.visualScale || (b.theme === 'donkey' ? 4.1 : b.theme === 'sombrero' ? 4.4 : b.theme === 'fish' ? 3.7 : 3.5);
        if (drawProjectileImage(b.theme, 0, 0, rr * themedScale, 0, b.theme === 'sword' ? 'rgba(200,212,255,0.92)' : null, !!b.fixedRotation)) {
          // PNG projectile handled.
        } else if (b.theme === 'donkey') {
          ctx.fillStyle = '#9a7a55'; ctx.fillRect(-rr*0.9, -rr*0.35, rr*1.8, rr*0.95);
          ctx.beginPath(); ctx.moveTo(-rr*0.9,-rr*0.3); ctx.lineTo(-rr*1.45,-rr*0.95); ctx.lineTo(-rr*0.3,-rr*0.55); ctx.fill();
          ctx.fillStyle = '#2a1a10'; ctx.fillRect(-rr*0.35, rr*0.05, rr*0.22, rr*0.85); ctx.fillRect(rr*0.35, rr*0.05, rr*0.22, rr*0.85);
        } else if (b.theme === 'bulletPortal') {
          ctx.save();
          const pulse = 1 + Math.sin(now * 0.012) * 0.055;
          const hot = now < (b.litUntil || 0);
          const active = b.portalActive;
          ctx.rotate((b.portalAngle || 0) + (b.spinPortal ? now * 0.006 : 0));
          ctx.globalAlpha = active ? 0.92 : 0.34;
          ctx.shadowColor = b.portalColorA || '#b36bff';
          ctx.shadowBlur = hot ? rr * 2.6 : rr * 1.2;
          ctx.strokeStyle = b.portalColorA || '#b36bff';
          ctx.lineWidth = active ? 4.2 : 2.2;
          ctx.beginPath(); ctx.ellipse(0, 0, rr * 1.32 * pulse, rr * 0.78 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
          ctx.strokeStyle = b.portalColorB || '#65f0ff';
          ctx.lineWidth = active ? 2.1 : 1.2;
          ctx.beginPath(); ctx.ellipse(0, 0, rr * 0.86 * pulse, rr * 0.50 * pulse, 0, 0, Math.PI * 2); ctx.stroke();
          if (hot) {
            ctx.fillStyle = 'rgba(255,255,255,0.16)';
            ctx.beginPath(); ctx.ellipse(0, 0, rr * 1.55, rr * 0.92, 0, 0, Math.PI * 2); ctx.fill();
          }
          if (!active) {
            ctx.strokeStyle = 'rgba(234,255,255,0.32)';
            ctx.lineWidth = 1.6;
            ctx.beginPath(); ctx.moveTo(-rr * 1.1, -rr * 0.7); ctx.lineTo(rr * 1.1, rr * 0.7); ctx.stroke();
          }
          ctx.restore();
        } else if (b.theme === 'portalSeed') {
          ctx.save();
          // The seed is the slow visible thing Gray drops into the entrance portal.
          // It is white/purple and larger than before so it does not read as HP.
          const speed = Math.hypot(b.vx || 0, b.vy || 0) || 1;
          const tx = -(b.vx || 0) / speed * rr * 3.4;
          const ty = -(b.vy || 0) / speed * rr * 3.4;
          const g = ctx.createLinearGradient(tx, ty, 0, 0);
          g.addColorStop(0, 'rgba(179,107,255,0)');
          g.addColorStop(1, 'rgba(246,233,255,0.75)');
          ctx.strokeStyle = g; ctx.lineWidth = rr * 0.7; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(0, 0); ctx.stroke();
          ctx.shadowColor = '#f1d2ff';
          ctx.shadowBlur = rr * 2.2;
          ctx.beginPath(); ctx.arc(0,0,rr*1.18,0,Math.PI*2); ctx.fillStyle='rgba(179,107,255,0.36)'; ctx.fill();
          ctx.beginPath(); ctx.arc(0,0,rr*0.58,0,Math.PI*2); ctx.fillStyle='#f6e9ff'; ctx.fill();
          ctx.restore();
        } else if (b.theme === 'portalExit' || b.theme === 'portalEnter') {
          const charge = Math.max(0, Math.min(1, (now - (b.telegraphStart || now)) / Math.max(1, (b.launchAt || now + 1) - (b.telegraphStart || now))));
          const chosen = b.chosenPortal || b.portalEnter;
          const alpha = chosen ? (0.56 + charge * 0.40) : 0.20;
          ctx.rotate(now * 0.006);
          ctx.strokeStyle = `rgba(179,107,255,${alpha})`;
          ctx.lineWidth = chosen ? 5 : 2;
          ctx.beginPath(); ctx.arc(0,0,rr*(1.35+charge*0.42),0,Math.PI*2); ctx.stroke();
          ctx.strokeStyle = `rgba(101,240,255,${alpha*0.85})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(0,0,rr*(0.80+charge*0.25),0,Math.PI*2); ctx.stroke();
          if (chosen) { ctx.shadowColor = '#b36bff'; ctx.shadowBlur = rr * (1.3 + charge); ctx.fillStyle = `rgba(179,107,255,${0.11+charge*0.16})`; ctx.beginPath(); ctx.arc(0,0,rr*(1.24+charge*0.36),0,Math.PI*2); ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = `rgba(234,255,255,${0.34+charge*0.44})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-rr*1.7,0); ctx.lineTo(rr*1.7,0); ctx.moveTo(0,-rr*1.7); ctx.lineTo(0,rr*1.7); ctx.stroke(); }
        } else if (b.theme === 'fire') {
          ctx.save();
          ctx.shadowColor = b.glowColor || '#ff4b12';
          ctx.shadowBlur = rr * 2.2;
          ctx.beginPath(); ctx.arc(0,0,rr*1.55,0,Math.PI*2); ctx.fillStyle = 'rgba(255,75,18,0.20)'; ctx.fill();
          ctx.beginPath(); ctx.moveTo(0,-rr*1.7); ctx.bezierCurveTo(rr*1.2,-rr*0.5,rr*0.6,rr*1.1,0,rr*1.4); ctx.bezierCurveTo(-rr*0.9,rr*0.7,-rr*1.1,-rr*0.4,0,-rr*1.7); ctx.fillStyle = '#ff5a00'; ctx.fill();
          ctx.shadowColor = b.glowAlt || '#ffb000'; ctx.shadowBlur = rr * 1.5;
          ctx.beginPath(); ctx.moveTo(0,-rr); ctx.bezierCurveTo(rr*0.5,-rr*0.2,rr*0.25,rr*0.6,0,rr*0.85); ctx.bezierCurveTo(-rr*0.45,rr*0.35,-rr*0.5,-rr*0.2,0,-rr); ctx.fillStyle = '#ffe61a'; ctx.fill();
          ctx.restore();
        } else if (b.theme === 'portalOrb') {
          ctx.save();
          const speed = Math.hypot(b.vx || 0, b.vy || 0) || 1;
          const tx = -(b.vx || 0) / speed * rr * 4.2;
          const ty = -(b.vy || 0) / speed * rr * 4.2;
          const tail = ctx.createLinearGradient(tx, ty, 0, 0);
          tail.addColorStop(0, 'rgba(101,240,255,0)');
          tail.addColorStop(1, 'rgba(179,107,255,0.78)');
          ctx.strokeStyle = tail; ctx.lineWidth = rr * 0.9; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(0, 0); ctx.stroke();
          ctx.shadowColor = '#b36bff';
          ctx.shadowBlur = rr * 2.8;
          ctx.beginPath(); ctx.arc(0,0,rr*1.52,0,Math.PI*2); ctx.fillStyle='rgba(179,107,255,0.26)'; ctx.fill();
          ctx.beginPath(); ctx.arc(0,0,rr*0.95,0,Math.PI*2); ctx.fillStyle='#140024'; ctx.fill();
          ctx.strokeStyle='rgba(101,240,255,0.9)'; ctx.lineWidth=2.6; ctx.beginPath(); ctx.arc(0,0,rr*0.95,0,Math.PI*2); ctx.stroke();
          ctx.strokeStyle='rgba(255,255,255,0.66)'; ctx.lineWidth=1.2; ctx.beginPath(); ctx.arc(0,0,rr*0.42,0,Math.PI*2); ctx.stroke();
          ctx.restore();
        } else if (b.theme === 'greenOrb') {
          ctx.save();
          ctx.shadowColor = b.portalBurst ? '#33ff66' : 'transparent';
          ctx.shadowBlur = b.portalBurst ? rr * 2.2 : 0;
          ctx.beginPath(); ctx.arc(0,0,rr*(b.portalBurst?1.75:1.25),0,Math.PI*2); ctx.fillStyle='rgba(51,255,102,0.25)'; ctx.fill();
          ctx.beginPath(); ctx.arc(0,0,rr,0,Math.PI*2); ctx.fillStyle='#33ff66'; ctx.fill();
          if (b.portalBurst) { ctx.strokeStyle='rgba(234,255,255,0.72)'; ctx.lineWidth=1.8; ctx.beginPath(); ctx.arc(0,0,rr*1.35,0,Math.PI*2); ctx.stroke(); }
          ctx.restore();
        } else if (b.theme === 'purpleOrb') {
          ctx.save();
          const speed = Math.hypot(b.vx || 0, b.vy || 0) || 1;
          const tx = -(b.vx || 0) / speed * rr * 3.8;
          const ty = -(b.vy || 0) / speed * rr * 3.8;
          const tail = ctx.createLinearGradient(tx, ty, 0, 0);
          tail.addColorStop(0, 'rgba(255,118,210,0)');
          tail.addColorStop(1, 'rgba(190,78,255,0.78)');
          ctx.strokeStyle = tail; ctx.lineWidth = rr * 0.8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(tx, ty); ctx.lineTo(0, 0); ctx.stroke();
          ctx.shadowColor = '#cc66ff';
          ctx.shadowBlur = rr * 2.2;
          ctx.beginPath(); ctx.arc(0,0,rr*1.35,0,Math.PI*2); ctx.fillStyle='rgba(204,102,255,0.26)'; ctx.fill();
          ctx.beginPath(); ctx.arc(0,0,rr*0.9,0,Math.PI*2); ctx.fillStyle='#8d32ff'; ctx.fill();
          ctx.beginPath(); ctx.arc(-rr*0.22,-rr*0.26,rr*0.28,0,Math.PI*2); ctx.fillStyle='rgba(255,235,255,0.72)'; ctx.fill();
          ctx.restore();
        } else if (b.theme === 'purpleRain') {
          ctx.save();
          // Lightweight purple rain projectile for better frame pacing.
          ctx.globalAlpha = 0.82;
          ctx.fillStyle = '#d9b8ff';
          ctx.beginPath();
          ctx.ellipse(0, rr * 0.30, rr * 0.58, rr * 0.90, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 0.54;
          ctx.fillStyle = 'rgba(190,120,245,0.86)';
          ctx.beginPath();
          ctx.arc(0, -rr * 0.28, rr * 0.34, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else if (b.theme === 'fish') {
          ctx.beginPath(); ctx.ellipse(0,0,rr*1.25,rr*0.62,0,0,Math.PI*2); ctx.fillStyle='#5ab1ff'; ctx.fill();
          ctx.beginPath(); ctx.moveTo(0,rr*0.35); ctx.lineTo(-rr*0.9,rr*1.0); ctx.lineTo(-rr*0.45,0); ctx.lineTo(-rr*0.9,-rr*1.0); ctx.closePath(); ctx.fillStyle='#2f8fb8'; ctx.fill();
          ctx.fillStyle='#031018'; ctx.beginPath(); ctx.arc(rr*0.55,-rr*0.12,rr*0.15,0,Math.PI*2); ctx.fill();
        } else if (b.theme === 'sombrero') {
          ctx.beginPath(); ctx.ellipse(0,rr*0.2,rr*1.65,rr*0.45,0,0,Math.PI*2); ctx.fillStyle='#d99a2b'; ctx.fill();
          ctx.beginPath(); ctx.arc(0,-rr*0.05,rr*0.72,Math.PI,0); ctx.fillStyle='#fff4c8'; ctx.fill();
          ctx.strokeStyle='#cc3322'; ctx.lineWidth=1.5; ctx.beginPath(); ctx.moveTo(-rr*1.1,rr*0.2); ctx.lineTo(rr*1.1,rr*0.2); ctx.stroke();
        } else if (b.theme === 'ink') {
          ctx.fillStyle='rgba(35,18,54,0.86)';
          for (const [ix,iy,ir] of [[0,0,1.15],[-0.6,0.35,0.72],[0.65,0.25,0.62],[0.1,-0.55,0.55]]) { ctx.beginPath(); ctx.arc(ix*rr,iy*rr,ir*rr,0,Math.PI*2); ctx.fill(); }
        } else if (b.theme === 'shield') {
          ctx.beginPath(); ctx.moveTo(0,-rr*1.35); ctx.lineTo(rr, -rr*0.45); ctx.lineTo(rr*0.72, rr*1.1); ctx.lineTo(0, rr*1.45); ctx.lineTo(-rr*0.72, rr*1.1); ctx.lineTo(-rr, -rr*0.45); ctx.closePath(); ctx.fillStyle='#c8d4ff'; ctx.fill(); ctx.strokeStyle='#4d5f99'; ctx.lineWidth=1.5; ctx.stroke();
        } else if (b.theme === 'tennis') {
          ctx.beginPath(); ctx.arc(0,0,rr*1.15,0,Math.PI*2); ctx.fillStyle='#c6ff3a'; ctx.fill();
          ctx.strokeStyle='#f4ffe0'; ctx.lineWidth=1.4;
          ctx.beginPath(); ctx.arc(-rr*0.7,0,rr*1.5,-0.7,0.7); ctx.stroke();
          ctx.beginPath(); ctx.arc(rr*0.7,0,rr*1.5,Math.PI-0.7,Math.PI+0.7); ctx.stroke();
        }
        ctx.restore();
      } else {
        const specialType = b.isLock ? 'lock' : b.isIce ? 'ice' : b.isZap ? 'zap' : null;
        if (specialType) {
          const rot = Math.atan2(b.vy, b.vx || 0) + Math.PI / 2;
          const glow = b.isLock ? 'rgba(0,229,255,0.75)' : b.isIce ? 'rgba(160,220,255,0.75)' : 'rgba(204,153,255,0.72)';
          drawProjectileImage(specialType, b.x, b.y, (b.r || 5) * (b.visualScale || 3.4), rot, glow);
        } else {
          // Longer, thinner streak — reads as a directional bullet rather than a round
          // drifting rock. Halo + core kept small so it doesn't puff back out into
          // looking like an asteroid.
          const bSpeed = Math.hypot(b.vx, b.vy) || 1;
          const tailLen = (b.r||4) * 6;
          const tx = b.x - (b.vx/bSpeed)*tailLen, ty = b.y - (b.vy/bSpeed)*tailLen;
          const tailGrad = ctx.createLinearGradient(b.x, b.y, tx, ty);
          tailGrad.addColorStop(0, b.isLock ? 'rgba(0,229,255,0.86)' : 'rgba(255,90,90,0.8)');
          tailGrad.addColorStop(1, b.isLock ? 'rgba(0,229,255,0)' : 'rgba(255,68,68,0)');
          ctx.strokeStyle = tailGrad; ctx.lineWidth = (b.r||4)*0.8; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke();
          // halo + core without shadowBlur — red, more visible
          ctx.beginPath(); ctx.arc(b.x, b.y, (b.r||4)+2.5, 0, Math.PI*2);
          ctx.fillStyle = b.isLock ? 'rgba(0,229,255,0.42)' : 'rgba(255,80,80,0.4)'; ctx.fill();
          ctx.beginPath(); ctx.arc(b.x, b.y, (b.r||4)*0.85, 0, Math.PI*2);
          ctx.fillStyle = b.isLock ? '#00e5ff' : '#ff6666'; ctx.fill();
          ctx.beginPath(); ctx.arc(b.x, b.y, (b.r||4)*0.25, 0, Math.PI*2);
          ctx.fillStyle='rgba(255,255,255,0.43)'; ctx.fill();
        }
      }
      if (b.telegraph) return;
      const dx=b.x-player.x, dy=b.y-player.y;
      if(Math.sqrt(dx*dx+dy*dy) < (b.r||4) + player.r*0.8){
        b._hit=true;
        if (b.isIce) {
          buffFrozenUntil = Date.now() + 5000;
          addFloatText('FROZEN!', player.x, player.y - 40, '#66ddff', 18);
          playFrozenGlassShimmer();
        } else if (b.isZap) {
          buffZappedUntil = Date.now() + 5000;
          addFloatText('FARTED!', player.x, player.y - 40, '#cc99ff', 18);
          playEmpKalimbaGlitch();
        } else if (b.isLock) {
          addFloatText('LOCK HIT!', player.x, player.y - 40, '#00e5ff', 16);
          playPlayerDamageThud();
          takeDamage(b.damage || 7, projectileDamageCause(b));
        } else if (b.tennis) {
          addFloatText('SMASH! -20', player.x, player.y - 40, '#c6ff3a', 18);
          playPlayerDamageThud();
          takeDamage(b.damage || 20, projectileDamageCause(b));
        } else if (b.theme === 'donkey') {
          addFloatText('HEE HAW! -20', player.x, player.y - 40, '#c7a16b', 18);
          playPlayerDamageThud();
          takeDamage(b.damage || 20, projectileDamageCause(b));
        } else if (b.theme === 'sword') {
          addFloatText('SWORD! -35', player.x, player.y - 40, '#c8d4ff', 18);
          playPlayerDamageThud();
          takeDamage(b.damage || 35, projectileDamageCause(b));
        } else if (b.splat || b.theme === 'ink') {
          bossInkBlindUntil = Date.now() + 2400;
          blasterDisabledUntil = Date.now() + 2600;
          addFloatText('BLASTER JAMMED!', player.x, player.y - 40, '#ff76d2', 18);
          playRaveDiscoStab();
          takeDamage(b.damage || 5, projectileDamageCause(b));
        } else {
          playPlayerDamageThud();
          takeDamage(b.damage || 5, projectileDamageCause(b));
        }
      }
    });
    enemyBullets = enemyBullets.filter(b => !b._hit && !b._gone && b.y < H + 20 && b.y > -20 && b.x > -20 && b.x < W + 20);
    if(state==='over') return;

    // Float texts
    floatTexts = floatTexts.filter(t => t.a > 0.02);
    floatTexts.forEach(t => {
      t.y += t.vy;
      if (!t.holdMs || Date.now() - (t.startedAt || 0) > t.holdMs) t.a -= (t.fade || 0.02);
      ctx.save();
      ctx.globalAlpha = t.a;
      ctx.font = `bold ${t.size}px 'Bebas Neue', cursive`;
      ctx.textAlign = 'center';
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    });

    // Danger line — no shadowBlur; use a wider semi-transparent halo line instead.
    // Drawn at the actual danger boundary, which has been moved down while the
    // sockets remain anchored to their original line.
    const _renderLineY = waveTheme === 'flip' ? REVERSE_LINE_Y : dangerY;
    if (lineFlashA > 0) lineFlashA = Math.max(0, lineFlashA - 0.04);
    ctx.save();
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -(Date.now() / 90) % 11;
    // halo
    ctx.beginPath(); ctx.moveTo(0, _renderLineY); ctx.lineTo(W, _renderLineY);
    ctx.strokeStyle = `rgba(51,255,100,${(0.28 + lineFlashA * 0.62) * 0.35})`;
    ctx.lineWidth = 6 + lineFlashA * 4;
    ctx.stroke();
    // core line
    ctx.beginPath(); ctx.moveTo(0, _renderLineY); ctx.lineTo(W, _renderLineY);
    ctx.strokeStyle = `rgba(51,255,100,${0.28 + lineFlashA * 0.62})`;
    ctx.lineWidth = 1.5 + lineFlashA;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();

    if (boss) drawBoss();
    if (miniBoss) drawMiniBoss();
    drawPlayer();
    if (twin) drawTwin();
    if (rebound) drawRebound();
    if (escort) drawEscort();
    // BLACKOUT: ship-headlight cone with feathered edges. Draw a dark layer, then
    // softly erase nested V-shapes so the beam fades at the sides instead of cutting
    // a hard triangle into the darkness.
    if (waveTheme === 'blackout' && Date.now() > themeEffectsAt) {
      const headlight = blackoutHeadlightGeometry();
      const { coneTopY, coneHalfW, beamBaseY } = headlight;
      ctx.save();
      ctx.fillStyle = 'rgba(3,1,16,0.965)';
      ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 9; i++) {
        const t = i / 8;
        const half = coneHalfW * (1 - t * 0.55);
        const alpha = 0.035 + t * 0.075;
        const erase = ctx.createLinearGradient(player.x, beamBaseY, player.x, coneTopY);
        erase.addColorStop(0, `rgba(255,255,255,${alpha * 1.35})`);
        erase.addColorStop(0.58, `rgba(255,255,255,${alpha * 0.82})`);
        erase.addColorStop(1, `rgba(255,255,255,${alpha * 0.02})`);
        ctx.beginPath();
        ctx.moveTo(player.x, beamBaseY);
        ctx.lineTo(Math.max(0, player.x - half), coneTopY);
        ctx.lineTo(Math.min(W, player.x + half), coneTopY);
        ctx.closePath();
        ctx.fillStyle = erase;
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      const beam = ctx.createLinearGradient(player.x, beamBaseY, player.x, coneTopY);
      beam.addColorStop(0, 'rgba(255,246,180,0.16)');
      beam.addColorStop(0.62, 'rgba(255,246,180,0.042)');
      beam.addColorStop(1, 'rgba(255,246,180,0)');
      ctx.beginPath();
      ctx.moveTo(player.x, beamBaseY);
      ctx.lineTo(Math.max(0, player.x - coneHalfW * 0.82), coneTopY);
      ctx.lineTo(Math.min(W, player.x + coneHalfW * 0.82), coneTopY);
      ctx.closePath();
      ctx.fillStyle = beam;
      ctx.fill();
      // Keep the damage line visible during BLACKOUT. The darkness layer is drawn
      // after the normal line, so redraw a softer version here as a survival cue.
      ctx.save();
      ctx.globalAlpha = 0.72;
      ctx.setLineDash([10, 7]);
      ctx.beginPath();
      ctx.moveTo(0, _renderLineY);
      ctx.lineTo(W, _renderLineY);
      ctx.strokeStyle = 'rgba(51,255,100,0.78)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      // The darkness hole is only half of BLACKOUT: normal sprites also need to be
      // redrawn above the dark layer, clipped to the cone, or they stay dimmed by
      // the global overlay even when the beam geometry is correct.
      const drawBlackoutLitHeroBullet = b => {
        ctx.fillStyle = C('#ffe61a');
        ctx.fillRect(b.x - 2, b.y - 12, 4, 14);
        ctx.fillStyle = 'rgba(255,230,26,0.35)';
        ctx.fillRect(b.x - 4, b.y - 14, 8, 18);
      };
      const drawBlackoutLitEnemyBullet = b => {
        if (b.theme === 'bulletPortal') return;
        const rr = b.r || 5;
        const sp = Math.hypot(b.vx || 0, b.vy || 0) || 1;
        const tx = b.x - ((b.vx || 0) / sp) * rr * 5;
        const ty = b.y - ((b.vy || 0) / sp) * rr * 5;
        const grad = ctx.createLinearGradient(b.x, b.y, tx, ty);
        const c1 = b.theme === 'portalOrb' ? 'rgba(179,107,255,0.86)' : 'rgba(255,80,80,0.82)';
        const c2 = b.theme === 'portalOrb' ? 'rgba(101,240,255,0)' : 'rgba(255,68,68,0)';
        grad.addColorStop(0, c1);
        grad.addColorStop(1, c2);
        ctx.strokeStyle = grad;
        ctx.lineWidth = rr * 0.9;
        ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.beginPath(); ctx.arc(b.x, b.y, rr + 2.5, 0, Math.PI * 2);
        ctx.fillStyle = b.theme === 'portalOrb' ? 'rgba(179,107,255,0.36)' : 'rgba(255,80,80,0.42)';
        ctx.fill();
        ctx.beginPath(); ctx.arc(b.x, b.y, rr * 0.85, 0, Math.PI * 2);
        ctx.fillStyle = b.theme === 'portalOrb' ? '#b36bff' : '#ff6666';
        ctx.fill();
      };
      ctx.save();
      clipToBlackoutHeadlight();
      for (const o of obstacles) {
        if (!o.blackoutHiddenEnemy && isPointInBlackoutHeadlight(o.x, o.y, o.r || 18)) drawObstacle(o);
      }
      for (const p of powerups) {
        if (isPointInBlackoutHeadlight(p.x, p.y, p.r || 16)) drawPowerup(p);
      }
      for (const b of bullets) {
        if (b.vy !== 999 && isPointInBlackoutHeadlight(b.x, b.y, 8)) drawBlackoutLitHeroBullet(b);
      }
      for (const b of enemyBullets) {
        if (!b._gone && !b._hit && isPointInBlackoutHeadlight(b.x, b.y, (b.r || 5) + 4)) drawBlackoutLitEnemyBullet(b);
      }
      ctx.restore();

      // During BLACKOUT, redraw player blaster shots through the same headlight
      // cone so they visibly fade into darkness instead of disappearing abruptly.
      for (const b of bullets) {
        if (b.vy === 999) continue;
        const denom = Math.max(1, beamBaseY - coneTopY);
        const t = Math.max(0, Math.min(1, (beamBaseY - b.y) / denom));
        if (t < 0 || t > 1) continue;
        const halfAtY = coneHalfW * (0.16 + 0.84 * t);
        const edge = Math.max(0, 1 - Math.abs(b.x - player.x) / Math.max(1, halfAtY));
        const alpha = Math.max(0, Math.min(1, edge * edge * (0.72 - 0.68 * t))); 
        if (alpha <= 0.02) continue;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = C('#ffe61a');
        ctx.fillRect(b.x - 2, b.y - 12, 4, 14);
        ctx.fillStyle = 'rgba(255,230,26,0.35)';
        ctx.fillRect(b.x - 4, b.y - 14, 8, 18);
        ctx.restore();
      }
      // BLACKOUT feedback: when a shot hits an object in the dark, briefly flash
      // the contact point so the player gets readable confirmation without seeing
      // the whole lane forever.
      const litNow = Date.now();
      const drawBlackoutHitGlow = (x, y, rr, color, litUntil) => {
        ctx.save();
        const a = Math.max(0, Math.min(1, (litUntil - litNow) / 260));
        ctx.globalAlpha = 0.12 + a * 0.50;
        ctx.beginPath();
        ctx.arc(x, y, rr * (1.08 + a * 0.34), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowColor = color;
        ctx.shadowBlur = 8 + a * 14;
        ctx.fill();
        ctx.restore();
        return a;
      };
      const drawBlackoutHiddenEnemyFlash = (o, a) => {
        const rr = o.r || 18;
        ctx.save();
        ctx.translate(o.x, o.y);
        ctx.globalAlpha = Math.max(0.18, Math.min(0.92, 0.22 + a * 0.7));
        ctx.strokeStyle = o.blackoutKillFlash ? 'rgba(255,230,26,0.92)' : 'rgba(255,90,90,0.88)';
        ctx.fillStyle = o.blackoutKillFlash ? 'rgba(255,230,26,0.10)' : 'rgba(255,90,90,0.10)';
        ctx.lineWidth = o.blackoutKillFlash ? 3.2 : 2.4;
        ctx.setLineDash(o.blackoutKillFlash ? [] : [5, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, rr * (1.05 + a * 0.22), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = o.blackoutKillFlash ? 'rgba(255,255,255,0.86)' : 'rgba(255,210,210,0.82)';
        ctx.beginPath(); ctx.arc(-rr * 0.32, -rr * 0.12, rr * 0.12, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(rr * 0.32, -rr * 0.12, rr * 0.12, 0, Math.PI * 2); ctx.fill();
        if (o.blackoutKillFlash) {
          ctx.strokeStyle = 'rgba(255,230,26,0.88)';
          ctx.lineWidth = 2.4;
          ctx.beginPath(); ctx.moveTo(-rr * 0.58, -rr * 0.58); ctx.lineTo(rr * 0.58, rr * 0.58); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(rr * 0.58, -rr * 0.58); ctx.lineTo(-rr * 0.58, rr * 0.58); ctx.stroke();
        }
        ctx.restore();
      };
      const drawBlackoutMuzzleSpark = (o) => {
        const left = Math.max(0, (o.blackoutMuzzleUntil || 0) - litNow);
        if (left <= 0) return;
        const a = Math.max(0, Math.min(1, left / 360));
        const rr = o.r || 18;
        ctx.save();
        ctx.translate(o.x, o.y + rr * 0.85);
        ctx.globalAlpha = 0.26 + a * 0.58;
        ctx.strokeStyle = 'rgba(255,230,26,0.92)';
        ctx.fillStyle = 'rgba(255,230,26,0.18)';
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(0, 0, rr * (0.36 + (1 - a) * 0.28), 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.78)';
        ctx.beginPath(); ctx.moveTo(-rr * 0.42, 0); ctx.lineTo(rr * 0.42, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -rr * 0.42); ctx.lineTo(0, rr * 0.42); ctx.stroke();
        ctx.restore();
      };
      for (const o of obstacles) {
        if (o.blackoutHiddenEnemy && o.blackoutMuzzleUntil && o.blackoutMuzzleUntil > litNow) drawBlackoutMuzzleSpark(o);
      }
      blackoutHitFlashes = blackoutHitFlashes.filter(o => o.litUntil && o.litUntil > litNow);
      for (const o of blackoutHitFlashes) {
        const a = drawBlackoutHitGlow(o.x, o.y, o.r || 18, o.type === 'asteroid' ? 'rgba(190,170,220,0.46)' : 'rgba(255,90,90,0.48)', o.litUntil);
        if (o.blackoutHiddenEnemy) {
          drawBlackoutHiddenEnemyFlash(o, a);
        } else {
          ctx.save();
          ctx.globalAlpha = Math.max(0.22, Math.min(0.88, 0.20 + a * 0.68));
          drawObstacle(o);
          ctx.restore();
        }
      }
      for (const o of obstacles) {
        if (!o.blackoutHiddenEnemy && o.litUntil && o.litUntil > litNow) {
          const a = drawBlackoutHitGlow(o.x, o.y, o.r || 18, o.type === 'asteroid' ? 'rgba(190,170,220,0.42)' : 'rgba(255,90,90,0.42)', o.litUntil);
          ctx.save();
          ctx.globalAlpha = Math.max(0.22, Math.min(0.82, 0.18 + a * 0.64));
          drawObstacle(o);
          ctx.restore();
        }
      }
      for (const p of powerups) {
        if (p.litUntil && p.litUntil > litNow) {
          const a = drawBlackoutHitGlow(p.x, p.y, p.r || 16, p.type === 'mystery' ? 'rgba(204,102,255,0.48)' : 'rgba(255,230,26,0.44)', p.litUntil);
          ctx.save();
          ctx.globalAlpha = Math.max(0.20, Math.min(0.78, 0.16 + a * 0.58));
          drawPowerup(p);
          ctx.restore();
        }
      }
      ctx.restore();
    }
    if (Date.now() < bossInkBlindUntil) {
      const a = Math.min(0.82, (bossInkBlindUntil - Date.now()) / 2400 * 0.72);
      const inkGrad = ctx.createRadialGradient(player.x, player.y, player.r * 2.1, player.x, player.y, player.r * 7.2);
      inkGrad.addColorStop(0, `rgba(24,8,42,${a * 0.18})`);
      inkGrad.addColorStop(0.58, `rgba(28,12,48,${a * 0.62})`);
      inkGrad.addColorStop(1, `rgba(6,1,14,${a})`);
      ctx.fillStyle = inkGrad;
      ctx.fillRect(0, 0, W, H);
    }
    if (Date.now() < blasterDisabledUntil) {
      const left = Math.max(0, blasterDisabledUntil - Date.now());
      const a = Math.min(1, left / 2600);
      ctx.save();
      ctx.globalAlpha = 0.28 + a * 0.34;
      ctx.translate(W / 2, H * 0.42);
      ctx.fillStyle = 'rgba(35,8,58,0.88)';
      for (const [x, y, r] of [[0,0,92],[-62,20,48],[55,-18,42],[22,56,36],[-30,-54,34]]) {
        ctx.beginPath(); ctx.arc(x, y, r * (0.92 + Math.sin(Date.now() * 0.009 + r) * 0.04), 0, Math.PI * 2); ctx.fill();
      }
      ctx.strokeStyle = 'rgba(255,118,210,0.78)';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = -Date.now() * 0.05;
      ctx.beginPath(); ctx.arc(0, 0, 108, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.86;
      ctx.font = `bold 34px 'Bebas Neue', cursive`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ff76d2';
      ctx.fillText('BLASTER JAMMED', 0, 10);
      ctx.restore();
    }
    ctx.restore(); // undo shake before HUD — text should stay stable/readable
    drawHUD();
    drawCaptiveObjectiveHUD();
    drawSockets();
    drawRescueBanner();
    drawTopBanner();
    if (academyMode) drawAcademyMsgPanel();
  }

  // Unified callout for every power/advantage/HP event — one consistent place to
  // look instead of scattered popups (ship-position float text, socket flashes,
  // full-screen banners), which is exactly the "everything flying at me" chaos this
  // is meant to cut down on. Drawn last so it visually covers the score/wave row
  // for its duration. Same cyan/red as the hero ring / enemy reticle, same glowing
  // Bebas Neue language as the intro objective text. Fades in and out rather than
  // snapping on/off — reads as "appearing," not a flash.
  let topBanner = null;
  const TOP_BANNER_FADE_IN = 220, TOP_BANNER_HOLD = 700, TOP_BANNER_FADE_OUT = 380;
  function showTopBanner(text, kind, opts) {
    opts = opts || {};
    topBanner = {
      text,
      color: kind === 'bad' ? '#ff4444' : '#00e5ff',
      startedAt: Date.now(),
      holdMs: opts.holdMs || TOP_BANNER_HOLD,
    };
  }
  function drawTopBanner() {
    if (!topBanner) return;
    const elapsed = Date.now() - topBanner.startedAt;
    const holdMs = topBanner.holdMs || TOP_BANNER_HOLD;
    const total = TOP_BANNER_FADE_IN + holdMs + TOP_BANNER_FADE_OUT;
    if (elapsed > total) { topBanner = null; return; }
    let a;
    if (elapsed < TOP_BANNER_FADE_IN) a = elapsed / TOP_BANNER_FADE_IN;
    else if (elapsed < TOP_BANNER_FADE_IN + holdMs) a = 1;
    else a = 1 - (elapsed - TOP_BANNER_FADE_IN - holdMs) / TOP_BANNER_FADE_OUT;
    const c = topBanner.color;
    ctx.save();
    ctx.globalAlpha = a;
    // Solid enough to actually obscure what's happening underneath, on purpose —
    // half-visible motion through a translucent banner read as more confusing than
    // just hiding it for the brief moment the banner is up.
    ctx.fillStyle = '#0a0418';
    ctx.fillRect(0, 0, W, 54);
    ctx.fillStyle = c + '33';
    ctx.fillRect(0, 0, W, 54);
    ctx.shadowColor = c; ctx.shadowBlur = 20;
    ctx.fillStyle = c;
    ctx.font = `38px 'Bebas Neue', cursive`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(topBanner.text, W / 2, 28);
    ctx.restore();
  }

  // Left-edge inventory sockets — dim/gray glyph when empty, full-color when holding
  // one (max 1 per type). Tapping/clicking a filled socket deploys it (see
  // deploySocket/hitSocket above); empty sockets just sit there as a placeholder.
  function drawSockets() {
    SOCKET_TYPES.forEach((type, i) => {
      const r = socketRect(i);
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2, rad = r.w / 2;
      const held = inventory[type];
      ctx.save();
      ctx.translate(cx, cy);
      ctx.beginPath(); ctx.arc(0, 0, rad, 0, Math.PI * 2);
      ctx.fillStyle = held ? '#1a1530' : 'rgba(120,120,130,0.08)'; ctx.fill();
      ctx.strokeStyle = held ? SOCKET_COLOR[type] : 'rgba(150,150,160,0.35)';
      ctx.lineWidth = held ? 2.5 : 2;
      ctx.stroke();
      if (!held) ctx.globalAlpha = 0.45;
      const socketImgType = type === 'shield' ? 'powerShield' : type === 'gun' ? 'gun' : type === 'bomb' ? 'bomb' : null;
      if (socketImgType && drawProjectileImage(socketImgType, 0, 0, rad * 1.35, 0, held ? SOCKET_COLOR[type] : null, true, !held)) {
        // PNG icon handled.
      } else if (type === 'shield') {
        const hr = rad * 0.6;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = -Math.PI / 2 + k * Math.PI / 3;
          const x = Math.cos(a) * hr, y = Math.sin(a) * hr;
          if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fillStyle = held ? SOCKET_COLOR.shield : 'rgba(150,150,160,0.5)';
        ctx.fill();
      } else {
        ctx.font = `${rad * 1.1}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = held ? '#fff' : 'rgba(150,150,160,0.5)';
        ctx.fillText(SOCKET_GLYPH[type], 0, 1);
      }
      ctx.restore();
    });
  }

  // Renders a half-grid sprite mirrored into a full symmetric sprite, centered at
  // (cx, cy) and scaled to fit within `size`. The +0.6 padding on each block avoids
  // thin seam lines between adjacent pixels that canvas anti-aliasing can otherwise
  // leave when rects are placed edge-to-edge.
  function drawPixelSprite(rows, palette, cx, cy, size) {
    const halfCols = rows[0].length;
    const totalCols = halfCols * 2;
    const totalRows = rows.length;
    const px = size / totalCols;
    const startX = cx - size / 2, startY = cy - (totalRows * px) / 2;
    for (let r = 0; r < totalRows; r++) {
      const rowStr = rows[r];
      for (let c = 0; c < halfCols; c++) {
        const ch = rowStr[c];
        if (ch === '.' || !palette[ch]) continue;
        ctx.fillStyle = palette[ch];
        ctx.fillRect(startX + c * px, startY + r * px, px + 0.6, px + 0.6);
        const mirroredCol = totalCols - 1 - c;
        ctx.fillRect(startX + mirroredCol * px, startY + r * px, px + 0.6, px + 0.6);
      }
    }
  }

  function drawBossPngImage(creature, size, options) {
    const name = creature && creature.name;
    const src = BOSS_IMAGE_SRC[name];
    if (!src) return false;
    const img = _getImg(src);
    if (!img.complete || !img.naturalWidth) return false;
    options = options || {};
    const t = Date.now() * 0.004;
    const activeBoss = boss && boss.creature && boss.creature.name === name;
    const attacking = options.attacking !== undefined ? options.attacking : (activeBoss && Date.now() > (boss.nextAttack || 0) - 760);
    const glow = BOSS_GLOW[name] || { main: '#fff', alt: '#00e5ff' };
    const bob = options.still ? 0 : Math.sin(t * 1.7) * size * 0.018;
    const breathe = 1 + Math.sin(t * 2.2) * 0.025 + (attacking ? 0.035 : 0);
    const ringR = size * 0.55;
    const drawSize = size * (BOSS_IMAGE_SCALE[name] || 1);
    const offset = BOSS_IMAGE_OFFSET[name] || { x: 0, y: 0 };

    ctx.save();
    ctx.translate(0, bob);
    if (name === 'GRAY VISITOR' && activeBoss) {
      const now = Date.now();
      if (now < (boss.ghostUntil || 0)) {
        const hidden = now < (boss.invisibleUntil || 0);
        const flicker = hidden ? 0.015 : (0.26 + Math.abs(Math.sin(now * 0.034)) * 0.48);
        ctx.globalAlpha *= flicker;
        // afterimages make the phase jump visible even when using PNG bosses
        ctx.save();
        ctx.globalAlpha *= hidden ? 0.95 : 0.32;
        ctx.translate(-size * 0.18, size * 0.04);
        ctx.beginPath(); ctx.arc(0, 0, size * 0.34, 0, Math.PI * 2); ctx.fillStyle = 'rgba(179,107,255,0.26)'; ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.globalAlpha *= hidden ? 0.75 : 0.24;
        ctx.translate(size * 0.16, -size * 0.03);
        ctx.beginPath(); ctx.arc(0, 0, size * 0.28, 0, Math.PI * 2); ctx.fillStyle = 'rgba(101,240,255,0.22)'; ctx.fill();
        ctx.restore();
      }
    }
    ctx.scale(breathe, breathe);
    ctx.rotate(Math.sin(t * 1.25) * (attacking ? 0.035 : 0.014));

    ctx.save();
    ctx.rotate(t * (attacking ? 0.68 : 0.28));
    ctx.shadowColor = glow.main;
    ctx.shadowBlur = size * 0.22;
    ctx.beginPath(); ctx.arc(0, 0, ringR, 0, Math.PI * 2);
    ctx.strokeStyle = `${glow.main}55`; ctx.lineWidth = Math.max(5, size * 0.085); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(0, 0, ringR * 0.94, 0, Math.PI * 2);
    ctx.strokeStyle = `${glow.alt}cc`; ctx.lineWidth = Math.max(1.5, size * 0.025); ctx.stroke();
    for (let k = 0; k < 4; k++) {
      const a = k * Math.PI / 2 + t * 1.05;
      ctx.fillStyle = k % 2 ? glow.alt : glow.main;
      ctx.beginPath(); ctx.arc(Math.cos(a) * ringR * 0.98, Math.sin(a) * ringR * 0.98, Math.max(2, size * 0.035), 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    ctx.shadowColor = glow.main;
    ctx.shadowBlur = size * 0.12;
    ctx.drawImage(img, -drawSize / 2 + offset.x * size, -drawSize / 2 + offset.y * size, drawSize, drawSize);
    ctx.restore();
    return true;
  }

  function drawGizmoOrb(size) {
    if (drawBossPngImage({ name: 'GIZMO', isGizmo: true }, size)) return;
    const t = Date.now() * 0.004;
    ctx.save();
    ctx.scale(size / 118, size / 118);
    const bob = Math.sin(t * 1.7) * 2.2;
    ctx.translate(0, bob);

    // PS1-ish boss language: chunky faceted plates, hard color bands, and glow.
    ctx.save();
    ctx.rotate(t * 0.22);
    ctx.beginPath(); ctx.arc(0, 0, 61, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(187,116,255,0.22)'; ctx.lineWidth = 9; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 57, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(142,85,216,0.78)'; ctx.lineWidth = 2.6; ctx.stroke();
    for (let k = 0; k < 4; k++) {
      const a = t * 0.8 + k * Math.PI / 2;
      ctx.fillStyle = k % 2 ? '#f2e2bd' : '#b987ff';
      ctx.beginPath(); ctx.arc(Math.cos(a) * 57, Math.sin(a) * 57, 3.1, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();

    // Chunky poodle tufts made of low-poly cream rocks, with subtle bobbing.
    const puffColors = ['#fff8e8', '#efe1c4', '#c8b592', '#8c7457'];
    const tufts = [[-46,-13,22],[-53,11,18],[-35,25,14],[46,-13,22],[53,11,18],[35,25,14],[0,-50,22],[-18,-43,15],[18,-43,15]];
    tufts.forEach(([x,y,r], idx) => {
      const yy = y + Math.sin(t * 1.3 + idx) * 1.7;
      ctx.beginPath();
      for (let p = 0; p < 7; p++) {
        const a = -Math.PI / 2 + p * Math.PI * 2 / 7;
        const rr = r * (0.74 + ((p + idx) % 3) * 0.1);
        const px = x + Math.cos(a) * rr, py = yy + Math.sin(a) * rr;
        if (p === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fillStyle = puffColors[idx % puffColors.length]; ctx.fill();
      ctx.strokeStyle = '#170025'; ctx.lineWidth = 3; ctx.stroke();
    });

    // Twitching back tuft, not a ring/earring.
    ctx.save();
    ctx.translate(52, 28);
    ctx.rotate(Math.sin(t * 2.2) * 0.18);
    ctx.beginPath(); ctx.moveTo(-4,-8); ctx.lineTo(18,-4); ctx.lineTo(11,8); ctx.lineTo(-7,9); ctx.closePath();
    ctx.fillStyle = '#fff8e8'; ctx.fill();
    ctx.strokeStyle = '#170025'; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();

    // Faceted white/purple body: mostly poodle-white, with purple energy in the shadows.
    const bodyGrad = ctx.createRadialGradient(-18, -20, 4, 0, 0, 58);
    bodyGrad.addColorStop(0, '#fff7e6');
    bodyGrad.addColorStop(0.34, '#f4e9ff');
    bodyGrad.addColorStop(0.68, '#8e55d8');
    bodyGrad.addColorStop(1, '#19042e');
    ctx.beginPath();
    [[0,-49],[33,-39],[50,-12],[42,26],[16,48],[-22,44],[-47,14],[-42,-25],[-17,-48]].forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
    ctx.closePath();
    ctx.fillStyle = bodyGrad; ctx.fill();
    ctx.strokeStyle = '#170025'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = '#8e55d8'; ctx.lineWidth = 2; ctx.stroke();

    const facets = [
      [[0,-49],[33,-39],[10,-7],[-13,-13],'rgba(255,248,232,0.58)'],
      [[33,-39],[50,-12],[18,8],[10,-7],'rgba(142,85,216,0.38)'],
      [[50,-12],[42,26],[13,20],[18,8],'rgba(55,12,96,0.5)'],
      [[-47,14],[-42,-25],[-13,-13],[-20,21],'rgba(255,248,232,0.24)'],
      [[-22,44],[16,48],[13,20],[-20,21],'rgba(70,23,120,0.42)'],
    ];
    facets.forEach(poly => {
      ctx.beginPath();
      poly.slice(0, -1).forEach(([x,y], i) => i ? ctx.lineTo(x,y) : ctx.moveTo(x,y));
      ctx.closePath(); ctx.fillStyle = poly[poly.length - 1]; ctx.fill();
    });

    // Meaner almond eyes: heavier sockets, sharper brows, tiny gold irises.
    ctx.fillStyle = '#120818';
    ctx.beginPath(); ctx.ellipse(-18, -9, 9.4, 5.3, -0.34, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(16, -8, 9.4, 5.3, 0.28, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c78f1e';
    ctx.beginPath(); ctx.ellipse(-17.6, -8.8, 2.7, 3.8, -0.08, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(15.8, -8, 2.7, 3.8, 0.08, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#170025'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-31, -22); ctx.lineTo(-8, -13); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(29, -21); ctx.lineTo(7, -12); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-29, -17); ctx.lineTo(-11, -10); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(26, -16); ctx.lineTo(9, -10); ctx.stroke();
    ctx.fillStyle = '#170025';
    ctx.beginPath(); ctx.arc(-17.6, -8.8, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(15.8, -8, 1.7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,245,210,0.65)';
    ctx.beginPath(); ctx.arc(-18.8, -10.3, 0.75, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(14.6, -9.4, 0.75, 0, Math.PI * 2); ctx.fill();
    // Faceted dog snout: side-pointed Crash-ish muzzle + black dog nose.
    const sniff = Math.sin(t * 3.1) * 1.2;
    ctx.beginPath();
    ctx.moveTo(-14, 3); ctx.lineTo(-4, -1); ctx.lineTo(8, 0 + sniff); ctx.lineTo(25, 6 + sniff);
    ctx.lineTo(22, 17); ctx.lineTo(9, 24); ctx.lineTo(-6, 22); ctx.lineTo(-14, 15); ctx.closePath();
    ctx.fillStyle = '#d8c6a0'; ctx.fill();
    ctx.strokeStyle = '#170025'; ctx.lineWidth = 3.2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,246,223,0.36)';
    ctx.beginPath(); ctx.moveTo(-12, 5); ctx.lineTo(8, 0 + sniff); ctx.lineTo(3, 13); ctx.lineTo(-9, 18); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(109,90,70,0.42)';
    ctx.beginPath(); ctx.moveTo(8, 0 + sniff); ctx.lineTo(24, 7 + sniff); ctx.lineTo(21, 17); ctx.lineTo(9, 24); ctx.lineTo(3, 13); ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(13, 2 + sniff); ctx.lineTo(26, 6 + sniff); ctx.lineTo(22, 13 + sniff); ctx.lineTo(11, 12 + sniff); ctx.closePath();
    ctx.fillStyle = '#050208'; ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.24)';
    ctx.beginPath(); ctx.ellipse(15, 4 + sniff, 2.1, 1.1, -0.25, 0, Math.PI * 2); ctx.fill();
    // Bitey mouth: dark wedge with jagged teeth, like he might snap at the player.
    ctx.beginPath();
    ctx.moveTo(-18, 25); ctx.quadraticCurveTo(1, 18, 25, 24); ctx.lineTo(19, 34); ctx.quadraticCurveTo(1, 39, -15, 34); ctx.closePath();
    ctx.fillStyle = '#09030d'; ctx.fill();
    ctx.strokeStyle = '#170025'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = '#fff8e8';
    [[-12,25,-8,33,-4,24],[0,22,4,34,8,23],[13,24,17,32,21,24]].forEach(([x1,y1,x2,y2,x3,y3]) => {
      ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.lineTo(x3,y3); ctx.closePath(); ctx.fill();
    });
    ctx.restore();
  }

  function drawThemedBoss(creature, size) {
    if (drawBossPngImage(creature, size)) return;
    const s = size / 118;
    ctx.save();
    ctx.scale(s, s);
    const name = creature.name;
    const t = Date.now() * 0.004;
    const activeBoss = boss && boss.creature && boss.creature.name === name;
    const attacking = activeBoss && Date.now() > (boss.nextAttack || 0) - 760;
    const pulse = 1 + Math.sin(t * 2.2) * 0.025;
    ctx.scale(pulse, pulse);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    function poly(points, fill, stroke, lw) {
      ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.closePath();
      ctx.fillStyle = fill; ctx.fill();
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 3; ctx.stroke(); }
    }
    function openPoly(points, stroke, lw) {
      ctx.beginPath();
      points.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
      ctx.strokeStyle = stroke; ctx.lineWidth = lw || 3; ctx.stroke();
    }
    function bossAura(c1, c2) {
      const g = ctx.createRadialGradient(-12, -20, 3, 0, 0, 64);
      g.addColorStop(0, c1);
      g.addColorStop(0.55, c2);
      g.addColorStop(1, '#080012');
      ctx.shadowColor = c1; ctx.shadowBlur = 18; ctx.fillStyle = g;
    }
    function facet(points, fill) { poly(points, fill, null, 0); }
    function meanEyes(color, y) {
      y = y || -9;
      ctx.fillStyle = '#110816';
      ctx.beginPath(); ctx.ellipse(-17, y, 9, 5.4, -0.28, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(17, y, 9, 5.4, 0.28, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = color || '#ffe61a';
      ctx.beginPath(); ctx.ellipse(-16.6, y, 3, 3.8, -0.08, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(16.6, y, 3, 3.8, 0.08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#100515';
      ctx.beginPath(); ctx.arc(-16.6, y, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(16.6, y, 1.6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#170025'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-30, y - 13); ctx.lineTo(-8, y - 5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(30, y - 13); ctx.lineTo(8, y - 5); ctx.stroke();
    }
    function teeth(points) {
      ctx.fillStyle = '#fff8e8';
      points.forEach(p => poly([[p[0], p[1]], [p[2], p[3]], [p[4], p[5]]], '#fff8e8', null, 0));
    }
    function orbitGlow(color) {
      ctx.save();
      ctx.rotate(t * 0.3);
      ctx.beginPath(); ctx.arc(0, 0, 58, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.restore();
    }

    if (name === 'STAR OGRE') {
      bossAura('#b7ff68', '#365b24');
      poly([[-34,-35],[10,-42],[40,-20],[43,23],[15,47],[-26,42],[-47,10]], ctx.fillStyle, '#170025', 5);
      ctx.shadowBlur = 0;
      facet([[-34,-35],[10,-42],[-4,-8],[-35,2]], 'rgba(190,255,115,0.34)');
      facet([[10,-42],[40,-20],[12,-4],[-4,-8]], 'rgba(44,92,31,0.42)');
      facet([[-47,10],[-35,2],[-18,35],[-36,31]], 'rgba(255,255,190,0.14)');
      const earWob = Math.sin(t * 2.1) * 3;
      [[-24,-49,-36,-71], [24,-49,36,-71]].forEach(([x1,y1,x2,y2], idx) => {
        const tipX = x2 + (idx ? 1 : -1) * earWob;
        openPoly([[x1,y1],[tipX,y2]], '#170025', 9);
        openPoly([[x1,y1],[tipX,y2]], '#6f9d42', 5);
        ctx.beginPath(); ctx.arc(tipX, y2, 8, 0, Math.PI * 2); ctx.fillStyle = '#8ac957'; ctx.fill(); ctx.strokeStyle = '#170025'; ctx.lineWidth = 3; ctx.stroke();
      });
      meanEyes('#ffe61a', -12);
      poly([[-10,4],[2,-2],[14,4],[12,15],[1,19],[-10,14]], '#b27645', '#170025', 3);
      ctx.fillStyle = '#170025'; ctx.beginPath(); ctx.arc(-3, 7, 2, 0, Math.PI*2); ctx.arc(7, 7, 2, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#170025'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-19,26); ctx.quadraticCurveTo(0,34,21,26); ctx.stroke();
      orbitGlow('rgba(183,255,104,0.42)');
    } else if (name === 'SKY DRAGON') {
      const blink = Math.sin(t * 1.15) > 0.92;
      bossAura('#ffb33d', '#8e1d10');
      poly([[-53,-36],[-24,-52],[17,-45],[43,-25],[64,-4],[69,19],[52,37],[16,41],[-18,29],[-39,4]], ctx.fillStyle, '#170025', 5.8);
      ctx.shadowBlur = 0;
      facet([[-53,-36],[-24,-52],[-15,-18],[-42,-4]], 'rgba(255,178,54,0.42)');
      facet([[-24,-52],[17,-45],[4,-13],[-15,-18]], 'rgba(255,94,22,0.45)');
      facet([[17,-45],[43,-25],[19,-7],[4,-13]], 'rgba(118,26,9,0.42)');
      facet([[43,-25],[69,19],[41,10],[19,-7]], 'rgba(73,12,4,0.42)');
      facet([[-18,29],[16,41],[17,16],[-11,12]], 'rgba(255,190,72,0.28)');
      poly([[-27,-47],[-9,-76],[10,-47]], '#f2aa28', '#3a1608', 4);
      facet([[-18,-48],[-7,-69],[2,-47]], 'rgba(255,230,120,0.38)');
      poly([[12,-46],[32,-71],[45,-33]], '#f5b436', '#3a1608', 4);
      facet([[20,-45],[32,-62],[38,-35]], 'rgba(255,233,128,0.35)');
      poly([[-46,-26],[-73,-39],[-55,-9]], '#3b2a1c', '#170025', 3.2);
      poly([[-49,-6],[-77,2],[-52,18]], '#008f83', '#170025', 3);
      poly([[-44,13],[-67,36],[-34,29]], '#006d65', '#170025', 3);
      [
        [-42,-18,-32,-23,-29,-12],[-21,-28,-9,-34,-6,-22],[18,-31,31,-36,32,-23],
        [-44,0,-33,-5,-30,7],[-28,18,-17,13,-14,24],[7,20,19,14,21,26],
      ].forEach((p, i) => poly([[p[0],p[1]],[p[2],p[3]],[p[4],p[5]]], i % 2 ? 'rgba(255,212,92,0.46)' : 'rgba(255,118,42,0.52)', '#7a1808', 1.2));
      if (blink) {
        openPoly([[5,-14],[24,-15]], '#170025', 5);
      } else {
        ctx.fillStyle = '#07312f'; ctx.beginPath(); ctx.ellipse(15,-13,13,15,0.18,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#25c6a7'; ctx.beginPath(); ctx.ellipse(16,-13,8,11,0.16,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#071015'; ctx.beginPath(); ctx.ellipse(18,-12,4,7,0.05,0,Math.PI*2); ctx.fill();
        ctx.fillStyle = '#fff8e8'; ctx.beginPath(); ctx.arc(13,-19,2.7,0,Math.PI*2); ctx.fill();
        ctx.strokeStyle = '#170025'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-2,-25); ctx.quadraticCurveTo(13,-34,35,-23); ctx.stroke();
      }
      poly([[25,-12],[51,-16],[72,-4],[78,13],[64,27],[37,24],[20,10]], '#e85617', '#170025', 4.2);
      facet([[29,-10],[51,-14],[42,3],[23,7]], 'rgba(255,169,54,0.34)');
      facet([[51,-14],[72,-4],[57,7],[42,3]], 'rgba(109,20,8,0.38)');
      ctx.fillStyle = '#120308';
      ctx.beginPath(); ctx.ellipse(55, -2, 3.8, 2.4, -0.1, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(69, 3, 3.4, 2.1, 0.16, 0, Math.PI * 2); ctx.fill();
      poly([[22,18],[40,27],[68,22],[63,39],[35,48],[18,35]], '#09030d', '#170025', 3);
      teeth([[30,23,35,37,40,24],[48,25,53,39,58,24],[62,23,67,35,72,22]]);
      poly([[45,25],[64,35],[43,42]], '#ff8a00', null, 0);
      poly([[-10,29],[0,51],[16,41]], '#f2aa28', '#170025', 3);
      poly([[-24,20],[-13,47],[0,35]], '#d8871d', '#170025', 2.4);
      orbitGlow('rgba(255,120,40,0.4)');
    } else if (name === 'DARK KNIGHT') {
      bossAura('#c8d4ff', '#20263b');
      poly([[0,-55],[41,-28],[36,35],[16,50],[-19,46],[-39,25],[-34,-28]], ctx.fillStyle, '#170025', 5);
      ctx.shadowBlur = 0;
      facet([[0,-55],[41,-28],[7,-12],[-8,-13]], 'rgba(230,238,255,0.28)');
      facet([[41,-28],[36,35],[13,14],[7,-12]], 'rgba(37,45,67,0.52)');
      facet([[-39,25],[-34,-28],[-8,-13],[-14,18]], 'rgba(200,212,255,0.2)');
      poly([[-29,-12],[29,-12],[25,4],[-25,4]], '#05070d', '#c8d4ff', 2.3);
      for (const x of [-18,-7,4,15]) openPoly([[x,-12],[x,4]], '#c8d4ff', 2);
      const sway = Math.sin(t * 1.9) * 4;
      if (boss && boss.attackType === 'shield' && Date.now() < (boss.shieldUntil || 0)) {
        ctx.save(); ctx.translate(sway, 6);
        poly([[-54,-7],[-30,-29],[-4,-12],[-10,31],[-37,44],[-58,21]], 'rgba(200,212,255,0.28)', '#c8d4ff', 4);
        facet([[-51,-5],[-31,-24],[-25,10],[-51,20]], 'rgba(255,255,255,0.18)');
        openPoly([[-42,-18],[-38,34]], 'rgba(234,242,255,0.48)', 2);
        ctx.restore();
      }
      orbitGlow('rgba(200,212,255,0.32)');
    } else if (name === 'GRAY VISITOR') {
      const wob = Math.sin(t * 10) * 3;
      const ghosting = boss && boss.creature && boss.creature.name === 'GRAY VISITOR' && Date.now() < (boss.ghostUntil || 0);
      if (ghosting) {
        const flicker = 0.33 + Math.abs(Math.sin(t * 18)) * 0.38;
        ctx.globalAlpha *= flicker;
        ctx.save();
        ctx.translate(-18, 3);
        ctx.globalAlpha *= 0.35;
        bossAura('#33ff66', '#06361b');
        ctx.restore();
      }
      ctx.translate(wob, Math.cos(t * 8) * 1.5);
      bossAura('#d8ded8', '#4e5854');
      poly([[0,-55],[31,-37],[43,-8],[34,31],[8,54],[-25,42],[-40,6],[-29,-34]], ctx.fillStyle, '#170025', 5);
      ctx.shadowBlur = 0;
      facet([[0,-55],[31,-37],[9,-7],[-11,-7]], 'rgba(255,255,255,0.26)');
      facet([[31,-37],[43,-8],[15,11],[9,-7]], 'rgba(75,88,82,0.38)');
      facet([[-40,6],[-29,-34],[-11,-7],[-16,20]], 'rgba(255,255,255,0.16)');
      ctx.fillStyle = '#111';
      ctx.beginPath(); ctx.ellipse(-15,-11,12,19,-0.18,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(15,-11,12,19,0.18,0,Math.PI*2); ctx.fill();
      ctx.fillStyle='rgba(255,255,255,0.34)'; ctx.beginPath(); ctx.arc(-18,-18,2.2,0,Math.PI*2); ctx.arc(11,-18,2.2,0,Math.PI*2); ctx.fill();
      poly([[-9,24],[0,19],[9,24],[5,30],[-5,30]], '#33ff66', '#170025', 2);
      orbitGlow('rgba(180,255,220,0.28)');
    } else if (name === 'SPACE SHARK') {
      const flap = Math.sin(t * 3.4) * 9;
      bossAura('#5ab1ff', '#14506f');
      poly([[-26,-2],[-62,-20],[-83,-1],[-63,18]], '#14506f', '#170025', 3);
      poly([[-70,-1],[-95,-17 + flap],[-86,-1],[-95,16 - flap]], '#2f8fb8', '#170025', 3);
      poly([[-46,-21],[-7,-50],[36,-40],[61,-11],[57,20],[31,44],[-10,51],[-45,30],[-60,1]], ctx.fillStyle, '#170025', 5.6);
      ctx.shadowBlur = 0;
      facet([[-46,-21],[-7,-50],[-13,-8],[-48,8]], 'rgba(116,205,255,0.28)');
      facet([[-7,-50],[36,-40],[16,-9],[-13,-8]], 'rgba(34,124,170,0.36)');
      facet([[36,-40],[61,-11],[26,7],[16,-9]], 'rgba(9,54,80,0.52)');
      facet([[-35,31],[31,44],[22,18],[-24,18]], 'rgba(220,248,255,0.5)');
      poly([[-10,-44],[5,-79],[24,-42]], '#14506f', '#170025', 3.6);
      ctx.fillStyle = '#031018';
      ctx.beginPath(); ctx.ellipse(-17,-8,5.4,7,-0.12,0,Math.PI*2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(14,-8,5.4,7,0.12,0,Math.PI*2); ctx.fill();
      ctx.fillStyle = '#b9f7ff'; ctx.beginPath(); ctx.arc(-19,-11,1.4,0,Math.PI*2); ctx.arc(12,-11,1.4,0,Math.PI*2); ctx.fill();
      openPoly([[-34,-23],[-9,-16]], '#031018', 4.5);
      openPoly([[30,-23],[7,-16]], '#031018', 4.5);
      poly([[-35,6],[-8,15],[31,6],[24,23],[-4,31],[-34,21]], '#031018', '#170025', 2.8);
      teeth([[-28,8,-23,21,-18,11],[-13,13,-8,28,-3,15],[3,15,8,29,13,15],[18,11,23,24,29,9],[-21,25,-16,14,-11,24],[-5,29,0,16,5,28],[10,27,15,14,20,25]]);
      orbitGlow('rgba(90,177,255,0.35)');
    } else if (name === 'MEAN TACO') {
      bossAura('#ffe48c', '#9e6414');
      poly([[-54,19],[-45,-8],[-20,-30],[16,-32],[43,-9],[55,20],[34,40],[-22,42]], ctx.fillStyle, '#170025', 5);
      ctx.shadowBlur = 0;
      facet([[-45,-8],[-20,-30],[-7,5],[-39,17]], 'rgba(255,246,175,0.36)');
      facet([[16,-32],[43,-9],[15,6],[-7,5]], 'rgba(158,100,20,0.38)');
      const float = Math.sin(t * 2.2) * 4;
      [[-30,-24,'#6fcf45'],[-13,-34,'#ffcc44'],[4,-30,'#cc3322'],[22,-31,'#6fcf45'],[37,-20,'#ffcc44']].forEach(([x,y,c],i)=>{
        ctx.beginPath(); ctx.arc(x, y + float * (i%2?-.6:.6), 7, 0, Math.PI*2); ctx.fillStyle = c; ctx.fill(); ctx.strokeStyle = '#170025'; ctx.lineWidth = 2; ctx.stroke();
      });
      meanEyes('#ff442f', 2);
      ctx.strokeStyle = '#2a1400'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-25,18); ctx.quadraticCurveTo(0,33,28,18); ctx.stroke();
      if (boss && boss.attackType === 'sombrero' && (Date.now() < (boss.tacoGuardUntil || 0) || Date.now() < (boss.tacoOpenUntil || 0))) {
        const guarded = Date.now() < (boss.tacoGuardUntil || 0);
        const flash = Date.now() < (boss.tacoGuardFlashUntil || 0);
        ctx.save();
        ctx.setLineDash(guarded ? [5, 5] : [12, 8]);
        ctx.strokeStyle = guarded ? (flash ? '#fff4c8' : '#d99a2b') : '#33ff66';
        ctx.lineWidth = guarded ? 3.4 : 2.4;
        ctx.globalAlpha = guarded ? 0.84 : 0.52;
        ctx.beginPath(); ctx.arc(0, 4, 70 + Math.sin(t * 7) * (guarded ? 3 : 1.2), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      orbitGlow('rgba(255,228,140,0.35)');
    } else if (name === 'COSMIC OCTO') {
      const now = Date.now();
      const spinning = boss && boss.attackType === 'ink' && now < (boss.octoSpinUntil || 0) && now > (boss.octoDescendUntil || 0);
      const guarded = boss && boss.attackType === 'ink' && now < (boss.octoGuardUntil || 0);
      const spin = t * (spinning ? 8.2 : attacking ? 2.2 : 0.55);
      ctx.save(); ctx.rotate(spin);
      for (let i = 0; i < 8; i++) {
        ctx.save(); ctx.rotate(i * Math.PI / 4);
        const bend = Math.sin(t * 1.7 + i) * 8;
        ctx.beginPath();
        ctx.moveTo(-7, 30);
        ctx.bezierCurveTo(-16 + bend, 48, -4 + bend, 66, -13, 84);
        ctx.bezierCurveTo(-3 + bend, 78, 15 - bend, 60, 8, 31);
        ctx.closePath();
        ctx.fillStyle = i % 2 ? '#ff4fd8' : '#d82cff'; ctx.fill(); ctx.strokeStyle = '#170025'; ctx.lineWidth = 2.6; ctx.stroke();
        ctx.fillStyle = '#ffd5f6';
        for (let k=0;k<4;k++){
          ctx.beginPath(); ctx.arc((k % 2 ? 4 : -4) + bend * 0.08, 43 + k * 10, 2.3 - k * 0.12, 0, Math.PI*2); ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
      bossAura('#ff6be8', '#7b168d');
      poly([[0,-50],[33,-36],[47,-6],[34,31],[0,47],[-34,31],[-47,-6],[-33,-36]], ctx.fillStyle, '#170025', 5);
      ctx.shadowBlur = 0;
      facet([[0,-50],[33,-36],[10,-7],[-12,-8]], 'rgba(255,190,242,0.38)');
      facet([[33,-36],[47,-6],[14,12],[10,-7]], 'rgba(130,25,145,0.48)');
      meanEyes('#5ab1ff', -10);
      ctx.strokeStyle = '#170025'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-19,15); ctx.quadraticCurveTo(0,24,21,15); ctx.stroke();
      orbitGlow('rgba(255,80,216,0.45)');
      if (guarded || spinning) {
        const flash = boss && now < (boss.octoGuardFlashUntil || 0);
        ctx.save();
        ctx.setLineDash(guarded ? [4, 5] : [10, 8]);
        ctx.strokeStyle = guarded ? (flash ? '#fff4ff' : '#ff76d2') : '#cc66ff';
        ctx.lineWidth = guarded ? 3.5 : 2.4;
        ctx.globalAlpha = guarded ? 0.82 : 0.42;
        ctx.rotate(spinning ? -spin * 0.35 : 0);
        ctx.beginPath(); ctx.arc(0, 2, 72 + Math.sin(t * 10) * (guarded ? 3 : 1.5), 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
    } else {
      drawPixelSprite(creature.sprite, creature.palette, 0, 0, size / s);
    }
    ctx.restore();
  }

  const BOSS_PREVIEW_META = {
    'STAR OGRE': 'DONKEY CHARGE',
    'SKY DRAGON': 'SPLIT FIRE',
    'DARK KNIGHT': 'SWORD DART',
    'GRAY VISITOR': 'TRACKING ORBS',
    'SPACE SHARK': 'ZIG-ZAG TEETH',
    'MEAN TACO': 'SOMBRERO SHIELDS',
    'COSMIC OCTO': 'BLASTER INK',
    'GIZMO': 'TENNIS + BONES',
  };
  const BOSS_PREVIEW_PROJECTILE = {
    'STAR OGRE': 'donkey',
    'SKY DRAGON': 'fire',
    'DARK KNIGHT': 'sword',
    'GRAY VISITOR': 'greenOrb',
    'SPACE SHARK': 'fish',
    'MEAN TACO': 'sombrero',
    'COSMIC OCTO': 'ink',
    'GIZMO': 'tennis',
  };
  const BOSS_PREVIEW_PROJECTILE_LABEL = {
    donkey: 'DONKEY', fire: 'FIREBALL', sword: 'SWORD', greenOrb: 'ORB', fish: 'TOOTH',
    sombrero: 'SOMBRERO', ink: 'INK', tennis: 'TENNIS',
  };
  function bossPreviewProjectileFor(creature) {
    return BOSS_PREVIEW_PROJECTILE[creature && creature.name] || 'greenOrb';
  }
  function playBossPreviewTone(freq, type, dur, vol, endFreq) {
    if (SFX && SFX.tone) SFX.tone(freq, type || 'square', 0, dur || 0.12, vol || 0.08, endFreq || freq);
    else if (SFX && SFX.hit) SFX.hit();
  }

  function playBossImpactSound() {
    if (typeof playSpacePianoCluster === 'function' && typeof playSpaceTone === 'function') {
      playSpacePianoCluster([174.61, 220.00, 261.63], 0, 0.065);
      playSpaceTone(87.31, 'sine', 0.02, 0.10, 0.030, 65.41);
      return;
    }
    if (SFX && SFX.pianoNote) { SFX.pianoNote(); return; }
    if (SFX && SFX.hit) { SFX.hit(); return; }
  }
  function playSpaceNoiseBurst(dur, vol, filterFreq, filterType) {
    try {
      if (typeof getAudioCtx !== 'function') return false;
      const c = getAudioCtx();
      const bufferSize = Math.max(1, Math.floor(c.sampleRate * dur));
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 2.3);
      const noise = c.createBufferSource();
      const filter = c.createBiquadFilter();
      const gain = c.createGain();
      const t0 = c.currentTime + 0.01;
      noise.buffer = buffer;
      filter.type = filterType || 'lowpass';
      filter.frequency.value = filterFreq;
      gain.gain.setValueAtTime(vol, t0);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(c.destination);
      noise.start(t0);
      noise.stop(t0 + dur + 0.02);
      return true;
    } catch (e) {
      return false;
    }
  }
  function playSpaceTone(freq, type, start, dur, vol, endFreq) {
    try {
      if (typeof getAudioCtx !== 'function') return false;
      const c = getAudioCtx();
      const o = c.createOscillator();
      const g = c.createGain();
      const t0 = c.currentTime + Math.max(start || 0, 0.01);
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t0);
      if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
      o.connect(g);
      g.connect(c.destination);
      o.start(t0);
      o.stop(t0 + dur + 0.02);
      return true;
    } catch (e) {
      return false;
    }
  }
  function playSpaceZzfxPatch(p) {
    try {
      if (typeof getAudioCtx !== 'function') return false;
      const c = getAudioCtx();
      const sr = c.sampleRate || 44100;
      const volume = p[0] == null ? 1 : p[0];
      const randomness = p[1] || 0;
      const baseFreq = Math.max(1, (p[2] || 220) * (1 + (Math.random() * 2 - 1) * randomness));
      const attack = Math.max(0.001, p[3] || 0.001);
      const sustain = Math.max(0, p[4] || 0);
      const release = Math.max(0.01, p[5] || 0.1);
      const shape = p[6] || 0;
      const shapeCurve = p[7] || 1;
      const slide = p[8] || 0;
      const deltaSlide = p[9] || 0;
      const pitchJump = p[10] || 0;
      const pitchJumpTime = p[11] || 0;
      const repeatTime = p[12] || 0;
      const noiseAmount = Math.max(0, Math.min(1, p[13] || 0));
      const modulation = p[14] || 0;
      const bitCrush = p[15] || 0;
      const delay = Math.max(0, p[16] || 0);
      const sustainVolume = p[17] == null ? 1 : p[17];
      const decay = Math.max(0, p[18] || 0);
      const tremolo = p[19] || 0;
      const filter = p[20] || 0;
      const dur = Math.min(1.6, attack + sustain + release + decay + delay + 0.06);
      const n = Math.max(1, Math.floor(sr * dur));
      const buffer = c.createBuffer(1, n, sr);
      const data = buffer.getChannelData(0);
      const repeatSamples = repeatTime > 0 ? Math.max(1, Math.floor(repeatTime * sr)) : 0;
      const jumpSample = pitchJumpTime > 0 ? Math.floor(pitchJumpTime * sr) : -1;
      let phase = 0;
      let held = 0;
      let crushSample = 0;
      let low = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        const localI = repeatSamples ? i % repeatSamples : i;
        const localT = localI / sr;
        let freq = baseFreq + slide * localT + deltaSlide * localT * localT;
        if (jumpSample >= 0 && localI >= jumpSample) freq += pitchJump;
        freq = Math.max(12, Math.min(6000, freq));
        phase += freq / sr;
        const ph = phase % 1;
        let osc;
        if (shape === 1) osc = 1 - 4 * Math.abs(Math.round(ph - 0.25) - (ph - 0.25));
        else if (shape === 2) osc = 2 * (ph < 0.5) - 1;
        else if (shape === 3) osc = 2 * (ph - Math.floor(ph + 0.5));
        else osc = Math.sin(ph * Math.PI * 2);
        osc = Math.sign(osc) * Math.pow(Math.abs(osc), shapeCurve);
        const noise = Math.random() * 2 - 1;
        let sample = osc * (1 - noiseAmount) + noise * noiseAmount;
        if (modulation) sample *= Math.sin(Math.PI * 2 * modulation * t);
        if (bitCrush) {
          const hold = Math.max(1, Math.floor((bitCrush * bitCrush * 80) + 1));
          if (i % hold === 0) crushSample = sample;
          sample = crushSample;
        }
        let env;
        if (t < attack) env = t / attack;
        else if (t < attack + sustain) env = 1 - (1 - sustainVolume) * ((t - attack) / Math.max(0.001, sustain));
        else env = sustainVolume * Math.max(0, 1 - (t - attack - sustain) / release);
        if (decay && t > attack) env *= Math.max(0, 1 - (t - attack) / (sustain + release + decay));
        if (t < delay) env *= 0.7;
        if (tremolo) env *= 0.72 + 0.28 * Math.sin(Math.PI * 2 * tremolo * t);
        if (filter) {
          const cutoff = clamp(Math.abs(filter) / sr * 6.2, 0.015, 0.72);
          low += (sample - low) * cutoff;
          sample = filter < 0 ? sample - low : low;
        }
        held = sample * env * volume * 0.72;
        data[i] = Math.max(-1, Math.min(1, held));
      }
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.connect(c.destination);
      src.start();
      return true;
    } catch (e) {
      return false;
    }
  }
  function playSpacePianoCluster(notes, start, baseVol) {
    // Quick chord stab: multiple keys at nearly the same instant, same-key voicings.
    notes.forEach((f, i) => {
      const t = (start || 0) + (i % 2) * 0.002;
      const v = (baseVol || 0.07) * (i === 0 ? 1 : 0.72);
      playSpaceTone(f, 'triangle', t, 0.13, v, f * 0.994);
      playSpaceTone(f * 2.01, 'sine', t + 0.002, 0.055, v * 0.24, f * 1.99);
    });
  }

  function playRockPianoSoundscape() {
    // Asteroids are quick single piano notes in A minor pentatonic. The repeated
    // clears should feel darker/moodier, while avoiding sour random chromatic hits.
    const notes = [110.00, 130.81, 146.83, 164.81, 196.00, 220.00, 261.63, 293.66, 329.63, 392.00, 440.00]; // A minor pentatonic: A C D E G
    const f = notes[Math.floor(Math.random() * notes.length)];
    playSpaceTone(f, 'triangle', 0, 0.145, 0.070, f * 0.992);
    playSpaceTone(f * 2.01, 'sine', 0.003, 0.062, 0.020, f * 1.98);
  }

  function playMainPianoChord() {
    // The actual piano instrument is the more obvious chord hit.
    const voicings = [
      [261.63, 329.63, 392.00, 523.25],
      [220.00, 261.63, 329.63, 440.00],
      [196.00, 246.94, 293.66, 392.00],
      [164.81, 196.00, 246.94, 329.63],
    ];
    playSpacePianoCluster(voicings[Math.floor(Math.random() * voicings.length)], 0, 0.067);
  }

  function playOldSaxEnemySound() {
    // Enemy defeat stays as the older, subtler sax-style hit.
    if (SFX && SFX.saxNote) { SFX.saxNote(); return; }
    playSpaceTone(330, 'sawtooth', 0, 0.18, 0.08, 250);
    playSpaceTone(494, 'triangle', 0.055, 0.12, 0.05, 392);
  }

  function playObviousSaxSound() {
    // More sax-like than the generic note: reedy buzz + upward scoop + tiny wah/noise breath.
    const base = Math.random() < 0.5 ? 233.08 : 261.63; // Bb/C-ish, still friendly with the piano key center
    playSpaceTone(base * 0.92, 'sawtooth', 0, 0.055, 0.030, base);
    playSpaceTone(base, 'sawtooth', 0.018, 0.18, 0.050, base * 1.12);
    playSpaceTone(base * 2.01, 'triangle', 0.026, 0.13, 0.018, base * 2.08);
    playSpaceTone(base * 1.50, 'square', 0.055, 0.09, 0.010, base * 1.60);
    playSpaceNoiseBurst(0.045, 0.006, 950, 'bandpass');
  }

  function playEnemyHitPairSfx(hpAfterHit) {
    // First two normal-enemy hits pair with the sax defeat: muted trumpet-ish,
    // then clarinet-ish, then the old sax hit plays on defeat.
    if (hpAfterHit >= 2) {
      playSpaceTone(293.66, 'sawtooth', 0, 0.095, 0.030, 277.18);
      playSpaceTone(587.33, 'triangle', 0.008, 0.060, 0.012, 554.37);
      playSpaceNoiseBurst(0.028, 0.004, 1250, 'bandpass');
      return;
    }
    playSpaceTone(329.63, 'triangle', 0, 0.115, 0.034, 311.13);
    playSpaceTone(659.25, 'sine', 0.006, 0.075, 0.013, 622.25);
    playSpaceNoiseBurst(0.018, 0.003, 1700, 'bandpass');
  }

  function playShortHealthHarp() {
    // Very short harp sparkle, in the same A-minor family as the rocks.
    [440.00, 523.25, 659.25, 880.00].forEach((f, i) => {
      playSpaceTone(f, 'triangle', i * 0.018, 0.075, 0.047 - i * 0.006, f * 1.006);
      playSpaceTone(f * 2, 'sine', i * 0.018 + 0.002, 0.045, 0.014, f * 2.01);
    });
  }

  function playCoolSpaceBlaster() {
    // Lower, softer blaster: still sci-fi, less chirpy/repetitive than the guitar note.
    playSpaceTone(320, 'triangle', 0, 0.055, 0.034, 175);
    playSpaceTone(165, 'sawtooth', 0.006, 0.068, 0.018, 92);
    playSpaceTone(640, 'sine', 0.004, 0.032, 0.012, 410);
    playSpaceNoiseBurst(0.035, 0.010, 620, 'lowpass');
  }


  function playMusicBoxArpeggio() {
    // Clean success language: tiny music-box run, bright but not as wide as the rescue flourish.
    [659.25, 783.99, 987.77, 1318.51].forEach((f, i) => {
      playSpaceTone(f, 'triangle', i * 0.042, 0.105, 0.034 - i * 0.004, f * 1.004);
      playSpaceTone(f * 2, 'sine', i * 0.042 + 0.003, 0.058, 0.010, f * 2.01);
    });
  }

  function playRescueFlourish() {
    // Bigger angelic rescue sparkle: harp + music-box overtones, still short.
    [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, i) => {
      playSpaceTone(f, 'triangle', i * 0.028, 0.13, 0.045 - i * 0.005, f * 1.006);
      playSpaceTone(f * 2, 'sine', i * 0.028 + 0.004, 0.070, 0.012, f * 2.012);
    });
    playSpaceNoiseBurst(0.055, 0.004, 2600, 'highpass');
  }

  function playPlayerDamageThud() {
    // Wrong-sounding musical impact: low piano/gong thump instead of a generic miss chirp.
    playSpaceTone(82.41, 'triangle', 0, 0.18, 0.060, 73.42);
    playSpaceTone(164.81, 'sine', 0.006, 0.12, 0.028, 146.83);
    playSpaceNoiseBurst(0.060, 0.018, 420, 'lowpass');
  }

  function playShieldBellPing() {
    // Protective glass/vibraphone ping. Pickup language stays harp; shield language is bell.
    playSpaceTone(1046.50, 'sine', 0, 0.145, 0.045, 1049);
    playSpaceTone(1567.98, 'triangle', 0.006, 0.105, 0.020, 1572);
    playSpaceTone(2093.00, 'sine', 0.012, 0.070, 0.011, 2100);
  }

  function playBombOrchestraHit() {
    // Musical but heavy: timpani thump + short brass/orchestra stab for bomb deployment.
    playSpaceTone(73.42, 'sine', 0, 0.21, 0.075, 55.00);
    playSpaceTone(146.83, 'triangle', 0.012, 0.16, 0.042, 110.00);
    playSpaceTone(293.66, 'sawtooth', 0.018, 0.10, 0.030, 220.00);
    playSpaceNoiseBurst(0.090, 0.020, 900, 'lowpass');
  }

  function playMysteryQuestionRun() {
    // Question-mark music-box: playful and slightly suspicious.
    [587.33, 698.46, 622.25, 880.00].forEach((f, i) => {
      playSpaceTone(f, 'triangle', i * 0.035, 0.085, 0.032 - i * 0.003, f * 1.006);
      playSpaceTone(f * 2, 'sine', i * 0.035 + 0.002, 0.045, 0.009, f * 2.01);
    });
  }

  function playWaveStartChime() {
    // Start-of-wave cue: low synth bed with a tiny chime on top.
    playSpaceTone(110.00, 'triangle', 0, 0.18, 0.035, 110.00);
    playSpaceTone(220.00, 'sine', 0.012, 0.12, 0.018, 220.00);
    playSpaceTone(880.00, 'triangle', 0.045, 0.095, 0.025, 884.00);
  }

  function playRaveDiscoStab() {
    // RAVE stays electronic: disco chord stab + tiny sparkle.
    [261.63, 329.63, 392.00].forEach((f, i) => playSpaceTone(f, i === 1 ? 'sawtooth' : 'square', i * 0.004, 0.095, 0.024, f * 0.997));
    playSpaceTone(1046.50, 'triangle', 0.055, 0.055, 0.022, 1318.51);
    playSpaceNoiseBurst(0.045, 0.010, 1800, 'bandpass');
  }

  function playBlackoutDoomNote() {
    // Dark special-event cue: upright-bass/doom note.
    playSpaceTone(55.00, 'sine', 0, 0.34, 0.060, 46.25);
    playSpaceTone(110.00, 'triangle', 0.010, 0.22, 0.024, 92.50);
  }

  function playEmpKalimbaGlitch() {
    // Metallic kalimba/glitch zap, distinct from normal blaster and pickups.
    [783.99, 622.25, 987.77].forEach((f, i) => playSpaceTone(f, i % 2 ? 'square' : 'triangle', i * 0.022, 0.060, 0.026, f * 0.74));
    playSpaceNoiseBurst(0.050, 0.011, 2100, 'bandpass');
  }

  function playFrozenGlassShimmer() {
    // High glass shimmer for frozen hits/debuffs.
    [1174.66, 1567.98, 2093.00].forEach((f, i) => playSpaceTone(f, 'sine', i * 0.018, 0.115, 0.030 - i * 0.006, f * 1.004));
  }

  function playZappedGlitchPop() {
    // Silly but still readable: buzzy little zap-pop.
    playSpaceTone(180, 'square', 0, 0.055, 0.035, 420);
    playSpaceTone(95, 'sawtooth', 0.020, 0.080, 0.020, 60);
    playSpaceNoiseBurst(0.045, 0.012, 760, 'bandpass');
  }

  function playNormalInstrumentSfx(kind) {
    // Space-only normal SFX pass. Boss voices/projectiles still use the SPACE_SFX registry.
    try {
      if (kind === 'asteroid') {
        playRockPianoSoundscape();
        return;
      }
      if (kind === 'enemyDefeat') {
        playOldSaxEnemySound();
        return;
      }
      if (kind === 'blaster') {
        playCoolSpaceBlaster();
        return;
      }
      if (kind === 'hp') {
        playShortHealthHarp();
        return;
      }
      if (kind === 'powerup') {
        playShortHealthHarp();
        return;
      }
      if (kind === 'bomb') {
        playBombOrchestraHit();
        return;
      }
      if (kind === 'shield') {
        playShieldBellPing();
        return;
      }
      if (kind === 'mystery') {
        playMysteryQuestionRun();
        return;
      }
      if (kind === 'bad') {
        playPlayerDamageThud();
        return;
      }
    } catch (e) {}
    try { if (SFX && SFX.powerupCollect) SFX.powerupCollect(); } catch (e) {}
  }

  function playTraitorShotSfx(type) {
    if (type === 'purple') {
      // Handpan-ish purple rain bloom: soft metallic pentatonic taps, no harsh edge.
      [
        [146.83, 0.000, 0.150, 0.038],
        [220.00, 0.035, 0.135, 0.030],
        [293.66, 0.070, 0.120, 0.024],
        [329.63, 0.105, 0.105, 0.018],
      ].forEach(([f, t, d, v]) => {
        playSpaceTone(f, 'triangle', t, d, v, f * 0.998);
        playSpaceTone(f * 2.01, 'sine', t + 0.004, d * 0.58, v * 0.34, f * 2.006);
      });
      return;
    }
    // Flute-ish chirp for red direct shots.
    playSpaceTone(880, 'sine', 0, 0.08, 0.045, 1180);
    playSpaceTone(1320, 'triangle', 0.025, 0.07, 0.025, 980);
  }

  function playTargetBreakSfx(kind) {
    if (kind === 'asteroid') playNormalInstrumentSfx('asteroid');
    else playNormalInstrumentSfx('enemyDefeat');
  }
  // ── Space SFX registry (lightweight, no audio files) ──────────────────────
  // Named lookup over the EXISTING procedural SFX/tone calls. Nothing here is a
  // new sound — every entry below plays exactly the same placeholder already
  // used at its real call site (or, for "voice" keys with no live call site yet,
  // the closest distinct-per-boss tone already authored for Boss Preview). This
  // just gives the eventual real-audio pass one named spot per event to swap
  // instead of hunting through inline SFX calls scattered across the file.
  const SPACE_SFX = {
    'boss.ogre.voice': () => { if (SFX.scaryLaugh) SFX.scaryLaugh(); else playBossPreviewTone(120, 'sawtooth', 0.18, 0.10, 70); },
    'boss.ogre.projectile': () => playDonkeyHeeHaw(),
    'boss.dragon.voice': () => playBossPreviewTone(150, 'sawtooth', 0.22, 0.09, 90),
    'boss.dragon.projectile': () => playBossPreviewTone(130, 'sawtooth', 0.26, 0.16, 70),
    'boss.knight.voice': () => playBossPreviewTone(260, 'square', 0.14, 0.09, 90),
    'boss.knight.projectile': () => { if (SFX.missionBossCharge) SFX.missionBossCharge(); else if (SFX.neonOn) SFX.neonOn(); },
    'boss.gray.voice': () => { if (SFX.ghostTeleport) SFX.ghostTeleport(); else if (SFX.emp) playEmpKalimbaGlitch(); else playBossPreviewTone(180, 'sine', 0.16, 0.08, 520); },
    'boss.gray.projectile': () => { if (SFX.emp) playEmpKalimbaGlitch(); },
    'boss.shark.voice': () => playBossPreviewTone(180, 'sawtooth', 0.16, 0.08, 90),
    'boss.shark.projectile': () => { if (SFX.bomberDive) SFX.bomberDive(); },
    'boss.taco.voice': () => playBossPreviewTone(300, 'square', 0.16, 0.08, 180),
    'boss.taco.projectile': () => playBossPreviewTone(420, 'square', 0.18, 0.15, 260),
    'boss.octo.voice': () => playBossPreviewTone(95, 'sawtooth', 0.22, 0.09, 60),
    'boss.octo.projectile': () => { if (SFX.neonOn) SFX.neonOn(); },
    'boss.gizmo.voice': () => { if (SFX.gizmoBark) SFX.gizmoBark(); else playBossPreviewTone(240, 'square', 0.14, 0.10, 120); },
    'boss.gizmo.projectile': () => playBossPreviewTone(540, 'triangle', 0.10, 0.09, 840),
    'player.hit': () => playPlayerDamageThud(),
    'player.death': () => { if (SFX.over) SFX.over(); },
    'rescue.success': () => playRescueFlourish(),
    'powerup.hp': () => playShortHealthHarp(),
    'powerup.bomb': () => playBombOrchestraHit(),
    'powerup.shield': () => playShieldBellPing(),
    'powerup.mystery': () => playMysteryQuestionRun(),
    'wave.start': () => playWaveStartChime(),
    'wave.clear': () => playMusicBoxArpeggio(),
    'wave.rave': () => playRaveDiscoStab(),
    'wave.blackout': () => playBlackoutDoomNote(),
    'status.emp': () => playEmpKalimbaGlitch(),
    'status.frozen': () => playFrozenGlassShimmer(),
    'status.zapped': () => playZappedGlitchPop(),
  };
  // ── Real-audio overlay ──────────────────────────────────────────────────
  // Flip this to false to fall back to the procedural SPACE_SFX placeholders
  // everywhere, with zero other changes — every spaceSfx() call site already
  // goes through this one function, so this is the only switch that matters.
  const SPACE_SFX_USE_FILES = true;
  // Keys with no entry here (e.g. 'powerup.bomb', removed from the asset pack)
  // automatically fall back to their SPACE_SFX procedural placeholder below.
  const SPACE_SFX_FILES = {
    'boss.ogre.voice': 'assets/space/sfx/boss_ogre_voice.mp3',
    'boss.ogre.projectile': 'assets/space/sfx/boss_ogre_projectile.mp3',
    'boss.dragon.voice': 'assets/space/sfx/boss_dragon_voice.mp3',
    'boss.dragon.projectile': 'assets/space/sfx/boss_dragon_projectile.mp3',
    'boss.knight.voice': 'assets/space/sfx/boss_knight_voice.mp3',
    'boss.knight.projectile': 'assets/space/sfx/boss_knight_projectile.mp3',
    'boss.gray.voice': 'assets/space/sfx/boss_gray_voice.mp3',
    'boss.gray.projectile': 'assets/space/sfx/boss_gray_projectile.mp3',
    'boss.shark.voice': 'assets/space/sfx/boss_shark_voice.mp3',
    'boss.shark.projectile': 'assets/space/sfx/boss_shark_projectile.mp3',
    'boss.taco.voice': 'assets/space/sfx/boss_taco_voice.mp3',
    'boss.taco.projectile': 'assets/space/sfx/boss_taco_projectile.mp3',
    'boss.octo.voice': 'assets/space/sfx/boss_octo_voice.mp3',
    'boss.octo.projectile': 'assets/space/sfx/boss_octo_projectile.mp3',
    'boss.gizmo.voice': 'assets/space/sfx/boss_gizmo_voice.mp3',
    'boss.gizmo.projectile': 'assets/space/sfx/boss_gizmo_projectile.mp3',
    'player.death': 'assets/space/sfx/player_death.mp3',
  };
  const _spaceSfxAudioCache = {};
  function _playSpaceSfxFile(path, fallback) {
    let didFallback = false;
    const runFallback = () => {
      if (didFallback) return;
      didFallback = true;
      if (fallback) fallback();
    };
    try {
      // Cache one loaded <audio> per path and clone it per play — cloning
      // (instead of replaying the same node) lets two overlapping triggers
      // (e.g. two donkeys charging close together) play on top of each other
      // instead of the second cutting the first off.
      let base = _spaceSfxAudioCache[path];
      if (!base) {
        base = new Audio(path);
        base.preload = 'auto';
        base.load();
        _spaceSfxAudioCache[path] = base;
      }
      const node = base.cloneNode(true);
      node.preload = 'auto';
      node.addEventListener('error', runFallback, { once: true });
      const p = node.play();
      // HTMLAudioElement.play() can reject after this function returns (autoplay,
      // decode/load timing, mobile media limits). Do not let that become silence:
      // fall back to the procedural SFX if the file path cannot actually play.
      if (p && p.catch) p.catch(runFallback);
      return true;
    } catch (e) {
      return false;
    }
  }
  function spaceSfx(key) {
    try {
      const fn = SPACE_SFX[key];
      const playFallback = () => { if (fn) fn(); };
      if (SPACE_SFX_USE_FILES) {
        const path = SPACE_SFX_FILES[key];
        if (path && _playSpaceSfxFile(path, playFallback)) return;
      }
      playFallback();
    } catch (e) {}
  }
  const BOSS_SFX_KEY_PREFIX = {
    'STAR OGRE': 'boss.ogre',
    'SKY DRAGON': 'boss.dragon',
    'DARK KNIGHT': 'boss.knight',
    'GRAY VISITOR': 'boss.gray',
    'SPACE SHARK': 'boss.shark',
    'MEAN TACO': 'boss.taco',
    'COSMIC OCTO': 'boss.octo',
    'GIZMO': 'boss.gizmo',
  };
  function playBossPreviewSound(name, part) {
    // Phase 9 prep: routed through the SPACE_SFX registry above so a future
    // dedicated SFX pass can replace one named entry instead of editing this
    // branch or the live attack call sites separately.
    try {
      const prefix = BOSS_SFX_KEY_PREFIX[name];
      if (prefix) { spaceSfx(`${prefix}.${part === 'projectile' ? 'projectile' : 'voice'}`); return; }
      if (part === 'projectile' && SFX.blaster) SFX.blaster(); else if (SFX.over) SFX.over();
    } catch(e) {}
  }
  function bossPreviewList() {
    return [...BOSS_CREATURES, { name: 'GIZMO', isGizmo: true }];
  }
  let bossPreviewRaf = null;
  function renderSpaceBossPreviewCanvases() {
    const oldCtx = ctx;
    const oldBoss = boss;
    bossPreviewList().forEach((creature, i) => {
      const cv = document.getElementById(`space-boss-cv-${i}`);
      const projCv = document.getElementById(`space-boss-proj-cv-${i}`);
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
      if (cv) {
        const css = 112; // larger drawing surface prevents the boss aura/ring from clipping at the canvas edge
        cv.width = Math.round(css * dpr);
        cv.height = Math.round(css * dpr);
        cv.style.width = `${css}px`;
        cv.style.height = `${css}px`;
        const cctx = cv.getContext('2d');
        cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        cctx.clearRect(0, 0, css, css);
        ctx = cctx;
        boss = {
          creature,
          attackType: bossAttackTypeFor(creature),
          nextAttack: Date.now() + 420,
          shieldUntil: 0,
        };
        ctx.save();
        ctx.translate(css / 2, css / 2 + 4);
        if (creature.isGizmo) drawGizmoOrb(82);
        else drawThemedBoss(creature, 82);
        ctx.restore();
      }
      if (projCv) {
        const css = 58;
        projCv.width = Math.round(css * dpr);
        projCv.height = Math.round(css * dpr);
        projCv.style.width = `${css}px`;
        projCv.style.height = `${css}px`;
        const pctx = projCv.getContext('2d');
        pctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        pctx.clearRect(0, 0, css, css);
        ctx = pctx;
        const type = bossPreviewProjectileFor(creature);
        const rot = 0;
        // Preview badges are static upright icons; live projectiles can still spin in-game.
        drawProjectileImage(type, css / 2, css / 2, 44, rot, null, true);
      }
    });
    ctx = oldCtx;
    boss = oldBoss;
  }
  function startSpaceBossPreviewAnimation() {
    cancelAnimationFrame(bossPreviewRaf);
    const tick = () => {
      const ov = document.getElementById('space-overlay');
      if (!ov || !ov.classList.contains('space-boss-preview')) { bossPreviewRaf = null; return; }
      renderSpaceBossPreviewCanvases();
      bossPreviewRaf = requestAnimationFrame(tick);
    };
    tick();
  }
  function bossPreviewHTML() {
    return `
      <div style="width:100%;max-width:432px;margin:0 auto 12px;display:flex;align-items:center;justify-content:space-between;gap:12px">
        <div>
          <div style="font-family:'Bebas Neue',cursive;font-size:34px;letter-spacing:5px;line-height:1;color:#33ff66;text-shadow:0 0 14px #33ff6688">BOSS PREVIEW</div>
          <div style="font-family:'VCR',monospace;font-size:10px;letter-spacing:1.5px;color:rgba(242,239,232,0.48);margin-top:5px">SPACE MOBE ROGUES</div>
        </div>
        <button class="whack-btn" style="width:auto;min-width:82px;height:38px;border-color:rgba(51,255,102,0.42);background:rgba(51,255,102,0.1);font-size:11px;letter-spacing:2px;padding:0 12px" onclick="showSpaceOverlay('select')">CLOSE</button>
      </div>
      <div class="space-boss-gallery">
        ${bossPreviewList().map((creature, i) => {
          const projectileType = bossPreviewProjectileFor(creature);
          const projectileLabel = BOSS_PREVIEW_PROJECTILE_LABEL[projectileType] || 'SHOT';
          return `
          <div class="space-boss-card">
            <button class="space-boss-art-btn" onclick="spaceBossPreviewSound('${creature.name}', 'boss')" aria-label="Play ${creature.name} boss sound" title="Play boss sound">
              <canvas id="space-boss-cv-${i}" width="184" height="184"></canvas>
            </button>
            <button class="space-boss-projectile-btn" onclick="spaceBossPreviewSound('${creature.name}', 'projectile')" aria-label="Play ${projectileLabel} sound" title="Play projectile sound">
              <canvas id="space-boss-proj-cv-${i}" width="72" height="72"></canvas>
            </button>
            <div class="space-boss-name">${creature.name}</div>
            <div class="space-boss-ability">${BOSS_PREVIEW_META[creature.name] || 'BOSS ATTACK'}</div>
            <button class="space-boss-practice" onclick="spaceDebugBoss('${creature.name}')">PRACTICE</button>
          </div>`;
        }).join('')}
      </div>`;
  }

  function drawBoss() {
    // Laser telegraph (charging) and beam (firing)
    if (boss.laserPhase === 'charging') {
      const t = (Date.now() - boss.laserChargeStart) / 700;
      ctx.save();
      ctx.globalAlpha = 0.25 + 0.35 * Math.abs(Math.sin(t * Math.PI * 6));
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(boss.laserX - 3, boss.y, 6, H - boss.y);
      ctx.restore();
    } else if (boss.laserPhase === 'firing') {
      ctx.save();
      ctx.fillStyle = 'rgba(255,80,80,0.85)';
      ctx.fillRect(boss.laserX - 9, boss.y, 18, H - boss.y);
      ctx.fillStyle = '#fff';
      ctx.fillRect(boss.laserX - 3, boss.y, 6, H - boss.y);
      ctx.restore();
    }

    ctx.save();
    ctx.translate(boss.x, boss.y);
    if (boss.isCaptive) {
      ctx.save();
      ctx.translate(0, -boss.r * 0.78 + Math.sin(Date.now() * 0.004) * 2);
      ctx.globalAlpha = 0.9;
      drawGizmoOrb(boss.r * 1.25);
      ctx.restore();
      // Jail cell reskin — same fight underneath, but restyled to match the look
      // of a normal trapped hero (blue square frame + the same rotating pulsing
      // ring) instead of a separate gray jail-bars design.
      ctx.beginPath(); ctx.arc(0, 0, boss.r * 0.95, 0, Math.PI * 2);
      ctx.fillStyle = '#1a1530'; ctx.fill();
      const gc = GAME_CHARS[boss.captiveCi];
      ctx.fillStyle = 'rgba(0,229,255,0.12)';
      ctx.fillRect(-boss.r * 0.95, -boss.r * 0.95, boss.r * 1.9, boss.r * 1.9);
      ctx.strokeStyle = 'rgba(234,255,255,0.72)';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.moveTo(-boss.r * 0.35, -boss.r * 0.95); ctx.lineTo(-boss.r * 0.35, boss.r * 0.95); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(boss.r * 0.35, -boss.r * 0.95); ctx.lineTo(boss.r * 0.35, boss.r * 0.95); ctx.stroke();
      drawCanvasMobe(gc, 'sad', -boss.r * 0.7, -boss.r * 0.7, boss.r * 1.4, boss.r * 1.4, {
        glowColor: 'rgba(0,229,255,0.72)',
        glowBlur: boss.r * 0.2,
      });
      ctx.fillStyle = 'rgba(0,229,255,0.24)';
      ctx.fillRect(-boss.r * 0.7, -boss.r * 0.7, boss.r * 1.4, boss.r * 1.4);
      ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 3;
      ctx.strokeRect(-boss.r * 0.95, -boss.r * 0.95, boss.r * 1.9, boss.r * 1.9);
      const crackProgress = 1 - (boss.hp / boss.maxHp);
      if (crackProgress > 0.22) {
        ctx.strokeStyle = 'rgba(234,255,255,0.86)';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-boss.r * 0.58, -boss.r * 0.72); ctx.lineTo(-boss.r * 0.36, -boss.r * 0.42); ctx.lineTo(-boss.r * 0.5, -boss.r * 0.12); ctx.stroke();
      }
      if (crackProgress > 0.48) {
        ctx.beginPath(); ctx.moveTo(boss.r * 0.52, -boss.r * 0.62); ctx.lineTo(boss.r * 0.28, -boss.r * 0.26); ctx.lineTo(boss.r * 0.44, boss.r * 0.04); ctx.stroke();
      }
      if (crackProgress > 0.72) {
        ctx.beginPath(); ctx.moveTo(-boss.r * 0.1, boss.r * 0.72); ctx.lineTo(boss.r * 0.06, boss.r * 0.38); ctx.lineTo(-boss.r * 0.08, boss.r * 0.12); ctx.lineTo(boss.r * 0.14, -boss.r * 0.08); ctx.stroke();
      }
      // Same blue rescue-target language as the smaller trapped heroes: soft glow,
      // bright inner ring, and orbiting dots. Boss captive still has the square
      // frame, but the thing you shoot now reads exactly like rescue.
      const _bRingR = boss.r * 0.85;
      const _bT = Date.now() * 0.003;
      const _bPulse = 1 + Math.sin(Date.now() * 0.008) * 0.05;
      ctx.save();
      ctx.rotate(_bT);
      ctx.beginPath(); ctx.arc(0, 0, _bRingR * 1.14 * _bPulse, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(90,190,255,0.26)'; ctx.lineWidth = 8; ctx.stroke();
      const _bGrad = ctx.createLinearGradient(-_bRingR, -_bRingR, _bRingR, _bRingR);
      _bGrad.addColorStop(0, '#5ab1ff');
      _bGrad.addColorStop(0.48, '#00e5ff');
      _bGrad.addColorStop(1, '#b9f7ff');
      ctx.beginPath(); ctx.arc(0, 0, _bRingR * 1.02 * _bPulse, 0, Math.PI * 2);
      ctx.strokeStyle = _bGrad; ctx.lineWidth = 2.8; ctx.stroke();
      for (let d = 0; d < 4; d++) {
        const a = (d / 4) * Math.PI * 2 + _bT;
        ctx.fillStyle = d % 2 ? '#eaffff' : '#5ab1ff';
        ctx.beginPath(); ctx.arc(Math.cos(a) * _bRingR * 1.02 * _bPulse, Math.sin(a) * _bRingR * 1.02 * _bPulse, 3.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    } else {
      // No red ring here — unlike a small enemy face, the boss is already unmistakably
      // a threat (its size, name label, and health bar), so the ring was redundant.
      let skipGrayMainDraw = false;
      if (boss.attackType === 'tether') {
        const now = Date.now();
        const grayBaseAlpha = ctx.globalAlpha;
        const ghosting = now < (boss.ghostUntil || 0);
        skipGrayMainDraw = now < (boss.invisibleUntil || 0);
        if (ghosting) {
          const vanishPhase = boss.grayTeleport && !boss.grayTeleport.arrived;
          const g = boss.grayTeleport;
          const travelT = (vanishPhase && g) ? Math.max(0, Math.min(1, (now - g.start) / Math.max(1, g.reappearAt - g.start))) : 1;
          const flick = vanishPhase ? (0.18 + Math.abs(Math.sin(now * 0.075)) * 0.32) : (0.52 + Math.abs(Math.sin(now * 0.045)) * 0.34);
          ctx.globalAlpha *= skipGrayMainDraw ? 0.06 : flick;
          if (vanishPhase && g) {
            // Cyan/purple afterimages along the real travel path, so the movement
            // reads as a ghost crossing the arena rather than a local jitter.
            for (let i = 1; i <= 3; i++) {
              const back = Math.max(0, travelT - i * 0.11);
              const e = back * back * (3 - 2 * back);
              const tx = (g.fromX + (g.toX - g.fromX) * e) - boss.x;
              const ty = (g.fromY + (g.toY - g.fromY) * e + Math.sin(back * Math.PI) * -18) - boss.y;
              ctx.save();
              ctx.globalAlpha *= 0.12 * (4 - i);
              ctx.translate(tx, ty);
              drawThemedBoss(boss.creature, boss.r * 2.05);
              ctx.restore();
            }
          }
          ctx.save();
          ctx.globalAlpha *= vanishPhase ? 0.42 : 0.22;
          ctx.translate(Math.sin(now * 0.07) * 5, Math.cos(now * 0.052) * 3);
          drawThemedBoss(boss.creature, boss.r * 2.05);
          ctx.restore();
          ctx.save();
          ctx.globalAlpha = vanishPhase ? 0.50 : 0.34;
          ctx.strokeStyle = 'rgba(101,240,255,0.55)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(0, 0, boss.r * (1.0 + Math.sin(now * 0.02) * 0.08), 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        ctx.globalAlpha = grayBaseAlpha;
      }
      if (!skipGrayMainDraw) {
        if (boss.isGizmo) {
          drawGizmoOrb(boss.r * 2.1);
        } else {
          drawThemedBoss(boss.creature, boss.r * 2.05);
        }
      }
      if (boss.attackType === 'tether') drawGrayTetherField(boss, Date.now());
      if (boss.guardedRescue && boss.captiveCi >= 0) {
        const gc = GAME_CHARS[boss.captiveCi];
        const t = Date.now() * 0.003;
        const bx = boss.r * 0.72;
        const by = boss.r * 0.76 + Math.sin(t * 2.2) * 2;
        const br = boss.r * 0.42;
        ctx.save();
        ctx.globalAlpha = 0.96;
        ctx.translate(bx, by);
        ctx.beginPath(); ctx.arc(0, 0, br * 1.15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,229,255,0.12)'; ctx.fill();
        ctx.strokeStyle = 'rgba(0,229,255,0.36)'; ctx.lineWidth = 8; ctx.stroke();
        ctx.save();
        ctx.rotate(t * 1.7);
        ctx.beginPath(); ctx.arc(0, 0, br * 1.02, 0, Math.PI * 2);
        ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2.8; ctx.stroke();
        for (let k = 0; k < 4; k++) {
          const a = k * Math.PI / 2 + t * 2;
          ctx.fillStyle = k % 2 ? '#eaffff' : '#5ab1ff';
          ctx.beginPath(); ctx.rect(Math.cos(a) * br - 2.2, Math.sin(a) * br - 2.2, 4.4, 4.4); ctx.fill();
        }
        ctx.restore();
        ctx.beginPath(); ctx.arc(0, 0, br * 0.72, 0, Math.PI * 2);
        ctx.fillStyle = gc.color || '#33d4e0'; ctx.fill();
        drawCanvasMobe(gc, 'sad', -br * 0.7, -br * 0.7, br * 1.4, br * 1.4, {
          glowColor: 'rgba(0,229,255,0.7)',
          glowBlur: br * 0.2,
        });
        ctx.fillStyle = 'rgba(0,229,255,0.22)';
        ctx.beginPath(); ctx.arc(0, 0, br * 0.74, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    if (boss.hitFlash > 0) {
      ctx.globalAlpha = boss.hitFlash;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, boss.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // Name + health bar above the boss
    const barW = boss.r * 2.2, barX = boss.x - barW/2, barY = boss.y - boss.r - 18;
    ctx.font = `bold 13px 'Bebas Neue', cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = boss.isCaptive ? '#00e5ff' : '#ff4444';
    if (!(spaceRunMode === 'bossrun' && !boss.isCaptive)) ctx.fillText(boss.isCaptive ? 'CAPTIVE LOCK' : boss.guardedRescue && boss.captiveCi >= 0 ? `${boss.creature.name} HAS ${GAME_CHARS[boss.captiveCi].name}` : boss.creature.name, boss.x, barY - 6);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(barX, barY, barW, 8);
    ctx.fillStyle = boss.isCaptive ? '#00e5ff' : '#ff4444'; ctx.fillRect(barX, barY, barW * (boss.hp / boss.maxHp), 8);
  }

  function drawMiniBoss() {
    const mb = miniBoss;
    ctx.save();
    ctx.globalAlpha = mb.opacity;
    ctx.translate(mb.x, mb.y);
    if (!drawBossPngImage(mb.creature, mb.r * 1.7)) drawPixelSprite(mb.creature.sprite, mb.creature.palette, 0, 0, mb.r * 1.7);
    if (mb.hitFlash > 0) {
      ctx.globalAlpha = mb.hitFlash;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(0, 0, mb.r, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
    if (mb.phase !== 'active') return; // mid-teleport — no bar, can't be hit yet
    const barW = mb.r * 1.8, barX = mb.x - barW/2, barY = mb.y - mb.r - 14;
    ctx.font = `bold 11px 'Bebas Neue', cursive`; ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = mb.kind === 'ghost' ? '#8855ff' : '#cc99ff';
    ctx.fillText(mb.kind === 'ghost' ? 'GHOST' : 'EMP', mb.x, barY - 5);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(barX, barY, barW, 6);
    ctx.fillStyle = mb.kind === 'ghost' ? '#8855ff' : '#cc99ff'; ctx.fillRect(barX, barY, barW * (mb.hp / mb.maxHp), 6);
  }

  function drawTwin() {
    const gc = GAME_CHARS[activeChar];
    ctx.save();
    ctx.translate(twin.x, twin.y);
    ctx.globalAlpha = 0.85;
    drawCanvasMobe(gc, 'normal', -player.r, -player.r, player.r * 2, player.r * 2, {
      glowColor: 'rgba(255,230,26,0.35)',
      glowBlur: player.r * 0.22,
    });
    ctx.restore();
  }

  // SVG-style drawn shape (no emoji) — a spinning red/orange hazard ball with a
  // warning-stripe pattern, deliberately reading as "dangerous to touch."
  function drawRebound() {
    const t = Date.now() * 0.006;
    ctx.save();
    ctx.translate(rebound.x, rebound.y);
    ctx.rotate(t);
    ctx.beginPath(); ctx.arc(0, 0, rebound.r, 0, Math.PI * 2);
    ctx.fillStyle = '#7a1010'; ctx.fill();
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, rebound.r, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = '#ff4444';
    for (let i = 0; i < 6; i++) {
      ctx.save(); ctx.rotate((i / 6) * Math.PI * 2);
      ctx.fillRect(-rebound.r, -2, rebound.r * 2, 4);
      ctx.restore();
    }
    ctx.restore();
    ctx.strokeStyle = '#ffaa55'; ctx.lineWidth = 2; ctx.stroke();
    ctx.restore();
  }

  function drawEscort() {
    const gc = GAME_CHARS[escort.ci];
    ctx.save();
    ctx.globalAlpha = Math.max(0, escort.opacity);
    ctx.translate(escort.x, escort.y);
    // Green dashed ring — same "this is friendly, not a threat" color language as the
    // cyan rescue ring elsewhere, so it never reads as something to shoot.
    ctx.beginPath(); ctx.arc(0, 0, 21, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(51,255,102,0.4)'; ctx.lineWidth = 4; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 19, 0, Math.PI*2);
    ctx.strokeStyle = '#33ff66'; ctx.lineWidth = 2; ctx.setLineDash([4,3]); ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.arc(0, 0, 16, 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI*2);
    ctx.fillStyle = gc.color; ctx.fill();
    drawCanvasMobe(gc, 'happy', -12, -12, 24, 24, {
      glowColor: 'rgba(51,255,102,0.45)',
      glowBlur: 6,
    });
    ctx.restore();
  }

  function drawChunkShard(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.fillStyle = p.c;
    ctx.beginPath();
    const sides = p.sides || 4;
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const rr = p.r * (i % 2 ? 0.72 : 1);
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr * (p.flat || 0.86);
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = Math.max(1, p.r * 0.18);
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.stroke();
    ctx.restore();
  }

  function drawJaggedBurstRing(x, y, r, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath();
    const pts = 16;
    for (let i = 0; i <= pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const rr = r * (i % 2 ? 0.78 : 1.05);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.stroke();
    ctx.restore();
  }

  function miniExplosion(x, y, color) {
    const parts = Array.from({length: 14}, () => ({
      x, y,
      c: Math.random() < 0.3 ? '#ffe61a' : color,
      vx: (Math.random() - 0.5) * 12,
      vy: (Math.random() - 0.5) * 12,
      r: 4 + Math.random() * 8,
      a: 1,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.24,
      sides: Math.random() < 0.45 ? 4 : 5,
      flat: 0.65 + Math.random() * 0.35,
    }));
    let age = 0;
    function tick() {
      age++;
      parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.16; p.rot += p.vr; p.a -= 0.058; p.r *= 0.965; });
      if (ctx && parts[0].a > 0) {
        ctx.save();
        if (age < 9) drawJaggedBurstRing(x, y, 8 + age * 3.4, color, 0.5 - age * 0.045);
        parts.forEach(p => {
          if (p.a <= 0) return;
          ctx.globalAlpha = p.a;
          drawChunkShard(p);
        });
        ctx.globalAlpha = 1;
        ctx.restore();
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  }

  function bigExplosion(x, y, color) {
    triggerShake(7);
    const parts = Array.from({length: 26}, () => ({
      x, y, c: Math.random() < 0.35 ? '#ffe61a' : color,
      vx: (Math.random() - 0.5) * 20,
      vy: (Math.random() - 0.5) * 20,
      r: 7 + Math.random() * 15,
      a: 1,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.2,
      sides: Math.random() < 0.4 ? 4 : 6,
      flat: 0.58 + Math.random() * 0.38,
    }));
    let age = 0;
    function tick() {
      age++;
      parts.forEach(p => { p.x += p.vx; p.y += p.vy; p.vy += 0.13; p.rot += p.vr; p.a -= 0.035; p.r *= 0.955; });
      if (ctx && parts[0].a > 0) {
        ctx.save();
        if (age < 14) {
          drawJaggedBurstRing(x, y, 16 + age * 5.4, '#ffe61a', 0.52 - age * 0.032);
          drawJaggedBurstRing(x, y, 7 + age * 3.1, color, 0.44 - age * 0.028);
        }
        parts.forEach(p => {
          if (p.a <= 0) return;
          ctx.globalAlpha = p.a;
          drawChunkShard(p);
        });
        ctx.globalAlpha = 1;
        ctx.restore();
        requestAnimationFrame(tick);
      }
    }
    requestAnimationFrame(tick);
  }

  function faceFlash(ci, mood, x, y) {
    const gc = GAME_CHARS[ci];
    const imgSrc = mood === 'happy' ? gc.imgHappy : gc.imgSad;
    const img = _getImg(imgSrc);
    let a = 1.0, size = 52;
    function tick() {
      a -= 0.038; size += 0.6;
      if (!ctx || a <= 0) return;
      ctx.save();
      ctx.globalAlpha = a;
      if (img && img.complete && img.naturalWidth) {
        ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
      } else {
        ctx.font = `${Math.round(size * 0.7)}px serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(mood === 'happy' ? gc.happy : gc.sad, x, y);
      }
      ctx.restore();
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function spaceModeButtonHTML(label, detail, onclick, color, glyph) {
    return `<button class="whack-btn" style="width:100%;min-height:46px;display:flex;align-items:center;justify-content:space-between;gap:12px;border-color:${color};background:${color}14;font-size:14px;letter-spacing:2.6px;padding:8px 14px;text-align:left;box-shadow:inset 0 0 18px ${color}10" onclick="${onclick}">
      <span style="display:flex;align-items:center;gap:10px;min-width:0"><span style="font-size:17px;line-height:1;color:#f2efe8">${glyph || '▶'}</span><span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</span></span>
      <span style="font-family:'VCR',monospace;font-size:8px;letter-spacing:1.1px;color:rgba(242,239,232,0.46);line-height:1.25;text-align:right;white-space:nowrap">${detail}</span>
    </button>`;
  }

  function spaceInfoRowHTML(glyph, title, detail, color) {
    // glyph is either a literal character (legacy) or a path to one of the same
    // PNG icons live gameplay actually uses (projectiles/...) — the latter
    // renders as an <img> instead of text so HOW TO PLAY matches the real game.
    const isImg = typeof glyph === 'string' && glyph.indexOf('/') !== -1;
    const iconHTML = isImg
      ? `<img src="${glyph}" alt="" style="width:22px;height:22px;object-fit:contain;filter:drop-shadow(0 0 4px ${color}aa)">`
      : glyph;
    return `<div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid rgba(242,239,232,0.07)">
      <div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;border:1px solid ${color}66;border-radius:8px;background:${color}18;color:${color};font-size:18px;flex-shrink:0">${iconHTML}</div>
      <div style="text-align:left"><div style="font-family:'Bebas Neue',cursive;font-size:19px;letter-spacing:2.4px;color:${color};line-height:1">${title}</div><div style="font-family:'VCR',monospace;font-size:10px;letter-spacing:1px;color:rgba(242,239,232,0.55);line-height:1.35;margin-top:3px">${detail}</div></div>
    </div>`;
  }

  function spaceHowToPlayHTML() {
    return `<div class="whack-mode-shell" style="max-width:430px;margin-top:18px;text-align:center">
      <div class="whack-mode-title" style="color:#00e5ff;text-shadow:0 0 16px #00e5ff88">HOW TO PLAY</div>
      <div class="game-card whack-mode-card" style="border-color:#00e5ff77;cursor:default;min-height:0;padding:18px;background:rgba(5,2,18,0.94)">
        ${spaceInfoRowHTML('projectiles/lightning.png', 'LIGHTNING', 'Stores rapid fire in the left socket.', '#ffe61a')}
        ${spaceInfoRowHTML('projectiles/shield.png', 'SHIELD', 'Blocks damage when deployed.', '#00e5ff')}
        ${spaceInfoRowHTML('projectiles/bomb.png', 'BOMB', 'Clears danger around the ship.', '#ff8800')}
        ${spaceInfoRowHTML('projectiles/mystery_crate.png', 'MYSTERY CRATE', 'Shoot it open. It can help or hurt.', '#cc66ff')}
        ${spaceInfoRowHTML('projectiles/blue_bone.png', 'CAPTIVE LOCK', 'Break the blue ring to rescue the Mobe.', '#5ab1ff')}
        <button class="whack-btn" style="width:100%;border-color:#00e5ff;background:rgba(0,229,255,0.16);margin-top:14px" onclick="showSpaceOverlay('select')">BACK</button>
      </div>
    </div>`;
  }

  function spaceDebugHTML() {
    return `<div class="whack-mode-shell" style="max-width:440px;margin-top:18px;text-align:center">
      <div class="whack-mode-title" style="color:#ffe61a;text-shadow:0 0 16px #ffe61a88">DEBUG</div>
      <div class="game-card whack-mode-card" style="border-color:#ffe61a77;cursor:default;min-height:0;padding:16px;background:rgba(5,2,18,0.94)">
        <div style="font-family:'VCR',monospace;font-size:10px;letter-spacing:1.5px;color:rgba(242,239,232,0.5);margin-bottom:12px">TEMPORARY TEST JUMPS</div>
        <div class="space-debug-row" aria-label="Space campaign wave debug jumps 1 through 7">
          <button class="space-debug-chip" onclick="spaceDebugJump(1)">W1 AST</button><button class="space-debug-chip" onclick="spaceDebugJump(2)">W2 RED</button><button class="space-debug-chip" onclick="spaceDebugJump(3)">W3 RAIN</button><button class="space-debug-chip" onclick="spaceDebugJump(4)">W4 OGRE</button><button class="space-debug-chip" onclick="spaceDebugJump(5)">W5 SWARM</button><button class="space-debug-chip" onclick="spaceDebugJump(6)">W6 RESCUE</button><button class="space-debug-chip" onclick="spaceDebugJump(7)">W7 KNIGHT</button>
        </div>
        <div class="space-debug-row" aria-label="Space campaign wave debug jumps 8 through 13">
          <button class="space-debug-chip" onclick="spaceDebugJump(8)">W8 BLACKOUT</button><button class="space-debug-chip" onclick="spaceDebugJump(9)">W9 BOSS</button><button class="space-debug-chip" onclick="spaceDebugJump(10)">W10 MUSIC</button><button class="space-debug-chip" onclick="spaceDebugJump(11)">W11 BOSS</button><button class="space-debug-chip" onclick="spaceDebugJump(12)">W12 PREP</button><button class="space-debug-chip" onclick="spaceDebugJump(13)">W13 FINAL</button>
        </div>
        <div class="space-debug-row" aria-label="Space boss playtests">
          <button class="space-debug-chip" onclick="spaceDebugBoss('STAR OGRE')">OGRE</button><button class="space-debug-chip" onclick="spaceDebugBoss('SKY DRAGON')">DRAGON</button><button class="space-debug-chip" onclick="spaceDebugBoss('DARK KNIGHT')">KNIGHT</button><button class="space-debug-chip" onclick="spaceDebugBoss('GRAY VISITOR')">VISITOR</button><button class="space-debug-chip" onclick="spaceDebugBoss('SPACE SHARK')">SHARK</button><button class="space-debug-chip" onclick="spaceDebugBoss('MEAN TACO')">TACO</button><button class="space-debug-chip" onclick="spaceDebugBoss('COSMIC OCTO')">OCTO</button><button class="space-debug-chip" onclick="spaceDebugBoss('GIZMO')">GIZMO</button>
        </div>
        <button class="whack-btn" style="width:100%;border-color:#ffe61a;background:rgba(255,230,26,0.16);margin-top:14px" onclick="showSpaceOverlay('select')">BACK</button>
      </div>
    </div>`;
  }

  function spaceModeCompleteHTML(title, detail, color) {
    return `<div class="whack-mode-shell" style="max-width:430px;margin-top:22px;text-align:center">
      <div class="whack-mode-title" style="color:${color};text-shadow:0 0 18px ${color}88">${title}</div>
      <div class="game-card whack-mode-card" style="border-color:${color}77;cursor:default;min-height:0;padding:20px 18px;background:rgba(5,2,18,0.92)">
        <div style="font-family:'Bebas Neue',cursive;font-size:38px;letter-spacing:5px;line-height:1;color:#f2efe8;margin-bottom:10px">${detail}</div>
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:rgba(242,239,232,0.45);margin-bottom:18px">SCORE ${score}</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button class="whack-btn" style="border-color:#ffe61a;background:rgba(255,230,26,0.24)" onclick="spaceBossRunStart()">BOSS RUN AGAIN</button>
          <button class="whack-btn" style="border-color:#33ff66;background:rgba(51,255,102,0.30)" onclick="spaceStart()">PLAY CAMPAIGN</button>
          <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="spaceEndlessStart()">ENDLESS</button>
          <button class="whack-btn" style="border-color:#7b61ff;background:rgba(123,97,255,0.22)" onclick="showSpaceOverlay('select')">BACK TO SPACE MENU</button>
          <button class="whack-btn" style="border-color:rgba(242,239,232,0.35);background:rgba(242,239,232,0.08)" onclick="nav('lobby')">BACK TO ARCADE</button>
        </div>
      </div>
    </div>`;
  }

  function completeSpaceCampaign() {
    spaceRunMode = 'campaign';
    state = 'complete';
    clearSpaceRuntimeTimers();
    clearSpaceBonusObjects();
    clearSpaceCinematicOverlays();
    rescueBanner = null;
    topBanner = null;
    cancelAnimationFrame(raf);
    const ov = document.getElementById('space-overlay');
    if (!ov) return;
    document.body.classList.add('arcade-selection-open');
    ov.classList.remove('hidden', 'space-over', 'space-boss-preview');
    ov.style.justifyContent = '';
    ov.style.paddingTop = '';
    setArcadeExitVisible(true);
    const total = missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT;
    const rescued = Math.min(total, rescuedChars.size);
    ov.innerHTML = `
      <div class="whack-mode-shell" style="max-width:430px;margin-top:22px;text-align:center">
        <div class="whack-mode-title" style="color:#33ff66;text-shadow:0 0 18px #33ff6688">MISSION COMPLETE!</div>
        <div class="game-card whack-mode-card" style="border-color:#33ff6677;cursor:default;min-height:0;padding:20px 18px;background:rgba(5,2,18,0.92)">
          <div style="font-family:'Bebas Neue',cursive;font-size:40px;letter-spacing:5px;line-height:1;color:#f2efe8;margin-bottom:8px">GIZMO DEFEATED</div>
          <div style="font-family:'VCR',monospace;font-size:12px;letter-spacing:2px;color:rgba(242,239,232,0.65);margin-bottom:14px">MOBES RESCUED</div>
          <div style="font-family:'Bebas Neue',cursive;font-size:58px;letter-spacing:6px;line-height:1;color:#33ff66;text-shadow:0 0 18px #33ff6688;margin-bottom:16px">${rescued}/${total}</div>
          <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:rgba(242,239,232,0.45);margin-bottom:18px">SCORE ${score}</div>
          <div style="display:flex;flex-direction:column;gap:10px">
            <button class="whack-btn" style="border-color:#33ff66;background:rgba(51,255,102,0.30)" onclick="spaceStart()">PLAY CAMPAIGN AGAIN</button>
            <button class="whack-btn" style="border-color:#00e5ff;background:rgba(0,229,255,0.22)" onclick="spaceAcademyStart()">SPACE TUTORIAL</button>
            <button class="whack-btn" style="border-color:#ffe61a;background:rgba(255,230,26,0.20)" onclick="spaceBossRunStart()">BOSS RUN</button>
            <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="spaceEndlessStart()">ENDLESS</button>
            <button class="whack-btn" style="border-color:rgba(242,239,232,0.35);background:rgba(242,239,232,0.08)" onclick="nav('lobby')">BACK TO ARCADE</button>
          </div>
        </div>
      </div>`;
  }

  function showSpaceOverlay(mode) {
    try { if (mode === 'select' && !ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start(); } catch(e){}
    document.body.classList.toggle('arcade-selection-open', mode === 'select' || mode === 'boss-preview' || mode === 'how-to-play' || mode === 'debug' || mode === 'mode-complete');
    if (mode === 'select' || mode === 'boss-preview' || mode === 'how-to-play' || mode === 'debug' || mode === 'mode-complete') {
      if (typeof window.initArcadeFloat === 'function') window.initArcadeFloat(true);
    }
    const ov=document.getElementById('space-overlay');
    if(!ov) return;
    if (mode === 'select' || mode === 'boss-preview' || mode === 'how-to-play' || mode === 'debug' || mode === 'mode-complete') ov.classList.remove('hidden');
    ov.classList.toggle('space-over', mode === 'over');
    ov.classList.toggle('space-boss-preview', mode === 'boss-preview');
    ov.style.justifyContent = (mode === 'select' || mode === 'boss-preview' || mode === 'how-to-play' || mode === 'debug' || mode === 'mode-complete') ? 'flex-start' : '';
    ov.style.paddingTop = (mode === 'select' || mode === 'how-to-play' || mode === 'debug' || mode === 'mode-complete') ? '16px' : '';
    setArcadeExitVisible(mode !== 'over');
    if(mode==='select'){
      const gc=GAME_CHARS[activeChar];
      ov.innerHTML=`
        <div class="whack-mode-shell" style="max-width:410px;margin-top:10px;padding:0 10px;box-sizing:border-box">
          <div class="whack-mode-title">SPACE MOBE</div>
          <div class="game-card whack-mode-card" style="border-color:#33ff6677;cursor:default;min-height:0;overflow:hidden">
            <div class="game-card-art" style="background:#20222c;min-height:128px">
              <div id="space-select-art" style="position:absolute;inset:0;z-index:0;opacity:0.42;transform:scale(1.26) translateY(10px);filter:saturate(1.18) brightness(1.02);pointer-events:none;mix-blend-mode:screen"></div>
            </div>
            <div class="game-card-info" style="position:relative;z-index:2;padding:16px 18px 20px;background:linear-gradient(to top, rgba(5,2,18,0.97) 78%, rgba(32,34,44,0.34) 100%)">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;margin-bottom:12px;padding:12px 14px;border:1px solid rgba(242,239,232,0.12);border-radius:16px;background:linear-gradient(135deg,rgba(72,74,84,0.34),rgba(18,20,30,0.28));box-shadow:inset 0 0 22px rgba(255,255,255,0.035),0 0 18px rgba(0,0,0,0.14);backdrop-filter:blur(2px)">
                <div style="display:flex;align-items:center;gap:14px;min-width:0">
                  <div style="width:96px;height:96px;flex-shrink:0;border-radius:50%;background:radial-gradient(circle at 50% 42%,rgba(242,239,232,0.28),rgba(46,48,58,0.72) 62%,rgba(13,16,24,0.84));display:flex;align-items:center;justify-content:center;border:3px solid ${gc.color}cc;box-shadow:0 0 26px ${gc.color}88,0 0 42px ${gc.color}33,inset 0 0 28px rgba(255,255,255,0.08)">
                    <div class="char-tilt" style="width:72px;height:72px;filter:drop-shadow(0 0 10px ${gc.color}66)">${charFace(gc,'normal')}</div>
                  </div>
                  <div style="text-align:left;min-width:0;position:relative">
                    <div style="position:absolute;left:-8px;right:-20px;top:22px;height:44px;border-radius:999px;background:radial-gradient(ellipse at 36% 50%,${gc.color}44,${gc.color}1c 44%,transparent 72%);filter:blur(7px);pointer-events:none"></div>
                    <div style="font-size:10px;letter-spacing:2.2px;color:rgba(242,239,232,0.82);font-family:'VCR',monospace;text-shadow:0 0 10px rgba(255,255,255,0.18)">TODAY'S PILOT</div>
                    <div style="position:relative;font-family:'Bebas Neue',cursive;font-size:44px;letter-spacing:3.5px;color:${gc.color};text-shadow:0 0 10px ${gc.color}cc,0 1px 0 rgba(255,255,255,0.22);line-height:0.98;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px">${gc.name}</div>
                  </div>
                </div>
                <div class="space-select-icon-col">
                  <button class="space-select-icon-btn" onclick="showSpaceOverlay('how-to-play')" aria-label="How to play" title="How to play" style="color:#00e5ff">ⓘ</button>
                  <button class="space-select-icon-btn" onclick="showSpaceOverlay('boss-preview')" aria-label="Bosses" title="Bosses" style="color:#33ff66"><img src="bosses/boss_gizmo.png" alt="" style="width:24px;height:24px;object-fit:contain;filter:drop-shadow(0 0 4px #33ff66aa)"></button>
                  <button class="space-select-icon-btn" onclick="showSpaceOverlay('debug')" aria-label="Debug" title="Debug" style="color:#ffe61a">⚙</button>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:8px">
                <div class="space-select-group-label">LEARN</div>
                ${spaceModeButtonHTML('SPACE TUTORIAL', 'SAFE LESSONS', 'spaceAcademyStart()', '#7b61ff', '★')}
                <div class="space-select-group-label" style="margin-top:6px">PLAY</div>
                ${spaceModeButtonHTML('PLAY CAMPAIGN', '13 WAVES / 6 RESCUES', 'spaceStart()', '#33ff66', '▶')}
                ${spaceModeButtonHTML('BOSS RUN', 'BOSSES ONLY', 'spaceBossRunStart()', '#ffe61a', '☠')}
                ${spaceModeButtonHTML('ENDLESS', 'CHAOS MODE', 'spaceEndlessStart()', '#ff00cc', '∞')}
              </div>
            </div>
          </div>
        </div>`;
      mountSelectionArt('space-select-art', 'space');
    } else if(mode==='boss-preview'){
      ov.innerHTML = bossPreviewHTML();
      startSpaceBossPreviewAnimation();
    } else if(mode==='how-to-play'){
      ov.innerHTML = spaceHowToPlayHTML();
    } else if(mode==='debug'){
      ov.innerHTML = spaceDebugHTML();
    } else if(mode==='mode-complete'){
      const boardKey = 'space-bossrun';
      const uid = 'space-bossrun-complete';
      const defeated = Math.max(bossRunQueue.length || 0, bossRunIndex || 0);
      ov.innerHTML = buildArcadeResultCard({
        uid,
        boardKey,
        artGame: 'space',
        color: '#ffe61a',
        marquee: 'BOSS RUN COMPLETE!',
        marqueeEnd: '#665500',
        scoreLabel: 'BOSSES DEFEATED',
        scoreValue: defeated,
        saveValue: defeated,
        field: 'bosses',
        extra: `${defeated}/${bossRunQueue.length || 8} BOSSES DEFEATED / SCORE ${score}`,
        ascending: false,
        maxWidth: 430,
        minHeight: 300,
        saveMarginTop: 18,
        buttons: `
          <button class="whack-btn" style="width:100%;min-height:50px;white-space:nowrap;display:flex;align-items:center;justify-content:center;text-align:center;border-color:#ffe61a;background:rgba(255,230,26,0.24)" onclick="spaceBossRunStart()">BOSS RUN AGAIN</button>
          <button class="whack-btn" style="width:100%;min-height:50px;white-space:nowrap;display:flex;align-items:center;justify-content:center;text-align:center;border-color:#33ff66;background:rgba(51,255,102,0.30)" onclick="spaceStart()">PLAY CAMPAIGN</button>
          <button class="whack-btn" style="width:100%;min-height:50px;white-space:nowrap;display:flex;align-items:center;justify-content:center;text-align:center;border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="spaceEndlessStart()">ENDLESS</button>
          <button class="whack-btn" style="width:100%;min-height:50px;white-space:nowrap;display:flex;align-items:center;justify-content:center;text-align:center;border-color:#7b61ff;background:rgba(123,97,255,0.22)" onclick="showSpaceOverlay('select')">BACK TO SPACE MENU</button>
          <button class="whack-btn" style="width:100%;min-height:50px;white-space:nowrap;display:flex;align-items:center;justify-content:center;text-align:center;border-color:rgba(242,239,232,0.35);background:rgba(242,239,232,0.08)" onclick="nav('lobby')">BACK TO ARCADE</button>
        `,
      });
      loadRemoteBoard(boardKey, `${uid}-board`, '#ffe61a', 'bosses');
      mountSelectionArt(`${uid}-art`, 'space');
    } else if(mode==='over'){
      setArcadeExitVisible(false);
      // Clear stale launch/select markup immediately; otherwise it can flash between
      // the in-game mission-failed beat and the leaderboard game-over card.
      ov.innerHTML = '';
      ov.classList.remove('hidden');
      const boardKey = getSpaceLeaderboardKey();
      const field = getSpaceResultField();
      const resultValue = getSpaceResultValue();
      const modeName = spaceLeaderboardMode() || 'campaign';
      const uid = `space-${modeName}`;
      const isNew=resultValue>=parseInt(localStorage.getItem(getSpaceBestKey())||'0');
      showMissionFailedBeat(() => {
        ov.innerHTML = buildArcadeResultCard({
          uid,
          boardKey,
          artGame: 'space',
          color: '#33ff66',
          marquee: isNew && resultValue > 0 ? 'GAME OVER' : 'GAME OVER',
          marqueeEnd: '#006622',
          scoreLabel: getSpaceResultLabel(),
          scoreValue: resultValue,
          saveValue: resultValue,
          field,
          extra: getSpaceResultExtraLine(),
          ascending: false,
          maxWidth: 430,
          minHeight: 220,
          saveMarginTop: 18,
          buttons: `
            ${spaceLeaderboardMode() === 'bossrun' ? `<button class="whack-btn" style="width:100%;min-height:50px;white-space:nowrap;display:flex;align-items:center;justify-content:center;text-align:center;border-color:#ffe61a;background:rgba(255,230,26,0.24)" onclick="spaceBossRunStart()">BOSS RUN AGAIN</button>` : spaceLeaderboardMode() === 'endless' ? `<button class="whack-btn" style="width:100%;min-height:50px;white-space:nowrap;display:flex;align-items:center;justify-content:center;text-align:center;border-color:#ff00cc;background:rgba(255,0,204,0.26)" onclick="spaceEndlessStart()">ENDLESS AGAIN</button>` : `<button class="whack-btn" style="width:100%;min-height:50px;white-space:nowrap;display:flex;align-items:center;justify-content:center;text-align:center;border-color:#33ff66;background:rgba(51,255,102,0.30)" onclick="spaceStart()">PLAY CAMPAIGN AGAIN</button>`}
            <button class="whack-btn" style="width:100%;min-height:50px;white-space:nowrap;display:flex;align-items:center;justify-content:center;text-align:center;border-color:#7b61ff;background:rgba(123,97,255,0.22)" onclick="showSpaceOverlay('select')">BACK TO SPACE MENU</button>
            <button class="whack-btn" style="width:100%;min-height:50px;white-space:nowrap;display:flex;align-items:center;justify-content:center;text-align:center;border-color:#ff00cc;background:rgba(255,0,204,0.24)" onclick="nav('lobby')">BACK TO ARCADE</button>
          `,
        });
        loadRemoteBoard(boardKey, `${uid}-board`, '#33ff66', field);
        mountSelectionArt(`${uid}-art`, 'space');
      });
    }
    ov.classList.remove('hidden');
  }
  window.showSpaceOverlay = showSpaceOverlay;

  // Desktop arrow key support
  document.addEventListener('keydown', e => {
    if (!document.getElementById('pg-space')?.classList.contains('active')) return;
    if (e.key==='ArrowLeft'||e.key==='a'||e.key==='A')  { leftHeld=true;  e.preventDefault(); }
    if (e.key==='ArrowRight'||e.key==='d'||e.key==='D') { rightHeld=true; e.preventDefault(); }
  });
  document.addEventListener('keyup', e => {
    if (e.key==='ArrowLeft'||e.key==='a'||e.key==='A')  leftHeld=false;
    if (e.key==='ArrowRight'||e.key==='d'||e.key==='D') rightHeld=false;
  });
  window.spaceShoot=function(){
    if(state!=='playing')return;
    bullets.push({x:player.x,y:player.y-player.r*1.2,vy:-B_SPEED});
    playNormalInstrumentSfx('blaster');
  };
  // ── First-time intro ── same font/color/size/timing as Whack's objective text
  // (Bebas Neue, #00e5ff, 40px, 3000ms holds) — this is a separate IIFE from Whack's,
  // so those helpers aren't reachable here and get a small mirrored copy instead.
  // No grid to anchor to like Whack's intro does, so headlines anchor to a fixed
  // viewport percentage instead — same idea as Whack's introObjectiveHTML: every
  // beat's headline sits at the exact same Y regardless of how tall that beat's demo
  // content is, instead of flex-centering the pair as one variable-height group.
  function spIntroHeadline(text, size) {
    const color = '#00e5ff';
    return `<div style="font-family:'Bebas Neue',cursive;font-size:${size||40}px;letter-spacing:3px;color:${color};text-shadow:0 0 20px ${color},0 0 40px ${color}66;text-align:center;line-height:1.2">${text}</div>`;
  }
  const SP_INTRO_Y = '38%';
  function spIntroObjectiveHTML(text, contentHTML) {
    return `<div style="position:absolute;top:${SP_INTRO_Y};left:50%;width:100%;transform:translate(-50%,-50%)">${spIntroHeadline(text)}</div>` +
      (contentHTML ? `<div style="position:absolute;top:calc(${SP_INTRO_Y} + 70px);left:50%;transform:translateX(-50%)">${contentHTML}</div>` : '');
  }
  function spMakeIntroOverlay() {
    const ann = document.createElement('div');
    ann.className = 'space-intro-overlay';
    ann.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;pointer-events:none;background:rgba(5,2,18,0.92)';
    document.body.appendChild(ann);
    return ann;
  }
  function spEnsureIntroSkipButton(overlay, onSkip) {
    if (!overlay || !onSkip || overlay.querySelector('.intro-skip-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'intro-skip-btn';
    btn.textContent = 'SKIP TUTORIAL';
    btn.style.cssText = "position:fixed;bottom:max(14px, env(safe-area-inset-bottom, 14px));left:50%;transform:translateX(-50%);z-index:10000;pointer-events:auto;height:32px;min-height:32px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;font-family:'VCR',monospace;font-size:10px;letter-spacing:2px;background:none;border:1px solid rgba(242,239,232,0.2);border-radius:6px;padding:0 12px;color:rgba(242,239,232,0.45);opacity:0.7;cursor:pointer";
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSkip();
    };
    overlay.appendChild(btn);
  }
  function spPlayIntroSteps(steps, onComplete, onSkip) {
    let i = 0;
    let timeoutId = null;
    let done = false;
    const ann = steps._ann;
    function cancel() {
      if (done) return;
      done = true;
      if (timeoutId) clearTimeout(timeoutId);
    }
    function finish() {
      if (done) return;
      done = true;
      if (timeoutId) clearTimeout(timeoutId);
      onComplete();
    }
    function tick() {
      if (done || !document.body.contains(ann)) return; // overlay was torn down — bail cleanly
      if (i >= steps.length) { finish(); return; }
      const step = steps[i++];
      step.show();
      spEnsureIntroSkipButton(ann, onSkip);
      timeoutId = setTimeout(tick, step.duration);
    }
    tick();
    return { cancel, finish };
  }

  function spaceIntroSteps(onDone) {
    const ann = spMakeIntroOverlay();
    let ctrl = null;
    const skipIntro = () => {
      if (ctrl) ctrl.cancel();
      ann.remove();
      onDone();
    };
    const steps = [
      { duration: 3000, show: () => {
        ann.innerHTML = spIntroObjectiveHTML('SHOOT ENEMIES AND ASTEROIDS',
          `<div style="display:flex;gap:28px;align-items:flex-start">
            <div style="position:relative;width:46px;height:90px">
              <div id="sp-intro-rock" style="position:absolute;top:0;left:0;width:46px;height:46px;background:linear-gradient(135deg,#8b7fa3 0 23%,#5c526c 23% 58%,#362f42 58%);clip-path:polygon(48% 0,84% 12%,100% 46%,82% 84%,42% 100%,8% 74%,0 34%,18% 8%);box-shadow:0 0 0 4px #241f2d,0 0 0 6px #8b7fa3"></div>
              <div id="sp-intro-bullet1" style="position:absolute;left:21px;top:84px;width:4px;height:14px;background:#fff;border-radius:2px;box-shadow:0 0 6px #fff;transition:top 0.35s linear"></div>
            </div>
            <div style="position:relative;width:46px;height:90px">
              <div id="sp-intro-ring" style="position:absolute;top:2px;left:2px;width:42px;height:42px">
                <div style="position:absolute;top:0;left:0;width:10px;height:10px;border-top:2.5px solid #ff4444;border-left:2.5px solid #ff4444"></div>
                <div style="position:absolute;top:0;right:0;width:10px;height:10px;border-top:2.5px solid #ff4444;border-right:2.5px solid #ff4444"></div>
                <div style="position:absolute;bottom:0;left:0;width:10px;height:10px;border-bottom:2.5px solid #ff4444;border-left:2.5px solid #ff4444"></div>
                <div style="position:absolute;bottom:0;right:0;width:10px;height:10px;border-bottom:2.5px solid #ff4444;border-right:2.5px solid #ff4444"></div>
              </div>
              <div id="sp-intro-enemy" style="position:absolute;top:6px;left:6px;width:34px;height:34px;border-radius:50%;background:#cc44ff"></div>
              <div id="sp-intro-bullet2" style="position:absolute;left:21px;top:84px;width:4px;height:14px;background:#fff;border-radius:2px;box-shadow:0 0 6px #fff;transition:top 0.35s linear"></div>
            </div>
          </div>`);
        // Bullets travel up to meet each target before it bursts — shooting causes
        // the destruction, rather than the shapes just vanishing on a timer.
        setTimeout(() => {
          const b1 = document.getElementById('sp-intro-bullet1'), b2 = document.getElementById('sp-intro-bullet2');
          if (b1) b1.style.top = '40px';
          if (b2) b2.style.top = '40px';
          playNormalInstrumentSfx('blaster');
        }, 700);
        setTimeout(() => {
          const rock = document.getElementById('sp-intro-rock'), enemy = document.getElementById('sp-intro-enemy');
          const ring = document.getElementById('sp-intro-ring');
          const b1 = document.getElementById('sp-intro-bullet1'), b2 = document.getElementById('sp-intro-bullet2');
          [rock, enemy].forEach(el => {
            if (!el) return;
            const rect = el.getBoundingClientRect();
            spIntroBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
          });
          [rock, enemy, ring, b1, b2].forEach(el => { if (el) el.style.opacity = '0'; });
          SFX.hit && SFX.hit();
        }, 1050);
      }},
      { duration: 3000, show: () => {
        ann.innerHTML = spIntroObjectiveHTML('BEFORE THEY CROSS THE LINE',
          `<div id="sp-intro-line-wrap" style="position:relative;width:140px;height:90px">
            <div style="position:absolute;bottom:14px;left:0;width:100%;height:0;border-top:2px dashed rgba(51,255,100,0.7)"></div>
            <div id="sp-intro-rock2" style="position:absolute;top:0;left:50%;transform:translateX(-50%);width:40px;height:40px;background:linear-gradient(135deg,#8b7fa3 0 22%,#5c526c 22% 60%,#362f42 60%);clip-path:polygon(48% 0,84% 12%,100% 46%,82% 84%,42% 100%,8% 74%,0 34%,18% 8%);box-shadow:0 0 0 4px #241f2d,0 0 0 6px #8b7fa3;transition:top 0.9s ease-in"></div>
            <div id="sp-intro-dmg" style="position:absolute;bottom:18px;left:50%;transform:translateX(-50%) translateY(0);font-family:'Bebas Neue',cursive;font-size:24px;color:#ff4444;text-shadow:0 0 10px #ff4444;opacity:0;transition:opacity 0.2s,transform 0.4s">-10</div>
          </div>`);
        // Asteroid falls all the way to the line and actually hits it — the danger
        // isn't "it disappears," it's "it costs you health if you let it get there."
        setTimeout(() => {
          const rock = document.getElementById('sp-intro-rock2');
          if (rock) rock.style.top = '36px';
        }, 300);
        setTimeout(() => {
          const rock = document.getElementById('sp-intro-rock2'), wrap = document.getElementById('sp-intro-line-wrap'), dmg = document.getElementById('sp-intro-dmg');
          if (rock) {
            const rect = rock.getBoundingClientRect();
            spIntroBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
            rock.style.opacity = '0';
          }
          if (dmg) { dmg.style.opacity = '1'; dmg.style.transform = 'translateX(-50%) translateY(-14px)'; }
          SFX.miss && SFX.miss();
          if (wrap) {
            wrap.style.transition = 'transform 0.08s';
            wrap.style.transform = 'translateX(-4px)';
            setTimeout(() => { wrap.style.transform = 'translateX(4px)'; }, 80);
            setTimeout(() => { wrap.style.transform = 'translateX(0)'; }, 160);
          }
        }, 1200);
      }},
      { duration: 3000, show: () => {
        ann.innerHTML = spIntroObjectiveHTML('RESCUE HEROES',
          `<div style="position:relative;width:80px;height:140px">
            <div id="sp-intro-hero-wrap" style="position:absolute;top:0;width:80px;height:80px;display:flex;align-items:center;justify-content:center">
              <div style="position:absolute;left:13px;top:13px;width:54px;height:54px;border:3px solid #00e5ff;background:rgba(0,229,255,0.12);box-shadow:0 0 18px rgba(0,229,255,0.5)">
                <div style="position:absolute;inset:0;background:rgba(0,229,255,0.22)"></div>
                <div style="position:absolute;top:0;bottom:0;left:17px;width:2px;background:rgba(234,255,255,0.78)"></div>
                <div style="position:absolute;top:0;bottom:0;right:17px;width:2px;background:rgba(234,255,255,0.78)"></div>
              </div>
              <svg id="sp-intro-ring" width="80" height="80" viewBox="0 0 80 80" style="position:absolute;inset:0;overflow:visible;animation:sp-ring-spin 2s linear infinite">
                <defs>
                  <linearGradient id="spIntroRescueGrad" x1="8" y1="8" x2="72" y2="72">
                    <stop offset="0" stop-color="#5ab1ff"/>
                    <stop offset="0.48" stop-color="#00e5ff"/>
                    <stop offset="1" stop-color="#b9f7ff"/>
                  </linearGradient>
                </defs>
                <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(90,190,255,0.26)" stroke-width="10"/>
                <circle cx="40" cy="40" r="32" fill="none" stroke="url(#spIntroRescueGrad)" stroke-width="3.5"/>
                <circle cx="40" cy="8" r="4" fill="#eaffff"/>
                <circle cx="72" cy="40" r="4" fill="#5ab1ff"/>
                <circle cx="40" cy="72" r="4" fill="#eaffff"/>
                <circle cx="8" cy="40" r="4" fill="#5ab1ff"/>
              </svg>
              <svg width="36" height="36" viewBox="0 0 36 36" style="flex-shrink:0;position:relative;z-index:1;filter:saturate(0.95)">
                <path d="M18,15 L8,33 L28,33 Z" fill="#a020a0" opacity="0.8"/>
                <path d="M18,15 L11,33 L25,33 Z" fill="#2255cc"/>
                <circle cx="18" cy="9" r="6.5" fill="#f0c9a0"/>
                <path d="M12,8 Q12,2 18,2 Q24,2 24,8 Q22,5 18,5 Q14,5 12,8 Z" fill="#5a3520"/>
                <ellipse cx="25" cy="11" rx="3" ry="5" fill="#5a3520" transform="rotate(25 25 11)"/>
              </svg>
              <div style="position:absolute;left:22px;top:22px;width:36px;height:36px;background:rgba(0,229,255,0.24);z-index:2;pointer-events:none"></div>
            </div>
            <div style="position:absolute;top:86px;left:50%;transform:translateX(-50%);font-family:'VCR',monospace;font-size:8px;letter-spacing:1.5px;color:#00e5ff;text-shadow:0 0 8px #00e5ff;white-space:nowrap">15 HITS TO FREE</div>
            <div id="sp-intro-bullet3" style="position:absolute;left:6px;bottom:0;width:4px;height:14px;background:#fff;border-radius:2px;box-shadow:0 0 6px #fff;transition:bottom 0.4s linear"></div>
          </div>`);
        // Travels up the ring's left edge, not straight through the center where
        // the heroine sits — reads as "hits the ring," not "hits the person."
        setTimeout(() => {
          const b = document.getElementById('sp-intro-bullet3');
          if (b) b.style.bottom = '60px';
          playNormalInstrumentSfx('blaster');
        }, 900);
        setTimeout(() => {
          const ring = document.getElementById('sp-intro-ring'), b = document.getElementById('sp-intro-bullet3');
          if (b) b.style.opacity = '0';
          if (ring) {
            const rect = ring.getBoundingClientRect();
            spIntroBurst(rect.left + rect.width / 2, rect.top + rect.height / 2);
            ring.style.transition = 'transform 0.4s ease-out, opacity 0.4s ease-out';
            ring.style.transform = 'scale(1.8)'; ring.style.opacity = '0';
          }
          playMusicBoxArpeggio();
        }, 1300);
      }},
      { duration: 3800, show: () => {
        ann.innerHTML = spIntroObjectiveHTML('CATCH POWER UPS AND HEALTH',
          `<div style="position:relative;width:160px;height:130px">
            <img id="sp-intro-hp" src="projectiles/hp_icon.png" alt="" style="position:absolute;top:0;left:18px;width:34px;height:34px;object-fit:contain;transform:translate3d(0,0,0);will-change:transform,opacity;transition:transform 0.9s ease-in,opacity 0.2s">
            <img id="sp-intro-pu" src="projectiles/lightning.png" alt="" style="position:absolute;top:0;right:18px;width:34px;height:34px;object-fit:contain;filter:drop-shadow(0 0 8px rgba(255,230,26,0.65));transform:translate3d(0,0,0);will-change:transform,opacity;transition:transform 0.9s ease-in,opacity 0.2s">
            <div id="sp-intro-ship" style="position:absolute;bottom:0;left:50%;width:0;height:0;border-left:17px solid transparent;border-right:17px solid transparent;border-bottom:28px solid #00e5ff;transform:translateX(-50%) translateX(0px);transition:transform 0.9s ease-in-out"></div>
            <div id="sp-intro-check" style="position:absolute;bottom:38px;left:50%;transform:translateX(-50%);font-size:28px;color:#33ff66;opacity:0;transition:opacity 0.3s">✓</div>
          </div>`);
        // Explicit, one-at-a-time catches: the ship visibly drifts under each item as
        // it falls so its nose actually meets the pickup, instead of both items
        // landing near a stationary ship and just disappearing.
        setTimeout(() => {
          const hp = document.getElementById('sp-intro-hp'), s = document.getElementById('sp-intro-ship');
          if (hp) hp.style.transform = 'translate3d(0,88px,0)';
          if (s) s.style.transform = 'translateX(-50%) translateX(-47px)';
        }, 300);
        setTimeout(() => {
          const hp = document.getElementById('sp-intro-hp'), s = document.getElementById('sp-intro-ship');
          if (hp) hp.style.opacity = '0';
          if (s) { const rect = s.getBoundingClientRect(); spIntroBurst(rect.left + rect.width / 2, rect.top); }
          playNormalInstrumentSfx('hp');
        }, 1200);
        setTimeout(() => {
          const pu = document.getElementById('sp-intro-pu'), s = document.getElementById('sp-intro-ship');
          if (pu) pu.style.transform = 'translate3d(0,88px,0)';
          if (s) s.style.transform = 'translateX(-50%) translateX(47px)';
        }, 1500);
        setTimeout(() => {
          const pu = document.getElementById('sp-intro-pu'), s = document.getElementById('sp-intro-ship');
          if (pu) pu.style.opacity = '0';
          if (s) { const rect = s.getBoundingClientRect(); spIntroBurst(rect.left + rect.width / 2, rect.top); }
          playNormalInstrumentSfx('powerup');
        }, 2400);
        setTimeout(() => {
          const s = document.getElementById('sp-intro-ship');
          if (s) s.style.transform = 'translateX(-50%) translateX(0px)';
        }, 2700);
        setTimeout(() => {
          const check = document.getElementById('sp-intro-check');
          if (check) check.style.opacity = '1';
        }, 3200);
      }},
      { duration: 3000, show: () => {
        ann.innerHTML = spIntroObjectiveHTML('USE YOUR POWERUPS',
          `<div style="position:relative;width:190px;height:90px;display:flex;flex-direction:column;align-items:center;gap:10px">
            <div style="position:relative;width:44px;height:44px">
              <div id="sp-intro-socket" style="width:44px;height:44px;border-radius:50%;background:#1a1530;border:3px solid #ffe61a;display:flex;align-items:center;justify-content:center;transition:border-color 0.4s ease-out,opacity 0.4s ease-out,box-shadow 0.4s ease-out;box-shadow:0 0 14px rgba(255,230,26,0.5)"><img src="projectiles/lightning.png" alt="" style="width:30px;height:30px;object-fit:contain;filter:drop-shadow(0 0 6px rgba(255,230,26,0.65))"></div>
              <div id="sp-intro-tap" style="position:absolute;top:0;left:0;width:44px;height:44px;border-radius:50%;border:3px solid #fff;opacity:0;transition:transform 0.5s ease-out,opacity 0.5s ease-out"></div>
            </div>
            <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:1px;color:rgba(242,239,232,0.5);text-align:center;white-space:nowrap;width:190px">TAP A POWER TO USE IT</div>
          </div>`);
        // Lit (held) → tap ripple → fades to the same dim/gray empty look the real
        // socket uses once spent, so the demo matches the actual in-game states.
        setTimeout(() => {
          const tap = document.getElementById('sp-intro-tap');
          if (tap) { tap.style.opacity = '0.8'; tap.style.transform = 'scale(1.5)'; }
          playRaveDiscoStab();
        }, 900);
        setTimeout(() => {
          const tap = document.getElementById('sp-intro-tap');
          if (tap) tap.style.opacity = '0';
        }, 1300);
        setTimeout(() => {
          const socket = document.getElementById('sp-intro-socket');
          if (socket) {
            socket.style.borderColor = 'rgba(150,150,160,0.35)';
            socket.style.boxShadow = 'none';
            socket.style.opacity = '0.4';
          }
        }, 1350);
      }},
    ];
    steps._ann = ann;
    ctrl = spPlayIntroSteps(steps, () => { ann.remove(); onDone(); }, skipIntro);
  }
  // Small DOM/CSS particle burst — same idea as the canvas miniExplosion(), but for
  // intro mockups that live outside the canvas, in screen (fixed) coordinates.
  function spIntroBurst(x, y) {
    for (let k = 0; k < 12; k++) {
      const p = document.createElement('div');
      const angle = (k / 12) * Math.PI * 2, dist = 30 + Math.random() * 24;
      const size = 6 + Math.random() * 8;
      const rot = Math.floor(Math.random() * 90);
      const color = k % 3 === 0 ? '#fff2a3' : k % 3 === 1 ? '#ffe61a' : '#ff8844';
      p.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:${size}px;height:${size * 0.72}px;background:${color};clip-path:polygon(50% 0,100% 35%,82% 100%,20% 86%,0 28%);box-shadow:0 0 0 2px rgba(0,0,0,0.35);z-index:9999;pointer-events:none;transition:transform 0.45s steps(4,end),opacity 0.45s steps(4,end)`;
      document.body.appendChild(p);
      requestAnimationFrame(() => {
        p.style.transform = `translate(${Math.cos(angle) * dist}px,${Math.sin(angle) * dist}px) rotate(${rot + 120}deg)`;
        p.style.opacity = '0';
      });
      setTimeout(() => p.remove(), 500);
    }
  }

  function spaceBriefingFace(ci, mode) {
    const gc = GAME_CHARS[ci];
    const isPurpleCaptor = mode === 'purpleCaptor';
    const isRedCaptor = mode === 'redCaptor' || mode === 'captor';
    const isCaptor = isRedCaptor || isPurpleCaptor;
    const isZapped = mode === 'zapped';
    const isCarried = mode === 'carried';
    const traitorColor = isPurpleCaptor ? '#b36bff' : '#ff4444';
    const traitorGlow = isPurpleCaptor ? 'rgba(179,107,255,0.52)' : 'rgba(255,68,68,0.46)';
    const border = isCaptor ? traitorColor : (isZapped || isCarried) ? '#00e5ff' : 'rgba(225,245,255,0.85)';
    const bg = isCaptor ? (isPurpleCaptor ? 'rgba(179,107,255,0.16)' : 'rgba(255,68,68,0.16)') : (isZapped || isCarried) ? 'rgba(0,229,255,0.11)' : 'rgba(120,210,255,0.1)';
    const glow = isCaptor ? traitorGlow : (isZapped || isCarried) ? 'rgba(0,229,255,0.42)' : 'rgba(170,225,255,0.55)';
    const anim = isCaptor ? 'sp-brief-traitor-pop 0.62s ease-out both' : isCarried ? 'sp-brief-captive-out 1.6s ease-in both' : 'sp-brief-rock 1.65s ease-in-out infinite';
    const wash = isCaptor
      ? `<div style="position:absolute;inset:-6px;border-radius:15px;border:2px solid ${isPurpleCaptor ? 'rgba(179,107,255,0.82)' : 'rgba(255,68,68,0.78)'};box-shadow:0 0 18px ${traitorGlow};pointer-events:none"></div>
         <div style="position:absolute;inset:-10px;border-radius:17px;border:1px solid ${isPurpleCaptor ? 'rgba(179,107,255,0.32)' : 'rgba(255,68,68,0.28)'};box-shadow:0 0 22px ${traitorGlow};pointer-events:none"></div>`
      : (isZapped || isCarried)
        ? `<div style="position:absolute;inset:0;background:rgba(0,229,255,0.16);mix-blend-mode:screen;pointer-events:none"></div>
           <div style="position:absolute;left:-18%;right:-18%;top:46%;height:3px;background:#eaffff;box-shadow:0 0 10px #00e5ff;transform:rotate(-16deg);pointer-events:none"></div>`
        : '';
    const ring = (isZapped || isCarried)
      ? `<div style="position:absolute;inset:-5px;border-radius:50%;border:2px solid #00e5ff;box-shadow:0 0 14px rgba(0,229,255,0.75);animation:sp-ring-spin 2.2s linear infinite;pointer-events:none"></div>`
      : '';
    const label = isPurpleCaptor ? 'PURPLE' : isRedCaptor ? 'RED' : '';
    const faceExpr = (isZapped || isCarried) ? 'sad' : mode === 'happy' ? 'happy' : 'normal';
    const boxSize = isCaptor || isZapped || isCarried ? 68 : 62;
    const cellWidth = isCaptor || isZapped || isCarried ? 74 : 70;
    return `<div class="sp-brief-face" style="width:${cellWidth}px;text-align:center;font-family:'VCR',monospace;font-size:7.5px;letter-spacing:1px;color:${isCaptor ? border : 'rgba(242,239,232,0.68)'};transition:transform 0.35s ease,opacity 0.35s ease;animation:${anim};animation-delay:${(ci % 6) * 0.08}s">
      <div style="position:relative;width:${boxSize}px;height:${boxSize}px;border-radius:${isCaptor || isZapped || isCarried ? '13px' : '50%'};overflow:visible;border:${isCaptor || isZapped || isCarried ? `2px solid ${border}` : `1.5px solid ${border}`};background:${bg};box-shadow:0 0 ${isCaptor || isZapped || isCarried ? '15px' : '11px'} ${glow};${isCaptor ? 'filter:saturate(1.28) contrast(1.06)' : ''}">
        ${ring}
        <div style="position:absolute;inset:-5px">${charFace(gc, faceExpr)}</div>
        ${wash}
      </div>
      <div style="margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(242,239,232,0.68)">${gc.name}</div>
      ${label ? `<div style="margin-top:2px;color:${border}">${label}</div>` : ''}
    </div>`;
  }



  function spaceBriefingLineupHTML(options) {
    options = options || {};
    const captorMode = options.captorMode || 'normal';
    const captiveMode = options.captiveMode || 'normal';
    const showCaptors = options.showCaptors !== false;
    const showCaptives = options.showCaptives !== false;
    const caption = options.caption || '';
    const captorHTML = showCaptors && missionEnemyChars.length
      ? `<div style="display:flex;justify-content:center;align-items:flex-start;gap:18px;margin:${caption ? '8px' : '0'} auto 14px">${missionEnemyChars.map(ci => spaceBriefingFace(ci, captorMode)).join('')}</div>`
      : '';
    const captiveHTML = showCaptives && missionTrappedChars.length
      ? `<div style="display:grid;grid-template-columns:repeat(3,74px);justify-content:center;align-items:start;gap:15px 20px;margin:0 auto">${missionTrappedChars.map(ci => spaceBriefingFace(ci, captiveMode)).join('')}</div>`
      : '';
    const cap = caption ? `<div style="font-family:'VCR',monospace;font-size:9px;letter-spacing:2px;color:rgba(242,239,232,0.48);margin:0 0 10px">${caption}</div>` : '';
    return `<div style="width:min(94vw,390px);margin:0 auto">${cap}${captorHTML}${captiveHTML}</div>`;
  }

  function spaceBriefingBoss(mode) {
    const anim = mode === 'out' ? 'sp-brief-boss-out 1.6s ease-in both' : (mode === 'hold' ? 'none' : 'sp-brief-boss-in 0.9s cubic-bezier(.2,1.15,.35,1) both');
    return `<div style="width:118px;text-align:center;font-family:'VCR',monospace;font-size:9px;letter-spacing:2px;color:#cc66ff;animation:${anim}">
      <div style="position:relative;width:118px;height:118px;margin:0 auto;border-radius:50%;background:radial-gradient(circle,rgba(185,135,255,0.24) 0 48%,rgba(185,135,255,0.06) 64%,rgba(25,4,46,0) 76%);border:3px solid #8e55d8;box-shadow:0 0 30px rgba(142,85,216,0.72), inset 0 -14px 20px rgba(0,0,0,0.3)">
        <div style="position:absolute;inset:-12px;border-radius:50%;border:2px solid rgba(142,85,216,0.68);box-shadow:0 0 24px rgba(142,85,216,0.48);animation:sp-ring-spin 3s linear infinite"></div>
        <img src="bosses/boss_gizmo.png" alt="" style="position:absolute;left:50%;top:50%;width:116px;height:116px;object-fit:contain;transform:translate(-50%,-52%);filter:drop-shadow(0 0 16px rgba(185,135,255,0.82))">
      </div>
      <div style="margin-top:8px;color:#d8c6a0">GIZMO</div>
    </div>`;
  }

  function spaceBriefingPilot() {
    const gc = GAME_CHARS[activeChar];
    // Small ship glyph riding just above the pilot's face — same hull color and nose
    // shape as the actual in-game ship (drawPlayer()), so it reads as "this is who
    // you're about to fly," not just a generic decoration. It shares the parent's
    // sp-brief-pilot-ship animation, so it flies in and back out together with the rest.
    const shipGlyph = `<div style="width:0;height:0;margin:0 auto 6px;border-left:11px solid transparent;border-right:11px solid transparent;border-bottom:19px solid ${gc.color};filter:drop-shadow(0 0 8px ${gc.color}99)"></div>`;
    return `<div style="width:min(92vw,360px);height:268px;position:relative;text-align:center">
      <div style="position:absolute;left:50%;top:0;width:100%;animation:sp-brief-pilot-ship 5.05s cubic-bezier(.2,1.02,.28,1) both">
        ${shipGlyph}
        <div style="font-family:'VCR',monospace;font-size:15px;letter-spacing:4px;color:#33ff66;text-shadow:0 0 12px #33ff66;margin-bottom:10px">PILOT ONLINE</div>
        <div style="width:122px;height:122px;margin:0 auto 12px;border-radius:18px;overflow:hidden;border:3px solid ${gc.color};background:${gc.color}22;box-shadow:0 0 28px ${gc.color}77">${charFace(gc, 'normal')}</div>
        <div style="font-family:'Bebas Neue',cursive;font-size:43px;letter-spacing:5px;line-height:0.96;color:#33ff66;text-shadow:0 0 18px #33ff6688">IT'S UP TO ME NOW!</div>
        <div style="font-family:'VCR',monospace;font-size:10px;letter-spacing:2px;color:rgba(242,239,232,0.56);margin-top:12px">BREAK THE BLUE RINGS. BRING THEM HOME.</div>
      </div>
    </div>`;
  }

  function showSpaceRescueBriefing(onDone) {
    spaceBriefingTimers.forEach(clearTimeout);
    spaceBriefingTimers = [];
    const ov = document.createElement('div');
    ov.className = 'space-rescue-briefing';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,1,16,0);transition:background 0.35s ease;pointer-events:auto';
    const starsHTML = Array.from({length:38}, (_, i) => {
      const left = Math.round(Math.random() * 1000) / 10;
      const top = Math.round(Math.random() * 1000) / 10;
      const size = Math.round((1 + Math.random() * 2.2) * 10) / 10;
      const dur = Math.round((2.8 + Math.random() * 3.5) * 10) / 10;
      const delay = Math.round(Math.random() * 30) / -10;
      const alpha = Math.round((0.35 + Math.random() * 0.5) * 100) / 100;
      return `<i style="position:absolute;left:${left}%;top:${top}%;width:${size}px;height:${size}px;border-radius:50%;background:rgba(234,255,255,${alpha});box-shadow:0 0 ${size * 4}px rgba(90,177,255,0.65);animation:sp-brief-star-drift ${dur}s linear ${delay}s infinite"></i>`;
    }).join('');
    const cast = [...missionEnemyChars, ...missionTrappedChars];
    const castGrid = (captorMode, zappedMode, excludeCaptors) => cast.filter(ci => !(excludeCaptors && missionEnemyChars.includes(ci))).map(ci => {
      const mode = missionEnemyChars.includes(ci) ? captorMode : zappedMode;
      return spaceBriefingFace(ci, mode);
    }).join('');
    ov.innerHTML = `
      <div aria-hidden="true" style="position:absolute;inset:0;overflow:hidden;pointer-events:none">${starsHTML}</div>
      <div id="space-brief-card" style="width:min(94vw,430px);text-align:center;transform:scale(0.96);opacity:0;transition:transform 0.35s ease,opacity 0.35s ease">
      </div>`;
    document.body.appendChild(ov);
    let storySkipped = false;
    const skipStory = () => {
      if (storySkipped || !document.body.contains(ov)) return;
      storySkipped = true;
      spaceBriefingTimers.forEach(clearTimeout);
      spaceBriefingTimers = [];
      ov.remove();
      onDone();
    };
    const skipBtn = document.createElement('button');
    skipBtn.className = 'intro-skip-btn';
    skipBtn.textContent = 'SKIP STORY';
    skipBtn.style.cssText = "position:fixed;bottom:max(14px, env(safe-area-inset-bottom, 14px));left:50%;transform:translateX(-50%);z-index:10000;pointer-events:auto;height:32px;min-height:32px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;font-family:'VCR',monospace;font-size:10px;letter-spacing:2px;background:none;border:1px solid rgba(242,239,232,0.2);border-radius:6px;padding:0 12px;color:rgba(242,239,232,0.45);opacity:0.7;cursor:pointer";
    skipBtn.onclick = (e) => { e.preventDefault(); e.stopPropagation(); skipStory(); };
    ov.appendChild(skipBtn);
    const card = ov.querySelector('#space-brief-card');
    function setStage(html) {
      if (!document.body.contains(ov)) return;
      card.style.opacity = '0';
      card.style.transform = 'scale(0.97)';
      const t = setTimeout(() => {
        if (!document.body.contains(ov)) return;
        card.innerHTML = html;
        requestAnimationFrame(() => {
          card.style.opacity = '1';
          card.style.transform = 'scale(1)';
        });
      }, 230);
      spaceBriefingTimers.push(t);
    }
    const gridStyle = "display:grid;grid-template-columns:repeat(4,72px);justify-content:center;align-items:start;gap:16px 18px";
    // Pre-reveal should not imply the later traitor/captive split. Show all 8 as
    // equal innocent Mobes in a clean 2x4 group; only the next beats separate the
    // two traitors from the six captives. Interleave the hidden traitors so the
    // layout does not visually foreshadow "two captors up front" before the reveal.
    const preRevealCast = missionTrappedChars.length >= 6 && missionEnemyChars.length >= 2
      ? [missionTrappedChars[0], missionEnemyChars[0], missionTrappedChars[1], missionTrappedChars[2], missionTrappedChars[3], missionTrappedChars[4], missionEnemyChars[1], missionTrappedChars[5]]
      : cast;
    const preRevealCastGrid = preRevealCast.map(ci => spaceBriefingFace(ci, 'normal')).join('');
    const normalDayStage = `
      <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:4px;color:#ffe61a;text-shadow:0 0 12px #ffe61a;animation:sp-brief-line-in 0.35s ease-out both">ON A NORMAL MOBE DAY</div>`;
    const castStage = `
      <div style="font-family:'Bebas Neue',cursive;font-size:40px;letter-spacing:5px;line-height:1;color:#ffe61a;text-shadow:0 0 18px #ffe61a88;margin-bottom:14px;animation:sp-brief-line-in 0.35s ease-out both">8 MOBES WERE FROLICKING</div>
      <div style="width:min(94vw,390px);margin:0 auto">
        <div style="font-family:'VCR',monospace;font-size:9px;letter-spacing:2px;color:rgba(242,239,232,0.48);margin:0 0 10px">ALL TOGETHER</div>
        <div style="${gridStyle}">${preRevealCastGrid}</div>
      </div>`;
    const traitorLineStage = `
      <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:4px;color:#ff4444;text-shadow:0 0 12px #ff4444;animation:sp-brief-line-in 0.35s ease-out both">BUT TWO OF THEM WERE TRAITORS</div>`;
    const traitorPairHTML = `
      <div style="display:flex;justify-content:center;align-items:flex-start;gap:18px;margin:8px auto 14px">
        ${missionEnemyChars[0] != null ? spaceBriefingFace(missionEnemyChars[0], 'redCaptor') : ''}
        ${missionEnemyChars[1] != null ? spaceBriefingFace(missionEnemyChars[1], 'purpleCaptor') : ''}
      </div>`;
    const captorStage = `
      <div style="width:min(94vw,390px);margin:0 auto">
        <div style="font-family:'VCR',monospace;font-size:9px;letter-spacing:2px;color:rgba(242,239,232,0.48);margin:0 0 10px">THE TWO TRAITORS STEP OUT</div>
        ${traitorPairHTML}
        <div style="display:grid;grid-template-columns:repeat(3,74px);justify-content:center;align-items:start;gap:15px 20px;margin:0 auto">${missionTrappedChars.map(ci => spaceBriefingFace(ci, 'normal')).join('')}</div>
      </div>
      <div style="font-family:'Bebas Neue',cursive;font-size:52px;letter-spacing:5px;line-height:0.96;color:#ff4444;text-shadow:0 0 20px #ff444488;margin:16px 0 0;animation:sp-brief-line-in 0.35s ease-out both">"COME HERE, GIZMO"</div>`;
    const bossLineStage = `
      <div style="font-family:'Bebas Neue',cursive;font-size:48px;letter-spacing:5px;line-height:0.96;color:#cc66ff;text-shadow:0 0 18px #cc66ff88;animation:sp-brief-line-in 0.35s ease-out both">EVIL GIZMO TOOK THE MOBES CAPTIVE</div>`;
    const bossCaptureStage = `
      <div style="display:flex;justify-content:center;gap:14px;margin-bottom:6px">
        ${missionEnemyChars[0] != null ? `<div style="transform:scale(0.78);transform-origin:center bottom">${spaceBriefingFace(missionEnemyChars[0], 'redCaptor')}</div>` : ''}
        ${missionEnemyChars[1] != null ? `<div style="transform:scale(0.78);transform-origin:center bottom">${spaceBriefingFace(missionEnemyChars[1], 'purpleCaptor')}</div>` : ''}
      </div>
      <div style="display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:12px">${spaceBriefingBoss('in')}</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:44px;letter-spacing:5px;line-height:1;color:#00e5ff;text-shadow:0 0 18px #00e5ff88;margin-bottom:12px;opacity:0;animation:sp-brief-line-in 0.42s ease-out 1.1s both">CAPTIVE RINGS LOCKED!</div>
      <div style="opacity:0;animation:sp-brief-line-in 0.42s ease-out 1.18s both">${spaceBriefingLineupHTML({ captorMode: 'captor', captiveMode: 'zapped', showCaptors: false })}</div>`;
    // Sand grains scattered over the line's footprint, each drifting off in roughly
    // the same direction the text itself blurs/slides toward (sp-brief-dust-away),
    // so the line reads as crumbling into sand and blowing away rather than just fading.
    const sandGrainsHTML = Array.from({ length: 34 }, (_, i) => {
      const band = i % 3;
      const x = Math.round((4 + Math.random() * 92) * 10) / 10;
      const y = Math.round((band === 0 ? 31 + Math.random() * 10 : band === 1 ? 45 + Math.random() * 12 : 59 + Math.random() * 10) * 10) / 10;
      const dx = Math.round((55 + Math.random() * 120) * (Math.random() < 0.18 ? -0.35 : 1));
      const dy = Math.round(-48 + Math.random() * 88);
      const size = Math.round((1.1 + Math.random() * 3.1) * 10) / 10;
      const delay = (2.02 + Math.random() * 1.18).toFixed(2);
      const dur = (0.95 + Math.random() * 0.85).toFixed(2);
      const color = i % 5 === 0 ? '#9ff6ff' : i % 4 === 0 ? '#fff0a8' : '#ff9ad6';
      const glow = i % 5 === 0 ? 'rgba(159,246,255,0.7)' : i % 4 === 0 ? 'rgba(255,240,168,0.66)' : 'rgba(255,154,214,0.64)';
      return `<i style="position:absolute;left:${x}%;top:${y}%;width:${size}px;height:${size}px;border-radius:50%;background:${color};box-shadow:0 0 ${size * 2.8}px ${glow};--dx:${dx}px;--dy:${dy}px;animation:sp-brief-sand-grain ${dur}s ease-out ${delay}s forwards"></i>`;
    }).join('');
    const abductStage = `
      <div style="min-height:260px;display:flex;align-items:center;justify-content:center;position:relative;overflow:visible">
        <div style="font-family:'Bebas Neue',cursive;font-size:38px;letter-spacing:5px;line-height:0.98;color:#ff76d2;text-shadow:0 0 18px #ff76d288;opacity:0;animation:sp-brief-line-in 0.34s ease-out 0.14s both, sp-brief-dust-away 0.9s ease-in 2.1s forwards;text-align:center;max-width:100%">THEY VANISHED INTO SPACE</div>
        <div aria-hidden="true" style="position:absolute;inset:0;pointer-events:none">${sandGrainsHTML}</div>
      </div>`;
    const pilotStage = spaceBriefingPilot();
    requestAnimationFrame(() => {
      ov.style.background = 'rgba(3,1,16,0.94)';
      card.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });
    card.innerHTML = normalDayStage;
    spaceSfx('wave.start');
    [
      [2000, castStage, 'missionBirds'],
      [5600, traitorLineStage, 'missionOminous'],
      [8600, captorStage, 'missionCaptor'],
      // +500ms here so "COME HERE, GIZMO" holds half a second longer — every stage
      // after it just shifts later by the same amount, keeping its own pacing intact.
      [11800, bossLineStage, 'missionBossCharge'],
      [14500, bossCaptureStage, null],
      [15600, null, 'missionZap'],
      [16050, null, 'missionJail'],
      [20200, abductStage, 'missionOminous'],
      [24400, pilotStage, 'missionHero'],
    ].forEach(([delay, html, cue]) => {
      const timer = setTimeout(() => {
        if (cue && SFX[cue]) SFX[cue]();
        if (html) setStage(html);
      }, delay);
      spaceBriefingTimers.push(timer);
    });
    const finishTimer = setTimeout(() => {
      if (!document.body.contains(ov)) return;
      ov.style.background = 'rgba(3,1,16,0)';
      card.style.opacity = '0';
      card.style.transform = 'scale(1.04)';
      const removeTimer = setTimeout(() => {
        if (!document.body.contains(ov)) return;
        ov.remove();
        onDone();
      }, 350);
      spaceBriefingTimers.push(removeTimer);
    }, 29400);
    spaceBriefingTimers.push(finishTimer);
  }

  function hideSpaceOverlayForRun() {
    const ov=document.getElementById('space-overlay');
    document.body.classList.remove('arcade-selection-open');
    if(ov) {
      ov.classList.add('hidden');
      ov.classList.remove('space-boss-preview');
    }
    cancelAnimationFrame(bossPreviewRaf);
    bossPreviewRaf = null;
  }

  function prepareSpaceModeRun(mode) {
    ArcadeMusic.stop();
    clearSpaceRuntimeTimers();
    clearSpaceCinematicOverlays();
    clearSpaceAcademyTimers();
    spaceBriefingTimers.forEach(clearTimeout);
    spaceBriefingTimers=[];
    activeChar=getGlobalChar();
    prepareSpaceMission();
    hideSpaceOverlayForRun();
    cancelAnimationFrame(raf);
    spaceRunMode = mode || 'campaign';
    academyCompleting = false;
    state = 'idle';
  }

  function beginBossRunWave() {
    clearSpaceRuntimeTimers();
    clearSpaceCinematicOverlays();
    clearSpaceAcademyTimers();
    bullets = []; obstacles = []; enemyBullets = []; powerups = []; floatTexts = []; blackoutHitFlashes = []; blackoutShooterIndex = 0;
    boss = null; miniBoss = null; rescueBanner = null; pendingBossWin = null; mirrorSequenceActive = false;
    waveCaptivesSeen.clear();
    blasterDisabledUntil = 0;
    wave = bossRunIndex + 1;
    waveKills = 0;
    currentCfg = Object.assign(waveConfig(Math.min(13, Math.max(4, wave))), { spawnsRemaining: 0, allowMystery: false, allowPowerups: false, allowHp: false, enemyFireMult: 0 });
    const creature = bossRunQueue[bossRunIndex] || { name: 'GIZMO', isGizmo: true };
    waveTheme = creature.isGizmo ? 'gizmo' : 'boss';
    pendingBossCreature = creature;
    spawnsRemaining = 0;
    themeEffectsAt = 0;
    waveTransitioning = false;
    spawnBoss(false, { guardedRescue: false, final: !!creature.isGizmo, bossRun: true });
    showTopBanner(creature.isGizmo ? 'BOSS RUN FINAL: GIZMO' : `BOSS RUN ${bossRunIndex + 1}/${bossRunQueue.length}`, 'bad');
    addFloatText(creature.name, W / 2, H * 0.24, creature.isGizmo ? '#ffe61a' : '#ff4444', 26, { vy: -0.15, fade: 0.006 });
  }

  function advanceBossRun() {
    bossRunIndex++;
    if (bossRunIndex >= bossRunQueue.length) {
      state = 'complete';
      clearSpaceRuntimeTimers();
      cancelAnimationFrame(raf);
      const ov=document.getElementById('space-overlay');
      if (ov) {
        document.body.classList.add('arcade-selection-open');
        ov.classList.remove('hidden','space-over','space-boss-preview');
        ov.style.justifyContent = 'flex-start';
        ov.style.paddingTop = '16px';
      }
      setArcadeExitVisible(true);
      showSpaceOverlay('mode-complete');
      return;
    }
    const socket = SOCKET_TYPES[Math.floor(Math.random() * SOCKET_TYPES.length)];
    inventory[socket] = true;
    health = Math.min(100, health + 15);
    showTopBanner(`NEXT BOSS: +15 HP + ${socket.toUpperCase()}`, 'good');
    addFloatText('+15 HP', player.x, player.y - 56, '#33ff66', 22);
    addFloatText(`${socket.toUpperCase()} SOCKET READY`, SOCKET_X + SOCKET_SIZE + 92, socketRect(SOCKET_TYPES.indexOf(socket)).y + SOCKET_SIZE / 2, SOCKET_COLOR[socket] || '#ffe61a', 16, { vy: -0.08, fade: 0.006 });
    const flowToken = spaceFlowToken;
    setTimeout(() => {
      if (flowToken !== spaceFlowToken || state !== 'playing' || spaceRunMode !== 'bossrun') return;
      beginBossRunWave();
    }, 1500);
  }

  function beginEndlessRun() {
    reset();
    clearSpaceRuntimeTimers();
    clearSpaceCinematicOverlays();
    clearSpaceAcademyTimers();
    bullets = []; obstacles = []; enemyBullets = []; powerups = []; floatTexts = []; blackoutHitFlashes = []; blackoutShooterIndex = 0;
    boss = null; miniBoss = null; pendingBossWin = null; rescueBanner = null; mirrorSequenceActive = false;
    rescuedChars.clear(); missionRetryCaptives.splice(0, missionRetryCaptives.length); waveCaptivesSeen.clear();
    wave = SPACE_CAMPAIGN_FINAL_WAVE + 1;
    waveKills = 0;
    currentCfg = waveConfig(wave);
    // Endless's first wave skips the normal theme roll — landing on something like
    // Blackout/EMP/Mirror with zero warmup reads as an unfair surprise. Open on a
    // plain readable wave instead; pickWaveTheme resumes normally from wave 2 on.
    waveTheme = 'asteroids';
    pendingBossCreature = (waveTheme === 'boss' || waveTheme === 'gizmo') ? pickBossCreature() : null;
    spawnsRemaining = 0;
    themeEffectsAt = waveTheme === 'blackout' ? Date.now() + 1400 : 0;
    startWaveSpawn(currentCfg);
    if (waveTheme === 'blackout') { spawnBlackoutHiddenEnemies(); spaceSfx('wave.blackout'); }
    if (waveTheme === 'boss') spawnBoss(false, { guardedRescue: false });
    if (waveTheme === 'gizmo') spawnBoss(false, { guardedRescue: false, escape: false, final: false });
    if (waveTheme === 'ghost' || waveTheme === 'emp') { spawnMiniBoss(waveTheme); if (waveTheme === 'emp') spaceSfx('status.emp'); }
    if (waveTheme === 'mirror') spawnMirrorEnemy();
    if (waveTheme === 'rave') playRaveDiscoStab();
    showTopBanner('ENDLESS MODE', 'good');
    showSkillCalloutForWave();
  }

  window.spaceStart=function(){
    prepareSpaceModeRun('campaign');
    const beginRun = () => {
      reset(); state='playing'; raf=requestAnimationFrame(loop);
    };
    const briefThenBegin = () => showSpaceRescueBriefing(beginRun);
    if (!spaceIntroShown) {
      spaceIntroShown = true;
      spaceIntroSteps(briefThenBegin);
      return;
    }
    briefThenBegin();
  };
  window.spaceTutorialStart=function(){
    spaceRunMode = 'academy';
    ArcadeMusic.stop();
    clearSpaceCinematicOverlays();
    clearSpaceRuntimeTimers();
    clearSpaceAcademyTimers();
    activeChar=getGlobalChar();
    prepareSpaceMission();
    const ov=document.getElementById('space-overlay');
    document.body.classList.remove('arcade-selection-open');
    if(ov) {
      ov.classList.add('hidden');
      ov.classList.remove('space-boss-preview');
    }
    cancelAnimationFrame(bossPreviewRaf);
    bossPreviewRaf = null;
    cancelAnimationFrame(raf);
    fitSpaceCanvas();
    player = { x: W / 2, y: H - SPACE_SHIP_BOTTOM_OFFSET, r: 18 };
    socketAnchorY = H - SPACE_SOCKET_ANCHOR_BOTTOM_OFFSET;
    dangerY = spaceDangerLineY();
    player.y = dangerY + player.r * 1.1;
    bullets = []; obstacles = []; enemyBullets = []; powerups = []; floatTexts = []; blackoutHitFlashes = []; topBanner = null;
    boss = null; miniBoss = null; pendingBossWin = null; rescueBanner = null; mirrorSequenceActive = false;
    score = 0; health = 100; wave = 0; waveKills = 0; spawnsRemaining = 0; lastEnemyFire = 0; lineFlashA = 0;
    lastDamageCause=''; lastDamageAmount=0; lastDamageAt=0; lastDamageWave=0; deathCause=''; deathDamageAmount=0; deathWave=0; deathWaveTheme='';
    buffSpeedUntil = 0; buffGunUntil = 0; buffShieldUntil = 0; buffFrozenUntil = 0; buffZappedUntil = 0; blasterDisabledUntil = 0; buffPizzaUntil = 0; snowingUntil = 0;
    controlsReversedUntil = 0; twin = null; rebound = null; escort = null; shakeMag = 0;
    inventory = { gun: false, shield: false, bomb: false };
    leftHeld = false; rightHeld = false; lastAutoFire = 0; lastPizzaFire = 0;
    waveCaptivesSeen.clear();
    mkStars();
    currentCfg = Object.assign(waveConfig(1), { speed: 1.65, tier: 0, enemyFireMult: 0 });
    academyMode = true;
    academyCompleting = false;
    academyShieldNoticeAt = 0;
    academyStep = 0;
    academyStepArmed = false;
    academyGoalComplete = false;
    academyRetryNoticeAt = 0;
    academyMysteryIndex = 0;
    state = 'playing';
    enterSpaceAcademyLesson(0);
    raf=requestAnimationFrame(loop);
  };
  window.spaceAcademyStart = window.spaceTutorialStart;
  window.spaceBossRunStart=function(){
    prepareSpaceModeRun('bossrun');
    reset();
    clearSpaceRuntimeTimers();
    clearSpaceCinematicOverlays();
    clearSpaceAcademyTimers();
    bossRunQueue = shuffleList(BOSS_CREATURES.filter(c => c.name !== 'GIZMO')).concat([{ name: 'GIZMO', isGizmo: true }]);
    bossRunIndex = 0;
    rescuedChars.clear();
    missionRetryCaptives.splice(0, missionRetryCaptives.length);
    campaignSeenBossNames.clear();
    waveCaptivesSeen.clear();
    score = 0;
    health = 100;
    state='playing';
    beginBossRunWave();
    raf=requestAnimationFrame(loop);
  };
  window.spaceEndlessStart=function(){
    prepareSpaceModeRun('endless');
    beginEndlessRun();
    state='playing';
    raf=requestAnimationFrame(loop);
  };
  window.spaceDebugJump=function(startWave){
    spaceRunMode = 'debug';
    ArcadeMusic.stop();
    clearSpaceCinematicOverlays();
    clearSpaceAcademyTimers();
    activeChar=getGlobalChar();
    prepareSpaceMission();
    const ov=document.getElementById('space-overlay');
    document.body.classList.remove('arcade-selection-open');
    if(ov) {
      ov.classList.add('hidden');
      ov.classList.remove('space-boss-preview');
    }
    cancelAnimationFrame(bossPreviewRaf);
    bossPreviewRaf = null;
    cancelAnimationFrame(raf);
    reset();
    clearSpaceRuntimeTimers();
    beginConfiguredWave(Math.max(1, parseInt(startWave, 10) || 1));
    state='playing';
    raf=requestAnimationFrame(loop);
  };
  window.spaceBossPreviewSound=function(bossName, part){
    playBossPreviewSound(bossName, part);
  };
  window.spaceDebugBoss=function(bossName){
    spaceRunMode = 'debug';
    ArcadeMusic.stop();
    clearSpaceCinematicOverlays();
    clearSpaceAcademyTimers();
    activeChar=getGlobalChar();
    prepareSpaceMission();
    const ov=document.getElementById('space-overlay');
    document.body.classList.remove('arcade-selection-open');
    if(ov) {
      ov.classList.add('hidden');
      ov.classList.remove('space-boss-preview');
    }
    cancelAnimationFrame(bossPreviewRaf);
    bossPreviewRaf = null;
    cancelAnimationFrame(raf);
    reset();
    clearSpaceRuntimeTimers();
    beginConfiguredWave(8, bossName);
    state='playing';
    raf=requestAnimationFrame(loop);
  };
  window.spacePause=function(){
    clearSpaceRuntimeTimers();spaceBriefingTimers.forEach(clearTimeout);spaceBriefingTimers=[];cancelAnimationFrame(raf);state='idle';
    clearSpaceAcademyTimers(); academyMode = false; academyCompleting = false;
    clearSpaceCinematicOverlays();
    const _ov=document.getElementById('space-overlay');
    if(_ov) _ov.classList.add('hidden');
  };
  window.initSpace=function(){
    activeChar=getGlobalChar();
    canvas=document.getElementById('space-canvas');
    if(!canvas)return;
    clearSpaceRuntimeTimers();
    clearSpaceAcademyTimers();
    spaceBriefingTimers.forEach(clearTimeout);
    spaceBriefingTimers=[];
    clearSpaceCinematicOverlays();
    cancelAnimationFrame(raf);
    cancelAnimationFrame(bossPreviewRaf);
    bossPreviewRaf = null;
    waveTransitioning = false;
    pendingBossWin = null;
    academyMode = false;
    academyCompleting = false;
    // Always unhide the overlay when entering the space page
    const _ov=document.getElementById('space-overlay');
    if(_ov) _ov.classList.remove('hidden');
    ctx=canvas.getContext('2d');
    state='idle';
    if(!canvas._spaceTouchReady){
      canvas._spaceTouchReady=true;
      function getTouchPos(touch){
        const rect=canvas.getBoundingClientRect();
        return {
          x: (touch.clientX-rect.left)*(W/rect.width),
          y: (touch.clientY-rect.top)*(H/rect.height)
        };
      }
      // Movement reads touch X only (ship Y is fixed) across the whole canvas width,
      // so the socket column needs its own reserved hit-zone on touchstart — a tap
      // there deploys instead of moving the ship. _touchOnSocket maps touch ids to
      // whether that individual pointer started on a socket.
      const _touchOnSocket = new Map();
      canvas.addEventListener('touchstart',e=>{
        e.preventDefault();
        if(state!=='playing') return;
        for(const touch of e.changedTouches){
          const {x:tx,y:ty}=getTouchPos(touch);
          const hitType=hitSocket(tx,ty);
          if(hitType){
            _touchOnSocket.set(touch.identifier, true);
            deploySocket(hitType);
          } else {
            _touchOnSocket.set(touch.identifier, false);
            player.x=Math.max(player.r,Math.min(W-player.r,tx));
          }
        }
      },{passive:false});
      canvas.addEventListener('touchmove',e=>{
        e.preventDefault();
        if(state!=='playing') return;
        for(const touch of e.changedTouches){
          if(_touchOnSocket.get(touch.identifier)) continue;
          const {x:tx}=getTouchPos(touch);
          player.x=Math.max(player.r,Math.min(W-player.r,tx));
        }
      },{passive:false});
      canvas.addEventListener('touchend',e=>{
        for(const touch of e.changedTouches) _touchOnSocket.delete(touch.identifier);
      },{passive:true});
      canvas.addEventListener('touchcancel',e=>{
        for(const touch of e.changedTouches) _touchOnSocket.delete(touch.identifier);
      },{passive:true});
      // Desktop: click a socket to deploy it, or number keys 1-3 as a shortcut.
      canvas.addEventListener('click',e=>{
        if(state!=='playing') return;
        const rect=canvas.getBoundingClientRect();
        const cx=(e.clientX-rect.left)*(W/rect.width);
        const cy=(e.clientY-rect.top)*(H/rect.height);
        const hitType=hitSocket(cx,cy);
        if(hitType) deploySocket(hitType);
      });
      document.addEventListener('keydown',e=>{
        if(state!=='playing' || !document.body.classList.contains('on-space')) return;
        const idx={'1':0,'2':1,'3':2}[e.key];
        if(idx!==undefined) deploySocket(SOCKET_TYPES[idx]);
      });
    }
    // rAF ensures the page has painted before we measure canvas dimensions
    requestAnimationFrame(function(){
      try {
        fitSpaceCanvas();
        mkStars();
        showSpaceOverlay('select');
      } catch(err) {
        const ov=document.getElementById('space-overlay');
        if(ov) { ov.classList.remove('hidden'); ov.innerHTML='<div style="color:#ff4444;font-family:monospace;font-size:11px;padding:20px;white-space:pre-wrap;word-break:break-all">SPACE MOBE ERROR:\n'+err.message+'\n\n'+err.stack+'</div>'; }
      }
    });
  };

  // Re-fit on rotate/resize while the page is actually visible — otherwise turning
  // an iPad from portrait to landscape (or just resizing a desktop window) would
  // leave the canvas at its old size until the next full reset(). Debounced since
  // resize/orientationchange can fire several times in quick succession.
  let _spaceFitTimer = null;
  function _spaceRefit() {
    clearTimeout(_spaceFitTimer);
    _spaceFitTimer = setTimeout(() => {
      if (!document.body.classList.contains('on-space') || !canvas) return;
      const oldW = W, oldH = H;
      fitSpaceCanvas();
      if (player && oldW) {
        player.x = Math.min(Math.max(player.r, player.x * (W / oldW)), W - player.r);
        socketAnchorY = H - SPACE_SOCKET_ANCHOR_BOTTOM_OFFSET;
        dangerY = spaceDangerLineY();
        player.y = dangerY + player.r * 1.1;
      }
      mkStars();
    }, 150);
  }
  window.addEventListener('resize', _spaceRefit);
  window.addEventListener('orientationchange', _spaceRefit);
})();

// ── ARCADE FLOATING COINS + TICKETS ──────────────────────────────────────────
(function() {
  function buildArcadeFloat(force) {
    const el = document.getElementById('arcade-float');
    if (!el) return;
    if (force) el.replaceChildren();
    if (el.children.length) return;

    const coinSVG = `<svg viewBox="0 0 40 40" width="42" height="42"><circle cx="20" cy="20" r="17" fill="#ffe61a14" stroke="#ffe61a" stroke-width="2.5"/><circle cx="20" cy="20" r="10" fill="none" stroke="#ffe61a" stroke-width="1.5" opacity="0.55"/><text x="20" y="26" text-anchor="middle" font-size="13" fill="#ffe61a" font-family="monospace" font-weight="900">$</text></svg>`;

    const ticketSVG = `<svg viewBox="0 0 58 24" width="58" height="24"><rect x="1.5" y="1.5" width="55" height="21" rx="5" fill="#ff00cc0c" stroke="#ff00cc" stroke-width="1.8"/><line x1="19" y1="1.5" x2="19" y2="22.5" stroke="#ff00cc" stroke-width="1" stroke-dasharray="3,2.5" opacity="0.55"/><circle cx="10" cy="12" r="4" fill="none" stroke="#ff00cc" stroke-width="1.8"/><line x1="27" y1="9" x2="50" y2="9" stroke="#ff00cc" stroke-width="2" stroke-linecap="round" opacity="0.7"/><line x1="27" y1="16" x2="43" y2="16" stroke="#ff00cc" stroke-width="2" stroke-linecap="round" opacity="0.45"/></svg>`;

    const pizzaSVG = `<svg viewBox="0 0 44 44" width="44" height="44"><path d="M22,4 L38,37 Q22,45 6,37 Z" fill="#ff660018" stroke="#ff6600" stroke-width="1.8" stroke-linejoin="round"/><path d="M6,37 Q22,47 38,37" fill="none" stroke="#ff9933" stroke-width="4" stroke-linecap="round"/><path d="M22,8 L36,36 Q22,42 8,36 Z" fill="#cc110018" stroke="#cc1100" stroke-width="1.2" opacity="0.85"/><ellipse cx="21" cy="22" rx="4.5" ry="3.5" fill="#ffe61a" opacity="0.82"/><ellipse cx="26" cy="30" rx="3.5" ry="3" fill="#ffe61a" opacity="0.72"/><ellipse cx="16" cy="30" rx="3" ry="2.5" fill="#ffe61a" opacity="0.72"/><circle cx="23" cy="16" r="2.5" fill="#cc0000" opacity="0.9"/><circle cx="17" cy="26" r="2" fill="#cc0000" opacity="0.85"/><circle cx="26" cy="25" r="2" fill="#cc0000" opacity="0.85"/></svg>`;

    // Responsive repeating wallpaper grid. The old fixed 4×6 grid looked sparse on
    // desktop because those same columns stretched across the wider viewport.
    const sequence = ['af-coin','af-ticket','af-pizza','af-coin','af-ticket','af-coin','af-pizza','af-ticket','af-coin','af-pizza','af-ticket','af-coin','af-pizza','af-ticket','af-coin','af-pizza','af-coin','af-ticket','af-pizza','af-coin'];
    const svgMap = { 'af-coin': coinSVG, 'af-ticket': ticketSVG, 'af-pizza': pizzaSVG };
    const vw = window.innerWidth || document.documentElement.clientWidth || 390;
    const vh = window.innerHeight || document.documentElement.clientHeight || 700;
    const COLS = Math.max(4, Math.ceil(vw / 145));
    const ROWS = Math.max(6, Math.ceil(vh / 180));
    let idx = 0;
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const cls = sequence[idx++ % sequence.length];
        const div = document.createElement('div');
        div.className = cls;
        div.innerHTML = svgMap[cls];
        const left = (c / (COLS - 1) * 100) + (Math.random() * 4 - 2);
        const top  = (r / (ROWS - 1) * 100) + (Math.random() * 4 - 2);
        const dur  = 7 + Math.random() * 4; // slower float = more subtle
        const delay = -(r * COLS + c) * 0.8; // stagger so they don't all bob in sync
        div.style.cssText = `left:${Math.max(0, Math.min(100, left))}%;top:${Math.max(0, Math.min(100, top))}%;animation-duration:${dur}s;animation-delay:${delay}s`;
        el.appendChild(div);
      }
    }
  }
  function arcadeFloatPageActive() {
    const b = document.body;
    return !!b && (
      b.classList.contains('on-lobby') ||
      b.classList.contains('on-char') ||
      b.classList.contains('on-whack') ||
      b.classList.contains('arcade-selection-open')
    );
  }

  let arcadeFloatResizeTimer = null;
  function scheduleArcadeFloatRebuild() {
    if (!arcadeFloatPageActive()) return;
    clearTimeout(arcadeFloatResizeTimer);
    arcadeFloatResizeTimer = setTimeout(() => buildArcadeFloat(true), 160);
  }

  // Build immediately (element now lives at body level, persists across all arcade pages)
  buildArcadeFloat(); // DOM already loaded at script parse time
  window.initArcadeFloat = buildArcadeFloat;
  window.addEventListener('resize', scheduleArcadeFloatRebuild);
  window.addEventListener('orientationchange', scheduleArcadeFloatRebuild);
})();

// ── PIXEL ART GAME ICONS ─────────────────────────────────────────────────────
(function() {
  function px(ctx, pixels, colors, scale) {
    pixels.forEach(([x,y,ci]) => {
      ctx.fillStyle = colors[ci||0];
      ctx.fillRect(x*scale, y*scale, scale, scale);
    });
  }
  const S = 3;
  const icons = {
    whack: {
      colors: ['#cc6600','#884400','#ff8800','#ffe61a'],
      pixels: [
        [6,0,3],[7,0,3],[8,0,3],[9,0,3],
        [5,1,2],[6,1,2],[7,1,2],[8,1,2],[9,1,2],[10,1,2],
        [5,2,2],[6,2,2],[7,2,2],[8,2,2],[9,2,2],[10,2,2],
        [5,3,2],[6,3,2],[7,3,2],[8,3,2],[9,3,2],[10,3,2],
        [5,4,0],[6,4,0],[7,4,0],[8,4,0],[9,4,0],[10,4,0],
        [7,5,0],[7,6,0],[7,7,1],[7,8,1],[7,9,1],[7,10,0],
        [6,5,0],[8,5,0],[6,6,0],[8,6,0],
        [6,7,1],[8,7,1],[6,8,1],[8,8,1],
        [6,9,0],[8,9,0],[6,10,0],[8,10,0],
        [7,11,0],[7,12,0],[7,13,0],[7,14,0],[7,15,0],
      ]
    },
    match: {
      colors: ['#333355','#8888cc','#ffffff','#555599','#00ccff'],
      pixels: [
        [2,1,0],[3,1,0],[4,1,0],[5,1,0],[6,1,0],[7,1,0],[8,1,0],[9,1,0],[10,1,0],[11,1,0],[12,1,0],[13,1,0],
        [1,2,0],[2,2,1],[3,2,1],[4,2,1],[5,2,1],[6,2,1],[7,2,1],[8,2,1],[9,2,1],[10,2,1],[11,2,1],[12,2,1],[13,2,1],[14,2,0],
        [1,3,0],[2,3,1],[3,3,4],[4,3,4],[5,3,4],[6,3,4],[7,3,4],[8,3,4],[9,3,4],[10,3,4],[11,3,4],[12,3,1],[13,3,1],[14,3,0],
        [1,4,0],[2,4,1],[3,4,4],[4,4,4],[5,4,4],[6,4,4],[7,4,4],[8,4,4],[9,4,4],[10,4,4],[11,4,4],[12,4,1],[13,4,1],[14,4,0],
        [1,5,0],[2,5,1],[3,5,4],[4,5,2],[5,5,4],[6,5,4],[7,5,4],[8,5,4],[9,5,4],[10,5,2],[11,5,4],[12,5,1],[13,5,1],[14,5,0],
        [1,6,0],[2,6,1],[3,6,4],[4,6,4],[5,6,4],[6,6,4],[7,6,4],[8,6,4],[9,6,4],[10,6,4],[11,6,4],[12,6,1],[13,6,1],[14,6,0],
        [1,7,0],[2,7,1],[3,7,4],[4,7,4],[5,7,4],[6,7,4],[7,7,4],[8,7,4],[9,7,4],[10,7,4],[11,7,4],[12,7,1],[13,7,1],[14,7,0],
        [1,8,0],[2,8,1],[3,8,1],[4,8,1],[5,8,1],[6,8,1],[7,8,1],[8,8,1],[9,8,1],[10,8,1],[11,8,1],[12,8,1],[13,8,1],[14,8,0],
        [1,9,0],[14,9,0],
        [2,10,0],[3,10,0],[4,10,0],[5,10,0],[6,10,0],[7,10,0],[8,10,0],[9,10,0],[10,10,0],[11,10,0],[12,10,0],[13,10,0],
        [5,11,0],[6,11,0],[7,11,0],[8,11,0],[9,11,0],[10,11,0],
        [4,12,0],[5,12,0],[6,12,0],[7,12,0],[8,12,0],[9,12,0],[10,12,0],[11,12,0],
      ]
    },
    space: {
      colors: ['#33ff66','#ffffff','#00cc44','#ffe61a'],
      pixels: [
        [7,1,0],[8,1,0],
        [6,2,0],[7,2,1],[8,2,1],[9,2,0],
        [5,3,0],[6,3,0],[7,3,1],[8,3,1],[9,3,0],[10,3,0],
        [4,4,0],[5,4,0],[6,4,0],[7,4,2],[8,4,2],[9,4,0],[10,4,0],[11,4,0],
        [3,5,0],[4,5,0],[5,5,0],[6,5,2],[7,5,1],[8,5,1],[9,5,2],[10,5,0],[11,5,0],[12,5,0],
        [2,6,0],[3,6,0],[4,6,0],[5,6,0],[6,6,0],[7,6,0],[8,6,0],[9,6,0],[10,6,0],[11,6,0],[12,6,0],[13,6,0],
        [1,7,3],[2,7,0],[3,7,0],[4,7,0],[5,7,0],[6,7,0],[7,7,0],[8,7,0],[9,7,0],[10,7,0],[11,7,0],[12,7,0],[13,7,0],[14,7,3],
        [1,8,3],[2,8,3],[3,8,0],[4,8,0],[5,8,0],[6,8,0],[7,8,0],[8,8,0],[9,8,0],[10,8,0],[11,8,0],[12,8,0],[13,8,3],[14,8,3],
        [3,9,0],[4,9,0],[5,9,0],[6,9,0],[7,9,0],[8,9,0],[9,9,0],[10,9,0],[11,9,0],[12,9,0],
        [4,10,3],[5,10,3],[10,10,3],[11,10,3],
        [4,11,3],[5,11,3],[10,11,3],[11,11,3],
      ]
    }
  };

  function buildLobbyCharPicker() {
    const row = document.getElementById('lobby-char-row');
    if (!row) return;
    const sel = getGlobalChar();
    row.innerHTML = GAME_CHARS.map((c, i) => `
      <button onclick="pickGlobalChar(${i})"
        id="lcp-${i}"
        style="background:${i===sel?c.color+'33':'transparent'};border:2px solid ${i===sel?c.color:'rgba(242,239,232,0.15)'};border-radius:8px;padding:6px;cursor:pointer;transition:all 0.1s;width:48px;height:48px;display:flex;align-items:center;justify-content:center;font-size:28px">
        ${charFace(c,'normal')}
      </button>`
    ).join('');
    // Add "CHANGE PLAYER" button below the row
    const pick = document.getElementById('lobby-char-pick');
    if (pick) {
      let changeBtn = pick.querySelector('.lcp-change-btn');
      if (!changeBtn) {
        changeBtn = document.createElement('button');
        changeBtn.className = 'lcp-change-btn';
        changeBtn.setAttribute('onclick', "openCharSelect('lobby')");
        changeBtn.style.cssText = "font-family:'VCR',monospace;font-size:8px;letter-spacing:2px;background:none;border:none;color:rgba(242,239,232,0.3);cursor:pointer;margin-top:4px;display:block;width:100%";
        changeBtn.textContent = 'CHANGE PLAYER';
        pick.appendChild(changeBtn);
      }
    }
  }
  window.pickGlobalChar = function(i) {
    setGlobalChar(i);
  };

  window.drawPixelIcons = function() {
    Object.entries(icons).forEach(([key, icon]) => {
      const el = document.getElementById(`gc-icon-${key}`);
      if (!el) return;
      const cv = document.createElement('canvas');
      cv.width = 16 * S; cv.height = 16 * S;
      cv.style.cssText = 'display:block;image-rendering:pixelated';
      const cx = cv.getContext('2d');
      px(cx, icon.pixels, icon.colors, S);
      el.innerHTML = '';
      el.appendChild(cv);
      const hiEl = document.getElementById(`gc-hi-${key}`);
      if (hiEl) {
        const keys = {whack:'whack-best-survival',match:'match-best-score',space:'space-best-campaign'};
        const val = localStorage.getItem(keys[key]);
        if (val) hiEl.textContent = `HI SCORE: ${val}`;
      }
    });
  };
})();
