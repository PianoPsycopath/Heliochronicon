# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project does not yet follow Semantic Versioning (no formal releases yet).

## [Unreleased]

### Added
- Planetary surface heightmaps (Earth, Moon, Jupiter) via TerrainController
- Day/night shading and multi-body eclipse/umbra–penumbra overlays
- GPU star field with proper motion
- Spatial measurements and dynamic zoom ruler
- Star pinning / hover names
- Analytic orbit paths: VSOP87 (Earth) and Meeus (Moon), with Earth–Moon barycenter correction
- Frame pipeline stages formalized in `animate()`; architecture docs + sequence diagrams under `docs/`

### Changed
- …