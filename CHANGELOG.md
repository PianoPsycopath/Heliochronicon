# Changelog

## 0.6.0

### Added
- Oort Cloud population dataset and density-mesh shape (`oort-cloud` shell, ~2 000–100 000 AU, abstract representation with 100 000 particles) plus corresponding manifest entries and population-shapes data.
- Cinematic boot sequence (`CinematicManager` + `boot.anim.json`) driven by AppState boot phases (`booting` -> `flipping` -> `complete`). Features MAGI-triad panels (Ocularis / Sensorium / Chronometer), camera animation from deep-space zoom, and coordinated reveal once data load completes (race strategy with min/max timing).
- Theme system (`ThemeManager` + CSS custom properties in `themes.css` / `magi.css`):
  - Amber (default, classic)
  - MAGI blue theme
  - Gothic theme
  - Persistent preference via `localStorage` (`hc-ui-theme`)
- Collapsible UI panels and chronometer via `PanelExtensionController` (persisted state):
  - Left panel renamed **Ocularis**
  - Right/telemetry panel renamed **Sensorium**
  - Bottom chronometer deck can be collapsed
- Settings tab inside Ocularis.
- Dynamic layout adjustments so the chronometer dodges open side panels on desktop.

### Changed
- Maximum outward zoom unlocked to true galactic/deep-space scales:
  - `OrbitControls.minZoom` lowered to `0.000000001`
  - Zoom ruler landmarks and scale range updated accordingly
- Extensive CSS refactor: hard-coded amber/cyan colors replaced by theme CSS variables (`--theme-text-primary`, `--theme-border`, `--theme-accent`, instrument colors, live-button glow, danger, etc.) across base, chronometer, controls, layout, ruler, and related stylesheets.
- Boot flow in `main.js` now routes dataset initialization through the cinematic manager instead of starting the render loop immediately.
- Various UI labels, borders, focus rings, and instrument styling now respect the active theme.

### Fixed
- Starfield shader unnecessary culling / clipping: stars were being clipped by the camera’s tight far plane. Fixed by forcing `gl_Position.z = gl_Position.w * 0.9999` in both the visual and hit-test starfield shaders so they remain visible at extreme distances/zooms.
- **UI fixes for vertical screen size / new theme (mobile & constrained viewports)** (`82ee5d3`):
  - Chronometer and zoom-ruler layout corrected for narrow/vertical screens and when side panels are open.
  - Mobile-specific media queries updated (time-input sizing, ruler placement, panel interactions).
  - Theme font variables applied consistently so the new MAGI/Amber themes render correctly on small viewports.
  - Improved z-index layering, transition handling, and collapse behavior for panels + chronometer on mobile.
  - Throttle controls, tactical tools, and landmark icons adjusted for touch-friendly sizing and reduced overflow.
