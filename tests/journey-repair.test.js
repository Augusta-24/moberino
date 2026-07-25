const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const engineSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'journey-packing-engine.js'), 'utf8');
const repairSource = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'journey-repair.js'), 'utf8');
const controller = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'journey.js'), 'utf8');
const arcade = fs.readFileSync(path.join(__dirname, '..', 'arcade.html'), 'utf8');

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
  // Both modules read/write bare identifiers like `JourneyPackingEngine` and
  // `window.X`, exactly as they would as sibling <script> tags in a real page —
  // that only resolves correctly if `window` IS the vm context's global object
  // (self-referential, matching window === globalThis in a real browser), not a
  // `window` property nested inside a separate wrapper context object.
  const nodes = new Map();
  const stage = svgNode({
    tagName: 'svg',
    viewBox: { baseVal: { width: VIEWBOX_WIDTH, height: 760 } },
    getBoundingClientRect() { return { left: 0, top: 0, width: VIEWBOX_WIDTH, height: 760 }; }
  });
  nodes.set('journey-repair-stage', stage);
  nodes.set('journey-repair-region', svgNode());
  nodes.set('journey-repair-tray', svgNode());
  const document = {
    getElementById(id) { return nodes.get(id) || null; },
    createElementNS() { return svgNode(); }
  };
  const windowCtx = {
    document, performance: { now() { return 0; } }, Math, Object, Set, Array,
    setTimeout(cb) { cb(); return 1; }, clearTimeout() {}
  };
  windowCtx.window = windowCtx;
  vm.createContext(windowCtx);
  vm.runInContext(engineSource, windowCtx);
  vm.runInContext(repairSource, windowCtx);
  return { api: windowCtx.JourneyRepair, engine: windowCtx.JourneyPackingEngine, nodes, stage };
}

test('Repair mission is isolated from persistence and other mission modules', () => {
  assert.doesNotMatch(repairSource, /JourneyState/);
  assert.doesNotMatch(repairSource, /localStorage/);
  assert.doesNotMatch(repairSource, /JourneyCombat|JourneyCache\b/);
});

test('solving the hosted puzzle reports a standard success result exactly once', () => {
  const h = createHarness();
  const results = [];
  const ok = h.api.start({
    stageId: 'journey-repair-stage', regionGroupId: 'journey-repair-region', trayGroupId: 'journey-repair-tray',
    cellSize: 36, regionOrigin: { x: 76, y: 150 }, trayOrigin: { x: 70, y: 546 }, trayCols: 4,
    maxHull: 100, initiallyPaused: true,
    onSuccessReady(result) { results.push(result); }
  });
  assert.equal(ok, true);
  assert.equal(h.api.begin(), true);

  const puzzle = h.engine.getPuzzle();
  const trayPieces = h.engine.getTrayPieces();
  puzzle.solution.forEach((target, i) => {
    const piece = trayPieces[i];
    const numOrients = h.engine.orientations(h.engine.PIECE_LIBRARY[piece.pieceIndex].cells).length;
    const taps = (target.orientIdx - piece.orientIdx + numOrients) % numOrients;
    for (let t = 0; t < taps; t++) {
      piece.g.emit('pointerdown', { clientX: 0, clientY: 0 });
      h.stage.emit('pointerup', { clientX: 0, clientY: 0 });
    }
    const targetR = Math.min(...target.cells.map(c => c[0]));
    const targetC = Math.min(...target.cells.map(c => c[1]));
    const dropX = 76 + targetC * 36 + 18;
    const dropY = 150 + targetR * 36 + 18;
    piece.g.emit('pointerdown', { clientX: dropX, clientY: dropY });
    h.stage.emit('pointermove', { clientX: dropX, clientY: dropY });
    h.stage.emit('pointerup', { clientX: dropX, clientY: dropY });
  });

  assert.equal(results.length, 1);
  assert.equal(results[0].outcome, 'success');
  assert.equal(results[0].hullRemaining, 100);
  assert.equal(results[0].damageTaken, 0);
  assert.equal(results[0].objectiveComplete, true);
  assert.equal(h.stage.classList.contains('is-welded'), true);
});

test('Journey wires Repair Moon into the packing engine and applies a free (labor-cost) repair once', () => {
  assert.match(arcade, /journey-packing-engine\.js/);
  assert.match(arcade, /journey-repair\.js/);
  assert.match(controller, /function renderRepairMoon/);
  assert.match(controller, /function renderRepairPuzzle/);
  assert.match(controller, /function renderRepairWorkshop/);
  assert.match(controller, /JourneyRepair\.start/);
  assert.match(controller, /window\.journeyBeginRepairPuzzle/);
  assert.match(controller, /JourneyState\.repairHull\(result\.hullRemaining, 0\)/);
});
