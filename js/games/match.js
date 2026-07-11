// ══════════════════════════════════════
//  MEMORY MOBE
// ══════════════════════════════════════
(function() {
  let PAIRS = 9; // dynamic, set per-mode in makeCards()
  let cards = [], flipped = [], locked = false;
  let moves = 0, matched = 0, state = 'idle', matchTimer = 0, timerInt, previewInt, timeLimit = 60;
  let matchOutOfMoves = false;
  let matchCutoffWaived = false; // true once "FINISH ANYWAY" is chosen — stops re-prompting
  const IMPOSSIBLE_MOVE_CUTOFF = 55;
  let matchMode = 'hard'; // 'free' | 'hard' | 'challenge' | 'impossible'
  let freePlayCharCount = 8; // 4–20, how many distinct characters appear in free play
  let freePlayFlipMode = 'auto'; // 'auto' | 'manual'
  let manualFlipPending = false;
  let manualFlipPair = null;
  let manualFlipHandler = null;
  window._matchMode = matchMode;
  window._matchFreePairs = freePlayCharCount;
  // Hard = the old "timed" mode. Challenge/Impossible add a target-moves benchmark to
  // beat (not a hard fail — you can always finish, it's just a "did you beat it?" badge)
  // plus a generous time limit so move-efficiency, not the clock, is the real challenge.
  // Impossible has no in-game timer at all (only the opening memorize countdown) — it's
  // measured purely by moves once play begins, so it carries no `time` config.
  const MODE_CONFIG = {
    hard:       { pairs: 12, time: 60, targetMoves: null },
    challenge:  { pairs: 16, time: 60, targetMoves: null },
    impossible: { pairs: 21, targetMoves: null },
  };

  function shuffle(arr) {
    for (let i = arr.length-1; i > 0; i--) {
      const j = Math.floor(Math.random()*(i+1));
      [arr[i],arr[j]] = [arr[j],arr[i]];
    }
    return arr;
  }

  function gridLayout(pairs) {
    // Named modes use explicit clean grids so mobile never gets a ragged row or a
    // too-wide square-ish board. Challenge uses 16 pairs to fit 4x8 cleanly.
    if (matchMode === 'hard') return { cols: 4, rows: 6 };       // 24 cards
    if (matchMode === 'challenge') return { cols: 4, rows: 8 };  // 32 cards
    if (matchMode === 'impossible') return { cols: 6, rows: 7 }; // 42 cards
    const n = pairs * 2;
    const cols = Math.max(2, Math.min(7, Math.round(Math.sqrt(n))));
    return { cols, rows: Math.ceil(n / cols) };
  }

  function makeCards() {
    // Every mode now picks a random subset of characters (free play already did this —
    // the old hard/"timed" mode always used the same fixed first-N characters, every
    // single game; randomizing it too is strictly more replayable, no downside).
    PAIRS = matchMode === 'free' ? freePlayCharCount : MODE_CONFIG[matchMode].pairs;
    const pairIndices = shuffle([...Array(GAME_CHARS.length).keys()]).slice(0, PAIRS);
    return shuffle([...pairIndices, ...pairIndices]).map((ci, id) => ({ id, ci, matched: false, flipped: false }));
  }

  function fmtTime(s) { return Math.floor(s/60)+':'+(s%60<10?'0':'')+s%60; }

  function render() {
    const wrap = document.getElementById('match-wrap');
    if (!wrap) return;
    setArcadeExitVisible(state !== 'over');
    wrap.classList.toggle('mode-select-layout', state === 'idle' || state === 'free-setup');
    document.body.classList.toggle('arcade-selection-open', state === 'idle' || state === 'free-setup' || state === 'preview');
    if (state === 'idle' || state === 'free-setup' || state === 'preview') {
      if (typeof window.initArcadeFloat === 'function') window.initArcadeFloat(true);
    }

    if (state === 'idle') {
      if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
      wrap.innerHTML = `
        <div class="whack-mode-shell" style="max-width:440px;margin-top:24px">
          <div class="whack-mode-title">CHOOSE MODE</div>
          <div class="game-card whack-mode-card" style="border-color:#ffe61a66;cursor:default;min-height:0">
            <div class="game-card-art" style="background:#0d0a1e">
              <div id="match-mode-art" style="position:absolute;inset:0;z-index:0;opacity:0.97;transform:scale(1.26) translateY(10px);filter:saturate(1.18) brightness(.8);pointer-events:none;mix-blend-mode:screen"></div>
            </div>
            <div class="game-card-info" style="position:relative;z-index:2">
            <div style="font-family:'Bebas Neue',cursive;font-size:34px;letter-spacing:5px;line-height:1;color:#ffe61a;text-shadow:0 0 14px #ffe61a88;margin-bottom:8px">MEMORY MOBE</div>
            <svg viewBox="0 0 280 80" width="100%" height="70" style="display:block;margin:0 auto 8px">
              <g class="card-drift" style="--r0:-4deg;--r1:1deg;animation-delay:0s"><rect x="8" y="6" width="50" height="66" rx="6" fill="#2a1a55" stroke="#ffe61a" stroke-width="1.5" opacity="0.8"/><text x="33" y="46" text-anchor="middle" font-size="22" fill="#ffe61a" opacity="0.5" font-family="'Bebas Neue',cursive">?</text></g>
              <g class="card-drift" style="--r0:0deg;--r1:3deg;animation-delay:0.4s"><rect x="66" y="6" width="50" height="66" rx="6" fill="#3a2a77" stroke="#ffe61a" stroke-width="2"/><path d="M75,38 L82,47 L97,27" stroke="#ffe61a" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
              <g class="card-drift" style="--r0:3deg;--r1:-2deg;animation-delay:0.8s"><rect x="124" y="6" width="50" height="66" rx="6" fill="#2a1a55" stroke="#ffe61a" stroke-width="1.5" opacity="0.8"/><text x="149" y="46" text-anchor="middle" font-size="22" fill="#ffe61a" opacity="0.5" font-family="'Bebas Neue',cursive">?</text></g>
              <g class="card-drift" style="--r0:0deg;--r1:-3deg;animation-delay:1.2s" opacity="0.85"><rect x="182" y="6" width="50" height="66" rx="6" fill="#3a2a77" stroke="#ffe61a" stroke-width="2"/><path d="M191,38 L198,47 L213,27" stroke="#ffe61a" stroke-width="3.6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>
              <text x="248" y="24" font-size="14" fill="#ffe61a" opacity="0.9">✦</text>
              <text x="258" y="40" font-size="10" fill="#ffe61a" opacity="0.7">✦</text>
            </svg>
            <div class="game-card-marquee" style="color:#ffe61a;text-shadow:0 0 16px rgba(255,230,26,0.65)">FLIP CARDS TO FIND PAIRS</div>
            <div style="height:8px"></div>
            <div class="match-mode-select" style="display:flex;flex-direction:column;gap:8px;align-items:stretch;margin-top:2px">
            <button class="whack-btn match-mode-btn" style="border-color:#33ff66;background:rgba(51,255,102,0.14);padding:10px 16px;text-align:left" onclick="matchGoFreeSetup()">
              <div style="font-family:'Bebas Neue',cursive;font-size:22px;letter-spacing:3px;line-height:1.1">FREE PLAY</div>
              <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:0.5px;opacity:0.9;margin-top:4px;white-space:nowrap">4-20 PAIRS · UNLIMITED MOVES · NO TIME LIMIT</div>
            </button>
            <button class="whack-btn match-mode-btn" style="border-color:#ffe61a;background:rgba(255,230,26,0.14);padding:10px 16px;text-align:left" onclick="matchPlay('hard')">
              <div style="font-family:'Bebas Neue',cursive;font-size:22px;letter-spacing:3px;line-height:1.1">HARD</div>
              <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:0.5px;opacity:0.9;margin-top:4px;white-space:nowrap">12 PAIRS · UNLIMITED MOVES · 60 SECONDS</div>
            </button>
            <button class="whack-btn match-mode-btn" style="border-color:#ff9933;background:rgba(255,153,51,0.1);padding:10px 16px;text-align:left" onclick="matchPlay('challenge')">
              <div style="font-family:'Bebas Neue',cursive;font-size:22px;letter-spacing:3px;line-height:1.1">CHALLENGE</div>
              <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:0.5px;opacity:0.9;margin-top:4px;white-space:nowrap">16 PAIRS · UNLIMITED MOVES · 60 SECONDS</div>
            </button>
            <button class="whack-btn match-mode-btn" style="border-color:#ff4444;background:rgba(255,68,68,0.1);padding:10px 16px;text-align:left" onclick="matchPlay('impossible')">
              <div style="font-family:'Bebas Neue',cursive;font-size:22px;letter-spacing:3px;line-height:1.1">IMPOSSIBLE</div>
              <div style="font-family:'VCR',monospace;font-size:11px;letter-spacing:0.5px;opacity:0.9;margin-top:4px;white-space:nowrap">21 PAIRS · ${IMPOSSIBLE_MOVE_CUTOFF} MOVES</div>
            </button>
            </div>
            </div>
          </div>
        </div>`;
      mountSelectionArt('match-mode-art', 'match');
      return;
    }

    if (state === 'free-setup') {
      if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
      const btnStyle = 'font-family:\'VCR\',monospace;font-size:13px;background:none;border:1px solid rgba(242,239,232,0.2);border-radius:4px;color:rgba(242,239,232,0.65);width:36px;height:36px;cursor:pointer;padding:0;line-height:1';
      wrap.innerHTML = `
        <div class="arcade-cabinet" style="--nc:#ffe61a">
          <div class="arcade-cab-rail"></div>
          <div class="arcade-cab-marquee">FREE PLAY</div>
          <div class="arcade-cab-screen" style="text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px">
            <div class="match-sub">ONE PAIR PER CHARACTER · UNIQUE FACES</div>
            <div class="match-sub" style="margin-top:4px">HOW MANY CHARACTERS?</div>
            <div style="display:flex;align-items:center;gap:20px;margin:8px 0">
              <button onclick="matchAdjChar(-1)" style="${btnStyle}">−</button>
              <span id="match-char-ct" style="font-family:'Bebas Neue',cursive;font-size:56px;letter-spacing:4px;color:#ffe61a;line-height:1;text-shadow:0 0 18px #ffe61a88">${freePlayCharCount}</span>
              <button onclick="matchAdjChar(1)" style="${btnStyle}">+</button>
            </div>
            <div class="match-sub" style="opacity:0.4">4 – 20</div>
            <div class="match-sub" style="margin-top:4px">MISSED MATCHES</div>
            <div class="match-flip-toggle" role="group" aria-label="Free play flip mode">
              <button class="${freePlayFlipMode === 'auto' ? 'active' : ''}" onclick="matchSetFreeFlipMode('auto')" type="button">AUTO FLIP</button>
              <button class="${freePlayFlipMode === 'manual' ? 'active' : ''}" onclick="matchSetFreeFlipMode('manual')" type="button">MANUAL FLIP</button>
            </div>
          </div>
          <div class="arcade-cab-foot" style="display:flex;flex-direction:column;gap:8px;align-items:stretch">
            <button class="whack-btn match-mode-btn" style="border-color:#ffe61a;background:rgba(255,230,26,0.14)" onclick="matchPlay('free')">▶ START</button>
            <button class="whack-btn match-mode-btn" style="border-color:rgba(255,230,26,0.15);background:none;font-size:10px" onclick="matchGoIdle()">◀ BACK</button>
          </div>
        </div>`;
      return;
    }

    if (state === 'preview') {
      const _gl = gridLayout(PAIRS);
      const _gap = matchMode === 'challenge' ? 4 : 6;
      // Timed modes draw a vertical countdown bar to the right of the board.
      // Reserve that gutter in the mobile card-size math so the bar sits BESIDE
      // the cards instead of being clamped back on top of the last column.
      const _sideBarReserve = (window.innerWidth <= 600 && (matchMode === 'hard' || matchMode === 'challenge')) ? 30 : 0;
      const _ghp = (_gl.cols - 1) * _gap + 24 + _sideBarReserve;
      const _vPad = window.innerWidth <= 600 ? (matchMode === 'challenge' ? 104 : 82) : 180;
      const _gStyle = `--card:min(calc((min(100vw,520px) - ${_ghp}px) / ${_gl.cols}),calc((var(--app-vh, 100dvh) - ${_vPad}px) / ${_gl.rows}));grid-template-columns:repeat(${_gl.cols},var(--card));grid-template-rows:repeat(${_gl.rows},var(--card));gap:${_gap}px`;
      wrap.innerHTML = `
        <div class="match-hud" style="padding:6px 16px">
          <div style="font-family:'Bebas Neue',cursive;font-size:28px;letter-spacing:5px;color:#ffe61a;text-shadow:0 0 14px #ffe61a88" id="match-preview-cd">MEMORIZE!  ${matchMode === 'impossible' ? 13 : matchMode === 'challenge' ? 7 : 3}</div>
        </div>
        <div class="match-grid" style="${_gStyle}">${
          cards.map((c,i) => {
            const gc = GAME_CHARS[c.ci];
            return `<div class="match-card-wrap">
              <div class="match-card flipped" id="mc-${i}">
                <div class="match-card-front"></div>
                <div class="match-card-back" style="background:${gc.color}22;border-color:${gc.color}55">${charFace(gc,'normal')}</div>
              </div>
            </div>`;
          }).join('')
        }</div>`;
      return;
    }

    if (state === 'playing') {
      const _gl = gridLayout(PAIRS);
      const _gap = matchMode === 'challenge' ? 4 : 6;
      // Timed modes draw a vertical countdown bar to the right of the board.
      // Reserve that gutter in the mobile card-size math so the bar sits BESIDE
      // the cards instead of being clamped back on top of the last column.
      const _sideBarReserve = (window.innerWidth <= 600 && (matchMode === 'hard' || matchMode === 'challenge')) ? 30 : 0;
      const _ghp = (_gl.cols - 1) * _gap + 24 + _sideBarReserve;
      const _vPad = window.innerWidth <= 600 ? (matchMode === 'challenge' ? 104 : 82) : 180;
      const _gStyle = `--card:min(calc((min(100vw,520px) - ${_ghp}px) / ${_gl.cols}),calc((var(--app-vh, 100dvh) - ${_vPad}px) / ${_gl.rows}));grid-template-columns:repeat(${_gl.cols},var(--card));grid-template-rows:repeat(${_gl.rows},var(--card));gap:${_gap}px`;
      wrap.innerHTML = `
        <div class="match-hud" style="padding:6px 16px">
          <div><div class="whack-stat-label">TIME</div><div class="whack-stat-val" id="mt" style="font-size:${(matchMode === 'free' || matchMode === 'impossible') ? 22 : 32}px;line-height:1">${(matchMode === 'free' || matchMode === 'impossible') ? 'NONE' : Math.max(0, timeLimit - matchTimer) + 's'}</div></div>
          <div style="text-align:center"><div class="whack-stat-label">PAIRS</div><div class="whack-stat-val" id="match-pairs" style="font-size:24px">${matched}/${PAIRS}</div></div>
          <div style="text-align:right"><div class="whack-stat-label">MOVES</div><div class="whack-stat-val" id="match-moves" style="font-size:24px">${moves}${matchMode==='impossible'?'/'+IMPOSSIBLE_MOVE_CUTOFF:''}</div></div>
        </div>
        <div class="match-grid" style="${_gStyle}">${
          cards.map((c,i) => {
            const gc = GAME_CHARS[c.ci];
            return `<div class="match-card-wrap" onpointerdown="matchFlip(${i}, event)" onclick="matchFlip(${i}, event)">
              <div class="match-card${c.flipped||c.matched?' flipped':''}${c.matched?' matched':''}" id="mc-${i}">
                <div class="match-card-front"></div>
                <div class="match-card-back" style="background:${gc.color}22;border-color:${gc.color}55">${charFace(gc,'normal')}</div>
              </div>
            </div>`;
          }).join('')
        }</div>
        ${matchMode === 'free' && freePlayFlipMode === 'manual' ? '<div id="match-manual-flip-hint" class="match-manual-flip-hint">Tap Anywhere to Flip</div>' : ''}`;
      return;
    }

    if (state === 'over') {
      setArcadeExitVisible(false);
      wrap.scrollTop = 0;
      const didWin = matched === PAIRS;
      if (matchMode === 'free') {
        const boardKey = getMatchLeaderboardKey({ mode: matchMode, pairs: freePlayCharCount });
        const uid = `match-free-${freePlayCharCount}`;
        wrap.innerHTML = buildArcadeResultCard({
          uid,
          boardKey,
          artGame: 'match',
          color: '#ff9933',
          marquee: 'CLEARED!',
          marqueeEnd: '#a89000',
          marqueeSolid: true,
          marqueeBg: '#ff9933',
          scoreLabel: 'YOUR MOVES',
          scoreValue: moves,
          saveValue: moves,
          field: 'score',
          extra: `FREE PLAY · ${freePlayCharCount} PAIRS`,
          ascending: true,
          buttons: `
            <button class="whack-btn" style="border-color:#ff9933;background:rgba(255,153,51,0.30)" onclick="matchGoFreeSetup()">PLAY AGAIN</button>
            <button class="whack-btn" style="border-color:#ff9933;background:rgba(255,153,51,0.30)" onclick="matchChangeMode()">CHANGE MODE</button>
            <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="nav('lobby')">BACK TO ARCADE</button>
          `,
        });
        loadRemoteBoard(boardKey, `${uid}-board`, '#ff9933', 'score');
        mountSelectionArt(`${uid}-art`, 'match');
      } else {
        const headline = didWin ? 'CLEARED!' : (matchOutOfMoves ? 'OUT OF MOVES!' : "TIME'S UP!");
        const boardKey = getMatchLeaderboardKey({ mode: matchMode, pairs: freePlayCharCount });
        const uid = `match-${matchMode}`;
        // Hard/Challenge have unlimited moves, so time-to-clear is the only meaningful
        // measure. Impossible has no in-game timer at all, so moves is its only measure.
        let scoreLabel, scoreValue, saveValue, field, ascending;
        if (matchMode === 'hard' || matchMode === 'challenge') {
          scoreLabel = 'YOUR TIME';
          scoreValue = fmtTime(matchTimer);
          saveValue = matchTimer;
          field = 'seconds';
          ascending = true;
        } else {
          scoreLabel = 'YOUR MOVES';
          scoreValue = moves;
          saveValue = moves;
          field = 'score';
          ascending = true;
        }
        wrap.innerHTML = buildArcadeResultCard({
          uid,
          boardKey,
          artGame: 'match',
          color: '#ff9933',
          marquee: headline,
          marqueeEnd: '#ff00cc',
          marqueeSolid: true,
          marqueeBg: '#ff9933',
          scoreLabel,
          scoreValue,
          saveValue,
          field,
          seconds: (matchMode === 'hard' || matchMode === 'challenge') ? matchTimer : 0,
          ascending,
          canSave: didWin,
          buttons: `
            <button class="whack-btn" style="border-color:#ff9933;background:rgba(255,153,51,0.30)" onclick="matchPlay('${matchMode}')">PLAY AGAIN</button>
            <button class="whack-btn" style="border-color:#ff9933;background:rgba(255,153,51,0.30)" onclick="matchChangeMode()">CHANGE MODE</button>
            <button class="whack-btn" style="border-color:#ff00cc;background:rgba(255,0,204,0.30)" onclick="nav('lobby')">BACK TO ARCADE</button>
          `,
        });
        loadRemoteBoard(boardKey, `${uid}-board`, '#ff9933', field);
        mountSelectionArt(`${uid}-art`, 'match');
      }
    }
  }

  window.matchFlip = function(i, evt) {
    try {
      if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
    } catch (e) {}
    if (locked || cards[i].matched || cards[i].flipped || flipped.length >= 2) return;
    cards[i].flipped = true;
    flipped.push(i);
    const el = document.getElementById(`mc-${i}`);
    if (el) el.classList.add('flipped');

    if (flipped.length < 2) return;

    moves++;
    const mv = document.getElementById('match-moves');
    if (mv) mv.textContent = moves + (matchMode==='impossible' ? '/'+IMPOSSIBLE_MOVE_CUTOFF : '');
    locked = true;

    const [a, b] = flipped;
    const isMatch = cards[a].ci === cards[b].ci;

    setTimeout(() => {
      if (isMatch) {
        SFX.match();
        matchFlash();
        cards[a].matched = cards[b].matched = true;
        matched++;
        const pv = document.getElementById('match-pairs');
        if (pv) pv.textContent = `${matched}/${PAIRS}`;
        [a, b].forEach(idx => {
          const el = document.getElementById(`mc-${idx}`);
          if (el) {
            el.classList.add('matched', 'match-holo');
            const back = el.querySelector('.match-card-back');
            if (back) back.innerHTML = charFace(GAME_CHARS[cards[idx].ci], 'happy');
            const oldBurst = el.querySelector('.match-spark-burst');
            if (oldBurst) oldBurst.remove();
            const burst = document.createElement('span');
            burst.className = 'match-spark-burst';
            burst.innerHTML = '<i></i><i></i><i></i><i></i>';
            el.appendChild(burst);
            setTimeout(() => burst.remove(), 900);
            setTimeout(() => el.classList.remove('match-holo'), 1200);
          }
        });
        flipped = []; locked = false;
        if (matched === PAIRS) {
          clearInterval(timerInt); clearInterval(previewInt);
          removeMatchSideBar();
          setTimeout(() => {
            showMatchGameOver();
            try { SFX.win(); ticketConfetti(); } catch(e) { console.warn('[Match] finish effect failed:', e); }
          }, 700);
        } else {
          checkMoveCutoff();
        }
      } else {
        SFX.mismatch();
        [a, b].forEach(idx => {
          const el = document.getElementById(`mc-${idx}`);
          if (el) {
            el.classList.add('miss-flash');
            const back = el.querySelector('.match-card-back');
            if (back) back.innerHTML = charFace(GAME_CHARS[cards[idx].ci], 'sad');
          }
        });
        if (matchMode === 'free' && freePlayFlipMode === 'manual') {
          beginManualMismatchFlip(a, b);
        } else {
          setTimeout(() => resetMismatchedPair(a, b), 280);
        }
      }
    }, 180);
  };

  function resetMismatchedPair(a, b) {
    [a, b].forEach(idx => {
      cards[idx].flipped = false;
      const el = document.getElementById(`mc-${idx}`);
      if (el) el.classList.remove('flipped','miss-flash');
      const back = el && el.querySelector('.match-card-back');
      if (back) back.innerHTML = charFace(GAME_CHARS[cards[idx].ci], 'normal');
    });
    flipped = [];
    locked = false;
    clearManualMismatchFlip();
    checkMoveCutoff();
  }

  function beginManualMismatchFlip(a, b) {
    manualFlipPending = true;
    manualFlipPair = [a, b];
    const hint = document.getElementById('match-manual-flip-hint');
    if (hint) hint.classList.add('visible');
    clearManualFlipHandlerOnly();
    manualFlipHandler = function(evt) {
      if (!manualFlipPending || state !== 'playing') return;
      try {
        if (evt && typeof evt.preventDefault === 'function') evt.preventDefault();
        if (evt && typeof evt.stopPropagation === 'function') evt.stopPropagation();
        if (evt && typeof evt.stopImmediatePropagation === 'function') evt.stopImmediatePropagation();
      } catch (e) {}
      const pair = manualFlipPair;
      if (!pair) return;
      resetMismatchedPair(pair[0], pair[1]);
    };
    setTimeout(() => {
      if (manualFlipHandler) {
        document.addEventListener('pointerdown', manualFlipHandler, { once: true, capture: true });
      }
    }, 0);
  }

  function clearManualFlipHandlerOnly() {
    if (manualFlipHandler) {
      document.removeEventListener('pointerdown', manualFlipHandler, true);
      manualFlipHandler = null;
    }
  }

  function clearManualMismatchFlip() {
    manualFlipPending = false;
    manualFlipPair = null;
    clearManualFlipHandlerOnly();
    const hint = document.getElementById('match-manual-flip-hint');
    if (hint) hint.classList.remove('visible');
  }

  // Impossible mode's hard fail-state: run out of moves before clearing the board.
  function checkMoveCutoff() {
    if (matchMode !== 'impossible' || moves < IMPOSSIBLE_MOVE_CUTOFF || matched === PAIRS || matchCutoffWaived) return false;
    clearInterval(timerInt); clearInterval(previewInt);
    locked = true;
    SFX.over();
    setTimeout(showCutoffPrompt, 400);
    return true;
  }

  function showCutoffPrompt() {
    const ov = document.createElement('div');
    ov.id = 'match-cutoff-modal';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9700;display:flex;align-items:center;justify-content:center;background:rgba(5,2,18,0.88);backdrop-filter:blur(8px)';
    ov.innerHTML = `
      <div style="background:#080515;border:2px solid #ff4444;border-radius:12px;padding:28px 24px;max-width:300px;width:90vw;text-align:center;box-shadow:0 0 30px rgba(255,68,68,0.4)">
        <div style="font-family:'Bebas Neue',cursive;font-size:44px;letter-spacing:4px;color:#ff4444;text-shadow:0 0 20px #ff4444;line-height:1;margin-bottom:14px">FAILED</div>
        <div style="font-family:'VCR',monospace;font-size:12px;letter-spacing:2px;color:rgba(242,239,232,0.7);margin-bottom:20px">YOU'VE USED ${IMPOSSIBLE_MOVE_CUTOFF} MOVES</div>
        <div style="display:flex;flex-direction:column;gap:10px">
          <button onclick="matchGiveUp()" style="font-family:'VCR',monospace;font-size:13px;letter-spacing:2px;background:rgba(255,68,68,0.14);border:2px solid #ff4444;border-radius:6px;padding:12px;color:#ff4444;cursor:pointer">GIVE UP?</button>
          <button onclick="matchFinishAnyway()" style="font-family:'VCR',monospace;font-size:13px;letter-spacing:2px;background:none;border:1.5px solid rgba(242,239,232,0.3);border-radius:6px;padding:12px;color:rgba(242,239,232,0.8);cursor:pointer">FINISH ANYWAY</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  }

  window.matchGiveUp = function() {
    const ov = document.getElementById('match-cutoff-modal');
    if (ov) ov.remove();
    matchOutOfMoves = true;
    removeMatchSideBar();
    showMatchGameOver();
  };

  window.matchFinishAnyway = function() {
    const ov = document.getElementById('match-cutoff-modal');
    if (ov) ov.remove();
    matchCutoffWaived = true;
    locked = false;
  };

  function matchFlash() {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;z-index:9000;background:#33ff66;opacity:0.32;pointer-events:none;transition:opacity 0.3s ease-out';
    document.body.appendChild(el);
    requestAnimationFrame(() => { el.style.opacity = '0'; });
    setTimeout(() => el.remove(), 350);
  }

  // Vertical countdown bar to the right of the board for the timed modes (Hard,
  // Challenge) — same fixed-position-against-the-grid trick used in Whack, but kept
  // soft/translucent rather than solid so the dark background reads through it.
  let matchSideBarEl = null;
  function showMatchSideBar() {
    removeMatchSideBar();
    const grid = document.querySelector('.match-grid');
    if (!grid) return;
    const rect = grid.getBoundingClientRect();
    const barW = 12;
    const barGap = 8;
    const safeRight = 8;
    // The grid sizing reserves a mobile gutter for this bar. Keep this clamp only
    // as a last-resort safety so the bar never leaves the viewport.
    const barLeft = Math.min(rect.right + barGap, window.innerWidth - barW - safeRight);
    matchSideBarEl = document.createElement('div');
    matchSideBarEl.style.cssText = `position:fixed;top:${rect.top}px;left:${barLeft}px;width:${barW}px;height:${rect.height}px;z-index:9400;pointer-events:none;background:rgba(0,0,0,0.35);border:1px solid rgba(255,230,26,0.25);border-radius:6px;overflow:hidden`;
    matchSideBarEl.innerHTML = `<div id="match-sidebar-fill" style="position:absolute;bottom:0;left:0;width:100%;height:100%;background:rgba(255,230,26,0.5);box-shadow:0 0 8px rgba(255,230,26,0.35);transition:height 1s linear,background 0.3s"></div>`;
    document.body.appendChild(matchSideBarEl);
  }
  function removeMatchSideBar() {
    if (matchSideBarEl) { matchSideBarEl.remove(); matchSideBarEl = null; }
  }
  function updateMatchSideBar(pct) {
    const fill = document.getElementById('match-sidebar-fill');
    if (!fill) return;
    fill.style.height = Math.max(0, pct) + '%';
    fill.style.background = pct <= 25 ? 'rgba(255,68,68,0.55)' : 'rgba(255,230,26,0.5)';
  }

  // Replaced by the blue mode-intro sequence above (matchModeIntroSteps) — that
  // already covers "unlimited moves" and the time limit before the round starts,
  // so this redundant screen flash is gone.

  // ── Mode intro ── same blue objective-text language as Whack/Space (Bebas Neue,
  // #00e5ff, glow) — a separate IIFE from both, so a small mirrored copy of the
  // helpers lives here too. Flashes the same three facts already shown on the idle
  // screen's subtext for that mode (1s each), then for the two real-timer modes
  // (HARD/CHALLENGE) follows with a WATCH THE TIMER beat + a demo drain — FREE PLAY
  // and IMPOSSIBLE have no real countdown, so they skip that beat.
  function mmIntroHeadline(text) {
    const color = '#00e5ff';
    return `<div style="font-family:'Bebas Neue',cursive;font-size:34px;letter-spacing:3px;color:${color};text-shadow:0 0 20px ${color},0 0 40px ${color}66;text-align:center;line-height:1.2">${text}</div>`;
  }
  function mmMakeIntroOverlay() {
    const ann = document.createElement('div');
    ann.className = 'match-intro-overlay'; // tagged so matchBack() can remove a stray one on early exit
    ann.style.cssText = 'position:fixed;inset:0;z-index:9998;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;background:rgba(5,2,18,0.93)';
    document.body.appendChild(ann);
    return ann;
  }
  function mmPlayIntroSteps(steps, onDone) {
    let i = 0;
    function tick() {
      if (i >= steps.length) { onDone(); return; }
      const step = steps[i++];
      step.show();
      setTimeout(tick, step.duration);
    }
    tick();
  }
  function mmIntroTimerDemoHTML() {
    return `<div style="margin:16px auto 0;width:14px;height:90px;border-radius:7px;border:1px solid rgba(0,229,255,0.4);background:rgba(0,0,0,0.35);overflow:hidden;position:relative">
      <div id="mm-intro-timer-fill" style="position:absolute;bottom:0;left:0;width:100%;height:100%;background:rgba(0,229,255,0.55)"></div>
    </div>`;
  }
  function mmStartIntroTimerDrain() {
    const fill = document.getElementById('mm-intro-timer-fill');
    if (!fill) return;
    requestAnimationFrame(() => { fill.style.transition = 'height 1.5s linear'; fill.style.height = '0%'; });
  }
  function matchModeIntroSteps(mode, onDone) {
    const ann = mmMakeIntroOverlay();
    let items, watchTimer;
    if (mode === 'free') {
      items = [`${freePlayCharCount} PAIRS`, 'UNLIMITED MOVES', 'NO TIME LIMIT'];
      watchTimer = false;
    } else if (mode === 'hard') {
      items = ['12 PAIRS', 'UNLIMITED MOVES', '60 SECONDS'];
      watchTimer = true;
    } else if (mode === 'challenge') {
      items = ['16 PAIRS', 'UNLIMITED MOVES', '60 SECONDS'];
      watchTimer = true;
    } else {
      // Text-only "20 SECONDS" beat stays (still true to the mode's framing) — just
      // the watchTimer demo (the bar-drain animation) is skipped, since there's no
      // actual in-game countdown bar for Impossible to demo anymore.
      items = ['21 PAIRS', `${IMPOSSIBLE_MOVE_CUTOFF} MOVE LIMIT`, '20 SECONDS'];
      watchTimer = false;
    }
    const steps = items.map(text => ({ duration: 1000, show: () => { ann.innerHTML = mmIntroHeadline(text); } }));
    if (watchTimer) {
      steps.push({ duration: 2000, show: () => {
        ann.innerHTML = mmIntroHeadline('WATCH THE TIMER') + mmIntroTimerDemoHTML();
        mmStartIntroTimerDrain();
      }});
    }
    mmPlayIntroSteps(steps, () => { ann.remove(); onDone(); });
  }

  window.matchPlay = function(mode) {
    matchModeIntroSteps(mode || 'hard', () => _matchPlayReal(mode));
  };
  function _matchPlayReal(mode) {
    matchMode = mode || 'hard';
    window._matchMode = matchMode;
    window._matchFreePairs = freePlayCharCount;
    removeMatchSideBar();
    if (matchMode === 'hard' || matchMode === 'challenge') timeLimit = MODE_CONFIG[matchMode].time;
    cards = makeCards(); flipped=[]; locked=false; moves=0; matched=0; matchOutOfMoves=false; matchCutoffWaived=false;
    clearManualMismatchFlip();
    matchTimer=0;
    clearInterval(timerInt); clearInterval(previewInt);
    ArcadeMusic.stop();

    if (matchMode === 'free') {
      state = 'playing'; render();
      return;
    }

    // Hard/Challenge/Impossible all share the same memorize-preview + countdown flow.
    // Impossible gets longer to actually take in a 21-pair/42-card board.
    locked = true;
    state = 'preview'; render();
    let countdown = matchMode === 'impossible' ? 13 : matchMode === 'challenge' ? 7 : 3;
    previewInt = setInterval(() => {
      countdown--;
      const cd = document.getElementById('match-preview-cd');
      if (cd) cd.textContent = countdown > 0 ? `MEMORIZE!  ${countdown}` : 'GO!';
      if (countdown <= 0) {
        clearInterval(previewInt);
        cards.forEach(c => { c.flipped = false; });
        locked = false;
        state = 'playing'; render();
        // Impossible has no in-game timer/countdown/fail-by-time — once gameplay
        // starts it's measured by moves only (see checkMoveCutoff).
        if (matchMode === 'hard' || matchMode === 'challenge') {
          showMatchSideBar();
          updateMatchSideBar(100);
          SFX.raceStart();
          timerInt = setInterval(() => {
            matchTimer++;
            const el = document.getElementById('mt');
            if (el) {
              const remaining = timeLimit - matchTimer;
              el.textContent = remaining + 's';
              if (remaining <= 10) el.style.color = '#ff4444';
            }
            updateMatchSideBar((Math.max(0, timeLimit - matchTimer) / timeLimit) * 100);
            if (matchTimer >= timeLimit) {
              clearInterval(timerInt);
              removeMatchSideBar();
              SFX.over();
              setTimeout(showMatchGameOver, 700);
            }
          }, 1000);
        }
      }
    }, 1000);
  }

  function showMatchGameOver() {
    clearInterval(timerInt);
    clearInterval(previewInt);
    removeMatchSideBar();
    clearManualMismatchFlip();
    const cutoff = document.getElementById('match-cutoff-modal');
    if (cutoff) cutoff.remove();
    document.querySelectorAll('.match-intro-overlay').forEach(el => el.remove());
    locked = false;
    state = 'over';
    render();
    const wrap = document.getElementById('match-wrap');
    if (wrap) wrap.scrollTop = 0;
  }

  const PAIR_SAFE_COUNTS = [4,5,6,7,8,9,10,12,14,15,16,18,20].filter(n => n <= GAME_CHARS.length);
  window.matchAdjChar = function(delta) {
    const idx = PAIR_SAFE_COUNTS.indexOf(freePlayCharCount);
    const next = idx < 0 ? 0 : Math.max(0, Math.min(PAIR_SAFE_COUNTS.length - 1, idx + delta));
    freePlayCharCount = PAIR_SAFE_COUNTS[next];
    window._matchFreePairs = freePlayCharCount;
    const el = document.getElementById('match-char-ct');
    if (el) el.textContent = freePlayCharCount;
  };

  window.matchSetFreeFlipMode = function(mode) {
    freePlayFlipMode = mode === 'manual' ? 'manual' : 'auto';
    document.querySelectorAll('.match-flip-toggle button').forEach(btn => {
      const isActive = btn.textContent.toLowerCase().includes(freePlayFlipMode);
      btn.classList.toggle('active', isActive);
    });
  };

  function closeMatchFreeSetup() {
    const ov = document.getElementById('match-free-setup-modal');
    if (ov) ov.remove();
  }

  window.matchStartFreeFromPopup = function() {
    closeMatchFreeSetup();
    matchPlay('free');
  };

  window.matchGoFreeSetup = function() {
    closeMatchFreeSetup();
    if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
    const btnStyle = "font-family:'VCR',monospace;font-size:13px;background:none;border:1px solid rgba(242,239,232,0.2);border-radius:4px;color:rgba(242,239,232,0.78);width:38px;height:38px;cursor:pointer;padding:0;line-height:1";
    const ov = document.createElement('div');
    ov.id = 'match-free-setup-modal';
    ov.className = 'match-free-setup-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9700;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(5,2,18,0.82);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)';
    ov.innerHTML = `
      <div style="width:min(92vw,360px);background:#080515;border:2px solid #33ff66;border-radius:10px;padding:22px 18px 18px;text-align:center;box-shadow:0 0 28px rgba(51,255,102,0.24), inset 0 0 22px rgba(51,255,102,0.05)">
        <div style="font-family:'Bebas Neue',cursive;font-size:42px;letter-spacing:5px;line-height:1;color:#33ff66;text-shadow:0 0 18px #33ff6688;margin-bottom:10px">FREE PLAY</div>
        <div class="match-sub">ONE PAIR PER CHARACTER</div>
        <div class="match-sub" style="margin-top:5px;color:rgba(242,239,232,0.72)">HOW MANY MATCHES?</div>
        <div style="display:flex;align-items:center;justify-content:center;gap:22px;margin:16px 0 8px">
          <button onclick="matchAdjChar(-1)" style="${btnStyle}" aria-label="Fewer matches">−</button>
          <span id="match-char-ct" style="font-family:'Bebas Neue',cursive;font-size:62px;letter-spacing:4px;color:#33ff66;line-height:1;text-shadow:0 0 18px #33ff6688;min-width:72px;display:inline-block">${freePlayCharCount}</span>
          <button onclick="matchAdjChar(1)" style="${btnStyle}" aria-label="More matches">+</button>
        </div>
        <div class="match-sub" style="opacity:0.45;margin-bottom:16px">4 - 20</div>
        <div class="match-sub" style="color:rgba(242,239,232,0.72);margin-bottom:8px">MISSED MATCHES</div>
        <div class="match-flip-toggle" role="group" aria-label="Free play flip mode">
          <button class="${freePlayFlipMode === 'auto' ? 'active' : ''}" onclick="matchSetFreeFlipMode('auto')" type="button">AUTO FLIP</button>
          <button class="${freePlayFlipMode === 'manual' ? 'active' : ''}" onclick="matchSetFreeFlipMode('manual')" type="button">MANUAL FLIP</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:9px">
          <button class="whack-btn match-mode-btn" style="border-color:#33ff66;background:rgba(51,255,102,0.16)" onclick="matchStartFreeFromPopup()">▶ START</button>
          <button class="whack-btn match-mode-btn" style="border-color:rgba(242,239,232,0.18);background:none;font-size:10px;color:rgba(242,239,232,0.6)" onclick="matchGoIdle()">CANCEL</button>
        </div>
      </div>`;
    document.body.appendChild(ov);
  };

  window.matchGoIdle = function() {
    closeMatchFreeSetup();
    state = 'idle';
    render();
  };

  window.matchChangeMode = function() {
    window.matchBack();
    state = 'idle';
    render();
    if (!ArcadeMusic.playing && !ArcadeMusic.muted) ArcadeMusic.start();
    else ArcadeMusic.unduck();
  };

  window.initMatch = function() {
    removeMatchSideBar();
    clearManualMismatchFlip();
    state='idle'; cards=[]; flipped=[]; locked=false; render();
  };

  // Called from nav() whenever leaving the match page (mirrors whackBack()/
  // spacePause()) — stops pending timers and removes body-level floating elements
  // (side bar, a stray intro overlay) that exiting early via "ARCADE MENU" never
  // naturally reaches the cleanup for.
  window.matchBack = function() {
    clearInterval(timerInt); clearInterval(previewInt);
    removeMatchSideBar();
    clearManualMismatchFlip();
    closeMatchFreeSetup();
    document.querySelectorAll('.match-intro-overlay').forEach(el => el.remove());
  };
})();
