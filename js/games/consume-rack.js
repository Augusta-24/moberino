// Knot Swap tabletop modes: directly drag every tile until every group works.
(function() {
  const modes = {
    words: { title: 'WORDS', accent: '#ff75d5', intro: 'Rearrange words or create new words to use all tiles.' },
    numbers: { title: 'RUMMY', accent: '#ffb35c', intro: 'Rearrange every tile into number runs or sets.' },
  };
  const TAGS = ['FROG', 'MINT', 'TACO', 'DUCK', 'MOON', 'STAR', 'WAVE', 'COMET', 'BAGEL', 'SPARK', 'TURBO', 'COSMO'];
  const CONSUME_THEMES = ['space', 'jungle', 'ice', 'ocean', 'magic'];
  let mode = null, wrap = null, state = null, nextTile = 1;
  const rackWordSet = new Set(typeof CONSUME_RACK_DATA === 'undefined' ? [] : CONSUME_RACK_DATA.wordDictionary);
  const rackBlockedSet = new Set(typeof CONSUME_RACK_DATA === 'undefined' ? [] : (CONSUME_RACK_DATA.blockedWords || []));
  const groupWord = tiles => tiles.map(tile => tile.value).join('').toLowerCase();
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
  const levels = () => (typeof CONSUME_RACK_DATA === 'undefined' ? [] : CONSUME_RACK_DATA[mode].levels);
  // v3: board identities changed wholesale when the level packs were rebuilt
  // against a corrected dictionary, so old per-level completion marks would
  // point at puzzles that no longer exist under those numbers.
  const key = () => `moberino-knot-swap-${mode}-v3`;
  const esc = text => String(text).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function load() { try { return JSON.parse(localStorage.getItem(key()) || '{}'); } catch (e) { return {}; } }
  function save(data) { try { localStorage.setItem(key(), JSON.stringify(data)); } catch (e) {} }
  function makeTag(profiles) { for (let i = 0; i < 100; i++) { const tag = TAGS[Math.floor(Math.random() * TAGS.length)] + (2 + Math.floor(Math.random() * 8)); if (!profiles[tag]) return tag; } return `KNOT${Math.floor(Math.random() * 90 + 10)}`; }
  function migrateProgress(player) {
    if (!player) return { completed: {}, served: [] };
    if (player.stars) {
      player.completed ||= {};
      Object.keys(player.stars).forEach(level => { if (player.stars[level]) player.completed[level] = true; });
      delete player.stars;
    }
    player.completed ||= {};
    player.served = Array.isArray(player.served) ? player.served.map(Number).filter(Number.isFinite) : [];
    player.lastServed = Number(player.lastServed) || 0;
    return player;
  }
  function profile() {
    const data = load(); data.profiles ||= {};
    // Retroactively adopt the shared cross-game code if it differs — old
    // progress under the previous tag stays put, just no longer active.
    const shared = typeof window.PlayerID !== 'undefined' ? window.PlayerID.get() : null;
    Object.keys(data.profiles).forEach(tag => migrateProgress(data.profiles[tag]));
    if (shared && shared !== data.active) { data.profiles[shared] = migrateProgress(data.profiles[shared]); data.active = shared; save(data); }
    else if (!data.active || !data.profiles[data.active]) { data.active = makeTag(data.profiles); data.profiles[data.active] = { completed: {}, served: [] }; save(data); }
    if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(data.active);
    return data;
  }
  function setTag(raw) {
    const tag = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (tag.length < 2) return { ok: false, msg: '2-12 LETTERS/NUMBERS' };
    const data = profile();
    if (tag !== data.active) {
      const cur = migrateProgress(data.profiles[data.active]).completed;
      const dest = (data.profiles[tag] = migrateProgress(data.profiles[tag])).completed;
      for (const k in cur) if (cur[k]) dest[k] = true;
      data.active = tag; save(data);
      if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(tag);
    }
    return { ok: true };
  }
  function done(completed) { return Math.max(0, ...Object.keys(completed || migrateProgress(profile().profiles[profile().active]).completed).map(Number)); }
  function record(n) { const data = profile(); migrateProgress(data.profiles[data.active]).completed[n] = true; save(data); }
  // Boards ship sorted easiest to hardest, so the lowest uncompleted one walks
  // the player up the curve rather than bouncing around it.
  function nextLevelInOrder() {
    const player = migrateProgress(profile().profiles[profile().active]);
    const next = levels().find(level => !player.completed[level.n]);
    return next ? next.n : null;
  }
  function randomLevel() {
    const data = profile(), player = migrateProgress(data.profiles[data.active]);
    let pool = levels().filter(level => level.n !== player.lastServed);
    if (!pool.length) pool = levels().slice();
    const selected = pool[Math.floor(Math.random() * pool.length)];
    player.lastServed = selected.n;
    save(data);
    return selected.n;
  }
  function clearedCount() {
    const player = migrateProgress(profile().profiles[profile().active]);
    return levels().filter(level => player.completed[level.n]).length;
  }
  function serveUnseenPuzzle() {
    if (!levels().length) return;
    const next = nextLevelInOrder();
    if (next === null) renderAllCleared();
    else start(next);
  }
  function renderAllCleared() {
    const total = levels().length;
    wrap.innerHTML = buildArcadeResultCard({
      uid: `tile-swap-${mode}`,
      boardKey: `consume-${mode}`,
      artGame: 'consume',
      color: cfg().accent,
      marquee: 'ALL BOARDS CLEARED',
      scoreLabel: 'BOARDS',
      scoreValue: `${total}/${total}`,
      scoreExtra: `YOU HAVE SOLVED EVERY ${cfg().title} PUZZLE`,
      canSave: false,
      showBoard: false,
      showSaveArea: false,
      buttons: `
        <button class="kt-result-btn arcade-result-primary" data-random>PLAY A RANDOM BOARD</button>
        <button class="kt-result-btn arcade-result-secondary" data-modes>TILE SWAP MENU</button>
      `,
    });
    mountSelectionArt(`tile-swap-${mode}-art`, 'consume');
    wrap.onclick = event => {
      if (event.target.hasAttribute('data-random')) start(randomLevel());
      else if (event.target.hasAttribute('data-modes')) window.renderConsumeModes();
    };
  }
  function sync() { try { const data = profile(), high = done(migrateProgress(data.profiles[data.active]).completed); if (high && typeof RemoteLB !== 'undefined') RemoteLB.submit(cfg().title === 'WORDS' ? 'consume-words' : 'consume-numbers', data.active, high, 0, `L${high}`).catch(() => {}); } catch (e) {} }

  function validGroup(group) {
    if (group.length < 3) return false;
    if (mode === 'words') return rackWordSet.has(groupWord(group));
    const parsed = group.map(tile => ({ suit: tile.value[0], rank: Number(tile.value.slice(1)) }));
    const sameSuit = parsed.every(tile => tile.suit === parsed[0].suit);
    const ranks = parsed.map(tile => tile.rank).sort((a, b) => a - b);
    const run = sameSuit && ranks.every((rank, index) => index === 0 || rank === ranks[index - 1] + 1);
    const set = parsed.every(tile => tile.rank === parsed[0].rank) && new Set(parsed.map(tile => tile.suit)).size === parsed.length;
    return run || set;
  }

  function start(n) {
    const data = levels()[n - 1]; if (!data) return;
    setArcadeExitVisible(false);
    setArcadeModeSelect(false);
    shuffleTheme();
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
    if (!tiles.length) return `<span class="kt-empty-slot">${slotMarkup(type, 0, groupId)}</span>`;
    return tiles.map((tile, index) =>
      `<span class="kt-tile-position">${slotMarkup(type, index, groupId)}${tileMarkup(tile, movedId)}${index === tiles.length - 1 ? slotMarkup(type, index + 1, groupId) : ''}</span>`
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
    marker.classList.add('kt-drag-marker');
    const remaining = [...container.querySelectorAll('[data-tile]')].filter(element => Number(element.dataset.tile) !== drag.id);
    const anchor = remaining[Math.min(target.index, remaining.length - 1)];
    const containerRect = container.getBoundingClientRect();
    const anchorRect = anchor?.getBoundingClientRect();
    const edge = anchorRect
      ? (target.index < remaining.length ? anchorRect.left : anchorRect.right)
      : containerRect.left + containerRect.width / 2;
    marker.style.left = `${edge - containerRect.left - 2}px`;
    marker.style.top = `${(anchorRect ? anchorRect.top + (anchorRect.height - 44) / 2 : containerRect.top + (containerRect.height - 44) / 2) - containerRect.top}px`;
    container.appendChild(marker);
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

  function checkFailure() {
    if (state.rack.length) return 'RACK NOT EMPTY';
    const broken = state.groups.filter(group => !validGroup(group.tiles));
    if (!broken.length) return 'KEEP GOING';
    if (mode !== 'words') return broken.length > 1 ? `${broken.length} GROUPS NOT VALID` : 'THAT GROUP IS NOT A RUN OR SET';
    // A blocked word is a real word the arcade does not count, so say that
    // rather than "not a word", which would read as the game being wrong.
    const blocked = broken.find(group => rackBlockedSet.has(groupWord(group.tiles)));
    if (blocked) return `${groupWord(blocked.tiles).toUpperCase()} IS NOT COUNTED HERE`;
    const short = broken.find(group => group.tiles.length < 3);
    if (short) return 'WORDS NEED 3+ LETTERS';
    return `${groupWord(broken[0].tiles).toUpperCase()} IS NOT A WORD`;
  }

  function flashMessage(text) {
    const flash = wrap && wrap.querySelector('#kt-flash');
    if (!flash) return;
    flash.textContent = text || '';
    flash.hidden = !text;
    clearTimeout(flashMessage.timer);
    flashMessage.timer = setTimeout(() => {
      if (flash.isConnected) flash.hidden = true;
    }, 1800);
  }
  function win() {
    if (state.won) return;
    state.won = true;
    record(state.n);
    sync();
    if (typeof SFX !== 'undefined') SFX.win();
    setArcadeExitVisible(false);
    const completedLevel = state.n;
    wrap.innerHTML = buildArcadeResultCard({
      uid: `tile-swap-${mode}`,
      boardKey: `consume-${mode}`,
      artGame: 'consume',
      color: cfg().accent,
      marquee: 'PUZZLE SOLVED!',
      scoreLabel: 'GAME',
      scoreValue: cfg().title,
      scoreExtra: `<span style="color:#fff;font-size:16px">LEVEL ${clearedCount()}/${levels().length}</span>`,
      canSave: false,
      showBoard: false,
      showSaveArea: false,
      buttons: `
        <button class="kt-result-btn arcade-result-primary" data-another>PLAY ANOTHER</button>
        <button class="kt-result-btn arcade-result-secondary" data-replay>REPLAY</button>
        <button class="kt-result-btn arcade-result-secondary" data-modes>TILE SWAP MENU</button>
        <button class="kt-result-btn arcade-result-arcade" data-arcade>ARCADE</button>
      `,
    });
    mountSelectionArt(`tile-swap-${mode}-art`, 'consume');
    wrap.onclick = event => {
      if (event.target.hasAttribute('data-another')) serveUnseenPuzzle();
      if (event.target.hasAttribute('data-replay')) start(completedLevel);
      if (event.target.hasAttribute('data-modes')) window.renderConsumeModes();
      if (event.target.hasAttribute('data-arcade')) nav('lobby');
    };
  }

  function renderPlay() {
    wrap.style.setProperty('--kt', cfg().accent);
    wrap.innerHTML = `${playSceneryMarkup()}<div class="kt-hud"><button data-modes>◀ MODES</button><strong>${cfg().title}</strong><button data-reset>RESET</button></div><div class="kt-goal">BOARD ${state.n}/${levels().length}</div><div class="kt-table" id="kt-table"></div><div class="kt-flash" id="kt-flash" role="status" aria-live="polite" hidden></div><button class="kt-check" id="kt-check">CHECK</button><div class="kt-rack" id="kt-rack" data-rack-drop></div>`;
    wrap.querySelector('.kt-hud').addEventListener('click', event => { if (event.target.hasAttribute('data-modes')) window.renderConsumeModes(); if (event.target.hasAttribute('data-reset')) start(state.n); });
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
    wrap.querySelector('#kt-check').addEventListener('click', () => {
      const table = wrap.querySelector('#kt-table');
      if (checkWin()) { win(); return; }
      table.classList.remove('bad'); void wrap.offsetWidth; table.classList.add('bad');
      if (typeof SFX !== 'undefined') SFX.mismatch();
      flashMessage(checkFailure());
    });
    update();
  }
  function update(movedId) {
    if (!state || !wrap) return;
    const previous = new Map([...wrap.querySelectorAll('[data-tile]')].map(tile => [tile.dataset.tile, tile.getBoundingClientRect()]));
    wrap.querySelector('#kt-table').innerHTML = state.groups.map(group => groupMarkup(group, movedId)).join('') +
      (state.pickedId ? `<button class="kt-new-group-cue kt-tap-new-group" type="button" data-new-group>NEW GROUP</button>` : '');
    wrap.querySelector('#kt-rack').innerHTML = `<span class="kt-rack-label">RACK</span>${tilesWithSlots(state.rack, 'rack', null, movedId)}`;
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      wrap.querySelectorAll('[data-tile]').forEach(tile => {
        const before = previous.get(tile.dataset.tile), after = tile.getBoundingClientRect();
        if (!before) return;
        const dx = before.left - after.left, dy = before.top - after.top;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) tile.animate([
          { transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' },
        ], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
      });
    }
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

  window.initConsumeRack = next => { mode = next; wrap = document.getElementById('consume-wrap'); serveUnseenPuzzle(); };
  window.consumeRackBack = () => { state = null; mode = null; };
  function modeArt(kind) {
    if (kind === 'grid') {
      return `<div class="consume-mode-art consume-grid-art" aria-hidden="true">
        ${['M','O','B','E','A','R','C','S','T','I','L','E','P','L','A','Y'].map((letter, index) =>
          `<i class="${[0,1,2,3,6,10,14].includes(index) ? 'lit' : ''}">${letter}</i>`).join('')}
      </div>`;
    }
    const tiles = kind === 'words'
      ? [['W','cyan'],['O','pink'],['R','yellow'],['D','cyan'],['S','pink']]
      : [['3','red'],['4','blue'],['5','green'],['8','yellow'],['8','red']];
    return `<div class="consume-mode-art consume-float-art consume-${kind}-art" aria-hidden="true">
      ${tiles.map(([value, color], index) => `<i class="${color}" style="--tile-i:${index}">${value}</i>`).join('')}
    </div>`;
  }

  window.renderConsumeModes = () => {
    wrap = document.getElementById('consume-wrap');
    if (!wrap) return;
    state = null;
    mode = null;
    clearTheme();
    setArcadeModeSelect(true, { label: 'ARCADE' });
    wrap.innerHTML = `<div class="consume-modes">
      <div class="consume-mode-banner"><div class="cw-title">TILE SWAP</div></div>
      <div class="consume-mode-grid">
        <button class="consume-mode-card" style="--mode-color:#ff7180" data-mode="grid">
          ${modeArt('grid')}<strong>WORD GRID</strong><span>BUILD WORDS FROM<br>A SHARED GRID</span>
        </button>
        <button class="consume-mode-card" style="--mode-color:#ff75d5" data-mode="words">
          ${modeArt('words')}<strong>LETTER SWAP</strong><span>REARRANGE TILES<br>INTO WORDS</span>
        </button>
        <button class="consume-mode-card" style="--mode-color:#ffb35c" data-mode="numbers">
          ${modeArt('numbers')}<strong>RUMMY SWAP</strong><span>MAKE NUMBER RUNS<br>AND SETS</span>
        </button>
      </div>
    </div>`;
    wrap.querySelector('.consume-modes').addEventListener('click', event => {
      const button = event.target.closest('[data-mode]');
      if (!button) return;
      if (button.dataset.mode === 'grid') window.initConsumeGrid();
      else window.initConsumeRack(button.dataset.mode);
    });
  };
})();
