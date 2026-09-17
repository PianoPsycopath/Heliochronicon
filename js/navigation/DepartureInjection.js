// js/navigation/DepartureInjection.js

import { TransferAssembler } from '@navigation/TransferAssembler.js';
import { AU_PER_DAY_IN_KM_PER_S, SECONDS_PER_DAY } from '@navigation/FleetPropagator.js';
import { AU_IN_KM } from '@core/constants.js';

const NEAR_ZERO = 1e-12;
const KM_PER_S_IN_M_PER_S = 1000;
const RAD_TO_DEG = 180 / Math.PI;

function isVector3(v) {
    return !!v && Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}

function requireVector3(v, label) {
    if (!isVector3(v)) {
        throw new Error(`DepartureInjection requires "${label}" to be a finite { x, y, z } vector`);
    }
}

function requirePositiveNumber(value, label) {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`DepartureInjection requires a positive numeric "${label}"`);
    }
}

function dot(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a, b) {
    return {
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x,
    };
}

function magnitude(v) {
    return Math.sqrt(dot(v, v));
}

function scale(v, s) {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
}

function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function normalize(v, label) {
    const length = magnitude(v);
    if (length < NEAR_ZERO) {
        throw new Error(`DepartureInjection cannot normalize a zero-length "${label}"`);
    }
    return scale(v, 1 / length);
}

// Rodrigues rotation of `v` about unit axis `axis` by `angle` radians.
function rotateAboutAxis(v, axis, angle) {
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const term = dot(axis, v) * (1 - cosA);
    const perpendicular = cross(axis, v);
    return {
        x: v.x * cosA + perpendicular.x * sinA + axis.x * term,
        y: v.y * cosA + perpendicular.y * sinA + axis.y * term,
        z: v.z * cosA + perpendicular.z * sinA + axis.z * term,
    };
}


function angleAbout(from, to, axis) {
    const cosA = Math.min(1, Math.max(-1, dot(from, to)));
    const angle = Math.acos(cosA);
    return dot(cross(from, to), axis) >= 0 ? angle : 2 * Math.PI - angle;
}

/**
 * @param {object} params
 * @param {{x:number,y:number,z:number}} params.parkingPosition - km, geocentric
 * @param {{x:number,y:number,z:number}} params.parkingVelocity - km/s, geocentric
 * @param {{x:number,y:number,z:number}} params.vInfinity - km/s, geocentric
 * @param {number} params.muKm3PerS2 - Earth's gravitational parameter
 * @returns {{
 *   injectionPosition: {x:number,y:number,z:number},
 *   injectionVelocity: {x:number,y:number,z:number},
 *   deltaV: {x:number,y:number,z:number},
 *   deltaVMagnitudeKmS: number,
 *   periapsisSpeedKmS: number,
 *   parkingSpeedKmS: number,
 *   eccentricity: number,
 *   asymptoteTrueAnomalyRad: number,
 *   phaseAngleToInjectionRad: number,
 *   secondsToInjection: number,
 *   planeChangeAngleDeg: number,
 *   warnings: string[]
 * }}
 */
export function computeInjection({ parkingPosition, parkingVelocity, vInfinity, muKm3PerS2 }) {
    requireVector3(parkingPosition, 'parkingPosition');
    requireVector3(parkingVelocity, 'parkingVelocity');
    requireVector3(vInfinity, 'vInfinity');
    requirePositiveNumber(muKm3PerS2, 'muKm3PerS2');

    const parkingRadiusKm = magnitude(parkingPosition);
    requirePositiveNumber(parkingRadiusKm, 'parking orbit radius');

    const vInfSpeed = magnitude(vInfinity);
    if (vInfSpeed < NEAR_ZERO) {
        throw new Error(
            'DepartureInjection requires a non-zero v-infinity: a transfer that needs no excess ' +
                'velocity has no departure hyperbola to inject onto'
        );
    }

    const orbitNormal = normalize(cross(parkingPosition, parkingVelocity), 'parking orbit normal');

    const vInfUnit = normalize(vInfinity, 'vInfinity');
    const outOfPlaneComponent = dot(vInfUnit, orbitNormal);
    const planeChangeAngleDeg = Math.asin(Math.min(1, Math.abs(outOfPlaneComponent))) * RAD_TO_DEG;

    const inPlaneDirection = subtract(vInfUnit, scale(orbitNormal, outOfPlaneComponent));
    if (magnitude(inPlaneDirection) < NEAR_ZERO) {
        throw new Error(
            'DepartureInjection cannot place an injection point: the required v-infinity is ' +
                'perpendicular to the parking orbit plane'
        );
    }
    const asymptoteDirection = normalize(inPlaneDirection, 'in-plane v-infinity');

    const periapsisSpeedKmS = Math.sqrt(vInfSpeed * vInfSpeed + (2 * muKm3PerS2) / parkingRadiusKm);
    const eccentricity = 1 + (parkingRadiusKm * vInfSpeed * vInfSpeed) / muKm3PerS2;
    const asymptoteTrueAnomalyRad = Math.acos(-1 / eccentricity);

    const periapsisDirection = rotateAboutAxis(
        asymptoteDirection,
        orbitNormal,
        -asymptoteTrueAnomalyRad
    );

    const injectionPosition = scale(periapsisDirection, parkingRadiusKm);

    const alongTrack = normalize(cross(orbitNormal, periapsisDirection), 'along-track direction');

    const parkingSpeedKmS = Math.sqrt(muKm3PerS2 / parkingRadiusKm);
    const injectionVelocity = scale(alongTrack, periapsisSpeedKmS);
    const parkingVelocityAtInjection = scale(alongTrack, parkingSpeedKmS);
    const deltaV = subtract(injectionVelocity, parkingVelocityAtInjection);

    const currentDirection = normalize(parkingPosition, 'parkingPosition');
    const phaseAngleToInjectionRad = angleAbout(currentDirection, periapsisDirection, orbitNormal);
    const meanMotion = Math.sqrt(muKm3PerS2 / Math.pow(parkingRadiusKm, 3));
    const secondsToInjection = phaseAngleToInjectionRad / meanMotion;

    const warnings = [];
    if (planeChangeAngleDeg > 1) {
        warnings.push(
            `Departure asymptote lies ${planeChangeAngleDeg.toFixed(1)}° out of the parking ` +
                'orbit plane; plane-change cost is not modelled'
        );
    }

    return {
        injectionPosition,
        injectionVelocity,
        deltaV,
        deltaVMagnitudeKmS: periapsisSpeedKmS - parkingSpeedKmS,
        periapsisSpeedKmS,
        parkingSpeedKmS,
        eccentricity,
        asymptoteTrueAnomalyRad,
        phaseAngleToInjectionRad,
        secondsToInjection,
        planeChangeAngleDeg,
        warnings,
    };
}

/**
 * @param {object} params
 * @param {object} params.plan - candidate FlightPlan (AU/day vectors)
 * @param {object} params.fleet - fleet with ships + fuelRemaining
 * @param {{x:number,y:number,z:number}} params.parkingPosition - km, geocentric
 * @param {{x:number,y:number,z:number}} params.parkingVelocity - km/s, geocentric
 * @param {{position:{x:number,y:number,z:number}}} params.earthState - AU
 * @param {number} params.muEarthKm3PerS2
 * @param {number} [params.standardGravityMS2]
 * @returns {object} a new plan; the input is not mutated
 */
export function applyDepartureInjection({
    plan,
    fleet,
    parkingPosition,
    parkingVelocity,
    earthState,
    muEarthKm3PerS2,
    standardGravityMS2,
}) {
    if (!plan || !Array.isArray(plan.burns) || plan.burns.length === 0) return plan;
    if (!isVector3(parkingPosition) || !isVector3(parkingVelocity)) return plan;
    if (!earthState || !isVector3(earthState.position)) return plan;

    const departureBurn = plan.burns[0];
    if (!isVector3(departureBurn?.deltaV)) return plan;

    const vInfinity = {
        x: (departureBurn.deltaV.x + parkingVelocity.x / AU_PER_DAY_IN_KM_PER_S) *
            AU_PER_DAY_IN_KM_PER_S,
        y: (departureBurn.deltaV.y + parkingVelocity.y / AU_PER_DAY_IN_KM_PER_S) *
            AU_PER_DAY_IN_KM_PER_S,
        z: (departureBurn.deltaV.z + parkingVelocity.z / AU_PER_DAY_IN_KM_PER_S) *
            AU_PER_DAY_IN_KM_PER_S,
    };

    const injection = computeInjection({
        parkingPosition,
        parkingVelocity,
        vInfinity,
        muKm3PerS2: muEarthKm3PerS2,
    });

    const departureDv = injection.deltaVMagnitudeKmS;
    const arrivalDv = (plan.arrivalDv ?? 0) * AU_PER_DAY_IN_KM_PER_S;
    const totalDv = departureDv + arrivalDv;

    const propellantRequired = TransferAssembler.computePropellantRequired({
        fleet,
        totalDeltaV: totalDv,
        standardGravityMS2,
        velocityUnitToMetersPerSecond: KM_PER_S_IN_M_PER_S,
    });

    const fuelRemaining = fleet.fuelRemaining;
    const isFeasible = propellantRequired <= fuelRemaining;
    const fuelWarning = isFeasible
        ? null
        : `Insufficient fuel: transfer requires ${propellantRequired.toFixed(2)}, ` +
          `fleet has ${fuelRemaining.toFixed(2)} remaining`;

    const injectionPositionAu = {
        x: earthState.position.x + injection.injectionPosition.x / AU_IN_KM,
        y: earthState.position.y + injection.injectionPosition.y / AU_IN_KM,
        z: earthState.position.z + injection.injectionPosition.z / AU_IN_KM,
    };

    const injectionEpochDaysJ2000 = Number.isFinite(plan.departureEpochDaysJ2000)
        ? plan.departureEpochDaysJ2000 + injection.secondsToInjection / SECONDS_PER_DAY
        : null;

    const burns = [
        {
            ...departureBurn,
            epochDaysJ2000: injectionEpochDaysJ2000 ?? departureBurn.epochDaysJ2000,
            position: injectionPositionAu,
            deltaV: {
                x: injection.deltaV.x / AU_PER_DAY_IN_KM_PER_S,
                y: injection.deltaV.y / AU_PER_DAY_IN_KM_PER_S,
                z: injection.deltaV.z / AU_PER_DAY_IN_KM_PER_S,
            },
        },
        ...plan.burns.slice(1),
    ];

    const warnings = [
        ...(Array.isArray(plan.warnings) ? plan.warnings.filter((w) => w !== plan.fuelWarning) : []),
        ...injection.warnings,
    ];
    if (fuelWarning) warnings.push(fuelWarning);

    return {
        ...plan,
        burns,
        departureDv,
        arrivalDv,
        totalDv,
        totalDeltaV: totalDv,
        deltaVUnit: 'km/s',
        propellantRequired,
        fuelRemainingAfter: fuelRemaining - propellantRequired,
        isFeasible,
        fuelWarning,
        warnings,
        injection: {
            epochDaysJ2000: injectionEpochDaysJ2000,
            position: injectionPositionAu,
            geocentricPositionKm: injection.injectionPosition,
            phaseAngleDeg: injection.phaseAngleToInjectionRad * RAD_TO_DEG,
            secondsToInjection: injection.secondsToInjection,
            periapsisSpeedKmS: injection.periapsisSpeedKmS,
            parkingSpeedKmS: injection.parkingSpeedKmS,
            eccentricity: injection.eccentricity,
            planeChangeAngleDeg: injection.planeChangeAngleDeg,
        },
    };
}