#!/usr/bin/env python3
"""
Tag moberino videos with scene/object labels using LLaVA via Ollama.

Requirements:
  - ffmpeg installed (brew install ffmpeg)
  - Ollama running with llava model:
      ollama serve          (in one terminal)
      ollama pull llava     (first time only)

Usage:
  python3 tag_videos.py

Extracts frames every INTERVAL seconds, describes each with LLaVA,
aggregates tags by frequency. Skips already-tagged rows.
Writes results to moberino_videos_tagged.csv.
"""
import base64, csv, difflib, json, os, re, shutil, subprocess, sys, tempfile
import urllib.request

CSV_IN    = "moberino_videos_tagged.csv"
CSV_OUT   = "moberino_videos_tagged.csv"
VIDEO_DIR = "/Users/kevinseverino/Downloads/videos"
INTERVAL  = 20        # seconds between frames
OLLAMA    = "http://localhost:11434/api/generate"
MODEL     = "llava"
EXTENSIONS = (".mp4", ".mov", ".avi", ".m4v", ".mkv", ".mpg", ".mpeg", ".wmv")

PROMPT = (
    "List what you see in this image as comma-separated tags. "
    "Include people (baby, child, toddler, teenager, elderly), "
    "activities (swimming, dancing, singing, opening_presents, blowing_candles, cooking, playing), "
    "settings (beach, backyard, living_room, church, restaurant, school, hospital, park, pool), "
    "occasions (birthday, christmas, halloween, thanksgiving, easter, wedding, graduation, easter), "
    "and specific objects (birthday_cake, christmas_tree, balloon, fireplace, snow, turkey, pumpkin, easter_eggs). "
    "Be specific not generic. Return only the comma-separated list, nothing else."
)


def normalize(s):
    s = re.sub(r"['\"\.,!?]", '', s)
    return re.sub(r'[\s_\-]+', ' ', s).strip().lower()


def build_title_index():
    index = {}
    try:
        for fname in os.listdir(VIDEO_DIR):
            name, ext = os.path.splitext(fname)
            if ext.lower() in EXTENSIONS:
                index[normalize(name)] = os.path.join(VIDEO_DIR, fname)
    except FileNotFoundError:
        pass
    return index


def find_video(title, index):
    key = normalize(title)
    if key in index:
        return index[key]
    hits = difflib.get_close_matches(key, index.keys(), n=1, cutoff=0.55)
    return index[hits[0]] if hits else None


def extract_frames(video_path, out_dir):
    """Extract one frame every INTERVAL seconds."""
    subprocess.run(
        ["ffmpeg", "-i", video_path,
         "-vf", f"fps=1/{INTERVAL}",
         "-q:v", "3",
         os.path.join(out_dir, "frame_%04d.jpg"),
         "-y", "-loglevel", "error"],
        timeout=180
    )


def classify_frame(image_path):
    """Ask LLaVA to describe the frame, return list of tags."""
    with open(image_path, 'rb') as f:
        img_b64 = base64.b64encode(f.read()).decode()

    payload = json.dumps({
        "model": MODEL,
        "prompt": PROMPT,
        "images": [img_b64],
        "stream": False
    }).encode()

    req = urllib.request.Request(OLLAMA, data=payload,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            text = json.loads(resp.read()).get("response", "").strip()
            tags = [t.strip().lower().replace(" ", "_") for t in text.split(",") if t.strip()]
            return [t for t in tags if 2 < len(t) < 40]
    except Exception:
        return []


def tag_video(video_path):
    """Return comma-separated tags aggregated across all frames."""
    tmp = tempfile.mkdtemp()
    try:
        extract_frames(video_path, tmp)
        frames = sorted(f for f in os.listdir(tmp) if f.endswith(".jpg"))
        counts = {}
        for fname in frames:
            for tag in classify_frame(os.path.join(tmp, fname)):
                counts[tag] = counts.get(tag, 0) + 1
        ranked = sorted(counts, key=lambda t: -counts[t])
        return ",".join(ranked)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ── Startup checks ────────────────────────────────────────────────────────────

if not shutil.which("ffmpeg"):
    print("ERROR: ffmpeg not found. Install with:  brew install ffmpeg")
    sys.exit(1)

try:
    with urllib.request.urlopen("http://localhost:11434/api/tags", timeout=5) as r:
        models = [m["name"] for m in json.loads(r.read()).get("models", [])]
    if not any(MODEL in m for m in models):
        print(f"ERROR: '{MODEL}' model not found. Run:  ollama pull {MODEL}")
        sys.exit(1)
except Exception:
    print("ERROR: Ollama not running. Start it with:  ollama serve")
    sys.exit(1)

# ── Load CSV ──────────────────────────────────────────────────────────────────

with open(CSV_IN, newline="", encoding="utf-8-sig") as f:
    rows = list(csv.DictReader(f))

fieldnames = list(rows[0].keys())
if "objects" not in fieldnames:
    fieldnames.append("objects")

title_index = build_title_index()
print(f"Found {len(title_index)} video files in {VIDEO_DIR}/")
print(f"Frame interval: every {INTERVAL}s  |  Model: {MODEL}\n")

total = skipped = not_found = 0

for i, row in enumerate(rows, 1):
    title = row.get("title", "")
    label = title[:30]
    total += 1

    if row.get("objects", "").strip():
        sys.stdout.write(f"\r[{i}/{len(rows)}] {label:<30}  (skipped)")
        sys.stdout.flush()
        skipped += 1
        continue

    video_path = find_video(title, title_index)
    if not video_path:
        sys.stdout.write(f"\r[{i}/{len(rows)}] {label:<30}  (no file match)")
        sys.stdout.flush()
        row["objects"] = ""
        not_found += 1
        continue

    sys.stdout.write(f"\r[{i}/{len(rows)}] {label:<30}  tagging...          ")
    sys.stdout.flush()

    tags = tag_video(video_path)
    row["objects"] = tags

    preview = (tags[:55] + "...") if len(tags) > 55 else tags
    sys.stdout.write(f"\r[{i}/{len(rows)}] {label:<30}  {preview}\n")
    sys.stdout.flush()

    # Save after each video so progress isn't lost if interrupted
    with open(CSV_OUT, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

print(f"\nDone. {skipped} skipped  |  {not_found} unmatched  |  {total - skipped - not_found} tagged")
print(f"Written to {CSV_OUT}")
