#!/usr/bin/env python3
"""Convert moberino_videos_cat.csv to data.js for the Moberino website."""
import csv, json, os, re

CSV_FILE = "moberino_videos_tagged.csv"

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

        local_thumb = f"thumbnails/{video_id}.jpg"
        thumb = local_thumb if os.path.exists(local_thumb) \
            else f"https://img.youtube.com/vi/{video_id}/hqdefault.jpg"

        objects = (row.get("objects") or "").strip()

        videos.append({
            "title":        title,
            "video_id":     video_id,
            "youtube_url":  row.get("youtube_url", ""),
            "thumb":        thumb,
            "published_at": row.get("published_at", ""),
            "category":     category,
            "year":         year,
            "objects":      objects,
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
