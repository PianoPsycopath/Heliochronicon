// js/physics/mission/MissionCalculator.js
import { EphemerisBoundary } from './EphemerisBoundary.js';
import { orbitalStateFromEphemeris } from './OrbitalState.js';
import { LambertSolver } from './LambertSolver.js';
import { evaluateTransferFeasibility } from './PropulsionEvaluator.js';
import { assert, assertFiniteNumber } from './validation.js';

/**
 * Runs the full analytical Mission Analysis pipeline (Phases 2-5) once for a single
 * departure/arrival pair and returns an immutable MissionSolution.
 *
 * Pipeline: EphemerisBoundary (body+time -> state) -> LambertSolver (state pair -> transfer)
 * -> PropulsionEvaluator (transfer + spacecraft -> MissionSolution). No solver math is
 * reimplemented here; this module only wires Phase 2-5 modules together.
 */
export function calculateMission({
    originBodyData,
    targetBodyData,
    departureTime_daysSinceJ2000,
    arrivalTime_daysSinceJ2000,
    spacecraft,
    propulsion = null,
    route = 'PROGRADE',
    resolveParent = () => null,
    mu,
    sampleCount,
}) {
    assert(originBodyData !== null && typeof originBodyData === 'object', 'calculateMission: originBodyData is required');
    assert(targetBodyData !== null && typeof targetBodyData === 'object', 'calculateMission: targetBodyData is required');
    assertFiniteNumber(departureTime_daysSinceJ2000, 'calculateMission.departureTime_daysSinceJ2000');
    assertFiniteNumber(arrivalTime_daysSinceJ2000, 'calculateMission.arrivalTime_daysSinceJ2000');
    assert(spacecraft !== null && typeof spacecraft === 'object', 'calculateMission: spacecraft is required');
    assertFiniteNumber(mu, 'calculateMission.mu');
    assert(typeof resolveParent === 'function', 'calculateMission: resolveParent must be a function');

    const originEphemeris = EphemerisBoundary.getState(originBodyData, departureTime_daysSinceJ2000, resolveParent);
    const targetEphemeris = EphemerisBoundary.getState(targetBodyData, arrivalTime_daysSinceJ2000, resolveParent);

    const departureState = orbitalStateFromEphemeris(originEphemeris, departureTime_daysSinceJ2000, mu);
    const arrivalState = orbitalStateFromEphemeris(targetEphemeris, arrivalTime_daysSinceJ2000, mu);

    const lambertRequest = { departureState, arrivalState, route };
    if (sampleCount !== undefined) {
        lambertRequest.sampleCount = sampleCount;
    }
    const transfer = LambertSolver.solve(lambertRequest);

    const effectiveSpacecraft = propulsion !== null && propulsion !== undefined
        ? { ...spacecraft, propulsion }
        : spacecraft;

    const { solution, isFeasible } = evaluateTransferFeasibility(transfer, effectiveSpacecraft);

    return { solution, isFeasible, transfer };
}
