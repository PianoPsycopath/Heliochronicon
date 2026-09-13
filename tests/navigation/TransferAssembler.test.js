// tests/navigation/TransferAssembler.test.js
import { describe, it, expect } from 'vitest';
import { TransferAssembler } from '@navigation/TransferAssembler.js';
import { EphemerisAdapter } from '@navigation/EphemerisAdapter.js';
import { Fleet } from '@navigation/Fleet.js';
import { Target } from '@navigation/Target.js';
import userFleetData from '../../public/data/fleets/userfleet.json';

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

    describe('computePropellantRequired', () => {
        it('uses the fleet\'s worst Isp and total ship weight, not a hard-coded value', () => {
            const fleet = Fleet.create(userFleetData);
            const worstIsp = Fleet.worstIsp(fleet);
            const initialMass = fleet.ships.reduce((sum, s) => sum + s.weight, 0);
            const totalDeltaV = 3.5; // km/s

            const propellantRequired = TransferAssembler.computePropellantRequired({
                fleet,
                totalDeltaV,
            });

            const g0 = 9.80665;
            const expected = initialMass * (1 - Math.exp(-(totalDeltaV * 1000) / (worstIsp * g0)));

            expect(propellantRequired).toBeCloseTo(expected, 6);
        });

        it('requires more propellant for a lower Isp, all else equal', () => {
            const highIspFleet = Fleet.create({
                id: 'high-isp',
                ships: [{ id: 's1', weight: 1000, thrust: 1, fuelType: 'x', fuelVolume: 1, shipVolume: 1, isp: 450 }],
            });
            const lowIspFleet = Fleet.create({
                id: 'low-isp',
                ships: [{ id: 's1', weight: 1000, thrust: 1, fuelType: 'x', fuelVolume: 1, shipVolume: 1, isp: 250 }],
            });

            const highIspPropellant = TransferAssembler.computePropellantRequired({
                fleet: highIspFleet,
                totalDeltaV: 4,
            });
            const lowIspPropellant = TransferAssembler.computePropellantRequired({
                fleet: lowIspFleet,
                totalDeltaV: 4,
            });

            expect(lowIspPropellant).toBeGreaterThan(highIspPropellant);
        });

        it('returns 0 for a 0 Δv budget', () => {
            const fleet = Fleet.create(userFleetData);
            expect(TransferAssembler.computePropellantRequired({ fleet, totalDeltaV: 0 })).toBeCloseTo(0, 9);
        });

        it('honors a custom velocityUnitToMetersPerSecond conversion', () => {
            const fleet = Fleet.create(userFleetData);

            const asKmPerSecond = TransferAssembler.computePropellantRequired({
                fleet,
                totalDeltaV: 3.5,
                velocityUnitToMetersPerSecond: 1000,
            });
            const asMetersPerSecond = TransferAssembler.computePropellantRequired({
                fleet,
                totalDeltaV: 3500,
                velocityUnitToMetersPerSecond: 1,
            });

            expect(asKmPerSecond).toBeCloseTo(asMetersPerSecond, 6);
        });

        it('throws for a fleet with no ships', () => {
            expect(() =>
                TransferAssembler.computePropellantRequired({ fleet: { id: 'x', ships: [] }, totalDeltaV: 1 })
            ).toThrow();
        });

        it('throws for a negative totalDeltaV', () => {
            const fleet = Fleet.create(userFleetData);
            expect(() =>
                TransferAssembler.computePropellantRequired({ fleet, totalDeltaV: -1 })
            ).toThrow();
        });
    });

    describe('buildFlightPlan', () => {
        function makeRawTransfer(overrides = {}) {
            return {
                departureEpochDaysJ2000: 0,
                arrivalEpochDaysJ2000: 260,
                tof: 260,
                originState: {
                    position: { x: 1, y: 0, z: 0 },
                    velocity: { x: 0, y: 0.0172, z: 0 },
                },
                targetState: {
                    position: { x: -0.9, y: 0.3, z: 0.05 },
                    velocity: { x: 0.001, y: -0.014, z: 0 },
                },
                departureVelocity: { x: 0.002, y: 0.0175, z: 0.0001 },
                arrivalVelocity: { x: 0.0015, y: -0.013, z: -0.0002 },
                transferAngle: 2.1,
                universalAnomaly: 4.4,
                iterations: 6,
                trajectorySamples: [
                    { t: 0, position: { x: 1, y: 0, z: 0 }, velocity: { x: 0.002, y: 0.0175, z: 0.0001 } },
                    { t: 260, position: { x: -0.9, y: 0.3, z: 0.05 }, velocity: { x: 0.0015, y: -0.013, z: -0.0002 } },
                ],
                ...overrides,
            };
        }

        function makeFleet(overrides = {}) {
            return { ...Fleet.create(userFleetData), fuelRemaining: 1_000_000, ...overrides };
        }

        it('builds a complete, feasible FlightPlan from a raw transfer', () => {
            const fleet = makeFleet();
            const target = Target.create({ bodyName: 'MARS' });
            const rawTransfer = makeRawTransfer();

            const plan = TransferAssembler.buildFlightPlan({
                fleet,
                target,
                rawTransfer,
                optimizationMode: 'time',
            });

            expect(plan.fleetId).toBe(fleet.id);
            expect(plan.target).toBe(target);
            expect(plan.departureEpochDaysJ2000).toBe(0);
            expect(plan.arrivalEpochDaysJ2000).toBe(260);
            expect(plan.burns).toHaveLength(2);
            expect(plan.arrivalPosition).toEqual(rawTransfer.targetState.position);
            expect(plan.arrivalVelocity).toEqual(rawTransfer.targetState.velocity);

            expect(plan.tof).toBe(260);
            expect(plan.optimizationMode).toBe('time');
            expect(plan.departureDv).toBeGreaterThan(0);
            expect(plan.arrivalDv).toBeGreaterThan(0);
            expect(plan.totalDv).toBeCloseTo(plan.departureDv + plan.arrivalDv, 9);
            expect(plan.totalDv).toBeCloseTo(plan.totalDeltaV, 9);
            expect(plan.trajectorySamples).toHaveLength(2);
            expect(plan.solverMeta).toMatchObject({
                transferAngle: rawTransfer.transferAngle,
                universalAnomaly: rawTransfer.universalAnomaly,
                iterations: rawTransfer.iterations,
            });

            expect(plan.propellantRequired).toBeGreaterThan(0);
            expect(plan.isFeasible).toBe(true);
            expect(plan.fuelWarning).toBeNull();
            expect(plan.warnings).toEqual([]);
            expect(plan.fuelRemainingAfter).toBeCloseTo(fleet.fuelRemaining - plan.propellantRequired, 6);
        });

        it('derives propellantRequired using the fleet\'s worst Isp', () => {
            const fleet = makeFleet();
            const target = Target.create({ bodyName: 'MARS' });
            const rawTransfer = makeRawTransfer();

            const plan = TransferAssembler.buildFlightPlan({ fleet, target, rawTransfer });

            const expected = TransferAssembler.computePropellantRequired({
                fleet,
                totalDeltaV: plan.totalDv,
            });
            expect(plan.propellantRequired).toBeCloseTo(expected, 9);
        });

        it('marks the plan infeasible with a clear fuel warning when propellant exceeds fuelRemaining', () => {
            const fleet = makeFleet({ fuelRemaining: 1 }); // far too little fuel
            const target = Target.create({ bodyName: 'MARS' });
            const rawTransfer = makeRawTransfer();

            const plan = TransferAssembler.buildFlightPlan({ fleet, target, rawTransfer });

            expect(plan.isFeasible).toBe(false);
            expect(typeof plan.fuelWarning).toBe('string');
            expect(plan.fuelWarning.length).toBeGreaterThan(0);
            expect(plan.warnings).toContain(plan.fuelWarning);
            expect(plan.fuelRemainingAfter).toBeLessThan(0);
        });

        it('sets the arrival state from the target state, not a fresh ephemeris lookup', () => {
            const fleet = makeFleet();
            const target = Target.create({ bodyName: 'MARS' });
            const rawTransfer = makeRawTransfer();

            const plan = TransferAssembler.buildFlightPlan({ fleet, target, rawTransfer });

            expect(plan.arrivalPosition).toEqual(rawTransfer.targetState.position);
            expect(plan.arrivalVelocity).toEqual(rawTransfer.targetState.velocity);
        });

        it('preserves caller-supplied warnings alongside any fuel warning', () => {
            const fleet = makeFleet({ fuelRemaining: 1 });
            const target = Target.create({ bodyName: 'MARS' });
            const rawTransfer = makeRawTransfer();

            const plan = TransferAssembler.buildFlightPlan({
                fleet,
                target,
                rawTransfer,
                warnings: ['long coast phase'],
            });

            expect(plan.warnings).toContain('long coast phase');
            expect(plan.warnings).toContain(plan.fuelWarning);
        });

        it('defaults trajectorySamples to [] when the raw transfer has none', () => {
            const fleet = makeFleet();
            const target = Target.create({ bodyName: 'MARS' });
            const rawTransfer = makeRawTransfer({ trajectorySamples: null });

            const plan = TransferAssembler.buildFlightPlan({ fleet, target, rawTransfer });

            expect(plan.trajectorySamples).toEqual([]);
        });

        it('performs no ephemeris or Lambert-solver calls of its own (pure consumer of rawTransfer)', () => {
            const fleet = makeFleet();
            const target = Target.create({ bodyName: 'MARS' });
            const rawTransfer = makeRawTransfer({
                originState: { position: { x: 999, y: 999, z: 999 }, velocity: { x: 0, y: 0, z: 0 } },
            });

            const plan = TransferAssembler.buildFlightPlan({ fleet, target, rawTransfer });
            expect(plan.burns[0].position).toEqual({ x: 999, y: 999, z: 999 });
        });

        it('throws when fleet.fuelRemaining is missing', () => {
            const fleet = Fleet.create(userFleetData); // no fuelRemaining field
            const target = Target.create({ bodyName: 'MARS' });
            const rawTransfer = makeRawTransfer();

            expect(() => TransferAssembler.buildFlightPlan({ fleet, target, rawTransfer })).toThrow();
        });

        it('throws when rawTransfer is missing required sub-states', () => {
            const fleet = makeFleet();
            const target = Target.create({ bodyName: 'MARS' });

            expect(() =>
                TransferAssembler.buildFlightPlan({
                    fleet,
                    target,
                    rawTransfer: makeRawTransfer({ originState: null }),
                })
            ).toThrow();

            expect(() =>
                TransferAssembler.buildFlightPlan({
                    fleet,
                    target,
                    rawTransfer: makeRawTransfer({ targetState: null }),
                })
            ).toThrow();
        });

        it('throws when target is missing (delegated to FlightPlan.create)', () => {
            const fleet = makeFleet();
            const rawTransfer = makeRawTransfer();

            expect(() =>
                TransferAssembler.buildFlightPlan({ fleet, target: null, rawTransfer })
            ).toThrow();
        });
    });
});