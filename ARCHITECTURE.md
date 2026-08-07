# Heliochronicon — Architecture

This document describes how Heliochronicon actually works today: the data model, the runtime
wiring between modules, and the known debt. It exists so that (a) contributors — including
future-you — don't have to reverse-engineer the system from `main.js`, and (b) refactors have
a documented "before" to check against.

## 1. What the system does

Heliochronicon renders a real-time (or time-scrubbed) 3D model of the solar system, plus
millions of asteroids, using precalculated JPL orbital elements and pure two-body Keplerian
propagation (no N-body integration at runtime).

**Known accuracy limitation:** because each body uses a single, fixed-epoch element set with
no secular perturbation terms applied post-epoch, propagated positions are reliable for
roughly ±40 years around the element epoch (~80-year window total) and degrade outside it.
This is a deliberate scope decision, not a bug. The planned fix — generating multi-epoch
element sets so the app can pick the closest epoch to the current sim date — is the paused
`N-Raw.py` / multi-epoch `.bin` pipeline described in §6.

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
- **Prod:** `npm run build` → static assets in `dist/`; Vercel deploys from that output.
- **Tooling baseline:** ESLint + Prettier; Vitest for unit testing pure modules; CI (`.github/workflows/ci.yml`) runs
  `npm ci` → `npm run lint` → `npm run test` → `npm run build`, plus Python ruff/black/pytest.

`main.js` remains the composition root: it imports every subsystem, instantiates them, and
wires them together. Missing or circular imports fail at build/dev time instead of as a
silent runtime `ReferenceError`.

## 3. Composition pattern: manual context-object DI

The codebase already uses a deliberate, reasonable pattern worth preserving: instead of
subsystem classes reaching into globals directly, `main.js` passes each subsystem a plain
`ctx` object of references and callbacks at construction time:

```js
const systemBuilder = new SystemBuilder({
  scene, UI, celestialBodies, pickableObjects, gpuParticleSystems, ...,
  getCurrentTarget: () => currentTargetData,
  onClearTarget: () => { currentTargetData = null; trackingTargetData = null; },
});
```

This is manual dependency injection, and it's the right instinct — it's why the subsystems
are unit-testable in principle (a class only needs a fake `ctx`, not a real DOM/scene). Core math modules like `OrbitalMath` have been fully decoupled from the DOM and Three.js (returning plain `{x, y, z}` objects) allowing them to be rigorously tested in isolation.

## 4. Where state actually lives

`main.js` owns all mutable application state as top-level `let`/`const` bindings, and
everything else reaches it only through the `ctx` callbacks/getters described above:

| State | Owner | Read by |
|---|---|---|
| `celestialBodies[]` | main.js | SystemBuilder, PhysicsEngine, RenderPipeline, TacticalScanner, InteractionController |
| `pickableObjects[]` | main.js | SystemBuilder, InteractionController, TacticalScanner |
| `gpuParticleSystems[]` | main.js | SystemBuilder, RenderPipeline, TacticalScanner |
| `currentTargetData` / `trackingTargetData` | main.js | nearly everything, via `getCurrentTarget()` |
| `systemDate`, `currentOrigin` | main.js | PhysicsEngine, RenderPipeline, TacticalScanner |
| `activeDatasets` (Set) | main.js closure | only main.js |
| `savedColors` | main.js, via storage abstraction | SystemBuilder, RenderPipeline, TacticalScanner |

There's no formal store/reducer — state changes happen by direct mutation of shared arrays
and objects, coordinated by callback wiring in `main.js`. The correctness of the whole app depends on every subsystem mutating the shared `celestialBodies` array in a consistent order. This execution order is formalized into a cleanly extracted "frame pipeline" of named stages within `animate()`, passing explicit state sequentially instead of relying on global closures.

## 5. The body object: an enforced schema

Every entry in `celestialBodies[]` is a plain object built by a single, centralized factory function. This guarantees that whether a body is a primary planet, a moon, a user-promoted asteroid, or a transient radar contact, it strictly adheres to the same structural schema. It also ensures that all math/unit conversions (like `kmToAU`) happen in exactly one place.

```ts
// Enforced by the central CelestialBody factory
interface CelestialBody {
  data: PlanetaryElement;       // parsed orbital elements + metadata, see §5.1
  mesh: THREE.Mesh;
  sprite: THREE.Sprite;
  label: HTMLDivElement | null;
  orbitLine?: THREE.Line;
  orbitCurtain?: THREE.LineSegments;
  isMoon: boolean;
  scaledA: number;              // semi-major axis, AU
  physicalRadius: number;       // AU
  datasetVisible: boolean;
  isCulled: boolean;
  hideLabel: boolean;
  distToCamSq: number;
  globalPos?: THREE.Vector3;    // set per-frame by PhysicsEngine
  localPos?: THREE.Vector3;
  parentPos?: THREE.Vector3;
  parentQuat?: THREE.Quaternion;
  poleQuaternion?: THREE.Quaternion;
  W_current?: number;
}
```

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

## 6. Data pipeline (current vs. paused)

**Current, live path:**
`data/planets.json`, `data/moons.json`, `data/manifest.json` + asteroid chunk files
→ `DataLoader.fetchJSONDataset` → `DataLoader.processPlanetaryData` (parses raw rows into
`PlanetaryElement`s, converts moon `a_km` to AU, derives period/mean-motion if missing)
→ `SystemBuilder.buildSolarSystem` (splits into GPU-instanced asteroid particle systems vs.
CPU mesh objects for planets/moons).

**Paused path:** `N-Raw.py` (Python + REBOUND) was meant to produce multi-epoch binary
element buffers, to be read by a binary loader for better long-range accuracy. It stalled and is **out of scope for the current cleanup pass**.

The Python pipeline's only currently-relevant purpose is letting a user build a **custom**
solar system (their own CSV → their own JSON dataset), not powering the shipped app.

## 7. Known architectural debt (concrete, ranked)

1. Visual/rendering fidelity and new features remain open (hover tooltips, distance markers, orbit-line desync, session persistence for pins, etc.). See project Issues.
2. The single-epoch ±40-year accuracy limitation (§1) — documented, not being "fixed" in the cleanup pass.
3. Full TypeScript migration — deferred; stack is Vite + plain JS with JSDoc shapes.

(Earlier debt items — god-class UIController, OrbitalMath Three.js coupling, monolithic animate(), scattered localStorage, unenforced CelestialBody shape — were addressed in Phases 1–5.)

## 8. What's deliberately out of scope right now

- The N-Raw/multi-epoch binary pipeline (§6) — paused, not being revived in this pass.
- The single-epoch ±40-year accuracy limitation (§1) — documented, not being "fixed" here.
- Full TypeScript migration — deferred to stretch goals; stack is Vite + plain JS.
