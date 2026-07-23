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
N_LEVELS = 30
ALPH = "abcdefghijklmnopqrstuvwxyz"
COMMON_RANK_LIMIT = 4000

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
        "alice", "julia", "diana", "anne", "dan", "don", "ted", "roy", "leo",
        # Dictionary-valid words that players overwhelmingly read as names or
        # places. Frequency alone cannot distinguish these usages.
        "kirk", "troy", "york",
        # Keep player-facing vocabulary free of terms that can be used as slurs.
        "gay"}

THREE_OK = {
    "ace", "act", "add", "age", "ago", "aid", "aim", "air", "ale", "all",
    "and", "ant", "any", "ape", "app", "arc", "are", "arm", "art", "ash",
    "ask", "ate", "awe", "bad", "bag", "bar", "bat", "bay", "bed", "bee",
    "bet", "big", "bin", "bit", "bow", "box", "boy", "bud", "bug", "bus",
    "but", "buy", "bye", "cab", "can", "cap", "car", "cat", "cop", "cow",
    "cry", "cup", "cut", "day", "den", "dew", "did", "die", "dig", "dim",
    "dip", "dog", "dry", "dub", "dug", "ear", "eat", "egg", "elm", "end",
    "eye", "fan", "far", "fat", "fee", "few", "fig", "fin", "fit", "fix",
    "fly", "fog", "for", "fox", "fun", "gap", "gas", "gem", "get", "gig",
    "got", "gum", "gun", "gut", "gym", "had", "ham", "has", "hat", "hem",
    "hen", "her", "hex", "hid", "him", "hip", "his", "hit", "hog", "hop",
    "hot", "how", "hub", "hug", "ice", "ink", "jam", "jar", "jaw", "jet",
    "job", "jog", "jot", "joy", "keg", "key", "kid", "kit", "lab", "lad",
    "lap", "law", "lay", "leg", "let", "lid", "lie", "lip", "log", "lot",
    "low", "mad", "man", "map", "mat", "max", "may", "met", "mix", "mom",
    "mow", "mud", "mug", "nap", "net", "new", "nod", "not", "now", "nub",
    "nut", "odd", "off", "oil", "old", "one", "orb", "our", "out", "own",
    "pad", "pan", "pat", "pay", "peg", "pen", "pet", "pew", "pie", "pig",
    "pin", "pop", "pot", "pub", "put", "rag", "ran", "rat", "raw", "red",
    "rib", "rid", "rip", "rob", "row", "rub", "rum", "run", "sad", "sat",
    "saw", "say", "sea", "see", "set", "she", "sip", "sit", "six", "sky",
    "sob", "son", "sow", "sub", "sun", "tag", "tap", "tar", "tax", "tea",
    "ten", "the", "tie", "tin", "tip", "toe", "top", "tow", "toy", "try",
    "tub", "two", "use", "van", "wag", "war", "was", "wax", "way", "web",
    "wet", "who", "why", "win", "wit", "won", "yes", "yet", "you", "zap",
    "zip",
}

# Common, unambiguous words missing from the compact frequency source. Keep this
# list deliberately small: additions here become playable in the GRID mode.
EXTRA_PLAY_WORDS = {
    # Familiar inflections can rank surprisingly low in a web-frequency list;
    # keep this hand-reviewed escape hatch small and explicit.
    "bake", "beg", "bone", "brick", "cake", "cave", "chin", "chop", "clay",
    "cone", "cord", "cove", "crop", "cub", "dine", "ding", "dove", "fake",
    "fame", "feet", "fond", "forms", "grin", "hike", "honey", "hook", "jaw",
    "kick", "lame", "lick", "lines", "mood", "ore", "paid", "pine", "ping",
    "pond", "pray", "prints", "prop", "sand", "scar", "sew", "shin", "shoes",
    "sick", "sing", "spin", "sway", "tame", "terms", "thick", "thin", "tick",
    "tone", "tow", "tray", "trick", "vine", "vow", "wake", "wand", "wick",
    "wing", "yard", "zing",
}

# Keep the common vocabulary appropriate for the arcade as well as familiar.
CONTENT_DENYLIST = {
    "anal", "anus", "asshole", "bastard", "bitch", "clit", "cunt", "dick",
    "dildo", "fag", "faggot", "fuck", "fucker", "fucking", "homo", "nigger",
    "nigga", "penis", "porn", "prick", "pussy", "rape", "rapist", "retard",
    "retarded", "sex", "sexual", "shit", "slut", "spic", "tits", "twat",
    "whore",
}
CONTENT_DENY_STEMS = (
    "anal", "cunt", "dick", "dildo", "fag", "fuck", "homo", "nigg",
    "porn", "prick", "rape", "retard", "sex", "slut", "spic", "twat",
    "whore",
)

# Proper nouns are disallowed in standard word-game play.  Homographs with an
# ordinary lowercase meaning (for example, "van", "grant", or "jersey") stay
# legal; entries here have no familiar lowercase use worth testing a player on.
PROPER_ONLY = {
    "africa", "african", "alabama", "alaska", "america", "american",
    "anderson", "antonio", "arab", "arizona", "arkansas", "atlanta",
    "atlantic", "austin", "austria", "barbara", "boston", "britain",
    "british", "canada", "canadian", "carolina", "chinese", "christ",
    "colorado", "columbia", "czech", "dakota", "delaware", "denmark",
    "dutch", "edward", "egypt", "english", "european", "florida",
    "francisco", "french", "georgia", "german", "greek", "guinea",
    "idaho", "illinois", "india", "indian", "indiana", "iowa", "iran",
    "iraq", "irish", "israel", "italian", "japan", "japanese", "jewish",
    "jones", "jordan", "kentucky", "kelly", "lewis", "lincoln", "louis",
    "maine", "marshall", "maryland", "miami", "michigan", "missouri",
    "montana", "nevada", "norway", "ohio", "oklahoma", "orlando",
    "orleans", "oxford", "paris", "patrick", "phoenix", "rome", "russia",
    "russian", "santa", "spanish", "sterling", "stephen", "swiss", "texas",
    "turkey", "utah", "vermont", "victoria", "virginia", "wilson",
    "january", "february", "april", "june", "july", "august", "october",
    "november", "december", "monday", "tuesday", "thursday", "friday",
    "saturday", "sunday",
}


def load_words():
    """Build the single common-word vocabulary used by solver and runtime.

    The source list is frequency-ranked.  Four-plus-letter words must be in its
    top COMMON_RANK_LIMIT entries and in the system dictionary; three-letter
    words use the hand-reviewed THREE_OK list because short frequency lists are
    especially noisy.  STOP handles names, abbreviations, and web artifacts.
    """
    freq = [w.strip().lower() for w in (ROOT / "word_list_10k.txt").read_text().splitlines()]
    freq = [w for w in freq if w.isalpha() and w.isascii()]
    sysdict = set()
    sd = Path("/usr/share/dict/words")
    if sd.exists():
        sysdict = {w.strip().lower() for w in sd.read_text().splitlines()
                   if w.strip().islower() and w.strip().isalpha()}

    ranks = {}
    common_words = []
    for rank, w in enumerate(freq):
        if not (3 <= len(w) <= 8):
            continue
        if rank >= COMMON_RANK_LIMIT:
            continue
        if (w in STOP or w in PROPER_ONLY or w in CONTENT_DENYLIST
                or w.startswith(CONTENT_DENY_STEMS) or not (set(w) & VOWELS)):
            continue
        if sysdict and w not in sysdict:
            continue
        if len(w) == 3 and w not in THREE_OK:
            continue
        if w in ranks:
            continue
        ranks[w] = rank
        common_words.append(w)
    for w in sorted(THREE_OK):
        if (w in STOP or w in PROPER_ONLY or w in CONTENT_DENYLIST
                or w.startswith(CONTENT_DENY_STEMS) or w in ranks):
            continue
        ranks[w] = len(ranks) + 100000
        common_words.append(w)
    for w in sorted(EXTRA_PLAY_WORDS):
        if w in STOP or w in ranks:
            continue
        ranks[w] = len(ranks) + 100001
        common_words.append(w)
    solutions = [w for w in common_words if len(w) <= 6]
    return common_words, solutions, ranks


PLAY_WORDS, SOLUTION_WORDS, RANKS = load_words()
# Deliberately the same set: accepting a broader runtime dictionary makes the
# solver's solution/trap counts untrue and rewards random obscure-word guesses.
RUNTIME_WORDS = frozenset(PLAY_WORDS)
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
        dict(size=9, cols=3, phase="3x3", patterns=[[3, 3, 3], [4, 5], [3, 6]], min_clear_words=2, solutions=(2, 6), traps=(3, 30), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5]], solutions=(5, 18), traps=(2, 48), long_trap=4),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 3, 4, 6]], solutions=(4, 16), traps=(3, 52), long_trap=4),
        dict(size=16, cols=4, phase="4x4", patterns=[[3, 4, 4, 5], [5, 5, 6]], solutions=(4, 14), traps=(4, 56), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[3, 4, 4, 5], [4, 4, 4, 4]], solutions=(3, 12), traps=(5, 60), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[3, 3, 4, 6], [3, 4, 4, 5]], solutions=(3, 11), traps=(6, 64), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[3, 3, 4, 6], [5, 5, 6]], solutions=(2, 10), traps=(7, 68), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [4, 6, 6]], solutions=(2, 9), traps=(8, 72), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[3, 4, 4, 5], [4, 6, 6]], solutions=(2, 8), traps=(9, 76), long_trap=6),
        dict(size=16, cols=4, phase="4x4", patterns=[[3, 3, 4, 6], [5, 5, 6]], solutions=(2, 7), traps=(10, 80), long_trap=6),
        dict(size=16, cols=4, phase="4x4", patterns=[[5, 5, 6], [4, 6, 6]], solutions=(2, 6), traps=(11, 84), long_trap=6),
        dict(size=20, cols=5, phase="4x5", patterns=[[4, 4, 4, 4, 4], [3, 4, 4, 4, 5]], solutions=(4, 18), traps=(5, 100), long_trap=5),
        dict(size=20, cols=5, phase="4x5", patterns=[[3, 4, 4, 4, 5], [4, 4, 6, 6]], solutions=(3, 15), traps=(7, 115), long_trap=5),
        dict(size=20, cols=5, phase="4x5", patterns=[[4, 4, 6, 6], [3, 5, 6, 6]], solutions=(2, 12), traps=(9, 130), long_trap=6),
        dict(size=20, cols=5, phase="4x5", patterns=[[3, 5, 6, 6], [4, 4, 4, 4, 4]], solutions=(2, 9), traps=(11, 145), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6]], max_candidates=220, solutions=(5, 45), traps=(4, 180), long_trap=5),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [3, 4, 6, 6, 6]], max_candidates=210, solutions=(4, 40), traps=(5, 190), long_trap=5),
        dict(size=25, cols=5, phase="5x5", patterns=[[4, 4, 5, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=3, max_candidates=200, solutions=(3, 36), traps=(6, 200), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[3, 4, 6, 6, 6], [5, 5, 5, 5, 5]], sharp_source=True, rare_score=3, max_candidates=190, solutions=(3, 32), traps=(7, 210), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[4, 4, 5, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=3, max_candidates=180, solutions=(3, 28), traps=(8, 220), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[3, 4, 6, 6, 6], [4, 4, 5, 6, 6]], sharp_source=True, rare_score=4, max_candidates=175, solutions=(2, 25), traps=(9, 230), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[3, 3, 4, 5, 5, 5], [5, 5, 5, 5, 5]], sharp_source=True, rare_score=4, max_candidates=170, solutions=(2, 22), traps=(10, 240), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[3, 4, 6, 6, 6], [4, 4, 5, 6, 6]], sharp_source=True, rare_score=4, max_candidates=165, solutions=(2, 20), traps=(11, 250), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[3, 4, 6, 6, 6], [4, 4, 5, 6, 6]], sharp_source=True, rare_score=5, max_candidates=160, solutions=(2, 18), traps=(12, 260), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[3, 3, 4, 5, 5, 5], [4, 4, 5, 6, 6]], sharp_source=True, rare_score=5, max_candidates=155, solutions=(2, 16), traps=(13, 270), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[3, 4, 6, 6, 6], [5, 5, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=150, solutions=(2, 14), traps=(14, 280), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[3, 3, 4, 5, 5, 5], [4, 4, 5, 6, 6]], sharp_source=True, rare_score=6, max_candidates=145, solutions=(2, 12), traps=(15, 290), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[3, 4, 6, 6, 6], [4, 4, 5, 6, 6]], sharp_source=True, rare_score=6, max_candidates=140, solutions=(2, 10), traps=(16, 300), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[3, 3, 4, 5, 5, 5], [3, 4, 6, 6, 6]], sharp_source=True, rare_score=6, max_candidates=135, solutions=(2, 8), traps=(18, 320), long_trap=6),
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


def difficulty_score(level):
    return (-level["solutionCount"] * 10
            + level["trapCount"]
            + max(level["sourcePattern"]) * 2)


def order_by_phase_difficulty(levels):
    """Keep phase boundaries fixed while making each phase ramp easy to hard."""
    ordered = []
    for phase in dict.fromkeys(level["phase"] for level in levels):
        ordered.extend(sorted(
            (level for level in levels if level["phase"] == phase),
            key=lambda level: (difficulty_score(level), level["solutionCount"], level["pool"]),
        ))
    for number, level in enumerate(ordered, 1):
        level["n"] = number
        level["difficulty"] = difficulty_score(level)
    return ordered


def emit(levels):
    payload = {
        "version": 1,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "levels": levels,
    }
    words = sorted(RUNTIME_WORDS, key=lambda w: (len(w), RANKS.get(w, 999999), w))
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


def refresh_dictionary():
    """Refresh the runtime lexicon without rerolling the solver-checked boards."""
    src = OUT.read_text()
    marker = "const CONSUME_DATA = "
    start = src.index(marker) + len(marker)
    end = src.index(";\nconst CONSUME_DICT", start)
    data = json.loads(src[start:end])
    words = sorted(RUNTIME_WORDS, key=lambda w: (len(w), RANKS.get(w, 999999), w))
    OUT.write_text(
        "// Generated by generate_consume_boards.py - do not hand-edit.\n"
        "// Consume boards are solver-checked and every shipped level has at least two full solutions.\n"
        f"const CONSUME_DATA = {json.dumps(data, separators=(',', ':'))};\n"
        f"const CONSUME_DICT = new Set({json.dumps(words, separators=(',', ':'))});\n"
    )
    print(f"refreshed {OUT.relative_to(ROOT)} ({len(words)} legal words)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--analyze", action="store_true", help="analyze the current emitted pack")
    ap.add_argument("--refresh-dictionary", action="store_true", help="refresh only the emitted runtime lexicon")
    ap.add_argument("--seed", type=int, default=20260711)
    ap.add_argument("--levels", type=int, default=N_LEVELS)
    args = ap.parse_args()
    if args.analyze:
        analyze_current()
        return
    if args.refresh_dictionary:
        refresh_dictionary()
        return
    rng = random.Random(args.seed)
    levels = order_by_phase_difficulty([make_level(n, rng) for n in range(1, args.levels + 1)])
    emit(levels)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
