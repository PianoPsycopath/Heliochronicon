// tests/navigation/FlightPlan.test.js
import { describe, it, expect } from 'vitest';
import { FlightPlan } from '@navigation/FlightPlan.js';
import { Target } from '@navigation/Target.js';

describe('FlightPlan', () => {
    it('constructs a minimal plan with sensible defaults', () => {
        const target = Target.create({ bodyName: 'MARS' });
        const plan = FlightPlan.create({ fleetId: 'user-fleet', target });

        expect(plan.fleetId).toBe('user-fleet');
        expect(plan.target).toBe(target);
        expect(plan.burns).toEqual([]);
        expect(plan.totalDeltaV).toBe(0);
        expect(plan.propellantRequired).toBe(0);
        expect(plan.isFeasible).toBe(true);
        expect(plan.warnings).toEqual([]);
    });

    it('constructs burns via Burn.create from raw burn data', () => {
        const target = Target.create({ bodyName: 'MARS' });
        const plan = FlightPlan.create({
            fleetId: 'user-fleet',
            target,
            burns: [{ epochDaysJ2000: 10, deltaV: { x: 1, y: 0, z: 0 } }],
        });

        expect(plan.burns).toHaveLength(1);
        expect(plan.burns[0]).toMatchObject({ epochDaysJ2000: 10 });
    });

    it('throws when fleetId is missing', () => {
        const target = Target.create({ bodyName: 'MARS' });
        expect(() => FlightPlan.create({ target })).toThrow();
    });

    it('throws when target is missing', () => {
        expect(() => FlightPlan.create({ fleetId: 'user-fleet' })).toThrow();
    });
});
