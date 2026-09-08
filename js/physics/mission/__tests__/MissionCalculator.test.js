import { describe, it, expect, vi } from 'vitest';
import { createPropulsionDefinition } from '../PropulsionDefinition.js';
import { createSpacecraftDefinition } from '../SpacecraftDefinition.js';

const MU_SUN = 2.959122082855911e-4; // AU^3/day^2

const DEPARTURE_TIME = 1000;
const ARRIVAL_TIME = 1207; // 207-day transfer

const ORIGIN_POSITION = { x: 1.0, y: 0, z: 0 };
const ORIGIN_VELOCITY = { x: 0, y: 0.0172, z: 0 };

const TARGET_ANGLE_RAD = (149.77 * Math.PI) / 180;
const TARGET_RADIUS_AU = 1.524;
const TARGET_POSITION = {
    x: TARGET_RADIUS_AU * Math.cos(TARGET_ANGLE_RAD),
    y: TARGET_RADIUS_AU * Math.sin(TARGET_ANGLE_RAD),
    z: 0,
};
const TARGET_VELOCITY = {
    x: -Math.sin(TARGET_ANGLE_RAD) * 0.01393,
    y: Math.cos(TARGET_ANGLE_RAD) * 0.01393,
    z: 0,
};

vi.mock('../EphemerisBoundary.js', () => ({
    EphemerisBoundary: {
        getState: vi.fn((bodyData) => {
            if (bodyData.name === 'ORIGIN') {
                return { position: ORIGIN_POSITION, velocity: ORIGIN_VELOCITY };
            }
            if (bodyData.name === 'TARGET') {
                return { position: TARGET_POSITION, velocity: TARGET_VELOCITY };
            }
            throw new Error(`unexpected body in test double: ${bodyData.name}`);
        }),
    },
}));

const { calculateMission } = await import('../MissionCalculator.js');

const originBodyData = { name: 'ORIGIN', parent: 'SUN' };
const targetBodyData = { name: 'TARGET', parent: 'SUN' };

function buildSpacecraft({ propellantMass_kg }) {
    const propulsion = createPropulsionDefinition({
        name: 'Chemical Stage',
        type: 'CHEMICAL',
        specificImpulse_s: 300,
        thrust_N: 500,
    });
    return createSpacecraftDefinition({
        name: 'Test Probe',
        dryMass_kg: 500,
        propellantMass_kg,
        propulsion,
    });
}

describe('calculateMission', () => {
    it('produces a valid MissionSolution with finite deltaV, TOF, burns and trajectory samples', () => {
        const spacecraft = buildSpacecraft({ propellantMass_kg: 2000 });

        const { solution, isFeasible, transfer } = calculateMission({
            originBodyData,
            targetBodyData,
            departureTime_daysSinceJ2000: DEPARTURE_TIME,
            arrivalTime_daysSinceJ2000: ARRIVAL_TIME,
            spacecraft,
            mu: MU_SUN,
            sampleCount: 20,
        });

        expect(Number.isFinite(solution.totalDeltaV_kmps)).toBe(true);
        expect(solution.totalDeltaV_kmps).toBeGreaterThan(0);
        expect(Number.isFinite(solution.timeOfFlight_days)).toBe(true);
        expect(solution.timeOfFlight_days).toBeCloseTo(ARRIVAL_TIME - DEPARTURE_TIME);

        expect(solution.burns).toHaveLength(2);
        solution.burns.forEach((burn) => {
            expect(Number.isFinite(burn.deltaVMagnitude_kmps)).toBe(true);
        });

        expect(solution.trajectorySamples.length).toBeGreaterThan(0);
        solution.trajectorySamples.forEach((sample) => {
            expect(Number.isFinite(sample.position.x)).toBe(true);
            expect(Number.isFinite(sample.velocity.x)).toBe(true);
        });

        expect(transfer.solverMetadata.converged).toBe(true);
        expect(isFeasible).toBe(true);
        expect(Object.isFrozen(solution)).toBe(true);
    });

    it('still returns a MissionSolution with isFeasible === false when propellant is insufficient', () => {
        const spacecraft = buildSpacecraft({ propellantMass_kg: 0.05 });

        const { solution, isFeasible } = calculateMission({
            originBodyData,
            targetBodyData,
            departureTime_daysSinceJ2000: DEPARTURE_TIME,
            arrivalTime_daysSinceJ2000: ARRIVAL_TIME,
            spacecraft,
            mu: MU_SUN,
            sampleCount: 20,
        });

        expect(isFeasible).toBe(false);
        expect(Number.isFinite(solution.totalDeltaV_kmps)).toBe(true);
        expect(solution.propellantRemaining_kg).toBeLessThan(0);
    });

    it('accepts propulsion passed separately from the spacecraft definition', () => {
        const propulsion = createPropulsionDefinition({
            name: 'Ion Stage',
            type: 'ION',
            specificImpulse_s: 3000,
            thrust_N: 0.5,
        });
        const spacecraftWithoutPropulsion = createSpacecraftDefinition({
            name: 'Bus Only',
            dryMass_kg: 500,
            propellantMass_kg: 50,
        });

        const { solution, isFeasible } = calculateMission({
            originBodyData,
            targetBodyData,
            departureTime_daysSinceJ2000: DEPARTURE_TIME,
            arrivalTime_daysSinceJ2000: ARRIVAL_TIME,
            spacecraft: spacecraftWithoutPropulsion,
            propulsion,
            mu: MU_SUN,
            sampleCount: 20,
        });

        expect(isFeasible).toBe(true);
        expect(Number.isFinite(solution.totalDeltaV_kmps)).toBe(true);
    });

    it('rejects a non-positive time of flight before delegating to the solver', () => {
        const spacecraft = buildSpacecraft({ propellantMass_kg: 2000 });

        expect(() =>
            calculateMission({
                originBodyData,
                targetBodyData,
                departureTime_daysSinceJ2000: ARRIVAL_TIME,
                arrivalTime_daysSinceJ2000: DEPARTURE_TIME,
                spacecraft,
                mu: MU_SUN,
            })
        ).toThrow();
    });
});
