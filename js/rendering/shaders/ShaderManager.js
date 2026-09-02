// js/shaders/ShaderManager.js
//
// PLAN.md Phase C: Shaders.js was an ~820-line monolith (grids, tactical
// dots, star field, eclipse overlays, terrain/night-side, ...). It's now
// split into one module per feature under js/shaders/:
//
//   grid.js       -- GridShaders       (ecliptic + equatorial reference grids)
//   tactical.js   -- TacticalShaders   (scan rim, sprites, asteroid particles, group labels)
//   starField.js  -- StarFieldShaders  (background stars + picking, magnitude LOD)
//   eclipse.js    -- EclipseShaders    (umbra/penumbra overlay)
//   nightSide.js  -- NightSideShaders  (day/night terminator shell)
//   terrain.js    -- TerrainShaders    (heightmap contour material)
//
// `Shaders` here is a thin manager that re-flattens every one of those
// static methods back onto a single class with the exact same names, so
// every existing call site (`Shaders.getGridMaterial(...)`,
// `Shaders.getStarFieldMaterial()`, etc.) keeps working unchanged. New code
// is free to import the feature module directly instead
// (`import { StarFieldShaders } from './shaders/starField.js'`); the
// flat `Shaders` surface exists for compatibility with existing call sites,
// not because it's the preferred way to consume this going forward.
import { GridShaders } from './grid.js';
import { TacticalShaders } from './tactical.js';
import { StarFieldShaders } from './starField.js';
import { EclipseShaders } from './eclipse.js';
import { NightSideShaders } from './nightSide.js';
import { TerrainShaders } from './terrain.js';
import { OrbitTrailShaders } from './orbitTrail.js';

export class Shaders {
    // grid.js
    static getGridMaterial(maxWells) {
        return GridShaders.getGridMaterial(maxWells);
    }
    static getEquatorialGridMaterial() {
        return GridShaders.getEquatorialGridMaterial();
    }

    // tactical.js
    static getTacticalMaterial() {
        return TacticalShaders.getTacticalMaterial();
    }
    static createDotTexture() {
        return TacticalShaders.createDotTexture();
    }
    static createStarSpriteMat() {
        return TacticalShaders.createStarSpriteMat();
    }
    static createDiamondSpriteMat(symbol) {
        return TacticalShaders.createDiamondSpriteMat(symbol);
    }
    static getAsteroidParticleMaterial(colorHex) {
        return TacticalShaders.getAsteroidParticleMaterial(colorHex);
    }
    static createGroupLabelMat(text, colorHex = '#ffffff', meanA = 2.5) {
        return TacticalShaders.createGroupLabelMat(text, colorHex, meanA);
    }
    static updateGroupLabelColor(labelMesh, text, colorHex, meanA = 2.5) {
        return TacticalShaders.updateGroupLabelColor(labelMesh, text, colorHex, meanA);
    }

    // starField.js
    static getStarFieldMaterial() {
        return StarFieldShaders.getStarFieldMaterial();
    }
    static getStarPickingMaterial() {
        return StarFieldShaders.getStarPickingMaterial();
    }

    // nightSide.js
    static createNightShadeMat() {
        return NightSideShaders.createNightShadeMat();
    }

    // eclipse.js
    static createEclipseShadowMat(maxShadows = 8) {
        return EclipseShaders.createEclipseShadowMat(maxShadows);
    }

    // terrain.js
    static createTerrainContourMat(heightmapTexture, elevMin = -450, elevMax = 6800) {
        return TerrainShaders.createTerrainContourMat(heightmapTexture, elevMin, elevMax);
    }
    static createOrbitTrailMaterial(options) {
        return OrbitTrailShaders.createOrbitTrailMaterial(options);
    }
}

// Re-export the feature modules too, for call sites that want to import a
// single feature directly instead of going through the flat manager.
export {
    GridShaders,
    TacticalShaders,
    StarFieldShaders,
    EclipseShaders,
    NightSideShaders,
    TerrainShaders,
    OrbitTrailShaders
};
