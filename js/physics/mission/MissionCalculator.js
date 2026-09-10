// js/physics/mission/MissionCalculator.js
import { EphemerisBoundary } from './EphemerisBoundary.js';
import { orbitalStateFromEphemeris } from './OrbitalState.js';
import { evaluateTransferFeasibility } from './PropulsionEvaluator.js';
import { createMissionSnapshot } from './MissionSnapshot.js';
import { assert, assertFiniteNumber } from './validation.js';

/**
 * Runs the full analytical Mission Analysis pipeline (Phases 2-5) once for a single
 * departure/arrival pair and returns an immutable MissionSolution.
 *
 * Pipeline (Phase 9C): EphemerisBoundary (body+time -> state) -> MissionSnapshot (records the
 * exact inputs the solve is about to run against) -> TrajectorySolver (state pair -> transfer)
 * -> PropulsionEvaluator (transfer + spacecraft -> MissionSolution). No solver math is
 * reimplemented here; this module only wires Phase 2-5 modules together, plus the Phase 9C
 * snapshot step.
 *
 * The snapshot is built from the same `departureState`/`arrivalState` that are then handed to
 * the solver, so the solve always runs against exactly what the snapshot recorded — there is no
 * second, uncaptured path from inputs to solve. This is the sole calculateMission entry point;
 * callers (e.g. MissionController) do not re-derive ephemeris state or re-run the solver
 * themselves.
 *
 * `solver` must satisfy the generic TrajectorySolver contract (see TrajectorySolver.js /
 * ImpulsiveTransferSolver.js): a frozen object exposing `definition` and `solve(request)`. This
 * module has no default and does not import any concrete solver implementation itself (e.g.
 * LambertSolver) — the caller owns that choice explicitly, with Lambert remaining the default
 * concrete implementation supplied at existing call sites for the impulsive path.
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
    solver,
    calculationTime_daysSinceJ2000 = departureTime_daysSinceJ2000,
    targetConfiguration = { origin: originBodyData?.name ?? null, target: targetBodyData?.name ?? null },
    searchConfiguration = { route },
}) {
    assert(originBodyData !== null && typeof originBodyData === 'object', 'calculateMission: originBodyData is required');
    assert(targetBodyData !== null && typeof targetBodyData === 'object', 'calculateMission: targetBodyData is required');
    assertFiniteNumber(departureTime_daysSinceJ2000, 'calculateMission.departureTime_daysSinceJ2000');
    assertFiniteNumber(arrivalTime_daysSinceJ2000, 'calculateMission.arrivalTime_daysSinceJ2000');
    assertFiniteNumber(calculationTime_daysSinceJ2000, 'calculateMission.calculationTime_daysSinceJ2000');
    assert(spacecraft !== null && typeof spacecraft === 'object', 'calculateMission: spacecraft is required');
    assertFiniteNumber(mu, 'calculateMission.mu');
    assert(typeof resolveParent === 'function', 'calculateMission: resolveParent must be a function');
    assert(
        solver !== null && typeof solver === 'object' && typeof solver.solve === 'function',
        'calculateMission: solver is required and must implement the TrajectorySolver contract'
    );
    assert(
        solver.definition !== null && typeof solver.definition === 'object',
        'calculateMission: solver.definition is required by the TrajectorySolver contract'
    );

    const originEphemeris = EphemerisBoundary.getState(originBodyData, departureTime_daysSinceJ2000, resolveParent);
    const targetEphemeris = EphemerisBoundary.getState(targetBodyData, arrivalTime_daysSinceJ2000, resolveParent);

    const departureState = orbitalStateFromEphemeris(originEphemeris, departureTime_daysSinceJ2000, mu);
    const arrivalState = orbitalStateFromEphemeris(targetEphemeris, arrivalTime_daysSinceJ2000, mu);

    const effectiveSpacecraft = propulsion !== null && propulsion !== undefined
        ? { ...spacecraft, propulsion }
        : spacecraft;

    const snapshot = createMissionSnapshot({
        calculationTime_daysSinceJ2000,
        originState: departureState,
        targetState: arrivalState,
        spacecraft: effectiveSpacecraft,
        propulsion: effectiveSpacecraft.propulsion,
        solver: solver.definition,
        targetConfiguration,
        searchConfiguration,
    });

    const solveRequest = { departureState: snapshot.originState, arrivalState: snapshot.targetState, route };
    if (sampleCount !== undefined) {
        solveRequest.sampleCount = sampleCount;
    }
    const transfer = solver.solve(solveRequest);

    const { solution, isFeasible } = evaluateTransferFeasibility(transfer, snapshot.spacecraft);

    return { snapshot, solution, isFeasible, transfer };
}
