// js/main/FleetNavigationController.js

import { FleetService } from '@navigation/FleetService.js';
import { FleetRuntimeStore } from '@navigation/FleetRuntimeStore.js';
import { PlanningSession } from '@navigation/PlanningSession.js';
import { Target } from '@navigation/Target.js';
import { searchTransferCandidates, selectCandidate } from '@navigation/CandidateSearch.js';
import { EphemerisAdapter } from '@navigation/EphemerisAdapter.js';
import { FlightPlanningPanel } from '@ui/FlightPlanningPanel.js';
import { FlightPlanRenderer } from '@rendering/FlightPlanRenderer.js';
import { logger } from '@core/logger.js';
import { AU_IN_KM } from '@core/constants.js';

const DEFAULT_TRANSFER_MODE = 'time';
const DEFAULT_FLEET_DATA_URL = 'data/fleets/userfleet.json';

const TRAJECTORY_RENDER_SAMPLES = 60;

const SECONDS_PER_DAY = 86400;

function isVector3(v) {
    return !!v && typeof v.x === 'number' && typeof v.y === 'number' && typeof v.z === 'number';
}

export class FleetNavigationController {
    /**
     * @param {object} ctx
     * @param {import('three').Scene} ctx.scene
     * @param {import('three').Camera} ctx.camera
     * @param {import('three').WebGLRenderer} ctx.webglRenderer 
     * @param {{pauseForPlanning: Function, resumeFromPlanning: Function}} ctx.timeController
     * @param {HTMLElement} ctx.panelContainer
     * @param {(name: string) => object|null} ctx.getBodyDataByName
     * @param {() => number} ctx.getCurrentEpochDaysJ2000
     * @param {() => {x:number,y:number,z:number}} ctx.getCurrentOrigin
     * @param {number} ctx.mu
     * @param {number} ctx.earthRadiusKm - existing shared Earth radius constant.
     * @param {number} ctx.earthMuKm3PerS2 - existing shared Earth mu constant.
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
        getBodyDataByName,
        getCurrentEpochDaysJ2000,
        getCurrentOrigin,
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
        this.mu = mu;
        this.earthRadiusKm = earthRadiusKm;
        this.earthMuKm3PerS2 = earthMuKm3PerS2;
        this.fallbackAltitudeKm = fallbackAltitudeKm;
        this.fleetDataUrl = fleetDataUrl;
        this.runtimeStore = runtimeStore;

        this.fleet = null;
        this.candidates = [];

        this.panel = new FlightPlanningPanel({ container: panelContainer });
        this.renderer = new FlightPlanRenderer({ scene, camera, renderer: webglRenderer, getCurrentOrigin });

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
    }

    async initialize() {
        this.fleet = await FleetService.loadFleetWithState({
            dataUrl: this.fleetDataUrl,
            store: this.runtimeStore,
            earthRadiusKm: this.earthRadiusKm,
            fallbackAltitudeKm: this.fallbackAltitudeKm,
            earthMuKm3PerS2: this.earthMuKm3PerS2,
        });

        this._syncFleetStatus();
    }

    _searchAndPublishCandidates(transferParams) {
        const candidates = searchTransferCandidates(transferParams);
        this.candidates = candidates;
        this.panel.showCandidates(candidates);

        return candidates[0];
    }

    _handleCalculateRequested({ targetName }) {
        if (!this.fleet) return;

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

        const originBodyData = this.getBodyDataByName('EARTH');
        const target = Target.create({ bodyName: targetBodyData.name });
        const currentEpochDaysJ2000 = this.getCurrentEpochDaysJ2000();

        const solverFleet = {
            ...this.fleet,
            fuelRemaining: this.fleet.runtimeState?.fuelRemaining,
            ...this._resolveHeliocentricOriginState({
                originBodyData,
                departureEpochDaysJ2000: currentEpochDaysJ2000,
            }),
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
        };

        try {
            const provisionalPlan = this.session.start(transferParams);
            this.panel.setTarget(normalizedName);
            this.panel.showFlightPlan(provisionalPlan);
            this.renderer.setPlan(provisionalPlan);
            this.panel.showConfirmActions();
            this._syncFleetStatus();
        } catch (err) {
            logger.warn(`[FleetNavigation] No transfer candidates for "${normalizedName}": ${err.message}`);
            this.panel.clearCandidates();
            this.panel.clearFlightPlan();
            this.panel.hideConfirmActions();
        }
    }

    /**
     * @param {object} params
     * @param {object} [params.originBodyData] - Earth's raw ephemeris data
     * @param {number} params.departureEpochDaysJ2000
     * @returns {{position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}}}
     */
    _resolveHeliocentricOriginState({ originBodyData, departureEpochDaysJ2000 }) {
        const leoPosition = this.fleet.runtimeState?.position;
        const leoVelocity = this.fleet.runtimeState?.velocity;

        if (!originBodyData || !isVector3(leoPosition) || !isVector3(leoVelocity)) {

            return {};
        }

        const earthState = EphemerisAdapter.getState(originBodyData, departureEpochDaysJ2000);

        return {
            position: {
                x: earthState.position.x + leoPosition.x / AU_IN_KM,
                y: earthState.position.y + leoPosition.y / AU_IN_KM,
                z: earthState.position.z + leoPosition.z / AU_IN_KM,
            },
            velocity: {
                x: earthState.velocity.x + (leoVelocity.x * SECONDS_PER_DAY) / AU_IN_KM,
                y: earthState.velocity.y + (leoVelocity.y * SECONDS_PER_DAY) / AU_IN_KM,
                z: earthState.velocity.z + (leoVelocity.z * SECONDS_PER_DAY) / AU_IN_KM,
            },
        };
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
        this.renderer.setPlan(candidate);
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
        this.fleet.runtimeState = {
            ...this.fleet.runtimeState,
            target: plan.target ?? this.fleet.runtimeState.target,
        };

        this.runtimeStore.save(this.fleet.id, this.fleet.runtimeState);
        this._syncFleetStatus();
    }

    _syncFleetStatus() {
        if (!this.fleet) return;
        this.panel.setFleet({
            id: this.fleet.id,
            name: this.fleet.name,
            state: this.fleet.runtimeState?.state,
        });
        this.panel.setConfirmedTarget(this.fleet.runtimeState?.target?.bodyName ?? null);
    }
}