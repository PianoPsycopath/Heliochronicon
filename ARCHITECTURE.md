# Heliochronicon: Architecture

This document describes how Heliochronicon works today: the data model, the runtime wiring
between modules, and the current known debt. It exists so that contributors (including
future maintainers) don't have to reverse-engineer the system from `main.js`, and so future
changes have a documented baseline to check against.

Last verified against the main branch (August 07 2026).

## 1. What the system does

Heliochronicon renders a real-time (or time-scrubbed) 3D model of the solar system, plus
millions of asteroids, using precalculated JPL orbital elements and pure two-body Keplerian
propagation. There is no N-body integration at runtime.

**Known accuracy limitation:** each body uses a single, fixed-epoch element set with no
secular perturbation terms applied post-epoch, so propagated positions are reliable for
roughly plus or minus 40 years around the element epoch (an 80-year window total) and degrade
outside it. This is a deliberate scope decision, not a bug. Generating multi-epoch element
sets so the app could pick the closest epoch to the current sim date would remove this
limitation, but that work has not been started.

## 2. Runtime model: Vite + ES modules

The app is built with **Vite**. Every file under `js/` is an ES module (`export class ...` /
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
- **Tooling:** ESLint and Prettier for JS; Vitest for unit testing pure modules. CI
  (`.github/workflows/ci.yml`) runs two jobs in parallel: a JS job (`npm ci`, `npm run lint`,
  `npm test`, `npm run build`) and a Python job (`pip install -e ".[dev]"`, `ruff check .`,
  `black --check .`, `pytest`).
- No TypeScript is in use. `package.json` has no TS devDependencies; the stack is Vite plus
  plain JS. A full TS migration remains a candidate for future work.

`main.js` is the composition root: it imports every subsystem, instantiates them, and wires
them together. Missing or circular imports fail at build/dev time instead of surfacing as a
silent runtime `ReferenceError`.

## 3. Composition pattern: manual context-object DI

Instead of subsystem classes reaching into globals directly, `main.js` passes each subsystem
a plain `ctx` object of references and callbacks at construction time:

```js
const systemBuilder = new SystemBuilder({
  scene, UI, celestialBodies, pickableObjects, gpuParticleSystems, ...,
  getCurrentTarget: () => currentTargetData,
  onClearTarget: () => { currentTargetData = null; trackingTargetData = null; },
});
```

This is manual dependency injection, and it's a good pattern to preserve: subsystems are
unit-testable in principle, since a class only needs a fake `ctx`, not a real DOM or scene.
Core math modules like `OrbitalMath` are fully decoupled from the DOM and Three.js (returning
plain `{x, y, z}` objects), which is what allows them to be tested in isolation.

## 4. Where state actually lives

`main.js` owns all mutable application state as top-level `let`/`const` bindings.
Everything else reaches it only through the `ctx` callbacks and getters described above:

| State | Owner | Read by |
|---|---|---|
| `celestialBodies[]` | main.js | SystemBuilder, PhysicsEngine, RenderPipeline, TacticalScanner, InteractionController |
| `pickableObjects[]` | main.js | SystemBuilder, InteractionController, TacticalScanner |
| `gpuParticleSystems[]` | main.js | SystemBuilder, RenderPipeline, TacticalScanner |
| `currentTargetData` / `trackingTargetData` | main.js | nearly everything, via `getCurrentTarget()` |
| `systemDate`, `currentOrigin` | main.js | PhysicsEngine, RenderPipeline, TacticalScanner |
| `activeDatasets` (Set) | main.js closure | only main.js |
| `savedColors` (`tacticalMapColors`) | main.js, persisted via `StorageManager` (`js/storage.js`) | SystemBuilder, RenderPipeline, TacticalScanner |
| `DATA_BASE_PATH` (which dataset directory to boot from) | main.js, persisted via raw `localStorage`, not `StorageManager`; see §7 | DataLoader, indirectly, via fetch URLs built in main.js |

There is no formal store or reducer; state changes happen by direct mutation of shared
arrays and objects, coordinated by callback wiring in `main.js`. The correctness of the app
depends on every subsystem mutating the shared `celestialBodies` array in a consistent
order. This execution order is formalized as a "frame pipeline" of named, testable stages
inside `animate()` (`js/main.js`): time update, physics, hardware/camera/telemetry update,
render pre-pass (projection and culling), dual-grid logic, then final GPU update and render.
Each stage is a standalone function taking explicit arguments rather than closing over
`main.js` globals.

## 5. The body object: an enforced schema

Every entry in `celestialBodies[]` is an instance of the `CelestialBody` class
(`js/CelestialBody.js`), constructed at exactly three call sites:
`SystemBuilder.buildSolarSystem`, `SystemBuilder.promoteAsteroidToCPU`, and
`TacticalScanner.performTacticalScan`. This guarantees that whether a body is a primary
planet, a moon, a user-promoted asteroid, or a transient radar contact, it adheres to the
same structural schema, and that all math and unit conversions (like `kmToAU`, centralized
in `OrbitalMath.js`) happen in exactly one place.

```ts
// js/CelestialBody.js
class CelestialBody {
  data: PlanetaryElement;       // parsed orbital elements and metadata, see §5.1
  isMoon: boolean;
  mesh: THREE.Mesh | null;
  sprite: THREE.Sprite | null;
  orbitLine: THREE.Line | null;
  orbitCurtain: THREE.LineSegments | null;
  label: HTMLDivElement | null;
  datasetVisible: boolean;
  isCulled: boolean;
  hideLabel: boolean;
  globalPos: THREE.Vector3;     // set per frame by PhysicsEngine
  renderPos: THREE.Vector3;     // globalPos minus the floating origin; set per frame by RenderPipeline
  parentPos: THREE.Vector3;
  W_current: number;
  poleQuaternion: THREE.Quaternion;
  scaledA: number;              // semi-major axis, AU
  physicalRadius: number;       // AU
}
```

Three additional fields are attached dynamically, per frame, by `PhysicsEngine` rather than
initialized in the constructor. They do not exist on a freshly built body until the physics
stage has run once: `localPos` (position before parent offset is applied), `parentQuat`
(the cached parent pole quaternion, also read by `RenderPipeline` to orient moon orbit
lines), and `distToCamSq` (used for camera-distance sort and cull ordering).

### 5.1 The `PlanetaryElement` shape (output of `DataLoader.processPlanetaryData`)

```ts
interface PlanetaryElement {
  name: string; parent: string;
  a: number; e: number; i: number; w: number; Node: number; M0: number; // radians, AU
  period: number; n: number;    // mean motion, rad/day
  mass: number; radius_km: number; symbol: string;
  pole_ra: number; pole_dec: number; pole_ra_rate: number; pole_dec_rate: number;
  pm_w: number; pm_w_rate: number;
  datasetName: string; datasetCategory: 'PLANET' | 'MOON' | 'ASTEROID';
  isTargetable: true;
}
```

## 6. Data pipeline

**Default, live path:**
`public/data/planets.json`, `moons.json`, `manifest.json`, and asteroid chunk files are read
by `DataLoader.fetchJSONDataset`, then parsed by `DataLoader.processPlanetaryData` into
`PlanetaryElement`s (converting moon `a_km` to AU via the shared `kmToAU`, deriving
period/mean-motion when missing), then handed to `SystemBuilder.buildSolarSystem`, which
splits the result into GPU-instanced asteroid particle systems and CPU mesh objects for
planets and moons.

**Custom-system path:**
`raw/csv_to_json.py` (pure standard library, no runtime dependencies; dev tooling pinned via
`pyproject.toml`) converts a user-supplied JPL/Horizons-style CSV into the same chunked JSON
and manifest shape as the default dataset, written to `raw/json_db/`. Two example inputs
ship in `raw/`: `atira.csv` and `kerbin_system.csv`.

This custom output is directly usable by the live app, not just importable in theory.
`main.js` reads its data directory from a runtime-configurable `DATA_BASE_PATH` (a
`?dataSource=` URL param, or a value saved under the key `heliochronicon_dataSourcePath`),
and exposes `window.switchDataSource(path)` / `window.resetDataSource()` on the browser
console. A user can point the deployed app at `raw/json_db/`, or any other directory with the
same shape, and reload to load it. The README documents this workflow under
"Custom Solar Systems."

## 7. Module inventory

`UIController.js` is a thin composition and wiring layer (around 240 lines) that
instantiates and coordinates several single-responsibility modules, wiring their `on*`
callbacks to what `main.js` expects:

- `ChronometerDisplay.js`: the oscilloscope/CRT canvas widget, fully self-contained
- `TimeThrottle.js`: the time-scale state machine (slider to multiplier/label mapping)
- `BodyListManager.js`: body-list search, sort, and render
- `TelemetryManager.js`: target telemetry panel rendering
- `VisibilityTreeManager.js`: dataset visibility tree and master-toggle logic
- `storage.js` (`StorageManager`): the `localStorage` abstraction described in §4 and §8

## 8. Known architectural debt

1. **`localStorage` is referenced from more than one file.** `StorageManager`
   (`js/storage.js`) exists specifically to keep `localStorage` access in one place and
   mockable in tests, and `TutorialManager` and the `tacticalMapColors` value both go through
   it correctly. However, the runtime-switchable data source described in §6 bypasses it:
   `main.js` makes three direct `localStorage.getItem/setItem/removeItem` calls at the top
   of the file for `DATA_SOURCE_STORAGE_KEY`. This should be routed through `StorageManager`
   for consistency and testability.

## 9. What's out of scope right now

- The single-epoch, plus or minus 40-year accuracy limitation described in §1. This is
  documented and accepted, not something actively being fixed.
- Visual and rendering feature work; see the README's own roadmap section for planned
  features.
- A full TypeScript migration.
