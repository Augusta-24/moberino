/* GRID LOCK — standalone puzzle engine, duplicated from js/games/journey-cache.js
   ("Seal the Vault") so it can be developed independently of Journey. A coupled
   conduit-lattice puzzle in the Infinity-Loop tradition. Every conduit opening on
   the whole board must connect to a matching opening on a neighbour: any loose
   end anywhere keeps the lattice unsealed. Rotating one tile constrains its
   neighbours, so every tile is a real decision solved by deduction, and there is
   no dead space. When the whole lattice is sealed and the core is joined to all
   three bolts, current floods the network and the bolts fire. This module owns
   the interaction only and never touches persistent save state — it is a
   byte-for-byte copy of the gameplay logic in journey-cache.js, renamed so the
   two can render in the same document without id/class collisions. Do not import
   this from journey.js or vice versa; the two are intentionally independent
   copies per the "duplicate, don't extract" architecture decision. */
(function () {
  'use strict';

  let COLS = 6;
  let ROWS = 6;
  let X0 = 82;
  const Y0 = 250;
  let S = 66;
  let SOURCE = { r: 5, c: 0 };
  let SOURCES = [SOURCE];
  let SINKS = [{ r: 0, c: 1, bolt: 0 }, { r: 0, c: 3, bolt: 1 }, { r: 0, c: 5, bolt: 2 }];
  let POWER_SYSTEMS = [{ id: 'cyan', color: 'cyan', source: SOURCE, sinks: SINKS }];
  let SYSTEM_SPLIT_COLUMNS = [];
  let routerConfigs = [];
  let LOOP_EDGE_CHANCE = 0.34;   // extra edges beyond the spanning tree → loops, fewer trivial end-caps

  const ORDER = ['n', 'e', 's', 'w'];
  const DELTA = { n: [-1, 0], e: [0, 1], s: [1, 0], w: [0, -1] };
  const OPP = { n: 's', e: 'w', s: 'n', w: 'e' };
  // Full Infinity-Loop piece set: 1..4 openings.
  const SHAPES = { END: ['n'], I: ['n', 's'], L: ['n', 'e'], T: ['n', 'e', 's'], X: ['n', 'e', 's', 'w'] };

  const NS = 'http://www.w3.org/2000/svg';

  let active = false;
  let phase = 'idle';   // idle -> play -> done
  let solved = false;
  let config = null;
  let stage = null;
  let gridGroup = null;
  let tiles = [];
  let listeners = [];
  let timers = [];
  let rotations = 0;
  let startedAt = 0;
  let slidingConfig = null;
  let solutionEmpty = null;
  let emptySlot = null;
  let gesture = null;
  let obstacleConfig = null;
  let blockedCells = new Set();
  let lockedConfig = null;
  let lockedCells = new Set();
  let lastEvaluation = { status: 'SYSTEM FAULT', crossCount: 0, leakCount: 0, boltsOnline: 0 };
  let history = [];
  let initialBoardState = null;

  function element(id) { return document.getElementById(id); }
  function svg(tag, attrs) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function key(r, c) { return `${r},${c}`; }
  function isSink(r, c, side) { return SINKS.some(s => s.r === r && s.c === c && (!side || s.side === side)); }
  function systemIndexAt(r, c) { return POWER_SYSTEMS.length > 1 ? (c < SYSTEM_SPLIT_COLUMNS[r] ? 0 : 1) : 0; }
  function routerConfigAt(r, c) { return routerConfigs.find(router => router.r === r && router.c === c) || null; }
  function isRouterCell(r, c) { return Boolean(routerConfigAt(r, c)); }
  function routerSolutionSystemForDirection(r, c, dir) {
    const router = routerConfigAt(r, c);
    if (!router) return null;
    return dir === 'n' || dir === 's' ? router.solutionChannels.vertical : router.solutionChannels.horizontal;
  }
  // Generation-only ownership. Runtime power color is always discovered by
  // tracing from the live cores and never read from this private recipe split.
  function solutionSystemAt(r, c, dir) { return isRouterCell(r, c) ? routerSolutionSystemForDirection(r, c, dir) : systemIndexAt(r, c); }
  function sourceAt(r, c) { return SOURCES.findIndex(source => source.r === r && source.c === c); }
  function sinkAt(r, c) { return SINKS.find(sink => sink.r === r && sink.c === c) || null; }
  function colorChoiceForSystem(systemIndex) { return POWER_SYSTEMS[systemIndex] && POWER_SYSTEMS[systemIndex].color === 'green' ? 1 : 0; }

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
  function later(cb, delay) { let h = null; const run = () => { if (h !== null) timers = timers.filter(x => x !== h); cb(); }; h = window.setTimeout(run, delay); timers.push(h); return h; }
  function clearTimers() { timers.forEach(id => window.clearTimeout(id)); timers = []; }
  function setSystemStatus(boltsOnline, status) {
    const bolts = element('gridlock-meter-bolts');
    const message = element('gridlock-system-status');
    if (bolts) bolts.textContent = `BOLTS ONLINE ${boltsOnline} / ${SINKS.length}`;
    if (message) message.textContent = status;
  }
  function addListener(node, type, handler, options) { if (!node) return; node.addEventListener(type, handler, options); listeners.push({ node, type, handler }); }
  function tileAt(r, c) { if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null; return tiles.find(tile => tile.r === r && tile.c === c) || null; }
  function isSolutionEmpty(r, c) { return solutionEmpty && solutionEmpty.r === r && solutionEmpty.c === c; }
  function isMovementCell(r, c) { return slidingConfig && slidingConfig.movementCells.has(key(r, c)); }
  function isBlockedCell(r, c) { return blockedCells.has(key(r, c)); }
  function isLockedCell(r, c) { return lockedCells.has(key(r, c)); }
  function captureBoardState() {
    return {
      rotations,
      empty: emptySlot ? { r: emptySlot.r, c: emptySlot.c } : null,
      boltAssignments: SINKS.map(sink => sink.assignedSystem),
      tiles: tiles.map(tile => ({
        homeR: tile.homeR,
        homeC: tile.homeC,
        r: tile.r,
        c: tile.c,
        rot: tile.rot
      }))
    };
  }

  function restoreBoardState(state) {
    if (!state) return false;
    state.tiles.forEach(saved => {
      const tile = tiles.find(candidate => candidate.homeR === saved.homeR && candidate.homeC === saved.homeC);
      if (!tile) return;
      tile.r = saved.r;
      tile.c = saved.c;
      tile.rot = saved.rot;
      tile.g.setAttribute('transform', tileTransform(tile.r, tile.c));
      tile.chan.setAttribute('transform', `rotate(${tile.rot * 90})`);
    });
    if (emptySlot && state.empty) {
      emptySlot.r = state.empty.r;
      emptySlot.c = state.empty.c;
      emptySlot.g.setAttribute('transform', tileTransform(emptySlot.r, emptySlot.c));
    }
    rotations = state.rotations;
    if (Array.isArray(state.boltAssignments)) SINKS.forEach((sink, index) => { sink.assignedSystem = state.boltAssignments[index]; });
    refreshBoltAssignments();
    gesture = null;
    evaluate();
    return true;
  }

  function notifyHistoryChange() {
    if (config && typeof config.onHistoryChange === 'function') {
      config.onHistoryChange({ canUndo: phase === 'play' && history.length > 0, canReset: phase === 'play' });
    }
  }

  function rememberAction() {
    history.push(captureBoardState());
    notifyHistoryChange();
  }

  function effConns(tile) { const set = new Set(); SHAPES[tile.shape].forEach(d => set.add(ORDER[(ORDER.indexOf(d) + tile.rot) % 4])); return set; }
  function openingsOf(shape, rot) { const set = new Set(); SHAPES[shape].forEach(d => set.add(ORDER[(ORDER.indexOf(d) + rot) % 4])); return set; }
  function sameSet(a, b) { if (a.size !== b.size) return false; for (const x of a) if (!b.has(x)) return false; return true; }

  // map a required opening-set to the piece + rotation that produces exactly it
  function shapeRotFor(set) {
    const dirs = [...set];
    if (dirs.length === 1) return { shape: 'END', rot: ORDER.indexOf(dirs[0]) };
    if (dirs.length === 4) return { shape: 'X', rot: 0 };
    if (dirs.length === 3) { const missing = ORDER.find(d => !set.has(d)); return { shape: 'T', rot: (ORDER.indexOf(missing) + 1) % 4 }; }
    // 2 openings: straight or elbow
    if ((set.has('n') && set.has('s')) || (set.has('e') && set.has('w'))) return { shape: 'I', rot: set.has('n') ? 0 : 1 };
    for (let r = 0; r < 4; r++) if (sameSet(openingsOf('L', r), set)) return { shape: 'L', rot: r };
    return { shape: 'L', rot: 0 };
  }

  // ---- Board generation (procedural, solvable by construction) -------------

  // A 4-way (X) crossing has full rotational symmetry: every rotation produces
  // the same opening set, so it starts already sealed and costs the player zero
  // decisions. A handful of these read as relief; too many quietly turns whole
  // sections of the board into freebies. Sampled across 3000 generations, ~6.5%
  // of raw boards exceeded this — reject and regenerate rather than ship an
  // inconsistently easy lattice. Convergence is fast (usually the first retry).
  let MAX_X_FRACTION = 0.15;
  const MAX_GENERATE_ATTEMPTS = 20;

  // Presentation anchors use the same normalized board geometry as generation.
  // Any future board size therefore keeps its source and endpoints connected.
  function layoutFor(nextConfig) {
    const size = nextConfig && nextConfig.size || {};
    const rows = Math.max(3, Math.round(size.rows || 6));
    const columns = Math.max(3, Math.round(size.columns || 6));
    const presentation = { width: 470, verticalSpace: 470 };
    const cellSize = Math.floor(Math.min(
      presentation.width / columns,
      presentation.verticalSpace / rows
    ));
    const boardX = (560 - columns * cellSize) / 2;
    const boardY = Y0;
    const sinkPosition = sink => {
      const side = sink.side || 'n';
      const centerX = boardX + sink.c * cellSize + cellSize / 2;
      const centerY = boardY + sink.r * cellSize + cellSize / 2;
      if (side === 'w') return { x: boardX, y: centerY };
      if (side === 'e') return { x: boardX + columns * cellSize, y: centerY };
      if (side === 's') return { x: centerX, y: boardY + rows * cellSize };
      return { x: centerX, y: boardY };
    };
    const defaultSinks = [1, Math.floor(columns / 2), columns - 1]
      .filter((column, index, values) => values.indexOf(column) === index)
      .map((column, bolt) => ({ r: 0, c: column, side: 'n', programmable: false, bolt, ...sinkPosition({ r: 0, c: column, side: 'n' }) }));
    const requestedSystems = nextConfig && nextConfig.modifiers && nextConfig.modifiers.powerSystems;
    const dualSystems = requestedSystems && requestedSystems.enabled && requestedSystems.systems.length === 2;
    const systems = dualSystems
      ? requestedSystems.systems.map((system, systemIndex) => ({
        ...system,
        source: { ...system.source, system: systemIndex, x: boardX + system.source.c * cellSize + cellSize / 2, y: boardY + rows * cellSize },
        sinks: system.sinks.map(sink => ({ ...sink, system: systemIndex, ...sinkPosition(sink) }))
      }))
      : [{ id: 'cyan', color: 'cyan', source: { r: rows - 1, c: 0, x: boardX + cellSize / 2, y: boardY + rows * cellSize }, sinks: defaultSinks }];
    const sources = systems.map(system => system.source);
    const sinks = systems.flatMap(system => system.sinks).map((sink, bolt) => ({ ...sink, bolt }));
    systems.forEach((system, systemIndex) => {
      system.sinks = sinks.filter(sink => sink.system === systemIndex);
    });
    return {
      rows,
      columns,
      board: { x: boardX, y: boardY, width: columns * cellSize, height: rows * cellSize, cellSize },
      source: sources[0], sources, sinks, systems
    };
  }

  function buildConnectivity() {
    const conn = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => new Set()));
    const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
    const belongsToSystem = (r, c, systemIndex, dir) => isRouterCell(r, c)
      ? routerSolutionSystemForDirection(r, c, dir) === systemIndex
      : systemIndexAt(r, c) === systemIndex;
    const neighbours = (r, c, systemIndex) => ORDER.map(d => {
      const [dr, dc] = DELTA[d];
      return [r + dr, c + dc, d];
    }).filter(([nr, nc, d]) => (
      inBounds(nr, nc)
      && !isSolutionEmpty(nr, nc)
      && !isBlockedCell(nr, nc)
      && belongsToSystem(r, c, systemIndex, d)
      && belongsToSystem(nr, nc, systemIndex, OPP[d])
    ));
    const connect = (r, c, d) => { const [dr, dc] = DELTA[d]; conn[r][c].add(d); conn[r + dr][c + dc].add(OPP[d]); };

    // Each system gets its own spanning graph. Router channel visits use
    // system-qualified keys, so the two channels can occupy one cell without
    // becoming one shared X junction.
    POWER_SYSTEMS.forEach((system, systemIndex) => {
      const source = system.source;
      const visited = new Set([key(source.r, source.c)]);
      const stack = [[source.r, source.c]];
      while (stack.length) {
        const [r, c] = stack[stack.length - 1];
        const open = neighbours(r, c, systemIndex).filter(([nr, nc]) => !visited.has(key(nr, nc)));
        if (!open.length) { stack.pop(); continue; }
        const [nr, nc, d] = open[Math.floor(Math.random() * open.length)];
        connect(r, c, d);
        visited.add(key(nr, nc));
        stack.push([nr, nc]);
      }
      const required = [];
      for (let r = 0; r < ROWS; r += 1) for (let c = 0; c < COLS; c += 1) {
        if (isSolutionEmpty(r, c) || isBlockedCell(r, c)) continue;
        const router = routerConfigAt(r, c);
        if ((!router && systemIndexAt(r, c) === systemIndex) || (router && [router.solutionChannels.vertical, router.solutionChannels.horizontal].includes(systemIndex))) required.push(key(r, c));
      }
      if (required.some(cell => !visited.has(cell))) throw new Error(`Grid Lock system ${system.id} could not reach every generated cell.`);
    });
    // extra loop edges → richer coupling, fewer dead-end caps (respect max degree 4)
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        if (isSolutionEmpty(r, c) || isBlockedCell(r, c)) continue;
      ['e', 's'].forEach(d => {
        const [dr, dc] = DELTA[d]; const nr = r + dr, nc = c + dc;
        const systemIndex = solutionSystemAt(r, c, d);
        if (!inBounds(nr, nc) || isSolutionEmpty(nr, nc) || isBlockedCell(nr, nc) || systemIndex !== solutionSystemAt(nr, nc, OPP[d]) || conn[r][c].has(d)) return;
        if (conn[r][c].size >= 4 || conn[nr][nc].size >= 4) return;
        if (Math.random() < LOOP_EDGE_CHANCE) connect(r, c, d);
      });
    }
    // A fixed router is a real four-port component. Both insulated channels
    // must participate in the solved graph even when a random spanning tree
    // found an alternate path around one side of the crossover.
    routerConfigs.forEach(router => {
      ORDER.forEach(direction => {
        if (conn[router.r][router.c].has(direction)) return;
        const [dr, dc] = DELTA[direction];
        const nr = router.r + dr, nc = router.c + dc;
        if (!inBounds(nr, nc) || isSolutionEmpty(nr, nc) || isBlockedCell(nr, nc)) throw new Error('Grid Lock router channel has no valid neighbouring conduit.');
        if (routerSolutionSystemForDirection(router.r, router.c, direction) !== solutionSystemAt(nr, nc, OPP[direction])) throw new Error('Grid Lock router channel is assigned to the wrong neighbouring system.');
        connect(router.r, router.c, direction);
      });
    });
    // External openings: power feeds enter from below; bolts may sit on any edge.
    SOURCES.forEach(source => conn[source.r][source.c].add('s'));
    SINKS.forEach(sink => conn[sink.r][sink.c].add(sink.side || 'n'));
    return conn;
  }

  function obstacleCandidates() {
    const protectedCells = new Set([key(SOURCE.r, SOURCE.c), ...SOURCES.map(source => key(source.r, source.c)), ...SINKS.map(sink => key(sink.r, sink.c))]);
    routerConfigs.forEach(router => {
      protectedCells.add(key(router.r, router.c));
      ORDER.forEach(direction => {
        const [dr, dc] = DELTA[direction];
        protectedCells.add(key(router.r + dr, router.c + dc));
      });
    });
    return Array.from({ length: ROWS * COLS }, (_, index) => ({ r: Math.floor(index / COLS), c: index % COLS }))
      .filter(cell => !protectedCells.has(key(cell.r, cell.c)) && !isSolutionEmpty(cell.r, cell.c) && !isMovementCell(cell.r, cell.c));
  }

  function remainingCellsAreConnected(candidateCells) {
    const blocked = new Set(candidateCells.map(cell => key(cell.r, cell.c)));
    const queue = [[SOURCE.r, SOURCE.c]];
    const visited = new Set([key(SOURCE.r, SOURCE.c)]);
    while (queue.length) {
      const [row, column] = queue.shift();
      ORDER.forEach(direction => {
        const [rowOffset, columnOffset] = DELTA[direction];
        const nextRow = row + rowOffset;
        const nextColumn = column + columnOffset;
        const nextKey = key(nextRow, nextColumn);
        if (nextRow < 0 || nextRow >= ROWS || nextColumn < 0 || nextColumn >= COLS || blocked.has(nextKey) || isSolutionEmpty(nextRow, nextColumn) || visited.has(nextKey)) return;
        visited.add(nextKey);
        queue.push([nextRow, nextColumn]);
      });
    }
    const remainingCount = ROWS * COLS - blocked.size - (solutionEmpty ? 1 : 0);
    return visited.size === remainingCount;
  }

  function shortestPathLength(blocked, start, end) {
    const queue = [{ r: start.r, c: start.c, distance: 0 }];
    const visited = new Set([key(start.r, start.c)]);
    while (queue.length) {
      const current = queue.shift();
      if (current.r === end.r && current.c === end.c) return current.distance;
      ORDER.forEach(direction => {
        const [rowOffset, columnOffset] = DELTA[direction];
        const row = current.r + rowOffset;
        const column = current.c + columnOffset;
        const nextKey = key(row, column);
        if (row < 0 || row >= ROWS || column < 0 || column >= COLS || blocked.has(nextKey) || isSolutionEmpty(row, column) || visited.has(nextKey)) return;
        visited.add(nextKey);
        queue.push({ r: row, c: column, distance: current.distance + 1 });
      });
    }
    return Infinity;
  }

  function forcesSourceDetour(candidateCells) {
    const blocked = new Set(candidateCells.map(cell => key(cell.r, cell.c)));
    return SINKS.some(sink => shortestPathLength(blocked, SOURCE, sink) > Math.abs(SOURCE.r - sink.r) + Math.abs(SOURCE.c - sink.c));
  }

  function barrierLayouts() {
    const candidates = new Set(obstacleCandidates().map(cell => key(cell.r, cell.c)));
    const layouts = [];
    for (let column = 1; column < COLS - 1; column += 1) {
      for (let startRow = 0; startRow <= ROWS - obstacleConfig.count; startRow += 1) {
        const cells = Array.from({ length: obstacleConfig.count }, (_, index) => ({ r: startRow + index, c: column }));
        if (cells.every(cell => candidates.has(key(cell.r, cell.c)))) layouts.push(cells);
      }
    }
    for (let row = 1; row < ROWS - 1; row += 1) {
      for (let startColumn = 0; startColumn <= COLS - obstacleConfig.count; startColumn += 1) {
        const cells = Array.from({ length: obstacleConfig.count }, (_, index) => ({ r: row, c: startColumn + index }));
        if (cells.every(cell => candidates.has(key(cell.r, cell.c)))) layouts.push(cells);
      }
    }
    return layouts;
  }

  function generateObstacleCells() {
    if (!obstacleConfig || obstacleConfig.count === 0) return new Set();
    const candidates = obstacleCandidates();
    if (obstacleConfig.count > candidates.length) throw new Error('Grid Lock obstacle count exceeds available board cells.');
    if (obstacleConfig.pattern === 'barrier') {
      const layouts = barrierLayouts();
      for (let attempt = 0; attempt < obstacleConfig.maxGenerationAttempts && layouts.length; attempt += 1) {
        const index = Math.floor(Math.random() * layouts.length);
        const selected = layouts.splice(index, 1)[0];
        if (remainingCellsAreConnected(selected) && forcesSourceDetour(selected)) return new Set(selected.map(cell => key(cell.r, cell.c)));
      }
      throw new Error('Grid Lock could not generate a detour-producing obstacle barrier.');
    }
    for (let attempt = 0; attempt < obstacleConfig.maxGenerationAttempts; attempt += 1) {
      const shuffled = candidates.slice();
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
      }
      const selected = shuffled.slice(0, obstacleConfig.count);
      if (remainingCellsAreConnected(selected)) return new Set(selected.map(cell => key(cell.r, cell.c)));
    }
    throw new Error('Grid Lock could not generate a connected obstacle layout.');
  }

  function generateLockedCells(conn) {
    if (!lockedConfig || lockedConfig.count === 0) return new Set();
    const protectedCells = new Set([key(SOURCE.r, SOURCE.c), ...SOURCES.map(source => key(source.r, source.c)), ...SINKS.map(sink => key(sink.r, sink.c))]);
    routerConfigs.forEach(router => protectedCells.add(key(router.r, router.c)));
    const candidates = Array.from({ length: ROWS * COLS }, (_, index) => ({ r: Math.floor(index / COLS), c: index % COLS }))
      .filter(cell => !protectedCells.has(key(cell.r, cell.c)) && !isSolutionEmpty(cell.r, cell.c) && !isBlockedCell(cell.r, cell.c) && !isMovementCell(cell.r, cell.c) && conn[cell.r][cell.c].size >= lockedConfig.minConnections && conn[cell.r][cell.c].size < 4);
    if (lockedConfig.count > candidates.length) throw new Error('Grid Lock locked-piece count exceeds meaningful conduit candidates.');
    for (let index = candidates.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [candidates[index], candidates[swapIndex]] = [candidates[swapIndex], candidates[index]];
    }
    return new Set(candidates.slice(0, lockedConfig.count).map(cell => key(cell.r, cell.c)));
  }

  function applyGenerationConfig(nextConfig) {
    const layout = layoutFor(nextConfig);
    ROWS = layout.rows;
    COLS = layout.columns;
    S = layout.board.cellSize;
    X0 = layout.board.x;
    SOURCE = { r: layout.source.r, c: layout.source.c };
    SOURCES = layout.sources.map(source => ({ r: source.r, c: source.c, system: source.system || 0 }));
    SINKS = layout.sinks.map(sink => ({
      r: sink.r,
      c: sink.c,
      side: sink.side || 'n',
      system: sink.system || 0,
      bolt: sink.bolt,
      programmable: Boolean(sink.programmable),
      assignedSystem: sink.programmable ? null : (sink.system || 0)
    }));
    POWER_SYSTEMS = layout.systems.map(system => ({ id: system.id, color: system.color, source: { r: system.source.r, c: system.source.c }, sinks: system.sinks.map(sink => ({ r: sink.r, c: sink.c, side: sink.side || 'n', bolt: sink.bolt })) }));
    const requestedSystems = nextConfig && nextConfig.modifiers && nextConfig.modifiers.powerSystems;
    if (requestedSystems && requestedSystems.randomizeColors && POWER_SYSTEMS.length === 2 && Math.random() < .5) {
      const firstColor = POWER_SYSTEMS[0].color;
      POWER_SYSTEMS[0].color = POWER_SYSTEMS[1].color;
      POWER_SYSTEMS[1].color = firstColor;
    }
    SYSTEM_SPLIT_COLUMNS = POWER_SYSTEMS.length > 1 ? requestedSystems.splitColumns.slice(0, ROWS) : [];
    const requestedRouters = nextConfig && nextConfig.modifiers && Array.isArray(nextConfig.modifiers.specialTiles)
      ? nextConfig.modifiers.specialTiles.filter(tile => tile.type === 'router')
      : [];
    routerConfigs = requestedRouters.map(router => ({
        r: router.r,
        c: router.c,
        fixed: router.fixed !== false,
        solutionChannels: {
          vertical: systemIndexAt(router.r - 1, router.c),
          horizontal: systemIndexAt(router.r, router.c - 1)
        }
      }));
    const requestedSliding = nextConfig && nextConfig.modifiers && nextConfig.modifiers.slidingPieces;
    if (requestedSliding && requestedSliding.enabled) {
      const fallbackEmpty = { r: Math.floor(ROWS / 2), c: Math.floor(COLS / 2) };
      const requestedEmpty = requestedSliding.emptyCell;
      const empty = requestedEmpty && requestedEmpty.r >= 0 && requestedEmpty.r < ROWS && requestedEmpty.c >= 0 && requestedEmpty.c < COLS
        ? { r: requestedEmpty.r, c: requestedEmpty.c }
        : fallbackEmpty;
      const requestedMovementCells = Array.isArray(requestedSliding.movementCells) ? requestedSliding.movementCells : [];
      const movementCellKeys = requestedMovementCells.length
        ? requestedMovementCells.filter(cell => cell.r >= 0 && cell.r < ROWS && cell.c >= 0 && cell.c < COLS).map(cell => key(cell.r, cell.c))
        : Array.from({ length: ROWS * COLS }, (_, index) => key(Math.floor(index / COLS), index % COLS));
      movementCellKeys.push(key(empty.r, empty.c));
      const movementCells = new Set(movementCellKeys);
      const movementCoordinates = [...movementCells].map(cell => cell.split(',').map(Number));
      slidingConfig = {
        scrambleMoves: Math.max(1, requestedSliding.scrambleMoves || 3),
        movementCells,
        bounds: {
          minRow: Math.min(...movementCoordinates.map(([row]) => row)),
          maxRow: Math.max(...movementCoordinates.map(([row]) => row)),
          minColumn: Math.min(...movementCoordinates.map(([, column]) => column)),
          maxColumn: Math.max(...movementCoordinates.map(([, column]) => column))
        }
      };
      solutionEmpty = empty;
    } else {
      slidingConfig = null;
      solutionEmpty = null;
    }
    const requestedObstacles = nextConfig && nextConfig.modifiers && nextConfig.modifiers.obstacles;
    obstacleConfig = requestedObstacles && requestedObstacles.enabled
      ? {
        count: Math.max(0, Math.round(Number(requestedObstacles.count) || 0)),
        pattern: requestedObstacles.pattern === 'barrier' ? 'barrier' : 'scatter',
        maxGenerationAttempts: Math.max(1, Math.round(Number(requestedObstacles.maxGenerationAttempts) || 48))
      }
      : null;
    const requestedLockedPieces = nextConfig && nextConfig.modifiers && nextConfig.modifiers.lockedPieces;
    lockedConfig = requestedLockedPieces && requestedLockedPieces.enabled
      ? {
        count: Math.max(0, Math.round(Number(requestedLockedPieces.count) || 0)),
        minConnections: Math.max(1, Math.round(Number(requestedLockedPieces.minConnections) || 2))
      }
      : null;
    blockedCells = new Set();
    lockedCells = new Set();
    const rules = nextConfig && nextConfig.generationRules || {};
    LOOP_EDGE_CHANCE = Number.isFinite(rules.loopEdgeChance) ? rules.loopEdgeChance : .34;
    MAX_X_FRACTION = Number.isFinite(rules.maxCrossingFraction) ? rules.maxCrossingFraction : .15;
  }

  function xFraction(conn) {
    let xCount = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (!isSolutionEmpty(r, c) && !isBlockedCell(r, c) && conn[r][c].size === 4) xCount += 1;
    return xCount / (ROWS * COLS - blockedCells.size - (solutionEmpty ? 1 : 0));
  }

  function generate() {
    let conn = null;
    let topologyError = null;
    const topologyAttempts = obstacleConfig ? obstacleConfig.maxGenerationAttempts : 1;
    for (let attempt = 0; attempt < topologyAttempts && !conn; attempt += 1) {
      blockedCells = generateObstacleCells();
      try {
        conn = buildConnectivity();
      } catch (error) {
        if (!String(error && error.message).includes('could not reach every generated cell')) throw error;
        topologyError = error;
      }
    }
    if (!conn) throw topologyError || new Error('Grid Lock could not generate separated live-system routes.');
    for (let attempt = 0; attempt < MAX_GENERATE_ATTEMPTS; attempt += 1) {
      if (xFraction(conn) <= MAX_X_FRACTION) break;
      conn = buildConnectivity();
    }
    if (xFraction(conn) > MAX_X_FRACTION) throw new Error('Grid Lock could not satisfy generated crossing constraints.');
    lockedCells = generateLockedCells(conn);

    const board = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        if (isBlockedCell(r, c)) { row.push({ type: 'obstacle' }); continue; }
        if (isSolutionEmpty(r, c)) { row.push(null); continue; }
        const router = isRouterCell(r, c);
        const { shape, rot } = router ? { shape: 'X', rot: 0 } : shapeRotFor(conn[r][c]);
        // scramble to a rotation whose openings differ from the solved one when possible
        const cands = [0, 1, 2, 3].filter(k => !sameSet(openingsOf(shape, k), conn[r][c]));
        const locked = router ? routerConfigAt(r, c).fixed : isLockedCell(r, c);
        const startRot = locked ? rot : cands.length ? cands[Math.floor(Math.random() * cands.length)] : rot;
        row.push({ shape, solvedRot: rot, startRot, homeR: r, homeC: c, movable: Boolean(isMovementCell(r, c)) && !router, locked, type: router ? 'router' : 'conduit' });
      }
      board.push(row);
    }
    return slidingConfig ? scrambleBoard(board) : board;
  }

  function scrambleBoard(board) {
    let empty = { ...solutionEmpty };
    let previous = null;
    for (let move = 0; move < slidingConfig.scrambleMoves; move += 1) {
      const options = ORDER.map(dir => {
        const [dr, dc] = DELTA[dir]; return { r: empty.r + dr, c: empty.c + dc };
      }).filter(candidate => candidate.r >= 0 && candidate.r < ROWS && candidate.c >= 0 && candidate.c < COLS && isMovementCell(candidate.r, candidate.c) && board[candidate.r][candidate.c] && (!previous || candidate.r !== previous.r || candidate.c !== previous.c));
      const candidate = options[Math.floor(Math.random() * options.length)];
      const tile = board[candidate.r][candidate.c];
      board[empty.r][empty.c] = tile;
      board[candidate.r][candidate.c] = null;
      previous = empty;
      empty = candidate;
    }
    return board;
  }

  // ---- Rendering ----------------------------------------------------------

  function tilePosition(r, c) {
    return { x: X0 + c * S + S / 2, y: Y0 + r * S + S / 2 };
  }

  function tileTransform(r, c) {
    const position = tilePosition(r, c);
    return `translate(${position.x},${position.y})`;
  }

  function animatePosition(node, from, to) {
    if (!node || !node.appendChild) return;
    const animation = svg('animateTransform', {
      attributeName: 'transform',
      type: 'translate',
      from: `${from.x} ${from.y}`,
      to: `${to.x} ${to.y}`,
      dur: '240ms',
      calcMode: 'spline',
      keySplines: '.2 .75 .25 1',
      fill: 'freeze'
    });
    node.appendChild(animation);
    if (typeof animation.beginElement !== 'function') {
      node.removeChild(animation);
      return;
    }
    animation.beginElement();
    later(() => { if (animation.parentNode === node) node.removeChild(animation); }, 260);
  }

  function buildMovementBayBackdrop() {
    if (!slidingConfig) return null;
    const { minRow, maxRow, minColumn, maxColumn } = slidingConfig.bounds;
    const x = X0 + minColumn * S;
    const y = Y0 + minRow * S;
    const width = (maxColumn - minColumn + 1) * S;
    const height = (maxRow - minRow + 1) * S;
    const g = svg('g', { class: 'gl-movement-bay', 'aria-hidden': 'true' });
    g.appendChild(svg('rect', { x: x - 4, y: y - 4, width: width + 8, height: height + 8, rx: 10, class: 'gl-movement-bay-shadow' }));
    g.appendChild(svg('rect', { x, y, width, height, rx: 7, class: 'gl-movement-bay-floor' }));
    for (let row = minRow + 1; row <= maxRow; row += 1) g.appendChild(svg('line', { x1: x, y1: Y0 + row * S, x2: x + width, y2: Y0 + row * S, class: 'gl-movement-bay-seam' }));
    for (let column = minColumn + 1; column <= maxColumn; column += 1) g.appendChild(svg('line', { x1: X0 + column * S, y1: y, x2: X0 + column * S, y2: y + height, class: 'gl-movement-bay-seam' }));
    return g;
  }

  function buildTile(r, c, def) {
    const half = S / 2 - 3;
    const specialClass = def.type === 'router' ? ' is-router' : '';
    const g = svg('g', { transform: tileTransform(r, c), class: `gridlock-tile${specialClass}` });
    g.appendChild(svg('rect', { x: -half, y: -half, width: half * 2, height: half * 2, rx: 6, class: 'gl-plate' }));
    g.appendChild(svg('rect', { x: -half + 3, y: -half + 2, width: half * 2 - 6, height: 3, class: 'gl-bevel-top' }));
    const chan = svg('g', { class: 'gl-chan' });
    const segments = {};
    // reach stops flush at the plate's own edge (not half+2 past it) so a
    // segment never pokes outside the tile's visible border.
    const w = 13, reach = half;
    // A small band capping the outer end of a segment, kept just inside the
    // plate's own edge (never past it) — hidden by default, shown only when
    // that specific segment is both energized and a dead end (see
    // evaluate()'s leakcap-n/e/s/w classes, keyed to this LOCAL direction so
    // the cap rotates together with its segment as the piece is turned).
    const capDist = half - 3, capBand = 14, capThick = 4;
    SHAPES[def.shape].forEach(dir => {
      const routerChannel = def.type === 'router'
        ? ((dir === 'n' || dir === 's') ? ' gl-router-vertical' : ' gl-router-horizontal')
        : '';
      const seg = svg('rect', { rx: 4, class: `gl-seg${routerChannel}` });
      if (dir === 'n') { seg.setAttribute('x', -w / 2); seg.setAttribute('y', -reach); seg.setAttribute('width', w); seg.setAttribute('height', reach + 4); }
      if (dir === 's') { seg.setAttribute('x', -w / 2); seg.setAttribute('y', -4); seg.setAttribute('width', w); seg.setAttribute('height', reach + 4); }
      if (dir === 'e') { seg.setAttribute('x', -4); seg.setAttribute('y', -w / 2); seg.setAttribute('width', reach + 4); seg.setAttribute('height', w); }
      if (dir === 'w') { seg.setAttribute('x', -reach); seg.setAttribute('y', -w / 2); seg.setAttribute('width', reach + 4); seg.setAttribute('height', w); }
      chan.appendChild(seg);
      segments[dir] = seg;

      const cap = svg('rect', { rx: 1.5, class: `gl-leak-cap gl-leak-cap-${dir}` });
      if (dir === 'n') { cap.setAttribute('x', -capBand / 2); cap.setAttribute('y', -capDist - capThick / 2); cap.setAttribute('width', capBand); cap.setAttribute('height', capThick); }
      if (dir === 's') { cap.setAttribute('x', -capBand / 2); cap.setAttribute('y', capDist - capThick / 2); cap.setAttribute('width', capBand); cap.setAttribute('height', capThick); }
      if (dir === 'e') { cap.setAttribute('x', capDist - capThick / 2); cap.setAttribute('y', -capBand / 2); cap.setAttribute('width', capThick); cap.setAttribute('height', capBand); }
      if (dir === 'w') { cap.setAttribute('x', -capDist - capThick / 2); cap.setAttribute('y', -capBand / 2); cap.setAttribute('width', capThick); cap.setAttribute('height', capBand); }
      chan.appendChild(cap);
    });
    chan.appendChild(svg('circle', { r: def.type === 'router' ? 10 : 8, class: def.type === 'router' ? 'gl-router-insulator' : 'gl-hub' }));
    chan.setAttribute('transform', `rotate(${def.startRot * 90})`);
    g.appendChild(chan);
    const tile = { r, c, type: def.type || 'conduit', shape: def.shape, rot: def.startRot, solvedRot: def.solvedRot, homeR: def.homeR, homeC: def.homeC, movable: Boolean(def.movable), locked: Boolean(def.locked), g, chan, segments };
    g.classList.toggle('is-in-movement-bay', tile.movable);
    g.classList.toggle('is-locked', tile.locked);
    if (tile.locked) {
      const lockX = half - 20;
      const lockY = half - 21;
      const lock = svg('g', { class: 'gl-lock-mark', 'aria-hidden': 'true' });
      lock.appendChild(svg('path', { d: `M${lockX + 5},${lockY + 10} V${lockY + 6} a5,5 0 0 1 10,0 v4`, class: 'gl-lock-shackle' }));
      lock.appendChild(svg('rect', { x: lockX + 2, y: lockY + 10, width: 16, height: 13, rx: 2.5, class: 'gl-lock-body' }));
      lock.appendChild(svg('circle', { cx: lockX + 10, cy: lockY + 16, r: 2, class: 'gl-lock-keyhole' }));
      lock.appendChild(svg('path', { d: `M${lockX + 10},${lockY + 17} v3`, class: 'gl-lock-keyhole-stem' }));
      g.appendChild(lock);
    }
    addListener(g, 'pointerdown', event => beginTileGesture(tile, event), { passive: false });
    addListener(g, 'pointermove', event => updateTileGesture(tile, event), { passive: false });
    addListener(g, 'pointerup', event => endTileGesture(tile, event), { passive: false });
    addListener(g, 'pointercancel', () => { gesture = null; }, { passive: false });
    return tile;
  }

  function buildEmptySlot(r, c) {
    const g = svg('g', { transform: tileTransform(r, c), class: 'gridlock-empty' });
    const half = S / 2 - 5;
    g.appendChild(svg('rect', { x: -half, y: -half, width: half * 2, height: half * 2, rx: 6, class: 'gl-empty-slot' }));
    g.appendChild(svg('circle', { r: 7, class: 'gl-empty-slot-core' }));
    const slot = { r, c, g };
    return slot;
  }

  function buildObstacle(r, c) {
    const half = S / 2 - 4;
    const g = svg('g', { transform: tileTransform(r, c), class: 'gridlock-obstacle', 'aria-hidden': 'true' });
    g.appendChild(svg('rect', { x: -half, y: -half, width: half * 2, height: half * 2, rx: 6, class: 'gl-obstacle-plate' }));
    g.appendChild(svg('path', { d: `M${-half + 9},${-half + 9} L${half - 9},${half - 9} M${half - 9},${-half + 9} L${-half + 9},${half - 9}`, class: 'gl-obstacle-mark' }));
    return g;
  }

  // classify a tile's opening in a direction: matched, sanctioned external, or a leak
  function classify(tile, dir) {
    const [dr, dc] = DELTA[dir];
    const nr = tile.r + dr, nc = tile.c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) {
      if (dir === 's' && sourceAt(tile.r, tile.c) >= 0) return 'feed';
      if (isSink(tile.r, tile.c, dir)) return 'bolt';
      return 'leak';
    }
    const next = tileAt(nr, nc);
    if (!next || !effConns(next).has(OPP[dir])) return 'leak';
    return 'link';
  }

  function routerChannelForDirection(dir) {
    return dir === 'n' || dir === 's' ? 'vertical' : 'horizontal';
  }

  function graphNodeKey(tile, dir) {
    return tile.type === 'router' ? `${key(tile.r, tile.c)}|${routerChannelForDirection(dir)}` : key(tile.r, tile.c);
  }

  function nodeDirections(tile, node) {
    if (tile.type !== 'router') return [...effConns(tile)];
    return node.endsWith('|vertical') ? ['n', 's'] : ['e', 'w'];
  }

  function floodReaches() {
    return POWER_SYSTEMS.map((system, systemIndex) => {
      const seen = new Set();
      const src = tileAt(system.source.r, system.source.c);
      if (!src || !effConns(src).has('s')) return seen;
      const sourceNode = graphNodeKey(src, 's');
      seen.add(sourceNode);
      const q = [{ tile: src, node: sourceNode }];
      while (q.length) {
        const current = q.shift();
        nodeDirections(current.tile, current.node).forEach(dir => {
          if (classify(current.tile, dir) !== 'link') return;
          const [dr, dc] = DELTA[dir];
          const next = tileAt(current.tile.r + dr, current.tile.c + dc);
          const nextNode = graphNodeKey(next, OPP[dir]);
          if (!seen.has(nextNode)) {
            seen.add(nextNode);
            q.push({ tile: next, node: nextNode });
          }
        });
      }
      return seen;
    });
  }

  function systemFeeds() {
    return POWER_SYSTEMS.map(system => {
      const source = tileAt(system.source.r, system.source.c);
      return Boolean(source && effConns(source).has('s'));
    });
  }

  function evaluate() {
    const reaches = floodReaches();
    const feeds = systemFeeds();
    const systemsForNode = node => POWER_SYSTEMS.map((system, index) => index).filter(index => feeds[index] && reaches[index].has(node));
    const mixedNodes = new Set();
    tiles.forEach(tile => {
      // A router is explicitly allowed to carry both live systems through its
      // insulated channels. Only an ordinary shared conduit can short them.
      if (tile.type !== 'router' && systemsForNode(key(tile.r, tile.c)).length > 1) mixedNodes.add(key(tile.r, tile.c));
    });
    let allMatched = true, leakCount = 0;
    const powerByCell = {};
    tiles.forEach(t => {
      const activeCapDirs = [];
      let matched = true;
      let anyCyan = false, anyGreen = false, allArmsPowered = true;
      SHAPES[t.shape].forEach(localDir => {
        const absDir = ORDER[(ORDER.indexOf(localDir) + t.rot) % 4];
        const node = graphNodeKey(t, absDir);
        const poweredSystems = systemsForNode(node);
        const connection = classify(t, absDir);
        const mixed = mixedNodes.has(node);
        const leak = connection === 'leak';
        if (leak || mixed) matched = false;
        if (leak) leakCount += 1;
        if ((leak && poweredSystems.length) || mixed) activeCapDirs.push(localDir);
        const powered = poweredSystems.length === 1 || (t.type === 'router' && poweredSystems.length > 1);
        const carriesCyan = poweredSystems.some(index => POWER_SYSTEMS[index].color !== 'green');
        const carriesGreen = poweredSystems.some(index => POWER_SYSTEMS[index].color === 'green');
        allArmsPowered = allArmsPowered && powered;
        anyCyan = anyCyan || carriesCyan;
        anyGreen = anyGreen || carriesGreen;
        t.segments[localDir].classList.toggle('is-powered', powered && carriesCyan);
        t.segments[localDir].classList.toggle('is-powered-green', powered && carriesGreen);
        t.segments[localDir].classList.toggle('is-powered-dual', powered && carriesCyan && carriesGreen);
      });
      if (!matched) allMatched = false;
      t.g.classList.toggle('is-energized', anyCyan);
      t.g.classList.toggle('is-energized-green', anyGreen);
      t.g.classList.toggle('is-closed', allArmsPowered && matched && anyCyan && t.type !== 'router');
      t.g.classList.toggle('is-closed-green', allArmsPowered && matched && anyGreen && t.type !== 'router');
      t.g.classList.toggle('is-router-online', t.type === 'router' && allArmsPowered && matched);
      t.g.classList.toggle('is-leaking', !matched);
      ORDER.forEach(dir => t.g.classList.toggle(`leakcap-${dir}`, activeCapDirs.includes(dir)));
      powerByCell[key(t.r, t.c)] = t.type === 'router'
        ? {
          vertical: systemsForNode(`${key(t.r, t.c)}|vertical`),
          horizontal: systemsForNode(`${key(t.r, t.c)}|horizontal`)
        }
        : systemsForNode(key(t.r, t.c));
    });
    const onlineSinks = SINKS.filter(sink => {
      const sinkTile = tileAt(sink.r, sink.c);
      const node = graphNodeKey(sinkTile, sink.side);
      return sink.assignedSystem !== null
        && sink.assignedSystem === colorChoiceForSystem(sink.system)
        && reaches[sink.system].has(node)
        && !mixedNodes.has(node);
    });
    const onlineBoltIds = new Set(onlineSinks.map(sink => sink.bolt));
    SINKS.forEach(sink => setBoltPowered(sink.bolt, onlineBoltIds.has(sink.bolt)));
    const boltsOnline = onlineSinks.length;
    const everyTilePowered = tiles.every(tile => tile.type === 'router'
      ? ['vertical', 'horizontal'].every(channel => systemsForNode(`${key(tile.r, tile.c)}|${channel}`).length === 1)
      : systemsForNode(key(tile.r, tile.c)).length === 1);
    const isolatedCircuit = allMatched && !everyTilePowered;
    const crossCount = mixedNodes.size;
    const unassignedCount = SINKS.filter(sink => sink.programmable && sink.assignedSystem === null).length;
    const complete = allMatched && !crossCount && everyTilePowered && boltsOnline === SINKS.length;
    const status = complete
      ? 'GRID LOCK SEALED'
      : crossCount > 0
        ? 'CIRCUITS CROSSED · SEPARATE CYAN + GREEN'
      : unassignedCount > 0
        ? `${unassignedCount} BOLT${unassignedCount === 1 ? '' : 'S'} UNASSIGNED · TAP SWITCH`
      : leakCount > 0
        ? `${leakCount} OPEN END${leakCount === 1 ? '' : 'S'} · ROTATE TO CONNECT`
        : isolatedCircuit
          ? 'UNPOWERED LOOP · CONNECT TO A CORE'
          : 'BOLT OFFLINE · COMPLETE EVERY ROUTE';
    updateMeter(boltsOnline / SINKS.length);
    setSystemStatus(boltsOnline, status);
    lastEvaluation = {
      status,
      crossCount,
      leakCount,
      boltsOnline,
      powerByCell,
      boltAssignments: SINKS.map(sink => sink.assignedSystem),
      networkColors: POWER_SYSTEMS.map(system => system.color)
    };
    if (complete) win();
  }

  function updateMeter(frac) {
    const fill = element('gridlock-meter-fill');
    if (!fill) return;
    const clamped = Math.max(0, Math.min(1, frac));
    if (fill.namespaceURI === NS) fill.setAttribute('width', `${clamped * 214}`);
    else fill.setAttribute('style', `width:${clamped * 100}%`);
  }

  function refreshBoltAssignments() {
    SINKS.forEach(sink => {
      const bolt = element(`gridlock-bolt-${sink.bolt}`);
      if (!bolt) return;
      bolt.classList.toggle('is-programmable', sink.programmable);
      bolt.classList.toggle('is-unassigned', sink.programmable && sink.assignedSystem === null);
      bolt.classList.toggle('is-cyan', sink.assignedSystem === 0);
      bolt.classList.toggle('is-green', sink.assignedSystem === 1);
      const knob = element(`gridlock-bolt-switch-knob-${sink.bolt}`);
      if (knob) knob.setAttribute('cx', sink.assignedSystem === 0 ? -5 : sink.assignedSystem === 1 ? 5 : 0);
    });
  }

  function refreshSourceColors() {
    POWER_SYSTEMS.forEach((system, systemIndex) => {
      const source = element(`gridlock-source-${systemIndex}`);
      if (!source) return;
      source.classList.toggle('is-cyan', system.color !== 'green');
      source.classList.toggle('is-green', system.color === 'green');
    });
  }

  function toggleBolt(index) {
    const sink = SINKS.find(candidate => candidate.bolt === index);
    if (!sink || !sink.programmable || !active || solved || phase !== 'play') return false;
    rememberAction();
    sink.assignedSystem = sink.assignedSystem === 0 ? 1 : 0;
    refreshBoltAssignments();
    evaluate();
    playTone(sink.assignedSystem === 0 ? 260 : 330, sink.assignedSystem === 0 ? 430 : 520, .12, .035, 'square');
    return true;
  }

  function rotateTile(tile, event) {
    if (event && event.preventDefault) event.preventDefault();
    if (!active || solved || phase !== 'play' || tile.locked) return;
    rememberAction();
    tile.rot = (tile.rot + 1) % 4;
    tile.chan.setAttribute('transform', `rotate(${tile.rot * 90})`);
    rotations += 1;
    playTone(190, 225, .06, .012, 'sine');
    evaluate();
  }

  function isAdjacentToEmpty(tile) {
    return emptySlot && Math.abs(tile.r - emptySlot.r) + Math.abs(tile.c - emptySlot.c) === 1;
  }

  function gesturePoint(event) {
    return { x: Number(event && event.clientX) || 0, y: Number(event && event.clientY) || 0 };
  }

  function beginTileGesture(tile, event) {
    if (event && event.preventDefault) event.preventDefault();
    if (!active || solved || phase !== 'play' || tile.locked) return;
    const point = gesturePoint(event);
    gesture = { tile, startX: point.x, startY: point.y };
  }

  function draggedTowardEmpty(tile, dx, dy) {
    if (!isAdjacentToEmpty(tile)) return false;
    if (emptySlot.c !== tile.c) return Math.sign(dx) === Math.sign(emptySlot.c - tile.c) && Math.abs(dx) > Math.abs(dy);
    return Math.sign(dy) === Math.sign(emptySlot.r - tile.r) && Math.abs(dy) > Math.abs(dx);
  }

  function updateTileGesture(tile, event) {
    if (!gesture || gesture.tile !== tile || !tile.movable || !slidingConfig) return;
    const point = gesturePoint(event);
    const dx = point.x - gesture.startX;
    const dy = point.y - gesture.startY;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 12 || !draggedTowardEmpty(tile, dx, dy)) return;
    gesture = null;
    slideTile(tile);
  }

  function endTileGesture(tile, event) {
    if (event && event.preventDefault) event.preventDefault();
    if (!gesture || gesture.tile !== tile) return;
    gesture = null;
    rotateTile(tile, event);
  }

  function slideTile(tile) {
    rememberAction();
    const previous = { r: tile.r, c: tile.c };
    const emptyPosition = tilePosition(emptySlot.r, emptySlot.c);
    const tilePositionBeforeMove = tilePosition(tile.r, tile.c);
    tile.r = emptySlot.r;
    tile.c = emptySlot.c;
    tile.g.setAttribute('transform', tileTransform(tile.r, tile.c));
    emptySlot.r = previous.r;
    emptySlot.c = previous.c;
    emptySlot.g.setAttribute('transform', tileTransform(emptySlot.r, emptySlot.c));
    animatePosition(tile.g, tilePositionBeforeMove, emptyPosition);
    animatePosition(emptySlot.g, emptyPosition, tilePositionBeforeMove);
    playTone(180, 250, .07, .03);
    evaluate();
  }

  function undo() {
    if (!active || solved || phase !== 'play' || !history.length) return false;
    const previous = history.pop();
    const restored = restoreBoardState(previous);
    notifyHistoryChange();
    return restored;
  }

  function reset() {
    if (!active || solved || phase !== 'play' || !initialBoardState) return false;
    history = [];
    const restored = restoreBoardState(initialBoardState);
    notifyHistoryChange();
    return restored;
  }

  function victoryLayers() {
    const cellDistance = new Map();
    POWER_SYSTEMS.forEach((system, systemIndex) => {
      const source = tileAt(system.source.r, system.source.c);
      if (!source || !effConns(source).has('s')) return;
      const sourceNode = graphNodeKey(source, 's');
      const seen = new Set([sourceNode]);
      const queue = [{ tile: source, node: sourceNode, distance: 0 }];
      while (queue.length) {
        const current = queue.shift();
        const cell = key(current.tile.r, current.tile.c);
        cellDistance.set(cell, Math.min(cellDistance.has(cell) ? cellDistance.get(cell) : Infinity, current.distance));
        nodeDirections(current.tile, current.node).forEach(direction => {
          if (classify(current.tile, direction) !== 'link') return;
          const [dr, dc] = DELTA[direction];
          const next = tileAt(current.tile.r + dr, current.tile.c + dc);
          const nextNode = graphNodeKey(next, OPP[direction]);
          if (seen.has(nextNode)) return;
          seen.add(nextNode);
          queue.push({ tile: next, node: nextNode, distance: current.distance + 1 });
        });
      }
    });
    const layers = [];
    cellDistance.forEach((distance, cell) => {
      if (!layers[distance]) layers[distance] = [];
      layers[distance].push(cell.split(',').map(Number));
    });
    return layers.filter(Boolean);
  }

  // ---- Win: flood the sealed lattice, fire the bolts ----------------------

  function win() {
    if (solved) return;
    solved = true;
    phase = 'done';
    notifyHistoryChange();
    if (stage) stage.classList.add('is-sealing');
    setSystemStatus(SINKS.length, 'GRID LOCK SEALED');
    const order = victoryLayers();
    const floodStep = 90;
    order.forEach((layer, i) => later(() => {
      layer.forEach(([r, c]) => tileAt(r, c).g.classList.add('is-flooded'));
      playTone(280 + i * 24, 470 + i * 18, .09, .035);
    }, floodStep * i));

    const waveDuration = Math.max(1, order.length) * floodStep;
    SINKS.forEach((sink, index) => later(() => fireBolt(sink.bolt), waveDuration + 80 + index * 140));
    later(() => {
      if (!stage) return;
      stage.classList.remove('is-sealing');
      stage.classList.add('is-solved');
      playTone(420, 760, .32, .065, 'sine');
    }, waveDuration + 260 + SINKS.length * 140);

    later(() => {
      if (!active || !config) return;
      const done = config; active = false;
      if (typeof done.onSuccessReady === 'function') {
        done.onSuccessReady({
          outcome: 'success',
          stats: { rotations, durationMs: Math.max(0, Math.round(performance.now() - startedAt)) }
        });
      }
    }, waveDuration + 1500);
  }

  function lightBolt(index) {
    const bolt = element(`gridlock-bolt-${index}`);
    if (bolt && !bolt.classList.contains('is-lit')) { bolt.classList.add('is-lit'); playTone(320 + index * 60, 640, .22, .06, 'square'); }
  }

  function fireBolt(index) {
    const bolt = element(`gridlock-bolt-${index}`);
    if (!bolt) return;
    bolt.classList.add('is-lit', 'is-firing');
    playTone(320 + index * 70, 690, .18, .055, 'square');
    later(() => bolt.classList.remove('is-firing'), 360);
  }

  function setBoltPowered(index, powered) {
    const bolt = element(`gridlock-bolt-${index}`);
    if (bolt) bolt.classList.toggle('is-lit', powered);
  }

  // ---- Lifecycle ----------------------------------------------------------

  function start(nextConfig) {
    destroy();
    config = nextConfig || {};
    applyGenerationConfig(config);
    stage = element(nextConfig.stageId);
    gridGroup = element('gridlock-grid');
    if (!stage || !gridGroup) return false;
    active = true; phase = 'idle'; solved = false; rotations = 0; startedAt = performance.now();

    const board = generate();
    tiles = []; emptySlot = null; gesture = null;
    while (gridGroup.firstChild) gridGroup.removeChild(gridGroup.firstChild);
    const movementBay = buildMovementBayBackdrop();
    if (movementBay) gridGroup.appendChild(movementBay);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      if (board[r][c] && board[r][c].type === 'obstacle') {
        gridGroup.appendChild(buildObstacle(r, c));
        continue;
      }
      if (!board[r][c]) {
        emptySlot = buildEmptySlot(r, c);
        gridGroup.appendChild(emptySlot.g);
        continue;
      }
      const tile = buildTile(r, c, board[r][c]);
      tiles.push(tile); gridGroup.appendChild(tile.g);
    }
    history = [];
    initialBoardState = captureBoardState();
    refreshSourceColors();
    refreshBoltAssignments();
    updateMeter(0);
    stage.classList.add('is-paused', 'is-dark');
    notifyHistoryChange();
    return true;
  }

  function begin() {
    if (!active) return false;
    phase = 'play';
    if (stage) { stage.classList.remove('is-paused', 'is-dark'); stage.classList.add('is-powering'); }
    later(() => { if (stage) stage.classList.remove('is-powering'); }, 640);
    playTone(140, 300, .4, .05); playTone(280, 520, .3, .04);
    evaluate();
    notifyHistoryChange();
    return true;
  }

  function destroy() {
    listeners.forEach(({ node, type, handler }) => node.removeEventListener(type, handler));
    listeners = [];
    clearTimers();
    active = false; phase = 'idle'; solved = false;
    config = null; stage = null; gridGroup = null; tiles = []; rotations = 0;
    slidingConfig = null; solutionEmpty = null; emptySlot = null; gesture = null; obstacleConfig = null; blockedCells = new Set(); lockedConfig = null; lockedCells = new Set(); routerConfigs = [];
    lastEvaluation = { status: 'SYSTEM FAULT', crossCount: 0, leakCount: 0, boltsOnline: 0 };
    history = []; initialBoardState = null;
  }

  // read-only: current + solving rotation per tile (used by tests; harmless)
  function snapshot() { return tiles.map(t => ({ r: t.r, c: t.c, type: t.type, shape: t.shape, rot: t.rot, solvedRot: t.solvedRot, homeR: t.homeR, homeC: t.homeC, movable: t.movable, locked: t.locked })); }
  function emptyCell() { return emptySlot ? { r: emptySlot.r, c: emptySlot.c } : null; }
  function obstacleCells() { return [...blockedCells].map(cell => { const [r, c] = cell.split(',').map(Number); return { r, c }; }); }
  function circuitState() { return { ...lastEvaluation }; }

  window.GridLock = Object.freeze({ start, begin, undo, reset, toggleBolt, destroy, snapshot, emptyCell, obstacleCells, circuitState, layoutFor, isActive() { return active; } });
})();
