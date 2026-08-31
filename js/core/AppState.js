// js/AppState.js
import * as THREE from 'three';

const VALID_ASTEROID_DISPLAY_MODES = new Set(['particles', 'shapes', 'both']);
const VALID_BOOT_PHASES = new Set(['booting', 'flipping', 'complete']);

export class AppState {
    constructor() {
        this._systemDate = new Date();
        this._currentTargetData = null;
        this._trackingTargetData = null;
        this._previewTargetData = null;
        this._activeDatasets = new Set();
        this._inFlightDatasets = new Set();
        this._currentOrigin = new THREE.Vector3(0, 0, 0);
        this._lookupInFlight = false;
        this._asteroidDisplayMode = 'shapes';
        this._bootPhase = 'booting';
    }

    // -------------------------------------------------------------------------
    // Simulation / targeting state
    // -------------------------------------------------------------------------

    get systemDate() {
        return this._systemDate;
    }

    set systemDate(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
            throw new TypeError('AppState.systemDate must be a valid Date');
        }
        this._systemDate = date;
    }

    get currentTargetData() {
        return this._currentTargetData;
    }

    set currentTargetData(data) {
        this._currentTargetData = data;
    }

    get trackingTargetData() {
        return this._trackingTargetData;
    }

    set trackingTargetData(data) {
        this._trackingTargetData = data;
    }

    get previewTargetData() {
        return this._previewTargetData;
    }

    set previewTargetData(data) {
        this._previewTargetData = data;
    }

    // -------------------------------------------------------------------------
    // Floating-origin state
    // -------------------------------------------------------------------------

    get currentOrigin() {
        return this._currentOrigin;
    }

    setCurrentOrigin(origin) {
        if (
            !origin ||
            typeof origin.x !== 'number' ||
            typeof origin.y !== 'number' ||
            typeof origin.z !== 'number'
        ) {
            throw new TypeError(
                'AppState.setCurrentOrigin expects a THREE.Vector3-compatible object'
            );
        }

        this._currentOrigin.copy(origin);
    }

    setCurrentOriginValues(x, y, z) {
        this._currentOrigin.set(x, y, z);
    }

    // -------------------------------------------------------------------------
    // Active dataset state
    // -------------------------------------------------------------------------

    addActiveDataset(name) {
        this._activeDatasets.add(name);
    }

    removeActiveDataset(name) {
        this._activeDatasets.delete(name);
    }

    hasActiveDataset(name) {
        return this._activeDatasets.has(name);
    }

    getActiveDatasets() {
        return Array.from(this._activeDatasets);
    }

    clearActiveDatasets() {
        this._activeDatasets.clear();
    }

    // -------------------------------------------------------------------------
    // In-flight dataset state
    // -------------------------------------------------------------------------

    addInFlightDataset(name) {
        this._inFlightDatasets.add(name);
    }

    removeInFlightDataset(name) {
        this._inFlightDatasets.delete(name);
    }

    hasInFlightDataset(name) {
        return this._inFlightDatasets.has(name);
    }

    getInFlightDatasets() {
        return Array.from(this._inFlightDatasets);
    }

    clearInFlightDatasets() {
        this._inFlightDatasets.clear();
    }

    get lookupInFlight() {
        return this._lookupInFlight;
    }

    set lookupInFlight(value) {
        this._lookupInFlight = Boolean(value);
    }
    // -------------------------------------------------------------------------
    // Asteroid Display State
    // -------------------------------------------------------------------------
    get asteroidDisplayMode() {
        return this._asteroidDisplayMode;
    }

    set asteroidDisplayMode(mode) {
        if (!VALID_ASTEROID_DISPLAY_MODES.has(mode)) {
            throw new TypeError(`Invalid asteroid display mode: ${mode}`);
        }

        this._asteroidDisplayMode = mode;
    }

    // -------------------------------------------------------------------------
    // Boot Sequence State
    // -------------------------------------------------------------------------
    // 'booting'  -> UI hidden, MAGI triad shown upside down, camera pinned to
    //               deep-space zoom, waiting on the dataset loader.
    // 'flipping' -> triad flipping upright, camera zooming in, panels extending.
    // 'complete' -> boot overlay dismissed, app fully interactive.
    get bootPhase() {
        return this._bootPhase;
    }

    set bootPhase(phase) {
        if (!VALID_BOOT_PHASES.has(phase)) {
            throw new TypeError(`Invalid boot phase: ${phase}`);
        }

        this._bootPhase = phase;
    }

    get isBooting() {
        return this._bootPhase !== 'complete';
    }
}