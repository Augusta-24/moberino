#!/usr/bin/env python3
"""
Tag moberino_videos.csv with object/scene labels detected from video keyframes.

Requirements:
  - FFmpeg installed (brew install ffmpeg)
  - vision_classify binary compiled:
      swiftc vision_classify.swift -o vision_classify

Usage:
  python3 tag_videos.py

Matches video files by YouTube title (filename without extension).
Writes results to moberino_videos_tagged.csv (adds/updates 'objects' column).
"""
import csv, os, re, subprocess, sys, tempfile, shutil

CSV_IN   = "moberino_videos.csv"
CSV_OUT  = "moberino_videos_tagged.csv"
VIDEO_DIR = "videos"              # folder containing your video files
FRAMES    = 8                     # keyframes to sample per video
THRESHOLD = "0.18"                # minimum Vision confidence (0–1)
EXTENSIONS = (".mp4", ".mov", ".avi", ".m4v", ".mkv", ".mpg", ".mpeg", ".wmv")

CLASSIFY_BIN = os.path.join(os.path.dirname(os.path.abspath(__file__)), "vision_classify")


def normalize(s):
    """Lowercase, collapse whitespace/underscores/hyphens for fuzzy matching."""
    return re.sub(r'[\s_\-]+', ' ', s).strip().lower()


def build_title_index():
    """Scan VIDEO_DIR and return {normalized_title: filepath}."""
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
    """Return path to the video file matching this title, or None."""
    return index.get(normalize(title))


def video_duration(path):
    """Return video duration in seconds via ffprobe."""
    try:
        r = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=noprint_wrappers=1:nokey=1", path],
            capture_output=True, text=True, timeout=15
        )
        return float(r.stdout.strip())
    except Exception:
        return None


def extract_frames(video_path, out_dir, n_frames):
    """Extract n_frames evenly spaced frames from video into out_dir."""
    duration = video_duration(video_path)
    if duration and duration > 0:
        interval = max(1, duration / (n_frames + 1))
        vf = f"fps=1/{interval:.2f}"
    else:
        vf = f"fps=1/30"  # fallback: 1 frame every 30s

    subprocess.run(
        ["ffmpeg", "-i", video_path,
         "-vf", vf,
         "-frames:v", str(n_frames),
         "-q:v", "3",
         os.path.join(out_dir, "frame_%04d.jpg"),
         "-y", "-loglevel", "error"],
        timeout=120
    )


def classify_frame(image_path):
    """Return list of label strings for one frame."""
    try:
        r = subprocess.run(
            [CLASSIFY_BIN, os.path.abspath(image_path), THRESHOLD],
            capture_output=True, text=True, timeout=15
        )
        raw = r.stdout.strip()
        return [l.strip() for l in raw.split(",") if l.strip()] if raw else []
    except Exception:
        return []


def tag_video(video_path):
    """Return sorted comma-separated object tags for a video."""
    tmp = tempfile.mkdtemp()
    try:
        extract_frames(video_path, tmp, FRAMES)
        frames = sorted(f for f in os.listdir(tmp) if f.endswith(".jpg"))
        label_counts = {}
        for fname in frames:
            for label in classify_frame(os.path.join(tmp, fname)):
                label_counts[label] = label_counts.get(label, 0) + 1
        # Sort by frequency descending, keep labels seen in ≥1 frame
        ranked = sorted(label_counts.keys(), key=lambda l: -label_counts[l])
        return ",".join(ranked)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


# ── Main ──────────────────────────────────────────────────────────────────────

if not os.path.exists(CLASSIFY_BIN):
    print(f"ERROR: vision_classify binary not found at {CLASSIFY_BIN}")
    print("Compile it first:  swiftc vision_classify.swift -o vision_classify")
    sys.exit(1)

if not shutil.which("ffmpeg"):
    print("ERROR: ffmpeg not found. Install with:  brew install ffmpeg")
    sys.exit(1)

with open(CSV_IN, newline="", encoding="utf-8") as f:
    rows = list(csv.DictReader(f))

fieldnames = list(rows[0].keys())
if "objects" not in fieldnames:
    fieldnames.append("objects")

title_index = build_title_index()
print(f"Found {len(title_index)} video files in {VIDEO_DIR}/")

total = len(rows)
skipped = 0
not_found = 0
print(f"Tagging {total} videos...\n")

for i, row in enumerate(rows, 1):
    title = row["title"]
    label = title[:28]

    # Skip if already tagged
    if row.get("objects", "").strip():
        sys.stdout.write(f"\r[{i}/{total}] {label:<28}  (already tagged)")
        sys.stdout.flush()
        skipped += 1
        continue

    video_path = find_video(title, title_index)
    if not video_path:
        sys.stdout.write(f"\r[{i}/{total}] {label:<28}  (no file match)")
        sys.stdout.flush()
        row["objects"] = ""
        not_found += 1
        continue

    sys.stdout.write(f"\r[{i}/{total}] {label:<28}  processing...")
    sys.stdout.flush()

    tags = tag_video(video_path)
    row["objects"] = tags

    preview = tags[:55] + "..." if len(tags) > 55 else tags
    sys.stdout.write(f"\r[{i}/{total}] {label:<28}  {preview:<58}")
    sys.stdout.flush()

print(f"\n\nDone. {skipped} skipped (already tagged), {not_found} unmatched. Writing {CSV_OUT}...")

with open(CSV_OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=fieldnames)
    w.writeheader()
    w.writerows(rows)

print(f"Written to {CSV_OUT}")
print("Review the 'objects' column, then replace moberino_videos.csv when satisfied.")
