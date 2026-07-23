// ══════════════════════════════════════
//  SNOOB — retro sticker shooter
// ══════════════════════════════════════
(function() {
  const COLS = 7;
  const START_ROWS = 6;
  const MAX_ROWS = 12;
  const TYPES = 6;
  const BOARD_KEY = 'snoob';
  const COLOR = '#e4b65f';
  const CAPSULE_COLORS = ['#ff1f3f', '#ff6f00', '#ffe000', '#10b84a', '#00a8ff', '#7b35d8', '#ff2aa3', '#1d3cff'];
  const SNOOB_SHAPES = ['round', 'oval', 'square', 'triangle', 'block', 'spiky'];
  const SNOOB_SOUND_FILES = {
    fire: 'snoob/FIRE.WAV',
    miss: 'snoob/MISS.WAV',
    match: 'snoob/TRANSPRT.WAV',
    over: 'snoob/WEDIED.WAV',
    fanfare1: 'snoob/FANFARE.WAV',
    fanfare2: 'snoob/FANFARE2.WAV',
    please: 'snoob/PLEASE.WAV',
    whoosh: 'snoob/WHOOSH.WAV',
  };

  let state = 'idle'; // idle | playing | over
  let mode = 'endless'; // 'endless' | 'journey'
  let journeyN = 0, journeyPar = 0, journeyColors = 0;
  let canvas = null, ctx = null, wrap = null;
  let W = 0, H = 0, dpr = 1;
  let board = [];
  let pieceVisuals = [];
  let fallingPieces = [];
  let faceFlashes = [];
  let rattles = [];
  let dustMotes = [];
  let tokenTypes = [];
  let score = 0, shots = 0, drops = 0, rowsAdded = 0, missStreak = 0, wave = 1;
  let current = null, currentType = 0, nextType = 0, shooter = { x: 0, y: 0 };
  let aim = -Math.PI / 2;
  let aimArmed = false;
  let pendingAimTouch = null;
  let journeyClearPending = false, journeyClearStars = 0;
  let rowPhase = 0;
  let crankSpin = 0;
  let raf = 0, last = 0, resizeHandler = null;
  let imagesReady = false;
  const imgCache = new Map();
  const imageBoundsCache = new WeakMap();
  const soundCache = new Map();
  const REAIM_HOLD_MS = 220;
  const TOUCH_AIM_BLEND = 0.42;

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

  function imageContentBounds(img) {
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;
    if (imageBoundsCache.has(img)) return imageBoundsCache.get(img);
    const probeSize = 96;
    const probe = document.createElement('canvas');
    probe.width = probeSize;
    probe.height = probeSize;
    const pctx = probe.getContext('2d', { willReadFrequently: true });
    let bounds = { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
    try {
      pctx.clearRect(0, 0, probeSize, probeSize);
      pctx.drawImage(img, 0, 0, probeSize, probeSize);
      const data = pctx.getImageData(0, 0, probeSize, probeSize).data;
      let minX = probeSize, minY = probeSize, maxX = -1, maxY = -1;
      for (let y = 0; y < probeSize; y++) {
        for (let x = 0; x < probeSize; x++) {
          if (data[(y * probeSize + x) * 4 + 3] <= 8) continue;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      if (maxX >= minX && maxY >= minY) {
        const pad = 9;
        minX = Math.max(0, minX - pad);
        minY = Math.max(0, minY - pad);
        maxX = Math.min(probeSize - 1, maxX + pad);
        maxY = Math.min(probeSize - 1, maxY + pad);
        bounds = {
          x: minX / probeSize * img.naturalWidth,
          y: minY / probeSize * img.naturalHeight,
          w: (maxX - minX + 1) / probeSize * img.naturalWidth,
          h: (maxY - minY + 1) / probeSize * img.naturalHeight,
        };
      }
    } catch(e) {}
    imageBoundsCache.set(img, bounds);
    return bounds;
  }

  function randType() {
    return Math.floor(Math.random() * Math.max(1, tokenTypes.length));
  }

  function pickType(types) {
    return types[Math.floor(Math.random() * types.length)];
  }

  function boardTypeList() {
    const found = new Set();
    for (const row of board) {
      for (const type of row) {
        if (type != null) found.add(type);
      }
    }
    return [...found];
  }

  function randQueuedType() {
    const remaining = boardTypeList();
    return remaining.length ? pickType(remaining) : randType();
  }

  function syncQueuedTypesToBoard() {
    const remaining = boardTypeList();
    if (!remaining.length) return;
    if (!remaining.includes(currentType)) currentType = pickType(remaining);
    if (!remaining.includes(nextType)) nextType = pickType(remaining);
  }

  function rowOffset(row) {
    return (row + rowPhase) % 2 ? 0.5 : 0;
  }

  function radius() {
    const cap = W >= 900 ? 58 : W >= 640 ? 48 : 34;
    return Math.min(W / (COLS + 0.1) / 2, H / 14.25, cap);
  }

  function boardTop() {
    return cabinetTopH() + radius() * 0.32;
  }

  function cabinetTopH() {
    return Math.max(26, radius() * 0.68);
  }

  function cabinetBaseH() {
    return Math.max(radius() * 1.7, 58);
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
    while (pieceVisuals.length < n) pieceVisuals.push(Array(COLS).fill(null));
  }

  function makePieceVisual(seed) {
    const n = shapeNoise(seed);
    let rot = n.c * 0.1;
    if (Math.abs(n.b) > 0.68) rot += n.b > 0 ? 0.24 : -0.24;
    return { rot };
  }

  function resetBoard(rows) {
    board = [];
    pieceVisuals = [];
    rowPhase = 0;
    fallingPieces = [];
    faceFlashes = [];
    rattles = [];
    ensureBoardRows(MAX_ROWS);
    const startRows = rows || START_ROWS;
    for (let r = 0; r < startRows; r++) {
      for (let c = 0; c < COLS; c++) {
        if (r === startRows - 1 && (c === 0 || c === COLS - 1)) continue;
        board[r][c] = randType();
        pieceVisuals[r][c] = makePieceVisual(r * COLS + c + 17);
      }
    }
  }

  function renderPlaying() {
    const host = document.getElementById('snoob-wrap');
    if (!host) return;
    host.classList.remove('mode-select-layout');
    document.body.classList.remove('arcade-selection-open');
    setArcadeExitVisible(true);
    setArcadeModeSelect(false);
    host.innerHTML = `
      <div class="snoob-shell">
        <div class="snoob-hud">
          <div><div class="snoob-stat-label" id="snoob-l-label">SCORE</div><div class="snoob-stat-value" id="snoob-score">0</div></div>
          <div class="snoob-aim-stack">
            <div class="snoob-aim-switch" id="snoob-aim-switch" aria-live="polite">
              <span>AIM</span><i></i><span>SHOOT</span>
            </div>
          </div>
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
    setArcadeModeSelect(false);
    host.innerHTML = buildArcadeResultCard({
      uid: 'snoob',
      boardKey: BOARD_KEY,
      artGame: 'snoob',
      color: COLOR,
      marquee: 'GAME OVER',
      marqueeEnd: '#5b6f9a',
      scoreLabel: 'YOUR SCORE',
      scoreValue: score,
      saveValue: score,
      field: 'score',
      extra: `WAVE ${wave} · ${shots} SHOTS · ${drops} DROPS`,
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
    const ll = document.getElementById('snoob-l-label');
    if (mode === 'journey') {
      if (ll) ll.textContent = 'LEVEL';
      if (s) s.textContent = journeyN;
      if (sh) sh.textContent = `${shots}/${journeyPar}`;
    } else {
      if (ll) ll.textContent = 'SCORE';
      if (s) s.textContent = score;
      if (sh) sh.textContent = shots;
    }
    const aimSwitch = document.getElementById('snoob-aim-switch');
    if (aimSwitch) {
      aimSwitch.classList.toggle('is-shoot', aimArmed);
      aimSwitch.setAttribute('aria-label', aimArmed ? 'Shoot armed' : 'Aim mode');
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
    canvas.onpointerup = handlePointerUp;
    canvas.onpointercancel = clearPendingAimTouch;
    canvas.onselectstart = e => e.preventDefault();
    canvas.oncontextmenu = e => e.preventDefault();
    window.onkeydown = handleKeyDown;
    resizeHandler = resize;
    window.addEventListener('resize', resizeHandler);
  }

  function updateAimFromPoint(clientX, clientY, smooth) {
    if (state !== 'playing' || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const a = Math.atan2(y - shooter.y, x - shooter.x);
    const target = Math.max(-Math.PI + 0.18, Math.min(-0.18, a));
    aim = smooth ? aim + (target - aim) * TOUCH_AIM_BLEND : target;
  }

  function updateAimFromEvent(e, smooth) {
    updateAimFromPoint(e.clientX, e.clientY, smooth);
  }

  function clearPendingAimTouch() {
    if (pendingAimTouch && pendingAimTouch.timer) clearTimeout(pendingAimTouch.timer);
    pendingAimTouch = null;
  }

  function isMousePointer(e) {
    return e.pointerType === 'mouse';
  }

  function handlePointer(e) {
    if (state !== 'playing' || !canvas || current || journeyClearPending) return;
    if (pendingAimTouch) {
      pendingAimTouch.clientX = e.clientX;
      pendingAimTouch.clientY = e.clientY;
      if (pendingAimTouch.reaiming) updateAimFromEvent(e, !isMousePointer(e));
      return;
    }
    updateAimFromEvent(e, !isMousePointer(e));
  }

  function handlePointerDown(e) {
    if (state !== 'playing' || !canvas || current || journeyClearPending) return;
    if (e.preventDefault) e.preventDefault();
    if (canvas.setPointerCapture && e.pointerId != null) {
      try { canvas.setPointerCapture(e.pointerId); } catch(err) {}
    }
    if (isMousePointer(e)) {
      clearPendingAimTouch();
      updateAimFromEvent(e, false);
      shoot();
      return;
    }
    if (aimArmed) {
      clearPendingAimTouch();
      pendingAimTouch = {
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        reaiming: false,
        timer: setTimeout(() => {
          if (!pendingAimTouch || pendingAimTouch.pointerId !== e.pointerId) return;
          pendingAimTouch.reaiming = true;
          updateAimFromPoint(pendingAimTouch.clientX, pendingAimTouch.clientY, true);
        }, REAIM_HOLD_MS),
      };
      return;
    }
    updateAimFromEvent(e, false);
    aimArmed = true;
    updateHud();
  }

  function handlePointerUp(e) {
    if (state !== 'playing' || journeyClearPending || !pendingAimTouch) return;
    const wasReaiming = pendingAimTouch.reaiming;
    clearPendingAimTouch();
    if (!wasReaiming && !current) shoot();
  }

  function handleKeyDown(e) {
    if (state !== 'playing' || journeyClearPending) return;
    if (e.code === 'Space' || e.code === 'Enter') {
      e.preventDefault();
      shoot();
    }
  }

  function shoot() {
    if (state !== 'playing' || current || journeyClearPending) return;
    clearPendingAimTouch();
    const speed = 720;
    current = {
      x: shooter.x,
      y: shooter.y,
      vx: Math.cos(aim) * speed,
      vy: Math.sin(aim) * speed,
      type: currentType,
      visual: makePieceVisual(shots * 43 + currentType * 19 + 5),
    };
    currentType = nextType;
    nextType = randQueuedType();
    aimArmed = false;
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
    updateDustMotes(dt);
    if (crankSpin > 0) crankSpin = Math.max(0, crankSpin - dt);
    if (journeyClearPending) {
      if (!fallingPieces.length && !dustMotes.length) finishJourneyClear();
      return;
    }
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

  // A little gold pixie dust wherever a chain connects — one small burst per
  // matched capsule so the whole cleared shape twinkles, not just one point.
  function spawnPixieDust(x, y) {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const speed = 18 + Math.random() * 46;
      dustMotes.push({
        x, y,
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed - 24,
        size: 1.4 + Math.random() * 2.2,
        life: 0.5 + Math.random() * 0.4,
        maxLife: 0.9,
        twinkle: Math.random() * Math.PI * 2,
        color: Math.random() < 0.6 ? '#ffe38a' : '#fff4d6',
      });
    }
  }

  function updateDustMotes(dt) {
    if (!dustMotes.length) return;
    dustMotes.forEach(m => {
      m.vy += 40 * dt;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.life -= dt;
      m.twinkle += dt * 9;
    });
    dustMotes = dustMotes.filter(m => m.life > 0);
  }

  function drawDustMotes() {
    if (!dustMotes.length) return;
    ctx.save();
    dustMotes.forEach(m => {
      const t = Math.max(0, m.life / m.maxLife);
      const twinkle = 0.5 + 0.5 * Math.sin(m.twinkle);
      ctx.globalAlpha = t * (0.4 + twinkle * 0.6);
      ctx.fillStyle = m.color;
      ctx.shadowColor = m.color;
      ctx.shadowBlur = m.size * 3;
      const s = m.size * (0.6 + twinkle * 0.5);
      ctx.beginPath();
      ctx.moveTo(m.x, m.y - s);
      ctx.lineTo(m.x + s * 0.35, m.y - s * 0.35);
      ctx.lineTo(m.x + s, m.y);
      ctx.lineTo(m.x + s * 0.35, m.y + s * 0.35);
      ctx.lineTo(m.x, m.y + s);
      ctx.lineTo(m.x - s * 0.35, m.y + s * 0.35);
      ctx.lineTo(m.x - s, m.y);
      ctx.lineTo(m.x - s * 0.35, m.y - s * 0.35);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();
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
    const baseRot = (pieceVisuals[row] && pieceVisuals[row][col] && pieceVisuals[row][col].rot) || 0;
    const rattle = rattleAt(row, col);
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
    const hitDist = r * 1.56;
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
        const attached = row === 0 || neighbors(row, col).some(n => board[n.row] && board[n.row][n.col] != null);
        if (!attached) continue;
        const p = cellPos(row, col);
        const d = Math.hypot(x - p.x, y - p.y);
        if (d < bestD) { bestD = d; best = { row, col }; }
      }
    }
    return best;
  }

  function endSnoobGame() {
    if (state !== 'playing') return;
    current = null;
    clearPendingAimTouch();
    state = 'over';
    playSnoobSound('over');
    if (mode === 'journey') setTimeout(() => renderJourneyResult(false, 0), 500);
    else setTimeout(renderOver, 500);
  }

  function snapCurrent() {
    if (!current) return;
    const target = nearestCell(current.x, current.y);
    if (!target) {
      endSnoobGame();
      return;
    }
    board[target.row][target.col] = current.type;
    pieceVisuals[target.row][target.col] = current.visual || makePieceVisual(shots * 37 + target.row * 11 + target.col);
    const snapped = target;
    current = null;
    triggerRattle(snapped.row, snapped.col);
    const cleared = clearMatches(snapped.row, snapped.col);
    if (cleared > 0) {
      missStreak = 0;
      const fallen = dropDisconnected();
      score += cleared * 100 + fallen * 150;
      drops += fallen;
      showToast(fallen ? `DROP +${fallen}` : `MATCH +${cleared}`);
      playSnoobSound('match');
      if (fallen > 0) playSnoobSound('fanfare1');
      else if (Math.random() < 0.16) playSnoobSound('please');
    } else {
      missStreak++;
      playSnoobSound('miss');
      if (missStreak >= 5) {
        missStreak = 0;
        playSnoobSound('whoosh');
        if (!addRow()) return;
      }
    }
    syncQueuedTypesToBoard();
    updateHud();
    if (boardCleared()) {
      if (mode === 'journey') {
        const stars = journeyStars();
        beginJourneyClear(stars);
      } else {
        // Endless: clearing the board starts the next wave instead of ending
        // the run — only the danger line or a full stack actually ends it.
        score += 1000 + Math.max(0, 40 - shots) * 25;
        wave++;
        missStreak = 0;
        showToast(`WAVE ${wave}`);
        playSnoobWin();
        resetBoard(Math.min(MAX_ROWS - 4, START_ROWS + Math.floor((wave - 1) / 2)));
        currentType = randQueuedType();
        nextType = randQueuedType();
        updateHud();
      }
    } else if (isDanger()) {
      endSnoobGame();
    }
  }

  function journeyStars() {
    const par = journeyPar || 999;
    if (shots <= par) return 3;
    if (shots <= Math.ceil(par * 1.5)) return 2;
    return 1;
  }

  function beginJourneyClear(stars) {
    journeyClearPending = true;
    journeyClearStars = stars;
    aimArmed = false;
    clearPendingAimTouch();
    jRecord(journeyN, stars);
    jSync();
    showToast('BOARD CLEAR');
    playSnoobWin();
  }

  function finishJourneyClear() {
    if (!journeyClearPending) return;
    journeyClearPending = false;
    state = 'over';
    renderJourneyResult(true, journeyClearStars);
  }

  function neighbors(row, col) {
    const odd = (row + rowPhase) % 2 === 1;
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
      spawnPixieDust(pos.x, pos.y);
      board[p.row][p.col] = null;
      if (pieceVisuals[p.row]) pieceVisuals[p.row][p.col] = null;
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
          if (pieceVisuals[r]) pieceVisuals[r][c] = null;
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
    if (board[MAX_ROWS - 1] && board[MAX_ROWS - 1].some(v => v != null)) {
      endSnoobGame();
      return false;
    }
    board.pop();
    pieceVisuals.pop();
    const rowSeed = rowsAdded * 101 + shots * 13 + 29;
    rowPhase = (rowPhase + 1) % 2;
    // Journey keeps new rows inside the level's palette so a stalled board never
    // gains an off-palette color the shooter can't clear.
    const rowType = () => (mode === 'journey' && journeyColors)
      ? Math.floor(Math.random() * journeyColors) : randType();
    board.unshift(Array.from({ length: COLS }, rowType));
    pieceVisuals.unshift(Array.from({ length: COLS }, (_, i) => makePieceVisual(rowSeed + i * 17)));
    rowsAdded++;
    showToast('ROW DOWN');
    return true;
  }

  function boardCleared() {
    return board.every(row => row.every(v => v == null));
  }

  function isDanger() {
    const dangerY = shooter.y - radius() * 1.45;
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
    chamber.addColorStop(0, '#252a3e');
    chamber.addColorStop(0.48, '#171a29');
    chamber.addColorStop(1, '#0a0b14');
    ctx.fillStyle = chamber;
    ctx.fillRect(0, 0, W, H);
    const topH = cabinetTopH();
    const baseH = cabinetBaseH();
    const chamberX = 0;
    const chamberY = topH;
    const chamberW = W;
    const chamberH = H - baseH - topH;
    const topPanel = ctx.createLinearGradient(0, 0, 0, topH);
    topPanel.addColorStop(0, '#1b1f30');
    topPanel.addColorStop(1, '#0d0f1a');
    ctx.fillStyle = topPanel;
    ctx.fillRect(0, 0, W, topH);
    const basePanel = ctx.createLinearGradient(0, H - baseH, 0, H);
    basePanel.addColorStop(0, '#161a2a');
    basePanel.addColorStop(1, '#0a0b14');
    ctx.fillStyle = basePanel;
    ctx.fillRect(0, H - baseH, W, baseH);
    drawFrostedWallpaper(chamberX, chamberY, chamberW, chamberH);
    const frost = ctx.createRadialGradient(W * 0.5, H * 0.34, radius(), W * 0.5, H * 0.42, W * 0.72);
    frost.addColorStop(0, 'rgba(140,165,255,0.10)');
    frost.addColorStop(0.45, 'rgba(140,165,255,0.04)');
    frost.addColorStop(1, 'rgba(0,0,0,0.30)');
    ctx.fillStyle = frost;
    ctx.fillRect(chamberX, chamberY, chamberW, chamberH);
    const edgeFog = ctx.createLinearGradient(chamberX, 0, chamberX + chamberW, 0);
    edgeFog.addColorStop(0, 'rgba(0,0,2,0.42)');
    edgeFog.addColorStop(0.18, 'rgba(0,0,0,0)');
    edgeFog.addColorStop(0.82, 'rgba(0,0,0,0)');
    edgeFog.addColorStop(1, 'rgba(0,0,2,0.40)');
    ctx.fillStyle = edgeFog;
    ctx.fillRect(chamberX, chamberY, chamberW, chamberH);
    drawChamberWear(chamberX, chamberY, chamberW, chamberH);
    drawCabinetFrame(topH, baseH);
    drawCrankMachineParts(topH, baseH);
  }

  function drawFrostedWallpaper(x, y, w, h) {
    const r = radius();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = 'rgba(228,182,95,0.7)';
    ctx.fillStyle = 'rgba(228,182,95,0.22)';
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
    ctx.globalAlpha = 0.34;
    const cloudy = ctx.createLinearGradient(x, y, x + w, y + h);
    cloudy.addColorStop(0, 'rgba(255,0,204,0.05)');
    cloudy.addColorStop(0.5, 'rgba(140,165,255,0.05)');
    cloudy.addColorStop(1, 'rgba(0,0,0,0.20)');
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
    ctx.globalAlpha = 0.20;
    for (let i = 0; i < 14; i++) {
      const px = x + ((i * 47) % Math.max(1, w));
      const py = y + ((i * 83) % Math.max(1, h));
      const spot = ctx.createRadialGradient(px, py, r * 0.08, px, py, r * (0.8 + (i % 3) * 0.22));
      spot.addColorStop(0, i % 2 ? 'rgba(0,0,0,0.22)' : 'rgba(160,180,255,0.10)');
      spot.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = spot;
      ctx.fillRect(px - r * 1.4, py - r * 1.4, r * 2.8, r * 2.8);
    }
    ctx.globalAlpha = 0.20;
    ctx.strokeStyle = 'rgba(200,215,255,0.22)';
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

  function drawCabinetFrame(topH, baseH) {
    const r = radius();
    const railW = Math.max(8, r * 0.2);
    // Thin neon-edged side rails instead of brushed-aluminum trim.
    ctx.save();
    [0, W - railW].forEach(x => {
      ctx.fillStyle = '#0a0b14';
      ctx.fillRect(x, 0, railW, H);
      ctx.strokeStyle = 'rgba(228,182,95,0.55)';
      ctx.shadowColor = 'rgba(228,182,95,0.6)';
      ctx.shadowBlur = r * 0.16;
      ctx.lineWidth = Math.max(1, r * 0.03);
      ctx.beginPath();
      const lineX = x === 0 ? x + railW : x;
      ctx.moveTo(lineX, topH * 0.5);
      ctx.lineTo(lineX, H - baseH * 0.5);
      ctx.stroke();
    });
    ctx.restore();
    // A slim glowing accent line under the top panel and above the base panel,
    // in place of the old glossy-plastic bevel stack.
    ctx.save();
    ctx.strokeStyle = 'rgba(228,182,95,0.7)';
    ctx.shadowColor = 'rgba(228,182,95,0.55)';
    ctx.shadowBlur = r * 0.2;
    ctx.lineWidth = Math.max(1.5, r * 0.035);
    ctx.beginPath();
    ctx.moveTo(railW, topH);
    ctx.lineTo(W - railW, topH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(railW, H - baseH);
    ctx.lineTo(W - railW, H - baseH);
    ctx.stroke();
    ctx.restore();
  }

  function drawCrankMachineParts(topH, baseH) {
    const r = radius();
    const panelW = Math.min(W * 0.64, r * 7.2);
    const panelH = Math.min(baseH * 0.72, r * 1.5);
    const panelX = W * 0.07;
    const panelY = H - baseH + (baseH - panelH) / 2;
    ctx.save();
    // Flat instrument console — dark panel, thin neon border, no chrome/screws.
    ctx.fillStyle = '#12141f';
    ctx.beginPath();
    roundRectPath(ctx, panelX, panelY, panelW, panelH, r * 0.16);
    ctx.fill();
    ctx.strokeStyle = 'rgba(228,182,95,0.55)';
    ctx.shadowColor = 'rgba(228,182,95,0.5)';
    ctx.shadowBlur = r * 0.14;
    ctx.lineWidth = Math.max(1.5, r * 0.04);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // LED status row, standing in for the old coin slot.
    const ledColors = ['#e4b65f', '#00e5ff', '#ff2aa3'];
    const ledY = panelY + panelH * 0.32;
    for (let i = 0; i < 3; i++) {
      const lx = panelX + r * 0.32 + i * r * 0.34;
      ctx.fillStyle = ledColors[i];
      ctx.shadowColor = ledColors[i];
      ctx.shadowBlur = r * 0.22;
      ctx.beginPath();
      ctx.arc(lx, ledY, r * 0.075, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(228,182,95,0.28)';
    ctx.lineWidth = Math.max(1, r * 0.02);
    ctx.beginPath();
    ctx.moveTo(panelX + r * 0.22, panelY + panelH * 0.62);
    ctx.lineTo(panelX + panelW * 0.32, panelY + panelH * 0.62);
    ctx.stroke();

    // Loading throat — dark socket with a thin neon ring instead of a metal chute.
    const throatW = r * 1.55;
    const throatH = Math.max(10, r * 0.34);
    const throatX = shooter.x - throatW / 2;
    const throatY = panelY + panelH * 0.16;
    ctx.fillStyle = '#0a0b14';
    ctx.strokeStyle = 'rgba(228,182,95,0.5)';
    ctx.shadowColor = 'rgba(228,182,95,0.4)';
    ctx.shadowBlur = r * 0.12;
    ctx.lineWidth = Math.max(1.5, r * 0.04);
    ctx.beginPath();
    roundRectPath(ctx, throatX, throatY, throatW, throatH, r * 0.1);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Neon lever — a glowing shaft + tip that swings with aim, replacing the chrome crank.
    const crankX = panelX + panelW * 0.78;
    const crankY = panelY + panelH * 0.56;
    const dialR = r * 0.4;
    const dial = ctx.createRadialGradient(crankX, crankY, dialR * 0.2, crankX, crankY, dialR);
    dial.addColorStop(0, 'rgba(228,182,95,0.14)');
    dial.addColorStop(1, 'rgba(228,182,95,0)');
    ctx.fillStyle = dial;
    ctx.beginPath();
    ctx.arc(crankX, crankY, dialR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(228,182,95,0.4)';
    ctx.lineWidth = Math.max(1, r * 0.025);
    ctx.beginPath();
    ctx.arc(crankX, crankY, dialR, 0, Math.PI * 2);
    ctx.stroke();

    const spin = crankSpin > 0 ? (1 - crankSpin / 0.38) * Math.PI * 2.2 : 0;
    const crankAngle = aim + Math.PI / 2 + spin + Math.sin(crankSpin * 42) * crankSpin * 0.6;
    ctx.save();
    ctx.translate(crankX, crankY);
    ctx.rotate(crankAngle);
    ctx.strokeStyle = '#e4b65f';
    ctx.shadowColor = '#e4b65f';
    ctx.shadowBlur = r * 0.24;
    ctx.lineWidth = Math.max(2.5, r * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(r * 0.68, 0);
    ctx.stroke();
    const tip = ctx.createRadialGradient(r * 0.78, 0, r * 0.02, r * 0.78, 0, r * 0.2);
    tip.addColorStop(0, '#fff6df');
    tip.addColorStop(1, '#e4b65f');
    ctx.fillStyle = tip;
    ctx.beginPath();
    ctx.arc(r * 0.78, 0, r * 0.16, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e4b65f';
    ctx.beginPath();
    ctx.arc(crankX, crankY, r * 0.06, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.ellipse(x + w * 0.78, y + h * 0.17, r * 0.42, r * 0.08, -0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.05, y + r * 0.1);
    ctx.lineTo(x + w * 0.95, y + r * 0.1);
    ctx.stroke();
    // Neon room-light streaks reflected in the glass.
    const sheenP = ctx.createLinearGradient(x + w * 0.06, y, x + w * 0.3, y + h);
    sheenP.addColorStop(0, 'rgba(255,0,204,0.055)');
    sheenP.addColorStop(0.5, 'rgba(255,0,204,0)');
    ctx.fillStyle = sheenP;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.02, y);
    ctx.lineTo(x + w * 0.16, y);
    ctx.lineTo(x + w * 0.30, y + h);
    ctx.lineTo(x + w * 0.10, y + h);
    ctx.closePath();
    ctx.fill();
    const sheenB = ctx.createLinearGradient(x + w * 0.68, y, x + w * 0.9, y + h);
    sheenB.addColorStop(0, 'rgba(140,200,255,0.05)');
    sheenB.addColorStop(0.55, 'rgba(140,200,255,0)');
    ctx.fillStyle = sheenB;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.66, y);
    ctx.lineTo(x + w * 0.74, y);
    ctx.lineTo(x + w * 0.9, y + h);
    ctx.lineTo(x + w * 0.78, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    if (!ctx) return;
    drawBackground();
    const r = radius();
    const dangerY = shooter.y - r * 1.6;
    // Always-visible fail line, etched into the glass; heats up as the stack closes in.
    let lowY = -Infinity;
    for (let row = 0; row < board.length; row++) {
      for (let col = 0; col < COLS; col++) {
        if (board[row][col] != null) lowY = Math.max(lowY, cellPos(row, col).y);
      }
    }
    const close = lowY > dangerY - r * 3.2;
    ctx.save();
    ctx.setLineDash([8, 7]);
    if (close) {
      const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 170);
      ctx.strokeStyle = `rgba(255,64,64,${(0.35 + pulse * 0.5).toFixed(3)})`;
      ctx.shadowColor = 'rgba(255,64,64,0.8)';
      ctx.shadowBlur = 6 + pulse * 6;
      ctx.lineWidth = 2;
    } else {
      ctx.strokeStyle = 'rgba(228,182,95,0.20)';
      ctx.lineWidth = 1.5;
    }
    ctx.beginPath(); ctx.moveTo(r * 0.8, dangerY); ctx.lineTo(W - r * 0.8, dangerY); ctx.stroke();
    ctx.restore();

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
    drawDustMotes();
    drawGlassOverlay();
    drawAim();
    drawShooter();
    if (current) drawToken(ctx, current.x, current.y, r * 0.985, current.type, 1, 'normal', (current.visual && current.visual.rot) || 0, 900 + current.type);
    drawNextUpBadge();
  }

  // Journey opens with the full guide, then drops to the short stub from
  // level 5 on and stays there through the end — one step down, not a ramp
  // to nothing. Endless keeps the full guide throughout.
  function aimAssistTier() {
    if (mode !== 'journey') return 'full';
    return journeyN <= 4 ? 'full' : 'short';
  }

  function drawAim() {
    if (current) return;
    const tier = aimAssistTier();
    const path = predictLanding();
    const color = CAPSULE_COLORS[currentType % CAPSULE_COLORS.length] || '#e4b65f';
    const armed = aimArmed;
    ctx.save();
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.globalAlpha = armed ? 0.72 : 0.4;
    ctx.lineWidth = armed ? 1.8 : 1.2;
    ctx.setLineDash(armed ? [10, 7] : [3, 9]);
    ctx.shadowColor = color;
    ctx.shadowBlur = armed ? 6 : 2;
    ctx.beginPath();
    ctx.moveTo(shooter.x, shooter.y);
    if (tier === 'full') {
      path.pts.forEach(p => ctx.lineTo(p.x, p.y));
    } else {
      // 'short': trim the guide to a fixed distance and never reveal the
      // landing point, so the player still gets a sightline but has to
      // judge the rest of the shot themselves.
      const maxLen = radius() * 5.5;
      let travelled = 0;
      let lastX = shooter.x, lastY = shooter.y;
      for (const p of path.pts) {
        const segLen = Math.hypot(p.x - lastX, p.y - lastY);
        if (travelled + segLen > maxLen) {
          const t = (maxLen - travelled) / segLen;
          ctx.lineTo(lastX + (p.x - lastX) * t, lastY + (p.y - lastY) * t);
          break;
        }
        ctx.lineTo(p.x, p.y);
        travelled += segLen;
        lastX = p.x; lastY = p.y;
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  // Step the shot forward (same wall bounce + hit rules as update) so the
  // guide shows the true path and where the capsule will actually stick.
  function predictLanding() {
    const r = radius();
    let x = shooter.x, y = shooter.y;
    let vx = Math.cos(aim), vy = Math.sin(aim);
    const step = r * 0.22;
    const pts = [];
    for (let i = 0; i < 600; i++) {
      x += vx * step;
      y += vy * step;
      if (x < r) { x = r; vx = Math.abs(vx); pts.push({ x, y }); }
      if (x > W - r) { x = W - r; vx = -Math.abs(vx); pts.push({ x, y }); }
      if (y <= boardTop() + r * 0.2 || collides(x, y, r)) {
        pts.push({ x, y });
        return { pts, cell: nearestCell(x, y) };
      }
    }
    pts.push({ x, y });
    return { pts, cell: null };
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
    // Flat neon launcher — dark body, thin glowing gold edge — matches the console below.
    ctx.fillStyle = '#12141f';
    ctx.strokeStyle = 'rgba(228,182,95,0.6)';
    ctx.shadowColor = 'rgba(228,182,95,0.5)';
    ctx.shadowBlur = r * 0.16;
    ctx.lineWidth = Math.max(1.5, r * 0.045);
    ctx.beginPath();
    roundRectPath(ctx, -r * 1.08, -r * 0.38, r * 2.16, r * 0.74, r * 0.14);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(228,182,95,0.14)';
    ctx.beginPath();
    roundRectPath(ctx, -r * 0.72, -r * 0.08, r * 1.44, r * 0.28, r * 0.08);
    ctx.fill();
    ctx.restore();
    if (!current) drawToken(ctx, shooter.x, shooter.y - r * 0.9, r * 0.86, currentType, 1, 'normal', 0, 950 + currentType);
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

  function tokenShapePath(c, shape, r) {
    if (shape === 'square') {
      roundRectPath(c, -r * 0.68, -r * 0.68, r * 1.36, r * 1.36, r * 0.16);
    } else if (shape === 'block') {
      roundRectPath(c, -r * 0.7, -r * 0.62, r * 1.4, r * 1.24, r * 0.08);
    } else if (shape === 'triangle') {
      c.moveTo(0, -r * 0.78);
      c.lineTo(r * 0.76, r * 0.66);
      c.lineTo(-r * 0.76, r * 0.66);
      c.closePath();
    } else if (shape === 'oval') {
      c.ellipse(0, 0, r * 0.64, r * 0.76, 0, 0, Math.PI * 2);
    } else if (shape === 'spiky') {
      for (let i = 0; i < 22; i++) {
        const a = -Math.PI / 2 + i * Math.PI * 2 / 22;
        const rad = i % 2 ? r * 0.62 : r * 0.78;
        const px = Math.cos(a) * rad;
        const py = Math.sin(a) * rad;
        if (i === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
    } else {
      c.ellipse(0, 0, r * 0.72, r * 0.72, 0, 0, Math.PI * 2);
    }
  }

  function tokenShapeBounds(shape, r) {
    if (shape === 'triangle') return { x: -r * 0.76, y: -r * 0.78, w: r * 1.52, h: r * 1.44 };
    if (shape === 'oval') return { x: -r * 0.64, y: -r * 0.76, w: r * 1.28, h: r * 1.52 };
    if (shape === 'square') return { x: -r * 0.68, y: -r * 0.68, w: r * 1.36, h: r * 1.36 };
    if (shape === 'block') return { x: -r * 0.7, y: -r * 0.62, w: r * 1.4, h: r * 1.24 };
    if (shape === 'spiky') return { x: -r * 0.78, y: -r * 0.78, w: r * 1.56, h: r * 1.56 };
    return { x: -r * 0.72, y: -r * 0.72, w: r * 1.44, h: r * 1.44 };
  }

  function drawShapePath(c, shape, r) {
    c.beginPath();
    tokenShapePath(c, shape, r);
    c.closePath();
  }

  function capsuleDomePath(c, r) {
    const w = r * 1.72;
    const left = -w / 2;
    const top = -r * 0.96;
    const h = r * 1.5;
    const seamY = r * 0.34;
    c.beginPath();
    c.ellipse(0, top + h / 2, w / 2, h / 2, 0, Math.PI, Math.PI * 2);
    c.lineTo(w / 2, seamY);
    c.lineTo(left, seamY);
    c.closePath();
  }

  function drawToken(c, x, y, r, type, alpha, mood, rot, seed) {
    const ci = tokenTypes[type] || 0;
    const gc = GAME_CHARS[ci] || GAME_CHARS[0];
    const color = CAPSULE_COLORS[type % CAPSULE_COLORS.length] || gc.color || '#e4b65f';
    const domeW = r * 1.72;
    const domeTop = -r * 0.96;
    const seamY = r * 0.34;
    const baseBottom = r * 0.58;
    const rimH = r * 0.11;
    c.save();
    c.globalAlpha = alpha == null ? 1 : alpha;
    c.translate(x, y);
    c.rotate(rot || 0);

    const src = mood === 'happy' ? (gc.imgHappy || gc.img)
      : mood === 'sad' ? (gc.imgSad || gc.img)
        : (gc.img || gc.imgHappy || gc.imgSad || gc.imgWhack);
    const img = src && imgCache.get(src);
    if (img && img.complete && img.naturalWidth) {
      c.save();
      capsuleDomePath(c, r);
      c.clip();
      c.globalAlpha *= 0.96;
      const source = imageContentBounds(img) || { x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight };
      const imageScale = Math.max((domeW * 1.34) / source.w, (r * 1.5) / source.h);
      const drawW = source.w * imageScale;
      const drawH = source.h * imageScale;
      const eyeX = source.w * 0.5;
      const eyeY = source.h * 0.38;
      const targetEyeY = domeTop + (seamY - domeTop) * 0.46;
      const drawX = -eyeX * imageScale;
      const drawY = targetEyeY - eyeY * imageScale;
      c.drawImage(img, source.x, source.y, source.w, source.h, drawX, drawY, drawW, drawH);
      c.globalCompositeOperation = 'source-atop';
      const wrapShade = c.createRadialGradient(-r * 0.3, -r * 0.36, r * 0.12, 0, -r * 0.08, r * 1.08);
      wrapShade.addColorStop(0, 'rgba(255,255,255,0.12)');
      wrapShade.addColorStop(0.58, 'rgba(255,255,255,0)');
      wrapShade.addColorStop(1, 'rgba(0,0,0,0.2)');
      c.fillStyle = wrapShade;
      c.fillRect(-domeW / 2, domeTop, domeW, seamY - domeTop);
      c.restore();
    } else {
      c.fillStyle = color || '#111318';
      c.font = `${Math.round(r)}px sans-serif`;
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(gc.emoji || '?', 0, -r * 0.34);
    }

    c.save();
    // Colored glass edge: the dome rim carries the capsule color so groups
    // read at a glance without covering the face inside.
    capsuleDomePath(c, r);
    c.strokeStyle = color;
    c.globalAlpha *= 0.8;
    c.lineWidth = Math.max(1.5, r * 0.05);
    c.shadowColor = color;
    c.shadowBlur = r * 0.22;
    c.stroke();
    c.shadowBlur = 0;
    c.globalAlpha = alpha == null ? 1 : alpha;
    capsuleDomePath(c, r);
    c.strokeStyle = 'rgba(30,34,38,0.4)';
    c.lineWidth = Math.max(1, r * 0.022);
    c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.66)';
    c.beginPath();
    c.ellipse(r * 0.42, -r * 0.7, r * 0.09, r * 0.045, -0.35, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(255,255,255,0.3)';
    c.beginPath();
    c.ellipse(r * 0.18, -r * 0.58, r * 0.04, r * 0.025, -0.35, 0, Math.PI * 2);
    c.fill();
    c.restore();

    c.save();
    const cupTop = seamY + rimH * 0.35;
    const cupW = domeW * 0.72;
    const cupLeft = -cupW / 2;
    const cupGrad = c.createLinearGradient(0, cupTop, 0, baseBottom);
    cupGrad.addColorStop(0, color);
    cupGrad.addColorStop(0.62, darkenColor(color, 0.08));
    cupGrad.addColorStop(1, darkenColor(color, 0.22));
    c.fillStyle = cupGrad;
    roundRectPath(c, cupLeft, cupTop, cupW, Math.max(1, baseBottom - cupTop - r * 0.05), r * 0.055);
    c.fill();
    c.beginPath();
    c.ellipse(0, baseBottom - r * 0.1, cupW / 2, r * 0.16, 0, 0, Math.PI);
    c.lineTo(-cupW / 2, cupTop + r * 0.04);
    c.lineTo(cupW / 2, cupTop + r * 0.04);
    c.closePath();
    c.fill();
    c.strokeStyle = 'rgba(70,0,8,0.24)';
    c.lineWidth = Math.max(1, r * 0.018);
    c.beginPath();
    c.ellipse(0, baseBottom - r * 0.1, cupW / 2, r * 0.16, 0, 0, Math.PI);
    c.stroke();

    const rimW = domeW * 1.05;
    const rimX = -rimW / 2;
    const rimY = seamY - rimH * 0.45;
    const rimGrad = c.createLinearGradient(0, rimY, 0, rimY + rimH);
    rimGrad.addColorStop(0, lightenColor(color, 0.18));
    rimGrad.addColorStop(0.42, color);
    rimGrad.addColorStop(1, darkenColor(color, 0.18));
    c.fillStyle = rimGrad;
    roundRectPath(c, rimX, rimY, rimW, rimH, r * 0.08);
    c.fill();
    c.strokeStyle = 'rgba(40,0,8,0.34)';
    c.lineWidth = Math.max(1, r * 0.022);
    c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.24)';
    c.lineWidth = Math.max(1, r * 0.016);
    c.beginPath();
    c.moveTo(rimX + r * 0.12, rimY + rimH * 0.22);
    c.lineTo(rimX + rimW - r * 0.12, rimY + rimH * 0.22);
    c.stroke();
    c.restore();

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

  // ══════════════════════════════════════
  //  JOURNEY — designed levels + save-code progress (mirrors Consume)
  // ══════════════════════════════════════
  const JOURNEY_KEY = 'moberino-snoob-v1';
  const JOURNEY_GAME = 'snoob-journey';
  const JOURNEY = (typeof SNOOB_DATA !== 'undefined') ? SNOOB_DATA : { levels: [] };
  const JLEVELS = JOURNEY.levels || [];
  const TAG_WORDS = ['FROG','MINT','TACO','DUCK','MOON','STAR','WAVE','COMET','MANGO',
    'PIZZA','NEON','DISCO','LASER','LEMON','BERRY','MAPLE','SODA','JELLY','BAGEL',
    'NACHO','SPARK','TURBO','COSMO','ASTRO','LUNA','NOVA','BLIP','ZOOM','DINO',
    'ROCKET','BANJO','KAZOO','YOYO','SNOOB','CRANK','CAPSULE'];

  function jLoad() { try { return JSON.parse(localStorage.getItem(JOURNEY_KEY) || '{}'); } catch(e) { return {}; } }
  function jSave(d) { try { localStorage.setItem(JOURNEY_KEY, JSON.stringify(d)); } catch(e) {} }
  function jGenTag(taken) {
    for (let i = 0; i < 200; i++) {
      const t = TAG_WORDS[Math.floor(Math.random() * TAG_WORDS.length)] + (2 + Math.floor(Math.random() * 8));
      if (!taken[t]) return t;
    }
    return 'MOBE' + Math.floor(Math.random() * 90 + 10);
  }
  function jProfile() {
    const s = jLoad();
    if (!s.profiles) s.profiles = {};
    // Retroactively adopt the shared cross-game code if it differs — old
    // progress under the previous tag stays put, just no longer active.
    const shared = typeof window.PlayerID !== 'undefined' ? window.PlayerID.get() : null;
    if (shared && shared !== s.active) {
      if (!s.profiles[shared]) s.profiles[shared] = { stars: {} };
      s.active = shared;
      jSave(s);
    } else if (!s.active || !s.profiles[s.active]) {
      s.active = jGenTag(s.profiles);
      s.profiles[s.active] = { stars: {} };
      jSave(s);
    }
    if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(s.active);
    return s;
  }
  function jStars() { const s = jProfile(); return s.profiles[s.active].stars || {}; }
  function jRecord(n, stars) {
    const s = jProfile(); const p = s.profiles[s.active];
    if (stars > (p.stars[n] || 0)) { p.stars[n] = stars; jSave(s); }
  }
  function jHighest(st) { let m = 0; const s = st || jStars(); for (const k in s) m = Math.max(m, +k); return m; }
  function jTotal(st) { let t = 0; const s = st || jStars(); for (const k in s) t += s[k]; return t; }
  function jSetTag(raw) {
    const tag = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12);
    if (tag.length < 2) return { ok: false, msg: '2-12 LETTERS/NUMBERS' };
    const s = jProfile();
    if (tag === s.active) return { ok: true };
    const cur = (s.profiles[s.active] && s.profiles[s.active].stars) || {};
    if (!s.profiles[tag]) s.profiles[tag] = { stars: {} };
    const dest = s.profiles[tag].stars;
    for (const k in cur) if ((cur[k] || 0) > (dest[k] || 0)) dest[k] = cur[k];
    s.active = tag; jSave(s);
    if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(tag);
    return { ok: true };
  }
  function jAdopt(tag, upTo) {
    const s = jProfile();
    if (!s.profiles[tag]) s.profiles[tag] = { stars: {} };
    for (let n = 1; n <= upTo; n++) if (!s.profiles[tag].stars[n]) s.profiles[tag].stars[n] = 1;
    s.active = tag; jSave(s);
    if (typeof window.PlayerID !== 'undefined') window.PlayerID.set(tag);
  }
  function jSync() {
    try {
      if (typeof RemoteLB === 'undefined' || !RemoteLB.submit) return;
      const hi = jHighest(); if (!hi) return;
      RemoteLB.submit(JOURNEY_GAME, jProfile().active, hi, 0, '★' + jTotal() + ' · L' + hi).catch(() => {});
    } catch(e) {}
  }
  function jEsc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, ch => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[ch]));
  }

  function prepHost() {
    const host = document.getElementById('snoob-wrap');
    if (!host) return null;
    cancelAnimationFrame(raf);
    host.classList.add('mode-select-layout');
    document.body.classList.add('arcade-selection-open');
    if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
    else ArcadeMusic.unduck();
    return host;
  }

  function renderModes() {
    const host = prepHost();
    if (!host) return;
    setArcadeExitVisible(true);
    setArcadeModeSelect(true);
    host.innerHTML = `
      <div class="snoob-cabinet-frame snoob-mode-frame">
        <div class="snoob-menu-shell">
          <div class="snoob-title">SNOOB</div>
          <div class="snoob-sub">RETRO STICKER SHOOTER</div>
          <div class="snoob-modes">
            <button class="snoob-mode-btn" onclick="snoobJourney()">
              <strong>JOURNEY</strong><span>CLEAR EACH BOARD · EARN STARS</span>
            </button>
            <button class="snoob-mode-btn" onclick="snoobStart()">
              <strong>ENDLESS</strong><span>SURVIVE · CHASE A HIGH SCORE</span>
            </button>
          </div>
        </div>
      </div>`;
  }

  // One tight panel holds everything code-related — your code, changing it,
  // adopting someone else's, and the privacy note — so it's a single glance
  // instead of scattered notes above and below the level grid.
  function renderJourney() {
    const host = prepHost();
    if (!host) return;
    setArcadeExitVisible(true);
    setArcadeModeSelect(true);
    const store = jProfile();
    const st = store.profiles[store.active].stars || {};
    const done = jHighest(st);
    const next = Math.min(done + 1, JLEVELS.length);
    host.innerHTML = `
      <div class="snoob-cabinet-frame snoob-journey-frame">
        <div class="snoob-journey">
          <button class="snoob-mode-return" onclick="snoobModes()">MODES</button>
          <div class="snoob-title">SNOOB</div>
          <div class="snoob-sub">JOURNEY · CLEAR EVERY CAPSULE</div>
          <div class="snoob-level-label">LEVELS</div>
          <div class="snoob-level-grid">
            ${JLEVELS.map(lvl => {
              const stars = st[lvl.n] || 0;
              const cls = stars ? 'done' : (lvl.n === next ? 'next' : 'lock');
              return `<button class="snoob-node ${cls}" type="button" data-level="${lvl.n}"><span>${lvl.n}</span>${stars ? `<em>${'★'.repeat(stars)}</em>` : ''}</button>`;
            }).join('')}
          </div>
          <div class="snoob-codebox player-login-switch" role="button" tabindex="0" onclick="openPlayerSignIn()" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openPlayerSignIn()}" aria-label="Change arcade login">
            <div class="snoob-codebox-row">
              <span class="snoob-codebox-label">LOGGED IN AS</span>
              <span class="snoob-me-name">${jEsc(store.active)}</span>
              <span class="snoob-me-stars">★ ${jTotal(st)}</span>
            </div>
          </div>
        </div>
      </div>`;
    host.querySelector('.snoob-level-grid').addEventListener('click', e => {
      const node = e.target.closest('[data-level]');
      if (!node) return;
      const n = +node.getAttribute('data-level');
      if (n > done + 1) { playSnoobSound('miss'); return; }
      startJourneyLevel(n);
    });
  }

  function loadJourneyBoard(data) {
    board = [];
    pieceVisuals = [];
    rowPhase = 0;
    fallingPieces = [];
    faceFlashes = [];
    rattles = [];
    ensureBoardRows(MAX_ROWS);
    const rows = data.board || [];
    for (let r = 0; r < rows.length && r < MAX_ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const t = rows[r][c];
        if (t == null) continue;
        board[r][c] = t;
        pieceVisuals[r][c] = makePieceVisual(r * COLS + c + 17);
      }
    }
  }

  function startJourneyLevel(n) {
    const data = JLEVELS[n - 1];
    if (!data) return;
    mode = 'journey';
    journeyN = n;
    journeyPar = data.par || 0;
    journeyColors = data.colors || TYPES;
    tokenTypes = playableChars();
    score = 0; shots = 0; drops = 0; rowsAdded = 0; missStreak = 0;
    current = null; aim = -Math.PI / 2; aimArmed = false;
    journeyClearPending = false; journeyClearStars = 0;
    dustMotes = [];
    clearPendingAimTouch();
    loadJourneyBoard(data);
    currentType = randQueuedType();
    nextType = randQueuedType();
    state = 'playing';
    renderPlaying();
    if (ArcadeMusic && ArcadeMusic.duck) ArcadeMusic.duck();
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(step);
  }

  function renderJourneyResult(win, stars) {
    cancelAnimationFrame(raf);
    const host = document.getElementById('snoob-wrap');
    if (!host) return;
    host.classList.add('mode-select-layout');
    document.body.classList.add('arcade-selection-open');
    setArcadeExitVisible(false);
    setArcadeModeSelect(false);
    const hasNext = win && journeyN < JLEVELS.length;
    const starRow = win
      ? `<div class="snoob-result-stars">${[1, 2, 3].map(i => `<span class="${i <= stars ? 'on' : ''}">★</span>`).join('')}</div>`
      : '';
    host.innerHTML = `
      <div class="snoob-cabinet-frame">
        <div class="snoob-result">
          <div class="snoob-title" style="color:${win ? '#e4b65f' : '#ff5b6f'}">${win ? 'LEVEL ' + journeyN + ' CLEAR' : 'LEVEL FAILED'}</div>
          ${starRow}
          <div class="snoob-sub">${win ? `${shots} SHOTS · PAR ${journeyPar}` : 'THE STACK REACHED THE LINE'}</div>
          <div class="snoob-result-btns">
            ${hasNext ? `<button class="snoob-btn snoob-btn-go" onclick="snoobNextLevel()">NEXT LEVEL ▶</button>` : ''}
            ${win && !hasNext ? `<button class="snoob-btn snoob-btn-go" onclick="snoobJourney()">ALL CLEAR!</button>` : ''}
            <button class="snoob-btn" onclick="snoobRetryLevel()">${win ? 'REPLAY' : 'RETRY'}</button>
            <button class="snoob-btn" onclick="snoobJourney()">LEVELS</button>
          </div>
        </div>
      </div>`;
  }

  window.snoobModes = function() { renderModes(); };
  window.snoobJourney = function() { renderJourney(); };
  window.snoobNextLevel = function() { startJourneyLevel(Math.min(journeyN + 1, JLEVELS.length)); };
  window.snoobRetryLevel = function() { startJourneyLevel(journeyN); };

  window.snoobStart = function() {
    mode = 'endless';
    tokenTypes = playableChars();
    score = 0; shots = 0; drops = 0; rowsAdded = 0; missStreak = 0; wave = 1;
    current = null; aim = -Math.PI / 2; aimArmed = false;
    journeyClearPending = false; journeyClearStars = 0;
    dustMotes = [];
    clearPendingAimTouch();
    resetBoard();
    currentType = randQueuedType();
    nextType = randQueuedType();
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
    renderModes();
  };

  window.snoobBack = function() {
    cancelAnimationFrame(raf);
    if (resizeHandler) window.removeEventListener('resize', resizeHandler);
    resizeHandler = null;
    window.onkeydown = null;
    clearPendingAimTouch();
    current = null;
  };

})();
