// tests/navigation/TrajectoryState.test.js
import { describe, it, expect } from 'vitest';
import {
    TRAJECTORY_FRAME,
    createTrajectoryState,
    isTrajectoryState,
    heliocentricStateFromAuPerDay,
    heliocentricStateToAuPerDay,
    bodyCenteredToHeliocentric,
    heliocentricToBodyCentered,
    trajectoryStateFromRuntimeState,
    resolveHeliocentricOrigin,
} from '@navigation/TrajectoryState.js';
import { geocentricToHeliocentric } from '@navigation/FleetPropagator.js';
import { createDefaultRuntimeState, REFERENCE_FRAME } from '@navigation/DefaultFleetState.js';
import { AU_IN_KM } from '@core/constants.js';

const EARTH_MU_KM3_S2 = 398600.4418;
const EARTH_RADIUS_KM = 6378.137;
const LEO_ALTITUDE_KM = 300;

// An Earth-like heliocentric state in EphemerisAdapter units (AU, AU/day).
// ~0.0172 AU/day is the ~29.8 km/s of Earth's orbital speed.
const EARTH_EPHEMERIS = {
    position: { x: 0.983, y: 0.176, z: 0.0001 },
    velocity: { x: -0.003, y: 0.0169, z: 0.00001 },
};

const LEO_STATE = {
    position: { x: 6678.137, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: -Math.sqrt(EARTH_MU_KM3_S2 / 6678.137) },
};

function heliocentric(overrides = {}) {
    return createTrajectoryState({
        epochDaysJ2000: 100,
        position: { x: 1, y: 0, z: 0 },
        velocity: { x: 0, y: 29.78, z: 0 },
        frame: TRAJECTORY_FRAME.HELIOCENTRIC,
        ...overrides,
    });
}

function bodyCentered(overrides = {}) {
    return createTrajectoryState({
        epochDaysJ2000: 100,
        position: { x: 6678, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: -7.7 },
        frame: TRAJECTORY_FRAME.BODY_CENTERED,
        parentBody: 'EARTH',
        ...overrides,
    });
}

function expectVectorClose(actual, expected, digits) {
    expect(actual.x).toBeCloseTo(expected.x, digits);
    expect(actual.y).toBeCloseTo(expected.y, digits);
    expect(actual.z).toBeCloseTo(expected.z, digits);
}

describe('TrajectoryState', () => {
    describe('createTrajectoryState', () => {
        it('declares frame, epoch and units on a heliocentric state', () => {
            const state = heliocentric();

            expect(state.frame).toBe('heliocentric');
            expect(state.epochDaysJ2000).toBe(100);
            expect(state.parentBody).toBeNull();
            expect(state.lengthUnit).toBe('au');
            expect(state.velocityUnit).toBe('km/s');
        });

        it('declares frame, parent and units on a body-centered state', () => {
            const state = bodyCentered();

            expect(state.frame).toBe('body-centered');
            expect(state.parentBody).toBe('EARTH');
            expect(state.lengthUnit).toBe('km');
            expect(state.velocityUnit).toBe('km/s');
        });

        it('copies its input vectors and freezes the result', () => {
            const position = { x: 1, y: 2, z: 3 };
            const velocity = { x: 4, y: 5, z: 6 };
            const state = heliocentric({ position, velocity });

            position.x = 999;
            velocity.y = 999;

            expect(state.position).toEqual({ x: 1, y: 2, z: 3 });
            expect(state.velocity).toEqual({ x: 4, y: 5, z: 6 });
            expect(Object.isFrozen(state)).toBe(true);
            expect(Object.isFrozen(state.position)).toBe(true);
            expect(Object.isFrozen(state.velocity)).toBe(true);
        });

        it('requires a body-centered state to name its parent', () => {
            expect(() => bodyCentered({ parentBody: null })).toThrow(/parentBody/);
            expect(() => bodyCentered({ parentBody: undefined })).toThrow(/parentBody/);
            expect(() => bodyCentered({ parentBody: '   ' })).toThrow(/parentBody/);
            expect(() => bodyCentered({ parentBody: 42 })).toThrow(/parentBody/);
        });

        it('rejects a parent on a heliocentric state', () => {
            expect(() => heliocentric({ parentBody: 'EARTH' })).toThrow(/heliocentric/);
        });

        it('rejects an unknown or missing frame', () => {
            expect(() => heliocentric({ frame: 'earth-centered-km' })).toThrow(/frame/);
            expect(() => heliocentric({ frame: undefined })).toThrow(/frame/);
            expect(() => createTrajectoryState()).toThrow(/frame/);
        });

        it('rejects a non-finite epoch, position or velocity', () => {
            expect(() => heliocentric({ epochDaysJ2000: NaN })).toThrow(/epochDaysJ2000/);
            expect(() => heliocentric({ epochDaysJ2000: '100' })).toThrow(/epochDaysJ2000/);
            expect(() => heliocentric({ position: { x: NaN, y: 0, z: 0 } })).toThrow(/position/);
            expect(() => heliocentric({ position: null })).toThrow(/position/);
            expect(() => heliocentric({ velocity: { x: 0, y: Infinity, z: 0 } })).toThrow(/velocity/);
        });
    });

    describe('isTrajectoryState', () => {
        it('accepts created states, including an unfrozen JSON round-trip', () => {
            expect(isTrajectoryState(heliocentric())).toBe(true);
            expect(isTrajectoryState(bodyCentered())).toBe(true);
            expect(isTrajectoryState(JSON.parse(JSON.stringify(bodyCentered())))).toBe(true);
        });

        it('rejects look-alikes with the wrong shape or units', () => {
            expect(isTrajectoryState(null)).toBe(false);
            expect(isTrajectoryState({})).toBe(false);
            expect(isTrajectoryState({ ...heliocentric(), lengthUnit: 'km' })).toBe(false);
            expect(isTrajectoryState({ ...heliocentric(), velocityUnit: 'au/day' })).toBe(false);
            expect(isTrajectoryState({ ...bodyCentered(), parentBody: null })).toBe(false);
            expect(isTrajectoryState({ ...heliocentric(), parentBody: 'EARTH' })).toBe(false);
        });
    });

    describe('legacy AU / AU-per-day boundary', () => {
        it('converts AU/day to km/s and leaves the AU position alone', () => {
            const state = heliocentricStateFromAuPerDay({
                epochDaysJ2000: 0,
                position: { x: 1, y: 0, z: 0 },
                velocity: { x: 0, y: 0.0172021, z: 0 },
            });

            expect(state.frame).toBe(TRAJECTORY_FRAME.HELIOCENTRIC);
            expect(state.position).toEqual({ x: 1, y: 0, z: 0 });
            // Earth's orbital speed, ~29.78 km/s.
            expect(state.velocity.y).toBeCloseTo(29.78, 1);
        });

        it('round-trips AU/day -> TrajectoryState -> AU/day', () => {
            const original = {
                position: { x: 0.31, y: -1.2, z: 0.02 },
                velocity: { x: 0.0123, y: 0.0045, z: -0.0006 },
            };

            const state = heliocentricStateFromAuPerDay({ epochDaysJ2000: 12, ...original });
            const back = heliocentricStateToAuPerDay(state);

            expectVectorClose(back.position, original.position, 12);
            expectVectorClose(back.velocity, original.velocity, 12);
        });

        it('hands legacy consumers unfrozen vectors', () => {
            const back = heliocentricStateToAuPerDay(heliocentric());

            expect(Object.isFrozen(back.position)).toBe(false);
            expect(Object.isFrozen(back.velocity)).toBe(false);
        });

        it('refuses to export a body-centered state as AU/day', () => {
            expect(() => heliocentricStateToAuPerDay(bodyCentered())).toThrow(/heliocentric/);
        });
    });

    describe('frame conversion', () => {
        const parent = heliocentric({
            epochDaysJ2000: 100,
            position: { x: 0.983, y: 0.176, z: 0.0001 },
            velocity: { x: -5.2, y: 29.3, z: 0.02 },
        });

        it('adds the parent offset in AU and the parent velocity in km/s', () => {
            const ship = bodyCentered({
                position: { x: 6778, y: 0, z: 0 },
                velocity: { x: 0, y: 0, z: -7.67 },
            });

            const result = bodyCenteredToHeliocentric(ship, parent);

            expect(result.frame).toBe(TRAJECTORY_FRAME.HELIOCENTRIC);
            expect(result.parentBody).toBeNull();
            expect(result.epochDaysJ2000).toBe(100);
            expect(result.position.x).toBeCloseTo(0.983 + 6778 / AU_IN_KM, 12);
            expect(result.position.y).toBeCloseTo(0.176, 12);
            expect(result.velocity.x).toBeCloseTo(-5.2, 12);
            expect(result.velocity.y).toBeCloseTo(29.3, 12);
            expect(result.velocity.z).toBeCloseTo(0.02 - 7.67, 12);
        });

        it('round-trips body-centered -> heliocentric -> body-centered', () => {
            const ship = bodyCentered({
                position: { x: 6778.5, y: -120.25, z: 33.75 },
                velocity: { x: 1.1, y: -0.4, z: -7.6 },
            });

            const back = heliocentricToBodyCentered(
                bodyCenteredToHeliocentric(ship, parent),
                parent,
                'EARTH'
            );

            expect(back.frame).toBe(TRAJECTORY_FRAME.BODY_CENTERED);
            expect(back.parentBody).toBe('EARTH');
            expectVectorClose(back.position, ship.position, 6); // within a millimetre
            expectVectorClose(back.velocity, ship.velocity, 12);
        });

        it('round-trips heliocentric -> body-centered -> heliocentric', () => {
            const ship = heliocentric({
                position: { x: 0.9831, y: 0.1759, z: 0.0002 },
                velocity: { x: -4.9, y: 29.9, z: -0.3 },
            });

            const back = bodyCenteredToHeliocentric(
                heliocentricToBodyCentered(ship, parent, 'EARTH'),
                parent
            );

            expectVectorClose(back.position, ship.position, 12);
            expectVectorClose(back.velocity, ship.velocity, 12);
        });

        it('refuses states in the wrong frame', () => {
            expect(() => bodyCenteredToHeliocentric(heliocentric(), parent)).toThrow(/body-centered/);
            expect(() => bodyCenteredToHeliocentric(bodyCentered(), bodyCentered())).toThrow(/heliocentric/);
            expect(() => heliocentricToBodyCentered(bodyCentered(), parent, 'EARTH')).toThrow(/heliocentric/);
        });

        it('refuses states at different epochs', () => {
            expect(() =>
                bodyCenteredToHeliocentric(bodyCentered({ epochDaysJ2000: 101 }), parent)
            ).toThrow(/same epoch/);
            expect(() =>
                heliocentricToBodyCentered(heliocentric({ epochDaysJ2000: 99 }), parent, 'EARTH')
            ).toThrow(/same epoch/);
        });

        it('requires a parent name when going body-centered', () => {
            expect(() => heliocentricToBodyCentered(heliocentric(), parent)).toThrow(/parentBody/);
        });

        it('does not mutate its inputs', () => {
            const ship = bodyCentered();
            const shipCopy = JSON.parse(JSON.stringify(ship));
            const parentCopy = JSON.parse(JSON.stringify(parent));

            bodyCenteredToHeliocentric(ship, parent);

            expect(JSON.parse(JSON.stringify(ship))).toEqual(shipCopy);
            expect(JSON.parse(JSON.stringify(parent))).toEqual(parentCopy);
        });
    });

    describe('trajectoryStateFromRuntimeState', () => {
        it('maps a legacy Earth-centered runtime state to a body-centered state around EARTH', () => {
            const runtimeState = createDefaultRuntimeState({
                fleet: { ships: [{ fuelVolume: 10 }] },
                earthRadiusKm: EARTH_RADIUS_KM,
                altitudeKm: LEO_ALTITUDE_KM,
                earthMuKm3PerS2: EARTH_MU_KM3_S2,
                epochDaysJ2000: 50,
            });

            const state = trajectoryStateFromRuntimeState(runtimeState);

            expect(state.frame).toBe(TRAJECTORY_FRAME.BODY_CENTERED);
            expect(state.parentBody).toBe('EARTH');
            expect(state.epochDaysJ2000).toBe(50);
            expect(state.position).toEqual(runtimeState.position);
            expect(state.velocity).toEqual(runtimeState.velocity);
        });

        it('treats a runtime state with no frame as legacy Earth-centered', () => {
            const state = trajectoryStateFromRuntimeState({
                position: { x: 7000, y: 0, z: 0 },
                velocity: { x: 0, y: 7.5, z: 0 },
                epochDaysJ2000: 1,
            });

            expect(state.frame).toBe(TRAJECTORY_FRAME.BODY_CENTERED);
            expect(state.parentBody).toBe('EARTH');
        });

        it('uses the parent named by a body-centered runtime state', () => {
            const state = trajectoryStateFromRuntimeState({
                frame: REFERENCE_FRAME.BODY_CENTERED_KM,
                parentBody: 'MARS',
                position: { x: 3700, y: 0, z: 0 },
                velocity: { x: 0, y: 3.4, z: 0 },
                epochDaysJ2000: 260,
            });

            expect(state.parentBody).toBe('MARS');
        });

        it('rejects a body-centered runtime state with no parentBody', () => {
            expect(() =>
                trajectoryStateFromRuntimeState({
                    frame: REFERENCE_FRAME.BODY_CENTERED_KM,
                    position: { x: 3700, y: 0, z: 0 },
                    velocity: { x: 0, y: 3.4, z: 0 },
                    epochDaysJ2000: 260,
                })
            ).toThrow(/parentBody/);
        });

        it('converts a heliocentric runtime state from AU/day to km/s', () => {
            const state = trajectoryStateFromRuntimeState({
                frame: REFERENCE_FRAME.HELIOCENTRIC_AU,
                position: { x: 1.2, y: 0.4, z: 0 },
                velocity: { x: 0, y: 0.0172021, z: 0 },
                epochDaysJ2000: 80,
            });

            expect(state.frame).toBe(TRAJECTORY_FRAME.HELIOCENTRIC);
            expect(state.position).toEqual({ x: 1.2, y: 0.4, z: 0 });
            expect(state.velocity.y).toBeCloseTo(29.78, 1);
        });

        it('falls back to the supplied epoch when the runtime state has none', () => {
            const runtimeState = {
                frame: REFERENCE_FRAME.EARTH_CENTERED_KM,
                position: { x: 7000, y: 0, z: 0 },
                velocity: { x: 0, y: 7.5, z: 0 },
                epochDaysJ2000: null,
            };

            expect(
                trajectoryStateFromRuntimeState(runtimeState, { fallbackEpochDaysJ2000: 33 })
                    .epochDaysJ2000
            ).toBe(33);
            expect(() => trajectoryStateFromRuntimeState(runtimeState)).toThrow(/epochDaysJ2000/);
        });

        it('rejects an unrecognised frame and a missing runtime state', () => {
            expect(() =>
                trajectoryStateFromRuntimeState({
                    frame: 'galactic',
                    position: { x: 1, y: 0, z: 0 },
                    velocity: { x: 0, y: 1, z: 0 },
                    epochDaysJ2000: 0,
                })
            ).toThrow(/frame/);
            expect(() => trajectoryStateFromRuntimeState(null)).toThrow();
        });
    });

    describe('resolveHeliocentricOrigin (the controller\'s live path)', () => {
        const EPOCH = 4200;

        function parkedRuntimeState() {
            return createDefaultRuntimeState({
                fleet: { ships: [{ fuelVolume: 10 }] },
                earthRadiusKm: EARTH_RADIUS_KM,
                altitudeKm: LEO_ALTITUDE_KM,
                earthMuKm3PerS2: EARTH_MU_KM3_S2,
            });
        }

        it('reproduces the legacy geocentricToHeliocentric result for a parked fleet', () => {
            const runtimeState = parkedRuntimeState();
            const legacy = geocentricToHeliocentric({
                position: LEO_STATE.position,
                velocity: LEO_STATE.velocity,
                earthState: EARTH_EPHEMERIS,
            });

            const origin = resolveHeliocentricOrigin({
                runtimeState,
                parkingState: LEO_STATE,
                parentEphemerisState: EARTH_EPHEMERIS,
                epochDaysJ2000: EPOCH,
            });
            const asLegacyUnits = heliocentricStateToAuPerDay(origin);

            expect(origin.frame).toBe(TRAJECTORY_FRAME.HELIOCENTRIC);
            expect(origin.epochDaysJ2000).toBe(EPOCH);
            expectVectorClose(asLegacyUnits.position, legacy.position, 12);
            expectVectorClose(asLegacyUnits.velocity, legacy.velocity, 12);
        });

        it('uses the propagated parking state, not the stale runtime snapshot', () => {
            const runtimeState = { ...parkedRuntimeState(), epochDaysJ2000: 0 };
            const propagated = {
                position: { x: 0, y: 6678.137, z: 0 },
                velocity: { x: 7.7, y: 0, z: 0 },
            };

            const origin = resolveHeliocentricOrigin({
                runtimeState,
                parkingState: propagated,
                parentEphemerisState: EARTH_EPHEMERIS,
                epochDaysJ2000: EPOCH,
            });

            expect(origin.epochDaysJ2000).toBe(EPOCH);
            expect(origin.position.y).toBeCloseTo(EARTH_EPHEMERIS.position.y + 6678.137 / AU_IN_KM, 12);
        });

        it('passes a heliocentric runtime state straight through, keeping its own epoch', () => {
            const runtimeState = {
                frame: REFERENCE_FRAME.HELIOCENTRIC_AU,
                position: { x: 1.4, y: 0.2, z: 0.01 },
                velocity: { x: -0.002, y: 0.014, z: 0 },
                epochDaysJ2000: EPOCH - 7,
            };

            const origin = resolveHeliocentricOrigin({ runtimeState, epochDaysJ2000: EPOCH });
            const asLegacyUnits = heliocentricStateToAuPerDay(origin);

            expect(origin.frame).toBe(TRAJECTORY_FRAME.HELIOCENTRIC);
            expect(origin.epochDaysJ2000).toBe(EPOCH - 7);
            expectVectorClose(asLegacyUnits.position, runtimeState.position, 12);
            expectVectorClose(asLegacyUnits.velocity, runtimeState.velocity, 12);
        });

        it('returns null when the runtime state cannot supply an origin', () => {
            expect(resolveHeliocentricOrigin({ runtimeState: null, epochDaysJ2000: EPOCH })).toBeNull();

            expect(
                resolveHeliocentricOrigin({
                    runtimeState: parkedRuntimeState(),
                    parkingState: null,
                    parentEphemerisState: EARTH_EPHEMERIS,
                    epochDaysJ2000: EPOCH,
                })
            ).toBeNull();

            expect(
                resolveHeliocentricOrigin({
                    runtimeState: parkedRuntimeState(),
                    parkingState: LEO_STATE,
                    parentEphemerisState: null,
                    epochDaysJ2000: EPOCH,
                })
            ).toBeNull();

            expect(
                resolveHeliocentricOrigin({
                    runtimeState: {
                        frame: REFERENCE_FRAME.HELIOCENTRIC_AU,
                        position: null,
                        velocity: null,
                    },
                    epochDaysJ2000: EPOCH,
                })
            ).toBeNull();
        });
    });
});