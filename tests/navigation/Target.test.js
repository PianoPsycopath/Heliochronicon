// tests/navigation/Target.test.js
import { describe, it, expect } from 'vitest';
import { Target } from '@navigation/Target.js';

describe('Target', () => {
    it('constructs a body-centered target with Keplerian fields defaulted to null', () => {
        const target = Target.create({ bodyName: 'MARS' });

        expect(target).toEqual({
            bodyName: 'MARS',
            epochDaysJ2000: null,
            a: null,
            e: null,
            i: null,
            w: null,
            node: null,
            M0: null,
        });
    });

    it('preserves optional Keplerian-ready fields when provided', () => {
        const target = Target.create({
            bodyName: 'MARS',
            epochDaysJ2000: 1000,
            a: 1.52,
            e: 0.093,
            i: 0.032,
            w: 5.86,
            node: 0.865,
            M0: 0.1,
        });

        expect(target.epochDaysJ2000).toBe(1000);
        expect(target.a).toBe(1.52);
    });

    it('throws when bodyName is missing', () => {
        expect(() => Target.create({})).toThrow();
    });
});
