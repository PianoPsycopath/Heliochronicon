import { assertNonEmptyString, assertOneOf, deepFreeze } from './validation.js';
import { TARGET_TYPES } from './TargetDefinition.js';

export const SOLVER_FAMILIES = ['IMPULSIVE', 'POWERED'];

export function createSolverDefinition({
    id,
    name,
    family,
    supportedTargetTypes,
    capabilities = [],
}) {
    assertNonEmptyString(id, 'SolverDefinition.id');
    assertNonEmptyString(name, 'SolverDefinition.name');
    assertOneOf(family, SOLVER_FAMILIES, 'SolverDefinition.family');
    assertNonEmptyArrayOf(supportedTargetTypes, TARGET_TYPES, 'SolverDefinition.supportedTargetTypes');
    assertArrayOfStrings(capabilities, 'SolverDefinition.capabilities');

    return deepFreeze({
        id,
        name,
        family,
        supportedTargetTypes: [...supportedTargetTypes],
        capabilities: [...capabilities],
    });
}

function assertNonEmptyArrayOf(values, allowed, label) {
    if (!Array.isArray(values) || values.length === 0) {
        throw new Error(`${label} must be a non-empty array`);
    }
    values.forEach((value) => {
        if (!allowed.includes(value)) {
            throw new Error(`${label} contains an unsupported value: ${value}`);
        }
    });
}

function assertArrayOfStrings(values, label) {
    if (!Array.isArray(values) || values.some((value) => typeof value !== 'string')) {
        throw new Error(`${label} must be an array of strings`);
    }
}
