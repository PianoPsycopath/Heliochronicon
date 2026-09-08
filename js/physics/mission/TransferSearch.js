// js/physics/mission/TransferSearch.js
import { EphemerisBoundary } from './EphemerisBoundary.js';
import { orbitalStateFromEphemeris } from './OrbitalState.js';
import { LambertSolver, lambertSolverDefinition } from './LambertSolver.js';
import { calculateMassAfterImpulsiveBurn } from './PropulsionEvaluator.js';
import { createTransferField } from './TransferField.js';
import { assert, assertFiniteNumber } from './validation.js';

function assertWindow(window, label) {
    assert(window !== null && typeof window === 'object', `${label} must be an object`);
    assertFiniteNumber(window.start_daysSinceJ2000, `${label}.start_daysSinceJ2000`);
    assertFiniteNumber(window.end_daysSinceJ2000, `${label}.end_daysSinceJ2000`);
    assert(
        window.end_daysSinceJ2000 >= window.start_daysSinceJ2000,
        `${label}.end_daysSinceJ2000 must not precede start_daysSinceJ2000`
    );
}

function assertTimeOfFlightWindow(window, label) {
    assert(window !== null && typeof window === 'object', `${label} must be an object`);
    assertFiniteNumber(window.min_days, `${label}.min_days`);
    assertFiniteNumber(window.max_days, `${label}.max_days`);
    assert(window.max_days >= window.min_days, `${label}.max_days must not be less than min_days`);
}

// Builds an inclusive, evenly-spaced time axis. Bounded by construction: length is
// determined entirely by the window and step, never grows unbounded.
function buildTimeAxis(start, end, step, label) {
    assertFiniteNumber(step, label);
    assert(step > 0, `${label} must be positive`);
    const times = [];
    const count = Math.floor((end - start) / step + 1e-9);
    for (let i = 0; i <= count; i++) {
        times.push(start + i * step);
    }
    const last = times[times.length - 1];
    if (last < end - 1e-9) {
        times.push(end);
    }
    return times;
}

function updateMinimum(current, candidateValue, departureIndex, arrivalIndex) {
    if (current === null || candidateValue < current.value) {
        return { departureIndex, arrivalIndex, value: candidateValue };
    }
    return current;
}

/**
 * Evaluates a bounded departure-time x arrival-time grid of impulsive transfers and
 * returns a compact TransferField plus the best feasible candidate for each headline
 * metric. Each grid cell reuses the existing Phase 2-5 pipeline (EphemerisBoundary ->
 * solver -> propulsion mass equations); no solver math is reimplemented here and no
 * per-cell MissionSolution or trajectory samples are constructed or retained.
 *
 * Exactly one of arrivalWindow or timeOfFlightWindow must be provided, matching
 * MissionDefinition's contract. When timeOfFlightWindow is given, the arrival axis is
 * derived from departureWindow + timeOfFlightWindow so the grid stays rectangular.
 */
export function searchTransferField({
    originBodyData,
    targetBodyData,
    departureWindow,
    arrivalWindow = null,
    timeOfFlightWindow = null,
    spacecraft,
    propulsion = null,
    route = 'PROGRADE',
    resolveParent = () => null,
    mu,
    searchConfiguration,
    solver = LambertSolver,
    solverDefinition = lambertSolverDefinition,
}) {
    assert(originBodyData !== null && typeof originBodyData === 'object', 'searchTransferField: originBodyData is required');
    assert(targetBodyData !== null && typeof targetBodyData === 'object', 'searchTransferField: targetBodyData is required');
    assertWindow(departureWindow, 'searchTransferField.departureWindow');
    assert(
        (arrivalWindow !== null) !== (timeOfFlightWindow !== null),
        'searchTransferField requires exactly one of arrivalWindow or timeOfFlightWindow'
    );
    if (arrivalWindow !== null) {
        assertWindow(arrivalWindow, 'searchTransferField.arrivalWindow');
    } else {
        assertTimeOfFlightWindow(timeOfFlightWindow, 'searchTransferField.timeOfFlightWindow');
    }
    assert(spacecraft !== null && typeof spacecraft === 'object', 'searchTransferField: spacecraft is required');
    assertFiniteNumber(mu, 'searchTransferField.mu');
    assert(typeof resolveParent === 'function', 'searchTransferField: resolveParent must be a function');
    assert(
        searchConfiguration !== null && typeof searchConfiguration === 'object',
        'searchTransferField: searchConfiguration is required'
    );

    const effectiveSpacecraft = propulsion !== null && propulsion !== undefined
        ? { ...spacecraft, propulsion }
        : spacecraft;

    assert(
        effectiveSpacecraft.propulsion !== null && typeof effectiveSpacecraft.propulsion === 'object',
        'searchTransferField: spacecraft.propulsion is required'
    );
    assert(
        effectiveSpacecraft.propulsion.specificImpulse_s > 0,
        'searchTransferField: spacecraft.propulsion.specificImpulse_s must be > 0'
    );
    const isp = effectiveSpacecraft.propulsion.specificImpulse_s;

    const effectiveArrivalWindow = arrivalWindow !== null
        ? arrivalWindow
        : {
            start_daysSinceJ2000: departureWindow.start_daysSinceJ2000 + timeOfFlightWindow.min_days,
            end_daysSinceJ2000: departureWindow.end_daysSinceJ2000 + timeOfFlightWindow.max_days,
        };

    const departureTimes = buildTimeAxis(
        departureWindow.start_daysSinceJ2000,
        departureWindow.end_daysSinceJ2000,
        searchConfiguration.departureStep_days,
        'searchTransferField.searchConfiguration.departureStep_days'
    );
    const arrivalTimes = buildTimeAxis(
        effectiveArrivalWindow.start_daysSinceJ2000,
        effectiveArrivalWindow.end_daysSinceJ2000,
        searchConfiguration.arrivalStep_days,
        'searchTransferField.searchConfiguration.arrivalStep_days'
    );

    // Ephemeris is resolved once per axis value and reused across the whole row/column,
    // rather than once per grid cell.
    const departureStates = departureTimes.map((t) =>
        orbitalStateFromEphemeris(EphemerisBoundary.getState(originBodyData, t, resolveParent), t, mu)
    );
    const arrivalStates = arrivalTimes.map((t) =>
        orbitalStateFromEphemeris(EphemerisBoundary.getState(targetBodyData, t, resolveParent), t, mu)
    );

    const rows = departureTimes.length;
    const cols = arrivalTimes.length;

    const deltaVGrid = [];
    const departureDeltaVGrid = [];
    const arrivalDeltaVGrid = [];
    const fuelRequiredGrid = [];
    const c3Grid = [];
    const tofGrid = [];
    const feasibilityGrid = [];

    let minDeltaV = null;
    let minFuel = null;
    let minTOF = null;

    for (let i = 0; i < rows; i++) {
        const deltaVRow = [];
        const departureDeltaVRow = [];
        const arrivalDeltaVRow = [];
        const fuelRow = [];
        const c3Row = [];
        const tofRow = [];
        const feasibilityRow = [];

        for (let j = 0; j < cols; j++) {
            const dt = arrivalTimes[j] - departureTimes[i];
            const tofOutOfRange = timeOfFlightWindow !== null &&
                (dt < timeOfFlightWindow.min_days || dt > timeOfFlightWindow.max_days);

            let cell = null;
            if (dt > 0 && !tofOutOfRange) {
                try {
                    cell = solver.solve({
                        departureState: departureStates[i],
                        arrivalState: arrivalStates[j],
                        route,
                        sampleCount: 1,
                    });
                } catch {
                    cell = null;
                }
            }

            if (cell === null) {
                deltaVRow.push(NaN);
                departureDeltaVRow.push(NaN);
                arrivalDeltaVRow.push(NaN);
                fuelRow.push(NaN);
                c3Row.push(NaN);
                tofRow.push(dt);
                feasibilityRow.push(false);
                continue;
            }

            const { departureDeltaVMagnitude, arrivalDeltaVMagnitude, totalDeltaVMagnitude } = cell;
            const c3 = departureDeltaVMagnitude * departureDeltaVMagnitude;

            const massAfterDeparture = calculateMassAfterImpulsiveBurn(spacecraft.wetMass_kg, departureDeltaVMagnitude, isp);
            const massAfterArrival = calculateMassAfterImpulsiveBurn(massAfterDeparture, arrivalDeltaVMagnitude, isp);
            const fuelRequired = spacecraft.wetMass_kg - massAfterArrival;
            const isFeasible = fuelRequired <= spacecraft.propellantMass_kg;

            deltaVRow.push(totalDeltaVMagnitude);
            departureDeltaVRow.push(departureDeltaVMagnitude);
            arrivalDeltaVRow.push(arrivalDeltaVMagnitude);
            fuelRow.push(fuelRequired);
            c3Row.push(c3);
            tofRow.push(dt);
            feasibilityRow.push(isFeasible);

            if (isFeasible) {
                minDeltaV = updateMinimum(minDeltaV, totalDeltaVMagnitude, i, j);
                minFuel = updateMinimum(minFuel, fuelRequired, i, j);
                minTOF = updateMinimum(minTOF, dt, i, j);
            }
        }

        deltaVGrid.push(deltaVRow);
        departureDeltaVGrid.push(departureDeltaVRow);
        arrivalDeltaVGrid.push(arrivalDeltaVRow);
        fuelRequiredGrid.push(fuelRow);
        c3Grid.push(c3Row);
        tofGrid.push(tofRow);
        feasibilityGrid.push(feasibilityRow);
    }

    const field = createTransferField({
        departureTimes_daysSinceJ2000: departureTimes,
        arrivalTimes_daysSinceJ2000: arrivalTimes,
        deltaV_kmps: deltaVGrid,
        departureDeltaV_kmps: departureDeltaVGrid,
        arrivalDeltaV_kmps: arrivalDeltaVGrid,
        fuelRequired_kg: fuelRequiredGrid,
        c3_km2s2: c3Grid,
        timeOfFlight_days: tofGrid,
        feasibility: feasibilityGrid,
        solver: solverDefinition,
        selectedSolutionReference: null,
    });

    return { field, minima: { deltaV: minDeltaV, fuel: minFuel, timeOfFlight: minTOF } };
}
