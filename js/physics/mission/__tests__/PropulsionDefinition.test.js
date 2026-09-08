import { describe, it, expect } from 'vitest';
import { createPropulsionDefinition } from '../PropulsionDefinition.js';

describe('createPropulsionDefinition', () => {
    it('constructs a chemical propulsion definition', () => {
        const propulsion = createPropulsionDefinition({
            name: 'Hypergolic Bipropellant',
            type: 'CHEMICAL',
            specificImpulse_s: 320,
            thrust_N: 5000,
        });
        expect(propulsion.type).toBe('CHEMICAL');
        expect(propulsion.maxAcceleration_mps2).toBeNull();
        expect(Object.isFrozen(propulsion)).toBe(true);
    });

    it('requires maxAcceleration_mps2 for CONSTANT_ACCELERATION propulsion', () => {
        expect(() =>
            createPropulsionDefinition({
                name: 'Torch Drive',
                type: 'CONSTANT_ACCELERATION',
                specificImpulse_s: 1e6,
                thrust_N: 1e5,
            })
        ).toThrow('maxAcceleration_mps2');
    });

    it('accepts CONSTANT_ACCELERATION propulsion when maxAcceleration_mps2 is provided', () => {
        const propulsion = createPropulsionDefinition({
            name: 'Torch Drive',
            type: 'CONSTANT_ACCELERATION',
            specificImpulse_s: 1e6,
            thrust_N: 1e5,
            maxAcceleration_mps2: 0.1,
        });
        expect(propulsion.maxAcceleration_mps2).toBe(0.1);
    });

    it('rejects an unknown propulsion type', () => {
        expect(() =>
            createPropulsionDefinition({
                name: 'Mystery',
                type: 'WARP',
                specificImpulse_s: 100,
                thrust_N: 100,
            })
        ).toThrow('PropulsionDefinition.type must be one of');
    });
});
