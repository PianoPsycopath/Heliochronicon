import { assert, assertFiniteNumber, assertVector3, deepFreeze } from './validation.js';

function assertState(state, label) {
    assert(state !== null && typeof state === 'object', `${label} must be an object`);
    assertVector3(state.position, `${label}.position`);
    assertVector3(state.velocity, `${label}.velocity`);
    assertFiniteNumber(state.time_daysSinceJ2000, `${label}.time_daysSinceJ2000`);
}

function assertArray(value, label) {
    assert(Array.isArray(value), `${label} must be an array`);
}

export function createMissionSolution({
    totalDeltaV_kmps,
    departureDeltaV_kmps,
    arrivalDeltaV_kmps,
    burns,
    trajectorySamples,
    departureState,
    arrivalState,
    timeOfFlight_days,
    c3_km2s2,
    hyperbolicExcessVelocity_kmps,
    propellantRequired_kg,
    propellantRemaining_kg,
    massHistory,
    solver,
    quality,
}) {
    assertFiniteNumber(totalDeltaV_kmps, 'MissionSolution.totalDeltaV_kmps');
    assertFiniteNumber(departureDeltaV_kmps, 'MissionSolution.departureDeltaV_kmps');
    assertFiniteNumber(arrivalDeltaV_kmps, 'MissionSolution.arrivalDeltaV_kmps');
    assertArray(burns, 'MissionSolution.burns');
    assertArray(trajectorySamples, 'MissionSolution.trajectorySamples');
    assertState(departureState, 'MissionSolution.departureState');
    assertState(arrivalState, 'MissionSolution.arrivalState');
    assertFiniteNumber(timeOfFlight_days, 'MissionSolution.timeOfFlight_days');
    assert(timeOfFlight_days > 0, 'MissionSolution.timeOfFlight_days must be positive');
    assertFiniteNumber(c3_km2s2, 'MissionSolution.c3_km2s2');
    assert(
        hyperbolicExcessVelocity_kmps !== null && typeof hyperbolicExcessVelocity_kmps === 'object',
        'MissionSolution.hyperbolicExcessVelocity_kmps must be an object'
    );
    assertFiniteNumber(hyperbolicExcessVelocity_kmps.departure, 'MissionSolution.hyperbolicExcessVelocity_kmps.departure');
    assertFiniteNumber(hyperbolicExcessVelocity_kmps.arrival, 'MissionSolution.hyperbolicExcessVelocity_kmps.arrival');
    assertFiniteNumber(propellantRequired_kg, 'MissionSolution.propellantRequired_kg');
    assertFiniteNumber(propellantRemaining_kg, 'MissionSolution.propellantRemaining_kg');
    assertArray(massHistory, 'MissionSolution.massHistory');
    assert(solver !== null && typeof solver === 'object', 'MissionSolution.solver is required');
    assert(quality !== null && typeof quality === 'object', 'MissionSolution.quality is required');
    assert(typeof quality.converged === 'boolean', 'MissionSolution.quality.converged must be a boolean');

    return deepFreeze({
        totalDeltaV_kmps,
        departureDeltaV_kmps,
        arrivalDeltaV_kmps,
        burns,
        trajectorySamples,
        departureState,
        arrivalState,
        timeOfFlight_days,
        c3_km2s2,
        hyperbolicExcessVelocity_kmps,
        propellantRequired_kg,
        propellantRemaining_kg,
        massHistory,
        solver,
        quality,
    });
}
