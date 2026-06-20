#!/usr/bin/env python3
"""
Clean LLaVA tags from moberino_videos_tagged.csv and merge them into
moberino_videos_geocoded.csv (which generate_data.py reads).

Strategy:
  - For videos that LLaVA tagged: use cleaned LLaVA tags (human-readable)
  - For videos LLaVA didn't reach: keep a curated subset of Apple Vision tags

Problems fixed in LLaVA output:
  1. Prompt artifacts echoed as tags (activities, settings, occasions…)
  2. Colon-format tags (activities:_opening_presents → opening_presents)
  3. Sentence-fragment tags (LLaVA apologies, descriptions, refusals)
  4. Tags longer than 35 chars
  5. Ultra-generic tags useless for search
  6. Timestamp / number-only tags
  7. Near-duplicate normalization
  8. Deduplication per row
"""
import csv, re, shutil
from pathlib import Path

TAGGED_CSV  = Path("moberino_videos_tagged.csv")
GEO_CSV     = Path("moberino_videos_geocoded.csv")
BAK_PATH    = Path("moberino_videos_geocoded_pretag_backup.csv")

# Apple Vision tags worth keeping (meaningful for family archive search)
USEFUL_APPLE_VISION = {
    'baby','toddler','child','teenager','elderly','boy','girl',
    'balloon','birthday_cake','christmas_tree','pumpkin','turkey',
    'easter_eggs','snow','fireplace','cake','candle',
    'pool','beach','park','playground','backyard','church',
    'school','restaurant','kitchen','television','swimming_pool',
    'birthday','christmas','halloween','thanksgiving','easter',
    'graduation','wedding','dancing','singing','cooking',
}

# ── Blacklist: remove these exact tags entirely ────────────────────────────────
BLACKLIST = {
    # Prompt category headers echoed back
    'activities','settings','occasions','activity','setting','occasion','object',
    'objects','people','persons','in_this_image',
    # Too generic for a family archive search
    'person','man','woman','adult','adults','individual',
    'sitting','table','chair','chairs','tree','trees','clock','grass',
    'bench','fence','floor','wall','walls','door','window','ceiling','roof',
    'indoor','indoors','indoor_setting','outdoor','outdoors','outside',
    'daytime','nighttime','nighttime_setting','background','foreground',
    'photo','image','picture','video','frame','scene','view',
    'elderly_person', 'family_gathering', 'candles', 'birthday_party_setting',
    # Generic objects / settings not useful for family archive search
    'room', 'standing', 'smiling', 'walking', 'cup', 'cups', 'book',
    'couch', 'carpet', 'remote_control', 'sink', 'shirt', 'building',
    'street', 'oven', 'hat', 'camera', 'food', 'sky', 'blue_sky',
    'night_sky', 'water', 'sidewalk', 'yard', 'home', 'gathering',
    'eating', 'lamp', 'shrub', 'foliage', 'decorative_plant',
    'brick', 'raw_glass', 'wood_natural', 'liquid', 'container',
    'tool', 'utensil', 'tableware', 'machine', 'consumer_electronics',
    'crowd', 'interior_room', 'recreation', 'frame', 'vehicle',
    'automobile', 'road', 'slide_toy', 'land', 'jacket', 'pillow',
    'drinking_glass', 'bowl', 'plate', 'plates', 'bottle', 'bottles',
    'cutlery', 'bags', 'umbrella', 'sunglasses', 'shoes',
}

# ── Normalization map: replace these with a cleaner equivalent ─────────────────
NORMALIZE = {
    'elderly_person':        'elderly',
    'family_gathering':      'family',
    'candles':               'candle',
    'birthday_party_setting':'birthday',
    'presents':              'opening_presents',  # almost always means this in context
    'present':               'opening_presents',
    'gifts':                 'opening_presents',
    'xmas':                  'christmas',
    'xmas_tree':             'christmas_tree',
    'jack_o_lantern':        'pumpkin',
    'jack-o-lantern':        'pumpkin',
    'bbq':                   'cooking',
    'barbeque':              'cooking',
    'pool_party':            'pool',
    'swimming_pool':         'pool',
}

# ── Prefixes that signal sentence fragments / LLaVA refusals ──────────────────
SENTENCE_STARTERS = (
    'i_', 'it_', 'this_', 'the_', 'a_', 'an_', 'and_', 'or_', 'no_',
    'due_', 'with_', 'showing_', 'looking_', 'wearing_', 'working_',
    'standing_', 'multiple_', 'group_of_', 'possibly_', 'based_',
    'there_', 'these_', 'some_', 'which_', 'that_', 'for_', 'as_',
    'at_', 'of_', 'in_', 'on_', 'is_', 'are_', 'was_', 'note_',
    # Sentence fragments LLaVA writes as "descriptions"
    'person_in_', 'person_with_', 'person_standing_', 'person_sitting_',
    'person_wearing_', 'man_in_', 'man_with_', 'man_sitting_',
    'man_wearing_', 'man_standing_', 'woman_in_', 'woman_with_',
    'woman_wearing_', 'woman_sitting_', 'woman_standing_',
    'two_', 'three_', 'four_', 'five_', 'several_', 'many_',
    'holding_', 'aiming_', 'likely_', 'date_on_', 'utensils_',
    'conversation_', 'emergency_', 'occasion_is_', 'activity_is_',
    'elderly_couple_', 'elderly_man_s', 'elderly_woman_s',
)

# ── Timestamp pattern (7:19, 10:25:47, etc.) ──────────────────────────────────
TIMESTAMP_RE = re.compile(r'^\d+:\d+')
NUMBER_RE    = re.compile(r'^\d+$')


def parse_colon_tag(tag):
    """
    'activities:_opening_presents' → 'opening_presents'
    'occasions:_birthday'          → 'birthday'
    'people:_elderly'              → 'elderly'
    Returns None if value is empty/zero/none/garbage.
    """
    m = re.match(r'^[a-z_]+:_?(.+)$', tag)
    if not m:
        return None
    val = m.group(1).strip().strip('"').strip("'")
    if val in ('0', 'none', 'n/a', '', '0.'):
        return None
    # Value might still be bad — run it through clean_tag
    return val if val else None


def clean_tag(raw):
    """Return a cleaned tag string, or None to discard."""
    t = raw.strip().strip('"').strip("'").strip().lower()
    t = t.replace(' ', '_').replace('-', '_')
    # Remove trailing punctuation
    t = t.rstrip('.,;:!?)').lstrip('"(')

    if not t or len(t) < 3:
        return None
    if NUMBER_RE.match(t):
        return None
    if TIMESTAMP_RE.match(t):
        return None
    # Colon-format tag
    if ':' in t:
        t = parse_colon_tag(t)
        if not t:
            return None
        return clean_tag(t)  # recurse on extracted value
    # Sentence fragment by length (26 keeps: elderly_woman=13, opening_presents=16, birthday_cake=13)
    if len(t) > 26:
        return None
    # Sentence fragment by prefix
    if any(t.startswith(p) for p in SENTENCE_STARTERS):
        return None
    # Ends with sentence punctuation (LLaVA wrote a sentence)
    if raw.strip().endswith('.') or raw.strip().endswith('?'):
        return None
    # Normalize
    t = NORMALIZE.get(t, t)
    # Blacklist
    if t in BLACKLIST:
        return None
    return t


def clean_row_tags(objects_str):
    """Clean the full comma-separated tag string for one row."""
    if not objects_str or not objects_str.strip():
        return ''
    seen = set()
    out = []
    for raw in objects_str.split(','):
        t = clean_tag(raw)
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return ','.join(out)


# ── Run ────────────────────────────────────────────────────────────────────────
# Backup geocoded CSV
if not BAK_PATH.exists():
    shutil.copy(GEO_CSV, BAK_PATH)
    print(f"Backed up geocoded CSV to {BAK_PATH}")

# Load LLaVA-tagged CSV, index by title
with open(TAGGED_CSV, newline='', encoding='utf-8-sig') as f:
    llava_rows = list(csv.DictReader(f))
llava_by_title = {r['title'].strip(): r.get('objects','') for r in llava_rows}
print(f"LLaVA tagged CSV: {len(llava_rows)} rows, "
      f"{sum(1 for v in llava_by_title.values() if v.strip())} with tags")

# Load geocoded CSV
with open(GEO_CSV, newline='', encoding='utf-8-sig') as f:
    geo_rows = list(csv.DictReader(f))
    f.seek(0)
    fieldnames = list(csv.DictReader(f).fieldnames)

before_total = after_total = 0
llava_used = apple_kept = 0

for row in geo_rows:
    title = row.get('title','').strip()
    orig_apple = row.get('objects','')

    llava_raw = llava_by_title.get(title, '')

    if llava_raw.strip():
        # Use cleaned LLaVA tags
        cleaned = clean_row_tags(llava_raw)
        llava_used += 1
    else:
        # Fall back to curated Apple Vision subset
        apple_tags = [t.strip() for t in orig_apple.split(',') if t.strip()]
        kept = [t for t in apple_tags if t in USEFUL_APPLE_VISION]
        cleaned = ','.join(dict.fromkeys(kept))  # dedup, preserve order
        apple_kept += 1

    before_total += len([t for t in orig_apple.split(',') if t.strip()])
    after_total  += len([t for t in cleaned.split(',') if t.strip()])
    row['objects'] = cleaned

with open(GEO_CSV, 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(geo_rows)

print(f"\nDone.")
print(f"  LLaVA tags used:           {llava_used} videos")
print(f"  Apple Vision fallback:     {apple_kept} videos")
print(f"  Tag instances: {before_total:,} → {after_total:,} "
      f"(removed {before_total-after_total:,})")

from collections import Counter
all_tags = []
for row in geo_rows:
    for t in row.get('objects','').split(','):
        if t.strip(): all_tags.append(t.strip())
c = Counter(all_tags)
print(f"\nUnique tags remaining: {len(c)}")
print("\nTop 40 tags (verify these look human-readable):")
for tag, n in c.most_common(40):
    print(f"  {n:4d}  {tag}")
