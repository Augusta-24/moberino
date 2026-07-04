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
  let tokenTypes = [];
  let score = 0, shots = 0, drops = 0, rowsAdded = 0;
  let current = null, nextType = 0, shooter = { x: 0, y: 0 };
  let aim = -Math.PI / 2;
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
    return Math.max(radius() * 1.48, 48);
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
    shooter.y = H - cabinetBaseH() - radius() * 0.4;
  }

  function bindCanvas() {
    if (!canvas) return;
    canvas.onpointerdown = handlePointer;
    canvas.onpointermove = handlePointer;
    canvas.onpointerup = shoot;
    resizeHandler = resize;
    window.addEventListener('resize', resizeHandler);
  }

  function handlePointer(e) {
    if (state !== 'playing' || !canvas || current) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const a = Math.atan2(y - shooter.y, x - shooter.x);
    aim = Math.max(-Math.PI + 0.18, Math.min(-0.18, a));
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
    chamber.addColorStop(0, '#f7f7f3');
    chamber.addColorStop(0.5, '#ecebe3');
    chamber.addColorStop(1, '#d8d4c8');
    ctx.fillStyle = chamber;
    ctx.fillRect(0, 0, W, H);
    const topH = cabinetTopH();
    const baseH = cabinetBaseH();
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
    ctx.fillRect(radius() * 0.58, topH + radius() * 0.16, W - radius() * 1.16, H - baseH - topH - radius() * 0.24);
    const frost = ctx.createRadialGradient(W * 0.5, H * 0.24, radius(), W * 0.5, H * 0.35, W * 0.78);
    frost.addColorStop(0, 'rgba(255,255,255,0.46)');
    frost.addColorStop(0.55, 'rgba(255,255,255,0.16)');
    frost.addColorStop(1, 'rgba(120,120,115,0.08)');
    ctx.fillStyle = frost;
    ctx.fillRect(radius() * 0.58, topH + radius() * 0.16, W - radius() * 1.16, H - baseH - topH - radius() * 0.24);
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
    ctx.fillStyle = '#111318';
    ctx.fillRect(0, H - baseH - Math.max(5, r * 0.16), W, Math.max(5, r * 0.16));
    ctx.strokeStyle = 'rgba(17,19,24,0.48)';
    ctx.lineWidth = Math.max(3, r * 0.12);
    ctx.strokeRect(railW * 0.7, topH * 0.2, W - railW * 1.4, H - baseH - topH * 0.22);
  }

  function drawCrankMachineParts(topH, baseH) {
    const r = radius();
    const panelW = Math.min(W * 0.48, r * 5.4);
    const panelH = Math.min(baseH * 0.5, r * 0.82);
    const panelX = W / 2 - panelW / 2;
    const panelY = H - baseH + Math.max(6, baseH * 0.17);
    ctx.save();
    ctx.fillStyle = 'rgba(17,19,24,0.13)';
    ctx.beginPath();
    roundRectPath(ctx, W * 0.14, H - baseH + baseH * 0.12, W * 0.72, baseH * 0.72, r * 0.12);
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
    for (let i = 0; i < 7; i++) {
      const x = panelX + r * 0.26 + i * (panelW - r * 0.52) / 6;
      ctx.beginPath(); ctx.moveTo(x, panelY + r * 0.16); ctx.lineTo(x - r * 0.16, panelY + panelH - r * 0.18); ctx.stroke();
    }
    [[panelX + r * 0.32, panelY + r * 0.32], [panelX + panelW - r * 0.32, panelY + r * 0.32], [panelX + r * 0.32, panelY + panelH - r * 0.32], [panelX + panelW - r * 0.32, panelY + panelH - r * 0.32]].forEach(([x, y]) => {
      ctx.fillStyle = '#4e4b46';
      ctx.beginPath(); ctx.arc(x, y, r * 0.095, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.moveTo(x - r * 0.06, y); ctx.lineTo(x + r * 0.06, y); ctx.stroke();
    });
    const slotX = panelX + panelW * 0.22;
    const slotY = panelY + panelH * 0.34;
    ctx.fillStyle = '#111318';
    ctx.beginPath();
    roundRectPath(ctx, slotX, slotY, panelW * 0.24, r * 0.16, r * 0.05);
    ctx.fill();
    ctx.strokeStyle = '#ebe7dc';
    ctx.lineWidth = 2;
    ctx.stroke();
    const crankX = panelX + panelW * 0.64;
    const crankY = panelY + panelH * 0.47;
    ctx.strokeStyle = '#25231f';
    ctx.lineWidth = Math.max(4, r * 0.16);
    ctx.beginPath();
    ctx.moveTo(crankX, crankY);
    ctx.lineTo(crankX + r * 0.68, crankY + r * 0.34);
    ctx.stroke();
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
    ctx.fillStyle = '#292620';
    ctx.beginPath();
    ctx.arc(crankX, crankY, r * 0.11, 0, Math.PI * 2);
    ctx.fill();
    const handleX = crankX + r * 0.78;
    const handleY = crankY + r * 0.4;
    ctx.fillStyle = '#d8d2c3';
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = Math.max(2, r * 0.07);
    ctx.beginPath();
    ctx.ellipse(handleX, handleY, r * 0.26, r * 0.2, 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const doorX = panelX + panelW * 0.35;
    const doorY = panelY + panelH * 0.68;
    ctx.fillStyle = 'rgba(17,19,24,0.78)';
    ctx.beginPath();
    roundRectPath(ctx, doorX, doorY, panelW * 0.3, r * 0.28, r * 0.08);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    ctx.fillRect(doorX + r * 0.08, doorY + r * 0.06, panelW * 0.3 - r * 0.16, r * 0.05);
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
        drawToken(ctx, p.x, p.y, r * 0.96, type, 1, flashMood(row, col), 0, row * COLS + col);
      }
    }
    fallingPieces.forEach((p, i) => drawToken(ctx, p.x, p.y, r * 0.96, p.type, Math.max(0, Math.min(1, p.life)), p.mood, p.rot, 500 + i));
    drawGlassOverlay();
    drawAim();
    drawShooter();
    if (current) drawToken(ctx, current.x, current.y, r * 0.96, current.type, 1, 'normal', 0, 900 + current.type);
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
    ctx.translate(shooter.x, shooter.y + r * 0.18);
    ctx.fillStyle = '#111318';
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.8);
    ctx.lineTo(-r * 0.92, r * 1.1);
    ctx.lineTo(r * 0.92, r * 1.1);
    ctx.closePath();
    ctx.fill();
    const launcherMetal = ctx.createLinearGradient(-r * 1.05, -r * 0.45, r * 1.05, r * 0.37);
    launcherMetal.addColorStop(0, '#85827b');
    launcherMetal.addColorStop(0.25, '#f2efe5');
    launcherMetal.addColorStop(0.52, '#aaa59b');
    launcherMetal.addColorStop(0.78, '#ffffff');
    launcherMetal.addColorStop(1, '#746f66');
    ctx.fillStyle = launcherMetal;
    ctx.strokeStyle = '#111318';
    ctx.lineWidth = 3;
    ctx.beginPath();
    roundRectPath(ctx, -r * 1.05, -r * 0.45, r * 2.1, r * 0.82, 6);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    if (!current) drawToken(ctx, shooter.x, shooter.y - r * 1.05, r * 0.82, nextType, 1, 'normal', 0, 950 + nextType);
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
      capsuleDomePath(c, r, seamY + r * 0.32, 0.72, 0.98, 0.48);
      c.clip();
      c.globalAlpha *= 0.92;
      const targetW = r * 1.58;
      const targetH = r * 1.68;
      const imageScale = Math.min(targetW / img.naturalWidth, targetH / img.naturalHeight);
      const drawW = img.naturalWidth * imageScale;
      const drawH = img.naturalHeight * imageScale;
      c.drawImage(img, -drawW / 2, -r * 1.0, drawW, drawH);
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
    roundRectPath(c, -r * 0.92, seamY - r * 0.17, r * 1.84, r * 0.34, r * 0.07);
    c.fill();
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.24)';
    c.fillRect(-r * 0.82, seamY - r * 0.11, r * 1.64, r * 0.04);
    c.fillStyle = 'rgba(17,19,24,0.18)';
    c.fillRect(-r * 0.82, seamY + r * 0.07, r * 1.64, r * 0.045);

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
