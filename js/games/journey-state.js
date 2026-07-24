/* Persistent Journey state. This module owns storage; gameplay modules receive
   state and return results without writing to localStorage directly. */
(function () {
  'use strict';

  const GAME_ID = 'journey';
  const SAVE_KEY = 'moberinoJourneySave';
  const SAVE_VERSION = 3;
  const MIN_DEPARTURE_HULL = 25;
  const MIN_DEPARTURE_PILOT = 20;
  const OFFLINE_CAP_MS = 24 * 60 * 60 * 1000;
  const POWER_PER_HOUR = 12;
  const PILOT_PER_HOUR = 10;

  const DEFAULT_SAVE = {
    version: SAVE_VERSION,
    createdAt: null,
    lastPlayedAt: null,
    currentRegionId: 'region-1',
    currentNodeId: 'home-orbit',
    selectedDestinationId: null,
    totalDistance: 0,
    resources: {
      hull: 100,
      maxHull: 100,
      fuel: 12,
      maxFuel: 40,
      power: 100,
      maxPower: 100,
      pilot: 100
    },
    currency: { salvage: 0, crystals: 0 },
    upgrades: {
      fuelTankLevel: 0,
      hullLevel: 0,
      blasterLevel: 0,
      powerCoreLevel: 0,
      salvageMagnetLevel: 0,
      passengerBerthLevel: 0
    },
    cosmetics: {
      unlocked: ['default-hull'],
      equipped: {
        hull: 'default-hull',
        trail: 'default-trail',
        cockpit: 'default-cockpit'
      }
    },
    passengers: { active: [], rescued: [] },
    route: {
      visitedNodes: ['home-orbit'],
      completedNodes: [],
      unlockedNodes: ['home-orbit', 'fuel-stop-1'],
      defeatedBosses: []
    },
    encounters: {
      completed: {},
      failed: {},
      activeAttempt: null,
      appliedResults: []
    },
    log: { transmissions: [], readTransmissions: [], discoveries: [] },
    timers: {
      repairCompleteAt: null,
      powerUpdatedAt: null,
      pilotUpdatedAt: null
    },
    settings: { tutorialComplete: false }
  };

  let state = null;
  let returnSummary = [];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function finiteNumber(value, fallback) {
    return Number.isFinite(value) ? value : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function mergeKnown(defaultValue, savedValue) {
    if (Array.isArray(defaultValue)) {
      return Array.isArray(savedValue) ? savedValue.slice() : defaultValue.slice();
    }
    if (defaultValue && typeof defaultValue === 'object') {
      const source = savedValue && typeof savedValue === 'object' && !Array.isArray(savedValue)
        ? savedValue
        : {};
      return Object.keys(defaultValue).reduce((result, key) => {
        result[key] = mergeKnown(defaultValue[key], source[key]);
        return result;
      }, {});
    }
    return savedValue === undefined ? defaultValue : savedValue;
  }

  function uniqueStrings(value, fallback) {
    if (!Array.isArray(value)) return fallback.slice();
    return [...new Set(value.filter(item => typeof item === 'string' && item.length > 0))];
  }

  function sanitize(candidate) {
    const sourceVersion = candidate && Number.isFinite(candidate.version) ? candidate.version : 0;
    const next = mergeKnown(DEFAULT_SAVE, candidate);
    next.version = SAVE_VERSION;
    next.createdAt = typeof next.createdAt === 'number' ? next.createdAt : Date.now();
    next.lastPlayedAt = typeof next.lastPlayedAt === 'number' ? next.lastPlayedAt : next.createdAt;
    next.currentRegionId = typeof next.currentRegionId === 'string' ? next.currentRegionId : DEFAULT_SAVE.currentRegionId;
    next.currentNodeId = typeof next.currentNodeId === 'string' ? next.currentNodeId : DEFAULT_SAVE.currentNodeId;
    next.selectedDestinationId = typeof next.selectedDestinationId === 'string' ? next.selectedDestinationId : null;
    next.totalDistance = Math.max(0, finiteNumber(next.totalDistance, 0));

    const resources = next.resources;
    resources.maxHull = Math.max(1, finiteNumber(resources.maxHull, 100));
    resources.maxFuel = Math.max(1, finiteNumber(resources.maxFuel, 40));
    resources.maxPower = Math.max(1, finiteNumber(resources.maxPower, 100));
    resources.hull = clamp(finiteNumber(resources.hull, resources.maxHull), 0, resources.maxHull);
    resources.fuel = clamp(finiteNumber(resources.fuel, resources.maxFuel), 0, resources.maxFuel);
    resources.power = clamp(finiteNumber(resources.power, resources.maxPower), 0, resources.maxPower);
    resources.pilot = clamp(finiteNumber(resources.pilot, 100), 0, 100);
    next.currency.salvage = Math.max(0, finiteNumber(next.currency.salvage, 0));
    next.currency.crystals = Math.max(0, Math.floor(finiteNumber(next.currency.crystals, 0)));

    Object.keys(DEFAULT_SAVE.upgrades).forEach(key => {
      next.upgrades[key] = Math.max(0, Math.floor(finiteNumber(next.upgrades[key], 0)));
    });

    next.cosmetics.unlocked = uniqueStrings(next.cosmetics.unlocked, DEFAULT_SAVE.cosmetics.unlocked);
    next.passengers.active = uniqueStrings(next.passengers.active, []);
    next.passengers.rescued = uniqueStrings(next.passengers.rescued, []);
    next.route.visitedNodes = uniqueStrings(next.route.visitedNodes, DEFAULT_SAVE.route.visitedNodes);
    next.route.completedNodes = uniqueStrings(next.route.completedNodes, []);
    next.route.unlockedNodes = uniqueStrings(next.route.unlockedNodes, DEFAULT_SAVE.route.unlockedNodes);
    next.route.defeatedBosses = uniqueStrings(next.route.defeatedBosses, []);
    const savedEncounters = candidate && candidate.encounters && typeof candidate.encounters === 'object'
      ? candidate.encounters
      : {};
    next.encounters.completed = savedEncounters.completed && typeof savedEncounters.completed === 'object' && !Array.isArray(savedEncounters.completed)
      ? Object.assign({}, savedEncounters.completed)
      : {};
    next.encounters.failed = savedEncounters.failed && typeof savedEncounters.failed === 'object' && !Array.isArray(savedEncounters.failed)
      ? Object.assign({}, savedEncounters.failed)
      : {};
    next.encounters.appliedResults = uniqueStrings(savedEncounters.appliedResults, []);
    next.encounters.activeAttempt = savedEncounters.activeAttempt &&
      typeof savedEncounters.activeAttempt === 'object' &&
      typeof savedEncounters.activeAttempt.id === 'string' &&
      typeof savedEncounters.activeAttempt.encounterId === 'string'
      ? {
          id: savedEncounters.activeAttempt.id,
          encounterId: savedEncounters.activeAttempt.encounterId,
          startedAt: finiteNumber(savedEncounters.activeAttempt.startedAt, Date.now())
        }
      : null;
    next.log.transmissions = uniqueStrings(next.log.transmissions, []);
    next.log.readTransmissions = uniqueStrings(next.log.readTransmissions, []);
    next.log.discoveries = uniqueStrings(next.log.discoveries, []);
    next.settings.tutorialComplete = !!next.settings.tutorialComplete;

    // Version 1 briefly allowed a completed journey to backtrack to Home and
    // strand itself there. Restore those saves to their cleared frontier.
    if (
      sourceVersion < 2 &&
      next.currentNodeId === 'home-orbit' &&
      next.route.completedNodes.includes('scrap-belt')
    ) {
      next.currentNodeId = 'scrap-belt';
      next.selectedDestinationId = null;
    }
    if (
      next.route.completedNodes.includes('scrap-belt') &&
      !next.log.transmissions.includes('scrap-belt-signals')
    ) {
      next.log.transmissions.push('scrap-belt-signals');
    }
    return next;
  }

  function hasSave() {
    try {
      return localStorage.getItem(SAVE_KEY) !== null;
    } catch (error) {
      return state !== null;
    }
  }

  function saveJourneyState(reason) {
    if (!state) return false;
    state.lastPlayedAt = Date.now();
    state = sanitize(state);
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(state));
      window.dispatchEvent(new CustomEvent('journey-state-saved', {
        detail: { reason: reason || 'unspecified' }
      }));
      return true;
    } catch (error) {
      console.warn('Journey save failed:', error);
      return false;
    }
  }

  function applyOfflineProgress(now) {
    returnSummary = [];
    if (!state) return returnSummary;
    const elapsed = clamp(now - finiteNumber(state.lastPlayedAt, now), 0, OFFLINE_CAP_MS);
    // Version 3 briefly used a 45-second dock timer. Settle any saved repair
    // immediately; dock repairs are now an instant paid service.
    if (state.timers.repairCompleteAt) {
      state.resources.hull = state.resources.maxHull;
      state.timers.repairCompleteAt = null;
      returnSummary.push('Hull repairs are complete.');
    }
    if (elapsed >= 60 * 1000) {
      const hours = elapsed / (60 * 60 * 1000);
      const oldPower = state.resources.power;
      const oldPilot = state.resources.pilot;
      state.resources.power = clamp(oldPower + hours * POWER_PER_HOUR, 0, state.resources.maxPower);
      state.resources.pilot = clamp(oldPilot + hours * PILOT_PER_HOUR, 0, 100);

      const powerGained = Math.floor(state.resources.power - oldPower);
      const pilotGained = Math.floor(state.resources.pilot - oldPilot);
      if (powerGained > 0) returnSummary.push(`Power restored by ${powerGained}.`);
      if (pilotGained > 0) returnSummary.push(`Pilot readiness restored by ${pilotGained}.`);
    }
    return returnSummary;
  }

  function load() {
    let parsed = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      parsed = raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.warn('Journey save was unreadable; using a safe default.', error);
    }
    if (!parsed) {
      state = null;
      return null;
    }
    state = sanitize(parsed);
    applyOfflineProgress(Date.now());
    saveJourneyState('launch');
    return state;
  }

  function createNew() {
    const now = Date.now();
    state = sanitize(clone(DEFAULT_SAVE));
    state.createdAt = now;
    state.lastPlayedAt = now;
    returnSummary = ['The ship is ready to begin its journey.'];
    saveJourneyState('new-journey');
    return state;
  }

  function getState() {
    return state;
  }

  function getReturnSummary() {
    return returnSummary.slice();
  }

  function mutationResult(ok, code, detail) {
    return Object.assign({ ok, code }, detail || {});
  }

  function addUnique(list, value) {
    if (!list.includes(value)) list.push(value);
  }

  function selectDestination(destinationId) {
    if (!state) return mutationResult(false, 'no-save');
    if (typeof destinationId !== 'string' || !state.route.unlockedNodes.includes(destinationId)) {
      return mutationResult(false, 'locked-destination');
    }
    state.selectedDestinationId = destinationId;
    saveJourneyState('select-destination');
    return mutationResult(true, 'selected', { destinationId });
  }

  function getDepartureReadiness(fuelCost) {
    if (!state) return mutationResult(false, 'no-save', { blockers: [] });
    const requiredFuel = Math.max(0, finiteNumber(fuelCost, 0));
    const blockers = [];

    if (state.timers.repairCompleteAt) {
      blockers.push({ code: 'repair-underway', message: 'REPAIRS IN PROGRESS' });
    }
    if (state.resources.hull < MIN_DEPARTURE_HULL) {
      blockers.push({
        code: 'critical-hull',
        message: `HULL ${Math.round(state.resources.hull)} · REPAIR TO ${MIN_DEPARTURE_HULL}`
      });
    }
    if (state.resources.pilot < MIN_DEPARTURE_PILOT) {
      blockers.push({
        code: 'pilot-exhausted',
        message: `PILOT ${Math.round(state.resources.pilot)} · REST FIRST`
      });
    }
    if (state.resources.fuel < requiredFuel) {
      blockers.push({
        code: 'insufficient-fuel',
        message: `NEED ${Math.round(requiredFuel)} FUEL · HAVE ${Math.round(state.resources.fuel)}`
      });
    }

    return mutationResult(blockers.length === 0, blockers.length ? blockers[0].code : 'ready', {
      blockers,
      requiredFuel,
      minimumHull: MIN_DEPARTURE_HULL,
      minimumPilot: MIN_DEPARTURE_PILOT
    });
  }

  function travel(options) {
    if (!state) return mutationResult(false, 'no-save');
    const originId = options && options.originId;
    const destinationId = options && options.destinationId;
    const fuelCost = Math.max(0, finiteNumber(options && options.fuelCost, 0));
    const distance = Math.max(0, finiteNumber(options && options.distance, 0));

    if (state.currentNodeId !== originId) return mutationResult(false, 'origin-changed');
    if (state.selectedDestinationId !== destinationId) return mutationResult(false, 'destination-changed');
    if (!state.route.unlockedNodes.includes(destinationId)) return mutationResult(false, 'locked-destination');
    const readiness = getDepartureReadiness(fuelCost);
    if (!readiness.ok) {
      return mutationResult(false, readiness.code, {
        blockers: readiness.blockers,
        needed: fuelCost,
        available: state.resources.fuel
      });
    }

    state.resources.fuel -= fuelCost;
    state.totalDistance += distance;
    state.currentNodeId = destinationId;
    state.selectedDestinationId = null;
    addUnique(state.route.visitedNodes, destinationId);
    saveJourneyState('travel');
    return mutationResult(true, 'arrived', {
      destinationId,
      fuelSpent: fuelCost,
      distance
    });
  }

  function completeNode(nodeId, unlockNodeIds) {
    if (!state || typeof nodeId !== 'string') return mutationResult(false, 'no-save');
    if (state.route.completedNodes.includes(nodeId)) {
      return mutationResult(false, 'already-completed');
    }
    addUnique(state.route.completedNodes, nodeId);
    (Array.isArray(unlockNodeIds) ? unlockNodeIds : []).forEach(nodeIdToUnlock => {
      if (typeof nodeIdToUnlock === 'string') addUnique(state.route.unlockedNodes, nodeIdToUnlock);
    });
    saveJourneyState(`complete-${nodeId}`);
    return mutationResult(true, 'completed', { nodeId });
  }

  function addTransmission(transmissionId) {
    if (!state || typeof transmissionId !== 'string') return mutationResult(false, 'no-save');
    if (state.log.transmissions.includes(transmissionId)) {
      return mutationResult(false, 'already-received', { transmissionId });
    }
    addUnique(state.log.transmissions, transmissionId);
    saveJourneyState(`transmission-${transmissionId}`);
    return mutationResult(true, 'received', { transmissionId });
  }

  function markTransmissionRead(transmissionId) {
    if (!state || !state.log.transmissions.includes(transmissionId)) {
      return mutationResult(false, 'missing-transmission');
    }
    if (state.log.readTransmissions.includes(transmissionId)) {
      return mutationResult(false, 'already-read', { transmissionId });
    }
    addUnique(state.log.readTransmissions, transmissionId);
    saveJourneyState(`read-${transmissionId}`);
    return mutationResult(true, 'read', { transmissionId });
  }

  function getUnreadTransmissionIds() {
    if (!state) return [];
    return state.log.transmissions.filter(id => !state.log.readTransmissions.includes(id));
  }

  function completeIntro() {
    if (!state) return mutationResult(false, 'no-save');
    if (state.settings.tutorialComplete) return mutationResult(false, 'already-complete');
    state.settings.tutorialComplete = true;
    saveJourneyState('complete-intro');
    return mutationResult(true, 'intro-complete');
  }

  function awardCrystal(crystalId) {
    if (!state || typeof crystalId !== 'string') return mutationResult(false, 'invalid-crystal');
    const discoveryId = `crystal:${crystalId}`;
    if (state.log.discoveries.includes(discoveryId)) {
      return mutationResult(false, 'already-recovered', { crystalId });
    }
    addUnique(state.log.discoveries, discoveryId);
    state.currency.crystals += 1;
    saveJourneyState(`crystal-${crystalId}`);
    return mutationResult(true, 'crystal-recovered', {
      crystalId,
      crystals: state.currency.crystals
    });
  }

  function resolvePeacefulNode(options) {
    if (!state || !options || typeof options.nodeId !== 'string') {
      return mutationResult(false, 'invalid-resolution');
    }
    if (state.currentNodeId !== options.nodeId) return mutationResult(false, 'wrong-location');
    if (state.route.completedNodes.includes(options.nodeId)) {
      return mutationResult(false, 'already-completed');
    }
    const salvage = Math.max(0, Math.floor(finiteNumber(options.salvage, 0)));
    const fuel = Math.max(0, Math.floor(finiteNumber(options.fuel, 0)));
    const power = Math.max(0, Math.floor(finiteNumber(options.power, 0)));
    state.currency.salvage += salvage;
    state.resources.fuel = clamp(state.resources.fuel + fuel, 0, state.resources.maxFuel);
    state.resources.power = clamp(state.resources.power + power, 0, state.resources.maxPower);
    addUnique(state.route.completedNodes, options.nodeId);
    (Array.isArray(options.unlockNodeIds) ? options.unlockNodeIds : []).forEach(nodeId => {
      if (typeof nodeId === 'string') addUnique(state.route.unlockedNodes, nodeId);
    });
    if (typeof options.discoveryId === 'string') addUnique(state.log.discoveries, options.discoveryId);
    saveJourneyState(`resolve-${options.nodeId}`);
    return mutationResult(true, 'resolved', { salvage, fuel, power });
  }

  function refuelToMax(reason) {
    if (!state) return mutationResult(false, 'no-save');
    const gained = Math.max(0, state.resources.maxFuel - state.resources.fuel);
    state.resources.fuel = state.resources.maxFuel;
    saveJourneyState(reason || 'refuel');
    return mutationResult(true, 'refueled', { gained });
  }

  function restPilot(amount) {
    if (!state) return mutationResult(false, 'no-save');
    const before = state.resources.pilot;
    state.resources.pilot = clamp(before + Math.max(0, finiteNumber(amount, 0)), 0, 100);
    const gained = state.resources.pilot - before;
    if (gained > 0) saveJourneyState('rest-pilot');
    return mutationResult(gained > 0, gained > 0 ? 'rested' : 'already-ready', { gained });
  }

  function repairHull(amount, salvageCost) {
    if (!state) return mutationResult(false, 'no-save');
    const repairAmount = Math.max(0, finiteNumber(amount, 0));
    const cost = Math.max(0, finiteNumber(salvageCost, 0));
    if (state.resources.hull >= state.resources.maxHull) return mutationResult(false, 'hull-full');
    if (state.currency.salvage < cost) {
      return mutationResult(false, 'insufficient-salvage', {
        needed: cost,
        available: state.currency.salvage
      });
    }
    const before = state.resources.hull;
    state.currency.salvage -= cost;
    state.resources.hull = clamp(before + repairAmount, 0, state.resources.maxHull);
    saveJourneyState('repair-hull');
    return mutationResult(true, 'repaired', {
      repaired: state.resources.hull - before,
      salvageSpent: cost
    });
  }

  function startRepair(durationMs, salvageCost) {
    if (!state) return mutationResult(false, 'no-save');
    if (state.timers.repairCompleteAt) {
      return mutationResult(false, 'repair-underway', { completeAt: state.timers.repairCompleteAt });
    }
    if (state.resources.hull >= state.resources.maxHull) return mutationResult(false, 'hull-full');
    const cost = Math.max(0, finiteNumber(salvageCost, 0));
    if (state.currency.salvage < cost) {
      return mutationResult(false, 'insufficient-salvage', {
        needed: cost,
        available: state.currency.salvage
      });
    }
    state.currency.salvage -= cost;
    state.timers.repairCompleteAt = Date.now() + Math.max(1000, finiteNumber(durationMs, 1000));
    saveJourneyState('start-repair');
    return mutationResult(true, 'repair-started', {
      completeAt: state.timers.repairCompleteAt,
      salvageSpent: cost
    });
  }

  function completeReadyRepair(now) {
    if (!state || !state.timers.repairCompleteAt) return mutationResult(false, 'no-repair');
    const checkedAt = finiteNumber(now, Date.now());
    if (state.timers.repairCompleteAt > checkedAt) {
      return mutationResult(false, 'repair-underway', { completeAt: state.timers.repairCompleteAt });
    }
    state.resources.hull = state.resources.maxHull;
    state.timers.repairCompleteAt = null;
    saveJourneyState('complete-repair');
    return mutationResult(true, 'repair-complete');
  }

  function purchaseUpgrade(upgradeId, salvageCost) {
    if (!state || !Object.prototype.hasOwnProperty.call(state.upgrades, upgradeId)) {
      return mutationResult(false, 'unknown-upgrade');
    }
    const cost = Math.max(0, finiteNumber(salvageCost, 0));
    if (state.currency.salvage < cost) {
      return mutationResult(false, 'insufficient-salvage', {
        needed: cost,
        available: state.currency.salvage
      });
    }
    state.currency.salvage -= cost;
    state.upgrades[upgradeId] += 1;
    saveJourneyState(`upgrade-${upgradeId}`);
    return mutationResult(true, 'upgraded', {
      upgradeId,
      level: state.upgrades[upgradeId],
      salvageSpent: cost
    });
  }

  function beginEncounter(encounterId) {
    if (!state || typeof encounterId !== 'string') return mutationResult(false, 'no-save');
    if (state.encounters.activeAttempt && state.encounters.activeAttempt.encounterId === encounterId) {
      return mutationResult(true, 'resumed-attempt', {
        attemptId: state.encounters.activeAttempt.id
      });
    }
    const attemptId = `${encounterId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    state.encounters.activeAttempt = {
      id: attemptId,
      encounterId,
      startedAt: Date.now()
    };
    saveJourneyState('begin-encounter');
    return mutationResult(true, 'attempt-started', { attemptId });
  }

  function applyEncounterResult(result, options) {
    if (!state || !result || typeof result.attemptId !== 'string') {
      return mutationResult(false, 'invalid-result');
    }
    if (state.encounters.appliedResults.includes(result.attemptId)) {
      return mutationResult(false, 'already-applied');
    }
    const activeAttempt = state.encounters.activeAttempt;
    if (!activeAttempt || activeAttempt.id !== result.attemptId || activeAttempt.encounterId !== result.encounterId) {
      return mutationResult(false, 'attempt-mismatch');
    }

    const outcome = result.outcome === 'success' ? 'success' : 'failure';
    const hullFloor = outcome === 'failure' ? 10 : 0;
    state.resources.hull = clamp(
      Math.max(hullFloor, finiteNumber(result.hullRemaining, state.resources.hull)),
      0,
      state.resources.maxHull
    );
    const collectedSalvage = Math.max(0, Math.floor(finiteNumber(result.salvageCollected, 0)));
    const collectedFuel = Math.max(0, Math.floor(finiteNumber(result.fuelCollected, 0)));
    const successSalvage = outcome === 'success'
      ? Math.max(0, Math.floor(finiteNumber(options && options.successSalvage, 0)))
      : 0;
    state.currency.salvage += collectedSalvage + successSalvage;
    state.resources.fuel = clamp(state.resources.fuel + collectedFuel, 0, state.resources.maxFuel);

    const record = outcome === 'success' ? state.encounters.completed : state.encounters.failed;
    record[result.encounterId] = Math.max(0, Math.floor(finiteNumber(record[result.encounterId], 0))) + 1;
    if (outcome === 'success') {
      const completeNodeId = options && options.completeNodeId;
      if (typeof completeNodeId === 'string') addUnique(state.route.completedNodes, completeNodeId);
      (Array.isArray(options && options.unlockNodeIds) ? options.unlockNodeIds : []).forEach(nodeId => {
        if (typeof nodeId === 'string') addUnique(state.route.unlockedNodes, nodeId);
      });
      const passengerId = result.rescuedPassengerId || (options && options.passengerId);
      if (typeof passengerId === 'string') {
        addUnique(state.passengers.rescued, passengerId);
        addUnique(state.passengers.active, passengerId);
      }
      const transmissionId = options && options.transmissionId;
      if (typeof transmissionId === 'string') addUnique(state.log.transmissions, transmissionId);
    }
    addUnique(state.encounters.appliedResults, result.attemptId);
    state.encounters.activeAttempt = null;
    saveJourneyState(`encounter-${outcome}`);
    return mutationResult(true, 'result-applied', {
      outcome,
      salvageAwarded: collectedSalvage + successSalvage,
      fuelAwarded: collectedFuel,
      passengerId: outcome === 'success'
        ? (result.rescuedPassengerId || (options && options.passengerId) || null)
        : null
    });
  }

  function clearInMemory() {
    state = null;
    returnSummary = [];
  }

  window.JourneyState = Object.freeze({
    gameId: GAME_ID,
    saveKey: SAVE_KEY,
    version: SAVE_VERSION,
    hasSave,
    load,
    createNew,
    getState,
    getReturnSummary,
    saveJourneyState,
    selectDestination,
    getDepartureReadiness,
    travel,
    completeNode,
    addTransmission,
    markTransmissionRead,
    getUnreadTransmissionIds,
    completeIntro,
    awardCrystal,
    resolvePeacefulNode,
    refuelToMax,
    restPilot,
    repairHull,
    startRepair,
    completeReadyRepair,
    purchaseUpgrade,
    beginEncounter,
    applyEncounterResult,
    clearInMemory
  });
})();
