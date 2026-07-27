#!/usr/bin/env python3
"""Generate and audit Knot Swap WORDS and RUMMY tabletop levels.

Every accepted board is exhaustively partitioned under the runtime rules.  The
audit rejects rack-only shortcuts and scores the *easiest* complete partition,
so an alternate solution can never silently make a board easier than intended.

Boards live in consume_rack_seeds.json.  They are searched offline by --search,
which proposes random boards, measures each one exhaustively, and only keeps the
ones that clear the level's gate; the shipped run re-audits every stored seed, so
a seed file can never ship without passing the same checks that produced it.

Run: python3 generate_consume_rack_boards.py
     python3 generate_consume_rack_boards.py --audit
     python3 generate_consume_rack_boards.py --search 50
"""

import argparse
import json
import random
import time
from collections import Counter
from functools import lru_cache
from itertools import combinations, product
from pathlib import Path
from generate_consume_boards import (BLOCKED_WORDS, KNOWN_WORDS, RUNTIME_WORDS,
                                     SOLUTION_WORDS)

ROOT = Path(__file__).parent
OUT = ROOT / "js" / "games" / "consume-rack-boards.js"
REPORT = ROOT / "consume-rack-validation-report.json"
SEEDS = ROOT / "consume_rack_seeds.json"
SUITS = "RBGY"
ALPHA = "abcdefghijklmnopqrstuvwxyz"
N_LEVELS = 50
# Two physical copies of every suit/rank exist in a Rummikub deck.
RUMMY_COPIES = 2

# Three vocabularies, each answering a different question (see load_words in
# generate_consume_boards). PLAY_WORDS is the "would a player find this" tier and
# is what every solve and every difficulty measurement runs on. ACCEPTED_WORDS is
# the broad ESDB list shipped to the runtime, so a legitimate word is never
# refused even though the difficulty model does not depend on obscure ones.
COMMON_WORD_ADDITIONS = {
    "webbed",
}
PLAY_WORDS = set(KNOWN_WORDS) | COMMON_WORD_ADDITIONS
ACCEPTED_WORDS = set(RUNTIME_WORDS) | COMMON_WORD_ADDITIONS

# Precomputed letter vectors and anagram signatures.  The search measures many
# thousands of candidate boards, and rebuilding a Counter for the whole lexicon
# on every solve dominated the runtime.
def _vector(word):
    counts = Counter(word)
    return tuple(counts.get(ch, 0) for ch in ALPHA)


def _mask(word):
    return sum(1 << (ord(ch) - 97) for ch in set(word))


WORD_VECTORS = [(word, _vector(word), _mask(word)) for word in sorted(PLAY_WORDS)]
# Rack shortcuts are a total bypass of the puzzle rather than a matter of
# difficulty, so they are hunted across the full accepted lexicon.
WORD_SIGNATURES = {"".join(sorted(word)) for word in ACCEPTED_WORDS}
# Every ESDB word is a legal answer, but the words a board *starts* with are the
# ones a player reads, so those come from the familiar frequency-ranked list.
FAMILIAR_WORDS = sorted(set(SOLUTION_WORDS) & PLAY_WORDS)
FAMILIAR_VECTORS = [(word, _vector(word), _mask(word)) for word in FAMILIAR_WORDS]
STARTER_WORDS_BY_LEN = {n: [w for w in FAMILIAR_WORDS if len(w) == n] for n in range(3, 7)}
RARE_LETTERS = set("jqvxzkwy")


def load_seeds():
    data = json.loads(SEEDS.read_text())
    return {mode: [([list(group) for group in board["groups"]], list(board["rack"]))
                   for board in data[mode]]
            for mode in ("words", "numbers")}


def save_seeds(boards):
    SEEDS.write_text(json.dumps(
        {mode: [{"groups": groups, "rack": rack} for groups, rack in boards[mode]]
         for mode in ("words", "numbers")}, indent=1) + "\n")


def word_partitions(letters, cap=2000, lexicon=None):
    counts = Counter(letters)
    pool = tuple(counts.get(ch, 0) for ch in ALPHA)
    pool_mask = sum(1 << (ord(ch) - 97) for ch in counts)
    candidates = [(word, vector) for word, vector, mask in (lexicon or WORD_VECTORS)
                  if not mask & ~pool_mask
                  and all(a <= b for a, b in zip(vector, pool))]
    letters_used = tuple(sorted(counts))
    columns = [ord(ch) - 97 for ch in letters_used]
    vectors = [tuple(vector[j] for j in columns) for _, vector in candidates]
    by_letter = [[i for i, vector in enumerate(vectors) if vector[j]]
                 for j in range(len(letters_used))]
    start = tuple(counts[ch] for ch in letters_used)

    def pivot(rem):
        """Indices of the words that could cover the scarcest remaining letter.

        Every partition of `rem` must cover that letter with exactly one word, so
        branching on it enumerates each partition once and no more.
        """
        best = None
        for j, amount in enumerate(rem):
            if not amount:
                continue
            options = [i for i in by_letter[j]
                       if all(v <= r for v, r in zip(vectors[i], rem))]
            if not options:
                return ()
            if best is None or len(options) < len(best):
                best = options
        return best

    # Different word choices converge on the same remainder, so the raw search
    # tree re-explores identical subproblems.  Counting first, memoized on the
    # remainder, collapses that into a DAG walk and lets a wide-open board be
    # rejected in milliseconds instead of minutes.
    @lru_cache(maxsize=None)
    def count(rem):
        if not any(rem):
            return 1
        total = 0
        for i in pivot(rem):
            total += count(tuple(r - v for r, v in zip(rem, vectors[i])))
            if total > cap:
                return total
        return total

    if count(start) > cap:
        return [], True

    found = set()

    def solve(rem, chosen):
        if not any(rem):
            found.add(tuple(sorted(chosen)))
            return
        for i in pivot(rem):
            rest = tuple(r - v for r, v in zip(rem, vectors[i]))
            if count(rest):
                solve(rest, chosen + (candidates[i][0],))

    solve(start, ())
    return sorted(found), False


def valid_meld(values):
    parsed = [(tile[0], int(tile[1:])) for tile in values]
    ranks = sorted(rank for _, rank in parsed)
    run = len({suit for suit, _ in parsed}) == 1 and len(set(ranks)) == len(ranks) \
        and ranks == list(range(ranks[0], ranks[-1] + 1))
    aset = len(set(ranks)) == 1 and len({suit for suit, _ in parsed}) == len(parsed)
    return len(values) >= 3 and (run or aset)


def rummy_partitions(tiles, cap=2000):
    n = len(tiles)
    indexed = {(suit, rank): [] for suit in SUITS for rank in range(1, 14)}
    for i, tile in enumerate(tiles):
        indexed[(tile[0], int(tile[1:]))].append(i)
    meld_masks = set()
    # Sets: one tile per suit, same rank.
    for rank in range(1, 14):
        present = [(suit, indexed[(suit, rank)]) for suit in SUITS if indexed[(suit, rank)]]
        for size in range(3, len(present) + 1):
            for chosen in combinations(present, size):
                for picks in product(*(indices for _, indices in chosen)):
                    meld_masks.add(sum(1 << i for i in picks))
    # Runs: consecutive ranks in one suit, choosing one physical copy per rank.
    for suit in SUITS:
        for lo in range(1, 12):
            for hi in range(lo + 2, 14):
                banks = [indexed[(suit, rank)] for rank in range(lo, hi + 1)]
                if all(banks):
                    for picks in product(*banks):
                        meld_masks.add(sum(1 << i for i in picks))
    melds = [(mask, tuple(sorted(tiles[i] for i in range(n) if mask >> i & 1)))
             for mask in meld_masks]
    by_tile = [[] for _ in tiles]
    for meld in melds:
        for i in range(n):
            if meld[0] >> i & 1:
                by_tile[i].append(meld)
    found, seen = [], set()

    def visit(rem, chosen):
        if len(found) >= cap:
            return
        if not rem:
            key = tuple(sorted(group for _, group in chosen))
            if key not in seen:
                seen.add(key); found.append(key)
            return
        pivot = (rem & -rem).bit_length() - 1
        for meld in by_tile[pivot]:
            if meld[0] & rem == meld[0]:
                visit(rem ^ meld[0], chosen + [meld])

    visit((1 << n) - 1, [])
    return found, len(found) >= cap


def rack_shortcut(mode, groups, rack):
    if mode == "words":
        if "".join(sorted(rack)) in WORD_SIGNATURES:
            return True
        return any("".join(sorted(rack + [tile])) in WORD_SIGNATURES
                   for group in groups for tile in group)
    if valid_meld(rack):
        return True
    return any(valid_meld(rack + [tile]) for group in groups for tile in group)


def effort(groups, solution):
    """Minimum table tiles participating in a changed group.

    Merely appending rack tiles is intentionally not free: an old group counts
    as untouched only when an output group has exactly the same multiset.
    """
    old = [Counter(group) for group in groups]
    new = [Counter(group) for group in solution]

    @lru_cache(None)
    def best(i, used):
        if i == len(old):
            return (0, ())
        score, trail = best(i + 1, used)
        options = [(score, (0,) + trail)]
        for j, target in enumerate(new):
            if not used >> j & 1:
                kept = sum(old[i].values()) if old[i] == target else 0
                score, trail = best(i + 1, used | (1 << j))
                options.append((kept + score, (kept,) + trail))
        return max(options, key=lambda value: value[0])

    kept, per_group = best(0, 0)
    # Empty trail entries arise only when there are fewer output groups.
    retained = list(per_group) + [0] * (len(old) - len(per_group))
    broken = sum(value < sum(old[i].values()) for i, value in enumerate(retained))
    return {"movedTiles": sum(map(len, groups)) - kept,
            "brokenGroups": broken,
            "untouchedGroups": len(groups) - broken,
            "effort": (broken * 10) + (sum(map(len, groups)) - kept)}


def rummy_effort(groups, solution, rack_size):
    """Lower bound on the physical drags required by a RUMMY solution.

    A table tile stays put when its original group can map to one final group
    that still contains it. Adding rack tiles to that group is free for the
    table tile; splitting it out into another group is a real table move.
    """
    old = [Counter(group) for group in groups]
    new = [Counter(group) for group in solution]

    @lru_cache(None)
    def best(i, used):
        if i == len(old):
            return (0, ())
        score, trail = best(i + 1, used)
        options = [(score, (0,) + trail)]
        for j, target in enumerate(new):
            if not used >> j & 1:
                kept_here = sum((old[i] & target).values())
                score, trail = best(i + 1, used | (1 << j))
                options.append((kept_here + score, (kept_here,) + trail))
        return max(options, key=lambda value: value[0])

    kept, per_group = best(0, 0)
    table_tiles = sum(map(len, groups))
    moved = table_tiles - kept
    touched = sum(value < len(old[i]) for i, value in enumerate(per_group))
    return {"tableTilesMoved": moved,
            "tableGroupsTouched": touched,
            "rackTilesPlaced": rack_size,
            "minimumDrags": moved + rack_size}


# Quality floor, applied identically to every shipped board rather than ramped
# per level.  The broad ESDB acceptance list means a big pool admits hundreds of
# partitions, and among hundreds there is essentially always a lazy one that
# tacks the rack onto untouched groups -- so a per-level ramp of ever-harsher
# floors is simply not satisfiable at the top end.  Instead every board must
# clear one real bar (no solution lets a player skate), and the difficulty curve
# comes from ordering the accepted boards by measured difficulty.
WORD_FLOOR = dict(min_solutions=2, max_solutions=250, broken=2, moved=6)
RUMMY_FLOOR = dict(moved=2, touched=2)

# A board with more partitions than the floor allows is unusable, so the search
# can abandon its enumeration as soon as it passes that many.
WORD_SOLUTION_CAP = WORD_FLOOR["max_solutions"] + 1


def rummy_difficulty(solution_count, minimum):
    """Order by forced table disruption first, then by solution scarcity."""
    if not minimum:
        return -1
    return (minimum["tableGroupsTouched"] * 10000
            + minimum["tableTilesMoved"] * 100
            - solution_count)


def word_difficulty(solution_count, minimum):
    """Order by forced disruption first, then moved tiles and solution scarcity."""
    if not minimum:
        return -1
    return (minimum["brokenGroups"] * 10000
            + minimum["movedTiles"] * 100
            - solution_count)


def measure_board(mode, groups, rack, cap=None):
    """Exhaustively solve a board and score every partition it admits.

    Nothing here depends on which level number the board would occupy, so the
    search measures a candidate once and then grades it against as many level
    gates as it likes.
    """
    pool = [tile for group in groups for tile in group] + list(rack)
    if mode == "words":
        solutions, capped = word_partitions("".join(pool),
                                            cap=WORD_SOLUTION_CAP if cap is None else cap)
    else:
        solutions, capped = rummy_partitions(pool, **({} if cap is None else {"cap": cap}))
    # Groups are player-created, so every valid full partition must be graded;
    # a solution using a different number of groups is still a real shortcut.
    if mode == "numbers":
        scored = [rummy_effort(groups, solution, len(rack)) for solution in solutions]
        scored.sort(key=lambda score: (score["tableTilesMoved"], score["tableGroupsTouched"]))
        structural = ["invalid starting meld"] if any(not valid_meld(group) for group in groups) else []
    else:
        scored = [effort(groups, solution) for solution in solutions]
        scored.sort(key=lambda score: (score["effort"], score["movedTiles"]))
        structural = ["invalid starting word"] if any("".join(group) not in ACCEPTED_WORDS
                                                      for group in groups) else []
    if not solutions: structural.append("no valid solution")
    if capped: structural.append("too many valid partitions")
    if rack_shortcut(mode, groups, list(rack)): structural.append("rack shortcut")
    if len(groups) < 3: structural.append("fewer than three table groups")
    minimum = scored[0] if scored else None
    difficulty = (word_difficulty if mode == "words" else rummy_difficulty)
    return {"mode": mode, "groups": groups, "rack": rack, "scored": scored,
            "solutions": len(solutions), "solutionsCapped": capped,
            "minimumRearrangementEffort": minimum,
            "difficultyScore": difficulty(len(solutions), minimum),
            "structuralErrors": structural}


def grade_board(number, measured):
    """Apply the shared quality floor to an already-measured board."""
    mode, scored = measured["mode"], measured["scored"]
    groups, minimum = measured["groups"], measured["minimumRearrangementEffort"]
    errors = list(measured["structuralErrors"])
    if mode == "numbers":
        required_moved, required_touched = RUMMY_FLOOR["moved"], RUMMY_FLOOR["touched"]
        low_effort = sum(score["tableTilesMoved"] < required_moved
                         or score["tableGroupsTouched"] < required_touched
                         for score in scored)
        if low_effort:
            errors.append(f"{low_effort} solution(s) miss the real table-move floor")
    else:
        required_broken, required_moved = WORD_FLOOR["broken"], WORD_FLOOR["moved"]
        max_untouched = max((score["untouchedGroups"] for score in scored), default=0)
        low_effort = sum(score["brokenGroups"] < required_broken
                         or score["movedTiles"] < required_moved for score in scored)
        if not (WORD_FLOOR["min_solutions"] <= measured["solutions"] <= WORD_FLOOR["max_solutions"]):
            errors.append(f"solution count outside "
                          f"{WORD_FLOOR['min_solutions']}-{WORD_FLOOR['max_solutions']}")
        if max_untouched > len(groups) - required_broken:
            errors.append("a solution leaves most groups untouched")
        if low_effort:
            errors.append(f"{low_effort} low-effort partition(s)")
    return {"mode": mode, "level": number, "solutions": measured["solutions"],
            "solutionsCapped": measured["solutionsCapped"],
            "minimumRearrangementEffort": minimum,
            "difficultyScore": measured["difficultyScore"],
            "valid": not errors, "errors": errors}


def audit_level(mode, number, groups, rack):
    return grade_board(number, measure_board(mode, groups, rack))


def make_payload_and_report():
    payload = {"words": {"levels": []}, "numbers": {"levels": []}}
    payload["wordDictionary"] = sorted(ACCEPTED_WORDS)
    # Real words the content filter removes, so the runtime can say "not
    # counted here" rather than the misleading "not a word".
    payload["blockedWords"] = sorted(BLOCKED_WORDS)
    report = []
    seeds = load_seeds()
    for mode in ("words", "numbers"):
        for number, (groups, rack) in enumerate(seeds[mode], 1):
            groups = [list(group) for group in groups]
            rack = list(rack)
            result = audit_level(mode, number, groups, rack)
            report.append(result)
            level = {"n": number, "groups": groups, "rack": rack}
            if mode == "words":
                level.update({
                    "solutionCount": result["solutions"],
                    "difficulty": result["difficultyScore"],
                    "minMovedTiles": result["minimumRearrangementEffort"]["movedTiles"],
                    "minBrokenGroups": result["minimumRearrangementEffort"]["brokenGroups"],
                })
            payload[mode]["levels"].append(level)
    # The seed file is stored easiest-first; a level that grades harder than the
    # one after it means the file was hand-edited or the lexicon moved underneath
    # it, and either way the pack should not ship until it is regenerated.
    for mode in ("words", "numbers"):
        rows = [row for row in report if row["mode"] == mode]
        for previous, current in zip(rows, rows[1:]):
            if current["difficultyScore"] < previous["difficultyScore"]:
                current["errors"].append("difficulty decreases from previous level")
                current["valid"] = False
    return payload, report


# Both proposers work backward from a solved final table.  A forward guess -- some
# starting groups plus a random rack -- almost never leaves the rack placeable, so
# the overwhelming majority of forward candidates die on "no valid solution".
# Building the answer first and then hiding part of it in the rack guarantees at
# least one clean line exists, and the audit still decides whether the board is
# any good.


def draw_rack(pool, size, ratio, rng):
    """Pull rack tiles out of a solved table, favouring sharp letters as levels rise.

    A rack of easy tiles just gets tacked onto whatever is already on the table;
    a rack holding the pool's only J or Z is what forces a real teardown.
    """
    order = sorted(range(len(pool)),
                   key=lambda i: rng.random() - (ratio if pool[i] in RARE_LETTERS else 0))
    picked = set(order[:size])
    return ([pool[i] for i in sorted(picked)],
            [tile for i, tile in enumerate(pool) if i not in picked])


def propose_word_board(ratio, rng):
    """Build a WORDS board; `ratio` runs 0..1 and sets how big and sharp it gets."""
    # The answer has to outsize the opening: after the rack is drawn out of it the
    # remainder still has to split into three or more readable words.
    answer_count = 4 if ratio < 0.3 else rng.choice((4, 5)) if ratio < 0.7 else rng.choice((5, 6))
    longest = 4 if ratio < 0.2 else 5 if ratio < 0.5 else 6
    answer = []
    while len(answer) < answer_count:
        word = rng.choice(STARTER_WORDS_BY_LEN[rng.randint(3, longest)])
        if word not in answer:
            answer.append(word)
    rack_size = 3 if ratio < 0.3 else rng.choice((3, 4)) if ratio < 0.7 else rng.choice((4, 5))
    rack, rest = draw_rack([ch for word in answer for ch in word], rack_size, ratio, rng)
    openings, _ = word_partitions("".join(rest), cap=60, lexicon=FAMILIAR_VECTORS)
    # An opening word that also appears in the answer survives untouched, and the
    # solver will always find that lazy line first, so the board grades as trivial.
    openings = [part for part in openings
                if len(part) >= 3 and not set(part) & set(answer)]
    if not openings:
        return None
    return [list(word) for word in rng.choice(openings)], rack


def propose_rummy_board(ratio, rng):
    """Build a legal solved table, honouring the deck's two copies of each tile."""
    answer_count = 4 if ratio < 0.4 else 5 if ratio < 0.8 else 6
    longest_run = 4 if ratio < 0.35 else 6
    used = Counter()
    answer = []
    for _ in range(answer_count):
        for _ in range(80):
            if rng.random() < 0.65:
                suit = rng.choice(SUITS)
                length = rng.randint(3, longest_run)
                low = rng.randint(1, 14 - length)
                meld = [f"{suit}{rank}" for rank in range(low, low + length)]
            else:
                rank = rng.randint(1, 13)
                meld = [f"{suit}{rank}" for suit in rng.sample(SUITS, rng.randint(3, 4))]
            if all(used[tile] < RUMMY_COPIES for tile in meld):
                used.update(meld)
                answer.append(meld)
                break
        else:
            return None
    rack_size = 3 if ratio < 0.3 else 4 if ratio < 0.8 else 5
    rack, rest = draw_rack([tile for meld in answer for tile in meld], rack_size, ratio, rng)
    openings, _ = rummy_partitions(rest, cap=60)
    # As in WORDS: a meld shared with the answer is a group the player never has
    # to touch, which collapses the board's measured effort to nearly nothing.
    answer_melds = {tuple(sorted(meld)) for meld in answer}
    openings = [part for part in openings
                if len(part) >= 3 and not {tuple(sorted(meld)) for meld in part} & answer_melds]
    if not openings:
        return None
    return [list(meld) for meld in rng.choice(openings)], rack


def board_key(measured):
    """Identity of a board, so the search never ships the same table twice."""
    return (tuple(sorted(tuple(sorted(group)) for group in measured["groups"])),
            tuple(sorted(measured["rack"])))


def search_levels(mode, target, rng, seeds, attempts=400000, oversample=6):
    """Collect boards that clear the quality floor, then keep a spread of `target`.

    Every candidate is measured exhaustively and must pass the same floor, so the
    level number a board lands on changes how hard it feels, never whether it is
    solvable.

    Taking simply the first `target` boards that pass produces a flat pack: boards
    at the floor are common and boards well above it are rare, so nearly every
    slot fills with a floor-grazing board and the last few levels lurch. Searching
    `oversample` times as many and then sampling evenly across the sorted range
    spends more time up front to buy an actual curve.
    """
    propose = propose_word_board if mode == "words" else propose_rummy_board
    accepted, seen = [], set()
    for groups, rack in seeds:
        measured = measure_board(mode, groups, rack)
        if grade_board(0, measured)["valid"] and board_key(measured) not in seen:
            seen.add(board_key(measured))
            accepted.append(measured)
    print(f"{mode}: {len(accepted)} of {len(seeds)} existing boards still clear the floor",
          flush=True)

    wanted = target * oversample
    started = time.time()
    for attempt in range(1, attempts + 1):
        if len(accepted) >= wanted:
            break
        candidate = propose(rng.random(), rng)
        if candidate is None:
            continue
        measured = measure_board(mode, candidate[0], candidate[1])
        if not grade_board(0, measured)["valid"] or board_key(measured) in seen:
            continue
        seen.add(board_key(measured))
        accepted.append(measured)
        if len(accepted) % 25 == 0 or len(accepted) == wanted:
            print(f"{mode:7} pool {len(accepted):4}/{wanted}: attempt {attempt} "
                  f"({time.time() - started:.0f}s)", flush=True)
    if len(accepted) < target:
        raise SystemExit(f"{mode}: only found {len(accepted)}/{target} boards in {attempts} attempts")

    accepted.sort(key=lambda measured: measured["difficultyScore"])
    # Even spacing across the sorted pool, always keeping the easiest and hardest.
    step = (len(accepted) - 1) / (target - 1)
    chosen = [accepted[round(i * step)] for i in range(target)]
    for number, measured in enumerate(chosen, 1):
        metric = measured["minimumRearrangementEffort"]
        detail = (f"moved {metric['tableTilesMoved']} touched {metric['tableGroupsTouched']}"
                  if mode == "numbers"
                  else f"moved {metric['movedTiles']} broken {metric['brokenGroups']}")
        print(f"{mode:7} L{number:02}: {measured['solutions']:4} solutions; {detail}; "
              f"difficulty {measured['difficultyScore']:6}", flush=True)
    return [(measured["groups"], measured["rack"]) for measured in chosen]


def search(target, seed):
    """Search a fresh, fully vetted seed file without touching the shipped pack."""
    existing = load_seeds()
    boards = {}
    for mode in ("words", "numbers"):
        boards[mode] = search_levels(mode, target, random.Random(seed), existing[mode])
    save_seeds(boards)
    print(f"wrote {SEEDS} ({target} boards per mode); "
          f"rerun without --search to audit and emit the pack")


def refresh_dictionary():
    """Refresh shared word data without rerunning the board audit."""
    src = OUT.read_text()
    marker = "const CONSUME_RACK_DATA = "
    payload = json.loads(src[src.index(marker) + len(marker):].rstrip(";\n"))
    payload["wordDictionary"] = sorted(ACCEPTED_WORDS)
    # Real words the content filter removes, so the runtime can say "not
    # counted here" rather than the misleading "not a word".
    payload["blockedWords"] = sorted(BLOCKED_WORDS)
    OUT.write_text("// Generated by generate_consume_rack_boards.py\nconst CONSUME_RACK_DATA = "
                   + json.dumps(payload, separators=(",", ":")) + ";\n")
    print(f"refreshed {OUT} ({len(payload['wordDictionary'])} legal words)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", action="store_true", help="validate without rewriting boards")
    parser.add_argument("--refresh-dictionary", action="store_true",
                        help="refresh only the shared runtime word lexicon")
    parser.add_argument("--search", nargs="?", type=int, const=N_LEVELS,
                        help="search a new vetted seed file with this many levels per mode")
    parser.add_argument("--seed", type=int, default=20260727)
    args = parser.parse_args()
    if args.refresh_dictionary:
        refresh_dictionary()
        return
    if args.search:
        search(args.search, args.seed)
        return
    payload, report = make_payload_and_report()
    for row in report:
        metric = row["minimumRearrangementEffort"] or {}
        if row["mode"] == "numbers":
            detail = (f"table moves {metric.get('tableTilesMoved', '-')}; "
                      f"groups touched {metric.get('tableGroupsTouched', '-')}; "
                      f"min drags {metric.get('minimumDrags', '-')}")
        else:
            detail = (f"min effort {metric.get('effort', '-')}; "
                      f"moved {metric.get('movedTiles', '-')}; "
                      f"broken {metric.get('brokenGroups', '-')}")
        print(f"{row['mode']:7} L{row['level']:02}: {row['solutions']:4} solutions; "
              f"{detail}  {'PASS' if row['valid'] else 'FAIL'}")
        for error in row["errors"]:
            print(f"  - {error}")
    if not all(row["valid"] for row in report):
        raise SystemExit("validation failed; static board file was not generated")
    if not args.audit:
        OUT.write_text("// Generated by generate_consume_rack_boards.py\nconst CONSUME_RACK_DATA = "
                       + json.dumps(payload, separators=(",", ":")) + ";\n")
        REPORT.write_text(json.dumps({"levels": report}, indent=2) + "\n")
        print(f"wrote {OUT}\nwrote {REPORT}")


if __name__ == "__main__":
    main()
