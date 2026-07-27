#!/usr/bin/env python3
"""Export the solution samples bundled with Tile Swap: Word Grid."""

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).parent
SOURCE = ROOT / "js" / "games" / "consume-boards.js"
OUTPUT = ROOT / "backups" / "tile-swap-word-grid-solution-samples.csv"


def main():
    source = SOURCE.read_text()
    match = re.search(r"const CONSUME_DATA = (\{.*?\});\s*const CONSUME_DICT", source, re.S)
    if not match:
        raise SystemExit(f"Could not find CONSUME_DATA in {SOURCE}")
    levels = json.loads(match.group(1))["levels"]
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT.open("w", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow([
            "board", "letter_pool", "minimum_words", "total_solution_count",
            "sample_solution_number", "sample_words",
        ])
        for level in levels:
            for number, solution in enumerate(level.get("solutions", []), 1):
                writer.writerow([
                    level["n"], level["pool"].upper(), level["minWords"],
                    level["solutionCount"], number, " | ".join(word.upper() for word in solution),
                ])
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
