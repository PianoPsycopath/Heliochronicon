import { describe, it, expect } from 'vitest';
import { createBurn } from '../Burn.js';

describe('createBurn', () => {
    it('computes deltaVMagnitude_kmps from the deltaV vector', () => {
        const burn = createBurn({
            time_daysSinceJ2000: 9000,
            position: { x: 1, y: 0, z: 0 },
            deltaV_kmps: { x: 3, y: 4, z: 0 },
            massBefore_kg: 1000,
            massAfter_kg: 950,
            type: 'IMPULSIVE',
        });
        expect(burn.deltaVMagnitude_kmps).toBe(5);
        expect(Object.isFrozen(burn)).toBe(true);
    });

    it('rejects an unknown burn type', () => {
        expect(() =>
            createBurn({
                time_daysSinceJ2000: 9000,
                position: { x: 1, y: 0, z: 0 },
                deltaV_kmps: { x: 1, y: 0, z: 0 },
                massBefore_kg: 1000,
                massAfter_kg: 999,
                type: 'MYSTERY',
            })
        ).toThrow('Burn.type must be one of');
    });

    it('rejects a malformed deltaV vector', () => {
        expect(() =>
            createBurn({
                time_daysSinceJ2000: 9000,
                position: { x: 1, y: 0, z: 0 },
                deltaV_kmps: { x: 1, y: 0 },
                massBefore_kg: 1000,
                massAfter_kg: 999,
                type: 'IMPULSIVE',
            })
        ).toThrow('Burn.deltaV_kmps.z must be a finite number');
    });
});
