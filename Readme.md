
# Heliochronicon

**A 3D temporal celestial note-taking platform scaled ad infinitum**

Heliochronicon is an interactive solar system simulator and world-building tool. It lets users explore a realistic model of our solar system. Users can scan for asteroids, and annotate celestial bodies, in real time or any time between 0 AD and 4000 AD accurately.

**Live Demo:** [heliochronicon.vercel.app](https://heliochronicon.vercel.app/)

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/52db9637-814d-4f48-87cc-2405fcd34db9" />



https://github.com/user-attachments/assets/f6e6d0fc-b183-43d4-a857-f2065daeb7be



## Purpose

This project started as a world builder tool. It creates realistic simulations of our solar system for creative and technical use. It supports detailed note-taking linked to moving celestial objects.

## Features

- **Orbital Data**: Elements sourced from NASA JPL Horizons, which itself
  uses N-body integration to produce ephemerides. This app propagates
  those elements at runtime with two-body Keplerian mechanics — not
  live N-body — see Known Limitations
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

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/6dac736d-15cf-4d30-ae1e-957eb1a621bc" />

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/c02dfabb-d88f-4b09-b9a0-44a221133f3a" />


## Technical Highlights

This project pushes browser-based 3D graphics limits:

- **Data Pipeline**: NASA Horizons → CSV parsing → CSV to JSON DB → Chunking → WebGL InstancedMesh streaming.
- **Performance Optimizations**: Binary array handling for millions of interpolated asteroid positions. GPU instancing bypasses traditional WebGL object count limits.
- **Architecture**: Modular JavaScript with Three.js for rendering, custom shaders for surfaces and orbits, and Web Workers for heavy orbital calculations.

## Installation

1. Clone the repository from releases or open terminal in your chosen folder then:
`git clone https://github.com/PianoPsycopath/Heliochronicon.git`
2. Once you have cloned or downloaded the repo:
```bash
git clone https://github.com/PianoPsycopath/Heliochronicon.git
cd Heliochronicon
npm install
npm run dev
```
3. Opens at `http://localhost:5173` by default.

For 
## Testing

Place all csv files in raw/ `atira.csv` and `kerbin_system.csv` provided as examples
```bash
pip install -e ".[dev]"
cd raw
python csv_to_json.py
cd ..
npm install
npm run dev
```
wait for local host to open in web browser
press f-12 to open console


`resetDataSource()` returns data to default solar system in public/data/


`switchDataSource('raw/json_db/')` loads test data

Core orbital mechanics (`solveKepler`, `calcPosFromM`) and the data
parsing layer are covered by a Vitest suite: `npm test`.

## Known Limitations

Orbital positions are propagated using two-body Keplerian mechanics from a
single fixed-epoch element set per body (no continuous N-body integration
at runtime). This is accurate to within roughly ±40 years around the 
element epoch, and degrades noticeably outside that window.

## Roadmap

### Phase 1: Immediate Tasks (UI Polish, Culling, & State Persistence)

- Finalize CSS Flexbox/Grid layout architecture.
~~- Relocate scan button into the chronometer panel.~~
~~- Fix scanned asteroid culling bug in Frustum culler.~~
- Add tactical hover previews with raycast tooltips.
- Implement dynamic distance markers on ecliptic/equatorial grids.
~~- Add 3D group labels for asteroid populations.~~
- Implement full localStorage session persistence for pinned asteroids and toggles.
~~- Fix asteroid group color initialization bug.~~
~~- Fix orbit line desync on target selection.~~
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
