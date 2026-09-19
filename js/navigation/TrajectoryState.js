// js/navigation/TrajectoryState.js

import { AU_IN_KM } from '@core/constants.js';
import { AU_PER_DAY_IN_KM_PER_S } from '@navigation/FleetPropagator.js';
import { REFERENCE_FRAME } from '@navigation/DefaultFleetState.js';

export const TRAJECTORY_FRAME = Object.freeze({
    HELIOCENTRIC: 'heliocentric',
    BODY_CENTERED: 'body-centered',
});

export const TRAJECTORY_LENGTH_UNIT = Object.freeze({
    KM: 'km',
    AU: 'au',
});

export const TRAJECTORY_VELOCITY_UNIT = 'km/s';

/** @typedef {ReturnType<typeof createTrajectoryState>} TrajectoryState */

const LENGTH_UNIT_BY_FRAME = Object.freeze({
    [TRAJECTORY_FRAME.HELIOCENTRIC]: TRAJECTORY_LENGTH_UNIT.AU,
    [TRAJECTORY_FRAME.BODY_CENTERED]: TRAJECTORY_LENGTH_UNIT.KM,
});

const EPOCH_MATCH_TOLERANCE_DAYS = 1e-9;
const LEGACY_EARTH_CENTERED_PARENT_BODY = 'EARTH';

function isFiniteVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function requireFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`TrajectoryState requires a finite numeric "${label}"`);
    }
}

function requireFiniteVector3(v, label) {
    if (!isFiniteVector3(v)) {
        throw new Error(`TrajectoryState requires "${label}" to be a finite { x, y, z } vector`);
    }
}

function isValidFrame(frame) {
    return frame === TRAJECTORY_FRAME.HELIOCENTRIC || frame === TRAJECTORY_FRAME.BODY_CENTERED;
}

function isNonEmptyString(value) {
    return typeof value === 'string' && value.trim().length > 0;
}

function frozenVector(v) {
    return Object.freeze({ x: v.x, y: v.y, z: v.z });
}

function scaleVector(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

/**
 * @param {object} params
 * @param {number} params.epochDaysJ2000 - the epoch this state is true at
 * @param {{x:number,y:number,z:number}} params.position - km when
 *   BODY_CENTERED, AU when HELIOCENTRIC
 * @param {{x:number,y:number,z:number}} params.velocity - km/s in both frames
 *   (relative to the parent body when BODY_CENTERED)
 * @param {'heliocentric'|'body-centered'} params.frame - see TRAJECTORY_FRAME
 * @param {string|null} [params.parentBody] - required (non-empty) when
 *   BODY_CENTERED; must be omitted/null when HELIOCENTRIC
 * @returns {Readonly<{
 *   epochDaysJ2000: number,
 *   position: Readonly<{x:number,y:number,z:number}>,
 *   velocity: Readonly<{x:number,y:number,z:number}>,
 *   frame: string,
 *   parentBody: string|null,
 *   lengthUnit: 'km'|'au',
 *   velocityUnit: 'km/s'
 * }>}
 */
export function createTrajectoryState({
    epochDaysJ2000,
    position,
    velocity,
    frame,
    parentBody = null,
} = {}) {
    if (!isValidFrame(frame)) {
        throw new Error(
            `TrajectoryState requires "frame" to be one of ${Object.values(TRAJECTORY_FRAME).join(', ')}, ` +
                `got ${JSON.stringify(frame)}`
        );
    }
    requireFiniteNumber(epochDaysJ2000, 'epochDaysJ2000');
    requireFiniteVector3(position, 'position');
    requireFiniteVector3(velocity, 'velocity');

    if (frame === TRAJECTORY_FRAME.BODY_CENTERED) {
        if (!isNonEmptyString(parentBody)) {
            throw new Error('TrajectoryState requires a non-empty "parentBody" when the frame is body-centered');
        }
    } else if (parentBody !== null) {
        throw new Error('TrajectoryState must not carry a "parentBody" when the frame is heliocentric');
    }

    return Object.freeze({
        epochDaysJ2000,
        position: frozenVector(position),
        velocity: frozenVector(velocity),
        frame,
        parentBody: frame === TRAJECTORY_FRAME.BODY_CENTERED ? parentBody : null,
        lengthUnit: LENGTH_UNIT_BY_FRAME[frame],
        velocityUnit: TRAJECTORY_VELOCITY_UNIT,
    });
}

/**
 * @param {*} value
 * @returns {boolean}
 */
export function isTrajectoryState(value) {
    if (!value || typeof value !== 'object') return false;
    if (!isValidFrame(value.frame)) return false;
    if (!Number.isFinite(value.epochDaysJ2000)) return false;
    if (!isFiniteVector3(value.position) || !isFiniteVector3(value.velocity)) return false;
    if (value.lengthUnit !== LENGTH_UNIT_BY_FRAME[value.frame]) return false;
    if (value.velocityUnit !== TRAJECTORY_VELOCITY_UNIT) return false;

    return value.frame === TRAJECTORY_FRAME.BODY_CENTERED
        ? isNonEmptyString(value.parentBody)
        : value.parentBody === null;
}

function requireFrame(state, frame, label) {
    if (!isTrajectoryState(state) || state.frame !== frame) {
        throw new Error(`TrajectoryState conversion requires "${label}" to be a ${frame} TrajectoryState`);
    }
}

function requireMatchingEpochs(state, parentState) {
    if (Math.abs(state.epochDaysJ2000 - parentState.epochDaysJ2000) > EPOCH_MATCH_TOLERANCE_DAYS) {
        throw new Error(
            'TrajectoryState frame conversion requires both states at the same epoch ' +
                `(state ${state.epochDaysJ2000}, parent ${parentState.epochDaysJ2000}); ` +
                'propagate one of them first'
        );
    }
}

/**
 * @param {object} params
 * @param {number} params.epochDaysJ2000
 * @param {{x:number,y:number,z:number}} params.position - AU
 * @param {{x:number,y:number,z:number}} params.velocity - AU/day
 * @returns {ReturnType<typeof createTrajectoryState>}
 */
export function heliocentricStateFromAuPerDay({ epochDaysJ2000, position, velocity } = {}) {
    requireFiniteVector3(velocity, 'velocity');

    return createTrajectoryState({
        epochDaysJ2000,
        position,
        velocity: scaleVector(velocity, AU_PER_DAY_IN_KM_PER_S),
        frame: TRAJECTORY_FRAME.HELIOCENTRIC,
    });
}

/**
 * @param {ReturnType<typeof createTrajectoryState>} state - heliocentric only
 * @returns {{position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}}}
 */
export function heliocentricStateToAuPerDay(state) {
    requireFrame(state, TRAJECTORY_FRAME.HELIOCENTRIC, 'state');

    return {
        position: { x: state.position.x, y: state.position.y, z: state.position.z },
        velocity: scaleVector(state.velocity, 1 / AU_PER_DAY_IN_KM_PER_S),
    };
}

/**
 * @param {ReturnType<typeof createTrajectoryState>} state - BODY_CENTERED
 * @param {ReturnType<typeof createTrajectoryState>} parentState - the parent
 *   body's HELIOCENTRIC state at the same epoch
 * @returns {ReturnType<typeof createTrajectoryState>} HELIOCENTRIC
 */
export function bodyCenteredToHeliocentric(state, parentState) {
    requireFrame(state, TRAJECTORY_FRAME.BODY_CENTERED, 'state');
    requireFrame(parentState, TRAJECTORY_FRAME.HELIOCENTRIC, 'parentState');
    requireMatchingEpochs(state, parentState);

    return createTrajectoryState({
        epochDaysJ2000: state.epochDaysJ2000,
        position: {
            x: parentState.position.x + state.position.x / AU_IN_KM,
            y: parentState.position.y + state.position.y / AU_IN_KM,
            z: parentState.position.z + state.position.z / AU_IN_KM,
        },
        velocity: {
            x: parentState.velocity.x + state.velocity.x,
            y: parentState.velocity.y + state.velocity.y,
            z: parentState.velocity.z + state.velocity.z,
        },
        frame: TRAJECTORY_FRAME.HELIOCENTRIC,
    });
}

/**
 * @param {ReturnType<typeof createTrajectoryState>} state - HELIOCENTRIC
 * @param {ReturnType<typeof createTrajectoryState>} parentState - the parent
 *   body's HELIOCENTRIC state at the same epoch
 * @param {string} parentBody - name of that body (a heliocentric state does
 *   not carry one)
 * @returns {ReturnType<typeof createTrajectoryState>} BODY_CENTERED
 */
export function heliocentricToBodyCentered(state, parentState, parentBody) {
    requireFrame(state, TRAJECTORY_FRAME.HELIOCENTRIC, 'state');
    requireFrame(parentState, TRAJECTORY_FRAME.HELIOCENTRIC, 'parentState');
    requireMatchingEpochs(state, parentState);

    return createTrajectoryState({
        epochDaysJ2000: state.epochDaysJ2000,
        position: {
            x: (state.position.x - parentState.position.x) * AU_IN_KM,
            y: (state.position.y - parentState.position.y) * AU_IN_KM,
            z: (state.position.z - parentState.position.z) * AU_IN_KM,
        },
        velocity: {
            x: state.velocity.x - parentState.velocity.x,
            y: state.velocity.y - parentState.velocity.y,
            z: state.velocity.z - parentState.velocity.z,
        },
        frame: TRAJECTORY_FRAME.BODY_CENTERED,
        parentBody,
    });
}

// --- fleet runtime-state boundary ------------------------------------------

/**
 *   EARTH_CENTERED_KM  -> BODY_CENTERED, parent "EARTH"   (legacy)
 *   (no frame at all)  -> same as EARTH_CENTERED_KM       (legacy)
 *   BODY_CENTERED_KM   -> BODY_CENTERED, parent = runtimeState.parentBody
 *   HELIOCENTRIC_AU    -> HELIOCENTRIC (AU/day velocity converted to km/s)
 *
 * @param {object} runtimeState
 * @param {object} [options]
 * @param {number} [options.fallbackEpochDaysJ2000] - used when the runtime
 *   state has no epoch stamped yet
 * @returns {ReturnType<typeof createTrajectoryState>}
 */
export function trajectoryStateFromRuntimeState(runtimeState, { fallbackEpochDaysJ2000 } = {}) {
    if (!runtimeState || typeof runtimeState !== 'object') {
        throw new Error('trajectoryStateFromRuntimeState requires a runtime state object');
    }

    const epochDaysJ2000 = Number.isFinite(runtimeState.epochDaysJ2000)
        ? runtimeState.epochDaysJ2000
        : fallbackEpochDaysJ2000;
    const { position, velocity, frame } = runtimeState;

    if (frame === REFERENCE_FRAME.HELIOCENTRIC_AU) {
        return heliocentricStateFromAuPerDay({ epochDaysJ2000, position, velocity });
    }

    let parentBody;
    if (frame === REFERENCE_FRAME.BODY_CENTERED_KM) {
        parentBody = runtimeState.parentBody;
    } else if (frame === REFERENCE_FRAME.EARTH_CENTERED_KM || frame === undefined || frame === null) {
        parentBody = LEGACY_EARTH_CENTERED_PARENT_BODY;
    } else {
        throw new Error(
            `trajectoryStateFromRuntimeState does not recognise runtime frame ${JSON.stringify(frame)}`
        );
    }

    return createTrajectoryState({
        epochDaysJ2000,
        position,
        velocity,
        frame: TRAJECTORY_FRAME.BODY_CENTERED,
        parentBody,
    });
}

/**
 * @param {object} params
 * @param {object|null} params.runtimeState - persisted fleet runtime state
 * @param {{position:object, velocity:object}|null} [params.parkingState] -
 *   the parking orbit already propagated to `epochDaysJ2000` (km, km/s,
 *   parent-relative); only used when the runtime state is not heliocentric
 * @param {{position:object, velocity:object}|null} [params.parentEphemerisState]
 *   - the parent body at `epochDaysJ2000` in EphemerisAdapter units
 *   (AU, AU/day); only used when the runtime state is not heliocentric
 * @param {number} params.epochDaysJ2000 - the epoch the origin is wanted at
 * @returns {ReturnType<typeof createTrajectoryState>|null} null when the
 *   runtime state cannot supply an origin (caller falls back to the ephemeris)
 */
export function resolveHeliocentricOrigin({
    runtimeState,
    parkingState = null,
    parentEphemerisState = null,
    epochDaysJ2000,
}) {
    if (!runtimeState) return null;

    if (runtimeState.frame === REFERENCE_FRAME.HELIOCENTRIC_AU) {
        if (!isFiniteVector3(runtimeState.position) || !isFiniteVector3(runtimeState.velocity)) {
            return null;
        }
        return trajectoryStateFromRuntimeState(runtimeState, {
            fallbackEpochDaysJ2000: epochDaysJ2000,
        });
    }

    if (!parkingState || !parentEphemerisState) return null;

    const bodyCentered = trajectoryStateFromRuntimeState(
        {
            ...runtimeState,
            position: parkingState.position,
            velocity: parkingState.velocity,
            epochDaysJ2000,
        },
        {}
    );

    const parentState = heliocentricStateFromAuPerDay({
        epochDaysJ2000,
        position: parentEphemerisState.position,
        velocity: parentEphemerisState.velocity,
    });

    return bodyCenteredToHeliocentric(bodyCentered, parentState);
}