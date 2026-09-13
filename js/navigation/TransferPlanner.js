// js/navigation/TransferPlanner.js

import { TransferAssembler } from '@navigation/TransferAssembler.js';

const VALID_MODES = new Set(['time', 'fuel']);
const DEFAULT_DEPARTURE_OFFSETS_DAYS = [0];
const DEFAULT_TOF_CANDIDATES_DAYS = [90, 180, 270, 365, 450];

function requireFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`calculateImpulsiveTransfer requires a numeric "${label}"`);
    }
}

function requireNonEmptyArray(value, label) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`calculateImpulsiveTransfer requires a non-empty "${label}" array`);
    }
}

/**
 * @param {object} params
 * @param {object} params.fleet - fleet with "ships" + runtime "fuelRemaining"
 * @param {object} params.target - Target descriptor (see Target.js),
 *   attached to the resulting FlightPlan
 * @param {object} params.targetBodyData - raw ephemeris body data for the
 *   target (the shape consumed by EphemerisAdapter/OrbitalMath)
 * @param {object} [params.originBodyData] - fallback ephemeris body data,
 *   used only when the fleet has no tracked position/velocity yet
 * @param {'time'|'fuel'} params.mode
 * @param {number} params.currentEpochDaysJ2000 - the epoch planning starts
 *   from (the paused Chronometer's current epoch)
 * @param {number} params.mu - gravitational parameter, units consistent
 *   with the epochs (e.g. AU^3/day^2 when epochs are in days)
 * @param {number[]} [params.departureOffsetsDays] - offsets (days) from
 *   currentEpochDaysJ2000 to try as departure epochs
 * @param {number[]} [params.tofCandidatesDays] - times of flight (days) to
 *   try for each departure candidate
 * @param {boolean} [params.longWay]
 * @param {number} [params.tolerance]
 * @param {number} [params.maxIterations]
 * @param {number} [params.stepDays]
 * @param {number|null} [params.samples]
 * @param {number} [params.standardGravityMS2]
 * @param {number} [params.velocityUnitToMetersPerSecond]
 * @returns {object} FlightPlan
 */
export function calculateImpulsiveTransfer({
    fleet,
    target,
    targetBodyData,
    originBodyData,
    mode,
    currentEpochDaysJ2000,
    mu,
    departureOffsetsDays = DEFAULT_DEPARTURE_OFFSETS_DAYS,
    tofCandidatesDays = DEFAULT_TOF_CANDIDATES_DAYS,
    longWay = false,
    tolerance,
    maxIterations,
    stepDays,
    samples = null,
    standardGravityMS2,
    velocityUnitToMetersPerSecond,
}) {
    if (!VALID_MODES.has(mode)) {
        throw new Error(
            `calculateImpulsiveTransfer requires "mode" to be "time" or "fuel", got ${JSON.stringify(mode)}`
        );
    }
    requireFiniteNumber(currentEpochDaysJ2000, 'currentEpochDaysJ2000');
    requireNonEmptyArray(departureOffsetsDays, 'departureOffsetsDays');
    requireNonEmptyArray(tofCandidatesDays, 'tofCandidatesDays');

    const candidatePlans = [];

    for (const departureOffsetDays of departureOffsetsDays) {
        const departureEpochDaysJ2000 = currentEpochDaysJ2000 + departureOffsetDays;

        for (const tofDays of tofCandidatesDays) {
            const arrivalEpochDaysJ2000 = departureEpochDaysJ2000 + tofDays;

            let rawTransfer;
            try {
                rawTransfer = TransferAssembler.assembleTransfer({
                    fleet,
                    originBodyData,
                    targetBodyData,
                    departureEpochDaysJ2000,
                    arrivalEpochDaysJ2000,
                    mu,
                    longWay,
                    tolerance,
                    maxIterations,
                    stepDays,
                    samples,
                });
            } catch (err) {
                continue;
            }

            let plan;
            try {
                plan = TransferAssembler.buildFlightPlan({
                    fleet,
                    target,
                    rawTransfer,
                    optimizationMode: mode,
                    standardGravityMS2,
                    velocityUnitToMetersPerSecond,
                });
            } catch (err) {
                continue;
            }

            candidatePlans.push(plan);
        }
    }

    if (candidatePlans.length === 0) {
        throw new Error(
            'calculateImpulsiveTransfer could not produce any candidate transfer for the given ' +
                'departure offsets and times of flight'
        );
    }

    const feasiblePlans = candidatePlans.filter((plan) => plan.isFeasible);
    const pool = feasiblePlans.length > 0 ? feasiblePlans : candidatePlans;

    const scoreOf = mode === 'time' ? (plan) => plan.tof : (plan) => plan.propellantRequired;

    return pool.reduce((best, plan) => (scoreOf(plan) < scoreOf(best) ? plan : best));
}