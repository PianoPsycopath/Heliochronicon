import { describe, it, expect, vi } from 'vitest';
import { searchTransferField } from '../TransferSearch.js';
import { CELL_STATUS } from '../TransferField.js';

vi.mock('../EphemerisBoundary.js', () => ({
    EphemerisBoundary: {
        getState: vi.fn((bodyData, t) => ({ bodyData, t })),
    },
}));

vi.mock('../OrbitalState.js', () => ({
    orbitalStateFromEphemeris: vi.fn((ephemeris, epoch_daysSinceJ2000, mu) => ({
        position: { x: epoch_daysSinceJ2000, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        epoch_daysSinceJ2000,
        mu,
    })),
}));

const originBodyData = { name: 'EARTH' };
const targetBodyData = { name: 'MARS' };
const spacecraft = { wetMass_kg: 1000, propellantMass_kg: 400, propulsion: { specificImpulse_s: 300 } };
const mu = 1;

function fakeSolver() {
    return {
        solve: vi.fn(({ departureState, arrivalState }) => {
            const key = `${departureState.epoch_daysSinceJ2000}-${arrivalState.epoch_daysSinceJ2000}`;
            if (key === '10-15') throw new Error('no convergence');
            const table = {
                '0-5': { departureDeltaVMagnitude: 0.5, arrivalDeltaVMagnitude: 0.5, totalDeltaVMagnitude: 1 },
                '0-15': { departureDeltaVMagnitude: 5, arrivalDeltaVMagnitude: 5, totalDeltaVMagnitude: 10 },
                '10-5': { departureDeltaVMagnitude: 0.1, arrivalDeltaVMagnitude: 0.1, totalDeltaVMagnitude: 0.2 },
            };
            return table[key];
        }),
    };
}

function baseArgs(overrides = {}) {
    return {
        originBodyData,
        targetBodyData,
        departureWindow: { start_daysSinceJ2000: 0, end_daysSinceJ2000: 10 },
        arrivalWindow: { start_daysSinceJ2000: 5, end_daysSinceJ2000: 15 },
        spacecraft,
        mu,
        searchConfiguration: { departureStep_days: 10, arrivalStep_days: 10 },
        solver: fakeSolver(),
        solverDefinition: { id: 'FAKE_SOLVER' },
        ...overrides,
    };
}

describe('searchTransferField tri-state classification (Phase 9B)', () => {
    it('marks a cell with arrival not after departure as UNSOLVABLE without invoking the solver', () => {
        const solver = fakeSolver();
        const { field } = searchTransferField(baseArgs({ solver }));
        // departureTimes = [0, 10], arrivalTimes = [5, 15] -> cell (dep=10, arr=5) has dt = -5
        expect(field.status[1][0]).toBe(CELL_STATUS.UNSOLVABLE);
        expect(Number.isNaN(field.deltaV_kmps[1][0])).toBe(true);
        const calledDts = solver.solve.mock.calls.map(
            ([req]) => req.arrivalState.epoch_daysSinceJ2000 - req.departureState.epoch_daysSinceJ2000
        );
        expect(calledDts.every((dt) => dt > 0)).toBe(true);
    });

    it('marks a cell where the solver cannot converge as UNSOLVABLE', () => {
        const { field } = searchTransferField(baseArgs());
        // departureTimes = [0, 10], arrivalTimes = [5, 15] -> cell (dep=10, arr=15) is the throwing case
        expect(field.status[1][1]).toBe(CELL_STATUS.UNSOLVABLE);
        expect(Number.isNaN(field.deltaV_kmps[1][1])).toBe(true);
    });

    it('marks a solved transfer that exceeds the propellant budget as INFEASIBLE, retaining its computed numbers', () => {
        const { field } = searchTransferField(baseArgs());
        // (dep=0, arr=15): totalDeltaVMagnitude 10 -> fuel required exceeds propellantMass_kg (400)
        expect(field.status[0][1]).toBe(CELL_STATUS.INFEASIBLE);
        expect(field.deltaV_kmps[0][1]).toBe(10);
        expect(Number.isFinite(field.fuelRequired_kg[0][1])).toBe(true);
    });

    it('marks a solved transfer within the propellant budget as VALID', () => {
        const { field } = searchTransferField(baseArgs());
        // (dep=0, arr=5): totalDeltaVMagnitude 1 -> well within propellantMass_kg (400)
        expect(field.status[0][0]).toBe(CELL_STATUS.VALID);
    });

    it('only aggregates minima over VALID cells', () => {
        const { minima } = searchTransferField(baseArgs());
        // (0,0) is VALID with totalDeltaVMagnitude 1; (0,1) INFEASIBLE with 10; both UNSOLVABLE cells excluded.
        expect(minima.deltaV).toEqual({ departureIndex: 0, arrivalIndex: 0, value: 1 });
    });
});