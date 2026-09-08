import { assert, assertFiniteNumber, assertVector3, deepFreeze } from './validation.js';

function assertState(state, label) {
    assert(state !== null && typeof state === 'object', `${label} must be an object`);
    assertVector3(state.position, `${label}.position`);
    assertVector3(state.velocity, `${label}.velocity`);
    assertFiniteNumber(state.time_daysSinceJ2000, `${label}.time_daysSinceJ2000`);
}

export function createMissionSnapshot({
    calculationTime_daysSinceJ2000,
    originState,
    targetState,
    spacecraft,
    propulsion,
    solver,
    targetConfiguration,
    searchConfiguration,
}) {
    assertFiniteNumber(calculationTime_daysSinceJ2000, 'MissionSnapshot.calculationTime_daysSinceJ2000');
    assertState(originState, 'MissionSnapshot.originState');
    assertState(targetState, 'MissionSnapshot.targetState');
    assert(spacecraft !== null && typeof spacecraft === 'object', 'MissionSnapshot.spacecraft is required');
    assert(propulsion !== null && typeof propulsion === 'object', 'MissionSnapshot.propulsion is required');
    assert(solver !== null && typeof solver === 'object', 'MissionSnapshot.solver is required');
    assert(
        targetConfiguration !== null && typeof targetConfiguration === 'object',
        'MissionSnapshot.targetConfiguration is required'
    );
    assert(
        searchConfiguration !== null && typeof searchConfiguration === 'object',
        'MissionSnapshot.searchConfiguration is required'
    );

    return deepFreeze({
        calculationTime_daysSinceJ2000,
        originState,
        targetState,
        spacecraft,
        propulsion,
        solver,
        targetConfiguration,
        searchConfiguration,
    });
}
