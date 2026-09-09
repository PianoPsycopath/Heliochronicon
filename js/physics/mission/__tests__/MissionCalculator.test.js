import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { calculateMission } from '../MissionCalculator.js';
import { LambertSolver } from '../LambertSolver.js';

vi.mock('../EphemerisBoundary.js', () => ({
    EphemerisBoundary: {
        getState: vi.fn((bodyData) => ({ bodyData })),
    },
}));

vi.mock('../OrbitalState.js', () => ({
    orbitalStateFromEphemeris: vi.fn((ephemeris, epoch_daysSinceJ2000, mu) => ({
        position: ephemeris.bodyData.position,
        velocity: ephemeris.bodyData.velocity,
        epoch_daysSinceJ2000,
        mu,
    })),
}));

vi.mock('../PropulsionEvaluator.js', () => ({
    evaluateTransferFeasibility: vi.fn((transfer, spacecraft) => ({
        solution: { transfer, spacecraft },
        isFeasible: true,
    })),
}));

import { evaluateTransferFeasibility } from '../PropulsionEvaluator.js';

const originBodyData = { name: 'EARTH', position: { x: 1, y: 0, z: 0 }, velocity: { x: 0, y: 0.0172, z: 0 } };
const targetBodyData = { name: 'MARS', position: { x: 0, y: 1.5, z: 0 }, velocity: { x: -0.014, y: 0, z: 0 } };
const spacecraft = { 
    dryMass_kg: 2000, 
    propellantMass_kg: 1500,
    propulsion: { 
        name: 'Test Thruster',
        type: 'CHEMICAL', 
        specificImpulse_s: 320, 
        thrust_N: 5000 
    }
};
const mu = 2.959122082855911e-4;

function baseArgs(overrides = {}) {
    return {
        originBodyData,
        targetBodyData,
        departureTime_daysSinceJ2000: 0,
        arrivalTime_daysSinceJ2000: 200,
        spacecraft,
        mu,
        resolveParent: () => null,
        ...overrides,
    };
}

describe('calculateMission solver boundary (Phase 9A)', () => {
    it('throws when no solver is supplied', () => {
        expect(() => calculateMission(baseArgs())).toThrow(/solver/i);
    });

    it('throws when the supplied solver does not implement the TrajectorySolver contract', () => {
        expect(() => calculateMission(baseArgs({ solver: {} }))).toThrow(/solver/i);
    });

    it('invokes an injected substitute solver instead of any concrete implementation', () => {
        const fakeTransfer = { totalDeltaVMagnitude: 1.2345, fake: true };
        const fakeSolver = { 
            solve: vi.fn(() => fakeTransfer),
            definition: { id: 'fake', name: 'Fake Solver' } 
        };

        const { transfer } = calculateMission(
            baseArgs({ solver: fakeSolver, route: 'LONG', sampleCount: 10 })
        );

        expect(fakeSolver.solve).toHaveBeenCalledTimes(1);
        const request = fakeSolver.solve.mock.calls[0][0];
        expect(request.route).toBe('LONG');
        expect(request.sampleCount).toBe(10);
        expect(request.departureState).toBeDefined();
        expect(request.arrivalState).toBeDefined();
        expect(transfer).toBe(fakeTransfer);
        expect(evaluateTransferFeasibility).toHaveBeenCalledWith(fakeTransfer, spacecraft);
    });

    it('produces an equivalent impulsive result when LambertSolver is injected as the default concrete implementation', () => {
        const { transfer, isFeasible } = calculateMission(baseArgs({ solver: LambertSolver }));

        expect(isFeasible).toBe(true);
        expect(transfer.solverMetadata.route).toBe('PROGRADE');
        expect(transfer.solverMetadata.converged).toBe(true);
        expect(Number.isFinite(transfer.totalDeltaVMagnitude)).toBe(true);
    });

    it('does not import LambertSolver directly from MissionCalculator', () => {
        const source = readFileSync(new URL('../MissionCalculator.js', import.meta.url), 'utf8');
        expect(source).not.toMatch(/import\s+.*LambertSolver.*from/);
    });
});