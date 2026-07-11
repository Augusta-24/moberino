#!/usr/bin/env python3
"""Generate and audit Knot Swap WORDS and RUMMY tabletop levels.

Every accepted board is exhaustively partitioned under the runtime rules.  The
audit rejects rack-only shortcuts and scores the *easiest* complete partition,
so an alternate solution can never silently make a board easier than intended.

Run: python3 generate_consume_rack_boards.py
     python3 generate_consume_rack_boards.py --audit
"""

import argparse
import json
from collections import Counter
from functools import lru_cache
from itertools import combinations, product
from pathlib import Path
from generate_consume_boards import STOP as BASE_STOP, THREE_OK, EXTRA_PLAY_WORDS, RUNTIME_WORDS

ROOT = Path(__file__).parent
OUT = ROOT / "js" / "games" / "consume-rack-boards.js"
REPORT = ROOT / "consume-rack-validation-report.json"
SUITS = "RBGY"

# Kept deliberately ordinary and screened more tightly than the runtime's broad
# play dictionary.  The runtime still accepts every legal alternate partition.
STOP = BASE_STOP | {"gay", "queer", "slut", "whore", "rape", "raped", "rapes",
        "nazi", "slave", "idiot", "moron", "retard", "retarded",
        "iraq", "linux", "russia", "kong", "july", "york"}


def load_words():
    words = []
    seen = set()
    for rank, raw in enumerate((ROOT / "word_list_10k.txt").read_text().splitlines()):
        word = raw.strip().lower()
        if (word in seen or word in STOP or not word.isascii() or not word.isalpha()
                or not 3 <= len(word) <= 6 or rank >= 3500
                or (len(word) == 3 and word not in THREE_OK)):
            continue
        seen.add(word)
        words.append((word, rank))
    play = {word for word, _ in words} | EXTRA_PLAY_WORDS
    # Source words used on the visible table. Alternates are audited against the
    # complete runtime dictionary above.
    source = [word for word, rank in words if rank < 1600 and len(word) <= 5]
    return play, source


PLAY_WORDS, SOURCE_WORDS = load_words()

# Solver-checked seeds.  These are data, not exact answers: the audit enumerates
# every valid partition and retains boards only when the easiest one is hard.
WORD_LEVELS = [
    (["gift", "shoes", "lines"], "xat"),
    (["set", "been", "bed"], "xso"),
    (["main", "sell", "fine"], "xrt"),
    (["list", "out", "death"], "xsr"),
    (["none", "teen", "gift"], "xil"),
    (["item", "play", "score"], "xin"),
    (["west", "oil", "each", "full"], "xtr"),
    (["focus", "grade", "with", "state"], "xrl"),
    (["sea", "write", "under", "sent"], "xlo"),
    (["born", "bay", "wide", "seen"], "xsn"),
    (["get", "doing", "does", "field"], "xse"),
    (["hit", "south", "say", "week"], "qrl"),
    (["list", "tour", "car", "share", "wide"], "qel"),
    (["part", "match", "rock", "late", "and"], "xos"),
    (["sign", "paid", "turn", "forms", "heart"], "xts"),
    (["song", "feet", "guest", "game", "trial"], "qoa"),
]

NUMBER_LEVELS = [
    ([['G9','G10','G11'], ['R2','G2','Y2'], ['R5','B5','Y5']], ['B2','G5','G8']),
    ([['G8','G9','G10'], ['R5','B5','G5','Y5'], ['R6','B6','G6']], ['Y6','G4','G7']),
    ([['B8','B9','B10'], ['R12','B12','Y12'], ['R2','B2','Y2']], ['B7','B11','G2']),
    ([['Y8','Y9','Y10'], ['B5','G5','Y5'], ['G9','G10','G11']], ['G8','Y7','G7']),
    ([['B7','B8','B9'], ['R2','B2','Y2'], ['G7','G8','G9']], ['G10','B6','G11']),
    ([['R2','G2','Y2'], ['R3','R4','R5'], ['Y7','Y8','Y9']], ['R7','R6','B2']),
    ([['Y2','Y3','Y4'], ['R11','G11','Y11'], ['Y5','Y6','Y7'], ['R8','B8','G8']], ['Y9','B2','Y8','R2']),
    ([['G2','G3','G4'], ['R9','R10','R11'], ['R7','B7','Y7'], ['B10','G10','Y10']], ['R12','G7','G6','G5']),
    ([['R1','B1','G1','Y1'], ['B4','B5','B6'], ['Y7','Y8','Y9'], ['Y4','Y5','Y6']], ['Y13','Y12','B3','Y11']),
    ([['B2','B3','B4'], ['Y1','Y2','Y3'], ['Y4','Y5','Y6'], ['G8','G9','G10']], ['G7','B1','B5','G6']),
    ([['B10','G10','Y10'], ['B7','B8','B9'], ['G4','G5','G6'], ['R11','B11','G11']], ['G2','G3','R10','Y11']),
    ([['Y1','Y2','Y3'], ['Y5','Y6','Y7'], ['R1','B1','G1'], ['B2','B3','B4']], ['Y4','G12','B12','Y12']),
    ([['R4','B4','G4','Y4'], ['R8','R9','R10'], ['R7','B7','G7','Y7'], ['Y10','Y11','Y12'], ['G9','G10','G11']], ['Y9','R6','R5','R11']),
    ([['R6','B6','G6'], ['G7','G8','G9'], ['B1','B2','B3'], ['Y3','Y4','Y5'], ['Y6','Y7','Y8']], ['R8','B8','B4','Y2']),
    ([['G6','G7','G8'], ['B10','B11','B12'], ['B1','G1','Y1'], ['R5','R6','R7'], ['R3','B3','G3']], ['G5','B13','R8','R9']),
    ([['B3','B4','B5'], ['Y7','Y8','Y9'], ['Y1','Y2','Y3'], ['G4','G5','G6'], ['G9','G10','G11']], ['B2','Y10','G3','G2']),
]


def word_partitions(letters, cap=2000):
    counts = Counter(letters)
    candidates = []
    for word in PLAY_WORDS:
        wc = Counter(word)
        if wc <= counts:
            candidates.append((word, wc))
    candidates.sort(key=lambda item: item[0])
    letters_used = tuple(sorted(counts))
    vectors = [tuple(wc[ch] for ch in letters_used) for _, wc in candidates]
    by_letter = [[i for i, vector in enumerate(vectors) if vector[j]]
                 for j in range(len(letters_used))]

    @lru_cache(None)
    def solve(rem, floor):
        if not any(rem):
            return ((),)
        viable = []
        for j, amount in enumerate(rem):
            if amount:
                options = [i for i in by_letter[j] if i >= floor
                           and all(v <= r for v, r in zip(vectors[i], rem))]
                viable.append((len(options), options))
        if not viable:
            return ()
        options = min(viable, key=lambda item: item[0])[1]
        result = []
        for i in options:
            rest = tuple(r - v for r, v in zip(rem, vectors[i]))
            for tail in solve(rest, i):
                result.append((candidates[i][0],) + tail)
                if len(result) >= cap:
                    return tuple(result)
        return tuple(result)

    found = list(solve(tuple(counts[ch] for ch in letters_used), 0))
    return found, len(found) >= cap


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
        rack_counter = Counter(rack)
        if any(Counter(word) == rack_counter for word in PLAY_WORDS):
            return True
        return any(any(Counter(word) == rack_counter + Counter(tile)
                       for word in PLAY_WORDS) for group in groups for tile in group)
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


def audit_level(mode, number, groups, rack):
    pool = [tile for group in groups for tile in group] + list(rack)
    solutions, capped = (word_partitions("".join(pool)) if mode == "words"
                         else rummy_partitions(pool))
    # The tabletop has a fixed number of editable groups and no new-group
    # control, so only partitions that fit those exact group slots are playable.
    solutions = [solution for solution in solutions if len(solution) == len(groups)]
    scored = [(effort(groups, solution), solution) for solution in solutions]
    scored.sort(key=lambda item: (item[0]["effort"], item[0]["movedTiles"]))
    minimum = scored[0][0] if scored else None
    required_broken = 2 if len(groups) <= 4 else 3
    max_untouched = max((score["untouchedGroups"] for score, _ in scored), default=0)
    low_effort = sum(score["brokenGroups"] < required_broken or score["movedTiles"] < 3
                     for score, _ in scored)
    errors = []
    if mode == "words" and any("".join(group) not in PLAY_WORDS for group in groups):
        errors.append("invalid starting word")
    if mode == "numbers" and any(not valid_meld(group) for group in groups):
        errors.append("invalid starting meld")
    if not solutions: errors.append("no valid solution")
    if capped: errors.append("too many valid partitions")
    if rack_shortcut(mode, groups, list(rack)): errors.append("rack shortcut")
    if len(groups) < 3: errors.append("fewer than three table groups")
    if minimum and minimum["brokenGroups"] < required_broken:
        errors.append(f"easy solution breaks fewer than {required_broken} groups")
    if minimum and minimum["movedTiles"] < 3: errors.append("easy solution moves fewer than three table tiles")
    if max_untouched > len(groups) - required_broken:
        errors.append("a solution leaves most groups untouched")
    if low_effort: errors.append(f"{low_effort} low-effort partition(s)")
    return {"mode": mode, "level": number, "solutions": len(solutions),
            "solutionsCapped": capped, "minimumRearrangementEffort": minimum,
            "valid": not errors, "errors": errors}


def make_payload_and_report():
    payload = {"words": {"levels": []}, "numbers": {"levels": []}}
    payload["wordDictionary"] = sorted(RUNTIME_WORDS)
    report = []
    for mode, rows in (("words", WORD_LEVELS), ("numbers", NUMBER_LEVELS)):
        for number, (groups, rack) in enumerate(rows, 1):
            groups = [list(group) for group in groups]
            rack = list(rack)
            result = audit_level(mode, number, groups, rack)
            report.append(result)
            payload[mode]["levels"].append({"n": number, "groups": groups, "rack": rack})
    return payload, report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--audit", action="store_true", help="validate without rewriting boards")
    args = parser.parse_args()
    payload, report = make_payload_and_report()
    for row in report:
        metric = row["minimumRearrangementEffort"] or {}
        print(f"{row['mode']:7} L{row['level']:02}: {row['solutions']:4} solutions; "
              f"min effort {metric.get('effort', '-')}; moved {metric.get('movedTiles', '-')}; "
              f"broken {metric.get('brokenGroups', '-')}  {'PASS' if row['valid'] else 'FAIL'}")
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
