#!/usr/bin/env python3
"""
Geocode the 'location' column in moberino_videos.csv → adds 'lat' and 'lng' columns.

Requirements:
  pip install geopy

Usage:
  python3 geocode.py

Add a 'location' column to your CSV with addresses like:
  "123 Main St, Chicago, IL"  or  "Miami, FL"  or  "Disney World, Orlando"

Writes results to moberino_videos_geocoded.csv.
Already-geocoded rows (non-empty lat/lng) are skipped on re-runs.
"""
import csv, sys, time

try:
    from geopy.geocoders import Nominatim
    from geopy.exc import GeocoderTimedOut, GeocoderServiceError
except ImportError:
    print("ERROR: geopy not installed.  Run:  pip install geopy")
    sys.exit(1)

CSV_IN  = "moberino_videos_geocoded.csv"
CSV_OUT = "moberino_videos_geocoded.csv"

geo = Nominatim(user_agent="moberino_family_archive", timeout=10)


def geocode(address, retries=2):
    for attempt in range(retries + 1):
        try:
            result = geo.geocode(address)
            return (round(result.latitude, 6), round(result.longitude, 6)) if result else (None, None)
        except (GeocoderTimedOut, GeocoderServiceError):
            if attempt < retries:
                time.sleep(2)
    return (None, None)


# ── Load CSV ──────────────────────────────────────────────────────────────────
with open(CSV_IN, newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

fieldnames = list(rows[0].keys())
for col in ("location", "lat", "lng"):
    if col not in fieldnames:
        fieldnames.append(col)

# ── Build cache from already-geocoded rows (lat/lng present) ──────────────────
cache = {}
for row in rows:
    loc  = row.get("location", "").strip()
    lat  = row.get("lat",  "").strip()
    lng  = row.get("lng",  "").strip()
    if loc and lat and lng:
        cache[loc] = (lat, lng)

# ── Geocode unique new locations ──────────────────────────────────────────────
to_geocode = sorted({
    row.get("location", "").strip()
    for row in rows
    if row.get("location", "").strip() and row.get("location", "").strip() not in cache
})

if to_geocode:
    print(f"Geocoding {len(to_geocode)} new location(s) via Nominatim...\n")
    for i, loc in enumerate(to_geocode, 1):
        sys.stdout.write(f"  [{i}/{len(to_geocode)}] {loc[:60]:<60}")
        sys.stdout.flush()
        lat, lng = geocode(loc)
        if lat and lng:
            cache[loc] = (str(lat), str(lng))
            sys.stdout.write(f"  → {lat}, {lng}\n")
        else:
            cache[loc] = ("", "")
            sys.stdout.write(f"  → NOT FOUND\n")
        sys.stdout.flush()
        time.sleep(1.1)  # Nominatim rate limit: 1 req/sec
else:
    print("No new locations to geocode.")

# ── Write updated CSV ─────────────────────────────────────────────────────────
for row in rows:
    loc = row.get("location", "").strip()
    if loc in cache and (not row.get("lat") or not row.get("lng")):
        row["lat"], row["lng"] = cache[loc]

with open(CSV_OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)

found   = sum(1 for v in cache.values() if v[0])
missing = sum(1 for v in cache.values() if not v[0])
print(f"\nDone. {found} located, {missing} not found → {CSV_OUT}")
if missing:
    print("NOT FOUND addresses — try being more specific:")
    for loc, (lat, _) in cache.items():
        if not lat:
            print(f"  {loc}")
print("\nWhen satisfied: cp moberino_videos_geocoded.csv moberino_videos.csv && python3 generate_data.py")
