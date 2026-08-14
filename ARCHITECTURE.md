# Heliochronicon: Architecture

This document describes how Heliochronicon works today: the data model, the runtime wiring
between modules, and the current known debt. It exists so that contributors (including
future maintainers) don't have to reverse-engineer the system from `main.js`, and so future
changes have a documented baseline to check against.

**Last verified against the main branch: August 13 2026** (Phase B: `BodyRegistry` extraction —
see §8 item 5).

## 1. What the system does

Heliochronicon renders a real-time (or time-scrubbed) 3D model of the solar system, plus
millions of asteroids and a background star field, using precalculated JPL orbital elements
and a mix of propagation models:

- **Default / most bodies:** pure two-body Keplerian propagation from a single fixed-epoch
  element set.
- **Selected high-value bodies:** analytic models (`orbit_model: "VSOP87"` for major planets,
  `orbit_model: "MEEUS"` for the Moon) with optional Earth–Moon barycenter correction.

There is **no N-body integration at runtime**.

**Known accuracy limitation (Kepler path):** each body uses a single, fixed-epoch element set
with no secular perturbation terms applied post-epoch. Propagated positions are reliable for
roughly ±40 years around the element epoch (an 80-year window) and degrade outside it. This
is a deliberate scope decision. Multi-epoch element sets (pick closest epoch to sim date)
would remove the limitation; that work has not started. Earth Moon has solved this using 
VSOP87 and Meeus algorithm which now has within 1 arcsecond of a window of 6thousand years

Additional runtime features that affect architecture:

- Planetary surface heightmaps (Earth, Moon, Jupiter initially) via `TerrainController`.
- Day/night shading and multi-body eclipse/umbra–penumbra overlays via `DaylightController`
  + `EclipseEngine` / `EclipseShadowController`.
- GPU-instanced background star field with proper motion (`StarLoader` + custom star shader).
- Spatial measurement tools and a dynamic zoom ruler.
- Tactical scanning that can promote GPU asteroids to full CPU `CelestialBody` instances.

---

## 2. Runtime model: Vite + ES modules

The app is built with **Vite**. Every file under `js/` is an ES module (`export class …` /
named exports) with real `import` statements. There is no reliance on `<script>` tag load
order.

- **Entry point:** `index.html` loads a single module:
  ```html
  <script type="module" src="/js/main.js"></script>
  ```
- **Three.js** is an npm dependency (`import * as THREE from 'three'`). OrbitControls comes
  from `three/examples/jsm/controls/OrbitControls.js`.
- **Dev:** `npm run dev` (Vite dev server with HMR).
- **Prod:** `npm run build` produces static assets in `dist/`; Vercel deploys from that
  output.
- **Tooling:** ESLint + Prettier for JS; Vitest for unit testing pure modules. CI
  (`.github/workflows/ci.yml`) runs two jobs in parallel:
  - JS: `npm ci` → `npm run lint` → `npm test` → `npm run build`
  - Python: `pip install -e ".[dev]"` → `ruff check .` → `black --check .` → `pytest`
- No TypeScript is in use. A full TS migration remains paused.

`main.js` is the **composition root**: it imports every subsystem, instantiates them, and
wires them together with a plain context object (`ctx`). Missing or circular imports fail 
at build/dev time instead of surfacing as asilent runtime `ReferenceError`.

---

## 3. Composition pattern: manual context-object DI

Instead of subsystem classes reaching into globals, `main.js` passes each subsystem a plain
`ctx` object of references and callbacks at construction time:

```js
const systemBuilder = new SystemBuilder({
  scene, UI, celestialBodies, pickableObjects, gpuParticleSystems, ...,
  getCurrentTarget: () => currentTargetData,
  onClearTarget: () => { currentTargetData = null; trackingTargetData = null; },
});
```

This is manual dependency injection. Subsystems are unit-testable in principle (a class only
needs a fake `ctx`). Core math modules (`OrbitalMath`, `EclipseEngine` pure helpers,
`MeeusMoon`, `VSOP87`) are fully decoupled from the DOM and Three.js where practical,
returning plain objects or numbers.

**Preserve this pattern.** New subsystems must receive everything they need through `ctx`
(or pure function arguments). Do not introduce module-level mutable globals.

---

## 4. Where state actually lives

`main.js` owns all mutable application state as top-level `let`/`const` bindings.
Everything else reaches it only through the `ctx` callbacks and getters:

| State | Owner | Read / mutated by |
|---|---|---|
| `celestialBodies[]` | main.js | SystemBuilder, PhysicsEngine, RenderPipeline, TacticalScanner, InteractionController, Terrain/Daylight/Eclipse controllers, MeasurementManager, `BodyRegistry` (sole mutator of add/remove — see §7, §8 item 5) |
| `pickableObjects[]` | main.js | SystemBuilder, InteractionController, TacticalScanner, `BodyRegistry` (sole mutator of add/remove) |
| `gpuParticleSystems[]` | main.js | SystemBuilder, RenderPipeline, TacticalScanner, StarLoader (star field) |
| `currentTargetData` / `trackingTargetData` / `previewTargetData` | main.js | nearly everything, via getters / callbacks |
| `systemDate`, `currentOrigin` | main.js | PhysicsEngine, RenderPipeline, TacticalScanner, MeasurementManager, PinnedStarManager |
| `activeDatasets` (Set) | main.js closure | only main.js (visibility toggle handler) |
| `savedColors` (`tacticalMapColors`) | main.js, persisted via `StorageManager` | SystemBuilder, RenderPipeline, TacticalScanner |
| `DATA_BASE_PATH` | main.js, persisted via `StorageManager` (`heliochronicon_dataSourcePath`) | DataLoader (indirectly, via URLs built in main.js) |
| `assetManifest` | main.js | deep asteroid lookup, boot |
| `starFieldMaterial` | main.js | final render stage (far-plane projection hack) |

There is **no formal store or reducer**. State changes happen by direct mutation of shared
arrays and objects, coordinated by callback wiring in `main.js`. Correctness depends on
every subsystem mutating `celestialBodies` (and related lists) in a consistent order.

### Frame pipeline (`animate()`)

Execution order is formalized as named, testable stages inside `animate()`:

1. **Time update** — `updateSystemTimeStage` (throttle → new `systemDate` + J2000 days)
2. **Physics** — `runPhysicsStage` (positions, poles, floating origin, culling inputs)
3. **Hardware / camera / telemetry** — `updateHardwareStage`
4. **Render pre-pass** — `runRenderPrePassStage` (screen projection, culling, label decisions;
   also drives terrain/daylight/eclipse visibility hooks)
5. **Dual-grid logic** — `updateDualGridsStage` (ecliptic + targeted equatorial)
6. **Measurement + pinned-star labels** — `measurementManager.update`, `pinnedStarManager.update`
7. **Final GPU update + render** — `executeFinalRenderStage` (incl. star-field far projection)

Each stage is a standalone function taking explicit arguments rather than closing over
`main.js` globals where practical. See also the planned sequence diagrams under `docs/`.

---

## 5. The body object: an enforced schema

Every entry in `celestialBodies[]` is an instance of the `CelestialBody` class
(`js/CelestialBody.js`), constructed at the factory call sites in:

- `SystemBuilder.buildSolarSystem`
- `SystemBuilder.promoteAsteroidToCPU`
- `TacticalScanner.performTacticalScan` (and related promote paths)

Do not construct body object literals elsewhere; extend the factory instead.

```js
// js/CelestialBody.js (conceptual shape)
class CelestialBody {
  data;                 // PlanetaryElement (see §5.1)
  isMoon;
  mesh;                 // THREE.Mesh | null
  sprite;               // THREE.Sprite | null
  orbitLine;            // THREE.Line | null
  orbitCurtain;         // THREE.LineSegments | null
  label;                // HTMLDivElement | null
  datasetVisible;
  isCulled;
  hideLabel;
  globalPos;            // THREE.Vector3 — set per frame by PhysicsEngine
  renderPos;            // globalPos − floating origin — set per frame by RenderPipeline
  parentPos;
  W_current;
  poleQuaternion;
  scaledA;              // semi-major axis, AU
  physicalRadius;       // AU
}
```

Additional per-frame fields attached by `PhysicsEngine` / `RenderPipeline` (not necessarily
present on a freshly constructed body): `localPos`, `parentQuat`, `distToCamSq`,
`RA_current_deg`, `DEC_current_deg`, etc.

### 5.1 The `PlanetaryElement` shape (output of `DataLoader.processPlanetaryData`)

```js
// Conceptual — see JSDoc @typedefs in DataLoader / CelestialBody
{
  name, parent, category,           // category ≈ PLANET | MOON | ASTEROID | ...
  orbit_model,                      // "KEPLER" (default) | "VSOP87" | "MEEUS"
  a, e, i, w, Node, M0,             // radians / AU as appropriate
  period, n,                        // mean motion rad/day
  mass, radius_km, symbol,
  pole_ra, pole_dec, pole_ra_rate, pole_dec_rate,
  pm_w, pm_w_rate,                  // and related rates where present
  barycenter_model, barycenter_mass_ratio,  // optional Earth–Moon style correction
  datasetName, datasetCategory,
  isTargetable, isPinned, ...
}
```

Unit conversions (`kmToAU`, etc.) are centralized in `OrbitalMath.js`. Call that function;
do not re-implement the constant.

---

## 6. Data pipeline

### Default (live) path

`public/data/planets.json`, `moons.json`, `manifest.json`, asteroid chunk files, and
heightmap assets under `public/data/heightmaps/` are read by `DataLoader.fetchJSONDataset`
(and `TerrainController` for the heightmap manifest). `DataLoader.processPlanetaryData`
normalizes into `PlanetaryElement`s (moon `a_km` → AU, period/mean-motion derivation, category
defaults, `orbit_model` default `"KEPLER"`). `SystemBuilder.buildSolarSystem` then splits the
result into:

- GPU-instanced particle systems for asteroid populations
- Full CPU `CelestialBody` meshes for planets, moons, and other primaries

### Custom-system path

`raw/csv_to_json.py` (stdlib only at runtime; dev tooling pinned in `pyproject.toml`) converts
a user-supplied JPL/Horizons-style CSV into the same chunked JSON + manifest shape, written
to `raw/json_db/`. Examples: `raw/atira.csv`, `raw/kerbin_system.csv`.

`main.js` reads its data directory from a runtime-configurable `DATA_BASE_PATH`
(`?dataSource=` URL param or `StorageManager` key `heliochronicon_dataSourcePath`) and
exposes `window.switchDataSource(path)` / `window.resetDataSource()` on the console.

### Star field path

`public/star_data/` (constellation-chunked JSON + `stars_manifest.json`) is loaded by
`StarLoader.loadStars`. Stars become a single `THREE.Points` GPU system with positions and
proper-motion velocities. The material is produced by `Shaders.getStarFieldMaterial()`. A
far-plane projection hack (`updateStarFieldFarProjection`) temporarily expands `camera.far`
so stars at interstellar distances still project correctly.

### Heightmap / terrain path

`public/data/heightmaps/manifest.json` maps body names → texture URL + elevation range.
`TerrainController` lazily loads textures when a mesh becomes visible and swaps materials.
Missing manifest is non-fatal (terrain simply stays off).

---

## 7. Module inventory

### Core / composition

| Module | Role |
|---|---|
| `main.js` | Composition root, state ownership, frame pipeline, boot, dataset visibility/purge (delegates body dispose to `BodyRegistry`) |
| `SceneManager.js` | Canvas, scene, camera, renderer, OrbitControls |
| `SystemBuilder.js` | Build / clear solar system, promote asteroid to CPU body (registers/removes via `BodyRegistry`) |
| `BodyRegistry.js` | Owns the full CelestialBody lifecycle: `registerBody`, `promote`, `removeBody`, `removeByNameAndCategory`, `removeByDataset`, `purgeTacticalClones`, `sweepForRescan`, `clearAll`. Single place that runs the full dispose sequence (scene removal, geometry/material dispose, DOM label removal, `daylightController`/`eclipseShadowController` cleanup, `pickableObjects` bookkeeping). |
| `bodyRegistryPredicates.js` | Pure, DOM/Three-free matching logic used by `BodyRegistry` (e.g. `shouldPurgeInFullSweep`, `shouldPurgeInRescan`) — no scene/graphics dependency, covered by Vitest unit tests. |
| `DataLoader.js` | Fetch + normalize planetary / asteroid JSON |
| `CelestialBody.js` | Enforced body schema / factory |
| `storage.js` | `StorageManager` — sole `localStorage` access point |

### Physics & math

| Module | Role |
|---|---|
| `OrbitalMath.js` | Kepler solver, `calcPosFromM`, `kmToAU`, dispatch to analytic models |
| `PhysicsEngine.js` | Per-frame position / pole / origin updates |
| `MeeusMoon.js` | Analytic Moon position |
| `vsop87.js` | VSOP87 planetary positions |
| `EclipseEngine.js` | Pure-ish shadow geometry tests (umbra/penumbra) |

### Rendering & visual systems

| Module | Role |
|---|---|
| `RenderPipeline.js` | Floating origin, projection, culling, GPU particle updates, coordinates terrain/daylight/eclipse hooks |
| `Shaders.js` | **Monolithic** shader factory (grids, tactical dots, star field, eclipse overlays, terrain/night-side, etc.) |
| `TerrainController.js` | Heightmap registry, lazy texture load, material swap |
| `DaylightController.js` | Day/night / night-side shading |
| `EclipseShadowController.js` | Per-body eclipse overlay meshes (up to N concurrent shadows) |
| `StarLoader.js` | Load + build star-field `BufferGeometry` |
| `PinnedStarManager.js` | Persistent star label pins |

### Interaction & UI

| Module | Role |
|---|---|
| `UIController.js` | Thin composition layer (~300 lines) wiring UI modules to `main.js` callbacks |
| `ChronometerDisplay.js` | CRT / oscilloscope time widget |
| `TimeThrottle.js` | Time-scale state machine |
| `BodyListManager.js` | Body list search / sort / render |
| `TelemetryManager.js` | Target telemetry panel (incl. eclipse readout hooks) |
| `VisibilityTreeManager.js` | Dataset visibility tree |
| `InteractionController.js` | Picking, focus, tracking, hover preview |
| `TacticalScanner.js` | Near-field scan + promote (radar-contact lifecycle via `BodyRegistry`) |
| `MeasurementManager.js` | Spatial measurement tools |
| `ZoomRulerManager.js` | Dynamic 3D distance ruler |
| `TutorialManager.js` | First-run tutorial (uses `StorageManager`) |

---

## 8. Known architectural debt

1. **`Shaders.js` monolith** (~820 lines) — every shader lives in one class. A
   `ShaderManager` (or per-feature modules: grid, star, eclipse, terrain, tactical) would
   improve navigability and allow tree-shaking / lazy creation.

2. **Star-field performance at high zoom / mobile** — the background star map (proper-motion
   GPU particles + far-plane projection hack) is a known source of lag, especially on mobile
   when the camera is deep in the interstellar regime. Needs culling, LOD, or density
   throttling.

3. **No formal store** — shared mutable arrays remain the source of truth. `BodyRegistry`
   (see item 5) centralizes body *lifecycle* bookkeeping, but there is still no formal
   store/reducer for the rest of `main.js`'s top-level state (`currentTargetData`,
   `activeDatasets`, `systemDate`, etc.).

4. **Body lifecycle / dispose duplication — resolved.** `BodyRegistry.js` now owns
   add/remove/dispose for `CelestialBody` scene-graph, GPU, and DOM resources.
   `SystemBuilder` (`buildSolarSystem`, `promoteAsteroidToCPU`, `clearSolarSystem`),
   `TacticalScanner` (`performTacticalScan`, `purgeTacticalClones`), and `main.js`
   (`onDatasetVisibilityChanged`'s purge branch, `onPurgeRequested`) all register/remove
   bodies through it instead of duplicating `scene.remove()` / `dispose()` / splice
   sequences. Two distinct purge semantics that existed at different call sites were kept
   distinct rather than force-unified: `purgeTacticalClones()` (unconditional full sweep,
   used when scanning is toggled off) and `sweepForRescan(protectedTargetData)` (radar
   contacts always cleared, but an unpinned promoted-asteroid clone is spared if it's the
   currently targeted body, used immediately before a scan repopulates radar hits). The
   underlying match/purge decisions are pure functions in `bodyRegistryPredicates.js`,
   unit-tested independently of THREE/DOM. One intentional behavior change from this pass:
   the old inline purge code in `main.js` never disposed geometry/material for purged
   bodies (a leak); `BodyRegistry.disposeBody` always does.

5. **Test coverage lag** — pure orbital math, DataLoader, TimeThrottle, storage, and parts of
   Physics/Render are covered, as are the new `bodyRegistryPredicates.js` helpers. Newer
   systems (EclipseEngine pure helpers, TerrainController decisions, StarLoader parsing,
   MeasurementManager) still have little or no automated coverage, and `BodyRegistry` itself
   is only covered indirectly (its pure predicates are tested; the THREE/DOM-touching
   dispose/register methods are not — they'd need a headless THREE + jsdom harness). An
   eclipse unit test exists locally but is not yet in the repo.

6. **Large static data in Git** — `public/data` is ~836 MB (asteroid chunks + heightmaps) plus
   `public/star_data` (~27 MB). Currently required for Vercel-from-GitHub deploys; external
   object storage remains a future option once notes / full-feature release constraints allow.

7. **`DataLoader` lookup cost** — there is a TODO to move a hot designation-normalization /
   lookup path into a cheaper structure.

8. **ARCHITECTURE.md / docs lag risk** — this file must be updated whenever the frame
   pipeline, body schema, or module inventory changes.

---

## 9. What's out of scope right now

- The single-epoch ±40-year accuracy limitation on the Kepler path (§1). 
- Full TypeScript migration.
- Multi-epoch / N-Raw revival (explicitly deferred; core boundaries are now clean enough to
  revisit later).

---

## 10. Related documents

- `README.md` — features, limitations summary, install, custom systems, live demo.
- `CONTRIBUTING.md` — local setup, conventions, CI expectations.
- `docs/` — planned home for sequence diagrams (frame pipeline, body lifecycle, data load,
  eclipse/terrain attachment).