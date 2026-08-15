// @vitest-environment jsdom
// tests/SystemBuilder.test.js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as THREE from 'three';
import { OrbitalMath, kmToAU } from '../js/OrbitalMath.js';
import { AU_IN_KM } from '../js/constants.js';

// Shaders.js was not supplied; mock it so SystemBuilder's own branching logic runs
// without depending on real shader/material construction.
vi.mock('../js/Shaders.js', () => ({
    Shaders: {
        getAsteroidParticleMaterial: vi.fn((color) => new THREE.PointsMaterial({ color })),
        createStarSpriteMat: vi.fn(() => new THREE.SpriteMaterial()),
        createDiamondSpriteMat: vi.fn((symbol) => new THREE.SpriteMaterial()),
        createGroupLabelMat: vi.fn((text, colorHex, meanA) => new THREE.MeshBasicMaterial())
    }
}));

import { Shaders } from '../js/Shaders.js';
import { SystemBuilder } from '../js/SystemBuilder.js';

beforeEach(() => {
    Shaders.getAsteroidParticleMaterial.mockClear();
    Shaders.createStarSpriteMat.mockClear();
    Shaders.createDiamondSpriteMat.mockClear();
    Shaders.createGroupLabelMat.mockClear();
});

function makeCtx(overrides = {}) {
    const celestialBodies = overrides.celestialBodies || [];
    return {
        scene: { add: vi.fn() },
        celestialBodies,
        gpuParticleSystems: [],
        UI: { renderBodyList: vi.fn(), updateTargetPanel: vi.fn() },
        datasetMaterials: {},
        savedColors: {},
        tacticalMaterial: {},
        dotTexture: {},
        AU_IN_KM,
        bodyRegistry: {
            registerBody: vi.fn((cb) => celestialBodies.push(cb)),
            promote: vi.fn((cb) => celestialBodies.push(cb)),
            clearAll: vi.fn()
        },
        getCurrentTarget: vi.fn(() => null),
        onClearTarget: vi.fn(),
        onClearMemory: vi.fn(),
        ...overrides
    };
}

const planetRow = (over = {}) => ({
    name: 'EARTH', category: 'PLANET', parent: 'SUN', datasetCategory: 'PLANET', datasetName: 'planets',
    a: 1, e: 0.01, i: 0, w: 0, Node: 0, M0: 0, n: 0.017, radius_km: 6371, symbol: '•', ...over
});
const moonRow = (over = {}) => ({
    name: 'MOON', category: 'MOON', parent: 'EARTH', datasetCategory: 'MOON', datasetName: 'moons',
    a: kmToAU(384400), e: 0.05, i: 0, w: 0, Node: 0, M0: 0, n: 0.229, radius_km: 1737, symbol: '○', ...over
});
const sunRow = (over = {}) => ({
    name: 'SUN', category: 'STAR', parent: 'SUN', datasetCategory: 'STAR', datasetName: 'star',
    a: 0, e: 0, i: 0, w: 0, Node: 0, M0: 0, n: 0, radius_km: 696340, symbol: '*', ...over
});
const asteroidRow = (over = {}) => ({
    name: 'CERES', category: 'ASTEROID', parent: 'SUN', datasetCategory: 'ASTEROID', datasetName: 'main-belt',
    a: 2.77, e: 0.08, i: 0.18, w: 1.2, Node: 1.4, M0: 0.3, n: 0.0033, radius_km: 0, symbol: '•', ...over
});

describe('SystemBuilder.getTacticalA', () => {
    let sb;
    beforeEach(() => { sb = new SystemBuilder(makeCtx()); });

    it('converts km -> AU for moons with a > 1000', () => {
        expect(sb.getTacticalA({ a: 384400 }, true)).toBeCloseTo(kmToAU(384400), 8);
    });
    it('leaves small (already-AU) values alone even for moons', () => {
        expect(sb.getTacticalA({ a: 0.5 }, true)).toBe(0.5);
    });
    it('leaves the value alone for non-moons regardless of magnitude', () => {
        expect(sb.getTacticalA({ a: 149597870 }, false)).toBe(149597870);
    });
});

describe('SystemBuilder.createOrbitPath', () => {
    let sb;
    beforeEach(() => { sb = new SystemBuilder(makeCtx()); });

    it('builds a Kepler ellipse with 721 points (resolution 720 + 1) for the default orbit model', () => {
        const line = sb.createOrbitPath(planetRow(), 1);
        expect(line).toBeInstanceOf(THREE.Line);
        expect(line.geometry.attributes.position.count).toBe(721);
        expect(line.renderOrder).toBe(2);
    });

    it('uses OrbitalMath.calculatePosition (period-based sampling) for MEEUS/VSOP87 models', () => {
        const spy = vi.spyOn(OrbitalMath, 'calculatePosition');
        const data = { ...planetRow(), orbit_model: 'MEEUS', period: 27.32 };

        const line = sb.createOrbitPath(data, 1);

        expect(spy).toHaveBeenCalledTimes(721);
        expect(spy.mock.calls[1][1]).toBeCloseTo(27.32 / 720, 8); // days = (j/res) * period
        expect(line.geometry.attributes.position.count).toBe(721);
        spy.mockRestore();
    });

    it('sets a thicker line for PLANET than MOON than everything else', () => {
        const planetLine = sb.createOrbitPath(planetRow(), 1);
        const moonLine = sb.createOrbitPath(moonRow(), kmToAU(384400));
        const otherLine = sb.createOrbitPath(asteroidRow(), 2.77);

        expect(planetLine.material.linewidth).toBe(3);
        expect(moonLine.material.linewidth).toBe(2);
        expect(otherLine.material.linewidth).toBe(1);
    });
});

describe('SystemBuilder.createOrbitCurtain', () => {
    it('returns a hidden LineSegments with renderOrder 1', () => {
        const sb = new SystemBuilder(makeCtx());
        const curtain = sb.createOrbitCurtain();
        expect(curtain).toBeInstanceOf(THREE.LineSegments);
        expect(curtain.visible).toBe(false);
        expect(curtain.renderOrder).toBe(1);
    });
});

describe('SystemBuilder.clearSolarSystem', () => {
    it('clears the registry and resets target/UI/memory state in the right order of calls', () => {
        const ctx = makeCtx();
        const sb = new SystemBuilder(ctx);

        sb.clearSolarSystem();

        expect(ctx.bodyRegistry.clearAll).toHaveBeenCalledTimes(1);
        expect(ctx.onClearTarget).toHaveBeenCalledTimes(1);
        expect(ctx.UI.updateTargetPanel).toHaveBeenCalledWith(null);
        expect(ctx.UI.renderBodyList).toHaveBeenCalledWith(ctx.celestialBodies, null);
        expect(ctx.onClearMemory).toHaveBeenCalledTimes(1);
    });
});

describe('SystemBuilder.buildSolarSystem — empty input', () => {
    it('does nothing when planetaryData is empty', () => {
        const ctx = makeCtx();
        const sb = new SystemBuilder(ctx);
        sb.buildSolarSystem([]);
        expect(ctx.scene.add).not.toHaveBeenCalled();
        expect(ctx.UI.renderBodyList).not.toHaveBeenCalled();
    });
});

describe('SystemBuilder.buildSolarSystem — ASTEROID (GPU particle) path', () => {
    it('builds a single GPU particle system + group label, with correctly encoded attributes', () => {
        const ctx = makeCtx();
        const sb = new SystemBuilder(ctx);
        const rows = [
            asteroidRow({ name: 'A1', a: 2.0 }),
            asteroidRow({ name: 'A2', a: 3.0 }),
            asteroidRow({ name: 'A3', a: 2.5 })
        ];

        sb.buildSolarSystem(rows);

        expect(ctx.gpuParticleSystems).toHaveLength(1);
        expect(ctx.scene.add).toHaveBeenCalledTimes(2); // particleSystem + groupLabel
        expect(ctx.datasetMaterials['main-belt']).toBeDefined();
        expect(ctx.UI.renderBodyList).toHaveBeenCalledWith(ctx.celestialBodies, null);

        const particleSystem = ctx.gpuParticleSystems[0];
        expect(particleSystem.userData.datasetName).toBe('main-belt');
        expect(particleSystem.userData.datasetVisible).toBe(true);
        expect(Array.from(particleSystem.geometry.getAttribute('a').array)).toEqual([2.0, 3.0, 2.5]);
        expect(particleSystem.userData.aSpread).toBeCloseTo(1.0, 10); // 3.0 - 2.0
        expect(particleSystem.userData.groupLabel).toBeDefined();
    });

    it('does not touch bodyRegistry or celestialBodies for asteroid datasets', () => {
        const ctx = makeCtx();
        const sb = new SystemBuilder(ctx);
        sb.buildSolarSystem([asteroidRow()]);
        expect(ctx.bodyRegistry.registerBody).not.toHaveBeenCalled();
        expect(ctx.celestialBodies).toHaveLength(0);
    });
});

describe('SystemBuilder.buildSolarSystem — CPU (planet/moon) path', () => {
    it('registers one CelestialBody per row and marks the self-referencing row as the sun', () => {
        const ctx = makeCtx();
        const sb = new SystemBuilder(ctx);

        sb.buildSolarSystem([sunRow(), planetRow(), moonRow()]);

        expect(ctx.bodyRegistry.registerBody).toHaveBeenCalledTimes(3);
        expect(ctx.celestialBodies).toHaveLength(3);

        const sunBody = ctx.celestialBodies.find(b => b.data.name === 'SUN');
        const earthBody = ctx.celestialBodies.find(b => b.data.name === 'EARTH');
        const moonBody = ctx.celestialBodies.find(b => b.data.name === 'MOON');

        expect(sunBody.baseRenderOrder).toBe(2000);
        expect(sunBody.isMoon).toBe(false);
        expect(sunBody.mesh.visible).toBe(true); // never hidden for the sun
        expect(sunBody.orbitLine).toBeNull();
        expect(sunBody.orbitCurtain).toBeNull();
        expect(sunBody.physicalRadius).toBeCloseTo(696340 / AU_IN_KM, 10);

        expect(earthBody.baseRenderOrder).toBe(1000);
        expect(earthBody.isMoon).toBe(false);
        expect(earthBody.mesh.visible).toBe(false); // hidden until sprite-based render kicks in
        expect(earthBody.orbitLine).not.toBeNull();
        expect(earthBody.orbitCurtain).not.toBeNull();

        expect(moonBody.baseRenderOrder).toBe(800);
        expect(moonBody.isMoon).toBe(true);
        expect(moonBody.mesh.visible).toBe(false);
    });

    it('creates one label element per body and appends it to document.body', () => {
        const ctx = makeCtx();
        const sb = new SystemBuilder(ctx);
        const before = document.querySelectorAll('.tactical-label').length;

        sb.buildSolarSystem([sunRow(), planetRow()]);

        const after = document.querySelectorAll('.tactical-label').length;
        expect(after - before).toBe(2);
    });

    it('routes sun vs. non-sun sprite materials through the correct Shaders factory', () => {
        const ctx = makeCtx();
        const sb = new SystemBuilder(ctx);

        sb.buildSolarSystem([sunRow(), planetRow()]);

        expect(Shaders.createStarSpriteMat).toHaveBeenCalledTimes(1);
        expect(Shaders.createDiamondSpriteMat).toHaveBeenCalledWith('•');
    });

    it('skips rows whose name is already registered in celestialBodies (dedupe across overlapping chunks)', () => {
        const existing = { data: { name: 'EARTH' } };
        const ctx = makeCtx({ celestialBodies: [existing] });
        const sb = new SystemBuilder(ctx);

        sb.buildSolarSystem([planetRow()]);

        expect(ctx.bodyRegistry.registerBody).not.toHaveBeenCalled();
        expect(ctx.celestialBodies).toHaveLength(1); // still just the pre-existing stub
    });

    it('falls back to a nominal 1km-equivalent physicalRadius when radius_km is missing/zero', () => {
        const ctx = makeCtx();
        const sb = new SystemBuilder(ctx);
        sb.buildSolarSystem([planetRow({ radius_km: 0 })]);
        const body = ctx.celestialBodies[0];
        expect(body.physicalRadius).toBeCloseTo(1.0 / AU_IN_KM, 10);
    });

    it('processes datasets larger than CHUNK_SIZE across multiple requestAnimationFrame ticks', () => {
        const rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation((cb) => { cb(); return 1; });
        const ctx = makeCtx();
        const sb = new SystemBuilder(ctx);

        const rows = Array.from({ length: 200 }, (_, idx) => planetRow({ name: `P${idx}`, parent: 'SUN' }));
        sb.buildSolarSystem(rows);

        expect(rafSpy).toHaveBeenCalled(); // had to continue past CHUNK_SIZE=150
        expect(ctx.bodyRegistry.registerBody).toHaveBeenCalledTimes(200);
        expect(ctx.UI.renderBodyList).toHaveBeenCalledTimes(1); // only called once, at the very end
        rafSpy.mockRestore();
    });
});

describe('SystemBuilder.createGroupLabel', () => {
    it('uses the minimum size multiplier at/below the minimum spread', () => {
        const sb = new SystemBuilder(makeCtx());
        const mesh = sb.createGroupLabel('main-belt', '#ffff00', 2.7, 0.05);
        const expectedSize = 3.0 * 0.8;
        expect(mesh.geometry.parameters.width).toBeCloseTo(expectedSize, 6);
    });

    it('uses the maximum size multiplier at/above the maximum spread', () => {
        const sb = new SystemBuilder(makeCtx());
        const mesh = sb.createGroupLabel('main-belt', '#ffff00', 2.7, 5.0); // beyond SPREAD_MAX
        const expectedSize = 3.0 * 2.0;
        expect(mesh.geometry.parameters.width).toBeCloseTo(expectedSize, 6);
    });

    it('forwards text/color/meanA to Shaders.createGroupLabelMat', () => {
        const sb = new SystemBuilder(makeCtx());
        sb.createGroupLabel('kuiper-belt', '#00ffff', 42, 0.3);
        expect(Shaders.createGroupLabelMat).toHaveBeenCalledWith('kuiper-belt', '#00ffff', 42);
    });
});

describe('SystemBuilder.promoteAsteroidToCPU', () => {
    it('promotes a new asteroid: adds scene objects, a label, and calls bodyRegistry.promote', () => {
        const ctx = makeCtx();
        const sb = new SystemBuilder(ctx);
        const asteroidData = asteroidRow({ name: 'RADAR1', radius_km: 5 });

        sb.promoteAsteroidToCPU(asteroidData);

        expect(ctx.bodyRegistry.promote).toHaveBeenCalledTimes(1);
        const [cbArg, keyArg] = ctx.bodyRegistry.promote.mock.calls[0];
        expect(cbArg.data.name).toBe('RADAR1');
        expect(cbArg.data.datasetCategory).toBe('PROMOTED_ASTEROID');
        expect(keyArg).toEqual({ name: 'RADAR1', category: 'RADAR_CONTACT' });

        // mesh + sprite + orbitLine + orbitCurtain
        expect(ctx.scene.add).toHaveBeenCalledTimes(4);
    });

    it('is a no-op if the same name is already promoted', () => {
        const already = { data: { name: 'RADAR1', datasetCategory: 'PROMOTED_ASTEROID' } };
        const ctx = makeCtx({ celestialBodies: [already] });
        const sb = new SystemBuilder(ctx);

        sb.promoteAsteroidToCPU(asteroidRow({ name: 'RADAR1' }));

        expect(ctx.bodyRegistry.promote).not.toHaveBeenCalled();
        expect(ctx.scene.add).not.toHaveBeenCalled();
    });

    it('falls back to a nominal physicalRadius when radius_km is missing/zero', () => {
        const ctx = makeCtx();
        const sb = new SystemBuilder(ctx);
        sb.promoteAsteroidToCPU(asteroidRow({ name: 'RADAR2', radius_km: 0 }));
        const [cbArg] = ctx.bodyRegistry.promote.mock.calls[0];
        expect(cbArg.physicalRadius).toBeCloseTo(1.0 / AU_IN_KM, 10);
    });

    it('colors the orbit line using savedColors when available, defaulting to cyan otherwise', () => {
        const ctx = makeCtx({ savedColors: { 'main-belt': '#123456' } });
        const sb = new SystemBuilder(ctx);
        sb.promoteAsteroidToCPU(asteroidRow({ name: 'RADAR3', datasetName: 'main-belt' }));
        const [cbArg] = ctx.bodyRegistry.promote.mock.calls[0];
        expect(cbArg.orbitLine.material.color.getHexString()).toBe('123456');
    });
});