/* Packing Game progression persistence. Owns no UI or puzzle state. */
(function () {
  'use strict';

  const STORAGE_KEY = 'moberino-packing-game-progression-v1';
  function defaultState() { return { completed: {}, unlocked: [PackingGameLevels.firstId] }; }
  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (stored && Array.isArray(stored.unlocked) && stored.completed) {
        PackingGameLevels.all.forEach((level, index) => {
          if (index === 0 || stored.completed[PackingGameLevels.all[index - 1].id]) {
            if (!stored.unlocked.includes(level.id)) stored.unlocked.push(level.id);
          }
        });
        return stored;
      }
    } catch (error) { /* Invalid saves start clean. */ }
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
      bestDurationMs: previous.bestDurationMs == null ? stats.durationMs : Math.min(previous.bestDurationMs, stats.durationMs)
    };
    const next = PackingGameLevels.next(levelId);
    if (next && !nextState.unlocked.includes(next.id)) {
      nextState.unlocked.push(next.id);
    }
    return save(nextState);
  }

  window.PackingGameProgression = Object.freeze({ STORAGE_KEY, state, isUnlocked, isCompleted, complete });
})();
