const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'js', 'games', 'journey-state.js'),
  'utf8'
);

function createHarness(seed = {}) {
  const storage = new Map(Object.entries(seed));
  const events = [];
  const localStorage = {
    getItem(key) {
      return storage.has(key) ? storage.get(key) : null;
    },
    setItem(key, value) {
      storage.set(key, String(value));
    }
  };
  const window = {
    dispatchEvent(event) {
      events.push(event);
    }
  };
  class CustomEvent {
    constructor(type, options) {
      this.type = type;
      this.detail = options && options.detail;
    }
  }
  vm.runInNewContext(source, {
    window,
    localStorage,
    CustomEvent,
    console,
    Date,
    JSON,
    Math,
    Number,
    Object,
    Set
  });
  return { api: window.JourneyState, events, storage };
}

test('new Journey saves use an independent key and expected defaults', () => {
  const { api, storage } = createHarness();
  const state = api.createNew();

  assert.equal(api.gameId, 'journey');
  assert.equal(api.saveKey, 'moberinoJourneySave');
  assert.equal(state.currentNodeId, 'home-orbit');
  assert.equal(state.resources.hull, 100);
  assert.equal(state.resources.fuel, 40);
  assert.equal(storage.has('moberinoJourneySave'), true);
  assert.equal(storage.has('space-best-campaign'), false);
});

test('malformed saves recover safely and clamp persistent meters', () => {
  const malformed = JSON.stringify({
    version: -10,
    currentNodeId: 42,
    resources: {
      hull: 900,
      maxHull: 120,
      fuel: -50,
      maxFuel: 60,
      power: 'broken',
      maxPower: 80,
      pilot: 400
    },
    currency: null,
    route: { visitedNodes: ['home-orbit', 'home-orbit', null] }
  });
  const { api } = createHarness({ moberinoJourneySave: malformed });
  const state = api.load();

  assert.equal(state.version, 1);
  assert.equal(state.currentNodeId, 'home-orbit');
  assert.equal(state.resources.hull, 120);
  assert.equal(state.resources.fuel, 0);
  assert.equal(state.resources.power, 80);
  assert.equal(state.resources.pilot, 100);
  assert.equal(state.currency.salvage, 0);
  assert.deepEqual(Array.from(state.route.visitedNodes), ['home-orbit']);
});

test('offline progress restores only power and pilot readiness', () => {
  const twoHoursAgo = Date.now() - (2 * 60 * 60 * 1000);
  const save = JSON.stringify({
    version: 1,
    createdAt: twoHoursAgo,
    lastPlayedAt: twoHoursAgo,
    resources: {
      hull: 55,
      maxHull: 100,
      fuel: 12,
      maxFuel: 40,
      power: 20,
      maxPower: 100,
      pilot: 30
    }
  });
  const { api } = createHarness({ moberinoJourneySave: save });
  const state = api.load();

  assert.equal(state.resources.hull, 55);
  assert.equal(state.resources.fuel, 12);
  assert.ok(state.resources.power >= 43 && state.resources.power <= 45);
  assert.ok(state.resources.pilot >= 49 && state.resources.pilot <= 51);
  assert.equal(api.getReturnSummary().length, 2);
});

test('save writes are centralized and include their reason', () => {
  const { api, events } = createHarness();
  api.createNew();
  api.saveJourneyState('test-checkpoint');

  assert.equal(events.at(-1).type, 'journey-state-saved');
  assert.equal(events.at(-1).detail.reason, 'test-checkpoint');
});
