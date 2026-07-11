// Consume rack modes: swap a rack tile into a row and use the evicted tile next.
(function() {
  const TAG_WORDS = ['FROG', 'MINT', 'TACO', 'DUCK', 'MOON', 'STAR', 'WAVE', 'COMET', 'BAGEL', 'SPARK', 'TURBO', 'COSMO', 'ASTRO', 'LUNA', 'NOVA', 'ZOOM'];
  const modes = {
    words: { title: 'WORDS', subtitle: 'MOVE LETTERS FROM YOUR RACK', key: 'consume-words', accent: '#ff75d5' },
    numbers: { title: 'NUMBERS', subtitle: 'MOVE DIGITS FROM YOUR RACK', key: 'consume-numbers', accent: '#ffb35c' },
  };
  let mode = null;
  let wrap = null;
  let state = null;

  function config() { return modes[mode]; }
  function storeKey() { return `moberino-consume-rack-${mode}-v1`; }
  function loadStore() { try { return JSON.parse(localStorage.getItem(storeKey()) || '{}'); } catch (e) { return {}; } }
  function saveStore(data) { try { localStorage.setItem(storeKey(), JSON.stringify(data)); } catch (e) {} }
  function tag(taken) {
    for (let i = 0; i < 100; i++) {
      const value = TAG_WORDS[Math.floor(Math.random() * TAG_WORDS.length)] + (2 + Math.floor(Math.random() * 8));
      if (!taken[value]) return value;
    }
    return `MOBE${Math.floor(Math.random() * 90 + 10)}`;
  }
  function profile() {
    const data = loadStore();
    if (!data.profiles) data.profiles = {};
    if (!data.active || !data.profiles[data.active]) {
      data.active = tag(data.profiles);
      data.profiles[data.active] = { stars: {} };
      saveStore(data);
    }
    return data;
  }
  function stars() { const data = profile(); return data.profiles[data.active].stars || {}; }
  function totalStars(value) { return Object.values(value || stars()).reduce((sum, n) => sum + n, 0); }
  function highest(value) { return Math.max(0, ...Object.keys(value || stars()).map(Number)); }
  function record(level, value) {
    const data = profile();
    const current = data.profiles[data.active].stars;
    current[level] = Math.max(current[level] || 0, value);
    saveStore(data);
  }
  function sync() {
    try {
      const done = highest();
      if (done && typeof RemoteLB !== 'undefined' && RemoteLB.submit) {
        RemoteLB.submit(config().key, profile().active, done, 0, `★${totalStars()} · L${done}`).catch(() => {});
      }
    } catch (e) {}
  }
  function levels() { return (typeof CONSUME_RACK_DATA === 'undefined' ? [] : CONSUME_RACK_DATA[mode].levels); }
  function esc(text) { return String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function isMath(text) {
    const match = text.match(/^(\d+)([+\-*/])(\d+)=(\d+)$/);
    if (!match) return false;
    const [, left, op, right, answer] = match;
    const a = Number(left), b = Number(right), c = Number(answer);
    if ((left.length > 1 && left[0] === '0') || (right.length > 1 && right[0] === '0') || (answer.length > 1 && answer[0] === '0')) return false;
    if (op === '+') return a + b === c;
    if (op === '-') return a - b === c;
    if (op === '*') return a * b === c;
    return b !== 0 && a / b === c && a % b === 0;
  }
  function rowText(row) { return row.tiles.join(''); }
  function start(level) {
    const data = levels()[level - 1];
    if (!data) return;
    state = {
      n: level, par: data.par, selected: null, swaps: 0, cleared: 0,
      rows: data.rows.map((row, id) => ({ id, sol: row.sol, label: row.label || '', tiles: row.cur.split('') })),
      rack: data.rack.slice(), initial: data,
    };
    renderPlay();
  }
  function reset() { if (state) start(state.n); }
  function tapRack(index) {
    state.selected = state.selected === index ? null : index;
    if (typeof SFX !== 'undefined') SFX.menuSelect();
    updateRack();
  }
  function tapTile(rowId, index) {
    if (!state || state.selected === null) return;
    const row = state.rows.find(item => item.id === rowId);
    if (!row || !/[a-z0-9]/i.test(row.tiles[index])) return;
    const incoming = state.rack[state.selected];
    const outgoing = row.tiles[index];
    row.tiles[index] = incoming;
    state.rack[state.selected] = outgoing;
    state.selected = null;
    state.swaps++;
    const valid = mode === 'words' ? rowText(row) === row.sol : isMath(rowText(row));
    if (valid) {
      state.rows = state.rows.filter(item => item !== row);
      state.cleared++;
      if (typeof SFX !== 'undefined') SFX.match();
      updateAll();
      if (!state.rows.length) setTimeout(win, 260);
      return;
    }
    if (typeof SFX !== 'undefined') SFX.menuSelect();
    updateAll();
  }
  function win() {
    if (!state || state.won) return;
    state.won = true;
    const award = state.swaps <= state.par ? 3 : state.swaps <= state.par + 2 ? 2 : 1;
    record(state.n, award);
    sync();
    if (typeof SFX !== 'undefined') SFX.win();
    const hasNext = state.n < levels().length;
    const overlay = document.createElement('div');
    overlay.className = 'cr-win';
    overlay.innerHTML = `<div class="cr-win-title">RESOLVED!</div><div class="cr-win-stars">${'★'.repeat(award)}<span>${'★'.repeat(3 - award)}</span></div><div class="cr-win-sub">${state.swaps} MOVES · PAR ${state.par}</div><div class="cr-win-actions">${hasNext ? '<button data-act="next">NEXT LEVEL</button>' : ''}<button data-act="replay">REPLAY</button><button data-act="journey">JOURNEY</button></div>`;
    wrap.appendChild(overlay);
    overlay.addEventListener('click', event => {
      const action = event.target.dataset.act;
      if (action === 'next') start(state.n + 1);
      if (action === 'replay') start(state.n);
      if (action === 'journey') renderJourney();
    });
  }
  function renderPlay() {
    if (!wrap || !state) return;
    const cfg = config();
    wrap.style.setProperty('--cr-accent', cfg.accent);
    wrap.innerHTML = `<div class="cr-hud"><button data-act="journey">JOURNEY</button><div><strong>${cfg.title} · LEVEL ${state.n}</strong><span id="cr-moves"></span></div><button data-act="reset">RESET</button></div><div class="cr-coach">${mode === 'words' ? 'MOVE A RACK LETTER INTO A WORD ROW' : 'MOVE A RACK DIGIT UNTIL AN EQUATION BALANCES'}</div><div class="cr-board" id="cr-board"></div><div class="cr-rack-label">YOUR RACK</div><div class="cr-rack" id="cr-rack"></div>`;
    wrap.querySelector('.cr-hud').addEventListener('click', event => {
      if (event.target.dataset.act === 'journey') renderJourney();
      if (event.target.dataset.act === 'reset') reset();
    });
    wrap.querySelector('#cr-board').addEventListener('click', event => {
      const tile = event.target.closest('[data-row]');
      if (tile) tapTile(Number(tile.dataset.row), Number(tile.dataset.tile));
    });
    wrap.querySelector('#cr-rack').addEventListener('click', event => {
      const tile = event.target.closest('[data-rack]');
      if (tile) tapRack(Number(tile.dataset.rack));
    });
    updateAll();
  }
  function updateAll() { updateBoard(); updateRack(); const moves = wrap.querySelector('#cr-moves'); if (moves) moves.textContent = `${state.swaps} MOVES`; }
  function updateBoard() {
    const board = wrap.querySelector('#cr-board');
    if (!board) return;
    board.innerHTML = state.rows.map(row => `<div class="cr-row">${row.label ? `<div class="cr-equation">${esc(row.label)}</div>` : ''}<div class="cr-tiles">${row.tiles.map((tile, index) => /[a-z0-9]/i.test(tile) ? `<button data-row="${row.id}" data-tile="${index}">${esc(tile.toUpperCase())}</button>` : `<span>${esc(tile === '*' ? 'x' : tile)}</span>`).join('')}</div></div>`).join('');
  }
  function updateRack() {
    const rack = wrap.querySelector('#cr-rack');
    if (!rack) return;
    rack.innerHTML = state.rack.map((tile, index) => `<button class="${state.selected === index ? 'selected' : ''}" data-rack="${index}">${esc(tile.toUpperCase())}</button>`).join('');
  }
  function renderJourney() {
    state = null;
    const cfg = config(), progress = profile(), completed = progress.profiles[progress.active].stars || {}, done = highest(completed), next = Math.min(done + 1, levels().length);
    wrap.style.setProperty('--cr-accent', cfg.accent);
    wrap.innerHTML = `<div class="cr-journey"><button class="cr-modes" data-act="modes">MODES</button><div class="cr-title">KNOT SWAP</div><div class="cr-sub">${cfg.subtitle}</div><div class="cr-save">SAVE CODE <strong>${esc(progress.active)}</strong> <span>★ ${totalStars(completed)}</span></div><div class="cr-levels">${levels().map(level => { const value = completed[level.n] || 0; const cls = value ? 'done' : level.n === next ? 'next' : 'locked'; return `<button class="${cls}" data-level="${level.n}">${level.n}${value ? `<em>${'★'.repeat(value)}</em>` : ''}</button>`; }).join('')}</div></div>`;
    wrap.querySelector('.cr-levels').addEventListener('click', event => { const button = event.target.closest('[data-level]'); if (button && Number(button.dataset.level) <= done + 1) start(Number(button.dataset.level)); });
    wrap.querySelector('[data-act="modes"]').addEventListener('click', () => window.renderConsumeModes());
  }
  window.initConsumeRack = function(nextMode) { mode = nextMode; wrap = document.getElementById('consume-wrap'); renderJourney(); };
  window.consumeRackBack = function() { state = null; mode = null; };
  window.renderConsumeModes = function() {
    wrap = document.getElementById('consume-wrap');
    if (!wrap) return;
    wrap.style.removeProperty('--cr-accent');
    wrap.innerHTML = `<div class="consume-modes"><div class="cw-title">KNOT SWAP</div><div class="cw-sub">THREE WAYS TO RECOMBINE</div><button data-mode="grid"><strong>GRID</strong><span>SPELL · SHATTER · RECOMBINE</span></button><button data-mode="words"><strong>WORDS</strong><span>MOVE LETTERS FROM YOUR RACK</span></button><button data-mode="numbers"><strong>NUMBERS</strong><span>MOVE DIGITS FROM YOUR RACK</span></button></div>`;
    wrap.querySelector('.consume-modes').addEventListener('click', event => {
      const selected = event.target.closest('[data-mode]');
      if (!selected) return;
      if (typeof SFX !== 'undefined') SFX.menuSelect();
      if (selected.dataset.mode === 'grid') window.initConsumeGrid();
      else window.initConsumeRack(selected.dataset.mode);
    });
  };
})();
