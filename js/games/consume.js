// Consume - flat letter-pool word puzzle.
// Boards come from generate_consume_boards.py and are gated by an exhaustive solver.
(function() {
  const STORE_KEY = 'moberino-consume-v1';
  const DATA = (typeof CONSUME_DATA !== 'undefined') ? CONSUME_DATA : { levels: [] };
  const LEVELS = DATA.levels || [];
  const ACCENT = '#38d8ff';

  let wrap = null;
  let S = null;
  let timers = [];
  let nextWordId = 1;

  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function killTimers() { timers.forEach(clearTimeout); timers = []; }
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
  function ensureProfile() {
    const s = loadStore();
    if (s.stars && !s.profiles) {
      const tag = genTag({});
      s.active = tag;
      s.profiles = { [tag]: { stars: s.stars } };
      delete s.stars;
    }
    if (!s.profiles) s.profiles = {};
    // Retroactively adopt the shared cross-game code if it differs — old
    // progress under the previous tag stays put, just no longer active.
    const shared = typeof window.PlayerID !== 'undefined' ? window.PlayerID.get() : null;
    if (shared && shared !== s.active) {
      if (!s.profiles[shared]) s.profiles[shared] = { stars: {} };
      s.active = shared;
      saveStore(s);
    } else if (!s.active || !s.profiles[s.active]) {
      s.active = genTag(s.profiles);
      s.profiles[s.active] = { stars: {} };
      saveStore(s);
    }
    if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(s.active);
    return s;
  }
  function myStars() { const s = ensureProfile(); return s.profiles[s.active].stars || {}; }
  function recordStars(lvl, stars) {
    const s = ensureProfile();
    const p = s.profiles[s.active];
    if (stars > (p.stars[lvl] || 0)) p.stars[lvl] = stars;
    saveStore(s);
  }
  function highestDone(stars) {
    let m = 0;
    const st = stars || myStars();
    for (const k in st) m = Math.max(m, +k);
    return m;
  }
  function totalStars(stars) {
    let t = 0;
    const st = stars || myStars();
    for (const k in st) t += st[k];
    return t;
  }
  // Rename the active profile to a player-chosen code, carrying stars along.
  function setCustomTag(raw) {
    const tag = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (tag.length < 2) return { ok: false, msg: '2-12 LETTERS/NUMBERS' };
    const s = ensureProfile();
    if (tag === s.active) return { ok: true };
    const cur = (s.profiles[s.active] && s.profiles[s.active].stars) || {};
    if (!s.profiles[tag]) s.profiles[tag] = { stars: {} };
    const dest = s.profiles[tag].stars;
    for (const k in cur) if ((cur[k] || 0) > (dest[k] || 0)) dest[k] = cur[k];
    s.active = tag;
    saveStore(s);
    if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(tag);
    return { ok: true };
  }
  function adoptTag(tag, upToLevel) {
    const s = ensureProfile();
    if (!s.profiles[tag]) s.profiles[tag] = { stars: {} };
    for (let n = 1; n <= upToLevel; n++) {
      if (!s.profiles[tag].stars[n]) s.profiles[tag].stars[n] = 1;
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
      const st = myStars();
      RemoteLB.submit('consume', ensureProfile().active, hi, 0, 'L' + hi)
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
    return anyWordFits(left) ? '' : "No word fits what's left - shatter one apart.";
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

  function submitTray() {
    if (!S || S.won || !S.tray.length) return;
    const word = tileWord(S.tray);
    const ok = word.length >= 3 && typeof CONSUME_DICT !== 'undefined' && CONSUME_DICT.has(word);
    if (!ok) {
      S.bad = true;
      CSFX.bad();
      updateTray();
      later(() => {
        if (!S) return;
        S.bad = false;
        updateTray();
      }, 340);
      return;
    }
    const wordId = nextWordId++;
    S.tray.forEach(t => { t.wordId = wordId; });
    S.tableau.push({ id: wordId, word, tileIds: S.tray.map(t => t.id) });
    S.tray = [];
    S.bad = false;
    CSFX.word(S.tableau.length);
    updateAll();
    if (S.tiles.every(t => t.wordId) && !S.tray.length) later(win, 280);
  }

  function shatterWord(id) {
    if (!S || S.won) return;
    const idx = S.tableau.findIndex(w => w.id === id);
    if (idx < 0) return;
    const [entry] = S.tableau.splice(idx, 1);
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
    recordStars(S.n, 1);
    syncJourney();
    CSFX.win();
    const hasNext = S.n < LEVELS.length;
    const ov = document.createElement('div');
    ov.className = 'cw-win';
    ov.innerHTML =
      `<div class="cw-win-title">PUZZLE SOLVED!</div>` +
      `<div class="cw-win-btns">` +
      (hasNext ? `<button class="cw-btn primary" data-act="next">NEXT LEVEL ▶</button>` : '') +
      `<button class="cw-btn" data-act="replay">REPLAY</button>` +
      `<button class="cw-btn" data-act="journey">JOURNEY</button></div>`;
    wrap.appendChild(ov);
    ov.addEventListener('click', e => {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      SFX.menuSelect();
      if (act === 'next') startLevel(S.n + 1);
      else if (act === 'replay') startLevel(S.n);
      else renderJourney();
    });
  }

  function renderPlay() {
    if (!wrap || !S) return;
    wrap.innerHTML =
      `<div class="cw-hud">` +
      `<button class="cw-btn" data-act="journey">◀ JOURNEY</button>` +
      `<div class="cw-hud-mid"><span class="cw-lvl">LEVEL ${S.n}</span></div>` +
      `<button class="cw-btn" data-act="reset">RESET</button>` +
      `</div>` +
      `<div class="cw-board" id="cw-board" style="--cw-cols:${S.boardCols}"></div>` +
      `<div class="cw-tray-shell">` +
      `<div class="cw-tray" id="cw-tray"></div>` +
      `<button class="cw-spell" data-act="submit">SPELL IT</button>` +
      `</div>` +
      `<div class="cw-tableau-shell">` +
      `<div class="cw-tableau" id="cw-tableau"></div>` +
      `<div class="cw-return-hint">TAP TO RETURN WORD</div>` +
      `</div>`;
    wrap.querySelector('.cw-hud').addEventListener('click', e => {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'journey') { SFX.menuSelect(); renderJourney(); }
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
    board.innerHTML = S.tiles.map(t =>
      `<button class="${tileClass(t)}" type="button" data-board-tile="${t.id}">${esc(t.ch.toUpperCase())}</button>`
    ).join('');
  }

  function tileClass(t) {
    const cls = ['cw-tile'];
    if (S.tray.includes(t)) cls.push('selected');
    if (t.wordId) cls.push('consumed', `word-${((t.wordId - 1) % 6) + 1}`);
    if (S.returned.has(t.id)) cls.push('returned');
    return cls.join(' ');
  }

  function updateTray() {
    const tray = wrap && wrap.querySelector('#cw-tray');
    if (!tray || !S) return;
    tray.classList.toggle('bad', !!S.bad);
    tray.innerHTML = S.tray.length
      ? S.tray.map(t => `<button class="cw-tile tray" type="button" data-tray-tile="${t.id}">${esc(t.ch.toUpperCase())}</button>`).join('')
      : '';
    const btn = wrap.querySelector('.cw-spell');
    if (btn) btn.disabled = S.tray.length < 3;
  }

  function updateTableau() {
    const tab = wrap && wrap.querySelector('#cw-tableau');
    if (!tab || !S) return;
    const hint = wrap.querySelector('.cw-return-hint');
    if (hint) hint.hidden = !S.tableau.length;
    tab.innerHTML = S.tableau.length
      ? S.tableau.map(entry =>
        `<button class="cw-chip word-${((entry.id - 1) % 6) + 1}" type="button" data-word-id="${entry.id}">` +
        entry.word.toUpperCase().split('').map(ch => `<span class="cw-chip-tile">${esc(ch)}</span>`).join('') +
        `</button>`
      ).join('')
      : '';
  }

  function renderJourney() {
    killTimers();
    S = null;
    const store = ensureProfile();
    const st = store.profiles[store.active].stars || {};
    const done = highestDone(st);
    const next = Math.min(done + 1, LEVELS.length);
    wrap.innerHTML =
      `<div class="cw-levels">` +
      `<button class="cw-mode-return" type="button" data-act="modes">MODES</button>` +
      `<div class="cw-title">TILE SWAP</div>` +
      `<div class="cw-intro">Make real words from the grid. Tap a completed word to return its tiles and rearrange them.</div>` +
      `<div class="cw-section-label">LEVELS</div>` +
      `<div class="cw-level-grid">` +
      LEVELS.map(lvl => {
        const complete = st[lvl.n] || 0;
        const cls = complete ? 'done' : (lvl.n === next ? 'next' : 'lock');
        return `<button class="cw-node ${cls}" type="button" data-level="${lvl.n}">` +
          `<span>${lvl.n}</span></button>`;
      }).join('') +
      `</div>` +
      `<div class="cw-code-card">` +
      `<div class="cw-code-row"><span class="cw-code-label">YOUR CODE</span>` +
      `<span class="cw-me-name">${esc(store.active)}</span>` +
      `<button class="cw-btn cw-tag-edit" id="cw-tag-edit" type="button">CHANGE</button></div>` +
      `<div class="cw-tag-editor" id="cw-tag-editor" hidden>` +
      `<input id="cw-tag-in" type="text" maxlength="12" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="TACOCAT7">` +
      `<button class="cw-btn" id="cw-tag-set">SET</button>` +
      `<span class="cw-find-msg" id="cw-tag-msg"></span></div>` +
      `<div class="cw-code-divider"></div>` +
      `<div class="cw-code-row cw-code-enter"><span class="cw-code-label">PLAYED ELSEWHERE?</span>` +
      `<input id="cw-find-in" type="text" maxlength="12" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="FROG4">` +
      `<button class="cw-btn" id="cw-find-go">ENTER</button></div>` +
      `<span class="cw-find-msg" id="cw-find-msg"></span>` +
      `<div class="cw-code-note">CODES ARE PUBLIC — USE A FUN PHRASE, NEVER A REAL PASSWORD OR PIN.</div></div>` +
      `</div>`;
    wrap.querySelector('.cw-level-grid').addEventListener('click', e => {
      const node = e.target.closest('[data-level]');
      if (!node) return;
      const n = +node.getAttribute('data-level');
      if (n > done + 1) { CSFX.bad(); return; }
      SFX.menuSelect();
      startLevel(n);
    });
    wrap.querySelector('[data-act="modes"]').addEventListener('click', () => {
      SFX.menuSelect();
      if (typeof window.renderConsumeModes === 'function') window.renderConsumeModes();
    });
    wrap.querySelector('#cw-tag-edit').addEventListener('click', () => {
      SFX.menuSelect();
      const editor = wrap.querySelector('#cw-tag-editor');
      editor.hidden = !editor.hidden;
      if (!editor.hidden) wrap.querySelector('#cw-tag-in').focus();
    });
    const applyTag = () => {
      const msg = wrap.querySelector('#cw-tag-msg');
      const res = setCustomTag(wrap.querySelector('#cw-tag-in').value);
      if (!res.ok) { msg.textContent = res.msg; CSFX.bad(); return; }
      SFX.menuSelect();
      syncJourney();
      renderJourney();
    };
    wrap.querySelector('#cw-tag-set').addEventListener('click', applyTag);
    wrap.querySelector('#cw-tag-in').addEventListener('keydown', e => {
      if (e.key === 'Enter') applyTag();
    });
    wrap.querySelector('#cw-find-go').addEventListener('click', () => {
      const inp = wrap.querySelector('#cw-find-in');
      const msg = wrap.querySelector('#cw-find-msg');
      const tag = (inp.value || '').trim().toUpperCase();
      if (!tag) return;
      SFX.menuSelect();
      msg.textContent = 'CHECKING...';
      if (typeof RemoteLB === 'undefined' || !RemoteLB.lookup) { msg.textContent = 'NO CONNECTION'; return; }
      RemoteLB.lookup('consume', tag).then(row => {
        if (!row) { msg.textContent = 'CODE NOT FOUND'; CSFX.bad(); return; }
        adoptTag(row.name, Math.min(row.score, LEVELS.length));
        CSFX.word(4);
        renderJourney();
      });
    });
  }

  window.initConsumeGrid = function() {
    wrap = document.getElementById('consume-wrap');
    if (!wrap || !LEVELS.length) return;
    renderJourney();
  };

  window.initConsume = function() {
    wrap = document.getElementById('consume-wrap');
    if (!wrap) return;
    if (typeof window.renderConsumeModes === 'function') window.renderConsumeModes();
    else renderJourney();
  };

  window.consumeBack = function() {
    killTimers();
    S = null;
  };
})();
