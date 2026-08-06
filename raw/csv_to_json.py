"""
csv_to_json.py — JPL small-body CSV -> chunked JSON asteroid dataset.

Converts one or more JPL/small-body-database CSV exports (asteroid element
queries) into the chunked JSON format the app's DataLoader expects, plus a
manifest.json describing each dataset's chunks.

This is the pipeline behind the "custom solar system" feature: a user drops
their own JPL query CSV(s) into an input directory and gets back a
dataset directory + manifest that `SystemBuilder`/`DataLoader` can load like
any of the built-in datasets.

CLI usage:
    python csv_to_json.py [--input-dir DIR] [--output-dir DIR]

Defaults to reading *.csv from the current directory and writing to
./json_db, matching the original script's behavior.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

J2000_JD = 2451545.0
CHUNK_SIZE = 5000
REQUIRED_COLUMNS = {"a", "e", "i", "om", "w", "ma", "n", "epoch"}

# MPC provisional designation: a 4-digit year, then a 1-2 letter half-month/
# order code, then an optional cycle number, e.g. "2010 CD2", "2003 CP20".
# Distinguishing this from a permanent number is what keeps
# `parse_name` from mistaking "2010 CD2" (unnumbered) for the plain integer
# 2010 (see the "collapsed provisional designation" bug this guards against).
_PROVISIONAL_DESIGNATION_RE = re.compile(r"^\d{4}\s+[A-Z]{1,2}\d*$")


class UnrecognizedCsvSchemaError(ValueError):
    """Raised when a CSV file is missing expected JPL query columns."""


def parse_float(value: str | None) -> float | None:
    """Safely convert an empty/missing CSV field to None instead of raising."""
    if not value or not value.strip():
        return None
    try:
        return float(value)
    except ValueError:
        return None


def parse_name(row: dict[str, str]) -> str | int:
    """
    Reproduce the original name-parsing rules:
      - prefer 'name', fall back to 'full_name'
      - a leading numeric designation ("588 Achilles") becomes an int (588)
      - an unnamed body with only a provisional designation gets wrapped
        in parentheses, e.g. "2003 CP20" -> "(2003 CP20)"
    """
    raw_name = (row.get("name") or "").strip()
    if not raw_name:
        raw_name = (row.get("full_name") or "").strip()

    if not raw_name:
        return raw_name

    if _PROVISIONAL_DESIGNATION_RE.match(raw_name):
        # Bare provisional designation, no permanent number yet — keep it as
        # a string, wrapped in parens, rather than truncating it to its year.
        return raw_name if raw_name.startswith("(") else f"({raw_name})"

    first_token = raw_name.split()[0]
    if first_token.isdigit():
        return int(first_token)

    if not raw_name.startswith("(") and not (row.get("name") or "").strip():
        return f"({raw_name})"

    return raw_name


def corrected_mean_anomaly(epoch_jd: float, m_epoch_deg: float, n_deg_per_day: float) -> float:
    """
    Rewind a mean anomaly given at some epoch back to J2000, so every body in
    the dataset shares a common reference epoch (matches ARCHITECTURE.md §5.1
    / §1: single fixed-epoch element sets).
    """
    m_j2000 = m_epoch_deg + n_deg_per_day * (J2000_JD - epoch_jd)
    m_corrected = m_j2000 % 360.0
    if m_corrected < 0:
        m_corrected += 360.0
    return round(m_corrected, 5)


def row_to_asteroid_record(row: dict[str, str]) -> dict[str, Any]:
    """Build one asteroid record matching the app's PlanetaryElement-derived JSON schema."""
    epoch_str = row.get("epoch", "")
    m_str = row.get("ma", "")
    n_str = row.get("n", "")

    m_corrected = None
    if epoch_str and m_str and n_str:
        m_corrected = corrected_mean_anomaly(float(epoch_str), float(m_str), float(n_str))

    diameter = parse_float(row.get("diameter"))
    radius = (diameter / 2.0) if diameter else None

    period = parse_float(row.get("per"))

    return {
        "name": parse_name(row),
        "parent": "SUN",
        "category": "ASTEROID",
        "a_au": parse_float(row.get("a")),
        "a_km": None,
        "e": parse_float(row.get("e")),
        "i_deg": parse_float(row.get("i")),
        "w_deg": parse_float(row.get("w")),
        "node_deg": parse_float(row.get("om")),
        "m_deg": m_corrected,
        "period_days": round(period) if period else None,
        "mass_10_24_kg": None,
        "radius_km": radius,
        "pole_ra_deg": None,
        "pole_dec_deg": None,
        "pole_ra_rate_deg_per_cy": None,
        "pole_dec_rate_deg_per_cy": None,
        "pm_w_deg": None,
        "pm_w_rate_deg_per_day": parse_float(row.get("rot_per")),
        "symbol": "\u2022",
    }


@dataclass
class DatasetResult:
    name: str
    total_records: int
    chunk_filenames: list[str]
    skipped_rows: int


def process_csv_rows(rows: list[dict[str, str]]) -> tuple[list[dict[str, Any]], int]:
    """Convert CSV rows to records, skipping (and counting) any that error out."""
    records: list[dict[str, Any]] = []
    skipped = 0
    for row in rows:
        try:
            records.append(row_to_asteroid_record(row))
        except (ValueError, TypeError, KeyError) as exc:
            skipped += 1
            print(f"Skipping row due to missing/bad data: {row.get('full_name')} - Error: {exc}")
    return records, skipped


def write_chunks(dataset_name: str, records: list[dict[str, Any]], output_dir: Path) -> list[str]:
    """Write `records` out in CHUNK_SIZE-record JSON files; return the filenames written."""
    chunk_filenames: list[str] = []
    for i in range(0, len(records), CHUNK_SIZE):
        chunk_index = i // CHUNK_SIZE
        chunk = records[i : i + CHUNK_SIZE]
        filename = f"{dataset_name}_chunk_{chunk_index}.json"
        with open(output_dir / filename, mode="w", encoding="utf-8", newline="") as outfile:
            json.dump(chunk, outfile, indent=2)
            outfile.write("\n")
        chunk_filenames.append(filename)
    return chunk_filenames


def validate_schema(fieldnames: list[str] | None, csv_path: Path) -> None:
    present = set(fieldnames or [])
    missing = REQUIRED_COLUMNS - present
    if missing:
        raise UnrecognizedCsvSchemaError(
            f"{csv_path.name} is missing expected JPL query columns: {sorted(missing)}. "
            "This script converts raw JPL small-body query CSVs (like atira.csv), not "
            "already-converted app-schema CSVs (like planets.csv/moons.csv, which use "
            "a_au/i_deg/node_deg/... instead)."
        )


def process_dataset_file(csv_path: Path, output_dir: Path) -> DatasetResult:
    dataset_name = csv_path.stem.lower()
    with open(csv_path, encoding="utf-8", newline="") as infile:
        reader = csv.DictReader(infile)
        validate_schema(reader.fieldnames, csv_path)
        rows = list(reader)

    records, skipped = process_csv_rows(rows)
    chunk_filenames = write_chunks(dataset_name, records, output_dir)

    return DatasetResult(
        name=dataset_name,
        total_records=len(records),
        chunk_filenames=chunk_filenames,
        skipped_rows=skipped,
    )


def process_datasets(input_dir: str | Path = ".", output_dir: str | Path = "json_db") -> dict:
    """
    Convert every *.csv in `input_dir` into a chunked JSON dataset in
    `output_dir`, and write a manifest.json describing them all.

    Returns the manifest dict that was written, for callers/tests that want
    it without re-reading the file from disk.
    """
    input_dir = Path(input_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest: dict[str, Any] = {"datasets": {}}
    csv_files = sorted(input_dir.glob("*.csv"))

    if not csv_files:
        print(f"No CSV files found in {input_dir}.")
        return manifest

    for csv_path in csv_files:
        print(f"Processing dataset: {csv_path.stem.lower()}...")
        try:
            result = process_dataset_file(csv_path, output_dir)
        except UnrecognizedCsvSchemaError as exc:
            print(f" -> Skipping {csv_path.name}: {exc}")
            continue

        manifest["datasets"][result.name] = {
            "totalRecords": result.total_records,
            "chunks": result.chunk_filenames,
        }

        skip_note = f" ({result.skipped_rows} skipped)" if result.skipped_rows else ""
        print(
            f" -> Completed {result.name}: {result.total_records} records "
            f"across {len(result.chunk_filenames)} chunks{skip_note}."
        )

    manifest_path = output_dir / "manifest.json"
    with open(manifest_path, mode="w", encoding="utf-8", newline="") as manifest_file:
        json.dump(manifest, manifest_file, indent=2)
        manifest_file.write("\n")

    print(f"\nAll datasets processed successfully. Manifest written to {manifest_path}.")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-dir", default=".", help="Directory to read *.csv from")
    parser.add_argument("--output-dir", default="json_db", help="Directory to write JSON to")
    args = parser.parse_args()
    process_datasets(args.input_dir, args.output_dir)


if __name__ == "__main__":
    main()
