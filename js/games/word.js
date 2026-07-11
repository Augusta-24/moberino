// ══════════════════════════════════════
//  WORD MOBE — brick-wall word puzzle
//  Boards come pregenerated + solver-verified from js/games/word-boards.js
//  (regenerate with generate_word_boards.py). Physics here (settle/fuse/clear)
//  must stay in lockstep with the simulate() mirror in that script.
// ══════════════════════════════════════
(function() {
  const STORE_KEY = 'moberino-word-v1';
  const LEVELS = (typeof WORD_DATA !== 'undefined') ? WORD_DATA.levels : [];

  // ---------- persistence ----------
  // Journeys belong to auto-generated tags (FROG4, NEON7…) — random, meaningless,
  // no typed-in names, so nothing personal ever gets stored. Local progress lives in
  // localStorage; every new best level also posts to the shared arcade leaderboard,
  // which doubles as the journey log and lets a tag be found from another device.
  const TAG_WORDS = ['FROG','MINT','TACO','DUCK','MOON','STAR','WAVE','COMET','OTTER',
    'MANGO','PIZZA','NEON','DISCO','LASER','TIGER','PANDA','KOALA','LEMON','BERRY',
    'MAPLE','SODA','JELLY','BAGEL','NACHO','YETI','GECKO','SLOTH','NINJA','GHOST',
    'SPARK','TURBO','COSMO','ASTRO','LUNA','NOVA','BLIP','ZOOM','DINO','RHINO',
    'HIPPO','CORGI','WOMBAT','PICKLE','WAFFLE','ROCKET','BANJO','KAZOO','YOYO'];
  function loadStore() { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch(e) { return {}; } }
  function saveStore(d) { try { localStorage.setItem(STORE_KEY, JSON.stringify(d)); } catch(e) {} }
  function genTag(taken) {
    for (let i = 0; i < 200; i++) {
      const t = TAG_WORDS[Math.floor(Math.random() * TAG_WORDS.length)] + (2 + Math.floor(Math.random() * 8));
      if (!taken[t]) return t;
    }
    return 'MOBE' + Math.floor(Math.random() * 90 + 10);
  }
  function ensureProfile() {
    const s = loadStore();
    if (!s.profiles) s.profiles = {};
    if (!s.active || !s.profiles[s.active]) {
      s.active = genTag(s.profiles);
      s.profiles[s.active] = { stars: {} };
      saveStore(s);
    }
    return s;
  }
  function myTag() { return ensureProfile().active; }
  function myStars() { const s = ensureProfile(); return s.profiles[s.active].stars || {}; }
  function recordStars(lvl, stars) {
    const s = ensureProfile();
    const p = s.profiles[s.active];
    if (stars > (p.stars[lvl] || 0)) p.stars[lvl] = stars;
    saveStore(s);
  }
  function adoptTag(tag, upToLevel) {
    const s = ensureProfile();
    if (!s.profiles[tag]) s.profiles[tag] = { stars: {} };
    for (let n = 1; n <= upToLevel; n++) {
      if (!s.profiles[tag].stars[n]) s.profiles[tag].stars[n] = 1;
    }
    s.active = tag;
    saveStore(s);
  }
  function switchTag(tag) { const s = ensureProfile(); if (s.profiles[tag]) { s.active = tag; saveStore(s); } }
  function newTag() {
    const s = ensureProfile();
    const t = genTag(s.profiles);
    s.profiles[t] = { stars: {} };
    s.active = t;
    saveStore(s);
    return t;
  }
  function highestDone() { let m = 0; const st = myStars(); for (const k in st) m = Math.max(m, +k); return m; }
  function totalStars(st) { let t = 0; for (const k in st) t += st[k]; return t; }
  function syncJourney() {
    try {
      if (typeof RemoteLB === 'undefined' || !RemoteLB.submit) return;
      const hi = highestDone();
      if (!hi) return;
      RemoteLB.submit('word', myTag(), hi, 0, '★' + totalStars(myStars()) + ' · L' + hi)
        .catch(() => {}); // offline is fine — journey lives locally too
    } catch(e) {}
  }

  // ---------- piano (Signal's voice: triangle + sine an octave up, slightly flat) ----------
  const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]; // C major pentatonic
  const ROOT = 261.63;
  function pfreq(deg) { return ROOT * Math.pow(2, SCALE[Math.max(0, Math.min(SCALE.length - 1, deg))] / 12); }
  function ptone(f, delay, dur, vol) {
    try {
      const c = getAudioCtx();
      const t0 = c.currentTime + Math.max(delay, 0.02);
      [[f, 'triangle', dur, vol, f * 0.992], [f * 2.01, 'sine', dur * 0.55, vol * 0.3, f * 1.99]].forEach(([ff, type, d, v, end]) => {
        const o = c.createOscillator(), g = c.createGain();
        o.connect(g); g.connect(c.destination);
        o.type = type; o.frequency.setValueAtTime(ff, t0);
        o.frequency.exponentialRampToValueAtTime(end, t0 + d);
        g.gain.setValueAtTime(v, t0);
        g.gain.exponentialRampToValueAtTime(0.001, t0 + d);
        o.start(t0); o.stop(t0 + d + 0.02);
      });
    } catch(e) {}
  }
  const PSFX = {
    select() { ptone(pfreq(4), 0, 0.09, 0.045); },
    swap()   { ptone(pfreq(2), 0, 0.13, 0.06); },
    evict()  { ptone(pfreq(8), 0.06, 0.08, 0.03); },
    bad()    { ptone(130, 0, 0.16, 0.05); },
    clear(i) { ptone(pfreq(i), 0, 0.34, 0.08); ptone(pfreq(i + 2), 0.09, 0.3, 0.055); },
    fuse()   { ptone(pfreq(3), 0, 0.4, 0.06); ptone(pfreq(5), 0.02, 0.4, 0.05); },
    win()    { [0, 2, 4, 6, 8, 10].forEach((d, i) => ptone(pfreq(d), i * 0.09, 0.36, 0.06)); },
  };

  // ---------- state ----------
  let S = null;        // active level state
  let wrap = null;     // #word-wrap
  let timers = [];
  function later(fn, ms) { timers.push(setTimeout(fn, ms)); }
  function killTimers() { timers.forEach(clearTimeout); timers = []; }

  function deepBricks(bricks) {
    return bricks.map(b => ({ id: b.id, x: b.x, lv: b.lv, frag: b.frag, sol: b.sol,
      tiles: b.tiles.map(t => ({ tid: t.tid, ch: t.ch, red: t.red })) }));
  }

  function startLevel(n) {
    const data = LEVELS[n - 1];
    if (!data) return;
    killTimers();
    let tid = 0;
    S = {
      n, w: data.w, par: data.par,
      bricks: data.bricks.map(b => ({
        id: b.id, x: b.x, lv: b.lv, frag: !!b.frag, sol: b.sol,
        tiles: b.cur.split('').map((ch, i) => ({ tid: tid++, ch, red: !!b.m[i] })),
      })),
      rack: data.rack.slice(),
      sel: null, swaps: 0, lock: 0, clears: 0,
      rows: Math.max.apply(null, data.bricks.map(b => b.lv)) + 1,
      undo: [],
    };
    S.initial = { bricks: deepBricks(S.bricks), rack: S.rack.slice() };
    renderPlay();
  }

  // ---------- physics (mirrors generate_word_boards.py simulate()) ----------
  function overlap(a, b) { return a.x < b.x + b.tiles.length && b.x < a.x + a.tiles.length; }
  function settle() {
    let moved = true;
    while (moved) {
      moved = false;
      S.bricks.forEach(g => {
        let supp = 0;
        S.bricks.forEach(o => { if (o !== g && o.lv < g.lv && overlap(g, o)) supp = Math.max(supp, o.lv + 1); });
        if (g.lv !== supp) { g.lv = supp; moved = true; }
      });
    }
  }
  function fuseAll() {
    const fused = [];
    let changed = true;
    while (changed) {
      changed = false;
      S.bricks.sort((a, b) => a.x - b.x);
      outer:
      for (const a of S.bricks) {
        for (const b of S.bricks) {
          if (a !== b && a.frag && b.frag && a.lv === b.lv && a.x + a.tiles.length === b.x) {
            a.tiles = a.tiles.concat(b.tiles);
            a.sol = a.sol + b.sol;
            a.frag = false;
            S.bricks.splice(S.bricks.indexOf(b), 1);
            fused.push(a);
            changed = true;
            break outer;
          }
        }
      }
    }
    return fused;
  }
  function brickStr(b) { return b.tiles.map(t => t.ch).join(''); }

  // ---------- play actions ----------
  function tapRack(i) {
    if (!S || S.lock) return;
    S.sel = (S.sel === i) ? null : i;
    PSFX.select();
    updateRack();
  }

  function tapTile(bid, ti) {
    if (!S || S.lock) return;
    const b = S.bricks.find(x => x.id === bid);
    if (!b) return;
    if (S.sel === null) {
      PSFX.bad();
      const rk = wrap.querySelector('.wm-rack');
      if (rk) { rk.classList.remove('nudge'); void rk.offsetWidth; rk.classList.add('nudge'); }
      return;
    }
    S.undo.push({ bricks: deepBricks(S.bricks), rack: S.rack.slice() });
    if (S.undo.length > 60) S.undo.shift();
    const letter = S.rack[S.sel];
    const evicted = b.tiles[ti].ch;
    b.tiles[ti].ch = letter;
    b.tiles[ti].red = false;
    S.rack.splice(S.sel, 1);
    S.rack.push(evicted);
    S.sel = null;
    S.swaps++;
    PSFX.swap(); PSFX.evict();
    updateAll();
    if (!b.frag && WORD_DICT.has(brickStr(b))) clearBrick(b);
    else updateHud();
  }

  function clearBrick(b) {
    S.lock++;
    PSFX.clear(Math.min(S.clears * 2, 8));
    S.clears++;
    floatText(b, brickStr(b).toUpperCase() + '!');
    b.tiles.forEach(t => {
      const el = wrap.querySelector(`[data-tid="${t.tid}"]`);
      if (el) { el.classList.add('pop'); later(() => el.remove(), 340); }
    });
    const ol = wrap.querySelector(`[data-bid="${b.id}"]`);
    if (ol) { ol.classList.add('pop'); later(() => ol.remove(), 340); }
    S.bricks.splice(S.bricks.indexOf(b), 1);
    later(() => {
      settle();
      const fused = fuseAll();
      updateBoard();
      fused.forEach(fb => {
        PSFX.fuse();
        later(() => {
          const el = wrap.querySelector(`[data-bid="${fb.id}"]`);
          if (el) { el.classList.add('flash'); later(() => el.classList.remove('flash'), 900); }
        }, 60);
        if (WORD_DICT.has(brickStr(fb))) later(() => clearBrick(fb), 480);
      });
      S.lock--;
      updateHud();
      if (!S.bricks.length) later(win, 420);
    }, 320);
  }

  function doUndo() {
    if (!S || S.lock || !S.undo.length) return;
    const prev = S.undo.pop();
    S.bricks = prev.bricks.map(b => ({ ...b, tiles: b.tiles.map(t => ({ ...t })) }));
    S.rack = prev.rack.slice();
    S.sel = null;
    SFX.menuSelect();
    renderPlay(true); // swaps stay spent — undo saves the board, not the par
  }

  function doReset() {
    if (!S || S.lock) return;
    S.bricks = S.initial.bricks.map(b => ({ ...b, tiles: b.tiles.map(t => ({ ...t })) }));
    S.rack = S.initial.rack.slice();
    S.sel = null; S.swaps = 0; S.clears = 0; S.undo = [];
    SFX.menuSelect();
    renderPlay(true);
  }

  function doHint() {
    if (!S || S.lock) return;
    let pick = null;
    for (const b of S.bricks) {
      for (let i = 0; i < b.tiles.length; i++) {
        if (b.tiles[i].ch !== b.sol[i] && !b.tiles[i].red) { pick = b.tiles[i]; break; }
      }
      if (pick) break;
    }
    if (!pick) { PSFX.bad(); return; }
    pick.red = true;
    S.swaps++; // hints cost a swap toward par
    PSFX.select();
    updateAll();
  }

  function win() {
    const stars = S.swaps <= S.par ? 3 : S.swaps <= S.par + 2 ? 2 : 1;
    recordStars(S.n, stars);
    syncJourney();
    PSFX.win();
    const done = S.n, hasNext = done < LEVELS.length;
    const board = wrap.querySelector('.wm-stage');
    if (board) board.innerHTML = '';
    const ov = document.createElement('div');
    ov.className = 'wm-win';
    ov.innerHTML =
      `<div class="wm-win-title">WALL CLEARED!</div>` +
      `<div class="wm-win-stars">${'★'.repeat(stars)}<span>${'★'.repeat(3 - stars)}</span></div>` +
      `<div class="wm-win-sub">${S.swaps} SWAPS · PAR ${S.par}</div>` +
      `<div class="wm-win-btns">` +
      (hasNext ? `<button class="wm-btn primary" data-act="next">NEXT LEVEL ▶</button>` : '') +
      `<button class="wm-btn" data-act="replay">REPLAY</button>` +
      `<button class="wm-btn" data-act="journey">JOURNEY</button></div>`;
    wrap.appendChild(ov);
    ov.addEventListener('click', e => {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (!act) return;
      SFX.menuSelect();
      if (act === 'next') startLevel(done + 1);
      else if (act === 'replay') startLevel(done);
      else renderJourney();
    });
  }

  // ---------- rendering: play ----------
  function metrics() {
    const availW = Math.min(wrap.clientWidth - 16, 560);
    const ts = Math.max(26, Math.min(52, Math.floor((availW - 8) / S.w) - 4));
    return { ts, pitch: ts + 4, vpitch: ts + 14 };
  }
  function tilePos(b, i, m) {
    return { left: (b.x + i) * m.pitch + 8, top: (S.rows - 1 - b.lv) * m.vpitch + 6 };
  }

  function renderPlay() {
    killTimers();
    wrap.innerHTML =
      `<div class="wm-hud">` +
      `<button class="wm-btn" data-act="journey">◀ JOURNEY</button>` +
      `<div class="wm-hud-mid"><span class="wm-lvl">LEVEL ${S.n}</span><span class="wm-swaps" id="wm-swaps"></span></div>` +
      `<div class="wm-hud-btns">` +
      `<button class="wm-btn" data-act="hint">HINT</button>` +
      `<button class="wm-btn" data-act="undo">UNDO</button>` +
      `<button class="wm-btn" data-act="reset">RESET</button></div></div>` +
      (S.n <= 2 ? `<div class="wm-coach">TAP A RACK LETTER · THEN TAP THE TILE IT FIXES<br>REAL WORDS CLEAR · THE WALL FALLS · EMPTY IT!</div>` : '') +
      `<div class="wm-stage"><div class="wm-board" id="wm-board"></div></div>` +
      `<div class="wm-rack-label">YOUR LETTERS</div>` +
      `<div class="wm-rack" id="wm-rack"></div>`;
    wrap.querySelector('.wm-hud').addEventListener('click', e => {
      const act = e.target.getAttribute && e.target.getAttribute('data-act');
      if (act === 'journey') { SFX.menuSelect(); renderJourney(); }
      else if (act === 'undo') doUndo();
      else if (act === 'reset') doReset();
      else if (act === 'hint') doHint();
    });
    const board = wrap.querySelector('#wm-board');
    board.addEventListener('click', e => {
      const t = e.target.closest('[data-tid]');
      if (t) tapTile(+t.getAttribute('data-bid2'), +t.getAttribute('data-ti'));
    });
    wrap.querySelector('#wm-rack').addEventListener('click', e => {
      const t = e.target.closest('[data-ri]');
      if (t) tapRack(+t.getAttribute('data-ri'));
    });
    updateAll();
  }

  function updateAll() { updateBoard(); updateRack(); updateHud(); }

  function updateHud() {
    const el = wrap.querySelector('#wm-swaps');
    if (el) el.textContent = `SWAPS ${S.swaps} · PAR ${S.par}`;
  }

  function updateBoard() {
    const board = wrap.querySelector('#wm-board');
    if (!board) return;
    const m = metrics();
    board.style.width = (S.w * m.pitch + 12) + 'px';
    board.style.height = (S.rows * m.vpitch + 4) + 'px';
    const liveT = {}, liveB = {};
    S.bricks.forEach(b => {
      liveB[b.id] = 1;
      let ol = board.querySelector(`[data-bid="${b.id}"]`);
      if (!ol) {
        ol = document.createElement('div');
        ol.setAttribute('data-bid', b.id);
        board.appendChild(ol);
      }
      ol.className = 'wm-outline' + (b.frag ? ' frag' : '');
      const p0 = tilePos(b, 0, m);
      ol.style.left = (p0.left - 5) + 'px';
      ol.style.top = (p0.top - 5) + 'px';
      ol.style.width = ((b.tiles.length - 1) * m.pitch + m.ts + 10) + 'px';
      ol.style.height = (m.ts + 10) + 'px';
      b.tiles.forEach((t, i) => {
        liveT[t.tid] = 1;
        let el = board.querySelector(`[data-tid="${t.tid}"]`);
        if (!el) {
          el = document.createElement('div');
          el.setAttribute('data-tid', t.tid);
          el.className = 'wm-tile new';
          board.appendChild(el);
          later(() => el.classList.remove('new'), 60);
        }
        el.setAttribute('data-bid2', b.id);
        el.setAttribute('data-ti', i);
        el.classList.toggle('red', !!t.red);
        el.textContent = t.ch.toUpperCase();
        const p = tilePos(b, i, m);
        el.style.left = p.left + 'px';
        el.style.top = p.top + 'px';
        el.style.width = m.ts + 'px';
        el.style.height = m.ts + 'px';
        el.style.fontSize = Math.round(m.ts * 0.5) + 'px';
      });
    });
    board.querySelectorAll('[data-tid]').forEach(el => {
      if (!liveT[el.getAttribute('data-tid')] && !el.classList.contains('pop')) el.remove();
    });
    board.querySelectorAll('[data-bid]').forEach(el => {
      if (!liveB[el.getAttribute('data-bid')] && !el.classList.contains('pop')) el.remove();
    });
  }

  function updateRack() {
    const rk = wrap.querySelector('#wm-rack');
    if (!rk) return;
    rk.innerHTML = S.rack.map((ch, i) =>
      `<div class="wm-rk${S.sel === i ? ' sel' : ''}" data-ri="${i}">${ch.toUpperCase()}</div>`).join('');
  }

  function floatText(b, txt) {
    const board = wrap.querySelector('#wm-board');
    if (!board) return;
    const m = metrics();
    const p = tilePos(b, Math.floor(b.tiles.length / 2), m);
    const el = document.createElement('div');
    el.className = 'wm-float';
    el.textContent = txt;
    el.style.left = (b.x * m.pitch + 8) + 'px';
    el.style.top = p.top + 'px';
    board.appendChild(el);
    later(() => el.remove(), 950);
  }

  // ---------- rendering: journey ----------
  function renderJourney() {
    killTimers();
    S = null;
    const st = myStars(), done = highestDone(), next = Math.min(done + 1, LEVELS.length);
    let nodes = '';
    for (let n = 1; n <= LEVELS.length; n++) {
      const s = st[n] || 0;
      const cls = s ? 'done' : (n === next ? 'next' : 'lock');
      nodes += `<div class="wm-node ${cls}" data-n="${n}"><span>${n}</span>` +
        `<em>${s ? '★'.repeat(s) : (n === next ? 'PLAY' : '···')}</em></div>`;
    }
    const store = ensureProfile();
    const others = Object.keys(store.profiles).filter(t => t !== store.active);
    wrap.innerHTML =
      `<div class="wm-journey">` +
      `<div class="wm-title">WORD MOBE</div>` +
      `<div class="wm-sub">FIX THE WORDS · BREAK THE WALL</div>` +
      `<div class="wm-me"><span class="wm-me-label">YOUR TAG</span>` +
      `<span class="wm-me-name">${store.active}</span>` +
      `<span class="wm-me-stars">★ ${totalStars(st)}</span></div>` +
      `<div class="wm-tagnote">YOUR JOURNEY SAVES UNDER THIS TAG — REMEMBER IT</div>` +
      `<div class="wm-nodes">${nodes}</div>` +
      `<div class="wm-switch">` +
      others.map(t => `<button class="wm-btn" data-tag="${t}">${t}</button>`).join('') +
      `<button class="wm-btn" id="wm-new-tag">+ NEW PLAYER</button></div>` +
      `<div class="wm-jump">PLAYED ON ANOTHER DEVICE? FIND YOUR TAG ` +
      `<input id="wm-find-in" type="text" maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="FROG4">` +
      `<button class="wm-btn" id="wm-find-go">FIND</button>` +
      `<span class="wm-find-msg" id="wm-find-msg"></span></div>` +
      `</div>`;
    wrap.querySelector('.wm-nodes').addEventListener('click', e => {
      const nd = e.target.closest('.wm-node');
      if (!nd) return;
      const n = +nd.getAttribute('data-n');
      if (n > done + 1) { PSFX.bad(); return; }
      SFX.menuSelect();
      startLevel(n);
    });
    wrap.querySelector('.wm-switch').addEventListener('click', e => {
      const t = e.target.getAttribute && e.target.getAttribute('data-tag');
      if (t) { SFX.menuSelect(); switchTag(t); renderJourney(); return; }
      if (e.target.id === 'wm-new-tag') { SFX.menuSelect(); newTag(); renderJourney(); }
    });
    wrap.querySelector('#wm-find-go').addEventListener('click', () => {
      const inp = wrap.querySelector('#wm-find-in');
      const msg = wrap.querySelector('#wm-find-msg');
      const tag = (inp.value || '').trim().toUpperCase();
      if (!tag) return;
      SFX.menuSelect();
      msg.textContent = 'SEARCHING…';
      if (typeof RemoteLB === 'undefined' || !RemoteLB.lookup) { msg.textContent = 'NO CONNECTION'; return; }
      RemoteLB.lookup('word', tag).then(row => {
        if (!row) { msg.textContent = 'TAG NOT FOUND'; PSFX.bad(); return; }
        adoptTag(row.name, Math.min(row.score, LEVELS.length));
        PSFX.fuse();
        renderJourney();
      });
    });
  }

  // ---------- shell hooks ----------
  window.initWord = function() {
    wrap = document.getElementById('word-wrap');
    if (!wrap || !LEVELS.length) return;
    renderJourney();
  };
  window.wordBack = function() {
    killTimers();
    S = null;
  };
})();
