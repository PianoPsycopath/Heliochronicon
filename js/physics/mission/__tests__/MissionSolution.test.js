import { describe, it, expect } from 'vitest';
import { createMissionSolution } from '../MissionSolution.js';
import { createSolverDefinition } from '../SolverDefinition.js';

function buildValidArgs(overrides = {}) {
    const state = {
        position: { x: 1, y: 0, z: 0 },
        velocity: { x: 0, y: 1, z: 0 },
        time_daysSinceJ2000: 9000,
    };
    return {
        totalDeltaV_kmps: 6.2,
        departureDeltaV_kmps: 3.6,
        arrivalDeltaV_kmps: 2.6,
        burns: [],
        trajectorySamples: [],
        departureState: state,
        arrivalState: { ...state, time_daysSinceJ2000: 9200 },
        timeOfFlight_days: 200,
        c3_km2s2: 12.5,
        hyperbolicExcessVelocity_kmps: { departure: 3.1, arrival: 2.4 },
        propellantRequired_kg: 120,
        propellantRemaining_kg: 80,
        massHistory: [],
        solver: createSolverDefinition({
            id: 'lambert-universal',
            name: 'Lambert',
            family: 'IMPULSIVE',
            supportedTargetTypes: ['BODY_CENTER'],
        }),
        quality: { converged: true, iterations: 12, residual: 1e-9, warnings: [] },
        ...overrides,
    };
}

describe('createMissionSolution', () => {
    it('constructs an immutable mission solution', () => {
        const solution = createMissionSolution(buildValidArgs());
        expect(solution.totalDeltaV_kmps).toBe(6.2);
        expect(Object.isFrozen(solution)).toBe(true);
    });

    it('rejects a non-positive time of flight', () => {
        expect(() => createMissionSolution(buildValidArgs({ timeOfFlight_days: 0 }))).toThrow(
            'timeOfFlight_days must be positive'
        );
    });

    it('rejects a quality object without a boolean converged flag', () => {
        expect(() =>
            createMissionSolution(buildValidArgs({ quality: { converged: 'yes' } }))
        ).toThrow('quality.converged must be a boolean');
    });
});
