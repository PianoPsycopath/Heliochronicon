// js/navigation/FleetPropagator.js

import { LambertSolver } from '@navigation/LambertSolver.js';
import { AU_IN_KM } from '@core/constants.js';

export const SECONDS_PER_DAY = 86400;

export const AU_PER_DAY_IN_KM_PER_S = AU_IN_KM / SECONDS_PER_DAY;

function isVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function requireVector3(v, label) {
    if (!isVector3(v)) {
        throw new Error(`FleetPropagator requires "${label}" to be a finite { x, y, z } vector`);
    }
}

function requireFiniteNumber(value, label) {
    if (!Number.isFinite(value)) {
        throw new Error(`FleetPropagator requires a numeric "${label}"`);
    }
}

function magnitude(v) {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/**
 * @param {object} params
 * @param {{x:number,y:number,z:number}} params.position - km
 * @param {{x:number,y:number,z:number}} params.velocity - km/s
 * @param {number} params.fromEpochDaysJ2000 - the epoch the state was true at
 * @param {number} params.toEpochDaysJ2000
 * @param {number} params.muKm3PerS2 - Earth's gravitational parameter
 * @returns {{position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}}}
 */
export function propagateGeocentricState({
    position,
    velocity,
    fromEpochDaysJ2000,
    toEpochDaysJ2000,
    muKm3PerS2,
}) {
    requireVector3(position, 'position');
    requireVector3(velocity, 'velocity');
    requireFiniteNumber(fromEpochDaysJ2000, 'fromEpochDaysJ2000');
    requireFiniteNumber(toEpochDaysJ2000, 'toEpochDaysJ2000');
    requireFiniteNumber(muKm3PerS2, 'muKm3PerS2');

    const elapsedSeconds = (toEpochDaysJ2000 - fromEpochDaysJ2000) * SECONDS_PER_DAY;

    if (elapsedSeconds === 0) {
        return { position: { ...position }, velocity: { ...velocity } };
    }

    if (magnitude(velocity) === 0) {
        return { position: { ...position }, velocity: { ...velocity } };
    }

    return LambertSolver.propagate({
        r0: position,
        v0: velocity,
        tof: elapsedSeconds,
        mu: muKm3PerS2,
    });
}

/**
 * @param {number} radiusKm
 * @param {number} muKm3PerS2
 * @returns {number} radians per second
 */
export function meanMotionRadPerSecond(radiusKm, muKm3PerS2) {
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) {
        throw new Error('FleetPropagator requires a positive "radiusKm"');
    }
    requireFiniteNumber(muKm3PerS2, 'muKm3PerS2');
    return Math.sqrt(muKm3PerS2 / (radiusKm * radiusKm * radiusKm));
}

/**
 * @param {number} radiusKm
 * @param {number} muKm3PerS2
 * @returns {number} orbital period in seconds
 */
export function orbitalPeriodSeconds(radiusKm, muKm3PerS2) {
    return (2 * Math.PI) / meanMotionRadPerSecond(radiusKm, muKm3PerS2);
}

/**
 * @param {object} params
 * @param {{x:number,y:number,z:number}} params.position - km, geocentric
 * @param {{x:number,y:number,z:number}} params.velocity - km/s, geocentric
 * @param {{position:object, velocity?:object}} params.earthState - AU / AU-per-day
 * @returns {{position:{x:number,y:number,z:number}, velocity:{x:number,y:number,z:number}}}
 */
export function geocentricToHeliocentric({ position, velocity, earthState }) {
    requireVector3(position, 'position');
    requireVector3(velocity, 'velocity');
    if (!earthState || !isVector3(earthState.position)) {
        throw new Error('FleetPropagator requires an "earthState" with a position vector');
    }

    const earthVelocity = isVector3(earthState.velocity)
        ? earthState.velocity
        : { x: 0, y: 0, z: 0 };

    return {
        position: {
            x: earthState.position.x + position.x / AU_IN_KM,
            y: earthState.position.y + position.y / AU_IN_KM,
            z: earthState.position.z + position.z / AU_IN_KM,
        },
        velocity: {
            x: earthVelocity.x + velocity.x / AU_PER_DAY_IN_KM_PER_S,
            y: earthVelocity.y + velocity.y / AU_PER_DAY_IN_KM_PER_S,
            z: earthVelocity.z + velocity.z / AU_PER_DAY_IN_KM_PER_S,
        },
    };
}

/**
 * @param {object} params
 * @param {object} params.plan - active FlightPlan with trajectorySamples
 * @param {number} params.currentEpochDaysJ2000
 * @returns {{x:number,y:number,z:number}|null} heliocentric AU, or null when the
 *   plan carries no usable samples
 */
export function positionAlongPlan({ plan, currentEpochDaysJ2000 }) {
    const samples = plan?.trajectorySamples;
    if (!Array.isArray(samples) || samples.length === 0) return null;
    if (!Number.isFinite(currentEpochDaysJ2000)) return null;

    const departure = plan.departureEpochDaysJ2000;
    const arrival = plan.arrivalEpochDaysJ2000;
    if (!Number.isFinite(departure) || !Number.isFinite(arrival) || arrival <= departure) {
        return null;
    }

    const fraction = Math.min(
        1,
        Math.max(0, (currentEpochDaysJ2000 - departure) / (arrival - departure))
    );

    const exactIndex = fraction * (samples.length - 1);
    const lowIndex = Math.floor(exactIndex);
    const highIndex = Math.min(samples.length - 1, lowIndex + 1);
    const blend = exactIndex - lowIndex;

    const low = samples[lowIndex]?.position;
    const high = samples[highIndex]?.position;
    if (!isVector3(low)) return null;
    if (!isVector3(high)) return { ...low };

    return {
        x: low.x + (high.x - low.x) * blend,
        y: low.y + (high.y - low.y) * blend,
        z: low.z + (high.z - low.z) * blend,
    };
}