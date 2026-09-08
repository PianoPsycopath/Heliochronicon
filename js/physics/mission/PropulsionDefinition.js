import { assertNonEmptyString, assertFiniteNumber, assertOneOf, deepFreeze } from './validation.js';

export const PROPULSION_TYPES = ['CHEMICAL', 'ION', 'CONSTANT_ACCELERATION'];

export function createPropulsionDefinition({
    name,
    type,
    specificImpulse_s,
    thrust_N,
    maxAcceleration_mps2 = null,
    massFlowRate_kgps = null,
}) {
    assertNonEmptyString(name, 'PropulsionDefinition.name');
    assertOneOf(type, PROPULSION_TYPES, 'PropulsionDefinition.type');
    assertFiniteNumber(specificImpulse_s, 'PropulsionDefinition.specificImpulse_s');
    assertFiniteNumber(thrust_N, 'PropulsionDefinition.thrust_N');

    if (type === 'CONSTANT_ACCELERATION') {
        assertFiniteNumber(maxAcceleration_mps2, 'PropulsionDefinition.maxAcceleration_mps2');
    }
    if (massFlowRate_kgps !== null) {
        assertFiniteNumber(massFlowRate_kgps, 'PropulsionDefinition.massFlowRate_kgps');
    }

    return deepFreeze({
        name,
        type,
        specificImpulse_s,
        thrust_N,
        maxAcceleration_mps2,
        massFlowRate_kgps,
    });
}
