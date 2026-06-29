// ══════════════════════════════════════
//  SPACE MOBE — Vertical Scroller
// ══════════════════════════════════════
(function() {
  'use strict';

  let canvas, ctx, W, H, raf, state = 'idle';
  let spaceIntroShown = false; // first-time-only objective intro, before the real run starts
  let player, bullets, obstacles, stars, score, health, wave, waveKills, highScore, spawnsRemaining;
  let leftHeld = false, rightHeld = false, lastAutoFire = 0, lastPizzaFire = 0, activeChar = getGlobalChar();
  let enemyBullets = [], lastEnemyFire = 0;
  let dangerY = 0, socketAnchorY = 0, lineFlashA = 0;
  const SPACE_SHIP_BOTTOM_OFFSET = 40;
  const SPACE_SOCKET_ANCHOR_BOTTOM_OFFSET = 94;
  // REVERSE theme: a separate fixed "escape" line near the top, just below the
  // HUD/banner strip — kept independent of dangerY on purpose, since dangerY tracks
  // the player position and also drives the socket column's placement; repurposing
  // it for this would yank the sockets up to the top during a reverse wave.
  const REVERSE_LINE_Y = 92;
  let floatTexts = []; // {text, x, y, color, a, vy, size}
  let currentCfg = null;
  let powerups = []; // {type:'speed'|'gun'|'bomb'|'shield'|'hp'|'mystery', x, y, vy, r}
  let buffSpeedUntil = 0, buffGunUntil = 0, buffShieldUntil = 0;
  // Frozen (movement x0.5, bullets render as snowflakes — cosmetic only) and zapped
  // (bullets deal 0 damage, render as farts — the skin IS the mechanical tell) are
  // the two "disabled state" debuffs shared by the ICE/EMP mini-bosses and the
  // mystery box's bad outcomes — one timer each, regardless of source.
  let buffFrozenUntil = 0, buffZappedUntil = 0;
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
  const rescuedChars = new Set();
  let rescueBanner = null;
  const missionTrappedChars = [];
  const missionEnemyChars = [];
  const missionRetryCaptives = [];
  const waveCaptivesSeen = new Set();
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
  let waveTransitioning = false; // true from nextWave() until its announcement clears — guards against the per-frame wave-cleared check re-firing nextWave()
  let pendingBossWin = null; // boss defeated, but the victory cinematic is held until the board (minions/asteroids) is clear
  let mirrorSequenceActive = false, mirrorStageTimers = [];
  let spaceBriefingTimers = [];
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
      2: 'enemies',   // shooting faces, no asteroid mix
      3: 'swarm',     // first pressure wave / bomb lesson
      4: 'boss',      // Star Ogre + captive 1
      5: 'asteroids', // recovery / powerups / light rocks
      6: 'captive',   // captive 2 lock rescue
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
    'GRAY VISITOR': 'orb',
    'SPACE SHARK': 'fish',
    'MEAN TACO': 'sombrero',
    'COSMIC OCTO': 'ink',
    'GIZMO': 'gizmo',
  };
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
      return choices[Math.floor(Math.random() * choices.length)] || choices[0];
    }
    return null;
  }

  function pickBossCreature() {
    if (waveTheme === 'gizmo') return { name: 'GIZMO', isGizmo: true };
    const campaignBoss = campaignBossForWave(wave);
    if (campaignBoss) return campaignBoss;
    return BOSS_CREATURES[Math.floor(Math.random() * BOSS_CREATURES.length)];
  }

  function addFloatText(text, x, y, color, size) {
    floatTexts.push({text, x, y, color, a: 1, vy: -1.5, size: size || 20});
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

  function beginOgreDonkeyWave() {
    if (!boss || boss.attackType !== 'donkey') return;
    const now = Date.now();
    const count = 4;
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
        readyAt: now + 540,
      };
      donkeys.push(d);
      enemyBullets.push(d);
    }
    boss.ogreLine = {
      donkeys,
      order: shuffleList(donkeys),
      nextIndex: 0,
      waveNo: (boss.ogreWaveNo || 0) + 1,
      nextChargeAt: now + 780,
    };
    boss.ogreWaveNo = boss.ogreLine.waveNo;
    addFloatText(`DONKEY WAVE ${boss.ogreWaveNo}/4`, boss.x, boss.y + boss.r + 18, '#c7a16b', 16);
  }

  function updateOgreDonkeyLine() {
    if (!boss || !boss.ogreLine) return;
    const line = boss.ogreLine;
    const now = Date.now();
    let charging = false;
    for (const d of line.donkeys) {
      if (d._hit || d._gone) continue;
      if (d.donkeyState === 'deploy') {
        d.x += (d.targetX - d.x) * 0.24;
        d.y += (d.targetY - d.y) * 0.24;
        if (Math.abs(d.y - d.targetY) < 1.5 || now > d.readyAt) {
          d.x = d.targetX; d.y = d.targetY; d.donkeyState = 'hold';
        }
      } else if (d.donkeyState === 'charge') {
        charging = true;
      }
    }
    const allReady = line.donkeys.every(d => d._hit || d._gone || d.donkeyState !== 'deploy');
    if (allReady && !charging && line.nextIndex < line.order.length && now > line.nextChargeAt) {
      const d = line.order[line.nextIndex++];
      if (d && !d._hit && !d._gone) {
        const dx = player.x - d.x;
        const dy = player.y - d.y;
        const dist = Math.hypot(dx, dy) || 1;
        const speed = 8.1 + Math.min(1.65, campaignTier(wave) * 0.3);
        d.vx = (dx / dist) * speed;
        d.vy = (dy / dist) * speed;
        d.donkeyState = 'charge';
        d.chargeBorn = now;
        playDonkeyHeeHaw();
      }
    }
    const allDone = line.donkeys.every(d => d._hit || d._gone);
    if (allDone) {
      boss.ogreLine = null;
      boss.nextAttack = now + (boss.ogreWaveNo >= 4 ? 2200 : 850);
      if (boss.ogreWaveNo >= 4) boss.ogreWaveNo = 0;
    }
  }


  const P_SPEED = 5, B_SPEED = 9, O_SPEED_BASE = 2.0; // +10% over original 1.8
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

  function rescueMissionChar(ci, x, y, label) {
    if (ci == null || ci < 0) return false;
    const wasNew = !rescuedChars.has(ci);
    rescuedChars.add(ci);
    for (let i = missionRetryCaptives.length - 1; i >= 0; i--) if (missionRetryCaptives[i] === ci) missionRetryCaptives.splice(i, 1);
    escort = { ci, state: 'active', expiresAt: Date.now() + ESCORT_DURATION_MS, x: player.x - 40, y: player.y, lastFire: 0, opacity: 1 };
    rescueBanner = { ci, startedAt: Date.now(), rescued: rescuedChars.size, total: missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT };
    faceFlash(ci, 'happy', x, y);
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
      1: { spawnsRemaining: 14, speedOverride: 2.02, spawnMsOverride: 1120, asteroidRatioOverride: 1, enemyFireMult: 0, allowMystery: false, allowPowerups: false, allowHp: false, spawnCadenceMult: 1.08 },
      2: { spawnsRemaining: 10, speedOverride: 2.04, spawnMsOverride: 1180, asteroidRatioOverride: 0, enemyHpOverride: 2, enemyFireMult: 0.28, allowMystery: false, allowPowerups: true, allowHp: true, powerupDelayRange: [5200, 8200], hpDelayRange: [5200, 9000], spawnCadenceMult: 1.08 },
      3: { spawnsRemaining: 18, speedOverride: 2.24, spawnMsOverride: 720, asteroidRatioOverride: 0, enemyHpOverride: 1, enemyFireMult: 0.18, allowMystery: false, allowPowerups: true, allowHp: true, forcePowerupType: 'bomb', powerupDelayRange: [2200, 3600], hpDelayRange: [5200, 8200], swarmCap: 5, spawnCadenceMult: 0.98 },
      4: { spawnsRemaining: 0, allowMystery: false, allowPowerups: false, allowHp: true, hpDelayRange: [7600, 11600], enemyFireMult: 0.75 },
      5: { spawnsRemaining: 14, speedOverride: 2.14, spawnMsOverride: 1040, asteroidRatioOverride: 1, enemyFireMult: 0, allowMystery: true, allowPowerups: true, allowHp: true, powerupDelayRange: [3200, 6200], hpDelayRange: [3600, 6800], spawnCadenceMult: 1.05 },
      6: { spawnsRemaining: 0, allowMystery: false, allowPowerups: true, allowHp: true, forcePowerupType: 'shield', powerupDelayRange: [3600, 6200], hpDelayRange: [5200, 8500], enemyFireMult: 0.55 },
      7: { spawnsRemaining: 0, allowMystery: false, allowPowerups: false, allowHp: true, hpDelayRange: [8000, 12000], enemyFireMult: 0.85 },
      8: { spawnsRemaining: 12, speedOverride: 2.18, spawnMsOverride: 1100, asteroidRatioOverride: 1, enemyFireMult: 0, allowMystery: false, allowPowerups: false, allowHp: true, hpDelayRange: [5600, 9000], spawnCadenceMult: 1.12 },
      9: { spawnsRemaining: 0, allowMystery: false, allowPowerups: true, allowHp: true, powerupDelayRange: [6400, 9800], hpDelayRange: [7000, 11000], enemyFireMult: 0.9 },
      10: { spawnsRemaining: 12, speedOverride: 2.18, spawnMsOverride: 1220, asteroidRatioOverride: 0.35, enemyHpOverride: 2, enemyFireMult: 0.22, allowMystery: false, allowPowerups: true, allowHp: true, powerupDelayRange: [3600, 6200], hpDelayRange: [4200, 7600], spawnCadenceMult: 1.18 },
      11: { spawnsRemaining: 0, allowMystery: false, allowPowerups: true, allowHp: true, powerupDelayRange: [7200, 10400], hpDelayRange: [7600, 11200], enemyFireMult: 1.0 },
      12: { spawnsRemaining: 14, speedOverride: 2.25, spawnMsOverride: 960, asteroidRatioOverride: 0.55, enemyHpOverride: 2, enemyFireMult: 0.35, allowMystery: true, allowPowerups: true, allowHp: true, forcePowerupType: 'bomb', powerupDelayRange: [900, 1500], hpDelayRange: [2600, 4800], spawnCadenceMult: 0.95 },
      13: { spawnsRemaining: 0, allowMystery: false, allowPowerups: false, allowHp: true, hpDelayRange: [8500, 12500], enemyFireMult: 1.0 },
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

  function enemyFireAt(shooter, speedMult) {
    const dx = player.x - shooter.x;
    const dy = player.y - shooter.y;
    const dist = Math.sqrt(dx*dx+dy*dy) || 1;
    const tier = currentCfg ? currentCfg.tier : campaignTier(wave);
    const balanceMult = currentCfg && currentCfg.enemyFireMult != null ? currentCfg.enemyFireMult : 1;
    const bulletSpeed = (3.0 + tier * 0.45 + Math.min(wave, 12) * 0.16 + Math.max(0, wave - 18) * 0.18) * (speedMult || 1) * balanceMult;
    enemyBullets.push({ x: shooter.x, y: shooter.y + shooter.r, vx: (dx/dist)*bulletSpeed, vy: (dy/dist)*bulletSpeed, r: 4 });
  }

  // REVERSE theme: spawns from the bottom moving upward instead of the normal
  // top-down fall. Rather than threading a flip through every push() site below
  // (asteroid/swarm/bomber/normal/mirror all have their own hardcoded y/vy), this
  // wrapper just corrects whatever _spawnObstacleReal() actually pushed afterward.
  function spawnObstacle(cfg) {
    const before = obstacles.length;
    _spawnObstacleReal(cfg);
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
  function _spawnObstacleReal(cfg) {
    // Themed waves bend the asteroid/enemy mix and a few spawn stats without
    // touching waveConfig(cfg) itself — purely a local override of this one roll.
    let ratio = cfg.asteroidRatio;
    if (waveTheme === 'asteroids' || waveTheme === 'ghost' || waveTheme === 'emp') ratio = 1;
    else if (waveTheme === 'enemies') ratio = 0;
    else if (waveTheme === 'swarm') ratio = 0.1;
    else if (waveTheme === 'goldrush') ratio = 0.85;
    else if (waveTheme === 'mirror') ratio = 1;
    const isAsteroid = Math.random() < ratio;
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
      let ci = isTrapped ? nextMissionCaptiveIndex(waveCaptivesSeen) : nextMissionEnemyIndex();
      if (isTrapped && ci < 0) { isTrapped = false; ci = nextMissionEnemyIndex(); }
      if (isTrapped) waveCaptivesSeen.add(ci);
      // Enemies take 3 hits to clear; trapped heroes still resolve via the ring, hp unused for them.
      // Non-hero enemies descend slower and pause partway down for a burst of fire before
      // continuing — a middle ground between "charges the line" and "just hovers and shoots":
      // keeps some advance pressure but spaces out how much is closing in on the player at once.
      if (waveTheme === 'swarm') {
        // Many small, weak, fast enemies instead of a few tough ones. Faster now
        // that powerups are banked, not lost if you can't immediately catch one —
        // there's more of a safety net to draw on, so this can push harder.
        const r = FACE_R * 0.6;
        obstacles.push({ type:'face', x:rand(r,W-r), y:-r-10, vx:rand(-0.8,0.8)*cfg.speed, vy:cfg.speed*1.72, r, ci: nextMissionEnemyIndex(), hp:cfg.enemyHpOverride || 1, isTrapped:false, ringHp:0, pausedBurstDone:true, paused:false, pauseUntil:0, burstShotsLeft:0, lastBurstShot:0 });
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
      const faceHp = isTrapped ? 1 : (cfg.enemyHpOverride || 3);
      obstacles.push({ type:'face', x:rand(FACE_R,W-FACE_R), y:-FACE_R-10, vx:rand(-0.6,0.6)*cfg.speed, vy:cfg.speed*(0.7+Math.random()*0.5)*(isTrapped?0.82:0.6)*faceVyMult, r:FACE_R, ci, hp: faceHp, isTrapped, ringHp: isTrapped ? CAPTIVE_RING_HP : 0, maxRingHp: isTrapped ? CAPTIVE_RING_HP : 0, pausedBurstDone: isTrapped, paused: false, pauseUntil: 0, burstShotsLeft: 0, lastBurstShot: 0 });
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
    const gizmoEscape = !!(creature.isGizmo && options.escape);
    const gizmoFinal = !!(creature.isGizmo && options.final);
    const tier = campaignTier(wave);
    const hpBase = gizmoEscape ? Math.round(BOSS_HP * (wave === 2 ? 0.82 : 1.06)) : gizmoFinal ? Math.round(BOSS_HP * 1.48) : BOSS_HP;
    const hp = hpBase + tier * (captive ? 5 : gizmoFinal ? 12 : 8) + Math.min(captive ? 16 : gizmoFinal ? 36 : 24, Math.floor(wave * (captive ? 1.0 : gizmoFinal ? 1.9 : 1.35)));
    const attackType = captive ? 'lockpulse' : bossAttackTypeFor(creature);
    boss = {
      creature, x: W / 2, y: 185, vx: (Math.random() < 0.5 ? -1 : 1) * (captive ? 0.72 : 1.1),
      r: BOSS_R, hp, maxHp: hp,
      attackType,
      nextAttack: Date.now() + (captive ? 2200 : 1800),
      attackDelay: attackType === 'sword'
        ? 3900
        : captive ? Math.max(1650, 2450 - tier * 150 - wave * 12) : Math.max(gizmoFinal ? 1250 : 1450, 2380 - tier * 155 - wave * 14),
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
    };
    bossDeployTimer = Date.now() + 3500; // first reinforcement a little after the fight starts
    addFloatText(captive ? `FREE ${GAME_CHARS[captiveCi].name}!` : `${creature.name} INCOMING`, W / 2, 140, captive ? '#00e5ff' : '#ff4444', 22);
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

  const POWERUP_R = 18;
  // Phase 1 tuning: banked socket pickups should be readable/catchable, not frantic.
  // They already fall straight down (vy only, no vx); keep the motion simple and slow
  // enough that the player can make a real socket-inventory decision.
  function hpFallSpeed() { return (currentCfg ? currentCfg.speed : O_SPEED_BASE) * 1.35; }
  function powerupFallSpeed() { return hpFallSpeed() * 1.05; }

  function spawnPowerup(forcedType) {
    const types = ['gun', 'bomb', 'shield'];
    let type = forcedType;
    if (!type && currentCfg && currentCfg.forcePowerupType && !currentCfg._forcedPowerupSpawned) {
      type = currentCfg.forcePowerupType;
      currentCfg._forcedPowerupSpawned = true;
    }
    if (!type || !types.includes(type)) type = types[Math.floor(Math.random() * types.length)];
    powerups.push({ type, x: rand(POWERUP_R, W - POWERUP_R), y: -POWERUP_R - 10, vy: powerupFallSpeed(), r: POWERUP_R, bob: Math.random() * Math.PI * 2 });
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
    mysteryTimer = setTimeout(() => {
      if (state !== 'playing') return;
      if (campaignAllows('allowMystery') && !boss && !waveTransitioning) spawnMysteryBox();
      scheduleMysteryBox();
    }, 14000 + Math.random() * 9000);
  }

  // MUSIC ("JAM SESSION") theme — purely fun, no extra danger: asteroids/enemies
  // fall exactly as normal, but instrument pickups also drop. Shoot one (not catch
  // — same shoot-target language as the mystery ring) for its own note/sound and points.
  const INSTRUMENT_KINDS = ['guitar', 'piano', 'saxophone'];
  function spawnInstrument() {
    const kind = INSTRUMENT_KINDS[Math.floor(Math.random() * INSTRUMENT_KINDS.length)];
    powerups.push({ type: 'instrument', kind, x: rand(POWERUP_R, W - POWERUP_R), y: -POWERUP_R - 10, vy: powerupFallSpeed() * 0.55, r: POWERUP_R, bob: Math.random() * Math.PI * 2 });
  }
  let instrumentTimer = null;
  function scheduleInstrument() {
    clearTimeout(instrumentTimer);
    instrumentTimer = setTimeout(() => {
      if (state !== 'playing') return;
      if (waveTheme === 'music' && !boss && !waveTransitioning) spawnInstrument();
      scheduleInstrument();
    }, 230 + Math.random() * 230);
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
    fish: { glow: '#6bd7ff', spin: 0.0005, wobble: 0.05, trail: '#7fe3ff' },
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
    const wobble = mutedIcon ? 0 : Math.sin(t * 0.005 + x * 0.02) * (fx.wobble || 0);
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
      if (SFX.over) SFX.over();
      else if (SFX.powerupCollect) SFX.powerupCollect();
    } else if (type === 'shield') {
      health = Math.min(100, health + 5);
      miniExplosion(sx, sy, '#00e5ff');
      addFloatText('SOCKET FULL +5 HP', W / 2, H * 0.38, '#00e5ff', 22);
      showTopBanner('SOCKET FULL — +5 HP', 'good');
      SFX.powerupCollect();
    } else if (type === 'gun') {
      score += 250;
      miniExplosion(sx, sy, '#ffe61a');
      addFloatText('SOCKET FULL +250', W / 2, H * 0.38, '#ffe61a', 22);
      showTopBanner('SOCKET FULL — +250', 'good');
      SFX.powerupCollect();
    }
  }

  function applyPowerup(type) {
    if (type === 'gun') {
      buffGunUntil = Date.now() + 8000;
      addFloatText('MACHINE GUN!', player.x, player.y - 50, '#ffe61a', 20);
      showTopBanner('MACHINE GUN', 'good');
      SFX.powerupCollect();
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
      addFloatText(`BOMB! +${cleared}`, player.x, player.y - 50, '#ff8800', 22);
      showTopBanner(`BOMB +${cleared}`, 'good');
      SFX.over();
    } else if (type === 'hp') {
      const gain = arguments[1] || 2;
      health = Math.min(100, health + gain);
      addFloatText(`+${gain} HP`, player.x, player.y - 50, '#33ff66', 20);
      showTopBanner(`+${gain} HP`, 'good');
      SFX.powerupCollect();
    } else if (type === 'shield') {
      buffShieldUntil = Date.now() + 8000;
      addFloatText('SHIELD UP!', player.x, player.y - 50, '#00e5ff', 20);
      showTopBanner('SHIELD UP', 'good');
      SFX.powerupCollect();
    } else if (type === 'mystery') {
      SFX.boxOpen();
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
        SFX.mysteryGood();
      } else if (roll === 'tripleBuff') {
        const now = Date.now();
        buffSpeedUntil = Math.max(buffSpeedUntil, now) + 8000;
        buffGunUntil = Math.max(buffGunUntil, now) + 8000;
        buffShieldUntil = Math.max(buffShieldUntil, now) + 8000;
        addFloatText('MYSTERY: TRIPLE BUFF!', player.x, player.y - 50, '#ffe61a', 20);
        showTopBanner('MYSTERY: TRIPLE BUFF!', 'good');
        SFX.mysteryGood(); ticketConfetti(true);
      } else if (roll === 'twin') {
        twin = { x: player.x + 40, y: player.y, lastFire: 0, expiresAt: Date.now() + 8000 };
        addFloatText('MYSTERY: TWIN SHIP!', player.x, player.y - 50, '#ffe61a', 20);
        showTopBanner('MYSTERY: TWIN SHIP!', 'good');
        SFX.mysteryGood(); ticketConfetti(true);
      } else if (roll === 'pizzaBlast') {
        buffPizzaUntil = Date.now() + 8000;
        addFloatText('MYSTERY: PIZZA BLAST!', player.x, player.y - 50, '#ffcc44', 20);
        showTopBanner('MYSTERY: PIZZA BLAST!', 'good');
        SFX.mysteryGood();
      } else if (roll === 'frozen') {
        buffFrozenUntil = Date.now() + 5000;
        addFloatText('MYSTERY: FROZEN!', player.x, player.y - 50, '#66ddff', 20);
        showTopBanner('MYSTERY: FROZEN!', 'bad');
        SFX.mysteryBad();
      } else if (roll === 'zapped') {
        buffZappedUntil = Date.now() + 5000;
        addFloatText('MYSTERY: FARTED!', player.x, player.y - 50, '#cc99ff', 20);
        showTopBanner('MYSTERY: FARTED!', 'bad');
        SFX.mysteryBad();
      } else if (roll === 'reverse') {
        controlsReversedUntil = Date.now() + 4000;
        addFloatText('MYSTERY: REVERSED!', player.x, player.y - 50, '#ff5500', 20);
        showTopBanner('MYSTERY: REVERSED!', 'bad');
        SFX.mysteryBad();
      } else if (roll === 'tiny') {
        player.r = Math.max(8, player.r * 0.6);
        addFloatText('MYSTERY: TINY SHIP!', player.x, player.y - 50, '#cc66ff', 20);
        showTopBanner('MYSTERY: TINY SHIP!', 'bad');
        SFX.mysteryBad();
        setTimeout(() => { if (state === 'playing') player.r = 18; }, 6000);
      } else if (roll === 'rebound') {
        spawnRebound();
        addFloatText('MYSTERY: REBOUND!', player.x, player.y - 50, '#ff4444', 20);
        showTopBanner('MYSTERY: REBOUND!', 'bad');
        SFX.mysteryBad();
      } else if (roll === 'snowing') {
        snowingUntil = Date.now() + 12000;
        addFloatText('MYSTERY: SNOWSTORM!', player.x, player.y - 50, '#aee8ff', 20);
        showTopBanner('MYSTERY: SNOWSTORM!', 'bad');
        SFX.mysteryBad();
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
    player = { x:W/2, y:H-SPACE_SHIP_BOTTOM_OFFSET, r:18 };
    bullets=[]; obstacles=[]; score=0; health=100; wave=1; waveKills=0;
    enemyBullets=[]; lastEnemyFire=0; floatTexts=[]; lineFlashA=0;
    powerups=[]; buffSpeedUntil=0; buffGunUntil=0; buffShieldUntil=0; escort=null; shakeMag=0;
    boss=null; rescuedChars.clear(); rescueBanner = null; missionRetryCaptives.splice(0, missionRetryCaptives.length); waveCaptivesSeen.clear();
    waveTheme = null; miniBoss = null; themeEffectsAt = 0; waveTransitioning = false; pendingBossWin = null;
    mirrorSequenceActive = false; mirrorStageTimers.forEach(clearTimeout); mirrorStageTimers = [];
    buffFrozenUntil = 0; buffZappedUntil = 0; controlsReversedUntil = 0; twin = null; rebound = null; buffPizzaUntil = 0; snowingUntil = 0; snowParticles = [];
    inventory = { gun: false, shield: false, bomb: false };
    socketAnchorY = H - SPACE_SOCKET_ANCHOR_BOTTOM_OFFSET;
    dangerY = socketAnchorY + (H - socketAnchorY) * 0.5;
    player.y = dangerY + player.r * 1.1;
    highScore = parseInt(localStorage.getItem('space-best')||'0');
    leftHeld=false; rightHeld=false; lastAutoFire=0; lastPizzaFire=0;
    mkStars();
    currentCfg = waveConfig(wave);
    waveTheme = pickWaveTheme(wave, null);
    startWaveSpawn(currentCfg);
    scheduleHpPowerup();
    schedulePowerup();
    scheduleMysteryBox();
    scheduleInstrument();
    setTimeout(() => {
      if (state === 'playing' && wave === 1) showTopBanner('WEAVE THROUGH THE ROCKS', 'good');
    }, 900);
  }

  function clearSpaceRuntimeTimers() {
    clearTimeout(spawnTimer);
    clearTimeout(hpPowerupTimer);
    clearTimeout(powerupTimer);
    clearTimeout(mysteryTimer);
    clearTimeout(instrumentTimer);
    mirrorStageTimers.forEach(clearTimeout);
    mirrorStageTimers = [];
    mirrorSequenceActive = false;
  }

  function beginConfiguredWave(startWave, forcedBossName) {
    clearSpaceRuntimeTimers();
    bullets = []; obstacles = []; enemyBullets = []; powerups = []; floatTexts = [];
    boss = null; miniBoss = null; rescueBanner = null; waveCaptivesSeen.clear();
    wave = startWave;
    waveKills = 0;
    health = 100;
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
    themeEffectsAt = 0;
    waveTransitioning = false;
    pendingBossWin = null;
    startWaveSpawn(currentCfg);
    scheduleHpPowerup();
    schedulePowerup();
    scheduleMysteryBox();
    scheduleInstrument();
    if (waveTheme === 'boss') spawnBoss(false, { guardedRescue: [4,7,9,11].includes(wave) && hasUnrescuedMissionCaptive() });
    if (waveTheme === 'gizmo') spawnBoss(false, { guardedRescue: hasUnrescuedMissionCaptive(), escape: !forcedBossName && wave !== SPACE_FINAL_GIZMO_WAVE, final: !forcedBossName && wave === SPACE_FINAL_GIZMO_WAVE });
    if (waveTheme === 'captive') spawnBoss(true);
    if (waveTheme === 'ghost' || waveTheme === 'emp') spawnMiniBoss(waveTheme);
    if (waveTheme === 'mirror') spawnMirrorEnemy();
    if (waveTheme === 'rave') SFX.neonOn();
    showTopBanner(forcedBossName ? `TEST ${forcedBossName}` : `DEBUG WAVE ${wave}`, 'good');
    showSkillCalloutForWave();
  }

  let spawnTimer = null;
  function startWaveSpawn(cfg) {
    clearTimeout(spawnTimer);
    // Boss/captive waves are true encounter waves now: beat the boss, then advance
    // into the next chapter beat instead of resuming a hidden regular spawn pool.
    if (waveTheme === 'boss' || waveTheme === 'captive' || waveTheme === 'gizmo') spawnsRemaining = 0;
    else if (cfg.spawnsRemaining != null) spawnsRemaining = cfg.spawnsRemaining;
    else if (waveTheme === 'asteroids') spawnsRemaining = Math.max(1, Math.ceil(cfg.poolSize * (wave === 5 ? 0.9 : 1.35)));
    else if (waveTheme === 'enemies') spawnsRemaining = Math.max(8, Math.ceil(cfg.poolSize * 0.72));
    else if (waveTheme === 'mirror') spawnsRemaining = Math.max(4, Math.ceil(cfg.poolSize * 0.34));
    else if (waveTheme === 'bomber') spawnsRemaining = Math.max(4, Math.ceil(cfg.poolSize * 0.48));
    else spawnsRemaining = cfg.poolSize;
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
      if (waveTheme === 'swarm' && obstacles.length >= (cfg.swarmCap || 5)) { spawnTimer = setTimeout(doSpawn, 280); return; }
      spawnObstacle(cfg);
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
    SFX.win();
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9997;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity 0.2s ease-in-out;background:rgba(3,1,16,0.7)';
    el.innerHTML = `
      <div style="font-size:min(30vw,120px);color:#33ff66;text-shadow:0 0 30px #33ff66,0 0 60px #33ff6688;line-height:1">✓</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:26px;letter-spacing:4px;color:#33ff66;text-shadow:0 0 14px #33ff66;margin-top:8px">WAVE ${clearedWave} CLEARED</div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); onDone(); }, 200);
    }, 1000);
  }

  function showGizmoEscapeBeat(rescuedCi, onDone) {
    waveTransitioning = true;
    const isEarlyWave = (wave <= 2 || wave === 10 || wave === 11);
    const holdMs = isEarlyWave ? 7800 : 3300;
    const flyDur = isEarlyWave ? 1.8 : 1.45;
    const flyDelay = isEarlyWave ? 5.2 : 0.25;
    const el = document.createElement('div');
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
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); waveTransitioning = false; if (onDone) onDone(); }, 260);
    }, holdMs);
  }

  function showMissionFailedBeat(onDone) {
    const gc = GAME_CHARS[activeChar];
    const rescued = rescuedChars.size;
    const total = missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT;
    const allSaved = rescued >= total;
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
    el.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;background:rgba(3,1,16,0);opacity:1;transition:background 0.35s ease;pointer-events:none';
    el.innerHTML = `
      <div style="width:min(94vw,410px);text-align:center;opacity:0;transform:scale(0.96);transition:opacity 0.35s ease,transform 0.35s ease">
        <div style="font-family:'Bebas Neue',cursive;font-size:52px;letter-spacing:6px;line-height:0.95;color:#ff4444;text-shadow:0 0 22px #ff444488;margin-bottom:18px">MISSION FAILED</div>
        <div style="width:110px;height:110px;margin:0 auto 14px;border-radius:18px;overflow:hidden;border:3px solid ${gc.color}66;background:${gc.color}11;box-shadow:0 0 18px ${gc.color}33">${charFace(gc, 'sad')}</div>
        <div style="font-family:'VCR',monospace;font-size:12px;letter-spacing:3px;color:rgba(242,239,232,0.5);margin-bottom:6px">${gc.name}</div>
        <div style="font-family:'Bebas Neue',cursive;font-size:36px;letter-spacing:4px;line-height:1;color:${allSaved ? '#33ff66' : '#00e5ff'};text-shadow:0 0 14px ${allSaved ? '#33ff66' : '#00e5ff'}88;margin-bottom:6px">${rescued}/${total} HEROES SAVED</div>
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:rgba(242,239,232,0.45);margin-bottom:18px">WAVE ${wave} · SCORE ${score}</div>
        ${captiveGrid ? `<div style="display:grid;grid-template-columns:repeat(5,42px);justify-content:center;gap:10px 14px;margin:0 auto 20px">${captiveGrid}</div>` : ''}
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:2px;color:rgba(242,239,232,0.4)">THEY STILL NEED YOU</div>
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
    const el = document.createElement('div');
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
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); if (onDone) onDone(); }, 220);
    }, 1800);
  }

  function showBossRescueUnlockBeat(rescuedCi, bossName, onDone) {
    if (rescuedCi == null || rescuedCi < 0) { if (onDone) onDone(); return; }
    waveTransitioning = true;
    const gc = GAME_CHARS[rescuedCi];
    const el = document.createElement('div');
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
    SFX.missionHero();
    ticketConfetti(true);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => { el.remove(); waveTransitioning = false; if (onDone) onDone(); }, 260);
    }, 4800);
  }

  function freeAllRemainingMobes() {
    unrescuedMissionCaptives().forEach(ci => rescuedChars.add(ci));
    missionRetryCaptives.splice(0, missionRetryCaptives.length);
    rescueBanner = { ci: activeChar, startedAt: Date.now(), rescued: rescuedChars.size, total: missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT };
  }

  function showSpaceVictoryBriefing(onDone) {
    waveTransitioning = true;
    const ov = document.createElement('div');
    ov.className = 'space-rescue-briefing';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(3,1,16,0);transition:background 0.35s ease;pointer-events:none';
    const allMobes = [...missionEnemyChars, ...missionTrappedChars];
    const gridStyle = "display:grid;grid-template-columns:repeat(4,58px);justify-content:center;gap:12px 14px";
    ov.innerHTML = `
      <div style="width:min(94vw,430px);text-align:center;opacity:0;transform:scale(0.96);transition:opacity 0.35s ease,transform 0.35s ease">
        <div style="font-family:'Bebas Neue',cursive;font-size:54px;letter-spacing:6px;line-height:0.96;color:#33ff66;text-shadow:0 0 22px #33ff6688;margin-bottom:14px">GIZMO DEFEATED!</div>
        <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:3px;color:#ffe61a;text-shadow:0 0 12px #ffe61a;margin-bottom:16px">LIFE IS BACK TO NORMAL</div>
        <div style="${gridStyle}">${allMobes.map(ci => spaceBriefingFace(ci, 'happy')).join('')}</div>
      </div>`;
    document.body.appendChild(ov);
    const card = ov.firstElementChild;
    SFX.win(); ticketConfetti(true);
    requestAnimationFrame(() => {
      ov.style.background = 'rgba(3,1,16,0.94)';
      card.style.opacity = '1';
      card.style.transform = 'scale(1)';
    });
    setTimeout(() => {
      ov.style.background = 'rgba(3,1,16,0)';
      card.style.opacity = '0';
      card.style.transform = 'scale(1.04)';
      setTimeout(() => { ov.remove(); waveTransitioning = false; if (onDone) onDone(); }, 350);
    }, 5200);
  }

function nextWave() {
    if (waveTransitioning) return;

    waveTransitioning = true;

    // Reward player for clearing a wave
    health = Math.min(100, health + 5);
    addFloatText('+5 HP', player.x, player.y - 50, '#33ff66', 22);
    showTopBanner('+5 HP', 'good');

    const clearedWave = wave;
    const previousTheme = waveTheme;
    wave++;
    waveKills=0;
    waveCaptivesSeen.clear();
    currentCfg = waveConfig(wave);
    waveTheme = pickWaveTheme(wave, previousTheme);
    pendingBossCreature = (waveTheme === 'boss' || waveTheme === 'gizmo') ? pickBossCreature() : null;
    const announceMs = 7000;
    showWaveClearedBeat(clearedWave, () => {
      themeEffectsAt = Date.now() + announceMs;
      // Nothing for the new wave spawns until the announcement is actually gone —
      // previously these fired on their own shorter timers, racing the announcement
      // rather than waiting for it.
      announceWave(wave, announceMs, () => {
        waveTransitioning = false;
        if (state !== 'playing') return;
        startWaveSpawn(currentCfg);
        if (waveTheme === 'boss') spawnBoss(false, { guardedRescue: [4,7,9,11].includes(wave) && hasUnrescuedMissionCaptive() });
        if (waveTheme === 'gizmo') spawnBoss(false, { guardedRescue: hasUnrescuedMissionCaptive(), escape: wave !== SPACE_FINAL_GIZMO_WAVE, final: wave === SPACE_FINAL_GIZMO_WAVE });
        if (waveTheme === 'captive') spawnBoss(true);
        if (waveTheme === 'ghost' || waveTheme === 'emp') spawnMiniBoss(waveTheme);
        if (waveTheme === 'mirror') spawnMirrorEnemy();
        if (waveTheme === 'rave') SFX.neonOn();
        showSkillCalloutForWave();
      });
    });
  }

  function skillCalloutForWave() {
    if (wave === 1) return 'WEAVE THROUGH THE ROCKS';
    if (wave === 2) return 'LINE UP YOUR SHOTS';
    if (wave === 4) return 'FIRST CAPTIVE. BEAT THE BOSS.';
    if (wave === 5) return 'BREATHE. STOCK UP.';
    if (wave === 8) return 'BLACKOUT. STAY CALM.';
    if (wave === 10) return 'JAM SESSION. HAVE FUN.';
    if (wave === 12) return 'FINAL PREP. FILL SOCKETS.';
    if (wave === SPACE_FINAL_GIZMO_WAVE) return 'FINAL GIZMO. USE EVERYTHING.';
    if (waveTheme === 'boss' && boss && boss.creature && boss.creature.name === 'DARK KNIGHT') return 'WATCH THE SWORD GLOW';
    if (waveTheme === 'boss') return 'SAVE RAPID FIRE FOR BOSS';
    if (waveTheme === 'captive') return 'BREAK THE LOCK FIRST';
    if (waveTheme === 'swarm') return 'BOMB NOW OR DODGE CLEAN';
    if (waveTheme === 'bomber') return 'KILL BOMBERS EARLY';
    if (waveTheme === 'mirror') return 'FIND THE TRIANGLE GAP';
    if (waveTheme === 'asteroids') return 'WEAVE. SAVE THE BOMB.';
    if (waveTheme === 'enemies') return 'SHOOT FACES. DODGE SHOTS.';
    if (waveTheme === 'blackout') return 'STAY CALM. WATCH THE LINE.';
    if (waveTheme === 'emp') return 'DODGE THE ZAPS';
    if (waveTheme === 'ghost') return 'TRACK THE GHOST';
    return null;
  }

  function showSkillCalloutForWave() {
    const text = skillCalloutForWave();
    if (!text) return;
    setTimeout(() => {
      if (state !== 'playing' || waveTransitioning) return;
      showTopBanner(text, waveTheme === 'boss' || waveTheme === 'gizmo' || waveTheme === 'captive' ? 'bad' : 'good');
    }, 420);
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
    const ann = document.createElement('div');
    // A real dark "intermission" backdrop, not just text floating over still-visible
    // gameplay — this isn't a rush game, a clear break between waves is fine. Fades
    // in/out on its own short transition rather than riding the text's scale/opacity
    // keyframe, so the backdrop itself doesn't appear to "shrink."
    ann.style.cssText='position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;overflow-y:auto;padding:10px 0;pointer-events:none;background:rgba(3,1,16,0);transition:background 0.45s ease';
    const ds = (duration / 1000).toFixed(2);
    // Folding the captive grid into the same centered, animated block naturally pulls
    // the slot-machine text up a bit too — the taller block still centers as a whole.
    const captiveGridHTML = missionTrappedChars.length ? `
      <div style="margin-top:22px;display:flex;flex-wrap:wrap;justify-content:center;gap:12px 16px;max-width:380px">${missionTrappedChars.map(waveCaptiveFace).join('')}</div>` : '';
    ann.innerHTML=`<div style="text-align:center;animation:wave-announce ${ds}s ease-out forwards">
      <div id="sp-wave-incoming" style="font-family:'VCR',monospace;font-size:11px;letter-spacing:5px;color:#33ff66">INCOMING</div>
      <div id="sp-wave-type" style="font-family:'Bebas Neue',cursive;font-size:clamp(30px, 8vh, 60px);letter-spacing:6px;color:#33ff66;text-shadow:0 0 20px #33ff66,0 0 40px #33ff6688;line-height:1;transition:transform 0.3s ease-out">SURVIVE</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:clamp(17px, 3.4vh, 26px);letter-spacing:4px;color:#33ff66;text-shadow:0 0 10px #33ff6688;margin-top:6px">WAVE ${w}</div>
      ${captiveGridHTML}
    </div>`;
    document.body.appendChild(ann);
    requestAnimationFrame(() => { ann.style.background = 'rgba(3,1,16,0.88)'; });
    setTimeout(() => { ann.style.background = 'rgba(3,1,16,0)'; }, Math.max(0, duration - 450));
    const typeEl = ann.querySelector('#sp-wave-type'), incomingEl = ann.querySelector('#sp-wave-incoming');
    // BOSS is now just another theme entry, with its own THEME_LABEL — no more
    // separate wave-number-based fallback needed.
    const finalLabel = waveTheme === 'boss' && pendingBossCreature ? pendingBossCreature.name : (waveTheme ? THEME_LABEL[waveTheme] : 'SURVIVE');
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
    setTimeout(() => { ann.remove(); if (onDone) onDone(); }, duration);
  }

  function takeDamage(amount) {
    if (Date.now() < buffShieldUntil) {
      addFloatText('BLOCKED!', player.x, player.y - 40, '#00e5ff', 18);
      miniExplosion(player.x, player.y, '#00e5ff');
      return; // shield fully absorbs the hit — no health loss
    }
    health = Math.max(0, health - amount);
    addFloatText(`-${amount}`, player.x, player.y - 40, '#ff4444', 20);
    miniExplosion(player.x, player.y, '#ff4444');
    triggerShake(amount * 1.2);
    // Mystery "snowing" outcome — getting hit at all while it's snowing also
    // freezes you briefly, on top of the normal damage. Reuses the existing
    // FROZEN debuff (movement slow + snowflake bullets) rather than a new state.
    if (Date.now() < snowingUntil) {
      buffFrozenUntil = Math.max(buffFrozenUntil, Date.now() + 2000);
      addFloatText('FROZEN!', player.x, player.y - 60, '#66ddff', 16);
    }
    if (health <= 0) {
      // 'dying' (not 'over' yet) — loop() keeps redrawing a frozen frame (background,
      // stars, frozen obstacles/player) for this window instead of stopping outright.
      // Cancelling the loop immediately here used to leave the death explosion's own
      // particle frames smeared on a canvas nothing was clearing anymore.
      state = 'dying';
      clearTimeout(spawnTimer);
      SFX.over();
      triggerShake(18);
      bigExplosion(player.x, player.y, GAME_CHARS[activeChar].color);
      if (score > highScore) { highScore = score; localStorage.setItem('space-best', score); }
      // Freeze on the death frame for 3s before showing the game-over overlay
      setTimeout(() => {
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
    SFX.powerupCollect();
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
      const faceScale = o.isTrapped ? 2.12 : 2.24;
      drawCanvasMobe(gc, o.isTrapped ? 'sad' : 'normal', -o.r * faceScale / 2, -o.r * faceScale / 2, o.r * faceScale, o.r * faceScale, {
        glowColor: o.isTrapped ? 'rgba(0,229,255,0.72)' : 'rgba(255,68,68,0.45)',
        glowBlur: o.r * (o.isTrapped ? 0.35 : 0.18),
      });
      if (o.isTrapped) {
        ctx.restore();
        ctx.fillStyle = 'rgba(0,229,255,0.32)';
        ctx.fillRect(-o.r, -o.r, o.r * 2, o.r * 2);
      }
      if (!o.isTrapped) {
        // Enemy target lock: keep the red language outside the face so the character
        // art stays readable, then add small inward ticks that say "shoot this."
        ctx.lineCap = 'round';
        if (o._pulseSeed === undefined) o._pulseSeed = Math.random() * 1000;
        const pulse = 0.94 + Math.sin(Date.now() * 0.004 + o._pulseSeed) * 0.06;
        ctx.save();
        ctx.scale(pulse, pulse);
        ctx.beginPath();
        ctx.arc(0, 0, o.r * 1.18, 0.12 * Math.PI, 1.88 * Math.PI);
        ctx.strokeStyle = 'rgba(255,68,68,0.28)'; ctx.lineWidth = 9; ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, 0, o.r * 1.18, 0.12 * Math.PI, 1.88 * Math.PI);
        ctx.strokeStyle = '#ff4444'; ctx.lineWidth = 3.2; ctx.stroke();
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,235,235,0.82)';
        ctx.lineWidth = 1.8;
        ctx.beginPath(); ctx.moveTo(-o.r * 1.05, 0); ctx.lineTo(-o.r * 0.62, 0); ctx.moveTo(o.r * 0.62, 0); ctx.lineTo(o.r * 1.05, 0); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, -o.r * 1.05); ctx.lineTo(0, -o.r * 0.68); ctx.moveTo(0, o.r * 0.68); ctx.lineTo(0, o.r * 1.05); ctx.stroke();
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

    if (missionTrappedChars.length) {
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
    const _frozen = _now < buffFrozenUntil, _zapped = _now < buffZappedUntil;
    const _pizza = _now < buffPizzaUntil;
    const curFireMs = _now < buffGunUntil ? AUTO_FIRE_MS * 0.4 : AUTO_FIRE_MS;
    if (!waveTransitioning && _pizza) {
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
    } else if(!waveTransitioning && ts-lastAutoFire>curFireMs){
      bullets.push({x:player.x,y:player.y-player.r*1.2,vy:-B_SPEED});
      if (_zapped) SFX.fart(); else SFX.blaster();
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
        } else if (!waveTransitioning && ts - escort.lastFire > AUTO_FIRE_MS * 1.6) {
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
      else if (!waveTransitioning && ts - twin.lastFire > AUTO_FIRE_MS) {
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
        takeDamage(15);
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
        enemyBullets.push({ x: rebound.x, y: rebound.y, vx: Math.cos(spinAngle) * fireSpeed, vy: Math.sin(spinAngle) * fireSpeed, r: 4 });
        rebound.nextFire = Date.now() + 130;
      }
    }

    // Boss: hovers near the top (never crosses the danger line), alternates a
    // telegraphed laser (dodge sideways during the charge-up) and a machine-gun burst,
    // and periodically deploys a minion of its own — the only enemies that show up
    // during the fight, since the regular wave queue is paused for its duration.
    if (boss) {
      boss.x += boss.vx;
      if (boss.x < boss.r + 20 || boss.x > W - boss.r - 20) boss.vx *= -1;
      boss.hitFlash = Math.max(0, boss.hitFlash - 0.05);

      // A jail cell shouldn't be dispatching reinforcements — captive fights are just
      // rescue + dodge attacks, no minions.
      if (!boss.isCaptive && boss.attackType !== 'donkey' && Date.now() > bossDeployTimer) {
        // Spawns from right behind the boss, not a random spot at the top — reads as
        // the boss actually deploying it rather than an unrelated arrival.
        const side = Math.random() < 0.5 ? -1 : 1;
        obstacles.push({ type:'face', x: Math.max(FACE_R, Math.min(W-FACE_R, boss.x + side*boss.r*0.7)), y: boss.y + boss.r*0.5, vx:rand(-0.6,0.6)*currentCfg.speed, vy:currentCfg.speed*0.55, r:FACE_R, ci: nextMissionEnemyIndex(), hp:3, isTrapped:false, ringHp:0, pausedBurstDone:false, paused:false, pauseUntil:0, burstShotsLeft:0, lastBurstShot:0 });
        bossDeployTimer = Date.now() + 4000 + Math.random()*1500;
      }

      updateOgreDonkeyLine();

      if (Date.now() > boss.nextAttack && !boss.laserPhase && !(boss.attackType === 'donkey' && boss.ogreLine)) {
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
          SFX.neonOn && SFX.neonOn();
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'donkey') {
          beginOgreDonkeyWave();
          boss.nextAttack = Date.now() + 999999;
        } else if (boss.attackType === 'fire') {
          const count = bt >= 3 ? 5 : 4;
          const base = Math.atan2(player.y - boss.y, player.x - boss.x);
          const speed = 3.0 + bt * 0.22 + Math.max(0, wave - 18) * 0.08;
          for (let k = 0; k < count; k++) {
            const ang = base + (k - (count - 1) / 2) * 0.16;
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r * 0.48, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 7.7, theme: 'fire', splitAt: 520, splitTheme: 'fire', splitSpeed: 2.35, born: Date.now() });
          }
          addFloatText('FIRE BREATH!', boss.x, boss.y + boss.r + 18, '#ff6600', 16);
          SFX.tone && SFX.tone(160,'sawtooth',0,0.18,0.09,80);
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'sword') {
          const telegraphMs = 820;
          const now = Date.now();
          enemyBullets.push({
            x: boss.x, y: boss.y + boss.r * 0.93,
            vx: 0, vy: 0, r: 8.5,
            theme: 'sword',
            damage: 35,
            visualScale: 5.55,
            telegraph: true,
            telegraphStart: now,
            launchAt: now + telegraphMs,
            displayRotation: Math.PI * 0.18,
            born: now,
          });
          addFloatText('SWORD READY!', boss.x, boss.y + boss.r + 18, '#c8d4ff', 16);
          SFX.missionBossCharge ? SFX.missionBossCharge() : (SFX.neonOn && SFX.neonOn());
          boss.nextAttack = now + (boss.attackDelay || 3900);
        } else if (boss.attackType === 'orb') {
          const count = bt >= 2 ? 5 : 4;
          const speed = 2.65 + bt * 0.16 + Math.max(0, wave - 18) * 0.06;
          for (let k = 0; k < count; k++) {
            const spread = (k - (count - 1) / 2) * 0.24;
            enemyBullets.push({ x: boss.x + spread * boss.r, y: boss.y + boss.r * 0.45, vx: spread * speed, vy: speed, r: 7.4, theme: 'greenOrb', homing: 0.018, maxSpeed: speed + 0.85, born: Date.now() });
          }
          addFloatText('HOMING ORBS!', boss.x, boss.y + boss.r + 18, '#33ff66', 16);
          SFX.emp && SFX.emp();
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'fish') {
          const count = bt >= 3 ? 6 : 4;
          const speed = 2.95 + bt * 0.2 + Math.max(0, wave - 18) * 0.07;
          for (let k = 0; k < count; k++) {
            const left = k % 2 === 0;
            const lane = Math.floor(k / 2);
            enemyBullets.push({ x: left ? -10 : W + 10, y: boss.y + boss.r * (0.72 + lane * 0.28), vx: (left ? 1 : -1) * (speed * 0.82), vy: speed * 0.68, r: 7.7, theme: 'fish', waveAmp: 0.9 + lane * 0.15, waveFreq: 0.015, phase: k, born: Date.now() });
          }
          addFloatText('TEETH PINCER!', boss.x, boss.y + boss.r + 18, '#5ab1ff', 16);
          SFX.bomberDive && SFX.bomberDive();
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'sombrero') {
          const count = bt >= 3 ? 5 : 4;
          const base = Math.atan2(player.y - boss.y, player.x - boss.x);
          const speed = 3.05 + bt * 0.18 + Math.max(0, wave - 18) * 0.06;
          for (let k = 0; k < count; k++) {
            const ang = base + (k - (count - 1) / 2) * 0.28;
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r * 0.55, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 7.7, theme: 'sombrero', boomerang: 0.012, born: Date.now() });
          }
          addFloatText('BOOMERANG HATS!', boss.x, boss.y + boss.r + 18, '#d99a2b', 16);
          SFX.tone && SFX.tone(420,'square',0,0.06,0.08,260);
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'ink') {
          const count = Math.min(12, 7 + bt);
          const speed = 2.75 + bt * 0.22 + Math.max(0, wave - 18) * 0.08;
          for (let k = 0; k < count; k++) {
            const ang = Math.PI * 0.15 + (k / (count - 1)) * Math.PI * 0.7;
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r * 0.35, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 7.4, theme: 'ink', splat: true, born: Date.now() });
          }
          addFloatText('INK BURST!', boss.x, boss.y + boss.r + 18, '#7040b8', 16);
          SFX.neonOn && SFX.neonOn();
          boss.nextAttack = Date.now() + (boss.attackDelay || 2200);
        } else if (boss.attackType === 'gizmo') {
          // Gizmo lobs tennis balls that ricochet off the side walls and rain back
          // down on you — each ball is a single 20 HP hit (consumed on contact). He
          // barks on every deploy. Wave 10+ adds a ball and a touch more speed.
          const ballCount = (boss.isFinalGizmo || wave >= 10) ? 3 : 2;
          const ballSpeed = (wave >= 10 ? 3.9 : 3.4) + Math.max(0, wave - 18) * 0.06; // medium-fast
          for (let k = 0; k < ballCount; k++) {
            // Aim each ball toward a side wall (alternating) on a downward angle, so
            // it bounces off the wall and comes back down into the play field.
            const toRight = (k % 2 === 0);
            const vx = (toRight ? 1 : -1) * ballSpeed * (0.8 + Math.random() * 0.15);
            const vy = ballSpeed * (0.62 + Math.random() * 0.12);
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r * 0.5, vx, vy, r: 9, theme: 'tennis', tennis: true, bounce: true, visualScale: 3.2, born: Date.now() });
          }
          addFloatText('TENNIS SMASH!', boss.x, boss.y + boss.r + 18, '#c6ff3a', 16);
          SFX.gizmoBark ? SFX.gizmoBark() : (SFX.missionOminous && SFX.missionOminous());
          if (boss.isFinalGizmo) {
            // FINAL GIZMO: the tennis barrage AND the classic bone shotgun together.
            const boneCount = 7;
            const boneSpeed = 2.9 + bt * 0.24 + Math.max(0, wave - 18) * 0.08;
            for (let k = 0; k < boneCount; k++) {
              const spread = (k - (boneCount - 1) / 2) / ((boneCount - 1) / 2);
              enemyBullets.push({ x: boss.x + spread * boss.r * 0.58, y: boss.y + boss.r * 0.5, vx: spread * boneSpeed * 0.45, vy: boneSpeed, r: 7.8, isLock: true, visualScale: 4.1, homing: 0.012, maxSpeed: boneSpeed + 0.55, born: Date.now() });
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
            enemyBullets.push({ x: boss.x, y: boss.y + boss.r*0.6, vx: Math.cos(ang)*bulletSpeed, vy: Math.sin(ang)*bulletSpeed, r: 6 });
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
          takeDamage(20);
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
        enemyBullets.push({ x: mb.x, y: mb.y + mb.r, vx: (dx/dist)*bulletSpeed, vy: (dy/dist)*bulletSpeed, r: 5, isIce: mb.kind === 'ghost', isZap: mb.kind === 'emp' });
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
        for (const b of bullets) {
          if (b.vy === 999) continue; // already spent on something else this frame
          if (Math.hypot(b.x - p.x, b.y - p.y) < p.r * 1.1) {
            b.vy = 999;
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
            score += 20;
            addFloatText('♪ +20', p.x, p.y - 10, '#ffe61a', 18);
            miniExplosion(p.x, p.y, p.kind === 'guitar' ? '#c47a32' : p.kind === 'piano' ? '#f5f3ec' : '#e6ad2e');
            if (p.kind === 'guitar') SFX.guitarNote();
            else if (p.kind === 'piano') SFX.pianoNote();
            else SFX.saxNote();
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
            SFX.powerupCollect();
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
              enemyFireAt(o, 1.15);
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
          takeDamage(10);
          bigExplosion(o.x, _lineY, '#aa8855');
          SFX.whack && SFX.whack(); // thud sound
          waveKills++;
        } else if(!o.isTrapped){
          // enemy crosses line — big damage
          takeDamage(30);
          bigExplosion(o.x, _lineY, GAME_CHARS[o.ci].color);
          faceFlash(o.ci, 'sad', o.x, _lineY - 30);
          SFX.miss();
          waveKills++;
        } else {
          // trapped hero crosses line — not gone forever, queued back into the rescue pool
          queueMissionCaptiveRetry(o.ci);
          addFloatText('TRY AGAIN!', o.x, o.y, '#00e5ff', 24);
          faceFlash(o.ci, 'sad', o.x, o.y - 20);
          SFX.miss();
          waveKills++;
        }
        if(state==='over') return;
      }
    }
    obstacles=obstacles.filter(o=>!o._crossed);

    obstacles.forEach(drawObstacle);

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
        ctx.fillRect(b.x-2,b.y-12,4,14);
        ctx.fillStyle='rgba(255,230,26,0.35)'; ctx.fillRect(b.x-4,b.y-14,8,18); // cheap glow
        ctx.fillStyle=C('#ffe61a');
      }
    }

    // Bullet vs boss — skipped entirely while zapped, so "deals 0 damage" is literal.
    if (boss && !_zapped) {
      for (const b of bullets) {
        if (b.vy === 999) continue;
        if (Math.hypot(b.x - boss.x, b.y - boss.y) < boss.r + 3) {
          if (boss.attackType === 'shield' && Date.now() < (boss.shieldUntil || 0)) {
            b.vy = 999;
            enemyBullets.push({ x: b.x, y: b.y, vx: (b.vx || 0) * 0.35, vy: 5.4 + wave * 0.08, r: 5.5, theme: 'shield' });
            addFloatText('DEFLECTED!', boss.x, boss.y - boss.r - 20, '#c8d4ff', 16);
            miniExplosion(b.x, b.y, '#c8d4ff');
            SFX.powerupCollect && SFX.powerupCollect();
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
            SFX.win();
            boss = null;
            // Hold the victory cinematic until the board is actually clear — the
            // boss's minions/asteroids can still be falling, and it reads as confusing
            // to have enemies on screen behind the next scene (most visible on Gizmo).
            // The loop fires this once obstacles.length === 0 (see pendingBossWin).
            pendingBossWin = () => {
              if (defeatedBoss.isGizmoEscape) {
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
            SFX.hit();
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
          SFX.miniBossHit();
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
        const hitRadius = (o.type==='face' && o.isTrapped && o.ringHp > 0) ? o.r+12 : o.r+3;
        if(Math.hypot(b.x-o.x,b.y-o.y)<hitRadius){
          b.vy=999;
          if(o.type==='face'){
            if(o.isTrapped && o.ringHp > 0){
              // Hit the rescue ring
              o.ringHp--;
              if(o.ringHp <= 0){
                // Ring destroyed — rescued! Becomes a temporary escort (cap 1 — rescuing
                // again just replaces/refreshes it with the newest hero, no stacking).
                score += 150; waveKills++;
                o.alive=false;
                SFX.win();
                miniExplosion(o.x,o.y,'#00e5ff');
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
              SFX.miss();
              o.alive=false;
              addFloatText('OOPS!', o.x, o.y, '#ff4444', 24);
              miniExplosion(o.x, o.y, '#ff4444');
              faceFlash(o.ci,'sad',o.x,o.y);
              takeDamage(30);
              if(state==='over') return;
            } else {
              // Normal enemy face — takes 3 hits to clear
              o.hp--;
              if (o.hp > 0) {
                SFX.hit();
                miniExplosion(o.x, o.y, 'rgba(255,255,255,0.7)'); // hurt flicker, not destroyed yet
                addFloatText('HIT!', o.x, o.y - 14, '#ffffff', 14);
              } else {
                const pts = 25+(wave*5);
                score+=pts; SFX.score();
                miniExplosion(o.x,o.y,GAME_CHARS[o.ci].color);
                faceFlash(o.ci,'sad',o.x,o.y);
                addFloatText('+'+pts, o.x, o.y, GAME_CHARS[o.ci].color, 18);
                waveKills++;
                o.alive=false;
              }
            }
          } else {
            // Asteroid
            const pts = 10+(wave*2);
            score+=pts; SFX.hit();
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
          o.alive=false; SFX.miss();
          takeDamage(o.type==='face' ? 30 : 15);
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
    if (pendingBossWin && obstacles.length === 0 && !boss && !miniBoss && state === 'playing') {
      const runWin = pendingBossWin; pendingBossWin = null; runWin();
    }
    if (spawnsRemaining <= 0 && obstacles.length === 0 && powerups.length === 0 && !boss && !miniBoss && !mirrorSequenceActive && !pendingBossWin && state === 'playing') {
      nextWave();
    }

    // Enemy fire ramps by campaign tier, not raw wave flood. Later chapters ask for
    // better dodging and target priority, but keep a readable cadence on mobile.
    const fireTier = currentCfg ? currentCfg.tier : campaignTier(wave);
    if(Date.now() - lastEnemyFire > Math.max(420, 1280 - fireTier * 125 - Math.min(wave, 12) * 28 - Math.max(0, wave - 18) * 35)){
      const shooters = obstacles.filter(o => o.type==='face' && !o.isTrapped && o.y > 0);
      if(shooters.length > 0){
        const numShots = Math.min(shooters.length, 1 + Math.floor(fireTier / 2) + Math.floor(Math.max(0, wave - 14) / 7));
        const chosen = shooters.map(s => [Math.random(), s]).sort((a,b) => a[0]-b[0]).slice(0, numShots).map(p => p[1]);
        chosen.forEach(shooter => enemyFireAt(shooter, 1));
        lastEnemyFire = Date.now();
        SFX.tone && SFX.tone(420, 'square', 0, 0.03, 0.08, 280);
      }
    }
    enemyBullets.forEach(b => {
      const now = Date.now();
      if (!b.born) b.born = now;
      const age = now - b.born;
      if (b.telegraph && now >= b.launchAt) {
        const dxs = player.x - b.x, dys = player.y - b.y;
        const dist = Math.hypot(dxs, dys) || 1;
        const speed = 17.6 + Math.min(2.4, campaignTier(wave) * 0.44);
        b.vx = (dxs / dist) * speed;
        b.vy = (dys / dist) * speed;
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
      if (b.waveAmp) {
        b.x += Math.sin(age * (b.waveFreq || 0.012) + (b.phase || 0)) * b.waveAmp;
      }
      if (b.splitAt && !b.splitDone && age > b.splitAt) {
        b.splitDone = true;
        const base = Math.atan2(b.vy, b.vx || 0);
        const speed = b.splitSpeed || 2.4;
        [-0.34, 0.34].forEach(off => {
          const ang = base + off;
          enemyBullets.push({ x: b.x, y: b.y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: Math.max(4.2, (b.r || 6) * 0.72), theme: b.splitTheme || b.theme, born: now });
        });
      }
      if (!b.telegraph && !(b.donkeyLine && b.donkeyState !== 'charge')) {
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
      if (b.theme) {
        ctx.save();
        ctx.translate(b.x, b.y);
        const rot = b.displayRotation != null ? b.displayRotation : Math.atan2(b.vy, b.vx || 0) + Math.PI / 2;
        ctx.rotate(rot);
        const rr = b.r || 5;
      if (b.telegraph) {
        const charge = Math.max(0, Math.min(1, (now - (b.telegraphStart || now)) / Math.max(1, (b.launchAt || now + 1) - (b.telegraphStart || now))));
        const pulse = 1 + Math.sin(now * 0.02) * (0.07 + charge * 0.16);
        ctx.save();
        ctx.globalAlpha = 0.18 + charge * 0.56;
        ctx.strokeStyle = `rgba(200,212,255,${0.48 + charge * 0.42})`;
        ctx.lineWidth = 2.2 + charge * 2.8;
        ctx.beginPath(); ctx.arc(0, 0, rr * (3.15 + charge * 1.25) * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.beginPath(); ctx.arc(0, 0, rr * (1.95 + charge * 0.92) * pulse, 0, Math.PI * 2); ctx.stroke();
        ctx.restore();
      }
        const themedScale = b.visualScale || (b.theme === 'donkey' ? 4.1 : b.theme === 'sombrero' ? 4.4 : b.theme === 'fish' ? 3.7 : 3.5);
        if (drawProjectileImage(b.theme, 0, 0, rr * themedScale, 0, b.theme === 'sword' ? 'rgba(200,212,255,0.92)' : null)) {
          // PNG projectile handled.
        } else if (b.theme === 'donkey') {
          ctx.fillStyle = '#9a7a55'; ctx.fillRect(-rr*0.9, -rr*0.35, rr*1.8, rr*0.95);
          ctx.beginPath(); ctx.moveTo(-rr*0.9,-rr*0.3); ctx.lineTo(-rr*1.45,-rr*0.95); ctx.lineTo(-rr*0.3,-rr*0.55); ctx.fill();
          ctx.fillStyle = '#2a1a10'; ctx.fillRect(-rr*0.35, rr*0.05, rr*0.22, rr*0.85); ctx.fillRect(rr*0.35, rr*0.05, rr*0.22, rr*0.85);
        } else if (b.theme === 'fire') {
          ctx.beginPath(); ctx.moveTo(0,-rr*1.7); ctx.bezierCurveTo(rr*1.2,-rr*0.5,rr*0.6,rr*1.1,0,rr*1.4); ctx.bezierCurveTo(-rr*0.9,rr*0.7,-rr*1.1,-rr*0.4,0,-rr*1.7); ctx.fillStyle = '#ff5a00'; ctx.fill();
          ctx.beginPath(); ctx.moveTo(0,-rr); ctx.bezierCurveTo(rr*0.5,-rr*0.2,rr*0.25,rr*0.6,0,rr*0.85); ctx.bezierCurveTo(-rr*0.45,rr*0.35,-rr*0.5,-rr*0.2,0,-rr); ctx.fillStyle = '#ffe61a'; ctx.fill();
        } else if (b.theme === 'greenOrb') {
          ctx.beginPath(); ctx.arc(0,0,rr*1.25,0,Math.PI*2); ctx.fillStyle='rgba(51,255,102,0.25)'; ctx.fill();
          ctx.beginPath(); ctx.arc(0,0,rr,0,Math.PI*2); ctx.fillStyle='#33ff66'; ctx.fill();
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
          SFX.freeze();
        } else if (b.isZap) {
          buffZappedUntil = Date.now() + 5000;
          addFloatText('FARTED!', player.x, player.y - 40, '#cc99ff', 18);
          SFX.emp();
        } else if (b.isLock) {
          addFloatText('LOCK HIT!', player.x, player.y - 40, '#00e5ff', 16);
          SFX.miss();
          takeDamage(7);
        } else if (b.tennis) {
          addFloatText('SMASH! -20', player.x, player.y - 40, '#c6ff3a', 18);
          SFX.miss();
          takeDamage(20);
        } else if (b.theme === 'donkey') {
          addFloatText('HEE HAW! -20', player.x, player.y - 40, '#c7a16b', 18);
          SFX.whack && SFX.whack();
          takeDamage(20);
        } else if (b.theme === 'sword') {
          addFloatText('SWORD! -35', player.x, player.y - 40, '#c8d4ff', 18);
          SFX.miss();
          takeDamage(35);
        } else if (b.splat || b.theme === 'ink') {
          bossInkBlindUntil = Date.now() + 2400;
          addFloatText('INKED!', player.x, player.y - 40, '#ff76d2', 18);
          SFX.neonOn && SFX.neonOn();
          takeDamage(5);
        } else {
          SFX.miss();
          takeDamage(5);
        }
      }
    });
    enemyBullets = enemyBullets.filter(b => !b._hit && !b._gone && b.y < H + 20 && b.y > -20 && b.x > -20 && b.x < W + 20);
    if(state==='over') return;

    // Float texts
    floatTexts = floatTexts.filter(t => t.a > 0.02);
    floatTexts.forEach(t => {
      t.y += t.vy; t.a -= 0.02;
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
    // BLACKOUT: a radial-gradient vignette drawn over everything — nearly opaque
    // dark except a small clear radius around the ship, so vision is the actual
    // gameplay constraint rather than a new spawn/damage rule.
    if (waveTheme === 'blackout' && Date.now() > themeEffectsAt) {
      const grad = ctx.createRadialGradient(player.x, player.y, player.r*3, player.x, player.y, player.r*8.4); // spotlight enlarged 20%
      grad.addColorStop(0, 'rgba(3,1,16,0)');
      grad.addColorStop(1, 'rgba(3,1,16,0.96)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
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
    ctx.restore(); // undo shake before HUD — text should stay stable/readable
    drawHUD();
    drawCaptiveObjectiveHUD();
    drawSockets();
    drawRescueBanner();
    drawTopBanner();
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
  function showTopBanner(text, kind) {
    topBanner = {
      text,
      color: kind === 'bad' ? '#ff4444' : '#00e5ff',
      startedAt: Date.now(),
    };
  }
  function drawTopBanner() {
    if (!topBanner) return;
    const elapsed = Date.now() - topBanner.startedAt;
    const total = TOP_BANNER_FADE_IN + TOP_BANNER_HOLD + TOP_BANNER_FADE_OUT;
    if (elapsed > total) { topBanner = null; return; }
    let a;
    if (elapsed < TOP_BANNER_FADE_IN) a = elapsed / TOP_BANNER_FADE_IN;
    else if (elapsed < TOP_BANNER_FADE_IN + TOP_BANNER_HOLD) a = 1;
    else a = 1 - (elapsed - TOP_BANNER_FADE_IN - TOP_BANNER_HOLD) / TOP_BANNER_FADE_OUT;
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
      orbitGlow('rgba(255,228,140,0.35)');
    } else if (name === 'COSMIC OCTO') {
      const spin = t * (attacking ? 2.2 : 0.55);
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
    } else {
      drawPixelSprite(creature.sprite, creature.palette, 0, 0, size / s);
    }
    ctx.restore();
  }

  const BOSS_PREVIEW_META = {
    'STAR OGRE': 'SHOOTS DONKEYS',
    'SKY DRAGON': 'FIRE BREATHER',
    'DARK KNIGHT': 'SWORD DART',
    'GRAY VISITOR': 'GREEN ORBS',
    'SPACE SHARK': 'SHARK TEETH',
    'MEAN TACO': 'SOMBREROS',
    'COSMIC OCTO': 'INK BURST',
    'GIZMO': 'TENNIS BALLS',
  };
  function bossPreviewList() {
    return [...BOSS_CREATURES, { name: 'GIZMO', isGizmo: true }];
  }
  let bossPreviewRaf = null;
  function renderSpaceBossPreviewCanvases() {
    const oldCtx = ctx;
    const oldBoss = boss;
    bossPreviewList().forEach((creature, i) => {
      const cv = document.getElementById(`space-boss-cv-${i}`);
      if (!cv) return;
      const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
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
        ${bossPreviewList().map((creature, i) => `
          <div class="space-boss-card">
            <canvas id="space-boss-cv-${i}" width="184" height="184"></canvas>
            <div class="space-boss-name">${creature.name}</div>
            <div class="space-boss-ability">${BOSS_PREVIEW_META[creature.name] || 'BOSS ATTACK'}</div>
            <button class="space-boss-practice" onclick="spaceDebugBoss('${creature.name}')">PRACTICE</button>
          </div>
        `).join('')}
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
      if (boss.isGizmo) {
        drawGizmoOrb(boss.r * 2.1);
      } else {
        drawThemedBoss(boss.creature, boss.r * 2.05);
      }
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
    ctx.fillText(boss.isCaptive ? 'CAPTIVE LOCK' : boss.guardedRescue && boss.captiveCi >= 0 ? `${boss.creature.name} HAS ${GAME_CHARS[boss.captiveCi].name}` : boss.creature.name, boss.x, barY - 6);
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

  function completeSpaceCampaign() {
    state = 'complete';
    clearSpaceRuntimeTimers();
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
            <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="nav('lobby')">BACK TO ARCADE</button>
          </div>
        </div>
      </div>`;
  }

  function showSpaceOverlay(mode) {
    try { if (mode === 'select' && !ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start(); } catch(e){}
    document.body.classList.toggle('arcade-selection-open', mode === 'select' || mode === 'boss-preview');
    if (mode === 'select' || mode === 'boss-preview') {
      if (typeof window.initArcadeFloat === 'function') window.initArcadeFloat(true);
    }
    const ov=document.getElementById('space-overlay');
    if(!ov) return;
    ov.classList.toggle('space-over', mode === 'over');
    ov.classList.toggle('space-boss-preview', mode === 'boss-preview');
    ov.style.justifyContent = mode === 'select' || mode === 'boss-preview' ? 'flex-start' : '';
    ov.style.paddingTop = mode === 'select' ? '16px' : '';
    setArcadeExitVisible(mode !== 'over');
    if(mode==='select'){
      const gc=GAME_CHARS[activeChar];
      ov.innerHTML=`
        <div class="whack-mode-shell" style="max-width:440px;margin-top:16px">
          <div class="whack-mode-title">GET READY</div>
          <div class="game-card whack-mode-card" style="border-color:#33ff6677;cursor:default;min-height:0">
            <div class="game-card-art" style="background:#0d0a1e">
              <div id="space-select-art" style="position:absolute;inset:0;z-index:0;opacity:0.40;transform:scale(1.26) translateY(10px);filter:saturate(1.18) brightness(1.02);pointer-events:none;mix-blend-mode:screen"></div>
            </div>
            <div class="game-card-info" style="position:relative;z-index:2;padding:14px 16px 16px;background:linear-gradient(to top, rgba(5,2,18,0.96) 74%, rgba(5,2,18,0.14) 100%)">
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:10px">
                <div style="font-family:'Bebas Neue',cursive;font-size:34px;letter-spacing:5px;line-height:1;color:#33ff66;text-shadow:0 0 14px #33ff6688">SPACE MOBE</div>
                <button class="space-boss-trigger" onclick="showSpaceOverlay('boss-preview')" aria-label="Preview bosses" title="Preview bosses">
                  <svg width="23" height="23" viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M5 13.2c0-4.2 3-7.2 7-7.2s7 3 7 7.2c0 3.5-2 5.8-4.8 6.6v-2.3h-1.4v2.6h-1.6v-2.6H9.8v2.3C7 19 5 16.7 5 13.2Z" fill="currentColor" opacity="0.95"/>
                    <circle cx="9.2" cy="13.1" r="1.6" fill="#030110"/>
                    <circle cx="14.8" cy="13.1" r="1.6" fill="#030110"/>
                    <path d="M9.1 9.2 7.2 7.6M14.9 9.2l1.9-1.6" stroke="#030110" stroke-width="1.8" stroke-linecap="round"/>
                  </svg>
                </button>
              </div>
              <div style="display:flex;align-items:center;gap:14px;width:100%">
                <div style="width:68px;height:68px;flex-shrink:0;border-radius:50%;background:${gc.color}33;display:flex;align-items:center;justify-content:center;border:2px solid ${gc.color}88;box-shadow:0 0 16px ${gc.color}44">
                  <div class="char-tilt" style="width:54px;height:54px">${charFace(gc,'normal')}</div>
                </div>
                <div style="text-align:left">
                  <div style="font-size:12px;letter-spacing:2px;color:rgba(242,239,232,0.5);font-family:'VCR',monospace">YOUR PILOT</div>
                  <div style="font-family:'Bebas Neue',cursive;font-size:30px;letter-spacing:4px;color:${gc.color};text-shadow:0 0 10px ${gc.color}88;line-height:1.1">${gc.name}</div>
                  <div style="font-size:11px;letter-spacing:1px;color:rgba(242,239,232,0.35);font-family:'VCR',monospace;margin-top:3px">CHANGE IN ARCADE MENU</div>
                </div>
              </div>
              <div style="width:100%;height:1px;background:rgba(242,239,232,0.1);margin:12px 0"></div>
              <div style="width:100%;display:flex;flex-direction:column;gap:14px;font-family:'VCR',monospace">
                <div style="display:flex;align-items:center;gap:14px">
                  <div style="font-size:14px;letter-spacing:2px;color:rgba(242,239,232,0.85);width:78px;flex-shrink:0">SHOOT</div>
                  <div style="display:flex;align-items:center;gap:10px">
                    <svg width="30" height="30" viewBox="0 0 30 30" style="flex-shrink:0">
                      <polygon points="15,3 22,8 27,15 22,24 14,27 7,22 3,14 9,5" fill="#5c526c" stroke="#7a6a90" stroke-width="1.5"/>
                    </svg>
                    <svg width="30" height="30" viewBox="0 0 30 30" style="flex-shrink:0">
                      <circle cx="15" cy="15" r="11" fill="#cc44ff"/>
                      <polyline points="6.5,1.5 1.5,1.5 1.5,6.5" fill="none" stroke="#ff4444" stroke-width="2.5" stroke-linecap="round"/>
                      <polyline points="23.5,1.5 28.5,1.5 28.5,6.5" fill="none" stroke="#ff4444" stroke-width="2.5" stroke-linecap="round"/>
                      <polyline points="1.5,23.5 1.5,28.5 6.5,28.5" fill="none" stroke="#ff4444" stroke-width="2.5" stroke-linecap="round"/>
                      <polyline points="28.5,23.5 28.5,28.5 23.5,28.5" fill="none" stroke="#ff4444" stroke-width="2.5" stroke-linecap="round"/>
                    </svg>
                    <svg width="30" height="30" viewBox="0 0 30 30" style="flex-shrink:0">
                      <defs>
                        <linearGradient id="spSelectMysteryGrad" x1="3" y1="3" x2="27" y2="27">
                          <stop offset="0" stop-color="#ff76d2"/>
                          <stop offset="0.5" stop-color="#cc66ff"/>
                          <stop offset="1" stop-color="#5ab1ff"/>
                        </linearGradient>
                        <linearGradient id="spSelectMysteryCrateGrad" x1="8" y1="7" x2="23" y2="23">
                          <stop offset="0" stop-color="#f7b45c"/>
                          <stop offset="0.48" stop-color="#9a5a2a"/>
                          <stop offset="1" stop-color="#5b2e7f"/>
                        </linearGradient>
                      </defs>
                      <circle cx="15" cy="15" r="13.5" fill="rgba(255,118,210,0.13)"/>
                      <rect x="7" y="7" width="16" height="16" rx="2.2" fill="url(#spSelectMysteryCrateGrad)" stroke="#ffe0a3" stroke-width="1.8"/>
                      <path d="M8.5 11.5 H21.5 M8.5 16 H21.5 M11.5 7.5 V22.5 M18.5 7.5 V22.5" stroke="rgba(47,24,42,0.45)" stroke-width="1"/>
                      <path d="M8.5 8.5 H13 M8.5 8.5 V13 M21.5 8.5 H17 M21.5 8.5 V13 M8.5 21.5 H13 M8.5 21.5 V17 M21.5 21.5 H17 M21.5 21.5 V17" fill="none" stroke="#ffd27a" stroke-width="1.5" stroke-linecap="round"/>
                      <text x="15" y="19.6" text-anchor="middle" font-family="'Bebas Neue', cursive" font-size="14" font-weight="bold" fill="#fff06a" stroke="#24103e" stroke-width="1.2">?</text>
                      <circle cx="15" cy="15" r="13" fill="none" stroke="rgba(255,120,220,0.34)" stroke-width="5.5"/>
                      <circle cx="15" cy="15" r="12" fill="none" stroke="url(#spSelectMysteryGrad)" stroke-width="3"/>
                      <circle cx="15" cy="3" r="2.1" fill="#fff"/>
                      <circle cx="27" cy="15" r="2.1" fill="#ff9be3"/>
                      <circle cx="15" cy="27" r="2.1" fill="#fff"/>
                      <circle cx="3" cy="15" r="2.1" fill="#ff9be3"/>
                    </svg>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:14px">
                  <div style="font-size:14px;letter-spacing:2px;color:rgba(242,239,232,0.85);width:78px;flex-shrink:0">RESCUE</div>
                  <div style="display:flex;align-items:center;gap:10px">
                    <svg width="34" height="34" viewBox="0 0 34 34" style="flex-shrink:0;overflow:visible">
                      <defs>
                        <linearGradient id="spSelectRescueGrad2" x1="2" y1="2" x2="32" y2="32">
                          <stop offset="0" stop-color="#5ab1ff"/>
                          <stop offset="0.48" stop-color="#00e5ff"/>
                          <stop offset="1" stop-color="#b9f7ff"/>
                        </linearGradient>
                      </defs>
                      <rect x="7" y="7" width="20" height="20" rx="2" fill="rgba(0,229,255,0.12)" stroke="#00e5ff" stroke-width="2"/>
                      <line x1="13" y1="7" x2="13" y2="27" stroke="rgba(234,255,255,0.78)" stroke-width="1.5"/>
                      <line x1="21" y1="7" x2="21" y2="27" stroke="rgba(234,255,255,0.78)" stroke-width="1.5"/>
                      <circle cx="17" cy="17" r="8.5" fill="#33d4e0"/>
                      <rect x="8.5" y="8.5" width="17" height="17" fill="rgba(0,229,255,0.24)"/>
                      <circle cx="17" cy="17" r="15" fill="none" stroke="rgba(90,190,255,0.26)" stroke-width="7"/>
                      <circle cx="17" cy="17" r="13.2" fill="none" stroke="url(#spSelectRescueGrad2)" stroke-width="2.8"/>
                      <circle cx="17" cy="3.8" r="2.3" fill="#eaffff"/>
                      <circle cx="30.2" cy="17" r="2.3" fill="#5ab1ff"/>
                      <circle cx="17" cy="30.2" r="2.3" fill="#eaffff"/>
                      <circle cx="3.8" cy="17" r="2.3" fill="#5ab1ff"/>
                    </svg>
                    <div style="font-size:11px;letter-spacing:1.5px;color:rgba(242,239,232,0.55);line-height:1.25">BREAK BLUE RINGS</div>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:14px">
                  <div style="font-size:14px;letter-spacing:2px;color:rgba(242,239,232,0.85);width:78px;flex-shrink:0">CATCH</div>
                  <div style="display:flex;align-items:center;gap:10px">
                    <img src="projectiles/hp_icon.png" alt="" style="width:30px;height:30px;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(51,255,102,0.45))">
                    <img src="projectiles/shield.png" alt="" style="width:30px;height:30px;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(0,229,255,0.45))">
                    <img src="projectiles/lightning.png" alt="" style="width:30px;height:30px;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(255,230,26,0.45))">
                    <img src="projectiles/bomb.png" alt="" style="width:30px;height:30px;object-fit:contain;flex-shrink:0;filter:drop-shadow(0 0 6px rgba(255,136,0,0.45))">
                  </div>
                </div>
              </div>
              <button class="whack-btn" style="width:100%;border-color:#33ff66;background:rgba(51,255,102,0.18);font-size:16px;letter-spacing:4px;padding:14px 40px;margin-top:12px" onclick="spaceStart()">LAUNCH!</button>
              <div class="space-debug-row" aria-label="Space campaign wave debug jumps 1 through 7">
                <button class="space-debug-chip" onclick="spaceDebugJump(1)">W1 AST</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(2)">W2 ENEMY</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(3)">W3 SWARM</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(4)">W4 OGRE</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(5)">W5 RECOVER</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(6)">W6 RESCUE</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(7)">W7 KNIGHT</button>
              </div>
              <div class="space-debug-row" aria-label="Space campaign wave debug jumps 8 through 13">
                <button class="space-debug-chip" onclick="spaceDebugJump(8)">W8 BLACKOUT</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(9)">W9 BOSS</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(10)">W10 MUSIC</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(11)">W11 BOSS</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(12)">W12 PREP</button>
                <button class="space-debug-chip" onclick="spaceDebugJump(13)">W13 FINAL</button>
              </div>
              <div class="space-debug-row" aria-label="Space boss playtests">
                <button class="space-debug-chip" onclick="spaceDebugBoss('STAR OGRE')">OGRE</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('SKY DRAGON')">DRAGON</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('DARK KNIGHT')">KNIGHT</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('GRAY VISITOR')">VISITOR</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('SPACE SHARK')">SHARK</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('MEAN TACO')">TACO</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('COSMIC OCTO')">OCTO</button>
                <button class="space-debug-chip" onclick="spaceDebugBoss('GIZMO')">GIZMO</button>
              </div>
            </div>
          </div>
        </div>`;
      mountSelectionArt('space-select-art', 'space');
    } else if(mode==='boss-preview'){
      ov.innerHTML = bossPreviewHTML();
      startSpaceBossPreviewAnimation();
    } else if(mode==='over'){
      setArcadeExitVisible(false);
      // Clear stale launch/select markup immediately; otherwise it can flash between
      // the in-game mission-failed beat and the leaderboard game-over card.
      ov.innerHTML = '';
      ov.classList.remove('hidden');
      const isNew=score>=parseInt(localStorage.getItem('space-best')||'0');
      const boardKey = getSpaceLeaderboardKey();
      const uid = 'space';
      showMissionFailedBeat(() => {
        ov.innerHTML = buildArcadeResultCard({
          uid,
          boardKey,
          artGame: 'space',
          color: '#33ff66',
          marquee: isNew && score > 0 ? 'GAME OVER' : 'GAME OVER',
          marqueeEnd: '#006622',
          scoreLabel: 'YOUR SCORE',
          scoreValue: score,
          saveValue: score,
          field: 'score',
          extra: `RESCUED ${rescuedChars.size}/${missionTrappedChars.length || SPACE_RESCUE_TARGET_COUNT} / WAVE ${wave}`,
          ascending: false,
          maxWidth: 410,
          minHeight: 330,
          saveMarginTop: 18,
          buttons: `
            <button class="whack-btn" style="border-color:#33ff66;background:rgba(51,255,102,0.30)" onclick="spaceStart()">PLAY AGAIN</button>
            <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="nav('lobby')">BACK TO ARCADE</button>
          `,
        });
        loadRemoteBoard(boardKey, `${uid}-board`, '#33ff66', 'score');
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
    SFX.blaster();
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
    ann.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:24px;pointer-events:none;background:rgba(5,2,18,0.92)';
    document.body.appendChild(ann);
    return ann;
  }
  function spEnsureIntroSkipButton(overlay, onSkip) {
    if (!overlay || !onSkip || overlay.querySelector('.intro-skip-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'intro-skip-btn';
    btn.textContent = 'SKIP';
    btn.style.cssText = "position:fixed;top:max(10px, env(safe-area-inset-top, 10px));right:calc(max(10px, env(safe-area-inset-right, 10px)) + 44px);z-index:10000;pointer-events:auto;height:32px;min-height:32px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;font-family:'VCR',monospace;font-size:10px;letter-spacing:2px;background:none;border:1px solid rgba(242,239,232,0.2);border-radius:6px;padding:0 12px;color:rgba(242,239,232,0.5);cursor:pointer";
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
          SFX.blaster && SFX.blaster();
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
          SFX.blaster && SFX.blaster();
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
          SFX.win && SFX.win();
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
          SFX.powerupCollect && SFX.powerupCollect();
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
          SFX.powerupCollect && SFX.powerupCollect();
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
          SFX.neonOn && SFX.neonOn();
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
    const isCaptor = mode === 'captor';
    const isZapped = mode === 'zapped';
    const isCarried = mode === 'carried';
    const border = isCaptor ? '#ff4444' : (isZapped || isCarried) ? '#00e5ff' : 'rgba(225,245,255,0.85)';
    const bg = isCaptor ? 'rgba(255,68,68,0.16)' : (isZapped || isCarried) ? 'rgba(0,229,255,0.11)' : 'rgba(120,210,255,0.1)';
    const glow = isCaptor ? 'rgba(255,68,68,0.46)' : (isZapped || isCarried) ? 'rgba(0,229,255,0.42)' : 'rgba(170,225,255,0.55)';
    const anim = isCaptor ? 'sp-brief-traitor-pop 0.62s ease-out both' : isCarried ? 'sp-brief-captive-out 1.6s ease-in both' : 'sp-brief-rock 1.65s ease-in-out infinite';
    const wash = isCaptor
      ? `<div style="position:absolute;inset:-6px;border-radius:15px;border:2px solid rgba(255,68,68,0.78);box-shadow:0 0 18px rgba(255,68,68,0.62);pointer-events:none"></div>
         <div style="position:absolute;inset:-10px;border-radius:17px;border:1px solid rgba(255,68,68,0.28);box-shadow:0 0 22px rgba(255,68,68,0.3);pointer-events:none"></div>`
      : (isZapped || isCarried)
        ? `<div style="position:absolute;inset:0;background:rgba(0,229,255,0.16);mix-blend-mode:screen;pointer-events:none"></div>
           <div style="position:absolute;left:-18%;right:-18%;top:46%;height:3px;background:#eaffff;box-shadow:0 0 10px #00e5ff;transform:rotate(-16deg);pointer-events:none"></div>`
        : '';
    const ring = (isZapped || isCarried)
      ? `<div style="position:absolute;inset:-5px;border-radius:50%;border:2px solid #00e5ff;box-shadow:0 0 14px rgba(0,229,255,0.75);animation:sp-ring-spin 2.2s linear infinite;pointer-events:none"></div>`
      : '';
    const label = isCaptor ? 'TRAITOR' : '';
    const faceExpr = (isZapped || isCarried) ? 'sad' : mode === 'happy' ? 'happy' : 'normal';
    const boxSize = isCaptor || isZapped || isCarried ? 68 : 62;
    return `<div class="sp-brief-face" style="width:${boxSize}px;text-align:center;font-family:'VCR',monospace;font-size:7.5px;letter-spacing:1px;color:${isCaptor ? border : 'rgba(242,239,232,0.68)'};transition:transform 0.35s ease,opacity 0.35s ease;animation:${anim};animation-delay:${(ci % 6) * 0.08}s">
      <div style="position:relative;width:${boxSize}px;height:${boxSize}px;border-radius:${isCaptor || isZapped || isCarried ? '13px' : '50%'};overflow:visible;border:${isCaptor || isZapped || isCarried ? `2px solid ${border}` : `1.5px solid ${border}`};background:${bg};box-shadow:0 0 ${isCaptor || isZapped || isCarried ? '15px' : '11px'} ${glow};${isCaptor ? 'filter:saturate(1.28) contrast(1.06)' : ''}">
        ${ring}
        <div style="position:absolute;inset:-5px">${charFace(gc, faceExpr)}</div>
        ${wash}
      </div>
      <div style="margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:rgba(242,239,232,0.68)">${gc.name}</div>
      ${label ? `<div style="margin-top:2px;color:${border}">${label}</div>` : ''}
    </div>`;
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
    const gridStyle = "display:grid;grid-template-columns:repeat(4,58px);justify-content:center;gap:12px 14px";
    const normalDayStage = `
      <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:4px;color:#ffe61a;text-shadow:0 0 12px #ffe61a;animation:sp-brief-line-in 0.35s ease-out both">ON A NORMAL MOBE DAY</div>`;
    const castStage = `
      <div style="font-family:'Bebas Neue',cursive;font-size:40px;letter-spacing:5px;line-height:1;color:#ffe61a;text-shadow:0 0 18px #ffe61a88;margin-bottom:14px;animation:sp-brief-line-in 0.35s ease-out both">8 MOBES WERE FROLICKING</div>
      <div style="${gridStyle}">${castGrid('normal', 'normal')}</div>`;
    const traitorLineStage = `
      <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:4px;color:#ff4444;text-shadow:0 0 12px #ff4444;animation:sp-brief-line-in 0.35s ease-out both">BUT TWO OF THEM WERE TRAITORS</div>`;
    const captorStage = `
      <div style="display:flex;justify-content:center;gap:18px;margin-bottom:10px">${missionEnemyChars.map(ci => spaceBriefingFace(ci, 'captor')).join('')}</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:52px;letter-spacing:5px;line-height:0.96;color:#ff4444;text-shadow:0 0 20px #ff444488;margin-bottom:14px;animation:sp-brief-line-in 0.35s ease-out both">"COME HERE, GIZMO"</div>
      <div style="${gridStyle}">${castGrid('captor', 'normal', true)}</div>`;
    const bossLineStage = `
      <div style="font-family:'Bebas Neue',cursive;font-size:48px;letter-spacing:5px;line-height:0.96;color:#cc66ff;text-shadow:0 0 18px #cc66ff88;animation:sp-brief-line-in 0.35s ease-out both">EVIL GIZMO TOOK THE MOBES CAPTIVE</div>`;
    const bossCaptureStage = `
      <div style="display:flex;justify-content:center;gap:16px;margin-bottom:8px">${missionEnemyChars.map(ci => `<div style="transform:scale(0.82);transform-origin:center bottom">${spaceBriefingFace(ci, 'captor')}</div>`).join('')}</div>
      <div style="display:flex;align-items:center;justify-content:center;gap:18px;margin-bottom:12px">${spaceBriefingBoss('in')}</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:44px;letter-spacing:5px;line-height:1;color:#00e5ff;text-shadow:0 0 18px #00e5ff88;margin-bottom:10px;opacity:0;animation:sp-brief-line-in 0.42s ease-out 1.1s both">CAPTIVE RINGS LOCKED!</div>
      <div style="${gridStyle};opacity:0;animation:sp-brief-line-in 0.42s ease-out 1.18s both">${castGrid('captor', 'zapped', true)}</div>`;
    // Sand grains scattered over the line's footprint, each drifting off in roughly
    // the same direction the text itself blurs/slides toward (sp-brief-dust-away),
    // so the line reads as crumbling into sand and blowing away rather than just fading.
    const sandGrainsHTML = Array.from({ length: 22 }, () => {
      const x = Math.round(Math.random() * 1000) / 10;
      const y = Math.round(40 + Math.random() * 20);
      const dx = Math.round(40 + Math.random() * 70);
      const dy = Math.round(-26 + Math.random() * 30);
      const size = Math.round((1.4 + Math.random() * 2.6) * 10) / 10;
      const delay = (2.05 + Math.random() * 0.55).toFixed(2);
      const dur = (0.7 + Math.random() * 0.5).toFixed(2);
      return `<i style="position:absolute;left:${x}%;top:${y}%;width:${size}px;height:${size}px;border-radius:50%;background:#ff9ad6;box-shadow:0 0 ${size * 2}px rgba(255,154,214,0.7);--dx:${dx}px;--dy:${dy}px;animation:sp-brief-sand-grain ${dur}s ease-out ${delay}s forwards"></i>`;
    }).join('');
    const abductStage = `
      <div style="min-height:232px;display:flex;align-items:center;justify-content:center;position:relative">
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
    SFX.missionSignal && SFX.missionSignal();
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

  window.spaceStart=function(){
    ArcadeMusic.stop();
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
  window.spaceDebugJump=function(startWave){
    ArcadeMusic.stop();
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
  window.spaceDebugBoss=function(bossName){
    ArcadeMusic.stop();
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
    document.querySelectorAll('.space-rescue-briefing').forEach(el => el.remove());
    const _ov=document.getElementById('space-overlay');
    if(_ov) _ov.classList.add('hidden');
  };
  window.initSpace=function(){
    activeChar=getGlobalChar();
    canvas=document.getElementById('space-canvas');
    if(!canvas)return;
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
      // Desktop: click a socket to deploy it, or number keys 1-4 as a shortcut.
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
        player.y = H - SPACE_SHIP_BOTTOM_OFFSET;
        socketAnchorY = H - SPACE_SOCKET_ANCHOR_BOTTOM_OFFSET;
        dangerY = socketAnchorY + (H - socketAnchorY) * 0.5;
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
        const keys = {whack:'whack-best-survival',match:'match-best-score',space:'space-best'};
        const val = localStorage.getItem(keys[key]);
        if (val) hiEl.textContent = `HI SCORE: ${val}`;
      }
    });
  };
})();
