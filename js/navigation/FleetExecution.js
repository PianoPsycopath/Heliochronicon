// js/navigation/FleetExecution.js

import { FLEET_STATE, REFERENCE_FRAME } from '@navigation/DefaultFleetState.js';

function isVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function requireRuntimeState(runtimeState, caller) {
    if (!runtimeState || typeof runtimeState !== 'object') {
        throw new Error(`FleetExecution.${caller}() requires a fleet runtime state object`);
    }
}

function requirePlan(plan, caller) {
    if (!plan || typeof plan !== 'object') {
        throw new Error(`FleetExecution.${caller}() requires a FlightPlan`);
    }
}

/**
 * @param {object} params
 * @param {object} params.runtimeState - current fleet runtime state
 * @param {object} params.plan - confirmed FlightPlan
 * @returns {object} a new runtime state; the input is not mutated
 */
export function beginFlight({ runtimeState, plan }) {
    requireRuntimeState(runtimeState, 'beginFlight');
    requirePlan(plan, 'beginFlight');

    if (!Number.isFinite(plan.arrivalEpochDaysJ2000)) {
        throw new Error('FleetExecution.beginFlight() requires a numeric plan.arrivalEpochDaysJ2000');
    }

    const fuelRemaining = Number.isFinite(plan.fuelRemainingAfter)
        ? Math.max(0, plan.fuelRemainingAfter)
        : runtimeState.fuelRemaining;

    return {
        ...runtimeState,
        fuelRemaining,
        target: plan.target ?? runtimeState.target ?? null,
        state: FLEET_STATE.INFLIGHT,
    };
}

/**
 * @param {object} params
 * @param {object} params.plan - active FlightPlan
 * @param {number} params.currentEpochDaysJ2000
 * @returns {boolean} true once the simulation clock is at or past arrival
 */
export function hasReachedArrival({ plan, currentEpochDaysJ2000 }) {
    if (!plan || !Number.isFinite(plan.arrivalEpochDaysJ2000)) return false;
    if (!Number.isFinite(currentEpochDaysJ2000)) return false;
    return currentEpochDaysJ2000 >= plan.arrivalEpochDaysJ2000;
}

/**
 * @param {object} params
 * @param {object} params.runtimeState
 * @param {object} params.plan - confirmed FlightPlan carrying arrivalPosition/arrivalVelocity
 * @returns {object} a new runtime state; the input is not mutated
 */
export function completeFlight({ runtimeState, plan }) {
    requireRuntimeState(runtimeState, 'completeFlight');
    requirePlan(plan, 'completeFlight');

    if (
        plan.capture &&
        isVector3(plan.capture.positionKm) &&
        isVector3(plan.capture.velocityKm)
    ) {
        if (!plan.capture.parentBody) {
            throw new Error(
                'FleetExecution.completeFlight() requires "capture.parentBody" on a plan carrying ' +
                    'a capture state'
            );
        }

        return {
            ...runtimeState,
            position: { ...plan.capture.positionKm },
            velocity: { ...plan.capture.velocityKm },
            frame: REFERENCE_FRAME.BODY_CENTERED_KM,
            parentBody: plan.capture.parentBody,
            target: plan.target ?? runtimeState.target ?? null,
            state: FLEET_STATE.PARKED,
        };
    }

    if (!isVector3(plan.arrivalPosition) || !isVector3(plan.arrivalVelocity)) {
        throw new Error(
            'FleetExecution.completeFlight() requires "arrivalPosition"/"arrivalVelocity" on the ' +
                'plan: the plan is the only permitted source of the arrival state'
        );
    }

    return {
        ...runtimeState,
        position: { ...plan.arrivalPosition },
        velocity: { ...plan.arrivalVelocity },
        frame: REFERENCE_FRAME.HELIOCENTRIC_AU,
        parentBody: null,
        target: plan.target ?? runtimeState.target ?? null,
        state: FLEET_STATE.PARKED,
    };
}

/**
 * @param {object} params
 * @param {object} params.runtimeState
 * @param {boolean} [params.retainTarget]
 * @returns {object} a new runtime state; the input is not mutated
 */
export function releasePlan({ runtimeState, retainTarget = true }) {
    requireRuntimeState(runtimeState, 'releasePlan');

    return {
        ...runtimeState,
        target: retainTarget ? (runtimeState.target ?? null) : null,
        state: FLEET_STATE.PARKED,
    };
}