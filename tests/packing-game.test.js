const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const engineSource = fs.readFileSync(path.join(root, 'js/games/packing-game-engine.js'), 'utf8');
const mechanicsSource = fs.readFileSync(path.join(root, 'js/games/packing-game-mechanics.js'), 'utf8');
const levelsSource = fs.readFileSync(path.join(root, 'js/games/packing-game-levels.js'), 'utf8');
const progressionSource = fs.readFileSync(path.join(root, 'js/games/packing-game-progression.js'), 'utf8');
const uiSource = fs.readFileSync(path.join(root, 'js/games/packing-game.js'), 'utf8');
const arcadeHtml = fs.readFileSync(path.join(root, 'arcade.html'), 'utf8');
let packingStage = null;
let packingWindow = null;

function node(extra) {
  const children = []; const listeners = new Map(); const classes = new Set(); const attrs = {};
  return Object.assign({
    children, style: {},
    setAttribute(key, value) { attrs[key] = String(value); },
    getAttribute(key) { return attrs[key]; },
    appendChild(child) {
      if (child.parentNode) child.parentNode.removeChild(child);
      children.push(child); child.parentNode = this; return child;
    },
    removeChild(child) { const index = children.indexOf(child); if (index >= 0) children.splice(index, 1); child.parentNode = null; },
    get firstChild() { return children[0] || null; },
    querySelectorAll() { return []; },
    classList: { add(...names) { names.forEach(name => classes.add(name)); }, remove(...names) { names.forEach(name => classes.delete(name)); }, toggle(name, force) { if (force) classes.add(name); else classes.delete(name); }, contains(name) { return classes.has(name); } },
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { if (listeners.has(type)) listeners.get(type).delete(handler); },
    emit(type, event = {}) { (listeners.get(type) || []).forEach(handler => handler({ preventDefault() {}, target: this, clientX: 0, clientY: 0, ...event })); }
  }, extra);
}

function loadEngine() {
  const nodes = new Map();
  const stage = node({ tagName: 'svg', viewBox: { baseVal: { width: 560, height: 900 } }, getBoundingClientRect() { return { left: 0, top: 0, width: 560, height: 900 }; } });
  packingStage = stage;
  nodes.set('stage', stage); nodes.set('region', node()); nodes.set('tray', node());
  const window = node();
  packingWindow = window;
  const document = { getElementById(id) { return nodes.get(id) || null; }, createElementNS() { return node(); } };
  vm.runInNewContext(engineSource, { window, document, performance: { now: () => 0 }, Math, Object, Set, Array });
  return window.PackingGameEngine;
}

function loadCampaign() {
  const window = {};
  const context = { window, Object, Array, Math, Map, Number, Boolean };
  vm.runInNewContext(mechanicsSource, context);
  context.PackingGameMechanics = window.PackingGameMechanics;
  vm.runInNewContext(levelsSource, context);
  return { mechanics: window.PackingGameMechanics, levels: window.PackingGameLevels };
}

test('Shape Mobe is registered inside the arcade carousel with its own page and runtime', () => {
  assert.match(arcadeHtml, /id="ci-packing"/);
  const carouselStart = arcadeHtml.indexOf('<div id="game-carousel">');
  const carouselEnd = arcadeHtml.indexOf('<div class="carousel-nav-row"');
  const shapeCard = arcadeHtml.indexOf('id="ci-packing"');
  assert.ok(shapeCard > carouselStart && shapeCard < carouselEnd);
  assert.match(arcadeHtml, /SHAPE MOBE/);
  assert.match(arcadeHtml, /nav\('packing'\)/);
  assert.match(arcadeHtml, /id="pg-packing"/);
  assert.match(arcadeHtml, /packing-game-engine\.js/);
});

test('Packing Game runtime does not depend on Journey or Grid Lock globals', () => {
  assert.doesNotMatch(engineSource, /JourneyPackingEngine|JourneyState|GridLock/);
  assert.doesNotMatch(uiSource, /JourneyPackingEngine|JourneyState|GridLock/);
  assert.doesNotMatch(progressionSource, /journey|gridlock/i);
});

test('campaign runtime gives constrained generators enough attempts to avoid a dead-end screen', () => {
  assert.match(uiSource, /maxAttempts:\s*1800/);
  assert.match(engineSource, /maxAttempts:\s*nextConfig\.maxAttempts == null \? 600 : nextConfig\.maxAttempts/);
});

test('Shape Mobe celebrates the solved board before opening its completion panel', () => {
  assert.match(engineSource, /stageHost\.classList\.add\('is-completing'\)/);
  assert.match(engineSource, /node\.classList\.add\('is-victory-lit'\)/);
  assert.match(engineSource, /piece\.g\.classList\.add\('is-victory-locked'\)/);
  assert.match(engineSource, /Math\.max\(950, Math\.min\(1400, celebrateCells\.length \* cellDelay \+ 450\)\)/);
  const css = fs.readFileSync(path.join(root, 'css/games/packing-game.css'), 'utf8');
  assert.match(css, /\.pge-cell\.is-victory-lit/);
  assert.match(css, /\.pge-piece\.is-victory-locked \.pge-cell/);
});

test('packing-game mobile shells keep their padded widths within the viewport', () => {
  const css = fs.readFileSync(path.join(root, 'css/games/packing-game.css'), 'utf8');
  assert.match(css, /\.packing-cockpit\s*\{[^}]*box-sizing:\s*border-box;/s);
  assert.match(css, /\.packing-world-map\s*\{[^}]*box-sizing:\s*border-box;/s);
  assert.match(css, /\.packing-mission-screen\s*\{[^}]*box-sizing:\s*border-box;/s);
});

test('wide landscape stages place the rack left and board right', () => {
  const engine = loadEngine();
  packingStage.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1400, height: 800 });
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 6, verifySolutions: false, maxDimension: 8,
    autoLayout: {
      enabled: true, width: 560, minHeight: 660, maxHeight: 980,
      horizontalMinWidth: 900, horizontalMinAspect: 1.2,
      horizontalWidth: 960, horizontalHeight: 620
    }
  }), true);
  assert.equal(packingStage.getAttribute('viewBox'), '0 0 960 620');
  assert.equal(packingStage.classList.contains('is-horizontal-layout'), true);
  const pieces = engine.getTrayPieces();
  assert.equal(pieces.every(piece => piece.home.x < 440), true);
});

test('campaign declares five cumulative worlds and a playable ten-level World 1', () => {
  const { levels } = loadCampaign();
  assert.equal(levels.worlds.length, 5);
  assert.equal(levels.worlds[0].levels.length, 10);
  assert.equal(levels.worlds[0].levels.at(-1).generator.pieceCount, 10);
  assert.equal(levels.worlds[1].levels[0].generator.pieceCount, 10);
  assert.equal(levels.worlds[0].available, true);
  assert.equal(levels.worlds[1].available, true);
  assert.equal(levels.worlds[2].available, true);
  assert.equal(levels.worlds[3].available, true);
  assert.equal(levels.worlds[4].available, true);
  assert.equal(levels.worlds[1].levels.length, 10);
  assert.equal(levels.worlds[2].levels.length, 10);
  assert.equal(levels.worlds[0].levels.every(level => level.mechanics.board.topology === 'rectangle-holes'), true);
  assert.equal(levels.worlds[1].levels[0].mechanics.links.count, 1);
  assert.equal(levels.worlds[2].levels[0].mechanics.links.count, 1);
  assert.equal(levels.worlds[2].levels[0].mechanics.overlaps.count, 1);
  assert.equal(levels.worlds[3].levels.length, 10);
  assert.equal(levels.worlds[4].levels.length, 10);
  assert.equal(levels.worlds[3].levels[0].mechanics.anchors.count, 1);
  assert.equal(levels.worlds[3].levels[5].mechanics.anchors.linkedGroups, 1);
  assert.equal(levels.worlds[4].levels[0].mechanics.overlapZone.minCells, 3);
  assert.equal(levels.worlds[4].levels[0].mechanics.surplus.count, 0);
});

test('piece library includes the new five-square plus and capital T', () => {
  const engine = loadEngine();
  assert.equal(engine.PIECE_LIBRARY.length, 12);
  assert.equal(JSON.stringify(engine.PIECE_LIBRARY[10].cells), JSON.stringify([[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]]));
  assert.equal(JSON.stringify(engine.PIECE_LIBRARY[11].cells), JSON.stringify([[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]]));
});

test('every Shape Mobe piece has a unique silhouette and arcade color', () => {
  const engine = loadEngine();
  const silhouetteKeys = engine.PIECE_LIBRARY.map(piece => {
    const rotations = engine.orientations(piece.cells)
      .map(cells => JSON.stringify(cells))
      .sort();
    return rotations[0];
  });
  const colors = engine.PIECE_LIBRARY.map(piece => engine.PIECE_COLORS[piece.id]);
  assert.equal(new Set(silhouetteKeys).size, engine.PIECE_LIBRARY.length);
  assert.equal(new Set(colors).size, engine.PIECE_LIBRARY.length);
  assert.equal(colors.every(Boolean), true);
});

test('World 2 generates touching-pair constraints on a rectangular board with holes', () => {
  const engine = loadEngine();
  const { levels } = loadCampaign();
  levels.worlds[1].levels.forEach(level => {
    const puzzle = engine.generate({ ...level.generator, maxAttempts: 800 });
    assert.ok(puzzle, level.id);
    assert.equal(puzzle.links.length, level.mechanics.links.count, level.id);
    const uniqueLinkedPieces = new Set(puzzle.links.flatMap(link => link.pieceSlots)).size;
    if (!level.generator.linkSharedCount) assert.equal(uniqueLinkedPieces, puzzle.links.length * 2, `${level.id} reuses an early linked piece`);
    else assert.equal(uniqueLinkedPieces, puzzle.links.length + 1 + (puzzle.links.length - level.generator.linkSharedCount), `${level.id} has the wrong chain structure`);
    puzzle.links.forEach(link => {
      assert.equal(link.contacts.length, 2, `${level.id} lacks marked contact cells`);
      assert.deepEqual(link.contacts.map(marker => marker.slot), link.pieceSlots);
    });
    assert.ok(puzzle.board.blocked.length >= level.mechanics.board.minHoles, level.id);
    assert.ok(puzzle.board.blocked.length <= level.mechanics.board.maxHoles, level.id);
  });
});

test('World 3 generates cumulative links and exact double-occupancy nodes', () => {
  const engine = loadEngine();
  const { levels } = loadCampaign();
  levels.worlds[2].levels.forEach(level => {
    const puzzle = engine.generate({ ...level.generator, maxAttempts: 800 });
    assert.ok(puzzle, level.id);
    assert.equal(puzzle.links.length, level.mechanics.links.count, level.id);
    assert.equal(puzzle.overlapNodes.length, level.mechanics.overlaps.count, level.id);
    const pieceArea = puzzle.pieceIndexList.reduce((sum, pieceIndex) => sum + engine.PIECE_LIBRARY[pieceIndex].cells.length, 0);
    assert.equal(pieceArea, puzzle.region.length + puzzle.overlapNodes.length, level.id);
    puzzle.overlapNodes.forEach(node => {
      assert.equal(node.pieceSlots.length, 2);
    });
    const participatingSlots = puzzle.overlapNodes.flatMap(node => node.pieceSlots);
    assert.equal(new Set(participatingSlots).size, participatingSlots.length, `${level.id} reuses a piece across overlap nodes`);
  });
});

test('World 4 generates pinned pieces with legal scrambled orientations', () => {
  const engine = loadEngine();
  const { levels } = loadCampaign();
  levels.worlds[3].levels.forEach(level => {
    const puzzle = engine.generate({ ...level.generator, maxAttempts: 800 });
    assert.ok(puzzle, level.id);
    assert.equal(puzzle.anchors.length, level.mechanics.anchors.count, level.id);
    puzzle.anchors.forEach(anchor => {
      assert.notEqual(anchor.startOrientIdx, puzzle.solution[anchor.slot].orientIdx, level.id);
      assert.equal(anchor.boardCell.length, 2, level.id);
    });
    assert.equal(puzzle.anchorGroups.length, level.mechanics.anchors.linkedGroups, level.id);
    assert.ok(puzzle.board.blocked.length <= level.mechanics.board.maxHoles, level.id);
  });
});

test('World 5 generates a full first layer plus an independently tileable connected second layer', () => {
  const engine = loadEngine();
  const { levels } = loadCampaign();
  levels.worlds[4].levels.forEach(level => {
    const puzzle = engine.generate({ ...level.generator, maxAttempts: 800 });
    assert.ok(puzzle, level.id);
    assert.equal(puzzle.surplusCount, 0, level.id);
    assert.equal(puzzle.overlapNodes.length, 0, level.id);
    assert.equal(puzzle.overlapZone.length, level.generator.overlapZoneSize, level.id);
    const zone = new Set(puzzle.overlapZone.map(([r, c]) => `${r},${c}`));
    const seen = new Set([`${puzzle.overlapZone[0][0]},${puzzle.overlapZone[0][1]}`]);
    const pending = [puzzle.overlapZone[0]];
    while (pending.length) {
      const [r, c] = pending.pop();
      [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
        const k = `${nr},${nc}`;
        if (zone.has(k) && !seen.has(k)) { seen.add(k); pending.push([nr, nc]); }
      });
    }
    assert.equal(seen.size, zone.size, `${level.id} zone is disconnected`);
    const pieceArea = puzzle.pieceIndexList.reduce((sum, index) => sum + engine.PIECE_LIBRARY[index].cells.length, 0);
    assert.equal(pieceArea, puzzle.region.length + puzzle.overlapZone.length, level.id);
    assert.equal(puzzle.solution.length, puzzle.pieceIndexList.length, level.id);
    assert.equal(puzzle.anchors.length, level.mechanics.anchors.count, level.id);
    const secondLayerSlots = new Set(puzzle.secondLayerSlots);
    const firstLayerCells = new Set();
    const secondLayerCells = new Set();
    puzzle.solution.forEach((piece, slot) => {
      piece.cells.forEach(([r, c]) => {
        const cellKey = `${r},${c}`;
        const target = secondLayerSlots.has(slot) ? secondLayerCells : firstLayerCells;
        assert.equal(target.has(cellKey), false, `${level.id} repeats ${cellKey} within one layer`);
        target.add(cellKey);
      });
    });
    assert.equal(firstLayerCells.size, puzzle.region.length, level.id);
    assert.equal(secondLayerCells.size, puzzle.overlapZone.length, level.id);
    assert.deepEqual([...secondLayerCells].sort(), [...zone].sort(), level.id);
  });
});

test('World 5 exposes staged layer UI and a rebuild action', () => {
  assert.match(engineSource, /function unlockLayerTwo\(\)/);
  assert.match(engineSource, /rebuildLayerOne:\s*reset/);
  assert.match(uiSource, /LAYER 2 OPEN/);
  assert.match(uiSource, /REBUILD LAYER 1/);
  assert.match(levelsSource, /Layered Chambers/);
});

test('recorded World 3 solution satisfies holes, links, and overlaps cumulatively', () => {
  const engine = loadEngine();
  const ok = engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 10, verifySolutions: false, maxDimension: 10,
    minHoles: 2, maxHoles: 16, linkCount: 2, overlapCount: 2,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 5
  });
  assert.equal(ok, true);
  const puzzle = engine.getPuzzle();
  engine.getTrayPieces().forEach((piece, slot) => {
    piece.orientIdx = puzzle.solution[slot].orientIdx;
    piece.placedAt = [...puzzle.solution[slot].origin];
  });
  assert.equal(engine.checkComplete(), true);
});

test('matching link dots may satisfy their rule together on a World 3 overlap node', () => {
  const engine = loadEngine();
  const ok = engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 10, verifySolutions: false, maxDimension: 10,
    minHoles: 2, maxHoles: 16, linkCount: 1, overlapCount: 1,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 5
  });
  assert.equal(ok, true);
  const puzzle = engine.getPuzzle();
  engine.getTrayPieces().forEach((piece, slot) => {
    piece.orientIdx = puzzle.solution[slot].orientIdx;
    piece.placedAt = [...puzzle.solution[slot].origin];
  });
  const node = puzzle.overlapNodes[0];
  puzzle.links = [{
    id: 'overlap-link',
    pieceSlots: [...node.pieceSlots],
    contacts: node.pieceSlots.map((slot, index) => ({ slot, source: node.sources[index] }))
  }];
  assert.equal(engine.checkComplete(), true);
});

test('recorded World 5 solution fills every connected zone cell twice', () => {
  const engine = loadEngine();
  const ok = engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 11, overlapZoneSize: 5, verifySolutions: false, maxDimension: 11,
    minHoles: 0, maxHoles: 12, linkCount: 1, anchorCount: 1,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 5
  });
  assert.equal(ok, true);
  const puzzle = engine.getPuzzle();
  engine.getTrayPieces().forEach((piece, slot) => {
    piece.orientIdx = puzzle.solution[slot].orientIdx;
    piece.placedAt = [...puzzle.solution[slot].origin];
  });
  assert.equal(engine.checkComplete(), true);
});

test('standalone progression uses an independent storage namespace', () => {
  assert.match(progressionSource, /moberino-packing-game-progression-v1/);
  assert.doesNotMatch(progressionSource, /moberino-gridlock|moberino-journey/);
});

test('every World 1 recipe generates a verified solvable packing puzzle', () => {
  const engine = loadEngine();
  const { levels } = loadCampaign();
  levels.worlds[0].levels.forEach(level => {
    const puzzle = engine.generate({ ...level.generator, maxAttempts: 800 });
    assert.ok(puzzle, level.id);
    if (level.generator.verifySolutions === false) {
      const area = puzzle.pieceIndexList.reduce((sum, pieceIndex) => sum + engine.PIECE_LIBRARY[pieceIndex].cells.length, 0);
      assert.equal(puzzle.region.length, area, level.id);
      return;
    }
    const verification = engine.solveCount(puzzle.region, puzzle.pieceIndexList, level.generator.targetMax + 2, 200000);
    assert.equal(verification.exceeded, false, level.id);
    assert.ok(verification.count >= level.generator.targetMin, level.id);
    assert.ok(verification.count <= level.generator.targetMax, level.id);
  });
});

test('engine lifecycle starts in the Packing Game stage without persistence', () => {
  const engine = loadEngine();
  assert.equal(typeof engine.start, 'function');
  assert.equal(typeof engine.begin, 'function');
  assert.equal(typeof engine.destroy, 'function');
  assert.doesNotMatch(engineSource, /localStorage/);
});

test('a held piece lifts immediately, rotates from a second tap, and restores on an invalid release', () => {
  const engine = loadEngine();
  const ok = engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 4, verifySolutions: false, maxDimension: 7,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 4
  });
  assert.equal(ok, true);
  engine.begin();
  const piece = engine.getTrayPieces().find(candidate =>
    engine.orientations(engine.PIECE_LIBRARY[candidate.pieceIndex].cells).length > 1
  );
  assert.ok(piece);

  piece.g.emit('pointerdown', { clientX: piece.home.x, clientY: piece.home.y, pointerId: 1 });
  assert.equal(piece.floating, true);
  const before = piece.orientIdx;
  packingStage.emit('pointerdown', { clientX: 400, clientY: 400, pointerId: 2 });
  assert.notEqual(piece.orientIdx, before);
  const afterTap = piece.orientIdx;
  packingWindow.emit('keydown', { code: 'Space' });
  assert.notEqual(piece.orientIdx, afterTap);
  packingStage.emit('pointerup', { clientX: piece.home.x, clientY: piece.home.y, pointerId: 1 });
  assert.equal(piece.floating, false);

  piece.placedAt = [0, 0];
  piece.lastValidAt = [0, 0];
  piece.lastValidOrientIdx = piece.orientIdx;
  piece.floating = false;
  piece.g.emit('pointerdown', { clientX: 100, clientY: 100, pointerId: 3 });
  assert.equal(piece.placedAt, null);
  assert.equal(piece.floating, true);
  assert.equal(Array.from(piece.lastValidAt).join(','), '0,0');
  packingStage.emit('pointerup', { clientX: 100, clientY: 100, pointerId: 3 });
  assert.equal(piece.floating, false);
  assert.equal(Array.from(piece.placedAt).join(','), '0,0');
});

test('a simple rack tap rotates the piece and keeps the new orientation ready to drag', () => {
  const engine = loadEngine();
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 4, verifySolutions: false, maxDimension: 7,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 4
  }), true);
  engine.begin();
  const piece = engine.getTrayPieces().find(candidate =>
    engine.orientations(engine.PIECE_LIBRARY[candidate.pieceIndex].cells).length > 1
  );
  const before = piece.orientIdx;

  piece.g.emit('pointerdown', { clientX: piece.home.x, clientY: piece.home.y, pointerId: 1, pointerType: 'touch' });
  packingStage.emit('pointerup', { clientX: piece.home.x, clientY: piece.home.y, pointerId: 1, pointerType: 'touch' });

  assert.notEqual(piece.orientIdx, before);
  assert.equal(piece.homeOrientIdx, piece.orientIdx);
  assert.equal(piece.floating, false);
  assert.equal(piece.g.getAttribute('transform'), `translate(${piece.home.x},${piece.home.y})`);
});

test('drag motion reuses pickup geometry and does not remeasure the stage every frame', () => {
  const engine = loadEngine();
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 4, verifySolutions: false, maxDimension: 7,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 4
  }), true);
  engine.begin();
  let measurements = 0;
  packingStage.getBoundingClientRect = () => {
    measurements += 1;
    return { left: 0, top: 0, width: 560, height: 900 };
  };
  const piece = engine.getTrayPieces()[0];
  piece.g.emit('pointerdown', { clientX: piece.home.x, clientY: piece.home.y, pointerId: 1 });
  packingStage.emit('pointermove', { clientX: 160, clientY: 200, pointerId: 1 });
  packingStage.emit('pointermove', { clientX: 180, clientY: 220, pointerId: 1 });
  packingStage.emit('pointermove', { clientX: 200, clientY: 240, pointerId: 1 });

  assert.equal(measurements, 1);
});

test('drag coordinates account for letterboxing in the wide horizontal stage', () => {
  const engine = loadEngine();
  packingStage.viewBox.baseVal.width = 960;
  packingStage.viewBox.baseVal.height = 620;
  packingStage.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  packingStage.getBoundingClientRect = () => ({ left: 5, top: 56, width: 1270, height: 659 });
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 4, verifySolutions: false, maxDimension: 7,
    regionArea: { x: 470, y: 24, width: 466, height: 572, maxCellSize: 82 },
    rackArea: { x: 30, y: 76, width: 380, height: 500 },
    trayCellSize: 24, trayCols: 3
  }), true);
  engine.begin();
  const scale = 659 / 620;
  const offsetX = (1270 - 960 * scale) / 2;
  const toScreen = point => ({
    clientX: 5 + offsetX + point.x * scale,
    clientY: 56 + point.y * scale
  });
  const piece = engine.getTrayPieces()[0];
  const down = toScreen(piece.home);
  const target = { x: 300, y: 200 };
  const moved = toScreen(target);
  piece.g.emit('pointerdown', { ...down, pointerId: 1 });
  packingStage.emit('pointermove', { ...moved, pointerId: 1 });

  const translated = piece.g.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/).slice(1).map(Number);
  assert.ok(Math.abs(translated[0] - target.x) < .001);
  assert.ok(Math.abs(translated[1] - target.y) < .001);
});

test('a nearby invalid grid origin magnetically resolves to a valid preview and drop', () => {
  const engine = loadEngine();
  const regionArea = { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 };
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 4, verifySolutions: false, maxDimension: 7,
    regionArea,
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 4
  }), true);
  engine.begin();
  const puzzle = engine.getPuzzle();
  const region = new Set(puzzle.region.map(([r, c]) => `${r},${c}`));
  let scenario = null;
  puzzle.solution.some((solution, slot) => {
    const piece = engine.getTrayPieces()[slot];
    const cells = engine.orientations(engine.PIECE_LIBRARY[piece.pieceIndex].cells)[solution.orientIdx];
    return [[-1, 0], [1, 0], [0, -1], [0, 1]].some(direction => {
      const shiftedFits = cells.every(([r, c]) =>
        region.has(`${solution.origin[0] + direction[0] + r},${solution.origin[1] + direction[1] + c}`));
      if (shiftedFits) return false;
      scenario = { piece, solution, direction };
      return true;
    });
  });
  assert.ok(scenario);

  const rows = puzzle.region.map(([r]) => r);
  const cols = puzzle.region.map(([, c]) => c);
  const minR = Math.min(...rows), maxR = Math.max(...rows);
  const minC = Math.min(...cols), maxC = Math.max(...cols);
  const cellSize = Math.floor(Math.min(
    regionArea.width / (maxC - minC + 1),
    regionArea.height / (maxR - minR + 1),
    regionArea.maxCellSize
  ));
  const origin = {
    x: regionArea.x + (regionArea.width - (maxC - minC + 1) * cellSize) / 2 - minC * cellSize,
    y: regionArea.y + (regionArea.height - (maxR - minR + 1) * cellSize) / 2 - minR * cellSize
  };
  scenario.piece.orientIdx = scenario.solution.orientIdx;
  scenario.piece.g.emit('pointerdown', {
    clientX: scenario.piece.home.x,
    clientY: scenario.piece.home.y,
    pointerId: 1
  });
  const rawR = scenario.solution.origin[0] + scenario.direction[0] * .7;
  const rawC = scenario.solution.origin[1] + scenario.direction[1] * .7;
  const dragPoint = { clientX: origin.x + rawC * cellSize, clientY: origin.y + rawR * cellSize, pointerId: 1 };
  packingStage.emit('pointermove', dragPoint);
  assert.equal(scenario.piece.regionGroup.children.some(child =>
    String(child.getAttribute('class') || '').includes('pge-landing-ghost is-valid')), true);
  packingStage.emit('pointerup', dragPoint);

  assert.equal(Array.from(scenario.piece.placedAt).join(','), scenario.solution.origin.join(','));
});

test('dragging preserves the grabbed point when a rack preview enlarges to board scale', () => {
  const engine = loadEngine();
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 4, verifySolutions: false, maxDimension: 7,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 4
  }), true);
  engine.begin();
  const piece = engine.getTrayPieces().find(candidate =>
    engine.orientations(engine.PIECE_LIBRARY[candidate.pieceIndex].cells).length > 1
  );
  const down = { x: piece.home.x + 12, y: piece.home.y + 12 };
  const moved = { x: down.x + 3, y: 500 };
  piece.g.emit('pointerdown', { clientX: down.x, clientY: down.y });
  packingStage.emit('pointermove', { clientX: moved.x, clientY: moved.y });

  const position = piece.g.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/).slice(1).map(Number);
  const scale = piece.renderCellSize / 24;
  assert.ok(Math.abs((position[0] + 12 * scale) - moved.x) < .001);
  assert.ok(Math.abs((position[1] + 12 * scale) - moved.y) < .001);
  assert.ok(piece.renderCellSize > 24);
});

test('a lifted piece is promoted above every placed sibling', () => {
  const engine = loadEngine();
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 4, verifySolutions: false, maxDimension: 7,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 4
  }), true);
  engine.begin();
  const pieces = engine.getTrayPieces();
  const lifted = pieces[0];
  const layer = lifted.g.parentNode;
  assert.notEqual(layer.children.at(-1), lifted.g);

  lifted.g.emit('pointerdown', { clientX: lifted.home.x + 8, clientY: lifted.home.y + 8, pointerId: 1 });

  assert.equal(layer.children.at(-1), lifted.g);
  assert.equal(lifted.floating, true);
});

test('double-tapping a placed piece returns it directly to the rack', () => {
  const engine = loadEngine();
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 4, verifySolutions: false, maxDimension: 7,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 4
  }), true);
  engine.begin();
  const piece = engine.getTrayPieces().find(candidate =>
    engine.orientations(engine.PIECE_LIBRARY[candidate.pieceIndex].cells).length > 1
  );
  const homeOrientIdx = piece.homeOrientIdx;
  piece.orientIdx = (piece.orientIdx + 1) % engine.orientations(engine.PIECE_LIBRARY[piece.pieceIndex].cells).length;
  piece.placedAt = [0, 0];
  piece.lastValidAt = [0, 0];
  piece.lastValidOrientIdx = piece.orientIdx;

  piece.g.emit('pointerdown', { clientX: 40, clientY: 40, pointerId: 1 });
  packingStage.emit('pointerup', { clientX: 40, clientY: 40, pointerId: 1 });
  assert.equal(Array.from(piece.placedAt).join(','), '0,0');
  piece.g.emit('pointerdown', { clientX: 40, clientY: 40, pointerId: 2 });
  packingStage.emit('pointerup', { clientX: 40, clientY: 40, pointerId: 2 });

  assert.equal(piece.placedAt, null);
  assert.equal(piece.floating, false);
  assert.equal(piece.orientIdx, homeOrientIdx);
  assert.equal(piece.g.getAttribute('transform'), `translate(${piece.home.x},${piece.home.y})`);
});

test('anchored pieces rotate around their pin without lifting', () => {
  const engine = loadEngine();
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 10, verifySolutions: false, maxDimension: 10,
    minHoles: 0, maxHoles: 8, anchorCount: 1,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 5
  }), true);
  engine.begin();
  const anchor = engine.getPuzzle().anchors[0];
  const piece = engine.getTrayPieces()[anchor.slot];
  const before = piece.orientIdx;

  piece.g.emit('pointerdown', { clientX: 200, clientY: 200, pointerId: 1 });

  assert.notEqual(piece.orientIdx, before);
  assert.equal(piece.floating, false);
  assert.ok(piece.placedAt);
  assert.equal(piece.g.classList.contains('is-anchored'), true);
});

test('linked anchors rotate together from either member of the pair', () => {
  const engine = loadEngine();
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 12, verifySolutions: false, maxDimension: 11,
    minHoles: 0, maxHoles: 12, anchorCount: 2, anchorGroupCount: 1,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 5
  }), true);
  engine.begin();
  const group = engine.getPuzzle().anchorGroups[0];
  const pieces = group.slots.map(slot => engine.getTrayPieces()[slot]);
  const before = pieces.map(piece => piece.orientIdx);

  pieces[0].g.emit('pointerdown', { clientX: 200, clientY: 200, pointerId: 1 });

  assert.notEqual(pieces[0].orientIdx, before[0]);
  assert.notEqual(pieces[1].orientIdx, before[1]);
});

test('surplus puzzles complete with the announced number left in the rack', () => {
  const engine = loadEngine();
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 8, surplusCount: 1, verifySolutions: false, maxDimension: 9,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 5
  }), true);
  const puzzle = engine.getPuzzle();
  engine.getTrayPieces().forEach((piece, slot) => {
    if (slot >= puzzle.usedPieceCount) return;
    piece.orientIdx = puzzle.solution[slot].orientIdx;
    piece.placedAt = [...puzzle.solution[slot].origin];
  });
  assert.equal(engine.getTrayPieces().filter(piece => !piece.placedAt).length, 1);
  assert.equal(engine.checkComplete(), true);
});

test('reset restores the same generated puzzle and its original piece positions', () => {
  const engine = loadEngine();
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 8, surplusCount: 1, verifySolutions: false, maxDimension: 9,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 24, trayCols: 5
  }), true);
  const puzzle = engine.getPuzzle();
  const piece = engine.getTrayPieces()[0];
  piece.placedAt = [0, 0];
  piece.orientIdx = (piece.orientIdx + 1) % engine.orientations(engine.PIECE_LIBRARY[piece.pieceIndex].cells).length;

  assert.equal(engine.reset(), true);
  assert.equal(engine.getPuzzle(), puzzle);
  assert.equal(piece.placedAt, null);
  assert.equal(piece.orientIdx, piece.homeOrientIdx);
  assert.equal(piece.g.getAttribute('transform'), `translate(${piece.home.x},${piece.home.y})`);
});

test('floating pieces stay inside the stage and rotate around a stable center near an edge', () => {
  const engine = loadEngine();
  assert.equal(engine.start({
    stageId: 'stage', regionGroupId: 'region', trayGroupId: 'tray',
    pieceCount: 6, verifySolutions: false, maxDimension: 8,
    regionArea: { x: 20, y: 20, width: 500, height: 500, maxCellSize: 80 },
    rackArea: { x: 20, y: 600, width: 500, height: 260 },
    trayCellSize: 28, floatingCellSize: 46, trayCols: 5
  }), true);
  engine.begin();
  const piece = engine.getTrayPieces().find(candidate =>
    engine.orientations(engine.PIECE_LIBRARY[candidate.pieceIndex].cells).length > 1
  );
  assert.ok(piece);

  piece.g.emit('pointerdown', { clientX: 559, clientY: 890, pointerId: 1 });
  const first = piece.g.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/).slice(1).map(Number);
  const firstShape = engine.orientations(engine.PIECE_LIBRARY[piece.pieceIndex].cells)[piece.orientIdx];
  const firstWidth = (Math.max(...firstShape.map(([, c]) => c)) + 1) * piece.renderCellSize;
  assert.ok(first[0] >= 8 && first[0] + firstWidth <= 552);

  const beforeCenterX = first[0] + firstWidth / 2;
  packingStage.emit('pointerdown', { clientX: 300, clientY: 500, pointerId: 2 });
  const second = piece.g.getAttribute('transform').match(/translate\(([-\d.]+),([-\d.]+)\)/).slice(1).map(Number);
  const secondShape = engine.orientations(engine.PIECE_LIBRARY[piece.pieceIndex].cells)[piece.orientIdx];
  const secondWidth = (Math.max(...secondShape.map(([, c]) => c)) + 1) * piece.renderCellSize;
  assert.ok(second[0] >= 8 && second[0] + secondWidth <= 552);
  assert.ok(Math.abs((second[0] + secondWidth / 2) - beforeCenterX) <= secondWidth / 2);
});
