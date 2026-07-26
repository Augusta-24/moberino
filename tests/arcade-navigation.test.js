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

test('Snoob leads with Endless play and keeps authored boards under Challenges', () => {
  const source = read('js/games/snoob.js');
  assert.match(source, /snoob-mode-primary" onclick="snoobStart\(\)"/);
  assert.match(source, /<strong>PLAY<\/strong><span>ENDLESS/);
  assert.doesNotMatch(source, /<strong>▶ PLAY<\/strong>/);
  assert.match(source, /<strong>CHALLENGES<\/strong>/);
  assert.match(source, /label: 'SNOOB'/);
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
  assert.match(signal, /signal-mode-hero arcade-hero-card/);
  assert.match(signal, /signal-panel arcade-setup/);
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
