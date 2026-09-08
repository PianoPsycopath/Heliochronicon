import { assertFiniteNumber, assertOneOf, assertVector3, deepFreeze } from './validation.js';

export const BURN_TYPES = ['IMPULSIVE', 'POWERED_START', 'POWERED_END'];

export function createBurn({
    time_daysSinceJ2000,
    position,
    deltaV_kmps,
    massBefore_kg,
    massAfter_kg,
    type,
}) {
    assertFiniteNumber(time_daysSinceJ2000, 'Burn.time_daysSinceJ2000');
    assertVector3(position, 'Burn.position');
    assertVector3(deltaV_kmps, 'Burn.deltaV_kmps');
    assertFiniteNumber(massBefore_kg, 'Burn.massBefore_kg');
    assertFiniteNumber(massAfter_kg, 'Burn.massAfter_kg');
    assertOneOf(type, BURN_TYPES, 'Burn.type');

    const deltaVMagnitude_kmps = Math.sqrt(
        deltaV_kmps.x * deltaV_kmps.x + deltaV_kmps.y * deltaV_kmps.y + deltaV_kmps.z * deltaV_kmps.z
    );

    return deepFreeze({
        time_daysSinceJ2000,
        position,
        deltaV_kmps,
        deltaVMagnitude_kmps,
        massBefore_kg,
        massAfter_kg,
        type,
    });
}
