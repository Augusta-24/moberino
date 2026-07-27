#!/usr/bin/env python3
"""Rebuild data/subtlex-us-zipf.tsv from the published SUBTLEX-US workbook.

The generators need to know how well-known a word is, not merely whether it is
legal. SUBTLEX-US measures exactly that: word frequencies drawn from ~51M words
of film and television subtitles, which is the standard psycholinguistic proxy
for how readily a person recognises a word.

Ghent University publishes the workbook for free download but does not state
redistribution terms on the download page, so the derived list is rebuilt here
rather than assumed to be freely redistributable -- see
licenses/SUBTLEX-US-CITATION.txt before committing the output to a public repo.

Run: python3 tools/fetch_subtlex.py
"""

import io
import urllib.request
import zipfile
from pathlib import Path

import openpyxl

SOURCE = ("https://www.ugent.be/pp/experimentele-psychologie/en/research"
          "/documents/subtlexus/subtlexus1.zip")
OUT = Path(__file__).parent.parent / "data" / "subtlex-us-zipf.tsv"


def main():
    print(f"fetching {SOURCE}")
    with urllib.request.urlopen(SOURCE, timeout=180) as response:
        archive = zipfile.ZipFile(io.BytesIO(response.read()))
    name = next(n for n in archive.namelist() if n.endswith(".xlsx"))
    workbook = openpyxl.load_workbook(io.BytesIO(archive.read(name)), read_only=True)
    rows = workbook.active.iter_rows(values_only=True)
    next(rows)

    entries = []
    for row in rows:
        word, part_of_speech, zipf = row[0], row[9], row[14]
        if not isinstance(word, str) or not isinstance(zipf, float):
            continue
        word = word.strip()
        if not (3 <= len(word) <= 8) or not word.isalpha() or not word.isascii():
            continue
        if not word.islower():
            continue
        entries.append((word, round(zipf, 3), (part_of_speech or "").strip() or "Unclassified"))
    entries.sort(key=lambda entry: -entry[1])

    with OUT.open("w") as handle:
        handle.write("# SUBTLEX-US word frequencies, Zipf scale.\n")
        handle.write("# Brysbaert, M. & New, B. (2009), Behavior Research Methods 41(4), 977-990.\n")
        handle.write("# Zipf scale: van Heuven, Mandera, Keuleers & Brysbaert (2014), QJEP 67(6).\n")
        handle.write(f"# Rebuild with tools/fetch_subtlex.py from {SOURCE}\n")
        handle.write("# word\tzipf\tdominant_part_of_speech\n")
        for word, zipf, part_of_speech in entries:
            handle.write(f"{word}\t{zipf}\t{part_of_speech}\n")
    print(f"wrote {OUT} ({len(entries)} entries)")


if __name__ == "__main__":
    main()
