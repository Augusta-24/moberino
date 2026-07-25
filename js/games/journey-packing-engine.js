/* Generic polyomino-packing puzzle engine — Kanoodle/dissection-puzzle style.
   Owns nothing about ships, hulls, or Journey lore. A fixed 8-piece library is
   constructively packed into a region (guaranteeing at least one solution by
   construction, same principle as the Abandoned Cache's spanning-tree lattice),
   then the exact number of valid tilings is counted by backtracking search;
   boards outside the requested solution-count band are rejected and regenerated
   (same reject-and-regenerate methodology that fixed the cache's difficulty
   consistency). Consuming missions host this in their own SVG stage and reskin
   the fantasy (see journey-repair.js for the first consumer). This module never
   touches persistent save state. */
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
    { id: 't-tetromino', cells: [[0, 0], [0, 1], [0, 2], [1, 1]] }
  ];

  const PIECE_COLORS = {
    'domino': '#c98a4a', 'i-tromino': '#8a9fc9', 'l-tromino': '#c9704a',
    'square': '#9ac97f', 'i-tetromino': '#7fb0c9', 'l-tetromino': '#c9b04a',
    's-tetromino': '#7fc9a8', 't-tetromino': '#c97f9a'
  };

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
  function orientations(cells) {
    let cur = norm(cells);
    const out = [cur];
    for (let i = 0; i < 3; i++) {
      cur = rotate90(cur);
      if (!out.some(o => sameShape(o, cur))) out.push(cur);
    }
    return out;
  }

  const ORIENTATION_CACHE = PIECE_LIBRARY.map(p => orientations(p.cells));

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

  function constructRegion(pieceIndexList) {
    const placed = new Set();
    const solution = [];

    function candidatePlacements(orientList, frontierCells) {
      const found = [];
      orientList.forEach((orient, orientIdx) => {
        frontierCells.forEach(([fr, fc]) => {
          orient.forEach(([ar, ac]) => {
            const dr = fr - ar, dc = fc - ac;
            const cells = orient.map(([r, c]) => [r + dr, c + dc]);
            const keys = cells.map(([r, c]) => key(r, c));
            if (keys.some(k => placed.has(k))) return;
            found.push({ cells, keys, orientIdx });
          });
        });
      });
      return found;
    }

    for (let i = 0; i < pieceIndexList.length; i++) {
      const orientList = ORIENTATION_CACHE[pieceIndexList[i]];
      let placements;
      if (placed.size === 0) {
        const firstOrientIdx = randomInt(orientList.length);
        const orient = orientList[firstOrientIdx];
        placements = [{ cells: orient, keys: orient.map(([r, c]) => key(r, c)), orientIdx: firstOrientIdx }];
      } else {
        const frontierSet = new Set();
        placed.forEach(k => {
          const [r, c] = k.split(',').map(Number);
          neighbours(r, c).forEach(([nr, nc]) => { if (!placed.has(key(nr, nc))) frontierSet.add(key(nr, nc)); });
        });
        const frontierCells = [...frontierSet].map(k => k.split(',').map(Number));
        placements = candidatePlacements(orientList, frontierCells);
      }
      if (!placements.length) return null;
      const choice = placements[randomInt(placements.length)];
      choice.keys.forEach(k => placed.add(k));
      solution.push({ pieceIndex: pieceIndexList[i], cells: choice.cells, orientIdx: choice.orientIdx });
    }

    const region = [...placed].map(k => k.split(',').map(Number));
    return { region, solution };
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
      solution: built.solution.map(p => ({ ...p, cells: p.cells.map(([r, c]) => [r - minR, c - minC]) }))
    };
  }

  function shufflePick(count) {
    const idx = PIECE_LIBRARY.map((_, i) => i);
    for (let i = idx.length - 1; i > 0; i--) { const j = randomInt(i + 1); [idx[i], idx[j]] = [idx[j], idx[i]]; }
    return idx.slice(0, count);
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
    const opts = Object.assign({ pieceCount: 8, targetMin: 3, targetMax: 4, maxAttempts: 600, nodeBudget: 8000, maxDimension: 8 }, options || {});
    let best = null;
    for (let attempt = 0; attempt < opts.maxAttempts; attempt++) {
      const pieceIndexList = shufflePick(opts.pieceCount);
      const rawBuilt = constructRegion(pieceIndexList);
      if (!rawBuilt) continue;
      const built = normalizeBuilt(rawBuilt);
      const bounds = regionBounds(built.region);
      if ((bounds.maxR - bounds.minR + 1) > opts.maxDimension || (bounds.maxC - bounds.minC + 1) > opts.maxDimension) continue;
      const result = solveCount(built.region, pieceIndexList, opts.targetMax + 4, opts.nodeBudget);
      if (result.exceeded) continue; // unverifiable in budget — reject, don't guess
      const count = result.count;
      if (count >= opts.targetMin && count <= opts.targetMax) {
        return { region: built.region, pieceIndexList, solution: built.solution, solutionCount: count, attempts: attempt + 1 };
      }
      if (!best || Math.abs(count - (opts.targetMin + opts.targetMax) / 2) < Math.abs(best.solutionCount - (opts.targetMin + opts.targetMax) / 2)) {
        best = { region: built.region, pieceIndexList, solution: built.solution, solutionCount: count, attempts: attempt + 1 };
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
  let dragging = null;
  let regionCellSize = 0;
  let regionOrigin = { x: 0, y: 0 };

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

  function checkComplete() {
    const regionSet = new Set(puzzle.region.map(([r, c]) => key(r, c)));
    const filled = new Set();
    for (const p of trayPieces) {
      if (!p.placedAt) return false;
      for (const [r, c] of currentCells(p)) {
        const k = key(r, c);
        if (!regionSet.has(k) || filled.has(k)) return false;
        filled.add(k);
      }
    }
    return filled.size === regionSet.size;
  }

  function renderPieceShape(g, cells, cellSize, colorId) {
    while (g.firstChild) g.removeChild(g.firstChild);
    const color = PIECE_COLORS[colorId] || '#8a9fc9';
    // A padded, invisible hit-rect sized to the piece's bounding box (not just
    // its painted cells) makes tap-to-rotate forgiving for small/thin pieces
    // (a 2-cell domino is otherwise a tiny, easy-to-miss target) and for taps
    // that land just outside a cell's edge. `pointer-events:all` is required
    // because a transparent fill is otherwise not hit-testable in SVG.
    const minR = Math.min(...cells.map(([r]) => r)), maxR = Math.max(...cells.map(([r]) => r));
    const minC = Math.min(...cells.map(([, c]) => c)), maxC = Math.max(...cells.map(([, c]) => c));
    // kept modest (not a generous 0.4+) because tray pieces sit close enough
    // together (see trayOrigin/traySpacing tuning in journey.js) that a larger
    // pad would make adjacent pieces' hit-rects overlap.
    const pad = cellSize * .25;
    g.appendChild(svg('rect', {
      x: minC * cellSize - pad, y: minR * cellSize - pad,
      width: (maxC - minC + 1) * cellSize + pad * 2, height: (maxR - minR + 1) * cellSize + pad * 2,
      fill: 'transparent', 'pointer-events': 'all', class: 'jpe-piece-hit'
    }));
    cells.forEach(([r, c]) => {
      const rect = svg('rect', {
        x: c * cellSize + 1, y: r * cellSize + 1, width: cellSize - 2, height: cellSize - 2,
        rx: 3, fill: color, stroke: '#0b1119', 'stroke-width': 2, class: 'jpe-cell'
      });
      g.appendChild(rect);
      const rivetOffset = cellSize * .18;
      [[rivetOffset, rivetOffset], [cellSize - rivetOffset, rivetOffset], [rivetOffset, cellSize - rivetOffset], [cellSize - rivetOffset, cellSize - rivetOffset]].forEach(([rx, ry]) => {
        g.appendChild(svg('circle', { cx: c * cellSize + rx, cy: r * cellSize + ry, r: cellSize * .04, fill: '#0b1119', opacity: .35 }));
      });
    });
  }

  function placePieceAt(piece, r, c) {
    piece.placedAt = [r, c];
    piece.g.setAttribute('transform', `translate(${regionOrigin.x + c * regionCellSize},${regionOrigin.y + r * regionCellSize})`);
    piece.g.classList.add('is-placed');
  }

  function returnPieceHome(piece) {
    piece.placedAt = null;
    piece.g.setAttribute('transform', `translate(${piece.home.x},${piece.home.y})`);
    piece.g.classList.remove('is-placed');
  }

  function rotatePiece(piece) {
    if (!active || paused || solved || piece.placedAt) return;
    const orients = ORIENTATION_CACHE[piece.pieceIndex];
    piece.orientIdx = (piece.orientIdx + 1) % orients.length;
    renderPieceShape(piece.g, orients[piece.orientIdx], regionCellSize, PIECE_LIBRARY[piece.pieceIndex].id);
    playTone(260 + Math.random() * 30, 320, .06, .02);
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

  function startDrag(piece, event) {
    if (!active || paused || solved) return;
    if (event.preventDefault) event.preventDefault();
    dragging = { piece, startedAt: performance.now(), moved: false, offset: pointFromEvent(event) };
    piece.g.classList.add('is-dragging');
  }

  function moveDrag(event) {
    if (!dragging) return;
    const point = pointFromEvent(event);
    dragging.moved = true;
    dragging.piece.g.setAttribute('transform', `translate(${point.x - regionCellSize / 2},${point.y - regionCellSize / 2})`);
  }

  function endDrag(event) {
    if (!dragging) return;
    const { piece, moved } = dragging;
    piece.g.classList.remove('is-dragging');
    dragging = null;
    if (!moved) {
      if (piece.placedAt) { returnPieceHome(piece); playTone(220, 150, .1, .02); return; }
      rotatePiece(piece);
      return;
    }

    const point = pointFromEvent(event);
    const r = Math.round((point.y - regionOrigin.y - regionCellSize / 2) / regionCellSize);
    const c = Math.round((point.x - regionOrigin.x - regionCellSize / 2) / regionCellSize);
    const orient = ORIENTATION_CACHE[piece.pieceIndex][piece.orientIdx];
    const cells = orient.map(([rr, cc]) => [rr + r, cc + c]);
    const regionSet = new Set(puzzle.region.map(([rr, cc]) => key(rr, cc)));
    const fits = cells.every(([rr, cc]) => regionSet.has(key(rr, cc))) &&
      cells.every(([rr, cc]) => !trayPieces.some(other => other !== piece && other.placedAt && currentCells(other).some(([or, oc]) => or === rr && oc === cc)));

    if (!fits) {
      returnPieceHome(piece);
      playTone(200, 150, .12, .025);
      return;
    }
    placePieceAt(piece, r, c);
    playTone(300, 460, .14, .035);
    if (checkComplete()) win();
  }

  function win() {
    if (solved) return;
    solved = true;
    playTone(392, 784, .32, .06);
    if (config && typeof config.onComplete === 'function') config.onComplete({ solution: puzzle.solution, pieceIndexList: puzzle.pieceIndexList });
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
      pieceCount: nextConfig.pieceCount || 8,
      targetMin: nextConfig.targetMin || 3,
      targetMax: nextConfig.targetMax || 4
    });
    if (!puzzle) return false;

    active = true; paused = !!nextConfig.initiallyPaused; solved = false;
    regionCellSize = nextConfig.cellSize || 44;
    regionOrigin = nextConfig.regionOrigin || { x: 0, y: 0 };

    while (regionGroup.firstChild) regionGroup.removeChild(regionGroup.firstChild);
    while (trayGroup.firstChild) trayGroup.removeChild(trayGroup.firstChild);

    // draw the empty region outline (per-cell sockets)
    const bounds = regionBounds(puzzle.region);
    // A rect sized to the region's own bounding box, drawn beneath the sockets,
    // so a host can visually distinguish "this is the puzzle" from its
    // surrounding stage (e.g. Repair Moon fills it with a starfield so the
    // silhouette reads as a hull breach rather than the puzzle floating in
    // otherwise-undifferentiated space). Generic: no fill by default, purely a
    // CSS hook (.jpe-region-bg) plus an optional inline override.
    const bgPad = 6;
    const bgRect = svg('rect', {
      x: regionOrigin.x + bounds.minC * regionCellSize - bgPad,
      y: regionOrigin.y + bounds.minR * regionCellSize - bgPad,
      width: (bounds.maxC - bounds.minC + 1) * regionCellSize + bgPad * 2,
      height: (bounds.maxR - bounds.minR + 1) * regionCellSize + bgPad * 2,
      rx: 10, class: 'jpe-region-bg'
    });
    if (nextConfig.regionBackgroundFill) bgRect.setAttribute('fill', nextConfig.regionBackgroundFill);
    regionGroup.appendChild(bgRect);
    puzzle.region.forEach(([r, c]) => {
      regionGroup.appendChild(svg('rect', {
        x: regionOrigin.x + c * regionCellSize + 1, y: regionOrigin.y + r * regionCellSize + 1,
        width: regionCellSize - 2, height: regionCellSize - 2, rx: 3, class: 'jpe-socket'
      }));
    });

    // lay out tray pieces below/around the region, scrambled to a non-solved orientation
    trayPieces = [];
    const trayOrigin = nextConfig.trayOrigin || { x: 0, y: regionOrigin.y + (bounds.maxR - bounds.minR + 2) * regionCellSize };
    const trayCols = nextConfig.trayCols || 4;
    const traySpacing = nextConfig.traySpacing || regionCellSize * 4.2;
    puzzle.pieceIndexList.forEach((pieceIndex, i) => {
      const orients = ORIENTATION_CACHE[pieceIndex];
      const solvedOrientIdx = puzzle.solution[i].orientIdx;
      const scrambleCandidates = orients.map((_, idx) => idx).filter(idx => idx !== solvedOrientIdx);
      const startOrientIdx = scrambleCandidates.length ? scrambleCandidates[randomInt(scrambleCandidates.length)] : solvedOrientIdx;
      const col = i % trayCols, row = Math.floor(i / trayCols);
      const home = { x: trayOrigin.x + col * traySpacing, y: trayOrigin.y + row * traySpacing };
      const g = svg('g', { class: 'jpe-piece', transform: `translate(${home.x},${home.y})` });
      renderPieceShape(g, orients[startOrientIdx], regionCellSize, PIECE_LIBRARY[pieceIndex].id);
      trayGroup.appendChild(g);
      const piece = { pieceIndex, orientIdx: startOrientIdx, g, home, placedAt: null };
      trayPieces.push(piece);
      addListener(g, 'pointerdown', event => startDrag(piece, event), { passive: false });
    });

    addListener(stage, 'pointermove', moveDrag, { passive: false });
    addListener(stage, 'pointerup', endDrag, { passive: false });
    addListener(stage, 'pointerleave', endDrag, { passive: false });
    return true;
  }

  function begin() {
    if (!active) return false;
    paused = false;
    return true;
  }

  function destroy() {
    listeners.forEach(({ node, type, handler }) => node.removeEventListener(type, handler));
    listeners = [];
    active = false; paused = true; solved = false;
    config = null; stage = null; puzzle = null; trayPieces = []; dragging = null;
  }

  // read-only: current puzzle + tray piece elements (used by tests; harmless)
  function getPuzzle() { return puzzle; }
  function getTrayPieces() { return trayPieces; }

  window.JourneyPackingEngine = Object.freeze({
    // puzzle logic (usable headless, e.g. by tests or a future generator tool)
    PIECE_LIBRARY, orientations, solveCount, generate,
    // rendering lifecycle
    start, begin, destroy,
    isActive() { return active; },
    isSolved() { return solved; },
    getPuzzle, getTrayPieces
  });
})();
