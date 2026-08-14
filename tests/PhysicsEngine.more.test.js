// tests/PhysicsEngine.more.test.js
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '../js/PhysicsEngine.js';

describe('PhysicsEngine.updateSystemTime', () => {
    it('advances the date by deltaSec * timeMultiplier and reports the matching J2000 day offset', () => {
        const start = new Date(Date.UTC(2000, 0, 1, 12, 0, 0)); // J2000 epoch exactly
        const UI = { timeMultiplier: 10, updateTimeInput: vi.fn() };

        const { newDate, daysSinceJ2000 } = PhysicsEngine.updateSystemTime(UI, start, 8640); // 1 day * 10x in seconds

        expect(daysSinceJ2000).toBeCloseTo(1, 10);
        expect(UI.updateTimeInput).toHaveBeenCalledWith(newDate);
    });

    it('does not advance the clock (or call updateTimeInput) when paused (timeMultiplier === 0)', () => {
        const start = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
        const UI = { timeMultiplier: 0, updateTimeInput: vi.fn() };

        const { newDate, daysSinceJ2000 } = PhysicsEngine.updateSystemTime(UI, start, 8640);

        expect(newDate).toBe(start);
        expect(daysSinceJ2000).toBe(0);
        expect(UI.updateTimeInput).not.toHaveBeenCalled();
    });

    it('runs time backward for a negative multiplier', () => {
        const start = new Date(Date.UTC(2000, 0, 2, 12, 0, 0)); // +1 day from J2000
        const UI = { timeMultiplier: -1, updateTimeInput: vi.fn() };

        const { daysSinceJ2000 } = PhysicsEngine.updateSystemTime(UI, start, 86400); // -1 day worth of seconds

        expect(daysSinceJ2000).toBeCloseTo(0, 10);
    });
});

describe('PhysicsEngine.calculateKeplerianKinematics', () => {
    const baseBody = (overrides = {}) => {
        const { data: dataOverrides, ...restOverrides } = overrides;
        return {
            data: {
                name: 'X', parent: 'SUN', a: 1, e: 0, i: 0, w: 0, Node: 0, M0: 0, n: 0.01,
                pole_ra: 0, pole_ra_rate: 0, pole_dec: 90, pole_dec_rate: 0, pm_w: 0, pm_w_rate: 0,
                datasetCategory: 'PLANET', ...dataOverrides
            },
            datasetVisible: true,
            ...restOverrides
        };
    };

    it('culls bodies whose datasetVisible flag is false and skips further processing on them', () => {
        const body = baseBody({ datasetVisible: false });
        PhysicsEngine.calculateKeplerianKinematics([body], 0);
        expect(body.isCulled).toBe(true);
        // Should bail out before computing pole/position for culled bodies
        expect(body.globalPos).toBeUndefined();
    });

    it('un-culls a visible body and clears hideLabel unless it is a RADAR_CONTACT', () => {
        const normal = baseBody({ hideLabel: true });
        const radar = baseBody({ hideLabel: true, data: { datasetCategory: 'RADAR_CONTACT' } });

        PhysicsEngine.calculateKeplerianKinematics([normal, radar], 0);

        expect(normal.isCulled).toBe(false);
        expect(normal.hideLabel).toBe(false);
        expect(radar.hideLabel).toBe(true); // untouched for radar contacts
    });

    it('places a self-referencing star at the origin for both local and global position', () => {
        const star = baseBody({ data: { name: 'SUN', parent: 'SUN' } });
        PhysicsEngine.calculateKeplerianKinematics([star], 0);
        expect(star.localPos.equals(new THREE.Vector3(0, 0, 0))).toBe(true);
        expect(star.globalPos.equals(new THREE.Vector3(0, 0, 0))).toBe(true);
    });

    it('computes a non-star body position via OrbitalMath and clones it into globalPos', () => {
        const planet = baseBody();
        PhysicsEngine.calculateKeplerianKinematics([planet], 0);
        expect(planet.localPos).toBeInstanceOf(THREE.Vector3);
        expect(planet.globalPos.equals(planet.localPos)).toBe(true);
        expect(planet.globalPos).not.toBe(planet.localPos); // must be a clone, not aliased
    });

    it('produces a normalized pole quaternion and stores current RA/DEC/W', () => {
        const body = baseBody({ data: { pole_ra: 45, pole_dec: 30, pm_w: 10, pm_w_rate: 1 } });
        PhysicsEngine.calculateKeplerianKinematics([body], 10);
        const q = body.poleQuaternion;
        const len = Math.sqrt(q.x ** 2 + q.y ** 2 + q.z ** 2 + q.w ** 2);
        expect(len).toBeCloseTo(1, 6);
        expect(body.RA_current_deg).toBeCloseTo(45, 10);
        expect(body.DEC_current_deg).toBeCloseTo(30, 10);
    });
});

describe('PhysicsEngine.applyMoonParentOffsets', () => {
    it('skips culled bodies entirely (no globalPos mutation)', () => {
        const moon = {
            data: { name: 'MOON', parent: 'EARTH' }, isMoon: true, isCulled: true,
            localPos: new THREE.Vector3(1, 0, 0)
        };
        PhysicsEngine.applyMoonParentOffsets([moon]);
        expect(moon.globalPos).toBeUndefined();
    });

    it('skips self-referencing stars (parent === name)', () => {
        const star = {
            data: { name: 'SUN', parent: 'SUN' }, isMoon: false, isCulled: false,
            localPos: new THREE.Vector3(0, 0, 0)
        };
        PhysicsEngine.applyMoonParentOffsets([star]);
        expect(star.globalPos).toBeUndefined();
    });

    it('does NOT apply the parent pole quaternion to a MEEUS-model moon (already ecliptic)', () => {
        const parent = {
            data: { name: 'EARTH', parent: 'SUN' }, isMoon: false, isCulled: false,
            localPos: new THREE.Vector3(2, 0, 0),
            globalPos: new THREE.Vector3(2, 0, 0),
            // A pole quaternion that would rotate +X into +Y if (wrongly) applied
            poleQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
        };
        const moon = {
            data: { name: 'MOON', parent: 'EARTH', orbit_model: 'MEEUS' }, isMoon: true, isCulled: false,
            localPos: new THREE.Vector3(1, 0, 0)
        };
        PhysicsEngine.applyMoonParentOffsets([parent, moon]);

        // Unrotated local pos (1,0,0) + parent (2,0,0) = (3,0,0)
        expect(moon.globalPos.x).toBeCloseTo(3, 10);
        expect(moon.globalPos.y).toBeCloseTo(0, 10);
    });

    it('DOES apply the parent pole quaternion to a default/KEPLER-model moon', () => {
        const parent = {
            data: { name: 'EARTH', parent: 'SUN' }, isMoon: false, isCulled: false,
            localPos: new THREE.Vector3(2, 0, 0),
            globalPos: new THREE.Vector3(2, 0, 0),
            poleQuaternion: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2)
        };
        const moon = {
            data: { name: 'MOON', parent: 'EARTH' }, isMoon: true, isCulled: false, // orbit_model absent -> KEPLER
            localPos: new THREE.Vector3(1, 0, 0)
        };
        PhysicsEngine.applyMoonParentOffsets([parent, moon]);

        // (1,0,0) rotated 90deg about Z -> (0,1,0); + parent (2,0,0) = (2,1,0)
        expect(moon.globalPos.x).toBeCloseTo(2, 6);
        expect(moon.globalPos.y).toBeCloseTo(1, 6);
    });

    it('treats a non-moon planet as a plain local+parent(origin) sum', () => {
        const planet = {
            data: { name: 'EARTH', parent: 'SUN' }, isMoon: false, isCulled: false,
            localPos: new THREE.Vector3(5, 1, 0)
        };
        PhysicsEngine.applyMoonParentOffsets([planet]);
        expect(planet.globalPos.equals(new THREE.Vector3(5, 1, 0))).toBe(true);
        expect(planet.parentPos.equals(new THREE.Vector3(0, 0, 0))).toBe(true);
    });

    it('falls through to the plain sum when a moon\'s parent body cannot be found in the array', () => {
        const orphanMoon = {
            data: { name: 'MOON', parent: 'GHOST_PLANET' }, isMoon: true, isCulled: false,
            localPos: new THREE.Vector3(1, 2, 3)
        };
        PhysicsEngine.applyMoonParentOffsets([orphanMoon]);
        expect(orphanMoon.globalPos.equals(new THREE.Vector3(1, 2, 3))).toBe(true);
    });
});

describe('PhysicsEngine.zSortCelestialBodies', () => {
    const mkBody = (name, radius_km, globalPos, isCulled = false) => ({
        data: { name, parent: 'SUN', radius_km },
        globalPos: new THREE.Vector3(...globalPos),
        isCulled,
        distToCamSq: 0
    });

    it('sorts larger bodies first regardless of distance', () => {
        const small = mkBody('SMALL', 100, [0, 0, 0]);
        const big = mkBody('BIG', 6000, [100, 0, 0]); // far away, but bigger
        const bodies = [small, big];

        PhysicsEngine.zSortCelestialBodies(bodies, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));

        expect(bodies[0].data.name).toBe('BIG');
    });

    it('breaks ties in radius by nearer distance to camera first', () => {
        const near = mkBody('NEAR', 1000, [1, 0, 0]);
        const far = mkBody('FAR', 1000, [10, 0, 0]);
        const bodies = [far, near];

        PhysicsEngine.zSortCelestialBodies(bodies, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));

        expect(bodies[0].data.name).toBe('NEAR');
    });

    it('breaks remaining ties alphabetically by name', () => {
        const b = mkBody('BBB', 1000, [5, 0, 0]);
        const a = mkBody('AAA', 1000, [5, 0, 0]);
        const bodies = [b, a];

        PhysicsEngine.zSortCelestialBodies(bodies, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));

        expect(bodies.map(x => x.data.name)).toEqual(['AAA', 'BBB']);
    });

    it('does not compute distToCamSq for culled bodies or self-referencing stars', () => {
        const star = mkBody('SUN', 696340, [0, 0, 0]);
        star.data.parent = 'SUN'; // self-referencing
        const culled = mkBody('HIDDEN', 500, [3, 0, 0], true);

        PhysicsEngine.zSortCelestialBodies([star, culled], new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0));

        expect(star.distToCamSq).toBe(0); // untouched (initial value), not computed
        expect(culled.distToCamSq).toBe(0);
    });
});
