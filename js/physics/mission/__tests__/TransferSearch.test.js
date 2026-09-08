import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../EphemerisBoundary.js', () => ({
    EphemerisBoundary: {
        getState: vi.fn((bodyData, t) => ({
            position: { x: t, y: 0, z: 0 },
            velocity: { x: 0, y: 1, z: 0 },
        })),
    },
}));

vi.mock('../LambertSolver.js', () => ({
    lambertSolverDefinition: { id: 'LAMBERT_UNIVERSAL', family: 'IMPULSIVE' },
    LambertSolver: {
        solve: vi.fn(({ departureState, arrivalState }) => {
            const dt = arrivalState.epoch_daysSinceJ2000 - departureState.epoch_daysSinceJ2000;
            // Cheapest transfer sits at dt = 100; cost grows away from it either direction.
            const mag = Math.abs(dt - 100) / 100 + 0.1;
            return {
                departureDeltaVMagnitude: mag,
                arrivalDeltaVMagnitude: mag,
                totalDeltaVMagnitude: mag * 2,
                trajectorySamples: [],
            };
        }),
    },
}));

import { EphemerisBoundary } from '../EphemerisBoundary.js';
import { LambertSolver } from '../LambertSolver.js';
import { searchTransferField } from '../TransferSearch.js';

const originBodyData = { name: 'Earth', parent: 'SUN' };
const targetBodyData = { name: 'Mars', parent: 'SUN' };

const spacecraft = {
    name: 'TestCraft',
    dryMass_kg: 500,
    propellantMass_kg: 500,
    wetMass_kg: 1000,
    propulsion: { name: 'TestEngine', type: 'CHEMICAL', specificImpulse_s: 300, thrust_N: 500 },
};

beforeEach(() => {
    EphemerisBoundary.getState.mockClear();
    LambertSolver.solve.mockClear();
});

describe('searchTransferField', () => {
    it('produces a bounded rectangular grid sized from the windows and step', () => {
        const { field } = searchTransferField({
            originBodyData,
            targetBodyData,
            departureWindow: { start_daysSinceJ2000: 0, end_daysSinceJ2000: 40 },
            arrivalWindow: { start_daysSinceJ2000: 100, end_daysSinceJ2000: 160 },
            spacecraft,
            mu: 1,
            searchConfiguration: { departureStep_days: 10, arrivalStep_days: 15 },
        });

        expect(field.departureTimes_daysSinceJ2000).toHaveLength(5);
        expect(field.arrivalTimes_daysSinceJ2000).toHaveLength(5);
        expect(field.deltaV_kmps).toHaveLength(5);
        field.deltaV_kmps.forEach((row) => expect(row).toHaveLength(5));
    });

    it('resolves ephemeris once per axis value rather than once per cell', () => {
        searchTransferField({
            originBodyData,
            targetBodyData,
            departureWindow: { start_daysSinceJ2000: 0, end_daysSinceJ2000: 40 },
            arrivalWindow: { start_daysSinceJ2000: 100, end_daysSinceJ2000: 160 },
            spacecraft,
            mu: 1,
            searchConfiguration: { departureStep_days: 10, arrivalStep_days: 15 },
        });

        // 5 departure points + 5 arrival points = 10 ephemeris calls, not 25 (5x5 cells).
        expect(EphemerisBoundary.getState).toHaveBeenCalledTimes(10);
    });

    it('derives the arrival axis from departureWindow + timeOfFlightWindow', () => {
        const { field } = searchTransferField({
            originBodyData,
            targetBodyData,
            departureWindow: { start_daysSinceJ2000: 0, end_daysSinceJ2000: 20 },
            timeOfFlightWindow: { min_days: 150, max_days: 170 },
            spacecraft,
            mu: 1,
            searchConfiguration: { departureStep_days: 20, arrivalStep_days: 20 },
        });

        expect(field.arrivalTimes_daysSinceJ2000[0]).toBe(150);
        expect(field.arrivalTimes_daysSinceJ2000.at(-1)).toBe(190);
    });

    it('marks arrival-before-departure cells infeasible without calling the solver', () => {
        LambertSolver.solve.mockClear();
        const { field } = searchTransferField({
            originBodyData,
            targetBodyData,
            departureWindow: { start_daysSinceJ2000: 100, end_daysSinceJ2000: 100 },
            arrivalWindow: { start_daysSinceJ2000: 90, end_daysSinceJ2000: 90 },
            spacecraft,
            mu: 1,
            searchConfiguration: { departureStep_days: 1, arrivalStep_days: 1 },
        });

        expect(field.feasibility[0][0]).toBe(false);
        expect(Number.isNaN(field.deltaV_kmps[0][0])).toBe(true);
        expect(LambertSolver.solve).not.toHaveBeenCalled();
    });

    it('rejects candidates outside an explicit time-of-flight window without calling the solver', () => {
        LambertSolver.solve.mockClear();

        // departure axis: [0, 20]. arrival axis derived from departureWindow + TOF window
        // (min=max=50): [0+50, 20+50] = [50, 70].
        // - dep=0,  arr=50 -> dt=50 (in range)      -> solver called
        // - dep=0,  arr=70 -> dt=70 (exceeds max=50) -> rejected, no solver call
        // - dep=20, arr=50 -> dt=30 (below min=50)   -> rejected, no solver call
        // - dep=20, arr=70 -> dt=50 (in range)      -> solver called
        const { field: derivedField } = searchTransferField({
            originBodyData,
            targetBodyData,
            departureWindow: { start_daysSinceJ2000: 0, end_daysSinceJ2000: 20 },
            timeOfFlightWindow: { min_days: 50, max_days: 50 },
            spacecraft,
            mu: 1,
            searchConfiguration: { departureStep_days: 20, arrivalStep_days: 20 },
        });

        expect(derivedField.arrivalTimes_daysSinceJ2000).toEqual([50, 70]);
        expect(derivedField.feasibility[0][1]).toBe(false);
        expect(Number.isNaN(derivedField.deltaV_kmps[0][1])).toBe(true);
        expect(derivedField.timeOfFlight_days[0][1]).toBe(70);
        expect(derivedField.feasibility[0][0]).toBe(true);
        expect(LambertSolver.solve).toHaveBeenCalledTimes(2);
    });

    it('marks propulsion-infeasible cells false while keeping their real deltaV/fuel numbers', () => {
        const poorSpacecraft = { ...spacecraft, propellantMass_kg: 0.001 };
        const { field, minima } = searchTransferField({
            originBodyData,
            targetBodyData,
            departureWindow: { start_daysSinceJ2000: 0, end_daysSinceJ2000: 0 },
            arrivalWindow: { start_daysSinceJ2000: 100, end_daysSinceJ2000: 100 },
            spacecraft: poorSpacecraft,
            mu: 1,
            searchConfiguration: { departureStep_days: 1, arrivalStep_days: 1 },
        });

        expect(field.feasibility[0][0]).toBe(false);
        expect(field.deltaV_kmps[0][0]).toBeGreaterThan(0);
        expect(minima.deltaV).toBeNull();
        expect(minima.fuel).toBeNull();
        expect(minima.timeOfFlight).toBeNull();
    });

    it('identifies the minimum deltaV, fuel, and time-of-flight among feasible candidates', () => {
        const { minima } = searchTransferField({
            originBodyData,
            targetBodyData,
            departureWindow: { start_daysSinceJ2000: 0, end_daysSinceJ2000: 0 },
            arrivalWindow: { start_daysSinceJ2000: 80, end_daysSinceJ2000: 120 },
            spacecraft,
            mu: 1,
            searchConfiguration: { departureStep_days: 1, arrivalStep_days: 20 },
        });

        // arrival times: 80, 100, 120 -> dt: 80, 100, 120. Mocked cost is minimized at dt=100.
        expect(minima.deltaV.arrivalIndex).toBe(1);
        expect(minima.deltaV.departureIndex).toBe(0);
        expect(minima.fuel).not.toBeNull();
        expect(minima.timeOfFlight.value).toBe(80);
    });

    it('does not attach trajectory samples or per-cell mission solutions to the field', () => {
        const { field } = searchTransferField({
            originBodyData,
            targetBodyData,
            departureWindow: { start_daysSinceJ2000: 0, end_daysSinceJ2000: 0 },
            arrivalWindow: { start_daysSinceJ2000: 100, end_daysSinceJ2000: 100 },
            spacecraft,
            mu: 1,
            searchConfiguration: { departureStep_days: 1, arrivalStep_days: 1 },
        });

        expect(field.trajectorySamples).toBeUndefined();
        expect(field.burns).toBeUndefined();
    });

    it('rejects a request specifying both arrivalWindow and timeOfFlightWindow', () => {
        expect(() =>
            searchTransferField({
                originBodyData,
                targetBodyData,
                departureWindow: { start_daysSinceJ2000: 0, end_daysSinceJ2000: 10 },
                arrivalWindow: { start_daysSinceJ2000: 100, end_daysSinceJ2000: 110 },
                timeOfFlightWindow: { min_days: 50, max_days: 60 },
                spacecraft,
                mu: 1,
                searchConfiguration: { departureStep_days: 1, arrivalStep_days: 1 },
            })
        ).toThrow();
    });
});