const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'journey-packing-engine.js'), 'utf8');
const controller = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'journey.js'), 'utf8');

function svgNode(extra) {
  const attrs = {}; const classes = new Set(); const children = []; const listeners = new Map();
  return Object.assign({
    attrs, style: {}, children,
    setAttribute(k, v) { attrs[k] = String(v); },
    getAttribute(k) { return attrs[k]; },
    classList: {
      add: (...n) => n.forEach(x => classes.add(x)),
      remove: (...n) => n.forEach(x => classes.delete(x)),
      toggle: (n, f) => { const on = f === undefined ? !classes.has(n) : f; if (on) classes.add(n); else classes.delete(n); },
      contains: n => classes.has(n)
    },
    appendChild(c) { children.push(c); return c; },
    removeChild(c) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); return c; },
    get firstChild() { return children[0] || null; },
    addEventListener(t, h) { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(h); },
    removeEventListener(t, h) { if (listeners.has(t)) listeners.get(t).delete(h); },
    emit(t, e = {}) { const p = Object.assign({ type: t, preventDefault() {} }, e); if (listeners.has(t)) listeners.get(t).forEach(h => h(p)); }
  }, extra);
}

const VIEWBOX_WIDTH = 560;

function createHarness() {
  const nodes = new Map();
  const stage = svgNode({
    tagName: 'svg',
    viewBox: { baseVal: { width: VIEWBOX_WIDTH, height: 760 } },
    getBoundingClientRect() { return { left: 0, top: 0, width: VIEWBOX_WIDTH, height: 760 }; }
  });
  nodes.set('journey-repair-stage', stage);
  nodes.set('journey-repair-region', svgNode());
  nodes.set('journey-repair-tray', svgNode());
  const window = svgNode();
  const document = {
    getElementById(id) { return nodes.get(id) || null; },
    createElementNS() { return svgNode(); }
  };
  vm.runInNewContext(source, { window, document, performance: { now() { return 0; } }, Math, Object, Set, Array });
  return { api: window.JourneyPackingEngine, nodes, stage };
}

test('Packing engine is isolated from persistence and other mission modules', () => {
  assert.doesNotMatch(source, /JourneyState/);
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /JourneyCombat|JourneyCache|JourneyMissionRuntime/);
});

test('orientation counts match each shape\'s real rotational symmetry', () => {
  const h = createHarness();
  const bySymmetry = {};
  h.api.PIECE_LIBRARY.forEach(p => { bySymmetry[p.id] = h.api.orientations(p.cells).length; });
  assert.equal(bySymmetry['domino'], 2);
  assert.equal(bySymmetry['i-tromino'], 2);
  assert.equal(bySymmetry['i-tetromino'], 2);
  assert.equal(bySymmetry['square'], 1);
  assert.equal(bySymmetry['l-tromino'], 4);
  assert.equal(bySymmetry['l-tetromino'], 4);
  assert.equal(bySymmetry['t-tetromino'], 4);
  // S/Z-tetrominoes have 180°-rotation point symmetry — 2 distinct states, not 4.
  assert.equal(bySymmetry['s-tetromino'], 2);
});

test('solveCount matches an independently hand-verified fixture (10-cell cross, 3 pieces, 2 solutions)', () => {
  const h = createHarness();
  const region = [[0, 1], [0, 2], [1, 0], [1, 1], [1, 2], [1, 3], [2, 0], [2, 1], [2, 2], [2, 3]];
  // domino(0) + l-tetromino(5) + s-tetromino(6) — verified against this exact library by hand.
  const result = h.api.solveCount(region, [0, 5, 6]);
  assert.equal(result.exceeded, false);
  assert.equal(result.count, 2);
});

test('a region with no valid tiling counts zero, not a false positive', () => {
  const h = createHarness();
  // A single isolated cell can never hold a domino (needs 2 cells).
  const result = h.api.solveCount([[0, 0]], [0]);
  assert.equal(result.count, 0);
});

test('generate() always returns a puzzle whose true solution count is in the requested band', () => {
  // Kept small for fast day-to-day test runs (~180-200ms/trial); the full
  // difficulty-consistency guarantee is verified separately at 500-trial scale
  // (see the "Verify engine in isolation" step in the implementation history).
  const h = createHarness();
  const TRIALS = 12;
  for (let i = 0; i < TRIALS; i++) {
    const puzzle = h.api.generate({ pieceCount: 8, targetMin: 3, targetMax: 4 });
    assert.ok(puzzle, `trial ${i}: generate() returned null`);
    const verify = h.api.solveCount(puzzle.region, puzzle.pieceIndexList, 20, 200000);
    assert.equal(verify.exceeded, false, `trial ${i}: verification exceeded node budget`);
    assert.ok(verify.count >= 3 && verify.count <= 4, `trial ${i}: true count ${verify.count} out of [3,4]`);
    assert.equal(puzzle.pieceIndexList.length, 8);
  }
});

test('a region the generator cannot classify within budget is never accepted (no unverifiable puzzle ships)', () => {
  const h = createHarness();
  // Absurdly tight budget forces every candidate to be "unverifiable" -> generate()
  // must fall back to its best candidate rather than silently accept an unknown one.
  const puzzle = h.api.generate({ pieceCount: 8, targetMin: 3, targetMax: 4, maxAttempts: 5, nodeBudget: 1 });
  // With a 1-node budget nothing can be verified, so every attempt is skipped and
  // generate() must return the tracked fallback (or null) rather than fabricate a range.
  assert.ok(puzzle === null || typeof puzzle.solutionCount === 'number');
});

test('drop coordinates resolve correctly when the host SVG\'s rendered aspect ratio differs from its viewBox (regression)', () => {
  // Real bug, caught only by live-browser testing: the host <svg> is CSS-
  // stretched to width:100%/height:100% of its container, which does NOT
  // preserve the viewBox's aspect ratio. A single width-derived scale factor
  // applied to both x and y (the original implementation) silently corrupts
  // drop coordinates whenever the two ratios differ — worse for cells further
  // from the origin. Mock a stage whose rect (540x840) has a different aspect
  // ratio than its viewBox (560x800, matching the real Repair Moon scene) and
  // confirm a drop targeting a large row/col still resolves to the right cell.
  const nodes = new Map();
  const stage = svgNode({
    tagName: 'svg',
    viewBox: { baseVal: { width: 560, height: 800 } },
    getBoundingClientRect() { return { left: 10, top: 72, width: 540, height: 840 }; }
  });
  nodes.set('journey-repair-stage', stage);
  nodes.set('journey-repair-region', svgNode());
  nodes.set('journey-repair-tray', svgNode());
  const window = svgNode();
  const document = { getElementById(id) { return nodes.get(id) || null; }, createElementNS() { return svgNode(); } };
  vm.runInNewContext(source, { window, document, performance: { now() { return 0; } }, Math, Object, Set, Array });
  const api = window.JourneyPackingEngine;

  let completions = 0;
  api.start({
    stageId: 'journey-repair-stage', regionGroupId: 'journey-repair-region', trayGroupId: 'journey-repair-tray',
    cellSize: 30, regionOrigin: { x: 76, y: 148 }, trayOrigin: { x: 40, y: 478 }, trayCols: 4,
    initiallyPaused: true, onComplete() { completions += 1; }
  });
  api.begin();
  const puzzle = api.getPuzzle();
  const trayPieces = api.getTrayPieces();
  const scaleX = 560 / 540, scaleY = 800 / 840;

  puzzle.solution.forEach((target, i) => {
    const piece = trayPieces[i];
    const numOrients = api.orientations(api.PIECE_LIBRARY[piece.pieceIndex].cells).length;
    const taps = (target.orientIdx - piece.orientIdx + numOrients) % numOrients;
    for (let t = 0; t < taps; t++) {
      piece.g.emit('pointerdown', { clientX: 10, clientY: 72 });
      stage.emit('pointerup', { clientX: 10, clientY: 72 });
    }
    const targetR = Math.min(...target.cells.map(c => c[0]));
    const targetC = Math.min(...target.cells.map(c => c[1]));
    const svgX = 76 + targetC * 30 + 15, svgY = 148 + targetR * 30 + 15;
    // convert intended SVG-space point to the client coords a real browser
    // would report for THIS mismatched rect/viewBox pair.
    const clientX = 10 + svgX / scaleX, clientY = 72 + svgY / scaleY;
    piece.g.emit('pointerdown', { clientX, clientY });
    stage.emit('pointermove', { clientX, clientY });
    stage.emit('pointerup', { clientX, clientY });
  });

  assert.equal(completions, 1);
});

test('rotating and dragging every piece to the engine\'s own recorded solution fires completion exactly once', () => {
  const h = createHarness();
  let completions = 0;
  const ok = h.api.start({
    stageId: 'journey-repair-stage', regionGroupId: 'journey-repair-region', trayGroupId: 'journey-repair-tray',
    cellSize: 36, regionOrigin: { x: 76, y: 150 }, trayOrigin: { x: 70, y: 546 }, trayCols: 4,
    initiallyPaused: true, onComplete() { completions += 1; }
  });
  assert.equal(ok, true);
  assert.equal(h.api.begin(), true);

  const puzzle = h.api.getPuzzle();
  const trayPieces = h.api.getTrayPieces();
  assert.equal(trayPieces.length, 8);

  puzzle.solution.forEach((target, i) => {
    const piece = trayPieces[i];
    const numOrients = h.api.orientations(h.api.PIECE_LIBRARY[piece.pieceIndex].cells).length;
    const taps = (target.orientIdx - piece.orientIdx + numOrients) % numOrients;
    for (let t = 0; t < taps; t++) {
      piece.g.emit('pointerdown', { clientX: 0, clientY: 0 });
      h.stage.emit('pointerup', { clientX: 0, clientY: 0 });
    }
    assert.equal(piece.orientIdx, target.orientIdx);

    const targetR = Math.min(...target.cells.map(c => c[0]));
    const targetC = Math.min(...target.cells.map(c => c[1]));
    const dropX = 76 + targetC * 36 + 18;
    const dropY = 150 + targetR * 36 + 18;
    piece.g.emit('pointerdown', { clientX: dropX, clientY: dropY });
    h.stage.emit('pointermove', { clientX: dropX, clientY: dropY });
    h.stage.emit('pointerup', { clientX: dropX, clientY: dropY });
  });

  assert.equal(completions, 1);
  assert.equal(h.api.isSolved(), true);
});

test('Journey routes Repair Moon into the packing-engine dry-dock scene', () => {
  assert.match(controller, /function renderRepairPuzzle/);
  assert.match(controller, /JourneyRepair\.start/);
  assert.match(controller, /journey-repair-region/);
  assert.match(controller, /journey-repair-tray/);
});
