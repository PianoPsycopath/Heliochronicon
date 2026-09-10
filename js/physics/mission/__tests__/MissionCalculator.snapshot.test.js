import { describe, it, expect, vi } from 'vitest';
import { calculateMission } from '../MissionCalculator.js';

const DEPARTURE_STATE = {
    position: { x: 1, y: 0, z: 0 },
    velocity: { x: 0, y: 1, z: 0 },
    epoch_daysSinceJ2000: 1000,
    mu: 1,
};

const ARRIVAL_STATE = {
    position: { x: 0, y: 1.5, z: 0 },
    velocity: { x: -1, y: 0, z: 0 },
    epoch_daysSinceJ2000: 1200,
    mu: 1,
};

vi.mock('../EphemerisBoundary.js', () => ({
    EphemerisBoundary: {
        getState: vi.fn(() => ({ mocked: true })),
    },
}));

vi.mock('../OrbitalState.js', () => ({
    orbitalStateFromEphemeris: vi.fn((ephemeris, time) =>
        time === 1000 ? DEPARTURE_STATE : ARRIVAL_STATE
    ),
}));

vi.mock('../PropulsionEvaluator.js', () => ({
    evaluateTransferFeasibility: vi.fn((transfer, spacecraft) => ({
        solution: { transfer, spacecraft, frozenViaEvaluator: true },
        isFeasible: true,
    })),
}));

function makeSolver(definition = { id: 'fake-solver', family: 'IMPULSIVE' }) {
    const solve = vi.fn((request) => ({ request, burns: [] }));
    return { definition, solve };
}

function makeSpacecraft() {
    return {
        name: 'Test Spacecraft',
        dryMass_kg: 100,
        propellantMass_kg: 50,
        propulsion: { name: 'Test Propulsion', type: 'CHEMICAL', specificImpulse_s: 300, thrust_N: 10 },
    };
}

const BASE_ARGS = {
    originBodyData: { name: 'EARTH' },
    targetBodyData: { name: 'MARS' },
    departureTime_daysSinceJ2000: 1000,
    arrivalTime_daysSinceJ2000: 1200,
    mu: 1,
    resolveParent: () => null,
};

describe('calculateMission — Phase 9C MissionSnapshot', () => {
    it('builds a MissionSnapshot from the same states handed to the solver', () => {
        const solver = makeSolver();
        const spacecraft = makeSpacecraft();

        const { snapshot, solution, isFeasible, transfer } = calculateMission({
            ...BASE_ARGS,
            spacecraft,
            solver,
            calculationTime_daysSinceJ2000: 950,
        });

        expect(snapshot.calculationTime_daysSinceJ2000).toBe(950);
        expect(snapshot.originState).toBe(DEPARTURE_STATE);
        expect(snapshot.targetState).toBe(ARRIVAL_STATE);
        expect(snapshot.spacecraft).toEqual(spacecraft);
        expect(snapshot.propulsion).toEqual(spacecraft.propulsion);
        expect(snapshot.solver).toBe(solver.definition);

        expect(solver.solve).toHaveBeenCalledTimes(1);
        const solveRequest = solver.solve.mock.calls[0][0];
        expect(solveRequest.departureState).toBe(snapshot.originState);
        expect(solveRequest.arrivalState).toBe(snapshot.targetState);

        expect(transfer).toEqual(solver.solve.mock.results[0].value);
        expect(isFeasible).toBe(true);
        expect(solution.transfer).toBe(transfer);
    });

    it('falls back to departureTime as calculationTime when not provided', () => {
        const { snapshot } = calculateMission({
            ...BASE_ARGS,
            spacecraft: makeSpacecraft(),
            solver: makeSolver(),
        });

        expect(snapshot.calculationTime_daysSinceJ2000).toBe(BASE_ARGS.departureTime_daysSinceJ2000);
    });

    it('records a propulsion override on the snapshot exactly as it is fed to the solver path', () => {
        const overridePropulsion = { name: 'Override Stage', type: 'ELECTRIC', specificImpulse_s: 2000, thrust_N: 1 };

        const { snapshot } = calculateMission({
            ...BASE_ARGS,
            spacecraft: makeSpacecraft(),
            propulsion: overridePropulsion,
            solver: makeSolver(),
            calculationTime_daysSinceJ2000: 1000,
        });

        expect(snapshot.propulsion).toEqual(overridePropulsion);
        expect(snapshot.spacecraft.propulsion).toEqual(overridePropulsion);
    });

    it('rejects a solver missing the definition field required by the TrajectorySolver contract', () => {
        const brokenSolver = { solve: vi.fn() };

        expect(() =>
            calculateMission({
                ...BASE_ARGS,
                spacecraft: makeSpacecraft(),
                solver: brokenSolver,
            })
        ).toThrow(/solver\.definition/);
    });

    it('is the only path from inputs to a solve: calling it twice performs exactly two solves, never zero or a cached reuse', () => {
        const solver = makeSolver();
        calculateMission({ ...BASE_ARGS, spacecraft: makeSpacecraft(), solver });
        calculateMission({ ...BASE_ARGS, spacecraft: makeSpacecraft(), solver });
        expect(solver.solve).toHaveBeenCalledTimes(2);
    });
});
