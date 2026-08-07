# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project aims to follow [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Professional repo polish (Phase 7): rewritten README with badges and Known Limitations, `ARCHITECTURE.md`, `CONTRIBUTING.md`, and this changelog.

### Changed

- README roadmap condensed to a short “what's next” pointer; detailed work tracked in Issues.

## [1.0.1] — 2026-08

### Added

- Vitest coverage for orbital math, data parsing, storage abstraction, and related pure modules.
- Python pipeline hardening: pinned dev deps, ruff, black, pytest golden-file tests, CI job.
- Centralized `CelestialBody` factory and shared unit-conversion helpers.
- Extracted frame pipeline stages from `animate()`.
- UI decomposition: `ChronometerDisplay`, `TimeThrottle`, `BodyListManager`, telemetry/visibility modules.
- `storage.js` abstraction over `localStorage` with injectable backend for tests.
- Vite + ES module conversion; ESLint + Prettier baseline; GitHub Actions CI (lint, test, build + Python checks).

### Fixed

- Various scan/culling and asteroid group color initialization issues addressed during the cleanup phases.
- Local storage access unified behind a single module.

### Changed

- Runtime composition remains manual context-object DI from `main.js`.
- Orbital math returns plain `{x, y, z}` (no Three.js dependency in pure math).

## [1.0.0] — earlier

Initial public solar-system simulator with Keplerian propagation, GPU-instanced asteroids, tactical scan, chronometer, and telemetry.
