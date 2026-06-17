#!/usr/bin/env python3
"""
Match video files to YouTube video IDs, extract thumbnail frames with ffmpeg,
save to thumbnails/VIDEO_ID.jpg
"""
import json, re, os, subprocess, difflib

DATA_JS   = '/Users/kevinseverino/Documents/moberino/data.js'
VIDEO_DIR = '/Users/kevinseverino/Downloads/videos'
THUMB_DIR = '/Users/kevinseverino/Documents/moberino/thumbnails'
SEEK      = '00:00:08'  # grab frame at 8 seconds in

# ── Load videos from data.js ──────────────────────────────────────────────────
with open(DATA_JS) as f:
    content = f.read()
videos_json = re.search(r'const VIDEOS = (\[.*?\]);', content, re.DOTALL).group(1)
VIDEOS = json.loads(videos_json)

def normalize(s):
    s = s.upper()
    s = re.sub(r'[^A-Z0-9 ]', ' ', s)
    s = re.sub(r'\s+', ' ', s).strip()
    return s

def title_key(v):
    title = normalize(v.get('title', ''))
    year  = str(v.get('year', '') or '')
    return f"{year} {title}".strip()

# ── Find video files ──────────────────────────────────────────────────────────
video_files = [f for f in os.listdir(VIDEO_DIR)
               if f.lower().endswith(('.mp4','.mov','.avi','.m4v'))]

db_keys  = [title_key(v) for v in VIDEOS]
file_keys = [normalize(os.path.splitext(f)[0]) for f in video_files]

matched   = []
unmatched = []

for i, vf in enumerate(video_files):
    fkey = file_keys[i]
    hits = difflib.get_close_matches(fkey, db_keys, n=1, cutoff=0.45)
    if hits:
        idx = db_keys.index(hits[0])
        matched.append((vf, VIDEOS[idx], hits[0]))
    else:
        unmatched.append(vf)

print(f"\n✓ Matched: {len(matched)}  ✗ Unmatched: {len(unmatched)}\n")

if unmatched:
    print("── UNMATCHED FILES (will skip) ──")
    for f in unmatched:
        print(f"  {f}")
    print()

# ── Extract thumbnails ────────────────────────────────────────────────────────
os.makedirs(THUMB_DIR, exist_ok=True)
skipped = already = errors = done = 0

for vf, v, matched_key in matched:
    out = os.path.join(THUMB_DIR, f"{v['video_id']}.jpg")

    if os.path.exists(out) and os.path.getsize(out) > 5000:
        already += 1
        continue

    src = os.path.join(VIDEO_DIR, vf)
    print(f"  → {vf[:50]:<50}  [{v['video_id']}]")

    result = subprocess.run([
        'ffmpeg', '-y', '-ss', SEEK,
        '-i', src,
        '-frames:v', '1',
        '-q:v', '2',
        out
    ], capture_output=True)

    if result.returncode == 0 and os.path.exists(out):
        done += 1
    else:
        # video shorter than SEEK — grab first frame instead
        result2 = subprocess.run([
            'ffmpeg', '-y',
            '-i', src,
            '-frames:v', '1',
            '-q:v', '2',
            out
        ], capture_output=True)
        if result2.returncode == 0:
            done += 1
        else:
            errors += 1
            print(f"    ERROR: {result2.stderr.decode()[-200:]}")

print(f"\nDone: {done} new  |  Already existed: {already}  |  Errors: {errors}")
print(f"Unmatched files: {len(unmatched)}")
