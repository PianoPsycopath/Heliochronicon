import { createTrajectorySolver } from './TrajectorySolver.js';
import { assert } from './validation.js';

export function createImpulsiveTransferSolver(config) {
    assert(
        config.definition.family === 'IMPULSIVE',
        'ImpulsiveTransferSolver definition must have family IMPULSIVE'
    );
    return createTrajectorySolver(config);
}