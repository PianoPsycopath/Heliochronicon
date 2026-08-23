# Heliochronicon: Architecture

This document describes how Heliochronicon works today: the data model, the runtime wiring
between modules, and the current known debt. It exists so that contributors (including
future maintainers) don't have to reverse-engineer the system from `main.js`, and so future
changes have a documented baseline to check against.

**Last verified against the main branch: August 23 2026** (BodyRegistry lifecycle boundary
complete with lookup API; `AppState` extraction; `BodyFactory` / `OrbitFactory` split from
`SystemBuilder`; modular `js/core|physics|rendering|ui` layout; Phase C shader split and
Phase D Vitest coverage remain in place).

---

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
would remove the limitation; that work has not started. Earth–Moon has solved this using
VSOP87 and the Meeus algorithm, which now holds within ~1 arcsecond over a multi-thousand-year
window.

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

Source is organized by concern:

| Path | Role |
|---|---|
| `js/core/` | Composition, body lifecycle, data, factories, scene |
| `js/physics/` | Orbital math, propagation, eclipse pure helpers |
| `js/rendering/` | Render pipeline, shaders, terrain/daylight/eclipse controllers, star field |
| `js/ui/` | UI modules, interaction, telemetry, measurement, tutorial |
| `js/main/` (or entry) | Composition root / boot / frame pipeline |

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
- **Logging:** all diagnostics go through `js/logger.js` (levels: debug / info / warn /
  error / silent). Production builds default to `warn` (quiet); the dev server defaults
  to `debug`. Runtime override from the browser console: `setLogLevel('info')` /
  `getLogLevel()`. Do not call `console.*` directly from app modules.
- No TypeScript is in use. A full TS migration remains paused.

`main.js` is the **composition root**: it imports every subsystem, instantiates them, and
wires them together with a plain context object (`ctx`). Missing or circular imports fail
at build/dev time instead of surfacing as a silent runtime `ReferenceError`.

---

## 3. Composition pattern: manual context-object DI

Instead of subsystem classes reaching into globals, `main.js` passes each subsystem a plain
`ctx` object of references and callbacks at construction time:

```js
const systemBuilder = new SystemBuilder({
  scene, UI, bodyRegistry, celestialBodies, pickableObjects, gpuParticleSystems, ...,
  getCurrentTarget: () => appState.currentTargetData,
  onClearTarget: () => {
    appState.currentTargetData = null;
    appState.trackingTargetData = null;
  },
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

`main.js` still owns the primary mutable collections as top-level bindings, but
higher-level simulation/UI state is increasingly centralized:

| State | Owner | Read / mutated by |
|---|---|---|
| `celestialBodies[]` | main.js | PhysicsEngine, RenderPipeline, TacticalScanner, InteractionController, Terrain/Daylight/Eclipse controllers, MeasurementManager; **mutations of add/remove only via `BodyRegistry`** |
| `pickableObjects[]` | main.js | InteractionController, TacticalScanner; **add/remove only via `BodyRegistry`** |
| `gpuParticleSystems[]` | main.js | SystemBuilder, RenderPipeline, TacticalScanner, StarLoader; registry also registers/removes dataset particle systems |
| `AppState` (`systemDate`, targets, `activeDatasets`, `inFlightDatasets`, `currentOrigin`, `lookupInFlight`) | `js/core/AppState.js` | nearly everything, via getters/setters passed through `ctx` |
| `savedColors` (`tacticalMapColors`) | main.js, persisted via `StorageManager` | SystemBuilder, RenderPipeline, TacticalScanner |
| `DATA_BASE_PATH` | main.js, persisted via `StorageManager` (`heliochronicon_dataSourcePath`) | DataLoader (indirectly, via URLs built in main.js) |
| `assetManifest` | main.js | deep asteroid lookup, boot |
| `starFieldMaterial` | main.js | final render stage (far-plane projection hack) |

There is still **no formal Redux-style store or reducer**. `AppState` provides a typed
boundary for simulation/targeting/dataset flags; body *lifecycle* is owned by
`BodyRegistry`. Shared arrays remain the source of truth for the body list and pickables.

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
`main.js` globals where practical. See also the sequence diagrams under `docs/`.

---

## 5. The body object: an enforced schema

Every entry in `celestialBodies[]` is an instance of the `CelestialBody` class
(`js/core/CelestialBody.js`), constructed at factory call sites in:

- `BodyFactory` / `SystemBuilder.buildSolarSystem`
- `SystemBuilder.promoteAsteroidToCPU` / `AsteroidPromotionService`
- `TacticalScanner.performTacticalScan` (and related promote paths)

Do not construct body object literals elsewhere; extend the factory instead.

```js
// js/core/CelestialBody.js (conceptual shape)
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
  baseRenderOrder;      // optional constructor field, default 0 — set by build sites that need
                         // a stable renderOrder before the first frame runs
  distToCamSq;          // optional constructor field, default 0 — reassigned every frame by
                         // PhysicsEngine.zSortCelestialBodies
}
```

Additional per-frame fields attached by `PhysicsEngine` / `RenderPipeline` (not necessarily
present on a freshly constructed body): `localPos`, `parentQuat`, `distToCamSq`,
`RA_current_deg`, `DEC_current_deg`, etc.

### 5.1 The `PlanetaryElement` shape (output of planetary data processing)

```js
// Conceptual — see JSDoc @typedefs in DataLoader / PlanetaryDataProcessor / CelestialBody
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

## 6. BodyRegistry: the body lifecycle boundary

`BodyRegistry` (`js/core/BodyRegistry.js`) is the **authoritative body database and
lifecycle owner**. Consumers should prefer registry APIs over raw array walks.

### Mutation API (sole path for add/remove)

| Method | Role |
|---|---|
| `registerBody(body)` | Push body into `celestialBodies` + mesh/sprite into `pickableObjects` |
| `promote(newBody, previous?)` | Remove previous (by name+category) if provided, then register |
| `removeBody(body)` | Full dispose + splice from arrays |
| `removeByNameAndCategory(name, category)` | Lookup + remove |
| `removeByDataset(datasetName)` | Purge CPU bodies (respects pinned promoted asteroids) + GPU particle systems for that dataset |
| `purgeTacticalClones()` | Radar contacts + unpinned promoted asteroids |
| `sweepForRescan(protectedTargetData?)` | Like purge, but can keep a protected target |
| `clearAll()` | Tear down every body and particle system |
| `registerParticleSystem(system)` | Track GPU asteroid/star particle systems |

`disposeBody` is the single place that runs the full cleanup sequence:

- scene removal of mesh / sprite / orbit line / orbit curtain
- geometry + material dispose (shared tactical materials are not disposed here)
- DOM label removal
- `daylightController.removeBody` / `eclipseShadowController.removeBody`
- `pickableObjects` bookkeeping

### Lookup API

```js
bodyRegistry.getByName(name)           // CelestialBody | null
bodyRegistry.getByCategory(category)   // CelestialBody[]
bodyRegistry.getPromotedBody(name)     // CelestialBody | null (PROMOTED_ASTEROID only)
bodyRegistry.hasBody(name)             // boolean
```

Preferred consumer style:

```js
bodyRegistry.getByName(name)
// instead of:
celestialBodies.find(...)
```

Matching predicates live in `js/core/bodyRegistryPredicates.js` (pure, DOM/Three-free,
Vitest-covered): `matchesDataset`, `matchesNameAndCategory`, `shouldPurgeInFullSweep`,
`shouldPurgeInRescan`.

**Arrays remain internal implementation details** owned by `main.js` and passed by reference
into the registry. Do not treat `celestialBodies` / `pickableObjects` as the primary public
API for lifecycle operations.

---

## 7. Data pipeline

### Default (live) path

`public/data/planets.json`, `moons.json`, `manifest.json`, asteroid chunk files, and
heightmap assets under `public/data/heightmaps/` are read by `DataLoader` /
`DataRepository` (and `TerrainController` for the heightmap manifest).
`PlanetaryDataProcessor` normalizes into `PlanetaryElement`s (moon `a_km` → AU,
period/mean-motion derivation, category defaults, `orbit_model` default `"KEPLER"`).
`SystemBuilder` + `BodyFactory` / `OrbitFactory` then split the result into:

- GPU-instanced particle systems for asteroid populations
- Full CPU `CelestialBody` meshes for planets, moons, and other primaries

### Custom-system path

`raw/csv_to_json.py` (stdlib only at runtime; dev tooling pinned in `pyproject.toml`) converts
a user-supplied JPL/Horizons-style CSV into the same chunked JSON + manifest shape.
Examples live under `examples/` (e.g. Kerbin system).

`main.js` reads its data directory from a runtime-configurable `DATA_BASE_PATH`
(`?dataSource=` URL param or `StorageManager` key `heliochronicon_dataSourcePath`) and
exposes `window.switchDataSource(path)` / `window.resetDataSource()` on the console.
`main.js` also exposes `window.setLogLevel(level)` / `window.getLogLevel()` for the
leveled logger (see §2 Tooling / Logging).

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

## 8. Module inventory

### Core / composition

| Module | Role |
|---|---|
| `main.js` | Composition root, frame pipeline, boot, dataset visibility/purge (delegates body dispose to `BodyRegistry`) |
| `AppState.js` | Simulation/targeting/dataset/in-flight/origin state with validated getters/setters |
| `SceneManager.js` | Canvas, scene, camera, renderer, OrbitControls |
| `SystemBuilder.js` | Build / clear solar system; orchestrates factories; registers via `BodyRegistry` |
| `BodyFactory.js` | Constructs `CelestialBody` instances (meshes, sprites, labels) |
| `OrbitFactory.js` | Orbit line / curtain geometry construction |
| `BodyRegistry.js` | Full CelestialBody lifecycle + lookups (see §6) |
| `bodyRegistryPredicates.js` | Pure matching / purge predicates used by `BodyRegistry` |
| `CelestialBody.js` | Enforced body schema |
| `DataLoader.js` / `DataRepository.js` | Fetch + normalize planetary / asteroid JSON |
| `PlanetaryDataProcessor.js` | Element normalization (units, defaults, orbit model) |
| `AsteroidLookup.js` | Deep designation lookup against manifest/chunks |
| `AsteroidPromotionService.js` | GPU → CPU promotion coordination |
| `storage.js` | `StorageManager` — sole `localStorage` access point |
| `logger.js` | Minimal leveled logger. Production defaults to `warn`; dev defaults to `debug`. |

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
| `Shaders.js` | Backward-compatible re-export of `shaders/ShaderManager.js` |
| `shaders/ShaderManager.js` | Thin manager re-flattening per-feature shader modules onto `Shaders.getX()` |
| `shaders/grid.js` | Ecliptic parallax grid + targeted-body equatorial grid |
| `shaders/tactical.js` | Scan rim, canvas sprites, GPU asteroid-particle field |
| `shaders/starField.js` | Background star field (+ magnitude LOD via `uMagLimit`) + star picking |
| `shaders/eclipse.js` | Multi-body umbra/penumbra shadow overlay |
| `shaders/nightSide.js` | Day/night terminator shell |
| `shaders/terrain.js` | Heightmap contour / lat-lon grid / ocean material |
| `TerrainController.js` | Heightmap registry, lazy texture load, material swap |
| `DaylightController.js` | Day/night / night-side shading |
| `EclipseShadowController.js` | Per-body eclipse overlay meshes |
| `StarLoader.js` | Load + build star-field `BufferGeometry` |
| `PinnedStarManager.js` | Persistent star label pins |

### Interaction & UI

| Module | Role |
|---|---|
| `UIController.js` | Thin composition layer wiring UI modules to `main.js` callbacks |
| `ChronometerDisplay.js` | CRT / oscilloscope time widget |
| `TimeThrottle.js` | Time-scale state machine |
| `BodyListManager.js` | Body list search / sort / render |
| `TelemetryManager.js` | Target telemetry panel (incl. eclipse readout hooks) |
| `VisibilityTreeManager.js` | Dataset visibility tree |
| `InteractionController.js` | Picking, focus, tracking, hover preview |
| `TacticalScanner.js` | Near-field scan + promote (lifecycle via `BodyRegistry`) |
| `MeasurementManager.js` | Spatial measurement tools |
| `ZoomRulerManager.js` | Dynamic 3D distance ruler |
| `TutorialManager.js` | First-run tutorial (uses `StorageManager`) |

---

## 9. Known architectural debt

1. **No formal store for all top-level state** — `AppState` and `BodyRegistry` cover
   simulation flags and body lifecycle, but shared mutable arrays
   (`celestialBodies`, `pickableObjects`, `gpuParticleSystems`) remain the source of truth
   and are still passed by reference. A fuller store/reducer is not required yet.

2. **Large static data in Git** — `public/data` is ~836 MB (asteroid chunks + heightmaps) plus
   `public/star_data` (~27 MB). Currently required for Vercel-from-GitHub deploys; external
   object storage remains a future option once notes / full-feature release constraints allow.

3. **ARCHITECTURE.md / docs lag risk** — this file must be updated whenever the frame
   pipeline, body schema, module inventory, or lifecycle boundary changes.

4. **Gradual migration off raw array `.find()`** — registry lookups exist; not every
   consumer has been migrated. Prefer `bodyRegistry.getByName` / `hasBody` / etc. for new
   code and opportunistic refactors.

---

## 10. What's out of scope right now

- The single-epoch ±40-year accuracy limitation on the Kepler path (§1).
- Full TypeScript migration.
- Multi-epoch / N-body revival (explicitly deferred; core boundaries are now clean enough to
  revisit later).

---

## 11. Related documents

- `README.md` — features, limitations summary, install, custom systems, live demo.
- `CONTRIBUTING.md` — local setup, conventions, CI expectations.
- `CHANGELOG.md` — release notes.
- `docs/` — sequence diagrams (frame pipeline, body lifecycle, data load,
  eclipse/terrain attachment) and performance notes.

---

## 12. Async State & Resource Loading Policy

To prevent orphaned geometries, memory leaks, and overlapping HTTP requests during procedural
data generation or chunk loading, all async pathways must adhere to the following strict
lifecycle rules:

1. **In-Flight Guards:** Every user-initiated async load (e.g., dataset toggles, deep asteroid
   lookup) must check an active "in-flight" state (e.g. `appState.hasInFlightDataset(name)` /
   `lookupInFlight`) before firing to prevent duplicate fetches.

2. **Cancellation Validation:** Upon resolution of a network promise, the orchestrator must
   verify that the user has not canceled the action (e.g., toggled off a dataset) before
   committing the result to the scene graph.

3. **Disposal Race Checks:** Async callbacks that apply textures or materials (like
   `TerrainController`) must verify that the target `CelestialBody` still exists (via
   `bodyRegistry.hasBody` / presence in `celestialBodies[]` and `scene.children`). If the
   body was purged during the load, the newly loaded GPU resources must be `dispose()`'d
   immediately.

4. **Distinguishable Failures:** Base data fetchers (like `DataLoader.fetchJSONDataset`) must
   throw errors rather than swallowing them into empty arrays. Orchestrators catch these
   errors and route them to user-visible telemetry elements (e.g. `UI.showLookupNotFound(msg)`).

5. **Soft Failures for Optional Assets:** Purely aesthetic or background layers (like
   `StarLoader`) may catch and swallow errors, returning `null` to fail silently and preserve
   engine boot flow.