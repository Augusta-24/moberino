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
  const arcade = read('js/arcade.js');
  const source = read('js/games/mania.js');
  assert.match(source, /const ROUND_SECONDS = 20/);
  assert.match(source, /const FINALE_PHASE_SECONDS = 20/);
  assert.match(source, /const FINALE_RAPID_SECONDS = 10/);
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
  assert.match(arcade, /mania:\s+\{ col: 'score',\s+dir: 'desc'/);
  assert.match(arcade, /\{ key: 'mania', label: 'MOBERINO MANIA · FINAL CIRCUIT'/);
  assert.match(arcade, /\{ id: 'mania', tab: 'MANIA'/);
  assert.match(arcade, /function escapeLeaderboardText\(value\)/);
  assert.match(arcade, /\$\{escapeLeaderboardText\(r\.name\)\}/);
  assert.match(source, /data-board-key="mania"/);
  assert.match(source, /data-remote-score="\$\{circuitTotal\}"/);
  assert.match(source, /loadRemoteBoard\('mania', 'mania-final-board'/);
  assert.ok(source.indexOf('data-board-key="mania"') > source.indexOf('if (state.boothIndex < BOOTHS.length - 1)'));
  assert.doesNotMatch(source, /MANIA RECORD|NEW MANIA RECORD|moberino-mania-circuit-best/);
  assert.match(source, /const bankPositions = \[\s*\[\.3, \.36\],\s*\[\.7, \.72\],\s*\[\.28, \.7\],\s*\[\.72, \.38\]/);
  assert.match(source, /const \[anchorX, lane\] = bankPositions\[wave % bankPositions\.length\]/);
  assert.doesNotMatch(source, /const clusteredCenter/);
  assert.doesNotMatch(source, /clusterSpreadDuration/);
});

test('Farm Frenzy uses three depth layers and a repeatable three-hit barn prize', () => {
  const source = read('js/games/mania.js');
  assert.ok(fs.existsSync(path.join(root, 'assets/mania/farm/farm-backdrop-v1.png')));
  for (const asset of ['pig', 'cow', 'sheep', 'duck', 'chicken', 'fox']) {
    assert.ok(fs.existsSync(path.join(root, `assets/mania/farm/${asset}-target-v1.png`)));
  }
  assert.ok(fs.existsSync(path.join(root, 'assets/mania/farm/barn-v1.png')));
  assert.match(source, /function drawFarmScene\(/);
  assert.match(source, /assets\/mania\/farm\/farm-backdrop-v1\.png/);
  assert.match(source, /saturate\(\.66\) brightness\(\.92\) contrast\(\.9\)/);
  assert.match(source, /assets\/mania\/farm\/barn-v1\.png/);
  assert.match(source, /function spawnFarmAnimal\(slot, at\)/);
  assert.match(source, /for \(let slot = 0; slot < 6; slot \+= 1\) spawnFarmAnimal\(slot, 0\)/);
  assert.match(source, /clearReplace: true/);
  assert.match(source, /spawnFarmAnimal\(target\.farmSlot, nowSeconds \+ \.12\)/);
  assert.doesNotMatch(source, /function processFarmActivity\(/);
  assert.match(source, /pig: \[106, 65\]/);
  assert.match(source, /farmAnimal[\s\S]*small \? 36 : 46/);
  for (const kind of ['farmBarnDoor', 'farmBarnBonus']) {
    assert.match(source, new RegExp(`kind: '${kind}'`));
  }
  assert.match(source, /\['farmPop', 'farmPop', 'farmSlide', 'farmSlide', 'farmHill', 'flyer'\]/);
  assert.match(source, /function hitFarmBarnDoor\(/);
  assert.match(source, /state\.barnHits = Math\.min\(3, state\.barnHits \+ 1\)/);
  assert.match(source, /kind: 'farmBarnBonus',\s*type: 'fox'/);
  assert.match(source, /y = g\.groundY - g\.h \* \.29/);
  assert.match(source, /scale = g\.scale \* \.58/);
  assert.match(source, /base: 1800 \+ state\.barnTier \* 400/);
  assert.match(source, /function processFarmBarn\(/);
  assert.match(source, /function drawBarnProgress\(/);
  assert.match(source, /const kind = \['farmPop', 'farmPop', 'farmSlide', 'farmSlide', 'farmHill', 'flyer'\]\[slot\]/);
  assert.match(source, /const anchors = \[\.18, \.38, \.61, \.82\]/);
  assert.match(source, /const anchors = \[\.14, \.37, \.61, \.87\]/);
  assert.doesNotMatch(source, /function drawFarmDetails\(/);
  assert.match(source, /function drawFarmLayerMask\(/);
  assert.match(source, /function drawSourceAlignedMask\(/);
  assert.match(source, /visualLayer >= 4/);
  assert.match(source, /drawFarmLayerMask\(w, h, \.6, \.72\)/);
  assert.match(source, /drawFarmLayerMask\(w, h, \.84, 1\)/);
  assert.match(source, /const layerOrder = targetVisualLayer\(a, boothId\) - targetVisualLayer\(b, boothId\)/);
  assert.match(source, /if \(target\.kind === 'farmPop'\) y -= clamp\(h \* \.04, 12, 20\)/);
  assert.match(source, /if \(target\.kind === 'farmSlide'\) y -= clamp\(h \* \.025, 8, 14\)/);
  assert.match(source, /target\.kind === 'farmHill'\) ctx\.scale\(1\.7, 1\.7\)/);
  assert.match(source, /function drawEnchantedFarmDust\(/);
  assert.match(source, /ctx\.rotate\(mod\(now \/ 1050 \+ spellSeed \* \.37, Math\.PI \* 2\)\)/);
  assert.match(source, /farmPop: -50/);
  assert.match(source, /BARN OPEN! GOLD PRIZE/);
  assert.match(source, /if \(currentBooth\(\)\.id === 'farm'\) \{[\s\S]*return 0/);
  assert.match(source, /pointerdown/);
  assert.match(source, /\['farmPop', 'farmSlide', 'farmHill'[\s\S]*scale \*= 1\.2/);
});

test('Every new booth has a distinct target and bonus contract', () => {
  const source = read('js/games/mania.js');
  for (const kind of ['ringPost', 'phaseFlyer', 'damBeaver', 'damBank', 'beaverRunner', 'goldBeaver', 'revealPanel', 'finaleGate', 'rapidTarget']) {
    assert.match(source, new RegExp(`kind: '${kind}'`));
  }
  assert.match(source, /function spawnVolcanoStage\(/);
  assert.match(source, /stageTarget: true/);
  assert.match(source, /function triggerEruption\(/);
  assert.match(source, /state\.elapsed < FINALE_PHASE_SECONDS \* 2/);
  assert.match(source, /target\.repeatable/);
});

test('Beaver Bonanza uses rear pop-ups, clearable banks, runners, gold frenzy, and curved logs', () => {
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
  assert.match(source, /saturate\(\.66\) brightness\(\.86\) contrast\(\.9\)/);
  assert.match(source, /brightness\(1\.12\) saturate\(1\.08\) contrast\(1\.06\)/);
  assert.match(source, /target\.golden \? 'rgba\(255,207,74,\.92\)' : 'rgba\(255,236,186,\.55\)'/);
  assert.match(source, /function drawDamScene\(/);
  assert.match(source, /function drawDamWater\(/);
  assert.doesNotMatch(source, /function drawToyTank\(/);
  assert.doesNotMatch(source, /function drawTankRails\(/);
  assert.match(source, /kind: 'damBeaver'/);
  assert.match(source, /kind: 'damBank'/);
  assert.match(source, /kind: 'beaverRunner'/);
  assert.match(source, /kind: 'goldBeaver'/);
  assert.match(source, /openWindow: 1\.05/);
  assert.match(source, /popPeriod: 4\.8/);
  assert.match(source, /base: 2000/);
  assert.match(source, /CLEAR 3 ROWS → UNLOCK GOLD BEAVERS/);
  assert.match(source, /hittable: !target\.spent && openAmount > \.72/);
  assert.match(source, /function hitDamBeaver\(/);
  assert.match(source, /function hitDamBankTarget\(/);
  assert.match(source, /function spawnDamBank\(/);
  assert.match(source, /function processDamBank\(/);
  assert.match(source, /function spawnGoldenBeavers\(/);
  assert.match(source, /BANK \$\{wave \+ 1\} CLEAR/);
  assert.match(source, /GOLD BONANZA \+3000/);
  assert.match(source, /function drawDamBeaver\(/);
  assert.match(source, /if \(pos\.hittable\) \{[\s\S]*drawBeaverTarget\(target, false\)/);
  assert.match(source, /const revealTravel = clamp/);
  assert.match(source, /target\.popWarning/);
  assert.match(source, /'HIDING!'/);
  assert.match(source, /assets\/mania\/dam\/\$\{name\}/);
  assert.match(source, /target\.cycleOffset = mod\(\.18 - elapsed/);
  assert.match(source, /plates: \['beaverRunner'\]/);
  assert.match(source, /function launchLog\(/);
  assert.match(source, /function processLogFlights\(/);
  assert.match(source, /const foregroundThrow = aimY >= state\.height \* \.68/);
  assert.match(source, /const flightDuration = foregroundThrow \? \.14 : \.464/);
  assert.match(source, /const curveOffset = foregroundThrow[\s\S]*\? 0/);
  assert.match(source, /shot\.curveOffset[\s\S]*lerp\(startX, shot\.x, p\)/);
  assert.match(source, /const depth = clamp\(\(state\.height - aimY\) \/ Math\.max\(1, state\.height\), 0, 1\)/);
  assert.match(source, /Math\.pow\(depth, 1\.7\) \* Math\.min\(84, state\.width \* \.13\)/);
  assert.match(source, /x: aimX/);
  assert.match(source, /curveControlX = \(shot\.aimX \|\| shot\.x\) \+ \(shot\.curveOffset \|\| 0\) \* 1\.8/);
  assert.match(source, /const trailStart = 0/);
  assert.match(source, /strokeStyle = 'rgba\(49,31,22,\.68\)'/);
  assert.match(source, /function drawBankBeaver\(/);
  assert.match(source, /const setDelays = \[0, \.08, \.16, \.24, \.32\]/);
  assert.match(source, /\[\.14, \.505\], \[\.32, \.505\], \[\.5, \.505\], \[\.68, \.505\], \[\.86, \.505\]/);
  assert.match(source, /duration: 6\.2/);
  assert.match(source, /targetScale: \.68/);
  assert.match(source, /GOLD AFTER \$\{Math\.max\(0, 3 - value\)\} ROW/);
  assert.match(source, /ROW \$\{wave \+ 1\}\/3 CLEAR · \$\{rowsToGold\} TO GOLD BEAVERS!/);
  assert.match(source, /if \(target\.tier === 2\) ctx\.translate\(0, -15\)/);
  assert.match(source, /function drawDamGoldProgress\(/);
  assert.match(source, /index < state\.special/);
  assert.match(source, /drawBeaverTarget\(\{ type: 'expert', golden: state\.special >= 3 \}, true\)/);
  assert.match(source, /\['damBank', 'goldBeaver', 'beaverRunner', 'beaverPeek'\]\.includes\(target\.kind\)/);
  assert.match(source, /ctx\.rotate\(tumbleSide \* knockback \* Math\.PI \* 2\.35\)/);
  assert.match(source, /const beaverDepth = 1 - knockback \* \.56/);
  assert.match(source, /function drawDamMiddleRailMask\(/);
  assert.match(source, /function drawDamForegroundWaterMask\(/);
  assert.match(source, /const phoneRailFootOffset = w <= 620/);
  assert.match(source, /const waterline = h \* \.585/);
  assert.match(source, /waterline - amplitude/);
  assert.match(source, /drawDamForegroundWaterMask\(backdrop, w, h\)/);
  assert.match(source, /drawImageCover\(backdrop, w, h\)/);
  assert.match(source, /const cleared = !!target\?\.hit/);
  assert.match(source, /function targetVisualLayer\(/);
  assert.match(source, /if \(target\.kind === 'damBeaver'\) return 1/);
  assert.match(source, /boothId === 'plates' && !damMiddleMaskDrawn && visualLayer >= 3/);
  assert.match(source, /if \(target\.kind === 'beaverRunner' \|\| target\.kind === 'beaverPeek'\) return 5/);
  assert.match(source, /CLEAR 3 ROWS → UNLOCK GOLD BEAVERS/);
  assert.match(source, /if \(currentBooth\(\)\.id === 'plates'\) \{[\s\S]*return 0/);
});

test('Mania shots use hit feedback only', () => {
  const source = read('js/games/mania.js');
  assert.doesNotMatch(source, /SFX\.miss\(/);
});

test('Volcano runs a two-lane dinosaur balloon parade with comet-triggered eruptions', () => {
  const source = read('js/games/mania.js');
  for (const asset of [
    'volcano-parade-backdrop-v1.png',
    'dinosaur-trex-v1.png',
    'dinosaur-triceratops-v1.png',
    'comet-target-v1.png',
    'tree-balloon-raspberry-v1.png',
    'tree-balloon-gold-v1.png',
    'tree-balloon-teal-v1.png',
    'eruption-balloon-v1.png',
  ]) {
    assert.ok(fs.existsSync(path.join(root, `assets/mania/volcano/${asset}`)));
  }
  assert.match(source, /assets\/mania\/volcano\/volcano-parade-backdrop-v1\.png/);
  assert.match(source, /saturate\(\.78\) brightness\(\.92\) contrast\(\.92\)/);
  assert.match(source, /function drawVolcanoParallax\(/);
  assert.match(source, /function spawnVolcanoDinosaur\(/);
  assert.match(source, /kind: 'dinosaur'/);
  assert.match(source, /kind: 'dinoBalloon'/);
  assert.match(source, /function drawDinosaurTethers\(/);
  assert.match(source, /if \(target\.kind === 'dinosaur'\) return target\.lane < \.7 \? 2 : 4/);
  assert.match(source, /if \(target\.kind === 'dinoBalloon'\) return target\.parent\?\.lane < \.7 \? 3 : 5/);
  assert.match(source, /function drawDinosaurTarget\(/);
  assert.match(source, /function hitDinosaur\(/);
  assert.match(source, /carefulClear \? 700 : target\.base/);
  assert.match(source, /cascadeScore \+= 50/);
  assert.match(source, /assets\/mania\/volcano\/\$\{balloonName\}-v1\.png/);
  assert.match(source, /assets\/mania\/volcano\/comet-target-v1\.png/);
  assert.match(source, /function volcanoSpray\(/);
  assert.match(source, /state\.eruptionAt = state\.elapsed/);
  assert.match(source, /if \(currentBooth\(\)\.id === 'volcano'\) \{[\s\S]*return 0/);
  assert.match(source, /kind: 'volcanoComet'/);
  assert.match(source, /base: 750 \+ stageIndex \* 250/);
  assert.match(source, /function drawVolcanoStageLights\(/);
  assert.match(source, /function drawVolcanoObjective\(/);
  assert.match(source, /CLEAR COMETS · WAVE/);
  assert.match(source, /\[0, 6, 12\]\.forEach/);
  assert.match(source, /COMET WAVE \$\{stageIndex \+ 1\}\/3/);
  assert.match(source, /wave\.forEach\(target => \{ target\.stageClearAwarded = true; \}\)/);
  assert.match(source, /if \(state\.special >= 3\) triggerEruption\(\)/);
});

test('Volcano eruptions use a compact glow and embers instead of long spaghetti trails', () => {
  const source = read('js/games/mania.js');
  assert.match(source, /function drawCompactVolcanoEruption\(/);
  assert.match(source, /ctx\.createRadialGradient\(baseX, baseY, 0, baseX, baseY, glowRadius\)/);
  assert.match(source, /drawCompactVolcanoEruption\(w \* \.5, h \* \.37/);
  assert.doesNotMatch(source, /baseX \+ spread \* w \* \(\.2 \+ age \* \.035\)/);
  assert.doesNotMatch(source, /w \* \(\.12 \+ i \* \.13\), -10/);
});

test('Every visible Mania target carries a consistent base-point badge', () => {
  const source = read('js/games/mania.js');
  assert.match(source, /function drawPointValue\(target\)/);
  assert.match(source, /drawPointValue\(target\)/);
  assert.match(source, /\(target\.hit && !target\.repeatable\)/);
  assert.match(source, /Math\.round\(target\.base\)\.toLocaleString\('en-US'\)/);
  assert.match(source, /ctx\.fillStyle = 'rgba\(8,8,20,\.9\)'/);
  assert.match(source, /ctx\.font = '12px "VCR", monospace'/);
  assert.match(source, /const animalScoreBadge = farmBadge \|\| \['damBeaver', 'damBank', 'goldBeaver', 'beaverRunner', 'beaverPeek'\]\.includes\(target\.kind\)/);
  assert.match(source, /const dinosaurBadge = target\.kind === 'dinosaur' \|\| target\.kind === 'dinoBalloon'/);
  assert.match(source, /dinosaurBadge[\s\S]*'800 22px Arial, sans-serif'/);
  assert.match(source, /const badgeH = dinosaurBadge \? 34 : animalScoreBadge \? 27 : 21/);
  assert.match(source, /function drawFarmPointOverlays\(/);
  assert.match(source, /drawFarmLayerMask\(w, h, \.84, 1\);[\s\S]*drawFarmPointOverlays\(now\)/);
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
  assert.match(source, /spawnFinaleStaticWave\(0, 0\)/);
  assert.match(source, /spawnFinaleStaticWave\(1, 0\)/);
  assert.match(source, /state\.finaleWave = 2/);
  assert.match(source, /\[\.3, \.36\],[\s\S]*\[\.7, \.72\]/);
  assert.match(source, /targetScale: \.72/);
  assert.match(source, /function unfoldFinaleBank\(/);
  assert.match(source, /const phoneLayout = state\.width <= 520/);
  assert.match(source, /const clusterWidth = phoneLayout \? \.135 : \.12/);
  assert.match(source, /const clusterHeight = phoneLayout \? \.115 : \.1/);
  assert.doesNotMatch(source, /\[target\.anchorX, target\.lane \+ clusterHeight, 500\]/);
  assert.match(source, /targetScale: phoneLayout \? \.58 : \.62/);
  assert.match(source, /unfoldLeaf: true/);
  assert.match(source, /TARGET BANK UNFOLDS · KEEP SCANNING!/);
  assert.match(source, /const knockback = clamp\(hitAge \/ \.42, 0, 1\)/);
  assert.match(source, /const tumbleSide = Math\.sign\(pos\.x - state\.width \* \.5\) \|\| 1/);
  assert.match(source, /ctx\.translate\(pos\.x, pos\.y\)/);
  assert.match(source, /ctx\.rotate\(tumbleSide \* knockback \* Math\.PI \* 4\.3\)/);
  assert.match(source, /const depthScale = 1 - knockback \* \.5/);
  assert.match(source, /const endOverEndSquash = 1 - Math\.abs/);
  assert.match(source, /ctx\.translate\(-pos\.x, -pos\.y\)/);
  assert.match(source, /growth = \.86 \+ Math\.abs/);
  assert.match(source, /scale \*= growth \* \(target\.targetScale \|\| 1\)/);
  assert.match(source, /function processFinaleStaticWaves\(/);
  assert.match(source, /const liveWaves = \[\.\.\.new Set/);
  assert.match(source, /spawnFinaleStaticWave\(replacementWave, state\.elapsed \+ \.08\)/);
  assert.match(source, /BANK CLEAR · NEW BLUE TARGET!/);
  assert.match(source, /target\.bankClearAwarded/);
  assert.match(source, /BANK \$\{wave \+ 1\} CLEAR \+\$\{clearBonus\}/);
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
  assert.match(source, /function processFinalePrecisionScroll\(/);
  assert.match(source, /if \(live\.length >= 3\) return/);
  assert.match(source, /target\.worldX - cameraX\(\) \+ state\.width \* \.5 < state\.width \* 1\.7/);
  assert.match(source, /const needed = 3 - live\.length/);
  assert.match(source, /spawnFinalePrecisionTarget\(/);
  assert.match(source, /PHASE 1 · OPEN & CLEAR THE BANK/);
  assert.match(source, /PHASE 2 · BREAK THE PLATE · HIT THE CENTER/);
  assert.match(source, /PHASE 3 · CLEAR LOCKS · WATCH FOR BONUS BATS/);
  assert.match(source, /function hitFinalePrecisionTarget\(/);
  assert.match(source, /armorStage: 0/);
  assert.match(source, /exposedAge >= \.18 && exposedAge <= 1\.05/);
  assert.match(source, /kind: 'finaleBat'/);
  assert.match(source, /assets\/mania\/finale\/bonus-bat-v1\.png/);
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

test('Each main booth replaces two ordinary targets with collectible hidden Moberinos', () => {
  const source = read('js/games/mania.js');
  assert.match(source, /hiddenMobeTotal: 2/);
  assert.match(source, /function makeHiddenMobeReplacement\(/);
  assert.match(source, /target\.originalType = target\.type/);
  assert.match(source, /target\.hiddenMobe = true/);
  assert.match(source, /state\.hiddenMobeTotal = 0/);
  assert.match(source, /const early = candidates\.filter/);
  assert.match(source, /const late = candidates\.filter/);
  assert.match(source, /function hiddenCharacterFor\(/);
  assert.match(source, /function shuffledHiddenCharacters\(/);
  assert.match(source, /const pool = \[\.\.\.GAME_CHARS\]/);
  assert.match(source, /\[pool\[index\], pool\[swapIndex\]\] = \[pool\[swapIndex\], pool\[index\]\]/);
  assert.match(source, /target\.character\?\.imgWhack/);
  assert.match(source, /drawHiddenMoberino\(target, now\)/);
  assert.match(source, /drawHiddenMoberino\(target, now\);\s+ctx\.restore\(\);\s+return;/);
  assert.match(source, /'FOUND!'/);
  assert.match(source, /showToast\(`DIAMOND FIND!\$\{foundName\}/);
  assert.match(source, /function drawHiddenMobeGlint\(/);
  assert.match(source, /ctx\.filter = 'brightness\(0\) invert\(1\)'/);
  assert.match(source, /const trim = target\.hit \? 4\.6 : 3\.8/);
  assert.match(source, /for \(let index = 0; index < 16; index \+= 1\)/);
  assert.match(source, /ctx\.globalCompositeOperation = 'screen'/);
  assert.match(source, /const sheenX = lerp/);
  assert.match(source, /ctx\.globalAlpha \*= \.34/);
  assert.match(source, /ctx\.globalAlpha \*= \.52/);
  assert.match(source, /scale = phoneStage \? \.82 : \.9/);
  assert.match(source, /const size = 88/);
  assert.match(source, /if \(cycle > \.16\) return/);
  assert.doesNotMatch(source, /ctx\.ellipse\(0, -12, 43, 51/);
  assert.match(source, /HIDDEN MOBERINOS ·/);
  assert.match(source, /Keep the cameo fully visible/);
});

test('Booths teach persistent stacking, priority, chains, and reveals', () => {
  const source = read('js/games/mania.js');
  assert.match(source, /requiredRings: 4/);
  assert.match(source, /ringWindow: 2\.35/);
  assert.match(source, /ORBIT_FREEZE_SECONDS = 5\.25/);
  assert.match(source, /formation\.length !== 6/);
  assert.match(source, /FROZEN \$\{frozen\}\/6/);
  assert.match(source, /FORMATION CLEAR!/);
  assert.match(source, /function processOrbitFormation\(/);
  assert.match(source, /openWindow: 1\.05/);
  assert.match(source, /function hitDamBeaver\(/);
  assert.match(source, /function triggerBalloonChain\(/);
  assert.match(source, /RICOCHET \+\$\{gained\}/);
  assert.match(source, /function openFinalePanel\(/);
  assert.match(source, /tier: nextTier/);
  assert.match(source, /TARGET POPS OPEN!/);
});

test('Farm throws eggs and Volcano throws visible darts', () => {
  const source = read('js/games/mania.js');
  assert.match(source, /TOSS EGGS · TRACK/);
  assert.match(source, /DART BALLOONS OR DINO/);
  assert.match(source, /shot\.kind === 'farm'/);
  assert.match(source, /ctx\.ellipse\(0, 0, 8, 11/);
  assert.match(source, /shot\.kind === 'volcano'/);
  assert.match(source, /const dartAngle = Math\.atan2/);
  assert.match(source, /triangle\(9, -5, 21, 0, 9, 5/);
  assert.match(source, /\['dinosaur', 'dinoBalloon', 'balloonTree', 'lavaBalloon', 'volcanoDecoy', 'volcanoComet'\]\.includes\(target\.kind\)/);
  assert.match(source, /scale \*= 1\.12/);
  assert.match(source, /if \(state\.width <= 520\) ctx\.scale\(1\.12, 1\.12\)/);
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
  assert.match(source, /const formation = \[\s*\[\.24, \.51\], \[\.5, \.49\], \[\.76, \.51\]/);
  assert.match(source, /formation\.length !== 6/);
  assert.match(source, /const cornerLaunches = \[1, 5\.8, 10\.6, 15\.4\]/);
  assert.match(source, /\['left', 'right'\]\.forEach/);
  assert.match(source, /duration: Math\.min\(4\.15, Math\.max\(\.6, ROUND_SECONDS - at\)\)/);
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
  assert.match(source, /NEXT BOOTH · 4/);
  assert.match(source, /function scheduleNextBooth\(/);
  assert.match(source, /}, 4000\)/);
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
  assert.match(source, /MISSES/);
  assert.doesNotMatch(source, /BEST COMBO/);
  assert.doesNotMatch(source, /state\.combo = nowSeconds/);
  assert.match(source, /mania-phone-landscape/);
  assert.match(css, /ROTATE TO PORTRAIT/);
});
