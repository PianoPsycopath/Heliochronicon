// js/navigation/TransferAssembler.js

import { LambertSolver } from '@navigation/LambertSolver.js';
import { EphemerisAdapter } from '@navigation/EphemerisAdapter.js';

function isVector3(v) {
    return !!v && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number';
}

function requireFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`TransferAssembler requires a numeric "${label}"`);
    }
}

function requirePositiveNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new Error(`TransferAssembler requires a positive numeric "${label}"`);
    }
}

export class TransferAssembler {
    /**
     * @param {object} params
     * @param {object} params.fleet - fleet runtime state, expected to expose
     *   `position` / `velocity` vectors when tracked (see DefaultFleetState.js)
     * @param {object} [params.originBodyData] - ephemeris body data for the
     *   body the fleet is parked at; used only as a fallback
     * @param {number} params.departureEpochDaysJ2000
     * @param {number} [params.stepDays] - forwarded to EphemerisAdapter for
     *   the fallback path's velocity finite-difference step
     * @returns {{position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}}}
     */
    static resolveOriginState({ fleet, originBodyData, departureEpochDaysJ2000, stepDays }) {
        if (!fleet || typeof fleet !== 'object') {
            throw new Error('TransferAssembler requires a fleet runtime state object');
        }

        if (isVector3(fleet.position) && isVector3(fleet.velocity)) {
            return {
                position: { ...fleet.position },
                velocity: { ...fleet.velocity },
            };
        }

        if (originBodyData) {
            requireFiniteNumber(departureEpochDaysJ2000, 'departureEpochDaysJ2000');
            return EphemerisAdapter.getState(
                originBodyData,
                departureEpochDaysJ2000,
                stepDays !== undefined ? { stepDays } : undefined
            );
        }

        throw new Error(
            'TransferAssembler could not resolve an origin state: the fleet has no tracked ' +
                'position/velocity and no "originBodyData" was supplied to fall back on'
        );
    }

    /**
     * @param {object} params
     * @param {object} params.targetBodyData 
     * @param {number} params.arrivalEpochDaysJ2000
     * @param {number} [params.stepDays]
     * @returns {{position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}}}
     */
    static resolveTargetState({ targetBodyData, arrivalEpochDaysJ2000, stepDays }) {
        if (!targetBodyData || typeof targetBodyData !== 'object') {
            throw new Error('TransferAssembler requires "targetBodyData" for the ephemeris lookup');
        }
        requireFiniteNumber(arrivalEpochDaysJ2000, 'arrivalEpochDaysJ2000');

        return EphemerisAdapter.getState(
            targetBodyData,
            arrivalEpochDaysJ2000,
            stepDays !== undefined ? { stepDays } : undefined
        );
    }

    /**
     * @param {object} params
     * @param {object} params.fleet - fleet runtime state
     * @param {object} [params.originBodyData] - fallback ephemeris body data,
     *   used only when the fleet has no tracked position/velocity yet
     * @param {object} params.targetBodyData - raw ephemeris body data for the target
     * @param {number} params.departureEpochDaysJ2000
     * @param {number} params.arrivalEpochDaysJ2000 - must be after departure
     * @param {number} params.mu - gravitational parameter, in units consistent
     *   with the epochs (e.g. AU^3/day^2 when epochs are in days)
     * @param {boolean} [params.longWay]
     * @param {number} [params.tolerance] - forwarded to LambertSolver.solve
     * @param {number} [params.maxIterations] - forwarded to LambertSolver.solve
     * @param {number} [params.stepDays] - ephemeris velocity finite-difference step
     * @param {number|null} [params.samples] - when a number >= 2, attaches
     *   `trajectorySamples`; when null (default), trajectorySamples is null
     *   and no extra propagation work is done
     * @returns {{
     *   departureEpochDaysJ2000: number,
     *   arrivalEpochDaysJ2000: number,
     *   tof: number,
     *   originState: {position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}},
     *   targetState: {position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}},
     *   departureVelocity: {x:number,y:number,z:number},
     *   arrivalVelocity: {x:number,y:number,z:number},
     *   transferAngle: number,
     *   universalAnomaly: number,
     *   iterations: number,
     *   trajectorySamples: Array<{t:number, position:object, velocity:object}>|null
     * }}
     */
    static assembleTransfer({
        fleet,
        originBodyData,
        targetBodyData,
        departureEpochDaysJ2000,
        arrivalEpochDaysJ2000,
        mu,
        longWay = false,
        tolerance,
        maxIterations,
        stepDays,
        samples = null,
    }) {
        requireFiniteNumber(departureEpochDaysJ2000, 'departureEpochDaysJ2000');
        requireFiniteNumber(arrivalEpochDaysJ2000, 'arrivalEpochDaysJ2000');

        const tof = arrivalEpochDaysJ2000 - departureEpochDaysJ2000;
        requirePositiveNumber(tof, 'tof (arrivalEpochDaysJ2000 - departureEpochDaysJ2000)');

        const originState = TransferAssembler.resolveOriginState({
            fleet,
            originBodyData,
            departureEpochDaysJ2000,
            stepDays,
        });

        const targetState = TransferAssembler.resolveTargetState({
            targetBodyData,
            arrivalEpochDaysJ2000,
            stepDays,
        });

        const solveParams = { r1: originState.position, r2: targetState.position, tof, mu, longWay };
        if (tolerance !== undefined) solveParams.tolerance = tolerance;
        if (maxIterations !== undefined) solveParams.maxIterations = maxIterations;

        const { departureVelocity, arrivalVelocity, transferAngle, universalAnomaly, iterations } =
            LambertSolver.solve(solveParams);

        let trajectorySamples = null;
        if (samples !== null) {
            trajectorySamples = LambertSolver.sampleTrajectory({
                r1: originState.position,
                v1: departureVelocity,
                tof,
                mu,
                samples,
            });
        }

        return {
            departureEpochDaysJ2000,
            arrivalEpochDaysJ2000,
            tof,
            originState,
            targetState,
            departureVelocity,
            arrivalVelocity,
            transferAngle,
            universalAnomaly,
            iterations,
            trajectorySamples,
        };
    }
}