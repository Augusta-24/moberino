// FACE FACTORY — gentle family-face play: reels, an eight-piece puzzle, and mix-and-match faces.
(() => {
  let screen = 'menu';
  let timers = [];
  let puzzle = null;
  let selectedPiece = null;
  let mixChars = [0, 1, 2];
  let guess = null;

  const wrap = () => document.getElementById('face-factory-wrap');
  const rand = n => Math.floor(Math.random() * n);
  const shuffle = list => {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rand(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  const distinctChars = count => shuffle(GAME_CHARS.map((_, i) => i)).slice(0, count);
  const later = (fn, ms) => {
    const id = setTimeout(fn, ms);
    timers.push({ type: 'timeout', id });
    return id;
  };
  const repeat = (fn, ms) => {
    const id = setInterval(fn, ms);
    timers.push({ type: 'interval', id });
    return id;
  };
  function clearTimers() {
    timers.forEach(t => t.type === 'interval' ? clearInterval(t.id) : clearTimeout(t.id));
    timers = [];
  }
  function sound(name, ...args) {
    try { if (typeof SFX !== 'undefined' && typeof SFX[name] === 'function') SFX[name](...args); } catch (_) {}
  }
  function celebrate(big) {
    sound(big ? 'mysteryGood' : 'match');
    try { ticketConfetti(!big); } catch (_) {}
  }
  function spark(el) {
    if (!el) return;
    el.classList.remove('ff-holo', 'ff-celebrate');
    void el.offsetWidth;
    el.classList.add('ff-holo', 'ff-celebrate');
    const burst = document.createElement('span');
    burst.className = 'ff-spark-burst';
    burst.innerHTML = '<i></i><i></i><i></i><i></i>';
    el.appendChild(burst);
    later(() => burst.remove(), 950);
    later(() => el.classList.remove('ff-holo', 'ff-celebrate'), 1250);
  }

  function shell(title, content, backAction = "faceFactoryShowMenu()") {
    return `<div class="ff-shell">
      <div class="ff-topbar">
        <button class="ff-back" type="button" onclick="${backAction}">◀ ${screen === 'menu' ? 'ARCADE' : 'GAMES'}</button>
        <div class="ff-top-title">${title}</div>
      </div>
      <main class="ff-screen">${content}</main>
    </div>`;
  }
  function modeIcon(ci, expr = 'normal') {
    return charFace(GAME_CHARS[ci], expr);
  }

  window.initFaceFactory = function() {
    clearTimers();
    screen = 'menu';
    renderMenu();
  };
  window.faceFactoryBack = function() { clearTimers(); };
  window.faceFactoryShowMenu = function() {
    clearTimers();
    screen = 'menu';
    sound('menuSelect');
    renderMenu();
  };

  function renderMenu() {
    const root = wrap();
    if (!root) return;
    root.innerHTML = shell('FACE FACTORY', `
      <div class="ff-title">FACE FACTORY</div>
      <div class="ff-subtitle">THREE WAYS TO PLAY WITH THE FAMILY</div>
      <div class="ff-mode-grid">
        <button class="ff-mode-card" style="--mode-color:#ff66dd" type="button" onclick="faceFactoryOpen('reels')">
          <div class="ff-mode-icon">${modeIcon(4, 'happy')}</div><strong>FACE REELS</strong><span>PRESS THE BIG BUTTON<br>AND WATCH THEM SPIN</span>
        </button>
        <button class="ff-mode-card" style="--mode-color:#ffe61a" type="button" onclick="faceFactoryOpen('puzzle')">
          <div class="ff-mode-icon ff-icon-puzzle">${modeIcon(10)}</div><strong>BUILD THE FACES</strong><span>TWO FACES<br>EIGHT BIG PIECES</span>
        </button>
        <button class="ff-mode-card" style="--mode-color:#00e5ff" type="button" onclick="faceFactoryOpen('crazy')">
          <div class="ff-mode-icon ff-icon-crazy">${modeIcon(5, 'happy')}</div><strong>CRAZY FACE</strong><span>MIX THE HAIR<br>NOSE AND SMILE</span>
        </button>
      </div>`, "SFX.menuSelect();nav('lobby')");
  }

  window.faceFactoryOpen = function(next) {
    clearTimers();
    screen = next;
    sound('menuSelect');
    if (next === 'reels') renderReels();
    if (next === 'puzzle') startPuzzle();
    if (next === 'crazy') renderCrazyMixer(true);
  };

  // ── FACE REELS ──────────────────────────────────────────────────────────
  function reelMarkup(ci, i) {
    return `<div class="ff-reel" id="ff-reel-${i}"><img src="${GAME_CHARS[ci].img}" alt="${GAME_CHARS[ci].name}"></div>`;
  }
  function renderReels() {
    mixChars = distinctChars(3);
    wrap().innerHTML = shell('FACE REELS', `<section class="ff-panel">
      <div class="ff-title">FACE REELS</div>
      <div class="ff-subtitle">EVERY SPIN IS A WIN</div>
      <div class="ff-reels" id="ff-reels">${mixChars.map(reelMarkup).join('')}</div>
      <div class="ff-message" id="ff-reel-message">READY?</div>
      <button class="ff-big-button" id="ff-spin-button" type="button" onclick="faceFactorySpin()">★ SPIN! ★</button>
    </section>`);
  }
  function setReel(i, ci, expr) {
    const reel = document.getElementById(`ff-reel-${i}`);
    const img = reel && reel.querySelector('img');
    if (!img) return;
    const c = GAME_CHARS[ci];
    img.src = expr === 'happy' ? (c.imgHappy || c.img) : c.img;
    img.alt = c.name;
  }
  window.faceFactorySpin = function() {
    const btn = document.getElementById('ff-spin-button');
    if (!btn || btn.disabled) return;
    clearTimers();
    btn.disabled = true;
    btn.textContent = 'SPINNING!';
    const msg = document.getElementById('ff-reel-message');
    if (msg) msg.textContent = 'HERE THEY COME...';
    sound('boxOpen');

    // Frequent matching results keep the machine celebratory without making every spin identical.
    const roll = Math.random();
    let finals;
    if (roll < .28) {
      const ci = rand(GAME_CHARS.length);
      finals = [ci, ci, ci];
    } else if (roll < .62) {
      const pair = rand(GAME_CHARS.length);
      let other = rand(GAME_CHARS.length);
      while (other === pair) other = rand(GAME_CHARS.length);
      finals = shuffle([pair, pair, other]);
    } else {
      finals = distinctChars(3);
    }

    [0, 1, 2].forEach(i => {
      const reel = document.getElementById(`ff-reel-${i}`);
      reel?.classList.add('spinning');
      const id = repeat(() => setReel(i, rand(GAME_CHARS.length)), 105 + i * 12);
      later(() => {
        clearInterval(id);
        setReel(i, finals[i], 'happy');
        reel?.classList.remove('spinning');
        sound('charPick', i);
        spark(reel);
        if (i === 2) finishSpin(finals);
      }, 900 + i * 430);
    });
  };
  function finishSpin(finals) {
    const all = finals[0] === finals[1] && finals[1] === finals[2];
    const pair = !all && (finals[0] === finals[1] || finals[0] === finals[2] || finals[1] === finals[2]);
    const msg = document.getElementById('ff-reel-message');
    if (all) {
      if (msg) msg.textContent = `JACKPOT! THREE ${GAME_CHARS[finals[0]].name}S!`;
      document.querySelectorAll('.ff-reel').forEach(spark);
      celebrate(true);
    } else if (pair) {
      const match = finals.find((v, i) => finals.indexOf(v) !== i);
      if (msg) msg.textContent = `A ${GAME_CHARS[match].name} DOUBLE!`;
      celebrate(false);
    } else {
      if (msg) msg.textContent = 'WHAT A FAMILY!';
      sound('win');
    }
    const btn = document.getElementById('ff-spin-button');
    if (btn) { btn.disabled = false; btn.textContent = '★ SPIN AGAIN! ★'; }
  }

  // ── EIGHT-PIECE / TWO-FACE PUZZLE ──────────────────────────────────────
  function pieceStyle(ci, pos) {
    const x = pos % 2 ? '100%' : '0%';
    const y = pos > 1 ? '100%' : '0%';
    return `--face:url('../../${GAME_CHARS[ci].img}');--piece-color:${GAME_CHARS[ci].color};--piece-x:${x};--piece-y:${y}`;
  }
  function makePiece(ci, pos, id) {
    return `<button class="ff-piece" id="${id}" type="button" draggable="true" data-ci="${ci}" data-pos="${pos}" style="${pieceStyle(ci, pos)}" aria-label="Piece of ${GAME_CHARS[ci].name}" onclick="faceFactorySelectPiece('${id}')" ondragstart="faceFactoryDragPiece(event,'${id}')"></button>`;
  }
  function startPuzzle() {
    const chars = distinctChars(2);
    puzzle = { chars, placed: 0 };
    selectedPiece = null;
    const pieces = shuffle(chars.flatMap(ci => [0, 1, 2, 3].map(pos => ({ ci, pos }))));
    const boards = chars.map(ci => `<div class="ff-puzzle-person">
      <div class="ff-person-name" style="color:${GAME_CHARS[ci].color}">${GAME_CHARS[ci].name}</div>
      <div class="ff-puzzle-board" data-board="${ci}" style="--person-color:${GAME_CHARS[ci].color}">
        <img class="ff-puzzle-ghost" src="${GAME_CHARS[ci].img}" alt="">
        ${[0,1,2,3].map(pos => `<div class="ff-target" data-ci="${ci}" data-pos="${pos}" onclick="faceFactoryPlacePiece(this)" ondragover="event.preventDefault()" ondrop="faceFactoryDropPiece(event,this)"></div>`).join('')}
      </div>
    </div>`).join('');
    wrap().innerHTML = shell('BUILD THE FACES', `<section class="ff-panel">
      <div class="ff-title">BUILD THE FACES</div>
      <div class="ff-subtitle">TAP A PIECE · THEN TAP WHERE IT BELONGS</div>
      <div class="ff-message" id="ff-puzzle-message">PICK ANY PIECE</div>
      <div class="ff-puzzle-stage">${boards}</div>
      <div class="ff-piece-tray" id="ff-piece-tray">${pieces.map((p, i) => makePiece(p.ci, p.pos, `ff-piece-${i}`)).join('')}</div>
      <div class="ff-small-actions"><button class="ff-small-btn" type="button" onclick="faceFactoryPuzzleHint()">✦ SHOW ME ONE</button><button class="ff-small-btn" type="button" onclick="faceFactoryNewPuzzle()">NEW FACES</button></div>
    </section>`);
  }
  window.faceFactoryNewPuzzle = function() { clearTimers(); sound('menuSelect'); startPuzzle(); };
  window.faceFactorySelectPiece = function(id) {
    const piece = document.getElementById(id);
    if (!piece || piece.closest('.ff-target')) return;
    document.querySelectorAll('.ff-piece.selected').forEach(el => el.classList.remove('selected'));
    selectedPiece = id;
    piece.classList.add('selected');
    sound('charPick', +piece.dataset.ci % 8);
    const msg = document.getElementById('ff-puzzle-message');
    if (msg) msg.textContent = `A PIECE OF ${GAME_CHARS[+piece.dataset.ci].name}`;
  };
  window.faceFactoryDragPiece = function(event, id) {
    selectedPiece = id;
    event.dataTransfer?.setData('text/plain', id);
  };
  window.faceFactoryDropPiece = function(event, target) {
    event.preventDefault();
    const id = event.dataTransfer?.getData('text/plain');
    if (id) selectedPiece = id;
    placeSelected(target);
  };
  window.faceFactoryPlacePiece = function(target) { placeSelected(target); };
  function placeSelected(target) {
    if (!selectedPiece || target.querySelector('.ff-piece')) return;
    const piece = document.getElementById(selectedPiece);
    if (!piece) return;
    const correct = piece.dataset.ci === target.dataset.ci && piece.dataset.pos === target.dataset.pos;
    if (!correct) {
      target.classList.remove('wrong'); void target.offsetWidth; target.classList.add('wrong');
      const msg = document.getElementById('ff-puzzle-message');
      if (msg) msg.textContent = 'TRY ANOTHER SPOT';
      later(() => {
        const right = document.querySelector(`.ff-target[data-ci="${piece.dataset.ci}"][data-pos="${piece.dataset.pos}"]`);
        right?.classList.add('ff-hint-target');
        later(() => right?.classList.remove('ff-hint-target'), 1000);
      }, 900);
      return;
    }
    piece.classList.remove('selected');
    piece.draggable = false;
    target.appendChild(piece);
    selectedPiece = null;
    puzzle.placed++;
    sound('match');
    spark(target);
    const msg = document.getElementById('ff-puzzle-message');
    if (msg) msg.textContent = `${puzzle.placed} OF 8 PIECES!`;
    if (puzzle.placed === 8) later(finishPuzzle, 350);
  }
  window.faceFactoryPuzzleHint = function() {
    const piece = document.querySelector('#ff-piece-tray .ff-piece');
    if (!piece) return;
    window.faceFactorySelectPiece(piece.id);
    const target = document.querySelector(`.ff-target[data-ci="${piece.dataset.ci}"][data-pos="${piece.dataset.pos}"]`);
    target?.classList.add('ff-hint-target');
    later(() => target?.classList.remove('ff-hint-target'), 1700);
  };
  function finishPuzzle() {
    document.querySelectorAll('.ff-puzzle-board').forEach(spark);
    const msg = document.getElementById('ff-puzzle-message');
    if (msg) msg.textContent = 'THE FAMILY IS BACK TOGETHER!';
    celebrate(true);
  }

  // ── CRAZY FACE MIXER + RECOGNITION ROUND ───────────────────────────────
  const bandLabels = ['HAIR & EYES', 'NOSE', 'SMILE & CHIN'];
  const bandY = ['0%', '50%', '100%'];
  function bandMarkup(part, ci, controls) {
    return `<div class="ff-face-band" id="ff-band-${part}" data-part="${part}" style="--face:url('../../${GAME_CHARS[ci].img}');--band-y:${bandY[part]}" ${controls ? `onclick="faceFactoryCycleBand(${part},1)"` : ''}>
      ${controls ? '<div class="ff-band-controls"><span>◀</span><span>▶</span></div>' : ''}
      ${controls ? `<span class="ff-band-name">${GAME_CHARS[ci].name}</span>` : ''}
    </div>`;
  }
  function crazyTabs(active) {
    return `<div class="ff-mix-tabs"><button class="ff-mix-tab ${active === 'mix' ? 'active' : ''}" type="button" onclick="faceFactoryCrazyMode('mix')">JUST MIX</button><button class="ff-mix-tab ${active === 'guess' ? 'active' : ''}" type="button" onclick="faceFactoryCrazyMode('guess')">GUESS THE PARTS</button></div>`;
  }
  function renderCrazyMixer(randomize) {
    if (randomize) mixChars = distinctChars(3);
    wrap().innerHTML = shell('CRAZY FACE', `<section class="ff-panel">
      <div class="ff-title">CRAZY FACE</div>${crazyTabs('mix')}
      <div class="ff-crazy-face" id="ff-crazy-face">${mixChars.map((ci, part) => bandMarkup(part, ci, true)).join('')}</div>
      <div class="ff-message" id="ff-crazy-message">TAP ANY PART TO CHANGE IT</div>
      <button class="ff-big-button" type="button" onclick="faceFactoryMixIt()">★ MIX IT! ★</button>
    </section>`);
  }
  window.faceFactoryCrazyMode = function(mode) {
    clearTimers();
    sound('menuSelect');
    if (mode === 'mix') renderCrazyMixer(false);
    else startGuessRound();
  };
  window.faceFactoryCycleBand = function(part, direction) {
    mixChars[part] = (mixChars[part] + direction + GAME_CHARS.length) % GAME_CHARS.length;
    const old = document.getElementById(`ff-band-${part}`);
    if (!old) return;
    old.outerHTML = bandMarkup(part, mixChars[part], true);
    sound('charPick', mixChars[part] % 8);
    spark(document.getElementById(`ff-band-${part}`));
  };
  window.faceFactoryMixIt = function() {
    mixChars = distinctChars(3);
    const face = document.getElementById('ff-crazy-face');
    if (!face) return;
    face.innerHTML = mixChars.map((ci, part) => bandMarkup(part, ci, true)).join('');
    const msg = document.getElementById('ff-crazy-message');
    if (msg) msg.textContent = `${GAME_CHARS[mixChars[0]].name} + ${GAME_CHARS[mixChars[1]].name} + ${GAME_CHARS[mixChars[2]].name}!`;
    spark(face);
    celebrate(false);
  };

  function startGuessRound() {
    guess = { chars: distinctChars(3), part: 0, score: 0 };
    renderGuess();
  }
  function guessChoices(correct) {
    const distractors = shuffle(GAME_CHARS.map((_, i) => i).filter(i => i !== correct)).slice(0, 2);
    return shuffle([correct, ...distractors]);
  }
  function renderGuess() {
    const part = guess.part;
    const correct = guess.chars[part];
    const choices = guessChoices(correct);
    wrap().innerHTML = shell('GUESS THE PARTS', `<section class="ff-panel">
      <div class="ff-title">WHOSE PART IS IT?</div>${crazyTabs('guess')}
      <div class="ff-crazy-face" id="ff-crazy-face">${guess.chars.map((ci, p) => bandMarkup(p, ci, false)).join('')}</div>
      <div class="ff-message" id="ff-guess-message">WHOSE ${bandLabels[part]}?</div>
      <div class="ff-guess-score">PART ${part + 1} OF 3</div>
      <div class="ff-guess-options">${choices.map(ci => `<button class="ff-guess-choice" type="button" data-ci="${ci}" onclick="faceFactoryGuess(${ci},this)"><img src="${GAME_CHARS[ci].img}" alt=""><span>${GAME_CHARS[ci].name}</span></button>`).join('')}</div>
    </section>`);
  }
  window.faceFactoryGuess = function(ci, button) {
    const correct = guess.chars[guess.part];
    const msg = document.getElementById('ff-guess-message');
    if (ci !== correct) {
      if (msg) msg.textContent = 'LOOK CLOSELY — TRY AGAIN!';
      button.classList.add('ff-nudge');
      later(() => button.classList.remove('ff-nudge'), 400);
      later(() => document.querySelector(`.ff-guess-choice[data-ci="${correct}"]`)?.classList.add('hint'), 900);
      return;
    }
    document.querySelectorAll('.ff-guess-choice').forEach(btn => btn.disabled = true);
    button.classList.add('hint');
    spark(document.getElementById(`ff-band-${guess.part}`));
    sound('match');
    if (msg) msg.textContent = `YES — THAT IS ${GAME_CHARS[correct].name}!`;
    guess.score++;
    guess.part++;
    if (guess.part < 3) later(renderGuess, 1050);
    else later(finishGuess, 1050);
  };
  function finishGuess() {
    celebrate(true);
    wrap().innerHTML = shell('GUESS THE PARTS', `<section class="ff-panel">
      <div class="ff-title">YOU FOUND EVERYONE!</div>
      <div class="ff-crazy-face ff-holo ff-celebrate">${guess.chars.map((ci, p) => bandMarkup(p, ci, false)).join('')}</div>
      <div class="ff-message">GREAT FAMILY EYES!</div>
      <button class="ff-big-button" type="button" onclick="faceFactoryCrazyMode('guess')">PLAY AGAIN!</button>
      <div class="ff-small-actions"><button class="ff-small-btn" type="button" onclick="faceFactoryCrazyMode('mix')">JUST MIX FACES</button></div>
    </section>`);
  }
})();
