const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'journey-cache.js'), 'utf8');
const controller = fs.readFileSync(path.join(__dirname, '..', 'js', 'games', 'journey.js'), 'utf8');
const arcade = fs.readFileSync(path.join(__dirname, '..', 'arcade.html'), 'utf8');

function svgNode() {
  const attrs = {}; const classes = new Set(); const children = []; const listeners = new Map();
  return {
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
  };
}

function createHarness() {
  const nodes = new Map();
  ['journey-cache-stage', 'journey-cache-grid', 'journey-cache-objective', 'journey-cache-needle', 'journey-cache-start',
   'journey-cache-bolt-0', 'journey-cache-bolt-1', 'journey-cache-bolt-2'].forEach(id => nodes.set(id, svgNode()));
  const window = svgNode();
  window.setTimeout = cb => { cb(); return 1; };
  window.clearTimeout = () => {};
  const document = { getElementById(id) { return nodes.get(id) || null; }, createElementNS() { return svgNode(); } };
  vm.runInNewContext(source, { window, document, performance: { now() { return 0; } }, Math, Object, Set, Array });
  return { api: window.JourneyCache, nodes };
}

function tileG(h, r, c) {
  const want = `translate(${115 + c * 66},${283 + r * 66})`;
  return h.nodes.get('journey-cache-grid').children.find(g => g.getAttribute('transform') === want);
}
function driveToSolved(h, leaveOneOut) {
  const snap = h.api.snapshot();
  const last = leaveOneOut ? snap[snap.length - 1] : null;
  snap.forEach(t => {
    if (last && t.r === last.r && t.c === last.c) return;
    const taps = (t.solvedRot - t.rot + 4) % 4;
    const g = tileG(h, t.r, t.c);
    for (let i = 0; i < taps; i++) g.emit('pointerdown');
  });
}
let leaveOneOut = false;

test('Seal puzzle is isolated from flight combat, scanning, and persistence', () => {
  assert.doesNotMatch(source, /JourneyCombat/);
  assert.doesNotMatch(source, /JourneyMissionRuntime/);
  assert.doesNotMatch(source, /JourneyState/);
  assert.doesNotMatch(source, /localStorage/);
});

test('start builds a 36-tile lattice', () => {
  const h = createHarness();
  assert.equal(h.api.start({ stageId: 'journey-cache-stage', encounterId: 'cache-recovery-1', startingHull: 80, onSuccessReady() {} }), true);
  assert.equal(h.nodes.get('journey-cache-grid').children.length, 36);
});

test('sealing every conduit floods the lattice, fires all bolts, and wins once', () => {
  const h = createHarness();
  const results = [];
  h.api.start({ stageId: 'journey-cache-stage', encounterId: 'cache-recovery-1', crystalId: 'azure-cache', startingHull: 80, onSuccessReady(r) { results.push(r); } });
  h.api.begin();
  leaveOneOut = false; driveToSolved(h, false);
  assert.equal(h.nodes.get('journey-cache-bolt-0').classList.contains('is-lit'), true);
  assert.equal(h.nodes.get('journey-cache-bolt-1').classList.contains('is-lit'), true);
  assert.equal(h.nodes.get('journey-cache-bolt-2').classList.contains('is-lit'), true);
  assert.equal(results.length, 1);
  assert.equal(results[0].outcome, 'success');
  assert.equal(results[0].crystalId, 'azure-cache');
  assert.equal(results[0].objectiveComplete, true);
});

test('one unsealed conduit leaves the lattice unsolved (a single loose end blocks the win)', () => {
  const h = createHarness();
  const results = [];
  h.api.start({ stageId: 'journey-cache-stage', encounterId: 'cache-recovery-1', startingHull: 80, onSuccessReady(r) { results.push(r); } });
  h.api.begin();
  driveToSolved(h, true);   // solve all but the last tile
  assert.equal(results.length, 0);
});

test('Journey routes Abandoned Cache into the Seal-the-Vault puzzle', () => {
  assert.match(arcade, /journey-cache\.js/);
  assert.match(controller, /function renderCache/);
  assert.match(controller, /journey-cache-grid/);
  assert.match(controller, /JourneyCache\.start/);
  assert.match(controller, /journeyBeginCache/);
  assert.match(controller, /renderCrystalReveal/);
  assert.match(controller, /awardCrystal\('azure-cache'\)/);
});
