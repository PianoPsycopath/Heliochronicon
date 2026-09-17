// js/navigation/FleetRuntimeStore.js

import { StorageManager } from '@core/storage.js';

const RUNTIME_STATE_KEY_PREFIX = 'heliochronicon_fleetRuntimeState_';
const ACTIVE_PLAN_KEY_PREFIX = 'heliochronicon_fleetActivePlan_';

export class FleetRuntimeStore {
    /**
     * @param {StorageManager} [storage]
     */
    constructor(storage = new StorageManager()) {
        this.storage = storage;
    }

    /**
     * @param {string} fleetId
     * @returns {string} 
     */
    static keyFor(fleetId) {
        if (!fleetId || typeof fleetId !== 'string') {
            throw new Error('FleetRuntimeStore requires a string fleetId');
        }
        return `${RUNTIME_STATE_KEY_PREFIX}${fleetId}`;
    }

    /**
     * @param {string} fleetId
     * @returns {string}
     */
    static planKeyFor(fleetId) {
        if (!fleetId || typeof fleetId !== 'string') {
            throw new Error('FleetRuntimeStore requires a string fleetId');
        }
        return `${ACTIVE_PLAN_KEY_PREFIX}${fleetId}`;
    }

    /**
     * @param {string} fleetId
     * @param {object} runtimeState - { fuelRemaining, position, velocity, target, state }
     */
    save(fleetId, runtimeState) {
        this.storage.set(FleetRuntimeStore.keyFor(fleetId), runtimeState);
    }

    /**
     * @param {string} fleetId
     * @returns {object|null}
     */
    load(fleetId) {
        return this.storage.get(FleetRuntimeStore.keyFor(fleetId), null);
    }

    /**
     * @param {string} fleetId
     * @param {object} plan - the confirmed FlightPlan currently being flown
     */
    saveActivePlan(fleetId, plan) {
        this.storage.set(FleetRuntimeStore.planKeyFor(fleetId), plan);
    }

    /**
     * @param {string} fleetId
     * @returns {object|null}
     */
    loadActivePlan(fleetId) {
        return this.storage.get(FleetRuntimeStore.planKeyFor(fleetId), null);
    }

    /**
     * @param {string} fleetId
     */
    clearActivePlan(fleetId) {
        this.storage.remove(FleetRuntimeStore.planKeyFor(fleetId));
    }

    /**
     * Remove any persisted runtime overlay for a fleet, including its plan.
     * @param {string} fleetId
     */
    clear(fleetId) {
        this.storage.remove(FleetRuntimeStore.keyFor(fleetId));
        this.clearActivePlan(fleetId);
    }
}