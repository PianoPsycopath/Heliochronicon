import { describe, it, expect } from 'vitest';
import { calculateMassAfterImpulsiveBurn, evaluateTransferFeasibility } from '../PropulsionEvaluator.js';
import { createSpacecraftDefinition } from '../SpacecraftDefinition.js';
import { createPropulsionDefinition } from '../PropulsionDefinition.js';

describe('PropulsionEvaluator', () => {
    it('calculates mass correctly using the Tsiolkovsky rocket equation', () => {
        const initialMass = 1000;
        const deltaV = 3.0; 
        const isp = 300; 
        
        const massAfter = calculateMassAfterImpulsiveBurn(initialMass, deltaV, isp);
        
        // Exhaust velocity = 300 * 9.80665 / 1000 ≈ 2.941995 km/s
        // 1000 * exp(-3.0 / 2.941995) ≈ 360.71 kg
        expect(massAfter).toBeCloseTo(360.71, 1);
    });

    const createMockTransfer = (deltaVMag) => ({
        departureState: { position: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 1, z: 0 }, epoch_daysSinceJ2000: 0, mu: 1 },
        arrivalState: { position: { x: 0, y: 1, z: 0 }, velocity: { x: -1, y: 0, z: 0 }, epoch_daysSinceJ2000: 10, mu: 1 },
        departureDeltaV: { x: deltaVMag / 2, y: deltaVMag / 2, z: 0 },
        arrivalDeltaV: { x: -deltaVMag / 2, y: -deltaVMag / 2, z: 0 },
        departureDeltaVMagnitude: deltaVMag / 2,
        arrivalDeltaVMagnitude: deltaVMag / 2,
        totalDeltaVMagnitude: deltaVMag,
        trajectorySamples: [],
        timeOfFlight_days: 10,
        solverMetadata: { converged: true, route: 'PROGRADE' }
    });

    const prop = createPropulsionDefinition({
        name: 'Chemical',
        type: 'CHEMICAL',
        specificImpulse_s: 300,
        thrust_N: 500
    });

    it('evaluates an infeasible transfer properly (insufficient propellant)', () => {
        const spacecraft = createSpacecraftDefinition({
            name: 'Test Probe',
            dryMass_kg: 500,
            propellantMass_kg: 500,
            propulsion: prop
        }); 
        const mockTransfer = createMockTransfer(2.828);

        const { solution, isFeasible } = evaluateTransferFeasibility(mockTransfer, spacecraft);

        expect(isFeasible).toBe(false);
        expect(solution.propellantRemaining_kg).toBeLessThan(0);
        expect(solution.massHistory.length).toBe(3);
        expect(solution.burns[0].massAfter_kg).toBeLessThanOrEqual(solution.burns[0].massBefore_kg);
        expect(solution.burns[1].massAfter_kg).toBeLessThanOrEqual(solution.burns[1].massBefore_kg);
    });

    it('evaluates a feasible transfer properly (sufficient propellant)', () => {
        const spacecraft = createSpacecraftDefinition({
            name: 'Heavy Probe',
            dryMass_kg: 500,
            propellantMass_kg: 2000,
            propulsion: prop
        });
        const mockTransfer = createMockTransfer(2.828);

        const { solution, isFeasible } = evaluateTransferFeasibility(mockTransfer, spacecraft);

        expect(isFeasible).toBe(true);
        expect(solution.propellantRemaining_kg).toBeGreaterThanOrEqual(0);
        expect(solution.massHistory.length).toBe(3);
        expect(solution.burns[0].massAfter_kg).toBeLessThanOrEqual(solution.burns[0].massBefore_kg);
    });

    it('handles a zero delta-V edge case without altering mass', () => {
        const spacecraft = createSpacecraftDefinition({
            name: 'Zero V Probe',
            dryMass_kg: 500,
            propellantMass_kg: 100,
            propulsion: prop
        });
        const mockTransfer = createMockTransfer(0);

        const { solution, isFeasible } = evaluateTransferFeasibility(mockTransfer, spacecraft);

        expect(isFeasible).toBe(true);
        expect(solution.propellantRequired_kg).toBe(0);
        expect(solution.propellantRemaining_kg).toBe(100);
        expect(solution.massHistory[2]).toBe(600); // 500 dry + 100 prop
    });

    it('throws an error if propulsion or Isp is missing and delta-V > 0', () => {
        const spacecraftNoProp = createSpacecraftDefinition({
            name: 'No Prop Probe',
            dryMass_kg: 500,
            propellantMass_kg: 100
        });
        const mockTransfer = createMockTransfer(2.828);

        expect(() => evaluateTransferFeasibility(mockTransfer, spacecraftNoProp)).toThrowError(/spacecraft\.propulsion is required/);
    });
});