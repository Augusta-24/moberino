// ══════════════════════════════════════
//  SNOOB — retro sticker shooter
// ══════════════════════════════════════
(function() {
  const COLS = 8;
  const START_ROWS = 6;
  const MAX_ROWS = 12;
  const TYPES = 6;
  const BOARD_KEY = 'snoob';
  const COLOR = '#e4b65f';
  const CAPSULE_COLORS = ['#ff1f3f', '#ff6f00', '#ffe000', '#10b84a', '#00a8ff', '#7b35d8', '#ff2aa3', '#1d3cff'];
  const SNOOB_SOUND_FILES = {
    fire: 'snoob/FIRE.WAV',
    miss: 'snoob/MISS.WAV',
    match: 'snoob/TRANSPRT.WAV',
    over: 'snoob/WEDIED.WAV',
    fanfare1: 'snoob/FANFARE.WAV',
    fanfare2: 'snoob/FANFARE2.WAV',
  };

  let state = 'idle'; // idle | playing | over
  let canvas = null, ctx = null, wrap = null;
  let W = 0, H = 0, dpr = 1;
  let board = [];
  let fallingPieces = [];
  let faceFlashes = [];
  let rattles = [];
  let tokenTypes = [];
  let score = 0, shots = 0, drops = 0, rowsAdded = 0;
  let current = null, nextType = 0, shooter = { x: 0, y: 0 };
  let aim = -Math.PI / 2;
  let crankSpin = 0;
  let raf = 0, last = 0, resizeHandler = null;
  let imagesReady = false;
  const imgCache = new Map();
  const soundCache = new Map();

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function playableChars() {
    const indices = GAME_CHARS.map((_, i) => i);
    const chosen = shuffle(indices).slice(0, TYPES);
    chosen.forEach(i => {
      const c = GAME_CHARS[i];
      [c.img, c.imgHappy, c.imgSad, c.imgWhack].filter(Boolean).forEach(src => preloadImage(src));
    });
    imagesReady = true;
    return chosen;
  }

  function preloadImage(src) {
    if (!src || imgCache.has(src)) return;
    const img = new Image();
    img.onload = () => { imagesReady = true; };
    img.src = src;
    imgCache.set(src, img);
  }

  function randType() {
    return Math.floor(Math.random() * tokenTypes.length);
  }

  function rowOffset(row) {
    return row % 2 ? 0.5 : 0;
  }

  function radius() {
    const cap = W >= 900 ? 58 : W >= 640 ? 48 : 34;
    return Math.min(W / (COLS + 0.45) / 2, H / 14.6, cap);
  }

  function boardTop() {
    return cabinetTopH() + radius() * 0.32;
  }

  function cabinetTopH() {
    return Math.max(26, radius() * 0.68);
  }

  function cabinetBaseH() {
    return Math.max(radius() * 1.34, 46);
  }

  function cellPos(row, col) {
    const r = radius();
    const dx = r * 1.82;
    const dy = r * 1.52;
    const startX = W / 2 - ((COLS - 1) * dx + r) / 2;
    return {
      x: startX + (col + rowOffset(row)) * dx,
      y: boardTop() + row * dy,
    };
  }

  function ensureBoardRows(n) {
    while (board.length < n) board.push(Array(COLS).fill(null));
  }

  function resetBoard() {
    board = [];
    fallingPieces = [];
    faceFlashes = [];
    rattles = [];
    ensureBoardRows(MAX_ROWS);
    for (let r = 0; r < START_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r === START_ROWS - 1 && (c === 0 || c === COLS - 1)) continue;
        board[r][c] = randType();
      }
    }
  }

  function renderIdle() {
    const host = document.getElementById('snoob-wrap');
    if (!host) return;
    host.classList.add('mode-select-layout');
    document.body.classList.add('arcade-selection-open');
    setArcadeExitVisible(true);
    host.innerHTML = `
      <div class="whack-mode-shell" style="max-width:440px;margin-top:24px">
        <div class="game-card whack-mode-card snoob-mode-card" style="border-color:#e4b65f77;cursor:default;overflow:hidden">
          <div class="game-card-art snoob-menu-art">
            <div class="snoob-menu-capsules">
              ${CAPSULE_COLORS.slice(0, 7).map((color, i) => `
                <div class="snoob-menu-capsule" style="--cap:${color};--rot:${[-17, 10, 22, -9, 15, -20, 5][i]}deg;--x:${[-58, -6, 48, -35, 27, -74, 72][i]}px;--y:${[-14, -22, -10, 32, 36, 78, 82][i]}px;--s:${[.94, 1, .9, 1.06, .98, .86, .84][i]}"></div>
              `).join('')}
            </div>
          </div>
          <div class="snoob-card-copy">
            <div class="snoob-title">SNOOB</div>
            <div class="snoob-sub">RETRO STICKER SHOOTER<br>AIM · MATCH 3 · DROP CLUSTERS</div>
            <button class="snoob-btn" onclick="snoobStart()" style="margin-top:18px">▶ PLAY</button>
          </div>
        </div>
      </div>`;
    if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
    else ArcadeMusic.unduck();
  }

  function renderPlaying() {
    const host = document.getElementById('snoob-wrap');
    if (!host) return;
    host.classList.remove('mode-select-layout');
    document.body.classList.remove('arcade-selection-open');
    setArcadeExitVisible(true);
    host.innerHTML = `
      <div class="snoob-shell">
        <div class="snoob-hud">
          <div><div class="snoob-stat-label">SCORE</div><div class="snoob-stat-value" id="snoob-score">0</div></div>
          <div class="snoob-next" id="snoob-next"></div>
          <div style="text-align:right"><div class="snoob-stat-label">SHOTS</div><div class="snoob-stat-value" id="snoob-shots">0</div></div>
        </div>
        <div class="snoob-canvas-wrap">
          <canvas id="snoob-canvas"></canvas>
          <div class="snoob-toast" id="snoob-toast"></div>
        </div>
      </div>`;
    canvas = document.getElementById('snoob-canvas');
    ctx = canvas && canvas.getContext('2d');
    bindCanvas();
    resize();
    updateHud();
  }

  function renderOver() {
    cancelAnimationFrame(raf);
    const host = document.getElementById('snoob-wrap');
    if (!host) return;
    host.classList.add('mode-select-layout');
    document.body.classList.add('arcade-selection-open');
    setArcadeExitVisible(false);
    host.innerHTML = buildArcadeResultCard({
      uid: 'snoob',
      boardKey: BOARD_KEY,
      artGame: 'snoob',
      color: COLOR,
      marquee: boardCleared() ? 'CLEARED!' : 'GAME OVER',
      marqueeEnd: '#5b6f9a',
      scoreLabel: 'YOUR SCORE',
      scoreValue: score,
      saveValue: score,
      field: 'score',
      extra: `${shots} SHOTS · ${drops} DROPS`,
      buttons: `
        <button class="whack-btn" style="border-color:#e4b65f;background:rgba(228,182,95,0.24)" onclick="snoobStart()">PLAY AGAIN</button>
        <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.24)" onclick="nav('lobby')">BACK TO ARCADE</button>
      `,
    });
    loadRemoteBoard(BOARD_KEY, 'snoob-board', COLOR, 'score');
    mountSelectionArt('snoob-art', 'snoob');
  }

  function updateHud() {
    const s = document.getElementById('snoob-score');
    const sh = document.getElementById('snoob-shots');
    if (s) s.textContent = score;
    if (sh) sh.textContent = shots;
    const next = document.getElementById('snoob-next');
    if (next) {
      next.innerHTML = '';
      const mini = document.createElement('canvas');
      mini.width = 52; mini.height = 52;
      mini.style.width = '46px'; mini.style.height = '46px';
      next.appendChild(mini);
      drawToken(mini.getContext('2d'), 26, 26, 20, nextType, 1);
    }
  }

  function resize() {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    W = Math.max(260, rect.width || 320);
    H = Math.max(360, rect.height || 480);
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    shooter.x = W / 2;
    shooter.y = H - cabinetBaseH() - radius() * 0.28;
  }

  function bindCanvas() {
    if (!canvas) return;
    canvas.onpointerdown = handlePointerDown;
    canvas.onpointermove = handlePointer;
    canvas.onpointerup = null;
    resizeHandler = resize;
    window.addEventListener('resize', resizeHandler);
  }

  function updateAimFromEvent(e) {
    if (state !== 'playing' || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const a = Math.atan2(y - shooter.y, x - shooter.x);
    aim = Math.max(-Math.PI + 0.18, Math.min(-0.18, a));
  }

  function handlePointer(e) {
    if (state !== 'playing' || !canvas || current) return;
    updateAimFromEvent(e);
  }

  function handlePointerDown(e) {
    if (state !== 'playing' || !canvas || current) return;
    if (e.preventDefault) e.preventDefault();
    if (canvas.setPointerCapture && e.pointerId != null) {
      try { canvas.setPointerCapture(e.pointerId); } catch(err) {}
    }
    updateAimFromEvent(e);
    shoot();
  }

  function shoot() {
    if (state !== 'playing' || current) return;
    const speed = 720;
    current = {
      x: shooter.x,
      y: shooter.y,
      vx: Math.cos(aim) * speed,
      vy: Math.sin(aim) * speed,
      type: nextType,
    };
    nextType = randType();
    shots++;
    updateHud();
    crankSpin = 0.38;
    playSnoobSound('fire');
  }

  function step(ts) {
    if (state !== 'playing') return;
    const dt = Math.min(0.033, (ts - last) / 1000 || 0.016);
    last = ts;
    update(dt);
    draw();
    raf = requestAnimationFrame(step);
  }

  function update(dt) {
    updateFallingPieces(dt);
    updateFaceFlashes(dt);
    updateRattles(dt);
    if (crankSpin > 0) crankSpin = Math.max(0, crankSpin - dt);
    if (!current) return;
    const r = radius();
    current.x += current.vx * dt;
    current.y += current.vy * dt;
    if (current.x < r) { current.x = r; current.vx = Math.abs(current.vx); }
    if (current.x > W - r) { current.x = W - r; current.vx = -Math.abs(current.vx); }
    if (current.y <= boardTop() + r * 0.2 || collides(current.x, current.y, r)) {
      snapCurrent();
    }
  }

  function updateFallingPieces(dt) {
    if (!fallingPieces.length) return;
    const r = radius();
    fallingPieces.forEach(p => {
      p.vy += 880 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      p.life -= dt;
    });
    fallingPieces = fallingPieces.filter(p => p.life > 0 && p.y < H + r * 3);
  }

  function updateFaceFlashes(dt) {
    faceFlashes.forEach(f => { f.until -= dt; });
    faceFlashes = faceFlashes.filter(f => f.until > 0);
    if (state !== 'playing' || faceFlashes.length > 4 || Math.random() > 0.025) return;
    const occupied = [];
    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < COLS; col++) if (board[row][col] != null) occupied.push({ row, col });
    }
    if (!occupied.length) return;
    const pick = occupied[Math.floor(Math.random() * occupied.length)];
    faceFlashes.push({
      row: pick.row,
      col: pick.col,
      mood: Math.random() < 0.55 ? 'happy' : 'sad',
      until: 0.42 + Math.random() * 0.38,
    });
  }

  function flashMood(row, col) {
    const f = faceFlashes.find(item => item.row === row && item.col === col);
    return f && f.until > 0 ? f.mood : 'normal';
  }

  function updateRattles(dt) {
    rattles.forEach(item => { item.t -= dt; });
    rattles = rattles.filter(item => item.t > 0);
  }

  function rattleAt(row, col) {
    return rattles.find(item => item.row === row && item.col === col);
  }

  function triggerRattle(row, col) {
    const targets = [{ row, col, amp: 1 }, ...neighbors(row, col).map(n => ({ ...n, amp: 0.55 }))];
    targets.forEach((item, i) => {
      if (!board[item.row] || board[item.row][item.col] == null) return;
      const existing = rattleAt(item.row, item.col);
      const next = {
        row: item.row,
        col: item.col,
        t: 0.26 + i * 0.012,
        dur: 0.26 + i * 0.012,
        amp: item.amp,
        phase: (item.row * 11.7 + item.col * 5.3) % (Math.PI * 2),
      };
      if (existing) Object.assign(existing, next);
      else rattles.push(next);
    });
  }

  function visualForCell(row, col) {
    const n = shapeNoise(row * 29 + col * 7 + 3);
    const rattle = rattleAt(row, col);
    const baseRot = n.c * 0.087;
    if (!rattle) return { dx: 0, dy: 0, rot: baseRot };
    const p = Math.max(0, rattle.t / rattle.dur);
    const wave = Math.sin((1 - p) * Math.PI * 5.5 + rattle.phase) * p * rattle.amp;
    return {
      dx: wave * radius() * 0.045,
      dy: Math.cos((1 - p) * Math.PI * 4 + rattle.phase) * p * rattle.amp * radius() * 0.025,
      rot: baseRot + wave * 0.045,
    };
  }

  function collides(x, y, r) {
    const hitDist = r * 1.72;
    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < COLS; col++) {
        if (board[row][col] == null) continue;
        const p = cellPos(row, col);
        if (Math.hypot(x - p.x, y - p.y) <= hitDist) return true;
      }
    }
    return false;
  }

  function nearestCell(x, y) {
    let best = null, bestD = Infinity;
    ensureBoardRows(MAX_ROWS);
    for (let row = 0; row < MAX_ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (board[row][col] != null) continue;
        const p = cellPos(row, col);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bestD) { bestD = d; best = { row, col }; }
      }
    }
    return best || { row: MAX_ROWS - 1, col: Math.floor(COLS / 2) };
  }

  function snapCurrent() {
    if (!current) return;
    const target = nearestCell(current.x, current.y);
    board[target.row][target.col] = current.type;
    const snapped = target;
    current = null;
    triggerRattle(snapped.row, snapped.col);
    const cleared = clearMatches(snapped.row, snapped.col);
    if (cleared > 0) {
      const fallen = dropDisconnected();
      score += cleared * 100 + fallen * 150;
      drops += fallen;
      showToast(fallen ? `DROP +${fallen}` : `MATCH +${cleared}`);
      playSnoobSound('match');
    } else {
      playSnoobSound('miss');
      if (shots % 5 === 0) addRow();
    }
    updateHud();
    if (boardCleared()) {
      score += 1000 + Math.max(0, 40 - shots) * 25;
      state = 'over';
      playSnoobWin();
      setTimeout(renderOver, 500);
    } else if (isDanger()) {
      state = 'over';
      playSnoobSound('over');
      setTimeout(renderOver, 500);
    }
  }

  function neighbors(row, col) {
    const odd = row % 2 === 1;
    const deltas = odd
      ? [[0,-1],[0,1],[-1,0],[-1,1],[1,0],[1,1]]
      : [[0,-1],[0,1],[-1,-1],[-1,0],[1,-1],[1,0]];
    return deltas.map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
      .filter(p => p.row >= 0 && p.row < MAX_ROWS && p.col >= 0 && p.col < COLS);
  }

  function clearMatches(row, col) {
    const type = board[row] && board[row][col];
    if (type == null) return 0;
    const seen = new Set();
    const stack = [{ row, col }];
    const group = [];
    while (stack.length) {
      const p = stack.pop();
      const key = `${p.row},${p.col}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!board[p.row] || board[p.row][p.col] !== type) continue;
      group.push(p);
      neighbors(p.row, p.col).forEach(n => stack.push(n));
    }
    if (group.length < 3) return 0;
    group.forEach((p, i) => {
      const pos = cellPos(p.row, p.col);
      spawnFallingPiece(pos.x, pos.y, board[p.row][p.col], true, i);
      board[p.row][p.col] = null;
    });
    return group.length;
  }

  function dropDisconnected() {
    const connected = new Set();
    const stack = [];
    for (let c = 0; c < COLS; c++) if (board[0][c] != null) stack.push({ row: 0, col: c });
    while (stack.length) {
      const p = stack.pop();
      const key = `${p.row},${p.col}`;
      if (connected.has(key)) continue;
      connected.add(key);
      neighbors(p.row, p.col).forEach(n => {
        if (board[n.row] && board[n.row][n.col] != null) stack.push(n);
      });
    }
    let fallen = 0;
    for (let r = 0; r < MAX_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] != null && !connected.has(`${r},${c}`)) {
          const p = cellPos(r, c);
          spawnFallingPiece(p.x, p.y, board[r][c], false, fallen);
          board[r][c] = null;
          fallen++;
        }
      }
    }
    return fallen;
  }

  function spawnFallingPiece(x, y, type, knocked, order) {
    const side = Math.random() < 0.5 ? -1 : 1;
    fallingPieces.push({
      x, y, type,
      vx: side * (knocked ? 95 + Math.random() * 145 : 35 + Math.random() * 90),
      vy: knocked ? -170 - Math.random() * 120 - (order || 0) * 8 : -70 - Math.random() * 65,
      rot: (Math.random() - 0.5) * (knocked ? 2.2 : 1.2),
      vr: side * ((knocked ? 4.8 : 2.4) + Math.random() * 3.4),
      life: knocked ? 1.75 : 1.35,
      mood: Math.random() < 0.5 ? 'happy' : 'sad',
    });
  }

  function addRow() {
    board.pop();
    board.unshift(Array.from({ length: COLS }, () => randType()));
    rowsAdded++;
    showToast('ROW DOWN');
  }

  function boardCleared() {
    return board.every(row => row.every(v => v == null));
  }

  function isDanger() {
    const dangerY = shooter.y - radius() * 2.2;
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] == null) continue;
        if (cellPos(r, c).y + radius() > dangerY) return true;
      }
    }
    return false;
  }

  function showToast(text) {
    const t = document.getElementById('snoob-toast');
    if (!t) return;
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('show'), 700);
  }

  function audioCtx() {
    try {
      if (typeof getAudioCtx === 'function') return getAudioCtx();
    } catch(e) {}
    return null;
  }

  function playSnoobSound(key) {
    const src = SNOOB_SOUND_FILES[key];
    if (!src) return false;
    try {
      if (typeof ArcadeMusic !== 'undefined' && ArcadeMusic.muted) return true;
      let audio = soundCache.get(src);
      if (!audio) {
        audio = new Audio(src);
        audio.preload = 'auto';
        audio.volume = 0.72;
        soundCache.set(src, audio);
      }
      audio.pause();
      audio.currentTime = 0;
      const pending = audio.play();
      if (pending && typeof pending.catch === 'function') pending.catch(() => {});
      return true;
    } catch(e) {
      return false;
    }
  }

  function playSnoobWin() {
    const first = playSnoobSound('fanfare1');
    setTimeout(() => playSnoobSound('fanfare2'), first ? 420 : 120);
  }

  function snoobTone(freq, endFreq, delay, dur, vol, type) {
    const c = audioCtx();
    if (!c) {
      if (SFX && SFX.score) SFX.score();
      return;
    }
    const osc = c.createOscillator();
    const gain = c.createGain();
    const filter = c.createBiquadFilter();
    const t0 = c.currentTime + Math.max(0.015, delay || 0);
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(820, t0);
    filter.frequency.exponentialRampToValueAtTime(520, t0 + dur);
    filter.Q.setValueAtTime(5.5, t0);
    osc.type = type || 'triangle';
    osc.frequency.setValueAtTime(freq, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function playSnoobWaa(scale, delay) {
    snoobTone(620 * scale, 255 * scale, delay || 0, 0.22, 0.055, 'sine');
    snoobTone(880 * scale, 410 * scale, (delay || 0) + 0.035, 0.18, 0.028, 'triangle');
  }

  function playSnoobBounce() {
    snoobTone(720, 460, 0, 0.11, 0.035, 'sine');
  }

  function playSnoobStick() {
    snoobTone(430, 520, 0, 0.08, 0.032, 'triangle');
  }

  function playSnoobMatch(fallen) {
    playSnoobWaa(1.18, 0);
    snoobTone(fallen ? 320 : 520, fallen ? 160 : 780, 0.13, fallen ? 0.32 : 0.2, 0.052, 'sine');
  }

  function drawBackground() {
    const chamber = ctx.createLinearGradient(0, 0, 0, H);
    chamber.addColorStop(0, '#efeee8');
    chamber.addColorStop(0.48, '#e6e3da');
    chamber.addColorStop(1, '#cfcabe');
    ctx.fillStyle = chamber;
    ctx.fillRect(0, 0, W, H);
    const topH = cabinetTopH();
    const baseH = cabinetBaseH();
    const chamberX = radius() * 0.58;
    const chamberY = topH + radius() * 0.16;
    const chamberW = W - radius() * 1.16;
    const chamberH = H - baseH - topH - radius() * 0.24;
    const redTop = ctx.createLinearGradient(0, 0, 0, topH);
    redTop.addColorStop(0, '#e64b31');
    redTop.addColorStop(0.62, '#bc281b');
    redTop.addColorStop(1, '#85170f');
    ctx.fillStyle = redTop;
    ctx.fillRect(0, 0, W, topH);
    ctx.fillStyle = '#c83220';
    ctx.fillRect(0, H - baseH, W, baseH);
    ctx.fillStyle = 'rgba(0,0,0,0.10)';
    ctx.fillRect(0, H - baseH, W, Math.max(5, radius() * 0.14));
    ctx.fillStyle = chamber;
    ctx.fillRect(chamberX, chamberY, chamberW, chamberH);
    drawFrostedWallpaper(chamberX, chamberY, chamberW, chamberH);
    const frost = ctx.createRadialGradient(W * 0.5, H * 0.34, radius(), W * 0.5, H * 0.42, W * 0.72);
    frost.addColorStop(0, 'rgba(255,255,255,0.64)');
    frost.addColorStop(0.45, 'rgba(255,255,255,0.34)');
    frost.addColorStop(1, 'rgba(92,88,84,0.12)');
    ctx.fillStyle = frost;
    ctx.fillRect(chamberX, chamberY, chamberW, chamberH);
    const edgeFog = ctx.createLinearGradient(chamberX, 0, chamberX + chamberW, 0);
    edgeFog.addColorStop(0, 'rgba(35,32,35,0.18)');
    edgeFog.addColorStop(0.18, 'rgba(255,255,255,0)');
    edgeFog.addColorStop(0.82, 'rgba(255,255,255,0)');
    edgeFog.addColorStop(1, 'rgba(35,32,35,0.16)');
    ctx.fillStyle = edgeFog;
    ctx.fillRect(chamberX, chamberY, chamberW, chamberH);
    drawChamberWear(chamberX, chamberY, chamberW, chamberH);
    drawBackRods(topH, baseH);
    drawCabinetFrame(topH, baseH);
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(radius() * 0.82, topH + radius() * 0.26, W - radius() * 1.64, H - baseH - topH - radius() * 0.48);
    ctx.fillStyle = 'rgba(255,255,255,0.17)';
    ctx.beginPath();
    ctx.moveTo(W * 0.16, topH + radius() * 0.4);
    ctx.lineTo(W * 0.35, topH + radius() * 0.4);
    ctx.lineTo(W * 0.18, H - baseH - radius() * 0.35);
    ctx.lineTo(W * 0.06, H - baseH - radius() * 0.35);
    ctx.closePath();
    ctx.fill();
    drawCrankMachineParts(topH, baseH);
  }

  function drawFrostedWallpaper(x, y, w, h) {
    const r = radius();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = '#6f5f8e';
    ctx.fillStyle = 'rgba(108,86,140,0.22)';
    const step = Math.max(72, r * 2.7);
    for (let yy = y + r * 0.9; yy < y + h + step; yy += step) {
      for (let xx = x + r * 0.9; xx < x + w + step; xx += step) {
        const offset = Math.sin((xx + yy) * 0.013) * r * 0.28;
        const kind = Math.abs(Math.round((xx + yy) / step)) % 3;
        ctx.save();
        ctx.translate(xx + offset, yy);
        ctx.rotate(Math.sin((xx - yy) * 0.01) * 0.24);
        if (kind === 0) {
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
          ctx.stroke();
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.12, 0, Math.PI * 2);
          ctx.stroke();
        } else if (kind === 1) {
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.42);
          ctx.lineTo(r * 0.4, r * 0.28);
          ctx.lineTo(-r * 0.4, r * 0.28);
          ctx.closePath();
          ctx.stroke();
        } else {
          ctx.beginPath();
          roundRectPath(ctx, -r * 0.34, -r * 0.22, r * 0.68, r * 0.44, r * 0.07);
          ctx.stroke();
          ctx.fillRect(-r * 0.2, -r * 0.04, r * 0.4, r * 0.08);
        }
        ctx.restore();
      }
    }
    ctx.globalAlpha = 0.22;
    const cloudy = ctx.createLinearGradient(x, y, x + w, y + h);
    cloudy.addColorStop(0, 'rgba(255,255,255,0.58)');
    cloudy.addColorStop(0.5, 'rgba(255,255,255,0.18)');
    cloudy.addColorStop(1, 'rgba(255,255,255,0.5)');
    ctx.fillStyle = cloudy;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }

  function drawChamberWear(x, y, w, h) {
    const r = radius();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalAlpha = 0.16;
    for (let i = 0; i < 14; i++) {
      const px = x + ((i * 47) % Math.max(1, w));
      const py = y + ((i * 83) % Math.max(1, h));
      const spot = ctx.createRadialGradient(px, py, r * 0.08, px, py, r * (0.8 + (i % 3) * 0.22));
      spot.addColorStop(0, i % 2 ? 'rgba(170,150,100,0.14)' : 'rgba(255,255,255,0.2)');
      spot.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spot;
      ctx.fillRect(px - r * 1.4, py - r * 1.4, r * 2.8, r * 2.8);
    }
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(95,85,76,0.38)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 18; i++) {
      const sx = x + ((i * 31 + 13) % Math.max(1, w));
      const sy = y + ((i * 59 + 21) % Math.max(1, h));
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + r * (0.24 + (i % 4) * 0.12), sy + r * (0.08 - (i % 3) * 0.06));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawBackRods(topH, baseH) {
    const r = radius();
    const y0 = topH + r * 0.14;
    const y1 = H - baseH - r * 0.1;
    const rods = [0.5];
    rods.forEach((pct, i) => {
      const x = W * pct + (i - 1) * r * 0.08;
      const metal = ctx.createLinearGradient(x - r * 0.045, 0, x + r * 0.045, 0);
      metal.addColorStop(0, 'rgba(35,36,34,0.16)');
      metal.addColorStop(0.48, 'rgba(255,255,255,0.58)');
      metal.addColorStop(1, 'rgba(35,36,34,0.2)');
      ctx.strokeStyle = metal;
      ctx.lineWidth = Math.max(1.6, r * 0.04);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.08)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + r * 0.08, y0);
      ctx.lineTo(x + r * 0.08, y1);
      ctx.stroke();
    });
  }

  function drawCabinetFrame(topH, baseH) {
    const r = radius();
    const railW = Math.max(10, r * 0.28);
    const red = ctx.createLinearGradient(0, 0, 0, topH);
    red.addColorStop(0, '#e24a2e');
    red.addColorStop(0.55, '#bb2418');
    red.addColorStop(1, '#8f160f');
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, W, Math.max(topH * 0.34, r * 0.46));
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(r * 0.62, r * 0.12, W - r * 1.24, 2);
    const rail = ctx.createLinearGradient(0, 0, railW, 0);
    rail.addColorStop(0, '#4b4d48');
    rail.addColorStop(0.28, '#d6d1c5');
    rail.addColorStop(0.56, '#77776f');
    rail.addColorStop(1, '#242521');
    [0, W - railW].forEach(x => {
      ctx.fillStyle = rail;
      ctx.fillRect(x, 0, railW, H);
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      ctx.fillRect(x + railW * 0.36, topH * 0.2, 1, H - baseH - topH * 0.25);
      ctx.fillStyle = 'rgba(0,0,0,0.24)';
      ctx.fillRect(x + (x === 0 ? railW - 2 : 1), 0, 2, H);
    });
    const railY = H - baseH - Math.max(5, r * 0.16);
    const railH = Math.max(6, r * 0.18);
    const divider = ctx.createLinearGradient(0, railY, 0, railY + railH);
    divider.addColorStop(0, '#3c3d39');
    divider.addColorStop(0.18, '#d7d2c7');
    divider.addColorStop(0.45, '#8d8a82');
    divider.addColorStop(0.72, '#2f302d');
    divider.addColorStop(1, '#111318');
    ctx.fillStyle = divider;
    ctx.fillRect(0, railY, W, railH);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(railW * 0.7, railY + railH * 0.18, W - railW * 1.4, 1);
    ctx.strokeStyle = 'rgba(17,19,24,0.48)';
    ctx.lineWidth = Math.max(3, r * 0.12);
    ctx.strokeRect(railW * 0.7, topH * 0.2, W - railW * 1.4, H - baseH - topH * 0.22);
  }

  function drawCrankMachineParts(topH, baseH) {
    const r = radius();
    const panelW = Math.min(W * 0.62, r * 6.8);
    const panelH = Math.min(baseH * 0.68, r * 1.02);
    const panelX = W * 0.07;
    const panelY = H - baseH + Math.max(5, baseH * 0.14);
    ctx.save();
    ctx.fillStyle = 'rgba(17,19,24,0.13)';
    ctx.beginPath();
    roundRectPath(ctx, W * 0.06, H - baseH + baseH * 0.1, W * 0.88, baseH * 0.78, r * 0.12);
    ctx.fill();
    const metal = ctx.createLinearGradient(panelX, panelY, panelX + panelW, panelY + panelH);
    metal.addColorStop(0, '#a6a39a');
    metal.addColorStop(0.18, '#f1efe5');
    metal.addColorStop(0.36, '#8f8c84');
    metal.addColorStop(0.56, '#d8d4c6');
    metal.addColorStop(0.78, '#77736c');
    metal.addColorStop(1, '#c9c4b7');
    ctx.fillStyle = metal;
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = Math.max(3, r * 0.11);
    ctx.beginPath();
    roundRectPath(ctx, panelX, panelY, panelW, panelH, r * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.48)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
      const x = panelX + r * 0.26 + i * (panelW - r * 0.52) / 8;
      ctx.beginPath(); ctx.moveTo(x, panelY + r * 0.16); ctx.lineTo(x - r * 0.16, panelY + panelH - r * 0.18); ctx.stroke();
    }
    [[panelX + r * 0.24, panelY + r * 0.24], [panelX + panelW - r * 0.24, panelY + r * 0.24], [panelX + r * 0.24, panelY + panelH - r * 0.24], [panelX + panelW - r * 0.24, panelY + panelH - r * 0.24]].forEach(([x, y]) => {
      ctx.fillStyle = '#4e4b46';
      ctx.beginPath(); ctx.arc(x, y, r * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.moveTo(x - r * 0.06, y); ctx.lineTo(x + r * 0.06, y); ctx.stroke();
    });
    const slotX = panelX + panelW * 0.1;
    const slotY = panelY + panelH * 0.34;
    ctx.fillStyle = '#111318';
    ctx.beginPath();
    roundRectPath(ctx, slotX, slotY, panelW * 0.24, Math.max(4, r * 0.13), r * 0.04);
    ctx.fill();
    ctx.strokeStyle = '#ebe7dc';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#2d2a25';
    ctx.font = `${Math.max(7, Math.round(r * 0.24))}px sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('INSERT 25¢', slotX, panelY + panelH * 0.66);

    const throatW = r * 1.55;
    const throatH = Math.max(10, r * 0.34);
    const throatX = shooter.x - throatW / 2;
    const throatY = panelY + panelH * 0.14;
    const throat = ctx.createLinearGradient(throatX, throatY, throatX, throatY + throatH);
    throat.addColorStop(0, '#3f3e38');
    throat.addColorStop(0.45, '#f0eadc');
    throat.addColorStop(1, '#23231f');
    ctx.fillStyle = throat;
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.beginPath();
    roundRectPath(ctx, throatX, throatY, throatW, throatH, r * 0.08);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(17,19,24,0.6)';
    ctx.beginPath();
    roundRectPath(ctx, throatX + r * 0.2, throatY + throatH * 0.42, throatW - r * 0.4, throatH * 0.36, r * 0.05);
    ctx.fill();

    const crankX = panelX + panelW * 0.76;
    const crankY = panelY + panelH * 0.5;
    const spin = crankSpin > 0 ? (1 - crankSpin / 0.38) * Math.PI * 2.2 : 0;
    const crankAngle = aim + Math.PI / 2 + spin + Math.sin(crankSpin * 42) * crankSpin * 0.6;
    const knob = ctx.createRadialGradient(crankX - r * 0.13, crankY - r * 0.16, r * 0.05, crankX, crankY, r * 0.44);
    knob.addColorStop(0, '#ffffff');
    knob.addColorStop(0.45, '#bdb8aa');
    knob.addColorStop(1, '#5f5a51');
    ctx.fillStyle = knob;
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = Math.max(2, r * 0.08);
    ctx.beginPath();
    ctx.arc(crankX, crankY, r * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.translate(crankX, crankY);
    ctx.rotate(crankAngle);
    ctx.strokeStyle = '#25231f';
    ctx.lineWidth = Math.max(4, r * 0.14);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 0.66, 0);
    ctx.stroke();
    const handleGrad = ctx.createLinearGradient(r * 0.48, -r * 0.18, r * 0.9, r * 0.18);
    handleGrad.addColorStop(0, '#77736a');
    handleGrad.addColorStop(0.45, '#f7f2e7');
    handleGrad.addColorStop(1, '#6a665e');
    ctx.fillStyle = handleGrad;
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = Math.max(2, r * 0.06);
    ctx.beginPath();
    ctx.ellipse(r * 0.78, 0, r * 0.24, r * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#292620';
    ctx.beginPath();
    ctx.arc(crankX, crankY, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
    const doorX = shooter.x - r * 0.5;
    const doorY = panelY + panelH * 0.58;
    ctx.fillStyle = 'rgba(17,19,24,0.78)';
    ctx.beginPath();
    roundRectPath(ctx, doorX, doorY, r, Math.max(8, r * 0.25), r * 0.07);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(doorX + r * 0.1, doorY + r * 0.06, r * 0.8, r * 0.04);
    ctx.restore();
  }

  function drawNextUpBadge() {
    const r = radius();
    const baseH = cabinetBaseH();
    const x = W * 0.82;
    const y = H - baseH * 0.42;
    ctx.save();
    ctx.fillStyle = 'rgba(17,19,24,0.18)';
    ctx.beginPath();
    roundRectPath(ctx, x - r * 0.86, y - r * 0.48, r * 1.72, r * 0.96, r * 0.12);
    ctx.fill();
    ctx.restore();
    drawToken(ctx, x, y, r * 0.56, nextType, 1, 'normal', 0, 1200 + nextType);
  }

  function drawGlassOverlay() {
    const r = radius();
    const topH = cabinetTopH();
    const baseH = cabinetBaseH();
    const x = r * 0.72;
    const y = topH + r * 0.18;
    const w = W - r * 1.44;
    const h = H - baseH - topH - r * 0.34;
    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,0.32)';
    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, y + r * 0.2);
    ctx.lineTo(x + w * 0.22, y + r * 0.2);
    ctx.lineTo(x + w * 0.1, y + h * 0.58);
    ctx.lineTo(x + w * 0.03, y + h * 0.58);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.78, y + h * 0.17, r * 0.42, r * 0.08, -0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.34)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.05, y + r * 0.1);
    ctx.lineTo(x + w * 0.95, y + r * 0.1);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    drawBackground();
    const r = radius();
    const dangerY = shooter.y - r * 2.35;
    if (isDanger()) {
      ctx.save();
      ctx.strokeStyle = 'rgba(185,45,45,0.86)';
      ctx.setLineDash([8, 7]);
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(radius() * 0.8, dangerY); ctx.lineTo(W - radius() * 0.8, dangerY); ctx.stroke();
      ctx.restore();
    }

    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < COLS; col++) {
        const type = board[row][col];
        if (type == null) continue;
        const p = cellPos(row, col);
        const visual = visualForCell(row, col);
        drawToken(ctx, p.x + visual.dx, p.y + visual.dy, r * 0.985, type, 1, flashMood(row, col), visual.rot, row * COLS + col);
      }
    }
    fallingPieces.forEach((p, i) => drawToken(ctx, p.x, p.y, r * 0.985, p.type, Math.max(0, Math.min(1, p.life)), p.mood, p.rot, 500 + i));
    drawGlassOverlay();
    drawAim();
    drawShooter();
    if (current) drawToken(ctx, current.x, current.y, r * 0.985, current.type, 1, 'normal', current.rot || 0, 900 + current.type);
    drawNextUpBadge();
  }

  function drawAim() {
    if (current) return;
    const pts = aimPoints();
    ctx.save();
    ctx.strokeStyle = 'rgba(17,19,24,0.28)';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 8]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(shooter.x, shooter.y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(shooter.x, shooter.y);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.stroke();
    ctx.restore();
  }

  function aimPoints() {
    const r = radius();
    let x = shooter.x, y = shooter.y;
    let vx = Math.cos(aim), vy = Math.sin(aim);
    const pts = [];
    for (let i = 0; i < 2; i++) {
      const targetY = boardTop();
      let tY = vy < 0 ? (targetY - y) / vy : Infinity;
      let wallX = vx < 0 ? r : W - r;
      let tX = (wallX - x) / vx;
      if (tX > 0 && tX < tY) {
        x += vx * tX; y += vy * tX; pts.push({ x, y }); vx *= -1;
      } else {
        x += vx * tY; y += vy * tY; pts.push({ x, y }); break;
      }
    }
    return pts;
  }

  function drawShooter() {
    const r = radius();
    ctx.save();
    ctx.translate(shooter.x, shooter.y + r * 0.02);
    const throatShadow = ctx.createRadialGradient(0, r * 0.08, r * 0.1, 0, r * 0.08, r * 1.4);
    throatShadow.addColorStop(0, 'rgba(0,0,0,0.5)');
    throatShadow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = throatShadow;
    ctx.beginPath();
    ctx.ellipse(0, r * 0.28, r * 1.02, r * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    const launcherMetal = ctx.createLinearGradient(-r * 1.08, -r * 0.42, r * 1.08, r * 0.32);
    launcherMetal.addColorStop(0, '#85827b');
    launcherMetal.addColorStop(0.25, '#f2efe5');
    launcherMetal.addColorStop(0.52, '#aaa59b');
    launcherMetal.addColorStop(0.78, '#ffffff');
    launcherMetal.addColorStop(1, '#746f66');
    ctx.fillStyle = launcherMetal;
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.beginPath();
    roundRectPath(ctx, -r * 1.08, -r * 0.38, r * 2.16, r * 0.74, r * 0.11);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(17,19,24,0.72)';
    ctx.beginPath();
    roundRectPath(ctx, -r * 0.72, -r * 0.08, r * 1.44, r * 0.28, r * 0.08);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.fillRect(-r * 0.86, -r * 0.26, r * 1.72, 1);
    ctx.restore();
    if (!current) drawToken(ctx, shooter.x, shooter.y - r * 0.9, r * 0.86, nextType, 1, 'normal', 0, 950 + nextType);
  }

  function roundRectPath(c, x, y, w, h, rad) {
    const r = Math.min(rad, w / 2, h / 2);
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.quadraticCurveTo(x + w, y, x + w, y + r);
    c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    c.lineTo(x + r, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - r);
    c.lineTo(x, y + r);
    c.quadraticCurveTo(x, y, x + r, y);
  }

  function capsuleCupPath(c, r, seamY, cupBottom) {
    c.moveTo(-r * 0.68, seamY);
    c.lineTo(r * 0.68, seamY);
    c.quadraticCurveTo(r * 0.74, r * 0.52, r * 0.5, cupBottom - r * 0.05);
    c.quadraticCurveTo(0, cupBottom + r * 0.04, -r * 0.5, cupBottom - r * 0.05);
    c.quadraticCurveTo(-r * 0.74, r * 0.52, -r * 0.68, seamY);
    c.closePath();
  }

  function capsuleDomePath(c, r, seamY, wScale, topScale, sideScale) {
    const w = r * (wScale || 0.76);
    const top = -r * (topScale || 0.92);
    const sideY = -r * (sideScale || 0.38);
    c.moveTo(-w, seamY);
    c.lineTo(-w, sideY);
    c.bezierCurveTo(-w, top, w, top, w, sideY);
    c.lineTo(w, seamY);
    c.closePath();
  }

  function drawToken(c, x, y, r, type, alpha, mood, rot, seed) {
    const ci = tokenTypes[type] || 0;
    const gc = GAME_CHARS[ci] || GAME_CHARS[0];
    const n = shapeNoise(seed == null ? type : seed);
    const sx = 1 + n.a * 0.055;
    const sy = 1 + n.b * 0.045;
    const color = CAPSULE_COLORS[type % CAPSULE_COLORS.length] || gc.color || '#e4b65f';
    const domeTop = -r * 1.05;
    const seamY = r * 0.22;
    const cupBottom = r * 0.86;
    c.save();
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.translate(x, y);
    c.rotate((rot || 0) + n.c * 0.035);
    c.scale(sx, sy);

    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath();
    roundRectPath(c, -r * 0.7, seamY + r * 0.12, r * 1.4, r * 0.62, r * 0.22);
    c.fill();

    const cup = c.createLinearGradient(0, seamY, 0, cupBottom);
    cup.addColorStop(0, lightenColor(color, 0.28));
    cup.addColorStop(0.5, color);
    cup.addColorStop(1, darkenColor(color, 0.22));
    c.fillStyle = cup;
    c.strokeStyle = '#111318';
    c.lineWidth = Math.max(1.4, r * 0.045);
    c.beginPath();
    capsuleCupPath(c, r, seamY, cupBottom);
    c.fill();
    c.stroke();

    const dome = c.createRadialGradient(-r * 0.32, domeTop + r * 0.2, r * 0.08, 0, -r * 0.22, r * 1.08);
    dome.addColorStop(0, 'rgba(255,255,255,0.96)');
    dome.addColorStop(0.52, 'rgba(245,243,241,0.68)');
    dome.addColorStop(1, 'rgba(210,206,213,0.38)');
    c.fillStyle = dome;
    c.strokeStyle = 'rgba(17,19,24,0.5)';
    c.lineWidth = Math.max(1.3, r * 0.04);
    c.beginPath();
    capsuleDomePath(c, r, seamY, 0.76, 1.05, 0.5);
    c.fill();
    c.stroke();

    const src = mood === 'happy' ? (gc.imgHappy || gc.img)
      : mood === 'sad' ? (gc.imgSad || gc.img)
        : (gc.img || gc.imgHappy || gc.imgSad || gc.imgWhack);
    const img = src && imgCache.get(src);
    if (img && img.complete && img.naturalWidth) {
      c.save();
      c.beginPath();
      capsuleDomePath(c, r, seamY - r * 0.03, 0.7, 0.98, 0.48);
      c.clip();
      c.globalAlpha *= 0.94;
      const targetW = r * 1.5;
      const targetH = r * 1.58;
      const imageScale = Math.min(targetW / img.naturalWidth, targetH / img.naturalHeight);
      const drawW = img.naturalWidth * imageScale;
      const drawH = img.naturalHeight * imageScale;
      c.drawImage(img, -drawW / 2, -r * 0.98, drawW, drawH);
      c.restore();
    } else {
      c.fillStyle = color || '#111318';
      c.font = `${Math.round(r)}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(gc.emoji || '?', 0, -r * 0.34);
    }

    const rim = c.createLinearGradient(0, seamY - r * 0.16, 0, seamY + r * 0.17);
    rim.addColorStop(0, lightenColor(color, 0.36));
    rim.addColorStop(0.45, color);
    rim.addColorStop(1, darkenColor(color, 0.28));
    c.fillStyle = rim;
    c.strokeStyle = 'rgba(17,19,24,0.55)';
    c.lineWidth = Math.max(1.2, r * 0.038);
    c.beginPath();
    roundRectPath(c, -r * 0.89, seamY - r * 0.17, r * 1.78, r * 0.34, r * 0.07);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.24)';
    c.fillRect(-r * 0.8, seamY - r * 0.11, r * 1.6, r * 0.04);
    c.fillStyle = 'rgba(17,19,24,0.18)';
    c.fillRect(-r * 0.8, seamY + r * 0.07, r * 1.6, r * 0.045);

    c.fillStyle = 'rgba(255,255,255,0.58)';
    c.beginPath(); c.ellipse(-r * 0.34, -r * 0.58, r * 0.28, r * 0.11, -0.55, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.34)';
    c.beginPath(); c.ellipse(r * 0.38, -r * 0.66, r * 0.15, r * 0.07, 0.5, 0, Math.PI * 2); c.fill();
    c.restore();
  }

  function parseHexColor(hex) {
    if (!hex || hex[0] !== '#') return null;
    const raw = hex.length === 4
      ? hex.slice(1).split('').map(ch => ch + ch).join('')
      : hex.slice(1, 7);
    const n = Number.parseInt(raw, 16);
    if (!Number.isFinite(n)) return null;
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function mixColor(hex, target, amount) {
    const c = parseHexColor(hex);
    if (!c) return hex || '#e4b65f';
    const t = target === 'white' ? 255 : 0;
    const mix = v => Math.round(v + (t - v) * amount);
    return `rgb(${mix(c.r)},${mix(c.g)},${mix(c.b)})`;
  }

  function lightenColor(hex, amount) {
    return mixColor(hex, 'white', amount);
  }

  function darkenColor(hex, amount) {
    return mixColor(hex, 'black', amount);
  }

  function shapeNoise(seed) {
    const s = Math.sin((seed + 1) * 12.9898) * 43758.5453;
    const a = (s - Math.floor(s)) * 2 - 1;
    const t = Math.sin((seed + 7) * 78.233) * 19531.177;
    const b = (t - Math.floor(t)) * 2 - 1;
    const u = Math.sin((seed + 19) * 31.719) * 9182.552;
    const c = (u - Math.floor(u)) * 2 - 1;
    return { a, b, c };
  }

  window.snoobStart = function() {
    tokenTypes = playableChars();
    score = 0; shots = 0; drops = 0; rowsAdded = 0;
    current = null; nextType = randType(); aim = -Math.PI / 2;
    resetBoard();
    state = 'playing';
    renderPlaying();
    if (ArcadeMusic && ArcadeMusic.duck) ArcadeMusic.duck();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  };

  window.initSnoob = function() {
    if (!tokenTypes.length) tokenTypes = playableChars();
    state = 'idle';
    cancelAnimationFrame(raf);
    renderIdle();
  };

  window.snoobBack = function() {
    cancelAnimationFrame(raf);
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
    current = null;
  };
})();
