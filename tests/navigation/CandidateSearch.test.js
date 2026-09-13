// tests/navigation/CandidateSearch.test.js
import { describe, it, expect } from 'vitest';
import { searchTransferCandidates, selectCandidate } from '@navigation/CandidateSearch.js';
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

function referencePlans({ fleet, mode, currentEpochDaysJ2000, tofCandidatesDays }) {
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
            // skip infeasible-to-solve candidates, same as the search module
        }
    }
    return plans;
}

describe('searchTransferCandidates', () => {
    it('returns a ranked, non-empty list of FlightPlans for mode "time"', () => {
        const fleet = makeFleet();

        const candidates = searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'time',
            currentEpochDaysJ2000: 0,
            mu: MU_SUN_AU3_DAY2,
        });

        expect(Array.isArray(candidates)).toBe(true);
        expect(candidates.length).toBeGreaterThan(0);
        for (const candidate of candidates) {
            expect(candidate.fleetId).toBe(fleet.id);
            expect(candidate.optimizationMode).toBe('time');
            expect(typeof candidate.candidateId).toBe('string');
            expect(typeof candidate.isFeasible).toBe('boolean');
        }
    });

    it('returns a ranked, non-empty list of FlightPlans for mode "fuel"', () => {
        const fleet = makeFleet();

        const candidates = searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'fuel',
            currentEpochDaysJ2000: 0,
            mu: MU_SUN_AU3_DAY2,
        });

        expect(candidates.length).toBeGreaterThan(0);
        for (const candidate of candidates) {
            expect(candidate.optimizationMode).toBe('fuel');
        }
    });

    it('"time" and "fuel" modes produce distinct candidate sets', () => {
        const fleet = makeFleet();
        const currentEpochDaysJ2000 = 0;

        const timeCandidates = searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'time',
            currentEpochDaysJ2000,
            mu: MU_SUN_AU3_DAY2,
        });
        const fuelCandidates = searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'fuel',
            currentEpochDaysJ2000,
            mu: MU_SUN_AU3_DAY2,
        });

        expect(timeCandidates.every((c) => c.optimizationMode === 'time')).toBe(true);
        expect(fuelCandidates.every((c) => c.optimizationMode === 'fuel')).toBe(true);

        const feasibleTime = timeCandidates.filter((c) => c.isFeasible);
        const feasibleFuel = fuelCandidates.filter((c) => c.isFeasible);
        for (let i = 1; i < feasibleTime.length; i++) {
            expect(feasibleTime[i].tof).toBeGreaterThanOrEqual(feasibleTime[i - 1].tof);
        }
        for (let i = 1; i < feasibleFuel.length; i++) {
            expect(feasibleFuel[i].propellantRequired).toBeGreaterThanOrEqual(
                feasibleFuel[i - 1].propellantRequired
            );
        }
    });

    it('ranks feasible candidates ahead of infeasible ones', () => {
        const fleet = makeFleet();
        const currentEpochDaysJ2000 = 0;
        const tofCandidatesDays = [90, 180, 270, 365, 450];

        const candidates = searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'fuel',
            currentEpochDaysJ2000,
            mu: MU_SUN_AU3_DAY2,
            tofCandidatesDays,
        });

        const feasibleFlags = candidates.map((c) => c.isFeasible);
        const firstInfeasibleIndex = feasibleFlags.indexOf(false);
        if (firstInfeasibleIndex !== -1) {
            expect(feasibleFlags.slice(0, firstInfeasibleIndex).every(Boolean)).toBe(true);
        }
    });

    it('orders the leading candidate by the mode score against a hand-built reference', () => {
        const fleet = makeFleet();
        const currentEpochDaysJ2000 = 0;
        const tofCandidatesDays = [90, 180, 270, 365, 450];

        const candidates = searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'time',
            currentEpochDaysJ2000,
            mu: MU_SUN_AU3_DAY2,
            tofCandidatesDays,
        });

        const reference = referencePlans({ fleet, mode: 'time', currentEpochDaysJ2000, tofCandidatesDays });
        const feasibleReference = reference.filter((p) => p.isFeasible);
        const pool = feasibleReference.length > 0 ? feasibleReference : reference;
        const expectedBestTof = Math.min(...pool.map((p) => p.tof));

        expect(candidates[0].tof).toBe(expectedBestTof);
    });

    it('respects maxCandidates', () => {
        const fleet = makeFleet();

        const candidates = searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'time',
            currentEpochDaysJ2000: 0,
            mu: MU_SUN_AU3_DAY2,
            tofCandidatesDays: [90, 180, 270, 365, 450],
            maxCandidates: 2,
        });

        expect(candidates.length).toBeLessThanOrEqual(2);
    });

    it('assigns each candidate a unique candidateId', () => {
        const fleet = makeFleet();

        const candidates = searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'time',
            currentEpochDaysJ2000: 0,
            mu: MU_SUN_AU3_DAY2,
        });

        const ids = candidates.map((c) => c.candidateId);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('uses a single fixed departure epoch (the "first sensible departure") for every candidate', () => {
        const fleet = makeFleet();
        const currentEpochDaysJ2000 = 100;

        const candidates = searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'time',
            currentEpochDaysJ2000,
            mu: MU_SUN_AU3_DAY2,
        });

        for (const candidate of candidates) {
            expect(candidate.departureEpochDaysJ2000).toBe(currentEpochDaysJ2000);
        }
    });

    it('still returns concrete infeasible candidates when no candidate has enough fuel', () => {
        const fleet = makeFleet({ fuelRemaining: 0.001 });

        const candidates = searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'fuel',
            currentEpochDaysJ2000: 0,
            mu: MU_SUN_AU3_DAY2,
        });

        expect(candidates.length).toBeGreaterThan(0);
        expect(candidates.every((c) => c.isFeasible === false)).toBe(true);
        expect(candidates.every((c) => typeof c.fuelWarning === 'string' && c.fuelWarning.length > 0)).toBe(
            true
        );
    });

    it('throws for an invalid mode', () => {
        const fleet = makeFleet();

        expect(() =>
            searchTransferCandidates({
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
            searchTransferCandidates({
                fleet,
                target,
                targetBodyData,
                mode: 'time',
                mu: MU_SUN_AU3_DAY2,
            })
        ).toThrow();
    });

    it('throws when tofCandidatesDays is empty', () => {
        const fleet = makeFleet();

        expect(() =>
            searchTransferCandidates({
                fleet,
                target,
                targetBodyData,
                mode: 'time',
                currentEpochDaysJ2000: 0,
                mu: MU_SUN_AU3_DAY2,
                tofCandidatesDays: [],
            })
        ).toThrow();
    });

    it('throws when no candidate can be resolved at all (e.g. missing targetBodyData)', () => {
        const fleet = makeFleet();

        expect(() =>
            searchTransferCandidates({
                fleet,
                target,
                targetBodyData: null,
                mode: 'time',
                currentEpochDaysJ2000: 0,
                mu: MU_SUN_AU3_DAY2,
            })
        ).toThrow();
    });
});

describe('selectCandidate', () => {
    function makeCandidates() {
        const fleet = makeFleet();
        return searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'time',
            currentEpochDaysJ2000: 0,
            mu: MU_SUN_AU3_DAY2,
        });
    }

    it('resolves exactly one FlightPlan matching the given candidateId', () => {
        const candidates = makeCandidates();
        const chosen = candidates[candidates.length - 1];

        const selected = selectCandidate(candidates, chosen.candidateId);

        expect(selected).toBe(chosen);
    });

    it('preserves isFeasible / warnings on the selected candidate (never launders infeasibility)', () => {
        const fleet = makeFleet({ fuelRemaining: 0.001 });
        const candidates = searchTransferCandidates({
            fleet,
            target,
            targetBodyData,
            mode: 'fuel',
            currentEpochDaysJ2000: 0,
            mu: MU_SUN_AU3_DAY2,
        });

        const selected = selectCandidate(candidates, candidates[0].candidateId);

        expect(selected.isFeasible).toBe(false);
        expect(typeof selected.fuelWarning).toBe('string');
    });

    it('throws for an unknown candidateId', () => {
        const candidates = makeCandidates();
        expect(() => selectCandidate(candidates, 'not-a-real-id')).toThrow();
    });

    it('throws for an empty candidates array', () => {
        expect(() => selectCandidate([], 'time-0')).toThrow();
    });

    it('throws for a non-array candidates argument', () => {
        expect(() => selectCandidate(null, 'time-0')).toThrow();
    });
});