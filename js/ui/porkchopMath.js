export const METRIC_KEYS = Object.freeze({
    DELTA_V: 'deltaV',
    FUEL: 'fuelRequired',
    TIME_OF_FLIGHT: 'timeOfFlight',
    C3: 'c3',
});

export const METRIC_LABELS = Object.freeze({
    [METRIC_KEYS.DELTA_V]: 'Δv (km/s)',
    [METRIC_KEYS.FUEL]: 'FUEL (kg)',
    [METRIC_KEYS.TIME_OF_FLIGHT]: 'TOF (d)',
    [METRIC_KEYS.C3]: 'C3 (km²/s²)',
});

const METRIC_GRID_KEYS = Object.freeze({
    [METRIC_KEYS.DELTA_V]: 'deltaV_kmps',
    [METRIC_KEYS.FUEL]: 'fuelRequired_kg',
    [METRIC_KEYS.TIME_OF_FLIGHT]: 'timeOfFlight_days',
    [METRIC_KEYS.C3]: 'c3_km2s2',
});

// Mirrors TransferField.CELL_STATUS by contract (values must match). Kept as a local,
// import-free copy rather than an import from js/physics/mission so this UI-side pure-math
// module stays decoupled from the physics module boundary, consistent with how it already
// consumes TransferField's grids structurally rather than by importing the module.
export const CELL_STATUS = Object.freeze({
    VALID: 'VALID',
    INFEASIBLE: 'INFEASIBLE',
    UNSOLVABLE: 'UNSOLVABLE',
});

const INFEASIBLE_COLOR = '#1a1a1a';
const UNSOLVABLE_COLOR = '#000000';

function clamp01(t) {
    if (t < 0) return 0;
    if (t > 1) return 1;
    return t;
}

export function gridForMetric(field, metricKey) {
    const gridKey = METRIC_GRID_KEYS[metricKey];
    if (!gridKey) throw new Error(`porkchopMath: unknown metric key "${metricKey}"`);
    return field[gridKey];
}

export function valueAt(field, metricKey, departureIndex, arrivalIndex) {
    return gridForMetric(field, metricKey)[departureIndex][arrivalIndex];
}

export function computeValueRange(field, metricKey) {
    const grid = gridForMetric(field, metricKey);
    let min = null;
    let max = null;
    for (let i = 0; i < grid.length; i++) {
        for (let j = 0; j < grid[i].length; j++) {
            if (field.status[i][j] !== CELL_STATUS.VALID) continue;
            const value = grid[i][j];
            if (!Number.isFinite(value)) continue;
            if (min === null || value < min) min = value;
            if (max === null || value > max) max = value;
        }
    }
    if (min === null) return { min: 0, max: 1 };
    if (min === max) return { min, max: min + 1 };
    return { min, max };
}

// Low values (favorable) map to cyan, high values (costly) map to red, matching the
// existing CRT accent/danger palette rather than a generic rainbow. Infeasible and
// unsolvable cells are rendered as flat, non-gradient colors so they never read as a
// point on the heat scale.
export function colorForValue(value, range, status) {
    if (status === CELL_STATUS.UNSOLVABLE) return UNSOLVABLE_COLOR;
    if (status === CELL_STATUS.INFEASIBLE || !Number.isFinite(value)) return INFEASIBLE_COLOR;
    const t = clamp01((value - range.min) / (range.max - range.min));
    const hue = 180 - t * 180;
    return `hsl(${hue.toFixed(1)}, 85%, 50%)`;
}

export function candidateAt(field, departureIndex, arrivalIndex) {
    return {
        departureIndex,
        arrivalIndex,
        departureTime_daysSinceJ2000: field.departureTimes_daysSinceJ2000[departureIndex],
        arrivalTime_daysSinceJ2000: field.arrivalTimes_daysSinceJ2000[arrivalIndex],
        deltaV_kmps: field.deltaV_kmps[departureIndex][arrivalIndex],
        departureDeltaV_kmps: field.departureDeltaV_kmps[departureIndex][arrivalIndex],
        arrivalDeltaV_kmps: field.arrivalDeltaV_kmps[departureIndex][arrivalIndex],
        fuelRequired_kg: field.fuelRequired_kg[departureIndex][arrivalIndex],
        c3_km2s2: field.c3_km2s2[departureIndex][arrivalIndex],
        timeOfFlight_days: field.timeOfFlight_days[departureIndex][arrivalIndex],
        status: field.status[departureIndex][arrivalIndex],
    };
}

export function minimaMarkers(minima) {
    if (!minima) return [];
    const markers = [];
    if (minima.deltaV) markers.push({ ...minima.deltaV, metric: METRIC_KEYS.DELTA_V, label: 'MIN Δv' });
    if (minima.fuel) markers.push({ ...minima.fuel, metric: METRIC_KEYS.FUEL, label: 'MIN FUEL' });
    if (minima.timeOfFlight) markers.push({ ...minima.timeOfFlight, metric: METRIC_KEYS.TIME_OF_FLIGHT, label: 'MIN TOF' });
    return markers;
}