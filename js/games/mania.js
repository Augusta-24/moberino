/* global SFX, ArcadeMusic, getAudioCtx, nav, setArcadeExitVisible, GAME_CHARS, getGlobalChar, _getImg */
// Moberino Mania
// Five original midway booths share one target scheduler, scoring language,
// and responsive canvas. Each scene owns its visible nouns, projectile, target
// motion, secret rule, payoff, and camera behavior.
(() => {
  'use strict';

  const ROUND_SECONDS = 20;
  const FINALE_PHASE_SECONDS = 20;
  const FINALE_RAPID_SECONDS = 10;
  const FINALE_SECONDS = FINALE_PHASE_SECONDS * 2 + FINALE_RAPID_SECONDS;
  const WORLD_LENGTH = 5600;
  const FINALE_WORLD_LENGTH = 2400;
  const ORBIT_FREEZE_SECONDS = 5.25;
  const BOOTHS = [
    {
      id: 'farm',
      title: 'FARM FRENZY',
      short: 'FARM',
      accent: '#ffcf4a',
      hudLabel: 'BARN HITS',
      goal: 3,
      intro: 'Toss eggs at foreground animals, track the sliding middle lane, and pick off small high-value hill targets. Hit the barn door 3 times to open its prize.',
      prompt: 'TOSS EGGS · TRACK · HIT THE BARN 3 TIMES!',
    },
    {
      id: 'orbit',
      title: 'RAPID RINGS',
      short: 'RINGS',
      accent: '#6de8ff',
      hudLabel: 'FORMATIONS',
      goal: 1,
      intro: 'Four rings freezes a Moon Mobe. Freeze all 6 at once to summon the Ringmaster Robot, then rapid-fire rings into its mouth.',
      prompt: 'CLEAR THE 6 · THEN FEED THE ROBOT!',
    },
    {
      id: 'plates',
      title: 'BEAVER BONANZA',
      short: 'BEAVERS',
      accent: '#ff8c68',
      hudLabel: 'BONANZA HITS',
      goal: 5,
      intro: 'Logs land exactly where you tap, but distant throws take a much larger curved path before impact. Clear three five-beaver banks to summon the golden bonanza while tracking foreground runners and two covered spillway experts.',
      prompt: 'CLEAR 3 ROWS → UNLOCK GOLD BEAVERS!',
    },
    {
      id: 'volcano',
      title: 'VOLCANIC POP',
      short: 'VOLCANO',
      accent: '#ff5d9d',
      hudLabel: 'ERUPTION STEPS',
      goal: 3,
      intro: 'Throw darts at balloons to score maximum points, or hit the dinosaur for a quick chain pop. Clear each three-comet wave to erupt the volcano.',
      prompt: 'DART BALLOONS OR DINO · CLEAR 3 COMETS!',
    },
    {
      id: 'finale',
      title: 'TARGET SHOWDOWN',
      short: 'TARGETS',
      accent: '#b991ff',
      hudLabel: 'SHOWDOWN PHASE',
      goal: 0,
      intro: 'Clear expanding banks, track the scroll, then clear the final locks quickly to unlock an escalating rapid-fire target.',
      prompt: 'CLEAR · TRACK · UNLOCK RAPID FIRE!',
    },
  ];
  const COLORS = {
    cream: '#fff4d5',
    yellow: '#ffcf4a',
    brown: '#57331e',
    red: '#b9363b',
    green: '#3f7d36',
    ink: '#211c18',
  };

  let frame = 0;
  let canvas = null;
  let ctx = null;
  let stage = null;
  let toastTimer = 0;
  let intermissionTimer = 0;
  let intermissionTicker = 0;
  let resizeObserver = null;
  let state = null;

  function syncManiaViewportHeight() {
    const active = document.body?.classList.contains('on-mania');
    if (!active) {
      document.body?.classList.remove('mania-compact-landscape');
      return;
    }
    const viewport = window.visualViewport;
    const visibleHeight = Math.max(1, Math.floor(viewport?.height || window.innerHeight || 1));
    const visibleWidth = Math.max(1, Math.floor(viewport?.width || window.innerWidth || 1));
    const landscape = visibleWidth > visibleHeight;
    const phoneLandscape = landscape && visibleHeight <= 500 && visibleWidth <= 950;
    document.documentElement.style.setProperty('--mania-vh', `${visibleHeight}px`);
    document.documentElement.style.setProperty(
      '--mania-game-height',
      `${Math.max(320, Math.min(760, visibleHeight - (landscape ? 28 : 24)))}px`
    );
    document.body.classList.toggle('mania-landscape', landscape);
    document.body.classList.toggle(
      'mania-compact-landscape',
      landscape && visibleHeight <= 700
    );
    document.body.classList.toggle('mania-phone-landscape', phoneLandscape);
  }

  window.addEventListener('resize', syncManiaViewportHeight);
  window.addEventListener('orientationchange', syncManiaViewportHeight);
  window.visualViewport?.addEventListener('resize', syncManiaViewportHeight);

  const ManiaMusic = (() => {
    const VOLUME = 0.018;
    let wanted = false;
    let loadStarted = false;
    let audioBuffer = null;
    let gainNode = null;
    let sourceNode = null;

    function ensureGain() {
      if (gainNode) return;
      const audioContext = getAudioCtx();
      gainNode = audioContext.createGain();
      gainNode.gain.value = ArcadeMusic?.muted ? 0 : VOLUME;
      gainNode.connect(audioContext.destination);
    }

    function loadBuffer() {
      if (loadStarted || audioBuffer) return;
      loadStarted = true;
      ensureGain();
      const audioContext = getAudioCtx();
      fetch('mania.mp3')
        .then(response => {
          if (!response.ok) throw new Error(`fetch failed: ${response.status}`);
          return response.arrayBuffer();
        })
        .then(data => {
          if (!data.byteLength) throw new Error('mania.mp3 is empty');
          return audioContext.decodeAudioData(data);
        })
        .then(buffer => {
          audioBuffer = buffer;
          loadStarted = false;
          if (wanted && !ArcadeMusic?.muted) playSource();
        })
        .catch(error => {
          console.warn('[ManiaMusic] failed to load mania.mp3:', error);
          loadStarted = false;
          if (wanted && !ArcadeMusic?.muted) {
            ArcadeMusic?.start();
            ArcadeMusic?.duck();
          }
        });
    }

    function playSource() {
      if (!wanted || ArcadeMusic?.muted || sourceNode) return;
      if (!audioBuffer) {
        loadBuffer();
        return;
      }
      ensureGain();
      const audioContext = getAudioCtx();
      if (audioContext.state !== 'running') {
        audioContext.resume?.().then(playSource).catch(() => {});
        return;
      }
      sourceNode = audioContext.createBufferSource();
      sourceNode.buffer = audioBuffer;
      sourceNode.loop = true;
      sourceNode.connect(gainNode);
      // Do not silence the lobby until the replacement soundtrack is decoded
      // and ready. A missing/corrupt Mania file should fall back to ducked lobby
      // music instead of leaving the entire game silent.
      ArcadeMusic?.stop();
      sourceNode.start(0);
    }

    function stopSource() {
      if (!sourceNode) return;
      try { sourceNode.stop(); } catch (e) {}
      sourceNode.disconnect();
      sourceNode = null;
    }

    return {
      start() {
        wanted = true;
        loadBuffer();
        playSource();
      },
      stop() {
        wanted = false;
        stopSource();
      },
      syncMute() {
        if (gainNode) gainNode.gain.value = ArcadeMusic?.muted ? 0 : VOLUME;
        if (ArcadeMusic?.muted) {
          stopSource();
        } else if (wanted) {
          loadBuffer();
          playSource();
        }
      },
    };
  })();

  window.maniaSyncMusicMute = function maniaSyncMusicMute() {
    ManiaMusic.syncMute();
  };

  function initialState(boothIndex = 0, totalScore = 0, rounds = [], practice = false) {
    return {
      phase: 'menu',
      boothIndex,
      totalScore,
      rounds,
      practice,
      countdownAt: 0,
      startAt: 0,
      elapsed: 0,
      score: 0,
      hits: 0,
      taps: 0,
      special: 0,
      hiddenMobesFound: 0,
      hiddenMobeTotal: 2,
      hiddenMobesAssigned: 0,
      hiddenCharacterPool: [],
      bonusTriggered: false,
      eruptionAt: 0,
      volcanoStage: 0,
      volcanoStageReadyAt: 0,
      targets: [],
      particles: [],
      labels: [],
      shots: [],
      ringFlights: [],
      logFlights: [],
      formationWave: 0,
      formationRespawnAt: 0,
      orbitBossActive: false,
      orbitBossAt: 0,
      finalePhase: -1,
      finaleWave: 0,
      finaleRespawnAt: 0,
      finaleClearedWave: -1,
      finalePrecisionWave: 0,
      finalePrecisionNextAt: 0,
      rapidUnlocked: false,
      rapidTapCount: 0,
      barnHits: 0,
      barnTier: 0,
      barnDoorCooldown: 0,
      barnBonusActive: false,
      barnBonusTarget: null,
      farmAnimalCycle: 0,
      damBankWave: 0,
      damBankRespawnAt: 0,
      damProgressPulseAt: 0,
      damGoldActive: false,
      damGoldCleared: false,
      barns: [],
      props: [],
      direction: 1,
      width: 0,
      height: 0,
      dpr: 1,
    };
  }

  function menuMarkup() {
    return `
      <section class="mania-menu" aria-labelledby="mania-title">
        <h1 class="mania-menu-title" id="mania-title">MOBERINO <span>MANIA</span></h1>
        <button class="mania-btn" type="button" onclick="maniaStart()">PLAY</button>
        <button class="mania-menu-back" type="button" onclick="nav('lobby')">◀ ARCADE MENU</button>
        <div class="mania-practice" aria-label="Practice a booth">
          <span>PRACTICE</span>
          ${BOOTHS.map((booth, index) => `<button type="button" onclick="maniaPractice(${index})">${booth.short}</button>`).join('')}
        </div>
      </section>`;
  }

  window.initMania = function initMania() {
    cancelAnimationFrame(frame);
    clearIntermission();
    frame = 0;
    state = initialState();
    syncManiaViewportHeight();
    setArcadeExitVisible(false);
    ManiaMusic.start();
    const wrap = document.getElementById('mania-wrap');
    if (wrap) wrap.innerHTML = menuMarkup();
  };

  window.maniaBack = function maniaBack() {
    cancelAnimationFrame(frame);
    frame = 0;
    clearTimeout(toastTimer);
    clearIntermission();
    ManiaMusic.stop();
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    canvas = null;
    ctx = null;
    stage = null;
    document.body?.classList.remove('mania-compact-landscape');
    document.body?.classList.remove('mania-landscape');
    document.body?.classList.remove('mania-phone-landscape');
    document.documentElement.style.removeProperty('--mania-vh');
    document.documentElement.style.removeProperty('--mania-game-height');
  };

  window.maniaStart = function maniaStart() {
    startBooth(0, 0, [], false);
  };

  window.maniaNextBooth = function maniaNextBooth() {
    if (!state || state.boothIndex >= BOOTHS.length - 1) return;
    startBooth(state.boothIndex + 1, state.totalScore + state.score, state.rounds.concat(roundSummary()), false);
  };

  window.maniaPractice = function maniaPractice(boothIndex) {
    const index = clamp(Number(boothIndex) || 0, 0, BOOTHS.length - 1);
    startBooth(index, 0, [], true);
  };

  window.maniaChooseBooth = function maniaChooseBooth() {
    window.initMania();
  };

  function startBooth(boothIndex, totalScore, rounds, practice = false) {
    cancelAnimationFrame(frame);
    clearIntermission();
    ManiaMusic.start();
    if (resizeObserver) resizeObserver.disconnect();
    const booth = BOOTHS[boothIndex];
    state = initialState(boothIndex, totalScore, rounds, practice);
    state.phase = 'countdown';
    state.countdownAt = performance.now();
    state.startAt = state.countdownAt + 2800;
    setArcadeExitVisible(true);
    syncManiaViewportHeight();

    const wrap = document.getElementById('mania-wrap');
    if (!wrap) return;
    wrap.innerHTML = `
      <section class="mania-game mania-theme-${booth.id}" aria-label="${booth.title} game" style="--mania-accent:${booth.accent}">
        <div class="mania-hud">
          <div class="mania-hud-block">
            <span class="mania-hud-label">${practice ? 'PRACTICE SCORE' : boothIndex ? 'TOTAL SCORE' : 'SCORE'}</span>
            <strong id="mania-score">${totalScore.toLocaleString()}</strong>
          </div>
          <div class="mania-hud-center">
            <span class="mania-booth-count">${practice ? 'PRACTICE' : `${boothIndex + 1}/${BOOTHS.length}`}</span>
            <div class="mania-time-ring" id="mania-time">${roundDuration(booth.id)}</div>
          </div>
        </div>
        <div class="mania-stage" id="mania-stage">
          <canvas id="mania-canvas" aria-label="${booth.intro}"></canvas>
          <div class="mania-booth-curtain" aria-hidden="true" style="--mania-accent:${booth.accent}">
            <span>${practice ? 'PRACTICE' : `BOOTH ${boothIndex + 1}`}</span>
            <b>${booth.title}</b>
            <small>${booth.prompt}</small>
          </div>
          <div class="mania-toast" id="mania-toast" role="status" aria-live="polite"></div>
          <div class="mania-countdown" id="mania-countdown">3</div>
          <div class="mania-progress" aria-hidden="true"><span id="mania-progress-fill"></span></div>
        </div>
      </section>`;

    canvas = document.getElementById('mania-canvas');
    stage = document.getElementById('mania-stage');
    ctx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', handleTap, { passive: false });
    resizeCanvas();
    buildRound();
    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(stage);
    frame = requestAnimationFrame(loop);
  }

  function resizeCanvas() {
    if (!canvas || !stage || !ctx || !state) return;
    const rect = stage.getBoundingClientRect();
    const oldW = state.width;
    state.width = Math.max(1, Math.round(rect.width));
    state.height = Math.max(1, Math.round(rect.height));
    state.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(state.width * state.dpr);
    canvas.height = Math.round(state.height * state.dpr);
    ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
    if (oldW && Math.abs(oldW - state.width) > 4 && state.phase === 'countdown') buildRound();
  }

  function buildRound() {
    if (!state) return;
    state.targets = [];
    state.barns = [];
    state.props = [];
    const id = currentBooth().id;
    if (id === 'farm') buildFarmRound();
    if (id === 'orbit') buildOrbitRound();
    if (id === 'plates') buildDamRound();
    if (id === 'volcano') buildVolcanoRound();
    if (id === 'finale') buildFinaleRound();
    buildHiddenMobes(id);
    state.targets.sort((a, b) => a.at - b.at);
  }

  function roundDuration(boothId = currentBooth()?.id) {
    return boothId === 'finale' ? FINALE_SECONDS : ROUND_SECONDS;
  }

  function buildHiddenMobes(boothId) {
    state.hiddenMobesAssigned = 0;
    state.hiddenCharacterPool = shuffledHiddenCharacters();
    if (boothId === 'finale') {
      state.hiddenMobeTotal = 0;
      return;
    }

    const eligibleKinds = {
      farm: ['farmPop', 'farmSlide', 'farmHill', 'flyer'],
      orbit: ['phaseFlyer'],
      plates: ['beaverRunner'],
      volcano: ['dinosaur'],
    };
    const candidates = state.targets.filter(target =>
      eligibleKinds[boothId]?.includes(target.kind) &&
      !target.golden &&
      !target.repeatable
    );
    if (!candidates.length) return;

    // One discovery in each half keeps both cameos surprising without allowing
    // random selection to clump them into a single unreadable moment.
    const midpoint = roundDuration(boothId) / 2;
    const early = candidates.filter(target => target.at < midpoint);
    const late = candidates.filter(target => target.at >= midpoint);
    const pools = boothId === 'volcano' ? [early] : [early, late.length ? late : early];
    pools.forEach(pool => {
      const available = pool.filter(target => !target.hiddenMobe);
      if (!available.length) return;
      makeHiddenMobeReplacement(available[Math.floor(Math.random() * available.length)], boothId);
    });
  }

  function makeHiddenMobeReplacement(target, boothId = currentBooth()?.id) {
    if (!target || target.hiddenMobe || state.hiddenMobesAssigned >= state.hiddenMobeTotal) return;
    const index = state.hiddenMobesAssigned;
    target.hiddenMobe = true;
    target.originalType = target.type;
    target.type = 'hiddenMoberino';
    target.character = hiddenCharacterFor(boothId, index);
    target.variant = index;
    target.base = 1000;
    state.hiddenMobesAssigned += 1;
  }

  function hiddenCharacterFor(boothId, index) {
    if (typeof GAME_CHARS === 'undefined' || !GAME_CHARS.length) return null;
    return state.hiddenCharacterPool[index % state.hiddenCharacterPool.length] || GAME_CHARS[0];
  }

  function shuffledHiddenCharacters() {
    if (typeof GAME_CHARS === 'undefined' || !GAME_CHARS.length) return [];
    const pool = [...GAME_CHARS];
    for (let index = pool.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [pool[index], pool[swapIndex]] = [pool[swapIndex], pool[index]];
    }
    return pool;
  }

  function buildFarmRound() {
    // Farm animals stay available until cleared. A cleared station replaces
    // itself in a rotated location, so deliberate players never lose a target
    // to a timer and quick players never drain the whole field.
    for (let slot = 0; slot < 6; slot += 1) spawnFarmAnimal(slot, 0);

    // The single barn stays in the back for the entire booth. Its door target
    // returns after each hit; three hits replace it with a brief gold prize.
    const barn = {
      anchorX: .72,
      groundY: .51,
      found: false,
    };
    state.barns = [barn];
    state.targets.push({
        kind: 'farmBarnDoor',
        type: 'chicken',
        barn,
        at: 0,
        duration: ROUND_SECONDS,
        base: 400,
        repeatable: true,
        hit: false,
        drawLayer: 2,
      });
  }

  function spawnFarmAnimal(slot, at) {
    const cycle = state.farmAnimalCycle++;
    const animals = ['pig', 'cow', 'sheep', 'duck', 'chicken'];
    const kind = ['farmPop', 'farmPop', 'farmSlide', 'farmSlide', 'farmHill', 'flyer'][slot];
    const target = {
      kind,
      type: kind === 'flyer' ? (cycle % 2 ? 'bluebird' : 'bird') : animals[(cycle + slot) % animals.length],
      at,
      duration: Math.max(.5, ROUND_SECONDS - at),
      farmSlot: slot,
      clearReplace: true,
      hit: false,
    };
    if (kind === 'farmPop') {
      const anchors = [.18, .38, .61, .82];
      target.anchorX = anchors[(cycle + slot) % anchors.length];
      target.lane = .75 + ((cycle + slot) % 2) * .025;
      target.base = ['duck', 'chicken'].includes(target.type) ? 150 : 100;
      target.drawLayer = 4;
    } else if (kind === 'farmSlide') {
      const anchors = [.14, .37, .61, .87];
      target.anchorX = anchors[(cycle + slot) % anchors.length];
      target.slideFrom = (cycle + slot) % 2 ? .055 : -.055;
      target.lane = .5 + ((cycle + slot) % 2) * .025;
      target.base = ['duck', 'chicken'].includes(target.type) ? 350 : 300;
      target.drawLayer = 3;
    } else if (kind === 'farmHill') {
      const anchors = [.17, .43, .87];
      target.anchorX = anchors[cycle % anchors.length];
      target.lane = .31 + (cycle % 2) * .035;
      target.base = cycle % 7 === 6 ? 1000 : 650;
      target.golden = cycle % 7 === 6;
      target.drawLayer = 1;
    } else {
      target.direction = cycle % 2 ? 'left' : 'right';
      target.anchorX = [.18, .36, .64, .82][cycle % 4];
      target.lane = .15 + (cycle % 3) * .045;
      target.base = target.type === 'bluebird' ? 650 : 500;
      target.drawLayer = 0;
    }
    state.targets.push(target);
  }

  function buildOrbitRound() {
    // Six large targets remain together as one readable formation. Four
    // landed rings freezes one target; all six must be frozen simultaneously.
    const formation = [
      [.24, .51], [.5, .49], [.76, .51],
      [.18, .75], [.5, .73], [.82, .75],
    ];
    for (let i = 0; i < formation.length; i += 1) {
      state.targets.push({
        kind: 'ringPost',
        type: 'moonMobe',
        at: 0,
        duration: ROUND_SECONDS,
        formation: true,
        formationIndex: i,
        anchorX: formation[i][0],
        anchorY: formation[i][1],
        requiredRings: 4,
        rings: 0,
        ringWindow: 2.35,
        freezeWindow: ORBIT_FREEZE_SECONDS,
        base: 225,
        hit: false,
      });
    }

    // Small, valuable corner aliens create a controlled peripheral choice.
    // Each pair enters, holds in the safe upper sky, warns, then launches away;
    // they never travel across the formation or the robot's mouth.
    const cornerLaunches = [1, 5.8, 10.6, 15.4];
    cornerLaunches.forEach((at, wave) => {
      addOrbitCornerPair(at, wave);
    });
  }

  function addOrbitCornerPair(at, wave, bossSide = false) {
    ['left', 'right'].forEach((corner, sideIndex) => {
      state.targets.push({
        kind: 'phaseFlyer',
        type: (wave + sideIndex) % 3 === 0 ? 'cometMobe' : 'ghostMobe',
        at: at + sideIndex * .12,
        duration: Math.min(4.15, Math.max(.6, ROUND_SECONDS - at)),
        corner,
        cornerTease: true,
        bossSide,
        wave,
        base: 2500,
        golden: true,
        drawLayer: 5,
        hit: false,
      });
    });
  }

  function buildDamRound() {
    // Only the two distant spillway experts keep the cover-and-pop timing.
    // They are the booth's precision layer, not its dominant interaction.
    [[.38, .29], [.64, .29]].forEach((station, i) => {
      state.targets.push({
        kind: 'damBeaver',
        type: 'expert',
        at: 0,
        duration: ROUND_SECONDS,
        anchorX: station[0],
        anchorY: station[1],
        base: 2000,
        openWindow: 1.05,
        popPeriod: 4.8,
        doorTransition: .2,
        warningWindow: .58,
        cycleOffset: i * 1.9,
        targetScale: .68,
        tier: 2,
        spent: false,
        hit: false,
      });
    });

    spawnDamBank(0, 0);

    // Foreground runners provide constant motion and a second attention lane.
    const runnerPasses = [
      [.65, 'right'], [4.2, 'left'], [7.75, 'right'],
      [11.3, 'left'], [14.85, 'right'], [18.4, 'left'],
    ];
    runnerPasses.forEach((pass, i) => {
      state.targets.push({
        kind: 'beaverRunner',
        type: i % 4 === 3 ? 'foreman' : 'standard',
        at: pass[0],
        duration: 6.2,
        direction: pass[1],
        lane: .79 + (i % 2) * .055,
        base: i % 4 === 3 ? 1200 : 600,
        targetScale: i % 4 === 3 ? .88 : 1,
        hit: false,
      });
    });
  }

  function spawnDamBank(wave, at) {
    const positions = [
      [.14, .505], [.32, .505], [.5, .505], [.68, .505], [.86, .505],
    ];
    // Set one clean horizontal rack from left to right so every target shares
    // the same visual and aiming line.
    const setDelays = [0, .08, .16, .24, .32];
    positions.forEach((position, index) => {
      state.targets.push({
        kind: 'damBank',
        type: (wave + index) % 3 === 0 ? 'foreman' : 'standard',
        at: at + setDelays[index],
        duration: Math.max(.5, ROUND_SECONDS - at - setDelays[index]),
        anchorX: position[0],
        anchorY: position[1],
        bankWave: wave,
        base: 700 + wave * 200,
        targetScale: position[1] > .54 ? .78 : .7,
        hit: false,
      });
    });
  }

  function spawnGoldenBeavers(at) {
    state.damGoldActive = true;
    const positions = [
      [.14, .505], [.32, .505], [.5, .505], [.68, .505], [.86, .505],
    ];
    const setDelays = [0, .08, .16, .24, .32];
    positions.forEach((position, index) => {
      state.targets.push({
        kind: 'goldBeaver',
        type: index % 2 ? 'foreman' : 'expert',
        at: at + setDelays[index],
        duration: Math.max(.5, ROUND_SECONDS - at - setDelays[index]),
        anchorX: position[0],
        anchorY: position[1],
        base: 1000,
        targetScale: position[1] > .5 ? .82 : .68,
        golden: true,
        hit: false,
      });
    });
  }

  function buildVolcanoRound() {
    state.volcanoStage = 0;
    state.volcanoStageReadyAt = 0;
    const passes = [
      [.35, 'right', .79, 2], [2.8, 'left', .59, 2],
      [5.2, 'right', .79, 3], [7.6, 'left', .59, 2],
      [10, 'right', .79, 3], [12.4, 'left', .59, 3],
      [14.7, 'right', .79, 3], [16.8, 'left', .59, 3],
      [18.4, 'right', .79, 3],
    ];
    passes.forEach((pass, index) => spawnVolcanoDinosaur(
      index,
      pass[0],
      pass[1],
      pass[2],
      pass[3]
    ));
    [0, 6, 12].forEach((at, stageIndex) => spawnVolcanoStage(stageIndex, at + .18));
  }

  function spawnVolcanoDinosaur(index, at, direction, lane, balloonCount) {
    const dinosaur = {
      kind: 'dinosaur',
      type: index % 3 === 1 ? 'triceratops' : 'trex',
      at,
      duration: lane < .7 ? 9.2 : 8.4,
      direction,
      lane,
      dinoIndex: index,
      base: 400,
      targetScale: lane < .7 ? .72 : .94,
      hit: false,
    };
    state.targets.push(dinosaur);
    for (let balloonIndex = 0; balloonIndex < balloonCount; balloonIndex += 1) {
      state.targets.push({
        kind: 'dinoBalloon',
        type: 'treeBalloon',
        at,
        duration: dinosaur.duration,
        parent: dinosaur,
        balloonIndex,
        balloonCount,
        hue: (index + balloonIndex) % 3,
        base: 300,
        hit: false,
      });
    }
  }

  function spawnVolcanoStage(stageIndex, at) {
    [.27, .5, .73].forEach((anchorX, index) => {
      state.targets.push({
        kind: 'volcanoComet',
        type: 'cometTarget',
        at,
        duration: Math.max(.5, ROUND_SECONDS - at),
        anchorX,
        anchorY: .23 + (index % 2) * .035,
        stageIndex,
        stageTarget: true,
        stageClearAwarded: false,
        base: 750 + stageIndex * 250,
        hit: false,
      });
    });
  }

  function buildFinaleRound() {
    // Phase 1 starts with two compact banks. Each cleared bank immediately
    // earns its own replacement, so pacing is controlled by player action.
    spawnFinaleStaticWave(0, 0);
    spawnFinaleStaticWave(1, 0);
    state.finaleWave = 2;

    // Phase 2: a deliberately paced left-to-right pass. Targets are smaller,
    // staggered across lanes, and still unfold for players who track a bank.
    for (let i = 0; i < 9; i += 1) {
      spawnFinalePrecisionTarget(
        i,
        FINALE_PHASE_SECONDS,
        140 + i * ((FINALE_WORLD_LENGTH - 280) / 8),
        .22 + (i % 3) * .18
      );
    }
    state.finalePrecisionWave = 9;

    // Phase 3 is shorter and requires an eight-target precision bank before
    // the escalating rapid-fire target appears.
    const finalLocks = [
      [.16,.29,750], [.37,.24,1500], [.63,.24,1500], [.84,.29,750],
      [.22,.57,2500], [.42,.5,4000], [.58,.5,4000], [.78,.57,2500],
    ];
    finalLocks.forEach((lock, i) => {
      state.targets.push({
        kind: 'finaleGate',
        type: lock[2] >= 4000 ? 'jewelTarget' : lock[2] >= 2000 ? 'starTarget' : 'neonTarget',
        at: FINALE_PHASE_SECONDS * 2 + .25,
        duration: FINALE_RAPID_SECONDS - .25,
        anchorX: lock[0],
        anchorY: lock[1],
        finalePhase: 2,
        base: lock[2],
        precision: lock[2] >= 4000 ? .66 : lock[2] >= 2000 ? .78 : .9,
        golden: lock[2] >= 4000,
        finalLock: true,
        lockIndex: i,
        hit: false,
      });
    });
    [
      [.55, 'right', .12, 3000],
      [3.25, 'left', .17, 4000],
      [6.05, 'right', .1, 5000],
    ].forEach((bat, index) => {
      state.targets.push({
        kind: 'finaleBat',
        type: 'bonusBat',
        at: FINALE_PHASE_SECONDS * 2 + bat[0],
        duration: 3.35,
        direction: bat[1],
        lane: bat[2],
        finalePhase: 2,
        batIndex: index,
        base: bat[3],
        golden: true,
        hit: false,
      });
    });
  }

  function spawnFinaleStaticWave(wave, at) {
    // Banks occupy distinct stage regions so phase one uses the full booth
    // instead of stacking every grouping across the upper third. The initial
    // pair reads top-left / bottom-right; replacements alternate through the
    // other two quadrants while each bank keeps its internal formation.
    const bankPositions = [
      [.3, .36],
      [.7, .72],
      [.28, .7],
      [.72, .38],
    ];
    const [anchorX, lane] = bankPositions[wave % bankPositions.length];
    state.targets.push({
      kind: 'revealPanel',
      type: 'jewelTarget',
      at,
      duration: Math.max(.1, FINALE_PHASE_SECONDS - at),
      anchorX,
      lane,
      finalePhase: 0,
      wave,
      waveBornAt: at,
      tier: 0,
      branch: wave * 100,
      base: 500 + wave * 100,
      targetScale: .72,
      unfoldHub: true,
      hit: false,
    });
  }

  function spawnFinalePrecisionTarget(index, at, worldX, lane) {
    state.targets.push({
      kind: 'revealPanel',
      type: 'neonTarget',
      at,
      duration: Math.max(.5, FINALE_PHASE_SECONDS * 2 - at),
      worldX,
      lane,
      finalePhase: 1,
      tier: 0,
      branch: 10 + index,
      base: 300,
      precisionMoving: true,
      armorStage: 0,
      hit: false,
    });
  }

  function unfoldFinaleBank(target) {
    const phoneLayout = state.width <= 520;
    const clusterWidth = phoneLayout ? .135 : .12;
    const clusterHeight = phoneLayout ? .115 : .1;
    const unfoldedTargets = [
      [target.anchorX - clusterWidth, target.lane - clusterHeight * .2, 750],
      [target.anchorX - clusterWidth * .72, target.lane - clusterHeight, 1250],
      [target.anchorX, target.lane - clusterHeight * 1.18, 1750],
      [target.anchorX + clusterWidth * .72, target.lane - clusterHeight, 1250],
      [target.anchorX + clusterWidth, target.lane - clusterHeight * .2, 750],
    ];
    unfoldedTargets.forEach((option, i) => {
      const targetValue = option[2] + target.wave * 100;
      state.targets.push({
        kind: 'revealPanel',
        type: targetValue >= 1700 ? 'jewelTarget' : targetValue >= 1000 ? 'starTarget' : 'neonTarget',
        at: state.elapsed + .06,
        duration: Math.max(.5, FINALE_PHASE_SECONDS - state.elapsed),
        anchorX: option[0],
        lane: option[1],
        finalePhase: 0,
        wave: target.wave,
        waveBornAt: target.waveBornAt,
        tier: targetValue >= 1700 ? 2 : 1,
        branch: target.wave * 100 + i + 1,
        openingAt: state.elapsed,
        parentAnchorX: target.anchorX,
        parentLane: target.lane,
        openingSide: Math.sign(option[0] - target.anchorX),
        base: targetValue,
        targetScale: phoneLayout ? .58 : .62,
        unfoldLeaf: true,
        hit: false,
      });
    });
    showToast(
      'TARGET BANK UNFOLDS · KEEP SCANNING!',
      true,
      1050
    );
    burst(state.width * .5, state.height * .43, '#b991ff', 24, 1.12);
  }

  function loop(now) {
    if (!state || !ctx || !canvas) return;
    if (document.body?.classList.contains('mania-phone-landscape')) {
      if (state.phase === 'countdown') {
        state.countdownAt = now;
        state.startAt = now + 2800;
      } else if (state.phase === 'playing') {
        state.startAt = now - state.elapsed * 1000;
      }
      frame = requestAnimationFrame(loop);
      return;
    }
    if (state.phase === 'countdown') updateCountdown(now);
    if (state.phase === 'playing') {
      state.elapsed = Math.max(0, (now - state.startAt) / 1000);
      const duration = roundDuration();
      if (state.elapsed >= duration) {
        state.elapsed = duration;
        draw(now);
        finishRound();
        return;
      }
      processTimedMechanics();
      processRingFlights();
      processLogFlights();
      updateHud();
    }
    draw(now);
    frame = requestAnimationFrame(loop);
  }

  function updateCountdown(now) {
    const count = document.getElementById('mania-countdown');
    const passed = (now - state.countdownAt) / 1000;
    const numeral = passed < .8 ? '3' : passed < 1.6 ? '2' : passed < 2.4 ? '1' : 'GO!';
    if (count) count.textContent = numeral;
    if (now >= state.startAt) {
      state.phase = 'playing';
      state.elapsed = 0;
      count?.remove();
      showToast(currentBooth().prompt, false, 1400);
      try { SFX.raceStart(); } catch (e) {}
    }
  }

  function updateHud() {
    const duration = roundDuration();
    const remaining = Math.max(0, Math.ceil(duration - state.elapsed));
    if (currentBooth().id === 'finale') cameraX();
    const score = document.getElementById('mania-score');
    const time = document.getElementById('mania-time');
    const special = document.getElementById('mania-special');
    const fill = document.getElementById('mania-progress-fill');
    if (score) score.textContent = (state.totalScore + state.score).toLocaleString();
    if (time) {
      time.textContent = remaining;
      time.classList.toggle('danger', remaining <= 7);
    }
    if (special) special.textContent = specialHud();
    if (fill) fill.style.width = `${(state.elapsed / duration) * 100}%`;
  }

  function cameraX() {
    if (state.phase !== 'playing') return 0;
    const progress = state.elapsed / roundDuration();
    if (currentBooth().id === 'farm') {
      state.direction = 0;
      return 0;
    }
    if (currentBooth().id === 'plates') {
      state.direction = 0;
      return 0;
    }
    if (currentBooth().id === 'volcano') {
      state.direction = 1;
      return 0;
    }
    if (currentBooth().id === 'finale') {
      if (state.elapsed < FINALE_PHASE_SECONDS) {
        state.direction = 0;
        return 0;
      }
      if (state.elapsed < FINALE_PHASE_SECONDS * 2) {
        state.direction = 1;
        const within = (state.elapsed - FINALE_PHASE_SECONDS) / FINALE_PHASE_SECONDS;
        return easeInOut(within) * FINALE_WORLD_LENGTH;
      }
      state.direction = 0;
      return FINALE_WORLD_LENGTH * .5;
    }
    state.direction = 1;
    return progress * WORLD_LENGTH;
  }

  function currentBooth() { return BOOTHS[state?.boothIndex || 0]; }

  function specialHud() {
    const booth = currentBooth();
    if (booth.id === 'finale') return ['EXPAND', 'SCROLL', 'POP-UPS'][Math.min(2, Math.floor((state?.elapsed || 0) / FINALE_PHASE_SECONDS))];
    const value = state?.special || 0;
    if (booth.id === 'plates') {
      return state.damGoldActive ? '★ GOLD BEAVERS ★' : `GOLD AFTER ${Math.max(0, 3 - value)} ROW${3 - value === 1 ? '' : 'S'}`;
    }
    return Array.from({ length: booth.goal }, (_, i) => i < value ? '★' : '☆').join(' ');
  }

  function roundSummary() {
    const accuracy = state.taps ? Math.round((state.hits / state.taps) * 100) : 0;
    return {
      id: currentBooth().id,
      title: currentBooth().title,
      score: state.score,
      hits: state.hits,
      accuracy,
      hiddenMobes: state.hiddenMobesFound,
      hiddenMobeTotal: state.hiddenMobeTotal,
      accent: currentBooth().accent,
    };
  }

  function handleTap(event) {
    if (!state || state.phase !== 'playing' || !canvas) return;
    event.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (state.width / rect.width);
    const y = (event.clientY - rect.top) * (state.height / rect.height);
    state.taps += 1;

    if (currentBooth().id === 'orbit') {
      launchRing(x, y);
      return;
    }
    if (currentBooth().id === 'plates') {
      launchLog(x, y);
      return;
    }

    state.shots.push({
      x,
      y,
      born: performance.now(),
      kind: currentBooth().id,
    });

    let best = null;
    let hiddenBest = null;
    let bestDistance = Infinity;
    let hiddenBeaver = null;
    for (const target of state.targets) {
      const pos = targetPosition(target, state.elapsed);
      if (!pos || (target.hit && !target.repeatable)) continue;
      const distance = Math.hypot(x - pos.x, y - pos.y);
      if (target.kind === 'damBeaver' && pos.hittable === false && distance <= pos.r * 1.14) {
        hiddenBeaver = { target, pos };
        continue;
      }
      if (pos.hittable === false) continue;
      if (distance <= pos.r * 1.12 && distance < bestDistance) {
        if (target.hiddenMobe) {
          hiddenBest = { target, pos };
        } else if (!hiddenBest) {
          best = { target, pos };
          bestDistance = distance;
        }
      }
    }

    if (hiddenBest) best = hiddenBest;
    if (!best) {
      const hiding = !!hiddenBeaver;
      addLabel(x, y, hiding ? 'HIDING!' : 'MISS', hiding ? '#b8f3ef' : '#fff4d5', hiding ? 18 : 15);
      burst(x, y, hiding ? '#65d6d1' : '#e7d8b1', hiding ? 8 : 5, .75);
      return;
    }

    hitTarget(best.target, best.pos);
  }

  function launchRing(x, y) {
    const distance = Math.hypot(x - state.width * .5, y - state.height);
    const flightDuration = clamp(.34 + distance / Math.max(1, state.height) * .09, .36, .46);
    const flight = {
      x,
      y,
      born: performance.now(),
      launchedAt: state.elapsed,
      landsAt: state.elapsed + flightDuration,
      flightDuration,
      arcHeight: clamp(state.height * (.19 + distance / Math.max(1, state.height) * .08), 70, 150),
      resolved: false,
    };
    state.ringFlights.push(flight);
    state.shots.push({ ...flight, kind: 'orbit' });
    try { SFX.menuSelect(); } catch (e) {}
  }

  function launchLog(aimX, aimY) {
    const depth = clamp((state.height - aimY) / Math.max(1, state.height), 0, 1);
    const foregroundThrow = aimY >= state.height * .68;
    const flightDuration = foregroundThrow ? .14 : .464;
    const curveOffset = foregroundThrow
      ? 0
      : clamp(
        8 + Math.pow(depth, 1.7) * Math.min(84, state.width * .13),
        8,
        92
      );
    const flight = {
      aimX,
      x: aimX,
      y: aimY,
      born: performance.now(),
      launchedAt: state.elapsed,
      landsAt: state.elapsed + flightDuration,
      flightDuration,
      arcHeight: clamp(state.height * .2, 72, 148),
      curveOffset,
      resolved: false,
      kind: 'plates',
    };
    state.logFlights.push(flight);
    state.shots.push(flight);
    try { SFX.menuSelect(); } catch (e) {}
  }

  function processLogFlights() {
    if (currentBooth().id !== 'plates' || !state.logFlights.length) return;
    for (const flight of state.logFlights) {
      if (flight.resolved || state.elapsed < flight.landsAt) continue;
      flight.resolved = true;
      let best = null;
      let bestDistance = Infinity;
      for (const target of state.targets) {
        const pos = targetPosition(target, state.elapsed);
        if (!pos || (target.hit && !target.repeatable) || pos.hittable === false) continue;
        const distance = Math.hypot(flight.x - pos.x, flight.y - pos.y);
        if (distance <= pos.r * 1.12 && distance < bestDistance) {
          best = { target, pos };
          bestDistance = distance;
        }
      }
      if (best) {
        flight.landed = true;
        hitTarget(best.target, best.pos);
      } else {
        addLabel(flight.x, flight.y - 8, 'SPLASH!', '#fff4d5', 17);
        burst(flight.x, flight.y, '#d6a565', 8, .82);
      }
    }
    state.logFlights = state.logFlights.filter(flight => state.elapsed - flight.landsAt < .24);
  }

  function processRingFlights() {
    if (currentBooth().id !== 'orbit' || !state.ringFlights.length) return;
    for (const flight of state.ringFlights) {
      if (flight.resolved || state.elapsed < flight.landsAt) continue;
      flight.resolved = true;

      let best = null;
      let bestDistance = Infinity;
      for (const target of state.targets) {
        const pos = targetPosition(target, state.elapsed);
        if (!pos || (target.hit && !target.repeatable)) continue;
        if (pos.hittable === false) continue;
        const distance = Math.hypot(flight.x - pos.x, flight.y - pos.y);
        if (distance <= pos.r * 1.18 && distance < bestDistance) {
          best = { target, pos };
          bestDistance = distance;
        }
      }

      if (best) {
        flight.landed = true;
        flight.landingX = best.pos.x;
        flight.landingY = best.pos.y;
        hitTarget(best.target, best.pos);
      } else {
        addLabel(flight.x, flight.y - 8, 'BOUNCE!', '#fff4d5', 17);
        burst(flight.x, flight.y, '#6de8ff', 7, .78);
      }
    }
    state.ringFlights = state.ringFlights.filter(flight => state.elapsed - flight.landsAt < .55);
  }

  function hitTarget(target, pos) {
    if (target.kind === 'damBeaver') {
      hitDamBeaver(target, pos);
      return;
    }
    if (target.kind === 'damBank' || target.kind === 'goldBeaver') {
      hitDamBankTarget(target, pos);
      return;
    }
    if (target.kind === 'farmBarnDoor') {
      hitFarmBarnDoor(target, pos);
      return;
    }
    if (target.kind === 'farmBarnBonus') {
      hitFarmBarnBonus(target, pos);
      return;
    }
    if (target.kind === 'revealPanel' && target.precisionMoving) {
      hitFinalePrecisionTarget(target, pos);
      return;
    }
    if (target.kind === 'rapidTarget') {
      hitRapidTarget(target, pos);
      return;
    }
    if (target.kind === 'ringPost') {
      hitRingPost(target, pos);
      return;
    }
    if (target.kind === 'orbitBoss') {
      hitOrbitBoss(target, pos);
      return;
    }
    if (target.kind === 'plateRack') {
      hitPlateRack(target, pos);
      return;
    }
    if (target.kind === 'dinosaur') {
      hitDinosaur(target, pos);
      return;
    }
    if (target.kind === 'volcanoDecoy') {
      hitVolcanoDecoy(target, pos);
      return;
    }
    const nowSeconds = state.elapsed;
    target.hit = true;
    target.hitAt = nowSeconds;
    if (target.clearReplace && currentBooth().id === 'farm' && nowSeconds < ROUND_SECONDS - .25) {
      spawnFarmAnimal(target.farmSlot, nowSeconds + .12);
    }
    if (target.repeatable) {
      target.hits = (target.hits || 0) + 1;
      target.hit = false;
      target.base = Math.min(2000, 200 + target.hits * 100);
    }
    const specialHit = target.secret || target.golden || target.beacon || target.gold || target.vent || target.hiddenMobe || target.kind === 'jackpot' || target.kind === 'finalePopup';
    const sizeBonus = target.kind === 'revealPanel' ? Math.max(1, Math.round((pos.growth || 1) * 2)) : 1;
    awardTargetHit(target, pos, target.base, specialHit, sizeBonus);

    if (target.hiddenMobe) {
      state.hiddenMobesFound += 1;
      addLabel(pos.x, pos.y - pos.r * 1.35, 'FOUND!', '#fff7d9', 44);
      burst(pos.x, pos.y, '#ffcf4a', 28, 1.35);
      const foundName = target.character?.name ? ` · ${target.character.name}` : '';
      showToast(`DIAMOND FIND!${foundName} ${state.hiddenMobesFound}/${state.hiddenMobeTotal}`, true, 1700);
    }
    if (target.gold && currentBooth().id === 'plates') collectBoothSpecial('GOLD PLATE', triggerPlatterBlimp);
    if (currentBooth().id === 'volcano' && (target.stageTarget || target.kind === 'volcanoComet')) {
      volcanoSpray(pos.x, pos.y, target.vent || target.golden);
    }
    if (currentBooth().id === 'volcano' && Number.isInteger(target.cluster)) {
      volcanoSpray(pos.x, pos.y, target.vent || target.golden);
      triggerBalloonChain(target.cluster, target);
    }
    if (target.kind === 'revealPanel') openFinalePanel(target);
    if (target.kind === 'finalePopup' && target.base >= 4000) showToast(`PRECISION ${target.base}!`, true, 560);
    if (target.kind === 'jackpot') showToast(`JACKPOT x${target.hits}!`, true, 420);
    updateHud();
  }

  function hitDamBeaver(target, pos) {
    target.spent = true;
    target.spentUntil = state.elapsed + 1.05 + target.tier * .18;
    target.hitAt = state.elapsed;
    state.special += 1;
    const specialHit = target.tier >= 1;
    awardTargetHit(target, pos, target.base, specialHit);
    const labels = ['LOG BANK', 'LODGE', 'SPILLWAY'];
    addLabel(pos.x, pos.y - pos.r * 1.15, `${labels[target.tier]} HIT!`, specialHit ? '#ffcf4a' : '#fff7d9', 20);
    if (target.tier === 2) {
      showToast(`SPILLWAY SNAP! +${target.base}`, true, 760);
      try { SFX.score(); } catch (e) {}
    }
    updateHud();
  }

  function hitDamBankTarget(target, pos) {
    target.hit = true;
    target.hitAt = state.elapsed;
    awardTargetHit(target, pos, target.base, target.golden);
    if (target.kind === 'goldBeaver') {
      burst(pos.x, pos.y, '#ffcf4a', 22, 1.18);
      checkGoldenBeaverClear();
    } else {
      checkDamBankClear(target.bankWave);
    }
    updateHud();
  }

  function hitFinalePrecisionTarget(target, pos) {
    if (target.armorStage === 0) {
      target.armorStage = 1;
      target.exposedAt = state.elapsed;
      target.tier = 2;
      awardTargetHit(target, pos, 300, false);
      addLabel(pos.x, pos.y - pos.r * 1.2, 'CENTER EXPOSED!', '#6de8ff', 18);
      burst(pos.x, pos.y, '#6de8ff', 16, 1.05);
      return;
    }
    target.hit = true;
    target.hitAt = state.elapsed;
    awardTargetHit(target, pos, 1200, true);
    addLabel(pos.x, pos.y - pos.r * 1.25, 'PRECISION CLEAR!', '#ffcf4a', 20);
    updateHud();
  }

  function checkDamBankClear(wave) {
    const bank = state.targets.filter(target => target.kind === 'damBank' && target.bankWave === wave);
    if (bank.length !== 5 || bank.some(target => !target.hit) || state.damBankRespawnAt) return;
    const clearBonus = 1500 + wave * 500;
    state.score += clearBonus;
    state.special = Math.min(3, wave + 1);
    state.damProgressPulseAt = state.elapsed;
    addLabel(state.width * .5, state.height * .48, `BANK ${wave + 1} CLEAR +${clearBonus}`, '#fff1a3', 30);
    burst(state.width * .5, state.height * .5, '#ff8c68', 28, 1.2);
    if (wave < 2) {
      state.damBankRespawnAt = state.elapsed + .12;
      const rowsToGold = 2 - wave;
      showToast(`ROW ${wave + 1}/3 CLEAR · ${rowsToGold} TO GOLD BEAVERS!`, true, 1050);
    } else {
      state.damBankRespawnAt = state.elapsed + .15;
      showToast('THREE BANKS CLEAR · GOLD BEAVERS INBOUND!', true, 1200);
    }
    try { SFX.mysteryGood(); } catch (e) {}
  }

  function checkGoldenBeaverClear() {
    if (state.damGoldCleared) return;
    const gold = state.targets.filter(target => target.kind === 'goldBeaver');
    if (gold.length !== 5 || gold.some(target => !target.hit)) return;
    state.damGoldCleared = true;
    state.score += 3000;
    addLabel(state.width * .5, state.height * .46, 'GOLD BONANZA +3000', '#ffcf4a', 38);
    burst(state.width * .5, state.height * .48, '#ffcf4a', 46, 1.45);
    showToast('★ GOLD BONANZA CLEARED! ★', true, 1700);
    try { SFX.mysteryGood(); } catch (e) {}
  }

  function hitFarmBarnDoor(target, pos) {
    awardTargetHit(target, pos, target.base, true);
    state.barnHits = Math.min(3, state.barnHits + 1);
    state.special = state.barnHits;
    state.barnDoorCooldown = state.elapsed + .75;
    target.hit = false;
    target.hitAt = state.elapsed;
    burst(pos.x, pos.y, '#ffcf4a', 18, 1.1);

    if (state.barnHits >= 3) {
      state.barnBonusActive = true;
      state.barnDoorCooldown = ROUND_SECONDS + 1;
      const bonus = {
        kind: 'farmBarnBonus',
        type: 'fox',
        barn: target.barn,
        at: state.elapsed + .2,
        duration: 3.4,
        base: 1800 + state.barnTier * 400,
        golden: true,
        drawLayer: 2,
        hit: false,
      };
      state.barnBonusTarget = bonus;
      state.targets.push(bonus);
      showToast(`BARN OPEN! GOLD PRIZE ${bonus.base}!`, true, 1200);
      try { SFX.mysteryGood(); } catch (e) {}
    } else {
      showToast(`BARN HIT ${state.barnHits}/3 · HIT IT AGAIN!`, true, 760);
    }
    updateHud();
  }

  function hitFarmBarnBonus(target, pos) {
    target.hit = true;
    target.hitAt = state.elapsed;
    awardTargetHit(target, pos, target.base, true);
    addLabel(pos.x, pos.y - pos.r * 1.25, 'BARN PRIZE!', '#fff1a3', 28);
    state.barnTier += 1;
    resetFarmBarn(.8);
    showToast(`GOLD BARN CLEARED · NEXT PRIZE ${1800 + state.barnTier * 400}!`, true, 1200);
    updateHud();
  }

  function resetFarmBarn(delay = .4) {
    state.barnHits = 0;
    state.special = 0;
    state.barnBonusActive = false;
    state.barnBonusTarget = null;
    state.barnDoorCooldown = state.elapsed + delay;
  }

  function rapidTapValue(hitCount) {
    if (hitCount >= 31) return 2000;
    if (hitCount >= 21) return 1000;
    if (hitCount >= 13) return 500;
    if (hitCount >= 6) return 250;
    return 100;
  }

  function hitRapidTarget(target, pos) {
    target.hits = (target.hits || 0) + 1;
    state.rapidTapCount = target.hits;
    target.base = rapidTapValue(target.hits);
    target.pulseAt = state.elapsed;
    state.hits += 1;
    state.score += target.base;
    addLabel(pos.x, pos.y - pos.r, `+${target.base} · TAP ${target.hits}`, '#ffcf4a', 24);
    burst(pos.x, pos.y, target.hits >= 21 ? '#ffcf4a' : '#b991ff', 12 + Math.min(18, target.hits), 1.05);
    if ([1, 6, 13, 21, 31].includes(target.hits)) {
      showToast(`RAPID FIRE · EACH TAP NOW ${target.base}!`, true, 900);
      try { SFX.score(); } catch (e) {}
    } else {
      try { SFX.hit(); } catch (e) {}
    }
    updateHud();
  }

  function hitVolcanoDecoy(target, pos) {
    const gained = awardTargetHit(target, pos, target.base, false);
    volcanoSpray(pos.x, pos.y, false);
    target.cooldownUntil = state.elapsed + .7 + Math.random() * .65;
    target.respawnAt = target.cooldownUntil;
    target.hue = (target.hue + 1 + Math.floor(Math.random() * 2)) % 3;
    addLabel(pos.x, pos.y - pos.r, `BAIT +${gained}`, '#fff7d9', 16);
    updateHud();
  }

  function hitDinosaur(target, pos) {
    const attached = state.targets.filter(balloon =>
      balloon.kind === 'dinoBalloon' && balloon.parent === target && !balloon.hit
    );
    const carefulClear = attached.length === 0;
    target.hit = true;
    target.hitAt = state.elapsed;
    awardTargetHit(target, pos, carefulClear ? 700 : target.base, carefulClear || target.hiddenMobe);
    if (attached.length) {
      let cascadeScore = 0;
      attached.forEach((balloon, index) => {
        const balloonPos = targetPosition(balloon, state.elapsed);
        balloon.hit = true;
        balloon.hitAt = state.elapsed + index * .025;
        cascadeScore += 50;
        if (balloonPos) {
          burst(balloonPos.x, balloonPos.y, targetColor(balloon), 9, .88);
          addLabel(balloonPos.x, balloonPos.y - 18, '+50', '#fff7d9', 16);
        }
      });
      state.score += cascadeScore;
      showToast(`QUICK POP · ${attached.length} BALLOONS +${cascadeScore}`, false, 760);
    } else {
      showToast('CLEAN SWEEP · DINO +700', true, 850);
    }
    if (target.hiddenMobe) {
      state.hiddenMobesFound += 1;
      addLabel(pos.x, pos.y - pos.r * 1.3, 'FOUND!', '#fff7d9', 38);
      burst(pos.x, pos.y, '#ffcf4a', 26, 1.3);
    }
    updateHud();
  }

  function awardTargetHit(target, pos, base, specialHit, sizeBonus = 1) {
    state.hits += 1;
    const gained = base * sizeBonus;
    state.score += gained;
    addLabel(pos.x, pos.y - pos.r, `+${gained}`, specialHit ? currentBooth().accent : '#fff7d9', specialHit ? 25 : 20);
    burst(pos.x, pos.y, specialHit ? currentBooth().accent : targetColor(target), specialHit ? 18 : 11, 1);
    // Every direct target impact uses the same warm confirmation sample. Booth
    // bonuses may still play a flourish after their larger state change, but a
    // glowing lava balloon or secret Moberino no longer gets a metallic ping.
    try { SFX.hit(); } catch (e) {}
    return gained;
  }

  function hitRingPost(target, pos) {
    target.rings = Math.min(target.requiredRings, (target.rings || 0) + 1);
    target.lastRingAt = state.elapsed;
    const complete = target.rings >= target.requiredRings;
    awardTargetHit(target, pos, target.base + (complete ? 900 : 0), true);
    if (complete) {
      target.hit = true;
      target.hitAt = state.elapsed;
      target.completed = true;
      target.frozenUntil = state.elapsed + target.freezeWindow;
      const frozen = orbitFormationTargets().filter(item => item.completed).length;
      showToast(`FROZEN ${frozen}/6 · ${target.freezeWindow.toFixed(1)}s TO CLEAR!`, true, 900);
      checkOrbitFormation();
    } else {
      showToast(`RINGS ${target.rings}/${target.requiredRings} · KEEP GOING!`, true, 720);
    }
    updateHud();
  }

  function orbitFormationTargets() {
    return state.targets.filter(target => target.kind === 'ringPost' && target.formation);
  }

  function checkOrbitFormation() {
    const formation = orbitFormationTargets();
    if (
      state.orbitBossActive ||
      formation.length !== 6 ||
      formation.some(target => !target.completed)
    ) return;
    state.special += 1;
    state.score += 5000;
    addLabel(state.width * .5, state.height * .43, 'FORMATION CLEAR! +5000', '#fff1a3', 34);
    burst(state.width * .5, state.height * .45, '#6de8ff', 36, 1.45);
    showToast('★ FORMATION CLEAR · THEY’RE BLASTING OFF! ★', true, 1550);
    triggerOrbitBoss(formation);
    try { SFX.mysteryGood(); } catch (e) {}
  }

  function triggerOrbitBoss(formation) {
    state.bonusTriggered = true;
    state.orbitBossActive = true;
    state.orbitBossAt = state.elapsed + 1.05;
    formation.forEach((target, index) => {
      target.bossLaunchAt = state.elapsed + index * .08;
    });
    // Clear the old schedule and stage fresh, predictable side temptations
    // around the boss based on however much round time the player earned.
    state.targets = state.targets.filter(target => target.kind !== 'phaseFlyer');
    [.45, 4.8, 9.15].forEach((offset, wave) => {
      const at = state.orbitBossAt + offset;
      if (at < ROUND_SECONDS - 1.1) addOrbitCornerPair(at, 10 + wave, true);
    });
    state.targets.push({
      kind: 'orbitBoss',
      type: 'ringmasterRobot',
      at: state.orbitBossAt,
      duration: Math.max(.5, ROUND_SECONDS - state.orbitBossAt),
      base: 100,
      repeatable: true,
      mouthStage: 0,
      mouthOpen: 0,
      drawLayer: 3,
      hit: false,
    });
    setTimeout(() => {
      if (!state?.orbitBossActive || state.phase !== 'playing') return;
      showToast('RINGMASTER ROBOT · FIRE INTO THE OPEN MOUTH!', true, 1800);
    }, 900);
  }

  function orbitBossValue(stageIndex) {
    return [100, 500, 1000, 2000, 3000][Math.min(4, stageIndex)];
  }

  function hitOrbitBoss(target, pos) {
    const nowSeconds = state.elapsed;
    state.hits += 1;
    state.score += target.base;
    target.hits = (target.hits || 0) + 1;
    target.pulseAt = nowSeconds;
    addLabel(pos.x, pos.y + pos.r * .55, `MOUTH +${target.base}`, '#fff1a3', 26);
    burst(pos.x, pos.y, target.base >= 1000 ? '#ffcf4a' : '#6de8ff', 16, 1.05);
    try { target.base >= 1000 ? SFX.score() : SFX.hit(); } catch (e) {}
    updateHud();
  }

  function hitPlateRack(target, pos) {
    target.cooldownUntil = state.elapsed + target.respawnDelay;
    target.reloadAt = target.cooldownUntil;
    awardTargetHit(target, pos, target.base, false);
    updateHud();
  }

  function openFinalePanel(target) {
    if (target.unfoldHub) {
      unfoldFinaleBank(target);
      return;
    }
    if (target.unfoldLeaf || target.tier >= 2) {
      showToast('BANK CLEARED!', true, 700);
      return;
    }
    const nextTier = target.tier + 1;
    const spreadX = nextTier === 1 ? 82 : 46;
    const spreadY = nextTier === 1 ? .065 : .045;
    [-1, 1].forEach((side, index) => {
      const duration = roundDuration();
      state.targets.push({
        kind: 'revealPanel',
        type: index ? 'starTarget' : 'neonTarget',
        at: state.elapsed + .06,
        duration: Math.max(.5, Math.min(
          duration - state.elapsed,
          (target.finalePhase + 1) * FINALE_PHASE_SECONDS - state.elapsed
        )),
        worldX: Number.isFinite(target.worldX)
          ? clamp(target.worldX + side * spreadX, 80, FINALE_WORLD_LENGTH - 80)
          : undefined,
        anchorX: Number.isFinite(target.anchorX)
          ? clamp(target.anchorX + side * (nextTier === 1 ? .08 : .048), .09, .91)
          : undefined,
        lane: clamp(target.lane + side * spreadY, .16, .76),
        finalePhase: target.finalePhase,
        wave: target.wave,
        waveBornAt: target.waveBornAt,
        tier: nextTier,
        branch: target.branch,
        openingAt: state.elapsed,
        parentWorldX: target.worldX,
        parentAnchorX: target.anchorX,
        parentLane: target.lane,
        openingSide: side,
        base: target.base * 2,
        hit: false,
      });
    });
    showToast(nextTier === 1 ? 'TARGET POPS OPEN!' : 'MORE TARGETS REVEALED!', true, 820);
  }

  function collectBoothSpecial(label, payoff) {
    state.special += 1;
    showToast(`${label} ${state.special}/${currentBooth().goal}!`, true, 1050);
    if (state.special === currentBooth().goal && !state.bonusTriggered) payoff();
  }

  function triggerPlatterBlimp() {
    state.bonusTriggered = true;
    const at = state.elapsed + .35;
    for (let i = 0; i < 11; i += 1) {
      state.targets.push({
        kind: 'plate',
        type: 'bonusPlate',
        at: at + i * .25,
        duration: 2.5,
        direction: i % 2 ? 'right' : 'left',
        lane: .12 + (i % 4) * .18,
        toss: true,
        base: 650,
        golden: true,
        hit: false,
      });
    }
    showToast('★ PLATTER BLIMP INBOUND! ★', true, 2500);
    try { SFX.mysteryGood(); } catch (e) {}
  }

  function triggerBalloonChain(cluster, source) {
    const neighbors = state.targets
      .filter(target => target !== source && target.cluster === cluster && !target.hit && !target.chainAt)
      .sort((a, b) => Math.abs((a.worldX || 0) - (source.worldX || 0)) - Math.abs((b.worldX || 0) - (source.worldX || 0)));
    neighbors.forEach(target => { target.wobbleAt = state.elapsed; });
    neighbors.slice(0, 2).forEach((target, index) => {
      target.chainAt = state.elapsed + .14 + index * .14;
    });
  }

  function processTimedMechanics() {
    if (currentBooth().id === 'farm') {
      processFarmBarn();
      return;
    }
    if (currentBooth().id === 'orbit') {
      processOrbitFormation();
      return;
    }
    if (currentBooth().id === 'plates') {
      processDamBank();
      return;
    }
    if (currentBooth().id === 'finale') {
      processFinalePhases();
      return;
    }
    if (currentBooth().id !== 'volcano') return;
    processVolcanoStages();
    for (const target of state.targets) {
      if (!target.chainAt || target.hit || state.elapsed < target.chainAt) continue;
      target.chainAt = 0;
      const pos = targetPosition(target, state.elapsed);
      if (!pos) continue;
      target.hit = true;
      target.hitAt = state.elapsed;
      const gained = Math.round(target.base * .75);
      state.score += gained;
      addLabel(pos.x, pos.y - pos.r, `RICOCHET +${gained}`, '#fff7d9', 18);
      burst(pos.x, pos.y, targetColor(target), 14, 1.05);
      volcanoSpray(pos.x, pos.y, target.vent || target.golden);
      try { SFX.hit(); } catch (e) {}
    }
  }

  function processDamBank() {
    if (!state.damBankRespawnAt || state.elapsed < state.damBankRespawnAt) return;
    state.damBankRespawnAt = 0;
    if (state.special >= 3) {
      if (!state.damGoldActive) spawnGoldenBeavers(state.elapsed + .08);
      return;
    }
    state.damBankWave = state.special;
    spawnDamBank(state.damBankWave, state.elapsed + .08);
    showToast(`ROW ${state.damBankWave + 1}/3 · CLEAR FIVE TO REACH GOLD!`, true, 1050);
  }

  function processFarmBarn() {
    if (!state.barnBonusActive || !state.barnBonusTarget) return;
    const target = state.barnBonusTarget;
    if (target.hit) return;
    if (state.elapsed <= target.at + target.duration) return;
    resetFarmBarn(.45);
    showToast('BARN CLOSED · BUILD 3 HITS AGAIN!', false, 900);
  }

  function processFinalePhases() {
    const phase = Math.min(2, Math.floor(state.elapsed / FINALE_PHASE_SECONDS));
    if (phase !== state.finalePhase) {
      state.finalePhase = phase;
      state.finaleRespawnAt = 0;
      const messages = [
        'PHASE 1 · OPEN & CLEAR THE BANK',
        'PHASE 2 · BREAK THE PLATE · HIT THE CENTER',
        'PHASE 3 · CLEAR LOCKS · WATCH FOR BONUS BATS',
      ];
      showToast(messages[phase], true, 1700);
      if (phase > 0) {
        burst(state.width * .5, state.height * .18, phase === 1 ? '#6de8ff' : '#ffcf4a', 26, 1.1);
        try { SFX.score(); } catch (e) {}
      }
    }
    if (phase === 0) processFinaleStaticWaves();
    if (phase === 1) processFinalePrecisionScroll();
    if (phase === 2) processFinaleRapidFire();
  }

  function processFinalePrecisionScroll() {
    if (
      state.elapsed >= FINALE_PHASE_SECONDS * 2 - .65 ||
      state.elapsed < state.finalePrecisionNextAt
    ) return;
    const live = state.targets.filter(target =>
      target.precisionMoving &&
      !target.hit &&
      target.at <= state.elapsed + .4 &&
      state.elapsed <= target.at + target.duration &&
      target.worldX - cameraX() + state.width * .5 > -100 &&
      target.worldX - cameraX() + state.width * .5 < state.width * 1.7
    );
    if (live.length >= 3) return;
    const needed = 3 - live.length;
    const cam = cameraX();
    for (let index = 0; index < needed; index += 1) {
      const wave = state.finalePrecisionWave;
      state.finalePrecisionWave += 1;
      spawnFinalePrecisionTarget(
        wave,
        state.elapsed + .08 + index * .1,
        cam + state.width * (.28 + index * .18),
        .23 + (wave % 3) * .18
      );
    }
    state.finalePrecisionNextAt = state.elapsed + .48;
    state.targets.sort((a, b) => a.at - b.at);
  }

  function processFinaleRapidFire() {
    if (state.rapidUnlocked) return;
    const locks = state.targets.filter(target => target.finalLock);
    if (locks.length !== 8 || locks.some(target => !target.hit)) return;
    state.rapidUnlocked = true;
    const at = state.elapsed + .12;
    state.targets.push({
      kind: 'rapidTarget',
      type: 'rapidTarget',
      at,
      duration: Math.max(.5, FINALE_SECONDS - at),
      base: 100,
      hits: 0,
      repeatable: true,
      golden: true,
      finalePhase: 2,
      hit: false,
    });
    addLabel(state.width * .5, state.height * .44, 'RAPID FIRE UNLOCKED!', '#ffcf4a', 36);
    burst(state.width * .5, state.height * .46, '#ffcf4a', 42, 1.4);
    showToast('TAP THE BIG TARGET · VALUE RISES AT 6, 13, 21 & 31!', true, 1900);
    try { SFX.mysteryGood(); } catch (e) {}
  }

  function processFinaleStaticWaves() {
    const liveWaves = [...new Set(
      state.targets
        .filter(target => target.kind === 'revealPanel' && target.finalePhase === 0)
        .map(target => target.wave)
    )];
    for (const wave of liveWaves) {
      const bank = state.targets.filter(target =>
        target.kind === 'revealPanel' &&
        target.finalePhase === 0 &&
        target.wave === wave
      );
      if (
        !bank.length ||
        bank.some(target => !target.hit) ||
        bank.some(target => target.bankClearAwarded)
      ) continue;
      bank.forEach(target => { target.bankClearAwarded = true; });
      const clearBonus = 2000 + Math.floor(wave / 2) * 500;
      state.score += clearBonus;
      addLabel(state.width * .5, state.height * .45, `BANK ${wave + 1} CLEAR +${clearBonus}`, '#ffcf4a', 30);
      burst(state.width * .5, state.height * .45, '#b991ff', 28, 1.18);
      try { SFX.mysteryGood(); } catch (e) {}
      if (state.elapsed < FINALE_PHASE_SECONDS - .55) {
        const replacementWave = state.finaleWave;
        state.finaleWave += 1;
        spawnFinaleStaticWave(replacementWave, state.elapsed + .08);
        showToast('BANK CLEAR · NEW BLUE TARGET!', true, 850);
      }
    }
  }

  function processVolcanoStages() {
    if (state.bonusTriggered) return;
    for (let stageIndex = 0; stageIndex < 3; stageIndex += 1) {
      const wave = state.targets.filter(target =>
        target.stageTarget && target.stageIndex === stageIndex
      );
      if (
        !wave.length ||
        wave.some(target => !target.hit) ||
        wave.some(target => target.stageClearAwarded)
      ) continue;
      wave.forEach(target => { target.stageClearAwarded = true; });
      state.special += 1;
      state.eruptionAt = state.elapsed;
      const clearBonus = 750 * (stageIndex + 1);
      state.score += clearBonus;
      showToast(`★ COMET WAVE ${stageIndex + 1}/3 · +${clearBonus} ★`, true, 1200);
      try { SFX.score(); } catch (e) {}
      updateHud();
    }
    if (state.special >= 3) triggerEruption();
  }

  function processOrbitFormation() {
    if (state.orbitBossActive) return;
    const formation = orbitFormationTargets();
    if (state.formationRespawnAt && state.elapsed >= state.formationRespawnAt) {
      state.formationWave += 1;
      state.formationRespawnAt = 0;
      for (const target of formation) {
        target.hit = false;
        target.completed = false;
        target.rings = 0;
        target.frozenUntil = 0;
        target.resetAt = state.elapsed;
      }
      showToast('▲ NEW FORMATION! ▲', true, 900);
      return;
    }
    if (state.formationRespawnAt) return;

    for (const target of formation) {
      if (!target.completed || state.elapsed < target.frozenUntil) continue;
      const pos = targetPosition(target, state.elapsed);
      target.hit = false;
      target.completed = false;
      target.rings = 0;
      target.frozenUntil = 0;
      target.resetAt = state.elapsed;
      if (pos) {
        addLabel(pos.x, pos.y - pos.r, 'POP!', '#ff8aa8', 21);
        burst(pos.x, pos.y, '#ff5d9d', 10, .82);
      }
    }
  }

  function triggerEruption() {
    state.bonusTriggered = true;
    state.eruptionAt = state.elapsed;
    const at = state.elapsed + .25;
    for (let i = 0; i < 18; i += 1) {
      const column = i % 6;
      const row = Math.floor(i / 6);
      state.targets.push({
        kind: 'lavaBalloon',
        type: 'eruptionBalloon',
        at: at + i * .13,
        duration: 3.2,
        anchorX: .17 + column * .132,
        anchorY: .25 + row * .16 + (column % 2) * .035,
        cluster: 99,
        base: 700,
        golden: true,
        hue: i % 5,
        hit: false,
      });
    }
    showToast('▲ BALLOON ERUPTION! ▲', true, 2600);
    try { SFX.mysteryGood(); } catch (e) {}
  }

  function showToast(message, bonus, duration) {
    const toast = document.getElementById('mania-toast');
    if (!toast) return;
    clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.toggle('bonus', !!bonus);
    toast.classList.add('show');
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration || 1500);
  }

  function orbitRobotMetrics(w, h) {
    const sourceAspect = 1198 / 1313;
    const robotHeight = Math.min(w * .92 / sourceAspect, h * 1.12);
    const robotWidth = robotHeight * sourceAspect;
    const mouthSourceY = .56;
    const top = h - robotHeight;
    return {
      width: robotWidth,
      height: robotHeight,
      mouthY: top + robotHeight * mouthSourceY,
      drawX: -robotWidth / 2,
      drawY: -robotHeight * mouthSourceY,
    };
  }

  function targetPosition(target, elapsed) {
    const local = elapsed - target.at;
    if (local < 0 || local > target.duration) return null;
    if (
      currentBooth().id === 'orbit' &&
      state.orbitBossActive &&
      target.kind !== 'orbitBoss' &&
      target.kind !== 'phaseFlyer' &&
      target.kind !== 'ringPost'
    ) return null;
    if (target.hit && !target.formation && local - (target.hitAt - target.at) > .42) return null;
    const w = state.width;
    const h = state.height;
    const ground = h * .69;
    let x;
    let y;
    let scale = clamp(Math.min(w, h) / 520, .72, 1.35);
    let visibility = 1;
    let hittable = true;

    let growth = 1;
    const travel = () => {
      const p = easeInOut(local / target.duration);
      return target.direction === 'left'
        ? w + 70 - p * (w + 140)
        : -70 + p * (w + 140);
    };

    if (target.kind === 'farmPop') {
      const p = target.clearReplace ? clamp(local / .22, 0, 1) : clamp(local / target.duration, 0, 1);
      const rise = target.clearReplace
        ? easeOut(p)
        : p < .18
          ? easeOut(p / .18)
          : p > .76 ? easeInOut((1 - p) / .24) : 1;
      x = w * target.anchorX;
      y = lerp(h * .94, h * target.lane, rise);
      scale *= 1.08;
      visibility = clamp(rise * 1.8, 0, 1);
      hittable = rise > .55;
    } else if (target.kind === 'farmSlide') {
      const p = target.clearReplace ? clamp(local / .24, 0, 1) : clamp(local / target.duration, 0, 1);
      const reveal = target.clearReplace
        ? easeOut(p)
        : p < .2 ? easeOut(p / .2) : p > .76 ? easeInOut((1 - p) / .24) : 1;
      const slide = target.clearReplace ? easeInOut(p) : easeInOut(clamp(p / .7, 0, 1));
      x = w * (target.anchorX + target.slideFrom * (1 - slide))
        + Math.sin(p * Math.PI) * w * target.slideFrom * .35;
      y = lerp(h * .69, h * target.lane, reveal);
      scale *= .88;
      visibility = clamp(reveal * 1.7, 0, 1);
      hittable = reveal > .55;
    } else if (target.kind === 'farmHill') {
      const p = target.clearReplace ? clamp(local / .26, 0, 1) : clamp(local / target.duration, 0, 1);
      const reveal = target.clearReplace
        ? easeOut(p)
        : p < .22 ? easeOut(p / .22) : p > .72 ? easeInOut((1 - p) / .28) : 1;
      x = w * target.anchorX + Math.sin(p * Math.PI * 2) * w * .012;
      y = lerp(h * .47, h * target.lane, reveal);
      scale *= .48;
      visibility = clamp(reveal * 1.9, 0, 1);
      hittable = reveal > .58;
    } else if (target.kind === 'farmBarnDoor') {
      if (state.barnBonusActive || elapsed < state.barnDoorCooldown) return null;
      const g = barnGeometry(w * target.barn.anchorX, target.barn.groundY);
      const returnAge = elapsed - state.barnDoorCooldown;
      const rise = state.barnDoorCooldown && returnAge < .32
        ? easeOut(clamp(returnAge / .32, 0, 1))
        : 1;
      x = g.x;
      // Keep the chicken seated inside the doorway instead of floating above
      // the sill; the feet should remain hidden even at full rise.
      y = g.groundY - g.h * .29 + (1 - rise) * g.h * .28;
      scale = g.scale * .58;
      visibility = rise;
    } else if (target.kind === 'farmBarnBonus') {
      const g = barnGeometry(w * target.barn.anchorX, target.barn.groundY);
      const p = clamp(local / target.duration, 0, 1);
      const rise = p < .18 ? easeOut(p / .18) : p > .8 ? easeInOut((1 - p) / .2) : 1;
      x = g.x;
      y = g.groundY - g.h * .41 + (1 - rise) * g.h * .34;
      scale = g.scale * .84;
      visibility = clamp(rise * 1.5, 0, 1);
    } else if (target.kind === 'runner') {
      x = travel();
      y = ground + (h - ground) * target.lane + Math.sin(local * 12 + target.at) * 5;
      scale *= target.type === 'duck' || target.type === 'chicken' ? .87 : 1;
    } else if (target.kind === 'flyer') {
      if (target.clearReplace) {
        const reveal = easeOut(clamp(local / .22, 0, 1));
        x = w * target.anchorX;
        y = h * target.lane + Math.sin(local * 3.4 + target.at) * h * .018 - (1 - reveal) * h * .08;
        visibility = reveal;
        hittable = reveal > .55;
      } else {
        x = travel();
        y = h * target.lane + Math.sin(local * 5.4 + target.at) * h * .055;
      }
      scale *= .82;
    } else if (target.kind === 'peek') {
      const barn = barnGeometry(target.barn.worldX - cameraX());
      const open = Math.min(1, local / .5, (target.duration - local) / .55);
      const bob = Math.sin(local * 4.8) * 3;
      x = barn.x;
      y = barn.groundY - barn.h * .33 + (1 - clamp(open, 0, 1)) * barn.h * .28 + bob;
      scale = barn.scale * .9;
      visibility = clamp(open, 0, 1);
    } else if (target.kind === 'ringPost') {
      if (!target.completed && target.rings > 0 && elapsed - target.lastRingAt > target.ringWindow) {
        target.rings = 0;
        target.resetAt = elapsed;
      }
      const waveShift = state.formationWave % 2 ? (target.formationIndex % 2 ? .025 : -.025) : 0;
      x = w * (target.anchorX + waveShift);
      y = h * target.anchorY;
      if (target.completed) {
        y += clamp(h * .035, 12, 26);
        scale *= .78;
        visibility = .66;
      }
      if (target.resetAt && elapsed - target.resetAt < .55) {
        const resetProgress = (elapsed - target.resetAt) / .55;
        y += (1 - easeOut(resetProgress)) * clamp(h * .08, 32, 64);
        visibility = .55 + resetProgress * .45;
      }
      if (target.bossLaunchAt && elapsed >= target.bossLaunchAt) {
        const launchAge = elapsed - target.bossLaunchAt;
        y -= easeInOut(clamp(launchAge / .78, 0, 1)) * h * 1.18;
        x += Math.sin(launchAge * 19 + target.formationIndex) * 10;
        visibility = clamp(1 - launchAge / .82, 0, 1);
        if (launchAge > .84) return null;
      }
      scale *= .98;
    } else if (target.kind === 'phaseFlyer') {
      const p = clamp(local / target.duration, 0, 1);
      const appear = easeOut(clamp(p / .2, 0, 1));
      const blast = easeInOut(clamp((p - .74) / .26, 0, 1));
      const warning = clamp(1 - Math.abs(p - .7) / .065, 0, 1);
      const edgeInset = clamp(w * .105, 50, 106);
      const skyY = clamp(h * .145, 54, 102);
      x = target.corner === 'left' ? edgeInset : w - edgeInset;
      x += Math.sin(local * 38) * warning * clamp(w * .007, 3, 8);
      y = skyY;
      if (p < .2) y -= (1 - appear) * clamp(h * .08, 30, 70);
      if (blast > 0) y = lerp(y, -h * .18, blast);
      visibility = p < .2 ? appear : p > .94 ? (1 - p) / .06 : 1;
      growth = .78 + appear * .22 + warning * .05;
      scale *= .72 * (target.type === 'cometMobe' ? .82 : 1) * growth;
      target.blastProgress = blast;
      hittable = appear > .72 && blast < .34;
    } else if (target.kind === 'orbitBoss') {
      const arrival = easeOut(clamp(local / .72, 0, 1));
      const activeAge = Math.max(0, local - .72);
      const cycleDuration = 4.25;
      const cycleAge = mod(activeAge, cycleDuration);
      const mouthStage = Math.floor(activeAge / cycleDuration);
      const opening = easeOut(clamp((cycleAge - .85) / .42, 0, 1));
      const closing = easeInOut(clamp((cycleAge - 3.28) / .48, 0, 1));
      const mouthOpen = opening * (1 - closing);
      const robot = orbitRobotMetrics(w, h);
      x = w * .5;
      y = lerp(h * 1.14, robot.mouthY, arrival);
      scale = 1;
      visibility = arrival;
      growth = .9 + arrival * .1;
      target.mouthStage = mouthStage;
      target.mouthOpen = mouthOpen;
      target.mouthCycleAge = cycleAge;
      target.base = orbitBossValue(mouthStage);
      hittable = arrival > .92 && mouthOpen > .72;
      return {
        x,
        y,
        r: Math.min(robot.width * .21, robot.height * .17),
        scale,
        visibility,
        growth,
        hittable,
        mouthOpen,
      };
    } else if (target.kind === 'damBank' || target.kind === 'goldBeaver') {
      const arrival = easeOut(clamp(local / .46, 0, 1));
      x = w * target.anchorX;
      // Narrow iPhone canvases shrink the authored beaver more than the
      // backdrop rail. Lower the center so the sprite remains planted by its
      // feet instead of hovering above the source-aligned log mask.
      const phoneRailFootOffset = w <= 620
        ? clamp(h * .032, 14, 25)
        : 0;
      const homeY = h * target.anchorY + phoneRailFootOffset;
      y = lerp(homeY + clamp(h * .16, 72, 118), homeY, arrival);
      scale *= target.targetScale * (.72 + arrival * .28);
      visibility = arrival;
      growth = arrival;
      return {
        x,
        y,
        r: 48 * scale,
        scale,
        visibility,
        growth,
        bushOffsetY: (homeY - y) / Math.max(.01, scale),
        hittable: arrival > .82,
      };
    } else if (target.kind === 'beaverRunner') {
      const p = easeInOut(clamp(local / target.duration, 0, 1));
      x = target.direction === 'left'
        ? w + 80 - p * (w + 160)
        : -80 + p * (w + 160);
      y = h * target.lane - Math.abs(Math.sin(local * 7.4)) * 7;
      scale *= target.targetScale;
      visibility = clamp(Math.sin(p * Math.PI) * 1.7, 0, 1);
      return {
        x,
        y,
        r: 46 * scale,
        scale,
        visibility,
        growth: 1,
        hittable: visibility > .55,
      };
    } else if (target.kind === 'damBeaver') {
      if (target.spent && elapsed >= target.spentUntil) {
        target.spent = false;
        target.cycleOffset = mod(.18 - elapsed, target.popPeriod);
      }
      x = w * target.anchorX;
      const homeY = h * target.anchorY;
      const phase = mod(elapsed + target.cycleOffset, target.popPeriod);
      const warningStart = target.popPeriod - target.openWindow - target.warningWindow;
      const openStart = target.popPeriod - target.openWindow;
      const openAge = phase - openStart;
      const opening = openAge < target.doorTransition
        ? easeOut(clamp(openAge / target.doorTransition, 0, 1))
        : openAge > target.openWindow - target.doorTransition
          ? easeInOut(clamp((target.openWindow - openAge) / target.doorTransition, 0, 1))
          : 1;
      const openAmount = target.spent || phase < openStart ? 0 : clamp(opening, 0, 1);
      target.visualOpen = openAmount;
      target.popWarning = !target.spent && phase >= warningStart && phase < openStart;
      scale *= target.targetScale;
      growth = openAmount;
      const revealTravel = clamp(h * (.11 - target.tier * .018) * (target.tier === 1 ? 1.2 : 1), 42, 82);
      const coverY = homeY + 30 * scale;
      y = homeY + (1 - openAmount) * revealTravel;
      return {
        x,
        y,
        r: 48 * scale,
        scale,
        visibility,
        growth,
        openAmount,
        coverY,
        hittable: !target.spent && openAmount > .72,
      };
    } else if (target.kind === 'beaverPeek') {
      const p = clamp(local / target.duration, 0, 1);
      const teaseIn = easeOut(clamp(p / .16, 0, 1)) * .38;
      const fullIn = easeOut(clamp((p - .3) / .16, 0, 1));
      const departure = easeInOut(clamp((p - .78) / .22, 0, 1));
      const reveal = (p < .3 ? teaseIn : lerp(.38, 1, fullIn)) * (1 - departure);
      const outside = clamp(w * .065, 38, 58);
      const inside = clamp(w * .018, 10, 18);
      x = target.side === 'left'
        ? lerp(-outside, inside, reveal)
        : lerp(w + outside, w - inside, reveal);
      y = h * target.lane + Math.sin(local * 3.2) * 2.5;
      scale *= target.targetScale;
      growth = reveal;
      visibility = clamp(reveal * 1.6, 0, 1);
      target.visualReveal = reveal;
      return {
        x,
        y,
        r: 39 * scale * Math.max(.5, reveal),
        scale,
        visibility,
        growth,
        hittable: reveal > .62,
      };
    } else if (target.kind === 'plateRack') {
      if (target.cooldownUntil && elapsed < target.cooldownUntil) return null;
      x = target.worldX - cameraX() + w * .5;
      y = h * target.lane;
      if (target.reloadAt && elapsed - target.reloadAt < .32) {
        const reloadProgress = clamp((elapsed - target.reloadAt) / .32, 0, 1);
        y += (1 - easeOut(reloadProgress)) * 45;
        visibility = reloadProgress;
      }
      scale *= .82;
    } else if (target.kind === 'platePop') {
      const p = clamp(local / target.duration, 0, 1);
      x = w * target.anchor + Math.sin(p * Math.PI * 2) * 13;
      y = h * .72 - Math.sin(p * Math.PI) * h * .48;
      scale *= target.gold ? 1.05 : .92;
    } else if (target.kind === 'plateFlyby') {
      x = travel();
      y = h * (.18 + target.lane * .62) + Math.sin(local * 5) * 12;
      scale *= target.gold ? 1.05 : .92;
    } else if (target.kind === 'plate') {
      x = travel();
      y = h * (.18 + target.lane * .62) - (target.toss ? Math.sin((local / target.duration) * Math.PI) * h * .18 : 0);
      scale *= target.gold || target.golden ? .92 : 1;
    } else if (target.kind === 'dinosaur') {
      x = travel();
      y = h * target.lane + Math.sin(local * 9 + target.dinoIndex) * 3;
      scale *= target.targetScale;
    } else if (target.kind === 'dinoBalloon') {
      const parentPos = targetPosition(target.parent, elapsed);
      if (
        !parentPos ||
        (target.parent.hit && elapsed - target.parent.hitAt > .38)
      ) return null;
      const directionSign = target.parent.direction === 'left' ? -1 : 1;
      const spread = (target.balloonIndex - (target.balloonCount - 1) / 2) * 42;
      const sway = Math.sin(local * 3.7 + target.balloonIndex * 1.9) * 10;
      x = parentPos.x + directionSign * spread + sway;
      y = parentPos.y - 92 * parentPos.scale - target.balloonIndex * 13
        + Math.sin(local * 4.4 + target.balloonIndex) * 7;
      scale = parentPos.scale * .7;
    } else if (target.kind === 'balloonTree' || target.kind === 'lavaBalloon' || target.kind === 'volcanoDecoy') {
      if (target.cooldownUntil && elapsed < target.cooldownUntil) return null;
      if (target.type === 'eruptionBalloon' && Number.isFinite(target.anchorX)) {
        const p = easeOut(clamp(local / .7, 0, 1));
        x = lerp(w * .5, w * target.anchorX, p);
        y = lerp(h * .37, h * target.anchorY, p) - Math.sin(clamp(local / target.duration, 0, 1) * Math.PI) * h * .16;
      } else if (Number.isFinite(target.anchorX)) {
        const entrance = easeOut(clamp(local / .48, 0, 1));
        x = w * target.anchorX;
        y = lerp(h * .79, h * target.anchorY, entrance);
        growth = entrance;
        visibility = clamp(entrance * 1.7, 0, 1);
      } else {
        x = Number.isFinite(target.worldX)
          ? target.worldX - cameraX() + w * .5
          : travel();
        y = h * (.18 + target.lane * .64);
      }
      y += Math.sin(local * 4 + target.hue) * (target.type === 'lavaStream' ? 3 : 7);
      if (target.respawnAt && elapsed - target.respawnAt < .32) {
        const respawn = easeOut(clamp((elapsed - target.respawnAt) / .32, 0, 1));
        y += (1 - respawn) * 40;
        scale *= .72 + respawn * .28;
      }
      if (target.launched) y -= Math.max(0, elapsed - target.launchAt) * h * .19;
      if (target.wobbleAt && elapsed - target.wobbleAt < .55) {
        const wobble = 1 - (elapsed - target.wobbleAt) / .55;
        x += Math.sin((elapsed - target.wobbleAt) * 42) * 12 * wobble;
      }
      scale *= target.type === 'lavaStream'
        ? (.7 + growth * .24)
        : target.kind === 'lavaBalloon'
          ? .86
          : target.kind === 'volcanoDecoy'
            ? .72
            : 1;
    } else if (target.kind === 'volcanoComet') {
      const settle = easeOut(clamp(local / .42, 0, 1));
      x = lerp(w * (target.anchorX - .12), w * target.anchorX, settle);
      y = lerp(-70, h * target.anchorY, settle) + Math.sin(local * 2.8 + target.stageIndex) * 3;
      scale *= .54;
      visibility = settle;
    } else if (target.kind === 'finaleBat') {
      const p = easeInOut(clamp(local / target.duration, 0, 1));
      x = target.direction === 'left'
        ? w + 54 - p * (w + 108)
        : -54 + p * (w + 108);
      y = h * target.lane + Math.sin(local * 7.5 + target.batIndex) * h * .025;
      scale *= .56;
      visibility = clamp(Math.sin(p * Math.PI) * 2.2, 0, 1);
      return {
        x,
        y,
        r: clamp(34 * scale, 28, 42),
        scale,
        visibility,
        growth: 1,
        hittable: visibility > .55,
      };
    } else if (target.kind === 'revealPanel') {
      x = Number.isFinite(target.anchorX)
        ? w * target.anchorX
        : target.worldX - cameraX() + w * .5;
      y = h * target.lane + Math.sin(elapsed * 2.2 + target.branch) * 5;
      growth = .86 + Math.abs(Math.sin(elapsed * (1.35 + target.tier * .18) + target.branch)) * .16;
      if (Number.isFinite(target.waveBornAt) && elapsed - target.waveBornAt < .35) {
        const arrival = easeOut(clamp((elapsed - target.waveBornAt) / .35, 0, 1));
        growth *= .62 + arrival * .38;
        visibility *= arrival;
      }
      if (target.openingAt && elapsed - target.openingAt < .38) {
        const opening = easeOut(clamp((elapsed - target.openingAt) / .38, 0, 1));
        const parentX = Number.isFinite(target.parentAnchorX)
          ? w * target.parentAnchorX
          : target.parentWorldX - cameraX() + w * .5;
        const parentY = h * target.parentLane;
        x = lerp(parentX, x, opening);
        y = lerp(parentY, y, opening);
        x += Math.sin(opening * Math.PI) * (target.openingSide || 0) * 24;
        growth *= opening;
      }
      if (target.precisionMoving) {
        if (
          target.armorStage === 1 &&
          elapsed - target.exposedAt > 1.05
        ) {
          target.armorStage = 0;
          target.tier = 0;
          target.exposedAt = 0;
        }
        if (target.armorStage === 1) {
          const exposedAge = elapsed - target.exposedAt;
          growth *= .68;
          hittable = exposedAge >= .18 && exposedAge <= 1.05;
        }
        scale *= .72;
      }
      scale *= growth * (target.targetScale || 1);
    } else if (target.kind === 'finalePopup') {
      const p = clamp(local / target.duration, 0, 1);
      const rise = p < .24 ? easeOut(p / .24) : p > .78 ? easeInOut((1 - p) / .22) : 1;
      x = w * target.anchorX + Math.sin(p * Math.PI * 2 + target.at) * w * .012;
      y = lerp(h * .83, h * target.anchorY, rise);
      growth = (.76 + Math.sin(clamp(p / .2, 0, 1) * Math.PI) * .24) * target.precision;
      scale *= growth;
      visibility = clamp(rise * 1.7, 0, 1);
    } else if (target.kind === 'finaleGate') {
      const rise = easeOut(clamp(local / .42, 0, 1));
      x = w * target.anchorX;
      y = lerp(h * .84, h * target.anchorY, rise);
      growth = (.78 + rise * .22) * target.precision;
      scale *= growth;
      visibility = rise;
    } else if (target.kind === 'rapidTarget') {
      x = w * .5;
      y = h * .46;
      const pulse = target.pulseAt && elapsed - target.pulseAt < .14
        ? 1 + (1 - (elapsed - target.pulseAt) / .14) * .16
        : 1;
      growth = (.86 + Math.min(30, target.hits || 0) * .012 + Math.sin(elapsed * 7) * .025) * pulse;
      scale *= growth;
    } else if (target.kind === 'jackpot') {
      x = w * .5;
      y = h * .47;
      growth = .72 + (local / target.duration) * 1.2 + Math.sin(local * 8) * .08;
      scale *= growth;
    } else if (target.kind === 'hiddenMobe') {
      x = Number.isFinite(target.anchorX)
        ? w * target.anchorX
        : target.worldX - cameraX() + w * .5;
      y = h * target.lane + Math.sin(elapsed * 2.7 + target.variant) * 3;
      scale *= .78;
      visibility = .92;
    }
    const phoneStage = w <= 520;
    if (
      phoneStage &&
      ['farmPop', 'farmSlide', 'farmHill', 'farmBarnDoor', 'farmBarnBonus', 'runner', 'peek'].includes(target.kind)
    ) {
      scale *= 1.2;
      if (target.kind === 'farmPop') y -= clamp(h * .04, 12, 20);
      if (target.kind === 'farmSlide') y -= clamp(h * .025, 8, 14);
    }
    if (
      phoneStage &&
      ['dinosaur', 'dinoBalloon', 'balloonTree', 'lavaBalloon', 'volcanoDecoy', 'volcanoComet'].includes(target.kind)
    ) {
      scale *= 1.12;
    }
    if (
      phoneStage &&
      ['balloonTree', 'lavaBalloon', 'volcanoDecoy'].includes(target.kind)
    ) {
      // Preserve the existing large stationary-balloon footprint after the
      // booth-wide phone enlargement above.
      scale *= 1.16;
      const balloonInset = clamp(w * .12, 40, 58);
      x = clamp(x, balloonInset, w - balloonInset);
    }
    if (target.hiddenMobe) {
      // Collectibles keep one screen-space footprint regardless of whether
      // they replace a distant hill target, runner, dinosaur, or other slot.
      scale = phoneStage ? .82 : .9;
    }
    if (x < -100 || x > w + 100) return null;
    const small = ['chicken', 'duck', 'bird', 'bluebird'].includes(target.type);
    const farmAnimal = ['farmPop', 'farmSlide', 'farmHill', 'farmBarnDoor', 'farmBarnBonus', 'runner', 'peek'].includes(target.kind);
    const balloonTarget = target.kind === 'balloonTree' || target.kind === 'lavaBalloon' || target.kind === 'volcanoDecoy' || target.kind === 'dinoBalloon';
    const targetRadius = target.kind === 'ringPost'
      ? 44
      : balloonTarget
        ? target.type === 'lavaStream' ? 38 : target.vent || target.golden ? 45 : target.kind === 'volcanoDecoy' ? 31 : 42
      : target.kind === 'volcanoComet'
        ? 42
      : target.kind === 'finaleBat'
        ? 42
      : target.kind === 'dinosaur'
        ? 54
      : target.kind === 'revealPanel'
        ? 50 - target.tier * 5
      : target.kind === 'finalePopup'
        ? 48
      : target.kind === 'finaleGate'
        ? 48
      : target.kind === 'rapidTarget'
        ? 58
      : target.kind === 'jackpot'
        ? 50
      : target.kind === 'damBeaver'
        ? 48
      : target.kind === 'damBank' || target.kind === 'goldBeaver' || target.kind === 'beaverRunner'
        ? 46
      : target.kind === 'beaverPeek'
        ? 39
      : target.kind === 'farmHill'
        ? small ? 31 : 38
      : target.kind === 'farmBarnDoor'
        ? 42
      : target.kind === 'farmBarnBonus'
        ? 48
      : farmAnimal
        ? small ? 36 : 46
        : target.kind === 'flyer'
          ? 36
          : small ? 29 : 36;
    const r = targetRadius * scale * Math.max(.45, visibility);
    return { x, y, r, scale, visibility, growth, hittable };
  }

  function draw(now) {
    const w = state.width;
    const h = state.height;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const boothId = currentBooth().id;
    if (boothId === 'farm') {
      drawFarmScene(w, h);
    } else if (boothId === 'orbit') {
      drawOrbitScene(w, h);
    } else if (boothId === 'plates') {
      drawDamScene(w, h);
    } else if (boothId === 'volcano') {
      drawVolcanoScene(w, h);
    } else {
      drawFinaleScene(w, h);
    }

    // Barn targets sit in the dark doors. Drawing the buildings first lets the
    // animal remain readable while the rising motion still explains "hidden."
    if (boothId === 'farm') for (const barn of state.barns) drawBarn(barn);
    if (boothId === 'volcano') drawDinosaurTethers();
    if (boothId === 'plates') drawDamGoldProgress(w, h);

    const targetsToDraw = [...state.targets].sort((a, b) => {
      const layerOrder = targetVisualLayer(a, boothId) - targetVisualLayer(b, boothId);
      if (layerOrder) return layerOrder;
      // Collectibles sit above ordinary targets within their physical layer.
      const collectibleOrder = Number(!!a.hiddenMobe) - Number(!!b.hiddenMobe);
      return collectibleOrder;
    });
    const visibleHiddenPositions = targetsToDraw
      .filter(target => target.hiddenMobe && !target.hit)
      .map(target => ({ target, pos: targetPosition(target, state.elapsed) }))
      .filter(item => item.pos);
    let farmMiddleMaskDrawn = false;
    let damMiddleMaskDrawn = false;
    for (const target of targetsToDraw) {
      const visualLayer = targetVisualLayer(target, boothId);
      if (boothId === 'farm' && !farmMiddleMaskDrawn && visualLayer >= 4) {
        drawFarmLayerMask(w, h, .6, .72);
        farmMiddleMaskDrawn = true;
      }
      // The middle rail belongs in front of the rear pop-up stations only.
      // Bank beavers, runners, and hidden Moberinos stay fully above it.
      if (boothId === 'plates' && !damMiddleMaskDrawn && visualLayer >= 3) {
        drawDamMiddleRailMask(w, h);
        damMiddleMaskDrawn = true;
      }
      const pos = targetPosition(target, state.elapsed);
      if (!pos) continue;
      if (
        !target.hiddenMobe &&
        visibleHiddenPositions.some(hidden =>
          Math.hypot(pos.x - hidden.pos.x, pos.y - hidden.pos.y) <
          Math.min(pos.r, hidden.pos.r) * .62
        )
      ) continue;
      const hitAge = target.hit ? state.elapsed - target.hitAt : 0;
      ctx.save();
      if (target.hit && !target.formation) {
        if (target.kind === 'revealPanel') {
          const knockback = clamp(hitAge / .42, 0, 1);
          const kick = easeOut(clamp(knockback / .34, 0, 1));
          const tumbleSide = Math.sign(pos.x - state.width * .5) || 1;
          ctx.globalAlpha = clamp((1 - knockback) * 3, 0, 1);
          ctx.translate(pos.x, pos.y);
          ctx.translate(
            tumbleSide * 20 * kick,
            -68 * kick + 84 * knockback * knockback
          );
          ctx.rotate(tumbleSide * knockback * Math.PI * 4.3);
          const depthScale = 1 - knockback * .5;
          const endOverEndSquash = 1 - Math.abs(Math.sin(knockback * Math.PI * 4.3)) * .18;
          ctx.scale(depthScale, depthScale * endOverEndSquash);
          ctx.translate(-pos.x, -pos.y);
        } else if (['damBank', 'goldBeaver', 'beaverRunner', 'beaverPeek'].includes(target.kind)) {
          const knockback = clamp(hitAge / .42, 0, 1);
          const tumbleSide = Math.sign(pos.x - state.width * .5) || 1;
          ctx.globalAlpha = clamp((1 - knockback) * 2.7, 0, 1);
          ctx.translate(pos.x, pos.y);
          ctx.translate(
            tumbleSide * 16 * easeOut(knockback),
            -54 * easeOut(knockback) + 68 * knockback * knockback
          );
          ctx.rotate(tumbleSide * knockback * Math.PI * 2.35);
          const beaverDepth = 1 - knockback * .56;
          ctx.scale(beaverDepth, beaverDepth);
          ctx.translate(-pos.x, -pos.y);
        } else {
          ctx.globalAlpha = clamp(1 - hitAge / .42, 0, 1);
          ctx.translate(pos.x, pos.y);
          ctx.translate(0, -hitAge * 70);
          ctx.scale(1 + hitAge * .6, 1 + hitAge * .6);
          ctx.translate(-pos.x, -pos.y);
        }
      }
      drawTarget(target, pos, now);
      ctx.restore();
    }

    if (boothId === 'farm') {
      if (!farmMiddleMaskDrawn) drawFarmLayerMask(w, h, .6, .72);
      drawFarmLayerMask(w, h, .84, 1);
      drawFarmPointOverlays(now);
    }
    if (boothId === 'plates' && !damMiddleMaskDrawn) drawDamMiddleRailMask(w, h);
    drawStageFrame(w, h, boothId);
    drawShots(now);
    drawParticles(now);
    drawLabels(now);
  }

  function targetVisualLayer(target, boothId) {
    if (boothId === 'farm' || boothId === 'orbit') return target.drawLayer || 3;
    if (boothId === 'plates') {
      if (target.kind === 'damBeaver') return 1;
      if (target.kind === 'damBank' || target.kind === 'goldBeaver') return 3;
      if (target.kind === 'beaverRunner' || target.kind === 'beaverPeek') return 5;
      return 3;
    }
    if (boothId === 'volcano') {
      if (target.kind === 'volcanoComet') return 1;
      if (target.kind === 'dinosaur') return target.lane < .7 ? 2 : 4;
      if (target.kind === 'dinoBalloon') return target.parent?.lane < .7 ? 3 : 5;
      return 3;
    }
    if (target.kind === 'finaleBat') return 6;
    return target.drawLayer || 3;
  }

  function isFarmScoreTarget(target) {
    return ['farmPop', 'farmSlide', 'farmHill', 'farmBarnDoor', 'farmBarnBonus'].includes(target.kind);
  }

  function drawFarmPointOverlays(now) {
    for (const target of state.targets) {
      if (!isFarmScoreTarget(target) || (target.hit && !target.repeatable)) continue;
      const pos = targetPosition(target, state.elapsed);
      if (!pos || pos.visibility < .12) continue;
      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.scale(pos.scale, pos.scale);
      ctx.globalAlpha *= pos.visibility;
      const bob = Math.sin((now + target.at * 1000) / 115) * 1.6;
      ctx.translate(0, bob);
      drawPointValue(target);
      ctx.restore();
    }
  }

  function drawStageFrame(w, h, boothId) {
    const accents = {
      farm: ['#d49b42', '#6d3c22'],
      orbit: ['#47639e', '#17244e'],
      plates: ['#a55f47', '#3e3436'],
      volcano: ['#a63e60', '#3c2336'],
      finale: ['#6d4bb4', '#17112f'],
    };
    const [light, dark] = accents[boothId] || accents.farm;

    // Foreground posts and a stage lip turn the viewport into a physical toy
    // booth. Targets can pass behind it, while shots and score labels stay on top.
    const postW = clamp(w * .018, 9, 18);
    ctx.fillStyle = dark;
    ctx.fillRect(0, 0, postW, h);
    ctx.fillRect(w - postW, 0, postW, h);
    ctx.fillStyle = light;
    ctx.fillRect(postW * .25, 0, postW * .35, h);
    ctx.fillRect(w - postW * .62, 0, postW * .35, h);
    ctx.fillStyle = dark;
    ctx.fillRect(0, h - 24, w, 24);
    ctx.fillStyle = light;
    ctx.fillRect(0, h - 24, w, 6);
    ctx.fillStyle = '#f4d27a';
    for (let x = 24; x < w; x += 64) circle(x, h - 12, 2.2, false);

    // A quiet paper grain and vignette unify the code-drawn scenes into one
    // tactile cardboard play-set without reducing target legibility.
    ctx.save();
    ctx.globalAlpha = .055;
    ctx.fillStyle = '#fff7db';
    for (let i = 0; i < 58; i += 1) {
      const x = mod(i * 83 + boothId.length * 31, w);
      const y = mod(i * 47 + boothId.length * 19, h);
      ctx.fillRect(x, y, i % 3 === 0 ? 2 : 1, 1);
    }
    ctx.restore();
    const vignette = ctx.createRadialGradient(w * .5, h * .44, Math.min(w, h) * .18, w * .5, h * .5, Math.max(w, h) * .72);
    vignette.addColorStop(.45, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(16,8,14,.22)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }

  function drawSky(w, h) {
    const sky = ctx.createLinearGradient(0, 0, 0, h * .68);
    sky.addColorStop(0, '#5fc4ec');
    sky.addColorStop(.62, '#bcebd9');
    sky.addColorStop(1, '#f7e0a1');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = '#ffe278';
    ctx.beginPath();
    ctx.arc(w * .82, h * .14, Math.min(w, h) * .065, 0, Math.PI * 2);
    ctx.fill();

    const cam = cameraX();
    for (let i = -1; i < 6; i += 1) {
      const x = mod(i * 260 - cam * .11, w + 360) - 140;
      drawCloud(x, h * (.11 + (i % 3) * .09), 1 + (i % 2) * .28);
    }

    ctx.fillStyle = '#72aa55';
    ctx.beginPath();
    ctx.moveTo(0, h * .55);
    for (let x = 0; x <= w + 60; x += 60) {
      ctx.quadraticCurveTo(x + 30, h * (.43 + .04 * Math.sin((x + cam * .18) / 170)), x + 60, h * .54);
    }
    ctx.lineTo(w, h * .72);
    ctx.lineTo(0, h * .72);
    ctx.closePath();
    ctx.fill();
  }

  function drawFarmScene(w, h) {
    const backdrop = typeof _getImg === 'function'
      ? _getImg('assets/mania/farm/farm-backdrop-v1.png')
      : null;
    if (backdrop?.complete && backdrop.naturalWidth) {
      ctx.save();
      ctx.filter = 'saturate(.66) brightness(.92) contrast(.9)';
      drawImageCover(backdrop, w, h);
      ctx.restore();
      ctx.fillStyle = 'rgba(245,239,216,.08)';
      ctx.fillRect(0, 0, w, h);
      const glaze = ctx.createLinearGradient(0, 0, 0, h);
      glaze.addColorStop(0, 'rgba(10,70,72,.03)');
      glaze.addColorStop(.62, 'rgba(255,218,102,.025)');
      glaze.addColorStop(1, 'rgba(52,35,12,.14)');
      ctx.fillStyle = glaze;
      ctx.fillRect(0, 0, w, h);
      drawFarmDust(w, h);
      return;
    }
    drawSky(w, h);
    drawFields(w, h);
  }

  function drawFarmDust(w, h) {
    const cam = cameraX();
    ctx.save();
    for (let i = 0; i < 26; i += 1) {
      const x = mod(i * 83 - cam * (i % 2 ? .16 : .27), w + 40) - 20;
      const y = h * (.18 + (i % 8) * .071);
      ctx.globalAlpha = .08 + (i % 4) * .025;
      ctx.fillStyle = i % 5 === 0 ? '#fff4bf' : '#e2a840';
      circle(x, y, i % 3 === 0 ? 2.1 : 1.2, false);
    }
    ctx.restore();
  }

  function drawCloud(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.globalAlpha = .78;
    ctx.fillStyle = '#fff9e8';
    for (const part of [[0,10,30],[30,0,38],[68,12,27],[34,20,50]]) {
      ctx.beginPath();
      ctx.arc(part[0], part[1], part[2], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawOrbitScene(w, h) {
    const backdrop = typeof _getImg === 'function' ? _getImg('assets/mania/orbit-backdrop-v2.png') : null;
    if (backdrop?.complete && backdrop.naturalWidth) {
      drawImageCover(backdrop, w, h);
      const glaze = ctx.createLinearGradient(0, 0, 0, h);
      glaze.addColorStop(0, 'rgba(4,6,34,.08)');
      glaze.addColorStop(.58, 'rgba(10,7,43,.02)');
      glaze.addColorStop(1, 'rgba(9,5,25,.22)');
      ctx.fillStyle = glaze;
      ctx.fillRect(0, 0, w, h);
    } else {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#03031a');
      sky.addColorStop(.55, '#10114a');
      sky.addColorStop(1, '#20104d');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawCometGate(w, h) {
    const gateW = clamp(Math.min(w, h) * .17, 58, 98);
    const gateH = clamp(Math.min(w, h) * .21, 76, 126);
    const powered = Math.min(state.special, currentBooth().goal);
    const open = state.bonusTriggered;
    ctx.save();
    ctx.translate(w * .5, h * .22);

    ctx.fillStyle = 'rgba(2,4,20,.36)';
    ctx.beginPath();
    ctx.ellipse(0, gateH * .52, gateW * 1.2, gateH * .17, 0, 0, Math.PI * 2);
    ctx.fill();

    if (open) {
      const portal = ctx.createRadialGradient(0, 3, 3, 0, 3, gateW * .82);
      portal.addColorStop(0, 'rgba(255,244,170,.88)');
      portal.addColorStop(.38, 'rgba(109,232,255,.62)');
      portal.addColorStop(1, 'rgba(109,232,255,0)');
      ctx.fillStyle = portal;
      ctx.beginPath();
      ctx.ellipse(0, 2, gateW * .8, gateH * .82, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Printed cardboard uprights, metal inner rail, and a top housing.
    const rail = ctx.createLinearGradient(-gateW, 0, gateW, 0);
    rail.addColorStop(0, '#26335f');
    rail.addColorStop(.5, '#6f83bb');
    rail.addColorStop(1, '#26335f');
    ctx.strokeStyle = '#141a39';
    ctx.lineWidth = 11;
    ctx.beginPath();
    ctx.moveTo(-gateW, gateH * .5);
    ctx.lineTo(-gateW, 0);
    ctx.bezierCurveTo(-gateW, -gateH * .72, gateW, -gateH * .72, gateW, 0);
    ctx.lineTo(gateW, gateH * .5);
    ctx.stroke();
    ctx.strokeStyle = rail;
    ctx.lineWidth = 7;
    ctx.stroke();
    ctx.strokeStyle = open ? '#fff1a3' : 'rgba(109,232,255,.52)';
    ctx.shadowColor = open ? '#ffcf4a' : '#6de8ff';
    ctx.shadowBlur = open ? 15 : 5;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.shadowBlur = 0;

    ctx.fillStyle = '#172044';
    ctx.strokeStyle = '#f0b74b';
    ctx.lineWidth = 2.5;
    roundRect(-gateW * .72, gateH * .38, gateW * 1.44, gateH * .27, 5);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = open ? '#fff1a3' : '#93dff0';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${clamp(gateW * .13, 8, 12)}px VCR, monospace`;
    ctx.fillText('COMET GATE', 0, gateH * .49);

    const nodeCount = currentBooth().goal;
    for (let i = 0; i < nodeCount; i += 1) {
      const angle = Math.PI + (i / Math.max(1, nodeCount - 1)) * Math.PI;
      const nodeX = Math.cos(angle) * gateW;
      const nodeY = Math.sin(angle) * gateH * .56;
      const lit = i < powered || open;
      ctx.fillStyle = '#10162f';
      ctx.strokeStyle = '#e4ad48';
      ctx.lineWidth = 2;
      circle(nodeX, nodeY, 7, true);
      ctx.fillStyle = lit ? '#fff1a3' : '#314064';
      ctx.shadowColor = lit ? '#ffcf4a' : 'transparent';
      ctx.shadowBlur = lit ? 10 : 0;
      circle(nodeX, nodeY, 3.4, false);
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawImageCover(image, w, h) {
    const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight);
    const sourceW = w / scale;
    const sourceH = h / scale;
    const sourceX = (image.naturalWidth - sourceW) * .5;
    const sourceY = (image.naturalHeight - sourceH) * .5;
    ctx.drawImage(image, sourceX, sourceY, sourceW, sourceH, 0, 0, w, h);
  }

  function drawSourceAlignedMask(image, w, h, topRatio, bottomRatio, filter) {
    const feather = .012;
    [
      [topRatio, .2],
      [topRatio + feather * .5, .46],
      [topRatio + feather, 1],
    ].forEach(pass => {
      const passTop = h * pass[0];
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, passTop, w, h * bottomRatio - passTop);
      ctx.clip();
      ctx.globalAlpha = pass[1];
      ctx.filter = filter;
      drawImageCover(image, w, h);
      ctx.restore();
    });
  }

  function drawDamScene(w, h) {
    const backdrop = typeof _getImg === 'function'
      ? _getImg('assets/mania/dam/dam-backdrop-v2.png')
      : null;
    if (backdrop?.complete && backdrop.naturalWidth) {
      ctx.save();
      // Hold the illustrated dam one value-step behind the live targets. The
      // scene stays colorful, but its brown/green midtones no longer swallow
      // the similarly colored beaver sprites.
      ctx.filter = 'saturate(.66) brightness(.86) contrast(.9)';
      drawImageCover(backdrop, w, h);
      ctx.restore();
      const glaze = ctx.createLinearGradient(0, 0, 0, h);
      glaze.addColorStop(0, 'rgba(19,45,43,.08)');
      glaze.addColorStop(.58, 'rgba(17,52,49,.1)');
      glaze.addColorStop(1, 'rgba(10,37,39,.16)');
      ctx.fillStyle = glaze;
      ctx.fillRect(0, 0, w, h);
      drawDamWater(w, h);
      return;
    }
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#dcebcf');
    sky.addColorStop(.48, '#91c9b5');
    sky.addColorStop(1, '#4ba8a4');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#786044';
    for (const y of [h * .34, h * .56, h * .75]) {
      ctx.fillRect(0, y, w, clamp(h * .07, 24, 54));
    }
    drawDamWater(w, h);
  }

  function drawDamWater(w, h) {
    ctx.save();
    ctx.globalAlpha = .26;
    ctx.strokeStyle = '#e9fff3';
    ctx.lineWidth = 2;
    const drift = mod(state.elapsed * 18, 64);
    for (const y of [h * .39, h * .61, h * .86]) {
      for (let x = -64 + drift; x < w + 64; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 16, y - 4, x + 32, y);
        ctx.quadraticCurveTo(x + 48, y + 4, x + 64, y);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawVolcanoScene(w, h) {
    const backdrop = typeof _getImg === 'function'
      ? _getImg('assets/mania/volcano/volcano-parade-backdrop-v1.png')
      : null;
    if (backdrop?.complete && backdrop.naturalWidth) {
      ctx.save();
      ctx.filter = 'saturate(.78) brightness(.92) contrast(.92)';
      drawImageCover(backdrop, w, h);
      ctx.restore();
      ctx.fillStyle = 'rgba(245,232,214,.07)';
      ctx.fillRect(0, 0, w, h);
      const glaze = ctx.createLinearGradient(0, 0, 0, h);
      glaze.addColorStop(0, 'rgba(31,8,52,.06)');
      glaze.addColorStop(.55, 'rgba(255,93,120,.025)');
      glaze.addColorStop(1, 'rgba(22,8,20,.18)');
      ctx.fillStyle = glaze;
      ctx.fillRect(0, 0, w, h);
      drawVolcanoParallax(w, h);
      return;
    }
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#341348');
    sky.addColorStop(.48, '#ad3d5d');
    sky.addColorStop(1, '#f58b57');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const cam = cameraX();
    ctx.fillStyle = 'rgba(255,210,129,.22)';
    for (let i = 0; i < 12; i += 1) {
      circle(mod(i * 131 - cam * .09, w + 80) - 40, h * (.08 + (i % 4) * .11), 3 + (i % 3) * 2, false);
    }
    ctx.fillStyle = '#352836';
    ctx.beginPath();
    ctx.moveTo(w * .08, h * .73);
    ctx.lineTo(w * .34, h * .38);
    ctx.lineTo(w * .44, h * .47);
    ctx.lineTo(w * .52, h * .31);
    ctx.lineTo(w * .62, h * .46);
    ctx.lineTo(w * .88, h * .73);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = state.bonusTriggered ? '#ffdf55' : '#ff5d4d';
    ctx.beginPath();
    ctx.moveTo(w * .44, h * .47);
    ctx.lineTo(w * .52, h * .31);
    ctx.lineTo(w * .62, h * .46);
    ctx.quadraticCurveTo(w * .53, h * .51, w * .44, h * .47);
    ctx.fill();
    ctx.fillStyle = '#25202b';
    ctx.fillRect(0, h * .73, w, h * .27);
    if (state.bonusTriggered) drawCompactVolcanoEruption(w * .52, h * .35, Math.min(w, h), state.elapsed % 1.2, .72);
  }

  function drawCompactVolcanoEruption(baseX, baseY, sceneSize, age, strength) {
    const progress = clamp(age / 1.2, 0, 1);
    const glowRadius = sceneSize * (.055 + progress * .035);
    ctx.save();
    ctx.globalAlpha *= strength * (1 - progress * .48);
    const glow = ctx.createRadialGradient(baseX, baseY, 0, baseX, baseY, glowRadius);
    glow.addColorStop(0, 'rgba(255,244,174,.95)');
    glow.addColorStop(.38, 'rgba(255,177,67,.72)');
    glow.addColorStop(1, 'rgba(255,93,77,0)');
    ctx.fillStyle = glow;
    circle(baseX, baseY, glowRadius, false);

    const colors = ['#fff0a4', '#ffcf4a', '#ff755d', '#ff5d9d'];
    for (let i = 0; i < 9; i += 1) {
      const spread = (i - 4) / 4;
      const drift = Math.sin(i * 2.17 + age * 3.2) * sceneSize * .008;
      const travel = sceneSize * (.025 + progress * (.08 + (i % 3) * .012));
      const x = baseX + spread * sceneSize * (.035 + progress * .06) + drift;
      const y = baseY - travel + Math.cos(i * 1.63) * sceneSize * .009;
      ctx.fillStyle = colors[i % colors.length];
      circle(x, y, sceneSize * (.006 + (i % 3) * .002) * (1 - progress * .35), false);
    }
    ctx.restore();
  }

  function drawVolcanoParallax(w, h) {
    const cam = cameraX();
    ctx.save();

    drawVolcanoObjective(w, h);

    // Quiet embers keep the stationary set alive without implying camera travel.
    for (let i = 0; i < 18; i += 1) {
      const x = mod(i * 97 - cam * .08, w + 120) - 60;
      const y = h * (.12 + ((i * 37) % 54) / 100);
      ctx.fillStyle = i % 3 ? 'rgba(255,163,92,.34)' : 'rgba(255,224,127,.5)';
      circle(x, y + Math.sin(state.elapsed * 1.7 + i) * 8, 1.5 + (i % 3), false);
    }

    if (state.eruptionAt) {
      const age = state.elapsed - state.eruptionAt;
      const strength = clamp(1 - age / 4.4, 0, 1);
      if (strength > 0) {
        drawCompactVolcanoEruption(w * .5, h * .37, Math.min(w, h), age, strength);
      }
    }
    ctx.restore();
  }

  function drawVolcanoObjective(w, h) {
    const panelW = Math.min(460, w * .88);
    const panelH = 58;
    const x = (w - panelW) / 2;
    const y = clamp(h * .025, 12, 24);
    const erupted = state.bonusTriggered;
    ctx.save();
    ctx.fillStyle = 'rgba(18,8,28,.84)';
    ctx.strokeStyle = erupted ? '#ffcf4a' : '#6de8ff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = erupted ? '#ff755d' : '#6de8ff';
    ctx.shadowBlur = 13;
    roundRect(x, y, panelW, panelH, 11);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff4d5';
    ctx.font = `${clamp(w * .024, 10, 15)}px "VCR", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      erupted ? 'VOLCANO ERUPTED · BONUS BALLOONS!' : `CLEAR COMETS · WAVE ${Math.min(3, state.special + 1)}/3`,
      w * .5,
      y + 17
    );
    drawVolcanoStageLights(w, h, y + 40);
    ctx.restore();
  }

  function drawVolcanoStageLights(w, h, y = h * .69) {
    ctx.save();
    const gap = clamp(w * .05, 30, 48);
    for (let i = 0; i < 3; i += 1) {
      const x = w * .5 + (i - 1) * gap;
      const lit = i < state.special;
      ctx.fillStyle = 'rgba(23,10,20,.55)';
      ctx.strokeStyle = lit ? '#fff1a3' : '#6de8ff';
      ctx.lineWidth = 2;
      circle(x, y, 10, true);
      ctx.fillStyle = lit ? '#ffcf4a' : '#4f2735';
      ctx.shadowColor = lit ? '#ff785d' : 'transparent';
      ctx.shadowBlur = lit ? 16 : 0;
      circle(x, y, lit ? 6 : 4, false);
      if (lit) {
        ctx.fillStyle = '#fff1a3';
        triangle(x - 4, y + 1, x + 4, y + 1, x, y - 9, false);
      }
    }
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawFinaleScene(w, h) {
    const backdrop = typeof _getImg === 'function'
      ? _getImg('assets/mania/finale/finale-backdrop-v1.png')
      : null;
    if (backdrop?.complete && backdrop.naturalWidth) {
      ctx.save();
      ctx.filter = 'saturate(.6) brightness(.9) contrast(.88)';
      drawImageCover(backdrop, w, h);
      ctx.restore();
      ctx.fillStyle = 'rgba(238,232,218,.055)';
      ctx.fillRect(0, 0, w, h);
      const glaze = ctx.createLinearGradient(0, 0, 0, h);
      glaze.addColorStop(0, 'rgba(14,5,34,.04)');
      glaze.addColorStop(.62, 'rgba(78,28,98,.02)');
      glaze.addColorStop(1, 'rgba(10,4,24,.18)');
      ctx.fillStyle = glaze;
      ctx.fillRect(0, 0, w, h);
      drawFinaleMotion(w, h);
      return;
    }
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#09051c');
    grad.addColorStop(.54, '#251050');
    grad.addColorStop(1, '#090612');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,244,213,.22)';
    for (let i = 0; i < 42; i += 1) {
      circle(mod(i * 83, w), mod(i * 47, h * .72), 1 + (i % 3) * .45, false);
    }
    ctx.fillStyle = 'rgba(8,4,20,.55)';
    ctx.fillRect(0, h * .88, w, h * .12);
    drawFinaleMotion(w, h);
  }

  function drawFinaleMotion(w, h) {
    const phase = Math.min(2, Math.floor(state.elapsed / FINALE_PHASE_SECONDS));
    const directionColor = ['#b991ff', '#6de8ff', '#ffcf4a'][phase];
    ctx.save();

    // The final choice phase gets a warm theatrical center spotlight.
    if (state.elapsed >= FINALE_PHASE_SECONDS * 2) {
      const pulse = .12 + Math.abs(Math.sin(state.elapsed * 3.2)) * .09;
      const spot = ctx.createRadialGradient(w * .5, h * .46, 10, w * .5, h * .46, Math.min(w, h) * .33);
      spot.addColorStop(0, `rgba(255,220,116,${pulse})`);
      spot.addColorStop(1, 'rgba(255,207,74,0)');
      ctx.fillStyle = spot;
      ctx.fillRect(0, 0, w, h);
    }

    const phaseTitles = ['OPEN & CLEAR', 'PRECISION SCROLL', 'CLEAR → RAPID FIRE'];
    ctx.globalAlpha = .92;
    ctx.fillStyle = 'rgba(8,4,24,.72)';
    ctx.strokeStyle = directionColor;
    ctx.lineWidth = 2;
    roundRect(w * .5 - Math.min(150, w * .31), h * .075, Math.min(300, w * .62), 34, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#fff4d5';
    ctx.font = `${clamp(w * .026, 12, 18)}px "VCR", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${phase + 1}/3  ${phaseTitles[phase]}`, w * .5, h * .075 + 17);
    ctx.restore();
  }

  function drawFields(w, h) {
    const ground = h * .62;
    const field = ctx.createLinearGradient(0, ground, 0, h);
    field.addColorStop(0, '#78ae44');
    field.addColorStop(1, '#315b2c');
    ctx.fillStyle = field;
    ctx.fillRect(0, ground, w, h - ground);

    const cam = cameraX();
    ctx.lineWidth = 2;
    ctx.globalAlpha = .22;
    for (let i = 0; i < 11; i += 1) {
      const y = ground + (i / 10) ** 1.6 * (h - ground);
      ctx.strokeStyle = i % 2 ? '#f6d66c' : '#173f24';
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    for (let i = -2; i < 15; i += 1) {
      const x = mod(i * 110 - cam * .9, w + 220) - 110;
      ctx.strokeStyle = '#e5cf7b';
      ctx.beginPath();
      ctx.moveTo(w * .5, ground);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawFarmLayerMask(w, h, topRatio, bottomRatio) {
    const backdrop = typeof _getImg === 'function'
      ? _getImg('assets/mania/farm/farm-backdrop-v1.png')
      : null;
    if (!backdrop?.complete || !backdrop.naturalWidth) return;
    const filter = 'saturate(.66) brightness(.92) contrast(.9)';
    drawSourceAlignedMask(backdrop, w, h, topRatio, bottomRatio, filter);
  }

  function drawTree(x, y, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    ctx.fillStyle = '#6c421f';
    roundRect(-10, -12, 20, 75, 5);
    ctx.fill();
    ctx.fillStyle = '#39783a';
    for (const p of [[-22,-35,35],[13,-44,38],[38,-20,30],[0,-8,42]]) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], p[2], 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function barnGeometry(x, groundRatio = .65) {
    const h = state.height;
    const w = state.width;
    const scale = clamp(Math.min(w, h) / 560, .62, 1.15);
    return {
      x,
      groundY: h * groundRatio,
      w: 155 * scale,
      h: 120 * scale,
      scale,
    };
  }

  function drawBarn(barn) {
    const g = Number.isFinite(barn.anchorX)
      ? barnGeometry(state.width * barn.anchorX, barn.groundY)
      : barnGeometry(barn.worldX - cameraX());
    if (g.x < -g.w || g.x > state.width + g.w) return;
    ctx.save();
    ctx.translate(g.x, g.groundY);
    ctx.scale(g.scale, g.scale);

    const barnImage = typeof _getImg === 'function'
      ? _getImg('assets/mania/farm/barn-v1.png')
      : null;
    if (barnImage?.complete && barnImage.naturalWidth) {
      ctx.fillStyle = 'rgba(35,25,16,.25)';
      ctx.beginPath();
      ctx.ellipse(0, 5, 91, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(barnImage, -90, -143, 180, 143);
      drawBarnProgress();
      ctx.restore();
      return;
    }

    ctx.fillStyle = 'rgba(35,25,16,.22)';
    ctx.beginPath();
    ctx.ellipse(0, 8, 96, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.red;
    ctx.strokeStyle = '#68242a';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-76, 0);
    ctx.lineTo(-76, -84);
    ctx.lineTo(0, -126);
    ctx.lineTo(76, -84);
    ctx.lineTo(76, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#e9d4aa';
    ctx.lineWidth = 8;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(-84, -82);
    ctx.lineTo(0, -133);
    ctx.lineTo(84, -82);
    ctx.stroke();

    ctx.fillStyle = '#251817';
    ctx.fillRect(-27, -62, 54, 62);
    ctx.strokeStyle = '#ead5aa';
    ctx.lineWidth = 5;
    ctx.strokeRect(-27, -62, 54, 62);
    ctx.beginPath();
    ctx.moveTo(-27, -62);
    ctx.lineTo(27, 0);
    ctx.moveTo(27, -62);
    ctx.lineTo(-27, 0);
    ctx.stroke();

    ctx.fillStyle = '#f0d9a6';
    ctx.beginPath();
    ctx.arc(0, -94, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = state.barnBonusActive ? '#ffcf4a' : '#6c352a';
    starPath(0, -94, 7, 3.2, 5);
    ctx.fill();
    drawBarnProgress();
    ctx.restore();
  }

  function drawBarnProgress() {
    ctx.save();
    ctx.translate(0, -118);
    ctx.fillStyle = 'rgba(25,15,13,.86)';
    ctx.strokeStyle = state.barnBonusActive ? '#fff1a3' : '#e9d4aa';
    ctx.lineWidth = 2;
    roundRect(-38, -13, 76, 25, 7);
    ctx.fill();
    ctx.stroke();
    for (let i = 0; i < 3; i += 1) {
      ctx.fillStyle = i < state.barnHits ? '#ffcf4a' : '#4b352e';
      ctx.strokeStyle = '#fff1c2';
      circle(-20 + i * 20, 0, 6, true);
    }
    ctx.restore();
  }

  function drawForeground(w, h) {
    ctx.fillStyle = 'rgba(37,74,34,.62)';
    const cam = cameraX();
    for (let i = -1; i < Math.ceil(w / 44) + 2; i += 1) {
      const x = i * 44 - mod(cam * 1.18, 44);
      const blade = 8 + (i % 4) * 3;
      ctx.beginPath();
      ctx.moveTo(x - 24, h);
      ctx.quadraticCurveTo(x - 8, h - blade * 2, x, h - blade);
      ctx.quadraticCurveTo(x + 15, h - blade * 2.4, x + 25, h);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawTarget(target, pos, now) {
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.scale(pos.scale, pos.scale);
    ctx.globalAlpha *= pos.visibility;
    const mirrorTarget = target.kind === 'dinosaur'
      ? target.direction === 'left'
      : target.direction === 'right';
    if (mirrorTarget) ctx.scale(-1, 1);

    if (target.hiddenMobe) {
      drawHiddenMoberino(target, now);
      ctx.restore();
      return;
    }
    if (target.kind === 'dinosaur') {
      drawDinosaurTarget(target, now);
    } else if (['farmPop', 'farmSlide', 'farmHill', 'farmBarnDoor', 'farmBarnBonus', 'runner', 'peek'].includes(target.kind)) {
      ctx.fillStyle = 'rgba(35,25,16,.25)';
      ctx.beginPath();
      ctx.ellipse(0, 30, 38, 9, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (target.golden) {
      const glow = ctx.createRadialGradient(0, 0, 5, 0, 0, 58);
      glow.addColorStop(0, 'rgba(255,230,104,.5)');
      glow.addColorStop(1, 'rgba(255,207,74,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(0, 0, 58, 0, Math.PI * 2);
      ctx.fill();
    }

    const bob = target.kind === 'damBeaver' ||
      target.kind === 'damBank' ||
      target.kind === 'goldBeaver' ||
      target.kind === 'orbitBoss'
      ? 0
      : Math.sin((now + target.at * 1000) / 115) * 1.6;
    ctx.translate(0, bob);
    if (['farmPop', 'farmSlide', 'farmHill', 'farmBarnDoor', 'farmBarnBonus', 'runner', 'peek'].includes(target.kind)) {
      const animalKind = target.kind === 'farmBarnDoor' || target.kind === 'farmBarnBonus' ? 'peek' : target.kind;
      if (target.kind === 'farmHill') {
        const spellSeed = target.branch || target.wave || 0;
        drawEnchantedFarmDust(target, now);
        ctx.rotate(mod(now / 1050 + spellSeed * .37, Math.PI * 2));
      }
      drawAnimal(target.type, !!target.golden, animalKind);
    }
    else if (target.kind === 'flyer') drawBird(target.type, !!target.golden, now);
    else if (target.kind === 'ringPost') drawRingPost(target);
    else if (target.kind === 'phaseFlyer') {
      drawAlienLaunchExhaust(target);
      drawMoonMobe(target);
    }
    else if (target.kind === 'orbitBoss') drawOrbitBoss(target);
    else if (target.kind === 'damBeaver') drawDamBeaver(target, pos, now);
    else if (target.kind === 'damBank' || target.kind === 'goldBeaver' || target.kind === 'beaverRunner') {
      if (target.kind === 'beaverRunner') drawBeaverTarget(target, false);
      else drawBankBeaver(target, pos);
    }
    else if (target.kind === 'beaverPeek') drawEdgeBeaver(target);
    else if (target.kind === 'plateRack') drawPlateRackTarget(target);
    else if (target.kind === 'platePop' || target.kind === 'plateFlyby') drawHighPlateTarget(target);
    else if (target.kind === 'plate') drawPlate(target);
    else if (target.kind === 'balloonTree' || target.kind === 'lavaBalloon' || target.kind === 'volcanoDecoy' || target.kind === 'dinoBalloon') drawBalloonTarget(target);
    else if (target.kind === 'volcanoComet') drawVolcanoComet(target, now);
    else if (target.kind === 'finaleBat') drawFinaleBonusBat(target, now);
    else if (target.kind === 'revealPanel') drawFinalePanel(target);
    else if (target.kind === 'finalePopup') drawFinalePopup(target);
    else if (target.kind === 'finaleGate') drawFinalePopup(target);
    else if (target.kind === 'rapidTarget') drawNeonTarget(target);
    else if (target.kind === 'jackpot') drawNeonTarget(target);
    if (!isFarmScoreTarget(target)) drawPointValue(target);
    ctx.restore();
  }

  function drawPointValue(target) {
    // Secrets stay secret, and finale pop-ups already carry a large integrated
    // value plate. Every other hittable target shows its base point value.
    if (
      target.hiddenMobe ||
      (target.hit && !target.repeatable) ||
      target.kind === 'finaleBat' ||
      target.kind === 'finalePopup' ||
      target.kind === 'finaleGate' ||
      target.kind === 'orbitBoss' ||
      (target.kind === 'damBeaver' && target.visualOpen < .72) ||
      ((target.kind === 'damBank' || target.kind === 'goldBeaver') && target.hit) ||
      (target.kind === 'beaverPeek' && target.visualReveal < .62) ||
      !Number.isFinite(target.base)
    ) return;
    const balloon = ['balloonTree', 'lavaBalloon', 'volcanoDecoy'].includes(target.kind);
    const dinosaurBadge = target.kind === 'dinosaur' || target.kind === 'dinoBalloon';
    const farmBadge = ['farmPop', 'farmSlide', 'farmHill', 'farmBarnDoor', 'farmBarnBonus'].includes(target.kind);
    const animalScoreBadge = farmBadge || ['damBeaver', 'damBank', 'goldBeaver', 'beaverRunner', 'beaverPeek'].includes(target.kind);
    const positions = {
      farmPop: -50,
      farmSlide: -50,
      farmHill: -54,
      farmBarnDoor: -47,
      farmBarnBonus: -52,
      runner: 28,
      peek: 28,
      flyer: 27,
      ringPost: 37,
      phaseFlyer: 35,
      orbiter: 35,
      damBeaver: 47,
      damBank: -58,
      goldBeaver: -58,
      beaverRunner: -66,
      beaverPeek: 36,
      plateRack: 34,
      platePop: 35,
      plateFlyby: 35,
      plate: 35,
      volcanoComet: 25,
      dinosaur: -34,
      revealPanel: 58,
      rapidTarget: 58,
      jackpot: 48,
    };
    const y = target.kind === 'dinoBalloon' ? -2 : balloon ? -2 : (positions[target.kind] ?? 34);
    const label = Math.round(target.base).toLocaleString('en-US');
    const badgeW = dinosaurBadge
      ? clamp(42 + label.length * 11, 72, 96)
      : animalScoreBadge
      ? clamp(30 + label.length * 9, 52, 76)
      : clamp(22 + label.length * 7, 42, 68);
    const badgeH = dinosaurBadge ? 34 : animalScoreBadge ? 27 : 21;
    const accent = target.stageTarget
      ? '#6de8ff'
      : target.gold || target.golden
        ? '#ffcf4a'
        : targetColor(target);
    ctx.save();
    const undoMirror = target.kind === 'dinosaur'
      ? target.direction === 'left'
      : target.direction === 'right';
    if (undoMirror) ctx.scale(-1, 1);
    ctx.translate(0, y);
    if (target.kind === 'farmHill') ctx.scale(1.7, 1.7);
    if (target.kind === 'damBeaver' && target.tier === 2) ctx.scale(1.42, 1.42);
    else if (target.kind === 'damBeaver' && target.tier === 1) ctx.scale(1.16, 1.16);
    if (farmBadge) {
      ctx.strokeStyle = '#e5b35d';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(0, badgeH / 2 - 1);
      ctx.lineTo(0, badgeH / 2 + 12);
      ctx.stroke();
      ctx.fillStyle = '#ffcf4a';
      circle(0, badgeH / 2 + 12, 2.5, false);
    }
    ctx.fillStyle = 'rgba(8,8,20,.9)';
    ctx.strokeStyle = accent;
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0,0,0,.75)';
    ctx.shadowBlur = 5;
    roundRect(-badgeW / 2, -badgeH / 2, badgeW, badgeH, 6);
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fff4d5';
    ctx.font = dinosaurBadge
      ? '800 22px Arial, sans-serif'
      : animalScoreBadge
        ? '700 16px Arial, sans-serif'
        : '12px "VCR", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, 0, 1);
    ctx.restore();
  }

  function drawRingPost(target) {
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,20,.4)';
    ctx.beginPath();
    ctx.ellipse(3, 45, 51, 13, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#161b39';
    ctx.lineWidth = 5;
    const baseGradient = ctx.createLinearGradient(0, 14, 0, 52);
    baseGradient.addColorStop(0, '#7184bd');
    baseGradient.addColorStop(.38, '#405184');
    baseGradient.addColorStop(1, '#1d284f');
    ctx.fillStyle = baseGradient;
    ctx.beginPath();
    ctx.ellipse(0, 36, 48, 18, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#172044';
    ctx.beginPath();
    ctx.ellipse(0, 29, 29, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f2b94e';
    circle(-34, 37, 3.2, true);
    circle(34, 37, 3.2, true);
    ctx.strokeStyle = 'rgba(212,237,255,.48)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(-3, 32, 38, 3.35, 5.9);
    ctx.stroke();

    drawMoonMobe(target);

    for (let i = 0; i < target.requiredRings; i += 1) {
      const y = 40 - i * 7;
      ctx.strokeStyle = i < target.rings ? '#fff1a3' : 'rgba(145,233,255,.25)';
      ctx.shadowColor = i < target.rings ? '#ffcf4a' : 'transparent';
      ctx.shadowBlur = i < target.rings ? 9 : 0;
      ctx.lineWidth = i < target.rings ? 6 : 3;
      ctx.beginPath();
      ctx.ellipse(0, y, 24, 8, -.08, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;

    if (target.completed) {
      const timeLeft = Math.max(0, target.frozenUntil - state.elapsed);
      ctx.fillStyle = 'rgba(10,19,54,.88)';
      ctx.strokeStyle = '#fff1a3';
      ctx.lineWidth = 2;
      roundRect(-34, 50, 68, 10, 4);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6de8ff';
      roundRect(-31, 53, 62 * clamp(timeLeft / target.freezeWindow, 0, 1), 4, 2);
      ctx.fill();
      ctx.fillStyle = '#dffaff';
      ctx.font = '8px VCR, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('FROZEN', 0, 68);
    }
    ctx.restore();
  }

  function drawPlateRackTarget(target) {
    ctx.strokeStyle = '#263640';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-38, 35);
    ctx.lineTo(-30, -1);
    ctx.lineTo(30, -1);
    ctx.lineTo(38, 35);
    ctx.moveTo(-44, 35);
    ctx.lineTo(44, 35);
    ctx.stroke();
    drawPlate(target);
  }

  function beaverSprite(target) {
    const name = target.type === 'expert'
      ? 'beaver-expert-target-v1.png'
      : target.type === 'foreman'
        ? 'beaver-foreman-target-v1.png'
        : 'beaver-standard-target-v1.png';
    return typeof _getImg === 'function' ? _getImg(`assets/mania/dam/${name}`) : null;
  }

  function drawBeaverTarget(target, headOnly = false) {
    const sprite = beaverSprite(target);
    if (sprite?.complete && sprite.naturalWidth) {
      ctx.save();
      ctx.filter = target.golden
        ? 'sepia(.38) brightness(1.28) saturate(1.45) contrast(1.08)'
        : 'brightness(1.12) saturate(1.08) contrast(1.06)';
      ctx.shadowColor = target.golden ? 'rgba(255,207,74,.92)' : 'rgba(255,236,186,.55)';
      ctx.shadowBlur = target.golden ? 18 : 8;
      if (headOnly) {
        const sx = sprite.naturalWidth * .17;
        const sy = sprite.naturalHeight * .02;
        const sw = sprite.naturalWidth * .66;
        const sh = sprite.naturalHeight * (target.type === 'expert' ? .49 : .61);
        ctx.drawImage(sprite, sx, sy, sw, sh, -48, -48, 96, 88);
        ctx.restore();
        return;
      }
      const boxW = target.type === 'expert' ? 88 : 112;
      const boxH = 112;
      const ratio = sprite.naturalWidth / sprite.naturalHeight;
      const drawW = Math.min(boxW, boxH * ratio);
      const drawH = drawW / ratio;
      ctx.drawImage(sprite, -drawW / 2, -drawH * .5, drawW, drawH);
      ctx.restore();
      return;
    }

    ctx.fillStyle = target.type === 'expert' ? '#d69a32' : '#8a4f2b';
    ctx.strokeStyle = '#261d1a';
    ctx.lineWidth = 3;
    circle(0, -4, 35, true);
    ctx.fillStyle = '#d9ad76';
    ellipse(0, 8, 22, 16, true);
    ctx.fillStyle = '#fff1ce';
    roundRect(-9, 15, 8, 15, 2); ctx.fill(); ctx.stroke();
    roundRect(1, 15, 8, 15, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#211c18';
    circle(-12, -10, 3, false);
    circle(12, -10, 3, false);
  }

  function drawBankBeaver(target, pos) {
    drawBeaverTarget(target, false);
  }

  function drawDamForegroundWaterMask(backdrop, w, h) {
    const waterline = h * .585;
    const amplitude = clamp(h * .008, 3, 7);
    const segment = clamp(w * .11, 42, 68);
    const drift = mod(state.elapsed * 9, segment);

    function traceWaterline(closeShape) {
      ctx.beginPath();
      ctx.moveTo(-segment + drift, waterline);
      for (let x = -segment + drift; x < w + segment; x += segment) {
        ctx.quadraticCurveTo(
          x + segment * .25,
          waterline - amplitude,
          x + segment * .5,
          waterline
        );
        ctx.quadraticCurveTo(
          x + segment * .75,
          waterline + amplitude,
          x + segment,
          waterline
        );
      }
      if (closeShape) {
        ctx.lineTo(w + segment, h * .715);
        ctx.lineTo(-segment, h * .715);
        ctx.closePath();
      }
    }

    ctx.save();
    traceWaterline(true);
    ctx.clip();
    ctx.filter = 'saturate(.66) brightness(.86) contrast(.9)';
    drawImageCover(backdrop, w, h);
    ctx.restore();

    ctx.save();
    traceWaterline(false);
    ctx.strokeStyle = 'rgba(231,255,245,.52)';
    ctx.lineWidth = clamp(w * .004, 1.5, 3);
    ctx.stroke();
    ctx.restore();
  }

  function drawDamMiddleRailMask(w, h) {
    const backdrop = typeof _getImg === 'function'
      ? _getImg('assets/mania/dam/dam-backdrop-v2.png')
      : null;
    if (!backdrop?.complete || !backdrop.naturalWidth) return;

    // Repaint the exact authored foreground water over the beavers, using a
    // moving wave boundary instead of a flat rectangular crop.
    drawDamForegroundWaterMask(backdrop, w, h);

    const activeBank = state.damGoldActive
      ? state.targets.filter(target => target.kind === 'goldBeaver')
      : state.targets.filter(target =>
        target.kind === 'damBank' && target.bankWave === state.damBankWave
      );
    const indicatorY = h * .58;
    for (const anchorX of [.14, .32, .5, .68, .86]) {
      const target = activeBank.find(item => Math.abs(item.anchorX - anchorX) < .01);
      const cleared = !!target?.hit;
      const active = !!target && !target.hit && state.elapsed >= target.at;
      ctx.save();
      ctx.translate(w * anchorX, indicatorY);
      ctx.shadowColor = active ? '#ffcf4a' : 'transparent';
      ctx.shadowBlur = active ? 12 : 0;
      ctx.fillStyle = cleared ? '#202829' : active ? '#ffcf4a' : '#59615a';
      ctx.strokeStyle = cleared ? '#87918a' : '#fff0c2';
      ctx.lineWidth = 2;
      circle(0, 0, clamp(w * .009, 5, 9), true);
      if (cleared) {
        ctx.strokeStyle = '#9ba39d';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-4, -4); ctx.lineTo(4, 4);
        ctx.moveTo(4, -4); ctx.lineTo(-4, 4);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawDamBeaver(target, pos, now) {
    const open = pos.openAmount || 0;
    const coverY = (pos.coverY || pos.y + 28) - pos.y;
    const tierColors = ['#76d9a6', '#f2b94e', '#e76791'];
    const accent = tierColors[target.tier] || tierColors[0];
    ctx.save();
    if (pos.hittable) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(-72, -104, 144, coverY + 108);
      ctx.clip();
      ctx.globalAlpha *= clamp(open * 1.65, 0, 1);
      if (target.tier === 2) ctx.translate(0, -15);
      drawBeaverTarget(target, false);
      ctx.restore();
    }

    // Each depth tier uses a quiet physical hiding edge instead of a door:
    // foreground logs, a lodge opening, or a foamy spillway lip.
    ctx.save();
    ctx.translate(0, coverY);
    if (target.tier === 0) {
      ctx.fillStyle = '#755238';
      ctx.strokeStyle = '#3c2b23';
      ctx.lineWidth = 3;
      for (const log of [[-54,-1,108,18],[-48,13,96,17]]) {
        roundRect(log[0], log[1], log[2], log[3], 9);
        ctx.fill(); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(242,210,151,.32)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-42, 6); ctx.lineTo(38, 6); ctx.stroke();
    } else if (target.tier === 1) {
      ctx.fillStyle = '#32291f';
      ctx.strokeStyle = '#8a633e';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(0, 9, 46, Math.PI, 0);
      ctx.lineTo(46, 24);
      ctx.lineTo(-46, 24);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#c49b60';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 9, 35, Math.PI, 0); ctx.stroke();
    } else {
      ctx.fillStyle = '#7e7669';
      ctx.strokeStyle = '#433f39';
      ctx.lineWidth = 3;
      for (const rock of [[-43,5,23],[-18,1,25],[9,3,27],[37,7,21]]) {
        ctx.beginPath();
        ctx.ellipse(rock[0], rock[1], rock[2], 13, 0, 0, Math.PI * 2);
        ctx.fill(); ctx.stroke();
      }
      ctx.strokeStyle = '#efffe9';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-53, 16);
      ctx.quadraticCurveTo(-28, 8, -6, 16);
      ctx.quadraticCurveTo(20, 23, 52, 14);
      ctx.stroke();
    }
    ctx.fillStyle = target.spent ? '#576761' : accent;
    ctx.strokeStyle = '#fff0c9';
    ctx.lineWidth = 2;
    circle(0, target.tier === 1 ? 25 : 22, 4.5, true);
    if (target.popWarning) {
      ctx.fillStyle = Math.floor(now / 120) % 2 ? '#fff7d8' : accent;
      ctx.shadowColor = accent;
      ctx.shadowBlur = 12;
      circle(-13, -8, 4, true);
      circle(10, -15, 5, true);
      circle(20, -28, 3, true);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawDamGoldProgress(w, h) {
    const compact = w <= 520;
    const centerX = w * .5;
    const y = clamp(h * .095, 38, 70);
    const gap = compact ? 28 : 34;
    const startX = centerX - gap * 2.05;
    const pulseAge = state.damProgressPulseAt
      ? state.elapsed - state.damProgressPulseAt
      : 9;
    ctx.save();
    ctx.globalAlpha = .96;
    ctx.fillStyle = 'rgba(13,18,20,.76)';
    ctx.strokeStyle = 'rgba(255,240,194,.42)';
    ctx.lineWidth = 2;
    roundRect(startX - 22, y - 18, gap * 4.4, 38, 16);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255,207,74,.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(startX, y);
    ctx.lineTo(startX + gap * 3.15, y);
    ctx.stroke();

    for (let index = 0; index < 3; index += 1) {
      const lit = index < state.special;
      const justLit = lit && index === state.special - 1 && pulseAge < .5;
      const radius = 9 + (justLit ? (1 - pulseAge / .5) * 4 : 0);
      ctx.shadowColor = lit ? '#ffcf4a' : 'transparent';
      ctx.shadowBlur = lit ? 14 : 0;
      ctx.fillStyle = lit ? '#ffcf4a' : '#30383a';
      ctx.strokeStyle = lit ? '#fff1a3' : '#778080';
      ctx.lineWidth = 2.5;
      circle(startX + index * gap, y, radius, true);
    }
    ctx.shadowBlur = 0;

    ctx.fillStyle = state.damGoldActive ? '#ffcf4a' : 'rgba(255,207,74,.48)';
    triangle(startX + gap * 2.55, y - 7, startX + gap * 2.9, y, startX + gap * 2.55, y + 7, true);

    ctx.save();
    ctx.translate(startX + gap * 3.55, y - 1);
    ctx.scale(.32, .32);
    ctx.globalAlpha = state.special >= 3 ? 1 : .48;
    drawBeaverTarget({ type: 'expert', golden: state.special >= 3 }, true);
    ctx.restore();
    ctx.restore();
  }

  function drawEdgeBeaver(target) {
    ctx.save();
    ctx.rotate(target.side === 'left' ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = 'rgba(20,54,53,.26)';
    ctx.beginPath();
    ctx.ellipse(0, 36, 42, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    drawBeaverTarget(target, true);
    ctx.fillStyle = '#765238';
    ctx.strokeStyle = '#3d2d25';
    ctx.lineWidth = 3;
    roundRect(-48, 30, 96, 18, 9);
    ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#6f9252';
    ctx.lineWidth = 4;
    for (const x of [-33, -18, 26, 39]) {
      ctx.beginPath(); ctx.moveTo(x, 43); ctx.quadraticCurveTo(x + 7, 6, x + 3, -12); ctx.stroke();
    }
    ctx.restore();
  }

  function drawAlienLaunchExhaust(target) {
    const blast = target.blastProgress || 0;
    if (blast <= 0) return;
    ctx.save();
    ctx.globalAlpha = clamp(blast * 1.5, 0, .9);
    const plume = ctx.createLinearGradient(0, 28, 0, 92);
    plume.addColorStop(0, '#fff4b0');
    plume.addColorStop(.35, '#6de8ff');
    plume.addColorStop(1, 'rgba(109,232,255,0)');
    ctx.fillStyle = plume;
    ctx.beginPath();
    ctx.moveTo(-15, 27);
    ctx.quadraticCurveTo(-20, 58 + blast * 18, 0, 90 + blast * 28);
    ctx.quadraticCurveTo(20, 58 + blast * 18, 15, 27);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawHighPlateTarget(target) {
    ctx.save();
    if (target.kind === 'plateFlyby') {
      ctx.strokeStyle = '#263640';
      ctx.fillStyle = '#5a7780';
      ctx.lineWidth = 3;
      roundRect(-63, -16, 45, 18, 7); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#ff8c68';
      triangle(-44, -15, -29, -34, -24, -14, true);
      ctx.strokeStyle = '#d9f1e8';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-55, -22); ctx.lineTo(-55, -38); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(-55, -40, 25, 5, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = '#263640';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-18, -7); ctx.lineTo(-4, -1); ctx.stroke();
    } else {
      ctx.strokeStyle = '#d9f1e8';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 30);
      for (let y = 25; y >= -4; y -= 8) {
        ctx.lineTo(y % 16 ? -12 : 12, y);
      }
      ctx.stroke();
    }
    drawPlate(target);
    ctx.restore();
  }

  function drawHiddenMoberino(target, now) {
    const peek = Math.sin(now / 260 + target.variant * 1.7) * 2;
    ctx.translate(0, peek);
    const characterSrc = target.hit
      ? target.character?.imgWhack || target.character?.img
      : target.character?.img;
    const characterImage = characterSrc && typeof _getImg === 'function' ? _getImg(characterSrc) : null;
    if (characterImage?.complete && characterImage.naturalWidth) {
      const size = 88;
      const drawX = -size / 2;
      const drawY = -58;
      // A tight silhouette trim keeps the collectible legible without adding
      // a separate badge or sticker shape behind the character.
      ctx.save();
      ctx.filter = 'brightness(0) invert(1)';
      const trim = target.hit ? 4.6 : 3.8;
      for (let index = 0; index < 16; index += 1) {
        const angle = index * Math.PI / 8;
        ctx.drawImage(
          characterImage,
          drawX + Math.cos(angle) * trim,
          drawY + Math.sin(angle) * trim,
          size,
          size
        );
      }
      ctx.restore();
      ctx.drawImage(characterImage, -size / 2, -58, size, size);
      ctx.save();
      ctx.globalAlpha *= .34;
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = `hue-rotate(${Math.round(now / 11 + target.variant * 80)}deg) saturate(2.8) brightness(1.2)`;
      ctx.drawImage(characterImage, drawX, drawY, size, size);
      ctx.restore();
      ctx.save();
      const sheenX = lerp(drawX - size * .25, drawX + size * 1.15, mod(now / 1450 + target.variant * .31, 1));
      ctx.beginPath();
      ctx.moveTo(sheenX - 13, drawY);
      ctx.lineTo(sheenX + 6, drawY);
      ctx.lineTo(sheenX - 18, drawY + size);
      ctx.lineTo(sheenX - 37, drawY + size);
      ctx.closePath();
      ctx.clip();
      ctx.globalAlpha *= .52;
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = `hue-rotate(${Math.round(now / 9)}deg) brightness(1.85) saturate(1.75)`;
      ctx.drawImage(characterImage, drawX, drawY, size, size);
      ctx.restore();
      drawHiddenMobeGlint(now, target.variant);
      return;
    }

    // Keep the cameo fully visible. Its tucked-away placement supplies the
    // discovery challenge without scenery obscuring the character art.
    ctx.strokeStyle = '#261f2b';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -31);
    ctx.quadraticCurveTo(target.variant ? 10 : -10, -46, target.variant ? 17 : -17, -50);
    ctx.stroke();
    ctx.fillStyle = currentBooth().accent;
    circle(target.variant ? 18 : -18, -51, 5, true);

    ctx.fillStyle = target.variant ? '#f7d6ff' : '#d6f7ef';
    ctx.strokeStyle = '#261f2b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(0, -7, 27, 31, target.variant ? .08 : -.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#261f2b';
    circle(-9, -11, 3, false);
    circle(9, -11, 3, false);
    ctx.strokeStyle = '#261f2b';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, -4, 9, .2, Math.PI - .2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.58)';
    ellipse(-9, -21, 6, 9, false);
    drawHiddenMobeGlint(now, target.variant);

  }

  function drawHiddenMobeGlint(now, variant = 0) {
    const cycle = mod(now / 1800 + variant * .37, 1);
    if (cycle > .16) return;
    const phase = cycle / .16;
    const pulse = Math.sin(phase * Math.PI);
    const x = lerp(-25, 24, phase);
    const y = lerp(12, -47, phase);
    const r = 4 + pulse * 3;
    ctx.save();
    ctx.globalAlpha *= pulse;
    ctx.fillStyle = '#fff';
    ctx.translate(x, y);
    ctx.rotate(now / 900);
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.quadraticCurveTo(r * .16, -r * .16, r, 0);
    ctx.quadraticCurveTo(r * .16, r * .16, 0, r);
    ctx.quadraticCurveTo(-r * .16, r * .16, -r, 0);
    ctx.quadraticCurveTo(-r * .16, -r * .16, 0, -r);
    ctx.fill();
    ctx.restore();
  }

function drawEnchantedFarmDust(target, now) {
  const spellSeed = target.branch || target.wave || 0;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (let index = 0; index < 14; index += 1) {
    const phase = now / 720 + index * .88 + spellSeed * .31;
      const orbitX = Math.sin(phase * 1.13) * (30 + index % 4 * 7);
      const orbitY = Math.cos(phase * .91) * (20 + index % 3 * 6);
      const shimmer = .28 + (Math.sin(phase * 2.7) + 1) * .24;
      ctx.globalAlpha = shimmer;
      ctx.fillStyle = index % 3 === 0 ? '#dffaff' : index % 2 ? '#ffcf4a' : '#f6d8ff';
      circle(orbitX, orbitY, index % 4 === 0 ? 2.2 : 1.25, false);
    }
    ctx.restore();
  }

  function drawHiddenCover(cover) {
    ctx.strokeStyle = '#261f2b';
    ctx.lineWidth = 3;
    if (cover === 'hay') {
      ctx.fillStyle = '#e8b947';
      roundRect(-38, 12, 76, 34, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#9b692d';
      for (let x = -29; x <= 29; x += 15) {
        ctx.beginPath(); ctx.moveTo(x, 14); ctx.lineTo(x + 7, 43); ctx.stroke();
      }
      ctx.strokeStyle = '#fff0a3';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-45, 44); ctx.lineTo(-45, -4); ctx.moveTo(-54, 5); ctx.lineTo(-36, 5); ctx.stroke();
    } else if (cover === 'bush') {
      ctx.fillStyle = '#477d3c';
      for (const part of [[-25,25,22],[0,18,27],[27,25,21]]) circle(part[0], part[1], part[2], true);
      ctx.fillStyle = '#ffcf4a';
      for (const flower of [[-25,15],[4,8],[27,21]]) {
        circle(flower[0], flower[1], 4, false);
        ctx.fillStyle = '#fff4d5'; circle(flower[0], flower[1], 1.5, false); ctx.fillStyle = '#ffcf4a';
      }
      ctx.strokeStyle = '#f6e0aa';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-42, 43); ctx.lineTo(42, 43); ctx.moveTo(-27, 32); ctx.lineTo(-27, 50); ctx.moveTo(27, 32); ctx.lineTo(27, 50); ctx.stroke();
    } else if (cover === 'balloonBush') {
      const balloons = [[-24,18,'#6de8ff'],[0,8,'#ffcf4a'],[25,20,'#ff5d9d']];
      for (const balloon of balloons) {
        ctx.strokeStyle = '#fff4d5';
        ctx.lineWidth = 2;
        ctx.fillStyle = balloon[2];
        ctx.beginPath(); ctx.ellipse(balloon[0], balloon[1], 18, 23, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#c99b75';
        ctx.beginPath(); ctx.moveTo(balloon[0], balloon[1] + 23); ctx.quadraticCurveTo(balloon[0] + 8, 40, 0, 52); ctx.stroke();
      }
    } else if (cover === 'moonRock') {
      ctx.fillStyle = '#7785a3';
      ctx.beginPath();
      ctx.moveTo(-40, 44); ctx.lineTo(-31, 14); ctx.lineTo(-8, 5);
      ctx.lineTo(11, 15); ctx.lineTo(31, 10); ctx.lineTo(42, 44);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#9caac6';
      circle(17, 25, 6, false);
      circle(-16, 31, 8, false);
      ctx.strokeStyle = '#fff4d5';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-29, 17); ctx.lineTo(-29, -14); ctx.stroke();
      ctx.fillStyle = '#6de8ff';
      triangle(-29, -14, -4, -7, -29, 1, true);
    } else if (cover === 'lavaRock') {
      ctx.fillStyle = '#302735';
      ctx.beginPath();
      ctx.moveTo(-40, 44); ctx.lineTo(-31, 14); ctx.lineTo(-8, 5);
      ctx.lineTo(11, 15); ctx.lineTo(31, 10); ctx.lineTo(42, 44);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ff6b59';
      ctx.shadowColor = '#ff6b59';
      ctx.shadowBlur = 8;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-8, 7); ctx.lineTo(-2, 23); ctx.lineTo(-13, 34); ctx.moveTo(21, 13); ctx.lineTo(13, 27); ctx.lineTo(20, 42); ctx.stroke();
      ctx.shadowBlur = 0;
    } else if (cover === 'satellite') {
      ctx.fillStyle = '#5569a4';
      roundRect(-42, 8, 84, 39, 5); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#91e9ff';
      for (let x = -31; x <= 31; x += 21) {
        ctx.beginPath(); ctx.moveTo(x, 11); ctx.lineTo(x, 44); ctx.stroke();
      }
      ctx.fillStyle = '#d9f1e8';
      ctx.strokeStyle = '#261f2b';
      ctx.beginPath(); ctx.arc(0, 7, 18, Math.PI, 0); ctx.lineTo(0, 7); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, 7); ctx.lineTo(0, -9); ctx.stroke();
      ctx.fillStyle = '#ff5d9d'; circle(0, -11, 4, true);
    } else if (cover === 'canoe') {
      ctx.fillStyle = '#a95d3f';
      ctx.strokeStyle = '#4b3027';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-48, 18);
      ctx.quadraticCurveTo(0, 54, 48, 18);
      ctx.quadraticCurveTo(0, 39, -48, 18);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#f0c67b';
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-36, 21); ctx.quadraticCurveTo(0, 43, 36, 21); ctx.stroke();
      ctx.strokeStyle = '#795337';
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-31, 45); ctx.lineTo(31, 2); ctx.stroke();
      ctx.fillStyle = '#d5ad6b';
      ctx.beginPath(); ctx.ellipse(37, -2, 15, 6, -.65, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    } else if (cover === 'cattails') {
      ctx.strokeStyle = '#517347';
      ctx.lineWidth = 5;
      for (const reed of [[-27,45,-23,-15],[-8,48,-4,-29],[13,47,18,-10],[31,49,33,-24]]) {
        ctx.beginPath(); ctx.moveTo(reed[0], reed[1]); ctx.quadraticCurveTo(reed[0] + 5, 12, reed[2], reed[3]); ctx.stroke();
      }
      ctx.fillStyle = '#745238';
      for (const pod of [[-23,-17],[-4,-31],[18,-12],[33,-26]]) {
        roundRect(pod[0] - 5, pod[1] - 9, 10, 20, 5); ctx.fill(); ctx.stroke();
      }
      ctx.fillStyle = '#6c9a58';
      for (const leaf of [[-35,32,-18,5],[-2,42,9,14],[18,38,39,11]]) {
        ctx.beginPath();
        ctx.moveTo(leaf[0], leaf[1]);
        ctx.quadraticCurveTo(leaf[2], leaf[3], leaf[2] + 4, leaf[3] - 4);
        ctx.stroke();
      }
    } else if (cover === 'crate') {
      ctx.fillStyle = '#bd7546';
      roundRect(-38, 10, 76, 39, 4); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-32, 14); ctx.lineTo(32, 45); ctx.moveTo(32, 14); ctx.lineTo(-32, 45); ctx.stroke();
      ctx.fillStyle = '#fff0a3';
      ctx.strokeStyle = '#57331e';
      ctx.lineWidth = 2;
      starPath(0, 29, 10, 4.5, 5); ctx.fill(); ctx.stroke();
    } else if (cover === 'barrel') {
      ctx.fillStyle = '#e06d60';
      roundRect(-33, 8, 66, 43, 11); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-31, 19); ctx.lineTo(31, 19); ctx.moveTo(-31, 40); ctx.lineTo(31, 40); ctx.stroke();
      ctx.fillStyle = '#ffcf4a';
      ctx.strokeStyle = '#57331e';
      ctx.lineWidth = 2;
      circle(0, 29, 10, true);
      ctx.fillStyle = '#57331e';
      triangle(-5, 33, 5, 33, 0, 22, false);
    } else if (cover === 'window') {
      ctx.fillStyle = '#17152e';
      roundRect(-38, 3, 76, 48, 3); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#b991ff'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-40, 8); ctx.lineTo(-40, 51); ctx.lineTo(40, 51); ctx.lineTo(40, 8); ctx.stroke();
      ctx.strokeStyle = '#ffcf4a';
      ctx.lineWidth = 3;
      circle(0, 30, 15, true);
      for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
        ctx.beginPath(); ctx.moveTo(Math.cos(angle) * 16, 30 + Math.sin(angle) * 16);
        ctx.lineTo(Math.cos(angle) * 22, 30 + Math.sin(angle) * 22); ctx.stroke();
      }
    } else if (cover === 'neonSign') {
      ctx.fillStyle = '#17152e';
      roundRect(-43, 8, 86, 42, 7); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#ff5d9d'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(-34, 40); ctx.lineTo(-14, 16); ctx.lineTo(4, 36); ctx.lineTo(27, 13); ctx.lineTo(36, 39); ctx.stroke();
      ctx.fillStyle = '#ffcf4a';
      for (let x = -34; x <= 34; x += 17) circle(x, 47, 2.5, false);
    }
  }

  function drawBird(type, golden, now) {
    const sprite = typeof _getImg === 'function'
      ? _getImg(`assets/mania/farm/${type === 'bluebird' ? 'bluebird' : 'bird'}-target-v1.png`)
      : null;
    if (sprite?.complete && sprite.naturalWidth) {
      ctx.save();
      ctx.rotate(Math.sin(now / 95) * .035);
      if (golden) ctx.filter = 'brightness(1.12) saturate(1.18)';
      const width = type === 'bluebird' ? 82 : 86;
      const height = type === 'bluebird' ? 75 : 68;
      if (type === 'bluebird') {
        ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
      } else {
        // The source PNG includes a disconnected strip of blue feathers from
        // a neighboring sprite at its far-right edge. Keep the bird at its
        // original scale while excluding only that contaminated source strip.
        const cleanSourceWidth = Math.min(sprite.naturalWidth, 370);
        const cleanWidth = width * (cleanSourceWidth / sprite.naturalWidth);
        ctx.drawImage(
          sprite,
          0, 0, cleanSourceWidth, sprite.naturalHeight,
          -width / 2, -height / 2, cleanWidth, height
        );
      }
      ctx.restore();
      return;
    }
    const flap = Math.sin(now / 75) * 9;
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 3;
    ctx.fillStyle = golden ? '#ffcf4a' : type === 'bluebird' ? '#5bc7ec' : '#f5efe0';
    ellipse(0, 2, 25, 17, true);
    circle(19, -7, 13, true);
    ctx.fillStyle = '#ef8d32';
    triangle(30, -7, 43, -2, 30, 3, true);
    ctx.fillStyle = COLORS.ink;
    circle(22, -10, 2.1, false);
    ctx.fillStyle = golden ? '#fff0a3' : type === 'bluebird' ? '#b8edff' : '#d8c7ad';
    ctx.beginPath();
    ctx.moveTo(-5, 0);
    ctx.quadraticCurveTo(-26, -28 - flap, -37, -2);
    ctx.quadraticCurveTo(-18, -7, -5, 8);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2, 1);
    ctx.quadraticCurveTo(18, -28 + flap, 28, -2);
    ctx.quadraticCurveTo(16, 1, 2, 9);
    ctx.fill(); ctx.stroke();
  }

  function drawMoonMobe(target) {
    const comet = target.type === 'cometMobe';
    const ghost = target.type === 'ghostMobe';
    const beacon = !!target.beacon;
    const spritePath = comet
      ? 'assets/mania/characters/comet-mobe-sprite-v2.png'
      : ghost
        ? 'assets/mania/characters/ghost-mobe-sprite-v2.png'
        : 'assets/mania/characters/moon-mobe-sprite-v2.png';
    const sprite = typeof _getImg === 'function' ? _getImg(spritePath) : null;
    if (sprite?.complete && sprite.naturalWidth) {
      ctx.save();
      if (target.completed) ctx.filter = 'saturate(.48) hue-rotate(145deg) brightness(1.12)';
      if (comet) {
        ctx.drawImage(sprite, -58, -34, 116, 66);
      } else if (ghost) {
        ctx.drawImage(sprite, -42, -46, 84, 91);
      } else {
        // Crop the decorative red antenna bulb out of the authored sprite so
        // the character has no small, misleading secondary target.
        const cropTop = Math.min(31, sprite.naturalHeight * .07);
        ctx.drawImage(
          sprite,
          0, cropTop, sprite.naturalWidth, sprite.naturalHeight - cropTop,
          -31, -64, 62, 109
        );
      }
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.strokeStyle = '#141a39';
    ctx.lineWidth = 3.5;

    if (comet) {
      const tail = ctx.createLinearGradient(-92, 0, -23, 0);
      tail.addColorStop(0, 'rgba(255,207,74,0)');
      tail.addColorStop(.55, 'rgba(255,93,157,.55)');
      tail.addColorStop(1, 'rgba(255,231,126,.95)');
      ctx.fillStyle = tail;
      triangle(-94, -22, -94, 22, -18, 0, false);
      ctx.fillStyle = '#e75983';
      triangle(-22, -15, -48, -31, -38, -6, true);
      triangle(-22, 15, -48, 31, -38, 6, true);
      const pod = ctx.createLinearGradient(0, -27, 0, 27);
      pod.addColorStop(0, '#ffb1c3');
      pod.addColorStop(.5, '#e76791');
      pod.addColorStop(1, '#9c3567');
      ctx.fillStyle = pod;
      ctx.beginPath();
      ctx.moveTo(-34, -25);
      ctx.quadraticCurveTo(8, -35, 38, 0);
      ctx.quadraticCurveTo(8, 35, -34, 25);
      ctx.quadraticCurveTo(-20, 0, -34, -25);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f4c44f';
      circle(-31, 0, 5, true);
    } else if (ghost) {
      const ghostBody = ctx.createLinearGradient(0, -26, 0, 43);
      ghostBody.addColorStop(0, 'rgba(185,145,255,.92)');
      ghostBody.addColorStop(1, 'rgba(77,75,173,.65)');
      ctx.fillStyle = ghostBody;
      ctx.beginPath();
      ctx.moveTo(-29, -2);
      ctx.quadraticCurveTo(-30, -30, 0, -34);
      ctx.quadraticCurveTo(30, -30, 29, -2);
      ctx.lineTo(29, 30);
      ctx.quadraticCurveTo(19, 44, 10, 29);
      ctx.quadraticCurveTo(0, 47, -10, 29);
      ctx.quadraticCurveTo(-20, 44, -29, 30);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(185,145,255,.72)';
      ellipse(-34, 5, 11, 6, true);
      ellipse(34, 5, 11, 6, true);
    }

    // The face is a separate glossy dome mounted into the toy body.
    const faceGradient = ctx.createRadialGradient(-10, -12, 3, 0, 0, 33);
    faceGradient.addColorStop(0, '#d9fbff');
    faceGradient.addColorStop(.38, beacon ? '#ffe982' : comet ? '#ff9fba' : ghost ? '#bda7ff' : '#73e6fa');
    faceGradient.addColorStop(1, beacon ? '#e8aa31' : comet ? '#bd416f' : ghost ? '#6654be' : '#319bbb');

    if (!comet && !ghost) {
      ctx.fillStyle = '#41598a';
      ctx.strokeStyle = '#141a39';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(-25, -9);
      ctx.lineTo(-39, -20);
      ctx.lineTo(-35, 3);
      ctx.lineTo(-27, 10);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(25, -9);
      ctx.lineTo(39, -20);
      ctx.lineTo(35, 3);
      ctx.lineTo(27, 10);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f0b74b';
      circle(-34, -7, 3, true);
      circle(34, -7, 3, true);
    }

    ctx.fillStyle = faceGradient;
    ctx.beginPath();
    if (!comet && !ghost) {
      ctx.moveTo(0, -32);
      ctx.bezierCurveTo(22, -32, 33, -18, 30, 3);
      ctx.bezierCurveTo(27, 22, 13, 31, 0, 33);
      ctx.bezierCurveTo(-13, 31, -27, 22, -30, 3);
      ctx.bezierCurveTo(-33, -18, -22, -32, 0, -32);
    } else {
      ctx.ellipse(comet ? 7 : 0, ghost ? -5 : -2, 29, 27, comet ? .08 : 0, 0, Math.PI * 2);
    }
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,.42)';
    ctx.beginPath();
    ctx.ellipse(comet ? -2 : -9, ghost ? -14 : -11, 7, 10, -.45, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(11,20,54,.18)';
    circle(comet ? 17 : 11, ghost ? 4 : 7, 5, false);

    ctx.fillStyle = '#172044';
    circle(comet ? 0 : -8, ghost ? -7 : -4, 3.2, false);
    circle(comet ? 15 : 9, ghost ? -7 : -4, 3.2, false);
    ctx.strokeStyle = '#172044';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(comet ? 7 : 0, ghost ? -3 : 0, 10, .18, Math.PI - .18);
    ctx.stroke();

    ctx.strokeStyle = '#172044';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(comet ? 7 : 0, ghost ? -31 : -29);
    ctx.lineTo(comet ? 10 : 0, ghost ? -44 : -43);
    ctx.stroke();
    ctx.fillStyle = beacon ? '#fff8c8' : comet ? '#ffcf4a' : ghost ? '#6de8ff' : '#ff5d9d';
    circle(comet ? 11 : 0, ghost ? -48 : -47, 6.5, true);
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    circle(comet ? 9 : -2, ghost ? -50 : -49, 2, false);

    // Visible neck posts establish why a ring can catch this original creature.
    if (!ghost && !comet) {
      const neck = ctx.createLinearGradient(-8, 0, 8, 0);
      neck.addColorStop(0, '#7aa5bd');
      neck.addColorStop(.5, '#e6fbff');
      neck.addColorStop(1, '#6787a5');
      ctx.fillStyle = neck;
      roundRect(-8, 22, 16, 23, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#f0b74b';
      ctx.fillRect(-6, 28, 12, 3);
    }
    ctx.restore();
  }

  function drawOrbitBoss(target) {
    const w = state.width;
    const h = state.height;
    const robot = orbitRobotMetrics(w, h);
    const openSprite = typeof _getImg === 'function'
      ? _getImg('assets/mania/orbit-robot-boss-v1.png')
      : null;
    const closedSprite = typeof _getImg === 'function'
      ? _getImg('assets/mania/orbit-robot-boss-closed-v2.png')
      : null;
    const pulse = target.pulseAt && state.elapsed - target.pulseAt < .12
      ? 1 + (1 - (state.elapsed - target.pulseAt) / .12) * .035
      : 1;
    ctx.save();
    ctx.scale(pulse, pulse);
    if (openSprite?.complete && openSprite.naturalWidth) {
      ctx.shadowColor = 'rgba(109,232,255,.38)';
      ctx.shadowBlur = 22;
      ctx.drawImage(openSprite, robot.drawX, robot.drawY, robot.width, robot.height);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#167b82';
      ctx.strokeStyle = '#d39a50';
      ctx.lineWidth = 8;
      roundRect(-w * .34, -h * .4, w * .68, h * .82, 36);
      ctx.fill();
      ctx.stroke();
    }

    // The closed state is a second authored painting of this exact prop.
    // Reveal its textured jaw plates from the top and bottom so the animation
    // retains the same worn enamel, brass, rivets, and lighting as the robot.
    const closed = 1 - (target.mouthOpen || 0);
    if (closed > .015 && closedSprite?.complete && closedSprite.naturalWidth) {
      const mouthW = robot.width * .42;
      const mouthH = robot.height * .3;
      const mouthTop = -robot.height * .145;
      const panelH = mouthH * .5 * closed;
      const drawClosedState = () => {
        ctx.drawImage(closedSprite, robot.drawX, robot.drawY, robot.width, robot.height);
      };
      ctx.save();
      ctx.beginPath();
      ctx.rect(-mouthW / 2, mouthTop, mouthW, panelH + 2);
      ctx.clip();
      drawClosedState();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(-mouthW / 2, mouthTop + mouthH - panelH - 2, mouthW, panelH + 2);
      ctx.clip();
      drawClosedState();
      ctx.restore();
    }

    const open = (target.mouthOpen || 0) > .72;
    const nextValue = orbitBossValue((target.mouthStage || 0) + 1);
    const upcomingValue = (target.mouthCycleAge || 0) < .85 ? target.base : nextValue;
    ctx.fillStyle = 'rgba(7,7,20,.9)';
    ctx.strokeStyle = open ? '#6de8ff' : '#ffcf4a';
    ctx.lineWidth = 3;
    const valueY = robot.height * .215;
    roundRect(-82, valueY, 164, 42, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = open ? '#fff4d5' : '#ffcf4a';
    ctx.font = '18px "VCR", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(open ? `${target.base} EACH` : `NEXT ${upcomingValue}`, 0, valueY + 21);
    ctx.restore();
  }

  function drawPlate(target) {
    const plateName = target.gold || target.golden
      ? 'gold-plate'
      : target.type === 'highPlate' || target.type === 'bonusPlate'
        ? 'high-plate'
        : 'low-plate';
    const sprite = typeof _getImg === 'function'
      ? _getImg(`assets/mania/tank/${plateName}-v1.png`)
      : null;
    if (sprite?.complete && sprite.naturalWidth) {
      const size = plateName === 'gold-plate' ? 72 : plateName === 'high-plate' ? 68 : 64;
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      return;
    }
    const color = target.gold || target.golden ? '#ffcf4a' : target.type === 'bonusPlate' ? '#6de8ff' : '#fff2dd';
    ctx.strokeStyle = target.gold || target.golden ? '#8c551d' : '#4f3d49';
    ctx.lineWidth = 4;
    ctx.fillStyle = color;
    circle(0, 0, 31, true);
    ctx.globalAlpha *= .82;
    ctx.fillStyle = target.gold || target.golden ? '#fff2aa' : '#d7b8c7';
    circle(0, 0, 20, true);
    ctx.globalAlpha /= .82;
    ctx.strokeStyle = target.gold || target.golden ? '#8c551d' : '#8c5572';
    ctx.lineWidth = 3;
    starPath(0, 0, 12, 5.5, 6);
    ctx.stroke();
  }

  function drawDinosaurTethers() {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,220,145,.9)';
    ctx.lineWidth = clamp(Math.min(state.width, state.height) * .004, 1.5, 3);
    for (const target of state.targets) {
      if (target.kind !== 'dinoBalloon' || target.hit || target.parent.hit) continue;
      const balloonPos = targetPosition(target, state.elapsed);
      const parentPos = targetPosition(target.parent, state.elapsed);
      if (!balloonPos || !parentPos) continue;
      const knotX = parentPos.x;
      const knotY = parentPos.y - 36 * parentPos.scale;
      const controlX = lerp(balloonPos.x, knotX, .55)
        + Math.sin(state.elapsed * 3.7 + target.balloonIndex) * 9;
      ctx.beginPath();
      ctx.moveTo(balloonPos.x, balloonPos.y + 31 * balloonPos.scale);
      ctx.quadraticCurveTo(controlX, lerp(balloonPos.y, knotY, .58), knotX, knotY);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDinosaurTarget(target, now) {
    const assetName = target.type === 'triceratops'
      ? 'dinosaur-triceratops-v1.png'
      : 'dinosaur-trex-v1.png';
    const sprite = typeof _getImg === 'function'
      ? _getImg(`assets/mania/volcano/${assetName}`)
      : null;
    if (!sprite?.complete || !sprite.naturalWidth) return;
    const width = target.type === 'triceratops' ? 176 : 184;
    const height = width * (sprite.naturalHeight / sprite.naturalWidth);
    const stride = Math.sin((state.elapsed - target.at) * 10 + target.dinoIndex);
    ctx.save();
    ctx.translate(0, Math.abs(stride) * -2);
    ctx.rotate(stride * .012);
    ctx.filter = 'drop-shadow(0 7px 5px rgba(18,8,20,.52))';
    ctx.drawImage(sprite, -width / 2, -height * .72, width, height);
    ctx.filter = 'none';
    ctx.restore();
  }

  function drawBalloonTarget(target) {
    const balloonAssets = [
      'tree-balloon-raspberry',
      'tree-balloon-gold',
      'tree-balloon-teal',
    ];
    const balloonName = target.type === 'eruptionBalloon' || target.golden
      ? 'eruption-balloon'
      : target.vent || target.type === 'lavaStream'
        ? 'vent-balloon'
        : balloonAssets[target.hue % balloonAssets.length];
    const sprite = typeof _getImg === 'function'
      ? _getImg(`assets/mania/volcano/${balloonName}-v1.png`)
      : null;
    if (sprite?.complete && sprite.naturalWidth) {
      const height = balloonName === 'eruption-balloon' ? 126 : target.vent ? 142 : 148;
      const naturalWidth = height * (sprite.naturalWidth / sprite.naturalHeight);
      const width = target.type === 'lavaStream'
        ? clamp(naturalWidth * .58, 28, 36)
        : naturalWidth;
      const objectiveBalloon = !!target.stageTarget;
      const phonePop = state.width <= 520
        ? ' drop-shadow(0 1px 2px #201329) drop-shadow(0 0 5px rgba(255,248,220,.9))'
        : '';
      ctx.filter = objectiveBalloon
        ? `drop-shadow(0 0 3px #fff8dc) drop-shadow(0 0 13px #6de8ff)${phonePop}`
        : target.kind === 'volcanoDecoy'
          ? `drop-shadow(0 0 3px rgba(255,244,213,.72)) drop-shadow(0 5px 7px rgba(8,4,20,.7))${phonePop}`
          : phonePop || 'none';
      if (target.vent || target.golden) {
        ctx.shadowColor = target.golden ? '#ffcf4a' : '#fff1a3';
        ctx.shadowBlur = target.golden ? 20 : 14;
      }
      ctx.drawImage(sprite, -width / 2, -54, width, height);
      ctx.shadowBlur = 0;
      ctx.filter = 'none';
      return;
    }
    const colors = ['#ff5d9d','#ffcf4a','#6de8ff','#b991ff','#ff785d'];
    const color = target.golden ? '#ffe667' : colors[target.hue % colors.length];
    ctx.strokeStyle = '#372039';
    ctx.lineWidth = 3;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, -4, 26, 34, 0, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    ctx.beginPath(); ctx.ellipse(-8, -13, 7, 12, -.35, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = color;
    triangle(-6, 28, 6, 28, 0, 39, true);
    ctx.strokeStyle = target.kind === 'balloonTree' ? '#5b3d2c' : '#ffcc73';
    ctx.lineWidth = target.kind === 'balloonTree' ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(0, 39);
    if (target.kind === 'balloonTree') ctx.lineTo(0, 78);
    else ctx.quadraticCurveTo(15, 58, -5, 82);
    ctx.stroke();
    if (target.vent) {
      ctx.fillStyle = '#fff8c2';
      starPath(0, -4, 9, 4, 5); ctx.fill();
    }
  }

  function drawVolcanoComet(target, now) {
    const pulse = 1 + Math.sin(now / 140 + target.at) * .08;
    const sprite = typeof _getImg === 'function'
      ? _getImg('assets/mania/volcano/comet-target-v1.png')
      : null;
    if (!sprite?.complete || !sprite.naturalWidth) return;
    ctx.save();
    ctx.scale(pulse, pulse);
    ctx.filter = 'drop-shadow(0 0 4px #fff2aa) drop-shadow(0 0 12px rgba(255,117,93,.9))';
    ctx.drawImage(sprite, -52, -52, 104, 104);
    ctx.filter = 'none';
    ctx.restore();
  }

  function drawNeonTarget(target) {
    const rapid = target.kind === 'rapidTarget';
    const jackpot = target.kind === 'jackpot' || rapid;
    if (jackpot) {
      const sprite = typeof _getImg === 'function'
        ? _getImg('assets/mania/finale/grand-jackpot-v1.png')
        : null;
      if (sprite?.complete && sprite.naturalWidth) {
        const height = 116;
        const width = height * (sprite.naturalWidth / sprite.naturalHeight);
        ctx.save();
        ctx.shadowColor = '#ffcf4a';
        ctx.shadowBlur = 26;
        ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
        ctx.shadowBlur = 0;
        drawFinaleRingStructure(52, '#ffcf4a', 2, true);
        ctx.fillStyle = '#fff3b0';
        ctx.strokeStyle = '#5f2746';
        ctx.lineWidth = 3;
        circle(0, 0, 13, true);
        ctx.fillStyle = '#4e1948';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = '11px "VCR", monospace';
        ctx.fillText(rapid ? String(target.hits || 0) : String((target.hits || 0) + 1), 0, 1);
        if (rapid) {
          ctx.fillStyle = '#fff8dc';
          ctx.font = '13px "VCR", monospace';
          ctx.fillText('TAP!', 0, -43);
        }
        ctx.restore();
        return;
      }
    }
    const color = jackpot ? '#ffcf4a' : target.type === 'starTarget' ? '#ff5d9d' : '#6de8ff';
    drawFinaleRingStructure(jackpot ? 48 : 36, color, jackpot ? 2 : 0, jackpot);
    if (jackpot) {
      ctx.fillStyle = '#fff8dc';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = '12px "Bebas Neue",sans-serif';
      ctx.fillText(rapid ? String(target.hits || 0) : String((target.hits || 0) + 1), 0, 1);
      if (rapid) {
        ctx.font = '11px "VCR", monospace';
        ctx.fillText('TAP!', 0, -35);
      }
    } else {
      circle(0, 0, 8, false);
    }
  }

  function drawFinalePopup(target) {
    const spriteName = target.base >= 4000 ? 'jewel-target' : target.base >= 2000 ? 'open-star-panel' : 'base-panel';
    const sprite = typeof _getImg === 'function'
      ? _getImg(`assets/mania/finale/${spriteName}-v1.png`)
      : null;
    const color = target.base >= 4000 ? '#ffcf4a' : target.base >= 2000 ? '#ff5d9d' : '#6de8ff';
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = target.base >= 4000 ? 24 : 13;
    if (sprite?.complete && sprite.naturalWidth) {
      const height = target.base >= 4000 ? 58 : target.base >= 2000 ? 64 : 70;
      const width = height * (sprite.naturalWidth / sprite.naturalHeight);
      ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
    } else {
      ctx.fillStyle = 'rgba(14,10,38,.94)';
      ctx.strokeStyle = color;
      ctx.lineWidth = 4;
      roundRect(-34, -42, 68, 84, 9);
      ctx.fill();
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    const tier = target.base >= 4000 ? 2 : target.base >= 2000 ? 1 : 0;
    drawFinaleRingStructure(target.base >= 4000 ? 39 : target.base >= 2000 ? 43 : 47, color, tier, true);
    ctx.fillStyle = 'rgba(8,4,24,.88)';
    ctx.strokeStyle = '#fff4d5';
    ctx.lineWidth = 2;
    roundRect(-27, 43, 54, 23, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = '12px "VCR", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(target.base), 0, 55);
    ctx.restore();
  }

  function drawFinalePanel(target) {
    const panelNames = ['base-panel', 'open-star-panel', 'jewel-target'];
    const panelName = panelNames[Math.min(target.tier, panelNames.length - 1)];
    const colors = ['#6de8ff', '#ff5d9d', '#ffcf4a'];
    const color = colors[target.tier % colors.length];
    const sprite = typeof _getImg === 'function'
      ? _getImg(`assets/mania/finale/${panelName}-v1.png`)
      : null;
    if (sprite?.complete && sprite.naturalWidth) {
      const heights = [72, 64, 56];
      const height = heights[Math.min(target.tier, heights.length - 1)];
      const width = height * (sprite.naturalWidth / sprite.naturalHeight);
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 12 + target.tier * 3;
      ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
      ctx.shadowBlur = 0;
      drawFinaleRingStructure(47 - target.tier * 5, color, target.tier, true);
      ctx.restore();
      return;
    }
    const panelW = 74 - target.tier * 13;
    const panelH = 82 - target.tier * 12;
    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.fillStyle = 'rgba(14,10,38,.9)';
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    roundRect(-panelW / 2, -panelH / 2, panelW, panelH, 9);
    ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;

    // Visible hinges explain why one panel can physically unfold into more.
    ctx.fillStyle = '#fff4d5';
    ctx.strokeStyle = '#2a2141';
    ctx.lineWidth = 2;
    for (const y of [-panelH * .25, panelH * .25]) {
      roundRect(-panelW / 2 - 6, y - 5, 12, 10, 3); ctx.fill(); ctx.stroke();
      roundRect(panelW / 2 - 6, y - 5, 12, 10, 3); ctx.fill(); ctx.stroke();
    }

    drawFinaleRingStructure(47 - target.tier * 5, color, target.tier, true);
    ctx.fillStyle = '#fff4d5';
    ctx.font = '12px "VCR", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${target.tier + 1}`, 0, panelH * .34);
  }

  function drawFinaleBonusBat(target, now) {
    const sprite = typeof _getImg === 'function'
      ? _getImg('assets/mania/finale/bonus-bat-v1.png')
      : null;
    const flap = .9 + Math.sin(now / 75 + target.batIndex) * .08;
    ctx.save();
    ctx.scale(1, flap);
    ctx.shadowColor = '#ffcf4a';
    ctx.shadowBlur = 10;
    if (!sprite?.complete || !sprite.naturalWidth) {
      ctx.restore();
      return;
    }
    const width = 94;
    const height = width * (sprite.naturalHeight / sprite.naturalWidth);
    ctx.drawImage(sprite, -width / 2, -height / 2, width, height);
    ctx.restore();
  }

  function drawFinaleRingStructure(radius, color, tier = 0, bullseye = true) {
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 10 + tier * 3;

    // A dark backing plus aged-brass rim gives every Showdown object the
    // unmistakable silhouette of a physical midway target.
    ctx.fillStyle = 'rgba(12,7,29,.28)';
    ctx.strokeStyle = '#452c31';
    ctx.lineWidth = 9;
    circle(0, 0, radius, true);
    ctx.strokeStyle = '#d39a50';
    ctx.lineWidth = 4;
    circle(0, 0, radius, true);
    ctx.shadowBlur = 0;

    // Alternating scoring rings preserve the neon palette while reading as a
    // bullseye at phone size and during the scrolling phase.
    ctx.fillStyle = 'rgba(255,244,213,.08)';
    ctx.strokeStyle = '#fff4d5';
    ctx.lineWidth = 3;
    circle(0, 0, radius * .7, true);
    ctx.fillStyle = `${color}22`;
    ctx.strokeStyle = color;
    ctx.lineWidth = 4;
    circle(0, 0, radius * .4, true);

    if (bullseye) {
      ctx.fillStyle = color;
      ctx.strokeStyle = '#fff8dc';
      ctx.lineWidth = 3;
      circle(0, 0, Math.max(7, radius * .17), true);
      ctx.fillStyle = '#fff8dc';
      circle(0, 0, Math.max(2.5, radius * .055), false);
    }

    // Four mounting tabs keep the rings integrated with the existing hinged,
    // mechanical panel language instead of becoming clean digital reticles.
    for (let i = 0; i < 4; i += 1) {
      ctx.save();
      ctx.rotate(i * Math.PI / 2);
      ctx.translate(0, -radius);
      ctx.fillStyle = '#6c3e38';
      ctx.strokeStyle = '#d39a50';
      ctx.lineWidth = 2;
      roundRect(-7, -6, 14, 12, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffcf4a';
      circle(0, 0, 2.2, false);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawAnimal(type, golden, kind) {
    const sprite = typeof _getImg === 'function'
      ? _getImg(`assets/mania/farm/${type}-target-v1.png`)
      : null;
    if (sprite?.complete && sprite.naturalWidth) {
      const sizes = {
        pig: [106, 65],
        cow: [108, 78],
        sheep: [108, 71],
        duck: [86, 70],
        chicken: [82, 78],
        fox: [108, 76],
      };
      const [width, height] = sizes[type] || [84, 60];
      ctx.save();
      if (golden) ctx.filter = 'sepia(.32) saturate(1.45) brightness(1.13)';
      if (kind === 'peek') {
        ctx.beginPath();
        ctx.rect(-50, -55, 100, 82);
        ctx.clip();
        ctx.drawImage(sprite, -width / 2, -height * .64, width, height);
      } else {
        ctx.drawImage(sprite, -width / 2, 35 - height, width, height);
      }
      ctx.restore();
      return;
    }
    const outline = COLORS.ink;
    ctx.strokeStyle = outline;
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (type === 'pig') {
      ctx.fillStyle = golden ? '#ffd75c' : '#f1a1a4';
      ellipse(-5, 3, 34, 24, true);
      circle(25, -3, 20, true);
      triangle(14, -18, 19, -36, 29, -17, true);
      ctx.fillStyle = golden ? '#ffe998' : '#f9bec0';
      ellipse(35, 2, 12, 9, true);
      ctx.fillStyle = outline;
      circle(31, 1, 1.8, false); circle(39, 1, 1.8, false); circle(29, -9, 2.2, false);
      leg(-21, 19); leg(10, 20);
      ctx.beginPath(); ctx.arc(-39, 2, 9, -.9, 1.8); ctx.stroke();
    } else if (type === 'cow') {
      ctx.fillStyle = golden ? '#ffdc68' : '#f7f2df';
      ellipse(-7, 1, 37, 25, true);
      circle(28, -5, 21, true);
      ctx.fillStyle = golden ? '#a66a21' : '#4d3b33';
      ellipse(-18, -2, 11, 14, false);
      ellipse(5, 9, 9, 8, false);
      triangle(15, -19, 10, -34, 25, -22, false);
      triangle(38, -19, 47, -32, 47, -16, false);
      ctx.fillStyle = golden ? '#ffeaa0' : '#e8b9ae';
      ellipse(37, 3, 13, 10, true);
      ctx.fillStyle = outline;
      circle(31, -9, 2.2, false); circle(33, 3, 1.5, false); circle(42, 3, 1.5, false);
      leg(-25, 20); leg(7, 20);
    } else if (type === 'sheep') {
      ctx.fillStyle = golden ? '#ffe06d' : '#fff7df';
      for (const p of [[-22,1,20],[-5,-7,22],[15,1,20],[-7,10,22]]) circle(p[0], p[1], p[2], true);
      ctx.fillStyle = golden ? '#a86f2d' : '#554238';
      ellipse(28, -3, 17, 19, true);
      triangle(19, -16, 13, -29, 27, -19, true);
      ctx.fillStyle = outline; circle(33, -7, 2.3, false);
      leg(-21, 20); leg(8, 22);
    } else if (type === 'duck') {
      ctx.fillStyle = golden ? '#ffd849' : '#f4dd55';
      ellipse(-7, 8, 27, 19, true);
      circle(20, -10, 17, true);
      ctx.fillStyle = '#ef8d32';
      triangle(34, -10, 51, -4, 34, 2, true);
      ctx.fillStyle = outline; circle(24, -14, 2.5, false);
      ctx.strokeStyle = '#d3742c'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-10, 26); ctx.lineTo(-10, 33); ctx.lineTo(-20, 34); ctx.moveTo(7, 26); ctx.lineTo(7, 33); ctx.lineTo(17, 34); ctx.stroke();
    } else if (type === 'chicken') {
      ctx.fillStyle = golden ? '#ffd447' : '#fff4dc';
      ellipse(-4, 8, 27, 25, true);
      circle(19, -11, 17, true);
      ctx.fillStyle = '#e44e43';
      circle(13, -28, 6, false); circle(20, -30, 6, false); circle(26, -26, 5, false);
      triangle(33, -12, 49, -5, 33, 1, false);
      ctx.fillStyle = outline; circle(23, -15, 2.3, false);
      ctx.strokeStyle = '#d88731'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-12, 30); ctx.lineTo(-12, 38); ctx.lineTo(-22, 40); ctx.moveTo(4, 31); ctx.lineTo(4, 39); ctx.lineTo(14, 41); ctx.stroke();
    } else if (type === 'fox') {
      ctx.fillStyle = '#e9863e';
      ellipse(-3, 6, 30, 23, true);
      circle(20, -12, 22, true);
      triangle(4, -26, 7, -48, 20, -30, true);
      triangle(26, -31, 41, -46, 39, -20, true);
      ctx.fillStyle = '#fff0d5';
      triangle(18, -8, 44, -2, 25, 9, true);
      ctx.fillStyle = outline; circle(25, -16, 2.5, false); circle(43, -2, 3, false);
      ctx.strokeStyle = '#c75f2d'; ctx.lineWidth = 8;
      ctx.beginPath(); ctx.arc(-30, 5, 22, -1.6, 1.4); ctx.stroke();
      ctx.strokeStyle = '#fff0d5'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.arc(-30, 5, 22, .7, 1.4); ctx.stroke();
    }
  }

  function animalColor(type) {
    return {
      pig: '#f1a1a4',
      cow: '#fff1ce',
      sheep: '#fff7df',
      duck: '#f4dd55',
      chicken: '#fff4dc',
      fox: '#e9863e',
      bird: '#f5efe0',
      bluebird: '#5bc7ec',
    }[type] || '#ffcf4a';
  }

  function targetColor(target) {
    if (target.kind === 'hiddenMobe') return '#ffcf4a';
    if (['runner', 'peek', 'flyer'].includes(target.kind)) return animalColor(target.type);
    if (['damBeaver', 'damBank', 'goldBeaver', 'beaverRunner', 'beaverPeek'].includes(target.kind)) {
      return target.type === 'expert' ? '#ff647f' : target.type === 'foreman' ? '#ffbf4d' : '#76f0ad';
    }
    if (target.kind === 'orbiter') return '#6de8ff';
    if (target.kind === 'plate') return '#fff2dd';
    if (target.kind === 'balloonTree' || target.kind === 'lavaBalloon' || target.kind === 'volcanoDecoy') return '#ff5d9d';
    if (target.kind === 'volcanoComet') return '#ffcf4a';
    return '#b991ff';
  }

  function finishRound() {
    cancelAnimationFrame(frame);
    frame = 0;
    state.phase = 'results';
    setArcadeExitVisible(false);
    try { SFX.win(); } catch (e) {}

    const summary = roundSummary();
    const circuitTotal = state.totalScore + state.score;
    const wrap = document.getElementById('mania-wrap');
    if (!wrap) return;
    if (state.practice) {
      wrap.innerHTML = `
        <section class="mania-results mania-booth-results" aria-labelledby="mania-result-title" style="--mania-accent:${currentBooth().accent}">
          <div class="mania-result-kicker">PRACTICE COMPLETE</div>
          <h2 class="mania-result-title" id="mania-result-title">${currentBooth().title}</h2>
          <div class="mania-result-score">${state.score.toLocaleString()}<small>PRACTICE SCORE</small></div>
          <div class="mania-result-stats">
            <div class="mania-result-stat"><b>${summary.hits}</b><span>HITS</span></div>
            <div class="mania-result-stat"><b>${summary.accuracy}%</b><span>ACCURACY</span></div>
            <div class="mania-result-stat"><b>${Math.max(0, state.taps - summary.hits)}</b><span>MISSES</span></div>
          </div>
          <div class="mania-hidden-result">HIDDEN MOBERINOS · <b>${summary.hiddenMobes}/${summary.hiddenMobeTotal}</b></div>
          <button class="mania-btn" type="button" onclick="maniaPractice(${state.boothIndex})">PRACTICE AGAIN</button>
          <button class="mania-result-back" type="button" onclick="maniaChooseBooth()">◀ CHOOSE A BOOTH</button>
        </section>`;
      return;
    }
    if (state.boothIndex < BOOTHS.length - 1) {
      wrap.innerHTML = `
        <section class="mania-results mania-booth-results" aria-labelledby="mania-result-title" style="--mania-accent:${currentBooth().accent}">
          <div class="mania-result-kicker">BOOTH ${state.boothIndex + 1}/${BOOTHS.length} COMPLETE</div>
          <h2 class="mania-result-title" id="mania-result-title">${currentBooth().title}</h2>
          <div class="mania-result-score">${state.score.toLocaleString()}<small>BOOTH SCORE · ${circuitTotal.toLocaleString()} TOTAL</small></div>
          <div class="mania-result-stats">
            <div class="mania-result-stat"><b>${summary.hits}</b><span>HITS</span></div>
            <div class="mania-result-stat"><b>${summary.accuracy}%</b><span>ACCURACY</span></div>
            <div class="mania-result-stat"><b>${Math.max(0, state.taps - summary.hits)}</b><span>MISSES</span></div>
          </div>
          <div class="mania-hidden-result">HIDDEN MOBERINOS · <b>${summary.hiddenMobes}/${summary.hiddenMobeTotal}</b></div>
          <button class="mania-btn mania-auto-next" id="mania-auto-next" type="button" onclick="maniaNextBooth()">NEXT BOOTH · 4</button>
          <button class="mania-result-back" type="button" onclick="nav('lobby')">QUIT GAME</button>
        </section>`;
      scheduleNextBooth();
      return;
    }

    const allRounds = state.rounds.concat(summary);
    const totalHits = allRounds.reduce((sum, round) => sum + round.hits, 0);
    const hiddenMobes = allRounds.reduce((sum, round) => sum + round.hiddenMobes, 0);
    const hiddenMobeTotal = allRounds.reduce((sum, round) => sum + round.hiddenMobeTotal, 0);
    const averageAccuracy = Math.round(allRounds.reduce((sum, round) => sum + round.accuracy, 0) / allRounds.length);
    wrap.innerHTML = `
      <section class="mania-results mania-circuit-results" aria-labelledby="mania-result-title">
        <div class="mania-result-kicker">ALL FIVE BOOTHS COMPLETE</div>
        <h2 class="mania-result-title" id="mania-result-title">MANIA CHAMPION</h2>
        <div class="mania-result-score">${circuitTotal.toLocaleString()}<small>FINAL CIRCUIT SCORE</small></div>
        <div class="mania-result-stats">
          <div class="mania-result-stat"><b>${totalHits}</b><span>TOTAL HITS</span></div>
          <div class="mania-result-stat"><b>${averageAccuracy}%</b><span>AVG ACCURACY</span></div>
          <div class="mania-result-stat"><b>5/5</b><span>BOOTHS</span></div>
        </div>
        <div class="mania-round-strip">
          ${allRounds.map((round, index) => `<div style="--round-color:${round.accent}"><span>${index + 1}</span><b>${round.score.toLocaleString()}</b><small>${round.title}</small></div>`).join('')}
        </div>
        <div class="mania-hidden-result">HIDDEN MOBERINOS · <b>${hiddenMobes}/${hiddenMobeTotal}</b></div>
        <div class="mania-final-leaderboard">
          <div class="arcade-result-board" id="mania-final-board"></div>
          <div class="arcade-result-save-label">ENTER A NAME FOR THE FINAL SCORE</div>
          <div class="arcade-result-save" data-save-row="arcade">
            <input id="mania-final-name" data-arcade-name="1" maxlength="12" autocomplete="off" spellcheck="false"
              placeholder="ARCADE NAME" aria-label="Leaderboard name">
            <button id="mania-final-name-save" type="button" aria-label="Submit final score" data-arcade-save="1"
              data-board-key="mania" data-local-score="${circuitTotal}" data-remote-score="${circuitTotal}"
              data-seconds="0" data-extra="5 BOOTHS · ${averageAccuracy}% ACCURACY" data-ascending="false"
              data-input-id="mania-final-name" data-status-id="mania-final-status"
              data-board-target-id="mania-final-board" data-neon-color="#ff5b68" data-field="score"
              data-art-target-id="" data-art-game="mania" data-eligible="true">▶</button>
          </div>
          <div class="mania-final-status" id="mania-final-status" role="status" aria-live="polite"></div>
        </div>
        <button class="mania-btn" type="button" onclick="maniaStart()">RIDE AGAIN</button>
        <button class="mania-result-back" type="button" onclick="nav('lobby')">◀ ARCADE MENU</button>
      </section>`;
    if (typeof loadRemoteBoard === 'function') {
      loadRemoteBoard('mania', 'mania-final-board', '#ff5b68', 'score');
    }
  }

  function clearIntermission() {
    clearTimeout(intermissionTimer);
    clearInterval(intermissionTicker);
    intermissionTimer = 0;
    intermissionTicker = 0;
  }

  function scheduleNextBooth() {
    clearIntermission();
    let remaining = 4;
    const button = document.getElementById('mania-auto-next');
    intermissionTicker = setInterval(() => {
      remaining -= 1;
      if (button) button.textContent = remaining > 0 ? `NEXT BOOTH · ${remaining}` : 'NEXT BOOTH';
    }, 1000);
    intermissionTimer = setTimeout(() => {
      clearIntermission();
      if (state?.phase === 'results' && !state.practice) window.maniaNextBooth();
    }, 4000);
  }

  function addLabel(x, y, text, color, size) {
    state.labels.push({ x, y, text, color, size, born: performance.now() });
  }

  function burst(x, y, color, count, force) {
    const now = performance.now();
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (35 + Math.random() * 90) * force;
      state.particles.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 30,
        color,
        size: 2 + Math.random() * 5,
        born: now,
        life: 430 + Math.random() * 330,
      });
    }
  }

  function volcanoSpray(x, y, golden) {
    const now = performance.now();
    const colors = golden
      ? ['#fff0a4', '#ffcf4a', '#ff785d']
      : ['#ffcf4a', '#ff785d', '#ff5d9d'];
    for (let i = 0; i < (golden ? 18 : 11); i += 1) {
      const spread = (Math.random() - .5) * (golden ? 210 : 150);
      state.particles.push({
        x: x + (Math.random() - .5) * 8,
        y: y + 6,
        vx: spread,
        vy: -125 - Math.random() * (golden ? 190 : 130),
        color: colors[i % colors.length],
        size: 3 + Math.random() * 5,
        born: now,
        life: 700 + Math.random() * 420,
      });
    }
  }

  function drawShots(now) {
    state.shots = state.shots.filter(shot => now - shot.born < (
      shot.kind === 'orbit' ? shot.flightDuration * 1000 + 340 :
      shot.kind === 'plates' ? shot.flightDuration * 1000 + 90 :
      210
    ));
    for (const shot of state.shots) {
      const flightMs = shot.kind === 'orbit' || shot.kind === 'plates'
        ? shot.flightDuration * 1000
        : 210;
      const rawProgress = (now - shot.born) / flightMs;
      const p = clamp(rawProgress, 0, 1);
      const startX = state.width / 2;
      const startY = state.height + 22;
      const curveControlX = (shot.aimX || shot.x) + (shot.curveOffset || 0) * 1.8;
      const endX = shot.kind === 'plates'
        ? shot.curveOffset
          ? (1 - p) * (1 - p) * startX + 2 * (1 - p) * p * curveControlX + p * p * shot.x
          : lerp(startX, shot.x, p)
        : lerp(startX, shot.x, shot.kind === 'orbit' ? p : Math.min(1, p * 2.8));
      const endY = shot.kind === 'orbit'
        ? lerp(startY, shot.y, p) - Math.sin(p * Math.PI) * shot.arcHeight
        : shot.kind === 'plates'
          ? lerp(startY, shot.y, p) - Math.sin(p * Math.PI) * shot.arcHeight
        : lerp(startY, shot.y, Math.min(1, p * 2.8));
      ctx.save();
      if (shot.kind === 'orbit') {
        const afterLanding = Math.max(0, rawProgress - 1);
        const bounce = afterLanding > 0 ? Math.sin(Math.min(1, afterLanding * 3) * Math.PI) * 16 : 0;
        const ringY = endY - bounce;
        ctx.globalAlpha = clamp(1 - afterLanding * 1.55, 0, 1);
        ctx.fillStyle = 'rgba(4,6,22,.25)';
        ctx.beginPath();
        ctx.ellipse(endX, shot.y + 12, 20 + p * 8, 5 + p * 2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fff1a3';
        ctx.shadowColor = '#6de8ff';
        ctx.shadowBlur = 9;
        ctx.lineWidth = 6 - p * 1.5;
        ctx.beginPath();
        ctx.ellipse(endX, ringY, 15 + p * 10, 6 + p * 4, -.3 + p * .2, 0, Math.PI * 2);
        ctx.stroke();
      } else if (shot.kind === 'plates') {
        ctx.globalAlpha = clamp(1 - Math.max(0, p - .86) / .14, 0, 1);
        // A short retained trail makes the rightward overshoot and left hook
        // legible even when the spinning log itself is visually busy.
        const trailStart = 0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (let step = 0; step <= 7; step += 1) {
          const t = lerp(trailStart, p, step / 7);
          const trailX = shot.curveOffset
            ? (1 - t) * (1 - t) * startX + 2 * (1 - t) * t * curveControlX + t * t * shot.x
            : lerp(startX, shot.x, t);
          const trailY = lerp(startY, shot.y, t) - Math.sin(t * Math.PI) * shot.arcHeight;
          if (step === 0) ctx.moveTo(trailX, trailY);
          else ctx.lineTo(trailX, trailY);
        }
        ctx.strokeStyle = 'rgba(49,31,22,.68)';
        ctx.lineWidth = 10;
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,224,164,.76)';
        ctx.lineWidth = 5;
        ctx.stroke();
        ctx.translate(endX, endY);
        ctx.rotate(-p * Math.PI * 4.5);
        ctx.shadowColor = 'rgba(255,220,150,.52)';
        ctx.shadowBlur = 7;
        ctx.fillStyle = '#8a5a32';
        ctx.strokeStyle = '#3d2b20';
        ctx.lineWidth = 3;
        roundRect(-19, -7, 38, 14, 7);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = '#d6a565';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-11, -6); ctx.lineTo(-11, 6);
        ctx.moveTo(11, -6); ctx.lineTo(11, 6);
        ctx.stroke();
        ctx.fillStyle = '#c58a4e';
        circle(-17, 0, 5, true);
        circle(17, 0, 5, true);
      } else if (shot.kind === 'farm') {
        ctx.globalAlpha = clamp(1 - Math.max(0, p - .78) / .22, 0, 1);
        ctx.strokeStyle = 'rgba(255,244,213,.44)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(lerp(startX, endX, .62), lerp(startY, endY, .62));
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.translate(endX, endY);
        ctx.rotate(p * Math.PI * 4 + (shot.x - startX) * .006);
        ctx.shadowColor = 'rgba(255,207,74,.65)';
        ctx.shadowBlur = 7;
        ctx.fillStyle = '#fff4d5';
        ctx.strokeStyle = '#8b6038';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(0, 0, 8, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.75)';
        ctx.beginPath();
        ctx.ellipse(-2.5, -3.5, 2, 3.5, -.35, 0, Math.PI * 2);
        ctx.fill();
      } else if (shot.kind === 'volcano') {
        ctx.globalAlpha = 1 - p;
        const dartAngle = Math.atan2(endY - startY, endX - startX);
        ctx.strokeStyle = 'rgba(255,240,216,.48)';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(lerp(startX, endX, .64), lerp(startY, endY, .64));
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.translate(endX, endY);
        ctx.rotate(dartAngle);
        if (state.width <= 520) ctx.scale(1.12, 1.12);
        ctx.shadowColor = '#ff5d9d';
        ctx.shadowBlur = 8;
        ctx.strokeStyle = '#fff0d8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(-17, 0);
        ctx.lineTo(10, 0);
        ctx.stroke();
        ctx.fillStyle = '#ff5d9d';
        triangle(9, -5, 21, 0, 9, 5, false);
        ctx.fillStyle = '#ffcf4a';
        triangle(-18, 0, -26, -8, -12, -3, false);
        triangle(-18, 0, -26, 8, -12, 3, false);
      } else {
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = shot.kind === 'finale' ? '#b991ff' : '#fff7c2';
        ctx.lineWidth = 4 - p * 2;
        ctx.beginPath();
        ctx.moveTo(lerp(startX, endX, .55), lerp(startY, endY, .55));
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.fillStyle = shot.kind === 'finale' ? '#ff5d9d' : '#ffcf4a';
        circle(endX, endY, 7 + p * 8, false);
      }
      ctx.restore();
    }
  }

  function drawParticles(now) {
    state.particles = state.particles.filter(p => now - p.born < p.life);
    for (const p of state.particles) {
      const age = (now - p.born) / 1000;
      const alpha = clamp(1 - (now - p.born) / p.life, 0, 1);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.translate(p.x + p.vx * age, p.y + p.vy * age + 120 * age * age);
      ctx.rotate(age * 8);
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();
    }
  }

  function drawLabels(now) {
    state.labels = state.labels.filter(label => now - label.born < 720);
    for (const label of state.labels) {
      const p = (now - label.born) / 720;
      ctx.save();
      ctx.globalAlpha = clamp(1 - p, 0, 1);
      ctx.fillStyle = label.color;
      ctx.strokeStyle = 'rgba(45,28,18,.72)';
      ctx.lineWidth = 5;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `${label.size}px "Bebas Neue", sans-serif`;
      ctx.strokeText(label.text, label.x, label.y - p * 42);
      ctx.fillText(label.text, label.x, label.y - p * 42);
      ctx.restore();
    }
  }

  function circle(x, y, r, stroke) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    if (stroke) ctx.stroke();
  }

  function ellipse(x, y, rx, ry, stroke) {
    ctx.beginPath();
    ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    if (stroke) ctx.stroke();
  }

  function triangle(x1, y1, x2, y2, x3, y3, stroke) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineTo(x3, y3);
    ctx.closePath();
    ctx.fill();
    if (stroke) ctx.stroke();
  }

  function leg(x, y) {
    ctx.strokeStyle = COLORS.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y + 14);
    ctx.lineTo(x + 7, y + 14);
    ctx.stroke();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  }

  function starPath(x, y, outer, inner, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
      const radius = i % 2 ? inner : outer;
      const angle = -Math.PI / 2 + (i * Math.PI) / points;
      const px = x + Math.cos(angle) * radius;
      const py = y + Math.sin(angle) * radius;
      if (!i) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function mod(value, divisor) { return ((value % divisor) + divisor) % divisor; }
  function easeInOut(p) {
    const value = clamp(p, 0, 1);
    return value < .5 ? 2 * value * value : 1 - ((-2 * value + 2) ** 2) / 2;
  }
  function easeOut(p) {
    const value = clamp(p, 0, 1);
    return 1 - ((1 - value) ** 3);
  }
})();
