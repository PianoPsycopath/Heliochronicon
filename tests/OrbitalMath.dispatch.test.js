// tests/OrbitalMath.dispatch.test.js
import { describe, it, expect } from 'vitest';
import { OrbitalMath } from '../js/OrbitalMath.js';
import { MeeusMoon } from '../js/MeeusMoon.js';
import { VSOP87 } from '../js/vsop87.js';

describe('OrbitalMath.calculatePosition orbit_model dispatch', () => {
    it('routes MEEUS bodies straight to MeeusMoon.getPosition', () => {
        const days = 1234.5;
        const expected = MeeusMoon.getPosition(days);
        const got = OrbitalMath.calculatePosition({ orbit_model: 'MEEUS' }, days);
        expect(got).toEqual(expected);
    });

    it('routes VSOP87 bodies (no barycenter model) straight to VSOP87.getPosition', () => {
        const days = 999;
        const expected = VSOP87.getPosition('EARTH', days);
        const got = OrbitalMath.calculatePosition({ name: 'EARTH', orbit_model: 'VSOP87' }, days);
        expect(got).toEqual(expected);
    });

    it('applies a Moon-mass barycenter correction for VSOP87 bodies flagged barycenter_model MEEUS', () => {
        const days = 500;
        const heliocentric = VSOP87.getPosition('EARTH', days);
        const moonGeo = MeeusMoon.getPosition(days);
        const ratio = 1.0 / 82.30059; // default mass ratio when not overridden

        const got = OrbitalMath.calculatePosition(
            { name: 'EARTH', orbit_model: 'VSOP87', barycenter_model: 'MEEUS' }, days
        );

        expect(got.x).toBeCloseTo(heliocentric.x - moonGeo.x * ratio, 12);
        expect(got.y).toBeCloseTo(heliocentric.y - moonGeo.y * ratio, 12);
        expect(got.z).toBeCloseTo(heliocentric.z - moonGeo.z * ratio, 12);
    });

    it('honors a custom barycenter_mass_ratio override', () => {
        const days = 500;
        const heliocentric = VSOP87.getPosition('EARTH', days);
        const moonGeo = MeeusMoon.getPosition(days);
        const customRatio = 0.5;

        const got = OrbitalMath.calculatePosition(
            { name: 'EARTH', orbit_model: 'VSOP87', barycenter_model: 'MEEUS', barycenter_mass_ratio: customRatio },
            days
        );

        expect(got.x).toBeCloseTo(heliocentric.x - moonGeo.x * customRatio, 12);
    });

    it('falls back to the default Kepler propagator for unrecognized/absent orbit_model', () => {
        const bodyData = { a: 1, e: 0, i: 0, w: 0, Node: 0, M0: 0, n: 0.01, orbit_model: undefined };
        const days = 10;
        const expected = OrbitalMath.calcPosFromM(1, 0, 0, 0, 0, bodyData.M0 + bodyData.n * days);
        const got = OrbitalMath.calculatePosition(bodyData, days);
        expect(got).toEqual(expected);
    });

    it('applies w_rate and node_rate precession for the Kepler path', () => {
        const bodyData = { a: 1, e: 0.1, i: 0, w: 0, Node: 0, M0: 0, n: 0.01, w_rate: 0.001, node_rate: 0.002 };
        const days = 100;
        const expected = OrbitalMath.calcPosFromM(
            1, 0.1, 0, 0 + 0.001 * days, 0 + 0.002 * days, 0 + 0.01 * days
        );
        const got = OrbitalMath.calculatePosition(bodyData, days);
        expect(got).toEqual(expected);
    });

    it('VSOP87 for an unknown body name resolves to the origin rather than throwing', () => {
        const got = OrbitalMath.calculatePosition({ name: 'PLANET_NINE', orbit_model: 'VSOP87' }, 0);
        expect(got).toEqual({ x: 0, y: 0, z: 0 });
    });
});
