// ══════════════════════════════════════
//  WHACK-A-MOBE
// ══════════════════════════════════════
(function() {
  // Board size follows difficulty. Adventure Easy keeps the compact 12-hole
  // board; Adventure Hard gets a taller 20-hole 4x5 board so mobile uses the
  // portrait screen better without changing the actual Whack rules.
  let GRID_COLS = 4, GRID_ROWS = 4, HOLES = GRID_COLS * GRID_ROWS;
  function applyDifficultyGridSize() {
    GRID_COLS = difficulty === 'easy' ? 3 : 4;
    GRID_ROWS = difficulty === 'easy' ? 4 : 5;
    HOLES = GRID_COLS * GRID_ROWS;
  }
  const CRACK_SVG = `<svg class="whack-glass-smash" viewBox="0 0 100 100" aria-hidden="true">
    <circle class="glass-impact-ring" cx="50" cy="50" r="10"/>
    <circle class="glass-impact-core" cx="50" cy="50" r="4.8"/>
    <g class="glass-cracks" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M50 50 L45 27 L32 8"/>
      <path d="M50 50 L57 28 L71 10"/>
      <path d="M50 50 L76 43 L96 35"/>
      <path d="M50 50 L72 69 L88 93"/>
      <path d="M50 50 L43 76 L35 96"/>
      <path d="M50 50 L27 63 L7 76"/>
      <path d="M50 50 L25 43 L5 34"/>
      <path d="M50 50 L37 35 L22 25"/>
      <path d="M50 50 L64 55 L84 56"/>
      <path d="M50 50 L57 72 L61 94"/>
    </g>
    <g class="glass-branch-cracks" fill="none" stroke-linecap="round" stroke-linejoin="round">
      <path d="M45 27 L54 20"/>
      <path d="M57 28 L50 19"/>
      <path d="M76 43 L82 52"/>
      <path d="M72 69 L62 70"/>
      <path d="M43 76 L51 82"/>
      <path d="M27 63 L29 74"/>
      <path d="M25 43 L17 50"/>
      <path d="M37 35 L33 24"/>
      <path d="M64 55 L72 64"/>
    </g>
  </svg>`;
  let state = 'mode-select'; // mode-select | mole-select | playing | over
  let wave = 1, waveHits = 0;
  let timerInterval;
  let difficulty = 'hard'; // 'easy' | 'hard'
  // Classic is a standalone 30s score-attack sibling to the wave-based game (now
  // labeled "Frenzy" in the UI) — gameMode persists across replays the same way
  // difficulty already does, only defaulting to 'frenzy' on script init.
  let gameMode = 'frenzy'; // 'classic' | 'frenzy'
  let classicHits = 0, classicPieces = [], classicTimeLeft = 30, classicInterval = null;
  let activeChar = getGlobalChar(); // user's char — to AVOID
  let moleChar = -1;               // random other char — to WHACK
  let selfActive = false;          // true once user's char starts appearing
  let selfIntroWave = 0;           // wave selfActive turned on — self-hit rate ramps from here
  let holeTimers = [], holeStates = [], holeCharIdx = [];
  let holeGrace = []; // brief post-uptime grace window — see popDown()
  let awaitingGameOverTap = false; // true once dead — frozen board, waiting for player to tap through
  let waveTransitioning = false;   // true during the pause between waves — blocks new spawns,
                                    // including ones a stale "just hit" cleanup callback might try to sneak in

  // Round types: normal trickle-spawn "whack" waves, occasionally replaced by a "clear"
  // wave — board fills with several targets at once, mixed good/bad, clear it before
  // the timer runs out. Picked once per wave (not recomputed) so the label/HUD stay
  // consistent with what's actually running.
  let currentRoundType = 'whack';
  // Extended, slower first-time intro for each mode (new players were confused about
  // what to do) — only plays once per run, the very first time that mode comes up.
  // Reset alongside the rest of the run's state in whackPlay()/initWhack().
  let introShownFor = { whack: false, clear: false, memory: false };
  let adventureIntroShown = false;
  let skipWhackTutorial = localStorage.getItem('whack-skip-tutorial') === '1';
  function getClearRoundSeconds() {
    return difficulty === 'easy' ? 12 : 8;
  }
  let clearRoundTargets = 0, clearRoundHit = 0, clearRoundTimeLeft = 0, clearRoundInterval = null;
  // From the 2nd Clear round on, pieces hop to a touching/diagonal empty hole on a
  // timer instead of staying put — clearRoundPieces tracks each one's current hole so
  // moveClearRoundPieces() knows what to relocate. Speed climbs with each appearance.
  let clearRoundAppearances = 0, clearRoundPieces = [], clearRoundMoveInterval = null;
  // Memory round: a handful of holes flash a mole, then go blank — recall those exact
  // spots to clear it. Wrong spot (or any spot not in memoryTargets) is an instant fail,
  // same zero-tolerance rule as everything else.
  let memoryTargets = [], memoryHit = 0, memoryPhase = null; // 'showing' | 'recall' | null
  let memoryAppearances = 0; // counts up each Memory round this run — drives difficulty scaling

  function charHTML(ci, expr) {
    const c = GAME_CHARS[ci];
    const face = expr === 'happy' ? c.happy : expr === 'sad' ? c.sad : c.emoji;
    if (c.img) {
      const src = expr === 'happy' ? (c.imgHappy||c.img) : expr === 'sad' ? (c.imgSad||c.img) : expr === 'whack' ? (c.imgWhack||c.img) : c.img;
      return `<img class="mobe-face-img" src="${src}" style="width:100%;height:100%;object-fit:contain;border-radius:50%;display:block;margin:0 auto">`;
    }
    return `<div class="whack-char-placeholder" style="background:${c.color}">${face}</div>`;
  }

  function pickMole() {
    const others = GAME_CHARS.map((_,i)=>i).filter(i=>i!==activeChar);
    return others[Math.floor(Math.random()*others.length)];
  }

  function showStatus(msg) {
    const el = document.getElementById('whack-status');
    if (!el) return;
    el.textContent = msg;
    el.style.opacity = '1';
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.style.opacity = '0'; }, 1800);
  }

  window.whackToggleTutorialSkip = function() {
    skipWhackTutorial = !skipWhackTutorial;
    localStorage.setItem('whack-skip-tutorial', skipWhackTutorial ? '1' : '0');
    const btn = document.getElementById('whack-skip-tutorial-btn');
    if (btn) {
      btn.textContent = skipWhackTutorial ? 'TUTORIAL: OFF' : 'TUTORIAL: ON';
      btn.classList.toggle('off', skipWhackTutorial);
    }
  };

  function startSlotMachine() {
    const face = document.getElementById('whack-slot-face');
    const box  = document.getElementById('whack-slot-box');
    const nameEl = document.getElementById('whack-slot-name');
    const readyBtn = document.getElementById('whack-ready-btn');
    if (!face) return;
    const others = GAME_CHARS.map((_,i)=>i).filter(i=>i!==activeChar);
    let idx = 0, delay = 80, spins = 0, totalSpins = 16;
    function tick() {
      idx = (idx + 1) % others.length;
      face.innerHTML = charHTML(others[idx], 'normal');
      SFX.slotTick();
      spins++;
      if (spins < totalSpins * 0.55) {
        setTimeout(tick, delay);
      } else if (spins < totalSpins) {
        delay = 80 + (spins - totalSpins * 0.55) * 40;
        setTimeout(tick, delay);
      } else {
        face.innerHTML = charHTML(moleChar, 'normal');
        const gc = GAME_CHARS[moleChar];
        if (box) { box.style.borderColor = gc.color; box.style.boxShadow = `0 0 24px ${gc.color}88`; }
        if (nameEl) { nameEl.textContent = gc.name; nameEl.style.color = gc.color; nameEl.style.textShadow = `0 0 12px ${gc.color}`; nameEl.style.opacity = '1'; }
        if (readyBtn) { readyBtn.style.opacity = '1'; readyBtn.style.pointerEvents = 'auto'; }
        SFX.win();
      }
    }
    setTimeout(tick, 120);
  }

  // Freeze the board exactly as it is at the moment of death — no re-render, no reset —
  // and wait for the player to tap before showing the results screen.
  // Zero-tolerance wave clearing: any self-hit or missed mole ends the run immediately —
  // no life budget to absorb it. Shared by both failure paths so the flow is identical.
  function failWave(reason) {
    holeTimers.forEach(clearTimeout);
    clearInterval(clearRoundInterval); // in case a Clear round's countdown is still running
    clearInterval(clearRoundMoveInterval);
    removeClearTimerOverlay();
    removeSideBar();
    memoryPhase = null; // in case a Memory round is mid-recall
    flashBrokenHeart();
    showStatus(reason);
    SFX.over();
    // Tap-to-continue waits for the heart to have its moment on screen rather than
    // stacking on top of it immediately.
    setTimeout(freezeForGameOver, BROKEN_HEART_HOLD_MS);
  }

  function freezeForGameOver() {
    const wrap = document.getElementById('whack-wrap');
    if (!wrap) return;
    if (currentRoundType === 'memory' && memoryTargets.length) {
      revealMemoryBoard(showWhackGameOver);
      return;
    }
    showWhackGameOver();
  }

  window.whackContinue = function() {
    if (!awaitingGameOverTap) return;
    awaitingGameOverTap = false;
    if (currentRoundType === 'memory' && memoryTargets.length) {
      revealMemoryBoard(showWhackGameOver);
      return;
    }
    showWhackGameOver();
  };

  // After a Memory-round failure, flip every still-covered hole so the player can
  // see where the real targets were, instead of cutting straight to game over. Waits
  // for an explicit second tap to move on (as long as they want to look), rather than
  // an automatic delay — and advances immediately on that tap, no lingering pause.
  function revealMemoryBoard(onDone) {
    const tapOv = document.getElementById('whack-gameover-tap');
    if (tapOv) tapOv.remove();
    for (let h = 0; h < HOLES; h++) {
      const flip = document.getElementById(`wflip-${h}`);
      if (!flip || flip.classList.contains('flipped')) continue;
      flip.classList.add('flipped');
      if (memoryTargets.includes(h)) {
        const faceEl = document.getElementById(`wface-${h}`);
        // Small checkmark badge so the correct spots are unmistakable at a glance,
        // not just "a face showed up" — matches the intro demo's own checkmark reveal.
        if (faceEl) faceEl.innerHTML = `<div style="position:relative;width:100%;height:100%">${charHTML(moleChar, 'normal')}<div style="position:absolute;bottom:2px;right:2px;width:18px;height:18px;border-radius:50%;background:#33ff66;color:#0a1f10;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:bold;box-shadow:0 0 6px rgba(51,255,102,0.7)">✓</div></div>`;
      }
    }
    setTimeout(() => { onDone(); }, 550); // keep the revealed board visible briefly, then move on automatically
  }

  function render() {
    const wrap = document.getElementById('whack-wrap');
    if (!wrap) return;
    setArcadeExitVisible(state !== 'over');
    wrap.classList.toggle('mode-select-layout', state === 'mode-select');
    document.body.classList.toggle('arcade-selection-open', state === 'mode-select' || state === 'mole-select');
    if (state === 'mode-select' || state === 'mole-select') {
      if (typeof window.initArcadeFloat === 'function') window.initArcadeFloat(true);
    }

    if (state === 'mode-select') {
      wrap.innerHTML = `
<div class="whack-mode-shell" style="transform:translateY(54px)">          <div class="whack-mode-title">CHOOSE MODE</div>
          <div class="whack-mode-grid">
            <div class="game-card whack-mode-card" style="border-color:#b884ff66;cursor:default">
              <div class="game-card-art" style="background:#0d0a1e">
                <svg viewBox="0 0 200 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0">
                  <rect width="200" height="120" fill="#0d0a1e"/>
                  <line x1="0" y1="20" x2="200" y2="20" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="0" y1="40" x2="200" y2="40" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="0" y1="60" x2="200" y2="60" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="0" y1="80" x2="200" y2="80" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="50" y1="0" x2="50" y2="120" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="100" y1="0" x2="100" y2="120" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <line x1="150" y1="0" x2="150" y2="120" stroke="#ff9933" stroke-width="0.4" opacity="0.075"/>
                  <ellipse cx="145" cy="40" rx="46" ry="29" fill="#ff6600" opacity="0.12"/>
                  <g transform="translate(151, 45) rotate(40) scale(0.82)" opacity="1">
                    <rect x="-5" y="4" width="10" height="64" rx="4" fill="#6B3410"/>
                    <rect x="-5" y="4" width="5" height="64" rx="3" fill="#8B4513"/>
                    <line x1="-1" y1="12" x2="-1" y2="60" stroke="#5a2a0c" stroke-width="1" opacity="0.5"/>
                    <rect x="-30" y="-18" width="60" height="26" rx="7" fill="#cc7722"/>
                    <rect x="-30" y="-18" width="60" height="11" rx="7" fill="#ff9933"/>
                    <rect x="-28" y="-16" width="56" height="5" rx="3" fill="#ffcc77" opacity="0.45"/>
                    <rect x="-30" y="-18" width="8" height="26" rx="4" fill="#aa6010"/>
                    <rect x="22" y="-18" width="8" height="26" rx="4" fill="#aa6010"/>
                    <circle cx="-18" cy="-5" r="2.5" fill="#884411"/>
                    <circle cx="18" cy="-5" r="2.5" fill="#884411"/>
                  </g>
                  <text x="56" y="22" font-size="20" fill="#ffe61a" opacity="0.82">✦</text>
                  <text x="28" y="16" font-size="10" fill="#00e5ff" opacity="0.42">✦</text>
                  <text x="180" y="14" font-size="13" fill="#ffe61a" opacity="0.62">✦</text>
                  <text x="160" y="46" font-size="8" fill="#00e5ff" opacity="0.32">✦</text>
                  <line x1="174" y1="8" x2="160" y2="20" stroke="#ff9933" stroke-width="2.2" opacity="0.2" stroke-linecap="round"/>
                  <line x1="186" y1="14" x2="172" y2="26" stroke="#ff9933" stroke-width="1.4" opacity="0.14" stroke-linecap="round"/>
                  <line x1="162" y1="4" x2="150" y2="14" stroke="#ff9933" stroke-width="1" opacity="0.1" stroke-linecap="round"/>
                </svg>
                <div class="whack-mode-name" style="text-shadow:0 0 8px rgba(136,72,214,0.62)">FRENZY</div>
              </div>
              <div class="game-card-info">
                <div class="game-card-marquee" style="color:#b178ff;text-shadow:0 0 16px rgba(143,77,224,0.74)">30 SECOND RUSH</div>
                <div class="game-card-desc">WHACK AGAINST TIME.</div>
                <div class="whack-mode-diff">
                  <button class="whack-btn" style="border-color:#caa5ff;background:rgba(202,165,255,0.24);color:#f4eaff" onclick="whackSelectModeDifficulty('classic','easy')">NORMAL</button>
                  <button class="whack-btn" style="border-color:#8f4de0;background:rgba(124,67,201,0.28);color:#ead4ff" onclick="whackSelectModeDifficulty('classic','hard')">HARD</button>
                </div>
              </div>
            </div>

            <div class="game-card whack-mode-card" style="border-color:#ffb04a66;cursor:default">
              <div class="game-card-art" style="background:#0d0a1e">
                <svg viewBox="0 0 200 120" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0">
                  <rect width="200" height="120" fill="#0d0a1e"/>
                  <line x1="0" y1="30" x2="200" y2="30" stroke="#ff9933" stroke-width="0.4" opacity="0.18"/>
                  <line x1="0" y1="48" x2="200" y2="48" stroke="#ff9933" stroke-width="0.4" opacity="0.18"/>
                  <line x1="50" y1="0" x2="50" y2="56" stroke="#ff9933" stroke-width="0.4" opacity="0.18"/>
                  <line x1="100" y1="0" x2="100" y2="56" stroke="#ff9933" stroke-width="0.4" opacity="0.18"/>
                  <line x1="150" y1="0" x2="150" y2="56" stroke="#ff9933" stroke-width="0.4" opacity="0.18"/>
                  <g transform="translate(144, 39) rotate(-8) scale(0.88)" opacity="0.88">
                    <path d="M-42 -28 C-20 -38 -4 -30 14 -36 C24 -39 35 -34 44 -25 L37 28 C22 19 5 28 -10 22 C-24 17 -34 24 -45 31 Z" fill="#f4d37c"/>
                    <path d="M-42 -28 C-24 -18 -15 -6 -10 22" fill="none" stroke="#b76b24" stroke-width="4" opacity="0.65"/>
                    <path d="M14 -36 C9 -18 12 3 37 28" fill="none" stroke="#b76b24" stroke-width="4" opacity="0.62"/>
                    <path d="M-35 3 C-18 -7 -1 -1 15 -9 C26 -14 34 -9 41 -2" fill="none" stroke="#ff9b30" stroke-width="5" opacity="0.82"/>
                    <path d="M-27 -21 C-14 -14 -8 -3 -6 9" fill="none" stroke="#fff1b5" stroke-width="3" opacity="0.7"/>
                    <path d="M18 -26 C17 -12 22 1 34 12" fill="none" stroke="#fff1b5" stroke-width="3" opacity="0.6"/>
                    <circle cx="-23" cy="-7" r="3.6" fill="#a8511b"/>
                    <circle cx="11" cy="-18" r="3.2" fill="#a8511b"/>
                    <circle cx="25" cy="7" r="3.6" fill="#a8511b"/>
                    <path d="M-42 -28 C-20 -38 -4 -30 14 -36 C24 -39 35 -34 44 -25 L37 28 C22 19 5 28 -10 22 C-24 17 -34 24 -45 31 Z" fill="none" stroke="#3a2514" stroke-width="4.5" opacity="0.72"/>
                  </g>
                  <text x="22" y="22" font-size="12" fill="#ffe61a" opacity="0.65">✦</text>
                  <text x="164" y="18" font-size="9" fill="#ffe61a" opacity="0.45">✦</text>
                </svg>
                <div class="whack-mode-name" style="text-shadow:0 0 8px rgba(255,153,51,0.48)">SURVIVAL</div>
              </div>
              <div class="game-card-info">
                <div class="game-card-marquee" style="color:#ff9933;text-shadow:0 0 15px rgba(255,153,51,0.62)">WAVE SURVIVAL</div>
                <div class="game-card-desc">3 MODES TO EXPLORE.</div>
                <div class="whack-mode-diff">
                  <button class="whack-btn" style="border-color:#ffc27a;background:rgba(255,194,122,0.22);color:#fff5e8" onclick="whackSelectModeDifficulty('frenzy','easy')">NORMAL</button>
                  <button class="whack-btn" style="border-color:#e07b25;background:rgba(201,106,31,0.25);color:#ffe8d0" onclick="whackSelectModeDifficulty('frenzy','hard')">HARD</button>
                </div>
              </div>
            </div>
          </div>
        </div>`;
      return;
    }

    if (state === 'mole-select') {
      const isClassic = gameMode === 'classic';
      wrap.innerHTML = `
        <div class="arcade-cabinet whack-ready-cabinet" style="--nc:#ff00cc;max-width:390px;width:92vw;position:relative">
          <div class="arcade-cab-rail"></div>
          <div class="arcade-cab-marquee" style="background:linear-gradient(135deg,#ff00cc,#990066);opacity:0.9;font-size:30px;letter-spacing:6px">GET READY</div>
          <div class="arcade-cab-screen" style="position:relative;z-index:2;overflow:hidden;padding:14px 14px 4px;min-height:0;background:rgba(5,3,16,0.78)">
            <div style="position:relative;z-index:2;display:flex;flex-direction:column;gap:8px;text-align:center">
              <div style="font-family:'VCR',monospace;font-size:19px;letter-spacing:3px;color:rgba(242,239,232,0.96)">FINDING THE MOLE</div>
              <div style="display:flex;justify-content:center">
                <div style="display:flex;flex-direction:column;align-items:center;gap:6px">
                  <div style="font-size:11px;letter-spacing:2px;color:#ff4444;font-family:'VCR',monospace">${isClassic ? 'MOBE' : 'WHACK THIS'}</div>
                  <div id="whack-slot-box" style="width:128px;height:128px;border-radius:16px;background:rgba(255,68,68,0.1);display:flex;align-items:center;justify-content:center;border:2px solid rgba(255,68,68,0.5);box-shadow:0 0 18px rgba(255,68,68,0.25);transition:border-color 0.3s,box-shadow 0.3s">
                    <div id="whack-slot-face" style="width:96px;height:96px;display:flex;align-items:center;justify-content:center"></div>
                  </div>
                  <div id="whack-slot-name" style="font-family:'VCR',monospace;font-size:12px;letter-spacing:2px;opacity:0;transition:opacity 0.4s;min-height:14px;text-align:center"></div>
                </div>
              </div>
            </div>
          </div>
          <div class="arcade-cab-foot" style="position:relative;z-index:2;flex-direction:column;align-items:center;gap:11px;background:rgba(5,3,16,0.78);padding:22px 16px 18px;border-top:1px solid rgba(242,239,232,0.12)">
            <button id="whack-skip-tutorial-btn" class="whack-btn whack-tutorial-toggle ${skipWhackTutorial ? 'off' : ''}" onclick="whackToggleTutorialSkip()" style="width:100%;margin-top:0">${skipWhackTutorial ? 'TUTORIAL: OFF' : 'TUTORIAL: ON'}</button>
            <button id="whack-ready-btn" class="whack-btn" onclick="whackBegin()" style="width:100%;border-color:#ff00cc;background:rgba(255,0,204,0.20);padding:16px 48px;font-size:20px;letter-spacing:5px;text-shadow:0 0 10px #ff00cc88;box-shadow:0 0 18px rgba(255,0,204,0.3);opacity:0.35;pointer-events:none">READY!</button>
          </div>
        </div>`;
      startSlotMachine();
      return;
    }

    if (state === 'playing' && gameMode === 'classic') {
      wrap.innerHTML = `
        <div class="whack-hud" style="flex-direction:column;justify-content:flex-start;gap:6px;padding:8px 14px">
          <div style="text-align:center;width:100%;font-family:'Bebas Neue',cursive;font-size:24px;letter-spacing:2px;color:#00e5ff;text-shadow:0 0 10px #00e5ff88">FRENZY — <span id="classic-time">30</span>s</div>
          <div style="text-align:center;width:100%;font-family:'VCR',monospace;font-size:12px;letter-spacing:2px;color:rgba(242,239,232,0.6);padding-top:4px;border-top:1px solid rgba(242,239,232,0.1)">HITS: <span id="classic-hits" style="color:#33ff66">0</span></div>
        </div>
        <div class="whack-grid" id="whack-grid" style="--cols:${GRID_COLS};--rows:${GRID_ROWS}">${
          Array.from({length:HOLES},(_,i)=>
            `<div class="whack-hole" id="wh-${i}" onpointerdown="whackHit(${i})">
               <div class="whack-char" id="wc-${i}"></div>
               <div class="whack-tint" id="wt-${i}"></div>
               <div class="whack-miss-x" id="wx-${i}">✕</div>
             </div>`
          ).join('')
        }</div>
        <div id="whack-status" style="font-family:'VCR',monospace;font-size:18px;letter-spacing:2px;color:#ff4444;text-align:center;min-height:24px;margin-top:8px;opacity:0;transition:opacity 0.4s;text-shadow:0 0 10px #ff444488"></div>`;
      holeStates = Array(HOLES).fill('empty');
      holeCharIdx = Array(HOLES).fill(-1);
      holeGrace = Array(HOLES).fill(false);
      // Classic's pieces start spawning from classicStart(), called once the
      // no-title intro finishes — never here, same reasoning as Frenzy's spawn timing.
      return;
    }

    if (state === 'playing') {
      const youGc = GAME_CHARS[activeChar], moleGc = GAME_CHARS[moleChar];
      const vs = vsLabels();
      wrap.innerHTML = `
        <div class="whack-hud" id="whack-hud-bar" style="flex-direction:column;justify-content:flex-start;gap:6px;padding:8px 14px">
          <div id="whack-wave-mode" style="text-align:center;width:100%;font-family:'Bebas Neue',cursive;font-size:24px;letter-spacing:2px;color:#ffe61a;text-shadow:0 0 10px #ffe61a88">${whackWaveHeaderHTML()}</div>
          <div style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding-top:4px;border-top:1px solid rgba(242,239,232,0.1)">
            <div style="width:46px;height:46px;border-radius:8px;overflow:hidden;border:2px solid #33ff66;background:#33ff6622;box-shadow:0 0 12px #33ff6666;flex-shrink:0">${charFace(youGc,'normal')}</div>
            <div id="whack-vs-dont" style="flex:1;text-align:left;font-family:'Bebas Neue',cursive;font-size:13px;letter-spacing:1.5px;color:#33ff66;text-shadow:0 0 8px #33ff6688;line-height:1.2">DON'T<br>${vs.verb}</div>
            <div style="font-family:'Bebas Neue',cursive;font-size:17px;letter-spacing:2px;color:#ffe61a;text-shadow:0 0 10px #ffe61a;flex-shrink:0;padding:0 2px">VS</div>
            <div id="whack-vs-do" style="flex:1;display:flex;align-items:center;justify-content:flex-end;text-align:right;font-family:'Bebas Neue',cursive;font-size:13px;letter-spacing:1.5px;color:#ff4444;text-shadow:0 0 8px #ff444488;line-height:1.2">${vs.verb}</div>
            <div style="width:46px;height:46px;border-radius:8px;overflow:hidden;border:2px solid #ff4444;background:#ff444422;box-shadow:0 0 12px #ff444466;transform:scaleX(-1);flex-shrink:0">${charFace(moleGc,'normal')}</div>
          </div>
        </div>
        <div id="whack-memorize-banner" style="display:none;text-align:center;padding:10px 0 6px;font-family:'Bebas Neue',cursive;font-size:36px;letter-spacing:4px;color:#00e5ff;text-shadow:0 0 20px #00e5ff,0 0 40px #00e5ff66">MEMORIZE</div>
        <div class="whack-grid" id="whack-grid" style="--cols:${GRID_COLS};--rows:${GRID_ROWS}">${
          Array.from({length:HOLES},(_,i)=>
            `<div class="whack-hole" id="wh-${i}" onpointerdown="whackHit(${i})">
               <div class="whack-char" id="wc-${i}"></div>
               <div class="whack-tint" id="wt-${i}"></div>
               <div class="whack-miss-x" id="wx-${i}">✕</div>
             </div>`
          ).join('')
        }</div>
        <div id="whack-status" style="font-family:'VCR',monospace;font-size:18px;letter-spacing:2px;color:#ff4444;text-align:center;min-height:24px;margin-top:8px;opacity:0;transition:opacity 0.4s;text-shadow:0 0 10px #ff444488"></div>`;
      holeStates = Array(HOLES).fill('empty');
      holeCharIdx = Array(HOLES).fill(-1);
      holeGrace = Array(HOLES).fill(false);
      // Scheduling the first spawn happens explicitly from whackBegin()/
      // clearWaveTransition() after the wave-start overlay finishes — never here. This
      // used to call scheduleAll() unconditionally, which fired immediately and could
      // show a mole while the "WAVE 1" text was still on screen.
      return;
    }

    if (state === 'over' && gameMode === 'classic') {
      setArcadeExitVisible(false);
      const boardKey = getWhackLeaderboardKey({ mode: gameMode, difficulty });
      const key = 'classic-best';
      const best = parseInt(localStorage.getItem(key)||'0');
      const isNew = classicHits > best;
      if (isNew) localStorage.setItem(key, classicHits);
      const uid = `whack-classic-${difficulty}`;
      wrap.innerHTML = buildArcadeResultCard({
        uid,
        boardKey,
        artGame: 'whack',
        color: '#00e5ff',
        marquee: isNew ? '🏆 NEW BEST!' : 'GAME OVER',
        marqueeEnd: '#006677',
        scoreLabel: 'YOUR SCORE',
        scoreValue: classicHits,
        saveValue: classicHits,
        field: 'score',
        extra: difficulty.toUpperCase(),
        ascending: false,
        saveMarginTop: 12,
        buttons: `
          <button class="whack-btn" style="border-color:#00e5ff;background:rgba(0,229,255,0.30)" onclick="whackPlay()">PLAY AGAIN</button>
          <button class="whack-btn" style="border-color:#00e5ff;background:rgba(0,229,255,0.30)" onclick="whackChangeMode()">CHANGE MODE</button>
          <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="nav('lobby')">BACK TO ARCADE</button>
        `,
      });
      loadRemoteBoard(boardKey, `${uid}-board`, '#00e5ff', 'score');
      mountSelectionArt(`${uid}-art`, 'whack');
      return;
    }

    if (state === 'over') {
      setArcadeExitVisible(false);
      // Score is now waves actually cleared — `wave` is the one that was in progress
      // when the run ended, so the last one *cleared* is wave-1.
      const boardKey = getWhackLeaderboardKey({ mode: gameMode, difficulty });
      const wavesCleared = Math.max(0, wave - 1);
      const key = 'whack-best-survival';
      const best = parseInt(localStorage.getItem(key)||'0');
      const isNew = wavesCleared > best;
      if (isNew) localStorage.setItem(key, wavesCleared);
      const uid = `whack-frenzy-${difficulty}`;
      wrap.innerHTML = buildArcadeResultCard({
        uid,
        boardKey,
        artGame: 'whack',
        color: '#ff00cc',
        marquee: isNew ? '🏆 NEW BEST!' : 'GAME OVER',
        marqueeEnd: '#990066',
        scoreLabel: 'YOUR SCORE',
        scoreValue: wavesCleared,
        saveValue: wavesCleared,
        field: 'score',
        extra: difficulty.toUpperCase(),
        ascending: false,
        saveMarginTop: 12,
        buttons: `
          <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="whackPlay()">PLAY AGAIN</button>
          <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="whackChangeMode()">CHANGE MODE</button>
          <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="nav('lobby')">BACK TO ARCADE</button>
        `,
      });
      loadRemoteBoard(boardKey, `${uid}-board`, '#ff00cc', 'score');
      mountSelectionArt(`${uid}-art`, 'whack');
    }
  }

  function getPopDelay() {
    // Both difficulties approach a floor asymptotically rather than a linear ramp
    // clamped by Math.max — climb toward max difficulty stretches over dozens of
    // waves and mathematically can never cross the floor. Slowed further than before
    // since waves are now zero-tolerance (a miss ends the run, not just a life) —
    // less grace per mistake means the ramp itself needs to be gentler.
    if (difficulty === 'easy') {
      const decay = 1 + (wave - 1) * 0.07 + waveHits * 0.014;
      return 260 + (900 - 260) / decay + Math.random() * 80;
    }
    // Starting pace nudged harder (790->720) and the ramp rate brought back down a
    // bit (0.15->0.11) — last pass made the climb too steep again chasing "too easy."
    const adventureHard = gameMode === 'frenzy';
    const decay = 1 + (wave - 1) * (adventureHard ? 0.15 : 0.11) + waveHits * (adventureHard ? 0.022 : 0.017);
    const popDelay = (adventureHard ? 180 : 200) + ((adventureHard ? 640 : 720) - (adventureHard ? 180 : 200)) / decay;
    return popDelay + Math.random() * (adventureHard ? 45 : 60);
  }
  function getUpTime() {
    // Floors (620ms easy / 480ms hard) were sanity-checked against human reaction
    // time for a "visually identify, then tap" task — demanding at the limit, but
    // never literally impossible no matter how long a run goes.
    if (difficulty === 'easy') {
      const decay = 1 + (wave - 1) * 0.06 + waveHits * 0.012;
      let upTime = 620 + (1450 - 620) / decay;
      upTime += (concurrencyForWave(wave) - 1) * 110;
      return upTime + Math.random() * 120;
    }
    // HARD: same asymptotic approach as getPopDelay(). Floor is 480ms — demanding
    // (requires real, sustained skill) but above the ~400ms+ that visual-search-plus-tap
    // tasks actually take even for skilled players, so it stays masterable rather than
    // becoming a wall no amount of practice gets past. Starting pace nudged harder
    // (1100->1000), ramp rate brought back down a bit (0.13->0.10) for a smoother climb.
    const adventureHard = gameMode === 'frenzy';
    const decay = 1 + (wave - 1) * (adventureHard ? 0.13 : 0.10) + waveHits * (adventureHard ? 0.019 : 0.015);
    let upTime = (adventureHard ? 450 : 480) + ((adventureHard ? 900 : 1000) - (adventureHard ? 450 : 480)) / decay;
    // More moles up at once means more to visually track — give each one a little extra
    // time so "more moles" and "less time per mole" don't both hit at once.
    upTime += (concurrencyForWave(wave) - 1) * 90;
    return upTime + Math.random() * (adventureHard ? 80 : 100);
  }
  // How many moles can be up/scheduled at once — this is what makes "overlapping moles" real
  function concurrencyForWave(w) {
    const adventureHard = gameMode === 'frenzy' && difficulty === 'hard';
    if (adventureHard) {
      if (w >= 8) return 3;
      return 2;
    }
    if (difficulty === 'easy') return w >= 7 ? 2 : 1;
    if (w >= 10) return 3;
    if (w >= 5) return 2;
    return 1;
  }

  function scheduleSurvivalNext() {
    // currentRoundType check is the real belt-and-suspenders guard here — a stray
    // timer from the normal whack pop-up/pop-down cycle has no business spawning a
    // mole (or causing a miss) during a Clear or Memory round, no matter how it
    // managed to survive a wave transition.
    if (state !== 'playing' || waveTransitioning || currentRoundType !== 'whack') return;
    const open = Array.from({length:HOLES}, (_,i) => i).filter(i => holeStates[i] === 'empty');
    if (!open.length) return;
    const i = open[Math.floor(Math.random() * open.length)];
    holeTimers[i] = setTimeout(() => popUp(i), getPopDelay());
  }

  function scheduleAll() {
    holeTimers.forEach(clearTimeout); holeTimers = [];
    scheduleSurvivalNext();
  }


  function popUp(i) {
    if (state !== 'playing' || currentRoundType !== 'whack') return; // stray call from a round that's since moved on
    if (holeStates[i] !== 'empty') {
      scheduleSurvivalNext();
      return;
    }

    let picked = moleChar;
    // Self-character rate ramps in gradually from the wave it's introduced, instead of
    // flipping on at a flat ~28% forever — under zero-tolerance that flat rate made a
    // self-hit (instant fail) feel like it could happen at any moment with no warm-up.
    if (selfActive) {
      const easy = difficulty === 'easy';
      const selfRate = Math.min(easy ? 0.16 : 0.22, (wave - selfIntroWave) * (easy ? 0.014 : 0.02));
      if (Math.random() < selfRate) picked = activeChar;
    }

    // Tease glow: doesn't directly cause a fail (tapping a glowing-but-empty hole is
    // just a no-op), but combined with the self-character risk, still worth keeping
    // gentler than the old flat rate. Ramp rate bumped up along with everything else
    // after feedback that the early game felt too slow again.
    const decoyRate = difficulty === 'easy'
      ? Math.min(0.6, 0.25 + wave * 0.01)
      : Math.min(0.85, 0.45 + wave * 0.018);
    const useDecoy = Math.random() < decoyRate;
    let teaseIdx = i;
    if (useDecoy) {
      const decoys = Array.from({length:HOLES},(_,j)=>j).filter(j=>j!==i&&holeStates[j]==='empty');
      if (decoys.length) teaseIdx = decoys[Math.floor(Math.random()*decoys.length)];
    }
    const teaseEl = document.getElementById(`wh-${teaseIdx}`);
    if (teaseEl) {
      teaseEl.classList.add('teasing');
      setTimeout(()=>teaseEl.classList.remove('teasing'), 180);
    }

    holeStates[i] = 'up'; holeCharIdx[i] = picked;
    // This reveal delay must be tracked in holeTimers[i] too (not just the popDown
    // timer assigned inside it) — otherwise clearWaveTransition()'s clearTimeout sweep
    // can't cancel it, and it fires after the wave has already moved on, showing a
    // mole that's secretly already reset to 'empty' underneath — unclickable, with no
    // visible explanation. That was the "pops up but isn't clickable" bug.
    holeTimers[i] = setTimeout(() => {
      if (state !== 'playing') return;
      const hole = document.getElementById(`wh-${i}`), charEl = document.getElementById(`wc-${i}`);
      if (!hole || !charEl) return;
      charEl.innerHTML = charHTML(picked, 'normal');
      hole.classList.add('up');
      setTint(i, picked);
      holeTimers[i] = setTimeout(() => popDown(i, false), getUpTime());
    }, 110);
  }

  // Subtle color cue: red = mole (whack it), green = your own character (don't)
  function setTint(i, ci) {
    const tint = document.getElementById(`wt-${i}`);
    if (!tint) return;
    if (ci === moleChar) {
      tint.style.background = 'radial-gradient(circle, rgba(255,40,40,0.4) 0%, transparent 72%)';
      tint.classList.add('show');
    } else if (ci === activeChar) {
      tint.style.background = 'radial-gradient(circle, rgba(40,255,120,0.4) 0%, transparent 72%)';
      tint.classList.add('show');
    } else {
      tint.classList.remove('show');
    }
  }
  function clearTint(i) {
    const tint = document.getElementById(`wt-${i}`);
    if (tint) tint.classList.remove('show');
  }
  function showMissX(i) {
    const x = document.getElementById(`wx-${i}`);
    if (x) x.classList.add('show');
  }
  function hideMissX(i) {
    const x = document.getElementById(`wx-${i}`);
    if (x) x.classList.remove('show');
  }
  function flashWhackEmptyTap(i) {
    const hole = document.getElementById(`wh-${i}`);
    if (!hole) return;
    hole.classList.remove('tap-miss');
    void hole.offsetWidth;
    hole.classList.add('tap-miss');
    setTimeout(() => hole.classList.remove('tap-miss'), 220);
    SFX.whack();
  }

  // Faded heart flash behind the board whenever a life is lost — easy to miss otherwise
  const BROKEN_HEART_HOLD_MS = 2600; // 4x the original 650ms — gives it room to register before the tap prompt shows up
  function flashBrokenHeart() {
    // Fixed overlay above everything (not "behind the board" — that put it behind the
    // opaque hole tiles where it was nearly invisible). Click-through, so it never
    // blocks the next tap, but it's now actually visible.
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9000;display:flex;align-items:center;justify-content:center;pointer-events:none;font-size:min(35vw,180px);opacity:0;transition:opacity 0.18s ease-out';
    el.textContent = '💔';
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0.38'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 250);
    }, BROKEN_HEART_HOLD_MS);
  }


  function popDown(i, wasHit) {
    const prev = holeCharIdx[i];
    // Grace window: the very first time the up-time timeout fires for a genuine miss,
    // give it one short extra window instead of failing immediately. This is purely a
    // safety margin against JS event-loop timing — a tap landing right at the edge of
    // getUpTime() can lose a race against the timer for reasons that have nothing to do
    // with the player's actual reaction speed. Under zero-tolerance, that kind of
    // un-felt timing slop now ends the whole run, so it needs covering. holeStates[i]
    // stays 'up' through this window, so a click lands exactly like a normal hit.
    // The currentRoundType checks below are the real fix for a stray timer surviving
    // a wave transition (e.g. a "post-hit cleanup" call scheduled near the end of a
    // whack/clear wave, firing 350ms later after the round has already moved on to
    // Clear or Memory) — cleanup of this hole's state/CSS always happens regardless,
    // but the *consequences* (grace window, miss-fail, rescheduling a new mole) only
    // apply if we're still actually in a whack round. Without this, a stray timer
    // could trigger a "missed mole" instant-fail during an unrelated round.
    if (!wasHit && prev === moleChar && !holeGrace[i] && currentRoundType === 'whack') {
      holeGrace[i] = true;
      holeTimers[i] = setTimeout(() => popDown(i, false), 150);
      return;
    }
    holeGrace[i] = false;
    holeStates[i] = 'empty'; holeCharIdx[i] = -1;
    const hole = document.getElementById(`wh-${i}`);
    if (!hole) return;
    hole.classList.remove('up', 'hit', 'hit-success', 'wrong-hit');

    if (!wasHit && prev === moleChar && currentRoundType === 'whack') {
      // Missed the mole — sad state, then instant fail under zero-tolerance.
      const charEl = document.getElementById(`wc-${i}`);
      if (charEl) charEl.innerHTML = charHTML(moleChar, 'sad');
      hole.classList.add('up', 'missed');
      showMissX(i);
      SFX.moleEscaped();
      setTimeout(() => failWave('💔 MISSED MOLE'), 700);
      return;
    }

    clearTint(i);
    scheduleSurvivalNext();
  }

  function addSelf() {
    // Used to show a big screen-covering warning here — removed, the VS bar already
    // communicates "don't whack" clearly enough on its own by now.
    if (selfActive) return;
    selfActive = true;
    selfIntroWave = wave; // self-hit rate ramps up gradually starting from here
  }

  window.whackHit = function(i) {
    if (state !== 'playing') return;
    if (gameMode === 'classic') { classicHit(i); return; }
    if (currentRoundType === 'memory' && memoryPhase === 'recall') { handleMemoryClick(i); return; }
    if (holeStates[i] !== 'up') {
      if (currentRoundType === 'whack') flashWhackEmptyTap(i);
      return;
    }
    const ci = holeCharIdx[i];
    holeStates[i] = 'hit';
    clearTimeout(holeTimers[i]);
    const hole = document.getElementById(`wh-${i}`), charEl = document.getElementById(`wc-${i}`);
    if (!hole || !charEl) return;

    if (ci === moleChar) {
      // hit-success (not 'hit') deliberately skips the yellow glow — that glow was
      // bleeding through behind the reaction art and reading like a weird character aura.
      charEl.innerHTML = charHTML(moleChar, 'whack') + CRACK_SVG;
      hole.classList.add('hit-success');
      clearTint(i);
      const pop = document.createElement('div');
      pop.className = 'whack-score-pop'; pop.textContent = '✓';
      pop.style.cssText = `left:${20+Math.random()*60}%;top:${20+Math.random()*40}%`;
      hole.appendChild(pop); setTimeout(() => pop.remove(), 700);
      SFX.whack(); SFX.hit();

      if (currentRoundType === 'clear') {
        // Clear rounds finish when every good target placed at round-start is hit —
        // not the usual running waveHits threshold, since this is a fixed snapshot.
        clearRoundHit++;
        clearRoundPieces = clearRoundPieces.filter(p => p.hole !== i); // stop tracking it, it's resolved
        if (clearRoundHit >= clearRoundTargets) {
          clearInterval(clearRoundInterval);
          clearInterval(clearRoundMoveInterval);
          removeClearTimerOverlay();
          removeSideBar();
          wave++;
          clearWaveTransition();
        }
        setTimeout(() => popDown(i, true), 350);
        return;
      }

      waveHits++;
      const easy = difficulty === 'easy';
      const threshold = wave === 1 ? 3 : (easy ? 8 : 5);
      if (waveHits >= threshold) {
        waveHits = 0; wave++;
        clearWaveTransition();
      }
      setTimeout(() => popDown(i, true), 350);
    } else {
      // Hit self — instant fail under zero-tolerance. Always sad, no exceptions.
      charEl.innerHTML = charHTML(ci, 'sad');
      hole.classList.add('wrong-hit');
      SFX.selfWhack();
      if (currentRoundType === 'clear') {
        // Mark the mistake, and highlight the good targets still standing so it's
        // obvious what should have been hit instead.
        showMissX(i);
        for (let h = 0; h < HOLES; h++) {
          if (holeStates[h] === 'up' && holeCharIdx[h] === moleChar) {
            const goodHole = document.getElementById(`wh-${h}`);
            if (goodHole) goodHole.classList.add('reveal-correct');
          }
        }
      }
      setTimeout(() => failWave('💔 YOU WHACKED YOURSELF'), 600);
    }
  };

  // Waves now clear-then-break instead of blending into each other: cancel anything
  // still live (no penalty — this is a deliberate transition, not a miss), show a
  // brief "WAVE CLEARED" beat, then start the next wave fresh. The old version avoided
  // any pause specifically because waves used to flow continuously into one another;
  // now that each wave is its own discrete clear-it-or-fail unit, a clean visible break
  // is the whole point.
  // Big checkmark + sound, fades in then out — confirmation that a whole wave (not
  // just one hit) is cleared. Distinct from the green hit-success outline on an
  // individual hole, which is the per-hit confirmation within a Clear/Memory round.
  function showWaveClearCheckmark(clearedWave) {
    SFX.win();
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9600;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity 0.3s ease-in-out';
    el.innerHTML = `
      <div style="font-size:min(40vw,180px);color:#33ff66;text-shadow:0 0 40px #33ff66,0 0 80px #33ff6688;line-height:1">✓</div>
      <div style="font-family:'Bebas Neue',cursive;font-size:30px;letter-spacing:4px;color:#33ff66;text-shadow:0 0 16px #33ff66;margin-top:10px">WAVE ${clearedWave} CLEARED</div>
    `;
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '1'; });
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 350);
    }, 900);
  }

  function clearWaveTransition() {
    waveTransitioning = true; // blocks scheduleSurvivalNext() for the whole pause,
                               // including from any stale "just hit" timer firing late
    holeTimers.forEach(clearTimeout);
    // Sweeps everything except a hole still in 'hit' state (the just-landed hit that
    // triggered this transition — let its own 350ms popDown finish resolving naturally
    // rather than clipping it). Not gated on holeStates[h]==='up' like before — Memory
    // round targets only ever touch CSS classes/content directly, never holeStates, so
    // that old conditional check would've missed them and left stale visuals behind.
    for (let h = 0; h < HOLES; h++) {
      if (holeStates[h] === 'hit') continue;
      holeStates[h] = 'empty'; holeCharIdx[h] = -1;
      const hole = document.getElementById(`wh-${h}`), charEl = document.getElementById(`wc-${h}`);
      if (hole) hole.classList.remove('up','hit','hit-success','wrong-hit','missed');
      if (charEl) charEl.innerHTML = '';
      clearTint(h); hideMissX(h);
    }

    // Phase 1: "WAVE {n-1} CLEARED" + checkmark — the wave number belongs here, not
    // in the next wave's intro.
    const clearedWave = wave - 1;
    const wm = document.getElementById('whack-wave-mode');
    if (wm) wm.textContent = `WAVE ${clearedWave} CLEARED`;
    showWaveClearCheckmark(clearedWave);
    currentRoundType = pickRoundType(wave);
    // Trigger from the upcoming wave state here; the old whack-hit path remembered
    // the previous round, so wave 4 was missed because wave 3 is a Memory round.
    if (wave === 4 && currentRoundType === 'whack' && !selfActive) setTimeout(addSelf, 900);

    setTimeout(() => {
      if (state !== 'playing') return;
      // Phase 2: next wave's mode intro — big bold mode phrase, no wave number.
      const wm2 = document.getElementById('whack-wave-mode');
      if (wm2) wm2.innerHTML = whackWaveHeaderHTML();
      const vs = vsLabels();
      const dontEl = document.getElementById('whack-vs-dont'), doEl = document.getElementById('whack-vs-do');
      if (dontEl) dontEl.innerHTML = `DON'T<br>${vs.verb}`;
      if (doEl) doEl.innerHTML = vs.verb;

      const startRound = () => {
        if (state !== 'playing') return;
        waveTransitioning = false;
        if (currentRoundType === 'clear') { startClearRound(); return; }
        if (currentRoundType === 'memory') { startMemoryRound(); return; }
        const n = concurrencyForWave(wave);
        for (let k = 0; k < n; k++) scheduleSurvivalNext();
      };

      playModeIntro(currentRoundType, startRound);
    }, 1300);
  }

  // Clear round: several holes fill at once (mixed good/bad, no decoy trickery — the
  // whole point is a clean snapshot to scan), with a countdown to clear every good one.
  // A bad hit still ends the run instantly (whackHit's self-hit branch is unchanged and
  // applies here too); running out of time does the same via failWave().
  // 8-directional neighbors on the 3-col x 4-row board — used to give Clear-round
  // pieces somewhere valid to hop to.
  function getNeighbors(i) {
    const row = Math.floor(i / GRID_COLS), col = i % GRID_COLS;
    const out = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const r = row + dr, c = col + dc;
        if (r >= 0 && r < GRID_ROWS && c >= 0 && c < GRID_COLS) out.push(r * GRID_COLS + c);
      }
    }
    return out;
  }

  function startClearRound() {
    clearRoundAppearances++;
    const firstAdventureHardClear = gameMode === 'frenzy' && difficulty === 'hard' && clearRoundAppearances === 1;
    const goodCount = firstAdventureHardClear ? 6 : (difficulty === 'easy' ? 4 : 5), badCount = firstAdventureHardClear ? 3 : (difficulty === 'easy' ? 1 : 2);
    const open = Array.from({length: HOLES}, (_, i) => i);
    for (let i = open.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [open[i], open[j]] = [open[j], open[i]];
    }
    const chosen = open.slice(0, goodCount + badCount);
    clearRoundTargets = goodCount;
    clearRoundHit = 0;
    clearRoundPieces = chosen.map((hi, idx) => ({ hole: hi, ci: idx < goodCount ? moleChar : activeChar }));
    chosen.forEach((hi, idx) => {
      const ci = idx < goodCount ? moleChar : activeChar;
      holeStates[hi] = 'up'; holeCharIdx[hi] = ci;
      const hole = document.getElementById(`wh-${hi}`), charEl = document.getElementById(`wc-${hi}`);
      if (hole && charEl) {
        charEl.innerHTML = charHTML(ci, 'normal');
        hole.classList.add('up');
        setTint(hi, ci);
      }
    });
    const clearRoundSeconds = getClearRoundSeconds();
    clearRoundTimeLeft = clearRoundSeconds;
    showClearTimerOverlay();
    updateClearTimerDisplay();
    showSideBar();
    updateSideBar(100, 1);
    SFX.raceStart();
    clearInterval(clearRoundInterval);
    clearRoundInterval = setInterval(() => {
      clearRoundTimeLeft--;
      updateClearTimerDisplay();
      updateSideBar((clearRoundTimeLeft / clearRoundSeconds) * 100, 1);
      if (clearRoundTimeLeft <= 0) {
        clearInterval(clearRoundInterval);
        for (let h = 0; h < HOLES; h++) {
          if (holeStates[h] === 'up' && holeCharIdx[h] === moleChar) {
            const charEl = document.getElementById(`wc-${h}`);
            const holeEl = document.getElementById(`wh-${h}`);
            if (charEl) charEl.innerHTML = charHTML(moleChar, 'sad');
            if (holeEl) holeEl.classList.add('missed');
          }
        }
        failWave('⏰ TIME UP!');
      }
    }, 1000);

    // Pieces stay put on the first couple Clear rounds so the mechanic itself isn't
    // sprung on the player along with everything else — easy gets an extra calm
    // appearance and a gentler, slower-floor ramp once they do start moving.
    clearInterval(clearRoundMoveInterval);
    const moveGrace = difficulty === 'easy' ? 2 : 1;
    if (clearRoundAppearances > moveGrace) {
      const moveMs = difficulty === 'easy'
        ? Math.max(1000, 2400 - (clearRoundAppearances - moveGrace - 1) * 150)
        : Math.max(700, 2000 - (clearRoundAppearances - moveGrace - 1) * 200);
      clearRoundMoveInterval = setInterval(moveClearRoundPieces, moveMs);
    }
  }

  function moveClearRoundPieces() {
    if (state !== 'playing' || currentRoundType !== 'clear') {
      clearInterval(clearRoundMoveInterval);
      return;
    }
    const occupied = new Set(clearRoundPieces.map(p => p.hole));
    clearRoundPieces.forEach(piece => {
      const oldHoleIdx = piece.hole;
      const options = getNeighbors(oldHoleIdx).filter(n => !occupied.has(n) && holeStates[n] === 'empty');
      if (!options.length) return; // nowhere to go this tick, stays put
      const dest = options[Math.floor(Math.random() * options.length)];

      const oldHoleEl = document.getElementById(`wh-${oldHoleIdx}`), oldCharEl = document.getElementById(`wc-${oldHoleIdx}`);
      const newHoleEl = document.getElementById(`wh-${dest}`), newCharEl = document.getElementById(`wc-${dest}`);

      occupied.delete(oldHoleIdx);
      holeStates[oldHoleIdx] = 'empty'; holeCharIdx[oldHoleIdx] = -1;
      if (oldHoleEl) oldHoleEl.classList.remove('up');
      if (oldCharEl) oldCharEl.innerHTML = '';
      clearTint(oldHoleIdx);

      piece.hole = dest;
      occupied.add(dest);
      holeStates[dest] = 'up'; holeCharIdx[dest] = piece.ci;
      if (newHoleEl) newHoleEl.classList.add('up');
      setTint(dest, piece.ci);

      // Slide instead of teleport: place the character in its new hole, but offset
      // by exactly the distance back to the old hole, then animate that offset to
      // zero. Wrapped in its own inner div rather than touching .whack-char's own
      // transform directly, since that's already doing the translateX(-50%) centering
      // for the pop-up animation and overwriting it would knock that off-center.
      if (newCharEl && oldHoleEl && newHoleEl) {
        const oldRect = oldHoleEl.getBoundingClientRect();
        const newRect = newHoleEl.getBoundingClientRect();
        const dx = oldRect.left - newRect.left, dy = oldRect.top - newRect.top;
        const slideId = `wslide-${dest}`;
        newCharEl.innerHTML = `<div id="${slideId}" style="width:100%;height:100%;transform:translate(${dx}px,${dy}px)">${charHTML(piece.ci, 'normal')}</div>`;
        requestAnimationFrame(() => {
          const slideEl = document.getElementById(slideId);
          if (slideEl) {
            slideEl.style.transition = 'transform 0.35s ease-in-out';
            slideEl.style.transform = 'translate(0,0)';
          }
        });
      }
    });
  }

  // ── Classic mode ── standalone 30s score-attack: no waves, no self-character to
  // avoid — every spawn is the single character chosen at mole-select, hit anything.
  // Moles continuously reposition between holes like Clear's pieces, but each on its
  // own independently-timed clock instead of one shared interval, so speeds can be
  // staggered per-mole rather than uniform.
  const CLASSIC_SPEED_TIERS = [
    { weight: 0.35, ms: () => 1800 + Math.random() * 600 },  // lingers
    { weight: 0.40, ms: () => 1000 + Math.random() * 400 },  // normal
    { weight: 0.25, ms: () => 650  + Math.random() * 200 },  // fast — floor stays tappable
  ];
  function rollClassicSpeed() {
    // Hard shifts the mix toward faster tiers rather than lowering the floor, so
    // "never faster than humanly possible" holds at both difficulties.
    const tiers = difficulty === 'hard'
      ? [{ weight: 0.20, ms: CLASSIC_SPEED_TIERS[0].ms }, { weight: 0.35, ms: CLASSIC_SPEED_TIERS[1].ms }, { weight: 0.45, ms: CLASSIC_SPEED_TIERS[2].ms }]
      : CLASSIC_SPEED_TIERS;
    const r = Math.random();
    let acc = 0;
    for (const t of tiers) { acc += t.weight; if (r <= acc) return t.ms(); }
    return tiers[0].ms();
  }
  function classicConcurrency() { return difficulty === 'easy' ? 3 : 5; }
  function classicEmptyHoles() {
    const occupied = new Set(classicPieces.map(p => p.hole));
    const out = [];
    for (let h = 0; h < HOLES; h++) if (!occupied.has(h)) out.push(h);
    return out;
  }

  function classicSpawnPiece(hole) {
    const piece = { hole, timer: null };
    classicPieces.push(piece);
    holeStates[hole] = 'up'; holeCharIdx[hole] = moleChar;
    const holeEl = document.getElementById(`wh-${hole}`), charEl = document.getElementById(`wc-${hole}`);
    if (holeEl && charEl) {
      charEl.innerHTML = charHTML(moleChar, 'normal');
      holeEl.classList.add('up');
      setTint(hole, moleChar);
    }
    piece.timer = setTimeout(() => classicRelocate(piece), rollClassicSpeed());
  }

  function classicRelocate(piece) {
    if (state !== 'playing' || gameMode !== 'classic') return;
    const occupied = new Set(classicPieces.map(p => p.hole));
    const options = getNeighbors(piece.hole).filter(n => !occupied.has(n) && holeStates[n] === 'empty');
    if (!options.length) {
      piece.timer = setTimeout(() => classicRelocate(piece), rollClassicSpeed());
      return;
    }
    const dest = options[Math.floor(Math.random() * options.length)];
    const oldHoleIdx = piece.hole;
    const oldHoleEl = document.getElementById(`wh-${oldHoleIdx}`), oldCharEl = document.getElementById(`wc-${oldHoleIdx}`);
    const newHoleEl = document.getElementById(`wh-${dest}`), newCharEl = document.getElementById(`wc-${dest}`);

    holeStates[oldHoleIdx] = 'empty'; holeCharIdx[oldHoleIdx] = -1;
    if (oldHoleEl) oldHoleEl.classList.remove('up');
    if (oldCharEl) oldCharEl.innerHTML = '';
    clearTint(oldHoleIdx);

    piece.hole = dest;
    holeStates[dest] = 'up'; holeCharIdx[dest] = moleChar;
    if (newHoleEl) newHoleEl.classList.add('up');
    setTint(dest, moleChar);

    // Same slide-instead-of-teleport technique as moveClearRoundPieces().
    if (newCharEl && oldHoleEl && newHoleEl) {
      const oldRect = oldHoleEl.getBoundingClientRect();
      const newRect = newHoleEl.getBoundingClientRect();
      const dx = oldRect.left - newRect.left, dy = oldRect.top - newRect.top;
      const slideId = `cslide-${dest}`;
      newCharEl.innerHTML = `<div id="${slideId}" style="width:100%;height:100%;transform:translate(${dx}px,${dy}px)">${charHTML(moleChar, 'normal')}</div>`;
      requestAnimationFrame(() => {
        const slideEl = document.getElementById(slideId);
        if (slideEl) { slideEl.style.transition = 'transform 0.35s ease-in-out'; slideEl.style.transform = 'translate(0,0)'; }
      });
    }
    piece.timer = setTimeout(() => classicRelocate(piece), rollClassicSpeed());
  }

  function classicHit(i) {
    const idx = classicPieces.findIndex(p => p.hole === i);
    if (idx === -1) { flashWhackEmptyTap(i); return; }
    const piece = classicPieces[idx];
    clearTimeout(piece.timer);
    classicPieces.splice(idx, 1);
    classicHits++;

    const holeEl = document.getElementById(`wh-${i}`), charEl = document.getElementById(`wc-${i}`);
    holeStates[i] = 'hit'; holeCharIdx[i] = -1;
    if (charEl) charEl.innerHTML = charHTML(moleChar, 'whack') + CRACK_SVG;
    if (holeEl) holeEl.classList.add('hit-success');
    clearTint(i);
    SFX.whack(); SFX.hit();
    const hitsEl = document.getElementById('classic-hits');
    if (hitsEl) hitsEl.textContent = classicHits;

    setTimeout(() => {
      if (state !== 'playing' || gameMode !== 'classic') return;
      if (holeEl) { holeEl.classList.remove('hit-success', 'up'); }
      if (charEl) charEl.innerHTML = '';
      holeStates[i] = 'empty';
      const empties = classicEmptyHoles();
      if (!empties.length) return;
      classicSpawnPiece(empties[Math.floor(Math.random() * empties.length)]);
    }, 250);
  }

  const CLASSIC_DURATION_S = 30;
  function classicStart() {
    classicHits = 0;
    classicPieces.forEach(p => clearTimeout(p.timer));
    classicPieces = [];
    classicTimeLeft = CLASSIC_DURATION_S;
    for (let h = 0; h < HOLES; h++) { holeStates[h] = 'empty'; holeCharIdx[h] = -1; }
    const n = Math.min(classicConcurrency(), HOLES);
    const open = Array.from({ length: HOLES }, (_, i) => i);
    for (let i = open.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [open[i], open[j]] = [open[j], open[i]];
    }
    for (let k = 0; k < n; k++) classicSpawnPiece(open[k]);
    showSideBar();
    updateSideBar(100, 1);
    clearInterval(classicInterval);
    classicInterval = setInterval(() => {
      classicTimeLeft--;
      updateSideBar((classicTimeLeft / CLASSIC_DURATION_S) * 100, 1);
      const tEl = document.getElementById('classic-time');
      if (tEl) tEl.textContent = classicTimeLeft;
      if (classicTimeLeft <= 0) { clearInterval(classicInterval); classicEnd(); }
    }, 1000);
  }

  function classicEnd() {
    clearInterval(classicInterval);
    classicPieces.forEach(p => clearTimeout(p.timer));
    classicPieces = [];
    removeSideBar();
    // No failWave()/broken-heart flash — Classic only ends on the clock, never on a
    // mistake, so it goes straight to the game-over screen.
    showWhackGameOver();
  }

  function showWhackGameOver() {
    holeTimers.forEach(clearTimeout);
    clearInterval(timerInterval);
    clearInterval(clearRoundInterval);
    clearInterval(clearRoundMoveInterval);
    classicPieces.forEach(p => clearTimeout(p.timer));
    classicPieces = [];
    clearInterval(classicInterval);
    removeSideBar();
    removeClearTimerOverlay();
    document.querySelectorAll('.whack-intro-overlay').forEach(el => el.remove());
    const tapOv = document.getElementById('whack-gameover-tap');
    if (tapOv) tapOv.remove();
    awaitingGameOverTap = false;
    memoryPhase = null;
    waveTransitioning = false;
    state = 'over';
    render();
    const wrap = document.getElementById('whack-wrap');
    if (wrap) wrap.scrollTop = 0;
  }

  // Measures the actual HUD bar (wave/mode line + VS row) and covers it exactly,
  // opaque, for the duration of the round — replaces both with just the countdown
  // rather than floating a separate badge over the gameplay area.
  let clearTimerOverlayEl = null;
  function showClearTimerOverlay() {
    removeClearTimerOverlay();
    const hud = document.querySelector('.whack-hud');
    if (!hud) return;
    const rect = hud.getBoundingClientRect();
    clearTimerOverlayEl = document.createElement('div');
    clearTimerOverlayEl.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.left}px;width:${rect.width}px;height:${rect.height}px;z-index:9400;pointer-events:none;display:flex;align-items:center;justify-content:center;background:#150a28;border-radius:6px;border:1px solid rgba(255,230,26,0.3)`;
    clearTimerOverlayEl.innerHTML = `<div id="whack-clear-overlay-txt" style="font-family:'Bebas Neue',cursive;font-size:30px;letter-spacing:4px;color:#ffe61a;text-shadow:0 0 14px #ffe61a"></div>`;
    document.body.appendChild(clearTimerOverlayEl);
  }
  function removeClearTimerOverlay() {
    if (clearTimerOverlayEl) { clearTimerOverlayEl.remove(); clearTimerOverlayEl = null; }
  }

  function updateClearTimerDisplay() {
    const txt = document.getElementById('whack-clear-overlay-txt');
    if (!txt) return;
    txt.textContent = `⏰ CLEAR! ${clearRoundTimeLeft}s`;
    txt.style.color = clearRoundTimeLeft <= 3 ? '#ff4444' : '#ffe61a';
  }

  // Vertical countdown bar to the right of the board — fixed-positioned against the
  // grid's own measured rect (same trick as the HUD overlay above) so it tracks the
  // board regardless of layout. The fill is bottom-anchored so it drains from the top
  // down rather than shrinking from the bottom up. Shared by Clear (ticks once a
  // second, so the CSS transition smooths between ticks) and Memory (driven every
  // frame via rAF, so no CSS transition is needed there).
  let sideBarEl = null;
  // theme: 'yellow' (Clear's countdown, default) or 'memorize' (Memory round's
  // memorize window) — memorize gets a blue glow so the bar itself signals "this is
  // memorize time," matching Memory's blue branding instead of Clear's yellow.
  function showSideBar(theme) {
    removeSideBar();
    const grid = document.getElementById('whack-grid');
    if (!grid) return;
    const isMemorize = theme === 'memorize';
    const borderColor = isMemorize ? 'rgba(0,229,255,0.4)' : 'rgba(255,230,26,0.25)';
    const fillColor = isMemorize ? 'rgba(0,229,255,0.55)' : 'rgba(255,230,26,0.5)';
    const glowColor = isMemorize ? 'rgba(0,229,255,0.7)' : 'rgba(255,230,26,0.35)';
    const rect = grid.getBoundingClientRect();
    sideBarEl = document.createElement('div');
    sideBarEl.dataset.theme = theme || 'yellow';
    sideBarEl.style.cssText = `position:fixed;top:${rect.top}px;left:${rect.right + 10}px;width:12px;height:${rect.height}px;z-index:9400;pointer-events:none;background:rgba(0,0,0,0.35);border:1px solid ${borderColor};border-radius:6px;overflow:hidden;${isMemorize ? `box-shadow:0 0 14px ${glowColor};` : ''}`;
    sideBarEl.innerHTML = `<div id="whack-sidebar-fill" style="position:absolute;bottom:0;left:0;width:100%;height:100%;background:${fillColor};box-shadow:0 0 8px ${glowColor};transition:background 0.3s"></div>`;
    document.body.appendChild(sideBarEl);
  }
  function removeSideBar() {
    if (sideBarEl) { sideBarEl.remove(); sideBarEl = null; }
  }
  function updateSideBar(pct, smoothSeconds) {
    const fill = document.getElementById('whack-sidebar-fill');
    if (!fill) return;
    const isMemorize = sideBarEl && sideBarEl.dataset.theme === 'memorize';
    fill.style.transition = smoothSeconds ? `height ${smoothSeconds}s linear,background 0.3s` : 'background 0.3s';
    fill.style.height = Math.max(0, pct) + '%';
    fill.style.background = pct <= 30 ? 'rgba(255,68,68,0.55)' : isMemorize ? 'rgba(0,229,255,0.55)' : 'rgba(255,230,26,0.5)';
  }

  // Shared by startMemoryRound() and the next-wave intro overlay, so the announced
  // memorize time and the actual one always match — appearanceCount is "which Memory
  // round is this" (1st, 2nd, ...), not memoryAppearances directly, since the overlay
  // needs to predict the upcoming round's value before it's actually started.
  // Hard's two difficulty levers (time to memorize, and how much there is to
  // memorize) alternate one step at a time instead of both ramping every appearance —
  // each new appearance either trims 0.5s off the clock OR adds one more target, never
  // both, so "harder" always reads as one clear change rather than a compound jump.
  // Time stays in clean 0.5s increments throughout (4.0, 3.5, 3.0, ... down to a 1.5s floor).
  function memoryHardStep(appearanceCount) {
    return Math.max(0, appearanceCount - 3); // same 3-appearance grace period as before
  }
  function getMemorizeMs(appearanceCount) {
    if (difficulty === 'easy') {
      const tier = Math.max(0, appearanceCount - 5); // longer grace period before scaling kicks in
      return Math.max(2200, 3200 - tier * 100); // more time throughout, slower decay
    }
    const step = memoryHardStep(appearanceCount);
    const timeSteps = Math.ceil(step / 2); // time moves on odd steps
    return Math.max(1.5, 4 - timeSteps * 0.5) * 1000;
  }
  function getMemoryGoodCount(appearanceCount) {
    if (difficulty === 'easy') {
      const tier = Math.max(0, appearanceCount - 5);
      return Math.min(6, 3 + Math.floor(tier / 3)); // starts with fewer targets, grows slower
    }
    const step = memoryHardStep(appearanceCount);
    const patternSteps = Math.floor(step / 2); // pattern moves on even steps
    return Math.min(8, 5 + patternSteps);
  }

  const MEMORY_INTRO_MS = 0; // Reveal memorize targets immediately after the wave title; no blank-board pause
  function startMemoryRound() {
    memoryAppearances++;
    // Same difficulty for the first few appearances, then scales up gradually: more
    // targets, less time to memorize, and — a few appearances in — your own character
    // shows up among the targets purely as visual noise. It's never a target itself
    // (recall logic only ever checks memoryTargets), but it's one more face to filter
    // out while memorizing, which is real extra load even though the actual pattern
    // of correct spots hasn't changed.
    const goodCount = getMemoryGoodCount(memoryAppearances);
    const memorizeMs = getMemorizeMs(memoryAppearances);
    const showDistraction = memoryAppearances > (difficulty === 'easy' ? 6 : 4);

    const open = Array.from({length: HOLES}, (_, i) => i);
    for (let i = open.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [open[i], open[j]] = [open[j], open[i]];
    }
    memoryTargets = open.slice(0, goodCount);
    const distractionHoles = showDistraction ? open.slice(goodCount, goodCount + 2) : [];
    memoryHit = 0;
    // 'intro': board stays blank for a beat before targets reveal. No big "MEMORIZE"
    // flash here anymore — the wave-start title ("MEMORIZE THE BOARD") already covers
    // that, and the two together read as a redundant double message.
    memoryPhase = 'intro';
    const wm = document.getElementById('whack-wave-mode');
    if (wm) wm.innerHTML = whackWaveHeaderHTML('MEMORIZE');

    setTimeout(() => {
      if (state !== 'playing' || memoryPhase !== 'intro') return;
      memoryPhase = 'showing';
      memoryTargets.forEach(hi => {
        const hole = document.getElementById(`wh-${hi}`), charEl = document.getElementById(`wc-${hi}`);
        if (hole && charEl) { charEl.innerHTML = charHTML(moleChar, 'normal'); hole.classList.add('up'); }
      });
      distractionHoles.forEach(hi => {
        const hole = document.getElementById(`wh-${hi}`), charEl = document.getElementById(`wc-${hi}`);
        if (hole && charEl) { charEl.innerHTML = charHTML(activeChar, 'normal'); hole.classList.add('up'); }
      });
      const wgEl = document.getElementById('whack-grid');
      if (wgEl) wgEl.classList.add('memorize-glow');
      // Drop the HUD entirely for this window — it's the one thing new players kept
      // tapping through before actually looking. Just the grid, the glow, and a big
      // "MEMORIZE" standing in for it, so there's nothing else competing for attention.
      const hudBar = document.getElementById('whack-hud-bar'), banner = document.getElementById('whack-memorize-banner');
      if (hudBar) hudBar.style.display = 'none';
      if (banner) banner.style.display = 'block';
      driveMemorizeSideBar(memorizeMs);

      setTimeout(() => {
        if (state !== 'playing') return;
        const wgEl2 = document.getElementById('whack-grid');
        if (wgEl2) wgEl2.classList.remove('memorize-glow');
        const hudBar2 = document.getElementById('whack-hud-bar'), banner2 = document.getElementById('whack-memorize-banner');
        if (hudBar2) hudBar2.style.display = '';
        if (banner2) banner2.style.display = 'none';
        // Every hole becomes a face-down card — not just the targets — so the board
        // reads as "N cards, flip to find the ones you memorized" rather than some holes
        // being mysteriously blank and others not. The "?" cover slides in left-to-right
        // over whatever was showing (rather than an instant swap), staggered by column
        // so the whole board reads as one sweep moving left to right — this is the real
        // version of the same motion previewed in the first-time intro.
        for (let h = 0; h < HOLES; h++) {
          const hole = document.getElementById(`wh-${h}`), charEl = document.getElementById(`wc-${h}`);
          if (!hole || !charEl) continue;
          hole.classList.add('up');
          const oldContent = charEl.innerHTML;
          const col = h % GRID_COLS;
          // A permanent clipping wrapper (inset:8%, matching .whack-card-flip's own
          // sizing) hides the card while it's offset — so it looks like it slides out
          // from a hidden compartment behind the left edge, not like it flies in from
          // off-screen. The clipping lives on this wrapper, not on .whack-card-flip
          // itself, since overflow:hidden would force transform-style:flat and break
          // its own later 3D rotateY flip-on-click.
          charEl.innerHTML = `<div style="position:absolute;inset:8%;overflow:hidden;border-radius:10px">
            <div id="wold-${h}" style="position:absolute;inset:0">${oldContent}</div>
            <div class="whack-card-flip" id="wflip-${h}" style="inset:0;transform:translateX(-100%)">
              <div class="whack-card-back" id="wback-${h}">?</div>
              <div class="whack-card-face" id="wface-${h}"></div>
            </div>
          </div>`;
          setTimeout(() => {
            requestAnimationFrame(() => {
              const flipEl = document.getElementById(`wflip-${h}`);
              if (!flipEl) return;
              flipEl.style.animation = 'cabinet-slide-cover 0.65s cubic-bezier(0.32,1.2,0.66,1) forwards';
              flipEl.addEventListener('animationend', () => {
                // Clear the inline animation/transform once settled — animation output
                // has higher specificity than the .flipped class rule and would
                // otherwise block the later 3D rotate-on-click.
                flipEl.style.animation = '';
                flipEl.style.transform = '';
                // The old revealed content is fully hidden behind the "?" cover now and
                // never needs to show again — remove it so it can't peek through during
                // the later 3D rotateY flip. preserve-3d lets a flat sibling sitting
                // behind a rotating element become visible at in-between angles, which
                // is exactly the "stacking" look this was causing.
                const oldEl = document.getElementById(`wold-${h}`);
                if (oldEl) oldEl.remove();
              }, { once: true });
            });
          }, col * 45);
        }
        memoryPhase = 'recall';
        const wm2 = document.getElementById('whack-wave-mode');
        if (wm2) wm2.innerHTML = whackWaveHeaderHTML();
      }, memorizeMs);
    }, MEMORY_INTRO_MS);
  }

  // Routed here from whackHit() while memoryPhase === 'recall' — every hole is a
  // flippable card now (not just the 5 targets), so this bypasses the normal
  // holeStates-driven click handling entirely.
  function handleMemoryClick(i) {
    if (memoryPhase !== 'recall') return;
    const flip = document.getElementById(`wflip-${i}`);
    if (!flip || flip.classList.contains('flipped')) return; // already flipped, ignore
    flip.classList.add('flipped');
    const faceEl = document.getElementById(`wface-${i}`);

    if (memoryTargets.includes(i)) {
      if (faceEl) faceEl.innerHTML = charHTML(moleChar, 'whack') + CRACK_SVG;
      const holeEl = document.getElementById(`wh-${i}`);
      if (holeEl) holeEl.classList.add('hit-success');
      SFX.whack(); SFX.hit();
      memoryHit++;
      if (memoryHit >= memoryTargets.length) {
        memoryPhase = null;
        // Hold the final correct flip on screen for a beat before moving on, instead
        // of cutting straight to the wave-clear transition.
        setTimeout(() => { wave++; clearWaveTransition(); }, 1000);
      }
    } else {
      if (faceEl) faceEl.innerHTML = `<div style="font-family:'Bebas Neue',cursive;font-size:32px;color:#ff4444">✕</div>`;
      SFX.moleEscaped();
      memoryPhase = null;
      // Same idea — let the wrong flip actually be visible before the freeze screen.
      setTimeout(() => failWave('WRONG SPOT!'), 600);
    }
  }

  // Called from nav() whenever leaving the whack page (mirrors spacePause()'s role
  // for Space) — stops every pending timer and removes every body-level floating
  // element Whack creates (side bar, Clear's timer overlay, a stray intro overlay),
  // since exiting early via "ARCADE MENU" never naturally reaches the code paths
  // that would otherwise clean those up.
  window.whackBack = function() {
    holeTimers.forEach(clearTimeout); clearInterval(timerInterval);
    clearInterval(clearRoundInterval); clearInterval(clearRoundMoveInterval);
    classicPieces.forEach(p => clearTimeout(p.timer)); classicPieces = []; clearInterval(classicInterval);
    removeSideBar();
    removeClearTimerOverlay();
    document.querySelectorAll('.whack-intro-overlay').forEach(el => el.remove());
    const tapOv = document.getElementById('whack-gameover-tap');
    if (tapOv) tapOv.remove();
    awaitingGameOverTap = false;
    // No ArcadeMusic call here — nav() already ducks/unducks correctly based on
    // the destination page; doing it here too could un-duck when navigating
    // straight into another arcade game.
  };

  window.whackPlay = function() {
    holeTimers.forEach(clearTimeout); clearInterval(timerInterval);
    introShownFor = { whack: false, clear: false, memory: false };
    adventureIntroShown = false;
    activeChar = getGlobalChar();
    moleChar = pickMole();
    wave = 1; waveHits = 0;
    selfActive = false; selfIntroWave = 0; waveTransitioning = false;
    currentRoundType = 'whack'; clearInterval(clearRoundInterval); clearInterval(clearRoundMoveInterval); memoryPhase = null; removeClearTimerOverlay(); removeSideBar(); memoryAppearances = 0; clearRoundAppearances = 0;
    classicPieces.forEach(p => clearTimeout(p.timer)); classicPieces = []; clearInterval(classicInterval); classicHits = 0;
    holeStates = Array(HOLES).fill('empty');
    holeCharIdx = Array(HOLES).fill(-1);
    holeGrace = Array(HOLES).fill(false);
    holeTimers   = Array(HOLES).fill(null);
    state = 'mole-select'; render();
    if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
    else ArcadeMusic.unduck();
  };

  window.whackChangeMode = function() {
    window.whackBack();
    state = 'mode-select';
    render();
    if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
    else ArcadeMusic.unduck();
  };

  // Strict repeating cycle, not chance — WHACK, CLEAR, MEMORY, WHACK, CLEAR, MEMORY...
  // Wave 1 is always WHACK, Clear lands on wave 2, Memory on wave 3, then it repeats.
  const ROUND_CYCLE = ['whack', 'clear', 'memory'];
  function pickRoundType(w) {
    return ROUND_CYCLE[(w - 1) % ROUND_CYCLE.length];
  }

  // Short verb — used by the persistent HUD line ("WAVE N: WHACK"), which has limited
  // space and updates every wave.
  function roundTypeLabel() {
    if (currentRoundType === 'clear') return 'CLEAR';
    if (currentRoundType === 'memory') return 'MEMORIZE';
    return 'WHACK';
  }

  // Full phrase — used for the big, transient next-wave intro overlay, where there's
  // room to spell it out and it reads more clearly than a bare verb.
  function roundTypePhrase() {
    if (currentRoundType === 'clear') return 'CLEAR THE MOLES';
    if (currentRoundType === 'memory') return 'MEMORIZE THE BOARD';
    return 'WHACK THE MOLE';
  }

  function vsLabels() {
    if (currentRoundType === 'clear') return { dont: "DON'T CLEAR", verb: 'CLEAR' };
    if (currentRoundType === 'memory') return { dont: "DON'T FIND", verb: 'FIND' };
    return { dont: "DON'T WHACK", verb: 'WHACK' };
  }

  // Next-wave intro — now includes the upcoming wave number above the mode label
  // so players can track the Adventure sequence at a glance.
  function showWaveStartOverlay() {
    const ann = document.createElement('div');
    ann.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none';
    const meta = stageMeta(currentRoundType);
    // Clear and Memory rounds each get an extra line up front naming the time limit
    // they're about to be working against — Whack has no such limit, so it gets none.
    const subLine = currentRoundType === 'clear'
      ? `<span style="font-size:22px;color:#ffe61a">${getClearRoundSeconds()} SECONDS</span>`
      : currentRoundType === 'memory'
      ? `<span style="font-size:22px;color:#ffe61a">${(getMemorizeMs(memoryAppearances + 1) / 1000).toFixed(1)} SECONDS</span>`
      : '';
    ann.innerHTML = `<div style="text-align:center;animation:wave-announce 2.2s ease-out forwards">
      ${stageAnnouncementHTML(currentRoundType, roundTypePhrase(), meta.color, 46)}
      ${subLine ? `<div style="font-family:'VCR',monospace;font-size:13px;letter-spacing:2px;color:rgba(242,239,232,0.7);margin-top:10px;line-height:1.8">${subLine}</div>` : ''}
    </div>`;
    document.body.appendChild(ann);
    setTimeout(() => ann.remove(), 2200);
  }

  // ── First-time mode intros ──────────────────────────────────────────────────
  // New players were confused about what to do, so the very first time each round
  // type comes up, it gets a slower, more explicit walkthrough instead of the normal
  // quick wave-start overlay. introShownFor (declared above) tracks which modes have
  // already had theirs this run. Runs a list of {duration, show} steps strictly in
  // order, bailing out cleanly if the game ends mid-sequence.
  function ensureIntroSkipButton(overlay, onSkip) {
    if (!overlay || !onSkip || overlay.querySelector('.intro-skip-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'intro-skip-btn';
    btn.textContent = 'SKIP';
    btn.style.cssText = "position:fixed;top:max(10px, env(safe-area-inset-top, 10px));right:calc(max(10px, env(safe-area-inset-right, 10px)) + 44px);z-index:10000;pointer-events:auto;height:32px;min-height:32px;box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;font-family:'VCR',monospace;font-size:10px;letter-spacing:2px;background:none;border:1px solid rgba(242,239,232,0.2);border-radius:6px;padding:0 12px;color:rgba(242,239,232,0.5);cursor:pointer";
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      onSkip();
    };
    overlay.appendChild(btn);
  }

  function playIntroSteps(steps, onComplete, overlay, onSkip) {
    let i = 0;
    let timeoutId = null;
    let done = false;
    function cancel() {
      if (done) return;
      done = true;
      if (timeoutId) clearTimeout(timeoutId);
    }
    function finish() {
      if (done) return;
      done = true;
      if (timeoutId) clearTimeout(timeoutId);
      onComplete();
    }
    function tick() {
      if (done || state !== 'playing') return;
      if (i >= steps.length) { finish(); return; }
      const step = steps[i++];
      step.show();
      ensureIntroSkipButton(overlay, onSkip);
      timeoutId = setTimeout(tick, step.duration);
    }
    tick();
    return { cancel, finish };
  }

  function introHeadline(text, color, size) {
    return `<div style="font-family:'Bebas Neue',cursive;font-size:${size||42}px;letter-spacing:3px;color:${color};text-shadow:0 0 20px ${color},0 0 40px ${color}66;text-align:center;line-height:1.2">${text}</div>`;
  }
  function stageMeta(type) {
    if (type === 'clear') return { label: 'CLEAR', color: '#ffe61a', icon: 'grid' };
    if (type === 'memory') return { label: 'MEMORIZE', color: '#00e5ff', icon: 'cards' };
    return { label: 'WHACK', color: '#ff00cc', icon: 'burst' };
  }
  function stageIconHTML(type, color, size) {
    const s = size || 44;
    const stroke = color;
    const glow = `${color}66`;
    const shape = type === 'grid'
      ? `<rect x="13" y="13" width="30" height="30" rx="4" fill="rgba(255,255,255,0.035)" stroke="${stroke}" stroke-width="3"/><line x1="23" y1="13" x2="23" y2="43" stroke="${stroke}" stroke-width="2" opacity="0.8"/><line x1="33" y1="13" x2="33" y2="43" stroke="${stroke}" stroke-width="2" opacity="0.8"/><line x1="13" y1="23" x2="43" y2="23" stroke="${stroke}" stroke-width="2" opacity="0.8"/><line x1="13" y1="33" x2="43" y2="33" stroke="${stroke}" stroke-width="2" opacity="0.8"/><path d="M19 31 L26 38 L39 20" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`
      : type === 'cards'
      ? `<rect x="15" y="11" width="22" height="30" rx="4" fill="rgba(255,255,255,0.04)" stroke="${stroke}" stroke-width="3" transform="rotate(-9 26 26)"/><rect x="22" y="16" width="22" height="30" rx="4" fill="rgba(255,255,255,0.035)" stroke="${stroke}" stroke-width="3" transform="rotate(8 33 31)"/><circle cx="32" cy="31" r="5" fill="none" stroke="#fff" stroke-width="2.5"/><circle cx="32" cy="31" r="1.7" fill="#fff"/>`
      : `<path d="M28 7 L33 21 L48 16 L39 29 L50 40 L35 38 L28 51 L21 38 L6 40 L17 29 L8 16 L23 21 Z" fill="rgba(255,255,255,0.04)" stroke="${stroke}" stroke-width="3" stroke-linejoin="round"/><circle cx="28" cy="29" r="8" fill="none" stroke="#fff" stroke-width="2.5"/>`;
    return `<svg width="${s}" height="${s}" viewBox="0 0 56 56" style="flex:0 0 auto;overflow:visible;filter:drop-shadow(0 0 8px ${glow})" aria-hidden="true">
      <circle cx="28" cy="28" r="24" fill="rgba(5,2,18,0.34)" stroke="${stroke}" stroke-width="2" opacity="0.7"/>
      ${shape}
    </svg>`;
  }
  function stageTitleHTML(type, label, color, size) {
    const meta = stageMeta(type);
    const c = color || meta.color;
    return `<div style="display:flex;align-items:center;justify-content:center;gap:12px;line-height:1">
      ${stageIconHTML(meta.icon, c, Math.max(34, (size || 58) * 0.72))}
      ${introHeadline(label || meta.label, c, size || 58)}
    </div>`;
  }
  function stageAnnouncementHTML(type, label, color, size) {
    const meta = stageMeta(type);
    const c = color || meta.color;
    const waveHTML = gameMode === 'frenzy'
      ? `<div style="font-family:'VCR',monospace;font-size:15px;letter-spacing:4px;color:rgba(242,239,232,0.72);text-shadow:0 0 10px ${c}55;text-transform:uppercase;margin-bottom:8px">WAVE ${wave}</div>`
      : '';
    return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center">
      ${waveHTML}
      ${stageTitleHTML(type, label, c, size)}
    </div>`;
  }
  function whackWaveHeaderHTML(label) {
    const meta = stageMeta(currentRoundType);
    return `<span style="display:inline-flex;align-items:center;justify-content:center;gap:7px;color:${meta.color};text-shadow:0 0 10px ${meta.color}88">
      ${stageIconHTML(meta.icon, meta.color, 24)}
      <span>WAVE ${wave}: ${label || roundTypeLabel()}</span>
    </span>`;
  }

  // Title/objective text anchors to the vertical middle of the grid's top row of
  // holes (not a generic viewport-center percentage) — reads as pointing at the
  // board itself rather than floating in empty space. Falls back to viewport-center
  // if the grid isn't in the DOM yet for some reason.
  function introTopRowY() {
    const grid = document.getElementById('whack-grid');
    if (!grid) return window.innerHeight * 0.5;
    const rect = grid.getBoundingClientRect();
    const rowHeight = rect.height / (GRID_ROWS || 4);
    return rect.top + rowHeight / 2;
  }
  function introObjectiveHTML(text, color, contentHTML) {
    const y = introTopRowY();
    return `<div style="position:absolute;top:${y}px;left:50%;width:100%;transform:translate(-50%,-50%)">${introHeadline(text, color, 40)}</div>` +
      (contentHTML ? `<div style="position:absolute;top:${y + 56}px;left:50%;transform:translateX(-50%)">${contentHTML}</div>` : '');
  }

  // boxSize/faceSize let callers ask for "medium" (title beats) vs "big" (objective
  // beats) without two near-duplicate functions.
  function introFace(ci, ringColor, boxSize, faceSize) {
    const gc = GAME_CHARS[ci];
    return `<div style="width:${boxSize}px;height:${boxSize}px;margin:16px auto 0;border-radius:16px;overflow:hidden;border:3px solid ${ringColor};background:${ringColor}22;box-shadow:0 0 26px ${ringColor}66;display:flex;align-items:center;justify-content:center">
      <div style="width:${faceSize}px;height:${faceSize}px">${charFace(gc,'normal')}</div>
    </div>`;
  }

  // Small demo of the real side-bar timer draining, used by Clear/Memory's first-time
  // intro to call out "watch this" before it matters for real.
  function introTimerDemoHTML() {
    // The fill is bottom-anchored (position:absolute;bottom:0), matching the real
    // side-bar exactly — without it, a plain flow child shrinks from the top down
    // instead of draining the same direction as the real timer.
    return `<div style="margin:16px auto 0;width:14px;height:90px;border-radius:7px;border:1px solid rgba(255,230,26,0.35);background:rgba(0,0,0,0.35);overflow:hidden;position:relative">
      <div id="intro-timer-fill" style="position:absolute;bottom:0;left:0;width:100%;height:100%;background:rgba(255,230,26,0.55)"></div>
    </div>`;
  }
  function startIntroTimerDrain() {
    const fill = document.getElementById('intro-timer-fill');
    if (!fill) return;
    requestAnimationFrame(() => {
      fill.style.transition = 'height 1.5s linear';
      fill.style.height = '0%';
    });
  }

  // opaque=true (first-time sequences, which include grid-shaped demo content) uses
  // the near-solid background that stops the real board showing through and reading
  // as a second, stacked board behind the demo. Repeat title-only flashes have no
  // demo content to protect against that, so they stay lighter — full opacity every
  // single wave forever was overkill once the novelty of the first 3 wears off.
  function makeIntroOverlay(opaque) {
    const ann = document.createElement('div');
    ann.className = 'whack-intro-overlay'; // tagged so whackBack() can find and remove a stray one on early exit
    const bg = opaque ? 'rgba(5,2,18,0.92)' : 'rgba(5,2,18,0.55)';
    ann.style.cssText = `position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:0;pointer-events:none;background:${bg}`;
    document.body.appendChild(ann);
    return ann;
  }

  // Title shows every time a mode starts (pink, larger). The extra steps after it —
  // objective (blue) plus any demo beats — only ever play the first time that mode
  // comes up this run; every later wave just gets the title alone, briefly.
  function playModeIntro(type, onDone) {
    const isFirst = !introShownFor[type];
    const titleText = type === 'whack' ? 'WHACK' : type === 'clear' ? 'CLEAR THE MOLES' : 'MEMORIZE THE BOARD';
    const ann = makeIntroOverlay(isFirst);
    let ctrl = null;
    const skipIntro = () => {
      introShownFor[type] = true;
      if (ctrl) ctrl.cancel();
      ann.remove();
      onDone();
    };
    ctrl = playIntroSteps([
      { duration: isFirst ? 1800 : 1200, show: () => {
        const meta = stageMeta(type);
        ann.innerHTML = `<div style="position:absolute;top:50%;left:50%;width:100%;transform:translate(-50%,-50%)">${stageAnnouncementHTML(type, titleText, meta.color, 54)}</div>`;
      } },
    ], () => {
      if (!isFirst || skipWhackTutorial) {
        introShownFor[type] = true;
        ann.remove();
        onDone();
        return;
      }
      introShownFor[type] = true;
      const extraSteps = type === 'whack' ? whackIntroExtraSteps()
        : type === 'clear' ? clearIntroExtraSteps()
        : memoryIntroExtraSteps();
      ctrl = playIntroSteps(extraSteps, () => { ann.remove(); onDone(); }, ann, skipIntro);
      function whackIntroExtraSteps() {
        return [
          { duration: 1500, show: () => {
            ann.innerHTML = introObjectiveHTML('THIS IS THE MOLE', '#00e5ff',
              `<div style="width:130px;height:130px;margin:16px auto 0;border-radius:16px;overflow:hidden;border:3px solid #ff4444;background:#ff444422;box-shadow:0 0 26px #ff444466;display:flex;align-items:center;justify-content:center">
                <div id="intro-mole-face" style="width:104px;height:104px;position:relative">${charFace(GAME_CHARS[moleChar],'normal')}</div>
              </div>`);
            // Demonstrate the real whack-hit effect (BAM face + sound) partway
            // through, so the first mole this player ever sees already shows them what
            // a successful hit looks like.
            setTimeout(() => {
              if (state !== 'playing') return;
              const faceBox = document.getElementById('intro-mole-face');
              if (faceBox) faceBox.innerHTML = charFace(GAME_CHARS[moleChar], 'whack') + CRACK_SVG;
              SFX.whack(); SFX.hit();
            }, 1000);
          }},
          { duration: 1500, show: () => {
            ann.innerHTML = introObjectiveHTML("DON'T WHACK YOURSELF", '#00e5ff', introFace(activeChar, '#33ff66', 130, 104));
          }},
        ];
      }
      function clearIntroExtraSteps() {
        return [
          { duration: 800, show: () => { ann.innerHTML = ''; } }, // brief blank beat
          { duration: 1200, show: () => { ann.innerHTML = introObjectiveHTML('BE CAREFUL', '#00e5ff', ''); } }, // ominous, alone
          { duration: 2200, show: () => {
            // Text comes up immediately; the sliding image follows shortly after, so the
            // warning reads before the motion that's being warned about.
            ann.innerHTML = introObjectiveHTML('BE CAREFUL', '#00e5ff',
              `<div id="intro-clear-slide-slot" style="min-height:84px;display:flex;align-items:center;justify-content:center"></div>` +
              `<div style="margin-top:32px">${introHeadline('THEY MAY MOVE', '#00e5ff', 40)}</div>`);
            setTimeout(() => {
              if (state !== 'playing') return;
              const slot = document.getElementById('intro-clear-slide-slot');
              if (slot) slot.innerHTML = `<div style="width:84px;height:84px;border-radius:16px;overflow:hidden;border:3px solid #ff4444;background:#ff444422;animation:intro-mole-slide 0.9s ease-in-out infinite">${charFace(GAME_CHARS[moleChar],'normal')}</div>`;
            }, 450);
          }},
          { duration: 1800, show: () => {
            ann.innerHTML = introObjectiveHTML('WATCH THE TIMER', '#00e5ff', introTimerDemoHTML());
            startIntroTimerDrain();
          }},
        ];
      }
      function memoryIntroExtraSteps() {
        return [
          { duration: 3800, show: () => {
            // Bring the instruction and demo board up together so there is no dead
            // beat between the title and the thing the player needs to watch.
            const SIZE = 9, MOLE_COUNT = 3;
            // Never let the 3 moles land on a tic-tac-toe line (row/column/diagonal) —
            // a "winning" pattern reads as deliberate, not like real random spots.
            const LINES = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
            let moleSet;
            do {
              moleSet = new Set();
              while (moleSet.size < MOLE_COUNT) moleSet.add(Math.floor(Math.random() * SIZE));
            } while (LINES.some(line => line.every(i => moleSet.has(i))));
            let html = introObjectiveHTML('MEMORIZE THE BOARD', '#00e5ff', '') +
              `<div style="position:absolute;top:${introTopRowY() + 56}px;left:50%;transform:translateX(-50%);display:grid;grid-template-columns:repeat(3,46px);gap:6px">`;
            for (let k = 0; k < SIZE; k++) {
              const isMole = moleSet.has(k);
              html += `<div class="intro-mem-cell" data-i="${k}" style="position:relative;width:46px;height:46px;overflow:hidden;border-radius:8px">
                <div style="position:absolute;inset:0;border-radius:8px;overflow:hidden;border:2px solid ${isMole ? '#ff4444' : 'rgba(255,255,255,0.08)'};background:${isMole ? '#ff444422' : 'rgba(255,255,255,0.03)'}">${isMole ? charFace(GAME_CHARS[moleChar], 'normal') : ''}</div>
                <div class="intro-mem-cover" style="position:absolute;inset:0;border-radius:8px;background:linear-gradient(135deg,#2a1a4a,#1a0f2e);border:2px solid rgba(0,229,255,0.6);display:flex;align-items:center;justify-content:center;font-family:'Bebas Neue',cursive;font-size:16px;color:rgba(0,229,255,0.7);transform:translateX(-100%)">?</div>
              </div>`;
            }
            html += `</div>`;
            ann.innerHTML = html;
            // Covers slide in over every cell, staggered.
            setTimeout(() => {
              if (state !== 'playing') return;
              document.querySelectorAll('.intro-mem-cover').forEach((el, idx) => {
                setTimeout(() => {
                  requestAnimationFrame(() => {
                    el.style.animation = 'cabinet-slide-cover 0.65s cubic-bezier(0.32,1.2,0.66,1) forwards';
                  });
                }, idx * 35);
              });
            }, 650);
            // The correct cells pop open (briefly revealing the mole again), then
            // close back over a green checkmark — recall, demonstrated.
            setTimeout(() => {
              if (state !== 'playing') return;
              let mi = 0;
              moleSet.forEach(k => {
                setTimeout(() => {
                  const cell = document.querySelector(`.intro-mem-cell[data-i="${k}"]`);
                  const cover = cell && cell.querySelector('.intro-mem-cover');
                  if (!cover) return;
                  cover.style.transition = 'transform 0.45s ease-in';
                  cover.style.transform = 'translateX(-100%)';
                  setTimeout(() => {
                    cover.innerHTML = '✓';
                    cover.style.color = '#33ff66';
                    cover.style.borderColor = 'rgba(51,255,102,0.7)';
                    cover.style.background = 'rgba(51,255,102,0.15)';
                    cover.style.transition = 'transform 0.45s ease-out';
                    cover.style.transform = 'translateX(0)';
                  }, 450);
                }, mi * 190);
                mi++;
              });
            }, 1550);
          }},
          { duration: 1800, show: () => {
            ann.innerHTML = introObjectiveHTML('WATCH THE TIMER', '#00e5ff', introTimerDemoHTML());
            startIntroTimerDrain();
          }},
        ];
      }
    }, ann, isFirst ? skipIntro : null);
  }

  function playAdventureOverviewIntro(onDone) {
    if (skipWhackTutorial) { onDone(); return; }
    if (adventureIntroShown || gameMode !== 'frenzy') { onDone(); return; }
    adventureIntroShown = true;
    const ann = makeIntroOverlay(true);
    let ctrl = null;
    const skipIntro = () => {
      if (ctrl) ctrl.cancel();
      ann.remove();
      onDone();
    };
    const overviewLines = [];
    const showIntroWord = (text, color, size, type) => {
      overviewLines.push({ text, color, size: size || 56, type });
      ann.innerHTML = `<div style="position:absolute;top:50%;left:50%;width:100%;transform:translate(-50%,-50%);display:flex;flex-direction:column;align-items:center;gap:4px">
        ${overviewLines.map(line => line.type ? stageTitleHTML(line.type, line.text, line.color, line.size) : introHeadline(line.text, line.color, line.size)).join('')}
      </div>`;
    };
    ctrl = playIntroSteps([
      { duration: 1700, show: () => showIntroWord('SURVIVAL HAS THREE WAVES', '#f2efe8', 34) },
      { duration: 1400, show: () => showIntroWord('WHACK', '#ff00cc', 64, 'whack') },
      { duration: 1400, show: () => showIntroWord('CLEAR', '#ffe61a', 64, 'clear') },
      { duration: 1400, show: () => showIntroWord('MEMORIZE', '#00e5ff', 64, 'memory') },
    ], () => { ann.remove(); onDone(); }, ann, skipIntro);
  }

  // Classic's intro — skips the pink title step entirely (no per-mode title concept
  // for a standalone mode) and plays in full every session, not gated by
  // introShownFor: "THIS IS THE MOLE" (with the same whack-hit demo as Frenzy's Whack
  // intro) followed by Clear's full BE CAREFUL sequence verbatim, since Classic's
  // movement mechanic is the same hole-to-hole sliding Clear introduces.
  function classicIntroSteps(onDone) {
    if (skipWhackTutorial) { onDone(); return; }
    const ann = makeIntroOverlay(true); // plays in full every session — always the opaque treatment
    let ctrl = null;
    const skipIntro = () => {
      if (ctrl) ctrl.cancel();
      ann.remove();
      onDone();
    };
    ctrl = playIntroSteps([
      { duration: 1500, show: () => {
        ann.innerHTML = introObjectiveHTML('THIS IS THE MOLE', '#00e5ff',
          `<div style="width:130px;height:130px;margin:16px auto 0;border-radius:16px;overflow:hidden;border:3px solid #ff4444;background:#ff444422;box-shadow:0 0 26px #ff444466;display:flex;align-items:center;justify-content:center">
            <div id="intro-mole-face" style="width:104px;height:104px;position:relative">${charFace(GAME_CHARS[moleChar],'normal')}</div>
          </div>`);
        setTimeout(() => {
          if (state !== 'playing') return;
          const faceBox = document.getElementById('intro-mole-face');
          if (faceBox) faceBox.innerHTML = charFace(GAME_CHARS[moleChar], 'whack') + CRACK_SVG;
          SFX.whack(); SFX.hit();
        }, 1000);
      }},
      { duration: 1000, show: () => { ann.innerHTML = ''; } }, // blank beat
      { duration: 1000, show: () => { ann.innerHTML = introObjectiveHTML('BE CAREFUL', '#00e5ff', ''); } }, // ominous, alone
      { duration: 3000, show: () => {
        ann.innerHTML = introObjectiveHTML('BE CAREFUL', '#00e5ff',
          `<div id="intro-classic-slide-slot" style="min-height:84px;display:flex;align-items:center;justify-content:center"></div>` +
          `<div style="margin-top:32px">${introHeadline('THEY MAY MOVE', '#00e5ff', 40)}</div>`);
        setTimeout(() => {
          if (state !== 'playing') return;
          const slot = document.getElementById('intro-classic-slide-slot');
          if (slot) slot.innerHTML = `<div style="width:84px;height:84px;border-radius:16px;overflow:hidden;border:3px solid #ff4444;background:#ff444422;animation:intro-mole-slide 1.1s ease-in-out infinite">${charFace(GAME_CHARS[moleChar],'normal')}</div>`;
        }, 1000);
      }},
      { duration: 2000, show: () => {
        ann.innerHTML = introObjectiveHTML('WATCH THE TIMER', '#00e5ff', introTimerDemoHTML());
        startIntroTimerDrain();
      }},
    ], () => { ann.remove(); onDone(); }, ann, skipIntro);
  }

  // Drives the vertical side bar over the actual memorize window — started only once
  // targets are revealed, every frame rather than once a second (memorizeMs is too
  // short for per-second ticks to read as a smooth drain).
  function driveMemorizeSideBar(memorizeMs) {
    showSideBar('memorize');
    const start = Date.now();
    const tick = () => {
      // Round moved on (recall phase, or reset/fail) before the bar naturally hit
      // zero — remove it rather than abandoning it mid-drain on screen.
      if (memoryPhase !== 'showing') { removeSideBar(); return; }
      const pct = Math.max(0, 1 - (Date.now() - start) / memorizeMs) * 100;
      updateSideBar(pct);
      if (pct > 0) requestAnimationFrame(tick);
      else removeSideBar();
    };
    requestAnimationFrame(tick);
  }

  // Inline onclick="..." attributes run with the GLOBAL scope as their lexical parent
  // — they cannot see this IIFE's own `let` variables (gameMode/difficulty/state) or
  // call its plain `render()`. Every screen-transition triggered from markup must go
  // through an explicitly window-exposed function like these, the same way
  // whackBegin/whackPlay/whackHit already are.
  function syncWhackLeaderboardState() {
    window._whackMode = gameMode;
    window._whackDifficulty = difficulty;
  }
  syncWhackLeaderboardState();
  window.whackChooseMode = function(mode) {
    gameMode = mode;
    syncWhackLeaderboardState();
    render();
  };
  window.whackSetDifficulty = function(d) {
    difficulty = d;
    syncWhackLeaderboardState();
  };
  window.whackSelectModeDifficulty = function(mode, d) {
    gameMode = mode;
    difficulty = d;
    syncWhackLeaderboardState();
    moleChar = pickMole();
    state = 'mole-select';
    render();
  };
  window.whackToMoleSelect = function() {
    moleChar = pickMole();
    state = 'mole-select';
    render();
  };

  window.whackBegin = function() {
    ArcadeMusic.stop();
    if (gameMode === 'classic') {
      const _mob = window.innerWidth <= 600;
      if (difficulty === 'easy') { GRID_COLS = _mob ? 3 : 4; GRID_ROWS = _mob ? 5 : 4; }
      else                        { GRID_COLS = 4; GRID_ROWS = 5; }
      HOLES = GRID_COLS * GRID_ROWS;
      state = 'playing'; render();
      classicIntroSteps(classicStart);
      return;
    }
    applyDifficultyGridSize();
    state = 'playing'; render();
    waveTransitioning = true;
    const startWhacking = () => {
      if (state !== 'playing') return;
      waveTransitioning = false;
      scheduleAll();
    };
    playAdventureOverviewIntro(() => playModeIntro('whack', startWhacking));
  };

  window.initWhack = function() {
    holeTimers.forEach(clearTimeout); clearInterval(timerInterval);
    syncWhackLeaderboardState();
    introShownFor = { whack: false, clear: false, memory: false };
    adventureIntroShown = false;
    activeChar = getGlobalChar();
    moleChar = pickMole();
    state = 'mode-select'; wave = 1; waveHits = 0;
    selfActive = false; selfIntroWave = 0; waveTransitioning = false;
    currentRoundType = 'whack'; clearInterval(clearRoundInterval); clearInterval(clearRoundMoveInterval); memoryPhase = null; removeClearTimerOverlay(); removeSideBar(); memoryAppearances = 0; clearRoundAppearances = 0;
    classicPieces.forEach(p => clearTimeout(p.timer)); classicPieces = []; clearInterval(classicInterval); classicHits = 0;
    holeStates = Array(HOLES).fill('empty');
    holeCharIdx = Array(HOLES).fill(-1);
    holeGrace = Array(HOLES).fill(false);
    holeTimers   = Array(HOLES).fill(null);
    render();
  };
})();
