// Consume - flat letter-pool word puzzle.
// Boards come from generate_consume_boards.py and are gated by an exhaustive solver.
(function() {
  // v2: board identities changed wholesale when the level packs were rebuilt
  // against a corrected dictionary, so old per-level completion marks would
  // point at puzzles that no longer exist under those numbers.
  const STORE_KEY = 'moberino-consume-v2';
  const DATA = (typeof CONSUME_DATA !== 'undefined') ? CONSUME_DATA : { levels: [] };
  const LEVELS = DATA.levels || [];
  const ACCENT = '#38d8ff';
  const CONSUME_THEMES = ['space', 'jungle', 'ice', 'ocean', 'magic'];

  let wrap = null;
  let S = null;
  let timers = [];
  let nextWordId = 1;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function killTimers() {
    timers.forEach(clearTimeout); timers = [];
  }
  function loadStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch(e) { return {}; } }
  function saveStore(d) { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch(e) {} }
  const TAG_WORDS = ['FROG','MINT','TACO','DUCK','MOON','STAR','WAVE','COMET','MANGO',
    'PIZZA','NEON','DISCO','LASER','LEMON','BERRY','MAPLE','SODA','JELLY','BAGEL',
    'NACHO','SPARK','TURBO','COSMO','ASTRO','LUNA','NOVA','BLIP','ZOOM','DINO',
    'ROCKET','BANJO','KAZOO','YOYO','TILE','WORD','INK','PUNK','TAP'];
  function genTag(taken) {
    for (let i = 0; i < 200; i++) {
      const t = TAG_WORDS[Math.floor(Math.random() * TAG_WORDS.length)] + (2 + Math.floor(Math.random() * 8));
      if (!taken[t]) return t;
    }
    return 'MOBE' + Math.floor(Math.random() * 90 + 10);
  }
  function migrateProgress(profile) {
    if (!profile) return { completed: {}, served: [] };
    if (profile.stars) {
      profile.completed ||= {};
      Object.keys(profile.stars).forEach(level => { if (profile.stars[level]) profile.completed[level] = true; });
      delete profile.stars;
    }
    profile.completed ||= {};
    profile.served = Array.isArray(profile.served) ? profile.served.map(Number).filter(Number.isFinite) : [];
    profile.lastServed = Number(profile.lastServed) || 0;
    return profile;
  }
  function ensureProfile() {
    const s = loadStore();
    if (s.stars && !s.profiles) {
      const tag = genTag({});
      s.active = tag;
      s.profiles = { [tag]: migrateProgress({ stars: s.stars }) };
      delete s.stars;
    }
    if (!s.profiles) s.profiles = {};
    Object.keys(s.profiles).forEach(tag => migrateProgress(s.profiles[tag]));
    // Retroactively adopt the shared cross-game code if it differs — old
    // progress under the previous tag stays put, just no longer active.
    const shared = typeof window.PlayerID !== 'undefined' ? window.PlayerID.get() : null;
    if (shared && shared !== s.active) {
      s.profiles[shared] = migrateProgress(s.profiles[shared]);
      s.active = shared;
      saveStore(s);
    } else if (!s.active || !s.profiles[s.active]) {
      s.active = genTag(s.profiles);
      s.profiles[s.active] = { completed: {}, served: [] };
      saveStore(s);
    }
    if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(s.active);
    return s;
  }
  function myCompleted() { const s = ensureProfile(); return migrateProgress(s.profiles[s.active]).completed; }
  function recordComplete(lvl) {
    const s = ensureProfile();
    const p = migrateProgress(s.profiles[s.active]);
    p.completed[lvl] = true;
    saveStore(s);
  }
  // Levels ship sorted easiest to hardest, so serving the lowest uncompleted one
  // walks the player up the difficulty curve instead of jumping around it.
  function nextLevelInOrder() {
    const store = ensureProfile();
    const player = migrateProgress(store.profiles[store.active]);
    const next = LEVELS.find(level => !player.completed[level.n]);
    return next ? next.n : null;
  }
  function randomLevel() {
    const store = ensureProfile();
    const player = migrateProgress(store.profiles[store.active]);
    let pool = LEVELS.filter(level => level.n !== player.lastServed);
    if (!pool.length) pool = LEVELS.slice();
    const selected = pool[Math.floor(Math.random() * pool.length)];
    player.lastServed = selected.n;
    saveStore(store);
    return selected.n;
  }
  function completedCount() {
    const completed = myCompleted();
    return LEVELS.filter(level => completed[level.n]).length;
  }
  function serveUnseenPuzzle() {
    if (!LEVELS.length) return;
    const next = nextLevelInOrder();
    if (next === null) renderAllCleared();
    else startLevel(next);
  }
  function renderAllCleared() {
    setArcadeExitVisible(false);
    wrap.innerHTML = buildArcadeResultCard({
      uid: 'tile-swap-grid',
      boardKey: 'consume-grid',
      artGame: 'consume',
      color: '#ff7180',
      marquee: 'ALL BOARDS CLEARED',
      scoreLabel: 'BOARDS',
      scoreValue: `${LEVELS.length}/${LEVELS.length}`,
      scoreExtra: 'YOU HAVE SOLVED EVERY GRID PUZZLE',
      canSave: false,
      showBoard: false,
      showSaveArea: false,
      buttons: `
        <button class="cw-btn arcade-result-primary" data-act="random">PLAY A RANDOM BOARD</button>
        <button class="cw-btn arcade-result-secondary" data-act="modes">TILE SWAP MENU</button>
        <button class="cw-btn arcade-result-arcade" data-act="arcade">ARCADE</button>
      `,
    });
    mountSelectionArt('tile-swap-grid-art', 'consume');
    wrap.onclick = event => {
      const act = event.target.getAttribute && event.target.getAttribute('data-act');
      if (act === 'random') { shuffleTheme(); startLevel(randomLevel()); }
      else if (act === 'modes' && typeof window.renderConsumeModes === 'function') window.renderConsumeModes();
      else if (act === 'arcade') nav('lobby');
    };
  }
  function shuffleTheme() {
    if (!wrap) return;
    wrap.dataset.consumeTheme = CONSUME_THEMES[Math.floor(Math.random() * CONSUME_THEMES.length)];
  }
  function clearTheme() {
    if (!wrap) return;
    delete wrap.dataset.consumeTheme;
  }
  function playSceneryMarkup() {
    const theme = wrap?.dataset?.consumeTheme || 'space';
    return `<div class="consume-scenery consume-scenery-${theme}" aria-hidden="true">
      <i class="consume-scenery-piece consume-scenery-piece-a"></i>
      <i class="consume-scenery-piece consume-scenery-piece-b"></i>
      <i class="consume-scenery-piece consume-scenery-piece-c"></i>
      <i class="consume-scenery-piece consume-scenery-piece-d"></i>
    </div>`;
  }
  function highestDone(completed) {
    let m = 0;
    const st = completed || myCompleted();
    for (const k in st) m = Math.max(m, +k);
    return m;
  }
  // Rename the active profile to a player-chosen code, carrying completion along.
  function setCustomTag(raw) {
    const tag = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (tag.length < 2) return { ok: false, msg: '2-12 LETTERS/NUMBERS' };
    const s = ensureProfile();
    if (tag === s.active) return { ok: true };
    const cur = migrateProgress(s.profiles[s.active]).completed;
    const dest = (s.profiles[tag] = migrateProgress(s.profiles[tag])).completed;
    for (const k in cur) if (cur[k]) dest[k] = true;
    s.active = tag;
    saveStore(s);
    if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(tag);
    return { ok: true };
  }
  function adoptTag(tag, upToLevel) {
    const s = ensureProfile();
    s.profiles[tag] = migrateProgress(s.profiles[tag]);
    for (let n = 1; n <= upToLevel; n++) {
      s.profiles[tag].completed[n] = true;
    }
    s.active = tag;
    saveStore(s);
    if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(tag);
  }
  function syncJourney() {
    try {
      if (typeof RemoteLB === 'undefined' || !RemoteLB.submit) return;
      const hi = highestDone();
      if (!hi) return;
      RemoteLB.submit('consume', ensureProfile().active, hi, 0, `L${hi}`)
        .catch(() => {});
    } catch(e) {}
  }

  function esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  // ---------- piano voice ----------
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
  const ROOT = 261.63;
  function pfreq(deg) { return ROOT * Math.pow(2, SCALE[Math.max(0, Math.min(SCALE.length - 1, deg))] / 12); }
  function ptone(f, delay, dur, vol, endFreq) {
    try {
      const c = getAudioCtx();
      const t0 = c.currentTime + Math.max(delay, 0.02);
      [[f, 'triangle', dur, vol, endFreq || f * 0.992], [f * 2.01, 'sine', dur * 0.55, vol * 0.3, (endFreq || f) * 1.99]].forEach(([ff, type, d, v, end]) => {
        const o = c.createOscillator(), g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.type = type; o.frequency.setValueAtTime(ff, t0);
        o.frequency.exponentialRampToValueAtTime(Math.max(40, end), t0 + d);
        g.gain.setValueAtTime(v, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
        o.start(t0); o.stop(t0 + d + 0.02);
      });
    } catch(e) {}
  }
  const CSFX = {
    tap() { ptone(pfreq(4), 0, 0.08, 0.04); },
    back() { ptone(pfreq(2), 0, 0.08, 0.035); },
    bad() { ptone(124, 0, 0.16, 0.055, 82); },
    word(i) {
      const d = Math.min(8, 2 + i);
      ptone(pfreq(d), 0, 0.26, 0.075);
      ptone(pfreq(d + 2), 0.08, 0.22, 0.052);
    },
    shatter() {
      [9, 6, 4, 2].forEach((d, i) => ptone(pfreq(d), i * 0.045, 0.13, 0.042, pfreq(Math.max(0, d - 3))));
    },
    win() {
      [0, 2, 4, 7, 9, 12].forEach((d, i) => ptone(pfreq(d), i * 0.075, 0.32, 0.06));
    },
  };

  function startLevel(n) {
    const data = LEVELS[n - 1];
    if (!data) return;
    setArcadeExitVisible(true);
    setArcadeModeSelect(false);
    shuffleTheme();
    killTimers();
    nextWordId = 1;
    S = {
      n,
      data,
      boardCols: data.cols || Math.sqrt(data.pool.length) || 3,
      tiles: data.pool.split('').map((ch, i) => ({ id: i + 1, ch, wordId: null })),
      tray: [],
      tableau: [],
      bad: false,
      won: false,
      returned: new Set(),
      flashing: new Map(),
      flash: '',
      startTime: Date.now(),
      shatters: 0,
      wordsFormed: 0,
    };
    renderPlay();
  }

  function resetLevel() {
    if (!S) return;
    CSFX.back();
    startLevel(S.n);
  }

  function tileWord(tiles) {
    return tiles.map(t => t.ch).join('').toLowerCase();
  }

  function activeTiles() {
    return S ? S.tiles.filter(t => !t.wordId && !S.tray.includes(t)) : [];
  }

  function countsFor(letters) {
    const c = {};
    letters.forEach(ch => { c[ch] = (c[ch] || 0) + 1; });
    return c;
  }

  function fitsWord(word, counts) {
    const left = { ...counts };
    for (const ch of word) {
      if (!left[ch]) return false;
      left[ch]--;
    }
    return true;
  }

  function anyWordFits(tiles) {
    if (!tiles.length || typeof CONSUME_DICT === 'undefined') return false;
    const counts = countsFor(tiles.map(t => t.ch));
    for (const word of CONSUME_DICT) {
      if (word.length >= 3 && word.length <= tiles.length && fitsWord(word, counts)) return true;
    }
    return false;
  }

  function stuckText() {
    if (!S || S.won || S.tray.length || S.tableau.length === 0) return '';
    const left = activeTiles();
    if (!left.length) return '';
    return anyWordFits(left) ? '' : 'TAP A GLOWING WORD TO FREE ITS TILES';
  }

  function hintableWordIds() {
    if (!stuckText()) return new Set();
    const active = activeTiles();
    return new Set(S.tableau.filter(entry => {
      const freed = entry.tileIds.map(id => S.tiles.find(tile => tile.id === id)).filter(Boolean);
      return anyWordFits(active.concat(freed));
    }).map(entry => entry.id));
  }

  function tapBoard(id) {
    if (!S || S.won) return;
    const tile = S.tiles.find(t => t.id === id);
    if (!tile || tile.wordId) return;
    const existing = S.tray.indexOf(tile);
    if (existing >= 0) {
      S.tray.splice(existing, 1);
      CSFX.back();
      updateAll();
      return;
    }
    S.tray.push(tile);
    S.bad = false;
    CSFX.tap();
    updateAll();
  }

  function tapTray(id) {
    if (!S || S.won) return;
    const idx = S.tray.findIndex(t => t.id === id);
    if (idx < 0) return;
    S.tray.splice(idx, 1);
    S.bad = false;
    CSFX.back();
    updateAll();
  }

  function rejectReason(word) {
    if (word.length < 3) return 'TOO SHORT';
    if (typeof CONSUME_BLOCKED !== 'undefined' && CONSUME_BLOCKED.has(word)) {
      return 'NOT COUNTED HERE';
    }
    if (typeof CONSUME_DICT === 'undefined' || !CONSUME_DICT.has(word)) return 'NOT A WORD';
    return '';
  }

  function submitTray() {
    if (!S || S.won || !S.tray.length) return;
    const word = tileWord(S.tray);
    const reason = rejectReason(word);
    if (reason) {
      S.bad = true;
      S.flash = reason;
      CSFX.bad();
      updateTray();
      later(() => {
        if (!S) return;
        S.bad = false;
        S.flash = '';
        updateTray();
      }, 1400);
      return;
    }
    const wordId = nextWordId++;
    S.tray.forEach(t => { t.wordId = wordId; });
    S.tray.forEach((tile, index) => S.flashing.set(tile.id, index));
    S.tableau.push({ id: wordId, word, tileIds: S.tray.map(t => t.id) });
    S.wordsFormed++;
    S.tray = [];
    S.bad = false;
    CSFX.word(S.tableau.length);
    updateAll();
    later(() => {
      if (!S) return;
      S.flashing.clear();
      updateBoard();
    }, 520);
    if (S.tiles.every(t => t.wordId) && !S.tray.length) later(win, 280);
  }

  function shatterWord(id) {
    if (!S || S.won) return;
    const idx = S.tableau.findIndex(w => w.id === id);
    if (idx < 0) return;
    const [entry] = S.tableau.splice(idx, 1);
    S.shatters++;
    entry.tileIds.forEach(id => {
      const tile = S.tiles.find(t => t.id === id);
      if (!tile) return;
      tile.wordId = null;
      S.returned.add(id);
    });
    CSFX.shatter();
    updateAll();
    later(() => {
      if (!S) return;
      entry.tileIds.forEach(id => S.returned.delete(id));
      updateBoard();
    }, 420);
  }

  function win() {
    if (!S || S.won) return;
    S.won = true;
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - S.startTime) / 1000));
    const minutes = Math.floor(elapsedSeconds / 60);
    const seconds = String(elapsedSeconds % 60).padStart(2, '0');
    // The generator knows the shortest possible clear, so matching it is the real
    // achievement; a clean clear with no shatters is the secondary one.
    const used = S.tableau.length;
    const best = S.data.minWords;
    const message = used <= best ? 'PERFECT CLEAR' : S.shatters === 0 ? 'CLEAN CLEAR' : 'SOLVED';
    const wordNote = used <= best
      ? `${used} WORDS · THE SHORTEST POSSIBLE`
      : `${used} WORDS · BEST POSSIBLE IS ${best}`;
    recordComplete(S.n);
    syncJourney();
    CSFX.win();
    setArcadeExitVisible(false);
    const completedLevel = S.n;
    wrap.innerHTML = buildArcadeResultCard({
      uid: 'tile-swap-grid',
      boardKey: 'consume-grid',
      artGame: 'consume',
      color: '#ff7180',
      marquee: message,
      scoreLabel: 'TIME',
      scoreValue: `${minutes}:${seconds}`,
      scoreExtra: `<span style="color:#fff;font-size:16px">LEVEL ${completedCount()}/${LEVELS.length}</span>`,
      canSave: false,
      showBoard: false,
      showSaveArea: false,
      buttons: `
        <button class="cw-btn arcade-result-primary" data-act="another">PLAY ANOTHER</button>
        <button class="cw-btn arcade-result-secondary" data-act="replay">REPLAY</button>
        <button class="cw-btn arcade-result-secondary" data-act="modes">TILE SWAP MENU</button>
        <button class="cw-btn arcade-result-arcade" data-act="arcade">ARCADE</button>
      `,
    });
    mountSelectionArt('tile-swap-grid-art', 'consume');
    wrap.onclick = e => {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      SFX.menuSelect();
      if (act === 'another') transitionToUnseenPuzzle();
      else if (act === 'replay') startLevel(completedLevel);
      else if (act === 'modes' && typeof window.renderConsumeModes === 'function') window.renderConsumeModes();
      else if (act === 'arcade') nav('lobby');
    };
  }

  function transitionToUnseenPuzzle() {
    if (!S || !wrap) return;
    wrap.classList.add('cw-level-leaving');
    later(() => {
      serveUnseenPuzzle();
      wrap.classList.remove('cw-level-leaving');
      wrap.classList.add('cw-level-entering');
      later(() => wrap?.classList.remove('cw-level-entering'), 480);
    }, 200);
  }

  function renderPlay() {
    if (!wrap || !S) return;
    wrap.innerHTML =
      playSceneryMarkup() +
      `<div class="cw-hud">` +
      `<button class="cw-btn" data-act="modes">TILE SWAP</button>` +
      `<strong>GRID</strong>` +
      `<button class="cw-btn" data-act="reset">RESET</button>` +
      `</div>` +
      `<div class="cw-goal">BOARD ${S.n}/${LEVELS.length} · <span class="cw-goal-words">${S.data.minWords}` +
      `${S.data.maxWords > S.data.minWords ? '+' : ''}</span> WORDS TO SOLVE` +
      `<span id="cw-progress"></span></div>` +
      `<div class="cw-board" id="cw-board" style="--cw-cols:${S.boardCols}"></div>` +
      `<div class="cw-tray-shell">` +
      `<div class="cw-flash" id="cw-flash" role="status" aria-live="polite" hidden></div>` +
      `<div class="cw-tray-pos">` +
      `<div class="cw-tray" id="cw-tray"></div>` +
      `<button class="cw-clear" type="button" data-act="clear" aria-label="Clear selected tiles">CLEAR</button>` +
      `</div>` +
      `<button class="cw-spell" data-act="submit">SPELL IT</button>` +
      `</div>` +
      `<div class="cw-tableau-shell">` +
      `<div class="cw-tableau" id="cw-tableau"></div>` +
      `<div class="cw-return-hint">TAP TO RETURN WORD</div>` +
      `</div>`;
    wrap.querySelector('.cw-hud').addEventListener('click', e => {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'modes') { SFX.menuSelect(); window.renderConsumeModes?.(); }
      if (act === 'reset') resetLevel();
    });
    wrap.querySelector('#cw-board').addEventListener('click', e => {
      const tile = e.target.closest('[data-board-tile]');
      if (tile) tapBoard(+tile.getAttribute('data-board-tile'));
    });
    wrap.querySelector('#cw-tray').addEventListener('click', e => {
      const tile = e.target.closest('[data-tray-tile]');
      if (tile) tapTray(+tile.getAttribute('data-tray-tile'));
    });
    wrap.querySelector('[data-act="submit"]').addEventListener('click', submitTray);
    wrap.querySelector('[data-act="clear"]').addEventListener('click', () => {
      if (!S || !S.tray.length) return;
      S.tray = []; S.bad = false; CSFX.back(); updateAll();
    });
    wrap.querySelector('#cw-tableau').addEventListener('click', e => {
      const chip = e.target.closest('[data-word-id]');
      if (chip) shatterWord(+chip.getAttribute('data-word-id'));
    });
    updateAll();
  }

  function updateAll() {
    updateBoard();
    updateTray();
    updateTableau();
  }

  function updateBoard() {
    const board = wrap && wrap.querySelector('#cw-board');
    if (!board || !S) return;
    const current = [...board.querySelectorAll('[data-board-tile]')];
    const stable = current.length === S.tiles.length && current.every((element, index) =>
      Number(element.dataset.boardTile) === S.tiles[index].id
    );
    if (!stable) {
      board.innerHTML = S.tiles.map(t =>
        `<button class="${tileClass(t)}" type="button" data-board-tile="${t.id}" style="--cw-tile-index:${t.id - 1};--cw-flash-delay:${(S.flashing.get(t.id) || 0) * 40}ms">${esc(t.ch.toUpperCase())}</button>`
      ).join('');
      return;
    }
    // Preserve the button nodes between taps. Replacing them here could destroy
    // the target of a quick follow-up touch before its click event was delivered.
    current.forEach((element, index) => {
      const tile = S.tiles[index];
      element.className = tileClass(tile);
      element.style.setProperty('--cw-flash-delay', `${(S.flashing.get(tile.id) || 0) * 40}ms`);
    });
  }

  function tileClass(t) {
    const cls = ['cw-tile'];
    if (S.tray.includes(t)) cls.push('selected');
    if (t.wordId) cls.push('consumed', `word-${((t.wordId - 1) % 6) + 1}`);
    if (S.flashing.has(t.id)) cls.push('word-flash');
    if (S.returned.has(t.id)) cls.push('returned');
    return cls.join(' ');
  }

  function updateTray() {
    const tray = wrap && wrap.querySelector('#cw-tray');
    if (!tray || !S) return;
    tray.classList.toggle('bad', !!S.bad);
    const flash = wrap.querySelector('#cw-flash');
    if (flash) {
      flash.hidden = !S.flash;
      flash.textContent = S.flash || '';
    }
    const progress = wrap.querySelector('#cw-progress');
    if (progress) {
      const used = S.tableau.length;
      progress.textContent = used ? ` · ${used} SPELLED` : '';
      progress.className = used > S.data.minWords ? 'over' : '';
    }
    const word = tileWord(S.tray);
    tray.classList.toggle('valid', word.length >= 3 && typeof CONSUME_DICT !== 'undefined' && CONSUME_DICT.has(word));
    tray.innerHTML = S.tray.length
      ? S.tray.map(t => `<button class="cw-tile tray" type="button" data-tray-tile="${t.id}">${esc(t.ch.toUpperCase())}</button>`).join('')
      : '';
    const btn = wrap.querySelector('.cw-spell');
    if (btn) btn.disabled = false;
    const clear = wrap.querySelector('.cw-clear');
    if (clear) clear.disabled = !S.tray.length;
  }

  function updateTableau() {
    const tab = wrap && wrap.querySelector('#cw-tableau');
    if (!tab || !S) return;
    const hint = wrap.querySelector('.cw-return-hint');
    const stuck = stuckText();
    const hintable = hintableWordIds();
    if (hint) {
      hint.hidden = !S.tableau.length;
      hint.textContent = stuck || 'TAP TO RETURN WORD';
      hint.classList.toggle('stuck', !!stuck);
    }
    tab.innerHTML = S.tableau.length
      ? S.tableau.map(entry =>
        `<button class="cw-chip word-${((entry.id - 1) % 6) + 1}${hintable.has(entry.id) ? ' hintable' : ''}" type="button" data-word-id="${entry.id}">` +
        entry.word.toUpperCase().split('').map(ch => `<span class="cw-chip-tile">${esc(ch)}</span>`).join('') +
        `</button>`
      ).join('')
      : '';
  }

  window.initConsumeGrid = function() {
    wrap = document.getElementById('consume-wrap');
    if (!wrap || !LEVELS.length) return;
    serveUnseenPuzzle();
  };

  window.initConsume = function() {
    wrap = document.getElementById('consume-wrap');
    if (!wrap) return;
    if (typeof window.renderConsumeModes === 'function') window.renderConsumeModes();
    else serveUnseenPuzzle();
  };

  window.consumeBack = function() {
    killTimers();
    clearTheme();
    S = null;
  };
})();
