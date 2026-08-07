# Local setup

```bash
git clone https://github.com/PianoPsycopath/Heliochronicon.git
cd Heliochronicon
npm install
npm run dev
```
For python custon-dataset

```bash
pip install -e ".[dev]"
```

# Running checks locally
```bash
npm run lint
npm test
npm run build

ruff check .
black --check .
pytest
```
All of these run in `.github/workflows/ci.yml` on every push and pull request to `main`

# Conventions
-Modules: every file under `js/` is a real ES module (`export class …`)
no relying on `<script>` tag order, no reaching into globals from a subsystem class.
-State: `main.js` is the composition root and the sole owner of shared mutable state 
(`celestialBodies`, `pickableObjects`, `systemDate`, etc.). Subsystems receive 
references and callbacks through a `ctx` object at construction time rather than reading globals directly;
this is what keeps them unit-testable. New subsystems should follow the same pattern.
-The `CelestialBody` / `PlanetaryElement` shapes are enforced by a single factory 
function and a single set of JSDoc `@typedefs` (see ARCHITECTURE.md). 
Don't construct a body object literal anywhere else; extend the factory instead.
-Unit conversion such as `kmToAU` are to be instantiated once in a single place. 
-`localStorage` is accessed through the storage wrapper only, not directly, so it stays mockable in tests.
-Pure logic first: orbital math, data parsing, and anything else that doesn't touch the 
DOM/Three.js/canvas should be written as a pure function and get a Vitest test. 
Canvas/DOM rendering code doesn't need pixel-level tests; logic it delegates to (e.g. a throttle-index → multiplier mapping) does.

# Commits & branches
-Branch off main, one logical change per branch/PR.
-Keep commits scoped; a refactor commit and a behavior-change commit are different commits, 
even in the same PR, so a future `git bisect` or review isn't guessing which one caused a regression.
