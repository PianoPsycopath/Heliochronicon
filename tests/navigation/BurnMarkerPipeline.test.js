// tests/navigation/BurnMarkerPipeline.test.js

import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { searchTransferCandidates } from '@navigation/CandidateSearch.js';
import { applyDepartureInjection } from '@navigation/DepartureInjection.js';
import { applyArrivalCapture } from '@navigation/ArrivalCapture.js';
import { EphemerisAdapter } from '@navigation/EphemerisAdapter.js';
import { Fleet } from '@navigation/Fleet.js';
import { Target } from '@navigation/Target.js';
import { createDefaultRuntimeState } from '@navigation/DefaultFleetState.js';
import { geocentricToHeliocentric } from '@navigation/FleetPropagator.js';
import { FlightPlanRenderer } from '@rendering/FlightPlanRenderer.js';
import userFleetData from '../../public/data/fleets/userfleet.json';

// Test-local physical constants (the production code takes these from data).
const MU_SUN_AU3_DAY2 = 0.00029591220828559115;
const EARTH_RADIUS_KM = 6378.137;
const EARTH_MU_KM3_S2 = 398600.4418;
const MARS_RADIUS_KM = 3389.5;
const MARS_MU_KM3_S2 = 42828.375;
const MARS_PARKING_ALTITUDE_KM = 300;
const LEO_ALTITUDE_KM = 300;

// Burn markers must sit within a parking radius (~1e-4 AU) of the trajectory
// endpoints; 1e-3 AU only trips on a frame/unit mismatch.
const MAX_BURN_TO_TRAJECTORY_AU = 1e-3;

const DEPARTURE_EPOCH = 0;
const TOF_DAYS = 260;

function isFiniteVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function distance(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function buildEnrichedPlan() {
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

    const solverFleet = {
        ...fleet,
        fuelRemaining: runtimeState.fuelRemaining,
        ...geocentricToHeliocentric({
            position: parkingState.position,
            velocity: parkingState.velocity,
            earthState,
        }),
    };

    const candidates = searchTransferCandidates({
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

    let plan = candidates[0];
    plan = applyDepartureInjection({
        plan,
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

describe('burn markers on a production-shaped Earth -> Mars plan', () => {
    let plan;

    beforeAll(() => {
        vi.stubGlobal('document', {
            createElement: () => ({
                width: 64,
                height: 64,
                getContext: () => ({
                    createRadialGradient: () => ({ addColorStop: () => {} }),
                    fillRect: () => {},
                }),
            }),
        });
        vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1));
        vi.stubGlobal('cancelAnimationFrame', vi.fn());

        plan = buildEnrichedPlan();
    });

    it('runs both enrichment stages (departure injection and arrival capture)', () => {
        expect(plan.injection).toBeDefined();
        expect(plan.capture).toBeDefined();
    });

    it('gives the departure and arrival burns finite positions', () => {
        expect(plan.burns.length).toBeGreaterThanOrEqual(2);
        for (const burn of plan.burns) {
            expect(isFiniteVector3(burn.position)).toBe(true);
        }
    });

    it('places the burns at the trajectory endpoints (same frame and units as trajectorySamples)', () => {
        const samples = plan.trajectorySamples;
        const departureBurn = plan.burns[0];
        const arrivalBurn = plan.burns[plan.burns.length - 1];

        expect(distance(departureBurn.position, samples[0].position)).toBeLessThan(
            MAX_BURN_TO_TRAJECTORY_AU
        );
        expect(distance(arrivalBurn.position, samples[samples.length - 1].position)).toBeLessThan(
            MAX_BURN_TO_TRAJECTORY_AU
        );
    });

    it('renders at least two burn markers, under a non-zero floating origin', () => {
        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(50, 1, 1e-9, 1e3);
        const origin = { ...plan.burns[0].position }; // camera focused on the departure point
        camera.position.set(0, 0, 1e-3);

        const renderer = new FlightPlanRenderer({
            scene,
            camera,
            renderer: { domElement: { clientHeight: 720 } },
            getCurrentOrigin: () => origin,
        });

        renderer.setPlan(plan);

        expect(renderer.lastPlanReport.burnMarkersShown).toBeGreaterThanOrEqual(2);
        expect(renderer.lastPlanReport.burnsWithNonFinitePosition).toBe(0);
        for (const marker of renderer._burnMarkers) {
            expect(Number.isFinite(marker.scale.x)).toBe(true);
            expect(marker.scale.x).toBeGreaterThan(0);
        }

        renderer.dispose();
    });
});