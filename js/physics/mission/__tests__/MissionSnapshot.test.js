import { describe, it, expect } from 'vitest';
import { createMissionSnapshot } from '../MissionSnapshot.js';
import { createSpacecraftDefinition } from '../SpacecraftDefinition.js';
import { createPropulsionDefinition } from '../PropulsionDefinition.js';
import { createSolverDefinition } from '../SolverDefinition.js';
import { createTargetDefinition } from '../TargetDefinition.js';
import { createOrbitalState } from '../OrbitalState.js';

function buildValidArgs(overrides = {}) {
    return {
        calculationTime_daysSinceJ2000: 9000,
        originState: {
            position: { x: 1, y: 0, z: 0 },
            velocity: { x: 0, y: 1, z: 0 },
            time_daysSinceJ2000: 9000,
        },
        targetState: {
            position: { x: 1.5, y: 0, z: 0 },
            velocity: { x: 0, y: 0.8, z: 0 },
            time_daysSinceJ2000: 9000,
        },
        spacecraft: createSpacecraftDefinition({
            name: 'Probe',
            dryMass_kg: 500,
            propellantMass_kg: 200,
        }),
        propulsion: createPropulsionDefinition({
            name: 'Bipropellant',
            type: 'CHEMICAL',
            specificImpulse_s: 320,
            thrust_N: 5000,
        }),
        solver: createSolverDefinition({
            id: 'lambert-universal',
            name: 'Lambert',
            family: 'IMPULSIVE',
            supportedTargetTypes: ['BODY_CENTER'],
        }),
        targetConfiguration: createTargetDefinition({ type: 'BODY_CENTER', bodyName: 'MARS' }),
        searchConfiguration: { departureStep_days: 1, arrivalStep_days: 1 },
        ...overrides,
    };
}

describe('createMissionSnapshot', () => {
    it('constructs an immutable snapshot', () => {
        const snapshot = createMissionSnapshot(buildValidArgs());
        expect(snapshot.calculationTime_daysSinceJ2000).toBe(9000);
        expect(Object.isFrozen(snapshot)).toBe(true);
        expect(Object.isFrozen(snapshot.originState)).toBe(true);
    });

    it('rejects a malformed originState', () => {
        expect(() =>
            createMissionSnapshot(buildValidArgs({ originState: { position: { x: 1, y: 0, z: 0 } } }))
        ).toThrow('MissionSnapshot.originState.velocity must be an object with x, y, z');
    });

    it('accepts canonical OrbitalState epoch_daysSinceJ2000 as the captured state time', () => {
        const originState = createOrbitalState({
            position: { x: 1, y: 0, z: 0 },
            velocity: { x: 0, y: 1, z: 0 },
            epoch_daysSinceJ2000: 9000,
            mu: 1,
        });
        const targetState = createOrbitalState({
            position: { x: 1.5, y: 0, z: 0 },
            velocity: { x: 0, y: 0.8, z: 0 },
            epoch_daysSinceJ2000: 9200,
            mu: 1,
        });
        const snapshot = createMissionSnapshot(buildValidArgs({ originState, targetState }));
        expect(snapshot.originState).toBe(originState);
        expect(snapshot.targetState).toBe(targetState);
        expect(snapshot.originState.epoch_daysSinceJ2000).toBe(9000);
    });

    it('rejects a state with neither time_daysSinceJ2000 nor epoch_daysSinceJ2000', () => {
        expect(() =>
            createMissionSnapshot(
                buildValidArgs({
                    originState: { position: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 1, z: 0 } },
                })
            )
        ).toThrow('MissionSnapshot.originState time');
    });
});
