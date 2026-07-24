const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'games', 'journey-combat.js'),
  'utf8'
);

function eventTarget() {
  const listeners = new Map();
  return {
    listeners,
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      if (listeners.has(type)) listeners.get(type).delete(handler);
    },
    count(type) {
      return listeners.has(type) ? listeners.get(type).size : 0;
    }
  };
}

function createHarness() {
  const canvasEvents = eventTarget();
  const documentEvents = eventTarget();
  const cancelledFrames = [];
  let nextFrameId = 0;
  const gradient = { addColorStop() {} };
  const context = {
    setTransform() {},
    fillRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    createLinearGradient() { return gradient; },
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    stroke() {},
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    shadowColor: '',
    shadowBlur: 0
  };
  const canvas = Object.assign(canvasEvents, {
    width: 0,
    height: 0,
    getContext() { return context; },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 420, height: 700 };
    }
  });
  const hud = { textContent: '' };
  const document = Object.assign(documentEvents, {
    body: { classList: { contains: () => true } },
    getElementById(id) {
      return id === 'journey-combat-canvas' ? canvas : hud;
    }
  });
  const window = { devicePixelRatio: 1 };
  vm.runInNewContext(source, {
    window,
    document,
    performance: { now: () => 1000 },
    requestAnimationFrame() {
      nextFrameId += 1;
      return nextFrameId;
    },
    cancelAnimationFrame(id) {
      cancelledFrames.push(id);
    },
    Math,
    Error
  });
  return { api: window.JourneyCombat, canvas, document, cancelledFrames };
}

function encounterConfig() {
  return {
    canvasId: 'journey-combat-canvas',
    attemptId: 'attempt-1',
    encounterId: 'asteroid-salvage-1',
    difficulty: 1,
    startingHull: 100,
    shipStats: { blasterLevel: 0 },
    objectives: { surviveSeconds: 30, salvageTarget: 5 },
    onComplete() {}
  };
}

test('combat start and destroy attach and remove one listener set', () => {
  const { api, canvas, document, cancelledFrames } = createHarness();
  api.start(encounterConfig());

  assert.equal(api.isActive(), true);
  assert.equal(canvas.count('pointerdown'), 1);
  assert.equal(canvas.count('pointermove'), 1);
  assert.equal(document.count('keydown'), 1);
  assert.equal(document.count('keyup'), 1);

  api.destroy();

  assert.equal(api.isActive(), false);
  assert.equal(canvas.count('pointerdown'), 0);
  assert.equal(canvas.count('pointermove'), 0);
  assert.equal(document.count('keydown'), 0);
  assert.equal(document.count('keyup'), 0);
  assert.equal(cancelledFrames.length, 1);
});

test('starting combat repeatedly does not duplicate runtime listeners', () => {
  const { api, canvas, document } = createHarness();
  api.start(encounterConfig());
  api.start(encounterConfig());

  assert.equal(canvas.count('pointerdown'), 1);
  assert.equal(canvas.count('pointermove'), 1);
  assert.equal(document.count('keydown'), 1);
  assert.equal(document.count('keyup'), 1);
  api.destroy();
});

test('combat includes weapon audio, hull-hit feedback, and denser hazard pacing', () => {
  assert.match(source, /playCombatSfx\('blaster'\)/);
  assert.match(source, /playJourneyRockImpact\(\)/);
  assert.match(source, /playJourneyRockBreak\(\)/);
  assert.match(source, /playJourneyRockPlayerHit\(\)/);
  assert.match(source, /journey-combat-damage-alert/);
  assert.match(source, /damageFlashUntil/);
  assert.match(source, /config\.difficulty \* \.14/);
  assert.match(source, /radius > 25 \? 3/);
});
