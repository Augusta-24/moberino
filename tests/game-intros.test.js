const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const grid = fs.readFileSync(path.join(root, 'js/games/gridlock-game.js'), 'utf8');
const gridCss = fs.readFileSync(path.join(root, 'css/games/gridlock.css'), 'utf8');
const shape = fs.readFileSync(path.join(root, 'js/games/packing-game.js'), 'utf8');
const shapeCss = fs.readFileSync(path.join(root, 'css/games/packing-game.css'), 'utf8');

test('Grid Lock teaches the mechanic introduced by every world', () => {
  ['training-array', 'sliding-array', 'obstacle-array', 'router-array', 'command-array']
    .forEach(world => assert.match(grid, new RegExp(`'${world}': \\{`)));
  assert.match(grid, /TAP THE CENTER CONDUIT TO ROTATE IT/);
  assert.match(grid, /DRAG A BAY CONDUIT INTO THE EMPTY CELL/);
  assert.match(grid, /ICE CELLS CANNOT HOLD CONDUITS/);
  assert.match(grid, /CYAN USES ONE CHANNEL · GREEN USES THE OTHER/);
  assert.match(grid, /TAP A BOLT TO SET IT TO CYAN OR GREEN/);
  assert.doesNotMatch(grid, /eyebrow:|carry:|rule:|action:/);
  assert.match(grid, /level\.worldId === 'obstacle-array'/);
  assert.match(grid, /gridlock-intro-demo is-rotate/);
  assert.match(grid, /gridlock-intro-demo is-slide/);
  assert.match(grid, /gridlock-intro-demo is-barrier/);
  assert.match(grid, /gridlock-intro-demo is-locked/);
  assert.match(grid, /gridlock-intro-demo is-router/);
  assert.match(grid, /GOLD CONDUITS CANNOT ROTATE OR SLIDE/);
  assert.match(gridCss, /gl-intro-center-rotate/);
  assert.match(gridCss, /gl-intro-slide-piece/);
  assert.match(gridCss, /gl-intro-router-cyan/);
  assert.match(gridCss, /gl-intro-router-green/);
  assert.match(grid, /is-command-intro/);
  assert.match(gridCss, /\.gridlock-start\.is-command-intro\s*\{[^}]*top:18px/s);
  assert.doesNotMatch(grid, /gl-spot-demo-slide/);
  assert.doesNotMatch(grid, /gl-spot-demo-obstacle/);
  assert.doesNotMatch(grid, /gl-spot-demo-pulse/);
  assert.match(grid, /gridLockAdvanceIntro/);
  assert.match(grid, /READ THE GRID STATE/);
  assert.match(grid, /LINK MISSING/);
  assert.match(gridCss, /\.gridlock-status-demo/);
  assert.match(gridCss, /\.is-leaking em\s*\{[^}]*background:#ff5d64/s);
});

test('Shape Mobe teaches each cumulative world with a visible demonstration', () => {
  ['classic-packing', 'linked-pieces', 'overlap-nodes', 'utility-pieces', 'expanding-containers']
    .forEach(world => assert.match(shape, new RegExp(`'${world}': \\{`)));
  ['pack', 'link', 'overlap', 'anchor']
    .forEach(demo => assert.match(shape, new RegExp(`demo: '${demo}'`)));
  assert.match(shape, /MATCHING DOTS MUST SHARE AN EDGE/);
  assert.match(shape, /PLACE TWO DIFFERENT PIECES ON EACH 2 CELL/);
  assert.match(shape, /ROTATE IT AROUND THE GOLD X/);
  assert.match(shape, /After the board completes, remaining pieces fill this space again\./);
  assert.match(shape, /levelWorld\.levels\[0\]\.id === level\.id/);
  assert.match(shape, /if \(showIntro\) \{[\s\S]*stage\.classList\.add\('is-paused'\)/);
  assert.doesNotMatch(shape, /eyebrow:|carry:|rule:|action:/);
  assert.match(shapeCss, /\.packing-start strong\s*\{\s*color:#fff/);
  assert.match(shape, /packing-intro-shade/);
  assert.match(shapeCss, /\.packing-intro-shade\s*\{[^}]*z-index:11/s);
  assert.match(shapeCss, /pg-intro-overlap-a/);
  assert.match(shapeCss, /pg-intro-overlap-b/);
  assert.match(shape, /packing-pack-piece/);
  assert.match(shapeCss, /pg-intro-pack-piece/);
  assert.match(shapeCss, /pg-intro-pack-tap/);
  assert.match(shape, /packing-anchor-piece/);
  assert.match(shapeCss, /\.packing-intro-demo\.is-anchor\s*\{\s*height:92px/);
  assert.match(shape, /positionZoneIntro/);
  assert.match(shape, /pge-overlap-zone-cell/);
  assert.match(shapeCss, /\.packing-zone-intro-focus\s*\{[^}]*box-shadow:0 0 0 9999px/s);
  assert.match(shapeCss, /\.packing-intro-demo i\s*\{[^}]*border-color:#62d990/s);
  assert.match(shapeCss, /\.packing-intro-demo b\s*\{[^}]*border-color:#f0bd4f/s);
});
