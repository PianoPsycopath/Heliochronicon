import { describe, it, expect } from 'vitest';
import { createTransferField, CELL_STATUS as FIELD_CELL_STATUS } from '../../physics/mission/TransferField.js';
import {
    METRIC_KEYS,
    computeValueRange,
    colorForValue,
    candidateAt,
    CELL_STATUS,
} from '../porkchopMath.js';

function buildField() {
    return createTransferField({
        departureTimes_daysSinceJ2000: [0, 10],
        arrivalTimes_daysSinceJ2000: [100, 110],
        deltaV_kmps: [[3, 5], [NaN, 1]],
        departureDeltaV_kmps: [[1.5, 2.5], [NaN, 0.5]],
        arrivalDeltaV_kmps: [[1.5, 2.5], [NaN, 0.5]],
        fuelRequired_kg: [[900, 1600], [NaN, 300]],
        c3_km2s2: [[2.25, 6.25], [NaN, 0.25]],
        timeOfFlight_days: [[100, 100], [90, 90]],
        status: [
            [FIELD_CELL_STATUS.VALID, FIELD_CELL_STATUS.INFEASIBLE],
            [FIELD_CELL_STATUS.UNSOLVABLE, FIELD_CELL_STATUS.VALID],
        ],
        solver: { id: 'FAKE_SOLVER' },
    });
}

describe('porkchopMath CELL_STATUS (Phase 9B)', () => {
    it('mirrors TransferField.CELL_STATUS exactly', () => {
        expect(CELL_STATUS).toEqual(FIELD_CELL_STATUS);
    });
});

describe('computeValueRange', () => {
    it('only considers VALID cells, ignoring INFEASIBLE and UNSOLVABLE', () => {
        const field = buildField();
        const range = computeValueRange(field, METRIC_KEYS.DELTA_V);
        expect(range).toEqual({ min: 1, max: 3 });
    });
});

describe('colorForValue', () => {
    it('returns a distinct flat color for UNSOLVABLE, different from INFEASIBLE', () => {
        const range = { min: 0, max: 10 };
        const unsolvable = colorForValue(NaN, range, CELL_STATUS.UNSOLVABLE);
        const infeasible = colorForValue(5, range, CELL_STATUS.INFEASIBLE);
        expect(unsolvable).not.toBe(infeasible);
    });

    it('returns a heat-scale color for VALID cells', () => {
        const range = { min: 0, max: 10 };
        const color = colorForValue(5, range, CELL_STATUS.VALID);
        expect(color).toMatch(/^hsl\(/);
    });
});

describe('candidateAt (Phase 9B contract)', () => {
    it('exposes an explicit status classifying the cell as VALID / INFEASIBLE / UNSOLVABLE', () => {
        const field = buildField();
        expect(candidateAt(field, 0, 0).status).toBe(CELL_STATUS.VALID);
        expect(candidateAt(field, 0, 1).status).toBe(CELL_STATUS.INFEASIBLE);
        expect(candidateAt(field, 1, 0).status).toBe(CELL_STATUS.UNSOLVABLE);
    });

    it('is stable and index-reproducible without re-running the search', () => {
        const field = buildField();
        const first = candidateAt(field, 1, 1);
        const second = candidateAt(field, 1, 1);
        expect(first).toEqual(second);
        expect(first.departureTime_daysSinceJ2000).toBe(field.departureTimes_daysSinceJ2000[1]);
        expect(first.arrivalTime_daysSinceJ2000).toBe(field.arrivalTimes_daysSinceJ2000[1]);
    });

    it('no longer exposes the boolean feasible field it replaces', () => {
        const field = buildField();
        expect('feasible' in candidateAt(field, 0, 0)).toBe(false);
    });
});