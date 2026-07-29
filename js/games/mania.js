/* global SFX, ArcadeMusic, getAudioCtx, nav, setArcadeExitVisible, GAME_CHARS, getGlobalChar, _getImg */
// Moberino Mania
// Five original midway booths share one target scheduler, scoring language,
// and responsive canvas. Each scene owns its visible nouns, projectile, target
// motion, secret rule, payoff, and camera behavior.
(() => {
  'use strict';

  const ROUND_SECONDS = 20;
  const FINALE_PHASE_SECONDS = 20;
  const FINALE_SECONDS = FINALE_PHASE_SECONDS * 3;
  const WORLD_LENGTH = 5600;
  const FINALE_WORLD_LENGTH = 2400;
  const ORBIT_FREEZE_SECONDS = 5.25;
  const BEST_KEY = 'moberino-mania-circuit-best-v1';
  const BOOTHS = [
    {
      id: 'farm',
      title: 'FARM FRENZY',
      short: 'FARM',
      accent: '#ffcf4a',
      hudLabel: 'BARN HITS',
      goal: 3,
      intro: 'Pop foreground animals, track the sliding middle lane, and pick off small high-value hill targets. Hit the barn door 3 times to open its prize.',
      prompt: 'POP · TRACK · HIT THE BARN 3 TIMES!',
    },
    {
      id: 'orbit',
      title: 'RAPID RINGS',
      short: 'RINGS',
      accent: '#6de8ff',
      hudLabel: 'FORMATIONS',
      goal: 1,
      intro: 'Three rings freezes a Moon Mobe. Freeze all 5 at once to summon the Ringmaster Robot, then rapid-fire rings into its mouth.',
      prompt: 'CLEAR THE 5 · THEN FEED THE ROBOT!',
    },
    {
      id: 'plates',
      title: 'TANK BLAST',
      short: 'TANK',
      accent: '#ff8c68',
      hudLabel: 'SHIELD HITS',
      goal: 5,
      intro: 'Green front doors are large, slow, and frequent. Amber middle doors are quicker. Red back doors are small, rare, and worth the most. Edge beavers tease, hold, then retreat.',
      prompt: 'GREEN SLOW · AMBER QUICK · RED FLASH!',
    },
    {
      id: 'volcano',
      title: 'VOLCANIC POP',
      short: 'VOLCANO',
      accent: '#ff5d9d',
      hudLabel: 'ERUPTION STEPS',
      goal: 3,
      intro: 'Clear every glowing balloon in 3 formations to erupt the volcano. Dim edge balloons are optional low-score bait.',
      prompt: 'CLEAR 3 GLOWING FORMATIONS TO ERUPT!',
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
      combo: 0,
      bestCombo: 0,
      hits: 0,
      taps: 0,
      special: 0,
      hiddenMobesFound: 0,
      hiddenMobeTotal: 2,
      bonusTriggered: false,
      eruptionAt: 0,
      volcanoStage: 0,
      volcanoStageReadyAt: 0,
      targets: [],
      particles: [],
      labels: [],
      shots: [],
      ringFlights: [],
      formationWave: 0,
      formationRespawnAt: 0,
      orbitBossActive: false,
      orbitBossAt: 0,
      finalePhase: -1,
      finaleWave: 0,
      finaleRespawnAt: 0,
      finaleClearedWave: -1,
      rapidUnlocked: false,
      rapidTapCount: 0,
      barnHits: 0,
      barnTier: 0,
      barnDoorCooldown: 0,
      barnBonusActive: false,
      barnBonusTarget: null,
      barns: [],
      props: [],
      direction: 1,
      lastHitAt: -99,
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
    ManiaMusic.stop();
    if (resizeObserver) resizeObserver.disconnect();
    resizeObserver = null;
    canvas = null;
    ctx = null;
    stage = null;
    document.body?.classList.remove('mania-compact-landscape');
    document.body?.classList.remove('mania-landscape');
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
    if (id === 'plates') buildPlateRound();
    if (id === 'volcano') buildVolcanoRound();
    if (id === 'finale') buildFinaleRound();
    buildHiddenMobes(id);
    state.targets.sort((a, b) => a.at - b.at);
  }

  function roundDuration(boothId = currentBooth()?.id) {
    return boothId === 'finale' ? FINALE_SECONDS : ROUND_SECONDS;
  }

  function buildHiddenMobes(boothId) {
    const placements = {
      farm: [
        { anchorX: .12, lane: .58, cover: 'hay' },
        { anchorX: .89, lane: .42, cover: 'bush' },
      ],
      orbit: [
        { progress: .27, lane: .34, cover: 'moonRock' },
        { progress: .73, lane: .61, cover: 'satellite' },
      ],
      plates: [
        { anchorX: .08, lane: .57, cover: 'crate' },
        { anchorX: .91, lane: .29, cover: 'barrel' },
      ],
      volcano: [
        { anchorX: .13, lane: .59, cover: 'lavaRock' },
        { anchorX: .87, lane: .34, cover: 'balloonBush' },
      ],
      finale: [
        { progress: .21, lane: .36, cover: 'window' },
        { progress: .79, lane: .61, cover: 'neonSign' },
      ],
    };
    (placements[boothId] || []).forEach((placement, index) => {
      const character = hiddenCharacterFor(boothId, index);
      state.targets.push({
        kind: 'hiddenMobe',
        type: 'hiddenMoberino',
        at: 0,
        duration: roundDuration(boothId),
        worldX: Number.isFinite(placement.progress)
          ? (boothId === 'finale' ? FINALE_WORLD_LENGTH : WORLD_LENGTH) * placement.progress
          : undefined,
        anchorX: placement.anchorX,
        lane: placement.lane,
        cover: placement.cover,
        variant: index,
        character,
        base: 1000,
        hiddenMobe: true,
        hit: false,
      });
    });
  }

  function hiddenCharacterFor(boothId, index) {
    if (typeof GAME_CHARS === 'undefined' || !GAME_CHARS.length) return null;
    const playerIndex = typeof getGlobalChar === 'function' ? getGlobalChar() : -1;
    const pool = GAME_CHARS.filter((character, characterIndex) => characterIndex !== playerIndex);
    const boothIndex = Math.max(0, BOOTHS.findIndex(booth => booth.id === boothId));
    return pool[(boothIndex * 3 + index * 7) % pool.length] || GAME_CHARS[0];
  }

  function buildFarmRound() {
    const animals = ['pig', 'cow', 'sheep', 'duck', 'chicken'];
    const popAnchors = [.18, .38, .61, .82];
    const midAnchors = [.14, .37, .61, .87];
    const hillAnchors = [.17, .43, .87];
    const waveTimes = [.55, 5.15, 9.75, 14.35];

    // The farm now runs as four readable arrangements instead of three
    // unrelated continuous streams. Each wave reveals from physical scenery,
    // holds long enough for a choice, then fully retreats before the next one.
    waveTimes.forEach((waveAt, wave) => {
      const foregroundSlots = wave % 2 ? [1, 3, 0] : [0, 2, 3];
      foregroundSlots.forEach((slot, index) => {
        const type = animals[(wave * 2 + index) % animals.length];
        state.targets.push({
          kind: 'farmPop',
          type,
          at: waveAt + index * .12,
          duration: 3.15,
          anchorX: popAnchors[slot],
          lane: .79 + (slot % 2) * .035,
          base: type === 'duck' || type === 'chicken' ? 150 : 100,
          drawLayer: 4,
          wave,
          hit: false,
        });
      });

      const middleSlots = wave % 2 ? [0, 2] : [1, 3];
      middleSlots.forEach((slot, index) => {
        const type = animals[(wave * 3 + index + 2) % animals.length];
        state.targets.push({
          kind: 'farmSlide',
          type,
          at: waveAt + .58 + index * .16,
          duration: 2.75,
          anchorX: midAnchors[slot],
          slideFrom: index % 2 ? .055 : -.055,
          lane: .55 + (slot % 2) * .045,
          base: type === 'duck' || type === 'chicken' ? 350 : 300,
          drawLayer: 3,
          wave,
          hit: false,
        });
      });

      const distantCount = wave === 2 ? 2 : 1;
      for (let index = 0; index < distantCount; index += 1) {
        const slot = (wave + index * 2) % hillAnchors.length;
        const golden = wave === 2 && index === 1;
        state.targets.push({
          kind: 'farmHill',
          type: animals[(wave + index + 1) % animals.length],
          at: waveAt + 1.08 + index * .18,
          duration: 2.3,
          anchorX: hillAnchors[slot],
          lane: .31 + (slot % 2) * .035,
          base: golden ? 1000 : 650,
          golden,
          drawLayer: 1,
          wave,
          hit: false,
        });
      }
    });

    // Keep one deliberate aerial choice moving through the open sky between
    // the paddock reveals. These slower passes restore the birds without
    // turning the layered farm back into a screen-wide frenzy.
    const birdPasses = [
      [1.05, .17, 'right', 'bird', 500],
      [5.45, .24, 'left', 'bluebird', 650],
      [9.85, .15, 'right', 'bird', 500],
      [14.25, .22, 'left', 'bluebird', 1000],
    ];
    birdPasses.forEach((pass, index) => {
      state.targets.push({
        kind: 'flyer',
        type: pass[3],
        at: pass[0],
        duration: 4.15,
        direction: pass[2],
        lane: pass[1],
        base: pass[4],
        golden: index === birdPasses.length - 1,
        drawLayer: 0,
        hit: false,
      });
    });

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

  function buildOrbitRound() {
    // Five large targets remain together as one readable formation. Three
    // landed rings freezes one target; all five must be frozen simultaneously.
    const formation = [
      [.34, .51], [.66, .51],
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
        requiredRings: 3,
        rings: 0,
        ringWindow: 2.35,
        freezeWindow: ORBIT_FREEZE_SECONDS,
        base: 225,
        hit: false,
      });
    }

    // Bonus aliens materialize in the open upper sky, hold long enough for a
    // deliberate ring throw, warn with a brief shake, then blast straight off.
    // They never cross the main formation or behave like random traffic.
    const launchAppearances = [
      [1.05, .18, .17],
      [4.15, .5, .23],
      [7.25, .82, .16],
      [10.35, .3, .25],
      [13.45, .7, .2],
      [16.55, .5, .14],
    ];
    launchAppearances.forEach((appearance, i) => {
      state.targets.push({
        kind: 'phaseFlyer',
        type: i % 4 === 0 ? 'cometMobe' : 'ghostMobe',
        at: appearance[0],
        duration: 2.75,
        anchorX: appearance[1],
        lane: appearance[2],
        wave: i % 4,
        base: i % 4 === 0 ? 700 : 350,
        golden: i % 4 === 0,
        hit: false,
      });
    });
  }

  function buildPlateRound() {
    const tiers = [
      { type: 'standard', base: 250, openWindow: 1.15, period: 2.6, size: 1.04, transition: .22, warning: .52 },
      { type: 'foreman', base: 700, openWindow: .68, period: 3.25, size: .8, transition: .15, warning: .44 },
      { type: 'expert', base: 1600, openWindow: .34, period: 4.4, size: .56, transition: .09, warning: .38 },
    ];

    const stations = [
      // Back row: two rare, tiny red flash doors.
      [.28, .23, 2], [.72, .23, 2],
      // Middle row: two amber timing doors.
      [.27, .44, 1], [.73, .44, 1],
      // Front row: three large, frequent green doors.
      [.18, .66, 0], [.5, .64, 0], [.82, .66, 0],
    ];

    // The shield gallery is stationary. Perspective, scale, and row placement
    // create depth while simultaneous opening windows preserve player choice.
    stations.forEach((station, i) => {
      const tierIndex = station[2];
      const tier = tiers[tierIndex];
      const depthScale = station[1] < .3 ? .82 : station[1] < .5 ? .9 : 1;
      state.targets.push({
        kind: 'shieldBeaver',
        type: tier.type,
        at: 0,
        duration: ROUND_SECONDS,
        anchorX: station[0],
        anchorY: station[1],
        base: tier.base,
        openWindow: tier.openWindow,
        shieldPeriod: tier.period,
        doorTransition: tier.transition,
        warningWindow: tier.warning,
        cycleOffset: (i * .73) % tier.period,
        targetScale: tier.size * depthScale,
        tier: tierIndex,
        spent: false,
        hit: false,
      });
    });

    // Five authored edge teases leave recovery space between appearances.
    // Each beaver peeks perpendicular to the frame, holds, then retreats.
    const edgePeeks = [
      [2.0, 'left', .23],
      [5.7, 'right', .39],
      [9.4, 'left', .55],
      [13.1, 'right', .27],
      [16.8, 'left', .46],
    ];
    edgePeeks.forEach((peek, i) => {
      state.targets.push({
        kind: 'beaverPeek',
        type: i % 4 === 3 ? 'foreman' : 'standard',
        at: peek[0],
        duration: i % 4 === 3 ? 2.25 : 2.55,
        side: peek[1],
        lane: peek[2],
        base: i % 4 === 3 ? 850 : 400,
        targetScale: i % 4 === 3 ? .72 : .82,
        hit: false,
      });
    });
  }

  function buildVolcanoRound() {
    state.volcanoStage = 0;
    state.volcanoStageReadyAt = 0;
    spawnVolcanoStage(0, .45);

    // Low-score balloons are intentionally permanent bait. They vanish briefly
    // when popped, then refill the lower and side lanes throughout all stages.
    const decoys = [
      [.08, .72], [.21, .81], [.79, .81], [.92, .72],
      [.09, .48], [.91, .48],
    ];
    decoys.forEach((anchor, i) => {
      state.targets.push({
        kind: 'volcanoDecoy',
        type: 'treeBalloon',
        at: 0,
        duration: ROUND_SECONDS,
        anchorX: anchor[0],
        anchorY: anchor[1],
        base: 75,
        hue: i % 3,
        repeatable: true,
        hit: false,
      });
    });

  }

  function spawnVolcanoStage(stageIndex, at) {
    // Required skinny lava balloons sit directly on the volcano instead of
    // floating among decorative tree balloons. Each step adds another piece
    // to the readable lava formation.
    const formations = [
      [[.41,.48],[.5,.37],[.59,.48]],
      [[.36,.56],[.44,.43],[.56,.43],[.64,.56]],
      [[.32,.62],[.39,.51],[.46,.39],[.54,.39],[.61,.51],[.68,.62]],
    ];
    const formation = formations[stageIndex] || formations[formations.length - 1];
    formation.forEach((anchor, i) => {
      state.targets.push({
        kind: 'lavaBalloon',
        type: 'lavaStream',
        at,
        duration: Math.max(.5, ROUND_SECONDS - at),
        anchorX: anchor[0],
        anchorY: anchor[1],
        stageIndex,
        stageTarget: true,
        enterFrom: i % 2 ? 1 : -1,
        vent: true,
        base: 450 + stageIndex * 200 + i * 100,
        hue: 3 + stageIndex,
        hit: false,
      });
    });
  }

  function buildFinaleRound() {
    // Phase 1: one central opener unfolds a roomy seven-target horseshoe.
    // Clearing the full display brings up a fresh bank until the phase ends.
    spawnFinaleStaticWave(0, 0);

    // Phase 2: a deliberately paced left-to-right pass. Targets are smaller,
    // staggered across lanes, and still unfold for players who track a bank.
    for (let i = 0; i < 11; i += 1) {
      state.targets.push({
        kind: 'revealPanel',
        type: i % 3 ? 'starTarget' : 'neonTarget',
        at: FINALE_PHASE_SECONDS,
        duration: FINALE_PHASE_SECONDS,
        worldX: 120 + i * ((FINALE_WORLD_LENGTH - 240) / 10),
        lane: .2 + (i % 4) * .145,
        finalePhase: 1,
        tier: i % 4 === 0 ? 1 : 0,
        branch: 10 + i,
        base: i % 4 === 0 ? 650 : 350,
        hit: false,
      });
    }

    // Phase 3: one fixed lock bank must be cleared before the escalating
    // rapid-fire target appears. Faster clearing buys more tapping time.
    const finalLocks = [
      [.18,.29,750], [.4,.25,1500], [.62,.25,1500], [.84,.29,750],
      [.29,.55,2500], [.5,.49,4000], [.71,.55,2500],
    ];
    finalLocks.forEach((lock, i) => {
      state.targets.push({
        kind: 'finaleGate',
        type: lock[2] >= 4000 ? 'jewelTarget' : lock[2] >= 2000 ? 'starTarget' : 'neonTarget',
        at: FINALE_PHASE_SECONDS * 2 + .25,
        duration: FINALE_PHASE_SECONDS - .25,
        anchorX: lock[0],
        anchorY: lock[1],
        finalePhase: 2,
        base: lock[2],
        precision: lock[2] >= 4000 ? .72 : lock[2] >= 2000 ? .84 : .96,
        golden: lock[2] >= 4000,
        finalLock: true,
        lockIndex: i,
        hit: false,
      });
    });
  }

  function spawnFinaleStaticWave(wave, at) {
    state.targets.push({
      kind: 'revealPanel',
      type: 'jewelTarget',
      at,
      duration: Math.max(.1, FINALE_PHASE_SECONDS - at),
      anchorX: .5,
      lane: .43,
      finalePhase: 0,
      wave,
      waveBornAt: at,
      tier: 0,
      branch: wave * 100,
      base: 500 + wave * 100,
      unfoldHub: true,
      hit: false,
    });
  }

  function unfoldFinaleBank(target) {
    // A broad horseshoe keeps the middle of the stage open and makes every
    // scoring choice readable. The outer/lower targets are the safer 500s;
    // the smaller, higher targets carry the premium values.
    const unfoldedTargets = [
      [.13, .43, 750],
      [.27, .25, 1250],
      [.43, .17, 1750],
      [.57, .17, 1750],
      [.73, .25, 1250],
      [.87, .43, 750],
      [.5, .58, 500],
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
        unfoldLeaf: true,
        hit: false,
      });
    });
    showToast('TARGET BANK UNFOLDS · CLEAR ALL 7!', true, 1050);
    burst(state.width * .5, state.height * .43, '#b991ff', 24, 1.12);
  }

  function loop(now) {
    if (!state || !ctx || !canvas) return;
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
      combo: state.bestCombo,
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

    state.shots.push({ x, y, born: performance.now(), kind: currentBooth().id });

    let best = null;
    let bestDistance = Infinity;
    let blockedShield = null;
    for (const target of state.targets) {
      const pos = targetPosition(target, state.elapsed);
      if (!pos || (target.hit && !target.repeatable)) continue;
      const distance = Math.hypot(x - pos.x, y - pos.y);
      if (target.kind === 'shieldBeaver' && pos.hittable === false && distance <= pos.r * 1.14) {
        blockedShield = { target, pos };
        continue;
      }
      if (pos.hittable === false) continue;
      if (distance <= pos.r * 1.12 && distance < bestDistance) {
        best = { target, pos };
        bestDistance = distance;
      }
    }

    if (!best) {
      state.combo = 0;
      const blocked = !!blockedShield;
      addLabel(x, y, blocked ? 'SHIELDED!' : 'MISS', blocked ? '#ffcf4a' : '#fff4d5', blocked ? 18 : 15);
      burst(x, y, blocked ? '#ff8c68' : '#e7d8b1', blocked ? 8 : 5, .75);
      try { SFX.miss(); } catch (e) {}
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
        state.combo = 0;
        addLabel(flight.x, flight.y - 8, 'BOUNCE!', '#fff4d5', 17);
        burst(flight.x, flight.y, '#6de8ff', 7, .78);
        try { SFX.miss(); } catch (e) {}
      }
    }
    state.ringFlights = state.ringFlights.filter(flight => state.elapsed - flight.landsAt < .55);
  }

  function hitTarget(target, pos) {
    if (target.kind === 'shieldBeaver') {
      hitShieldBeaver(target, pos);
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
    if (target.kind === 'volcanoDecoy') {
      hitVolcanoDecoy(target, pos);
      return;
    }
    const nowSeconds = state.elapsed;
    target.hit = true;
    target.hitAt = nowSeconds;
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
      addLabel(pos.x, pos.y - pos.r * 1.35, 'WHACK!', '#fff7d9', 44);
      burst(pos.x, pos.y, '#ffcf4a', 28, 1.35);
      const foundName = target.character?.name ? ` · ${target.character.name}` : '';
      showToast(`WHACK!${foundName} ${state.hiddenMobesFound}/${state.hiddenMobeTotal}`, true, 1700);
      try { SFX.mysteryGood(); } catch (e) {}
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

  function hitShieldBeaver(target, pos) {
    target.spent = true;
    target.spentUntil = state.elapsed + 1.05 + target.tier * .18;
    target.hitAt = state.elapsed;
    state.special += 1;
    const specialHit = target.tier >= 1;
    awardTargetHit(target, pos, target.base, specialHit);
    const labels = ['STANDARD', 'FOREMAN', 'EXPERT'];
    addLabel(pos.x, pos.y - pos.r * 1.15, `${labels[target.tier]} HIT!`, specialHit ? '#ffcf4a' : '#fff7d9', 20);
    if (target.tier === 2) {
      showToast(`EXPERT WINDOW! +${target.base}`, true, 760);
      try { SFX.score(); } catch (e) {}
    }
    updateHud();
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
        type: 'cow',
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
    state.combo = target.hits;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.lastHitAt = state.elapsed;
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
    awardTargetHit(target, pos, target.base, false);
    volcanoSpray(pos.x, pos.y, false);
    target.cooldownUntil = state.elapsed + .7 + Math.random() * .65;
    target.respawnAt = target.cooldownUntil;
    target.hue = (target.hue + 1 + Math.floor(Math.random() * 2)) % 3;
    addLabel(pos.x, pos.y - pos.r, 'BAIT +75', '#fff7d9', 16);
    updateHud();
  }

  function awardTargetHit(target, pos, base, specialHit, sizeBonus = 1) {
    const nowSeconds = state.elapsed;
    state.hits += 1;
    state.combo = nowSeconds - state.lastHitAt <= 1.35 ? Math.min(5, state.combo + 1) : 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.lastHitAt = nowSeconds;
    const gained = base * state.combo * sizeBonus;
    state.score += gained;
    addLabel(pos.x, pos.y - pos.r, `+${gained}${state.combo > 1 ? `  x${state.combo}` : ''}`, specialHit ? currentBooth().accent : '#fff7d9', specialHit ? 25 : 20);
    burst(pos.x, pos.y, specialHit ? currentBooth().accent : targetColor(target), specialHit ? 18 : 11, 1);
    try { specialHit ? SFX.score() : SFX.hit(); } catch (e) {}
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
      showToast(`FROZEN ${frozen}/5 · ${target.freezeWindow.toFixed(1)}s TO CLEAR!`, true, 900);
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
      formation.length !== 5 ||
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
    state.targets = state.targets.filter(target => target.kind !== 'phaseFlyer');
    state.targets.push({
      kind: 'orbitBoss',
      type: 'ringmasterRobot',
      at: state.orbitBossAt,
      duration: Math.max(.5, ROUND_SECONDS - state.orbitBossAt),
      base: 100,
      repeatable: true,
      mouthStage: 0,
      mouthOpen: 0,
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
    state.combo = nowSeconds - state.lastHitAt <= .9 ? Math.min(12, state.combo + 1) : 1;
    state.bestCombo = Math.max(state.bestCombo, state.combo);
    state.lastHitAt = nowSeconds;
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
      state.combo = 0;
      state.finaleRespawnAt = 0;
      const messages = [
        'PHASE 1 · OPEN & CLEAR THE BANK',
        'PHASE 2 · PRECISION SCROLL',
        'PHASE 3 · CLEAR 7 LOCKS TO UNLOCK RAPID FIRE',
      ];
      showToast(messages[phase], true, 1700);
      if (phase > 0) {
        burst(state.width * .5, state.height * .18, phase === 1 ? '#6de8ff' : '#ffcf4a', 26, 1.1);
        try { SFX.score(); } catch (e) {}
      }
    }
    if (phase === 0) processFinaleStaticWaves();
    if (phase === 2) processFinaleRapidFire();
  }

  function processFinaleRapidFire() {
    if (state.rapidUnlocked) return;
    const locks = state.targets.filter(target => target.finalLock);
    if (locks.length !== 7 || locks.some(target => !target.hit)) return;
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
    if (state.finaleRespawnAt) {
      if (state.elapsed < state.finaleRespawnAt) return;
      state.finaleRespawnAt = 0;
      state.finaleWave += 1;
      spawnFinaleStaticWave(state.finaleWave, state.elapsed);
      showToast(`TARGET BANK ${state.finaleWave + 1} RISES!`, true, 950);
      return;
    }
    const active = state.targets.filter(target =>
      target.kind === 'revealPanel' &&
      target.finalePhase === 0 &&
      target.wave === state.finaleWave
    );
    if (!active.length || active.some(target => !target.hit) || state.finaleClearedWave === state.finaleWave) return;
    state.finaleClearedWave = state.finaleWave;
    const clearBonus = 2000 + state.finaleWave * 500;
    state.score += clearBonus;
    addLabel(state.width * .5, state.height * .45, `BANK CLEAR +${clearBonus}`, '#ffcf4a', 30);
    burst(state.width * .5, state.height * .45, '#b991ff', 28, 1.18);
    if (state.elapsed < FINALE_PHASE_SECONDS - .55) {
      state.finaleRespawnAt = state.elapsed + .42;
    }
    try { SFX.mysteryGood(); } catch (e) {}
  }

  function processVolcanoStages() {
    if (state.bonusTriggered) return;
    if (state.volcanoStageReadyAt) {
      if (state.elapsed < state.volcanoStageReadyAt) return;
      state.volcanoStageReadyAt = 0;
      if (state.special >= currentBooth().goal) {
        triggerEruption();
        return;
      }
      state.volcanoStage = state.special;
      spawnVolcanoStage(state.volcanoStage, state.elapsed + .08);
      showToast(`FORMATION ${state.volcanoStage + 1}/3 · CLEAR EVERY GLOWING BALLOON`, true, 1450);
      return;
    }
    const active = state.targets.filter(target =>
      target.stageTarget &&
      target.stageIndex === state.volcanoStage
    );
    if (!active.length || active.some(target => !target.hit)) return;
    state.special = state.volcanoStage + 1;
    state.volcanoStageReadyAt = state.elapsed + .72;
    showToast(`★ FORMATION ${state.special}/3 CLEARED! ★`, true, 1200);
    try { SFX.score(); } catch (e) {}
    updateHud();
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
      try { SFX.miss(); } catch (e) {}
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

  function targetPosition(target, elapsed) {
    const local = elapsed - target.at;
    if (local < 0 || local > target.duration) return null;
    if (
      currentBooth().id === 'orbit' &&
      state.orbitBossActive &&
      target.kind !== 'orbitBoss' &&
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
      const p = clamp(local / target.duration, 0, 1);
      const rise = p < .18
        ? easeOut(p / .18)
        : p > .76
          ? easeInOut((1 - p) / .24)
          : 1;
      x = w * target.anchorX;
      y = lerp(h * .94, h * target.lane, rise);
      scale *= 1.08;
      visibility = clamp(rise * 1.8, 0, 1);
      hittable = rise > .55;
    } else if (target.kind === 'farmSlide') {
      const p = clamp(local / target.duration, 0, 1);
      const reveal = p < .2
        ? easeOut(p / .2)
        : p > .76
          ? easeInOut((1 - p) / .24)
          : 1;
      const slide = easeInOut(clamp(p / .7, 0, 1));
      x = w * (target.anchorX + target.slideFrom * (1 - slide))
        + Math.sin(p * Math.PI) * w * target.slideFrom * .35;
      y = lerp(h * .69, h * target.lane, reveal);
      scale *= .88;
      visibility = clamp(reveal * 1.7, 0, 1);
      hittable = reveal > .55;
    } else if (target.kind === 'farmHill') {
      const p = clamp(local / target.duration, 0, 1);
      const reveal = p < .22
        ? easeOut(p / .22)
        : p > .72
          ? easeInOut((1 - p) / .28)
          : 1;
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
      y = g.groundY - g.h * .35 + (1 - rise) * g.h * .28;
      scale = g.scale * .66;
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
      x = travel();
      y = h * target.lane + Math.sin(local * 5.4 + target.at) * h * .055;
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
        y += clamp(h * .025, 10, 20);
        scale *= .9;
        visibility = .84;
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
      const appear = easeOut(clamp(p / .18, 0, 1));
      const blast = easeInOut(clamp((p - .74) / .26, 0, 1));
      const warning = clamp(1 - Math.abs(p - .7) / .06, 0, 1);
      x = w * target.anchorX + Math.sin(local * 38) * warning * 7;
      y = h * target.lane;
      if (p < .18) y += (1 - appear) * h * .09;
      if (blast > 0) y = lerp(y, -h * .18, blast);
      visibility = p < .18 ? appear : p > .94 ? (1 - p) / .06 : 1;
      growth = .78 + appear * .22 + warning * .05;
      scale *= (target.type === 'cometMobe' ? .82 : 1) * growth;
      target.blastProgress = blast;
      hittable = appear > .72 && blast < .34;
    } else if (target.kind === 'orbitBoss') {
      const arrival = easeOut(clamp(local / .72, 0, 1));
      const activeAge = Math.max(0, local - .72);
      const cycleDuration = 3.3;
      const cycleAge = mod(activeAge, cycleDuration);
      const mouthStage = Math.floor(activeAge / cycleDuration);
      const opening = easeOut(clamp(cycleAge / .32, 0, 1));
      const closing = easeInOut(clamp((cycleAge - 2.62) / .68, 0, 1));
      const mouthOpen = opening * (1 - closing);
      x = w * .5;
      y = lerp(h * 1.14, h * .52, arrival);
      scale = 1;
      visibility = arrival;
      growth = .9 + arrival * .1;
      target.mouthStage = mouthStage;
      target.mouthOpen = mouthOpen;
      target.base = orbitBossValue(mouthStage);
      hittable = arrival > .92 && mouthOpen > .72;
      return {
        x,
        y,
        r: Math.min(w * .19, h * .18),
        scale,
        visibility,
        growth,
        hittable,
        mouthOpen,
      };
    } else if (target.kind === 'shieldBeaver') {
      if (target.spent && elapsed >= target.spentUntil) {
        target.spent = false;
        target.cycleOffset = mod(.18 - elapsed, target.shieldPeriod);
      }
      x = w * target.anchorX;
      y = h * target.anchorY;
      const phase = mod(elapsed + target.cycleOffset, target.shieldPeriod);
      const warningStart = target.shieldPeriod - target.openWindow - target.warningWindow;
      const openStart = target.shieldPeriod - target.openWindow;
      const openAge = phase - openStart;
      const opening = openAge < target.doorTransition
        ? easeOut(clamp(openAge / target.doorTransition, 0, 1))
        : openAge > target.openWindow - target.doorTransition
          ? easeInOut(clamp((target.openWindow - openAge) / target.doorTransition, 0, 1))
          : 1;
      const openAmount = target.spent || phase < openStart ? 0 : clamp(opening, 0, 1);
      target.visualOpen = openAmount;
      target.shieldWarning = !target.spent && phase >= warningStart && phase < openStart;
      scale *= target.targetScale;
      growth = openAmount;
      return {
        x,
        y,
        r: 48 * scale,
        scale,
        visibility,
        growth,
        openAmount,
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
    } else if (target.kind === 'balloonTree' || target.kind === 'lavaBalloon' || target.kind === 'volcanoDecoy') {
      if (target.cooldownUntil && elapsed < target.cooldownUntil) return null;
      if (target.type === 'eruptionBalloon' && Number.isFinite(target.anchorX)) {
        const p = easeOut(clamp(local / .7, 0, 1));
        x = lerp(w * .5, w * target.anchorX, p);
        y = lerp(h * .37, h * target.anchorY, p) - Math.sin(clamp(local / target.duration, 0, 1) * Math.PI) * h * .16;
      } else if (Number.isFinite(target.anchorX)) {
        const entrance = easeOut(clamp(local / .48, 0, 1));
        x = w * target.anchorX + (target.enterFrom || 0) * (1 - entrance) * w * .22;
        y = h * target.anchorY + (1 - entrance) * h * .22;
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
      scale *= target.type === 'lavaStream' ? .94 : target.kind === 'lavaBalloon' ? .86 : target.kind === 'volcanoDecoy' ? .72 : 1;
    } else if (target.kind === 'volcanoComet') {
      const p = easeInOut(clamp(local / target.duration, 0, 1));
      x = target.direction === 'left'
        ? w * 1.08 - p * w * 1.16
        : -w * .08 + p * w * 1.16;
      y = h * target.lane + Math.sin(p * Math.PI) * h * .075;
      scale *= .52;
      visibility = .58 + Math.sin(p * Math.PI) * .35;
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
      scale *= growth;
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
    if (x < -100 || x > w + 100) return null;
    const small = ['chicken', 'duck', 'bird', 'bluebird'].includes(target.type);
    const farmAnimal = ['farmPop', 'farmSlide', 'farmHill', 'farmBarnDoor', 'farmBarnBonus', 'runner', 'peek'].includes(target.kind);
    const balloonTarget = target.kind === 'balloonTree' || target.kind === 'lavaBalloon' || target.kind === 'volcanoDecoy';
    const targetRadius = target.kind === 'ringPost'
      ? 44
      : balloonTarget
        ? target.type === 'lavaStream' ? 38 : target.vent || target.golden ? 45 : target.kind === 'volcanoDecoy' ? 31 : 42
      : target.kind === 'volcanoComet'
        ? 31
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
      : target.kind === 'shieldBeaver'
        ? 48
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
      drawFarmDetails(w, h);
    } else if (boothId === 'orbit') {
      drawOrbitScene(w, h);
    } else if (boothId === 'plates') {
      drawPlateScene(w, h);
    } else if (boothId === 'volcano') {
      drawVolcanoScene(w, h);
    } else {
      drawFinaleScene(w, h);
    }

    // Barn targets sit in the dark doors. Drawing the buildings first lets the
    // animal remain readable while the rising motion still explains "hidden."
    if (boothId === 'farm') for (const barn of state.barns) drawBarn(barn);

    const targetsToDraw = boothId === 'farm'
      ? [...state.targets].sort((a, b) => (a.drawLayer || 3) - (b.drawLayer || 3))
      : state.targets;
    for (const target of targetsToDraw) {
      const pos = targetPosition(target, state.elapsed);
      if (!pos) continue;
      const hitAge = target.hit ? state.elapsed - target.hitAt : 0;
      ctx.save();
      if (target.hit && !target.formation) {
        ctx.globalAlpha = clamp(1 - hitAge / .42, 0, 1);
        ctx.translate(0, -hitAge * 70);
        ctx.scale(1 + hitAge * .6, 1 + hitAge * .6);
      }
      drawTarget(target, pos, now);
      ctx.restore();
    }

    if (boothId === 'farm') {
      drawFarmTargetMasks(w, h);
      drawForeground(w, h);
      drawFarmPointOverlays(now);
    }
    if (boothId === 'plates') drawToyTank(w, h);
    drawStageFrame(w, h, boothId);
    drawShots(now);
    drawParticles(now);
    drawLabels(now);
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
      drawImageCover(backdrop, w, h);
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

  function drawPlateScene(w, h) {
    const backdrop = typeof _getImg === 'function'
      ? _getImg('assets/mania/tank/tank-backdrop-v1.png')
      : null;
    if (backdrop?.complete && backdrop.naturalWidth) {
      drawImageCover(backdrop, w, h);
      const glaze = ctx.createLinearGradient(0, 0, 0, h);
      glaze.addColorStop(0, 'rgba(12,55,62,.04)');
      glaze.addColorStop(.58, 'rgba(242,164,112,.025)');
      glaze.addColorStop(1, 'rgba(9,13,18,.18)');
      ctx.fillStyle = glaze;
      ctx.fillRect(0, 0, w, h);
      drawTankRails(w, h);
      return;
    }
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#f4bf7b');
    sky.addColorStop(.5, '#d36f58');
    sky.addColorStop(1, '#3b3544');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);
    const cam = cameraX();
    ctx.fillStyle = '#6b4f47';
    ctx.beginPath();
    ctx.moveTo(0, h * .56);
    for (let x = 0; x <= w + 50; x += 55) {
      ctx.lineTo(x, h * (.4 + .1 * Math.sin((x + cam * .2) / 100)));
    }
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#282a31';
    ctx.fillRect(0, h * .66, w, h * .34);
    ctx.strokeStyle = '#8a765e';
    ctx.lineWidth = 5;
    for (let row = 0; row < 3; row += 1) {
      const y = h * (.31 + row * .16);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      for (let i = -1; i < Math.ceil(w / 90) + 2; i += 1) {
        const x = i * 90 - mod(cam * (.4 + row * .12), 90);
        ctx.fillStyle = '#4c3d39';
        ctx.fillRect(x - 4, y - 12, 8, 30);
      }
    }
    // Tiny cloth pennants make this a playful Moberino toy camp rather than a
    // military scene while preserving the physical target-range read.
    const pennants = ['#6de8ff','#ffcf4a','#ff8c68','#b991ff'];
    for (let i = 0; i < Math.ceil(w / 55) + 1; i += 1) {
      const x = i * 55 - mod(cam * .16, 55);
      ctx.fillStyle = pennants[i % pennants.length];
      triangle(x, h * .11, x + 24, h * .11, x + 12, h * .16, false);
    }
  }

  function drawTankRails(w, h) {
    const cam = cameraX();
    ctx.save();
    for (let row = 0; row < 3; row += 1) {
      const y = h * (.31 + row * .17);
      const depth = .68 + row * .16;
      ctx.fillStyle = `rgba(19,26,31,${.12 + row * .055})`;
      ctx.fillRect(0, y - 12 * depth, w, 25 * depth);
      ctx.strokeStyle = 'rgba(35,40,42,.7)';
      ctx.lineWidth = 5 + row * 2;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      ctx.strokeStyle = 'rgba(218,173,103,.48)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y - 2); ctx.lineTo(w, y - 2); ctx.stroke();
      const spacing = 122 - row * 12;
      for (let i = -1; i < Math.ceil(w / spacing) + 2; i += 1) {
        const x = i * spacing - mod(cam * (.38 + row * .13), spacing);
        ctx.fillStyle = '#263e45';
        ctx.strokeStyle = '#b77b45';
        ctx.lineWidth = 2;
        roundRect(x - 7, y - 13, 14, 28, 3);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#f0b85b';
        circle(x, y - 4, 2.2, true);
        circle(x, y + 7, 2.2, true);
      }
    }
    ctx.restore();
  }

  function drawToyTank(w, h) {
    const s = clamp(Math.min(w, h) / 520, .72, 1.3);
    const tankImage = typeof _getImg === 'function'
      ? _getImg('assets/mania/tank/toy-tank-v1.png')
      : null;
    if (tankImage?.complete && tankImage.naturalWidth) {
      const width = 225 * s;
      const height = 177 * s;
      ctx.save();
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath();
      ctx.ellipse(w * .5, h - 21 * s, width * .43, 13 * s, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.drawImage(tankImage, w * .5 - width / 2, h - height + 10 * s, width, height);
      ctx.restore();
      return;
    }
    ctx.save();
    // Keep the whole toy vehicle inside shorter phone/tablet stages.
    ctx.translate(w * .5, h - 54 * s);
    ctx.scale(s, s);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ellipse(0, 7, 66, 13, false);
    ctx.fillStyle = '#253c51';
    ctx.strokeStyle = '#15202c';
    ctx.lineWidth = 4;
    roundRect(-58, -30, 116, 36, 14); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ff8c68';
    for (let x = -40; x <= 40; x += 20) circle(x, -10, 8, true);
    ctx.fillStyle = '#466c74';
    roundRect(-29, -54, 58, 29, 10); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#d9f1e8';
    ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(14, -48); ctx.lineTo(72, -72); ctx.stroke();
    ctx.fillStyle = '#6de8ff';
    circle(0, -43, 7, false);
    ctx.restore();
  }

  function drawVolcanoScene(w, h) {
    const backdrop = typeof _getImg === 'function'
      ? _getImg('assets/mania/volcano/volcano-backdrop-v1.png')
      : null;
    if (backdrop?.complete && backdrop.naturalWidth) {
      drawImageCover(backdrop, w, h);
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
    if (state.bonusTriggered) {
      ctx.strokeStyle = 'rgba(255,223,85,.6)';
      ctx.lineWidth = 5;
      for (let i = 0; i < 7; i += 1) {
        ctx.beginPath();
        ctx.moveTo(w * .52, h * .35);
        ctx.quadraticCurveTo(w * (.28 + i * .08), h * .12, w * (.12 + i * .13), -10);
        ctx.stroke();
      }
    }
  }

  function drawVolcanoParallax(w, h) {
    const cam = cameraX();
    ctx.save();

    // Layered paper-rock flats drift at different rates so the booth still
    // reads as a traveling midway scene over its authored static foundation.
    ctx.fillStyle = 'rgba(16,21,31,.36)';
    for (let i = -2; i < Math.ceil(w / 180) + 3; i += 1) {
      const x = mod(i * 210 - cam * .18, w + 420) - 210;
      const rockH = 28 + (i % 3 + 3) % 3 * 12;
      ctx.beginPath();
      ctx.moveTo(x - 44, h * .73);
      ctx.lineTo(x - 18, h * .73 - rockH * .55);
      ctx.lineTo(x + 2, h * .73 - rockH);
      ctx.lineTo(x + 24, h * .73 - rockH * .42);
      ctx.lineTo(x + 48, h * .73);
      ctx.closePath();
      ctx.fill();
    }

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
        ctx.globalAlpha = strength;
        const baseX = w * .5;
        const baseY = h * .37;
        const colors = ['#ffcf4a', '#ff755d', '#ff5d9d', '#fff0a4'];
        for (let i = 0; i < 11; i += 1) {
          const spread = (i - 5) / 5;
          const crest = Math.sin(clamp(age / 1.5, 0, 1) * Math.PI);
          ctx.strokeStyle = colors[i % colors.length];
          ctx.lineWidth = 3 + (i % 3);
          ctx.beginPath();
          ctx.moveTo(baseX, baseY);
          ctx.quadraticCurveTo(
            baseX + spread * w * .16,
            baseY - h * (.12 + crest * .18),
            baseX + spread * w * (.2 + age * .035),
            baseY - h * (.08 + age * .11) + (i % 2) * 22,
          );
          ctx.stroke();
        }
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
      erupted ? 'VOLCANO ERUPTED · BONUS BALLOONS!' : 'CLEAR 3 GLOWING FORMATIONS TO ERUPT',
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
      drawImageCover(backdrop, w, h);
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
      const pulse = .25 + Math.abs(Math.sin(state.elapsed * 3.2)) * .18;
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

  function drawFarmDetails(w, h) {
    const fenceY = h * .67;
    ctx.save();
    // Three physical rails divide distant precision, midground tracking, and
    // close pop-up targets without covering the authored farm landscape.
    ctx.fillStyle = 'rgba(77,117,51,.42)';
    ctx.beginPath();
    ctx.moveTo(0, h * .44);
    ctx.quadraticCurveTo(w * .24, h * .39, w * .5, h * .45);
    ctx.quadraticCurveTo(w * .75, h * .5, w, h * .42);
    ctx.lineTo(w, h * .52);
    ctx.quadraticCurveTo(w * .72, h * .57, w * .48, h * .51);
    ctx.quadraticCurveTo(w * .23, h * .46, 0, h * .53);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#704829';
    ctx.lineWidth = Math.max(6, h * .014);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-20, fenceY + 10);
    ctx.lineTo(w + 20, fenceY + 10);
    ctx.moveTo(-20, fenceY + 34);
    ctx.lineTo(w + 20, fenceY + 34);
    ctx.stroke();
    ctx.strokeStyle = '#e4c27d';
    ctx.lineWidth = Math.max(4, h * .011);
    ctx.beginPath();
    ctx.moveTo(-20, fenceY + 7);
    ctx.lineTo(w + 20, fenceY + 7);
    ctx.moveTo(-20, fenceY + 31);
    ctx.lineTo(w + 20, fenceY + 31);
    ctx.stroke();

    for (let x = -10; x < w + 50; x += Math.max(84, w / 8)) {
      ctx.fillStyle = '#774929';
      ctx.strokeStyle = '#3f291e';
      ctx.lineWidth = 2;
      roundRect(x - 8, fenceY - 12, 16, 72, 5);
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d8aa5c';
      roundRect(x - 4, fenceY - 9, 7, 65, 3);
      ctx.fill();
      ctx.fillStyle = '#f3c44f';
      circle(x, fenceY + 6, 2.6, true);
      circle(x, fenceY + 31, 2.6, true);
    }

    // Brass suspension rods establish that the target banks are floating
    // mechanical scenery rather than painted bands in the backdrop.
    ctx.strokeStyle = 'rgba(89,52,32,.72)';
    ctx.lineWidth = 5;
    for (const x of [.14, .37, .61, .87]) {
      ctx.beginPath();
      ctx.moveTo(w * x, h * .61);
      ctx.lineTo(w * x, h * .72);
      ctx.stroke();
      ctx.fillStyle = '#e0a449';
      circle(w * x, h * .63, 4, true);
    }
    ctx.restore();
  }

  function drawFarmTargetMasks(w, h) {
    ctx.save();

    // Small distant hill pockets hide the high-value animals completely
    // between reveals. Separate silhouettes keep the layer feeling airborne.
    for (const anchor of [.17, .43, .87]) {
      const x = w * anchor;
      const panelW = clamp(w * .18, 76, 145);
      const panelY = h * .405;
      ctx.fillStyle = 'rgba(35,24,16,.28)';
      ctx.beginPath();
      ctx.ellipse(x, panelY + 18, panelW * .48, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#56813c';
      ctx.strokeStyle = '#d69e46';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - panelW / 2, panelY + 22);
      ctx.quadraticCurveTo(x - panelW * .3, panelY - 11, x - panelW * .08, panelY + 2);
      ctx.quadraticCurveTo(x + panelW * .16, panelY - 17, x + panelW * .34, panelY + 1);
      ctx.quadraticCurveTo(x + panelW * .46, panelY + 4, x + panelW / 2, panelY + 22);
      ctx.lineTo(x + panelW / 2, panelY + 38);
      ctx.lineTo(x - panelW / 2, panelY + 38);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#f1bd4e';
      circle(x - panelW * .34, panelY + 26, 3, true);
      circle(x + panelW * .34, panelY + 26, 3, true);
    }

    // Four wave-shaped troughs form the dominant middle target bank. The
    // alternating crests visibly swallow animals as each arrangement ends.
    const midAnchors = [.14, .37, .61, .87];
    midAnchors.forEach((anchor, index) => {
      const x = w * anchor;
      const panelW = clamp(w * .205, 96, 170);
      const y = h * .625;
      const panelH = clamp(h * .105, 58, 92);
      ctx.fillStyle = 'rgba(24,17,30,.32)';
      ctx.beginPath();
      ctx.ellipse(x, y + panelH - 8, panelW * .45, 12, 0, 0, Math.PI * 2);
      ctx.fill();
      const wave = ctx.createLinearGradient(0, y, 0, y + 55);
      wave.addColorStop(0, index % 2 ? '#426f86' : '#4f5d96');
      wave.addColorStop(1, index % 2 ? '#233b5b' : '#2d315f');
      ctx.fillStyle = wave;
      ctx.strokeStyle = '#d7a353';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - panelW / 2, y + 5);
      for (let step = 0; step < 4; step += 1) {
        const startX = x - panelW / 2 + step * panelW / 4;
        ctx.quadraticCurveTo(startX + panelW / 8, y - 12, startX + panelW / 4, y + 5);
      }
      ctx.lineTo(x + panelW / 2, y + panelH);
      ctx.lineTo(x - panelW / 2, y + panelH);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = '#8fd1d2';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - panelW * .42, y + 18);
      ctx.quadraticCurveTo(x - panelW * .2, y + 4, x, y + 19);
      ctx.quadraticCurveTo(x + panelW * .22, y + 32, x + panelW * .42, y + 17);
      ctx.stroke();
      ctx.fillStyle = '#ffcf4a';
      circle(x - panelW * .4, y + panelH - 12, 3, true);
      circle(x + panelW * .4, y + panelH - 12, 3, true);
    });

    // Foreground mound doors remain the easiest bank, but now share the same
    // raised brass-rimmed construction language as the floating scenery.
    for (const anchor of [.18, .38, .61, .82]) {
      const x = w * anchor;
      const moundW = clamp(w * .15, 78, 138);
      const y = h * .88;
      ctx.fillStyle = '#49331e';
      ctx.strokeStyle = '#d69e46';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.ellipse(x, y, moundW / 2, clamp(h * .032, 15, 28), 0, Math.PI, Math.PI * 2);
      ctx.lineTo(x + moundW / 2, y + 22);
      ctx.lineTo(x - moundW / 2, y + 22);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#7b552b';
      ctx.beginPath();
      ctx.ellipse(x, y + 3, moundW * .36, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
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
    if (target.direction === 'right') ctx.scale(-1, 1);

    if (['farmPop', 'farmSlide', 'farmHill', 'farmBarnDoor', 'farmBarnBonus', 'runner', 'peek'].includes(target.kind)) {
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

    const bob = target.kind === 'shieldBeaver' || target.kind === 'orbitBoss'
      ? 0
      : Math.sin((now + target.at * 1000) / 115) * 1.6;
    ctx.translate(0, bob);
    if (['farmPop', 'farmSlide', 'farmHill', 'farmBarnDoor', 'farmBarnBonus', 'runner', 'peek'].includes(target.kind)) {
      const animalKind = target.kind === 'farmBarnDoor' || target.kind === 'farmBarnBonus' ? 'peek' : target.kind;
      drawAnimal(target.type, !!target.golden, animalKind);
    }
    else if (target.kind === 'flyer') drawBird(target.type, !!target.golden, now);
    else if (target.kind === 'ringPost') drawRingPost(target);
    else if (target.kind === 'phaseFlyer') {
      drawAlienLaunchExhaust(target);
      drawMoonMobe(target);
    }
    else if (target.kind === 'orbitBoss') drawOrbitBoss(target);
    else if (target.kind === 'shieldBeaver') drawShieldBeaver(target, pos, now);
    else if (target.kind === 'beaverPeek') drawEdgeBeaver(target);
    else if (target.kind === 'plateRack') drawPlateRackTarget(target);
    else if (target.kind === 'platePop' || target.kind === 'plateFlyby') drawHighPlateTarget(target);
    else if (target.kind === 'plate') drawPlate(target);
    else if (target.kind === 'balloonTree' || target.kind === 'lavaBalloon' || target.kind === 'volcanoDecoy') drawBalloonTarget(target);
    else if (target.kind === 'volcanoComet') drawVolcanoComet(target, now);
    else if (target.kind === 'revealPanel') drawFinalePanel(target);
    else if (target.kind === 'finalePopup') drawFinalePopup(target);
    else if (target.kind === 'finaleGate') drawFinalePopup(target);
    else if (target.kind === 'rapidTarget') drawNeonTarget(target);
    else if (target.kind === 'jackpot') drawNeonTarget(target);
    else if (target.kind === 'hiddenMobe') drawHiddenMoberino(target, now);
    if (!isFarmScoreTarget(target)) drawPointValue(target);
    ctx.restore();
  }

  function drawPointValue(target) {
    // Secrets stay secret, and finale pop-ups already carry a large integrated
    // value plate. Every other hittable target shows its base point value.
    if (
      target.kind === 'hiddenMobe' ||
      target.kind === 'finalePopup' ||
      target.kind === 'finaleGate' ||
      target.kind === 'orbitBoss' ||
      (target.kind === 'shieldBeaver' && target.visualOpen < .72) ||
      (target.kind === 'beaverPeek' && target.visualReveal < .62) ||
      !Number.isFinite(target.base)
    ) return;
    const balloon = ['balloonTree', 'lavaBalloon', 'volcanoDecoy'].includes(target.kind);
    const farmBadge = ['farmPop', 'farmSlide', 'farmHill', 'farmBarnDoor', 'farmBarnBonus'].includes(target.kind);
    const animalScoreBadge = farmBadge || target.kind === 'shieldBeaver' || target.kind === 'beaverPeek';
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
      shieldBeaver: 47,
      beaverPeek: 36,
      plateRack: 34,
      platePop: 35,
      plateFlyby: 35,
      plate: 35,
      volcanoComet: 25,
      revealPanel: 58,
      rapidTarget: 58,
      jackpot: 48,
    };
    const y = balloon ? -2 : (positions[target.kind] ?? 34);
    const label = Math.round(target.base).toLocaleString('en-US');
    const badgeW = animalScoreBadge
      ? clamp(30 + label.length * 9, 52, 76)
      : clamp(22 + label.length * 7, 42, 68);
    const badgeH = animalScoreBadge ? 27 : 21;
    const accent = target.stageTarget
      ? '#6de8ff'
      : target.gold || target.golden
        ? '#ffcf4a'
        : targetColor(target);
    ctx.save();
    if (target.direction === 'right') ctx.scale(-1, 1);
    ctx.translate(0, y);
    if (target.kind === 'farmHill') ctx.scale(1.7, 1.7);
    if (target.kind === 'shieldBeaver' && target.tier === 2) ctx.scale(1.42, 1.42);
    else if (target.kind === 'shieldBeaver' && target.tier === 1) ctx.scale(1.16, 1.16);
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
    ctx.font = animalScoreBadge ? '700 16px Arial, sans-serif' : '12px "VCR", monospace';
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
    return typeof _getImg === 'function' ? _getImg(`assets/mania/tank/${name}`) : null;
  }

  function drawBeaverTarget(target, headOnly = false) {
    const sprite = beaverSprite(target);
    if (sprite?.complete && sprite.naturalWidth) {
      if (headOnly) {
        const sx = sprite.naturalWidth * .17;
        const sy = sprite.naturalHeight * .02;
        const sw = sprite.naturalWidth * .66;
        const sh = sprite.naturalHeight * (target.type === 'expert' ? .49 : .61);
        ctx.drawImage(sprite, sx, sy, sw, sh, -48, -48, 96, 88);
        return;
      }
      const boxW = target.type === 'expert' ? 88 : 112;
      const boxH = 112;
      const ratio = sprite.naturalWidth / sprite.naturalHeight;
      const drawW = Math.min(boxW, boxH * ratio);
      const drawH = drawW / ratio;
      ctx.drawImage(sprite, -drawW / 2, -drawH * .5, drawW, drawH);
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

  function drawShieldBeaver(target, pos, now) {
    const open = pos.openAmount || 0;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    ctx.beginPath();
    ctx.ellipse(0, 48, 58, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    drawBeaverTarget(target, false);

    const panelW = 62;
    const panelH = 108;
    const travel = open * 67;
    const speedStyles = [
      { panel: '#34745d', edge: '#8ee0b8', lamp: '#76f0ad' },
      { panel: '#a9632c', edge: '#ffd06a', lamp: '#ffbf4d' },
      { panel: '#96334e', edge: '#ff8ca5', lamp: '#ff647f' },
    ];
    const speedStyle = speedStyles[target.tier] || speedStyles[0];
    const panelColor = speedStyle.panel;
    const edgeColor = speedStyle.edge;
    for (const side of [-1, 1]) {
      const panelX = side < 0 ? -panelW - travel : travel;
      ctx.save();
      ctx.translate(panelX, -54);
      ctx.fillStyle = panelColor;
      ctx.strokeStyle = '#23282c';
      ctx.lineWidth = 4;
      roundRect(0, 0, panelW, panelH, 10);
      ctx.fill();
      ctx.stroke();
      ctx.strokeStyle = edgeColor;
      ctx.lineWidth = 2;
      roundRect(5, 5, panelW - 10, panelH - 10, 7);
      ctx.stroke();
      ctx.fillStyle = '#f0b85b';
      for (const point of [[12,13],[panelW-12,13],[12,panelH-13],[panelW-12,panelH-13]]) {
        circle(point[0], point[1], 3, true);
      }
      ctx.restore();
    }

    if (open < .08) {
      ctx.strokeStyle = '#171d22';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -45);
      ctx.lineTo(0, 45);
      ctx.stroke();
      ctx.fillStyle = target.shieldWarning
        ? (Math.floor(now / 110) % 2 ? '#fff4d5' : speedStyle.lamp)
        : target.spent ? '#27343a' : '#6de8ff';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = target.shieldWarning ? 12 : 5;
      circle(0, -34, 6, true);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  function drawEdgeBeaver(target) {
    ctx.save();
    ctx.rotate(target.side === 'left' ? Math.PI / 2 : -Math.PI / 2);
    ctx.fillStyle = 'rgba(0,0,0,.3)';
    ctx.beginPath();
    ctx.ellipse(0, 36, 42, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    drawBeaverTarget(target, true);
    ctx.strokeStyle = '#c48b4d';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-18, -54);
    ctx.lineTo(-18, 45);
    ctx.stroke();
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
      const size = target.hit ? 112 : 88;
      ctx.drawImage(characterImage, -size / 2, -58, size, size);
      if (!target.hit) drawHiddenCover(target.cover);
      return;
    }

    // A tiny antenna and bean-shaped head keep the cameo recognizable, while
    // booth-specific foreground props make finding it a deliberate scan.
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

    drawHiddenCover(target.cover);
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
    const sprite = typeof _getImg === 'function'
      ? _getImg('assets/mania/orbit-robot-boss-v1.png')
      : null;
    const pulse = target.pulseAt && state.elapsed - target.pulseAt < .12
      ? 1 + (1 - (state.elapsed - target.pulseAt) / .12) * .035
      : 1;
    ctx.save();
    ctx.scale(pulse, pulse);
    if (sprite?.complete && sprite.naturalWidth) {
      ctx.shadowColor = 'rgba(109,232,255,.38)';
      ctx.shadowBlur = 22;
      ctx.drawImage(sprite, -w * .42, -h * .525, w * .84, h);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#167b82';
      ctx.strokeStyle = '#d39a50';
      ctx.lineWidth = 8;
      roundRect(-w * .34, -h * .4, w * .68, h * .82, 36);
      ctx.fill();
      ctx.stroke();
    }

    // The generated prop is authored with an open black mouth. Sliding enamel
    // shutters cover it during the short value-change beat.
    const closed = 1 - (target.mouthOpen || 0);
    if (closed > .015) {
      const mouthW = w * .355;
      const mouthH = h * .275;
      const panelH = mouthH * .5 * closed;
      ctx.fillStyle = '#207f83';
      ctx.strokeStyle = '#d6a052';
      ctx.lineWidth = 5;
      ctx.shadowColor = 'rgba(255,207,74,.35)';
      ctx.shadowBlur = 10;
      roundRect(-mouthW / 2, -mouthH / 2, mouthW, panelH + 3, 8);
      ctx.fill();
      ctx.stroke();
      roundRect(-mouthW / 2, mouthH / 2 - panelH - 3, mouthW, panelH + 3, 8);
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = 'rgba(255,244,213,.32)';
      ctx.lineWidth = 2;
      for (let x = -mouthW * .38; x <= mouthW * .38; x += mouthW * .19) {
        ctx.beginPath();
        ctx.moveTo(x, -mouthH / 2 + 7);
        ctx.lineTo(x, -mouthH / 2 + panelH - 5);
        ctx.moveTo(x, mouthH / 2 - 7);
        ctx.lineTo(x, mouthH / 2 - panelH + 5);
        ctx.stroke();
      }
    }

    const open = (target.mouthOpen || 0) > .72;
    const nextValue = orbitBossValue((target.mouthStage || 0) + 1);
    ctx.fillStyle = 'rgba(7,7,20,.9)';
    ctx.strokeStyle = open ? '#6de8ff' : '#ffcf4a';
    ctx.lineWidth = 3;
    roundRect(-82, h * .175, 164, 42, 9);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = open ? '#fff4d5' : '#ffcf4a';
    ctx.font = '18px "VCR", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(open ? `${target.base} EACH` : `NEXT ${nextValue}`, 0, h * .175 + 21);
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
      ctx.filter = objectiveBalloon
        ? 'drop-shadow(0 0 3px #fff8dc) drop-shadow(0 0 13px #6de8ff)'
        : target.kind === 'volcanoDecoy'
          ? 'drop-shadow(0 0 3px rgba(255,244,213,.72)) drop-shadow(0 5px 7px rgba(8,4,20,.7))'
          : 'none';
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
    ctx.save();
    ctx.scale(pulse, pulse);
    ctx.rotate(target.direction === 'left' ? -.36 : Math.PI + .36);
    const tail = ctx.createLinearGradient(-62, 0, 8, 0);
    tail.addColorStop(0, 'rgba(255,93,157,0)');
    tail.addColorStop(.45, 'rgba(255,117,93,.45)');
    tail.addColorStop(1, 'rgba(255,225,130,.9)');
    ctx.fillStyle = tail;
    ctx.beginPath();
    ctx.moveTo(-68, 0);
    ctx.quadraticCurveTo(-24, -13, 7, -8);
    ctx.quadraticCurveTo(-18, 12, -68, 0);
    ctx.fill();
    ctx.fillStyle = '#ffcf4a';
    ctx.strokeStyle = '#6d3046';
    ctx.lineWidth = 4;
    circle(10, 0, 15, true);
    ctx.fillStyle = '#fff1ad';
    circle(5, -5, 4.5, false);
    ctx.fillStyle = '#c64d59';
    circle(15, 5, 3, false);
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
    if (target.kind === 'shieldBeaver' || target.kind === 'beaverPeek') {
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
            <div class="mania-result-stat"><b>x${summary.combo}</b><span>BEST COMBO</span></div>
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
            <div class="mania-result-stat"><b>x${summary.combo}</b><span>BEST COMBO</span></div>
          </div>
          <div class="mania-hidden-result">HIDDEN MOBERINOS · <b>${summary.hiddenMobes}/${summary.hiddenMobeTotal}</b></div>
          <button class="mania-btn" type="button" onclick="maniaNextBooth()">PLAY NEXT BOOTH</button>
          <button class="mania-result-back" type="button" onclick="nav('lobby')">QUIT GAME</button>
        </section>`;
      return;
    }

    const allRounds = state.rounds.concat(summary);
    const previous = Number(localStorage.getItem(BEST_KEY) || 0);
    const isBest = circuitTotal > previous;
    const best = Math.max(previous, circuitTotal);
    localStorage.setItem(BEST_KEY, String(best));
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
        <div class="mania-result-best">${isBest ? '★ NEW MANIA RECORD!' : `MANIA RECORD · ${best.toLocaleString()}`}</div>
        <button class="mania-btn" type="button" onclick="maniaStart()">RIDE AGAIN</button>
        <button class="mania-result-back" type="button" onclick="nav('lobby')">◀ ARCADE MENU</button>
      </section>`;
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
    state.shots = state.shots.filter(shot => now - shot.born < (shot.kind === 'orbit' ? shot.flightDuration * 1000 + 340 : 210));
    for (const shot of state.shots) {
      const flightMs = shot.kind === 'orbit' ? shot.flightDuration * 1000 : 210;
      const rawProgress = (now - shot.born) / flightMs;
      const p = clamp(rawProgress, 0, 1);
      const startX = state.width / 2;
      const startY = state.height + 22;
      const endX = lerp(startX, shot.x, shot.kind === 'orbit' ? p : Math.min(1, p * 2.8));
      const endY = shot.kind === 'orbit'
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
        ctx.globalAlpha = 1 - p;
        ctx.fillStyle = '#fff2dd';
        circle(endX, endY, 9 + p * 2, true);
      } else if (shot.kind === 'volcano') {
        ctx.globalAlpha = 1 - p;
        ctx.strokeStyle = '#fff0d8';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.moveTo(lerp(startX, endX, .7), lerp(startY, endY, .7));
        ctx.lineTo(endX, endY);
        ctx.stroke();
        ctx.fillStyle = '#ff5d9d';
        triangle(endX - 6, endY + 4, endX + 8, endY, endX - 5, endY - 5, false);
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
