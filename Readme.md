
# Heliochronicon

**A 3D temporal celestial note-taking platform scaled ad infinitum**

Heliochronicon is an interactive solar system simulator and world-building tool. It lets users explore a realistic model of our solar system. Users can scan for asteroids, and annotate celestial bodies, in real time or any time between 0 AD and 4000 AD accurately.

**Live Demo:** [heliochronicon.vercel.app](https://heliochronicon.vercel.app/)

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/52db9637-814d-4f48-87cc-2405fcd34db9" />



https://github.com/user-attachments/assets/f6e6d0fc-b183-43d4-a857-f2065daeb7be



## Purpose

This project started as a world builder tool. It creates realistic simulations of our solar system for creative and technical use. It supports detailed note-taking linked to moving celestial objects.

## Features

- **Realistic Orbital Mechanics** 
Uses high-precision data and N-body influences where possible.
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

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/9cce7f58-646f-48c8-8848-3f7d798627e3" />

<img width="1920" height="1080" alt="image" src="https://github.com/user-attachments/assets/26ff545f-14af-4566-8781-cf4f2094e715" />

## Technical Highlights

This project pushes browser-based 3D graphics limits:

- **Data Pipeline**: NASA Horizons → Python/REBOUND N-Body integration → Binary .bin buffers → WebGL InstancedMesh streaming.
- **Performance Optimizations**: Binary array handling for millions of interpolated asteroid positions. GPU instancing bypasses traditional WebGL object count limits.
- **Architecture**: Modular JavaScript with Three.js for rendering, custom shaders for surfaces and orbits, and Web Workers for heavy orbital calculations.

## Installation and Local Setup For Custom Star System

1. Clone the repository:

2. Open terminal, run 

```npm run build```

```npm run dev```

3. A browser window or tab will open with the app running

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
