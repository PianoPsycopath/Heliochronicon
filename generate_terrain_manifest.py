# generate_terrain_manifest.py — run from repo root after
# adding/updating any body's heightmap folder
import json
from pathlib import Path

HEIGHTMAPS_DIR = Path("public/data/heightmaps")
OUTPUT_FILE = HEIGHTMAPS_DIR / "manifest.json"

manifest = {}

for folder in sorted(HEIGHTMAPS_DIR.iterdir()):
    if not folder.is_dir():
        continue

    png_path = folder / "global_rg.png"
    meta_path = folder / "meta.json"

    if not png_path.exists():
        print(f"skip {folder.name}: no global_rg.png yet")
        continue
    if not meta_path.exists():
        print(f"skip {folder.name}: no meta.json (elevMin/elevMax)")
        continue

    meta = json.loads(meta_path.read_text())
    body_name = folder.name.upper()  # matches DataLoader's uppercased body names

    manifest[body_name] = {
        "url": f"data/heightmaps/{folder.name}/global_rg.png",
        "elevMin": meta["elevMin"],
        "elevMax": meta["elevMax"],
    }

OUTPUT_FILE.write_text(json.dumps(manifest, indent=2))
print(f"Wrote {OUTPUT_FILE} with {len(manifest)} bodies: {list(manifest.keys())}")
