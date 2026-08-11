
# Heliochronicon
![CI](https://github.com/PianoPsycopath/Heliochronicon/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

**A 3D temporal celestial note-taking platform scaled ad infinitum**

Heliochronicon is an interactive solar system simulator and world-building tool. It renders a physically-grounded model of our solar system; Sun, planets, moons, and millions of asteroids; that you can scrub through time, scan, and annotate.

**Live Demo:** [heliochronicon.vercel.app](https://heliochronicon.vercel.app/)

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/52db9637-814d-4f48-87cc-2405fcd34db9" />



https://github.com/user-attachments/assets/f6e6d0fc-b183-43d4-a857-f2065daeb7be



## Purpose

This project started as a world builder tool. It creates realistic simulations of our solar system for creative and technical use. It supports detailed note-taking linked to moving celestial objects.

## Features

- **Orbital Data**: Elements sourced from NASA JPL Horizons, which itself
  uses N-body integration to produce ephemerides. This app propagates
  those elements at runtime with two-body Keplerian mechanics; not
  live N-body; see Known Limitations
- **Asteroid Visualization** 
Renders millions of asteroids with instanced WebGL rendering for performance.
- **Interactive Scanning** 
Scan for nearby objects and promote interesting ones to persistent view.
- **Temporal Controls** 
Control time flow with a chronometer to observe orbital evolution.
- **Dynamic Labeling and Grouping** 
Group and label asteroid populations (e.g., TNOs, Apollo, Amor).
- **Session Persistence** 
Saves pinned asteroids and view settings in the browser.
- **Telemetry Panel** 
Shows real-time information about selected targets.
- **Custom Planetary Systems**
Bring your own orbital elements via CSV and load them in place of the default dataset (see Custom Solar Systems below).


<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/6dac736d-15cf-4d30-ae1e-957eb1a621bc" />

*Search for Nearby Asteroids*

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/c02dfabb-d88f-4b09-b9a0-44a221133f3a" />

*Satellite orbit viewer*

<img width="1920" height="1080" alt="stellarmotion" src="https://github.com/user-attachments/assets/419cf94f-7fff-43f0-8076-5acaae7b1a68" />

*Stellar motion with measurements*

<img width="1920" height="1080" alt="lunareclipse" src="https://github.com/user-attachments/assets/224c7048-7ab3-43d1-886d-3039352dd6ff" />

*Lunar Eclipse with umbra and penumbra*

<img width="1920" height="1080" alt="solareclipse" src="https://github.com/user-attachments/assets/cc0258dd-4dc5-4002-b3fd-381eea9dbb2b" />

*Annular Solar Eclipse*

## Technical Highlights

This project pushes browser-based 3D graphics limits:

- **Data Pipeline (Live APP)**: 
Precalculated JSON datasets (data/planets.json, data/moons.json, chunked asteroid files) are fetched at runtime and parsed into a single enforced CelestialBody schema
- **Data Pipeline (custom systems)**:
A separate Python pipeline converts user-supplied JPL/Horizons CSVs into the same chunked JSON db compatible with the app.
- **Performance Optimizations**: 
GPU-instanced rendering bypasses per-object draw-call limits, letting millions of asteroids render at interactive frame rates.
- **Architecture**: 
ES modules built with Vite, Three.js for rendering, custom shaders for surfaces and orbits, and a manual-DI composition pattern (see `ARCHITECTURE.md`) that keeps core orbital math fully unit-testable and decoupled from the DOM/Three.js.

## Installation

1. Clone the repository from releases or open terminal in your chosen folder then:
```bash
git clone https://github.com/PianoPsycopath/Heliochronicon.git

cd Heliochronicon
npm install
npm run dev
```
3. Opens at `http://localhost:5173` by default.

## Testing

Core orbital mechanics (`solveKepler`, `calcPosFromM`) and the data parsing layer are covered by a Vitest suite:
```bash
npm test
```

##Custom Solar Systems

You can swap in your own dataset instead of the default solar system:

```bash
pip install -e ".[dev]"
cd raw
python csv_to_json.py
cd ..
npm install
npm run dev
```

Two example CSVs (`atira.csv`, `kerbin_system.csv`) are provided in `raw/` as a starting point. Once the dev server is running, open the browser console (F12) and use:

`switchDataSource('raw/json_db/')` | load your generated dataset

`resetDataSource()`                | return to the default solar system in public/data/

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/2cb56069-4974-42db-b590-2ecb46e2c640" />


## Known Limitations

Orbital positions are propagated using two-body Keplerian mechanics from a
single fixed-epoch element set per body (no continuous N-body integration
at runtime). This is accurate to within roughly ±40 years around the 
element epoch, and degrades noticeably outside that window.

##Contributing
See `CONTRIBUTING.md` for local setup, conventions, and where `ARCHITECTURE.md` fits into the workflow.

## Roadmap

### Phase 1: Immediate Tasks (UI Polish, Culling, & State Persistence)

- Finalize CSS Flexbox/Grid layout architecture.
- Add tactical hover previews with raycast tooltips.
- Implement dynamic distance markers on ecliptic/equatorial grids.
- Add NASA credits and performance monitor (GPU/CPU/FPS) to telemetry.
- Decouple Sun data into separate `stars.json` pipeline.

### Phase 2: Next Big Features (Astrodynamics & Advanced Graphics)

- Delta-V heatmaps for flight planning.
- Torchship continuous acceleration travel simulator.
- Planetary day/night cycles and eclipse visualization.
- Topographic surface maps with heightmap-based outline rendering.
- Predictive close encounters and impact calculations.
- Dynamic geospatial notes engine linked to moving bodies.

### Phase 3: Experimental Sandbox (Communications & Far Future Tech)

- Deep Space Network (DSN) line-of-sight communication simulation.
- Magnetic fields, gravity profiles, and weather/fluid dynamics modeling or historical weather viewing for Earth.
- Procedural generation of neighboring star systems.

## Credits and Data Sources

- Orbital data from NASA Horizons and related ephemerides.
- N-Body integration support via REBOUND (Python backend for pre-computation).
- Three.js for WebGL rendering.

**NASA Disclaimer**: This project uses public NASA data for educational and simulation purposes.
