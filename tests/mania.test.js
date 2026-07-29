const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Moberino Mania is registered as an isolated arcade page', () => {
  const html = read('arcade.html');
  const arcade = read('js/arcade.js');
  const source = read('js/games/mania.js');
  assert.match(html, /id="ci-mania"/);
  assert.ok(html.indexOf('id="ci-mania"') > html.indexOf('id="ci-packing"'));
  assert.match(html, /border-color:#ff5b6866/);
  assert.match(html, /background:#ff5b68;color:#17060a">ARCADE<\/div>/);
  assert.match(html, /color:#ff5b68;text-shadow:0 0 20px #ff5b6888">MOBERINO MANIA/);
  assert.match(html, /class="mania-lobby-scene"/);
  for (const motif of ['target', 'ship', 'volcano']) {
    assert.match(html, new RegExp(`mania-lobby-${motif}`));
  }
  assert.doesNotMatch(html, /mania-lobby-fox/);
  assert.match(html, /mania-lobby-target--large/);
  assert.match(html, /mania-lobby-target--small/);
  assert.match(html, /mania-lobby-target--mini/);
  assert.doesNotMatch(html, /id="mania-card-sky"/);
  assert.match(html, /id="pg-mania"/);
  assert.match(html, /js\/games\/mania\.js/);
  assert.match(arcade, /const onMania = p === 'mania'/);
  assert.match(arcade, /initMania/);
  assert.match(arcade, /maniaBack/);
  assert.ok(fs.existsSync(path.join(root, 'mania.mp3')));
  assert.match(source, /const ManiaMusic =/);
  assert.match(source, /const VOLUME = 0\.018/);
  assert.match(source, /fetch\('mania\.mp3'\)/);
  assert.match(source, /if \(!data\.byteLength\) throw new Error\('mania\.mp3 is empty'\)/);
  assert.match(source, /sourceNode\.loop = true/);
  assert.match(source, /A missing\/corrupt Mania file should fall back/);
  assert.match(source, /ArcadeMusic\?\.stop\(\)/);
  assert.match(source, /ManiaMusic\.start\(\)/);
  assert.match(source, /ManiaMusic\.stop\(\)/);
  assert.match(arcade, /maniaSyncMusicMute/);
  assert.ok(fs.existsSync(path.join(root, 'assets/space/sfx/powerup_hp.mp3')));
  assert.match(arcade, /new Audio\('assets\/space\/sfx\/powerup_hp\.mp3'\)/);
  assert.match(arcade, /const goodHitPool = Array\.from\(\{ length: 8 \}/);
});

test('Moberino Mania runs four 20-second booths and a shortened three-phase showdown', () => {
  const source = read('js/games/mania.js');
  assert.match(source, /const ROUND_SECONDS = 20/);
  assert.match(source, /const FINALE_PHASE_SECONDS = 20/);
  assert.match(source, /const FINALE_RAPID_SECONDS = 16/);
  assert.match(source, /const FINALE_SECONDS = FINALE_PHASE_SECONDS \* 2 \+ FINALE_RAPID_SECONDS/);
  assert.match(source, /return boothId === 'finale' \? FINALE_SECONDS : ROUND_SECONDS/);
  assert.match(source, /const WORLD_LENGTH = 5600/);
  assert.match(source, /const FINALE_WORLD_LENGTH = 2400/);
  for (const title of ['FARM FRENZY', 'RAPID RINGS', 'BEAVER BONANZA', 'VOLCANIC POP', 'TARGET SHOWDOWN']) {
    assert.match(source, new RegExp(`title: '${title}'`));
  }
  for (const id of ['farm', 'orbit', 'plates', 'volcano', 'finale']) {
    assert.match(source, new RegExp(`id: '${id}'`));
  }
  assert.match(source, /window\.maniaNextBooth/);
  assert.match(source, /state\.totalScore \+ state\.score/);
  assert.match(source, /FINAL CIRCUIT SCORE/);
});

test('Farm Frenzy uses three depth layers and a repeatable three-hit barn prize', () => {
  const source = read('js/games/mania.js');
  assert.ok(fs.existsSync(path.join(root, 'assets/mania/farm/farm-backdrop-v1.png')));
  for (const asset of ['pig', 'cow', 'sheep', 'duck', 'chicken']) {
    assert.ok(fs.existsSync(path.join(root, `assets/mania/farm/${asset}-target-v1.png`)));
  }
  assert.ok(fs.existsSync(path.join(root, 'assets/mania/farm/barn-v1.png')));
  assert.match(source, /function drawFarmScene\(/);
  assert.match(source, /assets\/mania\/farm\/farm-backdrop-v1\.png/);
  assert.match(source, /saturate\(\.66\) brightness\(\.92\) contrast\(\.9\)/);
  assert.match(source, /assets\/mania\/farm\/barn-v1\.png/);
  assert.match(source, /const birdPasses = \[/);
  assert.match(source, /kind: 'flyer'/);
  assert.match(source, /duration: 4\.15/);
  assert.match(source, /drawLayer: 0/);
  assert.match(source, /pig: \[106, 65\]/);
  assert.match(source, /farmAnimal[\s\S]*small \? 36 : 46/);
  for (const kind of ['farmPop', 'farmSlide', 'farmHill', 'farmBarnDoor', 'farmBarnBonus']) {
    assert.match(source, new RegExp(`kind: '${kind}'`));
  }
  assert.match(source, /function hitFarmBarnDoor\(/);
  assert.match(source, /state\.barnHits = Math\.min\(3, state\.barnHits \+ 1\)/);
  assert.match(source, /base: 1800 \+ state\.barnTier \* 400/);
  assert.match(source, /function processFarmBarn\(/);
  assert.match(source, /function drawBarnProgress\(/);
  assert.match(source, /const waveTimes = \[\.55, 5\.15, 9\.75, 14\.35\]/);
  assert.match(source, /function drawFarmTargetMasks\(/);
  assert.match(source, /Four wave-shaped troughs form the dominant middle target bank/);
  assert.match(source, /target\.kind === 'farmHill'\) ctx\.scale\(1\.7, 1\.7\)/);
  assert.match(source, /farmPop: -50/);
  assert.match(source, /BARN OPEN! GOLD PRIZE/);
  assert.match(source, /if \(currentBooth\(\)\.id === 'farm'\) \{[\s\S]*return 0/);
  assert.match(source, /pointerdown/);
  assert.match(source, /\['farmPop', 'farmSlide', 'farmHill'[\s\S]*scale \*= 1\.2/);
});

test('Every new booth has a distinct target and bonus contract', () => {
  const source = read('js/games/mania.js');
  for (const kind of ['ringPost', 'phaseFlyer', 'damBeaver', 'beaverPeek', 'revealPanel', 'finaleGate', 'rapidTarget']) {
    assert.match(source, new RegExp(`kind: '${kind}'`));
  }
  assert.match(source, /function spawnVolcanoStage\(/);
  assert.match(source, /stageTarget: true/);
  assert.match(source, /function triggerEruption\(/);
  assert.match(source, /state\.elapsed < FINALE_PHASE_SECONDS \* 2/);
  assert.match(source, /target\.repeatable/);
});

test('Beaver Bonanza uses layered pop-up beavers and riverbank edge teases', () => {
  const source = read('js/games/mania.js');
  for (const asset of [
    'dam-backdrop-v2.png',
    'beaver-standard-target-v1.png',
    'beaver-foreman-target-v1.png',
    'beaver-expert-target-v1.png',
  ]) {
    assert.ok(fs.existsSync(path.join(root, `assets/mania/dam/${asset}`)));
  }
  assert.match(source, /title: 'BEAVER BONANZA'/);
  assert.match(source, /assets\/mania\/dam\/dam-backdrop-v2\.png/);
  assert.match(source, /function drawDamScene\(/);
  assert.match(source, /function drawDamWater\(/);
  assert.doesNotMatch(source, /function drawToyTank\(/);
  assert.doesNotMatch(source, /function drawTankRails\(/);
  assert.match(source, /kind: 'damBeaver'/);
  assert.match(source, /kind: 'beaverPeek'/);
  assert.match(source, /openWindow: 1\.8/);
  assert.match(source, /openWindow: 1\.15/);
  assert.match(source, /openWindow: \.65/);
  assert.match(source, /base: 1600/);
  assert.match(source, /period: 5\.6/);
  assert.match(source, /transition: \.18/);
  assert.match(source, /LOG BANK SLOW · LODGE QUICK · SPILLWAY FLASH!/);
  assert.match(source, /hittable: !target\.spent && openAmount > \.72/);
  assert.match(source, /function hitDamBeaver\(/);
  assert.match(source, /function drawDamBeaver\(/);
  assert.match(source, /const revealTravel = clamp/);
  assert.match(source, /target\.popWarning/);
  assert.match(source, /function drawEdgeBeaver\(/);
  assert.match(source, /ctx\.rotate\(target\.side === 'left' \? Math\.PI \/ 2 : -Math\.PI \/ 2\)/);
  assert.match(source, /'HIDING!'/);
  assert.match(source, /assets\/mania\/dam\/\$\{name\}/);
  assert.match(source, /const stations = \[/);
  assert.match(source, /anchorX: station\[0\]/);
  assert.match(source, /anchorY: station\[1\]/);
  assert.match(source, /target\.cycleOffset = mod\(\.18 - elapsed/);
  assert.match(source, /anchorX: \.18, lane: \.28, cover: 'canoe'/);
  assert.match(source, /anchorX: \.82, lane: \.28, cover: 'cattails'/);
  assert.match(source, /const edgePeeks = \[/);
  assert.match(source, /const teaseIn =/);
  assert.match(source, /const departure =/);
  assert.match(source, /if \(currentBooth\(\)\.id === 'plates'\) \{[\s\S]*return 0/);
});

test('Balloon Volcano uses authored booth and target artwork with visible spray feedback', () => {
  const source = read('js/games/mania.js');
  for (const asset of [
    'volcano-backdrop-v1.png',
    'tree-balloon-raspberry-v1.png',
    'tree-balloon-gold-v1.png',
    'tree-balloon-teal-v1.png',
    'vent-balloon-v1.png',
    'eruption-balloon-v1.png',
  ]) {
    assert.ok(fs.existsSync(path.join(root, `assets/mania/volcano/${asset}`)));
  }
  assert.match(source, /assets\/mania\/volcano\/volcano-backdrop-v1\.png/);
  assert.match(source, /saturate\(\.58\) brightness\(\.9\) contrast\(\.88\)/);
  assert.match(source, /function drawVolcanoParallax\(/);
  assert.doesNotMatch(source, /Repeating brass tie-downs/);
  assert.match(source, /assets\/mania\/volcano\/\$\{balloonName\}-v1\.png/);
  assert.match(source, /function volcanoSpray\(/);
  assert.match(source, /state\.eruptionAt = state\.elapsed/);
  assert.match(source, /if \(currentBooth\(\)\.id === 'volcano'\) \{[\s\S]*return 0/);
  assert.match(source, /kind: 'volcanoDecoy'/);
  assert.match(source, /base: 75/);
  assert.match(source, /target\.cooldownUntil = state\.elapsed \+ \.7/);
  assert.doesNotMatch(source, /kind: 'volcanoComet'/);
  assert.match(source, /type: 'lavaStream'/);
  assert.match(source, /function drawVolcanoStageLights\(/);
  assert.match(source, /function drawVolcanoObjective\(/);
  assert.match(source, /CLEAR 3 GLOWING FORMATIONS TO ERUPT/);
  assert.match(source, /const formations = \[\s*\[\[\.41,\.48\],\[\.5,\.37\],\[\.59,\.48\]\]/);
  assert.match(source, /kind: 'lavaBalloon',\s*type: 'lavaStream'/);
  assert.doesNotMatch(source, /kind: 'balloonTree',\s*type: 'treeBalloon',\s*at,\s*duration:/);
  assert.match(source, /drop-shadow\(0 0 13px #6de8ff\)/);
  assert.match(source, /scale \*= 1\.3/);
  assert.match(source, /const balloonInset = clamp\(w \* \.12, 40, 58\)/);
  assert.match(source, /FORMATION \$\{state\.special\}\/3 CLEARED/);
});

test('Every visible Mania target carries a consistent base-point badge', () => {
  const source = read('js/games/mania.js');
  assert.match(source, /function drawPointValue\(target\)/);
  assert.match(source, /drawPointValue\(target\)/);
  assert.match(source, /Math\.round\(target\.base\)\.toLocaleString\('en-US'\)/);
  assert.match(source, /ctx\.fillStyle = 'rgba\(8,8,20,\.9\)'/);
  assert.match(source, /ctx\.font = '12px "VCR", monospace'/);
  assert.match(source, /const animalScoreBadge = farmBadge \|\| target\.kind === 'damBeaver'/);
  assert.match(source, /animalScoreBadge \? '700 16px Arial, sans-serif'/);
  assert.match(source, /const badgeH = animalScoreBadge \? 27 : 21/);
  assert.match(source, /function drawFarmPointOverlays\(/);
  assert.match(source, /drawFarmTargetMasks\(w, h\);[\s\S]*drawFarmPointOverlays\(now\)/);
  assert.match(source, /if \(!isFarmScoreTarget\(target\)\) drawPointValue\(target\)/);
  assert.match(source, /target\.kind === 'hiddenMobe'/);
  assert.match(source, /target\.kind === 'finalePopup'/);
  assert.match(source, /target\.kind === 'finaleGate'/);
});

test('Target Showdown uses authored artwork across static, scrolling, and precision phases', () => {
  const source = read('js/games/mania.js');
  for (const asset of [
    'finale-backdrop-v1.png',
    'base-panel-v1.png',
    'open-star-panel-v1.png',
    'jewel-target-v1.png',
    'grand-jackpot-v1.png',
  ]) {
    assert.ok(fs.existsSync(path.join(root, `assets/mania/finale/${asset}`)));
  }
  assert.match(source, /assets\/mania\/finale\/finale-backdrop-v1\.png/);
  assert.match(source, /saturate\(\.6\) brightness\(\.9\) contrast\(\.88\)/);
  assert.match(source, /function drawFinaleMotion\(/);
  assert.match(source, /assets\/mania\/finale\/\$\{panelName\}-v1\.png/);
  assert.match(source, /assets\/mania\/finale\/grand-jackpot-v1\.png/);
  assert.match(source, /parentWorldX: target\.worldX/);
  assert.match(source, /parentAnchorX: target\.anchorX/);
  assert.match(source, /x = lerp\(parentX, x, opening\)/);
  assert.match(source, /function spawnFinaleStaticWave\(/);
  assert.match(source, /unfoldHub: true/);
  assert.match(source, /function unfoldFinaleBank\(/);
  assert.match(source, /const phoneLayout = state\.width <= 520/);
  assert.match(source, /const unfoldedTargets = phoneLayout/);
  assert.match(source, /\[\.5, \.25, 1750\]/);
  assert.match(source, /\[\.5, \.64, 750\]/);
  assert.match(source, /unfoldLeaf: true/);
  assert.match(source, /TARGET BANK UNFOLDS · CLEAR HIGH \+ LOW!/);
  assert.match(source, /growth = \.86 \+ Math\.abs/);
  assert.match(source, /function processFinaleStaticWaves\(/);
  assert.match(source, /TARGET BANK \$\{state\.finaleWave \+ 1\} RISES!/);
  assert.match(source, /BANK CLEAR \+\$\{clearBonus\}/);
  assert.match(source, /finaleClearedWave === state\.finaleWave/);
  assert.match(source, /finalePhase: 0/);
  assert.match(source, /finalePhase: 1/);
  assert.match(source, /finalePhase: 2/);
  assert.match(source, /const finalLocks = \[/);
  assert.match(source, /duration: FINALE_RAPID_SECONDS - \.25/);
  assert.match(source, /locks\.length !== 8/);
  assert.match(source, /kind: 'finaleGate'/);
  assert.match(source, /finalLock: true/);
  assert.match(source, /function processFinaleRapidFire\(/);
  assert.match(source, /kind: 'rapidTarget'/);
  assert.match(source, /function rapidTapValue\(/);
  assert.match(source, /if \(hitCount >= 31\) return 2000/);
  assert.match(source, /if \(hitCount >= 21\) return 1000/);
  assert.match(source, /if \(hitCount >= 13\) return 500/);
  assert.match(source, /if \(hitCount >= 6\) return 250/);
  assert.match(source, /VALUE RISES AT 6, 13, 21 & 31/);
  assert.match(source, /function processFinalePhases\(/);
  assert.match(source, /PHASE 1 · OPEN & CLEAR THE BANK/);
  assert.match(source, /PHASE 2 · PRECISION SCROLL/);
  assert.match(source, /PHASE 3 · CLEAR 8 LOCKS TO UNLOCK RAPID FIRE/);
  assert.match(source, /function drawFinalePopup\(/);
  assert.match(source, /function drawFinaleRingStructure\(/);
  assert.match(source, /drawFinaleRingStructure\(47 - target\.tier \* 5/);
  assert.match(source, /drawFinaleRingStructure\(target\.base >= 4000 \? 39/);
  assert.match(source, /Alternating scoring rings preserve the neon palette/);
  assert.match(source, /Four mounting tabs keep the rings integrated/);
  assert.match(source, /ctx\.fillText\(String\(target\.base\)/);
  assert.doesNotMatch(source, /const trackYs =/);
  assert.doesNotMatch(source, /Scrolling chevrons/);
});

test('Every booth hides two Moberinos with a WHACK discovery payoff', () => {
  const source = read('js/games/mania.js');
  for (const booth of ['orbit', 'finale']) {
    assert.match(source, new RegExp(`${booth}: \\[\\s*\\{ progress:`));
  }
  assert.match(source, /farm: \[\s*\{ anchorX:/);
  assert.match(source, /plates: \[\s*\{ anchorX:/);
  assert.match(source, /volcano: \[\s*\{ anchorX:/);
  assert.match(source, /hiddenMobeTotal: 2/);
  assert.match(source, /kind: 'hiddenMobe'/);
  assert.match(source, /function hiddenCharacterFor\(/);
  assert.match(source, /characterIndex !== playerIndex/);
  assert.match(source, /target\.character\?\.imgWhack/);
  assert.match(source, /drawHiddenMoberino\(target, now\)/);
  assert.match(source, /'WHACK!'/);
  assert.match(source, /showToast\(`WHACK!\$\{foundName\}/);
  assert.match(source, /HIDDEN MOBERINOS ·/);
  for (const cover of ['hay', 'bush', 'moonRock', 'satellite', 'canoe', 'cattails', 'lavaRock', 'balloonBush', 'window', 'neonSign']) {
    assert.match(source, new RegExp(`cover: '${cover}'`));
    assert.match(source, new RegExp(`cover === '${cover}'`));
  }
});

test('Booths teach persistent stacking, priority, chains, and reveals', () => {
  const source = read('js/games/mania.js');
  assert.match(source, /requiredRings: 4/);
  assert.match(source, /ringWindow: 2\.35/);
  assert.match(source, /ORBIT_FREEZE_SECONDS = 5\.25/);
  assert.match(source, /formation\.length !== 5/);
  assert.match(source, /FROZEN \$\{frozen\}\/5/);
  assert.match(source, /FORMATION CLEAR!/);
  assert.match(source, /function processOrbitFormation\(/);
  assert.match(source, /openWindow: \.65/);
  assert.match(source, /function hitDamBeaver\(/);
  assert.match(source, /function triggerBalloonChain\(/);
  assert.match(source, /RICOCHET \+\$\{gained\}/);
  assert.match(source, /function openFinalePanel\(/);
  assert.match(source, /tier: nextTier/);
  assert.match(source, /TARGET POPS OPEN!/);
});

test('Orbit uses authored booth art and resolves rings after a physical flight', () => {
  const source = read('js/games/mania.js');
  assert.ok(fs.existsSync(path.join(root, 'assets/mania/orbit-backdrop-v2.png')));
  assert.ok(fs.existsSync(path.join(root, 'assets/mania/orbit-robot-boss-v1.png')));
  assert.ok(fs.existsSync(path.join(root, 'assets/mania/orbit-robot-boss-closed-v2.png')));
  for (const sprite of ['moon-mobe', 'ghost-mobe', 'comet-mobe']) {
    assert.ok(fs.existsSync(path.join(root, `assets/mania/characters/${sprite}-sprite-v2.png`)));
  }
  assert.match(source, /assets\/mania\/orbit-backdrop-v2\.png/);
  assert.match(source, /function launchRing\(/);
  assert.match(source, /function processRingFlights\(/);
  assert.match(source, /landsAt: state\.elapsed \+ flightDuration/);
  assert.match(source, /Math\.sin\(p \* Math\.PI\) \* shot\.arcHeight/);
  assert.match(source, /'BOUNCE!'/);
  assert.match(source, /FORMATION CLEAR! \+5000/);
  assert.match(source, /function triggerOrbitBoss\(/);
  assert.match(source, /kind: 'orbitBoss'/);
  assert.match(source, /function orbitBossValue\(/);
  assert.match(source, /\[100, 500, 1000, 2000, 3000\]/);
  assert.match(source, /function hitOrbitBoss\(/);
  assert.match(source, /const cycleDuration = 4\.25/);
  assert.match(source, /\(cycleAge - \.85\) \/ \.42/);
  assert.match(source, /pos\.hittable === false/);
  assert.match(source, /function drawOrbitBoss\(/);
  assert.match(source, /function orbitRobotMetrics\(/);
  assert.match(source, /const robotHeight = Math\.min\(w \* \.92 \/ sourceAspect, h \* 1\.12\)/);
  assert.match(source, /r: Math\.min\(robot\.width \* \.21, robot\.height \* \.17\)/);
  assert.match(source, /assets\/mania\/orbit-robot-boss-v1\.png/);
  assert.match(source, /assets\/mania\/orbit-robot-boss-closed-v2\.png/);
  assert.match(source, /const upcomingValue = \(target\.mouthCycleAge \|\| 0\) < \.85/);
  assert.match(source, /target\.bossLaunchAt/);
  assert.match(source, /scale \*= \.78/);
  assert.match(source, /visibility = \.66/);
  assert.match(source, /\[\.45, 4\.8, 9\.15\]/);
  assert.match(source, /bossSide/);
  assert.match(source, /const ghost = target\.type === 'ghostMobe'/);
  assert.match(source, /moon-mobe-sprite-v2\.png/);
  assert.match(source, /ghost-mobe-sprite-v2\.png/);
  assert.match(source, /comet-mobe-sprite-v2\.png/);
  assert.match(source, /const formation = \[\s*\[\.34, \.51\], \[\.66, \.51\]/);
  assert.match(source, /const cornerLaunches = \[1, 5\.8, 10\.6, 15\.4\]/);
  assert.match(source, /\['left', 'right'\]\.forEach/);
  assert.match(source, /duration: 4\.15/);
  assert.match(source, /cornerTease: true/);
  assert.match(source, /base: 2500/);
  assert.match(source, /const edgeInset = clamp\(w \* \.105, 50, 106\)/);
  assert.match(source, /const skyY = clamp\(h \* \.145, 54, 102\)/);
  assert.match(source, /target\.kind !== 'phaseFlyer'/);
  assert.match(source, /function drawAlienLaunchExhaust\(/);
  assert.match(source, /target\.blastProgress = blast/);
  assert.doesNotMatch(source, /kind: 'orbiter'/);
  assert.doesNotMatch(source, /type: 'planet'/);
  assert.doesNotMatch(source, /for \(let i = 0; i < 52; i \+= 1\)/);
  assert.match(source, /Crop the decorative red antenna bulb out/);
  assert.match(source, /const cropTop = Math\.min\(31, sprite\.naturalHeight \* \.07\)/);
});

test('Moberino Mania provides touch-safe responsive play, transitions, and results', () => {
  const css = read('css/games/mania.css');
  const source = read('js/games/mania.js');
  assert.match(css, /\.mania-stage \{[\s\S]*touch-action: none/);
  assert.match(css, /@media \(orientation: portrait\)/);
  assert.match(css, /@media \(orientation: portrait\) and \(min-width: 621px\)/);
  assert.match(css, /body\.on-mania \{[\s\S]*padding-bottom: 0 !important/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 700px\)/);
  assert.match(css, /#pg-mania\.active \{[\s\S]*position: fixed/);
  assert.match(css, /body\.mania-compact-landscape \.mania-game/);
  assert.match(css, /body\.mania-landscape \.mania-game \{[\s\S]*align-self: start/);
  assert.doesNotMatch(css, /body\.mania-landscape \.mania-wrap \{[\s\S]*place-items: start center/);
  assert.match(source, /window\.visualViewport\?\.addEventListener\('resize', syncManiaViewportHeight\)/);
  assert.match(source, /--mania-vh/);
  assert.match(source, /--mania-game-height/);
  assert.match(css, /finale\/finale-backdrop-v1\.png/);
  assert.match(css, /\.mania-menu \.mania-btn/);
  assert.doesNotMatch(source, /START THE CIRCUIT/);
  assert.match(source, />PLAY<\/button>/);
  assert.doesNotMatch(source, /mania-menu-kicker/);
  assert.doesNotMatch(source, /mania-menu-copy/);
  assert.doesNotMatch(source, /mania-route/);
  assert.match(source, /class="mania-practice"/);
  assert.match(css, /\.mania-practice/);
  assert.match(css, /\.mania-menu-title,[\s\S]*text-shadow: none/);
  assert.doesNotMatch(source, /id="mania-special"/);
  assert.doesNotMatch(source, /mania-next-card/);
  assert.match(source, /PLAY NEXT BOOTH/);
  assert.match(source, /QUIT GAME/);
  for (const art of ['farm-backdrop', 'orbit-backdrop', 'dam-backdrop', 'volcano-backdrop', 'finale-backdrop']) {
    assert.match(css, new RegExp(art));
  }
  assert.match(source, /window\.maniaPractice/);
  assert.match(source, /window\.maniaChooseBooth/);
  assert.match(source, /PRACTICE COMPLETE/);
  assert.match(source, /PRACTICE AGAIN/);
  assert.match(css, /\.mania-round-strip/);
  assert.match(css, /\.mania-booth-curtain/);
  assert.match(source, /NEXT BOOTH/);
  assert.match(source, /FINAL CIRCUIT SCORE/);
  assert.match(source, /ACCURACY/);
  assert.match(source, /BEST COMBO/);
});
