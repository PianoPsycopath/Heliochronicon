import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateMission } from '@physics/mission/MissionCalculator.js';
import { searchTransferField } from '@physics/mission/TransferSearch.js';
import { PhysicsEngine } from '@physics/PhysicsEngine.js';
import { CELL_STATUS } from '@physics/mission/TransferField.js';
import { MissionController } from '../MissionController.js';

vi.mock('@physics/mission/MissionCalculator.js', () => ({
    calculateMission: vi.fn(),
}));

vi.mock('@physics/mission/TransferSearch.js', () => ({
    searchTransferField: vi.fn(),
}));

vi.mock('@physics/PhysicsEngine.js', () => ({
    PhysicsEngine: {
        getJ2000Days: vi.fn(() => 4242),
    },
}));

const EARTH = { data: { name: 'EARTH' } };
const MARS = { data: { name: 'MARS' } };

function makeCandidate(overrides = {}) {
    return {
        departureIndex: 1,
        arrivalIndex: 2,
        departureTime_daysSinceJ2000: 4300,
        arrivalTime_daysSinceJ2000: 4500,
        status: CELL_STATUS.VALID,
        ...overrides,
    };
}

function makeHarness({ originBodyName = 'EARTH', targetName = 'MARS' } = {}) {
    const bodies = { EARTH, MARS };
    const appState = {
        currentTargetData: targetName ? { name: targetName } : null,
        systemDate: new Date('2026-01-01T00:00:00Z'),
    };
    const bodyRegistry = {
        getByName: vi.fn((name) => bodies[name] ?? null),
    };
    const missionPanel = {
        onCalculateRequested: null,
        showMissionResult: vi.fn(),
        clearMissionResult: vi.fn(),
    };
    const transferRenderer = {
        setSolution: vi.fn(),
    };
    const porkchopPanel = {
        onCandidateSelected: null,
        open: vi.fn(),
    };
    const solver = { definition: { id: 'fake-solver' }, solve: vi.fn() };
    const controller = new MissionController({
        appState,
        bodyRegistry,
        missionPanel,
        transferRenderer,
        porkchopPanel,
        originBodyName,
        solver,
    });
    return { controller, appState, bodyRegistry, missionPanel, transferRenderer, porkchopPanel, solver };
}

describe('MissionController selected-candidate lifecycle (Phase 9C)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        PhysicsEngine.getJ2000Days.mockReturnValue(4242);
        searchTransferField.mockReturnValue({ field: { id: 'field-1' }, minima: { deltaV: null } });
        calculateMission.mockReturnValue({
            snapshot: { id: 'snap-1' },
            solution: { id: 'sol-1' },
            isFeasible: true,
        });
    });

    it('calculate() runs a search and never produces a MissionSolution', () => {
        const { missionPanel, porkchopPanel, transferRenderer } = makeHarness();

        missionPanel.onCalculateRequested();

        expect(searchTransferField).toHaveBeenCalledTimes(1);
        expect(calculateMission).not.toHaveBeenCalled();
        expect(transferRenderer.setSolution).not.toHaveBeenCalled();
        expect(missionPanel.showMissionResult).not.toHaveBeenCalled();
        expect(porkchopPanel.open).toHaveBeenCalledTimes(1);
        expect(porkchopPanel.open.mock.calls[0][0]).toEqual({ id: 'field-1' });
    });

    it('selectCandidate() performs exactly one calculateMission per selection', () => {
        const { controller, solver } = makeHarness();
        const first = makeCandidate();
        const second = makeCandidate({
            departureIndex: 0,
            arrivalIndex: 0,
            departureTime_daysSinceJ2000: 4242,
            arrivalTime_daysSinceJ2000: 4400,
        });

        controller.selectCandidate(first);
        controller.selectCandidate(second);

        expect(calculateMission).toHaveBeenCalledTimes(2);
        expect(calculateMission.mock.calls[0][0].departureTime_daysSinceJ2000).toBe(4300);
        expect(calculateMission.mock.calls[0][0].arrivalTime_daysSinceJ2000).toBe(4500);
        expect(calculateMission.mock.calls[1][0].departureTime_daysSinceJ2000).toBe(4242);
        expect(calculateMission.mock.calls[1][0].solver).toBe(solver);
        expect(searchTransferField).not.toHaveBeenCalled();
    });

    it('panel click is the only path from candidate to solution', () => {
        const { porkchopPanel, missionPanel, transferRenderer, controller } = makeHarness();
        const candidate = makeCandidate();

        porkchopPanel.onCandidateSelected(candidate);

        expect(calculateMission).toHaveBeenCalledTimes(1);
        expect(searchTransferField).not.toHaveBeenCalled();
        expect(controller.currentMissionSnapshot).toEqual({ id: 'snap-1' });
        expect(missionPanel.showMissionResult).toHaveBeenCalledTimes(1);
        expect(transferRenderer.setSolution).toHaveBeenCalledTimes(1);
        expect(missionPanel.showMissionResult.mock.calls[0][0]).toBe(
            transferRenderer.setSolution.mock.calls[0][0]
        );
        expect(missionPanel.showMissionResult.mock.calls[0][0]).toEqual({ id: 'sol-1' });
        expect(missionPanel.showMissionResult.mock.calls[0][1]).toEqual({ isFeasible: true });
    });

    it('records the snapshot returned by the same calculateMission call', () => {
        const { controller } = makeHarness();
        const snapshot = { id: 'snap-recorded' };
        const solution = { id: 'sol-recorded' };
        calculateMission.mockReturnValue({ snapshot, solution, isFeasible: false });

        controller.selectCandidate(makeCandidate({ status: CELL_STATUS.INFEASIBLE }));

        expect(controller.currentMissionSnapshot).toBe(snapshot);
        expect(calculateMission).toHaveBeenCalledTimes(1);
    });

    it('does not solve an UNSOLVABLE candidate', () => {
        const { controller, missionPanel, transferRenderer } = makeHarness();

        controller.selectCandidate(makeCandidate({ status: CELL_STATUS.UNSOLVABLE }));

        expect(calculateMission).not.toHaveBeenCalled();
        expect(missionPanel.showMissionResult).not.toHaveBeenCalled();
        expect(transferRenderer.setSolution).not.toHaveBeenCalled();
        expect(controller.currentMissionSnapshot).toBeNull();
    });

    it('still solves an INFEASIBLE candidate as an exact transfer', () => {
        const { controller } = makeHarness();
        calculateMission.mockReturnValue({
            snapshot: { id: 'snap-infeasible' },
            solution: { id: 'sol-infeasible' },
            isFeasible: false,
        });

        controller.selectCandidate(makeCandidate({ status: CELL_STATUS.INFEASIBLE }));

        expect(calculateMission).toHaveBeenCalledTimes(1);
        expect(controller.currentMissionSnapshot).toEqual({ id: 'snap-infeasible' });
    });

    it('passes Chronometer time at selection into the snapshot request', () => {
        const { controller, appState } = makeHarness();

        controller.selectCandidate(makeCandidate());

        expect(PhysicsEngine.getJ2000Days).toHaveBeenCalledWith(appState.systemDate);
        expect(calculateMission.mock.calls[0][0].calculationTime_daysSinceJ2000).toBe(4242);
        expect(calculateMission.mock.calls[0][0].targetConfiguration).toEqual({
            originBodyName: 'EARTH',
            targetBodyName: 'MARS',
        });
    });

    it('forwards the search configuration from the last calculate() into the exact solve', () => {
        const { controller } = makeHarness();

        controller.calculate();
        controller.selectCandidate(makeCandidate());

        expect(calculateMission.mock.calls[0][0].searchConfiguration).toEqual({
            departureStep_days: 5,
            arrivalStep_days: 5,
        });
    });
});
