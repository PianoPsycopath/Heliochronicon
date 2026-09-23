// tests/navigation/KeplerianElements.test.js
import { describe, it, expect } from 'vitest';
import {
    solveEccentricAnomaly,
    stateVectorFromKeplerianElements,
} from '@navigation/KeplerianElements.js';

const EARTH_MU_KM3_S2 = 398600.4418;
const EARTH_RADIUS_KM = 6378.137;
const LEO_ALTITUDE_KM = 300;
const LEO_A_KM = EARTH_RADIUS_KM + LEO_ALTITUDE_KM;

function magnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

describe('solveEccentricAnomaly', () => {
    it('returns the mean anomaly unchanged for a circular orbit', () => {
        expect(solveEccentricAnomaly(1.234, 0)).toBeCloseTo(1.234, 12);
        expect(solveEccentricAnomaly(0, 0)).toBeCloseTo(0, 12);
    });

    it('satisfies Kepler\'s equation for an eccentric orbit', () => {
        const M = 0.7;
        const e = 0.35;
        const E = solveEccentricAnomaly(M, e);
        expect(E - e * Math.sin(E)).toBeCloseTo(M, 10);
    });

    it('rejects a non-elliptical or non-finite eccentricity', () => {
        expect(() => solveEccentricAnomaly(0, 1)).toThrow(/eccentric/);
        expect(() => solveEccentricAnomaly(0, 1.2)).toThrow(/eccentric/);
        expect(() => solveEccentricAnomaly(0, -0.1)).toThrow(/eccentric/);
        expect(() => solveEccentricAnomaly(NaN, 0.1)).toThrow(/meanAnomalyRad/);
    });
});

describe('stateVectorFromKeplerianElements', () => {
    it('reproduces a circular equatorial orbit at periapsis (M=0)', () => {
        const { position, velocity } = stateVectorFromKeplerianElements({
            aKm: LEO_A_KM,
            e: 0,
            iRad: 0,
            raanRad: 0,
            argPeriapsisRad: 0,
            meanAnomalyRad: 0,
            muKm3PerS2: EARTH_MU_KM3_S2,
        });

        expect(position).toEqual({ x: LEO_A_KM, y: 0, z: 0 });

        const expectedSpeed = Math.sqrt(EARTH_MU_KM3_S2 / LEO_A_KM);
        expect(magnitude(velocity)).toBeCloseTo(expectedSpeed, 9);
        // Circular orbit: velocity is perpendicular to position.
        expect(position.x * velocity.x + position.y * velocity.y + position.z * velocity.z)
            .toBeCloseTo(0, 6);
    });

    it('holds |r| and |v| constant around a circular orbit regardless of mean anomaly', () => {
        const expectedSpeed = Math.sqrt(EARTH_MU_KM3_S2 / LEO_A_KM);

        for (const meanAnomalyRad of [0, 0.5, Math.PI / 2, Math.PI, 4.2]) {
            const { position, velocity } = stateVectorFromKeplerianElements({
                aKm: LEO_A_KM,
                e: 0,
                iRad: 0.3,
                raanRad: 1.1,
                argPeriapsisRad: 0.4,
                meanAnomalyRad,
                muKm3PerS2: EARTH_MU_KM3_S2,
            });

            expect(magnitude(position)).toBeCloseTo(LEO_A_KM, 6);
            expect(magnitude(velocity)).toBeCloseTo(expectedSpeed, 6);
        }
    });

    it('places periapsis and apoapsis at a(1-e) and a(1+e) for an eccentric orbit', () => {
        const aKm = 10000;
        const e = 0.2;

        const periapsis = stateVectorFromKeplerianElements({
            aKm,
            e,
            iRad: 0,
            raanRad: 0,
            argPeriapsisRad: 0,
            meanAnomalyRad: 0,
            muKm3PerS2: EARTH_MU_KM3_S2,
        });
        const apoapsis = stateVectorFromKeplerianElements({
            aKm,
            e,
            iRad: 0,
            raanRad: 0,
            argPeriapsisRad: 0,
            meanAnomalyRad: Math.PI,
            muKm3PerS2: EARTH_MU_KM3_S2,
        });

        expect(magnitude(periapsis.position)).toBeCloseTo(aKm * (1 - e), 6);
        expect(magnitude(apoapsis.position)).toBeCloseTo(aKm * (1 + e), 6);
    });

    it('rotates the orbital plane by inclination (position leaves the reference plane)', () => {
        const { position } = stateVectorFromKeplerianElements({
            aKm: LEO_A_KM,
            e: 0,
            iRad: Math.PI / 2,
            raanRad: 0,
            argPeriapsisRad: 0,
            meanAnomalyRad: Math.PI / 2,
            muKm3PerS2: EARTH_MU_KM3_S2,
        });

        // 90deg inclination, quarter-orbit along: should sit on the z-axis.
        expect(position.x).toBeCloseTo(0, 6);
        expect(position.y).toBeCloseTo(0, 6);
        expect(Math.abs(position.z)).toBeCloseTo(LEO_A_KM, 6);
    });

    it('rejects non-finite inputs and non-elliptical eccentricity/semi-major axis', () => {
        const valid = {
            aKm: LEO_A_KM,
            e: 0,
            iRad: 0,
            raanRad: 0,
            argPeriapsisRad: 0,
            meanAnomalyRad: 0,
            muKm3PerS2: EARTH_MU_KM3_S2,
        };

        expect(() => stateVectorFromKeplerianElements({ ...valid, aKm: NaN })).toThrow(/aKm/);
        expect(() => stateVectorFromKeplerianElements({ ...valid, aKm: -1 })).toThrow(/aKm/);
        expect(() => stateVectorFromKeplerianElements({ ...valid, e: 1 })).toThrow(/e/);
        expect(() => stateVectorFromKeplerianElements({ ...valid, muKm3PerS2: 0 })).toThrow(
            /muKm3PerS2/
        );
        expect(() => stateVectorFromKeplerianElements({ ...valid, iRad: undefined })).toThrow(
            /iRad/
        );
    });
});