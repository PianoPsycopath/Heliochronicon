import os
import csv
import json
import struct
import math
import glob
import time
import random
import shutil
import argparse
import multiprocessing as mp
import rebound

CHUNK_SIZE = 256
OUTPUT_DIR = "binary_db"
J2000_JD = 2451545.0

YEARS_START = 0
YEARS_END = 4000
RECORD_STEP_YEARS = 10
DAYS_PER_YEAR = 365.25

JD_START = 1721425.5
JD_END = JD_START + (YEARS_END * DAYS_PER_YEAR)
RECORD_STEP_JD = RECORD_STEP_YEARS * DAYS_PER_YEAR
RECORDED_FRAMES = int(YEARS_END / RECORD_STEP_YEARS) + 1
DT_SAFETY_FACTOR = 20
NUM_WORKERS = os.cpu_count() or 1

# How often (in frames) a group persists its progress to disk. Lower =
# less work lost on a crash/interrupt, higher = less I/O overhead.
CHECKPOINT_EVERY_FRAMES = 25

EXPECTED_INTEGRATOR = "whfast" #MERCURIAN also works but has longterm precision errors?

STATIC_DATASETS = {
    "planets.csv": "PLANET",
    "moons.csv": "MOON"
}

PLANET_SMA_AU_FOR_DT = {
    "Venus": 0.723, "Earth": 1.000, "Mars": 1.524, "Jupiter": 5.204,
    "Saturn": 9.583, "Uranus": 19.191, "Neptune": 30.07,
}
PLANETS = ["Sun", "Venus", "Earth", "Mars", "Jupiter", "Saturn", "Uranus", "Neptune"]

def parse_float(value):
    if not value or not str(value).strip() or str(value).strip() == '*':
        return None
    try:
        return float(value)
    except ValueError:
        return None

def period_days(a_au):
    return DAYS_PER_YEAR * (a_au ** 1.5)

def build_base_solar_system(dt_days):
    print("[*] Contacting NASA Horizons to build Base Solar System at J2000...")
    sim = rebound.Simulation()
    sim.units = ('AU', 'days', 'Msun')
    sim.t = J2000_JD
    sim.integrator = "whfast"
    try:
        sim.integrator.corrector = 11
    except AttributeError:
        sim.ri_whfast.corrector = 11
    sim.dt = dt_days

    for planet in PLANETS:
        sim.add(planet)

    sim.move_to_com()
    base_sim_file = os.path.join(os.getcwd(), OUTPUT_DIR, "_base_sim_cache.bin")
    sim.save_to_file(base_sim_file, delete_file=True)
    return base_sim_file

def _propagate_worker(args):
    """
    Worker function to integrate a single epoch group to J2000.
    Returns the updated orbital elements to be applied by the main process.
    """
    base_sim_file, epoch, entries, j2000_jd = args

    sim = rebound.Simulation(base_sim_file)
    sim.integrate(epoch)

    start_idx = sim.N
    for dataset_name, i, ast in entries:
        a, e, inc, Omega, omega, M = ast["elements_native"]
        sim.add(m=0, a=a, e=e, inc=inc, Omega=Omega, omega=omega, M=M, primary=sim.particles[0])

    sim.integrate(j2000_jd)

    orbits = sim.orbits(primary=sim.particles[0])

    results = []
    for offset, (dataset_name, i, ast) in enumerate(entries):
        orb = orbits[start_idx - 1 + offset]
        results.append((
            dataset_name,
            i,
            (orb.a, orb.e, orb.inc, orb.Omega, orb.omega, orb.M)
        ))

    return epoch, results

def propagate_to_j2000(base_sim_file, all_datasets, num_workers):
    by_epoch = {}
    for dataset_name, asteroids in all_datasets.items():
        for i, ast in enumerate(asteroids):
            by_epoch.setdefault(ast["epoch"], []).append((dataset_name, i, ast))

    total = sum(len(v) for v in by_epoch.values())
    total_epochs = len(by_epoch)

    PROP_CHUNK_SIZE = 250
    tasks = []
    for epoch, entries in by_epoch.items():
        for i in range(0, len(entries), PROP_CHUNK_SIZE):
            tasks.append((base_sim_file, epoch, entries[i:i + PROP_CHUNK_SIZE], J2000_JD))

    total_tasks = len(tasks)

    print(f"[*] Propagating {total} asteroid(s) across {total_epochs} unique epoch(s)...")
    print(f"[*] Split into {total_tasks} worker tasks to prevent bottlenecks.")

    done_tasks = 0
    t0 = time.time()

    with mp.Pool(processes=num_workers) as pool:
        for epoch, results in pool.imap_unordered(_propagate_worker, tasks):

            for dataset_name, i, elements_j2000 in results:
                all_datasets[dataset_name][i]["elements_j2000"] = elements_j2000

            done_tasks += 1
            timestamp = time.strftime('%H:%M:%S')

            print(f"\r  [{timestamp}] -> Integrated task {done_tasks}/{total_tasks}", end="", flush=True)

    print(f"\n[+] J2000 Propagation complete in {time.time() - t0:.1f}s")

def process_static_dataset(csv_file, category, output_dir):
    """Bypasses integration. Converts CSV data directly to a single-frame binary file."""
    dataset_name = "planets" if category == "PLANET" else "moons"
    bin_filename = f"{dataset_name}_chunk_0.bin"
    json_filename = f"{dataset_name}_chunk_0.json"

    static_json_data = []
    processed_count = 0

    with open(csv_file, mode='r', encoding='utf-8') as infile, \
         open(os.path.join(output_dir, bin_filename), 'wb') as f_bin:

        reader = csv.DictReader(infile)
        for row in reader:
            is_moon = category == 'MOON'
            a_au = parse_float(row.get('a_au'))
            a_km = parse_float(row.get('a_km'))

            a = 0.0
            if is_moon and a_km is not None:
                a = a_km / 149597870.7
            elif a_au is not None:
                a = a_au

            e = parse_float(row.get('e')) or 0.0
            i_deg = parse_float(row.get('i_deg')) or 0.0
            w_deg = parse_float(row.get('w_deg')) or 0.0
            node_deg = parse_float(row.get('node_deg')) or 0.0
            m_deg = parse_float(row.get('m_deg')) or 0.0

            packed_bytes = struct.pack('6f',
                a, e, math.radians(i_deg),
                math.radians(node_deg), math.radians(w_deg), math.radians(m_deg)
            )
            f_bin.write(packed_bytes)

            metadata_entry = {
                "name": row.get('name'),
                "parent": row.get('parent') or 'SUN',
                "category": row.get('category') or category,
                "radius_km": parse_float(row.get('radius_km')),
                "mass_10_24_kg": parse_float(row.get('mass_10_24_kg')),
                "symbol": row.get('symbol') or ("○" if is_moon else "•"),
                "pole_ra_deg": parse_float(row.get('pole_ra_deg')),
                "pole_dec_deg": parse_float(row.get('pole_dec_deg')),
                "pole_ra_rate_deg_per_cy": parse_float(row.get('pole_ra_rate_deg_per_cy')),
                "pole_dec_rate_deg_per_cy": parse_float(row.get('pole_dec_rate_deg_per_cy')),
                "pm_w_deg": parse_float(row.get('pm_w_deg')),
                "pm_w_rate_deg_per_day": parse_float(row.get('pm_w_rate_deg_per_day')),
                "period_days": parse_float(row.get('period_days')),
                "timeline_offset": processed_count * 24
            }
            static_json_data.append(metadata_entry)
            processed_count += 1

    with open(os.path.join(output_dir, json_filename), 'w', encoding='utf-8') as f_json:
        json.dump(static_json_data, f_json, indent=2)

    return {
        "metadata": json_filename,
        "binary": bin_filename,
        "particle_count": processed_count
    }

def read_dataset(csv_file):
    dataset_name = os.path.splitext(os.path.basename(csv_file))[0].lower()
    asteroids = []
    with open(csv_file, mode='r', encoding='utf-8') as infile:
        reader = csv.DictReader(infile)
        for row in reader:
            a = parse_float(row.get('a'))
            e = parse_float(row.get('e'))
            inc = parse_float(row.get('i'))
            omega = parse_float(row.get('w'))
            Omega = parse_float(row.get('om'))
            M = parse_float(row.get('ma'))
            epoch_str = parse_float(row.get('epoch'))
            n_str = parse_float(row.get('n'))

            if None in (a, e, inc, omega, Omega, M, epoch_str, n_str):
                continue
            if a <= 0:
                continue

            raw_name = (row.get('name') or '').strip() or (row.get('full_name') or '').strip()
            name_parts = raw_name.split()
            name_val = int(name_parts[0]) if name_parts and name_parts[0].isdigit() else f"({raw_name})"
            diameter = parse_float(row.get('diameter'))

            asteroids.append({
                "name": name_val,
                "radius_km": (diameter / 2.0) if diameter else None,
                "a": a,
                "epoch": epoch_str,
                "elements_native": (a, e, math.radians(inc), math.radians(Omega),
                                     math.radians(omega), math.radians(M)),
            })
    return dataset_name, asteroids

def chunk_dataset(asteroids, chunk_size=CHUNK_SIZE):
    return [asteroids[i:i + chunk_size] for i in range(0, len(asteroids), chunk_size)]

def build_work_items(all_datasets, chunk_size=CHUNK_SIZE):
    work_items = []
    manifest = {"datasets": {}}
    for dataset_name, asteroids in all_datasets.items():
        chunks = chunk_dataset(asteroids, chunk_size)
        manifest_chunks = []
        for chunk_index, chunk_data in enumerate(chunks):
            bin_filename = f"{dataset_name}_chunk_{chunk_index}.bin"
            json_filename = f"{dataset_name}_chunk_{chunk_index}.json"
            work_items.append({
                "dataset_name": dataset_name,
                "chunk_index": chunk_index,
                "asteroids": chunk_data,
                "bin_filename": bin_filename,
            })
            manifest_chunks.append({
                "metadata": json_filename,
                "binary": bin_filename,
                "particle_count": len(chunk_data),
            })
        manifest["datasets"][dataset_name] = {
            "totalRecords": len(asteroids),
            "chunks": manifest_chunks,
        }
    return work_items, manifest

def write_json_metadata(work_items, output_dir):
    for item in work_items:
        static_json_data = []
        for ast_index, ast in enumerate(item["asteroids"]):
            static_json_data.append({
                "name": ast["name"],
                "radius_km": ast["radius_km"],
                "timeline_offset": ast_index * 24,
            })
        json_filename = f"{item['dataset_name']}_chunk_{item['chunk_index']}.json"
        with open(os.path.join(output_dir, json_filename), 'w', encoding='utf-8') as f_json:
            json.dump(static_json_data, f_json, indent=2)

def assign_to_workers(work_items, num_workers):
    groups = [[] for _ in range(num_workers)]
    loads = [0] * num_workers
    for item in sorted(work_items, key=lambda it: len(it["asteroids"]), reverse=True):
        i = loads.index(min(loads))
        groups[i].append(item)
        loads[i] += len(item["asteroids"])
    return [g for g in groups if g]

def load_or_create_groups(work_items, num_workers, checkpoint_dir):
    os.makedirs(checkpoint_dir, exist_ok=True)
    manifest_path = os.path.join(checkpoint_dir, "groups.json")
    item_by_bin = {item["bin_filename"]: item for item in work_items}

    if os.path.exists(manifest_path):
        with open(manifest_path, "r", encoding="utf-8") as f:
            saved = json.load(f)
        groups = []
        for bin_list in saved["groups"]:
            groups.append([item_by_bin[b] for b in bin_list if b in item_by_bin])
        groups = [g for g in groups if g]
        print(f"[*] Reusing saved chunk grouping from a previous run ({len(groups)} group(s)).")
        return groups

    groups = assign_to_workers(work_items, num_workers)
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump({"groups": [[item["bin_filename"] for item in g] for g in groups]}, f)
    return groups

def integrate_group(base_sim_file, group_items, output_dir, group_id, progress_cb=None):
    group_ckpt_dir = os.path.join(output_dir, "_checkpoints", group_id)
    os.makedirs(group_ckpt_dir, exist_ok=True)
    progress_path = os.path.join(group_ckpt_dir, "progress.json")
    sim_ckpt_path = os.path.join(group_ckpt_dir, "sim.bin")
    done_marker = os.path.join(group_ckpt_dir, "_DONE")

    already_done = os.path.exists(done_marker)
    if already_done:
        summary = [(item["dataset_name"], item["chunk_index"], len(item["asteroids"])) for item in group_items]
        return summary, 0.0

    resume_frame = 0
    sim = None

    if os.path.exists(progress_path) and os.path.exists(sim_ckpt_path):
        try:
            with open(progress_path, "r", encoding="utf-8") as f:
                progress = json.load(f)
            candidate_sim = rebound.Simulation(sim_ckpt_path)
            resumed_integrator = str(candidate_sim.integrator).lower()
            if EXPECTED_INTEGRATOR not in resumed_integrator:
                print(f"[!] {group_id}: checkpoint was saved with a different integrator "
                      f"({candidate_sim.integrator!r}, expected something containing "
                      f"{EXPECTED_INTEGRATOR!r}) -- this looks like a stale checkpoint from "
                      f"before an integrator change. Discarding it and starting this group over.")
            else:
                resume_frame = progress["frame"]
                sim = candidate_sim
                print(f"[*] {group_id}: resuming from frame {resume_frame}/{RECORDED_FRAMES}")
        except Exception as exc:
            print(f"[!] {group_id}: checkpoint unreadable ({exc}), starting this group over.")
            sim = None
            resume_frame = 0

    if sim is None:
        sim = rebound.Simulation(base_sim_file)
        for item in group_items:
            for ast in item["asteroids"]:
                a, e, inc, Omega, omega, M = ast["elements_j2000"]
                sim.add(m=0, a=a, e=e, inc=inc, Omega=Omega, omega=omega, M=M, primary=sim.particles[0])
        sim.integrate(JD_START)

    boundaries = []
    idx = sim.N - sum(len(item["asteroids"]) for item in group_items)
    for item in group_items:
        start_idx = idx
        count = len(item["asteroids"])
        boundaries.append((item, start_idx, count))
        idx += count

    file_handles = {}
    for item, _, count in boundaries:
        path = os.path.join(group_ckpt_dir, item["bin_filename"])
        mode = "r+b" if os.path.exists(path) else "wb"
        fh = open(path, mode)
        fh.seek(resume_frame * count * 24)
        fh.truncate()
        file_handles[item["bin_filename"]] = fh

    t_start = time.time()
    current_jd = JD_START
    for frame in range(resume_frame, RECORDED_FRAMES):
        if frame > 0:
            current_jd = JD_START + frame * RECORD_STEP_JD
            sim.integrate(current_jd)

        orbits = sim.orbits(primary=sim.particles[0])

        for item, start_idx, count in boundaries:
            fh = file_handles[item["bin_filename"]]
            buf = bytearray()
            for p_off in range(count):
                orb = orbits[start_idx - 1 + p_off]
                buf += struct.pack('6f', orb.a, orb.e, orb.inc, orb.Omega, orb.omega, orb.M)
            fh.write(buf)

        if progress_cb is not None:
            progress_cb(frame + 1, RECORDED_FRAMES)

        is_last_frame = (frame == RECORDED_FRAMES - 1)
        if (frame + 1) % CHECKPOINT_EVERY_FRAMES == 0 or is_last_frame:
            for fh in file_handles.values():
                fh.flush()
                os.fsync(fh.fileno())
            sim.save_to_file(sim_ckpt_path, delete_file=True)
            tmp_progress = progress_path + ".tmp"
            with open(tmp_progress, "w", encoding="utf-8") as f:
                json.dump({"frame": frame + 1}, f)
            os.replace(tmp_progress, progress_path)

    for fh in file_handles.values():
        fh.close()

    for item, _, _ in boundaries:
        src = os.path.join(group_ckpt_dir, item["bin_filename"])
        dst = os.path.join(output_dir, item["bin_filename"])
        shutil.move(src, dst)

    for path in (sim_ckpt_path, progress_path):
        if os.path.exists(path):
            os.remove(path)
    open(done_marker, "w").close()

    elapsed = time.time() - t_start
    summary = [(item["dataset_name"], item["chunk_index"], len(item["asteroids"])) for item, _, _ in boundaries]
    return summary, elapsed

def _worker_entrypoint(args):
    return integrate_group(*args)

def run_integration(base_sim_file, work_items, output_dir, num_workers):
    total_chunks = len(work_items)
    if total_chunks == 0:
        return

    checkpoint_dir = os.path.join(output_dir, "_checkpoints")
    groups = load_or_create_groups(work_items, num_workers, checkpoint_dir)
    total_groups = len(groups)

    print(f"[*] {total_chunks} chunk(s) -> {total_groups} group(s) "
          f"(requested {num_workers} worker process(es)). "
          f"Fewer chunks than workers means some cores will sit idle -- "
          f"lower --chunk-size to split work more finely if you want full utilization.")

    if total_groups <= 1:
        group_id = "group_000"

        def cb(frame, total):
            step = max(1, total // 20)
            if frame % step == 0 or frame == total:
                pct = 100 * frame / total
                print(f"\r  -> Integrating [{frame}/{total} frames] {pct:5.1f}%", end="", flush=True)

        print(f"[*] Integrating {sum(len(w['asteroids']) for w in work_items)} particles in a single process...")
        _, elapsed = integrate_group(base_sim_file, groups[0], output_dir, group_id, progress_cb=cb)
        print(f"\n[+] Integration complete in {elapsed:.1f}s")
        return

    tasks = [(base_sim_file, g, output_dir, f"group_{i:03d}") for i, g in enumerate(groups)]
    print(f"[*] Dispatching {total_groups} group(s) across up to {num_workers} worker process(es)...")

    done_chunks = 0
    t0 = time.time()
    with mp.Pool(processes=min(num_workers, total_groups)) as pool:
        for group_result, elapsed in pool.imap_unordered(_worker_entrypoint, tasks):
            for dataset_name, chunk_index, n_particles in group_result:
                done_chunks += 1
                print(f"    [{done_chunks}/{total_chunks}] {dataset_name}_chunk_{chunk_index} ({n_particles} particles) done")
    print(f"[+] All workers finished in {time.time() - t0:.1f}s")

def process_and_integrate(sample=None, fresh=False, num_workers=NUM_WORKERS, chunk_size=CHUNK_SIZE):
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    checkpoint_dir = os.path.join(OUTPUT_DIR, "_checkpoints")
    if fresh and os.path.exists(checkpoint_dir):
        print("[*] --fresh: clearing previous checkpoints and grouping...")
        shutil.rmtree(checkpoint_dir)


    # run must reproduce the same groups.json.
    csv_files = sorted(glob.glob("*.csv"))

    if not csv_files:
        print("No CSV files found.")
        return

    all_datasets = {}
    global_min_a = None
    static_chunks = {}
    remaining_csvs = []

    for csv_file in csv_files:
        basename = os.path.basename(csv_file)
        if basename in STATIC_DATASETS:
            category = STATIC_DATASETS[basename]
            chunk_info = process_static_dataset(csv_file, category, OUTPUT_DIR)
            dataset_name = "planets" if category == "PLANET" else "moons"
            static_chunks[dataset_name] = chunk_info
            print(f"[*] {dataset_name.upper()}: {chunk_info['particle_count']} static records packed to binary.")
        else:
            remaining_csvs.append(csv_file)

    for csv_file in remaining_csvs:
        dataset_name, asteroids = read_dataset(csv_file)
        if sample is not None and len(asteroids) > sample:
            asteroids = random.Random(42).sample(asteroids, sample)
            print(f"[*] {dataset_name}: {len(asteroids)} usable asteroid(s) [SAMPLE MODE, capped to {sample}]")
        else:
            print(f"[*] {dataset_name}: {len(asteroids)} usable asteroid(s)")
        all_datasets[dataset_name] = asteroids
        if asteroids:
            local_min = min(a["a"] for a in asteroids)
            global_min_a = local_min if global_min_a is None else min(global_min_a, local_min)

    if global_min_a is not None:
        smallest_a = min([global_min_a] + list(PLANET_SMA_AU_FOR_DT.values()))
        dt_days = period_days(smallest_a) / DT_SAFETY_FACTOR
        base_sim_file = build_base_solar_system(dt_days)
        propagate_to_j2000(base_sim_file, all_datasets, num_workers)
    else:
        base_sim_file = None

    work_items, manifest = build_work_items(all_datasets, chunk_size)

    for dataset_name, chunk_info in static_chunks.items():
        manifest["datasets"][dataset_name] = {
            "totalRecords": chunk_info["particle_count"],
            "chunks": [chunk_info]
        }

    if work_items:
        write_json_metadata(work_items, OUTPUT_DIR)
        run_integration(base_sim_file, work_items, OUTPUT_DIR, num_workers)

    with open(os.path.join(OUTPUT_DIR, "manifest.json"), 'w', encoding='utf-8') as f_manifest:
        json.dump(manifest, f_manifest, indent=2)

    if base_sim_file and os.path.exists(base_sim_file):
        os.remove(base_sim_file)

    # .bin/.json chunk files and manifest.json.
    if os.path.exists(checkpoint_dir):
        shutil.rmtree(checkpoint_dir, ignore_errors=True)

    print("\n[+] Binary database generated successfully.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build the binary orbit database.")
    parser.add_argument("--sample", type=int, default=None,
                        help="Limit each dataset to N randomly-sampled asteroids, for a quick test run.")
    parser.add_argument("--fresh", action="store_true",
                        help="Ignore any existing checkpoints/grouping and start completely over.")
    parser.add_argument("--workers", type=int, default=None,
                        help="Number of worker processes (default: all CPU cores).")
    parser.add_argument("--chunk-size", type=int, default=CHUNK_SIZE,
                        help=f"Asteroids per chunk (default: {CHUNK_SIZE}). Lower this for small "
                             f"--sample test runs so the work actually splits across all your cores.")
    args = parser.parse_args()

    process_and_integrate(
        sample=args.sample,
        fresh=args.fresh,
        num_workers=args.workers or NUM_WORKERS,
        chunk_size=args.chunk_size,
    )