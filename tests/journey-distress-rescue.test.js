const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'games', 'journey-distress-rescue.js'),
  'utf8'
);
const controller = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'games', 'journey.js'),
  'utf8'
);
const arcade = fs.readFileSync(
  path.join(__dirname, '..', 'arcade.html'),
  'utf8'
);

function eventTarget(rect = { left: 0, top: 0, width: 20, height: 20 }) {
  const listeners = new Map();
  const classes = new Set();
  return {
    textContent: '',
    attributes: {},
    style: {},
    offsetWidth: rect.width,
    classList: {
      add(...names) {
        names.forEach(name => classes.add(name));
      },
      remove(...names) {
        names.forEach(name => classes.delete(name));
      },
      toggle(name, force) {
        if (force) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      }
    },
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
        clientX: 0,
        clientY: 0,
        preventDefault() {}
      }, event);
      if (listeners.has(type)) listeners.get(type).forEach(handler => handler(payload));
    },
    getBoundingClientRect() {
      return rect;
    },
    setAttribute(name, value) {
      this.attributes[name] = value;
    }
  };
}

function createHarness() {
  let now = 0;
  let nextFrame = null;
  const nodes = new Map();
  const register = (id, rect) => {
    const node = eventTarget(rect);
    nodes.set(id, node);
    return node;
  };
  const stage = register('journey-rescue-stage', { left: 0, top: 0, width: 420, height: 700 });
  const pod = register('journey-rescue-pod', { left: 150, top: 130, width: 120, height: 120 });
  register('journey-rescue-objective');
  register('journey-rescue-tether-blue', { left: 103, top: 583, width: 34, height: 34 });
  register('journey-rescue-tether-gold', { left: 283, top: 583, width: 34, height: 34 });
  register('journey-rescue-dock-source', { left: 187, top: 517, width: 46, height: 46 });
  register('journey-rescue-port-blue', { left: 138, top: 188, width: 24, height: 24 });
  register('journey-rescue-port-gold', { left: 258, top: 188, width: 24, height: 24 });
  register('journey-rescue-hatch', { left: 176, top: 169, width: 68, height: 62 });
  register('journey-rescue-line-blue');
  register('journey-rescue-line-gold');
  register('journey-rescue-line-dock');
  register('journey-rescue-dock-fill');

  const window = eventTarget();
  window.setTimeout = callback => {
    callback();
    return 1;
  };
  const document = {
    getElementById(id) {
      return nodes.get(id) || null;
    }
  };
  vm.runInNewContext(source, {
    window,
    document,
    performance: {
      now() {
        return now;
      }
    },
    requestAnimationFrame(callback) {
      nextFrame = callback;
      return 1;
    },
    cancelAnimationFrame() {},
    Math,
    Object,
    Set
  });
  return {
    api: window.JourneyDistressRescue,
    window,
    nodes,
    stage,
    pod,
    advance(milliseconds) {
      now += milliseconds;
      const callback = nextFrame;
      nextFrame = null;
      if (callback) callback(now);
    }
  };
}

function fire(harness, sourceId) {
  harness.nodes.get(sourceId).emit('pointerdown');
  harness.advance(500);
}

test('Distress rescue is isolated from flight combat, scanning, and persistence', () => {
  assert.doesNotMatch(source, /JourneyCombat/);
  assert.doesNotMatch(source, /JourneyMissionRuntime/);
  assert.doesNotMatch(source, /JourneyState/);
  assert.doesNotMatch(source, /scan/i);
  assert.doesNotMatch(source, /fireProjectile/);
  assert.doesNotMatch(source, /localStorage/);
});

test('two timed grappling hits unlock a rapidly pumped, retracting docking collar', () => {
  const harness = createHarness();
  const results = [];
  assert.equal(harness.api.start({
    stageId: 'journey-rescue-stage',
    attemptId: 'rescue-attempt',
    encounterId: 'rescue-beacon-1',
    passengerId: 'pip',
    startingHull: 76,
    initiallyPaused: true,
    onSuccessReady(result) {
      results.push(result);
    }
  }), true);
  assert.equal(harness.api.begin(), true);

  fire(harness, 'journey-rescue-tether-blue');
  assert.equal(harness.pod.classList.contains('is-slowed'), true);
  assert.equal(results.length, 0);

  fire(harness, 'journey-rescue-tether-gold');
  assert.equal(harness.pod.classList.contains('is-stable'), true);
  assert.equal(harness.stage.classList.contains('is-stable'), true);
  assert.equal(results.length, 0);

  harness.nodes.get('journey-rescue-dock-source').emit('pointerdown');
  harness.advance(100);
  assert.equal(harness.nodes.get('journey-rescue-dock-fill').style.width, '10%');
  assert.equal(results.length, 0);

  for (let tap = 0; tap < 7; tap += 1) {
    harness.nodes.get('journey-rescue-dock-source').emit('pointerdown');
  }
  assert.equal(results.length, 1);
  assert.equal(results[0].outcome, 'success');
  assert.equal(results[0].rescuedPassengerId, 'pip');
  assert.equal(results[0].stats.podStabilized, true);
  assert.equal(results[0].stats.shotsFired, 2);
});

test('Journey routes Distress Signal into the dedicated rescue and confirms Pip aboard', () => {
  assert.match(arcade, /journey-distress-rescue\.js/);
  assert.match(controller, /function renderDistressRescue/);
  assert.match(controller, /node\.id === 'distress-signal'/);
  assert.match(controller, /JourneyDistressRescue\.start/);
  assert.match(controller, /JourneyDistressRescue\.begin/);
  assert.match(controller, /TIME TWO GRAPPLE SHOTS/);
  assert.match(controller, /PORT CROSSES THE SIGHTLINE/);
  assert.match(controller, /TAP RAPIDLY · KEEP THE COLLAR FROM RETRACTING/);
  assert.match(controller, /PIP IS SAFE/);
  assert.match(controller, /journeyConfirmDistressRescue/);
});
