#!/usr/bin/env python3
"""
Generate a clean Main_title column from title + thumbnail_title in moberino_videos_enriched.csv.
Reads and writes moberino_videos_enriched.csv in place.
"""
import csv, re

CSV_FILE = "moberino_videos_enriched.csv"

MONTH_ABBR = r'(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)'
MONTH_ABBR_RE = re.compile(fr'^{MONTH_ABBR}\.?$', re.I)
FULL_MONTH_RE = re.compile(
    r'^(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)$',
    re.I,
)

# OCR tokens that are always junk (checked after stripping non-alpha punctuation)
OCR_JUNK = {
    'BLLST', 'RCH', 'DLIR', 'NOUL', 'HOUSERLO', 'SANOL',
    'NARL', 'PKIN', 'BURTHDAY', 'FATHERSDAY', 'DO',
    'GIANTS',  # VHS tape artifact / channel logo
    # gaming clip artifacts
    'ABYANKS', 'HUNTED', 'GROG', 'MUKLENETHEFLOVES',
}

# Standalone function words that are noise as lone segments
_NOISE_WORDS = {'AND', 'THE', 'OF', 'IN', 'AT', 'FOR', 'WITH', 'TO', 'OR', 'BUT', 'ON', 'BY', 'A', 'AN'}

# Misspelling corrections (applied to full segment text, case-insensitive)
MISSPELLINGS = {
    r'\bJANURY\b': 'January',
    r'\bCATSKILE\b': 'Catskill',
    r'\bDAPRIL\b': 'April',   # OCR artefact: D prepended to APRIL
    r'\bTUN\b': '',            # OCR of JUN date stamp — just remove
    r'\bANTHON\'YS\b': "Anthony's",  # apostrophe shifted by OCR
    r'\bNOUL\b': '',           # OCR garbage (month abbreviation noise)
    r'\bHOUSERLO\b': 'House', # OCR of "HOUSE" with garbage suffix
    r'\bPKIN\b': '',           # OCR remnant of Cyrillic Л → remove
    r'\bNAR\b': '',            # OCR garbage
    r'\bSEPD\b': '',           # OCR artefact on "SEP" date stamp
    r'\bTONYJR\b': 'Tony Jr.',  # OCR run-together of "TONY JR"
}

# Abbreviation expansions (applied post-title-case)
ABBREV_RULES = [
    (r'\bBday\b', 'Birthday'),
    (r'\bBDay\b', 'Birthday'),
    (r'\bGma\b', 'Grandma'),
    (r'\bNye\b', "New Year's Eve"),
    (r'\bLi\b(?=\s)', 'Long Island'),
    (r'\bDr\b(?!\.)(?=\s|$)', 'Drive'),
    (r'\bSt\b(?=\s+[A-Z])', 'St.'),
    (r'\bFeb\b', 'February'),
    (r'\bJan\b', 'January'),
    (r'\bMar\b(?!\w)', 'March'),
    (r'\bApr\b', 'April'),
    (r'\bJun\b', 'June'),
    (r'\bJul\b', 'July'),
    (r'\bAug\b', 'August'),
    (r'\bSep\b', 'September'),
    (r'\bOct\b', 'October'),
    (r'\bNov\b', 'November'),
    (r'\bDec\b', 'December'),
]


def is_noise_segment(raw):
    """Return True if a | segment is pure noise."""
    s = re.sub(r'[^\x00-\x7F]', '', raw).strip()  # strip non-ASCII (Cyrillic lookalikes)
    if not s:
        return True

    # Valid 4-digit year always kept (1850–2030)
    if re.fullmatch(r'(?:18|19|20)\d{2}', s):
        return False

    # Less than 2 real alpha chars
    alpha = re.sub(r'[^a-zA-Z]', '', s)
    if len(alpha) <= 1:
        return True

    # AM / PM alone
    if re.fullmatch(r'(?:AM|PM)\.?', s, re.I):
        return True

    # Time: "6:50 PM", "8:07:21AM", "9:01"
    if re.fullmatch(r'\d{1,2}:\d{2}(:\d{2})?\.?\s*(AM|PM)?', s, re.I):
        return True

    # Month abbreviation alone: "DEC", "NOV.", "APR"
    if MONTH_ABBR_RE.match(s):
        return True

    # Full month name alone: "DECEMBER", "JANUARY"
    if FULL_MONTH_RE.match(s):
        return True

    # Standalone function/connector word: "AND", "THE", "OF", etc.
    if alpha.upper() in _NOISE_WORDS and re.fullmatch(r'[A-Za-z]+', s):
        return True

    # Month abbreviation + day only (no year) — "JAN 31", "DEC. 25", "APR 16"
    if re.fullmatch(fr'{MONTH_ABBR}\.?\s*\d{{1,2}}', s, re.I):
        return True

    # Date patterns with punctuation noise (e.g. "DEC! 21 1995") — recheck after stripping punct
    s_nopunct = re.sub(r'[^\w\s]', ' ', s).strip()
    if re.fullmatch(fr'{MONTH_ABBR}\s*\d{{1,2}}\s+\d{{4}}', s_nopunct, re.I):
        return True
    if re.fullmatch(fr'{MONTH_ABBR}\s*\d{{1,2}}', s_nopunct, re.I):
        return True

    # VHS date overlay with degree/ordinal separator — check RAW string so ° and º are intact
    # "DEC 25°10", "NOV 27'08", "DEC 18º10", "APR 21.2005" — separator prevents catching "MAY 1991"
    if re.fullmatch(fr'{MONTH_ABBR}\.?\s*\d{{1,2}}[°\'\.º]\d{{2,4}}\s*(PM|AM)?', raw.strip(), re.I):
        return True

    # Full date code: month abbr + day + 4-digit year with space — "JUL 15 2001", "DEC 25 1993"
    if re.fullmatch(fr'{MONTH_ABBR}\.?\s*\d{{1,2}}\s+\d{{4}}', s, re.I):
        return True

    # Concatenated date code: month abbr + day + year run together — "DEC 242001", "DEC 2510"
    if re.fullmatch(fr'{MONTH_ABBR}\.?\s*\d{{1,2}}\d{{4}}', s, re.I):
        return True

    # Slash date: "3/21/92", "12/24/90", "224/91"
    if re.fullmatch(r'\d{1,3}/\d{1,2}(/\d{2,4})?\.?', s):
        return True

    # Pure number ≤ 3 digits
    if re.fullmatch(r'\d{1,3}', s):
        return True

    # 4-digit number that's not a valid year (1850–2030)
    if re.fullmatch(r'\d{4}', s) and not (1850 <= int(s) <= 2030):
        return True

    # Number with special chars: "*12", "1.87", "4029" (5 digits)
    if re.fullmatch(r'[*#]?\d[\d\.]*', s) and len(s) >= 3:
        # Allow years
        if not re.fullmatch(r'(?:19|20)\d{2}', s):
            return True

        # Known OCR junk tokens (strip punctuation but keep apostrophes before checking)
    if re.sub(r"[^A-Z']", '', s.upper()) in OCR_JUNK:
        return True

    # Standalone "HAPPY" (orphaned VHS greeting without its occasion)
    if re.fullmatch(r'HAPPY', s, re.I):
        return True

    # No vowels (all-consonant clusters like BLLST, RCH, NOUL)
    if alpha and not re.search(r'[AEIOUYaeiouy]', alpha):
        return True

    return False


def clean_segment_text(s):
    """Clean noise within a kept segment (applied after noise-segment filter)."""
    # Remove VHS date overlays FIRST — while ° and º are still present in the string
    s = re.sub(fr'\b{MONTH_ABBR}\.?\s*\d{{1,2}}[°\'\.º]\d{{2,4}}\b', '', s, flags=re.I)
    # Remove month-abbr + day-only patterns embedded in text (e.g. "DEC. 25" within a segment)
    s = re.sub(fr'\b{MONTH_ABBR}\.?\s*\d{{1,2}}\b(?!\d)', '', s, flags=re.I)
    # Remove concatenated date codes: "DEC242001", "DEC 2510"
    s = re.sub(fr'\b{MONTH_ABBR}\.?\s*\d{{1,2}}\d{{4}}\b', '', s, flags=re.I)
    # Remove non-ASCII (Cyrillic lookalikes, remaining degree/ordinal markers)
    s = re.sub(r'[^\x00-\x7F]', '', s)
    # Remove any leftover degree markers
    s = re.sub(r'[°º]', '', s)
    # Remove inline timestamps
    s = re.sub(r'\b\d{1,2}:\d{2}(:\d{2})?\.?\s*(AM|PM)?\b', '', s, flags=re.I)
    # Remove slash dates
    s = re.sub(r'\b\d{1,2}/\d{1,2}/\d{2,4}\b', '', s)
    # Remove "HAPPY BIRTHDAY" / "HAPPY HALLOWEEN" etc. (VHS on-screen labels, spaced or run-together)
    s = re.sub(r'\bHAPPY\s*(?:BIRTHDAY|HALLOWEEN|EASTER|FATHERSDAY|FATHERS?\s*DAY|NEW\s*YEAR)\b', '', s, flags=re.I)
    # Remove standalone HAPPY and common orphaned VHS greeting words
    s = re.sub(r'\b(?:HAPPY|FATHERSDAY|HAPPYBIRTHDAY|HAPPYHALLOWEEN|HAPPYEASTER)\b', '', s, flags=re.I)
    # Remove standalone AM/PM remaining after date cleanup
    s = re.sub(r'\b(?:AM|PM)\b', '', s, flags=re.I)
    # Remove decimal/float artifacts like "20.98", "1.87" (VHS counter noise)
    s = re.sub(r'\b\d+\.\d+\b', '', s)
    # Remove trailing standalone digits stuck to words: "FARM1" → "FARM", "PART1" → "PART 1" keep
    s = re.sub(r'([A-Za-z]{3,})\d+\b', r'\1', s)
    # Remove leading symbols including stray dots: "+ ", ". "
    s = re.sub(r'^[+\-=*#/\s\.]+', '', s)
    # Apply misspelling/OCR corrections
    for pattern, right in MISSPELLINGS.items():
        s = re.sub(pattern, right, s, flags=re.I)
    # Remove known OCR junk words appearing inside a segment
    for junk in OCR_JUNK:
        s = re.sub(fr'(?<![a-zA-Z]){re.escape(junk)}(?![a-zA-Z])', '', s, flags=re.I)
    # Remove lone single letters that aren't part of possessives/contractions ('S etc.)
    s = re.sub(r"(?<!['\w])\b[A-Za-z]\b(?![\w'])", '', s)
    # Remove orphaned 1-3 digit numbers (VHS counters, day numbers, etc.)
    s = re.sub(r'(?:^|\s)\d{1,3}(?=\s|$)', ' ', s)
    return re.sub(r'\s+', ' ', s).strip()


def smart_title_case(s):
    """Title-case with proper apostrophe handling."""
    s = s.title()
    # Fix "'S" → "'s" : "Kevin'S" → "Kevin's"
    s = re.sub(r"'([A-Z])", lambda m: "'" + m.group(1).lower(), s)
    # Fix "And" back to lowercase in some standard patterns (optional — skip for family titles)
    return s


def expand_abbreviations(s):
    for pattern, replacement in ABBREV_RULES:
        s = re.sub(pattern, replacement, s)
    return s


def clean_raw_title(title):
    """Fallback: clean a raw system title when no thumbnail_title is available."""
    # Remove gaming/system timestamp suffixes
    s = re.sub(r'_\d{14}\b', '', title)
    # Remove registered trademark symbols
    s = re.sub(r'[®©™]', '', s)
    # Replace underscores with spaces
    s = s.replace('_', ' ')
    # Clean up
    return re.sub(r'\s+', ' ', s).strip()


def is_gaming_or_raw(title):
    lower = title.lower()
    return any(k in lower for k in ['fortnite', 'call of duty', 'vid 2024', 'vid_20'])


def generate_main_title(title, thumbnail_title):
    # Gaming / raw capture: use cleaned system title
    if is_gaming_or_raw(title) or not thumbnail_title.strip():
        return smart_title_case(clean_raw_title(title))

    # Split thumbnail_title on pipes, filter and clean each segment
    raw_segments = [seg.strip() for seg in thumbnail_title.split('|')]
    kept = []
    for seg in raw_segments:
        if not is_noise_segment(seg):
            cleaned = clean_segment_text(seg)
            if cleaned:
                kept.append(cleaned)

    if not kept:
        # Thumbnail had nothing useful — fall back to raw title
        return smart_title_case(clean_raw_title(title))

    # Deduplicate exact matches (case-insensitive, whitespace-normalized)
    seen = set()
    deduped = []
    for seg in kept:
        key = re.sub(r'\s+', ' ', seg).upper()
        if key not in seen:
            seen.add(key)
            deduped.append(seg)

    # Drop single-word segments that are already present in a multi-word segment
    # e.g. ["SHEILA & TOMMY BIRTHDAY", "SHEILA", "TOMMY"] → keep only first
    def _is_redundant_word(word, all_segs):
        w = word.strip().upper()
        for other in all_segs:
            if other != word and re.search(r'\b' + re.escape(w) + r'\b', other.upper()):
                return True
        return False

    deduped = [
        seg for seg in deduped
        if re.search(r'\s', seg.strip()) or not _is_redundant_word(seg.strip(), deduped)
    ]

    result = ' '.join(deduped)

    # Final cleanup
    result = result.strip(' ,.-')
    result = re.sub(r'\s+', ' ', result)

    # Title case
    result = smart_title_case(result)

    # Fix decade-s: "1980S" → "1980s"
    result = re.sub(r'\b(\d{4})S\b', r'\1s', result)

    # Remove duplicate years (keep first occurrence)
    seen_years = set()
    def _dedup_year(m):
        y = m.group(0)
        if y in seen_years:
            return ''
        seen_years.add(y)
        return y
    result = re.sub(r'\b(?:18|19|20)\d{2}\b', _dedup_year, result)

    # Expand abbreviations
    result = expand_abbreviations(result)

    # Final whitespace cleanup
    result = re.sub(r'\s+', ' ', result).strip(' ,.-')

    return result


# ── Main ──────────────────────────────────────────────────────────────────────
with open(CSV_FILE, newline='', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

fieldnames = list(rows[0].keys())
if 'Main_title' not in fieldnames:
    fieldnames.append('Main_title')

for row in rows:
    row['Main_title'] = generate_main_title(
        row.get('title', ''),
        row.get('thumbnail_title', '')
    )

with open(CSV_FILE, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)

print(f"Generated Main_title for {len(rows)} rows\n")
print(f"{'TITLE':<40} {'THUMBNAIL (truncated)':<50} {'MAIN_TITLE'}")
print('-' * 130)
for row in rows:
    t = row['title'][:38]
    th = row.get('thumbnail_title', '')[:48]
    m = row['Main_title']
    print(f"{t:<40} {th:<50} {m}")
