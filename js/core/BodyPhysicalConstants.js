// js/core/BodyPhysicalConstants.js

import { AU_IN_KM } from '@core/constants.js';

const GRAVITATIONAL_CONSTANT_KM3_PER_KG_S2 = 6.674e-20; // G, in km^3 kg^-1 s^-2
const MASS_UNIT_KG = 1e24; // bodyData.mass is expressed in units of this

/**
 * @param {object} bodyData - processed body data (see PlanetaryDataProcessor)
 * @returns {number} gravitational parameter, km^3/s^2
 */
export function bodyMuKm3PerS2(bodyData) {
    if (!bodyData || typeof bodyData.mass !== 'number' || !Number.isFinite(bodyData.mass)) {
        throw new Error('bodyMuKm3PerS2 requires bodyData.mass (units of 1e24 kg)');
    }
    return GRAVITATIONAL_CONSTANT_KM3_PER_KG_S2 * bodyData.mass * MASS_UNIT_KG;
}

/**
 * @param {object} bodyData - processed body data (see PlanetaryDataProcessor)
 * @returns {number} physical radius, km
 */
export function bodyRadiusKm(bodyData) {
    if (!bodyData || typeof bodyData.radius_km !== 'number' || !Number.isFinite(bodyData.radius_km)) {
        throw new Error('bodyRadiusKm requires bodyData.radius_km');
    }
    return bodyData.radius_km;
}

/**
 * @param {object} bodyData - processed body data (see PlanetaryDataProcessor)
 * @returns {number} semi-major axis about the parent, km
 */
export function bodySemiMajorAxisKm(bodyData) {
    if (
        !bodyData ||
        typeof bodyData.a !== 'number' ||
        !Number.isFinite(bodyData.a) ||
        bodyData.a <= 0
    ) {
        throw new Error('bodySemiMajorAxisKm requires a positive bodyData.a (AU)');
    }
    return bodyData.a * AU_IN_KM;
}

/**
 * @param {object} params
 * @param {number} params.semiMajorAxisKm 
 * @param {object} params.bodyData - the body whose SOI is being computed
 * @param {object} params.primaryBodyData - the body it orbits (the Sun, for
 *   a planet; the planet, for a moon)
 * @returns {number} sphere-of-influence radius, km
 */
export function sphereOfInfluenceKm({ semiMajorAxisKm, bodyData, primaryBodyData }) {
    if (!Number.isFinite(semiMajorAxisKm) || semiMajorAxisKm <= 0) {
        throw new Error('sphereOfInfluenceKm requires a positive "semiMajorAxisKm"');
    }
    if (!bodyData || typeof bodyData.mass !== 'number' || !Number.isFinite(bodyData.mass)) {
        throw new Error('sphereOfInfluenceKm requires bodyData.mass');
    }
    if (
        !primaryBodyData ||
        typeof primaryBodyData.mass !== 'number' ||
        !Number.isFinite(primaryBodyData.mass) ||
        primaryBodyData.mass <= 0
    ) {
        throw new Error('sphereOfInfluenceKm requires primaryBodyData.mass');
    }

    const massRatio = bodyData.mass / primaryBodyData.mass;
    return semiMajorAxisKm * Math.pow(massRatio, 2 / 5);
}