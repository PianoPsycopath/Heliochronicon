// js/navigation/FleetService.js

import { Fleet } from '@navigation/Fleet.js';
import { FleetRepository } from '@navigation/FleetRepository.js';
import { FleetRuntimeStore } from '@navigation/FleetRuntimeStore.js';
import {
    createDefaultRuntimeState,
    createRuntimeStateFromOrbitalElements,
    resolveDefaultAltitudeKm,
    resolveDefaultOrbit,
} from '@navigation/DefaultFleetState.js';
import { bodyMuKm3PerS2 } from '@core/BodyPhysicalConstants.js';

export class FleetService {
    /**
     * @param {object} params
     * @param {string} [params.dataUrl]
     * @param {FleetRuntimeStore} [params.store]
     * @param {(name: string) => object|null} [params.getBodyDataByName]
     * @param {number} [params.earthRadiusKm] - legacy fallback only
     * @param {number} [params.fallbackAltitudeKm] - legacy fallback only
     * @param {number|null} [params.earthMuKm3PerS2] - legacy fallback only
     * @returns {Promise<object>}
     */
    static async loadFleetWithState({
        dataUrl,
        store = new FleetRuntimeStore(),
        getBodyDataByName = null,
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

        const runtimeState = FleetService._buildDefaultRuntimeState({
            fleet,
            rawFleetData,
            getBodyDataByName,
            earthRadiusKm,
            fallbackAltitudeKm,
            earthMuKm3PerS2,
        });

        store.save(fleet.id, runtimeState);

        return { ...fleet, runtimeState };
    }

    static _buildDefaultRuntimeState({
        fleet,
        rawFleetData,
        getBodyDataByName,
        earthRadiusKm,
        fallbackAltitudeKm,
        earthMuKm3PerS2,
    }) {
        const orbit = resolveDefaultOrbit(rawFleetData);

        if (orbit && typeof getBodyDataByName === 'function') {
            const parentBodyData = getBodyDataByName(orbit.parentBody);
            if (parentBodyData) {
                return createRuntimeStateFromOrbitalElements({
                    fleet,
                    orbit,
                    muKm3PerS2: bodyMuKm3PerS2(parentBodyData),
                });
            }
        }

        const altitudeKm = resolveDefaultAltitudeKm(rawFleetData) ?? fallbackAltitudeKm;
        return createDefaultRuntimeState({
            fleet,
            earthRadiusKm,
            altitudeKm,
            earthMuKm3PerS2,
        });
    }
}