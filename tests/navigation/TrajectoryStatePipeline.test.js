// tests/navigation/TrajectoryStatePipeline.test.js

import { describe, it, expect, beforeAll } from 'vitest';
import { searchTransferCandidates } from '@navigation/CandidateSearch.js';
import { applyDepartureInjection } from '@navigation/DepartureInjection.js';
import { applyArrivalCapture } from '@navigation/ArrivalCapture.js';
import { EphemerisAdapter } from '@navigation/EphemerisAdapter.js';
import { Fleet } from '@navigation/Fleet.js';
import { Target } from '@navigation/Target.js';
import { createDefaultRuntimeState } from '@navigation/DefaultFleetState.js';
import { geocentricToHeliocentric } from '@navigation/FleetPropagator.js';
import {
    TRAJECTORY_FRAME,
    heliocentricStateToAuPerDay,
    resolveHeliocentricOrigin,
} from '@navigation/TrajectoryState.js';
import userFleetData from '../../public/data/fleets/userfleet.json';

const MU_SUN_AU3_DAY2 = 0.00029591220828559115;
const EARTH_RADIUS_KM = 6378.137;
const EARTH_MU_KM3_S2 = 398600.4418;
const MARS_RADIUS_KM = 3389.5;
const MARS_MU_KM3_S2 = 42828.375;
const MARS_PARKING_ALTITUDE_KM = 300;
const LEO_ALTITUDE_KM = 300;

const DEPARTURE_EPOCH = 0;
const TOF_DAYS = 260;

// Burn markers must sit within a parking radius (~1e-4 AU) of the trajectory
// endpoints (Phase 0 lock).
const MAX_BURN_TO_TRAJECTORY_AU = 1e-3;

function isFiniteVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

const fleet = Fleet.create(userFleetData);
const earthBodyData = { name: 'EARTH', orbit_model: 'VSOP87' };
const marsBodyData = { name: 'MARS', orbit_model: 'VSOP87' };

const runtimeState = createDefaultRuntimeState({
    fleet,
    earthRadiusKm: EARTH_RADIUS_KM,
    altitudeKm: LEO_ALTITUDE_KM,
    earthMuKm3PerS2: EARTH_MU_KM3_S2,
});
const parkingState = { position: runtimeState.position, velocity: runtimeState.velocity };
const earthState = EphemerisAdapter.getState(earthBodyData, DEPARTURE_EPOCH);

function buildEnrichedPlan(heliocentricOrigin) {
    const solverFleet = {
        ...fleet,
        fuelRemaining: runtimeState.fuelRemaining,
        position: heliocentricOrigin.position,
        velocity: heliocentricOrigin.velocity,
    };

    const [candidate] = searchTransferCandidates({
        fleet: solverFleet,
        target: Target.create({ bodyName: 'MARS' }),
        targetBodyData: marsBodyData,
        originBodyData: earthBodyData,
        mode: 'time',
        currentEpochDaysJ2000: DEPARTURE_EPOCH,
        mu: MU_SUN_AU3_DAY2,
        tofCandidatesDays: [TOF_DAYS],
        samples: 60,
    });

    let plan = applyDepartureInjection({
        plan: candidate,
        fleet: solverFleet,
        parkingPosition: parkingState.position,
        parkingVelocity: parkingState.velocity,
        earthState,
        muEarthKm3PerS2: EARTH_MU_KM3_S2,
    });
    plan = applyArrivalCapture({
        plan,
        fleet: solverFleet,
        targetRadiusKm: MARS_RADIUS_KM,
        parkingAltitudeKm: MARS_PARKING_ALTITUDE_KM,
        muTargetKm3PerS2: MARS_MU_KM3_S2,
    });
    return plan;
}

describe('Earth -> Mars with a TrajectoryState-derived origin', () => {
    let departureState;
    let legacyOrigin;
    let trajectoryOrigin;
    let legacyPlan;
    let plan;

    beforeAll(() => {
        departureState = resolveHeliocentricOrigin({
            runtimeState,
            parkingState,
            parentEphemerisState: earthState,
            epochDaysJ2000: DEPARTURE_EPOCH,
        });

        legacyOrigin = geocentricToHeliocentric({
            position: parkingState.position,
            velocity: parkingState.velocity,
            earthState,
        });
        trajectoryOrigin = heliocentricStateToAuPerDay(departureState);

        legacyPlan = buildEnrichedPlan(legacyOrigin);
        plan = buildEnrichedPlan(trajectoryOrigin);
    });

    it('declares a heliocentric state at the departure epoch', () => {
        expect(departureState.frame).toBe(TRAJECTORY_FRAME.HELIOCENTRIC);
        expect(departureState.epochDaysJ2000).toBe(DEPARTURE_EPOCH);
        expect(departureState.velocityUnit).toBe('km/s');
    });

    it('produces the same solver origin as the legacy conversion', () => {
        expect(distance(trajectoryOrigin.position, legacyOrigin.position)).toBeLessThan(1e-12);
        expect(distance(trajectoryOrigin.velocity, legacyOrigin.velocity)).toBeLessThan(1e-12);
    });

    it('produces the same plan as the legacy origin', () => {
        expect(plan.tof).toBe(legacyPlan.tof);
        expect(plan.totalDv).toBeCloseTo(legacyPlan.totalDv, 9);
        expect(plan.burns.length).toBe(legacyPlan.burns.length);

        plan.burns.forEach((burn, index) => {
            const legacyBurn = legacyPlan.burns[index];
            expect(distance(burn.position, legacyBurn.position)).toBeLessThan(1e-10);
            expect(distance(burn.deltaV, legacyBurn.deltaV)).toBeLessThan(1e-10);
        });
    });

    it('still runs both enrichment stages (Phase 0)', () => {
        expect(plan.injection).toBeDefined();
        expect(plan.capture).toBeDefined();
    });

    it('still gives every burn a finite position at the trajectory endpoints (Phase 0)', () => {
        const samples = plan.trajectorySamples;
        const departureBurn = plan.burns[0];
        const arrivalBurn = plan.burns[plan.burns.length - 1];

        for (const burn of plan.burns) {
            expect(isFiniteVector3(burn.position)).toBe(true);
        }
        expect(distance(departureBurn.position, samples[0].position)).toBeLessThan(
            MAX_BURN_TO_TRAJECTORY_AU
        );
        expect(distance(arrivalBurn.position, samples[samples.length - 1].position)).toBeLessThan(
            MAX_BURN_TO_TRAJECTORY_AU
        );
    });
});