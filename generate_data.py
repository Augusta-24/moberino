#!/usr/bin/env python3
"""Convert moberino_videos_cat.csv to data.js for the Moberino website."""
import csv, json, os, re

CSV_FILE = "moberino_videos_geocoded.csv"

CATEGORIES = [
    "Moberg Christmas",
    "Severino Christmas",
    "Birthdays",
    "TDKK",
    "Severino Family",
    "Moberg Family",
    "Severino Holidays",
    "Moberg Holidays",
    "Moberg Classics",
    "60s Moberg Christmas",
    "1960s Sev",
    "Florida",
    "Halloween",
    "Fawcett Family",
    "First Day of School",
    "Christmas Morn Sev",
    "Christmas Morn Faw",
    "Christmas Program",
]

def extract_year(date_str, title, published_at):
    """Pull a 4-digit year from the date field first, then title, then upload date."""
    for src in (date_str, title):
        m = re.search(r'\b(19[5-9]\d|20[0-2]\d)\b', src)
        if m:
            return int(m.group())
    if published_at and len(published_at) >= 4:
        y = int(published_at[:4])
        # Upload year is often 2020-2022; only use if it looks like a real video year
        if y < 2020:
            return y
    return None

MONTH_NAMES = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3,
    "apr": 4, "april": 4, "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7,
    "aug": 8, "august": 8, "sep": 9, "sept": 9, "september": 9, "oct": 10,
    "october": 10, "nov": 11, "november": 11, "dec": 12, "december": 12,
}

def two_digit_year(yy):
    """Family videos span ~1955-2025 — 2-digit years below 30 read as 2000s, else 1900s."""
    yy = int(yy)
    return 2000 + yy if yy < 30 else 1900 + yy

def parse_date_field(date_str):
    """The CSV's date column is inconsistently formatted (YYYY-MM, M/D/YY, Mon-YY,
    plain YYYY, or a junk '2020 (upload)' placeholder) — pull out (year, month)
    wherever the format actually encodes a month, returning None for whichever part
    isn't present/trustworthy."""
    d = date_str.strip()
    m = re.match(r'^(\d{4})-(\d{1,2})(?:-\d{1,2})?$', d)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.match(r'^(\d{1,2})/(\d{1,2})/(\d{2,4})$', d)
    if m:
        month, year = int(m.group(1)), m.group(3)
        year = int(year) if len(year) == 4 else two_digit_year(year)
        return year, month
    m = re.match(r'^([A-Za-z]{3,9})-(\d{2,4})$', d)
    if m and m.group(1).lower() in MONTH_NAMES:
        year = m.group(2)
        year = int(year) if len(year) == 4 else two_digit_year(year)
        return year, MONTH_NAMES[m.group(1).lower()]
    m = re.match(r'^(\d{4})$', d)
    if m:
        return int(m.group(1)), None
    return None, None  # covers junk like "2020 (upload)"

SEASON_NAMES = {"spring": 4, "summer": 7, "fall": 10, "autumn": 10, "winter": 1}

def extract_month_from_title(title):
    """Several titles already spell the month (or season) out (e.g. 'June 1997
    Anthony's Birthday', 'Spring 2006 Rosie Pregnant') — catch those directly before
    falling back to holiday-keyword guessing."""
    words = re.findall(r'[A-Za-z]+', title)
    for word in words:
        mo = MONTH_NAMES.get(word.lower())
        if mo:
            return mo
    for word in words:
        mo = SEASON_NAMES.get(word.lower())
        if mo:
            return mo
    return None

# Ordered (term, month) pairs for holiday/seasonal keywords with a reliable typical
# month — checked in order, first match wins. Skipped entirely for anything without a
# fixed/typical month (e.g. plain "birthday", "communion") since a wrong guess is
# worse than no recommendation-relevance boost at all.
KEYWORD_MONTHS = [
    ("christmas", 12), ("xmas", 12), ("nye", 12), ("new year", 12),
    ("halloween", 10), ("pumpkin", 10),
    ("thanksgiving", 11),
    ("valentine", 2),
    ("st patrick", 3), ("patricks", 3), ("patrick's", 3),
    ("easter", 4),
    ("mother", 5), ("memorial day", 5),
    ("father", 6), ("graduation", 6), ("grad", 6),
    ("july 4", 7), ("4th of july", 7),
    ("labor day", 9), ("first day", 9),
]

# Category-level fallback for categories that are themselves season-locked, used only
# when the title has no usable date/keyword of its own.
CATEGORY_MONTHS = {
    "Halloween": 10, "First Day of School": 9, "Christmas Program": 12,
    "Christmas Morn Sev": 12, "Christmas Morn Faw": 12, "Moberg Christmas": 12,
    "Severino Christmas": 12, "60s Moberg Christmas": 12,
}

def infer_month(title, category):
    title_l = title.lower()
    for term, mo in KEYWORD_MONTHS:
        if term in title_l:
            return mo
    return CATEGORY_MONTHS.get(category)

videos = []
with open(CSV_FILE, newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        # Always derive video_id from youtube_url — the video_id column is shifted by one row
        m = re.search(r'[?&]v=([a-zA-Z0-9_-]+)', row.get("youtube_url", ""))
        video_id = m.group(1) if m else row.get("video_id", "").strip()
        title    = (row.get("Main_title") or row.get("title") or "").strip()
        category = (row.get("category") or "").strip()
        date_str = (row.get("date") or "").strip()

        year = extract_year(date_str, row.get("title", ""), row.get("published_at", ""))

        # Month: trust a month spelled out in the title/thumbnail text first — these
        # are hand-curated (sometimes straight off an on-screen camcorder timestamp,
        # e.g. "16 MAR 1991") — then the date field, then holiday/seasonal keyword or
        # category inference. The date column has the same row-shift corruption the
        # video_id column already needed a workaround for (see above), confirmed by
        # 14 title/date-field month conflicts where the title's on-screen-stamp-derived
        # month was clearly the correct one. This is what drives the homepage's
        # "Recommended" section actually matching the current month instead of only
        # loose keyword text-matching.
        date_year, date_month = parse_date_field(date_str)
        month = (
            extract_month_from_title(title)
            or extract_month_from_title(row.get("thumbnail_title", ""))
            or date_month
            or infer_month(title, category)
        )

        local_thumb = f"thumbnails/{video_id}.jpg"
        thumb = local_thumb if os.path.exists(local_thumb) \
            else f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

        objects  = (row.get("objects") or "").strip()
        location = (row.get("location") or "").strip()
        try:
            lat = float(row.get("lat") or "")
            lng = float(row.get("lng") or "")
        except ValueError:
            lat = lng = None

        videos.append({
            "title":        title,
            "video_id":     video_id,
            "youtube_url":  row.get("youtube_url", ""),
            "thumb":        thumb,
            "published_at": row.get("published_at", ""),
            "category":     category,
            "year":         year,
            "month":        month,
            "objects":      objects,
            "location":     location,
            "lat":          lat,
            "lng":          lng,
        })

CAT_THUMBS = {
    "Moberg Classics":      "cat_photo/cat_mobergclassic.jpg",
    "60s Moberg Christmas": "cat_photo/cat_60sMobergChristmas.jpg",
    "Moberg Christmas":     "cat_photo/cat_mobergchristmas.jpg",
    "Moberg Family":        "cat_photo/cat_mobergfamily.png",
    "Moberg Holidays":      "cat_photo/cat_mobergholidays.jpeg",
    "1960s Sev":            "cat_photo/cat_1960ssev.png",
    "Severino Family":      "cat_photo/cat_SeverinoFamily.jpg",
    "Severino Christmas":   "cat_photo/cat_severinoChristmas.jpg",
    "Christmas Morn Sev":   "cat_photo/cat_christmas_morn_sev.png",
    "Severino Holidays":    "cat_photo/cat_severinoholidays.jpg",
    "Fawcett Family":       "cat_photo/cat_FawcettFamily.jpg",
    "Christmas Morn Faw":   "cat_photo/cat_christmas_morn_faw.jpg",
    "TDKK":                 "cat_photo/cat_tdkk.jpg",
    "Birthdays":            "cat_photo/cat_Birthdays.jpg",
    "Halloween":            "cat_photo/cat_halloween.jpg",
    "Christmas Program":    "cat_photo/cat_christmasprogram.jpg",
    "First Day of School":  "cat_photo/cat_firstdayofschool.jpg",
    "Florida":              "cat_photo/cat_Florida.jpg",
}

with open("data.js", "w", encoding="utf-8") as f:
    f.write(f"const VIDEOS = {json.dumps(videos, indent=2)};\n\n")
    f.write(f"const CATEGORIES = {json.dumps(CATEGORIES)};\n\n")
    f.write(f"const CAT_THUMBS = {json.dumps(CAT_THUMBS, indent=2)};\n")

print(f"Generated data.js with {len(videos)} videos, {len(CATEGORIES)} categories")
