import { assert, assertNonEmptyString, assertFiniteNumber, deepFreeze } from './validation.js';

export function createSpacecraftDefinition({
    name,
    dryMass_kg,
    propellantMass_kg,
    propulsion = null,
}) {
    assertNonEmptyString(name, 'SpacecraftDefinition.name');
    assertFiniteNumber(dryMass_kg, 'SpacecraftDefinition.dryMass_kg');
    assertFiniteNumber(propellantMass_kg, 'SpacecraftDefinition.propellantMass_kg');
    assert(dryMass_kg > 0, 'SpacecraftDefinition.dryMass_kg must be positive');
    assert(propellantMass_kg >= 0, 'SpacecraftDefinition.propellantMass_kg must be non-negative');

    return deepFreeze({
        name,
        dryMass_kg,
        propellantMass_kg,
        wetMass_kg: dryMass_kg + propellantMass_kg,
        propulsion,
    });
}
