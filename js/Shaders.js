// js/Shaders.js
//
// PLAN.md Phase C: the monolithic shader factory has been split into
// per-feature modules under js/shaders/, aggregated by js/shaders/ShaderManager.js.
// This file is kept as a re-export so every existing `import { Shaders } from
// './Shaders.js'` call site across the codebase (main.js, SystemBuilder.js,
// TerrainController.js, DaylightController.js, EclipseShadowController.js,
// InteractionController.js, StarLoader.js, ...) keeps working with zero
// changes. New code should prefer importing js/shaders/ShaderManager.js (or
// a specific feature module) directly.
export { Shaders } from './shaders/ShaderManager.js';
