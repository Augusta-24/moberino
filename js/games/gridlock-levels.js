/* Grid Lock level catalogue. Levels describe generated-puzzle constraints only. */
(function () {
  'use strict';

  const WORLDS = [
    {
      id: 'training-array',
      name: 'Training Array',
      description: 'A compact relay path for calibrating the Grid Lock.',
      levels: [
        { id: 'array-01', order: 1, name: 'Relay One', size: { rows: 5, columns: 5 }, difficulty: 1, generationRules: { loopEdgeChance: .22, maxCrossingFraction: .08 }, modifiers: {} },
        { id: 'array-02', order: 2, name: 'Relay Two', size: { rows: 5, columns: 5 }, difficulty: 2, generationRules: { loopEdgeChance: .30, maxCrossingFraction: .12 }, modifiers: {} },
        { id: 'array-03', order: 3, name: 'Relay Three', size: { rows: 6, columns: 6 }, difficulty: 3, generationRules: { loopEdgeChance: .34, maxCrossingFraction: .15 }, modifiers: {} }
      ]
    }
  ];

  const levels = WORLDS.flatMap(world => world.levels.map(level => Object.freeze({ ...level, worldId: world.id })));
  const byId = new Map(levels.map(level => [level.id, level]));

  window.GridLockLevels = Object.freeze({
    worlds: Object.freeze(WORLDS),
    all: Object.freeze(levels),
    firstId: levels[0].id,
    get(id) { return byId.get(id) || null; },
    next(id) { const index = levels.findIndex(level => level.id === id); return index < 0 ? null : levels[index + 1] || null; }
  });
})();
