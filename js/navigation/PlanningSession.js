// js/navigation/PlanningSession.js

import { calculateImpulsiveTransfer } from '@navigation/TransferPlanner.js';

export const PLANNING_SESSION_STATE = Object.freeze({
    IDLE: 'idle',
    PLANNING: 'planning',
});

function requireTimeController(timeController) {
    if (
        !timeController ||
        typeof timeController.pauseForPlanning !== 'function' ||
        typeof timeController.resumeFromPlanning !== 'function'
    ) {
        throw new Error(
            'PlanningSession requires a "timeController" exposing pauseForPlanning() and resumeFromPlanning()'
        );
    }
}

export class PlanningSession {
    /**
     * @param {object} params
     * @param {{pauseForPlanning: Function, resumeFromPlanning: Function}} params.timeController
     * @param {Function} [params.calculateTransfer]
     */
    constructor({ timeController, calculateTransfer = calculateImpulsiveTransfer } = {}) {
        requireTimeController(timeController);

        this.timeController = timeController;
        this.calculateTransfer = calculateTransfer;

        this.state = PLANNING_SESSION_STATE.IDLE;
        this.plan = null;
        this.lastOutcome = null;

        this.onConfirm = null;
        this.onCancel = null;
    }

    get isActive() {
        return this.state === PLANNING_SESSION_STATE.PLANNING;
    }

    get activePlan() {
        return this.plan;
    }

    /**
     * @param {object} transferParams - forwarded verbatim to calculateTransfer
     * @returns {object} the calculated FlightPlan
     */
    start(transferParams) {
        if (this.state === PLANNING_SESSION_STATE.PLANNING) {
            throw new Error('PlanningSession.start() called while a session is already active');
        }

        this.timeController.pauseForPlanning();

        let plan;
        try {
            plan = this.calculateTransfer(transferParams);
        } catch (err) {
            this.timeController.resumeFromPlanning();
            throw err;
        }

        this.plan = plan;
        this.lastOutcome = null;
        this.state = PLANNING_SESSION_STATE.PLANNING;

        return plan;
    }

    /**
     * @returns {object} the confirmed FlightPlan
     */
    confirm() {
        this._assertActive('confirm');

        const plan = this.plan;

        this.timeController.resumeFromPlanning();
        this._resetToIdle('confirmed');

        if (this.onConfirm) this.onConfirm(plan);

        return plan;
    }

    cancel() {
        this._assertActive('cancel');

        this.timeController.resumeFromPlanning();
        this._resetToIdle('cancelled');

        if (this.onCancel) this.onCancel();
    }

    _assertActive(action) {
        if (this.state !== PLANNING_SESSION_STATE.PLANNING) {
            throw new Error(`PlanningSession.${action}() called with no active planning session`);
        }
    }

    _resetToIdle(outcome) {
        this.state = PLANNING_SESSION_STATE.IDLE;
        this.plan = null;
        this.lastOutcome = outcome;
    }
}