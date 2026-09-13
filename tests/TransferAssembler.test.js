// tests/navigation/TransferAssembler.test.js
import { describe, it, expect } from 'vitest';
import { TransferAssembler } from '@navigation/TransferAssembler.js';
import { EphemerisAdapter } from '@navigation/EphemerisAdapter.js';

// Sun-centric gravitational parameter in AU^3/day^2, consistent with the
// AU/day units EphemerisAdapter and OrbitalMath work in (same constant used
// in LambertSolver.test.js).
const MU_SUN_AU3_DAY2 = 0.00029591220828559115;

function isFiniteVector3(v) {
    return (
        !!v &&
        Number.isFinite(v.x) &&
        Number.isFinite(v.y) &&
        Number.isFinite(v.z)
    );
}

describe('TransferAssembler', () => {
    describe('resolveOriginState', () => {
        it('prefers the fleet\'s own tracked position/velocity when present', () => {
            const fleet = {
                position: { x: 1, y: 0, z: 0 },
                velocity: { x: 0, y: 0.0172, z: 0 },
            };

            const state = TransferAssembler.resolveOriginState({
                fleet,
                departureEpochDaysJ2000: 100,
            });

            expect(state.position).toEqual(fleet.position);
            expect(state.velocity).toEqual(fleet.velocity);
            // Returned state must be a copy, not the same object reference.
            expect(state.position).not.toBe(fleet.position);
        });

        it('falls back to the ephemeris boundary when the fleet has no tracked state', () => {
            const fleet = { position: null, velocity: null, state: 'parked' };
            const originBodyData = { name: 'EARTH', orbit_model: 'VSOP87' };
            const departureEpochDaysJ2000 = 250;

            const state = TransferAssembler.resolveOriginState({
                fleet,
                originBodyData,
                departureEpochDaysJ2000,
            });

            expect(state).toEqual(EphemerisAdapter.getState(originBodyData, departureEpochDaysJ2000));
        });

        it('throws when the fleet has no tracked state and no originBodyData fallback', () => {
            const fleet = { position: null, velocity: null };

            expect(() =>
                TransferAssembler.resolveOriginState({ fleet, departureEpochDaysJ2000: 10 })
            ).toThrow();
        });

        it('throws when no fleet is supplied', () => {
            expect(() =>
                TransferAssembler.resolveOriginState({ fleet: null, departureEpochDaysJ2000: 10 })
            ).toThrow();
        });
    });

    describe('resolveTargetState', () => {
        it('delegates to the ephemeris boundary and does not re-implement planetary motion', () => {
            const targetBodyData = { name: 'MARS', orbit_model: 'VSOP87' };
            const arrivalEpochDaysJ2000 = 400;

            const state = TransferAssembler.resolveTargetState({
                targetBodyData,
                arrivalEpochDaysJ2000,
            });

            expect(state).toEqual(EphemerisAdapter.getState(targetBodyData, arrivalEpochDaysJ2000));
        });

        it('throws when targetBodyData is missing', () => {
            expect(() =>
                TransferAssembler.resolveTargetState({
                    targetBodyData: null,
                    arrivalEpochDaysJ2000: 10,
                })
            ).toThrow();
        });

        it('throws when arrivalEpochDaysJ2000 is not a finite number', () => {
            expect(() =>
                TransferAssembler.resolveTargetState({
                    targetBodyData: { name: 'EARTH', orbit_model: 'VSOP87' },
                    arrivalEpochDaysJ2000: NaN,
                })
            ).toThrow();
        });
    });

    describe('assembleTransfer', () => {
        it('produces finite transfer velocities for an Earth-origin case using tracked fleet state', () => {
            // Fleet already tracks its own inertial state (e.g. it has flown
            // before), so no ephemeris lookup is needed for the origin.
            const fleet = {
                position: { x: 1, y: 0, z: 0 },
                velocity: { x: 0, y: 0.0172021, z: 0 },
                state: 'planning',
            };
            const targetBodyData = { name: 'MARS', orbit_model: 'VSOP87' };

            const result = TransferAssembler.assembleTransfer({
                fleet,
                targetBodyData,
                departureEpochDaysJ2000: 0,
                arrivalEpochDaysJ2000: 260,
                mu: MU_SUN_AU3_DAY2,
            });

            expect(result.tof).toBe(260);
            expect(isFiniteVector3(result.departureVelocity)).toBe(true);
            expect(isFiniteVector3(result.arrivalVelocity)).toBe(true);
            expect(Number.isFinite(result.transferAngle)).toBe(true);
            expect(Number.isFinite(result.universalAnomaly)).toBe(true);
            expect(result.trajectorySamples).toBeNull();

            expect(result.originState.position).toEqual(fleet.position);
            expect(result.targetState).toEqual(
                EphemerisAdapter.getState(targetBodyData, 260)
            );
        });

        it('uses the ephemeris boundary for the origin when the fleet is freshly parked at a body', () => {
            const fleet = { position: null, velocity: null, state: 'parked' };
            const originBodyData = { name: 'EARTH', orbit_model: 'VSOP87' };
            const targetBodyData = { name: 'MARS', orbit_model: 'VSOP87' };

            const result = TransferAssembler.assembleTransfer({
                fleet,
                originBodyData,
                targetBodyData,
                departureEpochDaysJ2000: 0,
                arrivalEpochDaysJ2000: 260,
                mu: MU_SUN_AU3_DAY2,
            });

            expect(result.originState).toEqual(EphemerisAdapter.getState(originBodyData, 0));
            expect(isFiniteVector3(result.departureVelocity)).toBe(true);
            expect(isFiniteVector3(result.arrivalVelocity)).toBe(true);
        });

        it('attaches trajectory samples when "samples" is provided, starting/ending at the endpoints', () => {
            const fleet = {
                position: { x: 1, y: 0, z: 0 },
                velocity: { x: 0, y: 0.0172021, z: 0 },
            };
            const targetBodyData = { name: 'MARS', orbit_model: 'VSOP87' };
            const arrivalEpochDaysJ2000 = 260;

            const result = TransferAssembler.assembleTransfer({
                fleet,
                targetBodyData,
                departureEpochDaysJ2000: 0,
                arrivalEpochDaysJ2000,
                mu: MU_SUN_AU3_DAY2,
                samples: 5,
            });

            expect(result.trajectorySamples).toHaveLength(5);
            expect(result.trajectorySamples[0].t).toBe(0);
            expect(result.trajectorySamples[0].position).toEqual(fleet.position);

            const last = result.trajectorySamples[4];
            expect(last.t).toBe(result.tof);
            expect(last.position.x).toBeCloseTo(result.targetState.position.x, 6);
            expect(last.position.y).toBeCloseTo(result.targetState.position.y, 6);
            expect(last.position.z).toBeCloseTo(result.targetState.position.z, 6);
        });

        it('performs no propellant/fuel/feasibility computation - only kinematic fields are returned', () => {
            const fleet = {
                position: { x: 1, y: 0, z: 0 },
                velocity: { x: 0, y: 0.0172021, z: 0 },
            };
            const targetBodyData = { name: 'MARS', orbit_model: 'VSOP87' };

            const result = TransferAssembler.assembleTransfer({
                fleet,
                targetBodyData,
                departureEpochDaysJ2000: 0,
                arrivalEpochDaysJ2000: 260,
                mu: MU_SUN_AU3_DAY2,
            });

            expect(Object.keys(result).sort()).toEqual(
                [
                    'arrivalEpochDaysJ2000',
                    'arrivalVelocity',
                    'departureEpochDaysJ2000',
                    'departureVelocity',
                    'iterations',
                    'originState',
                    'targetState',
                    'tof',
                    'trajectorySamples',
                    'transferAngle',
                    'universalAnomaly',
                ].sort()
            );
        });

        it('throws when arrivalEpochDaysJ2000 is not after departureEpochDaysJ2000', () => {
            const fleet = { position: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 0.0172, z: 0 } };
            const targetBodyData = { name: 'MARS', orbit_model: 'VSOP87' };

            expect(() =>
                TransferAssembler.assembleTransfer({
                    fleet,
                    targetBodyData,
                    departureEpochDaysJ2000: 100,
                    arrivalEpochDaysJ2000: 100,
                    mu: MU_SUN_AU3_DAY2,
                })
            ).toThrow();

            expect(() =>
                TransferAssembler.assembleTransfer({
                    fleet,
                    targetBodyData,
                    departureEpochDaysJ2000: 100,
                    arrivalEpochDaysJ2000: 50,
                    mu: MU_SUN_AU3_DAY2,
                })
            ).toThrow();
        });

        it('throws when targetBodyData is missing', () => {
            const fleet = { position: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 0.0172, z: 0 } };

            expect(() =>
                TransferAssembler.assembleTransfer({
                    fleet,
                    departureEpochDaysJ2000: 0,
                    arrivalEpochDaysJ2000: 100,
                    mu: MU_SUN_AU3_DAY2,
                })
            ).toThrow();
        });

        it('throws when the fleet has no tracked state and no originBodyData fallback', () => {
            const fleet = { position: null, velocity: null };
            const targetBodyData = { name: 'MARS', orbit_model: 'VSOP87' };

            expect(() =>
                TransferAssembler.assembleTransfer({
                    fleet,
                    targetBodyData,
                    departureEpochDaysJ2000: 0,
                    arrivalEpochDaysJ2000: 100,
                    mu: MU_SUN_AU3_DAY2,
                })
            ).toThrow();
        });
    });
});