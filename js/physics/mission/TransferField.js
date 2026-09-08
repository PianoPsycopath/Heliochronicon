import { assert, deepFreeze } from './validation.js';

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

export function createTransferField({
    departureTimes_daysSinceJ2000,
    arrivalTimes_daysSinceJ2000,
    deltaV_kmps,
    departureDeltaV_kmps,
    arrivalDeltaV_kmps,
    fuelRequired_kg,
    c3_km2s2,
    timeOfFlight_days,
    feasibility,
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
    assertGrid(feasibility, rows, cols, 'TransferField.feasibility');
    assert(solver !== null && typeof solver === 'object', 'TransferField.solver is required');

    if (selectedSolutionReference !== null) {
        assert(
            typeof selectedSolutionReference === 'object' &&
                Number.isInteger(selectedSolutionReference.departureIndex) &&
                Number.isInteger(selectedSolutionReference.arrivalIndex),
            'TransferField.selectedSolutionReference must have integer departureIndex/arrivalIndex'
        );
        assert(
            selectedSolutionReference.departureIndex >= 0 && selectedSolutionReference.departureIndex < rows,
            'TransferField.selectedSolutionReference.departureIndex is out of range'
        );
        assert(
            selectedSolutionReference.arrivalIndex >= 0 && selectedSolutionReference.arrivalIndex < cols,
            'TransferField.selectedSolutionReference.arrivalIndex is out of range'
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
        feasibility,
        solver,
        selectedSolutionReference,
    });
}
