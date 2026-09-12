// tests/navigation/Burn.test.js
import { describe, it, expect } from 'vitest';
import { Burn } from '@navigation/Burn.js';

describe('Burn', () => {
    it('constructs a Burn with epoch and deltaV', () => {
        const burn = Burn.create({
            epochDaysJ2000: 42,
            deltaV: { x: 1.1, y: 0, z: -0.2 },
        });

        expect(burn.epochDaysJ2000).toBe(42);
        expect(burn.deltaV).toEqual({ x: 1.1, y: 0, z: -0.2 });
        expect(burn.position).toBeNull();
    });

    it('accepts an optional position vector', () => {
        const burn = Burn.create({
            epochDaysJ2000: 42,
            deltaV: { x: 1, y: 0, z: 0 },
            position: { x: 10, y: 20, z: 30 },
        });

        expect(burn.position).toEqual({ x: 10, y: 20, z: 30 });
    });

    it('throws when epochDaysJ2000 is missing', () => {
        expect(() => Burn.create({ deltaV: { x: 0, y: 0, z: 0 } })).toThrow();
    });

    it('throws when deltaV is missing or malformed', () => {
        expect(() => Burn.create({ epochDaysJ2000: 1 })).toThrow();
        expect(() => Burn.create({ epochDaysJ2000: 1, deltaV: { x: 1 } })).toThrow();
    });
});
