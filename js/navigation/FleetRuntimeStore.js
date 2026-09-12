// js/navigation/FleetRuntimeStore.js

import { StorageManager } from '@core/storage.js';

const RUNTIME_STATE_KEY_PREFIX = 'heliochronicon_fleetRuntimeState_';

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
     * Remove any persisted runtime overlay for a fleet.
     * @param {string} fleetId
     */
    clear(fleetId) {
        this.storage.remove(FleetRuntimeStore.keyFor(fleetId));
    }
}
