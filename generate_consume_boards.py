#!/usr/bin/env python3
"""Generate solver-checked boards for Consume.

Consume boards are built backward from real word partitions, then rejected unless
the full letter pool has a small number of complete dictionary partitions. Harder
levels must still have multiple clears: the generator never accepts a board with
only one full solution.
"""

import argparse
import json
import random
import sys
import time
from collections import Counter
from functools import lru_cache
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "js" / "games" / "consume-boards.js"
N_LEVELS = 16
ALPH = "abcdefghijklmnopqrstuvwxyz"

VOWELS = set("aeiou")
RARE = set("jqxzv")
STOP = {"info", "index", "unix", "faq", "faqs", "gif", "gifs", "url", "utc",
        "isbn", "asin", "euro", "euros", "config", "admin", "org", "com",
        "net", "gov", "intl", "corp", "inc", "llc", "ltd", "www", "http",
        "san", "los", "las", "del", "les", "der", "des", "und", "von", "por",
        "que", "dos", "sur", "sri", "est", "etc", "usa", "uni", "sic", "ana",
        "jan", "feb", "apr", "aug", "sep", "oct", "nov", "dec", "eds", "ibid",
        "tue", "thu", "non", "vol", "ers", "sec", "min", "ans", "abs",
        "mon", "marc", "yahoo", "pic", "hart", "lee",
        "jane", "billy", "john", "david", "mike", "paul", "james", "george",
        "maria", "anna", "chris", "scott", "ryan", "eric", "adam", "alan",
        "henry", "joe", "tim", "dave", "steve", "brian", "jason", "greg",
        "jeff", "larry", "gary", "keith", "carl", "luis", "jose", "juan",
        "ian", "kim", "amy", "ann", "sue", "kevin", "sarah", "laura",
        "linda", "mary", "susan", "karen", "lisa", "nancy", "helen", "emma",
        "alice", "julia", "diana", "anne", "dan", "don", "ted", "roy", "leo"}

THREE_OK = {
    "ace", "act", "add", "age", "ago", "aid", "aim", "air", "ale", "all",
    "and", "ant", "any", "ape", "app", "arc", "are", "arm", "art", "ash",
    "ask", "ate", "awe", "bad", "bag", "bar", "bat", "bay", "bed", "bee",
    "bet", "big", "bin", "bit", "box", "boy", "bud", "bug", "bus", "but",
    "buy", "bye", "cab", "can", "cap", "car", "cat", "cop", "cow", "cry",
    "cup", "cut", "day", "did", "die", "dig", "dog", "dry", "ear", "eat",
    "egg", "end", "eye", "fan", "far", "fat", "fee", "few", "fig", "fin",
    "fit", "fix", "fly", "fog", "for", "fox", "fun", "gap", "gas", "get",
    "gum", "gun", "gut", "had", "ham", "has", "hat", "hen", "her", "hid",
    "him", "hip", "his", "hit", "hog", "hop", "hot", "how", "hug", "ice",
    "ink", "jam", "jar", "jet", "job", "joy", "key", "kid", "kit", "lab",
    "lad", "lap", "law", "lay", "leg", "let", "lid", "lie", "lip", "log",
    "lot", "low", "mad", "man", "map", "mat", "may", "met", "mix", "mom",
    "mud", "mug", "net", "new", "nod", "not", "now", "nut", "odd", "off",
    "oil", "old", "one", "our", "out", "own", "pad", "pan", "pat", "pay",
    "pen", "pet", "pie", "pig", "pin", "pop", "pot", "put", "rag", "ran",
    "rat", "raw", "red", "rid", "rip", "row", "run", "sad", "sat", "saw",
    "say", "sea", "see", "set", "she", "sip", "sit", "six", "sky", "son",
    "sun", "tag", "tap", "tar", "tea", "ten", "the", "tie", "tin", "tip",
    "toe", "top", "toy", "try", "two", "use", "van", "wag", "war", "was", "way",
    "web", "wet", "who", "why", "win", "wit", "won", "yes", "yet", "you",
}


def load_words():
    freq = [w.strip().lower() for w in (ROOT / "word_list_10k.txt").read_text().splitlines()]
    freq = [w for w in freq if w.isalpha() and w.isascii()]
    sysdict = set()
    sd = Path("/usr/share/dict/words")
    if sd.exists():
        sysdict = {w.strip().lower() for w in sd.read_text().splitlines()
                   if w.strip().islower() and w.strip().isalpha()}

    ranks = {}
    play_words = []
    solutions = []
    for rank, w in enumerate(freq):
        if not (3 <= len(w) <= 8):
            continue
        if w in STOP or not (set(w) & VOWELS):
            continue
        if sysdict and w not in sysdict:
            continue
        if w in ranks:
            continue
        ranks[w] = rank
        play_words.append(w)
        if rank < 5500 and len(w) <= 6 and (len(w) != 3 or w in THREE_OK):
            solutions.append(w)
    for w in sorted(THREE_OK):
        if w in STOP or (sysdict and w not in sysdict) or w in ranks:
            continue
        ranks[w] = len(ranks) + 100000
        play_words.append(w)
    return play_words, solutions, ranks


PLAY_WORDS, SOLUTION_WORDS, RANKS = load_words()
WORD_COUNTS = {w: tuple(Counter(w).get(ch, 0) for ch in ALPH) for w in PLAY_WORDS}
SOLUTION_BY_LEN = {n: [w for w in SOLUTION_WORDS if len(w) == n] for n in range(3, 7)}
SHARP_SOLUTION_BY_LEN = {
    n: [w for w in words if any(ch in RARE for ch in w)]
    for n, words in SOLUTION_BY_LEN.items()
}


def add_counts(words):
    c = Counter()
    for w in words:
        c.update(w)
    return tuple(c.get(ch, 0) for ch in ALPH)


def fits(a, b):
    return all(x <= y for x, y in zip(a, b))


def sub_counts(a, b):
    return tuple(x - y for x, y in zip(a, b))


def count_size(counts):
    return sum(counts)


def pool_string(counts):
    return "".join(ch * counts[i] for i, ch in enumerate(ALPH))


def shuffled_pool(counts, rng):
    letters = list(pool_string(counts))
    rng.shuffle(letters)
    return "".join(letters)


def level_spec(n):
    specs = [
        dict(size=9, cols=3, phase="3x3", patterns=[[3, 3, 3]], min_clear_words=3, solutions=(2, 9), traps=(0, 18), long_trap=0),
        dict(size=9, cols=3, phase="3x3", patterns=[[3, 3, 3], [4, 5]], min_clear_words=2, solutions=(2, 8), traps=(1, 22), long_trap=4),
        dict(size=9, cols=3, phase="3x3", patterns=[[4, 5], [3, 6]], min_clear_words=2, solutions=(2, 7), traps=(2, 26), long_trap=4),
        dict(size=9, cols=3, phase="3x3", patterns=[[3, 3, 3], [4, 5], [3, 6]], min_clear_words=2, solutions=(2, 6), traps=(3, 30), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5]], solutions=(2, 9), traps=(4, 42), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[3, 3, 4, 6], [3, 4, 4, 5]], solutions=(2, 8), traps=(5, 48), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[5, 5, 6], [4, 6, 6]], solutions=(2, 7), traps=(6, 54), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[3, 3, 4, 6], [4, 4, 4, 4], [5, 5, 6]], solutions=(2, 7), traps=(7, 60), long_trap=6),
        dict(size=16, cols=4, phase="4x4", patterns=[[3, 4, 4, 5], [4, 6, 6]], solutions=(2, 6), traps=(8, 66), long_trap=6),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 3, 4, 6], [4, 6, 6]], solutions=(2, 6), traps=(9, 72), long_trap=6),
        dict(size=16, cols=4, phase="4x4", patterns=[[5, 5, 6], [4, 6, 6]], solutions=(2, 5), traps=(10, 78), long_trap=6),
        dict(size=16, cols=4, phase="4x4", patterns=[[3, 4, 4, 5], [3, 3, 4, 6]], solutions=(2, 5), traps=(11, 84), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6]], sharp_source=True, rare_score=4, max_candidates=160, solutions=(2, 28), traps=(3, 160), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[3, 4, 6, 6, 6], [4, 4, 5, 6, 6]], sharp_source=True, rare_score=4, max_candidates=150, solutions=(2, 26), traps=(4, 180), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[3, 3, 4, 5, 5, 5], [5, 5, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=140, solutions=(2, 24), traps=(5, 200), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[3, 4, 6, 6, 6], [4, 4, 5, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=130, solutions=(2, 22), traps=(6, 220), long_trap=6),
    ]
    return specs[min(n - 1, len(specs) - 1)]


def random_solution_words(spec, rng):
    for _ in range(500):
        pattern = list(rng.choice(spec["patterns"]))
        words = []
        for length in pattern:
            bank = SHARP_SOLUTION_BY_LEN[length] if spec.get("sharp_source") else SOLUTION_BY_LEN[length]
            words.append(rng.choice(bank))
        if len(set(words)) != len(words):
            continue
        if sum(len(w) for w in words) == spec["size"]:
            if spec.get("rare_score", 0) and sum(1 for w in words for ch in w if ch in RARE) < spec["rare_score"]:
                continue
            return words
    return None


def analyze_pool(counts, min_solutions=1, max_solutions=60, max_candidates=360):
    candidates = [w for w in PLAY_WORDS if fits(WORD_COUNTS[w], counts)]
    candidates.sort(key=lambda w: (len(w), w))
    if len(candidates) > max_candidates:
        return {
            "candidates": candidates,
            "solutions": [],
            "traps": [],
            "too_open": True,
            "too_common": True,
        }

    @lru_cache(maxsize=None)
    def can_partition(rem):
        rem_size = count_size(rem)
        if rem_size == 0:
            return True
        if rem_size < 3:
            return False
        for w in candidates:
            wc = WORD_COUNTS[w]
            if fits(wc, rem) and can_partition(sub_counts(rem, wc)):
                return True
        return False

    solutions = []

    def enumerate_partitions(rem, start, chosen):
        if len(solutions) > max_solutions:
            return
        rem_size = count_size(rem)
        if rem_size == 0:
            solutions.append(tuple(chosen))
            return
        if rem_size < 3:
            return
        for i in range(start, len(candidates)):
            w = candidates[i]
            wc = WORD_COUNTS[w]
            if fits(wc, rem):
                chosen.append(w)
                enumerate_partitions(sub_counts(rem, wc), i, chosen)
                chosen.pop()
                if len(solutions) > max_solutions:
                    return

    enumerate_partitions(counts, 0, [])
    if len(solutions) > max_solutions:
        return {
            "candidates": candidates,
            "solutions": solutions,
            "traps": [],
            "too_open": True,
        }
    if len(solutions) < min_solutions:
        return {
            "candidates": candidates,
            "solutions": solutions,
            "traps": [],
            "too_open": False,
        }

    traps = []
    for w in candidates:
        wc = WORD_COUNTS[w]
        if not fits(wc, counts):
            continue
        rem = sub_counts(counts, wc)
        if count_size(rem) and not can_partition(rem):
            traps.append(w)

    return {
        "candidates": candidates,
        "solutions": solutions,
        "traps": traps,
        "too_open": len(solutions) > max_solutions,
    }


def board_score(analysis):
    traps = analysis["traps"]
    long = [w for w in traps if len(w) >= 5]
    avg_trap = (sum(len(w) for w in traps) / len(traps)) if traps else 0
    return len(long) * 4 + avg_trap + min(len(traps), 20) * 0.25


def accept(n, counts, source, analysis):
    spec = level_spec(n)
    sol_count = len(analysis["solutions"])
    trap_count = len(analysis["traps"])
    min_words = min((len(s) for s in analysis["solutions"]), default=0)
    min_sol, max_sol = spec["solutions"]
    min_trap, max_trap = spec["traps"]
    has_long = spec["long_trap"] == 0 or any(len(w) >= spec["long_trap"] for w in analysis["traps"])
    if count_size(counts) != spec["size"]:
        return False
    if analysis["too_open"]:
        return False
    if not (min_sol <= sol_count <= max_sol):
        return False
    if min_words < spec.get("min_clear_words", 1):
        return False
    if not (min_trap <= trap_count <= max_trap):
        return False
    if not has_long:
        return False
    if not all(w in analysis["candidates"] for w in source):
        return False
    return True


def make_level(n, rng, attempts=12000):
    spec = level_spec(n)
    best = None
    started = time.time()
    for attempt in range(1, attempts + 1):
        source = random_solution_words(spec, rng)
        if not source:
            continue
        counts = add_counts(source)
        analysis = analyze_pool(
            counts,
            min_solutions=spec["solutions"][0],
            max_solutions=spec["solutions"][1],
            max_candidates=spec.get("max_candidates", 360),
        )
        if accept(n, counts, source, analysis):
            best = (attempt, source, counts, analysis)
            break
        if analysis["solutions"] and len(analysis["solutions"]) >= 2:
            score = board_score(analysis)
            if best is None or score > board_score(best[3]):
                best = (attempt, source, counts, analysis)
    if best is None or not accept(n, best[2], best[1], best[3]):
        raise RuntimeError(f"level {n}: failed to find accepted board after {attempts} attempts")

    attempt, source, counts, analysis = best
    sols = analysis["solutions"]
    min_words = min(len(s) for s in sols)
    pattern = [len(w) for w in source]
    trap_sample = sorted(analysis["traps"], key=lambda w: (-len(w), RANKS.get(w, 999999), w))[:16]
    letters = shuffled_pool(counts, rng)
    print(
        f"L{n:02d} {spec['phase']} pool={len(letters):2d} sol={len(sols):2d} "
        f"min_words={min_words} traps={len(analysis['traps']):2d} "
        f"attempts={attempt:4d} pattern={'+'.join(map(str, pattern))} source={'+'.join(source)} "
        f"pool={letters.upper()} sample_traps={','.join(trap_sample[:7]).upper()}",
        flush=True,
    )
    return {
        "n": n,
        "pool": letters,
        "size": spec["size"],
        "cols": spec["cols"],
        "phase": spec["phase"],
        "sourcePattern": pattern,
        "minWords": min_words,
        "solutionCount": len(sols),
        "trapCount": len(analysis["traps"]),
        "trapSample": trap_sample[:10],
        "solutions": [list(s) for s in sols[:8]],
    }


def emit(levels):
    payload = {
        "version": 1,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "levels": levels,
    }
    words = sorted(PLAY_WORDS, key=lambda w: (len(w), RANKS.get(w, 999999), w))
    text = (
        "// Generated by generate_consume_boards.py - do not hand-edit.\n"
        "// Consume boards are solver-checked and every shipped level has at least two full solutions.\n"
        f"const CONSUME_DATA = {json.dumps(payload, separators=(',', ':'))};\n"
        f"const CONSUME_DICT = new Set({json.dumps(words, separators=(',', ':'))});\n"
    )
    OUT.write_text(text)
    print(f"wrote {OUT.relative_to(ROOT)} ({len(levels)} levels, {len(words)} legal words)")


def analyze_current():
    src = OUT.read_text()
    marker = "const CONSUME_DATA = "
    start = src.index(marker) + len(marker)
    end = src.index(";\nconst CONSUME_DICT", start)
    data = json.loads(src[start:end])
    for lvl in data["levels"]:
        counts = Counter(lvl["pool"])
        spec = level_spec(lvl["n"])
        analysis = analyze_pool(
            tuple(counts.get(ch, 0) for ch in ALPH),
            min_solutions=spec["solutions"][0],
            max_solutions=max(spec["solutions"][1], 60),
            max_candidates=1000,
        )
        print(
            f"L{lvl['n']:02d} {lvl.get('phase', '?')} pool={len(lvl['pool']):2d} "
            f"sol={len(analysis['solutions']):2d} traps={len(analysis['traps']):2d} "
            f"min_words={min(len(s) for s in analysis['solutions'])}"
        )


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--analyze", action="store_true", help="analyze the current emitted pack")
    ap.add_argument("--seed", type=int, default=20260711)
    ap.add_argument("--levels", type=int, default=N_LEVELS)
    args = ap.parse_args()
    if args.analyze:
        analyze_current()
        return
    rng = random.Random(args.seed)
    levels = [make_level(n, rng) for n in range(1, args.levels + 1)]
    emit(levels)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
