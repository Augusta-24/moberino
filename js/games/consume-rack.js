// Knot Swap tabletop modes: directly drag every tile until every group works.
(function() {
  const modes = {
    words: { title: 'WORDS', accent: '#ff75d5', intro: 'Rearrange every tile into valid words.' },
    numbers: { title: 'RUMMY', accent: '#ffb35c', intro: 'Rearrange every tile into number runs or sets.' },
  };
  const TAGS = ['FROG', 'MINT', 'TACO', 'DUCK', 'MOON', 'STAR', 'WAVE', 'COMET', 'BAGEL', 'SPARK', 'TURBO', 'COSMO'];
  let mode = null, wrap = null, state = null, nextTile = 1;
  const rackWordSet = new Set(typeof CONSUME_RACK_DATA === 'undefined' ? [] : CONSUME_RACK_DATA.wordDictionary);

  const cfg = () => modes[mode];
  const levels = () => (typeof CONSUME_RACK_DATA === 'undefined' ? [] : CONSUME_RACK_DATA[mode].levels);
  const key = () => `moberino-knot-swap-${mode}-v2`;
  const esc = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function load() { try { return JSON.parse(localStorage.getItem(key()) || '{}'); } catch (e) { return {}; } }
  function save(data) { try { localStorage.setItem(key(), JSON.stringify(data)); } catch (e) {} }
  function makeTag(profiles) { for (let i = 0; i < 100; i++) { const tag = TAGS[Math.floor(Math.random() * TAGS.length)] + (2 + Math.floor(Math.random() * 8)); if (!profiles[tag]) return tag; } return `KNOT${Math.floor(Math.random() * 90 + 10)}`; }
  function profile() {
    const data = load(); data.profiles ||= {};
    // Retroactively adopt the shared cross-game code if it differs — old
    // progress under the previous tag stays put, just no longer active.
    const shared = typeof window.PlayerID !== 'undefined' ? window.PlayerID.get() : null;
    if (shared && shared !== data.active) { data.profiles[shared] ||= { stars: {} }; data.active = shared; save(data); }
    else if (!data.active || !data.profiles[data.active]) { data.active = makeTag(data.profiles); data.profiles[data.active] = { stars: {} }; save(data); }
    if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(data.active);
    return data;
  }
  function setTag(raw) {
    const tag = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (tag.length < 2) return { ok: false, msg: '2-12 LETTERS/NUMBERS' };
    const data = profile();
    if (tag !== data.active) {
      const cur = (data.profiles[data.active] && data.profiles[data.active].stars) || {};
      data.profiles[tag] ||= { stars: {} };
      const dest = data.profiles[tag].stars;
      for (const k in cur) if ((cur[k] || 0) > (dest[k] || 0)) dest[k] = cur[k];
      data.active = tag; save(data);
      if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(tag);
    }
    return { ok: true };
  }
  function done(stars) { return Math.max(0, ...Object.keys(stars || profile().profiles[profile().active].stars).map(Number)); }
  function total(stars) { return Object.values(stars || profile().profiles[profile().active].stars).reduce((sum, n) => sum + n, 0); }
  function record(n, value) { const data = profile(), stars = data.profiles[data.active].stars; stars[n] = Math.max(stars[n] || 0, value); save(data); }
  function sync() { try { const data = profile(), high = done(data.profiles[data.active].stars); if (high && typeof RemoteLB !== 'undefined') RemoteLB.submit(cfg().title === 'WORDS' ? 'consume-words' : 'consume-numbers', data.active, high, 0, `★${total(data.profiles[data.active].stars)} · L${high}`).catch(() => {}); } catch (e) {} }

  function validGroup(group) {
    if (group.length < 3) return false;
    if (mode === 'words') return rackWordSet.has(group.map(tile => tile.value).join('').toLowerCase());
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
    state = { n, moves: 0, drag: null, groups: data.groups.map((group, id) => ({ id, tiles: group.map(tile) })), rack: data.rack.map(tile), won: false };
    renderPlay();
  }

  function tileLocation(id) {
    for (const group of state.groups) { const index = group.tiles.findIndex(tile => tile.id === id); if (index >= 0) return { type: 'group', group, index, tile: group.tiles[index] }; }
    const index = state.rack.findIndex(tile => tile.id === id);
    return index >= 0 ? { type: 'rack', index, tile: state.rack[index] } : null;
  }

  function tileMarkup(tile) {
    return `<button class="kt-tile ${mode === 'numbers' ? `suit-${tile.value[0]}` : ''}" data-tile="${tile.id}">${esc(mode === 'numbers' ? tile.value.slice(1) : tile.value.toUpperCase())}</button>`;
  }
  function groupMarkup(group) {
    return `<div class="kt-group ${validGroup(group.tiles) ? 'valid' : 'invalid'}" data-group="${group.id}">${group.tiles.map(tileMarkup).join('')}</div>`;
  }

  function clearDropCue() {
    wrap.querySelectorAll('.kt-ghost-slot, .kt-new-group-cue').forEach(element => element.remove());
    wrap.querySelectorAll('.drop-target').forEach(element => element.classList.remove('drop-target'));
  }

  function ghostTile(tile) {
    const ghost = document.createElement('i');
    ghost.className = `kt-tile kt-ghost-slot ${mode === 'numbers' ? `suit-${tile.value[0]}` : ''}`;
    ghost.textContent = mode === 'numbers' ? tile.value.slice(1) : tile.value.toUpperCase();
    return ghost;
  }

  function insertionIndex(container, x, y, draggedId) {
    const tiles = [...container.querySelectorAll('[data-tile]')].filter(element => Number(element.dataset.tile) !== draggedId);
    for (let index = 0; index < tiles.length; index++) {
      const rect = tiles[index].getBoundingClientRect();
      if (y < rect.top + rect.height / 2 || (y <= rect.bottom && x < rect.left + rect.width / 2)) return index;
    }
    return tiles.length;
  }

  function showDropCue(x, y) {
    clearDropCue();
    const drag = state?.drag; if (!drag) return;
    const hit = document.elementFromPoint(x, y);
    const group = hit?.closest('[data-group]');
    const rack = hit?.closest('[data-rack-drop]');
    const table = hit?.closest('#kt-table');
    const container = group || rack;
    if (!container && table) {
      drag.target = { type: 'new-group' };
      table.classList.add('drop-target');
      const cue = document.createElement('i'); cue.className = 'kt-new-group-cue'; cue.appendChild(ghostTile(drag.tile));
      table.appendChild(cue);
      return;
    }
    if (!container) { drag.target = null; return; }
    const target = group ? { type: 'group', groupId: Number(group.dataset.group) } : { type: 'rack' };
    target.index = insertionIndex(container, x, y, drag.id);
    drag.target = target;
    container.classList.add('drop-target');
    const marker = ghostTile(drag.tile);
    const remaining = [...container.querySelectorAll('[data-tile]')].filter(element => Number(element.dataset.tile) !== drag.id);
    if (target.index < remaining.length) container.insertBefore(marker, remaining[target.index]); else container.appendChild(marker);
  }

  function beginDrag(event) {
    const element = event.target.closest('[data-tile]');
    if (!element || !state || state.won || event.button > 0) return;
    const source = tileLocation(Number(element.dataset.tile)); if (!source) return;
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    const proxy = element.cloneNode(true);
    proxy.classList.add('kt-drag-proxy');
    proxy.style.width = `${rect.width}px`; proxy.style.height = `${rect.height}px`;
    document.body.appendChild(proxy);
    element.classList.add('kt-drag-origin');
    state.drag = { id: source.tile.id, tile: source.tile, sourceType: source.type, sourceGroupId: source.group?.id,
      sourceIndex: source.index, element, proxy, pointerId: event.pointerId,
      offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, target: null };
    element.setPointerCapture?.(event.pointerId);
    moveProxy(event.clientX, event.clientY);
    showDropCue(event.clientX, event.clientY);
  }

  function moveProxy(x, y) {
    const drag = state?.drag; if (!drag) return;
    drag.proxy.style.transform = `translate3d(${x - drag.offsetX}px,${y - drag.offsetY}px,0)`;
  }
  function dragMove(event) {
    if (!state?.drag || event.pointerId !== state.drag.pointerId) return;
    event.preventDefault(); moveProxy(event.clientX, event.clientY); showDropCue(event.clientX, event.clientY);
  }

  function finishDrag(event, cancelled = false) {
    const drag = state?.drag; if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const target = cancelled ? null : drag.target;
    clearDropCue(); drag.proxy.classList.add('dropping'); drag.proxy.style.opacity = '0';
    drag.element.classList.remove('kt-drag-origin');
    if (target) {
      const source = tileLocation(drag.id);
      if (source) {
        const sourceList = source.type === 'rack' ? state.rack : source.group.tiles;
        const [tile] = sourceList.splice(source.index, 1);
        if (target.type === 'new-group') {
          state.groups.push({ id: Math.max(-1, ...state.groups.map(group => group.id)) + 1, tiles: [tile] });
          state.moves++;
        } else {
          const targetList = target.type === 'rack' ? state.rack : state.groups.find(group => group.id === target.groupId)?.tiles;
          if (targetList) {
            const index = target.index;
            targetList.splice(Math.max(0, Math.min(index, targetList.length)), 0, tile);
            if (sourceList !== targetList || source.index !== index) state.moves++;
          } else sourceList.splice(source.index, 0, tile);
        }
        state.groups = state.groups.filter(group => group.tiles.length);
      }
    }
    state.drag = null;
    setTimeout(() => drag.proxy.remove(), 110);
    update();
  }

  function checkWin() { return !state.rack.length && state.groups.length && state.groups.every(group => validGroup(group.tiles)); }
  function win() { if (state.won) return; state.won = true; const stars = state.moves <= Math.max(2, state.n + 1) ? 3 : state.moves <= state.n + 4 ? 2 : 1; record(state.n, stars); sync(); if (typeof SFX !== 'undefined') SFX.win(); const next = state.n < levels().length; const overlay = document.createElement('div'); overlay.className = 'kt-win'; overlay.innerHTML = `<strong>COMPLETE</strong><span>${'★'.repeat(stars)}<i>${'★'.repeat(3 - stars)}</i></span><div>${next ? '<button data-next>NEXT</button>' : ''}<button data-replay>REPLAY</button><button data-journey>JOURNEY</button></div>`; wrap.appendChild(overlay); overlay.addEventListener('click', event => { if (event.target.hasAttribute('data-next')) start(state.n + 1); if (event.target.hasAttribute('data-replay')) start(state.n); if (event.target.hasAttribute('data-journey')) journey(); }); }

  function renderPlay() {
    wrap.style.setProperty('--kt', cfg().accent);
    wrap.innerHTML = `<div class="kt-hud"><button data-journey>JOURNEY</button><strong>${cfg().title} · LEVEL ${state.n}</strong><button data-reset>RESET</button></div><div class="kt-table" id="kt-table"></div><button class="kt-check" id="kt-check">CHECK</button><div class="kt-rack" id="kt-rack" data-rack-drop></div>`;
    wrap.querySelector('.kt-hud').addEventListener('click', event => { if (event.target.hasAttribute('data-journey')) journey(); if (event.target.hasAttribute('data-reset')) start(state.n); });
    wrap.onpointerdown = beginDrag;
    wrap.onpointermove = dragMove;
    wrap.onpointerup = finishDrag;
    wrap.onpointercancel = event => finishDrag(event, true);
    wrap.querySelector('#kt-check').addEventListener('click', () => { const table = wrap.querySelector('#kt-table'); if (checkWin()) win(); else { table.classList.remove('bad'); void wrap.offsetWidth; table.classList.add('bad'); if (typeof SFX !== 'undefined') SFX.mismatch(); } });
    update();
  }
  function update() {
    if (!state || !wrap) return;
    wrap.querySelector('#kt-table').innerHTML = state.groups.map(groupMarkup).join('');
    wrap.querySelector('#kt-rack').innerHTML = `<span>RACK</span>${state.rack.map(tileMarkup).join('')}`;
  }

  function journey() {
    state = null;
    const data = profile(), stars = data.profiles[data.active].stars, unlocked = done(stars) + 1;
    wrap.style.setProperty('--kt', cfg().accent);
    wrap.innerHTML = `<div class="kt-journey"><button data-modes>MODES</button><h1>${cfg().title}</h1><p>${cfg().intro}</p><h2>LEVELS</h2><div class="kt-levels">${levels().map(level => { const value = stars[level.n] || 0, locked = level.n > unlocked; return `<button class="${locked ? 'locked' : ''}" data-level="${level.n}">${level.n}${value ? `<i>${'★'.repeat(value)}</i>` : ''}</button>`; }).join('')}</div><section class="kt-codebox"><div class="kt-code-row"><span>YOUR CODE</span><strong>${esc(data.active)}</strong><span class="kt-code-actions"><em>★ ${total(stars)}</em><button data-change>CHANGE</button></span></div><div class="kt-code-row kt-code-enter" id="kt-rename-row" hidden><span>NEW CODE</span><input id="kt-new-code" maxlength="12" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="TACOCAT7"><button id="kt-rename-go">SET</button></div><div class="kt-code-divider"></div><div class="kt-code-row kt-code-enter"><span>PLAYED ELSEWHERE?</span><input id="kt-code" maxlength="12" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="FROG4"><button id="kt-enter">ENTER</button></div><small>CODES ARE PUBLIC — USE A FUN PHRASE, NEVER A REAL PASSWORD OR PIN.</small></section></div>`;
    wrap.querySelector('[data-modes]').addEventListener('click', () => window.renderConsumeModes());
    wrap.querySelector('.kt-levels').addEventListener('click', event => { const button = event.target.closest('[data-level]'); if (button && !button.classList.contains('locked')) start(Number(button.dataset.level)); });
    wrap.querySelector('[data-change]').addEventListener('click', () => { const row = wrap.querySelector('#kt-rename-row'); row.hidden = !row.hidden; if (!row.hidden) wrap.querySelector('#kt-new-code').focus(); });
    wrap.querySelector('#kt-rename-go').addEventListener('click', () => { const res = setTag(wrap.querySelector('#kt-new-code').value); if (res.ok) journey(); });
    wrap.querySelector('#kt-new-code').addEventListener('keydown', event => { if (event.key === 'Enter') wrap.querySelector('#kt-rename-go').click(); });
    wrap.querySelector('#kt-enter').addEventListener('click', () => { const code = wrap.querySelector('#kt-code').value.trim().toUpperCase(); if (!code || typeof RemoteLB === 'undefined') return; RemoteLB.lookup(mode === 'words' ? 'consume-words' : 'consume-numbers', code).then(row => { if (!row) return; const store = profile(); store.profiles[code] ||= { stars: {} }; for (let n = 1; n <= row.score; n++) store.profiles[code].stars[n] ||= 1; store.active = code; save(store); if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(code); journey(); }); });
  }
  window.initConsumeRack = next => { mode = next; wrap = document.getElementById('consume-wrap'); journey(); };
  window.consumeRackBack = () => { state = null; mode = null; };
  window.renderConsumeModes = () => { wrap = document.getElementById('consume-wrap'); if (!wrap) return; wrap.innerHTML = `<div class="consume-modes"><div class="cw-title">TILE SWAP</div><div class="cw-intro">Choose a way to untangle the tiles.</div><button data-mode="grid"><strong>GRID</strong><span>Build real words from a shared tile grid.</span></button><button data-mode="words"><strong>WORDS</strong><span>Rearrange every tile into valid words.</span></button><button data-mode="numbers"><strong>RUMMY</strong><span>Rearrange every tile into runs and sets.</span></button></div>`; wrap.querySelector('.consume-modes').addEventListener('click', event => { const button = event.target.closest('[data-mode]'); if (!button) return; if (button.dataset.mode === 'grid') window.initConsumeGrid(); else window.initConsumeRack(button.dataset.mode); }); };
})();
