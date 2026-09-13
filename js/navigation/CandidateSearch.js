// js/navigation/CandidateSearch.js

import { TransferAssembler } from '@navigation/TransferAssembler.js';

const VALID_MODES = new Set(['time', 'fuel']);
const DEFAULT_DEPARTURE_OFFSET_DAYS = 0;
const DEFAULT_TOF_CANDIDATES_DAYS = [90, 180, 270, 365, 450];
const DEFAULT_MAX_CANDIDATES = 5;

function requireFiniteNumber(value, label) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`searchTransferCandidates requires a numeric "${label}"`);
    }
}

function requireNonEmptyArray(value, label) {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error(`searchTransferCandidates requires a non-empty "${label}" array`);
    }
}

/**
 *
 * @param {object} params
 * @param {object} params.fleet
 * @param {object} params.target
 * @param {object} params.targetBodyData
 * @param {object} [params.originBodyData]
 * @param {'time'|'fuel'} params.mode
 * @param {number} params.currentEpochDaysJ2000
 * @param {number} params.mu
 * @param {number} [params.departureOffsetDays] - single fixed offset (days)
 *   from currentEpochDaysJ2000 used as the departure epoch for every
 *   candidate. Defaults to 0
 * @param {number[]} [params.tofCandidatesDays] - times of flight (days) to
 *   try at that fixed departure epoch.
 * @param {boolean} [params.longWay]
 * @param {number} [params.tolerance]
 * @param {number} [params.maxIterations]
 * @param {number} [params.stepDays]
 * @param {number|null} [params.samples]
 * @param {number} [params.standardGravityMS2]
 * @param {number} [params.velocityUnitToMetersPerSecond]
 * @param {number} [params.maxCandidates] - cap on the number of candidates
 *   returned after ranking
 * @returns {object[]} ranked FlightPlans, each with an added `candidateId`
 */
export function searchTransferCandidates({
    fleet,
    target,
    targetBodyData,
    originBodyData,
    mode,
    currentEpochDaysJ2000,
    mu,
    departureOffsetDays = DEFAULT_DEPARTURE_OFFSET_DAYS,
    tofCandidatesDays = DEFAULT_TOF_CANDIDATES_DAYS,
    longWay = false,
    tolerance,
    maxIterations,
    stepDays,
    samples = null,
    standardGravityMS2,
    velocityUnitToMetersPerSecond,
    maxCandidates = DEFAULT_MAX_CANDIDATES,
}) {
    if (!VALID_MODES.has(mode)) {
        throw new Error(
            `searchTransferCandidates requires "mode" to be "time" or "fuel", got ${JSON.stringify(mode)}`
        );
    }
    requireFiniteNumber(currentEpochDaysJ2000, 'currentEpochDaysJ2000');
    requireFiniteNumber(departureOffsetDays, 'departureOffsetDays');
    requireNonEmptyArray(tofCandidatesDays, 'tofCandidatesDays');

    if (typeof maxCandidates !== 'number' || !Number.isFinite(maxCandidates) || maxCandidates < 1) {
        throw new Error('searchTransferCandidates requires a positive numeric "maxCandidates"');
    }

    const departureEpochDaysJ2000 = currentEpochDaysJ2000 + departureOffsetDays;

    const candidatePlans = [];

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

    if (candidatePlans.length === 0) {
        throw new Error(
            'searchTransferCandidates could not produce any candidate transfer for the given ' +
                'departure offset and times of flight'
        );
    }

    const scoreOf = mode === 'time' ? (plan) => plan.tof : (plan) => plan.propellantRequired;

    const ranked = [...candidatePlans].sort((a, b) => {
        if (a.isFeasible !== b.isFeasible) return a.isFeasible ? -1 : 1;
        return scoreOf(a) - scoreOf(b);
    });

    return ranked.slice(0, maxCandidates).map((plan, index) => ({
        ...plan,
        candidateId: `${mode}-${index}`,
    }));
}

/**
 * @param {object[]} candidates - output of searchTransferCandidates
 * @param {string} candidateId
 * @returns {object} the matching FlightPlan (with its candidateId)
 */
export function selectCandidate(candidates, candidateId) {
    if (!Array.isArray(candidates) || candidates.length === 0) {
        throw new Error('selectCandidate requires a non-empty "candidates" array');
    }
    if (typeof candidateId !== 'string' || candidateId.length === 0) {
        throw new Error('selectCandidate requires a string "candidateId"');
    }

    const found = candidates.find((candidate) => candidate.candidateId === candidateId);
    if (!found) {
        throw new Error(`selectCandidate could not find a candidate with id ${JSON.stringify(candidateId)}`);
    }

    return found;
}