// @vitest-environment jsdom
// tests/integration.DataLoaderToSystemBuilder.test.js
//
// End-to-end (no-renderer) check that raw manifest-shaped rows survive
// DataLoader.processPlanetaryData intact enough for SystemBuilder to build a
// scene graph out of them without throwing, with the right shape at each hop.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataLoader } from '../js/DataLoader.js';
import { AU_IN_KM } from '../js/OrbitalMath.js';

vi.mock('../js/Shaders.js', () => ({
    Shaders: {
        getAsteroidParticleMaterial: vi.fn(() => ({})),
        createStarSpriteMat: vi.fn(() => ({})),
        createDiamondSpriteMat: vi.fn(() => ({})),
        createGroupLabelMat: vi.fn(() => ({}))
    }
}));

import { SystemBuilder } from '../js/SystemBuilder.js';

function makeCtx() {
    const celestialBodies = [];
    return {
        scene: { add: vi.fn() },
        celestialBodies,
        gpuParticleSystems: [],
        UI: { renderBodyList: vi.fn(), updateTargetPanel: vi.fn() },
        datasetMaterials: {},
        savedColors: {},
        tacticalMaterial: {},
        AU_IN_KM,
        bodyRegistry: {
            registerBody: vi.fn((cb) => celestialBodies.push(cb)),
            promote: vi.fn((cb) => celestialBodies.push(cb)),
            clearAll: vi.fn()
        },
        getCurrentTarget: vi.fn(() => null),
        onClearTarget: vi.fn(),
        onClearMemory: vi.fn()
    };
}

describe('Integration: DataLoader -> SystemBuilder (planets + moons, CPU path)', () => {
    let ctx, sb;

    beforeEach(() => {
        ctx = makeCtx();
        sb = new SystemBuilder(ctx);
    });

    // Shaped like raw rows straight out of a manifest JSON file, before any
    // DataLoader normalization -- lower-case names, string numbers, missing
    // optional fields, a moon expressed in km rather than AU.
    const rawRows = [
        { name: 'sun', category: 'STAR', parent: 'sun', radius_km: '696340' },
        {
            name: 'earth', category: 'PLANET', parent: 'sun', orbit_model: 'KEPLER',
            a_au: '1.0', e: '0.0167', i_deg: '0.00005', w_deg: '102.94719',
            node_deg: '-11.26064', m_deg: '100.46435', radius_km: '6371',
            mass_10_24_kg: '5.97'
        },
        {
            name: 'moon', category: 'MOON', parent: 'earth', orbit_model: 'MEEUS',
            a_km: '384400', e: '0.0549', radius_km: '1737.4', mass_10_24_kg: '0.073'
        }
    ];

    it('processes raw rows into a well-formed planetary dataset', () => {
        const processed = DataLoader.processPlanetaryData(rawRows, 'sol-system');

        expect(processed).toHaveLength(3);
        const moon = processed.find(r => r.name === 'MOON');
        const earth = processed.find(r => r.name === 'EARTH');
        const sun = processed.find(r => r.name === 'SUN');

        expect(sun.parent).toBe('SUN'); // self-referencing star
        expect(earth.a).toBeCloseTo(1.0, 10);
        expect(moon.a).toBeCloseTo(384400 / AU_IN_KM, 6); // km -> AU conversion happened
        expect(moon.orbit_model).toBe('MEEUS');
        expect(earth.orbit_model).toBe('KEPLER');
        expect(processed.every(r => r.datasetName === 'sol-system')).toBe(true);
        // sorted largest-radius first
        expect(processed.map(r => r.name)).toEqual(['SUN', 'EARTH', 'MOON']);
    });

    it('builds a complete scene graph from the processed data without throwing', () => {
        const processed = DataLoader.processPlanetaryData(rawRows, 'sol-system');

        expect(() => sb.buildSolarSystem(processed)).not.toThrow();

        expect(ctx.bodyRegistry.registerBody).toHaveBeenCalledTimes(3);
        expect(ctx.celestialBodies).toHaveLength(3);
        expect(ctx.UI.renderBodyList).toHaveBeenCalledTimes(1);
    });

    it('wires up correct parent/moon relationships end to end', () => {
        const processed = DataLoader.processPlanetaryData(rawRows, 'sol-system');
        sb.buildSolarSystem(processed);

        const sunBody = ctx.celestialBodies.find(b => b.data.name === 'SUN');
        const earthBody = ctx.celestialBodies.find(b => b.data.name === 'EARTH');
        const moonBody = ctx.celestialBodies.find(b => b.data.name === 'MOON');

        expect(sunBody.isMoon).toBe(false);
        expect(sunBody.orbitLine).toBeNull(); // stars don't get an orbit path
        expect(earthBody.isMoon).toBe(false);
        expect(earthBody.orbitLine).not.toBeNull();
        expect(moonBody.isMoon).toBe(true);
        expect(moonBody.data.parent).toBe('EARTH');
        expect(moonBody.orbitLine).not.toBeNull(); // MEEUS moons still get a sampled orbit path
    });

    it('carries physical radii through in AU, matching DataLoader\'s km values', () => {
        const processed = DataLoader.processPlanetaryData(rawRows, 'sol-system');
        sb.buildSolarSystem(processed);

        const earthBody = ctx.celestialBodies.find(b => b.data.name === 'EARTH');
        expect(earthBody.physicalRadius).toBeCloseTo(6371 / AU_IN_KM, 10);
    });

    it('handles a mixed manifest that also includes an asteroid group in the same pipeline run', () => {
        const asteroidRows = [
            { name: '1', category: 'ASTEROID', parent: 'sun', a_au: '2.77', e: '0.08', i_deg: '10.6', m_deg: '95.99' },
            { name: '2', category: 'ASTEROID', parent: 'sun', a_au: '2.36', e: '0.23', i_deg: '34.8', m_deg: '169.7' }
        ];
        const processedAsteroids = DataLoader.processPlanetaryData(asteroidRows, 'main-belt');
        const processedPlanets = DataLoader.processPlanetaryData(rawRows, 'sol-system');

        // Planets/moons go through the CPU path; asteroids go through the GPU particle path.
        // A real pipeline calls buildSolarSystem once per dataset chunk.
        expect(() => sb.buildSolarSystem(processedPlanets)).not.toThrow();
        expect(() => sb.buildSolarSystem(processedAsteroids)).not.toThrow();

        expect(ctx.celestialBodies).toHaveLength(3); // asteroids don't register as CelestialBody
        expect(ctx.gpuParticleSystems).toHaveLength(1);
        expect(ctx.gpuParticleSystems[0].userData.sourceData).toHaveLength(2);
    });
});
