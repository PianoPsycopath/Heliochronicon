# Heliochronicon

[![CI](https://github.com/PianoPsycopath/Heliochronicon/actions/workflows/ci.yml/badge.svg)](https://github.com/PianoPsycopath/Heliochronicon/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**A 3D temporal celestial note-taking platform scaled ad infinitum**

Heliochronicon is an interactive solar-system simulator and world-building tool. Explore a realistic Keplerian model of the solar system, scan and promote asteroids from GPU-instanced populations of millions of objects, scrub time between roughly 0–4000 AD, and attach notes to moving bodies.

**Live Demo:** [heliochronicon.vercel.app](https://heliochronicon.vercel.app/)

<img width="1920" height="1080" alt="Heliochronicon overview" src="https://github.com/user-attachments/assets/52db9637-814d-4f48-87cc-2405fcd34db9" />

https://github.com/user-attachments/assets/f6e6d0fc-b183-43d4-a857-f2065daeb7be

## Features

- **Keplerian orbital propagation** — Elements sourced from NASA JPL Horizons (themselves N-body integrated). Runtime uses pure two-body Keplerian mechanics; see [Known Limitations](#known-limitations).
- **Million-scale asteroid visualization** — GPU instancing streams large asteroid populations without traditional WebGL object-count limits.
- **Tactical scanning** — Scan near the camera or a target, promote interesting objects to persistent CPU meshes, and track them.
- **Temporal controls** — Chronometer with variable time scales for orbital evolution.
- **Group labeling & datasets** — Color-coded asteroid populations (TNOs, Apollo, Amor, etc.) with 3D group labels.
- **Telemetry & targeting** — Real-time readouts for selected bodies; camera tracking and hard-lock focus.
- **Custom systems** — CSV → JSON pipeline for loading alternate solar systems (examples included).

<img width="1920" height="1080" alt="Asteroid scan view" src="https://github.com/user-attachments/assets/6dac736d-15cf-4d30-ae1e-957eb1a621bc" />

<img width="1920" height="1080" alt="Telemetry and controls" src="https://github.com/user-attachments/assets/c02dfabb-d88f-4b09-b9a0-44a221133f3a" />

## Technical Highlights

- **Data pipeline:** NASA Horizons → CSV parsing → JSON datasets / chunked asteroid buffers → WebGL `InstancedMesh`.
- **Performance:** Binary-friendly array handling and GPU instancing to stay within 32-bit WebGL constraints while rendering large populations.
- **Architecture:** Vite + ES modules, Three.js, pure orbital-math modules under test, frame pipeline extracted from the main loop, centralized `CelestialBody` factory, and a thin persistence layer. See [`ARCHITECTURE.md`](ARCHITECTURE.md) for the full system map.

## Quick Start

```bash
git clone https://github.com/PianoPsycopath/Heliochronicon.git
cd Heliochronicon
npm install
npm run dev
```

Opens at `http://localhost:5173` by default.

### Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite development server with HMR |
| `npm run build` | Production build → `dist/` |
| `npm run lint` | ESLint on `js/` |
| `npm test` | Vitest unit suite (orbital math, data parsing, storage, etc.) |
| `npm run format` | Prettier write |

### Custom / test data (optional)

```bash
pip install -e ".[dev]"
# Place CSVs in raw/ (examples: atira.csv, kerbin_system.csv)
cd raw && python csv_to_json.py && cd ..
npm run dev
```

In the browser console:

- `resetDataSource()` — restore default solar system from `public/data/`
- `switchDataSource('raw/json_db/')` — load generated test data

## Known Limitations

Orbital positions are propagated with **two-body Keplerian mechanics from a single fixed-epoch element set per body**. No continuous N-body integration or secular perturbation terms are applied at runtime.

This is accurate to roughly **±40 years around the element epoch** (~80-year useful window) and degrades outside it. This is a deliberate scope decision, not a bug. The longer-term path (multi-epoch element sets) is documented in [`ARCHITECTURE.md`](ARCHITECTURE.md) §1 and §6 and is currently paused.

## Testing & CI

- **JavaScript:** Vitest covers pure orbital math (`solveKepler`, `calcPosFromM`), data parsing, storage abstraction, and other extracted pure logic. `npm test`.
- **Python:** `pytest` golden-file tests for the CSV→JSON pipeline; `ruff` + `black --check` for style.
- **CI:** On every push/PR to `main`, GitHub Actions runs install → lint → Vitest → build, plus the Python pipeline checks. See [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Documentation

| Document | Purpose |
|----------|---------|
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the system actually works today — data model, runtime wiring, known debt |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Conventions, workflow, and how to work on the codebase |
| [`CHANGELOG.md`](CHANGELOG.md) | Notable changes by version |

## What's next

Cleanup Phases 0–6 are complete (module graph, tested orbital math, data layer, frame pipeline, UI decomposition, storage abstraction, Python pipeline hardening). Remaining polish and feature work is tracked in GitHub Issues / Projects. High-level ideas (delta-V heatmaps, torchship routing, day/night & eclipses, accessibility, etc.) live in the project roadmap notes.

## Credits & Data Sources

- Orbital data from [NASA Horizons](https://ssd.jpl.nasa.gov/horizons/) and related ephemerides.
- Pre-computation tooling previously used REBOUND (Python); the live app does not run N-body at runtime.
- Rendering via [Three.js](https://threejs.org/).

**NASA Disclaimer:** This project uses public NASA data for educational and simulation purposes.

## License

MIT — see [LICENSE](LICENSE).
