// js/main/MissionController.js
//
// Authoritative Phase 9C path from porkchop selection to a MissionSolution:
//
//   PorkchopPanel.onCandidateSelected (CandidateReference)
//     -> MissionController.selectCandidate
//     -> calculateMission
//          -> MissionSnapshot (Chronometer time, origin/target states,
//            spacecraft/propulsion, solver identity, target/search config)
//          -> TrajectorySolver.solve
//          -> MissionSolution
//     -> the same MissionSolution object is forwarded to MissionResultPanel
//       and TransferTrajectoryRenderer
//
// Search (calculate -> searchTransferField -> TransferField) never constructs a
// MissionSolution. This module performs no astrodynamics.
import { calculateMission } from '@physics/mission/MissionCalculator.js';
import { searchTransferField } from '@physics/mission/TransferSearch.js';
import { CELL_STATUS } from '@physics/mission/TransferField.js';
import { PhysicsEngine } from '@physics/PhysicsEngine.js';
import { createSpacecraftDefinition } from '@physics/mission/SpacecraftDefinition.js';
import { createPropulsionDefinition } from '@physics/mission/PropulsionDefinition.js';
import { LambertSolver } from '@physics/mission/LambertSolver.js';

// TODO(Phase 7 / spacecraft presets): replace with a real, UI-selected
// SpacecraftDefinition once presets exist (Phase 1 owns the shape). Built
// through the Phase 1 factories (not an ad-hoc literal) so it carries the
// same validated/frozen shape PropulsionEvaluator expects, including the
// derived wetMass_kg it reads directly.
const PLACEHOLDER_PROPULSION = createPropulsionDefinition({
    name: 'Placeholder Chemical Stage',
    type: 'CHEMICAL',
    specificImpulse_s: 320,
    thrust_N: 500,
});

const PLACEHOLDER_SPACECRAFT = createSpacecraftDefinition({
    name: 'Placeholder Spacecraft',
    dryMass_kg: 2000,
    propellantMass_kg: 1500,
    propulsion: PLACEHOLDER_PROPULSION,
});

// Solar gravitational parameter in AU^3/day^2 -- the unit convention used by
// LambertSolver / KeplerPropagator / the mission Vitest fixtures (state
// vectors throughout Mission Analysis are AU + days, not km + seconds).
// constants.js does not currently export a solar mu in these units, so this
// is kept local; do not substitute a km^3/s^2 value here.
const GM_SUN_AU3_PER_DAY2 = 2.959122082855911e-4;

// TODO(future targeting/origin-selection phase): there is no two-body
// mission targeting UI yet (Phase 16/Transfer Search territory). Until one
// exists, origin is a fixed default and target is whatever the existing
// single-target selection (AppState.currentTargetData) already points at.
// NOTE: unverified against the real planets.json -- confirm this matches
// body.data.name's actual casing in the loaded dataset before relying on it.
const DEFAULT_ORIGIN_BODY_NAME = 'EARTH';

// TODO(Phase 11 -- Sensorium Mission Planner): there is no departure-window /
// TOF-window picker yet. Until Phase 11 lands, Calculate always searches a
// fixed window starting "now" so the porkchop has a bounded grid to show;
// these three constants are the only thing a future picker needs to make
// user-controlled instead of fixed.
const DEFAULT_DEPARTURE_WINDOW_DAYS = 180;
const DEFAULT_TIME_OF_FLIGHT_WINDOW = { min_days: 100, max_days: 500 };
const DEFAULT_SEARCH_STEP_DAYS = 5;

export class MissionController {
    constructor({
        appState,
        bodyRegistry,
        missionPanel,
        transferRenderer,
        porkchopPanel,
        originBodyName = DEFAULT_ORIGIN_BODY_NAME,
        spacecraft = PLACEHOLDER_SPACECRAFT,
        route = 'PROGRADE',
        mu = GM_SUN_AU3_PER_DAY2,
        solver = LambertSolver,
    }) {
        this.appState = appState;
        this.bodyRegistry = bodyRegistry;
        this.missionPanel = missionPanel;
        this.transferRenderer = transferRenderer;
        this.porkchopPanel = porkchopPanel;
        this.originBodyName = originBodyName;
        this.spacecraft = spacecraft;
        this.route = route;
        this.mu = mu;
        this.solver = solver;

        this.currentMissionSnapshot = null;
        this._lastSearchConfiguration = null;

        this.missionPanel.onCalculateRequested = () => this.calculate();
        this.porkchopPanel.onCandidateSelected = (candidate) => this.selectCandidate(candidate);
    }

    calculate() {
        const originBody = this.bodyRegistry.getByName(this.originBodyName);
        const targetBody = this.appState.currentTargetData
            ? this.bodyRegistry.getByName(this.appState.currentTargetData.name)
            : null;

        if (!originBody || !targetBody || originBody.data.name === targetBody.data.name) {
            this.missionPanel.clearMissionResult();
            this.transferRenderer.setSolution(null);
            this.currentMissionSnapshot = null;
            return;
        }

        const departureStart_daysSinceJ2000 = PhysicsEngine.getJ2000Days(this.appState.systemDate);

        const searchConfiguration = {
            departureStep_days: DEFAULT_SEARCH_STEP_DAYS,
            arrivalStep_days: DEFAULT_SEARCH_STEP_DAYS,
        };
        this._lastSearchConfiguration = searchConfiguration;

        const { field, minima } = searchTransferField({
            originBodyData: originBody.data,
            targetBodyData: targetBody.data,
            departureWindow: {
                start_daysSinceJ2000: departureStart_daysSinceJ2000,
                end_daysSinceJ2000: departureStart_daysSinceJ2000 + DEFAULT_DEPARTURE_WINDOW_DAYS,
            },
            timeOfFlightWindow: DEFAULT_TIME_OF_FLIGHT_WINDOW,
            spacecraft: this.spacecraft,
            route: this.route,
            resolveParent: (name) => this.bodyRegistry.getByName(name)?.data ?? null,
            mu: this.mu,
            searchConfiguration,
        });

        this.porkchopPanel.open(field, { minima });
    }

    selectCandidate(candidate) {
        if (candidate?.status === CELL_STATUS.UNSOLVABLE) return;

        const originBody = this.bodyRegistry.getByName(this.originBodyName);
        const targetBody = this.appState.currentTargetData
            ? this.bodyRegistry.getByName(this.appState.currentTargetData.name)
            : null;

        if (!originBody || !targetBody) return;

        const calculationTime_daysSinceJ2000 = PhysicsEngine.getJ2000Days(this.appState.systemDate);

        const { snapshot, solution, isFeasible } = calculateMission({
            originBodyData: originBody.data,
            targetBodyData: targetBody.data,
            departureTime_daysSinceJ2000: candidate.departureTime_daysSinceJ2000,
            arrivalTime_daysSinceJ2000: candidate.arrivalTime_daysSinceJ2000,
            spacecraft: this.spacecraft,
            route: this.route,
            resolveParent: (name) => this.bodyRegistry.getByName(name)?.data ?? null,
            mu: this.mu,
            solver: this.solver,
            calculationTime_daysSinceJ2000,
            targetConfiguration: {
                originBodyName: originBody.data.name,
                targetBodyName: targetBody.data.name,
            },
            searchConfiguration: this._lastSearchConfiguration ?? {
                departureStep_days: DEFAULT_SEARCH_STEP_DAYS,
                arrivalStep_days: DEFAULT_SEARCH_STEP_DAYS,
            },
        });

        this.currentMissionSnapshot = snapshot;
        this.missionPanel.showMissionResult(solution, { isFeasible });
        this.transferRenderer.setSolution(solution);
    }
}
