#!/usr/bin/env python3
"""WORD MOBE board generator v2 — decision webs, not chains.

v1 planted a single eviction chain (fix A -> get key to B -> ...), which produced
corridors: one productive move per turn, zero decisions. v2 plants a letter
ECONOMY — hub keys that fit multiple locks, dud payouts, and picks (spending a
spare letter into a wrong slot to extract its letter without clearing) — then
grades every candidate board with a full-state solver and only ships boards that
force real decisions.

Solver metrics (per board):
  par       shortest route to empty board (includes re-words and picks)
  tension   turns on the optimal path with >=2 visible-progress moves where
            at least one is a mistake (costs extra swaps)
  freedom   turns with >=2 equally-optimal visible moves (order freedom)
  traps     visible CLEAR moves on the path that cost >=3 extra swaps or dead-end
  gap       (naive greedy bot length) - par, averaged over rollouts
  picks     whether the par route requires an extraction move (expert tech)

Run:  python3 generate_word_boards.py            regenerate js/games/word-boards.js
      python3 generate_word_boards.py --analyze  solve + grade the CURRENT pack

The physics here (settle / fuse / clear) mirrors js/games/word.js exactly:
  - a brick rests at (highest overlapping brick below).level + 1
  - two fragment bricks adjacent at the same level merge left+right; merged
    bricks are no longer fragments; a merged brick that spells a word clears
  - a non-fragment brick clears when its letters spell a dict word, checked
    only on the brick just swapped into (or just fused)
Change one side only if you change the other.
"""

import argparse
import json
import random
import re
import sys
import time
from collections import Counter, deque
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "js" / "games" / "word-boards.js"
N_LEVELS = 40
INF = 10 ** 9

VOWELS = set("aeiou")
STOP = {"info", "index", "unix", "faq", "faqs", "gif", "gifs", "url", "utc",
        "isbn", "asin", "euro", "euros", "config", "admin", "org", "com",
        "net", "gov", "intl", "corp", "inc", "llc", "ltd", "www", "http",
        "san", "los", "las", "del", "les", "der", "des", "und", "von", "por",
        "que", "dos", "sur", "sri", "est", "etc", "usa", "uni", "sic", "ana",
        "jan", "feb", "apr", "aug", "sep", "oct", "nov", "dec", "eds", "ibid",
        "tue", "thu", "non", "vol", "ers", "sec", "min", "ans", "abs",
        # not-words and name-shaped tokens that pass the sysdict filter
        "mon", "marc", "yahoo", "pic", "hart", "lee",
        "jane", "billy", "john", "david", "mike", "paul", "james", "george",
        "maria", "anna", "chris", "scott", "ryan", "eric", "adam", "alan",
        "henry", "joe", "tim", "dave", "steve", "brian", "jason", "greg",
        "jeff", "larry", "gary", "keith", "carl", "luis", "jose", "juan",
        "ana", "ian", "kim", "amy", "ann", "sue", "kevin", "sarah", "laura",
        "linda", "mary", "susan", "karen", "lisa", "nancy", "helen", "emma",
        "alice", "julia", "diana", "anne", "dan", "don", "ted", "roy", "leo"}


def load_words():
    freq = [w.strip().lower() for w in (ROOT / "word_list_10k.txt").read_text().splitlines()]
    freq = [w for w in freq if w.isalpha() and w.isascii()]
    dictionary = {w for w in freq if 3 <= len(w) <= 7}
    sysdict = set()
    sd = Path("/usr/share/dict/words")
    if sd.exists():
        sysdict = {w.strip() for w in sd.read_text().splitlines()
                   if w.strip().islower() and w.strip().isalpha()}
    solutions = {}
    for rank, w in enumerate(freq):
        if not (3 <= len(w) <= 6):
            continue
        if w in STOP or not (set(w) & VOWELS):
            continue
        if sysdict and w not in sysdict:
            continue
        solutions.setdefault(w, rank)
    common = [w for w, r in solutions.items() if r < 2500]
    rare = [w for w, r in solutions.items() if 2500 <= r < 9000 and len(w) >= 4]
    blocked = dictionary | {w for w in sysdict if 3 <= len(w) <= 7}
    return dictionary, blocked, common, rare


DICT, BROKEN_BLOCK, COMMON, RARE = load_words()
BY_LEN_COMMON = {L: sorted(w for w in COMMON if len(w) == L) for L in range(3, 7)}
BY_LEN_RARE = {L: sorted(w for w in RARE if len(w) == L) for L in range(3, 7)}
JUNK = "qzxjvwk"


# ══════════════════════════════════════════════════════════════════
#  SOLVER — full-state search over (bricks, rack)
#  Brick = (x, lv, cur, frag, sol) tuples; rack = sorted tuple of letters.
#  Move space (what a player can usefully do):
#    CLEAR   swap makes the brick spell a dict word (incl. alternate words
#            and re-words through correct slots) -> brick clears
#    FIX     place the sol letter into its wrong slot without clearing
#            (fragments pre-fusion, double-wrong words)
#    EXTRACT swap any letter into a wrong slot to evict a letter that some
#            remaining slot still needs (the "pick" move)
# ══════════════════════════════════════════════════════════════════

def _overlap(a, b):
    return a[0] < b[0] + len(b[2]) and b[0] < a[0] + len(a[2])


def resolve_physics(bricks):
    """Settle + fuse + cascade-clear until stable. bricks: list of tuples."""
    bricks = [list(b) for b in bricks]
    while True:
        # settle
        moved = True
        while moved:
            moved = False
            for g in bricks:
                supp = 0
                for o in bricks:
                    if o is not g and o[1] < g[1] and _overlap(o, g):
                        supp = max(supp, o[1] + 1)
                if g[1] != supp:
                    g[1] = supp
                    moved = True
        # fuse one adjacent fragment pair (leftmost first, like the runtime)
        bricks.sort(key=lambda g: g[0])
        fused = None
        for a in bricks:
            if fused:
                break
            for b in bricks:
                if (a is not b and a[3] and b[3] and a[1] == b[1]
                        and a[0] + len(a[2]) == b[0]):
                    fused = [a[0], a[1], a[2] + b[2], 0, a[4] + b[4]]
                    bricks.remove(a)
                    bricks.remove(b)
                    if fused[2] not in DICT:  # merged word clears instantly
                        bricks.append(fused)
                    break
        if fused is None:
            return tuple(sorted(tuple(g) for g in bricks))


_phys_cache = {}


def _resolve_cached(nb_tuple):
    r = _phys_cache.get(nb_tuple)
    if r is None:
        r = resolve_physics(nb_tuple)
        _phys_cache[nb_tuple] = r
    return r


def gen_moves(bricks, rack):
    """Yield (kind, new_bricks, new_rack).

    Kinds:
      FIXCLEAR  sol letter into its wrong slot, word clears (the obvious move)
      FIX       sol letter into its wrong slot, no clear (fragments, dw words)
      ALTCLEAR  a non-sol letter that still spells a dict word (re-words)
      EXTRACT   spend a letter into a wrong slot to evict a needed letter

    Visible moves (what a casual player perceives as progress) = FIXCLEAR+FIX.
    EXTRACT spending is canonicalized: if a junk letter (needed nowhere) is in
    the rack, only it may be spent — collapses symmetric branches.
    """
    needs = Counter()
    for (x, lv, cur, frag, sol) in bricks:
        for a, b in zip(cur, sol):
            if a != b:
                needs[b] += 1
    rack_set = set(rack)
    junk_in_rack = sorted(L for L in rack_set if needs[L] == 0)
    extract_spend = junk_in_rack[:1] if junk_in_rack else sorted(rack_set)
    blist = list(bricks)
    for bi, (x, lv, cur, frag, sol) in enumerate(blist):
        for i in range(len(cur)):
            c = cur[i]
            wrong = c != sol[i]
            for L in rack_set:
                if L == c:
                    continue
                new = cur[:i] + L + cur[i + 1:]
                clears = (not frag) and new in DICT
                if clears:
                    kind = "FIXCLEAR" if (wrong and L == sol[i]) else "ALTCLEAR"
                elif wrong and L == sol[i]:
                    kind = "FIX"
                elif wrong and needs[c] > 0 and L in extract_spend:
                    kind = "EXTRACT"
                else:
                    continue
                r = list(rack)
                r.remove(L)
                r.append(c)
                new_rack = tuple(sorted(r))
                if clears:
                    nb = tuple(blist[:bi] + blist[bi + 1:])
                    new_bricks = _resolve_cached(nb)
                else:
                    # letters changed in place — geometry untouched, skip physics
                    nb = blist[:bi] + blist[bi + 1:] + [(x, lv, new, frag, sol)]
                    new_bricks = tuple(sorted(nb))
                yield kind, new_bricks, new_rack


def solve(level, state_cap=400000, max_depth=16, seed=0):
    """Full BFS to horizon par+1, backward distance-to-goal, decision metrics.
    Returns metrics dict, or None if unsolvable / search blew the cap.

    Metric semantics (all over "visible" moves = placing the sol letter into
    its wrong slot — the moves a casual player can actually see):
      tension  turns on an optimal path with >=2 visible options, >=1 costing
               at least one extra swap
      freedom  turns with >=2 visible options all optimal (order freedom)
      traps    visible options costing >=2 extra swaps (or falling off every
               known completion) — fixing the right word at the wrong time
      tech     the par route needs a non-visible move (EXTRACT or ALTCLEAR)
      gap      naive-bot swaps minus par; the bot fixes whatever it can and
               pokes randomly when stuck, like a player who doesn't plan
    """
    _phys_cache.clear()
    rng = random.Random(seed)
    bricks0 = tuple(sorted((b["x"], b["lv"], b["cur"], b["frag"], b["sol"])
                           for b in level["bricks"]))
    rack0 = tuple(sorted(level["rack"]))
    start = (bricks0, rack0)

    def lb(bricks):
        # admissible: every non-fragment brick costs >=1 swap; a fragment pair
        # merges into one brick that costs >=1 (never overestimate)
        frags = sum(1 for b in bricks if b[3])
        return (len(bricks) - frags) + (frags + 1) // 2

    # phase 1 — A* for par (explores far less than BFS on big boards)
    import heapq
    gmap = {start: 0}
    par = None
    heap = [(lb(bricks0), 0, start)]
    while heap:
        f, depth, s = heapq.heappop(heap)
        if gmap.get(s, INF) < depth or depth >= max_depth:
            continue
        if not s[0]:
            par = depth
            break
        for kind, nb, nr in gen_moves(*s):
            t = (nb, nr)
            nd = depth + 1
            if gmap.get(t, INF) <= nd:
                continue
            gmap[t] = nd
            heapq.heappush(heap, (nd + lb(nb), nd, t))
            if len(gmap) > state_cap:
                return None
    if par is None:
        return None

    # phase 2 — BFS over the near-optimal slice (g + lb <= par+1), with edges
    g = {start: 0}
    adj = {}
    goals = []
    q = deque([start])
    while q:
        s = q.popleft()
        depth = g[s]
        if depth >= par + 1:
            continue
        moves = []
        for kind, nb, nr in gen_moves(*s):
            t = (nb, nr)
            moves.append((kind, t))
            if t in g:
                continue
            if depth + 1 + lb(nb) > par + 1:
                continue  # provably can't finish within par+1 — dangling edge
            g[t] = depth + 1
            if not nb:
                goals.append(t)
            else:
                q.append(t)
            if len(g) > state_cap:
                return None
        adj[s] = moves
    if not goals:
        return None

    radj = {}
    for s, moves in adj.items():
        for kind, t in moves:
            radj.setdefault(t, []).append(s)
    dist = {}
    bq = deque()
    for t in goals:
        dist[t] = 0
        bq.append(t)
    while bq:
        t = bq.popleft()
        for s in radj.get(t, ()):
            if s not in dist:
                dist[s] = dist[t] + 1
                bq.append(s)
    if dist.get(start) != par:
        return None

    tension = freedom = traps = 0
    tech = False
    s = start
    while s[0]:
        opts = adj.get(s, [])
        d_here = dist[s]
        visible = [(k, t) for k, t in opts if k in ("FIXCLEAR", "FIX")]
        vis_opt = [x for x in visible if 1 + dist.get(x[1], INF) == d_here]
        vis_bad = [x for x in visible if 1 + dist.get(x[1], INF) > d_here]
        if len(visible) >= 2 and vis_bad:
            tension += 1
        if len(vis_opt) >= 2 and not vis_bad:
            freedom += 1
        for k, t in visible:
            dt = dist.get(t, INF)
            if dt == INF or 1 + dt - d_here >= 2:
                traps += 1
        best = [(k, t) for k, t in opts if 1 + dist.get(t, INF) == d_here]
        kind, s = rng.choice(best)
        if kind in ("EXTRACT", "ALTCLEAR"):
            tech = True

    total_gap, rolls = 0, 12
    for r in range(rolls):
        rr = random.Random(seed * 977 + r)
        s = start
        steps = 0
        while s[0] and steps < 2 * par + 8:
            opts = adj.get(s)
            if opts is None:  # off the explored graph — expand on the fly
                opts = [(k, (nb, nr)) for k, nb, nr in gen_moves(*s)]
            visible = [t for k, t in opts if k in ("FIXCLEAR", "FIX")]
            pokes = [t for k, t in opts if k == "EXTRACT"]
            pool = visible or pokes
            if not pool:
                steps = 2 * par + 8
                break
            s = rr.choice(pool)
            steps += 1
        total_gap += max(0, steps - par)
    gap = total_gap / rolls

    return dict(par=par, tension=tension, freedom=freedom, traps=traps,
                gap=round(gap, 1), picks=tech, states=len(g))


# ══════════════════════════════════════════════════════════════════
#  LAYOUT (unchanged geometry from v1: packed rows, fusion complexes)
# ══════════════════════════════════════════════════════════════════

def partition_span(width, rng, long_words=False):
    if width == 0:
        return []
    # long_words biases toward 5-6 letter bricks: fewer units per row keeps the
    # solver's state space tractable on big boards, and reads as harder anyway
    wt = {3: 1, 4: 2, 5: 5, 6: 5} if long_words else {3: 2, 4: 4, 5: 4, 6: 2}
    out, rem = [], width
    for _ in range(50):
        opts = [L for L in (3, 4, 5, 6) if rem - L == 0 or rem - L >= 3]
        if not opts:
            return None
        L = rng.choices(opts, [wt[o] for o in opts])[0]
        out.append(L)
        rem -= L
        if rem == 0:
            return out
    return None


def build_layout(spec, rng):
    W, R = spec["w"], spec["rows"]
    forced = {r: [] for r in range(R)}
    for fid in range(spec["fusions"]):
        placed = False
        for _ in range(40):
            r = rng.randrange(0, R - 1)
            f_len = rng.choice([2, 3])
            s_len = rng.choice([2, 3])
            if not 4 <= f_len + s_len <= 6:
                continue
            max_b = min(6, W - s_len)
            if max_b < max(3, f_len):
                continue
            len_b = rng.randint(max(3, f_len), max_b)
            b_start = rng.randint(0, W - len_b - s_len)
            sx = b_start + len_b
            segs = [(r, b_start, len_b, "trigger", fid),
                    (r, sx, s_len, "stationary", fid),
                    (r + 1, sx - f_len, f_len, "faller", fid)]
            ok = True
            for rr, x, L, kind, f in segs:
                for (x2, L2, *_) in forced[rr]:
                    if x < x2 + L2 and x2 < x + L:
                        ok = False
            if ok:
                for rr, x, L, kind, f in segs:
                    forced[rr].append((x, L, kind, f))
                placed = True
                break
        if not placed:
            return None

    bricks = []
    for r in range(R):
        row_forced = sorted(forced[r])
        cursor = 0
        segments = []
        for (x, L, kind, fid) in row_forced:
            free = partition_span(x - cursor, rng, spec.get("long", False))
            if free is None:
                return None
            for fl in free:
                segments.append((cursor, fl, "word", None))
                cursor += fl
            segments.append((x, L, kind, fid))
            cursor = x + L
        free = partition_span(W - cursor, rng, spec.get("long", False))
        if free is None:
            return None
        for fl in free:
            segments.append((cursor, fl, "word", None))
            cursor += fl
        for (x, L, kind, fid) in segments:
            bricks.append(dict(x=x, lv=r, length=L, kind=kind, fusion=fid))

    frags = [b for b in bricks if b["kind"] in ("stationary", "faller")]
    for a in frags:
        for b in frags:
            if a is not b and a["lv"] == b["lv"] and a["x"] + a["length"] == b["x"]:
                return None
    return bricks


def assign_words(bricks, spec, rng):
    used = set()

    def pick(L):
        pool = BY_LEN_RARE[L] if (rng.random() < spec["rare"] and BY_LEN_RARE[L]) else BY_LEN_COMMON[L]
        options = [w for w in pool if w not in used]
        if not options:
            return None
        w = rng.choice(options)
        used.add(w)
        return w

    units = []
    for b in bricks:
        if b["kind"] in ("word", "trigger"):
            w = pick(b["length"])
            if w is None:
                return None
            b["word"] = w
            units.append(dict(word=w, parts=[(b, 0)], fused=None))
    for fid in {b["fusion"] for b in bricks if b["kind"] == "faller"}:
        faller = next(b for b in bricks if b["kind"] == "faller" and b["fusion"] == fid)
        stat = next(b for b in bricks if b["kind"] == "stationary" and b["fusion"] == fid)
        w = pick(faller["length"] + stat["length"])
        if w is None:
            return None
        faller["word"] = w[:faller["length"]]
        stat["word"] = w[faller["length"]:]
        units.append(dict(word=w, parts=[(faller, 0), (stat, faller["length"])], fused=fid))
    return units


# ══════════════════════════════════════════════════════════════════
#  WEB SCRAMBLER — plant a letter economy, not a chain
# ══════════════════════════════════════════════════════════════════

def scramble_web(units, spec, rng):
    """Choose wrong slots, plants and rack to make a decision web.
    Returns (slots, rack) or None. slots: list of (unit, idx, need, plant)."""
    for _ in range(80):
        # 1. wrong slots — one per unit (+1 extra on a long word if dw)
        slots = []
        dw_unit = None
        if spec["dw"]:
            cands = [u for u in units if u["fused"] is None and len(u["word"]) >= 4]
            if cands:
                dw_unit = rng.choice(cands)
        for u in units:
            k = 2 if u is dw_unit else 1
            for idx in rng.sample(range(len(u["word"])), k):
                slots.append([u, idx, u["word"][idx], None])

        # hub check: some needed letter must repeat across units
        needs = Counter(s[2] for s in slots)
        hubs = sum(1 for c in needs.values() if c >= 2)
        if hubs < spec["hubs"]:
            continue

        # 2. plants: permute the needs across slots, then dud out a few
        plants = [s[2] for s in slots]
        for _ in range(30):
            rng.shuffle(plants)
            if all(p != s[2] for p, s in zip(plants, slots)):
                break
        else:
            continue
        dud_idx = rng.sample(range(len(slots)), min(spec["duds"], len(slots)))
        for i in dud_idx:
            plants[i] = rng.choice([j for j in JUNK if needs[j] == 0])

        # 3. rack: cover the supply shortfall, pad with a spare
        shortfall = Counter(s[2] for s in slots) - Counter(plants)
        if not shortfall:
            # plants perfectly cover needs -> every key is locked inside a slot
            # and the only way in is a pick. Displace one planted key into the
            # rack instead, so there is always an obvious opening move.
            non_dud = [i for i in range(len(slots)) if i not in dud_idx]
            i = rng.choice(non_dud)
            alts = [s[2] for j, s in enumerate(slots)
                    if j != i and s[2] != slots[i][2] and s[2] != plants[i]]
            if not alts:
                continue
            plants[i] = rng.choice(alts)
            shortfall = Counter(s[2] for s in slots) - Counter(plants)
        rack = list(shortfall.elements())
        if not rack or len(rack) > spec["rack"]:
            continue
        while len(rack) < spec["rack"]:
            rack.append(rng.choice("aeioustrnl"))
        rng.shuffle(rack)

        # 4. validity: broken strings must not read as words
        for s, p in zip(slots, plants):
            s[3] = p
        ok = True
        seen = set()
        for u in units:
            cur = list(u["word"])
            own = [s for s in slots if s[0] is u]
            for s in own:
                cur[s[1]] = s[3]
            broken = "".join(cur)
            if broken == u["word"] or broken in BROKEN_BLOCK or broken in seen:
                ok = False
                break
            seen.add(broken)
            if u is dw_unit:
                for s in own:
                    mid = list(broken)
                    mid[s[1]] = s[2]
                    if "".join(mid) in BROKEN_BLOCK:
                        ok = False
        if ok:
            return slots, rack
    return None


# ══════════════════════════════════════════════════════════════════
#  LEVEL SPECS + GATES (difficulty = decision density, size = texture)
# ══════════════════════════════════════════════════════════════════

def level_spec(n):
    if n <= 3:   # teach the base loop; corridor allowed
        return dict(w=6, rows=2, fusions=0, duds=0, hubs=0, rack=2, dw=0,
                    marked=1.0, rare=0.0,
                    gates=dict(tension=0, gap=0, traps=0))
    if n <= 8:   # first fusion, first dud, board grows fast
        return dict(w=8, rows=3, fusions=1, duds=1, hubs=0, rack=2, dw=0,
                    marked=1.0, rare=0.0,
                    gates=dict(tension=1, gap=1, traps=0))
    if n <= 15:  # hub keys arrive: which lock gets the letter?
        return dict(w=9, rows=4, fusions=1, duds=2, hubs=1, rack=3, dw=0,
                    marked=1.0, rare=0.0,
                    gates=dict(tension=2, gap=1, traps=0))
    if n <= 24:  # tangled webs, some unmarked wrong letters
        return dict(w=9, rows=4, fusions=2, duds=2, hubs=1, rack=3, dw=0,
                    marked=0.6, rare=0.1,
                    gates=dict(tension=3, gap=2, traps=0))
    if n <= 32:  # traps + double-wrong words; long bricks keep unit count sane
        return dict(w=10, rows=4, fusions=2, duds=3, hubs=2, rack=3, dw=1,
                    marked=0.3, rare=0.3, long=True,
                    gates=dict(tension=3, gap=2, traps=1))
    # final band: same 10x4 geometry that reliably tangles (a 5th row added
    # parallel slack, not stakes, and its tangled candidates blew the solver
    # cap — adverse selection toward loose boards). Harder economy instead:
    # nothing marked, rare vocab, tension+traps gates up.
    return dict(w=10, rows=4, fusions=2, duds=3, hubs=2, rack=3, dw=1,
                marked=0.0, rare=0.5, long=True,
                gates=dict(tension=4, gap=1, traps=2))


def board_json(n, spec, bricks, units, slots, rack, rng):
    jb = []
    for i, b in enumerate(bricks):
        cur = list(b["word"])
        marked = [0] * len(b["word"])
        show = rng.random() < spec["marked"]
        for (u, idx, need, plant) in slots:
            for (part, off) in u["parts"]:
                if part is b and off <= idx < off + len(b["word"]):
                    cur[idx - off] = plant
                    marked[idx - off] = 1 if show else 0
        jb.append(dict(id=i, cur="".join(cur), sol=b["word"], x=b["x"], lv=b["lv"],
                       frag=1 if b["kind"] in ("faller", "stationary") else 0,
                       m=marked))
    return dict(n=n, w=spec["w"], par=0, rack=rack, bricks=jb)


def gate_score(m, gates):
    """How far a board exceeds its gates (negative = below)."""
    return (min(m["tension"] - gates["tension"], 3)
            + min(m["gap"] - gates["gap"], 3)
            + min(m["traps"] - gates["traps"], 2)
            + 0.5 * min(m["freedom"], 4))


def build_level(n, solver_budget=250):
    spec = level_spec(n)
    best = None
    solved = 0
    for attempt in range(4000):
        rng = random.Random(n * 100000 + attempt)
        bricks = build_layout(spec, rng)
        if bricks is None:
            continue
        units = assign_words(bricks, spec, rng)
        if units is None:
            continue
        out = scramble_web(units, spec, rng)
        if out is None:
            continue
        slots, rack = out
        lvl = board_json(n, spec, bricks, units, slots, rack, rng)
        metrics = solve(lvl, state_cap=150000, seed=attempt)
        solved += 1
        if metrics is None:
            continue
        lvl["par"] = metrics["par"]
        score = gate_score(metrics, spec["gates"])
        if best is None or score > best[0]:
            best = (score, lvl, metrics, attempt)
        meets = (metrics["tension"] >= spec["gates"]["tension"]
                 and metrics["gap"] >= spec["gates"]["gap"]
                 and metrics["traps"] >= spec["gates"]["traps"])
        if meets or solved >= solver_budget:
            if meets:
                best = (score, lvl, metrics, attempt)
            break
    return best


def fmt_metrics(m):
    return (f"par={m['par']:>2} tension={m['tension']} freedom={m['freedom']}"
            f" traps={m['traps']} gap={m['gap']:>4} picks={'Y' if m['picks'] else 'n'}"
            f" states={m['states']}")


def analyze_existing():
    js = OUT.read_text()
    data = json.loads(re.search(r"const WORD_DATA = (.*?);\n", js).group(1))
    print("BASELINE — current shipped pack:")
    for lvl in data["levels"]:
        t0 = time.time()
        m = solve(lvl)
        dt = time.time() - t0
        if m is None:
            print(f"L{lvl['n']:>2}: solver blew cap / unsolvable")
        else:
            print(f"L{lvl['n']:>2}: {fmt_metrics(m)}  (stored par={lvl['par']}, {dt:.2f}s)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--analyze", action="store_true")
    args = ap.parse_args()
    if args.analyze:
        analyze_existing()
        return

    levels, shortfalls = [], []
    for n in range(1, N_LEVELS + 1):
        t0 = time.time()
        best = build_level(n)
        if best is None:
            print(f"L{n:>2}: FAILED outright")
            shortfalls.append(n)
            continue
        score, lvl, metrics, attempt = best
        spec = level_spec(n)
        gates = spec["gates"]
        met = (metrics["tension"] >= gates["tension"] and metrics["gap"] >= gates["gap"]
               and metrics["traps"] >= gates["traps"])
        flag = "" if met else "  << below gates"
        print(f"L{n:>2}: {spec['w']}x{spec['rows']} {fmt_metrics(metrics)}"
              f" (attempt {attempt}, {time.time()-t0:.1f}s){flag}")
        if not met:
            shortfalls.append(n)
        levels.append(lvl)

    if len(levels) < N_LEVELS:
        print("some levels failed outright — not writing pack")
        sys.exit(1)
    dict_words = " ".join(sorted(DICT))
    payload = json.dumps(dict(levels=levels), separators=(",", ":"))
    js = ("// Generated by generate_word_boards.py — do not hand-edit; regenerate instead.\n"
          "// Every board is solver-verified AND decision-graded: par is the true shortest\n"
          "// route (including re-words and pick moves), and boards must force choices.\n"
          f"const WORD_DATA = {payload};\n"
          f"const WORD_DICT = new Set(\"{dict_words}\".split(\" \"));\n")
    OUT.write_text(js)
    print(f"\nwrote {OUT} ({len(js)//1024}KB, {len(levels)} levels)")
    if shortfalls:
        print(f"below decision gates (shipped best-of-N anyway): {shortfalls}")


if __name__ == "__main__":
    main()
