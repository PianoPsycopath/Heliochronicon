import { describe, it, expect } from 'vitest';
import { createSolverDefinition } from '../SolverDefinition.js';

describe('createSolverDefinition', () => {
    it('constructs a solver definition', () => {
        const solver = createSolverDefinition({
            id: 'lambert-universal',
            name: 'Lambert (Universal Variables)',
            family: 'IMPULSIVE',
            supportedTargetTypes: ['BODY_CENTER', 'BODY_ORBIT'],
            capabilities: ['multi-revolution'],
        });
        expect(solver.family).toBe('IMPULSIVE');
        expect(Object.isFrozen(solver)).toBe(true);
    });

    it('rejects an unsupported family', () => {
        expect(() =>
            createSolverDefinition({
                id: 'x',
                name: 'X',
                family: 'MAGIC',
                supportedTargetTypes: ['BODY_CENTER'],
            })
        ).toThrow('SolverDefinition.family must be one of');
    });

    it('rejects an empty supportedTargetTypes array', () => {
        expect(() =>
            createSolverDefinition({
                id: 'x',
                name: 'X',
                family: 'IMPULSIVE',
                supportedTargetTypes: [],
            })
        ).toThrow('must be a non-empty array');
    });

    it('rejects an unsupported target type entry', () => {
        expect(() =>
            createSolverDefinition({
                id: 'x',
                name: 'X',
                family: 'IMPULSIVE',
                supportedTargetTypes: ['WORMHOLE'],
            })
        ).toThrow('unsupported value');
    });
});
