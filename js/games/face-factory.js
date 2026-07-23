// FACE FACTORY — gentle family-face play: reels, an eight-piece puzzle, and mix-and-match faces.
(() => {
  let screen = 'menu';
  let timers = [];
  let puzzle = null;
  let selectedPiece = null;
  let mixChars = [0, 1, 2];
  let mixPool = [];
  let mixWon = false;
  let tuneMode = false;
  let tunePart = 0;
  let guess = null;
  let builderChar = 0;
  let builderPoint = 'leftEye';
  let builderDragging = null;
  let builderReturnMode = 'tune';
  let builderResetArmed = false;
  let reelCoins = 0;
  let reelRound = 1;
  let reelAttemptsLeft = 3;
  let reelHeld = [false, false, false];
  let reelHasSpun = false;
  let reelBusy = false;
  let reelRoundComplete = false;
  let portraitStyleIndex = 0;

  const FACE_TUNING_KEY = 'face-factory-landmarks';
  const FACE_TUNING_LEGACY_KEYS = ['face-factory-landmarks-v5', 'face-factory-landmarks-v4'];
  const REEL_ROUNDS = 3;
  const REEL_ATTEMPTS = 3;
  const builderEnabled = new URLSearchParams(window.location.search).has('facebuilder');
  let faceTuning = (() => {
    for (const key of [FACE_TUNING_KEY, ...FACE_TUNING_LEGACY_KEYS]) {
      try {
        const saved = JSON.parse(localStorage.getItem(key) || 'null');
        if (saved && typeof saved === 'object') {
          if (key !== FACE_TUNING_KEY) localStorage.setItem(FACE_TUNING_KEY, JSON.stringify(saved));
          return saved;
        }
      } catch (_) {}
    }
    return {};
  })();

  const wrap = () => document.getElementById('face-factory-wrap');
  const rand = n => Math.floor(Math.random() * n);
  const shuffle = list => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const FACE_FACTORY_CHARS = GAME_CHARS.map((character, i) => ({character, i})).filter(({character}) => character.name !== 'TONY').map(({i}) => i);
  const FIX_CHARS = FACE_FACTORY_CHARS.filter(ci => !['POPPY', 'THOMAS'].includes(GAME_CHARS[ci].name));
  const FUNNY_START_CHARS = ['TED', 'GRANDMA', 'SHE-SHE'].map(name => GAME_CHARS.findIndex(character => character.name === name));
  const FEMALE_FACE_NAMES = new Set(['KRISTEN', 'DAWN', 'GRANDMA', 'POPPY', 'SHE-SHE', 'ROSIE', 'LEANNE', 'LINDSAY', 'DEBBIE', 'RUTH']);
  const faceGender = ci => FEMALE_FACE_NAMES.has(GAME_CHARS[ci].name) ? 'female' : 'male';
  const charsForPart = part => FACE_FACTORY_CHARS.filter(ci => {
    const name = GAME_CHARS[ci].name;
    return !((part === 0 || part === 1) && name === 'POPPY')
      && !(part === 1 && ['TED', 'EDDIE'].includes(name))
      && !(part === 2 && name === 'THOMAS');
  });
  const mixCharsForPart = (part, pool = mixPool) => pool.filter(ci => charsForPart(part).includes(ci));
  const randomChar = (pool = FACE_FACTORY_CHARS) => pool[rand(pool.length)];
  const distinctChars = (count, pool = FACE_FACTORY_CHARS) => shuffle(pool).slice(0, count);
  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.push({ type: 'timeout', id });
    return id;
  };
  function clearTimers() {
    timers.forEach(t => {
      if (t.type === 'interval') clearInterval(t.id);
      else if (t.type === 'animation') {
        try { t.id.cancel(); } catch (_) {}
      } else if (t.type === 'raf') cancelAnimationFrame(t.id);
      else clearTimeout(t.id);
    });
    timers = [];
    document.querySelectorAll('.ff-coin-rain').forEach(effect => effect.remove());
  }
  function sound(name, ...args) {
    try { if (typeof SFX !== 'undefined' && typeof SFX[name] === 'function') SFX[name](...args); } catch (_) {}
  }
  function celebrate(big, soundName = big ? 'mysteryGood' : 'match') {
    if (soundName) sound(soundName);
    try { ticketConfetti(!big); } catch (_) {}
  }
  function coinRain(count = 16, won = 1, startingCoins = Math.max(0, reelCoins - won)) {
    const shell = document.querySelector('.ff-shell');
    if (!shell) return;
    const rain = document.createElement('div');
    rain.className = 'ff-coin-rain';
    const payoutDuration = 1150;
    const dispenseWindow = Math.min(900, 180 + count * 42);
    rain.innerHTML = `
      <div class="ff-coin-award" role="status" aria-live="polite">
        <span>+</span><strong>${won}</strong><small>${won === 1 ? 'COIN' : 'COINS'}</small>
      </div>
      <div class="ff-coin-stream" aria-hidden="true">${
        Array.from({ length:count }, (_, i) => {
          const lane = count === 1 ? .5 : i / (count - 1);
          const left = 8 + lane * 84 + (Math.random() - .5) * 7;
          const delay = Math.round((i / Math.max(1, count - 1)) * dispenseWindow);
          const duration = payoutDuration + Math.round((Math.random() - .5) * 140);
          const drift = -34 + Math.random() * 68;
          const spin = 540 + Math.round(Math.random() * 540);
          return `<i style="--coin-left:${left.toFixed(1)}%;--coin-delay:${delay}ms;--coin-duration:${duration}ms;--coin-drift:${drift.toFixed(0)}px;--coin-spin:${spin}deg"><b><span>$</span></b></i>`;
        }).join('')
      }</div>`;
    shell.appendChild(rain);

    const tickCount = Math.max(1, won);
    const tickWindow = Math.min(760, 90 * Math.max(0, tickCount - 1));
    for (let step = 0; step < tickCount; step++) {
      const delay = 180 + (tickCount === 1 ? 0 : Math.round(step / (tickCount - 1) * tickWindow));
      later(() => {
        const coinHud = document.getElementById('ff-reel-coins');
        if (coinHud) coinHud.textContent = startingCoins + step + 1;
        sound('slotTick');
      }, delay);
    }
    later(() => sound('slotLand'), 180 + tickWindow + 110);

    let finished = 0;
    const coins = rain.querySelectorAll('.ff-coin-stream > i');
    coins.forEach(coin => coin.addEventListener('animationend', () => {
      finished++;
      if (finished === coins.length) later(() => rain.remove(), 180);
    }, { once:true }));
    later(() => rain.remove(), dispenseWindow + payoutDuration + 700);
  }
  function spark(el) {
    if (!el) return;
    el.classList.remove('ff-holo', 'ff-celebrate');
    void el.offsetWidth;
    el.classList.add('ff-holo', 'ff-celebrate');
    const burst = document.createElement('span');
    burst.className = 'ff-spark-burst';
    burst.innerHTML = '<i></i><i></i><i></i><i></i>';
    el.appendChild(burst);
    later(() => burst.remove(), 950);
    later(() => el.classList.remove('ff-holo', 'ff-celebrate'), 1250);
  }

  function shell(title, content, backAction = "faceFactoryShowMenu()") {
    const topbar = screen === 'menu'
      ? '<div class="ff-topbar" aria-hidden="true"></div>'
      : `<div class="ff-topbar"><button class="ff-back" type="button" onclick="${backAction}">◀ GAMES</button></div>`;
    return `<div class="ff-shell">
      ${topbar}
      <main class="ff-screen">${content}</main>
    </div>`;
  }
  function previewFeature(type, variant = 0) {
    const art = {
      star: `<path d="M30 6l6.4 13 14.3 2.1-10.4 10.1 2.5 14.3L30 38.8l-12.8 6.7 2.5-14.3L9.3 21.1 23.6 19z"/>`,
      eyes: variant
        ? `<path d="M10 29c5-10 13-10 18 0M32 29c5-10 13-10 18 0"/><path class="ff-icon-fill" d="M16 34l-4 9 8-2zm28 0l-4 9 8-2z"/>`
        : `<path d="M8 31c5-12 15-12 20 0M32 31c5-12 15-12 20 0"/><circle class="ff-icon-fill" cx="20" cy="28" r="3"/><circle class="ff-icon-fill" cx="44" cy="28" r="3"/>`,
      nose: `<path d="M31 12l-7 25 8 5 9-5"/><path d="M23 46c5 3 13 3 18 0"/>`,
      smile: variant
        ? `<path d="M10 24c8 24 32 24 40 0-11 7-29 7-40 0z"/><path d="M18 31h24"/>`
        : `<path d="M10 22c8 27 32 27 40 0"/><path d="M17 25c8 7 18 7 26 0"/>`,
      bolt: `<path d="M35 5L17 32h12l-4 23 18-30H31z"/>`,
      heart: `<path d="M30 49S9 37 9 20c0-12 15-15 21-5 6-10 21-7 21 5 0 17-21 29-21 29z"/>`
    };
    return `<svg viewBox="0 0 60 60" aria-hidden="true" focusable="false">${art[type]}</svg>`;
  }
  function reelsModePreview() {
    return `<div class="ff-mode-preview ff-mode-reels-preview" aria-hidden="true">
      <div class="ff-preview-reel-bank">
        <i>${previewFeature('star')}</i><i>${previewFeature('eyes', 1)}</i><i>${previewFeature('smile', 1)}</i>
      </div>
      <div class="ff-preview-reel-controls"><span></span><span></span><b></b></div>
    </div>`;
  }
  function puzzleModePreview() {
    return `<div class="ff-mode-preview ff-mode-puzzle-preview" aria-hidden="true">
      <div class="ff-preview-puzzle-board">
        <i>${previewFeature('eyes')}</i><i>${previewFeature('nose')}</i><i>${previewFeature('smile')}</i><i class="ff-preview-empty">+</i>
      </div>
      <div class="ff-preview-move-arrow">➜</div>
      <div class="ff-preview-piece-tray"><i>${previewFeature('heart')}</i><i>${previewFeature('bolt')}</i><i>${previewFeature('star')}</i></div>
    </div>`;
  }
  function crazyModePreview() {
    return `<div class="ff-mode-preview ff-mode-crazy-preview" aria-hidden="true">
      <div class="ff-preview-strip"><b>◀</b><i>${previewFeature('eyes', 1)}</i><b>▶</b></div>
      <div class="ff-preview-strip"><b>◀</b><i>${previewFeature('nose')}</i><b>▶</b></div>
      <div class="ff-preview-strip"><b>◀</b><i>${previewFeature('smile')}</i><b>▶</b></div>
    </div>`;
  }

  window.initFaceFactory = function() {
    clearTimers();
    if (builderEnabled) {
      screen = 'crazy';
      renderBuilder();
    } else {
      screen = 'menu';
      renderMenu();
    }
  };
  window.faceFactoryLaunch = function(event) {
    event?.preventDefault();
    event?.stopPropagation();
    sound('menuSelect');
    if (typeof nav === 'function') nav('facefactory');
    else {
      document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
      document.getElementById('pg-facefactory')?.classList.add('active');
      document.body.className = 'on-facefactory';
      window.initFaceFactory();
    }
    return false;
  };
  window.faceFactoryBack = function() { clearTimers(); };
  window.faceFactoryShowMenu = function() {
    clearTimers();
    screen = 'menu';
    sound('menuSelect');
    renderMenu();
  };

  function renderMenu() {
    const root = wrap();
    if (!root) return;
    setArcadeModeSelect(true);
    root.innerHTML = shell('FACE FACTORY', `
      <div class="ff-title">FACE FACTORY</div>
      <div class="ff-subtitle">THREE WAYS TO PLAY WITH THE FAMILY</div>
      <div class="ff-mode-grid">
        <button class="ff-mode-card" style="--mode-color:#ffe61a" type="button" onclick="faceFactoryOpen('puzzle')">
          ${puzzleModePreview()}<strong>BUILD THE FACES</strong><span>TWO FACES<br>EIGHT BIG PIECES</span>
        </button>
        <button class="ff-mode-card" style="--mode-color:#00e5ff" type="button" onclick="faceFactoryOpen('crazy')">
          ${crazyModePreview()}<strong>CRAZY FACE</strong><span>MIX THE EYES<br>NOSE AND SMILE</span>
        </button>
        <button class="ff-mode-card" style="--mode-color:#ff66dd" type="button" onclick="faceFactoryOpen('reels')">
          ${reelsModePreview()}<strong>FACE REELS</strong><span>SPIN · HOLD<br>AND MATCH</span>
        </button>
      </div>`, "SFX.menuSelect();nav('lobby')");
  }

  window.faceFactoryOpen = function(next) {
    clearTimers();
    screen = next;
    setArcadeModeSelect(false);
    sound('menuSelect');
    if (next === 'reels') renderReels();
    if (next === 'puzzle') startPuzzle();
    if (next === 'crazy') renderCrazyMixer(true);
  };

  // ── FACE REELS ──────────────────────────────────────────────────────────
  function reelCell(ci, expr) {
    const c = GAME_CHARS[ci];
    const src = expr === 'happy' ? (c.imgHappy || c.img) : c.img;
    return `<div class="ff-reel-cell"><span class="ff-reel-name">${c.name}</span><img src="${src}" alt="${c.name}"></div>`;
  }
  function reelMarkup(ci, i) {
    return `<div class="ff-reel-unit" id="ff-reel-unit-${i}">
      <button class="ff-reel" id="ff-reel-${i}" type="button" aria-label="Hold reel ${i + 1}" aria-pressed="false" onclick="faceFactoryToggleHold(${i})" disabled>
        <div class="ff-reel-strip" id="ff-reel-strip-${i}">${reelCell(ci)}</div>
        <span class="ff-reel-lock">HELD</span>
      </button>
      <span class="ff-hold-status" id="ff-hold-status-${i}">SPIN FIRST</span>
    </div>`;
  }
  function reelHudIcon(type) {
    if (type === 'coin') return `<svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="17"/><circle cx="20" cy="20" r="10"/><text x="20" y="26">$</text></svg>`;
    if (type === 'round') return `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M31 12a14 14 0 1 0 2 14"/><path d="M25 8h8v8"/></svg>`;
    return `<svg viewBox="0 0 40 40" aria-hidden="true"><rect x="7" y="9" width="26" height="22" rx="5"/><path d="M14 13v14m6-14v14m6-14v14"/><path d="M10 35h20"/></svg>`;
  }
  function renderReels() {
    mixChars = distinctChars(3);
    reelCoins = 0;
    reelRound = 1;
    reelAttemptsLeft = REEL_ATTEMPTS;
    reelHeld = [false, false, false];
    reelHasSpun = false;
    reelBusy = false;
    reelRoundComplete = false;
    wrap().innerHTML = shell('FACE REELS', `<section class="ff-panel">
      <div class="ff-reel-marquee">
        <div class="ff-marquee-lights" aria-hidden="true">${Array.from({length:11}, () => '<i></i>').join('')}</div>
        <div class="ff-title">FACE REELS</div>
        <div class="ff-marquee-lights" aria-hidden="true">${Array.from({length:11}, () => '<i></i>').join('')}</div>
      </div>
      <div class="ff-reel-hud">
        <div class="ff-coin-bank"><i>${reelHudIcon('coin')}</i><span><small>COINS</small><strong id="ff-reel-coins">0</strong></span></div>
        <div class="ff-reel-stat"><i>${reelHudIcon('round')}</i><span><small>ROUND</small><strong id="ff-reel-round">1/3</strong></span></div>
        <div class="ff-reel-stat"><i>${reelHudIcon('spin')}</i><span><small>SPINS</small><strong id="ff-reel-tries">3</strong></span></div>
      </div>
      <div class="ff-reels" id="ff-reels">${mixChars.map(reelMarkup).join('')}</div>
      <div class="ff-message" id="ff-reel-message" aria-live="polite">SPIN · THEN HOLD A FACE YOU WANT TO KEEP</div>
      <button class="ff-big-button" id="ff-spin-button" type="button" onclick="faceFactorySpin()">SPIN</button>
    </section>`);
  }
  function setReel(i, ci, expr) {
    const reel = document.getElementById(`ff-reel-${i}`);
    const strip = document.getElementById(`ff-reel-strip-${i}`);
    if (!reel || !strip) return;
    strip.getAnimations?.().forEach(animation => animation.cancel());
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    strip.innerHTML = reelCell(ci, expr);
    reel.classList.remove('rolling', 'slowing', 'settling', 'ff-reel-match');
  }
  function updateReelHud() {
    const coins = document.getElementById('ff-reel-coins');
    const round = document.getElementById('ff-reel-round');
    const tries = document.getElementById('ff-reel-tries');
    if (coins) coins.textContent = reelCoins;
    if (round) round.textContent = `${reelRound}/${REEL_ROUNDS}`;
    if (tries) tries.textContent = reelAttemptsLeft;
  }
  function updateHoldControls(enabled = reelHasSpun && !reelRoundComplete && !reelBusy) {
    reelHeld.forEach((held, i) => {
      const reel = document.getElementById(`ff-reel-${i}`);
      const unit = document.getElementById(`ff-reel-unit-${i}`);
      const status = document.getElementById(`ff-hold-status-${i}`);
      if (reel) {
        reel.disabled = !enabled;
        reel.setAttribute('aria-pressed', held ? 'true' : 'false');
      }
      unit?.classList.toggle('held', held);
      if (status) status.textContent = enabled ? (held ? 'HELD' : 'TAP TO HOLD') : (held ? 'HELD' : reelHasSpun ? 'WAIT' : 'SPIN FIRST');
    });
  }
  function chooseReelFinals() {
    if (!reelHasSpun || !reelHeld.some(Boolean)) {
      const roll = Math.random();
      if (roll < .12) {
        const ci = randomChar();
        return [ci, ci, ci];
      }
      if (roll < .52) {
        const pair = randomChar();
        let other = randomChar();
        while (other === pair) other = randomChar();
        return shuffle([pair, pair, other]);
      }
      return distinctChars(3);
    }
    const finals = mixChars.slice();
    const heldValues = reelHeld.map((held, i) => held ? mixChars[i] : null).filter(value => value !== null);
    const target = heldValues.find((value, index) => heldValues.indexOf(value) !== index) ?? heldValues[0];
    const targetChance = heldValues.every(value => value === target) && heldValues.length > 1 ? .48 : .34;
    reelHeld.forEach((held, i) => {
      if (!held) finals[i] = Math.random() < targetChance ? target : randomChar();
    });
    return finals;
  }
  function startReelTickTrack(activeReels) {
    const expectedDuration = 2000 + Math.max(0, activeReels - 1) * 800;
    const startedAt = performance.now();
    const tick = () => {
      if (!reelBusy) return;
      sound('slotTick');
      const progress = Math.min(1, (performance.now() - startedAt) / expectedDuration);
      const slowdown = Math.max(0, (progress - .58) / .42);
      const delay = 80 + Math.round(105 * slowdown * slowdown);
      later(tick, delay);
    };
    later(tick, 100);
  }
  function rollReel(i, finalCi, stopOrder, done) {
    const reel = document.getElementById(`ff-reel-${i}`);
    const strip = document.getElementById(`ff-reel-strip-${i}`);
    if (!reel || !strip) { done(); return; }
    const cruiseDuration = 1000 + stopOrder * 800;
    const decelDuration = 1000;
    const cruiseCells = 10 + stopOrder * 8;
    const decelCells = 7;
    const totalSteps = cruiseCells + decelCells;
    const fillers = [];
    let previous = mixChars[i];
    for (let step = 0; step < totalSteps - 1; step++) {
      const pool = FACE_FACTORY_CHARS.filter(ci => ci !== finalCi && ci !== previous);
      previous = randomChar(pool);
      fillers.push(previous);
    }
    const trail = [mixChars[i], ...fillers, finalCi];
    strip.innerHTML = trail.map(ci => reelCell(ci)).join('');
    strip.style.transition = 'none';
    strip.style.transform = 'translateY(0)';
    reel.classList.add('rolling');
    void strip.offsetHeight;
    const totalCells = trail.length - 1;
    const decelCellsActual = totalCells - cruiseCells;
    const startedAt = performance.now();
    const rafTimer = { type:'raf', id:0 };
    const settleCurve = progress => (-4 * progress ** 3 + progress ** 2 + 10 * progress) / 7;
    const frame = now => {
      const elapsed = Math.min(cruiseDuration + decelDuration, now - startedAt);
      let cells;
      if (elapsed <= cruiseDuration) {
        cells = cruiseCells * (elapsed / cruiseDuration);
      } else {
        const progress = Math.min(1, (elapsed - cruiseDuration) / decelDuration);
        cells = cruiseCells + decelCellsActual * settleCurve(progress);
      }
      strip.style.transform = `translateY(-${(cells * 100).toFixed(3)}%)`;
      if (elapsed < cruiseDuration + decelDuration) {
        rafTimer.id = requestAnimationFrame(frame);
        return;
      }
      setReel(i, finalCi, 'happy');
      reel.classList.add('settling');
      later(() => reel.classList.remove('settling'), 320);
      done();
    };
    timers.push(rafTimer);
    rafTimer.id = requestAnimationFrame(frame);
    later(() => reel.classList.add('slowing'), cruiseDuration);
  }
  window.faceFactoryToggleHold = function(i) {
    if (reelBusy || reelRoundComplete || !reelHasSpun || reelAttemptsLeft <= 0) return;
    if (!reelHeld[i] && reelHeld.filter(Boolean).length >= 2) {
      const msg = document.getElementById('ff-reel-message');
      if (msg) msg.textContent = 'KEEP ONE REEL SPINNING';
      sound('menuSelect');
      return;
    }
    reelHeld[i] = !reelHeld[i];
    sound('menuSelect');
    updateHoldControls();
  };
  function startNextReelRound() {
    reelRound++;
    reelAttemptsLeft = REEL_ATTEMPTS;
    reelHeld = [false, false, false];
    reelHasSpun = false;
    reelRoundComplete = false;
    mixChars = distinctChars(3);
    mixChars.forEach((ci, i) => setReel(i, ci));
    updateReelHud();
    updateHoldControls(false);
    const msg = document.getElementById('ff-reel-message');
    if (msg) msg.textContent = `ROUND ${reelRound} · SPIN, THEN HOLD A FACE`;
    const btn = document.getElementById('ff-spin-button');
    if (btn) { btn.disabled = false; btn.textContent = 'SPIN'; }
  }
  function reelMatch(finals) {
    const all = finals[0] === finals[1] && finals[1] === finals[2];
    const pair = !all && (finals[0] === finals[1] || finals[0] === finals[2] || finals[1] === finals[2]);
    const match = all ? finals[0] : pair ? finals.find((value, i) => finals.indexOf(value) !== i) : null;
    return { all, pair, match };
  }
  window.faceFactorySpin = function() {
    const btn = document.getElementById('ff-spin-button');
    if (!btn || btn.disabled) return;
    if (reelRoundComplete) {
      if (reelRound >= REEL_ROUNDS) renderReels();
      else startNextReelRound();
      return;
    }
    clearTimers();
    reelBusy = true;
    btn.disabled = true;
    btn.textContent = 'ROLLING';
    const msg = document.getElementById('ff-reel-message');
    if (msg) msg.textContent = 'ROUND AND ROUND...';
    sound('boxOpen');
    updateHoldControls(false);
    const finals = chooseReelFinals();
    const active = [0,1,2].filter(i => !reelHeld[i]);
    startReelTickTrack(active.length);
    const visible = [0,1,2].filter(i => reelHeld[i]);
    let stopped = 0;
    active.forEach((i, order) => {
      rollReel(i, finals[i], order, () => {
        spark(document.getElementById(`ff-reel-${i}`));
        sound('slotLand');
        const matchesVisibleFace = visible.some(visibleIndex => finals[visibleIndex] === finals[i]);
        visible.push(i);
        const completesJackpot = visible.length === 3 && finals[0] === finals[1] && finals[1] === finals[2];
        if (matchesVisibleFace && !completesJackpot) sound('reelPair');
        stopped++;
        if (stopped === active.length) finishSpin(finals);
      });
    });
  };
  function finishSpin(finals) {
    mixChars = finals.slice();
    reelHasSpun = true;
    reelAttemptsLeft--;
    reelBusy = false;
    const { all, pair, match } = reelMatch(finals);
    const msg = document.getElementById('ff-reel-message');
    updateReelHud();
    if (all || reelAttemptsLeft === 0) {
      finishReelRound({ all, pair, match });
      return;
    }
    if (pair) {
      if (msg) msg.textContent = `${GAME_CHARS[match].name} PAIR · TAP BOTH TO HOLD`;
      document.querySelectorAll('.ff-reel').forEach((reel, i) => reel.classList.toggle('ff-reel-match', finals[i] === match));
    } else {
      if (msg) msg.textContent = 'TAP ONE FACE TO HOLD IT · THEN SPIN AGAIN';
    }
    const btn = document.getElementById('ff-spin-button');
    if (btn) { btn.disabled = false; btn.textContent = `SPIN · ${reelAttemptsLeft} LEFT`; }
    updateHoldControls();
  }
  function finishReelRound({ all, pair, match }) {
    reelRoundComplete = true;
    reelHeld = [false, false, false];
    const won = all ? 10 : pair ? 4 : 1;
    const startingCoins = reelCoins;
    reelCoins += won;
    const msg = document.getElementById('ff-reel-message');
    if (all) {
      if (msg) msg.textContent = `JACKPOT · THREE ${GAME_CHARS[match].name}S · +10 COINS`;
      document.querySelectorAll('.ff-reel').forEach(spark);
      celebrate(true, 'reelJackpot');
      coinRain(24, won, startingCoins);
    } else if (pair) {
      if (msg) msg.textContent = `${GAME_CHARS[match].name} PAIR · +4 COINS`;
      document.querySelectorAll('.ff-reel').forEach((reel, i) => { if (mixChars[i] === match) spark(reel); });
      celebrate(false, '');
      coinRain(11, won, startingCoins);
    } else if (msg) {
      msg.textContent = 'ROUND COMPLETE · +1 COIN';
      coinRain(5, won, startingCoins);
    }
    updateHoldControls(false);
    const round = document.getElementById('ff-reel-round');
    const tries = document.getElementById('ff-reel-tries');
    if (round) round.textContent = `${reelRound}/${REEL_ROUNDS}`;
    if (tries) tries.textContent = reelAttemptsLeft;
    const btn = document.getElementById('ff-spin-button');
    if (!btn) return;
    btn.disabled = true;
    if (reelRound < REEL_ROUNDS) {
      btn.textContent = 'NEXT ROUND';
    } else {
      if (msg) msg.textContent += ` · ${reelCoins} COINS TOTAL`;
      btn.textContent = 'PLAY AGAIN';
    }
    later(() => {
      if (document.getElementById('ff-spin-button') === btn) btn.disabled = false;
    }, 1150);
  }

  // ── EIGHT-PIECE / TWO-FACE PUZZLE ──────────────────────────────────────
  const PUZZLE_SIDE_COLORS = ['#44ccff', '#9933e0']; // Tommy teal · Grandma purple
  function puzzleSideColor(ci) {
    const side = Math.max(0, puzzle?.chars.indexOf(ci) ?? 0);
    return PUZZLE_SIDE_COLORS[Math.min(side, PUZZLE_SIDE_COLORS.length - 1)];
  }
  function pieceStyle(ci) {
    return `--piece-color:${puzzleSideColor(ci)}`;
  }
  function puzzlePieceArt(ci, pos) {
    // The portraits are first normalized to their visible alpha silhouette, then
    // divided in half in each direction. This cuts the face itself into four
    // pieces instead of cutting the surrounding 512px image canvas.
    const faceX = 44;
    const faceY = 44;
    const pieceW = 212;
    const pieceH = 212;
    const x = faceX + (pos % 2) * pieceW;
    const y = faceY + (pos > 1 ? pieceH : 0);
    return `<svg viewBox="${x} ${y} ${pieceW} ${pieceH}" preserveAspectRatio="none" aria-hidden="true">${puzzleFaceImage(ci)}</svg>`;
  }
  function makePiece(ci, pos, id) {
    return `<button class="ff-piece" id="${id}" type="button" draggable="true" data-ci="${ci}" data-pos="${pos}" style="${pieceStyle(ci, pos)}" aria-label="Piece of ${GAME_CHARS[ci].name}" onclick="faceFactorySelectPiece('${id}')" ondragstart="faceFactoryDragPiece(event,'${id}')">${puzzlePieceArt(ci, pos)}</button>`;
  }
  function startPuzzle() {
    const chars = distinctChars(2);
    puzzle = { chars, placed: 0, showHint: false };
    selectedPiece = null;
    const pieces = shuffle(chars.flatMap(ci => [0, 1, 2, 3].map(pos => ({ ci, pos }))));
    const boards = chars.map(ci => `<div class="ff-puzzle-person">
      <div class="ff-person-name" style="color:${puzzleSideColor(ci)}">${GAME_CHARS[ci].name}</div>
      <div class="ff-puzzle-board" data-board="${ci}" style="--person-color:${puzzleSideColor(ci)}">
        <div class="ff-puzzle-guide" aria-hidden="true"><svg viewBox="44 44 424 424" preserveAspectRatio="none">${puzzleFaceImage(ci)}</svg></div>
        ${[0,1,2,3].map(pos => `<div class="ff-target" data-ci="${ci}" data-pos="${pos}" onclick="faceFactoryPlacePiece(this)" ondragover="event.preventDefault()" ondrop="faceFactoryDropPiece(event,this)"></div>`).join('')}
      </div>
    </div>`).join('');
    wrap().innerHTML = shell('BUILD THE FACES', `<section class="ff-panel">
      <div class="ff-title">BUILD THE FACES</div>
      <div class="ff-subtitle">TAP A PIECE · THEN TAP WHERE IT BELONGS</div>
      <div class="ff-message" id="ff-puzzle-message">PICK ANY PIECE</div>
      <div class="ff-puzzle-stage">${boards}</div>
      <div class="ff-piece-tray" id="ff-piece-tray">${pieces.map((p, i) => makePiece(p.ci, p.pos, `ff-piece-${i}`)).join('')}</div>
      <div class="ff-small-actions" id="ff-puzzle-actions"><button class="ff-small-btn" id="ff-puzzle-hint" type="button" onclick="faceFactoryPuzzleHint()">HINT</button><button class="ff-small-btn" type="button" onclick="faceFactoryNewPuzzle()">NEW FACES</button></div>
    </section>`);
  }
  window.faceFactoryNewPuzzle = function() { clearTimers(); sound('menuSelect'); startPuzzle(); };
  window.faceFactorySelectPiece = function(id) {
    const piece = document.getElementById(id);
    if (!piece || piece.closest('.ff-target')) return;
    document.querySelectorAll('.ff-piece.selected').forEach(el => el.classList.remove('selected'));
    selectedPiece = id;
    piece.classList.add('selected');
    sound('charPick', +piece.dataset.ci % 8);
    const msg = document.getElementById('ff-puzzle-message');
    if (msg) msg.textContent = `A PIECE OF ${GAME_CHARS[+piece.dataset.ci].name}`;
  };
  window.faceFactoryDragPiece = function(event, id) {
    selectedPiece = id;
    event.dataTransfer?.setData('text/plain', id);
  };
  window.faceFactoryDropPiece = function(event, target) {
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/plain');
    if (id) selectedPiece = id;
    placeSelected(target);
  };
  window.faceFactoryPlacePiece = function(target) { placeSelected(target); };
  function placeSelected(target) {
    if (!selectedPiece || target.querySelector('.ff-piece')) return;
    const piece = document.getElementById(selectedPiece);
    if (!piece) return;
    const correct = piece.dataset.ci === target.dataset.ci && piece.dataset.pos === target.dataset.pos;
    if (!correct) {
      target.classList.remove('wrong'); void target.offsetWidth; target.classList.add('wrong');
      const msg = document.getElementById('ff-puzzle-message');
      if (msg) msg.textContent = 'TRY ANOTHER SPOT';
      later(() => {
        const right = document.querySelector(`.ff-target[data-ci="${piece.dataset.ci}"][data-pos="${piece.dataset.pos}"]`);
        right?.classList.add('ff-hint-target');
        later(() => right?.classList.remove('ff-hint-target'), 1000);
      }, 900);
      return;
    }
    piece.classList.remove('selected');
    piece.draggable = false;
    target.appendChild(piece);
    selectedPiece = null;
    puzzle.placed++;
    sound('match');
    spark(target);
    const msg = document.getElementById('ff-puzzle-message');
    if (msg) msg.textContent = `${puzzle.placed} OF 8 PIECES!`;
    if (puzzle.placed === 8) later(finishPuzzle, 350);
  }
  window.faceFactoryPuzzleHint = function() {
    if (!puzzle) return;
    puzzle.showHint = !puzzle.showHint;
    document.querySelectorAll('.ff-puzzle-guide').forEach(guide => guide.classList.toggle('visible', puzzle.showHint));
    const button = document.getElementById('ff-puzzle-hint');
    if (button) {
      button.classList.toggle('active', puzzle.showHint);
      button.textContent = puzzle.showHint ? 'HIDE HINT' : 'HINT';
    }
    sound('menuSelect');
  };
  function finishPuzzle() {
    document.querySelectorAll('.ff-puzzle-board').forEach(spark);
    const msg = document.getElementById('ff-puzzle-message');
    if (msg) msg.textContent = 'THE FAMILY IS BACK TOGETHER!';
    document.getElementById('ff-piece-tray')?.classList.add('ff-puzzle-complete');
    const actions = document.getElementById('ff-puzzle-actions');
    if (actions) actions.innerHTML = '<button class="ff-play-again-btn" type="button" onclick="faceFactoryNewPuzzle()">PLAY AGAIN</button>';
    celebrate(true);
  }

  // ── CRAZY FACE FIXER + RECOGNITION ROUND ───────────────────────────────
  const bandLabels = ['EYES & BROWS', 'NOSE', 'SMILE & CHIN'];
  const FIX_POOL_SIZE = 15;
  // Precomputed alpha silhouettes are used only by Build Faces. Crazy Face deliberately
  // keeps the original 512px portrait canvas and uses the manual landmark calibration,
  // so hair, shoulders, and different source crops are never mistaken for face geometry.
  const FACE_BOUNDS = {
    KRISTEN:[49,43,463,469], STEVEN:[45,45,467,467], TED:[116,43,396,469],
    DAWN:[53,43,459,469], TONY:[114,43,399,469], GRANDMA:[86,43,426,469],
    TOMMY:[44,44,468,468], POPPY:[44,44,468,468], 'SHE-SHE':[91,43,421,469],
    ROSIE:[79,43,434,469], KEVIN:[44,44,468,468], GRANT:[86,43,426,469],
    LUKE:[0,0,512,512], LEANNE:[44,44,468,468], LINDSAY:[0,0,512,512],
    DEBBIE:[53,43,460,469], EDDIE:[95,44,418,469], ANTHONY:[83,43,429,469],
    ALEX:[98,43,415,469], RUTH:[79,43,434,469], THOMAS:[94,44,419,469]
  };
  const LANDMARKS = [
    { key:'leftEye', label:'LEFT EYE', short:'L EYE', color:'#00e5ff' },
    { key:'rightEye', label:'RIGHT EYE', short:'R EYE', color:'#00e5ff' },
    { key:'nose', label:'NOSE TIP', short:'NOSE', color:'#ff66dd' },
    { key:'mouth', label:'SMILE CENTER', short:'SMILE', color:'#ffe61a' },
    { key:'chin', label:'CHIN BOTTOM', short:'CHIN', color:'#8cff5a' }
  ];
  const TARGET_FACE = { eyeX:256, eyeY:155, eyeSpan:145, mouthGap:180, chinGap:280 };
  const FINE_PART_KEYS = ['eyes', 'nose', 'smile'];
  const DEFAULT_FINE = { dx:0, dy:0, zoom:1, rotation:0 };
  // Face-only rows: balanced on screen, while the crop intentionally excludes most
  // hairstyle and crown variation. The seams stay between eyes/nose and nose/smile.
  const FACE_BAND_EDGES = [44, 203, 309, 468];

  function defaultLandmarkTuning(ci) {
    const bounds = FACE_BOUNDS[GAME_CHARS[ci].name] || [44,44,468,468];
    const [l,t,r,b] = bounds;
    const w = r - l;
    const h = b - t;
    const cx = (l + r) / 2;
    return {
      points: {
        leftEye:{ x:cx - w * .13, y:t + h * .55 },
        rightEye:{ x:cx + w * .13, y:t + h * .55 },
        nose:{ x:cx, y:t + h * .67 },
        mouth:{ x:cx, y:t + h * .80 },
        chin:{ x:cx, y:t + h * .96 }
      },
      placed:{},
      flip:false,
      rotation:0,
      fineParts:Object.fromEntries(FINE_PART_KEYS.map(key => [key, Object.assign({}, DEFAULT_FINE)]))
    };
  }
  function normalizedFine(value) {
    const fine = Object.assign({}, DEFAULT_FINE, value || {});
    return {
      dx:Number(fine.dx) || 0,
      dy:Number(fine.dy) || 0,
      zoom:Number(fine.zoom) || 1,
      rotation:Number(fine.rotation) || 0
    };
  }
  function resolvedFineParts(preset = {}, saved = {}) {
    return Object.fromEntries(FINE_PART_KEYS.map(key => [key, normalizedFine(Object.assign(
      {},
      preset.fine || {},
      preset.fineParts?.[key] || {},
      saved.fine || {},
      saved.fineParts?.[key] || {}
    ))]));
  }
  function baselineFinePartsFor(ci) {
    const preset = window.FACE_FACTORY_LANDMARK_PRESETS?.[GAME_CHARS[ci].name] || {};
    return resolvedFineParts(preset);
  }
  function fineForPart(tuning, part) {
    return tuning.fineParts[FINE_PART_KEYS[Math.max(0, Math.min(2, Number(part) || 0))]];
  }
  function landmarkTuningFor(ci) {
    const defaults = defaultLandmarkTuning(ci);
    const name = GAME_CHARS[ci].name;
    const preset = window.FACE_FACTORY_LANDMARK_PRESETS?.[name] || {};
    const saved = faceTuning[name] || {};
    const points = {};
    const placed = Object.assign({}, preset.placed || {}, saved.placed || {});
    LANDMARKS.forEach(({key}) => {
      const point = saved.points?.[key] || preset.points?.[key] || defaults.points[key];
      points[key] = { x:Number(point.x), y:Number(point.y) };
      if (preset.points?.[key]) placed[key] = true;
    });
    return {
      points,
      placed,
      flip:saved.flip ?? preset.flip ?? defaults.flip,
      rotation:Number(saved.rotation ?? preset.rotation ?? defaults.rotation) || 0,
      fineParts:resolvedFineParts(preset, saved)
    };
  }
  function calibrationComplete(ci) {
    const tuning = landmarkTuningFor(ci);
    return LANDMARKS.every(({key}) => tuning.placed[key]);
  }
  function saveFaceTuning() {
    try { localStorage.setItem(FACE_TUNING_KEY, JSON.stringify(faceTuning)); } catch (_) {}
  }
  function faceTransform(ci, part = 0) {
    const tuning = landmarkTuningFor(ci);
    const fine = fineForPart(tuning, part);
    const raw = tuning.points;
    const mirror = point => ({ x:512 - point.x, y:point.y });
    const points = tuning.flip ? {
      leftEye:mirror(raw.rightEye), rightEye:mirror(raw.leftEye),
      nose:mirror(raw.nose), mouth:mirror(raw.mouth), chin:mirror(raw.chin)
    } : raw;
    const left = points.leftEye;
    const right = points.rightEye;
    const mid = { x:(left.x + right.x) / 2, y:(left.y + right.y) / 2 };
    const eyeDx = right.x - left.x;
    const eyeDy = right.y - left.y;
    const eyeDistance = Math.max(20, Math.hypot(eyeDx, eyeDy));
    const ux = eyeDx / eyeDistance;
    const uy = eyeDy / eyeDistance;
    const vx = -uy;
    const vy = ux;
    const alongY = point => vx * (point.x - mid.x) + vy * (point.y - mid.y);
    const mouthDistance = Math.max(45, alongY(points.mouth));
    const chinDistance = Math.max(mouthDistance + 35, alongY(points.chin));
    const eyeScale = TARGET_FACE.eyeSpan / eyeDistance;
    const mouthScale = TARGET_FACE.mouthGap / mouthDistance;
    const chinScale = TARGET_FACE.chinGap / chinDistance;
    // A single scale is essential: separate X/Y scales make familiar faces look
    // squeezed. The vertical landmarks carry most weight so the semantic cuts stay
    // clear; eye distance provides a small stabilizing vote for overall size.
    const scale = Math.max(.55, Math.min(2.5, chinScale * .50 + mouthScale * .45 + eyeScale * .05));
    const baseA = scale * ux;
    const baseC = scale * uy;
    const baseB = scale * vx;
    const baseD = scale * vy;
    const baseE = TARGET_FACE.eyeX - baseA * mid.x - baseC * mid.y;
    const baseF = TARGET_FACE.eyeY - baseB * mid.x - baseD * mid.y;
    // Eye clicks automatically level the face. This correction is deliberately
    // separate so the builder can restore a natural head tilt when desired.
    const radians = Math.max(-30, Math.min(30, tuning.rotation + fine.rotation)) * Math.PI / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    const rotatedA = cos * baseA - sin * baseB;
    const rotatedC = cos * baseC - sin * baseD;
    const rotatedE = TARGET_FACE.eyeX + cos * (baseE - TARGET_FACE.eyeX) - sin * (baseF - TARGET_FACE.eyeY);
    const rotatedB = sin * baseA + cos * baseB;
    const rotatedD = sin * baseC + cos * baseD;
    const rotatedF = TARGET_FACE.eyeY + sin * (baseE - TARGET_FACE.eyeX) + cos * (baseF - TARGET_FACE.eyeY);
    const fineZoom = Math.max(.7, Math.min(1.35, fine.zoom));
    const a = rotatedA * fineZoom;
    const b = rotatedB * fineZoom;
    const c = rotatedC * fineZoom;
    const d = rotatedD * fineZoom;
    const e = 256 + fine.dx + fineZoom * (rotatedE - 256);
    const f = 256 + fine.dy + fineZoom * (rotatedF - 256);
    const map = point => {
      const p = tuning.flip ? mirror(point) : point;
      return { x:a * p.x + c * p.y + e, y:b * p.x + d * p.y + f };
    };
    return { tuning, matrix:[a,b,c,d,e,f], map };
  }
  function puzzleFaceImage(ci, expr) {
    const c = GAME_CHARS[ci];
    const bounds = FACE_BOUNDS[c.name] || [44,44,468,468];
    const [l,t,r,b] = bounds;
    const frameX = 44;
    const frameY = 44;
    const frameSize = 424;
    const scale = Math.min(frameSize / Math.max(1, r - l), frameSize / Math.max(1, b - t));
    const x = frameX + frameSize / 2 - ((l + r) / 2) * scale;
    const y = frameY + frameSize / 2 - ((t + b) / 2) * scale;
    const src = expr === 'happy' ? (c.imgHappy || c.img) : c.img;
    const image = `<image href="${src}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(512*scale).toFixed(2)}" height="${(512*scale).toFixed(2)}" preserveAspectRatio="none"/>`;
    return image;
  }
  function scrambleFaceImage(ci, expr, part = 0) {
    const c = GAME_CHARS[ci];
    const transform = faceTransform(ci, part);
    const matrix = transform.matrix.map(value => Number(value).toFixed(5)).join(' ');
    const src = expr === 'happy' ? (c.imgHappy || c.img) : c.img;
    const image = `<image href="${src}" x="0" y="0" width="512" height="512" preserveAspectRatio="none"/>`;
    const oriented = transform.tuning.flip ? `<g transform="translate(512 0) scale(-1 1)">${image}</g>` : image;
    return `<g transform="matrix(${matrix})">${oriented}</g>`;
  }
  function bandMarkup(part, ci, controls, expr, tuning = false, highlighted = false) {
    const slice = { y:FACE_BAND_EDGES[part], h:FACE_BAND_EDGES[part + 1] - FACE_BAND_EDGES[part] };
    return `<div class="ff-face-band ${tuning && tunePart === part ? 'ff-tune-selected' : ''} ${highlighted ? 'ff-guess-target' : ''}" id="ff-band-${part}" data-part="${part}" data-ci="${ci}">
      <svg viewBox="44 ${slice.y.toFixed(3)} 424 ${slice.h.toFixed(3)}" preserveAspectRatio="none" aria-hidden="true">${scrambleFaceImage(ci, expr, part)}</svg>
      ${highlighted ? '<span class="ff-guess-chevron ff-guess-chevron-left" aria-hidden="true"></span><span class="ff-guess-chevron ff-guess-chevron-right" aria-hidden="true"></span>' : ''}
      ${controls ? `<button class="ff-band-arrow ff-band-arrow-left" type="button" aria-label="Previous ${bandLabels[part]}" onclick="event.stopPropagation();faceFactoryCycleBand(${part},-1)">◀</button><button class="ff-band-arrow ff-band-arrow-right" type="button" aria-label="Next ${bandLabels[part]}" onclick="event.stopPropagation();faceFactoryCycleBand(${part},1)">▶</button>` : ''}
      ${tuning ? `<button class="ff-tune-select" type="button" aria-label="Adjust ${GAME_CHARS[ci].name} ${bandLabels[part]}" onclick="event.stopPropagation();faceFactorySelectTuneBand(${part})">${tunePart === part ? 'ADJUSTING' : 'ADJUST'}</button>` : ''}
    </div>`;
  }
  function crazyTabs(active) {
    return `<div class="ff-mix-tabs"><button class="ff-mix-tab ${active === 'mix' ? 'active' : ''}" type="button" onclick="faceFactoryCrazyMode('mix')">MAKE FUNNY FACES</button><button class="ff-mix-tab ${active === 'guess' ? 'active' : ''}" type="button" onclick="faceFactoryCrazyMode('guess')">GUESS THE PARTS</button>${builderEnabled ? `<button class="ff-mix-tab ${active === 'tune' ? 'active' : ''}" type="button" onclick="faceFactoryCrazyMode('tune')">FINE TUNE</button><button class="ff-mix-tab ${active === 'builder' ? 'active' : ''}" type="button" onclick="faceFactoryOpenBuilder()">BUILDER</button>` : ''}</div>`;
  }
  function crazyHeading(active) {
    return `<div class="ff-crazy-heading"><div class="ff-title">CRAZY FACE</div>${crazyTabs(active)}</div>`;
  }
  function cameraIcon() {
    return `<svg viewBox="0 0 64 52" aria-hidden="true"><path d="M8 14h12l5-7h14l5 7h12a5 5 0 0 1 5 5v25a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V19a5 5 0 0 1 5-5Z"/><circle cx="32" cy="31" r="11"/><circle cx="52" cy="21" r="2"/></svg>`;
  }
  function randomIcon() {
    return `<svg viewBox="0 0 64 52" aria-hidden="true"><path d="M6 13h9c13 0 16 26 31 26h12"/><path d="m51 32 7 7-7 7"/><path d="M6 39h9c5 0 9-4 13-10M36 20c3-4 6-7 10-7h12"/><path d="m51 6 7 7-7 7"/></svg>`;
  }
  function fineTuneControl(label, key, min, max, step, value, suffix = '') {
    const decimals = step < 1 ? 2 : 0;
    return `<label class="ff-fine-control"><span>${label}<output id="ff-fine-${key}-value">${Number(value).toFixed(decimals)}${suffix}</output></span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" oninput="faceFactoryFineTune('${key}',this.value)"></label>`;
  }
  function fineTunePanel() {
    const ci = mixChars[tunePart];
    const tuning = landmarkTuningFor(ci);
    const fine = fineForPart(tuning, tunePart);
    return `<div class="ff-fine-panel" id="ff-fine-panel">
      <div class="ff-fine-heading"><span>ADJUSTING ${bandLabels[tunePart]}</span><strong>${GAME_CHARS[ci].name}</strong></div>
      <div class="ff-fine-controls">
        ${fineTuneControl('LEFT / RIGHT','dx',-80,80,1,fine.dx)}
        ${fineTuneControl('UP / DOWN','dy',-80,80,1,fine.dy)}
        ${fineTuneControl('ZOOM','zoom',.70,1.35,.01,fine.zoom)}
        ${fineTuneControl('ROTATION','rotation',-10,10,.5,fine.rotation,'°')}
      </div>
      <div class="ff-fine-actions">
        <button class="ff-fine-reset" type="button" onclick="faceFactoryResetFineTune()">RESTORE THIS PIECE</button>
        <button class="ff-fine-random" type="button" onclick="faceFactoryRandomizeTune()">RANDOM FACES</button>
        <button class="ff-fine-copy" type="button" onclick="faceFactoryExportTuning()">COPY SETTINGS</button>
      </div>
      <div class="ff-fine-save-state" id="ff-fine-save-state">EACH PIECE SAVES SEPARATELY</div>
    </div>`;
  }
  function renderCrazyMixer(randomize, tuning = tuneMode) {
    const poolIsTuningSet = tuning && mixPool.length === FACE_FACTORY_CHARS.length && FACE_FACTORY_CHARS.every(ci => mixPool.includes(ci));
    const poolIsFixSet = !tuning && mixPool.length === FIX_POOL_SIZE && mixPool.every(ci => FIX_CHARS.includes(ci));
    if (randomize || (tuning ? !poolIsTuningSet : !poolIsFixSet)) {
      if (!tuning && randomize && FUNNY_START_CHARS.every(ci => ci >= 0 && FIX_CHARS.includes(ci))) {
        mixPool = FUNNY_START_CHARS.concat(shuffle(FIX_CHARS.filter(ci => !FUNNY_START_CHARS.includes(ci))).slice(0, FIX_POOL_SIZE - FUNNY_START_CHARS.length));
        mixChars = FUNNY_START_CHARS.slice();
      } else {
        mixPool = tuning ? FACE_FACTORY_CHARS.slice() : distinctChars(FIX_POOL_SIZE, FIX_CHARS);
        if (!mixChars.every(ci => mixPool.includes(ci))) mixChars = shuffle(mixPool).slice(0, 3);
      }
    }
    const used = [];
    mixChars = [0, 1, 2].map(part => {
      const current = mixChars[part];
      if (mixCharsForPart(part).includes(current) && !used.includes(current)) {
        used.push(current);
        return current;
      }
      const replacement = shuffle(mixCharsForPart(part)).find(ci => !used.includes(ci));
      used.push(replacement);
      return replacement;
    });
    mixWon = false;
    wrap().innerHTML = shell('CRAZY FACE', `<section class="ff-panel">
      ${crazyHeading(tuning ? 'tune' : 'mix')}
      <div class="ff-crazy-face ${tuning ? 'ff-tuning-face' : ''}" id="ff-crazy-face">${mixChars.map((ci, part) => bandMarkup(part, ci, true, undefined, tuning)).join('')}</div>
      <div class="ff-message" id="ff-crazy-message">${tuning ? 'TAP ADJUST ON ANY FACE PART' : 'MAKE A FUNNY FACE'}</div>
      ${tuning ? fineTunePanel() : ''}
      ${tuning ? '<div id="ff-crazy-win-action"></div>' : `<div class="ff-funny-actions"><button class="ff-random-button" type="button" aria-label="Make a random funny face" onclick="faceFactoryRandomizeFunny()">${randomIcon()}<span>RANDOM</span></button><button class="ff-camera-button" type="button" aria-label="Take a funny face portrait" onclick="faceFactoryTakePortrait()">${cameraIcon()}<span>PORTRAIT</span></button></div>`}
    </section>`);
  }
  window.faceFactoryCrazyMode = function(mode) {
    clearTimers();
    sound('menuSelect');
    tuneMode = mode === 'tune';
    if (mode === 'mix' || mode === 'tune') renderCrazyMixer(mode === 'mix', tuneMode);
    else startGuessRound();
  };
  window.faceFactoryCycleBand = function(part, direction) {
    if (mixWon) return;
    const eligible = mixCharsForPart(part).filter(ci => !mixChars.some((selected, selectedPart) => selectedPart !== part && selected === ci));
    const poolIndex = eligible.indexOf(mixChars[part]);
    mixChars[part] = eligible[(poolIndex + direction + eligible.length) % eligible.length];
    if (tuneMode) {
      tunePart = part;
      renderCrazyMixer(false, true);
      sound('charPick', mixChars[part] % 8);
      return;
    }
    const old = document.getElementById(`ff-band-${part}`);
    if (!old) return;
    old.outerHTML = bandMarkup(part, mixChars[part], true);
    sound('charPick', mixChars[part] % 8);
  };
  window.faceFactoryRandomizeFunny = function() {
    if (tuneMode || !mixPool.length) return;
    const previous = mixChars.join(',');
    let next = mixChars.slice();
    for (let attempt = 0; attempt < 8 && next.join(',') === previous; attempt++) {
      const used = [];
      next = [0, 1, 2].map(part => {
        const ci = shuffle(mixCharsForPart(part)).find(candidate => !used.includes(candidate));
        used.push(ci);
        return ci;
      });
    }
    mixChars = next;
    sound('boxOpen');
    renderCrazyMixer(false, false);
  };
  window.faceFactoryRandomizeTune = function() {
    if (!tuneMode) return;
    const previous = mixChars.join(',');
    let next = mixChars.slice();
    for (let attempt = 0; attempt < 8 && next.join(',') === previous; attempt++) {
      const used = [];
      next = [0, 1, 2].map(part => {
        const ci = shuffle(charsForPart(part)).find(candidate => !used.includes(candidate));
        used.push(ci);
        return ci;
      });
    }
    mixChars = next;
    tunePart = 0;
    sound('boxOpen');
    renderCrazyMixer(false, true);
  };
  window.faceFactoryTakePortrait = function() {
    const shellEl = document.querySelector('.ff-shell');
    if (!shellEl || tuneMode) return;
    document.getElementById('ff-portrait-overlay')?.remove();
    const flash = document.createElement('div');
    flash.className = 'ff-camera-flash';
    shellEl.appendChild(flash);
    sound('cameraShutter');
    later(() => flash.remove(), 650);
    const styles = ['neon', 'gold', 'instant'];
    const style = styles[portraitStyleIndex % styles.length];
    portraitStyleIndex++;
    later(() => {
      if (!document.querySelector('.ff-shell')) return;
      const overlay = document.createElement('div');
      overlay.className = 'ff-portrait-overlay';
      overlay.id = 'ff-portrait-overlay';
      overlay.innerHTML = `<div class="ff-portrait-card ff-portrait-${style}">
        <button class="ff-portrait-close" type="button" aria-label="Close portrait" onclick="faceFactoryClosePortrait()">×</button>
        <div class="ff-portrait-kicker">FACE FACTORY ORIGINAL</div>
        <div class="ff-crazy-face ff-portrait-face">${mixChars.map((ci, part) => bandMarkup(part, ci, false)).join('')}</div>
        <div class="ff-portrait-caption">FAMILY FUN · ${style.toUpperCase()} EDITION</div>
        <button class="ff-portrait-retake" type="button" onclick="faceFactoryTakePortrait()">${cameraIcon()}<span>NEW STYLE</span></button>
      </div>`;
      shellEl.appendChild(overlay);
      spark(overlay.querySelector('.ff-portrait-card'));
    }, 270);
  };
  window.faceFactoryClosePortrait = function() {
    document.getElementById('ff-portrait-overlay')?.remove();
    sound('menuSelect');
  };
  window.faceFactorySelectTuneBand = function(part) {
    tunePart = Math.max(0, Math.min(2, Number(part) || 0));
    sound('menuSelect');
    renderCrazyMixer(false, true);
  };
  window.faceFactoryFineTune = function(key, raw) {
    const ci = mixChars[tunePart];
    const name = GAME_CHARS[ci].name;
    const current = landmarkTuningFor(ci);
    const fine = fineForPart(current, tunePart);
    const value = Number(raw);
    if (key === 'zoom') fine.zoom = Math.max(.70, Math.min(1.35, value || 1));
    else if (key === 'rotation') fine.rotation = Math.max(-10, Math.min(10, value || 0));
    else if (key === 'dx' || key === 'dy') fine[key] = Math.max(-80, Math.min(80, value || 0));
    else return;
    faceTuning[name] = current;
    saveFaceTuning();
    const selectedBand = document.querySelector(`.ff-face-band[data-part="${tunePart}"][data-ci="${ci}"] svg`);
    if (selectedBand) selectedBand.innerHTML = scrambleFaceImage(ci, undefined, tunePart);
    const output = document.getElementById(`ff-fine-${key}-value`);
    if (output) output.textContent = key === 'zoom' ? fine.zoom.toFixed(2) : key === 'rotation' ? `${fine.rotation.toFixed(2)}°` : fine[key].toFixed(0);
    const saveState = document.getElementById('ff-fine-save-state');
    if (saveState) saveState.textContent = `SAVED · ${GAME_CHARS[ci].name} · ${bandLabels[tunePart]}`;
  };
  window.faceFactoryResetFineTune = function() {
    const ci = mixChars[tunePart];
    const name = GAME_CHARS[ci].name;
    const current = landmarkTuningFor(ci);
    current.fineParts[FINE_PART_KEYS[tunePart]] = baselineFinePartsFor(ci)[FINE_PART_KEYS[tunePart]];
    faceTuning[name] = current;
    saveFaceTuning();
    renderCrazyMixer(false, true);
  };
  function finishCrazyFix() {
    mixWon = true;
    const winner = mixChars[0];
    const face = document.getElementById('ff-crazy-face');
    if (face) face.innerHTML = [0,1,2].map(part => bandMarkup(part, winner, false, 'happy')).join('');
    const msg = document.getElementById('ff-crazy-message');
    if (msg) msg.textContent = `YOU FIXED ${GAME_CHARS[winner].name}!`;
    const action = document.getElementById('ff-crazy-win-action');
    if (action) action.innerHTML = '<button class="ff-play-again-btn" type="button" onclick="faceFactoryPlayAgain()">PLAY AGAIN</button>';
    spark(face);
    celebrate(true);
  }
  window.faceFactoryPlayAgain = function() { clearTimers(); sound('menuSelect'); renderCrazyMixer(true); };

  function builderMarker(point, definition, active, placed) {
    return `<g class="ff-landmark ${active ? 'active' : ''} ${placed ? 'placed' : 'suggested'}" data-point-group="${definition.key}" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})" style="--landmark:${definition.color}" onpointerdown="event.stopPropagation();faceFactoryBuilderPointerDown(event,'${definition.key}')">
      <circle r="${active ? 17 : 13}"/><path d="M-23 0H23M0-23V23"/><text y="-27">${definition.short}</text>
    </g>`;
  }
  function builderEditor(ci) {
    const tuning = landmarkTuningFor(ci);
    return `<div class="ff-builder-editor" id="ff-builder-editor">
      <svg viewBox="0 0 512 512" aria-label="Mark facial landmarks for ${GAME_CHARS[ci].name}" onpointerdown="faceFactoryBuilderPointerDown(event)" onpointermove="faceFactoryBuilderPointerMove(event)" onpointerup="faceFactoryBuilderPointerUp(event)" onpointercancel="faceFactoryBuilderPointerUp(event)">
        <rect width="512" height="512" fill="#eef6ff"/>
        <image href="${GAME_CHARS[ci].img}" width="512" height="512" preserveAspectRatio="none"/>
        ${LANDMARKS.map(def => builderMarker(tuning.points[def.key], def, def.key === builderPoint, !!tuning.placed[def.key])).join('')}
      </svg>
      <div class="ff-builder-editor-label">ORIGINAL PORTRAIT</div>
    </div>`;
  }
  function builderPreview(ci) {
    const guide1 = FACE_BAND_EDGES[1];
    const guide2 = FACE_BAND_EDGES[2];
    const partForPoint = key => key === 'leftEye' || key === 'rightEye' ? 0 : key === 'nose' ? 1 : 2;
    const mapped = LANDMARKS.map(def => {
      const transform = faceTransform(ci, partForPoint(def.key));
      return { def, point:transform.map(transform.tuning.points[def.key]) };
    });
    return `<div class="ff-builder-preview" id="ff-builder-preview">
      <svg viewBox="44 44 424 424" aria-label="Exact assembled preview for ${GAME_CHARS[ci].name}">
        <defs>${[0,1,2].map(part => `<clipPath id="ff-builder-clip-${ci}-${part}"><rect x="44" y="${FACE_BAND_EDGES[part]}" width="424" height="${FACE_BAND_EDGES[part + 1] - FACE_BAND_EDGES[part]}"/></clipPath>`).join('')}</defs>
        <rect x="44" y="44" width="424" height="424" fill="#eef6ff"/>
        ${[0,1,2].map(part => `<g clip-path="url(#ff-builder-clip-${ci}-${part})">${scrambleFaceImage(ci, undefined, part)}</g>`).join('')}
        <line x1="44" x2="468" y1="${guide1.toFixed(2)}" y2="${guide1.toFixed(2)}" class="ff-builder-guide"/>
        <line x1="44" x2="468" y1="${guide2.toFixed(2)}" y2="${guide2.toFixed(2)}" class="ff-builder-guide"/>
        <line x1="256" x2="256" y1="44" y2="468" class="ff-builder-center"/>
        ${mapped.map(({def,point}) => `<g class="ff-preview-point" style="--landmark:${def.color}" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})"><circle r="6"/><text y="-10">${def.short}</text></g>`).join('')}
      </svg>
      <div class="ff-builder-editor-label">EXACT GAME CUT</div>
    </div>`;
  }
  function builderPointButtons(ci) {
    const tuning = landmarkTuningFor(ci);
    return `<div class="ff-builder-point-buttons">${LANDMARKS.map((def, index) => `<button class="${def.key === builderPoint ? 'active' : ''} ${tuning.placed[def.key] ? 'placed' : ''}" style="--landmark:${def.color}" type="button" onclick="faceFactoryBuilderSelectPoint('${def.key}')"><b>${index + 1}</b>${def.label}</button>`).join('')}</div>`;
  }
  function builderSetPoint(ci, key, point, placed = true) {
    const name = GAME_CHARS[ci].name;
    const next = landmarkTuningFor(ci);
    next.points[key] = { x:Math.max(0, Math.min(512, point.x)), y:Math.max(0, Math.min(512, point.y)) };
    if (placed) next.placed[key] = true;
    faceTuning[name] = next;
    saveFaceTuning();
  }
  function eventPortraitPoint(event) {
    const svg = event.currentTarget.tagName?.toLowerCase() === 'svg' ? event.currentTarget : event.currentTarget.closest('svg');
    const rect = svg.getBoundingClientRect();
    return { x:(event.clientX - rect.left) / rect.width * 512, y:(event.clientY - rect.top) / rect.height * 512 };
  }
  function refreshBuilderPreview() {
    const preview = document.getElementById('ff-builder-preview');
    if (preview) preview.outerHTML = builderPreview(builderChar);
    const tuning = landmarkTuningFor(builderChar);
    LANDMARKS.forEach(def => {
      const marker = document.querySelector(`[data-point-group="${def.key}"]`);
      if (marker) marker.setAttribute('transform', `translate(${tuning.points[def.key].x.toFixed(1)} ${tuning.points[def.key].y.toFixed(1)})`);
    });
  }
  function renderBuilder() {
    const ci = builderChar;
    const tuning = landmarkTuningFor(ci);
    const pointsSet = LANDMARKS.filter(({key}) => tuning.placed[key]).length;
    const builderPosition = Math.max(0, FACE_FACTORY_CHARS.indexOf(builderChar));
    const peopleDone = FACE_FACTORY_CHARS.filter(ci => calibrationComplete(ci)).length;
    wrap().innerHTML = shell('FACE BUILDER', `<section class="ff-panel ff-builder-panel">
      <div class="ff-title">FACE BUILDER</div>
      <div class="ff-builder-person-row"><button type="button" onclick="faceFactoryBuilderPerson(-1)">◀</button><strong>${GAME_CHARS[ci].name}<small>${builderPosition + 1} OF ${FACE_FACTORY_CHARS.length}</small></strong><button type="button" onclick="faceFactoryBuilderPerson(1)">▶</button></div>
      <div class="ff-builder-instruction">CHOOSE A POINT, THEN TAP ITS CENTER ON THE ORIGINAL. DRAG ANY DOT TO CORRECT IT.</div>
      ${builderPointButtons(ci)}
      <div class="ff-builder-workspace">
        ${builderEditor(ci)}
        ${builderPreview(ci)}
      </div>
      <label class="ff-builder-rotation"><span>HEAD ROTATION <output id="ff-builder-rotation-value">${tuning.rotation.toFixed(1)}°</output></span><input type="range" min="-20" max="20" step="0.5" value="${tuning.rotation}" oninput="faceFactoryBuilderRotation(this.value)"></label>
      <div class="ff-builder-actions">
        <button type="button" onclick="faceFactoryBuilderMirror()">${tuning.flip ? 'UNMIRROR PREVIEW' : 'MIRROR PREVIEW'}</button>
        <button id="ff-builder-reset" type="button" onclick="faceFactoryBuilderReset()">RESET LANDMARKS ONLY</button>
        <button type="button" onclick="faceFactoryExportTuning()">COPY SETTINGS</button>
        <button type="button" onclick="faceFactoryCrazyMode('${builderReturnMode}')">${builderReturnMode === 'tune' ? 'BACK TO FINE TUNE' : 'DONE'}</button>
      </div>
      <div class="ff-builder-status" id="ff-builder-status">${pointsSet}/5 POINTS SET · ${peopleDone}/${FACE_FACTORY_CHARS.length} PEOPLE COMPLETE · SAVED AUTOMATICALLY</div>
    </section>`);
  }
  window.faceFactoryOpenBuilder = function() {
    if (!builderEnabled) return;
    clearTimers();
    builderReturnMode = tuneMode ? 'tune' : 'mix';
    builderResetArmed = false;
    sound('menuSelect');
    renderBuilder();
  };
  window.faceFactoryBuilderPerson = function(direction) {
    const current = Math.max(0, FACE_FACTORY_CHARS.indexOf(builderChar));
    builderChar = FACE_FACTORY_CHARS[(current + direction + FACE_FACTORY_CHARS.length) % FACE_FACTORY_CHARS.length];
    builderPoint = 'leftEye';
    sound('charPick', builderChar % 8);
    renderBuilder();
  };
  window.faceFactoryBuilderSelectPoint = function(key) {
    if (!LANDMARKS.some(def => def.key === key)) return;
    builderPoint = key;
    sound('menuSelect');
    renderBuilder();
  };
  window.faceFactoryBuilderPointerDown = function(event, key) {
    event.preventDefault();
    const svg = event.currentTarget.tagName?.toLowerCase() === 'svg' ? event.currentTarget : event.currentTarget.closest('svg');
    builderDragging = key || builderPoint;
    builderPoint = builderDragging;
    try { svg.setPointerCapture(event.pointerId); } catch (_) {}
    builderSetPoint(builderChar, builderDragging, eventPortraitPoint(event));
    refreshBuilderPreview();
  };
  window.faceFactoryBuilderPointerMove = function(event) {
    if (!builderDragging) return;
    event.preventDefault();
    builderSetPoint(builderChar, builderDragging, eventPortraitPoint(event));
    refreshBuilderPreview();
  };
  window.faceFactoryBuilderPointerUp = function(event) {
    if (!builderDragging) return;
    event.preventDefault();
    const index = LANDMARKS.findIndex(def => def.key === builderDragging);
    builderDragging = null;
    if (index >= 0 && index < LANDMARKS.length - 1) builderPoint = LANDMARKS[index + 1].key;
    renderBuilder();
  };
  window.faceFactoryBuilderMirror = function() {
    const name = GAME_CHARS[builderChar].name;
    const current = landmarkTuningFor(builderChar);
    current.flip = !current.flip;
    faceTuning[name] = current;
    saveFaceTuning();
    renderBuilder();
  };
  window.faceFactoryBuilderRotation = function(raw) {
    const name = GAME_CHARS[builderChar].name;
    const current = landmarkTuningFor(builderChar);
    current.rotation = Math.max(-20, Math.min(20, Number(raw) || 0));
    faceTuning[name] = current;
    saveFaceTuning();
    const preview = document.getElementById('ff-builder-preview');
    if (preview) preview.outerHTML = builderPreview(builderChar);
    const output = document.getElementById('ff-builder-rotation-value');
    if (output) output.textContent = `${current.rotation.toFixed(1)}°`;
  };
  window.faceFactoryBuilderReset = function() {
    const resetButton = document.getElementById('ff-builder-reset');
    const status = document.getElementById('ff-builder-status');
    if (!builderResetArmed) {
      builderResetArmed = true;
      if (resetButton) resetButton.textContent = 'TAP AGAIN TO RESET';
      if (status) status.textContent = 'ONLY LANDMARKS WILL RESET · FINE TUNE WILL BE KEPT';
      setTimeout(() => {
        builderResetArmed = false;
        if (resetButton?.isConnected) resetButton.textContent = 'RESET LANDMARKS ONLY';
      }, 3500);
      return;
    }
    builderResetArmed = false;
    const name = GAME_CHARS[builderChar].name;
    const current = landmarkTuningFor(builderChar);
    const preset = window.FACE_FACTORY_LANDMARK_PRESETS?.[name] || defaultLandmarkTuning(builderChar);
    faceTuning[name] = {
      points:Object.fromEntries(LANDMARKS.map(({key}) => {
        const point = preset.points?.[key] || defaultLandmarkTuning(builderChar).points[key];
        return [key, { x:Number(point.x), y:Number(point.y) }];
      })),
      placed:Object.assign({}, preset.placed || {}),
      flip:Boolean(preset.flip),
      rotation:Number(preset.rotation) || 0,
      fineParts:Object.fromEntries(FINE_PART_KEYS.map(key => [key, Object.assign({}, current.fineParts[key])]))
    };
    builderPoint = 'leftEye';
    saveFaceTuning();
    renderBuilder();
  };
  window.faceFactoryExportTuning = async function() {
    const effective = Object.fromEntries(FACE_FACTORY_CHARS.map(ci => [GAME_CHARS[ci].name, landmarkTuningFor(ci)]));
    const json = JSON.stringify(effective, null, 2);
    let copied = false;
    try { await navigator.clipboard.writeText(json); copied = true; } catch (_) {}
    if (!copied) {
      const fallback = document.createElement('textarea');
      fallback.value = json;
      fallback.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(fallback);
      fallback.select();
      try { copied = document.execCommand('copy'); } catch (_) {}
      fallback.remove();
    }
    const builderStatus = document.getElementById('ff-builder-status');
    const fineStatus = document.getElementById('ff-fine-save-state');
    if (builderStatus) builderStatus.textContent = copied ? 'SETTINGS COPIED' : 'COPY FAILED';
    if (fineStatus) fineStatus.textContent = copied ? 'SETTINGS COPIED' : 'COPY FAILED';
  };

  function startGuessRound() {
    const used = [];
    const chars = [0,1,2].map(part => {
      const ci = shuffle(charsForPart(part)).find(candidate => !used.includes(candidate));
      used.push(ci);
      return ci;
    });
    guess = { chars, part: 0, score: 0 };
    renderGuess();
  }
  function guessChoices(correct, part) {
    const correctGender = faceGender(correct);
    const distractors = shuffle(charsForPart(part).filter(i => i !== correct && faceGender(i) === correctGender)).slice(0, 2);
    return shuffle([correct, ...distractors]);
  }
  function renderGuess() {
    const part = guess.part;
    const correct = guess.chars[part];
    const choices = guessChoices(correct, part);
    wrap().innerHTML = shell('CRAZY FACE', `<section class="ff-panel">
      ${crazyHeading('guess')}
      <div class="ff-crazy-face ff-guessing-face" id="ff-crazy-face">${guess.chars.map((ci, p) => bandMarkup(p, ci, false, undefined, false, p === part)).join('')}</div>
      <div class="ff-message ff-guess-question" id="ff-guess-message">WHOSE ${bandLabels[part]}?</div>
      <div class="ff-guess-score">PART ${part + 1} OF 3</div>
      <div class="ff-guess-options">${choices.map(ci => `<button class="ff-guess-choice" type="button" data-ci="${ci}" onclick="faceFactoryGuess(${ci},this)">${GAME_CHARS[ci].name}</button>`).join('')}</div>
    </section>`);
  }
  window.faceFactoryGuess = function(ci, button) {
    const correct = guess.chars[guess.part];
    const msg = document.getElementById('ff-guess-message');
    if (ci !== correct) {
      if (msg) msg.textContent = 'LOOK CLOSELY — TRY AGAIN!';
      button.classList.add('ff-nudge');
      later(() => button.classList.remove('ff-nudge'), 400);
      later(() => document.querySelector(`.ff-guess-choice[data-ci="${correct}"]`)?.classList.add('hint'), 900);
      return;
    }
    document.querySelectorAll('.ff-guess-choice').forEach(btn => btn.disabled = true);
    button.classList.add('hint');
    spark(document.getElementById(`ff-band-${guess.part}`));
    sound('match');
    if (msg) msg.textContent = `YES — THAT IS ${GAME_CHARS[correct].name}!`;
    guess.score++;
    guess.part++;
    if (guess.part < 3) later(renderGuess, 1050);
    else later(finishGuess, 1050);
  };
  function finishGuess() {
    celebrate(true);
    wrap().innerHTML = shell('CRAZY FACE', `<section class="ff-panel">
      ${crazyHeading('guess')}
      <div class="ff-crazy-face ff-holo ff-celebrate">${guess.chars.map((ci, p) => bandMarkup(p, ci, false)).join('')}</div>
      <div class="ff-message">YOU FOUND EVERYONE!</div>
      <button class="ff-play-again-btn" type="button" onclick="faceFactoryCrazyMode('guess')">PLAY AGAIN</button>
    </section>`);
  }
})();
