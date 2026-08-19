
# Heliochronicon
![CI](https://github.com/PianoPsycopath/Heliochronicon/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
<img width="1211" height="437" alt="image" src="https://github.com/user-attachments/assets/37bb8018-6d48-438b-aeec-968910b896a9" />

**A 3D temporal celestial note-taking platform scaled ad infinitum**

Heliochronicon is an interactive solar system simulator and world-building tool. It renders a physically-grounded model of our solar system; Sun, planets, moons, and millions of asteroids; that you can scrub through time, scan, and annotate.

<p align="center">
  <a href="https://heliochronicon.vercel.app/">
    <img src="./docs/assets/LIVEDEMOBUTTON.svg" alt="Live Demo">
  </a>
</p>

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

<details>
<summary><strong>What’s new</strong> (recent feature wave)</summary>

- Planetary surface heightmaps (Earth, Moon, Jupiter)
- Day/night shading and multi-body eclipse overlays
- GPU star field with proper motion + star pinning
- Spatial measurements and dynamic zoom ruler
- Analytic orbits: VSOP87 (Earth) and Meeus (Moon)
- Architecture docs and sequence diagrams under `docs/`

See [CHANGELOG.md](CHANGELOG.md) for the full list.

</details>

<table width="100%">
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/b1511ac0-c2ff-494d-92cb-7c22c82a7e72" width="100%" alt="Scale 1"><br>
      <em>Asteroid Distances from Earth</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/419cf94f-7fff-43f0-8076-5acaae7b1a68" width="100%" alt="Scale 2"><br>
      <em>Stellar motion with measurements</em>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/1b54c1e7-8950-4680-b602-3e436086c68e" width="100%" alt="Scale 3"><br>
      <em>Surface of Moon</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/8ba513be-15fa-424d-adcd-739e89b24adc" width="100%" alt="Scale 4"><br>
      <em>Scale of Simulation</em>
    </td>
  </tr>
</table>


**Eclipses**
<table width="100%">
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/cc0258dd-4dc5-4002-b3fd-381eea9dbb2b" width="100%" alt="Solar Eclipse 1"><br>
      <em>Solar Eclipse</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/224c7048-7ab3-43d1-886d-3039352dd6ff" width="100%" alt="Solar Eclipse 2"><br>
      <em>Lunar Eclipse</em>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/1141afb8-ee9e-4a09-af34-e4f55cec7b0a" width="100%" alt="Solar Eclipse 3"><br>
      <em>Ganymede's Shadow catches up with Callisto's</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/ccee5a3e-74bd-45a6-b3fc-2bd4875eb000"><br>
      <em>Solar Eclipse August 12th 2026</em>
    </td>
  </tr>
</table>

**Seasons**
<table width="100%">
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/b254abdb-a0f9-4776-b6d8-f15f38d947a1" width="100%" alt="Solar Eclipse 1"><br>
      <em>Earth Seasons marked on orbite</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/43f007c4-b2af-4771-908d-fa2f18c8c4e4"><br>
      <em>Mercurian Seasons</em>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/4f02b6e1-c452-4409-b077-02113d5d9553" width="100%" alt="Solar Eclipse 3"><br>
      <em>Asteroid Thermal Season</em>
    </td>
    <td width="50%" align="center">
      <img src="https://github.com/user-attachments/assets/5ae39b7c-31d9-4fb7-9f78-c27d68f6c30e"><br>
      <em>Neptune Perihelion Countdown</em>
    </td>
  </tr>
</table>





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
2. Opens at `http://localhost:5173` by default.

## Testing

Core orbital mechanics (`solveKepler`, `calcPosFromM`) and the data parsing layer are covered by a Vitest suite:
```bash
npm test
```

## Custom Solar Systems

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

*KERBOL PLANETARY SYSTEM*

## Known Limitations

Orbital positions are propagated using two-body Keplerian mechanics from a
single fixed-epoch element set per body (no continuous N-body integration
at runtime). This is accurate to within roughly ±40 years around the 
element epoch, and degrades noticeably outside that window.

## Contributing
See `CONTRIBUTING.md` for local setup, conventions, and where `ARCHITECTURE.md` fits into the workflow.
See `docs/` for sequence and flow diagrams for a visual understanding.

## Roadmap

### Phase 1: Immediate Tasks (UI Polish, Culling, & State Persistence)

- Finalize CSS Flexbox/Grid layout architecture.
- Add tactical hover previews with raycast tooltips.

### Phase 2: Next Big Features (Astrodynamics & Advanced Graphics)

- Delta-V heatmaps for flight planning.
- Torchship continuous acceleration travel simulator.
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
