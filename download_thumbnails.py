#!/usr/bin/env python3
"""
Download thumbnails via YouTube Data API (OAuth) — works for unlisted videos.
Fetches fresh signed thumbnail URLs and downloads them immediately.
"""
import csv, os, urllib.request, urllib.error, ssl, time

SSL_CTX = ssl._create_unverified_context()
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

SCOPES            = ["https://www.googleapis.com/auth/youtube.readonly"]
TOKEN_FILE        = "token.json"
CLIENT_SECRET_FILE = "client_secret.json"
CSV_FILE          = "moberino_videos.csv"
THUMB_DIR         = "thumbnails"

os.makedirs(THUMB_DIR, exist_ok=True)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                  "AppleWebKit/537.36 (KHTML, like Gecko) "
                  "Chrome/124.0.0.0 Safari/537.36"
}

# ── Auth ──────────────────────────────────────────────────────────────────────
creds = None
if os.path.exists(TOKEN_FILE):
    creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
if not creds or not creds.valid:
    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    else:
        flow = InstalledAppFlow.from_client_secrets_file(CLIENT_SECRET_FILE, SCOPES)
        creds = flow.run_local_server(port=0)
    with open(TOKEN_FILE, "w") as f:
        f.write(creds.to_json())

youtube = build("youtube", "v3", credentials=creds)

# ── Load video IDs from CSV ───────────────────────────────────────────────────
with open(CSV_FILE, newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

video_ids = [r["video_id"] for r in rows]
total     = len(video_ids)
ok = skipped = failed = 0

print(f"Fetching thumbnail URLs for {total} videos via API...")

# ── Fetch in batches of 50 (API limit) ───────────────────────────────────────
thumb_map = {}  # video_id -> url
for i in range(0, total, 50):
    batch = video_ids[i:i+50]
    resp  = youtube.videos().list(
        part="snippet",
        id=",".join(batch),
        maxResults=50
    ).execute()
    for item in resp.get("items", []):
        vid   = item["id"]
        thumbs = item["snippet"].get("thumbnails", {})
        url = (
            thumbs.get("maxres",  {}).get("url") or
            thumbs.get("high",    {}).get("url") or
            thumbs.get("medium",  {}).get("url") or
            thumbs.get("default", {}).get("url")
        )
        if url:
            thumb_map[vid] = url
    print(f"  API batch {i//50+1}: got {len(resp.get('items',[]))} items")

print(f"API returned thumbnail URLs for {len(thumb_map)}/{total} videos\n")

# ── Download each thumbnail ───────────────────────────────────────────────────
for i, vid in enumerate(video_ids, 1):
    dest = os.path.join(THUMB_DIR, f"{vid}.jpg")

    if os.path.exists(dest):
        print(f"[{i}/{total}] skip  {vid}")
        skipped += 1
        continue

    url = thumb_map.get(vid)
    if not url:
        print(f"[{i}/{total}] FAIL  {vid}  (no URL from API)")
        failed += 1
        continue

    try:
        req = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(req, timeout=15, context=SSL_CTX) as resp:
            data = resp.read()
        with open(dest, "wb") as f:
            f.write(data)
        print(f"[{i}/{total}] ok    {vid}")
        ok += 1
    except Exception as e:
        print(f"[{i}/{total}] FAIL  {vid}  {e}")
        failed += 1

    time.sleep(0.03)

print(f"\nDone: {ok} ok, {skipped} skipped, {failed} failed out of {total}")
print(f"Thumbnails saved to: {os.path.abspath(THUMB_DIR)}/")
