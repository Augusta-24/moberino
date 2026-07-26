const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const gameSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'gridlock.js'), 'utf8');
const modifierSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'gridlock-modifiers.js'), 'utf8');
const levelSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'gridlock-levels.js'), 'utf8');
const gameUiSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'gridlock-game.js'), 'utf8');

function svgNode() {
  const attributes = {}; const classes = new Set(); const children = []; const listeners = new Map();
  return {
    children,
    setAttribute(name, value) { attributes[name] = String(value); },
    getAttribute(name) { return attributes[name]; },
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: (...names) => names.forEach(name => classes.delete(name)), toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); }, contains: name => classes.has(name) },
    appendChild(child) { children.push(child); return child; },
    removeChild(child) { const index = children.indexOf(child); if (index >= 0) children.splice(index, 1); },
    get firstChild() { return children[0] || null; },
    addEventListener(type, handler) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(handler); },
    removeEventListener(type, handler) { if (listeners.has(type)) listeners.get(type).delete(handler); },
    emit(type, event = {}) { (listeners.get(type) || []).forEach(handler => handler({ preventDefault() {}, ...event })); }
  };
}

function createHarness() {
  const nodes = new Map();
  ['gridlock-stage', 'gridlock-grid', 'gridlock-objective', 'gridlock-needle', 'gridlock-meter-fill', 'gridlock-meter-bolts', 'gridlock-system-status', 'gridlock-bolt-0', 'gridlock-bolt-1', 'gridlock-bolt-2', 'gridlock-bolt-3', 'gridlock-source-0', 'gridlock-source-1']
    .forEach(id => nodes.set(id, svgNode()));
  const window = svgNode();
  window.setTimeout = callback => { callback(); return 1; };
  window.clearTimeout = () => {};
  const document = { getElementById(id) { return nodes.get(id) || null; }, createElementNS() { return svgNode(); } };
  vm.runInNewContext(gameSource, { window, document, performance: { now() { return 0; } }, Math, Object, Set, Array, Number });
  return { api: window.GridLock, nodes };
}

function loadLevels() {
  const window = {};
  const context = { window, Object, Array, Boolean, Number, Math, Map };
  vm.runInNewContext(modifierSource, context);
  context.GridLockModifiers = window.GridLockModifiers;
  vm.runInNewContext(levelSource, context);
  return window.GridLockLevels;
}

function loadNavigation() {
  const levels = loadLevels();
  const window = {};
  vm.runInNewContext(gameUiSource, { window, GridLockLevels: levels, Object });
  return window.GridLockNavigation;
}

function tileAt(harness, layout, row, column) {
  const transform = `translate(${layout.board.x + column * layout.board.cellSize + layout.board.cellSize / 2},${layout.board.y + row * layout.board.cellSize + layout.board.cellSize / 2})`;
  return harness.nodes.get('gridlock-grid').children.find(tile => tile.getAttribute('transform') === transform);
}

function tapTile(tile) {
  tile.emit('pointerdown');
  tile.emit('pointerup');
}

function solve(harness, config) {
  const layout = harness.api.layoutFor(config);
  harness.api.begin();
  harness.api.snapshot().forEach(tile => {
    const turns = (tile.solvedRot - tile.rot + 4) % 4;
    for (let index = 0; index < turns; index += 1) tapTile(tileAt(harness, layout, tile.r, tile.c));
  });
}

function dragTile(harness, layout, tile, empty) {
  const node = tileAt(harness, layout, tile.r, tile.c);
  const deltaX = (empty.c - tile.c) * 20;
  const deltaY = (empty.r - tile.r) * 20;
  node.emit('pointerdown', { clientX: 0, clientY: 0 });
  node.emit('pointermove', { clientX: deltaX, clientY: deltaY });
  node.emit('pointerup', { clientX: deltaX, clientY: deltaY });
}

function movementMoveSequence(snapshot, empty) {
  const initial = {
    empty: { r: empty.r, c: empty.c },
    tiles: snapshot.filter(tile => tile.movable).map(tile => ({ id: `${tile.homeR},${tile.homeC}`, r: tile.r, c: tile.c, homeR: tile.homeR, homeC: tile.homeC }))
  };
  const stateKey = state => `${state.empty.r},${state.empty.c}|${state.tiles.map(tile => `${tile.id}:${tile.r},${tile.c}`).sort().join('|')}`;
  const isSolved = state => state.tiles.every(tile => tile.r === tile.homeR && tile.c === tile.homeC);
  const queue = [{ state: initial, moves: [] }];
  const visited = new Set([stateKey(initial)]);
  while (queue.length) {
    const current = queue.shift();
    if (isSolved(current.state)) return current.moves;
    current.state.tiles.forEach(tile => {
      if (Math.abs(tile.r - current.state.empty.r) + Math.abs(tile.c - current.state.empty.c) !== 1) return;
      const next = {
        empty: { r: tile.r, c: tile.c },
        tiles: current.state.tiles.map(candidate => candidate.id === tile.id
          ? { ...candidate, r: current.state.empty.r, c: current.state.empty.c }
          : { ...candidate })
      };
      const nextKey = stateKey(next);
      if (visited.has(nextKey)) return;
      visited.add(nextKey);
      queue.push({ state: next, moves: [...current.moves, { r: tile.r, c: tile.c }] });
    });
  }
  throw new Error('Generated movement bay cannot return to its solution state.');
}

function shortestGridDistance(rows, columns, blocked, start, end) {
  const queue = [{ r: start.r, c: start.c, distance: 0 }];
  const visited = new Set([`${start.r},${start.c}`]);
  while (queue.length) {
    const current = queue.shift();
    if (current.r === end.r && current.c === end.c) return current.distance;
    [[-1, 0], [0, 1], [1, 0], [0, -1]].forEach(([rowOffset, columnOffset]) => {
      const r = current.r + rowOffset;
      const c = current.c + columnOffset;
      const nextKey = `${r},${c}`;
      if (r < 0 || r >= rows || c < 0 || c >= columns || blocked.has(nextKey) || visited.has(nextKey)) return;
      visited.add(nextKey);
      queue.push({ r, c, distance: current.distance + 1 });
    });
  }
  return Infinity;
}

function solveSliding(harness, config) {
  const layout = harness.api.layoutFor(config);
  harness.api.begin();
  movementMoveSequence(harness.api.snapshot(), harness.api.emptyCell()).forEach(move => {
    const empty = harness.api.emptyCell();
    const tile = harness.api.snapshot().find(candidate => candidate.r === move.r && candidate.c === move.c);
    dragTile(harness, layout, tile, empty);
  });
  harness.api.snapshot().forEach(tile => {
    const turns = (tile.solvedRot - tile.rot + 4) % 4;
    for (let index = 0; index < turns; index += 1) tapTile(tileAt(harness, layout, tile.r, tile.c));
  });
  return harness.api.snapshot();
}

test('modifier contract provides immutable safe defaults and normalizes future rules', () => {
  const window = {};
  vm.runInNewContext(modifierSource, { window, Object, Array, Boolean, Number, Math });
  const modifiers = window.GridLockModifiers.normalize({ obstacles: { enabled: true, count: 2.7, pattern: 'barrier' }, lockedPieces: { enabled: true, count: 1.2 }, powerSources: { count: 0 }, specialTiles: [{ type: 'portal' }] });
  assert.equal(modifiers.slidingPieces.enabled, false);
  assert.equal(modifiers.slidingPieces.emptyCellCount, 0);
  assert.equal(modifiers.obstacles.enabled, true);
  assert.equal(modifiers.obstacles.count, 3);
  assert.equal(modifiers.obstacles.pattern, 'barrier');
  assert.equal(modifiers.lockedPieces.count, 1);
  assert.equal(modifiers.powerSources.count, 1);
  assert.equal(modifiers.specialTiles[0].type, 'portal');
  assert.equal(Object.isFrozen(modifiers), true);
});

test('engine exposes the lifecycle methods used by map and debug navigation', () => {
  const harness = createHarness();
  ['start', 'begin', 'undo', 'reset', 'destroy'].forEach(method => {
    assert.equal(typeof harness.api[method], 'function', method);
  });
});

test('map routing derives the correct world from the active level and preserves debug context', () => {
  const navigation = loadNavigation();
  assert.equal(navigation.worldIdForLevel('array-10'), 'training-array');
  assert.equal(navigation.worldIdForLevel('command-10'), 'command-array');
  assert.equal(navigation.navigationDestination('command-10', false).screen, 'world');
  assert.equal(navigation.navigationDestination('command-10', false).worldId, 'command-array');
  assert.equal(navigation.navigationDestination('command-10', true).screen, 'debug');
  assert.equal(navigation.navigationDestination('missing-level', false).worldId, null);
});

test('levels declare generator inputs and normalized modifier contracts', () => {
  const levels = loadLevels();
  assert.equal(levels.worlds[0].levels.length, 10);
  assert.equal(levels.worlds[1].levels.length, 10);
  assert.equal(levels.worlds[2].levels.length, 10);
  assert.equal(levels.worlds[3].levels.length, 10);
  assert.equal(levels.worlds[4].levels.length, 10);
  assert.equal(levels.worlds[0].levels.filter(level => level.order < 3).every(level => level.size.rows === 5 && level.size.columns === 5), true);
  assert.equal(levels.worlds[0].levels.filter(level => level.order >= 3).every(level => level.size.rows === 6 && level.size.columns === 6), true);
  levels.worlds.forEach(world => world.levels.forEach((level, index) => {
    assert.equal(level.order, index + 1);
    assert.ok(level.size.rows >= 5 && level.size.columns >= 5);
    assert.ok(level.generationRules.loopEdgeChance > 0);
    assert.ok(level.briefing.length > 0);
    const dualSystem = level.modifiers.powerSystems.enabled;
    assert.equal(level.modifiers.powerSources.count, dualSystem ? 2 : 1);
  }));
  assert.equal(levels.get('sliding-01').modifiers.slidingPieces.enabled, true);
  assert.equal(levels.get('sliding-01').modifiers.slidingPieces.movementCells.length, 4);
  assert.equal(levels.get('obstacle-01').modifiers.obstacles.enabled, true);
  assert.equal(levels.get('obstacle-01').modifiers.obstacles.pattern, 'barrier');
  assert.equal(levels.get('obstacle-01').modifiers.slidingPieces.enabled, true);
  assert.equal(levels.get('obstacle-01').modifiers.lockedPieces.enabled, true);
  assert.equal(levels.get('router-01').modifiers.powerSystems.systems.length, 2);
  levels.worlds[3].levels.forEach(level => {
    assert.equal(level.modifiers.slidingPieces.movementCells.length, 4);
    assert.equal(level.modifiers.specialTiles.filter(tile => tile.type === 'router').length, level.order >= 7 ? 2 : 1);
  });
  assert.equal(levels.get('command-01').modifiers.powerSystems.systems.flatMap(system => system.sinks).filter(sink => sink.programmable).length, 2);
  assert.equal(levels.get('command-01').modifiers.powerSystems.randomizeColors, true);
  assert.equal(levels.get('command-01').modifiers.specialTiles.filter(tile => tile.type === 'router').length, 1);
  assert.equal(levels.get('command-02').modifiers.powerSystems.systems.flatMap(system => system.sinks).filter(sink => sink.programmable).length, 2);
  levels.worlds[4].levels.forEach(level => {
    assert.equal(level.modifiers.specialTiles.filter(tile => tile.type === 'router').length, level.order >= 5 ? 2 : 1);
    assert.equal(level.modifiers.slidingPieces.enabled, level.order >= 4 && level.order !== 5);
    assert.equal(level.modifiers.obstacles.enabled, [7, 9, 10].includes(level.order));
    assert.equal(level.modifiers.lockedPieces.enabled, level.order >= 8);
    const movementCells = new Set(level.modifiers.slidingPieces.movementCells.map(cell => `${cell.r},${cell.c}`));
    level.modifiers.powerSystems.systems.flatMap(system => system.sinks).forEach(sink => {
      assert.equal(movementCells.has(`${sink.r},${sink.c}`), false, `${level.id} keeps bolts outside the movement bay`);
    });
  });
  assert.equal([...levels.get('command-03').modifiers.powerSystems.systems.flatMap(system => system.sinks).map(sink => sink.side)].sort().join(','), 'e,n,n,w');
});

test('layout anchors always share the generated board geometry', () => {
  const harness = createHarness();
  [
    { size: { rows: 5, columns: 5 } },
    { size: { rows: 6, columns: 6 } },
    { size: { rows: 7, columns: 8 } }
  ].forEach(config => {
    const layout = harness.api.layoutFor(config);
    assert.equal(layout.source.x, layout.board.x + layout.board.cellSize / 2);
    assert.equal(layout.source.y, layout.board.y + layout.board.height);
    layout.sinks.forEach(sink => {
      assert.equal(sink.y, layout.board.y);
      assert.equal(sink.x, layout.board.x + sink.c * layout.board.cellSize + layout.board.cellSize / 2);
    });
  });
});

test('every World 1 recipe generates a solvable board and completes once', () => {
  loadLevels().worlds[0].levels.forEach(level => {
    const harness = createHarness();
    const results = [];
    assert.equal(harness.api.start({ ...level, stageId: 'gridlock-stage', onSuccessReady(result) { results.push(result); } }), true);
    assert.equal(harness.api.snapshot().length, level.size.rows * level.size.columns);
    solve(harness, level);
    assert.equal(results.length, 1, level.id);
    assert.equal(results[0].outcome, 'success');
  });
});

test('Sliding Grid keeps the empty slot inside its declared movement bay and slides only adjacent bay conduits', () => {
  const level = loadLevels().get('sliding-01');
  const harness = createHarness();
  assert.equal(harness.api.start({ ...level, stageId: 'gridlock-stage' }), true);
  assert.equal(harness.api.snapshot().length, 24);
  assert.equal(harness.api.snapshot().filter(tile => tile.movable).length, 3);
  const empty = harness.api.emptyCell();
  assert.ok(empty);
  const movementCells = new Set(level.modifiers.slidingPieces.movementCells.map(cell => `${cell.r},${cell.c}`));
  assert.ok(movementCells.has(`${empty.r},${empty.c}`));
  assert.ok(harness.api.snapshot().filter(tile => tile.movable).every(tile => movementCells.has(`${tile.r},${tile.c}`)));
  const layout = harness.api.layoutFor(level);
  harness.api.begin();
  const movable = harness.api.snapshot().find(tile => tile.movable && Math.abs(tile.r - empty.r) + Math.abs(tile.c - empty.c) === 1);
  assert.ok(movable);
  const before = { ...movable };
  dragTile(harness, layout, movable, empty);
  const updatedEmpty = harness.api.emptyCell();
  assert.equal(updatedEmpty.r, movable.r);
  assert.equal(updatedEmpty.c, movable.c);
  assert.equal(harness.api.snapshot().find(tile => tile.homeR === before.homeR && tile.homeC === before.homeC).rot, before.rot);
});

test('every Sliding Grid recipe builds and solves through a bounded 2×2 movement bay', () => {
  loadLevels().worlds[1].levels.forEach(level => {
    const harness = createHarness();
    const results = [];
    const movementCells = new Set(level.modifiers.slidingPieces.movementCells.map(cell => `${cell.r},${cell.c}`));
    assert.equal(movementCells.size, 4);
    const rows = [...new Set(level.modifiers.slidingPieces.movementCells.map(cell => cell.r))].sort((left, right) => left - right);
    const columns = [...new Set(level.modifiers.slidingPieces.movementCells.map(cell => cell.c))].sort((left, right) => left - right);
    assert.deepEqual(rows, [rows[0], rows[0] + 1], `${level.id} rows`);
    assert.deepEqual(columns, [columns[0], columns[0] + 1], `${level.id} columns`);
    assert.equal(harness.api.start({ ...level, stageId: 'gridlock-stage', onSuccessReady(result) { results.push(result); } }), true);
    assert.equal(harness.api.snapshot().filter(tile => tile.movable).length, 3);
    assert.ok(movementCells.has(`${harness.api.emptyCell().r},${harness.api.emptyCell().c}`));
    const solvedSnapshot = solveSliding(harness, level);
    assert.ok(solvedSnapshot.every(tile => tile.r === tile.homeR && tile.c === tile.homeC && tile.rot === tile.solvedRot), level.id);
    assert.equal(results.length, 1, level.id);
    assert.equal(results[0].outcome, 'success');
  });
});

test('undo reverses rotations and slides while reset restores the same generated scramble', () => {
  const level = loadLevels().get('sliding-01');
  const harness = createHarness();
  const historyStates = [];
  assert.equal(harness.api.start({ ...level, stageId: 'gridlock-stage', onHistoryChange(state) { historyStates.push({ ...state }); } }), true);
  const layout = harness.api.layoutFor(level);
  const canonical = () => JSON.stringify({
    empty: harness.api.emptyCell(),
    tiles: harness.api.snapshot().map(tile => ({ homeR: tile.homeR, homeC: tile.homeC, r: tile.r, c: tile.c, rot: tile.rot }))
      .sort((left, right) => left.homeR - right.homeR || left.homeC - right.homeC)
  });
  const initial = canonical();
  harness.api.begin();
  assert.deepEqual(historyStates.at(-1), { canUndo: false, canReset: true });

  const rotatable = harness.api.snapshot().find(tile => !tile.locked);
  tapTile(tileAt(harness, layout, rotatable.r, rotatable.c));
  assert.notEqual(canonical(), initial);
  assert.equal(harness.api.undo(), true);
  assert.equal(canonical(), initial);

  const empty = harness.api.emptyCell();
  const movable = harness.api.snapshot().find(tile => tile.movable && Math.abs(tile.r - empty.r) + Math.abs(tile.c - empty.c) === 1);
  dragTile(harness, layout, movable, empty);
  assert.notEqual(canonical(), initial);
  assert.equal(harness.api.undo(), true);
  assert.equal(canonical(), initial);

  tapTile(tileAt(harness, layout, rotatable.r, rotatable.c));
  assert.equal(harness.api.reset(), true);
  assert.equal(canonical(), initial);
  assert.deepEqual(historyStates.at(-1), { canUndo: false, canReset: true });
});

test('Barrier Grid retains sliding, enforces a detour, and remains solvable', () => {
  loadLevels().worlds[2].levels.forEach(level => {
    for (let run = 0; run < 8; run += 1) {
      const harness = createHarness();
      const results = [];
      let started;
      try {
        started = harness.api.start({ ...level, stageId: 'gridlock-stage', onSuccessReady(result) { results.push(result); } });
      } catch (error) {
        throw new Error(`${level.id} run ${run}: ${error.message}`);
      }
      assert.equal(started, true);
      const layout = harness.api.layoutFor(level);
      const obstacles = harness.api.obstacleCells();
      const occupied = new Set(obstacles.map(cell => `${cell.r},${cell.c}`));
      const solutionEmpty = level.modifiers.slidingPieces.emptyCell;
      const blockedPathCells = new Set(occupied);
      blockedPathCells.add(`${solutionEmpty.r},${solutionEmpty.c}`);
      assert.equal(obstacles.length, level.modifiers.obstacles.count, `${level.id} run ${run}`);
      assert.equal(harness.api.snapshot().length, level.size.rows * level.size.columns - obstacles.length - 1);
      assert.equal(occupied.has(`${layout.source.r},${layout.source.c}`), false);
      layout.sinks.forEach(sink => assert.equal(occupied.has(`${sink.r},${sink.c}`), false));
      assert.equal(harness.api.snapshot().filter(tile => tile.movable).length, 3);
      assert.equal(harness.api.snapshot().filter(tile => tile.locked).length, level.modifiers.lockedPieces.count);
      assert.ok(harness.api.snapshot().filter(tile => tile.locked).every(tile => !tile.movable && tile.rot === tile.solvedRot));
      const sameRow = obstacles.every(cell => cell.r === obstacles[0].r);
      const sameColumn = obstacles.every(cell => cell.c === obstacles[0].c);
      assert.ok(sameRow || sameColumn, `${level.id} barrier is linear`);
      const positions = obstacles.map(cell => sameRow ? cell.c : cell.r).sort((left, right) => left - right);
      assert.equal(positions.every((position, index) => position === positions[0] + index), true);
      assert.ok(layout.sinks.some(sink => shortestGridDistance(level.size.rows, level.size.columns, blockedPathCells, layout.source, sink) > Math.abs(layout.source.r - sink.r) + Math.abs(layout.source.c - sink.c)), `${level.id} creates a detour`);
      harness.api.begin();
      const locked = harness.api.snapshot().find(tile => tile.locked);
      const lockedNode = tileAt(harness, layout, locked.r, locked.c);
      tapTile(lockedNode);
      assert.equal(harness.api.snapshot().find(tile => tile.homeR === locked.homeR && tile.homeC === locked.homeC).rot, locked.rot);
      solveSliding(harness, level);
      assert.equal(results.length, 1, `${level.id} run ${run}`);
      assert.equal(results[0].outcome, 'success');
    }
  });
});

test('Router Array generates its fixed insulated crossovers and solves both systems through them', () => {
  loadLevels().worlds[3].levels.forEach(level => {
    for (let run = 0; run < 10; run += 1) {
      const harness = createHarness();
      const results = [];
      let started;
      try {
        started = harness.api.start({ ...level, stageId: 'gridlock-stage', onSuccessReady(result) { results.push(result); } });
      } catch (error) {
        throw new Error(`${level.id} run ${run}: ${error.message}`);
      }
      assert.equal(started, true);
      const routers = harness.api.snapshot().filter(tile => tile.type === 'router');
      assert.equal(routers.length, level.order >= 7 ? 2 : 1, `${level.id} run ${run}`);
      assert.ok(routers.every(router => router.locked && !router.movable));
      assert.equal(level.modifiers.slidingPieces.movementCells.length, 4);
      if (level.id === 'router-02') {
        const bay = new Set(level.modifiers.slidingPieces.movementCells.map(cell => `${cell.r},${cell.c}`));
        assert.ok([...bay].some(cell => {
          const [r, c] = cell.split(',').map(Number);
          return Math.abs(r - routers[0].r) + Math.abs(c - routers[0].c) === 1;
        }));
      }
      if (level.id === 'router-03') {
        assert.equal(harness.api.obstacleCells().length, 2);
        assert.equal(harness.api.snapshot().filter(tile => tile.locked && tile.type !== 'router').length, 1);
      }
      const solved = solveSliding(harness, level);
      assert.ok(solved.every(tile => tile.r === tile.homeR && tile.c === tile.homeC), `${level.id} run ${run}`);
      assert.equal(harness.nodes.get('gridlock-system-status').textContent, 'GRID LOCK SEALED', JSON.stringify(solved.filter(tile => tile.rot !== tile.solvedRot)));
      routers.forEach(router => {
        const routerPower = harness.api.circuitState().powerByCell[`${router.r},${router.c}`];
        assert.equal(routerPower.vertical.length, 1);
        assert.equal(routerPower.horizontal.length, 1);
        assert.deepEqual([routerPower.vertical[0], routerPower.horizontal[0]].sort(), [0, 1]);
      });
      assert.equal(harness.api.circuitState().crossCount, 0);
      assert.equal(harness.nodes.get('gridlock-bolt-0').classList.contains('is-lit'), true);
      assert.equal(harness.nodes.get('gridlock-bolt-1').classList.contains('is-lit'), true);
      assert.equal(results.length, 1, `${level.id} run ${run}`);
    }
  });
});

test('direct cyan-green contact is rejected as a crossed-circuit fault', () => {
  const level = loadLevels().get('router-03');
  let verifiedCollision = null;
  for (let run = 0; run < 24 && !verifiedCollision; run += 1) {
    const harness = createHarness();
    const layout = harness.api.layoutFor(level);
    assert.equal(harness.api.start({ ...level, stageId: 'gridlock-stage' }), true);
    harness.api.begin();
    movementMoveSequence(harness.api.snapshot(), harness.api.emptyCell()).forEach(move => {
      const empty = harness.api.emptyCell();
      const tile = harness.api.snapshot().find(candidate => candidate.r === move.r && candidate.c === move.c);
      dragTile(harness, layout, tile, empty);
    });
    const solution = harness.api.snapshot();
    const router = solution.find(tile => tile.type === 'router');
    const sources = new Set(level.modifiers.powerSystems.systems.map(system => `${system.source.r},${system.source.c}`));
    const sinks = new Set(level.modifiers.powerSystems.systems.flatMap(system => system.sinks.map(sink => `${sink.r},${sink.c}`)));
    const guard = solution.find(tile => !tile.locked && tile.shape === 'END' && tile.rot !== tile.solvedRot && !sources.has(`${tile.r},${tile.c}`) && !sinks.has(`${tile.r},${tile.c}`));
    assert.ok(guard, `router-03 run ${run} has an unsolved guard`);
    solution.filter(tile => !tile.locked && (tile.r !== guard.r || tile.c !== guard.c)).forEach(tile => {
      const turns = (tile.solvedRot - tile.rot + 4) % 4;
      for (let turn = 0; turn < turns; turn += 1) tapTile(tileAt(harness, layout, tile.r, tile.c));
    });
    assert.equal(harness.api.isActive(), true, `router-03 run ${run} remains unsolved with its leaf guard`);
    assert.equal(harness.nodes.get('gridlock-bolt-0').classList.contains('is-lit'), true, `router-03 run ${run} lights cyan bolt live`);
    assert.equal(harness.nodes.get('gridlock-bolt-1').classList.contains('is-lit'), true, `router-03 run ${run} lights green bolt live`);
    let crossed = harness.api.circuitState().crossCount > 0;
    const boundaryPairs = level.modifiers.powerSystems.splitColumns.flatMap((split, row) => {
      const left = harness.api.snapshot().find(tile => tile.r === row && tile.c === split - 1 && tile.type !== 'router');
      const right = harness.api.snapshot().find(tile => tile.r === row && tile.c === split && tile.type !== 'router');
      return left && right && !left.locked && !right.locked ? [{ left, right }] : [];
    });
    for (const pair of boundaryPairs) {
      for (let leftTurn = 0; leftTurn < 4 && !crossed; leftTurn += 1) {
        tapTile(tileAt(harness, layout, pair.left.r, pair.left.c));
        for (let rightTurn = 0; rightTurn < 4 && !crossed; rightTurn += 1) {
          tapTile(tileAt(harness, layout, pair.right.r, pair.right.c));
          crossed = harness.api.circuitState().crossCount > 0;
        }
      }
      if (crossed) break;
    }
    if (crossed) verifiedCollision = harness.api.circuitState();
  }
  assert.ok(verifiedCollision, 'generated Router Array boards expose a direct-cross trap');
  assert.equal(verifiedCollision.status, 'CIRCUITS CROSSED · SEPARATE CYAN + GREEN');
  assert.ok(Object.entries(verifiedCollision.powerByCell).some(([cell, power]) => Array.isArray(power) && power.length === 2), 'a normal conduit carries both systems at the fault');
});

test('Command Array generates programmable edge bolts and solves matching assignments', () => {
  loadLevels().worlds[4].levels.forEach(level => {
    for (let run = 0; run < 20; run += 1) {
      const harness = createHarness();
      const results = [];
      let started;
      try {
        started = harness.api.start({ ...level, stageId: 'gridlock-stage', onSuccessReady(result) { results.push(result); } });
      } catch (error) {
        throw new Error(`${level.id} run ${run}: ${error.message}`);
      }
      assert.equal(started, true);
      const layout = harness.api.layoutFor(level);
      const programmable = layout.sinks.filter(sink => sink.programmable);
      assert.ok(programmable.length >= 1, `${level.id} run ${run}`);
      assert.ok(programmable.every(sink => ['n', 'e', 'w'].includes(sink.side)));
      harness.api.begin();
      const networkColors = harness.api.circuitState().networkColors;
      networkColors.forEach((color, systemIndex) => {
        assert.equal(harness.nodes.get(`gridlock-source-${systemIndex}`).classList.contains(`is-${color}`), true);
      });
      programmable.forEach(sink => {
        harness.api.toggleBolt(sink.bolt);
        if (networkColors[sink.system] === 'green') harness.api.toggleBolt(sink.bolt);
      });
      const solved = level.modifiers.slidingPieces.enabled ? solveSliding(harness, level) : (solve(harness, level), harness.api.snapshot());
      assert.ok(solved.every(tile => tile.r === tile.homeR && tile.c === tile.homeC), `${level.id} run ${run}`);
      harness.api.snapshot().filter(tile => tile.type === 'router').forEach(router => {
        const routerPower = harness.api.circuitState().powerByCell[`${router.r},${router.c}`];
        assert.equal(routerPower.vertical.length, 1);
        assert.equal(routerPower.horizontal.length, 1);
        assert.deepEqual([routerPower.vertical[0], routerPower.horizontal[0]].sort(), [0, 1]);
      });
      assert.equal([...harness.api.circuitState().boltAssignments].join(','), layout.sinks.map(sink => networkColors[sink.system] === 'green' ? 1 : 0).join(','));
      assert.equal(harness.api.circuitState().status, 'GRID LOCK SEALED');
      assert.equal(results.length, 1, `${level.id} run ${run}`);
    }
  });
});

test('a switched bolt only comes online when its selected color matches the routed power', () => {
  const level = loadLevels().get('command-01');
  const harness = createHarness();
  const layout = harness.api.layoutFor(level);
  const programmable = layout.sinks.find(sink => sink.programmable);
  assert.equal(harness.api.start({ ...level, stageId: 'gridlock-stage' }), true);
  harness.api.begin();
  const expectedChoice = harness.api.circuitState().networkColors[programmable.system] === 'green' ? 1 : 0;
  harness.api.toggleBolt(programmable.bolt);
  if (expectedChoice === 0) harness.api.toggleBolt(programmable.bolt);
  solve(harness, level);
  assert.notEqual(harness.api.circuitState().boltAssignments[programmable.bolt], expectedChoice);
  assert.equal(harness.nodes.get(`gridlock-bolt-${programmable.bolt}`).classList.contains('is-lit'), false);
  assert.notEqual(harness.api.circuitState().status, 'GRID LOCK SEALED');
  harness.api.toggleBolt(programmable.bolt);
  assert.equal(harness.api.circuitState().boltAssignments[programmable.bolt], expectedChoice);
  assert.equal(harness.nodes.get(`gridlock-bolt-${programmable.bolt}`).classList.contains('is-lit'), true);
});

test('live power never assigns a neutral bolt switch and clicks cycle without returning to neutral', () => {
  const level = loadLevels().get('command-01');
  const harness = createHarness();
  const layout = harness.api.layoutFor(level);
  assert.equal(harness.api.start({ ...level, stageId: 'gridlock-stage' }), true);
  solve(harness, level);
  assert.equal(harness.api.circuitState().boltAssignments.every(assignment => assignment === null), true);
  layout.sinks.forEach(sink => assert.equal(harness.nodes.get(`gridlock-bolt-${sink.bolt}`).classList.contains('is-lit'), false));

  const bolt = layout.sinks[0].bolt;
  assert.equal(harness.api.toggleBolt(bolt), true);
  assert.equal(harness.api.circuitState().boltAssignments[bolt], 0);
  assert.equal(harness.api.toggleBolt(bolt), true);
  assert.equal(harness.api.circuitState().boltAssignments[bolt], 1);
  assert.equal(harness.api.toggleBolt(bolt), true);
  assert.equal(harness.api.circuitState().boltAssignments[bolt], 0);
});

test('Command Array can assign either color to either physical side across generated runs', () => {
  const level = loadLevels().get('command-03');
  const observed = new Set();
  for (let run = 0; run < 40; run += 1) {
    const harness = createHarness();
    assert.equal(harness.api.start({ ...level, stageId: 'gridlock-stage' }), true);
    harness.api.begin();
    observed.add(harness.api.circuitState().networkColors.join(','));
  }
  assert.deepEqual([...observed].sort(), ['cyan,green', 'green,cyan']);
});
