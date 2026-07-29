/* Standalone Packing Game polyomino engine — Kanoodle/dissection-puzzle style.
   Owns no campaign, presentation, or persistent state. A fixed piece library is
   constructively packed into a region (guaranteeing at least one solution by
   construction, same principle as the Abandoned Cache's spanning-tree lattice),
   then the exact number of valid tilings is counted by backtracking search;
   boards outside the requested solution-count band are rejected and regenerated
   (same reject-and-regenerate methodology that fixed the cache's difficulty
   consistency). Consuming missions host this in their own SVG stage and reskin
   the presentation. This module never touches persistent save state. */
(function () {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';

  // ---- Piece library --------------------------------------------------------
  // Canonical shapes as (row, col) offsets. Rotation is handled generically by
  // orientations(); the starting orientation drawn here is arbitrary.
  const PIECE_LIBRARY = [
    { id: 'domino', cells: [[0, 0], [1, 0]] },
    { id: 'i-tromino', cells: [[0, 0], [1, 0], [2, 0]] },
    { id: 'l-tromino', cells: [[0, 0], [1, 0], [1, 1]] },
    { id: 'square', cells: [[0, 0], [0, 1], [1, 0], [1, 1]] },
    { id: 'i-tetromino', cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    { id: 'l-tetromino', cells: [[0, 0], [1, 0], [2, 0], [2, 1]] },
    { id: 's-tetromino', cells: [[0, 1], [0, 2], [1, 0], [1, 1]] },
    { id: 't-tetromino', cells: [[0, 0], [0, 1], [0, 2], [1, 1]] },
    { id: 'u-pentomino', cells: [[0, 0], [0, 2], [1, 0], [1, 1], [1, 2]] },
    { id: 'p-pentomino', cells: [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0]] },
    { id: 'plus-pentomino', cells: [[0, 1], [1, 0], [1, 1], [1, 2], [2, 1]] },
    { id: 't-pentomino', cells: [[0, 0], [0, 1], [0, 2], [1, 1], [2, 1]] }
  ];

  const PIECE_COLORS = Object.freeze({
    'domino': '#ff9d24',       // orange
    'i-tromino': '#438cff',    // blue
    'l-tromino': '#ff4d5f',    // crimson
    'square': '#b7f34a',       // lime
    'i-tetromino': '#16d9f3',  // cyan
    'l-tetromino': '#ffe21f',  // yellow
    's-tetromino': '#19e696',  // emerald
    't-tetromino': '#bc63ff',  // purple
    'u-pentomino': '#765cff',  // indigo
    'p-pentomino': '#ff4fc4',  // magenta
    'plus-pentomino': '#28ed68', // green
    't-pentomino': '#ff5c91'   // rose
  });

  // ---- Geometry helpers -------------------------------------------------------

  function key(r, c) { return `${r},${c}`; }

  function norm(cells) {
    const minR = Math.min(...cells.map(p => p[0]));
    const minC = Math.min(...cells.map(p => p[1]));
    return cells.map(([r, c]) => [r - minR, c - minC]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }

  function rotate90(cells) {
    const rot = cells.map(([r, c]) => [c, -r]);
    return norm(rot);
  }

  function sameShape(a, b) {
    return a.length === b.length && a.every(([r, c], i) => r === b[i][0] && c === b[i][1]);
  }

  // All unique rotations of a piece (symmetric pieces, e.g. the square, dedupe
  // to fewer than 4 — this is intentional, matching real physical rotation).
  function normalizeDetailed(cells) {
    const minR = Math.min(...cells.map(p => p.r));
    const minC = Math.min(...cells.map(p => p.c));
    return cells.map(p => ({ r: p.r - minR, c: p.c - minC, source: p.source }))
      .sort((a, b) => a.r - b.r || a.c - b.c);
  }

  function orientationDetails(cells) {
    let cur = normalizeDetailed(cells.map(([r, c], source) => ({ r, c, source })));
    const out = [cur];
    for (let i = 0; i < 3; i++) {
      cur = normalizeDetailed(cur.map(p => ({ r: p.c, c: -p.r, source: p.source })));
      const shape = cur.map(p => [p.r, p.c]);
      if (!out.some(o => sameShape(o.map(p => [p.r, p.c]), shape))) out.push(cur);
    }
    return out;
  }

  function physicalRotationDetails(cells) {
    let cur = normalizeDetailed(cells.map(([r, c], source) => ({ r, c, source })));
    const out = [cur];
    for (let i = 0; i < 3; i++) {
      cur = normalizeDetailed(cur.map(p => ({ r: p.c, c: -p.r, source: p.source })));
      out.push(cur);
    }
    return out;
  }

  const ORIENTATION_DETAIL_CACHE = PIECE_LIBRARY.map(p => orientationDetails(p.cells));
  const ORIENTATION_CACHE = ORIENTATION_DETAIL_CACHE.map(list => list.map(detail => detail.map(p => [p.r, p.c])));
  // Geometry-equivalent rotations stay deduplicated for the solver, while
  // decorated pieces retain four physical turns so their dots move with them.
  const PHYSICAL_ROTATION_DETAIL_CACHE = PIECE_LIBRARY.map(p => physicalRotationDetails(p.cells));
  const PHYSICAL_ROTATION_TO_ORIENT = PHYSICAL_ROTATION_DETAIL_CACHE.map((turns, pieceIndex) =>
    turns.map(turn => ORIENTATION_CACHE[pieceIndex].findIndex(orient =>
      sameShape(orient, turn.map(cell => [cell.r, cell.c])))));

  function orientations(cells) {
    return orientationDetails(cells).map(detail => detail.map(p => [p.r, p.c]));
  }

  // ---- Exact solution counter (backtracking) ---------------------------------
  // Counts every way the given pieces (used exactly once each) can tile the
  // given region with zero gaps and zero overlaps.
  //
  // Two independent safety valves, because they bound different things:
  // - `solutionCap` stops once MORE than that many solutions are found — we only
  //   need to know a board exceeds the target band, not its exact count beyond.
  // - `nodeBudget` bounds total search WORK regardless of how many solutions
  //   have been found so far. A region that is merely hard to tile at all (many
  //   dead-end branches before the first solution, or even before determining
  //   there are none) can blow up the search tree with the solution cap never
  //   triggering even once — this was a real bug caught by exhaustive testing,
  //   not a hypothetical. Exceeding the node budget marks the result `exceeded`
  //   so the caller treats it as "unknown, reject" rather than trusting a
  //   partial count.
  function solveCount(regionCells, pieceIndexList, solutionCap, nodeBudget) {
    const region = new Set(regionCells.map(([r, c]) => key(r, c)));
    const pieceOrients = pieceIndexList.map(idx => ORIENTATION_CACHE[idx]);
    const used = new Array(pieceIndexList.length).fill(false);
    const filled = new Set();
    const budget = nodeBudget || 60000;
    let count = 0, nodes = 0, exceeded = false;

    function firstEmpty() {
      for (const k of region) if (!filled.has(k)) return k;
      return null;
    }

    function tryPlace() {
      if (exceeded) return;
      nodes += 1;
      if (nodes > budget) { exceeded = true; return; }
      if (solutionCap && count > solutionCap) return;
      const fe = firstEmpty();
      if (!fe) { count += 1; return; }
      const [er, ec] = fe.split(',').map(Number);
      for (let pi = 0; pi < pieceIndexList.length && !exceeded; pi++) {
        if (used[pi] || (solutionCap && count > solutionCap)) continue;
        for (const orient of pieceOrients[pi]) {
          for (const [ar, ac] of orient) {
            if (exceeded) return;
            const dr = er - ar, dc = ec - ac;
            const placed = orient.map(([r, c]) => [r + dr, c + dc]);
            const keys = placed.map(([r, c]) => key(r, c));
            if (!keys.includes(fe)) continue;
            if (keys.some(k => !region.has(k) || filled.has(k))) continue;
            keys.forEach(k => filled.add(k));
            used[pi] = true;
            tryPlace();
            used[pi] = false;
            keys.forEach(k => filled.delete(k));
          }
        }
      }
    }
    tryPlace();
    return { count, exceeded, nodes };
  }

  // ---- Constructive region generation ----------------------------------------
  // Packs the chosen pieces together from empty space (each new piece placed
  // touching the growing cluster), so the union of their cells is guaranteed
  // tileable by construction — mirrors the cache's spanning-tree guarantee.

  function randomInt(n) { return Math.floor(Math.random() * n); }

  function neighbours(r, c) {
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]];
  }

  function constructRegion(pieceIndexList, options) {
    const opts = options || {};
    const requestedZoneSize = Math.max(0, Number(opts.overlapZoneSize) || 0);
    if (requestedZoneSize) return constructLayeredRegion(pieceIndexList, opts, requestedZoneSize);
    const requestedOverlaps = Math.max(0, Math.min(Math.floor(pieceIndexList.length / 2), Number(opts.overlapCount) || 0));
    const occupancy = new Map();
    const solution = [];
    const overlapNodes = [];
    const overlapSources = {};
    const overlapUsedPieces = new Set();
    const overlapZoneKeys = new Set();

    function connected(keys) {
      if (!keys.length) return true;
      const remaining = new Set(keys);
      const pending = [keys[0]];
      remaining.delete(keys[0]);
      while (pending.length) {
        const [r, c] = pending.pop().split(',').map(Number);
        neighbours(r, c).forEach(([nr, nc]) => {
          const next = key(nr, nc);
          if (!remaining.has(next)) return;
          remaining.delete(next);
          pending.push(next);
        });
      }
      return remaining.size === 0;
    }

    function candidatePlacements(orientList, frontierCells) {
      const found = [];
      orientList.forEach((orient, orientIdx) => {
        frontierCells.forEach(([fr, fc]) => {
          orient.forEach(([ar, ac]) => {
            const dr = fr - ar, dc = fc - ac;
            const cells = orient.map(([r, c]) => [r + dr, c + dc]);
            const keys = cells.map(([r, c]) => key(r, c));
            if (keys.some(k => occupancy.has(k))) return;
            found.push({ cells, keys, orientIdx, origin: [dr, dc] });
          });
        });
      });
      return found;
    }

    function overlapPlacements(pieceSlot, orientList) {
      const found = [];
      orientList.forEach((orient, orientIdx) => {
        occupancy.forEach((owners, occupiedKey) => {
          if (owners.length !== 1 || overlapUsedPieces.has(owners[0])) return;
          const [targetR, targetC] = occupiedKey.split(',').map(Number);
          orient.forEach(([anchorR, anchorC]) => {
            const dr = targetR - anchorR, dc = targetC - anchorC;
            const cells = orient.map(([r, c]) => [r + dr, c + dc]);
            const keys = cells.map(([r, c]) => key(r, c));
            const collisions = keys.filter(k => occupancy.has(k));
            if (collisions.length !== 1 || collisions[0] !== occupiedKey) return;
            const newDetail = ORIENTATION_DETAIL_CACHE[pieceIndexList[pieceSlot]][orientIdx]
              .find(p => p.r === anchorR && p.c === anchorC);
            const ownerSlot = owners[0];
            const ownerSolution = solution[ownerSlot];
            const ownerLocalR = targetR - ownerSolution.origin[0];
            const ownerLocalC = targetC - ownerSolution.origin[1];
            const ownerDetail = ORIENTATION_DETAIL_CACHE[pieceIndexList[ownerSlot]][ownerSolution.orientIdx]
              .find(p => p.r === ownerLocalR && p.c === ownerLocalC);
            if (!newDetail || !ownerDetail) return;
            found.push({
              cells, keys, orientIdx, origin: [dr, dc],
              overlap: {
                r: targetR, c: targetC, key: occupiedKey,
                pieceSlots: [ownerSlot, pieceSlot],
                sources: [ownerDetail.source, newDetail.source]
              }
            });
          });
        });
      });
      return found;
    }

    function zonePlacements(orientList) {
      const found = [];
      const remaining = requestedZoneSize - overlapZoneKeys.size;
      if (remaining <= 0) return found;
      orientList.forEach((orient, orientIdx) => {
        occupancy.forEach((_, occupiedKey) => {
          const [targetR, targetC] = occupiedKey.split(',').map(Number);
          orient.forEach(([anchorR, anchorC]) => {
            const dr = targetR - anchorR, dc = targetC - anchorC;
            const cells = orient.map(([r, c]) => [r + dr, c + dc]);
            const keys = cells.map(([r, c]) => key(r, c));
            if (keys.some(k => (occupancy.get(k) || []).length >= 2)) return;
            const collisions = keys.filter(k => occupancy.has(k));
            const additions = keys.filter(k => !occupancy.has(k));
            if (collisions.length !== 1 || !additions.length || collisions.length > remaining) return;
            const combined = [...new Set([...overlapZoneKeys, ...collisions])];
            if (!connected(combined)) return;
            found.push({ cells, keys, orientIdx, origin: [dr, dc], zoneCollisions: collisions });
          });
        });
      });
      return found;
    }

    function chooseCompact(placements) {
      if (placements.length <= 1) return placements[0];
      const existing = [...occupancy.keys()].map(value => value.split(',').map(Number));
      const scored = placements.map(placement => {
        const union = new Map(existing.map(cell => [key(cell[0], cell[1]), cell]));
        placement.cells.forEach(cell => union.set(key(cell[0], cell[1]), cell));
        const cells = [...union.values()];
        const rows = cells.map(cell => cell[0]), cols = cells.map(cell => cell[1]);
        const area = (Math.max(...rows) - Math.min(...rows) + 1) * (Math.max(...cols) - Math.min(...cols) + 1);
        return { placement, holes: area - cells.length };
      }).sort((a, b) => a.holes - b.holes);
      const bestHoles = scored[0].holes;
      const compact = scored.filter(candidate => candidate.holes <= bestHoles + 1);
      return compact[randomInt(compact.length)].placement;
    }

    for (let i = 0; i < pieceIndexList.length; i++) {
      const orientList = ORIENTATION_CACHE[pieceIndexList[i]];
      let placements;
      const shouldBuildZone = requestedZoneSize && overlapZoneKeys.size < requestedZoneSize && i > 0;
      const shouldOverlap = !requestedZoneSize && overlapNodes.length < requestedOverlaps && i % 2 === 1;
      if (occupancy.size === 0) {
        const firstOrientIdx = randomInt(orientList.length);
        const orient = orientList[firstOrientIdx];
        placements = [{ cells: orient, keys: orient.map(([r, c]) => key(r, c)), orientIdx: firstOrientIdx, origin: [0, 0] }];
      } else if (shouldBuildZone) {
        placements = zonePlacements(orientList);
        if (!placements.length) {
          const frontierSet = new Set();
          occupancy.forEach((_, k) => {
            const [r, c] = k.split(',').map(Number);
            neighbours(r, c).forEach(([nr, nc]) => { if (!occupancy.has(key(nr, nc))) frontierSet.add(key(nr, nc)); });
          });
          placements = candidatePlacements(orientList, [...frontierSet].map(k => k.split(',').map(Number)));
        }
      } else if (shouldOverlap) {
        placements = overlapPlacements(i, orientList);
      } else {
        const frontierSet = new Set();
        occupancy.forEach((_, k) => {
          const [r, c] = k.split(',').map(Number);
          neighbours(r, c).forEach(([nr, nc]) => { if (!occupancy.has(key(nr, nc))) frontierSet.add(key(nr, nc)); });
        });
        const frontierCells = [...frontierSet].map(k => k.split(',').map(Number));
        placements = candidatePlacements(orientList, frontierCells);
      }
      if (!placements.length) return null;
      const choice = occupancy.size ? chooseCompact(placements) : placements[randomInt(placements.length)];
      choice.keys.forEach(k => {
        const owners = occupancy.get(k) || [];
        owners.push(i);
        occupancy.set(k, owners);
      });
      solution.push({ pieceIndex: pieceIndexList[i], cells: choice.cells, orientIdx: choice.orientIdx, origin: choice.origin });
      if (choice.overlap) {
        overlapNodes.push(choice.overlap);
        overlapUsedPieces.add(choice.overlap.pieceSlots[0]);
        overlapUsedPieces.add(choice.overlap.pieceSlots[1]);
        choice.overlap.pieceSlots.forEach((slot, index) => {
          overlapSources[slot] = { nodeKey: choice.overlap.key, source: choice.overlap.sources[index] };
        });
      }
      (choice.zoneCollisions || []).forEach(k => overlapZoneKeys.add(k));
    }

    if (overlapZoneKeys.size !== requestedZoneSize) return null;
    if (overlapNodes.length !== requestedOverlaps) return null;
    const region = [...occupancy.keys()].map(k => k.split(',').map(Number));
    return {
      region, solution, overlapNodes, overlapSources,
      overlapZone: [...overlapZoneKeys].map(k => k.split(',').map(Number))
    };
  }

  function constructLayeredRegion(pieceIndexList, options, zoneSize) {
    const slots = pieceIndexList.map((_, slot) => slot);
    const reserveChoices = [];
    function chooseReserve(start, total, chosen) {
      if (total === zoneSize) {
        if (chosen.length && chosen.length < pieceIndexList.length) reserveChoices.push(chosen.slice());
        return;
      }
      if (total > zoneSize) return;
      for (let i = start; i < slots.length; i++) {
        chooseReserve(i + 1, total + PIECE_LIBRARY[pieceIndexList[i]].cells.length, [...chosen, i]);
      }
    }
    chooseReserve(0, 0, []);
    for (let i = reserveChoices.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [reserveChoices[i], reserveChoices[j]] = [reserveChoices[j], reserveChoices[i]];
    }

    for (const secondLayerSlots of reserveChoices) {
      const reserveSet = new Set(secondLayerSlots);
      const firstLayerSlots = slots.filter(slot => !reserveSet.has(slot));
      const base = constructRegion(firstLayerSlots.map(slot => pieceIndexList[slot]), {
        ...options,
        overlapZoneSize: 0,
        overlapCount: 0
      });
      if (!base) continue;
      const regionSet = new Set(base.region.map(([r, c]) => key(r, c)));
      const occupied = new Set();
      const reservedSolution = new Map();
      const orderedReserve = secondLayerSlots.map(slot => {
        const placements = [];
        ORIENTATION_CACHE[pieceIndexList[slot]].forEach((orient, orientIdx) => {
          base.region.forEach(([targetR, targetC]) => {
            orient.forEach(([anchorR, anchorC]) => {
              const origin = [targetR - anchorR, targetC - anchorC];
              const cells = orient.map(([r, c]) => [r + origin[0], c + origin[1]]);
              const keys = cells.map(([r, c]) => key(r, c));
              if (keys.every(k => regionSet.has(k))) placements.push({ cells, keys, orientIdx, origin });
            });
          });
        });
        return { slot, placements };
      }).sort((a, b) => a.placements.length - b.placements.length);

      function placeReserve(index) {
        if (index === orderedReserve.length) {
          const zoneKeys = [...occupied];
          if (zoneKeys.length !== zoneSize) return false;
          const pending = [zoneKeys[0]];
          const unseen = new Set(zoneKeys.slice(1));
          while (pending.length) {
            const [r, c] = pending.pop().split(',').map(Number);
            neighbours(r, c).forEach(([nr, nc]) => {
              const next = key(nr, nc);
              if (unseen.delete(next)) pending.push(next);
            });
          }
          return unseen.size === 0;
        }
        const entry = orderedReserve[index];
        for (const placement of entry.placements) {
          if (placement.keys.some(k => occupied.has(k))) continue;
          placement.keys.forEach(k => occupied.add(k));
          reservedSolution.set(entry.slot, placement);
          if (placeReserve(index + 1)) return true;
          reservedSolution.delete(entry.slot);
          placement.keys.forEach(k => occupied.delete(k));
        }
        return false;
      }
      if (!placeReserve(0)) continue;

      const solution = new Array(pieceIndexList.length);
      firstLayerSlots.forEach((slot, index) => { solution[slot] = base.solution[index]; });
      secondLayerSlots.forEach(slot => {
        const placement = reservedSolution.get(slot);
        solution[slot] = {
          pieceIndex: pieceIndexList[slot],
          cells: placement.cells,
          orientIdx: placement.orientIdx,
          origin: placement.origin
        };
      });
      return {
        region: base.region,
        solution,
        overlapNodes: [],
        overlapSources: {},
        overlapZone: [...occupied].map(value => value.split(',').map(Number)),
        secondLayerSlots: secondLayerSlots.slice()
      };
    }
    return null;
  }

  // constructRegion starts its first piece at an arbitrary (0,0) and grows
  // outward in any direction, so the resulting region can extend to negative
  // row/col values. Every downstream consumer (rendering, drop-position math)
  // assumes region cells start at or above (0,0) relative to a fixed origin —
  // shift the whole construction so its minimum row and column are exactly 0.
  function normalizeBuilt(built) {
    const minR = Math.min(...built.region.map(([r]) => r));
    const minC = Math.min(...built.region.map(([, c]) => c));
    if (minR === 0 && minC === 0) return built;
    return {
      region: built.region.map(([r, c]) => [r - minR, c - minC]),
      solution: built.solution.map(p => ({
        ...p,
        origin: [p.origin[0] - minR, p.origin[1] - minC],
        cells: p.cells.map(([r, c]) => [r - minR, c - minC])
      })),
      overlapNodes: (built.overlapNodes || []).map(node => ({ ...node, r: node.r - minR, c: node.c - minC, key: key(node.r - minR, node.c - minC) })),
      overlapZone: (built.overlapZone || []).map(([r, c]) => [r - minR, c - minC]),
      secondLayerSlots: built.secondLayerSlots || [],
      overlapSources: Object.fromEntries(Object.entries(built.overlapSources || {}).map(([slot, marker]) => [
        slot,
        { ...marker, nodeKey: (() => { const [r, c] = marker.nodeKey.split(',').map(Number); return key(r - minR, c - minC); })() }
      ]))
    };
  }

  function deriveBoard(region) {
    const bounds = regionBounds(region);
    const regionSet = new Set(region.map(([r, c]) => key(r, c)));
    const blocked = [];
    for (let r = bounds.minR; r <= bounds.maxR; r++) {
      for (let c = bounds.minC; c <= bounds.maxC; c++) {
        if (!regionSet.has(key(r, c))) blocked.push([r, c]);
      }
    }
    return {
      minR: bounds.minR, maxR: bounds.maxR, minC: bounds.minC, maxC: bounds.maxC,
      rows: bounds.maxR - bounds.minR + 1,
      columns: bounds.maxC - bounds.minC + 1,
      blocked
    };
  }

  function sourceAt(solutionPiece, r, c) {
    const localR = r - solutionPiece.origin[0];
    const localC = c - solutionPiece.origin[1];
    const cell = ORIENTATION_DETAIL_CACHE[solutionPiece.pieceIndex][solutionPiece.orientIdx]
      .find(candidate => candidate.r === localR && candidate.c === localC);
    return cell ? cell.source : null;
  }

  function touchingContacts(solution) {
    const ownerByCell = new Map();
    solution.forEach((piece, slot) => piece.cells.forEach(([r, c]) => {
      const owners = ownerByCell.get(key(r, c)) || [];
      owners.push(slot);
      ownerByCell.set(key(r, c), owners);
    }));
    const pairs = new Map();
    solution.forEach((piece, slot) => piece.cells.forEach(([r, c]) => {
      neighbours(r, c).forEach(([nr, nc]) => {
        (ownerByCell.get(key(nr, nc)) || []).forEach(other => {
          if (other === slot) return;
          const pieceSlots = [Math.min(slot, other), Math.max(slot, other)];
          const pairKey = pieceSlots.join(',');
          if (pairs.has(pairKey)) return;
          const firstIsSlot = pieceSlots[0] === slot;
          const contacts = firstIsSlot
            ? [{ slot, source: sourceAt(piece, r, c) }, { slot: other, source: sourceAt(solution[other], nr, nc) }]
            : [{ slot: other, source: sourceAt(solution[other], nr, nc) }, { slot, source: sourceAt(piece, r, c) }];
          if (contacts.every(contact => contact.source != null)) pairs.set(pairKey, { pieceSlots, contacts });
        });
      });
    }));
    return [...pairs.values()];
  }

  function deriveLinks(solution, requestedCount, sharedCount) {
    const candidates = touchingContacts(solution);
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const selected = [];
    const usedSlots = new Set();
    const usedMarkers = new Set();
    const requested = Math.max(0, Number(requestedCount) || 0);
    const chainLength = Math.min(requested, Math.max(0, Number(sharedCount) || 0));
    const markerKey = marker => `${marker.slot}:${marker.source}`;
    const markersAvailable = candidate => candidate.contacts.every(marker => !usedMarkers.has(markerKey(marker)));
    const take = candidate => {
      selected.push(candidate);
      candidate.pieceSlots.forEach(slot => usedSlots.add(slot));
      candidate.contacts.forEach(marker => usedMarkers.add(markerKey(marker)));
    };

    let builtChainLength = 0;
    if (chainLength >= 2) {
      let seed = null;
      for (let i = 0; i < candidates.length && !seed; i++) {
        for (let j = i + 1; j < candidates.length; j++) {
          const shared = candidates[i].pieceSlots.filter(slot => candidates[j].pieceSlots.includes(slot));
          const markers = [...candidates[i].contacts, ...candidates[j].contacts].map(markerKey);
          if (shared.length === 1 && new Set(markers).size === markers.length) {
            seed = [candidates[i], candidates[j]];
            break;
          }
        }
      }
      if (seed) seed.forEach(take);
      while (selected.length < chainLength) {
        const degrees = new Map();
        selected.forEach(link => link.pieceSlots.forEach(slot => degrees.set(slot, (degrees.get(slot) || 0) + 1)));
        const next = candidates.find(candidate => !selected.includes(candidate) && markersAvailable(candidate) &&
          candidate.pieceSlots.filter(slot => (degrees.get(slot) || 0) === 1).length === 1 &&
          candidate.pieceSlots.filter(slot => !usedSlots.has(slot)).length === 1);
        if (!next) break;
        take(next);
      }
      builtChainLength = selected.length;
    }

    candidates.forEach(candidate => {
      if (selected.length >= requested || selected.includes(candidate) || !markersAvailable(candidate)) return;
      if (candidate.pieceSlots.some(slot => usedSlots.has(slot))) return;
      take(candidate);
    });
    if (chainLength >= 2 && builtChainLength < chainLength) return [];
    const symbols = ['A', 'B', 'C', 'D', 'E'];
    return selected.map((candidate, index) => ({
      id: `link-${index + 1}`,
      symbol: symbols[index % symbols.length],
      pieceSlots: candidate.pieceSlots,
      contacts: candidate.contacts
    }));
  }

  function shufflePick(count) {
    const idx = PIECE_LIBRARY
      .map((_, i) => i)
      .slice(0, count > 10 ? PIECE_LIBRARY.length : 10);
    for (let i = idx.length - 1; i > 0; i--) { const j = randomInt(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx.slice(0, count);
  }

  function deriveAnchors(solution, region, requestedCount, excludedSlots) {
    const count = Math.max(0, Number(requestedCount) || 0);
    if (!count) return [];
    const regionSet = new Set(region.map(([r, c]) => key(r, c)));
    const excluded = new Set(excludedSlots || []);
    const candidates = [];
    solution.forEach((piece, slot) => {
      if (excluded.has(slot)) return;
      PIECE_LIBRARY[piece.pieceIndex].cells.forEach((_, source) => {
        const solvedCell = ORIENTATION_DETAIL_CACHE[piece.pieceIndex][piece.orientIdx].find(cell => cell.source === source);
        if (!solvedCell) return;
        const boardCell = [piece.origin[0] + solvedCell.r, piece.origin[1] + solvedCell.c];
        const starts = ORIENTATION_DETAIL_CACHE[piece.pieceIndex].map((detail, orientIdx) => {
          if (orientIdx === piece.orientIdx) return null;
          const pivot = detail.find(cell => cell.source === source);
          const origin = [boardCell[0] - pivot.r, boardCell[1] - pivot.c];
          const cells = detail.map(cell => [origin[0] + cell.r, origin[1] + cell.c]);
          return cells.every(([r, c]) => regionSet.has(key(r, c))) ? { orientIdx, origin, cells } : null;
        }).filter(Boolean);
        if (starts.length) candidates.push({ slot, source, boardCell, starts });
      });
    });
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    const anchors = [];
    const occupiedStarts = new Set();
    candidates.forEach(candidate => {
      if (anchors.length >= count || anchors.some(anchor => anchor.slot === candidate.slot)) return;
      const start = candidate.starts.find(option => option.cells.every(([r, c]) => !occupiedStarts.has(key(r, c))));
      if (!start) return;
      start.cells.forEach(([r, c]) => occupiedStarts.add(key(r, c)));
      anchors.push({
        slot: candidate.slot,
        source: candidate.source,
        boardCell: candidate.boardCell,
        startOrientIdx: start.orientIdx,
        startOrigin: start.origin,
        startOptions: candidate.starts
      });
    });
    return anchors.length === count ? anchors : [];
  }

  function deriveAnchorGroups(anchors, solution, requestedCount) {
    const count = Math.max(0, Number(requestedCount) || 0);
    if (!count) return [];
    const available = anchors.slice();
    const groups = [];
    while (groups.length < count) {
      let pair = null;
      for (let i = 0; i < available.length && !pair; i++) {
        for (let j = i + 1; j < available.length; j++) {
          const a = available[i], b = available[j];
          const aLen = ORIENTATION_CACHE[solution[a.slot].pieceIndex].length;
          const bLen = ORIENTATION_CACHE[solution[b.slot].pieceIndex].length;
          const matchedStarts = (a.startOptions || []).flatMap(aStart =>
            (b.startOptions || []).map(bStart => ({ aStart, bStart }))).find(({ aStart, bStart }) => {
              const aDelta = (solution[a.slot].orientIdx - aStart.orientIdx + aLen) % aLen;
              const bDelta = (solution[b.slot].orientIdx - bStart.orientIdx + bLen) % bLen;
              return aLen > 1 && bLen > 1 && aDelta === bDelta && aDelta > 0;
            });
          if (matchedStarts) {
            a.startOrientIdx = matchedStarts.aStart.orientIdx;
            a.startOrigin = matchedStarts.aStart.origin;
            b.startOrientIdx = matchedStarts.bStart.orientIdx;
            b.startOrigin = matchedStarts.bStart.origin;
            pair = [a, b];
          }
        }
      }
      if (!pair) return [];
      pair.forEach(anchor => available.splice(available.indexOf(anchor), 1));
      const id = `anchor-group-${groups.length + 1}`;
      pair.forEach(anchor => { anchor.groupId = id; });
      groups.push({ id, slots: pair.map(anchor => anchor.slot) });
    }
    anchors.forEach(anchor => { delete anchor.startOptions; });
    return groups;
  }

  function addSurplusPieces(pieceIndexList, requestedCount) {
    const result = pieceIndexList.slice();
    const count = Math.max(0, Number(requestedCount) || 0);
    for (let i = 0; i < count; i++) {
      const reference = pieceIndexList[(pieceIndexList.length - 1 - i + pieceIndexList.length) % pieceIndexList.length];
      const area = PIECE_LIBRARY[reference].cells.length;
      const alternatives = PIECE_LIBRARY.map((piece, index) => ({ piece, index }))
        .filter(candidate => candidate.piece.cells.length === area && candidate.index !== reference);
      result.push(alternatives.length ? alternatives[randomInt(alternatives.length)].index : reference);
    }
    return result;
  }

  // Generates a puzzle whose TRUE solution count (not just the one used to
  // construct it) falls within [targetMin, targetMax]. Retries with a fresh
  // piece selection + packing on rejection, capped at maxAttempts. A candidate
  // whose count could not be verified within the node budget is rejected
  // outright (treated as unknown, not accepted on a partial read) rather than
  // risked as a fallback — an unverifiable board is exactly the kind that could
  // hang the browser tab it's rendered in.
  function generate(options) {
    // nodeBudget is deliberately modest: measured ~7-420ms per generate() call
    // at 8000 (vs. multi-minute hangs at 60000 compounded across retries) — a
    // candidate that can't be classified within a small budget is exactly the
    // kind we don't want anyway (see the solveCount comment above).
    // maxDimension bounds the constructed region's bounding box (not just its
    // cell count): the constructive packer grows in any direction with no shape
    // preference, so an accepted region can come out tall-and-narrow or long-
    // and-thin even at a modest cell count — exactly the kind of shape that
    // overflows a fixed-size host panel. Caught by actually looking at the
    // rendered result, not assumed away.
    const opts = Object.assign({
      pieceCount: 8, targetMin: 3, targetMax: 4, maxAttempts: 600,
      nodeBudget: 8000, maxDimension: 8, maxAspectRatio: 1.75
    }, options || {});
    opts.maxAspectRatio = Number(opts.maxAspectRatio) || 1.75;
    let best = null;
    for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
      const pieceIndexList = Array.isArray(opts.pieceIndexList)
        ? opts.pieceIndexList.slice()
        : shufflePick(opts.pieceCount);
      const rawBuilt = constructRegion(pieceIndexList, opts);
      if (!rawBuilt) continue;
      const built = normalizeBuilt(rawBuilt);
      const bounds = regionBounds(built.region);
      const rows = bounds.maxR - bounds.minR + 1;
      const columns = bounds.maxC - bounds.minC + 1;
      if (rows > opts.maxDimension || columns > opts.maxDimension) continue;
      if (Math.max(rows / columns, columns / rows) > opts.maxAspectRatio) continue;
      const board = deriveBoard(built.region);
      const minHoles = Math.max(0, Number(opts.minHoles) || 0);
      const maxHoles = opts.maxHoles == null ? Infinity : Math.max(minHoles, Number(opts.maxHoles) || 0);
      if (board.blocked.length < minHoles || board.blocked.length > maxHoles) continue;
      const links = deriveLinks(built.solution, opts.linkCount, opts.linkSharedCount);
      if (links.length !== Math.max(0, Number(opts.linkCount) || 0)) continue;
      const anchors = deriveAnchors(built.solution, built.region, opts.anchorCount, built.secondLayerSlots);
      if (anchors.length !== Math.max(0, Number(opts.anchorCount) || 0)) continue;
      const anchorGroups = deriveAnchorGroups(anchors, built.solution, opts.anchorGroupCount);
      if (anchorGroups.length !== Math.max(0, Number(opts.anchorGroupCount) || 0)) continue;
      const offeredPieceIndexList = addSurplusPieces(pieceIndexList, opts.surplusCount);
      const candidate = {
        region: built.region, board, pieceIndexList: offeredPieceIndexList, usedPieceCount: pieceIndexList.length,
        surplusCount: Math.max(0, Number(opts.surplusCount) || 0), solution: built.solution,
        overlapNodes: built.overlapNodes || [], overlapSources: built.overlapSources || {},
        links, anchors, anchorGroups, overlapZone: built.overlapZone || [],
        secondLayerSlots: built.secondLayerSlots || [],
        solutionCount: null, attempts: attempt + 1
      };
      if (opts.verifySolutions === false) {
        return candidate;
      }
      const result = solveCount(built.region, pieceIndexList, opts.targetMax + 4, opts.nodeBudget);
      if (result.exceeded) continue; // unverifiable in budget — reject, don't guess
      const count = result.count;
      if (count >= opts.targetMin && count <= opts.targetMax) {
        return { ...candidate, solutionCount: count };
      }
      if (!best || Math.abs(count - (opts.targetMin + opts.targetMax) / 2) < Math.abs(best.solutionCount - (opts.targetMin + opts.targetMax) / 2)) {
        best = { ...candidate, solutionCount: count };
      }
    }
    return best; // fallback: closest candidate found, never a hard failure
  }

  // ---- Rendering / interaction ------------------------------------------------

  let active = false;
  let paused = true;
  let solved = false;
  let config = null;
  let stage = null;
  let puzzle = null;       // { region, pieceIndexList, solution, ... }
  let trayPieces = [];     // { pieceIndex, orientIdx (current), g, cellSize, home:{x,y}, placedAt:null|[r,c] }
  let listeners = [];
  let victoryTimers = [];
  let dragging = null;
  let selectedPiece = null;
  let selectionGhosts = [];
  let overlapZoneLayer = null;
  let overlapZoneIndicators = new Map();
  let overlapZoneBanner = null;
  let layerPhase = 0;
  let regionCellSize = 0;
  let trayCellSize = 0;
  let floatingCellSize = 0;
  let lastTapPiece = null;
  let lastTapAt = -Infinity;
  let regionOrigin = { x: 0, y: 0 };
  let rackArea = null;

  function element(id) { return document.getElementById(id); }
  function svg(tag, attrs) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }

  function playTone(f0, f1, dur, vol, type) {
    try {
      if (typeof getAudioCtx !== 'function') return;
      const a = getAudioCtx(); const o = a.createOscillator(); const g = a.createGain();
      const t = a.currentTime + .01; o.type = type || 'triangle';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + dur);
      o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + .02);
    } catch (e) { /* playable without audio */ }
  }

  function addListener(node, type, handler, options) { if (!node) return; node.addEventListener(type, handler, options); listeners.push({ node, type, handler }); }

  function regionBounds(region) {
    const rows = region.map(p => p[0]), cols = region.map(p => p[1]);
    return { minR: Math.min(...rows), maxR: Math.max(...rows), minC: Math.min(...cols), maxC: Math.max(...cols) };
  }

  function cellOccupied(r, c) {
    return trayPieces.some(p => p.placedAt && currentCells(p).some(([pr, pc]) => pr === r && pc === c));
  }

  function currentCells(piece) {
    if (!piece.placedAt) return [];
    const orient = ORIENTATION_CACHE[piece.pieceIndex][piece.orientIdx];
    const [dr, dc] = piece.placedAt;
    return orient.map(([r, c]) => [r + dr, c + dc]);
  }

  function currentOrientationDetail(piece) {
    if (piece.physicalTurn != null &&
        PHYSICAL_ROTATION_TO_ORIENT[piece.pieceIndex][piece.physicalTurn] === piece.orientIdx) {
      return PHYSICAL_ROTATION_DETAIL_CACHE[piece.pieceIndex][piece.physicalTurn];
    }
    return ORIENTATION_DETAIL_CACHE[piece.pieceIndex][piece.orientIdx];
  }

  function currentDetailedCells(piece, placedAt) {
    const origin = placedAt || piece.placedAt;
    if (!origin) return [];
    const detail = currentOrientationDetail(piece);
    return detail.map(cell => ({ r: cell.r + origin[0], c: cell.c + origin[1], source: cell.source }));
  }

  function piecesShareBorder(a, b) {
    const bCells = new Set(currentCells(b).map(([r, c]) => key(r, c)));
    return currentCells(a).some(([r, c]) => neighbours(r, c).some(([nr, nc]) => bCells.has(key(nr, nc))));
  }

  function checkComplete() {
    const regionSet = new Set(puzzle.region.map(([r, c]) => key(r, c)));
    const zoneSet = new Set((puzzle.overlapZone || []).map(([r, c]) => key(r, c)));
    const filled = new Map();
    if (trayPieces.filter(piece => !piece.placedAt).length !== (puzzle.surplusCount || 0)) return false;
    for (const p of trayPieces) {
      if (!p.placedAt) continue;
      for (const { r, c } of currentDetailedCells(p)) {
        const k = key(r, c);
        if (!regionSet.has(k)) return false;
        const occupants = filled.get(k) || [];
        if (occupants.length) {
          const node = (puzzle.overlapNodes || []).find(candidate => candidate.key === k);
          if ((!node && !zoneSet.has(k)) || occupants.length >= 2) return false;
        }
        occupants.push({ piece: p });
        filled.set(k, occupants);
      }
    }
    if (filled.size !== regionSet.size) return false;
    for (const [k, occupants] of filled) {
      const node = (puzzle.overlapNodes || []).find(candidate => candidate.key === k);
      if (occupants.length !== (node || zoneSet.has(k) ? 2 : 1)) return false;
    }
    if (!zoneSet.size && trayPieces.some(piece => {
      let overlaps = 0;
      for (const occupants of filled.values()) {
        if (occupants.length === 2 && occupants.some(occupant => occupant.piece === piece)) overlaps += 1;
      }
      return overlaps > 1;
    })) return false;
    return (puzzle.links || []).every(link => {
      const markedCells = (link.contacts || []).map(marker => {
        const piece = trayPieces[marker.slot];
        return piece && currentDetailedCells(piece).find(cell => cell.source === marker.source);
      });
      if (markedCells.length !== 2 || !markedCells.every(Boolean)) return false;
      const [first, second] = markedCells;
      const shareEdge = neighbours(first.r, first.c)
        .some(([r, c]) => r === second.r && c === second.c);
      const shareOverlapNode = first.r === second.r && first.c === second.c &&
        ((puzzle.overlapNodes || []).some(node => node.r === first.r && node.c === first.c) ||
          zoneSet.has(key(first.r, first.c)));
      return shareEdge || shareOverlapNode;
    });
  }

  function layerOneIsFull() {
    if (layerPhase !== 1) return false;
    const regionSet = new Set(puzzle.region.map(([r, c]) => key(r, c)));
    const filled = new Set();
    for (const piece of trayPieces) {
      if (!piece.placedAt) continue;
      for (const [r, c] of currentCells(piece)) {
        const cellKey = key(r, c);
        if (!regionSet.has(cellKey) || filled.has(cellKey)) return false;
        filled.add(cellKey);
      }
    }
    return filled.size === regionSet.size;
  }

  function unlockLayerTwo() {
    if (!layerOneIsFull()) return false;
    layerPhase = 2;
    trayPieces.forEach(piece => {
      piece.layerLocked = Boolean(piece.placedAt);
      piece.g.classList.toggle('is-layer-one-locked', piece.layerLocked);
    });
    refreshOverlapTextures();
    if (stage && stage.classList) stage.classList.add('is-layer-two-open');
    if (overlapZoneBanner) overlapZoneBanner.textContent = 'LAYER 2 · OPEN';
    if (typeof config.onLayerChange === 'function') config.onLayerChange(2);
    playTone(330, 660, .32, .055, 'sine');
    return true;
  }

  function renderPieceShape(g, cells, cellSize, colorId) {
    while (g.firstChild) g.removeChild(g.firstChild);
    const color = PIECE_COLORS[colorId] || '#8a9fc9';
    g.setAttribute('style', `--pge-piece-color:${color}`);
    // A padded, invisible hit-rect sized to the piece's bounding box (not just
    // its painted cells) makes tap-to-rotate forgiving for small/thin pieces
    // (a 2-cell domino is otherwise a tiny, easy-to-miss target) and for taps
    // that land just outside a cell's edge. `pointer-events:all` is required
    // because a transparent fill is otherwise not hit-testable in SVG.
    const minR = Math.min(...cells.map(([r]) => r)), maxR = Math.max(...cells.map(([r]) => r));
    const minC = Math.min(...cells.map(([, c]) => c)), maxC = Math.max(...cells.map(([, c]) => c));
    // kept modest (not a generous 0.4+) because tray pieces sit close enough
    // together (see the host's trayOrigin/traySpacing tuning) that a larger
    // pad would make adjacent pieces' hit-rects overlap.
    const pad = cellSize * .25;
    g.appendChild(svg('rect', {
      x: minC * cellSize - pad, y: minR * cellSize - pad,
      width: (maxC - minC + 1) * cellSize + pad * 2, height: (maxR - minR + 1) * cellSize + pad * 2,
      fill: 'transparent', 'pointer-events': 'all', class: 'pge-piece-hit'
    }));
    const cellNodes = [];
    cells.forEach(([r, c]) => {
      const rect = svg('rect', {
        x: c * cellSize + 1, y: r * cellSize + 1, width: cellSize - 2, height: cellSize - 2,
        rx: 3, fill: color, class: 'pge-cell', 'data-cell-r': r, 'data-cell-c': c
      });
      g.appendChild(rect);
      cellNodes.push(rect);
    });
    return cellNodes;
  }

  function renderPiece(piece, cellSize) {
    piece.renderCellSize = cellSize;
    const cells = ORIENTATION_CACHE[piece.pieceIndex][piece.orientIdx];
    piece.cellNodes = renderPieceShape(piece.g, cells, cellSize, PIECE_LIBRARY[piece.pieceIndex].id);
    const pieceLinks = (puzzle && puzzle.links ? puzzle.links : [])
      .map((link, index) => ({ link, index }))
      .filter(({ link }) => link.pieceSlots.includes(piece.slot));
    const pipLayouts = {
      1: [[.5, .5]],
      2: [[.32, .32], [.68, .68]],
      3: [[.3, .3], [.5, .5], [.7, .7]],
      4: [[.3, .3], [.7, .3], [.3, .7], [.7, .7]],
      5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]]
    };
    pieceLinks.forEach(({ link, index }, markerIndex) => {
      const marker = (link.contacts || []).find(contact => contact.slot === piece.slot);
      const detail = currentOrientationDetail(piece);
      const markedCell = marker == null ? null : detail.find(cell => cell.source === marker.source);
      const [r, c] = markedCell ? [markedCell.r, markedCell.c] : cells[markerIndex % cells.length];
      const pipCount = Math.min(5, index + 1);
      pipLayouts[pipCount].forEach(([px, py]) => {
        piece.g.appendChild(svg('circle', {
          cx: (c + px) * cellSize,
          cy: (r + py) * cellSize,
          r: Math.max(2.1, cellSize * .065),
          class: 'pge-link-pip'
        }));
      });
    });
  }

  function renderAnchorPin(piece) {
    if (!piece.anchor) return;
    const pivot = ORIENTATION_DETAIL_CACHE[piece.pieceIndex][piece.orientIdx]
      .find(cell => cell.source === piece.anchor.source);
    if (!pivot) return;
    const cx = (pivot.c + .5) * piece.renderCellSize;
    const cy = (pivot.r + .5) * piece.renderCellSize;
    piece.g.appendChild(svg('circle', {
      cx, cy, r: piece.renderCellSize * .17,
      class: `pge-anchor-pin-ring${piece.anchor.groupId ? ' is-linked' : ''}`
    }));
    const arm = piece.renderCellSize * .075;
    piece.g.appendChild(svg('path', {
      d: `M${cx - arm},${cy - arm}L${cx + arm},${cy + arm}M${cx + arm},${cy - arm}L${cx - arm},${cy + arm}`,
      class: 'pge-anchor-pin'
    }));
  }

  function refreshOverlapTextures() {
    trayPieces.forEach(piece => {
      (piece.cellNodes || []).forEach(node => {
        node.setAttribute('opacity', '1');
        node.classList.remove('is-overlap-cell');
      });
    });
    (puzzle && puzzle.overlapNodes ? puzzle.overlapNodes : []).forEach(node => {
      const occupants = trayPieces.filter(piece => piece.placedAt &&
        currentCells(piece).some(([r, c]) => r === node.r && c === node.c));
      occupants.forEach(piece => {
        const local = ORIENTATION_CACHE[piece.pieceIndex][piece.orientIdx]
          .find(([r, c]) => r + piece.placedAt[0] === node.r && c + piece.placedAt[1] === node.c);
        if (!local) return;
        const [r, c] = local;
        const cell = (piece.cellNodes || []).find(candidate =>
          Number(candidate.getAttribute('data-cell-r')) === r && Number(candidate.getAttribute('data-cell-c')) === c);
        if (cell) {
          cell.setAttribute('opacity', '.2');
          cell.classList.add('is-overlap-cell');
        }
      });
      if (node.glyph) {
        node.glyph.textContent = occupants.length === 2 ? '✓' : '2';
        node.glyph.classList.toggle('is-satisfied', occupants.length === 2);
      }
    });
    (puzzle && puzzle.overlapZone ? puzzle.overlapZone : []).forEach(([nodeR, nodeC]) => {
      const occupants = trayPieces.filter(piece => piece.placedAt &&
        currentCells(piece).some(([r, c]) => r === nodeR && c === nodeC));
      occupants.forEach(piece => {
        const local = ORIENTATION_CACHE[piece.pieceIndex][piece.orientIdx]
          .find(([r, c]) => r + piece.placedAt[0] === nodeR && c + piece.placedAt[1] === nodeC);
        if (!local) return;
        const cell = (piece.cellNodes || []).find(candidate =>
          Number(candidate.getAttribute('data-cell-r')) === local[0] &&
          Number(candidate.getAttribute('data-cell-c')) === local[1]);
        if (cell) {
          cell.setAttribute('opacity', occupants.length === 2 ? '.28' : '.72');
          cell.classList.add('is-overlap-cell');
        }
      });
      const indicator = overlapZoneIndicators.get(key(nodeR, nodeC));
      if (indicator) {
        const count = Math.min(2, occupants.length);
        indicator.g.classList.toggle('has-one', count === 1);
        indicator.g.classList.toggle('is-complete', count === 2);
        indicator.label.textContent = '';
      }
    });
  }

  function mountOverlapZoneIndicators() {
    overlapZoneIndicators = new Map();
    if (!stage || !(puzzle && puzzle.overlapZone && puzzle.overlapZone.length)) return;
    overlapZoneLayer = svg('g', { class: 'pge-overlap-zone-overlay', 'pointer-events': 'none' });
    const inset = 3;
    const zoneCells = new Set(puzzle.overlapZone.map(([r, c]) => key(r, c)));
    const boundary = [];
    puzzle.overlapZone.forEach(([r, c]) => {
      const x = regionOrigin.x + c * regionCellSize + inset;
      const y = regionOrigin.y + r * regionCellSize + inset;
      const size = regionCellSize - inset * 2;
      const g = svg('g', { class: 'pge-overlap-zone-indicator' });
      g.appendChild(svg('rect', {
        x, y, width: size, height: size, rx: 4, class: 'pge-overlap-zone-veil'
      }));
      const label = svg('text', {
        x: x + size / 2,
        y: y + size / 2,
        'text-anchor': 'middle',
        'dominant-baseline': 'middle',
        class: 'pge-overlap-zone-status'
      });
      label.textContent = '';
      g.appendChild(label);
      overlapZoneLayer.appendChild(g);
      overlapZoneIndicators.set(key(r, c), { g, label });

      const left = regionOrigin.x + c * regionCellSize + 2;
      const top = regionOrigin.y + r * regionCellSize + 2;
      const right = left + regionCellSize - 4;
      const bottom = top + regionCellSize - 4;
      if (!zoneCells.has(key(r - 1, c))) boundary.push(`M${left},${top}H${right}`);
      if (!zoneCells.has(key(r, c + 1))) boundary.push(`M${right},${top}V${bottom}`);
      if (!zoneCells.has(key(r + 1, c))) boundary.push(`M${right},${bottom}H${left}`);
      if (!zoneCells.has(key(r, c - 1))) boundary.push(`M${left},${bottom}V${top}`);
    });
    overlapZoneLayer.appendChild(svg('path', {
      d: boundary.join(''),
      class: 'pge-overlap-zone-boundary'
    }));
    const zoneRows = puzzle.overlapZone.map(([r]) => r);
    const zoneCols = puzzle.overlapZone.map(([, c]) => c);
    overlapZoneBanner = svg('text', {
      x: regionOrigin.x + ((Math.min(...zoneCols) + Math.max(...zoneCols) + 1) / 2) * regionCellSize,
      y: regionOrigin.y + ((Math.min(...zoneRows) + Math.max(...zoneRows) + 1) / 2) * regionCellSize,
      'text-anchor': 'middle',
      'dominant-baseline': 'middle',
      class: 'pge-overlap-zone-banner'
    });
    overlapZoneBanner.textContent = 'LAYER 2 · SEALED';
    overlapZoneLayer.appendChild(overlapZoneBanner);
    stage.appendChild(overlapZoneLayer);
  }

  function pieceDimensions(piece, cellSize, orientIdx) {
    const cells = ORIENTATION_CACHE[piece.pieceIndex][orientIdx == null ? piece.orientIdx : orientIdx];
    return {
      width: (Math.max(...cells.map(([, c]) => c)) + 1) * cellSize,
      height: (Math.max(...cells.map(([r]) => r)) + 1) * cellSize
    };
  }

  function clampFloatingPosition(piece, position, orientIdx) {
    const viewBox = stage && stage.viewBox && stage.viewBox.baseVal;
    const width = viewBox && viewBox.width ? viewBox.width : 560;
    const height = viewBox && viewBox.height ? viewBox.height : 1120;
    const size = pieceDimensions(piece, floatingCellSize, orientIdx);
    const pad = 8;
    return {
      x: Math.max(pad, Math.min(width - size.width - pad, position.x)),
      y: Math.max(pad, Math.min(height - size.height - pad, position.y))
    };
  }

  function moveFloatingPiece(piece, position, orientIdx) {
    const clamped = clampFloatingPosition(piece, position, orientIdx);
    piece.floatPosition = clamped;
    piece.g.setAttribute('transform', `translate(${clamped.x},${clamped.y})`);
    return clamped;
  }

  function clearSelectionGhost() {
    selectionGhosts.forEach(node => {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    selectionGhosts = [];
  }

  function showSelectionGhost(piece) {
    clearSelectionGhost();
    if (!piece.lastValidAt || !piece.regionGroup) return;
    const orient = ORIENTATION_CACHE[piece.pieceIndex][piece.lastValidOrientIdx];
    orient.forEach(([r, c]) => {
      const node = svg('rect', {
        x: regionOrigin.x + (piece.lastValidAt[1] + c) * regionCellSize + 3,
        y: regionOrigin.y + (piece.lastValidAt[0] + r) * regionCellSize + 3,
        width: regionCellSize - 6, height: regionCellSize - 6, rx: 4, class: 'pge-return-ghost'
      });
      piece.regionGroup.appendChild(node);
      selectionGhosts.push(node);
    });
  }

  function placePieceAt(piece, r, c) {
    piece.placedAt = [r, c];
    piece.lastValidAt = [r, c];
    piece.lastValidOrientIdx = piece.orientIdx;
    piece.lastValidPhysicalTurn = piece.physicalTurn;
    piece.floating = false;
    piece.floatPosition = null;
    renderPiece(piece, regionCellSize);
    piece.g.setAttribute('transform', `translate(${regionOrigin.x + c * regionCellSize},${regionOrigin.y + r * regionCellSize})`);
    piece.g.classList.add('is-placed');
    piece.g.classList.remove('is-floating', 'is-valid-drop', 'is-invalid-drop');
    if (selectedPiece === piece) selectedPiece = null;
    clearSelectionGhost();
    refreshOverlapTextures();
  }

  function returnPieceHome(piece) {
    piece.placedAt = null;
    piece.lastValidAt = null;
    piece.lastValidOrientIdx = null;
    piece.floating = false;
    piece.floatPosition = null;
    piece.orientIdx = piece.homeOrientIdx;
    piece.physicalTurn = piece.homePhysicalTurn;
    renderPiece(piece, trayCellSize);
    piece.g.setAttribute('transform', `translate(${piece.home.x},${piece.home.y})`);
    piece.g.classList.remove('is-placed', 'is-floating', 'is-valid-drop', 'is-invalid-drop');
    if (selectedPiece === piece) selectedPiece = null;
    clearSelectionGhost();
    refreshOverlapTextures();
  }

  function restorePiece(piece) {
    if (piece.lastValidAt) {
      piece.orientIdx = piece.lastValidOrientIdx;
      piece.physicalTurn = piece.lastValidPhysicalTurn;
      placePieceAt(piece, piece.lastValidAt[0], piece.lastValidAt[1]);
    } else {
      returnPieceHome(piece);
    }
  }

  function selectPiece(piece, point) {
    if (selectedPiece && selectedPiece !== piece) restorePiece(selectedPiece);
    // SVG has no useful z-index for sibling groups. Move the active piece to
    // the end of its layer so it always renders above every placed piece.
    if (piece.g.parentNode) piece.g.parentNode.appendChild(piece.g);
    if (!piece.floating) {
      if (piece.placedAt) {
        piece.lastValidAt = [...piece.placedAt];
        piece.lastValidOrientIdx = piece.orientIdx;
      piece.placedAt = null;
      refreshOverlapTextures();
      }
      piece.floating = true;
      selectedPiece = piece;
      renderPiece(piece, floatingCellSize);
      piece.g.classList.remove('is-placed');
      piece.g.classList.add('is-floating');
      showSelectionGhost(piece);
    }
    const fallback = piece.lastValidAt
      ? { x: regionOrigin.x + piece.lastValidAt[1] * regionCellSize, y: regionOrigin.y + piece.lastValidAt[0] * regionCellSize }
      : piece.home;
    const position = point || fallback;
    moveFloatingPiece(piece, position);
  }

  function rotatePiece(piece) {
    if (!active || paused || solved || !piece.floating) return;
    const orients = ORIENTATION_CACHE[piece.pieceIndex];
    const previousDimensions = pieceDimensions(piece, floatingCellSize);
    const previousPosition = piece.floatPosition || { x: 0, y: 0 };
    if (piece.physicalTurn == null) {
      piece.orientIdx = (piece.orientIdx + 1) % orients.length;
    } else {
      piece.physicalTurn = (piece.physicalTurn + 1) % 4;
      piece.orientIdx = PHYSICAL_ROTATION_TO_ORIENT[piece.pieceIndex][piece.physicalTurn];
    }
    const nextDimensions = pieceDimensions(piece, floatingCellSize);
    renderPiece(piece, floatingCellSize);
    moveFloatingPiece(piece, {
      x: previousPosition.x + (previousDimensions.width - nextDimensions.width) / 2,
      y: previousPosition.y + (previousDimensions.height - nextDimensions.height) / 2
    });
    if (dragging && dragging.piece === piece && dragging.currentPoint) {
      dragging.grabOffset = {
        x: dragging.currentPoint.x - piece.floatPosition.x,
        y: dragging.currentPoint.y - piece.floatPosition.y
      };
    }
    playTone(260 + Math.random() * 30, 320, .06, .02);
  }

  function rotateAnchoredPiece(piece) {
    if (!active || paused || solved || !piece.anchor) return;
    const group = piece.anchor.groupId
      ? trayPieces.filter(candidate => candidate.anchor && candidate.anchor.groupId === piece.anchor.groupId)
      : [piece];
    if (group.length === 1) {
      const details = ORIENTATION_DETAIL_CACHE[piece.pieceIndex];
      const previousOrientIdx = piece.orientIdx;
      const previousAt = piece.placedAt && [...piece.placedAt];
      piece.placedAt = null;
      let accepted = null;
      for (let step = 1; step < details.length; step++) {
        const orientIdx = (previousOrientIdx + step) % details.length;
        const pivot = details[orientIdx].find(cell => cell.source === piece.anchor.source);
        const origin = [piece.anchor.boardCell[0] - pivot.r, piece.anchor.boardCell[1] - pivot.c];
        piece.orientIdx = orientIdx;
        const placement = placementAtPosition(piece, {
          x: regionOrigin.x + origin[1] * regionCellSize,
          y: regionOrigin.y + origin[0] * regionCellSize
        });
        if (placement.fits && placement.r === origin[0] && placement.c === origin[1]) {
          accepted = { orientIdx, origin };
          break;
        }
      }
      if (!accepted) {
        piece.orientIdx = previousOrientIdx;
        piece.placedAt = previousAt;
        piece.g.classList.add('is-anchor-blocked');
        if (typeof setTimeout === 'function') setTimeout(() => piece.g.classList.remove('is-anchor-blocked'), 180);
        playTone(170, 120, .09, .02);
        return;
      }
      piece.placedAt = accepted.origin;
      piece.lastValidAt = [...accepted.origin];
      piece.lastValidOrientIdx = accepted.orientIdx;
      renderPiece(piece, regionCellSize);
      renderAnchorPin(piece);
      piece.g.setAttribute('transform', `translate(${regionOrigin.x + accepted.origin[1] * regionCellSize},${regionOrigin.y + accepted.origin[0] * regionCellSize})`);
      piece.g.classList.add('is-placed', 'is-anchored');
      refreshOverlapTextures();
      playTone(240, 380, .1, .025);
      if (checkComplete()) win();
      return;
    }
    const previous = group.map(candidate => ({
      piece: candidate,
      orientIdx: candidate.orientIdx,
      placedAt: candidate.placedAt && [...candidate.placedAt],
      lastValidAt: candidate.lastValidAt && [...candidate.lastValidAt],
      lastValidOrientIdx: candidate.lastValidOrientIdx
    }));
    const maxSteps = Math.max(...group.map(candidate => ORIENTATION_DETAIL_CACHE[candidate.pieceIndex].length));
    let accepted = false;
    let next = [];
    for (let step = 1; step <= maxSteps && !accepted; step++) {
      previous.forEach(state => {
        state.piece.orientIdx = state.orientIdx;
        state.piece.placedAt = null;
      });
      const attempt = [];
      let fits = true;
      group.forEach(candidate => {
        if (!fits) return;
        const details = ORIENTATION_DETAIL_CACHE[candidate.pieceIndex];
        const orientIdx = (candidate.orientIdx + step) % details.length;
        const pivot = details[orientIdx].find(cell => cell.source === candidate.anchor.source);
        const origin = [candidate.anchor.boardCell[0] - pivot.r, candidate.anchor.boardCell[1] - pivot.c];
        candidate.orientIdx = orientIdx;
        const placement = placementAtPosition(candidate, {
          x: regionOrigin.x + origin[1] * regionCellSize,
          y: regionOrigin.y + origin[0] * regionCellSize
        });
        fits = placement.fits && placement.r === origin[0] && placement.c === origin[1];
        if (fits) {
          candidate.placedAt = origin;
          attempt.push({ piece: candidate, orientIdx, origin });
        }
      });
      if (fits && attempt.every(({ piece: candidate, orientIdx }) =>
        orientIdx !== previous.find(state => state.piece === candidate).orientIdx)) {
        accepted = true;
        next = attempt;
      }
    }
    if (!accepted) {
      previous.forEach(state => {
        state.piece.orientIdx = state.orientIdx;
        state.piece.placedAt = state.placedAt;
        state.piece.lastValidAt = state.lastValidAt;
        state.piece.lastValidOrientIdx = state.lastValidOrientIdx;
        state.piece.g.classList.add('is-anchor-blocked');
        if (typeof setTimeout === 'function') setTimeout(() => state.piece.g.classList.remove('is-anchor-blocked'), 180);
      });
      playTone(170, 120, .09, .02);
      return;
    }
    next.forEach(({ piece: candidate, orientIdx, origin }) => {
      candidate.lastValidAt = [...origin];
      candidate.lastValidOrientIdx = orientIdx;
      renderPiece(candidate, regionCellSize);
      renderAnchorPin(candidate);
      candidate.g.setAttribute('transform', `translate(${regionOrigin.x + origin[1] * regionCellSize},${regionOrigin.y + origin[0] * regionCellSize})`);
      candidate.g.classList.add('is-placed', 'is-anchored');
    });
    refreshOverlapTextures();
    playTone(240, 380, .1, .025);
    if (checkComplete()) win();
  }

  function pointFromEvent(event) {
    // Width and height must be scaled independently: the host SVG is CSS-
    // stretched to its container (width:100%; height:100%), which does not
    // preserve the viewBox's aspect ratio. Using a single width-derived scale
    // for both axes (the original bug here) silently corrupts the y-coordinate
    // whenever the rendered box's aspect ratio differs from the viewBox's — the
    // error grows with distance from the top, which is exactly why pieces
    // targeting lower rows failed while upper-row pieces placed correctly.
    const stageRect = stage.getBoundingClientRect();
    const viewBox = stage.viewBox && stage.viewBox.baseVal;
    const scaleX = (viewBox && stageRect.width) ? viewBox.width / stageRect.width : 1;
    const scaleY = (viewBox && stageRect.height) ? viewBox.height / stageRect.height : 1;
    return { x: ((event.clientX || 0) - stageRect.left) * scaleX, y: ((event.clientY || 0) - stageRect.top) * scaleY };
  }

  function piecePosition(piece) {
    if (piece.floating && piece.floatPosition) return piece.floatPosition;
    if (piece.placedAt) {
      return {
        x: regionOrigin.x + piece.placedAt[1] * regionCellSize,
        y: regionOrigin.y + piece.placedAt[0] * regionCellSize
      };
    }
    return piece.home;
  }

  function dragPosition(point, drag) {
    return {
      x: point.x - drag.grabOffset.x,
      y: point.y - drag.grabOffset.y
    };
  }

  function startDrag(piece, event) {
    if (!active || paused || solved || piece.layerLocked) return;
    if (event.preventDefault) event.preventDefault();
    if (piece.anchor) {
      rotateAnchoredPiece(piece);
      return;
    }
    if (dragging) {
      if (event.pointerId !== dragging.pointerId) {
        event.packingRotateHandled = true;
        rotatePiece(dragging.piece);
      }
      return;
    }
    const point = pointFromEvent(event);
    const position = piecePosition(piece);
    const sourceCellSize = piece.renderCellSize || trayCellSize;
    const liftScale = floatingCellSize / sourceCellSize;
    const touchLift = event.pointerType === 'touch' ? regionCellSize * 2.3 : 0;
    dragging = {
      piece,
      startedAt: performance.now(),
      moved: false,
      startedFloating: piece.floating,
      startedPlaced: Boolean(piece.placedAt),
      pointerId: event.pointerId,
      point,
      currentPoint: point,
      // Preserve the exact point the player grabbed as a piece changes from
      // rack-preview scale to board scale. Re-centering on the pointer caused
      // the piece to visibly jump sideways on the first movement.
      grabOffset: {
        x: (point.x - position.x) * liftScale,
        y: (point.y - position.y) * liftScale + touchLift
      }
    };
    if (piece.g.setPointerCapture && event.pointerId != null) {
      try { piece.g.setPointerCapture(event.pointerId); } catch (error) {}
    }
    selectPiece(piece, dragPosition(point, dragging));
    piece.g.classList.add('is-dragging');
  }

  function placementAtPosition(piece, position) {
    const r = Math.round((position.y - regionOrigin.y) / regionCellSize);
    const c = Math.round((position.x - regionOrigin.x) / regionCellSize);
    const cells = currentDetailedCells(piece, [r, c]);
    const regionSet = new Set(puzzle.region.map(([rr, cc]) => key(rr, cc)));
    const zoneSet = new Set((puzzle.overlapZone || []).map(([rr, cc]) => key(rr, cc)));
    if (zoneSet.size && layerPhase === 2) {
      const fitsSecondLayer = cells.every(cell => {
        const cellKey = key(cell.r, cell.c);
        if (!zoneSet.has(cellKey)) return false;
        const occupants = trayPieces.filter(other => other !== piece && other.placedAt &&
          currentCells(other).some(([or, oc]) => or === cell.r && oc === cell.c));
        return occupants.length === 1;
      });
      return { r, c, fits: fitsSecondLayer };
    }
    const collisions = [];
    const fitsCells = cells.every(cell => {
      const k = key(cell.r, cell.c);
      if (!regionSet.has(k)) return false;
      const occupants = trayPieces.filter(other => other !== piece && other.placedAt &&
        currentCells(other).some(([or, oc]) => or === cell.r && oc === cell.c));
      if (!occupants.length) return true;
      if (zoneSet.size && layerPhase === 1) return false;
      if (occupants.length >= 2) return false;
      const node = (puzzle.overlapNodes || []).find(candidate => candidate.key === k);
      if (!node && !zoneSet.has(k)) return false;
      collisions.push({ key: k, other: occupants[0] });
      return true;
    });
    const otherAlreadyOverlaps = collisions.some(({ other }) => trayPieces.some(candidate =>
      candidate !== piece && candidate !== other && candidate.placedAt &&
      currentCells(candidate).some(([cr, cc]) => currentCells(other).some(([or, oc]) => or === cr && oc === cc))
    ));
    const fits = fitsCells && (zoneSet.size ? true : collisions.length <= 1 && !otherAlreadyOverlaps);
    return { r, c, fits };
  }

  function moveDrag(event) {
    if (!dragging) return;
    if (dragging.pointerId != null && event.pointerId != null && event.pointerId !== dragging.pointerId) return;
    if (event.preventDefault) event.preventDefault();
    const point = pointFromEvent(event);
    dragging.currentPoint = point;
    const position = dragPosition(point, dragging);
    if (Math.hypot(point.x - dragging.point.x, point.y - dragging.point.y) >= 3) dragging.moved = true;
    moveFloatingPiece(dragging.piece, position);
    const placement = placementAtPosition(dragging.piece, dragging.piece.floatPosition);
    dragging.piece.g.classList.toggle('is-valid-drop', placement.fits);
    dragging.piece.g.classList.toggle('is-invalid-drop', !placement.fits);
  }

  function pointInRack(point) {
    return rackArea &&
      point.x >= rackArea.x && point.x <= rackArea.x + rackArea.width &&
      point.y >= rackArea.y && point.y <= rackArea.y + rackArea.height;
  }

  function endDrag(event) {
    if (!dragging) return;
    if (dragging.pointerId != null && event.pointerId != null && event.pointerId !== dragging.pointerId) return;
    if (event.preventDefault) event.preventDefault();
    const drag = dragging;
    const { piece, moved } = drag;
    if (piece.g.releasePointerCapture && event.pointerId != null) {
      try { piece.g.releasePointerCapture(event.pointerId); } catch (error) {}
    }
    piece.g.classList.remove('is-dragging');
    dragging = null;
    if (!moved) {
      const now = performance.now();
      if (drag.startedPlaced && lastTapPiece === piece && now - lastTapAt <= 350) {
        lastTapPiece = null;
        lastTapAt = -Infinity;
        returnPieceHome(piece);
        playTone(280, 180, .1, .025);
        return;
      }
      restorePiece(piece);
      lastTapPiece = drag.startedPlaced ? piece : null;
      lastTapAt = now;
      return;
    }
    lastTapPiece = null;
    lastTapAt = -Infinity;

    // Placement must win over the rack hit-test. On touch screens the piece is
    // lifted above the finger, so a valid-looking board drop can still have the
    // finger down in the rack area. Using the visual/floating piece position
    // first makes the drop behavior match what the player sees.
    const placement = placementAtPosition(piece, piece.floatPosition);
    if (placement.fits) {
      placePieceAt(piece, placement.r, placement.c);
      playTone(300, 460, .14, .035);
      if (unlockLayerTwo()) return;
      if (checkComplete()) win();
      return;
    }

    const point = pointFromEvent(event);
    if (pointInRack(point)) {
      returnPieceHome(piece);
      playTone(220, 150, .1, .02);
      return;
    }

    restorePiece(piece);
    playTone(200, 150, .12, .025);
  }


  function win() {
    if (solved) return;
    solved = true;
    playTone(392, 784, .32, .06);
    const stageHost = config && element(config.stageId);
    if (stageHost && stageHost.classList) stageHost.classList.add('is-completing');
    const celebrateCells = trayPieces
      .filter(piece => piece.placedAt)
      .flatMap(piece => (piece.cellNodes || []).map(node => ({
        piece,
        node,
        r: piece.placedAt[0] + Number(node.getAttribute('data-cell-r') || 0),
        c: piece.placedAt[1] + Number(node.getAttribute('data-cell-c') || 0),
      })))
      .sort((a, b) => a.r - b.r || a.c - b.c);
    const reducedMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const cellDelay = reducedMotion ? 8 : 90;
    celebrateCells.forEach((entry, index) => {
      if (typeof setTimeout !== 'function') entry.node.classList.add('is-victory-lit');
      else victoryTimers.push(setTimeout(() => entry.node.classList.add('is-victory-lit'), index * cellDelay));
    });
    trayPieces.filter(piece => piece.placedAt).forEach(piece => {
      const pieceCells = celebrateCells.filter(entry => entry.piece === piece);
      const lockDelay = pieceCells.length ? (celebrateCells.indexOf(pieceCells.at(-1)) + 1) * cellDelay + (reducedMotion ? 0 : 180) : 0;
      if (typeof setTimeout !== 'function') piece.g.classList.add('is-victory-locked');
      else victoryTimers.push(setTimeout(() => piece.g.classList.add('is-victory-locked'), lockDelay));
    });
    const finish = () => {
      victoryTimers = [];
      if (!active || !config) return;
      if (stageHost && stageHost.classList) stageHost.classList.add('is-solved');
      if (typeof config.onComplete === 'function') config.onComplete({ solution: puzzle.solution, pieceIndexList: puzzle.pieceIndexList });
    };
    const totalDuration = reducedMotion ? 120 : Math.max(2200, celebrateCells.length * cellDelay + 900);
    if (typeof setTimeout === 'function') victoryTimers.push(setTimeout(finish, totalDuration));
    else finish();
  }


  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function applyDynamicElementLayout(nextConfig, bounds) {
    const opts = nextConfig.autoLayout;
    if (!opts || opts.enabled === false || !stage) return null;
    const stageRect = stage.getBoundingClientRect ? stage.getBoundingClientRect() : null;
    const renderedWidth = stageRect && stageRect.width ? stageRect.width : Number(opts.width) || 560;
    const renderedHeight = stageRect && stageRect.height ? stageRect.height : Number(opts.fallbackHeight) || 900;
    const useHorizontal = renderedWidth >= (Number(opts.horizontalMinWidth) || 900) &&
      renderedWidth / Math.max(1, renderedHeight) >= (Number(opts.horizontalMinAspect) || 1.2);
    const logicalWidth = useHorizontal ? Number(opts.horizontalWidth) || 960 : Number(opts.width) || 560;
    if (stage.classList) stage.classList.toggle('is-horizontal-layout', useHorizontal);

    if (useHorizontal) {
      const logicalHeight = Number(opts.horizontalHeight) || 620;
      stage.setAttribute('viewBox', `0 0 ${logicalWidth} ${logicalHeight}`);
      stage.setAttribute('preserveAspectRatio', 'xMidYMid meet');
      stage.querySelectorAll('.packing-stage-bg, .packing-space-scenery > rect, .packing-jungle-scenery > rect, .packing-ice-scenery > rect, .packing-ocean-scenery > rect, .packing-magic-scenery > rect').forEach(node => {
        node.setAttribute('width', logicalWidth);
        node.setAttribute('height', logicalHeight);
      });

      const columns = bounds.maxC - bounds.minC + 1;
      const rows = bounds.maxR - bounds.minR + 1;
      const boardArea = { x: 470, y: 24, width: 466, height: 572, maxCellSize: 82 };
      const fittedCellSize = Math.floor(Math.min(
        boardArea.width / columns,
        boardArea.height / rows,
        boardArea.maxCellSize
      ));
      const rackArea = { x: 30, y: 76, width: 380, height: 518 };
      const trayCols = puzzle && puzzle.pieceIndexList && puzzle.pieceIndexList.length <= 6 ? 3 : 4;
      const trayRows = Math.ceil((puzzle && puzzle.pieceIndexList ? puzzle.pieceIndexList.length : 10) / trayCols);
      const slotWidth = rackArea.width / trayCols;
      const slotHeight = rackArea.height / trayRows;
      const trayCellSize = Math.floor(clamp(Math.min(slotWidth / 3.75, slotHeight / 4.25, fittedCellSize * .55), 20, 30));
      const rackBackground = element(nextConfig.rackBackgroundId);
      if (rackBackground) {
        rackBackground.setAttribute('x', 18);
        rackBackground.setAttribute('y', 16);
        rackBackground.setAttribute('width', 404);
        rackBackground.setAttribute('height', 588);
      }
      const rackLabel = element(nextConfig.rackLabelId);
      if (rackLabel) {
        rackLabel.setAttribute('x', 42);
        rackLabel.setAttribute('y', 52);
      }
      const rackMobileHint = element(nextConfig.rackMobileHintId);
      if (rackMobileHint) {
        rackMobileHint.setAttribute('x', 42);
        rackMobileHint.setAttribute('y', 52);
      }
      return {
        regionArea: boardArea,
        regionAlignY: 'center',
        rackArea,
        dynamicRack: false,
        rackGap: 0,
        rackBottom: logicalHeight - 20,
        trayCols,
        trayCellSize,
        rackRowSpacing: Math.floor(slotHeight),
        rackTopPadding: 8,
        layoutMode: 'horizontal'
      };
    }

    const minHeight = Number(opts.minHeight) || 640;
    const maxHeight = Number(opts.maxHeight) || 1040;
    const logicalHeight = Math.round(clamp(logicalWidth * (renderedHeight / Math.max(1, renderedWidth)), minHeight, maxHeight));

    stage.setAttribute('viewBox', `0 0 ${logicalWidth} ${logicalHeight}`);
    stage.setAttribute('preserveAspectRatio', opts.preserveAspectRatio || 'xMidYMin meet');

    stage.querySelectorAll('.packing-stage-bg, .packing-space-scenery > rect, .packing-jungle-scenery > rect, .packing-ice-scenery > rect, .packing-ocean-scenery > rect, .packing-magic-scenery > rect').forEach(node => {
      node.setAttribute('width', logicalWidth);
      node.setAttribute('height', logicalHeight);
    });

    const columns = bounds.maxC - bounds.minC + 1;
    const rows = bounds.maxR - bounds.minR + 1;
    const topPad = Number(opts.topPad) || 24;
    const sidePad = Number(opts.sidePad) || 24;
    const rackSidePad = Number(opts.rackSidePad) || 30;
    const bottomPad = Number(opts.bottomPad) || 22;
    const rackGap = Number(opts.rackGap) || 24;
    const rackLabelSpace = Number(opts.rackLabelSpace) || 60;
    const maxBoardHeight = Math.min(Number(opts.maxBoardHeight) || 520, logicalHeight * (Number(opts.boardHeightRatio) || 0.5));
    const regionWidth = logicalWidth - sidePad * 2;
    const cellMax = Number(opts.maxCellSize) || 88;
    const fittedCellSize = Math.floor(Math.max(12, Math.min(regionWidth / columns, maxBoardHeight / rows, cellMax)));
    const boardHeight = rows * fittedCellSize;

    const rackY = topPad + boardHeight + rackGap + rackLabelSpace;
    const rackBottom = Math.max(rackY + (Number(opts.minRackHeight) || 210), logicalHeight - bottomPad);
    const rackHeight = Math.max(Number(opts.minRackHeight) || 210, rackBottom - rackY);
    const pieceCount = puzzle && puzzle.pieceIndexList ? puzzle.pieceIndexList.length : 10;
    const trayCols = nextConfig.trayCols || (pieceCount <= 4 ? 4 : 5);
    const trayRows = Math.ceil(pieceCount / trayCols);
    const slotWidth = (logicalWidth - rackSidePad * 2) / trayCols;
    const slotHeight = rackHeight / trayRows;
    const minTray = Number(opts.minTrayCellSize) || 21;
    const maxTray = Number(opts.maxTrayCellSize) || 31;
    const fittedTrayCell = Math.floor(clamp(Math.min(slotWidth / 3.75, slotHeight / 4.25, fittedCellSize * 0.55), minTray, maxTray));
    const fittedRowSpacing = Math.floor(Math.min(Number(opts.maxRackRowSpacing) || 118, slotHeight));

    return {
      regionArea: {
        x: sidePad,
        y: topPad,
        width: regionWidth,
        height: boardHeight,
        maxCellSize: fittedCellSize
      },
      regionAlignY: 'top',
      rackArea: {
        x: rackSidePad,
        y: rackY,
        width: logicalWidth - rackSidePad * 2,
        height: rackHeight
      },
      rackGap,
      rackBottom,
      trayCols,
      trayCellSize: fittedTrayCell,
      rackRowSpacing: fittedRowSpacing,
      rackTopPadding: nextConfig.rackTopPadding == null ? 4 : nextConfig.rackTopPadding
    };
  }

  // ---- Lifecycle --------------------------------------------------------------

  function start(nextConfig) {
    destroy();
    config = nextConfig;
    const stageHost = element(nextConfig.stageId);
    // stageId may point at a wrapping container rather than the <svg> itself
    // (e.g. a div the mission wraps the stage in for chrome/overlays) — only an
    // actual <svg> element has a usable .viewBox, so resolve down to it. Using
    // the wrong node here silently defaults scaleX/scaleY to 1 in
    // pointFromEvent, which looks fine near the top of the stage and drifts
    // further off with every row/col away from the origin.
    stage = stageHost && stageHost.tagName && stageHost.tagName.toLowerCase() === 'svg'
      ? stageHost
      : (stageHost && stageHost.querySelector ? stageHost.querySelector('svg') : null);
    const regionGroup = element(nextConfig.regionGroupId);
    const trayGroup = element(nextConfig.trayGroupId);
    if (!stage || !regionGroup || !trayGroup) return false;

    puzzle = generate({
      pieceCount: nextConfig.pieceCount == null ? 8 : nextConfig.pieceCount,
      pieceIndexList: nextConfig.pieceIndexList,
      targetMin: nextConfig.targetMin == null ? 3 : nextConfig.targetMin,
      targetMax: nextConfig.targetMax == null ? 4 : nextConfig.targetMax,
      maxDimension: nextConfig.maxDimension == null ? 8 : nextConfig.maxDimension,
      maxAspectRatio: nextConfig.maxAspectRatio,
      verifySolutions: nextConfig.verifySolutions !== false,
      minHoles: nextConfig.minHoles,
      maxHoles: nextConfig.maxHoles,
      linkCount: nextConfig.linkCount,
      linkSharedCount: nextConfig.linkSharedCount,
      overlapCount: nextConfig.overlapCount,
      anchorCount: nextConfig.anchorCount,
      anchorGroupCount: nextConfig.anchorGroupCount,
      overlapZoneSize: nextConfig.overlapZoneSize,
      surplusCount: nextConfig.surplusCount
    });
    if (!puzzle) return false;

    active = true; paused = !!nextConfig.initiallyPaused; solved = false;
    layerPhase = puzzle.overlapZone && puzzle.overlapZone.length ? 1 : 0;
    if (typeof nextConfig.onLayerChange === 'function') nextConfig.onLayerChange(layerPhase);

    while (regionGroup.firstChild) regionGroup.removeChild(regionGroup.firstChild);
    while (trayGroup.firstChild) trayGroup.removeChild(trayGroup.firstChild);

    // draw the empty region outline (per-cell sockets)
    const bounds = regionBounds(puzzle.region);
    const board = puzzle.board || deriveBoard(puzzle.region);
    const dynamicLayout = applyDynamicElementLayout(nextConfig, bounds);
    if (dynamicLayout) {
      nextConfig = { ...nextConfig, ...dynamicLayout };
      config = nextConfig;
    }
    const regionArea = nextConfig.regionArea;
    if (regionArea) {
      const columns = bounds.maxC - bounds.minC + 1;
      const rows = bounds.maxR - bounds.minR + 1;
      regionCellSize = Math.floor(Math.min(regionArea.width / columns, regionArea.height / rows, regionArea.maxCellSize || Infinity));
      regionOrigin = {
        x: regionArea.x + (regionArea.width - columns * regionCellSize) / 2 - bounds.minC * regionCellSize,
        y: (nextConfig.regionAlignY === 'top'
          ? regionArea.y
          : regionArea.y + (regionArea.height - rows * regionCellSize) / 2) - bounds.minR * regionCellSize
      };
    } else {
      regionCellSize = nextConfig.cellSize || 44;
      regionOrigin = nextConfig.regionOrigin || { x: 0, y: 0 };
    }
    trayCellSize = nextConfig.trayCellSize || Math.min(30, regionCellSize);
    // Rack pieces are compact previews. Once lifted, each piece switches to the
    // board's exact cell scale so its fit is visually honest before placement.
    floatingCellSize = Math.min(regionCellSize, nextConfig.floatingCellSize || regionCellSize);
    rackArea = nextConfig.rackArea ? { ...nextConfig.rackArea } : null;
    if (rackArea && nextConfig.dynamicRack) {
      const boardBottom = regionOrigin.y + (bounds.maxR + 1) * regionCellSize;
      rackArea.y = boardBottom + (nextConfig.rackGap == null ? 34 : nextConfig.rackGap) + 60;
      rackArea.height = Math.max(250, (nextConfig.rackBottom || 1095) - rackArea.y);
      const rackBackground = element(nextConfig.rackBackgroundId);
      if (rackBackground) {
        rackBackground.setAttribute('x', rackArea.x - 12);
        rackBackground.setAttribute('y', rackArea.y - 60);
        rackBackground.setAttribute('width', rackArea.width + 24);
        rackBackground.setAttribute('height', rackArea.height + 60);
      }
      const rackLabel = element(nextConfig.rackLabelId);
      if (rackLabel) rackLabel.setAttribute('y', rackArea.y - 28);
      const rackMobileHint = element(nextConfig.rackMobileHintId);
      if (rackMobileHint) rackMobileHint.setAttribute('y', rackArea.y - 28);
    }
    // A rect sized to the region's own bounding box, drawn beneath the sockets,
    // so a host can visually distinguish "this is the puzzle" from its
    // surrounding stage (e.g. Repair Moon fills it with a starfield so the
    // silhouette reads as a hull breach rather than the puzzle floating in
    // otherwise-undifferentiated space). Generic: no fill by default, purely a
    // CSS hook (.pge-region-bg) plus an optional inline override.
    const bgPad = 6;
    const bgRect = svg('rect', {
      x: regionOrigin.x + bounds.minC * regionCellSize - bgPad,
      y: regionOrigin.y + bounds.minR * regionCellSize - bgPad,
      width: (bounds.maxC - bounds.minC + 1) * regionCellSize + bgPad * 2,
      height: (bounds.maxR - bounds.minR + 1) * regionCellSize + bgPad * 2,
      rx: 10, class: 'pge-region-bg'
    });
    if (nextConfig.regionBackgroundFill) bgRect.setAttribute('fill', nextConfig.regionBackgroundFill);
    regionGroup.appendChild(bgRect);
    board.blocked.forEach(([r, c]) => {
      const x = regionOrigin.x + c * regionCellSize + 1;
      const y = regionOrigin.y + r * regionCellSize + 1;
      const size = regionCellSize - 2;
      regionGroup.appendChild(svg('rect', {
        x, y, width: size, height: size, rx: 3, class: 'pge-blocked'
      }));
      regionGroup.appendChild(svg('path', {
        d: `M${x + 6},${y + size - 2}L${x + size - 2},${y + 6}` +
          `M${x + 2},${y + size - 12}L${x + size - 12},${y + 2}` +
          `M${x + 12},${y + size - 2}L${x + size - 2},${y + 12}`,
        class: 'pge-blocked-hatch'
      }));
    });
    (puzzle.overlapZone || []).forEach(([r, c]) => {
      regionGroup.appendChild(svg('rect', {
        x: regionOrigin.x + c * regionCellSize + 3,
        y: regionOrigin.y + r * regionCellSize + 3,
        width: regionCellSize - 6, height: regionCellSize - 6, rx: 5,
        class: 'pge-overlap-zone-cell'
      }));
    });
    puzzle.region.forEach(([r, c]) => {
      regionGroup.appendChild(svg('rect', {
        x: regionOrigin.x + c * regionCellSize + 1, y: regionOrigin.y + r * regionCellSize + 1,
        width: regionCellSize - 2, height: regionCellSize - 2, rx: 3, class: 'pge-socket'
      }));
    });
    (puzzle.overlapNodes || []).forEach(node => {
      const glyph = svg('text', {
        x: regionOrigin.x + (node.c + .5) * regionCellSize,
        y: regionOrigin.y + (node.r + .5) * regionCellSize,
        'text-anchor': 'middle', 'dominant-baseline': 'middle', class: 'pge-overlap-node-glyph'
      });
      glyph.textContent = '2';
      regionGroup.appendChild(glyph);
      node.glyph = glyph;
    });

    // lay out tray pieces below/around the region, scrambled to a non-solved orientation
    trayPieces = [];
    const trayCols = nextConfig.trayCols || 5;
    const trayRows = Math.ceil(puzzle.pieceIndexList.length / trayCols);
    const trayOrigin = nextConfig.trayOrigin || { x: 0, y: regionOrigin.y + (bounds.maxR - bounds.minR + 2) * regionCellSize };
    const slotWidth = rackArea ? rackArea.width / trayCols : (nextConfig.traySpacing || trayCellSize * 4.2);
    const slotHeight = rackArea
      ? Math.min(nextConfig.rackRowSpacing || 120, rackArea.height / trayRows)
      : (nextConfig.trayRowSpacing || slotWidth);
    const rackContentTop = rackArea
      ? rackArea.y + (nextConfig.rackTopPadding == null ? 8 : nextConfig.rackTopPadding)
      : 0;
    const rackPositions = puzzle.pieceIndexList.map((_, index) => index);
    if (puzzle.surplusCount) {
      for (let i = rackPositions.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [rackPositions[i], rackPositions[j]] = [rackPositions[j], rackPositions[i]];
      }
    }
    if (puzzle.surplusCount && puzzle.usedPieceCount < rackPositions.length) {
      const surplusSlots = new Set(
        puzzle.pieceIndexList.map((_, slot) => slot).slice(puzzle.usedPieceCount)
      );
      const surplusStillAtEnd = rackPositions.slice(puzzle.usedPieceCount).every(slot => surplusSlots.has(slot));
      if (surplusStillAtEnd) {
        [rackPositions[0], rackPositions[puzzle.usedPieceCount]] = [rackPositions[puzzle.usedPieceCount], rackPositions[0]];
      }
    }
    const rackPositionBySlot = new Map(rackPositions.map((slot, position) => [slot, position]));
    puzzle.pieceIndexList.forEach((pieceIndex, i) => {
      const orients = ORIENTATION_CACHE[pieceIndex];
      const solvedPiece = puzzle.solution[i];
      const solvedOrientIdx = solvedPiece ? solvedPiece.orientIdx : randomInt(orients.length);
      const scrambleCandidates = orients.map((_, idx) => idx).filter(idx => idx !== solvedOrientIdx);
      const startOrientIdx = scrambleCandidates.length ? scrambleCandidates[randomInt(scrambleCandidates.length)] : solvedOrientIdx;
      const rackPosition = rackPositionBySlot.get(i);
      const col = rackPosition % trayCols, row = Math.floor(rackPosition / trayCols);
      const shape = orients[startOrientIdx];
      const shapeCols = Math.max(...shape.map(([, c]) => c)) + 1;
      const shapeRows = Math.max(...shape.map(([r]) => r)) + 1;
      const home = {
        x: (rackArea ? rackArea.x : trayOrigin.x) + col * slotWidth + (slotWidth - shapeCols * trayCellSize) / 2,
        y: (rackArea ? rackContentTop : trayOrigin.y) + row * slotHeight + (slotHeight - shapeRows * trayCellSize) / 2
      };
      const g = svg('g', { class: 'pge-piece', transform: `translate(${home.x},${home.y})` });
      trayGroup.appendChild(g);
      const anchor = (puzzle.anchors || []).find(candidate => candidate.slot === i) || null;
      const hasLinks = (puzzle.links || []).some(link => link.pieceSlots.includes(i));
      const physicalTurn = hasLinks
        ? PHYSICAL_ROTATION_TO_ORIENT[pieceIndex].findIndex(orientIdx => orientIdx === startOrientIdx)
        : null;
      const piece = {
        slot: i, pieceIndex, orientIdx: startOrientIdx, homeOrientIdx: startOrientIdx,
        physicalTurn, homePhysicalTurn: physicalTurn, lastValidPhysicalTurn: null,
        g, home, placedAt: null, lastValidAt: null, lastValidOrientIdx: null,
        floating: false, floatPosition: null, regionGroup, anchor
      };
      trayPieces.push(piece);
      renderPiece(piece, trayCellSize);
      if (anchor) {
        piece.orientIdx = anchor.startOrientIdx;
        piece.placedAt = [...anchor.startOrigin];
        piece.lastValidAt = [...anchor.startOrigin];
        piece.lastValidOrientIdx = anchor.startOrientIdx;
        renderPiece(piece, regionCellSize);
        renderAnchorPin(piece);
        piece.g.setAttribute('transform', `translate(${regionOrigin.x + anchor.startOrigin[1] * regionCellSize},${regionOrigin.y + anchor.startOrigin[0] * regionCellSize})`);
        piece.g.classList.add('is-placed', 'is-anchored');
      }
      addListener(g, 'pointerdown', event => startDrag(piece, event), { passive: false });
    });
    mountOverlapZoneIndicators();
    refreshOverlapTextures();

    addListener(stage, 'pointermove', moveDrag, { passive: false });
    addListener(stage, 'pointerup', endDrag, { passive: false });
    addListener(stage, 'pointercancel', endDrag, { passive: false });
    addListener(stage, 'pointerleave', endDrag, { passive: false });
    addListener(stage, 'pointerdown', event => {
      if (event.packingRotateHandled) return;
      if (dragging && event.pointerId !== dragging.pointerId) {
        if (event.preventDefault) event.preventDefault();
        rotatePiece(dragging.piece);
        return;
      }
      if (!selectedPiece || dragging) return;
      const targetPiece = event.target && event.target.closest ? event.target.closest('.pge-piece') : null;
      if (!targetPiece) restorePiece(selectedPiece);
    });
    addListener(stage, 'contextmenu', event => {
      if (event.preventDefault) event.preventDefault();
      if (dragging) rotatePiece(dragging.piece);
    });
    // Safari can promote a long press or slightly delayed SVG drag into its
    // native selection/callout tool even when pointer dragging has started.
    // The puzzle stage owns these gestures completely.
    addListener(stage, 'dragstart', event => {
      if (event.preventDefault) event.preventDefault();
    });
    addListener(stage, 'selectstart', event => {
      if (event.preventDefault) event.preventDefault();
    });
    if (window && typeof window.addEventListener === 'function') {
      addListener(window, 'keydown', event => {
        if (!dragging || event.code !== 'Space') return;
        if (event.preventDefault) event.preventDefault();
        rotatePiece(dragging.piece);
      });
    }
    return true;
  }

  function begin() {
    if (!active) return false;
    paused = false;
    return true;
  }

  function reset() {
    if (!active || !puzzle) return false;
    dragging = null;
    selectedPiece = null;
    solved = false;
    layerPhase = puzzle.overlapZone && puzzle.overlapZone.length ? 1 : 0;
    if (stage && stage.classList) stage.classList.remove('is-layer-two-open');
    if (overlapZoneBanner) overlapZoneBanner.textContent = 'LAYER 2 · SEALED';
    if (typeof config.onLayerChange === 'function') config.onLayerChange(layerPhase);
    clearSelectionGhost();
    trayPieces.forEach(piece => {
      piece.layerLocked = false;
      piece.g.classList.remove('is-dragging', 'is-anchor-blocked', 'is-layer-one-locked');
      if (!piece.anchor) {
        returnPieceHome(piece);
        return;
      }
      piece.orientIdx = piece.anchor.startOrientIdx;
      piece.placedAt = [...piece.anchor.startOrigin];
      piece.lastValidAt = [...piece.anchor.startOrigin];
      piece.lastValidOrientIdx = piece.anchor.startOrientIdx;
      piece.floating = false;
      piece.floatPosition = null;
      renderPiece(piece, regionCellSize);
      renderAnchorPin(piece);
      piece.g.setAttribute('transform', `translate(${regionOrigin.x + piece.anchor.startOrigin[1] * regionCellSize},${regionOrigin.y + piece.anchor.startOrigin[0] * regionCellSize})`);
      piece.g.classList.add('is-placed', 'is-anchored');
      piece.g.classList.remove('is-floating', 'is-valid-drop', 'is-invalid-drop');
    });
    refreshOverlapTextures();
    return true;
  }

  function destroy() {
    if (typeof clearTimeout === 'function') victoryTimers.forEach(timer => clearTimeout(timer));
    victoryTimers = [];
    listeners.forEach(({ node, type, handler }) => node.removeEventListener(type, handler));
    listeners = [];
    if (overlapZoneLayer && overlapZoneLayer.parentNode) overlapZoneLayer.parentNode.removeChild(overlapZoneLayer);
    overlapZoneLayer = null;
    overlapZoneIndicators = new Map();
    overlapZoneBanner = null;
    active = false; paused = true; solved = false; layerPhase = 0;
    clearSelectionGhost();
    config = null; stage = null; puzzle = null; trayPieces = []; dragging = null; selectedPiece = null; rackArea = null; floatingCellSize = 0;
    lastTapPiece = null; lastTapAt = -Infinity;
  }

  // read-only: current puzzle + tray piece elements (used by tests; harmless)
  function getPuzzle() { return puzzle; }
  function getTrayPieces() { return trayPieces; }

  window.PackingGameEngine = Object.freeze({
    // puzzle logic (usable headless, e.g. by tests or a future generator tool)
    PIECE_LIBRARY, PIECE_COLORS, orientations, solveCount, generate,
    // rendering lifecycle
    start, begin, reset, rebuildLayerOne: reset, destroy,
    isActive() { return active; },
    isSolved() { return solved; },
    getPuzzle, getTrayPieces,
    checkComplete,
    getLayerPhase() { return layerPhase; }
  });
})();
