/* Grid Lock progression persistence. This module owns no UI or puzzle state. */
(function () {
  'use strict';

  const STORAGE_KEY = 'moberino-gridlock-progression-v1';

  function defaultState() { return { completed: {}, unlocked: [GridLockLevels.firstId] }; }
  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored && Array.isArray(stored.unlocked) && stored.completed) return stored;
    } catch (error) { /* Start clean when an old or invalid save is present. */ }
    return defaultState();
  }
  function save(state) { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); return state; }
  function state() { return load(); }
  function isUnlocked(levelId) { return state().unlocked.includes(levelId); }
  function isCompleted(levelId) { return Boolean(state().completed[levelId]); }
  function complete(levelId, stats) {
    const nextState = state();
    const previous = nextState.completed[levelId] || {};
    nextState.completed[levelId] = {
      completedAt: new Date().toISOString(),
      attempts: (previous.attempts || 0) + 1,
      bestRotations: previous.bestRotations == null ? stats.rotations : Math.min(previous.bestRotations, stats.rotations),
      bestDurationMs: previous.bestDurationMs == null ? stats.durationMs : Math.min(previous.bestDurationMs, stats.durationMs)
    };
    const next = GridLockLevels.next(levelId);
    if (next && !nextState.unlocked.includes(next.id)) nextState.unlocked.push(next.id);
    return save(nextState);
  }

  window.GridLockProgression = Object.freeze({ state, isUnlocked, isCompleted, complete });
})();
