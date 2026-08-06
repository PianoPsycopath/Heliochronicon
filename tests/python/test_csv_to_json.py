from pathlib import Path

import pytest

from raw.csv_to_json import (
    corrected_mean_anomaly,
    parse_float,
    parse_name,
    process_datasets,
)

FIXTURES_DIR = Path(__file__).parent / "fixtures"
EXPECTED_DIR = FIXTURES_DIR / "expected_json_db"


# --- parse_float -------------------------------------------------------


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("1.5", 1.5),
        ("", None),
        ("   ", None),
        (None, None),
        ("not_a_number", None),
    ],
)
def test_parse_float(raw, expected):
    assert parse_float(raw) == expected


# --- parse_name ----------------------------------------------------------


def test_process_datasets_rejects_app_schema_csv(tmp_path):
    """
    Regression test: pointing this at an already-converted app-schema CSV
    (planets.csv/moons.csv use a_au/i_deg/node_deg/... instead of the JPL
    query columns a/i/om/.../epoch this script expects) used to silently
    succeed and write a file full of nulls with every body mislabeled
    "category": "ASTEROID". It should now be skipped with a clear message
    and produce no chunk file for it, instead of corrupt output.
    """
    input_dir = tmp_path / "in"
    input_dir.mkdir()
    (input_dir / "planets.csv").write_text(
        "name,parent,category,a_au,e,i_deg\nSUN,SUN,PLANET,0,0,0\n",
        encoding="utf-8",
    )
    output_dir = tmp_path / "json_db"

    manifest = process_datasets(input_dir=input_dir, output_dir=output_dir)

    assert manifest == {"datasets": {}}
    assert not (output_dir / "planets_chunk_0.json").exists()


def test_parse_name_prefers_name_field_over_full_name():
    row = {"name": "Atira", "full_name": "163693 Atira (2003 CP20)"}
    assert parse_name(row) == "Atira"


def test_parse_name_permanent_number_becomes_int():
    row = {"name": "", "full_name": "164294 (2004 XZ130)"}
    assert parse_name(row) == 164294


def test_parse_name_bare_provisional_designation_stays_a_string():
    """
    Regression test: a not-yet-numbered object's designation starts with a
    4-digit year ("2010 CD2"), which used to be misread as a permanent
    number and collapsed to the int 2010, discarding "CD2" and colliding
    with every other object discovered the same year.
    """
    row = {"name": "", "full_name": "2010 CD2"}
    assert parse_name(row) == "(2010 CD2)"


def test_parse_name_already_parenthesized_designation_is_not_double_wrapped():
    row = {"name": "", "full_name": "(2010 AB1)"}
    assert parse_name(row) == "(2010 AB1)"


def test_parse_name_missing_entirely():
    assert parse_name({"name": "", "full_name": ""}) == ""


# --- corrected_mean_anomaly ------------------------------------------------


def test_corrected_mean_anomaly_at_j2000_epoch_is_unchanged():
    # epoch == J2000_JD, so no rewinding happens
    assert corrected_mean_anomaly(2451545.0, 42.0, 1.0) == 42.0


def test_corrected_mean_anomaly_wraps_into_0_360_range():
    result = corrected_mean_anomaly(2461200.5, 346.32, 1.545)
    assert 0.0 <= result < 360.0


# --- golden-file integration test ------------------------------------------


def test_process_datasets_matches_golden_output(tmp_path):
    """
    Runs the full pipeline against a fixture CSV (three real rows pulled
    from raw/atira.csv, plus synthetic rows covering the parenthesized-
    designation, provisional-designation, missing-epoch, and bad-epoch
    edge cases) and diffs the output byte-for-byte against checked-in
    golden files.

    If this test fails after an intentional change to the output schema or
    formatting, regenerate the golden files with:

        python raw/csv_to_json.py --input-dir tests/python/fixtures \\
            --output-dir tests/python/fixtures/expected_json_db

    and review the diff before committing it.
    """
    output_dir = tmp_path / "json_db"
    process_datasets(input_dir=FIXTURES_DIR, output_dir=output_dir)

    produced_chunk = output_dir / "sample_asteroids_chunk_0.json"
    produced_manifest = output_dir / "manifest.json"

    expected_chunk = EXPECTED_DIR / "sample_asteroids_chunk_0.json"
    expected_manifest = EXPECTED_DIR / "manifest.json"

    assert produced_chunk.read_bytes() == expected_chunk.read_bytes()
    assert produced_manifest.read_bytes() == expected_manifest.read_bytes()


def test_process_datasets_skips_bad_rows_without_crashing(tmp_path):
    output_dir = tmp_path / "json_db"
    manifest = process_datasets(input_dir=FIXTURES_DIR, output_dir=output_dir)

    # 7 rows in the fixture, 1 has an unparseable epoch and is skipped
    assert manifest["datasets"]["sample_asteroids"]["totalRecords"] == 6


def test_process_datasets_empty_input_dir_writes_empty_manifest(tmp_path):
    empty_dir = tmp_path / "empty"
    empty_dir.mkdir()
    output_dir = tmp_path / "json_db"

    manifest = process_datasets(input_dir=empty_dir, output_dir=output_dir)

    assert manifest == {"datasets": {}}
    # No CSVs found means we return early — no output dir/manifest written
    assert not (output_dir / "manifest.json").exists()
