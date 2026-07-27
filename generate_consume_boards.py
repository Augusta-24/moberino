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
ESDB_WORDS = ROOT / "data" / "word-list-esdb-50.txt"
SUBTLEX_WORDS = ROOT / "data" / "subtlex-us-zipf.tsv"
# Zipf thresholds on the SUBTLEX-US scale (roughly 1-7; 3.0 is about one use per
# million words). GENERATION is what a board may be built from and show on
# screen; KNOWN is what every difficulty measurement solves over. Measured
# against a hand-picked probe of thirty everyday words, 3.0 admits all but
# "assert" while still excluding usury, obeah and kumquat.
GENERATION_ZIPF = 4.0
KNOWN_ZIPF = 3.0
N_LEVELS = 50
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

# Keep the arcade's vocabulary appropriate as well as familiar.
#
# Matching is on whole words, never on prefixes.  Prefix matching looks tighter
# but is wrong in both directions at once: "anal" as a prefix silently deletes
# analysis, analyze, analog and analyst, while "chink", "coon" and "squaw" sail
# through because nothing in a short stem list resembles them.  Base forms are
# listed once here and expanded to their inflections below, so the check stays
# exact and the list stays readable.
CONTENT_DENY_BASE = {
    # profanity and vulgar anatomy
    "anal", "anus", "arse", "arsehole", "ass", "asshole", "ballsack", "bastard",
    "bimbo", "bollocks", "boner", "boob", "bugger", "bullshit", "clit", "cock",
    "crap", "cum", "cunt", "damn", "dick", "dildo", "dong", "douche", "dyke",
    "ejaculate", "erection", "fart", "feck", "fellatio", "floozy", "fondle",
    "gash", "handjob", "hooter", "horny", "hussy", "incest", "jerkoff", "jism",
    "jizz", "knob", "masturbate", "milf", "minge", "molest", "nonce", "nude",
    "nutsack", "orgasm", "orgy", "penis", "perv", "pervert", "pimp", "piss",
    "porn", "prick", "prostitute", "pussy", "quim", "rape", "rapist", "rimjob",
    "screw", "scrotum", "semen", "sex", "sexual", "shag", "shit", "shite",
    "skank", "slag", "slut", "sodomy", "sperm", "spunk", "strapon", "stripper",
    "testicle", "tit", "titty", "turd", "twat", "vagina", "vulva", "wank",
    "wanker", "whore",
    # slurs -- ethnic, racial, religious, sexual, and disability
    "chink", "coon", "dago", "darkie", "fag", "faggot", "gimp",
    "gook", "gringo", "gyp", "gypsy", "haji", "half-breed", "heeb", "homo",
    "honky", "injun", "jap", "kike", "kraut", "lesbo", "mick", "mong", "nigga",
    "nigger", "paki", "pickaninny", "raghead", "redneck", "retard", "retarded",
    "sambo", "spade", "spastic", "spic", "squaw", "tard", "towelhead",
    "tranny", "wetback", "wog", "wop", "yid", "zipperhead",
    # drugs, self-harm, and other themes a family arcade should not surface
    "cocaine", "heroin", "meth", "opioid", "overdose", "suicide",
    # Terms the ESDB list carries that read badly on a family arcade board.
    "erotic", "hooker", "queer", "slaver", "swastika",
}

# Innocent words the inflection expansion collides with: spice/spices/spicy fall
# out of "spic", knobby out of "knob", cocky out of "cock".  Cheaper and clearer
# to name the handful of collisions than to hand-trim the base forms.
CONTENT_ALLOW = {
    "cocked", "cocker", "cockers", "cocky", "cocks",
    "knobby", "spiced", "spices", "spicy", "tarts",
}

# A handful of cores that cannot appear inside an innocent English word.  These
# catch compounds the inflection expansion would miss (motherfucker, bullshitting)
# and are deliberately few -- "rape" is excluded here because it hides inside
# grape, drapery and scraper, and "spic" because of spice.
CONTENT_DENY_CORES = ("fuck", "cunt", "nigg", "faggot", "dildo", "jizz",
                      "wank", "bukkake", "whore", "asshole", "kike")


def _expand_content_denylist():
    """Expand each base form to the inflections a word list actually contains."""
    forms = set()
    for base in CONTENT_DENY_BASE:
        forms.add(base)
        forms.update(base + suffix for suffix in
                     ("s", "es", "ed", "d", "ing", "er", "ers", "y", "ie", "ies"))
        if base.endswith("e"):
            forms.update((base[:-1] + "ing", base[:-1] + "ed", base[:-1] + "y"))
        if base.endswith("y"):
            forms.add(base[:-1] + "ies")
        # Single final consonant doubles before a vowel suffix: shag -> shagging.
        if len(base) > 2 and base[-1] not in VOWELS and base[-2] in VOWELS:
            forms.update(base + base[-1] + suffix for suffix in ("ing", "ed", "er", "ers", "y"))
    return frozenset(forms) - CONTENT_ALLOW


CONTENT_DENYLIST = _expand_content_denylist()


def content_denied(word):
    return word in CONTENT_DENYLIST or any(core in word for core in CONTENT_DENY_CORES)

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
    """Build the three vocabularies the pipeline needs, each answering one question.

    1. GENERATION ("can this definitely be solved?") -- the compact
       frequency-ranked head of the list. Every intended answer and every word a
       board puts on screen comes from here, so a clear is always reachable with
       words anyone knows.
    2. KNOWN ("would a player find this?") -- the whole frequency list. This is
       what every difficulty measurement runs on: solution counts, traps, and
       whether a board has a lazy way out. Grading on the full acceptance list
       instead means a board gets condemned for an escape hatch that needs a word
       like "sferics", which no player is ever going to reach for.
    3. ACCEPTANCE ("is this a real word?") -- the broad American-English ESDB
       size-50 list, shipped to the runtime so a legitimate word is never
       rejected. Deliberately *not* used for difficulty.
    """
    if not SUBTLEX_WORDS.exists():
        raise FileNotFoundError(
            f"missing {SUBTLEX_WORDS.relative_to(ROOT)}; rebuild it with "
            f"tools/fetch_subtlex.py (see licenses/SUBTLEX-US-CITATION.txt)"
        )
    zipf, dominant_pos = {}, {}
    for line in SUBTLEX_WORDS.read_text().splitlines():
        if line.startswith("#"):
            continue
        word, value, part_of_speech = line.split("\t")
        zipf[word] = float(value)
        dominant_pos[word] = part_of_speech

    sysdict = set()
    sd = Path("/usr/share/dict/words")
    if sd.exists():
        sysdict = {w.strip().lower() for w in sd.read_text().splitlines()
                   if w.strip().islower() and w.strip().isalpha()}

    def blocked(w):
        return (w in STOP or w in PROPER_ONLY or content_denied(w)
                or not (set(w) & VOWELS))

    # Tier 2, KNOWN: everything a player could reasonably be expected to think
    # of. Three-letter words are admitted on frequency alone here -- the curated
    # THREE_OK whitelist below governs what a board may *use*, but a player who
    # plays a common short word outside it is still making a move the difficulty
    # model needs to have counted.
    known_words = {w for w, value in zipf.items()
                   if value >= KNOWN_ZIPF and 3 <= len(w) <= 8 and not blocked(w)}

    # Tier 1, GENERATION: the words boards are built from and put on screen.
    # Ranked by descending frequency so downstream tie-breaks still prefer the
    # most familiar option, and cross-checked against the system dictionary and
    # the curated short-word whitelist.
    # A subtitle corpus is full of first names, so frequency alone happily
    # nominates "jess", "morgan" and "randy" as common words. The part-of-speech
    # tag catches them: dropping Name-dominant entries removes ~400 names and
    # places from generation. It also costs mark, bill, jack, van and grant --
    # real words that happen to read as names more often -- which is the right
    # trade here, because they stay legal to play and still count toward
    # difficulty; they just never get printed onto a board.
    ranks = {}
    common_words = []
    for w, value in sorted(zipf.items(), key=lambda item: -item[1]):
        if value < GENERATION_ZIPF or not (3 <= len(w) <= 8) or blocked(w):
            continue
        if dominant_pos.get(w) == "Name":
            continue
        if sysdict and w not in sysdict:
            continue
        if len(w) == 3 and w not in THREE_OK:
            continue
        ranks[w] = len(ranks)
        common_words.append(w)
    for w in sorted(THREE_OK):
        if (w in STOP or w in PROPER_ONLY or content_denied(w) or w in ranks):
            continue
        ranks[w] = len(ranks) + 100000
        common_words.append(w)
    for w in sorted(EXTRA_PLAY_WORDS):
        if w in STOP or w in ranks:
            continue
        ranks[w] = len(ranks) + 100001
        common_words.append(w)

    if not ESDB_WORDS.exists():
        raise FileNotFoundError(
            f"missing {ESDB_WORDS.relative_to(ROOT)}; see licenses/ESDB-Copyright.txt"
        )
    acceptance_words = {
        w.strip() for w in ESDB_WORDS.read_text().splitlines()
        if 3 <= len(w.strip()) <= 8
        and w.strip().isascii()
        and w.strip().isalpha()
        and w.strip().islower()
    }
    acceptance_words.update(common_words)
    acceptance_words.difference_update(STOP | PROPER_ONLY)
    # Real words the content filter removes, kept aside so the runtime can tell a
    # player "that one does not count here" instead of the misleading "not a word".
    blocked_words = {w for w in acceptance_words if content_denied(w) and set(w) & VOWELS}
    acceptance_words = {
        w for w in acceptance_words
        if not content_denied(w) and set(w) & VOWELS
    }
    solutions = [w for w in common_words if len(w) <= 6]
    known_words.update(common_words)
    known_words &= acceptance_words
    return (common_words, solutions, ranks, frozenset(known_words),
            frozenset(acceptance_words), frozenset(blocked_words))


(GENERATION_WORDS, SOLUTION_WORDS, RANKS, KNOWN_WORDS,
 RUNTIME_WORDS, BLOCKED_WORDS) = load_words()
# PLAY_WORDS is what every difficulty measurement solves over: the words a player
# can be expected to think of. RUNTIME_WORDS stays wider so the game still accepts
# any legitimate word, and SOLUTION_WORDS stays narrower so generated answers and
# on-screen words are always familiar.
PLAY_WORDS = KNOWN_WORDS
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
    """Per-level gates, calibrated by sampling each phase against the KNOWN tier.

    Solution counts scale steeply with pool size: a 16-tile board typically has
    around ten full clears, a 25-tile board several thousand. The windows below
    therefore differ by phase by orders of magnitude, and each one targets the
    constrained tail of its own phase rather than a single global notion of
    "few solutions". order_by_phase_difficulty then sorts accepted boards inside
    their phase, so the shipped ramp reflects measured difficulty.
    """
    specs = [
        dict(size=9, cols=3, phase="3x3", patterns=[[3, 3, 3]], min_clear_words=3, max_candidates=900, solutions=(2, 20), traps=(0, 120), long_trap=0),
        dict(size=9, cols=3, phase="3x3", patterns=[[3, 3, 3], [4, 5], [3, 6]], min_clear_words=2, max_candidates=900, solutions=(2, 14), traps=(3, 120), long_trap=0),
        dict(size=9, cols=3, phase="3x3", patterns=[[3, 3, 3], [4, 5], [3, 6]], min_clear_words=2, max_candidates=900, solutions=(2, 9), traps=(6, 120), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 30), traps=(15, 320), long_trap=4),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 28), traps=(23, 320), long_trap=4),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 27), traps=(31, 320), long_trap=4),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 26), traps=(38, 320), long_trap=4),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 24), traps=(46, 320), long_trap=4),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 22), traps=(54, 320), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 21), traps=(62, 320), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 20), traps=(70, 320), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 18), traps=(78, 320), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 16), traps=(85, 320), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 15), traps=(93, 320), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 14), traps=(101, 320), long_trap=5),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 12), traps=(109, 320), long_trap=6),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 10), traps=(117, 320), long_trap=6),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 9), traps=(124, 320), long_trap=6),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 8), traps=(132, 320), long_trap=6),
        dict(size=16, cols=4, phase="4x4", patterns=[[4, 4, 4, 4], [3, 4, 4, 5], [3, 3, 4, 6], [5, 5, 6], [4, 6, 6]], sharp_source=True, rare_score=3, max_candidates=1000, solutions=(2, 6), traps=(140, 320), long_trap=6),
        dict(size=20, cols=5, phase="4x5", patterns=[[4, 4, 4, 4, 4], [3, 4, 4, 4, 5], [4, 4, 6, 6], [3, 5, 6, 6]], sharp_source=True, rare_score=4, max_candidates=1200, solutions=(2, 240), traps=(25, 400), long_trap=5),
        dict(size=20, cols=5, phase="4x5", patterns=[[4, 4, 4, 4, 4], [3, 4, 4, 4, 5], [4, 4, 6, 6], [3, 5, 6, 6]], sharp_source=True, rare_score=4, max_candidates=1200, solutions=(2, 208), traps=(49, 400), long_trap=5),
        dict(size=20, cols=5, phase="4x5", patterns=[[4, 4, 4, 4, 4], [3, 4, 4, 4, 5], [4, 4, 6, 6], [3, 5, 6, 6]], sharp_source=True, rare_score=4, max_candidates=1200, solutions=(2, 177), traps=(73, 400), long_trap=5),
        dict(size=20, cols=5, phase="4x5", patterns=[[4, 4, 4, 4, 4], [3, 4, 4, 4, 5], [4, 4, 6, 6], [3, 5, 6, 6]], sharp_source=True, rare_score=4, max_candidates=1200, solutions=(2, 145), traps=(98, 400), long_trap=6),
        dict(size=20, cols=5, phase="4x5", patterns=[[4, 4, 4, 4, 4], [3, 4, 4, 4, 5], [4, 4, 6, 6], [3, 5, 6, 6]], sharp_source=True, rare_score=4, max_candidates=1200, solutions=(2, 113), traps=(122, 400), long_trap=6),
        dict(size=20, cols=5, phase="4x5", patterns=[[4, 4, 4, 4, 4], [3, 4, 4, 4, 5], [4, 4, 6, 6], [3, 5, 6, 6]], sharp_source=True, rare_score=4, max_candidates=1200, solutions=(2, 82), traps=(146, 400), long_trap=6),
        dict(size=20, cols=5, phase="4x5", patterns=[[4, 4, 4, 4, 4], [3, 4, 4, 4, 5], [4, 4, 6, 6], [3, 5, 6, 6]], sharp_source=True, rare_score=4, max_candidates=1200, solutions=(2, 50), traps=(170, 400), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 2600), traps=(30, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 2458), traps=(43, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 2317), traps=(57, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 2175), traps=(70, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 2033), traps=(83, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 1892), traps=(97, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 1750), traps=(110, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 1608), traps=(123, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 1467), traps=(137, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 1325), traps=(150, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 1183), traps=(163, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 1042), traps=(177, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=5, max_candidates=1500, solutions=(2, 900), traps=(190, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=6, max_candidates=1500, solutions=(2, 800), traps=(60, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=6, max_candidates=1500, solutions=(2, 733), traps=(78, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=6, max_candidates=1500, solutions=(2, 667), traps=(96, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=6, max_candidates=1500, solutions=(2, 600), traps=(113, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=6, max_candidates=1500, solutions=(2, 533), traps=(131, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=6, max_candidates=1500, solutions=(2, 467), traps=(149, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=6, max_candidates=1500, solutions=(2, 400), traps=(167, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=6, max_candidates=1500, solutions=(2, 333), traps=(184, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=6, max_candidates=1500, solutions=(2, 267), traps=(202, 480), long_trap=6),
        dict(size=25, cols=5, phase="5x5-expert", patterns=[[5, 5, 5, 5, 5], [4, 4, 5, 6, 6], [3, 4, 6, 6, 6], [3, 3, 4, 5, 5, 5]], sharp_source=True, rare_score=6, max_candidates=1500, solutions=(2, 200), traps=(220, 480), long_trap=6),
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
            "solutionCount": 0,
            "minWords": None,
            "maxWords": None,
            "traps": [],
            "too_open": True,
            "too_common": True,
        }

    vectors = [WORD_COUNTS[w] for w in candidates]
    by_letter = [[i for i, vector in enumerate(vectors) if vector[j]] for j in range(26)]

    def pivot(rem):
        """Words that could cover the scarcest remaining letter.

        Any partition of `rem` has to cover that letter with exactly one word, so
        branching on it alone is both exhaustive and vastly narrower than trying
        every candidate at every level -- on a 25-tile pool that difference is
        the difference between seconds and hours.
        """
        best = None
        for j in range(26):
            if not rem[j]:
                continue
            options = [i for i in by_letter[j] if fits(vectors[i], rem)]
            if not options:
                return ()
            if best is None or len(options) < len(best):
                best = options
        return best or ()

    @lru_cache(maxsize=None)
    def can_partition(rem):
        rem_size = count_size(rem)
        if rem_size == 0:
            return True
        if rem_size < 3:
            return False
        return any(can_partition(sub_counts(rem, vectors[i])) for i in pivot(rem))

    solutions = []

    def enumerate_partitions(rem, start, chosen, limit):
        """Collect up to `limit` example partitions, for the shipped sample only.

        The pack stores a handful of solutions as a sanity aid; the *count* comes
        from count_partitions and the shortest clear from fewest_words, both of
        which memoize. Enumerating every partition of a 25-tile pool would mean
        walking thousands of paths to display eight of them.
        """
        if len(solutions) >= limit:
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
                rest = sub_counts(rem, wc)
                # can_partition is memoized, so testing the residue up front is far
                # cheaper than walking a branch that cannot finish the pool.
                if not can_partition(rest):
                    continue
                chosen.append(w)
                enumerate_partitions(rest, i, chosen, limit)
                chosen.pop()
                if len(solutions) >= limit:
                    return

    @lru_cache(maxsize=None)
    def fewest_words(rem):
        """Shortest full clear, as a word count. Memoized, so it never enumerates."""
        rem_size = count_size(rem)
        if rem_size == 0:
            return 0
        if rem_size < 3:
            return None
        best = None
        for i in pivot(rem):
            deeper = fewest_words(sub_counts(rem, vectors[i]))
            if deeper is not None and (best is None or deeper + 1 < best):
                best = deeper + 1
        return best

    # Count before enumerating. Counting memoizes on the remainder, so branches
    # that reconverge get collapsed instead of re-walked; enumeration cannot do
    # that because it has to carry the chosen words down each path. This rejects
    # a wide-open 25-tile pool in a moment rather than after an exhaustive walk
    # that in practice never finishes.
    @lru_cache(maxsize=None)
    def count_partitions(rem):
        rem_size = count_size(rem)
        if rem_size == 0:
            return 1
        if rem_size < 3:
            return 0
        total = 0
        for i in pivot(rem):
            total += count_partitions(sub_counts(rem, vectors[i]))
            if total > max_solutions:
                return total
        return total

    solution_count = count_partitions(counts)
    if solution_count > max_solutions:
        return {
            "candidates": candidates,
            "solutions": [],
            "solutionCount": solution_count,
            "minWords": None,
            "maxWords": None,
            "traps": [],
            "too_open": True,
        }

    if solution_count < min_solutions:
        return {
            "candidates": candidates,
            "solutions": [],
            "solutionCount": solution_count,
            "minWords": None,
            "maxWords": None,
            "traps": [],
            "too_open": False,
        }

    enumerate_partitions(counts, 0, [], 8)

    @lru_cache(maxsize=None)
    def most_words(rem):
        """Longest full clear, as a word count. Tells the UI whether the shown
        minimum is a true floor (a real solution runs longer) or the only length
        any solution has."""
        rem_size = count_size(rem)
        if rem_size == 0:
            return 0
        if rem_size < 3:
            return None
        best = None
        for i in pivot(rem):
            deeper = most_words(sub_counts(rem, vectors[i]))
            if deeper is not None and (best is None or deeper + 1 > best):
                best = deeper + 1
        return best

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
        "solutionCount": solution_count,
        "minWords": fewest_words(counts),
        "maxWords": most_words(counts),
        "traps": traps,
        "too_open": False,
    }


def board_score(analysis):
    traps = analysis["traps"]
    long = [w for w in traps if len(w) >= 5]
    avg_trap = (sum(len(w) for w in traps) / len(traps)) if traps else 0
    return len(long) * 4 + avg_trap + min(len(traps), 20) * 0.25


def accept(n, counts, source, analysis):
    spec = level_spec(n)
    sol_count = analysis["solutionCount"]
    trap_count = len(analysis["traps"])
    min_words = analysis["minWords"] or 0
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
        if analysis["solutionCount"] >= 2 and not analysis["too_open"]:
            score = board_score(analysis)
            if best is None or score > board_score(best[3]):
                best = (attempt, source, counts, analysis)
    if best is None or not accept(n, best[2], best[1], best[3]):
        raise RuntimeError(f"level {n}: failed to find accepted board after {attempts} attempts")

    attempt, source, counts, analysis = best
    sols = analysis["solutions"]
    min_words = analysis["minWords"]
    pattern = [len(w) for w in source]
    trap_sample = sorted(analysis["traps"], key=lambda w: (-len(w), RANKS.get(w, 999999), w))[:16]
    letters = shuffled_pool(counts, rng)
    print(
        f"L{n:02d} {spec['phase']} pool={len(letters):2d} sol={analysis['solutionCount']:5d} "
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
        "solutionCount": analysis["solutionCount"],
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


def pack_text(payload):
    """Render the runtime pack: boards, the legal lexicon, and the blocked list.

    CONSUME_BLOCKED holds real words the content filter removes. Shipping it lets
    the game answer "that word is not counted here" rather than "not a word",
    which would otherwise be both wrong and confusing.
    """
    words = sorted(RUNTIME_WORDS, key=lambda w: (len(w), RANKS.get(w, 999999), w))
    blocked = sorted(BLOCKED_WORDS)
    return (
        "// Generated by generate_consume_boards.py - do not hand-edit.\n"
        "// Consume boards are solver-checked and every shipped level has at least two full solutions.\n"
        f"const CONSUME_DATA = {json.dumps(payload, separators=(',', ':'))};\n"
        f"const CONSUME_DICT = new Set({json.dumps(words, separators=(',', ':'))});\n"
        f"const CONSUME_BLOCKED = new Set({json.dumps(blocked, separators=(',', ':'))});\n"
    )


def emit(levels):
    payload = {
        "version": 1,
        "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "levels": levels,
    }
    OUT.write_text(pack_text(payload))
    print(f"wrote {OUT.relative_to(ROOT)} ({len(levels)} levels, "
          f"{len(RUNTIME_WORDS)} legal words, {len(BLOCKED_WORDS)} blocked)")


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
            f"sol={analysis['solutionCount']:5d} traps={len(analysis['traps']):2d} "
            f"min_words={analysis['minWords']}"
        )


def refresh_dictionary():
    """Refresh the runtime lexicon without rerolling the solver-checked boards."""
    src = OUT.read_text()
    marker = "const CONSUME_DATA = "
    start = src.index(marker) + len(marker)
    end = src.index(";\nconst CONSUME_DICT", start)
    data = json.loads(src[start:end])
    OUT.write_text(pack_text(data))
    print(f"refreshed {OUT.relative_to(ROOT)} ({len(RUNTIME_WORDS)} legal words, "
          f"{len(BLOCKED_WORDS)} blocked)")


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
