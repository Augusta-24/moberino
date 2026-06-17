#!/usr/bin/env python3
"""
Enrich moberino_videos.csv with:
  - thumbnail_title : text extracted from thumbnail via OCR
  - date            : best-guess recording date (YYYY-MM-DD or YYYY)
"""
import csv, os, re, sys, subprocess

CSV_IN  = "moberino_videos.csv"
CSV_OUT = "moberino_videos_enriched.csv"
THUMB_DIR = "thumbnails"
OCR_BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_vision")

# ── Month name → number ─────────────────────────────────────────────────────
MONTHS = {
    'jan':1,'feb':2,'mar':3,'apr':4,'may':5,'jun':6,
    'jul':7,'aug':8,'sep':9,'oct':10,'nov':11,'dec':12,
    'january':1,'february':2,'march':3,'april':4,'june':6,
    'july':7,'august':8,'september':9,'october':10,'november':11,'december':12,
}

# Season → month heuristics for titles like "Summer 1987"
SEASON_MONTH = {
    'christmas':12,'xmas':12,'thanksgiving':11,'halloween':10,
    'easter':4,'summer':7,'winter':1,'spring':4,'fall':9,'autumn':9,
    'new year':1,'birthday':None,'graduation':6,'wedding':6,'reunion':7,
}


def ocr_thumbnail(path: str) -> str:
    """Return OCR text using macOS Vision framework via Swift (no tesseract needed)."""
    try:
        abs_path = os.path.abspath(path)
        result = subprocess.run(
            [OCR_BIN, abs_path],
            capture_output=True, text=True, timeout=15
        )
        return result.stdout.strip()
    except Exception:
        return ''


def extract_date_from_text(text: str):
    """
    Return (year, month, day) tuple with None for unknown fields,
    or None if nothing found.
    Handles: VHS stamps (DEC 25 1995, 12/25/95, 12-25-95),
             title patterns (Christmas 1987, Summer of 88, 1994).
    """
    t = text.lower()

    # Pattern: DD MON YYYY  or  MON DD YYYY  (VHS date stamp)
    m = re.search(r'(\d{1,2})[.\- ]+([a-z]{3,})[.\- ]+(\d{2,4})', t)
    if m:
        d, mo, y = m.group(1), m.group(2)[:3], m.group(3)
        mon = MONTHS.get(mo)
        yr = int(y) if len(y) == 4 else (1900+int(y) if int(y)>30 else 2000+int(y))
        if mon: return yr, mon, int(d)

    m = re.search(r'([a-z]{3,})[.\- ]+(\d{1,2})[,.\- ]+(\d{2,4})', t)
    if m:
        mo, d, y = m.group(1)[:3], m.group(2), m.group(3)
        mon = MONTHS.get(mo)
        yr = int(y) if len(y) == 4 else (1900+int(y) if int(y)>30 else 2000+int(y))
        if mon: return yr, mon, int(d)

    # Pattern: MM/DD/YY or MM-DD-YY
    m = re.search(r'\b(\d{1,2})[/\-](\d{1,2})[/\-](\d{2,4})\b', t)
    if m:
        mo, d, y = int(m.group(1)), int(m.group(2)), m.group(3)
        yr = int(y) if len(y)==4 else (1900+int(y) if int(y)>30 else 2000+int(y))
        if 1 <= mo <= 12 and 1 <= d <= 31:
            return yr, mo, d

    # Season / holiday keywords + year
    for kw, mon in SEASON_MONTH.items():
        if kw in t:
            yr_m = re.search(r'\b(19[5-9]\d|20[0-2]\d)\b', t)
            if yr_m:
                return int(yr_m.group()), mon, None

    # Bare year
    yr_m = re.search(r'\b(19[5-9]\d|20[0-2]\d)\b', t)
    if yr_m:
        return int(yr_m.group()), None, None

    return None


def format_date(tup):
    if tup is None:
        return ''
    yr, mo, dy = tup
    if dy and mo:
        return f"{yr}-{mo:02d}-{dy:02d}"
    if mo:
        return f"{yr}-{mo:02d}"
    return str(yr)


def best_date(title: str, thumb_text: str, published_at: str) -> str:
    # Try thumb OCR text first (most precise — actual recording date)
    r = extract_date_from_text(thumb_text)
    if r and r[1]:            # has at least a month
        return format_date(r)

    # Try video title
    r2 = extract_date_from_text(title)
    if r2:
        return format_date(r2)

    # Fall back to thumb OCR year-only
    if r:
        return format_date(r)

    # Fall back to published_at year (upload date — least reliable)
    if published_at and len(published_at) >= 4:
        return published_at[:4] + ' (upload)'

    return ''


# ── Main ────────────────────────────────────────────────────────────────────
with open(CSV_IN, newline='', encoding='utf-8') as f:
    rows = list(csv.DictReader(f))

fieldnames = list(rows[0].keys())
if 'thumbnail_title' not in fieldnames:
    fieldnames.append('thumbnail_title')
if 'date' not in fieldnames:
    fieldnames.append('date')

total = len(rows)
print(f"Processing {total} videos...")

for i, row in enumerate(rows, 1):
    vid = row['video_id']
    thumb_path = os.path.join(THUMB_DIR, f"{vid}.jpg")
    thumb_text = ''
    if os.path.exists(thumb_path):
        thumb_text = ocr_thumbnail(thumb_path)
        sys.stdout.write(f"\r[{i}/{total}] {vid[:16]:<16}  OCR: {thumb_text[:40]:<40}")
        sys.stdout.flush()
    else:
        sys.stdout.write(f"\r[{i}/{total}] {vid[:16]:<16}  (no thumbnail)")
        sys.stdout.flush()

    row['thumbnail_title'] = thumb_text
    row['date'] = best_date(row['title'], thumb_text, row.get('published_at',''))

print(f"\n\nWriting {CSV_OUT}...")
with open(CSV_OUT, 'w', newline='', encoding='utf-8') as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)

print(f"Done. Check {CSV_OUT}")
print("Review the 'date' column — dates marked '(upload)' are upload dates, not recording dates.")
print("When satisfied, replace moberino_videos.csv with the enriched version.")
