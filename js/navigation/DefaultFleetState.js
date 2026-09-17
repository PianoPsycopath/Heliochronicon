// js/navigation/DefaultFleetState.js

export const FLEET_STATE = Object.freeze({
    PARKED: 'parked',
    INFLIGHT: 'inflight',
    BURN: 'burn',
    PLANNING: 'planning',
});


export const REFERENCE_FRAME = Object.freeze({
    EARTH_CENTERED_KM: 'earth-centered-km',
    BODY_CENTERED_KM: 'body-centered-km',
    HELIOCENTRIC_AU: 'heliocentric-au',
});

/**
 * @param {object} fleet
 * @returns {number}
 */
export function totalFuelVolume(fleet) {
    if (!fleet || !Array.isArray(fleet.ships) || fleet.ships.length === 0) {
        throw new Error('totalFuelVolume requires a fleet with at least one ship');
    }
    return fleet.ships.reduce((sum, ship) => sum + ship.fuelVolume, 0);
}

/**
 * @param {object} fleetData
 * @returns {number|null}
 */
export function resolveDefaultAltitudeKm(fleetData) {
    const altitude = fleetData?.defaultOrbit?.altitudeKm;
    return typeof altitude === 'number' && !Number.isNaN(altitude) ? altitude : null;
}

/**
 * @param {object} params
 * @param {object} params.fleet
 * @param {number} params.earthRadiusKm 
 * @param {number} params.altitudeKm 
 * @param {number|null} [params.earthMuKm3PerS2] 
 * @param {number|null} [params.epochDaysJ2000]
 * @returns {object} 
 */
export function createDefaultRuntimeState({
    fleet,
    earthRadiusKm,
    altitudeKm,
    earthMuKm3PerS2 = null,
    epochDaysJ2000 = null,
}) {
    if (typeof earthRadiusKm !== 'number' || Number.isNaN(earthRadiusKm)) {
        throw new Error('createDefaultRuntimeState requires a numeric earthRadiusKm');
    }
    if (typeof altitudeKm !== 'number' || Number.isNaN(altitudeKm)) {
        throw new Error('createDefaultRuntimeState requires a numeric altitudeKm');
    }

    const r = earthRadiusKm + altitudeKm;

    const position = { x: r, y: 0, z: 0 };

    const velocity =
        typeof earthMuKm3PerS2 === 'number' && !Number.isNaN(earthMuKm3PerS2)
            ? { x: 0, y: 0, z: -Math.sqrt(earthMuKm3PerS2 / r) }
            : { x: 0, y: 0, z: 0 };

    return {
        fuelRemaining: totalFuelVolume(fleet),
        position,
        velocity,
        frame: REFERENCE_FRAME.EARTH_CENTERED_KM,
        epochDaysJ2000,
        target: null,
        state: FLEET_STATE.PARKED,
    };
}