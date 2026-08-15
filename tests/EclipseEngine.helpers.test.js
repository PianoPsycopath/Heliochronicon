// tests/EclipseEngine.helpers.test.js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { EclipseEngine } from '../js/EclipseEngine.js';
import { AU_IN_KM } from '../js/constants.js';

describe('EclipseEngine pure helpers', () => {
    describe('_scaledA', () => {
        it('converts km -> AU for moons with large semi-major axis', () => {
            // 384400 km (real Moon distance) should come back as a small AU value
            const out = EclipseEngine._scaledA({ a: 384400 }, true);
            expect(out).toBeCloseTo(384400 / AU_IN_KM, 6);
        });

        it('leaves the value alone for moons already expressed in AU-scale numbers', () => {
            // isMoon but a <= 1000 is treated as already-AU (e.g. a synthetic tiny orbit)
            const out = EclipseEngine._scaledA({ a: 0.0025 }, true);
            expect(out).toBe(0.0025);
        });

        it('leaves the value alone for non-moons regardless of magnitude', () => {
            const out = EclipseEngine._scaledA({ a: 149597870 }, false);
            expect(out).toBe(149597870);
        });
    });

    describe('_radiusAU', () => {
        it('converts a positive radius_km into AU', () => {
            const out = EclipseEngine._radiusAU({ radius_km: 6371 });
            expect(out).toBeCloseTo(6371 / AU_IN_KM, 8);
        });

        it('falls back to a nominal 1km body when radius_km is zero or missing', () => {
            expect(EclipseEngine._radiusAU({ radius_km: 0 })).toBeCloseTo(1 / AU_IN_KM, 10);
            expect(EclipseEngine._radiusAU({})).toBeCloseTo(1 / AU_IN_KM, 10);
        });

        it('falls back for negative radius_km too', () => {
            expect(EclipseEngine._radiusAU({ radius_km: -5 })).toBeCloseTo(1 / AU_IN_KM, 10);
        });
    });

    describe('_shadowTest', () => {
        const starPos = new THREE.Vector3(0, 0, 0);
        const starRadius = 696340 / AU_IN_KM;

        it('returns null when the occulter sits exactly on the star (degenerate axis)', () => {
            const result = EclipseEngine._shadowTest(
                new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 0), 0.001, starPos, starRadius
            );
            expect(result).toBeNull();
        });

        it('returns null when the shadowed body is behind the occulter relative to the star (t <= 0)', () => {
            // Occulter is further from the star than the "shadowed" body along the axis
            const occPos = new THREE.Vector3(1, 0, 0);
            const shadowedPos = new THREE.Vector3(0.5, 0, 0); // between star and occulter -> t <= 0
            const result = EclipseEngine._shadowTest(shadowedPos, occPos, 0.001, starPos, starRadius);
            expect(result).toBeNull();
        });

        it('returns null when the shadowed body is far beyond the umbra/penumbra cone (t > D*0.10)', () => {
            const occPos = new THREE.Vector3(1, 0, 0);
            // 1 AU further past the occulter, axis distance D = 1 AU, so t/D = 1 > 0.10
            const shadowedPos = new THREE.Vector3(2, 0, 0);
            const result = EclipseEngine._shadowTest(shadowedPos, occPos, 0.001, starPos, starRadius);
            expect(result).toBeNull();
        });

        it('computes perpDist/rUmbra/rPenumbra for a body directly on-axis (perfect alignment)', () => {
            const occRadius = 0.001;
            const occPos = new THREE.Vector3(1, 0, 0);
            // Well within the 10% cone cutoff, directly behind the occulter on-axis
            const shadowedPos = new THREE.Vector3(1.01, 0, 0);
            const result = EclipseEngine._shadowTest(shadowedPos, occPos, occRadius, starPos, starRadius);

            expect(result).not.toBeNull();
            expect(result.perpDist).toBeCloseTo(0, 10);
            // Umbra should shrink and penumbra should grow with distance t behind the occulter
            expect(result.rUmbra).toBeLessThan(occRadius);
            expect(result.rPenumbra).toBeGreaterThan(occRadius);
        });

        it('reports a growing perpDist for a body offset perpendicular to the shadow axis', () => {
            const occRadius = 0.001;
            const occPos = new THREE.Vector3(1, 0, 0);
            const shadowedPos = new THREE.Vector3(1.01, 0.0005, 0);
            const result = EclipseEngine._shadowTest(shadowedPos, occPos, occRadius, starPos, starRadius);

            expect(result).not.toBeNull();
            expect(result.perpDist).toBeCloseTo(0.0005, 10);
        });
    });

    describe('_poleQuaternion', () => {
        it('produces the identity rotation when the pole points straight up (+Y / dec=90)', () => {
            const d = { pole_ra: 0, pole_ra_rate: 0, pole_dec: 90, pole_dec_rate: 0 };
            const q = EclipseEngine._poleQuaternion(d, 0);
            const v = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
            expect(v.x).toBeCloseTo(0, 6);
            expect(v.y).toBeCloseTo(1, 6);
            expect(v.z).toBeCloseTo(0, 6);
        });

        it('always returns a normalized quaternion, including with nonzero rates/time', () => {
            const d = { pole_ra: 317.68, pole_ra_rate: -0.108, pole_dec: 52.89, pole_dec_rate: -0.061 };
            const q = EclipseEngine._poleQuaternion(d, 3650); // ~10 years out
            const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
            expect(len).toBeCloseTo(1, 6);
        });
    });

    describe('_findStar', () => {
        const sun = { name: 'SUN', parent: 'SUN' };
        const earth = { name: 'EARTH', parent: 'SUN' };
        const moon = { name: 'MOON', parent: 'EARTH' };
        const allBodies = [sun, earth, moon];

        it('resolves a moon up through its planet to the self-referencing star', () => {
            expect(EclipseEngine._findStar(moon, allBodies)).toBe(sun);
        });

        it('resolves a planet directly to the star', () => {
            expect(EclipseEngine._findStar(earth, allBodies)).toBe(sun);
        });

        it('returns null and does not infinite-loop on a broken parent chain', () => {
            const orphan = { name: 'ROGUE', parent: 'NOWHERE' };
            expect(EclipseEngine._findStar(orphan, allBodies)).toBeNull();
        });
    });

    describe('_signalFromSnapshot', () => {
        it('returns signal -1 when any body is missing from the snapshot', () => {
            const shadowed = { name: 'EARTH', radius_km: 6371 };
            const occulter = { name: 'MOON', radius_km: 1737.4 };
            const star = { name: 'SUN', radius_km: 696340 };
            const incompleteSnapshot = new Map([['EARTH', new THREE.Vector3(1, 0, 0)]]);

            const { signal } = EclipseEngine._signalFromSnapshot(shadowed, occulter, star, incompleteSnapshot);
            expect(signal).toBe(-1);
        });
    });

    describe('getCandidatePairs', () => {
        const sun = { name: 'SUN', category: 'STAR', parent: 'SUN' };
        const earth = { name: 'EARTH', category: 'PLANET', parent: 'SUN' };
        const moonA = { name: 'MOON_A', category: 'MOON', parent: 'EARTH', radius_km: 1737 };
        const moonB = { name: 'MOON_B', category: 'MOON', parent: 'EARTH', radius_km: 500 };
        const allBodies = [sun, earth, moonA, moonB];

        it('builds planet<->moon pairs in both directions for a planet target', () => {
            const pairs = EclipseEngine.getCandidatePairs(earth, allBodies);
            const hasPair = (s, o) => pairs.some(p => p.shadowed.name === s && p.occulter.name === o);

            expect(hasPair('EARTH', 'MOON_A')).toBe(true);
            expect(hasPair('MOON_A', 'EARTH')).toBe(true);
            expect(hasPair('EARTH', 'MOON_B')).toBe(true);
            expect(hasPair('MOON_B', 'EARTH')).toBe(true);
        });

        it('includes moon-moon pairs among the moon pool', () => {
            const pairs = EclipseEngine.getCandidatePairs(earth, allBodies);
            const hasPair = (s, o) => pairs.some(p => p.shadowed.name === s && p.occulter.name === o);
            expect(hasPair('MOON_A', 'MOON_B')).toBe(true);
            expect(hasPair('MOON_B', 'MOON_A')).toBe(true);
        });

        it('filters pairs down to only those involving the target when a moon is the target', () => {
            const pairs = EclipseEngine.getCandidatePairs(moonA, allBodies);
            const allInvolveMoonA = pairs.every(p => p.shadowed.name === 'MOON_A' || p.occulter.name === 'MOON_A');
            expect(allInvolveMoonA).toBe(true);
            expect(pairs.length).toBeGreaterThan(0);
        });

        it('never produces a self-pair (shadowed === occulter)', () => {
            const pairs = EclipseEngine.getCandidatePairs(earth, allBodies);
            expect(pairs.every(p => p.shadowed.name !== p.occulter.name)).toBe(true);
        });

        it('caps the moon-moon pool at MAX_MOON_MOON_MEMBERS (8), keeping the largest by radius', () => {
            const manyMoons = Array.from({ length: 12 }, (_, idx) => ({
                name: `MOON_${idx}`, category: 'MOON', parent: 'EARTH', radius_km: 100 + idx
            }));
            const bodies = [sun, earth, ...manyMoons];
            const pairs = EclipseEngine.getCandidatePairs(earth, bodies);

            const moonMoonNames = new Set();
            pairs.forEach(p => {
                if (p.shadowed.name.startsWith('MOON_') && p.occulter.name.startsWith('MOON_')) {
                    moonMoonNames.add(p.shadowed.name);
                    moonMoonNames.add(p.occulter.name);
                }
            });
            // Only the 8 largest-radius moons (indices 4..11) should appear in moon-moon pairs
            expect(moonMoonNames.size).toBe(8);
            expect(moonMoonNames.has('MOON_0')).toBe(false);
            expect(moonMoonNames.has('MOON_11')).toBe(true);
        });
    });
});