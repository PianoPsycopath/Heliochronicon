import { describe, it, expect } from 'vitest';
import { createTransferField } from '../../physics/mission/TransferField.js';
import {
    METRIC_KEYS,
    gridForMetric,
    valueAt,
    computeValueRange,
    colorForValue,
    cellFromPosition,
    candidateAt,
    minimaMarkers,
} from '../porkchopMath.js';

const solverDefinition = {
    id: 'LAMBERT_UNIVERSAL',
    name: 'Lambert Universal Variables Solver',
    family: 'IMPULSIVE',
    supportedTargetTypes: ['BODY_CENTER'],
    capabilities: [],
};

function buildField() {
    return createTransferField({
        departureTimes_daysSinceJ2000: [0, 10, 20],
        arrivalTimes_daysSinceJ2000: [100, 110, 120, 130],
        deltaV_kmps: [
            [5, 4, NaN, 6],
            [3, 2, 7, NaN],
            [8, 9, 1, 10],
        ],
        departureDeltaV_kmps: [
            [2, 2, NaN, 3],
            [1, 1, 3, NaN],
            [4, 4, 0.5, 5],
        ],
        arrivalDeltaV_kmps: [
            [3, 2, NaN, 3],
            [2, 1, 4, NaN],
            [4, 5, 0.5, 5],
        ],
        fuelRequired_kg: [
            [50, 40, NaN, 60],
            [30, 20, 70, NaN],
            [80, 90, 10, 100],
        ],
        c3_km2s2: [
            [4, 4, NaN, 9],
            [1, 1, 9, NaN],
            [16, 16, 0.25, 25],
        ],
        timeOfFlight_days: [
            [100, 110, 120, 130],
            [90, 100, 110, 120],
            [80, 90, 100, 110],
        ],
        feasibility: [
            [true, true, false, true],
            [true, true, true, false],
            [true, true, true, true],
        ],
        solver: solverDefinition,
        selectedSolutionReference: null,
    });
}

describe('gridForMetric / valueAt', () => {
    it('resolves the correct backing grid for each metric key', () => {
        const field = buildField();
        expect(gridForMetric(field, METRIC_KEYS.DELTA_V)).toBe(field.deltaV_kmps);
        expect(gridForMetric(field, METRIC_KEYS.FUEL)).toBe(field.fuelRequired_kg);
        expect(gridForMetric(field, METRIC_KEYS.TIME_OF_FLIGHT)).toBe(field.timeOfFlight_days);
        expect(gridForMetric(field, METRIC_KEYS.C3)).toBe(field.c3_km2s2);
        expect(valueAt(field, METRIC_KEYS.DELTA_V, 1, 1)).toBe(2);
    });

    it('throws on an unknown metric key', () => {
        const field = buildField();
        expect(() => gridForMetric(field, 'nope')).toThrow();
    });
});

describe('computeValueRange', () => {
    it('ignores infeasible and non-finite cells', () => {
        const field = buildField();
        const range = computeValueRange(field, METRIC_KEYS.DELTA_V);
        expect(range.min).toBe(1);
        expect(range.max).toBe(10);
    });

    it('falls back to a default range when nothing is feasible', () => {
        const field = buildField();
        const allInfeasible = { ...field, feasibility: field.feasibility.map((row) => row.map(() => false)) };
        expect(computeValueRange(allInfeasible, METRIC_KEYS.DELTA_V)).toEqual({ min: 0, max: 1 });
    });

    it('widens a zero-width range so downstream math never divides by zero', () => {
        const field = buildField();
        const flat = {
            ...field,
            deltaV_kmps: field.deltaV_kmps.map((row) => row.map(() => 5)),
        };
        expect(computeValueRange(flat, METRIC_KEYS.DELTA_V)).toEqual({ min: 5, max: 6 });
    });
});

describe('colorForValue', () => {
    it('returns the infeasible color for infeasible or non-finite cells', () => {
        const range = { min: 0, max: 10 };
        expect(colorForValue(5, range, false)).toBe('#1a1a1a');
        expect(colorForValue(NaN, range, true)).toBe('#1a1a1a');
    });

    it('maps the low end of the range to cyan and the high end to red', () => {
        const range = { min: 0, max: 10 };
        expect(colorForValue(0, range, true)).toBe('hsl(180.0, 85%, 50%)');
        expect(colorForValue(10, range, true)).toBe('hsl(0.0, 85%, 50%)');
    });
});

describe('cellFromPosition', () => {
    it('maps a pixel position onto the correct grid cell', () => {
        const layout = { width: 300, height: 400, rows: 3, cols: 4 };
        expect(cellFromPosition({ ...layout, x: 0, y: 0 })).toMatchObject({ departureIndex: 0, arrivalIndex: 0 });
        expect(cellFromPosition({ ...layout, x: 299, y: 399 })).toMatchObject({ departureIndex: 2, arrivalIndex: 3 });
        expect(cellFromPosition({ ...layout, x: 150, y: 200 })).toMatchObject({ departureIndex: 1, arrivalIndex: 2 });
    });

    it('clamps out-of-bounds coordinates instead of returning an invalid index', () => {
        const layout = { width: 300, height: 400, rows: 3, cols: 4 };
        expect(cellFromPosition({ ...layout, x: -50, y: -50 })).toMatchObject({ departureIndex: 0, arrivalIndex: 0 });
        expect(cellFromPosition({ ...layout, x: 5000, y: 5000 })).toMatchObject({ departureIndex: 2, arrivalIndex: 3 });
    });

    it('returns null for a degenerate grid', () => {
        expect(cellFromPosition({ width: 300, height: 400, rows: 0, cols: 4, x: 0, y: 0 })).toBeNull();
    });
});

describe('candidateAt', () => {
    it('assembles compact per-cell candidate metadata from the field grids', () => {
        const field = buildField();
        const candidate = candidateAt(field, 1, 1);
        expect(candidate).toEqual({
            departureIndex: 1,
            arrivalIndex: 1,
            departureTime_daysSinceJ2000: 10,
            arrivalTime_daysSinceJ2000: 110,
            deltaV_kmps: 2,
            departureDeltaV_kmps: 1,
            arrivalDeltaV_kmps: 1,
            fuelRequired_kg: 20,
            c3_km2s2: 1,
            timeOfFlight_days: 100,
            feasible: true,
        });
    });
});

describe('minimaMarkers', () => {
    it('flattens the minima object returned by searchTransferField into labeled markers', () => {
        const markers = minimaMarkers({
            deltaV: { departureIndex: 1, arrivalIndex: 1, value: 2 },
            fuel: { departureIndex: 1, arrivalIndex: 1, value: 20 },
            timeOfFlight: null,
        });
        expect(markers).toEqual([
            { departureIndex: 1, arrivalIndex: 1, value: 2, metric: METRIC_KEYS.DELTA_V, label: 'MIN Δv' },
            { departureIndex: 1, arrivalIndex: 1, value: 20, metric: METRIC_KEYS.FUEL, label: 'MIN FUEL' },
        ]);
    });

    it('returns an empty array when no minima were found', () => {
        expect(minimaMarkers(null)).toEqual([]);
    });
});
