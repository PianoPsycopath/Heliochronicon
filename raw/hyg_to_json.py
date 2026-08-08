"""
hyg_to_json.py — HYG Star Database CSV -> chunked JSON dataset.

Converts the HYG database (hyg_v42.csv) into chunked JSON files, grouped by
sky region (constellation). Includes proper motion velocity vectors (vx, vy, vz).
Outputs a manifest describing the chunks grouped by constellation.
"""

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path

CHUNK_SIZE = 5000


def parse_float(value: str) -> float | None:
    """Safely convert an empty/missing CSV field to None."""
    if not value or not value.strip():
        return None
    try:
        return float(value)
    except ValueError:
        return None


def process_hyg_csv(input_csv: Path, output_dir: Path):
    output_dir.mkdir(parents=True, exist_ok=True)

    manifest = {"datasets": {}}
    constellations = defaultdict(list)
    skipped = 0

    print(f"Reading {input_csv.name}...")
    with open(input_csv, encoding="utf-8", newline="") as infile:
        reader = csv.DictReader(infile)
        for row in reader:
            try:
                # Grouping by the IAU constellation abbreviation
                con = (row.get("con") or "UNK").strip()
                proper_name = (row.get("proper") or "").strip()
                hip_id = (row.get("hip") or "").strip()

                # Priority: Proper Name -> HIP ID -> Generic HYG ID
                if proper_name:
                    name = proper_name
                elif hip_id:
                    name = f"HIP {hip_id}"
                else:
                    name = f"HYG {row.get('id')}"

                record = {
                    "name": name,
                    "category": "STAR",
                    "con": con,
                    "x": parse_float(row.get("x")),  # Parsecs
                    "y": parse_float(row.get("y")),  # Parsecs
                    "z": parse_float(row.get("z")),  # Parsecs
                    "vx": parse_float(row.get("vx")),  # Parsecs per year
                    "vy": parse_float(row.get("vy")),  # Parsecs per year
                    "vz": parse_float(row.get("vz")),  # Parsecs per year
                    "mag": parse_float(row.get("mag")),  # Visual magnitude for size
                    "ci": parse_float(row.get("ci")),  # Color Index for temperature
                }
                constellations[con].append(record)
            except Exception:
                skipped += 1

    print(
        f"Finished reading. Grouped into {len(constellations)} "
        f"constellations. Skipped {skipped} rows."
    )

    for con, records in constellations.items():
        dataset_name = f"stars_{con.lower()}"

        # Sort by magnitude (brightest first) so LOD can prioritize rendering them
        records.sort(key=lambda r: r["mag"] if r["mag"] is not None else 999.0)

        chunk_filenames = []
        for i in range(0, len(records), CHUNK_SIZE):
            chunk_index = i // CHUNK_SIZE
            chunk = records[i : i + CHUNK_SIZE]
            filename = f"{dataset_name}_chunk_{chunk_index}.json"

            with open(output_dir / filename, mode="w", encoding="utf-8", newline="") as outfile:
                json.dump(chunk, outfile, indent=2)
                outfile.write("\n")

            chunk_filenames.append(filename)

        # Build the manifest entry grouping the constellation chunks
        manifest["datasets"][dataset_name] = {
            "totalRecords": len(records),
            "chunks": chunk_filenames,
        }
        print(
            f" -> Completed {dataset_name}: {len(records)} records "
            f"across {len(chunk_filenames)} chunks."
        )

    manifest_path = output_dir / "stars_manifest.json"
    with open(manifest_path, mode="w", encoding="utf-8", newline="") as manifest_file:
        json.dump(manifest, manifest_file, indent=2)
        manifest_file.write("\n")

    print(f"\nAll datasets processed successfully. Manifest written to {manifest_path}.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input-file", default="hyg_v42.csv", help="Path to HYG CSV file")
    parser.add_argument("--output-dir", default="star_data", help="Directory to write JSON to")
    args = parser.parse_args()

    input_path = Path(args.input_file)
    if not input_path.exists():
        print(f"Error: {input_path} not found.")
        return

    process_hyg_csv(input_path, Path(args.output_dir))


if __name__ == "__main__":
    main()
