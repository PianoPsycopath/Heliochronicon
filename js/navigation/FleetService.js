// js/navigation/FleetService.js

import { Fleet } from '@navigation/Fleet.js';
import { FleetRepository } from '@navigation/FleetRepository.js';
import { FleetRuntimeStore } from '@navigation/FleetRuntimeStore.js';
import {
    createDefaultRuntimeState,
    resolveDefaultAltitudeKm,
} from '@navigation/DefaultFleetState.js';

export class FleetService {
    /**
     * @param {object} params
     * @param {string} [params.dataUrl] 
     * @param {FleetRuntimeStore} [params.store] 
     * @param {number} params.earthRadiusKm 
     * @param {number} [params.fallbackAltitudeKm] 
     * @param {number|null} [params.earthMuKm3PerS2]
     * @returns {Promise<object>}
     */
    static async loadFleetWithState({
        dataUrl,
        store = new FleetRuntimeStore(),
        earthRadiusKm,
        fallbackAltitudeKm,
        earthMuKm3PerS2 = null,
    } = {}) {
        const rawFleetData = await FleetRepository.fetchFleetData(dataUrl);
        const fleet = Fleet.create(rawFleetData);

        const persisted = store.load(fleet.id);

        if (persisted) {
            return { ...fleet, runtimeState: persisted };
        }

        const altitudeKm = resolveDefaultAltitudeKm(rawFleetData) ?? fallbackAltitudeKm;
        const runtimeState = createDefaultRuntimeState({
            fleet,
            earthRadiusKm,
            altitudeKm,
            earthMuKm3PerS2,
        });

        store.save(fleet.id, runtimeState);

        return { ...fleet, runtimeState };
    }
}
