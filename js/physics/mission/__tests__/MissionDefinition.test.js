import { describe, it, expect } from 'vitest';
import { createMissionDefinition } from '../MissionDefinition.js';
import { createTargetDefinition } from '../TargetDefinition.js';
import { createSpacecraftDefinition } from '../SpacecraftDefinition.js';
import { createPropulsionDefinition } from '../PropulsionDefinition.js';
import { createSolverDefinition } from '../SolverDefinition.js';

function buildValidArgs(overrides = {}) {
    const propulsion = createPropulsionDefinition({
        name: 'Bipropellant',
        type: 'CHEMICAL',
        specificImpulse_s: 320,
        thrust_N: 5000,
    });
    return {
        origin: 'EARTH',
        target: createTargetDefinition({ type: 'BODY_CENTER', bodyName: 'MARS' }),
        departureWindow: { start_daysSinceJ2000: 9000, end_daysSinceJ2000: 9100 },
        arrivalWindow: { start_daysSinceJ2000: 9200, end_daysSinceJ2000: 9400 },
        spacecraft: createSpacecraftDefinition({
            name: 'Probe',
            dryMass_kg: 500,
            propellantMass_kg: 200,
        }),
        propulsion,
        solver: createSolverDefinition({
            id: 'lambert-universal',
            name: 'Lambert',
            family: 'IMPULSIVE',
            supportedTargetTypes: ['BODY_CENTER'],
        }),
        searchConfiguration: { departureStep_days: 1, arrivalStep_days: 1 },
        ...overrides,
    };
}

describe('createMissionDefinition', () => {
    it('constructs a mission definition with an arrival window', () => {
        const mission = createMissionDefinition(buildValidArgs());
        expect(mission.origin).toBe('EARTH');
        expect(mission.timeOfFlightWindow).toBeNull();
        expect(Object.isFrozen(mission)).toBe(true);
    });

    it('constructs a mission definition with a time-of-flight window instead', () => {
        const mission = createMissionDefinition(
            buildValidArgs({
                arrivalWindow: null,
                timeOfFlightWindow: { min_days: 100, max_days: 400 },
            })
        );
        expect(mission.arrivalWindow).toBeNull();
        expect(mission.timeOfFlightWindow).toEqual({ min_days: 100, max_days: 400 });
    });

    it('rejects supplying both arrivalWindow and timeOfFlightWindow', () => {
        expect(() =>
            createMissionDefinition(
                buildValidArgs({ timeOfFlightWindow: { min_days: 100, max_days: 400 } })
            )
        ).toThrow('exactly one of arrivalWindow or timeOfFlightWindow');
    });

    it('rejects supplying neither arrivalWindow nor timeOfFlightWindow', () => {
        expect(() => createMissionDefinition(buildValidArgs({ arrivalWindow: null }))).toThrow(
            'exactly one of arrivalWindow or timeOfFlightWindow'
        );
    });

    it('rejects a departure window that ends before it starts', () => {
        expect(() =>
            createMissionDefinition(
                buildValidArgs({
                    departureWindow: { start_daysSinceJ2000: 9100, end_daysSinceJ2000: 9000 },
                })
            )
        ).toThrow('must not precede start_daysSinceJ2000');
    });

    it('requires a solver id', () => {
        expect(() => createMissionDefinition(buildValidArgs({ solver: {} }))).toThrow(
            'MissionDefinition.solver.id must be a non-empty string'
        );
    });
});
