// Knot Swap tabletop modes: rebuild groups until every tile belongs.
(function() {
  const modes = {
    words: { title: 'WORDS', accent: '#ff75d5', intro: 'Rearrange every tile into real words.' },
    numbers: { title: 'RUNS', accent: '#ffb35c', intro: 'Rearrange every tile into number runs or sets.' },
  };
  const TAGS = ['FROG', 'MINT', 'TACO', 'DUCK', 'MOON', 'STAR', 'WAVE', 'COMET', 'BAGEL', 'SPARK', 'TURBO', 'COSMO'];
  let mode = null, wrap = null, state = null, nextTile = 1;

  const cfg = () => modes[mode];
  const levels = () => (typeof CONSUME_RACK_DATA === 'undefined' ? [] : CONSUME_RACK_DATA[mode].levels);
  const key = () => `moberino-knot-swap-${mode}-v2`;
  const esc = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function load() { try { return JSON.parse(localStorage.getItem(key()) || '{}'); } catch (e) { return {}; } }
  function save(data) { try { localStorage.setItem(key(), JSON.stringify(data)); } catch (e) {} }
  function makeTag(profiles) { for (let i = 0; i < 100; i++) { const tag = TAGS[Math.floor(Math.random() * TAGS.length)] + (2 + Math.floor(Math.random() * 8)); if (!profiles[tag]) return tag; } return `KNOT${Math.floor(Math.random() * 90 + 10)}`; }
  function profile() { const data = load(); data.profiles ||= {}; if (!data.active || !data.profiles[data.active]) { data.active = makeTag(data.profiles); data.profiles[data.active] = { stars: {} }; save(data); } return data; }
  function done(stars) { return Math.max(0, ...Object.keys(stars || profile().profiles[profile().active].stars).map(Number)); }
  function total(stars) { return Object.values(stars || profile().profiles[profile().active].stars).reduce((sum, n) => sum + n, 0); }
  function record(n, value) { const data = profile(), stars = data.profiles[data.active].stars; stars[n] = Math.max(stars[n] || 0, value); save(data); }
  function sync() { try { const data = profile(), high = done(data.profiles[data.active].stars); if (high && typeof RemoteLB !== 'undefined') RemoteLB.submit(cfg().title === 'WORDS' ? 'consume-words' : 'consume-numbers', data.active, high, 0, `★${total(data.profiles[data.active].stars)} · L${high}`).catch(() => {}); } catch (e) {} }
  function validGroup(group) {
    if (group.length < 3) return false;
    if (mode === 'words') return typeof CONSUME_DICT !== 'undefined' && CONSUME_DICT.has(group.map(tile => tile.value).join('').toLowerCase());
    const parsed = group.map(tile => ({ suit: tile.value[0], rank: Number(tile.value.slice(1)) }));
    const sameSuit = parsed.every(tile => tile.suit === parsed[0].suit);
    const ranks = parsed.map(tile => tile.rank).sort((a, b) => a - b);
    const run = sameSuit && ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1);
    const set = parsed.every(tile => tile.rank === parsed[0].rank) && new Set(parsed.map(tile => tile.suit)).size === parsed.length;
    return run || set;
  }
  function start(n) {
    const data = levels()[n - 1]; if (!data) return;
    nextTile = 1;
    const tile = value => ({ id: nextTile++, value });
    state = { n, moves: 0, held: null, groups: data.groups.map((group, id) => ({ id, tiles: group.map(tile) })), rack: data.rack.map(tile), won: false };
    renderPlay();
  }
  function pick(tile, source, groupId) {
    if (state.held) return;
    state.held = tile;
    if (source === 'rack') state.rack = state.rack.filter(item => item !== tile);
    else { const group = state.groups.find(item => item.id === groupId); group.tiles = group.tiles.filter(item => item !== tile); }
    cleanGroups(); update();
  }
  function placeGroup(groupId) { if (!state.held) return; const group = state.groups.find(item => item.id === groupId); group.tiles.push(state.held); state.held = null; state.moves++; checkWin(); update(); }
  function placeRack() { if (!state.held) return; state.rack.push(state.held); state.held = null; update(); }
  function newGroup() { if (!state.held) return; state.groups.push({ id: Math.max(-1, ...state.groups.map(group => group.id)) + 1, tiles: [state.held] }); state.held = null; state.moves++; update(); }
  function cleanGroups() { state.groups = state.groups.filter(group => group.tiles.length); }
  function checkWin() { cleanGroups(); if (!state.held && !state.rack.length && state.groups.length && state.groups.every(group => validGroup(group.tiles))) win(); }
  function win() { if (state.won) return; state.won = true; const stars = state.moves <= Math.max(2, state.n + 1) ? 3 : state.moves <= state.n + 4 ? 2 : 1; record(state.n, stars); sync(); if (typeof SFX !== 'undefined') SFX.win(); const next = state.n < levels().length; const overlay = document.createElement('div'); overlay.className = 'kt-win'; overlay.innerHTML = `<strong>COMPLETE</strong><span>${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></span><div>${next ? '<button data-next>NEXT</button>' : ''}<button data-replay>REPLAY</button><button data-journey>JOURNEY</button></div>`; wrap.appendChild(overlay); overlay.addEventListener('click', event => { if (event.target.dataset.next) start(state.n + 1); if (event.target.dataset.replay) start(state.n); if (event.target.dataset.journey) journey(); }); }
  function groupMarkup(group) { const valid = validGroup(group.tiles); return `<div class="kt-group ${valid ? 'valid' : ''}" data-group="${group.id}">${group.tiles.map(tile => `<button class="kt-tile ${mode === 'numbers' ? `suit-${tile.value[0]}` : ''}" data-tile="${tile.id}">${esc(mode === 'numbers' ? tile.value.slice(1) : tile.value.toUpperCase())}</button>`).join('')}</div>`; }
  function renderPlay() { wrap.style.setProperty('--kt', cfg().accent); wrap.innerHTML = `<div class="kt-hud"><button data-journey>JOURNEY</button><strong>${cfg().title} · LEVEL ${state.n}</strong><button data-reset>RESET</button></div><div class="kt-table" id="kt-table"></div><div class="kt-held" id="kt-held"></div><div class="kt-actions"><button id="kt-new">NEW GROUP</button></div><div class="kt-rack" id="kt-rack"></div>`; wrap.querySelector('.kt-hud').addEventListener('click', event => { if (event.target.dataset.journey) journey(); if (event.target.dataset.reset) start(state.n); }); wrap.querySelector('#kt-table').addEventListener('click', event => { const tile = event.target.closest('[data-tile]'), group = event.target.closest('[data-group]'); if (tile && !state.held) { const parent = state.groups.find(item => item.tiles.some(item => item.id === Number(tile.dataset.tile))); pick(parent.tiles.find(item => item.id === Number(tile.dataset.tile)), 'group', parent.id); } else if (group) placeGroup(Number(group.dataset.group)); }); wrap.querySelector('#kt-rack').addEventListener('click', event => { const tile = event.target.closest('[data-rack-tile]'); if (tile && !state.held) pick(state.rack.find(item => item.id === Number(tile.dataset.rackTile)), 'rack'); else if (!tile) placeRack(); }); wrap.querySelector('#kt-new').addEventListener('click', newGroup); update(); }
  function update() { if (!state || !wrap) return; const table = wrap.querySelector('#kt-table'), rack = wrap.querySelector('#kt-rack'), held = wrap.querySelector('#kt-held'); table.innerHTML = state.groups.map(groupMarkup).join(''); rack.innerHTML = state.rack.map(tile => `<button class="kt-tile ${mode === 'numbers' ? `suit-${tile.value[0]}` : ''}" data-rack-tile="${tile.id}">${esc(mode === 'numbers' ? tile.value.slice(1) : tile.value.toUpperCase())}</button>`).join(''); held.innerHTML = state.held ? `<span>HELD</span><button class="kt-tile ${mode === 'numbers' ? `suit-${state.held.value[0]}` : ''}">${esc(mode === 'numbers' ? state.held.value.slice(1) : state.held.value.toUpperCase())}</button>` : ''; }
  function journey() {
    state = null;
    const data = profile(), stars = data.profiles[data.active].stars, unlocked = done(stars) + 1;
    wrap.style.setProperty('--kt', cfg().accent);
    wrap.innerHTML = `<div class="kt-journey">
      <button data-modes>MODES</button>
      <h1>KNOT SWAP</h1>
      <p>${cfg().intro} Start with working groups, then use the rack tiles to make every group valid.</p>
      <h2>LEVELS</h2>
      <div class="kt-levels">${levels().map(level => { const value = stars[level.n] || 0, locked = level.n > unlocked; return `<button class="${locked ? 'locked' : ''}" data-level="${level.n}">${level.n}${value ? `<i>${'★'.repeat(value)}</i>` : ''}</button>`; }).join('')}</div>
      <section class="kt-codebox">
        <div class="kt-code-row"><span>YOUR CODE</span><strong>${esc(data.active)}</strong><em>★ ${total(stars)}</em></div>
        <div class="kt-code-divider"></div>
        <div class="kt-code-row kt-code-enter"><span>PLAYED ELSEWHERE?</span><input id="kt-code" maxlength="12" placeholder="FROG4"><button id="kt-enter">ENTER</button></div>
        <small>CODES ARE PUBLIC — USE A FUN PHRASE, NEVER A REAL PASSWORD OR PIN.</small>
      </section>
    </div>`;
    wrap.querySelector('[data-modes]').addEventListener('click', () => window.renderConsumeModes());
    wrap.querySelector('.kt-levels').addEventListener('click', event => { const button = event.target.closest('[data-level]'); if (button && !button.classList.contains('locked')) start(Number(button.dataset.level)); });
    wrap.querySelector('#kt-enter').addEventListener('click', () => {
      const code = wrap.querySelector('#kt-code').value.trim().toUpperCase();
      if (!code || typeof RemoteLB === 'undefined') return;
      RemoteLB.lookup(mode === 'words' ? 'consume-words' : 'consume-numbers', code).then(row => {
        if (!row) return;
        const store = profile(); store.profiles[code] ||= { stars: {} };
        for (let n = 1; n <= row.score; n++) store.profiles[code].stars[n] ||= 1;
        store.active = code; save(store); journey();
      });
    });
  }
  window.initConsumeRack = next => { mode = next; wrap = document.getElementById('consume-wrap'); journey(); };
  window.consumeRackBack = () => { state = null; mode = null; };
  window.renderConsumeModes = () => { wrap = document.getElementById('consume-wrap'); if (!wrap) return; wrap.innerHTML = `<div class="consume-modes"><div class="cw-title">KNOT SWAP</div><div class="cw-intro">Choose a way to untangle the tiles.</div><button data-mode="grid"><strong>GRID</strong><span>Build real words from a shared tile grid.</span></button><button data-mode="words"><strong>WORDS</strong><span>Rearrange tabletop tiles into real words.</span></button><button data-mode="numbers"><strong>RUNS</strong><span>Rearrange tabletop tiles into runs and sets.</span></button></div>`; wrap.querySelector('.consume-modes').addEventListener('click', event => { const button = event.target.closest('[data-mode]'); if (!button) return; if (button.dataset.mode === 'grid') window.initConsumeGrid(); else window.initConsumeRack(button.dataset.mode); }); };
})();
