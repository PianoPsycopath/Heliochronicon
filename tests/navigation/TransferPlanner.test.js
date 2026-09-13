// tests/navigation/TransferPlanner.test.js
import { describe, it, expect } from 'vitest';
import { calculateImpulsiveTransfer } from '@navigation/TransferPlanner.js';
import { TransferAssembler } from '@navigation/TransferAssembler.js';
import { Fleet } from '@navigation/Fleet.js';
import { Target } from '@navigation/Target.js';
import userFleetData from '../../public/data/fleets/userfleet.json';

// Sun-centric gravitational parameter in AU^3/day^2, matching the AU/day
const MU_SUN_AU3_DAY2 = 0.00029591220828559115;

function makeFleet(overrides = {}) {
    return {
        ...Fleet.create(userFleetData),
        position: { x: 1, y: 0, z: 0 },
        velocity: { x: 0, y: 0.0172021, z: 0 },
        fuelRemaining: 1_000_000,
        state: 'planning',
        ...overrides,
    };
}

const targetBodyData = { name: 'MARS', orbit_model: 'VSOP87' };
const target = Target.create({ bodyName: 'MARS' });

function bestCandidatePlan({ fleet, mode, currentEpochDaysJ2000, tofCandidatesDays }) {
    const plans = [];
    for (const tofDays of tofCandidatesDays) {
        try {
            const rawTransfer = TransferAssembler.assembleTransfer({
                fleet,
                targetBodyData,
                departureEpochDaysJ2000: currentEpochDaysJ2000,
                arrivalEpochDaysJ2000: currentEpochDaysJ2000 + tofDays,
                mu: MU_SUN_AU3_DAY2,
            });
            plans.push(
                TransferAssembler.buildFlightPlan({ fleet, target, rawTransfer, optimizationMode: mode })
            );
        } catch {
        }
    }
    const feasible = plans.filter((p) => p.isFeasible);
    const pool = feasible.length > 0 ? feasible : plans;
    const scoreOf = mode === 'time' ? (p) => p.tof : (p) => p.propellantRequired;
    return pool.reduce((best, p) => (scoreOf(p) < scoreOf(best) ? p : best));
}

describe('calculateImpulsiveTransfer', () => {
    it('returns a valid FlightPlan for mode "time"', () => {
        const fleet = makeFleet();

        const plan = calculateImpulsiveTransfer({
            fleet,
            target,
            targetBodyData,
            mode: 'time',
            currentEpochDaysJ2000: 0,
            mu: MU_SUN_AU3_DAY2,
        });

        expect(plan.fleetId).toBe(fleet.id);
        expect(plan.optimizationMode).toBe('time');
        expect(typeof plan.tof).toBe('number');
        expect(Number.isFinite(plan.propellantRequired)).toBe(true);
        expect(typeof plan.isFeasible).toBe('boolean');
        expect(Array.isArray(plan.burns)).toBe(true);
        expect(Array.isArray(plan.trajectorySamples)).toBe(true);
    });

    it('returns a valid FlightPlan for mode "fuel"', () => {
        const fleet = makeFleet();

        const plan = calculateImpulsiveTransfer({
            fleet,
            target,
            targetBodyData,
            mode: 'fuel',
            currentEpochDaysJ2000: 0,
            mu: MU_SUN_AU3_DAY2,
        });

        expect(plan.fleetId).toBe(fleet.id);
        expect(plan.optimizationMode).toBe('fuel');
        expect(Number.isFinite(plan.propellantRequired)).toBe(true);
        expect(typeof plan.isFeasible).toBe('boolean');
    });

    it('mode "time" picks the lowest-tof feasible candidate from the default window set', () => {
        const fleet = makeFleet();
        const currentEpochDaysJ2000 = 0;

        const plan = calculateImpulsiveTransfer({
            fleet,
            target,
            targetBodyData,
            mode: 'time',
            currentEpochDaysJ2000,
            mu: MU_SUN_AU3_DAY2,
        });

        const expected = bestCandidatePlan({
            fleet,
            mode: 'time',
            currentEpochDaysJ2000,
            tofCandidatesDays: [90, 180, 270, 365, 450],
        });

        expect(plan.tof).toBe(expected.tof);
        expect(plan.propellantRequired).toBeCloseTo(expected.propellantRequired, 6);
    });

    it('mode "fuel" picks the lowest-propellant feasible candidate from the default window set', () => {
        const fleet = makeFleet();
        const currentEpochDaysJ2000 = 0;

        const plan = calculateImpulsiveTransfer({
            fleet,
            target,
            targetBodyData,
            mode: 'fuel',
            currentEpochDaysJ2000,
            mu: MU_SUN_AU3_DAY2,
        });

        const expected = bestCandidatePlan({
            fleet,
            mode: 'fuel',
            currentEpochDaysJ2000,
            tofCandidatesDays: [90, 180, 270, 365, 450],
        });

        expect(plan.propellantRequired).toBeCloseTo(expected.propellantRequired, 6);
        expect(plan.tof).toBe(expected.tof);
    });

    it('"time" and "fuel" modes can select different candidates', () => {
        const fleet = makeFleet();
        const currentEpochDaysJ2000 = 0;

        const timePlan = calculateImpulsiveTransfer({
            fleet,
            target,
            targetBodyData,
            mode: 'time',
            currentEpochDaysJ2000,
            mu: MU_SUN_AU3_DAY2,
        });
        const fuelPlan = calculateImpulsiveTransfer({
            fleet,
            target,
            targetBodyData,
            mode: 'fuel',
            currentEpochDaysJ2000,
            mu: MU_SUN_AU3_DAY2,
        });

        expect(timePlan.optimizationMode).toBe('time');
        expect(fuelPlan.optimizationMode).toBe('fuel');
    });

    it('honors custom departureOffsetsDays and tofCandidatesDays', () => {
        const fleet = makeFleet();
        const currentEpochDaysJ2000 = 0;
        const tofCandidatesDays = [120, 240];

        const plan = calculateImpulsiveTransfer({
            fleet,
            target,
            targetBodyData,
            mode: 'time',
            currentEpochDaysJ2000,
            mu: MU_SUN_AU3_DAY2,
            departureOffsetsDays: [0],
            tofCandidatesDays,
        });

        const expected = bestCandidatePlan({
            fleet,
            mode: 'time',
            currentEpochDaysJ2000,
            tofCandidatesDays,
        });

        expect(plan.tof).toBe(expected.tof);
    });

    it('still returns a concrete (infeasible) FlightPlan when no candidate has enough fuel', () => {
        const fleet = makeFleet({ fuelRemaining: 0.001 });

        const plan = calculateImpulsiveTransfer({
            fleet,
            target,
            targetBodyData,
            mode: 'fuel',
            currentEpochDaysJ2000: 0,
            mu: MU_SUN_AU3_DAY2,
        });

        expect(plan.isFeasible).toBe(false);
        expect(typeof plan.fuelWarning).toBe('string');
        expect(plan.fuelWarning.length).toBeGreaterThan(0);
    });

    it('throws for an invalid mode', () => {
        const fleet = makeFleet();

        expect(() =>
            calculateImpulsiveTransfer({
                fleet,
                target,
                targetBodyData,
                mode: 'distance',
                currentEpochDaysJ2000: 0,
                mu: MU_SUN_AU3_DAY2,
            })
        ).toThrow();
    });

    it('throws when currentEpochDaysJ2000 is missing or non-numeric', () => {
        const fleet = makeFleet();

        expect(() =>
            calculateImpulsiveTransfer({
                fleet,
                target,
                targetBodyData,
                mode: 'time',
                mu: MU_SUN_AU3_DAY2,
            })
        ).toThrow();
    });

    it('throws when departureOffsetsDays or tofCandidatesDays is empty', () => {
        const fleet = makeFleet();

        expect(() =>
            calculateImpulsiveTransfer({
                fleet,
                target,
                targetBodyData,
                mode: 'time',
                currentEpochDaysJ2000: 0,
                mu: MU_SUN_AU3_DAY2,
                tofCandidatesDays: [],
            })
        ).toThrow();

        expect(() =>
            calculateImpulsiveTransfer({
                fleet,
                target,
                targetBodyData,
                mode: 'time',
                currentEpochDaysJ2000: 0,
                mu: MU_SUN_AU3_DAY2,
                departureOffsetsDays: [],
            })
        ).toThrow();
    });

    it('throws when no candidate can be resolved at all (e.g. missing targetBodyData)', () => {
        const fleet = makeFleet();

        expect(() =>
            calculateImpulsiveTransfer({
                fleet,
                target,
                targetBodyData: null,
                mode: 'time',
                currentEpochDaysJ2000: 0,
                mu: MU_SUN_AU3_DAY2,
            })
        ).toThrow();
    });

    it('falls back to ephemeris-based origin resolution for a freshly parked fleet', () => {
        const fleet = { ...Fleet.create(userFleetData), position: null, velocity: null, fuelRemaining: 1_000_000 };
        const originBodyData = { name: 'EARTH', orbit_model: 'VSOP87' };

        const plan = calculateImpulsiveTransfer({
            fleet,
            target,
            targetBodyData,
            originBodyData,
            mode: 'time',
            currentEpochDaysJ2000: 0,
            mu: MU_SUN_AU3_DAY2,
        });

        expect(Number.isFinite(plan.tof)).toBe(true);
        expect(typeof plan.isFeasible).toBe('boolean');
    });
});