// Knot Swap tabletop modes: directly drag every tile until every group works.
(function() {
  const modes = {
    words: { title: 'WORDS', accent: '#ff75d5', intro: 'Rearrange words or create new words to use all tiles.' },
    numbers: { title: 'RUMMY', accent: '#ffb35c', intro: 'Rearrange every tile into number runs or sets.' },
  };
  const TAGS = ['FROG', 'MINT', 'TACO', 'DUCK', 'MOON', 'STAR', 'WAVE', 'COMET', 'BAGEL', 'SPARK', 'TURBO', 'COSMO'];
  let mode = null, wrap = null, state = null, nextTile = 1;
  const rackWordSet = new Set(typeof CONSUME_RACK_DATA === 'undefined' ? [] : CONSUME_RACK_DATA.wordDictionary);
  function ktTone(freq, delay = 0, duration = 0.08, volume = 0.035, end = freq) {
    try {
      const context = getAudioCtx(), oscillator = context.createOscillator(), gain = context.createGain();
      const start = context.currentTime + Math.max(0.02, delay);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.type = 'triangle'; oscillator.frequency.setValueAtTime(freq, start);
      oscillator.frequency.exponentialRampToValueAtTime(end, start + duration);
      gain.gain.setValueAtTime(volume, start); gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      oscillator.start(start); oscillator.stop(start + duration + 0.02);
    } catch (e) {}
  }
  const KTSFX = {
    pick() { ktTone(520); },
    place() { ktTone(700, 0, 0.07, 0.035); },
    valid() { [523, 659, 784].forEach((frequency, index) => ktTone(frequency, index * 0.055, 0.13, 0.045)); },
    invalid() { ktTone(210, 0, 0.11, 0.025, 170); },
  };

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
  function sync() { try { const data = profile(), high = done(data.profiles[data.active].stars); if (high && typeof RemoteLB !== 'undefined') RemoteLB.submit(cfg().title === 'WORDS' ? 'consume-words' : 'consume-numbers', data.active, high, 0, `L${high}`).catch(() => {}); } catch (e) {} }

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
    setArcadeModeSelect(false);
    nextTile = 1;
    const tile = value => ({ id: nextTile++, value });
    state = { n, moves: 0, drag: null, pointer: null, pickedId: null, groups: data.groups.map((group, id) => ({ id, tiles: group.map(tile) })), rack: data.rack.map(tile), won: false };
    sortRummyGroups();
    renderPlay();
  }

  function rummyRank(tile) { return Number(tile.value.slice(1)); }
  function sortRummyGroups() {
    if (mode !== 'numbers') return;
    state.groups.forEach(group => group.tiles.sort((a, b) => rummyRank(a) - rummyRank(b) || a.value.localeCompare(b.value)));
  }

  function tileLocation(id) {
    for (const group of state.groups) { const index = group.tiles.findIndex(tile => tile.id === id); if (index >= 0) return { type: 'group', group, index, tile: group.tiles[index] }; }
    const index = state.rack.findIndex(tile => tile.id === id);
    return index >= 0 ? { type: 'rack', index, tile: state.rack[index] } : null;
  }

  function tileMarkup(tile, movedId) {
    const suit = mode === 'numbers' ? tile.value[0] : '';
    const mark = { R: '◆', B: '●', G: '▲', Y: '■' }[suit] || '';
    return `<button class="kt-tile ${suit ? `suit-${suit}` : ''}${tile.id === movedId ? ' kt-just-moved' : ''}${tile.id === state?.pickedId ? ' kt-picked' : ''}" data-tile="${tile.id}"><span>${esc(suit ? tile.value.slice(1) : tile.value.toUpperCase())}</span>${mark ? `<i class="kt-suit-mark" aria-hidden="true">${mark}</i>` : ''}</button>`;
  }
  function slotMarkup(type, index, groupId) {
    return `<button class="kt-insert-marker kt-tap-slot" type="button" data-slot-type="${type}" data-slot-index="${index}"${groupId == null ? '' : ` data-slot-group="${groupId}"`} aria-label="Place tile here"></button>`;
  }
  function tilesWithSlots(tiles, type, groupId, movedId) {
    if (!state?.pickedId) return tiles.map(tile => tileMarkup(tile, movedId)).join('');
    return slotMarkup(type, 0, groupId) + tiles.map((tile, index) =>
      tileMarkup(tile, movedId) + slotMarkup(type, index + 1, groupId)
    ).join('');
  }
  function groupMarkup(group, movedId) {
    return `<div class="kt-group ${validGroup(group.tiles) ? 'valid' : 'invalid'}" data-group="${group.id}">${tilesWithSlots(group.tiles, 'group', group.id, movedId)}</div>`;
  }

  function clearDropCue() {
    wrap.querySelectorAll('.kt-ghost-slot, .kt-insert-marker, .kt-new-group-cue').forEach(element => element.remove());
    wrap.querySelectorAll('.drop-target').forEach(element => element.classList.remove('drop-target'));
  }

  function ghostTile(tile) {
    const ghost = document.createElement('i');
    const suit = mode === 'numbers' ? tile.value[0] : '';
    ghost.className = `kt-tile kt-ghost-slot ${suit ? `suit-${suit}` : ''}`;
    ghost.innerHTML = `<span>${esc(suit ? tile.value.slice(1) : tile.value.toUpperCase())}</span>${suit ? `<i class="kt-suit-mark" aria-hidden="true">${{ R: '◆', B: '●', G: '▲', Y: '■' }[suit]}</i>` : ''}`;
    return ghost;
  }

  function insertionMarker() {
    const marker = document.createElement('i');
    marker.className = 'kt-insert-marker';
    return marker;
  }

  function insertionIndex(container, x, y, draggedId) {
    const tiles = [...container.querySelectorAll('[data-tile]')].filter(element => Number(element.dataset.tile) !== draggedId);
    if (!tiles.length) return 0;
    const rows = [];
    tiles.forEach((element, index) => {
      const rect = element.getBoundingClientRect();
      let row = rows.find(candidate => Math.abs(candidate.top - rect.top) <= 4);
      if (!row) { row = { top: rect.top, bottom: rect.bottom, items: [] }; rows.push(row); }
      row.top = Math.min(row.top, rect.top); row.bottom = Math.max(row.bottom, rect.bottom);
      row.items.push({ index, rect });
    });
    rows.sort((a, b) => a.top - b.top);
    const containing = rows.find(row => y >= row.top && y <= row.bottom);
    const row = containing || rows.reduce((nearest, candidate) =>
      Math.abs(y - (candidate.top + candidate.bottom) / 2) < Math.abs(y - (nearest.top + nearest.bottom) / 2) ? candidate : nearest
    );
    if (!containing) return row.items[row.items.length - 1].index + 1;
    for (const item of row.items) {
      if (x < item.rect.left + item.rect.width / 2) return item.index;
    }
    return row.items[row.items.length - 1].index + 1;
  }

  function dropContainerAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    const direct = hit?.closest('[data-group], [data-rack-drop]');
    if (direct) return direct;
    let nearest = null, nearestDistance = 28;
    wrap.querySelectorAll('[data-group], [data-rack-drop]').forEach(container => {
      const rect = container.getBoundingClientRect();
      const dx = Math.max(rect.left - x, 0, x - rect.right);
      const dy = Math.max(rect.top - y, 0, y - rect.bottom);
      const distance = Math.hypot(dx, dy);
      if (distance < nearestDistance) { nearest = container; nearestDistance = distance; }
    });
    return nearest;
  }

  function showDropCue(x, y) {
    clearDropCue();
    const drag = state?.drag; if (!drag) return;
    const hit = document.elementFromPoint(x, y);
    const container = dropContainerAt(x, y);
    const group = container?.matches('[data-group]') ? container : null;
    const rack = container?.matches('[data-rack-drop]') ? container : null;
    const table = hit?.closest('#kt-table');
    if (!container && table) {
      drag.target = { type: 'new-group' };
      table.classList.add('drop-target');
      const cue = document.createElement('i'); cue.className = 'kt-new-group-cue'; cue.appendChild(ghostTile(drag.tile));
      table.appendChild(cue);
      return;
    }
    if (!container) { drag.target = null; return; }
    const target = group ? { type: 'group', groupId: Number(group.dataset.group) } : { type: 'rack' };
    target.index = mode === 'numbers' && group
      ? [...group.querySelectorAll('[data-tile]')].filter(element => Number(element.dataset.tile) !== drag.id)
        .findIndex(element => rummyRank(drag.tile) < rummyRank(tileLocation(Number(element.dataset.tile)).tile))
      : insertionIndex(container, x, y, drag.id);
    if (target.index < 0) target.index = [...container.querySelectorAll('[data-tile]')].filter(element => Number(element.dataset.tile) !== drag.id).length;
    drag.target = target;
    container.classList.add('drop-target');
    // A thin caret shows the insertion point without adding another tile-width
    // to a centered group. The old full-size ghost made the group shift under
    // the pointer and could make neighboring insertion targets oscillate.
    const marker = insertionMarker();
    const remaining = [...container.querySelectorAll('[data-tile]')].filter(element => Number(element.dataset.tile) !== drag.id);
    if (target.index < remaining.length) container.insertBefore(marker, remaining[target.index]); else container.appendChild(marker);
  }

  function beginDrag(event, element, pointer) {
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
      offsetX: pointer.x - rect.left, offsetY: pointer.y - rect.top, target: null };
    element.setPointerCapture?.(event.pointerId);
    KTSFX.pick();
    moveProxy(event.clientX, event.clientY);
    showDropCue(event.clientX, event.clientY);
  }

  function moveProxy(x, y) {
    const drag = state?.drag; if (!drag) return;
    drag.proxy.style.transform = `translate3d(${x - drag.offsetX}px,${y - drag.offsetY}px,0)`;
  }
  function dragMove(event) {
    if (!state) return;
    if (!state.drag && state.pointer?.pointerId === event.pointerId) {
      if (Math.hypot(event.clientX - state.pointer.x, event.clientY - state.pointer.y) < 8) return;
      beginDrag(event, state.pointer.element, state.pointer);
      state.pointer = null;
    }
    if (!state.drag || event.pointerId !== state.drag.pointerId) return;
    event.preventDefault(); moveProxy(event.clientX, event.clientY); showDropCue(event.clientX, event.clientY);
  }

  function finishDrag(event, cancelled = false) {
    if (!state) return;
    if (!state.drag && state.pointer?.pointerId === event.pointerId) {
      const id = Number(state.pointer.element.dataset.tile);
      state.pointer = null;
      if (!cancelled) pickTile(id);
      return;
    }
    const drag = state.drag; if (!drag || event.pointerId !== drag.pointerId) return;
    event.preventDefault();
    const target = cancelled ? null : drag.target;
    const before = groupValidity();
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
        sortRummyGroups();
      }
    }
    state.drag = null;
    setTimeout(() => drag.proxy.remove(), 110);
    update(drag.id);
    if (target) moveFeedback(before);
  }

  function pointerDown(event) {
    const element = event.target.closest('[data-tile]');
    if (!element || !state || state.won || event.button > 0) return;
    state.pointer = { pointerId: event.pointerId, element, x: event.clientX, y: event.clientY };
    element.setPointerCapture?.(event.pointerId);
  }

  function pickTile(id) {
    if (!state || state.won) return;
    state.pickedId = state.pickedId === id ? null : id;
    if (state.pickedId) KTSFX.pick();
    update();
  }

  function groupValidity() {
    return new Map(state.groups.map(group => [group.id, validGroup(group.tiles)]));
  }

  function moveFeedback(before) {
    KTSFX.place();
    const becameValid = state.groups.some(group => !before.get(group.id) && validGroup(group.tiles));
    const becameInvalid = state.groups.some(group => before.get(group.id) && !validGroup(group.tiles));
    if (becameValid) KTSFX.valid();
    else if (becameInvalid) KTSFX.invalid();
  }

  function placePicked(target) {
    if (!state?.pickedId) return;
    const source = tileLocation(state.pickedId);
    if (!source) return;
    const before = groupValidity();
    const sourceList = source.type === 'rack' ? state.rack : source.group.tiles;
    const [tile] = sourceList.splice(source.index, 1);
    if (target.type === 'new-group') {
      state.groups.push({ id: Math.max(-1, ...state.groups.map(group => group.id)) + 1, tiles: [tile] });
    } else {
      const targetList = target.type === 'rack' ? state.rack : state.groups.find(group => group.id === target.groupId)?.tiles;
      if (!targetList) { sourceList.splice(source.index, 0, tile); return; }
      let index = target.index;
      if (sourceList === targetList && source.index < index) index--;
      targetList.splice(Math.max(0, Math.min(index, targetList.length)), 0, tile);
    }
    state.groups = state.groups.filter(group => group.tiles.length);
    state.moves++;
    state.pickedId = null;
    update(tile.id);
    moveFeedback(before);
  }

  function checkWin() { return !state.rack.length && state.groups.length && state.groups.every(group => validGroup(group.tiles)); }
  function win() { if (state.won) return; state.won = true; record(state.n, 1); sync(); if (typeof SFX !== 'undefined') SFX.win(); const next = state.n < levels().length; const overlay = document.createElement('div'); overlay.className = 'kt-win'; overlay.innerHTML = `<strong>PUZZLE SOLVED!</strong><div>${next ? '<button data-next>NEXT</button>' : ''}<button data-replay>REPLAY</button><button data-journey>JOURNEY</button></div>`; wrap.appendChild(overlay); overlay.addEventListener('click', event => { if (event.target.hasAttribute('data-next')) start(state.n + 1); if (event.target.hasAttribute('data-replay')) start(state.n); if (event.target.hasAttribute('data-journey')) journey(); }); }

  function renderPlay() {
    wrap.style.setProperty('--kt', cfg().accent);
    wrap.innerHTML = `<div class="kt-hud"><button data-journey>JOURNEY</button><strong>${cfg().title} · LEVEL ${state.n}</strong><button data-reset>RESET</button></div><div class="kt-table" id="kt-table"></div><button class="kt-check" id="kt-check">CHECK</button><div class="kt-rack" id="kt-rack" data-rack-drop></div>`;
    wrap.querySelector('.kt-hud').addEventListener('click', event => { if (event.target.hasAttribute('data-journey')) journey(); if (event.target.hasAttribute('data-reset')) start(state.n); });
    wrap.onpointerdown = pointerDown;
    wrap.onpointermove = dragMove;
    wrap.onpointerup = finishDrag;
    wrap.onpointercancel = event => finishDrag(event, true);
    wrap.addEventListener('click', event => {
      const slot = event.target.closest('[data-slot-type]');
      if (slot) placePicked({
        type: slot.dataset.slotType,
        groupId: Number(slot.dataset.slotGroup),
        index: Number(slot.dataset.slotIndex),
      });
      else if (event.target.closest('[data-new-group]')) placePicked({ type: 'new-group' });
    });
    wrap.querySelector('#kt-check').addEventListener('click', () => { const table = wrap.querySelector('#kt-table'); if (checkWin()) win(); else { table.classList.remove('bad'); void wrap.offsetWidth; table.classList.add('bad'); if (typeof SFX !== 'undefined') SFX.mismatch(); } });
    update();
  }
  function update(movedId) {
    if (!state || !wrap) return;
    wrap.querySelector('#kt-table').innerHTML = state.groups.map(group => groupMarkup(group, movedId)).join('') +
      (state.pickedId ? `<button class="kt-new-group-cue kt-tap-new-group" type="button" data-new-group>NEW GROUP</button>` : '');
    wrap.querySelector('#kt-rack').innerHTML = `<span>RACK</span>${tilesWithSlots(state.rack, 'rack', null, movedId)}`;
  }

  function showHowToPlay() {
    const words = mode === 'words';
    const overlay = document.createElement('div');
    overlay.className = 'kt-help';
    overlay.innerHTML = words
      ? `<section role="dialog" aria-modal="true" aria-label="How to play WORDS"><button class="kt-help-close" data-close aria-label="Close">×</button><h2>HOW TO PLAY</h2><p>Tap a tile, then tap a glowing slot to place it. You can also drag tiles.</p><p>Use every tile. Each group must spell a real word with at least <strong>3 LETTERS</strong>.</p><p>Tap <strong>CHECK</strong> when the rack is empty.</p></section>`
      : `<section role="dialog" aria-modal="true" aria-label="How to play RUMMY"><button class="kt-help-close" data-close aria-label="Close">×</button><h2>HOW TO PLAY</h2><p>Tap a tile, then tap a glowing slot to place it. You can also drag tiles.</p><dl><div><dt>RUN / STRAIGHT</dt><dd>3 or more consecutive numbers in the <strong>same color</strong>.</dd></div><div><dt>SET</dt><dd>3 or more matching numbers, with <strong>one tile of each color</strong>.</dd></div></dl><p>Use every tile, then tap <strong>CHECK</strong>.</p></section>`;
    overlay.addEventListener('click', event => { if (event.target === overlay || event.target.hasAttribute('data-close')) overlay.remove(); });
    wrap.appendChild(overlay);
  }

  function journey() {
    setArcadeModeSelect(true);
    state = null;
    const data = profile(), stars = data.profiles[data.active].stars, unlocked = done(stars) + 1;
    wrap.style.setProperty('--kt', cfg().accent);
    wrap.innerHTML = `<div class="kt-journey"><div class="kt-journey-actions"><button data-modes>MODES</button><button data-help>HOW TO PLAY</button></div><h1>${cfg().title}</h1><p>${cfg().intro}</p><h2>LEVELS</h2><div class="kt-levels">${levels().map(level => { const locked = level.n > unlocked; return `<button class="${locked ? 'locked' : ''}" data-level="${level.n}">${level.n}</button>`; }).join('')}</div><section class="kt-codebox player-login-switch" role="button" tabindex="0" onclick="openPlayerSignIn()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPlayerSignIn()}" aria-label="Change arcade login"><div class="kt-code-row"><span>LOGGED IN AS</span><strong>${esc(data.active)}</strong></div></section></div>`;
    wrap.querySelector('[data-modes]').addEventListener('click', () => window.renderConsumeModes());
    wrap.querySelector('[data-help]').addEventListener('click', showHowToPlay);
    wrap.querySelector('.kt-levels').addEventListener('click', event => { const button = event.target.closest('[data-level]'); if (button && !button.classList.contains('locked')) start(Number(button.dataset.level)); });
  }
  window.initConsumeRack = next => { mode = next; wrap = document.getElementById('consume-wrap'); journey(); };
  window.consumeRackBack = () => { state = null; mode = null; };
  window.renderConsumeModes = () => { wrap = document.getElementById('consume-wrap'); if (!wrap) return; setArcadeModeSelect(true); wrap.innerHTML = `<div class="consume-modes"><div class="cw-title">TILE SWAP</div><div class="cw-intro">Choose a way to untangle the tiles.</div><button data-mode="grid"><strong>GRID</strong><span>Build real words from a shared tile grid.</span></button><button data-mode="words"><strong>WORDS</strong><span>Rearrange every tile into valid words.</span></button><button data-mode="numbers"><strong>RUMMY</strong><span>Rearrange every tile into runs and sets.</span></button></div>`; wrap.querySelector('.consume-modes').addEventListener('click', event => { const button = event.target.closest('[data-mode]'); if (!button) return; if (button.dataset.mode === 'grid') window.initConsumeGrid(); else window.initConsumeRack(button.dataset.mode); }); };
})();
