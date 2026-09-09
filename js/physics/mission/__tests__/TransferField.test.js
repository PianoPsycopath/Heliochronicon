import { describe, it, expect } from 'vitest';
import { createTransferField } from '../TransferField.js';
import { createSolverDefinition } from '../SolverDefinition.js';

function buildValidArgs(overrides = {}) {
    const rows = 2;
    const cols = 3;
    const grid = () => Array.from({ length: rows }, () => Array.from({ length: cols }, () => 1));
    return {
        departureTimes_daysSinceJ2000: [9000, 9010],
        arrivalTimes_daysSinceJ2000: [9200, 9210, 9220],
        deltaV_kmps: grid(),
        departureDeltaV_kmps: grid(),
        arrivalDeltaV_kmps: grid(),
        fuelRequired_kg: grid(),
        c3_km2s2: grid(),
        timeOfFlight_days: grid(),
        status: Array.from({ length: rows }, () => Array.from({ length: cols }, () => 'VALID')),
        solver: createSolverDefinition({
            id: 'lambert-universal',
            name: 'Lambert',
            family: 'IMPULSIVE',
            supportedTargetTypes: ['BODY_CENTER'],
        }),
        ...overrides,
    };
}

describe('createTransferField', () => {
    it('constructs an immutable transfer field with matching grid dimensions', () => {
        const field = createTransferField(buildValidArgs());
        expect(field.deltaV_kmps.length).toBe(2);
        expect(field.deltaV_kmps[0].length).toBe(3);
        expect(field.selectedSolutionReference).toBeNull();
        expect(Object.isFrozen(field)).toBe(true);
    });

    it('accepts a valid selectedSolutionReference', () => {
        const field = createTransferField(
            buildValidArgs({ selectedSolutionReference: { departureIndex: 1, arrivalIndex: 2 } })
        );
        expect(field.selectedSolutionReference).toEqual({ departureIndex: 1, arrivalIndex: 2 });
    });

    it('rejects a grid with mismatched row count', () => {
        expect(() =>
            createTransferField(buildValidArgs({ deltaV_kmps: [[1, 1, 1]] }))
        ).toThrow('TransferField.deltaV_kmps must have 2 rows');
    });

    it('rejects an out-of-range selectedSolutionReference', () => {
        expect(() =>
            createTransferField(
                buildValidArgs({ selectedSolutionReference: { departureIndex: 5, arrivalIndex: 0 } })
            )
        ).toThrow('departureIndex is out of range');
    });
});
