<<<<<<< HEAD
/* Grid Lock UI. It composes level data, progression, and the puzzle engine. */
=======
/* GRID LOCK — standalone game shell. Hosts the GridLock puzzle engine
   (gridlock.js) directly — no separate cockpit/launch screen, since the
   puzzle scene already has its own "board the grid" start overlay and a
   future map screen will own the pre-mission beat instead. Architecture
   step only: prove the arcade → puzzle structure works end to end with the
   existing puzzle gameplay unchanged. No progression, worlds, difficulty, or
   new mechanics yet — that's deliberately deferred to a later pass (see the
   placeholder "solved beat" below). This module never touches Journey's
   state or DOM; it is a fully independent game. */
>>>>>>> 1341c6516aa75d2082c6e373d28246cae1be59d7
(function () {
  'use strict';

  const hostId = 'gridlock-wrap';
  let active = false;
<<<<<<< HEAD
  let selectedLevelId = null;
=======
>>>>>>> 1341c6516aa75d2082c6e373d28246cae1be59d7

  function host() { return document.getElementById(hostId); }

  function playMenuSound() {
    if (typeof SFX !== 'undefined' && typeof SFX.menuSelect === 'function') SFX.menuSelect();
  }

<<<<<<< HEAD
  function selectedLevel() { return GridLockLevels.get(selectedLevelId) || GridLockLevels.get(GridLockLevels.firstId); }

  function renderCockpit() {
    const root = host();
    if (!root || !active) return;
    const world = GridLockLevels.worlds[0];
    const nodes = world.levels.map((level, index) => {
      const unlocked = GridLockProgression.isUnlocked(level.id);
      const completed = GridLockProgression.isCompleted(level.id);
      const status = completed ? 'COMPLETE' : unlocked ? 'READY' : 'LOCKED';
      return `<button class="gridlock-map-node ${completed ? 'is-complete' : ''} ${unlocked ? 'is-unlocked' : 'is-locked'}" type="button" ${unlocked ? `onclick="gridLockOpenLevel('${level.id}')"` : 'disabled'}>
        <span>${index + 1}</span><strong>${level.name}</strong><small>${status} · ${level.size.columns}×${level.size.rows}</small>
      </button>`;
    }).join('');
    root.innerHTML = `
      <main class="gridlock-cockpit" aria-labelledby="gridlock-cockpit-title">
        <header class="gridlock-cockpit-header">
          <button type="button" onclick="nav('lobby')">◀ MENU</button>
          <div><span>LOCAL GRID · ${world.name.toUpperCase()}</span><strong id="gridlock-cockpit-title">GRID LOCK</strong></div>
          <span class="gridlock-cockpit-status">MAP ONLINE</span>
        </header>
        <section class="gridlock-world-panel">
          <div class="gridlock-world-copy"><span>SECTOR 01</span><strong>${world.name}</strong><small>${world.description}</small></div>
          <div class="gridlock-world-core" aria-hidden="true"><i></i><b></b></div>
        </section>
        <section class="gridlock-map-panel" aria-label="Grid Lock level map">
          <div class="gridlock-map-heading"><span>PROGRESSION PATH</span><strong>SELECT A RELAY</strong></div>
          <div class="gridlock-map-path" aria-hidden="true"></div>
          <div class="gridlock-map-nodes">${nodes}</div>
        </section>
        <footer class="gridlock-cockpit-footer">COMPLETED RELAYS REMAIN AVAILABLE FOR NEW GENERATED RUNS.</footer>
      </main>`;
  }

=======
>>>>>>> 1341c6516aa75d2082c6e373d28246cae1be59d7
  // ---- Puzzle mission screen ------------------------------------------------

  function renderPuzzle() {
    const root = host();
    if (!root || !active) return;
<<<<<<< HEAD
    const level = selectedLevel();
    root.innerHTML = `
      <main class="gridlock-mission-screen">
        <header>
          <button type="button" class="gridlock-map-back" onclick="gridLockReturnToMap()">◀ MAP</button>
          <div><span>GRID LOCK · ${level.name.toUpperCase()}</span><strong id="gridlock-objective">SEAL THE GRID</strong></div>
=======
    root.innerHTML = `
      <main class="gridlock-mission-screen">
        <header>
          <span>GRID LOCK · CONDUIT BAY</span>
          <strong id="gridlock-objective">SEAL THE GRID</strong>
>>>>>>> 1341c6516aa75d2082c6e373d28246cae1be59d7
        </header>
        <div id="gridlock-stage" class="gridlock-stage is-paused" aria-label="Route power through the conduit grid to unlock it">
          <svg class="gridlock-svg" viewBox="0 92 560 728" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <defs>
              <linearGradient id="glMetalTop" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#28323f"/><stop offset="18%" stop-color="#1a222d"/><stop offset="100%" stop-color="#0c1119"/>
              </linearGradient>
              <radialGradient id="glCore" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#e6a24d"/><stop offset="45%" stop-color="#a5641f"/><stop offset="100%" stop-color="#4a2a08" stop-opacity="0"/>
              </radialGradient>
              <radialGradient id="glCrys" cx="50%" cy="34%" r="75%">
                <stop offset="0" stop-color="#dff4ff"/><stop offset="45%" stop-color="#7fbfe6"/><stop offset="100%" stop-color="#4b53c9"/>
              </radialGradient>
              <radialGradient id="glHalo" cx="50%" cy="50%" r="50%">
                <stop offset="0" stop-color="#8ea6d8" stop-opacity=".55"/><stop offset="100%" stop-color="#8ea6d8" stop-opacity="0"/>
              </radialGradient>
              <linearGradient id="glIce" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#cfe6f2" stop-opacity=".9"/><stop offset="100%" stop-color="#7fa2b8" stop-opacity=".2"/>
              </linearGradient>
              <filter id="glGlowBig" x="-120%" y="-120%" width="340%" height="340%"><feGaussianBlur stdDeviation="18"/></filter>
              <filter id="glSoft" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="2.2"/></filter>
              <filter id="glFrost" x="-30%" y="-30%" width="160%" height="160%">
                <feTurbulence type="fractalNoise" baseFrequency="0.14 0.2" numOctaves="3" seed="4" result="n"/>
                <feDisplacementMap in="SourceGraphic" in2="n" scale="10"/></filter>
              <clipPath id="glPort"><circle cx="280" cy="150" r="46"/></clipPath>
            </defs>

            <!-- bulkhead + lock core (goal) -->
            <path d="M-20,215 Q280,120 580,215 L580,90 L-20,90 Z" fill="url(#glMetalTop)"/>
            <path d="M-20,215 Q280,120 580,215" fill="none" stroke="#05090f" stroke-width="6"/>
            <rect x="264" y="150" width="32" height="86" fill="#0a1019" stroke="#1d2a38" stroke-width="2"/>
            <circle cx="280" cy="150" r="70" fill="url(#glHalo)" filter="url(#glGlowBig)" opacity=".5"/>
            <circle class="gl-vault-ring" cx="280" cy="150" r="52" fill="#060c15" stroke="#26384a" stroke-width="6"/>
            <g clip-path="url(#glPort)">
              <circle cx="280" cy="150" r="46" fill="#0a121d"/>
              <path d="M280,120 L296,142 L290,182 L270,182 L264,142 Z" fill="url(#glCrys)" filter="url(#glSoft)" opacity=".85"/>
              <path d="M234,150 h92 M280,104 v92" stroke="#cfe6f2" stroke-width="10" opacity=".22" filter="url(#glFrost)"/>
            </g>
            <text x="280" y="116" fill="#5f7fa0" font-size="12" letter-spacing="4" text-anchor="middle">GRID LOCK</text>

            <!-- three bolts (sinks): light + retract as current reaches them -->
            <g id="gridlock-bolt-0" class="gridlock-bolt" transform="translate(181,224)">
              <line class="gl-bolt-stub" x1="0" y1="8" x2="0" y2="30"/>
              <rect class="gl-bolt-housing" x="-17" y="-16" width="34" height="30" rx="4"/>
              <rect class="gl-bolt-pin" x="-6" y="-2" width="12" height="30"/>
              <circle class="gl-bolt-lamp" cx="0" cy="-4" r="5"/>
            </g>
            <g id="gridlock-bolt-1" class="gridlock-bolt" transform="translate(313,224)">
              <line class="gl-bolt-stub" x1="0" y1="8" x2="0" y2="30"/>
              <rect class="gl-bolt-housing" x="-17" y="-16" width="34" height="30" rx="4"/>
              <rect class="gl-bolt-pin" x="-6" y="-2" width="12" height="30"/>
              <circle class="gl-bolt-lamp" cx="0" cy="-4" r="5"/>
            </g>
            <g id="gridlock-bolt-2" class="gridlock-bolt" transform="translate(445,224)">
              <line class="gl-bolt-stub" x1="0" y1="8" x2="0" y2="30"/>
              <rect class="gl-bolt-housing" x="-17" y="-16" width="34" height="30" rx="4"/>
              <rect class="gl-bolt-pin" x="-6" y="-2" width="12" height="30"/>
              <circle class="gl-bolt-lamp" cx="0" cy="-4" r="5"/>
            </g>

            <!-- recessed housing -->
            <rect x="68" y="244" width="424" height="410" rx="10" fill="#05090f" stroke="#1a2534" stroke-width="3"/>
            <rect x="76" y="252" width="408" height="394" rx="7" fill="none" stroke="#020509" stroke-width="8" opacity=".7"/>

            <!-- reactor core (source) -->
            <ellipse cx="118" cy="742" rx="110" ry="72" fill="url(#glCore)" filter="url(#glGlowBig)" opacity=".55"/>
            <circle cx="118" cy="742" r="46" fill="#0a0e14" stroke="#3a3020" stroke-width="5"/>
            <g stroke="#d9902f" stroke-width="5" stroke-linecap="round" opacity=".9">
              <line x1="98" y1="724" x2="138" y2="724"/><line x1="92" y1="742" x2="144" y2="742"/><line x1="98" y1="760" x2="138" y2="760"/>
            </g>
            <rect x="106" y="636" width="24" height="70" rx="6" fill="#151f2b" stroke="#0a121c" stroke-width="2"/>
            <rect class="gl-feed" x="113" y="636" width="6" height="70"/>
            <text x="118" y="800" fill="#c88f4a" font-size="12" letter-spacing="3" text-anchor="middle">POWER CORE</text>

            <!-- pressure gauge -->
            <g transform="translate(438,752)">
              <circle r="46" fill="#070c14" stroke="#233242" stroke-width="4"/>
              <g stroke="#43586e" stroke-width="2">
                <line x1="0" y1="-38" x2="0" y2="-31"/><line x1="27" y1="-27" x2="22" y2="-22"/><line x1="38" y1="0" x2="31" y2="0"/>
                <line x1="-27" y1="-27" x2="-22" y2="-22"/><line x1="-38" y1="0" x2="-31" y2="0"/>
              </g>
              <path d="M-38,0 A38 38 0 0 1 38 0" fill="none" stroke="#2c4a63" stroke-width="4" opacity=".7"/>
              <g id="gridlock-needle" transform="rotate(-120)"><line x1="0" y1="0" x2="0" y2="-33" stroke="#6fd0ff" stroke-width="3" stroke-linecap="round"/></g>
              <circle r="4" fill="#6fd0ff"/>
              <text x="0" y="40" fill="#4a6a86" font-size="12" letter-spacing="2" text-anchor="middle">SEALED</text>
            </g>

            <!-- conduit tiles injected here -->
            <g id="gridlock-grid"></g>
          </svg>
          <div class="gridlock-scan" aria-hidden="true"></div>
          <div class="gridlock-vig" aria-hidden="true"></div>

          <button id="gridlock-start" class="gridlock-start" type="button" onclick="gridLockBeginPuzzle()">
            <strong>SEAL THE GRID</strong>
            <small>Rotate every conduit until nothing leaks, and the grid unlocks.</small>
            <b>BOARD THE GRID →</b>
          </button>
        </div>
      </main>`;
    GridLock.start({
      stageId: 'gridlock-stage',
<<<<<<< HEAD
      size: level.size,
      generationRules: level.generationRules,
      onSuccessReady(result) { showSolvedBeat(result.stats); }
    });
  }

  function showSolvedBeat(stats) {
    const stage = document.getElementById('gridlock-stage');
    if (!stage || !active) return;
    const level = selectedLevel();
    const next = GridLockLevels.next(level.id);
    GridLockProgression.complete(level.id, stats);
    const overlay = document.createElement('div');
    overlay.className = 'gridlock-solved';
    overlay.innerHTML = `
      <span>${next ? 'NEXT RELAY UNLOCKED' : 'GRID UNLOCKED'}</span>
      <strong>${level.name.toUpperCase()} SOLVED</strong>
      <small>${stats.rotations} ROTATIONS · NEW GENERATED RUN READY</small>
      <div class="gridlock-solved-actions">
        <button type="button" onclick="gridLockPlayAgain()">REPLAY</button>
        ${next ? `<button type="button" onclick="gridLockOpenLevel('${next.id}')">NEXT RELAY</button>` : ''}
        <button type="button" onclick="gridLockReturnToMap()">RETURN TO MAP</button>
=======
      onSuccessReady() { showSolvedBeat(); }
    });
  }

  function showSolvedBeat() {
    const stage = document.getElementById('gridlock-stage');
    if (!stage || !active) return;
    const overlay = document.createElement('div');
    overlay.className = 'gridlock-solved';
    overlay.innerHTML = `
      <span>GRID UNLOCKED</span>
      <strong>SOLVED</strong>
      <div class="gridlock-solved-actions">
        <button type="button" onclick="gridLockPlayAgain()">PLAY AGAIN</button>
>>>>>>> 1341c6516aa75d2082c6e373d28246cae1be59d7
      </div>`;
    stage.appendChild(overlay);
  }

  // ---- Global handlers (called from rendered markup) -----------------------

  window.gridLockBeginPuzzle = function () {
    if (!active) return;
    playMenuSound();
    const overlay = document.getElementById('gridlock-start');
    if (overlay) overlay.remove();
    if (typeof GridLock !== 'undefined') GridLock.begin();
  };

  window.gridLockPlayAgain = function () {
    if (!active) return;
    playMenuSound();
    renderPuzzle();
  };

<<<<<<< HEAD
  window.gridLockOpenLevel = function (levelId) {
    if (!active || !GridLockProgression.isUnlocked(levelId)) return;
    selectedLevelId = levelId;
    playMenuSound();
    if (typeof GridLock !== 'undefined') GridLock.destroy();
    renderPuzzle();
  };

  window.gridLockReturnToMap = function () {
    if (!active) return;
    playMenuSound();
    if (typeof GridLock !== 'undefined') GridLock.destroy();
    renderCockpit();
  };

=======
>>>>>>> 1341c6516aa75d2082c6e373d28246cae1be59d7
  // ---- Lifecycle (called by arcade.js nav()) --------------------------------

  window.initGridLock = function () {
    active = true;
<<<<<<< HEAD
    renderCockpit();
=======
    renderPuzzle();
>>>>>>> 1341c6516aa75d2082c6e373d28246cae1be59d7
  };

  window.gridLockBack = function () {
    if (!active) return;
    active = false;
    if (typeof GridLock !== 'undefined') GridLock.destroy();
    const root = host();
    if (root) root.innerHTML = '';
  };
})();
