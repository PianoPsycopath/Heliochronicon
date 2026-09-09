import { assert, deepFreeze } from './validation.js';

// A cell resolves to exactly one of these. VALID: solved and within the spacecraft's
// propellant budget. INFEASIBLE: solved, but the transfer exceeds the propellant budget.
// UNSOLVABLE: no transfer exists for this pair (arrival not after departure, outside the
// requested time-of-flight window, or the solver could not converge).
export const CELL_STATUS = Object.freeze({
    VALID: 'VALID',
    INFEASIBLE: 'INFEASIBLE',
    UNSOLVABLE: 'UNSOLVABLE',
});

const CELL_STATUS_VALUES = Object.freeze(Object.values(CELL_STATUS));

function assertNumericArray(value, label) {
    assert(Array.isArray(value) && value.length > 0, `${label} must be a non-empty array`);
    assert(
        value.every((entry) => typeof entry === 'number' && Number.isFinite(entry)),
        `${label} must contain only finite numbers`
    );
}

function assertGrid(grid, rows, cols, label) {
    assert(Array.isArray(grid) && grid.length === rows, `${label} must have ${rows} rows`);
    grid.forEach((row) => {
        assert(Array.isArray(row) && row.length === cols, `${label} rows must each have ${cols} columns`);
    });
}

function assertStatusGrid(grid, rows, cols, label) {
    assertGrid(grid, rows, cols, label);
    grid.forEach((row) => {
        row.forEach((entry) => {
            assert(
                CELL_STATUS_VALUES.includes(entry),
                `${label} entries must be one of ${CELL_STATUS_VALUES.join(', ')}`
            );
        });
    });
}

export function createTransferField({
    departureTimes_daysSinceJ2000,
    arrivalTimes_daysSinceJ2000,
    deltaV_kmps,
    departureDeltaV_kmps,
    arrivalDeltaV_kmps,
    fuelRequired_kg,
    c3_km2s2,
    timeOfFlight_days,
    status,
    solver,
    selectedSolutionReference = null,
}) {
    assertNumericArray(departureTimes_daysSinceJ2000, 'TransferField.departureTimes_daysSinceJ2000');
    assertNumericArray(arrivalTimes_daysSinceJ2000, 'TransferField.arrivalTimes_daysSinceJ2000');

    const rows = departureTimes_daysSinceJ2000.length;
    const cols = arrivalTimes_daysSinceJ2000.length;

    assertGrid(deltaV_kmps, rows, cols, 'TransferField.deltaV_kmps');
    assertGrid(departureDeltaV_kmps, rows, cols, 'TransferField.departureDeltaV_kmps');
    assertGrid(arrivalDeltaV_kmps, rows, cols, 'TransferField.arrivalDeltaV_kmps');
    assertGrid(fuelRequired_kg, rows, cols, 'TransferField.fuelRequired_kg');
    assertGrid(c3_km2s2, rows, cols, 'TransferField.c3_km2s2');
    assertGrid(timeOfFlight_days, rows, cols, 'TransferField.timeOfFlight_days');
    assertStatusGrid(status, rows, cols, 'TransferField.status');
    assert(solver !== null && typeof solver === 'object', 'TransferField.solver is required');

    if (selectedSolutionReference !== null) {
        const { departureIndex, arrivalIndex } = selectedSolutionReference;
        assert(
            departureIndex >= 0 && departureIndex < rows,
            'departureIndex is out of range'
        );
        assert(
            arrivalIndex >= 0 && arrivalIndex < cols,
            'arrivalIndex is out of range'
        );
    }

    return deepFreeze({
        departureTimes_daysSinceJ2000,
        arrivalTimes_daysSinceJ2000,
        deltaV_kmps,
        departureDeltaV_kmps,
        arrivalDeltaV_kmps,
        fuelRequired_kg,
        c3_km2s2,
        timeOfFlight_days,
        status,
        solver,
        selectedSolutionReference,
    });
}