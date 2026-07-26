/* Grid Lock's forward-compatible rule contract. Sliding Grid is the first live modifier. */
(function () {
  'use strict';

  const DEFAULTS = Object.freeze({
    slidingPieces: Object.freeze({ enabled: false, emptyCellCount: 0, emptyCell: null, movementCells: Object.freeze([]), scrambleMoves: 0 }),
    obstacles: Object.freeze({ enabled: false, count: 0, pattern: 'scatter', maxGenerationAttempts: 48 }),
    lockedPieces: Object.freeze({ enabled: false, count: 0, minConnections: 2 }),
    powerSources: Object.freeze({ count: 1 }),
    powerSystems: Object.freeze({ enabled: false, systems: Object.freeze([]), splitColumns: Object.freeze([]), randomizeColors: false }),
    specialTiles: Object.freeze([])
  });

  function copyDefaults() {
    return {
      slidingPieces: { ...DEFAULTS.slidingPieces, movementCells: [] },
      obstacles: { ...DEFAULTS.obstacles },
      lockedPieces: { ...DEFAULTS.lockedPieces },
      powerSources: { ...DEFAULTS.powerSources },
      powerSystems: { ...DEFAULTS.powerSystems, systems: [], splitColumns: [] },
      specialTiles: []
    };
  }

  function normalize(input) {
    const modifiers = input || {};
    const normalized = copyDefaults();
    normalized.slidingPieces.enabled = Boolean(modifiers.slidingPieces && modifiers.slidingPieces.enabled);
    normalized.slidingPieces.emptyCellCount = normalized.slidingPieces.enabled
      ? Math.max(1, Math.round(Number(modifiers.slidingPieces.emptyCellCount) || 1))
      : 0;
    normalized.slidingPieces.scrambleMoves = normalized.slidingPieces.enabled
      ? Math.max(1, Math.round(Number(modifiers.slidingPieces.scrambleMoves) || 3))
      : 0;
    const requestedEmptyCell = modifiers.slidingPieces && modifiers.slidingPieces.emptyCell;
    normalized.slidingPieces.emptyCell = requestedEmptyCell && Number.isFinite(Number(requestedEmptyCell.r)) && Number.isFinite(Number(requestedEmptyCell.c))
      ? { r: Math.round(Number(requestedEmptyCell.r)), c: Math.round(Number(requestedEmptyCell.c)) }
      : null;
    const requestedMovementCells = modifiers.slidingPieces && (modifiers.slidingPieces.movementCells || modifiers.slidingPieces.railCells);
    normalized.slidingPieces.movementCells = normalized.slidingPieces.enabled && Array.isArray(requestedMovementCells)
      ? requestedMovementCells
        .filter(cell => cell && Number.isFinite(Number(cell.r)) && Number.isFinite(Number(cell.c)))
        .map(cell => ({ r: Math.round(Number(cell.r)), c: Math.round(Number(cell.c)) }))
      : [];
    normalized.obstacles.enabled = Boolean(modifiers.obstacles && modifiers.obstacles.enabled);
    normalized.obstacles.count = Math.max(0, Math.round(Number(modifiers.obstacles && modifiers.obstacles.count) || 0));
    normalized.obstacles.pattern = modifiers.obstacles && modifiers.obstacles.pattern === 'barrier' ? 'barrier' : 'scatter';
    normalized.obstacles.maxGenerationAttempts = Math.max(1, Math.round(Number(modifiers.obstacles && modifiers.obstacles.maxGenerationAttempts) || 48));
    normalized.lockedPieces.enabled = Boolean(modifiers.lockedPieces && modifiers.lockedPieces.enabled);
    normalized.lockedPieces.count = normalized.lockedPieces.enabled
      ? Math.max(0, Math.round(Number(modifiers.lockedPieces.count) || 0))
      : 0;
    normalized.lockedPieces.minConnections = Math.max(1, Math.round(Number(modifiers.lockedPieces && modifiers.lockedPieces.minConnections) || 2));
    normalized.powerSources.count = Math.max(1, Math.round(Number(modifiers.powerSources && modifiers.powerSources.count) || 1));
    normalized.powerSystems.enabled = Boolean(modifiers.powerSystems && modifiers.powerSystems.enabled);
    normalized.powerSystems.randomizeColors = normalized.powerSystems.enabled && Boolean(modifiers.powerSystems.randomizeColors);
    normalized.powerSystems.systems = normalized.powerSystems.enabled && Array.isArray(modifiers.powerSystems.systems)
      ? modifiers.powerSystems.systems.map((system, index) => ({
        id: String(system && system.id || `system-${index + 1}`),
        color: system && system.color === 'green' ? 'green' : 'cyan',
        source: system && system.source ? { r: Math.round(Number(system.source.r)), c: Math.round(Number(system.source.c)) } : null,
        sinks: Array.isArray(system && system.sinks) ? system.sinks.map(sink => ({
          r: Math.round(Number(sink.r)),
          c: Math.round(Number(sink.c)),
          side: ['n', 'e', 's', 'w'].includes(sink.side) ? sink.side : 'n',
          programmable: Boolean(sink.programmable)
        })) : []
      }))
      : [];
    normalized.powerSystems.splitColumns = normalized.powerSystems.enabled && Array.isArray(modifiers.powerSystems.splitColumns)
      ? modifiers.powerSystems.splitColumns.map(column => Math.round(Number(column)))
      : [];
    normalized.specialTiles = Array.isArray(modifiers.specialTiles)
      ? modifiers.specialTiles
        .filter(tile => tile && tile.type)
        .map(tile => {
          if (tile.type === 'router' && Number.isFinite(Number(tile.r)) && Number.isFinite(Number(tile.c))) {
            return {
              type: 'router',
              r: Math.round(Number(tile.r)),
              c: Math.round(Number(tile.c)),
              fixed: tile.fixed !== false
            };
          }
          return { ...tile };
        })
      : [];
    return Object.freeze({
      slidingPieces: Object.freeze({ ...normalized.slidingPieces, movementCells: Object.freeze(normalized.slidingPieces.movementCells) }),
      obstacles: Object.freeze(normalized.obstacles),
      lockedPieces: Object.freeze(normalized.lockedPieces),
      powerSources: Object.freeze(normalized.powerSources),
      powerSystems: Object.freeze({ ...normalized.powerSystems, systems: Object.freeze(normalized.powerSystems.systems.map(system => Object.freeze({ ...system, source: system.source && Object.freeze({ ...system.source }), sinks: Object.freeze(system.sinks.map(sink => Object.freeze({ ...sink }))) }))), splitColumns: Object.freeze(normalized.powerSystems.splitColumns) }),
      specialTiles: Object.freeze(normalized.specialTiles.map(tile => Object.freeze({ ...tile })))
    });
  }

  window.GridLockModifiers = Object.freeze({ defaults: copyDefaults, normalize });
})();
