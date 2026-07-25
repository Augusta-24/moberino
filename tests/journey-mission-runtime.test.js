const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'games', 'journey-mission-runtime.js'),
  'utf8'
);

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, handler) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(handler);
    },
    removeEventListener(type, handler) {
      if (listeners.has(type)) listeners.get(type).delete(handler);
    },
    emit(type, event = {}) {
      const payload = Object.assign({
        type,
        clientX: 210,
        clientY: 600,
        pointerId: 1,
        preventDefault() {}
      }, event);
      if (listeners.has(type)) {
        listeners.get(type).forEach(handler => handler(payload));
      }
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
  const context = {
    setTransform() {},
    setLineDash() {},
    fillRect() {},
    beginPath() {},
    arc() {},
    ellipse() {},
    fill() {},
    stroke() {},
    save() {},
    restore() {},
    translate() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    rotate() {},
    fillText() {},
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
    getContext() {
      return context;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: 420, height: 700 };
    }
  });
  const document = Object.assign(documentEvents, {
    body: { classList: { contains: () => true } },
    getElementById(id) {
      return id === 'journey-mission-canvas' ? canvas : null;
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
    Number,
    Object,
    Array,
    String,
    Error
  });
  return {
    api: window.JourneyMissionRuntime,
    canvas,
    document,
    cancelledFrames
  };
}

function runtimeConfig(overrides = {}) {
  return Object.assign({
    canvasId: 'journey-mission-canvas',
    startX: 210,
    startY: 600,
    playerSpeed: 250,
    scanRange: 300,
    tractorRange: 130,
    interactionRange: 92,
    targets: []
  }, overrides);
}

test('mission runtime owns no persistence and exposes reusable verbs', () => {
  assert.doesNotMatch(source, /localStorage/);
  assert.doesNotMatch(source, /JourneyState/);
  assert.match(source, /JourneyMissionRuntime/);
  assert.match(source, /setControl/);
  assert.match(source, /activateTractor/);
  assert.match(source, /interact/);
  assert.match(source, /onScanLock/);
});

test('runtime supports two-axis movement and forward world scrolling', () => {
  const { api } = createHarness();
  api.start(runtimeConfig({
    forwardScroll: true,
    worldSpeed: 100,
    targets: [{ id: 'marker', x: 210, y: 100, scannable: false }]
  }));

  api.setControl('right', true);
  api.setControl('up', true);
  api.step(.1);
  const snapshot = api.getSnapshot();

  assert.ok(snapshot.player.x > 210);
  assert.ok(snapshot.player.y < 600);
  assert.ok(snapshot.targets[0].y > 100);
  assert.equal(snapshot.scrollDistance, 10);
  api.destroy();
});

test('paused mission previews render safely without accepting input or advancing hazards', () => {
  const { api } = createHarness();
  api.start(runtimeConfig({
    initiallyPaused: true,
    forwardScroll: true,
    worldSpeed: 100,
    targets: [{ id: 'preview-rock', x: 210, y: 100, scannable: false }]
  }));

  assert.equal(api.getSnapshot().paused, true);
  assert.equal(api.setControl('right', true), false);
  assert.equal(api.pulseScan().code, 'paused');
  api.step(.1);
  assert.equal(api.getSnapshot().scrollDistance, 0);
  assert.equal(api.getSnapshot().targets[0].y, 100);

  assert.equal(api.setPaused(false), true);
  api.setControl('right', true);
  api.step(.1);
  assert.equal(api.getSnapshot().paused, false);
  assert.ok(api.getSnapshot().player.x > 210);
  assert.equal(api.getSnapshot().scrollDistance, 10);
  api.destroy();
});

test('scanner reports strength and locks a nearby hidden signal', () => {
  const { api } = createHarness();
  const locks = [];
  const cues = [];
  api.start(runtimeConfig({
    targets: [{
      id: 'pip-signal',
      type: 'signal',
      x: 210,
      y: 520,
      scanSeconds: .1,
      hiddenUntilScanned: true
    }],
    onScanLock(target) {
      locks.push(target.id);
    },
    onCue(name) {
      cues.push(name);
    }
  }));

  api.setControl('scan', true);
  api.step(.1);
  const snapshot = api.getSnapshot();

  assert.equal(snapshot.scanTargetId, 'pip-signal');
  assert.ok(snapshot.scanStrength > 0);
  assert.equal(snapshot.targets[0].scanned, true);
  assert.deepEqual(locks, ['pip-signal']);
  assert.ok(cues.includes('scan-lock'));
  api.destroy();
});

test('pulse scanning reveals a local signal and proximity captures it without holding a button', () => {
  const { api } = createHarness();
  const reveals = [];
  const losses = [];
  const locks = [];
  api.start(runtimeConfig({
    scanMode: 'pulse',
    scanPulseRadius: 100,
    scanPulseCooldown: .1,
    targets: [{
      id: 'moving-source',
      type: 'signal',
      x: 210,
      y: 520,
      scanSeconds: .3,
      captureRadius: 100,
      scanDecayRate: 1,
      scanLostSeconds: .2,
      revealed: false,
      hiddenUntilScanned: true
    }],
    onScanReveal(target) {
      reveals.push(target.id);
    },
    onScanLock(target) {
      locks.push(target.id);
    },
    onScanLost(target) {
      losses.push(target.id);
    }
  }));

  assert.equal(api.getSnapshot().targets[0].revealed, false);
  assert.equal(api.pulseScan().code, 'revealed');
  assert.equal(api.getSnapshot().targets[0].revealed, true);
  assert.deepEqual(reveals, ['moving-source']);

  api.step(.1);
  const partial = api.getSnapshot().targets[0].scanProgress;
  assert.ok(partial > 0);

  api.updateTarget('moving-source', { y: 200 });
  api.step(.1);
  api.step(.1);
  assert.equal(api.getSnapshot().targets[0].revealed, false);
  assert.deepEqual(losses, ['moving-source']);

  api.updateTarget('moving-source', { y: 520 });
  assert.equal(api.pulseScan().code, 'revealed');
  api.step(.1);
  api.step(.1);
  api.step(.1);
  assert.equal(api.getSnapshot().targets[0].scanned, true);
  assert.deepEqual(locks, ['moving-source']);
  api.destroy();
});

test('a stationary playfield tap scans while a drag steers without scanning', () => {
  const tapHarness = createHarness();
  tapHarness.api.start(runtimeConfig({
    tapToScan: true,
    scanMode: 'pulse',
    scanPulseRadius: 100,
    targets: [{
      id: 'tap-signal',
      type: 'signal',
      x: 210,
      y: 520,
      hiddenUntilScanned: true,
      revealed: false
    }]
  }));

  tapHarness.canvas.emit('pointerdown');
  tapHarness.canvas.emit('pointerup');
  assert.equal(tapHarness.api.getSnapshot().targets[0].revealed, true);
  tapHarness.api.destroy();

  const dragHarness = createHarness();
  dragHarness.api.start(runtimeConfig({
    tapToScan: true,
    scanMode: 'pulse',
    scanPulseRadius: 100,
    targets: [{
      id: 'drag-signal',
      type: 'signal',
      x: 210,
      y: 520,
      hiddenUntilScanned: true,
      revealed: false
    }]
  }));

  dragHarness.canvas.emit('pointerdown', { clientX: 210, clientY: 600 });
  dragHarness.canvas.emit('pointermove', { clientX: 300, clientY: 500 });
  dragHarness.canvas.emit('pointerup', { clientX: 300, clientY: 500 });
  const dragged = dragHarness.api.getSnapshot();
  assert.equal(dragged.targets[0].revealed, false);
  assert.equal(dragged.player.x, 300);
  assert.equal(dragged.player.y, 500);
  dragHarness.api.destroy();
});

test('missions can explicitly disable all firing input', () => {
  const { api } = createHarness();
  api.start(runtimeConfig({ allowFire: false }));

  assert.equal(api.setControl('fire', true), false);
  assert.equal(api.fireProjectile().code, 'disabled');
  assert.equal(api.getSnapshot().shotsFired, 0);
  api.destroy();
});

test('tractor attaches, tows, and releases a nearby target', () => {
  const { api } = createHarness();
  api.start(runtimeConfig({
    targets: [{
      id: 'escape-pod',
      type: 'pod',
      x: 210,
      y: 650,
      tractorable: true,
      scannable: false
    }]
  }));

  assert.equal(api.activateTractor().code, 'attached');
  api.setControl('right', true);
  api.step(.1);
  const towing = api.getSnapshot();

  assert.equal(towing.attachedTargetId, 'escape-pod');
  assert.equal(towing.targets[0].attached, true);
  assert.ok(towing.targets[0].x > 210);
  assert.equal(api.activateTractor().code, 'released');
  assert.equal(api.getSnapshot().attachedTargetId, null);
  api.destroy();
});

test('interaction targets complete once within proximity', () => {
  const { api } = createHarness();
  const interactions = [];
  api.start(runtimeConfig({
    targets: [{
      id: 'power-coupler',
      x: 210,
      y: 545,
      scannable: false,
      interactable: true
    }],
    onInteract(target) {
      interactions.push(target.id);
    }
  }));

  assert.equal(api.interact().code, 'interacted');
  assert.equal(api.interact().code, 'no-interaction-target');
  assert.deepEqual(interactions, ['power-coupler']);
  api.destroy();
});

test('projectiles destroy configured debris and collisions damage the ship', () => {
  const { api } = createHarness();
  const destroyed = [];
  const damage = [];
  api.start(runtimeConfig({
    startingHull: 100,
    targets: [
      {
        id: 'blocking-rock',
        type: 'debris',
        x: 210,
        y: 525,
        r: 20,
        scannable: false,
        destructible: true,
        hp: 1
      },
      {
        id: 'impact-rock',
        type: 'debris',
        x: 210,
        y: 600,
        r: 18,
        scannable: false,
        collisionDamage: 14
      }
    ],
    onTargetDestroyed(target) {
      destroyed.push(target.id);
    },
    onPlayerDamage(event) {
      damage.push(event.damage);
    }
  }));

  api.fireProjectile();
  api.step(.1);

  assert.deepEqual(destroyed, ['blocking-rock']);
  assert.deepEqual(damage, [14]);
  assert.equal(api.getSnapshot().hull, 86);
  assert.equal(api.getSnapshot().targetsDestroyed, 1);
  api.destroy();
});

test('runtime lifecycle removes controls and animation frames cleanly', () => {
  const { api, canvas, document, cancelledFrames } = createHarness();
  api.start(runtimeConfig());

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
