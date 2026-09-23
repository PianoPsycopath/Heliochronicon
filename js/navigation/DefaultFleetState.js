// js/navigation/DefaultFleetState.js

import { stateVectorFromKeplerianElements } from '@navigation/KeplerianElements.js';

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
 * @param {object} fleetData
 * @returns {{
 *   epochDaysJ2000: number,
 *   parentBody: string,
 *   aKm: number,
 *   e: number,
 *   iRad: number,
 *   raanRad: number,
 *   argPeriapsisRad: number,
 *   meanAnomalyRad: number,
 * }|null}
 */
export function resolveDefaultOrbit(fleetData) {
    const orbit = fleetData?.defaultOrbit;
    if (!orbit || typeof orbit !== 'object') return null;
    if (typeof orbit.parentBody !== 'string' || orbit.parentBody.trim().length === 0) return null;
    if (typeof orbit.aKm !== 'number' || !Number.isFinite(orbit.aKm)) return null;

    const numeric = (value, fallback) =>
        typeof value === 'number' && Number.isFinite(value) ? value : fallback;

    return {
        epochDaysJ2000: numeric(orbit.epochDaysJ2000, 0),
        parentBody: orbit.parentBody,
        aKm: orbit.aKm,
        e: numeric(orbit.e, 0),
        iRad: numeric(orbit.iRad, 0),
        raanRad: numeric(orbit.raanRad, 0),
        argPeriapsisRad: numeric(orbit.argPeriapsisRad, 0),
        meanAnomalyRad: numeric(orbit.meanAnomalyRad, 0),
    };
}

/**
 * @param {object} params
 * @param {object} params.fleet
 * @param {ReturnType<typeof resolveDefaultOrbit>} params.orbit
 * @param {number} params.muKm3PerS2 - orbit.parentBody's gravitational parameter
 * @returns {object} runtime state
 */
export function createRuntimeStateFromOrbitalElements({ fleet, orbit, muKm3PerS2 }) {
    if (!orbit || typeof orbit !== 'object') {
        throw new Error('createRuntimeStateFromOrbitalElements requires an "orbit" contract');
    }

    const { position, velocity } = stateVectorFromKeplerianElements({
        aKm: orbit.aKm,
        e: orbit.e,
        iRad: orbit.iRad,
        raanRad: orbit.raanRad,
        argPeriapsisRad: orbit.argPeriapsisRad,
        meanAnomalyRad: orbit.meanAnomalyRad,
        muKm3PerS2,
    });

    return {
        fuelRemaining: totalFuelVolume(fleet),
        position,
        velocity,
        frame: REFERENCE_FRAME.BODY_CENTERED_KM,
        parentBody: orbit.parentBody,
        epochDaysJ2000: orbit.epochDaysJ2000,
        target: null,
        state: FLEET_STATE.PARKED,
    };
}

/**
 * @deprecated Use `resolveDefaultOrbit` instead. Kept for legacy compatibility.
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