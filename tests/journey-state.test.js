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
  assert.equal(state.resources.fuel, 12);
  assert.equal(state.currency.crystals, 0);
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

  assert.equal(state.version, 3);
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

test('legacy timed repairs settle immediately on return', () => {
  const now = Date.now();
  const save = JSON.stringify({
    version: 2,
    lastPlayedAt: now - 5000,
    resources: { hull: 35, maxHull: 100 },
    timers: { repairCompleteAt: now + 45000 }
  });
  const { api } = createHarness({ moberinoJourneySave: save });
  const state = api.load();

  assert.equal(state.resources.hull, 100);
  assert.equal(state.timers.repairCompleteAt, null);
  assert.equal(api.getReturnSummary().includes('Hull repairs are complete.'), true);
});

test('version 1 saves stranded at Home after clearing the Belt return to the frontier', () => {
  const stranded = JSON.stringify({
    version: 1,
    currentNodeId: 'home-orbit',
    selectedDestinationId: 'fuel-stop-1',
    route: {
      visitedNodes: ['home-orbit', 'fuel-stop-1', 'scrap-belt'],
      completedNodes: ['fuel-stop-1', 'scrap-belt'],
      unlockedNodes: ['home-orbit', 'fuel-stop-1', 'scrap-belt', 'distress-signal', 'abandoned-cache']
    }
  });
  const { api } = createHarness({ moberinoJourneySave: stranded });
  const state = api.load();

  assert.equal(state.currentNodeId, 'scrap-belt');
  assert.equal(state.selectedDestinationId, null);
  assert.equal(state.log.transmissions.includes('scrap-belt-signals'), true);
  assert.deepEqual(Array.from(api.getUnreadTransmissionIds()), ['scrap-belt-signals']);
});

test('transmissions persist and become read exactly once', () => {
  const { api } = createHarness();
  api.createNew();

  assert.equal(api.addTransmission('scrap-belt-signals').ok, true);
  assert.equal(api.addTransmission('scrap-belt-signals').code, 'already-received');
  assert.deepEqual(Array.from(api.getUnreadTransmissionIds()), ['scrap-belt-signals']);
  assert.equal(api.markTransmissionRead('scrap-belt-signals').ok, true);
  assert.equal(api.markTransmissionRead('scrap-belt-signals').code, 'already-read');
  assert.deepEqual(Array.from(api.getUnreadTransmissionIds()), []);
});

test('intro completion and crystal recovery persist exactly once', () => {
  const { api } = createHarness();
  api.createNew();

  assert.equal(api.getState().settings.tutorialComplete, false);
  assert.equal(api.completeIntro().ok, true);
  assert.equal(api.completeIntro().code, 'already-complete');
  assert.equal(api.awardCrystal('azure-cache').ok, true);
  assert.equal(api.awardCrystal('azure-cache').code, 'already-recovered');
  assert.equal(api.getState().settings.tutorialComplete, true);
  assert.equal(api.getState().currency.crystals, 1);
  assert.equal(api.getState().log.discoveries.includes('crystal:azure-cache'), true);
});

test('peaceful discoveries reward once and unlock the next stop', () => {
  const { api } = createHarness();
  const state = api.createNew();
  state.currentNodeId = 'abandoned-cache';
  state.route.unlockedNodes.push('abandoned-cache');

  const first = api.resolvePeacefulNode({
    nodeId: 'abandoned-cache',
    salvage: 18,
    power: 6,
    unlockNodeIds: ['repair-moon'],
    discoveryId: 'cache-log-1'
  });
  const duplicate = api.resolvePeacefulNode({
    nodeId: 'abandoned-cache',
    salvage: 18,
    unlockNodeIds: ['repair-moon']
  });

  assert.equal(first.ok, true);
  assert.equal(duplicate.code, 'already-completed');
  assert.equal(state.currency.salvage, 18);
  assert.equal(state.route.unlockedNodes.includes('repair-moon'), true);
  assert.equal(state.log.discoveries.includes('cache-log-1'), true);
});

test('timed repairs finish safely and upgrades persist', () => {
  const { api } = createHarness();
  const state = api.createNew();
  state.resources.hull = 42;
  state.currency.salvage = 30;

  const started = api.startRepair(5000, 5);
  assert.equal(started.ok, true);
  assert.equal(api.getState().currency.salvage, 25);
  assert.equal(api.completeReadyRepair(started.completeAt - 1).code, 'repair-underway');
  assert.equal(api.completeReadyRepair(started.completeAt).ok, true);
  assert.equal(api.getState().resources.hull, 100);
  assert.equal(api.getState().timers.repairCompleteAt, null);

  const upgraded = api.purchaseUpgrade('blasterLevel', 20);
  assert.equal(upgraded.ok, true);
  assert.equal(upgraded.level, 1);
  assert.equal(api.getState().currency.salvage, 5);
  assert.equal(api.getState().upgrades.blasterLevel, 1);
});

test('save writes are centralized and include their reason', () => {
  const { api, events } = createHarness();
  api.createNew();
  api.saveJourneyState('test-checkpoint');

  assert.equal(events.at(-1).type, 'journey-state-saved');
  assert.equal(events.at(-1).detail.reason, 'test-checkpoint');
});

test('travel spends fuel and advances a selected route exactly once', () => {
  const { api } = createHarness();
  const state = api.createNew();
  assert.equal(api.selectDestination('fuel-stop-1').ok, true);

  const first = api.travel({
    originId: 'home-orbit',
    destinationId: 'fuel-stop-1',
    fuelCost: 6,
    distance: 18
  });
  const duplicate = api.travel({
    originId: 'home-orbit',
    destinationId: 'fuel-stop-1',
    fuelCost: 6,
    distance: 18
  });

  const finalState = api.getState();
  assert.equal(first.ok, true);
  assert.equal(duplicate.ok, false);
  assert.equal(finalState.currentNodeId, 'fuel-stop-1');
  assert.equal(finalState.resources.fuel, 6);
  assert.equal(finalState.totalDistance, 18);
  assert.equal(finalState.route.visitedNodes.filter(id => id === 'fuel-stop-1').length, 1);
});

test('locked destinations and insufficient fuel cannot advance the route', () => {
  const { api } = createHarness();
  const state = api.createNew();

  assert.equal(api.selectDestination('scrap-belt').code, 'locked-destination');
  state.resources.fuel = 2;
  assert.equal(api.selectDestination('fuel-stop-1').ok, true);
  const result = api.travel({
    originId: 'home-orbit',
    destinationId: 'fuel-stop-1',
    fuelCost: 6,
    distance: 18
  });

  assert.equal(result.code, 'insufficient-fuel');
  assert.equal(state.currentNodeId, 'home-orbit');
  assert.equal(state.resources.fuel, 2);
});

test('critical hull, an exhausted pilot, and active repairs block departure with a reason', () => {
  const { api } = createHarness();
  const state = api.createNew();

  state.resources.hull = 10;
  state.resources.pilot = 10;
  state.timers.repairCompleteAt = Date.now() + 45000;
  const blocked = api.getDepartureReadiness(6);

  assert.equal(blocked.ok, false);
  assert.deepEqual(
    Array.from(blocked.blockers, blocker => blocker.code),
    ['repair-underway', 'critical-hull', 'pilot-exhausted']
  );

  state.resources.hull = 100;
  state.resources.pilot = 100;
  state.timers.repairCompleteAt = null;
  assert.equal(api.getDepartureReadiness(6).code, 'ready');
});

test('peaceful-node completion unlocks once and refueling is safe to repeat', () => {
  const { api } = createHarness();
  const state = api.createNew();
  state.resources.fuel = 9;

  const first = api.completeNode('fuel-stop-1', ['scrap-belt']);
  const duplicate = api.completeNode('fuel-stop-1', ['scrap-belt']);
  const refuel = api.refuelToMax('test-fuel-stop');

  const finalState = api.getState();
  assert.equal(first.ok, true);
  assert.equal(duplicate.code, 'already-completed');
  assert.equal(finalState.route.completedNodes.filter(id => id === 'fuel-stop-1').length, 1);
  assert.equal(finalState.route.unlockedNodes.filter(id => id === 'scrap-belt').length, 1);
  assert.equal(refuel.gained, 31);
  assert.equal(finalState.resources.fuel, 40);
});

test('encounter results apply persistent damage and rewards exactly once', () => {
  const { api } = createHarness();
  const state = api.createNew();
  state.currentNodeId = 'scrap-belt';
  state.route.unlockedNodes.push('scrap-belt');
  const attempt = api.beginEncounter('asteroid-salvage-1');
  const result = {
    attemptId: attempt.attemptId,
    encounterId: 'asteroid-salvage-1',
    outcome: 'success',
    hullRemaining: 73,
    salvageCollected: 6,
    fuelCollected: 2
  };

  const first = api.applyEncounterResult(result, {
    successSalvage: 20,
    completeNodeId: 'scrap-belt',
    unlockNodeIds: ['distress-signal', 'abandoned-cache']
  });
  const duplicate = api.applyEncounterResult(result, {
    successSalvage: 20,
    completeNodeId: 'scrap-belt',
    unlockNodeIds: ['distress-signal', 'abandoned-cache']
  });
  const finalState = api.getState();

  assert.equal(first.ok, true);
  assert.equal(duplicate.code, 'already-applied');
  assert.equal(finalState.resources.hull, 73);
  assert.equal(finalState.resources.fuel, 14);
  assert.equal(finalState.currency.salvage, 26);
  assert.equal(finalState.encounters.completed['asteroid-salvage-1'], 1);
  assert.equal(finalState.route.completedNodes.filter(id => id === 'scrap-belt').length, 1);
  assert.equal(finalState.route.unlockedNodes.filter(id => id === 'distress-signal').length, 1);
  assert.equal(finalState.encounters.activeAttempt, null);
});

test('successful rescue adds one persistent passenger', () => {
  const { api } = createHarness();
  const state = api.createNew();
  state.currentNodeId = 'distress-signal';
  state.route.unlockedNodes.push('distress-signal');
  const attempt = api.beginEncounter('rescue-beacon-1');

  const applied = api.applyEncounterResult({
    attemptId: attempt.attemptId,
    encounterId: 'rescue-beacon-1',
    outcome: 'success',
    hullRemaining: 88,
    salvageCollected: 2,
    fuelCollected: 0,
    rescuedPassengerId: 'pip'
  }, {
    completeNodeId: 'distress-signal',
    unlockNodeIds: ['repair-moon'],
    passengerId: 'pip'
  });
  const finalState = api.getState();

  assert.equal(applied.ok, true);
  assert.equal(applied.passengerId, 'pip');
  assert.deepEqual(Array.from(finalState.passengers.active), ['pip']);
  assert.deepEqual(Array.from(finalState.passengers.rescued), ['pip']);
  assert.equal(finalState.route.unlockedNodes.includes('repair-moon'), true);
});

test('failed encounters preserve a safe hull floor and do not unlock the route', () => {
  const { api } = createHarness();
  const state = api.createNew();
  state.currentNodeId = 'scrap-belt';
  const attempt = api.beginEncounter('asteroid-salvage-1');

  const applied = api.applyEncounterResult({
    attemptId: attempt.attemptId,
    encounterId: 'asteroid-salvage-1',
    outcome: 'failure',
    hullRemaining: 0,
    salvageCollected: 2,
    fuelCollected: 0
  }, {
    successSalvage: 20,
    completeNodeId: 'scrap-belt',
    unlockNodeIds: ['distress-signal']
  });
  const finalState = api.getState();

  assert.equal(applied.ok, true);
  assert.equal(finalState.resources.hull, 10);
  assert.equal(finalState.currency.salvage, 2);
  assert.equal(finalState.route.completedNodes.includes('scrap-belt'), false);
  assert.equal(finalState.route.unlockedNodes.includes('distress-signal'), false);
  assert.equal(finalState.encounters.failed['asteroid-salvage-1'], 1);
});
