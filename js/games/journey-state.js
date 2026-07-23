/* Persistent Journey state. This module owns storage; gameplay modules receive
   state and return results without writing to localStorage directly. */
(function () {
  'use strict';

  const GAME_ID = 'journey';
  const SAVE_KEY = 'moberinoJourneySave';
  const SAVE_VERSION = 1;
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
      fuel: 40,
      maxFuel: 40,
      power: 100,
      maxPower: 100,
      pilot: 100
    },
    currency: { salvage: 0 },
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
    encounters: { completed: {}, failed: {} },
    log: { transmissions: [], discoveries: [] },
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
    next.log.transmissions = uniqueStrings(next.log.transmissions, []);
    next.log.discoveries = uniqueStrings(next.log.discoveries, []);
    next.settings.tutorialComplete = !!next.settings.tutorialComplete;
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
    if (elapsed < 60 * 1000) return returnSummary;

    const hours = elapsed / (60 * 60 * 1000);
    const oldPower = state.resources.power;
    const oldPilot = state.resources.pilot;
    state.resources.power = clamp(oldPower + hours * POWER_PER_HOUR, 0, state.resources.maxPower);
    state.resources.pilot = clamp(oldPilot + hours * PILOT_PER_HOUR, 0, 100);

    const powerGained = Math.floor(state.resources.power - oldPower);
    const pilotGained = Math.floor(state.resources.pilot - oldPilot);
    if (powerGained > 0) returnSummary.push(`Power restored by ${powerGained}.`);
    if (pilotGained > 0) returnSummary.push(`Pilot readiness restored by ${pilotGained}.`);
    if (state.timers.repairCompleteAt && state.timers.repairCompleteAt <= now) {
      state.resources.hull = state.resources.maxHull;
      state.timers.repairCompleteAt = null;
      returnSummary.push('Hull repairs are complete.');
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
    clearInMemory
  });
})();
