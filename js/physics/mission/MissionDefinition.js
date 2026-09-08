import { assert, assertNonEmptyString, assertFiniteNumber, deepFreeze } from './validation.js';

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

export function createMissionDefinition({
    origin,
    target,
    departureWindow,
    arrivalWindow = null,
    timeOfFlightWindow = null,
    spacecraft,
    propulsion,
    solver,
    searchConfiguration,
}) {
    assertNonEmptyString(origin, 'MissionDefinition.origin');
    assert(target !== null && typeof target === 'object', 'MissionDefinition.target must be a TargetDefinition');
    assertWindow(departureWindow, 'MissionDefinition.departureWindow');
    assert(
        (arrivalWindow !== null) !== (timeOfFlightWindow !== null),
        'MissionDefinition requires exactly one of arrivalWindow or timeOfFlightWindow'
    );
    if (arrivalWindow !== null) {
        assertWindow(arrivalWindow, 'MissionDefinition.arrivalWindow');
    } else {
        assertTimeOfFlightWindow(timeOfFlightWindow, 'MissionDefinition.timeOfFlightWindow');
    }
    assert(spacecraft !== null && typeof spacecraft === 'object', 'MissionDefinition.spacecraft is required');
    assert(propulsion !== null && typeof propulsion === 'object', 'MissionDefinition.propulsion is required');
    assertNonEmptyString(solver?.id, 'MissionDefinition.solver.id');
    assert(
        searchConfiguration !== null && typeof searchConfiguration === 'object',
        'MissionDefinition.searchConfiguration is required'
    );
    assertFiniteNumber(searchConfiguration.departureStep_days, 'MissionDefinition.searchConfiguration.departureStep_days');
    assertFiniteNumber(searchConfiguration.arrivalStep_days, 'MissionDefinition.searchConfiguration.arrivalStep_days');

    return deepFreeze({
        origin,
        target,
        departureWindow,
        arrivalWindow,
        timeOfFlightWindow,
        spacecraft,
        propulsion,
        solver,
        searchConfiguration,
    });
}
