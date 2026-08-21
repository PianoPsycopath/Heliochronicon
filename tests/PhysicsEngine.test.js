// tests/PhysicsEngine.test.js
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsEngine } from '@physics/PhysicsEngine.js';

describe('PhysicsEngine', () => {
    describe('getJ2000Days', () => {
        it('should return exactly 0 for the J2000 Epoch (Jan 1, 2000, 12:00:00 UTC)', () => {
            const date = new Date(Date.UTC(2000, 0, 1, 12, 0, 0));
            expect(PhysicsEngine.getJ2000Days(date)).toBe(0);
        });

        it('should accurately calculate exactly 1 day interval', () => {
            const date = new Date(Date.UTC(2000, 0, 2, 12, 0, 0));
            expect(PhysicsEngine.getJ2000Days(date)).toBe(1);
        });

        it('should accurately handle dates prior to J2000 (negative days)', () => {
            const date = new Date(Date.UTC(1999, 11, 31, 12, 0, 0));
            expect(PhysicsEngine.getJ2000Days(date)).toBe(-1);
        });
    });
    describe('applyMoonParentOffsets', () => {
    it('does not crash on a star whose name is not literally "SUN" (self-referencing parent)', () => {
        const star = {
            data: { name: 'KERBOL', parent: 'KERBOL' },
            isMoon: false, isCulled: false,
            globalPos: new THREE.Vector3(0, 0, 0), // set by calculateKeplerianKinematics beforehand
            localPos: new THREE.Vector3(0, 0, 0),
            poleQuaternion: new THREE.Quaternion(),
        };
        const planet = {
            data: { name: 'KERBIN', parent: 'KERBOL' },
            isMoon: false, isCulled: false,
            localPos: new THREE.Vector3(5, 0, 0),
            poleQuaternion: new THREE.Quaternion(),
        };
        const moon = {
            data: { name: 'MUN', parent: 'KERBIN' },
            isMoon: true, isCulled: false,
            localPos: new THREE.Vector3(1, 0, 0),
            poleQuaternion: new THREE.Quaternion(),
        };
        const bodies = [star, planet, moon];

        expect(() => PhysicsEngine.applyMoonParentOffsets(bodies)).not.toThrow();

        expect(star.globalPos.equals(new THREE.Vector3(0, 0, 0))).toBe(true);
        expect(planet.globalPos.equals(new THREE.Vector3(5, 0, 0))).toBe(true);
        expect(moon.globalPos.x).toBeCloseTo(6);
    });
});

    describe('calculateKeplerianKinematics', () => {
        it('treats a self-referencing parent as the star, not just a literal "SUN" name', () => {
            const star = {
                data: { name: 'KERBOL', parent: 'KERBOL', pole_ra: 0, pole_ra_rate: 0, pole_dec: 0, pole_dec_rate: 0, pm_w: 0, pm_w_rate: 0 },
                datasetVisible: true,
            };
            PhysicsEngine.calculateKeplerianKinematics([star], 0);
            expect(star.globalPos.equals(new THREE.Vector3(0, 0, 0))).toBe(true);
        });
    });
});
