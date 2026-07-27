/* Grid Lock level catalogue. Levels describe generated-puzzle constraints only. */
(function () {
  'use strict';

  function movementBay(row, column, emptyCell, scrambleMoves) {
    return GridLockModifiers.normalize({
      slidingPieces: {
        enabled: true,
        emptyCellCount: 1,
        emptyCell,
        movementCells: [
          { r: row, c: column }, { r: row, c: column + 1 },
          { r: row + 1, c: column }, { r: row + 1, c: column + 1 }
        ],
        scrambleMoves
      }
    });
  }

  function barrierBay(row, column, emptyCell, scrambleMoves, obstacleCount, lockedCount) {
    return GridLockModifiers.normalize({
      slidingPieces: {
        enabled: true,
        emptyCellCount: 1,
        emptyCell,
        movementCells: [
          { r: row, c: column }, { r: row, c: column + 1 },
          { r: row + 1, c: column }, { r: row + 1, c: column + 1 }
        ],
        scrambleMoves
      },
      obstacles: { enabled: true, count: obstacleCount, pattern: 'barrier' },
      lockedPieces: { enabled: true, count: lockedCount, minConnections: 2 }
    });
  }

  function dualSystems(options) {
    const routers = options.routers || [options.router];
    return GridLockModifiers.normalize({
      slidingPieces: {
        enabled: true,
        emptyCellCount: 1,
        emptyCell: options.emptyCell,
        movementCells: options.movementCells,
        scrambleMoves: options.scrambleMoves
      },
      obstacles: options.obstacles || {},
      lockedPieces: options.lockedPieces || {},
      powerSources: { count: 2 },
      powerSystems: {
        enabled: true,
        splitColumns: options.splitColumns,
        systems: [
          { id: 'cyan', color: 'cyan', source: { r: 5, c: 0 }, sinks: [{ r: 0, c: 1 }] },
          { id: 'green', color: 'green', source: { r: 5, c: 5 }, sinks: [{ r: 0, c: 4 }] }
        ]
      },
      specialTiles: routers.map(router => ({
        type: 'router',
        r: router.r,
        c: router.c,
        fixed: true
      }))
    });
  }

  function commandSystems(options) {
    const routers = options.routers || [];
    return GridLockModifiers.normalize({
      slidingPieces: options.movementCells ? {
        enabled: true,
        emptyCellCount: 1,
        emptyCell: options.emptyCell,
        movementCells: options.movementCells,
        scrambleMoves: options.scrambleMoves
      } : {},
      obstacles: options.obstacles || {},
      lockedPieces: options.lockedPieces || {},
      powerSources: { count: 2 },
      powerSystems: {
        enabled: true,
        randomizeColors: true,
        splitColumns: options.splitColumns,
        systems: [
          { id: 'cyan', color: 'cyan', source: { r: 5, c: 0 }, sinks: options.cyanSinks },
          { id: 'green', color: 'green', source: { r: 5, c: 5 }, sinks: options.greenSinks }
        ]
      },
      specialTiles: routers.map(router => ({ type: 'router', r: router.r, c: router.c, fixed: true }))
    });
  }

  const WORLDS = [
    {
      id: 'training-array',
      name: 'Training Array',
      description: 'Restore the relay chain and learn the language of a sealed grid.',
      levels: [
        { id: 'array-01', order: 1, name: 'First Circuit', briefing: 'Find one uninterrupted route from the core to every lock.', size: { rows: 5, columns: 5 }, difficulty: 1, generationRules: { loopEdgeChance: .16, maxCrossingFraction: .06 }, modifiers: GridLockModifiers.normalize() },
        { id: 'array-02', order: 2, name: 'Three Bolts', briefing: 'A sealed grid powers every endpoint, not just the nearest one.', size: { rows: 5, columns: 5 }, difficulty: 2, generationRules: { loopEdgeChance: .22, maxCrossingFraction: .08 }, modifiers: GridLockModifiers.normalize() },
        { id: 'array-03', order: 3, name: 'Leak Check', briefing: 'The array expands. Trace each open end—one loose conduit still keeps the lock shut.', size: { rows: 6, columns: 6 }, difficulty: 3, generationRules: { loopEdgeChance: .27, maxCrossingFraction: .10 }, modifiers: GridLockModifiers.normalize() },
        { id: 'array-04', order: 4, name: 'Cross Current', briefing: 'Loops couple the larger grid: one turn can settle several decisions.', size: { rows: 6, columns: 6 }, difficulty: 4, generationRules: { loopEdgeChance: .31, maxCrossingFraction: .12 }, modifiers: GridLockModifiers.normalize() },
        { id: 'array-05', order: 5, name: 'Relay Field', briefing: 'Read outward from the power supply before committing the edges.', size: { rows: 6, columns: 6 }, difficulty: 5, generationRules: { loopEdgeChance: .35, maxCrossingFraction: .14 }, modifiers: GridLockModifiers.normalize() },
        { id: 'array-06', order: 6, name: 'Array Six', briefing: 'The field expands. Keep your route logic intact across more tiles.', size: { rows: 6, columns: 6 }, difficulty: 6, generationRules: { loopEdgeChance: .25, maxCrossingFraction: .10 }, modifiers: GridLockModifiers.normalize() },
        { id: 'array-07', order: 7, name: 'Signal Weave', briefing: 'Dense branches reward checking how each route constrains the next.', size: { rows: 6, columns: 6 }, difficulty: 7, generationRules: { loopEdgeChance: .30, maxCrossingFraction: .12 }, modifiers: GridLockModifiers.normalize() },
        { id: 'array-08', order: 8, name: 'Pressure Grid', briefing: 'Follow the current, then return to hunt the last hidden leak.', size: { rows: 6, columns: 6 }, difficulty: 8, generationRules: { loopEdgeChance: .34, maxCrossingFraction: .14 }, modifiers: GridLockModifiers.normalize() },
        { id: 'array-09', order: 9, name: 'Full Circuit', briefing: 'Every connection matters when the network starts to loop back on itself.', size: { rows: 6, columns: 6 }, difficulty: 9, generationRules: { loopEdgeChance: .38, maxCrossingFraction: .15 }, modifiers: GridLockModifiers.normalize() },
        { id: 'array-10', order: 10, name: 'Array Master', briefing: 'Seal the entire relay array. This is Classic Grid at full pressure.', size: { rows: 6, columns: 6 }, difficulty: 10, generationRules: { loopEdgeChance: .42, maxCrossingFraction: .16 }, modifiers: GridLockModifiers.normalize() }
      ]
    },
    {
      id: 'sliding-array',
      name: 'Sliding Array',
      description: 'A compact movement bay introduces position without changing the grid’s core rules.',
      levels: [
        { id: 'sliding-01', order: 1, name: 'Open Bay', briefing: 'Click or tap to rotate. Drag a conduit into the adjacent open space in the gray bay.', size: { rows: 5, columns: 5 }, difficulty: 1, generationRules: { loopEdgeChance: .18, maxCrossingFraction: .06 }, modifiers: movementBay(2, 2, { r: 3, c: 3 }, 2) },
        { id: 'sliding-02', order: 2, name: 'Position Check', briefing: 'The gray bay moves only four conduits. Rotate, then put each one in place.', size: { rows: 5, columns: 5 }, difficulty: 2, generationRules: { loopEdgeChance: .23, maxCrossingFraction: .08 }, modifiers: movementBay(2, 2, { r: 2, c: 2 }, 3) },
        { id: 'sliding-03', order: 3, name: 'Bay Relay', briefing: 'Use the open space to position the bay, then seal every conduit.', size: { rows: 5, columns: 5 }, difficulty: 3, generationRules: { loopEdgeChance: .28, maxCrossingFraction: .10 }, modifiers: movementBay(2, 2, { r: 3, c: 2 }, 4) },
        { id: 'sliding-04', order: 4, name: 'High Relay', briefing: 'The bay has moved under the upper relays. Position changes the route above.', size: { rows: 5, columns: 5 }, difficulty: 4, generationRules: { loopEdgeChance: .30, maxCrossingFraction: .12 }, modifiers: movementBay(1, 3, { r: 2, c: 4 }, 5) },
        { id: 'sliding-05', order: 5, name: 'Source Shift', briefing: 'Reposition the bay beside the power feed before sealing the route outward.', size: { rows: 5, columns: 5 }, difficulty: 5, generationRules: { loopEdgeChance: .33, maxCrossingFraction: .13 }, modifiers: movementBay(2, 0, { r: 3, c: 1 }, 5) },
        { id: 'sliding-06', order: 6, name: 'Bolt Channel', briefing: 'The bay now sits beneath the bolts. Check position before chasing every leak.', size: { rows: 5, columns: 5 }, difficulty: 6, generationRules: { loopEdgeChance: .35, maxCrossingFraction: .14 }, modifiers: movementBay(1, 1, { r: 2, c: 2 }, 6) },
        { id: 'sliding-07', order: 7, name: 'Pressure Bay', briefing: 'Dense branches make the bay’s final position matter to the whole grid.', size: { rows: 5, columns: 5 }, difficulty: 7, generationRules: { loopEdgeChance: .37, maxCrossingFraction: .15 }, modifiers: movementBay(2, 3, { r: 2, c: 3 }, 6) },
        { id: 'sliding-08', order: 8, name: 'Circuit Position', briefing: 'Read the fixed grid first, then use the bay to complete its missing route.', size: { rows: 5, columns: 5 }, difficulty: 8, generationRules: { loopEdgeChance: .39, maxCrossingFraction: .16 }, modifiers: movementBay(1, 2, { r: 2, c: 3 }, 7) },
        { id: 'sliding-09', order: 9, name: 'Array Shift', briefing: 'The array expands. One compact bay still controls a much larger circuit.', size: { rows: 6, columns: 6 }, difficulty: 9, generationRules: { loopEdgeChance: .36, maxCrossingFraction: .14 }, modifiers: movementBay(3, 2, { r: 4, c: 3 }, 7) },
        { id: 'sliding-10', order: 10, name: 'Sliding Master', briefing: 'Master the position problem: one bay, one open space, no loose end.', size: { rows: 6, columns: 6 }, difficulty: 10, generationRules: { loopEdgeChance: .41, maxCrossingFraction: .16 }, modifiers: movementBay(1, 3, { r: 2, c: 4 }, 8) }
      ]
    },
    {
      id: 'obstacle-array',
      name: 'Barrier Array',
      description: 'The movement bay remains active while permanent barriers and locked relays constrain every route.',
      levels: [
        { id: 'obstacle-01', order: 1, name: 'Detour Relay', briefing: 'The gray bay still slides. Route around the permanent barrier and leave the gold-locked relay untouched.', size: { rows: 6, columns: 6 }, difficulty: 1, generationRules: { loopEdgeChance: .22, maxCrossingFraction: .08 }, modifiers: barrierBay(3, 2, { r: 4, c: 3 }, 3, 2, 1) },
        { id: 'obstacle-02', order: 2, name: 'Locked Channel', briefing: 'A longer barrier removes the direct route. Position the bay without disturbing its locked anchor.', size: { rows: 6, columns: 6 }, difficulty: 2, generationRules: { loopEdgeChance: .27, maxCrossingFraction: .10 }, modifiers: barrierBay(2, 2, { r: 2, c: 2 }, 4, 3, 1) },
        { id: 'obstacle-03', order: 3, name: 'Barrier Weave', briefing: 'Two locked relays and one moving bay must complete the route around the dead zone.', size: { rows: 6, columns: 6 }, difficulty: 3, generationRules: { loopEdgeChance: .32, maxCrossingFraction: .12 }, modifiers: barrierBay(3, 1, { r: 4, c: 2 }, 5, 3, 2) },
        { id: 'obstacle-04', order: 4, name: 'High Wall', briefing: 'The movement bay sits below the upper relays. Route around the wall before the bolt line can seal.', size: { rows: 6, columns: 6 }, difficulty: 4, generationRules: { loopEdgeChance: .34, maxCrossingFraction: .13 }, modifiers: barrierBay(1, 3, { r: 2, c: 4 }, 6, 3, 2) },
        { id: 'obstacle-05', order: 5, name: 'Core Pocket', briefing: 'The bay crowds the power feed. Its final position determines whether current can leave the core.', size: { rows: 6, columns: 6 }, difficulty: 5, generationRules: { loopEdgeChance: .36, maxCrossingFraction: .14 }, modifiers: barrierBay(3, 0, { r: 4, c: 1 }, 6, 3, 2) },
        { id: 'obstacle-06', order: 6, name: 'Bolt Flank', briefing: 'Slide beside the bolt line, then route through a longer detour without changing its fixed anchors.', size: { rows: 6, columns: 6 }, difficulty: 6, generationRules: { loopEdgeChance: .38, maxCrossingFraction: .14 }, modifiers: barrierBay(1, 0, { r: 2, c: 1 }, 7, 4, 2) },
        { id: 'obstacle-07', order: 7, name: 'Split Passage', briefing: 'The central bay must resolve a route divided by the barrier and two locked relays.', size: { rows: 6, columns: 6 }, difficulty: 7, generationRules: { loopEdgeChance: .40, maxCrossingFraction: .15 }, modifiers: barrierBay(2, 3, { r: 3, c: 3 }, 7, 4, 2) },
        { id: 'obstacle-08', order: 8, name: 'Outer Channel', briefing: 'The open space is pinned to the far edge. Read the fixed field before moving the bay.', size: { rows: 6, columns: 6 }, difficulty: 8, generationRules: { loopEdgeChance: .41, maxCrossingFraction: .15 }, modifiers: barrierBay(3, 4, { r: 4, c: 4 }, 8, 4, 2) },
        { id: 'obstacle-09', order: 9, name: 'Lock Field', briefing: 'Three fixed relays hold the network in place while the bay completes the only flexible route.', size: { rows: 6, columns: 6 }, difficulty: 9, generationRules: { loopEdgeChance: .42, maxCrossingFraction: .16 }, modifiers: barrierBay(1, 1, { r: 2, c: 2 }, 8, 4, 3) },
        { id: 'obstacle-10', order: 10, name: 'Barrier Master', briefing: 'Master every rule in the array: one tight bay, a hard detour, and three relays that cannot move.', size: { rows: 6, columns: 6 }, difficulty: 10, generationRules: { loopEdgeChance: .43, maxCrossingFraction: .16 }, modifiers: barrierBay(3, 0, { r: 3, c: 1 }, 9, 4, 3) }
      ]
    },
    {
      id: 'router-array',
      name: 'Router Array',
      description: 'Two power systems cross through insulated relay channels.',
      levels: [
        { id: 'router-01', order: 1, name: 'Twin Signal', briefing: 'The fixed router carries two powered routes through insulated channels. Cyan and green can cross there without touching.', size: { rows: 6, columns: 6 }, difficulty: 1, generationRules: { loopEdgeChance: .12, maxCrossingFraction: .08 }, modifiers: dualSystems({ splitColumns: [3, 3, 1, 3, 3, 3], router: { r: 2, c: 2 }, emptyCell: { r: 4, c: 1 }, movementCells: [{ r: 3, c: 0 }, { r: 3, c: 1 }, { r: 4, c: 0 }, { r: 4, c: 1 }], scrambleMoves: 2 }) },
        { id: 'router-02', order: 2, name: 'Cross Channel', briefing: 'Return the bay to the router approach so both insulated channels can reach their systems.', size: { rows: 6, columns: 6 }, difficulty: 2, generationRules: { loopEdgeChance: .18, maxCrossingFraction: .10 }, modifiers: dualSystems({ splitColumns: [3, 3, 1, 3, 3, 3], router: { r: 2, c: 2 }, emptyCell: { r: 3, c: 1 }, movementCells: [{ r: 2, c: 0 }, { r: 2, c: 1 }, { r: 3, c: 0 }, { r: 3, c: 1 }], scrambleMoves: 4 }) },
        { id: 'router-03', order: 3, name: 'Signal Weave', briefing: 'Route around the dead zone and fixed relay. A direct cyan-green join triggers a crossed-circuit fault.', size: { rows: 6, columns: 6 }, difficulty: 3, generationRules: { loopEdgeChance: .22, maxCrossingFraction: .12 }, modifiers: dualSystems({ splitColumns: [3, 3, 1, 3, 3, 3], router: { r: 2, c: 2 }, emptyCell: { r: 4, c: 1 }, movementCells: [{ r: 3, c: 0 }, { r: 3, c: 1 }, { r: 4, c: 0 }, { r: 4, c: 1 }], scrambleMoves: 5, obstacles: { enabled: true, count: 2, pattern: 'barrier' }, lockedPieces: { enabled: true, count: 1, minConnections: 2 } }) },
        { id: 'router-04', order: 4, name: 'Offset Gate', briefing: 'The crossover has shifted. Read the live colors, then settle the bay around the short barrier.', size: { rows: 6, columns: 6 }, difficulty: 4, generationRules: { loopEdgeChance: .24, maxCrossingFraction: .12 }, modifiers: dualSystems({ splitColumns: [4, 4, 4, 2, 4, 4], router: { r: 3, c: 3 }, emptyCell: { r: 2, c: 1 }, movementCells: [{ r: 1, c: 0 }, { r: 1, c: 1 }, { r: 2, c: 0 }, { r: 2, c: 1 }], scrambleMoves: 5, obstacles: { enabled: true, count: 2, pattern: 'barrier' }, lockedPieces: { enabled: true, count: 1, minConnections: 2 } }) },
        { id: 'router-05', order: 5, name: 'Pinned Current', briefing: 'One fixed relay commits part of the route. Use the bay to bring live power through the remaining channel.', size: { rows: 6, columns: 6 }, difficulty: 5, generationRules: { loopEdgeChance: .26, maxCrossingFraction: .13 }, modifiers: dualSystems({ splitColumns: [3, 3, 3, 1, 3, 3], router: { r: 3, c: 2 }, emptyCell: { r: 4, c: 4 }, movementCells: [{ r: 3, c: 4 }, { r: 3, c: 5 }, { r: 4, c: 4 }, { r: 4, c: 5 }], scrambleMoves: 6, lockedPieces: { enabled: true, count: 1, minConnections: 2 } }) },
        { id: 'router-06', order: 6, name: 'Narrow Passage', briefing: 'A longer dead zone compresses both routes. Keep the two live systems separate outside the router.', size: { rows: 6, columns: 6 }, difficulty: 6, generationRules: { loopEdgeChance: .28, maxCrossingFraction: .13 }, modifiers: dualSystems({ splitColumns: [4, 4, 2, 4, 4, 4], router: { r: 2, c: 3 }, emptyCell: { r: 4, c: 1 }, movementCells: [{ r: 3, c: 0 }, { r: 3, c: 1 }, { r: 4, c: 0 }, { r: 4, c: 1 }], scrambleMoves: 6, obstacles: { enabled: true, count: 3, pattern: 'barrier' }, lockedPieces: { enabled: true, count: 2, minConnections: 2 } }) },
        { id: 'router-07', order: 7, name: 'Double Weave', briefing: 'Two fixed routers let both live systems cross twice. Use the right-side bay to complete the insulated weave.', size: { rows: 6, columns: 6 }, difficulty: 7, generationRules: { loopEdgeChance: .30, maxCrossingFraction: .14 }, modifiers: dualSystems({ splitColumns: [3, 3, 1, 5, 3, 3], routers: [{ r: 2, c: 2 }, { r: 3, c: 3 }], emptyCell: { r: 2, c: 5 }, movementCells: [{ r: 2, c: 4 }, { r: 2, c: 5 }, { r: 3, c: 4 }, { r: 3, c: 5 }], scrambleMoves: 7, lockedPieces: { enabled: true, count: 2, minConnections: 2 } }) },
        { id: 'router-08', order: 8, name: 'Cross Pressure', briefing: 'The routers exchange positions while two fixed relays narrow your choices. Follow live power through both crossings.', size: { rows: 6, columns: 6 }, difficulty: 8, generationRules: { loopEdgeChance: .31, maxCrossingFraction: .14 }, modifiers: dualSystems({ splitColumns: [4, 4, 2, 4, 2, 3], routers: [{ r: 2, c: 3 }, { r: 3, c: 2 }], emptyCell: { r: 4, c: 5 }, movementCells: [{ r: 3, c: 4 }, { r: 3, c: 5 }, { r: 4, c: 4 }, { r: 4, c: 5 }], scrambleMoves: 7, lockedPieces: { enabled: true, count: 2, minConnections: 2 } }) },
        { id: 'router-09', order: 9, name: 'Relay Divide', briefing: 'Three locked relays hold the double weave. Resolve the movable approach without mixing colors in a normal conduit.', size: { rows: 6, columns: 6 }, difficulty: 9, generationRules: { loopEdgeChance: .32, maxCrossingFraction: .15 }, modifiers: dualSystems({ splitColumns: [3, 3, 1, 5, 3, 3], routers: [{ r: 2, c: 2 }, { r: 3, c: 3 }], emptyCell: { r: 4, c: 2 }, movementCells: [{ r: 4, c: 1 }, { r: 4, c: 2 }, { r: 5, c: 1 }, { r: 5, c: 2 }], scrambleMoves: 8, lockedPieces: { enabled: true, count: 3, minConnections: 2 } }) },
        { id: 'router-10', order: 10, name: 'Router Master', briefing: 'Seal the full dual grid: compact bay, barrier, fixed relays, live color, and two insulated crossovers.', size: { rows: 6, columns: 6 }, difficulty: 10, generationRules: { loopEdgeChance: .34, maxCrossingFraction: .15 }, modifiers: dualSystems({ splitColumns: [3, 3, 1, 5, 3, 3], routers: [{ r: 2, c: 2 }, { r: 3, c: 3 }], emptyCell: { r: 4, c: 2 }, movementCells: [{ r: 4, c: 1 }, { r: 4, c: 2 }, { r: 5, c: 1 }, { r: 5, c: 2 }], scrambleMoves: 9, obstacles: { enabled: true, count: 2, pattern: 'barrier' }, lockedPieces: { enabled: true, count: 3, minConnections: 2 } }) }
      ]
    },
    {
      id: 'command-array',
      name: 'Command Array',
      description: 'Programmable destination bolts make color assignment part of the route.',
      levels: [
        { id: 'command-01', order: 1, name: 'Signal Choice', briefing: 'Both bolts begin unassigned. Trace the two live systems through the insulated router, then switch each bolt to its matching color.', size: { rows: 6, columns: 6 }, difficulty: 1, generationRules: { loopEdgeChance: .18, maxCrossingFraction: .10 }, modifiers: commandSystems({ splitColumns: [3, 3, 1, 3, 3, 3], routers: [{ r: 2, c: 2 }], cyanSinks: [{ r: 0, c: 1, side: 'n', programmable: true }], greenSinks: [{ r: 0, c: 4, side: 'n', programmable: true }] }) },
        { id: 'command-02', order: 2, name: 'Split Decision', briefing: 'Both switched bolts begin neutral. Trace both insulated router channels, then assign one cyan and one green.', size: { rows: 6, columns: 6 }, difficulty: 2, generationRules: { loopEdgeChance: .22, maxCrossingFraction: .11 }, modifiers: commandSystems({ splitColumns: [3, 3, 3, 5, 3, 3], routers: [{ r: 3, c: 3 }], cyanSinks: [{ r: 0, c: 1, side: 'n', programmable: true }], greenSinks: [{ r: 0, c: 4, side: 'n', programmable: true }] }) },
        { id: 'command-03', order: 3, name: 'Perimeter Command', briefing: 'Switched bolts now sit above and beside the array. Assign their colors and carry both systems through the router.', size: { rows: 6, columns: 6 }, difficulty: 3, generationRules: { loopEdgeChance: .24, maxCrossingFraction: .12 }, modifiers: commandSystems({ splitColumns: [3, 3, 1, 3, 3, 3], routers: [{ r: 2, c: 2 }], cyanSinks: [{ r: 0, c: 1, side: 'n', programmable: true }, { r: 3, c: 0, side: 'w', programmable: true }], greenSinks: [{ r: 0, c: 4, side: 'n', programmable: true }, { r: 3, c: 5, side: 'e', programmable: true }] }) },
        { id: 'command-04', order: 4, name: 'Switch Bay', briefing: 'The compact gray bay returns beside the router. Restore its positions before trusting the four switched destinations.', size: { rows: 6, columns: 6 }, difficulty: 4, generationRules: { loopEdgeChance: .25, maxCrossingFraction: .12 }, modifiers: commandSystems({ splitColumns: [3, 3, 1, 3, 3, 3], routers: [{ r: 2, c: 2 }], emptyCell: { r: 4, c: 1 }, movementCells: [{ r: 3, c: 0 }, { r: 3, c: 1 }, { r: 4, c: 0 }, { r: 4, c: 1 }], scrambleMoves: 5, cyanSinks: [{ r: 0, c: 1, side: 'n', programmable: true }, { r: 2, c: 0, side: 'w', programmable: true }], greenSinks: [{ r: 0, c: 4, side: 'n', programmable: true }, { r: 3, c: 5, side: 'e', programmable: true }] }) },
        { id: 'command-05', order: 5, name: 'Double Command', briefing: 'Two routers carry the randomized systems through a deeper weave. Determine all four bolt colors from the live routes.', size: { rows: 6, columns: 6 }, difficulty: 5, generationRules: { loopEdgeChance: .27, maxCrossingFraction: .13 }, modifiers: commandSystems({ splitColumns: [3, 3, 1, 5, 3, 3], routers: [{ r: 2, c: 2 }, { r: 3, c: 3 }], cyanSinks: [{ r: 0, c: 1, side: 'n', programmable: true }, { r: 4, c: 0, side: 'w', programmable: true }], greenSinks: [{ r: 0, c: 4, side: 'n', programmable: true }, { r: 2, c: 5, side: 'e', programmable: true }] }) },
        { id: 'command-06', order: 6, name: 'Moving Weave', briefing: 'Resolve the right-side movement bay while both systems cross through two insulated routers.', size: { rows: 6, columns: 6 }, difficulty: 6, generationRules: { loopEdgeChance: .29, maxCrossingFraction: .14 }, modifiers: commandSystems({ splitColumns: [3, 3, 1, 5, 3, 3], routers: [{ r: 2, c: 2 }, { r: 3, c: 3 }], emptyCell: { r: 2, c: 5 }, movementCells: [{ r: 2, c: 4 }, { r: 2, c: 5 }, { r: 3, c: 4 }, { r: 3, c: 5 }], scrambleMoves: 6, cyanSinks: [{ r: 0, c: 1, side: 'n', programmable: true }, { r: 3, c: 0, side: 'w', programmable: true }], greenSinks: [{ r: 0, c: 4, side: 'n', programmable: true }, { r: 4, c: 5, side: 'e', programmable: true }] }) },
        { id: 'command-07', order: 7, name: 'Blocked Signals', briefing: 'A barrier compresses the double weave. Rebuild the bay, trace both colors, then commit the perimeter switches.', size: { rows: 6, columns: 6 }, difficulty: 7, generationRules: { loopEdgeChance: .30, maxCrossingFraction: .14 }, modifiers: commandSystems({ splitColumns: [4, 4, 2, 4, 2, 3], routers: [{ r: 2, c: 3 }, { r: 3, c: 2 }], emptyCell: { r: 4, c: 5 }, movementCells: [{ r: 3, c: 4 }, { r: 3, c: 5 }, { r: 4, c: 4 }, { r: 4, c: 5 }], scrambleMoves: 7, obstacles: { enabled: true, count: 2, pattern: 'barrier' }, cyanSinks: [{ r: 0, c: 1, side: 'n', programmable: true }, { r: 4, c: 0, side: 'w', programmable: true }], greenSinks: [{ r: 0, c: 4, side: 'n', programmable: true }, { r: 2, c: 5, side: 'e', programmable: true }] }) },
        { id: 'command-08', order: 8, name: 'Pinned Choice', briefing: 'Fixed relays pin both systems around the routers. Use those anchors to infer the switched destinations.', size: { rows: 6, columns: 6 }, difficulty: 8, generationRules: { loopEdgeChance: .31, maxCrossingFraction: .14 }, modifiers: commandSystems({ splitColumns: [3, 3, 1, 5, 3, 3], routers: [{ r: 2, c: 2 }, { r: 3, c: 3 }], emptyCell: { r: 4, c: 2 }, movementCells: [{ r: 4, c: 1 }, { r: 4, c: 2 }, { r: 5, c: 1 }, { r: 5, c: 2 }], scrambleMoves: 7, lockedPieces: { enabled: true, count: 2, minConnections: 2 }, cyanSinks: [{ r: 0, c: 1, side: 'n', programmable: true }, { r: 2, c: 0, side: 'w', programmable: true }], greenSinks: [{ r: 0, c: 4, side: 'n', programmable: true }, { r: 4, c: 5, side: 'e', programmable: true }] }) },
        { id: 'command-09', order: 9, name: 'Six Commands', briefing: 'Six neutral bolts surround the array. Separate the live systems through barriers, routers, fixed relays, and the moving bay.', size: { rows: 6, columns: 6 }, difficulty: 9, generationRules: { loopEdgeChance: .32, maxCrossingFraction: .15 }, modifiers: commandSystems({ splitColumns: [4, 4, 2, 4, 2, 3], routers: [{ r: 2, c: 3 }, { r: 3, c: 2 }], emptyCell: { r: 4, c: 5 }, movementCells: [{ r: 3, c: 4 }, { r: 3, c: 5 }, { r: 4, c: 4 }, { r: 4, c: 5 }], scrambleMoves: 8, obstacles: { enabled: true, count: 2, pattern: 'barrier' }, lockedPieces: { enabled: true, count: 2, minConnections: 2 }, cyanSinks: [{ r: 0, c: 1, side: 'n', programmable: true }, { r: 2, c: 0, side: 'w', programmable: true }, { r: 4, c: 0, side: 'w', programmable: true }], greenSinks: [{ r: 0, c: 4, side: 'n', programmable: true }, { r: 1, c: 5, side: 'e', programmable: true }, { r: 2, c: 5, side: 'e', programmable: true }] }) },
        { id: 'command-10', order: 10, name: 'Command Master', briefing: 'Master the complete array: six switched bolts, double routers, a constrained bay, barriers, and fixed relays.', size: { rows: 6, columns: 6 }, difficulty: 10, generationRules: { loopEdgeChance: .34, maxCrossingFraction: .15 }, modifiers: commandSystems({ splitColumns: [3, 3, 1, 5, 3, 3], routers: [{ r: 2, c: 2 }, { r: 3, c: 3 }], emptyCell: { r: 4, c: 2 }, movementCells: [{ r: 4, c: 1 }, { r: 4, c: 2 }, { r: 5, c: 1 }, { r: 5, c: 2 }], scrambleMoves: 9, obstacles: { enabled: true, count: 2, pattern: 'barrier' }, lockedPieces: { enabled: true, count: 3, minConnections: 2 }, cyanSinks: [{ r: 0, c: 1, side: 'n', programmable: true }, { r: 1, c: 0, side: 'w', programmable: true }, { r: 4, c: 0, side: 'w', programmable: true }], greenSinks: [{ r: 0, c: 4, side: 'n', programmable: true }, { r: 1, c: 5, side: 'e', programmable: true }, { r: 4, c: 5, side: 'e', programmable: true }] }) }
      ]
    }
  ];

  const PROGRESSION_OVERRIDES = Object.freeze({
    'training-array': {
      6: { rows: 6, generationRules: { minBranchFraction: .45, maxCorridorLength: 5 } },
      7: { rows: 6, generationRules: { minBranchFraction: .47, maxCorridorLength: 5 } },
      8: { rows: 7, generationRules: { minBranchFraction: .49, maxCorridorLength: 4 } },
      9: { rows: 7, generationRules: { minBranchFraction: .51, maxCorridorLength: 4 } },
      10: { rows: 8, generationRules: { minBranchFraction: .54, maxCorridorLength: 4 } }
    },
    'sliding-array': {
      6: { rows: 6, generationRules: { minBranchFraction: .46, maxCorridorLength: 5 } },
      7: { rows: 6, generationRules: { minBranchFraction: .48, maxCorridorLength: 5 } },
      8: { rows: 6, generationRules: { minBranchFraction: .50, maxCorridorLength: 4 } },
      9: { rows: 7, generationRules: { minBranchFraction: .51, maxCorridorLength: 4 } },
      10: { rows: 7, generationRules: { minBranchFraction: .54, maxCorridorLength: 4 } }
    },
    'obstacle-array': {
      6: { rows: 6, generationRules: { maxCorridorLength: 4 } },
      7: { rows: 7, generationRules: { maxCorridorLength: 4 } },
      8: { rows: 7, generationRules: { maxCorridorLength: 4 } },
      9: { rows: 7, generationRules: { maxCorridorLength: 4 } },
      10: { rows: 8, generationRules: { maxCorridorLength: 4 } }
    },
    'router-array': {
      6: { rows: 6, generationRules: { maxCorridorLength: 5 } },
      7: { rows: 6, generationRules: { maxCorridorLength: 5 } },
      8: { rows: 7, generationRules: { maxCorridorLength: 4 } },
      9: { rows: 7, generationRules: { maxCorridorLength: 4 } },
      10: { rows: 8, generationRules: { maxCorridorLength: 4 } }
    },
    'command-array': {
      6: { rows: 6, generationRules: { maxCorridorLength: 5 } },
      7: { rows: 7, generationRules: { maxCorridorLength: 4 } },
      8: { rows: 7, generationRules: { maxCorridorLength: 4 } },
      9: { rows: 7, generationRules: { maxCorridorLength: 4 } },
      10: { rows: 8, generationRules: { maxCorridorLength: 4 } }
    }
  });

  WORLDS.forEach(world => {
    world.levels.forEach(level => {
      const override = PROGRESSION_OVERRIDES[world.id] && PROGRESSION_OVERRIDES[world.id][level.order];
      if (!override) return;
      level.size = { rows: override.rows, columns: level.size.columns };
      level.generationRules = { ...level.generationRules, ...override.generationRules };
    });
  });

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
