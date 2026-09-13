// tests/navigation/LambertSolver.test.js
import { describe, it, expect } from 'vitest';
import { LambertSolver } from '@navigation/LambertSolver.js';

// Sun-centric gravitational parameter in AU^3/day^2 (= the Gaussian
// gravitational constant k, squared: k = 0.01720209895 AU^1.5/day)
const MU_SUN_AU3_DAY2 = 0.00029591220828559115;

function magnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

describe('LambertSolver', () => {
    describe('solve', () => {
        it('matches the textbook (Curtis, Example 5.2) short-way solution', () => {
            // Earth-centric example: r1/r2 in km, mu in km^3/s^2, tof in seconds.
            const r1 = { x: 5000, y: 10000, z: 2100 };
            const r2 = { x: -14600, y: 2500, z: 7000 };
            const tof = 3600;
            const mu = 398600;

            const { departureVelocity, arrivalVelocity } = LambertSolver.solve({
                r1,
                r2,
                tof,
                mu,
            });

            expect(departureVelocity.x).toBeCloseTo(-5.9925, 3);
            expect(departureVelocity.y).toBeCloseTo(1.9254, 3);
            expect(departureVelocity.z).toBeCloseTo(3.2456, 3);

            expect(arrivalVelocity.x).toBeCloseTo(-3.3125, 3);
            expect(arrivalVelocity.y).toBeCloseTo(-4.1966, 3);
            expect(arrivalVelocity.z).toBeCloseTo(-0.3853, 3);
        });

        it('matches a near-Hohmann circular-to-circular transfer within documented tolerance', () => {

            const r1Au = 1.0;
            const r2Au = 1.523679;
            const thetaDeg = 179;
            const thetaRad = (thetaDeg * Math.PI) / 180;

            const r1 = { x: r1Au, y: 0, z: 0 };
            const r2 = { x: r2Au * Math.cos(thetaRad), y: r2Au * Math.sin(thetaRad), z: 0 };

            const semiMajorTransfer = (r1Au + r2Au) / 2;
            const hohmannDepartureSpeed = Math.sqrt(
                MU_SUN_AU3_DAY2 * (2 / r1Au - 1 / semiMajorTransfer)
            );
            const hohmannArrivalSpeed = Math.sqrt(
                MU_SUN_AU3_DAY2 * (2 / r2Au - 1 / semiMajorTransfer)
            );
            const tof = Math.PI * Math.sqrt(Math.pow(semiMajorTransfer, 3) / MU_SUN_AU3_DAY2);

            const { departureVelocity, arrivalVelocity } = LambertSolver.solve({
                r1,
                r2,
                tof,
                mu: MU_SUN_AU3_DAY2,
            });

            const departureSpeed = magnitude(departureVelocity);
            const arrivalSpeed = magnitude(arrivalVelocity);

            const TOLERANCE = 1e-3; // 0.1% - "documented tolerance" for this near-Hohmann case
            expect(
                Math.abs(departureSpeed - hohmannDepartureSpeed) / hohmannDepartureSpeed
            ).toBeLessThan(TOLERANCE);
            expect(Math.abs(arrivalSpeed - hohmannArrivalSpeed) / hohmannArrivalSpeed).toBeLessThan(
                TOLERANCE
            );
        });

        it('round-trips through propagate: departure state advanced by tof lands on r2/arrivalVelocity', () => {
            const r1 = { x: 1, y: 0, z: 0 };
            const r2 = { x: -0.9, y: 0.3, z: 0.05 };
            const tof = 200;
            const mu = MU_SUN_AU3_DAY2;

            const { departureVelocity, arrivalVelocity } = LambertSolver.solve({ r1, r2, tof, mu });
            const propagated = LambertSolver.propagate({ r0: r1, v0: departureVelocity, tof, mu });

            expect(propagated.position.x).toBeCloseTo(r2.x, 6);
            expect(propagated.position.y).toBeCloseTo(r2.y, 6);
            expect(propagated.position.z).toBeCloseTo(r2.z, 6);

            expect(propagated.velocity.x).toBeCloseTo(arrivalVelocity.x, 6);
            expect(propagated.velocity.y).toBeCloseTo(arrivalVelocity.y, 6);
            expect(propagated.velocity.z).toBeCloseTo(arrivalVelocity.z, 6);
        });

        it('solves the complementary (long way) transfer when longWay is true', () => {
            const r1 = { x: 1, y: 0, z: 0 };
            const r2 = { x: 0, y: 1.4, z: 0 };
            const tof = 150;
            const mu = MU_SUN_AU3_DAY2;

            const shortWay = LambertSolver.solve({ r1, r2, tof, mu, longWay: false });
            const longWay = LambertSolver.solve({ r1, r2, tof, mu, longWay: true });

            expect(shortWay.transferAngle).toBeCloseTo(Math.PI / 2, 6);
            expect(longWay.transferAngle).toBeCloseTo((3 * Math.PI) / 2, 6);
            // Distinct geometries should generally produce distinct solutions.
            expect(shortWay.departureVelocity.x).not.toBeCloseTo(longWay.departureVelocity.x, 3);
        });

        it('throws on a singular (0 or 180 degree) transfer geometry', () => {
            const mu = MU_SUN_AU3_DAY2;
            const collinearSameDirection = { r1: { x: 1, y: 0, z: 0 }, r2: { x: 2, y: 0, z: 0 } };
            const collinearOpposite = { r1: { x: 1, y: 0, z: 0 }, r2: { x: -1.5, y: 0, z: 0 } };

            expect(() =>
                LambertSolver.solve({ ...collinearSameDirection, tof: 100, mu })
            ).toThrow();
            expect(() => LambertSolver.solve({ ...collinearOpposite, tof: 100, mu })).toThrow();
        });

        it('throws on non-vector, non-positive, or missing inputs', () => {
            const r1 = { x: 1, y: 0, z: 0 };
            const r2 = { x: 0, y: 1, z: 0 };
            const mu = MU_SUN_AU3_DAY2;

            expect(() => LambertSolver.solve({ r1: null, r2, tof: 10, mu })).toThrow();
            expect(() => LambertSolver.solve({ r1, r2: { x: 1 }, tof: 10, mu })).toThrow();
            expect(() => LambertSolver.solve({ r1, r2, tof: 0, mu })).toThrow();
            expect(() => LambertSolver.solve({ r1, r2, tof: -10, mu })).toThrow();
            expect(() => LambertSolver.solve({ r1, r2, tof: 10, mu: 0 })).toThrow();
        });

        it('performs no propulsion / fuel / fleet computation - output is only kinematic', () => {
            const result = LambertSolver.solve({
                r1: { x: 1, y: 0, z: 0 },
                r2: { x: 0, y: 1, z: 0 },
                tof: 100,
                mu: MU_SUN_AU3_DAY2,
            });

            expect(Object.keys(result).sort()).toEqual(
                [
                    'arrivalVelocity',
                    'departureVelocity',
                    'iterations',
                    'transferAngle',
                    'universalAnomaly',
                ].sort()
            );
        });
    });

    describe('propagate', () => {
        it('returns the initial state unchanged for tof = 0', () => {
            const r0 = { x: 1, y: 0.2, z: -0.1 };
            const v0 = { x: 0.001, y: 0.017, z: 0 };

            const state = LambertSolver.propagate({ r0, v0, tof: 0, mu: MU_SUN_AU3_DAY2 });

            expect(state.position).toEqual(r0);
            expect(state.velocity).toEqual(v0);
        });

        it('conserves orbital energy (vis-viva) between the initial and propagated state', () => {
            const r0 = { x: 1, y: 0, z: 0 };
            const v0 = { x: 0, y: 0.0172, z: 0.002 };
            const mu = MU_SUN_AU3_DAY2;

            const r0Mag = magnitude(r0);
            const v0Mag = magnitude(v0);
            const energyBefore = (v0Mag * v0Mag) / 2 - mu / r0Mag;

            const { position, velocity } = LambertSolver.propagate({ r0, v0, tof: 137, mu });
            const rMag = magnitude(position);
            const vMag = magnitude(velocity);
            const energyAfter = (vMag * vMag) / 2 - mu / rMag;

            expect(energyAfter).toBeCloseTo(energyBefore, 9);
        });

        it('is reversible: propagating forward then backward returns the original state', () => {
            const r0 = { x: 1.2, y: -0.3, z: 0.1 };
            const v0 = { x: -0.002, y: 0.015, z: 0.0005 };
            const mu = MU_SUN_AU3_DAY2;

            const forward = LambertSolver.propagate({ r0, v0, tof: 90, mu });
            const back = LambertSolver.propagate({
                r0: forward.position,
                v0: forward.velocity,
                tof: -90,
                mu,
            });

            expect(back.position.x).toBeCloseTo(r0.x, 6);
            expect(back.position.y).toBeCloseTo(r0.y, 6);
            expect(back.position.z).toBeCloseTo(r0.z, 6);
        });

        it('throws on invalid inputs', () => {
            const r0 = { x: 1, y: 0, z: 0 };
            const v0 = { x: 0, y: 0.017, z: 0 };
            expect(() => LambertSolver.propagate({ r0: null, v0, tof: 10, mu: 1 })).toThrow();
            expect(() => LambertSolver.propagate({ r0, v0: null, tof: 10, mu: 1 })).toThrow();
            expect(() => LambertSolver.propagate({ r0, v0, tof: 'x', mu: 1 })).toThrow();
            expect(() => LambertSolver.propagate({ r0, v0, tof: 10, mu: -1 })).toThrow();
        });
    });

    describe('sampleTrajectory', () => {
        it('samples the requested number of points, starting and ending at the boundary states', () => {
            const r1 = { x: 1, y: 0, z: 0 };
            const r2 = { x: -0.9, y: 0.3, z: 0.05 };
            const tof = 200;
            const mu = MU_SUN_AU3_DAY2;

            const { departureVelocity } = LambertSolver.solve({ r1, r2, tof, mu });
            const points = LambertSolver.sampleTrajectory({
                r1,
                v1: departureVelocity,
                tof,
                mu,
                samples: 5,
            });

            expect(points).toHaveLength(5);
            expect(points[0].t).toBe(0);
            expect(points[0].position).toEqual(r1);
            expect(points[4].t).toBe(tof);
            expect(points[4].position.x).toBeCloseTo(r2.x, 6);
            expect(points[4].position.y).toBeCloseTo(r2.y, 6);
            expect(points[4].position.z).toBeCloseTo(r2.z, 6);
        });

        it('throws when fewer than 2 samples are requested', () => {
            const r1 = { x: 1, y: 0, z: 0 };
            const v1 = { x: 0, y: 0.017, z: 0 };
            expect(() =>
                LambertSolver.sampleTrajectory({
                    r1,
                    v1,
                    tof: 100,
                    mu: MU_SUN_AU3_DAY2,
                    samples: 1,
                })
            ).toThrow();
        });
    });
});