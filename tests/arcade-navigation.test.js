const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Whack leads with Rush, keeps 3 Lives secondary, and hides Party Mix', () => {
  const source = read('js/games/whack.js');
  assert.match(source, /whack-mode-card whack-mode-primary/);
  assert.match(source, />30 SECOND RUSH</);
  assert.match(source, />3 LIVES</);
  assert.match(source, /whack-mode-card" hidden aria-hidden="true"/);
  assert.match(source, /whackLaunchMenuMode\('classic'\)/);
  assert.match(source, /whackLaunchMenuMode\('whack'\)/);
});

test('Snoob launches directly into endless play and its result avoids level menus', () => {
  const source = read('js/games/snoob.js');
  assert.match(source, /window\.initSnoob = function\(\)[\s\S]*window\.snoobStart\(\)/);
  assert.match(source, />PLAY AGAIN<\/button>/);
  assert.match(source, />HIGH SCORES<\/button>/);
  assert.doesNotMatch(source, /onclick="snoobModes\(\)">SNOOB MENU/);
});

test('Snoob labels its gameplay HUD and keeps touch aiming deliberately damped', () => {
  const source = read('js/games/snoob.js');
  assert.match(source, /<div class="snoob-screen-title">SNOOB<\/div>/);
  assert.doesNotMatch(source, /<div class="snoob-hud-title">SNOOB<\/div>/);
  assert.match(source, /const TOUCH_AIM_BLEND = 0\.22/);
  assert.match(source, /updateAimFromEvent\(e, !isMousePointer\(e\)\)/);
  const css = read('css/games/snoob.css');
  assert.match(css, /\.snoob-wrap \{[\s\S]*justify-content: flex-start;/);
  assert.doesNotMatch(css, /\.snoob-screen-title \{[\s\S]*position: fixed;/);
});

test('Tile Swap mobile space theme avoids a cropped ring line', () => {
  const gridCss = read('css/games/consume.css');
  assert.doesNotMatch(gridCss, /transparent 0 42px,#6d54d4 43px 45px,transparent 46px/);
  assert.match(gridCss, /@media \(max-width: 480px\)/);
});

test('Tile Swap mode selection serves unseen puzzles without exposing level navigation', () => {
  const grid = read('js/games/consume.js');
  const tabletop = read('js/games/consume-rack.js');
  assert.match(grid, /function chooseUnseenLevel\(\)/);
  assert.match(grid, /function serveUnseenPuzzle\(\)/);
  assert.match(grid, /window\.initConsumeGrid[\s\S]*serveUnseenPuzzle\(\)/);
  assert.match(tabletop, /function chooseUnseenLevel\(\)/);
  assert.match(tabletop, /window\.initConsumeRack = next =>[\s\S]*serveUnseenPuzzle\(\)/);
  assert.match(tabletop, /consume-mode-card[\s\S]*data-mode="grid"/);
  assert.match(tabletop, /modeArt\('words'\)[\s\S]*modeArt\('numbers'\)/);
  assert.match(grid, /PLAY ANOTHER/);
  assert.match(tabletop, /PLAY ANOTHER/);
});

test('every Tile Swap mode shuffles a protected Shape Mobe-style world theme', () => {
  const grid = read('js/games/consume.js');
  const tabletop = read('js/games/consume-rack.js');
  const gridCss = read('css/games/consume.css');
  const rackCss = read('css/games/consume-rack.css');
  for (const source of [grid, tabletop]) {
    assert.match(source, /\['space', 'jungle', 'ice', 'ocean', 'magic'\]/);
    assert.match(source, /wrap\.dataset\.consumeTheme/);
  }
  assert.match(grid, /function clearTheme\(\)/);
  assert.match(tabletop, /function clearTheme\(\)/);
  assert.match(grid, /playSceneryMarkup\(\)/);
  assert.match(tabletop, /playSceneryMarkup\(\)/);
  for (const theme of ['space', 'jungle', 'ice', 'ocean', 'magic']) {
    assert.match(gridCss, new RegExp(`data-consume-theme="${theme}"`));
  }
  assert.match(gridCss, /\.consume-scenery-space/);
  assert.match(gridCss, /\.consume-scenery-ice/);
  assert.match(gridCss, /\.cw-board[^}]*background: rgba\(5,14,20,0\.96\)/);
  assert.match(rackCss, /\.kt-rack[^}]*background: rgba\(5,14,20,0\.96\)/);
});

test('Tile Swap Word Grid can shuffle only free board tiles', () => {
  const grid = read('js/games/consume.js');
  assert.match(grid, /function shuffleBoard\(\)/);
  assert.match(grid, /!tile\.wordId && !S\.tray\.includes\(tile\)/);
  assert.match(grid, /data-act="shuffle">SHUFFLE/);
  assert.match(grid, /if \(act === 'shuffle'\) shuffleBoard\(\)/);
});

test('Rummy opens from a deeper random pool than the other Tile Swap modes', () => {
  const tabletop = read('js/games/consume-rack.js');
  assert.match(tabletop, /const introductoryCount = mode === 'numbers'/);
  assert.match(tabletop, /Math\.ceil\(pool\.length \/ 2\)/);
  assert.match(tabletop, /Math\.ceil\(pool\.length \* 0\.85\)/);
});

test('shared contextual Back supports named parents and Grid Lock has one header', () => {
  const arcade = read('js/arcade.js');
  const gridlockCss = read('css/games/gridlock.css');
  const gridlockGame = read('js/games/gridlock-game.js');
  assert.match(arcade, /runArcadeContextBack/);
  assert.match(arcade, /config\.label \|\| 'ARCADE'/);
  assert.match(gridlockCss, /#pg-gridlock \.cats-header \{\s*display: none;/);
  assert.match(gridlockGame, />◀ ARCADE<\/button>/);
});

test('character selection is stored per player code and only gates new profiles', () => {
  const arcade = read('js/arcade.js');
  assert.match(arcade, /PLAYER_CHARACTER_PROFILES_KEY\s*=\s*'moberino-character-profiles-v1'/);
  assert.match(arcade, /savePlayerCharacter\(PlayerID\.get\(\), GAME_CHARS\[i\]\.name\)/);
  assert.match(arcade, /!hasPlayerCharacter\(playerTag\)/);
  assert.match(arcade, /window\._arcadeSessionStarted = false/);
});

test('new arcade player codes use a five-letter word and two digits', () => {
  const arcade = read('js/arcade.js');
  const wordsMatch = arcade.match(/const PLAYER_TAG_WORDS = \[([\s\S]*?)\];/);
  assert.ok(wordsMatch);
  const words = [...wordsMatch[1].matchAll(/'([A-Z]+)'/g)].map(match => match[1]);
  assert.ok(words.length > 0);
  assert.equal(words.every(word => word.length === 5), true);
  assert.match(arcade, /10 \+ Math\.floor\(Math\.random\(\) \* 90\)/);
  assert.ok(arcade.includes('^[A-Z]{5}[0-9]{2}$'));
  assert.match(arcade, /!ArcadeProfiles\.valid\(playerTag\)/);
  assert.match(arcade, /ArcadeProfiles\.discardLocalProfile\(playerTag\)/);
  assert.match(arcade, /PlayerID\.clear\(\)/);
});

test('shared arcade UX foundation defines semantic layout and radius rules', () => {
  const css = read('css/arcade.css');
  const guide = read('markdown/ARCADE_UX_DESIGN_SYSTEM.md');
  for (const token of [
    '--arcade-radius-control',
    '--arcade-radius-panel',
    '--arcade-radius-feature',
    '--arcade-radius-pill',
    '--arcade-content-narrow',
    '--arcade-content-wide',
  ]) assert.match(css, new RegExp(token));
  for (const component of [
    '.arcade-top-rail',
    '.arcade-hero-card',
    '.arcade-mode-row',
    '.arcade-peer-card',
    '.arcade-segmented',
    '.arcade-setup',
    '.arcade-hud',
    '.arcade-result',
  ]) assert.match(css, new RegExp(component.replace('.', '\\.')));
  assert.match(guide, /Rounding communicates object type/);
  assert.match(guide, /Grid Lock keeps its cockpit, world map, and mission-board composition/);
  assert.match(guide, /Unique layout is\s+not an exception to interaction consistency/);
});

test('Space and Sound uses the approved hero and guided setup patterns', () => {
  const signal = read('js/games/signal.js');
  assert.match(signal, /signal-select-hero/);
  assert.match(signal, /signal-select-secondary/);
  assert.match(signal, /signal-panel arcade-setup/);
});

test('Space and Sound reserves recording controls without overlapping or resizing pads', () => {
  const signal = read('js/games/signal.js');
  assert.match(signal, /if \(guidedCoachActive\(\)\) \{\s*bottomReserve = 190;/);
  assert.match(signal, /const bottom = Math\.max\(top, playFieldBottom\(0\)\);/);
  assert.doesNotMatch(signal, /Math\.max\(top \+ 150, playFieldBottom\(0\)\)/);
});

test('Space and Sound clearly marks the live recording state', () => {
  const signal = read('js/games/signal.js');
  assert.match(signal, /`\$\{name\} — RECORDING`/);
  assert.match(signal, /fillStyle = '#ff304f'/);
  assert.match(signal, /Math\.sin\(now\(\) \/ 420\)/);
  assert.match(signal, /guidedStage === 'record' \? 'rgba\(255,48,79,0\.92\)'/);
  assert.match(signal, /guidedControlButton\('READY TO RECORD', startGuidedRecordPass, true\)/);
  assert.match(signal, /ready\.style\.borderColor = 'rgba\(255,48,79,\.96\)'/);
  assert.match(signal, /guidedControlButton\('SAVE LAYER', captureNextLayer, true\)/);
  assert.match(signal, /saveLayer\.style\.borderColor = 'rgba\(66,255,140,\.96\)'/);
});

test('Space and Sound records held Bass and Keys notes as sustained playback', () => {
  const signal = read('js/games/signal.js');
  assert.match(signal, /\(v\.inst === 'bass' \|\| v\.inst === 'keys'\) && v\.recordChoiceId/);
  assert.match(signal, /Math\.ceil\(heldMs \/ Math\.max\(1, beatMs\)\)/);
  assert.match(signal, /slot\.sustainSteps = Math\.max/);
  assert.match(signal, /durationMs = Math\.max\(1, slot\.sustainSteps \|\| 1\) \* beatMs/);
  assert.match(signal, /createHeldPitchedVoice\(inst, note, vel, brightness, durationSeconds, delaySeconds\)/);
  assert.match(signal, /choice\.brightness = v\.brightness/);
  assert.match(signal, /sustainedSlotAt\(i, row\)/);
});

test('Space and Sound Keys chord mode stays mood-safe and replays the held chord', () => {
  const signal = read('js/games/signal.js');
  assert.match(signal, /const CHORD_ROLES = \[/);
  for (const label of ['HOME', 'LIFT', 'DREAM', 'TENSION', 'DARK', 'RETURN']) {
    assert.match(signal, new RegExp(`label: '${label}'`));
  }
  assert.match(signal, /keysPlayMode === 'chords'/);
  assert.match(signal, /chordOctave = chordOctave >= 1 \? -1 : chordOctave \+ 1/);
  assert.match(signal, /chordVoicing = chordVoicing === 'tight' \? 'wide' : 'tight'/);
  assert.match(signal, /startExpressiveChord\(chord, pos \|\| rock\)/);
  assert.match(signal, /function chordNameForRole\(role\)/);
  assert.match(signal, /suffix: 'sus4'/);
  assert.match(signal, /r\.chordName \|\| \(chord && chord\.name\)/);
  assert.match(signal, /const halfW = r\.r \* 1\.42/);
  assert.match(signal, /function stampChord\(rock, target, chord, tight, isNextStep\)/);
  assert.match(signal, /notes: chord\.notes\.slice\(0, MAX_PIANO_STACK\)/);
  assert.match(signal, /chordRole: v\.chordRole \|\| null/);
  assert.match(signal, /chordRole: choice\.chordRole \|\| null/);
  assert.match(signal, />\$\{chordsOn \? '✓ ' : ''\}CHORDS<\/button>/);
  assert.match(signal, /signalSetFreeLayer\(\$\{keysIndex\},'chords'\)/);
  assert.match(signal, /freeStartKeysMode = keysMode === 'chords' \? 'chords' : 'notes'/);
});

test('Space and Sound gives Chimes an invisible pull band outside the visible ring', () => {
  const signal = read('js/games/signal.js');
  assert.match(signal, /orbLayerInst\(\) === 'chimes' \? 1\.32 : 1/);
  assert.match(signal, /Math\.hypot\(dx, dy\) \/ tc\.maxR, 0, maxPull/);
  assert.doesNotMatch(signal, /\[0\.12, 0\.4, 0\.7, 1, 1\.32\]/);
  assert.match(signal, /isSwell \? 1 : 1\.35/);
  assert.match(signal, /active \? 15 : 13/);
});

test('Space and Sound FX includes distinct Impact and Glitch gestures', () => {
  const signal = read('js/games/signal.js');
  assert.match(signal, /\{ label: 'IMPACT', piece: 'impact'/);
  assert.match(signal, /\{ label: 'GLITCH', piece: 'glitch'/);
  assert.match(signal, /if \(piece === 'impact'\)/);
  assert.match(signal, /if \(piece === 'glitch'\)/);
  assert.match(signal, /const positions = \[\s*\[0\.20, 0\.30\]/);
  assert.match(signal, /fillText\('TAP OR PINCH THE JUNK', W \* 0\.5, playFieldBottom\(0\) \+ 18\)/);
});

test('Space and Sound keeps practiced gestures deterministic through saved playback', () => {
  const signal = read('js/games/signal.js');
  assert.doesNotMatch(signal, /playRandomSfx\('hit'/);
  assert.doesNotMatch(signal, /playRandomSfx\('fx', timing/);
  assert.match(signal, /playPitched\('chimes', note, 1, 0\)/);
  assert.match(signal, /openness: rock\.openness/);
  assert.match(signal, /intensity: rock\.intensity/);
  assert.match(signal, /openness: Number\.isFinite\(v\.openness\)/);
  assert.match(signal, /intensity: Number\.isFinite\(choice\.intensity\)/);
});

test('Space and Sound makes free-form layers and the mixer easier to control', () => {
  const signal = read('js/games/signal.js');
  const css = read('css/games/signal.css');
  assert.match(signal, /FREE-FORM · \$\{savedCount\} SAVED · CHOOSE ANY INSTRUMENT/);
  assert.match(signal, /status === 'RECORDING' \? '#ff304f' : status === 'SAVED' \? '#42ff8c'/);
  assert.match(signal, /guidedControlButton\('START WITH REST'/);
  assert.doesNotMatch(signal, /btn\.addEventListener\('pointerdown', activate\)/);
  assert.doesNotMatch(signal, /btn\.addEventListener\('touchend', activate/);
  assert.match(signal, /signalToggleLayerMute/);
  assert.match(signal, /signalToggleLayerSolo/);
  assert.match(signal, /aria-label="\$\{layer\.name\} mute"/);
  assert.match(signal, /aria-label="\$\{layer\.name\} solo"/);
  assert.match(css, /\.signal-panel\.signal-mix-panel \{\s*width: min\(96vw, 920px\)/);
  assert.match(css, /\.signal-mix-slider \{[\s\S]*height: 30px/);
});

test('end states share a primary, game-menu, and arcade hierarchy without Snoob stars', () => {
  const arcade = read('js/arcade.js');
  const whack = read('js/games/whack.js');
  const match = read('js/games/match.js');
  const snoob = read('js/games/snoob.js');
  const space = read('js/games/space.js');
  const grid = read('js/games/consume.js');
  const tabletop = read('js/games/consume-rack.js');
  const face = read('js/games/face-factory.js');
  const signal = read('js/games/signal.js');

  assert.match(arcade, /arcade-result-card/);
  assert.match(arcade, /arcade-result-save-label/);
  for (const source of [whack, match, snoob, space, grid, tabletop, signal]) {
    assert.match(source, /arcade-result-primary/);
    assert.match(source, /arcade-result-secondary/);
    assert.match(source, /arcade-result-arcade/);
  }
  assert.match(match, /showBoard: didWin/);
  assert.match(match, /showSaveArea: didWin/);
  assert.match(face, /ff-completion-primary/);
  assert.match(face, /FACE FACTORY MENU/);
  assert.match(signal, />SAVE LOOP<\/button>/);
  assert.match(signal, />REPLAY TRACK<\/button>/);
  assert.match(signal, />BUILD ANOTHER<\/button>/);
  assert.doesNotMatch(snoob, /EARN STARS/);
  assert.doesNotMatch(snoob, /'★'\.repeat/);
});
