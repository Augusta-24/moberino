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
  const S = 66;
  let SOURCE = { r: 5, c: 0 };
  let SINKS = [{ r: 0, c: 1, bolt: 0 }, { r: 0, c: 3, bolt: 1 }, { r: 0, c: 5, bolt: 2 }];
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

  function element(id) { return document.getElementById(id); }
  function svg(tag, attrs) { const n = document.createElementNS(NS, tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }
  function key(r, c) { return `${r},${c}`; }
  function isSink(r, c) { return SINKS.some(s => s.r === r && s.c === c); }

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
  function setObjective(text) { const o = element('gridlock-objective'); if (o) o.textContent = text; }
  function addListener(node, type, handler, options) { if (!node) return; node.addEventListener(type, handler, options); listeners.push({ node, type, handler }); }
  function tileAt(r, c) { if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null; return tiles[r * COLS + c]; }

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

  function buildConnectivity() {
    const conn = Array.from({ length: ROWS }, () => Array.from({ length: COLS }, () => new Set()));
    const inBounds = (r, c) => r >= 0 && r < ROWS && c >= 0 && c < COLS;
    const neighbours = (r, c) => ORDER.map(d => { const [dr, dc] = DELTA[d]; return [r + dr, c + dc, d]; }).filter(([nr, nc]) => inBounds(nr, nc));
    const connect = (r, c, d) => { const [dr, dc] = DELTA[d]; conn[r][c].add(d); conn[r + dr][c + dc].add(OPP[d]); };

    // randomized-DFS spanning tree → every cell joined, connected network
    const visited = new Set([key(SOURCE.r, SOURCE.c)]);
    const stack = [[SOURCE.r, SOURCE.c]];
    while (stack.length) {
      const [r, c] = stack[stack.length - 1];
      const open = neighbours(r, c).filter(([nr, nc]) => !visited.has(key(nr, nc)));
      if (!open.length) { stack.pop(); continue; }
      const [nr, nc, d] = open[Math.floor(Math.random() * open.length)];
      connect(r, c, d); visited.add(key(nr, nc)); stack.push([nr, nc]);
    }
    // extra loop edges → richer coupling, fewer dead-end caps (respect max degree 4)
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      ['e', 's'].forEach(d => {
        const [dr, dc] = DELTA[d]; const nr = r + dr, nc = c + dc;
        if (!inBounds(nr, nc) || conn[r][c].has(d)) return;
        if (conn[r][c].size >= 4 || conn[nr][nc].size >= 4) return;
        if (Math.random() < LOOP_EDGE_CHANCE) connect(r, c, d);
      });
    }
    // external openings: core feeds the source (south), each bolt taps its sink (north)
    conn[SOURCE.r][SOURCE.c].add('s');
    SINKS.forEach(s => conn[s.r][s.c].add('n'));
    return conn;
  }

  function applyGenerationConfig(nextConfig) {
    const size = nextConfig && nextConfig.size || {};
    ROWS = Math.max(3, Math.round(size.rows || 6));
    COLS = Math.max(3, Math.round(size.columns || 6));
    X0 = (560 - COLS * S) / 2;
    SOURCE = { r: ROWS - 1, c: 0 };
    SINKS = [
      { r: 0, c: Math.min(1, COLS - 1), bolt: 0 },
      { r: 0, c: Math.floor(COLS / 2), bolt: 1 },
      { r: 0, c: COLS - 1, bolt: 2 }
    ].filter((sink, index, sinks) => sinks.findIndex(other => other.c === sink.c) === index);
    const rules = nextConfig && nextConfig.generationRules || {};
    LOOP_EDGE_CHANCE = Number.isFinite(rules.loopEdgeChance) ? rules.loopEdgeChance : .34;
    MAX_X_FRACTION = Number.isFinite(rules.maxCrossingFraction) ? rules.maxCrossingFraction : .15;
  }

  function xFraction(conn) {
    let xCount = 0;
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) if (conn[r][c].size === 4) xCount += 1;
    return xCount / (ROWS * COLS);
  }

  function generate() {
    let conn = buildConnectivity();
    for (let attempt = 1; attempt < MAX_GENERATE_ATTEMPTS && xFraction(conn) > MAX_X_FRACTION; attempt += 1) {
      conn = buildConnectivity();
    }

    const board = [];
    for (let r = 0; r < ROWS; r++) {
      const row = [];
      for (let c = 0; c < COLS; c++) {
        const { shape, rot } = shapeRotFor(conn[r][c]);
        // scramble to a rotation whose openings differ from the solved one when possible
        const cands = [0, 1, 2, 3].filter(k => !sameSet(openingsOf(shape, k), conn[r][c]));
        const startRot = cands.length ? cands[Math.floor(Math.random() * cands.length)] : rot;
        row.push({ shape, solvedRot: rot, startRot });
      }
      board.push(row);
    }
    return board;
  }

  // ---- Rendering ----------------------------------------------------------

  function buildTile(r, c, def) {
    const cx = X0 + c * S + S / 2, cy = Y0 + r * S + S / 2, half = S / 2 - 3;
    const g = svg('g', { transform: `translate(${cx},${cy})`, class: 'gridlock-tile' });
    g.appendChild(svg('rect', { x: -half, y: -half, width: half * 2, height: half * 2, rx: 6, class: 'gl-plate' }));
    g.appendChild(svg('rect', { x: -half + 3, y: -half + 2, width: half * 2 - 6, height: 3, class: 'gl-bevel-top' }));
    const chan = svg('g', { class: 'gl-chan' });
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
      const seg = svg('rect', { rx: 4, class: 'gl-seg' });
      if (dir === 'n') { seg.setAttribute('x', -w / 2); seg.setAttribute('y', -reach); seg.setAttribute('width', w); seg.setAttribute('height', reach + 4); }
      if (dir === 's') { seg.setAttribute('x', -w / 2); seg.setAttribute('y', -4); seg.setAttribute('width', w); seg.setAttribute('height', reach + 4); }
      if (dir === 'e') { seg.setAttribute('x', -4); seg.setAttribute('y', -w / 2); seg.setAttribute('width', reach + 4); seg.setAttribute('height', w); }
      if (dir === 'w') { seg.setAttribute('x', -reach); seg.setAttribute('y', -w / 2); seg.setAttribute('width', reach + 4); seg.setAttribute('height', w); }
      chan.appendChild(seg);

      const cap = svg('rect', { rx: 1.5, class: `gl-leak-cap gl-leak-cap-${dir}` });
      if (dir === 'n') { cap.setAttribute('x', -capBand / 2); cap.setAttribute('y', -capDist - capThick / 2); cap.setAttribute('width', capBand); cap.setAttribute('height', capThick); }
      if (dir === 's') { cap.setAttribute('x', -capBand / 2); cap.setAttribute('y', capDist - capThick / 2); cap.setAttribute('width', capBand); cap.setAttribute('height', capThick); }
      if (dir === 'e') { cap.setAttribute('x', capDist - capThick / 2); cap.setAttribute('y', -capBand / 2); cap.setAttribute('width', capThick); cap.setAttribute('height', capBand); }
      if (dir === 'w') { cap.setAttribute('x', -capDist - capThick / 2); cap.setAttribute('y', -capBand / 2); cap.setAttribute('width', capThick); cap.setAttribute('height', capBand); }
      chan.appendChild(cap);
    });
    chan.appendChild(svg('circle', { r: 8, class: 'gl-hub' }));
    chan.setAttribute('transform', `rotate(${def.startRot * 90})`);
    g.appendChild(chan);
    const tile = { r, c, shape: def.shape, rot: def.startRot, solvedRot: def.solvedRot, g, chan };
    addListener(g, 'pointerdown', event => rotateTile(tile, event), { passive: false });
    return tile;
  }

  // classify a tile's opening in a direction: matched, sanctioned external, or a leak
  function classify(tile, dir) {
    const [dr, dc] = DELTA[dir];
    const nr = tile.r + dr, nc = tile.c + dc;
    if (nr < 0 || nr >= ROWS || nc < 0 || nc >= COLS) {
      if (dir === 's' && tile.r === SOURCE.r && tile.c === SOURCE.c) return 'feed';
      if (dir === 'n' && isSink(tile.r, tile.c)) return 'bolt';
      return 'leak';
    }
    const next = tileAt(nr, nc);
    return effConns(next).has(OPP[dir]) ? 'link' : 'leak';
  }

  function tileSealed(tile) {
    let sealed = true;
    effConns(tile).forEach(dir => { if (classify(tile, dir) === 'leak') sealed = false; });
    return sealed;
  }

  function floodReaches() {
    const seen = new Set([key(SOURCE.r, SOURCE.c)]);
    const src = tileAt(SOURCE.r, SOURCE.c);
    if (!src || !effConns(src).has('s')) return seen;
    const q = [[SOURCE.r, SOURCE.c]];
    while (q.length) {
      const [r, c] = q.shift();
      effConns(tileAt(r, c)).forEach(dir => {
        if (classify(tileAt(r, c), dir) !== 'link') return;
        const [dr, dc] = DELTA[dir]; const k = key(r + dr, c + dc);
        if (!seen.has(k)) { seen.add(k); q.push([r + dr, c + dc]); }
      });
    }
    return seen;
  }

  function evaluate() {
    // The tile colour is a pure physical read: blue means current has actually
    // flowed there (reachable from the core through a chain of matched
    // openings), not "this tile's four sides happen to line up with whatever
    // its neighbours currently show." A tile can be locally tidy on every side
    // and still be an isolated pocket the current never reaches — that must
    // stay unlit.
    //
    // Reachable is necessary but not sufficient for winning: a tile can be lit
    // via one matched side while another of its openings still leaks (an
    // energized tile is not the same as a fully sealed one). Left unmarked,
    // that leak is invisible — the whole board can read as one solid blue mass
    // while still failing to win, with no visual cue pointing at the problem.
    // is-leaking flags any tile with an unresolved leak independently of
    // is-sealed, so a leak can never hide behind an energized/blue tile.
    //
    // The visible cap mark is deliberately narrower than "is-leaking": it
    // only lights up on a segment that is BOTH energized (its tile is
    // reached) AND a dead end. A freshly-scrambled board has leaks
    // everywhere before any current has even arrived — marking all of them
    // would be constant background noise with nothing meaningful to say yet.
    // The genuinely useful moment is "power got here, but this end goes
    // nowhere," which only exists once the tile is actually lit.
    const reached = floodReaches();
    let allMatched = true, openings = 0, matchedOpenings = 0;
    tiles.forEach(t => {
      let matched = true;
      const isReached = reached.has(key(t.r, t.c));
      const activeCapDirs = [];
      SHAPES[t.shape].forEach(localDir => {
        openings += 1;
        const absDir = ORDER[(ORDER.indexOf(localDir) + t.rot) % 4];
        const leak = classify(t, absDir) === 'leak';
        if (leak) matched = false; else matchedOpenings += 1;
        if (leak && isReached) activeCapDirs.push(localDir);
      });
      if (!matched) allMatched = false;
      t.g.classList.toggle('is-sealed', isReached);
      t.g.classList.toggle('is-leaking', !matched);
      ORDER.forEach(dir => t.g.classList.toggle(`leakcap-${dir}`, activeCapDirs.includes(dir)));
    });
    updateMeter(openings ? matchedOpenings / openings : 0);
    if (allMatched && SINKS.every(s => reached.has(key(s.r, s.c)))) win();
  }

  function updateMeter(frac) {
    const needle = element('gridlock-needle');
    if (needle) needle.setAttribute('transform', `rotate(${-120 + frac * 240})`);
  }

  function rotateTile(tile, event) {
    if (event && event.preventDefault) event.preventDefault();
    if (!active || solved || phase !== 'play') return;
    tile.rot = (tile.rot + 1) % 4;
    tile.chan.setAttribute('transform', `rotate(${tile.rot * 90})`);
    rotations += 1;
    playTone(230 + Math.random() * 40, 320, .05, .02);
    evaluate();
  }

  // ---- Win: flood the sealed lattice, fire the bolts ----------------------

  function win() {
    if (solved) return;
    solved = true;
    phase = 'done';
    if (stage) stage.classList.add('is-solved');
    setObjective('LATTICE SEALED · GRID LOCK OPEN');
    // flood the network from the core, layer by layer
    const order = [];
    const seen = new Set([key(SOURCE.r, SOURCE.c)]);
    let frontier = [[SOURCE.r, SOURCE.c]];
    while (frontier.length) {
      order.push(frontier);
      const nextF = [];
      frontier.forEach(([r, c]) => {
        effConns(tileAt(r, c)).forEach(dir => {
          if (classify(tileAt(r, c), dir) !== 'link') return;
          const [dr, dc] = DELTA[dir]; const k = key(r + dr, c + dc);
          if (!seen.has(k)) { seen.add(k); nextF.push([r + dr, c + dc]); }
        });
      });
      frontier = nextF;
    }
    order.forEach((layer, i) => later(() => {
      layer.forEach(([r, c]) => tileAt(r, c).g.classList.add('is-flooded'));
      SINKS.forEach(s => { if (layer.some(([r, c]) => r === s.r && c === s.c)) lightBolt(s.bolt); });
      playTone(300 + i * 25, 520, .12, .04);
    }, 90 * i));

    later(() => {
      if (!active || !config) return;
      const done = config; active = false;
      if (typeof done.onSuccessReady === 'function') {
        done.onSuccessReady({
          outcome: 'success',
          stats: { rotations, durationMs: Math.max(0, Math.round(performance.now() - startedAt)) }
        });
      }
    }, 90 * order.length + 1400);
  }

  function lightBolt(index) {
    const bolt = element(`gridlock-bolt-${index}`);
    if (bolt && !bolt.classList.contains('is-lit')) { bolt.classList.add('is-lit'); playTone(320 + index * 60, 640, .22, .06, 'square'); }
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
    tiles = [];
    while (gridGroup.firstChild) gridGroup.removeChild(gridGroup.firstChild);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const tile = buildTile(r, c, board[r][c]);
      tiles.push(tile); gridGroup.appendChild(tile.g);
    }
    updateMeter(0);
    stage.classList.add('is-paused', 'is-dark');
    return true;
  }

  function begin() {
    if (!active) return false;
    phase = 'play';
    if (stage) { stage.classList.remove('is-paused', 'is-dark'); stage.classList.add('is-powering'); }
    later(() => { if (stage) stage.classList.remove('is-powering'); }, 640);
    setObjective('SEAL EVERY CONDUIT · LEAVE NO LOOSE END');
    playTone(140, 300, .4, .05); playTone(280, 520, .3, .04);
    evaluate();
    return true;
  }

  function destroy() {
    listeners.forEach(({ node, type, handler }) => node.removeEventListener(type, handler));
    listeners = [];
    clearTimers();
    active = false; phase = 'idle'; solved = false;
    config = null; stage = null; gridGroup = null; tiles = []; rotations = 0;
  }

  // read-only: current + solving rotation per tile (used by tests; harmless)
  function snapshot() { return tiles.map(t => ({ r: t.r, c: t.c, rot: t.rot, solvedRot: t.solvedRot })); }

  window.GridLock = Object.freeze({ start, begin, destroy, snapshot, isActive() { return active; } });
})();
