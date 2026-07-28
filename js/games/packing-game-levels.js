/* Packing Game campaign catalogue. Recipes configure generated puzzles. */
(function () {
  'use strict';

  function classic(id, order, name, briefing, pieceCount, minHoles, maxHoles, maxDimension) {
    const mechanics = PackingGameMechanics.normalize({ board: { topology: 'rectangle-holes', minHoles, maxHoles } });
    return {
      id, order, name, briefing, difficulty: order,
      generator: { pieceCount, minHoles, maxHoles, maxDimension, verifySolutions: false },
      mechanics
    };
  }

  function future(id, order, name, briefing, generator, mechanics) {
    return { id, order, name, briefing, difficulty: order, generator, mechanics: PackingGameMechanics.normalize(mechanics) };
  }

  const WORLDS = [
    {
      id: 'classic-packing',
      name: 'Classic Packing',
      displayName: 'Space',
      description: 'Fill a stable cargo grid while packing around its blocked holes.',
      available: true,
      levels: [
        { ...classic('pack-01', 1, 'First Fit', 'Fill a clean rectangular cargo grid.', 4, 0, 3, 7),
          generator: { pieceCount: 4, pieceIndexList: [0, 1, 2, 3], minHoles: 0, maxHoles: 3, maxDimension: 7, verifySolutions: false } },
        classic('pack-02', 2, 'Cargo Bay', 'One blocked cell changes how the surrounding pieces fit.', 5, 1, 3, 8),
        classic('pack-03', 3, 'Moon Pocket', 'Pack around a small cluster of blocked cells.', 6, 2, 5, 8),
        classic('pack-04', 4, 'Deep Orbit', 'More pieces must negotiate the same fixed grid.', 6, 3, 7, 8),
        classic('pack-05', 5, 'Asteroid Gap', 'Read the holes before filling the open lanes.', 7, 4, 9, 9),
        classic('pack-06', 6, 'Starboard Fit', 'Eight pieces make every early placement matter.', 8, 5, 11, 9),
        classic('pack-07', 7, 'Meteor Field', 'Use the blocked asteroid cells as anchors.', 8, 6, 13, 9),
        classic('pack-08', 8, 'Gravity Grid', 'Nine pieces create more relationships without changing the rules.', 9, 7, 15, 10),
        classic('pack-09', 9, 'Ancient Satellite', 'Settle a full ten-piece cargo grid.', 10, 8, 18, 10),
        classic('pack-10', 10, 'Space Master', 'Master ten pieces around the densest hole pattern.', 10, 10, 22, 10)
      ]
    },
    {
      id: 'linked-pieces',
      name: 'Linked Pieces',
      displayName: 'Jungle',
      description: 'Matching symbols must finish with their pieces sharing a full border.',
      available: true,
      levels: [
        future('links-01', 1, 'First Contact', 'Make the two one-dot squares share an edge.',
          { pieceCount: 10, minHoles: 0, maxHoles: 2, maxDimension: 10, linkCount: 1, verifySolutions: false },
          { board: { minHoles: 0, maxHoles: 2 }, links: { enabled: true, count: 1 } }),
        future('links-02', 2, 'Twin Signals', 'Complete two independent domino contacts.',
          { pieceCount: 10, minHoles: 1, maxHoles: 3, maxDimension: 10, linkCount: 2, verifySolutions: false },
          { board: { minHoles: 1, maxHoles: 3 }, links: { enabled: true, count: 2 } }),
        future('links-03', 3, 'Three Pairs', 'Match three independent dotted edges.',
          { pieceCount: 10, minHoles: 2, maxHoles: 4, maxDimension: 10, linkCount: 3, verifySolutions: false },
          { board: { minHoles: 2, maxHoles: 4 }, links: { enabled: true, count: 3 } }),
        future('links-04', 4, 'Dense Canopy', 'Hold three pairs together around a tighter board.',
          { pieceCount: 10, minHoles: 3, maxHoles: 5, maxDimension: 10, linkCount: 3, verifySolutions: false },
          { board: { minHoles: 3, maxHoles: 5 }, links: { enabled: true, count: 3 } }),
        future('links-05', 5, 'First Chain', 'One piece carries two dotted obligations and joins a three-piece chain.',
          { pieceCount: 10, minHoles: 2, maxHoles: 4, maxDimension: 10, linkCount: 2, linkSharedCount: 2, verifySolutions: false },
          { board: { minHoles: 2, maxHoles: 4 }, links: { enabled: true, count: 2, sharedCount: 2 } }),
        future('links-06', 6, 'Chain and Pair', 'Build one three-piece chain plus an independent pair.',
          { pieceCount: 10, minHoles: 3, maxHoles: 5, maxDimension: 10, linkCount: 3, linkSharedCount: 2, verifySolutions: false },
          { board: { minHoles: 3, maxHoles: 5 }, links: { enabled: true, count: 3, sharedCount: 2 } }),
        future('links-07', 7, 'Long Vine', 'Extend a four-piece dotted chain across the grid.',
          { pieceCount: 10, minHoles: 3, maxHoles: 5, maxDimension: 10, linkCount: 3, linkSharedCount: 3, verifySolutions: false },
          { board: { minHoles: 3, maxHoles: 5 }, links: { enabled: true, count: 3, sharedCount: 3 } }),
        future('links-08', 8, 'Branch Line', 'Balance a long chain and a separate matching pair.',
          { pieceCount: 10, minHoles: 4, maxHoles: 6, maxDimension: 10, linkCount: 4, linkSharedCount: 3, verifySolutions: false },
          { board: { minHoles: 4, maxHoles: 6 }, links: { enabled: true, count: 4, sharedCount: 3 } }),
        future('links-09', 9, 'Five Signals', 'Resolve five marked contacts with one shared chain.',
          { pieceCount: 10, minHoles: 4, maxHoles: 6, maxDimension: 10, linkCount: 5, linkSharedCount: 2, verifySolutions: false },
          { board: { minHoles: 4, maxHoles: 6 }, links: { enabled: true, count: 5, sharedCount: 2 } }),
        future('links-10', 10, 'Jungle Network', 'Master a four-piece chain and two independent pairs.',
          { pieceCount: 10, minHoles: 4, maxHoles: 6, maxDimension: 10, linkCount: 5, linkSharedCount: 3, verifySolutions: false },
          { board: { minHoles: 4, maxHoles: 6 }, links: { enabled: true, count: 5, sharedCount: 3 } })
      ]
    },
    {
      id: 'overlap-nodes',
      name: 'Overlap Nodes',
      displayName: 'Ice',
      description: 'Keep the touching rules and stack two marked piece cells on every double node.',
      available: true,
      levels: [
        future('overlap-01', 1, 'Double Point', 'Place one square from each of two different pieces on the glowing 2 node.',
          { pieceCount: 10, minHoles: 0, maxHoles: 4, maxDimension: 10, linkCount: 1, overlapCount: 1, verifySolutions: false },
          { board: { minHoles: 0, maxHoles: 4 }, links: { enabled: true, count: 1 }, overlaps: { enabled: true, count: 1 } }),
        future('overlap-02', 2, 'Crossing Paths', 'Complete two linked pairs while building through one overlap node.',
          { pieceCount: 10, minHoles: 1, maxHoles: 4, maxDimension: 10, linkCount: 2, overlapCount: 1, verifySolutions: false },
          { board: { minHoles: 1, maxHoles: 4 }, links: { enabled: true, count: 2 }, overlaps: { enabled: true, count: 1 } }),
        future('overlap-03', 3, 'Frozen Stack', 'Resolve two double nodes without breaking the required contacts.',
          { pieceCount: 10, minHoles: 2, maxHoles: 5, maxDimension: 10, linkCount: 2, overlapCount: 2, verifySolutions: false },
          { board: { minHoles: 2, maxHoles: 5 }, links: { enabled: true, count: 2 }, overlaps: { enabled: true, count: 2 } }),
        future('overlap-04', 4, 'Cold Junction', 'Hold three dotted pairs around one double node.',
          { pieceCount: 10, minHoles: 2, maxHoles: 4, maxDimension: 10, linkCount: 3, overlapCount: 1, verifySolutions: false },
          { board: { minHoles: 2, maxHoles: 4 }, links: { enabled: true, count: 3 }, overlaps: { enabled: true, count: 1 } }),
        future('overlap-05', 5, 'Linked Ice', 'Build the first shared dotted chain through an overlap puzzle.',
          { pieceCount: 10, minHoles: 2, maxHoles: 4, maxDimension: 10, linkCount: 2, linkSharedCount: 2, overlapCount: 1, verifySolutions: false },
          { board: { minHoles: 2, maxHoles: 4 }, links: { enabled: true, count: 2, sharedCount: 2 }, overlaps: { enabled: true, count: 1 } }),
        future('overlap-06', 6, 'Twin Pressure', 'Resolve a shared chain and two double nodes.',
          { pieceCount: 10, minHoles: 3, maxHoles: 5, maxDimension: 10, linkCount: 3, linkSharedCount: 2, overlapCount: 2, verifySolutions: false },
          { board: { minHoles: 3, maxHoles: 5 }, links: { enabled: true, count: 3, sharedCount: 2 }, overlaps: { enabled: true, count: 2 } }),
        future('overlap-07', 7, 'Ice Lattice', 'Balance four contacts and two transparent overlap cells.',
          { pieceCount: 10, minHoles: 3, maxHoles: 5, maxDimension: 10, linkCount: 4, linkSharedCount: 2, overlapCount: 2, verifySolutions: false },
          { board: { minHoles: 3, maxHoles: 5 }, links: { enabled: true, count: 4, sharedCount: 2 }, overlaps: { enabled: true, count: 2 } }),
        future('overlap-08', 8, 'Glacier Chain', 'Carry a four-piece chain across two double nodes.',
          { pieceCount: 10, minHoles: 4, maxHoles: 6, maxDimension: 10, linkCount: 4, linkSharedCount: 3, overlapCount: 2, verifySolutions: false },
          { board: { minHoles: 4, maxHoles: 6 }, links: { enabled: true, count: 4, sharedCount: 3 }, overlaps: { enabled: true, count: 2 } }),
        future('overlap-09', 9, 'Triple Frost', 'Complete three overlap nodes with a shared dotted chain.',
          { pieceCount: 10, minHoles: 4, maxHoles: 6, maxDimension: 10, linkCount: 4, linkSharedCount: 2, overlapCount: 3, verifySolutions: false },
          { board: { minHoles: 4, maxHoles: 6 }, links: { enabled: true, count: 4, sharedCount: 2 }, overlaps: { enabled: true, count: 3 } }),
        future('overlap-10', 10, 'Frozen Master', 'Master five contacts, a four-piece chain, and three overlap nodes.',
          { pieceCount: 10, minHoles: 4, maxHoles: 6, maxDimension: 10, linkCount: 5, linkSharedCount: 3, overlapCount: 3, verifySolutions: false },
          { board: { minHoles: 4, maxHoles: 6 }, links: { enabled: true, count: 5, sharedCount: 3 }, overlaps: { enabled: true, count: 3 } })
      ]
    },
    {
      id: 'utility-pieces',
      name: 'Anchored Pieces',
      displayName: 'Ocean',
      description: 'Pinned pieces rotate around fixed squares; later pins turn together.',
      available: true,
      levels: [
        future('anchor-01', 1, 'First Pin', 'Rotate the pinned piece around its gold anchor, then pack around it.',
          { pieceCount: 10, minHoles: 1, maxHoles: 4, maxDimension: 10, linkCount: 1, overlapCount: 1, anchorCount: 1, verifySolutions: false },
          { board: { minHoles: 1, maxHoles: 4 }, links: { enabled: true, count: 1 }, overlaps: { enabled: true, count: 1 }, anchors: { enabled: true, count: 1 } }),
        future('anchor-02', 2, 'Fixed Current', 'Find the pinned direction while preserving two dotted contacts and two overlaps.',
          { pieceCount: 10, minHoles: 2, maxHoles: 5, maxDimension: 10, linkCount: 2, overlapCount: 2, anchorCount: 1, verifySolutions: false },
          { board: { minHoles: 2, maxHoles: 5 }, links: { enabled: true, count: 2 }, overlaps: { enabled: true, count: 2 }, anchors: { enabled: true, count: 1 } }),
        future('anchor-03', 3, 'Twin Anchors', 'Coordinate two pinned pieces with a shared domino chain.',
          { pieceCount: 10, minHoles: 3, maxHoles: 6, maxDimension: 10, linkCount: 3, linkSharedCount: 2, overlapCount: 2, anchorCount: 2, verifySolutions: false },
          { board: { minHoles: 3, maxHoles: 6 }, links: { enabled: true, count: 3, sharedCount: 2 }, overlaps: { enabled: true, count: 2 }, anchors: { enabled: true, count: 2 } }),
        future('anchor-04', 4, 'Cross Current', 'The new five-square plus constrains the open water around two pins.',
          { pieceIndexList: [0,1,2,3,4,5,6,7,8,9,10], minHoles: 1, maxHoles: 12, maxDimension: 11, linkCount: 1, overlapCount: 1, anchorCount: 2, verifySolutions: false },
          { board: { minHoles: 1, maxHoles: 12 }, links: { enabled: true, count: 1 }, overlaps: { enabled: true, count: 1 }, anchors: { enabled: true, count: 2 } }),
        future('anchor-05', 5, 'Long Stem', 'Add the five-square capital T and coordinate three independent pins.',
          { pieceIndexList: [0,1,2,3,4,5,6,7,8,9,10,11], minHoles: 2, maxHoles: 12, maxDimension: 11, linkCount: 2, overlapCount: 1, anchorCount: 3, verifySolutions: false },
          { board: { minHoles: 2, maxHoles: 12 }, links: { enabled: true, count: 2 }, overlaps: { enabled: true, count: 1 }, anchors: { enabled: true, count: 3 } }),
        future('anchor-06', 6, 'Coupled Tide', 'The two cyan-ringed anchors rotate together.',
          { pieceCount: 12, minHoles: 2, maxHoles: 9, maxDimension: 11, linkCount: 3, overlapCount: 2, anchorCount: 2, anchorGroupCount: 1, verifySolutions: false },
          { board: { minHoles: 2, maxHoles: 9 }, links: { enabled: true, count: 3 }, overlaps: { enabled: true, count: 2 }, anchors: { enabled: true, count: 2, linkedGroups: 1 } }),
        future('anchor-07', 7, 'Towed Anchor', 'Solve one linked pair while choosing an independent pin direction.',
          { pieceCount: 12, minHoles: 3, maxHoles: 9, maxDimension: 11, linkCount: 3, overlapCount: 2, anchorCount: 3, anchorGroupCount: 1, verifySolutions: false },
          { board: { minHoles: 3, maxHoles: 9 }, links: { enabled: true, count: 3 }, overlaps: { enabled: true, count: 2 }, anchors: { enabled: true, count: 3, linkedGroups: 1 } }),
        future('anchor-08', 8, 'Twin Mechanisms', 'Two separate linked pairs turn through the same crowded board.',
          { pieceCount: 12, minHoles: 3, maxHoles: 8, maxDimension: 11, linkCount: 4, overlapCount: 2, anchorCount: 4, anchorGroupCount: 2, verifySolutions: false },
          { board: { minHoles: 3, maxHoles: 8 }, links: { enabled: true, count: 4 }, overlaps: { enabled: true, count: 2 }, anchors: { enabled: true, count: 4, linkedGroups: 2 } }),
        future('anchor-09', 9, 'Three in Tow', 'A linked pair and two independent anchors restrict every open lane.',
          { pieceCount: 12, minHoles: 4, maxHoles: 9, maxDimension: 11, linkCount: 4, linkSharedCount: 2, overlapCount: 3, anchorCount: 4, anchorGroupCount: 1, verifySolutions: false },
          { board: { minHoles: 4, maxHoles: 9 }, links: { enabled: true, count: 4, sharedCount: 2 }, overlaps: { enabled: true, count: 3 }, anchors: { enabled: true, count: 4, linkedGroups: 1 } }),
        future('anchor-10', 10, 'Ocean Machine', 'Master two linked mechanisms, the advanced shapes, dots, and overlaps.',
          { pieceCount: 12, minHoles: 4, maxHoles: 9, maxDimension: 11, linkCount: 5, linkSharedCount: 3, overlapCount: 3, anchorCount: 4, anchorGroupCount: 2, verifySolutions: false },
          { board: { minHoles: 4, maxHoles: 9 }, links: { enabled: true, count: 5, sharedCount: 3 }, overlaps: { enabled: true, count: 3 }, anchors: { enabled: true, count: 4, linkedGroups: 2 } })
      ]
    },
    {
      id: 'expanding-containers',
      name: 'Layered Chambers',
      displayName: 'Castle',
      description: 'Fill and lock Layer 1, then use the reserved pieces to build the opened chamber.',
      available: true,
      levels: [
        future('zone-01', 1, 'Second Layer', 'Fill Layer 1, then use the reserved piece to build the opened chamber.',
          { pieceCount: 11, overlapZoneSize: 3, minHoles: 1, maxHoles: 6, maxDimension: 11, linkCount: 1, anchorCount: 1, verifySolutions: false },
          { board: { minHoles: 1, maxHoles: 6 }, links: { enabled: true, count: 1 }, anchors: { enabled: true, count: 1 }, overlapZone: { enabled: true, minCells: 3, maxCells: 3 } }),
        future('zone-02', 2, 'Glow Chamber', 'Budget a four-cell piece for the chamber before Layer 1 locks.',
          { pieceCount: 11, overlapZoneSize: 4, minHoles: 1, maxHoles: 7, maxDimension: 11, linkCount: 2, anchorCount: 1, verifySolutions: false },
          { board: { minHoles: 1, maxHoles: 7 }, links: { enabled: true, count: 2 }, anchors: { enabled: true, count: 1 }, overlapZone: { enabled: true, minCells: 4, maxCells: 4 } }),
        future('zone-03', 3, 'Inner Keep', 'Preserve the right five-cell piece for the inner keep.',
          { pieceCount: 11, overlapZoneSize: 5, minHoles: 2, maxHoles: 8, maxDimension: 11, linkCount: 2, anchorCount: 2, verifySolutions: false },
          { board: { minHoles: 2, maxHoles: 8 }, links: { enabled: true, count: 2 }, anchors: { enabled: true, count: 2 }, overlapZone: { enabled: true, minCells: 5, maxCells: 5 } }),
        future('zone-04', 4, 'Shared Hall', 'Use twelve pieces to complete a six-cell second layer.',
          { pieceCount: 12, overlapZoneSize: 6, minHoles: 2, maxHoles: 8, maxDimension: 11, linkCount: 3, anchorCount: 2, verifySolutions: false },
          { board: { minHoles: 2, maxHoles: 8 }, links: { enabled: true, count: 3 }, anchors: { enabled: true, count: 2 }, overlapZone: { enabled: true, minCells: 6, maxCells: 6 } }),
        future('zone-05', 5, 'Castle Crossing', 'Dots cross between single- and double-covered territory.',
          { pieceCount: 12, overlapZoneSize: 6, minHoles: 3, maxHoles: 9, maxDimension: 11, linkCount: 3, linkSharedCount: 2, anchorCount: 3, verifySolutions: false },
          { board: { minHoles: 3, maxHoles: 9 }, links: { enabled: true, count: 3, sharedCount: 2 }, anchors: { enabled: true, count: 3 }, overlapZone: { enabled: true, minCells: 6, maxCells: 6 } }),
        future('zone-06', 6, 'Coupled Chamber', 'A linked anchor pair turns beside a seven-cell double zone.',
          { pieceCount: 12, overlapZoneSize: 7, minHoles: 3, maxHoles: 9, maxDimension: 11, linkCount: 3, anchorCount: 2, anchorGroupCount: 1, verifySolutions: false },
          { board: { minHoles: 3, maxHoles: 9 }, links: { enabled: true, count: 3 }, anchors: { enabled: true, count: 2, linkedGroups: 1 }, overlapZone: { enabled: true, minCells: 7, maxCells: 7 } }),
        future('zone-07', 7, 'Rune District', 'Coordinate a linked pair and an independent anchor across eight doubled cells.',
          { pieceCount: 12, overlapZoneSize: 8, minHoles: 3, maxHoles: 10, maxDimension: 11, linkCount: 4, anchorCount: 3, anchorGroupCount: 1, verifySolutions: false },
          { board: { minHoles: 3, maxHoles: 10 }, links: { enabled: true, count: 4 }, anchors: { enabled: true, count: 3, linkedGroups: 1 }, overlapZone: { enabled: true, minCells: 8, maxCells: 8 } }),
        future('zone-08', 8, 'Double Courtyard', 'Divide twelve pieces around an irregular nine-cell double zone.',
          { pieceCount: 12, overlapZoneSize: 9, minHoles: 4, maxHoles: 10, maxDimension: 11, linkCount: 4, linkSharedCount: 2, anchorCount: 3, anchorGroupCount: 1, verifySolutions: false },
          { board: { minHoles: 4, maxHoles: 10 }, links: { enabled: true, count: 4, sharedCount: 2 }, anchors: { enabled: true, count: 3, linkedGroups: 1 }, overlapZone: { enabled: true, minCells: 9, maxCells: 9 } }),
        future('zone-09', 9, 'Two-Layer Tower', 'Resolve ten doubled cells around two linked mechanisms.',
          { pieceCount: 12, overlapZoneSize: 10, minHoles: 4, maxHoles: 11, maxDimension: 11, linkCount: 4, anchorCount: 4, anchorGroupCount: 2, verifySolutions: false },
          { board: { minHoles: 4, maxHoles: 11 }, links: { enabled: true, count: 4 }, anchors: { enabled: true, count: 4, linkedGroups: 2 }, overlapZone: { enabled: true, minCells: 10, maxCells: 10 } }),
        future('zone-10', 10, 'Castle Master', 'Master every piece across the largest double-coverage zone.',
          { pieceCount: 12, overlapZoneSize: 11, minHoles: 4, maxHoles: 12, maxDimension: 11, linkCount: 5, linkSharedCount: 3, anchorCount: 4, anchorGroupCount: 2, verifySolutions: false },
          { board: { minHoles: 4, maxHoles: 12 }, links: { enabled: true, count: 5, sharedCount: 3 }, anchors: { enabled: true, count: 4, linkedGroups: 2 }, overlapZone: { enabled: true, minCells: 11, maxCells: 11 } })
      ]
    }
  ];

  const levels = WORLDS.flatMap(world => world.levels.map(level => Object.freeze({ ...level, worldId: world.id })));
  const byId = new Map(levels.map(level => [level.id, level]));

  window.PackingGameLevels = Object.freeze({
    worlds: Object.freeze(WORLDS),
    all: Object.freeze(levels),
    firstId: levels[0].id,
    get(id) { return byId.get(id) || null; },
    next(id) { const index = levels.findIndex(level => level.id === id); return index >= 0 ? levels[index + 1] || null : null; }
  });
})();
