import { assert, deepFreeze } from './validation.js';

export function createTrajectorySolver({ definition, solve }) {
    assert(definition !== null && typeof definition === 'object', 'TrajectorySolver.definition must be an object');
    assert(typeof solve === 'function', 'TrajectorySolver.solve must be a function');

    return deepFreeze({
        definition,
        solve
    });
}