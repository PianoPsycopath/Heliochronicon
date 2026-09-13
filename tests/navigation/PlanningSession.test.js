// tests/navigation/PlanningSession.test.js
import { describe, it, expect, vi } from 'vitest';
import { PlanningSession, PLANNING_SESSION_STATE } from '@navigation/PlanningSession.js';

function makeTimeController() {
    return {
        pauseForPlanning: vi.fn(),
        resumeFromPlanning: vi.fn(),
    };
}

const fakePlan = { fleetId: 'user-fleet', isFeasible: true, tof: 180 };

describe('PlanningSession', () => {
    it('throws without a timeController exposing pauseForPlanning/resumeFromPlanning', () => {
        expect(() => new PlanningSession({})).toThrow();
        expect(() => new PlanningSession({ timeController: {} })).toThrow();
        expect(() => new PlanningSession({ timeController: { pauseForPlanning: () => {} } })).toThrow();
    });

    it('starts idle', () => {
        const session = new PlanningSession({
            timeController: makeTimeController(),
            calculateTransfer: () => fakePlan,
        });
        expect(session.state).toBe(PLANNING_SESSION_STATE.IDLE);
        expect(session.isActive).toBe(false);
        expect(session.activePlan).toBeNull();
    });

    it('start() pauses time and calculates exactly one plan', () => {
        const timeController = makeTimeController();
        const calculateTransfer = vi.fn(() => fakePlan);
        const session = new PlanningSession({ timeController, calculateTransfer });

        const plan = session.start({ fleet: {}, target: {}, mode: 'time' });

        expect(timeController.pauseForPlanning).toHaveBeenCalledTimes(1);
        expect(calculateTransfer).toHaveBeenCalledTimes(1);
        expect(calculateTransfer).toHaveBeenCalledWith({ fleet: {}, target: {}, mode: 'time' });
        expect(plan).toBe(fakePlan);
        expect(session.activePlan).toBe(fakePlan);
        expect(session.isActive).toBe(true);
        expect(timeController.resumeFromPlanning).not.toHaveBeenCalled();
    });

    it('confirm() resumes time, returns the held plan, and fires onConfirm', () => {
        const timeController = makeTimeController();
        const session = new PlanningSession({ timeController, calculateTransfer: () => fakePlan });
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        session.onConfirm = onConfirm;
        session.onCancel = onCancel;

        session.start({});
        const confirmed = session.confirm();

        expect(timeController.resumeFromPlanning).toHaveBeenCalledTimes(1);
        expect(confirmed).toBe(fakePlan);
        expect(onConfirm).toHaveBeenCalledWith(fakePlan);
        expect(onCancel).not.toHaveBeenCalled();
        expect(session.activePlan).toBeNull();
        expect(session.isActive).toBe(false);
        expect(session.state).toBe(PLANNING_SESSION_STATE.IDLE);
        expect(session.lastOutcome).toBe('confirmed');
    });

    it('cancel() resumes time and discards the held plan without adopting it', () => {
        const timeController = makeTimeController();
        const session = new PlanningSession({ timeController, calculateTransfer: () => fakePlan });
        const onConfirm = vi.fn();
        const onCancel = vi.fn();
        session.onConfirm = onConfirm;
        session.onCancel = onCancel;

        session.start({});
        session.cancel();

        expect(timeController.resumeFromPlanning).toHaveBeenCalledTimes(1);
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onConfirm).not.toHaveBeenCalled();
        expect(session.activePlan).toBeNull();
        expect(session.state).toBe(PLANNING_SESSION_STATE.IDLE);
        expect(session.lastOutcome).toBe('cancelled');
    });

    it('throws if confirm() or cancel() is called with no active session', () => {
        const session = new PlanningSession({
            timeController: makeTimeController(),
            calculateTransfer: () => fakePlan,
        });

        expect(() => session.confirm()).toThrow();
        expect(() => session.cancel()).toThrow();
    });

    it('throws if start() is called while a session is already active', () => {
        const session = new PlanningSession({
            timeController: makeTimeController(),
            calculateTransfer: () => fakePlan,
        });

        session.start({});
        expect(() => session.start({})).toThrow();
    });

    it('allows starting a new session after confirm()', () => {
        const timeController = makeTimeController();
        const calculateTransfer = vi.fn(() => fakePlan);
        const session = new PlanningSession({ timeController, calculateTransfer });

        session.start({});
        session.confirm();
        session.start({});

        expect(calculateTransfer).toHaveBeenCalledTimes(2);
        expect(timeController.pauseForPlanning).toHaveBeenCalledTimes(2);
        expect(session.isActive).toBe(true);
    });

    it('allows starting a new session after cancel()', () => {
        const timeController = makeTimeController();
        const calculateTransfer = vi.fn(() => fakePlan);
        const session = new PlanningSession({ timeController, calculateTransfer });

        session.start({});
        session.cancel();
        session.start({});

        expect(calculateTransfer).toHaveBeenCalledTimes(2);
        expect(session.isActive).toBe(true);
    });

    it('resumes time and rethrows if calculation fails, leaving no active session', () => {
        const timeController = makeTimeController();
        const err = new Error('no candidates');
        const calculateTransfer = vi.fn(() => {
            throw err;
        });
        const session = new PlanningSession({ timeController, calculateTransfer });

        expect(() => session.start({})).toThrow(err);
        expect(timeController.pauseForPlanning).toHaveBeenCalledTimes(1);
        expect(timeController.resumeFromPlanning).toHaveBeenCalledTimes(1);
        expect(session.state).toBe(PLANNING_SESSION_STATE.IDLE);
        expect(session.activePlan).toBeNull();
    });

    it('never calls calculateTransfer more than once per start() (no continuous recalculation)', () => {
        const timeController = makeTimeController();
        const calculateTransfer = vi.fn(() => fakePlan);
        const session = new PlanningSession({ timeController, calculateTransfer });

        session.start({});
        // Reading the held plan repeatedly must not trigger recalculation.
        session.activePlan;
        session.activePlan;
        session.confirm();

        expect(calculateTransfer).toHaveBeenCalledTimes(1);
    });

    it('defaults calculateTransfer to calculateImpulsiveTransfer when not overridden', () => {
        const session = new PlanningSession({ timeController: makeTimeController() });
        expect(typeof session.calculateTransfer).toBe('function');
    });
});