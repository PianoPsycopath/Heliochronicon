// js/main/FleetNavigationController.js

import { FleetService } from '@navigation/FleetService.js';
import { FleetRuntimeStore } from '@navigation/FleetRuntimeStore.js';
import { PlanningSession } from '@navigation/PlanningSession.js';
import { Target } from '@navigation/Target.js';
import { searchTransferCandidates, selectCandidate } from '@navigation/CandidateSearch.js';
import { EphemerisAdapter } from '@navigation/EphemerisAdapter.js';
import { FLEET_STATE, REFERENCE_FRAME } from '@navigation/DefaultFleetState.js';
import {
    beginFlight,
    completeFlight,
    hasReachedArrival,
    releasePlan,
} from '@navigation/FleetExecution.js';
import {
    geocentricToHeliocentric,
    positionAlongPlan,
    propagateGeocentricState,
} from '@navigation/FleetPropagator.js';
import { applyDepartureInjection } from '@navigation/DepartureInjection.js';
import { FlightPlanningPanel } from '@ui/FlightPlanningPanel.js';
import { FleetStatusPanel } from '@ui/FleetStatusPanel.js';
import { FlightPlanRenderer } from '@rendering/FlightPlanRenderer.js';
import { FleetMarkerRenderer } from '@rendering/FleetMarkerRenderer.js';
import { applyArrivalCapture } from '@navigation/ArrivalCapture.js';
import {
    heliocentricStateFromAuPerDay,
    heliocentricStateToAuPerDay,
    parentBodyFromRuntimeState,
    resolveHeliocentricOrigin,
    trajectoryStateFromRuntimeState,
} from '@navigation/TrajectoryState.js';
import {
    createHeliocentricPositionResolver,
    resolveCurrentParent,
} from '@navigation/PatchedConicFrame.js';
import { bodyMuKm3PerS2, bodyRadiusKm } from '@core/BodyPhysicalConstants.js';
import { logger } from '@core/logger.js';

const DEFAULT_TRANSFER_MODE = 'time';
const DEFAULT_FLEET_DATA_URL = 'data/fleets/userfleet.json';

const DEFAULT_ARRIVAL_PARKING_ALTITUDE_KM = 300;


const TRAJECTORY_RENDER_SAMPLES = 60;

const STATUS_REFRESH_INTERVAL_MS = 250;

const PARKING_REBASELINE_DAYS = 1;

const BURN_TRAJECTORY_MISMATCH_WARN_AU = 1e-3;

const STALE_ORIGIN_STATE_WARN_DAYS = 1e-3;

function isVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function magnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export class FleetNavigationController {
    /**
     * @param {object} ctx
     * @param {import('three').Scene} ctx.scene
     * @param {import('three').Camera} ctx.camera
     * @param {import('three').WebGLRenderer} ctx.webglRenderer
     * @param {{pauseForPlanning: Function, resumeFromPlanning: Function}} ctx.timeController
     * @param {HTMLElement} ctx.panelContainer - flight-planning panel host
     * @param {HTMLElement} [ctx.fleetPanelContainer] - Ocularis FLEET tab host
     * @param {(name: string) => object|null} ctx.getBodyDataByName
     * @param {() => number} ctx.getCurrentEpochDaysJ2000
     * @param {() => {x:number,y:number,z:number}} ctx.getCurrentOrigin
     * @param {(scenePosition: {x:number,y:number,z:number}) => void} [ctx.onFocusFleetRequested]
     * @param {number} ctx.mu - heliocentric mu, AU^3/day^2
     * @param {number} ctx.earthRadiusKm
     * @param {number} ctx.earthMuKm3PerS2
     * @param {number} ctx.fallbackAltitudeKm - Earth LEO
     * @param {string} [ctx.fleetDataUrl]
     * @param {FleetRuntimeStore} [ctx.runtimeStore]
     */
    constructor({
        scene,
        camera,
        webglRenderer,
        timeController,
        panelContainer,
        fleetPanelContainer = null,
        getBodyDataByName,
        getCurrentEpochDaysJ2000,
        getCurrentOrigin,
        onFocusFleetRequested = null,
        mu,
        earthRadiusKm,
        earthMuKm3PerS2,
        fallbackAltitudeKm,
        fleetDataUrl = DEFAULT_FLEET_DATA_URL,
        runtimeStore = new FleetRuntimeStore(),
    }) {
        if (!scene) throw new Error('FleetNavigationController requires a "scene"');
        if (!camera) throw new Error('FleetNavigationController requires a "camera"');
        if (!webglRenderer) throw new Error('FleetNavigationController requires a "webglRenderer"');
        if (!panelContainer) {
            throw new Error('FleetNavigationController requires a "panelContainer" element');
        }
        if (typeof getBodyDataByName !== 'function') {
            throw new Error('FleetNavigationController requires "getBodyDataByName"');
        }
        if (typeof getCurrentEpochDaysJ2000 !== 'function') {
            throw new Error('FleetNavigationController requires "getCurrentEpochDaysJ2000"');
        }
        if (typeof getCurrentOrigin !== 'function') {
            throw new Error('FleetNavigationController requires "getCurrentOrigin"');
        }

        this.getBodyDataByName = getBodyDataByName;
        this.getCurrentEpochDaysJ2000 = getCurrentEpochDaysJ2000;
        this.onFocusFleetRequested = onFocusFleetRequested;
        this.mu = mu;
        this.earthRadiusKm = earthRadiusKm;
        this.earthMuKm3PerS2 = earthMuKm3PerS2;
        this.fallbackAltitudeKm = fallbackAltitudeKm;
        this.fleetDataUrl = fleetDataUrl;
        this.runtimeStore = runtimeStore;

        this._heliocentricPositionAu = createHeliocentricPositionResolver({
            getBodyDataByName,
            getPositionAu: (bodyData, epochDaysJ2000) =>
                EphemerisAdapter.getPosition(bodyData, epochDaysJ2000),
        });
        this._lastLoggedParentBody = null;
        this._warnedParentResolutions = new Set();

        this.fleet = null;
        this.candidates = [];

        this.activePlan = null;
        this._lastStatusRefreshMs = 0;

        this.panel = new FlightPlanningPanel({ container: panelContainer });
        this.fleetPanel = fleetPanelContainer
            ? new FleetStatusPanel({ container: fleetPanelContainer })
            : null;

        this.renderer = new FlightPlanRenderer({
            scene,
            camera,
            renderer: webglRenderer,
            getCurrentOrigin,
        });
        this.marker = new FleetMarkerRenderer({
            scene,
            camera,
            renderer: webglRenderer,
            getCurrentOrigin,
        });

        this.session = new PlanningSession({
            timeController,
            calculateTransfer: (transferParams) => this._searchAndPublishCandidates(transferParams),
        });
        this.session.onCancel = () => {
            this.panel.clearCandidates();
            this.panel.clearFlightPlan();
            this.panel.hideConfirmActions();
            this.renderer.clear();
        };

        this.panel.onCalculateRequested = (request) => this._handleCalculateRequested(request);
        this.panel.onCandidateSelected = (candidateId) => this._handleCandidateSelected(candidateId);
        this.panel.onConfirmRequested = () => this._handleConfirmRequested();
        this.panel.onCancelRequested = () => this._handleCancelRequested();
        this.panel.onClearRequested = () => this._handleClearRequested();

        if (this.fleetPanel) {
            this.fleetPanel.onFocusRequested = () => this._handleFocusFleetRequested();
        }
    }

    async initialize() {
        this.fleet = await FleetService.loadFleetWithState({
            dataUrl: this.fleetDataUrl,
            store: this.runtimeStore,
            getBodyDataByName: this.getBodyDataByName,
            earthRadiusKm: this.earthRadiusKm,
            fallbackAltitudeKm: this.fallbackAltitudeKm,
            earthMuKm3PerS2: this.earthMuKm3PerS2,
        });

        this._stampRuntimeEpochIfMissing();
        this._syncFleetStatus();
        this._restoreActivePlan();
        this.update();
    }

    _stampRuntimeEpochIfMissing() {
        if (!this.fleet?.runtimeState) return;
        if (Number.isFinite(this.fleet.runtimeState.epochDaysJ2000)) return;

        this.fleet.runtimeState = {
            ...this.fleet.runtimeState,
            epochDaysJ2000: this.getCurrentEpochDaysJ2000(),
        };
        this._persistRuntimeState();
    }

    _restoreActivePlan() {
        if (!this.fleet) return;

        const persistedPlan =
            typeof this.runtimeStore.loadActivePlan === 'function'
                ? this.runtimeStore.loadActivePlan(this.fleet.id)
                : null;

        const state = this.fleet.runtimeState?.state;

        if (!persistedPlan) {
            if (state === FLEET_STATE.INFLIGHT) {
                logger.warn(
                    '[FleetNavigation] Fleet persisted as inflight with no recoverable plan; ' +
                        'releasing it at its last known state'
                );
                this.fleet.runtimeState = releasePlan({ runtimeState: this.fleet.runtimeState });
                this._persistRuntimeState();
                this._syncFleetStatus();
            }
            return;
        }

        this.activePlan = persistedPlan;
        this._renderPlan('restore', persistedPlan);
        this.panel.showFlightPlan(persistedPlan);
        this.panel.setTarget(persistedPlan.target?.bodyName ?? '');
        this.panel.showClearAction();
    }

    // --- planning ----------------------------------------------------------

    _searchAndPublishCandidates(transferParams) {
        const rawCandidates = searchTransferCandidates(transferParams);
        const { departureState } = transferParams;
        const candidates = this._applyInjectionToCandidates(rawCandidates, transferParams).map(
            (plan) => (departureState ? { ...plan, departureState } : plan)
        );

        this.candidates = candidates;
        this.panel.showCandidates(candidates);

        return candidates[0];
    }

    _applyInjectionToCandidates(candidates, { fleet, parkingState, earthState, originMuKm3PerS2, targetBodyData }) {
        return candidates.map((plan) => {
            let result = plan;
        
            if (parkingState && earthState && Number.isFinite(originMuKm3PerS2)) {
                try {
                    result = applyDepartureInjection({
                        plan: result, fleet, parkingPosition: parkingState.position,
                        parkingVelocity: parkingState.velocity, earthState,
                        muEarthKm3PerS2: originMuKm3PerS2,
                    });
                } catch (err) {
                    logger.warn(`[FleetNavigation] Departure injection failed for ${plan.candidateId}: ${err.message}`);
                }
            }
        
            if (targetBodyData) {
                try {
                    result = applyArrivalCapture({
                        plan: result,
                        fleet,
                        targetRadiusKm: bodyRadiusKm(targetBodyData),
                        parkingAltitudeKm: DEFAULT_ARRIVAL_PARKING_ALTITUDE_KM,
                        muTargetKm3PerS2: bodyMuKm3PerS2(targetBodyData),
                    });
                } catch (err) {
                    logger.warn(`[FleetNavigation] Arrival capture failed for ${plan.candidateId}: ${err.message}`);
                }
            }
        
            return result;
        });
    }

    /**
     * @param {string} source
     * @param {object} plan
     */
    _renderPlan(source, plan) {
        this.renderer.setPlan(plan);
        this._reportRenderedPlan(source, plan);
    }

    _reportRenderedPlan(source, plan) {
        if (!plan) return;

        const burns = Array.isArray(plan.burns) ? plan.burns : [];
        const samples = Array.isArray(plan.trajectorySamples) ? plan.trajectorySamples : [];
        const report = this.renderer.lastPlanReport;

        logger.info(
            `[FleetNavigation] Plan drawn (${source}): ` +
                JSON.stringify({
                    candidateId: plan.candidateId ?? null,
                    enrichedDeparture: !!plan.injection,
                    enrichedArrival: !!plan.capture,
                    departureState: plan.departureState
                        ? {
                              frame: plan.departureState.frame,
                              parentBody: plan.departureState.parentBody,
                              epochDaysJ2000: plan.departureState.epochDaysJ2000,
                          }
                        : null,
                    burns: burns.map((b) => ({
                        position: b.position ?? null,
                        deltaVMagnitude: b.deltaV ? Math.hypot(b.deltaV.x, b.deltaV.y, b.deltaV.z) : null,
                    })),
                    trajectoryStart: samples[0]?.position ?? null,
                    trajectoryEnd: samples[samples.length - 1]?.position ?? null,
                    rendered: report,
                })
        );

        if (burns.length >= 2 && report && report.burnMarkersShown < burns.length) {
            logger.warn(
                `[FleetNavigation] Only ${report.burnMarkersShown}/${burns.length} burn markers drawn ` +
                    `(${report.burnsWithoutPosition} without position, ` +
                    `${report.burnsWithNonFinitePosition} non-finite)`
            );
        }

        if (samples.length > 1 && burns.length >= 2) {
            this._warnIfBurnOffTrajectory('departure', burns[0], samples[0]);
            this._warnIfBurnOffTrajectory('arrival', burns[burns.length - 1], samples[samples.length - 1]);
        }
    }

    _warnIfBurnOffTrajectory(label, burn, sample) {
        if (!isVector3(burn?.position) || !isVector3(sample?.position)) return;

        const offsetAu = Math.hypot(
            burn.position.x - sample.position.x,
            burn.position.y - sample.position.y,
            burn.position.z - sample.position.z
        );
        if (offsetAu > BURN_TRAJECTORY_MISMATCH_WARN_AU) {
            logger.warn(
                `[FleetNavigation] ${label} burn is ${offsetAu.toExponential(2)} AU from the trajectory ` +
                    'endpoint; burn positions and trajectory samples are likely in different frames/units'
            );
        }
    }

    _handleCalculateRequested({ targetName }) {
        if (!this.fleet) return;

        if (this.fleet.runtimeState?.state === FLEET_STATE.INFLIGHT) {
            this.panel.showNotice('FLEET IN FLIGHT — CLEAR THE ACTIVE PLAN TO REPLAN');
            return;
        }

        const normalizedName = (targetName || '').trim().toUpperCase();
        if (!normalizedName) {
            this.panel.clearCandidates();
            this.panel.clearFlightPlan();
            return;
        }

        const targetBodyData = this.getBodyDataByName(normalizedName);
        if (!targetBodyData) {
            logger.warn(`[FleetNavigation] Unknown target body "${normalizedName}"`);
            this.panel.clearCandidates();
            this.panel.clearFlightPlan();
            return;
        }

        if (this.session.isActive) {
            this.session.cancel();
        }

        const runtimeState = this.fleet.runtimeState;
        const target = Target.create({ bodyName: targetBodyData.name });
        const currentEpochDaysJ2000 = this.getCurrentEpochDaysJ2000();

        const parkingState = this._parkingStateAt(currentEpochDaysJ2000);

        const originBodyName =
            parentBodyFromRuntimeState(runtimeState) ??
            this._resolveFleetParent(currentEpochDaysJ2000, {
                parkingState,
                extraCandidateNames: [targetBodyData.name],
            })?.parentBody ??
            null;
        const originBodyData = originBodyName ? this.getBodyDataByName(originBodyName) : null;
        const earthState = originBodyData
            ? EphemerisAdapter.getState(originBodyData, currentEpochDaysJ2000)
            : null;
        const originMuKm3PerS2 = this._parentMuKm3PerS2(runtimeState);

        const departureState = this._resolveOriginTrajectoryState({
            parkingState,
            earthState,
            epochDaysJ2000: currentEpochDaysJ2000,
        });

        const solverFleet = {
            ...this.fleet,
            fuelRemaining: this.fleet.runtimeState?.fuelRemaining,
            ...(departureState ? heliocentricStateToAuPerDay(departureState) : {}),
        };

        const transferParams = {
            fleet: solverFleet,
            target,
            targetBodyData,
            originBodyData,
            mode: DEFAULT_TRANSFER_MODE,
            currentEpochDaysJ2000,
            mu: this.mu,
            samples: TRAJECTORY_RENDER_SAMPLES,
            parkingState,
            earthState,
            originMuKm3PerS2,
            departureState,
        };

        try {
            const provisionalPlan = this.session.start(transferParams);
            this.panel.clearNotice();
            this.panel.setTarget(normalizedName);
            this.panel.showFlightPlan(provisionalPlan);
            this._renderPlan('calculate', provisionalPlan);
            this.panel.showConfirmActions();
            this._syncFleetStatus();
        } catch (err) {
            logger.warn(
                `[FleetNavigation] No transfer candidates for "${normalizedName}": ${err.message}`
            );
            this.panel.clearCandidates();
            this.panel.clearFlightPlan();
            this.panel.hideConfirmActions();
        }
    }

    /**
     * @param {number} epochDaysJ2000
     * @param {{position:object, velocity:object}|null} [parkingState] - already
     *   propagated to `epochDaysJ2000`; computed here when omitted (pass null
     *   to say there is none)
     * @returns {import('@navigation/TrajectoryState.js').TrajectoryState|null}
     */
    _currentTrajectoryState(epochDaysJ2000, parkingState = this._parkingStateAt(epochDaysJ2000)) {
        const runtimeState = this.fleet?.runtimeState;
        if (!runtimeState) return null;

        try {
            if (runtimeState.state === FLEET_STATE.INFLIGHT && this.activePlan) {
                const position = positionAlongPlan({
                    plan: this.activePlan,
                    currentEpochDaysJ2000: epochDaysJ2000,
                });
                const sample = this._sampleAlongActivePlan(epochDaysJ2000);
                if (!position || !sample) return null;

                return heliocentricStateFromAuPerDay({
                    epochDaysJ2000,
                    position,
                    velocity: sample.velocity,
                });
            }

            if (parkingState) {
                return trajectoryStateFromRuntimeState({
                    ...runtimeState,
                    position: parkingState.position,
                    velocity: parkingState.velocity,
                    epochDaysJ2000,
                });
            }

            if (runtimeState.frame === REFERENCE_FRAME.HELIOCENTRIC_AU) {
                return trajectoryStateFromRuntimeState(runtimeState, {
                    fallbackEpochDaysJ2000: epochDaysJ2000,
                });
            }
        } catch (err) {
            logger.warn(
                `[FleetNavigation] Could not build the current TrajectoryState: ${err.message}`
            );
        }

        return null;
    }

    /**
     * @param {number} epochDaysJ2000
     * @param {object} [options]
     * @param {{position:object, velocity:object}|null} [options.parkingState]
     * @param {string[]} [options.extraCandidateNames]
     * @returns {ReturnType<typeof resolveCurrentParent>|null} null when the
     *   state or body data cannot support a resolution (logged once)
     */
    _resolveFleetParent(epochDaysJ2000, { parkingState, extraCandidateNames = [] } = {}) {
        const state = this._currentTrajectoryState(epochDaysJ2000, parkingState);
        if (!state) return null;

        const candidateBodyNames = [
            parentBodyFromRuntimeState(this.fleet?.runtimeState),
            this.fleet?.runtimeState?.target?.bodyName,
            this.activePlan?.target?.bodyName,
            ...extraCandidateNames,
        ].filter((name) => typeof name === 'string' && name.trim().length > 0);

        try {
            const resolution = resolveCurrentParent({
                state,
                candidateBodyNames,
                getBodyDataByName: this.getBodyDataByName,
                getBodyHeliocentricPositionAu: this._heliocentricPositionAu,
            });
            this._logParentTransition(resolution);
            return resolution;
        } catch (err) {
            if (!this._warnedParentResolutions.has(err.message)) {
                this._warnedParentResolutions.add(err.message);
                logger.warn(
                    `[FleetNavigation] Could not resolve the fleet's parent body: ${err.message} ` +
                        '(expected briefly during initial load, before the body registry ' +
                        'finishes populating)'
                );
            }
            return null;
        }
    }

    _logParentTransition({ parentBody, isRoot, soiKm, distanceKm }) {
        if (parentBody === this._lastLoggedParentBody) return;
        this._lastLoggedParentBody = parentBody;

        const declaredParent = parentBodyFromRuntimeState(this.fleet?.runtimeState);
        const soi = isRoot ? 'outside every candidate SOI' : `SOI ${Math.round(soiKm)} km`;
        const frameNote =
            declaredParent && declaredParent !== parentBody
                ? `; runtime state is expressed relative to ${declaredParent}`
                : '';

        logger.info(
            `[FleetNavigation] Fleet parent body: ${parentBody} ` +
                `(${soi}, ${Math.round(distanceKm)} km from its centre${frameNote})`
        );
    }

    /**
     * The fleet's parking state advanced to the given epoch.
     *
     * @param {number} epochDaysJ2000
     * @returns {{position:object, velocity:object}|null} km / km-per-second,
     *   geocentric; null when the fleet is not in a geocentric parking orbit
     */
    _parkingStateAt(epochDaysJ2000) {
        const runtimeState = this.fleet?.runtimeState;
        if (!runtimeState) return null;
        if (runtimeState.frame === REFERENCE_FRAME.HELIOCENTRIC_AU) return null;
        if (!isVector3(runtimeState.position) || !isVector3(runtimeState.velocity)) return null;

        const muKm3PerS2 = this._parentMuKm3PerS2(runtimeState);
        if (!Number.isFinite(muKm3PerS2)) return null;

        const fromEpoch = Number.isFinite(runtimeState.epochDaysJ2000)
            ? runtimeState.epochDaysJ2000
            : epochDaysJ2000;

        try {
            const propagated = propagateGeocentricState({
                position: runtimeState.position,
                velocity: runtimeState.velocity,
                fromEpochDaysJ2000: fromEpoch,
                toEpochDaysJ2000: epochDaysJ2000,
                muKm3PerS2,
            });

            if (Math.abs(epochDaysJ2000 - fromEpoch) > PARKING_REBASELINE_DAYS) {
                // In memory only: the stored snapshot stays valid either way,
                // and this would otherwise write to storage on every frame.
                this.fleet.runtimeState = {
                    ...runtimeState,
                    position: propagated.position,
                    velocity: propagated.velocity,
                    epochDaysJ2000,
                };
            }

            return propagated;
        } catch (err) {
            logger.warn(`[FleetNavigation] Could not propagate the parking orbit: ${err.message}`);
            return null;
        }
    }

    /**
     * Gravitational parameter of whichever body the current runtime state is
     * parked relative to
     * @returns {number|null}
     */
    _parentMuKm3PerS2(runtimeState) {
        if (runtimeState.frame === REFERENCE_FRAME.BODY_CENTERED_KM) {
            const parentBodyData = this.getBodyDataByName(runtimeState.parentBody);
            if (!parentBodyData) {
                this._warnMissingParentBodyOnce(runtimeState.parentBody);
                return null;
            }
            return bodyMuKm3PerS2(parentBodyData);
        }
        return this.earthMuKm3PerS2;
    }

    _warnMissingParentBodyOnce(parentBodyName) {
        if (!this._warnedMissingParentBodies) {
            this._warnedMissingParentBodies = new Set();
        }
        if (this._warnedMissingParentBodies.has(parentBodyName)) return;
        this._warnedMissingParentBodies.add(parentBodyName);
        logger.warn(
            `[FleetNavigation] Unknown parent body "${parentBodyName}" for parking state ` +
                '(expected briefly during initial load, before the body registry finishes populating)'
        );
    }

    /**
     * @returns {number|null}
     */
    _parentRadiusKm(runtimeState) {
        if (runtimeState.frame === REFERENCE_FRAME.BODY_CENTERED_KM) {
            const parentBodyData = this.getBodyDataByName(runtimeState.parentBody);
            return parentBodyData ? bodyRadiusKm(parentBodyData) : null;
        }
        return this.earthRadiusKm;
    }

    /**
     * @param {object} params
     * @param {{position:object, velocity:object}|null} params.parkingState - km, km/s
     * @param {{position:object, velocity:object}|null} params.earthState - parent body, AU / AU-per-day
     * @param {number} params.epochDaysJ2000
     * @returns {import('@navigation/TrajectoryState.js').TrajectoryState|null}
     */
    _resolveOriginTrajectoryState({ parkingState, earthState, epochDaysJ2000 }) {
        let state;
        try {
            state = resolveHeliocentricOrigin({
                runtimeState: this.fleet?.runtimeState,
                parkingState,
                parentEphemerisState: earthState,
                epochDaysJ2000,
            });
        } catch (err) {
            logger.warn(`[FleetNavigation] Could not build the departure TrajectoryState: ${err.message}`);
            return null;
        }

        if (state && Math.abs(state.epochDaysJ2000 - epochDaysJ2000) > STALE_ORIGIN_STATE_WARN_DAYS) {
            logger.warn(
                `[FleetNavigation] Departure origin is a ${state.frame} state from epoch ` +
                    `${state.epochDaysJ2000} but is being used at epoch ${epochDaysJ2000} without ` +
                    'propagation'
            );
        }

        return state;
    }

    _handleCandidateSelected(candidateId) {
        if (!this.session.isActive) return;

        let candidate;
        try {
            candidate = selectCandidate(this.candidates, candidateId);
        } catch (err) {
            logger.warn(`[FleetNavigation] ${err.message}`);
            return;
        }

        this.session.plan = candidate;
        this.panel.showFlightPlan(candidate);
        this._renderPlan('select', candidate);
    }

    _handleConfirmRequested() {
        if (!this.session.isActive) return;

        const confirmedPlan = this.session.confirm();

        this.panel.clearCandidates();
        this.panel.hideConfirmActions();
        this._applyConfirmedPlan(confirmedPlan);
    }

    _handleCancelRequested() {
        if (!this.session.isActive) return;
        this.session.cancel();
    }

    _applyConfirmedPlan(plan) {
        if (!this.fleet) return;

        this.activePlan = plan;
        this.fleet.runtimeState = beginFlight({ runtimeState: this.fleet.runtimeState, plan });

        this._persistRuntimeState();
        this._persistActivePlan();
        this._syncFleetStatus();

        this._renderPlan('confirm', plan);
        this.panel.showFlightPlan(plan);
        this.panel.showClearAction();

        this.update(this.getCurrentEpochDaysJ2000());
    }

    /**
     * @param {number} [currentEpochDaysJ2000] - defaults to the injected clock
     * @returns {boolean} true if this call completed the flight
     */
    update(currentEpochDaysJ2000 = this.getCurrentEpochDaysJ2000()) {
        if (!this.fleet) return false;

        const arrived = this._checkArrival(currentEpochDaysJ2000);

        this.marker.setPosition(this._fleetHeliocentricPosition(currentEpochDaysJ2000));
        this._refreshFleetStatusPanel(currentEpochDaysJ2000, arrived);

        return arrived;
    }

    _checkArrival(currentEpochDaysJ2000) {
        if (!this.activePlan) return false;
        if (this.fleet.runtimeState?.state !== FLEET_STATE.INFLIGHT) return false;
        if (!hasReachedArrival({ plan: this.activePlan, currentEpochDaysJ2000 })) return false;

        let parked;
        try {
            parked = completeFlight({
                runtimeState: this.fleet.runtimeState,
                plan: this.activePlan,
            });
        } catch (err) {
            logger.warn(`[FleetNavigation] Could not park fleet on arrival: ${err.message}`);
            return false;
        }

        this.fleet.runtimeState = {
            ...parked,
            epochDaysJ2000: this.activePlan.arrivalEpochDaysJ2000,
        };

        this._persistRuntimeState();
        this._syncFleetStatus();

        logger.info(
            `[FleetNavigation] Fleet arrived at ${this.activePlan.target?.bodyName ?? 'target'} ` +
                `(epoch ${this.activePlan.arrivalEpochDaysJ2000})`
        );
        
        this.activePlan = null;
        this.renderer.clear();
        this.panel.clearFlightPlan();
        this.panel.hideClearAction();
        this._clearPersistedPlan();
        
        return true;
    }

    /**
     * Where the fleet is right now, in heliocentric AU.
     * @param {number} epochDaysJ2000
     * @returns {{x:number,y:number,z:number}|null}
     */
    _fleetHeliocentricPosition(epochDaysJ2000) {
        const runtimeState = this.fleet?.runtimeState;
        if (!runtimeState) return null;

        if (runtimeState.state === FLEET_STATE.INFLIGHT && this.activePlan) {
            const alongPlan = positionAlongPlan({
                plan: this.activePlan,
                currentEpochDaysJ2000: epochDaysJ2000,
            });
            if (alongPlan) return alongPlan;
        }

        if (runtimeState.frame === REFERENCE_FRAME.HELIOCENTRIC_AU) {
            return isVector3(runtimeState.position) ? { ...runtimeState.position } : null;
        }

        const parentName = parentBodyFromRuntimeState(runtimeState);
        const parentBodyData = parentName ? this.getBodyDataByName(parentName) : null;

        const parkingState = this._parkingStateAt(epochDaysJ2000);
        if (!parkingState || !parentBodyData) return null;

        return geocentricToHeliocentric({
            position: parkingState.position,
            velocity: parkingState.velocity,
            earthState: { position: EphemerisAdapter.getPosition(parentBodyData, epochDaysJ2000) },
        }).position;
    }

    _handleClearRequested() {
        if (this.session.isActive) {
            this.session.cancel();
            return;
        }

        const epochDaysJ2000 = this.getCurrentEpochDaysJ2000();
        const wasInFlight = this.fleet?.runtimeState?.state === FLEET_STATE.INFLIGHT;
        const abortSample = wasInFlight ? this._sampleAlongActivePlan(epochDaysJ2000) : null;

        this.activePlan = null;

        this.renderer.clear();
        this.panel.clearFlightPlan();
        this.panel.clearCandidates();
        this.panel.hideClearAction();
        this.panel.clearNotice();

        if (!this.fleet) return;

        const released = releasePlan({ runtimeState: this.fleet.runtimeState });

        this.fleet.runtimeState = abortSample
            ? {
                  ...released,
                  position: { ...abortSample.position },
                  velocity: { ...abortSample.velocity },
                  frame: REFERENCE_FRAME.HELIOCENTRIC_AU,
                  epochDaysJ2000,
              }
            : released;

        this._persistRuntimeState();
        this._clearPersistedPlan();
        this._syncFleetStatus();
        this.update(epochDaysJ2000);
    }

    /**
     * Nearest trajectory sample (position + velocity) at the given epoch.
     * @returns {{position:object, velocity:object}|null}
     */
    _sampleAlongActivePlan(epochDaysJ2000) {
        const samples = this.activePlan?.trajectorySamples;
        if (!Array.isArray(samples) || samples.length === 0) return null;

        const departure = this.activePlan.departureEpochDaysJ2000;
        const arrival = this.activePlan.arrivalEpochDaysJ2000;
        if (!Number.isFinite(departure) || !Number.isFinite(arrival) || arrival <= departure) {
            return null;
        }

        const fraction = Math.min(
            1,
            Math.max(0, (epochDaysJ2000 - departure) / (arrival - departure))
        );
        const sample = samples[Math.round(fraction * (samples.length - 1))];

        if (!isVector3(sample?.position) || !isVector3(sample?.velocity)) return null;
        return { position: sample.position, velocity: sample.velocity };
    }

    _handleFocusFleetRequested() {
        const scenePosition = this.marker.getScenePosition();
        if (!scenePosition) {
            logger.warn('[FleetNavigation] Fleet position is not available to focus on');
            return;
        }
        if (this.onFocusFleetRequested) this.onFocusFleetRequested(scenePosition);
    }

    /** @returns {{x:number,y:number,z:number}|null} scene-space fleet position */
    getFleetScenePosition() {
        return this.marker.getScenePosition();
    }

    _refreshFleetStatusPanel(epochDaysJ2000, force = false) {
        if (!this.fleetPanel || !this.fleet) return;

        const now = Date.now();
        if (!force && now - this._lastStatusRefreshMs < STATUS_REFRESH_INTERVAL_MS) return;
        this._lastStatusRefreshMs = now;

        const runtimeState = this.fleet.runtimeState ?? {};

        this.fleetPanel.setFleets([
            { id: this.fleet.id, name: this.fleet.name, state: runtimeState.state },
        ]);

        const status = {
            id: this.fleet.id,
            name: this.fleet.name,
            state: runtimeState.state,
            targetName: runtimeState.target?.bodyName ?? null,
            fuelRemaining: runtimeState.fuelRemaining,
            altitudeKm: null,
            distanceFromSunAu: null,
            daysToArrival: null,
            parentBody: null,
            parentSoiKm: null,
        };

        if (runtimeState.state === FLEET_STATE.INFLIGHT && this.activePlan) {
            status.daysToArrival = Math.max(
                0,
                this.activePlan.arrivalEpochDaysJ2000 - epochDaysJ2000
            );
        }

        const parkingState = this._parkingStateAt(epochDaysJ2000);
        if (parkingState) {
            const parentRadiusKm = this._parentRadiusKm(runtimeState);
            if (Number.isFinite(parentRadiusKm)) {
                status.altitudeKm = magnitude(parkingState.position) - parentRadiusKm;
            }
        }

        const heliocentric = this.marker.position;
        if (heliocentric) {
            status.distanceFromSunAu = magnitude(heliocentric);
        }

        const parent = this._resolveFleetParent(epochDaysJ2000, { parkingState });
        if (parent) {
            status.parentBody = parent.parentBody;
            status.parentSoiKm = Number.isFinite(parent.soiKm) ? parent.soiKm : null;
        }

        this.fleetPanel.setStatus(status);
    }

    dispose() {
        this.renderer.dispose();
        this.marker.dispose();
        this.panel.destroy();
        this.fleetPanel?.destroy();
    }

    _persistRuntimeState() {
        if (!this.fleet) return;
        this.runtimeStore.save(this.fleet.id, this.fleet.runtimeState);
    }

    _persistActivePlan() {
        if (!this.fleet || !this.activePlan) return;
        if (typeof this.runtimeStore.saveActivePlan !== 'function') return;
        this.runtimeStore.saveActivePlan(this.fleet.id, this.activePlan);
    }

    _clearPersistedPlan() {
        if (!this.fleet) return;
        if (typeof this.runtimeStore.clearActivePlan !== 'function') return;
        this.runtimeStore.clearActivePlan(this.fleet.id);
    }

    _syncFleetStatus() {
        if (!this.fleet) return;
        this.panel.setFleet({
            id: this.fleet.id,
            name: this.fleet.name,
            state: this.fleet.runtimeState?.state,
        });
        this.panel.setConfirmedTarget(this.fleet.runtimeState?.target?.bodyName ?? null);
        this._refreshFleetStatusPanel(this.getCurrentEpochDaysJ2000(), true);
    }
}